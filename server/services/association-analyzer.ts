import type { Device, Observation, DeviceAssociation, InsertDeviceAssociation } from "@shared/schema";

interface AnalysisResult {
  deviceId1: number;
  deviceId2: number;
  associationType: "co_movement" | "signal_correlation" | "command_control" | "network_peer" | "proximity_pattern" | "frequency_sharing" | "temporal_correlation";
  confidence: number;
  reasoning: string;
  evidence: Record<string, unknown>;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function analyzeCoMovement(
  device1: Device,
  device2: Device,
  obs1: Observation[],
  obs2: Observation[]
): AnalysisResult | null {
  const located1 = obs1.filter(o => o.latitude && o.longitude);
  const located2 = obs2.filter(o => o.latitude && o.longitude);
  if (located1.length < 2 || located2.length < 2) return null;

  let proximityCount = 0;
  let totalComparisons = 0;
  const distances: number[] = [];
  const timeWindow = 5 * 60 * 1000;

  for (const o1 of located1) {
    for (const o2 of located2) {
      const timeDiff = Math.abs(new Date(o1.observedAt!).getTime() - new Date(o2.observedAt!).getTime());
      if (timeDiff > timeWindow) continue;
      totalComparisons++;
      const dist = haversineDistance(o1.latitude!, o1.longitude!, o2.latitude!, o2.longitude!);
      distances.push(dist);
      if (dist < 50) proximityCount++;
    }
  }

  if (totalComparisons < 2) return null;
  const ratio = proximityCount / totalComparisons;
  if (ratio < 0.3) return null;

  const avgDist = distances.reduce((s, d) => s + d, 0) / distances.length;
  const confidence = Math.min(95, Math.round(ratio * 100));

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "co_movement",
    confidence,
    reasoning: `Co-movement detected: ${proximityCount}/${totalComparisons} time-correlated observations within 50m (avg ${avgDist.toFixed(0)}m apart). Signal strength patterns suggest these devices travel together, consistent with being carried by the same individual or in the same vehicle.`,
    evidence: {
      proximityCount,
      totalComparisons,
      proximityRatio: ratio,
      avgDistanceMeters: Math.round(avgDist),
      minDistanceMeters: Math.round(Math.min(...distances)),
      timeWindowMs: timeWindow,
      methodology: "Spatiotemporal correlation analysis - SIGINT co-travel indicator",
    },
  };
}

function analyzeSignalCorrelation(
  device1: Device,
  device2: Device,
  obs1: Observation[],
  obs2: Observation[]
): AnalysisResult | null {
  const rssi1 = obs1.filter(o => o.signalStrength != null).map(o => ({ t: new Date(o.observedAt!).getTime(), v: o.signalStrength! }));
  const rssi2 = obs2.filter(o => o.signalStrength != null).map(o => ({ t: new Date(o.observedAt!).getTime(), v: o.signalStrength! }));
  if (rssi1.length < 3 || rssi2.length < 3) return null;

  let correlationCount = 0;
  let totalPairs = 0;
  const timeWindow = 10 * 1000;

  for (const r1 of rssi1) {
    const closest = rssi2.reduce((best, r2) => {
      const diff = Math.abs(r1.t - r2.t);
      return diff < Math.abs(r1.t - best.t) ? r2 : best;
    }, rssi2[0]);
    if (Math.abs(r1.t - closest.t) > timeWindow) continue;
    totalPairs++;
    const rssiDiff = Math.abs(r1.v - closest.v);
    if (rssiDiff < 15) correlationCount++;
  }

  if (totalPairs < 3) return null;
  const ratio = correlationCount / totalPairs;
  if (ratio < 0.4) return null;

  const confidence = Math.min(85, Math.round(ratio * 90));

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "signal_correlation",
    confidence,
    reasoning: `Signal strength correlation detected: ${correlationCount}/${totalPairs} readings show synchronized RSSI fluctuations (<15dB variance), indicating these devices maintain consistent relative positioning. This pattern is characteristic of paired or co-located equipment.`,
    evidence: {
      correlatedReadings: correlationCount,
      totalPairs,
      correlationRatio: ratio,
      methodology: "RSSI temporal correlation - signal proximity analysis",
    },
  };
}

function analyzeProximityPattern(
  device1: Device,
  device2: Device,
  obs1: Observation[],
  obs2: Observation[]
): AnalysisResult | null {
  const located1 = obs1.filter(o => o.latitude && o.longitude);
  const located2 = obs2.filter(o => o.latitude && o.longitude);
  if (located1.length === 0 || located2.length === 0) return null;

  let closeEncounters = 0;
  const encounterTimes: number[] = [];

  for (const o1 of located1) {
    for (const o2 of located2) {
      const dist = haversineDistance(o1.latitude!, o1.longitude!, o2.latitude!, o2.longitude!);
      if (dist < 100) {
        closeEncounters++;
        encounterTimes.push(new Date(o1.observedAt!).getTime());
      }
    }
  }

  if (closeEncounters < 2) return null;
  const confidence = Math.min(70, closeEncounters * 15);

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "proximity_pattern",
    confidence,
    reasoning: `Recurring proximity pattern: ${closeEncounters} instances of both devices observed within 100m. Repeated co-location suggests a non-random relationship between these nodes.`,
    evidence: {
      closeEncounters,
      radiusMeters: 100,
      methodology: "Geospatial proximity frequency analysis",
    },
  };
}

