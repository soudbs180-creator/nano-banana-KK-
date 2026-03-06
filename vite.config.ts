import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
            open: true, // Auto-open browser on start
        },
        plugins: [react(), pricingProxyPlugin()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            }
        },

        build: {
            // 确保构建时清理旧文件
            emptyOutDir: true,
        }
    };
});
