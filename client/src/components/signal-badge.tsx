import { Badge } from "@/components/ui/badge";
import { getSignalColor, getSignalLabel } from "@/lib/signal-utils";
import { Wifi, Bluetooth, Radio, Radar, Satellite, Activity, Cpu, HelpCircle } from "lucide-react";

const signalIcons: Record<string, typeof Wifi> = {
  bluetooth: Bluetooth,
  wifi: Wifi,
  rfid: Cpu,
  sdr: Radio,
  lora: Satellite,
  meshtastic: Satellite,
  adsb: Radar,
  sensor: Activity,
  unknown: HelpCircle,
};

export function SignalBadge({ type, size = "default" }: { type: string; size?: "default" | "sm" }) {
  const Icon = signalIcons[type] || HelpCircle;
  const color = getSignalColor(type);
  const label = getSignalLabel(type);

  return (
    <Badge
      variant="outline"
      className={size === "sm" ? "text-xs gap-1" : "gap-1.5"}
      style={{ borderColor: color, color }}
      data-testid={`badge-signal-${type}`}
    >
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {label}
    </Badge>
  );
}

export function SignalStrengthBar({ strength, maxStrength = -20, minStrength = -100 }: {
  strength: number | null | undefined;
  maxStrength?: number;
  minStrength?: number;
}) {
  if (strength == null) return <span className="text-muted-foreground text-xs">N/A</span>;
  const pct = Math.max(0, Math.min(100, ((strength - minStrength) / (maxStrength - minStrength)) * 100));
  const bars = Math.ceil(pct / 20);

  return (
    <div className="flex items-end gap-0.5 h-4" data-testid="signal-strength-bar">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className="w-1 rounded-sm transition-all"
          style={{
            height: `${i * 20}%`,
            backgroundColor: i <= bars
              ? pct >= 60 ? "hsl(142, 76%, 48%)" : pct >= 30 ? "hsl(45, 90%, 55%)" : "hsl(0, 72%, 55%)"
              : "hsl(200, 20%, 25%)",
          }}
        />
      ))}
    </div>
  );
}
