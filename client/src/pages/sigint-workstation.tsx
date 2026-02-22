import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Radio, Signal, Play, Square, RotateCcw, Zap, Antenna,
  AlertTriangle, Check, X, Loader2, ChevronDown, ChevronUp,
  Plus, Crosshair, Activity, Bookmark, Volume2, VolumeX, Headphones,
  Brain, Search, History, Eye, Maximize2, Minimize2, Shield,
  ZoomIn, ZoomOut, Target, Wifi, Lock, Unlock, FileText, MonitorSpeaker
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

interface ClassifiedSignal {
  frequency: number;
  frequencyMHz: number;
  power: number;
  bandwidth: number;
  signalName: string;
  signalCategory: string;
  interestLevel: string;
  autoDecoderType: string | null;
  decoderAvailable: boolean;
  modulation: string;
  typicalUse: string;
  legalStatus: string;
}

interface DecodeResult {
  decoded: {
    type: string;
    modulation: string;
    frequency: number;
    bandwidth: number;
    content: string;
    metadata: Record<string, any>;
    confidence: number;
    timestamp: number;
  };
  decoderType: string;
  autoDetected: boolean;
  identifications: any[];
  locationTips: string[];
  signalName: string;
  signalCategory: string;
}

interface SDRAudioStatus {
  active: boolean;
  frequency: number | null;
  mode: string | null;
  gain: string;
  squelch: number;
  pid: number | null;
  error: string | null;
}

interface FreqPreset {
  name: string;
  startMHz: number;
  endMHz: number;
  description: string;
}

interface HistoryEntry {
  id: number;
  frequencyMHz: number;
  decoderType: string;
  signalName: string;
  result: DecodeResult;
  timestamp: number;
  analysis?: string;
  fccLookup?: string;
}

type ConnectionMode = "simulation" | "server";

const INTEREST_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-blue-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

const INTEREST_BG: Record<string, string> = {
  low: "border-muted/30",
  medium: "border-blue-500/30",
  high: "border-orange-500/30",
  critical: "border-red-500/30",
};

const CATEGORY_ICONS: Record<string, string> = {
  Aviation: "✈️",
  Maritime: "🚢",
  Military: "🎖️",
  Satellite: "🛰️",
  Emergency: "🚨",
  "Amateur Radio": "📻",
  Broadcast: "📡",
  ISM: "📶",
  Commercial: "🏢",
  Digital: "💻",
  Weather: "🌤️",
  Navigation: "🧭",
  Cellular: "📱",
  "Land Mobile": "🚗",
  Space: "🚀",
};

function getBandLabel(freqMHz: number): string {
  if (freqMHz < 0.03) return "VLF";
  if (freqMHz < 0.3) return "LF";
  if (freqMHz < 3) return "MF";
  if (freqMHz < 30) return "HF";
  if (freqMHz < 300) return "VHF";
  if (freqMHz < 3000) return "UHF";
  return "SHF";
}

