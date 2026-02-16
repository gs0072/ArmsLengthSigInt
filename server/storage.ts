import {
  users, devices, observations, alerts, deviceCatalog, userProfiles, activityLog, followingDetection, collectionSensors, deviceAssociations, trustedUsers, osintLinks, customSignatures, collectorApiKeys,
  type User, type UpsertUser,
  type Device, type InsertDevice,
  type Observation, type InsertObservation,
  type Alert, type InsertAlert,
  type DeviceCatalogEntry, type InsertDeviceCatalogEntry,
  type UserProfile, type InsertUserProfile,
  type ActivityLogEntry,
  type FollowingDetectionEntry,
  type CollectionSensor, type InsertCollectionSensor,
  type DeviceAssociation, type InsertDeviceAssociation,
  type TrustedUser, type InsertTrustedUser,
  type OsintLink, type InsertOsintLink,
  type CustomSignature, type InsertCustomSignature,
  type CollectorApiKey, type InsertCollectorApiKey,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  getDevices(userId: string): Promise<Device[]>;
  getDevice(id: number): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDevice(id: number, updates: Partial<InsertDevice>): Promise<Device | undefined>;
  deleteDevice(id: number): Promise<void>;
  searchDevices(userId: string, query: string): Promise<Device[]>;

  getObservations(userId: string): Promise<Observation[]>;
  getObservationsByDevice(deviceId: number): Promise<Observation[]>;
  createObservation(obs: InsertObservation): Promise<Observation>;

  getAlerts(userId: string): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  updateAlert(id: number, updates: Partial<InsertAlert>): Promise<Alert | undefined>;

  getDeviceCatalog(): Promise<DeviceCatalogEntry[]>;
  createDeviceCatalogEntry(entry: InsertDeviceCatalogEntry): Promise<DeviceCatalogEntry>;

  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  upsertUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  countUserProfiles(): Promise<number>;
  getAllUserProfiles(): Promise<UserProfile[]>;
  getAdminUserList(): Promise<any[]>;
  getActivityLog(userId: string, limit?: number): Promise<ActivityLogEntry[]>;
  getAllActivityLog(limit?: number): Promise<ActivityLogEntry[]>;

  logActivity(userId: string, action: string, details?: string, ipAddress?: string): Promise<void>;

  getFollowingDetection(userId: string): Promise<FollowingDetectionEntry[]>;
  getDeviceByMac(userId: string, macAddress: string): Promise<Device | undefined>;
  clearUserData(userId: string): Promise<void>;

  getSensors(userId: string): Promise<CollectionSensor[]>;
  getSensor(id: number): Promise<CollectionSensor | undefined>;
  createSensor(sensor: InsertCollectionSensor): Promise<CollectionSensor>;
  updateSensor(id: number, updates: Partial<InsertCollectionSensor>): Promise<CollectionSensor | undefined>;
  deleteSensor(id: number): Promise<void>;

  getAssociations(userId: string): Promise<DeviceAssociation[]>;
  getAssociationsForDevice(deviceId: number): Promise<DeviceAssociation[]>;
  createAssociation(assoc: InsertDeviceAssociation): Promise<DeviceAssociation>;
  updateAssociation(id: number, updates: Partial<InsertDeviceAssociation>): Promise<DeviceAssociation | undefined>;
  deleteAssociation(id: number): Promise<void>;
  deleteAllAssociations(userId: string): Promise<number>;

  getTrustedUsers(userId: string): Promise<TrustedUser[]>;
  createTrustedUser(tu: InsertTrustedUser): Promise<TrustedUser>;
  deleteTrustedUser(id: number): Promise<void>;

  getOsintLinks(userId: string, deviceId?: number): Promise<OsintLink[]>;
  createOsintLink(link: InsertOsintLink): Promise<OsintLink>;
  updateOsintLink(id: number, updates: Partial<InsertOsintLink>): Promise<OsintLink | undefined>;
  deleteOsintLink(id: number): Promise<void>;

  getCustomSignatures(userId: string): Promise<CustomSignature[]>;
  createCustomSignature(sig: InsertCustomSignature): Promise<CustomSignature>;
  deleteCustomSignature(id: number): Promise<void>;
  deleteCustomSignaturesByCategory(userId: string, category: string): Promise<void>;

  getCollectorApiKeys(userId: string): Promise<CollectorApiKey[]>;
  createCollectorApiKey(key: InsertCollectorApiKey): Promise<CollectorApiKey>;
  deleteCollectorApiKey(id: number): Promise<void>;
  getCollectorApiKeyByKey(apiKey: string): Promise<CollectorApiKey | undefined>;
  updateCollectorApiKeyLastUsed(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();
    return user;
  }

  async getDevices(userId: string): Promise<Device[]> {
    return db.select().from(devices).where(eq(devices.userId, userId)).orderBy(desc(devices.lastSeenAt));
  }

  async getDevice(id: number): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(eq(devices.id, id));
    return device || undefined;
  }

  async createDevice(device: InsertDevice): Promise<Device> {
    const [created] = await db.insert(devices).values(device).returning();
    return created;
  }

  async updateDevice(id: number, updates: Partial<InsertDevice>): Promise<Device | undefined> {
    const [updated] = await db.update(devices).set(updates).where(eq(devices.id, id)).returning();
    return updated || undefined;
  }

  async deleteDevice(id: number): Promise<void> {
    await db.delete(devices).where(eq(devices.id, id));
  }

  async searchDevices(userId: string, query: string): Promise<Device[]> {
    const pattern = `%${query}%`;
    return db.select().from(devices).where(
      and(
        eq(devices.userId, userId),
        or(
          ilike(devices.name, pattern),
          ilike(devices.macAddress, pattern),
          ilike(devices.manufacturer, pattern),
          ilike(devices.model, pattern),
          ilike(devices.uuid, pattern),
        )
      )
    );
  }

  async getObservations(userId: string): Promise<Observation[]> {
    return db.select().from(observations).where(eq(observations.userId, userId)).orderBy(desc(observations.observedAt));
  }

  async getObservationsByDevice(deviceId: number): Promise<Observation[]> {
    return db.select().from(observations).where(eq(observations.deviceId, deviceId)).orderBy(desc(observations.observedAt));
  }

  async createObservation(obs: InsertObservation): Promise<Observation> {
    const [created] = await db.insert(observations).values(obs).returning();
    await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, obs.deviceId));
    return created;
  }

  async getAlerts(userId: string): Promise<Alert[]> {
    return db.select().from(alerts).where(eq(alerts.userId, userId)).orderBy(desc(alerts.createdAt));
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [created] = await db.insert(alerts).values(alert).returning();
    return created;
  }

  async updateAlert(id: number, updates: Partial<InsertAlert>): Promise<Alert | undefined> {
    const [updated] = await db.update(alerts).set(updates).where(eq(alerts.id, id)).returning();
    return updated || undefined;
  }

  async getDeviceCatalog(): Promise<DeviceCatalogEntry[]> {
    return db.select().from(deviceCatalog);
  }

  async createDeviceCatalogEntry(entry: InsertDeviceCatalogEntry): Promise<DeviceCatalogEntry> {
    const [created] = await db.insert(deviceCatalog).values(entry).returning();
    return created;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile || undefined;
  }

  async upsertUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const { userId, ...updateFields } = profile;
    const [upserted] = await db
      .insert(userProfiles)
      .values(profile)
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: updateFields,
      })
      .returning();
    return upserted;
  }

  async countUserProfiles(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(userProfiles);
    return result[0]?.count ?? 0;
  }

  async getAllUserProfiles(): Promise<UserProfile[]> {
    return db.select().from(userProfiles);
  }

  async getAdminUserList(): Promise<any[]> {
    const allProfiles = await db.select().from(userProfiles);
    const allUsers = await db.select().from(users);
    const deviceCounts = await db.select({
      userId: devices.userId,
      count: sql<number>`count(*)::int`,
    }).from(devices).groupBy(devices.userId);
    const sensorCounts = await db.select({
      userId: collectionSensors.userId,
      count: sql<number>`count(*)::int`,
    }).from(collectionSensors).groupBy(collectionSensors.userId);
    const lastActivity = await db.select({
      userId: activityLog.userId,
      lastActive: sql<string>`max(timestamp)`,
    }).from(activityLog).groupBy(activityLog.userId);

    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const deviceMap = new Map(deviceCounts.map(d => [d.userId, d.count]));
    const sensorMap = new Map(sensorCounts.map(s => [s.userId, s.count]));
    const activityMap = new Map(lastActivity.map(a => [a.userId, a.lastActive]));

    return allProfiles.map(p => {
      const user = userMap.get(p.userId);
      return {
        ...p,
        email: user?.email || null,
        firstName: user?.firstName || null,
        lastName: user?.lastName || null,
        profileImageUrl: user?.profileImageUrl || null,
        createdAt: user?.createdAt || null,
        deviceCount: deviceMap.get(p.userId) || 0,
        sensorCount: sensorMap.get(p.userId) || 0,
        lastActive: activityMap.get(p.userId) || user?.createdAt || null,
      };
    });
  }

  async getActivityLog(userId: string, limit: number = 50): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog)
      .where(eq(activityLog.userId, userId))
      .orderBy(desc(activityLog.timestamp))
      .limit(limit);
  }

  async getAllActivityLog(limit: number = 100): Promise<ActivityLogEntry[]> {
    return db.select().from(activityLog)
      .orderBy(desc(activityLog.timestamp))
      .limit(limit);
  }

  async logActivity(userId: string, action: string, details?: string, ipAddress?: string): Promise<void> {
    await db.insert(activityLog).values({ userId, action, details, ipAddress });
  }

  async getFollowingDetection(userId: string): Promise<FollowingDetectionEntry[]> {
    return db.select().from(followingDetection).where(eq(followingDetection.userId, userId)).orderBy(desc(followingDetection.riskScore));
  }

  async getDeviceByMac(userId: string, macAddress: string): Promise<Device | undefined> {
    const [device] = await db.select().from(devices).where(
      and(eq(devices.userId, userId), eq(devices.macAddress, macAddress))
    );
    return device || undefined;
  }

  async clearUserData(userId: string): Promise<void> {
    await db.delete(observations).where(eq(observations.userId, userId));
    await db.delete(alerts).where(eq(alerts.userId, userId));
    await db.delete(followingDetection).where(eq(followingDetection.userId, userId));
    await db.delete(devices).where(eq(devices.userId, userId));
    await db.delete(activityLog).where(eq(activityLog.userId, userId));
  }

  async getSensors(userId: string): Promise<CollectionSensor[]> {
    return db.select().from(collectionSensors).where(eq(collectionSensors.userId, userId)).orderBy(desc(collectionSensors.createdAt));
  }

  async getSensor(id: number): Promise<CollectionSensor | undefined> {
    const [sensor] = await db.select().from(collectionSensors).where(eq(collectionSensors.id, id));
    return sensor || undefined;
  }

  async createSensor(sensor: InsertCollectionSensor): Promise<CollectionSensor> {
    const [created] = await db.insert(collectionSensors).values(sensor).returning();
    return created;
  }

  async updateSensor(id: number, updates: Partial<InsertCollectionSensor>): Promise<CollectionSensor | undefined> {
    const [updated] = await db.update(collectionSensors).set(updates).where(eq(collectionSensors.id, id)).returning();
    return updated || undefined;
  }

  async deleteSensor(id: number): Promise<void> {
    await db.delete(collectionSensors).where(eq(collectionSensors.id, id));
  }

  async getAssociations(userId: string): Promise<DeviceAssociation[]> {
    return db.select().from(deviceAssociations).where(eq(deviceAssociations.userId, userId)).orderBy(desc(deviceAssociations.confidence));
  }

  async getAssociationsForDevice(deviceId: number): Promise<DeviceAssociation[]> {
    return db.select().from(deviceAssociations).where(
      or(eq(deviceAssociations.deviceId1, deviceId), eq(deviceAssociations.deviceId2, deviceId))
    ).orderBy(desc(deviceAssociations.confidence));
  }

  async createAssociation(assoc: InsertDeviceAssociation): Promise<DeviceAssociation> {
    const [created] = await db.insert(deviceAssociations).values(assoc).returning();
    return created;
  }

  async updateAssociation(id: number, updates: Partial<InsertDeviceAssociation>): Promise<DeviceAssociation | undefined> {
    const [updated] = await db.update(deviceAssociations).set(updates).where(eq(deviceAssociations.id, id)).returning();
    return updated || undefined;
  }

  async deleteAssociation(id: number): Promise<void> {
    await db.delete(deviceAssociations).where(eq(deviceAssociations.id, id));
  }

  async deleteAllAssociations(userId: string): Promise<number> {
    const existing = await this.getAssociations(userId);
    const count = existing.length;
    if (count > 0) {
      await db.delete(deviceAssociations).where(eq(deviceAssociations.userId, userId));
    }
    return count;
  }

  async getTrustedUsers(userId: string): Promise<TrustedUser[]> {
    return db.select().from(trustedUsers).where(eq(trustedUsers.userId, userId));
  }

  async createTrustedUser(tu: InsertTrustedUser): Promise<TrustedUser> {
    const [created] = await db.insert(trustedUsers).values(tu).returning();
    return created;
  }

  async deleteTrustedUser(id: number): Promise<void> {
    await db.delete(trustedUsers).where(eq(trustedUsers.id, id));
  }

  async getOsintLinks(userId: string, deviceId?: number): Promise<OsintLink[]> {
    if (deviceId) {
      return db.select().from(osintLinks).where(and(eq(osintLinks.userId, userId), eq(osintLinks.deviceId, deviceId)));
    }
    return db.select().from(osintLinks).where(eq(osintLinks.userId, userId));
  }

  async createOsintLink(link: InsertOsintLink): Promise<OsintLink> {
    const [created] = await db.insert(osintLinks).values(link).returning();
    return created;
  }

  async updateOsintLink(id: number, updates: Partial<InsertOsintLink>): Promise<OsintLink | undefined> {
    const [updated] = await db.update(osintLinks).set(updates).where(eq(osintLinks.id, id)).returning();
    return updated || undefined;
  }

  async deleteOsintLink(id: number): Promise<void> {
    await db.delete(osintLinks).where(eq(osintLinks.id, id));
  }

  async getCustomSignatures(userId: string): Promise<CustomSignature[]> {
    return db.select().from(customSignatures).where(eq(customSignatures.userId, userId));
  }

  async createCustomSignature(sig: InsertCustomSignature): Promise<CustomSignature> {
    const [created] = await db.insert(customSignatures).values(sig).returning();
    return created;
  }

  async deleteCustomSignature(id: number): Promise<void> {
    await db.delete(customSignatures).where(eq(customSignatures.id, id));
  }

  async deleteCustomSignaturesByCategory(userId: string, category: string): Promise<void> {
    await db.delete(customSignatures).where(and(eq(customSignatures.userId, userId), eq(customSignatures.category, category)));
  }

  async getCollectorApiKeys(userId: string): Promise<CollectorApiKey[]> {
    return db.select().from(collectorApiKeys).where(eq(collectorApiKeys.userId, userId)).orderBy(desc(collectorApiKeys.createdAt));
  }

  async createCollectorApiKey(key: InsertCollectorApiKey): Promise<CollectorApiKey> {
    const [created] = await db.insert(collectorApiKeys).values(key).returning();
    return created;
  }

  async deleteCollectorApiKey(id: number): Promise<void> {
    await db.delete(collectorApiKeys).where(eq(collectorApiKeys.id, id));
  }

  async getCollectorApiKeyByKey(apiKey: string): Promise<CollectorApiKey | undefined> {
    const [key] = await db.select().from(collectorApiKeys).where(eq(collectorApiKeys.apiKey, apiKey));
    return key || undefined;
  }

  async updateCollectorApiKeyLastUsed(id: number): Promise<void> {
    await db.update(collectorApiKeys).set({ lastUsedAt: new Date() }).where(eq(collectorApiKeys.id, id));
  }
}

export const storage = new DatabaseStorage();
