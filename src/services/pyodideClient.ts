import type {
  DemoModelKind,
  InferencePayload,
  LoadModelResponse,
  PyodideProgress,
  RunInferenceResponse,
} from '../types/model';

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type ProgressListener = (progress: PyodideProgress) => void;

class PyodideClient {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingCall>();
  private progressListeners = new Set<ProgressListener>();
  private latestProgress: PyodideProgress = {
    stage: 'idle',
    message: 'En attente de démarrage…',
    percent: 0,
  };
  private seq = 0;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(
      new URL('../workers/pyodide.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'PROGRESS' && data.progress) {
        this.latestProgress = data.progress as PyodideProgress;
        this.progressListeners.forEach((fn) => fn(this.latestProgress));
        return;
      }

      const requestId = data?.requestId as string | undefined;
      if (!requestId) return;
      const call = this.pending.get(requestId);
      if (!call) return;
      this.pending.delete(requestId);

      if (data.ok) {
        call.resolve(data.result);
      } else {
        call.reject(new Error(data.error || 'Unknown Pyodide worker error'));
      }
    };

    worker.onerror = (err) => {
      const message = err.message || 'Worker crashed';
      this.latestProgress = {
        stage: 'error',
        message: `Erreur Worker : ${message}`,
        percent: 0,
      };
      this.progressListeners.forEach((fn) => fn(this.latestProgress));
      this.pending.forEach((call) => call.reject(new Error(message)));
      this.pending.clear();
    };

    this.worker = worker;
    return worker;
  }

  private call<T>(type: string, payload?: unknown, transfer?: Transferable[]): Promise<T> {
    const worker = this.ensureWorker();
    const requestId = `req_${++this.seq}_${Date.now()}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      if (transfer && transfer.length > 0) {
        worker.postMessage({ requestId, type, payload }, transfer);
      } else {
        worker.postMessage({ requestId, type, payload });
      }
    });
  }

  public onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    listener(this.latestProgress);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  public async init(): Promise<void> {
    await this.call<{ ok: boolean }>('INIT');
  }

  public async loadModelBytes(filename: string, buffer: ArrayBuffer): Promise<LoadModelResponse> {
    if (buffer.byteLength === 0) {
      return {
        ok: false,
        error: { code: 'invalid_input', message: 'Le fichier sélectionné est vide.' },
      };
    }
    return this.call<LoadModelResponse>('LOAD_MODEL_BYTES', { filename, buffer }, [buffer]);
  }

  public async loadDemoModel(kind: DemoModelKind): Promise<LoadModelResponse> {
    return this.call<LoadModelResponse>('LOAD_DEMO_MODEL', { kind });
  }

  public async runInference(modelId: string, payload: InferencePayload): Promise<RunInferenceResponse> {
    return this.call<RunInferenceResponse>('RUN_INFERENCE', { modelId, payload });
  }

  public async unloadModel(modelId: string): Promise<{ ok: boolean; removed: boolean; loadedCount: number }> {
    return this.call('UNLOAD_MODEL', { modelId });
  }

  public async installPackage(packageName: string): Promise<{ ok: boolean; packageName: string; error?: string }> {
    return this.call('INSTALL_PACKAGE', { packageName });
  }
}

export const pyodideClient = new PyodideClient();
