import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const signalTypeEnum = pgEnum("signal_type", [
  "bluetooth",
  "wifi",
  "rfid",
  "sdr",
  "lora",
  "meshtastic",
  "adsb",
  "sensor",
  "unknown"
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "active",
  "triggered",
  "dismissed",
  "expired"
]);

export const dataModeEnum = pgEnum("data_mode", [
  "local",
  "friends",
  "public",
  "osint",
  "combined"
]);

export const userTierEnum = pgEnum("user_tier", [
  "free",
  "basic",
  "professional",
  "enterprise",
  "admin"
]);

export const sensorConnectionEnum = pgEnum("sensor_connection", [
  "builtin",
  "bluetooth",
  "usb",
  "serial",
  "network"
]);

export const sensorStatusEnum = pgEnum("sensor_status", [
  "idle",
  "connecting",
  "collecting",
  "error",
  "disconnected"
]);

export const devices = pgTable("devices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  name: text("name"),
  macAddress: text("mac_address"),
  uuid: text("uuid"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  deviceType: text("device_type"),
  signalType: signalTypeEnum("signal_type").notNull().default("unknown"),
  firstSeenAt: timestamp("first_seen_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  isTracked: boolean("is_tracked").default(false),
  isFlagged: boolean("is_flagged").default(false),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  associatedDeviceIds: integer("associated_device_ids").array(),
});

export const observations = pgTable("observations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  deviceId: integer("device_id").notNull(),
  userId: varchar("user_id").notNull(),
  signalType: signalTypeEnum("signal_type").notNull(),
  signalStrength: real("signal_strength"),
  frequency: real("frequency"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  altitude: real("altitude"),
  heading: real("heading"),
  speed: real("speed"),
  rawData: text("raw_data"),
  hexData: text("hex_data"),
  asciiData: text("ascii_data"),
  channel: integer("channel"),
  protocol: text("protocol"),
  encryption: text("encryption"),
  observedAt: timestamp("observed_at").defaultNow(),
  metadata: jsonb("metadata"),
});

export const alerts = pgTable("alerts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  alertType: text("alert_type").notNull(),
  status: alertStatusEnum("status").notNull().default("active"),
  criteria: jsonb("criteria").notNull(),
  triggeredAt: timestamp("triggered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  deviceId: integer("device_id"),
});

export const deviceCatalog = pgTable("device_catalog", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  manufacturer: text("manufacturer").notNull(),
  model: text("model").notNull(),
  signalTypes: text("signal_types").array(),
  description: text("description"),
  commonIdentifiers: text("common_identifiers"),
  frequency: text("frequency"),
});

export const userProfiles = pgTable("user_profiles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().unique(),
  tier: userTierEnum("tier").notNull().default("free"),
  dataMode: dataModeEnum("data_mode").notNull().default("local"),
  storageUsedBytes: integer("storage_used_bytes").default(0),
  storageLimitBytes: integer("storage_limit_bytes").default(2147483648),
  settings: jsonb("settings"),
  trustedUserIds: text("trusted_user_ids").array(),
});

export const activityLog = pgTable("activity_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const followingDetection = pgTable("following_detection", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  encounterCount: integer("encounter_count").default(1),
  firstEncounter: timestamp("first_encounter").defaultNow(),
  lastEncounter: timestamp("last_encounter").defaultNow(),
  riskScore: real("risk_score").default(0),
  status: text("status").default("monitoring"),
  locationHistory: jsonb("location_history"),
});

export const collectionSensors = pgTable("collection_sensors", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  sensorType: signalTypeEnum("sensor_type").notNull(),
  connectionMethod: sensorConnectionEnum("connection_method").notNull().default("builtin"),
  status: sensorStatusEnum("status").notNull().default("idle"),
  isActive: boolean("is_active").notNull().default(false),
  config: jsonb("config"),
  notes: text("notes"),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow(),
  nodesCollected: integer("nodes_collected").default(0),
});

export const associationTypeEnum = pgEnum("association_type", [
  "co_movement",
  "signal_correlation",
  "command_control",
  "network_peer",
  "proximity_pattern",
  "frequency_sharing",
  "temporal_correlation",
  "manual",
  "geoint_triangulation",
]);

