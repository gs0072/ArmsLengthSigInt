import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, Layers, Target } from "lucide-react";
import type { Observation, Device } from "@shared/schema";
import { getSignalColor } from "@/lib/signal-utils";

interface MapViewProps {
  observations: Observation[];
  devices: Device[];
  selectedDeviceId?: number | null;
  onSelectDevice?: (id: number) => void;
  className?: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function MapView({
  observations,
  devices,
  selectedDeviceId,
  onSelectDevice,
  className = "",
  fullscreen = false,
  onToggleFullscreen,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const loadLeaflet = async () => {
      const L = await import("leaflet");
      leafletRef.current = L;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      const map = L.map(mapRef.current!, {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapInstanceRef.current = map;

      setTimeout(() => map.invalidateSize(), 100);
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !leafletRef.current) return;

    const L = leafletRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const map = mapInstanceRef.current;

    const obsWithLocation = observations.filter(o => o.latitude && o.longitude);

    obsWithLocation.forEach(obs => {
      const device = devices.find(d => d.id === obs.deviceId);
      const color = getSignalColor(obs.signalType);
      const isSelected = obs.deviceId === selectedDeviceId;

      const icon = L.divIcon({
        className: "custom-marker",
        html: `<div style="
          width: ${isSelected ? 16 : 10}px;
          height: ${isSelected ? 16 : 10}px;
          background: ${color};
          border-radius: 50%;
          border: 2px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.3)'};
          box-shadow: 0 0 ${isSelected ? 12 : 6}px ${color};
          cursor: pointer;
          transition: all 0.2s;
        "></div>`,
        iconSize: [isSelected ? 16 : 10, isSelected ? 16 : 10],
        iconAnchor: [isSelected ? 8 : 5, isSelected ? 8 : 5],
      });

      const marker = L.marker([obs.latitude, obs.longitude], { icon }).addTo(map);

      marker.bindPopup(`
        <div style="font-family: monospace; font-size: 11px; color: #0ff; background: #0a1628; padding: 8px; border-radius: 4px; min-width: 180px;">
          <div style="font-weight: bold; margin-bottom: 4px;">${device?.name || "Unknown Device"}</div>
          <div style="color: #8899aa;">Signal: ${obs.signalType?.toUpperCase()}</div>
          <div style="color: #8899aa;">RSSI: ${obs.signalStrength ?? "N/A"} dBm</div>
          <div style="color: #8899aa;">Lat: ${obs.latitude?.toFixed(6)}</div>
          <div style="color: #8899aa;">Lng: ${obs.longitude?.toFixed(6)}</div>
        </div>
      `, { className: "dark-popup" });

      marker.on("click", () => {
        if (onSelectDevice && obs.deviceId) {
          onSelectDevice(obs.deviceId);
        }
      });

      markersRef.current.push(marker);
    });

    if (obsWithLocation.length > 0) {
      const bounds = L.latLngBounds(
        obsWithLocation.map(o => [o.latitude!, o.longitude!])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [observations, devices, selectedDeviceId, onSelectDevice]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.invalidateSize(), 200);
    }
  }, [fullscreen]);

  return (
    <Card className={`relative overflow-visible ${className}`}>
      <div className="absolute top-2 right-2 z-[1000] flex gap-1">
        <Button
          size="icon"
          variant="secondary"
          onClick={onToggleFullscreen}
          data-testid="button-toggle-fullscreen"
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </Button>
      </div>
      <div
        ref={mapRef}
        className="w-full rounded-md"
        style={{ height: fullscreen ? "calc(100vh - 120px)" : "400px" }}
        data-testid="map-container"
      />
      <style>{`
        .dark-popup .leaflet-popup-content-wrapper {
          background: transparent;
          box-shadow: none;
          padding: 0;
        }
        .dark-popup .leaflet-popup-tip {
          background: #0a1628;
        }
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </Card>
  );
}