function SpectrumCanvas({
  signals,
  startFreqMHz,
  endFreqMHz,
  height = 300,
  peakHold,
  classifiedSignals,
  selectedFreq,
  onFreqClick,
  onFreqHover,
}: {
  signals: SDRSignal[];
  startFreqMHz: number;
  endFreqMHz: number;
  height?: number;
  peakHold?: SDRSignal[];
  classifiedSignals?: ClassifiedSignal[];
  selectedFreq?: number | null;
  onFreqClick?: (freqMHz: number) => void;
  onFreqHover?: (freqMHz: number | null, power: number | null) => void;
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
    const freqRange = endFreqMHz - startFreqMHz;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "hsl(222, 20%, 6%)";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "hsla(180, 80%, 50%, 0.06)";
    ctx.lineWidth = 0.5;
    for (let db = minPower; db <= maxPower; db += 10) {
      const y = padding.top + plotH - ((db - minPower) / (maxPower - minPower)) * plotH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
    }

    let freqStep = 1;
    if (freqRange > 500) freqStep = 100;
    else if (freqRange > 100) freqStep = 20;
    else if (freqRange > 50) freqStep = 10;
    else if (freqRange > 20) freqStep = 5;
    else if (freqRange > 5) freqStep = 1;
    else if (freqRange > 1) freqStep = 0.25;
    else freqStep = 0.1;

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
      ctx.fillText(freqRange < 5 ? `${f.toFixed(2)}` : `${f}`, x, h - padding.bottom + 12);
    }

    ctx.fillStyle = "hsla(180, 60%, 60%, 0.35)";
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("dBm", 2, padding.top + 10);
    ctx.textAlign = "center";
    ctx.fillText("MHz", w / 2, h - 2);

    if (classifiedSignals && classifiedSignals.length > 0) {
      for (const cs of classifiedSignals) {
        const x = padding.left + ((cs.frequencyMHz - startFreqMHz) / freqRange) * plotW;
        if (x < padding.left || x > w - padding.right) continue;

        const markerColor = cs.interestLevel === "critical" ? "hsla(0, 80%, 55%, 0.3)" :
          cs.interestLevel === "high" ? "hsla(35, 90%, 55%, 0.25)" :
          cs.interestLevel === "medium" ? "hsla(210, 80%, 55%, 0.2)" : "hsla(180, 50%, 50%, 0.1)";

        const bwMHz = cs.bandwidth / 1e6;
        const bwPx = Math.max(4, (bwMHz / freqRange) * plotW);

        ctx.fillStyle = markerColor;
        ctx.fillRect(x - bwPx / 2, padding.top, bwPx, plotH);
      }
    }

    if (peakHold && peakHold.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "hsla(0, 80%, 55%, 0.35)";
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

      if (classifiedSignals && classifiedSignals.length > 0) {
        const labelPositions: Array<{ x: number; y: number; label: string; color: string; interest: string }> = [];
        for (const cs of classifiedSignals) {
          const x = padding.left + ((cs.frequencyMHz - startFreqMHz) / freqRange) * plotW;
          if (x < padding.left || x > w - padding.right) continue;
          const y = padding.top + plotH - ((cs.power - minPower) / (maxPower - minPower)) * plotH;
          const tooClose = labelPositions.some(lp => Math.abs(lp.x - x) < 70);
          if (!tooClose) {
            const color = cs.interestLevel === "critical" ? "hsl(0, 80%, 65%)" :
              cs.interestLevel === "high" ? "hsl(35, 90%, 60%)" :
              cs.interestLevel === "medium" ? "hsl(210, 80%, 65%)" : "hsl(180, 60%, 60%)";
            const icon = CATEGORY_ICONS[cs.signalCategory] || "📡";
            labelPositions.push({ x, y: Math.max(padding.top + 5, y), label: `${icon} ${cs.signalName}`, color, interest: cs.interestLevel });
          }
        }
        for (const lp of labelPositions) {
          ctx.font = "8px 'JetBrains Mono', monospace";
          const textW = ctx.measureText(lp.label).width + 8;
          ctx.fillStyle = "hsla(0, 0%, 0%, 0.8)";
          ctx.fillRect(lp.x - textW / 2, lp.y - 20, textW, 15);
          ctx.strokeStyle = lp.color + "60";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(lp.x - textW / 2, lp.y - 20, textW, 15);
          ctx.fillStyle = lp.color;
          ctx.textAlign = "center";
          ctx.fillText(lp.label, lp.x, lp.y - 9);
        }
      }
    }

    if (selectedFreq !== null && selectedFreq !== undefined) {
      const x = padding.left + ((selectedFreq - startFreqMHz) / freqRange) * plotW;
      if (x >= padding.left && x <= w - padding.right) {
        ctx.strokeStyle = "hsla(280, 80%, 60%, 0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, h - padding.bottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "hsla(280, 80%, 60%, 0.9)";
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`▼ ${selectedFreq.toFixed(3)} MHz`, x, padding.top - 4);
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

      ctx.fillStyle = "hsla(0, 0%, 0%, 0.85)";
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
  }, [signals, startFreqMHz, endFreqMHz, height, hoveredFreq, hoveredPower, peakHold, classifiedSignals, selectedFreq]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
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
      onFreqHover?.(freq, closest?.power ?? null);
    } else {
      setHoveredFreq(null);
      setHoveredPower(null);
      onFreqHover?.(null, null);
    }
  }, [signals, startFreqMHz, endFreqMHz, onFreqHover]);

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
        onMouseLeave={() => { setHoveredFreq(null); setHoveredPower(null); onFreqHover?.(null, null); }}
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
  height = 160,
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
    const freqRange = endFreqMHz - startFreqMHz;

    for (let row = 0; row < maxRows; row++) {
      const frameIdx = history.length - maxRows + row;
      if (frameIdx < 0) continue;
      const frame = history[frameIdx];

      for (let i = 0; i < frame.length; i++) {
        const sig = frame[i];
        const freqMHz = sig.frequency / 1e6;
        const x = padding.left + ((freqMHz - startFreqMHz) / freqRange) * plotW;
        const nextFreqMHz = i < frame.length - 1 ? frame[i + 1].frequency / 1e6 : freqMHz + (freqRange / frame.length);
        const binW = Math.max(1, ((nextFreqMHz - freqMHz) / freqRange) * plotW);
        const normalized = Math.max(0, Math.min(1, (sig.power + 100) / 80));

        let r, g, b;
        if (normalized < 0.25) { r = 0; g = 0; b = Math.floor(normalized * 4 * 180); }
        else if (normalized < 0.5) { const t = (normalized - 0.25) * 4; r = 0; g = Math.floor(t * 255); b = Math.floor(180 - t * 80); }
        else if (normalized < 0.75) { const t = (normalized - 0.5) * 4; r = Math.floor(t * 255); g = 255; b = Math.floor(100 - t * 100); }
        else { const t = (normalized - 0.75) * 4; r = 255; g = Math.floor(255 - t * 155); b = 0; }

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
      <canvas ref={canvasRef} className="w-full rounded-md" style={{ height }} data-testid="canvas-waterfall" />
    </div>
  );
}

