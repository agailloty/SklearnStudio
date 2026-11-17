import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  DownloadCloud,
  GitFork,
  Layers,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GraphCanvas } from './components/GraphCanvas';
import { InferencePlayground } from './components/InferencePlayground';
import { InferenceResults } from './components/InferenceResults';
import { MetadataWeightsView } from './components/MetadataWeightsView';
import { NodeInspectorPanel } from './components/NodeInspectorPanel';
import { StructureTree } from './components/StructureTree';
import { type StudioView, TopBar } from './components/TopBar';
import { WelcomeDropzone } from './components/WelcomeDropzone';
import { useI18n } from './i18n';
import { pyodideClient } from './services/pyodideClient';
import type {
  DemoModelKind,
  EngineErrorPayload,
  InferenceHistoryItem,
  InferenceInputMode,
  InferencePayload,
  InferenceResult,
  InspectedModel,
  PyodideProgress,
} from './types/model';

interface PendingRetry {
  kind: 'file';
  file: File;
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('sklearnstudio-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const { locale, localeTag, t } = useI18n();

  const [pyodideProgress, setPyodideProgress] = useState<PyodideProgress>({
    stage: 'idle',
    key: 'progress.idle',
    percent: 0,
  });

  const [models, setModels] = useState<InspectedModel[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<StudioView>('inspector');
  const [inspectorMode, setInspectorMode] = useState<'graph' | 'tree'>('graph');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [trustedSession, setTrustedSession] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadError, setLoadError] = useState<EngineErrorPayload | null>(null);
  const [pendingRetry, setPendingRetry] = useState<PendingRetry | null>(null);
  const [isInstallingPkg, setIsInstallingPkg] = useState(false);
  const [installFallbackMsg, setInstallFallbackMsg] = useState<string | null>(null);

  const [isRunningInference, setIsRunningInference] = useState(false);
  const [inferenceErrors, setInferenceErrors] = useState<Record<string, string | null>>({});
  const [inferenceResults, setInferenceResults] = useState<Record<string, InferenceResult | null>>(
    {}
  );
  const [inferenceHistory, setInferenceHistory] = useState<
    Record<string, InferenceHistoryItem[]>
  >({});
  const [replayPayload, setReplayPayload] = useState<{
    key: string;
    mode: InferenceInputMode;
    payload: InferencePayload;
  } | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('sklearnstudio-theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsub = pyodideClient.onProgress(setPyodideProgress);
    pyodideClient.init().catch(() => {
      // Progress listener already captures error state
    });
    return unsub;
  }, []);

  useEffect(() => {
    pyodideClient.setLocale(locale);
  }, [locale]);

  const activeModel = models.find((m) => m.id === activeModelId) ?? null;

  const activateModel = useCallback((model: InspectedModel) => {
    setModels((prev) => [...prev.filter((m) => m.id !== model.id), model]);
    setActiveModelId(model.id);
    setSelectedNodeId(model.graph.nodes[0]?.id ?? null);
    setSearchQuery('');
    setActiveCategory('All');
    setInspectorMode('graph');
    setActiveView('inspector');
    setOpenModalVisible(false);
    setLoadError(null);
    setPendingRetry(null);
    setInstallFallbackMsg(null);
  }, []);

