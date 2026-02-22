import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Radio, Wifi, MapPin, Send, Battery, Signal, Users, Settings,
  Plus, Trash2, Loader2, RefreshCw, Circle, MessageSquare, Zap,
  Antenna, Network, Shield, Globe, ChevronDown, ChevronUp,
  Activity, AlertTriangle, Volume2, Hash, BarChart3, Navigation,
  Power, Repeat, Router, Smartphone, Eye, EyeOff, Copy, Check, X
} from "lucide-react";

interface MeshtasticNode {
  nodeNum: number;
  longName: string;
  shortName: string;
  macAddr: string;
  hwModel: string;
  role: string;
  lastHeard: number;
  snr: number;
  batteryLevel: number;
  voltage: number;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  hopsAway: number;
  airUtilTx?: number;
  channelUtilization?: number;
  uptimeSeconds?: number;
  temperature?: number;
  relativeHumidity?: number;
  barometricPressure?: number;
  isOnline?: boolean;
  lastRssi?: number;
  isFavorite?: boolean;
}

interface MeshtasticMessage {
  id: number;
  from: number;
  to: number;
  channel: number;
  text: string;
  timestamp: number;
  rxSnr: number;
  hopLimit: number;
  rxRssi?: number;
  fromName?: string;
  acknowledged?: boolean;
  portnum?: string;
}

interface MeshChannel {
  index: number;
  name: string;
  role: "disabled" | "primary" | "secondary";
  psk: string;
  uplinkEnabled: boolean;
  downlinkEnabled: boolean;
  positionPrecision: number;
}

interface MeshRadioConfig {
  region: string;
  modemPreset: string;
  hopLimit: number;
  txPower: number;
  txEnabled: boolean;
  bandwidth: number;
  spreadFactor: number;
  codingRate: number;
  frequencyOffset: number;
}

interface MeshcoreConfig {
  isRepeater: boolean;
  managedFlood: boolean;
  floodRadius: number;
  heartbeatInterval: number;
  clientRegistration: boolean;
  maxClients: number;
  registeredClients: Array<{ nodeNum: number; name: string; lastSeen: number; rssi: number; hops: number }>;
}

interface MeshTopologyLink {
  from: number;
  to: number;
  snr: number;
  rssi?: number;
  lastUpdate: number;
}

interface MeshtasticConnection {
  id: string;
  host: string;
  port: number;
  status: "disconnected" | "connecting" | "connected" | "error";
  deviceName: string;
  firmwareVersion: string;
  myNodeNum: number;
  nodes: MeshtasticNode[];
  messages: MeshtasticMessage[];
  channels: MeshChannel[];
  radioConfig: MeshRadioConfig;
  meshcoreConfig: MeshcoreConfig;
  topology: MeshTopologyLink[];
  lastUpdate: number;
  error: string | null;
  uptimeStart: number;
}

interface ConfigOptions {
  regions: string[];
  modemPresets: string[];
  nodeRoles: string[];
  hwModels: string[];
}

function getRoleIcon(role: string) {
  switch (role?.toUpperCase()) {
    case "ROUTER": case "ROUTER_CLIENT": return <Router className="w-3 h-3" />;
    case "REPEATER": return <Repeat className="w-3 h-3" />;
    case "TRACKER": case "TAK_TRACKER": return <Navigation className="w-3 h-3" />;
    case "SENSOR": return <Activity className="w-3 h-3" />;
    default: return <Smartphone className="w-3 h-3" />;
  }
}

function getBatteryColor(level: number): string {
  if (level > 60) return "hsl(142, 76%, 48%)";
  if (level > 30) return "hsl(45, 90%, 50%)";
  return "hsl(0, 72%, 55%)";
}

function getSnrColor(snr: number): string {
  if (snr > 5) return "hsl(142, 76%, 48%)";
  if (snr > 0) return "hsl(45, 90%, 50%)";
  return "hsl(0, 72%, 55%)";
}

