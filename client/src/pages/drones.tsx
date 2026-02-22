import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import {
  Radar, AlertTriangle, Search, Loader2, Radio, Wifi, Bluetooth,
  Signal, MapPin, Clock, ShieldAlert, Eye, Zap, ChevronDown, ChevronUp,
  RefreshCw, Play, Square, Activity, ArrowUp, ArrowDown, Minus,
  Target, Volume2, Crosshair, TrendingUp, TrendingDown, CircleDot,
  Shield, Antenna, LocateFixed, Ruler
} from "lucide-react";
import type { DroneSignature, DroneDetection } from "@shared/schema";

const THREAT_COLORS: Record<string, string> = {
  info: "text-blue-400",
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-400",
  unknown: "text-muted-foreground",
};

const THREAT_BG: Record<string, string> = {
  info: "bg-blue-500/10 border-blue-500/20",
  low: "bg-green-500/10 border-green-500/20",
  medium: "bg-yellow-500/10 border-yellow-500/20",
  high: "bg-orange-500/10 border-orange-500/20",
  critical: "bg-red-500/10 border-red-500/20",
  unknown: "bg-muted/10 border-border",
};

const SOURCE_ICONS: Record<string, typeof Wifi> = {
  sdr: Radio,
  wifi: Wifi,
  bluetooth: Bluetooth,
  remoteid: Shield,
};

const DIRECTION_ICONS: Record<string, typeof ArrowUp> = {
  approaching: ArrowUp,
  receding: ArrowDown,
  hovering: Minus,
  unknown: CircleDot,
};

const DIRECTION_COLORS: Record<string, string> = {
  approaching: "text-red-400",
  receding: "text-green-400",
  hovering: "text-yellow-400",
  unknown: "text-muted-foreground",
};

interface DroneSignalSource {
  type: "sdr" | "wifi" | "bluetooth" | "remoteid";
  frequencyMHz: number;
  rssi: number;
  bandwidth: number;
  identifier: string;
  matchedProfile: string | null;
  confidence: number;
  timestamp: number;
}

interface DroneDetectionResult {
  id: string;
  timestamp: number;
  signalSources: DroneSignalSource[];
  bestMatch: { name: string; manufacturer: string; protocol: string; threatLevel: string } | null;
  overallConfidence: number;
  threatLevel: string;
  estimatedDistanceM: number | null;
  signalDirection: "approaching" | "receding" | "hovering" | "unknown";
  rssiHistory: { time: number; rssi: number }[];
  flightPath: { lat: number; lng: number; alt: number; time: number }[];
  fusionScore: number;
  notes: string;
}

