import { exec } from "child_process";
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
  gpsAvailable: boolean;
  gpsPosition: GPSPosition | null;
  lastScanTime: number | null;
  totalDevicesFound: number;
  scanCount: number;
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
  gpsAvailable: false,
  gpsPosition: null,
  lastScanTime: null,
  totalDevicesFound: 0,
  scanCount: 0,
};

let scanInterval: ReturnType<typeof setInterval> | null = null;
let onDeviceDiscovered: ((device: ScannedBLEDevice | ScannedWiFiDevice, type: "bluetooth" | "wifi", gps: GPSPosition | null) => void) | null = null;

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

async function isToolAvailable(tool: string): Promise<boolean> {
  try {
    await execAsync(`which ${tool} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

async function checkCapabilities(): Promise<void> {
  const [hasBluetooth, hasIwconfig, hasRtlSdr, hasGpsd] = await Promise.all([
    isToolAvailable("hcitool").catch(() => false),
    isToolAvailable("iwconfig").catch(() => false),
    isToolAvailable("rtl_sdr").catch(() => false),
    isToolAvailable("gpsd").catch(() => false),
  ]);

  scannerStatus.bleAvailable = hasBluetooth;
  scannerStatus.wifiAvailable = hasIwconfig;
  scannerStatus.sdrAvailable = hasRtlSdr;
  scannerStatus.gpsAvailable = hasGpsd;

  if (hasIwconfig) {
    try {
      const { stdout } = await execAsync("iwconfig 2>/dev/null || true");
      scannerStatus.wifiMonitorMode = stdout.includes("Mode:Monitor");
    } catch {
      scannerStatus.wifiMonitorMode = false;
    }
  }
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

  scannerStatus.lastScanTime = Date.now();
  scannerStatus.scanCount++;
}

export function setDeviceCallback(
  cb: (device: ScannedBLEDevice | ScannedWiFiDevice, type: "bluetooth" | "wifi", gps: GPSPosition | null) => void
): void {
  onDeviceDiscovered = cb;
}

export async function startLinuxScanner(): Promise<void> {
  await checkCapabilities();
  const config = getNodeConfig();

  console.log(`[linux-scanner] Node ID: ${config.nodeId}`);
  console.log(`[linux-scanner] BLE: ${scannerStatus.bleAvailable ? "available" : "not found"}`);
  console.log(`[linux-scanner] WiFi: ${scannerStatus.wifiAvailable ? "available" : "not found"}`);
  console.log(`[linux-scanner] SDR: ${scannerStatus.sdrAvailable ? "available" : "not found"}`);
  console.log(`[linux-scanner] GPS: ${scannerStatus.gpsAvailable ? "available" : "not found"}`);

  if (!scannerStatus.bleAvailable && !scannerStatus.wifiAvailable) {
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
  console.log("[linux-scanner] Scanner stopped");
}

export function getScannerStatus(): ScannerStatus {
  return { ...scannerStatus };
}

export async function runManualScan(): Promise<{
  bleDevices: ScannedBLEDevice[];
  wifiDevices: ScannedWiFiDevice[];
  gps: GPSPosition | null;
}> {
  await checkCapabilities();
  const gps = await getGPSPosition();

  const [bleDevices, wifiDevices] = await Promise.all([
    scannerStatus.bleAvailable ? scanBLE() : Promise.resolve([]),
    scannerStatus.wifiAvailable ? scanWiFi() : Promise.resolve([]),
  ]);

  return { bleDevices, wifiDevices, gps };
}
