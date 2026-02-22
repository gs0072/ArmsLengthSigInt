export interface MeshtasticNode {
  nodeNum: number;
  longName: string;
  shortName: string;
  macAddr: string;
  hwModel: string;
  role: string;
  lastHeard: number;
  snr: number;
  batteryLevel: number;
  voltage: number;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  hopsAway: number;
  airUtilTx?: number;
  channelUtilization?: number;
  uptimeSeconds?: number;
  temperature?: number;
  relativeHumidity?: number;
  barometricPressure?: number;
  isOnline?: boolean;
  lastRssi?: number;
  isFavorite?: boolean;
}

export interface MeshtasticMessage {
  id: number;
  from: number;
  to: number;
  channel: number;
  text: string;
  timestamp: number;
  rxSnr: number;
  hopLimit: number;
  rxRssi?: number;
  fromName?: string;
  acknowledged?: boolean;
  portnum?: string;
}

export interface MeshChannel {
  index: number;
  name: string;
  role: "disabled" | "primary" | "secondary";
  psk: string;
  uplinkEnabled: boolean;
  downlinkEnabled: boolean;
  positionPrecision: number;
}

export interface MeshRadioConfig {
  region: string;
  modemPreset: string;
  hopLimit: number;
  txPower: number;
  txEnabled: boolean;
  bandwidth: number;
  spreadFactor: number;
  codingRate: number;
  frequencyOffset: number;
}

export interface MeshcoreConfig {
  isRepeater: boolean;
  managedFlood: boolean;
  floodRadius: number;
  heartbeatInterval: number;
  clientRegistration: boolean;
  maxClients: number;
  registeredClients: MeshcoreClient[];
}

export interface MeshcoreClient {
  nodeNum: number;
  name: string;
  lastSeen: number;
  rssi: number;
  hops: number;
}

export interface MeshTopologyLink {
  from: number;
  to: number;
  snr: number;
  rssi?: number;
  lastUpdate: number;
}

export interface MeshtasticConnection {
  id: string;
  host: string;
  port: number;
  status: "disconnected" | "connecting" | "connected" | "error";
  deviceName: string;
  firmwareVersion: string;
  myNodeNum: number;
  nodes: MeshtasticNode[];
  messages: MeshtasticMessage[];
  channels: MeshChannel[];
  radioConfig: MeshRadioConfig;
  meshcoreConfig: MeshcoreConfig;
  topology: MeshTopologyLink[];
  lastUpdate: number;
  error: string | null;
  pollInterval: ReturnType<typeof setInterval> | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  uptimeStart: number;
}

const connections: Map<string, MeshtasticConnection> = new Map();

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^localhost$/i,
];

const IP_OR_LOCALHOST = /^[\d.]+$|^localhost$/i;

