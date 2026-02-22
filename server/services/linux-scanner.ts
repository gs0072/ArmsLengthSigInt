import { exec, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync } from "fs";
import os from "os";

const execAsync = promisify(exec);

export interface ScannedBLEDevice {
  macAddress: string;
  name: string;
  rssi: number;
  deviceType: string;
  manufacturer: string;
}

export interface ScannedWiFiDevice {
  macAddress: string;
  ssid: string;
  rssi: number;
  channel: number;
  encryption: string;
  frequency: number;
}

export interface ScannedSDRSignal {
  frequency: number;
  power: number;
  bandwidth: number;
  label: string;
  band: string;
}

export interface GPSPosition {
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  accuracy: number;
  timestamp: number;
}

export interface ScannerStatus {
  bleAvailable: boolean;
  bleScanning: boolean;
  wifiAvailable: boolean;
  wifiMonitorMode: boolean;
  sdrAvailable: boolean;
  sdrScanning: boolean;
  sdrAudioActive: boolean;
  sdrAudioFrequency: number | null;
  sdrAudioMode: string | null;
  audioAvailable: boolean;
  gpsAvailable: boolean;
  gpsPosition: GPSPosition | null;
  lastScanTime: number | null;
  totalDevicesFound: number;
  scanCount: number;
}

export interface DependencyStatus {
  tool: string;
  available: boolean;
  package: string;
  purpose: string;
  installed: boolean;
  installAttempted: boolean;
  installError: string | null;
}

export interface NodeConfig {
  nodeId: string;
  nodeName: string;
  createdAt: string;
  platform: string;
  role: string;
  syncEnabled: boolean;
  syncTargetUrl: string;
  scanIntervalMs: number;
  enableBLE: boolean;
  enableWiFi: boolean;
  enableSDR: boolean;
}

const CONFIG_PATH = ".sigint-node.json";

let scannerStatus: ScannerStatus = {
  bleAvailable: false,
  bleScanning: false,
  wifiAvailable: false,
  wifiMonitorMode: false,
  sdrAvailable: false,
  sdrScanning: false,
  sdrAudioActive: false,
  sdrAudioFrequency: null,
  sdrAudioMode: null,
  audioAvailable: false,
  gpsAvailable: false,
  gpsPosition: null,
  lastScanTime: null,
  totalDevicesFound: 0,
  scanCount: 0,
};

let scanInterval: ReturnType<typeof setInterval> | null = null;
let onDeviceDiscovered: ((device: ScannedBLEDevice | ScannedWiFiDevice | ScannedSDRSignal, type: "bluetooth" | "wifi" | "sdr", gps: GPSPosition | null) => void) | null = null;
let dependencyResults: DependencyStatus[] = [];

let sdrAudioProcess: ChildProcess | null = null;

const REQUIRED_DEPENDENCIES: Array<{ tool: string; package: string; purpose: string }> = [
  { tool: "hcitool", package: "bluez", purpose: "Bluetooth LE scanning" },
  { tool: "bluetoothctl", package: "bluez", purpose: "Bluetooth device management" },
  { tool: "hciconfig", package: "bluez", purpose: "Bluetooth adapter configuration" },
  { tool: "iwconfig", package: "wireless-tools", purpose: "WiFi interface detection" },
  { tool: "iw", package: "iw", purpose: "WiFi scanning" },
  { tool: "rtl_sdr", package: "rtl-sdr", purpose: "RTL-SDR raw capture" },
  { tool: "rtl_power", package: "rtl-sdr", purpose: "SDR frequency sweep scanning" },
  { tool: "rtl_fm", package: "rtl-sdr", purpose: "SDR FM/AM audio demodulation" },
  { tool: "rtl_test", package: "rtl-sdr", purpose: "RTL-SDR device testing" },
  { tool: "sox", package: "sox", purpose: "Audio playback and processing (play command)" },
  { tool: "aplay", package: "alsa-utils", purpose: "ALSA audio playback" },
  { tool: "gpsd", package: "gpsd", purpose: "GPS daemon" },
  { tool: "gpspipe", package: "gpsd-clients", purpose: "GPS data stream" },
  { tool: "nmap", package: "nmap", purpose: "Network scanning" },
  { tool: "airmon-ng", package: "aircrack-ng", purpose: "WiFi monitor mode" },
  { tool: "dump1090", package: "dump1090-mutability", purpose: "ADS-B aircraft tracking" },
];

