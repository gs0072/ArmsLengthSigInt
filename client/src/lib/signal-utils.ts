import type { Device, Observation } from "@shared/schema";

export const SIGNAL_TYPES = [
  { value: "bluetooth", label: "Bluetooth", color: "hsl(217, 91%, 60%)" },
  { value: "wifi", label: "Wi-Fi", color: "hsl(142, 76%, 48%)" },
  { value: "rfid", label: "RFID", color: "hsl(45, 90%, 55%)" },
  { value: "sdr", label: "SDR", color: "hsl(280, 65%, 55%)" },
  { value: "lora", label: "LoRa", color: "hsl(25, 85%, 55%)" },
  { value: "meshtastic", label: "Meshtastic", color: "hsl(185, 100%, 50%)" },
  { value: "adsb", label: "ADS-B", color: "hsl(0, 72%, 55%)" },
  { value: "sensor", label: "Sensor", color: "hsl(320, 70%, 55%)" },
  { value: "unknown", label: "Unknown", color: "hsl(200, 20%, 50%)" },
] as const;

export function getSignalColor(type: string): string {
  return SIGNAL_TYPES.find(s => s.value === type)?.color || "hsl(200, 20%, 50%)";
}

export function getSignalLabel(type: string): string {
  return SIGNAL_TYPES.find(s => s.value === type)?.label || "Unknown";
}

export function signalStrengthToPercent(rssi: number | null | undefined): number {
  if (!rssi) return 0;
  const clamped = Math.max(-100, Math.min(-20, rssi));
  return Math.round(((clamped + 100) / 80) * 100);
}

export function signalStrengthLabel(rssi: number | null | undefined): string {
  const pct = signalStrengthToPercent(rssi);
  if (pct >= 75) return "Excellent";
  if (pct >= 50) return "Good";
  if (pct >= 25) return "Fair";
  return "Weak";
}

export const DEVICE_CATEGORIES = [
  {
    category: "Mobile Phones",
    items: ["Apple iPhone", "Samsung Galaxy", "Google Pixel", "OnePlus", "Xiaomi", "Huawei", "Motorola", "Sony Xperia", "LG", "Nokia"]
  },
  {
    category: "Wearables",
    items: ["Apple Watch", "Samsung Galaxy Watch", "Fitbit", "Garmin", "Amazfit", "Whoop", "Oura Ring"]
  },
  {
    category: "Medical Devices",
    items: ["Pacemaker", "Hearing Aid", "Insulin Pump", "CGM Monitor", "Pulse Oximeter", "Blood Pressure Monitor"]
  },
  {
    category: "Audio Devices",
    items: ["AirPods", "Galaxy Buds", "Sony WF/WH", "Bose QC", "JBL Speaker", "Sonos", "Marshall Speaker"]
  },
  {
    category: "Computers & Tablets",
    items: ["MacBook", "iPad", "Surface", "Chromebook", "ThinkPad", "Dell XPS"]
  },
  {
    category: "IoT & Smart Home",
    items: ["Amazon Echo", "Google Nest", "Ring Doorbell", "Hue Lights", "Smart Lock", "Smart Thermostat", "Smart Plug"]
  },
  {
    category: "Vehicles",
    items: ["Tesla", "BMW", "Mercedes", "Audi", "Ford", "Toyota", "OBD-II Scanner"]
  },
  {
    category: "Trackers & Tags",
    items: ["Apple AirTag", "Tile Tracker", "Samsung SmartTag", "Chipolo"]
  },
  {
    category: "Drones & UAVs",
    items: ["DJI Mavic", "DJI Mini", "DJI Phantom", "Skydio", "Autel", "Parrot"]
  },
  {
    category: "Radio & SDR",
    items: ["RTL-SDR", "HackRF", "USRP", "Baofeng", "Yaesu", "Icom", "Kenwood"]
  },
  {
    category: "LoRa & Meshtastic",
    items: ["Heltec LoRa", "TTGO T-Beam", "RAK WisBlock", "LilyGO", "Meshtastic Node"]
  },
  {
    category: "Aircraft",
    items: ["Commercial Airliner", "Private Aircraft", "Helicopter", "Military Aircraft"]
  },
  {
    category: "Navigation",
    items: ["Garmin GPS", "TomTom", "Marine AIS Transponder", "EPIRB/PLB"]
  },
  {
    category: "Networking",
    items: ["Wi-Fi Router", "Access Point", "Mesh Node", "Hotspot", "Repeater"]
  }
] as const;

export const NODE_FILTER_CATEGORIES = [
  { key: "bluetooth", label: "Bluetooth", signalTypes: ["bluetooth"], deviceTypes: [] },
  { key: "wifi", label: "Wi-Fi", signalTypes: ["wifi"], deviceTypes: [] },
  { key: "phones", label: "Phones", signalTypes: [], deviceTypes: ["Apple iPhone", "Samsung Galaxy", "Google Pixel", "OnePlus", "Xiaomi", "Huawei", "Motorola", "Sony Xperia", "LG", "Nokia", "Mobile Phone"] },
  { key: "drones", label: "Drones", signalTypes: [], deviceTypes: ["DJI Mavic", "DJI Mini", "DJI Phantom", "Skydio", "Autel", "Parrot", "Drone", "UAV"] },
  { key: "vehicles", label: "Vehicles", signalTypes: [], deviceTypes: ["Tesla", "BMW", "Mercedes", "Audi", "Ford", "Toyota", "OBD-II Scanner", "Vehicle"] },
  { key: "iot", label: "IoT", signalTypes: [], deviceTypes: ["Amazon Echo", "Google Nest", "Ring Doorbell", "Hue Lights", "Smart Lock", "Smart Thermostat", "Smart Plug", "IoT"] },
  { key: "wearables", label: "Wearables", signalTypes: [], deviceTypes: ["Apple Watch", "Samsung Galaxy Watch", "Fitbit", "Garmin", "Amazfit", "Whoop", "Oura Ring", "Wearable"] },
  { key: "trackers", label: "Trackers", signalTypes: [], deviceTypes: ["Apple AirTag", "Tile Tracker", "Samsung SmartTag", "Chipolo", "Tracker", "Tag"] },
  { key: "lora", label: "LoRa", signalTypes: ["lora", "meshtastic"], deviceTypes: [] },
  { key: "sdr", label: "SDR", signalTypes: ["sdr"], deviceTypes: [] },
  { key: "adsb", label: "Aircraft", signalTypes: ["adsb"], deviceTypes: ["Commercial Airliner", "Private Aircraft", "Helicopter", "Military Aircraft"] },
  { key: "audio", label: "Audio", signalTypes: [], deviceTypes: ["AirPods", "Galaxy Buds", "Sony WF/WH", "Bose QC", "JBL Speaker", "Sonos", "Marshall Speaker", "Audio"] },
] as const;

export function formatCoordinates(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "Unknown";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function formatFrequency(freq: number | null | undefined): string {
  if (!freq) return "N/A";
  if (freq >= 1e9) return `${(freq / 1e9).toFixed(3)} GHz`;
  if (freq >= 1e6) return `${(freq / 1e6).toFixed(3)} MHz`;
  if (freq >= 1e3) return `${(freq / 1e3).toFixed(3)} kHz`;
  return `${freq} Hz`;
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "Never";
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
