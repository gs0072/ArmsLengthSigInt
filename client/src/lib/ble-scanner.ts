export interface DiscoveredNode {
  name: string;
  id: string;
  rssi: number;
  signalType: string;
  deviceType: string;
  manufacturer: string;
  protocol: string;
  frequency: number | null;
  channel: number | null;
  encryption: string;
}

export interface ScanSession {
  isActive: boolean;
  discoveredNodes: DiscoveredNode[];
  startTime: number;
  intervalId: ReturnType<typeof setInterval> | null;
}

const BLE_DEVICE_POOL: Array<Omit<DiscoveredNode, "rssi">> = [
  { name: "iPhone 14", id: "A4:83:E7:2F:91:B3", signalType: "bluetooth", deviceType: "Mobile Phone", manufacturer: "Apple", protocol: "BLE 5.3", frequency: 2402000000, channel: null, encryption: "AES-CCM" },
  { name: "Galaxy S24", id: "DC:2B:61:A5:4E:F8", signalType: "bluetooth", deviceType: "Mobile Phone", manufacturer: "Samsung", protocol: "BLE 5.3", frequency: 2426000000, channel: null, encryption: "AES-CCM" },
  { name: "AirPods Max", id: "F0:D4:E2:8A:33:7C", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Apple", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "None" },
  { name: "Fitbit Sense 2", id: "7C:D1:C3:52:8B:A4", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Fitbit", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "None" },
  { name: "Tile Mate", id: "E8:6F:38:D4:72:1A", signalType: "bluetooth", deviceType: "Tracker", manufacturer: "Tile", protocol: "BLE 4.2", frequency: 2402000000, channel: null, encryption: "None" },
  { name: "Tesla Key Fob", id: "30:AE:A4:CC:58:91", signalType: "bluetooth", deviceType: "Vehicle", manufacturer: "Tesla", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM" },
  { name: "Nest Thermostat", id: "24:6F:28:9E:A1:55", signalType: "bluetooth", deviceType: "IoT Device", manufacturer: "Google", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "None" },
  { name: "Ring Doorbell", id: "B0:7F:B9:42:CC:D1", signalType: "wifi", deviceType: "IoT Device", manufacturer: "Ring", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2" },
  { name: "Garmin Forerunner", id: "60:60:1F:E3:B7:29", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Garmin", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None" },
  { name: "Unknown BLE Beacon", id: "9A:12:3C:FE:45:D2", signalType: "bluetooth", deviceType: "BLE Beacon", manufacturer: "Unknown", protocol: "BLE 4.0", frequency: 2426000000, channel: null, encryption: "None" },
  { name: "Bose QC Ultra", id: "1E:8C:A7:B5:63:9F", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Bose", protocol: "BLE 5.2", frequency: 2440000000, channel: null, encryption: "None" },
  { name: "Pixel Watch 2", id: "C3:55:D8:1A:F4:82", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Google", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "AES-CCM" },
  { name: "AirTag", id: "AB:CD:EF:12:34:56", signalType: "bluetooth", deviceType: "Tracker", manufacturer: "Apple", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None" },
  { name: "DJI RC Controller", id: "D4:91:7E:3C:A8:B0", signalType: "wifi", deviceType: "Drone Controller", manufacturer: "DJI", protocol: "802.11ac", frequency: 5180000000, channel: 36, encryption: "WPA2" },
  { name: "Ubiquiti AP", id: "78:8A:20:C1:E6:47", signalType: "wifi", deviceType: "Access Point", manufacturer: "Ubiquiti", protocol: "802.11ax", frequency: 2412000000, channel: 1, encryption: "WPA3" },
];

const WIFI_DEVICE_POOL: Array<Omit<DiscoveredNode, "rssi">> = [
  { name: "NETGEAR-5G-EXT", id: "B0:7F:B9:99:AA:11", signalType: "wifi", deviceType: "Wi-Fi Router", manufacturer: "Netgear", protocol: "802.11ac", frequency: 5745000000, channel: 149, encryption: "WPA3" },
  { name: "TP-LINK_2.4G", id: "C4:E9:84:33:22:BB", signalType: "wifi", deviceType: "Wi-Fi Router", manufacturer: "TP-Link", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2" },
  { name: "xfinitywifi", id: "A6:B1:C2:D3:E4:F5", signalType: "wifi", deviceType: "Access Point", manufacturer: "Comcast", protocol: "802.11ac", frequency: 5180000000, channel: 36, encryption: "Open" },
  { name: "Ring Doorbell Pro", id: "FC:E8:DA:12:AB:CE", signalType: "wifi", deviceType: "IoT Device", manufacturer: "Ring", protocol: "802.11n", frequency: 2462000000, channel: 11, encryption: "WPA2" },
  { name: "Wyze Cam v3", id: "2C:AA:8E:51:C7:DD", signalType: "wifi", deviceType: "IoT Camera", manufacturer: "Wyze", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2" },
  { name: "Sonos One", id: "48:A6:B8:C4:D2:EE", signalType: "wifi", deviceType: "Audio Device", manufacturer: "Sonos", protocol: "802.11ac", frequency: 5200000000, channel: 40, encryption: "WPA2" },
  { name: "HP-Print-5C-LaserJet", id: "9C:B6:D0:FF:5C:11", signalType: "wifi", deviceType: "Printer", manufacturer: "HP", protocol: "802.11n", frequency: 2412000000, channel: 1, encryption: "WPA2" },
  { name: "Hidden Network", id: "00:1A:2B:3C:4D:5E", signalType: "wifi", deviceType: "Unknown", manufacturer: "Unknown", protocol: "802.11ac", frequency: 5240000000, channel: 48, encryption: "WPA2" },
];

function randomRSSI(min: number = -95, max: number = -25): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getPoolForSensorType(sensorType: string): Array<Omit<DiscoveredNode, "rssi">> {
  switch (sensorType) {
    case "bluetooth": return BLE_DEVICE_POOL;
    case "wifi": return WIFI_DEVICE_POOL;
    default: return [...BLE_DEVICE_POOL, ...WIFI_DEVICE_POOL];
  }
}

export function startPassiveScan(
  sensorType: string,
  onNodeDiscovered: (node: DiscoveredNode) => void,
  intervalMs: number = 2500
): ScanSession {
  const pool = getPoolForSensorType(sensorType);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  let index = 0;
  const discovered: DiscoveredNode[] = [];

  const session: ScanSession = {
    isActive: true,
    discoveredNodes: discovered,
    startTime: Date.now(),
    intervalId: null,
  };

  const emit = () => {
    if (!session.isActive || index >= shuffled.length) {
      if (index >= shuffled.length) {
        index = 0;
      }
    }

    const template = shuffled[index % shuffled.length];
    const node: DiscoveredNode = {
      ...template,
      rssi: randomRSSI(),
    };

    const existingIdx = discovered.findIndex(d => d.id === node.id);
    if (existingIdx >= 0) {
      discovered[existingIdx] = node;
    } else {
      discovered.push(node);
    }
    index++;
    onNodeDiscovered(node);
  };

  const jitter = () => intervalMs + Math.floor(Math.random() * 1500) - 500;

  const scheduleNext = () => {
    if (!session.isActive) return;
    session.intervalId = setTimeout(() => {
      emit();
      scheduleNext();
    }, jitter());
  };

  setTimeout(() => {
    emit();
    scheduleNext();
  }, 500);

  return session;
}

export function stopPassiveScan(session: ScanSession): void {
  session.isActive = false;
  if (session.intervalId) {
    clearTimeout(session.intervalId);
    session.intervalId = null;
  }
}

export async function getCurrentPosition(): Promise<{ lat: number; lng: number; alt: number | null } | null> {
  if (!("geolocation" in navigator)) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
