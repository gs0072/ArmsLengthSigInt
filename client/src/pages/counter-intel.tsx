import { useQuery } from "@tanstack/react-query";
import { FollowingDetector } from "@/components/following-detector";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldAlert, ShieldCheck, Wifi, Radio, Radar } from "lucide-react";
import { GlowLine } from "@/components/scan-animation";
import type { Device, FollowingDetectionEntry } from "@shared/schema";
import { useLocation } from "wouter";

export default function CounterIntelPage() {
  const [, setLocation] = useLocation();
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: followingEntries = [] } = useQuery<FollowingDetectionEntry[]>({ queryKey: ["/api/following-detection"] });

  const highRisk = followingEntries.filter(e => (e.riskScore ?? 0) >= 70);

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider">Counter Intelligence</h2>
          <Badge variant={highRisk.length > 0 ? "destructive" : "secondary"} className="text-[9px]">
            {highRisk.length > 0 ? "THREATS DETECTED" : "ALL CLEAR"}
          </Badge>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_350px] gap-3 flex-1 min-h-0">
        <div className="flex flex-col gap-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <Card className="p-3 overflow-visible">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold">Following Detection</h3>
              </div>
              <div className="text-2xl font-bold text-primary">{followingEntries.length}</div>
              <p className="text-[10px] text-muted-foreground mt-1">Patterns being tracked</p>
            </Card>
            <Card className="p-3 overflow-visible">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-4 h-4 text-destructive" />
                <h3 className="text-xs font-semibold">Interrogation Attempts</h3>
              </div>
              <div className="text-2xl font-bold text-destructive">0</div>
              <p className="text-[10px] text-muted-foreground mt-1">Devices probing your nodes</p>
            </Card>
            <Card className="p-3 overflow-visible">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-chart-3" />
                <h3 className="text-xs font-semibold">Security Score</h3>
              </div>
              <div className="text-2xl font-bold text-chart-3">{highRisk.length === 0 ? "98" : "65"}/100</div>
              <p className="text-[10px] text-muted-foreground mt-1">Overall risk assessment</p>
            </Card>
          </div>

          <GlowLine />

          <Card className="flex-1 p-3 overflow-visible">
            <div className="flex items-center gap-2 mb-3">
              <Radar className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-semibold">Detection Matrix</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "War Driving", icon: <Wifi className="w-4 h-4" />, status: "monitoring", color: "hsl(185, 100%, 50%)" },
                { label: "IMSI Catchers", icon: <Radio className="w-4 h-4" />, status: "clear", color: "hsl(142, 76%, 48%)" },
                { label: "Drone Surveillance", icon: <Radar className="w-4 h-4" />, status: "monitoring", color: "hsl(185, 100%, 50%)" },
                { label: "BLE Trackers", icon: <Shield className="w-4 h-4" />, status: "clear", color: "hsl(142, 76%, 48%)" },
              ].map(item => (
                <div key={item.label} className="p-2.5 rounded-md bg-muted/20">
                  <div className="flex items-center gap-1.5 mb-1" style={{ color: item.color }}>
                    {item.icon}
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </div>
                  <Badge
                    variant={item.status === "clear" ? "secondary" : "outline"}
                    className="text-[9px]"
                    style={item.status !== "clear" ? { borderColor: item.color, color: item.color } : {}}
                  >
                    {item.status === "clear" ? "Clear" : "Active"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <FollowingDetector
          entries={followingEntries}
          devices={devices}
          onViewDevice={(id) => setLocation(`/devices`)}
        />
      </div>
    </div>
  );
}
