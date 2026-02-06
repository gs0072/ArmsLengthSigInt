import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, BellOff, Plus, Search, AlertTriangle, Check, X, ExternalLink, Radar, Target, Layers } from "lucide-react";
import type { Alert, Device, CustomSignature } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { DEVICE_BROADCAST_SIGNATURES } from "@/lib/signal-utils";

interface AlertHit {
  alert: Alert;
  matchedDevices: Device[];
}

interface AlertHitsResponse {
  hits: AlertHit[];
  totalHits: number;
}

interface MonitoringPanelProps {
  alerts: Alert[];
  alertHits?: AlertHitsResponse;
}

export function MonitoringPanel({ alerts, alertHits }: MonitoringPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [alertName, setAlertName] = useState("");
  const [alertType, setAlertType] = useState("device_name");
  const [searchValue, setSearchValue] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: customSignatures = [] } = useQuery<CustomSignature[]>({
    queryKey: ["/api/custom-signatures"],
  });

  const categoryOptions = useMemo(() => {
    const builtIn = Object.entries(DEVICE_BROADCAST_SIGNATURES).map(([name, sig]) => ({
      name,
      terms: sig.terms,
      source: "built-in" as const,
    }));
    const custom = customSignatures.map(sig => ({
      name: sig.name,
      terms: sig.terms || [],
      source: "custom" as const,
    }));
    return [...builtIn, ...custom];
  }, [customSignatures]);

  const isCategory = alertType === "device_category";

  const createAlert = useMutation({
    mutationFn: async () => {
      let criteria: Record<string, unknown>;
      let description: string;

      if (isCategory && selectedCategory) {
        const cat = categoryOptions.find(c => c.name === selectedCategory);
        criteria = { type: "catalog_broadcast_match", terms: cat?.terms || [selectedCategory], category: selectedCategory };
        description = `Monitor for category: ${selectedCategory}`;
      } else {
        criteria = { searchTerm: searchValue, type: alertType };
        description = `Monitor for: ${searchValue}`;
      }

      const res = await apiRequest("POST", "/api/alerts", {
        name: alertName,
        alertType,
        description,
        criteria,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setShowForm(false);
      setAlertName("");
      setSearchValue("");
      setSelectedCategory("");
      toast({ title: "Alert created", description: "Monitoring is now active" });
    },
  });

  const dismissAlert = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/alerts/${id}`, { status: "dismissed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts", "hits"] });
    },
  });

  const activeAlerts = alerts.filter(a => a.status === "active" || a.status === "triggered");
  const pastAlerts = alerts.filter(a => a.status === "dismissed" || a.status === "expired");
  const hits = alertHits?.hits || [];
  const totalHitCount = alertHits?.totalHits || 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      {totalHitCount > 0 && (
        <Card className="overflow-visible border-destructive/30">
          <CardHeader className="flex flex-row items-center gap-2 pb-2 px-3 pt-3">
            <Target className="w-4 h-4 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">Alert Hits</h3>
            <Badge variant="destructive" className="ml-auto text-[9px]">
              {totalHitCount} match{totalHitCount !== 1 ? "es" : ""}
            </Badge>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {hits.map(hit => (
                  <div key={hit.alert.id} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <span className="text-xs font-medium flex-1 truncate">{hit.alert.name}</span>
                      <Badge variant="destructive" className="text-[8px]">
                        {hit.matchedDevices.length} hit{hit.matchedDevices.length !== 1 ? "s" : ""}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => dismissAlert.mutate(hit.alert.id)}
                        data-testid={`button-dismiss-hit-${hit.alert.id}`}
                      >
                        <BellOff className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="ml-5 space-y-1">
                      {hit.matchedDevices.map(device => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-md bg-destructive/5 border border-destructive/20 cursor-pointer hover-elevate"
                          onClick={() => setLocation(`/node-report/${device.id}`)}
                          data-testid={`hit-device-${device.id}`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Radar className="w-3.5 h-3.5 text-destructive shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{device.name || device.macAddress}</p>
                              <p className="text-[9px] text-muted-foreground truncate">
                                {device.manufacturer || "Unknown"} | {device.signalType} | {device.macAddress || "N/A"}
                              </p>
                            </div>
                          </div>
                          <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Card className="flex flex-col flex-1 overflow-visible min-h-0">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-3 pt-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Monitoring & Alerts</h3>
          </div>
          <Button
            size="sm"
            variant={showForm ? "secondary" : "default"}
            onClick={() => setShowForm(!showForm)}
            data-testid="button-new-alert"
          >
            {showForm ? <X className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
            {showForm ? "Cancel" : "New Alert"}
          </Button>
        </CardHeader>

        <CardContent className="flex-1 px-3 pb-3 overflow-hidden">
          {showForm && (
            <div className="space-y-2 p-3 rounded-md bg-muted/20 mb-3">
              <Input
                placeholder="Alert name"
                value={alertName}
                onChange={e => setAlertName(e.target.value)}
                className="text-xs"
                data-testid="input-alert-name"
              />
              <Select value={alertType} onValueChange={(v) => { setAlertType(v); setSelectedCategory(""); setSearchValue(""); }}>
                <SelectTrigger className="text-xs" data-testid="select-alert-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="device_category">
                    <span className="flex items-center gap-1.5"><Layers className="w-3 h-3" /> Device Category</span>
                  </SelectItem>
                  <SelectItem value="device_name">Device Name</SelectItem>
                  <SelectItem value="mac_address">MAC Address</SelectItem>
                  <SelectItem value="signal_type">Signal Type</SelectItem>
                  <SelectItem value="hex_pattern">Hex Pattern</SelectItem>
                  <SelectItem value="ascii_pattern">ASCII Pattern</SelectItem>
                  <SelectItem value="manufacturer">Manufacturer</SelectItem>
                  <SelectItem value="frequency_range">Frequency Range</SelectItem>
                  <SelectItem value="proximity">Proximity Alert</SelectItem>
                  <SelectItem value="following">Following Detection</SelectItem>
                </SelectContent>
              </Select>
              {isCategory ? (
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="text-xs" data-testid="select-alert-category">
                    <SelectValue placeholder="Select a device category..." />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="max-h-[240px]">
                      {categoryOptions.map(cat => (
                        <SelectItem key={cat.name} value={cat.name}>
                          <span className="flex items-center gap-1.5">
                            {cat.name}
                            {cat.source === "custom" && (
                              <Badge variant="outline" className="text-[7px] ml-1 no-default-hover-elevate no-default-active-elevate">custom</Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Search value or pattern..."
                  value={searchValue}
                  onChange={e => setSearchValue(e.target.value)}
                  className="text-xs font-mono"
                  data-testid="input-alert-value"
                />
              )}
              <Button
                size="sm"
                className="w-full"
                onClick={() => createAlert.mutate()}
                disabled={!alertName || (isCategory ? !selectedCategory : !searchValue) || createAlert.isPending}
                data-testid="button-create-alert"
              >
                {createAlert.isPending ? "Creating..." : "Create Alert"}
              </Button>
            </div>
          )}

          <ScrollArea className="h-full">
            <div className="space-y-3">
              {activeAlerts.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Active</h4>
                  <div className="space-y-1">
                    {activeAlerts.map(alert => {
                      const hitInfo = hits.find(h => h.alert.id === alert.id);
                      return (
                        <div
                          key={alert.id}
                          className={`p-2.5 rounded-md flex items-start justify-between gap-2 ${
                            alert.status === "triggered" ? "bg-destructive/10 border border-destructive/30" : "bg-muted/20"
                          }`}
                          data-testid={`alert-${alert.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {alert.status === "triggered" && (
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                              )}
                              <span className="text-xs font-medium truncate">{alert.name}</span>
                              {hitInfo && (
                                <Badge variant="destructive" className="text-[8px]">
                                  {hitInfo.matchedDevices.length} HIT{hitInfo.matchedDevices.length !== 1 ? "S" : ""}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{alert.description}</p>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[9px]">
                                {alert.alertType.replace(/_/g, " ")}
                              </Badge>
                              {(alert.criteria as any)?.category && (
                                <Badge variant="secondary" className="text-[9px]">
                                  {(alert.criteria as any).category}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => dismissAlert.mutate(alert.id)}
                            data-testid={`button-dismiss-alert-${alert.id}`}
                          >
                            <BellOff className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeAlerts.length === 0 && !showForm && (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs">
                  <Bell className="w-8 h-8 mb-2 opacity-30" />
                  <p>No active alerts</p>
                  <p className="text-[10px] mt-1">Create alerts to monitor for specific signals</p>
                </div>
              )}

              {pastAlerts.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">History</h4>
                  <div className="space-y-1">
                    {pastAlerts.slice(0, 10).map(alert => (
                      <div key={alert.id} className="p-2 rounded-md bg-muted/10 opacity-60">
                        <div className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs truncate">{alert.name}</span>
                          <Badge variant="outline" className="text-[9px] ml-auto">{alert.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
