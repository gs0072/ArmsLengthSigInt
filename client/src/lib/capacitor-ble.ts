import { isCapacitor } from './native-platform';

export interface NativeBLEDevice {
  id: string;
  name: string | null;
  rssi: number;
  manufacturerData: string | null;
  serviceUUIDs: string[];
  localName: string | null;
  txPowerLevel: number | null;
  isConnectable: boolean;
  timestamp: number;
}

export interface BLEScanOptions {
  duration?: number;
  serviceUUIDs?: string[];
  allowDuplicates?: boolean;
}

export interface BLEServiceInfo {
  uuid: string;
  characteristics: BLECharacteristicInfo[];
}

export interface BLECharacteristicInfo {
  uuid: string;
  value: string | null;
  properties: string[];
}

export interface MeshtasticNodeInfo {
  nodeNum: number;
  longName: string;
  shortName: string;
  macAddr: string;
  hwModel: string;
  snr: number;
  lastHeard: number;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  batteryLevel: number | null;
  voltage: number | null;
  channelUtilization: number | null;
  airUtilTx: number | null;
}

export interface FlipperDeviceInfo {
  name: string;
  firmwareVersion: string;
  protocolVersion: number;
  hardwareVersion: string;
}

export interface FlipperSubGHzSignal {
  frequency: number;
  rssi: number;
  protocol: string;
  raw: string;
  timestamp: number;
}

export interface FlipperRFIDTag {
  type: string;
  uid: string;
  data: string;
  timestamp: number;
}

export type BLEScanCallback = (device: NativeBLEDevice) => void;
export type MeshtasticCallback = (node: MeshtasticNodeInfo) => void;

const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
const MESHTASTIC_TORADIO_UUID = 'f75c76d2-129e-4dad-a1dd-7866124401e7';
const MESHTASTIC_FROMRADIO_UUID = '2c55e69e-4993-11ed-b878-0242ac120002';
const MESHTASTIC_FROMNUM_UUID = 'ed9da18c-a800-4f66-a670-aa7547e34453';

const FLIPPER_SERVICE_UUID = '8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000';
const FLIPPER_TX_UUID = '19ed82ae-ed21-4c9d-4145-228e62fe0000';
const FLIPPER_RX_UUID = '19ed82ae-ed21-4c9d-4145-228e61fe0000';
const FLIPPER_OVERFLOW_UUID = '19ed82ae-ed21-4c9d-4145-228e63fe0000';

const RTL_SDR_BLE_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const RTL_SDR_BLE_CHAR_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

export function identifyDeviceType(device: NativeBLEDevice): {
  type: 'meshtastic' | 'flipper' | 'rtl_sdr_ble' | 'generic_ble';
  confidence: number;
} {
  const services = device.serviceUUIDs.map(s => s.toLowerCase());
  const name = (device.name || device.localName || '').toLowerCase();

  if (services.includes(MESHTASTIC_SERVICE_UUID)) {
    return { type: 'meshtastic', confidence: 1.0 };
  }
  if (name.includes('meshtastic') || name.includes('mesh')) {
    return { type: 'meshtastic', confidence: 0.8 };
  }

  if (services.includes(FLIPPER_SERVICE_UUID)) {
    return { type: 'flipper', confidence: 1.0 };
  }
  if (name.includes('flipper')) {
    return { type: 'flipper', confidence: 0.95 };
  }

  if (services.includes(RTL_SDR_BLE_SERVICE_UUID)) {
    return { type: 'rtl_sdr_ble', confidence: 0.7 };
  }

  return { type: 'generic_ble', confidence: 1.0 };
}

class NativeBLEScanner {
  private scanning = false;
  private discoveredDevices = new Map<string, NativeBLEDevice>();
  private scanCallbacks: BLEScanCallback[] = [];
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  get isScanning(): boolean {
    return this.scanning;
  }

  get devices(): NativeBLEDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  onDeviceDiscovered(callback: BLEScanCallback): () => void {
    this.scanCallbacks.push(callback);
    return () => {
      this.scanCallbacks = this.scanCallbacks.filter(cb => cb !== callback);
    };
  }

