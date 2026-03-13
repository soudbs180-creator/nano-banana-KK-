import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';

const WORKSPACE_DATA_DIRS = new Set([
    'picture',
    'video',
    'refs',
    'settings',
    'tags',
    'originals',
    'thumbnails',
    'cache',
    'images',
]);

const ALWAYS_IGNORE_SEGMENTS = new Set([
    '.agents',
    '.git',
    '.vite',
    '.vscode',
    'dist',
    'node_modules',
]);

const ROOT_WATCH_FILES = new Set([
    '.env',
    '.env.development',
    '.env.local',
    '.env.production',
    'index.html',
    'package-lock.json',
    'package.json',
    'postcss.config.cjs',
    'postcss.config.js',
    'tailwind.config.js',
    'tailwind.config.ts',
    'tsconfig.json',
    'tsconfig.node.json',
    'vite.config.js',
    'vite.config.ts',
]);

function shouldIgnoreWatchPath(targetPath: string): boolean {
    const normalized = targetPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    const filename = segments[segments.length - 1]?.toLowerCase() || '';

    if (
        segments.some((segment) =>
            ALWAYS_IGNORE_SEGMENTS.has(segment)
            || segment.startsWith('recovery_')
            || segment.startsWith('backup_')
        )
    ) {
        return true;
    }

    if (
        normalized.includes('/src/') ||
        normalized.includes('/public/') ||
        normalized.includes('/api/') ||
        normalized.includes('/server/') ||
        normalized.includes('/tests/')
    ) {
        return false;
    }

    if (ROOT_WATCH_FILES.has(filename)) {
        return false;
    }

    if (normalized.endsWith('/project.json')) {
        return true;
    }

    return normalized.includes('/docs/')
        || segments.some((segment) => WORKSPACE_DATA_DIRS.has(segment));
}

function resolveManualChunk(id: string): string | undefined {
    const normalizedId = id.replace(/\\/g, '/');

    if (
        normalizedId.includes('/src/components/settings/') ||
        normalizedId.includes('/src/pages/CostEstimation.tsx')
    ) {
        return 'settings-panel';
    }

    if (
        normalizedId.includes('/src/components/modals/StorageSelectionModal.tsx') ||
        normalizedId.includes('/src/components/modals/MigrateModal.tsx') ||
        normalizedId.includes('/src/components/modals/RechargeModal.tsx') ||
        normalizedId.includes('/src/components/modals/UserProfileModal.tsx') ||
        normalizedId.includes('/src/components/modals/TagInputModal.tsx')
    ) {
        return 'modal-panels';
    }

    if (
        normalizedId.includes('/src/components/layout/SearchPalette.tsx') ||
        normalizedId.includes('/src/components/common/TutorialOverlay.tsx') ||
        normalizedId.includes('/src/components/image/GlobalLightbox.tsx')
    ) {
        return 'experience-panels';
    }

    if (normalizedId.includes('/node_modules/')) {
        if (normalizedId.includes('/@supabase/')) {
            return 'supabase-vendor';
        }

        if (normalizedId.includes('/lucide-react/')) {
            return 'lucide-vendor';
        }

        if (normalizedId.includes('/@lobehub/icons/') || normalizedId.includes('/@lobehub/fluent-emoji/')) {
            return 'lobehub-icons-vendor';
        }

        if (normalizedId.includes('/@lobehub/ui/')) {
            return 'lobehub-ui-vendor';
        }

        if (normalizedId.includes('/three/')) {
            return 'three-vendor';
        }

        if (
            normalizedId.includes('/jszip/') ||
            normalizedId.includes('/file-saver/') ||
            normalizedId.includes('/canvas-confetti/') ||
            normalizedId.includes('/qrcode.react/')
        ) {
            return 'media-utils-vendor';
        }

        return 'vendor';
    }

    return undefined;
}

/**
 * 开发环境价格扫描代理插件
 * 从服务端去爬取供应商的 /pricing 页面数据（实际请求 /api/pricing）
 * 绕过浏览器 CORS 限制，生产环境由 Netlify Function 处理
 */
function pricingProxyPlugin(): Plugin {
    return {
        name: 'pricing-proxy',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (req.url !== '/api/pricing-proxy' || req.method !== 'POST') {
                    return next();
                }

                // 读取请求体
                let body = '';
                for await (const chunk of req) body += chunk;

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');

                try {
                    const { baseUrl } = JSON.parse(body);
                    const cleanUrl = (baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');

                    if (!cleanUrl) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: '缺少 baseUrl 参数' }));
                        return;
                    }

                    // 从服务端爬取供应商的价格页面数据源
                    const pricingUrl = `${cleanUrl}/api/pricing`;
                    console.log(`[pricing-proxy] 爬取价格页面: ${pricingUrl}`);

                    const response = await fetch(pricingUrl, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                    });

                    if (!response.ok) {
                        res.end(JSON.stringify({ error: `供应商返回 ${response.status}` }));
                        return;
                    }

                    const text = await response.text();

                    // 如果返回 HTML（SPA 页面），说明路径不对
                    if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
                        res.end(JSON.stringify({ error: '供应商返回了 HTML 页面而非 JSON' }));
                        return;
                    }

                    const data = JSON.parse(text);
                    console.log(`[pricing-proxy] 成功获取 ${(data.data || []).length} 个模型价格`);
                    res.end(JSON.stringify({
                        success: true,
                        data: data.data || [],
                        group_ratio: data.group_ratio || {},
                    }));
                } catch (e: any) {
                    console.error('[pricing-proxy] 错误:', e?.message);
                    res.end(JSON.stringify({ error: e?.message || '代理请求失败' }));
                }
            });

            // 处理 OPTIONS 预检请求
            server.middlewares.use((req, res, next) => {
                if (req.url === '/api/pricing-proxy' && req.method === 'OPTIONS') {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                    res.statusCode = 200;
                    res.end();
                    return;
                }
                next();
            });
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
        server: {
            port: 3000,
            strictPort: true, // Fail if port 3000 is in use (don't auto-switch)
            host: '0.0.0.0',
            open: false, // Keep the browser stable and avoid repeated auto-open on dev server restarts
            headers: {
                'Cache-Control': 'no-store',
            },
            watch: {
                // 🚀 [Critical Fix] 忽略应用自身生成的本地数据文档，防止 Vite HMR 触发强制刷新
                ignored: shouldIgnoreWatchPath
            }
        },
        plugins: [pricingProxyPlugin()],
        resolve: {
            dedupe: ['react', 'react-dom'],
            alias: {
                '@': path.resolve(__dirname, 'src'),
            }
        },
        optimizeDeps: {
            include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client']
        },

        build: {
            // 确保构建时清理旧文件
            emptyOutDir: true,
            chunkSizeWarningLimit: 1000,
            rollupOptions: {
                output: {
                    manualChunks: resolveManualChunk,
                },
            },
        }
    };
});
