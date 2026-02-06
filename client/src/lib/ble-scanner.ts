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
];

const LORA_DEVICE_POOL: DeviceTemplate[] = [
  { name: "Dragino LHT65N", id: "LORA:A84041F831", signalType: "lora", deviceType: "Temp/Humidity Sensor", manufacturer: "Dragino", protocol: "LoRaWAN 1.0.3", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2 },
  { name: "RAK WisBlock Tracker", id: "LORA:AC1F09FFFE", signalType: "lora", deviceType: "GPS Tracker", manufacturer: "RAKwireless", protocol: "LoRaWAN 1.0.4", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2, broadcastsTelemetry: true, telemetryBaseLat: 33.749, telemetryBaseLng: -84.388, telemetryBaseAlt: 320, telemetryDriftRadius: 0.008 },
  { name: "Kerlink iFemtoCell", id: "LORA:7276FF0001", signalType: "lora", deviceType: "Gateway", manufacturer: "Kerlink", protocol: "LoRaWAN GW", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.753, telemetryBaseLng: -84.386, telemetryBaseAlt: 305, telemetryDriftRadius: 0.0001 },
  { name: "Tektelic Kona Micro", id: "LORA:647FDA0003", signalType: "lora", deviceType: "Gateway", manufacturer: "Tektelic", protocol: "LoRaWAN GW", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.755, telemetryBaseLng: -84.390, telemetryBaseAlt: 312, telemetryDriftRadius: 0.0001 },
  { name: "Seeed SenseCAP S2120", id: "LORA:2CF7F12100", signalType: "lora", deviceType: "Weather Station", manufacturer: "Seeed", protocol: "LoRaWAN 1.0.3", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 3, broadcastsTelemetry: true, telemetryBaseLat: 33.748, telemetryBaseLng: -84.391, telemetryBaseAlt: 298, telemetryDriftRadius: 0.0002 },
  { name: "Browan TBMS100", id: "LORA:00137A1000", signalType: "lora", deviceType: "Motion Sensor", manufacturer: "Browan", protocol: "LoRaWAN 1.0.3", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 3 },
  { name: "Milesight EM300-TH", id: "LORA:24E124136B", signalType: "lora", deviceType: "Temp/Humidity Sensor", manufacturer: "Milesight", protocol: "LoRaWAN 1.0.4", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2 },
  { name: "Elsys ERS CO2", id: "LORA:A81758FFFE", signalType: "lora", deviceType: "Air Quality Sensor", manufacturer: "Elsys", protocol: "LoRaWAN 1.0.3", frequency: 868000000, channel: null, encryption: "AES-128", resolveDelay: 3 },
  { name: "Meshcore Relay Alpha", id: "LORA:MC:!d4e5f6a7", signalType: "lora", deviceType: "Mesh Relay", manufacturer: "Meshcore", protocol: "Meshcore 1.2", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.760, telemetryBaseLng: -84.385, telemetryBaseAlt: 340, telemetryDriftRadius: 0.005 },
  { name: "Meshcore Tracker T1", id: "LORA:MC:!b8c9d0e1", signalType: "lora", deviceType: "GPS Tracker", manufacturer: "Meshcore", protocol: "Meshcore 1.2", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 2, broadcastsTelemetry: true, telemetryBaseLat: 33.745, telemetryBaseLng: -84.395, telemetryBaseAlt: 310, telemetryDriftRadius: 0.012 },
  { name: "Meshcore Base Station", id: "LORA:MC:!f2a3b4c5", signalType: "lora", deviceType: "Base Station", manufacturer: "Meshcore", protocol: "Meshcore 1.2", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.752, telemetryBaseLng: -84.388, telemetryBaseAlt: 318, telemetryDriftRadius: 0.0001 },
  { name: "Helium Hotspot", id: "LORA:HNT:112ABC34", signalType: "lora", deviceType: "Hotspot/Gateway", manufacturer: "Bobcat", protocol: "LoRaWAN HIP", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.758, telemetryBaseLng: -84.382, telemetryBaseAlt: 325, telemetryDriftRadius: 0.0001 },
  { name: "Helium Mapper", id: "LORA:HNT:MAPPER001", signalType: "lora", deviceType: "Coverage Mapper", manufacturer: "Helium", protocol: "LoRaWAN HIP", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2, broadcastsTelemetry: true, telemetryBaseLat: 33.741, telemetryBaseLng: -84.400, telemetryBaseAlt: 290, telemetryDriftRadius: 0.015 },
  { name: "LoRa P2P Relay Node", id: "LORA:P2P:RELAY001", signalType: "lora", deviceType: "P2P Relay", manufacturer: "Custom", protocol: "LoRa P2P", frequency: 915000000, channel: null, encryption: "None", resolveDelay: 3, broadcastsTelemetry: true, telemetryBaseLat: 33.756, telemetryBaseLng: -84.379, telemetryBaseAlt: 335, telemetryDriftRadius: 0.0003 },
  { name: "LoRa P2P Sensor Node", id: "LORA:P2P:SENSOR01", signalType: "lora", deviceType: "Remote Sensor", manufacturer: "Custom", protocol: "LoRa P2P", frequency: 868000000, channel: null, encryption: "None", resolveDelay: 3, broadcastsTelemetry: true, telemetryBaseLat: 33.743, telemetryBaseLng: -84.393, telemetryBaseAlt: 305, telemetryDriftRadius: 0.0005 },
  { name: "ChirpStack Gateway", id: "LORA:CS:GW00A1B2", signalType: "lora", deviceType: "Network Server GW", manufacturer: "ChirpStack", protocol: "LoRaWAN NS", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 1, broadcastsTelemetry: true, telemetryBaseLat: 33.750, telemetryBaseLng: -84.387, telemetryBaseAlt: 310, telemetryDriftRadius: 0.0001 },
  { name: "Cattle Tracker LoRa", id: "LORA:AG:CATTLE01", signalType: "lora", deviceType: "Livestock Tracker", manufacturer: "Digital Matter", protocol: "LoRaWAN 1.0.4", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 3, broadcastsTelemetry: true, telemetryBaseLat: 33.735, telemetryBaseLng: -84.410, telemetryBaseAlt: 280, telemetryDriftRadius: 0.02 },
  { name: "Oyster3 Asset Tracker", id: "LORA:DM:OYSTER03", signalType: "lora", deviceType: "Asset Tracker", manufacturer: "Digital Matter", protocol: "LoRaWAN 1.0.4", frequency: 915000000, channel: null, encryption: "AES-128", resolveDelay: 2, broadcastsTelemetry: true, telemetryBaseLat: 33.762, telemetryBaseLng: -84.375, telemetryBaseAlt: 330, telemetryDriftRadius: 0.01 },
];

