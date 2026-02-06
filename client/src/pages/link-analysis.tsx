import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Scan, ZoomIn, ZoomOut, RotateCcw, Link2, Radio, ExternalLink, Trash2, Square, Loader2 } from "lucide-react";
import type { Device, DeviceAssociation, Observation } from "@shared/schema";
import { getSignalColor } from "@/lib/signal-utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

function hslToAlpha(hslColor: string, alpha: number): string {
  const match = hslColor.match(/hsl\(([^)]+)\)/);
  if (match) return `hsla(${match[1]}, ${alpha})`;
  return hslColor;
}

const ASSOC_TYPE_LABELS: Record<string, string> = {
  co_movement: "GEOINT Co-Move",
  signal_correlation: "SIGINT Corr",
  command_control: "C2",
  network_peer: "Net Peer",
  proximity_pattern: "GEOINT Prox",
  frequency_sharing: "MASINT Sig",
  temporal_correlation: "SIGINT Temporal",
  geoint_triangulation: "GEOINT Tri-Fix",
  manual: "Manual",
};

const ASSOC_TYPE_COLORS: Record<string, string> = {
  co_movement: "#e87830",
  signal_correlation: "#9945e8",
  command_control: "#e84040",
  network_peer: "#33cc66",
  proximity_pattern: "#e8c830",
  frequency_sharing: "#00d4ff",
  temporal_correlation: "#4488ee",
  geoint_triangulation: "#e8a020",
  manual: "#778899",
};

const ASSOC_DISCIPLINE: Record<string, string> = {
  co_movement: "GEOINT",
  signal_correlation: "SIGINT",
  command_control: "SIGINT",
  network_peer: "SIGINT",
  proximity_pattern: "GEOINT",
  frequency_sharing: "MASINT",
  temporal_correlation: "SIGINT",
  geoint_triangulation: "GEOINT",
  manual: "MULTI-INT",
};

interface GraphNode {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  device: Device;
  radius: number;
  pinned: boolean;
}

interface GraphEdge {
  source: number;
  target: number;
  association: DeviceAssociation;
}

function getNodeRadius(device: Device, associations: DeviceAssociation[]): number {
  const connCount = associations.filter(
    a => a.deviceId1 === device.id || a.deviceId2 === device.id
  ).length;
  return Math.min(28, Math.max(14, 14 + connCount * 3));
}

