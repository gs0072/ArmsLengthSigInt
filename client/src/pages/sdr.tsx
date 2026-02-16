import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Radio, Signal, Play, Square, Pause, RotateCcw, Zap, Wifi, Antenna,
  MonitorSpeaker, Server, Globe, AlertTriangle, Check, X, Loader2,
  ChevronDown, ChevronUp, Download, Plus, Info, Crosshair, Activity,
  Bookmark, Terminal, Link2
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SDRSignal {
  frequency: number;
  power: number;
  bandwidth: number;
  modulation: string;
  timestamp: number;
  label?: string;
}

interface SDRScanResult {
  startFreq: number;
  endFreq: number;
  startTime: number;
  endTime: number;
  signals: SDRSignal[];
  rawOutput: string;
  error: string | null;
  source: string;
}

interface FreqPreset {
  name: string;
  startMHz: number;
  endMHz: number;
  description: string;
}

type ConnectionMode = "simulation" | "server" | "rtl_tcp";

function SpectrumCanvas({
  signals,
  startFreqMHz,
  endFreqMHz,
  height = 300,
  peakHold,
  onFreqClick,
}: {
  signals: SDRSignal[];
  startFreqMHz: number;
  endFreqMHz: number;
  height?: number;
  peakHold?: SDRSignal[];
  onFreqClick?: (freqMHz: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredFreq, setHoveredFreq] = useState<number | null>(null);
  const [hoveredPower, setHoveredPower] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = height;
    const padding = { top: 20, bottom: 35, left: 55, right: 15 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    const minPower = -100;
    const maxPower = -10;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "hsl(222, 20%, 6%)";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "hsla(180, 80%, 50%, 0.08)";
    ctx.lineWidth = 0.5;
    for (let db = minPower; db <= maxPower; db += 10) {
      const y = padding.top + plotH - ((db - minPower) / (maxPower - minPower)) * plotH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    const freqRange = endFreqMHz - startFreqMHz;
    let freqStep = 1;
    if (freqRange > 500) freqStep = 100;
    else if (freqRange > 100) freqStep = 20;
    else if (freqRange > 50) freqStep = 10;
    else if (freqRange > 20) freqStep = 5;
    else if (freqRange > 5) freqStep = 1;
    else freqStep = 0.5;

    for (let f = Math.ceil(startFreqMHz / freqStep) * freqStep; f <= endFreqMHz; f += freqStep) {
      const x = padding.left + ((f - startFreqMHz) / freqRange) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, h - padding.bottom);
      ctx.stroke();
    }

    ctx.fillStyle = "hsla(180, 60%, 60%, 0.5)";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    for (let db = minPower; db <= maxPower; db += 10) {
      const y = padding.top + plotH - ((db - minPower) / (maxPower - minPower)) * plotH;
      ctx.fillText(`${db}`, padding.left - 5, y + 3);
    }

    ctx.textAlign = "center";
    for (let f = Math.ceil(startFreqMHz / freqStep) * freqStep; f <= endFreqMHz; f += freqStep) {
      const x = padding.left + ((f - startFreqMHz) / freqRange) * plotW;
      ctx.fillText(`${f}`, x, h - padding.bottom + 12);
    }

    ctx.fillStyle = "hsla(180, 60%, 60%, 0.35)";
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("dBm", 2, padding.top + 10);
    ctx.textAlign = "center";
    ctx.fillText("MHz", w / 2, h - 2);

    if (peakHold && peakHold.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "hsla(0, 80%, 55%, 0.4)";
      ctx.lineWidth = 1;
      for (let i = 0; i < peakHold.length; i++) {
        const sig = peakHold[i];
        const freqMHz = sig.frequency / 1e6;
        const x = padding.left + ((freqMHz - startFreqMHz) / freqRange) * plotW;
        const y = padding.top + plotH - ((sig.power - minPower) / (maxPower - minPower)) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (signals.length > 0) {
      const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
      gradient.addColorStop(0, "hsla(180, 100%, 60%, 0.6)");
      gradient.addColorStop(0.3, "hsla(180, 90%, 50%, 0.4)");
      gradient.addColorStop(0.7, "hsla(200, 80%, 40%, 0.2)");
      gradient.addColorStop(1, "hsla(220, 70%, 30%, 0.05)");

      ctx.beginPath();
      const baseY = padding.top + plotH;
      ctx.moveTo(padding.left, baseY);

      for (let i = 0; i < signals.length; i++) {
        const sig = signals[i];
        const freqMHz = sig.frequency / 1e6;
        const x = padding.left + ((freqMHz - startFreqMHz) / freqRange) * plotW;
        const y = padding.top + plotH - ((sig.power - minPower) / (maxPower - minPower)) * plotH;
        ctx.lineTo(x, Math.max(padding.top, Math.min(baseY, y)));
      }

      ctx.lineTo(w - padding.right, baseY);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = "hsl(180, 100%, 55%)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "hsla(180, 100%, 60%, 0.5)";
      ctx.shadowBlur = 4;

      for (let i = 0; i < signals.length; i++) {
        const sig = signals[i];
        const freqMHz = sig.frequency / 1e6;
        const x = padding.left + ((freqMHz - startFreqMHz) / freqRange) * plotW;
        const y = padding.top + plotH - ((sig.power - minPower) / (maxPower - minPower)) * plotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      const threshold = -60;
      const peakSignals = signals.filter(s => s.power > threshold && s.label);
      const labelPositions: Array<{ x: number; y: number; label: string }> = [];

      for (const sig of peakSignals) {
        const freqMHz = sig.frequency / 1e6;
        const x = padding.left + ((freqMHz - startFreqMHz) / freqRange) * plotW;
        const y = padding.top + plotH - ((sig.power - minPower) / (maxPower - minPower)) * plotH;
        const tooClose = labelPositions.some(lp => Math.abs(lp.x - x) < 60);
        if (!tooClose && sig.label) {
          labelPositions.push({ x, y, label: sig.label });
        }
      }

      for (const lp of labelPositions) {
        ctx.fillStyle = "hsla(0, 0%, 0%, 0.7)";
        const textW = ctx.measureText(lp.label).width + 6;
        ctx.fillRect(lp.x - textW / 2, lp.y - 18, textW, 14);
        ctx.strokeStyle = "hsla(180, 80%, 50%, 0.4)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(lp.x - textW / 2, lp.y - 18, textW, 14);
        ctx.fillStyle = "hsl(180, 80%, 65%)";
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(lp.label, lp.x, lp.y - 8);
      }
    }

    if (hoveredFreq !== null) {
      const x = padding.left + ((hoveredFreq - startFreqMHz) / freqRange) * plotW;
      ctx.strokeStyle = "hsla(60, 90%, 60%, 0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, h - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "hsla(0, 0%, 0%, 0.8)";
      const label = `${hoveredFreq.toFixed(3)} MHz${hoveredPower !== null ? ` / ${hoveredPower.toFixed(1)} dBm` : ""}`;
      const tw = ctx.measureText(label).width + 10;
      const tx = Math.min(x - tw / 2, w - tw - 5);
      ctx.fillRect(Math.max(5, tx), padding.top + 2, tw, 16);
      ctx.fillStyle = "hsl(60, 90%, 70%)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, Math.max(5, tx) + tw / 2, padding.top + 13);
    }

    ctx.strokeStyle = "hsla(180, 60%, 40%, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(padding.left, padding.top, plotW, plotH);

  }, [signals, startFreqMHz, endFreqMHz, height, hoveredFreq, hoveredPower, peakHold]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = { left: 55, right: 15 };
    const plotW = rect.width - padding.left - padding.right;
    const relX = (x - padding.left) / plotW;
    if (relX >= 0 && relX <= 1) {
      const freq = startFreqMHz + relX * (endFreqMHz - startFreqMHz);
      setHoveredFreq(freq);
      const closest = signals.reduce<SDRSignal | null>((best, sig) => {
        const sigFreq = sig.frequency / 1e6;
        if (!best || Math.abs(sigFreq - freq) < Math.abs(best.frequency / 1e6 - freq)) return sig;
        return best;
      }, null);
      setHoveredPower(closest?.power ?? null);
    } else {
      setHoveredFreq(null);
      setHoveredPower(null);
    }
  }, [signals, startFreqMHz, endFreqMHz]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (hoveredFreq !== null && onFreqClick) {
      onFreqClick(hoveredFreq);
    }
  }, [hoveredFreq, onFreqClick]);

  return (
    <div ref={containerRef} className="w-full relative">
      <canvas
        ref={canvasRef}
        className="w-full cursor-crosshair rounded-md"
        style={{ height }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredFreq(null); setHoveredPower(null); }}
        onClick={handleClick}
        data-testid="canvas-spectrum"
      />
    </div>
  );
}

