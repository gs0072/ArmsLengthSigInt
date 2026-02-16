import { exec } from "child_process";
import { promisify } from "util";
import * as dns from "dns";

const execAsync = promisify(exec);
const dnsReverse = promisify(dns.reverse);

export interface NmapHost {
  ip: string;
  hostname: string;
  mac: string;
  vendor: string;
  status: string;
  ports: NmapPort[];
  os: string;
  deviceLabel: string;
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

async function resolveHostname(ip: string): Promise<string> {
  try {
    const names = await dnsReverse(ip);
    if (names && names.length > 0) {
      return names[0];
    }
  } catch {}
  return "";
}

const SERVICE_DEVICE_TYPES: Record<string, { label: string; type: string }> = {
  "http": { label: "Web Server", type: "Server" },
  "https": { label: "Secure Web Server", type: "Server" },
  "ssh": { label: "SSH Host", type: "Server" },
  "ftp": { label: "FTP Server", type: "Server" },
  "smtp": { label: "Mail Server", type: "Server" },
  "imap": { label: "Mail Server", type: "Server" },
  "pop3": { label: "Mail Server", type: "Server" },
  "dns": { label: "DNS Server", type: "Network Infrastructure" },
  "domain": { label: "DNS Server", type: "Network Infrastructure" },
  "dhcp": { label: "DHCP Server", type: "Network Infrastructure" },
  "mysql": { label: "Database Server", type: "Server" },
  "postgresql": { label: "Database Server", type: "Server" },
  "redis": { label: "Cache Server", type: "Server" },
  "vnc": { label: "Remote Desktop", type: "Workstation" },
  "ms-wbt-server": { label: "Remote Desktop (RDP)", type: "Workstation" },
  "rdp": { label: "Remote Desktop (RDP)", type: "Workstation" },
  "telnet": { label: "Telnet Host", type: "Server" },
  "snmp": { label: "Network Device", type: "Network Infrastructure" },
  "printer": { label: "Network Printer", type: "Printer" },
  "ipp": { label: "Network Printer", type: "Printer" },
  "sip": { label: "VoIP Phone", type: "Phone" },
  "rtsp": { label: "Camera/Streaming", type: "IoT" },
  "mqtt": { label: "IoT Hub", type: "IoT" },
  "upnp": { label: "UPnP Device", type: "IoT" },
  "mdns": { label: "mDNS Device", type: "IoT" },
  "ntp": { label: "Time Server", type: "Network Infrastructure" },
  "smb": { label: "File Share", type: "Server" },
  "microsoft-ds": { label: "Windows Host", type: "Workstation" },
  "netbios-ssn": { label: "Windows Host", type: "Workstation" },
  "kerberos": { label: "Domain Controller", type: "Server" },
  "ldap": { label: "Directory Server", type: "Server" },
  "http-proxy": { label: "Proxy Server", type: "Network Infrastructure" },
  "socks": { label: "Proxy Server", type: "Network Infrastructure" },
  "pptp": { label: "VPN Gateway", type: "Network Infrastructure" },
  "openvpn": { label: "VPN Gateway", type: "Network Infrastructure" },
};

const WELL_KNOWN_PORTS: Record<number, { label: string; type: string }> = {
  21: { label: "FTP Server", type: "Server" },
  22: { label: "SSH Host", type: "Server" },
  23: { label: "Telnet Host", type: "Server" },
  25: { label: "Mail Server", type: "Server" },
  53: { label: "DNS Server", type: "Network Infrastructure" },
  80: { label: "Web Server", type: "Server" },
  443: { label: "Secure Web Server", type: "Server" },
  445: { label: "Windows Host", type: "Workstation" },
  631: { label: "Network Printer", type: "Printer" },
  993: { label: "Mail Server", type: "Server" },
  1433: { label: "SQL Server", type: "Server" },
  1883: { label: "IoT Hub (MQTT)", type: "IoT" },
  3306: { label: "MySQL Server", type: "Server" },
  3389: { label: "Remote Desktop (RDP)", type: "Workstation" },
  5432: { label: "PostgreSQL Server", type: "Server" },
  5900: { label: "Remote Desktop (VNC)", type: "Workstation" },
  6379: { label: "Redis Server", type: "Server" },
  8080: { label: "Web Server", type: "Server" },
  8443: { label: "Web Server", type: "Server" },
  8883: { label: "IoT Hub (MQTT)", type: "IoT" },
  9090: { label: "Web Server", type: "Server" },
  27017: { label: "MongoDB Server", type: "Server" },
};

function buildDeviceLabel(host: { ip: string; hostname: string; vendor: string; ports: NmapPort[]; os: string; mac: string }): string {
  if (host.hostname) {
    const hn = host.hostname;
    if (hn === "host.docker.internal") return "Docker Host";
    if (/gateway|router|gw\b/i.test(hn)) return "Gateway/Router";
    if (/switch/i.test(hn)) return "Network Switch";
    if (/ap\b|access.?point/i.test(hn)) return "Access Point";
    const cleanName = hn
      .replace(/\.local$/, "")
      .replace(/\.lan$/, "")
      .replace(/\.home$/, "")
      .replace(/\.internal$/, "")
      .replace(/\.localdomain$/, "");
    if (cleanName.length <= 40 && !/^[a-f0-9]{12,}$/i.test(cleanName)) {
      return cleanName;
    }
  }

  const openPorts = host.ports.filter(p => p.state === "open");
  for (const port of openPorts) {
    if (port.version) {
      const ver = port.version.toLowerCase();
      if (ver.includes("node.js") || ver.includes("express")) return "Node.js Server";
      if (ver.includes("apache")) return "Apache Web Server";
      if (ver.includes("nginx")) return "Nginx Web Server";
      if (ver.includes("openssh")) return "Linux Host (SSH)";
      if (ver.includes("windows")) return "Windows Host";
      if (ver.includes("microsoft")) return "Windows Host";
      if (ver.includes("raspberry")) return "Raspberry Pi";
      if (ver.includes("ubiquiti") || ver.includes("unifi")) return "Ubiquiti Device";
      if (ver.includes("iphone") || ver.includes("ios")) return "iPhone/iPad";
      if (ver.includes("android")) return "Android Device";
    }

    const serviceInfo = SERVICE_DEVICE_TYPES[port.service];
    if (serviceInfo) return serviceInfo.label;
  }

  for (const port of openPorts) {
    const portInfo = WELL_KNOWN_PORTS[port.port];
    if (portInfo) return portInfo.label;
  }

  if (host.os) {
    const osLower = host.os.toLowerCase();
    if (osLower.includes("linux")) return "Linux Host";
    if (osLower.includes("windows")) return "Windows Host";
    if (osLower.includes("mac") || osLower.includes("darwin")) return "Mac";
    if (osLower.includes("ios")) return "iPhone/iPad";
    if (osLower.includes("android")) return "Android Device";
    if (osLower.includes("printer")) return "Network Printer";
    if (osLower.includes("router") || osLower.includes("switch")) return "Network Device";
    return host.os.split(",")[0].trim();
  }

  if (host.vendor) {
    const v = host.vendor.toLowerCase();
    if (v.includes("apple")) return "Apple Device";
    if (v.includes("samsung")) return "Samsung Device";
    if (v.includes("google")) return "Google Device";
    if (v.includes("amazon")) return "Amazon Device";
    if (v.includes("cisco") || v.includes("meraki")) return "Cisco Network Device";
    if (v.includes("ubiquiti")) return "Ubiquiti Device";
    if (v.includes("tp-link") || v.includes("tplink")) return "TP-Link Device";
    if (v.includes("netgear")) return "Netgear Device";
    if (v.includes("asus")) return "ASUS Device";
    if (v.includes("intel")) return "Intel Host";
    if (v.includes("dell")) return "Dell Host";
    if (v.includes("hp") || v.includes("hewlett")) return "HP Device";
    if (v.includes("lenovo")) return "Lenovo Host";
    if (v.includes("raspberry")) return "Raspberry Pi";
    if (v.includes("espressif")) return "ESP32/IoT Device";
    if (v.includes("sonos")) return "Sonos Speaker";
    if (v.includes("ring")) return "Ring Device";
    if (v.includes("nest")) return "Nest Device";
    if (v.includes("philips") && v.includes("hue")) return "Philips Hue";
    if (host.vendor.length > 0) return `${host.vendor} Device`;
  }

  const lastOctet = host.ip.split(".").pop() || "";
  if (lastOctet === "1" || lastOctet === "254") return "Gateway/Router";

  return "Network Host";
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
      const deviceLabel = buildDeviceLabel({ ip, hostname, vendor, ports, os, mac });
      hosts.push({ ip, hostname, mac, vendor, status, ports, os, deviceLabel });
    }
  }

  return hosts;
}

