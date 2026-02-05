import { useState } from "react";
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
import { Play, Pause, RefreshCw, Clock } from "lucide-react";
import type { Device, Observation, Alert } from "@shared/schema";

export default function Dashboard() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const queryClient = useQueryClient();

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
            {scanning ? "Scanning" : "Idle"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={scanning ? "destructive" : "default"}
            onClick={() => setScanning(!scanning)}
            data-testid="button-toggle-scan"
          >
            {scanning ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            {scanning ? "Stop Scan" : "Start Scan"}
          </Button>
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

      <div className={`grid gap-3 flex-1 min-h-0 ${mapFullscreen ? "" : "lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_350px]"}`}>
        <div className="flex flex-col gap-3 min-h-0">
          <MapView
            observations={observations}
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onSelectDevice={setSelectedDeviceId}
            fullscreen={mapFullscreen}
            onToggleFullscreen={() => setMapFullscreen(!mapFullscreen)}
          />

          {!mapFullscreen && (
            <div className="flex-1 min-h-[300px]">
              <DeviceList
                devices={devices}
                observations={observations}
                selectedDeviceId={selectedDeviceId}
                onSelectDevice={setSelectedDeviceId}
                isLoading={devicesLoading}
              />
            </div>
          )}
        </div>

        {!mapFullscreen && selectedDevice && (
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

        {!mapFullscreen && !selectedDevice && (
          <Card className="flex flex-col items-center justify-center p-6 text-center overflow-visible">
            <ScanPulse active={scanning} size={60} />
            <p className="text-xs text-muted-foreground mt-4">Select a device to view details</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {devices.length} device{devices.length !== 1 ? "s" : ""} in collection
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