function isPrivateHost(host: string): boolean {
  if (!IP_OR_LOCALHOST.test(host)) return false;
  if (/^localhost$/i.test(host)) return true;
  return PRIVATE_IP_RANGES.some(r => r.test(host));
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

const DEFAULT_CHANNELS: MeshChannel[] = [
  { index: 0, name: "LongFast", role: "primary", psk: "AQ==", uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 32 },
  { index: 1, name: "", role: "disabled", psk: "", uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0 },
  { index: 2, name: "", role: "disabled", psk: "", uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0 },
  { index: 3, name: "", role: "disabled", psk: "", uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0 },
  { index: 4, name: "", role: "disabled", psk: "", uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0 },
  { index: 5, name: "", role: "disabled", psk: "", uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0 },
  { index: 6, name: "", role: "disabled", psk: "", uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0 },
  { index: 7, name: "", role: "disabled", psk: "", uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0 },
];

const DEFAULT_RADIO_CONFIG: MeshRadioConfig = {
  region: "US",
  modemPreset: "LONG_FAST",
  hopLimit: 3,
  txPower: 30,
  txEnabled: true,
  bandwidth: 250,
  spreadFactor: 11,
  codingRate: 8,
  frequencyOffset: 0,
};

const DEFAULT_MESHCORE_CONFIG: MeshcoreConfig = {
  isRepeater: false,
  managedFlood: false,
  floodRadius: 3,
  heartbeatInterval: 900,
  clientRegistration: false,
  maxClients: 32,
  registeredClients: [],
};

const REGIONS = ["US", "EU_868", "EU_433", "CN", "JP", "ANZ", "KR", "TW", "RU", "IN", "NZ_865", "TH", "LORA_24", "UA_868", "UA_433", "MY_919", "SG_923"];
const MODEM_PRESETS = ["SHORT_FAST", "SHORT_SLOW", "MEDIUM_FAST", "MEDIUM_SLOW", "LONG_FAST", "LONG_MODERATE", "LONG_SLOW", "VERY_LONG_SLOW"];
const NODE_ROLES = ["CLIENT", "CLIENT_MUTE", "ROUTER", "ROUTER_CLIENT", "REPEATER", "TRACKER", "SENSOR", "TAK", "CLIENT_HIDDEN", "LOST_AND_FOUND", "TAK_TRACKER"];
const HW_MODELS = ["TBEAM", "TLORA_V2", "TLORA_V2_1_1P6", "TLORA_V2_1_1P8", "HELTEC_V2_0", "HELTEC_V2_1", "HELTEC_V3", "RAK4631", "RAK11200", "RAK11310", "NANO_G1", "STATION_G1", "STATION_G2", "LORA_RELAY_V1", "NRF52840_PCA10059", "DR_DEV", "PRIVATE_HW", "TBEAM_S3_CORE", "HELTEC_WIRELESS_TRACKER", "HELTEC_WIRELESS_PAPER", "UNPHONE", "PICOMPUTER_S3", "HELTEC_HT62", "EBYTE_ESP32_S3", "ESP32_S3_PICO", "CHATTER_2", "SENSECAP_INDICATOR", "TRACKER_T1000_E", "RAK_WISMESHTAP", "HELTEC_MESH_NODE_T114"];

export function getConnections(): MeshtasticConnection[] {
  return Array.from(connections.values()).map(c => ({
    ...c,
    pollInterval: null,
  }));
}

export function getConnection(id: string): MeshtasticConnection | undefined {
  const c = connections.get(id);
  if (!c) return undefined;
  return { ...c, pollInterval: null };
}

export async function connectToDevice(host: string, port: number = 4403): Promise<MeshtasticConnection> {
  if (!isPrivateHost(host)) {
    throw new Error("Only private/local network addresses are allowed (10.x, 172.16-31.x, 192.168.x, 127.x, localhost)");
  }
  if (!isValidPort(port)) {
    throw new Error("Invalid port number");
  }

  const id = `mesh_${host}_${port}`;

  if (connections.has(id)) {
    const existing = connections.get(id)!;
    if (existing.status === "connected") return { ...existing, pollInterval: null };
  }

  const conn: MeshtasticConnection = {
    id,
    host,
    port,
    status: "connecting",
    deviceName: "",
    firmwareVersion: "",
    myNodeNum: 0,
    nodes: [],
    messages: [],
    channels: [...DEFAULT_CHANNELS],
    radioConfig: { ...DEFAULT_RADIO_CONFIG },
    meshcoreConfig: { ...DEFAULT_MESHCORE_CONFIG },
    topology: [],
    lastUpdate: Date.now(),
    error: null,
    pollInterval: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    uptimeStart: Date.now(),
  };
  connections.set(id, conn);

  try {
    const response = await fetch(`http://${host}:${port}/api/v1/fromradio?all=true`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (response && response.ok) {
      conn.status = "connected";
      conn.deviceName = `Meshtastic @ ${host}`;
      conn.firmwareVersion = "2.x";
      conn.lastUpdate = Date.now();
      conn.reconnectAttempts = 0;
      startPolling(id);
    } else {
      conn.status = "error";
      conn.error = `Cannot reach Meshtastic device at ${host}:${port}. Ensure device is on the network with HTTP API enabled.`;
    }
  } catch (err: any) {
    conn.status = "error";
    conn.error = err.message || "Connection failed";
  }

  connections.set(id, conn);
  return { ...conn, pollInterval: null };
}

function startPolling(id: string): void {
  const conn = connections.get(id);
  if (!conn) return;
  if (conn.pollInterval) clearInterval(conn.pollInterval);

  conn.pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`http://${conn.host}:${conn.port}/api/v1/fromradio?all=true`, {
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);

      if (response && response.ok) {
        conn.status = "connected";
        conn.lastUpdate = Date.now();
        conn.reconnectAttempts = 0;
        conn.error = null;
      } else {
        conn.reconnectAttempts++;
        if (conn.reconnectAttempts >= conn.maxReconnectAttempts) {
          conn.status = "error";
          conn.error = "Lost connection to device after multiple retries";
          stopPolling(id);
        }
      }
    } catch {
      conn.reconnectAttempts++;
      if (conn.reconnectAttempts >= conn.maxReconnectAttempts) {
        conn.status = "error";
        conn.error = "Lost connection to device after multiple retries";
        stopPolling(id);
      }
    }
    connections.set(id, conn);
  }, 15000);
}

function stopPolling(id: string): void {
  const conn = connections.get(id);
  if (conn?.pollInterval) {
    clearInterval(conn.pollInterval);
    conn.pollInterval = null;
  }
}

export function disconnectDevice(id: string): boolean {
  const conn = connections.get(id);
  if (!conn) return false;
  stopPolling(id);
  conn.status = "disconnected";
  conn.nodes = [];
  conn.messages = [];
  conn.topology = [];
  connections.set(id, conn);
  return true;
}

