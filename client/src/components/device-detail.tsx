import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignalBadge, SignalStrengthBar } from "./signal-badge";
import { GlowLine } from "./scan-animation";
import { AddObservationDialog } from "./add-observation-dialog";
import {
  X, Eye, EyeOff, Flag, MapPin, Clock, Radio, Link2,
  FileText, AlertTriangle, Globe, Fingerprint, Copy, ExternalLink, Brain, Plus, Scan, Zap,
  TrendingUp, BarChart3, Target
} from "lucide-react";
import { useLocation } from "wouter";
import type { Device, Observation, DeviceAssociation } from "@shared/schema";
import { timeAgo, formatCoordinates, formatFrequency, getSignalLabel, getSignalColor } from "@/lib/signal-utils";
import { useToast } from "@/hooks/use-toast";

const ASSOC_TYPE_LABELS: Record<string, string> = {
  co_movement: "GEOINT Co-Movement",
  signal_correlation: "SIGINT Signal Correlation",
  command_control: "Command & Control",
  network_peer: "Network Peer",
  proximity_pattern: "GEOINT Proximity Pattern",
  frequency_sharing: "MASINT Signature Correlation",
  temporal_correlation: "SIGINT Temporal Pattern",
  geoint_triangulation: "GEOINT Triangulation Fix",
  manual: "Manual Intelligence Link",
};

const ASSOC_TYPE_COLORS: Record<string, string> = {
  co_movement: "hsl(25, 85%, 55%)",
  signal_correlation: "hsl(280, 65%, 55%)",
  command_control: "hsl(0, 72%, 55%)",
  network_peer: "hsl(142, 76%, 48%)",
  proximity_pattern: "hsl(45, 90%, 55%)",
  frequency_sharing: "hsl(185, 100%, 50%)",
  temporal_correlation: "hsl(217, 91%, 60%)",
  geoint_triangulation: "hsl(35, 95%, 52%)",
  manual: "hsl(200, 20%, 50%)",
};

const INTEL_DISCIPLINE_LABELS: Record<string, string> = {
  SIGINT: "Signals Intelligence",
  GEOINT: "Geospatial Intelligence",
  MASINT: "Measurement & Signature Intelligence",
  MULTI_INT: "Multi-Discipline Intelligence",
};

const ASSOC_DISCIPLINE: Record<string, string> = {
  co_movement: "GEOINT",
  signal_correlation: "SIGINT",
  command_control: "SIGINT",
  network_peer: "SIGINT",
  proximity_pattern: "GEOINT",
  frequency_sharing: "MASINT",
  temporal_correlation: "SIGINT",
  geoint_triangulation: "GEOINT",
  manual: "MULTI_INT",
};

const CONFIDENCE_LEVEL_LABELS: Record<string, string> = {
  almost_certain: "Almost Certain",
  highly_likely: "Highly Likely",
  likely: "Likely",
  possible: "Possible",
  unlikely: "Unlikely",
};

const PROBABILITY_SCALE_LABELS: Record<string, string> = {
  very_high: "Very High",
  high: "High",
  moderate: "Moderate",
  low: "Low",
  negligible: "Negligible",
};

function getConfidenceLevelColor(level: string): string {
  switch (level) {
    case "almost_certain": return "hsl(142, 76%, 48%)";
    case "highly_likely": return "hsl(142, 60%, 55%)";
    case "likely": return "hsl(45, 90%, 55%)";
    case "possible": return "hsl(25, 85%, 55%)";
    default: return "hsl(0, 72%, 55%)";
  }
}

function getProbabilityColor(prob: number): string {
  if (prob >= 0.85) return "hsl(142, 76%, 48%)";
  if (prob >= 0.65) return "hsl(142, 60%, 55%)";
  if (prob >= 0.45) return "hsl(45, 90%, 55%)";
  if (prob >= 0.25) return "hsl(25, 85%, 55%)";
  return "hsl(0, 72%, 55%)";
}

interface DeviceDetailProps {
  device: Device;
  observations: Observation[];
  onClose: () => void;
  onToggleTrack: (id: number) => void;
  onToggleFlag: (id: number) => void;
}

