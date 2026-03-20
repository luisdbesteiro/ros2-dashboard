import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRos } from "../providers/RosProvider";

type RosStatusProps = {
  containerStyle?: CSSProperties;
};

function getStatusMeta(status: string) {
  switch (status) {
    case "connected":
      return {
        label: "ROS Connected",
        subtitle: "Connection established with rosbridge",
        dot: "#16a34a",
        dotGlow: "rgba(22,163,74,0.22)",
      };
    case "connecting":
      return {
        label: "Connecting",
        subtitle: "Trying to communicate with rosbridge",
        dot: "#ca8a04",
        dotGlow: "rgba(202,138,4,0.20)",
      };
    case "error":
      return {
        label: "Error",
        subtitle: "Couldn't complete the connection to rosbridge",
        dot: "#dc2626",
        dotGlow: "rgba(220,38,38,0.18)",
      };
    default:
      return {
        label: "ROS Disconnected",
        subtitle: "No connection with rosbridge",
        dot: "#dc2626",
        dotGlow: "rgba(220,38,38,0.18)",
      };
  }
}

type RosHookExtended = ReturnType<typeof useRos> & {
  port?: string | number;
  setPort?: (port: string | number) => void;
  reconnect?: (port?: string | number) => void;
};

export default function RosStatus({ containerStyle }: RosStatusProps) {
  const ros = useRos() as RosHookExtended;
  const { status } = ros;
  const meta = getStatusMeta(status);

  const [menuOpen, setMenuOpen] = useState(false);
  const [portInput, setPortInput] = useState(String(ros.port ?? "9090"));

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPortInput(String(ros.port ?? "9090"));
  }, [ros.port]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  const showReconnectMenu = status !== "connected";

  function handleRetry() {
    const trimmedPort = portInput.trim();

    if (!trimmedPort) return;

    ros.setPort?.(trimmedPort);
    ros.reconnect?.(trimmedPort);

    setMenuOpen(false);
  }

    return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: 14,
        borderRadius: 16,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(236,240,244,0.96) 100%)",
        border: "1px solid #d4dbe4",
        boxShadow:
          "0 12px 24px rgba(148,163,184,0.10), inset 0 1px 0 rgba(255,255,255,0.96)",
        ...containerStyle,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: meta.dot,
            boxShadow: `0 0 0 4px ${meta.dotGlow}`,
            flexShrink: 0,
          }}
        />

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "#334155",
              lineHeight: 1.1,
            }}
          >
            {meta.label}
          </div>

          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              marginTop: 3,
              lineHeight: 1.15,
            }}
          >
            {meta.subtitle}
          </div>
        </div>
      </div>

      {showReconnectMenu && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="ROS connection settings"
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              border: "1px solid rgb(92, 184 255)",
              background:
                "linear-gradient(180deg, rgb(0, 145, 255) 0%, rgb(30, 110, 240) 100%)",
              color: "rgb(242, 242, 247)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              transition: "transform 120ms ease, box-shadow 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 12px 22px rgba(59,130,246,0.22), inset 0 1px 0 rgb(92, 184, 255)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 8px 18px rgba(59,130,246,0.16), inset 0 1px 0 rgb(92, 184, 255)";
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                display: "block",
                flexShrink: 0,
              }}
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="9" cy="6" r="2.2" fill="currentColor" stroke="none" />
              <circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none" />
              <circle cx="11" cy="18" r="2.2" fill="currentColor" stroke="none" />
            </svg>
          </button>

          {menuOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: 0,
                width: 240,
                padding: 12,
                borderRadius: 16,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(236,240,244,0.98) 100%)",
                border: "1px solid #d4dbe4",
                boxShadow:
                  "0 16px 32px rgba(148,163,184,0.16), inset 0 1px 0 rgba(255,255,255,0.95)",
                zIndex: 20,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#475569",
                  marginBottom: 8,
                  letterSpacing: 0.2,
                }}
              >
                Rosbridge port
              </div>

              <input
                type="text"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value)}
                placeholder="9090"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 11px",
                  borderRadius: 12,
                  border: "1px solid #d4dbe4",
                  outline: "none",
                  fontSize: 13,
                  color: "#334155",
                  background:
                    "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)",
                  boxShadow: "inset 0 1px 2px rgba(148,163,184,0.10)",
                  marginBottom: 10,
                }}
              />

              <button
                type="button"
                onClick={handleRetry}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgb(92, 184 255)",
                  background:
                    "linear-gradient(180deg, rgb(0, 145, 255) 0%, rgb(30, 110, 240) 100%)",
                  color: "rgb(242, 242, 247)",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  transition: "transform 120ms ease, box-shadow 120ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 12px 20px rgba(59,130,246,0.22), inset 0 1px 0 rgb(92, 184, 255)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 8px 16px rgba(59,130,246,0.16), inset 0 1px 0 rgba(92, 184 255,0.95)";
                }}
              >
                Retry connection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}