interface WatchScanResult {
  detections: DroneDetectionResult[];
  scanSummary: {
    sdrBands: Array<{ band: string; signalCount: number }>;
    wifiDevicesScanned: number;
    bleDevicesScanned: number;
    totalSignalsAnalyzed: number;
    dronesDetected: number;
    highThreatCount: number;
    sdrAttached: boolean;
  };
  timestamp: number;
  frequencyBands: Array<{ name: string; startMHz: number; endMHz: number; category: string; description: string }>;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "N/A";
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatFreq(mhz: number): string {
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(2)} GHz`;
  return `${mhz.toFixed(1)} MHz`;
}

export default function DronesPage() {
  const queryClient = useQueryClient();
  const [sigSearch, setSigSearch] = useState("");
  const [expandedSig, setExpandedSig] = useState<number | null>(null);
  const [expandedDetection, setExpandedDetection] = useState<string | null>(null);
  const [watchMode, setWatchMode] = useState(false);
  const [scanMode, setScanMode] = useState<"server" | "simulation">("server");
  const [watchInterval, setWatchInterval] = useState(3000);
  const [liveDetections, setLiveDetections] = useState<DroneDetectionResult[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [lastScanSummary, setLastScanSummary] = useState<WatchScanResult["scanSummary"] | null>(null);
  const [threatAlertThreshold, setThreatAlertThreshold] = useState<string>("medium");
  const [alertCount, setAlertCount] = useState(0);
  const watchRef = useRef(false);
  const watchTimerRef = useRef<any>(null);
  const scanModeRef = useRef(scanMode);
  const watchIntervalRef = useRef(watchInterval);
  const liveDetectionsRef = useRef(liveDetections);
  const threatThresholdRef = useRef(threatAlertThreshold);

  useEffect(() => { scanModeRef.current = scanMode; }, [scanMode]);
  useEffect(() => { watchIntervalRef.current = watchInterval; }, [watchInterval]);
  useEffect(() => { liveDetectionsRef.current = liveDetections; }, [liveDetections]);
  useEffect(() => { threatThresholdRef.current = threatAlertThreshold; }, [threatAlertThreshold]);

  const { data: signatures = [], isLoading: sigsLoading } = useQuery<DroneSignature[]>({
    queryKey: ["/api/drones/signatures"],
  });

  const { data: detections = [] } = useQuery<DroneDetection[]>({
    queryKey: ["/api/drones/detections"],
    refetchInterval: watchMode ? 5000 : undefined,
  });

  const watchScanMutation = useMutation({
    mutationFn: async (existingDetections: DroneDetectionResult[]) => {
      const res = await apiRequest("POST", "/api/drones/watch-scan", {
        mode: scanModeRef.current,
        existingDetections,
      });
      return res.json();
    },
    onSuccess: (data: WatchScanResult) => {
      setLiveDetections(data.detections);
      setLastScanSummary(data.scanSummary);
      setScanCount(c => c + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/drones/detections"] });

      const tOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      const thresholdLevel = tOrder[threatThresholdRef.current] || 2;
      const highThreats = data.detections.filter(d => (tOrder[d.threatLevel] || 0) >= thresholdLevel);
      if (highThreats.length > 0) {
        setAlertCount(highThreats.length);
      } else {
        setAlertCount(0);
      }
    },
  });

  const runWatchScan = useCallback(async () => {
    await watchScanMutation.mutateAsync(liveDetectionsRef.current);
  }, []);

  const toggleWatch = useCallback(() => {
    if (watchRef.current) {
      watchRef.current = false;
      setWatchMode(false);
      if (watchTimerRef.current) { clearTimeout(watchTimerRef.current); watchTimerRef.current = null; }
    } else {
      watchRef.current = true;
      setWatchMode(true);
      const loop = async () => {
        if (!watchRef.current) return;
        try {
          await runWatchScan();
        } catch {}
        if (watchRef.current) watchTimerRef.current = setTimeout(loop, watchIntervalRef.current);
      };
      loop();
    }
  }, [runWatchScan]);

  useEffect(() => {
    return () => { watchRef.current = false; if (watchTimerRef.current) clearTimeout(watchTimerRef.current); };
  }, []);

  const filteredSignatures = signatures.filter(sig => {
    if (!sigSearch) return true;
    const q = sigSearch.toLowerCase();
    return (
      sig.manufacturer.toLowerCase().includes(q) ||
      sig.model.toLowerCase().includes(q) ||
      (sig.protocol && sig.protocol.toLowerCase().includes(q)) ||
      (sig.frequency && sig.frequency.toLowerCase().includes(q))
    );
  });

  const groupedByThreat = filteredSignatures.reduce((acc, sig) => {
    const level = sig.threatLevel || "unknown";
    if (!acc[level]) acc[level] = [];
    acc[level].push(sig);
    return acc;
  }, {} as Record<string, DroneSignature[]>);

  const threatOrder = ["critical", "high", "medium", "low", "info", "unknown"];

  const threatCounts = liveDetections.reduce((acc, d) => {
    acc[d.threatLevel] = (acc[d.threatLevel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const highThreatCount = liveDetections.filter(d => d.threatLevel === "high" || d.threatLevel === "critical").length;
  const closestDrone = liveDetections.reduce<DroneDetectionResult | null>((closest, d) => {
    if (d.estimatedDistanceM === null) return closest;
    if (!closest || (closest.estimatedDistanceM !== null && d.estimatedDistanceM < closest.estimatedDistanceM)) return d;
    return closest;
  }, null);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4" data-testid="drones-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            {watchMode && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />}
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider" data-testid="text-drones-title">Drone Detection</h2>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Multi-Source Counter-UAS</p>
          </div>
          <Badge variant="outline" className="text-[9px]">{signatures.length} signatures</Badge>
          {watchMode && (
            <Badge variant="outline" className="text-[9px] border-green-500/40 text-green-400 animate-pulse" data-testid="badge-watch-active">
              WATCH ACTIVE
            </Badge>
          )}
          {highThreatCount > 0 && (
            <Badge variant="destructive" className="text-[9px] animate-pulse" data-testid="badge-threat-alert">
              {highThreatCount} THREAT{highThreatCount > 1 ? "S" : ""}
            </Badge>
          )}
          {alertCount > 0 && (
            <Badge variant="outline" className="text-[9px] border-orange-500/40 text-orange-400 animate-pulse" data-testid="badge-alert-count">
              {alertCount} ALERT{alertCount > 1 ? "S" : ""} ({threatAlertThreshold}+)
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={scanMode} onValueChange={(v) => setScanMode(v as "server" | "simulation")}>
            <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-scan-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="server">Server SDR</SelectItem>
              <SelectItem value="simulation">Simulation</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(watchInterval)} onValueChange={(v) => setWatchInterval(parseInt(v))}>
            <SelectTrigger className="w-20 h-8 text-xs" data-testid="select-watch-interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1000">1s</SelectItem>
              <SelectItem value="2000">2s</SelectItem>
              <SelectItem value="3000">3s</SelectItem>
              <SelectItem value="5000">5s</SelectItem>
              <SelectItem value="10000">10s</SelectItem>
            </SelectContent>
          </Select>
          <Select value={threatAlertThreshold} onValueChange={setThreatAlertThreshold}>
            <SelectTrigger className="w-24 h-8 text-xs" data-testid="select-alert-threshold">
              <SelectValue placeholder="Alert" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High+</SelectItem>
              <SelectItem value="medium">Medium+</SelectItem>
              <SelectItem value="low">Low+</SelectItem>
              <SelectItem value="info">All</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={toggleWatch}
            variant={watchMode ? "destructive" : "default"}
            data-testid="button-drone-watch"
          >
            {watchMode ? (
              <><Square className="w-4 h-4 mr-2" /> Stop Watch</>
            ) : (
              <><Radar className="w-4 h-4 mr-2" /> Drone Watch</>
            )}
          </Button>
          <Button
            onClick={() => runWatchScan()}
            disabled={watchScanMutation.isPending || watchMode}
            variant="outline"
            data-testid="button-single-scan"
          >
            {watchScanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crosshair className="w-4 h-4 mr-2" />}
            Single Scan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <Card className="p-2.5 text-center">
          <Radar className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold" data-testid="text-drones-detected">{liveDetections.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Drones Found</p>
        </Card>
        <Card className={`p-2.5 text-center ${highThreatCount > 0 ? "border-red-500/30" : ""}`}>
          <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${highThreatCount > 0 ? "text-red-400" : "text-muted-foreground"}`} />
          <p className="text-lg font-bold">{highThreatCount}</p>
          <p className="text-[9px] text-muted-foreground uppercase">High Threats</p>
        </Card>
        <Card className="p-2.5 text-center">
          <LocateFixed className="w-5 h-5 mx-auto mb-1 text-cyan-400" />
          <p className="text-lg font-bold">{closestDrone ? formatDistance(closestDrone.estimatedDistanceM) : "N/A"}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Nearest</p>
        </Card>
        <Card className="p-2.5 text-center">
          <Activity className="w-5 h-5 mx-auto mb-1 text-blue-400" />
          <p className="text-lg font-bold" data-testid="text-scan-count">{scanCount}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Scans</p>
        </Card>
        <Card className="p-2.5 text-center">
          <Signal className="w-5 h-5 mx-auto mb-1 text-purple-400" />
          <p className="text-lg font-bold">{lastScanSummary?.totalSignalsAnalyzed || 0}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Signals</p>
        </Card>
        <Card className="p-2.5 text-center">
          <Eye className="w-5 h-5 mx-auto mb-1 text-green-400" />
          <p className="text-lg font-bold">{detections.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Total Logged</p>
        </Card>
      </div>

      {lastScanSummary && (
        <Card className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Antenna className="w-3.5 h-3.5 text-purple-400" />
              Scan Coverage
              {!lastScanSummary.sdrAttached && scanMode === "server" && (
                <Badge variant="outline" className="text-[8px] border-yellow-500/30 text-yellow-400" data-testid="badge-no-sdr">
                  No SDR Hardware
                </Badge>
              )}
            </div>
            <span className="text-[9px] text-muted-foreground">
              {lastScanSummary.sdrBands.length} RF bands | {lastScanSummary.wifiDevicesScanned} WiFi | {lastScanSummary.bleDevicesScanned} BLE
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {lastScanSummary.sdrBands.map((band, i) => (
              <Badge key={i} variant="outline" className="text-[8px]">
                <Radio className="w-2 h-2 mr-0.5" />
                {band.band}: {band.signalCount}
              </Badge>
            ))}
            <Badge variant="outline" className="text-[8px]">
              <Wifi className="w-2 h-2 mr-0.5" />
              WiFi: {lastScanSummary.wifiDevicesScanned}
            </Badge>
            <Badge variant="outline" className="text-[8px]">
              <Bluetooth className="w-2 h-2 mr-0.5" />
              BLE: {lastScanSummary.bleDevicesScanned}
            </Badge>
          </div>
        </Card>
      )}

      <Tabs defaultValue="live" className="space-y-3">
        <TabsList>
          <TabsTrigger value="live" className="text-xs" data-testid="tab-live-threats">
            <Radar className="w-3 h-3 mr-1" /> Live Threats ({liveDetections.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs" data-testid="tab-detection-history">
            <Clock className="w-3 h-3 mr-1" /> History ({detections.length})
          </TabsTrigger>
          <TabsTrigger value="signatures" className="text-xs" data-testid="tab-signatures">
            <Zap className="w-3 h-3 mr-1" /> Signatures ({signatures.length})
          </TabsTrigger>
          <TabsTrigger value="info" className="text-xs" data-testid="tab-counter-uas">
            <ShieldAlert className="w-3 h-3 mr-1" /> Counter-UAS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-2">
          {liveDetections.length === 0 ? (
            <Card className="p-8 text-center">
              <Radar className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No drones detected</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {scanCount === 0
                  ? "Click 'Drone Watch' to start continuous scanning or 'Single Scan' for a one-time sweep"
                  : "Airspace appears clear. Continue monitoring."}
              </p>
              {lastScanSummary && !lastScanSummary.sdrAttached && scanMode === "server" && scanCount > 0 && (
                <p className="text-[10px] text-yellow-400 mt-2">
                  SDR radio not detected — RF band scanning inactive. WiFi/BLE device matching is active.
                  {" "}Switch to Simulation mode to test with synthetic signals.
                </p>
              )}
            </Card>
          ) : (
            <div className="space-y-2">
              {liveDetections.map((det) => {
                const isExpanded = expandedDetection === det.id;
                const DirectionIcon = DIRECTION_ICONS[det.signalDirection] || CircleDot;
                const confidencePct = Math.round(det.overallConfidence * 100);
                return (
                  <Card
                    key={det.id}
                    className={`border ${THREAT_BG[det.threatLevel] || THREAT_BG.unknown} cursor-pointer transition-all`}
                    onClick={() => setExpandedDetection(isExpanded ? null : det.id)}
                    data-testid={`card-live-detection-${det.id}`}
                  >
                    <div className="p-3">
                      <div className="flex items-center gap-3">
                        <div className={`relative p-2 rounded-full ${det.threatLevel === "critical" ? "bg-red-500/20" : det.threatLevel === "high" ? "bg-orange-500/20" : "bg-muted/20"}`}>
                          <Radar className={`w-5 h-5 ${THREAT_COLORS[det.threatLevel]}`} />
                          {det.signalDirection === "approaching" && (
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" data-testid={`text-drone-name-${det.id}`}>
                              {det.bestMatch ? `${det.bestMatch.manufacturer} ${det.bestMatch.name}` : "Unknown UAS"}
                            </span>
                            <Badge variant="outline" className={`text-[8px] ${THREAT_COLORS[det.threatLevel]}`}>
                              {det.threatLevel.toUpperCase()}
                            </Badge>
                            {det.fusionScore > 1 && (
                              <Badge variant="outline" className="text-[8px] border-purple-500/40 text-purple-400">
                                MULTI-INT x{det.fusionScore}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Ruler className="w-2.5 h-2.5" />
                              {formatDistance(det.estimatedDistanceM)}
                            </span>
                            <span className={`flex items-center gap-1 ${DIRECTION_COLORS[det.signalDirection]}`}>
                              <DirectionIcon className="w-2.5 h-2.5" />
                              {det.signalDirection}
                            </span>
                            <span className="flex items-center gap-1">
                              <Signal className="w-2.5 h-2.5" />
                              {det.signalSources[0]?.rssi?.toFixed(0)} dBm
                            </span>
                            <span className="flex items-center gap-1">
                              <Radio className="w-2.5 h-2.5" />
                              {formatFreq(det.signalSources[0]?.frequencyMHz || 0)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className={`text-sm font-bold ${confidencePct >= 80 ? "text-red-400" : confidencePct >= 50 ? "text-orange-400" : "text-yellow-400"}`}>
                              {confidencePct}%
                            </span>
                          </div>
                          <div className="flex gap-0.5">
                            {det.signalSources.map((src, i) => {
                              const Icon = SOURCE_ICONS[src.type] || Signal;
                              return (
                                <Tooltip key={i}>
                                  <TooltipTrigger>
                                    <Icon className={`w-3 h-3 ${src.confidence > 0.7 ? "text-green-400" : "text-muted-foreground"}`} />
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">
                                    {src.type.toUpperCase()}: {formatFreq(src.frequencyMHz)} ({src.rssi.toFixed(0)} dBm)
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="p-2 rounded bg-muted/10 text-center">
                              <p className="text-[9px] text-muted-foreground uppercase">Distance</p>
                              <p className="text-sm font-bold font-mono">{formatDistance(det.estimatedDistanceM)}</p>
                            </div>
                            <div className="p-2 rounded bg-muted/10 text-center">
                              <p className="text-[9px] text-muted-foreground uppercase">Direction</p>
                              <p className={`text-sm font-bold ${DIRECTION_COLORS[det.signalDirection]}`}>{det.signalDirection}</p>
                            </div>
                            <div className="p-2 rounded bg-muted/10 text-center">
                              <p className="text-[9px] text-muted-foreground uppercase">Confidence</p>
                              <Progress value={confidencePct} className="h-1.5 mt-1" />
                              <p className="text-xs font-mono mt-0.5">{confidencePct}%</p>
                            </div>
                            <div className="p-2 rounded bg-muted/10 text-center">
                              <p className="text-[9px] text-muted-foreground uppercase">Fusion</p>
                              <p className="text-sm font-bold">{det.fusionScore} source{det.fusionScore > 1 ? "s" : ""}</p>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold uppercase tracking-wider">Signal Sources</p>
                            {det.signalSources.map((src, i) => {
                              const Icon = SOURCE_ICONS[src.type] || Signal;
                              return (
                                <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/10">
                                  <Icon className="w-3.5 h-3.5 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[7px] h-3.5">{src.type.toUpperCase()}</Badge>
                                      <span className="text-[10px] font-mono">{formatFreq(src.frequencyMHz)}</span>
                                      <span className="text-[10px] font-mono">{src.rssi.toFixed(0)} dBm</span>
                                    </div>
                                    <p className="text-[9px] text-muted-foreground truncate">{src.identifier}</p>
                                  </div>
                                  <span className="text-[10px] font-mono shrink-0">{Math.round(src.confidence * 100)}%</span>
                                </div>
                              );
                            })}
                          </div>

                          {det.bestMatch && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wider">Matched Profile</p>
                              <div className="p-2 rounded bg-muted/10 text-[10px] space-y-0.5">
                                <p><span className="text-muted-foreground">System:</span> {det.bestMatch.name}</p>
                                <p><span className="text-muted-foreground">Manufacturer:</span> {det.bestMatch.manufacturer}</p>
                                <p><span className="text-muted-foreground">Protocol:</span> {det.bestMatch.protocol}</p>
                              </div>
                            </div>
                          )}

                          {det.rssiHistory.length > 1 && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wider">RSSI Trend ({det.rssiHistory.length} samples)</p>
                              <RSSITrendChart history={det.rssiHistory} />
                            </div>
                          )}

                          <p className="text-[9px] text-muted-foreground">{det.notes}</p>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {detections.length === 0 ? (
            <Card className="p-8 text-center">
              <Clock className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">No detection history</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {detections.slice(0, 25).map(det => {
                const remoteData = (det.remoteIdData || {}) as Record<string, any>;
                return (
                  <Card key={det.id} className="p-3" data-testid={`card-detection-${det.id}`}>
                    <div className="flex items-center gap-3">
                      <Radar className="w-4 h-4 text-orange-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium">Detection #{det.id}</p>
                          <Badge variant="outline" className="text-[9px]">{det.status}</Badge>
                          {remoteData.confidence && (
                            <Badge variant="outline" className="text-[8px]">{Math.round(remoteData.confidence * 100)}%</Badge>
                          )}
                          {remoteData.matchedProfile && (
                            <Badge variant="outline" className="text-[8px]">{remoteData.matchedProfile}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                          {det.signalStrength != null && (
                            <span className="flex items-center gap-1">
                              <Signal className="w-2.5 h-2.5" />
                              {det.signalStrength.toFixed(0)} dBm
                            </span>
                          )}
                          {det.frequency != null && (
                            <span className="flex items-center gap-1">
                              <Radio className="w-2.5 h-2.5" />
                              {formatFreq(det.frequency)}
                            </span>
                          )}
                          {remoteData.distance != null && (
                            <span className="flex items-center gap-1">
                              <Ruler className="w-2.5 h-2.5" />
                              {formatDistance(remoteData.distance)}
                            </span>
                          )}
                          {remoteData.direction && (
                            <span className={`flex items-center gap-1 ${DIRECTION_COLORS[remoteData.direction as string] || ""}`}>
                              {remoteData.direction}
                            </span>
                          )}
                          {remoteData.fusionScore > 1 && (
                            <Badge variant="outline" className="text-[7px] h-3.5 border-purple-500/30 text-purple-400">
                              MULTI-INT x{remoteData.fusionScore}
                            </Badge>
                          )}
                          {remoteData.sources && (
                            <div className="flex gap-0.5">
                              {(remoteData.sources as any[]).map((src: any, i: number) => {
                                const Icon = SOURCE_ICONS[src.type] || Signal;
                                return <Icon key={i} className="w-2.5 h-2.5" />;
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground shrink-0">
                        {det.lastSeenAt ? new Date(det.lastSeenAt).toLocaleTimeString() : ""}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="signatures" className="space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={sigSearch}
                onChange={e => setSigSearch(e.target.value)}
                placeholder="Search signatures..."
                className="pl-7 text-xs w-[200px]"
                data-testid="input-sig-search"
              />
            </div>
          </div>

          {sigsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {threatOrder.map(level => {
                const sigs = groupedByThreat[level];
                if (!sigs || sigs.length === 0) return null;
                return (
                  <div key={level} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${level === "critical" ? "bg-red-500" : level === "high" ? "bg-orange-500" : level === "medium" ? "bg-yellow-500" : level === "low" ? "bg-green-500" : level === "info" ? "bg-blue-500" : "bg-muted-foreground"}`} />
                      <p className={`text-[10px] uppercase tracking-widest font-bold ${THREAT_COLORS[level]}`}>
                        {level} ({sigs.length})
                      </p>
                    </div>
                    <div className="space-y-1">
                      {sigs.map(sig => {
                        const Icon = sig.signalType === "wifi" ? Wifi : sig.signalType === "bluetooth" ? Bluetooth : Radio;
                        const isExpanded = expandedSig === sig.id;
                        return (
                          <Card
                            key={sig.id}
                            className={`p-3 cursor-pointer border ${THREAT_BG[level]}`}
                            onClick={() => setExpandedSig(isExpanded ? null : sig.id)}
                            data-testid={`card-sig-${sig.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <Icon className={`w-4 h-4 shrink-0 ${THREAT_COLORS[level]}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">{sig.manufacturer} {sig.model}</p>
                                <p className="text-[10px] text-muted-foreground">{sig.protocol} | {sig.frequency}</p>
                              </div>
                              <Badge variant="outline" className="text-[9px] shrink-0">{sig.signalType}</Badge>
                              {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                            </div>
                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-border space-y-1">
                                <p className="text-[10px] text-muted-foreground">{sig.description}</p>
                                {sig.identifiers && sig.identifiers.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <p className="text-[10px] text-muted-foreground mr-1">Identifiers:</p>
                                    {sig.identifiers.map((id, i) => (
                                      <Badge key={i} variant="outline" className="text-[8px]">{id}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="info" className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wider">Counter-UAS Detection Methods</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs font-medium">RF Signal Detection</p>
                <ul className="text-[10px] text-muted-foreground space-y-0.5">
                  <li className="flex items-center gap-1"><Radio className="w-2.5 h-2.5" /> SDR scans 900 MHz, 2.4 GHz, 5.8 GHz drone bands</li>
                  <li className="flex items-center gap-1"><Signal className="w-2.5 h-2.5" /> Spectral pattern matching against known drone profiles</li>
                  <li className="flex items-center gap-1"><Activity className="w-2.5 h-2.5" /> RSSI-based distance estimation (FSPL model)</li>
                  <li className="flex items-center gap-1"><TrendingUp className="w-2.5 h-2.5" /> Movement tracking via RSSI trend analysis</li>
                </ul>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium">Network Detection</p>
                <ul className="text-[10px] text-muted-foreground space-y-0.5">
                  <li className="flex items-center gap-1"><Wifi className="w-2.5 h-2.5" /> WiFi probe: Detect drone access points and control links</li>
                  <li className="flex items-center gap-1"><Bluetooth className="w-2.5 h-2.5" /> BLE: FAA RemoteID broadcast detection</li>
                  <li className="flex items-center gap-1"><Shield className="w-2.5 h-2.5" /> OUI matching: Known drone manufacturer MAC prefixes</li>
                  <li className="flex items-center gap-1"><Target className="w-2.5 h-2.5" /> Multi-INT fusion: Correlate signals for higher confidence</li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Antenna className="w-4 h-4 text-purple-400" />
              <p className="text-xs font-bold uppercase tracking-wider">Monitored Frequency Bands</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="p-2 rounded bg-muted/10 space-y-0.5">
                <p className="text-xs font-medium">900 MHz ISM (860-930 MHz)</p>
                <p className="text-[10px] text-muted-foreground">Long-range drone control: ELRS, TBS Crossfire, some DJI models</p>
              </div>
              <div className="p-2 rounded bg-muted/10 space-y-0.5">
                <p className="text-xs font-medium">1.2 GHz (1200-1350 MHz)</p>
                <p className="text-[10px] text-muted-foreground">Legacy analog FPV video transmitters</p>
              </div>
              <div className="p-2 rounded bg-muted/10 space-y-0.5">
                <p className="text-xs font-medium">2.4 GHz ISM (2390-2490 MHz)</p>
                <p className="text-[10px] text-muted-foreground">Primary drone control and WiFi (most consumer drones)</p>
              </div>
              <div className="p-2 rounded bg-muted/10 space-y-0.5">
                <p className="text-xs font-medium">5.8 GHz ISM (5650-5930 MHz)</p>
                <p className="text-[10px] text-muted-foreground">FPV video, OcuSync/O3/O4 video downlink</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-cyan-400" />
              <p className="text-xs font-bold uppercase tracking-wider">Distance Estimation</p>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Distance is estimated using the Free-Space Path Loss (FSPL) model based on received signal strength (RSSI) and transmission frequency.
              Accuracy depends on environment (line-of-sight, obstructions, multipath) and assumed transmit power.
              Movement direction is determined by RSSI trend analysis over time (increasing RSSI = approaching, decreasing = receding).
            </p>
            <div className="flex gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-red-400"><ArrowUp className="w-3 h-3" /> Approaching: RSSI increasing</span>
              <span className="flex items-center gap-1 text-green-400"><ArrowDown className="w-3 h-3" /> Receding: RSSI decreasing</span>
              <span className="flex items-center gap-1 text-yellow-400"><Minus className="w-3 h-3" /> Hovering: RSSI stable</span>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RSSITrendChart({ history }: { history: { time: number; rssi: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = 60;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "hsla(0, 0%, 0%, 0.3)";
    ctx.fillRect(0, 0, w, h);

    const minRssi = Math.min(...history.map(h => h.rssi)) - 5;
    const maxRssi = Math.max(...history.map(h => h.rssi)) + 5;
    const padding = { left: 30, right: 5, top: 5, bottom: 5 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    ctx.strokeStyle = "hsla(180, 60%, 40%, 0.1)";
    ctx.lineWidth = 0.5;
    for (let db = Math.ceil(minRssi / 10) * 10; db <= maxRssi; db += 10) {
      const y = padding.top + plotH - ((db - minRssi) / (maxRssi - minRssi)) * plotH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = "hsla(180, 40%, 50%, 0.4)";
      ctx.font = "8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${db}`, padding.left - 3, y + 3);
    }

    const lastRssi = history[history.length - 1].rssi;
    const prevRssi = history[history.length - 2].rssi;
    const isApproaching = lastRssi > prevRssi;

    ctx.beginPath();
    ctx.strokeStyle = isApproaching ? "hsl(0, 80%, 55%)" : "hsl(142, 76%, 48%)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < history.length; i++) {
      const x = padding.left + (i / (history.length - 1)) * plotW;
      const y = padding.top + plotH - ((history[i].rssi - minRssi) / (maxRssi - minRssi)) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const lastX = padding.left + plotW;
    const lastY = padding.top + plotH - ((lastRssi - minRssi) / (maxRssi - minRssi)) * plotH;
    ctx.fillStyle = isApproaching ? "hsl(0, 80%, 55%)" : "hsl(142, 76%, 48%)";
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fill();
  }, [history]);

  return <canvas ref={canvasRef} className="w-full rounded" style={{ height: 60 }} data-testid="canvas-rssi-trend" />;
}
