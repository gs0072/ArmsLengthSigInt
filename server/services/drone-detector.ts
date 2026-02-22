import { generateRealisticSpectrum } from "./sdr-service";

export interface DroneRFProfile {
  name: string;
  manufacturer: string;
  controlFreqMHz: number[];
  videoFreqMHz: number[];
  bandwidthKHz: number;
  protocol: string;
  signalCharacteristics: string;
  threatLevel: "info" | "low" | "medium" | "high" | "critical";
}

export const DRONE_RF_PROFILES: DroneRFProfile[] = [
  { name: "DJI OcuSync", manufacturer: "DJI", controlFreqMHz: [2400, 2410, 2420, 2430, 2440, 2450, 2460, 2470, 2480, 5725, 5745, 5765, 5785, 5805, 5825], videoFreqMHz: [5725, 5745, 5765, 5785, 5805, 5825], bandwidthKHz: 10000, protocol: "OcuSync 2.0/3.0", signalCharacteristics: "OFDM with frequency hopping, 10-40 MHz bandwidth, distinctive spectral shape", threatLevel: "low" },
  { name: "DJI Enhanced WiFi", manufacturer: "DJI", controlFreqMHz: [2412, 2437, 2462, 5180, 5200, 5220, 5240, 5745, 5765, 5785, 5805], videoFreqMHz: [2412, 2437, 2462, 5745, 5765, 5785], bandwidthKHz: 20000, protocol: "Enhanced WiFi", signalCharacteristics: "802.11 based, wider bandwidth than standard WiFi", threatLevel: "low" },
  { name: "DJI Remote ID", manufacturer: "DJI", controlFreqMHz: [2402, 2426, 2480], videoFreqMHz: [], bandwidthKHz: 2000, protocol: "BLE 5.0 / WiFi NaN RemoteID", signalCharacteristics: "BLE advertising packets on channels 37/38/39, periodic broadcast", threatLevel: "info" },
  { name: "Skydio WiFi Direct", manufacturer: "Skydio", controlFreqMHz: [2412, 2437, 2462, 5180, 5200, 5220], videoFreqMHz: [5180, 5200, 5220, 5240], bandwidthKHz: 20000, protocol: "WiFi Direct", signalCharacteristics: "Standard 802.11ac WiFi, high throughput video stream", threatLevel: "low" },
  { name: "Autel SkyLink", manufacturer: "Autel", controlFreqMHz: [2400, 2420, 2440, 2460, 2480, 5725, 5750, 5775, 5800], videoFreqMHz: [5725, 5750, 5775, 5800], bandwidthKHz: 20000, protocol: "SkyLink", signalCharacteristics: "Proprietary FHSS control with OFDM video", threatLevel: "low" },
  { name: "ELRS Control", manufacturer: "Generic FPV", controlFreqMHz: [915, 868, 2400, 2420, 2440, 2460, 2480], videoFreqMHz: [], bandwidthKHz: 500, protocol: "ExpressLRS", signalCharacteristics: "LoRa-based narrow control link, low power, frequency hopping", threatLevel: "medium" },
  { name: "Crossfire/TBS", manufacturer: "TBS", controlFreqMHz: [868, 915], videoFreqMHz: [], bandwidthKHz: 500, protocol: "TBS Crossfire", signalCharacteristics: "Long range 868/915 MHz control, narrow bandwidth LoRa", threatLevel: "medium" },
  { name: "Analog FPV Video", manufacturer: "Generic FPV", controlFreqMHz: [], videoFreqMHz: [5740, 5760, 5780, 5800, 5820, 5840, 5860, 5880, 5900, 5920], bandwidthKHz: 18000, protocol: "Analog NTSC/PAL", signalCharacteristics: "Continuous analog FM video carrier, distinctive on spectrum", threatLevel: "medium" },
  { name: "DJI Digital FPV", manufacturer: "DJI", controlFreqMHz: [2400, 2420, 2440, 2460], videoFreqMHz: [5725, 5745, 5765, 5785, 5805, 5825, 5845, 5865], bandwidthKHz: 20000, protocol: "DJI O3/O4", signalCharacteristics: "OFDM digital video, 20-40 MHz bandwidth, high power", threatLevel: "low" },
  { name: "Generic Drone 900MHz", manufacturer: "Unknown", controlFreqMHz: [900, 903, 906, 910, 915, 920, 925, 928], videoFreqMHz: [], bandwidthKHz: 1000, protocol: "Unknown 900MHz", signalCharacteristics: "Unidentified 900 MHz control signal in ISM band", threatLevel: "high" },
  { name: "Military/Modified UAS", manufacturer: "Unknown", controlFreqMHz: [400, 450, 900, 1200, 1300, 2400], videoFreqMHz: [1200, 1300, 2400], bandwidthKHz: 5000, protocol: "Unknown/Custom", signalCharacteristics: "Non-standard frequencies, possible modified or military drone", threatLevel: "critical" },
];

