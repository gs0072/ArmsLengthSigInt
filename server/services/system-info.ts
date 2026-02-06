import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);

export interface SystemInfo {
  os: string;
  platform: string;
  arch: string;
  hostname: string;
  kernel: string;
  uptime: number;
  memory: {
    total: number;
    free: number;
    used: number;
  };
  cpus: number;
}

export interface ToolStatus {
  name: string;
  installed: boolean;
  version: string;
  path: string;
  description: string;
}

export interface SystemCapabilities {
  system: SystemInfo;
  tools: ToolStatus[];
  networkInterfaces: NetworkInterfaceInfo[];
}

export interface NetworkInterfaceInfo {
  name: string;
  mac: string;
  addresses: string[];
  internal: boolean;
}

async function getToolInfo(name: string, versionCmd: string, description: string): Promise<ToolStatus> {
  try {
    const { stdout: path } = await execAsync(`which ${name} 2>/dev/null`);
    let version = "";
    try {
      const { stdout } = await execAsync(`${versionCmd} 2>/dev/null | head -1`);
      version = stdout.trim();
    } catch {}
    return {
      name,
      installed: true,
      version,
      path: path.trim(),
      description,
    };
  } catch {
    return {
      name,
      installed: false,
      version: "",
      path: "",
      description,
    };
  }
}

export async function getSystemInfo(): Promise<SystemInfo> {
  let kernel = "";
  try {
    const { stdout } = await execAsync("uname -r 2>/dev/null");
    kernel = stdout.trim();
  } catch {}

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    os: `${os.type()} ${os.release()}`,
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    kernel,
    uptime: os.uptime(),
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
    },
    cpus: os.cpus().length,
  };
}

export async function getToolStatuses(): Promise<ToolStatus[]> {
  const tools = await Promise.all([
    getToolInfo("nmap", "nmap --version", "Network mapper - host discovery and port scanning"),
    getToolInfo("rtl_sdr", "rtl_sdr 2>&1 | head -1", "RTL-SDR raw signal capture tool"),
    getToolInfo("rtl_power", "rtl_power 2>&1 | head -1", "RTL-SDR power spectrum scanner"),
    getToolInfo("rtl_fm", "rtl_fm 2>&1 | head -1", "RTL-SDR FM demodulator"),
    getToolInfo("rtl_test", "rtl_test 2>&1 | head -1", "RTL-SDR device tester"),
    getToolInfo("dump1090", "dump1090 --help 2>&1 | head -1", "ADS-B aircraft transponder decoder"),
    getToolInfo("python3", "python3 --version", "Python runtime for Meshtastic CLI"),
    getToolInfo("node", "node --version", "Node.js runtime"),
    getToolInfo("ip", "ip -V 2>&1 | head -1", "Network interface management"),
    getToolInfo("iwconfig", "iwconfig --version 2>&1 | head -1", "Wireless network configuration"),
    getToolInfo("hcitool", "hcitool --version 2>&1 | head -1", "Bluetooth HCI tool"),
    getToolInfo("bluetoothctl", "bluetoothctl --version 2>&1 | head -1", "Bluetooth controller manager"),
  ]);

  return tools;
}

export function getNetworkInterfaces(): NetworkInterfaceInfo[] {
  const interfaces = os.networkInterfaces();
  const result: NetworkInterfaceInfo[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    result.push({
      name,
      mac: addrs[0]?.mac || "",
      addresses: addrs.map(a => `${a.address} (${a.family})`),
      internal: addrs[0]?.internal || false,
    });
  }

  return result;
}

export async function getSystemCapabilities(): Promise<SystemCapabilities> {
  const [system, tools] = await Promise.all([
    getSystemInfo(),
    getToolStatuses(),
  ]);

  return {
    system,
    tools,
    networkInterfaces: getNetworkInterfaces(),
  };
}
