import { DEVICE_BROADCAST_SIGNATURES_SERVER } from "./signature-matcher";

export interface PassiveSignalHit {
  broadcastName: string;
  macAddress: string;
  signalType: string;
  rssi: number;
  deviceType: string;
  manufacturer: string;
  protocol: string;
  frequency: number | null;
  channel: number | null;
  encryption: string;
  isNewDiscovery: boolean;
}

const OUI_DATABASE: Record<string, string> = {
  "00:1A:7D": "Cyber-Rain", "00:50:C2": "TLS Corporation", "00:1E:C2": "Apple Inc.",
  "3C:22:FB": "Apple Inc.", "A4:83:E7": "Apple Inc.", "F0:18:98": "Apple Inc.",
  "DC:A6:32": "Raspberry Pi", "B8:27:EB": "Raspberry Pi", "E4:5F:01": "Raspberry Pi",
  "00:1A:11": "Google LLC", "54:60:09": "Google LLC", "F4:F5:D8": "Google LLC",
  "CC:2D:B7": "Samsung", "8C:F5:A3": "Samsung", "AC:5F:3E": "Samsung",
  "50:DE:06": "Dell Inc.", "14:FE:B5": "Dell Inc.", "F8:BC:12": "Dell Inc.",
  "60:F2:62": "Lenovo", "98:FA:9B": "Lenovo", "50:7B:9D": "Lenovo",
  "00:23:68": "Intel Corp.", "A4:C4:94": "Intel Corp.", "84:A6:C8": "Intel Corp.",
  "B4:2E:99": "TP-Link", "50:C7:BF": "TP-Link", "60:A4:B7": "TP-Link",
  "C0:25:E9": "TP-Link", "B0:4E:26": "TP-Link",
  "30:B5:C2": "TP-Link", "48:22:54": "TP-Link",
  "44:D9:E7": "Ubiquiti", "DC:9F:DB": "Ubiquiti", "24:A4:3C": "Ubiquiti",
  "78:8A:20": "Ubiquiti", "F0:9F:C2": "Ubiquiti",
  "00:40:96": "Cisco", "00:1B:2B": "Cisco", "FC:5B:39": "Cisco",
  "1C:F2:9A": "Cisco Meraki", "AC:17:02": "Cisco Meraki",
  "88:71:B1": "NETGEAR", "A0:40:A0": "NETGEAR", "9C:3D:CF": "NETGEAR",
  "00:26:F2": "NETGEAR", "C4:04:15": "NETGEAR",
  "40:B0:76": "ASUSTek", "1C:B7:2C": "ASUSTek", "04:D4:C4": "ASUSTek",
  "00:17:88": "Philips Hue", "EC:B5:FA": "Philips Hue",
  "68:EC:C5": "Amazon", "A0:02:DC": "Amazon", "74:C2:46": "Amazon",
  "F0:F0:A4": "Amazon Ring", "34:D2:70": "Amazon Ring",
  "20:DF:B9": "Google Nest", "F4:F5:E8": "Google Nest",
  "00:E0:4C": "Realtek", "80:26:89": "D-Link", "1C:7E:E5": "D-Link",
  "FC:F5:C4": "Espressif (ESP32)", "AC:67:B2": "Espressif (ESP32)",
  "24:0A:C4": "Espressif (ESP32)", "30:AE:A4": "Espressif (ESP32)",
  "EC:94:CB": "Espressif (ESP8266)", "A0:20:A6": "Espressif (ESP8266)",
  "C8:2B:96": "Espressif", "84:CC:A8": "Espressif",
  "00:1B:C5": "IEEE 802.15.4", "00:12:4B": "Texas Instruments (Zigbee)",
  "00:0D:6F": "Ember (Zigbee)", "84:18:26": "Silicon Labs (Z-Wave)",
  "00:0B:57": "Silicon Labs",
  "E0:14:9E": "Heltec (LoRa)", "C0:49:EF": "TTGO/LilyGO (LoRa)",
  "70:B3:D5": "RAKwireless (LoRa)", "AC:1F:09": "RAKwireless",
  "38:F7:3D": "Sonos", "5C:AA:FD": "Sonos", "B8:E9:37": "Sonos",
  "04:5D:4B": "Sony", "FC:0F:E6": "Sony", "00:1D:BA": "Sony",
  "2C:41:A1": "Bose", "04:52:C7": "Bose", "60:AB:D2": "Bose",
  "28:ED:E0": "AVM (Fritz!Box)", "C8:0E:14": "AVM (Fritz!Box)",
  "00:1F:F3": "Apple (AirPort)", "68:5B:35": "Apple (AirPort)",
  "A8:51:5B": "Samsung Galaxy", "E4:7D:BD": "Samsung Galaxy",
  "18:3E:EF": "Shenzhen Bilian", "2C:D0:5A": "Shenzhen Bilian",
  "98:DA:C4": "TP-Link (Kasa)", "B0:95:75": "TP-Link (Tapo)",
  "70:3A:CB": "Google (Chromecast)", "6C:AD:F8": "AzureWave",
  "F4:39:09": "Hon Hai / Foxconn", "90:CD:B6": "Hon Hai / Foxconn",
  "00:13:A2": "Digi International (XBee)", "00:80:E1": "STMicroelectronics",
  "B0:B2:1C": "Withings", "00:24:E4": "Withings",
  "00:17:EC": "Texas Instruments (BLE)", "98:7B:F3": "Texas Instruments",
  "C4:BE:84": "Espressif (Tuya)", "D8:F1:5B": "Espressif (Tuya)",
};

