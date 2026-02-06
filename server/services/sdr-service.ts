import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface SDRDevice {
  index: number;
  name: string;
  serial: string;
  vendor: string;
  product: string;
  available: boolean;
}

export interface SDRSignal {
  frequency: number;
  power: number;
  bandwidth: number;
  modulation: string;
  timestamp: number;
}

export interface SDRScanResult {
  startFreq: number;
  endFreq: number;
  startTime: number;
  endTime: number;
  signals: SDRSignal[];
  rawOutput: string;
  error: string | null;
}

export async function checkSDRToolsAvailable(): Promise<{
  rtlSdr: boolean;
  rtlPower: boolean;
  rtlFm: boolean;
  rtlTest: boolean;
  dump1090: boolean;
}> {
  const check = async (cmd: string): Promise<boolean> => {
    try {
      await execAsync(`which ${cmd}`);
      return true;
    } catch {
      return false;
    }
  };

  const [rtlSdr, rtlPower, rtlFm, rtlTest, dump1090] = await Promise.all([
    check("rtl_sdr"),
    check("rtl_power"),
    check("rtl_fm"),
    check("rtl_test"),
    check("dump1090"),
  ]);

  return { rtlSdr, rtlPower, rtlFm, rtlTest, dump1090 };
}

export async function getSDRDevices(): Promise<SDRDevice[]> {
  try {
    const { stdout, stderr } = await execAsync("rtl_test -t 2>&1 || true", { timeout: 5000 });
    const output = stdout + stderr;
    const devices: SDRDevice[] = [];

    const deviceMatch = output.match(/Found (\d+) device/);
    if (deviceMatch) {
      const count = parseInt(deviceMatch[1]);
      for (let i = 0; i < count; i++) {
        const nameMatch = output.match(new RegExp(`${i}:\\s+(.+?)(?:,\\s*(.+?))?(?:,\\s*SN:\\s*(\\S+))?$`, "m"));
        devices.push({
          index: i,
          name: nameMatch ? nameMatch[1].trim() : `RTL-SDR Device ${i}`,
          vendor: nameMatch?.[2]?.trim() || "Realtek",
          product: nameMatch?.[1]?.trim() || "RTL2838",
          serial: nameMatch?.[3]?.trim() || "",
          available: true,
        });
      }
    }

    return devices;
  } catch {
    return [];
  }
}

export async function runPowerScan(
  startFreqMHz: number,
  endFreqMHz: number,
  binSizeHz: number = 10000
): Promise<SDRScanResult> {
  if (startFreqMHz < 24 || endFreqMHz > 1766 || startFreqMHz >= endFreqMHz) {
    return {
      startFreq: startFreqMHz * 1e6,
      endFreq: endFreqMHz * 1e6,
      startTime: Date.now(),
      endTime: Date.now(),
      signals: [],
      rawOutput: "",
      error: "Invalid frequency range. RTL-SDR supports 24 MHz to 1766 MHz.",
    };
  }

  const startTime = Date.now();
  try {
    const startHz = Math.floor(startFreqMHz * 1e6);
    const endHz = Math.floor(endFreqMHz * 1e6);

    const { stdout, stderr } = await execAsync(
      `rtl_power -f ${startHz}:${endHz}:${binSizeHz} -1 -c 20% 2>/dev/null`,
      { timeout: 30000 }
    );

    const signals: SDRSignal[] = [];
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      const parts = line.split(",").map(s => s.trim());
      if (parts.length < 7) continue;
      const freqLow = parseFloat(parts[2]);
      const freqStep = parseFloat(parts[4]);
      for (let j = 6; j < parts.length; j++) {
        const power = parseFloat(parts[j]);
        if (!isNaN(power) && power > -60) {
          const freq = freqLow + (j - 6) * freqStep;
          signals.push({
            frequency: freq,
            power,
            bandwidth: freqStep,
            modulation: "unknown",
            timestamp: Date.now(),
          });
        }
      }
    }

    return {
      startFreq: startHz,
      endFreq: endHz,
      startTime,
      endTime: Date.now(),
      signals,
      rawOutput: stdout,
      error: stderr ? stderr.trim() : null,
    };
  } catch (err: any) {
    return {
      startFreq: startFreqMHz * 1e6,
      endFreq: endFreqMHz * 1e6,
      startTime,
      endTime: Date.now(),
      signals: [],
      rawOutput: "",
      error: err.message || "SDR scan failed. Ensure RTL-SDR device is connected.",
    };
  }
}

export async function getSDRStatus(): Promise<{
  toolsInstalled: boolean;
  devicesConnected: number;
  supportedRange: string;
}> {
  const tools = await checkSDRToolsAvailable();
  const devices = await getSDRDevices();
  return {
    toolsInstalled: tools.rtlSdr || tools.rtlPower,
    devicesConnected: devices.length,
    supportedRange: "24 MHz - 1766 MHz",
  };
}