function formatTimestamp(ts: number): string {
  if (!ts) return "Never";
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ConnectionPanel({ connections, onRefresh }: { connections: MeshtasticConnection[]; onRefresh: () => void }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("4403");
  const { toast } = useToast();

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meshtastic/connect", { host, port: parseInt(port) });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/status"] });
      if (data.status === "error") {
        toast({ title: "Connection Failed", description: data.error || "Could not reach device", variant: "destructive" });
      } else {
        toast({ title: "Connected", description: `Connected to ${data.deviceName}` });
        setHost("");
      }
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
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/meshtastic/connections/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/status"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5" style={{ color: "hsl(25, 85%, 55%)" }} />
          Device Connections
        </h3>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRefresh} data-testid="button-refresh-connections">
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex gap-1.5">
        <Input
          value={host}
          onChange={e => setHost(e.target.value)}
          placeholder="IP (e.g., 192.168.1.100)"
          className="text-xs h-7 flex-1 font-mono"
          data-testid="input-mesh-host"
        />
        <Input
          value={port}
          onChange={e => setPort(e.target.value)}
          placeholder="Port"
          className="text-xs h-7 w-16 font-mono"
          data-testid="input-mesh-port"
        />
        <Button
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending || !host.trim()}
          size="sm"
          className="h-7 text-[10px] px-2"
          data-testid="button-mesh-connect"
        >
          {connectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        </Button>
      </div>

      <p className="text-[9px] text-muted-foreground">
        Connect to Meshtastic/Meshcore devices via HTTP API. Device must have web server enabled (default port 4403). Only local network IPs allowed.
      </p>

      {connections.map(conn => (
        <Card key={conn.id} className="p-2 space-y-1.5 border-border/30" data-testid={`mesh-conn-${conn.id}`}>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Circle className="w-2 h-2 flex-shrink-0" style={{
                fill: conn.status === "connected" ? "hsl(142, 76%, 48%)" : conn.status === "error" ? "hsl(0, 72%, 55%)" : "hsl(45, 90%, 50%)",
                color: conn.status === "connected" ? "hsl(142, 76%, 48%)" : conn.status === "error" ? "hsl(0, 72%, 55%)" : "hsl(45, 90%, 50%)",
              }} />
              <span className="text-[10px] font-medium truncate">{conn.deviceName || conn.host}</span>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Badge variant="outline" className="text-[7px] px-1 h-4" data-testid={`badge-conn-status-${conn.id}`}>
                {conn.status}
              </Badge>
              {conn.status === "connected" ? (
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => disconnectMutation.mutate(conn.id)} data-testid={`button-disconnect-${conn.id}`}>
                  <Power className="w-2.5 h-2.5" />
                </Button>
              ) : (
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => removeMutation.mutate(conn.id)} data-testid={`button-remove-${conn.id}`}>
                  <Trash2 className="w-2.5 h-2.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[8px] text-muted-foreground font-mono">
            <span>{conn.host}:{conn.port}</span>
            {conn.status === "connected" && (
              <>
                <span>|</span>
                <span>{conn.nodes.length} nodes</span>
                <span>|</span>
                <span>{conn.messages.length} msgs</span>
              </>
            )}
          </div>
          {conn.error && <p className="text-[8px] text-destructive truncate">{conn.error}</p>}
        </Card>
      ))}

      {connections.length === 0 && (
        <div className="text-center py-4 text-[10px] text-muted-foreground">
          No mesh devices connected. Enter an IP address above.
        </div>
      )}
    </div>
  );
}