const WIFI_CHANNELS: Record<number, number> = {
  1: 2412, 2: 2417, 3: 2422, 4: 2427, 5: 2432, 6: 2437,
  7: 2442, 8: 2447, 9: 2452, 10: 2457, 11: 2462,
  36: 5180, 40: 5200, 44: 5220, 48: 5240,
  149: 5745, 153: 5765, 157: 5785, 161: 5805,
};

const BLE_FREQ = 2402;
const LORA_FREQS = [868.0, 868.1, 868.3, 869.525, 915.0, 916.8, 903.9, 906.1];
const ADSB_FREQ = 1090;
const RFID_FREQS = [125, 134.2, 13.56, 860, 928];

interface DeviceTemplate {
  name: string;
  broadcastNames: string[];
  signalType: string;
  manufacturer: string;
  deviceType: string;
  protocol: string;
  encryption: string;
  ouiPrefixes: string[];
  frequency: number | null;
  rssiRange: [number, number];
  weight: number;
}

function buildDeviceTemplates(): DeviceTemplate[] {
  const templates: DeviceTemplate[] = [];

  const signatureConfigs: Record<string, {
    signalType: string; protocol: string; encryption: string;
    frequency: number | null; rssiRange: [number, number]; weight: number;
    ouiPrefixes: string[];
  }> = {
    "Apple iPhone": { signalType: "bluetooth", protocol: "BLE 5.0", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-50, -85], weight: 12, ouiPrefixes: ["3C:22:FB", "A4:83:E7", "F0:18:98", "00:1E:C2"] },
    "Samsung Galaxy": { signalType: "bluetooth", protocol: "BLE 5.3", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-48, -88], weight: 10, ouiPrefixes: ["CC:2D:B7", "8C:F5:A3", "AC:5F:3E"] },
    "Google Pixel": { signalType: "bluetooth", protocol: "BLE 5.3", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-52, -86], weight: 5, ouiPrefixes: ["00:1A:11", "54:60:09"] },
    "Apple Watch": { signalType: "bluetooth", protocol: "BLE 5.3", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-55, -90], weight: 6, ouiPrefixes: ["3C:22:FB", "A4:83:E7"] },
    "Fitbit": { signalType: "bluetooth", protocol: "BLE 5.0", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-60, -92], weight: 4, ouiPrefixes: [] },
    "Garmin": { signalType: "bluetooth", protocol: "BLE 4.2 / ANT+", encryption: "None", frequency: BLE_FREQ, rssiRange: [-58, -90], weight: 4, ouiPrefixes: [] },
    "AirPods": { signalType: "bluetooth", protocol: "BLE 5.3", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-50, -78], weight: 8, ouiPrefixes: ["3C:22:FB", "A4:83:E7"] },
    "Galaxy Buds": { signalType: "bluetooth", protocol: "BLE 5.3", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-52, -80], weight: 5, ouiPrefixes: ["CC:2D:B7"] },
    "Sony WF/WH": { signalType: "bluetooth", protocol: "BLE 5.2 / LDAC", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-50, -82], weight: 4, ouiPrefixes: ["04:5D:4B", "FC:0F:E6"] },
    "Bose QC": { signalType: "bluetooth", protocol: "BLE 5.1", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-48, -80], weight: 3, ouiPrefixes: ["2C:41:A1", "04:52:C7"] },
    "JBL Speaker": { signalType: "bluetooth", protocol: "BLE 5.1", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-45, -78], weight: 3, ouiPrefixes: [] },
    "Pacemaker": { signalType: "bluetooth", protocol: "BLE 4.2 MICS", encryption: "AES-128", frequency: BLE_FREQ, rssiRange: [-75, -98], weight: 1, ouiPrefixes: [] },
    "Hearing Aid": { signalType: "bluetooth", protocol: "BLE 5.2 ASHA", encryption: "AES-CCM", frequency: BLE_FREQ, rssiRange: [-60, -88], weight: 2, ouiPrefixes: [] },
    "Insulin Pump": { signalType: "bluetooth", protocol: "BLE 4.2", encryption: "AES-128", frequency: BLE_FREQ, rssiRange: [-70, -95], weight: 1, ouiPrefixes: [] },
    "CGM Monitor": { signalType: "bluetooth", protocol: "BLE 5.0", encryption: "AES-128", frequency: BLE_FREQ, rssiRange: [-62, -90], weight: 2, ouiPrefixes: [] },
    "Apple AirTag": { signalType: "bluetooth", protocol: "BLE 5.0 / UWB", encryption: "Rotating Keys", frequency: BLE_FREQ, rssiRange: [-58, -92], weight: 5, ouiPrefixes: ["3C:22:FB"] },
    "Tile Tracker": { signalType: "bluetooth", protocol: "BLE 5.0", encryption: "AES-128", frequency: BLE_FREQ, rssiRange: [-55, -88], weight: 3, ouiPrefixes: [] },
    "Samsung SmartTag": { signalType: "bluetooth", protocol: "BLE 5.0 / UWB", encryption: "AES-128", frequency: BLE_FREQ, rssiRange: [-58, -90], weight: 2, ouiPrefixes: ["CC:2D:B7"] },
    "Tesla": { signalType: "bluetooth", protocol: "BLE 5.0 Phone Key", encryption: "TLS 1.3", frequency: BLE_FREQ, rssiRange: [-55, -85], weight: 3, ouiPrefixes: [] },
    "OBD-II Scanner": { signalType: "bluetooth", protocol: "BLE / SPP", encryption: "None", frequency: BLE_FREQ, rssiRange: [-40, -70], weight: 2, ouiPrefixes: [] },
    "MacBook": { signalType: "wifi", protocol: "802.11ax (Wi-Fi 6)", encryption: "WPA3", frequency: 5180, rssiRange: [-40, -75], weight: 6, ouiPrefixes: ["3C:22:FB", "A4:83:E7", "F0:18:98"] },
    "iPad": { signalType: "wifi", protocol: "802.11ax (Wi-Fi 6E)", encryption: "WPA3", frequency: 5180, rssiRange: [-42, -78], weight: 4, ouiPrefixes: ["3C:22:FB", "A4:83:E7"] },
    "Surface": { signalType: "wifi", protocol: "802.11ax (Wi-Fi 6)", encryption: "WPA2", frequency: 5200, rssiRange: [-45, -80], weight: 2, ouiPrefixes: [] },
    "ThinkPad": { signalType: "wifi", protocol: "802.11ax (Wi-Fi 6E)", encryption: "WPA2-Enterprise", frequency: 5220, rssiRange: [-42, -78], weight: 3, ouiPrefixes: ["60:F2:62", "98:FA:9B"] },
    "Dell XPS": { signalType: "wifi", protocol: "802.11ax (Wi-Fi 6)", encryption: "WPA2", frequency: 5240, rssiRange: [-44, -80], weight: 2, ouiPrefixes: ["50:DE:06", "14:FE:B5"] },
    "Wi-Fi Router": { signalType: "wifi", protocol: "802.11ax (Wi-Fi 6)", encryption: "WPA3", frequency: 2437, rssiRange: [-30, -60], weight: 5, ouiPrefixes: ["B4:2E:99", "88:71:B1", "40:B0:76"] },
    "Access Point": { signalType: "wifi", protocol: "802.11ac (Wi-Fi 5)", encryption: "WPA2-Enterprise", frequency: 5745, rssiRange: [-35, -65], weight: 3, ouiPrefixes: ["44:D9:E7", "DC:9F:DB", "FC:5B:39"] },
    "Amazon Echo": { signalType: "wifi", protocol: "802.11ac (Wi-Fi 5)", encryption: "WPA2", frequency: 2412, rssiRange: [-40, -72], weight: 4, ouiPrefixes: ["68:EC:C5", "A0:02:DC"] },
    "Google Nest": { signalType: "wifi", protocol: "802.11ac (Wi-Fi 5)", encryption: "WPA2", frequency: 2422, rssiRange: [-42, -74], weight: 3, ouiPrefixes: ["20:DF:B9"] },
    "Ring Doorbell": { signalType: "wifi", protocol: "802.11n (Wi-Fi 4)", encryption: "WPA2", frequency: 2432, rssiRange: [-50, -78], weight: 3, ouiPrefixes: ["F0:F0:A4", "34:D2:70"] },
    "Hue Lights": { signalType: "wifi", protocol: "Zigbee 3.0 / BLE", encryption: "AES-128", frequency: 2405, rssiRange: [-55, -85], weight: 2, ouiPrefixes: ["00:17:88", "EC:B5:FA"] },
    "Smart Lock": { signalType: "bluetooth", protocol: "BLE 5.0", encryption: "AES-256", frequency: BLE_FREQ, rssiRange: [-50, -82], weight: 2, ouiPrefixes: [] },
    "Smart Thermostat": { signalType: "wifi", protocol: "802.11n (Wi-Fi 4)", encryption: "WPA2", frequency: 2442, rssiRange: [-48, -76], weight: 2, ouiPrefixes: ["20:DF:B9"] },
    "Smart Plug": { signalType: "wifi", protocol: "802.11n (Wi-Fi 4)", encryption: "WPA2", frequency: 2447, rssiRange: [-50, -78], weight: 3, ouiPrefixes: ["98:DA:C4", "B0:95:75", "FC:F5:C4"] },
    "DJI Mavic": { signalType: "wifi", protocol: "OcuSync 3.0 / Wi-Fi 6", encryption: "AES-256", frequency: 5785, rssiRange: [-45, -80], weight: 2, ouiPrefixes: [] },
    "DJI Mini": { signalType: "wifi", protocol: "OcuSync 2.0 / Wi-Fi", encryption: "AES-256", frequency: 5805, rssiRange: [-48, -82], weight: 2, ouiPrefixes: [] },
    "Heltec LoRa": { signalType: "lora", protocol: "LoRa SF7-SF12", encryption: "AES-128", frequency: 915.0, rssiRange: [-90, -130], weight: 2, ouiPrefixes: ["E0:14:9E"] },
    "TTGO T-Beam": { signalType: "lora", protocol: "LoRa SF7-SF12", encryption: "AES-128", frequency: 915.0, rssiRange: [-88, -128], weight: 2, ouiPrefixes: ["C0:49:EF"] },
    "RAK WisBlock": { signalType: "lora", protocol: "LoRaWAN 1.0.4", encryption: "AES-128", frequency: 868.1, rssiRange: [-92, -132], weight: 1, ouiPrefixes: ["70:B3:D5"] },
    "Meshtastic Node": { signalType: "meshtastic", protocol: "Meshtastic / LoRa LongFast", encryption: "AES-256 PSK", frequency: 906.875, rssiRange: [-85, -130], weight: 3, ouiPrefixes: ["E0:14:9E", "C0:49:EF", "70:B3:D5"] },
    "Commercial Airliner": { signalType: "adsb", protocol: "ADS-B 1090ES", encryption: "None", frequency: 1090, rssiRange: [-60, -95], weight: 4, ouiPrefixes: [] },
    "Private Aircraft": { signalType: "adsb", protocol: "ADS-B 1090ES", encryption: "None", frequency: 1090, rssiRange: [-55, -90], weight: 2, ouiPrefixes: [] },
    "Helicopter": { signalType: "adsb", protocol: "ADS-B 1090ES / Mode S", encryption: "None", frequency: 1090, rssiRange: [-50, -85], weight: 1, ouiPrefixes: [] },
    "Sonos": { signalType: "wifi", protocol: "802.11ac (Wi-Fi 5)", encryption: "WPA2", frequency: 5180, rssiRange: [-42, -72], weight: 2, ouiPrefixes: ["38:F7:3D", "5C:AA:FD"] },
    "Hotspot": { signalType: "wifi", protocol: "802.11ac LTE", encryption: "WPA2", frequency: 2452, rssiRange: [-45, -75], weight: 2, ouiPrefixes: [] },
    "Raspberry Pi": { signalType: "wifi", protocol: "802.11n (Wi-Fi 4)", encryption: "WPA2", frequency: 2437, rssiRange: [-48, -80], weight: 2, ouiPrefixes: ["DC:A6:32", "B8:27:EB", "E4:5F:01"] },
  };

  for (const [deviceName, config] of Object.entries(signatureConfigs)) {
    const sig = DEVICE_BROADCAST_SIGNATURES_SERVER[deviceName];
    const broadcastNames = sig
      ? sig.terms.slice(0, 5)
      : [deviceName];

    templates.push({
      name: deviceName,
      broadcastNames,
      signalType: config.signalType,
      manufacturer: getManufacturerForDevice(deviceName),
      deviceType: deviceName,
      protocol: config.protocol,
      encryption: config.encryption,
      ouiPrefixes: config.ouiPrefixes,
      frequency: config.frequency,
      rssiRange: config.rssiRange,
      weight: config.weight,
    });
  }

  return templates;
}

