import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SettingsPanel } from "@/components/settings-panel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserProfile } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Key, Copy, Trash2, Plus, Loader2, AlertTriangle, Download, Wifi, Bluetooth, Radio, Terminal, ExternalLink, HardDrive, Monitor, Smartphone } from "lucide-react";
import { SiApple, SiAndroid, SiLinux } from "react-icons/si";
import { FaWindows } from "react-icons/fa";

interface CollectorKey {
  id: number;
  name: string;
  maskedKey: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const COLLECTOR_SCRIPTS = [
  {
    type: "wifi",
    label: "WiFi Collector",
    filename: "sigint_collector.py",
    description: "Scans nearby WiFi networks using your WiFi adapter (built-in or Alfa AC-1000, etc.)",
    icon: Wifi,
    platforms: ["Windows", "macOS", "Linux"],
    requirements: "Python 3.8+, requests (macOS: + pyobjc-framework-CoreWLAN)",
  },
  {
    type: "bluetooth",
    label: "Bluetooth Collector",
    filename: "sigint_bluetooth_collector.py",
    description: "Scans nearby Bluetooth Classic and BLE devices using your Bluetooth adapter",
    icon: Bluetooth,
    platforms: ["Windows", "macOS", "Linux"],
    requirements: "Python 3.8+, requests, bleak",
  },
  {
    type: "multi",
    label: "Multi-Protocol Collector",
    filename: "sigint_multi_collector.py",
    description: "Combined WiFi + Bluetooth scanning in a single script for maximum coverage",
    icon: Radio,
    platforms: ["Windows", "macOS", "Linux"],
    requirements: "Python 3.8+, requests, bleak (macOS: + pyobjc)",
  },
];

type PlatformTab = "windows" | "macos" | "linux" | "ios" | "android";

const PLATFORM_GUIDES: Record<PlatformTab, { label: string; instructions: { step: string; code?: string; note?: string }[]; icon: typeof Monitor }> = {
  windows: {
    label: "Windows",
    icon: Monitor,
    instructions: [
      { step: "Install Python 3.8+ from python.org or Microsoft Store. During install, check 'Add Python to PATH'." },
      { step: "Open Command Prompt or PowerShell and install dependencies:", code: "pip install requests bleak" },
      { step: "Download a collector script from below and save it (e.g. to Desktop or Documents)." },
      { step: "Run the setup check to verify everything is working:", code: "python sigint_collector.py --setup" },
      { step: "Run the collector with your API key:", code: "python sigint_collector.py --key YOUR_API_KEY --url APP_URL" },
      { step: "For WiFi scanning, the built-in 'netsh wlan' is used automatically. For Bluetooth, ensure your Bluetooth adapter is turned on in Settings > Bluetooth." },
      { step: "Optional: Add GPS coordinates for location tagging:", code: "python sigint_collector.py --key YOUR_KEY --url APP_URL --lat 38.89 --lng -77.03 --interval 15" },
      { note: "Run as Administrator for best WiFi results. Some Bluetooth adapters may need updated drivers from the manufacturer's website." },
    ],
  },
  macos: {
    label: "macOS",
    icon: Monitor,
    instructions: [
      { step: "macOS includes Python 3 via Xcode Command Line Tools. Install if needed:", code: "xcode-select --install" },
      { step: "Install required Python packages (use system Python for best Apple framework compatibility):", code: "/usr/bin/python3 -m pip install requests bleak pyobjc-framework-CoreWLAN pyobjc-framework-CoreLocation" },
      { step: "Download a collector script from below and save it to a folder." },
      { step: "Run the setup diagnostic to check your environment:", code: "python3 sigint_collector.py --setup" },
      { step: "Enable required macOS permissions in System Settings > Privacy & Security:", note: "Location Services: Enable for Terminal/iTerm. Bluetooth: Enable for Terminal/iTerm. These are required for WiFi and Bluetooth scanning." },
      { step: "Run the collector:", code: "python3 sigint_collector.py --key YOUR_API_KEY --url APP_URL" },
      { note: "Apple removed the 'airport' WiFi scanning tool in macOS Sonoma 14.4+. These scripts use Apple's CoreWLAN framework instead, which requires Location Services permission. Bluetooth on macOS returns UUID-style addresses instead of real MAC addresses due to Apple's privacy protections - the scripts handle this automatically." },
    ],
  },
  linux: {
    label: "Linux",
    icon: Monitor,
    instructions: [
      { step: "Install Python 3 and pip if not already available:", code: "sudo apt install python3 python3-pip   # Debian/Ubuntu\nsudo dnf install python3 python3-pip   # Fedora/RHEL" },
      { step: "Install required Python packages:", code: "pip3 install requests bleak" },
      { step: "Download a collector script from below." },
      { step: "Run the setup diagnostic:", code: "python3 sigint_collector.py --setup" },
      { step: "For WiFi scanning, install wireless-tools or iw:", code: "sudo apt install wireless-tools iw   # Debian/Ubuntu" },
      { step: "Run the collector (may need sudo for WiFi scanning):", code: "sudo python3 sigint_collector.py --key YOUR_API_KEY --url APP_URL" },
      { step: "For Bluetooth scanning, ensure your Bluetooth service is running:", code: "sudo systemctl start bluetooth\nsudo systemctl enable bluetooth" },
      { note: "Linux provides the most complete scanning capabilities. Use 'sudo' for WiFi scanning to access interface details. For dedicated WiFi monitoring, external adapters like the Alfa AWUS036ACH with monitor mode support work best." },
    ],
  },
  ios: {
    label: "iOS",
    icon: Smartphone,
    instructions: [
      { step: "iOS does not support running Python collector scripts directly. Instead, use the Phone Bluetooth Scanner mode built into this app." },
      { step: "Open this app in Safari or Chrome on your iPhone/iPad." },
      { step: "On the Dashboard, tap the mode toggle and select 'Phone' mode (appears automatically when Web Bluetooth is supported)." },
      { step: "Tap 'Scan' to discover nearby Bluetooth devices. Each scan opens a device picker - select a device to add it to your collection." },
      { note: "Web Bluetooth support on iOS is limited. Chrome on iOS may support it via experimental flags, but Safari has limited support. For full iOS Bluetooth scanning, consider using a companion Mac running the Bluetooth collector script. WiFi scanning is not available from iOS browsers due to Apple's security restrictions." },
      { step: "Alternative: Use a Mac or PC on the same network running collector scripts, and view results on your iPhone through this web app." },
    ],
  },
  android: {
    label: "Android",
    icon: Smartphone,
    instructions: [
      { step: "Android has two scanning options: Phone mode (built-in) and Termux (advanced)." },
      { step: "Option 1 - Phone Bluetooth Scanner: Open this app in Chrome on your Android device. On the Dashboard, switch to 'Phone' mode and tap 'Scan' to discover nearby Bluetooth devices via Web Bluetooth API." },
      { step: "Option 2 - Full Collector via Termux: Install Termux from F-Droid (not Play Store).", note: "The Play Store version of Termux is outdated. Use F-Droid for the latest version." },
      { step: "In Termux, install Python and dependencies:", code: "pkg install python\npip install requests bleak" },
      { step: "Download and run a collector script in Termux:", code: "python sigint_collector.py --key YOUR_API_KEY --url APP_URL" },
      { step: "For GPS tagging on Android, enable Location in system settings. Chrome's Phone mode will attempt to use your GPS automatically." },
      { note: "Chrome on Android provides the best Web Bluetooth experience for the Phone scanner mode. For WiFi scanning via Termux, root access may be required. The Phone mode is recommended for most Android users as it requires no extra setup." },
    ],
  },
};

export default function SettingsPage() {
  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });
  const { toast } = useToast();

  const [newKeyName, setNewKeyName] = useState("");
  const [activePlatform, setActivePlatform] = useState<PlatformTab>("windows");
  const [revealedKey, setRevealedKey] = useState<{ id: number; name: string; apiKey: string } | null>(null);

  const updateDataModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      return apiRequest("PATCH", "/api/profile", { dataMode: mode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Data Mode Updated", description: "Your data mode preference has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update data mode.", variant: "destructive" });
    },
  });

  const { data: collectorKeys = [], isLoading: keysLoading } = useQuery<CollectorKey[]>({
    queryKey: ["/api/collector/keys"],
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/collector/keys", { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/collector/keys"] });
      setNewKeyName("");
      setRevealedKey({ id: data.id, name: data.name, apiKey: data.apiKey });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate API key.", variant: "destructive" });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/collector/keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collector/keys"] });
      toast({ title: "API Key Deleted", description: "The collector API key has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete API key.", variant: "destructive" });
    },
  });

  const handleCopyKey = () => {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey.apiKey);
      toast({ title: "Copied", description: "API key copied to clipboard." });
    }
  };

  const handleDownloadScript = async (type: string, filename: string) => {
    try {
      const res = await apiRequest("GET", `/api/collector/scripts/${type}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: `${filename} saved to your Downloads folder.` });
    } catch {
      toast({ title: "Error", description: "Failed to download script.", variant: "destructive" });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const appUrl = window.location.origin;

  return (
    <div className="flex flex-col h-full p-3 overflow-auto">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider">Settings</h2>
      </div>
      <div className="flex-1 min-h-0 max-w-2xl space-y-4">
        <SettingsPanel
          dataMode={profile?.dataMode ?? "local"}
          onDataModeChange={(mode) => updateDataModeMutation.mutate(mode)}
          storageUsed={profile?.storageUsedBytes ?? 0}
          storageLimit={profile?.storageLimitBytes ?? 2147483648}
          userTier={profile?.tier ?? "free"}
        />

        <Card className="overflow-visible">
          <CardHeader className="flex flex-row items-center gap-2 pb-2 px-3 pt-3">
            <Key className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Collector API Keys</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Generate API keys to authenticate your hardware collector scripts with this app.
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-3 pb-3 space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Key name (e.g. 'Office Scanner')"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="text-xs"
                data-testid="input-key-name"
              />
              <Button
                size="sm"
                disabled={!newKeyName.trim() || createKeyMutation.isPending}
                onClick={() => createKeyMutation.mutate(newKeyName.trim())}
                data-testid="button-generate-key"
              >
                {createKeyMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <Plus className="w-3 h-3 mr-1" />
                )}
                Generate Key
              </Button>
            </div>

            {revealedKey && (
              <div className="p-3 rounded-md border border-primary/40 bg-primary/5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-[10px] text-primary font-medium">
                    Save this key now. You will not be able to see it again.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted/20 px-2 py-1.5 rounded-md break-all select-all" data-testid="text-revealed-key">
                    {revealedKey.apiKey}
                  </code>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopyKey}
                    data-testid="button-copy-key"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[10px]"
                  onClick={() => setRevealedKey(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}

            {keysLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : collectorKeys.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-[10px] text-muted-foreground">No API keys generated yet.</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Create a key above to connect your collector scripts.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {collectorKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/50 bg-muted/10"
                    data-testid={`text-api-key-${k.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Key className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium truncate">{k.name}</span>
                          <Badge variant="outline" className="text-[8px] font-mono shrink-0">
                            ...{k.maskedKey}
                          </Badge>
                          {k.isActive && (
                            <Badge variant="outline" className="text-[7px] text-green-500 border-green-500/30 shrink-0">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[9px] text-muted-foreground">
                            Created: {formatDate(k.createdAt)}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            Last used: {formatDate(k.lastUsedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteKeyMutation.mutate(k.id)}
                      disabled={deleteKeyMutation.isPending}
                      data-testid={`button-delete-key-${k.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-visible">
          <CardHeader className="flex flex-row items-center gap-2 pb-2 px-3 pt-3">
            <Download className="w-4 h-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Hardware Collector Scripts</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Download Python scripts to run on your computer with real hardware (WiFi adapters, Bluetooth dongles, etc.)
              </p>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-3">
            {COLLECTOR_SCRIPTS.map((script) => {
              const SIcon = script.icon;
              return (
                <div
                  key={script.type}
                  className="flex items-start gap-3 p-3 rounded-md border border-border/50 bg-muted/5"
                  data-testid={`script-card-${script.type}`}
                >
                  <SIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold">{script.label}</span>
                      {script.platforms.map(p => (
                        <Badge key={p} variant="outline" className="text-[7px]">{p}</Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{script.description}</p>
                    <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                      Requires: {script.requirements}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadScript(script.type, script.filename)}
                    data-testid={`button-download-${script.type}`}
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                </div>
              );
            })}

            <div className="space-y-3 pt-3 border-t border-border/30">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Installation Guide</h4>
              </div>

              <div className="flex gap-1 flex-wrap">
                {(Object.keys(PLATFORM_GUIDES) as PlatformTab[]).map((platform) => {
                  const PIcon = platform === "windows" ? FaWindows : platform === "macos" ? SiApple : platform === "linux" ? SiLinux : platform === "android" ? SiAndroid : Smartphone;
                  return (
                    <Button
                      key={platform}
                      size="sm"
                      variant={activePlatform === platform ? "default" : "outline"}
                      className="text-[10px] toggle-elevate"
                      onClick={() => setActivePlatform(platform)}
                      data-testid={`button-platform-${platform}`}
                    >
                      <PIcon className="w-3 h-3 mr-1" />
                      {PLATFORM_GUIDES[platform].label}
                    </Button>
                  );
                })}
              </div>

              <div className="space-y-2 p-2.5 rounded-md border border-border/30 bg-muted/5" data-testid={`text-platform-guide-${activePlatform}`}>
                {PLATFORM_GUIDES[activePlatform].instructions.map((inst, i) => (
                  <div key={i} className="space-y-1">
                    {inst.step && (
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="text-[8px] shrink-0 mt-0.5">{i + 1}</Badge>
                        <p className="text-[10px] text-muted-foreground">{inst.step}</p>
                      </div>
                    )}
                    {inst.code && (
                      <code className="block ml-6 text-[9px] font-mono bg-muted/20 px-2 py-1.5 rounded-md select-all whitespace-pre-wrap break-all leading-relaxed">
                        {inst.code.replace(/APP_URL/g, appUrl)}
                      </code>
                    )}
                    {inst.note && !inst.step && (
                      <div className="flex items-start gap-2 p-2 rounded-md border border-primary/20 bg-primary/5 ml-0">
                        <AlertTriangle className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                        <p className="text-[9px] text-muted-foreground">{inst.note}</p>
                      </div>
                    )}
                    {inst.note && inst.step && (
                      <p className="text-[9px] text-muted-foreground/70 ml-6">{inst.note}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 p-2 rounded-md border border-yellow-500/20 bg-yellow-500/5">
                <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-[9px] text-muted-foreground">
                  The collector scripts run on YOUR machine, not on this server. They scan your local wireless environment using your hardware and securely push the results to this cloud app via the API. Run any script with --setup to diagnose issues.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
