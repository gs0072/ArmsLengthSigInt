import {
  users, devices, observations, alerts, deviceCatalog, userProfiles, activityLog, followingDetection,
  type User, type UpsertUser,
  type Device, type InsertDevice,
  type Observation, type InsertObservation,
  type Alert, type InsertAlert,
  type DeviceCatalogEntry, type InsertDeviceCatalogEntry,
  type UserProfile, type InsertUserProfile,
  type ActivityLogEntry,
  type FollowingDetectionEntry,
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

  logActivity(userId: string, action: string, details?: string, ipAddress?: string): Promise<void>;

  getFollowingDetection(userId: string): Promise<FollowingDetectionEntry[]>;
  getDeviceByMac(userId: string, macAddress: string): Promise<Device | undefined>;
  clearUserData(userId: string): Promise<void>;
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
    const [upserted] = await db
      .insert(userProfiles)
      .values(profile)
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: profile,
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
}

export const storage = new DatabaseStorage();
