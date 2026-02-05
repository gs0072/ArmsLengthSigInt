import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapView } from "@/components/map-view";
import { DeviceDetail } from "@/components/device-detail";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Device, Observation } from "@shared/schema";

export default function WorldMapPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
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

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  return (
    <div className="flex h-full p-3 gap-3">
      <div className="flex-1">
        <MapView
          observations={observations}
          devices={devices}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={setSelectedDeviceId}
          fullscreen={true}
          className="h-full"
        />
      </div>
      {selectedDevice && (
        <div className="w-[350px] flex-shrink-0">
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
  );
}