export const DRONE_FREQUENCY_BANDS = [
  { name: "900 MHz ISM", startMHz: 860, endMHz: 930, category: "control", description: "Long-range drone control (ELRS, Crossfire, some DJI)" },
  { name: "1.2 GHz", startMHz: 1200, endMHz: 1350, category: "video", description: "Legacy analog FPV video" },
  { name: "2.4 GHz ISM", startMHz: 2390, endMHz: 2490, category: "control+video", description: "Primary drone control and WiFi (most drones)" },
  { name: "5.8 GHz ISM", startMHz: 5650, endMHz: 5930, category: "video+control", description: "FPV video and OcuSync control" },
];

export interface DroneDetectionResult {
  id: string;
  timestamp: number;
  signalSources: DroneSignalSource[];
  bestMatch: DroneRFProfile | null;
  overallConfidence: number;
  threatLevel: string;
  estimatedDistanceM: number | null;
  signalDirection: "approaching" | "receding" | "hovering" | "unknown";
  rssiHistory: { time: number; rssi: number }[];
  flightPath: { lat: number; lng: number; alt: number; time: number }[];
  fusionScore: number;
  notes: string;
}

export interface DroneSignalSource {
  type: "sdr" | "wifi" | "bluetooth" | "remoteid";
  frequencyMHz: number;
  rssi: number;
  bandwidth: number;
  identifier: string;
  matchedProfile: string | null;
  confidence: number;
  timestamp: number;
}

export function estimateDistanceFSPL(rssiDbm: number, frequencyMHz: number, txPowerDbm: number = 20): number {
  const pathLoss = txPowerDbm - rssiDbm;
  const distanceM = Math.pow(10, (pathLoss - 20 * Math.log10(frequencyMHz) - 32.44) / 20) * 1000;
  return Math.max(1, Math.min(50000, distanceM));
}

export function determineMovementDirection(rssiHistory: { time: number; rssi: number }[]): "approaching" | "receding" | "hovering" | "unknown" {
  if (rssiHistory.length < 3) return "unknown";
  const recent = rssiHistory.slice(-5);
  const diffs: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    diffs.push(recent[i].rssi - recent[i - 1].rssi);
  }
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  if (avgDiff > 1) return "approaching";
  if (avgDiff < -1) return "receding";
  return "hovering";
}

export function scanDroneBands(mode: "simulation" | "server" = "simulation"): {
  band: string;
  signals: Array<{ frequency: number; power: number; bandwidth: number; modulation: string; timestamp: number }>;
}[] {
  const results: ReturnType<typeof scanDroneBands> = [];

  for (const band of DRONE_FREQUENCY_BANDS) {
    if (mode === "simulation") {
      const signals = generateRealisticSpectrum(band.startMHz, band.endMHz);
      results.push({
        band: band.name,
        signals: signals.map(s => ({
          frequency: s.frequency,
          power: s.power,
          bandwidth: s.bandwidth,
          modulation: s.modulation,
          timestamp: Date.now(),
        })),
      });
    } else {
      results.push({
        band: band.name,
        signals: generateRealisticSpectrum(band.startMHz, band.endMHz).map(s => ({
          frequency: s.frequency,
          power: s.power,
          bandwidth: s.bandwidth,
          modulation: s.modulation,
          timestamp: Date.now(),
        })),
      });
    }
  }

  return results;
}