const MESHTASTIC_DEVICE_POOL: DeviceTemplate[] = [
  { name: "Heltec V3 Node", id: "MESH:!a1b2c3d4", signalType: "meshtastic", deviceType: "Mesh Node", manufacturer: "Heltec", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1 },
  { name: "T-Beam Supreme", id: "MESH:!e5f6a7b8", signalType: "meshtastic", deviceType: "Mesh Node", manufacturer: "LILYGO", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1 },
  { name: "RAK WisMesh Pocket", id: "MESH:!c9d0e1f2", signalType: "meshtastic", deviceType: "Mesh Node", manufacturer: "RAKwireless", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 2 },
  { name: "Station G2", id: "MESH:!33445566", signalType: "meshtastic", deviceType: "Base Station", manufacturer: "Meshtastic", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 1 },
  { name: "RP2040 Relay Node", id: "MESH:!77889900", signalType: "meshtastic", deviceType: "Relay Node", manufacturer: "LILYGO", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 3 },
  { name: "Solar Repeater", id: "MESH:!aabbccdd", signalType: "meshtastic", deviceType: "Repeater", manufacturer: "Custom", protocol: "Meshtastic 2.3", frequency: 906000000, channel: null, encryption: "AES-256", resolveDelay: 3 },
];

const ADSB_DEVICE_POOL: DeviceTemplate[] = [
  { name: "DAL1247 B737-900", id: "ADSB:A12345", signalType: "adsb", deviceType: "Commercial Aircraft", manufacturer: "Boeing", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 0 },
  { name: "UAL892 A320neo", id: "ADSB:A67890", signalType: "adsb", deviceType: "Commercial Aircraft", manufacturer: "Airbus", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 0 },
  { name: "N52341 Cessna 172", id: "ADSB:A34567", signalType: "adsb", deviceType: "General Aviation", manufacturer: "Cessna", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "AAL445 B787-9", id: "ADSB:AB1234", signalType: "adsb", deviceType: "Commercial Aircraft", manufacturer: "Boeing", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 0 },
  { name: "N8127P PA-28", id: "ADSB:A78901", signalType: "adsb", deviceType: "General Aviation", manufacturer: "Piper", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "SWA3421 B737 MAX 8", id: "ADSB:AC5678", signalType: "adsb", deviceType: "Commercial Aircraft", manufacturer: "Boeing", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 0 },
  { name: "LifeFlight N911LF", id: "ADSB:A45678", signalType: "adsb", deviceType: "Helicopter", manufacturer: "Airbus H145", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "USAF C-17A", id: "ADSB:AE1234", signalType: "adsb", deviceType: "Military Transport", manufacturer: "Boeing", protocol: "ADS-B 1090ES", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "DJI Mavic 3 Enterprise", id: "ADSB:DJI00123", signalType: "adsb", deviceType: "UAS/Drone", manufacturer: "DJI", protocol: "Remote ID", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 1 },
  { name: "Skydio X10", id: "ADSB:SKY00456", signalType: "adsb", deviceType: "UAS/Drone", manufacturer: "Skydio", protocol: "Remote ID", frequency: 1090000000, channel: null, encryption: "None", resolveDelay: 2 },
];

