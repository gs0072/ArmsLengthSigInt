import type { Device, Observation, DeviceAssociation } from "@shared/schema";

export type ConfidenceLevel = "almost_certain" | "highly_likely" | "likely" | "possible" | "unlikely";
export type ProbabilityScale = "very_high" | "high" | "moderate" | "low" | "negligible";

export interface StatisticalEvidence {
  method: string;
  methodDescription: string;
  likelihoodRatio: number;
  posteriorProbability: number;
  confidenceLevel: ConfidenceLevel;
  probabilityScale: ProbabilityScale;
  sampleSize: number;
  degreesOfFreedom: number;
  nullHypothesis: string;
  alternativeHypothesis: string;
  testStatistic: number;
  pValue: number;
  observations: Record<string, unknown>;
}

export interface AnalysisResult {
  deviceId1: number;
  deviceId2: number;
  associationType: "co_movement" | "signal_correlation" | "command_control" | "network_peer" | "proximity_pattern" | "frequency_sharing" | "temporal_correlation";
  confidence: number;
  reasoning: string;
  evidence: StatisticalEvidence;
}

const CONFIDENCE_THRESHOLDS = {
  almost_certain: 0.95,
  highly_likely: 0.85,
  likely: 0.70,
  possible: 0.50,
  unlikely: 0.30,
};

function toConfidenceLevel(probability: number): ConfidenceLevel {
  if (probability >= CONFIDENCE_THRESHOLDS.almost_certain) return "almost_certain";
  if (probability >= CONFIDENCE_THRESHOLDS.highly_likely) return "highly_likely";
  if (probability >= CONFIDENCE_THRESHOLDS.likely) return "likely";
  if (probability >= CONFIDENCE_THRESHOLDS.possible) return "possible";
  return "unlikely";
}

function toProbabilityScale(probability: number): ProbabilityScale {
  if (probability >= 0.90) return "very_high";
  if (probability >= 0.70) return "high";
  if (probability >= 0.45) return "moderate";
  if (probability >= 0.20) return "low";
  return "negligible";
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeLocationSpread(observations: Observation[]): { centroid: { lat: number; lon: number }; spreadMeters: number; uniqueLocations: number } {
  const located = observations.filter(o => o.latitude != null && o.longitude != null);
  if (located.length === 0) return { centroid: { lat: 0, lon: 0 }, spreadMeters: 0, uniqueLocations: 0 };

  const lats = located.map(o => o.latitude!);
  const lons = located.map(o => o.longitude!);
  const centroidLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centroidLon = lons.reduce((a, b) => a + b, 0) / lons.length;

  const uniqueCoords = new Set(located.map(o => `${o.latitude!.toFixed(5)},${o.longitude!.toFixed(5)}`));

  let maxDist = 0;
  for (const o of located) {
    const d = haversineDistance(centroidLat, centroidLon, o.latitude!, o.longitude!);
    if (d > maxDist) maxDist = d;
  }

  return { centroid: { lat: centroidLat, lon: centroidLon }, spreadMeters: maxDist, uniqueLocations: uniqueCoords.size };
}

function isStaticCollectionBias(
  obs1: Observation[],
  obs2: Observation[],
  allObservations: Observation[]
): boolean {
  const located1 = obs1.filter(o => o.latitude != null && o.longitude != null);
  const located2 = obs2.filter(o => o.latitude != null && o.longitude != null);
  if (located1.length === 0 || located2.length === 0) return false;

  const spread1 = computeLocationSpread(obs1);
  const spread2 = computeLocationSpread(obs2);

  if (spread1.uniqueLocations <= 1 && spread2.uniqueLocations <= 1) return true;

  const allLocated = allObservations.filter(o => o.latitude != null && o.longitude != null);
  const globalSpread = computeLocationSpread(allLocated);

  if (globalSpread.spreadMeters < 25) return true;

  const centroidDist = haversineDistance(
    spread1.centroid.lat, spread1.centroid.lon,
    globalSpread.centroid.lat, globalSpread.centroid.lon
  );
  const centroidDist2 = haversineDistance(
    spread2.centroid.lat, spread2.centroid.lon,
    globalSpread.centroid.lat, globalSpread.centroid.lon
  );

  if (centroidDist < 30 && centroidDist2 < 30 && spread1.spreadMeters < 50 && spread2.spreadMeters < 50) {
    return true;
  }

  return false;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let numerator = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  if (denom === 0) return 0;
  return numerator / denom;
}

function fisherZTest(r: number, n: number): { z: number; pValue: number } {
  if (n < 4) return { z: 0, pValue: 1 };
  const zr = 0.5 * Math.log((1 + r) / (1 - Math.min(0.9999, Math.max(-0.9999, r))));
  const se = 1 / Math.sqrt(n - 3);
  const z = zr / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  return { z, pValue };
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327;
  const p = d * Math.exp(-x * x / 2) * (t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))));
  return x > 0 ? 1 - p : p;
}

