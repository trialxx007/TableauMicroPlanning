import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.children !== this.props.children) {
      this.setState({ error: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-sm p-6 text-center">
          <div className="mx-auto w-11 h-11 rounded-full bg-rose-100 flex items-center justify-center mb-3">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <h2 className="text-sm font-bold text-slate-900">Affichage interrompu</h2>
          <p className="text-xs text-slate-600 mt-1">
            Une donnée enregistrée est invalide. L'application n'a pas pu s'afficher.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto text-left text-[10px] leading-snug text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2">
            {error.message}
          </pre>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.clear();
                } catch {
                  // Ignore
                }
                window.location.reload();
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Réinitialiser les données
            </button>
          </div>
        </div>
      </div>
    );
  }
}
