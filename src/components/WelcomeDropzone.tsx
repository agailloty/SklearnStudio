import React, { useRef, useState } from 'react';
import {
  FileCode2,
  Lock,
  ShieldAlert,
  Sparkles,
  Table2,
  Type,
  UploadCloud,
  X,
} from 'lucide-react';
import type { DemoModelKind, PyodideProgress } from '../types/model';

interface WelcomeDropzoneProps {
  isModal?: boolean;
  isLoading: boolean;
  pyodideProgress: PyodideProgress;
  trustedSession: boolean;
  onTrustSession: () => void;
  onLoadFile: (file: File) => void;
  onLoadDemo: (kind: DemoModelKind) => void;
  onCloseModal?: () => void;
}

const ACCEPTED_EXTENSIONS = ['.joblib', '.pkl', '.pickle', '.gz', '.bz2', '.xz', '.lzma'];

const DEMO_CARDS: Array<{
  kind: DemoModelKind;
  title: string;
  subtitle: string;
  layoutBadge: string;
  icon: React.ReactNode;
  accent: string;
}> = [
  {
    kind: 'iris_pipeline',
    title: 'Iris Classifier Pipeline',
    subtitle: 'StandardScaler → LogisticRegression (4 variables numériques nommées)',
    layoutBadge: 'matrix',
    icon: <Sparkles className="w-4 h-4 text-emerald-400" />,
    accent: 'hover:border-emerald-500/40',
  },
  {
    kind: 'titanic_columntransformer',
    title: 'Mixed Tabular Pipeline',
    subtitle: 'ColumnTransformer (num + cat OneHotEncoder) → RandomForestClassifier',
    layoutBadge: 'columns',
    icon: <Table2 className="w-4 h-4 text-amber-400" />,
    accent: 'hover:border-amber-500/40',
  },
  {
    kind: 'text_tfidf_classifier',
    title: 'Sentiment Text Classifier',
    subtitle: 'TfidfVectorizer → MultinomialNB (classification de texte brut)',
    layoutBadge: 'text',
    icon: <Type className="w-4 h-4 text-sky-400" />,
    accent: 'hover:border-sky-500/40',
  },
];

export const WelcomeDropzone: React.FC<WelcomeDropzoneProps> = ({
  isModal = false,
  isLoading,
  pyodideProgress,
  trustedSession,
  onTrustSession,
  onLoadFile,
  onLoadDemo,
  onCloseModal,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handleFileSelection = (file: File | undefined) => {
    if (!file) return;
    if (trustedSession) {
      onLoadFile(file);
    } else {
      setPendingFile(file);
    }
  };

  const confirmPendingFile = (trustForSession: boolean) => {
    if (!pendingFile) return;
    if (trustForSession) {
      onTrustSession();
    }
    const file = pendingFile;
    setPendingFile(null);
    onLoadFile(file);
  };

  const content = (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-medium">
            <Lock className="w-3.5 h-3.5" />
            <span>Vos modèles ne quittent jamais votre ordinateur • Exécution 100% WASM</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Inspecteur & Playground <span className="text-sky-400">scikit-learn</span>
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Explorez le graphe DAG, les hyperparamètres, les attributs appris et testez l’inférence
            en ligne directement dans votre navigateur via Pyodide.
          </p>
        </div>

        {isModal && onCloseModal && (
          <button
            type="button"
            onClick={onCloseModal}
            className="p-2 rounded-lg studio-elevated text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Pyodide bootstrap progress if not ready */}
      {pyodideProgress.stage !== 'ready' && (
        <div className="studio-panel rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-secondary)] font-medium">
              {pyodideProgress.message}
            </span>
            <span className="font-mono text-sky-400">{pyodideProgress.percent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800/60 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${Math.max(5, pyodideProgress.percent)}%` }}
            />
          </div>
        </div>
      )}

      {/* Pickle security confirmation banner */}
      {pendingFile && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-sm text-amber-300">
                Confirmation de sécurité Pickle / Joblib
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Les fichiers <code className="font-mono">.joblib</code> et{' '}
                <code className="font-mono">.pkl</code> peuvent exécuter du code Python lors de la
                désérialisation. Tout s’exécute localement dans le sandbox WebAssembly de votre
                navigateur sans aucun envoi sur Internet. Voulez-vous charger{' '}
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {pendingFile.name}
                </span>{' '}
                ?
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="px-3 py-1.5 rounded-lg studio-elevated text-xs font-medium hover:opacity-90"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => confirmPendingFile(false)}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-medium hover:bg-amber-500/30"
            >
              Charger ce fichier uniquement
            </button>
            <button
              type="button"
              onClick={() => confirmPendingFile(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400"
            >
              Faire confiance pour cette session
            </button>
          </div>
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFileSelection(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-sky-400 bg-sky-500/10 scale-[1.01]'
            : 'border-[var(--border-strong)] studio-panel hover:border-sky-500/50 hover:bg-sky-500/[0.03]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            handleFileSelection(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              {isLoading
                ? 'Chargement et introspection du modèle en cours…'
                : 'Glissez-déposez un modèle scikit-learn ici, ou cliquez pour parcourir'}
            </p>
            <p className="text-xs text-[var(--text-muted)] font-mono">
              Formats supportés : .joblib, .pkl, .pickle, .gz, .bz2, .xz, .lzma
            </p>
          </div>
        </div>
      </div>

      {/* Demo models */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          <FileCode2 className="w-3.5 h-3.5" />
          <span>Modèles de démonstration instantanés</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {DEMO_CARDS.map((card) => (
            <button
              key={card.kind}
              type="button"
              disabled={isLoading}
              onClick={() => onLoadDemo(card.kind)}
              className={`text-left studio-panel rounded-xl p-4 transition-all hover:-translate-y-0.5 disabled:opacity-50 ${card.accent}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="p-1.5 rounded-lg studio-elevated">{card.icon}</div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full studio-elevated text-[var(--text-muted)]">
                  layout: {card.layoutBadge}
                </span>
              </div>
              <div className="font-semibold text-sm mb-1">{card.title}</div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {card.subtitle}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-4xl rounded-2xl studio-panel shadow-2xl">{content}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex items-center justify-center py-8">{content}</div>
  );
};
