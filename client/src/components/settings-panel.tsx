import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings, Database, Users, Shield, Radio, Globe, HardDrive, Crown, UserCog, Bluetooth, Wifi, Cpu, Antenna, Satellite, CircuitBoard, Thermometer, Radar, Trash2, AlertTriangle, Check, X, Plus, Loader2, Monitor, Server, UserPlus, Mail, ExternalLink, Layers } from "lucide-react";
import { GlowLine } from "./scan-animation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AddSensorDialog } from "./add-sensor-dialog";
import type { UserProfile, CollectionSensor, TrustedUser } from "@shared/schema";
import { getTierFeatures, FEATURE_LABELS, type TierFeatures } from "@shared/tier-features";

interface SettingsPanelProps {
  dataMode: string;
  onDataModeChange: (mode: string) => void;
  storageUsed: number;
  storageLimit: number;
  userTier: string;
}

const OSINT_DATA_SOURCES = [
  { name: "WiGLE", desc: "Wireless network mapping database", url: "https://wigle.net", type: "wifi" },
  { name: "ADS-B Exchange", desc: "Unfiltered aircraft tracking", url: "https://adsbexchange.com", type: "adsb" },
  { name: "OpenCellID", desc: "Open cell tower location database", url: "https://opencellid.org", type: "sensor" },
  { name: "FCC ULS", desc: "FCC license database for radio stations", url: "https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicense.jsp", type: "sdr" },
  { name: "Shodan", desc: "Internet-connected device search engine", url: "https://shodan.io", type: "wifi" },
  { name: "Censys", desc: "Internet-wide device scanning database", url: "https://censys.io", type: "wifi" },
  { name: "MarineTraffic", desc: "Global vessel tracking (AIS)", url: "https://marinetraffic.com", type: "sensor" },
  { name: "FlightRadar24", desc: "Real-time aircraft tracking", url: "https://flightradar24.com", type: "adsb" },
  { name: "RadioReference", desc: "Scanner frequency database", url: "https://radioreference.com", type: "sdr" },
  { name: "Meshtastic Nodes DB", desc: "Meshtastic mesh node registry", url: "https://meshtastic.org", type: "lora" },
  { name: "APRS-IS", desc: "Amateur radio APRS position reports", url: "https://aprs.fi", type: "sdr" },
  { name: "HaveIBeenPwned", desc: "Breach data for device/email cross-ref", url: "https://haveibeenpwned.com", type: "osint" },
];