function likelihoodRatioFromPValue(pValue: number, priorOdds: number = 1): number {
  if (pValue <= 0.001) return priorOdds * 100;
  if (pValue >= 1) return priorOdds * 0.1;
  return priorOdds * (1 / pValue) * 0.5;
}

function posteriorFromLR(lr: number, prior: number = 0.05): number {
  const priorOdds = prior / (1 - prior);
  const posteriorOdds = priorOdds * lr;
  return Math.min(0.99, posteriorOdds / (1 + posteriorOdds));
}

function analyzeCoMovement(
  device1: Device, device2: Device,
  obs1: Observation[], obs2: Observation[],
  allObservations: Observation[]
): AnalysisResult | null {
  const located1 = obs1.filter(o => o.latitude != null && o.longitude != null);
  const located2 = obs2.filter(o => o.latitude != null && o.longitude != null);
  if (located1.length < 3 || located2.length < 3) return null;

  if (isStaticCollectionBias(obs1, obs2, allObservations)) return null;

  const spread1 = computeLocationSpread(obs1);
  const spread2 = computeLocationSpread(obs2);
  if (spread1.uniqueLocations < 2 || spread2.uniqueLocations < 2) return null;

  const timeWindow = 5 * 60 * 1000;
  const pairedDistances: number[] = [];
  const randomDistances: number[] = [];

  for (const o1 of located1) {
    const t1 = new Date(o1.observedAt!).getTime();
    for (const o2 of located2) {
      const timeDiff = Math.abs(t1 - new Date(o2.observedAt!).getTime());
      const dist = haversineDistance(o1.latitude!, o1.longitude!, o2.latitude!, o2.longitude!);
      if (timeDiff <= timeWindow) {
        pairedDistances.push(dist);
      } else {
        randomDistances.push(dist);
      }
    }
  }

  if (pairedDistances.length < 3) return null;

  const avgPaired = pairedDistances.reduce((a, b) => a + b, 0) / pairedDistances.length;
  const avgRandom = randomDistances.length > 0
    ? randomDistances.reduce((a, b) => a + b, 0) / randomDistances.length
    : spread1.spreadMeters + spread2.spreadMeters;

  if (avgRandom < 50) return null;
  const distanceRatio = avgPaired / Math.max(1, avgRandom);
  if (distanceRatio > 0.5) return null;

  const closeCount = pairedDistances.filter(d => d < 50).length;
  const closeRatio = closeCount / pairedDistances.length;
  if (closeRatio < 0.4) return null;

  const n = pairedDistances.length;
  const effect = 1 - distanceRatio;
  const testStat = effect * Math.sqrt(n);
  const pValue = 2 * (1 - normalCDF(Math.abs(testStat)));

  const lr = likelihoodRatioFromPValue(pValue, 1);
  const posterior = posteriorFromLR(lr, 0.05);
  const confidenceLevel = toConfidenceLevel(posterior);
  const probabilityScale = toProbabilityScale(posterior);

  if (posterior < 0.30) return null;

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "co_movement",
    confidence: Math.round(posterior * 100),
    reasoning: `Spatiotemporal co-movement detected across ${spread1.uniqueLocations} and ${spread2.uniqueLocations} distinct locations. ${closeCount}/${n} temporally-paired observations within 50m (ratio ${closeRatio.toFixed(2)}). Time-correlated mean distance ${avgPaired.toFixed(0)}m vs. uncorrelated mean ${avgRandom.toFixed(0)}m — distance ratio ${distanceRatio.toFixed(3)} indicates non-random spatial coupling. Movement pattern is consistent across collection sites, ruling out static collector bias.`,
    evidence: {
      method: "Spatiotemporal Distance Ratio Test",
      methodDescription: "Compares mean inter-device distance during time-correlated observations vs. uncorrelated observations. Controls for static collection bias by requiring geographic diversity and testing whether proximity persists across multiple distinct collection sites.",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: n,
      degreesOfFreedom: n - 1,
      nullHypothesis: "Devices move independently — observed proximity is due to chance or shared collection environment",
      alternativeHypothesis: "Devices exhibit coordinated movement — proximity persists across time and locations beyond random expectation",
      testStatistic: Math.round(testStat * 1000) / 1000,
      pValue: Math.round(pValue * 10000) / 10000,
      observations: {
        pairedObservations: n,
        closeProximityCount: closeCount,
        closeProximityRatio: Math.round(closeRatio * 1000) / 1000,
        meanPairedDistanceM: Math.round(avgPaired),
        meanRandomDistanceM: Math.round(avgRandom),
        distanceRatio: Math.round(distanceRatio * 1000) / 1000,
        device1UniqueLocations: spread1.uniqueLocations,
        device2UniqueLocations: spread2.uniqueLocations,
      },
    },
  };
}

