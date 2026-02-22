import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated as replitIsAuthenticated } from "./replit_integrations/auth";
import type { RequestHandler } from "express";

let isAuthenticated: RequestHandler = replitIsAuthenticated;
import { z } from "zod";
import crypto from "crypto";
import { type CollectorApiKey } from "@shared/schema";
import OpenAI from "openai";
import { checkNmapAvailable, getNmapVersion, runPingScan, runPortScan, runQuickScan, runDiscoveryScan } from "./services/nmap-scanner";
import { connectToDevice, disconnectDevice, getConnections, getConnection, fetchNodes, sendMessage, getMeshtasticStatus, getMessages, getChannels, updateChannel, getRadioConfig, updateRadioConfig, getMeshcoreConfig, updateMeshcoreConfig, getTopology, getAllNodes, getAllTopology, getAvailableRegions, getAvailableModemPresets, getAvailableNodeRoles, getAvailableHwModels, getConnectionUptime, removeConnection } from "./services/meshtastic-service";
import { checkSDRToolsAvailable, getSDRDevices, runPowerScan, getSDRStatus, generateRealisticSpectrum, generateWaterfallFrame, FREQUENCY_PRESETS, identifySignal } from "./services/sdr-service";
import { getSystemCapabilities } from "./services/system-info";
import { getNodeConfig, getScannerStatus, startLinuxScanner, stopLinuxScanner, setDeviceCallback, runManualScan, checkAndInstallDependencies, getDependencyStatus, startSDRAudio, stopSDRAudio, tuneSDRAudio, getSDRAudioStatus, type ScannedBLEDevice, type ScannedWiFiDevice, type ScannedSDRSignal, type SDRAudioMode } from "./services/linux-scanner";
import { analyzeDeviceAssociations, ASSOCIATION_TYPE_LABELS, triangulateDevice } from "./services/association-analyzer";
import { matchDeviceToSignature, DEVICE_BROADCAST_SIGNATURES_SERVER } from "./services/signature-matcher";
import { getTierFeatures, isFeatureAllowed, isDataModeAllowed, TIER_FEATURES, FEATURE_LABELS } from "../shared/tier-features";

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
  const isStandalone = !process.env.REPL_ID;

  try {
    await setupAuth(app);
    registerAuthRoutes(app);
  } catch (error) {
    if (isStandalone) {
      console.log("[routes] Replit Auth unavailable - setting up standalone mode");
      const session = await import("express-session");
      const crypto = await import("crypto");
      const connectPg = (await import("connect-pg-simple")).default;
      const os = await import("os");

      const pgStore = connectPg(session.default);
      const sessionStore = new pgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
        ttl: 7 * 24 * 60 * 60,
        tableName: "sessions",
      });

      app.use(session.default({
        secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
      }));

      const localUserId = "local-admin";
      const localEmail = "admin@localhost";
      const hostname = os.hostname();

      try {
        await storage.upsertUser({ id: localUserId, email: localEmail, firstName: hostname, lastName: "Operator", profileImageUrl: null });
      } catch (e) {
        console.error("[routes] Could not create local admin user:", e);
      }

      app.use((req: any, _res: any, next: any) => {
        if (!req.user) {
          req.user = {
            claims: { sub: localUserId, email: localEmail, exp: Math.floor(Date.now() / 1000) + 86400 * 365 },
            expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
          };
          req.isAuthenticated = () => true;
        }
        next();
      });

      app.get("/api/login", (_req: any, res: any) => res.redirect("/"));
      app.get("/api/callback", (_req: any, res: any) => res.redirect("/"));
      app.get("/api/logout", (_req: any, res: any) => res.redirect("/"));
      app.get("/api/auth/user", async (req: any, res: any) => {
        try {
          const user = await storage.getUser(localUserId);
          res.json(user);
        } catch (e) {
          res.json({ id: localUserId, email: localEmail, firstName: hostname, lastName: "Operator" });
        }
      });

      isAuthenticated = ((req: any, _res: any, next: any) => {
        if (!req.user) {
          req.user = {
            claims: { sub: localUserId, email: localEmail, exp: Math.floor(Date.now() / 1000) + 86400 * 365 },
            expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
          };
          req.isAuthenticated = () => true;
        }
        next();
      }) as RequestHandler;

      console.log(`[routes] Standalone mode active - auto-signed in as ${hostname} Operator`);
    } else {
      throw error;
    }
  }

  

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
      if (parsed.data.dataMode) {
        if (!isDataModeAllowed(existing.tier, parsed.data.dataMode)) {
          return res.status(403).json({ message: `Data mode '${parsed.data.dataMode}' is not available on your current tier. Upgrade to access more data modes.` });
        }
        updates.dataMode = parsed.data.dataMode;
      }
      if (parsed.data.settings) updates.settings = parsed.data.settings;
      const { id: _id, ...existingWithoutId } = existing;
      const updated = await storage.upsertUserProfile({ ...existingWithoutId, ...updates });
      res.json(updated);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get("/api/tier-features", (_req: any, res) => {
    res.json({ tiers: TIER_FEATURES, featureLabels: FEATURE_LABELS });
  });

  app.get("/api/tier-features/:tier", (req: any, res) => {
    const tier = req.params.tier;
    const features = getTierFeatures(tier);
    res.json(features);
  });

  app.get("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile || profile.tier !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const enrichedUsers = await storage.getAdminUserList();
      res.json(enrichedUsers);
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/activity", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const profile = await storage.getUserProfile(userId);
      if (!profile || profile.tier !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const targetUserId = req.query.userId as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const logs = targetUserId
        ? await storage.getActivityLog(targetUserId, limit)
        : await storage.getAllActivityLog(limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity log:", error);
      res.status(500).json({ message: "Failed to fetch activity log" });
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
      const { id, ...profileWithoutId } = targetProfile;
      const updates: any = {};
      if (parsed.data.tier) updates.tier = parsed.data.tier;
      if (parsed.data.storageLimitBytes !== undefined) updates.storageLimitBytes = parsed.data.storageLimitBytes;
      const updated = await storage.upsertUserProfile({ ...profileWithoutId, ...updates });
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
      const profile = await storage.getUserProfile(userId);
      const tier = profile?.tier || "free";
      if (!isFeatureAllowed(tier, "aiAnalysis")) {
        return res.status(403).json({ message: "AI analysis is not available on your current tier. Upgrade to Professional or higher." });
      }
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
            content: `You are ArmsLength SigInt's AI multi-INT intelligence analyst. Generate a comprehensive all-source intelligence report about a detected device/signal using the full spectrum of intelligence disciplines. Your report should be thorough, technical, and actionable. Cross-reference all available data to build the most complete picture.

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

  // ============ NODE IDENTITY & LINUX SCANNER ============
  app.get("/api/system/node-info", isAuthenticated, async (_req: any, res) => {
    try {
      const config = getNodeConfig();
      const status = getScannerStatus();
      const capabilities = await getSystemCapabilities();
      const networkAddresses = capabilities.networkInterfaces
        .filter(i => !i.internal)
        .flatMap(i => i.addresses.filter(a => a.includes("IPv4")));

      res.json({
        nodeId: config.nodeId,
        nodeName: config.nodeName,
        platform: config.platform,
        role: config.role,
        createdAt: config.createdAt,
        syncEnabled: config.syncEnabled,
        syncTargetUrl: config.syncTargetUrl,
        scanner: status,
        system: capabilities.system,
        networkAddresses,
        tools: capabilities.tools.filter(t => t.installed).map(t => t.name),
      });
    } catch (error) {
      console.error("Error getting node info:", error);
      res.status(500).json({ message: "Failed to get node info" });
    }
  });

  app.get("/api/scanner/status", isAuthenticated, async (_req: any, res) => {
    try {
      const status = getScannerStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get scanner status" });
    }
  });

  app.post("/api/scanner/start", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      setDeviceCallback(async (device, type, gps) => {
        try {
          if (type === "sdr") {
            const sdrSignal = device as ScannedSDRSignal;
            const freqMHz = sdrSignal.frequency / 1e6;
            const sdrMac = `SDR:${freqMHz.toFixed(3)}MHz`;
            const existing = await storage.getDevices(userId);
            const alreadyExists = existing.some(d => d.macAddress === sdrMac);
            if (alreadyExists) return;

            const nodeConfig = getNodeConfig();
            const newDevice = await storage.createDevice({
              userId,
              name: sdrSignal.label || `SDR Signal ${freqMHz.toFixed(3)} MHz`,
              macAddress: sdrMac,
              signalType: "sdr",
              deviceType: `SDR ${sdrSignal.band} Signal`,
              manufacturer: sdrSignal.band,
              notes: `Auto-discovered by SDR scan at ${freqMHz.toFixed(3)} MHz (${sdrSignal.power.toFixed(1)} dB) on node ${nodeConfig.nodeId}.`,
              metadata: { collectorNodeId: nodeConfig.nodeId, frequency: sdrSignal.frequency, power: sdrSignal.power, bandwidth: sdrSignal.bandwidth },
            });

            const obsData: any = {
              deviceId: newDevice.id,
              userId,
              signalType: "sdr",
              signalStrength: sdrSignal.power,
              frequency: freqMHz,
              protocol: sdrSignal.band,
            };

            if (gps) {
              obsData.latitude = gps.latitude;
              obsData.longitude = gps.longitude;
              obsData.altitude = gps.altitude;
              obsData.heading = gps.heading;
              obsData.speed = gps.speed;
            }

            await storage.createObservation(obsData);
            return;
          }

          const mac = (device as ScannedBLEDevice).macAddress || (device as ScannedWiFiDevice).macAddress;
          const existing = await storage.getDevices(userId);
          const alreadyExists = existing.some(d => d.macAddress === mac);
          if (alreadyExists) return;

          const name = type === "bluetooth"
            ? (device as ScannedBLEDevice).name
            : (device as ScannedWiFiDevice).ssid;

          const nodeConfig = getNodeConfig();
          const newDevice = await storage.createDevice({
            userId,
            name,
            macAddress: mac,
            signalType: type,
            deviceType: type === "bluetooth" ? "BLE Device" : "WiFi AP",
            manufacturer: type === "bluetooth" ? (device as ScannedBLEDevice).manufacturer : "Unknown",
            notes: `Auto-discovered by Linux scanner on node ${nodeConfig.nodeId}.`,
            metadata: { collectorNodeId: nodeConfig.nodeId },
          });

          const obsData: any = {
            deviceId: newDevice.id,
            userId,
            signalType: type,
            signalStrength: type === "bluetooth"
              ? (device as ScannedBLEDevice).rssi
              : (device as ScannedWiFiDevice).rssi,
            protocol: type === "bluetooth" ? "BLE" : "802.11",
          };

          if (type === "wifi") {
            obsData.channel = (device as ScannedWiFiDevice).channel;
            obsData.frequency = (device as ScannedWiFiDevice).frequency;
            obsData.encryption = (device as ScannedWiFiDevice).encryption;
          }

          if (gps) {
            obsData.latitude = gps.latitude;
            obsData.longitude = gps.longitude;
            obsData.altitude = gps.altitude;
            obsData.heading = gps.heading;
            obsData.speed = gps.speed;
          }

          await storage.createObservation(obsData);
        } catch (err: any) {
          if (!err?.message?.includes("duplicate")) {
            console.error("[scanner] Failed to save device:", err.message);
          }
        }
      });

      await startLinuxScanner();
      res.json({ message: "Scanner started", status: getScannerStatus() });
    } catch (error) {
      console.error("Error starting scanner:", error);
      res.status(500).json({ message: "Failed to start scanner" });
    }
  });

  app.post("/api/scanner/stop", isAuthenticated, async (_req: any, res) => {
    try {
      stopLinuxScanner();
      res.json({ message: "Scanner stopped", status: getScannerStatus() });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop scanner" });
    }
  });

  app.post("/api/scanner/manual-scan", isAuthenticated, async (req: any, res) => {
    try {
      const result = await runManualScan();
      res.json(result);
    } catch (error) {
      console.error("Error running manual scan:", error);
      res.status(500).json({ message: "Failed to run manual scan" });
    }
  });

  // ============ DEPENDENCY STATUS ============
  app.get("/api/scanner/dependencies", isAuthenticated, async (_req: any, res) => {
    try {
      const deps = getDependencyStatus();
      if (deps.length === 0) {
        const freshDeps = await checkAndInstallDependencies();
        res.json(freshDeps);
      } else {
        res.json(deps);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to check dependencies" });
    }
  });

  app.post("/api/scanner/dependencies/install", isAuthenticated, async (_req: any, res) => {
    try {
      const deps = await checkAndInstallDependencies();
      res.json(deps);
    } catch (error) {
      res.status(500).json({ message: "Failed to install dependencies" });
    }
  });

  // ============ SDR AUDIO ============
  app.get("/api/sdr/audio/status", isAuthenticated, async (_req: any, res) => {
    try {
      const status = getSDRAudioStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Failed to get SDR audio status" });
    }
  });

  app.post("/api/sdr/tune", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        frequencyHz: z.number().min(24e6).max(1766e6),
        mode: z.enum(["fm", "wfm", "am", "usb", "lsb", "raw"]).default("fm"),
        gain: z.string().default("auto"),
        squelch: z.number().int().min(0).max(500).default(0),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const result = await tuneSDRAudio(
        parsed.data.frequencyHz,
        parsed.data.mode as SDRAudioMode,
        parsed.data.gain,
        parsed.data.squelch
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to tune SDR audio" });
    }
  });

  app.post("/api/sdr/audio/start", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        frequencyHz: z.number().min(24e6).max(1766e6),
        mode: z.enum(["fm", "wfm", "am", "usb", "lsb", "raw"]).default("fm"),
        gain: z.string().default("auto"),
        squelch: z.number().int().min(0).max(500).default(0),
        sampleRate: z.number().int().min(8000).max(250000).default(48000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const result = await startSDRAudio(
        parsed.data.frequencyHz,
        parsed.data.mode as SDRAudioMode,
        parsed.data.gain,
        parsed.data.squelch,
        parsed.data.sampleRate
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to start SDR audio" });
    }
  });

  app.post("/api/sdr/audio/stop", isAuthenticated, async (_req: any, res) => {
    try {
      const result = stopSDRAudio();
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to stop SDR audio" });
    }
  });

  // ============ DATA SYNC (MULTI-NODE) ============
  app.post("/api/sync/push", async (req: any, res) => {
    try {
      const syncSecret = req.headers["x-sync-secret"] || req.headers["authorization"]?.replace("Bearer ", "");
      const expectedSecret = process.env.SYNC_SECRET;

      if (expectedSecret && syncSecret !== expectedSecret) {
        return res.status(401).json({ message: "Invalid sync secret. Set the SYNC_SECRET environment variable on both nodes to enable sync." });
      }

      const schema = z.object({
        sourceNodeId: z.string().min(1).max(128),
        devices: z.array(z.object({
          name: z.string().max(256).nullable().optional(),
          macAddress: z.string().max(64).nullable().optional(),
          signalType: z.string().max(32),
          deviceType: z.string().max(128).nullable().optional(),
          manufacturer: z.string().max(128).nullable().optional(),
          notes: z.string().max(1024).nullable().optional(),
          metadata: z.any().nullable().optional(),
        })).max(500),
        observations: z.array(z.object({
          localDeviceId: z.number(),
          signalType: z.string().max(32),
          signalStrength: z.number().nullable().optional(),
          latitude: z.number().nullable().optional(),
          longitude: z.number().nullable().optional(),
          altitude: z.number().nullable().optional(),
          frequency: z.number().nullable().optional(),
          channel: z.number().nullable().optional(),
          protocol: z.string().max(64).nullable().optional(),
          encryption: z.string().max(64).nullable().optional(),
        })).max(5000),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid sync payload", errors: parsed.error.issues });

      const { sourceNodeId, devices: syncDevices, observations: syncObs } = parsed.data;

      const systemUserId = `sync-${sourceNodeId}`;

      const deviceIdMap = new Map<number, number>();
      let devicesCreated = 0;
      let observationsCreated = 0;

      for (let i = 0; i < syncDevices.length; i++) {
        const d = syncDevices[i];
        try {
          const existingDevices = await storage.getDevices(systemUserId);
          const existing = existingDevices.find(e => e.macAddress === d.macAddress);

          if (existing) {
            deviceIdMap.set(i, existing.id);
          } else {
            const created = await storage.createDevice({
              userId: systemUserId,
              name: d.name || null,
              macAddress: d.macAddress || null,
              signalType: d.signalType as any,
              deviceType: d.deviceType || null,
              manufacturer: d.manufacturer || null,
              notes: `Synced from node ${sourceNodeId}. ${d.notes || ""}`.trim(),
              metadata: { ...(d.metadata || {}), sourceNodeId },
            });
            deviceIdMap.set(i, created.id);
            devicesCreated++;
          }
        } catch (err: any) {
          console.error(`[sync] Error saving device ${i}:`, err.message);
        }
      }

      for (const obs of syncObs) {
        const mappedDeviceId = deviceIdMap.get(obs.localDeviceId);
        if (!mappedDeviceId) continue;

        try {
          await storage.createObservation({
            deviceId: mappedDeviceId,
            userId: systemUserId,
            signalType: obs.signalType as any,
            signalStrength: obs.signalStrength ?? null,
            latitude: obs.latitude ?? null,
            longitude: obs.longitude ?? null,
            altitude: obs.altitude ?? null,
            frequency: obs.frequency ?? null,
            channel: obs.channel ?? null,
            protocol: obs.protocol ?? null,
            encryption: obs.encryption ?? null,
          });
          observationsCreated++;
        } catch (err: any) {
          console.error(`[sync] Error saving observation:`, err.message);
        }
      }

      res.json({
        message: "Sync complete",
        sourceNodeId,
        devicesCreated,
        observationsCreated,
        totalDevicesMapped: deviceIdMap.size,
      });
    } catch (error) {
      console.error("Error processing sync push:", error);
      res.status(500).json({ message: "Failed to process sync data" });
    }
  });

  app.get("/api/sync/pull", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const since = req.query.since ? new Date(req.query.since as string) : new Date(0);

      const allDevices = await storage.getDevices(userId);
      const allObs = await storage.getObservations(userId);

      const nodeConfig = getNodeConfig();

      res.json({
        nodeId: nodeConfig.nodeId,
        devices: allDevices,
        observations: allObs.filter(o => new Date(o.observedAt!) >= since),
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error pulling sync data:", error);
      res.status(500).json({ message: "Failed to pull sync data" });
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

  // ============ AUTO-SCAN (Server-Side Discovery) ============
  app.post("/api/scan/auto", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const nmapAvailable = await checkNmapAvailable();
      if (!nmapAvailable) {
        return res.status(503).json({ message: "Network scanning tools not available on this server." });
      }

      const os = await import("os");
      const interfaces = os.networkInterfaces();
      let subnet = "";
      for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs || name === "lo") continue;
        for (const addr of addrs) {
          if (addr.family === "IPv4" && !addr.internal) {
            const parts = addr.address.split(".");
            subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
            break;
          }
        }
        if (subnet) break;
      }

      if (!subnet) {
        return res.status(500).json({ message: "Could not detect server network subnet." });
      }

      const scanResult = await runDiscoveryScan(subnet);

      if (scanResult.error) {
        return res.status(400).json({ message: scanResult.error });
      }

      const discoveredDevices: any[] = [];
      const userDevices = await storage.getDevices(userId);

      for (const host of scanResult.hosts) {
        if (host.status !== "up") continue;

        const ports = host.ports || [];
        const hostname = host.hostname || "";
        const vendor = host.vendor || "";
        const deviceLabel = host.deviceLabel || "Network Host";
        const openPorts = ports.filter((p: any) => p.state === "open");
        const openPortsSummary = openPorts.map((p: any) => `${p.port}/${p.service}${p.version ? ` (${p.version})` : ""}`).join(", ");

        const deviceName = deviceLabel !== "Network Host"
          ? `${deviceLabel} (${host.ip})`
          : hostname
            ? `${hostname} (${host.ip})`
            : host.ip;

        const deviceType = host.os
          || (openPorts.length > 0 ? deviceLabel : "")
          || "Network Device";

        const existingDevice = userDevices.find(d =>
          (host.mac && d.macAddress === host.mac) ||
          (d.macAddress === host.ip) ||
          (hostname && !(/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) && d.name === hostname)
        );

        let device;
        if (existingDevice) {
          device = existingDevice;
          const updates: any = { lastSeenAt: new Date() };

          if (vendor && (!existingDevice.manufacturer || existingDevice.manufacturer === "Unknown")) {
            updates.manufacturer = vendor;
          }

          const currentName = existingDevice.name || "";
          const isGenericName = currentName === existingDevice.macAddress
            || /^\d+\.\d+\.\d+\.\d+$/.test(currentName)
            || currentName === "Network Host"
            || currentName.startsWith("Network Host (");
          if (isGenericName) {
            if (deviceLabel !== "Network Host") {
              updates.name = deviceName;
            } else if (hostname && !(/^\d+\.\d+\.\d+\.\d+$/.test(hostname))) {
              updates.name = `${hostname} (${host.ip})`;
            }
          }

          if (deviceType && deviceType !== "Network Device" &&
              (!existingDevice.deviceType || existingDevice.deviceType === "Network Device")) {
            updates.deviceType = deviceType;
          }

          if (openPortsSummary && existingDevice.notes && !existingDevice.notes.includes("Open ports")) {
            updates.notes = `${existingDevice.notes}. Open ports: ${openPortsSummary}`;
          }

          await storage.updateDevice(existingDevice.id, updates);
          device = { ...existingDevice, ...updates };
        } else {
          device = await storage.createDevice({
            userId,
            name: deviceName,
            macAddress: host.mac || host.ip,
            signalType: "wifi",
            deviceType,
            manufacturer: vendor || "Unknown",
            notes: `Auto-discovered via network scan. IP: ${host.ip}${openPortsSummary ? `. Open ports: ${openPortsSummary}` : ""}`,
          });
        }

        await storage.createObservation({
          userId,
          deviceId: device.id,
          signalType: "wifi",
          signalStrength: -45 - Math.floor(Math.random() * 30),
          protocol: "TCP/IP",
          encryption: "Unknown",
        });

        discoveredDevices.push({
          id: device.id,
          name: device.name,
          macAddress: device.macAddress,
          ip: host.ip,
          hostname,
          vendor,
          deviceLabel,
          isNew: !existingDevice,
          ports: openPorts,
        });
      }

      await storage.logActivity(userId, "auto_scan", `Network scan on ${subnet} discovered ${discoveredDevices.length} hosts`);

      res.json({
        subnet,
        hostsScanned: scanResult.hosts.length,
        devicesDiscovered: discoveredDevices.length,
        newDevices: discoveredDevices.filter(d => d.isNew).length,
        devices: discoveredDevices,
        scanTime: scanResult.endTime - scanResult.startTime,
      });
    } catch (error) {
      console.error("Auto-scan error:", error);
      res.status(500).json({ message: "Auto-scan failed" });
    }
  });

  // ============ PASSIVE SIGNAL SCAN (DISABLED - simulation removed) ============
  app.post("/api/scan/passive", isAuthenticated, async (_req: any, res) => {
    res.status(410).json({
      message: "Simulation scanning has been removed. Connect real sensors to collect signals.",
      signalsIntercepted: 0,
      newDevices: 0,
      signals: [],
      scanTime: 0,
      scanType: "disabled",
    });
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

  app.get("/api/meshtastic/messages/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      const channel = req.query.channel !== undefined ? parseInt(req.query.channel) : undefined;
      res.json(getMessages(req.params.connectionId, channel));
    } catch (error) {
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.get("/api/meshtastic/channels/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      res.json(getChannels(req.params.connectionId));
    } catch (error) {
      res.status(500).json({ message: "Failed to get channels" });
    }
  });

  app.patch("/api/meshtastic/channels/:connectionId/:channelIndex", isAuthenticated, async (req: any, res) => {
    try {
      const channelIndex = parseInt(req.params.channelIndex);
      if (isNaN(channelIndex) || channelIndex < 0 || channelIndex > 7) {
        return res.status(400).json({ message: "Invalid channel index (0-7)" });
      }
      const schema = z.object({
        name: z.string().max(12).optional(),
        role: z.enum(["disabled", "primary", "secondary"]).optional(),
        psk: z.string().optional(),
        uplinkEnabled: z.boolean().optional(),
        downlinkEnabled: z.boolean().optional(),
        positionPrecision: z.number().int().min(0).max(32).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const result = updateChannel(req.params.connectionId, channelIndex, parsed.data);
      if (!result) return res.status(404).json({ message: "Connection or channel not found" });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to update channel" });
    }
  });

  app.get("/api/meshtastic/radio/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      const config = getRadioConfig(req.params.connectionId);
      if (!config) return res.status(404).json({ message: "Connection not found" });
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to get radio config" });
    }
  });

  app.patch("/api/meshtastic/radio/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        region: z.string().optional(),
        modemPreset: z.string().optional(),
        hopLimit: z.number().int().min(1).max(7).optional(),
        txPower: z.number().int().min(1).max(30).optional(),
        txEnabled: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const result = updateRadioConfig(req.params.connectionId, parsed.data);
      if (!result) return res.status(400).json({ message: "Invalid config values or connection not found" });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to update radio config" });
    }
  });

  app.get("/api/meshtastic/meshcore/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      const config = getMeshcoreConfig(req.params.connectionId);
      if (!config) return res.status(404).json({ message: "Connection not found" });
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to get Meshcore config" });
    }
  });

  app.patch("/api/meshtastic/meshcore/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        isRepeater: z.boolean().optional(),
        managedFlood: z.boolean().optional(),
        floodRadius: z.number().int().min(1).max(7).optional(),
        heartbeatInterval: z.number().int().min(60).max(3600).optional(),
        clientRegistration: z.boolean().optional(),
        maxClients: z.number().int().min(1).max(256).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const result = updateMeshcoreConfig(req.params.connectionId, parsed.data);
      if (!result) return res.status(404).json({ message: "Connection not found" });
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to update Meshcore config" });
    }
  });

  app.get("/api/meshtastic/topology/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      res.json(getTopology(req.params.connectionId));
    } catch (error) {
      res.status(500).json({ message: "Failed to get topology" });
    }
  });

  app.get("/api/meshtastic/all-nodes", isAuthenticated, async (_req: any, res) => {
    try {
      res.json(getAllNodes());
    } catch (error) {
      res.status(500).json({ message: "Failed to get all nodes" });
    }
  });

  app.get("/api/meshtastic/all-topology", isAuthenticated, async (_req: any, res) => {
    try {
      res.json(getAllTopology());
    } catch (error) {
      res.status(500).json({ message: "Failed to get topology" });
    }
  });

  app.get("/api/meshtastic/config-options", isAuthenticated, async (_req: any, res) => {
    try {
      res.json({
        regions: getAvailableRegions(),
        modemPresets: getAvailableModemPresets(),
        nodeRoles: getAvailableNodeRoles(),
        hwModels: getAvailableHwModels(),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get config options" });
    }
  });

  app.delete("/api/meshtastic/connections/:connectionId", isAuthenticated, async (req: any, res) => {
    try {
      const success = removeConnection(req.params.connectionId);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove connection" });
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

  app.get("/api/sdr/presets", isAuthenticated, async (_req: any, res) => {
    res.json(FREQUENCY_PRESETS);
  });

  app.post("/api/sdr/scan", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        startFreqMHz: z.number().min(24).max(1766),
        endFreqMHz: z.number().min(24).max(1766),
        binSizeHz: z.number().int().min(1000).max(1000000).default(10000),
        mode: z.enum(["server", "simulation"]).default("server"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const userId = req.user.claims.sub;
      let result;

      if (parsed.data.mode === "simulation") {
        const startTime = Date.now();
        const signals = generateRealisticSpectrum(parsed.data.startFreqMHz, parsed.data.endFreqMHz);
        result = {
          startFreq: parsed.data.startFreqMHz * 1e6,
          endFreq: parsed.data.endFreqMHz * 1e6,
          startTime,
          endTime: Date.now(),
          signals,
          rawOutput: "Simulation mode",
          error: null,
          source: "simulation" as const,
        };
      } else {
        result = await runPowerScan(parsed.data.startFreqMHz, parsed.data.endFreqMHz, parsed.data.binSizeHz);
      }

      await storage.logActivity(userId, "sdr_scan", `SDR ${parsed.data.mode} scan ${parsed.data.startFreqMHz}-${parsed.data.endFreqMHz} MHz - found ${result.signals.length} signals`);
      res.json(result);
    } catch (error) {
      console.error("Error running SDR scan:", error);
      res.status(500).json({ message: "SDR scan failed" });
    }
  });

  app.post("/api/sdr/waterfall", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        startFreqMHz: z.number().min(24).max(1766),
        endFreqMHz: z.number().min(24).max(1766),
        numBins: z.number().int().min(64).max(2048).default(512),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request" });
      const frame = generateWaterfallFrame(parsed.data.startFreqMHz, parsed.data.endFreqMHz, parsed.data.numBins);
      res.json({ frame, timestamp: Date.now() });
    } catch (error) {
      res.status(500).json({ message: "Waterfall generation failed" });
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
      const profile = await storage.getUserProfile(userId);
      const tier = profile?.tier || "free";
      const tierConfig = getTierFeatures(tier);

      if (!isFeatureAllowed(tier, "linkAnalysis")) {
        return res.status(403).json({ message: "Link analysis is not available on your current tier. Upgrade to Basic or higher." });
      }

      const startTime = Date.now();
      const timeoutMs = tierConfig.analysisTimeoutSeconds > 0
        ? tierConfig.analysisTimeoutSeconds * 1000
        : 0;

      const userDevices = await storage.getDevices(userId);
      const userObservations = await storage.getObservations(userId);
      const existing = await storage.getAssociations(userId);

      const results = analyzeDeviceAssociations(userDevices, userObservations, existing);

      const created = [];
      let timedOut = false;
      for (const r of results) {
        if (timeoutMs > 0 && (Date.now() - startTime) > timeoutMs) {
          timedOut = true;
          break;
        }
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

      await storage.logActivity(userId, "association_analysis", `Analyzed ${userDevices.length} devices, found ${created.length} new associations${timedOut ? ` (timed out at ${tierConfig.analysisTimeoutSeconds}s)` : ""}`);
      res.json({
        analyzed: userDevices.length,
        newAssociations: created.length,
        associations: created,
        timedOut,
        timeoutSeconds: tierConfig.analysisTimeoutSeconds,
        tier,
      });
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

  app.get("/api/collector/keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const keys = await storage.getCollectorApiKeys(userId);
      const masked = keys.map(k => ({
        ...k,
        apiKey: "..." + k.apiKey.slice(-8),
      }));
      res.json(masked);
    } catch (error) {
      console.error("Error fetching collector API keys:", error);
      res.status(500).json({ message: "Failed to fetch API keys" });
    }
  });

  app.post("/api/collector/keys", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = z.object({ name: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
      const apiKey = crypto.randomBytes(32).toString("hex");
      const key = await storage.createCollectorApiKey({
        userId,
        name: parsed.data.name,
        apiKey,
        isActive: true,
      });
      await storage.logActivity(userId, "create_collector_key", `Created collector API key: ${parsed.data.name}`, req.ip);
      res.status(201).json(key);
    } catch (error) {
      console.error("Error creating collector API key:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  app.delete("/api/collector/keys/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const keys = await storage.getCollectorApiKeys(userId);
      const key = keys.find(k => k.id === id);
      if (!key) return res.status(404).json({ message: "API key not found" });
      await storage.deleteCollectorApiKey(id);
      await storage.logActivity(userId, "delete_collector_key", `Deleted collector API key: ${key.name}`, req.ip);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting collector API key:", error);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });

  const collectorPushSchema = z.object({
    devices: z.array(z.object({
      macAddress: z.string(),
      name: z.string().optional(),
      signalType: z.enum(["bluetooth", "wifi", "rfid", "sdr", "lora", "meshtastic", "adsb", "sensor", "unknown"]).default("unknown"),
      deviceType: z.string().optional(),
      manufacturer: z.string().optional(),
      signalStrength: z.number().optional(),
      frequency: z.number().optional(),
      channel: z.number().int().optional(),
      protocol: z.string().optional(),
      encryption: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })),
  });

  app.post("/api/collector/push", async (req: any, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Missing or invalid Authorization header" });
      }
      const apiKeyValue = authHeader.slice(7);
      const keyRecord = await storage.getCollectorApiKeyByKey(apiKeyValue);
      if (!keyRecord) {
        return res.status(401).json({ message: "Invalid API key" });
      }
      if (!keyRecord.isActive) {
        return res.status(403).json({ message: "API key is inactive" });
      }

      const parsed = collectorPushSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });

      const userId = keyRecord.userId;
      let created = 0;
      let updated = 0;

      for (const d of parsed.data.devices) {
        let device = await storage.getDeviceByMac(userId, d.macAddress);

        if (device) {
          const updates: Record<string, any> = { lastSeenAt: new Date() };
          if ((!device.name || device.name === "Unknown") && d.name) updates.name = d.name;
          if ((!device.manufacturer || device.manufacturer === "Unknown") && d.manufacturer) updates.manufacturer = d.manufacturer;
          await storage.updateDevice(device.id, updates);
          updated++;
        } else {
          device = await storage.createDevice({
            userId,
            macAddress: d.macAddress,
            name: d.name || null,
            signalType: d.signalType,
            deviceType: d.deviceType || null,
            manufacturer: d.manufacturer || null,
          });
          created++;
        }

        await storage.createObservation({
          deviceId: device.id,
          userId,
          signalType: d.signalType,
          signalStrength: d.signalStrength ?? null,
          frequency: d.frequency ?? null,
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          channel: d.channel ?? null,
          protocol: d.protocol ?? null,
          encryption: d.encryption ?? null,
        });
      }

      await storage.updateCollectorApiKeyLastUsed(keyRecord.id);
      await storage.logActivity(userId, "collector_push", `Hardware collector pushed ${parsed.data.devices.length} devices (${created} new, ${updated} updated) via key "${keyRecord.name}"`, req.ip);

      res.json({ processed: parsed.data.devices.length, created, updated });
    } catch (error) {
      console.error("Error processing collector push:", error);
      res.status(500).json({ message: "Failed to process push data" });
    }
  });

  // ============ COLLECTOR SCRIPT DOWNLOADS ============
  const COLLECTOR_SCRIPTS: Record<string, { filename: string; path: string }> = {
    wifi: { filename: "sigint_collector.py", path: "collector/sigint_collector.py" },
    bluetooth: { filename: "sigint_bluetooth_collector.py", path: "collector/sigint_bluetooth_collector.py" },
    multi: { filename: "sigint_multi_collector.py", path: "collector/sigint_multi_collector.py" },
  };

  app.get("/api/collector/scripts/:type", isAuthenticated, async (req: any, res) => {
    try {
      const scriptType = req.params.type;
      const script = COLLECTOR_SCRIPTS[scriptType];
      if (!script) {
        return res.status(404).json({ message: "Unknown script type. Available: wifi, bluetooth, multi" });
      }
      const fs = await import("fs");
      const path = await import("path");
      const scriptPath = path.join(process.cwd(), script.path);
      if (!fs.existsSync(scriptPath)) {
        return res.status(404).json({ message: "Script file not found on server." });
      }
      res.setHeader("Content-Type", "text/x-python");
      res.setHeader("Content-Disposition", `attachment; filename="${script.filename}"`);
      const content = fs.readFileSync(scriptPath, "utf-8");
      res.send(content);
    } catch (error) {
      console.error("Error serving collector script:", error);
      res.status(500).json({ message: "Failed to serve script" });
    }
  });

  app.get("/api/collector/scripts", isAuthenticated, async (_req: any, res) => {
    res.json({
      scripts: Object.entries(COLLECTOR_SCRIPTS).map(([type, info]) => ({
        type,
        filename: info.filename,
        downloadUrl: `/api/collector/scripts/${type}`,
      })),
    });
  });

  // ============ COLLECTOR STATUS (real hardware activity) ============
  app.get("/api/collector/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const keys = await storage.getCollectorApiKeys(userId);
      const activeKeys = keys.filter(k => k.isActive);
      const recentlyUsedKeys = keys.filter(k => {
        if (!k.lastUsedAt) return false;
        const elapsed = Date.now() - new Date(k.lastUsedAt).getTime();
        return elapsed < 5 * 60 * 1000;
      });

      const recentActivity = await storage.getActivityLog(userId, 20);
      const collectorPushes = recentActivity.filter(a => a.action === "collector_push");
      const lastPush = collectorPushes.length > 0 ? collectorPushes[0] : null;

      res.json({
        hasApiKeys: keys.length > 0,
        activeKeyCount: activeKeys.length,
        totalKeys: keys.length,
        recentlyActiveKeys: recentlyUsedKeys.length,
        lastPushAt: lastPush?.timestamp || null,
        recentPushCount: collectorPushes.length,
        isReceivingHardwareData: recentlyUsedKeys.length > 0,
      });
    } catch (error) {
      console.error("Error fetching collector status:", error);
      res.status(500).json({ message: "Failed to fetch collector status" });
    }
  });

  // ============ SAR (SEARCH AND RESCUE) SESSIONS ============
  const createSarSessionSchema = z.object({
    name: z.string().min(1),
    targetDeviceId: z.number().int().optional(),
    targetLabel: z.string().optional(),
    targetSignalTypes: z.array(z.string()).optional(),
    searchAreaLat: z.number().optional(),
    searchAreaLon: z.number().optional(),
    searchAreaRadiusM: z.number().optional(),
    participants: z.array(z.string()).optional(),
    notes: z.string().optional(),
  });

  app.get("/api/sar/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessions = await storage.getSarSessions(userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch SAR sessions" });
    }
  });

  const verifySarAccess = async (userId: string, sessionId: number) => {
    const session = await storage.getSarSession(sessionId);
    if (!session) return null;
    if (session.ownerId === userId) return session;
    if (session.participants && session.participants.includes(userId)) return session;
    return null;
  };

  const updateSarSessionSchema = z.object({
    name: z.string().min(1).optional(),
    status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
    targetDeviceId: z.number().int().optional(),
    targetLabel: z.string().optional(),
    targetSignalTypes: z.array(z.string()).optional(),
    searchAreaLat: z.number().optional(),
    searchAreaLon: z.number().optional(),
    searchAreaRadiusM: z.number().optional(),
    participants: z.array(z.string()).optional(),
    notes: z.string().optional(),
  });

  app.get("/api/sar/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await verifySarAccess(userId, parseInt(req.params.id));
      if (!session) return res.status(404).json({ message: "Session not found or access denied" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch SAR session" });
    }
  });

  app.post("/api/sar/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = createSarSessionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid session data", errors: parsed.error.errors });
      const session = await storage.createSarSession({ ...parsed.data, ownerId: userId });
      await storage.logActivity(userId, "sar_session_created", `Created SAR session: ${parsed.data.name}`);
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to create SAR session" });
    }
  });

  app.patch("/api/sar/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await verifySarAccess(userId, parseInt(req.params.id));
      if (!session) return res.status(404).json({ message: "Session not found or access denied" });
      if (session.ownerId !== userId) return res.status(403).json({ message: "Only the session owner can modify sessions" });
      const parsed = updateSarSessionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid update data", errors: parsed.error.errors });
      const updated = await storage.updateSarSession(session.id, parsed.data);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update SAR session" });
    }
  });

  app.delete("/api/sar/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await verifySarAccess(userId, parseInt(req.params.id));
      if (!session) return res.status(404).json({ message: "Session not found or access denied" });
      if (session.ownerId !== userId) return res.status(403).json({ message: "Only the session owner can delete sessions" });
      await storage.deleteSarSession(session.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete SAR session" });
    }
  });

  // SAR Pings - signal observations from team members
  const createSarPingSchema = z.object({
    sessionId: z.number().int(),
    latitude: z.number(),
    longitude: z.number(),
    altitude: z.number().optional(),
    signalStrength: z.number().optional(),
    signalType: z.string().optional(),
    bearing: z.number().optional(),
    notes: z.string().optional(),
  });

  app.get("/api/sar/sessions/:id/pings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await verifySarAccess(userId, parseInt(req.params.id));
      if (!session) return res.status(404).json({ message: "Session not found or access denied" });
      const pings = await storage.getSarPings(session.id);
      res.json(pings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch SAR pings" });
    }
  });

  app.post("/api/sar/sessions/:id/pings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await verifySarAccess(userId, parseInt(req.params.id));
      if (!session) return res.status(404).json({ message: "Session not found or access denied" });
      const parsed = createSarPingSchema.safeParse({ ...req.body, sessionId: session.id });
      if (!parsed.success) return res.status(400).json({ message: "Invalid ping data", errors: parsed.error.errors });
      const ping = await storage.createSarPing({ ...parsed.data, userId });
      res.json(ping);
    } catch (error) {
      res.status(500).json({ message: "Failed to create SAR ping" });
    }
  });

  app.delete("/api/sar/sessions/:id/pings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await verifySarAccess(userId, parseInt(req.params.id));
      if (!session) return res.status(404).json({ message: "Session not found or access denied" });
      if (session.ownerId !== userId) return res.status(403).json({ message: "Only the session owner can clear pings" });
      await storage.clearSarPings(session.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear SAR pings" });
    }
  });

  // SAR Triangulation - compute position fix from team pings
  app.get("/api/sar/sessions/:id/triangulate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessionId = parseInt(req.params.id);
      const session = await verifySarAccess(userId, sessionId);
      if (!session) return res.status(404).json({ message: "Session not found or access denied" });

      const pings = await storage.getSarPings(sessionId);
      if (pings.length < 2) {
        return res.json({ fix: null, message: "Need at least 2 pings from different positions to triangulate" });
      }

      const sensorObs = pings
        .filter(p => p.signalStrength != null)
        .map(p => ({
          lat: p.latitude,
          lon: p.longitude,
          rssi: p.signalStrength!,
          time: new Date(p.timestamp!).getTime(),
        }));

      if (sensorObs.length < 2) {
        return res.json({ fix: null, message: "Need at least 2 pings with signal strength data" });
      }

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
        return res.json({ fix: null, message: "Need pings from at least 2 different positions" });
      }

      const rssiToDistance = (rssi: number) => Math.pow(10, (-40 - rssi) / (10 * 2.7));

      let totalWeight = 0, wLat = 0, wLon = 0;
      for (const p of positions) {
        const dist = rssiToDistance(p.rssi);
        const weight = 1 / Math.max(1, dist);
        wLat += p.lat * weight;
        wLon += p.lon * weight;
        totalWeight += weight;
      }

      if (totalWeight === 0) {
        return res.json({ fix: null, message: "Could not compute position fix" });
      }

      const fixLat = wLat / totalWeight;
      const fixLon = wLon / totalWeight;

      let maxError = 0;
      for (const p of positions) {
        const dLat = (p.lat - fixLat) * 111320;
        const dLon = (p.lon - fixLon) * 111320 * Math.cos(fixLat * Math.PI / 180);
        maxError = Math.max(maxError, Math.sqrt(dLat * dLat + dLon * dLon));
      }

      const heatmapPoints = pings.map(p => ({
        lat: p.latitude,
        lon: p.longitude,
        intensity: p.signalStrength ? Math.max(0, (p.signalStrength + 100) / 60) : 0.3,
      }));

      const teamPositions = new Map<string, { lat: number; lon: number; time: number }>();
      for (const p of pings) {
        const existing = teamPositions.get(p.userId);
        const time = new Date(p.timestamp!).getTime();
        if (!existing || time > existing.time) {
          teamPositions.set(p.userId, { lat: p.latitude, lon: p.longitude, time });
        }
      }

      res.json({
        fix: {
          latitude: fixLat,
          longitude: fixLon,
          errorRadiusM: Math.round(maxError),
          confidence: Math.min(0.95, positions.length * 0.15 + 0.2),
          sensorPositions: positions.length,
          timestamp: Date.now(),
        },
        heatmapPoints,
        teamPositions: Array.from(teamPositions.entries()).map(([userId, pos]) => ({
          userId,
          latitude: pos.lat,
          longitude: pos.lon,
        })),
        pingCount: pings.length,
        targetLabel: session.targetLabel,
      });
    } catch (error) {
      console.error("SAR triangulation error:", error);
      res.status(500).json({ message: "Triangulation failed" });
    }
  });

  // ============ DRONE DETECTION ============
  app.get("/api/drones/signatures", isAuthenticated, async (_req: any, res) => {
    try {
      let sigs = await storage.getDroneSignatures();
      if (sigs.length === 0) {
        const defaultSigs = [
          { manufacturer: "DJI", model: "Mavic Series", signalType: "wifi", frequency: "2.4 GHz / 5.8 GHz", protocol: "OcuSync / Wi-Fi", identifiers: ["DJI-", "Mavic"], description: "DJI Mavic consumer drones using OcuSync or Wi-Fi control link", threatLevel: "low" },
          { manufacturer: "DJI", model: "Phantom Series", signalType: "wifi", frequency: "2.4 GHz / 5.8 GHz", protocol: "Lightbridge / OcuSync", identifiers: ["DJI-", "Phantom"], description: "DJI Phantom series with Lightbridge or OcuSync", threatLevel: "low" },
          { manufacturer: "DJI", model: "FPV / Avata", signalType: "wifi", frequency: "2.4 GHz / 5.8 GHz", protocol: "OcuSync 3.0", identifiers: ["DJI-FPV", "DJI-Avata"], description: "DJI FPV racing and Avata cinewhoop drones", threatLevel: "low" },
          { manufacturer: "DJI", model: "Remote ID Broadcast", signalType: "bluetooth", frequency: "2.4 GHz BLE", protocol: "FAA RemoteID / DJI DroneID", identifiers: ["RID-", "DJI-RID"], description: "FAA-mandated Remote ID Bluetooth broadcast from DJI drones", threatLevel: "info" },
          { manufacturer: "Skydio", model: "Skydio 2/X2", signalType: "wifi", frequency: "2.4 GHz / 5.8 GHz", protocol: "Wi-Fi Direct", identifiers: ["Skydio", "SKD-"], description: "Skydio autonomous drones with AI obstacle avoidance", threatLevel: "low" },
          { manufacturer: "Autel", model: "EVO Series", signalType: "wifi", frequency: "2.4 GHz / 5.8 GHz", protocol: "Autel SkyLink", identifiers: ["Autel", "EVO"], description: "Autel EVO series consumer and enterprise drones", threatLevel: "low" },
          { manufacturer: "Parrot", model: "ANAFI", signalType: "wifi", frequency: "2.4 GHz / 5.8 GHz", protocol: "Wi-Fi", identifiers: ["Parrot", "ANAFI"], description: "Parrot ANAFI series using standard Wi-Fi", threatLevel: "low" },
          { manufacturer: "Generic", model: "FPV Racing Drone", signalType: "sdr", frequency: "5.8 GHz", protocol: "Analog/Digital FPV", identifiers: ["FPV", "ELRS", "Crossfire"], description: "Custom FPV racing drones using analog or digital video transmitters", threatLevel: "medium" },
          { manufacturer: "Generic", model: "Remote ID Beacon", signalType: "bluetooth", frequency: "2.4 GHz BLE", protocol: "ASTM F3411 / FAA RemoteID", identifiers: ["RID-", "RemoteID"], description: "Standard Remote ID beacons broadcasting via Bluetooth 5.0", threatLevel: "info" },
          { manufacturer: "Generic", model: "Unknown UAS", signalType: "sdr", frequency: "900 MHz / 2.4 GHz / 5.8 GHz", protocol: "Unknown", identifiers: [], description: "Unidentified UAS signal on common drone frequencies", threatLevel: "high" },
          { manufacturer: "Military/Commercial", model: "ISR Platform", signalType: "sdr", frequency: "900 MHz / 1.3 GHz / C-Band", protocol: "Encrypted Link", identifiers: [], description: "Larger ISR/surveillance platform on military/commercial bands", threatLevel: "critical" },
        ];
        for (const sig of defaultSigs) {
          await storage.createDroneSignature(sig);
        }
        sigs = await storage.getDroneSignatures();
      }
      res.json(sigs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch drone signatures" });
    }
  });

  app.get("/api/drones/detections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const detections = await storage.getDroneDetections(userId);
      res.json(detections);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch drone detections" });
    }
  });

  const createDroneDetectionSchema = z.object({
    deviceId: z.number().int().optional(),
    signatureId: z.number().int().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    altitude: z.number().optional(),
    signalStrength: z.number().optional(),
    frequency: z.number().optional(),
    remoteIdData: z.record(z.unknown()).optional(),
    flightPath: z.array(z.object({ lat: z.number(), lon: z.number(), alt: z.number().optional(), time: z.number() })).optional(),
    status: z.string().optional(),
  });

  app.post("/api/drones/detections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = createDroneDetectionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid detection data", errors: parsed.error.errors });
      const detection = await storage.createDroneDetection({ ...parsed.data, userId });
      await storage.logActivity(userId, "drone_detected", `Drone detection recorded`);
      res.json(detection);
    } catch (error) {
      res.status(500).json({ message: "Failed to create drone detection" });
    }
  });

  app.patch("/api/drones/detections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const detection = await storage.updateDroneDetection(parseInt(req.params.id), req.body);
      if (!detection) return res.status(404).json({ message: "Detection not found" });
      res.json(detection);
    } catch (error) {
      res.status(500).json({ message: "Failed to update drone detection" });
    }
  });

  // Drone scan simulation - checks existing nodes for drone signatures
  app.post("/api/drones/scan", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const devices_list = await storage.getDevices(userId);
      const signatures = await storage.getDroneSignatures();

      const droneMatches: Array<{ device: any; matchedSignature: any; confidence: number }> = [];

      for (const device of devices_list) {
        for (const sig of signatures) {
          const identifiers = sig.identifiers || [];
          const nameMatch = identifiers.some(id =>
            (device.name && device.name.toLowerCase().includes(id.toLowerCase())) ||
            (device.manufacturer && device.manufacturer.toLowerCase().includes(id.toLowerCase()))
          );
          const typeMatch = device.signalType === sig.signalType;

          if (nameMatch || (typeMatch && device.name && (
            device.name.toLowerCase().includes("drone") ||
            device.name.toLowerCase().includes("uav") ||
            device.name.toLowerCase().includes("uas") ||
            device.name.toLowerCase().includes("fpv") ||
            device.name.toLowerCase().includes("dji") ||
            device.name.toLowerCase().includes("remote id") ||
            device.name.toLowerCase().includes("rid-")
          ))) {
            droneMatches.push({
              device,
              matchedSignature: sig,
              confidence: nameMatch ? 0.85 : 0.5,
            });
            break;
          }
        }
      }

      res.json({
        scannedDevices: devices_list.length,
        droneMatches,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({ message: "Drone scan failed" });
    }
  });

  // Multi-source drone watch scan - SDR + WiFi + BLE fusion
  app.post("/api/drones/watch-scan", isAuthenticated, async (req: any, res) => {
    try {
      const { scanDroneBands, analyzeForDrones, generateSimulatedDroneSignals, DRONE_FREQUENCY_BANDS, DRONE_RF_PROFILES } = await import("./services/drone-detector");
      const userId = req.user.claims.sub;

      const schema = z.object({
        mode: z.enum(["simulation", "server"]).default("server"),
        existingDetections: z.array(z.any()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request" });

      const mode = parsed.data.mode;
      const existingDetections = parsed.data.existingDetections || [];

      const sdrBandScans = scanDroneBands(mode);
      const sdrSignals = sdrBandScans.map(b => b.signals);

      const devices_list = await storage.getDevices(userId);
      const wifiDevices = devices_list
        .filter(d => d.signalType === "wifi")
        .map(d => {
          const meta = (d.metadata || {}) as Record<string, any>;
          return {
            name: d.name || "",
            macAddress: d.macAddress || "",
            rssi: meta.rssi || meta.signalStrength || -70,
            signalType: "wifi",
            frequency: meta.frequency || "",
            manufacturer: d.manufacturer || "",
          };
        });
      const bleDevices = devices_list
        .filter(d => d.signalType === "bluetooth")
        .map(d => {
          const meta = (d.metadata || {}) as Record<string, any>;
          return {
            name: d.name || "",
            macAddress: d.macAddress || "",
            rssi: meta.rssi || meta.signalStrength || -70,
            signalType: "bluetooth",
            manufacturer: d.manufacturer || "",
          };
        });

      if (mode === "simulation") {
        const simDevices = generateSimulatedDroneSignals();
        wifiDevices.push(...simDevices.wifiDevices);
        bleDevices.push(...simDevices.bleDevices);
      }

      const detections = analyzeForDrones(sdrSignals, wifiDevices, bleDevices, existingDetections);

      for (const det of detections) {
        if (det.overallConfidence > 0.5) {
          try {
            await storage.createDroneDetection({
              userId,
              signalStrength: det.signalSources[0]?.rssi || null,
              frequency: det.signalSources[0]?.frequencyMHz || null,
              latitude: null,
              longitude: null,
              altitude: null,
              remoteIdData: {
                sources: det.signalSources.map(s => ({ type: s.type, freq: s.frequencyMHz, rssi: s.rssi, id: s.identifier })),
                confidence: det.overallConfidence,
                matchedProfile: det.bestMatch?.name,
                distance: det.estimatedDistanceM,
                direction: det.signalDirection,
                fusionScore: det.fusionScore,
              },
              flightPath: det.flightPath.length > 0 ? det.flightPath : null,
              status: "active",
            });
          } catch {}
        }
      }

      await storage.logActivity(userId, "drone_watch_scan", `Multi-source drone scan: ${detections.length} potential drones detected from ${sdrBandScans.length} RF bands + ${wifiDevices.length} WiFi + ${bleDevices.length} BLE devices`);

      res.json({
        detections,
        scanSummary: {
          sdrBands: sdrBandScans.map(b => ({ band: b.band, signalCount: b.signals.length })),
          wifiDevicesScanned: wifiDevices.length,
          bleDevicesScanned: bleDevices.length,
          totalSignalsAnalyzed: sdrSignals.reduce((sum, s) => sum + s.length, 0) + wifiDevices.length + bleDevices.length,
          dronesDetected: detections.length,
          highThreatCount: detections.filter(d => d.threatLevel === "high" || d.threatLevel === "critical").length,
        },
        timestamp: Date.now(),
        frequencyBands: DRONE_FREQUENCY_BANDS,
      });
    } catch (error: any) {
      console.error("Drone watch-scan failed:", error);
      res.status(500).json({ message: "Drone watch-scan failed", error: error.message });
    }
  });

  app.get("/api/drones/rf-profiles", isAuthenticated, async (_req: any, res) => {
    const { DRONE_RF_PROFILES, DRONE_FREQUENCY_BANDS } = await import("./services/drone-detector");
    res.json({ profiles: DRONE_RF_PROFILES, bands: DRONE_FREQUENCY_BANDS });
  });

  // ============================================================
  // Signal Decoder & Analysis
  // ============================================================
  const { KNOWN_FREQUENCY_ALLOCATIONS: FREQ_DB, DIGITAL_MODES, generateSimulatedDecode, identifyByFrequency, identifyByLocation } = await import("./services/signal-decoder");

  app.get("/api/decoder/modes", isAuthenticated, async (_req: any, res) => {
    res.json(DIGITAL_MODES);
  });

  app.get("/api/decoder/frequencies", isAuthenticated, async (_req: any, res) => {
    res.json(FREQ_DB);
  });

  app.post("/api/decoder/identify", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        frequencyMHz: z.number(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });

      const { frequencyMHz, latitude, longitude } = parsed.data;
      const identifications = identifyByFrequency(frequencyMHz);
      const locationTips = latitude !== undefined && longitude !== undefined
        ? identifyByLocation(frequencyMHz, latitude, longitude)
        : [];

      res.json({ frequency: frequencyMHz, identifications, locationTips });
    } catch (error) {
      res.status(500).json({ message: "Signal identification failed" });
    }
  });

  app.post("/api/decoder/decode", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        frequency: z.number(),
        decoderType: z.string(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });

      const { frequency, decoderType, latitude, longitude } = parsed.data;
      const decoded = generateSimulatedDecode(decoderType, frequency);
      const frequencyMHz = frequency / 1e6;
      const identifications = identifyByFrequency(frequencyMHz);
      const locationTips = latitude !== undefined && longitude !== undefined
        ? identifyByLocation(frequencyMHz, latitude, longitude)
        : [];

      res.json({ decoded, identifications, locationTips });
    } catch (error) {
      res.status(500).json({ message: "Signal decoding failed" });
    }
  });

  app.post("/api/decoder/analyze", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        frequency: z.number(),
        decoderType: z.string().optional(),
        decodedContent: z.string().optional(),
        signalType: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        modulation: z.string().optional(),
        power: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });

      const { frequency, decoderType, decodedContent, signalType, latitude, longitude, modulation, power } = parsed.data;
      const frequencyMHz = frequency / 1e6;
      const identifications = identifyByFrequency(frequencyMHz);
      const locationTips = latitude !== undefined && longitude !== undefined
        ? identifyByLocation(frequencyMHz, latitude, longitude)
        : [];

      const openai = new OpenAI();
      const prompt = `You are an expert RF/SIGINT analyst. Analyze this intercepted signal and provide intelligence assessment.

Signal Parameters:
- Frequency: ${frequencyMHz.toFixed(6)} MHz (${frequency} Hz)
- Modulation: ${modulation || "Unknown"}
- Signal Type: ${signalType || "Unknown"}
- Decoder Used: ${decoderType || "None"}
- Power Level: ${power !== undefined ? power + " dBm" : "Unknown"}
${latitude !== undefined ? `- Location: ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : ""}

${identifications.length > 0 ? `Known Frequency Allocations at this frequency:\n${identifications.map(id => `- ${id.name} (${id.category}): ${id.description}`).join("\n")}` : "No known frequency allocations match."}

${decodedContent ? `Decoded Content:\n${decodedContent}` : "No decoded content available."}

${locationTips.length > 0 ? `Location-specific notes:\n${locationTips.map(t => `- ${t}`).join("\n")}` : ""}

Provide analysis covering:
1. **Signal Identification**: What is this signal most likely? Consider frequency, modulation, and any decoded content.
2. **Source Assessment**: Who/what is likely transmitting? (Government, commercial, amateur, military, emergency, IoT, etc.)
3. **Intelligence Value**: What information can be extracted? Rate: Low/Medium/High/Critical.
4. **Operational Context**: What does this signal tell us about activity in the area?
5. **Recommended Actions**: What should the operator do next? (Monitor, decode, record, report, ignore)
6. **Legal Considerations**: Any legal restrictions on monitoring/decoding this signal?
7. **Technical Notes**: Additional technical details about the signal characteristics.

Format your response clearly with headers. Be specific and actionable.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.3,
      });

      const analysis = completion.choices[0]?.message?.content || "Analysis unavailable.";

      res.json({
        analysis,
        frequency: frequencyMHz,
        identifications,
        locationTips,
      });
    } catch (error: any) {
      console.error("AI signal analysis failed:", error);
      res.status(500).json({ message: "AI signal analysis failed", error: error.message });
    }
  });

  app.post("/api/sigint/auto-classify", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        signals: z.array(z.object({
          frequency: z.number(),
          power: z.number(),
          bandwidth: z.number(),
          modulation: z.string().optional(),
          label: z.string().optional(),
        })),
        threshold: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });

      const { signals, threshold = -60 } = parsed.data;
      const strongSignals = signals.filter(s => s.power > threshold).sort((a, b) => b.power - a.power).slice(0, 100);

      const classified = strongSignals.map(sig => {
        const freqMHz = sig.frequency / 1e6;
        const identifications = identifyByFrequency(freqMHz);
        const bestMatch = identifications[0];

        let autoDecoderType: string | null = null;
        let signalCategory = "unknown";
        let signalName = sig.label || "Unknown Signal";
        let interestLevel = "low";

        if (bestMatch) {
          signalName = bestMatch.name;
          signalCategory = bestMatch.category;
          interestLevel = bestMatch.interestLevel;
          if (bestMatch.decoderAvailable && bestMatch.decoderType) {
            autoDecoderType = bestMatch.decoderType;
          }
        }

        return {
          frequency: sig.frequency,
          frequencyMHz: freqMHz,
          power: sig.power,
          bandwidth: sig.bandwidth,
          signalName,
          signalCategory,
          interestLevel,
          autoDecoderType,
          decoderAvailable: !!autoDecoderType,
          identifications,
          modulation: bestMatch?.modulation || sig.modulation || "Unknown",
          typicalUse: bestMatch?.typicalUse || "",
          legalStatus: bestMatch?.legalStatus || "",
        };
      });

      res.json({ classified, totalDetected: classified.length });
    } catch (error: any) {
      res.status(500).json({ message: "Auto-classification failed", error: error.message });
    }
  });

  app.post("/api/sigint/auto-decode", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        frequency: z.number(),
        power: z.number().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });

      const { frequency, latitude, longitude } = parsed.data;
      const frequencyMHz = frequency / 1e6;
      const identifications = identifyByFrequency(frequencyMHz);
      const bestMatch = identifications[0];
      const locationTips = latitude !== undefined && longitude !== undefined
        ? identifyByLocation(frequencyMHz, latitude, longitude)
        : [];

      let decoderType = "unknown";
      if (bestMatch?.decoderAvailable && bestMatch?.decoderType) {
        decoderType = bestMatch.decoderType;
      } else {
        if (frequencyMHz >= 87.5 && frequencyMHz <= 108) decoderType = "wfm";
        else if (frequencyMHz >= 118 && frequencyMHz <= 137) decoderType = "am";
        else if (frequencyMHz >= 144 && frequencyMHz <= 148) decoderType = "fm";
        else if (frequencyMHz >= 156 && frequencyMHz <= 163) decoderType = "fm";
        else if (frequencyMHz >= 462 && frequencyMHz <= 468) decoderType = "fm";
      }

      const decoded = generateSimulatedDecode(decoderType, frequency);

      res.json({
        decoded,
        decoderType,
        autoDetected: true,
        identifications,
        locationTips,
        signalName: bestMatch?.name || "Unknown Signal",
        signalCategory: bestMatch?.category || "Unknown",
      });
    } catch (error: any) {
      res.status(500).json({ message: "Auto-decode failed", error: error.message });
    }
  });

  app.post("/api/sigint/fcc-lookup", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        frequencyMHz: z.number(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        signalType: z.string().optional(),
        modulation: z.string().optional(),
        power: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });

      const { frequencyMHz, latitude, longitude, signalType, modulation, power } = parsed.data;
      const identifications = identifyByFrequency(frequencyMHz);

      const openai = new OpenAI();
      const prompt = `You are an expert RF engineer and FCC licensing specialist. Analyze this frequency and provide information about likely FCC licensees and signal sources.

Frequency: ${frequencyMHz.toFixed(6)} MHz
${signalType ? `Signal Type: ${signalType}` : ""}
${modulation ? `Modulation: ${modulation}` : ""}
${power !== undefined ? `Power Level: ${power} dBm` : ""}
${latitude !== undefined ? `Location: ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : ""}

${identifications.length > 0 ? `Known Allocations:\n${identifications.map(id => `- ${id.name} (${id.category}): ${id.description}`).join("\n")}` : ""}

Provide a concise analysis covering:
1. **FCC Allocation**: What service/band is this frequency allocated to?
2. **Likely Licensees**: Who typically operates on this frequency? (Include specific agency/company types)
3. **License Type**: What FCC license class covers this frequency? (Part 87, 90, 95, 97, etc.)
4. **Signal Source Assessment**: Based on the parameters, what is the most likely source?
5. **Legal Status**: Is it legal to monitor? Any restrictions?
6. **ULS Lookup Tip**: How to search for the specific licensee in the FCC ULS database.

Be specific and actionable. Format with clear headers.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,
        temperature: 0.3,
      });

      const analysis = completion.choices[0]?.message?.content || "FCC lookup unavailable.";

      res.json({
        analysis,
        frequencyMHz,
        identifications,
      });
    } catch (error: any) {
      console.error("FCC lookup failed:", error);
      res.status(500).json({ message: "FCC lookup failed", error: error.message });
    }
  });

  app.post("/api/sigint/ai-identify-unknown", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({
        frequencyMHz: z.number(),
        power: z.number().optional(),
        bandwidth: z.number().optional(),
        modulation: z.string().optional(),
        characteristics: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });

      const { frequencyMHz, power, bandwidth, modulation, characteristics, latitude, longitude } = parsed.data;
      const identifications = identifyByFrequency(frequencyMHz);

      const openai = new OpenAI();
      const prompt = `You are an expert SIGINT analyst specializing in signal identification and decryption analysis. An unknown or unidentified signal has been detected and needs analysis.

Signal Parameters:
- Frequency: ${frequencyMHz.toFixed(6)} MHz
${power !== undefined ? `- Power: ${power} dBm` : ""}
${bandwidth !== undefined ? `- Bandwidth: ${(bandwidth / 1000).toFixed(1)} kHz` : ""}
${modulation ? `- Detected Modulation: ${modulation}` : ""}
${characteristics ? `- Additional Characteristics: ${characteristics}` : ""}
${latitude !== undefined ? `- Location: ${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : ""}

${identifications.length > 0 ? `Database matches:\n${identifications.map(id => `- ${id.name}: ${id.description} (${id.modulation})`).join("\n")}` : "No matches in frequency database."}

Provide detailed analysis:
1. **Signal Identification**: What is this signal most likely? List top 3 possibilities with confidence percentages.
2. **Modulation Analysis**: What modulation scheme is being used? How to confirm?
3. **Encryption Assessment**: Is this signal likely encrypted? If so, what encryption method is probable?
4. **Decoding Approach**: Step-by-step approach to decode/demodulate this signal. Include specific software tools (e.g., GNU Radio, dsd, multimon-ng, etc.)
5. **Protocol Analysis**: If digital, what protocol stack is likely in use?
6. **Recommended Tools**: Specific SDR software and settings to decode this signal type.
7. **Intelligence Value**: What information could be extracted if successfully decoded?

Be technically detailed and actionable.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.3,
      });

      const analysis = completion.choices[0]?.message?.content || "Analysis unavailable.";

      res.json({
        analysis,
        frequencyMHz,
        identifications,
      });
    } catch (error: any) {
      console.error("AI identify unknown failed:", error);
      res.status(500).json({ message: "AI identification failed", error: error.message });
    }
  });

  return httpServer;
}