export default function LinkAnalysisPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const dragRef = useRef<{ node: GraphNode | null; offsetX: number; offsetY: number }>({ node: null, offsetX: 0, offsetY: 0 });
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const selectedNodeRef = useRef<GraphNode | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedNode, setSelectedNode] = useState<Device | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<DeviceAssociation | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: devices = [] } = useQuery<Device[]>({ queryKey: ["/api/devices"] });
  const { data: associations = [] } = useQuery<DeviceAssociation[]>({ queryKey: ["/api/associations"] });
  const { data: observations = [] } = useQuery<Observation[]>({ queryKey: ["/api/observations"] });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setIsAnalyzing(true);
      abortControllerRef.current = new AbortController();
      const res = await fetch("/api/associations/analyze", {
        method: "POST",
        credentials: "include",
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) throw new Error("Analysis failed");
      return res.json();
    },
    onSuccess: (data: any) => {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["/api/associations"] });
      toast({ title: "Analysis Complete", description: `Found ${data.newAssociations} new associations across ${data.analyzed} nodes.` });
    },
    onError: (err: any) => {
      setIsAnalyzing(false);
      abortControllerRef.current = null;
      if (err.name === "AbortError") {
        toast({ title: "Analysis Stopped", description: "The analysis was cancelled." });
      }
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/associations/all");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/associations"] });
      setSelectedNode(null);
      selectedNodeRef.current = null;
      toast({ title: "Associations Cleared", description: `Removed ${data.deleted} associations.` });
    },
  });

  const stopAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const initGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const connectedIds = new Set<number>();
    associations.forEach(a => {
      connectedIds.add(a.deviceId1);
      connectedIds.add(a.deviceId2);
    });

    const relevantDevices = devices.filter(d => connectedIds.has(d.id));

    if (relevantDevices.length === 0 && devices.length > 0) {
      const subset = devices.slice(0, Math.min(20, devices.length));
      relevantDevices.push(...subset);
    }

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    nodesRef.current = relevantDevices.map((device, i) => {
      const angle = (2 * Math.PI * i) / relevantDevices.length;
      const spread = Math.min(canvas.width, canvas.height) * 0.3;
      return {
        id: device.id,
        x: cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 50,
        y: cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        device,
        radius: getNodeRadius(device, associations),
        pinned: false,
      };
    });

    edgesRef.current = associations
      .filter(a => nodesRef.current.some(n => n.id === a.deviceId1) && nodesRef.current.some(n => n.id === a.deviceId2))
      .map(a => ({ source: a.deviceId1, target: a.deviceId2, association: a }));

    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
  }, [devices, associations]);

  useEffect(() => {
    initGraph();
  }, [initGraph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    if (containerRef.current) observer.observe(containerRef.current);

    const simulate = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      for (const node of nodes) {
        if (node.pinned) continue;

        const cx = w / 2 - panRef.current.x;
        const cy = h / 2 - panRef.current.y;
        const dx = cx - node.x;
        const dy = cy - node.y;
        node.vx += dx * 0.0003;
        node.vy += dy * 0.0003;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const force = 2000 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!nodes[i].pinned) { nodes[i].vx -= fx; nodes[i].vy -= fy; }
          if (!nodes[j].pinned) { nodes[j].vx += fx; nodes[j].vy += fy; }
        }
      }

      for (const edge of edges) {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const idealDist = 150;
        const force = (dist - idealDist) * 0.003;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!source.pinned) { source.vx += fx; source.vy += fy; }
        if (!target.pinned) { target.vx -= fx; target.vy -= fy; }
      }

      for (const node of nodes) {
        if (node.pinned) continue;
        node.vx *= 0.9;
        node.vy *= 0.9;
        node.x += node.vx;
        node.y += node.vy;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.save();
      ctx.translate(panRef.current.x, panRef.current.y);
      ctx.scale(zoomRef.current, zoomRef.current);

      for (const edge of edges) {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);
        if (!source || !target) continue;

        const color = ASSOC_TYPE_COLORS[edge.association.associationType] || "#445566";
        const conf = edge.association.confidence / 100;
        const lineWidth = 1 + conf * 2;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.3 + conf * 0.5;
        ctx.lineWidth = lineWidth;

        if (conf < 0.5) {
          ctx.setLineDash([6, 4]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        const mx = (source.x + target.x) / 2;
        const my = (source.y + target.y) / 2;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(edge.association.confidence)}%`, mx, my - 6);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.font = "8px JetBrains Mono, monospace";
        ctx.fillText(ASSOC_TYPE_LABELS[edge.association.associationType] || "", mx, my + 6);
        ctx.globalAlpha = 1;
      }

      for (const node of nodes) {
        const signalColor = getSignalColor(node.device.signalType);
        const isHovered = hoveredNodeRef.current?.id === node.id;
        const isSelected = selectedNodeRef.current?.id === node.id;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = signalColor;
        ctx.globalAlpha = isHovered || isSelected ? 0.15 : 0.06;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

        const gradient = ctx.createRadialGradient(
          node.x - node.radius * 0.3, node.y - node.radius * 0.3, 0,
          node.x, node.y, node.radius
        );
        gradient.addColorStop(0, signalColor);
        gradient.addColorStop(1, hslToAlpha(signalColor, 0.5));
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = isSelected ? "#ffffff" : isHovered ? "rgba(255,255,255,0.6)" : hslToAlpha(signalColor, 0.4);
        ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
        ctx.stroke();

        if (node.device.isFlagged) {
          ctx.beginPath();
          ctx.arc(node.x + node.radius * 0.6, node.y - node.radius * 0.6, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#ff4444";
          ctx.fill();
        }

        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.font = `${isHovered ? "bold " : ""}10px JetBrains Mono, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const name = node.device.name || "Unknown";
        const displayName = name.length > 16 ? name.substring(0, 14) + ".." : name;
        ctx.fillText(displayName, node.x, node.y + node.radius + 6);
        ctx.globalAlpha = 1;

        ctx.fillStyle = signalColor;
        ctx.globalAlpha = 0.6;
        ctx.font = "8px JetBrains Mono, monospace";
        ctx.fillText(node.device.signalType?.toUpperCase() || "", node.x, node.y + node.radius + 18);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(simulate);
    };

    animFrameRef.current = requestAnimationFrame(simulate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getMousePos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - panRef.current.x) / zoomRef.current,
        y: (e.clientY - rect.top - panRef.current.y) / zoomRef.current,
      };
    };

    const findNode = (mx: number, my: number) => {
      for (const node of nodesRef.current) {
        const dx = node.x - mx;
        const dy = node.y - my;
        if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 4) return node;
      }
      return null;
    };

    const onMouseDown = (e: MouseEvent) => {
      const pos = getMousePos(e);
      const node = findNode(pos.x, pos.y);
      if (node) {
        dragRef.current = { node, offsetX: pos.x - node.x, offsetY: pos.y - node.y };
        node.pinned = true;
        selectedNodeRef.current = node;
        setSelectedNode(node.device);
      } else {
        isPanningRef.current = true;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current.node) {
        const pos = getMousePos(e);
        dragRef.current.node.x = pos.x - dragRef.current.offsetX;
        dragRef.current.node.y = pos.y - dragRef.current.offsetY;
      } else if (isPanningRef.current) {
        panRef.current.x += e.clientX - lastMouseRef.current.x;
        panRef.current.y += e.clientY - lastMouseRef.current.y;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      } else {
        const pos = getMousePos(e);
        const node = findNode(pos.x, pos.y);
        hoveredNodeRef.current = node;
        canvas.style.cursor = node ? "grab" : "default";
      }
    };

    const onMouseUp = () => {
      if (dragRef.current.node) {
        dragRef.current.node.pinned = false;
        dragRef.current = { node: null, offsetX: 0, offsetY: 0 };
      }
      isPanningRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomRef.current = Math.max(0.2, Math.min(5, zoomRef.current * factor));
    };

    const onDblClick = (e: MouseEvent) => {
      const pos = getMousePos(e);
      const node = findNode(pos.x, pos.y);
      if (node) {
        setLocation(`/node-report/${node.device.id}`);
      }
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDblClick);

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDblClick);
    };
  }, [setLocation]);

  const resetView = () => {
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    initGraph();
  };

  const zoomIn = () => { zoomRef.current = Math.min(5, zoomRef.current * 1.2); };
  const zoomOut = () => { zoomRef.current = Math.max(0.2, zoomRef.current * 0.8); };

  const connectedAssocs = selectedNode
    ? associations.filter(a => a.deviceId1 === selectedNode.id || a.deviceId2 === selectedNode.id)
    : [];

  return (
    <div className="flex h-full overflow-hidden" data-testid="page-link-analysis">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-border/30">
          <div>
            <h1 className="text-sm font-semibold">Link Analysis</h1>
            <p className="text-[10px] text-muted-foreground">
              {nodesRef.current.length} nodes &middot; {edgesRef.current.length} links &middot; {associations.length} total associations
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isAnalyzing ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={stopAnalysis}
                data-testid="button-stop-analysis"
              >
                <Square className="w-3.5 h-3.5 mr-1" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                data-testid="button-analyze-all"
              >
                {analyzeMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Scan className="w-3.5 h-3.5 mr-1" />
                )}
                Run Analysis
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || associations.length === 0}
              data-testid="button-reset-associations"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Reset
            </Button>
            <Button size="icon" variant="ghost" onClick={zoomIn} data-testid="button-zoom-in">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={zoomOut} data-testid="button-zoom-out">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={resetView} data-testid="button-reset-graph">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div ref={containerRef} className="flex-1 relative bg-background">
          <canvas ref={canvasRef} className="w-full h-full" data-testid="canvas-link-graph" />

          {isAnalyzing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 bg-background/90 backdrop-blur-sm rounded-md border border-border/30">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Analyzing device associations...</span>
            </div>
          )}

          <div className="absolute bottom-3 left-3 p-2 bg-background/80 backdrop-blur-sm rounded-md border border-border/30">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Legend</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {Object.entries(ASSOC_TYPE_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-0.5 rounded" style={{ backgroundColor: ASSOC_TYPE_COLORS[key] }} />
                  <span className="text-[8px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
            <p className="text-[7px] text-muted-foreground/50 mt-1">Double-click node to open report</p>
          </div>
        </div>
      </div>

      <div className="w-72 border-l border-border/30 flex flex-col bg-background/50">
        <div className="p-3 border-b border-border/30">
          <h2 className="text-xs font-semibold">
            {selectedNode ? selectedNode.name || "Unknown Node" : "Node Inspector"}
          </h2>
          <p className="text-[10px] text-muted-foreground">
            {selectedNode ? `${connectedAssocs.length} link${connectedAssocs.length !== 1 ? "s" : ""}` : "Click a node to inspect"}
          </p>
        </div>

        <ScrollArea className="flex-1">
          {selectedNode ? (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${getSignalColor(selectedNode.signalType)}22`, border: `1.5px solid ${getSignalColor(selectedNode.signalType)}` }}>
                  <Radio className="w-3.5 h-3.5" style={{ color: getSignalColor(selectedNode.signalType) }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{selectedNode.name || "Unknown"}</p>
                  <p className="text-[9px] text-muted-foreground font-mono truncate">{selectedNode.macAddress || selectedNode.uuid || "N/A"}</p>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setLocation(`/node-report/${selectedNode.id}`)}
                data-testid="button-view-report"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                View Full Report
              </Button>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Signal</span>
                  <p>{selectedNode.signalType?.toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p>{selectedNode.deviceType || "Unknown"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Manufacturer</span>
                  <p>{selectedNode.manufacturer || "Unknown"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tracked</span>
                  <p>{selectedNode.isTracked ? "Yes" : "No"}</p>
                </div>
              </div>

              {connectedAssocs.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Associations</p>
                  {connectedAssocs.map(assoc => {
                    const linkedId = assoc.deviceId1 === selectedNode.id ? assoc.deviceId2 : assoc.deviceId1;
                    const linked = devices.find(d => d.id === linkedId);
                    const typeColor = ASSOC_TYPE_COLORS[assoc.associationType] || "#778899";
                    const evidence = assoc.evidence as Record<string, unknown> | null;
                    const confidenceLevel = (evidence?.confidenceLevel as string) || "";
                    const lr: number = Number(evidence?.likelihoodRatio) || 0;
                    const levelLabels: Record<string, string> = {
                      almost_certain: "Almost Certain", highly_likely: "Highly Likely",
                      likely: "Likely", possible: "Possible", unlikely: "Unlikely",
                    };
                    const levelLabel = levelLabels[confidenceLevel] || `${Math.round(assoc.confidence)}%`;
                    return (
                      <div key={assoc.id} className="p-2 rounded-md bg-muted/20 space-y-1" data-testid={`inspector-assoc-${assoc.id}`}>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            className="text-[10px] font-medium truncate text-left hover:underline cursor-pointer"
                            onClick={() => setLocation(`/node-report/${linkedId}`)}
                            data-testid={`link-to-node-${linkedId}`}
                          >
                            {linked?.name || `Node #${linkedId}`}
                          </button>
                          <Badge variant="outline" className="text-[8px]" style={{ borderColor: typeColor, color: typeColor }}>
                            {levelLabel}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[7px] font-mono">
                            {ASSOC_DISCIPLINE[assoc.associationType] || "INT"}
                          </Badge>
                          <Badge variant="secondary" className="text-[7px]" style={{ backgroundColor: `color-mix(in srgb, ${typeColor} 15%, transparent)`, color: typeColor }}>
                            {ASSOC_TYPE_LABELS[assoc.associationType]}
                          </Badge>
                          {typeof lr === "number" && lr > 0 && (
                            <span className="text-[8px] text-muted-foreground font-mono">LR {lr.toFixed(1)}:1</span>
                          )}
                        </div>
                        {evidence?.method && (
                          <p className="text-[8px] text-muted-foreground/70 italic">{String(evidence.method)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center space-y-3">
              <Link2 className="w-10 h-10 mx-auto text-muted-foreground/20" />
              <div>
                <p className="text-xs text-muted-foreground">Select a node to view details</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Drag nodes to rearrange. Scroll to zoom. Click and drag background to pan. Double-click a node to open its report.
                </p>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
