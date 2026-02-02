import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';

// 1. Global Error Handler
window.onerror = function (message, source, lineno, colno, error) {
  console.error('[Global Error]', message, error);
  // Optional: render fallback UI if needed
  return false;
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, background: '#111', color: '#fff', height: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ color: '#ff5555' }}>应用程序崩溃 (App Crashed)</h1>
          <pre>{this.state.error?.toString()}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', marginTop: 20 }}>刷新页面</button>
        </div>
      );
    }
    return this.props.children;
  }
}

console.log('🚀 Starting App (Direct Mode)...');

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
