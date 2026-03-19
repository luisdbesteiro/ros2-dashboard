import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Ros } from "roslib";

type RosStatusType = "connecting" | "connected" | "closed" | "error";

type RosContextType = {
  ros: Ros | null;
  status: RosStatusType;
  error: string | null;
  bridgeUrl: string;
  setBridgeUrl: (url: string) => void;
  reconnect: () => void;
};

const DEFAULT_URL =
  import.meta.env.VITE_ROSBRIDGE_URL || "ws://localhost:9090";

const RosContext = createContext<RosContextType>({
  ros: null,
  status: "connecting",
  error: null,
  bridgeUrl: DEFAULT_URL,
  setBridgeUrl: () => {},
  reconnect: () => {},
});

export function RosProvider({ children }: { children: React.ReactNode }) {
  const [ros, setRos] = useState<Ros | null>(null);
  const [status, setStatus] = useState<RosStatusType>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [bridgeUrl, setBridgeUrlState] = useState<string>(() => {
    return localStorage.getItem("rosbridge_url") || DEFAULT_URL;
  });
  const [connectionVersion, setConnectionVersion] = useState(0);

  const setBridgeUrl = (url: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    localStorage.setItem("rosbridge_url", cleanUrl);
    setBridgeUrlState(cleanUrl);
  };

  const reconnect = () => {
    setConnectionVersion((v) => v + 1);
  };

  useEffect(() => {
    setStatus("connecting");
    setError(null);

    const rosInstance = new Ros({ url: bridgeUrl });
    setRos(rosInstance);

    rosInstance.on("connection", () => {
      setStatus("connected");
      setError(null);
      console.log("Conectado a rosbridge:", bridgeUrl);
    });

    rosInstance.on("error", (err: unknown) => {
      setStatus("error");
      setError(String(err));
      console.error("Error en rosbridge:", err);
    });

    rosInstance.on("close", () => {
      setStatus("closed");
      console.log("Conexion cerrada:", bridgeUrl);
    });

    return () => {
      try {
        rosInstance.close();
      } catch (err: unknown) {
        console.warn("No se pudo cerrar rosbridge:", err);
      }
    };
  }, [bridgeUrl, connectionVersion]);

  const value = useMemo(
    () => ({
      ros,
      status,
      error,
      bridgeUrl,
      setBridgeUrl,
      reconnect,
    }),
    [ros, status, error, bridgeUrl]
  );

  return <RosContext.Provider value={value}>{children}</RosContext.Provider>;
}

export function useRos() {
  return useContext(RosContext);
}