function analyzeSignalCorrelation(
  device1: Device, device2: Device,
  obs1: Observation[], obs2: Observation[],
  _allObservations: Observation[]
): AnalysisResult | null {
  const rssi1 = obs1
    .filter(o => o.signalStrength != null)
    .map(o => ({ t: new Date(o.observedAt!).getTime(), v: o.signalStrength! }))
    .sort((a, b) => a.t - b.t);
  const rssi2 = obs2
    .filter(o => o.signalStrength != null)
    .map(o => ({ t: new Date(o.observedAt!).getTime(), v: o.signalStrength! }))
    .sort((a, b) => a.t - b.t);

  if (rssi1.length < 5 || rssi2.length < 5) return null;

  const timeWindow = 10 * 1000;
  const pairedX: number[] = [];
  const pairedY: number[] = [];

  for (const r1 of rssi1) {
    let bestDiff = Infinity;
    let bestVal = 0;
    for (const r2 of rssi2) {
      const diff = Math.abs(r1.t - r2.t);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestVal = r2.v;
      }
    }
    if (bestDiff <= timeWindow) {
      pairedX.push(r1.v);
      pairedY.push(bestVal);
    }
  }

  if (pairedX.length < 5) return null;

  const r = pearsonCorrelation(pairedX, pairedY);
  if (Math.abs(r) < 0.4) return null;

  const { z, pValue } = fisherZTest(r, pairedX.length);
  if (pValue > 0.10) return null;

  const lr = likelihoodRatioFromPValue(pValue, 1);
  const posterior = posteriorFromLR(lr, 0.05);
  const confidenceLevel = toConfidenceLevel(posterior);
  const probabilityScale = toProbabilityScale(posterior);

  if (posterior < 0.30) return null;

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "signal_correlation",
    confidence: Math.round(posterior * 100),
    reasoning: `RSSI signal strength shows Pearson correlation r=${r.toFixed(3)} across ${pairedX.length} time-paired readings (Fisher Z=${z.toFixed(2)}, p=${pValue.toFixed(4)}). Synchronized signal fluctuations indicate consistent relative positioning — characteristic of paired devices, co-located equipment, or coordinated RF emitters.`,
    evidence: {
      method: "Pearson RSSI Correlation with Fisher Z-Transform",
      methodDescription: "Computes Pearson product-moment correlation between time-paired signal strength readings, then applies Fisher Z-transform to assess statistical significance. Tests whether RSSI fluctuations are synchronized beyond random expectation.",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: pairedX.length,
      degreesOfFreedom: pairedX.length - 2,
      nullHypothesis: "RSSI readings are independent — no signal strength coupling exists between devices",
      alternativeHypothesis: "RSSI readings are correlated — devices maintain consistent relative positioning or share propagation environment",
      testStatistic: Math.round(z * 1000) / 1000,
      pValue: Math.round(pValue * 10000) / 10000,
      observations: {
        pearsonR: Math.round(r * 1000) / 1000,
        pairedReadings: pairedX.length,
        timeWindowSeconds: timeWindow / 1000,
        meanRSSI_device1: Math.round(pairedX.reduce((a, b) => a + b, 0) / pairedX.length),
        meanRSSI_device2: Math.round(pairedY.reduce((a, b) => a + b, 0) / pairedY.length),
      },
    },
  };
}

