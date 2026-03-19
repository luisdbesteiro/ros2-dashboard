import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Topic } from "roslib";
import { useRos } from "../providers/RosProvider";

type ImageMsg = {
  header?: {
    frame_id?: string;
  };
  height: number;
  width: number;
  encoding: string;
  is_bigendian?: number;
  step: number;
  data: number[] | string;
};

type CameraViewerProps = {
  containerStyle?: CSSProperties;
  headerStyle?: CSSProperties;
  canvasStyle?: CSSProperties;
  footerStyle?: CSSProperties;
  errorTextStyle?: CSSProperties;
};

function toUint8Array(data: number[] | string): Uint8Array {
  if (Array.isArray(data)) {
    return new Uint8Array(data);
  }

  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function getBadgeStyle(ok: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    background: ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.10)",
    color: ok ? "#15803d" : "#b91c1c",
    border: ok
      ? "1px solid rgba(34,197,94,0.22)"
      : "1px solid rgba(239,68,68,0.20)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
  };
}

function StatusBadge({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <span style={getBadgeStyle(ok)}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "currentColor",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function PanelIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        background: "linear-gradient(180deg, #ffffff 0%, #e5e7eb 100%)",
        border: "1px solid #cbd5e1",
        color: "#64748b",
        fontSize: 12,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.95), 0 4px 10px rgba(148,163,184,0.12)",
      }}
    >
      ⌖
    </span>
  );
}

function TopInfoPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 999,
        background: "linear-gradient(180deg, #ffffff 0%, #edf1f5 100%)",
        border: "1px solid #cbd5e1",
        color: "#334155",
        fontSize: 11,
        lineHeight: 1,
        whiteSpace: "nowrap",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.98), 0 4px 10px rgba(148,163,184,0.10)",
      }}
    >
      <span style={{ color: "#64748b", fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </span>
  );
}

function CompactOverlayRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "38px minmax(0, 1fr)",
        gap: 6,
        alignItems: "center",
        fontSize: 10,
        lineHeight: 1.1,
      }}
    >
      <span
        style={{
          color: "#64748b",
          fontWeight: 700,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: "#334155",
          fontWeight: 700,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

export default function CameraViewer({
  containerStyle,
  headerStyle,
  canvasStyle,
  footerStyle,
  errorTextStyle,
}: CameraViewerProps) {
  const { ros, status } = useRos();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [collapsed, setCollapsed] = useState(false);
  const [imageMsg, setImageMsg] = useState<ImageMsg | null>(null);
  const [fps, setFps] = useState(0);
  const [nowTs, setNowTs] = useState(() => performance.now());

  const lastFrameTimeRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTs(performance.now());
    }, 400);

    return () => {
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!ros || status !== "connected") return;

    const imageTopic = new Topic({
      ros,
      name: "/camera/image_raw",
      messageType: "sensor_msgs/msg/Image",
    });

    const handleImage = (msg: unknown) => {
      const image = msg as ImageMsg;
      setImageMsg(image);

      const now = performance.now();

      if (lastFrameTimeRef.current !== null) {
        const dt = now - lastFrameTimeRef.current;
        if (dt > 0) {
          const instantFps = 1000 / dt;
          setFps((prev) => (prev > 0 ? prev * 0.75 + instantFps * 0.25 : instantFps));
        }
      }

      lastFrameTimeRef.current = now;
      lastFrameAtRef.current = now;
    };

    imageTopic.subscribe(handleImage);

    return () => {
      imageTopic.unsubscribe(handleImage);
    };
  }, [ros, status]);

  const streamAlive =
    status === "connected" &&
    lastFrameAtRef.current !== null &&
    nowTs - lastFrameAtRef.current < 1500;

  useEffect(() => {
    if (!imageMsg || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, encoding, step, data } = imageMsg;
    const bytes = toUint8Array(data);

    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    const out = imageData.data;

    if (encoding === "rgb8") {
      for (let y = 0; y < height; y++) {
        const rowOffset = y * step;
        for (let x = 0; x < width; x++) {
          const src = rowOffset + x * 3;
          const dst = (y * width + x) * 4;
          out[dst] = bytes[src];
          out[dst + 1] = bytes[src + 1];
          out[dst + 2] = bytes[src + 2];
          out[dst + 3] = 255;
        }
      }
    } else if (encoding === "bgr8") {
      for (let y = 0; y < height; y++) {
        const rowOffset = y * step;
        for (let x = 0; x < width; x++) {
          const src = rowOffset + x * 3;
          const dst = (y * width + x) * 4;
          out[dst] = bytes[src + 2];
          out[dst + 1] = bytes[src + 1];
          out[dst + 2] = bytes[src];
          out[dst + 3] = 255;
        }
      }
    } else if (encoding === "rgba8") {
      for (let y = 0; y < height; y++) {
        const rowOffset = y * step;
        for (let x = 0; x < width; x++) {
          const src = rowOffset + x * 4;
          const dst = (y * width + x) * 4;
          out[dst] = bytes[src];
          out[dst + 1] = bytes[src + 1];
          out[dst + 2] = bytes[src + 2];
          out[dst + 3] = bytes[src + 3];
        }
      }
    } else if (encoding === "bgra8") {
      for (let y = 0; y < height; y++) {
        const rowOffset = y * step;
        for (let x = 0; x < width; x++) {
          const src = rowOffset + x * 4;
          const dst = (y * width + x) * 4;
          out[dst] = bytes[src + 2];
          out[dst + 1] = bytes[src + 1];
          out[dst + 2] = bytes[src];
          out[dst + 3] = bytes[src + 3];
        }
      }
    } else if (encoding === "mono8") {
      for (let y = 0; y < height; y++) {
        const rowOffset = y * step;
        for (let x = 0; x < width; x++) {
          const src = rowOffset + x;
          const dst = (y * width + x) * 4;
          const value = bytes[src];
          out[dst] = value;
          out[dst + 1] = value;
          out[dst + 2] = value;
          out[dst + 3] = 255;
        }
      }
    } else {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#334155";
      ctx.font = "14px sans-serif";
      ctx.fillText(`Encoding no soportado: ${encoding}`, 12, 28);
      return;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [imageMsg]);

  const panelHealthy = status === "connected" && streamAlive;

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 10,
        padding: 10,
        borderRadius: 16,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(236,240,244,0.96) 100%)",
        border: "1px solid #cbd5e1",
        boxShadow:
          "0 14px 28px rgba(148,163,184,0.12), inset 0 1px 0 rgba(255,255,255,0.96)",
        minWidth: 320,
        ...containerStyle,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "8px 10px",
          borderRadius: 12,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(232,236,241,0.96) 100%)",
          border: "1px solid #cbd5e1",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.98)",
          ...headerStyle,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <PanelIcon />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
            }}
          >
            <span
              style={{
                color: "#334155",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                lineHeight: 1.1,
              }}
            >
              Camera Stream
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: panelHealthy ? "#15803d" : "#b91c1c",
                fontSize: 11,
                lineHeight: 1.1,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "currentColor",
                  flexShrink: 0,
                }}
              />
              {panelHealthy ? "Receiving frames" : "Waiting for frames"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "Expandir panel" : "Colapsar panel"}
          title={collapsed ? "Expandir panel" : "Colapsar panel"}
          style={{
            width: 30,
            height: 30,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "linear-gradient(180deg, #ffffff 0%, #edf1f5 100%)",
            color: "#475569",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 700,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.98)",
          }}
        >
          {collapsed ? "+" : "−"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div
            style={{
              display: "inline-flex",
              flexDirection: "column",
              alignSelf: "flex-start",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <TopInfoPill label="CAM" value={streamAlive ? "LIVE" : "WAIT"} />

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <TopInfoPill
                  label="SIZE"
                  value={imageMsg ? `${imageMsg.width}×${imageMsg.height}` : "--"}
                />
                <TopInfoPill
                  label="ENC"
                  value={imageMsg ? imageMsg.encoding : "--"}
                />
                <TopInfoPill
                  label="FPS"
                  value={streamAlive ? fps.toFixed(1) : "--"}
                />
              </div>
            </div>

            <div
              style={{
                position: "relative",
                display: "inline-block",
                alignSelf: "flex-start",
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  display: "block",
                  maxWidth: "100%",
                  borderRadius: 10,
                  border: "1px solid #cbd5e1",
                  background: "#f8fafc",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.98), 0 8px 20px rgba(148,163,184,0.12)",
                  ...canvasStyle,
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
              maxWidth: "100%",
              ...footerStyle,
            }}
          >
            <StatusBadge label="/camera/image_raw" ok={streamAlive} />
          </div>
        </>
      )}
    </div>
  );
}