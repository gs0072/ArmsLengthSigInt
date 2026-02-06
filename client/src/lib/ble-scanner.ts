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
  resolved: boolean;
  shortName?: string | null;
  longName?: string | null;
  broadcastLat?: number | null;
  broadcastLng?: number | null;
  broadcastAlt?: number | null;
  hasTelemetry?: boolean;
}

export interface ScanSession {
  isActive: boolean;
  discoveredNodes: DiscoveredNode[];
  startTime: number;
  intervalId: ReturnType<typeof setInterval> | null;
}

interface DeviceTemplate {
  name: string;
  id: string;
  signalType: string;
  deviceType: string;
  manufacturer: string;
  protocol: string;
  frequency: number | null;
  channel: number | null;
  encryption: string;
  resolveDelay: number;
  shortName?: string;
  longName?: string;
  broadcastsTelemetry?: boolean;
  telemetryBaseLat?: number;
  telemetryBaseLng?: number;
  telemetryBaseAlt?: number | null;
  telemetryDriftRadius?: number;
}

function genMac(): string {
  const h = () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase();
  return `${h()}:${h()}:${h()}:${h()}:${h()}:${h()}`;
}

function bleFreq(): number {
  const channels = [2402, 2404, 2406, 2408, 2410, 2412, 2414, 2416, 2418, 2420, 2422, 2424, 2426, 2428, 2430, 2432, 2434, 2436, 2438, 2440, 2442, 2444, 2446, 2448, 2450, 2452, 2454, 2456, 2458, 2460, 2462, 2464, 2466, 2468, 2470, 2472, 2474, 2476, 2478, 2480];
  return channels[Math.floor(Math.random() * channels.length)] * 1000000;
}

function wifiFreq2g(): [number, number] {
  const ch = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const c = ch[Math.floor(Math.random() * ch.length)];
  return [2407000000 + c * 5000000, c];
}

function wifiFreq5g(): [number, number] {
  const chs: [number, number][] = [[5180, 36], [5200, 40], [5220, 44], [5240, 48], [5260, 52], [5280, 56], [5300, 60], [5320, 64], [5500, 100], [5520, 104], [5540, 108], [5560, 112], [5580, 116], [5660, 132], [5680, 136], [5700, 140], [5745, 149], [5765, 153], [5785, 157], [5805, 161], [5825, 165]];
  const [f, c] = chs[Math.floor(Math.random() * chs.length)];
  return [f * 1000000, c];
}

const OUI_DATABASE: Record<string, string> = {
  "A4:83:E7": "Apple",
  "F0:D4:E2": "Apple",
  "AB:CD:EF": "Apple",
  "A8:51:AB": "Apple",
  "3C:22:FB": "Apple",
  "F4:5C:89": "Apple",
  "BC:EC:5D": "Apple",
  "DC:2B:61": "Samsung",
  "50:DC:E7": "Samsung",
  "EC:1F:72": "Samsung",
  "92:18:7C": "Samsung",
  "84:25:DB": "Samsung",
  "24:6F:28": "Google",
  "C3:55:D8": "Google",
  "94:B8:6D": "Google",
  "30:FD:38": "Google",
  "18:B4:30": "Google",
  "3C:5A:B4": "Google",
  "8C:85:90": "Intel",
  "A4:34:D9": "Intel",
  "00:1E:67": "Intel",
  "B4:69:21": "Intel",
  "9C:B7:0D": "Qualcomm",
  "00:03:7F": "Qualcomm",
  "20:02:AF": "Broadcom",
  "00:10:18": "Broadcom",
  "D4:F5:13": "Texas Instruments",
  "98:07:2D": "Texas Instruments",
  "CC:78:AB": "Nordic Semiconductor",
  "F8:3C:A1": "Nordic Semiconductor",
  "30:AE:A4": "Tesla/Espressif",
  "24:0A:C4": "Espressif",
  "A4:CF:12": "Espressif",
  "B8:27:EB": "Raspberry Pi",
  "DC:A6:32": "Raspberry Pi",
  "E4:5F:01": "Raspberry Pi",
  "00:E0:4C": "Realtek",
  "48:5B:39": "Realtek",
  "00:0C:E7": "MediaTek",
  "00:0C:43": "MediaTek",
  "00:1A:2B": "Cisco",
  "F0:9F:C2": "Cisco",
  "00:18:74": "Cisco",
  "B0:7F:B9": "Netgear",
  "A4:2B:8C": "Netgear",
  "C4:E9:84": "TP-Link",
  "50:C7:BF": "TP-Link",
  "14:EB:B6": "TP-Link",
  "04:D9:F5": "ASUS",
  "1C:87:2C": "ASUS",
  "2C:FD:A1": "ASUS",
  "78:8A:20": "Ubiquiti",
  "24:5A:4C": "Ubiquiti",
  "20:4C:03": "Aruba",
  "94:B4:0F": "Aruba",
  "D8:C7:C8": "Aruba",
  "A0:C5:89": "Motorola",
  "00:1A:DE": "Motorola",
  "CC:2D:E0": "LG",
  "A8:23:FE": "LG",
  "10:68:3F": "LG",
  "04:5D:4B": "Sony",
  "A0:AB:1B": "Sony",
  "FC:F1:52": "Sony",
  "28:18:78": "Microsoft",
  "7C:ED:8D": "Microsoft",
  "DC:53:60": "Microsoft",
  "F0:F0:A4": "Amazon",
  "F8:1E:DF": "Amazon",
  "A0:02:DC": "Amazon",
  "44:07:0B": "Ring",
  "FC:E8:DA": "Ring",
  "D4:91:7E": "DJI",
  "60:60:1F": "Garmin",
  "C6:AA:11": "Garmin",
  "7C:D1:C3": "Fitbit",
  "C4:0B:CB": "Fitbit",
  "1E:8C:A7": "Bose",
  "04:52:C7": "Bose",
  "20:74:CF": "JBL",
  "B8:D5:0B": "JBL",
  "F4:4E:FD": "Logitech",
  "00:1F:20": "Logitech",
  "9C:B6:D0": "HP",
  "3C:D9:2B": "HP",
  "3C:2E:FF": "Canon",
  "00:1E:8F": "Canon",
  "64:EB:8C": "Epson",
  "00:26:AB": "Epson",
  "30:05:5C": "Brother",
  "00:1B:A9": "Brother",
  "84:24:8D": "Zebra Technologies",
  "00:A0:F8": "Zebra Technologies",
  "00:06:8E": "HID Global",
  "04:A3:E2": "NXP",
  "E2:80:11": "Impinj",
  "00:40:9D": "Honeywell",
  "4C:E1:73": "Honeywell",
  "00:1C:C4": "Bosch",
  "00:07:28": "Bosch",
  "00:0B:3B": "Siemens",
  "00:1B:1B": "Siemens",
  "00:80:25": "ABB",
  "00:80:F4": "Schneider Electric",
  "4C:FC:AA": "Tesla",
  "00:1A:37": "BMW",
  "9C:DF:03": "BMW",
  "00:09:93": "Mercedes-Benz",
  "00:0D:F0": "Mercedes-Benz",
  "C8:47:8C": "Xiaomi",
  "64:CE:D1": "Xiaomi",
  "9C:A5:25": "Xiaomi",
  "88:B4:A6": "Huawei",
  "CC:A2:23": "Huawei",
  "94:77:2B": "Huawei",
  "C0:EE:FB": "OnePlus",
  "2C:4D:54": "OPPO",
  "A4:77:33": "OPPO",
  "A0:3D:6F": "Vivo",
  "98:6D:35": "Nothing",
  "F4:B5:20": "Framework",
  "28:76:CD": "Valve",
  "98:B6:E9": "Nintendo",
  "E8:4E:CE": "Nintendo",
  "2C:AA:8E": "Wyze",
  "D8:1D:72": "Eufy",
  "A4:C1:38": "Anker",
  "00:0E:DD": "Shure",
  "00:1B:66": "Sennheiser",
  "EC:B5:FA": "Philips",
  "48:A6:B8": "Sonos",
  "D0:D0:03": "Wahoo",
  "74:F6:1C": "Ember",
  "38:1F:8D": "Whoop",
  "50:32:37": "Jabra",
  "E0:E5:CF": "Oura",
  "D8:96:E0": "Dexcom",
  "00:25:DF": "Medtronic",
  "00:1D:98": "ReSound",
  "00:17:E9": "Phonak",
  "00:09:DD": "Oticon",
  "BC:6A:29": "Schlage",
  "34:E1:D1": "Yale",
  "D0:52:A8": "SmartThings",
  "00:17:88": "Lutron",
  "78:A5:04": "GoPro",
  "88:45:DD": "Insta360",
  "F0:27:2D": "Amazon Kindle",
  "AC:37:43": "HTC",
  "B0:B2:1C": "Therabody",
  "84:EA:ED": "Roku",
  "50:14:79": "iRobot",
  "74:24:6C": "SpaceX",
  "E8:ED:F3": "ARRIS",
  "B4:A5:EF": "AT&T",
  "64:B7:08": "Skullcandy",
  "DC:54:75": "Peloton",
  "E8:6F:38": "Tile",
  "1C:BA:8C": "August",
};