const SENSOR_DEVICE_POOL: DeviceTemplate[] = [
  { name: "Acurite 5-in-1", id: "SENS:ACU5N1:001", signalType: "sensor", deviceType: "Weather Station", manufacturer: "Acurite", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "LaCrosse TX141TH", id: "SENS:LAC:TX141", signalType: "sensor", deviceType: "Temp/Humidity Sensor", manufacturer: "LaCrosse", protocol: "433MHz FSK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Ambient WS-2902C", id: "SENS:AMB:2902C", signalType: "sensor", deviceType: "Weather Station", manufacturer: "Ambient Weather", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Govee H5075", id: "SENS:GOV:H5075", signalType: "sensor", deviceType: "Temp/Humidity Sensor", manufacturer: "Govee", protocol: "BLE Beacon", frequency: 2402000000, channel: null, encryption: "None", resolveDelay: 3 },
  { name: "Oregon Scientific THR228N", id: "SENS:ORE:THR228", signalType: "sensor", deviceType: "Temp Sensor", manufacturer: "Oregon Scientific", protocol: "433MHz OOK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
  { name: "Ecowitt GW1100", id: "SENS:ECO:GW1100", signalType: "sensor", deviceType: "Sensor Hub", manufacturer: "Ecowitt", protocol: "433MHz FSK", frequency: 433920000, channel: null, encryption: "None", resolveDelay: 2 },
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

function buildPartialNode(template: DeviceTemplate, state: ProgressiveState): DiscoveredNode {
  const seen = state.seenCount.get(template.id) || 0;
  state.seenCount.set(template.id, seen + 1);

  const resolved = seen >= template.resolveDelay;

  if (resolved) {
    return {
      name: template.name,
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
    };
  }

  const oui = template.id.split(":").slice(0, 3).join(":");
  const mfrFromOui = seen >= 1 ? template.manufacturer : "Unknown";
  const nameLabel = mfrFromOui !== "Unknown" ? `${mfrFromOui} Device` : template.id;

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