function getManufacturerForDevice(deviceName: string): string {
  const mfrs: Record<string, string> = {
    "Apple iPhone": "Apple Inc.", "Samsung Galaxy": "Samsung Electronics",
    "Google Pixel": "Google LLC", "Apple Watch": "Apple Inc.",
    "Fitbit": "Fitbit (Google)", "Garmin": "Garmin Ltd.",
    "AirPods": "Apple Inc.", "Galaxy Buds": "Samsung Electronics",
    "Sony WF/WH": "Sony Corporation", "Bose QC": "Bose Corporation",
    "JBL Speaker": "Harman / JBL", "Pacemaker": "Medtronic / Abbott",
    "Hearing Aid": "Sonova / Demant", "Insulin Pump": "Medtronic / Insulet",
    "CGM Monitor": "Dexcom / Abbott", "Apple AirTag": "Apple Inc.",
    "Tile Tracker": "Life360 (Tile)", "Samsung SmartTag": "Samsung Electronics",
    "Tesla": "Tesla Inc.", "OBD-II Scanner": "ELM Electronics",
    "MacBook": "Apple Inc.", "iPad": "Apple Inc.",
    "Surface": "Microsoft Corp.", "ThinkPad": "Lenovo",
    "Dell XPS": "Dell Technologies", "Wi-Fi Router": "Various",
    "Access Point": "Ubiquiti / Cisco", "Amazon Echo": "Amazon.com",
    "Google Nest": "Google LLC", "Ring Doorbell": "Amazon Ring",
    "Hue Lights": "Signify (Philips)", "Smart Lock": "August / Yale",
    "Smart Thermostat": "Google Nest / ecobee", "Smart Plug": "TP-Link (Kasa)",
    "DJI Mavic": "DJI Technology", "DJI Mini": "DJI Technology",
    "Heltec LoRa": "Heltec Automation", "TTGO T-Beam": "LilyGO / TTGO",
    "RAK WisBlock": "RAKwireless", "Meshtastic Node": "Open Source / Various",
    "Commercial Airliner": "Boeing / Airbus", "Private Aircraft": "Cessna / Piper",
    "Helicopter": "Bell / Airbus Heli", "Sonos": "Sonos Inc.",
    "Hotspot": "Various", "Raspberry Pi": "Raspberry Pi Foundation",
  };
  return mfrs[deviceName] || "Unknown";
}