const NON_MAC_PREFIXES = ["RFID:", "MESH:", "LORA:", "ADSB:", "SDR:", "SENS:"];

function lookupOui(id: string): string | null {
  for (const prefix of NON_MAC_PREFIXES) {
    if (id.startsWith(prefix)) return null;
  }
  const parts = id.split(":");
  if (parts.length >= 3) {
    const oui = parts.slice(0, 3).join(":");
    return OUI_DATABASE[oui] || null;
  }
  return null;
}

const BLE_DEVICE_POOL: DeviceTemplate[] = [
  { name: "iPhone 15 Pro", id: "A4:83:E7:2F:91:B3", signalType: "bluetooth", deviceType: "Mobile Phone", manufacturer: "Apple", protocol: "BLE 5.3", frequency: 2402000000, channel: null, encryption: "AES-CCM", resolveDelay: 1 },
  { name: "Galaxy S24 Ultra", id: "DC:2B:61:A5:4E:F8", signalType: "bluetooth", deviceType: "Mobile Phone", manufacturer: "Samsung", protocol: "BLE 5.3", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 1 },
  { name: "AirPods Pro 2", id: "F0:D4:E2:8A:33:7C", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Apple", protocol: "BLE 5.3", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Fitbit Sense 2", id: "7C:D1:C3:52:8B:A4", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Fitbit", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Tile Mate", id: "E8:6F:38:D4:72:1A", signalType: "bluetooth", deviceType: "Tracker", manufacturer: "Tile", protocol: "BLE 4.2", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Tesla Model Y Key", id: "30:AE:A4:CC:58:91", signalType: "bluetooth", deviceType: "Vehicle Key", manufacturer: "Tesla", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Nest Thermostat", id: "24:6F:28:9E:A1:55", signalType: "bluetooth", deviceType: "IoT Device", manufacturer: "Google", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Garmin Forerunner 965", id: "60:60:1F:E3:B7:29", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Garmin", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Bose QC Ultra", id: "1E:8C:A7:B5:63:9F", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Bose", protocol: "BLE 5.2", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "Pixel Watch 2", id: "C3:55:D8:1A:F4:82", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Google", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "AirTag", id: "AB:CD:EF:12:34:56", signalType: "bluetooth", deviceType: "Tracker", manufacturer: "Apple", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "DJI RC-N2", id: "D4:91:7E:3C:A8:B0", signalType: "bluetooth", deviceType: "Drone Controller", manufacturer: "DJI", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Ubiquiti UniFi AP", id: "78:8A:20:C1:E6:47", signalType: "bluetooth", deviceType: "Access Point", manufacturer: "Ubiquiti", protocol: "BLE 5.0", frequency: 2412000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "OnePlus Buds Pro 2", id: "B8:27:EB:4A:C1:D9", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "OnePlus", protocol: "BLE 5.3", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Apple Watch Ultra 2", id: "A8:51:AB:72:E3:F4", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Apple", protocol: "BLE 5.3", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 1 },
  { name: "Sony WH-1000XM5", id: "04:5D:4B:88:19:AC", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Sony", protocol: "BLE 5.2", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "Xiaomi Smart Band 8", id: "C8:47:8C:F1:23:DA", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Xiaomi", protocol: "BLE 5.1", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "JBL Flip 6", id: "20:74:CF:55:B2:8E", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "JBL", protocol: "BLE 5.1", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Logitech MX Keys", id: "F4:4E:FD:99:C0:77", signalType: "bluetooth", deviceType: "Keyboard", manufacturer: "Logitech", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Logitech MX Master 3S", id: "F4:4E:FD:88:A1:22", signalType: "bluetooth", deviceType: "Mouse", manufacturer: "Logitech", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "iPad Pro M4", id: "3C:22:FB:D1:A5:90", signalType: "bluetooth", deviceType: "Tablet", manufacturer: "Apple", protocol: "BLE 5.3", frequency: 2480000000, channel: null, encryption: "AES-CCM", resolveDelay: 1 },
  { name: "Galaxy Buds3 Pro", id: "50:DC:E7:3A:F8:B1", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Samsung", protocol: "BLE 5.3", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Oura Ring Gen 3", id: "E0:E5:CF:44:82:3D", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Oura", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "None", resolveDelay: 4 },
  { name: "Motorola Edge 50", id: "A0:C5:89:6E:D4:17", signalType: "bluetooth", deviceType: "Mobile Phone", manufacturer: "Motorola", protocol: "BLE 5.2", frequency: 2402000000, channel: null, encryption: "AES-CCM", resolveDelay: 1 },
  { name: "Pixel 9 Pro", id: "94:B8:6D:1C:E7:53", signalType: "bluetooth", deviceType: "Mobile Phone", manufacturer: "Google", protocol: "BLE 5.3", frequency: 2480000000, channel: null, encryption: "AES-CCM", resolveDelay: 1 },
  { name: "Surface Pen", id: "28:18:78:CC:A4:6B", signalType: "bluetooth", deviceType: "Stylus", manufacturer: "Microsoft", protocol: "BLE 4.2", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Wahoo KICKR", id: "D0:D0:03:8B:E2:F9", signalType: "bluetooth", deviceType: "Fitness Device", manufacturer: "Wahoo", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Skullcandy Crusher", id: "64:B7:08:A2:C1:5E", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Skullcandy", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Samsung Galaxy Tab S9", id: "EC:1F:72:D5:38:A4", signalType: "bluetooth", deviceType: "Tablet", manufacturer: "Samsung", protocol: "BLE 5.3", frequency: 2480000000, channel: null, encryption: "AES-CCM", resolveDelay: 1 },
  { name: "August Smart Lock", id: "1C:BA:8C:7E:F3:26", signalType: "bluetooth", deviceType: "Smart Lock", manufacturer: "August", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Ember Mug 2", id: "74:F6:1C:B9:D8:42", signalType: "bluetooth", deviceType: "IoT Device", manufacturer: "Ember", protocol: "BLE 4.2", frequency: 2426000000, channel: null, encryption: "None", resolveDelay: 4 },
  { name: "Theragun Prime", id: "B0:B2:1C:55:E7:A3", signalType: "bluetooth", deviceType: "Health Device", manufacturer: "Therabody", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Nintendo Switch Pro", id: "98:B6:E9:4C:11:FD", signalType: "bluetooth", deviceType: "Game Controller", manufacturer: "Nintendo", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "PS5 DualSense Edge", id: "A0:AB:1B:7D:29:E6", signalType: "bluetooth", deviceType: "Game Controller", manufacturer: "Sony", protocol: "BLE 5.1", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Xbox Elite Series 2", id: "7C:ED:8D:68:B3:1A", signalType: "bluetooth", deviceType: "Game Controller", manufacturer: "Microsoft", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Whoop 4.0", id: "38:1F:8D:C2:A7:94", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Whoop", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Jabra Elite 85t", id: "50:32:37:D8:E4:BC", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Jabra", protocol: "BLE 5.1", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Ring Alarm Keypad", id: "44:07:0B:F3:21:CA", signalType: "bluetooth", deviceType: "Security Device", manufacturer: "Ring", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Govee LED Strip", id: "A4:C1:38:7E:D9:55", signalType: "bluetooth", deviceType: "IoT Device", manufacturer: "Govee", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "None", resolveDelay: 4 },
  { name: "Peloton Heart Monitor", id: "DC:54:75:B1:C8:3F", signalType: "bluetooth", deviceType: "Health Device", manufacturer: "Peloton", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Phonak Audeo P90", id: "00:17:E9:A2:B4:C6", signalType: "bluetooth", deviceType: "Hearing Aid", manufacturer: "Phonak", protocol: "BLE 5.2", frequency: 2440000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Oticon More 1", id: "00:09:DD:3B:C7:E1", signalType: "bluetooth", deviceType: "Hearing Aid", manufacturer: "Oticon", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "ReSound Nexia", id: "00:1D:98:5C:D8:F2", signalType: "bluetooth", deviceType: "Hearing Aid", manufacturer: "ReSound", protocol: "BLE 5.2", frequency: 2402000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Medtronic 780G Pump", id: "00:25:DF:A4:19:B3", signalType: "bluetooth", deviceType: "Insulin Pump", manufacturer: "Medtronic", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "AES-CCM", resolveDelay: 4 },
  { name: "Omnipod 5", id: "00:25:DF:C1:E5:87", signalType: "bluetooth", deviceType: "Insulin Pump", manufacturer: "Insulet", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "AES-CCM", resolveDelay: 4 },
  { name: "Dexcom G7 CGM", id: "D8:96:E0:7A:B2:43", signalType: "bluetooth", deviceType: "CGM Sensor", manufacturer: "Dexcom", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Freestyle Libre 3", id: "D8:96:E0:1D:F4:98", signalType: "bluetooth", deviceType: "CGM Sensor", manufacturer: "Abbott", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Masimo MightySat Rx", id: "00:40:9D:2E:C8:A1", signalType: "bluetooth", deviceType: "Pulse Oximeter", manufacturer: "Masimo", protocol: "BLE 4.2", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "BMW Digital Key", id: "00:1A:37:D5:92:F0", signalType: "bluetooth", deviceType: "Vehicle Key", manufacturer: "BMW", protocol: "BLE 5.2", frequency: 2440000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Mercedes EQ Key", id: "00:09:93:A8:B1:C4", signalType: "bluetooth", deviceType: "Vehicle Key", manufacturer: "Mercedes-Benz", protocol: "BLE 5.2", frequency: 2402000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Ford SYNC BLE", id: "9C:DF:03:E2:71:A5", signalType: "bluetooth", deviceType: "Vehicle System", manufacturer: "Ford", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Audi connect Key", id: "9C:DF:03:44:B8:D3", signalType: "bluetooth", deviceType: "Vehicle Key", manufacturer: "Audi", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Schlage Encode Plus", id: "BC:6A:29:F5:D1:82", signalType: "bluetooth", deviceType: "Smart Lock", manufacturer: "Schlage", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Yale Assure Lock 2", id: "34:E1:D1:A3:C9:76", signalType: "bluetooth", deviceType: "Smart Lock", manufacturer: "Yale", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Ring Alarm Contact", id: "44:07:0B:82:E6:D9", signalType: "bluetooth", deviceType: "Security Sensor", manufacturer: "Ring", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "SmartThings Hub v3", id: "D0:52:A8:B7:14:E3", signalType: "bluetooth", deviceType: "IoT Hub", manufacturer: "Samsung", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Lutron Caseta Bridge", id: "00:17:88:C2:A4:F1", signalType: "bluetooth", deviceType: "IoT Hub", manufacturer: "Lutron", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Zebra TC52x Scanner", id: "84:24:8D:E1:57:B9", signalType: "bluetooth", deviceType: "Barcode Scanner", manufacturer: "Zebra Technologies", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Honeywell CT60 Scanner", id: "4C:E1:73:F8:23:D6", signalType: "bluetooth", deviceType: "Barcode Scanner", manufacturer: "Honeywell", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "Motorola APX Radio", id: "00:1A:DE:4C:A9:B7", signalType: "bluetooth", deviceType: "Two-Way Radio", manufacturer: "Motorola", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "AES-CCM", resolveDelay: 2 },
  { name: "GoPro Hero 12", id: "78:A5:04:D3:62:E8", signalType: "bluetooth", deviceType: "Action Camera", manufacturer: "GoPro", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Insta360 X4", id: "88:45:DD:A1:B9:C3", signalType: "bluetooth", deviceType: "Action Camera", manufacturer: "Insta360", protocol: "BLE 5.0", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Kindle Paperwhite", id: "F0:27:2D:C8:41:B5", signalType: "bluetooth", deviceType: "E-Reader", manufacturer: "Amazon", protocol: "BLE 5.0", frequency: 2426000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Kobo Libra Colour", id: "A0:02:DC:E4:73:F9", signalType: "bluetooth", deviceType: "E-Reader", manufacturer: "Kobo", protocol: "BLE 5.0", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "COROS PACE 3", id: "C6:AA:11:D2:85:F7", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "COROS", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Polar Vantage V3", id: "CC:78:AB:93:E1:D4", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Polar", protocol: "BLE 5.1", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Samsung Galaxy Ring", id: "84:25:DB:A7:F3:1E", signalType: "bluetooth", deviceType: "Wearable", manufacturer: "Samsung", protocol: "BLE 5.3", frequency: 2426000000, channel: null, encryption: "AES-CCM", resolveDelay: 3 },
  { name: "Sennheiser Momentum 4", id: "00:1B:66:C5:D4:A2", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Sennheiser", protocol: "BLE 5.2", frequency: 2480000000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "Shure AONIC 50", id: "00:0E:DD:B8:71:E3", signalType: "bluetooth", deviceType: "Audio Device", manufacturer: "Shure", protocol: "BLE 5.0", frequency: 2440000000, channel: null, encryption: "None", resolveDelay: 2 },
];

const WIFI_DEVICE_POOL: DeviceTemplate[] = [
  { name: "NETGEAR-5G-EXT", id: "B0:7F:B9:99:AA:11", signalType: "wifi", deviceType: "Wi-Fi Router", manufacturer: "Netgear", protocol: "802.11ac", frequency: 5745000000, channel: 149, encryption: "WPA3", resolveDelay: 0 },
  { name: "TP-LINK_2.4G", id: "C4:E9:84:33:22:BB", signalType: "wifi", deviceType: "Wi-Fi Router", manufacturer: "TP-Link", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 0 },
  { name: "xfinitywifi", id: "A6:B1:C2:D3:E4:F5", signalType: "wifi", deviceType: "Access Point", manufacturer: "Comcast", protocol: "802.11ac", frequency: 5180000000, channel: 36, encryption: "Open", resolveDelay: 0 },
  { name: "Ring Doorbell Pro 2", id: "FC:E8:DA:12:AB:CE", signalType: "wifi", deviceType: "IoT Camera", manufacturer: "Ring", protocol: "802.11n", frequency: 2462000000, channel: 11, encryption: "WPA2", resolveDelay: 1 },
  { name: "Wyze Cam v3 Pro", id: "2C:AA:8E:51:C7:DD", signalType: "wifi", deviceType: "IoT Camera", manufacturer: "Wyze", protocol: "802.11ac", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 1 },
  { name: "Sonos One SL", id: "48:A6:B8:C4:D2:EE", signalType: "wifi", deviceType: "Audio Device", manufacturer: "Sonos", protocol: "802.11ac", frequency: 5200000000, channel: 40, encryption: "WPA2", resolveDelay: 1 },
  { name: "HP-Print-5C-LaserJet", id: "9C:B6:D0:FF:5C:11", signalType: "wifi", deviceType: "Printer", manufacturer: "HP", protocol: "802.11n", frequency: 2412000000, channel: 1, encryption: "WPA2", resolveDelay: 0 },
  { name: "Hidden Network", id: "00:1A:2B:3C:4D:5E", signalType: "wifi", deviceType: "Unknown", manufacturer: "Unknown", protocol: "802.11ac", frequency: 5240000000, channel: 48, encryption: "WPA2", resolveDelay: 0 },
  { name: "ASUS-RT-AX88U", id: "04:D9:F5:A1:B2:C3", signalType: "wifi", deviceType: "Wi-Fi Router", manufacturer: "ASUS", protocol: "802.11ax", frequency: 5745000000, channel: 149, encryption: "WPA3", resolveDelay: 0 },
  { name: "Eero Pro 6E", id: "F8:1E:DF:22:44:66", signalType: "wifi", deviceType: "Mesh Router", manufacturer: "Amazon", protocol: "802.11ax", frequency: 5180000000, channel: 36, encryption: "WPA3", resolveDelay: 0 },
  { name: "Google-Home-Mini", id: "30:FD:38:7B:C9:E1", signalType: "wifi", deviceType: "Smart Speaker", manufacturer: "Google", protocol: "802.11ac", frequency: 5200000000, channel: 40, encryption: "WPA2", resolveDelay: 1 },
  { name: "Echo-Dot-4th", id: "F0:F0:A4:55:D8:23", signalType: "wifi", deviceType: "Smart Speaker", manufacturer: "Amazon", protocol: "802.11ac", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 1 },
  { name: "Roku-Ultra-2024", id: "84:EA:ED:33:77:BB", signalType: "wifi", deviceType: "Streaming Device", manufacturer: "Roku", protocol: "802.11ac", frequency: 5745000000, channel: 149, encryption: "WPA2", resolveDelay: 1 },
  { name: "Apple-TV-4K", id: "F4:5C:89:A1:D2:E3", signalType: "wifi", deviceType: "Streaming Device", manufacturer: "Apple", protocol: "802.11ax", frequency: 5180000000, channel: 36, encryption: "WPA3", resolveDelay: 1 },
  { name: "Nest-Cam-Outdoor", id: "18:B4:30:C5:F6:12", signalType: "wifi", deviceType: "IoT Camera", manufacturer: "Google", protocol: "802.11n", frequency: 2412000000, channel: 1, encryption: "WPA2", resolveDelay: 1 },
  { name: "DIRECT-Samsung-TV", id: "92:18:7C:A4:B9:D6", signalType: "wifi", deviceType: "Smart TV", manufacturer: "Samsung", protocol: "802.11ac", frequency: 5200000000, channel: 40, encryption: "WPA2", resolveDelay: 0 },
  { name: "LG-WebOS-78C3", id: "CC:2D:E0:F1:83:47", signalType: "wifi", deviceType: "Smart TV", manufacturer: "LG", protocol: "802.11ac", frequency: 5745000000, channel: 149, encryption: "WPA2", resolveDelay: 0 },
  { name: "SimpliSafe-Base", id: "70:B3:D5:19:AA:CC", signalType: "wifi", deviceType: "Security Hub", manufacturer: "SimpliSafe", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 2 },
  { name: "Tesla-Wall-Connector", id: "24:0A:C4:7D:E8:31", signalType: "wifi", deviceType: "EV Charger", manufacturer: "Tesla", protocol: "802.11n", frequency: 2462000000, channel: 11, encryption: "WPA2", resolveDelay: 2 },
  { name: "Philips-Hue-Bridge", id: "EC:B5:FA:44:66:88", signalType: "wifi", deviceType: "IoT Hub", manufacturer: "Philips", protocol: "802.11n", frequency: 2412000000, channel: 1, encryption: "WPA2", resolveDelay: 1 },
  { name: "iRobot-Roomba-j9", id: "50:14:79:B2:C3:D4", signalType: "wifi", deviceType: "Robot Vacuum", manufacturer: "iRobot", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 2 },
  { name: "Starlink-Router", id: "74:24:6C:E5:F6:A7", signalType: "wifi", deviceType: "Satellite Router", manufacturer: "SpaceX", protocol: "802.11ax", frequency: 5180000000, channel: 36, encryption: "WPA3", resolveDelay: 0 },
  { name: "ARRIS-TG3452", id: "E8:ED:F3:11:22:33", signalType: "wifi", deviceType: "Cable Modem", manufacturer: "ARRIS", protocol: "802.11ac", frequency: 5745000000, channel: 149, encryption: "WPA2", resolveDelay: 0 },
  { name: "UniFi-UAP-AC-Pro", id: "F0:9F:C2:AA:BB:CC", signalType: "wifi", deviceType: "Access Point", manufacturer: "Ubiquiti", protocol: "802.11ac", frequency: 5200000000, channel: 40, encryption: "WPA3", resolveDelay: 0 },
  { name: "Canon-PIXMA-MX922", id: "3C:2E:FF:D1:82:A5", signalType: "wifi", deviceType: "Printer", manufacturer: "Canon", protocol: "802.11n", frequency: 2462000000, channel: 11, encryption: "WPA2", resolveDelay: 1 },
  { name: "Eufy-Doorbell-Dual", id: "D8:1D:72:93:A4:B5", signalType: "wifi", deviceType: "IoT Camera", manufacturer: "Eufy", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 2 },
  { name: "WLAN-Guest", id: "AA:BB:CC:11:22:33", signalType: "wifi", deviceType: "Access Point", manufacturer: "Unknown", protocol: "802.11ac", frequency: 5180000000, channel: 36, encryption: "Open", resolveDelay: 0 },
  { name: "ATT-WiFi-8842", id: "B4:A5:EF:C6:D7:E8", signalType: "wifi", deviceType: "Wi-Fi Router", manufacturer: "AT&T", protocol: "802.11ax", frequency: 2412000000, channel: 1, encryption: "WPA3", resolveDelay: 0 },
  { name: "Arlo-Pro-5S", id: "20:02:AF:C1:D4:E7", signalType: "wifi", deviceType: "IoT Camera", manufacturer: "Arlo", protocol: "802.11ac", frequency: 5200000000, channel: 40, encryption: "WPA2", resolveDelay: 1 },
  { name: "Blink-Outdoor-4", id: "A0:02:DC:B3:F5:82", signalType: "wifi", deviceType: "IoT Camera", manufacturer: "Amazon", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 1 },
  { name: "Reolink-RLC-810A", id: "48:5B:39:E2:A1:C6", signalType: "wifi", deviceType: "IoT Camera", manufacturer: "Reolink", protocol: "802.11ac", frequency: 2462000000, channel: 11, encryption: "WPA2", resolveDelay: 1 },
  { name: "Cisco-Meraki-MR46", id: "00:18:74:D5:93:F1", signalType: "wifi", deviceType: "Enterprise AP", manufacturer: "Cisco", protocol: "802.11ax", frequency: 5745000000, channel: 149, encryption: "WPA3-Enterprise", resolveDelay: 0 },
  { name: "Aruba-AP-535", id: "20:4C:03:A8:B2:D4", signalType: "wifi", deviceType: "Enterprise AP", manufacturer: "Aruba", protocol: "802.11ax", frequency: 5180000000, channel: 36, encryption: "WPA3-Enterprise", resolveDelay: 0 },
  { name: "Ruckus-R750", id: "D8:C7:C8:E1:F4:27", signalType: "wifi", deviceType: "Enterprise AP", manufacturer: "Ruckus", protocol: "802.11ax", frequency: 5200000000, channel: 40, encryption: "WPA3-Enterprise", resolveDelay: 0 },
  { name: "Roomba-Combo-j9+", id: "50:14:79:D3:E8:A6", signalType: "wifi", deviceType: "Robot Vacuum", manufacturer: "iRobot", protocol: "802.11ac", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 2 },
  { name: "Dyson-Purifier-TP09", id: "10:68:3F:A2:C5:B8", signalType: "wifi", deviceType: "Air Purifier", manufacturer: "Dyson", protocol: "802.11ac", frequency: 5180000000, channel: 36, encryption: "WPA2", resolveDelay: 2 },
  { name: "LG-ThinQ-Fridge", id: "A8:23:FE:B4:D1:E7", signalType: "wifi", deviceType: "Smart Appliance", manufacturer: "LG", protocol: "802.11n", frequency: 2412000000, channel: 1, encryption: "WPA2", resolveDelay: 2 },
  { name: "LG-ThinQ-Washer", id: "A8:23:FE:C3:92:D5", signalType: "wifi", deviceType: "Smart Appliance", manufacturer: "LG", protocol: "802.11n", frequency: 2437000000, channel: 6, encryption: "WPA2", resolveDelay: 2 },
  { name: "ChromeOS-Pixel", id: "3C:5A:B4:D8:E2:F1", signalType: "wifi", deviceType: "Laptop", manufacturer: "Google", protocol: "802.11ax", frequency: 5745000000, channel: 149, encryption: "WPA3", resolveDelay: 0 },
  { name: "Epson-ET-2850", id: "64:EB:8C:A1:B3:C5", signalType: "wifi", deviceType: "Printer/Scanner", manufacturer: "Epson", protocol: "802.11n", frequency: 2462000000, channel: 11, encryption: "WPA2", resolveDelay: 1 },
  { name: "Brother-MFC-J4335DW", id: "30:05:5C:D2:E4:F6", signalType: "wifi", deviceType: "Printer/Scanner", manufacturer: "Brother", protocol: "802.11n", frequency: 2412000000, channel: 1, encryption: "WPA2", resolveDelay: 1 },
  { name: "Huawei-AX3-Pro", id: "88:B4:A6:C1:D7:E3", signalType: "wifi", deviceType: "Wi-Fi Router", manufacturer: "Huawei", protocol: "802.11ax", frequency: 5180000000, channel: 36, encryption: "WPA3", resolveDelay: 0 },
  { name: "Xiaomi-AX9000", id: "64:CE:D1:A5:B2:F8", signalType: "wifi", deviceType: "Wi-Fi Router", manufacturer: "Xiaomi", protocol: "802.11ax", frequency: 5745000000, channel: 149, encryption: "WPA3", resolveDelay: 0 },
];

const RFID_DEVICE_POOL: DeviceTemplate[] = [
  { name: "HID iCLASS Badge", id: "RFID:2000F1C8A4", signalType: "rfid", deviceType: "Access Card", manufacturer: "HID Global", protocol: "iCLASS SE", frequency: 13560000, channel: null, encryption: "AES-128", resolveDelay: 1 },
  { name: "NXP MIFARE Classic", id: "RFID:04A3E2B711", signalType: "rfid", deviceType: "Access Card", manufacturer: "NXP", protocol: "ISO 14443A", frequency: 13560000, channel: null, encryption: "Crypto-1", resolveDelay: 2 },
  { name: "Zebra RFID Tag", id: "RFID:E2806894", signalType: "rfid", deviceType: "Asset Tag", manufacturer: "Zebra", protocol: "EPC Gen2", frequency: 915000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "EM4100 Prox Card", id: "RFID:0F00A1B2C3", signalType: "rfid", deviceType: "Proximity Card", manufacturer: "EM Micro", protocol: "EM4100", frequency: 125000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Impinj Monza R6", id: "RFID:E28011052E", signalType: "rfid", deviceType: "UHF Tag", manufacturer: "Impinj", protocol: "EPC C1G2", frequency: 915000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "HID Seos Badge", id: "RFID:3F08D4E5A1", signalType: "rfid", deviceType: "Access Card", manufacturer: "HID Global", protocol: "Seos", frequency: 13560000, channel: null, encryption: "AES-256", resolveDelay: 1 },
  { name: "NFC Payment Ring", id: "RFID:04B8C7D932", signalType: "rfid", deviceType: "Payment Device", manufacturer: "Unknown", protocol: "ISO 14443A", frequency: 13560000, channel: null, encryption: "AES-128", resolveDelay: 4 },
  { name: "NTAG215 Amiibo", id: "RFID:04E1F2A3B4", signalType: "rfid", deviceType: "NFC Tag", manufacturer: "NXP", protocol: "ISO 14443A", frequency: 13560000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Vehicle Toll Tag", id: "RFID:30082B4F11", signalType: "rfid", deviceType: "Vehicle Tag", manufacturer: "Kapsch", protocol: "ISO 18000-6C", frequency: 915000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Pet Microchip", id: "RFID:985170003221", signalType: "rfid", deviceType: "Implant Tag", manufacturer: "Datamars", protocol: "ISO 11784", frequency: 134200, channel: null, encryption: "None", resolveDelay: 4 },
  { name: "E-Passport RFID", id: "RFID:BA0C1D2E3F", signalType: "rfid", deviceType: "Travel Document", manufacturer: "Gemalto", protocol: "ISO 14443B", frequency: 13560000, channel: null, encryption: "BAC/PACE", resolveDelay: 2 },
  { name: "Library Book Tag", id: "RFID:E00401050C", signalType: "rfid", deviceType: "Item Tag", manufacturer: "Bibliotheca", protocol: "ISO 15693", frequency: 13560000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Ski Pass RFID", id: "RFID:04D2E3F4A5", signalType: "rfid", deviceType: "Access Card", manufacturer: "SkiData", protocol: "ISO 14443A", frequency: 13560000, channel: null, encryption: "AES-128", resolveDelay: 2 },
  { name: "Hospital Wristband", id: "RFID:E28068940B", signalType: "rfid", deviceType: "Patient Tag", manufacturer: "Zebra", protocol: "EPC Gen2", frequency: 915000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Warehouse Pallet Tag", id: "RFID:E28011700A", signalType: "rfid", deviceType: "Asset Tag", manufacturer: "Impinj", protocol: "EPC C1G2", frequency: 915000000, channel: null, encryption: "None", resolveDelay: 3 },
];

const SDR_DEVICE_POOL: DeviceTemplate[] = [
  { name: "FM Broadcast WABE", id: "SDR:FM:90.1", signalType: "sdr", deviceType: "FM Broadcast", manufacturer: "Unknown", protocol: "FM Stereo", frequency: 90100000, channel: null, encryption: "None", resolveDelay: 0 },
  { name: "P25 Trunked Radio", id: "SDR:P25:851.0125", signalType: "sdr", deviceType: "Two-Way Radio", manufacturer: "Motorola", protocol: "P25 Phase II", frequency: 851012500, channel: null, encryption: "AES-256", resolveDelay: 2 },
  { name: "FRS Channel 1", id: "SDR:FRS:462.5625", signalType: "sdr", deviceType: "FRS Radio", manufacturer: "Unknown", protocol: "FM Analog", frequency: 462562500, channel: 1, encryption: "None", resolveDelay: 1 },
  { name: "NOAA Weather Radio", id: "SDR:WX:162.550", signalType: "sdr", deviceType: "Weather Station", manufacturer: "NOAA", protocol: "NWR SAME", frequency: 162550000, channel: null, encryption: "None", resolveDelay: 0 },
  { name: "DMR Repeater", id: "SDR:DMR:443.100", signalType: "sdr", deviceType: "Repeater", manufacturer: "Hytera", protocol: "DMR Tier II", frequency: 443100000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Aircraft 121.5 ELT", id: "SDR:AIR:121.500", signalType: "sdr", deviceType: "Emergency Beacon", manufacturer: "Unknown", protocol: "AM Aviation", frequency: 121500000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "ISM 433 Sensor", id: "SDR:ISM:433.920", signalType: "sdr", deviceType: "Weather Sensor", manufacturer: "Acurite", protocol: "OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "POCSAG Pager", id: "SDR:PAGER:152.480", signalType: "sdr", deviceType: "Pager", manufacturer: "Unknown", protocol: "POCSAG 1200", frequency: 152480000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "APRS 144.390", id: "SDR:APRS:144.390", signalType: "sdr", deviceType: "APRS Station", manufacturer: "Unknown", protocol: "AX.25 AFSK", frequency: 144390000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "LTE Band 66 Cell", id: "SDR:LTE:2115.0", signalType: "sdr", deviceType: "Cell Tower", manufacturer: "Ericsson", protocol: "LTE FDD", frequency: 2115000000, channel: null, encryption: "AES-128", resolveDelay: 2 },
  { name: "DECT Handset", id: "SDR:DECT:1881.792", signalType: "sdr", deviceType: "Cordless Phone", manufacturer: "Unknown", protocol: "DECT", frequency: 1881792000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Tire Pressure Sensor", id: "SDR:TPMS:315.000", signalType: "sdr", deviceType: "TPMS Sensor", manufacturer: "Unknown", protocol: "FSK", frequency: 315000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Marine VHF Ch 16", id: "SDR:VHF:156.800", signalType: "sdr", deviceType: "Marine Radio", manufacturer: "Unknown", protocol: "FM Marine", frequency: 156800000, channel: 16, encryption: "None", resolveDelay: 1 },
  { name: "AIS Vessel Track", id: "SDR:AIS:161.975", signalType: "sdr", deviceType: "AIS Transponder", manufacturer: "Unknown", protocol: "AIS TDMA", frequency: 161975000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "2m Ham Repeater", id: "SDR:HAM:146.940", signalType: "sdr", deviceType: "Repeater", manufacturer: "Yaesu", protocol: "FM Analog", frequency: 146940000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "70cm Ham Repeater", id: "SDR:HAM:442.100", signalType: "sdr", deviceType: "Repeater", manufacturer: "Kenwood", protocol: "FM Analog", frequency: 442100000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "Garage Door Opener", id: "SDR:ISM:315.150", signalType: "sdr", deviceType: "Remote Control", manufacturer: "Chamberlain", protocol: "OOK Rolling", frequency: 315150000, channel: null, encryption: "Rolling Code", resolveDelay: 2 },
  { name: "Car Key Fob 433", id: "SDR:ISM:433.875", signalType: "sdr", deviceType: "Remote Key", manufacturer: "Unknown", protocol: "FSK Rolling", frequency: 433875000, channel: null, encryption: "Rolling Code", resolveDelay: 2 },
  { name: "Baby Monitor", id: "SDR:ISM:49.830", signalType: "sdr", deviceType: "Baby Monitor", manufacturer: "VTech", protocol: "FM Analog", frequency: 49830000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Wireless Microphone", id: "SDR:UHF:614.000", signalType: "sdr", deviceType: "Wireless Mic", manufacturer: "Shure", protocol: "FM Digital", frequency: 614000000, channel: null, encryption: "None", resolveDelay: 2 },
];

const LORA_DEVICE_POOL: DeviceTemplate[] = [
  { name: "Dragino LHT65N", id: "LORA:A84041F831", signalType: "lora", deviceType: "Temp/Humidity Sensor", manufacturer: "Dragino", protocol: "LoRaWAN 1.0.3", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2, shortName: "DRG1", longName: "Dragino LHT65N" },
  { name: "RAK WisBlock Tracker", id: "LORA:AC1F09FFFE", signalType: "lora", deviceType: "GPS Tracker", manufacturer: "RAKwireless", protocol: "LoRaWAN 1.0.4", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2, shortName: "RAKT", longName: "RAK WisBlock Tracker", broadcastsTelemetry: true, telemetryBaseLat: 33.749, telemetryBaseLng: -84.388, telemetryBaseAlt: 320, telemetryDriftRadius: 0.008 },
  { name: "Kerlink iFemtoCell", id: "LORA:7276FF0001", signalType: "lora", deviceType: "Gateway", manufacturer: "Kerlink", protocol: "LoRaWAN GW", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 1, shortName: "KGWY", longName: "Kerlink iFemtoCell GW", broadcastsTelemetry: true, telemetryBaseLat: 33.753, telemetryBaseLng: -84.386, telemetryBaseAlt: 305, telemetryDriftRadius: 0.0001 },
  { name: "Tektelic Kona Micro", id: "LORA:647FDA0003", signalType: "lora", deviceType: "Gateway", manufacturer: "Tektelic", protocol: "LoRaWAN GW", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 1, shortName: "TKGW", longName: "Tektelic Kona Micro GW", broadcastsTelemetry: true, telemetryBaseLat: 33.755, telemetryBaseLng: -84.390, telemetryBaseAlt: 312, telemetryDriftRadius: 0.0001 },
  { name: "Seeed SenseCAP S2120", id: "LORA:2CF7F12100", signalType: "lora", deviceType: "Weather Station", manufacturer: "Seeed", protocol: "LoRaWAN 1.0.3", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 3, shortName: "SCAP", longName: "SenseCAP S2120 Weather", broadcastsTelemetry: true, telemetryBaseLat: 33.748, telemetryBaseLng: -84.391, telemetryBaseAlt: 298, telemetryDriftRadius: 0.0002 },
  { name: "Browan TBMS100", id: "LORA:00137A1000", signalType: "lora", deviceType: "Motion Sensor", manufacturer: "Browan", protocol: "LoRaWAN 1.0.3", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 3, shortName: "BRWN", longName: "Browan TBMS100 Motion" },
  { name: "Milesight EM300-TH", id: "LORA:24E124136B", signalType: "lora", deviceType: "Temp/Humidity Sensor", manufacturer: "Milesight", protocol: "LoRaWAN 1.0.4", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2, shortName: "MS30", longName: "Milesight EM300-TH" },
  { name: "Elsys ERS CO2", id: "LORA:A81758FFFE", signalType: "lora", deviceType: "Air Quality Sensor", manufacturer: "Elsys", protocol: "LoRaWAN 1.0.3", frequency: 868000000, channel: null, encryption: "AES-128", resolveDelay: 3, shortName: "ELCO", longName: "Elsys ERS CO2 Sensor" },
  { name: "Meshcore Relay Alpha", id: "LORA:MC:!d4e5f6a7", signalType: "lora", deviceType: "Mesh Relay", manufacturer: "Meshcore", protocol: "Meshcore 1.2", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1, shortName: "MCR1", longName: "Meshcore Relay Alpha", broadcastsTelemetry: true, telemetryBaseLat: 33.760, telemetryBaseLng: -84.385, telemetryBaseAlt: 340, telemetryDriftRadius: 0.005 },
  { name: "Meshcore Tracker T1", id: "LORA:MC:!b8c9d0e1", signalType: "lora", deviceType: "GPS Tracker", manufacturer: "Meshcore", protocol: "Meshcore 1.2", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 2, shortName: "MCT1", longName: "Meshcore Tracker T1", broadcastsTelemetry: true, telemetryBaseLat: 33.745, telemetryBaseLng: -84.395, telemetryBaseAlt: 310, telemetryDriftRadius: 0.012 },
  { name: "Meshcore Base Station", id: "LORA:MC:!f2a3b4c5", signalType: "lora", deviceType: "Base Station", manufacturer: "Meshcore", protocol: "Meshcore 1.2", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1, shortName: "MCBS", longName: "Meshcore Base Station", broadcastsTelemetry: true, telemetryBaseLat: 33.752, telemetryBaseLng: -84.388, telemetryBaseAlt: 318, telemetryDriftRadius: 0.0001 },
  { name: "Meshcore Sensor Node", id: "LORA:MC:!a2b3c4d5", signalType: "lora", deviceType: "Sensor Node", manufacturer: "Meshcore", protocol: "Meshcore 1.2", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 2, shortName: "MCSN", longName: "Meshcore Sensor Node", broadcastsTelemetry: true, telemetryBaseLat: 33.747, telemetryBaseLng: -84.392, telemetryBaseAlt: 295, telemetryDriftRadius: 0.003 },
  { name: "Helium Hotspot", id: "LORA:HNT:112ABC34", signalType: "lora", deviceType: "Hotspot/Gateway", manufacturer: "Bobcat", protocol: "LoRaWAN HIP", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 1, shortName: "HNT1", longName: "Helium Hotspot Bobcat", broadcastsTelemetry: true, telemetryBaseLat: 33.758, telemetryBaseLng: -84.382, telemetryBaseAlt: 325, telemetryDriftRadius: 0.0001 },
  { name: "Helium Mapper", id: "LORA:HNT:MAPPER001", signalType: "lora", deviceType: "Coverage Mapper", manufacturer: "Helium", protocol: "LoRaWAN HIP", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2, shortName: "HMAP", longName: "Helium Coverage Mapper", broadcastsTelemetry: true, telemetryBaseLat: 33.741, telemetryBaseLng: -84.400, telemetryBaseAlt: 290, telemetryDriftRadius: 0.015 },
  { name: "LoRa P2P Relay Node", id: "LORA:P2P:RELAY001", signalType: "lora", deviceType: "P2P Relay", manufacturer: "Custom", protocol: "LoRa P2P", frequency: 915000000, channel: null, encryption: "None", resolveDelay: 3, shortName: "P2PR", longName: "LoRa P2P Relay Node", broadcastsTelemetry: true, telemetryBaseLat: 33.756, telemetryBaseLng: -84.379, telemetryBaseAlt: 335, telemetryDriftRadius: 0.0003 },
  { name: "LoRa P2P Sensor Node", id: "LORA:P2P:SENSOR01", signalType: "lora", deviceType: "Remote Sensor", manufacturer: "Custom", protocol: "LoRa P2P", frequency: 868000000, channel: null, encryption: "None", resolveDelay: 3, shortName: "P2PS", longName: "LoRa P2P Sensor Node", broadcastsTelemetry: true, telemetryBaseLat: 33.743, telemetryBaseLng: -84.393, telemetryBaseAlt: 305, telemetryDriftRadius: 0.0005 },
  { name: "ChirpStack Gateway", id: "LORA:CS:GW00A1B2", signalType: "lora", deviceType: "Network Server GW", manufacturer: "ChirpStack", protocol: "LoRaWAN NS", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 1, shortName: "CSGW", longName: "ChirpStack Gateway", broadcastsTelemetry: true, telemetryBaseLat: 33.750, telemetryBaseLng: -84.387, telemetryBaseAlt: 310, telemetryDriftRadius: 0.0001 },
  { name: "Cattle Tracker LoRa", id: "LORA:AG:CATTLE01", signalType: "lora", deviceType: "Livestock Tracker", manufacturer: "Digital Matter", protocol: "LoRaWAN 1.0.4", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 3, shortName: "COW1", longName: "Cattle Tracker Unit 1", broadcastsTelemetry: true, telemetryBaseLat: 33.735, telemetryBaseLng: -84.410, telemetryBaseAlt: 280, telemetryDriftRadius: 0.02 },
  { name: "Oyster3 Asset Tracker", id: "LORA:DM:OYSTER03", signalType: "lora", deviceType: "Asset Tracker", manufacturer: "Digital Matter", protocol: "LoRaWAN 1.0.4", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2, shortName: "OY3T", longName: "Oyster3 Asset Tracker", broadcastsTelemetry: true, telemetryBaseLat: 33.762, telemetryBaseLng: -84.375, telemetryBaseAlt: 330, telemetryDriftRadius: 0.01 },
];

const MESHTASTIC_DEVICE_POOL: DeviceTemplate[] = [
  { name: "Heltec V3 Node", id: "MESH:!a1b2c3d4", signalType: "meshtastic", deviceType: "Mesh Node", manufacturer: "Heltec", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1, shortName: "HV3N", longName: "Heltec V3 Node", broadcastsTelemetry: true, telemetryBaseLat: 33.770, telemetryBaseLng: -84.370, telemetryBaseAlt: 350, telemetryDriftRadius: 0.006 },
  { name: "T-Beam Supreme", id: "MESH:!e5f6a7b8", signalType: "meshtastic", deviceType: "Mesh Node", manufacturer: "LILYGO", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1, shortName: "TBSP", longName: "T-Beam Supreme GPS", broadcastsTelemetry: true, telemetryBaseLat: 33.765, telemetryBaseLng: -84.380, telemetryBaseAlt: 342, telemetryDriftRadius: 0.01 },
  { name: "RAK WisMesh Pocket", id: "MESH:!c9d0e1f2", signalType: "meshtastic", deviceType: "Mesh Node", manufacturer: "RAKwireless", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 2, shortName: "RAKP", longName: "RAK WisMesh Pocket", broadcastsTelemetry: true, telemetryBaseLat: 33.755, telemetryBaseLng: -84.395, telemetryBaseAlt: 315, telemetryDriftRadius: 0.008 },
  { name: "Station G2", id: "MESH:!33445566", signalType: "meshtastic", deviceType: "Base Station", manufacturer: "Meshtastic", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1, shortName: "STG2", longName: "Station G2 Base", broadcastsTelemetry: true, telemetryBaseLat: 33.751, telemetryBaseLng: -84.389, telemetryBaseAlt: 308, telemetryDriftRadius: 0.0001 },
  { name: "RP2040 Relay Node", id: "MESH:!77889900", signalType: "meshtastic", deviceType: "Relay Node", manufacturer: "LILYGO", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 3, shortName: "RP20", longName: "RP2040 Relay Node", broadcastsTelemetry: true, telemetryBaseLat: 33.763, telemetryBaseLng: -84.372, telemetryBaseAlt: 360, telemetryDriftRadius: 0.0003 },
  { name: "Solar Repeater", id: "MESH:!aabbccdd", signalType: "meshtastic", deviceType: "Repeater", manufacturer: "Custom", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 3, shortName: "SOLR", longName: "Solar Repeater Hilltop", broadcastsTelemetry: true, telemetryBaseLat: 33.780, telemetryBaseLng: -84.365, telemetryBaseAlt: 420, telemetryDriftRadius: 0.0002 },
  { name: "Heltec Capsule V3", id: "MESH:!11223344", signalType: "meshtastic", deviceType: "Compact Node", manufacturer: "Heltec", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 2, shortName: "HCAP", longName: "Heltec Capsule V3", broadcastsTelemetry: true, telemetryBaseLat: 33.742, telemetryBaseLng: -84.402, telemetryBaseAlt: 288, telemetryDriftRadius: 0.007 },
  { name: "WisMesh TAP", id: "MESH:!55667788", signalType: "meshtastic", deviceType: "Mesh Node", manufacturer: "RAKwireless", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 2, shortName: "WTAP", longName: "WisMesh TAP Node", broadcastsTelemetry: true, telemetryBaseLat: 33.768, telemetryBaseLng: -84.378, telemetryBaseAlt: 338, telemetryDriftRadius: 0.009 },
];

const ADSB_DEVICE_POOL: DeviceTemplate[] = [
  { name: "DAL1247 B737-900", id: "ADSB:A12345", signalType: "adsb", deviceType: "Commercial Aircraft", manufacturer: "Boeing", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 0, broadcastsTelemetry: true, telemetryBaseLat: 33.640, telemetryBaseLng: -84.430, telemetryBaseAlt: 10668, telemetryDriftRadius: 0.15 },
  { name: "UAL892 A320neo", id: "ADSB:A67890", signalType: "adsb", deviceType: "Commercial Aircraft", manufacturer: "Airbus", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 0, broadcastsTelemetry: true, telemetryBaseLat: 33.680, telemetryBaseLng: -84.350, telemetryBaseAlt: 9144, telemetryDriftRadius: 0.12 },
  { name: "N52341 Cessna 172", id: "ADSB:A34567", signalType: "adsb", deviceType: "General Aviation", manufacturer: "Cessna", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.720, telemetryBaseLng: -84.310, telemetryBaseAlt: 1524, telemetryDriftRadius: 0.04 },
  { name: "AAL445 B787-9", id: "ADSB:AB1234", signalType: "adsb", deviceType: "Commercial Aircraft", manufacturer: "Boeing", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 0, broadcastsTelemetry: true, telemetryBaseLat: 33.590, telemetryBaseLng: -84.520, telemetryBaseAlt: 11278, telemetryDriftRadius: 0.18 },
  { name: "N8127P PA-28", id: "ADSB:A78901", signalType: "adsb", deviceType: "General Aviation", manufacturer: "Piper", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.745, telemetryBaseLng: -84.395, telemetryBaseAlt: 914, telemetryDriftRadius: 0.03 },
  { name: "SWA3421 B737 MAX 8", id: "ADSB:AC5678", signalType: "adsb", deviceType: "Commercial Aircraft", manufacturer: "Boeing", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 0, broadcastsTelemetry: true, telemetryBaseLat: 33.710, telemetryBaseLng: -84.280, telemetryBaseAlt: 7620, telemetryDriftRadius: 0.10 },
  { name: "LifeFlight N911LF", id: "ADSB:A45678", signalType: "adsb", deviceType: "Helicopter", manufacturer: "Airbus H145", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.758, telemetryBaseLng: -84.385, telemetryBaseAlt: 457, telemetryDriftRadius: 0.02 },
  { name: "USAF C-17A", id: "ADSB:AE1234", signalType: "adsb", deviceType: "Military Transport", manufacturer: "Boeing", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 2, broadcastsTelemetry: true, telemetryBaseLat: 33.620, telemetryBaseLng: -84.570, telemetryBaseAlt: 8534, telemetryDriftRadius: 0.20 },
  { name: "DJI Mavic 3 Enterprise", id: "ADSB:DJI00123", signalType: "adsb", deviceType: "UAS/Drone", manufacturer: "DJI", protocol: "Remote ID", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.752, telemetryBaseLng: -84.390, telemetryBaseAlt: 120, telemetryDriftRadius: 0.005 },
  { name: "Skydio X10", id: "ADSB:SKY00456", signalType: "adsb", deviceType: "UAS/Drone", manufacturer: "Skydio", protocol: "Remote ID", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 2, broadcastsTelemetry: true, telemetryBaseLat: 33.748, telemetryBaseLng: -84.392, telemetryBaseAlt: 90, telemetryDriftRadius: 0.004 },
  { name: "Autel EVO II Pro", id: "ADSB:AUT00789", signalType: "adsb", deviceType: "UAS/Drone", manufacturer: "Autel", protocol: "Remote ID", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.755, telemetryBaseLng: -84.383, telemetryBaseAlt: 100, telemetryDriftRadius: 0.003 },
  { name: "Wing Delivery Drone", id: "ADSB:WNG00321", signalType: "adsb", deviceType: "UAS/Drone", manufacturer: "Wing (Alphabet)", protocol: "Remote ID", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.740, telemetryBaseLng: -84.405, telemetryBaseAlt: 60, telemetryDriftRadius: 0.008 },
];

const SENSOR_DEVICE_POOL: DeviceTemplate[] = [
  { name: "Acurite 5-in-1", id: "SENS:ACU5N1:001", signalType: "sensor", deviceType: "Weather Station", manufacturer: "Acurite", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "LaCrosse TX141TH", id: "SENS:LAC:TX141", signalType: "sensor", deviceType: "Temp/Humidity Sensor", manufacturer: "LaCrosse", protocol: "433MHz FSK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Ambient WS-2902C", id: "SENS:AMB:2902C", signalType: "sensor", deviceType: "Weather Station", manufacturer: "Ambient Weather", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Govee H5075", id: "SENS:GOV:H5075", signalType: "sensor", deviceType: "Temp/Humidity Sensor", manufacturer: "Govee", protocol: "BLE Beacon", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Oregon Scientific THR228N", id: "SENS:ORE:THR228", signalType: "sensor", deviceType: "Temp Sensor", manufacturer: "Oregon Scientific", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Ecowitt GW1100", id: "SENS:ECO:GW1100", signalType: "sensor", deviceType: "Sensor Hub", manufacturer: "Ecowitt", protocol: "433MHz FSK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Honeywell C7189U Probe", id: "SENS:HON:C7189U", signalType: "sensor", deviceType: "Temperature Probe", manufacturer: "Honeywell", protocol: "433MHz FSK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Bosch BMP280 Pressure", id: "SENS:BSH:BMP280", signalType: "sensor", deviceType: "Pressure Sensor", manufacturer: "Bosch", protocol: "I2C/SPI Relay", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Soil Moisture Probe", id: "SENS:AGR:SOIL01", signalType: "sensor", deviceType: "Soil Sensor", manufacturer: "Vegetronix", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Rain Gauge Wireless", id: "SENS:AGR:RAIN01", signalType: "sensor", deviceType: "Rain Gauge", manufacturer: "Davis Instruments", protocol: "433MHz FSK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "GMC-300E Geiger Counter", id: "SENS:RAD:GMC300", signalType: "sensor", deviceType: "Radiation Detector", manufacturer: "GQ Electronics", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 4 },
  { name: "PurpleAir PA-II", id: "SENS:AIR:PAII01", signalType: "sensor", deviceType: "Air Quality Monitor", manufacturer: "PurpleAir", protocol: "WiFi Relay", frequency: 2412000000, channel: 1, encryption: "None", resolveDelay: 2 },
  { name: "Airthings Wave Plus", id: "SENS:AIR:WAVE01", signalType: "sensor", deviceType: "Air Quality Monitor", manufacturer: "Airthings", protocol: "BLE Beacon", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Water Flow Sensor", id: "SENS:WTR:FLOW01", signalType: "sensor", deviceType: "Flow Sensor", manufacturer: "Flume", protocol: "433MHz FSK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Leak Detector", id: "SENS:WTR:LEAK01", signalType: "sensor", deviceType: "Leak Detector", manufacturer: "Flo by Moen", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "UV Index Sensor", id: "SENS:UV:INDEX1", signalType: "sensor", deviceType: "UV Sensor", manufacturer: "Ambient Weather", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 3 },
];

const ALL_POOLS: Record<string, DeviceTemplate[]> = {
  bluetooth: BLE_DEVICE_POOL,
  wifi: WIFI_DEVICE_POOL,
  rfid: RFID_DEVICE_POOL,
  sdr: SDR_DEVICE_POOL,
  lora: LORA_DEVICE_POOL,
  meshtastic: MESHTASTIC_DEVICE_POOL,
  adsb: ADSB_DEVICE_POOL,
  sensor: SENSOR_DEVICE_POOL,
};

function randomRSSI(min: number = -95, max: number = -25): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getPoolForSensorType(sensorType: string): DeviceTemplate[] {
  if (sensorType in ALL_POOLS) return ALL_POOLS[sensorType];
  return Object.values(ALL_POOLS).flat();
}

interface ProgressiveState {
  seenCount: Map<string, number>;
}

function generateTelemetryPosition(template: DeviceTemplate): { lat: number; lng: number; alt: number | null } | null {
  if (!template.broadcastsTelemetry || template.telemetryBaseLat == null || template.telemetryBaseLng == null) return null;
  const drift = template.telemetryDriftRadius || 0.001;
  const angle = Math.random() * 2 * Math.PI;
  const r = drift * Math.sqrt(Math.random());
  return {
    lat: template.telemetryBaseLat + r * Math.cos(angle),
    lng: template.telemetryBaseLng + r * Math.sin(angle),
    alt: template.telemetryBaseAlt != null ? template.telemetryBaseAlt + (Math.random() - 0.5) * 20 : null,
  };
}

const TELEMETRY_SIGNAL_TYPES = new Set(["lora", "meshtastic", "adsb"]);

function buildPartialNode(template: DeviceTemplate, state: ProgressiveState): DiscoveredNode {
  const seen = state.seenCount.get(template.id) || 0;
  state.seenCount.set(template.id, seen + 1);

  const resolved = seen >= template.resolveDelay;
  const isMeshType = TELEMETRY_SIGNAL_TYPES.has(template.signalType);
  const hasShortLong = isMeshType && template.shortName && template.longName;

  const telemetry = template.broadcastsTelemetry ? generateTelemetryPosition(template) : null;
  const hasTelemetry = telemetry != null;

  if (resolved) {
    const displayName = hasShortLong ? `${template.longName} (${template.shortName})` : template.name;
    return {
      name: displayName,
      id: template.id,
      rssi: randomRSSI(),
      signalType: template.signalType,
      deviceType: template.deviceType,
      manufacturer: template.manufacturer,
      protocol: template.protocol,
      frequency: template.frequency,
      channel: template.channel,
      encryption: template.encryption,
      resolved: true,
      shortName: template.shortName || null,
      longName: template.longName || null,
      broadcastLat: telemetry?.lat ?? null,
      broadcastLng: telemetry?.lng ?? null,
      broadcastAlt: telemetry?.alt ?? null,
      hasTelemetry,
    };
  }

  const ouiLookup = lookupOui(template.id);
  const mfrFromOui = seen >= 1 ? template.manufacturer : (ouiLookup || "Unknown");

  let nameLabel: string;
  let currentShort: string | null = null;
  let currentLong: string | null = null;

  if (hasShortLong) {
    if (seen >= 1) {
      currentShort = template.shortName!;
      nameLabel = template.shortName!;
    } else {
      nameLabel = template.id;
    }
  } else {
    nameLabel = mfrFromOui !== "Unknown" ? `${mfrFromOui} Device` : template.id;
  }

  return {
    name: nameLabel,
    id: template.id,
    rssi: randomRSSI(),
    signalType: template.signalType,
    deviceType: seen >= 1 ? template.deviceType : "Unknown",
    manufacturer: mfrFromOui,
    protocol: template.protocol,
    frequency: template.frequency,
    channel: template.channel,
    encryption: seen >= 1 ? template.encryption : "Unknown",
    resolved: false,
    shortName: currentShort,
    longName: currentLong,
    broadcastLat: hasTelemetry && seen >= 1 ? telemetry?.lat ?? null : null,
    broadcastLng: hasTelemetry && seen >= 1 ? telemetry?.lng ?? null : null,
    broadcastAlt: hasTelemetry && seen >= 1 ? telemetry?.alt ?? null : null,
    hasTelemetry: hasTelemetry && seen >= 1,
  };
}

export function startPassiveScan(
  sensorType: string,
  onNodeDiscovered: (node: DiscoveredNode) => void,
  intervalMs: number = 1500
): ScanSession {
  const pool = getPoolForSensorType(sensorType);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  let index = 0;
  const discovered: DiscoveredNode[] = [];
  const progressiveState: ProgressiveState = { seenCount: new Map() };

  const session: ScanSession = {
    isActive: true,
    discoveredNodes: discovered,
    startTime: Date.now(),
    intervalId: null,
  };

  const emitOne = (template: DeviceTemplate) => {
    const node = buildPartialNode(template, progressiveState);

    const existingIdx = discovered.findIndex(d => d.id === node.id);
    if (existingIdx >= 0) {
      discovered[existingIdx] = node;
    } else {
      discovered.push(node);
    }
    onNodeDiscovered(node);
  };

  const emit = () => {
    if (!session.isActive) return;

    const burstSize = Math.random() < 0.3 ? Math.floor(Math.random() * 3) + 2 : 1;

    for (let i = 0; i < burstSize; i++) {
      const template = shuffled[index % shuffled.length];
      index++;
      emitOne(template);
    }
  };

  const jitter = () => intervalMs + Math.floor(Math.random() * 800) - 400;

  const scheduleNext = () => {
    if (!session.isActive) return;
    session.intervalId = setTimeout(() => {
      emit();
      scheduleNext();
    }, jitter());
  };

  setTimeout(() => {
    const initialBurst = Math.min(Math.floor(Math.random() * 4) + 3, shuffled.length);
    for (let i = 0; i < initialBurst; i++) {
      const template = shuffled[index % shuffled.length];
      index++;
      emitOne(template);
    }
    scheduleNext();
  }, 300);

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
