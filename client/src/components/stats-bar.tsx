import { Card } from "@/components/ui/card";
import { Wifi, Bluetooth, Radio, Satellite, Radar, Activity, AlertTriangle, Eye } from "lucide-react";
import type { Device, Observation, Alert } from "@shared/schema";
import { motion } from "framer-motion";
import { useLocation } from "wouter";

interface StatsBarProps {
  devices: Device[];
  observations: Observation[];
  alerts: Alert[];
}

export function StatsBar({ devices, observations, alerts }: StatsBarProps) {
  const [, setLocation] = useLocation();
  const activeAlerts = alerts.filter(a => a.status === "active" || a.status === "triggered");
  const triggeredAlerts = alerts.filter(a => a.status === "triggered");
  const hasHits = triggeredAlerts.length > 0;

  const stats = [
    {
      label: "Total Nodes",
      value: devices.length,
      icon: <Activity className="w-4 h-4" />,
      color: "hsl(185, 100%, 50%)",
    },
    {
      label: "Bluetooth",
      value: devices.filter(d => d.signalType === "bluetooth").length,
      icon: <Bluetooth className="w-4 h-4" />,
      color: "hsl(217, 91%, 60%)",
    },
    {
      label: "Wi-Fi",
      value: devices.filter(d => d.signalType === "wifi").length,
      icon: <Wifi className="w-4 h-4" />,
      color: "hsl(142, 76%, 48%)",
    },
    {
      label: "SDR/RF",
      value: devices.filter(d => d.signalType === "sdr" || d.signalType === "rfid").length,
      icon: <Radio className="w-4 h-4" />,
      color: "hsl(280, 65%, 55%)",
    },
    {
      label: "LoRa/Mesh",
      value: devices.filter(d => d.signalType === "lora" || d.signalType === "meshtastic").length,
      icon: <Satellite className="w-4 h-4" />,
      color: "hsl(25, 85%, 55%)",
    },
    {
      label: "ADS-B",
      value: devices.filter(d => d.signalType === "adsb").length,
      icon: <Radar className="w-4 h-4" />,
      color: "hsl(0, 72%, 55%)",
    },
    {
      label: "Tracked",
      value: devices.filter(d => d.isTracked).length,
      icon: <Eye className="w-4 h-4" />,
      color: "hsl(185, 100%, 50%)",
    },
    {
      label: "Active Alerts",
      value: activeAlerts.length,
      icon: <AlertTriangle className="w-4 h-4" />,
      color: hasHits ? "hsl(0, 72%, 55%)" : "hsl(45, 90%, 55%)",
      clickable: true,
      onClick: () => setLocation("/monitoring"),
      hasHits,
      hitCount: triggeredAlerts.length,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <Card
            className={`p-2.5 hover-elevate overflow-visible ${stat.clickable ? "cursor-pointer" : ""} ${(stat as any).hasHits ? "border-destructive/50" : ""}`}
            onClick={(stat as any).onClick}
            data-testid={`stat-${stat.label.toLowerCase().replace(/[\s/]/g, "-")}`}
          >
            <div className="flex items-center gap-2">
              <div style={{ color: stat.color }}>{stat.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <div className="text-lg font-bold leading-none" style={{ color: stat.color }}>
                    {stat.value}
                  </div>
                  {(stat as any).hasHits && (
                    <div className="flex items-center gap-0.5 ml-auto">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive animate-pulse" />
                      <span className="text-[8px] font-bold text-destructive uppercase">
                        {(stat as any).hitCount} HIT{(stat as any).hitCount !== 1 ? "S" : ""}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">
                  {stat.label}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
