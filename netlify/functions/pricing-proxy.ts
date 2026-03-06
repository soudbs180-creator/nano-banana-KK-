/**
 * 价格扫描代理端点
 * 用于绕过浏览器 CORS 限制，从供应商的 /api/pricing 端点获取价格数据
 * /pricing 是供应商的 SPA 网页，/api/pricing 是其背后的 JSON 数据源
 */

export default async (request: Request) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // 处理 CORS 预检请求
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "仅支持 POST 方法" }), {
            status: 405,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }

    try {
        const body = await request.json() as { baseUrl: string };
        const baseUrl = (body.baseUrl || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');

        if (!baseUrl) {
            return new Response(JSON.stringify({ error: "缺少 baseUrl 参数" }), {
                status: 400,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        // /pricing 网页的数据源就是 /api/pricing
        const pricingUrl = `${baseUrl}/api/pricing`;

        console.log(`[pricing-proxy] 正在请求: ${pricingUrl}`);

        const response = await fetch(pricingUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            return new Response(JSON.stringify({
                error: `供应商返回 ${response.status}`,
                status: response.status,
            }), {
                status: 200, // 返回 200 让前端处理错误
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        const text = await response.text();

        // 检测是否为 HTML（SPA 页面）而非 JSON
        if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
            return new Response(JSON.stringify({
                error: "供应商返回了 HTML 页面而非 JSON 数据",
            }), {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        // 尝试解析 JSON
        let data: any;
        try {
            data = JSON.parse(text);
        } catch {
            return new Response(JSON.stringify({
                error: "供应商返回的内容无法解析为 JSON",
            }), {
                status: 200,
                headers: { "Content-Type": "application/json", ...corsHeaders },
            });
        }

        // 直接透传供应商的 JSON 响应
        return new Response(JSON.stringify({
            success: true,
            data: data.data || [],
            group_ratio: data.group_ratio || {},
        }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });

    } catch (error: any) {
        console.error("[pricing-proxy] 错误:", error);
        return new Response(JSON.stringify({
            error: error.message || "代理请求失败",
        }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        });
    }
};

export const config = {
    path: "/api/pricing-proxy",
};
