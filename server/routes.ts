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
import { analyzeDeviceAssociations, ASSOCIATION_TYPE_LABELS } from "./services/association-analyzer";

const updateProfileSchema = z.object({
  dataMode: z.enum(["local", "friends", "public", "osint"]).optional(),
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
      const device = await storage.createDevice({ ...parsed.data, userId });
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

      const deviceData = {
        name: device.name,
        macAddress: device.macAddress,
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
        observations: deviceObs.slice(0, 20).map(o => ({
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
            content: `You are SIGINT Hub's AI intelligence analyst. Generate a comprehensive intelligence report about a detected device/signal based on the provided data. Your report should be thorough, technical, and actionable.

Structure your report with these sections using markdown headers:
## Device Identification
Identify the device type, manufacturer details, known product lines, and any identifiers (MAC OUI lookup, UUID analysis).

## Signal Analysis
Analyze the signal characteristics - frequency bands, protocols, encryption, signal strength patterns, and what they reveal about the device.

## Geospatial Intelligence
Analyze location data - movement patterns, area of operation, known locations near coordinates, and any patterns in the GPS data.

## Threat Assessment
Evaluate potential security implications - is this a known surveillance device? Tracking device? Could it be used maliciously? What is the risk level (Low/Medium/High/Critical)?

## OSINT Findings
Based on the device identifiers (MAC address, manufacturer, model), provide what is publicly known - product specs, known vulnerabilities, common uses, any CVEs, regulatory filings (FCC ID lookups), and relevant public information.

## Behavioral Profile
Analyze observation patterns - timing patterns, frequency of appearance, movement characteristics, and what this suggests about the device operator.

## Recommendations
Provide actionable next steps for the analyst - what to monitor, potential countermeasures, and additional data collection suggestions.

Be specific, technical, and provide real-world context. If the MAC address is available, discuss the OUI (manufacturer prefix). If coordinates are available, describe the general area. Use technical SIGINT terminology appropriately.`
          },
          {
            role: "user",
            content: `Analyze this device and generate a full intelligence report:\n\n${JSON.stringify(deviceData, null, 2)}`
          }
        ],
        stream: true,
        max_tokens: 4096,
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

  return httpServer;
}