export function SettingsPanel({ dataMode, onDataModeChange, storageUsed, storageLimit, userTier }: SettingsPanelProps) {
  const [showNotifications, setShowNotifications] = useState(true);
  const [followingDetection, setFollowingDetection] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [trustedEmail, setTrustedEmail] = useState("");
  const [trustedAlias, setTrustedAlias] = useState("");
  const { toast } = useToast();

  const isAdmin = userTier === "admin";
  const tierConfig = getTierFeatures(userTier);

  const { data: trustedUsers = [] } = useQuery<TrustedUser[]>({
    queryKey: ["/api/trusted-users"],
  });

  const addTrustedMutation = useMutation({
    mutationFn: async (data: { email: string; alias: string }) =>
      apiRequest("POST", "/api/trusted-users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trusted-users"] });
      setTrustedEmail("");
      setTrustedAlias("");
      toast({ title: "Trusted user added" });
    },
    onError: () => toast({ title: "Failed to add trusted user", variant: "destructive" }),
  });

  const removeTrustedMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/trusted-users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trusted-users"] });
      toast({ title: "Trusted user removed" });
    },
  });
  const hasGeolocation = typeof navigator !== "undefined" && "geolocation" in navigator;

  const { data: systemInfo } = useQuery<{
    system: { os: string; platform: string; arch: string; hostname: string; kernel: string; cpus: number; memory: { total: number; free: number; used: number } };
    tools: Array<{ name: string; installed: boolean; version: string; description: string }>;
    networkInterfaces: Array<{ name: string; mac: string; addresses: string[]; internal: boolean }>;
  }>({
    queryKey: ["/api/system/info"],
  });

  const isToolInstalled = (name: string) => systemInfo?.tools?.find(t => t.name === name)?.installed ?? false;

  const { data: adminUsers = [] } = useQuery<UserProfile[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const updateUserTierMutation = useMutation({
    mutationFn: async ({ targetUserId, tier }: { targetUserId: string; tier: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${targetUserId}`, { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Updated", description: "User tier has been changed successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update user tier.", variant: "destructive" });
    },
  });

  const clearDataMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/clear-data");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/following-detection"] });
      setConfirmClear(false);
      toast({ title: "Data Cleared", description: "All devices, observations, and alerts have been removed. You can now start collecting real data." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to clear data.", variant: "destructive" });
    },
  });

  const { data: sensors = [], isLoading: sensorsLoading } = useQuery<CollectionSensor[]>({
    queryKey: ["/api/sensors"],
  });

  const deleteSensorMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sensors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sensors"] });
      toast({ title: "Sensor Removed", description: "Collection sensor has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove sensor.", variant: "destructive" });
    },
  });

  const toggleSensorActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/sensors/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sensors"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to toggle sensor.", variant: "destructive" });
    },
  });

  const sensorTypeIcons: Record<string, any> = {
    bluetooth: Bluetooth,
    wifi: Wifi,
    rfid: CircuitBoard,
    sdr: Antenna,
    lora: Radio,
    meshtastic: Radio,
    adsb: Satellite,
    sensor: Thermometer,
    unknown: Radar,
  };

  const sensorTypeColors: Record<string, string> = {
    bluetooth: "hsl(217, 91%, 60%)",
    wifi: "hsl(142, 76%, 48%)",
    rfid: "hsl(45, 90%, 55%)",
    sdr: "hsl(280, 65%, 55%)",
    lora: "hsl(25, 85%, 55%)",
    meshtastic: "hsl(25, 85%, 55%)",
    adsb: "hsl(0, 72%, 55%)",
    sensor: "hsl(320, 70%, 55%)",
    unknown: "hsl(200, 20%, 50%)",
  };

  const storagePercent = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0;
  const formatBytes = (b: number) => {
    if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    return `${(b / 1e3).toFixed(0)} KB`;
  };

  const tierColors: Record<string, string> = {
    free: "hsl(200, 20%, 50%)",
    basic: "hsl(185, 100%, 50%)",
    professional: "hsl(280, 65%, 55%)",
    enterprise: "hsl(45, 90%, 55%)",
    admin: "hsl(0, 72%, 55%)",
  };

  const tierDescriptions: Record<string, string> = {
    free: "2 GB storage, local data only, basic signal filters",
    basic: "5 GB storage, friend sharing, enhanced scanning",
    professional: "20 GB storage, public data access, advanced triangulation",
    enterprise: "100 GB storage, full OSINT integration, priority processing",
    admin: "10 GB storage, full platform access, user management, system configuration",
  };

  const capabilities = [
    { label: "Bluetooth (BLE)", icon: Bluetooth, available: true, description: "Passive monitoring - discovers nearby BLE devices", color: "hsl(217, 91%, 60%)" },
    { label: "GPS / Geolocation", icon: Radar, available: hasGeolocation, description: hasGeolocation ? "Ready - auto-tags observations with your location" : "Not available", color: "hsl(185, 100%, 50%)" },
    { label: "Wi-Fi Scanning", icon: Wifi, available: true, description: "Passive monitoring - discovers nearby Wi-Fi networks", color: "hsl(142, 76%, 48%)" },
    { label: "Network Scanner (nmap)", icon: Globe, available: isToolInstalled("nmap"), description: isToolInstalled("nmap") ? "Installed - host discovery and port scanning" : "nmap not installed", color: "hsl(160, 80%, 45%)" },
    { label: "SDR Receiver", icon: Antenna, available: isToolInstalled("rtl_sdr"), description: isToolInstalled("rtl_sdr") ? "RTL-SDR tools installed - connect USB dongle" : "rtl-sdr tools not installed", color: "hsl(280, 65%, 55%)" },
    { label: "LoRa / Meshtastic", icon: Radio, available: true, description: "HTTP API ready - connect to Meshtastic device on network", color: "hsl(25, 85%, 55%)" },
    { label: "RFID Reader", icon: CircuitBoard, available: false, description: "Requires native app with USB hardware", color: "hsl(45, 90%, 55%)" },
    { label: "ADS-B Receiver", icon: Satellite, available: isToolInstalled("rtl_sdr"), description: isToolInstalled("rtl_sdr") ? "RTL-SDR available - connect ADS-B antenna" : "Requires RTL-SDR hardware", color: "hsl(0, 72%, 55%)" },
    { label: "External Sensors", icon: Thermometer, available: false, description: "Requires native app with I2C/SPI hardware", color: "hsl(320, 70%, 55%)" },
  ];

  return (
    <Card className="flex flex-col h-full overflow-visible">
      <CardHeader className="flex flex-row items-center gap-2 pb-2 px-3 pt-3">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Settings & Configuration</h3>
      </CardHeader>

      <CardContent className="flex-1 px-3 pb-3 space-y-4 overflow-auto">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <h4 className="text-xs font-medium">Account Tier</h4>
            </div>
            <Badge variant="outline" style={{ color: tierColors[userTier], borderColor: tierColors[userTier] }} className="text-[9px] uppercase" data-testid="badge-user-tier">
              {userTier === "admin" && <Crown className="w-3 h-3 mr-1" />}
              {userTier}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground" data-testid="text-tier-description">
            {tierDescriptions[userTier] || "Unknown tier"}
          </p>

          <div className="mt-2 space-y-1">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Tier Features</p>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(FEATURE_LABELS) as Array<keyof TierFeatures["features"]>).map((featureKey) => {
                const enabled = tierConfig.features[featureKey];
                const info = FEATURE_LABELS[featureKey];
                return (
                  <div
                    key={featureKey}
                    className={`flex items-center gap-1.5 p-1.5 rounded text-[9px] ${enabled ? "text-foreground" : "text-muted-foreground/40"}`}
                    title={info.description}
                    data-testid={`feature-${featureKey}`}
                  >
                    {enabled ? (
                      <Check className="w-3 h-3 text-green-500 shrink-0" />
                    ) : (
                      <X className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                    )}
                    <span className="truncate">{info.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-[9px] text-muted-foreground">
              <div className="flex justify-between gap-1">
                <span>Max Devices</span>
                <span className="font-mono">{tierConfig.maxDevices < 0 ? "Unlimited" : tierConfig.maxDevices}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span>Max Sensors</span>
                <span className="font-mono">{tierConfig.maxSensors < 0 ? "Unlimited" : tierConfig.maxSensors}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span>Trusted Users</span>
                <span className="font-mono">{tierConfig.maxTrustedUsers < 0 ? "Unlimited" : tierConfig.maxTrustedUsers}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span>Analysis Time</span>
                <span className="font-mono">{tierConfig.analysisTimeoutSeconds < 0 ? "Unlimited" : `${tierConfig.analysisTimeoutSeconds}s`}</span>
              </div>
            </div>
          </div>
        </div>

        <GlowLine />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium">Storage</h4>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{formatBytes(storageUsed)} used</span>
              <span>{formatBytes(storageLimit)} limit</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, storagePercent)}%`,
                  backgroundColor: storagePercent > 90 ? "hsl(0, 72%, 55%)" : storagePercent > 70 ? "hsl(45, 90%, 55%)" : "hsl(185, 100%, 50%)",
                }}
              />
            </div>
          </div>
        </div>

        <GlowLine />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium">Data Mode</h4>
          </div>
          <Select value={dataMode} onValueChange={onDataModeChange}>
            <SelectTrigger className="text-xs" data-testid="select-data-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local Collections Only</SelectItem>
              <SelectItem value="friends" disabled={!tierConfig.allowedDataModes.includes("friends")}>
                Friends & Trusted Users {!tierConfig.allowedDataModes.includes("friends") ? "(Basic+)" : ""}
              </SelectItem>
              <SelectItem value="public" disabled={!tierConfig.allowedDataModes.includes("public")}>
                Public Shared Data {!tierConfig.allowedDataModes.includes("public") ? "(Professional+)" : ""}
              </SelectItem>
              <SelectItem value="osint" disabled={!tierConfig.allowedDataModes.includes("osint")}>
                Open Source Datasets {!tierConfig.allowedDataModes.includes("osint") ? "(Enterprise+)" : ""}
              </SelectItem>
              <SelectItem value="combined" disabled={!tierConfig.allowedDataModes.includes("combined")}>
                Combined / All Sources {!tierConfig.allowedDataModes.includes("combined") ? "(Enterprise+)" : ""}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {dataMode === "local" && "Only using data collected from your own devices"}
            {dataMode === "friends" && "Combining data from trusted user connections"}
            {dataMode === "public" && "Including publicly shared collections from all users"}
            {dataMode === "osint" && "Integrating with open source intelligence datasets"}
            {dataMode === "combined" && "Combining all data sources: local, friends, public, and OSINT"}
          </p>

          {dataMode === "friends" && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3 text-muted-foreground" />
                <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground">Trusted Users ({trustedUsers.length})</h5>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="user@email.com"
                  value={trustedEmail}
                  onChange={(e) => setTrustedEmail(e.target.value)}
                  className="text-xs h-8"
                  data-testid="input-trusted-email"
                />
                <Input
                  placeholder="Alias (optional)"
                  value={trustedAlias}
                  onChange={(e) => setTrustedAlias(e.target.value)}
                  className="text-xs h-8 w-28"
                  data-testid="input-trusted-alias"
                />
                <Button
                  size="sm"
                  disabled={!trustedEmail.includes("@") || addTrustedMutation.isPending}
                  onClick={() => addTrustedMutation.mutate({ email: trustedEmail, alias: trustedAlias })}
                  data-testid="button-add-trusted"
                >
                  {addTrustedMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                </Button>
              </div>
              {trustedUsers.length > 0 && (
                <div className="space-y-1">
                  {trustedUsers.map(tu => (
                    <div key={tu.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/10 border border-border/30" data-testid={`trusted-user-${tu.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs truncate">{tu.trustedEmail}</span>
                        {tu.trustedAlias && <Badge variant="outline" className="text-[8px] shrink-0">{tu.trustedAlias}</Badge>}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeTrustedMutation.mutate(tu.id)}
                        data-testid={`button-remove-trusted-${tu.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {trustedUsers.length === 0 && (
                <p className="text-[10px] text-muted-foreground/60 text-center py-2">No trusted users added yet. Add users by email to share collection data.</p>
              )}
            </div>
          )}

          {dataMode === "osint" && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-3 h-3 text-muted-foreground" />
                <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground">OSINT Data Sources</h5>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {OSINT_DATA_SOURCES.map(src => (
                  <div key={src.name} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/10 border border-border/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[7px] shrink-0">{src.type}</Badge>
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium truncate">{src.name}</p>
                        <p className="text-[9px] text-muted-foreground truncate">{src.desc}</p>
                      </div>
                    </div>
                    <a href={src.url} target="_blank" rel="noopener noreferrer">
                      <Button size="icon" variant="ghost" data-testid={`button-osint-${src.name.toLowerCase().replace(/\s+/g, "-")}`}>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
              <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
                <p className="text-[10px] text-muted-foreground">
                  <span className="text-primary font-medium">HUMINT Linking:</span> Associate human identities, aliases, and personas to detected nodes via the Node Report page. Click any node and use the Intelligence Links section to create HUMINT associations.
                </p>
              </div>
            </div>
          )}

          {dataMode === "combined" && (
            <div className="mt-3 p-2 rounded-md bg-muted/10 border border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-3 h-3 text-primary" />
                <h5 className="text-[10px] font-medium">Active Data Sources</h5>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[8px]">Local Collections</Badge>
                <Badge variant="outline" className="text-[8px]">Friends ({trustedUsers.length})</Badge>
                <Badge variant="outline" className="text-[8px]">Public Data</Badge>
                <Badge variant="outline" className="text-[8px]">OSINT ({OSINT_DATA_SOURCES.length} sources)</Badge>
              </div>
            </div>
          )}
        </div>

        <GlowLine />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <h4 className="text-xs font-medium">Collection Sensors</h4>
            </div>
            <AddSensorDialog
              trigger={
                <Button size="sm" variant="outline" data-testid="button-add-sensor-settings">
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              }
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Configure your collection hardware here. Activate sensors from the Dashboard to start discovering nodes.
          </p>
          {sensorsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : sensors.length === 0 ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-[10px] text-muted-foreground">No sensors configured yet.</p>
              <p className="text-[10px] text-muted-foreground/70">Add a sensor to start collecting signal intelligence.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sensors.map((sensor) => {
                const SensorIcon = sensorTypeIcons[sensor.sensorType] || Radar;
                const sensorColor = sensorTypeColors[sensor.sensorType] || "hsl(200, 20%, 50%)";
                return (
                  <div
                    key={sensor.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-md border border-border/50 bg-muted/10"
                    data-testid={`sensor-item-${sensor.id}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: sensorColor, opacity: 0.15 }}
                      >
                        <SensorIcon className="w-3.5 h-3.5" style={{ color: sensorColor }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-medium truncate">{sensor.name}</span>
                          <Badge variant="outline" className="text-[8px] uppercase">
                            {sensor.connectionMethod}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[8px] uppercase"
                            style={{
                              color: sensor.status === "collecting" ? "hsl(185, 100%, 50%)" : sensor.status === "error" ? "hsl(0, 72%, 55%)" : undefined,
                              borderColor: sensor.status === "collecting" ? "hsl(185, 100%, 50%)" : sensor.status === "error" ? "hsl(0, 72%, 55%)" : undefined,
                            }}
                          >
                            {sensor.status || "idle"}
                          </Badge>
                        </div>
                        <p className="text-[9px] text-muted-foreground truncate">
                          {sensor.sensorType} {sensor.nodesCollected ? `| ${sensor.nodesCollected} nodes collected` : ""} {sensor.notes ? `| ${sensor.notes}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={sensor.isActive ?? false}
                        onCheckedChange={(checked) => toggleSensorActiveMutation.mutate({ id: sensor.id, isActive: checked })}
                        data-testid={`switch-sensor-active-${sensor.id}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteSensorMutation.mutate(sensor.id)}
                        disabled={deleteSensorMutation.isPending}
                        data-testid={`button-delete-sensor-${sensor.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <GlowLine />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radar className="w-3.5 h-3.5 text-muted-foreground" />
              <h4 className="text-xs font-medium">Browser Capabilities</h4>
            </div>
            <Badge variant="outline" className="text-[8px] uppercase tracking-wider">
              {capabilities.filter(c => c.available).length} / {capabilities.length} Available
            </Badge>
          </div>
          <div className="space-y-2">
            {capabilities.map((cap) => {
              const IconComp = cap.icon;
              return (
                <div
                  key={cap.label}
                  className={`flex items-center justify-between gap-3 p-2 rounded-md border transition-colors ${
                    cap.available
                      ? "border-border/50 bg-muted/10"
                      : "border-border/20 bg-transparent opacity-60"
                  }`}
                  data-testid={`capability-${cap.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: cap.available ? cap.color : undefined, opacity: cap.available ? 0.15 : 0.05 }}
                    >
                      <IconComp className="w-3.5 h-3.5" style={{ color: cap.available ? cap.color : undefined }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium truncate">{cap.label}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground truncate">{cap.description}</p>
                    </div>
                  </div>
                  {cap.available ? (
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <GlowLine />

        {systemInfo && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                <h4 className="text-xs font-medium">Host System</h4>
              </div>
              <Badge variant="outline" className="text-[8px] uppercase tracking-wider">
                {systemInfo.system.platform}
              </Badge>
            </div>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">OS</span>
                <span className="text-right truncate">{systemInfo.system.os}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Arch</span>
                <span>{systemInfo.system.arch}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">CPUs</span>
                <span>{systemInfo.system.cpus}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Memory</span>
                <span>{formatBytes(systemInfo.system.memory.used)} / {formatBytes(systemInfo.system.memory.total)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Hostname</span>
                <span className="truncate">{systemInfo.system.hostname}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Installed Tools</p>
              <div className="flex flex-wrap gap-1">
                {systemInfo.tools.filter(t => t.installed).map(tool => (
                  <Badge key={tool.name} variant="outline" className="text-[8px]" style={{ color: "hsl(185, 100%, 50%)", borderColor: "hsl(185, 100%, 50%)" }}>
                    {tool.name}
                  </Badge>
                ))}
                {systemInfo.tools.filter(t => !t.installed).map(tool => (
                  <Badge key={tool.name} variant="outline" className="text-[8px] opacity-40">
                    {tool.name}
                  </Badge>
                ))}
              </div>
            </div>
            {systemInfo.networkInterfaces.filter(i => !i.internal).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Network Interfaces</p>
                {systemInfo.networkInterfaces.filter(i => !i.internal).map(iface => (
                  <div key={iface.name} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="font-medium">{iface.name}</span>
                    <span className="text-muted-foreground truncate">{iface.addresses[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <GlowLine />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium">Security</h4>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Push Notifications</Label>
            <Switch checked={showNotifications} onCheckedChange={setShowNotifications} data-testid="switch-notifications" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Following Detection</Label>
            <Switch checked={followingDetection} onCheckedChange={setFollowingDetection} data-testid="switch-following" />
          </div>
        </div>

        <GlowLine />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium">Data Management</h4>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Clear all demo/seed data to start fresh with your own real collections. This will remove all devices, observations, and alerts.
          </p>
          {!confirmClear ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setConfirmClear(true)}
              data-testid="button-clear-data"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Clear All Data
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <p className="text-[10px] text-destructive">This will permanently delete all your devices, observations, and alerts. This cannot be undone.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmClear(false)}
                  data-testid="button-cancel-clear"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => clearDataMutation.mutate()}
                  disabled={clearDataMutation.isPending}
                  data-testid="button-confirm-clear"
                >
                  {clearDataMutation.isPending ? "Clearing..." : "Confirm Delete"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <>
            <GlowLine />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <UserCog className="w-3.5 h-3.5 text-destructive" />
                <h4 className="text-xs font-medium text-destructive">Admin: User Management</h4>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Manage user tiers and access levels for all platform users.
              </p>
              {adminUsers.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic">No other users registered yet.</p>
              )}
              {adminUsers.map(u => (
                <div key={u.userId} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/10 border border-border/30">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono truncate" data-testid={`text-admin-user-${u.userId}`}>
                      {u.userId}
                    </p>
                  </div>
                  <Select
                    value={u.tier}
                    onValueChange={(newTier) => {
                      updateUserTierMutation.mutate({ targetUserId: u.userId, tier: newTier });
                    }}
                  >
                    <SelectTrigger className="w-28 text-[10px]" data-testid={`select-tier-${u.userId}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