function WaterfallCanvas({
  history,
  startFreqMHz,
  endFreqMHz,
  height = 200,
}: {
  history: SDRSignal[][];
  startFreqMHz: number;
  endFreqMHz: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = height;
    const padding = { left: 55, right: 15, top: 5, bottom: 5 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    ctx.fillStyle = "hsl(222, 20%, 4%)";
    ctx.fillRect(0, 0, w, h);

    if (history.length === 0) {
      ctx.fillStyle = "hsla(180, 40%, 40%, 0.3)";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("Waterfall display - run a scan to begin", w / 2, h / 2);
      return;
    }

    const maxRows = Math.min(history.length, Math.floor(plotH));
    const rowH = plotH / maxRows;

    for (let row = 0; row < maxRows; row++) {
      const frameIdx = history.length - maxRows + row;
      if (frameIdx < 0) continue;
      const frame = history[frameIdx];
      const freqRange = endFreqMHz - startFreqMHz;

      for (let i = 0; i < frame.length; i++) {
        const sig = frame[i];
        const freqMHz = sig.frequency / 1e6;
        const x = padding.left + ((freqMHz - startFreqMHz) / freqRange) * plotW;
        const nextFreqMHz = i < frame.length - 1 ? frame[i + 1].frequency / 1e6 : freqMHz + (freqRange / frame.length);
        const binW = Math.max(1, ((nextFreqMHz - freqMHz) / freqRange) * plotW);

        const normalized = Math.max(0, Math.min(1, (sig.power + 100) / 80));

        let r, g, b;
        if (normalized < 0.25) {
          r = 0; g = 0; b = Math.floor(normalized * 4 * 180);
        } else if (normalized < 0.5) {
          const t = (normalized - 0.25) * 4;
          r = 0; g = Math.floor(t * 255); b = Math.floor(180 - t * 80);
        } else if (normalized < 0.75) {
          const t = (normalized - 0.5) * 4;
          r = Math.floor(t * 255); g = 255; b = Math.floor(100 - t * 100);
        } else {
          const t = (normalized - 0.75) * 4;
          r = 255; g = Math.floor(255 - t * 155); b = 0;
        }

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, padding.top + row * rowH, binW + 0.5, rowH + 0.5);
      }
    }

    ctx.strokeStyle = "hsla(180, 60%, 40%, 0.3)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(padding.left, padding.top, plotW, plotH);

  }, [history, startFreqMHz, endFreqMHz, height]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full rounded-md"
        style={{ height }}
        data-testid="canvas-waterfall"
      />
    </div>
  );
}

