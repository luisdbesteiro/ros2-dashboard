import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type RefObject,
  type ElementRef,
} from "react";
import { Topic } from "roslib";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRos } from "../providers/RosProvider";

type HeaderMsg = {
  frame_id?: string;
};

type PointFieldMsg = {
  name: string;
  offset: number;
  datatype: number;
  count: number;
};

type PointCloud2Msg = {
  header: HeaderMsg;
  height: number;
  width: number;
  fields: PointFieldMsg[];
  is_bigendian: boolean;
  point_step: number;
  row_step: number;
  data: number[] | Uint8Array | string;
  is_dense: boolean;
};

type ViewerStatus = "connecting" | "connected" | "closed" | "error";

type CloudStats = {
  count: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type OrbitControlsImpl = ElementRef<typeof OrbitControls>;

export type ObstacleViewer3DProps = {
  rosbridgeUrl?: string; // compatibilidad, ya no se usa
  pointCloudTopic: string;
  localFrameLabel?: string;
  maxPoints?: number;
  pointSize?: number;
  throttleMs?: number;
  minRange?: number;
  maxRange?: number;
  zMin?: number;
  zMax?: number;
  minHeight?: number;
  background?: string;
  style?: CSSProperties;
  showDebugPanel?: boolean;
};

const FLOAT32 = 7;
const FLOAT64 = 8;

function normalizeFrameId(frame?: string): string {
  return (frame ?? "").replace(/^\//, "").trim();
}

function toUint8Array(data: PointCloud2Msg["data"]): Uint8Array {
  if (data instanceof Uint8Array) return data;

  if (typeof data === "string") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  return Uint8Array.from(data);
}

function getField(fields: PointFieldMsg[], fieldName: string): PointFieldMsg | undefined {
  return fields.find((f) => f.name === fieldName);
}

function readFieldValue(
  view: DataView,
  baseOffset: number,
  field: PointFieldMsg,
  littleEndian: boolean
): number {
  const offset = baseOffset + field.offset;

  switch (field.datatype) {
    case FLOAT32:
      return view.getFloat32(offset, littleEndian);
    case FLOAT64:
      return view.getFloat64(offset, littleEndian);
    default:
      throw new Error(
        `Campo ${field.name} con datatype ${field.datatype} no soportado en esta version`
      );
  }
}

function colorFromNormalizedHeight(t: number, out: THREE.Color) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const hue = (1 - clamped) * 0.66;
  out.setHSL(hue, 1.0, 0.56);
}

function decodePointCloud2IntoBuffers(
  msg: PointCloud2Msg,
  outPositions: Float32Array,
  outColors: Float32Array,
  maxPoints: number,
  minRange?: number,
  maxRange?: number,
  zMin?: number,
  zMax?: number
): CloudStats {
  const xField = getField(msg.fields, "x");
  const yField = getField(msg.fields, "y");
  const zField = getField(msg.fields, "z");

  if (!xField || !yField || !zField) {
    return {
      count: 0,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
    };
  }

  const bytes = toUint8Array(msg.data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const totalPoints = msg.width * msg.height;
  if (totalPoints <= 0 || msg.point_step <= 0) {
    return {
      count: 0,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
    };
  }

  const littleEndian = !msg.is_bigendian;
  const stride = Math.max(1, Math.ceil(totalPoints / Math.max(1, maxPoints)));

  const minRangeSq = minRange != null ? minRange * minRange : undefined;
  const maxRangeSq = maxRange != null ? maxRange * maxRange : undefined;

  let count = 0;
  let detectedMinX = Number.POSITIVE_INFINITY;
  let detectedMaxX = Number.NEGATIVE_INFINITY;
  let detectedMinY = Number.POSITIVE_INFINITY;
  let detectedMaxY = Number.NEGATIVE_INFINITY;
  let detectedMinZ = Number.POSITIVE_INFINITY;
  let detectedMaxZ = Number.NEGATIVE_INFINITY;

  for (let pointIndex = 0; pointIndex < totalPoints && count < maxPoints; pointIndex += stride) {
    const row = Math.floor(pointIndex / msg.width);
    const col = pointIndex % msg.width;
    const baseOffset = row * msg.row_step + col * msg.point_step;

    if (baseOffset + msg.point_step > view.byteLength) continue;

    let x: number;
    let y: number;
    let z: number;

    try {
      x = readFieldValue(view, baseOffset, xField, littleEndian);
      y = readFieldValue(view, baseOffset, yField, littleEndian);
      z = readFieldValue(view, baseOffset, zField, littleEndian);
    } catch {
      continue;
    }

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    const rangeSq = x * x + y * y + z * z;

    if (minRangeSq != null && rangeSq < minRangeSq) continue;
    if (maxRangeSq != null && rangeSq > maxRangeSq) continue;
    if (zMin != null && z < zMin) continue;
    if (zMax != null && z > zMax) continue;

    const o = count * 3;
    outPositions[o] = x;
    outPositions[o + 1] = y;
    outPositions[o + 2] = z;

    if (x < detectedMinX) detectedMinX = x;
    if (x > detectedMaxX) detectedMaxX = x;
    if (y < detectedMinY) detectedMinY = y;
    if (y > detectedMaxY) detectedMaxY = y;
    if (z < detectedMinZ) detectedMinZ = z;
    if (z > detectedMaxZ) detectedMaxZ = z;

    count += 1;
  }

  if (count === 0) {
    return {
      count: 0,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0,
    };
  }

  const color = new THREE.Color();
  const zSpan = Math.max(1e-6, detectedMaxZ - detectedMinZ);

  for (let i = 0; i < count; i += 1) {
    const o = i * 3;
    const z = outPositions[o + 2];
    const t = (z - detectedMinZ) / zSpan;

    colorFromNormalizedHeight(t, color);

    outColors[o] = color.r;
    outColors[o + 1] = color.g;
    outColors[o + 2] = color.b;
  }

  return {
    count,
    minX: detectedMinX,
    maxX: detectedMaxX,
    minY: detectedMinY,
    maxY: detectedMaxY,
    minZ: detectedMinZ,
    maxZ: detectedMaxZ,
  };
}

function fitCameraToCloud(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl | null,
  stats: CloudStats
) {
  if (stats.count < 20) return;

  const size = new THREE.Vector3(
    Math.max(0.1, stats.maxX - stats.minX),
    Math.max(0.1, stats.maxY - stats.minY),
    Math.max(0.1, stats.maxZ - stats.minZ)
  );

  const center = new THREE.Vector3(
    (stats.minX + stats.maxX) * 0.5,
    (stats.minY + stats.maxY) * 0.5,
    (stats.minZ + stats.maxZ) * 0.5
  );

  const radius = Math.max(size.length() * 0.5, 1.2);

  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const limitingFov = Math.min(vFov, hFov);

  const distance = (radius / Math.tan(limitingFov / 2)) * 0.95;

  const direction = new THREE.Vector3(1, -1, 0.58).normalize();
  const newPosition = center.clone().addScaledVector(direction, distance);

  camera.position.copy(newPosition);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

function getStatusMeta(status: ViewerStatus) {
  switch (status) {
    case "connected":
      return {
        label: "Live",
        color: "#15803d",
        dot: "#16a34a",
      };
    case "connecting":
      return {
        label: "Waiting",
        color: "#a16207",
        dot: "#ca8a04",
      };
    case "error":
      return {
        label: "Error",
        color: "#b91c1c",
        dot: "#dc2626",
      };
    default:
      return {
        label: "Closed",
        color: "#475569",
        dot: "#64748b",
      };
  }
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

function StatusBadge({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        color: ok ? "#15803d" : "#b91c1c",
        background: ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        border: ok
          ? "1px solid rgba(34,197,94,0.22)"
          : "1px solid rgba(239,68,68,0.22)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: ok ? "#16a34a" : "#dc2626",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function ZUpScene() {
  const { camera } = useThree();

  useEffect(() => {
    camera.up.set(0, 0, 1);
  }, [camera]);

  return null;
}

function CameraBridge({
  cameraRef,
}: {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
}) {
  const { camera } = useThree();

  useEffect(() => {
    cameraRef.current = camera as THREE.PerspectiveCamera;
    return () => {
      cameraRef.current = null;
    };
  }, [camera, cameraRef]);

  return null;
}

function SensorHelpers() {
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);

  if (!gridRef.current) {
    const grid = new THREE.GridHelper(10, 10, "#64748b", "#334155");
    grid.rotation.x = Math.PI / 2;
    grid.material.transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    gridRef.current = grid;
  }

  if (!axesRef.current) {
    axesRef.current = new THREE.AxesHelper(0.8);
  }

  return (
    <>
      <primitive object={gridRef.current} />
      <primitive object={axesRef.current} />

      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#e5eef8" />
      </mesh>

      <group position={[0, 0, 0]}>
        <mesh position={[0.22, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.04, 0.12, 18]} />
          <meshBasicMaterial color="#67c3ff" />
        </mesh>
        <mesh position={[0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.015, 0.015, 0.2, 14]} />
          <meshBasicMaterial color="#67c3ff" />
        </mesh>
      </group>

      <mesh position={[-0.18, 0, -0.08]}>
        <boxGeometry args={[0.45, 0.28, 0.12]} />
        <meshBasicMaterial color="#8ea3b8" wireframe />
      </mesh>
    </>
  );
}

function PointCloudObject({
  geometryRef,
  positions,
  colors,
  pointSize,
}: {
  geometryRef: RefObject<THREE.BufferGeometry | null>;
  positions: Float32Array;
  colors: Float32Array;
  pointSize: number;
}) {
  useLayoutEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;

    const positionAttr = new THREE.BufferAttribute(positions, 3);
    positionAttr.setUsage(THREE.DynamicDrawUsage);

    const colorAttr = new THREE.BufferAttribute(colors, 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute("position", positionAttr);
    geometry.setAttribute("color", colorAttr);
    geometry.setDrawRange(0, 0);

    return () => {
      geometry.deleteAttribute("position");
      geometry.deleteAttribute("color");
    };
  }, [geometryRef, positions, colors]);

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geometryRef} />
      <pointsMaterial
        vertexColors
        size={pointSize}
        sizeAttenuation
        transparent
        opacity={0.95}
        depthWrite={false}
      />
    </points>
  );
}

function InvalidateBridge({
  invalidateRef,
}: {
  invalidateRef: MutableRefObject<(() => void) | null>;
}) {
  const { invalidate } = useThree();

  useEffect(() => {
    invalidateRef.current = invalidate;
    return () => {
      invalidateRef.current = null;
    };
  }, [invalidate, invalidateRef]);

  return null;
}

export default function ObstacleViewer3D({
  pointCloudTopic,
  localFrameLabel = "velodyne",
  maxPoints = 12000,
  pointSize = 0.05,
  throttleMs = 120,
  minRange,
  maxRange = 20,
  zMin,
  zMax,
  minHeight = 420,
  background = "#0b1220",
  style,
  showDebugPanel = true,
}: ObstacleViewer3DProps) {
  const { ros, status: rosStatus } = useRos();

  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const userMovedCameraRef = useRef(false);
  const autoFitDoneRef = useRef(false);

  const positionsRef = useRef<Float32Array>(new Float32Array(maxPoints * 3));
  const colorsRef = useRef<Float32Array>(new Float32Array(maxPoints * 3));
  const lastUiUpdateRef = useRef(0);
  const lastMessageAtRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  const smoothedHzRef = useRef(0);

  const [bufferVersion, setBufferVersion] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [pointCountUi, setPointCountUi] = useState(0);
  const [cloudFrameUi, setCloudFrameUi] = useState("");
  const [messageCountUi, setMessageCountUi] = useState(0);
  const [zRangeUi, setZRangeUi] = useState<{ min: number; max: number } | null>(null);
  const [hzUi, setHzUi] = useState(0);
  const [nowTs, setNowTs] = useState(() => performance.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTs(performance.now());
    }, 500);

    return () => {
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    positionsRef.current = new Float32Array(maxPoints * 3);
    colorsRef.current = new Float32Array(maxPoints * 3);
    userMovedCameraRef.current = false;
    autoFitDoneRef.current = false;
    setBufferVersion((v) => v + 1);
  }, [maxPoints]);

  useEffect(() => {
    userMovedCameraRef.current = false;
    autoFitDoneRef.current = false;
    lastFrameTsRef.current = null;
    lastMessageAtRef.current = null;
    smoothedHzRef.current = 0;
    setHzUi(0);
    setPointCountUi(0);
    setCloudFrameUi("");
    setMessageCountUi(0);
    setZRangeUi(null);
  }, [pointCloudTopic, minRange, maxRange, zMin, zMax]);

  useEffect(() => {
    if (!ros || rosStatus !== "connected") return;

    const pointCloudSub = new Topic({
      ros,
      name: pointCloudTopic,
      messageType: "sensor_msgs/msg/PointCloud2",
      throttle_rate: throttleMs,
    });

    const handlePointCloud = (raw: unknown) => {
      const msg = raw as PointCloud2Msg;

      const now = performance.now();
      if (lastFrameTsRef.current !== null) {
        const dt = now - lastFrameTsRef.current;
        if (dt > 0) {
          const instantHz = 1000 / dt;
          smoothedHzRef.current =
            smoothedHzRef.current > 0
              ? smoothedHzRef.current * 0.75 + instantHz * 0.25
              : instantHz;
        }
      }
      lastFrameTsRef.current = now;
      lastMessageAtRef.current = now;

      const stats = decodePointCloud2IntoBuffers(
        msg,
        positionsRef.current,
        colorsRef.current,
        maxPoints,
        minRange,
        maxRange,
        zMin,
        zMax
      );

      const geometry = geometryRef.current;
      if (geometry) {
        let positionAttr = geometry.getAttribute("position") as
          | THREE.BufferAttribute
          | undefined;
        let colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;

        if (!positionAttr || positionAttr.array !== positionsRef.current) {
          positionAttr = new THREE.BufferAttribute(positionsRef.current, 3);
          positionAttr.setUsage(THREE.DynamicDrawUsage);
          geometry.setAttribute("position", positionAttr);
        }

        if (!colorAttr || colorAttr.array !== colorsRef.current) {
          colorAttr = new THREE.BufferAttribute(colorsRef.current, 3);
          colorAttr.setUsage(THREE.DynamicDrawUsage);
          geometry.setAttribute("color", colorAttr);
        }

        positionAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
        geometry.setDrawRange(0, stats.count);
      }

      if (!userMovedCameraRef.current && !autoFitDoneRef.current && stats.count > 50) {
        const cam = cameraRef.current;
        if (cam) {
          fitCameraToCloud(cam, controlsRef.current, stats);
          autoFitDoneRef.current = true;
          invalidateRef.current?.();
        }
      }

      invalidateRef.current?.();

      if (now - lastUiUpdateRef.current > 200) {
        lastUiUpdateRef.current = now;
        setPointCountUi(stats.count);
        setCloudFrameUi(normalizeFrameId(msg.header?.frame_id));
        setMessageCountUi((v) => v + 1);
        setZRangeUi(stats.count > 0 ? { min: stats.minZ, max: stats.maxZ } : null);
        setHzUi(smoothedHzRef.current);
      }
    };

    pointCloudSub.subscribe(handlePointCloud);

    return () => {
      pointCloudSub.unsubscribe(handlePointCloud);
    };
  }, [
    ros,
    rosStatus,
    pointCloudTopic,
    throttleMs,
    maxPoints,
    minRange,
    maxRange,
    zMin,
    zMax,
  ]);

  const topicAlive =
    rosStatus === "connected" &&
    lastMessageAtRef.current !== null &&
    nowTs - lastMessageAtRef.current < 1500;

  const viewerStatus: ViewerStatus =
    rosStatus === "connected"
      ? topicAlive
        ? "connected"
        : "connecting"
      : rosStatus === "connecting"
        ? "connecting"
        : rosStatus === "error"
          ? "error"
          : "closed";

  const statusMeta = getStatusMeta(viewerStatus);

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 10,
        width: "100%",
        padding: 10,
        borderRadius: 16,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(236,240,244,0.96) 100%)",
        border: "1px solid #cbd5e1",
        boxShadow:
          "0 14px 28px rgba(148,163,184,0.12), inset 0 1px 0 rgba(255,255,255,0.96)",
        ...style,
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
          <div
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
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "#334155",
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                lineHeight: 1.1,
              }}
            >
              Obstacle Viewer 3D
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: statusMeta.color,
                fontSize: 11,
                lineHeight: 1.1,
                marginTop: 2,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: statusMeta.dot,
                  flexShrink: 0,
                }}
              />
              {statusMeta.label}
            </div>
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
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <TopInfoPill label="FRAME" value={cloudFrameUi || "--"} />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <TopInfoPill label="POINTS" value={String(pointCountUi)} />
              <TopInfoPill
                label="Z"
                value={zRangeUi ? `${zRangeUi.min.toFixed(2)} .. ${zRangeUi.max.toFixed(2)}` : "--"}
              />
              <TopInfoPill
                label="HZ"
                value={topicAlive && hzUi > 0 ? hzUi.toFixed(1) : "--"}
              />
            </div>
          </div>

          <div
            style={{
              position: "relative",
              width: "100%",
              height: minHeight,
              overflow: "hidden",
              borderRadius: 12,
              border: "1px solid #cbd5e1",
              background: "#0b1220",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 20px rgba(148,163,184,0.12)",
            }}
          >
            <Canvas
              frameloop="demand"
              dpr={[1, 2]}
              style={{ width: "100%", height: "100%", display: "block" }}
              camera={{ position: [3.2, -3.2, 1.9], fov: 48, near: 0.01, far: 120 }}
            >
              <color attach="background" args={[background]} />
              <ZUpScene />
              <CameraBridge cameraRef={cameraRef} />
              <InvalidateBridge invalidateRef={invalidateRef} />
              <OrbitControls
                ref={controlsRef}
                makeDefault
                enableDamping
                dampingFactor={0.08}
                minDistance={0.5}
                maxDistance={35}
                target={[0, 0, 0]}
                onStart={() => {
                  userMovedCameraRef.current = true;
                }}
                onChange={() => {
                  invalidateRef.current?.();
                }}
              />
              <SensorHelpers />
              <PointCloudObject
                key={bufferVersion}
                geometryRef={geometryRef}
                positions={positionsRef.current}
                colors={colorsRef.current}
                pointSize={pointSize}
              />
            </Canvas>

            {showDebugPanel && (
              <div
                style={{
                  position: "absolute",
                  right: 12,
                  bottom: 12,
                  minWidth: 148,
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.84)",
                  border: "1px solid rgba(203,213,225,0.95)",
                  boxShadow:
                    "0 6px 14px rgba(148,163,184,0.12), inset 0 1px 0 rgba(255,255,255,0.98)",
                  backdropFilter: "blur(4px)",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "52px auto",
                    gap: 6,
                    fontSize: 10,
                    lineHeight: 1.15,
                  }}
                >
                  <span style={{ color: "#64748b", fontWeight: 700 }}>ROS</span>
                  <span style={{ color: "#334155", fontWeight: 700 }}>{rosStatus}</span>

                  <span style={{ color: "#64748b", fontWeight: 700 }}>TOPIC</span>
                  <span style={{ color: "#334155", fontWeight: 700 }}>
                    {topicAlive ? "available" : "idle"}
                  </span>

                  <span style={{ color: "#64748b", fontWeight: 700 }}>LOCAL</span>
                  <span style={{ color: "#334155", fontWeight: 700 }}>{localFrameLabel}</span>

                  <span style={{ color: "#64748b", fontWeight: 700 }}>MSGS</span>
                  <span style={{ color: "#334155", fontWeight: 700 }}>{messageCountUi}</span>
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
              maxWidth: "100%",
            }}
          >
            <StatusBadge label={pointCloudTopic} ok={topicAlive} />
          </div>
        </>
      )}
    </div>
  );
}