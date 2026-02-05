import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, BellOff, Plus, Trash2, Search, AlertTriangle, Check, X } from "lucide-react";
import type { Alert } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface MonitoringPanelProps {
  alerts: Alert[];
}

export function MonitoringPanel({ alerts }: MonitoringPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [alertName, setAlertName] = useState("");
  const [alertType, setAlertType] = useState("device_name");
  const [searchValue, setSearchValue] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createAlert = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/alerts", {
        name: alertName,
        alertType,
        description: `Monitor for: ${searchValue}`,
        criteria: { searchTerm: searchValue, type: alertType },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setShowForm(false);
      setAlertName("");
      setSearchValue("");
      toast({ title: "Alert created", description: "Monitoring is now active" });
    },
  });

  const dismissAlert = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/alerts/${id}`, { status: "dismissed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  const activeAlerts = alerts.filter(a => a.status === "active" || a.status === "triggered");
  const pastAlerts = alerts.filter(a => a.status === "dismissed" || a.status === "expired");

  return (
    <Card className="flex flex-col h-full overflow-visible">
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
            <Select value={alertType} onValueChange={setAlertType}>
              <SelectTrigger className="text-xs" data-testid="select-alert-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
            <Input
              placeholder="Search value or pattern..."
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              className="text-xs font-mono"
              data-testid="input-alert-value"
            />
            <Button
              size="sm"
              className="w-full"
              onClick={() => createAlert.mutate()}
              disabled={!alertName || !searchValue || createAlert.isPending}
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
                  {activeAlerts.map(alert => (
                    <div
                      key={alert.id}
                      className={`p-2.5 rounded-md flex items-start justify-between gap-2 ${
                        alert.status === "triggered" ? "bg-destructive/10 border border-destructive/30" : "bg-muted/20"
                      }`}
                      data-testid={`alert-${alert.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {alert.status === "triggered" && (
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                          )}
                          <span className="text-xs font-medium truncate">{alert.name}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{alert.description}</p>
                        <Badge variant="outline" className="mt-1 text-[9px]">
                          {alert.alertType.replace(/_/g, " ")}
                        </Badge>
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
                  ))}
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
  );
}
