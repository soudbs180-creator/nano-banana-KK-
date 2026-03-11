import * as React from 'react';
import { createRoot } from 'react-dom/client';
// import { SpeedInsights } from '@vercel/speed-insights/react';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';

type FatalError = {
  message: string;
  details?: string;
};

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('找不到根节点 #root，应用无法挂载');
}

const root = createRoot(rootElement);
let hasMountedApp = false;

function normalizeError(error: unknown): FatalError {
  if (error instanceof Error) {
    return {
      message: error.message || '应用启动失败',
      details: error.stack || error.toString()
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  try {
    return {
      message: '应用启动失败',
      details: JSON.stringify(error, null, 2)
    };
  } catch {
    return { message: '应用启动失败' };
  }
}

function getDeploymentHints(): string[] {
  const hints: string[] = [];

  if (!import.meta.env.VITE_SUPABASE_URL) {
    hints.push('缺少 `VITE_SUPABASE_URL` 环境变量');
  }

  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
    hints.push('缺少 `VITE_SUPABASE_ANON_KEY` 环境变量');
  }

  return hints;
}

function FatalScreen({ error }: { error: FatalError }) {
  const hints = getDeploymentHints();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090b',
        color: '#f4f4f5',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          background: '#111217',
          border: '1px solid #27272a',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
        }}
      >
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '8px' }}>KK Studio 启动诊断</div>
          <h1 style={{ fontSize: '28px', lineHeight: 1.2, color: '#f87171', margin: 0 }}>应用启动失败，已阻止白屏</h1>
        </div>

        <div
          style={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px'
          }}
        >
          <div style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '6px' }}>错误信息</div>
          <div style={{ fontSize: '16px', color: '#fafafa', fontWeight: 600, marginBottom: '10px' }}>{error.message}</div>
          {error.details && (
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '12px',
                lineHeight: 1.6,
                color: '#d4d4d8',
                maxHeight: '320px',
                overflow: 'auto'
              }}
            >
              {error.details}
            </pre>
          )}
        </div>

        {hints.length > 0 && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.28)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px'
            }}
          >
            <div style={{ fontSize: '14px', color: '#fbbf24', marginBottom: '8px', fontWeight: 600 }}>部署检查项</div>
            <ul style={{ margin: 0, paddingLeft: '18px', color: '#fde68a', lineHeight: 1.7 }}>
              {hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              border: 'none',
              background: '#4f46e5',
              color: '#fff',
              borderRadius: '10px',
              padding: '10px 16px',
              cursor: 'pointer'
            }}
          >
            重新加载
          </button>
          <button
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }}
            style={{
              border: '1px solid #3f3f46',
              background: '#18181b',
              color: '#fff',
              borderRadius: '10px',
              padding: '10px 16px',
              cursor: 'pointer'
            }}
          >
            清理本地缓存后重试
          </button>
        </div>
      </div>
    </div>
  );
}

function renderFatalScreen(error: unknown) {
  const normalized = normalizeError(error);
  console.error('[Bootstrap Fatal Error]', normalized.message, normalized.details || '');
  root.render(<FatalScreen error={normalized} />);
}

window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.message, event.error);
  if (!hasMountedApp) {
    renderFatalScreen(event.error || event.message);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
  if (!hasMountedApp) {
    renderFatalScreen(event.reason);
  }
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Render Error]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <FatalScreen error={normalizeError(this.state.error)} />;
    }

    return this.props.children;
  }
}

function bootstrap() {
  try {
    hasMountedApp = true;

    root.render(
      <ErrorBoundary>
        <AuthProvider>
          <App />
          {/* <SpeedInsights /> */}
        </AuthProvider>
      </ErrorBoundary>
    );
  } catch (error) {
    renderFatalScreen(error);
  }
}

bootstrap();
