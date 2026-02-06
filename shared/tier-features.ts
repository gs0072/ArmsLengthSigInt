export interface TierFeatures {
  label: string;
  maxDevices: number;
  maxObservationsPerDevice: number;
  maxSensors: number;
  maxTrustedUsers: number;
  analysisTimeoutSeconds: number;
  storageBytes: number;
  allowedDataModes: string[];
  features: {
    linkAnalysis: boolean;
    aiAnalysis: boolean;
    triangulation: boolean;
    osintIntegration: boolean;
    exportImport: boolean;
    heatMap: boolean;
    counterIntelligence: boolean;
    customSignatures: boolean;
    advancedAlerts: boolean;
    unlimitedAnalysis: boolean;
  };
}

export const TIER_FEATURES: Record<string, TierFeatures> = {
  free: {
    label: "Free",
    maxDevices: 50,
    maxObservationsPerDevice: 100,
    maxSensors: 2,
    maxTrustedUsers: 0,
    analysisTimeoutSeconds: 45,
    storageBytes: 2 * 1024 * 1024 * 1024,
    allowedDataModes: ["local"],
    features: {
      linkAnalysis: false,
      aiAnalysis: false,
      triangulation: false,
      osintIntegration: false,
      exportImport: false,
      heatMap: true,
      counterIntelligence: false,
      customSignatures: false,
      advancedAlerts: false,
      unlimitedAnalysis: false,
    },
  },
  basic: {
    label: "Basic",
    maxDevices: 200,
    maxObservationsPerDevice: 500,
    maxSensors: 5,
    maxTrustedUsers: 5,
    analysisTimeoutSeconds: 45,
    storageBytes: 5 * 1024 * 1024 * 1024,
    allowedDataModes: ["local", "friends"],
    features: {
      linkAnalysis: true,
      aiAnalysis: false,
      triangulation: true,
      osintIntegration: false,
      exportImport: true,
      heatMap: true,
      counterIntelligence: false,
      customSignatures: false,
      advancedAlerts: true,
      unlimitedAnalysis: false,
    },
  },
  professional: {
    label: "Professional",
    maxDevices: 1000,
    maxObservationsPerDevice: 2000,
    maxSensors: 15,
    maxTrustedUsers: 25,
    analysisTimeoutSeconds: 45,
    storageBytes: 20 * 1024 * 1024 * 1024,
    allowedDataModes: ["local", "friends", "public"],
    features: {
      linkAnalysis: true,
      aiAnalysis: true,
      triangulation: true,
      osintIntegration: false,
      exportImport: true,
      heatMap: true,
      counterIntelligence: true,
      customSignatures: true,
      advancedAlerts: true,
      unlimitedAnalysis: false,
    },
  },
  enterprise: {
    label: "Enterprise",
    maxDevices: -1,
    maxObservationsPerDevice: -1,
    maxSensors: -1,
    maxTrustedUsers: -1,
    analysisTimeoutSeconds: -1,
    storageBytes: 100 * 1024 * 1024 * 1024,
    allowedDataModes: ["local", "friends", "public", "osint", "combined"],
    features: {
      linkAnalysis: true,
      aiAnalysis: true,
      triangulation: true,
      osintIntegration: true,
      exportImport: true,
      heatMap: true,
      counterIntelligence: true,
      customSignatures: true,
      advancedAlerts: true,
      unlimitedAnalysis: true,
    },
  },
  admin: {
    label: "Admin",
    maxDevices: -1,
    maxObservationsPerDevice: -1,
    maxSensors: -1,
    maxTrustedUsers: -1,
    analysisTimeoutSeconds: -1,
    storageBytes: 100 * 1024 * 1024 * 1024,
    allowedDataModes: ["local", "friends", "public", "osint", "combined"],
    features: {
      linkAnalysis: true,
      aiAnalysis: true,
      triangulation: true,
      osintIntegration: true,
      exportImport: true,
      heatMap: true,
      counterIntelligence: true,
      customSignatures: true,
      advancedAlerts: true,
      unlimitedAnalysis: true,
    },
  },
};

export function getTierFeatures(tier: string): TierFeatures {
  return TIER_FEATURES[tier] || TIER_FEATURES.free;
}

export function isFeatureAllowed(tier: string, feature: keyof TierFeatures["features"]): boolean {
  const features = getTierFeatures(tier);
  return features.features[feature];
}

export function isDataModeAllowed(tier: string, mode: string): boolean {
  const features = getTierFeatures(tier);
  return features.allowedDataModes.includes(mode);
}

export const FEATURE_LABELS: Record<keyof TierFeatures["features"], { label: string; description: string }> = {
  linkAnalysis: { label: "Link Analysis", description: "Multi-INT device association analysis and visualization" },
  aiAnalysis: { label: "AI Intelligence Analysis", description: "GPT-powered multi-INT device analysis with OSINT enrichment" },
  triangulation: { label: "GEOINT Triangulation", description: "Multi-observation position fix and error radius calculation" },
  osintIntegration: { label: "OSINT Integration", description: "Open source intelligence dataset access and cross-referencing" },
  exportImport: { label: "Export / Import", description: "Full backup and restore of all collection data" },
  heatMap: { label: "Heat Map", description: "RSSI-weighted signal density visualization on map" },
  counterIntelligence: { label: "Counter-Intelligence", description: "Following detection and surveillance awareness" },
  customSignatures: { label: "Custom Signatures", description: "Create custom device broadcast signature databases" },
  advancedAlerts: { label: "Advanced Alerts", description: "Category-based alerts with device catalog filtering" },
  unlimitedAnalysis: { label: "Unlimited Analysis", description: "No time limits on association analysis runs" },
};
