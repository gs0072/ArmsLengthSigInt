import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Settings, Database, Users, Shield, Radio, Globe, Zap, HardDrive, Crown, UserCog, Bluetooth, Wifi, Cpu, Antenna, Radar, Satellite, CircuitBoard, Thermometer, Usb } from "lucide-react";
import { GlowLine } from "./scan-animation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserProfile } from "@shared/schema";

interface SettingsPanelProps {
  dataMode: string;
  onDataModeChange: (mode: string) => void;
  storageUsed: number;
  storageLimit: number;
  userTier: string;
}

export function SettingsPanel({ dataMode, onDataModeChange, storageUsed, storageLimit, userTier }: SettingsPanelProps) {
  const [autoScan, setAutoScan] = useState(true);
  const [scanInterval, setScanInterval] = useState([5]);
  const [showNotifications, setShowNotifications] = useState(true);
  const [followingDetection, setFollowingDetection] = useState(true);
  const [interrogationDetection, setInterrogationDetection] = useState(true);
  const [hardwareSources, setHardwareSources] = useState({
    bleAdapter: { enabled: true, label: "Bluetooth (BLE) Adapter", icon: Bluetooth, description: "Scan for BLE devices, beacons, and peripherals", interface: "USB / Built-in", color: "hsl(217, 91%, 60%)" },
    wifiAdapter: { enabled: true, label: "Wi-Fi Adapter", icon: Wifi, description: "Monitor Wi-Fi networks, access points, and clients", interface: "USB / Built-in", color: "hsl(142, 76%, 48%)" },
    sdrReceiver: { enabled: false, label: "SDR Receiver", icon: Antenna, description: "RTL-SDR, HackRF, or other software-defined radio", interface: "USB", color: "hsl(280, 65%, 55%)" },
    loraRadio: { enabled: false, label: "LoRa / Meshtastic Radio", icon: Radio, description: "LoRa mesh network nodes and Meshtastic devices", interface: "USB / Serial", color: "hsl(25, 85%, 55%)" },
    rfidReader: { enabled: false, label: "RFID Reader", icon: CircuitBoard, description: "Proxmark3, ACR122U, or other NFC/RFID readers", interface: "USB", color: "hsl(45, 90%, 55%)" },
    adsbReceiver: { enabled: false, label: "ADS-B Receiver", icon: Satellite, description: "Aircraft transponder receiver (1090 MHz)", interface: "USB / RTL-SDR", color: "hsl(0, 72%, 55%)" },
    gpsModule: { enabled: true, label: "GPS Module", icon: Radar, description: "Location tracking via GPS/GNSS receiver", interface: "USB / Built-in", color: "hsl(185, 100%, 50%)" },
    externalSensors: { enabled: false, label: "External Sensors", icon: Thermometer, description: "Environmental sensors (temp, humidity, EMF)", interface: "USB / I2C / SPI", color: "hsl(320, 70%, 55%)" },
  });
  const [signalFilters, setSignalFilters] = useState({
    bluetooth: true,
    wifi: true,
    rfid: true,
    sdr: true,
    lora: true,
    meshtastic: true,
    adsb: true,
    sensor: true,
  });
  const { toast } = useToast();

  const isAdmin = userTier === "admin";

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
              <SelectItem value="friends">Friends & Trusted Users</SelectItem>
              <SelectItem value="public">Public Shared Data</SelectItem>
              <SelectItem value="osint">Open Source Datasets</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            {dataMode === "local" && "Only using data collected from your own devices"}
            {dataMode === "friends" && "Combining data from trusted user connections"}
            {dataMode === "public" && "Including publicly shared collections from all users"}
            {dataMode === "osint" && "Integrating with open source intelligence datasets"}
          </p>
        </div>

        <GlowLine />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium">Scanning</h4>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Auto-scan</Label>
            <Switch checked={autoScan} onCheckedChange={setAutoScan} data-testid="switch-auto-scan" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Scan interval: {scanInterval[0]}s</Label>
            <Slider value={scanInterval} onValueChange={setScanInterval} min={1} max={30} step={1} />
          </div>
        </div>

        <GlowLine />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Usb className="w-3.5 h-3.5 text-primary" />
              <h4 className="text-xs font-medium">Hardware Sources</h4>
            </div>
            <Badge variant="outline" className="text-[8px] uppercase tracking-wider">
              {Object.values(hardwareSources).filter(h => h.enabled).length} / {Object.values(hardwareSources).length} Active
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Select which hardware interfaces to use for signal collection. Native companion apps required for direct hardware access.
          </p>
          <div className="space-y-2">
            {Object.entries(hardwareSources).map(([key, hw]) => {
              const IconComp = hw.icon;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-3 p-2 rounded-md border transition-colors ${
                    hw.enabled
                      ? "border-border/50 bg-muted/10"
                      : "border-border/20 bg-transparent opacity-60"
                  }`}
                  data-testid={`hardware-${key}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: hw.enabled ? `${hw.color}` : undefined, opacity: hw.enabled ? 0.15 : 0.05 }}
                    >
                      <IconComp className="w-3.5 h-3.5" style={{ color: hw.enabled ? hw.color : undefined }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium truncate">{hw.label}</span>
                        {hw.enabled && (
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-[9px] text-muted-foreground truncate">{hw.description}</p>
                      <p className="text-[8px] text-muted-foreground/60 font-mono">{hw.interface}</p>
                    </div>
                  </div>
                  <Switch
                    checked={hw.enabled}
                    onCheckedChange={v => {
                      setHardwareSources(prev => ({
                        ...prev,
                        [key]: { ...prev[key as keyof typeof prev], enabled: v },
                      }));
                      toast({
                        title: v ? "Hardware Enabled" : "Hardware Disabled",
                        description: `${hw.label} has been ${v ? "activated" : "deactivated"}.`,
                      });
                    }}
                    data-testid={`switch-hardware-${key}`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <GlowLine />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-muted-foreground" />
            <h4 className="text-xs font-medium">Signal Filters</h4>
          </div>
          {Object.entries(signalFilters).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <Label className="text-xs capitalize">{key === "adsb" ? "ADS-B" : key}</Label>
              <Switch
                checked={val}
                onCheckedChange={v => setSignalFilters(prev => ({ ...prev, [key]: v }))}
                data-testid={`switch-filter-${key}`}
              />
            </div>
          ))}
        </div>

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
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Interrogation Detection</Label>
            <Switch checked={interrogationDetection} onCheckedChange={setInterrogationDetection} data-testid="switch-interrogation" />
          </div>
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
