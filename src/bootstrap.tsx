import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

import { AuthProvider } from './context/AuthContext';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null, errorInfo: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          color: '#e4e4e7',
          background: '#09090b',
          height: '100vh',
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px'
        }}>
          <div style={{ maxWidth: '800px', width: '100%' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '16px', color: '#ef4444' }}>⚠️ 应用程序遇到错误 (Application Error)</h1>
            <div style={{ background: '#18181b', padding: '20px', borderRadius: '8px', border: '1px solid #27272a', marginBottom: '20px', overflow: 'auto', maxHeight: '400px' }}>
              <p style={{ color: '#f87171', fontWeight: 'bold', marginBottom: '8px' }}>{this.state.error?.toString()}</p>
              <pre style={{ fontSize: '12px', color: '#a1a1aa' }}>{this.state.errorInfo?.componentStack || this.state.error?.stack}</pre>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  background: '#27272a',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                刷新页面 (Reload)
              </button>
              <button
                onClick={() => { localStorage.clear(); window.location.reload(); }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                清除缓存并重置 (Reset & Clear Cache)
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);