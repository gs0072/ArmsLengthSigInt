import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { StatsBar } from "@/components/stats-bar";
import { MapView } from "@/components/map-view";
import { DeviceList } from "@/components/device-list";
import { DeviceDetail } from "@/components/device-detail";
import { ScanPulse } from "@/components/scan-animation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Play, Bluetooth, Radio, Antenna, Wifi, CircuitBoard, Satellite, Thermometer, Radar, RefreshCw, Square, Signal } from "lucide-react";
import type { Device, Observation, Alert, CollectionSensor } from "@shared/schema";

export default function Dashboard() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [monitorStartTime, setMonitorStartTime] = useState<number | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    refetchInterval: monitoring ? 5000 : false,
  });

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
    if (activeSensors.length === 0 && sensors.length === 0) {
      toast({
        title: "No Sensors Configured",
        description: "Add sensors from the Sensors page to begin collecting real signals.",
        variant: "destructive",
      });
      return;
    }

    setMonitoring(true);
    setMonitorStartTime(Date.now());

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "collecting" });
    }

    toast({
      title: "Monitoring Active",
      description: `${activeSensors.length} sensor${activeSensors.length !== 1 ? "s" : ""} now collecting. Real signals will appear as they are detected.`,
    });
  }, [activeSensors, sensors, toast, updateSensorStatus]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);

    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "idle" });
    }

    const elapsed = monitorStartTime ? Math.round((Date.now() - monitorStartTime) / 1000) : 0;
    toast({
      title: "Monitoring Stopped",
      description: `Session ran for ${elapsed}s with ${activeSensors.length} sensor${activeSensors.length !== 1 ? "s" : ""}.`,
    });
  }, [activeSensors, monitorStartTime, toast, updateSensorStatus]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

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

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
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
          {monitoring ? (
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
              data-testid="button-start-monitor"
            >
              <Radar className="w-3.5 h-3.5 mr-1.5" />
              Start Monitoring
            </Button>
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (
        <StatsBar devices={devices} observations={observations} alerts={alerts} />
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_350px]" style={{ minHeight: 0 }}>
        <div className="flex flex-col gap-3" style={{ minHeight: 0 }}>
          <MapView
            observations={observations}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            fullscreen={false}
            onToggleFullscreen={() => {}}
          />

          <div className="h-[350px] sm:h-[400px] lg:flex-1 lg:h-auto" style={{ minHeight: "300px" }}>
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
          <div className="h-[400px] sm:h-[450px] lg:h-auto relative z-10">
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
          <Card className="flex flex-col overflow-visible gap-3 p-4 relative z-10">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {monitoring ? "Monitoring Active" : "Sensor Status"}
              </p>
              <div className="flex items-center gap-1.5">
                {monitoring && (
                  <Badge variant="default" className="text-[8px] animate-pulse">
                    LIVE
                  </Badge>
                )}
              </div>
            </div>

            {monitoring && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  <ScanPulse active={true} size={50} />
                  <p className="text-xs font-medium">Sensors Collecting</p>
                  <p className="text-[10px] text-muted-foreground text-center max-w-[260px]">
                    {activeSensors.length} sensor{activeSensors.length !== 1 ? "s" : ""} actively collecting real signals. New nodes appear automatically as they are detected.
                  </p>
                </div>

                {sensors.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {sensors.map(sensor => {
                      const SIcon = sensorTypeIcons[sensor.sensorType] || Radar;
                      const color = sensorTypeColors[sensor.sensorType] || "hsl(200, 20%, 50%)";
                      return (
                        <div
                          key={sensor.id}
                          className={`flex items-center gap-2 p-2 rounded-md border text-xs ${sensor.isActive ? "border-primary/30 bg-primary/5" : "border-border/30 bg-muted/10 opacity-50"}`}
                          data-testid={`sensor-monitor-${sensor.id}`}
                        >
                          <SIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                          <span className="flex-1 truncate">{sensor.name}</span>
                          <Badge variant="outline" className="text-[8px] uppercase">
                            {sensor.isActive ? (sensor.status === "collecting" ? "collecting" : "ready") : "off"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={stopMonitoring}
                  className="w-full"
                  data-testid="button-stop-scan-panel"
                >
                  <Square className="w-3.5 h-3.5 mr-1.5" />
                  Stop Monitoring
                </Button>
              </div>
            )}

            {!monitoring && (
              <>
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  <ScanPulse active={false} size={50} />
                  <p className="text-xs text-muted-foreground font-medium">Ready to Monitor</p>
                  <p className="text-[10px] text-muted-foreground text-center max-w-[260px]">
                    Start monitoring to activate your sensors and collect real wireless signals from nearby devices.
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {devices.length} node{devices.length !== 1 ? "s" : ""} in database
                  </p>
                </div>

                {sensors.length > 0 && (
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
                              {sensor.isActive ? (sensor.status === "collecting" ? "collecting" : "ready") : "off"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {sensors.length === 0 && (
                  <div className="flex flex-col items-center py-2 gap-1">
                    <p className="text-[10px] text-muted-foreground text-center">
                      No sensors configured yet. Add sensors to start collecting real signals.
                    </p>
                  </div>
                )}

                <Button
                  size="sm"
                  variant="default"
                  onClick={startMonitoring}
                  className="w-full"
                  data-testid="button-start-scan-panel"
                >
                  <Radar className="w-3.5 h-3.5 mr-1.5" />
                  Start Monitoring
                </Button>
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
