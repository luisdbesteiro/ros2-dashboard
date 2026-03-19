import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Topic } from "roslib";
import { useRos } from "../providers/RosProvider";

type Quaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

type Header = {
  frame_id?: string;
};

type OccupancyGridMsg = {
  header?: Header;
  info: {
    resolution: number;
    width: number;
    height: number;
    origin: {
      position: {
        x: number;
        y: number;
        z: number;
      };
      orientation: Quaternion;
    };
  };
  data: number[];
};

type OdometryMsg = {
  header?: Header;
  child_frame_id?: string;
  pose: {
    pose: {
      position: {
        x: number;
        y: number;
        z: number;
      };
      orientation: Quaternion;
    };
  };
};

type TransformStampedMsg = {
  header?: Header;
  child_frame_id?: string;
  transform: {
    translation: {
      x: number;
      y: number;
      z: number;
    };
    rotation: Quaternion;
  };
};

type TFMessage = {
  transforms: TransformStampedMsg[];
};

type Pose2D = {
  x: number;
  y: number;
  yaw: number;
};

type MapOdomViewerProps = {
  containerStyle?: CSSProperties;
  headerStyle?: CSSProperties;
  canvasStyle?: CSSProperties;
  footerStyle?: CSSProperties;
  errorTextStyle?: CSSProperties;
};

