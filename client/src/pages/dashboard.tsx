import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { StatsBar } from "@/components/stats-bar";
import { MapView } from "@/components/map-view";
import { DeviceList } from "@/components/device-list";
import { DeviceDetail } from "@/components/device-detail";
import { ScanPulse, GlowLine } from "@/components/scan-animation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, RefreshCw, Bluetooth, Radio, Antenna, Wifi, CircuitBoard, Satellite, Thermometer, Radar, Settings, Loader2, ScanSearch, Power, Square } from "lucide-react";
import { Link } from "wouter";
import type { Device, Observation, Alert, CollectionSensor } from "@shared/schema";

export default function Dashboard() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [monitorStartTime, setMonitorStartTime] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: devices = [], isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
    refetchInterval: monitoring ? 5000 : false,
  });

  const { data: observations = [], isLoading: obsLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations"],
    refetchInterval: monitoring ? 5000 : false,
  });

  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
  });

  const { data: sensors = [] } = useQuery<CollectionSensor[]>({
    queryKey: ["/api/sensors"],
  });

  const recentDevices = monitoring && monitorStartTime
    ? devices
        .filter(d => d.lastSeenAt && new Date(d.lastSeenAt).getTime() >= monitorStartTime)
        .sort((a, b) => new Date(b.lastSeenAt!).getTime() - new Date(a.lastSeenAt!).getTime())
    : [];

  const sensorTypeIcons: Record<string, any> = {
    bluetooth: Bluetooth, wifi: Wifi, rfid: CircuitBoard, sdr: Antenna,
    lora: Radio, meshtastic: Radio, adsb: Satellite, sensor: Thermometer, unknown: Radar,
  };

  const sensorTypeColors: Record<string, string> = {
    bluetooth: "hsl(217, 91%, 60%)", wifi: "hsl(142, 76%, 48%)", rfid: "hsl(45, 90%, 55%)",
    sdr: "hsl(280, 65%, 55%)", lora: "hsl(25, 85%, 55%)", meshtastic: "hsl(25, 85%, 55%)",
    adsb: "hsl(0, 72%, 55%)", sensor: "hsl(320, 70%, 55%)", unknown: "hsl(200, 20%, 50%)",
  };

  const activeSensors = sensors.filter(s => s.isActive);

  const updateSensorStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/sensors/${id}`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/sensors"] }),
  });

  const startMonitoring = useCallback(() => {
    setMonitoring(true);
    setMonitorStartTime(Date.now());

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "collecting" });
    }

    toast({
      title: "Monitoring Active",
      description: "Watching for new signals from collector scripts. Data refreshes every 5 seconds.",
    });
  }, [activeSensors, toast, updateSensorStatus]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "idle" });
    }

    toast({
      title: "Monitoring Stopped",
      description: `${recentDevices.length} signal${recentDevices.length !== 1 ? "s" : ""} detected during session.`,
    });
  }, [activeSensors, recentDevices.length, toast, updateSensorStatus]);

  const toggleTrack = useMutation({
    mutationFn: async (id: number) => {
      const device = devices.find(d => d.id === id);
      await apiRequest("PATCH", `/api/devices/${id}`, { isTracked: !device?.isTracked });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/devices"] }),
  });

  const toggleFlag = useMutation({
    mutationFn: async (id: number) => {
      const device = devices.find(d => d.id === id);
      await apiRequest("PATCH", `/api/devices/${id}`, { isFlagged: !device?.isFlagged });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/devices"] }),
  });

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);
  const isLoading = devicesLoading || obsLoading;

  const signalColor = (type: string) => sensorTypeColors[type] || "hsl(200, 20%, 50%)";

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" data-testid="text-dashboard-title">
            Operations Dashboard
          </h2>
          <Badge variant="outline" className="text-[9px] uppercase">
            {devices.length} Nodes
          </Badge>
          <Badge variant="outline" className="text-[9px] uppercase">
            {activeSensors.length} / {sensors.length} Sensors Active
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {sensors.length > 0 ? (
            monitoring ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={stopMonitoring}
                data-testid="button-stop-monitor"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop Monitoring
              </Button>
            ) : (
              <Button
                size="sm"
                variant="default"
                onClick={startMonitoring}
                disabled={activeSensors.length === 0}
                data-testid="button-start-monitor"
              >
                <ScanSearch className="w-3.5 h-3.5 mr-1.5" />
                Start Monitoring
              </Button>
            )
          ) : (
            <Link href="/settings">
              <Button size="sm" variant="outline" data-testid="button-configure-sensors">
                <Settings className="w-3.5 h-3.5 mr-1.5" />
                Configure Sensors
              </Button>
            </Link>
          )}
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
              queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <StatsBar devices={devices} observations={observations} alerts={alerts} />
      )}

      <div className="grid gap-3 flex-1 min-h-0 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_350px]">
        <div className="flex flex-col gap-3 min-h-0">
          <MapView
            observations={observations}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            fullscreen={false}
            onToggleFullscreen={() => {}}
          />

          <div className="flex-1 min-h-[300px]">
            <DeviceList
              devices={devices}
              observations={observations}
              selectedDeviceId={selectedDeviceId}
              onSelectDevice={setSelectedDeviceId}
              isLoading={devicesLoading}
            />
          </div>
        </div>

        {selectedDevice && (
          <div className="min-h-[400px] lg:min-h-0">
            <DeviceDetail
              device={selectedDevice}
              observations={observations}
              onClose={() => setSelectedDeviceId(null)}
              onToggleTrack={id => toggleTrack.mutate(id)}
              onToggleFlag={id => toggleFlag.mutate(id)}
            />
          </div>
        )}

        {!selectedDevice && (
          <Card className="flex flex-col overflow-visible gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {monitoring ? "Live Signal Feed" : "Sensor Status"}
              </p>
              {monitoring && (
                <Badge variant="default" className="text-[8px] animate-pulse">
                  LIVE
                </Badge>
              )}
            </div>

            {monitoring && recentDevices.length > 0 && (
              <ScrollArea className="max-h-[280px]">
                <div className="flex flex-col gap-1" data-testid="monitor-feed-list">
                  {recentDevices.map((device, i) => {
                    const SIcon = sensorTypeIcons[device.signalType || "unknown"] || Radar;
                    return (
                      <div
                        key={device.id}
                        className="flex items-center gap-2 p-2 rounded-md border text-xs animate-in fade-in slide-in-from-top-1 duration-300 border-primary/30 bg-primary/5 cursor-pointer"
                        data-testid={`monitor-feed-item-${i}`}
                        onClick={() => setSelectedDeviceId(device.id)}
                      >
                        <SIcon className="w-3.5 h-3.5 shrink-0" style={{ color: signalColor(device.signalType || "unknown") }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="truncate font-medium text-[11px]">{device.name}</p>
                          </div>
                          <p className="text-[9px] text-muted-foreground truncate">
                            {device.macAddress} | {device.manufacturer || "Unknown"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] font-mono" style={{ color: signalColor(device.signalType || "unknown") }}>
                            {device.signalType?.toUpperCase()}
                          </p>
                          <p className="text-[8px] text-muted-foreground">
                            {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString() : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {monitoring && recentDevices.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <ScanPulse active={true} size={60} />
                <p className="text-xs text-muted-foreground">Waiting for collector data...</p>
                <p className="text-[10px] text-muted-foreground text-center max-w-[220px]">
                  Run your collector script to push signals here. Data refreshes every 5 seconds.
                </p>
              </div>
            )}

            {!monitoring && (
              <>
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  <ScanPulse active={false} size={50} />
                  <p className="text-xs text-muted-foreground">Select a node to view details</p>
                  <p className="text-[10px] text-muted-foreground">
                    {devices.length} node{devices.length !== 1 ? "s" : ""} discovered
                  </p>
                </div>

                {sensors.length > 0 ? (
                  <div className="flex flex-col gap-3 w-full">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sensors</p>
                    <div className="flex flex-col gap-1.5">
                      {sensors.map(sensor => {
                        const SIcon = sensorTypeIcons[sensor.sensorType] || Radar;
                        const color = sensorTypeColors[sensor.sensorType] || "hsl(200, 20%, 50%)";
                        return (
                          <div
                            key={sensor.id}
                            className={`flex items-center gap-2 p-2 rounded-md border text-xs ${sensor.isActive ? "border-primary/30 bg-primary/5" : "border-border/30 bg-muted/10 opacity-50"}`}
                            data-testid={`sensor-status-${sensor.id}`}
                          >
                            <SIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                            <span className="flex-1 truncate">{sensor.name}</span>
                            <Badge variant="outline" className="text-[8px] uppercase">
                              {sensor.isActive ? (sensor.status === "collecting" ? "monitoring" : "ready") : "off"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={startMonitoring}
                      disabled={activeSensors.length === 0}
                      className="w-full"
                      data-testid="button-start-monitor-panel"
                    >
                      <ScanSearch className="w-3.5 h-3.5 mr-1.5" />
                      Start Monitoring ({activeSensors.length} active)
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 w-full">
                    <p className="text-[10px] text-muted-foreground">No sensors configured yet</p>
                    <Link href="/settings">
                      <Button size="sm" variant="outline" className="w-full" data-testid="button-goto-settings-panel">
                        <Settings className="w-3.5 h-3.5 mr-1.5" />
                        Configure Sensors in Settings
                      </Button>
                    </Link>
                  </div>
                )}
              </>
            )}

            {monitoring && (
              <Button
                size="sm"
                variant="destructive"
                onClick={stopMonitoring}
                className="w-full"
                data-testid="button-stop-monitor-panel"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop Monitoring ({recentDevices.length} signals detected)
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
