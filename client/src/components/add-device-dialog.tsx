import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Bluetooth, Wifi, Radio, Antenna, Satellite, CircuitBoard, Thermometer, Radar } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const signalTypes = [
  { value: "bluetooth", label: "Bluetooth", icon: Bluetooth },
  { value: "wifi", label: "Wi-Fi", icon: Wifi },
  { value: "rfid", label: "RFID", icon: CircuitBoard },
  { value: "sdr", label: "SDR", icon: Antenna },
  { value: "lora", label: "LoRa", icon: Radio },
  { value: "meshtastic", label: "Meshtastic", icon: Radio },
  { value: "adsb", label: "ADS-B", icon: Satellite },
  { value: "sensor", label: "Sensor", icon: Thermometer },
] as const;

interface AddDeviceDialogProps {
  trigger?: React.ReactNode;
}

export function AddDeviceDialog({ trigger }: AddDeviceDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [macAddress, setMacAddress] = useState("");
  const [uuid, setUuid] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [signalType, setSignalType] = useState("bluetooth");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const createDevice = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { signalType };
      if (name.trim()) body.name = name.trim();
      if (macAddress.trim()) body.macAddress = macAddress.trim().toUpperCase();
      if (uuid.trim()) body.uuid = uuid.trim();
      if (manufacturer.trim()) body.manufacturer = manufacturer.trim();
      if (model.trim()) body.model = model.trim();
      if (deviceType.trim()) body.deviceType = deviceType.trim();
      if (notes.trim()) body.notes = notes.trim();
      const res = await apiRequest("POST", "/api/devices", body);
      return res.json();
    },
    onSuccess: (device) => {
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({ title: "Device Added", description: `${device.name || "New device"} has been added to your collection.` });
      resetForm();
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setName("");
    setMacAddress("");
    setUuid("");
    setManufacturer("");
    setModel("");
    setDeviceType("");
    setSignalType("bluetooth");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" data-testid="button-add-device">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Device
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Add New Device
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); createDevice.mutate(); }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label className="text-xs">Signal Type</Label>
            <Select value={signalType} onValueChange={setSignalType}>
              <SelectTrigger className="text-xs" data-testid="select-device-signal-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {signalTypes.map(st => (
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

          <div className="space-y-1.5">
            <Label className="text-xs">Device Name</Label>
            <Input
              placeholder="e.g. Unknown BLE Tracker"
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-xs"
              data-testid="input-device-name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">MAC Address</Label>
              <Input
                placeholder="AA:BB:CC:DD:EE:FF"
                value={macAddress}
                onChange={e => setMacAddress(e.target.value)}
                className="text-xs font-mono"
                data-testid="input-device-mac"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">UUID</Label>
              <Input
                placeholder="Optional identifier"
                value={uuid}
                onChange={e => setUuid(e.target.value)}
                className="text-xs font-mono"
                data-testid="input-device-uuid"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Manufacturer</Label>
              <Input
                placeholder="e.g. Apple, Samsung"
                value={manufacturer}
                onChange={e => setManufacturer(e.target.value)}
                className="text-xs"
                data-testid="input-device-manufacturer"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Model</Label>
              <Input
                placeholder="e.g. AirTag, Tile Pro"
                value={model}
                onChange={e => setModel(e.target.value)}
                className="text-xs"
                data-testid="input-device-model"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Device Type</Label>
            <Input
              placeholder="e.g. Tracker, Phone, Beacon, Router"
              value={deviceType}
              onChange={e => setDeviceType(e.target.value)}
              className="text-xs"
              data-testid="input-device-type"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              placeholder="Any additional observations or context..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="text-xs resize-none"
              rows={2}
              data-testid="input-device-notes"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} data-testid="button-cancel-device">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createDevice.isPending} data-testid="button-submit-device">
              {createDevice.isPending ? "Adding..." : "Add Device"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
