import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SignalBadge, SignalStrengthBar } from "@/components/signal-badge";
import { GlowLine } from "@/components/scan-animation";
import { Search, Filter, MapPin, Clock, Fingerprint, Binary, Type, Radio } from "lucide-react";
import type { Device, Observation } from "@shared/schema";
import { timeAgo, formatCoordinates, getSignalLabel } from "@/lib/signal-utils";

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState("name");
  const [signalFilter, setSignalFilter] = useState("all");

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: observations = [] } = useQuery<Observation[]>({ queryKey: ["/api/observations"] });

  const latestObs = new Map<number, Observation>();
  observations.forEach(obs => {
    const existing = latestObs.get(obs.deviceId);
    if (!existing || new Date(obs.observedAt!) > new Date(existing.observedAt!)) {
      latestObs.set(obs.deviceId, obs);
    }
  });

  const results = searchTerm ? devices.filter(d => {
    const signalMatch = signalFilter === "all" || d.signalType === signalFilter;
    if (!signalMatch) return false;

    const term = searchTerm.toLowerCase();
    switch (searchMode) {
      case "name":
        return d.name?.toLowerCase().includes(term) || d.manufacturer?.toLowerCase().includes(term) || d.model?.toLowerCase().includes(term);
      case "identifier":
        return d.macAddress?.toLowerCase().includes(term) || d.uuid?.toLowerCase().includes(term);
      case "hex": {
        const deviceObs = observations.filter(o => o.deviceId === d.id);
        return deviceObs.some(o => o.hexData?.toLowerCase().includes(term));
      }
      case "ascii": {
        const deviceObs = observations.filter(o => o.deviceId === d.id);
        return deviceObs.some(o => o.asciiData?.toLowerCase().includes(term));
      }
      case "raw": {
        const deviceObs = observations.filter(o => o.deviceId === d.id);
        return deviceObs.some(o => o.rawData?.toLowerCase().includes(term));
      }
      default:
        return true;
    }
  }) : [];

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Search & Query</h2>
      </div>

      <Card className="overflow-visible">
        <CardContent className="p-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Enter search query..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-query"
              />
            </div>
            <Select value={searchMode} onValueChange={setSearchMode}>
              <SelectTrigger className="w-[160px]" data-testid="select-search-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">
                  <span className="flex items-center gap-1.5"><Type className="w-3.5 h-3.5" /> Name / Model</span>
                </SelectItem>
                <SelectItem value="identifier">
                  <span className="flex items-center gap-1.5"><Fingerprint className="w-3.5 h-3.5" /> MAC / UUID</span>
                </SelectItem>
                <SelectItem value="hex">
                  <span className="flex items-center gap-1.5"><Binary className="w-3.5 h-3.5" /> Hex Data</span>
                </SelectItem>
                <SelectItem value="ascii">
                  <span className="flex items-center gap-1.5"><Type className="w-3.5 h-3.5" /> ASCII Data</span>
                </SelectItem>
                <SelectItem value="raw">
                  <span className="flex items-center gap-1.5"><Radio className="w-3.5 h-3.5" /> Raw Data</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={signalFilter} onValueChange={setSignalFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-search-signal-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Signals</SelectItem>
                <SelectItem value="bluetooth">Bluetooth</SelectItem>
                <SelectItem value="wifi">Wi-Fi</SelectItem>
                <SelectItem value="rfid">RFID</SelectItem>
                <SelectItem value="sdr">SDR</SelectItem>
                <SelectItem value="lora">LoRa</SelectItem>
                <SelectItem value="adsb">ADS-B</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {searchTerm && (
            <div className="text-xs text-muted-foreground">
              {results.length} result{results.length !== 1 ? "s" : ""} for "{searchTerm}" in {searchMode} mode
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex-1 min-h-0">
        <Card className="h-full flex flex-col overflow-visible">
          <CardContent className="flex-1 p-3 overflow-hidden">
            <ScrollArea className="h-full">
              {!searchTerm ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Search className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm mb-1">Enter a search query</p>
                  <p className="text-xs text-center max-w-sm">
                    Search by device name, MAC address, hex patterns, ASCII data, or raw signal data
                  </p>
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Search className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm mb-1">No results found</p>
                  <p className="text-xs text-center max-w-sm">
                    Try a different search term or adjust your filters
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {results.map(device => {
                    const obs = latestObs.get(device.id);
                    return (
                      <div
                        key={device.id}
                        className="p-3 rounded-md hover-elevate cursor-pointer"
                        data-testid={`search-result-${device.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium">{device.name || "Unknown"}</span>
                              <SignalBadge type={device.signalType} size="sm" />
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {device.macAddress || device.uuid || "No identifier"}
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                              {device.manufacturer && <span>{device.manufacturer}</span>}
                              {device.model && <span>{device.model}</span>}
                              {obs?.latitude && (
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {formatCoordinates(obs.latitude, obs.longitude)}
                                </span>
                              )}
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {timeAgo(device.lastSeenAt)}
                              </span>
                            </div>
                          </div>
                          <SignalStrengthBar strength={obs?.signalStrength} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
