import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Settings, Database, Users, Shield, Radio, Globe, HardDrive, Crown, UserCog, Bluetooth, Wifi, Cpu, Antenna, Satellite, CircuitBoard, Thermometer, Radar, Trash2, AlertTriangle, Check, X, Plus, Loader2 } from "lucide-react";
import { GlowLine } from "./scan-animation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isWebBluetoothSupported } from "@/lib/ble-scanner";
import { AddSensorDialog } from "./add-sensor-dialog";
import type { UserProfile, CollectionSensor } from "@shared/schema";

interface SettingsPanelProps {
  dataMode: string;
  onDataModeChange: (mode: string) => void;
  storageUsed: number;
  storageLimit: number;
  userTier: string;
}

export function SettingsPanel({ dataMode, onDataModeChange, storageUsed, storageLimit, userTier }: SettingsPanelProps) {
  const [showNotifications, setShowNotifications] = useState(true);
  const [followingDetection, setFollowingDetection] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const { toast } = useToast();

  const isAdmin = userTier === "admin";
  const hasBluetooth = isWebBluetoothSupported();
  const hasGeolocation = typeof navigator !== "undefined" && "geolocation" in navigator;

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
    { label: "Bluetooth (BLE)", icon: Bluetooth, available: hasBluetooth, description: hasBluetooth ? "Ready - use BLE Scan to discover devices" : "Not available in this browser (use Chrome/Edge)", color: "hsl(217, 91%, 60%)" },
    { label: "GPS / Geolocation", icon: Radar, available: hasGeolocation, description: hasGeolocation ? "Ready - auto-tags observations with your location" : "Not available", color: "hsl(185, 100%, 50%)" },
    { label: "Wi-Fi Scanning", icon: Wifi, available: false, description: "Requires native companion app (browser limitation)", color: "hsl(142, 76%, 48%)" },
    { label: "SDR Receiver", icon: Antenna, available: false, description: "Requires native desktop app with USB hardware", color: "hsl(280, 65%, 55%)" },
    { label: "LoRa / Meshtastic", icon: Radio, available: false, description: "Requires native app with serial/USB connection", color: "hsl(25, 85%, 55%)" },
    { label: "RFID Reader", icon: CircuitBoard, available: false, description: "Requires native app with USB hardware", color: "hsl(45, 90%, 55%)" },
    { label: "ADS-B Receiver", icon: Satellite, available: false, description: "Requires native app with RTL-SDR hardware", color: "hsl(0, 72%, 55%)" },
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
