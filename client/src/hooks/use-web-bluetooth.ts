import { useState, useCallback, useRef } from "react";

export interface ScannedBluetoothDevice {
  name: string;
  id: string;
  rssi: number | null;
  services: string[];
}

export function useWebBluetooth() {
  const [isSupported] = useState(() =>
    typeof navigator !== "undefined" && "bluetooth" in navigator
  );
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedBluetoothDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef(new Set<string>());

  const scanForDevices = useCallback(async (): Promise<ScannedBluetoothDevice | null> => {
    if (!isSupported) {
      setError("Web Bluetooth is not supported in this browser");
      return null;
    }

    setIsScanning(true);
    setError(null);

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "battery_service",
          "device_information",
          "heart_rate",
          "generic_access",
        ],
      });

      if (device && !seenIds.current.has(device.id)) {
        seenIds.current.add(device.id);
        const newDevice: ScannedBluetoothDevice = {
          name: device.name || "Unknown BLE Device",
          id: device.id,
          rssi: null,
          services: [],
        };
        setDevices((prev) => [...prev, newDevice]);
        return newDevice;
      }
      return null;
    } catch (err: any) {
      if (err.name !== "NotFoundError" && err.code !== 8) {
        setError(err.message || "Bluetooth scan failed");
      }
      return null;
    } finally {
      setIsScanning(false);
    }
  }, [isSupported]);

  const clearDevices = useCallback(() => {
    setDevices([]);
    seenIds.current.clear();
    setError(null);
  }, []);

  return {
    isSupported,
    isScanning,
    devices,
    error,
    scanForDevices,
    clearDevices,
  };
}
