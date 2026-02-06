import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SignalBadge, SignalStrengthBar } from "@/components/signal-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, Filter, MapPin, Clock, Fingerprint, Binary, Type, Radio, Bell, X, Info, BookOpen } from "lucide-react";
import type { Device, Observation } from "@shared/schema";
import { timeAgo, formatCoordinates, getSignalLabel, DEVICE_BROADCAST_SIGNATURES } from "@/lib/signal-utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState("name");
  const [signalFilter, setSignalFilter] = useState("all");
  const [catalogItem, setCatalogItem] = useState<string | null>(null);
  const [catalogTerms, setCatalogTerms] = useState<string[]>([]);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const catalog = params.get("catalog");
    const terms = params.get("terms");
    const signal = params.get("signal");

    if (catalog && terms) {
      setCatalogItem(catalog);
      const termList = decodeURIComponent(terms).split("|");
      setCatalogTerms(termList);
      setSearchTerm(catalog);
      setSearchMode("name");
      if (signal) setSignalFilter(signal);
    } else if (q) {
      setSearchTerm(q);
      setCatalogItem(null);
      setCatalogTerms([]);
    }
  }, []);

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: observations = [] } = useQuery<Observation[]>({ queryKey: ["/api/observations"] });

  const latestObs = useMemo(() => {
    const map = new Map<number, Observation>();
    observations.forEach(obs => {
      const existing = map.get(obs.deviceId);
      if (!existing || new Date(obs.observedAt!) > new Date(existing.observedAt!)) {
        map.set(obs.deviceId, obs);
      }
    });
    return map;
  }, [observations]);

  const isCatalogSearch = catalogItem && catalogTerms.length > 0;

  const results = useMemo(() => {
    if (!searchTerm && !isCatalogSearch) return [];

    return devices.filter(d => {
      const signalMatch = signalFilter === "all" || d.signalType === signalFilter;
      if (!signalMatch) return false;

      if (isCatalogSearch) {
        const searchFields = [
          d.name?.toLowerCase(),
          d.manufacturer?.toLowerCase(),
          d.model?.toLowerCase(),
          d.deviceType?.toLowerCase(),
        ].filter(Boolean) as string[];

        return catalogTerms.some(term => {
          const t = term.toLowerCase();
          return searchFields.some(field => field.includes(t));
        });
      }

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
    });
  }, [devices, observations, searchTerm, searchMode, signalFilter, isCatalogSearch, catalogTerms]);

  const clearCatalogSearch = () => {
    setCatalogItem(null);
    setCatalogTerms([]);
    setSearchTerm("");
    setSignalFilter("all");
    window.history.replaceState({}, "", "/search");
  };

  const createAlertMutation = useMutation({
    mutationFn: async () => {
      if (!catalogItem) return;
      const sig = DEVICE_BROADCAST_SIGNATURES[catalogItem];
      const res = await apiRequest("POST", "/api/alerts", {
        name: `${catalogItem} Detection Alert`,
        description: `Alert when ${catalogItem} devices are detected. Monitors for ${catalogTerms.length} known broadcast signatures.`,
        alertType: "device_detected",
        criteria: {
          type: "catalog_broadcast_match",
          catalogItem,
          terms: catalogTerms,
          signalTypes: sig?.signalTypes || ["bluetooth"],
          matchMode: "any",
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert Created", description: `Detection alert for ${catalogItem} has been created.` });
      setAlertDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create alert.", variant: "destructive" });
    },
  });

  const catalogSig = catalogItem ? DEVICE_BROADCAST_SIGNATURES[catalogItem] : null;

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Search & Query</h2>
      </div>

      <Card className="overflow-visible">
        <CardContent className="p-3 space-y-3">
          {isCatalogSearch && (
            <div className="p-2.5 rounded-md bg-primary/5 border border-primary/20">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium">Catalog Search: {catalogItem}</span>
                  {catalogSig && (
                    <Badge variant="outline" className="text-[8px]">{catalogTerms.length} broadcast signatures</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setAlertDialogOpen(true)}
                    data-testid="button-create-alert-from-search"
                  >
                    <Bell className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={clearCatalogSearch}
                    data-testid="button-clear-catalog-search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {catalogSig && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">{catalogSig.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {catalogSig.signalTypes.map(st => (
                      <Badge key={st} variant="secondary" className="text-[8px]">
                        <Radio className="w-2 h-2 mr-0.5" />{st}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                    {catalogTerms.slice(0, 20).map(t => (
                      <Badge key={t} variant="outline" className="text-[8px] font-mono">{t}</Badge>
                    ))}
                    {catalogTerms.length > 20 && (
                      <Badge variant="outline" className="text-[8px]">+{catalogTerms.length - 20} more</Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isCatalogSearch ? `Searching ${catalogTerms.length} broadcast signatures...` : "Enter search query..."}
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  if (isCatalogSearch && e.target.value !== catalogItem) {
                    setCatalogItem(null);
                    setCatalogTerms([]);
                  }
                }}
                className="pl-9"
                data-testid="input-search-query"
              />
            </div>
            {!isCatalogSearch && (
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
            )}
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

          {(searchTerm || isCatalogSearch) && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
              {isCatalogSearch && (
                <span>matching {catalogItem} broadcast signatures</span>
              )}
              {!isCatalogSearch && searchTerm && (
                <span>for "{searchTerm}" in {searchMode} mode</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex-1 min-h-0">
        <Card className="h-full flex flex-col overflow-visible">
          <CardContent className="flex-1 p-3 overflow-hidden">
            <ScrollArea className="h-full">
              {!searchTerm && !isCatalogSearch ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Search className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm mb-1">Enter a search query</p>
                  <p className="text-xs text-center max-w-sm">
                    Search by device name, MAC address, hex patterns, ASCII data, or raw signal data.
                    Use the Device Catalog to search by broadcast signatures.
                  </p>
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Search className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm mb-1">No results found</p>
                  <p className="text-xs text-center max-w-sm">
                    {isCatalogSearch
                      ? `No nodes matching ${catalogItem} broadcast signatures were detected. Create an alert to be notified when they appear.`
                      : "Try a different search term or adjust your filters"
                    }
                  </p>
                  {isCatalogSearch && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setAlertDialogOpen(true)}
                      data-testid="button-create-alert-no-results"
                    >
                      <Bell className="w-3.5 h-3.5 mr-1.5" />
                      Create Detection Alert
                    </Button>
                  )}
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
                              {isCatalogSearch && (
                                <Badge variant="outline" className="text-[8px] text-primary border-primary/30">
                                  {catalogItem} match
                                </Badge>
                              )}
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

      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Create Detection Alert
            </DialogTitle>
            <DialogDescription>
              Set up an alert for {catalogItem} device detection.
            </DialogDescription>
          </DialogHeader>
          {catalogItem && (
            <div className="space-y-3">
              <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                <div className="text-sm font-medium mb-1">{catalogItem}</div>
                {catalogSig && (
                  <>
                    <p className="text-[10px] text-muted-foreground mb-2">{catalogSig.description}</p>
                    <div className="flex items-center gap-1 mb-2 flex-wrap">
                      {catalogSig.signalTypes.map(st => (
                        <Badge key={st} variant="secondary" className="text-[8px]">{st}</Badge>
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Monitoring {catalogTerms.length} known broadcast signatures
                    </div>
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                You will be alerted when any node matching these broadcast signatures is detected by your sensors.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlertDialogOpen(false)} data-testid="button-cancel-search-alert">
              Cancel
            </Button>
            <Button
              onClick={() => createAlertMutation.mutate()}
              disabled={createAlertMutation.isPending || !catalogItem}
              data-testid="button-confirm-search-alert"
            >
              {createAlertMutation.isPending ? "Creating..." : "Create Alert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
