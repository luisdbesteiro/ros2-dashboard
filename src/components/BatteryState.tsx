import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Topic } from "roslib";
import { useRos } from "../providers/RosProvider";

type BatteryMsg = {
  percentage?: number;
};

type BatteryInlineMinimalProps = {
  topicName?: string;
  style?: CSSProperties;
};

function normalizePercentage(value?: number): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value >= 0 && value <= 1) return Math.round(value * 100);
  if (value >= 0 && value <= 100) return Math.round(value);
  return null;
}

function getBatteryColor(percent: number | null, connected: boolean) {
  if (!connected || percent === null) return "#94a3b8";
  if (percent <= 20) return "#dc2626";
  if (percent <= 50) return "#ca8a04";
  return "#16a34a";
}

export default function BatteryInlineMinimal({
  topicName = "/battery",
  style,
}: BatteryInlineMinimalProps) {
  const { ros, status } = useRos();
  const [percentage, setPercentage] = useState<number | null>(null);

  useEffect(() => {
    if (!ros || status !== "connected") return;

    const batteryTopic = new Topic({
      ros,
      name: topicName,
      messageType: "sensor_msgs/msg/BatteryState",
    });

    const handleBattery = (msg: unknown) => {
      const battery = msg as BatteryMsg;
      setPercentage(normalizePercentage(battery.percentage));
    };

    batteryTopic.subscribe(handleBattery);

    return () => {
      batteryTopic.unsubscribe(handleBattery);
    };
  }, [ros, status, topicName]);

  const connected = status === "connected";
  const color = useMemo(
    () => getBatteryColor(percentage, connected),
    [percentage, connected]
  );

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        color: "#334155",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          width: 18,
          height: 10,
          border: `2px solid ${color}`,
          borderRadius: 3,
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            right: -4,
            top: "50%",
            width: 2,
            height: 4,
            borderRadius: 1,
            background: color,
            transform: "translateY(-50%)",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 1,
            top: 1,
            bottom: 1,
            width: `${Math.max(0, Math.min(100, percentage ?? 0))}%`,
            background: color,
            borderRadius: 1,
            transition: "width 180ms ease-out",
          }}
        />
      </span>

      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          color: percentage === null ? "#94a3b8" : "#334155",
        }}
      >
        {percentage === null ? "--%" : `${percentage}%`}
      </span>
    </div>
  );
}