function NodeMapPanel({ nodes }: { nodes: MeshtasticNode[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const leafletRef = useRef<any>(null);

  const nodesWithPosition = nodes.filter(n => n.latitude && n.longitude);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      leafletRef.current = L.default || L;
      const Lmod = leafletRef.current;

      const map = Lmod.map(mapRef.current, {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: false,
        attributionControl: false,
      });

      Lmod.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      Lmod.control.zoom({ position: "topright" }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    nodesWithPosition.forEach(node => {
      const battColor = getBatteryColor(node.batteryLevel);
      const icon = L.divIcon({
        className: "mesh-node-marker",
        html: `<div style="width:24px;height:24px;border-radius:50%;background:${battColor};border:2px solid rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold;color:#000;box-shadow:0 0 8px ${battColor}80;">${node.shortName || "?"}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([node.latitude, node.longitude], { icon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family:monospace;font-size:11px;min-width:140px;">
          <div style="font-weight:bold;margin-bottom:4px;">${node.longName}</div>
          <div>Node: !${node.nodeNum.toString(16)}</div>
          <div>Model: ${node.hwModel}</div>
          <div>Role: ${node.role}</div>
          <div>Battery: ${node.batteryLevel}% (${node.voltage.toFixed(1)}V)</div>
          <div>SNR: ${node.snr.toFixed(1)} dB</div>
          <div>Hops: ${node.hopsAway}</div>
          ${node.altitude ? `<div>Alt: ${node.altitude}m</div>` : ""}
          <div>Last heard: ${formatTimestamp(node.lastHeard)}</div>
        </div>
      `);
      markersRef.current.push(marker);
    });

    if (nodesWithPosition.length > 0) {
      const bounds = L.latLngBounds(nodesWithPosition.map((n: MeshtasticNode) => [n.latitude, n.longitude]));
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    }
  }, [nodesWithPosition]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full rounded-md overflow-hidden" data-testid="mesh-node-map" />
      <div className="absolute top-2 left-2 z-[1000]">
        <Badge variant="outline" className="text-[8px] bg-background/80 backdrop-blur-sm">
          <MapPin className="w-2.5 h-2.5 mr-1" />
          {nodesWithPosition.length} / {nodes.length} nodes with position
        </Badge>
      </div>
    </div>
  );
}

function NodeListPanel({ nodes, selectedNode, onSelectNode }: {
  nodes: MeshtasticNode[];
  selectedNode: number | null;
  onSelectNode: (num: number) => void;
}) {
  const sorted = [...nodes].sort((a, b) => b.lastHeard - a.lastHeard);

  return (
    <div className="space-y-1">
      {sorted.map(node => (
        <button
          key={node.nodeNum}
          onClick={() => onSelectNode(node.nodeNum)}
          className={`w-full text-left p-2 rounded-md border transition-colors ${selectedNode === node.nodeNum ? "border-primary/50 bg-primary/5" : "border-border/20 hover:border-border/40"}`}
          data-testid={`mesh-node-${node.nodeNum}`}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {getRoleIcon(node.role)}
              <span className="text-[10px] font-medium truncate">{node.longName || `!${node.nodeNum.toString(16)}`}</span>
              {node.shortName && (
                <Badge variant="outline" className="text-[7px] px-1 h-3.5">{node.shortName}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Battery className="w-3 h-3" style={{ color: getBatteryColor(node.batteryLevel) }} />
              <span className="text-[8px] font-mono" style={{ color: getBatteryColor(node.batteryLevel) }}>{node.batteryLevel}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[8px] text-muted-foreground font-mono">
            <span>{node.hwModel}</span>
            <span>|</span>
            <span style={{ color: getSnrColor(node.snr) }}>SNR {node.snr.toFixed(1)}</span>
            {node.hopsAway > 0 && <><span>|</span><span>{node.hopsAway} hops</span></>}
            <span>|</span>
            <span>{formatTimestamp(node.lastHeard)}</span>
          </div>
          {(node.latitude || node.temperature !== undefined) && (
            <div className="flex items-center gap-2 mt-0.5 text-[8px] text-muted-foreground font-mono">
              {node.latitude && <span><MapPin className="w-2.5 h-2.5 inline" /> {node.latitude.toFixed(4)}, {node.longitude?.toFixed(4)}</span>}
              {node.temperature !== undefined && <span>{node.temperature.toFixed(1)}°C</span>}
              {node.relativeHumidity !== undefined && <span>{node.relativeHumidity.toFixed(0)}%RH</span>}
            </div>
          )}
        </button>
      ))}
      {nodes.length === 0 && (
        <div className="text-center py-6 text-[10px] text-muted-foreground">
          No mesh nodes discovered. Connect to a device to see the mesh network.
        </div>
      )}
    </div>
  );
}

function ChatPanel({ connectionId, channels, messages }: {
  connectionId: string;
  channels: MeshChannel[];
  messages: MeshtasticMessage[];
}) {
  const [activeChannel, setActiveChannel] = useState(0);
  const [messageText, setMessageText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const channelMessages = messages.filter(m => m.channel === activeChannel);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/meshtastic/message", {
        connectionId,
        text: messageText,
        channel: activeChannel,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/messages", connectionId] });
      setMessageText("");
    },
    onError: () => {
      toast({ title: "Failed to send", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [channelMessages.length]);

  const enabledChannels = channels.filter(c => c.role !== "disabled");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {enabledChannels.map(ch => (
          <Button
            key={ch.index}
            size="sm"
            variant={activeChannel === ch.index ? "default" : "outline"}
            className="h-6 text-[9px] px-2"
            onClick={() => setActiveChannel(ch.index)}
            data-testid={`button-channel-${ch.index}`}
          >
            <Hash className="w-2.5 h-2.5 mr-0.5" />
            {ch.name || `Ch ${ch.index}`}
            {ch.role === "primary" && <Badge variant="outline" className="text-[6px] ml-1 px-0.5 h-3">P</Badge>}
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0 pr-2" ref={scrollRef}>
        <div className="space-y-1.5">
          {channelMessages.map(msg => (
            <div key={msg.id} className="p-1.5 rounded-md bg-muted/20 border border-border/10">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] font-medium" style={{ color: "hsl(190, 80%, 60%)" }}>
                  {msg.fromName || `!${msg.from.toString(16)}`}
                </span>
                <span className="text-[7px] text-muted-foreground">{formatTimestamp(msg.timestamp)}</span>
              </div>
              <p className="text-[10px] mt-0.5 break-words">{msg.text}</p>
              <div className="flex items-center gap-1.5 mt-0.5 text-[7px] text-muted-foreground">
                <span>SNR: {msg.rxSnr.toFixed(1)}</span>
                {msg.rxRssi && <span>RSSI: {msg.rxRssi}</span>}
                <span>Hops: {msg.hopLimit}</span>
                {msg.acknowledged && <Check className="w-2 h-2 text-green-500" />}
              </div>
            </div>
          ))}
          {channelMessages.length === 0 && (
            <div className="text-center py-4 text-[9px] text-muted-foreground">
              No messages on {enabledChannels.find(c => c.index === activeChannel)?.name || `Channel ${activeChannel}`}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="flex gap-1 mt-2 pt-2 border-t border-border/20">
        <Input
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          placeholder="Type a message..."
          className="text-xs h-7 flex-1"
          maxLength={228}
          onKeyDown={e => { if (e.key === "Enter" && messageText.trim()) sendMutation.mutate(); }}
          data-testid="input-mesh-message"
        />
        <Button
          size="sm"
          className="h-7 px-2"
          onClick={() => sendMutation.mutate()}
          disabled={!messageText.trim() || sendMutation.isPending}
          data-testid="button-send-message"
        >
          {sendMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

function TopologyCanvas({ nodes, topology }: { nodes: MeshtasticNode[]; topology: MeshTopologyLink[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "hsl(220, 20%, 8%)";
    ctx.fillRect(0, 0, w, h);

    if (nodes.length === 0) {
      ctx.fillStyle = "hsl(220, 10%, 40%)";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("No mesh nodes to visualize", w / 2, h / 2);
      return;
    }

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.35;

    const positions = new Map<number, { x: number; y: number }>();
    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const r = node.hopsAway === 0 ? 0 : radius * (0.3 + (node.hopsAway / 7) * 0.7);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      positions.set(node.nodeNum, { x, y });
    });

    topology.forEach(link => {
      const from = positions.get(link.from);
      const to = positions.get(link.to);
      if (!from || !to) return;

      const snrNorm = Math.max(0, Math.min(1, (link.snr + 10) / 20));
      const alpha = 0.15 + snrNorm * 0.4;
      ctx.strokeStyle = `hsla(190, 80%, 60%, ${alpha})`;
      ctx.lineWidth = 1 + snrNorm * 1.5;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    nodes.forEach(node => {
      const pos = positions.get(node.nodeNum);
      if (!pos) return;

      const battColor = getBatteryColor(node.batteryLevel);
      const nodeRadius = 14;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = `${battColor}20`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(220, 20%, 12%)";
      ctx.fill();
      ctx.strokeStyle = battColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 8px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.shortName || "?", pos.x, pos.y);

      ctx.fillStyle = "hsl(220, 10%, 60%)";
      ctx.font = "7px 'JetBrains Mono', monospace";
      ctx.fillText(node.longName?.substring(0, 10) || "", pos.x, pos.y + nodeRadius + 10);
    });
  }, [nodes, topology]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-md"
      style={{ minHeight: 200 }}
      data-testid="mesh-topology-canvas"
    />
  );
}

function ChannelConfigPanel({ connectionId, channels }: { connectionId: string; channels: MeshChannel[] }) {
  const { toast } = useToast();
  const [showPsk, setShowPsk] = useState<Record<number, boolean>>({});
  const [editNames, setEditNames] = useState<Record<number, string>>({});
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const updateMutation = useMutation({
    mutationFn: async ({ index, updates }: { index: number; updates: Partial<MeshChannel> }) => {
      const res = await apiRequest("PATCH", `/api/meshtastic/channels/${connectionId}/${index}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/channels", connectionId] });
    },
  });

  const handleNameChange = (index: number, name: string) => {
    setEditNames(prev => ({ ...prev, [index]: name }));
    if (debounceTimers.current[index]) clearTimeout(debounceTimers.current[index]);
    debounceTimers.current[index] = setTimeout(() => {
      updateMutation.mutate({ index, updates: { name } });
    }, 800);
  };

  const handleCopyPsk = (psk: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(psk).then(() => toast({ title: "PSK copied" })).catch(() => toast({ title: "Copy failed", variant: "destructive" }));
    } else {
      toast({ title: "Clipboard not available", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      {channels.map(ch => (
        <Card key={ch.index} className={`p-2 border-border/20 ${ch.role === "disabled" ? "opacity-40" : ""}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3" />
              <span className="text-[10px] font-medium">Ch {ch.index}</span>
              <Badge variant="outline" className="text-[7px] h-3.5 px-1"
                style={{
                  color: ch.role === "primary" ? "hsl(190, 80%, 60%)" : ch.role === "secondary" ? "hsl(25, 85%, 55%)" : undefined,
                  borderColor: ch.role === "primary" ? "hsl(190, 80%, 60%)" : ch.role === "secondary" ? "hsl(25, 85%, 55%)" : undefined,
                }}
              >
                {ch.role}
              </Badge>
            </div>
            <Select
              value={ch.role}
              onValueChange={(val) => updateMutation.mutate({ index: ch.index, updates: { role: val as MeshChannel["role"] } })}
            >
              <SelectTrigger className="w-24 h-6 text-[9px]" data-testid={`select-channel-role-${ch.index}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ch.role !== "disabled" && (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-1">
                <Input
                  value={editNames[ch.index] !== undefined ? editNames[ch.index] : ch.name}
                  onChange={e => handleNameChange(ch.index, e.target.value)}
                  placeholder="Channel name"
                  className="text-[9px] h-6 flex-1 font-mono"
                  maxLength={12}
                  data-testid={`input-channel-name-${ch.index}`}
                />
              </div>
              <div className="flex items-center gap-1">
                <Input
                  value={showPsk[ch.index] ? ch.psk : "••••••••"}
                  readOnly
                  className="text-[9px] h-6 flex-1 font-mono"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setShowPsk(p => ({ ...p, [ch.index]: !p[ch.index] }))}
                  data-testid={`button-toggle-psk-${ch.index}`}
                >
                  {showPsk[ch.index] ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => handleCopyPsk(ch.psk)}
                  data-testid={`button-copy-psk-${ch.index}`}
                >
                  <Copy className="w-2.5 h-2.5" />
                </Button>
              </div>
              <div className="flex items-center gap-3 text-[8px]">
                <label className="flex items-center gap-1">
                  <Switch
                    checked={ch.uplinkEnabled}
                    onCheckedChange={v => updateMutation.mutate({ index: ch.index, updates: { uplinkEnabled: v } })}
                    className="h-3 w-5"
                  />
                  Uplink
                </label>
                <label className="flex items-center gap-1">
                  <Switch
                    checked={ch.downlinkEnabled}
                    onCheckedChange={v => updateMutation.mutate({ index: ch.index, updates: { downlinkEnabled: v } })}
                    className="h-3 w-5"
                  />
                  Downlink
                </label>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function RadioConfigPanel({ connectionId, config, options }: {
  connectionId: string;
  config: MeshRadioConfig;
  options: ConfigOptions;
}) {
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<MeshRadioConfig>) => {
      const res = await apiRequest("PATCH", `/api/meshtastic/radio/${connectionId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/radio", connectionId] });
      toast({ title: "Radio config updated" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[8px] text-muted-foreground uppercase">Region</label>
          <Select value={config.region} onValueChange={v => updateMutation.mutate({ region: v })}>
            <SelectTrigger className="h-7 text-[10px]" data-testid="select-radio-region">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[8px] text-muted-foreground uppercase">Modem Preset</label>
          <Select value={config.modemPreset} onValueChange={v => updateMutation.mutate({ modemPreset: v })}>
            <SelectTrigger className="h-7 text-[10px]" data-testid="select-modem-preset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.modemPresets.map(p => <SelectItem key={p} value={p}>{p.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-[8px] text-muted-foreground uppercase">Hop Limit</label>
          <Select value={String(config.hopLimit)} onValueChange={v => updateMutation.mutate({ hopLimit: parseInt(v) })}>
            <SelectTrigger className="h-7 text-[10px]" data-testid="select-hop-limit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7].map(h => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[8px] text-muted-foreground uppercase">TX Power (dBm)</label>
          <Input
            type="number"
            value={config.txPower}
            onChange={e => {
              const val = parseInt(e.target.value);
              if (val >= 1 && val <= 30) updateMutation.mutate({ txPower: val });
            }}
            min={1}
            max={30}
            className="h-7 text-[10px] font-mono"
            data-testid="input-tx-power"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[8px] text-muted-foreground uppercase">TX Enabled</label>
          <div className="flex items-center h-7">
            <Switch
              checked={config.txEnabled}
              onCheckedChange={v => updateMutation.mutate({ txEnabled: v })}
              data-testid="switch-tx-enabled"
            />
          </div>
        </div>
      </div>

      <Card className="p-2 bg-muted/10 border-border/20">
        <p className="text-[8px] text-muted-foreground uppercase tracking-wider mb-1">Radio Parameters</p>
        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[9px] font-mono">
          <div><span className="text-muted-foreground">BW:</span> {config.bandwidth} kHz</div>
          <div><span className="text-muted-foreground">SF:</span> {config.spreadFactor}</div>
          <div><span className="text-muted-foreground">CR:</span> 4/{config.codingRate}</div>
        </div>
      </Card>
    </div>
  );
}

function MeshcorePanel({ connectionId, config }: { connectionId: string; config: MeshcoreConfig }) {
  const { toast } = useToast();

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<MeshcoreConfig>) => {
      const res = await apiRequest("PATCH", `/api/meshtastic/meshcore/${connectionId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/meshcore", connectionId] });
      toast({ title: "Meshcore config updated" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-4 h-4" style={{ color: "hsl(280, 65%, 55%)" }} />
        <span className="text-xs font-semibold">Meshcore Configuration</span>
      </div>

      <p className="text-[9px] text-muted-foreground">
        Meshcore extends Meshtastic with managed flooding, repeater networks, and client registration for optimized mesh routing.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 rounded-md border border-border/20">
          <div>
            <p className="text-[10px] font-medium flex items-center gap-1"><Repeat className="w-3 h-3" /> Repeater Mode</p>
            <p className="text-[8px] text-muted-foreground">Acts as a dedicated mesh repeater, forwarding all traffic</p>
          </div>
          <Switch checked={config.isRepeater} onCheckedChange={v => updateMutation.mutate({ isRepeater: v })} data-testid="switch-repeater" />
        </div>

        <div className="flex items-center justify-between p-2 rounded-md border border-border/20">
          <div>
            <p className="text-[10px] font-medium flex items-center gap-1"><Network className="w-3 h-3" /> Managed Flooding</p>
            <p className="text-[8px] text-muted-foreground">Smart flood routing with configurable radius</p>
          </div>
          <Switch checked={config.managedFlood} onCheckedChange={v => updateMutation.mutate({ managedFlood: v })} data-testid="switch-managed-flood" />
        </div>

        {config.managedFlood && (
          <div className="pl-4 space-y-1">
            <label className="text-[8px] text-muted-foreground uppercase">Flood Radius (hops)</label>
            <Select value={String(config.floodRadius)} onValueChange={v => updateMutation.mutate({ floodRadius: parseInt(v) })}>
              <SelectTrigger className="h-7 text-[10px] w-24" data-testid="select-flood-radius">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map(r => <SelectItem key={r} value={String(r)}>{r} hops</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between p-2 rounded-md border border-border/20">
          <div>
            <p className="text-[10px] font-medium flex items-center gap-1"><Users className="w-3 h-3" /> Client Registration</p>
            <p className="text-[8px] text-muted-foreground">Require clients to register before joining mesh</p>
          </div>
          <Switch checked={config.clientRegistration} onCheckedChange={v => updateMutation.mutate({ clientRegistration: v })} data-testid="switch-client-reg" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[8px] text-muted-foreground uppercase">Heartbeat (sec)</label>
            <Input
              type="number"
              value={config.heartbeatInterval}
              onChange={e => {
                const val = parseInt(e.target.value);
                if (val >= 60 && val <= 3600) updateMutation.mutate({ heartbeatInterval: val });
              }}
              min={60}
              max={3600}
              className="h-7 text-[10px] font-mono"
              data-testid="input-heartbeat"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] text-muted-foreground uppercase">Max Clients</label>
            <Input
              type="number"
              value={config.maxClients}
              onChange={e => {
                const val = parseInt(e.target.value);
                if (val >= 1 && val <= 256) updateMutation.mutate({ maxClients: val });
              }}
              min={1}
              max={256}
              className="h-7 text-[10px] font-mono"
              data-testid="input-max-clients"
            />
          </div>
        </div>

        {config.registeredClients.length > 0 && (
          <div className="space-y-1">
            <p className="text-[8px] text-muted-foreground uppercase tracking-wider">Registered Clients ({config.registeredClients.length})</p>
            {config.registeredClients.map(client => (
              <div key={client.nodeNum} className="flex items-center justify-between p-1.5 rounded border border-border/10 text-[9px]">
                <span className="font-mono">{client.name || `!${client.nodeNum.toString(16)}`}</span>
                <div className="flex items-center gap-2 text-muted-foreground font-mono">
                  <span>RSSI: {client.rssi}</span>
                  <span>{client.hops}h</span>
                  <span>{formatTimestamp(client.lastSeen)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MeshPage() {
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [mainTab, setMainTab] = useState("map");
  const [configTab, setConfigTab] = useState("channels");

  const { data: status } = useQuery<{ available: boolean; activeConnections: number; totalNodes: number; totalMessages: number }>({
    queryKey: ["/api/meshtastic/status"],
    refetchInterval: 10000,
  });

  const { data: connections = [] } = useQuery<MeshtasticConnection[]>({
    queryKey: ["/api/meshtastic/connections"],
    refetchInterval: 10000,
  });

  const { data: configOptions } = useQuery<ConfigOptions>({
    queryKey: ["/api/meshtastic/config-options"],
  });

  const activeConn = connections.find(c => c.id === activeConnectionId) || connections.find(c => c.status === "connected") || connections[0];

  useEffect(() => {
    if (activeConn && activeConn.id !== activeConnectionId) {
      setActiveConnectionId(activeConn.id);
    }
  }, [activeConn]);

  const { data: channels = [] } = useQuery<MeshChannel[]>({
    queryKey: ["/api/meshtastic/channels", activeConn?.id],
    enabled: !!activeConn?.id,
    refetchInterval: 30000,
  });

  const { data: messages = [] } = useQuery<MeshtasticMessage[]>({
    queryKey: ["/api/meshtastic/messages", activeConn?.id],
    enabled: !!activeConn?.id,
    refetchInterval: 5000,
  });

  const { data: radioConfig } = useQuery<MeshRadioConfig>({
    queryKey: ["/api/meshtastic/radio", activeConn?.id],
    enabled: !!activeConn?.id,
  });

  const { data: meshcoreConfig } = useQuery<MeshcoreConfig>({
    queryKey: ["/api/meshtastic/meshcore", activeConn?.id],
    enabled: !!activeConn?.id,
  });

  const { data: topology = [] } = useQuery<MeshTopologyLink[]>({
    queryKey: ["/api/meshtastic/topology", activeConn?.id],
    enabled: !!activeConn?.id,
    refetchInterval: 15000,
  });

  const allNodes = connections.reduce<MeshtasticNode[]>((acc, c) => {
    if (c.status === "connected") acc.push(...c.nodes);
    return acc;
  }, []);

  const allMessages = connections.reduce<MeshtasticMessage[]>((acc, c) => {
    if (c.status === "connected") acc.push(...c.messages);
    return acc;
  }, []);

  const refreshConnections = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/connections"] });
    queryClient.invalidateQueries({ queryKey: ["/api/meshtastic/status"] });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" data-testid="mesh-page">
      <div className="flex items-center justify-between p-3 pb-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5" style={{ color: "hsl(25, 85%, 55%)" }} />
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase" data-testid="text-mesh-title">
              LoRa Mesh Platform
            </h1>
            <p className="text-[9px] text-muted-foreground">Meshtastic & Meshcore Network Operations</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[8px]" data-testid="badge-mesh-connections">
            <Antenna className="w-2.5 h-2.5 mr-1" />
            {status?.activeConnections || 0} devices
          </Badge>
          <Badge variant="outline" className="text-[8px]" data-testid="badge-mesh-nodes">
            <Users className="w-2.5 h-2.5 mr-1" />
            {status?.totalNodes || 0} nodes
          </Badge>
          <Badge variant="outline" className="text-[8px]" data-testid="badge-mesh-messages">
            <MessageSquare className="w-2.5 h-2.5 mr-1" />
            {status?.totalMessages || 0} msgs
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r border-border/30 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-2">
            <ConnectionPanel connections={connections} onRefresh={refreshConnections} />

            {allNodes.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Users className="w-3.5 h-3.5" />
                  Mesh Nodes ({allNodes.length})
                </h3>
                <NodeListPanel nodes={allNodes} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs value={mainTab} onValueChange={setMainTab} className="flex flex-col flex-1 overflow-hidden">
            <div className="px-3 pt-2">
              <TabsList className="w-full justify-start" data-testid="tabs-mesh-main">
                <TabsTrigger value="map" className="text-[10px]" data-testid="tab-mesh-map">
                  <MapPin className="w-3 h-3 mr-1" /> Map
                </TabsTrigger>
                <TabsTrigger value="chat" className="text-[10px]" data-testid="tab-mesh-chat">
                  <MessageSquare className="w-3 h-3 mr-1" /> Chat
                  {allMessages.length > 0 && (
                    <Badge variant="outline" className="text-[7px] ml-1 h-3.5 px-1">{allMessages.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="topology" className="text-[10px]" data-testid="tab-mesh-topology">
                  <Network className="w-3 h-3 mr-1" /> Topology
                </TabsTrigger>
                <TabsTrigger value="config" className="text-[10px]" data-testid="tab-mesh-config">
                  <Settings className="w-3 h-3 mr-1" /> Config
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="map" className="flex-1 m-0 p-2 overflow-hidden">
              <Card className="h-full border-border/30 overflow-hidden">
                <NodeMapPanel nodes={allNodes} />
              </Card>
            </TabsContent>

            <TabsContent value="chat" className="flex-1 m-0 p-2 overflow-hidden">
              <Card className="h-full p-3 border-border/30 flex flex-col">
                {activeConn ? (
                  <ChatPanel
                    connectionId={activeConn.id}
                    channels={channels.length > 0 ? channels : activeConn.channels}
                    messages={messages.length > 0 ? messages : activeConn.messages}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[10px] text-muted-foreground">
                    Connect to a mesh device to start chatting
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="topology" className="flex-1 m-0 p-2 overflow-hidden">
              <Card className="h-full border-border/30 overflow-hidden">
                <TopologyCanvas nodes={allNodes} topology={topology} />
              </Card>
            </TabsContent>

            <TabsContent value="config" className="flex-1 m-0 p-2 overflow-auto">
              {activeConn ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Settings className="w-4 h-4" />
                    <span className="text-xs font-semibold">Device: {activeConn.deviceName || activeConn.host}</span>
                    {connections.length > 1 && (
                      <Select value={activeConnectionId || ""} onValueChange={setActiveConnectionId}>
                        <SelectTrigger className="h-6 text-[9px] w-40" data-testid="select-active-connection">
                          <SelectValue placeholder="Select device" />
                        </SelectTrigger>
                        <SelectContent>
                          {connections.filter(c => c.status === "connected").map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.deviceName || c.host}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <Tabs value={configTab} onValueChange={setConfigTab}>
                    <TabsList data-testid="tabs-config">
                      <TabsTrigger value="channels" className="text-[9px]" data-testid="tab-config-channels">
                        <Hash className="w-3 h-3 mr-1" /> Channels
                      </TabsTrigger>
                      <TabsTrigger value="radio" className="text-[9px]" data-testid="tab-config-radio">
                        <Antenna className="w-3 h-3 mr-1" /> Radio
                      </TabsTrigger>
                      <TabsTrigger value="meshcore" className="text-[9px]" data-testid="tab-config-meshcore">
                        <Shield className="w-3 h-3 mr-1" /> Meshcore
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="channels" className="mt-2">
                      <ChannelConfigPanel
                        connectionId={activeConn.id}
                        channels={channels.length > 0 ? channels : activeConn.channels}
                      />
                    </TabsContent>

                    <TabsContent value="radio" className="mt-2">
                      {radioConfig && configOptions && (
                        <RadioConfigPanel
                          connectionId={activeConn.id}
                          config={radioConfig}
                          options={configOptions}
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="meshcore" className="mt-2">
                      {meshcoreConfig && (
                        <MeshcorePanel
                          connectionId={activeConn.id}
                          config={meshcoreConfig}
                        />
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground">
                  Connect to a device to configure
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
