import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface NmapHost {
  ip: string;
  hostname: string;
  mac: string;
  vendor: string;
  status: string;
  ports: NmapPort[];
  os: string;
}

export interface NmapPort {
  port: number;
  protocol: string;
  state: string;
  service: string;
  version: string;
}

export interface NmapScanResult {
  scanType: string;
  target: string;
  startTime: number;
  endTime: number;
  hosts: NmapHost[];
  rawOutput: string;
  error: string | null;
}

const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^fe80:/i,
  /^fd[0-9a-f]{2}:/i,
];

const CIDR_PATTERN = /^[\d.]+\/\d{1,2}$/;
const IP_PATTERN = /^[\d.]+$/;

function isPrivateIP(ip: string): boolean {
  return PRIVATE_RANGES.some(r => r.test(ip));
}

function isValidTarget(target: string): boolean {
  const trimmed = target.trim();

  if (CIDR_PATTERN.test(trimmed)) {
    const [ip, mask] = trimmed.split("/");
    const maskNum = parseInt(mask);
    if (maskNum < 16) return false;
    return isPrivateIP(ip);
  }

  if (IP_PATTERN.test(trimmed)) {
    return isPrivateIP(trimmed);
  }

  return false;
}

function sanitizeTarget(target: string): string {
  return target.replace(/[^a-zA-Z0-9.\-\/: ]/g, "");
}

export async function checkNmapAvailable(): Promise<boolean> {
  try {
    await execAsync("which nmap");
    return true;
  } catch {
    return false;
  }
}

export async function getNmapVersion(): Promise<string> {
  try {
    const { stdout } = await execAsync("nmap --version 2>/dev/null | head -1");
    return stdout.trim();
  } catch {
    return "Not installed";
  }
}

function parseNmapOutput(output: string): NmapHost[] {
  const hosts: NmapHost[] = [];
  const hostBlocks = output.split(/Nmap scan report for /);

  for (let i = 1; i < hostBlocks.length; i++) {
    const block = hostBlocks[i];
    const lines = block.split("\n");

    let ip = "";
    let hostname = "";
    const firstLine = lines[0].trim();
    const ipMatch = firstLine.match(/\(?([\d.]+)\)?/);
    if (ipMatch) {
      ip = ipMatch[1];
      const hostMatch = firstLine.match(/^([^\s(]+)/);
      if (hostMatch && hostMatch[1] !== ip) {
        hostname = hostMatch[1];
      }
    } else {
      ip = firstLine.replace(/[()]/g, "").trim();
    }

    let mac = "";
    let vendor = "";
    let os = "";
    const ports: NmapPort[] = [];
    let status = "up";

    const statusMatch = block.match(/Host is (up|down)/);
    if (statusMatch) {
      status = statusMatch[1];
    }

    for (const line of lines) {
      const macMatch = line.match(/MAC Address:\s+([A-F0-9:]+)\s*\(?(.*?)\)?$/i);
      if (macMatch) {
        mac = macMatch[1];
        vendor = macMatch[2] || "";
      }

      const portMatch = line.match(/^(\d+)\/(tcp|udp)\s+(open|closed|filtered)\s+(\S+)\s*(.*)?$/);
      if (portMatch) {
        ports.push({
          port: parseInt(portMatch[1]),
          protocol: portMatch[2],
          state: portMatch[3],
          service: portMatch[4],
          version: (portMatch[5] || "").trim(),
        });
      }

      const osMatch = line.match(/OS details:\s+(.+)/);
      if (osMatch) {
        os = osMatch[1];
      }
    }

    if (ip) {
      hosts.push({ ip, hostname, mac, vendor, status, ports, os });
    }
  }

  return hosts;
}

export async function runPingScan(target: string): Promise<NmapScanResult> {
  const sanitized = sanitizeTarget(target);
  if (!isValidTarget(sanitized)) {
    return {
      scanType: "ping",
      target: sanitized,
      startTime: Date.now(),
      endTime: Date.now(),
      hosts: [],
      rawOutput: "",
      error: "Invalid target. Only private/local network ranges allowed (10.x, 172.16-31.x, 192.168.x, 127.x). CIDR must be /16 or larger.",
    };
  }

  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execAsync(`nmap -sn ${sanitized} -T4 --max-retries 1`, {
      timeout: 30000,
    });
    return {
      scanType: "ping",
      target: sanitized,
      startTime,
      endTime: Date.now(),
      hosts: parseNmapOutput(stdout),
      rawOutput: stdout,
      error: stderr ? stderr.trim() : null,
    };
  } catch (err: any) {
    return {
      scanType: "ping",
      target: sanitized,
      startTime,
      endTime: Date.now(),
      hosts: [],
      rawOutput: err.stdout || "",
      error: err.message || "Scan failed",
    };
  }
}

export async function runPortScan(target: string, ports: string = "1-1024"): Promise<NmapScanResult> {
  const sanitized = sanitizeTarget(target);
  if (!isValidTarget(sanitized)) {
    return {
      scanType: "port",
      target: sanitized,
      startTime: Date.now(),
      endTime: Date.now(),
      hosts: [],
      rawOutput: "",
      error: "Invalid target. Only private/local network ranges allowed.",
    };
  }

  const sanitizedPorts = ports.replace(/[^0-9,\-]/g, "");

  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execAsync(
      `nmap -sT -p ${sanitizedPorts} ${sanitized} -T4 --max-retries 1 -sV --version-intensity 2`,
      { timeout: 60000 }
    );
    return {
      scanType: "port",
      target: sanitized,
      startTime,
      endTime: Date.now(),
      hosts: parseNmapOutput(stdout),
      rawOutput: stdout,
      error: stderr ? stderr.trim() : null,
    };
  } catch (err: any) {
    return {
      scanType: "port",
      target: sanitized,
      startTime,
      endTime: Date.now(),
      hosts: [],
      rawOutput: err.stdout || "",
      error: err.message || "Scan failed",
    };
  }
}

export async function runQuickScan(target: string): Promise<NmapScanResult> {
  const sanitized = sanitizeTarget(target);
  if (!isValidTarget(sanitized)) {
    return {
      scanType: "quick",
      target: sanitized,
      startTime: Date.now(),
      endTime: Date.now(),
      hosts: [],
      rawOutput: "",
      error: "Invalid target. Only private/local network ranges allowed.",
    };
  }

  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execAsync(
      `nmap -F ${sanitized} -T4 --max-retries 1`,
      { timeout: 30000 }
    );
    return {
      scanType: "quick",
      target: sanitized,
      startTime,
      endTime: Date.now(),
      hosts: parseNmapOutput(stdout),
      rawOutput: stdout,
      error: stderr ? stderr.trim() : null,
    };
  } catch (err: any) {
    return {
      scanType: "quick",
      target: sanitized,
      startTime,
      endTime: Date.now(),
      hosts: [],
      rawOutput: err.stdout || "",
      error: err.message || "Scan failed",
    };
  }
}
