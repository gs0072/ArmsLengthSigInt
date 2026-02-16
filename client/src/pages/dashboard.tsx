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
import { Play, Pause, RefreshCw, Bluetooth, Radio, Antenna, Wifi, CircuitBoard, Satellite, Thermometer, Radar, Settings, Loader2, ScanSearch, Power, Square, Signal, ShieldAlert, Lock, HardDrive, Cpu, Download, Smartphone } from "lucide-react";
import { Link } from "wouter";
import { useWebBluetooth } from "@/hooks/use-web-bluetooth";
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

interface CollectorStatus {
  hasApiKeys: boolean;
  activeKeyCount: number;
  totalKeys: number;
  recentlyActiveKeys: number;
  lastPushAt: string | null;
  recentPushCount: number;
  isReceivingHardwareData: boolean;
}

type DataSourceMode = "hardware" | "simulation" | "phone";

export default function Dashboard() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [monitorStartTime, setMonitorStartTime] = useState<number | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "complete">("idle");
  const [lastScanResult, setLastScanResult] = useState<PassiveScanResult | null>(null);
  const [liveSignals, setLiveSignals] = useState<InterceptedSignal[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [totalIntercepted, setTotalIntercepted] = useState(0);
  const [dataSource, setDataSource] = useState<DataSourceMode>("hardware");
  const [prevDeviceCount, setPrevDeviceCount] = useState<number | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const webBluetooth = useWebBluetooth();

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

  const { data: collectorStatus } = useQuery<CollectorStatus>({
    queryKey: ["/api/collector/status"],
    refetchInterval: monitoring && dataSource === "hardware" ? 10000 : 30000,
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

  const pushPhoneDevice = useMutation({
    mutationFn: async (bleDevice: { name: string; id: string }) => {
      const macAddress = bleDevice.id.includes(":")
        ? bleDevice.id.toUpperCase()
        : bleDevice.id.replace(/(.{2})(?=.)/g, "$1:").toUpperCase().slice(0, 17);
      const res = await apiRequest("POST", "/api/devices", {
        macAddress,
        name: bleDevice.name || "Unknown BLE Device",
        signalType: "bluetooth",
        deviceType: "Unknown",
        manufacturer: "Unknown",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
    },
  });

  const runPhoneScan = useCallback(async () => {
    setScanStatus("scanning");
    try {
      const discovered = await webBluetooth.scanForDevices();
      if (discovered) {
        await pushPhoneDevice.mutateAsync({ name: discovered.name, id: discovered.id });
        setScanCount(prev => prev + 1);
        setTotalIntercepted(prev => prev + 1);
        toast({
          title: "Device Discovered",
          description: `Found: ${discovered.name}`,
        });
      }
      setScanStatus("complete");
    } catch (err: any) {
      setScanStatus("complete");
    }
  }, [webBluetooth, pushPhoneDevice, toast]);

  const pollHardwareData = useCallback(async () => {
    setScanStatus("scanning");
    try {
      setScanCount(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collector/status"] });
      setScanStatus("complete");
    } catch (err) {
      setScanStatus("complete");
    }
  }, [queryClient]);

  useEffect(() => {
    if (monitoring && dataSource === "hardware" && prevDeviceCount !== null) {
      const newCount = devices.length;
      if (newCount > prevDeviceCount) {
        const diff = newCount - prevDeviceCount;
        setTotalIntercepted(prev => prev + diff);
        toast({
          title: "Hardware Data Received",
          description: `${diff} new device${diff !== 1 ? "s" : ""} from collector (${newCount} total)`,
        });
      }
    }
    if (monitoring && dataSource === "hardware") {
      setPrevDeviceCount(devices.length);
    }
  }, [devices.length, monitoring, dataSource]);

  const startMonitoring = useCallback(() => {
    setMonitoring(true);
    setMonitorStartTime(Date.now());
    setScanCount(0);
    setTotalIntercepted(0);
    setLastScanResult(null);
    setLiveSignals([]);
    setPrevDeviceCount(devices.length);

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "collecting" });
    }

    if (dataSource === "simulation") {
      runPassiveScan();
      scanTimerRef.current = setInterval(() => {
        runPassiveScan();
      }, 8000);
    } else {
      pollHardwareData();
      scanTimerRef.current = setInterval(() => {
        pollHardwareData();
      }, 5000);
    }

    toast({
      title: dataSource === "hardware" ? "Hardware Monitoring Active" : "Simulation Monitoring Active",
      description: dataSource === "hardware"
        ? "Waiting for real data from your collector scripts."
        : "Generating simulated signal data across all bands.",
    });
  }, [activeSensors, toast, updateSensorStatus, runPassiveScan, pollHardwareData, dataSource, devices.length]);

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
      description: dataSource === "hardware"
        ? `Received ${totalIntercepted} device${totalIntercepted !== 1 ? "s" : ""} from hardware collectors.`
        : `Intercepted ${totalIntercepted} signal${totalIntercepted !== 1 ? "s" : ""} across ${scanCount} sweep${scanCount !== 1 ? "s" : ""}.`,
    });
  }, [activeSensors, totalIntercepted, scanCount, toast, updateSensorStatus, dataSource]);

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

  const formatTimeSince = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const elapsed = Date.now() - new Date(dateStr).getTime();
    if (elapsed < 60000) return `${Math.round(elapsed / 1000)}s ago`;
    if (elapsed < 3600000) return `${Math.round(elapsed / 60000)}m ago`;
    if (elapsed < 86400000) return `${Math.round(elapsed / 3600000)}h ago`;
    return `${Math.round(elapsed / 86400000)}d ago`;
  };

  const recentDevices = devices.slice(0, 20);

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
          <div className="flex rounded-md border border-border/50 overflow-visible" data-testid="data-source-toggle">
            <button
              className={`px-3 py-1.5 text-[9px] uppercase tracking-wider font-medium transition-colors flex items-center gap-1 min-h-[32px] ${
                dataSource === "hardware"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground"
              }`}
              onClick={() => { if (!monitoring) setDataSource("hardware"); }}
              disabled={monitoring}
              data-testid="button-source-hardware"
            >
              <HardDrive className="w-3 h-3" />
              Hardware
            </button>
            <button
              className={`px-3 py-1.5 text-[9px] uppercase tracking-wider font-medium transition-colors flex items-center gap-1 min-h-[32px] ${
                dataSource === "phone"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground"
              }`}
              onClick={() => { if (!monitoring) setDataSource("phone"); }}
              disabled={monitoring}
              data-testid="button-source-phone"
            >
              <Smartphone className="w-3 h-3" />
              Phone
            </button>
            <button
              className={`px-3 py-1.5 text-[9px] uppercase tracking-wider font-medium transition-colors flex items-center gap-1 min-h-[32px] ${
                dataSource === "simulation"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground"
              }`}
              onClick={() => { if (!monitoring) setDataSource("simulation"); }}
              disabled={monitoring}
              data-testid="button-source-simulation"
            >
              <Cpu className="w-3 h-3" />
              Simulation
            </button>
          </div>

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
              onClick={dataSource === "phone" ? runPhoneScan : startMonitoring}
              disabled={dataSource === "phone" && webBluetooth.isScanning}
              data-testid="button-start-monitor"
            >
              {dataSource === "phone" ? (
                <>
                  <Bluetooth className="w-3.5 h-3.5 mr-1.5" />
                  Scan Bluetooth
                </>
              ) : (
                <>
                  <Radar className="w-3.5 h-3.5 mr-1.5" />
                  {dataSource === "hardware" ? "Start Hardware Monitor" : "Start Simulation"}
                </>
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
              queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
              queryClient.invalidateQueries({ queryKey: ["/api/collector/status"] });
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
                {dataSource === "phone"
                  ? "Phone Bluetooth Scanner"
                  : monitoring
                    ? dataSource === "hardware"
                      ? "Hardware Collector Feed"
                      : "Intercepted Signals"
                    : "Sensor Status"
                }
              </p>
              <div className="flex items-center gap-1.5">
                {monitoring && (
                  <>
                    {scanStatus === "scanning" && (
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    )}
                    <Badge variant="default" className={`text-[8px] ${dataSource === "hardware" ? "" : "animate-pulse"}`}>
                      {dataSource === "hardware" ? "HARDWARE" : "LISTENING"}
                    </Badge>
                  </>
                )}
                {!monitoring && dataSource === "hardware" && collectorStatus?.isReceivingHardwareData && (
                  <Badge variant="outline" className="text-[8px] text-green-500 border-green-500/30">
                    COLLECTORS ACTIVE
                  </Badge>
                )}
              </div>
            </div>

            {monitoring && dataSource === "hardware" && (
              <>
                <div className="flex flex-col gap-2 border-b border-border/30 pb-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground">
                      {collectorStatus?.isReceivingHardwareData
                        ? "Receiving data from hardware collectors"
                        : "Waiting for hardware collector data..."
                      }
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-2 rounded-md border border-border/30 bg-muted/5">
                      <p className="text-lg font-mono tabular-nums text-primary">{devices.length}</p>
                      <p className="text-[8px] text-muted-foreground uppercase">Total Nodes</p>
                    </div>
                    <div className="text-center p-2 rounded-md border border-border/30 bg-muted/5">
                      <p className="text-lg font-mono tabular-nums text-primary">{collectorStatus?.activeKeyCount ?? 0}</p>
                      <p className="text-[8px] text-muted-foreground uppercase">API Keys</p>
                    </div>
                  </div>
                  {collectorStatus?.lastPushAt && (
                    <p className="text-[9px] text-muted-foreground">
                      Last hardware push: {formatTimeSince(collectorStatus.lastPushAt)}
                    </p>
                  )}
                  {!collectorStatus?.hasApiKeys && (
                    <div className="p-2 rounded-md border border-yellow-500/30 bg-yellow-500/5">
                      <p className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">
                        No API keys found. Go to Settings to generate one, then run a collector script on your hardware machine.
                      </p>
                      <Link href="/settings">
                        <Button size="sm" variant="outline" className="mt-2 text-[10px]" data-testid="link-settings-keys">
                          <Settings className="w-3 h-3 mr-1" />
                          Go to Settings
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Recent Devices</p>
                <ScrollArea className="max-h-[280px]">
                  <div className="flex flex-col gap-1" data-testid="hardware-feed-list">
                    {recentDevices.length === 0 ? (
                      <div className="flex flex-col items-center py-4 gap-2">
                        <ScanPulse active={true} size={40} />
                        <p className="text-[10px] text-muted-foreground text-center">
                          No devices yet. Run a collector script on your machine to push real scan data.
                        </p>
                      </div>
                    ) : (
                      recentDevices.map((dev, i) => {
                        const SIcon = sensorTypeIcons[dev.signalType] || Radar;
                        const latestObs = observations.find(o => o.deviceId === dev.id);
                        const rssi = latestObs?.signalStrength ?? -80;
                        const strength = rssiBar(rssi, dev.signalType);
                        return (
                          <div
                            key={dev.id}
                            className="flex items-center gap-2 p-2 rounded-md border border-border/30 bg-muted/5 text-xs cursor-pointer hover-elevate"
                            data-testid={`signal-feed-item-${i}`}
                            onClick={() => setSelectedDeviceId(dev.id)}
                          >
                            <div className="flex flex-col items-center gap-0.5 shrink-0 w-6">
                              <SIcon className="w-3.5 h-3.5" style={{ color: signalColor(dev.signalType) }} />
                              <div className="w-3 h-[3px] rounded-full overflow-hidden bg-muted">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${strength}%`, backgroundColor: signalColor(dev.signalType) }}
                                />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium text-[11px]">{dev.name || dev.macAddress || "Unknown"}</p>
                              <p className="text-[9px] text-muted-foreground truncate">
                                {dev.macAddress || "N/A"} | {dev.manufacturer || "Unknown"}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] font-mono tabular-nums" style={{ color: signalColor(dev.signalType) }}>
                                {rssi} dBm
                              </p>
                              <p className="text-[8px] text-muted-foreground uppercase">
                                {dev.signalType}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </>
            )}

            {monitoring && dataSource === "simulation" && scanStatus === "scanning" && liveSignals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <ScanPulse active={true} size={60} />
                <p className="text-xs text-muted-foreground">Listening for signals...</p>
                <p className="text-[10px] text-muted-foreground text-center max-w-[220px]">
                  Passively monitoring wireless bands for Bluetooth, Wi-Fi, LoRa, ADS-B, and other signals.
                </p>
              </div>
            )}

            {monitoring && dataSource === "simulation" && liveSignals.length > 0 && (
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

            {monitoring && dataSource === "simulation" && scanStatus === "complete" && liveSignals.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <ScanPulse active={true} size={50} />
                <p className="text-xs text-muted-foreground">No signals detected yet</p>
                <p className="text-[10px] text-muted-foreground text-center max-w-[220px]">
                  Next sweep in ~8 seconds. Intercepted signals will appear here.
                </p>
              </div>
            )}

            {dataSource === "phone" && (
              <>
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  <Smartphone className="w-8 h-8 text-primary/60" />
                  <p className="text-xs text-muted-foreground font-medium">Phone Bluetooth Scanner</p>
                  {webBluetooth.isSupported ? (
                    <p className="text-[10px] text-muted-foreground text-center max-w-[260px]">
                      Use your phone's built-in Bluetooth to scan for nearby devices. Tap the button below to open the device picker - each scan discovers one device at a time.
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-3 rounded-md border border-yellow-500/20 bg-yellow-500/5 max-w-[300px]">
                      <p className="text-[10px] text-muted-foreground text-center font-medium">
                        Web Bluetooth is not supported in this browser.
                      </p>
                      <p className="text-[9px] text-muted-foreground/70 text-center">
                        To use Phone mode, open this app in Chrome on an Android device or a Chromium-based desktop browser with Web Bluetooth enabled. iOS Safari does not support Web Bluetooth.
                      </p>
                    </div>
                  )}
                  {webBluetooth.error && (
                    <p className="text-[10px] text-destructive text-center max-w-[260px]">
                      {webBluetooth.error}
                    </p>
                  )}
                </div>

                {webBluetooth.devices.length > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                        Discovered ({webBluetooth.devices.length})
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={webBluetooth.clearDevices}
                        className="text-[9px]"
                        data-testid="button-clear-phone-devices"
                      >
                        Clear
                      </Button>
                    </div>
                    <ScrollArea className="max-h-[280px]">
                      <div className="flex flex-col gap-1" data-testid="phone-scan-list">
                        {webBluetooth.devices.map((dev, i) => (
                          <div
                            key={dev.id}
                            className="flex items-center gap-2 p-2 rounded-md border border-primary/20 bg-primary/5 text-xs animate-in fade-in"
                            data-testid={`phone-device-${i}`}
                          >
                            <Bluetooth className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium text-[11px]">{dev.name}</p>
                              <p className="text-[9px] text-muted-foreground truncate font-mono">{dev.id}</p>
                            </div>
                            <Badge variant="outline" className="text-[8px]">BLE</Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                )}

                <Button
                  size="sm"
                  variant="default"
                  onClick={runPhoneScan}
                  disabled={webBluetooth.isScanning || !webBluetooth.isSupported}
                  className="w-full"
                  data-testid="button-phone-scan"
                >
                  {webBluetooth.isScanning ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Bluetooth className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {webBluetooth.isScanning ? "Scanning..." : "Scan for Bluetooth Devices"}
                </Button>

                <p className="text-[9px] text-muted-foreground text-center">
                  {devices.length} node{devices.length !== 1 ? "s" : ""} in database
                </p>
              </>
            )}

            {dataSource !== "phone" && !monitoring && (
              <>
                <div className="flex flex-col items-center justify-center py-4 gap-2">
                  {dataSource === "hardware" ? (
                    <>
                      <HardDrive className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-xs text-muted-foreground font-medium">Hardware Mode</p>
                      <p className="text-[10px] text-muted-foreground text-center max-w-[260px]">
                        Data comes from Python collector scripts running on your machine with real hardware (WiFi adapters, Bluetooth, etc.)
                      </p>
                      {collectorStatus?.hasApiKeys ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[8px]">
                            {collectorStatus.activeKeyCount} API Key{collectorStatus.activeKeyCount !== 1 ? "s" : ""}
                          </Badge>
                          {collectorStatus.isReceivingHardwareData && (
                            <Badge variant="outline" className="text-[8px] text-green-500 border-green-500/30">
                              Active
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Link href="/settings">
                          <Button size="sm" variant="outline" className="mt-1 text-[10px]" data-testid="link-setup-keys">
                            <Settings className="w-3 h-3 mr-1" />
                            Set Up API Keys
                          </Button>
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <ScanPulse active={false} size={50} />
                      <p className="text-xs text-muted-foreground font-medium">Simulation Mode</p>
                      <p className="text-[10px] text-muted-foreground text-center max-w-[260px]">
                        Generates realistic simulated signal data for testing and demonstration. No hardware required.
                      </p>
                    </>
                  )}
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
                  {dataSource === "hardware" ? "Start Hardware Monitor" : "Start Simulation"}
                </Button>
              </>
            )}

            {dataSource !== "phone" && monitoring && (
              <Button
                size="sm"
                variant="destructive"
                onClick={stopMonitoring}
                className="w-full"
                data-testid="button-stop-scan-panel"
              >
                <Square className="w-3.5 h-3.5 mr-1.5" />
                Stop Monitoring ({dataSource === "hardware" ? `${devices.length} nodes` : `${totalIntercepted} signals`})
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
