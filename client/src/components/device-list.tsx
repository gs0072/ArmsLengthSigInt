import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SignalBadge, SignalStrengthBar } from "./signal-badge";
import { Search, ChevronRight, Eye, EyeOff, Flag, MapPin, Clock, Bluetooth, Wifi, Radio, Antenna, Satellite, Smartphone, Car, Cpu, Headphones, Navigation, Watch, Tag } from "lucide-react";
import type { Device, Observation } from "@shared/schema";
import { timeAgo, NODE_FILTER_CATEGORIES } from "@/lib/signal-utils";

const filterIcons: Record<string, any> = {
  bluetooth: Bluetooth,
  wifi: Wifi,
  phones: Smartphone,
  drones: Navigation,
  vehicles: Car,
  iot: Cpu,
  wearables: Watch,
  trackers: Tag,
  lora: Radio,
  sdr: Antenna,
  adsb: Satellite,
  audio: Headphones,
};

interface DeviceListProps {
  devices: Device[];
  observations: Observation[];
  selectedDeviceId?: number | null;
  onSelectDevice: (id: number) => void;
  isLoading?: boolean;
}

export function DeviceList({ devices, observations, selectedDeviceId, onSelectDevice, isLoading }: DeviceListProps) {
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [filterTracked, setFilterTracked] = useState<string>("all");

  const toggleFilter = (key: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const latestObs = new Map<number, Observation>();
  observations.forEach(obs => {
    const existing = latestObs.get(obs.deviceId);
    if (!existing || new Date(obs.observedAt!) > new Date(existing.observedAt!)) {
      latestObs.set(obs.deviceId, obs);
    }
  });

  const matchesCategory = (device: Device): boolean => {
    if (activeFilters.size === 0) return true;

    const activeFilterKeys = Array.from(activeFilters);

    return activeFilterKeys.some(filterKey => {
      const cat = NODE_FILTER_CATEGORIES.find(c => c.key === filterKey);
      if (!cat) return false;

      if (cat.signalTypes.length > 0 && (cat.signalTypes as readonly string[]).includes(device.signalType)) {
        return true;
      }

      if (cat.deviceTypes.length > 0 && device.deviceType) {
        return cat.deviceTypes.some(dt =>
          device.deviceType!.toLowerCase().includes(dt.toLowerCase()) ||
          dt.toLowerCase().includes(device.deviceType!.toLowerCase())
        );
      }

      return false;
    });
  };

  const filtered = devices.filter(d => {
    const matchSearch = !search ||
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.macAddress?.toLowerCase().includes(search.toLowerCase()) ||
      d.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
      d.model?.toLowerCase().includes(search.toLowerCase()) ||
      d.uuid?.toLowerCase().includes(search.toLowerCase());

    const matchCat = matchesCategory(d);
    const matchTracked = filterTracked === "all" ||
      (filterTracked === "tracked" && d.isTracked) ||
      (filterTracked === "flagged" && d.isFlagged);

    return matchSearch && matchCat && matchTracked;
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
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={filterTracked === "tracked" ? "default" : "outline"}
              onClick={() => setFilterTracked(filterTracked === "tracked" ? "all" : "tracked")}
              data-testid="button-filter-tracked"
              className="toggle-elevate"
            >
              <Eye className="w-3 h-3 mr-1" />
              <span className="text-[10px]">Tracked</span>
            </Button>
            <Button
              size="sm"
              variant={filterTracked === "flagged" ? "default" : "outline"}
              onClick={() => setFilterTracked(filterTracked === "flagged" ? "all" : "flagged")}
              data-testid="button-filter-flagged"
              className="toggle-elevate"
            >
              <Flag className="w-3 h-3 mr-1" />
              <span className="text-[10px]">Flagged</span>
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1" data-testid="node-category-filters">
          {NODE_FILTER_CATEGORIES.map(cat => {
            const IconComp = filterIcons[cat.key] || Cpu;
            const isOn = activeFilters.has(cat.key);
            return (
              <Button
                key={cat.key}
                size="sm"
                variant={isOn ? "default" : "outline"}
                onClick={() => toggleFilter(cat.key)}
                className="toggle-elevate"
                data-testid={`button-filter-${cat.key}`}
              >
                <IconComp className="w-3 h-3 mr-1" />
                <span className="text-[10px]">{cat.label}</span>
              </Button>
            );
          })}
          {activeFilters.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setActiveFilters(new Set())}
              data-testid="button-clear-filters"
            >
              <span className="text-[10px]">Clear All</span>
            </Button>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length} node{filtered.length !== 1 ? "s" : ""} found
          {activeFilters.size > 0 && (
            <span className="ml-1">
              ({activeFilters.size} filter{activeFilters.size !== 1 ? "s" : ""} active)
            </span>
          )}
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
                          {device.deviceType && (
                            <Badge variant="outline" className="text-[8px]">
                              {device.deviceType}
                            </Badge>
                          )}
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
