import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Dices,
  FileSpreadsheet,
  ListChecks,
  Play,
  RotateCcw,
  Terminal,
  Upload,
} from 'lucide-react';
import type {
  InferenceInputMode,
  InferencePayload,
  InspectedModel,
} from '../types/model';
import { generatePlausibleFeatureValues } from '../utils/format';
import { useI18n, type MessageKey } from '../i18n';

interface InferencePlaygroundProps {
  model: InspectedModel;
  isRunning: boolean;
  errorMessage: string | null;
  externalPayload?: { key: string; mode: InferenceInputMode; payload: InferencePayload } | null;
  onRunInference: (mode: InferenceInputMode, payload: InferencePayload) => void;
}

function buildDefaultFeatureValues(model: InspectedModel): Record<string, string> {
  const init: Record<string, string> = {};
  for (const f of model.formSchema.featureFields) {
    init[f.name] = f.defaultValue ?? '';
  }
  return init;
}

function buildDefaultFieldValues(
  model: InspectedModel
): Record<string, { text: string; shape: string }> {
  const init: Record<string, { text: string; shape: string }> = {};
  for (const f of model.formSchema.fields) {
    init[f.inputName] = { text: f.defaultText ?? '', shape: '' };
  }
  return init;
}

export const InferencePlayground: React.FC<InferencePlaygroundProps> = ({
  model,
  isRunning,
  errorMessage,
  externalPayload,
  onRunInference,
}) => {
  const { t } = useI18n();
  const hasFeatureFields = model.formSchema.featureFields.length > 0;
  const [mode, setMode] = useState<InferenceInputMode>(hasFeatureFields ? 'form' : 'vector');
  const [method, setMethod] = useState<string>('all');
  const [featureValues, setFeatureValues] = useState<Record<string, string>>(() =>
    buildDefaultFeatureValues(model)
  );
  const [fieldValues, setFieldValues] = useState<Record<string, { text: string; shape: string }>>(
    () => buildDefaultFieldValues(model)
  );
  const [batchText, setBatchText] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, MessageKey>>({});
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMode(model.formSchema.featureFields.length > 0 ? 'form' : 'vector');
    setMethod('all');
    setFeatureValues(buildDefaultFeatureValues(model));
    setFieldValues(buildDefaultFieldValues(model));
    setBatchText('');
    setFieldErrors({});
  }, [model.id]);

  // Apply history replay if requested
  useEffect(() => {
    if (!externalPayload) return;
    setMode(externalPayload.mode);
    if (externalPayload.payload.method) {
      setMethod(externalPayload.payload.method);
    }
    if (externalPayload.payload.featureValues) {
      setFeatureValues(externalPayload.payload.featureValues);
    }
    if (externalPayload.payload.fieldValues) {
      const next: Record<string, { text: string; shape: string }> = {};
      for (const [k, v] of Object.entries(externalPayload.payload.fieldValues)) {
        next[k] = { text: v.text ?? '', shape: v.shape ?? '' };
      }
      setFieldValues(next);
    }
    if (externalPayload.payload.batchText !== undefined) {
      setBatchText(externalPayload.payload.batchText);
    }
    setFieldErrors({});
  }, [externalPayload]);

  const validateAndSubmit = () => {
    const errors: Record<string, MessageKey> = {};

    if (mode === 'form') {
      if (model.inputLayout !== 'columns') {
        for (const f of model.formSchema.featureFields) {
          if (f.inputType === 'number') {
            const raw = (featureValues[f.name] ?? '').trim();
            if (raw === '' || !Number.isFinite(Number(raw))) {
              errors[f.name] = 'playground.errorFinite';
            }
          }
        }
      } else {
        for (const f of model.formSchema.featureFields) {
          if (f.inputType === 'number') {
            const raw = (featureValues[f.name] ?? '').trim();
            if (
              raw !== '' &&
              !['nan', 'na', 'null', 'none'].includes(raw.toLowerCase()) &&
              !Number.isFinite(Number(raw))
            ) {
              errors[f.name] = 'playground.errorInvalidNumber';
            }
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }

      setFieldErrors({});
      onRunInference('form', { method, featureValues });
      return;
    }

    if (mode === 'vector') {
      setFieldErrors({});
      onRunInference('vector', { method, fieldValues });
      return;
    }

    if (!batchText.trim()) {
      setFieldErrors({ batchText: 'playground.errorBatchEmpty' });
      return;
    }
    setFieldErrors({});
    onRunInference('batch', { method, batchText });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isRunning) validateAndSubmit();
    }
  };

  const handleGeneratePlausible = () => {
    const generated = generatePlausibleFeatureValues(model);
    setFeatureValues(generated);
    setFieldErrors({});

    if (mode === 'vector') {
      if (model.inputLayout === 'text') {
        const firstKey = model.formSchema.fields[0]?.inputName;
        if (firstKey) {
          setFieldValues({ [firstKey]: { text: generated.text ?? '', shape: '' } });
        }
      } else if (model.inputLayout === 'columns') {
        const next: Record<string, { text: string; shape: string }> = {};
        for (const f of model.formSchema.fields) {
          next[f.inputName] = { text: generated[f.inputName] ?? '', shape: '' };
        }
        setFieldValues(next);
      } else {
        const firstKey = model.formSchema.fields[0]?.inputName;
        if (firstKey) {
          const vec = model.formSchema.featureFields.map((ff) => generated[ff.name] ?? '0').join(', ');
          setFieldValues({ [firstKey]: { text: vec, shape: '' } });
        }
      }
    } else if (mode === 'batch') {
      const row1 = generatePlausibleFeatureValues(model);
      const row2 = generatePlausibleFeatureValues(model);
      if (model.inputLayout === 'text') {
        setBatchText(`${row1.text ?? ''}\n${row2.text ?? ''}`);
      } else {
        const cols = model.formSchema.featureFields.map((ff) => ff.name);
        const line1 = cols.map((c) => row1[c] ?? '').join(', ');
        const line2 = cols.map((c) => row2[c] ?? '').join(', ');
        setBatchText(`${cols.join(', ')}\n${line1}\n${line2}`);
      }
    }
  };

  const handleReset = () => {
    setFeatureValues(buildDefaultFeatureValues(model));
    setFieldValues(buildDefaultFieldValues(model));
    setBatchText('');
    setFieldErrors({});
  };

  const handleImportCsv = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setFieldErrors({ batchText: 'playground.errorCsvTooLarge' });
      setMode('batch');
      return;
    }
    try {
      const text = await file.text();
      setBatchText(text);
      setMode('batch');
      setFieldErrors({});
    } catch {
      setFieldErrors({ batchText: 'playground.errorCsvRead' });
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className="studio-panel rounded-xl flex flex-col h-full overflow-hidden"
    >
      {/* Header + Mode Tabs */}
      <div className="p-4 border-b border-[var(--border-subtle)] space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('playground.title')}</h2>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[var(--text-muted)]">{t('playground.method')}</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="px-2 py-1 rounded-lg studio-elevated font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="all">{t('playground.methodAll')}</option>
              {model.info.methods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg studio-elevated text-xs font-medium">
          <button
            type="button"
            disabled={!hasFeatureFields}
            onClick={() => setMode('form')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors disabled:opacity-40 ${
              mode === 'form'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>{t('playground.form')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('vector')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
              mode === 'vector'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{t('playground.vector')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('batch')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
              mode === 'batch'
                ? 'bg-sky-500 text-slate-950 font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t('playground.batch')}</span>
          </button>
        </div>
      </div>

      {/* Form Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {errorMessage && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {mode === 'form' && (
          <div className="space-y-3">
            {model.inputLayout === 'text' ? (
              model.formSchema.featureFields.map((f) => (
                <div key={f.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-mono font-semibold">{f.label}</label>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded studio-elevated text-sky-400">
                      {f.dtype}
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={featureValues[f.name] ?? ''}
                    onChange={(e) =>
                      setFeatureValues((prev) => ({ ...prev, [f.name]: e.target.value }))
                    }
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 rounded-lg studio-elevated font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <p className="text-[11px] text-[var(--text-muted)]">{f.description}</p>
                </div>
              ))
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {model.formSchema.featureFields.map((f) => {
                  const err = fieldErrors[f.name];
                  return (
                    <div key={f.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <label
                          className="font-mono font-medium truncate"
                          title={f.label}
                        >
                          {f.label}
                        </label>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded studio-elevated text-[var(--text-muted)] shrink-0">
                          {f.dtype}
                        </span>
                      </div>
                      <input
                        type={f.inputType}
                        step={f.step ?? undefined}
                        value={featureValues[f.name] ?? ''}
                        onChange={(e) =>
                          setFeatureValues((prev) => ({ ...prev, [f.name]: e.target.value }))
                        }
                        placeholder={f.placeholder}
                        className={`w-full px-2.5 py-1.5 rounded-lg studio-elevated font-mono text-xs focus:outline-none focus:ring-1 ${
                          err
                            ? 'border-rose-500/60 focus:ring-rose-500'
                            : 'focus:ring-sky-500'
                        }`}
                      />
                      {err ? (
                        <p className="text-[11px] text-rose-400">{t(err)}</p>
                      ) : (
                        <p className="text-[10px] text-[var(--text-muted)] truncate">
                          {f.description}
                          {model.inputLayout === 'columns' ? ` ${t('playground.emptyNan')}` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mode === 'vector' && (
          <div className="space-y-3">
            {model.formSchema.fields.map((f) => (
              <div key={f.inputName} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-mono font-semibold">{f.label}</label>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded studio-elevated text-sky-400">
                    {f.typeDisplay}
                  </span>
                </div>
                <textarea
                  rows={model.formSchema.fields.length === 1 ? 4 : 2}
                  value={fieldValues[f.inputName]?.text ?? ''}
                  onChange={(e) =>
                    setFieldValues((prev) => ({
                      ...prev,
                      [f.inputName]: { text: e.target.value, shape: prev[f.inputName]?.shape ?? '' },
                    }))
                  }
                  placeholder={f.description}
                  className="w-full px-3 py-2 rounded-lg studio-elevated font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <p className="text-[11px] text-[var(--text-muted)]">{f.description}</p>
              </div>
            ))}
          </div>
        )}

        {mode === 'batch' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--text-secondary)]">
                {t('playground.batchHint')}
              </span>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => {
                  handleImportCsv(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg studio-elevated text-xs font-medium hover:text-sky-400"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t('playground.importCsv')}</span>
              </button>
            </div>
            <textarea
              rows={9}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={
                model.inputLayout === 'text'
                  ? t('playground.batchPlaceholderText')
                  : model.formSchema.featureNames.length > 0
                    ? `${model.formSchema.featureNames.join(', ')}\n...`
                    : '5.1, 3.5, 1.4, 0.2\n6.7, 3.0, 5.2, 2.3'
              }
              className="w-full px-3 py-2 rounded-lg studio-elevated font-mono text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {fieldErrors.batchText && (
              <p className="text-xs text-rose-400">{t(fieldErrors.batchText)}</p>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGeneratePlausible}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg studio-elevated text-xs font-medium hover:text-sky-400 transition-colors"
            title={t('playground.plausibleTitle')}
          >
            <Dices className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('playground.plausible')}</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg studio-elevated text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('playground.reset')}</span>
          </button>
        </div>

        <button
          type="button"
          disabled={isRunning}
          onClick={validateAndSubmit}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-semibold text-xs transition-colors shadow-sm"
          title="Ctrl+Enter"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{isRunning ? t('playground.computing') : t('playground.run')}</span>
        </button>
      </div>
    </div>
  );
};
