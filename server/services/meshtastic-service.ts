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
}

export interface MeshtasticConnection {
  id: string;
  host: string;
  port: number;
  status: "disconnected" | "connecting" | "connected" | "error";
  deviceName: string;
  firmwareVersion: string;
  nodes: MeshtasticNode[];
  messages: MeshtasticMessage[];
  lastUpdate: number;
  error: string | null;
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

const VALID_PORT_MIN = 1;
const VALID_PORT_MAX = 65535;

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= VALID_PORT_MIN && port <= VALID_PORT_MAX;
}

export function getConnections(): MeshtasticConnection[] {
  return Array.from(connections.values());
}

export function getConnection(id: string): MeshtasticConnection | undefined {
  return connections.get(id);
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
    if (existing.status === "connected") return existing;
  }

  const conn: MeshtasticConnection = {
    id,
    host,
    port,
    status: "connecting",
    deviceName: "",
    firmwareVersion: "",
    nodes: [],
    messages: [],
    lastUpdate: Date.now(),
    error: null,
  };
  connections.set(id, conn);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${host}:${port}/api/v1/fromradio?all=true`, {
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeout);

    if (response && response.ok) {
      conn.status = "connected";
      conn.deviceName = `Meshtastic @ ${host}`;
      conn.firmwareVersion = "2.x";
      conn.lastUpdate = Date.now();
    } else {
      conn.status = "error";
      conn.error = `Cannot reach Meshtastic device at ${host}:${port}. Ensure device is on the network with HTTP API enabled.`;
    }
  } catch (err: any) {
    conn.status = "error";
    conn.error = err.message || "Connection failed";
  }

  connections.set(id, conn);
  return conn;
}

export function disconnectDevice(id: string): boolean {
  const conn = connections.get(id);
  if (!conn) return false;
  conn.status = "disconnected";
  conn.nodes = [];
  conn.messages = [];
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
  } catch {
  }
  return conn.nodes;
}

export async function sendMessage(id: string, text: string, to: number = 0xFFFFFFFF, channel: number = 0): Promise<boolean> {
  const conn = connections.get(id);
  if (!conn || conn.status !== "connected") return false;

  try {
    const response = await fetch(`http://${conn.host}:${conn.port}/api/v1/toradio`, {
      method: "PUT",
      headers: { "Content-Type": "application/x-protobuf" },
      body: JSON.stringify({ text, to, channel }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    return response ? response.ok : false;
  } catch {
    return false;
  }
}

export function getMeshtasticStatus(): {
  available: boolean;
  activeConnections: number;
  totalNodes: number;
} {
  const active = Array.from(connections.values()).filter(c => c.status === "connected");
  return {
    available: true,
    activeConnections: active.length,
    totalNodes: active.reduce((sum, c) => sum + c.nodes.length, 0),
  };
}
