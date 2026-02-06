import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { seedDatabase } from "./seed";
import { z } from "zod";
import OpenAI from "openai";
import { checkNmapAvailable, getNmapVersion, runPingScan, runPortScan, runQuickScan } from "./services/nmap-scanner";
import { connectToDevice, disconnectDevice, getConnections, getConnection, fetchNodes, sendMessage, getMeshtasticStatus } from "./services/meshtastic-service";
import { checkSDRToolsAvailable, getSDRDevices, runPowerScan, getSDRStatus } from "./services/sdr-service";
import { getSystemCapabilities } from "./services/system-info";
import { analyzeDeviceAssociations, ASSOCIATION_TYPE_LABELS, triangulateDevice } from "./services/association-analyzer";
import { matchDeviceToSignature, DEVICE_BROADCAST_SIGNATURES_SERVER } from "./services/signature-matcher";

const updateProfileSchema = z.object({
  dataMode: z.enum(["local", "friends", "public", "osint", "combined"]).optional(),
  settings: z.record(z.unknown()).optional(),
});

const adminUpdateUserSchema = z.object({
  tier: z.enum(["free", "basic", "professional", "enterprise", "admin"]).optional(),
  storageLimitBytes: z.number().int().min(0).optional(),
});

const createDeviceSchema = z.object({
  name: z.string().optional(),
  macAddress: z.string().optional(),
  uuid: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  deviceType: z.string().optional(),
  signalType: z.enum(["bluetooth", "wifi", "rfid", "sdr", "lora", "meshtastic", "adsb", "sensor", "unknown"]).default("unknown"),
  notes: z.string().optional(),
  isTracked: z.boolean().optional(),
  isFlagged: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createSensorSchema = z.object({
  name: z.string().min(1),
  sensorType: z.enum(["bluetooth", "wifi", "rfid", "sdr", "lora", "meshtastic", "adsb", "sensor", "unknown"]),
  connectionMethod: z.enum(["builtin", "bluetooth", "usb", "serial", "network"]).default("builtin"),
  status: z.enum(["idle", "connecting", "collecting", "error", "disconnected"]).optional(),
  config: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  nodesCollected: z.number().int().optional(),
});

const updateSensorSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["idle", "connecting", "collecting", "error", "disconnected"]).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  nodesCollected: z.number().int().optional(),
});

