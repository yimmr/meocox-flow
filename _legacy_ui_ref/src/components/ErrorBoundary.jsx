import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-dark-950 text-gray-200 p-6 select-none font-sans">
          <div className="max-w-md w-full bg-dark-900 border border-dark-700/80 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-base font-bold text-white">
                {this.props.title || '界面渲染发生异常'}
              </h2>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                {this.state.error?.message || '未知错误，已为您拦截异常以避免应用完全崩溃。'}
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-dark-950 border border-dark-800 rounded-xl text-left overflow-x-auto max-h-36 custom-scrollbar text-[11px] font-mono text-red-300/90 whitespace-pre-wrap">
                {this.state.error.stack || this.state.error.toString()}
              </div>
            )}

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition shadow-lg shadow-brand-500/20 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>尝试重试</span>
              </button>

              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 text-xs font-medium flex items-center space-x-1.5 transition active:scale-95"
              >
                <Home className="w-3.5 h-3.5" />
                <span>刷新应用</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
