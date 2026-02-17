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
  label?: string;
}

export interface SDRScanResult {
  startFreq: number;
  endFreq: number;
  startTime: number;
  endTime: number;
  signals: SDRSignal[];
  rawOutput: string;
  error: string | null;
  source: "server" | "simulation";
}

const KNOWN_FREQUENCIES: Record<string, { label: string; band: string }> = {
  "88-108": { label: "FM Broadcast Radio", band: "VHF" },
  "118-137": { label: "Aviation Voice (AM)", band: "VHF" },
  "137-138": { label: "NOAA Weather Satellites", band: "VHF" },
  "144-148": { label: "Amateur Radio 2m", band: "VHF" },
  "150-174": { label: "VHF Business/Public Safety", band: "VHF" },
  "162.4-162.55": { label: "NOAA Weather Radio", band: "VHF" },
  "225-400": { label: "Military UHF (AM)", band: "UHF" },
  "403-410": { label: "Radiosonde / Weather Balloons", band: "UHF" },
  "420-450": { label: "Amateur Radio 70cm", band: "UHF" },
  "433-434": { label: "ISM Band / LoRa / IoT", band: "UHF" },
  "462-467": { label: "FRS/GMRS Two-Way Radio", band: "UHF" },
  "470-698": { label: "UHF TV Broadcast", band: "UHF" },
  "824-849": { label: "Cellular Uplink (850MHz)", band: "Cellular" },
  "869-894": { label: "Cellular Downlink (850MHz)", band: "Cellular" },
  "902-928": { label: "ISM Band 900MHz / LoRa", band: "ISM" },
  "935-960": { label: "GSM-900 Downlink", band: "Cellular" },
  "1030-1090": { label: "ADS-B / Mode S Transponder", band: "L-Band" },
  "1090": { label: "ADS-B (1090 MHz)", band: "L-Band" },
  "1176.45": { label: "GPS L5", band: "L-Band" },
  "1227.6": { label: "GPS L2", band: "L-Band" },
  "1381-1400": { label: "Iridium Satellite", band: "L-Band" },
  "1525-1559": { label: "Inmarsat / Thuraya", band: "L-Band" },
  "1559-1610": { label: "GPS L1 / GLONASS", band: "L-Band" },
  "1575.42": { label: "GPS L1", band: "L-Band" },
  "1616-1626.5": { label: "Iridium", band: "L-Band" },
};

export const FREQUENCY_PRESETS = [
  { name: "FM Broadcast", startMHz: 88, endMHz: 108, description: "Commercial FM radio stations" },
  { name: "Air Band", startMHz: 118, endMHz: 137, description: "Aviation communications (AM)" },
  { name: "NOAA Satellites", startMHz: 137, endMHz: 138, description: "Weather satellite downlinks (APT)" },
  { name: "2m Ham Band", startMHz: 144, endMHz: 148, description: "Amateur radio 2 meter band" },
  { name: "Weather Radio", startMHz: 162, endMHz: 163, description: "NOAA Weather Radio frequencies" },
  { name: "Marine VHF", startMHz: 156, endMHz: 163, description: "Marine VHF communications" },
  { name: "Military Air", startMHz: 225, endMHz: 400, description: "Military aviation UHF" },
  { name: "ISM 433", startMHz: 432, endMHz: 435, description: "ISM band - LoRa, IoT, keyfobs" },
  { name: "FRS/GMRS", startMHz: 462, endMHz: 468, description: "Family & General Mobile Radio" },
  { name: "Cellular 850", startMHz: 824, endMHz: 894, description: "LTE/CDMA Band 5" },
  { name: "ISM 915", startMHz: 902, endMHz: 928, description: "ISM band - LoRa, Zigbee, Z-Wave" },
  { name: "ADS-B", startMHz: 1085, endMHz: 1095, description: "Aircraft transponder signals" },
  { name: "GPS L1", startMHz: 1570, endMHz: 1580, description: "GPS L1 C/A signal" },
  { name: "Full Sweep", startMHz: 24, endMHz: 1766, description: "Full RTL-SDR range scan" },
];

