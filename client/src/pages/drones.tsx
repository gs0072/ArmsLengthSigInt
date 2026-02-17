import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import {
  Radar, AlertTriangle, Search, Loader2, Radio, Wifi, Bluetooth,
  Signal, MapPin, Clock, ShieldAlert, Eye, Zap, ChevronDown, ChevronUp,
  RefreshCw
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

const SIGNAL_ICONS: Record<string, typeof Wifi> = {
  wifi: Wifi,
  bluetooth: Bluetooth,
  sdr: Radio,
};

interface ScanResult {
  scannedDevices: number;
  droneMatches: Array<{
    device: any;
    matchedSignature: any;
    confidence: number;
  }>;
  timestamp: number;
}

export default function DronesPage() {
  const queryClient = useQueryClient();
  const [sigSearch, setSigSearch] = useState("");
  const [expandedSig, setExpandedSig] = useState<number | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const { data: signatures = [], isLoading: sigsLoading } = useQuery<DroneSignature[]>({
    queryKey: ["/api/drones/signatures"],
  });

  const { data: detections = [] } = useQuery<DroneDetection[]>({
    queryKey: ["/api/drones/detections"],
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/drones/scan");
      return res.json();
    },
    onSuccess: (data: ScanResult) => {
      setScanResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/drones/detections"] });
    },
  });

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

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4" data-testid="drones-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Drone Detection</h2>
          <Badge variant="outline" className="text-[9px]">{signatures.length} signatures</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            data-testid="button-drone-scan"
          >
            {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Radar className="w-4 h-4 mr-2" />}
            Scan for Drones
          </Button>
        </div>
      </div>

      {scanResult && (
        <Card className={`p-4 ${scanResult.droneMatches.length > 0 ? "border-orange-500/30" : "border-green-500/30"}`}>
          <div className="flex items-center gap-3 mb-3">
            {scanResult.droneMatches.length > 0 ? (
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            ) : (
              <Eye className="w-5 h-5 text-green-400" />
            )}
            <div>
              <p className="text-sm font-medium">
                {scanResult.droneMatches.length > 0
                  ? `${scanResult.droneMatches.length} Potential Drone${scanResult.droneMatches.length > 1 ? "s" : ""} Detected`
                  : "Airspace Clear"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Scanned {scanResult.scannedDevices} nodes | {new Date(scanResult.timestamp).toLocaleTimeString()}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setScanResult(null)}
              className="ml-auto"
              data-testid="button-dismiss-scan"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>

          {scanResult.droneMatches.length > 0 && (
            <div className="space-y-2">
              {scanResult.droneMatches.map((match, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                  <Radar className="w-4 h-4 text-orange-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">
                      {match.device.name || match.device.macAddress || `Device #${match.device.id}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Matched: {match.matchedSignature.manufacturer} {match.matchedSignature.model}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[9px] shrink-0 ${THREAT_COLORS[match.matchedSignature.threatLevel || "unknown"]}`}>
                    {(match.confidence * 100).toFixed(0)}% match
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <Radar className="w-6 h-6 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{signatures.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Known Signatures</p>
        </Card>
        <Card className="p-3 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-orange-400" />
          <p className="text-lg font-bold">{detections.filter(d => d.status === "active").length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Active Detections</p>
        </Card>
        <Card className="p-3 text-center">
          <Eye className="w-6 h-6 mx-auto mb-1 text-green-400" />
          <p className="text-lg font-bold">{detections.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Total Detections</p>
        </Card>
      </div>

      {detections.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Recent Detections
          </h3>
          <div className="space-y-2">
            {detections.slice(0, 10).map(det => (
              <Card key={det.id} className="p-3" data-testid={`card-detection-${det.id}`}>
                <div className="flex items-center gap-3">
                  <Radar className="w-4 h-4 text-orange-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium">Detection #{det.id}</p>
                      <Badge variant="outline" className="text-[9px]">{det.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                      {det.latitude && det.longitude && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          {det.latitude.toFixed(4)}, {det.longitude.toFixed(4)}
                        </span>
                      )}
                      {det.signalStrength != null && (
                        <span className="flex items-center gap-1">
                          <Signal className="w-2.5 h-2.5" />
                          {det.signalStrength.toFixed(0)} dBm
                        </span>
                      )}
                      {det.frequency != null && (
                        <span className="flex items-center gap-1">
                          <Radio className="w-2.5 h-2.5" />
                          {det.frequency.toFixed(1)} MHz
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground shrink-0">
                    {det.lastSeenAt ? new Date(det.lastSeenAt).toLocaleTimeString() : ""}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" />
            Drone Signature Database
          </h3>
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
                      {level} Threat ({sigs.length})
                    </p>
                  </div>
                  <div className="space-y-1">
                    {sigs.map(sig => {
                      const Icon = SIGNAL_ICONS[sig.signalType] || Signal;
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
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <p className="text-xs font-bold uppercase tracking-wider">Counter-UAS Awareness</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium">Detection Methods</p>
            <ul className="text-[10px] text-muted-foreground space-y-0.5">
              <li className="flex items-center gap-1"><Radio className="w-2.5 h-2.5" /> RF Detection: Monitor 2.4/5.8 GHz control links via SDR</li>
              <li className="flex items-center gap-1"><Bluetooth className="w-2.5 h-2.5" /> RemoteID: FAA-mandated BLE/WiFi broadcasts</li>
              <li className="flex items-center gap-1"><Wifi className="w-2.5 h-2.5" /> WiFi Probe: Detect drone WiFi access points</li>
              <li className="flex items-center gap-1"><Signal className="w-2.5 h-2.5" /> Video Downlink: 5.8 GHz FPV video signals</li>
            </ul>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Key Frequencies</p>
            <ul className="text-[10px] text-muted-foreground space-y-0.5">
              <li className="flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> 900 MHz: Long-range control (some DJI, ELRS)</li>
              <li className="flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> 2.4 GHz: Primary control link (most drones)</li>
              <li className="flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> 5.8 GHz: Video/control (FPV, DJI O3/O4)</li>
              <li className="flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> 1.2 GHz: Analog video (legacy systems)</li>
            </ul>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground italic">
          FAA RemoteID (ASTM F3411) requires most drones to broadcast identification via Bluetooth 5.0 or Wi-Fi NaN. Use BLE scanning to detect compliant drones.
        </p>
      </Card>
    </div>
  );
}