function analyzeFrequencySharing(
  device1: Device,
  device2: Device,
  obs1: Observation[],
  obs2: Observation[]
): AnalysisResult | null {
  const freq1 = obs1.filter(o => o.frequency != null);
  const freq2 = obs2.filter(o => o.frequency != null);
  if (freq1.length === 0 || freq2.length === 0) return null;

  const freqs1 = new Set(freq1.map(o => Math.round(o.frequency! * 10) / 10));
  const freqs2 = new Set(freq2.map(o => Math.round(o.frequency! * 10) / 10));

  const shared = [...freqs1].filter(f => freqs2.has(f));
  if (shared.length === 0) return null;

  const overlap = shared.length / Math.min(freqs1.size, freqs2.size);
  if (overlap < 0.3) return null;

  const confidence = Math.min(80, Math.round(overlap * 85));

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "frequency_sharing",
    confidence,
    reasoning: `Shared frequency usage detected: ${shared.length} common frequencies (${shared.map(f => f + " MHz").join(", ")}). Devices operating on the same channels suggests coordinated communication or network membership.`,
    evidence: {
      sharedFrequencies: shared,
      overlapRatio: overlap,
      methodology: "RF spectrum co-channel analysis",
    },
  };
}

function analyzeTemporalCorrelation(
  device1: Device,
  device2: Device,
  obs1: Observation[],
  obs2: Observation[]
): AnalysisResult | null {
  if (obs1.length < 2 || obs2.length < 2) return null;

  const times1 = obs1.map(o => new Date(o.observedAt!).getTime()).sort();
  const times2 = obs2.map(o => new Date(o.observedAt!).getTime()).sort();

  let correlatedActivations = 0;
  const activationWindow = 30 * 1000;

  for (const t1 of times1) {
    for (const t2 of times2) {
      if (Math.abs(t1 - t2) < activationWindow) {
        correlatedActivations++;
        break;
      }
    }
  }

  const ratio = correlatedActivations / times1.length;
  if (ratio < 0.4) return null;

  const confidence = Math.min(75, Math.round(ratio * 80));

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "temporal_correlation",
    confidence,
    reasoning: `Temporal correlation: ${correlatedActivations}/${times1.length} activations of device "${device1.name || device1.id}" coincide within 30s of device "${device2.name || device2.id}" activity. Synchronized activation patterns suggest operational coordination or shared trigger events.`,
    evidence: {
      correlatedActivations,
      totalActivations: times1.length,
      correlationRatio: ratio,
      windowSeconds: 30,
      methodology: "Temporal pattern analysis - activation synchronicity",
    },
  };
}

export function analyzeDeviceAssociations(
  devices: Device[],
  observations: Observation[],
  existingAssociations: DeviceAssociation[]
): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  const existingPairs = new Set(
    existingAssociations.map(a => `${Math.min(a.deviceId1, a.deviceId2)}_${Math.max(a.deviceId1, a.deviceId2)}`)
  );

  const obsByDevice = new Map<number, Observation[]>();
  for (const obs of observations) {
    if (!obsByDevice.has(obs.deviceId)) obsByDevice.set(obs.deviceId, []);
    obsByDevice.get(obs.deviceId)!.push(obs);
  }

  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const d1 = devices[i];
      const d2 = devices[j];
      const pairKey = `${Math.min(d1.id, d2.id)}_${Math.max(d1.id, d2.id)}`;
      if (existingPairs.has(pairKey)) continue;

      const obs1 = obsByDevice.get(d1.id) || [];
      const obs2 = obsByDevice.get(d2.id) || [];

      const analyzers = [
        analyzeCoMovement,
        analyzeSignalCorrelation,
        analyzeProximityPattern,
        analyzeFrequencySharing,
        analyzeTemporalCorrelation,
      ];

      for (const analyze of analyzers) {
        const result = analyze(d1, d2, obs1, obs2);
        if (result && result.confidence >= 30) {
          results.push(result);
          break;
        }
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export const ASSOCIATION_TYPE_LABELS: Record<string, string> = {
  co_movement: "Co-Movement",
  signal_correlation: "Signal Correlation",
  command_control: "Command & Control",
  network_peer: "Network Peer",
  proximity_pattern: "Proximity Pattern",
  frequency_sharing: "Frequency Sharing",
  temporal_correlation: "Temporal Correlation",
  manual: "Manual Link",
};
