import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import {
  Crosshair, Plus, Trash2, Play, Pause, MapPin, Users, Radio,
  Target, Navigation, Signal, AlertTriangle, RotateCcw, Loader2,
  ChevronDown, ChevronUp, Wifi, Bluetooth, Radar
} from "lucide-react";
import type { Device, SarSession, SarPing } from "@shared/schema";

interface TriangulationResult {
  fix: {
    latitude: number;
    longitude: number;
    errorRadiusM: number;
    confidence: number;
    sensorPositions: number;
    timestamp: number;
  } | null;
  heatmapPoints: Array<{ lat: number; lon: number; intensity: number }>;
  teamPositions: Array<{ userId: string; latitude: number; longitude: number }>;
  pingCount: number;
  targetLabel: string | null;
  message?: string;
}

const SIGNAL_TYPE_ICONS: Record<string, typeof Wifi> = {
  wifi: Wifi,
  bluetooth: Bluetooth,
  sdr: Radio,
  lora: Radio,
  meshtastic: Radio,
  adsb: Radar,
};

function getSignalIcon(type: string) {
  return SIGNAL_TYPE_ICONS[type] || Signal;
}

export default function SARPage() {
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const heatLayerRef = useRef<any>(null);
  const fixCircleRef = useRef<any>(null);
  const fixMarkerRef = useRef<any>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [newSessionNotes, setNewSessionNotes] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState<string>("");
  const [targetSearch, setTargetSearch] = useState("");
  const [manualPingLat, setManualPingLat] = useState("");
  const [manualPingLon, setManualPingLon] = useState("");
  const [manualPingRssi, setManualPingRssi] = useState("");
  const [manualPingType, setManualPingType] = useState("bluetooth");
  const [showPingForm, setShowPingForm] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: sessions = [] } = useQuery<SarSession[]>({ queryKey: ["/api/sar/sessions"] });
  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  const { data: pings = [], refetch: refetchPings } = useQuery<SarPing[]>({
    queryKey: ["/api/sar/sessions", selectedSessionId, "pings"],
    enabled: !!selectedSessionId,
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const { data: triangulation, refetch: refetchTriangulation } = useQuery<TriangulationResult>({
    queryKey: ["/api/sar/sessions", selectedSessionId, "triangulate"],
    enabled: !!selectedSessionId && pings.length >= 2,
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/sar/sessions", data);
      return res.json();
    },
    onSuccess: (session: SarSession) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sar/sessions"] });
      setSelectedSessionId(session.id);
      setShowCreateDialog(false);
      setNewSessionName("");
      setNewSessionNotes("");
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const res = await apiRequest("PATCH", `/api/sar/sessions/${id}`, updates);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/sar/sessions"] }),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sar/sessions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sar/sessions"] });
      setSelectedSessionId(null);
    },
  });

  const addPingMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/sar/sessions/${selectedSessionId}/pings`, data);
      return res.json();
    },
    onSuccess: () => {
      refetchPings();
      refetchTriangulation();
    },
  });

  const clearPingsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/sar/sessions/${selectedSessionId}/pings`);
    },
    onSuccess: () => {
      refetchPings();
      refetchTriangulation();
    },
  });

  const handleCreateSession = () => {
    const targetDevice = devices.find(d => d.id === parseInt(selectedTargetId));
    createSessionMutation.mutate({
      name: newSessionName || "SAR Operation",
      targetDeviceId: targetDevice?.id,
      targetLabel: targetDevice?.name || targetDevice?.macAddress || newSessionName,
      targetSignalTypes: targetDevice ? [targetDevice.signalType] : ["bluetooth", "wifi"],
      notes: newSessionNotes,
    });
  };

  const handleAddPing = () => {
    const lat = parseFloat(manualPingLat);
    const lon = parseFloat(manualPingLon);
    const rssi = parseFloat(manualPingRssi);
    if (isNaN(lat) || isNaN(lon)) return;

    addPingMutation.mutate({
      latitude: lat,
      longitude: lon,
      signalStrength: isNaN(rssi) ? undefined : rssi,
      signalType: manualPingType,
    });
    setManualPingRssi("");
  };

  const handleSimulatePings = () => {
    if (!selectedSession) return;
    const baseLat = selectedSession.searchAreaLat || 38.9;
    const baseLon = selectedSession.searchAreaLon || -77.0;
    const targetLat = baseLat + (Math.random() - 0.5) * 0.01;
    const targetLon = baseLon + (Math.random() - 0.5) * 0.01;

    const teamPositions = [
      { lat: targetLat + 0.003 + Math.random() * 0.002, lon: targetLon - 0.002 + Math.random() * 0.002 },
      { lat: targetLat - 0.002 + Math.random() * 0.002, lon: targetLon + 0.003 + Math.random() * 0.002 },
      { lat: targetLat + 0.001 + Math.random() * 0.002, lon: targetLon - 0.004 + Math.random() * 0.002 },
    ];

    const rssiAtDistance = (sLat: number, sLon: number) => {
      const dLat = (sLat - targetLat) * 111320;
      const dLon = (sLon - targetLon) * 111320 * Math.cos(targetLat * Math.PI / 180);
      const distM = Math.sqrt(dLat * dLat + dLon * dLon);
      return -40 - 27 * Math.log10(Math.max(1, distM)) + (Math.random() - 0.5) * 6;
    };

    for (const pos of teamPositions) {
      addPingMutation.mutate({
        latitude: pos.lat,
        longitude: pos.lon,
        signalStrength: rssiAtDistance(pos.lat, pos.lon),
        signalType: selectedSession.targetSignalTypes?.[0] || "bluetooth",
      });
    }
  };

  const useMyLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setManualPingLat(pos.coords.latitude.toFixed(6));
          setManualPingLon(pos.coords.longitude.toFixed(6));
        },
        () => {},
        { enableHighAccuracy: true }
      );
    }
  };

  const initMap = useCallback(() => {
    if (!mapRef.current || leafletMapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current, {
      center: [38.9, -77.0],
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    leafletMapRef.current = map;
  }, []);

  useEffect(() => {
    const checkLeaflet = setInterval(() => {
      if ((window as any).L) {
        clearInterval(checkLeaflet);
        initMap();
      }
    }, 200);
    return () => {
      clearInterval(checkLeaflet);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [initMap]);

  useEffect(() => {
    const L = (window as any).L;
    const map = leafletMapRef.current;
    if (!L || !map) return;

    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];
    if (fixCircleRef.current) { map.removeLayer(fixCircleRef.current); fixCircleRef.current = null; }
    if (fixMarkerRef.current) { map.removeLayer(fixMarkerRef.current); fixMarkerRef.current = null; }
    if (heatLayerRef.current) { map.removeLayer(heatLayerRef.current); heatLayerRef.current = null; }

    if (!selectedSession || pings.length === 0) return;

    for (const ping of pings) {
      const icon = L.divIcon({
        className: "custom-div-icon",
        html: `<div style="background:#06b6d4;width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(6,182,212,0.6);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marker = L.marker([ping.latitude, ping.longitude], { icon })
        .bindPopup(`<div style="color:#000;font-size:12px;"><b>Ping</b><br/>RSSI: ${ping.signalStrength ?? "N/A"} dBm<br/>Type: ${ping.signalType || "unknown"}<br/>User: ${ping.userId?.slice(0, 8)}...</div>`)
        .addTo(map);
      markersRef.current.push(marker);
    }

    if (triangulation) {
      if (triangulation.teamPositions) {
        const teamColors = ["#22c55e", "#f59e0b", "#a855f7"];
        triangulation.teamPositions.forEach((tp, i) => {
          const teamIcon = L.divIcon({
            className: "custom-div-icon",
            html: `<div style="background:${teamColors[i % teamColors.length]};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px ${teamColors[i % teamColors.length]}80;display:flex;align-items:center;justify-content:center;"><div style="width:4px;height:4px;background:#fff;border-radius:50%;"></div></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          const m = L.marker([tp.latitude, tp.longitude], { icon: teamIcon })
            .bindPopup(`<div style="color:#000;font-size:12px;"><b>Team Member</b><br/>${tp.userId.slice(0, 12)}...</div>`)
            .addTo(map);
          markersRef.current.push(m);
        });
      }

      if (triangulation.heatmapPoints && triangulation.heatmapPoints.length > 0 && (L as any).heatLayer) {
        const heatData = triangulation.heatmapPoints.map(hp => [hp.lat, hp.lon, hp.intensity]);
        heatLayerRef.current = (L as any).heatLayer(heatData, {
          radius: 30,
          blur: 20,
          maxZoom: 18,
          gradient: { 0.2: "#00f", 0.4: "#0ff", 0.6: "#0f0", 0.8: "#ff0", 1.0: "#f00" },
        }).addTo(map);
      }

      if (triangulation.fix) {
        const fix = triangulation.fix;
        fixCircleRef.current = L.circle([fix.latitude, fix.longitude], {
          radius: fix.errorRadiusM,
          color: "#ef4444",
          fillColor: "#ef444440",
          fillOpacity: 0.3,
          weight: 2,
          dashArray: "8 4",
        }).addTo(map);

        const targetIcon = L.divIcon({
          className: "custom-div-icon",
          html: `<div style="position:relative;"><div style="background:#ef4444;width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(239,68,68,0.8);animation:pulse 2s infinite;"></div><div style="position:absolute;top:-2px;left:-2px;width:22px;height:22px;border-radius:50%;border:2px solid #ef444480;animation:ping 1.5s infinite;"></div></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        fixMarkerRef.current = L.marker([fix.latitude, fix.longitude], { icon: targetIcon })
          .bindPopup(`<div style="color:#000;font-size:12px;"><b>Estimated Target Position</b><br/>Lat: ${fix.latitude.toFixed(6)}<br/>Lon: ${fix.longitude.toFixed(6)}<br/>Error: ${fix.errorRadiusM}m<br/>Confidence: ${(fix.confidence * 100).toFixed(0)}%<br/>Sensors: ${fix.sensorPositions}</div>`)
          .addTo(map);
        markersRef.current.push(fixMarkerRef.current);

        map.setView([fix.latitude, fix.longitude], 15);
      }
    }

    if (!triangulation?.fix && pings.length > 0) {
      const bounds = L.latLngBounds(pings.map((p: SarPing) => [p.latitude, p.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [pings, triangulation, selectedSession]);

  const filteredDevices = devices.filter(d => {
    if (!targetSearch) return true;
    const q = targetSearch.toLowerCase();
    return (
      (d.name && d.name.toLowerCase().includes(q)) ||
      (d.macAddress && d.macAddress.toLowerCase().includes(q)) ||
      (d.manufacturer && d.manufacturer.toLowerCase().includes(q)) ||
      (d.signalType && d.signalType.toLowerCase().includes(q))
    );
  });

  const activeSessions = sessions.filter(s => s.status === "active");

  return (
    <div className="flex h-full" data-testid="sar-page">
      <div className="w-[340px] flex-shrink-0 border-r border-border overflow-y-auto p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-destructive" />
          <h2 className="text-sm font-bold uppercase tracking-wider">Search & Rescue</h2>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="w-full" data-testid="button-create-sar-session">
              <Plus className="w-4 h-4 mr-2" />
              New SAR Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create SAR Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Operation Name</label>
                <Input
                  value={newSessionName}
                  onChange={e => setNewSessionName(e.target.value)}
                  placeholder="e.g., Missing Hiker - Mt. Trail"
                  data-testid="input-sar-session-name"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Target Node (select a known device)</label>
                <Input
                  value={targetSearch}
                  onChange={e => setTargetSearch(e.target.value)}
                  placeholder="Search by name, MAC, signal type..."
                  className="mb-2"
                  data-testid="input-target-search"
                />
                <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
                  <SelectTrigger data-testid="select-target-device">
                    <SelectValue placeholder="Select target node..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific target</SelectItem>
                    {filteredDevices.slice(0, 50).map(d => (
                      <SelectItem key={d.id} value={d.id.toString()}>
                        {d.name || d.macAddress || `Device #${d.id}`} ({d.signalType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <Textarea
                  value={newSessionNotes}
                  onChange={e => setNewSessionNotes(e.target.value)}
                  placeholder="Search area description, last known position, etc."
                  data-testid="input-sar-notes"
                />
              </div>
              <Button
                onClick={handleCreateSession}
                disabled={createSessionMutation.isPending}
                className="w-full"
                data-testid="button-confirm-create-session"
              >
                {createSessionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Create Session
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {activeSessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Active Sessions</p>
            {activeSessions.map(session => (
              <Card
                key={session.id}
                className={`p-3 cursor-pointer transition-colors ${selectedSessionId === session.id ? "ring-1 ring-primary" : "hover-elevate"}`}
                onClick={() => setSelectedSessionId(session.id)}
                data-testid={`card-sar-session-${session.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{session.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Target: {session.targetLabel || "Any signal"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {session.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}

        {selectedSession && (
          <>
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Session Controls</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={autoRefresh ? "default" : "outline"}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className="flex-1"
                  data-testid="button-toggle-auto-refresh"
                >
                  {autoRefresh ? <Pause className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                  {autoRefresh ? "Live" : "Paused"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { refetchPings(); refetchTriangulation(); }}
                  data-testid="button-refresh-data"
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSimulatePings}
                  className="flex-1"
                  data-testid="button-simulate-pings"
                >
                  <Radar className="w-3 h-3 mr-1" />
                  Simulate Team
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clearPingsMutation.mutate()}
                  data-testid="button-clear-pings"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              <Button
                size="sm"
                variant={selectedSession.status === "active" ? "outline" : "default"}
                className="w-full"
                onClick={() => updateSessionMutation.mutate({
                  id: selectedSession.id,
                  updates: { status: selectedSession.status === "active" ? "completed" : "active" }
                })}
                data-testid="button-toggle-session-status"
              >
                {selectedSession.status === "active" ? "End Operation" : "Reactivate"}
              </Button>
            </div>

            <div className="space-y-2">
              <button
                className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground w-full"
                onClick={() => setShowPingForm(!showPingForm)}
                data-testid="button-toggle-ping-form"
              >
                <MapPin className="w-3 h-3" />
                Add Manual Ping
                {showPingForm ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
              </button>
              {showPingForm && (
                <Card className="p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={manualPingLat}
                      onChange={e => setManualPingLat(e.target.value)}
                      placeholder="Latitude"
                      className="text-xs"
                      data-testid="input-ping-lat"
                    />
                    <Input
                      value={manualPingLon}
                      onChange={e => setManualPingLon(e.target.value)}
                      placeholder="Longitude"
                      className="text-xs"
                      data-testid="input-ping-lon"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={manualPingRssi}
                      onChange={e => setManualPingRssi(e.target.value)}
                      placeholder="RSSI (dBm)"
                      className="text-xs"
                      data-testid="input-ping-rssi"
                    />
                    <Select value={manualPingType} onValueChange={setManualPingType}>
                      <SelectTrigger className="text-xs" data-testid="select-ping-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bluetooth">Bluetooth</SelectItem>
                        <SelectItem value="wifi">Wi-Fi</SelectItem>
                        <SelectItem value="sdr">SDR/Cellular</SelectItem>
                        <SelectItem value="lora">LoRa</SelectItem>
                        <SelectItem value="meshtastic">Meshtastic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={useMyLocation} className="flex-1" data-testid="button-use-my-location">
                      <Navigation className="w-3 h-3 mr-1" />
                      My Location
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddPing}
                      disabled={addPingMutation.isPending}
                      className="flex-1"
                      data-testid="button-submit-ping"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Ping
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            {triangulation?.fix && (
              <Card className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-destructive" />
                  <p className="text-xs font-bold uppercase tracking-wider">Position Fix</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground text-[10px]">Latitude</p>
                    <p className="font-mono">{triangulation.fix.latitude.toFixed(6)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">Longitude</p>
                    <p className="font-mono">{triangulation.fix.longitude.toFixed(6)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">Error Radius</p>
                    <p className="font-mono">{triangulation.fix.errorRadiusM}m</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">Confidence</p>
                    <p className="font-mono">{(triangulation.fix.confidence * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {triangulation.fix.sensorPositions} sensor positions
                  <span className="mx-1">|</span>
                  {triangulation.pingCount} total pings
                </div>
              </Card>
            )}

            {triangulation && !triangulation.fix && triangulation.message && (
              <Card className="p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <p>{triangulation.message}</p>
                </div>
              </Card>
            )}

            {pings.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Recent Pings ({pings.length})
                </p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {pings.slice(0, 20).map(ping => {
                    const Icon = getSignalIcon(ping.signalType || "unknown");
                    return (
                      <div key={ping.id} className="flex items-center gap-2 text-[10px] text-muted-foreground px-2 py-1">
                        <Icon className="w-3 h-3 shrink-0" />
                        <span className="font-mono">{ping.latitude.toFixed(4)}, {ping.longitude.toFixed(4)}</span>
                        {ping.signalStrength != null && (
                          <Badge variant="outline" className="text-[8px] ml-auto shrink-0">{ping.signalStrength.toFixed(0)} dBm</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {!selectedSession && sessions.length === 0 && (
          <Card className="p-4 text-center">
            <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No SAR sessions yet</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Create a session to begin a coordinated search. Select a target node, then your team reports signal pings from different positions to triangulate the target.
            </p>
          </Card>
        )}
      </div>

      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" data-testid="sar-map" />
        <div className="absolute top-3 left-3 z-[1000]">
          <Card className="p-2">
            <div className="flex items-center gap-2 text-xs">
              <Target className="w-4 h-4 text-destructive" />
              <span className="font-medium">
                {selectedSession ? selectedSession.name : "Select a SAR session"}
              </span>
              {selectedSession?.targetLabel && (
                <Badge variant="outline" className="text-[9px]">
                  {selectedSession.targetLabel}
                </Badge>
              )}
            </div>
          </Card>
        </div>

        <div className="absolute bottom-3 right-3 z-[1000]">
          <Card className="p-2">
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                Signal Ping
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                Team Member
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Target Fix
              </div>
            </div>
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 1; }
          75% { transform: scale(2); opacity: 0; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