  async startScan(options: BLEScanOptions = {}): Promise<void> {
    if (!isCapacitor()) {
      throw new Error('Native BLE scanning requires Capacitor (iOS/Android)');
    }

    if (this.scanning) {
      await this.stopScan();
    }

    this.scanning = true;
    this.discoveredDevices.clear();

    try {
      const { BleClient } = await import('@anthropic/capacitor-bluetooth-le' as any).catch(() => {
        return { BleClient: null };
      });

      if (!BleClient) {
        await this.simulateNativeScan(options);
        return;
      }

      await BleClient.initialize();

      await BleClient.requestLEScan(
        {
          services: options.serviceUUIDs || [],
          allowDuplicates: options.allowDuplicates || false,
        },
        (result: any) => {
          const device: NativeBLEDevice = {
            id: result.device.deviceId,
            name: result.device.name || null,
            rssi: result.rssi || -100,
            manufacturerData: result.manufacturerData
              ? this.bufferToHex(result.manufacturerData)
              : null,
            serviceUUIDs: result.uuids || [],
            localName: result.localName || null,
            txPowerLevel: result.txPower || null,
            isConnectable: true,
            timestamp: Date.now(),
          };

          this.discoveredDevices.set(device.id, device);
          this.scanCallbacks.forEach(cb => cb(device));
        }
      );

      if (options.duration) {
        this.scanTimer = setTimeout(() => {
          this.stopScan();
        }, options.duration * 1000);
      }
    } catch (err) {
      this.scanning = false;
      throw err;
    }
  }

  async stopScan(): Promise<void> {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }

    try {
      const { BleClient } = await import('@anthropic/capacitor-bluetooth-le' as any).catch(() => {
        return { BleClient: null };
      });
      if (BleClient) {
        await BleClient.stopLEScan();
      }
    } catch (err) {
    }

    this.scanning = false;
  }

  async connectToDevice(deviceId: string): Promise<void> {
    const { BleClient } = await import('@anthropic/capacitor-bluetooth-le' as any).catch(() => {
      return { BleClient: null };
    });
    if (!BleClient) throw new Error('BLE plugin not available');
    await BleClient.connect(deviceId);
  }

  async disconnectFromDevice(deviceId: string): Promise<void> {
    const { BleClient } = await import('@anthropic/capacitor-bluetooth-le' as any).catch(() => {
      return { BleClient: null };
    });
    if (!BleClient) throw new Error('BLE plugin not available');
    await BleClient.disconnect(deviceId);
  }

  async discoverServices(deviceId: string): Promise<BLEServiceInfo[]> {
    const { BleClient } = await import('@anthropic/capacitor-bluetooth-le' as any).catch(() => {
      return { BleClient: null };
    });
    if (!BleClient) throw new Error('BLE plugin not available');
    const services = await BleClient.getServices(deviceId);
    return services.map((svc: any) => ({
      uuid: svc.uuid,
      characteristics: svc.characteristics.map((ch: any) => ({
        uuid: ch.uuid,
        value: null,
        properties: ch.properties || [],
      })),
    }));
  }

  async readCharacteristic(deviceId: string, serviceUUID: string, charUUID: string): Promise<DataView> {
    const { BleClient } = await import('@anthropic/capacitor-bluetooth-le' as any).catch(() => {
      return { BleClient: null };
    });
    if (!BleClient) throw new Error('BLE plugin not available');
    return await BleClient.read(deviceId, serviceUUID, charUUID);
  }

  async writeCharacteristic(deviceId: string, serviceUUID: string, charUUID: string, data: DataView): Promise<void> {
    const { BleClient } = await import('@anthropic/capacitor-bluetooth-le' as any).catch(() => {
      return { BleClient: null };
    });
    if (!BleClient) throw new Error('BLE plugin not available');
    await BleClient.write(deviceId, serviceUUID, charUUID, data);
  }

  private bufferToHex(buffer: ArrayBuffer | DataView): string {
    const bytes = buffer instanceof DataView
      ? new Uint8Array(buffer.buffer)
      : new Uint8Array(buffer);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async simulateNativeScan(options: BLEScanOptions): Promise<void> {
    console.log('[NativeBLE] BLE plugin not loaded — native scan unavailable in web mode');
    this.scanning = false;
  }

  clearDevices(): void {
    this.discoveredDevices.clear();
  }
}

export const nativeBLE = new NativeBLEScanner();

export {
  MESHTASTIC_SERVICE_UUID,
  MESHTASTIC_TORADIO_UUID,
  MESHTASTIC_FROMRADIO_UUID,
  MESHTASTIC_FROMNUM_UUID,
  FLIPPER_SERVICE_UUID,
  FLIPPER_TX_UUID,
  FLIPPER_RX_UUID,
  FLIPPER_OVERFLOW_UUID,
  RTL_SDR_BLE_SERVICE_UUID,
  RTL_SDR_BLE_CHAR_UUID,
};
