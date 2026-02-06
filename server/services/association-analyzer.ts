import type { Device, Observation, DeviceAssociation } from "@shared/schema";

export type ConfidenceLevel = "almost_certain" | "highly_likely" | "likely" | "possible" | "unlikely";
export type ProbabilityScale = "very_high" | "high" | "moderate" | "low" | "negligible";

export type IntelDiscipline = "SIGINT" | "GEOINT" | "MASINT" | "MULTI_INT";

export interface StatisticalEvidence {
  method: string;
  methodDescription: string;
  discipline: IntelDiscipline;
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
  associationType: "co_movement" | "signal_correlation" | "frequency_sharing" | "temporal_correlation" | "geoint_triangulation";
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

function rssiToDistanceEstimate(rssi: number, txPower: number = -40, pathLossExponent: number = 2.7): number {
  return Math.pow(10, (txPower - rssi) / (10 * pathLossExponent));
}

interface GeoFix {
  lat: number;
  lon: number;
  errorRadiusM: number;
  sensorPositions: number;
  timestamp: number;
}

function triangulateFix(
  sensorObservations: Array<{ lat: number; lon: number; rssi: number; time: number }>
): GeoFix | null {
  if (sensorObservations.length < 2) return null;

  const estimates = sensorObservations.map(so => ({
    lat: so.lat,
    lon: so.lon,
    distM: rssiToDistanceEstimate(so.rssi),
    time: so.time,
  }));

  let totalWeight = 0;
  let wLat = 0;
  let wLon = 0;

  for (const est of estimates) {
    const weight = 1 / Math.max(1, est.distM);
    wLat += est.lat * weight;
    wLon += est.lon * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;

  const fixLat = wLat / totalWeight;
  const fixLon = wLon / totalWeight;

  let maxError = 0;
  for (const est of estimates) {
    const d = haversineDistance(fixLat, fixLon, est.lat, est.lon);
    const residual = Math.abs(d - est.distM);
    if (residual > maxError) maxError = residual;
  }

  const avgTime = estimates.reduce((a, e) => a + e.time, 0) / estimates.length;

  return {
    lat: fixLat,
    lon: fixLon,
    errorRadiusM: Math.min(maxError, 500),
    sensorPositions: sensorObservations.length,
    timestamp: avgTime,
  };
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
    reasoning: `GEOINT co-movement pattern: Spatiotemporal analysis across ${spread1.uniqueLocations} and ${spread2.uniqueLocations} distinct collection sites reveals coordinated movement. ${closeCount}/${n} temporally-paired observations within 50m (ratio ${closeRatio.toFixed(2)}). Time-correlated mean separation ${avgPaired.toFixed(0)}m vs. uncorrelated baseline ${avgRandom.toFixed(0)}m — distance ratio ${distanceRatio.toFixed(3)} indicates non-random spatial coupling. Movement pattern persists across collection sites, eliminating static collector bias per GEOINT collection standards.`,
    evidence: {
      method: "GEOINT Spatiotemporal Distance Ratio Test",
      methodDescription: "Geospatial intelligence analysis comparing mean inter-target distance during time-correlated collection windows vs. uncorrelated baselines. Controls for static collection bias by requiring geographic diversity across multiple collection sites per GEOINT tradecraft standards.",
      discipline: "GEOINT",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: n,
      degreesOfFreedom: n - 1,
      nullHypothesis: "H0: Targets move independently — observed proximity is attributable to shared collection environment or coincidence",
      alternativeHypothesis: "H1: Targets exhibit coordinated movement — spatial coupling persists across time windows and collection sites beyond random expectation",
      testStatistic: Math.round(testStat * 1000) / 1000,
      pValue: Math.round(pValue * 10000) / 10000,
      observations: {
        pairedObservations: n,
        closeProximityCount: closeCount,
        closeProximityRatio: Math.round(closeRatio * 1000) / 1000,
        meanPairedDistanceM: Math.round(avgPaired),
        meanBaselineDistanceM: Math.round(avgRandom),
        distanceRatio: Math.round(distanceRatio * 1000) / 1000,
        target1CollectionSites: spread1.uniqueLocations,
        target2CollectionSites: spread2.uniqueLocations,
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

  if (rssi1.length < 8 || rssi2.length < 8) return null;

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
    reasoning: `SIGINT signal correlation: RSSI measurement analysis yields Pearson correlation r=${r.toFixed(3)} across ${pairedX.length} time-paired intercepts (Fisher Z=${z.toFixed(2)}, p=${pValue.toFixed(4)}). Synchronized signal propagation characteristics indicate consistent relative positioning between targets — consistent with co-located emitters, paired devices, or coordinated RF assets per SIGINT collection indicators.`,
    evidence: {
      method: "SIGINT Pearson RSSI Correlation with Fisher Z-Transform",
      methodDescription: "Signals intelligence analysis computing Pearson product-moment correlation between time-paired signal strength intercepts, applying Fisher Z-transform for statistical significance assessment. Tests whether RSSI propagation patterns are synchronized beyond random expectation, indicating co-location or paired operation.",
      discipline: "SIGINT",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: pairedX.length,
      degreesOfFreedom: pairedX.length - 2,
      nullHypothesis: "H0: Signal measurements are independent — no propagation coupling exists between targets",
      alternativeHypothesis: "H1: Signal measurements are correlated — targets maintain consistent relative positioning or share propagation environment",
      testStatistic: Math.round(z * 1000) / 1000,
      pValue: Math.round(pValue * 10000) / 10000,
      observations: {
        pearsonR: Math.round(r * 1000) / 1000,
        pairedIntercepts: pairedX.length,
        collectionWindowSeconds: timeWindow / 1000,
        meanRSSI_target1: Math.round(pairedX.reduce((a, b) => a + b, 0) / pairedX.length),
        meanRSSI_target2: Math.round(pairedY.reduce((a, b) => a + b, 0) / pairedY.length),
      },
    },
  };
}

function analyzeFrequencySignature(
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
    "2.4GHz_ISM": [2400, 2500],
    "5GHz_UNII": [5150, 5850],
    "BLE_PHY": [2400, 2483.5],
    "900MHz_ISM": [902, 928],
    "433MHz_ISM": [433, 434],
  };

  const freqs2Set = new Set(freqs2.map(f => f.toString()));

  const shared = freqs1.filter(f => freqs2Set.has(f.toString()));
  if (shared.length === 0) return null;

  if (freqs1.length <= 1 && freqs2.length <= 1 && shared.length <= 1) return null;

  let nonBandShared = 0;
  for (const freq of shared) {
    const freqMHz = freq / 1e6;
    let inCommonBand = false;
    for (const [, [low, high]] of Object.entries(commonBands)) {
      if (freqMHz >= low && freqMHz <= high) { inCommonBand = true; break; }
    }
    if (!inCommonBand) nonBandShared++;
  }

  const minUnique = Math.min(freqs1.length, freqs2.length);
  const overlapRatio = shared.length / Math.max(1, minUnique);

  const narrowChannelMatch = shared.filter(f => {
    const mhz = f / 1e6;
    return (mhz < 2400 || mhz > 2500) && (mhz < 5150 || mhz > 5850) && (mhz < 902 || mhz > 928);
  }).length;

  let lr: number;
  if (narrowChannelMatch > 0) {
    lr = 5 + narrowChannelMatch * 10;
  } else if (overlapRatio > 0.6) {
    lr = 3 + overlapRatio * 5;
  } else {
    lr = 1 + overlapRatio * 2;
  }

  if (lr < 3.5) return null;

  const posterior = posteriorFromLR(lr, 0.04);
  const confidenceLevel = toConfidenceLevel(posterior);
  const probabilityScale = toProbabilityScale(posterior);

  if (posterior < 0.35) return null;

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "frequency_sharing",
    confidence: Math.round(posterior * 100),
    reasoning: `MASINT signature correlation: ${shared.length} shared frequency emissions detected (overlap ratio ${(overlapRatio * 100).toFixed(0)}% of ${minUnique} unique channels). ${nonBandShared > 0 ? `${nonBandShared} emissions outside standard ISM bands — highly indicative of coordinated or paired operation.` : "Shared emissions within standard ISM allocations — moderate MASINT association strength."} RF emission fingerprint suggests coordinated communication, shared network membership, or common radio infrastructure per MASINT signature analysis.`,
    evidence: {
      method: "MASINT RF Emission Signature Correlation",
      methodDescription: "Measurement and signature intelligence analysis comparing discrete RF emission fingerprints between targets. Non-standard frequency overlap is weighted more heavily than common ISM band matches. Narrowband or unusual emission sharing receives elevated likelihood scores per MASINT tradecraft.",
      discipline: "MASINT",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: freq1.length + freq2.length,
      degreesOfFreedom: minUnique - 1,
      nullHypothesis: "H0: Targets emit on frequencies independently — spectral overlap is explained by common ISM band allocation",
      alternativeHypothesis: "H1: Targets share RF emission signatures beyond common band allocation — indicating coordinated channel usage or paired operation",
      testStatistic: Math.round(lr * 1000) / 1000,
      pValue: Math.round(Math.max(0.0001, 1 / (1 + lr)) * 10000) / 10000,
      observations: {
        sharedEmissions: shared.map(f => `${(f / 1e6).toFixed(1)} MHz`),
        overlapRatio: Math.round(overlapRatio * 1000) / 1000,
        target1UniqueFreqs: freqs1.length,
        target2UniqueFreqs: freqs2.length,
        nonISMSharedCount: nonBandShared,
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
  if (obs1.length < 6 || obs2.length < 6) return null;

  const times1 = obs1.map(o => new Date(o.observedAt!).getTime()).sort((a, b) => a - b);
  const times2 = obs2.map(o => new Date(o.observedAt!).getTime()).sort((a, b) => a - b);

  const overallSpan = Math.max(
    times1[times1.length - 1] - times1[0],
    times2[times2.length - 1] - times2[0]
  );
  if (overallSpan < 5 * 60 * 1000) return null;

  const activationWindow = 15 * 1000;

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

  if (expectedRate >= observedRate * 0.7) return null;
  if (observedRate < 0.6) return null;

  const lr = observedRate / Math.max(0.01, expectedRate);
  if (lr < 3) return null;

  const posterior = posteriorFromLR(lr, 0.05);
  const confidenceLevel = toConfidenceLevel(posterior);
  const probabilityScale = toProbabilityScale(posterior);

  if (posterior < 0.30) return null;

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "temporal_correlation",
    confidence: Math.round(posterior * 100),
    reasoning: `SIGINT temporal activity pattern: ${correlatedActivations}/${times1.length} emissions from target "${device1.name || 'Target ' + device1.id}" occur within ${activationWindow / 1000}s of target "${device2.name || 'Target ' + device2.id}" activity. Observed synchronization rate ${(observedRate * 100).toFixed(0)}% vs. expected random coincidence ${(expectedRate * 100).toFixed(0)}% — LR ${lr.toFixed(1)}:1 over ${(overallSpan / 60000).toFixed(0)} min collection window. Temporal activation synchronicity beyond chance suggests operational coordination, shared trigger mechanism, or command-and-control relationship per SIGINT pattern-of-life analysis.`,
    evidence: {
      method: "SIGINT Temporal Activation Synchronicity Test",
      methodDescription: "Signals intelligence temporal pattern analysis measuring rate of correlated emissions between targets, comparing against expected random coincidence rate based on collection density and time span. Supports pattern-of-life analysis and operational coordination detection per SIGINT tradecraft.",
      discipline: "SIGINT",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: times1.length + times2.length,
      degreesOfFreedom: times1.length - 1,
      nullHypothesis: "H0: Emission timing is independent — synchronous intercepts are coincidental given collection density",
      alternativeHypothesis: "H1: Targets emit in coordinated temporal patterns beyond random coincidence — indicating operational synchronization",
      testStatistic: Math.round(lr * 1000) / 1000,
      pValue: Math.round(Math.max(0.0001, 1 / (1 + lr)) * 10000) / 10000,
      observations: {
        correlatedEmissions: correlatedActivations,
        totalEmissions: times1.length,
        observedSyncRate: Math.round(observedRate * 1000) / 1000,
        expectedRandomRate: Math.round(expectedRate * 1000) / 1000,
        activationWindowSeconds: activationWindow / 1000,
        collectionSpanMinutes: Math.round(overallSpan / 60000),
      },
    },
  };
}

function analyzeTriangulationFix(
  device1: Device, device2: Device,
  obs1: Observation[], obs2: Observation[],
  allObservations: Observation[]
): AnalysisResult | null {
  const located1 = obs1.filter(o => o.latitude != null && o.longitude != null && o.signalStrength != null);
  const located2 = obs2.filter(o => o.latitude != null && o.longitude != null && o.signalStrength != null);

  if (located1.length < 2 || located2.length < 2) return null;

  if (isStaticCollectionBias(obs1, obs2, allObservations)) return null;

  const spread1 = computeLocationSpread(obs1);
  const spread2 = computeLocationSpread(obs2);
  if (spread1.uniqueLocations < 2 || spread2.uniqueLocations < 2) return null;

  const timeWindowMs = 10 * 60 * 1000;
  const timeSlots = new Map<number, { obs1: Observation[]; obs2: Observation[] }>();

  const allTimes = [...obs1, ...obs2].map(o => new Date(o.observedAt!).getTime());
  const minTime = Math.min(...allTimes);

  for (const o of located1) {
    const t = new Date(o.observedAt!).getTime();
    const slot = Math.floor((t - minTime) / timeWindowMs);
    if (!timeSlots.has(slot)) timeSlots.set(slot, { obs1: [], obs2: [] });
    timeSlots.get(slot)!.obs1.push(o);
  }
  for (const o of located2) {
    const t = new Date(o.observedAt!).getTime();
    const slot = Math.floor((t - minTime) / timeWindowMs);
    if (!timeSlots.has(slot)) timeSlots.set(slot, { obs1: [], obs2: [] });
    timeSlots.get(slot)!.obs2.push(o);
  }

  const coLocatedFixes: Array<{ dist: number; fix1: GeoFix; fix2: GeoFix }> = [];
  const allFixDistances: number[] = [];
  let totalFixPairs = 0;

  for (const [, slot] of timeSlots) {
    if (slot.obs1.length < 2 || slot.obs2.length < 2) continue;

    const sensorObs1 = slot.obs1.map(o => ({
      lat: o.latitude!, lon: o.longitude!, rssi: o.signalStrength!, time: new Date(o.observedAt!).getTime()
    }));
    const sensorObs2 = slot.obs2.map(o => ({
      lat: o.latitude!, lon: o.longitude!, rssi: o.signalStrength!, time: new Date(o.observedAt!).getTime()
    }));

    const fix1 = triangulateFix(sensorObs1);
    const fix2 = triangulateFix(sensorObs2);

    if (!fix1 || !fix2) continue;

    const dist = haversineDistance(fix1.lat, fix1.lon, fix2.lat, fix2.lon);
    allFixDistances.push(dist);
    totalFixPairs++;

    const combinedError = fix1.errorRadiusM + fix2.errorRadiusM;
    if (dist < Math.max(100, combinedError * 1.5)) {
      coLocatedFixes.push({ dist, fix1, fix2 });
    }
  }

  if (totalFixPairs < 2) return null;
  if (coLocatedFixes.length < 1) return null;

  const coLocationRate = coLocatedFixes.length / totalFixPairs;
  if (coLocationRate < 0.3) return null;

  const baselineRate = 0.05;
  const lr = coLocationRate / baselineRate;
  if (lr < 2) return null;

  const posterior = posteriorFromLR(lr, 0.04);
  const confidenceLevel = toConfidenceLevel(posterior);
  const probabilityScale = toProbabilityScale(posterior);

  if (posterior < 0.25) return null;

  const avgFixDist = coLocatedFixes.reduce((a, f) => a + f.dist, 0) / coLocatedFixes.length;
  const avgErrorRadius = coLocatedFixes.reduce((a, f) => a + (f.fix1.errorRadiusM + f.fix2.errorRadiusM) / 2, 0) / coLocatedFixes.length;
  const avgSensorPositions = coLocatedFixes.reduce((a, f) => a + (f.fix1.sensorPositions + f.fix2.sensorPositions) / 2, 0) / coLocatedFixes.length;

  return {
    deviceId1: device1.id,
    deviceId2: device2.id,
    associationType: "geoint_triangulation",
    confidence: Math.round(posterior * 100),
    reasoning: `GEOINT triangulated location fix: Multilateration from ${Math.round(avgSensorPositions)} collection sensor positions across ${totalFixPairs} time windows yields convergent location estimates. ${coLocatedFixes.length}/${totalFixPairs} triangulated fixes place targets within ${avgFixDist.toFixed(0)}m of each other (mean CEP ${avgErrorRadius.toFixed(0)}m). Co-location rate ${(coLocationRate * 100).toFixed(0)}% vs. ${(baselineRate * 100).toFixed(0)}% random baseline — LR ${lr.toFixed(1)}:1. Triangulated position convergence across multiple collection windows indicates sustained spatial relationship per GEOINT multilateration standards.`,
    evidence: {
      method: "GEOINT Multilateration Triangulation Fix",
      methodDescription: "Geospatial intelligence multilateration analysis using RSSI-derived distance estimates from multiple collection sensor positions to compute triangulated location fixes for each target. Compares fix convergence across time windows to determine spatial co-location beyond random coincidence. Applies log-distance path loss model for RSSI-to-range estimation per MASINT electromagnetic propagation standards.",
      discipline: "GEOINT",
      likelihoodRatio: Math.round(lr * 100) / 100,
      posteriorProbability: Math.round(posterior * 1000) / 1000,
      confidenceLevel,
      probabilityScale,
      sampleSize: totalFixPairs,
      degreesOfFreedom: totalFixPairs - 1,
      nullHypothesis: "H0: Triangulated position fixes are spatially independent — convergent co-location is attributable to collection geometry or coincidence",
      alternativeHypothesis: "H1: Targets share sustained spatial co-location across multiple triangulated fixes — indicating genuine proximity relationship",
      testStatistic: Math.round(lr * 1000) / 1000,
      pValue: Math.round(Math.max(0.0001, 1 / (1 + lr)) * 10000) / 10000,
      observations: {
        triangulatedFixPairs: totalFixPairs,
        coLocatedFixes: coLocatedFixes.length,
        coLocationRate: Math.round(coLocationRate * 1000) / 1000,
        meanFixSeparationM: Math.round(avgFixDist),
        meanCEPRadiusM: Math.round(avgErrorRadius),
        meanSensorPositions: Math.round(avgSensorPositions * 10) / 10,
        target1CollectionSites: spread1.uniqueLocations,
        target2CollectionSites: spread2.uniqueLocations,
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
    existingAssociations.map(a => `${Math.min(a.deviceId1, a.deviceId2)}_${Math.max(a.deviceId1, a.deviceId2)}_${a.associationType}`)
  );

  const obsByDevice = new Map<number, Observation[]>();
  for (const obs of observations) {
    if (!obsByDevice.has(obs.deviceId)) obsByDevice.set(obs.deviceId, []);
    obsByDevice.get(obs.deviceId)!.push(obs);
  }

  const analyzers = [
    analyzeCoMovement,
    analyzeTriangulationFix,
    analyzeSignalCorrelation,
    analyzeFrequencySignature,
    analyzeTemporalCorrelation,
  ];

  for (let i = 0; i < devices.length; i++) {
    for (let j = i + 1; j < devices.length; j++) {
      const d1 = devices[i];
      const d2 = devices[j];

      const obs1 = obsByDevice.get(d1.id) || [];
      const obs2 = obsByDevice.get(d2.id) || [];
      if (obs1.length < 3 || obs2.length < 3) continue;

      for (const analyze of analyzers) {
        const pairKey = `${Math.min(d1.id, d2.id)}_${Math.max(d1.id, d2.id)}`;
        const result = analyze(d1, d2, obs1, obs2, observations);
        if (result && result.confidence >= 45) {
          const fullKey = `${pairKey}_${result.associationType}`;
          if (!existingPairs.has(fullKey)) {
            results.push(result);
          }
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

export const INTEL_DISCIPLINE_LABELS: Record<string, string> = {
  SIGINT: "Signals Intelligence",
  GEOINT: "Geospatial Intelligence",
  MASINT: "Measurement & Signature Intelligence",
  MULTI_INT: "Multi-Discipline Intelligence",
};

export const ASSOCIATION_TYPE_LABELS: Record<string, string> = {
  co_movement: "GEOINT Co-Movement",
  signal_correlation: "SIGINT Signal Correlation",
  command_control: "Command & Control",
  network_peer: "Network Peer",
  proximity_pattern: "GEOINT Proximity Pattern",
  frequency_sharing: "MASINT Signature Correlation",
  temporal_correlation: "SIGINT Temporal Pattern",
  geoint_triangulation: "GEOINT Triangulation Fix",
  manual: "Manual Intelligence Link",
};

export const ASSOCIATION_DISCIPLINE: Record<string, IntelDiscipline> = {
  co_movement: "GEOINT",
  signal_correlation: "SIGINT",
  command_control: "SIGINT",
  network_peer: "SIGINT",
  proximity_pattern: "GEOINT",
  frequency_sharing: "MASINT",
  temporal_correlation: "SIGINT",
  geoint_triangulation: "GEOINT",
  manual: "MULTI_INT",
};

export interface TriangulationResult {
  estimatedLat: number;
  estimatedLon: number;
  errorRadiusM: number;
  confidence: number;
  sensorPositions: number;
  observationsUsed: number;
  method: string;
  rangeEstimates: Array<{
    sensorLat: number;
    sensorLon: number;
    rssi: number;
    estimatedDistanceM: number;
    bearing: number;
    timestamp: string;
  }>;
}

export function triangulateDevice(observations: Observation[]): TriangulationResult | null {
  const withLocation = observations.filter(o => o.latitude && o.longitude && o.signalStrength);
  if (withLocation.length < 2) return null;

  const sensorObs = withLocation.map(o => ({
    lat: o.latitude!,
    lon: o.longitude!,
    rssi: o.signalStrength!,
    time: new Date(o.observedAt!).getTime(),
  }));

  const uniquePositions = new Map<string, typeof sensorObs[0]>();
  for (const so of sensorObs) {
    const key = `${so.lat.toFixed(4)},${so.lon.toFixed(4)}`;
    const existing = uniquePositions.get(key);
    if (!existing || so.time > existing.time) {
      uniquePositions.set(key, so);
    }
  }

  const positions = Array.from(uniquePositions.values());
  if (positions.length < 2) {
    const fix = triangulateFix(sensorObs);
    if (!fix) return null;
    const rangeEstimates = sensorObs.slice(0, 20).map(so => ({
      sensorLat: so.lat,
      sensorLon: so.lon,
      rssi: so.rssi,
      estimatedDistanceM: rssiToDistanceEstimate(so.rssi),
      bearing: calculateBearing(so.lat, so.lon, fix.lat, fix.lon),
      timestamp: new Date(so.time).toISOString(),
    }));
    return {
      estimatedLat: fix.lat,
      estimatedLon: fix.lon,
      errorRadiusM: fix.errorRadiusM,
      confidence: Math.min(90, 30 + positions.length * 10),
      sensorPositions: positions.length,
      observationsUsed: sensorObs.length,
      method: "RSSI-weighted centroid (single position cluster)",
      rangeEstimates,
    };
  }

  const fix = triangulateFix(positions);
  if (!fix) return null;

  const distances = positions.map(p =>
    haversineDistance(fix.lat, fix.lon, p.lat, p.lon) * 1000
  );
  const avgResidual = distances.reduce((a, b) => a + b, 0) / distances.length;

  const confidence = Math.min(95, Math.max(20,
    30 + positions.length * 12 - Math.min(30, avgResidual / 10)
  ));

  const rangeEstimates = positions.slice(0, 20).map(so => ({
    sensorLat: so.lat,
    sensorLon: so.lon,
    rssi: so.rssi,
    estimatedDistanceM: rssiToDistanceEstimate(so.rssi),
    bearing: calculateBearing(so.lat, so.lon, fix.lat, fix.lon),
    timestamp: new Date(so.time).toISOString(),
  }));

  return {
    estimatedLat: fix.lat,
    estimatedLon: fix.lon,
    errorRadiusM: fix.errorRadiusM,
    confidence,
    sensorPositions: positions.length,
    observationsUsed: sensorObs.length,
    method: `GEOINT multilateration (${positions.length} sensor positions, log-distance path loss RSSI ranging)`,
    rangeEstimates,
  };
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
