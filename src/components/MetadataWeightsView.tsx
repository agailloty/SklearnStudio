import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  Weight,
} from 'lucide-react';
import type { InspectedModel } from '../types/model';
import { formatBytes, formatValuePreview } from '../utils/format';

interface MetadataWeightsViewProps {
  model: InspectedModel;
}

const WEIGHTS_PAGE_SIZE = 16;

export const MetadataWeightsView: React.FC<MetadataWeightsViewProps> = ({ model }) => {
  const [weightFilter, setWeightFilter] = useState('');
  const [page, setPage] = useState(0);

  const filteredWeights = useMemo(() => {
    const q = weightFilter.trim().toLowerCase();
    if (!q) return model.weights;
    return model.weights.filter(
      (w) => w.name.toLowerCase().includes(q) || w.summary.toLowerCase().includes(q)
    );
  }, [model.weights, weightFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredWeights.length / WEIGHTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageWeights = filteredWeights.slice(
    safePage * WEIGHTS_PAGE_SIZE,
    (safePage + 1) * WEIGHTS_PAGE_SIZE
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* General Info & Packages */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="studio-panel rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Informations générales
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="studio-elevated rounded-lg p-2.5">
                <div className="text-[var(--text-muted)] text-[11px]">Fichier</div>
                <div className="font-mono font-semibold truncate">{model.filename}</div>
              </div>
              <div className="studio-elevated rounded-lg p-2.5">
                <div className="text-[var(--text-muted)] text-[11px]">Taille</div>
                <div className="font-mono font-semibold">{formatBytes(model.sizeBytes)}</div>
              </div>
              <div className="studio-elevated rounded-lg p-2.5">
                <div className="text-[var(--text-muted)] text-[11px]">Classe racine</div>
                <div className="font-mono font-semibold truncate">{model.info.className}</div>
              </div>
              <div className="studio-elevated rounded-lg p-2.5">
                <div className="text-[var(--text-muted)] text-[11px]">Layout d'entrée</div>
                <div className="font-mono font-semibold text-sky-400">{model.inputLayout}</div>
              </div>
              <div className="studio-elevated rounded-lg p-2.5">
                <div className="text-[var(--text-muted)] text-[11px]">Entraîné avec</div>
                <div className="font-mono font-semibold">
                  {model.info.trainedWithSklearn ?? 'Inconnu'}
                </div>
              </div>
              <div className="studio-elevated rounded-lg p-2.5">
                <div className="text-[var(--text-muted)] text-[11px]">Runtime scikit-learn</div>
                <div className="font-mono font-semibold">
                  {model.info.runtimeSklearn ?? 'Inconnu'}
                </div>
              </div>
            </div>
          </div>

          <div className="studio-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Package className="w-3.5 h-3.5 text-indigo-400" />
              <span>Versions des paquets</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {Object.entries(model.info.packages || {}).map(([pkg, ver]) => (
                <div key={pkg} className="studio-elevated rounded-lg p-2.5">
                  <div className="text-[var(--text-muted)] font-mono text-[11px]">{pkg}</div>
                  <div className="font-mono font-semibold">{ver ?? '—'}</div>
                </div>
              ))}
            </div>

            {model.info.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Avertissements ({model.info.warnings.length})</span>
                </div>
                <ul className="list-disc list-inside text-[11px] font-mono text-amber-200/90 space-y-0.5 max-h-24 overflow-y-auto">
                  {model.info.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Inputs & Outputs Schemas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="studio-panel rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <ArrowDownToLine className="w-3.5 h-3.5 text-sky-400" />
              <span>Schéma d'entrée ({model.inputs.length})</span>
            </div>
            <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
              {model.inputs.map((inp) => (
                <div key={inp.name} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold truncate">{inp.name}</div>
                    {inp.description && (
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        {inp.description}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded studio-elevated text-sky-400 shrink-0">
                    {inp.display}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="studio-panel rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-400" />
              <span>Schéma de sortie ({model.outputs.length})</span>
            </div>
            <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
              {model.outputs.map((out) => (
                <div key={out.name} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-semibold">{out.name}</span>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded studio-elevated text-emerald-400 shrink-0">
                    {out.display}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Weights / Learned Parameters */}
        <div className="studio-panel rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Weight className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Poids & Attributs appris ({filteredWeights.length} •{' '}
                {model.graph.statistics.totalParameters.toLocaleString()} éléments)
              </span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={weightFilter}
                onChange={(e) => {
                  setWeightFilter(e.target.value);
                  setPage(0);
                }}
                placeholder="Filtrer les poids…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg studio-elevated text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-3 py-2">Nom</th>
                  <th className="px-3 py-2">Résumé</th>
                  <th className="px-3 py-2">Éléments</th>
                  <th className="px-3 py-2">Aperçu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {pageWeights.map((w, idx) => {
                  const preview = formatValuePreview(w.values, 140);
                  return (
                    <tr key={`${w.name}-${idx}`} className="hover:bg-[var(--bg-elevated)]/40">
                      <td className="px-3 py-2 font-semibold text-sky-400">{w.name}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{w.summary}</td>
                      <td className="px-3 py-2">{w.elementCount.toLocaleString()}</td>
                      <td className="px-3 py-2 max-w-md truncate" title={preview.full}>
                        {preview.text}
                      </td>
                    </tr>
                  );
                })}
                {pageWeights.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-[var(--text-muted)]">
                      Aucun poids trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredWeights.length > WEIGHTS_PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="font-mono">
                Page {safePage + 1} / {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg studio-elevated disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Précédent</span>
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg studio-elevated disabled:opacity-40"
                >
                  <span>Suivant</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