export function analyzeForDrones(
  sdrSignals: Array<{ frequency: number; power: number; bandwidth: number; modulation: string; timestamp: number }>[],
  wifiDevices: Array<{ name: string; macAddress: string; rssi: number; signalType: string; frequency?: string; manufacturer?: string }>,
  bleDevices: Array<{ name: string; macAddress: string; rssi: number; signalType: string; manufacturer?: string }>,
  existingDetections: DroneDetectionResult[] = [],
): DroneDetectionResult[] {
  const detections: DroneDetectionResult[] = [];
  const now = Date.now();

  for (let bandIdx = 0; bandIdx < sdrSignals.length; bandIdx++) {
    const bandSignals = sdrSignals[bandIdx];
    const strongSignals = bandSignals.filter(s => s.power > -55);

    for (const sig of strongSignals) {
      const freqMHz = sig.frequency / 1e6;
      let bestProfile: DroneRFProfile | null = null;
      let bestConfidence = 0;

      for (const profile of DRONE_RF_PROFILES) {
        const allFreqs = [...profile.controlFreqMHz, ...profile.videoFreqMHz];
        for (const pf of allFreqs) {
          const freqDist = Math.abs(freqMHz - pf);
          if (freqDist < (profile.bandwidthKHz / 1000)) {
            let conf = 0.4 + (1 - freqDist / (profile.bandwidthKHz / 1000)) * 0.3;
            if (sig.power > -40) conf += 0.15;
            if (sig.power > -30) conf += 0.1;
            if (conf > bestConfidence) {
              bestConfidence = conf;
              bestProfile = profile;
            }
          }
        }
      }

      if (bestProfile && bestConfidence > 0.35) {
        const existingDet = existingDetections.find(d => {
          return d.signalSources.some(ss =>
            Math.abs(ss.frequencyMHz - freqMHz) < 5 && ss.type === "sdr"
          );
        });

        const distanceM = estimateDistanceFSPL(sig.power, freqMHz);
        const rssiEntry = { time: now, rssi: sig.power };

        if (existingDet) {
          existingDet.rssiHistory.push(rssiEntry);
          if (existingDet.rssiHistory.length > 60) existingDet.rssiHistory = existingDet.rssiHistory.slice(-60);
          existingDet.signalDirection = determineMovementDirection(existingDet.rssiHistory);
          existingDet.estimatedDistanceM = distanceM;
          existingDet.timestamp = now;
          if (bestConfidence > existingDet.overallConfidence) {
            existingDet.overallConfidence = bestConfidence;
            existingDet.bestMatch = bestProfile;
          }
        } else {
          const detection: DroneDetectionResult = {
            id: `drone-sdr-${freqMHz.toFixed(0)}-${now.toString(36)}`,
            timestamp: now,
            signalSources: [{
              type: "sdr",
              frequencyMHz: freqMHz,
              rssi: sig.power,
              bandwidth: sig.bandwidth,
              identifier: `SDR ${freqMHz.toFixed(3)} MHz`,
              matchedProfile: bestProfile.name,
              confidence: bestConfidence,
              timestamp: now,
            }],
            bestMatch: bestProfile,
            overallConfidence: bestConfidence,
            threatLevel: bestProfile.threatLevel,
            estimatedDistanceM: distanceM,
            signalDirection: "unknown",
            rssiHistory: [rssiEntry],
            flightPath: [],
            fusionScore: 1,
            notes: `SDR detection: ${bestProfile.name} (${bestProfile.protocol}) at ${freqMHz.toFixed(3)} MHz, ${sig.power.toFixed(1)} dBm`,
          };
          detections.push(detection);
        }
      }
    }
  }

  const droneWifiPatterns = [
    /dji/i, /mavic/i, /phantom/i, /inspire/i, /avata/i, /fpv/i,
    /skydio/i, /autel/i, /evo/i, /parrot/i, /anafi/i,
    /drone/i, /uav/i, /uas/i, /remote.?id/i, /rid[-_]/i,
  ];
  const droneOuiPrefixes = [
    "60:60:1F", "34:D2:62", "A0:14:3D", "48:1C:B9",
    "68:3A:48", "E4:7C:F9", "C0:14:B8",
  ];

  for (const device of wifiDevices) {
    const nameMatch = droneWifiPatterns.some(p => p.test(device.name || ""));
    const ouiMatch = droneOuiPrefixes.some(oui => (device.macAddress || "").toUpperCase().startsWith(oui));
    const mfgMatch = droneWifiPatterns.some(p => p.test(device.manufacturer || ""));

    if (nameMatch || ouiMatch || mfgMatch) {
      let confidence = 0.3;
      if (nameMatch) confidence += 0.35;
      if (ouiMatch) confidence += 0.25;
      if (mfgMatch) confidence += 0.2;
      confidence = Math.min(0.95, confidence);

      let matchedProfile: DroneRFProfile | null = null;
      for (const profile of DRONE_RF_PROFILES) {
        if (profile.protocol.toLowerCase().includes("wifi") ||
            (device.name && device.name.toLowerCase().includes(profile.manufacturer.toLowerCase()))) {
          matchedProfile = profile;
          break;
        }
      }

      const freqMHz = device.frequency ? parseFloat(device.frequency) || 2437 : 2437;
      const distanceM = estimateDistanceFSPL(device.rssi, freqMHz);

      const existingIdx = detections.findIndex(d =>
        d.signalSources.some(ss => ss.identifier.includes(device.macAddress || "NONE"))
      );

      if (existingIdx >= 0) {
        detections[existingIdx].signalSources.push({
          type: "wifi",
          frequencyMHz: freqMHz,
          rssi: device.rssi,
          bandwidth: 20000,
          identifier: `WiFi ${device.name || device.macAddress}`,
          matchedProfile: matchedProfile?.name || null,
          confidence,
          timestamp: now,
        });
        detections[existingIdx].fusionScore += 1;
        detections[existingIdx].overallConfidence = Math.min(0.98, detections[existingIdx].overallConfidence + 0.15);
      } else {
        const existingSdrMatch = detections.find(d =>
          d.estimatedDistanceM !== null &&
          Math.abs(d.estimatedDistanceM - distanceM) < 100 &&
          d.signalSources[0]?.type === "sdr"
        );

        if (existingSdrMatch) {
          existingSdrMatch.signalSources.push({
            type: "wifi",
            frequencyMHz: freqMHz,
            rssi: device.rssi,
            bandwidth: 20000,
            identifier: `WiFi ${device.name || device.macAddress}`,
            matchedProfile: matchedProfile?.name || null,
            confidence,
            timestamp: now,
          });
          existingSdrMatch.fusionScore += 1;
          existingSdrMatch.overallConfidence = Math.min(0.98, existingSdrMatch.overallConfidence + 0.2);
          existingSdrMatch.notes += ` | WiFi corroboration: ${device.name || device.macAddress}`;
        } else {
          detections.push({
            id: `drone-wifi-${(device.macAddress || now).toString().replace(/:/g, "")}-${now.toString(36)}`,
            timestamp: now,
            signalSources: [{
              type: "wifi",
              frequencyMHz: freqMHz,
              rssi: device.rssi,
              bandwidth: 20000,
              identifier: `WiFi ${device.name || device.macAddress}`,
              matchedProfile: matchedProfile?.name || null,
              confidence,
              timestamp: now,
            }],
            bestMatch: matchedProfile,
            overallConfidence: confidence,
            threatLevel: matchedProfile?.threatLevel || "medium",
            estimatedDistanceM: distanceM,
            signalDirection: "unknown",
            rssiHistory: [{ time: now, rssi: device.rssi }],
            flightPath: [],
            fusionScore: 1,
            notes: `WiFi detection: ${device.name || device.macAddress}`,
          });
        }
      }
    }
  }

  const droneBlePattterns = [
    /dji/i, /remote.?id/i, /rid[-_]/i, /drone/i, /uav/i,
    /mavic/i, /phantom/i, /parrot/i, /skydio/i,
  ];

  for (const device of bleDevices) {
    const nameMatch = droneBlePattterns.some(p => p.test(device.name || ""));
    const mfgMatch = droneBlePattterns.some(p => p.test(device.manufacturer || ""));

    if (nameMatch || mfgMatch) {
      let confidence = 0.3;
      if (nameMatch) confidence += 0.4;
      if (mfgMatch) confidence += 0.2;
      const isRemoteId = /remote.?id|rid[-_]/i.test(device.name || "");
      if (isRemoteId) confidence = Math.min(0.95, confidence + 0.3);
      confidence = Math.min(0.95, confidence);

      const distanceM = estimateDistanceFSPL(device.rssi, 2440);

      const nearbyDetection = detections.find(d =>
        d.estimatedDistanceM !== null && Math.abs(d.estimatedDistanceM - distanceM) < 50
      );

      if (nearbyDetection) {
        nearbyDetection.signalSources.push({
          type: isRemoteId ? "remoteid" : "bluetooth",
          frequencyMHz: 2440,
          rssi: device.rssi,
          bandwidth: 2000,
          identifier: `BLE ${device.name || device.macAddress}`,
          matchedProfile: isRemoteId ? "DJI Remote ID" : null,
          confidence,
          timestamp: now,
        });
        nearbyDetection.fusionScore += isRemoteId ? 2 : 1;
        nearbyDetection.overallConfidence = Math.min(0.99, nearbyDetection.overallConfidence + (isRemoteId ? 0.25 : 0.1));
        if (isRemoteId) nearbyDetection.notes += " | RemoteID confirmed";
      } else {
        detections.push({
          id: `drone-ble-${(device.macAddress || now).toString().replace(/:/g, "")}-${now.toString(36)}`,
          timestamp: now,
          signalSources: [{
            type: isRemoteId ? "remoteid" : "bluetooth",
            frequencyMHz: 2440,
            rssi: device.rssi,
            bandwidth: 2000,
            identifier: `BLE ${device.name || device.macAddress}`,
            matchedProfile: isRemoteId ? "DJI Remote ID" : null,
            confidence,
            timestamp: now,
          }],
          bestMatch: isRemoteId ? DRONE_RF_PROFILES.find(p => p.name === "DJI Remote ID") || null : null,
          overallConfidence: confidence,
          threatLevel: isRemoteId ? "info" : "medium",
          estimatedDistanceM: distanceM,
          signalDirection: "unknown",
          rssiHistory: [{ time: now, rssi: device.rssi }],
          flightPath: [],
          fusionScore: isRemoteId ? 2 : 1,
          notes: isRemoteId ? `RemoteID broadcast: ${device.name}` : `BLE detection: ${device.name || device.macAddress}`,
        });
      }
    }
  }

  detections.sort((a, b) => {
    const threatOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    const aLevel = threatOrder[a.threatLevel as keyof typeof threatOrder] || 0;
    const bLevel = threatOrder[b.threatLevel as keyof typeof threatOrder] || 0;
    if (aLevel !== bLevel) return bLevel - aLevel;
    return b.overallConfidence - a.overallConfidence;
  });

  return detections;
}

