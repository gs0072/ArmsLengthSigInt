import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Bluetooth, Wifi, Radio, Antenna, Satellite, CircuitBoard, Thermometer, Usb, Globe, Cable, Info } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const sensorTypes = [
  { value: "bluetooth", label: "Bluetooth Radio", icon: Bluetooth },
  { value: "wifi", label: "Wi-Fi Adapter", icon: Wifi },
  { value: "rfid", label: "RFID Reader", icon: CircuitBoard },
  { value: "sdr", label: "SDR Receiver", icon: Antenna },
  { value: "lora", label: "LoRa Transceiver", icon: Radio },
  { value: "meshtastic", label: "Meshtastic Node", icon: Radio },
  { value: "adsb", label: "ADS-B Receiver", icon: Satellite },
  { value: "sensor", label: "External Sensor", icon: Thermometer },
] as const;

const connectionMethods = [
  { value: "builtin", label: "Built-in Hardware", icon: Bluetooth },
  { value: "bluetooth", label: "Bluetooth Connection", icon: Bluetooth },
  { value: "usb", label: "USB / Serial", icon: Usb },
  { value: "serial", label: "Serial Port", icon: Cable },
  { value: "network", label: "Network / TCP", icon: Globe },
] as const;

const SENSOR_SETUP_INFO: Record<string, { description: string; hardware: string[]; setup: string[]; connections: string[]; tips?: string }> = {
  bluetooth: {
    description: "Scans for Bluetooth Classic and BLE (Bluetooth Low Energy) devices in range. Detects phones, wearables, headphones, IoT devices, medical devices, and more.",
    hardware: [
      "Built-in Bluetooth adapter (most laptops/phones)",
      "USB Bluetooth 5.0+ dongle (recommended: TP-Link UB500, ASUS USB-BT500)",
      "Long-range: Sena UD100 Class 1 (up to 300m)"
    ],
    setup: [
      "Enable Bluetooth in your OS settings",
      "Download the Bluetooth Collector script from Settings",
      "Run: python3 sigint_bluetooth_collector.py --setup",
      "macOS: Grant Bluetooth permission to Terminal in System Settings > Privacy"
    ],
    connections: ["builtin", "usb", "bluetooth"],
    tips: "BLE scanning can detect devices up to ~100m. For wider coverage, use a Class 1 Bluetooth adapter. On macOS, device addresses appear as UUIDs due to Apple privacy - the collector handles this automatically."
  },
  wifi: {
    description: "Scans for nearby Wi-Fi access points and client devices. Detects routers, IoT devices, smart home equipment, drones, and any WiFi-enabled device broadcasting.",
    hardware: [
      "Built-in Wi-Fi adapter (all laptops/phones)",
      "USB Wi-Fi adapter for extended range (Alfa AWUS036ACH, Alfa AWUS036AXML)",
      "Directional antenna for long-range scanning"
    ],
    setup: [
      "Wi-Fi adapter should be enabled and not connected to a network for best results",
      "Download the WiFi Collector script from Settings",
      "Run: python3 sigint_collector.py --setup",
      "Linux: May need sudo for scanning. Install: sudo apt install wireless-tools iw",
      "macOS: Requires Location Services permission for Terminal"
    ],
    connections: ["builtin", "usb", "network"],
    tips: "For passive monitoring, the built-in adapter works well. For dedicated scanning or monitor mode, use an external USB adapter with chipsets like Realtek RTL8812AU or Mediatek MT7612U."
  },
  rfid: {
    description: "Reads RFID tags and NFC badges. Useful for access control analysis, asset tracking, and proximity card identification.",
    hardware: [
      "Proxmark3 (most versatile - reads LF 125kHz and HF 13.56MHz)",
      "ACR122U NFC Reader (USB, reads HF/NFC tags)",
      "USB RFID readers (HID, EM4100, MIFARE compatible)"
    ],
    setup: [
      "Connect your RFID reader via USB",
      "Install reader drivers (Proxmark3 requires its own client software)",
      "Configure this sensor with USB/Serial connection method",
      "The app will log detected tag IDs as nodes when the sensor is active"
    ],
    connections: ["usb", "serial", "bluetooth"],
    tips: "The Proxmark3 is the gold standard for RFID research - it can read, emulate, and analyze most RFID protocols. For basic NFC reading, the ACR122U is affordable and widely supported."
  },
  sdr: {
    description: "Software Defined Radio receiver for scanning radio frequencies. Monitors FM radio, aviation bands, NOAA weather, amateur radio, ISM bands, ADS-B, GPS signals, and more.",
    hardware: [
      "RTL-SDR Blog V4 dongle (~$30, 24MHz-1.8GHz, best starter SDR)",
      "RTL-SDR Blog V3 dongle (24MHz-1.7GHz, widely supported)",
      "HackRF One (1MHz-6GHz, transmit capable, advanced users)",
      "Airspy R2 / Airspy Mini (high dynamic range, 24MHz-1.8GHz)",
      "Nooelec NESDR SMArt (budget RTL-SDR alternative)"
    ],
    setup: [
      "Plug in your RTL-SDR dongle via USB",
      "Install RTL-SDR drivers: sudo apt install rtl-sdr (Linux) or use Zadig (Windows) or brew install librtlsdr (macOS)",
      "Test with: rtl_test -t (should detect your device)",
      "Open the SDR page and select 'Server-Attached SDR' mode to begin scanning",
      "Use 'Simulation' mode to explore the spectrum analyzer without hardware"
    ],
    connections: ["usb"],
    tips: "The RTL-SDR V4 is the best starter SDR. Connect it via USB and use the app's spectrum analyzer for real-time scanning. Use 'Simulation' mode on the SDR page to explore without hardware. Add an antenna - the included one works, but a discone antenna covers more bands."
  },
  lora: {
    description: "LoRa (Long Range) transceiver for monitoring LoRaWAN IoT sensor networks. Detects environmental sensors, smart agriculture devices, utility meters, and asset trackers.",
    hardware: [
      "Heltec WiFi LoRa 32 V3 (ESP32 + LoRa + OLED display)",
      "LILYGO TTGO T-Beam (ESP32 + LoRa + GPS, great for mobile use)",
      "RAK WisBlock (modular LoRa + sensors)",
      "Dragino LoRa Gateway (LPS8N for network gateway coverage)",
      "SX1262/SX1276 breakout boards with Arduino/Raspberry Pi"
    ],
    setup: [
      "Flash your LoRa device with appropriate firmware (Arduino or MicroPython)",
      "Configure the frequency band for your region (US: 915MHz, EU: 868MHz, AS: 923MHz)",
      "Connect the device via USB/Serial or configure network forwarding",
      "Add this sensor with the appropriate connection method",
      "When activated from the Dashboard, the app monitors for LoRa packet activity"
    ],
    connections: ["usb", "serial", "network"],
    tips: "LoRa can reach 2-15km line-of-sight. The TTGO T-Beam with GPS is ideal for mobile signal mapping. For fixed monitoring, a Dragino gateway covers a wider area. Set the correct frequency for your region to avoid interference."
  },
  meshtastic: {
    description: "Meshtastic mesh networking nodes for off-grid, encrypted communication. Monitors the LoRa mesh network for nearby Meshtastic devices and their positions.",
    hardware: [
      "Heltec V3 with Meshtastic firmware (most popular, affordable)",
      "LILYGO T-Beam with Meshtastic (built-in GPS for position reporting)",
      "RAK WisBlock 4631 Meshtastic kit (modular, solar-ready)",
      "Station G2 (dedicated Meshtastic device with case and antenna)"
    ],
    setup: [
      "Flash Meshtastic firmware to your device using the Meshtastic Web Flasher (flasher.meshtastic.org)",
      "Configure your node using the Meshtastic app (iOS/Android) or web client",
      "Set your region and channel (default: LongFast)",
      "Connect to this app via the SIGINT Tools > Meshtastic page using HTTP connection",
      "Add this sensor with Network/TCP connection pointing to your node's IP"
    ],
    connections: ["usb", "serial", "network", "bluetooth"],
    tips: "Meshtastic uses AES-256 encryption by default. The mesh can relay messages through multiple nodes for extended range. For SIGINT purposes, you can monitor which nodes are visible and their reported positions. Use the LongFast channel for maximum discovery range."
  },
  adsb: {
    description: "ADS-B (Automatic Dependent Surveillance-Broadcast) receiver for tracking aircraft. Receives 1090MHz transponder signals from commercial and private aircraft overhead.",
    hardware: [
      "RTL-SDR Blog V4 with 1090MHz antenna (~$30 total)",
      "FlightAware Pro Stick Plus (optimized 1090MHz SDR with built-in filter)",
      "Nooelec NESDR SMArt + 1090MHz bandpass filter",
      "AirNav RadarBox FlightStick (dedicated ADS-B receiver)"
    ],
    setup: [
      "Connect your SDR dongle with a 1090MHz antenna",
      "Install dump1090: sudo apt install dump1090-mutability (Linux)",
      "Or use the app's built-in SDR page tuned to 1090MHz",
      "Start dump1090: dump1090 --net --interactive",
      "Configure this sensor with Network connection to dump1090's output (port 30003)",
      "Aircraft will appear as nodes with callsign, altitude, and position data"
    ],
    connections: ["usb", "network"],
    tips: "A proper 1090MHz antenna is essential - even a simple DIY quarter-wave antenna dramatically improves reception. Place the antenna as high as possible with clear line-of-sight to the sky. The FlightAware Pro Stick has a built-in bandpass filter that reduces noise. Range of 100-250nm is typical with a good setup."
  },
  sensor: {
    description: "External environmental or specialty sensor. Connects temperature, humidity, barometric, radiation, EMF, or other measurement devices for environmental monitoring alongside signal intelligence.",
    hardware: [
      "BME280/BME680 environmental sensor (temp, humidity, pressure, VOC)",
      "Geiger counter (RadiationD-v1.1, GMC-320)",
      "EMF detector (Trifield TF2, GQ EMF-390)",
      "GPS module (u-blox NEO-6M/NEO-8M for precise positioning)",
      "Software-defined sensors via Raspberry Pi or Arduino"
    ],
    setup: [
      "Connect your sensor via USB, serial, or I2C/SPI to a microcontroller",
      "Configure data output format (the app accepts JSON push via the Collector API)",
      "Use a Raspberry Pi or Arduino as a bridge to read sensor data and push to the app",
      "Add this sensor with the appropriate connection method",
      "Sensor readings will appear alongside signal data for correlation analysis"
    ],
    connections: ["usb", "serial", "network", "bluetooth"],
    tips: "Environmental sensors add context to signal data - correlate temperature/weather changes with signal propagation patterns. A GPS module improves location accuracy for all your collections. For custom sensors, write a simple script that pushes readings to the Collector API endpoint."
  },
};