  const handleLoadFile = async (file: File) => {
    setIsLoadingModel(true);
    setLoadError(null);
    setInstallFallbackMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      const res = await pyodideClient.loadModelBytes(file.name, buffer);
      if (res.ok) {
        activateModel(res.model);
      } else {
        setLoadError(res.error);
        if (res.error.code === 'missing_module' && res.error.missingPackage) {
          setPendingRetry({ kind: 'file', file });
        }
      }
    } catch (err) {
      setLoadError({
        code: 'worker_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoadingModel(false);
    }
  };

  const handleLoadDemo = async (kind: DemoModelKind) => {
    setIsLoadingModel(true);
    setLoadError(null);
    setInstallFallbackMsg(null);
    try {
      const res = await pyodideClient.loadDemoModel(kind);
      if (res.ok) {
        activateModel(res.model);
      } else {
        setLoadError(res.error);
      }
    } catch (err) {
      setLoadError({
        code: 'worker_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoadingModel(false);
    }
  };

  const handleInstallAndRetry = async () => {
    const pkg = loadError?.missingPackage;
    if (!pkg) return;
    setIsInstallingPkg(true);
    setInstallFallbackMsg(null);
    try {
      const res = await pyodideClient.installPackage(pkg);
      if (!res.ok) {
        setInstallFallbackMsg(
          t('app.installFailed', {
            pkg,
            error:
              res.error === 'EMPTY_PACKAGE_NAME'
                ? t('app.emptyPackageName')
                : res.error ?? t('app.purePythonWheelMissing'),
          })
        );
        return;
      }
      if (pendingRetry?.kind === 'file') {
        await handleLoadFile(pendingRetry.file);
      }
    } finally {
      setIsInstallingPkg(false);
    }
  };

  const handleCloseModel = async (id: string) => {
    setModels((prev) => {
      const next = prev.filter((m) => m.id !== id);
      if (activeModelId === id) {
        const nextActive = next[next.length - 1] ?? null;
        setActiveModelId(nextActive?.id ?? null);
        setSelectedNodeId(nextActive?.graph.nodes[0]?.id ?? null);
      }
      return next;
    });
    setInferenceResults((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setInferenceErrors((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setInferenceHistory((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    try {
      await pyodideClient.unloadModel(id);
    } catch {
      // Ignore worker unload errors on cleanup
    }
  };

  const handleRunInference = async (mode: InferenceInputMode, payload: InferencePayload) => {
    if (!activeModel) return;
    const modelId = activeModel.id;
    setIsRunningInference(true);
    setInferenceErrors((prev) => ({ ...prev, [modelId]: null }));
    try {
      const res = await pyodideClient.runInference(modelId, payload);
      if (res.ok) {
        setInferenceResults((prev) => ({ ...prev, [modelId]: res.result }));
        const historyItem: InferenceHistoryItem = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toLocaleTimeString(localeTag),
          mode,
          method: payload.method ?? 'all',
          payload,
          result: res.result,
        };
        setInferenceHistory((prev) => ({
          ...prev,
          [modelId]: [historyItem, ...(prev[modelId] ?? [])].slice(0, 10),
        }));
      } else {
        setInferenceErrors((prev) => ({ ...prev, [modelId]: res.error.message }));
      }
    } catch (err) {
      setInferenceErrors((prev) => ({
        ...prev,
        [modelId]: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setIsRunningInference(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <TopBar
        models={models}
        activeModelId={activeModelId}
        activeView={activeView}
        theme={theme}
        pyodideProgress={pyodideProgress}
        onSelectModel={(id) => {
          setActiveModelId(id);
          const found = models.find((m) => m.id === id);
          setSelectedNodeId(found?.graph.nodes[0]?.id ?? null);
          setSearchQuery('');
          setActiveCategory('All');
        }}
        onCloseModel={handleCloseModel}
        onSelectView={setActiveView}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onOpenModal={() => setOpenModalVisible(true)}
      />

      {/* Error / Missing Package Banner */}
      {loadError && (
        <div className="mx-4 mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
          <div className="flex items-start gap-2.5 text-xs max-w-3xl">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-rose-300">
                {loadError.code === 'missing_module' && loadError.missingPackage
                  ? t('app.missingDependency', { pkg: loadError.missingPackage })
                  : t('app.loadFailed')}
              </div>
              <p className="text-[var(--text-secondary)]">
                {loadError.messageKey ? t(loadError.messageKey) : loadError.message}
              </p>
              {installFallbackMsg && (
                <p className="text-amber-300 font-medium">{installFallbackMsg}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {loadError.code === 'missing_module' && loadError.missingPackage && (
              <button
                type="button"
                disabled={isInstallingPkg}
                onClick={handleInstallAndRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs"
              >
                {isInstallingPkg ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <DownloadCloud className="w-3.5 h-3.5" />
                )}
                <span>
                  {isInstallingPkg
                    ? t('app.installing', { pkg: loadError.missingPackage })
                    : t('app.installAndRetry', { pkg: loadError.missingPackage })}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setInstallFallbackMsg(null);
              }}
              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-300"
              aria-label={t('app.dismissAlert')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <ErrorBoundary onReset={() => setActiveView('inspector')}>
      {!activeModel ? (
        <WelcomeDropzone
          isLoading={isLoadingModel}
          pyodideProgress={pyodideProgress}
          trustedSession={trustedSession}
          onTrustSession={() => setTrustedSession(true)}
          onLoadFile={handleLoadFile}
          onLoadDemo={handleLoadDemo}
        />
      ) : activeView === 'inspector' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* KPI & Filter Toolbar */}
          <div className="studio-panel border-t-0 border-x-0 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="px-2 py-1 rounded-md studio-elevated font-mono">
                {t('app.nodes')}{' '}
                <strong>{activeModel.graph.statistics.nodeCount.toLocaleString(localeTag)}</strong>
              </span>
              <span className="px-2 py-1 rounded-md studio-elevated font-mono">
                {t('app.edges')}{' '}
                <strong>{activeModel.graph.statistics.edgeCount.toLocaleString(localeTag)}</strong>
              </span>
              <span className="px-2 py-1 rounded-md studio-elevated font-mono">
                {t('app.parameters')}{' '}
                <strong>
                  {activeModel.graph.statistics.totalParameters.toLocaleString(localeTag)}
                </strong>
              </span>
              {activeModel.info.runtimeSklearn && (
                <span className="hidden md:inline px-2 py-1 rounded-md studio-elevated font-mono">
                  sklearn <strong>v{activeModel.info.runtimeSklearn}</strong>
                </span>
              )}
              {activeModel.info.classes && (
                <span className="hidden lg:inline px-2 py-1 rounded-md studio-elevated font-mono">
                  {t('app.classes')}{' '}
                  <strong>{activeModel.info.classes.length}</strong>
                </span>
              )}
              <span className="hidden xl:inline px-2 py-1 rounded-md studio-elevated font-mono text-[var(--text-muted)]">
                {activeModel.info.methods.join(' • ')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {inspectorMode === 'graph' && (
                <>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('app.searchNode')}
                      className="pl-8 pr-3 py-1 rounded-lg studio-elevated text-xs w-44 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto">
                    {activeModel.graph.categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
                          activeCategory === cat
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'studio-elevated text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="flex items-center gap-1 p-0.5 rounded-lg studio-elevated text-xs">
                <button
                  type="button"
                  onClick={() => setInspectorMode('graph')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium ${
                    inspectorMode === 'graph'
                      ? 'bg-indigo-500 text-white'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>{t('app.dagGraph')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorMode('tree')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium ${
                    inspectorMode === 'tree'
                      ? 'bg-indigo-500 text-white'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{t('app.structureTree')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Graph/Tree + Side Inspector */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            <div className="flex-1 min-h-[320px] overflow-hidden relative">
              {inspectorMode === 'graph' ? (
                <GraphCanvas
                  graph={activeModel.graph}
                  selectedNodeId={selectedNodeId}
                  searchQuery={searchQuery}
                  activeCategory={activeCategory}
                  onSelectNode={setSelectedNodeId}
                />
              ) : (
                <StructureTree
                  root={activeModel.structure}
                  selectedNodeId={selectedNodeId}
                  onSelectGraphNode={(nodeId, switchToGraph) => {
                    setSelectedNodeId(nodeId);
                    if (switchToGraph) setInspectorMode('graph');
                  }}
                />
              )}
            </div>

            <NodeInspectorPanel
              node={activeModel.graph.nodes.find((n) => n.id === selectedNodeId) ?? null}
              structureRoot={activeModel.structure}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        </div>
      ) : activeView === 'inference' ? (
        <div className="flex-1 overflow-hidden p-4">
          <div className="h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InferencePlayground
              model={activeModel}
              isRunning={isRunningInference}
              errorMessage={inferenceErrors[activeModel.id] ?? null}
              externalPayload={replayPayload}
              onRunInference={handleRunInference}
            />
            <InferenceResults
              result={inferenceResults[activeModel.id] ?? null}
              history={inferenceHistory[activeModel.id] ?? []}
              onReplayHistory={(item) =>
                setReplayPayload({
                  key: `${item.id}_${Date.now()}`,
                  mode: item.mode,
                  payload: item.payload,
                })
              }
            />
          </div>
        </div>
      ) : (
        <MetadataWeightsView model={activeModel} />
      )}
      </ErrorBoundary>

      {openModalVisible && (
        <WelcomeDropzone
          isModal
          isLoading={isLoadingModel}
          pyodideProgress={pyodideProgress}
          trustedSession={trustedSession}
          onTrustSession={() => setTrustedSession(true)}
          onLoadFile={handleLoadFile}
          onLoadDemo={handleLoadDemo}
          onCloseModal={() => setOpenModalVisible(false)}
        />
      )}
    </div>
  );
};

export default App;
