import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Bluetooth, Wifi, Radio, Antenna, Satellite, CircuitBoard, Thermometer, Usb, Globe, Cable } from "lucide-react";
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

interface AddSensorDialogProps {
  trigger?: React.ReactNode;
}

export function AddSensorDialog({ trigger }: AddSensorDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sensorType, setSensorType] = useState("bluetooth");
  const [connectionMethod, setConnectionMethod] = useState("builtin");
  const [notes, setNotes] = useState("");
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
  };

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
      <DialogContent className="max-w-md">
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
            <Select value={sensorType} onValueChange={setSensorType}>
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
                {connectionMethods.map(cm => (
                  <SelectItem key={cm.value} value={cm.value}>
                    <span className="flex items-center gap-2">
                      <cm.icon className="w-3 h-3" />
                      {cm.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
