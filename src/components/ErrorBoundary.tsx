import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { I18nContext, type I18nContextValue } from '../i18n';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static contextType = I18nContext;
  declare context: React.ContextType<typeof I18nContext>;
  public state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || '',
    };
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      const t = (this.context?.t ?? ((key) => key)) as I18nContextValue['t'];
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full studio-panel rounded-xl p-6 space-y-4 text-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">{t('error.title')}</h2>
              <p className="text-xs text-[var(--text-secondary)] font-mono break-words">
                {this.state.message || t('error.fallback')}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('error.reset')}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
