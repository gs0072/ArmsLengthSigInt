import { useState, useCallback } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, RefreshCw, Bluetooth, Radio, Antenna, Wifi, CircuitBoard, Satellite, Thermometer, Radar, Settings, Loader2 } from "lucide-react";
import { isWebBluetoothSupported, scanForBLEDevice, getCurrentPosition } from "@/lib/ble-scanner";
import { Link } from "wouter";
import type { Device, Observation, Alert, CollectionSensor } from "@shared/schema";

export default function Dashboard() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [bleScanning, setBleScanning] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: devices = [], isLoading: devicesLoading } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const { data: observations = [], isLoading: obsLoading } = useQuery<Observation[]>({
    queryKey: ["/api/observations"],
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

  const updateSensorStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/sensors/${id}`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/sensors"] }),
  });

  const activateSensor = useCallback(async (sensor: CollectionSensor) => {
    if (sensor.sensorType === "bluetooth") {
      if (!isWebBluetoothSupported()) {
        toast({
          title: "Bluetooth Not Available",
          description: "Web Bluetooth is not supported in this browser. Use Chrome or Edge.",
          variant: "destructive",
        });
        return;
      }
      updateSensorStatus.mutate({ id: sensor.id, status: "collecting" });
      setBleScanning(true);
      try {
        const bleDevice = await scanForBLEDevice();
        if (!bleDevice) {
          toast({ title: "Scan Cancelled", description: "No node was selected." });
          updateSensorStatus.mutate({ id: sensor.id, status: "idle" });
          setBleScanning(false);
          return;
        }
        const pos = await getCurrentPosition();
        const existingRes = await fetch(`/api/devices/by-mac/${encodeURIComponent(bleDevice.id)}`, { credentials: "include" });
        const existing = await existingRes.json();
        let device: Device;
        if (existing && existing.id) {
          device = existing;
          toast({ title: "Node Found", description: `${bleDevice.name || bleDevice.id} already tracked. Logging new observation.` });
        } else {
          const createRes = await apiRequest("POST", "/api/devices", {
            name: bleDevice.name || `BLE ${bleDevice.id.substring(0, 8)}`,
            macAddress: bleDevice.id,
            signalType: "bluetooth",
            deviceType: "BLE Device",
            notes: `Discovered by sensor: ${sensor.name}`,
          });
          device = await createRes.json();
          toast({ title: "New Node Discovered", description: `${device.name} detected by ${sensor.name}.` });
        }
        const obsBody: Record<string, any> = {
          deviceId: device.id,
          signalType: "bluetooth",
          protocol: "BLE",
        };
        if (pos) {
          obsBody.latitude = pos.lat;
          obsBody.longitude = pos.lng;
          if (pos.alt != null) obsBody.altitude = pos.alt;
        }
        await apiRequest("POST", "/api/observations", obsBody);
        updateSensorStatus.mutate({
          id: sensor.id,
          status: "idle",
        });
        await apiRequest("PATCH", `/api/sensors/${sensor.id}`, {
          nodesCollected: (sensor.nodesCollected || 0) + 1,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/sensors"] });
        setSelectedDeviceId(device.id);
      } catch (err: any) {
        updateSensorStatus.mutate({ id: sensor.id, status: "error" });
        if (err.name !== "NotFoundError") {
          toast({ title: "Scan Error", description: err.message, variant: "destructive" });
        }
      } finally {
        setBleScanning(false);
      }
    } else {
      toast({
        title: "Hardware Required",
        description: `${sensor.name} requires a native companion app for ${sensor.sensorType} collection. Coming soon.`,
      });
    }
  }, [toast, updateSensorStatus, queryClient]);

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
            {sensors.length} Sensors
          </Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {sensors.filter(s => s.sensorType === "bluetooth").length > 0 ? (
            sensors.filter(s => s.sensorType === "bluetooth").map(sensor => (
              <Button
                key={sensor.id}
                size="sm"
                variant={bleScanning ? "destructive" : "default"}
                onClick={() => activateSensor(sensor)}
                disabled={bleScanning}
                data-testid={`button-activate-sensor-${sensor.id}`}
              >
                <Bluetooth className="w-3.5 h-3.5 mr-1" />
                {bleScanning ? "Scanning..." : sensor.name}
              </Button>
            ))
          ) : (
            <Link href="/settings">
              <Button size="sm" variant="outline" data-testid="button-configure-sensors">
                <Settings className="w-3.5 h-3.5 mr-1" />
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
          <Card className="flex flex-col items-center justify-center p-6 text-center overflow-visible gap-4">
            <ScanPulse active={bleScanning} size={60} />
            <div>
              <p className="text-xs text-muted-foreground">Select a node to view details</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {devices.length} node{devices.length !== 1 ? "s" : ""} discovered
              </p>
            </div>
            {sensors.length > 0 ? (
              <div className="flex flex-col gap-2 w-full max-w-[220px]">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Activate Sensor</p>
                {sensors.map(sensor => {
                  const SIcon = sensorTypeIcons[sensor.sensorType] || Radar;
                  const isBleSensor = sensor.sensorType === "bluetooth";
                  return (
                    <Button
                      key={sensor.id}
                      size="sm"
                      variant={isBleSensor ? "default" : "outline"}
                      onClick={() => activateSensor(sensor)}
                      disabled={isBleSensor && bleScanning}
                      data-testid={`button-activate-sensor-panel-${sensor.id}`}
                    >
                      <SIcon className="w-3.5 h-3.5 mr-1" />
                      {isBleSensor && bleScanning ? "Scanning..." : sensor.name}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-2 w-full max-w-[220px]">
                <p className="text-[10px] text-muted-foreground">No sensors configured yet</p>
                <Link href="/settings">
                  <Button size="sm" variant="outline" className="w-full" data-testid="button-goto-settings-panel">
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    Configure Sensors in Settings
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
