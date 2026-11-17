/**
 * English message catalog (reference locale).
 * Keys must stay aligned with `fr.ts`.
 */
export const en = {
  // Common
  'common.close': 'Close',
  'common.prev': 'Previous',
  'common.next': 'Next',

  // Pyodide bootstrap progress
  'progress.idle': 'Waiting to start…',
  'progress.loadingPython': 'Loading Python environment…',
  'progress.loadingPackages':
    'Loading Python packages (numpy, scipy, scikit-learn, pandas, joblib, skops)…',
  'progress.installingSkops': 'Installing skops via micropip…',
  'progress.initEngine': 'Initializing analysis engine…',
  'progress.ready': 'Environment ready',
  'progress.workerError': 'Worker error: {message}',
  'progress.initFailed': 'Pyodide initialization failed: {message}',

  // Top bar
  'topbar.closeTab': 'Close and free memory',
  'topbar.closeModel': 'Close {name}',
  'topbar.inspector': 'Inspector',
  'topbar.inference': 'Online inference',
  'topbar.metadata': 'Metadata & Weights',
  'topbar.versionMismatchTitle':
    'Model trained with scikit-learn {trained}, inspected with {runtime}',
  'topbar.trained': 'Trained',
  'topbar.warningsShort': '{count} warn.',
  'topbar.themeLight': 'Switch to light theme',
  'topbar.themeDark': 'Switch to dark theme',
  'topbar.toggleTheme': 'Toggle theme',
  'topbar.openModel': 'Open a model',
  'topbar.language': 'Language',

  // App shell (banners, KPI toolbar)
  'app.missingDependency': 'Missing Python dependency: {pkg}',
  'app.loadFailed': 'Unable to load the model',
  'app.dismissAlert': 'Dismiss alert',
  'app.installing': 'Installing {pkg}…',
  'app.installAndRetry': 'Install "{pkg}" via micropip and retry',
  'app.installFailed':
    'Unable to install "{pkg}" via micropip ({error}). Some C/C++ compiled packages are not available in Pyodide.',
  'app.emptyFile': 'The selected file is empty.',
  'app.emptyPackageName': 'empty package name',
  'app.purePythonWheelMissing': 'pure-Python wheel not found',
  'app.nodes': 'Nodes:',
  'app.edges': 'Edges:',
  'app.parameters': 'Parameters:',
  'app.classes': 'Classes:',
  'app.searchNode': 'Search a node…',
  'app.dagGraph': 'DAG graph',
  'app.structureTree': 'Structure tree',

  // Welcome dropzone
  'welcome.localBadge': 'Local processing in the browser — no file sent to any server',
  'welcome.title': 'Inspector & Playground',
  'welcome.subtitle':
    'Explore the DAG graph, hyperparameters, learned attributes, and test online inference directly in your browser.',
  'welcome.securityTitle': 'Pickle / Joblib fallback format — Security & Compatibility',
  'welcome.securityBody':
    'The .joblib and .pkl files can execute Python code when opened and may suffer version incompatibilities between the training environment and Pyodide (e.g. removed attributes or Cython structures). Prefer the .skops format whenever possible. Everything runs locally in the WebAssembly sandbox without any upload to the Internet. Load {file}?',
  'welcome.cancel': 'Cancel',
  'welcome.loadThisFile': 'Load this file only',
  'welcome.trustSession': 'Trust for this session',
  'welcome.loadingModel': 'Loading and inspecting the model…',
  'welcome.dropzone': 'Drag and drop a scikit-learn model here, or click to browse',
  'welcome.recommended': 'Recommended: .skops',
  'welcome.fallback': 'Fallback: .joblib, .pkl, .pickle, .gz, .bz2, .xz, .lzma',
  'welcome.note':
    'Note: pickle/joblib files may hit compatibility errors depending on the scikit-learn version used at training time (an automatic normalization is attempted at load).',
  'welcome.demoSection': 'Instant demo models',
  'welcome.irisSubtitle': 'StandardScaler → LogisticRegression (4 named numeric variables)',
  'welcome.textSubtitle': 'TfidfVectorizer → MultinomialNB (raw text classification)',

  // Node inspector panel
  'inspector.selectNode': 'Select a node in the graph',
  'inspector.selectNodeHint':
    'Click a pipeline step to inspect its hyperparameters and learned attributes.',
  'inspector.copyValue': 'Copy full value',
  'inspector.pagination': '{start}–{end} of {total}',
  'inspector.close': 'Close inspector',
  'inspector.depends': 'depends on {up} node(s) • used by {down} node(s)',
  'inspector.hyperparams': 'Hyperparameters ({count})',
  'inspector.filterParams': 'Filter hyperparameters…',
  'inspector.noParams': 'No hyperparameters.',
  'inspector.fitted': 'Learned attributes ({count})',
  'inspector.noFitted': 'No learned attributes exposed for this node.',

  // Inference playground
  'playground.title': 'Inference inputs',
  'playground.method': 'Method:',
  'playground.methodAll': 'all (every)',
  'playground.form': 'Form',
  'playground.vector': 'Raw vector',
  'playground.batch': 'Batch CSV',
  'playground.errorFinite': 'Enter a finite number.',
  'playground.errorInvalidNumber': 'Invalid number (or leave empty for NaN).',
  'playground.errorBatchEmpty': 'Please enter at least one row of data.',
  'playground.errorCsvTooLarge': 'The CSV file exceeds the 10 MB limit.',
  'playground.errorCsvRead': 'Unable to read the CSV file.',
  'playground.batchHint': 'One row per sample (separator `,`, `;` or tab)',
  'playground.importCsv': 'Import a .csv',
  'playground.batchPlaceholderText': 'One sentence or document per line…',
  'playground.plausible': 'Plausible values',
  'playground.plausibleTitle': 'Generate realistic values from the model learned statistics',
  'playground.reset': 'Reset',
  'playground.run': 'Run inference',
  'playground.computing': 'Computing…',
  'playground.emptyNan': '(empty = NaN)',

  // Inference results
  'results.title': 'Live results',
  'results.none': 'No prediction run yet',
  'results.noneHint': 'Fill in the form on the left and click "Run inference".',
  'results.sampleOne': '1 sample',
  'results.samplesMany': '{count} samples',
  'results.warningsCount': '{count} warning(s)',
  'results.mainPrediction': 'Main prediction (predict)',
  'results.history': 'Session history ({count}/10)',
  'results.historyRows': '{count} rows',

  // Metadata & weights view
  'metadata.general': 'General information',
  'metadata.file': 'File',
  'metadata.size': 'Size',
  'metadata.rootClass': 'Root class',
  'metadata.inputLayout': 'Input layout',
  'metadata.trainedWith': 'Trained with',
  'metadata.runtimeSklearn': 'Runtime scikit-learn',
  'metadata.unknown': 'Unknown',
  'metadata.packages': 'Package versions',
  'metadata.warningsTitle': 'Warnings ({count})',
  'metadata.inputSchema': 'Input schema ({count})',
  'metadata.outputSchema': 'Output schema ({count})',
  'metadata.weights': 'Weights & learned attributes ({count} • {elements} elements)',
  'metadata.filterWeights': 'Filter weights…',
  'metadata.colName': 'Name',
  'metadata.colSummary': 'Summary',
  'metadata.colElements': 'Elements',
  'metadata.colPreview': 'Preview',
  'metadata.noWeights': 'No weights found.',
  'metadata.page': 'Page {page} / {total}',

  // Structure tree
  'tree.title': 'Model hierarchy tree',
  'tree.fittedCount': '{count} attr.',
  'tree.viewInGraph': 'View in graph',
  'tree.viewInGraphTitle': 'View this component in the DAG graph',

  // Graph canvas
  'canvas.zoomIn': 'Zoom in',
  'canvas.zoomOut': 'Zoom out',
  'canvas.fit': "Fit to screen (Home)",
  'canvas.minimap': 'Show / hide minimap',

  // Error boundary
  'error.title': 'A display error occurred',
  'error.fallback': 'Unexpected error while rendering.',
  'error.reset': 'Reset view',
} as const;

export type MessageKey = keyof typeof en;