function analyzeProximityPattern(
  device1: Device, device2: Device,
  obs1: Observation[], obs2: Observation[],
  allObservations: Observation[]
): AnalysisResult | null {
  const located1 = obs1.filter(o => o.latitude != null && o.longitude != null);
  const located2 = obs2.filter(o => o.latitude != null && o.longitude != null);
  if (located1.length < 2 || located2.length < 2) return null;

  if (isStaticCollectionBias(obs1, obs2, allObservations)) return null;

  const spread1 = computeLocationSpread(obs1);
  const spread2 = computeLocationSpread(obs2);
  if (spread1.uniqueLocations < 2 || spread2.uniqueLocations < 2) return null;

  interface Encounter {
    time: number;
    distance: number;
    location: string;
  }
  const encounters: Encounter[] = [];
  const timeWindow = 10 * 60 * 1000;
  const proximityThreshold = 75;

  for (const o1 of located1) {
    const t1 = new Date(o1.observedAt!).getTime();
    for (const o2 of located2) {
      const timeDiff = Math.abs(t1 - new Date(o2.observedAt!).getTime());
      if (timeDiff > timeWindow) continue;
      const dist = haversineDistance(o1.latitude!, o1.longitude!, o2.latitude!, o2.longitude!);
      if (dist < proximityThreshold) {
        encounters.push({
          time: t1,
          distance: dist,
          location: `${o1.latitude!.toFixed(4)},${o1.longitude!.toFixed(4)}`,
        });
      }
    }
  }

  const uniqueEncounterLocations = new Set(encounters.map(e => e.location));
  if (uniqueEncounterLocations.size < 2) return null;
  if (encounters.length < 3) return null;

  const totalPossiblePairs = located1.length * located2.length;
  const encounterRate = encounters.length / totalPossiblePairs;
  const baselineRate = 0.05;
  const lr = encounterRate / baselineRate;

  if (lr < 2) return null;

  const posterior = posteriorFromLR(lr, 0.03);
  const confidenceLevel = toConfidenceLevel(posterior);
  const probabilityScale = toProbabilityScale(posterior);

  if (posterior < 0.25) return null;

  const avgDist = encounters.reduce((a, e) => a + e.distance, 0) / encounters.length;

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "proximity_pattern",
    confidence: Math.round(posterior * 100),
    reasoning: `Recurring proximity pattern across ${uniqueEncounterLocations.size} distinct locations: ${encounters.length} encounters within ${proximityThreshold}m (mean ${avgDist.toFixed(0)}m). Encounter rate ${(encounterRate * 100).toFixed(1)}% vs. ${(baselineRate * 100).toFixed(1)}% baseline — likelihood ratio ${lr.toFixed(1)}:1 favoring non-random co-location. Multi-site encounters rule out static collection artifact.`,
    evidence: {
      method: "Multi-Site Proximity Likelihood Ratio",
      methodDescription: "Counts co-location encounters at distinct geographic sites, comparing the observed encounter rate against a baseline random encounter rate. Requires encounters at 2+ unique locations to filter static collection bias.",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: encounters.length,
      degreesOfFreedom: uniqueEncounterLocations.size - 1,
      nullHypothesis: "Proximity events are explained by shared collection environment — no genuine spatial relationship exists",
      alternativeHypothesis: "Devices have a genuine spatial relationship — proximity recurs across independent locations",
      testStatistic: Math.round(lr * 1000) / 1000,
      pValue: Math.round(Math.max(0.0001, 1 / (1 + lr)) * 10000) / 10000,
      observations: {
        totalEncounters: encounters.length,
        uniqueEncounterSites: uniqueEncounterLocations.size,
        proximityThresholdM: proximityThreshold,
        meanEncounterDistanceM: Math.round(avgDist),
        encounterRate: Math.round(encounterRate * 10000) / 10000,
        baselineRate,
        totalPossiblePairs,
      },
    },
  };
}