const RECOMMENDED_CONNECTIONS: Record<string, string[]> = {
  bluetooth: ["builtin", "usb"],
  wifi: ["builtin", "usb"],
  rfid: ["usb", "serial"],
  sdr: ["usb", "network"],
  lora: ["usb", "serial", "network"],
  meshtastic: ["network", "usb", "bluetooth"],
  adsb: ["usb", "network"],
  sensor: ["usb", "serial", "network"],
};

interface AddSensorDialogProps {
  trigger?: React.ReactNode;
}

export function AddSensorDialog({ trigger }: AddSensorDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sensorType, setSensorType] = useState("bluetooth");
  const [connectionMethod, setConnectionMethod] = useState("builtin");
  const [notes, setNotes] = useState("");
  const [showSetupInfo, setShowSetupInfo] = useState(false);
  const { toast } = useToast();

  const createSensor = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        name: name.trim() || `${sensorTypes.find(s => s.value === sensorType)?.label || "Sensor"}`,
        sensorType,
        connectionMethod,
      };
      if (notes.trim()) body.notes = notes.trim();
      const res = await apiRequest("POST", "/api/sensors", body);
      return res.json();
    },
    onSuccess: (sensor) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sensors"] });
      toast({ title: "Sensor Added", description: `${sensor.name} has been configured.` });
      resetForm();
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setSensorType("bluetooth");
    setConnectionMethod("builtin");
    setNotes("");
    setShowSetupInfo(false);
  };

  const handleSensorTypeChange = (value: string) => {
    setSensorType(value);
    const recommended = RECOMMENDED_CONNECTIONS[value];
    if (recommended && recommended.length > 0) {
      setConnectionMethod(recommended[0]);
    }
  };

  const sensorInfo = SENSOR_SETUP_INFO[sensorType];

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" data-testid="button-add-sensor">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Sensor
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Configure Collection Sensor
          </DialogTitle>
        </DialogHeader>
        <p className="text-[10px] text-muted-foreground -mt-1">
          Add a hardware sensor to your collection toolkit. Configure it here, then activate it from the Dashboard.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); createSensor.mutate(); }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label className="text-xs">Sensor Type</Label>
            <Select value={sensorType} onValueChange={handleSensorTypeChange}>
              <SelectTrigger className="text-xs" data-testid="select-sensor-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sensorTypes.map(st => (
                  <SelectItem key={st.value} value={st.value}>
                    <span className="flex items-center gap-2">
                      <st.icon className="w-3 h-3" />
                      {st.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {sensorInfo && (
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground">{sensorInfo.description}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-[10px] w-full justify-start"
                onClick={() => setShowSetupInfo(!showSetupInfo)}
                data-testid="button-toggle-setup-info"
              >
                <Info className="w-3 h-3 mr-1.5" />
                {showSetupInfo ? "Hide" : "Show"} Setup Guide & Recommended Hardware
              </Button>
              {showSetupInfo && (
                <div className="space-y-2.5 p-2.5 rounded-md border border-border/30 bg-muted/5">
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Recommended Hardware</p>
                    {sensorInfo.hardware.map((hw, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-[9px] text-muted-foreground/50 shrink-0 mt-px">-</span>
                        <p className="text-[9px] text-muted-foreground">{hw}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Setup Steps</p>
                    {sensorInfo.setup.map((s, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <Badge variant="outline" className="text-[7px] shrink-0 mt-px">{i + 1}</Badge>
                        <p className="text-[9px] text-muted-foreground">{s}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Recommended Connections</p>
                    <div className="flex gap-1 flex-wrap">
                      {sensorInfo.connections.map(c => {
                        const cm = connectionMethods.find(m => m.value === c);
                        return cm ? (
                          <Badge key={c} variant="outline" className="text-[8px]">
                            {cm.label}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                  {sensorInfo.tips && (
                    <div className="p-2 rounded-md border border-primary/20 bg-primary/5">
                      <p className="text-[9px] text-muted-foreground">
                        <span className="text-primary font-medium">Tip:</span> {sensorInfo.tips}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Sensor Name</Label>
            <Input
              placeholder={`e.g. My ${sensorTypes.find(s => s.value === sensorType)?.label || "Sensor"}`}
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-xs"
              data-testid="input-sensor-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Connection Method</Label>
            <Select value={connectionMethod} onValueChange={setConnectionMethod}>
              <SelectTrigger className="text-xs" data-testid="select-connection-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {connectionMethods.map(cm => {
                  const isRecommended = RECOMMENDED_CONNECTIONS[sensorType]?.includes(cm.value);
                  return (
                    <SelectItem key={cm.value} value={cm.value}>
                      <span className="flex items-center gap-2">
                        <cm.icon className="w-3 h-3" />
                        {cm.label}
                        {isRecommended && <span className="text-[8px] text-primary ml-1">*</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-[9px] text-muted-foreground/60">* = recommended for this sensor type</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              placeholder="Hardware model, serial number, or any setup notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="text-xs resize-none"
              rows={2}
              data-testid="input-sensor-notes"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} data-testid="button-cancel-sensor">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createSensor.isPending} data-testid="button-submit-sensor">
              {createSensor.isPending ? "Adding..." : "Add Sensor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
