import { db } from "./db";
import { devices, observations, alerts, followingDetection, deviceCatalog } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase(userId: string) {
  const existingDevices = await db.select().from(devices).where(eq(devices.userId, userId)).limit(1);
  if (existingDevices.length > 0) return;

  const sampleDevices = [
    {
      userId,
      name: "iPhone 15 Pro",
      macAddress: "A4:83:E7:2F:91:B3",
      manufacturer: "Apple",
      model: "iPhone 15 Pro",
      deviceType: "Mobile Phone",
      signalType: "bluetooth" as const,
      isTracked: true,
      isFlagged: false,
      notes: "Personal device detected in residential area",
    },
    {
      userId,
      name: "Galaxy Watch 6",
      macAddress: "DC:2B:61:A5:4E:F8",
      manufacturer: "Samsung",
      model: "Galaxy Watch 6",
      deviceType: "Wearable",
      signalType: "bluetooth" as const,
      isTracked: false,
      isFlagged: false,
    },
    {
      userId,
      name: "NETGEAR-5G-HOME",
      macAddress: "B0:7F:B9:42:CC:D1",
      manufacturer: "Netgear",
      model: "RAX50",
      deviceType: "Wi-Fi Router",
      signalType: "wifi" as const,
      isTracked: false,
      isFlagged: false,
    },
    {
      userId,
      name: "AirPods Pro 2",
      macAddress: "F0:D4:E2:8A:33:7C",
      manufacturer: "Apple",
      model: "AirPods Pro 2nd Gen",
      deviceType: "Audio Device",
      signalType: "bluetooth" as const,
      isTracked: false,
      isFlagged: false,
    },
    {
      userId,
      name: "DJI Mini 3 Pro",
      macAddress: "60:60:1F:E3:B7:29",
      manufacturer: "DJI",
      model: "Mini 3 Pro",
      deviceType: "Drone",
      signalType: "wifi" as const,
      isTracked: true,
      isFlagged: true,
      notes: "Drone detected near restricted area - flagged for monitoring",
    },
    {
      userId,
      name: "Meshtastic Node T-Beam",
      macAddress: "24:6F:28:9E:A1:55",
      manufacturer: "TTGO",
      model: "T-Beam v1.1",
      deviceType: "LoRa Node",
      signalType: "meshtastic" as const,
      isTracked: true,
      isFlagged: false,
      notes: "Meshtastic mesh network node",
    },
    {
      userId,
      name: "RTL-SDR v3",
      uuid: "SDR-RTL2832U-0001",
      manufacturer: "RTL-SDR Blog",
      model: "V3",
      deviceType: "SDR Receiver",
      signalType: "sdr" as const,
      isTracked: false,
      isFlagged: false,
    },
    {
      userId,
      name: "Unknown ADS-B Transponder",
      uuid: "ADSB-A3E7F1",
      manufacturer: "Unknown",
      model: "Mode-S Transponder",
      deviceType: "Aircraft",
      signalType: "adsb" as const,
      isTracked: true,
      isFlagged: true,
      notes: "Unidentified aircraft transponder - requires investigation",
    },
    {
      userId,
      name: "AirTag Tracker",
      macAddress: "7C:D1:C3:52:8B:A4",
      manufacturer: "Apple",
      model: "AirTag",
      deviceType: "Tracker",
      signalType: "bluetooth" as const,
      isTracked: true,
      isFlagged: true,
      notes: "Unknown AirTag detected following user pattern",
    },
    {
      userId,
      name: "Medtronic Pacemaker",
      uuid: "MED-PM-2024-0847",
      manufacturer: "Medtronic",
      model: "Azure XT MRI",
      deviceType: "Medical Device",
      signalType: "bluetooth" as const,
      isTracked: true,
      isFlagged: false,
      notes: "Medical device - BLE beacon detected during SAR sweep",
    },
    {
      userId,
      name: "Tesla Model 3",
      macAddress: "E8:6F:38:D4:72:1A",
      manufacturer: "Tesla",
      model: "Model 3",
      deviceType: "Vehicle",
      signalType: "bluetooth" as const,
      isTracked: false,
      isFlagged: false,
    },
    {
      userId,
      name: "Heltec LoRa Node",
      macAddress: "30:AE:A4:CC:58:91",
      manufacturer: "Heltec",
      model: "WiFi LoRa 32 V3",
      deviceType: "LoRa Node",
      signalType: "lora" as const,
      isTracked: false,
      isFlagged: false,
    },
  ];

  const createdDevices = await db.insert(devices).values(sampleDevices).returning();

  const sampleObservations = [];
  const baseCoords = [
    { lat: 38.8977, lng: -77.0365 },
    { lat: 38.9072, lng: -77.0369 },
    { lat: 38.8951, lng: -77.0364 },
    { lat: 38.9101, lng: -77.0147 },
    { lat: 38.8895, lng: -77.0503 },
  ];

  for (const device of createdDevices) {
    const numObs = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numObs; i++) {
      const baseCoord = baseCoords[Math.floor(Math.random() * baseCoords.length)];
      const hoursAgo = Math.floor(Math.random() * 72);
      const observedAt = new Date(Date.now() - hoursAgo * 3600000);

      sampleObservations.push({
        deviceId: device.id,
        userId,
        signalType: device.signalType,
        signalStrength: -(30 + Math.floor(Math.random() * 60)),
        frequency: device.signalType === "wifi" ? 2.4e9 + Math.random() * 0.1e9
          : device.signalType === "bluetooth" ? 2.402e9 + Math.random() * 0.078e9
          : device.signalType === "lora" || device.signalType === "meshtastic" ? 915e6
          : device.signalType === "adsb" ? 1090e6
          : null,
        latitude: baseCoord.lat + (Math.random() - 0.5) * 0.01,
        longitude: baseCoord.lng + (Math.random() - 0.5) * 0.01,
        altitude: 50 + Math.random() * 200,
        channel: device.signalType === "wifi" ? Math.floor(Math.random() * 13) + 1 : null,
        protocol: device.signalType === "bluetooth" ? "BLE 5.0"
          : device.signalType === "wifi" ? "802.11ac"
          : device.signalType === "lora" ? "LoRaWAN"
          : device.signalType === "meshtastic" ? "Meshtastic"
          : device.signalType === "adsb" ? "Mode-S"
          : null,
        encryption: device.signalType === "wifi" ? "WPA3" : "None",
        hexData: i === 0 ? generateHex(16) : null,
        asciiData: i === 0 && device.name ? `DEV:${device.name.substring(0, 12)}` : null,
        rawData: null,
        heading: null,
        speed: null,
        observedAt,
        metadata: null,
      });
    }
  }

  await db.insert(observations).values(sampleObservations);

  const airtagDevice = createdDevices.find(d => d.name === "AirTag Tracker");
  if (airtagDevice) {
    await db.insert(followingDetection).values({
      userId,
      deviceId: airtagDevice.id,
      encounterCount: 14,
      riskScore: 82,
      status: "alert",
      locationHistory: JSON.stringify([
        { lat: 38.8977, lng: -77.0365, time: new Date(Date.now() - 86400000).toISOString() },
        { lat: 38.9072, lng: -77.0369, time: new Date(Date.now() - 43200000).toISOString() },
        { lat: 38.8951, lng: -77.0364, time: new Date().toISOString() },
      ]),
    });
  }

  const droneDevice = createdDevices.find(d => d.name === "DJI Mini 3 Pro");
  if (droneDevice) {
    await db.insert(followingDetection).values({
      userId,
      deviceId: droneDevice.id,
      encounterCount: 3,
      riskScore: 45,
      status: "monitoring",
      locationHistory: JSON.stringify([
        { lat: 38.9101, lng: -77.0147, time: new Date(Date.now() - 7200000).toISOString() },
      ]),
    });
  }

  await db.insert(alerts).values([
    {
      userId,
      name: "Pacemaker BLE Sweep",
      description: "Monitor for Medtronic pacemaker BLE beacons in search area",
      alertType: "device_name",
      status: "active",
      criteria: { searchTerm: "Medtronic", type: "device_name" },
    },
    {
      userId,
      name: "Unknown AirTag Alert",
      description: "Alert when unregistered AirTags are detected nearby",
      alertType: "manufacturer",
      status: "triggered",
      criteria: { searchTerm: "AirTag", type: "manufacturer" },
      triggeredAt: new Date(),
    },
    {
      userId,
      name: "Drone Frequency Monitor",
      description: "Monitor 2.4GHz and 5.8GHz for drone control signals",
      alertType: "frequency_range",
      status: "active",
      criteria: { minFreq: 2.4e9, maxFreq: 5.8e9, type: "frequency_range" },
    },
  ]);

  console.log(`Seeded database with ${createdDevices.length} devices and ${sampleObservations.length} observations`);
}

function generateHex(bytes: number): string {
  const chars = "0123456789ABCDEF";
  return Array.from({ length: bytes * 2 })
    .map(() => chars[Math.floor(Math.random() * 16)])
    .reduce((acc, char, i) => acc + char + (i % 2 === 1 && i < bytes * 2 - 1 ? " " : ""), "");
}