function analyzeFrequencySharing(
  device1: Device, device2: Device,
  obs1: Observation[], obs2: Observation[],
  _allObservations: Observation[]
): AnalysisResult | null {
  const freq1 = obs1.filter(o => o.frequency != null);
  const freq2 = obs2.filter(o => o.frequency != null);
  if (freq1.length < 2 || freq2.length < 2) return null;

  const freqs1 = Array.from(new Set(freq1.map(o => Math.round(o.frequency! * 10) / 10)));
  const freqs2 = Array.from(new Set(freq2.map(o => Math.round(o.frequency! * 10) / 10)));

  const commonBands: Record<string, number[]> = {
    "2.4GHz_WiFi": [2400, 2500],
    "5GHz_WiFi": [5150, 5850],
    "BLE": [2400, 2483.5],
  };

  const freqs1Set = new Set(freqs1.map(f => f.toString()));
  const freqs2Set = new Set(freqs2.map(f => f.toString()));

  const shared = freqs1.filter(f => freqs2Set.has(f.toString()));
  if (shared.length === 0) return null;

  let nonBandShared = 0;
  for (const freq of shared) {
    const freqMHz = freq / 1e6;
    let inCommonBand = false;
    for (const [, [low, high]] of Object.entries(commonBands)) {
      if (freqMHz >= low && freqMHz <= high) { inCommonBand = true; break; }
    }
    if (!inCommonBand) nonBandShared++;
  }

  const minUnique = Math.min(freqs1Set.size, freqs2Set.size);
  const overlapRatio = shared.length / Math.max(1, minUnique);

  const narrowChannelMatch = shared.filter(f => {
    const mhz = f / 1e6;
    return (mhz < 2400 || mhz > 2500) && (mhz < 5150 || mhz > 5850);
  }).length;

  let lr: number;
  if (narrowChannelMatch > 0) {
    lr = 5 + narrowChannelMatch * 10;
  } else if (overlapRatio > 0.6) {
    lr = 3 + overlapRatio * 5;
  } else {
    lr = 1 + overlapRatio * 2;
  }

  if (lr < 2.5) return null;

  const posterior = posteriorFromLR(lr, 0.04);
  const confidenceLevel = toConfidenceLevel(posterior);
  const probabilityScale = toProbabilityScale(posterior);

  if (posterior < 0.25) return null;

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "frequency_sharing",
    confidence: Math.round(posterior * 100),
    reasoning: `Shared frequency usage: ${shared.length} common frequencies detected (overlap ratio ${(overlapRatio * 100).toFixed(0)}% of ${minUnique} unique channels). ${nonBandShared > 0 ? `${nonBandShared} shared frequencies outside common bands (highly indicative).` : "Shared frequencies within common RF bands — moderate association strength."} Pattern suggests coordinated communication, paired network membership, or shared radio infrastructure.`,
    evidence: {
      method: "RF Spectrum Co-Channel Analysis",
      methodDescription: "Compares discrete frequency sets between devices, weighting non-standard frequency overlaps more heavily than common-band matches (e.g., 2.4GHz WiFi). Narrowband or unusual frequency sharing receives higher likelihood scores.",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: freq1.length + freq2.length,
      degreesOfFreedom: minUnique - 1,
      nullHypothesis: "Devices use frequencies independently — overlap is explained by common band allocation",
      alternativeHypothesis: "Devices share frequencies beyond what common band allocation explains — coordinated channel usage",
      testStatistic: Math.round(lr * 1000) / 1000,
      pValue: Math.round(Math.max(0.0001, 1 / (1 + lr)) * 10000) / 10000,
      observations: {
        sharedFrequencies: shared.map(f => `${(f / 1e6).toFixed(1)} MHz`),
        overlapRatio: Math.round(overlapRatio * 1000) / 1000,
        device1UniqueFreqs: freqs1Set.size,
        device2UniqueFreqs: freqs2Set.size,
        nonBandSharedCount: nonBandShared,
        narrowChannelMatches: narrowChannelMatch,
      },
    },
  };
}