export function DeviceDetail({ device, observations, onClose, onToggleTrack, onToggleFlag }: DeviceDetailProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedAssociation, setSelectedAssociation] = useState<DeviceAssociation | null>(null);

  const deviceObs = observations
    .filter(o => o.deviceId === device.id)
    .sort((a, b) => new Date(b.observedAt!).getTime() - new Date(a.observedAt!).getTime());

  const latestObs = deviceObs[0];

  const { data: associations = [] } = useQuery<DeviceAssociation[]>({
    queryKey: ["/api/associations/device", device.id],
  });

  const { data: allDevices = [] } = useQuery<Device[]>({
    queryKey: ["/api/devices"],
  });

  const analyzeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/associations/analyze"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/associations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/associations/device", device.id] });
      toast({ title: "Analysis Complete", description: "SIGINT association analysis finished." });
    },
  });

  function getLinkedDevice(assoc: DeviceAssociation): Device | undefined {
    const linkedId = assoc.deviceId1 === device.id ? assoc.deviceId2 : assoc.deviceId1;
    return allDevices.find(d => d.id === linkedId);
  }

  return (
    <>
      <Card className="flex flex-col h-full overflow-visible">
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 px-3 pt-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">
                {device.name || "Unknown Node"}
              </h3>
              <SignalBadge type={device.signalType} size="sm" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
              {device.macAddress || device.uuid || "No identifier"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <AddObservationDialog
              device={device}
              trigger={
                <Button size="icon" variant="ghost" data-testid="button-add-obs-detail" title="Log new observation">
                  <Plus className="w-4 h-4 text-chart-3" />
                </Button>
              }
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setLocation(`/node-report/${device.id}`)}
              data-testid="button-node-report"
              title="Full SIGINT Node Report"
            >
              <Brain className="w-4 h-4 text-primary" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onToggleTrack(device.id)}
              data-testid="button-toggle-track"
            >
              {device.isTracked ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onToggleFlag(device.id)}
              data-testid="button-toggle-flag"
            >
              <Flag className={`w-4 h-4 ${device.isFlagged ? "text-destructive" : ""}`} />
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-detail">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>

        <GlowLine />

        <CardContent className="flex-1 px-3 pb-3 overflow-hidden">
          <Tabs defaultValue="info" className="h-full flex flex-col">
            <TabsList className="grid grid-cols-4 w-full mb-2">
              <TabsTrigger value="info" className="text-xs" data-testid="tab-info">Info</TabsTrigger>
              <TabsTrigger value="history" className="text-xs" data-testid="tab-history">History</TabsTrigger>
              <TabsTrigger value="raw" className="text-xs" data-testid="tab-raw">Raw Data</TabsTrigger>
              <TabsTrigger value="assoc" className="text-xs" data-testid="tab-associations">
                Links {associations.length > 0 && <Badge variant="secondary" className="ml-1 text-[8px] px-1">{associations.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="flex-1 overflow-auto mt-0">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <InfoField icon={<Fingerprint className="w-3.5 h-3.5" />} label="MAC / UUID" value={device.macAddress || device.uuid || "N/A"} mono />
                  <InfoField icon={<Radio className="w-3.5 h-3.5" />} label="Signal Type" value={getSignalLabel(device.signalType)} />
                  <InfoField label="Manufacturer" value={device.manufacturer || "Unknown"} />
                  <InfoField label="Model" value={device.model || "Unknown"} />
                  <InfoField label="Device Type" value={device.deviceType || "Unknown"} />
                  <InfoField icon={<Clock className="w-3.5 h-3.5" />} label="First Seen" value={timeAgo(device.firstSeenAt)} />
                  <InfoField icon={<Clock className="w-3.5 h-3.5" />} label="Last Seen" value={timeAgo(device.lastSeenAt)} />
                  <InfoField label="Observations" value={String(deviceObs.length)} />
                </div>

                {latestObs && (
                  <>
                    <GlowLine />
                    <div className="space-y-1">
                      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground">Latest Observation</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <InfoField label="Signal Strength" value={`${latestObs.signalStrength ?? "N/A"} dBm`} />
                        <InfoField label="Frequency" value={formatFrequency(latestObs.frequency)} />
                        <InfoField icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={formatCoordinates(latestObs.latitude, latestObs.longitude)} mono />
                        <InfoField label="Channel" value={latestObs.channel ? String(latestObs.channel) : "N/A"} />
                        <InfoField label="Protocol" value={latestObs.protocol || "N/A"} />
                        <InfoField label="Encryption" value={latestObs.encryption || "None"} />
                      </div>
                    </div>
                  </>
                )}

                {device.notes && (
                  <>
                    <GlowLine />
                    <div>
                      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</h4>
                      <p className="text-xs">{device.notes}</p>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-hidden mt-0">
              <ScrollArea className="h-full">
                <div className="space-y-1">
                  {deviceObs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No observations recorded</p>
                  ) : (
                    deviceObs.map(obs => (
                      <div key={obs.id} className="p-2 rounded-md bg-muted/20 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">{new Date(obs.observedAt!).toLocaleString()}</span>
                          <SignalStrengthBar strength={obs.signalStrength} />
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>{obs.signalStrength ?? "?"} dBm</span>
                          {obs.latitude && obs.longitude && (
                            <span className="text-muted-foreground flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              {formatCoordinates(obs.latitude, obs.longitude)}
                            </span>
                          )}
                          {obs.frequency && (
                            <span className="text-muted-foreground">{formatFrequency(obs.frequency)}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="raw" className="flex-1 overflow-hidden mt-0">
              <ScrollArea className="h-full">
                <div className="space-y-2">
                  {deviceObs.filter(o => o.rawData || o.hexData || o.asciiData).length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No raw data captured</p>
                  ) : (
                    deviceObs.filter(o => o.rawData || o.hexData || o.asciiData).map(obs => (
                      <div key={obs.id} className="p-2 rounded-md bg-muted/20">
                        <div className="text-[10px] text-muted-foreground mb-1">
                          {new Date(obs.observedAt!).toLocaleString()}
                        </div>
                        {obs.hexData && (
                          <div className="font-mono text-[10px] text-primary/80 break-all leading-relaxed">
                            HEX: {obs.hexData}
                          </div>
                        )}
                        {obs.asciiData && (
                          <div className="font-mono text-[10px] text-chart-3 break-all leading-relaxed">
                            ASCII: {obs.asciiData}
                          </div>
                        )}
                        {obs.rawData && (
                          <div className="font-mono text-[10px] text-chart-4 break-all leading-relaxed">
                            RAW: {obs.rawData}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="assoc" className="flex-1 overflow-hidden mt-0">
              <ScrollArea className="h-full">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Intelligence Links</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => analyzeMutation.mutate()}
                      disabled={analyzeMutation.isPending}
                      data-testid="button-run-analysis"
                    >
                      <Scan className="w-3 h-3 mr-1" />
                      {analyzeMutation.isPending ? "Analyzing..." : "Run Analysis"}
                    </Button>
                  </div>

                  {associations.length === 0 ? (
                    <div className="text-center py-6 space-y-2">
                      <Link2 className="w-8 h-8 mx-auto text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground">No associations detected</p>
                      <p className="text-[10px] text-muted-foreground/60">Run analysis to detect Multi-INT patterns: GEOINT co-movement, SIGINT signal correlation, MASINT signature matching, and triangulated location fixes</p>
                    </div>
                  ) : (
                    associations.map(assoc => {
                      const linked = getLinkedDevice(assoc);
                      const typeColor = ASSOC_TYPE_COLORS[assoc.associationType] || "hsl(200, 20%, 50%)";
                      const evidence = assoc.evidence as Record<string, unknown> | null;
                      const confidenceLevel = evidence?.confidenceLevel as string || "";
                      const posterior = (evidence?.posteriorProbability as number) || assoc.confidence / 100;
                      const levelColor = getConfidenceLevelColor(confidenceLevel);
                      const levelLabel = CONFIDENCE_LEVEL_LABELS[confidenceLevel] || `${Math.round(assoc.confidence)}%`;

                      return (
                        <button
                          key={assoc.id}
                          onClick={() => setSelectedAssociation(assoc)}
                          className="w-full text-left p-2.5 rounded-md bg-muted/20 hover-elevate space-y-1.5 transition-colors"
                          data-testid={`assoc-link-${assoc.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Radio className="w-3.5 h-3.5 shrink-0" style={{ color: typeColor }} />
                              <span className="text-xs font-medium truncate">
                                {linked?.name || `Node #${assoc.deviceId1 === device.id ? assoc.deviceId2 : assoc.deviceId1}`}
                              </span>
                              {linked && <SignalBadge type={linked.signalType} size="sm" />}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[7px] font-mono">
                              {ASSOC_DISCIPLINE[assoc.associationType] || "INT"}
                            </Badge>
                            <Badge variant="secondary" className="text-[8px]" style={{ backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`, color: typeColor }}>
                              {ASSOC_TYPE_LABELS[assoc.associationType] || assoc.associationType}
                            </Badge>
                            <Badge variant="outline" className="text-[8px]" style={{ borderColor: levelColor, color: levelColor }}>
                              {levelLabel}
                            </Badge>
                            {typeof evidence?.likelihoodRatio === "number" && evidence.likelihoodRatio > 0 && (
                              <span className="text-[9px] text-muted-foreground font-mono">
                                LR {evidence.likelihoodRatio.toFixed(1)}:1
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!selectedAssociation} onOpenChange={() => setSelectedAssociation(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-association-detail">
          {selectedAssociation && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm">
                  <Target className="w-4 h-4 text-primary" />
                  Multi-INT Association Intelligence
                </DialogTitle>
              </DialogHeader>
              <AssociationDetailContent
                association={selectedAssociation}
                currentDevice={device}
                device1={allDevices.find(d => d.id === selectedAssociation.deviceId1)}
                device2={allDevices.find(d => d.id === selectedAssociation.deviceId2)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MiniLinkDiagram({
  device1,
  device2,
  typeColor,
  associationType,
}: {
  device1?: Device;
  device2?: Device;
  typeColor: string;
  associationType: string;
}) {
  const d1Color = device1 ? getSignalColor(device1.signalType) : "hsl(200, 20%, 50%)";
  const d2Color = device2 ? getSignalColor(device2.signalType) : "hsl(200, 20%, 50%)";

  return (
    <div className="flex items-center justify-center gap-1 py-3" data-testid="mini-link-diagram">
      <div className="flex flex-col items-center gap-1 min-w-0 max-w-[120px]">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `2px solid ${d1Color}`, backgroundColor: `color-mix(in srgb, ${d1Color} 10%, transparent)` }}>
          <Radio className="w-4 h-4" style={{ color: d1Color }} />
        </div>
        <p className="text-[10px] font-medium truncate w-full text-center">{device1?.name || "Unknown"}</p>
        <p className="text-[8px] text-muted-foreground">{device1?.signalType?.toUpperCase()}</p>
      </div>

      <div className="flex flex-col items-center gap-0.5 px-2">
        <div className="w-16 h-0.5 rounded" style={{ background: typeColor }} />
        <Badge variant="secondary" className="text-[7px] px-1" style={{ backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`, color: typeColor }}>
          {ASSOC_TYPE_LABELS[associationType] || associationType}
        </Badge>
        <div className="w-16 h-0.5 rounded" style={{ background: typeColor }} />
      </div>

      <div className="flex flex-col items-center gap-1 min-w-0 max-w-[120px]">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ border: `2px solid ${d2Color}`, backgroundColor: `color-mix(in srgb, ${d2Color} 10%, transparent)` }}>
          <Radio className="w-4 h-4" style={{ color: d2Color }} />
        </div>
        <p className="text-[10px] font-medium truncate w-full text-center">{device2?.name || "Unknown"}</p>
        <p className="text-[8px] text-muted-foreground">{device2?.signalType?.toUpperCase()}</p>
      </div>
    </div>
  );
}

function ProbabilityBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="space-y-1" data-testid="probability-bar">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] font-mono font-medium" style={{ color }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function AssociationDetailContent({
  association,
  currentDevice,
  device1,
  device2,
}: {
  association: DeviceAssociation;
  currentDevice: Device;
  device1?: Device;
  device2?: Device;
}) {
  const typeColor = ASSOC_TYPE_COLORS[association.associationType] || "hsl(200, 20%, 50%)";
  const evidence = association.evidence as Record<string, unknown> | null;

  const method = (evidence?.method as string) || "Statistical Analysis";
  const methodDesc = (evidence?.methodDescription as string) || "";
  const lr = (evidence?.likelihoodRatio as number) || 1;
  const posterior = (evidence?.posteriorProbability as number) || association.confidence / 100;
  const confidenceLevel = (evidence?.confidenceLevel as string) || "possible";
  const probabilityScale = (evidence?.probabilityScale as string) || "moderate";
  const sampleSize = (evidence?.sampleSize as number) || 0;
  const df = (evidence?.degreesOfFreedom as number) || 0;
  const nullH = (evidence?.nullHypothesis as string) || "";
  const altH = (evidence?.alternativeHypothesis as string) || "";
  const testStat = (evidence?.testStatistic as number) || 0;
  const pValue = (evidence?.pValue as number) || 1;
  const obs = (evidence?.observations as Record<string, unknown>) || {};

  const discipline = (evidence?.discipline as string) || ASSOC_DISCIPLINE[association.associationType] || "MULTI_INT";
  const disciplineLabel = INTEL_DISCIPLINE_LABELS[discipline] || discipline;

  const levelColor = getConfidenceLevelColor(confidenceLevel);
  const probColor = getProbabilityColor(posterior);
  const levelLabel = CONFIDENCE_LEVEL_LABELS[confidenceLevel] || confidenceLevel;
  const scaleLabel = PROBABILITY_SCALE_LABELS[probabilityScale] || probabilityScale;

  return (
    <ScrollArea className="max-h-[70vh]">
      <div className="space-y-4 pr-2">
        <MiniLinkDiagram
          device1={device1}
          device2={device2}
          typeColor={typeColor}
          associationType={association.associationType}
        />

        <div className="flex items-center justify-center gap-2" data-testid="intel-discipline-badge">
          <Badge variant="outline" className="text-[9px] font-mono">
            {discipline}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{disciplineLabel}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-md bg-muted/20 text-center">
            <TrendingUp className="w-3.5 h-3.5 mx-auto mb-1 text-primary" />
            <p className="text-[9px] text-muted-foreground">Likelihood Ratio</p>
            <p className="text-sm font-mono font-semibold" style={{ color: probColor }}>{lr.toFixed(1)}:1</p>
          </div>
          <div className="p-2 rounded-md bg-muted/20 text-center">
            <BarChart3 className="w-3.5 h-3.5 mx-auto mb-1 text-primary" />
            <p className="text-[9px] text-muted-foreground">Confidence</p>
            <p className="text-xs font-semibold" style={{ color: levelColor }}>{levelLabel}</p>
          </div>
          <div className="p-2 rounded-md bg-muted/20 text-center">
            <Target className="w-3.5 h-3.5 mx-auto mb-1 text-primary" />
            <p className="text-[9px] text-muted-foreground">Probability</p>
            <p className="text-xs font-semibold" style={{ color: probColor }}>{scaleLabel}</p>
          </div>
        </div>

        <ProbabilityBar value={posterior} color={probColor} label="Posterior Probability" />

        <div className="p-3 rounded-md bg-muted/20 border border-border/30">
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
            <Scan className="w-3 h-3" />
            Statistical Method
          </h4>
          <p className="text-xs font-medium mb-1" style={{ color: typeColor }}>{method}</p>
          {methodDesc && <p className="text-[10px] text-muted-foreground leading-relaxed">{methodDesc}</p>}
        </div>

        {association.reasoning && (
          <div className="p-3 rounded-md bg-muted/20 border border-border/30">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Analysis Reasoning</h4>
            <p className="text-xs leading-relaxed">{association.reasoning}</p>
          </div>
        )}

        <div className="p-3 rounded-md bg-muted/20 border border-border/30">
          <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Hypothesis Test</h4>
          <div className="space-y-2">
            <div>
              <span className="text-[9px] text-muted-foreground">H0 (Null):</span>
              <p className="text-[10px] leading-relaxed">{nullH}</p>
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground">H1 (Alternative):</span>
              <p className="text-[10px] leading-relaxed">{altH}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <span className="text-[9px] text-muted-foreground">Test Statistic</span>
                <p className="text-[10px] font-mono">{testStat.toFixed(3)}</p>
              </div>
              <div>
                <span className="text-[9px] text-muted-foreground">p-Value</span>
                <p className="text-[10px] font-mono" style={{ color: pValue < 0.05 ? "hsl(142, 76%, 48%)" : pValue < 0.10 ? "hsl(45, 90%, 55%)" : "hsl(0, 72%, 55%)" }}>
                  {pValue < 0.0001 ? "<0.0001" : pValue.toFixed(4)}
                </p>
              </div>
              <div>
                <span className="text-[9px] text-muted-foreground">Sample Size</span>
                <p className="text-[10px] font-mono">n={sampleSize} (df={df})</p>
              </div>
            </div>
          </div>
        </div>

        {Object.keys(obs).length > 0 && (
          <div className="p-3 rounded-md bg-muted/20 border border-border/30">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Observation Data</h4>
            <div className="space-y-0.5">
              {Object.entries(obs).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2 text-[10px]">
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}</span>
                  <span className="font-mono text-right truncate max-w-[180px]">
                    {Array.isArray(value) ? value.join(", ") : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] text-muted-foreground">First Observed</span>
            <p className="font-mono text-[10px]">{association.firstObserved ? new Date(association.firstObserved).toLocaleDateString() : "N/A"}</p>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground">Last Observed</span>
            <p className="font-mono text-[10px]">{association.lastObserved ? new Date(association.lastObserved).toLocaleDateString() : "N/A"}</p>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function InfoField({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className={`text-xs truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