function SignalTable({
  signals,
  onCreateNode,
}: {
  signals: SDRSignal[];
  onCreateNode: (sig: SDRSignal) => void;
}) {
  const strongSignals = signals
    .filter(s => s.power > -65)
    .sort((a, b) => b.power - a.power)
    .slice(0, 50);

  if (strongSignals.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-xs">
        No strong signals detected above -65 dBm threshold
      </div>
    );
  }

  return (
    <div className="space-y-0.5 max-h-[300px] overflow-auto">
      <div className="grid grid-cols-[1fr_80px_80px_1fr_40px] gap-2 text-[9px] text-muted-foreground uppercase tracking-wider font-medium px-2 py-1 sticky top-0 bg-background">
        <span>Frequency</span>
        <span>Power</span>
        <span>Band</span>
        <span>Identification</span>
        <span></span>
      </div>
      {strongSignals.map((sig, i) => {
        const freqMHz = sig.frequency / 1e6;
        const powerColor = sig.power > -30 ? "hsl(0, 80%, 55%)" :
          sig.power > -50 ? "hsl(35, 90%, 55%)" :
          sig.power > -60 ? "hsl(60, 80%, 50%)" : "hsl(180, 60%, 45%)";

        return (
          <div key={i} className="grid grid-cols-[1fr_80px_80px_1fr_40px] gap-2 items-center text-[10px] px-2 py-1.5 rounded-md border border-border/20 bg-muted/5">
            <span className="font-mono font-medium">{freqMHz.toFixed(3)} MHz</span>
            <span className="font-mono" style={{ color: powerColor }}>{sig.power.toFixed(1)} dBm</span>
            <span className="text-muted-foreground">{getBandLabel(freqMHz)}</span>
            <span className="text-muted-foreground truncate">{sig.label || "Unknown"}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onCreateNode(sig)}
                  data-testid={`button-create-node-${i}`}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create node from signal</TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}

function getBandLabel(freqMHz: number): string {
  if (freqMHz < 30) return "HF";
  if (freqMHz < 300) return "VHF";
  if (freqMHz < 3000) return "UHF";
  return "SHF";
}

export default function SDRPage() {
  const { toast } = useToast();
  const [startFreq, setStartFreq] = useState("88");
  const [endFreq, setEndFreq] = useState("108");
  const [mode, setMode] = useState<ConnectionMode>("simulation");
  const [rtlTcpHost, setRtlTcpHost] = useState("");
  const [rtlTcpPort, setRtlTcpPort] = useState("1234");
  const [scanning, setScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [scanHistory, setScanHistory] = useState<SDRSignal[][]>([]);
  const [peakHold, setPeakHold] = useState<SDRSignal[]>([]);
  const [currentSignals, setCurrentSignals] = useState<SDRSignal[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const autoScanRef = useRef(false);
  const scanTimerRef = useRef<any>(null);

  const { data: sdrStatus } = useQuery<{ toolsInstalled: boolean; devicesConnected: number; supportedRange: string }>({
    queryKey: ["/api/sdr/status"],
  });

  const { data: presets = [] } = useQuery<FreqPreset[]>({
    queryKey: ["/api/sdr/presets"],
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sdr/test-connection", {
        host: rtlTcpHost,
        port: parseInt(rtlTcpPort),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.connected) {
        toast({ title: "Connected", description: `rtl_tcp server at ${rtlTcpHost}:${rtlTcpPort} is responding` });
      } else {
        toast({ title: "Connection Failed", description: data.error || "Cannot reach rtl_tcp server", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Test Failed", description: "Connection test error", variant: "destructive" });
    },
  });

  const runScan = useCallback(async () => {
    if (mode === "rtl_tcp") {
      if (!rtlTcpHost.trim()) {
        toast({ title: "Missing Host", description: "Enter your ngrok or public hostname in the rtl_tcp Server section", variant: "destructive" });
        return;
      }
      if (rtlTcpHost.includes("127.0.0.1") || rtlTcpHost.includes("localhost")) {
        toast({ title: "Invalid Host", description: "127.0.0.1 / localhost refers to this cloud server, not your machine. Use ngrok or your public IP.", variant: "destructive" });
        return;
      }
      const portNum = parseInt(rtlTcpPort);
      if (!rtlTcpPort.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
        toast({ title: "Invalid Port", description: "Enter a valid port number (1-65535).", variant: "destructive" });
        return;
      }
    }
    setScanning(true);
    try {
      const res = await apiRequest("POST", "/api/sdr/scan", {
        startFreqMHz: parseFloat(startFreq),
        endFreqMHz: parseFloat(endFreq),
        mode,
        rtlTcpHost: mode === "rtl_tcp" ? rtlTcpHost : undefined,
        rtlTcpPort: mode === "rtl_tcp" ? parseInt(rtlTcpPort) : undefined,
      });
      const data: SDRScanResult = await res.json();

      if (data.error && data.signals.length === 0) {
        toast({ title: "Scan Error", description: data.error, variant: "destructive" });
      } else {
        setCurrentSignals(data.signals);
        setScanHistory(prev => [...prev.slice(-50), data.signals]);
        setScanCount(c => c + 1);

        if (data.signals.length > 0) {
          setPeakHold(prev => {
            if (prev.length === 0) return data.signals;
            return data.signals.map((sig, i) => {
              const prevSig = prev[i];
              if (!prevSig) return sig;
              return sig.power > prevSig.power ? sig : prevSig;
            });
          });
        }

        if (data.error) {
          toast({ title: "Scan Warning", description: data.error, variant: "destructive" });
        }
      }
    } catch {
      toast({ title: "Scan Failed", description: "SDR scan request failed", variant: "destructive" });
    }
    setScanning(false);
  }, [startFreq, endFreq, mode, rtlTcpHost, rtlTcpPort, toast]);

  const toggleAutoScan = useCallback(() => {
    if (autoScanRef.current) {
      autoScanRef.current = false;
      setAutoScan(false);
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }
    } else {
      autoScanRef.current = true;
      setAutoScan(true);
      const loop = async () => {
        if (!autoScanRef.current) return;
        await runScan();
        if (autoScanRef.current) {
          scanTimerRef.current = setTimeout(loop, 1500);
        }
      };
      loop();
    }
  }, [runScan]);

  useEffect(() => {
    return () => {
      autoScanRef.current = false;
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, []);

  const createNodeMutation = useMutation({
    mutationFn: async (sig: SDRSignal) => {
      const freqMHz = sig.frequency / 1e6;
      const res = await apiRequest("POST", "/api/devices", {
        name: sig.label || `SDR Signal ${freqMHz.toFixed(3)} MHz`,
        macAddress: `SDR-${freqMHz.toFixed(0)}-${Date.now().toString(36)}`,
        signalType: "sdr",
        rssi: Math.round(sig.power),
        frequency: `${freqMHz.toFixed(3)} MHz`,
        notes: `Detected via SDR scan at ${freqMHz.toFixed(6)} MHz with power ${sig.power.toFixed(1)} dBm. Band: ${getBandLabel(freqMHz)}. ${sig.label ? `Identified as: ${sig.label}` : "Unidentified signal."}`,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Node Created", description: "Signal added to your node list" });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not create node", variant: "destructive" });
    },
  });

  const applyPreset = (preset: FreqPreset) => {
    setStartFreq(preset.startMHz.toString());
    setEndFreq(preset.endMHz.toString());
    toast({ title: preset.name, description: `${preset.startMHz} - ${preset.endMHz} MHz: ${preset.description}` });
  };

  const modeLabel = mode === "simulation" ? "Simulation" : mode === "server" ? "Server" : "rtl_tcp";
  const modeColor = mode === "simulation" ? "hsl(280, 65%, 55%)" : mode === "server" ? "hsl(142, 76%, 48%)" : "hsl(200, 80%, 55%)";

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="page-sdr">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Antenna className="w-5 h-5" style={{ color: "hsl(280, 65%, 55%)" }} />
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase" data-testid="text-sdr-title">
              SDR Spectrum Analyzer
            </h2>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Software Defined Radio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[8px]" style={{ color: modeColor, borderColor: modeColor }}>
            {modeLabel}
          </Badge>
          {scanCount > 0 && (
            <Badge variant="outline" className="text-[8px]">
              {scanCount} scans
            </Badge>
          )}
          {currentSignals.filter(s => s.power > -65).length > 0 && (
            <Badge variant="outline" className="text-[8px]" style={{ color: "hsl(35, 90%, 55%)", borderColor: "hsl(35, 90%, 55%)" }}>
              {currentSignals.filter(s => s.power > -65).length} signals
            </Badge>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowSetup(!showSetup)}
            data-testid="button-toggle-setup"
          >
            {showSetup ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {showSetup && (
        <div className="p-3 border-b border-border/50 space-y-3 bg-muted/5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Link2 className="w-3.5 h-3.5" style={{ color: "hsl(280, 65%, 55%)" }} />
                Connection Mode
              </div>
              <Select value={mode} onValueChange={(v) => setMode(v as ConnectionMode)}>
                <SelectTrigger className="text-xs h-8" data-testid="select-sdr-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simulation">Simulation (Demo Data)</SelectItem>
                  <SelectItem value="server">Server-Attached SDR</SelectItem>
                  <SelectItem value="rtl_tcp">Remote rtl_tcp</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[9px] text-muted-foreground">
                {mode === "simulation" && "Generates realistic RF spectrum data for testing and demo purposes. No hardware required."}
                {mode === "server" && "Uses an RTL-SDR device attached directly to this server via USB."}
                {mode === "rtl_tcp" && "Connects to a remote rtl_tcp server. Run rtl_tcp on your Mac/PC to stream SDR data."}
              </p>
            </Card>

            {mode === "rtl_tcp" && (
              <Card className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Server className="w-3.5 h-3.5" style={{ color: "hsl(200, 80%, 55%)" }} />
                  rtl_tcp Server
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2 text-[9px] text-muted-foreground">
                  Your RTL-SDR is on your local machine, but this app runs in the cloud. You need a tunnel (like ngrok) so the app can reach your rtl_tcp server. Do NOT use 127.0.0.1 — that points to the cloud server.
                </div>
                <div className="flex gap-2">
                  <Input
                    value={rtlTcpHost}
                    onChange={e => setRtlTcpHost(e.target.value)}
                    placeholder="e.g. 0.tcp.ngrok.io"
                    className="text-xs h-8 font-mono flex-1"
                    data-testid="input-rtltcp-host"
                  />
                  <Input
                    value={rtlTcpPort}
                    onChange={e => setRtlTcpPort(e.target.value)}
                    placeholder="e.g. 12345"
                    className="text-xs h-8 font-mono w-20"
                    data-testid="input-rtltcp-port"
                  />
                </div>
                <p className="text-[8px] text-muted-foreground/70">
                  Host = ngrok hostname (e.g. 0.tcp.ngrok.io). Port = ngrok-assigned port (NOT 1234 — ngrok picks a different port).
                </p>
                <Button
                  onClick={() => {
                    if (!rtlTcpHost.trim()) {
                      toast({ title: "Missing Host", description: "Enter your ngrok or public hostname first", variant: "destructive" });
                      return;
                    }
                    if (rtlTcpHost.includes("127.0.0.1") || rtlTcpHost.includes("localhost")) {
                      toast({ title: "Invalid Host", description: "127.0.0.1 / localhost refers to this cloud server, not your machine. Use ngrok or your public IP.", variant: "destructive" });
                      return;
                    }
                    const portNum = parseInt(rtlTcpPort);
                    if (!rtlTcpPort.trim() || isNaN(portNum) || portNum < 1 || portNum > 65535) {
                      toast({ title: "Invalid Port", description: "Enter a valid port number (1-65535). Check your ngrok output for the assigned port.", variant: "destructive" });
                      return;
                    }
                    testConnectionMutation.mutate();
                  }}
                  disabled={testConnectionMutation.isPending}
                  variant="outline"
                  className="w-full text-xs"
                  data-testid="button-test-rtltcp"
                >
                  {testConnectionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                  Test Connection
                </Button>
              </Card>
            )}

            {mode === "rtl_tcp" && (
              <Card className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Terminal className="w-3.5 h-3.5" style={{ color: "hsl(142, 76%, 48%)" }} />
                  Setup Guide
                </div>
                <div className="text-[10px] text-muted-foreground space-y-2">
                  <div>
                    <p className="font-semibold text-foreground/80 mb-0.5">Step 1: Install RTL-SDR tools</p>
                    <div className="font-mono text-[9px] space-y-0.5 pl-2 border-l border-border">
                      <p className="text-foreground/60">macOS:</p>
                      <p>$ brew install librtlsdr</p>
                      <p className="text-foreground/60 mt-1">Linux:</p>
                      <p>$ sudo apt install rtl-sdr</p>
                      <p className="text-foreground/60 mt-1">Windows:</p>
                      <p>Install Zadig + rtl-sdr drivers</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/80 mb-0.5">Step 2: Plug in your RTL-SDR dongle and start rtl_tcp</p>
                    <div className="font-mono text-[9px] pl-2 border-l border-border">
                      <p>$ rtl_tcp -a 0.0.0.0 -p 1234</p>
                      <p className="text-foreground/60 mt-0.5">You should see "Found 1 device(s)" in the output.</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/80 mb-0.5">Step 3: Make it reachable from the internet</p>
                    <p className="text-foreground/60">This app runs in the cloud, so it needs a way to reach your local machine. Use one of:</p>
                    <div className="font-mono text-[9px] space-y-1 pl-2 border-l border-border mt-1">
                      <div>
                        <p className="text-foreground/70 font-sans font-medium">Option A: ngrok (easiest)</p>
                        <p>$ ngrok tcp 1234</p>
                        <p className="text-foreground/60">ngrok will show a forwarding line like:</p>
                        <p className="text-foreground/80">Forwarding tcp://0.tcp.ngrok.io:12345</p>
                        <p className="text-foreground/60">Enter <strong>0.tcp.ngrok.io</strong> as Host and <strong>12345</strong> as Port above.</p>
                        <p className="text-foreground/60">Important: The port ngrok assigns (12345) is NOT the same as your local port (1234)!</p>
                      </div>
                      <div>
                        <p className="text-foreground/70 font-sans font-medium">Option B: Port forward</p>
                        <p className="text-foreground/60">Forward port 1234 on your router to your local IP, then enter your public IP above.</p>
                      </div>
                      <div>
                        <p className="text-foreground/70 font-sans font-medium">Option C: Tailscale / VPN</p>
                        <p className="text-foreground/60">Use your Tailscale IP as the host if both machines are on the same tailnet.</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded p-1.5 text-[9px]">
                    <p className="text-foreground/70 font-medium">Do NOT use localhost or 127.0.0.1 -- those refer to this cloud server, not your computer.</p>
                  </div>
                </div>
              </Card>
            )}

            {mode === "server" && (
              <Card className="p-3 space-y-2 col-span-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <MonitorSpeaker className="w-3.5 h-3.5" />
                  Server SDR Status
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[8px]" style={{
                    color: sdrStatus?.toolsInstalled ? "hsl(142, 76%, 48%)" : undefined,
                    borderColor: sdrStatus?.toolsInstalled ? "hsl(142, 76%, 48%)" : undefined,
                  }}>
                    {sdrStatus?.toolsInstalled ? <Check className="w-2.5 h-2.5 mr-0.5" /> : <X className="w-2.5 h-2.5 mr-0.5" />}
                    RTL-SDR Tools
                  </Badge>
                  <Badge variant="outline" className="text-[8px]">
                    {sdrStatus?.devicesConnected || 0} devices attached
                  </Badge>
                </div>
                {!sdrStatus?.toolsInstalled && (
                  <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
                    <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                    <span>RTL-SDR tools not found on server. For local device scanning, use rtl_tcp mode with your local machine.</span>
                  </div>
                )}
                {sdrStatus?.devicesConnected === 0 && sdrStatus?.toolsInstalled && (
                  <div className="flex items-start gap-2 text-[10px] text-muted-foreground">
                    <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                    <span>No USB SDR devices detected on server. Connect an RTL-SDR dongle or use rtl_tcp mode for remote devices.</span>
                  </div>
                )}
              </Card>
            )}

            {mode === "simulation" && (
              <Card className="p-3 space-y-2 col-span-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Activity className="w-3.5 h-3.5" style={{ color: "hsl(280, 65%, 55%)" }} />
                  Simulation Mode
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Generates realistic RF spectrum data based on known frequency allocations. Includes FM broadcast stations,
                  aviation communications, weather satellites, amateur radio, ISM band devices, ADS-B, GPS, and more.
                  Signal levels vary realistically between scans. Use this mode to explore the interface and understand signal patterns.
                </p>
                <p className="text-[10px] text-muted-foreground">
                  For real hardware, connect an RTL-SDR device via <strong>rtl_tcp</strong> mode (recommended for Mac/PC) or
                  attach directly to this server.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 p-2 border-b border-border/50 bg-muted/5">
        <div className="flex gap-1.5 items-end flex-1 min-w-0">
          <div className="flex-1 min-w-[80px] max-w-[120px]">
            <label className="text-[8px] text-muted-foreground mb-0.5 block uppercase tracking-wider">Start MHz</label>
            <Input
              value={startFreq}
              onChange={e => setStartFreq(e.target.value)}
              className="text-xs h-8 font-mono"
              data-testid="input-sdr-start-freq"
            />
          </div>
          <div className="flex-1 min-w-[80px] max-w-[120px]">
            <label className="text-[8px] text-muted-foreground mb-0.5 block uppercase tracking-wider">End MHz</label>
            <Input
              value={endFreq}
              onChange={e => setEndFreq(e.target.value)}
              className="text-xs h-8 font-mono"
              data-testid="input-sdr-end-freq"
            />
          </div>
          <Select onValueChange={(v) => {
            const p = presets.find(p => p.name === v);
            if (p) applyPreset(p);
          }}>
            <SelectTrigger className="text-xs h-8 w-[140px]" data-testid="select-preset">
              <Bookmark className="w-3 h-3 mr-1 shrink-0" />
              <SelectValue placeholder="Presets" />
            </SelectTrigger>
            <SelectContent>
              {presets.map(p => (
                <SelectItem key={p.name} value={p.name}>
                  <span className="text-xs">{p.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            onClick={() => runScan()}
            disabled={scanning || autoScan}
            data-testid="button-sdr-scan"
          >
            {scanning && !autoScan ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Scanning...</>
            ) : (
              <><Play className="w-4 h-4 mr-1.5" /> Scan</>
            )}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={toggleAutoScan}
                variant={autoScan ? "destructive" : "outline"}
                data-testid="button-auto-scan"
              >
                {autoScan ? (
                  <><Square className="w-4 h-4 mr-1.5" /> Stop</>
                ) : (
                  <><RotateCcw className="w-4 h-4 mr-1.5" /> Auto</>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {autoScan ? "Stop continuous scanning" : "Start continuous scanning (1.5s interval)"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setPeakHold([]); setScanHistory([]); setCurrentSignals([]); setScanCount(0); }}
                data-testid="button-clear"
              >
                <X className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear all data</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        <SpectrumCanvas
          signals={currentSignals}
          startFreqMHz={parseFloat(startFreq) || 88}
          endFreqMHz={parseFloat(endFreq) || 108}
          height={280}
          peakHold={peakHold}
          onFreqClick={(freq) => {
            toast({ title: `${freq.toFixed(3)} MHz`, description: `Frequency selected. Click the + icon in the signal table to create a node.` });
          }}
        />

        <WaterfallCanvas
          history={scanHistory}
          startFreqMHz={parseFloat(startFreq) || 88}
          endFreqMHz={parseFloat(endFreq) || 108}
          height={160}
        />

        <Tabs defaultValue="signals" className="w-full">
          <TabsList data-testid="sdr-detail-tabs">
            <TabsTrigger value="signals" className="text-xs" data-testid="tab-signals">
              <Signal className="w-3 h-3 mr-1" />
              Detected Signals
            </TabsTrigger>
            <TabsTrigger value="presets" className="text-xs" data-testid="tab-presets">
              <Bookmark className="w-3 h-3 mr-1" />
              Frequency Guide
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="mt-2">
            <Card className="p-3">
              <SignalTable
                signals={currentSignals}
                onCreateNode={(sig) => createNodeMutation.mutate(sig)}
              />
            </Card>
          </TabsContent>

          <TabsContent value="presets" className="mt-2">
            <Card className="p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {presets.map(p => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    className="text-left p-2.5 rounded-md border border-border/30 hover-elevate"
                    data-testid={`button-preset-${p.name.toLowerCase().replace(/[\s/]+/g, "-")}`}
                  >
                    <div className="text-xs font-medium">{p.name}</div>
                    <div className="text-[9px] text-muted-foreground font-mono">
                      {p.startMHz} - {p.endMHz} MHz
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {p.description}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