function analyzeTemporalCorrelation(
  device1: Device, device2: Device,
  obs1: Observation[], obs2: Observation[],
  _allObservations: Observation[]
): AnalysisResult | null {
  if (obs1.length < 4 || obs2.length < 4) return null;

  const times1 = obs1.map(o => new Date(o.observedAt!).getTime()).sort((a, b) => a - b);
  const times2 = obs2.map(o => new Date(o.observedAt!).getTime()).sort((a, b) => a - b);

  const overallSpan = Math.max(
    times1[times1.length - 1] - times1[0],
    times2[times2.length - 1] - times2[0]
  );
  if (overallSpan < 60 * 1000) return null;

  const activationWindow = 30 * 1000;

  let correlatedActivations = 0;
  for (const t1 of times1) {
    for (const t2 of times2) {
      if (Math.abs(t1 - t2) < activationWindow) {
        correlatedActivations++;
        break;
      }
    }
  }

  const observedRate = correlatedActivations / times1.length;
  const expectedRate = Math.min(1, (times2.length * activationWindow * 2) / Math.max(1, overallSpan));

  if (expectedRate >= observedRate * 0.8) return null;
  if (observedRate < 0.5) return null;

  const lr = observedRate / Math.max(0.01, expectedRate);
  if (lr < 2) return null;

  const posterior = posteriorFromLR(lr, 0.05);
  const confidenceLevel = toConfidenceLevel(posterior);
  const probabilityScale = toProbabilityScale(posterior);

  if (posterior < 0.30) return null;

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "temporal_correlation",
    confidence: Math.round(posterior * 100),
    reasoning: `Temporal activation sync: ${correlatedActivations}/${times1.length} activations of "${device1.name || 'Device ' + device1.id}" occur within ${activationWindow / 1000}s of "${device2.name || 'Device ' + device2.id}" activity. Observed sync rate ${(observedRate * 100).toFixed(0)}% vs. expected ${(expectedRate * 100).toFixed(0)}% — LR ${lr.toFixed(1)}:1 over ${(overallSpan / 60000).toFixed(0)} min observation window. Synchronized activation beyond chance suggests operational coordination or shared trigger.`,
    evidence: {
      method: "Temporal Activation Synchronicity Test",
      methodDescription: "Measures the rate of temporally-correlated activations between two devices and compares against the expected random coincidence rate based on observation density and time span. Requires sustained observations over a meaningful time window.",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: times1.length + times2.length,
      degreesOfFreedom: times1.length - 1,
      nullHypothesis: "Activation timing is independent — synchronous detections are coincidental given observation density",
      alternativeHypothesis: "Devices activate in coordinated temporal patterns beyond random coincidence",
      testStatistic: Math.round(lr * 1000) / 1000,
      pValue: Math.round(Math.max(0.0001, 1 / (1 + lr)) * 10000) / 10000,
      observations: {
        correlatedActivations,
        totalActivations: times1.length,
        observedSyncRate: Math.round(observedRate * 1000) / 1000,
        expectedRandomRate: Math.round(expectedRate * 1000) / 1000,
        activationWindowSeconds: activationWindow / 1000,
        observationSpanMinutes: Math.round(overallSpan / 60000),
      },
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

  const analyzers = [
    analyzeCoMovement,
    analyzeSignalCorrelation,
    analyzeProximityPattern,
    analyzeFrequencySharing,
    analyzeTemporalCorrelation,
  ];

  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const d1 = devices[i];
      const d2 = devices[j];
      const pairKey = `${Math.min(d1.id, d2.id)}_${Math.max(d1.id, d2.id)}`;
      if (existingPairs.has(pairKey)) continue;

      const obs1 = obsByDevice.get(d1.id) || [];
      const obs2 = obsByDevice.get(d2.id) || [];
      if (obs1.length < 3 || obs2.length < 3) continue;

      for (const analyze of analyzers) {
        const result = analyze(d1, d2, obs1, obs2, observations);
        if (result && result.confidence >= 25) {
          results.push(result);
          break;
        }
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export const CONFIDENCE_LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  almost_certain: "Almost Certain",
  highly_likely: "Highly Likely",
  likely: "Likely",
  possible: "Possible",
  unlikely: "Unlikely",
};

export const PROBABILITY_SCALE_LABELS: Record<ProbabilityScale, string> = {
  very_high: "Very High",
  high: "High",
  moderate: "Moderate",
  low: "Low",
  negligible: "Negligible",
};

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
