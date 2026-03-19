import type { CSSProperties } from "react";
import { useRos } from "../providers/RosProvider";

type RosStatusProps = {
  containerStyle?: CSSProperties;
};

function getStatusMeta(status: string) {
  switch (status) {
    case "connected":
      return {
        label: "ROS Connected",
        subtitle: "Conection established with rosbridge",
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
        label: "Disconnected",
        subtitle: "Sin conexión con rosbridge",
        dot: "#64748b",
        dotGlow: "rgba(100,116,139,0.18)",
      };
  }
}

export default function RosStatus({ containerStyle }: RosStatusProps) {
  const { status } = useRos();
  const meta = getStatusMeta(status);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
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
  );
}