export async function runDiscoveryScan(target: string): Promise<NmapScanResult> {
  const sanitized = sanitizeTarget(target);
  if (!isValidTarget(sanitized)) {
    return {
      scanType: "discovery",
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
    const { stdout: pingOut } = await execAsync(`nmap -sn ${sanitized} -T4 --max-retries 1`, {
      timeout: 15000,
    });
    const pingHosts = parseNmapOutput(pingOut);
    const liveIPs = pingHosts.filter(h => h.status === "up").map(h => h.ip);

    if (liveIPs.length === 0) {
      return {
        scanType: "discovery",
        target: sanitized,
        startTime,
        endTime: Date.now(),
        hosts: [],
        rawOutput: pingOut,
        error: null,
      };
    }

    const targetList = liveIPs.join(" ");
    const topPorts = "22,80,443,445,3389,5900,8080,631,53,3306,5432,1883,8443,5000,9090";

    let serviceHosts: NmapHost[] = [];
    try {
      const { stdout: svcOut } = await execAsync(
        `nmap -sT -p ${topPorts} ${targetList} -T4 --max-retries 1 --host-timeout 5s -sV --version-intensity 0`,
        { timeout: 45000 }
      );
      serviceHosts = parseNmapOutput(svcOut);
    } catch (svcErr: any) {
      if (svcErr.stdout) {
        serviceHosts = parseNmapOutput(svcErr.stdout);
      }
    }

    const dnsResults = await Promise.all(
      liveIPs.map(async (ip) => {
        const name = await resolveHostname(ip);
        return { ip, name };
      })
    );
    const dnsMap = new Map(dnsResults.map(r => [r.ip, r.name]));

    const serviceMap = new Map(serviceHosts.map(h => [h.ip, h]));

    const mergedHosts: NmapHost[] = pingHosts.map(pingHost => {
      const svcHost = serviceMap.get(pingHost.ip);
      const dnsName = dnsMap.get(pingHost.ip) || "";

      const hostname = pingHost.hostname || dnsName || (svcHost?.hostname || "");
      const ports = svcHost?.ports || pingHost.ports;
      const vendor = pingHost.vendor || svcHost?.vendor || "";
      const os = pingHost.os || svcHost?.os || "";
      const mac = pingHost.mac || svcHost?.mac || "";

      const merged = {
        ...pingHost,
        hostname,
        ports,
        vendor,
        os,
        mac,
      };

      merged.deviceLabel = buildDeviceLabel(merged);
      return merged;
    });

    return {
      scanType: "discovery",
      target: sanitized,
      startTime,
      endTime: Date.now(),
      hosts: mergedHosts,
      rawOutput: pingOut,
      error: null,
    };
  } catch (err: any) {
    return {
      scanType: "discovery",
      target: sanitized,
      startTime,
      endTime: Date.now(),
      hosts: [],
      rawOutput: err.stdout || "",
      error: err.message || "Discovery scan failed",
    };
  }
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