export default function SigintWorkstation() {
  const { toast } = useToast();

  const [startFreq, setStartFreq] = useState("88");
  const [endFreq, setEndFreq] = useState("108");
  const [mode, setMode] = useState<ConnectionMode>("simulation");
  const [scanning, setScanning] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [scanHistory, setScanHistory] = useState<SDRSignal[][]>([]);
  const [peakHold, setPeakHold] = useState<SDRSignal[]>([]);
  const [currentSignals, setCurrentSignals] = useState<SDRSignal[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [audioDemodMode, setAudioDemodMode] = useState<string>("wfm");
  const [audioSquelch, setAudioSquelch] = useState(0);
  const autoScanRef = useRef(false);
  const scanTimerRef = useRef<any>(null);

  const [classifiedSignals, setClassifiedSignals] = useState<ClassifiedSignal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<ClassifiedSignal | null>(null);
  const [selectedFreqMHz, setSelectedFreqMHz] = useState<number | null>(null);
  const [manualFreq, setManualFreq] = useState("");
  const [decodeResult, setDecodeResult] = useState<DecodeResult | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [fccText, setFccText] = useState<string | null>(null);
  const [aiIdentifyText, setAiIdentifyText] = useState<string | null>(null);
  const [decodeHistory, setDecodeHistory] = useState<HistoryEntry[]>([]);
  const [historyCounter, setHistoryCounter] = useState(0);
  const [showSetup, setShowSetup] = useState(false);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(true);

  const { data: sdrStatus } = useQuery<{ toolsInstalled: boolean; devicesConnected: number; supportedRange: string }>({
    queryKey: ["/api/sdr/status"],
  });

  const { data: presets = [] } = useQuery<FreqPreset[]>({
    queryKey: ["/api/sdr/presets"],
  });

  const { data: audioStatus, refetch: refetchAudio } = useQuery<SDRAudioStatus>({
    queryKey: ["/api/sdr/audio/status"],
    refetchInterval: 3000,
  });

  const startAudioMutation = useMutation({
    mutationFn: async ({ frequencyHz, demodMode }: { frequencyHz: number; demodMode: string }) => {
      const res = await apiRequest("POST", "/api/sdr/audio/start", { frequencyHz, mode: demodMode, squelch: audioSquelch });
      return res.json();
    },
    onSuccess: (data: SDRAudioStatus) => {
      refetchAudio();
      if (data.error) toast({ title: "Audio Error", description: data.error, variant: "destructive" });
      else toast({ title: "Audio Started", description: `Listening at ${((data.frequency || 0) / 1e6).toFixed(3)} MHz (${(data.mode || "").toUpperCase()})` });
    },
    onError: (err: Error) => toast({ title: "Audio Failed", description: err.message, variant: "destructive" }),
  });

  const stopAudioMutation = useMutation({
    mutationFn: async () => { const res = await apiRequest("POST", "/api/sdr/audio/stop"); return res.json(); },
    onSuccess: () => { refetchAudio(); toast({ title: "Audio Stopped" }); },
  });

  const classifyMutation = useMutation({
    mutationFn: async (signals: SDRSignal[]) => {
      const res = await apiRequest("POST", "/api/sigint/auto-classify", { signals, threshold: -60 });
      return res.json();
    },
    onSuccess: (data: { classified: ClassifiedSignal[]; totalDetected: number }) => {
      setClassifiedSignals(data.classified);
    },
  });

  const autoDecodeMutation = useMutation({
    mutationFn: async (data: { frequency: number; power?: number }) => {
      const res = await apiRequest("POST", "/api/sigint/auto-decode", data);
      return res.json();
    },
    onSuccess: (data: DecodeResult) => {
      setDecodeResult(data);
      setAnalysisText(null);
      setFccText(null);
      setAiIdentifyText(null);
      const entry: HistoryEntry = {
        id: historyCounter + 1,
        frequencyMHz: data.decoded.frequency / 1e6,
        decoderType: data.decoderType,
        signalName: data.signalName,
        result: data,
        timestamp: Date.now(),
      };
      setDecodeHistory(prev => [entry, ...prev].slice(0, 50));
      setHistoryCounter(c => c + 1);
      toast({ title: "Signal Decoded", description: `${data.signalName} - ${(data.decoded.confidence * 100).toFixed(0)}% confidence` });
    },
    onError: () => toast({ title: "Decode Failed", variant: "destructive" }),
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/decoder/analyze", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setAnalysisText(data.analysis);
      toast({ title: "AI Analysis Complete" });
    },
    onError: () => toast({ title: "Analysis Failed", variant: "destructive" }),
  });

  const fccLookupMutation = useMutation({
    mutationFn: async (data: { frequencyMHz: number; signalType?: string; modulation?: string; power?: number }) => {
      const res = await apiRequest("POST", "/api/sigint/fcc-lookup", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setFccText(data.analysis);
      toast({ title: "FCC Lookup Complete" });
    },
    onError: () => toast({ title: "FCC Lookup Failed", variant: "destructive" }),
  });

  const aiIdentifyMutation = useMutation({
    mutationFn: async (data: { frequencyMHz: number; power?: number; bandwidth?: number; modulation?: string }) => {
      const res = await apiRequest("POST", "/api/sigint/ai-identify-unknown", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      setAiIdentifyText(data.analysis);
      toast({ title: "AI Identification Complete" });
    },
    onError: () => toast({ title: "AI Identification Failed", variant: "destructive" }),
  });

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await apiRequest("POST", "/api/sdr/scan", {
        startFreqMHz: parseFloat(startFreq),
        endFreqMHz: parseFloat(endFreq),
        mode,
      });
      const data = await res.json();

      if (data.error && data.signals.length === 0) {
        toast({ title: "Scan Error", description: data.error, variant: "destructive" });
      } else {
        setCurrentSignals(data.signals);
        setScanHistory(prev => [...prev.slice(-50), data.signals]);
        setScanCount(c => c + 1);

        if (data.signals.length > 0) {
          setPeakHold(prev => {
            if (prev.length === 0) return data.signals;
            return data.signals.map((sig: SDRSignal, i: number) => {
              const prevSig = prev[i];
              if (!prevSig) return sig;
              return sig.power > prevSig.power ? sig : prevSig;
            });
          });
          classifyMutation.mutate(data.signals);
        }
      }
    } catch {
      toast({ title: "Scan Failed", variant: "destructive" });
    }
    setScanning(false);
  }, [startFreq, endFreq, mode, toast]);

  const toggleAutoScan = useCallback(() => {
    if (autoScanRef.current) {
      autoScanRef.current = false;
      setAutoScan(false);
      if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null; }
    } else {
      autoScanRef.current = true;
      setAutoScan(true);
      const loop = async () => {
        if (!autoScanRef.current) return;
        await runScan();
        if (autoScanRef.current) scanTimerRef.current = setTimeout(loop, 1500);
      };
      loop();
    }
  }, [runScan]);

  useEffect(() => {
    return () => { autoScanRef.current = false; if (scanTimerRef.current) clearTimeout(scanTimerRef.current); };
  }, []);

  const handleSpectrumClick = useCallback((freqMHz: number) => {
    setSelectedFreqMHz(freqMHz);
    setManualFreq(freqMHz.toFixed(3));

    const closest = classifiedSignals.reduce<ClassifiedSignal | null>((best, cs) => {
      if (!best || Math.abs(cs.frequencyMHz - freqMHz) < Math.abs(best.frequencyMHz - freqMHz)) return cs;
      return best;
    }, null);

    if (closest && Math.abs(closest.frequencyMHz - freqMHz) < 1) {
      setSelectedSignal(closest);
    } else {
      setSelectedSignal(null);
    }

    toast({ title: `${freqMHz.toFixed(3)} MHz selected`, description: closest ? `${closest.signalName} (${closest.signalCategory})` : "Click Decode to analyze" });
  }, [classifiedSignals, toast]);

  const handleTuneAndDecode = useCallback(() => {
    const freq = selectedFreqMHz || parseFloat(manualFreq);
    if (!freq || isNaN(freq)) {
      toast({ title: "No frequency selected", variant: "destructive" });
      return;
    }
    autoDecodeMutation.mutate({ frequency: freq * 1e6, power: selectedSignal?.power });
  }, [selectedFreqMHz, manualFreq, selectedSignal, autoDecodeMutation, toast]);

  const handleListen = useCallback(() => {
    const freq = selectedFreqMHz || parseFloat(manualFreq);
    if (!freq || isNaN(freq)) {
      toast({ title: "No frequency selected", variant: "destructive" });
      return;
    }

    if (audioStatus?.active && audioStatus.frequency === freq * 1e6) {
      stopAudioMutation.mutate();
      return;
    }

    let demod = audioDemodMode;
    if (freq >= 88 && freq <= 108) demod = "wfm";
    else if (freq >= 118 && freq <= 137) demod = "am";
    else if (freq >= 144 && freq <= 148) demod = "fm";
    else if (freq >= 462 && freq <= 468) demod = "fm";
    startAudioMutation.mutate({ frequencyHz: freq * 1e6, demodMode: demod });
  }, [selectedFreqMHz, manualFreq, audioStatus, audioDemodMode, startAudioMutation, stopAudioMutation, toast]);

  const handleManualFreqGo = useCallback(() => {
    const freq = parseFloat(manualFreq);
    if (isNaN(freq) || freq < 0.003 || freq > 6000) {
      toast({ title: "Invalid frequency", variant: "destructive" });
      return;
    }
    setSelectedFreqMHz(freq);
    const closest = classifiedSignals.find(cs => Math.abs(cs.frequencyMHz - freq) < 0.5);
    setSelectedSignal(closest || null);
  }, [manualFreq, classifiedSignals, toast]);

  const handleAiAnalysis = useCallback(() => {
    if (!decodeResult) return;
    analyzeMutation.mutate({
      frequency: decodeResult.decoded.frequency,
      decoderType: decodeResult.decoderType,
      decodedContent: decodeResult.decoded.content,
      signalType: decodeResult.decoded.type,
      modulation: decodeResult.decoded.modulation,
    });
  }, [decodeResult, analyzeMutation]);

  const handleFccLookup = useCallback(() => {
    const freq = selectedFreqMHz || parseFloat(manualFreq);
    if (!freq) return;
    fccLookupMutation.mutate({
      frequencyMHz: freq,
      signalType: selectedSignal?.signalName,
      modulation: selectedSignal?.modulation,
      power: selectedSignal?.power,
    });
  }, [selectedFreqMHz, manualFreq, selectedSignal, fccLookupMutation]);

  const handleAiIdentify = useCallback(() => {
    const freq = selectedFreqMHz || parseFloat(manualFreq);
    if (!freq) return;
    aiIdentifyMutation.mutate({
      frequencyMHz: freq,
      power: selectedSignal?.power,
      bandwidth: selectedSignal?.bandwidth,
      modulation: selectedSignal?.modulation,
    });
  }, [selectedFreqMHz, manualFreq, selectedSignal, aiIdentifyMutation]);

  const createNodeMutation = useMutation({
    mutationFn: async (sig: ClassifiedSignal) => {
      const res = await apiRequest("POST", "/api/devices", {
        name: sig.signalName || `SDR Signal ${sig.frequencyMHz.toFixed(3)} MHz`,
        macAddress: `SDR-${sig.frequencyMHz.toFixed(0)}-${Date.now().toString(36)}`,
        signalType: "sdr",
        rssi: Math.round(sig.power),
        frequency: `${sig.frequencyMHz.toFixed(3)} MHz`,
        notes: `Detected via SDR. ${sig.signalCategory}. ${sig.modulation}. Power: ${sig.power.toFixed(1)} dBm.`,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Node Created" });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
    },
  });

  const applyPreset = (preset: FreqPreset) => {
    setStartFreq(preset.startMHz.toString());
    setEndFreq(preset.endMHz.toString());
    toast({ title: preset.name, description: `${preset.startMHz} - ${preset.endMHz} MHz` });
  };

  const handleZoom = useCallback((direction: "in" | "out") => {
    const start = parseFloat(startFreq) || 88;
    const end = parseFloat(endFreq) || 108;
    const center = (start + end) / 2;
    const range = end - start;
    const factor = direction === "in" ? 0.5 : 2;
    const newRange = Math.max(0.5, Math.min(1742, range * factor));
    const newStart = Math.max(0.003, center - newRange / 2);
    const newEnd = Math.min(6000, center + newRange / 2);
    setStartFreq(newStart.toFixed(1));
    setEndFreq(newEnd.toFixed(1));
  }, [startFreq, endFreq]);

  const confidencePercent = decodeResult ? Math.round(decodeResult.decoded.confidence * 100) : 0;
  const isListening = audioStatus?.active;
  const modeColor = mode === "simulation" ? "hsl(280, 65%, 55%)" : "hsl(142, 76%, 48%)";

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="page-sigint-workstation">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Antenna className="w-5 h-5" style={{ color: "hsl(280, 65%, 55%)" }} />
            {autoScan && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase" data-testid="text-sigint-title">
              SIGINT Workstation
            </h2>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Unified Signal Intelligence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[8px]" style={{ color: modeColor, borderColor: modeColor }} data-testid="badge-mode">
            {mode === "simulation" ? "SIM" : "LIVE"}
          </Badge>
          {scanCount > 0 && <Badge variant="outline" className="text-[8px]" data-testid="badge-scan-count">{scanCount} scans</Badge>}
          {classifiedSignals.length > 0 && (
            <Badge variant="outline" className="text-[8px]" style={{ color: "hsl(35, 90%, 55%)", borderColor: "hsl(35, 90%, 55%)" }} data-testid="badge-signals-count">
              {classifiedSignals.length} signals
            </Badge>
          )}
          {isListening && (
            <Badge variant="outline" className="text-[8px] border-cyan-500/40 text-cyan-400 animate-pulse" data-testid="badge-audio-live">
              LIVE AUDIO
            </Badge>
          )}
          <Button size="icon" variant="ghost" onClick={() => setShowSetup(!showSetup)} data-testid="button-toggle-setup">
            {showSetup ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {showSetup && (
        <div className="p-3 border-b border-border/50 space-y-3 bg-muted/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <MonitorSpeaker className="w-3.5 h-3.5" style={{ color: "hsl(280, 65%, 55%)" }} />
                Connection Mode
              </div>
              <Select value={mode} onValueChange={(v) => setMode(v as ConnectionMode)}>
                <SelectTrigger className="text-xs h-8" data-testid="select-connection-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simulation">Simulation (Demo Data)</SelectItem>
                  <SelectItem value="server">Server-Attached SDR</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[9px] text-muted-foreground">
                {mode === "simulation" ? "Generates realistic RF spectrum for testing. No hardware needed." : "Uses RTL-SDR attached via USB."}
              </p>
            </Card>
            <Card className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Activity className="w-3.5 h-3.5" />
                {mode === "server" ? "Server Status" : "Simulation Info"}
              </div>
              {mode === "server" ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[8px]" style={{
                    color: sdrStatus?.toolsInstalled ? "hsl(142, 76%, 48%)" : undefined,
                    borderColor: sdrStatus?.toolsInstalled ? "hsl(142, 76%, 48%)" : undefined,
                  }}>
                    {sdrStatus?.toolsInstalled ? <Check className="w-2.5 h-2.5 mr-0.5" /> : <X className="w-2.5 h-2.5 mr-0.5" />}
                    RTL-SDR Tools
                  </Badge>
                  <Badge variant="outline" className="text-[8px]">{sdrStatus?.devicesConnected || 0} devices</Badge>
                  {!sdrStatus?.toolsInstalled && (
                    <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-yellow-500" />
                      Install rtl-sdr to enable hardware scanning
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[9px] text-muted-foreground">
                  Realistic RF spectrum with FM, aviation, NOAA, ham, ISM, ADS-B, GPS, and more.
                  Auto-classification identifies signal types. Click any signal to decode.
                </p>
              )}
            </Card>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 p-2 border-b border-border/50 bg-muted/5">
        <div className="flex gap-1.5 items-end flex-1 min-w-0">
          <div className="min-w-[80px] max-w-[110px]">
            <label className="text-[8px] text-muted-foreground mb-0.5 block uppercase tracking-wider">Start MHz</label>
            <Input value={startFreq} onChange={e => setStartFreq(e.target.value)} className="text-xs h-7 font-mono" data-testid="input-start-freq" />
          </div>
          <div className="min-w-[80px] max-w-[110px]">
            <label className="text-[8px] text-muted-foreground mb-0.5 block uppercase tracking-wider">End MHz</label>
            <Input value={endFreq} onChange={e => setEndFreq(e.target.value)} className="text-xs h-7 font-mono" data-testid="input-end-freq" />
          </div>
          <Select onValueChange={(v) => { const p = presets.find(p => p.name === v); if (p) applyPreset(p); }}>
            <SelectTrigger className="text-xs h-7 w-[130px]" data-testid="select-preset">
              <Bookmark className="w-3 h-3 mr-1 shrink-0" />
              <SelectValue placeholder="Presets" />
            </SelectTrigger>
            <SelectContent>
              {presets.map(p => (
                <SelectItem key={p.name} value={p.name}><span className="text-xs">{p.name}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-0.5">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleZoom("in")} data-testid="button-zoom-in">
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleZoom("out")} data-testid="button-zoom-out">
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button onClick={() => runScan()} disabled={scanning || autoScan} size="sm" className="h-7 text-xs" data-testid="button-scan">
            {scanning && !autoScan ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Scanning</> : <><Play className="w-3.5 h-3.5 mr-1" /> Scan</>}
          </Button>
          <Button onClick={toggleAutoScan} variant={autoScan ? "destructive" : "outline"} size="sm" className="h-7 text-xs" data-testid="button-auto-scan">
            {autoScan ? <><Square className="w-3.5 h-3.5 mr-1" /> Stop</> : <><RotateCcw className="w-3.5 h-3.5 mr-1" /> Auto</>}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setPeakHold([]); setScanHistory([]); setCurrentSignals([]); setScanCount(0); setClassifiedSignals([]); }} data-testid="button-clear">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`flex-1 overflow-auto p-3 space-y-2 ${rightPanelExpanded ? "" : ""}`}>
          <SpectrumCanvas
            signals={currentSignals}
            startFreqMHz={parseFloat(startFreq) || 88}
            endFreqMHz={parseFloat(endFreq) || 108}
            height={240}
            peakHold={peakHold}
            classifiedSignals={classifiedSignals}
            selectedFreq={selectedFreqMHz}
            onFreqClick={handleSpectrumClick}
          />

          <WaterfallCanvas
            history={scanHistory}
            startFreqMHz={parseFloat(startFreq) || 88}
            endFreqMHz={parseFloat(endFreq) || 108}
            height={120}
          />

          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/10 border border-border/30">
            <Target className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <Input
              value={manualFreq}
              onChange={e => setManualFreq(e.target.value)}
              placeholder="Frequency MHz"
              className="text-xs h-7 w-28 font-mono"
              data-testid="input-manual-freq"
              onKeyDown={e => { if (e.key === "Enter") handleManualFreqGo(); }}
            />
            <span className="text-[9px] text-muted-foreground">MHz</span>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={handleManualFreqGo} data-testid="button-goto-freq">
              <Crosshair className="w-3 h-3 mr-1" /> Go
            </Button>
            <div className="h-4 w-px bg-border/50" />
            <Select value={audioDemodMode} onValueChange={setAudioDemodMode}>
              <SelectTrigger className="w-20 h-7 text-[10px]" data-testid="select-demod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wfm">WFM</SelectItem>
                <SelectItem value="fm">NFM</SelectItem>
                <SelectItem value="am">AM</SelectItem>
                <SelectItem value="usb">USB</SelectItem>
                <SelectItem value="lsb">LSB</SelectItem>
                <SelectItem value="raw">RAW</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" value={audioSquelch} onChange={e => setAudioSquelch(parseInt(e.target.value) || 0)} min={0} max={500} className="w-16 h-7 text-[10px] font-mono" data-testid="input-squelch" />
            <Button
              size="sm"
              variant={isListening ? "destructive" : "default"}
              className="h-7 text-[10px]"
              onClick={handleListen}
              disabled={startAudioMutation.isPending || stopAudioMutation.isPending}
              data-testid="button-listen"
            >
              {isListening ? <><VolumeX className="w-3 h-3 mr-1" /> Stop</> : <><Headphones className="w-3 h-3 mr-1" /> Listen</>}
            </Button>
            <Button size="sm" className="h-7 text-[10px]" onClick={handleTuneAndDecode} disabled={autoDecodeMutation.isPending} data-testid="button-decode">
              {autoDecodeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Radio className="w-3 h-3 mr-1" />}
              Decode
            </Button>
          </div>

          {isListening && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-cyan-500/10 border border-cyan-500/30 animate-pulse">
              <Volume2 className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-cyan-300 font-mono">
                LIVE: {((audioStatus?.frequency || 0) / 1e6).toFixed(3)} MHz ({(audioStatus?.mode || "").toUpperCase()})
              </span>
              {audioStatus?.error && <span className="text-[10px] text-red-400">{audioStatus.error}</span>}
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Detected Signals ({classifiedSignals.length})
              </span>
            </div>
            <div className="space-y-0.5 max-h-[250px] overflow-auto">
              {classifiedSignals.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground text-[10px]">Run a scan to detect signals</p>
              ) : (
                classifiedSignals.map((cs, i) => {
                  const isSelected = selectedSignal?.frequency === cs.frequency;
                  const isCurrentlyListening = audioStatus?.active && audioStatus.frequency === cs.frequency;
                  const icon = CATEGORY_ICONS[cs.signalCategory] || "📡";
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 p-1.5 rounded-md border cursor-pointer transition-all ${isSelected ? "border-purple-500/50 bg-purple-500/10" : INTEREST_BG[cs.interestLevel] || "border-border/20"} ${isCurrentlyListening ? "ring-1 ring-cyan-500/40" : ""}`}
                      onClick={() => { setSelectedSignal(cs); setSelectedFreqMHz(cs.frequencyMHz); setManualFreq(cs.frequencyMHz.toFixed(3)); }}
                      data-testid={`signal-row-${i}`}
                    >
                      <span className="text-sm shrink-0">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-medium">{cs.frequencyMHz.toFixed(3)} MHz</span>
                          <span className="text-[10px] font-medium truncate">{cs.signalName}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Badge variant="outline" className={`text-[7px] h-3.5 px-1 ${INTEREST_COLORS[cs.interestLevel]}`}>{cs.interestLevel}</Badge>
                          <span className="text-[8px] text-muted-foreground">{cs.modulation}</span>
                          {cs.decoderAvailable && <Badge variant="outline" className="text-[7px] h-3.5 px-1" style={{ color: "hsl(180, 80%, 50%)", borderColor: "hsl(180, 80%, 50%)" }}>Decoder</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] font-mono" style={{
                          color: cs.power > -30 ? "hsl(0, 80%, 55%)" : cs.power > -50 ? "hsl(35, 90%, 55%)" : "hsl(180, 60%, 45%)",
                        }}>{cs.power.toFixed(1)}</span>
                        <div className="flex gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={e => { e.stopPropagation(); setSelectedSignal(cs); setSelectedFreqMHz(cs.frequencyMHz); setManualFreq(cs.frequencyMHz.toFixed(3)); autoDecodeMutation.mutate({ frequency: cs.frequency, power: cs.power }); }} data-testid={`button-decode-signal-${i}`}>
                                <Radio className="w-2.5 h-2.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Auto-decode</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant={isCurrentlyListening ? "default" : "ghost"} className={`h-5 w-5 ${isCurrentlyListening ? "bg-cyan-600 hover:bg-cyan-700" : ""}`} onClick={e => {
                                e.stopPropagation();
                                if (isCurrentlyListening) { stopAudioMutation.mutate(); }
                                else {
                                  let demod = "fm";
                                  if (cs.frequencyMHz >= 88 && cs.frequencyMHz <= 108) demod = "wfm";
                                  else if (cs.frequencyMHz >= 118 && cs.frequencyMHz <= 137) demod = "am";
                                  startAudioMutation.mutate({ frequencyHz: cs.frequency, demodMode: demod });
                                }
                              }} data-testid={`button-listen-signal-${i}`}>
                                {isCurrentlyListening ? <Volume2 className="w-2.5 h-2.5" /> : <Headphones className="w-2.5 h-2.5" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{isCurrentlyListening ? "Stop listening" : "Listen"}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={e => { e.stopPropagation(); createNodeMutation.mutate(cs); }} data-testid={`button-create-node-${i}`}>
                                <Plus className="w-2.5 h-2.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Create node</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className={`border-l border-border/50 flex flex-col overflow-hidden transition-all ${rightPanelExpanded ? "w-[420px]" : "w-10"}`}>
          <div className="flex items-center justify-between p-2 border-b border-border/50 bg-muted/5">
            {rightPanelExpanded && <span className="text-[10px] font-semibold uppercase tracking-wider">Intelligence Panel</span>}
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setRightPanelExpanded(!rightPanelExpanded)} data-testid="button-toggle-panel">
              {rightPanelExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </Button>
          </div>

          {rightPanelExpanded && (
            <Tabs defaultValue="decode" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-2 mt-1 justify-start w-fit">
                <TabsTrigger value="decode" className="text-[10px]" data-testid="tab-intel-decode">
                  <Radio className="w-3 h-3 mr-1" /> Decode
                </TabsTrigger>
                <TabsTrigger value="analysis" className="text-[10px]" data-testid="tab-intel-analysis">
                  <Brain className="w-3 h-3 mr-1" /> AI
                </TabsTrigger>
                <TabsTrigger value="history" className="text-[10px]" data-testid="tab-intel-history">
                  <History className="w-3 h-3 mr-1" /> History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="decode" className="flex-1 overflow-hidden mt-0 p-2">
                <ScrollArea className="h-full">
                  <div className="space-y-3 pb-4">
                    {selectedSignal && (
                      <Card className="p-3 space-y-2 border-purple-500/30">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <Target className="w-3.5 h-3.5 text-purple-400" />
                          Selected Signal
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{CATEGORY_ICONS[selectedSignal.signalCategory] || "📡"}</span>
                            <span className="text-xs font-medium">{selectedSignal.signalName}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[9px]">
                            <div className="p-1.5 rounded bg-muted/10">
                              <span className="text-muted-foreground">Freq:</span>{" "}
                              <span className="font-mono">{selectedSignal.frequencyMHz.toFixed(3)} MHz</span>
                            </div>
                            <div className="p-1.5 rounded bg-muted/10">
                              <span className="text-muted-foreground">Power:</span>{" "}
                              <span className="font-mono">{selectedSignal.power.toFixed(1)} dBm</span>
                            </div>
                            <div className="p-1.5 rounded bg-muted/10">
                              <span className="text-muted-foreground">Mod:</span>{" "}
                              <span className="font-mono">{selectedSignal.modulation}</span>
                            </div>
                            <div className="p-1.5 rounded bg-muted/10">
                              <span className="text-muted-foreground">Band:</span>{" "}
                              <span className="font-mono">{getBandLabel(selectedSignal.frequencyMHz)}</span>
                            </div>
                          </div>
                          {selectedSignal.typicalUse && (
                            <p className="text-[9px] text-muted-foreground">{selectedSignal.typicalUse}</p>
                          )}
                          {selectedSignal.legalStatus && (
                            <div className="flex items-center gap-1 text-[9px]">
                              <Shield className="w-2.5 h-2.5" />
                              <span className="text-muted-foreground">{selectedSignal.legalStatus}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" className="h-6 text-[9px]" onClick={handleTuneAndDecode} disabled={autoDecodeMutation.isPending} data-testid="button-decode-selected">
                            {autoDecodeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Radio className="w-3 h-3 mr-1" />}
                            Decode
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[9px]" onClick={handleListen} disabled={startAudioMutation.isPending} data-testid="button-listen-selected">
                            <Headphones className="w-3 h-3 mr-1" /> Listen
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[9px]" onClick={handleFccLookup} disabled={fccLookupMutation.isPending} data-testid="button-fcc-lookup">
                            {fccLookupMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
                            FCC
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[9px]" onClick={handleAiIdentify} disabled={aiIdentifyMutation.isPending} data-testid="button-ai-identify">
                            {aiIdentifyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Brain className="w-3 h-3 mr-1" />}
                            ID
                          </Button>
                        </div>
                      </Card>
                    )}

                    {!selectedSignal && !decodeResult && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Crosshair className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">Click a signal on the spectrum</p>
                        <p className="text-[10px] mt-1">or enter a frequency to decode</p>
                      </div>
                    )}

                    {decodeResult && (
                      <Card className="p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            <Signal className="w-3.5 h-3.5" style={{ color: "hsl(180, 80%, 50%)" }} />
                            Decoded Output
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[7px] h-3.5">{decodeResult.decoded.type}</Badge>
                            {decodeResult.autoDetected && <Badge variant="outline" className="text-[7px] h-3.5 border-green-500/40 text-green-400">AUTO</Badge>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-muted-foreground">Confidence</span>
                          <Progress value={confidencePercent} className="h-1.5 flex-1" />
                          <span className={`text-[10px] font-mono font-bold ${confidencePercent >= 80 ? "text-green-400" : confidencePercent >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                            {confidencePercent}%
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1 text-[8px]">
                          <div className="p-1 rounded bg-muted/10">
                            <span className="text-muted-foreground">Type:</span> {decodeResult.decoded.type}
                          </div>
                          <div className="p-1 rounded bg-muted/10">
                            <span className="text-muted-foreground">Mod:</span> {decodeResult.decoded.modulation}
                          </div>
                          <div className="p-1 rounded bg-muted/10">
                            <span className="text-muted-foreground">Freq:</span> {(decodeResult.decoded.frequency / 1e6).toFixed(3)} MHz
                          </div>
                          <div className="p-1 rounded bg-muted/10">
                            <span className="text-muted-foreground">Decoder:</span> {decodeResult.decoderType}
                          </div>
                        </div>

                        <div
                          className="p-3 rounded-md bg-muted/20 border border-border/30 font-mono text-[10px] whitespace-pre-wrap max-h-[300px] overflow-auto"
                          style={{ color: "hsl(180, 80%, 65%)" }}
                          data-testid="text-decoded-output"
                        >
                          {decodeResult.decoded.content}
                        </div>

                        {decodeResult.decoded.metadata && Object.keys(decodeResult.decoded.metadata).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(decodeResult.decoded.metadata).map(([key, value]) => (
                              <div key={key} className="p-1 rounded bg-muted/10 border border-border/20 text-[8px]">
                                <span className="text-muted-foreground">{key}:</span> {String(value)}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" className="h-6 text-[9px]" onClick={handleAiAnalysis} disabled={analyzeMutation.isPending} data-testid="button-ai-analyze">
                            {analyzeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Brain className="w-3 h-3 mr-1" />}
                            AI Analysis
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[9px]" onClick={handleFccLookup} disabled={fccLookupMutation.isPending} data-testid="button-fcc-after-decode">
                            {fccLookupMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
                            FCC Lookup
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[9px]" onClick={handleAiIdentify} disabled={aiIdentifyMutation.isPending}>
                            {aiIdentifyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
                            Identify Unknown
                          </Button>
                        </div>

                        <p className="text-[8px] text-muted-foreground">
                          Decoded at {new Date(decodeResult.decoded.timestamp).toLocaleString()}
                        </p>
                      </Card>
                    )}

                    {fccText && (
                      <Card className="p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <Search className="w-3.5 h-3.5 text-blue-400" />
                          FCC / License Lookup
                        </div>
                        <div className="text-[10px] leading-relaxed whitespace-pre-wrap" data-testid="text-fcc-result">
                          {fccText}
                        </div>
                      </Card>
                    )}

                    {aiIdentifyText && (
                      <Card className="p-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <Lock className="w-3.5 h-3.5 text-orange-400" />
                          AI Signal Identification
                        </div>
                        <div className="text-[10px] leading-relaxed whitespace-pre-wrap" data-testid="text-ai-identify-result">
                          {aiIdentifyText}
                        </div>
                      </Card>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="analysis" className="flex-1 overflow-hidden mt-0 p-2">
                <ScrollArea className="h-full">
                  <div className="space-y-3 pb-4">
                    {!analysisText && !aiIdentifyText && !fccText ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No AI analysis yet</p>
                        <p className="text-[10px] mt-1">Decode a signal, then click AI Analysis</p>
                      </div>
                    ) : (
                      <>
                        {analysisText && (
                          <Card className="p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold">
                              <Brain className="w-3.5 h-3.5" style={{ color: "hsl(280, 65%, 55%)" }} />
                              SIGINT Analysis
                            </div>
                            <div className="text-[10px] leading-relaxed whitespace-pre-wrap" data-testid="text-ai-analysis">
                              {analysisText}
                            </div>
                          </Card>
                        )}
                        {fccText && (
                          <Card className="p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold">
                              <Search className="w-3.5 h-3.5 text-blue-400" />
                              FCC / License Analysis
                            </div>
                            <div className="text-[10px] leading-relaxed whitespace-pre-wrap">{fccText}</div>
                          </Card>
                        )}
                        {aiIdentifyText && (
                          <Card className="p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold">
                              <Lock className="w-3.5 h-3.5 text-orange-400" />
                              Unknown Signal ID
                            </div>
                            <div className="text-[10px] leading-relaxed whitespace-pre-wrap">{aiIdentifyText}</div>
                          </Card>
                        )}
                      </>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-hidden mt-0 p-2">
                <ScrollArea className="h-full">
                  <div className="space-y-1.5 pb-4">
                    {decodeHistory.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No decode history</p>
                      </div>
                    ) : (
                      decodeHistory.map(entry => (
                        <Card
                          key={entry.id}
                          className="p-2 cursor-pointer hover:bg-muted/10 transition-colors"
                          onClick={() => {
                            setDecodeResult(entry.result);
                            setSelectedFreqMHz(entry.frequencyMHz);
                            setManualFreq(entry.frequencyMHz.toString());
                            setAnalysisText(entry.analysis || null);
                            setFccText(entry.fccLookup || null);
                          }}
                          data-testid={`history-entry-${entry.id}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono font-medium">{entry.frequencyMHz.toFixed(3)} MHz</span>
                                <Badge variant="outline" className="text-[7px] h-3.5">{entry.decoderType}</Badge>
                                <Badge variant="outline" className="text-[7px] h-3.5">{Math.round(entry.result.decoded.confidence * 100)}%</Badge>
                              </div>
                              <p className="text-[9px] text-muted-foreground truncate mt-0.5">{entry.signalName}</p>
                            </div>
                            <span className="text-[8px] text-muted-foreground shrink-0">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
