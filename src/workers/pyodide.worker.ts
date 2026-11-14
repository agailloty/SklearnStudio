/// <reference lib="webworker" />
import engineSource from '../../core/sklearn_engine.py?raw';
import type { DemoModelKind, InferencePayload, PyodideProgress } from '../types/model';

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';
const PYODIDE_MJS_URL = `${PYODIDE_INDEX_URL}pyodide.mjs`;

interface PyodideInstance {
  FS: {
    writeFile: (path: string, data: string | Uint8Array) => void;
  };
  globals: {
    set: (name: string, value: unknown) => void;
    delete: (name: string) => void;
  };
  loadPackage: (packages: string | string[]) => Promise<void>;
  runPython: (code: string) => string;
  runPythonAsync: (code: string) => Promise<string>;
}

type WorkerRequest =
  | { requestId: string; type: 'INIT' }
  | { requestId: string; type: 'LOAD_MODEL_BYTES'; payload: { filename: string; buffer: ArrayBuffer } }
  | { requestId: string; type: 'LOAD_DEMO_MODEL'; payload: { kind: DemoModelKind } }
  | { requestId: string; type: 'RUN_INFERENCE'; payload: { modelId: string; payload: InferencePayload } }
  | { requestId: string; type: 'UNLOAD_MODEL'; payload: { modelId: string } }
  | { requestId: string; type: 'INSTALL_PACKAGE'; payload: { packageName: string } };

let pyodide: PyodideInstance | null = null;
let initPromise: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function postProgress(progress: PyodideProgress): void {
  self.postMessage({ type: 'PROGRESS', progress });
}

async function ensureInitialized(): Promise<PyodideInstance> {
  if (pyodide) return pyodide;
  if (initPromise) {
    await initPromise;
    if (!pyodide) throw new Error('Pyodide initialization failed.');
    return pyodide;
  }

  initPromise = (async () => {
    try {
      postProgress({
        stage: 'wasm',
        message: 'Téléchargement du noyau WebAssembly Pyodide…',
        percent: 20,
      });

      const pyodideModule = (await import(/* @vite-ignore */ PYODIDE_MJS_URL)) as {
        loadPyodide: (opts: { indexURL: string }) => Promise<PyodideInstance>;
      };

      const instance = await pyodideModule.loadPyodide({
        indexURL: PYODIDE_INDEX_URL,
      });

      postProgress({
        stage: 'packages',
        message: 'Chargement des paquets Python (numpy, scipy, scikit-learn, pandas, joblib)…',
        percent: 55,
      });

      await instance.loadPackage(['micropip', 'numpy', 'scipy', 'scikit-learn', 'pandas', 'joblib']);

      postProgress({
        stage: 'engine',
        message: 'Montage de core/sklearn_engine.py dans le FS Pyodide…',
        percent: 88,
      });

      instance.FS.writeFile('/home/pyodide/sklearn_engine.py', engineSource);
      instance.runPython(`
import sys, json
if "/home/pyodide" not in sys.path:
    sys.path.insert(0, "/home/pyodide")
import sklearn_engine
`);

      pyodide = instance;
      postProgress({
        stage: 'ready',
        message: 'Pyodide prêt (100% local)',
        percent: 100,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      postProgress({
        stage: 'error',
        message: `Échec d'initialisation Pyodide : ${msg}`,
        percent: 0,
      });
      initPromise = null;
      throw err;
    }
  })();

  await initPromise;
  if (!pyodide) throw new Error('Pyodide failed to initialize.');
  return pyodide;
}

async function handleRequest(req: WorkerRequest): Promise<unknown> {
  switch (req.type) {
    case 'INIT': {
      await ensureInitialized();
      return { ok: true };
    }

    case 'LOAD_MODEL_BYTES': {
      const py = await ensureInitialized();
      const { filename, buffer } = req.payload;
      py.globals.set('_tmp_bytes', new Uint8Array(buffer));
      py.globals.set('_tmp_filename', filename);
      try {
        const rawJson = py.runPython(
          'sklearn_engine.load_and_inspect_bytes_json(_tmp_bytes, _tmp_filename)'
        );
        return JSON.parse(rawJson);
      } finally {
        py.globals.delete('_tmp_bytes');
        py.globals.delete('_tmp_filename');
      }
    }

    case 'LOAD_DEMO_MODEL': {
      const py = await ensureInitialized();
      py.globals.set('_tmp_kind', req.payload.kind);
      try {
        const rawJson = py.runPython('sklearn_engine.load_demo_model_json(_tmp_kind)');
        return JSON.parse(rawJson);
      } finally {
        py.globals.delete('_tmp_kind');
      }
    }

    case 'RUN_INFERENCE': {
      const py = await ensureInitialized();
      py.globals.set('_tmp_model_id', req.payload.modelId);
      py.globals.set('_tmp_payload_json', JSON.stringify(req.payload.payload ?? {}));
      try {
        const rawJson = py.runPython(
          'sklearn_engine.run_inference_json(_tmp_model_id, _tmp_payload_json)'
        );
        return JSON.parse(rawJson);
      } finally {
        py.globals.delete('_tmp_model_id');
        py.globals.delete('_tmp_payload_json');
      }
    }

    case 'UNLOAD_MODEL': {
      const py = await ensureInitialized();
      py.globals.set('_tmp_model_id', req.payload.modelId);
      try {
        const rawJson = py.runPython('json.dumps(sklearn_engine.unload_model(_tmp_model_id))');
        return JSON.parse(rawJson);
      } finally {
        py.globals.delete('_tmp_model_id');
      }
    }

    case 'INSTALL_PACKAGE': {
      const py = await ensureInitialized();
      const pkg = req.payload.packageName.trim();
      if (!pkg) {
        return { ok: false, error: 'Nom de package vide.' };
      }
      await py.loadPackage('micropip');
      py.globals.set('_tmp_pkg', pkg);
      try {
        await py.runPythonAsync(`
import micropip
await micropip.install(_tmp_pkg)
`);
        return { ok: true, packageName: pkg };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, packageName: pkg, error: message };
      } finally {
        py.globals.delete('_tmp_pkg');
      }
    }
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  queue = queue.then(async () => {
    try {
      const result = await handleRequest(req);
      self.postMessage({ requestId: req.requestId, ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ requestId: req.requestId, ok: false, error: message });
    }
  });
};
