import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DeviceList } from "@/components/device-list";
import { DeviceDetail } from "@/components/device-detail";
import { Badge } from "@/components/ui/badge";
import type { Device, Observation } from "@shared/schema";

export default function DevicesPage() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const queryClient = useQueryClient();

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

  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" data-testid="text-devices-title">Node Collection</h2>
          <Badge variant="outline" className="text-[9px] uppercase">
            {devices.length} Nodes
          </Badge>
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
