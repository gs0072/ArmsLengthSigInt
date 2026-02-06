export interface ServerBroadcastSignature {
  terms: string[];
  signalTypes: string[];
  description: string;
}

export const DEVICE_BROADCAST_SIGNATURES_SERVER: Record<string, ServerBroadcastSignature> = {
  "Apple iPhone": {
    terms: ["iPhone", "Apple Inc.", "Apple, Inc.", "Apple iPhone"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Apple iPhone smartphones"
  },
  "Samsung Galaxy": {
    terms: ["Galaxy", "Samsung", "SM-G", "SM-S", "SM-A", "SM-N", "SAMSUNG"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Samsung Galaxy smartphones"
  },
  "Google Pixel": {
    terms: ["Pixel", "Google Pixel"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Google Pixel smartphones"
  },
  "Apple Watch": {
    terms: ["Apple Watch", "APPLE WATCH"],
    signalTypes: ["bluetooth"],
    description: "Apple Watch smartwatches"
  },
  "Fitbit": {
    terms: ["Fitbit", "Charge", "Versa", "Sense", "FB5"],
    signalTypes: ["bluetooth"],
    description: "Fitbit fitness trackers"
  },
  "Garmin": {
    terms: ["Garmin", "fenix", "Forerunner", "GARMIN"],
    signalTypes: ["bluetooth"],
    description: "Garmin watches and GPS devices"
  },
  "AirPods": {
    terms: ["AirPods", "AirPod"],
    signalTypes: ["bluetooth"],
    description: "Apple AirPods"
  },
  "DJI Mavic": {
    terms: ["DJI", "Mavic", "DJI-Mavic"],
    signalTypes: ["wifi", "sdr"],
    description: "DJI Mavic drones"
  },
  "DJI Mini": {
    terms: ["DJI Mini", "DJI-Mini", "Mavic Mini"],
    signalTypes: ["wifi", "sdr"],
    description: "DJI Mini drones"
  },
  "Apple AirTag": {
    terms: ["AirTag", "Apple AirTag", "Find My"],
    signalTypes: ["bluetooth"],
    description: "Apple AirTag trackers"
  },
  "Tile Tracker": {
    terms: ["Tile", "Tile Mate", "Tile Pro", "Life360"],
    signalTypes: ["bluetooth"],
    description: "Tile Bluetooth trackers"
  },
  "Tesla": {
    terms: ["Tesla", "Tesla Model", "TESLA"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Tesla vehicles"
  },
  "Meshtastic Node": {
    terms: ["Meshtastic", "MESH-", "LongFast", "MediumFast", "Meshcore"],
    signalTypes: ["meshtastic", "lora"],
    description: "Meshtastic mesh nodes"
  },
  "Pacemaker": {
    terms: ["Azure", "Micra", "AVEIR", "BlueSync", "Pacemaker", "Cardiac"],
    signalTypes: ["bluetooth"],
    description: "Cardiac pacemakers"
  },
  "Hearing Aid": {
    terms: ["Phonak", "Oticon", "Signia", "ReSound", "Hearing Aid"],
    signalTypes: ["bluetooth"],
    description: "Hearing aids"
  },
  "Insulin Pump": {
    terms: ["MiniMed", "Omnipod", "Tandem", "t:slim", "Insulin Pump"],
    signalTypes: ["bluetooth"],
    description: "Insulin pumps"
  },
  "CGM Monitor": {
    terms: ["Dexcom", "DXCM", "FreeStyle Libre", "Libre", "CGM"],
    signalTypes: ["bluetooth"],
    description: "Continuous glucose monitors"
  },
};

export function matchDeviceToSignature(
  device: { name?: string | null; manufacturer?: string | null; macAddress?: string | null; deviceType?: string | null; model?: string | null; uuid?: string | null },
  allSignatures: Record<string, ServerBroadcastSignature>
): string | null {
  const fields = [device.name, device.manufacturer, device.macAddress, device.model, device.uuid]
    .filter(Boolean).map(f => f!.toLowerCase());

  if (fields.length === 0) return null;

  for (const [catalogName, sig] of Object.entries(allSignatures)) {
    if (sig.terms.some(term => fields.some(field => field.includes(term.toLowerCase())))) {
      return catalogName;
    }
  }
  return null;
}
