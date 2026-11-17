import React from 'react';
import {
  Activity,
  AlertTriangle,
  Cpu,
  Database,
  Languages,
  Moon,
  Network,
  Play,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { InspectedModel, PyodideProgress } from '../types/model';

export type StudioView = 'inspector' | 'inference' | 'metadata';

interface TopBarProps {
  models: InspectedModel[];
  activeModelId: string | null;
  activeView: StudioView;
  theme: 'dark' | 'light';
  pyodideProgress: PyodideProgress;
  onSelectModel: (id: string) => void;
  onCloseModel: (id: string) => void;
  onSelectView: (view: StudioView) => void;
  onToggleTheme: () => void;
  onOpenModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  models,
  activeModelId,
  activeView,
  theme,
  pyodideProgress,
  onSelectModel,
  onCloseModel,
  onSelectView,
  onToggleTheme,
  onOpenModal,
}) => {
  const { locale, setLocale, t } = useI18n();
  const activeModel = models.find((m) => m.id === activeModelId) ?? null;
  const isReady = pyodideProgress.stage === 'ready';
  const isError = pyodideProgress.stage === 'error';
  const progressTitle = pyodideProgress.detail
    ? t(pyodideProgress.key, { message: pyodideProgress.detail })
    : t(pyodideProgress.key);

  const hasVersionMismatch = Boolean(
    activeModel?.info.trainedWithSklearn &&
      activeModel?.info.runtimeSklearn &&
      activeModel.info.trainedWithSklearn !== activeModel.info.runtimeSklearn
  );

  return (
    <header className="h-[52px] shrink-0 studio-panel border-t-0 border-x-0 px-3 flex items-center justify-between gap-3 z-20">
      {/* Left: Brand + Pyodide status */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Cpu className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight">SklearnStudio</span>
        </div>

        {/* Pyodide status pill */}
        <div
          className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium studio-elevated shrink-0"
          title={progressTitle}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isReady
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                : isError
                  ? 'bg-rose-500'
                  : 'bg-sky-400 animate-pulse'
            }`}
          />
          <span className="text-[var(--text-secondary)]">
            {isReady ? t('progress.ready') : progressTitle}
          </span>
          {!isReady && !isError && pyodideProgress.percent > 0 && (
            <span className="font-mono text-sky-400">{pyodideProgress.percent}%</span>
          )}
        </div>

        {/* Model tabs */}
        {models.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto max-w-[34vw] pl-2 border-l border-[var(--border-subtle)]">
            {models.map((m) => {
              const active = m.id === activeModelId;
              return (
                <div
                  key={m.id}
                  className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer transition-colors shrink-0 ${
                    active
                      ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] border border-transparent'
                  }`}
                  onClick={() => onSelectModel(m.id)}
                  title={m.filename}
                >
                  <span className="font-mono truncate max-w-[140px]">{m.filename}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseModel(m.id);
                    }}
                    className="opacity-60 hover:opacity-100 rounded p-0.5 hover:bg-slate-500/20"
                    title={t('topbar.closeTab')}
                    aria-label={t('topbar.closeModel', { name: m.filename })}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Center: View switcher when a model is active */}
      {activeModel && (
        <nav className="flex items-center gap-1 p-0.5 rounded-lg studio-elevated shrink-0">
          <button
            type="button"
            onClick={() => onSelectView('inspector')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeView === 'inspector'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('topbar.inspector')}</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectView('inference')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeView === 'inference'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('topbar.inference')}</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectView('metadata')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeView === 'metadata'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('topbar.metadata')}</span>
          </button>
        </nav>
      )}

      {/* Right: Version warning + Theme + Open */}
      <div className="flex items-center gap-2 shrink-0">
        {hasVersionMismatch && activeModel && (
          <div
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-medium"
            title={t('topbar.versionMismatchTitle', {
              trained: activeModel.info.trainedWithSklearn ?? '',
              runtime: activeModel.info.runtimeSklearn ?? '',
            })}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {t('topbar.trained')} v{activeModel.info.trainedWithSklearn} • Runtime v
              {activeModel.info.runtimeSklearn}
            </span>
          </div>
        )}

        {activeModel && activeModel.info.warnings.length > 0 && !hasVersionMismatch && (
          <div
            className="hidden xl:flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[11px]"
            title={activeModel.info.warnings.join('\n')}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{t('topbar.warningsShort', { count: activeModel.info.warnings.length })}</span>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleTheme}
          className="p-1.5 rounded-lg studio-elevated text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title={theme === 'dark' ? t('topbar.themeLight') : t('topbar.themeDark')}
          aria-label={t('topbar.toggleTheme')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg studio-elevated text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold transition-colors"
          title={t('topbar.language')}
          aria-label={t('topbar.language')}
        >
          <Languages className="w-3.5 h-3.5" />
          <span className="font-mono uppercase">{locale}</span>
        </button>

        <button
          type="button"
          onClick={onOpenModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('topbar.openModel')}</span>
        </button>
      </div>
    </header>
  );
};
