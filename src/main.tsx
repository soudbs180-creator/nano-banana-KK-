/**
 * Safe Entry Point
 * 
 * This file is the new entry point responsible for:
 * 1. Catching Global Errors (before React even starts)
 * 2. Catching Module Import Errors (syntax errors, circular deps)
 * 3. Dynamically importing the actual App (bootstrap.tsx)
 * 
 * If ANY of this fails, it renders a fallback Safe Mode UI.
 */

// 1. Global Error Handler (Before anything else)
window.onerror = function (message, source, lineno, colno, error) {
  renderSafeModeError('Global Script Error', error?.message || String(message), error?.stack);
  return true; // Prevent default console error bloat
};

window.onunhandledrejection = function (event) {
  renderSafeModeError('Unhandled Promise Rejection', event.reason?.message || String(event.reason), event.reason?.stack);
};

// 2. Safe Renderer Function (No React needed, pure DOM)
function renderSafeModeError(title: string, message: string, stack?: string) {
  const root = document.getElementById('root');
  if (!root) return;

  // Don't overwrite if already showing error (unless it's a new critical one)
  if (document.getElementById('safe-mode-error')) return;

  root.innerHTML = `
    <div id="safe-mode-error" style="
      position: fixed; inset: 0; background: #09090b; color: #e4e4e7;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: monospace; padding: 24px; z-index: 999999;
    ">
      <div style="max-width: 800px; width: 100%; padding: 32px; background: #18181b; border: 1px solid #27272a; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
        <h1 style="color: #ef4444; font-size: 24px; font-weight: bold; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
          <span>⛔</span>
          <span>Startup Failed (启动失败)</span>
        </h1>
        
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 14px; text-transform: uppercase; color: #a1a1aa; letter-spacing: 0.05em; margin-bottom: 8px;">Error Type</h2>
          <div style="font-weight: bold; color: #f4f4f5;">${title}</div>
        </div>

        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 14px; text-transform: uppercase; color: #a1a1aa; letter-spacing: 0.05em; margin-bottom: 8px;">Message</h2>
          <div style="color: #fca5a5; font-weight: 500;">${message}</div>
        </div>

        ${stack ? `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 14px; text-transform: uppercase; color: #a1a1aa; letter-spacing: 0.05em; margin-bottom: 8px;">Stack Trace</h2>
          <pre style="
            background: #000000; padding: 16px; border-radius: 8px; border: 1px solid #27272a;
            color: #71717a; font-size: 11px; white-space: pre-wrap; word-break: break-all;
            max-height: 200px; overflow-y: auto;
          ">${stack}</pre>
        </div>
        ` : ''}

        <div style="display: flex; gap: 16px; border-top: 1px solid #27272a; padding-top: 24px; margin-top: 8px;">
          <button onclick="localStorage.clear(); window.location.reload();" style="
            flex: 1; padding: 12px 24px; background: #ef4444; color: white; border: none; border-radius: 8px;
            font-weight: 600; cursor: pointer; transition: background 0.2s;
          ">
            Clear Cache & Reset (清除缓存并重置)
          </button>
          
          <button onclick="window.location.reload();" style="
            padding: 12px 24px; background: #27272a; color: #e4e4e7; border: 1px solid #3f3f46; border-radius: 8px;
            font-weight: 500; cursor: pointer; transition: background 0.2s;
          ">
            Reload (刷新)
          </button>
        </div>
      </div>
    </div>
  `;
}

// 3. Attempt to Bootstrap the App
console.log('🚀 Launching Application...');

// Using dynamic import to isolate crashes in the main bundle
import('./bootstrap')
  .then(() => {
    console.log('✅ Application Initialized Successfully');
  })
  .catch((error) => {
    console.error('❌ Failed to load application module:', error);
    renderSafeModeError('Module Loading Error', error.message || 'Unknown module error', error.stack);
  });
