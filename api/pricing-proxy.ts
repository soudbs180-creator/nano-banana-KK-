/**
 * Vercel Serverless Function - 价格扫描代理
 * 从服务端爬取供应商的 /pricing 页面数据（请求 /api/pricing 数据源）
 * 绕过浏览器 CORS 限制
 */

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: '仅支持 POST' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }

    try {
        const { baseUrl } = await request.json() as { baseUrl: string };
        const cleanUrl = (baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');

        if (!cleanUrl) {
            return new Response(JSON.stringify({ error: '缺少 baseUrl' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }

        const pricingUrl = `${cleanUrl}/api/pricing`;
        const response = await fetch(pricingUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `供应商返回 ${response.status}` }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }

        const text = await response.text();

        if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
            return new Response(JSON.stringify({ error: '供应商返回了 HTML 而非 JSON' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }

        const data = JSON.parse(text);
        return new Response(JSON.stringify({
            success: true,
            data: data.data || [],
            group_ratio: data.group_ratio || {},
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error?.message || '代理请求失败' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
    }
}
