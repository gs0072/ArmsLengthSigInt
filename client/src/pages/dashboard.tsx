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
import { Play, Pause, RefreshCw, Bluetooth, Radio, Antenna, Wifi, CircuitBoard, Satellite, Thermometer, Radar, Settings, Loader2, ScanSearch, Power, Square, Signal, ShieldAlert, Lock } from "lucide-react";
import { Link } from "wouter";
import type { Device, Observation, Alert, CollectionSensor } from "@shared/schema";

interface InterceptedSignal {
  id: number;
  name: string;
  macAddress: string;
  signalType: string;
  rssi: number;
  deviceType: string;
  manufacturer: string;
  protocol: string;
  frequency: number | null;
  channel: number | null;
  encryption: string;
  isNew: boolean;
}

interface PassiveScanResult {
  signalsIntercepted: number;
  newDevices: number;
  signals: InterceptedSignal[];
  scanTime: number;
  scanType: string;
}

export default function Dashboard() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [monitorStartTime, setMonitorStartTime] = useState<number | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "complete">("idle");
  const [lastScanResult, setLastScanResult] = useState<PassiveScanResult | null>(null);
  const [liveSignals, setLiveSignals] = useState<InterceptedSignal[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [totalIntercepted, setTotalIntercepted] = useState(0);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const runPassiveScan = useCallback(async () => {
    setScanStatus("scanning");
    try {
      const res = await apiRequest("POST", "/api/scan/passive", {});
      const result: PassiveScanResult = await res.json();
      setLastScanResult(result);
      setScanCount(prev => prev + 1);
      setTotalIntercepted(prev => prev + result.signalsIntercepted);
      setScanStatus("complete");

      setLiveSignals(prev => {
        const combined = [...result.signals, ...prev];
        return combined.slice(0, 50);
      });

      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });

      if (result.newDevices > 0) {
        toast({
          title: "Signals Intercepted",
          description: `Captured ${result.newDevices} new signal${result.newDevices !== 1 ? "s" : ""} (${result.signalsIntercepted} total)`,
        });
      }
    } catch (err: any) {
      setScanStatus("complete");
      console.error("Passive scan failed:", err);
    }
  }, [queryClient, toast]);

  const startMonitoring = useCallback(() => {
    setMonitoring(true);
    setMonitorStartTime(Date.now());
    setScanCount(0);
    setTotalIntercepted(0);
    setLastScanResult(null);
    setLiveSignals([]);

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "collecting" });
    }

    runPassiveScan();

    scanTimerRef.current = setInterval(() => {
      runPassiveScan();
    }, 8000);

    toast({
      title: "Passive Monitoring Active",
      description: "Listening for wireless signals across all bands.",
    });
  }, [activeSensors, toast, updateSensorStatus, runPassiveScan]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    setScanStatus("idle");

    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "idle" });
    }

    toast({
      title: "Monitoring Stopped",
      description: `Intercepted ${totalIntercepted} signal${totalIntercepted !== 1 ? "s" : ""} across ${scanCount} sweep${scanCount !== 1 ? "s" : ""}.`,
    });
  }, [activeSensors, totalIntercepted, scanCount, toast, updateSensorStatus]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
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

  const signalColor = (type: string) => sensorTypeColors[type] || "hsl(200, 20%, 50%)";

  const formatFreq = (freq: number | null) => {
    if (!freq) return "";
    if (freq >= 1e9) return `${(freq / 1e9).toFixed(1)} GHz`;
    if (freq >= 1e6) return `${(freq / 1e6).toFixed(1)} MHz`;
    return `${freq} Hz`;
  };

  const rssiBar = (rssi: number, type: string) => {
    const minRssi = type === "lora" || type === "meshtastic" ? -140 : -100;
    const maxRssi = -20;
    const pct = Math.max(0, Math.min(100, ((rssi - minRssi) / (maxRssi - minRssi)) * 100));
    return pct;
  };

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
              Start Passive Monitor
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
          <div className="min-h-[400px] lg:min-h-0 relative z-10">
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
                {monitoring ? "Intercepted Signals" : "Sensor Status"}
              </p>
              {monitoring && (
                <div className="flex items-center gap-1.5">
                  {scanStatus === "scanning" && (
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  )}
                  <Badge variant="default" className="text-[8px] animate-pulse">
                    LISTENING
                  </Badge>
                </div>
              )}
            </div>

            {monitoring && scanStatus === "scanning" && liveSignals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <ScanPulse active={true} size={60} />
                <p className="text-xs text-muted-foreground">Listening for signals...</p>
                <p className="text-[10px] text-muted-foreground text-center max-w-[220px]">
                  Passively monitoring wireless bands for Bluetooth, Wi-Fi, LoRa, ADS-B, and other signals.
                </p>
              </div>
            )}

            {monitoring && liveSignals.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-2 text-[9px] text-muted-foreground border-b border-border/30 pb-2">
                  <span>Sweep #{scanCount} | {totalIntercepted} signals captured</span>
                  <span>{lastScanResult?.scanTime ?? 0}ms</span>
                </div>
                <ScrollArea className="max-h-[320px]">
                  <div className="flex flex-col gap-1" data-testid="monitor-feed-list">
                    {liveSignals.map((sig, i) => {
                      const SIcon = sensorTypeIcons[sig.signalType] || Radar;
                      const strength = rssiBar(sig.rssi, sig.signalType);
                      return (
                        <div
                          key={`${sig.macAddress}-${i}`}
                          className={`flex items-center gap-2 p-2 rounded-md border text-xs animate-in fade-in slide-in-from-top-1 duration-300 cursor-pointer ${
                            sig.isNew
                              ? "border-primary/40 bg-primary/5"
                              : "border-border/30 bg-muted/5"
                          }`}
                          data-testid={`signal-feed-item-${i}`}
                          onClick={() => setSelectedDeviceId(sig.id)}
                        >
                          <div className="flex flex-col items-center gap-0.5 shrink-0 w-6">
                            <SIcon className="w-3.5 h-3.5" style={{ color: signalColor(sig.signalType) }} />
                            <div className="w-3 h-[3px] rounded-full overflow-hidden bg-muted">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${strength}%`,
                                  backgroundColor: signalColor(sig.signalType),
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="truncate font-medium text-[11px]">{sig.name}</p>
                              {sig.isNew && (
                                <Badge variant="default" className="text-[7px] px-1 py-0 leading-tight">
                                  NEW
                                </Badge>
                              )}
                            </div>
                            <p className="text-[9px] text-muted-foreground truncate">
                              {sig.macAddress} | {sig.manufacturer}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-mono tabular-nums" style={{ color: signalColor(sig.signalType) }}>
                              {sig.rssi} dBm
                            </p>
                            <p className="text-[8px] text-muted-foreground font-mono">
                              {sig.protocol.split(" ")[0]}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}

            {monitoring && scanStatus === "complete" && liveSignals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <ScanPulse active={true} size={50} />
                <p className="text-xs text-muted-foreground">No signals detected yet</p>
                <p className="text-[10px] text-muted-foreground text-center max-w-[220px]">
                  Next sweep in ~8 seconds. Intercepted signals will appear here.
                </p>
              </div>
            )}

            {!monitoring && (
              <>
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  <ScanPulse active={false} size={50} />
                  <p className="text-xs text-muted-foreground">Select a node to view details</p>
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
                              {sensor.isActive ? (sensor.status === "collecting" ? "listening" : "ready") : "off"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
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
                  Start Passive Monitor
                </Button>
              </>
            )}

            {monitoring && (
              <Button
                size="sm"
                variant="destructive"
                onClick={stopMonitoring}
                className="w-full"
                data-testid="button-stop-scan-panel"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop Monitoring ({totalIntercepted} signals captured)
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
