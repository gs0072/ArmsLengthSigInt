import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, MapPin, Crosshair } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCurrentPosition } from "@/lib/ble-scanner";
import type { Device } from "@shared/schema";

interface AddObservationDialogProps {
  device: Device;
  trigger?: React.ReactNode;
}

export function AddObservationDialog({ device, trigger }: AddObservationDialogProps) {
  const [open, setOpen] = useState(false);
  const [signalStrength, setSignalStrength] = useState("");
  const [frequency, setFrequency] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [altitude, setAltitude] = useState("");
  const [channel, setChannel] = useState("");
  const [protocol, setProtocol] = useState("");
  const [encryption, setEncryption] = useState("");
  const [rawData, setRawData] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const { toast } = useToast();

  const grabGPS = async () => {
    setGpsLoading(true);
    try {
      const pos = await getCurrentPosition();
      if (pos) {
        setLatitude(pos.lat.toFixed(6));
        setLongitude(pos.lng.toFixed(6));
        if (pos.alt != null) setAltitude(pos.alt.toFixed(1));
        toast({ title: "GPS Acquired", description: `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}` });
      } else {
        toast({ title: "GPS Unavailable", description: "Could not get your location. Check browser permissions.", variant: "destructive" });
      }
    } finally {
      setGpsLoading(false);
    }
  };

  const createObservation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        deviceId: device.id,
        signalType: device.signalType,
      };
      if (signalStrength) body.signalStrength = parseFloat(signalStrength);
      if (frequency) body.frequency = parseFloat(frequency);
      if (latitude) body.latitude = parseFloat(latitude);
      if (longitude) body.longitude = parseFloat(longitude);
      if (altitude) body.altitude = parseFloat(altitude);
      if (channel) body.channel = parseInt(channel);
      if (protocol.trim()) body.protocol = protocol.trim();
      if (encryption.trim()) body.encryption = encryption.trim();
      if (rawData.trim()) body.rawData = rawData.trim();
      const res = await apiRequest("POST", "/api/observations", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/observations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      toast({ title: "Observation Logged", description: `Signal observation recorded for ${device.name || "device"}.` });
      resetForm();
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSignalStrength("");
    setFrequency("");
    setLatitude("");
    setLongitude("");
    setAltitude("");
    setChannel("");
    setProtocol("");
    setEncryption("");
    setRawData("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline" data-testid="button-add-observation">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Log Observation
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Log Observation
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 pb-1">
          <span className="text-xs text-muted-foreground">Device:</span>
          <Badge variant="outline" className="text-[10px]" data-testid="badge-obs-device">
            {device.name || device.macAddress || `Device #${device.id}`}
          </Badge>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); createObservation.mutate(); }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Signal Strength (dBm)</Label>
              <Input
                type="number"
                placeholder="-65"
                value={signalStrength}
                onChange={e => setSignalStrength(e.target.value)}
                className="text-xs font-mono"
                data-testid="input-obs-signal"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Frequency (MHz)</Label>
              <Input
                type="number"
                step="0.001"
                placeholder="2402.0"
                value={frequency}
                onChange={e => setFrequency(e.target.value)}
                className="text-xs font-mono"
                data-testid="input-obs-frequency"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs flex items-center gap-1">
                <MapPin className="w-3 h-3" /> GPS Location
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={grabGPS}
                disabled={gpsLoading}
                data-testid="button-grab-gps"
              >
                <Crosshair className="w-3 h-3 mr-1" />
                {gpsLoading ? "Acquiring..." : "Use My Location"}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Latitude</span>
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="40.7128"
                  value={latitude}
                  onChange={e => setLatitude(e.target.value)}
                  className="text-xs font-mono"
                  data-testid="input-obs-lat"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Longitude</span>
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="-74.0060"
                  value={longitude}
                  onChange={e => setLongitude(e.target.value)}
                  className="text-xs font-mono"
                  data-testid="input-obs-lng"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] text-muted-foreground">Altitude</span>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="10.0"
                  value={altitude}
                  onChange={e => setAltitude(e.target.value)}
                  className="text-xs font-mono"
                  data-testid="input-obs-alt"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Channel</Label>
              <Input
                type="number"
                placeholder="1"
                value={channel}
                onChange={e => setChannel(e.target.value)}
                className="text-xs font-mono"
                data-testid="input-obs-channel"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Protocol</Label>
              <Input
                placeholder="BLE 5.0"
                value={protocol}
                onChange={e => setProtocol(e.target.value)}
                className="text-xs"
                data-testid="input-obs-protocol"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Encryption</Label>
              <Input
                placeholder="AES-128"
                value={encryption}
                onChange={e => setEncryption(e.target.value)}
                className="text-xs"
                data-testid="input-obs-encryption"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Raw Data / Notes</Label>
            <Textarea
              placeholder="Any raw captured data, hex dumps, or additional notes..."
              value={rawData}
              onChange={e => setRawData(e.target.value)}
              className="text-xs font-mono resize-none"
              rows={2}
              data-testid="input-obs-rawdata"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} data-testid="button-cancel-obs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createObservation.isPending} data-testid="button-submit-obs">
              {createObservation.isPending ? "Logging..." : "Log Observation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