export const deviceAssociations = pgTable("device_associations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  deviceId1: integer("device_id_1").notNull(),
  deviceId2: integer("device_id_2").notNull(),
  associationType: associationTypeEnum("association_type").notNull(),
  confidence: real("confidence").notNull().default(0),
  reasoning: text("reasoning"),
  evidence: jsonb("evidence"),
  firstObserved: timestamp("first_observed").defaultNow(),
  lastObserved: timestamp("last_observed").defaultNow(),
  observationCount: integer("observation_count").default(1),
  isConfirmed: boolean("is_confirmed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const devicesRelations = relations(devices, ({ many }) => ({
  observations: many(observations),
}));

export const observationsRelations = relations(observations, ({ one }) => ({
  device: one(devices, {
    fields: [observations.deviceId],
    references: [devices.id],
  }),
}));

export const trustedUsers = pgTable("trusted_users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  trustedEmail: varchar("trusted_email").notNull(),
  trustedAlias: varchar("trusted_alias"),
  addedAt: timestamp("added_at").defaultNow(),
});

export const osintLinks = pgTable("osint_links", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  linkType: varchar("link_type").notNull(),
  alias: varchar("alias"),
  realName: varchar("real_name"),
  source: varchar("source"),
  sourceUrl: varchar("source_url"),
  notes: text("notes"),
  confidence: integer("confidence").default(50),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDeviceSchema = createInsertSchema(devices).omit({ id: true, firstSeenAt: true, lastSeenAt: true });
export const insertObservationSchema = createInsertSchema(observations).omit({ id: true, observedAt: true });
export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true, createdAt: true, triggeredAt: true });
export const insertDeviceCatalogSchema = createInsertSchema(deviceCatalog).omit({ id: true });
export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({ id: true });
export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, timestamp: true });
export const insertFollowingDetectionSchema = createInsertSchema(followingDetection).omit({ id: true, firstEncounter: true, lastEncounter: true });
export const insertCollectionSensorSchema = createInsertSchema(collectionSensors).omit({ id: true, createdAt: true, lastActiveAt: true });
export const insertDeviceAssociationSchema = createInsertSchema(deviceAssociations).omit({ id: true, createdAt: true, firstObserved: true, lastObserved: true });

export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devices.$inferSelect;
export type InsertObservation = z.infer<typeof insertObservationSchema>;
export type Observation = typeof observations.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;
export type DeviceCatalogEntry = typeof deviceCatalog.$inferSelect;
export type InsertDeviceCatalogEntry = z.infer<typeof insertDeviceCatalogSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type FollowingDetectionEntry = typeof followingDetection.$inferSelect;
export type CollectionSensor = typeof collectionSensors.$inferSelect;
export type InsertCollectionSensor = z.infer<typeof insertCollectionSensorSchema>;
export type DeviceAssociation = typeof deviceAssociations.$inferSelect;
export type InsertDeviceAssociation = z.infer<typeof insertDeviceAssociationSchema>;
export const customSignatures = pgTable("custom_signatures", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull(),
  category: text("category").notNull(),
  name: text("name").notNull(),
  terms: text("terms").array().notNull(),
  signalTypes: text("signal_types").array().notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTrustedUserSchema = createInsertSchema(trustedUsers).omit({ id: true, addedAt: true });
export const insertOsintLinkSchema = createInsertSchema(osintLinks).omit({ id: true, createdAt: true });
export const insertCustomSignatureSchema = createInsertSchema(customSignatures).omit({ id: true, createdAt: true });
export type TrustedUser = typeof trustedUsers.$inferSelect;
export type InsertTrustedUser = z.infer<typeof insertTrustedUserSchema>;
export type OsintLink = typeof osintLinks.$inferSelect;
export type InsertOsintLink = z.infer<typeof insertOsintLinkSchema>;
export type CustomSignature = typeof customSignatures.$inferSelect;
export type InsertCustomSignature = z.infer<typeof insertCustomSignatureSchema>;
