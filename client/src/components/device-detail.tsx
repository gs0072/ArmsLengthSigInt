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
  FileText, AlertTriangle, Globe, Fingerprint, Copy, ExternalLink, Brain, Plus, Scan, Zap
} from "lucide-react";
import { useLocation } from "wouter";
import type { Device, Observation, DeviceAssociation } from "@shared/schema";
import { timeAgo, formatCoordinates, formatFrequency, getSignalLabel } from "@/lib/signal-utils";
import { useToast } from "@/hooks/use-toast";

const ASSOC_TYPE_LABELS: Record<string, string> = {
  co_movement: "Co-Movement",
  signal_correlation: "Signal Correlation",
  command_control: "Command & Control",
  network_peer: "Network Peer",
  proximity_pattern: "Proximity Pattern",
  frequency_sharing: "Frequency Sharing",
  temporal_correlation: "Temporal Correlation",
  manual: "Manual Link",
};

const ASSOC_TYPE_COLORS: Record<string, string> = {
  co_movement: "hsl(25, 85%, 55%)",
  signal_correlation: "hsl(280, 65%, 55%)",
  command_control: "hsl(0, 72%, 55%)",
  network_peer: "hsl(142, 76%, 48%)",
  proximity_pattern: "hsl(45, 90%, 55%)",
  frequency_sharing: "hsl(185, 100%, 50%)",
  temporal_correlation: "hsl(217, 91%, 60%)",
  manual: "hsl(200, 20%, 50%)",
};

function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return "hsl(142, 76%, 48%)";
  if (confidence >= 60) return "hsl(45, 90%, 55%)";
  if (confidence >= 40) return "hsl(25, 85%, 55%)";
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
      toast({ title: "Analysis Complete", description: "Association analysis finished." });
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
                      className="text-[10px] h-7"
                    >
                      <Scan className="w-3 h-3 mr-1" />
                      {analyzeMutation.isPending ? "Analyzing..." : "Run Analysis"}
                    </Button>
                  </div>

                  {associations.length === 0 ? (
                    <div className="text-center py-6 space-y-2">
                      <Link2 className="w-8 h-8 mx-auto text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground">No associations detected yet</p>
                      <p className="text-[10px] text-muted-foreground/60">Run analysis to detect co-movement, signal correlation, and other SIGINT patterns</p>
                    </div>
                  ) : (
                    associations.map(assoc => {
                      const linked = getLinkedDevice(assoc);
                      const typeColor = ASSOC_TYPE_COLORS[assoc.associationType] || "hsl(200, 20%, 50%)";
                      const confColor = getConfidenceColor(assoc.confidence);
                      return (
                        <button
                          key={assoc.id}
                          onClick={() => setSelectedAssociation(assoc)}
                          className="w-full text-left p-2.5 rounded-md bg-muted/20 hover-elevate space-y-1.5 transition-colors"
                          data-testid={`assoc-link-${assoc.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: typeColor }} />
                              <span className="text-xs font-medium truncate">
                                {linked?.name || `Node #${assoc.deviceId1 === device.id ? assoc.deviceId2 : assoc.deviceId1}`}
                              </span>
                            </div>
                            <Badge variant="outline" className="text-[8px] shrink-0" style={{ borderColor: confColor, color: confColor }}>
                              {Math.round(assoc.confidence)}%
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[8px]" style={{ backgroundColor: `${typeColor}20`, color: typeColor }}>
                              {ASSOC_TYPE_LABELS[assoc.associationType] || assoc.associationType}
                            </Badge>
                            {linked && (
                              <SignalBadge type={linked.signalType} size="sm" />
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
        <DialogContent className="max-w-md" data-testid="dialog-association-detail">
          {selectedAssociation && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-sm">
                  <Link2 className="w-4 h-4 text-primary" />
                  Association Detail
                </DialogTitle>
              </DialogHeader>
              <AssociationDetailContent
                association={selectedAssociation}
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

function AssociationDetailContent({
  association,
  device1,
  device2,
}: {
  association: DeviceAssociation;
  device1?: Device;
  device2?: Device;
}) {
  const typeColor = ASSOC_TYPE_COLORS[association.associationType] || "hsl(200, 20%, 50%)";
  const confColor = getConfidenceColor(association.confidence);
  const evidence = association.evidence as Record<string, unknown> | null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3 py-2">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-1" style={{ borderColor: typeColor, borderWidth: 2 }}>
            <Radio className="w-4 h-4 text-primary" />
          </div>
          <p className="text-[10px] font-medium truncate max-w-[100px]">{device1?.name || `#${association.deviceId1}`}</p>
          <p className="text-[8px] text-muted-foreground">{device1?.signalType?.toUpperCase()}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="h-0.5 w-12 rounded" style={{ background: typeColor }} />
          <Badge variant="outline" className="text-[8px]" style={{ borderColor: confColor, color: confColor }}>
            {Math.round(association.confidence)}% confidence
          </Badge>
        </div>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-1" style={{ borderColor: typeColor, borderWidth: 2 }}>
            <Radio className="w-4 h-4 text-primary" />
          </div>
          <p className="text-[10px] font-medium truncate max-w-[100px]">{device2?.name || `#${association.deviceId2}`}</p>
          <p className="text-[8px] text-muted-foreground">{device2?.signalType?.toUpperCase()}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[9px]" style={{ backgroundColor: `${typeColor}20`, color: typeColor }}>
            {ASSOC_TYPE_LABELS[association.associationType]}
          </Badge>
        </div>

        {association.reasoning && (
          <div className="p-3 rounded-md bg-muted/20 border border-border/30">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Analysis Reasoning</h4>
            <p className="text-xs leading-relaxed">{association.reasoning}</p>
          </div>
        )}

        {evidence && Object.keys(evidence).length > 0 && (
          <div className="p-3 rounded-md bg-muted/20 border border-border/30">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Evidence</h4>
            <div className="space-y-1">
              {Object.entries(evidence).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2 text-xs">
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}</span>
                  <span className="font-mono text-right truncate max-w-[180px]">{String(value)}</span>
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
    </div>
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
