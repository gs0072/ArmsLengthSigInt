import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import {
  Radio, Signal, Activity, Zap, Satellite, Plane, Ship, Antenna,
  Search, Play, Square, Loader2, MapPin, Brain, History, BookOpen,
  Filter, ChevronDown, ChevronUp, Info, AlertTriangle, Check
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DigitalMode {
  name: string;
  modulation: string;
  bandwidth: string;
  description: string;
  decoderType: string;
}

interface FrequencyAllocation {
  startMHz: number;
  endMHz: number;
  name: string;
  category: string;
  description: string;
  modulation: string;
  bandwidth: string;
  typicalUse: string;
  legalStatus: string;
  interestLevel: string;
  decoderAvailable: boolean;
  decoderType: string;
}

interface Identification {
  name: string;
  category: string;
  description: string;
  modulation?: string;
  bandwidth?: string;
  decoderType?: string;
  interestLevel?: string;
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
  identifications: Identification[];
  locationTips: string[];
}

interface AnalyzeResult {
  analysis: string;
  frequency: number;
  identifications: Identification[];
  locationTips: string[];
}

interface IdentifyResult {
  frequency: number;
  identifications: Identification[];
  locationTips: string[];
}

interface HistoryEntry {
  id: number;
  frequencyMHz: number;
  decoderType: string;
  result: DecodeResult;
  timestamp: number;
  analysis?: string;
}

const FREQ_PRESETS = [
  { label: "NOAA Sat", freq: "137.1", icon: Satellite },
  { label: "ISS", freq: "145.8", icon: Satellite },
  { label: "FM Radio", freq: "100.1", icon: Radio },
  { label: "ADS-B", freq: "1090", icon: Plane },
  { label: "Aviation", freq: "121.5", icon: Plane },
  { label: "Marine", freq: "156.8", icon: Ship },
  { label: "APRS", freq: "144.39", icon: Antenna },
  { label: "LoRa", freq: "915", icon: Zap },
];

const INTEREST_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-blue-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

const INTEREST_BG: Record<string, string> = {
  low: "bg-muted/30",
  medium: "bg-blue-500/10",
  high: "bg-orange-500/10",
  critical: "bg-red-500/10",
};

const CATEGORY_COLORS: Record<string, string> = {
  Satellite: "text-purple-400",
  Aviation: "text-sky-400",
  Maritime: "text-teal-400",
  "Amateur Radio": "text-green-400",
  Military: "text-red-400",
  Commercial: "text-yellow-400",
  Emergency: "text-orange-400",
  ISM: "text-indigo-400",
  Broadcasting: "text-pink-400",
};

const CATEGORIES = ["All", "Satellite", "Aviation", "Maritime", "Amateur Radio", "Military", "Commercial", "Emergency", "ISM", "Broadcasting"];

export default function DecoderPage() {
  const { toast } = useToast();
  const [frequencyMHz, setFrequencyMHz] = useState("137.1");
  const [decoderType, setDecoderType] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [decodeResult, setDecodeResult] = useState<DecodeResult | null>(null);
  const [identifyResult, setIdentifyResult] = useState<IdentifyResult | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyCounter, setHistoryCounter] = useState(0);
  const [freqSearch, setFreqSearch] = useState("");
  const [freqCategory, setFreqCategory] = useState("All");
  const [interestFilter, setInterestFilter] = useState("All");

  const { data: modes = [] } = useQuery<DigitalMode[]>({
    queryKey: ["/api/decoder/modes"],
  });

  const { data: frequencies = [] } = useQuery<FrequencyAllocation[]>({
    queryKey: ["/api/decoder/frequencies"],
  });

  const identifyMutation = useMutation({
    mutationFn: async (data: { frequencyMHz: number; latitude?: number; longitude?: number }) => {
      const res = await apiRequest("POST", "/api/decoder/identify", data);
      return res.json();
    },
    onSuccess: (data: IdentifyResult) => {
      setIdentifyResult(data);
      toast({ title: "Frequency Identified", description: `Found ${data.identifications?.length || 0} matches` });
    },
    onError: () => {
      toast({ title: "Identification Failed", variant: "destructive" });
    },
  });

  const decodeMutation = useMutation({
    mutationFn: async (data: { frequency: number; decoderType: string; latitude?: number; longitude?: number }) => {
      const res = await apiRequest("POST", "/api/decoder/decode", data);
      return res.json();
    },
    onSuccess: (data: DecodeResult) => {
      setDecodeResult(data);
      setAnalysisText(null);
      const entry: HistoryEntry = {
        id: historyCounter + 1,
        frequencyMHz: parseFloat(frequencyMHz),
        decoderType,
        result: data,
        timestamp: Date.now(),
      };
      setHistory(prev => [entry, ...prev].slice(0, 50));
      setHistoryCounter(c => c + 1);
      toast({ title: "Signal Decoded", description: `Confidence: ${(data.decoded.confidence * 100).toFixed(0)}%` });
    },
    onError: () => {
      toast({ title: "Decode Failed", variant: "destructive" });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/decoder/analyze", data);
      return res.json();
    },
    onSuccess: (data: AnalyzeResult) => {
      setAnalysisText(data.analysis);
      toast({ title: "Analysis Complete" });
    },
    onError: () => {
      toast({ title: "Analysis Failed", variant: "destructive" });
    },
  });

  const handleIdentify = () => {
    const freq = parseFloat(frequencyMHz);
    if (isNaN(freq) || freq <= 0) {
      toast({ title: "Invalid Frequency", description: "Enter a valid frequency in MHz", variant: "destructive" });
      return;
    }
    const payload: any = { frequencyMHz: freq };
    if (latitude) payload.latitude = parseFloat(latitude);
    if (longitude) payload.longitude = parseFloat(longitude);
    identifyMutation.mutate(payload);
  };

  const handleDecode = () => {
    const freq = parseFloat(frequencyMHz);
    if (isNaN(freq) || freq <= 0) {
      toast({ title: "Invalid Frequency", description: "Enter a valid frequency in MHz", variant: "destructive" });
      return;
    }
    if (!decoderType) {
      toast({ title: "Select Decoder", description: "Choose a decoder type first", variant: "destructive" });
      return;
    }
    const payload: any = { frequency: freq * 1e6, decoderType };
    if (latitude) payload.latitude = parseFloat(latitude);
    if (longitude) payload.longitude = parseFloat(longitude);
    decodeMutation.mutate(payload);
  };

  const handleAnalyze = () => {
    if (!decodeResult) return;
    const payload: any = {
      frequency: decodeResult.decoded.frequency,
      decoderType,
      decodedContent: decodeResult.decoded.content,
      signalType: decodeResult.decoded.type,
      modulation: decodeResult.decoded.modulation,
    };
    if (latitude) payload.latitude = parseFloat(latitude);
    if (longitude) payload.longitude = parseFloat(longitude);
    analyzeMutation.mutate(payload);
  };

  const handleUseLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude.toFixed(6));
          setLongitude(pos.coords.longitude.toFixed(6));
          toast({ title: "Location Acquired" });
        },
        () => {
          toast({ title: "Location Unavailable", variant: "destructive" });
        },
        { enableHighAccuracy: true }
      );
    }
  };

  const loadFromHistory = (entry: HistoryEntry) => {
    setFrequencyMHz(entry.frequencyMHz.toString());
    setDecoderType(entry.decoderType);
    setDecodeResult(entry.result);
    setAnalysisText(entry.analysis || null);
  };

  const loadFrequencyFromAllocation = (alloc: FrequencyAllocation) => {
    const midFreq = ((alloc.startMHz + alloc.endMHz) / 2).toFixed(3);
    setFrequencyMHz(midFreq);
    if (alloc.decoderType) setDecoderType(alloc.decoderType);
    toast({ title: alloc.name, description: `${alloc.startMHz} - ${alloc.endMHz} MHz loaded` });
  };

  const loadModeAsDecoder = (mode: DigitalMode) => {
    setDecoderType(mode.decoderType);
    toast({ title: "Decoder Selected", description: mode.name });
  };

  const confidencePercent = decodeResult ? Math.round(decodeResult.decoded.confidence * 100) : 0;
  const confidenceColor = confidencePercent >= 80 ? "text-green-400" : confidencePercent >= 50 ? "text-yellow-400" : "text-red-400";

  const filteredFrequencies = frequencies.filter(f => {
    if (freqCategory !== "All" && f.category !== freqCategory) return false;
    if (interestFilter !== "All" && f.interestLevel !== interestFilter) return false;
    if (freqSearch) {
      const q = freqSearch.toLowerCase();
      return (
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.modulation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="decoder-page">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5" style={{ color: "hsl(180, 80%, 50%)" }} />
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase" data-testid="text-decoder-title">
              Signal Decoder
            </h2>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Digital Signal Intelligence Workbench
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {history.length > 0 && (
            <Badge variant="outline" className="text-[8px]">
              {history.length} decoded
            </Badge>
          )}
          {decodeResult && (
            <Badge variant="outline" className="text-[8px]" style={{ color: "hsl(180, 80%, 50%)", borderColor: "hsl(180, 80%, 50%)" }}>
              {confidencePercent}% confidence
            </Badge>
          )}
          <Badge variant="outline" className="text-[8px]">
            {modes.length} modes
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="decode" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 justify-start w-fit">
          <TabsTrigger value="decode" data-testid="tab-decode">
            <Radio className="w-3 h-3 mr-1" />
            Decode
          </TabsTrigger>
          <TabsTrigger value="frequencies" data-testid="tab-frequencies">
            <Signal className="w-3 h-3 mr-1" />
            Frequencies
          </TabsTrigger>
          <TabsTrigger value="modes" data-testid="tab-modes">
            <BookOpen className="w-3 h-3 mr-1" />
            Modes
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="w-3 h-3 mr-1" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="decode" className="flex-1 overflow-hidden mt-0 p-3">
          <ScrollArea className="h-full">
            <div className="space-y-4 pb-4">
              <Card className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                  <Antenna className="w-4 h-4" style={{ color: "hsl(180, 80%, 50%)" }} />
                  Frequency Selection
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="text"
                      value={frequencyMHz}
                      onChange={e => setFrequencyMHz(e.target.value)}
                      placeholder="Enter frequency in MHz"
                      className="font-mono"
                      data-testid="input-frequency"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">MHz</span>
                  <Button
                    onClick={handleIdentify}
                    disabled={identifyMutation.isPending}
                    variant="outline"
                    data-testid="button-identify"
                  >
                    {identifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
                    Identify
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {FREQ_PRESETS.map(p => {
                    const Icon = p.icon;
                    return (
                      <Button
                        key={p.freq}
                        size="sm"
                        variant={frequencyMHz === p.freq ? "default" : "outline"}
                        onClick={() => setFrequencyMHz(p.freq)}
                        data-testid={`button-preset-${p.freq}`}
                      >
                        <Icon className="w-3 h-3 mr-1" />
                        {p.label}
                      </Button>
                    );
                  })}
                </div>

                {identifyResult && identifyResult.identifications && identifyResult.identifications.length > 0 && (
                  <div className="space-y-1.5 p-3 rounded-md bg-muted/20 border border-border/30">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Identified on {identifyResult.frequency} MHz
                    </p>
                    {identifyResult.identifications.map((id, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Check className="w-3 h-3 mt-0.5 text-green-400 shrink-0" />
                        <div>
                          <span className="font-medium">{id.name}</span>
                          <span className="text-muted-foreground"> - {id.description}</span>
                          {id.category && (
                            <Badge variant="outline" className="ml-1.5 text-[8px]">{id.category}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                    {identifyResult.locationTips && identifyResult.locationTips.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-border/20">
                        {identifyResult.locationTips.map((tip, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Info className="w-2.5 h-2.5 shrink-0" />
                            {tip}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              <Card className="p-4 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                  <Activity className="w-4 h-4" style={{ color: "hsl(280, 65%, 55%)" }} />
                  Decoder Configuration
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Decoder Type</label>
                    <Select value={decoderType} onValueChange={setDecoderType}>
                      <SelectTrigger data-testid="select-decoder-type">
                        <SelectValue placeholder="Select decoder..." />
                      </SelectTrigger>
                      <SelectContent>
                        {modes.map(m => (
                          <SelectItem key={m.decoderType} value={m.decoderType}>
                            {m.name} ({m.modulation})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Location (optional)</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={latitude}
                        onChange={e => setLatitude(e.target.value)}
                        placeholder="Latitude"
                        className="font-mono text-xs"
                        data-testid="input-latitude"
                      />
                      <Input
                        type="text"
                        value={longitude}
                        onChange={e => setLongitude(e.target.value)}
                        placeholder="Longitude"
                        className="font-mono text-xs"
                        data-testid="input-longitude"
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={handleUseLocation}
                            data-testid="button-use-location"
                          >
                            <MapPin className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Use My Location</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleDecode}
                    disabled={decodeMutation.isPending}
                    data-testid="button-decode"
                  >
                    {decodeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                    Decode Signal
                  </Button>
                  {decodeResult && (
                    <Button
                      onClick={handleAnalyze}
                      disabled={analyzeMutation.isPending}
                      variant="outline"
                      data-testid="button-analyze"
                    >
                      {analyzeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Brain className="w-4 h-4 mr-1" />}
                      AI Analysis
                    </Button>
                  )}
                </div>
              </Card>

              {decodeResult && (
                <Card className="p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                      <Signal className="w-4 h-4" style={{ color: "hsl(180, 80%, 50%)" }} />
                      Decoded Output
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[8px]">
                        {decodeResult.decoded.type}
                      </Badge>
                      <Badge variant="outline" className="text-[8px]">
                        {decodeResult.decoded.modulation}
                      </Badge>
                      <Badge variant="outline" className="text-[8px]">
                        {(decodeResult.decoded.frequency / 1e6).toFixed(3)} MHz
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase">Confidence</span>
                      <span className={`text-xs font-mono font-bold ${confidenceColor}`}>
                        {confidencePercent}%
                      </span>
                    </div>
                    <Progress value={confidencePercent} className="h-2" />
                  </div>

                  <div
                    className="p-4 rounded-md bg-muted/20 border border-border/30 font-mono text-sm whitespace-pre-wrap"
                    style={{ color: "hsl(180, 80%, 65%)" }}
                    data-testid="text-decoded-output"
                  >
                    {decodeResult.decoded.content}
                  </div>

                  {decodeResult.decoded.metadata && Object.keys(decodeResult.decoded.metadata).length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {Object.entries(decodeResult.decoded.metadata).map(([key, value]) => (
                        <div key={key} className="p-2 rounded-md bg-muted/10 border border-border/20">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{key}</p>
                          <p className="text-xs font-mono">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {decodeResult.identifications && decodeResult.identifications.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Signal Identifications</p>
                      {decodeResult.identifications.map((id, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <Check className="w-3 h-3 text-green-400 shrink-0" />
                          <span className="font-medium">{id.name}</span>
                          <span className="text-muted-foreground">{id.description}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {decodeResult.locationTips && decodeResult.locationTips.length > 0 && (
                    <div className="space-y-1">
                      {decodeResult.locationTips.map((tip, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          {tip}
                        </p>
                      ))}
                    </div>
                  )}

                  <p className="text-[9px] text-muted-foreground">
                    Decoded at {new Date(decodeResult.decoded.timestamp).toLocaleString()}
                  </p>
                </Card>
              )}

              {analysisText && (
                <Card className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                    <Brain className="w-4 h-4" style={{ color: "hsl(280, 65%, 55%)" }} />
                    AI Signal Analysis
                  </div>
                  <div
                    className="text-sm leading-relaxed whitespace-pre-wrap"
                    data-testid="text-ai-analysis"
                  >
                    {analysisText}
                  </div>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="frequencies" className="flex-1 overflow-hidden mt-0 p-3">
          <div className="flex flex-col h-full gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  value={freqSearch}
                  onChange={e => setFreqSearch(e.target.value)}
                  placeholder="Search frequencies..."
                  className="pl-7 text-xs"
                  data-testid="input-freq-search"
                />
              </div>
              <Select value={freqCategory} onValueChange={setFreqCategory}>
                <SelectTrigger className="w-[160px]" data-testid="select-freq-category">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={interestFilter} onValueChange={setInterestFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-interest-filter">
                  <SelectValue placeholder="Interest..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Interest</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="text-[8px]">
                {filteredFrequencies.length} allocations
              </Badge>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-1.5">
                {filteredFrequencies.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-md bg-muted/10 border border-border/20 cursor-pointer hover-elevate active-elevate-2"
                    onClick={() => loadFrequencyFromAllocation(f)}
                    data-testid={`row-freq-${i}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-medium">
                          {f.startMHz} - {f.endMHz} MHz
                        </span>
                        <span className="text-xs font-medium truncate">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="outline" className={`text-[8px] ${CATEGORY_COLORS[f.category] || "text-muted-foreground"}`}>
                          {f.category}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{f.modulation}</span>
                        {f.bandwidth && (
                          <span className="text-[10px] text-muted-foreground">{f.bandwidth}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {f.decoderAvailable && (
                        <Badge variant="outline" className="text-[8px]" style={{ color: "hsl(180, 80%, 50%)", borderColor: "hsl(180, 80%, 50%)" }}>
                          Decoder
                        </Badge>
                      )}
                      <div className={`w-2 h-2 rounded-full ${
                        f.interestLevel === "critical" ? "bg-red-500" :
                        f.interestLevel === "high" ? "bg-orange-500" :
                        f.interestLevel === "medium" ? "bg-blue-500" : "bg-muted-foreground"
                      }`} />
                      <span className={`text-[9px] uppercase ${INTEREST_COLORS[f.interestLevel] || "text-muted-foreground"}`}>
                        {f.interestLevel}
                      </span>
                    </div>
                  </div>
                ))}
                {filteredFrequencies.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    No frequency allocations match your filters
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="modes" className="flex-1 overflow-hidden mt-0 p-3">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
              {modes.map((m, i) => (
                <Card
                  key={i}
                  className={`p-4 cursor-pointer ${decoderType === m.decoderType ? "ring-1 ring-primary" : "hover-elevate"}`}
                  onClick={() => loadModeAsDecoder(m)}
                  data-testid={`card-mode-${i}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{m.name}</p>
                      {decoderType === m.decoderType && (
                        <Check className="w-4 h-4 text-green-400 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[8px]">{m.modulation}</Badge>
                      <Badge variant="outline" className="text-[8px]">{m.bandwidth}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{m.description}</p>
                    <p className="text-[9px] font-mono text-muted-foreground">decoder: {m.decoderType}</p>
                  </div>
                </Card>
              ))}
              {modes.length === 0 && (
                <div className="col-span-full text-center py-8 text-muted-foreground text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading digital modes...
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="flex-1 overflow-hidden mt-0 p-3">
          <ScrollArea className="h-full">
            <div className="space-y-2 pb-4">
              {history.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-xs">
                  <History className="w-8 h-8 mx-auto mb-3 opacity-30" />
                  <p>No decode history yet</p>
                  <p className="text-[10px] mt-1">Decoded signals will appear here</p>
                </div>
              )}
              {history.map(entry => (
                <Card
                  key={entry.id}
                  className="p-3 cursor-pointer hover-elevate"
                  onClick={() => loadFromHistory(entry)}
                  data-testid={`card-history-${entry.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium">
                          {entry.frequencyMHz} MHz
                        </span>
                        <Badge variant="outline" className="text-[8px]">{entry.decoderType}</Badge>
                        <Badge variant="outline" className="text-[8px]">
                          {Math.round(entry.result.decoded.confidence * 100)}%
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5 font-mono">
                        {entry.result.decoded.content.substring(0, 100)}
                      </p>
                    </div>
                    <p className="text-[9px] text-muted-foreground shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
