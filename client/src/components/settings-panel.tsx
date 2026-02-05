import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Settings, Database, Users, Shield, Radio, Globe, Zap, HardDrive } from "lucide-react";
import { GlowLine } from "./scan-animation";

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
            <Badge variant="outline" style={{ color: tierColors[userTier], borderColor: tierColors[userTier] }} className="text-[9px] uppercase">
              {userTier}
            </Badge>
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
      </CardContent>
    </Card>
  );
}
