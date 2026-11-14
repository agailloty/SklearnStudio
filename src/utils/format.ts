import type { InspectedModel, NodeCategory } from '../types/model';

export interface CategoryStyle {
  hex: string;
  bgTint: string;
  borderTint: string;
  badgeClass: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  Pipeline: {
    hex: '#6366F1',
    bgTint: 'rgba(99, 102, 241, 0.14)',
    borderTint: 'rgba(99, 102, 241, 0.55)',
    badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  },
  Transformer: {
    hex: '#F59E0B',
    bgTint: 'rgba(245, 158, 11, 0.14)',
    borderTint: 'rgba(245, 158, 11, 0.55)',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  Classifier: {
    hex: '#10B981',
    bgTint: 'rgba(16, 185, 129, 0.14)',
    borderTint: 'rgba(16, 185, 129, 0.55)',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  Regressor: {
    hex: '#A855F7',
    bgTint: 'rgba(168, 85, 247, 0.14)',
    borderTint: 'rgba(168, 85, 247, 0.55)',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  Estimator: {
    hex: '#64748B',
    bgTint: 'rgba(100, 116, 139, 0.16)',
    borderTint: 'rgba(100, 116, 139, 0.5)',
    badgeClass: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  },
  Other: {
    hex: '#64748B',
    bgTint: 'rgba(100, 116, 139, 0.16)',
    borderTint: 'rgba(100, 116, 139, 0.5)',
    badgeClass: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  },
};

export function getCategoryStyle(category: NodeCategory): CategoryStyle {
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Estimator;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatValuePreview(value: unknown, maxLen = 256): { text: string; truncated: boolean; full: string } {
  let full: string;
  if (value === null || value === undefined) {
    full = 'null';
  } else if (typeof value === 'string') {
    full = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    full = String(value);
  } else {
    try {
      full = JSON.stringify(value);
    } catch {
      full = String(value);
    }
  }

  if (full.length > maxLen) {
    return {
      text: `${full.slice(0, maxLen)}…`,
      truncated: true,
      full,
    };
  }
  return { text: full, truncated: false, full };
}

function gaussianRandom(mean = 0, std = 1): number {
  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * std;
}

/**
 * Generates plausible feature values by inspecting learned weights (e.g. mean_, scale_, categories_)
 * when available in the model, falling back to N(0, 1) or realistic text/category values.
 */
export function generatePlausibleFeatureValues(model: InspectedModel): Record<string, string> {
  const { formSchema, weights, inputLayout } = model;
  const result: Record<string, string> = {};

  if (inputLayout === 'text') {
    const samples = [
      'great prediction score and fast inference on test dataset',
      'model accuracy is high and pipeline converged cleanly',
      'crash error failed to load corrupted pickle file',
      'invalid shape mismatch exception during inference',
    ];
    result.text = samples[Math.floor(Math.random() * samples.length)];
    return result;
  }

  const meanWeight = weights.find((w) => w.name.endsWith('mean_') && Array.isArray(w.values));
  const scaleWeight = weights.find((w) => w.name.endsWith('scale_') && Array.isArray(w.values));
  const catWeight = weights.find((w) => w.name.endsWith('categories_') && Array.isArray(w.values));

  const means = Array.isArray(meanWeight?.values) ? (meanWeight.values as number[]) : null;
  const scales = Array.isArray(scaleWeight?.values) ? (scaleWeight.values as number[]) : null;
  const categoriesList = Array.isArray(catWeight?.values) ? (catWeight.values as unknown[][]) : null;

  let numIdx = 0;
  let catIdx = 0;

  for (const field of formSchema.featureFields) {
    if (field.inputType === 'text') {
      if (categoriesList && catIdx < categoriesList.length && Array.isArray(categoriesList[catIdx]) && categoriesList[catIdx].length > 0) {
        const choices = categoriesList[catIdx];
        result[field.name] = String(choices[Math.floor(Math.random() * choices.length)]);
        catIdx++;
      } else {
        const nameLower = field.name.toLowerCase();
        if (nameLower.includes('sex') || nameLower.includes('gender')) {
          result[field.name] = Math.random() > 0.5 ? 'female' : 'male';
        } else if (nameLower.includes('embark')) {
          const opts = ['S', 'C', 'Q'];
          result[field.name] = opts[Math.floor(Math.random() * opts.length)];
        } else {
          result[field.name] = 'sample_category';
        }
      }
    } else {
      const idx = field.index ?? numIdx;
      const mu = means && typeof means[idx] === 'number' ? means[idx] : 0;
      const sigma = scales && typeof scales[idx] === 'number' && scales[idx] > 0 ? scales[idx] * 0.5 : 1;
      const val = gaussianRandom(mu, sigma);
      result[field.name] = Number.isFinite(val) ? val.toFixed(2) : '0';
      numIdx++;
    }
  }

  return result;
}