function generateMac(ouiPrefixes: string[]): string {
  const oui = ouiPrefixes.length > 0
    ? ouiPrefixes[Math.floor(Math.random() * ouiPrefixes.length)]
    : `${randHex()}:${randHex()}:${randHex()}`;
  return `${oui}:${randHex()}:${randHex()}:${randHex()}`;
}

function randHex(): string {
  return Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase();
}

function generateICAO(): string {
  const chars = "0123456789ABCDEF";
  let icao = "";
  for (let i = 0; i < 6; i++) icao += chars[Math.floor(Math.random() * chars.length)];
  return icao;
}

function generateBroadcastName(template: DeviceTemplate): string {
  const names = template.broadcastNames;
  const baseName = names[Math.floor(Math.random() * names.length)];

  if (template.signalType === "adsb") {
    const callsigns: Record<string, string[]> = {
      "Commercial Airliner": ["AAL", "UAL", "DAL", "SWA", "JBU", "ASA", "FFT", "NKS", "SKW", "RPA"],
      "Private Aircraft": ["N"],
      "Helicopter": ["LIF", "MED", "POL", "N"],
    };
    const prefixes = callsigns[template.name] || ["N"];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    if (prefix === "N") {
      return `N${100 + Math.floor(Math.random() * 9900)}${["", "A", "B", "C", "D", "E", "F"][Math.floor(Math.random() * 7)]}`;
    }
    return `${prefix}${100 + Math.floor(Math.random() * 9000)}`;
  }

  if (template.signalType === "meshtastic") {
    const meshNames = ["!da7e", "!f309", "!b12c", "!e8a4", "!c73f", "!a295", "!9d1b", "!4e82"];
    const meshBase = meshNames[Math.floor(Math.random() * meshNames.length)];
    return `Meshtastic ${meshBase}`;
  }

  if (template.signalType === "lora") {
    return `${baseName}-${randHex()}${randHex()}`;
  }

  const suffixChance = Math.random();
  if (suffixChance < 0.3) {
    return baseName;
  } else if (suffixChance < 0.6) {
    const suffix = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
    return `${baseName} ${suffix}`;
  } else {
    const personalNames = [
      "John's", "Sarah's", "Mike's", "Emma's", "David's", "Lisa's",
      "Chris's", "Alex's", "Sam's", "Jamie's", "Taylor's", "Jordan's",
      "Riley's", "Morgan's", "Casey's", "Pat's", "Drew's", "Robin's",
    ];
    const owner = personalNames[Math.floor(Math.random() * personalNames.length)];
    return `${owner} ${baseName}`;
  }
}

