import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SignalBadge, SignalStrengthBar } from "./signal-badge";
import { Search, Filter, ChevronRight, Eye, EyeOff, Flag, MapPin, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Device, Observation } from "@shared/schema";
import { timeAgo } from "@/lib/signal-utils";

interface DeviceListProps {
  devices: Device[];
  observations: Observation[];
  selectedDeviceId?: number | null;
  onSelectDevice: (id: number) => void;
  isLoading?: boolean;
}

export function DeviceList({ devices, observations, selectedDeviceId, onSelectDevice, isLoading }: DeviceListProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTracked, setFilterTracked] = useState<string>("all");

  const latestObs = new Map<number, Observation>();
  observations.forEach(obs => {
    const existing = latestObs.get(obs.deviceId);
    if (!existing || new Date(obs.observedAt!) > new Date(existing.observedAt!)) {
      latestObs.set(obs.deviceId, obs);
    }
  });

  const filtered = devices.filter(d => {
    const matchSearch = !search ||
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.macAddress?.toLowerCase().includes(search.toLowerCase()) ||
      d.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
      d.model?.toLowerCase().includes(search.toLowerCase()) ||
      d.uuid?.toLowerCase().includes(search.toLowerCase());

    const matchType = filterType === "all" || d.signalType === filterType;
    const matchTracked = filterTracked === "all" ||
      (filterTracked === "tracked" && d.isTracked) ||
      (filterTracked === "flagged" && d.isFlagged);

    return matchSearch && matchType && matchTracked;
  });

  return (
    <Card className="flex flex-col h-full overflow-visible">
      <CardHeader className="flex flex-col gap-2 pb-2 px-3 pt-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search nodes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 text-xs"
              data-testid="input-device-search"
            />
          </div>
          <Button size="icon" variant="ghost" data-testid="button-filter-toggle">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="text-xs flex-1" data-testid="select-signal-filter">
              <SelectValue placeholder="Signal type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Signals</SelectItem>
              <SelectItem value="bluetooth">Bluetooth</SelectItem>
              <SelectItem value="wifi">Wi-Fi</SelectItem>
              <SelectItem value="rfid">RFID</SelectItem>
              <SelectItem value="sdr">SDR</SelectItem>
              <SelectItem value="lora">LoRa</SelectItem>
              <SelectItem value="meshtastic">Meshtastic</SelectItem>
              <SelectItem value="adsb">ADS-B</SelectItem>
              <SelectItem value="sensor">Sensor</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterTracked} onValueChange={setFilterTracked}>
            <SelectTrigger className="text-xs flex-1" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="tracked">Tracked</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length} node{filtered.length !== 1 ? "s" : ""} found
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-2 pb-2 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-1">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-md bg-muted/30 animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs">
                <Search className="w-8 h-8 mb-2 opacity-30" />
                <p>No nodes found</p>
                <p className="text-[10px] mt-1">Adjust your search or filters</p>
              </div>
            ) : (
              filtered.map(device => {
                const obs = latestObs.get(device.id);
                const isSelected = device.id === selectedDeviceId;

                return (
                  <button
                    key={device.id}
                    onClick={() => onSelectDevice(device.id)}
                    className={`relative w-full text-left p-2.5 rounded-md transition-colors ${
                      isSelected ? "bg-primary/10 border border-primary/30" : "hover-elevate"
                    }`}
                    data-testid={`button-device-${device.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">
                            {device.name || "Unknown Node"}
                          </span>
                          {device.isFlagged && (
                            <Flag className="w-3 h-3 text-destructive flex-shrink-0" />
                          )}
                          {device.isTracked && (
                            <Eye className="w-3 h-3 text-primary flex-shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {device.macAddress || device.uuid || device.manufacturer || "No identifier"}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <SignalBadge type={device.signalType} size="sm" />
                          {obs && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {timeAgo(obs.observedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <SignalStrengthBar strength={obs?.signalStrength} />
                        {obs?.latitude && (
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