async function isToolAvailable(tool: string): Promise<boolean> {
  try {
    await execAsync(`which ${tool} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

async function isRunningAsRoot(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("id -u");
    return stdout.trim() === "0";
  } catch {
    return false;
  }
}

async function isAptAvailable(): Promise<boolean> {
  try {
    await execAsync("which apt-get 2>/dev/null");
    return true;
  } catch {
    return false;
  }
}

export async function checkAndInstallDependencies(): Promise<DependencyStatus[]> {
  const isRoot = await isRunningAsRoot();
  const hasApt = await isAptAvailable();
  const results: DependencyStatus[] = [];
  const packagesToInstall: Set<string> = new Set();

  for (const dep of REQUIRED_DEPENDENCIES) {
    const available = await isToolAvailable(dep.tool);
    const status: DependencyStatus = {
      tool: dep.tool,
      available,
      package: dep.package,
      purpose: dep.purpose,
      installed: available,
      installAttempted: false,
      installError: null,
    };

    if (!available) {
      packagesToInstall.add(dep.package);
    }

    results.push(status);
  }

  if (packagesToInstall.size > 0 && isRoot && hasApt) {
    const packageList = Array.from(packagesToInstall);
    console.log(`[dep-check] Missing packages detected. Attempting auto-install: ${packageList.join(", ")}`);

    try {
      await execAsync("apt-get update -qq 2>/dev/null", { timeout: 60000 });
    } catch {
      console.log("[dep-check] apt-get update failed (non-critical, continuing)");
    }

    for (const pkg of packageList) {
      const affectedTools = results.filter(r => r.package === pkg && !r.available);
      try {
        console.log(`[dep-check] Installing ${pkg}...`);
        await execAsync(`apt-get install -y -qq ${pkg} 2>/dev/null`, { timeout: 120000 });

        for (const tool of affectedTools) {
          const nowAvailable = await isToolAvailable(tool.tool);
          tool.installAttempted = true;
          if (nowAvailable) {
            tool.available = true;
            tool.installed = true;
            console.log(`[dep-check]   [OK] ${tool.tool} now available`);
          } else {
            tool.installError = `Package ${pkg} installed but ${tool.tool} not found`;
            console.log(`[dep-check]   [WARN] ${tool.tool} still not found after installing ${pkg}`);
          }
        }
      } catch (err: any) {
        for (const tool of affectedTools) {
          tool.installAttempted = true;
          tool.installError = `Failed to install ${pkg}: ${err.message?.substring(0, 100)}`;
        }
        console.log(`[dep-check]   [FAIL] Could not install ${pkg}: ${err.message?.substring(0, 80)}`);
      }
    }
  } else if (packagesToInstall.size > 0) {
    const missing = results.filter(r => !r.available);
    const uniquePackages = Array.from(new Set(missing.map(m => m.package)));

    if (!isRoot) {
      console.log("[dep-check] Not running as root. Cannot auto-install packages.");
      console.log("[dep-check] Run as root or install manually:");
    } else if (!hasApt) {
      console.log("[dep-check] apt-get not available (non-Debian system).");
      console.log("[dep-check] Install these packages using your system's package manager:");
    }
    console.log(`[dep-check]   sudo apt-get install -y ${uniquePackages.join(" ")}`);
  }

  const available = results.filter(r => r.available);
  const missing = results.filter(r => !r.available);
  console.log(`[dep-check] Summary: ${available.length}/${results.length} tools available`);
  if (missing.length > 0) {
    console.log(`[dep-check] Missing: ${missing.map(m => `${m.tool} (${m.purpose})`).join(", ")}`);
  }

  dependencyResults = results;
  return results;
}

export function getDependencyStatus(): DependencyStatus[] {
  return [...dependencyResults];
}

export function getNodeConfig(): NodeConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}

  const nodeId = `sigint-${os.hostname().toLowerCase().replace(/\s/g, "-")}-${Date.now().toString(36)}`;
  return {
    nodeId,
    nodeName: os.hostname(),
    createdAt: new Date().toISOString(),
    platform: `${os.type()}-${os.arch()}`,
    role: "collector",
    syncEnabled: false,
    syncTargetUrl: "",
    scanIntervalMs: 30000,
    enableBLE: true,
    enableWiFi: true,
    enableSDR: true,
  };
}

async function checkCapabilities(): Promise<void> {
  const [hasBluetooth, hasIwconfig, hasRtlPower, hasRtlFm, hasGpsd, hasSox, hasAplay] = await Promise.all([
    isToolAvailable("hcitool").catch(() => false),
    isToolAvailable("iwconfig").catch(() => false),
    isToolAvailable("rtl_power").catch(() => false),
    isToolAvailable("rtl_fm").catch(() => false),
    isToolAvailable("gpsd").catch(() => false),
    isToolAvailable("sox").catch(() => false),
    isToolAvailable("aplay").catch(() => false),
  ]);

  scannerStatus.bleAvailable = hasBluetooth;
  scannerStatus.wifiAvailable = hasIwconfig;
  scannerStatus.sdrAvailable = hasRtlPower || hasRtlFm;
  scannerStatus.gpsAvailable = hasGpsd;
  scannerStatus.audioAvailable = hasSox || hasAplay;

  if (hasIwconfig) {
    try {
      const { stdout } = await execAsync("iwconfig 2>/dev/null || true");
      scannerStatus.wifiMonitorMode = stdout.includes("Mode:Monitor");
    } catch {
      scannerStatus.wifiMonitorMode = false;
    }
  }
}

const SDR_SCAN_BANDS: Array<{ name: string; startMHz: number; endMHz: number; binHz: number; band: string }> = [
  { name: "FM Broadcast", startMHz: 88, endMHz: 108, binHz: 50000, band: "VHF" },
  { name: "Aviation", startMHz: 118, endMHz: 137, binHz: 25000, band: "VHF" },
  { name: "NOAA Satellites", startMHz: 137, endMHz: 138, binHz: 10000, band: "VHF" },
  { name: "2m Ham", startMHz: 144, endMHz: 148, binHz: 12500, band: "VHF" },
  { name: "Weather Radio", startMHz: 162, endMHz: 163, binHz: 12500, band: "VHF" },
  { name: "ISM 433", startMHz: 432, endMHz: 435, binHz: 25000, band: "UHF" },
  { name: "FRS/GMRS", startMHz: 462, endMHz: 468, binHz: 12500, band: "UHF" },
  { name: "ISM 915", startMHz: 902, endMHz: 928, binHz: 50000, band: "ISM" },
  { name: "ADS-B", startMHz: 1085, endMHz: 1095, binHz: 100000, band: "L-Band" },
];

const KNOWN_FREQUENCIES: Record<string, { label: string; band: string }> = {
  "88-108": { label: "FM Broadcast Radio", band: "VHF" },
  "118-137": { label: "Aviation Voice (AM)", band: "VHF" },
  "137-138": { label: "NOAA Weather Satellites", band: "VHF" },
  "144-148": { label: "Amateur Radio 2m", band: "VHF" },
  "150-174": { label: "VHF Business/Public Safety", band: "VHF" },
  "162.4-162.55": { label: "NOAA Weather Radio", band: "VHF" },
  "225-400": { label: "Military UHF (AM)", band: "UHF" },
  "403-410": { label: "Radiosonde / Weather Balloons", band: "UHF" },
  "420-450": { label: "Amateur Radio 70cm", band: "UHF" },
  "433-434": { label: "ISM Band / LoRa / IoT", band: "UHF" },
  "462-467": { label: "FRS/GMRS Two-Way Radio", band: "UHF" },
  "470-698": { label: "UHF TV Broadcast", band: "UHF" },
  "824-849": { label: "Cellular Uplink (850MHz)", band: "Cellular" },
  "869-894": { label: "Cellular Downlink (850MHz)", band: "Cellular" },
  "902-928": { label: "ISM Band 900MHz / LoRa", band: "ISM" },
  "1030-1090": { label: "ADS-B / Mode S Transponder", band: "L-Band" },
  "1090": { label: "ADS-B (1090 MHz)", band: "L-Band" },
  "1575.42": { label: "GPS L1", band: "L-Band" },
};

function identifyFrequency(frequencyMHz: number): { label: string; band: string } | null {
  for (const [range, info] of Object.entries(KNOWN_FREQUENCIES)) {
    if (range.includes("-")) {
      const [low, high] = range.split("-").map(Number);
      if (frequencyMHz >= low && frequencyMHz <= high) {
        return info;
      }
    } else {
      const freq = parseFloat(range);
      if (Math.abs(frequencyMHz - freq) < 0.5) {
        return info;
      }
    }
  }
  return null;
}

export async function scanSDR(): Promise<ScannedSDRSignal[]> {
  if (!scannerStatus.sdrAvailable) return [];

  const signals: ScannedSDRSignal[] = [];
  const noiseThreshold = -45;

  for (const band of SDR_SCAN_BANDS) {
    try {
      const startHz = Math.floor(band.startMHz * 1e6);
      const endHz = Math.floor(band.endMHz * 1e6);

      const { stdout } = await execAsync(
        `rtl_power -f ${startHz}:${endHz}:${band.binHz} -1 -c 20% 2>/dev/null`,
        { timeout: 30000 }
      );

      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const parts = line.split(",").map(s => s.trim());
        if (parts.length < 7) continue;
        const freqLow = parseFloat(parts[2]);
        const freqStep = parseFloat(parts[4]);

        for (let j = 6; j < parts.length; j++) {
          const power = parseFloat(parts[j]);
          if (!isNaN(power) && power > noiseThreshold) {
            const freq = freqLow + (j - 6) * freqStep;
            const freqMHz = freq / 1e6;
            const id = identifyFrequency(freqMHz);

            signals.push({
              frequency: freq,
              power,
              bandwidth: freqStep,
              label: id?.label || `Unknown ${band.name} Signal`,
              band: id?.band || band.band,
            });
          }
        }
      }
    } catch (err: any) {
      if (!err.message?.includes("No supported devices")) {
        console.error(`[linux-scanner] SDR scan error on ${band.name}: ${err.message?.substring(0, 80)}`);
      }
    }
  }

  scannerStatus.sdrScanning = false;
  return signals;
}

export async function scanBLE(): Promise<ScannedBLEDevice[]> {
  if (!scannerStatus.bleAvailable) return [];

  const devices: ScannedBLEDevice[] = [];

  try {
    const { stdout } = await execAsync("timeout 10 hcitool lescan --duplicates 2>/dev/null || true", {
      timeout: 15000,
    });

    const lines = stdout.split("\n").filter(l => l.trim());
    const seen = new Set<string>();

    for (const line of lines) {
      const match = line.match(/^([0-9A-Fa-f:]{17})\s+(.*)$/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        const mac = match[1].toUpperCase();
        const name = match[2]?.trim() || "Unknown BLE Device";
        if (name === "(unknown)") continue;

        devices.push({
          macAddress: mac,
          name,
          rssi: -70,
          deviceType: "BLE Device",
          manufacturer: getOUIManufacturer(mac),
        });
      }
    }
  } catch {}

  try {
    const { stdout } = await execAsync(
      'timeout 8 bluetoothctl --timeout 8 scan on 2>/dev/null & sleep 6 && bluetoothctl devices 2>/dev/null || true',
      { timeout: 12000 }
    );

    const lines = stdout.split("\n");
    const seen = new Set<string>(devices.map(d => d.macAddress));

    for (const line of lines) {
      const match = line.match(/Device\s+([0-9A-Fa-f:]{17})\s+(.*)$/);
      if (match && !seen.has(match[1].toUpperCase())) {
        const mac = match[1].toUpperCase();
        seen.add(mac);
        devices.push({
          macAddress: mac,
          name: match[2]?.trim() || "Unknown BLE Device",
          rssi: -75,
          deviceType: "BLE Device",
          manufacturer: getOUIManufacturer(mac),
        });
      }
    }

    await execAsync("bluetoothctl scan off 2>/dev/null || true").catch(() => {});
  } catch {}

  return devices;
}

export async function scanWiFi(): Promise<ScannedWiFiDevice[]> {
  if (!scannerStatus.wifiAvailable) return [];

  const devices: ScannedWiFiDevice[] = [];

  try {
    const { stdout } = await execAsync(
      "sudo iw dev $(iw dev | awk '$1==\"Interface\"{print $2}' | head -1) scan 2>/dev/null || iwlist scanning 2>/dev/null || true",
      { timeout: 30000 }
    );

    const cellBlocks = stdout.split(/Cell \d+/);

    for (const block of cellBlocks) {
      const macMatch = block.match(/Address:\s*([0-9A-Fa-f:]{17})/);
      const ssidMatch = block.match(/ESSID:"([^"]*)"/);
      const signalMatch = block.match(/Signal level[=:]?\s*(-?\d+)/);
      const channelMatch = block.match(/Channel:?\s*(\d+)/);
      const encMatch = block.match(/Encryption key:(on|off)/);
      const freqMatch = block.match(/Frequency:?\s*([\d.]+)\s*GHz/);

      if (macMatch) {
        devices.push({
          macAddress: macMatch[1].toUpperCase(),
          ssid: ssidMatch?.[1] || "Hidden Network",
          rssi: signalMatch ? parseInt(signalMatch[1]) : -80,
          channel: channelMatch ? parseInt(channelMatch[1]) : 0,
          encryption: encMatch?.[1] === "on" ? "WPA/WPA2" : "Open",
          frequency: freqMatch ? parseFloat(freqMatch[1]) * 1000 : 2400,
        });
      }
    }
  } catch {}

  return devices;
}

export async function getGPSPosition(): Promise<GPSPosition | null> {
  if (!scannerStatus.gpsAvailable) return null;

  try {
    const { stdout } = await execAsync("gpspipe -w -n 5 2>/dev/null | grep -m1 TPV || true", {
      timeout: 10000,
    });

    if (stdout.includes("TPV")) {
      const data = JSON.parse(stdout.trim());
      if (data.lat && data.lon) {
        const pos: GPSPosition = {
          latitude: data.lat,
          longitude: data.lon,
          altitude: data.alt || null,
          speed: data.speed || null,
          heading: data.track || null,
          accuracy: data.epx ? Math.max(data.epx, data.epy || data.epx) : 10,
          timestamp: Date.now(),
        };
        scannerStatus.gpsPosition = pos;
        return pos;
      }
    }
  } catch {}

  return scannerStatus.gpsPosition;
}

function getOUIManufacturer(mac: string): string {
  const prefix = mac.substring(0, 8).replace(/:/g, "").toUpperCase();

  const ouiLookup: Record<string, string> = {
    "001A7D": "Cyber-Blue", "0050F2": "Microsoft", "000C41": "Cisco-Linksys",
    "0017F2": "Apple", "3C5AB4": "Google", "ACBC32": "Apple",
    "F4F5D8": "Google", "88E9FE": "Apple", "7CD1C3": "Apple",
    "A4C639": "Samsung", "D0817A": "Samsung", "843835": "Samsung",
    "F8042E": "Samsung", "246F28": "Amazon", "B47C9C": "Amazon",
    "FC65DE": "Amazon", "485D36": "Google", "54602A": "Samsung",
    "C0EE40": "Laird Connectivity", "001122": "Cimsys", "D8A98B": "Texas Instruments",
    "B0B448": "Texas Instruments", "98072D": "Texas Instruments",
    "00A0C9": "Intel", "8CEC4B": "Dell", "00059A": "Cisco",
    "000C29": "VMware", "001C42": "Parallels",
    "FC669B": "Meshtastic", "C0EEAA": "Meshtastic",
  };

  for (const [key, value] of Object.entries(ouiLookup)) {
    if (prefix.startsWith(key)) return value;
  }

  return "Unknown";
}

async function runScanCycle(): Promise<void> {
  const config = getNodeConfig();
  const gps = await getGPSPosition();

  if (config.enableBLE && scannerStatus.bleAvailable) {
    scannerStatus.bleScanning = true;
    try {
      const bleDevices = await scanBLE();
      for (const device of bleDevices) {
        scannerStatus.totalDevicesFound++;
        if (onDeviceDiscovered) {
          onDeviceDiscovered(device, "bluetooth", gps);
        }
      }
    } catch {}
    scannerStatus.bleScanning = false;
  }

  if (config.enableWiFi && scannerStatus.wifiAvailable) {
    try {
      const wifiDevices = await scanWiFi();
      for (const device of wifiDevices) {
        scannerStatus.totalDevicesFound++;
        if (onDeviceDiscovered) {
          onDeviceDiscovered(device, "wifi", gps);
        }
      }
    } catch {}
  }

  if (config.enableSDR && scannerStatus.sdrAvailable) {
    scannerStatus.sdrScanning = true;
    try {
      const sdrSignals = await scanSDR();
      for (const signal of sdrSignals) {
        scannerStatus.totalDevicesFound++;
        if (onDeviceDiscovered) {
          onDeviceDiscovered(signal, "sdr", gps);
        }
      }
    } catch (err: any) {
      console.error("[linux-scanner] SDR scan cycle error:", err.message);
    }
    scannerStatus.sdrScanning = false;
  }

  scannerStatus.lastScanTime = Date.now();
  scannerStatus.scanCount++;
}

export function setDeviceCallback(
  cb: (device: ScannedBLEDevice | ScannedWiFiDevice | ScannedSDRSignal, type: "bluetooth" | "wifi" | "sdr", gps: GPSPosition | null) => void
): void {
  onDeviceDiscovered = cb;
}

export async function startLinuxScanner(): Promise<void> {
  console.log("[linux-scanner] Checking software dependencies...");
  await checkAndInstallDependencies();

  await checkCapabilities();
  const config = getNodeConfig();

  console.log(`[linux-scanner] Node ID: ${config.nodeId}`);
  console.log(`[linux-scanner] BLE: ${scannerStatus.bleAvailable ? "available" : "not found"}`);
  console.log(`[linux-scanner] WiFi: ${scannerStatus.wifiAvailable ? "available" : "not found"}`);
  console.log(`[linux-scanner] SDR: ${scannerStatus.sdrAvailable ? "available" : "not found"}`);
  console.log(`[linux-scanner] GPS: ${scannerStatus.gpsAvailable ? "available" : "not found"}`);
  console.log(`[linux-scanner] Audio: ${scannerStatus.audioAvailable ? "available" : "not found"}`);

  if (!scannerStatus.bleAvailable && !scannerStatus.wifiAvailable && !scannerStatus.sdrAvailable) {
    console.log("[linux-scanner] No scanning hardware detected. Scanner is idle. Use Web UI for manual operations.");
    return;
  }

  console.log(`[linux-scanner] Starting scan loop (interval: ${config.scanIntervalMs}ms)`);

  await runScanCycle();

  scanInterval = setInterval(() => {
    runScanCycle().catch(err => {
      console.error("[linux-scanner] Scan cycle error:", err.message);
    });
  }, config.scanIntervalMs);
}

export function stopLinuxScanner(): void {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  stopSDRAudio();
  console.log("[linux-scanner] Scanner stopped");
}

export function getScannerStatus(): ScannerStatus {
  return { ...scannerStatus };
}

export async function runManualScan(): Promise<{
  bleDevices: ScannedBLEDevice[];
  wifiDevices: ScannedWiFiDevice[];
  sdrSignals: ScannedSDRSignal[];
  gps: GPSPosition | null;
}> {
  await checkCapabilities();
  const gps = await getGPSPosition();

  const [bleDevices, wifiDevices, sdrSignals] = await Promise.all([
    scannerStatus.bleAvailable ? scanBLE() : Promise.resolve([]),
    scannerStatus.wifiAvailable ? scanWiFi() : Promise.resolve([]),
    scannerStatus.sdrAvailable ? scanSDR() : Promise.resolve([]),
  ]);

  return { bleDevices, wifiDevices, sdrSignals, gps };
}

export type SDRAudioMode = "fm" | "wfm" | "am" | "usb" | "lsb" | "raw";

export interface SDRAudioStatus {
  active: boolean;
  frequency: number | null;
  mode: SDRAudioMode | null;
  gain: string;
  squelch: number;
  pid: number | null;
  error: string | null;
}

let sdrAudioState: SDRAudioStatus = {
  active: false,
  frequency: null,
  mode: null,
  gain: "auto",
  squelch: 0,
  pid: null,
  error: null,
};

export function getSDRAudioStatus(): SDRAudioStatus {
  return { ...sdrAudioState };
}

export async function startSDRAudio(
  frequencyHz: number,
  mode: SDRAudioMode = "fm",
  gain: string = "auto",
  squelch: number = 0,
  sampleRate: number = 48000
): Promise<SDRAudioStatus> {
  stopSDRAudio();

  const hasRtlFm = await isToolAvailable("rtl_fm");
  const hasSox = await isToolAvailable("sox");
  const hasAplay = await isToolAvailable("aplay");

  if (!hasRtlFm) {
    sdrAudioState = {
      active: false, frequency: frequencyHz, mode, gain, squelch, pid: null,
      error: "rtl_fm not installed. Install with: sudo apt-get install rtl-sdr",
    };
    return sdrAudioState;
  }

  if (!hasSox && !hasAplay) {
    sdrAudioState = {
      active: false, frequency: frequencyHz, mode, gain, squelch, pid: null,
      error: "No audio output available. Install sox or alsa-utils: sudo apt-get install sox alsa-utils",
    };
    return sdrAudioState;
  }

  const rtlFmArgs: string[] = ["-f", frequencyHz.toString()];

  switch (mode) {
    case "wfm":
      rtlFmArgs.push("-M", "wbfm", "-s", "200000", "-r", sampleRate.toString());
      break;
    case "fm":
      rtlFmArgs.push("-M", "fm", "-s", "12500", "-r", sampleRate.toString());
      break;
    case "am":
      rtlFmArgs.push("-M", "am", "-s", "12500", "-r", sampleRate.toString());
      break;
    case "usb":
      rtlFmArgs.push("-M", "usb", "-s", "12500", "-r", sampleRate.toString());
      break;
    case "lsb":
      rtlFmArgs.push("-M", "lsb", "-s", "12500", "-r", sampleRate.toString());
      break;
    case "raw":
      rtlFmArgs.push("-s", sampleRate.toString());
      break;
  }

  if (gain !== "auto") {
    rtlFmArgs.push("-g", gain);
  }

  if (squelch > 0) {
    rtlFmArgs.push("-l", squelch.toString());
  }

  try {
    let audioCmd: string;
    let audioArgs: string[];

    if (hasSox) {
      audioCmd = "play";
      audioArgs = ["-t", "raw", "-r", sampleRate.toString(), "-e", "signed", "-b", "16", "-c", "1", "-"];
    } else {
      audioCmd = "aplay";
      audioArgs = ["-t", "raw", "-r", sampleRate.toString(), "-f", "S16_LE", "-c", "1", "-"];
    }

    const fullCommand = `rtl_fm ${rtlFmArgs.join(" ")} 2>/dev/null | ${audioCmd} ${audioArgs.join(" ")} 2>/dev/null`;
    console.log(`[sdr-audio] Starting: ${fullCommand}`);

    sdrAudioProcess = exec(fullCommand);
    const pid = sdrAudioProcess.pid || null;

    sdrAudioProcess.on("error", (err) => {
      console.error("[sdr-audio] Process error:", err.message);
      sdrAudioState.active = false;
      sdrAudioState.error = err.message;
      scannerStatus.sdrAudioActive = false;
    });

    sdrAudioProcess.on("exit", (code) => {
      console.log(`[sdr-audio] Process exited with code ${code}`);
      sdrAudioState.active = false;
      sdrAudioState.pid = null;
      scannerStatus.sdrAudioActive = false;
      scannerStatus.sdrAudioFrequency = null;
      scannerStatus.sdrAudioMode = null;
    });

    sdrAudioState = {
      active: true,
      frequency: frequencyHz,
      mode,
      gain,
      squelch,
      pid,
      error: null,
    };

    scannerStatus.sdrAudioActive = true;
    scannerStatus.sdrAudioFrequency = frequencyHz;
    scannerStatus.sdrAudioMode = mode;

    console.log(`[sdr-audio] Tuned to ${(frequencyHz / 1e6).toFixed(4)} MHz (${mode.toUpperCase()}) PID: ${pid}`);
    return sdrAudioState;

  } catch (err: any) {
    sdrAudioState = {
      active: false, frequency: frequencyHz, mode, gain, squelch, pid: null,
      error: `Failed to start SDR audio: ${err.message}`,
    };
    return sdrAudioState;
  }
}

export function stopSDRAudio(): SDRAudioStatus {
  if (sdrAudioProcess) {
    try {
      sdrAudioProcess.kill("SIGTERM");
      exec("pkill -f 'rtl_fm' 2>/dev/null || true");
    } catch {}
    sdrAudioProcess = null;
  }

  sdrAudioState = {
    active: false,
    frequency: null,
    mode: null,
    gain: "auto",
    squelch: 0,
    pid: null,
    error: null,
  };

  scannerStatus.sdrAudioActive = false;
  scannerStatus.sdrAudioFrequency = null;
  scannerStatus.sdrAudioMode = null;

  console.log("[sdr-audio] Audio stopped");
  return sdrAudioState;
}

export async function tuneSDRAudio(
  frequencyHz: number,
  mode?: SDRAudioMode,
  gain?: string,
  squelch?: number
): Promise<SDRAudioStatus> {
  const currentMode = mode || sdrAudioState.mode || "fm";
  const currentGain = gain || sdrAudioState.gain || "auto";
  const currentSquelch = squelch ?? sdrAudioState.squelch ?? 0;
  return startSDRAudio(frequencyHz, currentMode, currentGain, currentSquelch);
}
