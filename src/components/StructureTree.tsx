import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Layers } from 'lucide-react';
import type { StructureNode } from '../types/model';
import { formatValuePreview, getCategoryStyle } from '../utils/format';

interface StructureTreeProps {
  root: StructureNode;
  selectedNodeId: string | null;
  onSelectGraphNode: (nodeId: string, switchToGraph?: boolean) => void;
}

interface TreeItemProps {
  node: StructureNode;
  depth: number;
  selectedNodeId: string | null;
  onSelectGraphNode: (nodeId: string, switchToGraph?: boolean) => void;
}

const TreeItem: React.FC<TreeItemProps> = ({
  node,
  depth,
  selectedNodeId,
  onSelectGraphNode,
}) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = Boolean(node.nodeId && node.nodeId === selectedNodeId);
  const style = getCategoryStyle(node.kind);

  return (
    <div className="select-none">
      <div
        onClick={() => {
          if (hasChildren) setExpanded((v) => !v);
          if (node.nodeId) onSelectGraphNode(node.nodeId, false);
        }}
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-sky-500/15 border border-sky-500/35'
            : 'hover:bg-[var(--bg-elevated)] border border-transparent'
        }`}
        style={{ marginLeft: `${depth * 18}px` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren ? (
            <span className="text-[var(--text-muted)] shrink-0">
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
          ) : (
            <span className="w-4 h-4 shrink-0 flex items-center justify-center">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: style.hex }}
              />
            </span>
          )}

          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${style.badgeClass}`}
          >
            {node.kind}
          </span>

          <span className="font-mono text-xs font-semibold truncate">{node.header}</span>

          {node.description && (
            <span className="text-xs text-[var(--text-muted)] truncate hidden sm:inline">
              {node.description}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {node.fitted.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded studio-elevated text-[var(--text-muted)]">
              {node.fitted.length} attr.
            </span>
          )}
          {node.nodeId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectGraphNode(node.nodeId!, true);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 text-[11px] font-medium"
              title="Voir ce composant dans le graphe DAG"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Voir dans le graphe</span>
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-1 space-y-1">
          {node.parameters.length > 0 && depth > 0 && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-1 px-3 py-1.5 rounded-lg studio-elevated text-[11px]"
              style={{ marginLeft: `${(depth + 1) * 18}px` }}
            >
              {node.parameters.slice(0, 8).map((p, i) => {
                const preview = formatValuePreview(p.value, 80);
                return (
                  <div key={`${p.key}-${i}`} className="flex items-center gap-1.5 truncate">
                    <span className="text-[var(--text-muted)] font-mono">{p.key}:</span>
                    <span className="font-mono text-[var(--text-primary)] truncate" title={preview.full}>
                      {preview.text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {node.children.map((child, idx) => (
            <TreeItem
              key={`${child.header}-${idx}`}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelectGraphNode={onSelectGraphNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const StructureTree: React.FC<StructureTreeProps> = ({
  root,
  selectedNodeId,
  onSelectGraphNode,
}) => {
  return (
    <div className="w-full h-full overflow-y-auto p-4">
      <div className="max-w-4xl mx-auto studio-panel rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] pb-2 border-b border-[var(--border-subtle)]">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Arbre hiérarchique du modèle</span>
        </div>
        <TreeItem
          node={root}
          depth={0}
          selectedNodeId={selectedNodeId}
          onSelectGraphNode={onSelectGraphNode}
        />
      </div>
    </div>
  );
};
