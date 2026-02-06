import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Radio, Antenna, Loader2, Play, Square, Wifi, Server, AlertTriangle, Check, X, Signal } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface NmapHost {
  ip: string;
  hostname: string;
  mac: string;
  vendor: string;
  status: string;
  ports: Array<{ port: number; protocol: string; state: string; service: string; version: string }>;
  os: string;
}

interface NmapResult {
  scanType: string;
  target: string;
  startTime: number;
  endTime: number;
  hosts: NmapHost[];
  rawOutput: string;
  error: string | null;
}

interface MeshtasticConnection {
  id: string;
  host: string;
  port: number;
  status: string;
  deviceName: string;
  firmwareVersion: string;
  nodes: any[];
  messages: any[];
  lastUpdate: number;
  error: string | null;
}

interface SDRStatus {
  toolsInstalled: boolean;
  devicesConnected: number;
  supportedRange: string;
}

function NmapPanel() {
  const [target, setTarget] = useState("192.168.1.0/24");
  const [scanType, setScanType] = useState("ping");
  const [ports, setPorts] = useState("1-1024");
  const { toast } = useToast();

  const { data: nmapStatus } = useQuery<{ available: boolean; version: string }>({
    queryKey: ["/api/nmap/status"],
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/nmap/scan", { target, scanType, ports: scanType === "port" ? ports : undefined });
      return res.json() as Promise<NmapResult>;
    },
    onSuccess: (data) => {
      if (data.error) {
        toast({ title: "Scan Warning", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Scan Complete", description: `Found ${data.hosts.length} hosts` });
      }
    },
    onError: () => {
      toast({ title: "Scan Failed", description: "Network scan failed", variant: "destructive" });
    },
  });

  const result = scanMutation.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Network Scanner (nmap)</h3>
        </div>
        {nmapStatus && (
          <Badge variant="outline" className="text-[8px]" style={{ color: nmapStatus.available ? "hsl(142, 76%, 48%)" : undefined, borderColor: nmapStatus.available ? "hsl(142, 76%, 48%)" : undefined }}>
            {nmapStatus.available ? "Installed" : "Not Available"}
          </Badge>
        )}
      </div>

      {nmapStatus?.version && (
        <p className="text-[10px] text-muted-foreground">{nmapStatus.version}</p>
      )}

      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="Target (e.g., 192.168.1.0/24)"
              className="text-xs h-8"
              data-testid="input-nmap-target"
            />
          </div>
          <Select value={scanType} onValueChange={setScanType}>
            <SelectTrigger className="w-[100px] h-8 text-xs" data-testid="select-nmap-scan-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ping">Ping</SelectItem>
              <SelectItem value="quick">Quick</SelectItem>
              <SelectItem value="port">Port</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scanType === "port" && (
          <Input
            value={ports}
            onChange={e => setPorts(e.target.value)}
            placeholder="Ports (e.g., 1-1024, 80,443)"
            className="text-xs h-8"
            data-testid="input-nmap-ports"
          />
        )}

        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending || !target.trim() || !nmapStatus?.available}
          className="w-full"
          data-testid="button-nmap-scan"
        >
          {scanMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Scanning...</>
          ) : (
            <><Play className="w-4 h-4 mr-2" /> Run Scan</>
          )}
        </Button>

        <p className="text-[9px] text-muted-foreground">
          Restricted to private networks (10.x, 172.16-31.x, 192.168.x, 127.x). CIDR /16 minimum.
        </p>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-medium">Results</h4>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[8px]">{result.scanType} scan</Badge>
              <Badge variant="outline" className="text-[8px]">{result.hosts.length} hosts</Badge>
              <Badge variant="outline" className="text-[8px]">{((result.endTime - result.startTime) / 1000).toFixed(1)}s</Badge>
            </div>
          </div>

          {result.error && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-[10px] text-destructive">{result.error}</p>
            </div>
          )}

          <div className="space-y-2 max-h-[300px] overflow-auto">
            {result.hosts.map((host, i) => (
              <Card key={i} className="p-3 space-y-2" data-testid={`nmap-host-${i}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium font-mono">{host.ip}</span>
                    {host.hostname && <span className="text-[10px] text-muted-foreground">({host.hostname})</span>}
                  </div>
                  <Badge variant="outline" className="text-[8px]" style={{ color: host.status === "up" ? "hsl(142, 76%, 48%)" : "hsl(0, 72%, 55%)", borderColor: host.status === "up" ? "hsl(142, 76%, 48%)" : "hsl(0, 72%, 55%)" }}>
                    {host.status}
                  </Badge>
                </div>
                {host.mac && (
                  <div className="text-[10px] text-muted-foreground">
                    MAC: <span className="font-mono">{host.mac}</span> {host.vendor && `(${host.vendor})`}
                  </div>
                )}
                {host.os && (
                  <div className="text-[10px] text-muted-foreground">OS: {host.os}</div>
                )}
                {host.ports.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Open Ports</p>
                    {host.ports.filter(p => p.state === "open").map(port => (
                      <div key={`${port.port}-${port.protocol}`} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="font-mono">{port.port}/{port.protocol}</span>
                        <span className="text-muted-foreground">{port.service}</span>
                        {port.version && <span className="text-muted-foreground truncate">{port.version}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MeshtasticPanel() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("4403");
  const { toast } = useToast();

  const { data: status } = useQuery<{ available: boolean; activeConnections: number; totalNodes: number }>({
    queryKey: ["/api/meshtastic/status"],
  });

  const { data: connections = [] } = useQuery<MeshtasticConnection[]>({
    queryKey: ["/api/meshtastic/connections"],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meshtastic/connect", { host, port: parseInt(port) });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/status"] });
      if (data.status === "error") {
        toast({ title: "Connection Failed", description: data.error || "Could not reach device", variant: "destructive" });
      } else {
        toast({ title: "Connected", description: `Connected to ${data.deviceName}` });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to connect to Meshtastic device", variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", "/api/meshtastic/disconnect", { id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/status"] });
      toast({ title: "Disconnected", description: "Device disconnected" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4" style={{ color: "hsl(25, 85%, 55%)" }} />
          <h3 className="text-sm font-semibold">Meshtastic / LoRa Mesh</h3>
        </div>
        {status && (
          <div className="flex gap-1">
            <Badge variant="outline" className="text-[8px]">{status.activeConnections} connections</Badge>
            <Badge variant="outline" className="text-[8px]">{status.totalNodes} nodes</Badge>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Connect to a Meshtastic device on your network via HTTP API. The device must have the HTTP API enabled (default port 4403).
      </p>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="Device IP (e.g., 192.168.1.100)"
            className="text-xs h-8 flex-1"
            data-testid="input-meshtastic-host"
          />
          <Input
            value={port}
            onChange={e => setPort(e.target.value)}
            placeholder="Port"
            className="text-xs h-8 w-20"
            data-testid="input-meshtastic-port"
          />
        </div>
        <Button
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending || !host.trim()}
          className="w-full"
          data-testid="button-meshtastic-connect"
        >
          {connectMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Connecting...</>
          ) : (
            <><Radio className="w-4 h-4 mr-2" /> Connect</>
          )}
        </Button>
      </div>

      {connections.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium">Active Connections</h4>
          {connections.map(conn => (
            <Card key={conn.id} className="p-3 space-y-2" data-testid={`meshtastic-conn-${conn.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5" style={{ color: "hsl(25, 85%, 55%)" }} />
                  <span className="text-xs font-medium">{conn.deviceName || conn.host}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[8px]" style={{
                    color: conn.status === "connected" ? "hsl(142, 76%, 48%)" : conn.status === "error" ? "hsl(0, 72%, 55%)" : undefined,
                    borderColor: conn.status === "connected" ? "hsl(142, 76%, 48%)" : conn.status === "error" ? "hsl(0, 72%, 55%)" : undefined,
                  }}>
                    {conn.status}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => disconnectMutation.mutate(conn.id)}
                    data-testid={`button-meshtastic-disconnect-${conn.id}`}
                  >
                    <Square className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              {conn.error && (
                <p className="text-[10px] text-destructive">{conn.error}</p>
              )}
              <div className="text-[10px] text-muted-foreground">
                {conn.host}:{conn.port} | {conn.nodes.length} mesh nodes | {conn.messages.length} messages
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SDRPanel() {
  const [startFreq, setStartFreq] = useState("88");
  const [endFreq, setEndFreq] = useState("108");
  const { toast } = useToast();

  const { data: sdrStatus } = useQuery<SDRStatus>({
    queryKey: ["/api/sdr/status"],
  });

  const { data: sdrTools } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/sdr/tools"],
  });

  const { data: sdrDevices = [] } = useQuery<Array<{ index: number; name: string; vendor: string; available: boolean }>>({
    queryKey: ["/api/sdr/devices"],
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sdr/scan", {
        startFreqMHz: parseFloat(startFreq),
        endFreqMHz: parseFloat(endFreq),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.error) {
        toast({ title: "SDR Scan Warning", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "SDR Scan Complete", description: `Found ${data.signals?.length || 0} signals` });
      }
    },
    onError: () => {
      toast({ title: "Scan Failed", description: "SDR scan failed. Ensure device is connected.", variant: "destructive" });
    },
  });

  const result = scanMutation.data as any;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Antenna className="w-4 h-4" style={{ color: "hsl(280, 65%, 55%)" }} />
          <h3 className="text-sm font-semibold">Software Defined Radio (SDR)</h3>
        </div>
        {sdrStatus && (
          <div className="flex gap-1">
            <Badge variant="outline" className="text-[8px]" style={{ color: sdrStatus.toolsInstalled ? "hsl(142, 76%, 48%)" : undefined, borderColor: sdrStatus.toolsInstalled ? "hsl(142, 76%, 48%)" : undefined }}>
              {sdrStatus.toolsInstalled ? "Tools Ready" : "Not Installed"}
            </Badge>
            <Badge variant="outline" className="text-[8px]">
              {sdrStatus.devicesConnected} devices
            </Badge>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        Connect an RTL-SDR USB dongle to scan radio frequencies. Supported range: {sdrStatus?.supportedRange || "24 - 1766 MHz"}.
      </p>

      {sdrTools && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">SDR Tools</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(sdrTools).map(([tool, installed]) => (
              <Badge key={tool} variant="outline" className="text-[8px]" style={{
                color: installed ? "hsl(142, 76%, 48%)" : undefined,
                borderColor: installed ? "hsl(142, 76%, 48%)" : undefined,
                opacity: installed ? 1 : 0.4,
              }}>
                {installed ? <Check className="w-2.5 h-2.5 mr-0.5" /> : <X className="w-2.5 h-2.5 mr-0.5" />}
                {tool.replace(/([A-Z])/g, " $1").trim()}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {sdrDevices.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Connected Devices</p>
          {sdrDevices.map(dev => (
            <div key={dev.index} className="flex items-center justify-between gap-2 text-[10px] p-2 rounded-md border border-border/50 bg-muted/10">
              <span className="font-medium">{dev.name}</span>
              <span className="text-muted-foreground">{dev.vendor}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[9px] text-muted-foreground mb-1 block">Start (MHz)</label>
            <Input
              value={startFreq}
              onChange={e => setStartFreq(e.target.value)}
              placeholder="88"
              className="text-xs h-8 font-mono"
              data-testid="input-sdr-start-freq"
            />
          </div>
          <div className="flex-1">
            <label className="text-[9px] text-muted-foreground mb-1 block">End (MHz)</label>
            <Input
              value={endFreq}
              onChange={e => setEndFreq(e.target.value)}
              placeholder="108"
              className="text-xs h-8 font-mono"
              data-testid="input-sdr-end-freq"
            />
          </div>
        </div>

        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending || !sdrStatus?.toolsInstalled}
          className="w-full"
          data-testid="button-sdr-scan"
        >
          {scanMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Scanning RF...</>
          ) : (
            <><Signal className="w-4 h-4 mr-2" /> Scan Spectrum</>
          )}
        </Button>

        {!sdrStatus?.toolsInstalled && (
          <p className="text-[9px] text-muted-foreground">
            RTL-SDR tools are installed on the server. Connect an RTL-SDR USB dongle to begin scanning.
          </p>
        )}

        {sdrStatus?.devicesConnected === 0 && sdrStatus?.toolsInstalled && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-muted/10 border border-border/50">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground">No RTL-SDR devices detected. Connect a USB dongle to start scanning.</p>
          </div>
        )}
      </div>

      {result?.signals?.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium">Detected Signals ({result.signals.length})</h4>
          <div className="space-y-1 max-h-[200px] overflow-auto">
            {result.signals.map((sig: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2 text-[10px] p-1.5 rounded-md border border-border/20 bg-muted/5">
                <span className="font-mono">{(sig.frequency / 1e6).toFixed(3)} MHz</span>
                <span className="text-muted-foreground">{sig.power.toFixed(1)} dBm</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ToolsPage() {
  return (
    <div className="p-4 space-y-4 h-full overflow-auto">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold" data-testid="text-tools-title">SIGINT Tools</h2>
        <Badge variant="outline" className="text-[8px] uppercase tracking-wider">
          Integration Hub
        </Badge>
      </div>

      <Tabs defaultValue="nmap" className="w-full">
        <TabsList className="w-full" data-testid="tools-tabs">
          <TabsTrigger value="nmap" className="flex-1 text-xs" data-testid="tab-nmap">
            <Globe className="w-3.5 h-3.5 mr-1.5" />
            Network
          </TabsTrigger>
          <TabsTrigger value="meshtastic" className="flex-1 text-xs" data-testid="tab-meshtastic">
            <Radio className="w-3.5 h-3.5 mr-1.5" />
            Meshtastic
          </TabsTrigger>
          <TabsTrigger value="sdr" className="flex-1 text-xs" data-testid="tab-sdr">
            <Antenna className="w-3.5 h-3.5 mr-1.5" />
            SDR
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nmap" className="mt-4">
          <Card className="p-4">
            <NmapPanel />
          </Card>
        </TabsContent>

        <TabsContent value="meshtastic" className="mt-4">
          <Card className="p-4">
            <MeshtasticPanel />
          </Card>
        </TabsContent>

        <TabsContent value="sdr" className="mt-4">
          <Card className="p-4">
            <SDRPanel />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
