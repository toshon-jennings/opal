import { Component } from 'react';

// Wraps a single window's content so a throw inside one mode can't tear down the
// other windows or the Chat base. Shows an inline fallback with a retry.
export default class WindowErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error(`[WindowErrorBoundary] ${this.props.label || 'window'} render error:`, error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
                    <div className="w-full max-w-lg rounded-xl border border-red-500/30 bg-red-500/10 p-6">
                        <p className="mb-2 text-sm font-semibold text-red-400">
                            {this.props.label || 'This window'} failed to render
                        </p>
                        <p className="break-all font-mono text-xs leading-5 text-red-300/80">
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </p>
                        {this.state.error?.stack && (
                            <pre className="mt-3 max-h-48 overflow-auto text-left text-[10px] leading-4 text-red-300/60">
                                {this.state.error.stack}
                            </pre>
                        )}
                        <button
                            type="button"
                            onClick={() => this.setState({ hasError: false, error: null })}
                            className="mt-4 rounded-lg border border-red-500/40 px-4 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/10"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
