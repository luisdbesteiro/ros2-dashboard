import React, { useEffect, useMemo, useRef, useState } from "react";

type LaunchState = "idle" | "starting" | "running" | "stopping" | "error";

type Props = {
  /** Ej: "http://localhost:5174" o "" si usas proxy en Vite */
  apiBase?: string;
  /** Texto del botón cuando está parado */
  startLabel?: string;
  /** Texto del botón cuando está corriendo */
  stopLabel?: string;
  /** Si quieres ocultar el estado debajo del botón */
  showStatus?: boolean;
  /** Intervalo de polling para refrescar estado */
  pollMs?: number;
};

export default function HotspotBringupButton({
  apiBase = import.meta.env.VITE_ROS2_API_BASE ?? "",
  startLabel = "Iniciar Hotspot Detection",
  stopLabel = "Detener Hotspot Detection",
  showStatus = true,
  pollMs = 1500,
}: Props) {
  const [state, setState] = useState<LaunchState>("idle");
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const endpoints = useMemo(() => {
    const base = apiBase.replace(/\/$/, "");
    return {
      start: `${base}/api/ros2/hotspot/bringup/start`,
      stop: `${base}/api/ros2/hotspot/bringup/stop`,
      status: `${base}/api/ros2/hotspot/bringup/status`,
    };
  }, [apiBase]);

  async function fetchJSON(url: string, init?: RequestInit) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: ac.signal,
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // si el backend no devuelve JSON, dejamos data = null
    }

    if (!res.ok) {
      const msg =
        (data && (data.error || data.message)) ||
        text ||
        `HTTP ${res.status} ${res.statusText}`;
      throw new Error(msg);
    }

    return data;
  }

  async function refreshStatus() {
    try {
      const data = await fetchJSON(endpoints.status, { method: "GET" });
      const isRunning = Boolean(data?.running);
      setRunning(isRunning);
      setState((prev) => {
        if (prev === "starting" && isRunning) return "running";
        if (prev === "stopping" && !isRunning) return "idle";
        if (prev === "idle" && isRunning) return "running";
        if (prev === "running" && !isRunning) return "idle";
        return prev;
      });
      setErrorMsg(null);
    } catch (e: any) {
      setState("error");
      setErrorMsg(e?.message ?? "Error consultando estado");
    }
  }

  useEffect(() => {
    refreshStatus();
    const id = window.setInterval(refreshStatus, pollMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints.status, pollMs]);

  const busy = state === "starting" || state === "stopping";
  const buttonLabel = running ? stopLabel : startLabel;

  async function handleClick() {
    setErrorMsg(null);

    try {
      if (!running) {
        setState("starting");
        await fetchJSON(endpoints.start, { method: "POST", body: "{}" });
      } else {
        setState("stopping");
        await fetchJSON(endpoints.stop, { method: "POST", body: "{}" });
      }
      await refreshStatus();
    } catch (e: any) {
      setState("error");
      setErrorMsg(e?.message ?? "Error ejecutando acción");
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.15)",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
        aria-busy={busy}
      >
        {busy ? (running ? "Deteniendo..." : "Iniciando...") : buttonLabel}
      </button>

      {showStatus && (
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          <div>
            Estado:{" "}
            <strong>
              {running ? "RUNNING" : "STOPPED"}
              {state === "error" ? " (ERROR)" : ""}
            </strong>
          </div>
          {errorMsg && (
            <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
              {errorMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}