export function identifySignal(frequencyMHz: number): { label: string; band: string } | null {
  for (const [range, info] of Object.entries(KNOWN_FREQUENCIES)) {
    if (range.includes("-")) {
      const [low, high] = range.split("-").map(Number);
      if (frequencyMHz >= low && frequencyMHz <= high) {
        return info;
      }
    } else {
      const freq = parseFloat(range);
      if (Math.abs(frequencyMHz - freq) < 0.5) {
        return info;
      }
    }
  }
  return null;
}

export async function checkSDRToolsAvailable(): Promise<{
  rtlSdr: boolean;
  rtlPower: boolean;
  rtlFm: boolean;
  rtlTest: boolean;
  dump1090: boolean;
  soapySDR: boolean;
}> {
  const check = async (cmd: string): Promise<boolean> => {
    try {
      await execAsync(`which ${cmd}`);
      return true;
    } catch {
      return false;
    }
  };

  const [rtlSdr, rtlPower, rtlFm, rtlTest, dump1090, soapySDR] = await Promise.all([
    check("rtl_sdr"),
    check("rtl_power"),
    check("rtl_fm"),
    check("rtl_test"),
    check("dump1090"),
    check("SoapySDRUtil"),
  ]);

  return { rtlSdr, rtlPower, rtlFm, rtlTest, dump1090, soapySDR };
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

export function generateRealisticSpectrum(
  startFreqMHz: number,
  endFreqMHz: number,
  noiseFloor: number = -90,
  density: number = 1.0
): SDRSignal[] {
  const signals: SDRSignal[] = [];
  const rangeMHz = endFreqMHz - startFreqMHz;
  const numBins = Math.min(Math.max(Math.floor(rangeMHz * 10 * density), 50), 2000);
  const stepMHz = rangeMHz / numBins;
  const now = Date.now();

  const activeTransmitters: Array<{ freqMHz: number; power: number; bw: number; label: string }> = [];

  if (startFreqMHz <= 108 && endFreqMHz >= 88) {
    const fmStations = [88.1, 89.3, 90.1, 91.5, 92.3, 93.7, 94.9, 95.5, 96.3, 97.1, 97.9, 98.7, 99.5, 100.3, 101.1, 101.9, 102.7, 103.5, 104.3, 105.1, 106.7, 107.5];
    for (const f of fmStations) {
      if (f >= startFreqMHz && f <= endFreqMHz) {
        if (Math.random() > 0.3) {
          activeTransmitters.push({ freqMHz: f, power: -20 - Math.random() * 30, bw: 0.2, label: "FM Broadcast" });
        }
      }
    }
  }

  if (startFreqMHz <= 137 && endFreqMHz >= 118) {
    const airFreqs = [118.0, 118.1, 119.1, 120.5, 121.5, 123.45, 124.0, 125.0, 126.2, 127.85, 128.6, 132.0, 134.1, 135.0];
    for (const f of airFreqs) {
      if (f >= startFreqMHz && f <= endFreqMHz && Math.random() > 0.5) {
        activeTransmitters.push({ freqMHz: f, power: -40 - Math.random() * 25, bw: 0.025, label: "Aviation AM" });
      }
    }
  }

  if (startFreqMHz <= 138 && endFreqMHz >= 137) {
    activeTransmitters.push({ freqMHz: 137.1, power: -55 - Math.random() * 15, bw: 0.04, label: "NOAA-15" });
    activeTransmitters.push({ freqMHz: 137.62, power: -50 - Math.random() * 15, bw: 0.04, label: "NOAA-18" });
    activeTransmitters.push({ freqMHz: 137.9125, power: -52 - Math.random() * 15, bw: 0.04, label: "NOAA-19" });
  }

  if (startFreqMHz <= 163 && endFreqMHz >= 162) {
    const wxFreqs = [162.4, 162.425, 162.45, 162.475, 162.5, 162.525, 162.55];
    for (const f of wxFreqs) {
      if (f >= startFreqMHz && f <= endFreqMHz && Math.random() > 0.4) {
        activeTransmitters.push({ freqMHz: f, power: -30 - Math.random() * 20, bw: 0.015, label: "NOAA WX" });
      }
    }
  }

  if (startFreqMHz <= 148 && endFreqMHz >= 144) {
    const hamFreqs = [144.0, 144.2, 145.05, 145.33, 145.5, 146.52, 146.94, 147.0, 147.36];
    for (const f of hamFreqs) {
      if (f >= startFreqMHz && f <= endFreqMHz && Math.random() > 0.6) {
        activeTransmitters.push({ freqMHz: f, power: -45 - Math.random() * 25, bw: 0.012, label: "2m Ham" });
      }
    }
  }

  if (startFreqMHz <= 435 && endFreqMHz >= 432) {
    activeTransmitters.push({ freqMHz: 433.92, power: -55 - Math.random() * 20, bw: 0.5, label: "ISM 433 / IoT" });
    if (Math.random() > 0.5) activeTransmitters.push({ freqMHz: 433.05, power: -65 - Math.random() * 15, bw: 0.125, label: "LoRa" });
  }

  if (startFreqMHz <= 468 && endFreqMHz >= 462) {
    const frsFreqs = [462.5625, 462.5875, 462.6125, 462.6375, 462.6625, 462.6875, 462.7125];
    for (const f of frsFreqs) {
      if (f >= startFreqMHz && f <= endFreqMHz && Math.random() > 0.5) {
        activeTransmitters.push({ freqMHz: f, power: -50 - Math.random() * 25, bw: 0.0125, label: "FRS/GMRS" });
      }
    }
  }

  if (startFreqMHz <= 928 && endFreqMHz >= 902) {
    activeTransmitters.push({ freqMHz: 915.0, power: -50 - Math.random() * 20, bw: 0.5, label: "ISM 915 / LoRa" });
    if (Math.random() > 0.4) activeTransmitters.push({ freqMHz: 908.42, power: -60 - Math.random() * 15, bw: 0.2, label: "Z-Wave" });
  }

  if (startFreqMHz <= 1095 && endFreqMHz >= 1085) {
    activeTransmitters.push({ freqMHz: 1090.0, power: -35 - Math.random() * 20, bw: 2.0, label: "ADS-B" });
  }

  if (startFreqMHz <= 1580 && endFreqMHz >= 1570) {
    activeTransmitters.push({ freqMHz: 1575.42, power: -60 - Math.random() * 10, bw: 2.0, label: "GPS L1" });
  }

  for (let i = 0; i < numBins; i++) {
    const freqMHz = startFreqMHz + i * stepMHz;
    let power = noiseFloor + (Math.random() - 0.5) * 6;

    for (const tx of activeTransmitters) {
      const dist = Math.abs(freqMHz - tx.freqMHz);
      if (dist < tx.bw * 3) {
        const gaussian = Math.exp(-0.5 * Math.pow(dist / (tx.bw * 0.5), 2));
        const txPower = tx.power + (Math.random() - 0.5) * 3;
        power = 10 * Math.log10(Math.pow(10, power / 10) + Math.pow(10, (txPower * gaussian) / 10));
      }
    }

    const id = identifySignal(freqMHz);
    signals.push({
      frequency: freqMHz * 1e6,
      power: Math.round(power * 10) / 10,
      bandwidth: stepMHz * 1e6,
      modulation: "unknown",
      timestamp: now,
      label: id?.label,
    });
  }

  return signals;
}

export function generateWaterfallFrame(
  startFreqMHz: number,
  endFreqMHz: number,
  numBins: number = 512
): number[] {
  const signals = generateRealisticSpectrum(startFreqMHz, endFreqMHz, -95, numBins / (endFreqMHz - startFreqMHz) / 10);
  return signals.map(s => s.power);
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
      source: "server",
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
        if (!isNaN(power)) {
          const freq = freqLow + (j - 6) * freqStep;
          const freqMHz = freq / 1e6;
          const id = identifySignal(freqMHz);
          signals.push({
            frequency: freq,
            power,
            bandwidth: freqStep,
            modulation: "unknown",
            timestamp: Date.now(),
            label: id?.label,
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
      source: "server",
    };
  } catch (err: any) {
    let errorMsg = err.message || "SDR scan failed.";
    if (errorMsg.includes("Command failed") || errorMsg.includes("rtl_power")) {
      errorMsg = "No USB RTL-SDR device detected. Connect an RTL-SDR dongle via USB to enable hardware scanning.";
    }
    return {
      startFreq: startFreqMHz * 1e6,
      endFreq: endFreqMHz * 1e6,
      startTime,
      endTime: Date.now(),
      signals: [],
      rawOutput: "",
      error: errorMsg,
      source: "server",
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
