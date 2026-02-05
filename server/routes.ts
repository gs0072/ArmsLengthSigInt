import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { seedDatabase } from "./seed";
import { z } from "zod";

const updateProfileSchema = z.object({
  dataMode: z.enum(["local", "friends", "public", "osint"]).optional(),
  settings: z.record(z.unknown()).optional(),
});

const adminUpdateUserSchema = z.object({
  tier: z.enum(["free", "basic", "professional", "enterprise", "admin"]).optional(),
  storageLimitBytes: z.number().int().min(0).optional(),
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
      const device = await storage.createDevice({ ...req.body, userId });
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
      const device = await storage.getDevice(req.body.deviceId);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }
      const observation = await storage.createObservation({ ...req.body, userId });
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

  return httpServer;
}
