import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-gray-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full glass-panel p-8 rounded-3xl border border-white/10 text-center space-y-6 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Something went wrong</h2>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                {this.state.error?.message || 'A runtime error occurred in the application rendering engine.'}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
