import React, { Component, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
                    <div className="bg-[#18181b] border border-red-500/20 rounded-2xl p-8 max-w-md">
                        <h2 className="text-xl font-bold text-red-500 mb-4">Application Error</h2>
                        <p className="dark:text-zinc-300 mb-4">
                            Something went wrong. Please refresh the page.
                        </p>
                        <pre className="text-xs dark:text-zinc-500 bg-black/30 p-3 rounded overflow-auto max-h-40">
                            {this.state.error?.message}
                        </pre>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg transition-colors"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
