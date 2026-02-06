import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalBadge, SignalStrengthBar } from "@/components/signal-badge";
import { GlowLine } from "@/components/scan-animation";
import {
  ArrowLeft, Brain, Radio, MapPin, Clock, Activity, Shield,
  Fingerprint, Globe, RefreshCw, Download, Share2, Eye, EyeOff,
  Flag, Loader2, AlertTriangle, Crosshair, Zap, ChevronLeft,
  ChevronRight, ArrowUpDown, Network, FileText, Archive,
  Bookmark, Link2, Search, BarChart3, Target
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import type { Device, Observation } from "@shared/schema";
import {
  getSignalColor, getSignalLabel, timeAgo, formatCoordinates,
  formatFrequency, signalStrengthToPercent, signalStrengthLabel,
  SIGNAL_TYPES
} from "@/lib/signal-utils";
import { apiRequest } from "@/lib/queryClient";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeRiskScore(device: Device, observations: Observation[]): number {
  let score = 0;
  if (device.isFlagged) score += 30;
  if (observations.length > 20) score += 15;
  else if (observations.length > 10) score += 10;
  const withLoc = observations.filter(o => o.latitude && o.longitude);
  if (withLoc.length > 5) score += 10;
  const hasEncryption = observations.some(o => o.encryption && o.encryption !== "None");
  if (hasEncryption) score += 10;
  if (device.signalType === "sdr" || device.signalType === "adsb") score += 10;
  const recent = observations.filter(o => {
    const t = new Date(o.observedAt!).getTime();
    return Date.now() - t < 24 * 60 * 60 * 1000;
  });
  if (recent.length > 5) score += 15;
  return Math.min(100, score);
}

function getRiskLabel(score: number) {
  if (score >= 70) return { label: "HIGH", color: "text-red-400", bg: "bg-red-500/20 border-red-500/30" };
  if (score >= 40) return { label: "MEDIUM", color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/30" };
  return { label: "LOW", color: "text-green-400", bg: "bg-green-500/20 border-green-500/30" };
}

export default function NodeReportPage() {
  const [, params] = useRoute("/node-report/:id");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const deviceId = params?.id ? parseInt(params.id) : null;

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: allObservations = [] } = useQuery<Observation[]>({ queryKey: ["/api/observations"] });

  const device = devices.find(d => d.id === deviceId);
  const deviceObs = useMemo(() =>
    allObservations
      .filter(o => o.deviceId === deviceId)
      .sort((a, b) => new Date(b.observedAt!).getTime() - new Date(a.observedAt!).getTime()),
    [allObservations, deviceId]
  );
  const obsWithLocation = useMemo(() => deviceObs.filter(o => o.latitude && o.longitude), [deviceObs]);

  const [aiReport, setAiReport] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<"24h" | "7d" | "30d" | "all">("all");
  const [obsPage, setObsPage] = useState(0);
  const [obsSortField, setObsSortField] = useState<"time" | "signal" | "location">("time");
  const [obsSortDir, setObsSortDir] = useState<"asc" | "desc">("desc");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const OBS_PER_PAGE = 10;

  const runAnalysis = useCallback(async () => {
    if (!deviceId) return;
    setIsAnalyzing(true);
    setAiReport("");
    setAnalysisError(null);
    try {
      const response = await fetch(`/api/devices/${deviceId}/analyze`, {
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
            if (event.content) setAiReport(prev => prev + event.content);
            if (event.error) setAnalysisError(event.error);
          } catch {}
        }
      }
    } catch (err: any) {
      setAnalysisError(err.message || "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, [deviceId]);

  const riskScore = device ? computeRiskScore(device, deviceObs) : 0;
  const risk = getRiskLabel(riskScore);

  const avgSignal = useMemo(() => {
    const withSignal = deviceObs.filter(o => o.signalStrength != null);
    if (withSignal.length === 0) return null;
    return Math.round(withSignal.reduce((s, o) => s + (o.signalStrength ?? 0), 0) / withSignal.length);
  }, [deviceObs]);

  const totalDistance = useMemo(() => {
    if (obsWithLocation.length < 2) return 0;
    let dist = 0;
    const sorted = [...obsWithLocation].sort((a, b) => new Date(a.observedAt!).getTime() - new Date(b.observedAt!).getTime());
    for (let i = 1; i < sorted.length; i++) {
      dist += haversineDistance(sorted[i - 1].latitude!, sorted[i - 1].longitude!, sorted[i].latitude!, sorted[i].longitude!);
    }
    return dist;
  }, [obsWithLocation]);

  const chartData = useMemo(() => {
    let filtered = [...deviceObs];
    const now = Date.now();
    if (chartRange === "24h") filtered = filtered.filter(o => now - new Date(o.observedAt!).getTime() < 86400000);
    else if (chartRange === "7d") filtered = filtered.filter(o => now - new Date(o.observedAt!).getTime() < 7 * 86400000);
    else if (chartRange === "30d") filtered = filtered.filter(o => now - new Date(o.observedAt!).getTime() < 30 * 86400000);
    return filtered
      .sort((a, b) => new Date(a.observedAt!).getTime() - new Date(b.observedAt!).getTime())
      .map(o => ({
        time: new Date(o.observedAt!).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
        signal: o.signalStrength ?? 0,
        timestamp: new Date(o.observedAt!).getTime(),
      }));
  }, [deviceObs, chartRange]);

  const signalDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    deviceObs.forEach(o => {
      counts[o.signalType] = (counts[o.signalType] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({
      name: getSignalLabel(type),
      value: count,
      color: getSignalColor(type),
    }));
  }, [deviceObs]);

  const sortedObs = useMemo(() => {
    const sorted = [...deviceObs];
    sorted.sort((a, b) => {
      if (obsSortField === "time") {
        const diff = new Date(a.observedAt!).getTime() - new Date(b.observedAt!).getTime();
        return obsSortDir === "asc" ? diff : -diff;
      }
      if (obsSortField === "signal") {
        const diff = (a.signalStrength ?? -999) - (b.signalStrength ?? -999);
        return obsSortDir === "asc" ? diff : -diff;
      }
      if (obsSortField === "location") {
        const aHas = (a.latitude != null && a.longitude != null) ? 1 : 0;
        const bHas = (b.latitude != null && b.longitude != null) ? 1 : 0;
        if (aHas !== bHas) return obsSortDir === "asc" ? aHas - bHas : bHas - aHas;
        if (aHas && bHas) {
          const diff = (a.latitude! - b.latitude!) || (a.longitude! - b.longitude!);
          return obsSortDir === "asc" ? diff : -diff;
        }
        return 0;
      }
      return 0;
    });
    return sorted;
  }, [deviceObs, obsSortField, obsSortDir]);

  const pagedObs = sortedObs.slice(obsPage * OBS_PER_PAGE, (obsPage + 1) * OBS_PER_PAGE);
  const totalPages = Math.ceil(sortedObs.length / OBS_PER_PAGE);

  const associatedDevices = useMemo(() => {
    if (!device?.associatedDeviceIds) return [];
    return devices.filter(d => device.associatedDeviceIds!.includes(d.id));
  }, [device, devices]);

  const colocatedDevices = useMemo(() => {
    if (obsWithLocation.length === 0) return [];
    const nearby: Map<number, { device: Device; count: number; lastSeen: string }> = new Map();
    obsWithLocation.forEach(obs => {
      const others = allObservations.filter(o =>
        o.deviceId !== deviceId &&
        o.latitude && o.longitude &&
        Math.abs(new Date(o.observedAt!).getTime() - new Date(obs.observedAt!).getTime()) < 3600000 &&
        haversineDistance(obs.latitude!, obs.longitude!, o.latitude!, o.longitude!) < 0.5
      );
      others.forEach(o => {
        const existing = nearby.get(o.deviceId);
        if (existing) {
          existing.count++;
          if (new Date(o.observedAt!) > new Date(existing.lastSeen)) existing.lastSeen = o.observedAt!.toString();
        } else {
          const dev = devices.find(d => d.id === o.deviceId);
          if (dev) nearby.set(o.deviceId, { device: dev, count: 1, lastSeen: o.observedAt!.toString() });
        }
      });
    });
    return Array.from(nearby.values()).sort((a, b) => b.count - a.count);
  }, [obsWithLocation, allObservations, devices, deviceId]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || obsWithLocation.length === 0) return;
    const loadMap = async () => {
      const L = await import("leaflet");
      const map = L.map(mapRef.current!, { zoomControl: true, attributionControl: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19 }).addTo(map);
      const signalColor = device ? getSignalColor(device.signalType) : "#00d4ff";
      const points: [number, number][] = [];
      const sorted = [...obsWithLocation].sort((a, b) => new Date(a.observedAt!).getTime() - new Date(b.observedAt!).getTime());
      sorted.forEach((obs, i) => {
        const lat = obs.latitude!;
        const lng = obs.longitude!;
        points.push([lat, lng]);
        const isLatest = i === sorted.length - 1;
        const marker = L.circleMarker([lat, lng], {
          radius: isLatest ? 8 : 5,
          color: signalColor,
          fillColor: signalColor,
          fillOpacity: isLatest ? 0.9 : 0.4,
          weight: isLatest ? 2 : 1,
        }).addTo(map);
        marker.bindPopup(`
          <div style="font-family: monospace; font-size: 11px; color: #ccc; background: #1a1a2e; padding: 6px; border-radius: 4px;">
            <strong style="color: ${signalColor}">${isLatest ? "LATEST" : `#${i + 1}`}</strong><br/>
            ${new Date(obs.observedAt!).toLocaleString()}<br/>
            Signal: ${obs.signalStrength ?? "?"} dBm<br/>
            ${formatCoordinates(obs.latitude, obs.longitude)}
          </div>
        `);
      });
      if (points.length > 1) {
        L.polyline(points, { color: signalColor, weight: 2, opacity: 0.5, dashArray: "5, 8" }).addTo(map);
      }
      const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      mapInstanceRef.current = map;
    };
    loadMap();
    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, [obsWithLocation.length, device?.signalType]);

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
        elements.push(<h4 key={key++} className="text-xs font-semibold text-foreground/90 mt-3 mb-1">{line.slice(4)}</h4>);
      } else if (line.startsWith("- ")) {
        elements.push(
          <div key={key++} className="flex gap-2 text-xs ml-2 my-0.5">
            <span className="text-primary/60 mt-0.5 shrink-0">-</span>
            <span className="text-muted-foreground">{formatInline(line.slice(2))}</span>
          </div>
        );
      } else if (line.trim() === "") {
        elements.push(<div key={key++} className="h-1" />);
      } else {
        elements.push(<p key={key++} className="text-xs text-muted-foreground leading-relaxed my-0.5">{formatInline(line)}</p>);
      }
    }
    return elements;
  };

  const formatInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="text-foreground font-medium">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const toggleSort = (field: typeof obsSortField) => {
    if (obsSortField === field) setObsSortDir(d => d === "asc" ? "desc" : "asc");
    else { setObsSortField(field); setObsSortDir("desc"); }
    setObsPage(0);
  };

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Skeleton className="w-16 h-16 rounded-full" />
        <p className="text-sm text-muted-foreground">Loading device report...</p>
        <Button variant="ghost" size="sm" onClick={() => setLocation("/devices")} data-testid="button-back-devices">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Devices
        </Button>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6" data-testid="node-report-page">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="ghost" onClick={() => window.history.back()} data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-report-title">
                SIGINT Node Report
              </h1>
              <p className="text-sm text-muted-foreground font-mono flex items-center gap-2 flex-wrap">
                <SignalBadge type={device.signalType} size="sm" />
                {device.name || "Unknown Device"}
                <span className="text-muted-foreground/60">|</span>
                <span className="text-muted-foreground/80">{device.macAddress || device.uuid || `ID-${device.id}`}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-[10px] uppercase ${device.isTracked ? "bg-primary/20 border-primary/30 text-primary" : "bg-muted/20 border-muted/30 text-muted-foreground"}`}>
              {device.isTracked ? "ACTIVE" : "INACTIVE"}
            </Badge>
            {device.isFlagged && <Badge variant="destructive" className="text-[10px] uppercase">FLAGGED</Badge>}
            <Button size="sm" variant="outline" onClick={() => { queryClient.invalidateQueries({ queryKey: ["/api/devices"] }); queryClient.invalidateQueries({ queryKey: ["/api/observations"] }); }} data-testid="button-refresh-report">
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
            <Button size="sm" variant="outline" data-testid="button-export">
              <Download className="w-3.5 h-3.5 mr-1" /> Export
            </Button>
            <Button size="sm" variant="outline" data-testid="button-share">
              <Share2 className="w-3.5 h-3.5 mr-1" /> Share
            </Button>
          </div>
        </div>

        <GlowLine />

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Signal Count", value: String(deviceObs.length), icon: Radio },
            { label: "First Seen", value: device.firstSeenAt ? new Date(device.firstSeenAt).toLocaleDateString() : "N/A", icon: Clock },
            { label: "Last Active", value: device.lastSeenAt ? timeAgo(device.lastSeenAt) : "N/A", icon: Activity },
            { label: "Avg Signal", value: avgSignal != null ? `${avgSignal} dBm` : "N/A", icon: BarChart3 },
            { label: "Location Points", value: String(obsWithLocation.length), icon: MapPin },
          ].map(stat => (
            <Card key={stat.label} className="p-3 overflow-visible">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className="w-3.5 h-3.5 text-primary/60" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-lg font-bold font-mono" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>{stat.value}</p>
            </Card>
          ))}
          <Card className={`p-3 border overflow-visible ${risk.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-3.5 h-3.5 text-primary/60" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score</span>
            </div>
            <div className="flex items-center gap-2">
              <p className={`text-lg font-bold font-mono ${risk.color}`} data-testid="stat-risk-score">{riskScore}</p>
              <Badge variant="outline" className={`text-[8px] ${risk.color}`}>{risk.label}</Badge>
            </div>
          </Card>
        </div>

        <Card className="overflow-visible" data-testid="section-ai-intel">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-border/50 flex-wrap">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">AI Intelligence Summary</h2>
            </div>
            <Button size="sm" onClick={runAnalysis} disabled={isAnalyzing} data-testid="button-analyze">
              {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Brain className="w-3.5 h-3.5 mr-1" />}
              {isAnalyzing ? "Analyzing..." : aiReport ? "Re-Analyze" : "Analyze"}
            </Button>
          </div>
          <CardContent className="p-4">
            {!aiReport && !isAnalyzing && !analysisError && (
              <div className="text-center py-8">
                <Brain className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Click "Analyze" to generate an AI intelligence report</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Includes threat assessment, behavioral analysis, and OSINT findings</p>
              </div>
            )}
            {isAnalyzing && !aiReport && (
              <div className="flex flex-col items-center py-8 gap-3" data-testid="analysis-loading">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-xs text-muted-foreground">Generating intelligence report...</p>
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
                {isAnalyzing && <span className="inline-block w-2 h-3 bg-primary/60 animate-pulse ml-0.5" />}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-[1fr_300px] gap-4">
          <Card className="overflow-visible" data-testid="section-device-profile">
            <div className="flex items-center gap-2 p-4 border-b border-border/50">
              <Fingerprint className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Device Profile</h2>
            </div>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <tbody>
                  {[
                    ["Device ID", `#${device.id}`],
                    ["Name", device.name || "Unknown"],
                    ["MAC Address", device.macAddress || "N/A"],
                    ["UUID", device.uuid || "N/A"],
                    ["Signal Type", getSignalLabel(device.signalType)],
                    ["Manufacturer", device.manufacturer || "Unknown"],
                    ["Model", device.model || "Unknown"],
                    ["Device Type", device.deviceType || "Unknown"],
                    ["First Seen", device.firstSeenAt ? new Date(device.firstSeenAt).toLocaleString() : "N/A"],
                    ["Last Seen", device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "N/A"],
                    ["Tracked", device.isTracked ? "Yes" : "No"],
                    ["Flagged", device.isFlagged ? "Yes" : "No"],
                    ["Notes", device.notes || "None"],
                  ].map(([label, value], i) => (
                    <tr key={label} className={i % 2 === 0 ? "bg-muted/5" : ""}>
                      <td className="px-4 py-2 font-medium text-muted-foreground whitespace-nowrap w-[140px] border-r border-border/30">{label}</td>
                      <td className="px-4 py-2 font-mono">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="overflow-visible" data-testid="section-signal-distribution">
            <div className="flex items-center gap-2 p-4 border-b border-border/50">
              <Radio className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Signal Distribution</h2>
            </div>
            <CardContent className="p-4 flex flex-col items-center">
              {signalDistribution.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={signalDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {signalDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px", fontFamily: "JetBrains Mono" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-1.5 w-full mt-2">
                    {signalDistribution.map(d => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-muted-foreground">{d.name}</span>
                        </div>
                        <span className="font-mono font-medium">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground py-8">No signal data available</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-visible" data-testid="section-signal-history">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-border/50 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Signal History</h2>
            </div>
            <div className="flex items-center gap-1">
              {(["24h", "7d", "30d", "all"] as const).map(range => (
                <Button
                  key={range}
                  size="sm"
                  variant={chartRange === range ? "default" : "ghost"}
                  onClick={() => setChartRange(range)}
                  className="text-xs px-2"
                  data-testid={`button-range-${range}`}
                >
                  {range.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
          <CardContent className="p-4">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px", fontFamily: "JetBrains Mono" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: "10px" }}
                  />
                  <Line type="monotone" dataKey="signal" stroke="#00d4ff" strokeWidth={2} dot={{ r: 3, fill: "#00d4ff" }} activeDot={{ r: 5, fill: "#00d4ff" }} name="Signal (dBm)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12">
                <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">Not enough data points for chart</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-visible" data-testid="section-observation-log">
          <div className="flex items-center justify-between gap-3 p-4 border-b border-border/50 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Observation Log</h2>
              <Badge variant="outline" className="text-[9px]">{sortedObs.length} records</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="bg-muted/10 border-b border-border/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort("time")} data-testid="sort-time">
                    <span className="flex items-center gap-1">Timestamp <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort("signal")} data-testid="sort-signal">
                    <span className="flex items-center gap-1">Signal <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Frequency</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer" onClick={() => toggleSort("location")} data-testid="sort-location">
                    <span className="flex items-center gap-1">Coordinates <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Bearing</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Channel</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Protocol</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Encryption</th>
                </tr>
              </thead>
              <tbody>
                {pagedObs.map((obs, i) => (
                  <tr key={obs.id} className={`${i % 2 === 0 ? "bg-muted/5" : ""} hover-elevate`} data-testid={`obs-row-${obs.id}`}>
                    <td className="px-3 py-2 text-muted-foreground">{obsPage * OBS_PER_PAGE + i + 1}</td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{new Date(obs.observedAt!).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono">{obs.signalStrength ?? "?"} dBm</span>
                        <SignalStrengthBar strength={obs.signalStrength} />
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono">{formatFrequency(obs.frequency)}</td>
                    <td className="px-3 py-2 font-mono">{formatCoordinates(obs.latitude, obs.longitude)}</td>
                    <td className="px-3 py-2 font-mono">{obs.heading != null ? `${obs.heading.toFixed(1)}°` : "-"}</td>
                    <td className="px-3 py-2">{obs.channel ?? "-"}</td>
                    <td className="px-3 py-2">{obs.protocol || "-"}</td>
                    <td className="px-3 py-2">{obs.encryption || "None"}</td>
                  </tr>
                ))}
                {pagedObs.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No observations recorded</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 p-3 border-t border-border/50 flex-wrap">
              <p className="text-[10px] text-muted-foreground">
                Page {obsPage + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" disabled={obsPage === 0} onClick={() => setObsPage(p => p - 1)} data-testid="button-obs-prev">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" disabled={obsPage >= totalPages - 1} onClick={() => setObsPage(p => p + 1)} data-testid="button-obs-next">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="overflow-visible" data-testid="section-geospatial">
          <div className="flex items-center gap-2 p-4 border-b border-border/50">
            <Crosshair className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Geospatial Intelligence</h2>
            {obsWithLocation.length > 0 && (
              <Badge variant="outline" className="text-[9px] ml-auto">{obsWithLocation.length} locations</Badge>
            )}
          </div>
          <div className="grid lg:grid-cols-[1fr_280px]">
            <div className="relative h-[400px]" data-testid="geospatial-map">
              {obsWithLocation.length > 0 ? (
                <div ref={mapRef} className="absolute inset-0" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                  <Globe className="w-10 h-10 opacity-30" />
                  <p className="text-sm">No location data available</p>
                </div>
              )}
            </div>
            <div className="border-l border-border/50 p-4 space-y-4">
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Movement Summary
              </h3>
              <div className="space-y-3">
                <div className="p-2.5 rounded-md bg-muted/10 border border-border/30">
                  <p className="text-[9px] text-muted-foreground uppercase">Total Distance</p>
                  <p className="text-sm font-bold font-mono" data-testid="stat-total-distance">
                    {totalDistance > 0 ? `${totalDistance.toFixed(2)} km` : "N/A"}
                  </p>
                </div>
                <div className="p-2.5 rounded-md bg-muted/10 border border-border/30">
                  <p className="text-[9px] text-muted-foreground uppercase">Avg Speed</p>
                  <p className="text-sm font-bold font-mono" data-testid="stat-avg-speed">
                    {(() => {
                      const withSpeed = deviceObs.filter(o => o.speed != null);
                      if (withSpeed.length === 0) return "N/A";
                      const avg = withSpeed.reduce((s, o) => s + (o.speed ?? 0), 0) / withSpeed.length;
                      return `${avg.toFixed(1)} km/h`;
                    })()}
                  </p>
                </div>
                <div className="p-2.5 rounded-md bg-muted/10 border border-border/30">
                  <p className="text-[9px] text-muted-foreground uppercase">Last Heading</p>
                  <p className="text-sm font-bold font-mono" data-testid="stat-heading">
                    {(() => {
                      const withHeading = deviceObs.find(o => o.heading != null);
                      return withHeading ? `${withHeading.heading!.toFixed(1)}°` : "N/A";
                    })()}
                  </p>
                </div>
                <div className="p-2.5 rounded-md bg-muted/10 border border-border/30">
                  <p className="text-[9px] text-muted-foreground uppercase">Coverage Area</p>
                  <p className="text-sm font-bold font-mono" data-testid="stat-coverage">
                    {obsWithLocation.length >= 2 ? (() => {
                      const lats = obsWithLocation.map(o => o.latitude!);
                      const lngs = obsWithLocation.map(o => o.longitude!);
                      const latSpread = (Math.max(...lats) - Math.min(...lats)) * 111;
                      const lngSpread = (Math.max(...lngs) - Math.min(...lngs)) * 111 * Math.cos(((Math.max(...lats) + Math.min(...lats)) / 2) * Math.PI / 180);
                      return `${(latSpread * lngSpread).toFixed(2)} km²`;
                    })() : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-visible" data-testid="section-associated-devices">
          <div className="flex items-center gap-2 p-4 border-b border-border/50">
            <Network className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Associated Devices</h2>
          </div>
          <CardContent className="p-4">
            {associatedDevices.length === 0 && colocatedDevices.length === 0 ? (
              <div className="text-center py-8">
                <Network className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">No associated devices found</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Devices detected nearby will appear here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {associatedDevices.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Link2 className="w-3 h-3" /> Linked Devices
                    </h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {associatedDevices.map(dev => (
                        <div
                          key={dev.id}
                          className="p-3 rounded-md bg-muted/10 border border-border/30 cursor-pointer hover-elevate"
                          onClick={() => setLocation(`/node-report/${dev.id}`)}
                          data-testid={`linked-device-${dev.id}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <SignalBadge type={dev.signalType} size="sm" />
                            <span className="text-xs font-medium truncate">{dev.name || "Unknown"}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">{dev.macAddress || dev.uuid || `ID-${dev.id}`}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {colocatedDevices.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" /> Co-located Devices
                    </h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {colocatedDevices.slice(0, 9).map(({ device: dev, count, lastSeen }) => (
                        <div
                          key={dev.id}
                          className="p-3 rounded-md bg-muted/10 border border-border/30 cursor-pointer hover-elevate"
                          onClick={() => setLocation(`/node-report/${dev.id}`)}
                          data-testid={`colocated-device-${dev.id}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <SignalBadge type={dev.signalType} size="sm" />
                              <span className="text-xs font-medium truncate">{dev.name || "Unknown"}</span>
                            </div>
                            <Badge variant="outline" className="text-[8px] shrink-0">{count}x</Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Last co-located: {timeAgo(lastSeen)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-visible" data-testid="section-timeline">
          <div className="flex items-center gap-2 p-4 border-b border-border/50">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Activity Timeline</h2>
          </div>
          <CardContent className="p-4">
            {deviceObs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No activity recorded</p>
            ) : (
              <div className="relative pl-6 space-y-0">
                <div className="absolute left-2 top-0 bottom-0 w-px bg-border/50" />

                <div className="relative pb-4">
                  <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                  <div className="ml-4 p-2.5 rounded-md bg-muted/10 border border-border/30">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium text-green-400">First Detection</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{device.firstSeenAt ? new Date(device.firstSeenAt).toLocaleString() : "Unknown"}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Device first appeared in collection</p>
                  </div>
                </div>

                {device.isFlagged && (
                  <div className="relative pb-4">
                    <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-red-500 border-2 border-background" />
                    <div className="ml-4 p-2.5 rounded-md bg-red-500/5 border border-red-500/20">
                      <span className="text-xs font-medium text-red-400">Device Flagged</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Marked as suspicious or requiring attention</p>
                    </div>
                  </div>
                )}

                {(() => {
                  const keyObs = deviceObs.filter((_, i) => {
                    if (i === 0) return true;
                    if (i === deviceObs.length - 1) return true;
                    const prevSig = deviceObs[i - 1].signalStrength ?? -80;
                    const curSig = deviceObs[i].signalStrength ?? -80;
                    if (Math.abs(curSig - prevSig) > 15) return true;
                    if (i % Math.max(1, Math.floor(deviceObs.length / 8)) === 0) return true;
                    return false;
                  });
                  return keyObs.slice(0, 12).map((obs, i) => {
                    const color = getSignalColor(obs.signalType);
                    return (
                      <div key={obs.id} className="relative pb-4" data-testid={`timeline-event-${obs.id}`}>
                        <div className="absolute -left-4 top-1 w-3 h-3 rounded-full border-2 border-background" style={{ backgroundColor: color }} />
                        <div className="ml-4 p-2.5 rounded-md bg-muted/10 border border-border/30">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-xs font-medium">Signal Detection</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{new Date(obs.observedAt!).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Radio className="w-2.5 h-2.5" /> {obs.signalStrength ?? "?"} dBm</span>
                            {obs.latitude && obs.longitude && (
                              <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {formatCoordinates(obs.latitude, obs.longitude)}</span>
                            )}
                            {obs.protocol && <Badge variant="outline" className="text-[8px] px-1 py-0">{obs.protocol}</Badge>}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}

                <div className="relative pb-4">
                  <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                  <div className="ml-4 p-2.5 rounded-md bg-primary/5 border border-primary/20">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium text-primary">Last Active</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Unknown"}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Most recent signal detected {device.lastSeenAt ? timeAgo(device.lastSeenAt) : ""}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-visible" data-testid="section-export-actions">
          <div className="flex items-center justify-between gap-3 p-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Export & Actions</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" data-testid="button-export-pdf">
                <FileText className="w-3.5 h-3.5 mr-1" /> PDF Report
              </Button>
              <Button size="sm" variant="outline" data-testid="button-export-csv">
                <Download className="w-3.5 h-3.5 mr-1" /> CSV Data
              </Button>
              <Button size="sm" variant="outline" data-testid="button-share-link">
                <Share2 className="w-3.5 h-3.5 mr-1" /> Share Link
              </Button>
              <Button size="sm" variant="outline" data-testid="button-add-watchlist">
                <Bookmark className="w-3.5 h-3.5 mr-1" /> Watchlist
              </Button>
              <Button size="sm" variant="outline" data-testid="button-archive">
                <Archive className="w-3.5 h-3.5 mr-1" /> Archive
              </Button>
            </div>
          </div>
        </Card>

        <div className="h-4" />
      </div>
    </ScrollArea>
  );
}
