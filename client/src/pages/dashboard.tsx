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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useWebBluetooth, type ScannedBluetoothDevice } from "@/hooks/use-web-bluetooth";
import {
  Bluetooth, Radio, Antenna, Wifi, CircuitBoard, Satellite,
  Thermometer, Radar, RefreshCw, Square, MapPin, Loader2,
  Smartphone, Monitor, CheckCircle2, XCircle, Server
} from "lucide-react";
import type { Device, Observation, Alert, CollectionSensor, UserProfile } from "@shared/schema";

interface ScannerStatus {
  bleAvailable: boolean;
  bleScanning: boolean;
  wifiAvailable: boolean;
  wifiMonitorMode: boolean;
  sdrAvailable: boolean;
  gpsAvailable: boolean;
  gpsPosition: GPSPosition | null;
  lastScanTime: number | null;
  totalDevicesFound: number;
  scanCount: number;
}

interface GPSPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface BLEScanEntry {
  name: string;
  bleId: string;
  rssi: number | null;
  savedDeviceId: number | null;
  timestamp: number;
}

export default function Dashboard() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [monitoring, setMonitoring] = useState(false);
  const [monitorStartTime, setMonitorStartTime] = useState<number | null>(null);
  const [gpsPosition, setGpsPosition] = useState<GPSPosition | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [bleScanLog, setBleScanLog] = useState<BLEScanEntry[]>([]);
  const [savingDevice, setSavingDevice] = useState(false);
  const gpsWatchRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const webBluetooth = useWebBluetooth();

  const hasWebBluetooth = webBluetooth.isSupported;
  const hasGPS = typeof navigator !== "undefined" && "geolocation" in navigator;
  const isMobileDevice = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const developerMode = (profile?.settings as any)?.developerMode === true;

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

  const { data: scannerStatus } = useQuery<ScannerStatus>({
    queryKey: ["/api/scanner/status"],
    refetchInterval: monitoring ? 5000 : false,
  });

  const linuxScannerHasHardware = scannerStatus?.bleAvailable || scannerStatus?.wifiAvailable || scannerStatus?.sdrAvailable;

  const startLinuxScannerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scanner/start");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/scanner/status"] }),
  });

  const stopLinuxScannerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scanner/stop");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/scanner/status"] }),
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

  const startGPSTracking = useCallback(() => {
    if (!hasGPS) return;
    setGpsLoading(true);
    setGpsError(null);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setGpsPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
    gpsWatchRef.current = watchId;
  }, [hasGPS]);

  const stopGPSTracking = useCallback(() => {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
  }, []);

  const saveDeviceToBackend = useCallback(async (bleDevice: ScannedBluetoothDevice) => {
    setSavingDevice(true);
    try {
      const macPlaceholder = `BLE:${bleDevice.id.substring(0, 17).toUpperCase()}`;

      const deviceData: any = {
        name: bleDevice.name,
        macAddress: macPlaceholder,
        signalType: "bluetooth",
        deviceType: "BLE Device",
        manufacturer: "Unknown",
        notes: `Discovered via Web Bluetooth scan. BLE ID: ${bleDevice.id}. Services: ${bleDevice.services.length > 0 ? bleDevice.services.join(", ") : "None detected"}.`,
      };

      const res = await apiRequest("POST", "/api/devices", deviceData);
      const savedDevice = await res.json();

      const obsData: any = {
        deviceId: savedDevice.id,
        signalType: "bluetooth",
        signalStrength: bleDevice.rssi ?? -70,
        protocol: "BLE",
        encryption: "Unknown",
      };

      if (gpsPosition) {
        obsData.latitude = gpsPosition.latitude;
        obsData.longitude = gpsPosition.longitude;
      }

      await apiRequest("POST", "/api/observations", obsData);

      setBleScanLog(prev => [{
        name: bleDevice.name,
        bleId: bleDevice.id,
        rssi: bleDevice.rssi,
        savedDeviceId: savedDevice.id,
        timestamp: Date.now(),
      }, ...prev].slice(0, 50));

      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });

      toast({
        title: "Device Saved",
        description: `${bleDevice.name} added to your node database${gpsPosition ? " with GPS location" : ""}.`,
      });

      return savedDevice.id;
    } catch (err: any) {
      if (err?.message?.includes("duplicate") || err?.message?.includes("already exists")) {
        toast({
          title: "Device Already Exists",
          description: `${bleDevice.name} is already in your database.`,
        });
      } else {
        toast({
          title: "Save Failed",
          description: err.message || "Could not save the device.",
          variant: "destructive",
        });
      }
      return null;
    } finally {
      setSavingDevice(false);
    }
  }, [gpsPosition, queryClient, toast]);

  const handleBLEScan = useCallback(async () => {
    const device = await webBluetooth.scanForDevices();
    if (device) {
      await saveDeviceToBackend(device);
    }
  }, [webBluetooth, saveDeviceToBackend]);

  const startMonitoring = useCallback(() => {
    setMonitoring(true);
    setMonitorStartTime(Date.now());

    startGPSTracking();

    if (linuxScannerHasHardware) {
      startLinuxScannerMutation.mutate();
    }

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "collecting" });
    }

    const capabilities: string[] = [];
    if (hasWebBluetooth) capabilities.push("Web BLE");
    if (linuxScannerHasHardware) capabilities.push("Linux Scanner");
    if (activeSensors.length > 0) capabilities.push(`${activeSensors.length} sensor${activeSensors.length !== 1 ? "s" : ""}`);

    toast({
      title: "Monitoring Active",
      description: capabilities.length > 0
        ? `Active: ${capabilities.join(", ")}. GPS tracking enabled.`
        : "GPS tracking enabled. Use 'Scan BLE' to discover nearby devices.",
    });
  }, [activeSensors, toast, updateSensorStatus, startGPSTracking, hasWebBluetooth, linuxScannerHasHardware, startLinuxScannerMutation]);

  const stopMonitoring = useCallback(() => {
    setMonitoring(false);
    stopGPSTracking();

    if (linuxScannerHasHardware) {
      stopLinuxScannerMutation.mutate();
    }

    for (const sensor of activeSensors) {
      updateSensorStatus.mutate({ id: sensor.id, status: "idle" });
    }

    const elapsed = monitorStartTime ? Math.round((Date.now() - monitorStartTime) / 1000) : 0;
    toast({
      title: "Monitoring Stopped",
      description: `Session ran for ${elapsed}s. ${bleScanLog.length} BLE device${bleScanLog.length !== 1 ? "s" : ""} discovered. ${scannerStatus?.totalDevicesFound || 0} via Linux scanner.`,
    });
  }, [activeSensors, monitorStartTime, bleScanLog.length, toast, updateSensorStatus, stopGPSTracking, linuxScannerHasHardware, stopLinuxScannerMutation, scannerStatus]);

  useEffect(() => {
    return () => {
      stopGPSTracking();
    };
  }, [stopGPSTracking]);

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
          {hasWebBluetooth && (
            <Badge variant="outline" className="text-[9px] uppercase">
              <Bluetooth className="w-2.5 h-2.5 mr-1" />
              BLE Ready
            </Badge>
          )}
          {sensors.length > 0 && (
            <Badge variant="outline" className="text-[9px] uppercase">
              {activeSensors.length} / {sensors.length} Sensors
            </Badge>
          )}
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
              Stop
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
          {monitoring && hasWebBluetooth && (
            <Button
              size="sm"
              variant="default"
              onClick={handleBLEScan}
              disabled={webBluetooth.isScanning || savingDevice}
              data-testid="button-ble-scan"
            >
              {webBluetooth.isScanning || savingDevice ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Bluetooth className="w-3.5 h-3.5 mr-1.5" />
              )}
              Scan BLE
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
                {monitoring ? "Monitoring Active" : "Device Scanner"}
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
                <div className="flex items-center gap-2 p-2 rounded-md border border-border/30 text-xs">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    {gpsLoading && <span className="text-muted-foreground">Acquiring GPS...</span>}
                    {gpsError && <span className="text-destructive truncate">GPS: {gpsError}</span>}
                    {gpsPosition && !gpsLoading && (
                      <span className="text-muted-foreground font-mono text-[10px] truncate">
                        {gpsPosition.latitude.toFixed(6)}, {gpsPosition.longitude.toFixed(6)}
                        <span className="ml-1 opacity-60">({Math.round(gpsPosition.accuracy)}m)</span>
                      </span>
                    )}
                    {!gpsPosition && !gpsLoading && !gpsError && (
                      <span className="text-muted-foreground">GPS not available</span>
                    )}
                  </div>
                  {gpsPosition && (
                    <Badge variant="outline" className="text-[7px] uppercase shrink-0">
                      <CheckCircle2 className="w-2 h-2 mr-0.5" /> Fix
                    </Badge>
                  )}
                </div>

                {linuxScannerHasHardware && scannerStatus && (
                  <div className="flex items-center gap-2 p-2 rounded-md border border-border/30 text-xs">
                    <Server className="w-3.5 h-3.5 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <span className="text-muted-foreground text-[10px]">
                        Linux Scanner: {scannerStatus.scanCount > 0 ? `${scannerStatus.scanCount} cycles` : "starting..."}
                        {scannerStatus.totalDevicesFound > 0 && ` / ${scannerStatus.totalDevicesFound} found`}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {scannerStatus.bleAvailable && (
                        <Badge variant="outline" className="text-[7px] uppercase">BLE</Badge>
                      )}
                      {scannerStatus.wifiAvailable && (
                        <Badge variant="outline" className="text-[7px] uppercase">WiFi</Badge>
                      )}
                      {scannerStatus.sdrAvailable && (
                        <Badge variant="outline" className="text-[7px] uppercase">SDR</Badge>
                      )}
                    </div>
                  </div>
                )}

                {hasWebBluetooth && (
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleBLEScan}
                      disabled={webBluetooth.isScanning || savingDevice}
                      className="w-full"
                      data-testid="button-ble-scan-panel"
                    >
                      {webBluetooth.isScanning || savingDevice ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Bluetooth className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      {webBluetooth.isScanning ? "Scanning..." : savingDevice ? "Saving..." : "Scan for BLE Devices"}
                    </Button>

                    {webBluetooth.error && (
                      <p className="text-[10px] text-destructive">{webBluetooth.error}</p>
                    )}

                    <p className="text-[9px] text-muted-foreground text-center">
                      Your browser will show a device picker. Select a device to add it to your database{gpsPosition ? " with GPS location" : ""}.
                    </p>
                  </div>
                )}

                {!hasWebBluetooth && (
                  <div className="flex flex-col items-center py-2 gap-1">
                    <p className="text-[10px] text-muted-foreground text-center">
                      Web Bluetooth is not available in this browser. Use Chrome on Android for direct BLE scanning, or connect external sensors.
                    </p>
                  </div>
                )}

                {bleScanLog.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                      Discovered ({bleScanLog.length})
                    </p>
                    <ScrollArea className="max-h-[200px]">
                      <div className="flex flex-col gap-1" data-testid="ble-scan-log">
                        {bleScanLog.map((entry, i) => (
                          <div
                            key={`${entry.bleId}-${i}`}
                            className="flex items-center gap-2 p-2 rounded-md border border-primary/30 bg-primary/5 text-xs cursor-pointer animate-in fade-in slide-in-from-top-1 duration-300"
                            onClick={() => entry.savedDeviceId && setSelectedDeviceId(entry.savedDeviceId)}
                            data-testid={`ble-discovered-${i}`}
                          >
                            <Bluetooth className="w-3 h-3 shrink-0" style={{ color: sensorTypeColors.bluetooth }} />
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium text-[11px]">{entry.name}</p>
                              <p className="text-[9px] text-muted-foreground truncate font-mono">{entry.bleId}</p>
                            </div>
                            {entry.rssi !== null && (
                              <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: sensorTypeColors.bluetooth }}>
                                {entry.rssi} dBm
                              </span>
                            )}
                            <Badge variant="outline" className="text-[7px] uppercase shrink-0">Saved</Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {sensors.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sensors</p>
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
                  <p className="text-xs text-muted-foreground font-medium">Ready to Scan</p>
                  <p className="text-[10px] text-muted-foreground text-center max-w-[260px]">
                    {hasWebBluetooth
                      ? "Start monitoring to scan for nearby Bluetooth devices using your phone's hardware. Detected devices are saved with GPS location."
                      : "Start monitoring to activate sensors and collect real wireless signals from nearby devices."
                    }
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {devices.length} node{devices.length !== 1 ? "s" : ""} in database
                  </p>
                </div>

                {developerMode && (
                  <div className="flex flex-col gap-2 p-3 rounded-md border border-border/30 bg-muted/5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Hardware Capabilities</p>
                    <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                      <div className="flex items-center gap-1.5">
                        {hasWebBluetooth ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-destructive" />
                        )}
                        <span className="text-muted-foreground">Web Bluetooth</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasGPS ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        ) : (
                          <XCircle className="w-3 h-3 text-destructive" />
                        )}
                        <span className="text-muted-foreground">GPS / Location</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isMobileDevice ? (
                          <Smartphone className="w-3 h-3 text-primary" />
                        ) : (
                          <Monitor className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className="text-muted-foreground">{isMobileDevice ? "Mobile" : "Desktop"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Bluetooth className="w-3 h-3" style={{ color: sensorTypeColors.bluetooth }} />
                        <span className="text-muted-foreground">{webBluetooth.devices.length} scanned</span>
                      </div>
                    </div>
                  </div>
                )}

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
