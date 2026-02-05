import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Shield, ShieldAlert, ShieldCheck, AlertTriangle, Eye, Info } from "lucide-react";
import type { FollowingDetectionEntry, Device } from "@shared/schema";

interface FollowingDetectorProps {
  entries: FollowingDetectionEntry[];
  devices: Device[];
  onViewDevice: (id: number) => void;
}

export function FollowingDetector({ entries, devices, onViewDevice }: FollowingDetectorProps) {
  const sortedEntries = [...entries].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
  const highRisk = sortedEntries.filter(e => (e.riskScore ?? 0) >= 70);
  const medRisk = sortedEntries.filter(e => (e.riskScore ?? 0) >= 40 && (e.riskScore ?? 0) < 70);
  const lowRisk = sortedEntries.filter(e => (e.riskScore ?? 0) < 40);

  const getDevice = (deviceId: number) => devices.find(d => d.id === deviceId);

  const getRiskColor = (score: number) => {
    if (score >= 70) return "hsl(0, 72%, 55%)";
    if (score >= 40) return "hsl(45, 90%, 55%)";
    return "hsl(142, 76%, 48%)";
  };

  return (
    <Card className="flex flex-col h-full overflow-visible">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-3 pt-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Following Detection</h3>
        </div>
        <Badge variant={highRisk.length > 0 ? "destructive" : "secondary"} className="text-[9px]">
          {highRisk.length > 0 ? `${highRisk.length} HIGH RISK` : "CLEAR"}
        </Badge>
      </CardHeader>

      <CardContent className="flex-1 px-3 pb-3 overflow-hidden">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs">
            <ShieldCheck className="w-10 h-10 mb-2 opacity-30" />
            <p>No following patterns detected</p>
            <p className="text-[10px] mt-1 text-center max-w-48">
              The system monitors for devices that appear to be following your location over time
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-3">
              <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-muted-foreground">
                    Risk scores are calculated based on encounter frequency, duration, location correlation, and signal persistence.
                    Common traveler patterns are excluded.
                  </p>
                </div>
              </div>

              {[
                { label: "High Risk", items: highRisk, icon: <ShieldAlert className="w-3.5 h-3.5" /> },
                { label: "Medium Risk", items: medRisk, icon: <AlertTriangle className="w-3.5 h-3.5" /> },
                { label: "Low Risk", items: lowRisk, icon: <ShieldCheck className="w-3.5 h-3.5" /> },
              ].map(group => group.items.length > 0 && (
                <div key={group.label}>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    {group.icon} {group.label}
                  </h4>
                  <div className="space-y-1">
                    {group.items.map(entry => {
                      const device = getDevice(entry.deviceId);
                      return (
                        <div
                          key={entry.id}
                          className="p-2.5 rounded-md bg-muted/20 hover-elevate cursor-pointer"
                          onClick={() => onViewDevice(entry.deviceId)}
                          data-testid={`following-entry-${entry.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium truncate block">
                                {device?.name || `Device #${entry.deviceId}`}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {entry.encounterCount} encounters | Status: {entry.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div
                                className="text-sm font-bold"
                                style={{ color: getRiskColor(entry.riskScore ?? 0) }}
                              >
                                {Math.round(entry.riskScore ?? 0)}%
                              </div>
                              <Button size="icon" variant="ghost">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
