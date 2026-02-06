import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SignalBadge, SignalStrengthBar } from "./signal-badge";
import { GlowLine } from "./scan-animation";
import { AddObservationDialog } from "./add-observation-dialog";
import {
  X, Eye, EyeOff, Flag, MapPin, Clock, Radio, Link2,
  FileText, AlertTriangle, Globe, Fingerprint, Copy, ExternalLink, Brain, Plus
} from "lucide-react";
import { useLocation } from "wouter";
import type { Device, Observation } from "@shared/schema";
import { timeAgo, formatCoordinates, formatFrequency, getSignalLabel } from "@/lib/signal-utils";

interface DeviceDetailProps {
  device: Device;
  observations: Observation[];
  onClose: () => void;
  onToggleTrack: (id: number) => void;
  onToggleFlag: (id: number) => void;
}

export function DeviceDetail({ device, observations, onClose, onToggleTrack, onToggleFlag }: DeviceDetailProps) {
  const [, setLocation] = useLocation();
  const deviceObs = observations
    .filter(o => o.deviceId === device.id)
    .sort((a, b) => new Date(b.observedAt!).getTime() - new Date(a.observedAt!).getTime());

  const latestObs = deviceObs[0];

  return (
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
            <TabsTrigger value="assoc" className="text-xs" data-testid="tab-associations">Links</TabsTrigger>
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
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center py-4">
                Associated devices will appear here when nodes are linked across signal types
              </p>
              {device.associatedDeviceIds && device.associatedDeviceIds.length > 0 && (
                <div className="space-y-1">
                  {device.associatedDeviceIds.map(id => (
                    <div key={id} className="p-2 rounded-md bg-muted/20 flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs">Device #{id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
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
