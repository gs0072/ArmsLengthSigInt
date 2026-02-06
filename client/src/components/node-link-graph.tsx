import { useEffect, useRef, useCallback } from "react";
import type { Device, DeviceAssociation } from "@shared/schema";
import { getSignalColor } from "@/lib/signal-utils";

function hslToAlpha(hslColor: string, alpha: number): string {
  const match = hslColor.match(/hsl\(([^)]+)\)/);
  if (match) return `hsla(${match[1]}, ${alpha})`;
  return hslColor;
}

export const ASSOC_TYPE_LABELS: Record<string, string> = {
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

export const ASSOC_TYPE_COLORS: Record<string, string> = {
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

export const ASSOC_DISCIPLINE: Record<string, string> = {
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

interface NodeLinkGraphProps {
  devices: Device[];
  associations: DeviceAssociation[];
  focusNodeId?: number | null;
  onNodeSelect?: (device: Device | null) => void;
  className?: string;
  height?: number;
}

export function NodeLinkGraph({
  devices,
  associations,
  focusNodeId,
  onNodeSelect,
  className = "",
  height = 400,
}: NodeLinkGraphProps) {
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

  const initGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let relevantDevices: Device[];
    let relevantAssocs: DeviceAssociation[];

    if (focusNodeId) {
      const connectedIds = new Set<number>([focusNodeId]);
      associations.forEach(a => {
        if (a.deviceId1 === focusNodeId) connectedIds.add(a.deviceId2);
        if (a.deviceId2 === focusNodeId) connectedIds.add(a.deviceId1);
      });
      associations.forEach(a => {
        if (connectedIds.has(a.deviceId1) && connectedIds.has(a.deviceId2)) {
          connectedIds.add(a.deviceId1);
          connectedIds.add(a.deviceId2);
        }
      });
      relevantDevices = devices.filter(d => connectedIds.has(d.id));
      relevantAssocs = associations.filter(a =>
        connectedIds.has(a.deviceId1) && connectedIds.has(a.deviceId2)
      );
    } else {
      const connectedIds = new Set<number>();
      associations.forEach(a => {
        connectedIds.add(a.deviceId1);
        connectedIds.add(a.deviceId2);
      });
      relevantDevices = devices.filter(d => connectedIds.has(d.id));
      relevantAssocs = associations;
      if (relevantDevices.length === 0 && devices.length > 0) {
        relevantDevices = devices.slice(0, Math.min(20, devices.length));
      }
    }

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2;
    const cy = h / 2;

    nodesRef.current = relevantDevices.map((device, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, relevantDevices.length);
      const spread = Math.min(w, h) * 0.3;
      const isFocus = device.id === focusNodeId;
      return {
        id: device.id,
        x: isFocus ? cx : cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 50,
        y: isFocus ? cy : cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
        device,
        radius: isFocus ? 22 : getNodeRadius(device, relevantAssocs),
        pinned: false,
      };
    });

    edgesRef.current = relevantAssocs
      .filter(a => nodesRef.current.some(n => n.id === a.deviceId1) && nodesRef.current.some(n => n.id === a.deviceId2))
      .map(a => ({ source: a.deviceId1, target: a.deviceId2, association: a }));

    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
  }, [devices, associations, focusNodeId]);

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
        const centerX = w / 2 - panRef.current.x;
        const centerY = h / 2 - panRef.current.y;
        const dx = centerX - node.x;
        const dy = centerY - node.y;
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
        if (conf < 0.5) ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);
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
        const isFocus = node.device.id === focusNodeId;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = isFocus ? "#00d4ff" : signalColor;
        ctx.globalAlpha = isHovered || isSelected || isFocus ? 0.2 : 0.06;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (isFocus) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 12, 0, Math.PI * 2);
          ctx.strokeStyle = "#00d4ff";
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(
          node.x - node.radius * 0.3, node.y - node.radius * 0.3, 0,
          node.x, node.y, node.radius
        );
        gradient.addColorStop(0, isFocus ? "#00d4ff" : signalColor);
        gradient.addColorStop(1, hslToAlpha(isFocus ? "hsl(190, 100%, 50%)" : signalColor, 0.5));
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = isSelected ? "#ffffff" : isHovered ? "rgba(255,255,255,0.6)" : hslToAlpha(signalColor, 0.4);
        ctx.lineWidth = isSelected || isFocus ? 2.5 : isHovered ? 2 : 1;
        ctx.stroke();

        if (node.device.isFlagged) {
          ctx.beginPath();
          ctx.arc(node.x + node.radius * 0.6, node.y - node.radius * 0.6, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#ff4444";
          ctx.fill();
        }

        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.font = `${isHovered || isFocus ? "bold " : ""}10px JetBrains Mono, monospace`;
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
  }, [focusNodeId]);

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
        onNodeSelect?.(node.device);
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

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [onNodeSelect]);

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }} data-testid="node-link-graph">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-md border border-border/30">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {Object.entries(ASSOC_TYPE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <div className="w-2 h-0.5 rounded" style={{ backgroundColor: ASSOC_TYPE_COLORS[key] }} />
              <span className="text-[7px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
