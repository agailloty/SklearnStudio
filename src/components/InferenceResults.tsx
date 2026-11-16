import React from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Download,
  History,
  Layers,
  RotateCcw,
} from 'lucide-react';
import type {
  FormattedOutput,
  InferenceHistoryItem,
  InferenceResult,
} from '../types/model';

interface InferenceResultsProps {
  result: InferenceResult | null;
  history: InferenceHistoryItem[];
  onReplayHistory: (item: InferenceHistoryItem) => void;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: unknown): string {
  const raw =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function exportResultCsv(result: InferenceResult): string {
  const headers = ['row'];
  const columnsData: unknown[][] = [];
  for (const out of result.outputs) {
    const vals = out.values;
    if (Array.isArray(vals) && Array.isArray(vals[0])) {
      const width = (vals[0] as unknown[]).length;
      for (let j = 0; j < width; j++) {
        headers.push(`${out.name}[${j}]`);
        columnsData.push(vals.map((r) => (r as unknown[])[j] ?? ''));
      }
    } else if (Array.isArray(vals)) {
      headers.push(out.name);
      columnsData.push(vals.map((v) => v ?? ''));
    }
  }
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (let i = 0; i < result.rowCount; i++) {
    const row = [String(i + 1), ...columnsData.map((col) => escapeCsvCell(col[i]))];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

const SingleRowOutputCard: React.FC<{ output: FormattedOutput }> = ({ output }) => {
  if (output.topClasses && output.topClasses.length > 0) {
    const isProba = output.name === 'predict_proba';
    const maxAbs = Math.max(
      1e-9,
      ...output.topClasses.map((c) => Math.abs(c.value ?? 0))
    );

    return (
      <div className="studio-elevated rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-400" />
            <span className="font-mono text-xs font-semibold">{output.name}</span>
          </div>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {output.dtype} {output.shapeDisplay}
          </span>
        </div>

        <div className="space-y-2">
          {output.topClasses.map((cls, idx) => {
            const rawVal = cls.value ?? 0;
            const val = Number.isFinite(rawVal) ? rawVal : 0;
            const pct = isProba
              ? Math.max(0, Math.min(100, val * 100))
              : Math.max(0, Math.min(100, (Math.abs(val) / maxAbs) * 100));

            return (
              <div key={cls.index} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium truncate">{cls.label}</span>
                  <span className="font-mono text-[var(--text-secondary)]">
                    {isProba ? `${(val * 100).toFixed(1)}%` : val.toFixed(4)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-800/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      idx === 0
                        ? 'bg-gradient-to-r from-emerald-500 to-sky-400'
                        : 'bg-indigo-500/70'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="studio-elevated rounded-xl p-3.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold">{output.name}</span>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {output.dtype} {output.shapeDisplay}
        </span>
      </div>
      <div className="font-mono text-sm font-semibold text-emerald-400 break-words">
        {output.scalarDisplay || output.displayValues.join(', ')}
      </div>
    </div>
  );
};

export const InferenceResults: React.FC<InferenceResultsProps> = ({
  result,
  history,
  onReplayHistory,
}) => {
  const predictOut = result?.formattedOutputs.find((o) => o.name === 'predict');
  const otherOutputs = result?.formattedOutputs.filter((o) => o.name !== 'predict') ?? [];

  return (
    <div className="studio-panel rounded-xl flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <h2 className="text-sm font-semibold">Résultats en direct</h2>
        {result && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                downloadBlob(
                  JSON.stringify(result, null, 2),
                  'sklearn_inference.json',
                  'application/json'
                )
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg studio-elevated text-xs hover:text-sky-400"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
            <button
              type="button"
              onClick={() =>
                downloadBlob(exportResultCsv(result), 'sklearn_inference.csv', 'text/csv')
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg studio-elevated text-xs hover:text-sky-400"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!result ? (
          <div className="h-48 flex flex-col items-center justify-center text-center text-[var(--text-muted)]">
            <Layers className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              Aucune prédiction exécutée
            </p>
            <p className="text-xs mt-1">
              Remplissez le formulaire à gauche et cliquez sur « Exécuter l'inférence ».
            </p>
          </div>
        ) : (
          <>
            {/* Summary banner */}
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg studio-elevated text-xs">
              <div className="flex items-center gap-1.5 text-sky-400 font-mono">
                <Clock className="w-3.5 h-3.5" />
                <span>{result.elapsedMs} ms</span>
              </div>
              <span className="text-[var(--border-strong)]">•</span>
              <span className="font-mono">
                {result.rowCount} échantillon{result.rowCount > 1 ? 's' : ''}
              </span>
              {result.warnings.length > 0 && (
                <>
                  <span className="text-[var(--border-strong)]">•</span>
                  <span
                    className="flex items-center gap-1 text-amber-400"
                    title={result.warnings.join('\n')}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{result.warnings.length} avertissement(s)</span>
                  </span>
                </>
              )}
            </div>

            {result.rowCount === 1 ? (
              <div className="space-y-3">
                {predictOut && (
                  <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                      Prédiction principale (predict)
                    </div>
                    <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
                      {predictOut.scalarDisplay || predictOut.displayValues[0] || '—'}
                    </div>
                  </div>
                )}

                {otherOutputs.map((out) => (
                  <SingleRowOutputCard key={out.name} output={out} />
                ))}
              </div>
            ) : (
              /* Batch table */
              <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      {result.outputs.map((o) => (
                        <th key={o.name} className="px-3 py-2">
                          {o.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {Array.from({ length: result.rowCount }).map((_, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[var(--bg-elevated)]/40">
                        <td className="px-3 py-2 text-[var(--text-muted)]">{rIdx + 1}</td>
                        {result.outputs.map((o) => {
                          const vals = Array.isArray(o.values) ? o.values : [];
                          const cell = vals[rIdx];
                          const text = Array.isArray(cell)
                            ? `[${cell.map((v) => (typeof v === 'number' ? v.toFixed(3) : String(v))).join(', ')}]`
                            : String(cell ?? '—');
                          return (
                            <td key={o.name} className="px-3 py-2 max-w-[260px] truncate" title={text}>
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Session History */}
        {history.length > 0 && (
          <section className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <History className="w-3.5 h-3.5" />
              <span>Historique de session ({history.length}/10)</span>
            </div>
            <div className="space-y-1.5">
              {history.map((item) => {
                const pred = item.result.formattedOutputs.find((o) => o.name === 'predict');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onReplayHistory(item)}
                    className="w-full text-left px-3 py-2 rounded-lg studio-elevated hover:border-sky-500/40 flex items-center justify-between gap-2 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <RotateCcw className="w-3 h-3 text-sky-400 shrink-0" />
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-700/40">
                        {item.mode}
                      </span>
                      <span className="font-mono truncate">
                        {pred?.scalarDisplay || `${item.result.rowCount} lignes`}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">
                      {item.timestamp} • {item.result.elapsedMs} ms
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
