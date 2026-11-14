import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Map as MapIcon, Minus, Plus } from 'lucide-react';
import type { GraphNode, ModelGraph } from '../types/model';
import { getCategoryStyle } from '../utils/format';

interface GraphCanvasProps {
  graph: ModelGraph;
  selectedNodeId: string | null;
  searchQuery: string;
  activeCategory: string;
  onSelectNode: (nodeId: string | null) => void;
}

interface Transform {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graph,
  selectedNodeId,
  searchQuery,
  activeCategory,
  onSelectNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 40, y: 40, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const panOriginRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of graph.nodes) map.set(n.id, n);
    return map;
  }, [graph.nodes]);

  const bounds = useMemo(() => {
    if (graph.nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: 400, maxY: 200, width: 400, height: 200 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of graph.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(100, maxX - minX),
      height: Math.max(80, maxY - minY),
    };
  }, [graph.nodes]);

  const fitToScreen = useCallback(() => {
    const el = containerRef.current;
    if (!el || graph.nodes.length === 0) return;
    const rect = el.getBoundingClientRect();
    const pad = 64;
    const availW = Math.max(120, rect.width - pad * 2);
    const availH = Math.max(120, rect.height - pad * 2);
    const scale = Math.min(1.25, Math.max(MIN_SCALE, Math.min(availW / bounds.width, availH / bounds.height)));
    const x = (rect.width - bounds.width * scale) / 2 - bounds.minX * scale;
    const y = (rect.height - bounds.height * scale) / 2 - bounds.minY * scale;
    setTransform({ x, y, scale });
  }, [bounds, graph.nodes.length]);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    setTransform((prev) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: px - (px - prev.x) * ratio,
        y: py - (py - prev.y) * ratio,
      };
    });
  }, []);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    zoomAt(e.clientX, e.clientY, factor);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-node-id]')) return;
    setIsPanning(true);
    panOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: transform.x,
      origY: transform.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !panOriginRef.current) return;
    const dx = e.clientX - panOriginRef.current.startX;
    const dy = e.clientY - panOriginRef.current.startY;
    setTransform((prev) => ({
      ...prev,
      x: panOriginRef.current!.origX + dx,
      y: panOriginRef.current!.origY + dy,
    }));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    panOriginRef.current = null;
  };

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null;
  const connectedIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    return new Set([selectedNode.id, ...selectedNode.dependsOn, ...selectedNode.dependedBy]);
  }, [selectedNode]);

  const queryLower = searchQuery.trim().toLowerCase();

  const matchesFilter = (node: GraphNode): boolean => {
    const catOk = activeCategory === 'All' || node.category === activeCategory;
    const searchOk =
      !queryLower ||
      node.name.toLowerCase().includes(queryLower) ||
      node.opType.toLowerCase().includes(queryLower);
    return catOk && searchOk;
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('[data-node-id]')) {
          onSelectNode(null);
        }
      }}
      className={`relative w-full h-full overflow-hidden dag-grid-bg select-none ${
        isPanning ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <svg className="w-full h-full block">
        <defs>
          <marker
            id="dag-arrow"
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="rgba(148, 163, 184, 0.7)" />
          </marker>
          <marker
            id="dag-arrow-active"
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#38BDF8" />
          </marker>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Edges */}
          {graph.edges.map((edge, idx) => {
            const from = nodeMap.get(edge.fromNodeId);
            const to = nodeMap.get(edge.toNodeId);
            if (!from || !to) return null;

            const x1 = from.x + from.width;
            const y1 = from.y + from.height / 2;
            const x2 = to.x;
            const y2 = to.y + to.height / 2;
            const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
            const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            const isEdgeHighlighted =
              selectedNodeId !== null &&
              (edge.fromNodeId === selectedNodeId || edge.toNodeId === selectedNodeId);

            return (
              <path
                key={`${edge.fromNodeId}-${edge.toNodeId}-${idx}`}
                d={d}
                fill="none"
                stroke={isEdgeHighlighted ? '#38BDF8' : 'rgba(148, 163, 184, 0.45)'}
                strokeWidth={isEdgeHighlighted ? 2.4 : 1.6}
                markerEnd={isEdgeHighlighted ? 'url(#dag-arrow-active)' : 'url(#dag-arrow)'}
                className={isEdgeHighlighted ? 'edge-animated' : ''}
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const style = getCategoryStyle(node.category);
            const isSelected = node.id === selectedNodeId;
            const isConnected = connectedIds.has(node.id);
            const isMatch = matchesFilter(node);
            const dimmed =
              (!isMatch && (queryLower !== '' || activeCategory !== 'All')) ||
              (selectedNodeId !== null && !isConnected);

            return (
              <g
                key={node.id}
                data-node-id={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
                className="cursor-pointer transition-opacity duration-150"
                style={{ opacity: dimmed ? 0.32 : 1 }}
              >
                {/* Selection glow */}
                {isSelected && (
                  <rect
                    x={-4}
                    y={-4}
                    width={node.width + 8}
                    height={node.height + 8}
                    rx={12}
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth={2}
                  />
                )}

                {/* Card body */}
                <rect
                  x={0}
                  y={0}
                  width={node.width}
                  height={node.height}
                  rx={9}
                  fill="var(--bg-panel)"
                  stroke={isSelected ? '#38BDF8' : style.borderTint}
                  strokeWidth={isSelected ? 1.8 : 1.25}
                />

                {/* Left semantic color bar */}
                <rect x={0} y={0} width={5} height={node.height} rx={3} fill={style.hex} />

                {/* Category pill */}
                <rect
                  x={12}
                  y={7}
                  width={Math.min(92, node.category.length * 6.5 + 14)}
                  height={16}
                  rx={4}
                  fill={style.bgTint}
                />
                <text
                  x={18}
                  y={18}
                  fontSize={9.5}
                  fontWeight={600}
                  fill={style.hex}
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  {node.category}
                </text>

                {/* OpType (monospace) */}
                <text
                  x={12}
                  y={36}
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--text-primary)"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {node.opType.length > 22 ? `${node.opType.slice(0, 21)}…` : node.opType}
                </text>

                {/* Step / Node name */}
                <text
                  x={12}
                  y={50}
                  fontSize={10.5}
                  fill="var(--text-muted)"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {node.name.length > 24 ? `${node.name.slice(0, 23)}…` : node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Zoom & Fit Controls */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 p-1 rounded-xl studio-panel shadow-lg">
        <button
          type="button"
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
          }}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title="Zoom avant"
        >
          <Plus className="w-4 h-4" />
        </button>
        <span className="px-1.5 font-mono text-[11px] text-[var(--text-muted)] min-w-[44px] text-center">
          {Math.round(transform.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.83);
          }}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title="Zoom arrière"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-[var(--border-subtle)] mx-0.5" />
        <button
          type="button"
          onClick={fitToScreen}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          title="Ajuster à l'écran (Home)"
        >
          <Home className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setShowMinimap((v) => !v)}
          className={`p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] ${
            showMinimap ? 'text-sky-400' : 'text-[var(--text-secondary)]'
          }`}
          title="Afficher / masquer la minimap"
        >
          <MapIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Minimap */}
      {showMinimap && graph.nodes.length > 0 && (
        <div className="hidden md:block absolute bottom-4 right-4 w-44 h-28 rounded-xl studio-panel shadow-lg p-2 pointer-events-none">
          <svg
            viewBox={`${bounds.minX - 20} ${bounds.minY - 20} ${bounds.width + 40} ${
              bounds.height + 40
            }`}
            className="w-full h-full"
          >
            {graph.nodes.map((n) => (
              <rect
                key={n.id}
                x={n.x}
                y={n.y}
                width={n.width}
                height={n.height}
                rx={6}
                fill={n.id === selectedNodeId ? '#38BDF8' : getCategoryStyle(n.category).hex}
                opacity={n.id === selectedNodeId ? 0.95 : 0.55}
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
};