const templates = buildDeviceTemplates();
const totalWeight = templates.reduce((sum, t) => sum + t.weight, 0);

function pickRandomTemplate(): DeviceTemplate {
  let r = Math.random() * totalWeight;
  for (const t of templates) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return templates[templates.length - 1];
}

export interface PassiveScanConfig {
  signalTypes?: string[];
  maxSignals?: number;
  scanDurationMs?: number;
}

export function runPassiveScan(config: PassiveScanConfig = {}): PassiveSignalHit[] {
  const {
    signalTypes,
    maxSignals = 3 + Math.floor(Math.random() * 5),
  } = config;

  const hits: PassiveSignalHit[] = [];
  const usedMacs = new Set<string>();
  const filteredTemplates = signalTypes
    ? templates.filter(t => signalTypes.includes(t.signalType))
    : templates;

  if (filteredTemplates.length === 0) return [];

  const filteredWeight = filteredTemplates.reduce((sum, t) => sum + t.weight, 0);

  for (let i = 0; i < maxSignals; i++) {
    let r = Math.random() * filteredWeight;
    let template = filteredTemplates[filteredTemplates.length - 1];
    for (const t of filteredTemplates) {
      r -= t.weight;
      if (r <= 0) { template = t; break; }
    }

    const mac = template.signalType === "adsb"
      ? generateICAO()
      : generateMac(template.ouiPrefixes);

    if (usedMacs.has(mac)) continue;
    usedMacs.add(mac);

    const [rssiMin, rssiMax] = template.rssiRange;
    const rssi = rssiMin + Math.floor(Math.random() * (rssiMax - rssiMin));

    const broadcastName = generateBroadcastName(template);

    let freq = template.frequency;
    if (template.signalType === "wifi" && !freq) {
      const channels = Object.keys(WIFI_CHANNELS).map(Number);
      const ch = channels[Math.floor(Math.random() * channels.length)];
      freq = WIFI_CHANNELS[ch];
    }
    if (template.signalType === "lora" && !freq) {
      freq = LORA_FREQS[Math.floor(Math.random() * LORA_FREQS.length)];
    }

    let channel: number | null = null;
    if (template.signalType === "wifi" && freq) {
      const entry = Object.entries(WIFI_CHANNELS).find(([_, f]) => f === freq);
      if (entry) channel = parseInt(entry[0]);
    }

    const ouiPrefix = mac.split(":").slice(0, 3).join(":");
    const ouiMfr = OUI_DATABASE[ouiPrefix];
    const manufacturer = ouiMfr || template.manufacturer;

    hits.push({
      broadcastName,
      macAddress: mac,
      signalType: template.signalType,
      rssi,
      deviceType: template.deviceType,
      manufacturer,
      protocol: template.protocol,
      frequency: freq ? freq * (freq < 10000 ? 1e6 : 1) : null,
      channel,
      encryption: template.encryption,
      isNewDiscovery: true,
    });
  }

  return hits;
}

export function lookupOUI(mac: string): string | null {
  const prefix = mac.split(":").slice(0, 3).join(":");
  return OUI_DATABASE[prefix] || null;
}
