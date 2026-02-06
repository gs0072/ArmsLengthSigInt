import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { StatsBar } from "@/components/stats-bar";
import { MapView } from "@/components/map-view";
import { DeviceList } from "@/components/device-list";
import { DeviceDetail } from "@/components/device-detail";
import { ScanPulse, GlowLine } from "@/components/scan-animation";
import { AddDeviceDialog } from "@/components/add-device-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, RefreshCw, Bluetooth, Plus } from "lucide-react";
import { isWebBluetoothSupported, scanForBLEDevice, getCurrentPosition } from "@/lib/ble-scanner";
import type { Device, Observation, Alert } from "@shared/schema";

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

  const bleScan = useCallback(async () => {
    if (!isWebBluetoothSupported()) {
      toast({
        title: "Bluetooth Not Available",
        description: "Web Bluetooth is not supported in this browser. Use Chrome or Edge on desktop, or Chrome on Android.",
        variant: "destructive",
      });
      return;
    }

    setBleScanning(true);
    try {
      const bleDevice = await scanForBLEDevice();
      if (!bleDevice) {
        toast({ title: "Scan Cancelled", description: "No device was selected." });
        setBleScanning(false);
        return;
      }

      const pos = await getCurrentPosition();

      const existingRes = await fetch(`/api/devices/by-mac/${encodeURIComponent(bleDevice.id)}`, { credentials: "include" });
      const existing = await existingRes.json();

      let device: Device;
      if (existing && existing.id) {
        device = existing;
        toast({ title: "Device Found", description: `${bleDevice.name || bleDevice.id} already in your collection. Logging new observation.` });
      } else {
        const createRes = await apiRequest("POST", "/api/devices", {
          name: bleDevice.name || `BLE ${bleDevice.id.substring(0, 8)}`,
          macAddress: bleDevice.id,
          signalType: "bluetooth",
          deviceType: "BLE Device",
          notes: `Discovered via Web Bluetooth scan`,
        });
        device = await createRes.json();
        toast({ title: "New Device Discovered", description: `${device.name} added to your collection.` });
      }

      const obsBody: Record<string, any> = {
        deviceId: device.id,
        signalType: "bluetooth",
        protocol: "BLE",
      };
      if (bleDevice.rssi != null) obsBody.signalStrength = bleDevice.rssi;
      if (pos) {
        obsBody.latitude = pos.lat;
        obsBody.longitude = pos.lng;
        if (pos.alt != null) obsBody.altitude = pos.alt;
      }
      await apiRequest("POST", "/api/observations", obsBody);

      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      setSelectedDeviceId(device.id);
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        toast({ title: "Scan Error", description: err.message, variant: "destructive" });
      }
    } finally {
      setBleScanning(false);
    }
  }, [toast, queryClient]);

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
            {devices.length} Devices
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={bleScanning ? "destructive" : "default"}
            onClick={bleScan}
            disabled={bleScanning}
            data-testid="button-ble-scan"
          >
            <Bluetooth className="w-3.5 h-3.5 mr-1" />
            {bleScanning ? "Scanning..." : "BLE Scan"}
          </Button>
          <AddDeviceDialog />
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
              <p className="text-xs text-muted-foreground">Select a device to view details</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {devices.length} device{devices.length !== 1 ? "s" : ""} in collection
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[200px]">
              <Button size="sm" onClick={bleScan} disabled={bleScanning} data-testid="button-ble-scan-panel">
                <Bluetooth className="w-3.5 h-3.5 mr-1" />
                Scan Bluetooth
              </Button>
              <AddDeviceDialog
                trigger={
                  <Button size="sm" variant="outline" data-testid="button-add-device-panel">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add Device Manually
                  </Button>
                }
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
