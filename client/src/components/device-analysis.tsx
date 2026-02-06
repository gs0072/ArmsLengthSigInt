import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlowLine } from "./scan-animation";
import { SignalBadge, SignalStrengthBar } from "./signal-badge";
import {
  X, Brain, MapPin, Clock, Radio, Fingerprint, Shield, Globe,
  Activity, Table2, Loader2, AlertTriangle, Crosshair, Zap
} from "lucide-react";
import type { Device, Observation } from "@shared/schema";
import { getSignalColor, getSignalLabel, timeAgo, formatCoordinates, formatFrequency } from "@/lib/signal-utils";

interface DeviceAnalysisProps {
  device: Device;
  observations: Observation[];
  onClose: () => void;
}

export function DeviceAnalysis({ device, observations, onClose }: DeviceAnalysisProps) {
  const [aiReport, setAiReport] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  const deviceObs = observations
    .filter(o => o.deviceId === device.id)
    .sort((a, b) => new Date(b.observedAt!).getTime() - new Date(a.observedAt!).getTime());

  const obsWithLocation = deviceObs.filter(o => o.latitude && o.longitude);

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setAiReport("");
    setAnalysisError(null);

    try {
      const response = await fetch(`/api/devices/${device.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) throw new Error("Analysis request failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.content) {
              setAiReport(prev => prev + event.content);
            }
            if (event.error) {
              setAnalysisError(event.error);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setAnalysisError(err.message || "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, [device.id]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || obsWithLocation.length === 0) return;

    const loadMap = async () => {
      const L = await import("leaflet");
      leafletRef.current = L;

      const map = L.map(mapRef.current!, {
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      const signalColor = getSignalColor(device.signalType);
      const points: [number, number][] = [];

      obsWithLocation.forEach((obs, i) => {
        const lat = obs.latitude!;
        const lng = obs.longitude!;
        points.push([lat, lng]);

        const isLatest = i === 0;
        const marker = L.circleMarker([lat, lng], {
          radius: isLatest ? 8 : 5,
          color: signalColor,
          fillColor: signalColor,
          fillOpacity: isLatest ? 0.9 : 0.5,
          weight: isLatest ? 2 : 1,
        }).addTo(map);

        marker.bindPopup(`
          <div style="font-family: monospace; font-size: 11px;">
            <strong>${isLatest ? "LATEST" : `#${i + 1}`}</strong><br/>
            ${new Date(obs.observedAt!).toLocaleString()}<br/>
            Signal: ${obs.signalStrength ?? "?"} dBm<br/>
            ${formatCoordinates(obs.latitude, obs.longitude)}
          </div>
        `);
      });

      if (points.length > 1) {
        L.polyline(points, {
          color: signalColor,
          weight: 2,
          opacity: 0.4,
          dashArray: "5, 10",
        }).addTo(map);
      }

      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });

      mapInstanceRef.current = map;
    };

    loadMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [obsWithLocation.length, device.signalType]);

  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    const elements: JSX.Element[] = [];
    let key = 0;

    for (const line of lines) {
      if (line.startsWith("## ")) {
        elements.push(
          <h3 key={key++} className="text-sm font-bold text-primary mt-4 mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {line.slice(3)}
          </h3>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h4 key={key++} className="text-xs font-semibold text-foreground/90 mt-3 mb-1">{line.slice(4)}</h4>
        );
      } else if (line.startsWith("- ")) {
        elements.push(
          <div key={key++} className="flex gap-2 text-xs ml-2 my-0.5">
            <span className="text-primary/60 mt-0.5 shrink-0">-</span>
            <span className="text-muted-foreground">{formatInlineMarkdown(line.slice(2))}</span>
          </div>
        );
      } else if (line.trim() === "") {
        elements.push(<div key={key++} className="h-1" />);
      } else {
        elements.push(
          <p key={key++} className="text-xs text-muted-foreground leading-relaxed my-0.5">
            {formatInlineMarkdown(line)}
          </p>
        );
      }
    }
    return elements;
  };

  const formatInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="text-foreground font-medium">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col" data-testid="device-analysis-panel">
      <div className="flex items-center justify-between gap-3 p-3 border-b border-border/50">
        <div className="flex items-center gap-3 min-w-0">
          <Brain className="w-5 h-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold uppercase tracking-wider" data-testid="text-analysis-title">
                Intelligence Analysis
              </h2>
              <SignalBadge type={device.signalType} size="sm" />
              {device.isFlagged && <Badge variant="destructive" className="text-[8px]">FLAGGED</Badge>}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {device.name || "Unknown Device"} - {device.macAddress || device.uuid || "No ID"}
            </p>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-analysis">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs defaultValue="intel" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid grid-cols-3 mx-3 mt-2 mb-0">
              <TabsTrigger value="intel" className="text-xs gap-1" data-testid="tab-intel">
                <Brain className="w-3 h-3" /> AI Intel
              </TabsTrigger>
              <TabsTrigger value="data" className="text-xs gap-1" data-testid="tab-data">
                <Table2 className="w-3 h-3" /> Full Data
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs gap-1" data-testid="tab-timeline">
                <Activity className="w-3 h-3" /> Timeline
              </TabsTrigger>
            </TabsList>

            <TabsContent value="intel" className="flex-1 overflow-hidden mt-0 px-3 pb-3">
              <ScrollArea className="h-full">
                <div className="py-2">
                  {isAnalyzing && aiReport.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3" data-testid="analysis-loading">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-xs text-muted-foreground">Generating intelligence report...</p>
                      <p className="text-[10px] text-muted-foreground/60">Analyzing device signatures, signal patterns, and OSINT data</p>
                    </div>
                  )}

                  {analysisError && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 mb-3">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                      <p className="text-xs text-destructive">{analysisError}</p>
                    </div>
                  )}

                  {aiReport && (
                    <div data-testid="analysis-report">
                      {renderMarkdown(aiReport)}
                      {isAnalyzing && (
                        <span className="inline-block w-2 h-3 bg-primary/60 animate-pulse ml-0.5" />
                      )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="data" className="flex-1 overflow-hidden mt-0 px-3 pb-3">
              <ScrollArea className="h-full">
                <div className="py-2 space-y-4">
                  <div>
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Fingerprint className="w-3 h-3" /> Device Metadata
                    </h4>
                    <div className="rounded-md border border-border/50 overflow-hidden" data-testid="table-device-metadata">
                      <table className="w-full text-xs">
                        <tbody>
                          {[
                            ["Name", device.name || "Unknown"],
                            ["MAC Address", device.macAddress || "N/A"],
                            ["UUID", device.uuid || "N/A"],
                            ["Manufacturer", device.manufacturer || "Unknown"],
                            ["Model", device.model || "Unknown"],
                            ["Device Type", device.deviceType || "Unknown"],
                            ["Signal Type", getSignalLabel(device.signalType)],
                            ["First Seen", device.firstSeenAt ? new Date(device.firstSeenAt).toLocaleString() : "N/A"],
                            ["Last Seen", device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "N/A"],
                            ["Tracked", device.isTracked ? "Yes" : "No"],
                            ["Flagged", device.isFlagged ? "Yes" : "No"],
                            ["Observations", String(deviceObs.length)],
                            ["Notes", device.notes || "None"],
                          ].map(([label, value], i) => (
                            <tr key={label} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                              <td className="px-3 py-1.5 font-medium text-muted-foreground whitespace-nowrap w-[140px]">{label}</td>
                              <td className="px-3 py-1.5 font-mono">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {device.metadata && (
                    <div>
                      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Zap className="w-3 h-3" /> Extended Metadata
                      </h4>
                      <pre className="text-[10px] font-mono p-3 rounded-md bg-muted/10 border border-border/50 overflow-x-auto whitespace-pre-wrap" data-testid="text-extended-metadata">
                        {JSON.stringify(device.metadata as Record<string, unknown>, null, 2)}
                      </pre>
                    </div>
                  )}

                  {deviceObs.length > 0 && (
                    <div>
                      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Radio className="w-3 h-3" /> Observation Records
                      </h4>
                      <div className="rounded-md border border-border/50 overflow-hidden overflow-x-auto" data-testid="table-observations">
                        <table className="w-full text-[10px] min-w-[700px]">
                          <thead>
                            <tr className="bg-muted/20 border-b border-border/50">
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Timestamp</th>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Signal</th>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Frequency</th>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Location</th>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Channel</th>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Protocol</th>
                              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Encryption</th>
                            </tr>
                          </thead>
                          <tbody>
                            {deviceObs.map((obs, i) => (
                              <tr key={obs.id} className={i % 2 === 0 ? "bg-muted/5" : ""}>
                                <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                                <td className="px-2 py-1 font-mono whitespace-nowrap">{new Date(obs.observedAt!).toLocaleString()}</td>
                                <td className="px-2 py-1">
                                  <div className="flex items-center gap-1">
                                    <span>{obs.signalStrength ?? "?"} dBm</span>
                                    <SignalStrengthBar strength={obs.signalStrength} />
                                  </div>
                                </td>
                                <td className="px-2 py-1 font-mono">{formatFrequency(obs.frequency)}</td>
                                <td className="px-2 py-1 font-mono">{formatCoordinates(obs.latitude, obs.longitude)}</td>
                                <td className="px-2 py-1">{obs.channel ?? "-"}</td>
                                <td className="px-2 py-1">{obs.protocol || "-"}</td>
                                <td className="px-2 py-1">{obs.encryption || "None"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="timeline" className="flex-1 overflow-hidden mt-0 px-3 pb-3">
              <ScrollArea className="h-full">
                <div className="py-2">
                  {deviceObs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No observations recorded</p>
                  ) : (
                    <div className="relative pl-4">
                      <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border/50" />
                      {deviceObs.map((obs, i) => (
                        <div key={obs.id} className="relative mb-3" data-testid={`timeline-entry-${obs.id}`}>
                          <div
                            className="absolute -left-2.5 top-1 w-3 h-3 rounded-full border-2"
                            style={{
                              borderColor: getSignalColor(obs.signalType),
                              backgroundColor: i === 0 ? getSignalColor(obs.signalType) : "transparent",
                            }}
                          />
                          <div className="ml-4 p-2 rounded-md bg-muted/10 border border-border/30 space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {new Date(obs.observedAt!).toLocaleString()}
                              </span>
                              <div className="flex items-center gap-2">
                                <SignalStrengthBar strength={obs.signalStrength} />
                                <span className="text-[10px]">{obs.signalStrength ?? "?"} dBm</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap text-[10px]">
                              {obs.latitude && obs.longitude && (
                                <span className="flex items-center gap-0.5 text-muted-foreground">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {formatCoordinates(obs.latitude, obs.longitude)}
                                </span>
                              )}
                              {obs.frequency && (
                                <span className="text-muted-foreground">{formatFrequency(obs.frequency)}</span>
                              )}
                              {obs.protocol && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0">{obs.protocol}</Badge>
                              )}
                              {obs.encryption && obs.encryption !== "None" && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0">
                                  <Shield className="w-2 h-2 mr-0.5" />{obs.encryption}
                                </Badge>
                              )}
                            </div>
                            {(obs.rawData || obs.hexData) && (
                              <div className="text-[9px] font-mono text-primary/60 mt-1 truncate">
                                {obs.hexData ? `HEX: ${obs.hexData.substring(0, 60)}...` : `RAW: ${obs.rawData?.substring(0, 60)}...`}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        <div className="w-[400px] flex-shrink-0 border-l border-border/50 flex flex-col">
          <div className="flex items-center gap-2 p-3 border-b border-border/50">
            <Crosshair className="w-3.5 h-3.5 text-primary" />
            <h4 className="text-xs font-medium uppercase tracking-wider">Geospatial View</h4>
            {obsWithLocation.length > 0 && (
              <Badge variant="outline" className="text-[8px] ml-auto">
                {obsWithLocation.length} locations
              </Badge>
            )}
          </div>
          <div className="flex-1 relative" data-testid="analysis-map">
            {obsWithLocation.length > 0 ? (
              <div ref={mapRef} className="absolute inset-0" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                <Globe className="w-8 h-8 opacity-30" />
                <p className="text-xs">No location data available</p>
              </div>
            )}
          </div>

          <div className="border-t border-border/50 p-3 space-y-2">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3 h-3" /> Quick Stats
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-md bg-muted/10 border border-border/30">
                <p className="text-[9px] text-muted-foreground">Total Observations</p>
                <p className="text-sm font-bold font-mono" data-testid="stat-observations">{deviceObs.length}</p>
              </div>
              <div className="p-2 rounded-md bg-muted/10 border border-border/30">
                <p className="text-[9px] text-muted-foreground">Unique Locations</p>
                <p className="text-sm font-bold font-mono" data-testid="stat-locations">{obsWithLocation.length}</p>
              </div>
              <div className="p-2 rounded-md bg-muted/10 border border-border/30">
                <p className="text-[9px] text-muted-foreground">Avg Signal</p>
                <p className="text-sm font-bold font-mono" data-testid="stat-avg-signal">
                  {deviceObs.length > 0
                    ? `${Math.round(deviceObs.reduce((sum, o) => sum + (o.signalStrength ?? 0), 0) / deviceObs.length)} dBm`
                    : "N/A"
                  }
                </p>
              </div>
              <div className="p-2 rounded-md bg-muted/10 border border-border/30">
                <p className="text-[9px] text-muted-foreground">Time Span</p>
                <p className="text-sm font-bold font-mono" data-testid="stat-timespan">
                  {deviceObs.length > 1
                    ? (() => {
                        const first = new Date(deviceObs[deviceObs.length - 1].observedAt!).getTime();
                        const last = new Date(deviceObs[0].observedAt!).getTime();
                        const hours = Math.round((last - first) / (1000 * 60 * 60));
                        return hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`;
                      })()
                    : "N/A"
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
