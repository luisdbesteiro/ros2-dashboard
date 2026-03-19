import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Topic } from "roslib";
import { useRos } from "../providers/RosProvider";

type CmdVelJoystickProps = {
  containerStyle?: CSSProperties;
};

type TwistState = {
  linearX: number;
  angularZ: number;
};

const MAX_LINEAR = 0.6;
const MAX_ANGULAR = 1.4;
const KNOB_RADIUS = 30;
const PAD_RADIUS = 92;
const DEADZONE = 0.08;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function publishCmdVel(topic: Topic, linearX: number, angularZ: number) {
  topic.publish({
    linear: { x: linearX, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: angularZ },
  } as never);
}

function InfoChip({
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
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        background: "rgba(255,255,255,0.76)",
        color: "#334155",
        border: "1px solid #d4dbe4",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
      }}
    >
      <span style={{ color: "#64748b", fontWeight: 800 }}>{label}</span>
      <span>{value}</span>
    </span>
  );
}

export default function CmdVelJoystick({
  containerStyle,
}: CmdVelJoystickProps) {
  const { ros, status } = useRos();

  const padRef = useRef<HTMLDivElement | null>(null);
  const cmdVelTopicRef = useRef<Topic | null>(null);
  const publishTimerRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const [dragging, setDragging] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [twist, setTwist] = useState<TwistState>({ linearX: 0, angularZ: 0 });

  useEffect(() => {
    if (!ros || status !== "connected") {
      cmdVelTopicRef.current = null;
      return;
    }

    cmdVelTopicRef.current = new Topic({
      ros,
      name: "/cmd_vel",
      messageType: "geometry_msgs/msg/Twist",
    });

    return () => {
      cmdVelTopicRef.current = null;
    };
  }, [ros, status]);

  useEffect(() => {
    const publish = () => {
      if (!cmdVelTopicRef.current || status !== "connected") return;
      publishCmdVel(cmdVelTopicRef.current, twist.linearX, twist.angularZ);
    };

    publish();

    if (publishTimerRef.current !== null) {
      window.clearInterval(publishTimerRef.current);
    }

    publishTimerRef.current = window.setInterval(publish, 100);

    return () => {
      if (publishTimerRef.current !== null) {
        window.clearInterval(publishTimerRef.current);
        publishTimerRef.current = null;
      }
    };
  }, [twist, status]);

  useEffect(() => {
    return () => {
      if (cmdVelTopicRef.current) {
        publishCmdVel(cmdVelTopicRef.current, 0, 0);
      }
    };
  }, []);

  const updateFromClientPoint = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;

    const rect = pad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;

    const distance = Math.hypot(dx, dy);
    const maxDistance = PAD_RADIUS - KNOB_RADIUS;

    if (distance > maxDistance) {
      const scale = maxDistance / distance;
      dx *= scale;
      dy *= scale;
    }

    const normX = clamp(dx / maxDistance, -1, 1);
    const normY = clamp(dy / maxDistance, -1, 1);

    const filteredX = Math.abs(normX) < DEADZONE ? 0 : normX;
    const filteredY = Math.abs(normY) < DEADZONE ? 0 : normY;

    setStick({ x: dx, y: dy });
    setTwist({
      linearX: round2(-filteredY * MAX_LINEAR),
      angularZ: round2(-filteredX * MAX_ANGULAR),
    });
  };

  const resetJoystick = () => {
    setDragging(false);
    activePointerIdRef.current = null;
    setStick({ x: 0, y: 0 });
    setTwist({ linearX: 0, angularZ: 0 });
  };

  const handlePointerDown = (evt: ReactPointerEvent<HTMLDivElement>) => {
    if (status !== "connected") return;

    activePointerIdRef.current = evt.pointerId;
    setDragging(true);
    evt.currentTarget.setPointerCapture(evt.pointerId);
    updateFromClientPoint(evt.clientX, evt.clientY);
  };

  const handlePointerMove = (evt: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || activePointerIdRef.current !== evt.pointerId) return;
    updateFromClientPoint(evt.clientX, evt.clientY);
  };

  const handlePointerUp = (evt: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== evt.pointerId) return;
    evt.currentTarget.releasePointerCapture(evt.pointerId);
    resetJoystick();
  };

  const handlePointerCancel = () => {
    resetJoystick();
  };

  const isConnected = status === "connected";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        width: "100%",
        ...containerStyle,
      }}
    >
      <div
        ref={padRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          position: "relative",
          width: PAD_RADIUS * 2,
          height: PAD_RADIUS * 2,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 35% 30%, #404651 0%, #1b2028 42%, #0b0f14 100%)",
          border: "1px solid #4b5563",
          boxShadow:
            "inset 0 2px 8px rgba(255,255,255,0.08), inset 0 -14px 28px rgba(0,0,0,0.45), 0 12px 22px rgba(15,23,42,0.22)",
          touchAction: "none",
          cursor: isConnected ? "grab" : "not-allowed",
          opacity: isConnected ? 1 : 0.55,
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 30%, #2f3640 0%, #161b22 55%, #0f141a 100%)",
            border: "1px solid rgba(148,163,184,0.18)",
            boxShadow:
              "inset 0 2px 8px rgba(255,255,255,0.04), inset 0 -8px 18px rgba(0,0,0,0.42)",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 24,
            borderRadius: "50%",
            border: "1px dashed rgba(226,232,240,0.12)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 16,
            bottom: 16,
            width: 1,
            transform: "translateX(-50%)",
            background: "rgba(226,232,240,0.10)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 16,
            right: 16,
            height: 1,
            transform: "translateY(-50%)",
            background: "rgba(226,232,240,0.10)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: KNOB_RADIUS * 2,
            height: KNOB_RADIUS * 2,
            borderRadius: "50%",
            transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))`,
            background:
              "radial-gradient(circle at 50% 28%, #f8fafc 0%, #dbe4ee 26%, #8793a2 52%, #323a45 76%, #111827 100%)",
            border: "1px solid #8d99a8",
            boxShadow:
              "inset 0 2px 4px rgba(255,255,255,0.28), inset 0 -10px 18px rgba(0,0,0,0.42), 0 10px 18px rgba(15,23,42,0.34)",
            transition: dragging ? "none" : "transform 140ms ease-out",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 7,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 50% 38%, #eef2f7 0%, #d8dee7 42%, #9aa6b5 78%, #6b7280 100%)",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow:
                "inset 0 2px 4px rgba(255,255,255,0.42), inset 0 -5px 10px rgba(15,23,42,0.18)",
            }}
          />

          <div
            style={{
              position: "absolute",
              inset: 3,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.10)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.30)",
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 6,
          width: "100%",
        }}
      >
        <InfoChip label="X" value={`${twist.linearX.toFixed(2)} m/s`} />
        <InfoChip label="Z" value={`${twist.angularZ.toFixed(2)} rad/s`} />
      </div>

      {!isConnected && (
        <span style={{ color: "#b91c1c", fontSize: 12, textAlign: "center" }}>
          Conecta rosbridge para habilitar el joystick.
        </span>
      )}
    </div>
  );
}