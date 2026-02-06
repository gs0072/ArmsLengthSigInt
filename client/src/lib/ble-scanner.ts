declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: { acceptAllDevices?: boolean; optionalServices?: string[]; filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }> }): Promise<{ name: string | null; id: string }>;
    };
  }
}

export interface BLEDevice {
  name: string | null;
  id: string;
  rssi: number | null;
  serviceUUIDs: string[];
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && navigator.bluetooth !== undefined;
}

export async function scanForBLEDevice(): Promise<BLEDevice | null> {
  if (!isWebBluetoothSupported() || !navigator.bluetooth) return null;

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [],
    });

    return {
      name: device.name || null,
      id: device.id,
      rssi: null,
      serviceUUIDs: [],
    };
  } catch (err: any) {
    if (err.name === "NotFoundError") {
      return null;
    }
    throw err;
  }
}

export async function getCurrentPosition(): Promise<{ lat: number; lng: number; alt: number | null } | null> {
  if (!("geolocation" in navigator)) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          alt: pos.coords.altitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
