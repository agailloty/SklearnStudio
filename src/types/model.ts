export type DemoModelKind =
  | 'iris_pipeline'
  | 'titanic_columntransformer'
  | 'text_tfidf_classifier';

export type InputLayout = 'matrix' | 'columns' | 'text';

export interface EngineErrorPayload {
  code: string;
  message: string;
  trace?: string;
  missingPackage?: string | null;
}

export interface EngineErrorResponse {
  ok: false;
  engineVersion?: number;
  error: EngineErrorPayload;
}

export interface PipelineStepInfo {
  name: string;
  className: string;
}

export interface ComponentInfo {
  name: string;
  className: string;
  module?: string;
  kind: string;
  description?: string;
  parameters: Record<string, string>;
  fitted: Array<{
    name: string;
    shape?: number[] | null;
    dtype?: string;
    kind: string;
    elementCount?: number;
    summary: string;
    values?: unknown;
  }>;
  children: ComponentInfo[];
}

export interface ModelInfo {
  className: string;
  module: string;
  isPipeline: boolean;
  steps?: PipelineStepInfo[];
  finalEstimator?: string;
  isClassifier: boolean;
  isTextModel: boolean;
  nFeaturesIn: number | null;
  featureNamesIn: string[] | null;
  classes: Array<string | number> | null;
  methods: string[];
  trainedWithSklearn: string | null;
  runtimeSklearn: string | null;
  warnings: string[];
  packages: Record<string, string | null>;
  components: ComponentInfo | null;
  parameters?: Record<string, string>;
  summary?: string;
}

export interface TensorSchema {
  name: string;
  type: string;
  shape: Array<number | null>;
  hasDynamicDimension: boolean;
  display: string;
  description: string;
}

export interface WeightEntry {
  name: string;
  shape: number[] | null;
  dtype: string;
  kind: string;
  elementCount: number;
  summary: string;
  values: unknown;
}

export type NodeCategory =
  | 'Pipeline'
  | 'Transformer'
  | 'Classifier'
  | 'Regressor'
  | 'Estimator'
  | 'Other'
  | string;

export interface GraphNode {
  id: string;
  name: string;
  opType: string;
  domain: string;
  category: NodeCategory;
  attributes: Record<string, unknown>;
  inputIds: string[];
  outputIds: string[];
  dependsOn: string[];
  dependedBy: string[];
  layer: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  tensorName: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface GraphStatistics {
  nodeCount: number;
  edgeCount: number;
  initializerCount: number;
  totalParameters: number;
  inputCount: number;
  outputCount: number;
  distinctOpTypes: number;
}

export interface ModelGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  categories: string[];
  statistics: GraphStatistics;
}

export interface StructureKeyValue {
  key: string;
  value: unknown;
}

export interface StructureFittedEntry {
  name: string;
  summary: string;
  value: unknown;
  kind?: string;
  shape?: number[] | null;
  dtype?: string;
  elementCount?: number;
}

export interface StructureNode {
  header: string;
  kind: string;
  description: string;
  nodeId: string | null;
  parameters: StructureKeyValue[];
  fitted: StructureFittedEntry[];
  children: StructureNode[];
}

export interface FormTensorField {
  inputName: string;
  label: string;
  kind: 'text' | 'number' | 'vector';
  type: string;
  typeDisplay: string;
  shape: Array<number | null>;
  shapeDisplay: string;
  hasDynamicShape: boolean;
  isRequired: boolean;
  defaultValue: string | number;
  defaultText: string;
  description: string;
}

export interface FormFeatureField {
  name: string;
  label: string;
  index?: number;
  inputType: 'text' | 'number';
  dtype: string;
  defaultValue: string;
  step?: string | null;
  placeholder: string;
  description: string;
}

export interface FormSchema {
  inputLayout: InputLayout;
  fields: FormTensorField[];
  featureFields: FormFeatureField[];
  supportsNamedFeatures: boolean;
  nFeaturesIn: number | null;
  featureNames: string[];
}

export interface InspectedModel {
  id: string;
  name: string;
  filename: string;
  sizeBytes: number;
  format: string;
  summary: string;
  inputLayout: InputLayout;
  info: ModelInfo;
  inputs: TensorSchema[];
  outputs: TensorSchema[];
  weights: WeightEntry[];
  graph: ModelGraph;
  structure: StructureNode;
  formSchema: FormSchema;
}

export interface LoadModelSuccessResponse {
  ok: true;
  engineVersion: number;
  model: InspectedModel;
}

export type LoadModelResponse = LoadModelSuccessResponse | EngineErrorResponse;

export interface TopClassScore {
  index: number;
  label: string;
  value: number | null;
}

export interface FormattedOutput {
  name: string;
  dtype: string;
  shape: number[];
  shapeDisplay: string;
  values: unknown;
  truncated?: boolean;
  displayKind: string;
  scalarDisplay: string;
  displayValues: string[];
  topClasses: TopClassScore[];
}

export interface InferenceResult {
  rowCount: number;
  elapsedMs: number;
  classes: Array<string | number> | null;
  warnings: string[];
  outputs: Array<{
    name: string;
    dtype: string;
    shape: number[];
    values: unknown;
    truncated?: boolean;
  }>;
  formattedOutputs: FormattedOutput[];
}

export interface RunInferenceSuccessResponse {
  ok: true;
  engineVersion: number;
  modelId: string;
  result: InferenceResult;
}

export type RunInferenceResponse = RunInferenceSuccessResponse | EngineErrorResponse;

export type InferenceInputMode = 'form' | 'vector' | 'batch';

export interface InferencePayload {
  method?: string;
  featureValues?: Record<string, string>;
  fieldValues?: Record<string, { text: string; shape?: string }>;
  batchText?: string;
}

export interface InferenceHistoryItem {
  id: string;
  timestamp: string;
  mode: InferenceInputMode;
  method: string;
  payload: InferencePayload;
  result: InferenceResult;
}

export type PyodideBootStage =
  | 'idle'
  | 'wasm'
  | 'packages'
  | 'engine'
  | 'ready'
  | 'error';

export interface PyodideProgress {
  stage: PyodideBootStage;
  message: string;
  percent: number;
}
