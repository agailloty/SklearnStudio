import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import type { GraphNode, StructureNode } from '../types/model';
import { formatValuePreview, getCategoryStyle } from '../utils/format';

interface NodeInspectorPanelProps {
  node: GraphNode | null;
  structureRoot: StructureNode;
  onClose: () => void;
}

const PAGE_SIZE = 16;

function findStructureNodeById(root: StructureNode, nodeId: string): StructureNode | null {
  if (root.nodeId === nodeId) return root;
  for (const child of root.children) {
    const found = findStructureNodeById(child, nodeId);
    if (found) return found;
  }
  return null;
}

interface PaginatedArrayViewerProps {
  name: string;
  values: unknown[];
}

const PaginatedArrayViewer: React.FC<PaginatedArrayViewerProps> = ({ name, values }) => {
  const [page, setPage] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    setPage(0);
  }, [name, values]);

  const total = values.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(total, start + PAGE_SIZE);
  const slice = values.slice(start, end);

  // Check if short numeric vector suitable for inline proportional bars
  const isNumericVector =
    total > 0 &&
    total <= 64 &&
    values.every((v) => typeof v === 'number' && Number.isFinite(v as number));
  const maxAbs = useMemo(() => {
    if (!isNumericVector) return 1;
    let m = 0;
    for (const v of values as number[]) {
      m = Math.max(m, Math.abs(v));
    }
    return m > 0 ? m : 1;
  }, [isNumericVector, values]);

  const copyValue = (text: string, idx: number) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1200);
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
        {slice.map((item, localIdx) => {
          const globalIdx = start + localIdx;
          const preview = formatValuePreview(item, 256);
          const numVal = typeof item === 'number' && Number.isFinite(item) ? item : null;

          return (
            <div
              key={globalIdx}
              className="px-2.5 py-1.5 bg-[var(--bg-primary)]/40 hover:bg-[var(--bg-elevated)]/60 flex items-center justify-between gap-2 text-[11px]"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="font-mono text-[10px] text-[var(--text-muted)] w-7 shrink-0">
                  [{globalIdx}]
                </span>
                <span
                  className="font-mono truncate text-[var(--text-primary)]"
                  title={preview.full}
                >
                  {preview.text}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isNumericVector && numVal !== null && (
                  <div className="w-16 h-1.5 rounded-full bg-slate-700/40 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        numVal >= 0 ? 'bg-sky-400' : 'bg-rose-400'
                      }`}
                      style={{ width: `${Math.min(100, (Math.abs(numVal) / maxAbs) * 100)}%` }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => copyValue(preview.full, globalIdx)}
                  className="p-1 rounded hover:bg-slate-500/20 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  title="Copier la valeur complète"
                >
                  {copiedIdx === globalIdx ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5">
          <span className="font-mono">
            {start + 1}–{end} sur {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded studio-elevated disabled:opacity-40 hover:text-[var(--text-primary)]"
            >
              <ChevronLeft className="w-3 h-3" />
              <span>Précédent</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="flex items-center gap-0.5 px-2 py-0.5 rounded studio-elevated disabled:opacity-40 hover:text-[var(--text-primary)]"
            >
              <span>Suivant</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const NodeInspectorPanel: React.FC<NodeInspectorPanelProps> = ({
  node,
  structureRoot,
  onClose,
}) => {
  const [paramFilter, setParamFilter] = useState('');

  useEffect(() => {
    setParamFilter('');
  }, [node?.id]);

  if (!node) {
    return (
      <aside className="w-full lg:w-[390px] shrink-0 studio-panel border-y-0 border-r-0 p-5 flex flex-col items-center justify-center text-center text-[var(--text-muted)]">
        <GitBranch className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm font-medium text-[var(--text-secondary)]">
          Sélectionnez un nœud du graphe
        </p>
        <p className="text-xs mt-1 max-w-[260px]">
          Cliquez sur une étape du pipeline pour inspecter ses hyperparamètres et ses attributs
          appris.
        </p>
      </aside>
    );
  }

  const style = getCategoryStyle(node.category);
  const structureNode = findStructureNodeById(structureRoot, node.id);
  const fullClass =
    typeof node.attributes.Class === 'string' ? node.attributes.Class : node.opType;

  // Separate hyperparameters & fitted attributes
  const rawParams: Array<{ key: string; value: unknown }> = structureNode
    ? structureNode.parameters.filter((p) => p.key !== 'Class' && p.key !== 'Details')
    : Object.entries(node.attributes)
        .filter(([k]) => k !== 'Class' && k !== 'Details' && !k.includes(' · '))
        .map(([key, value]) => ({ key, value }));

  const filterLower = paramFilter.trim().toLowerCase();
  const filteredParams = filterLower
    ? rawParams.filter(
        (p) =>
          p.key.toLowerCase().includes(filterLower) ||
          String(p.value).toLowerCase().includes(filterLower)
      )
    : rawParams;

  const fittedEntries: Array<{ key: string; values: unknown; displayValue?: string }> = structureNode
    ? structureNode.fitted.map((f: unknown) => {
        const entry = f as Record<string, unknown>;
        return {
          key: String(entry.key ?? entry.name ?? 'fitted'),
          values: entry.hasValues ? entry.values : entry.displayValue ?? entry.value,
          displayValue: typeof entry.displayValue === 'string' ? entry.displayValue : undefined,
        };
      })
    : Object.entries(node.attributes)
        .filter(([k]) => k.includes(' · '))
        .map(([key, values]) => ({ key, values }));

  return (
    <aside className="w-full lg:w-[400px] shrink-0 studio-panel border-y-0 border-r-0 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] space-y-2.5 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${style.badgeClass}`}
              >
                {node.category}
              </span>
              <span className="font-mono text-xs text-[var(--text-muted)] truncate">
                {node.name}
              </span>
            </div>
            <h2 className="font-mono text-base font-bold truncate">{node.opType}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Fermer l'inspecteur"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="font-mono text-[11px] text-[var(--text-secondary)] truncate px-2 py-1 rounded studio-elevated"
          title={fullClass}
        >
          {fullClass}
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <GitBranch className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>
            dépend de <strong className="text-[var(--text-primary)]">{node.dependsOn.length}</strong>{' '}
            nœud(s) • utilisé par{' '}
            <strong className="text-[var(--text-primary)]">{node.dependedBy.length}</strong> nœud(s)
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Hyperparameters */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Hyperparamètres ({rawParams.length})</span>
            </div>
          </div>

          {rawParams.length > 4 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={paramFilter}
                onChange={(e) => setParamFilter(e.target.value)}
                placeholder="Filtrer les hyperparamètres…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg studio-elevated text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          )}

          {filteredParams.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic">Aucun hyperparamètre.</p>
          ) : (
            <div className="rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] overflow-hidden">
              {filteredParams.map((p, i) => {
                const preview = formatValuePreview(p.value, 256);
                return (
                  <div
                    key={`${p.key}-${i}`}
                    className="px-2.5 py-1.5 flex items-start justify-between gap-3 text-xs bg-[var(--bg-primary)]/30"
                  >
                    <span className="font-mono text-[var(--text-muted)] shrink-0">{p.key}</span>
                    <span
                      className="font-mono text-right text-[var(--text-primary)] break-all"
                      title={preview.full}
                    >
                      {preview.text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Fitted Attributes */}
        <section className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Attributs appris ({fittedEntries.length})</span>
          </div>

          {fittedEntries.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] italic">
              Aucun attribut appris exposé pour ce nœud.
            </p>
          ) : (
            <div className="space-y-3">
              {fittedEntries.map((entry, idx) => {
                const isArray = Array.isArray(entry.values);
                const preview = !isArray ? formatValuePreview(entry.values, 256) : null;

                return (
                  <div key={`${entry.key}-${idx}`} className="space-y-1.5">
                    <div className="font-mono text-xs font-semibold text-sky-400 break-words">
                      {entry.key}
                    </div>
                    {isArray ? (
                      <PaginatedArrayViewer
                        name={entry.key}
                        values={entry.values as unknown[]}
                      />
                    ) : (
                      <div
                        className="px-2.5 py-1.5 rounded-lg studio-elevated font-mono text-xs break-all"
                        title={preview?.full}
                      >
                        {preview?.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
