import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Maximize2, Minimize2, Crosshair, Search, X, Loader2, Layers } from "lucide-react";
import type { Observation, Device } from "@shared/schema";
import { getSignalColor } from "@/lib/signal-utils";

interface GeoResult {
  display_name: string;
  lat: string;
  lon: string;
}

function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim();

  const decimalMatch = trimmed.match(/^(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)$/);
  if (decimalMatch) {
    const lat = parseFloat(decimalMatch[1]);
    const lng = parseFloat(decimalMatch[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  const dmsPattern = /(\d+)\s*[°]\s*(\d+)\s*[′']\s*([\d.]+)\s*[″"]?\s*([NSns])\s*[,\s]\s*(\d+)\s*[°]\s*(\d+)\s*[′']\s*([\d.]+)\s*[″"]?\s*([EWew])/;
  const dmsMatch = trimmed.match(dmsPattern);
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
    if (dmsMatch[4].toUpperCase() === "S") lat = -lat;
    let lng = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[8].toUpperCase() === "W") lng = -lng;
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  const dmPattern = /(\d+)\s*[°]\s*([\d.]+)\s*[′']?\s*([NSns])\s*[,\s]\s*(\d+)\s*[°]\s*([\d.]+)\s*[′']?\s*([EWew])/;
  const dmMatch = trimmed.match(dmPattern);
  if (dmMatch) {
    let lat = parseInt(dmMatch[1]) + parseFloat(dmMatch[2]) / 60;
    if (dmMatch[3].toUpperCase() === "S") lat = -lat;
    let lng = parseInt(dmMatch[4]) + parseFloat(dmMatch[5]) / 60;
    if (dmMatch[6].toUpperCase() === "W") lng = -lng;
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  const latLngLabel = trimmed.match(/lat\s*[:=]?\s*(-?\d+\.?\d*)\s*[,;]\s*l(?:on|ng)\s*[:=]?\s*(-?\d+\.?\d*)/i);
  if (latLngLabel) {
    const lat = parseFloat(latLngLabel[1]);
    const lng = parseFloat(latLngLabel[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

async function geocodeSearch(query: string): Promise<GeoResult[]> {
  const coords = parseCoordinates(query);
  if (coords) {
    return [{
      display_name: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
      lat: coords.lat.toString(),
      lon: coords.lng.toString(),
    }];
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "en" },
  });
  if (!res.ok) return [];
  return res.json();
}

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
  const heatLayerRef = useRef<any>(null);
  const searchMarkerRef = useRef<any>(null);
  const userLocationMarkerRef = useRef<any>(null);
  const initialFitDoneRef = useRef(false);
  const programmaticMoveRef = useRef(false);
  const userHasNavigatedRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showHeatMap, setShowHeatMap] = useState(true);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const loadLeaflet = async () => {
      const L = await import("leaflet");
      await import("leaflet.heat");
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

      map.on("dragstart", () => {
        if (!programmaticMoveRef.current) {
          userHasNavigatedRef.current = true;
        }
      });

      map.on("zoomstart", () => {
        if (!programmaticMoveRef.current) {
          userHasNavigatedRef.current = true;
        }
      });

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
    const map = mapInstanceRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    const obsWithLocation = observations.filter(o => o.latitude && o.longitude);

    if (showHeatMap && obsWithLocation.length > 0 && (L as any).heatLayer) {
      const heatData = obsWithLocation.map(obs => {
        const intensity = obs.signalStrength ? Math.min(1, Math.max(0.3, (obs.signalStrength + 100) / 60)) : 0.5;
        return [obs.latitude!, obs.longitude!, intensity];
      });

      heatLayerRef.current = (L as any).heatLayer(heatData, {
        radius: 25,
        blur: 20,
        maxZoom: 17,
        max: 1.0,
        minOpacity: 0.4,
        gradient: {
          0.0: "#000033",
          0.2: "#0033cc",
          0.4: "#00d4ff",
          0.6: "#33ff99",
          0.8: "#ffcc00",
          1.0: "#ff3300",
        },
      }).addTo(map);
    }

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

    if (obsWithLocation.length > 0 && !initialFitDoneRef.current && !userHasNavigatedRef.current) {
      const bounds = L.latLngBounds(
        obsWithLocation.map(o => [o.latitude!, o.longitude!])
      );
      programmaticMoveRef.current = true;
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      setTimeout(() => { programmaticMoveRef.current = false; }, 500);
      initialFitDoneRef.current = true;
    }
  }, [observations, devices, selectedDeviceId, onSelectDevice, showHeatMap]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.invalidateSize(), 200);
    }
  }, [fullscreen]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setShowResults(true);
    try {
      const results = await geocodeSearch(searchQuery);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, [searchQuery]);

  const flyToResult = useCallback((result: GeoResult) => {
    if (!mapInstanceRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapInstanceRef.current;
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
    }

    const icon = L.divIcon({
      className: "custom-marker",
      html: `<div style="
        width: 14px; height: 14px;
        background: #ff3366;
        border-radius: 50%;
        border: 3px solid #fff;
        box-shadow: 0 0 16px #ff3366, 0 0 32px rgba(255,51,102,0.4);
        cursor: pointer;
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    searchMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map);
    searchMarkerRef.current.bindPopup(`
      <div style="font-family: monospace; font-size: 11px; color: #ff3366; background: #0a1628; padding: 8px; border-radius: 4px; max-width: 250px;">
        <div style="font-weight: bold; margin-bottom: 4px;">Search Result</div>
        <div style="color: #8899aa; word-wrap: break-word;">${result.display_name}</div>
        <div style="color: #8899aa; margin-top: 4px;">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
      </div>
    `, { className: "dark-popup" }).openPopup();

    userHasNavigatedRef.current = false;
    programmaticMoveRef.current = true;
    map.flyTo([lat, lng], 15, { duration: 1.5 });
    setTimeout(() => {
      programmaticMoveRef.current = false;
      userHasNavigatedRef.current = true;
    }, 2000);
    setShowResults(false);
  }, []);

  const centerOnMyLocation = useCallback(async () => {
    if (!mapInstanceRef.current || !leafletRef.current) return;
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const L = leafletRef.current;
      const map = mapInstanceRef.current;
      const { latitude, longitude } = pos.coords;

      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove();
      }

      const icon = L.divIcon({
        className: "custom-marker",
        html: `<div style="
          width: 16px; height: 16px;
          background: #00d4ff;
          border-radius: 50%;
          border: 3px solid #fff;
          box-shadow: 0 0 16px #00d4ff, 0 0 40px rgba(0,212,255,0.3);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      userLocationMarkerRef.current = L.marker([latitude, longitude], { icon }).addTo(map);
      userLocationMarkerRef.current.bindPopup(`
        <div style="font-family: monospace; font-size: 11px; color: #00d4ff; background: #0a1628; padding: 8px; border-radius: 4px;">
          <div style="font-weight: bold; margin-bottom: 4px;">Your Location</div>
          <div style="color: #8899aa;">${latitude.toFixed(6)}, ${longitude.toFixed(6)}</div>
        </div>
      `, { className: "dark-popup" }).openPopup();

      programmaticMoveRef.current = true;
      map.flyTo([latitude, longitude], 15, { duration: 1.5 });
      setTimeout(() => {
        programmaticMoveRef.current = false;
        userHasNavigatedRef.current = true;
      }, 2000);
    } catch {
    }
    setLocating(false);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    if (searchMarkerRef.current && mapInstanceRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
  }, []);

  return (
    <Card className={`relative overflow-visible ${className}`}>
      <div className="absolute top-2 left-2 right-2 z-[1000] flex items-start gap-2">
        <div className="relative flex-1 max-w-sm">
          <div className="flex gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search location, city, coordinates..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) {
                    setShowResults(false);
                    setSearchResults([]);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSearch();
                }}
                className="pl-8 pr-8 h-8 text-xs bg-background/90 backdrop-blur-sm border-border/50"
                data-testid="input-map-search"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  data-testid="button-map-search-clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="h-8 px-2"
              data-testid="button-map-search-go"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </Button>
          </div>

          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-background/95 backdrop-blur-sm border border-border/50 rounded-md shadow-lg max-h-[200px] overflow-auto" data-testid="map-search-results">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => flyToResult(result)}
                  className="w-full text-left px-3 py-2 text-xs hover-elevate border-b border-border/20 last:border-b-0"
                  data-testid={`map-search-result-${i}`}
                >
                  <p className="truncate">{result.display_name}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {parseFloat(result.lat).toFixed(4)}, {parseFloat(result.lon).toFixed(4)}
                  </p>
                </button>
              ))}
            </div>
          )}

          {showResults && !searching && searchResults.length === 0 && searchQuery.trim() && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-background/95 backdrop-blur-sm border border-border/50 rounded-md shadow-lg p-3">
              <p className="text-xs text-muted-foreground">No results found</p>
            </div>
          )}
        </div>

        <div className="flex gap-1 shrink-0">
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setShowHeatMap(prev => !prev)}
            className={`h-8 w-8 toggle-elevate ${showHeatMap ? "toggle-elevated" : ""}`}
            data-testid="button-toggle-heatmap"
            title={showHeatMap ? "Hide heat map" : "Show heat map"}
          >
            <Layers className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={centerOnMyLocation}
            disabled={locating}
            className="h-8 w-8"
            data-testid="button-map-my-location"
          >
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={onToggleFullscreen}
            className="h-8 w-8"
            data-testid="button-toggle-fullscreen"
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
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