const createObservationSchema = z.object({
  deviceId: z.number().int(),
  signalType: z.enum(["bluetooth", "wifi", "rfid", "sdr", "lora", "meshtastic", "adsb", "sensor", "unknown"]),
  signalStrength: z.number().optional(),
  frequency: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  altitude: z.number().optional(),
  heading: z.number().optional(),
  speed: z.number().optional(),
  rawData: z.string().optional(),
  hexData: z.string().optional(),
  asciiData: z.string().optional(),
  channel: z.number().int().optional(),
  protocol: z.string().optional(),
  encryption: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  const seededUsers = new Set<string>();
  app.use("/api", async (req: any, res, next) => {
    const userId = req.user?.claims?.sub;
    if (!userId || seededUsers.has(userId)) return next();
    try {
      await seedDatabase(userId);
      seededUsers.add(userId);
    } catch (e) {
    }
    next();
  });

  app.get("/api/devices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const devices = await storage.getDevices(userId);
      res.json(devices);
    } catch (error) {
      console.error("Error fetching devices:", error);
      res.status(500).json({ message: "Failed to fetch devices" });
    }
  });

  app.post("/api/devices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = createDeviceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const deviceData = { ...parsed.data, userId };
      if (!deviceData.deviceType || deviceData.deviceType === "Unknown" || deviceData.deviceType === "unknown") {
        const matched = matchDeviceToSignature(deviceData, DEVICE_BROADCAST_SIGNATURES_SERVER);
        if (matched) deviceData.deviceType = matched;
      }
      const device = await storage.createDevice(deviceData);
      await storage.logActivity(userId, "create_device", `Created device: ${device.name || device.id}`, req.ip);
      res.status(201).json(device);
    } catch (error) {
      console.error("Error creating device:", error);
      res.status(500).json({ message: "Failed to create device" });
    }
  });

  app.patch("/api/devices/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const device = await storage.getDevice(id);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      const updated = await storage.updateDevice(id, req.body);
      await storage.logActivity(userId, "update_device", `Updated device: ${id}`, req.ip);
      res.json(updated);
    } catch (error) {
      console.error("Error updating device:", error);
      res.status(500).json({ message: "Failed to update device" });
    }
  });

  app.delete("/api/devices/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const device = await storage.getDevice(id);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      await storage.deleteDevice(id);
      await storage.logActivity(userId, "delete_device", `Deleted device: ${id}`, req.ip);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting device:", error);
      res.status(500).json({ message: "Failed to delete device" });
    }
  });

  app.get("/api/devices/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const query = req.query.q as string;
      if (!query) return res.json([]);
      const results = await storage.searchDevices(userId, query);
      res.json(results);
    } catch (error) {
      console.error("Error searching devices:", error);
      res.status(500).json({ message: "Failed to search devices" });
    }
  });

  app.get("/api/observations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const observations = await storage.getObservations(userId);
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations:", error);
      res.status(500).json({ message: "Failed to fetch observations" });
    }
  });

  app.get("/api/observations/device/:deviceId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const deviceId = parseInt(req.params.deviceId);
      const device = await storage.getDevice(deviceId);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      const observations = await storage.getObservationsByDevice(deviceId);
      res.json(observations);
    } catch (error) {
      console.error("Error fetching observations:", error);
      res.status(500).json({ message: "Failed to fetch observations" });
    }
  });

  app.post("/api/observations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = createObservationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const device = await storage.getDevice(parsed.data.deviceId);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      const observation = await storage.createObservation({ ...parsed.data, userId });
      res.status(201).json(observation);
    } catch (error) {
      console.error("Error creating observation:", error);
      res.status(500).json({ message: "Failed to create observation" });
    }
  });

  app.get("/api/alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userAlerts = await storage.getAlerts(userId);
      res.json(userAlerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.post("/api/alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const alert = await storage.createAlert({ ...req.body, userId, status: "active" });
      await storage.logActivity(userId, "create_alert", `Created alert: ${alert.name}`, req.ip);
      res.status(201).json(alert);
    } catch (error) {
      console.error("Error creating alert:", error);
      res.status(500).json({ message: "Failed to create alert" });
    }
  });

  app.patch("/api/alerts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const existingAlerts = await storage.getAlerts(userId);
      const alertExists = existingAlerts.find(a => a.id === id);
      if (!alertExists) return res.status(404).json({ message: "Alert not found" });
      const updated = await storage.updateAlert(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating alert:", error);
      res.status(500).json({ message: "Failed to update alert" });
    }
  });

  app.get("/api/catalog", isAuthenticated, async (req: any, res) => {
    try {
      const catalog = await storage.getDeviceCatalog();
      res.json(catalog);
    } catch (error) {
      console.error("Error fetching catalog:", error);
      res.status(500).json({ message: "Failed to fetch catalog" });
    }
  });

  app.get("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let profile = await storage.getUserProfile(userId);
      if (!profile) {
        const existingCount = await storage.countUserProfiles();
        const isFirstUser = existingCount === 0;
        profile = await storage.upsertUserProfile({
          userId,
          tier: isFirstUser ? "admin" : "free",
          dataMode: "local",
          storageUsedBytes: 0,
          storageLimitBytes: 2147483647,
        });
        if (isFirstUser) {
          await storage.logActivity(userId, "auto_admin_grant", "First user promoted to admin automatically");
        }
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.patch("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const existing = await storage.getUserProfile(userId);
      if (!existing) return res.status(404).json({ message: "Profile not found" });
      const updates: Record<string, any> = {};
      if (parsed.data.dataMode) updates.dataMode = parsed.data.dataMode;
      if (parsed.data.settings) updates.settings = parsed.data.settings;
      const updated = await storage.upsertUserProfile({ ...existing, ...updates, userId });
      res.json(updated);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile || profile.tier !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const profiles = await storage.getAllUserProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:targetUserId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile || profile.tier !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const parsed = adminUpdateUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const targetUserId = req.params.targetUserId;
      const targetProfile = await storage.getUserProfile(targetUserId);
      if (!targetProfile) return res.status(404).json({ message: "User not found" });
      const updates: any = { userId: targetUserId };
      if (parsed.data.tier) updates.tier = parsed.data.tier;
      if (parsed.data.storageLimitBytes !== undefined) updates.storageLimitBytes = parsed.data.storageLimitBytes;
      const updated = await storage.upsertUserProfile({ ...targetProfile, ...updates });
      await storage.logActivity(userId, "admin_user_update", `Updated user ${targetUserId} tier to ${req.body.tier}`);
      res.json(updated);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.get("/api/following-detection", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const entries = await storage.getFollowingDetection(userId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching following detection:", error);
      res.status(500).json({ message: "Failed to fetch following detection data" });
    }
  });

  app.get("/api/sensors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sensors = await storage.getSensors(userId);
      res.json(sensors);
    } catch (error) {
      console.error("Error fetching sensors:", error);
      res.status(500).json({ message: "Failed to fetch sensors" });
    }
  });

  app.post("/api/sensors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = createSensorSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const sensor = await storage.createSensor({ ...parsed.data, userId });
      await storage.logActivity(userId, "create_sensor", `Added collection sensor: ${sensor.name}`, req.ip);
      res.status(201).json(sensor);
    } catch (error) {
      console.error("Error creating sensor:", error);
      res.status(500).json({ message: "Failed to create sensor" });
    }
  });

  app.patch("/api/sensors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const sensor = await storage.getSensor(id);
      if (!sensor || sensor.userId !== userId) {
        return res.status(404).json({ message: "Sensor not found" });
      }
      const parsed = updateSensorSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const updated = await storage.updateSensor(id, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating sensor:", error);
      res.status(500).json({ message: "Failed to update sensor" });
    }
  });

  app.delete("/api/sensors/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const sensor = await storage.getSensor(id);
      if (!sensor || sensor.userId !== userId) {
        return res.status(404).json({ message: "Sensor not found" });
      }
      await storage.deleteSensor(id);
      await storage.logActivity(userId, "delete_sensor", `Removed collection sensor: ${sensor.name}`, req.ip);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting sensor:", error);
      res.status(500).json({ message: "Failed to delete sensor" });
    }
  });

  app.get("/api/devices/by-mac/:mac", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const mac = decodeURIComponent(req.params.mac);
      const device = await storage.getDeviceByMac(userId, mac);
      res.json(device || null);
    } catch (error) {
      console.error("Error fetching device by MAC:", error);
      res.status(500).json({ message: "Failed to fetch device" });
    }
  });

  app.post("/api/clear-data", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.clearUserData(userId);
      await storage.logActivity(userId, "clear_data", "User cleared all data");
      res.json({ message: "All data cleared successfully" });
    } catch (error) {
      console.error("Error clearing data:", error);
      res.status(500).json({ message: "Failed to clear data" });
    }
  });

  app.get("/api/devices/:id/triangulate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      const observations = await storage.getObservations(userId);
      const deviceObs = observations.filter(o => o.deviceId === deviceId);
      const result = triangulateDevice(deviceObs);
      if (!result) {
        return res.json({ success: false, message: "Insufficient observation data for triangulation (need 2+ observations with location and signal strength)" });
      }
      res.json({ success: true, triangulation: result });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/devices/:id/analyze", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      const observations = await storage.getObservations(userId);
      const deviceObs = observations
        .filter(o => o.deviceId === deviceId)
        .sort((a, b) => new Date(b.observedAt!).getTime() - new Date(a.observedAt!).getTime());

      const associations = await storage.getAssociationsForDevice(deviceId);
      const allDevices = await storage.getDevices(userId);
      const linkedDeviceIds = new Set<number>();
      associations.forEach(a => {
        linkedDeviceIds.add(a.deviceId1 === deviceId ? a.deviceId2 : a.deviceId1);
      });
      const linkedDevices = allDevices.filter(d => linkedDeviceIds.has(d.id));

      const macPrefix = device.macAddress ? device.macAddress.split(":").slice(0, 3).join(":").toUpperCase() : null;

      const deviceData = {
        name: device.name,
        macAddress: device.macAddress,
        macOuiPrefix: macPrefix,
        uuid: device.uuid,
        manufacturer: device.manufacturer,
        model: device.model,
        deviceType: device.deviceType,
        signalType: device.signalType,
        firstSeen: device.firstSeenAt,
        lastSeen: device.lastSeenAt,
        isTracked: device.isTracked,
        isFlagged: device.isFlagged,
        notes: device.notes,
        metadata: device.metadata,
        observationCount: deviceObs.length,
        observations: deviceObs.slice(0, 30).map(o => ({
          timestamp: o.observedAt,
          signalStrength: o.signalStrength,
          frequency: o.frequency,
          latitude: o.latitude,
          longitude: o.longitude,
          altitude: o.altitude,
          channel: o.channel,
          protocol: o.protocol,
          encryption: o.encryption,
          rawData: o.rawData?.substring(0, 100),
          hexData: o.hexData?.substring(0, 100),
        })),
        associations: associations.map(a => ({
          type: a.associationType,
          confidence: a.confidence,
          reasoning: a.reasoning,
          linkedDeviceId: a.deviceId1 === deviceId ? a.deviceId2 : a.deviceId1,
          linkedDeviceName: linkedDevices.find(d => d.id === (a.deviceId1 === deviceId ? a.deviceId2 : a.deviceId1))?.name || "Unknown",
          linkedDeviceType: linkedDevices.find(d => d.id === (a.deviceId1 === deviceId ? a.deviceId2 : a.deviceId1))?.deviceType || "Unknown",
          linkedDeviceSignalType: linkedDevices.find(d => d.id === (a.deviceId1 === deviceId ? a.deviceId2 : a.deviceId1))?.signalType || "unknown",
          observationCount: a.observationCount,
          isConfirmed: a.isConfirmed,
        })),
        linkedDevicesSummary: linkedDevices.map(d => ({
          id: d.id,
          name: d.name,
          macAddress: d.macAddress,
          manufacturer: d.manufacturer,
          deviceType: d.deviceType,
          signalType: d.signalType,
        })),
      };

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are SIGINT Hub's AI multi-INT intelligence analyst. Generate a comprehensive all-source intelligence report about a detected device/signal using the full spectrum of intelligence disciplines. Your report should be thorough, technical, and actionable. Cross-reference all available data to build the most complete picture.

Structure your report with these sections using markdown headers:

## Device Identification & OUI Analysis
Identify the device type, manufacturer details, and product line. Perform OUI (Organizationally Unique Identifier) analysis on the MAC address prefix to identify the chipset vendor vs. the product manufacturer. Discuss what the MAC OUI reveals about the hardware supply chain (e.g., "OUI A4:83:E7 is registered to Apple Inc., consistent with iPhone/iPad hardware"). If the OUI prefix suggests a different manufacturer than the device name, note this discrepancy as it may indicate MAC spoofing or whitelabel hardware. Analyze any UUID patterns for device family identification.

## SIGINT Assessment (Signals Intelligence)
Analyze the signal characteristics through a SIGINT lens:
- Frequency bands and what they indicate about transmission capabilities
- Protocol analysis (BLE version, WiFi standard, LoRa modulation, etc.)
- Encryption posture assessment (AES-CCM, WPA3, open, etc.) and what it reveals about security awareness
- Signal strength (RSSI) patterns and what they suggest about device proximity and power output
- Temporal signal patterns - when does this device transmit? Duty cycle analysis
- Channel hopping behavior and frequency agility

## GEOINT Assessment (Geospatial Intelligence)
Analyze all location data through a GEOINT lens:
- Plot movement patterns and calculate speed/heading if multiple observations exist
- Determine area of operation (AO) and assess whether positions indicate indoor/outdoor, urban/rural, residential/commercial
- Identify significant locations near coordinates (airports, government buildings, military installations, borders, critical infrastructure)
- For telemetry-broadcasting devices (LoRa/Meshtastic/ADS-B), note whether positions are from device telemetry vs. collection sensor proximity
- Calculate geospatial spread and determine if the device is stationary, mobile, or following a route

## MASINT Assessment (Measurement & Signature Intelligence)
Analyze the device's measurable signatures:
- RF emission signature: power output estimation from RSSI at known distances
- Frequency fingerprint: precise frequency offset from nominal center frequency
- Protocol timing signatures: beacon interval, transmission duration, modulation characteristics
- If altitude data available: elevation analysis for airborne vs ground-based classification
- Environmental signature: what does the frequency/protocol combination reveal about the operating environment

## OSINT Cross-Reference (Open Source Intelligence)
Perform comprehensive OSINT analysis:
- **MAC/OUI Registry**: Cross-reference the IEEE OUI database for the MAC prefix. Identify the registered organization, registration date, and address
- **FCC ID Lookup**: Based on the manufacturer and model, identify likely FCC ID filings, certification dates, maximum allowed power output
- **CVE Database**: Search for known vulnerabilities (CVEs) associated with this device manufacturer, model, firmware, or protocol version. List specific CVE IDs where applicable
- **Product Intelligence**: Known specifications, firmware versions, default configurations, factory reset behaviors
- **Manufacturer OSINT**: Company background, country of origin, known government/military contracts, supply chain analysis
- **Dark Web / Threat Intel**: Known exploit tools targeting this device class (e.g., BLE spoofing tools, WiFi deauth frameworks, SDR replay attacks)
- **Regulatory Filings**: FCC, CE, or other regulatory certifications that reveal technical capabilities

## COMINT Implications (Communications Intelligence)
If the device is communications-capable:
- What communications does this device facilitate or relay?
- Network topology implications (mesh node, gateway, endpoint)
- Potential for intercepting or monitoring communications through this device
- Encryption strength assessment for communications in transit

## Association & Link Analysis
If this device has associations with other detected devices:
- Analyze the nature and strength of each link
- What intelligence discipline (SIGINT/GEOINT/MASINT) established each association?
- Cross-reference linked device types to build a picture of the operator's device ecosystem
- Identify potential carrier/device relationships (e.g., phone + wearable + earbuds = same person)
- Network analysis: is this device a hub, spoke, or isolated node?

## Threat Assessment & Risk Profile
Evaluate through a counter-intelligence lens:
- Is this a known surveillance, tracking, or reconnaissance device?
- Could it be part of a technical surveillance countermeasures (TSCM) threat?
- Classification: benign consumer device, dual-use, or purpose-built intelligence collection tool?
- Risk level: **LOW** / **MEDIUM** / **HIGH** / **CRITICAL** with justification
- Indicators of compromise (IOCs) or suspicious behaviors

## Behavioral Profile & Pattern of Life
Analyze the temporal and spatial patterns:
- Activity schedule: when does the device appear and disappear?
- Dwell time analysis at each location
- Movement velocity and pattern classification (random walk, linear transit, patrol pattern, static)
- What does this pattern suggest about the device operator's routine, intent, and sophistication?
- Anomaly detection: anything unusual compared to typical devices of this class?

## Actionable Recommendations
Provide specific, prioritized next steps:
- Immediate actions (flag, track, alert configuration)
- Additional collection tasking (which sensors/frequencies to monitor)
- Counter-measures if threat is identified
- Cross-cueing opportunities with other intelligence sources
- Recommended association analysis with nearby devices
- Suggested OSINT queries for deeper investigation

Be specific, technical, and provide real-world context. Use proper intelligence community terminology and tradecraft. Reference specific technical standards (IEEE 802.11, Bluetooth SIG specs, 3GPP, ITU allocations) where relevant. If data is insufficient for a section, state what additional collection would enable that analysis.`
          },
          {
            role: "user",
            content: `Generate a full multi-INT intelligence report for this device. Cross-reference all available data including associations with other detected devices:\n\n${JSON.stringify(deviceData, null, 2)}`
          }
        ],
        stream: true,
        max_tokens: 6000,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error analyzing device:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Analysis failed" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ message: "Failed to analyze device" });
      }
    }
  });

  // ============ SYSTEM INFO ============
  app.get("/api/system/info", isAuthenticated, async (_req: any, res) => {
    try {
      const capabilities = await getSystemCapabilities();
      res.json(capabilities);
    } catch (error) {
      console.error("Error getting system info:", error);
      res.status(500).json({ message: "Failed to get system info" });
    }
  });

  // ============ NMAP SCANNING ============
  app.get("/api/nmap/status", isAuthenticated, async (_req: any, res) => {
    try {
      const available = await checkNmapAvailable();
      const version = available ? await getNmapVersion() : "Not installed";
      res.json({ available, version });
    } catch (error) {
      res.status(500).json({ message: "Failed to check nmap status" });
    }
  });

  app.post("/api/nmap/scan", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        target: z.string().min(1).max(253),
        scanType: z.enum(["ping", "quick", "port"]).default("ping"),
        ports: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const { target, scanType, ports } = parsed.data;
      let result;

      switch (scanType) {
        case "ping":
          result = await runPingScan(target);
          break;
        case "quick":
          result = await runQuickScan(target);
          break;
        case "port":
          result = await runPortScan(target, ports);
          break;
      }

      if (result.error) {
        return res.status(400).json({ message: result.error });
      }

      const userId = req.user.claims.sub;
      await storage.logActivity(userId, "nmap_scan", `Ran ${scanType} scan on ${target} - found ${result.hosts.length} hosts`);

      res.json(result);
    } catch (error) {
      console.error("Error running nmap scan:", error);
      res.status(500).json({ message: "Scan failed" });
    }
  });

  // ============ MESHTASTIC ============
  app.get("/api/meshtastic/status", isAuthenticated, async (_req: any, res) => {
    try {
      const status = getMeshtasticStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get Meshtastic status" });
    }
  });

  app.get("/api/meshtastic/connections", isAuthenticated, async (_req: any, res) => {
    try {
      res.json(getConnections());
    } catch (error) {
      res.status(500).json({ message: "Failed to get connections" });
    }
  });

  app.post("/api/meshtastic/connect", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        host: z.string().min(1).max(253),
        port: z.number().int().min(1).max(65535).default(4403),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const connection = await connectToDevice(parsed.data.host, parsed.data.port);
      const userId = req.user.claims.sub;
      await storage.logActivity(userId, "meshtastic_connect", `Connected to Meshtastic device at ${parsed.data.host}:${parsed.data.port}`);

      res.json(connection);
    } catch (error: any) {
      console.error("Error connecting to Meshtastic:", error);
      const msg = error?.message || "Connection failed";
      if (msg.includes("private") || msg.includes("Invalid port")) {
        return res.status(400).json({ message: msg });
      }
      res.status(500).json({ message: "Connection failed" });
    }
  });

  app.post("/api/meshtastic/disconnect", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ message: "Connection ID required" });
      const success = disconnectDevice(id);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ message: "Disconnect failed" });
    }
  });

  app.get("/api/meshtastic/nodes/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      const nodes = await fetchNodes(req.params.connectionId);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch nodes" });
    }
  });

  app.post("/api/meshtastic/message", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        connectionId: z.string(),
        text: z.string().min(1).max(228),
        to: z.number().optional(),
        channel: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const success = await sendMessage(parsed.data.connectionId, parsed.data.text, parsed.data.to, parsed.data.channel);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ============ SDR ============
  app.get("/api/sdr/status", isAuthenticated, async (_req: any, res) => {
    try {
      const status = await getSDRStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get SDR status" });
    }
  });

  app.get("/api/sdr/tools", isAuthenticated, async (_req: any, res) => {
    try {
      const tools = await checkSDRToolsAvailable();
      res.json(tools);
    } catch (error) {
      res.status(500).json({ message: "Failed to check SDR tools" });
    }
  });

  app.get("/api/sdr/devices", isAuthenticated, async (_req: any, res) => {
    try {
      const devices = await getSDRDevices();
      res.json(devices);
    } catch (error) {
      res.status(500).json({ message: "Failed to get SDR devices" });
    }
  });

  app.post("/api/sdr/scan", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        startFreqMHz: z.number().min(24).max(1766),
        endFreqMHz: z.number().min(24).max(1766),
        binSizeHz: z.number().int().min(1000).max(1000000).default(10000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const result = await runPowerScan(parsed.data.startFreqMHz, parsed.data.endFreqMHz, parsed.data.binSizeHz);
      const userId = req.user.claims.sub;
      await storage.logActivity(userId, "sdr_scan", `SDR scan ${parsed.data.startFreqMHz}-${parsed.data.endFreqMHz} MHz - found ${result.signals.length} signals`);

      res.json(result);
    } catch (error) {
      console.error("Error running SDR scan:", error);
      res.status(500).json({ message: "SDR scan failed" });
    }
  });

  // ============ ASSOCIATIONS ============
  app.get("/api/associations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const associations = await storage.getAssociations(userId);
      res.json(associations);
    } catch (error) {
      res.status(500).json({ message: "Failed to get associations" });
    }
  });

  app.get("/api/associations/device/:id", isAuthenticated, async (req: any, res) => {
    try {
      const associations = await storage.getAssociationsForDevice(parseInt(req.params.id));
      res.json(associations);
    } catch (error) {
      res.status(500).json({ message: "Failed to get device associations" });
    }
  });

  app.post("/api/associations/analyze", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userDevices = await storage.getDevices(userId);
      const userObservations = await storage.getObservations(userId);
      const existing = await storage.getAssociations(userId);

      const results = analyzeDeviceAssociations(userDevices, userObservations, existing);

      const created = [];
      for (const r of results) {
        const assoc = await storage.createAssociation({
          userId,
          deviceId1: r.deviceId1,
          deviceId2: r.deviceId2,
          associationType: r.associationType,
          confidence: r.confidence,
          reasoning: r.reasoning,
          evidence: r.evidence,
          observationCount: 1,
          isConfirmed: false,
        });
        created.push(assoc);
      }

      await storage.logActivity(userId, "association_analysis", `Analyzed ${userDevices.length} devices, found ${created.length} new associations`);
      res.json({ analyzed: userDevices.length, newAssociations: created.length, associations: created });
    } catch (error) {
      console.error("Error analyzing associations:", error);
      res.status(500).json({ message: "Association analysis failed" });
    }
  });

  app.post("/api/associations", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        deviceId1: z.number().int(),
        deviceId2: z.number().int(),
        associationType: z.enum(["co_movement", "signal_correlation", "command_control", "network_peer", "proximity_pattern", "frequency_sharing", "temporal_correlation", "manual", "geoint_triangulation"]),
        confidence: z.number().min(0).max(100).default(50),
        reasoning: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const userId = req.user.claims.sub;
      const assoc = await storage.createAssociation({
        userId,
        ...parsed.data,
        evidence: { source: "manual" },
        observationCount: 1,
        isConfirmed: parsed.data.associationType === "manual",
      });
      res.json(assoc);
    } catch (error) {
      res.status(500).json({ message: "Failed to create association" });
    }
  });

  app.delete("/api/associations/all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.deleteAllAssociations(userId);
      await storage.logActivity(userId, "delete_all_associations", `Cleared ${count} associations`);
      res.json({ success: true, deleted: count });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear associations" });
    }
  });

  app.delete("/api/associations/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteAssociation(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete association" });
    }
  });

  app.get("/api/associations/types", isAuthenticated, async (_req: any, res) => {
    res.json(ASSOCIATION_TYPE_LABELS);
  });

  // ============ EXPORT / IMPORT ============
  app.get("/api/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userDevices = await storage.getDevices(userId);
      const userObservations = await storage.getObservations(userId);
      const userAlerts = await storage.getAlerts(userId);
      const userSensors = await storage.getSensors(userId);
      const userAssociations = await storage.getAssociations(userId);

      const exportData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        data: {
          devices: userDevices,
          observations: userObservations,
          alerts: userAlerts,
          sensors: userSensors,
          associations: userAssociations,
        },
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="sigint-export-${new Date().toISOString().split("T")[0]}.json"`);
      res.json(exportData);
    } catch (error) {
      res.status(500).json({ message: "Export failed" });
    }
  });

  app.post("/api/import", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { data } = req.body;
      if (!data) return res.status(400).json({ message: "No data provided" });

      let imported = { devices: 0, observations: 0, alerts: 0, sensors: 0, associations: 0 };
      const idMap = new Map<number, number>();

      if (data.devices) {
        for (const d of data.devices) {
          const existing = d.macAddress ? await storage.getDeviceByMac(userId, d.macAddress) : null;
          if (existing) {
            idMap.set(d.id, existing.id);
            continue;
          }
          const created = await storage.createDevice({
            userId,
            name: d.name,
            macAddress: d.macAddress,
            uuid: d.uuid,
            manufacturer: d.manufacturer,
            model: d.model,
            deviceType: d.deviceType,
            signalType: d.signalType || "unknown",
            notes: d.notes,
            isTracked: d.isTracked,
            isFlagged: d.isFlagged,
            metadata: d.metadata,
          });
          idMap.set(d.id, created.id);
          imported.devices++;
        }
      }

      if (data.observations) {
        for (const o of data.observations) {
          const deviceId = idMap.get(o.deviceId) || o.deviceId;
          await storage.createObservation({
            deviceId,
            userId,
            signalType: o.signalType,
            signalStrength: o.signalStrength,
            frequency: o.frequency,
            latitude: o.latitude,
            longitude: o.longitude,
            altitude: o.altitude,
            heading: o.heading,
            speed: o.speed,
            rawData: o.rawData,
            hexData: o.hexData,
            asciiData: o.asciiData,
            channel: o.channel,
            protocol: o.protocol,
            encryption: o.encryption,
            metadata: o.metadata,
          });
          imported.observations++;
        }
      }

      if (data.associations) {
        for (const a of data.associations) {
          const d1 = idMap.get(a.deviceId1) || a.deviceId1;
          const d2 = idMap.get(a.deviceId2) || a.deviceId2;
          await storage.createAssociation({
            userId,
            deviceId1: d1,
            deviceId2: d2,
            associationType: a.associationType,
            confidence: a.confidence,
            reasoning: a.reasoning,
            evidence: a.evidence,
            observationCount: a.observationCount,
            isConfirmed: a.isConfirmed,
          });
          imported.associations++;
        }
      }

      await storage.logActivity(userId, "data_import", `Imported ${imported.devices} devices, ${imported.observations} observations, ${imported.associations} associations`);
      res.json({ success: true, imported });
    } catch (error) {
      console.error("Error importing data:", error);
      res.status(500).json({ message: "Import failed" });
    }
  });

  app.get("/api/trusted-users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trusted = await storage.getTrustedUsers(userId);
      res.json(trusted);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/trusted-users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { email, alias } = req.body;
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ message: "Valid email address required" });
      }
      const trusted = await storage.createTrustedUser({
        userId,
        trustedEmail: email.trim().toLowerCase(),
        trustedAlias: alias || null,
      });
      res.json(trusted);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/trusted-users/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteTrustedUser(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/osint-links", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string) : undefined;
      const links = await storage.getOsintLinks(userId, deviceId);
      res.json(links);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/osint-links", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { deviceId, linkType, alias, realName, source, sourceUrl, notes, confidence, metadata } = req.body;
      if (!deviceId || !linkType) {
        return res.status(400).json({ message: "deviceId and linkType are required" });
      }
      const link = await storage.createOsintLink({
        userId,
        deviceId,
        linkType,
        alias: alias || null,
        realName: realName || null,
        source: source || null,
        sourceUrl: sourceUrl || null,
        notes: notes || null,
        confidence: confidence || 50,
        metadata: metadata || null,
      });
      res.json(link);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/osint-links/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteOsintLink(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/custom-signatures", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sigs = await storage.getCustomSignatures(userId);
      res.json(sigs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/custom-signatures", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { category, name, terms, signalTypes, description } = req.body;
      if (!category || !name || !terms || !signalTypes) {
        return res.status(400).json({ message: "category, name, terms, and signalTypes are required" });
      }
      const sig = await storage.createCustomSignature({
        userId,
        category,
        name,
        terms: Array.isArray(terms) ? terms : [terms],
        signalTypes: Array.isArray(signalTypes) ? signalTypes : [signalTypes],
        description: description || null,
      });
      res.json(sig);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/custom-signatures/import-csv", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { category, csvData } = req.body;
      if (!category || !csvData) {
        return res.status(400).json({ message: "category and csvData are required" });
      }
      const lines = csvData.split("\n").filter((l: string) => l.trim());
      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV must have a header row and at least one data row" });
      }
      const header = lines[0].toLowerCase().split(",").map((h: string) => h.trim());
      const nameIdx = header.indexOf("name");
      const termsIdx = header.indexOf("terms");
      const signalIdx = header.findIndex((h: string) => h === "signaltypes" || h === "signal_types" || h === "signal types" || h === "signaltype");
      const descIdx = header.indexOf("description");

      if (nameIdx === -1 || termsIdx === -1) {
        return res.status(400).json({ message: "CSV must have 'name' and 'terms' columns" });
      }

      const imported: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c: string) => c.trim());
        const name = cols[nameIdx];
        const terms = cols[termsIdx]?.split("|").map((t: string) => t.trim()).filter(Boolean) || [];
        const signalTypes = signalIdx !== -1 ? cols[signalIdx]?.split("|").map((t: string) => t.trim()).filter(Boolean) || ["unknown"] : ["unknown"];
        const description = descIdx !== -1 ? cols[descIdx] || null : null;

        if (name && terms.length > 0) {
          const sig = await storage.createCustomSignature({
            userId,
            category,
            name,
            terms,
            signalTypes,
            description,
          });
          imported.push(sig);
        }
      }
      res.json({ success: true, imported: imported.length, signatures: imported });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/custom-signatures/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteCustomSignature(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/custom-signatures/category/:category", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.deleteCustomSignaturesByCategory(userId, req.params.category);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/devices/search-signature", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const termsParam = req.query.terms as string;
      if (!termsParam) {
        return res.status(400).json({ message: "terms parameter is required" });
      }
      const terms = termsParam.split("|");
      const allDevices = await storage.getDevices(userId);
      const matches = allDevices.filter(device => {
        const searchableFields = [
          device.name, device.manufacturer, device.macAddress, device.deviceType,
          device.model, device.uuid,
        ].filter(Boolean).map(f => f!.toLowerCase());
        return terms.some(term => {
          const lower = term.toLowerCase();
          return searchableFields.some(field => field.includes(lower));
        });
      });
      res.json(matches);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/devices/classify-signatures", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const allDevices = await storage.getDevices(userId);
      const customSigs = await storage.getCustomSignatures(userId);
      let classified = 0;

      for (const device of allDevices) {
        if (device.deviceType && device.deviceType !== "Unknown" && device.deviceType !== "unknown") continue;
        const searchableFields = [device.name, device.manufacturer, device.macAddress, device.model, device.uuid]
          .filter(Boolean).map(f => f!.toLowerCase());

        let matched = false;
        for (const [catalogName, sig] of Object.entries(DEVICE_BROADCAST_SIGNATURES_SERVER)) {
          if (sig.terms.some(term => searchableFields.some(field => field.includes(term.toLowerCase())))) {
            await storage.updateDevice(device.id, { deviceType: catalogName });
            classified++;
            matched = true;
            break;
          }
        }
        if (!matched) {
          for (const sig of customSigs) {
            if (sig.terms && sig.terms.some(term => searchableFields.some(field => field.includes(term.toLowerCase())))) {
              await storage.updateDevice(device.id, { deviceType: sig.name });
              classified++;
              break;
            }
          }
        }
      }
      res.json({ success: true, classified, total: allDevices.length });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/alerts/hits", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const allAlerts = await storage.getAlerts(userId);
      const allDevices = await storage.getDevices(userId);
      const activeAlerts = allAlerts.filter(a => a.status === "active" || a.status === "triggered");

      const hits: Array<{ alert: typeof allAlerts[0]; matchedDevices: typeof allDevices }> = [];

      for (const alert of activeAlerts) {
        const criteria = alert.criteria as any;
        if (!criteria) continue;

        let matchedDevices: typeof allDevices = [];

        if (criteria.type === "catalog_broadcast_match" && criteria.terms) {
          const terms = criteria.terms as string[];
          matchedDevices = allDevices.filter(device => {
            const fields = [device.name, device.manufacturer, device.macAddress, device.deviceType, device.model]
              .filter(Boolean).map(f => f!.toLowerCase());
            return terms.some(term => fields.some(field => field.includes(term.toLowerCase())));
          });
          if (criteria.category) {
            const catDevices = allDevices.filter(d => d.deviceType && d.deviceType.toLowerCase() === (criteria.category as string).toLowerCase());
            for (const d of catDevices) {
              if (!matchedDevices.some(m => m.id === d.id)) matchedDevices.push(d);
            }
          }
        } else if (criteria.searchTerm) {
          const searchTerm = (criteria.searchTerm as string).toLowerCase();
          matchedDevices = allDevices.filter(device => {
            const fields = [device.name, device.manufacturer, device.macAddress, device.deviceType, device.model]
              .filter(Boolean).map(f => f!.toLowerCase());
            return fields.some(field => field.includes(searchTerm));
          });
        }

        if (matchedDevices.length > 0) {
          if (alert.status === "active") {
            await storage.updateAlert(alert.id, { status: "triggered" } as any);
            alert.status = "triggered" as any;
          }
          hits.push({ alert, matchedDevices });
        }
      }

      res.json({ hits, totalHits: hits.reduce((sum, h) => sum + h.matchedDevices.length, 0) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