function normalizeFrameName(name?: string): string {
  return (name ?? "").replace(/^\//, "");
}

function quaternionToYaw(q: Quaternion): number {
  const sinyCosp = 2 * (q.w * q.z + q.x * q.y);
  const cosyCosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(sinyCosp, cosyCosp);
}

function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function composeMapPoseFromOdom(
  mapToOdom: TransformStampedMsg,
  odomPose: OdometryMsg["pose"]["pose"]
): Pose2D {
  const tfYaw = quaternionToYaw(mapToOdom.transform.rotation);
  const odomYaw = quaternionToYaw(odomPose.orientation);

  const cosA = Math.cos(tfYaw);
  const sinA = Math.sin(tfYaw);

  const x =
    mapToOdom.transform.translation.x +
    cosA * odomPose.position.x -
    sinA * odomPose.position.y;

  const y =
    mapToOdom.transform.translation.y +
    sinA * odomPose.position.x +
    cosA * odomPose.position.y;

  return {
    x,
    y,
    yaw: normalizeAngle(tfYaw + odomYaw),
  };
}

function mapPointToGrid(
  mapX: number,
  mapY: number,
  origin: OccupancyGridMsg["info"]["origin"],
  resolution: number
) {
  const originYaw = quaternionToYaw(origin.orientation);

  const dx = mapX - origin.position.x;
  const dy = mapY - origin.position.y;

  const cosA = Math.cos(-originYaw);
  const sinA = Math.sin(-originYaw);

  const localX = cosA * dx - sinA * dy;
  const localY = sinA * dx + cosA * dy;

  return {
    cellX: localX / resolution,
    cellY: localY / resolution,
  };
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
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
        gridTemplateColumns: "30px auto",
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
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function MapOdomViewer({
  containerStyle,
  headerStyle,
  canvasStyle,
  footerStyle,
  errorTextStyle,
}: MapOdomViewerProps) {
  const { ros, status } = useRos();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const [mapMsg, setMapMsg] = useState<OccupancyGridMsg | null>(null);
  const [odomMsg, setOdomMsg] = useState<OdometryMsg | null>(null);
  const [tfStore, setTfStore] = useState<Record<string, TransformStampedMsg>>(
    {}
  );

  useEffect(() => {
    if (!ros || status !== "connected") return;

    const mapTopic = new Topic({
      ros,
      name: "/map",
      messageType: "nav_msgs/msg/OccupancyGrid",
    });

    const odomTopic = new Topic({
      ros,
      name: "/odom",
      messageType: "nav_msgs/msg/Odometry",
    });

    const tfTopic = new Topic({
      ros,
      name: "/tf",
      messageType: "tf2_msgs/msg/TFMessage",
    });

    const tfStaticTopic = new Topic({
      ros,
      name: "/tf_static",
      messageType: "tf2_msgs/msg/TFMessage",
    });

    const handleMap = (msg: unknown) => {
      setMapMsg(msg as OccupancyGridMsg);
    };

    const handleOdom = (msg: unknown) => {
      setOdomMsg(msg as OdometryMsg);
    };

    const handleTf = (msg: unknown) => {
      const tfMsg = msg as TFMessage;

      setTfStore((prev) => {
        const next = { ...prev };

        for (const tf of tfMsg.transforms ?? []) {
          const parent = normalizeFrameName(tf.header?.frame_id);
          const child = normalizeFrameName(tf.child_frame_id);
          if (!parent || !child) continue;
          next[`${parent}->${child}`] = tf;
        }

        return next;
      });
    };

    mapTopic.subscribe(handleMap);
    odomTopic.subscribe(handleOdom);
    tfTopic.subscribe(handleTf);
    tfStaticTopic.subscribe(handleTf);

    return () => {
      mapTopic.unsubscribe(handleMap);
      odomTopic.unsubscribe(handleOdom);
      tfTopic.unsubscribe(handleTf);
      tfStaticTopic.unsubscribe(handleTf);
    };
  }, [ros, status]);

  const mapFrame = normalizeFrameName(mapMsg?.header?.frame_id || "map");
  const odomFrame = normalizeFrameName(odomMsg?.header?.frame_id || "odom");
  const mapToOdom = tfStore[`${mapFrame}->${odomFrame}`];
  const mapToOdomAvailable = !!mapToOdom;

  let robotPoseInMap: Pose2D | null = null;

  if (mapMsg && odomMsg && mapToOdom) {
    robotPoseInMap = composeMapPoseFromOdom(mapToOdom, odomMsg.pose.pose);
  }

  useEffect(() => {
    if (!mapMsg || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, resolution, origin } = mapMsg.info;

    const maxCanvasSize = 700;
    const scale = Math.min(
      maxCanvasSize / Math.max(width, 1),
      maxCanvasSize / Math.max(height, 1),
      2
    );

    const viewWidth = Math.max(1, Math.round(width * scale));
    const viewHeight = Math.max(1, Math.round(height * scale));

    canvas.width = viewWidth;
    canvas.height = viewHeight;

    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;

    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const imageData = offCtx.createImageData(width, height);
    const pixels = imageData.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gridIndex = y * width + x;
        const value = mapMsg.data[gridIndex];

        let gray = 255;
        if (value === -1) {
          gray = 205;
        } else {
          gray =
            255 -
            Math.round((Math.max(0, Math.min(100, value)) / 100) * 255);
        }

        const drawY = height - 1 - y;
        const pixelIndex = (drawY * width + x) * 4;

        pixels[pixelIndex + 0] = gray;
        pixels[pixelIndex + 1] = gray;
        pixels[pixelIndex + 2] = gray;
        pixels[pixelIndex + 3] = 255;
      }
    }

    offCtx.putImageData(imageData, 0, 0);

    ctx.clearRect(0, 0, viewWidth, viewHeight);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, viewWidth, viewHeight);

    if (!odomMsg || !mapToOdom) return;

    const robotPose = composeMapPoseFromOdom(mapToOdom, odomMsg.pose.pose);

    const { cellX, cellY } = mapPointToGrid(
      robotPose.x,
      robotPose.y,
      origin,
      resolution
    );

    const insideMap =
      cellX >= 0 && cellX < width && cellY >= 0 && cellY < height;

    if (!insideMap) return;

    const px = cellX * scale;
    const py = (height - cellY) * scale;

    const radius = Math.max(4, 4 * scale);
    const arrowLength = Math.max(12, 14 * scale);

    const arrowX = px + Math.cos(robotPose.yaw) * arrowLength;
    const arrowY = py - Math.sin(robotPose.yaw) * arrowLength;

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, 2 * Math.PI);
    ctx.fillStyle = "#b32828";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(arrowX, arrowY);
    ctx.strokeStyle = "#b32828";
    ctx.lineWidth = Math.max(2, scale);
    ctx.stroke();
  }, [mapMsg, odomMsg, mapToOdom]);

  const allHealthy = !!mapMsg && !!odomMsg && mapToOdomAvailable;

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
              Map Panel
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: allHealthy ? "#15803d" : "#b91c1c",
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
              {allHealthy ? "System ready" : "Waiting for data"}
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
              <TopInfoPill label="MAP" value={mapMsg ? "LIVE" : "WAIT"} />

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
                  value={
                    mapMsg
                      ? `${mapMsg.info.width}×${mapMsg.info.height}`
                      : "--"
                  }
                />
                <TopInfoPill
                  label="RES"
                  value={
                    mapMsg
                      ? `${mapMsg.info.resolution.toFixed(3)} m/celda`
                      : "--"
                  }
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

              <div
                style={{
                  position: "absolute",
                  right: 12,
                  bottom: 12,
                  minWidth: 98,
                  padding: "6px 7px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.82)",
                  border: "1px solid rgba(203,213,225,0.95)",
                  boxShadow:
                    "0 6px 14px rgba(148,163,184,0.12), inset 0 1px 0 rgba(255,255,255,0.98)",
                  backdropFilter: "blur(4px)",
                  pointerEvents: "none",
                }}
              >
                {robotPoseInMap ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <CompactOverlayRow
                      label="X"
                      value={robotPoseInMap.x.toFixed(2)}
                    />
                    <CompactOverlayRow
                      label="Y"
                      value={robotPoseInMap.y.toFixed(2)}
                    />
                    <CompactOverlayRow
                      label="YAW"
                      value={`${radToDeg(robotPoseInMap.yaw).toFixed(1)}°`}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      color: "#64748b",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.2,
                      textAlign: "center",
                    }}
                  >
                    NO POSE
                  </div>
                )}
              </div>
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
            <StatusBadge label="/map" ok={!!mapMsg} />
            <StatusBadge label="/odom" ok={!!odomMsg} />
            <StatusBadge label="TF map→odom" ok={mapToOdomAvailable} />
          </div>
        </>
      )}
    </div>
  );
}