export async function fetchNodes(id: string): Promise<MeshtasticNode[]> {
  const conn = connections.get(id);
  if (!conn || conn.status !== "connected") return [];

  try {
    const response = await fetch(`http://${conn.host}:${conn.port}/api/v1/fromradio?all=true`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (response && response.ok) {
      conn.lastUpdate = Date.now();
      connections.set(id, conn);
      return conn.nodes;
    }
  } catch {}
  return conn.nodes;
}

export async function sendMessage(id: string, text: string, to: number = 0xFFFFFFFF, channel: number = 0): Promise<boolean> {
  const conn = connections.get(id);
  if (!conn || conn.status !== "connected") return false;

  const msg: MeshtasticMessage = {
    id: Date.now(),
    from: conn.myNodeNum,
    to,
    channel,
    text,
    timestamp: Math.floor(Date.now() / 1000),
    rxSnr: 0,
    hopLimit: conn.radioConfig.hopLimit,
    fromName: conn.deviceName,
    acknowledged: false,
    portnum: "TEXT_MESSAGE_APP",
  };

  conn.messages.push(msg);
  if (conn.messages.length > 500) conn.messages = conn.messages.slice(-500);

  try {
    const response = await fetch(`http://${conn.host}:${conn.port}/api/v1/toradio`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-protobuf" },
      body: JSON.stringify({ text, to, channel }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (response && response.ok) {
      msg.acknowledged = true;
    }
    connections.set(id, conn);
    return response ? response.ok : false;
  } catch {
    connections.set(id, conn);
    return false;
  }
}

export function getMessages(id: string, channel?: number): MeshtasticMessage[] {
  const conn = connections.get(id);
  if (!conn) return [];
  if (channel !== undefined) {
    return conn.messages.filter(m => m.channel === channel);
  }
  return conn.messages;
}

export function getChannels(id: string): MeshChannel[] {
  const conn = connections.get(id);
  if (!conn) return [];
  return conn.channels;
}

export function updateChannel(id: string, channelIndex: number, updates: Partial<MeshChannel>): MeshChannel | null {
  const conn = connections.get(id);
  if (!conn) return null;
  if (channelIndex < 0 || channelIndex >= conn.channels.length) return null;
  conn.channels[channelIndex] = { ...conn.channels[channelIndex], ...updates };
  connections.set(id, conn);
  return conn.channels[channelIndex];
}

export function getRadioConfig(id: string): MeshRadioConfig | null {
  const conn = connections.get(id);
  if (!conn) return null;
  return conn.radioConfig;
}

export function updateRadioConfig(id: string, updates: Partial<MeshRadioConfig>): MeshRadioConfig | null {
  const conn = connections.get(id);
  if (!conn) return null;
  if (updates.region && !REGIONS.includes(updates.region)) return null;
  if (updates.modemPreset && !MODEM_PRESETS.includes(updates.modemPreset)) return null;
  if (updates.hopLimit !== undefined && (updates.hopLimit < 1 || updates.hopLimit > 7)) return null;
  if (updates.txPower !== undefined && (updates.txPower < 1 || updates.txPower > 30)) return null;
  conn.radioConfig = { ...conn.radioConfig, ...updates };
  connections.set(id, conn);
  return conn.radioConfig;
}

export function getMeshcoreConfig(id: string): MeshcoreConfig | null {
  const conn = connections.get(id);
  if (!conn) return null;
  return conn.meshcoreConfig;
}

export function updateMeshcoreConfig(id: string, updates: Partial<MeshcoreConfig>): MeshcoreConfig | null {
  const conn = connections.get(id);
  if (!conn) return null;
  conn.meshcoreConfig = { ...conn.meshcoreConfig, ...updates };
  connections.set(id, conn);
  return conn.meshcoreConfig;
}

export function getTopology(id: string): MeshTopologyLink[] {
  const conn = connections.get(id);
  if (!conn) return [];
  return conn.topology;
}

export function getMeshtasticStatus(): {
  available: boolean;
  activeConnections: number;
  totalNodes: number;
  totalMessages: number;
} {
  const active = Array.from(connections.values()).filter(c => c.status === "connected");
  return {
    available: true,
    activeConnections: active.length,
    totalNodes: active.reduce((sum, c) => sum + c.nodes.length, 0),
    totalMessages: active.reduce((sum, c) => sum + c.messages.length, 0),
  };
}

export function getAllNodes(): MeshtasticNode[] {
  const allNodes: MeshtasticNode[] = [];
  const conns = Array.from(connections.values());
  for (const conn of conns) {
    if (conn.status === "connected") {
      allNodes.push(...conn.nodes);
    }
  }
  return allNodes;
}

export function getAllTopology(): MeshTopologyLink[] {
  const allLinks: MeshTopologyLink[] = [];
  const conns = Array.from(connections.values());
  for (const conn of conns) {
    if (conn.status === "connected") {
      allLinks.push(...conn.topology);
    }
  }
  return allLinks;
}

export function getAvailableRegions(): string[] { return REGIONS; }
export function getAvailableModemPresets(): string[] { return MODEM_PRESETS; }
export function getAvailableNodeRoles(): string[] { return NODE_ROLES; }
export function getAvailableHwModels(): string[] { return HW_MODELS; }

export function getConnectionUptime(id: string): number {
  const conn = connections.get(id);
  if (!conn || conn.status !== "connected") return 0;
  return Date.now() - conn.uptimeStart;
}

export function removeConnection(id: string): boolean {
  stopPolling(id);
  return connections.delete(id);
}
