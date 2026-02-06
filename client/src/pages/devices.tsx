import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DeviceList } from "@/components/device-list";
import { DeviceDetail } from "@/components/device-detail";
import { AddDeviceDialog } from "@/components/add-device-dialog";
import { Button } from "@/components/ui/button";
import { Bluetooth } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isWebBluetoothSupported, scanForBLEDevice, getCurrentPosition } from "@/lib/ble-scanner";
import type { Device, Observation } from "@shared/schema";

export default function DevicesPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [bleScanning, setBleScanning] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: devices = [], isLoading } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: observations = [] } = useQuery<Observation[]>({ queryKey: ["/api/observations"] });

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

  const bleScan = async () => {
    if (!isWebBluetoothSupported()) {
      toast({ title: "Bluetooth Not Available", description: "Use Chrome or Edge on desktop, or Chrome on Android.", variant: "destructive" });
      return;
    }
    setBleScanning(true);
    try {
      const bleDevice = await scanForBLEDevice();
      if (!bleDevice) { setBleScanning(false); return; }
      const pos = await getCurrentPosition();
      const existingRes = await fetch(`/api/devices/by-mac/${encodeURIComponent(bleDevice.id)}`, { credentials: "include" });
      const existing = await existingRes.json();
      let device: Device;
      if (existing && existing.id) {
        device = existing;
      } else {
        const createRes = await apiRequest("POST", "/api/devices", {
          name: bleDevice.name || `BLE ${bleDevice.id.substring(0, 8)}`,
          macAddress: bleDevice.id,
          signalType: "bluetooth",
          deviceType: "BLE Device",
        });
        device = await createRes.json();
        toast({ title: "Device Discovered", description: `${device.name} added.` });
      }
      const obsBody: Record<string, any> = { deviceId: device.id, signalType: "bluetooth", protocol: "BLE" };
      if (pos) { obsBody.latitude = pos.lat; obsBody.longitude = pos.lng; if (pos.alt != null) obsBody.altitude = pos.alt; }
      await apiRequest("POST", "/api/observations", obsBody);
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      setSelectedDeviceId(device.id);
    } catch (err: any) {
      if (err.name !== "NotFoundError") toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBleScanning(false);
    }
  };

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wider" data-testid="text-devices-title">Device Collection</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={bleScan} disabled={bleScanning} data-testid="button-ble-scan-devices">
            <Bluetooth className="w-3.5 h-3.5 mr-1" />
            {bleScanning ? "Scanning..." : "BLE Scan"}
          </Button>
          <AddDeviceDialog />
        </div>
      </div>
      <div className="flex flex-1 gap-3 min-h-0">
        <div className="flex-1 min-w-0">
          <DeviceList
            devices={devices}
            observations={observations}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            isLoading={isLoading}
          />
        </div>
        {selectedDevice && (
          <div className="w-[380px] flex-shrink-0">
            <DeviceDetail
              device={selectedDevice}
              observations={observations}
              onClose={() => setSelectedDeviceId(null)}
              onToggleTrack={id => toggleTrack.mutate(id)}
              onToggleFlag={id => toggleFlag.mutate(id)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