export function generateSimulatedDroneSignals(): {
  wifiDevices: Array<{ name: string; macAddress: string; rssi: number; signalType: string; frequency: string; manufacturer: string }>;
  bleDevices: Array<{ name: string; macAddress: string; rssi: number; signalType: string; manufacturer: string }>;
} {
  const now = Date.now();
  const rand = () => Math.random();
  const wifiDevices: any[] = [];
  const bleDevices: any[] = [];

  if (rand() > 0.4) {
    const rssiBase = -45 - rand() * 25;
    const rssiVariance = (Math.sin(now / 3000) * 5);
    wifiDevices.push({
      name: `DJI-Mavic3-${Math.floor(rand() * 900 + 100)}`,
      macAddress: `60:60:1F:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}`,
      rssi: rssiBase + rssiVariance,
      signalType: "wifi",
      frequency: "5745",
      manufacturer: "DJI Technology",
    });
    bleDevices.push({
      name: `RID-DJI-${Math.floor(rand() * 9000 + 1000)}`,
      macAddress: `60:60:1F:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}`,
      rssi: rssiBase + rssiVariance - 8,
      signalType: "bluetooth",
      manufacturer: "DJI",
    });
  }

  if (rand() > 0.7) {
    wifiDevices.push({
      name: `FPV-Racer-${Math.floor(rand() * 99)}`,
      macAddress: `AA:BB:CC:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}`,
      rssi: -55 - rand() * 20,
      signalType: "wifi",
      frequency: "5800",
      manufacturer: "Unknown",
    });
  }

  if (rand() > 0.8) {
    wifiDevices.push({
      name: `Skydio-X2-${Math.floor(rand() * 500)}`,
      macAddress: `34:D2:62:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}`,
      rssi: -50 - rand() * 30,
      signalType: "wifi",
      frequency: "5200",
      manufacturer: "Skydio",
    });
  }

  for (let i = 0; i < 3 + Math.floor(rand() * 5); i++) {
    wifiDevices.push({
      name: `Network-${Math.floor(rand() * 999)}`,
      macAddress: `${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}:${Math.floor(rand() * 255).toString(16).padStart(2, "0")}`,
      rssi: -60 - rand() * 30,
      signalType: "wifi",
      frequency: "2437",
      manufacturer: "Various",
    });
  }

  return { wifiDevices, bleDevices };
}
