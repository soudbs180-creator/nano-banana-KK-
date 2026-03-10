import { LLMAdapter, ChatOptions, ImageGenerationOptions, ImageGenerationResult, AudioGenerationOptions, AudioGenerationResult, extractRefImageData } from './LLMAdapter';
import { KeySlot, keyManager } from '../auth/keyManager';
import { ImageSize, AspectRatio } from '../../types';
import { logError, logWarning, addLog, LogLevel } from '../system/systemLogService';
import { GoogleAdapter, convertImageToBase64, buildInlineImagePart } from './GoogleAdapter';
import { RegionService } from '../system/RegionService';

export class OpenAICompatibleAdapter implements LLMAdapter {
    id = 'openai-compatible-adapter';
    provider = 'OpenAI'; // Can be overridden or used for generic

    supports(modelId: string): boolean {
        // Supports basically everything that isn't strictly Google-only
        return true;
    }

    private getTimeoutMs(keySlot: KeySlot, fallbackMs: number = 120000): number {
        const raw = keySlot.timeout;
        if (!raw || Number.isNaN(raw)) return fallbackMs;
        return Math.max(15000, Math.min(raw, 240000));
    }

    private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, maxRetries: number = 3): Promise<Response> {
        let lastError: Error | null = null;
        let lastResponse: Response | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const abortFromParent = () => controller.abort();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            if (init.signal?.aborted) {
                abortFromParent();
            } else if (init.signal) {
                init.signal.addEventListener('abort', abortFromParent, { once: true });
            }

            try {
                const response = await fetch(url, {
                    ...init,
                    signal: controller.signal
                });

                // If successful or it's a non-retryable error (like 400, 401, 403, 404), return immediately
                if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) {
                    return response;
                }

                lastResponse = response;
                // It's a retryable HTTP error (e.g. 503 "no available channels"). Throw so the catch block handles delay.
                throw new Error(`HTTP ${response.status} - Transient error`);

            } catch (err: any) {
                lastError = err;

                // If this is the last attempt, don't wait, just break and throw
                if (attempt === maxRetries) {
                    break;
                }

                // If the request was aborted manually or timed out, don't retry a non-idempotent call.
                if (err.name === 'AbortError' || controller.signal.aborted || init.signal?.aborted) {
                    break;
                }

                // Exponential backoff: 1500ms, 3000ms...
                const delayMs = 1500 * Math.pow(2, attempt - 1);
                console.warn(`[OpenAICompatibleAdapter] fetchWithTimeout: Attempt ${attempt} failed for ${url}. Error: ${err.message}. Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } finally {
                clearTimeout(timeoutId);
                if (init.signal) {
                    init.signal.removeEventListener('abort', abortFromParent);
                }
            }
        }

        // If we exhausted retries and have a valid (but failing) Response object, return it so the caller can handle/log it natively
        if (lastResponse) {
            return lastResponse;
        }

        // Otherwise it was a pure network/timeout failure
        throw lastError || new Error('Fetch failed completely after retries');
    }

    private applyCustomHeaders(headers: Record<string, string>, keySlot: KeySlot): Record<string, string> {
        const merged: Record<string, string> = { ...headers };
        const custom = keySlot.customHeaders;
        if (!custom || typeof custom !== 'object') return merged;
        Object.entries(custom).forEach(([k, v]) => {
            if (!k) return;
            merged[String(k)] = String(v ?? '');
        });
        return merged;
    }

    private applyCustomBody(base: any, keySlot: KeySlot): any {
        const custom = keySlot.customBody;
        if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return base;
        return { ...base, ...custom };
    }

    private getAuthorizationHeaderValue(rawKey: string): string {
        const token = String(rawKey || '').trim();
        if (!token) return 'Bearer ';
        return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
    }

    private getQueryApiKey(rawKey: string): string {
        const token = String(rawKey || '').trim();
        if (!token) return '';
        return token.replace(/^Bearer\s+/i, '').trim();
    }

    private getRequestPathFromUrl(url: string): string {
        try {
            return new URL(url).pathname;
        } catch {
            return url;
        }
    }

    private buildHttpError(params: {
        message: string;
        status?: number;
        requestPath?: string;
        requestBody?: string;
        responseBody?: string;
        provider?: string;
    }): Error {
        const err: any = new Error(params.message);
        if (typeof params.status === 'number') {
            err.status = params.status;
            err.code = `HTTP_${params.status}`;
        }
        if (params.requestPath) err.requestPath = params.requestPath;
        if (params.requestBody) err.requestBody = params.requestBody;
        if (params.responseBody) err.responseBody = params.responseBody;
        if (params.provider) err.provider = params.provider;
        return err as Error;
    }

    private buildImageCompatibilityModeError(endpointMode: 'chat' | 'standard', originalError: any, keySlot: KeySlot): Error {
        const originalMessage = String(originalError?.message || originalError || 'Unknown image endpoint error');
        const guidance = endpointMode === 'chat'
            ? 'Chat image endpoint failed. Automatic fallback to Images API is disabled to avoid duplicate billed requests. If this provider requires the Images endpoint, switch this channel to Standard mode in Settings > API Management and retry.'
            : 'Standard Images endpoint failed. Automatic fallback to Chat API is disabled to avoid duplicate billed requests. If this provider requires the Chat endpoint, switch this channel to Chat mode in Settings > API Management and retry.';
        const err: any = new Error(`${guidance} Original error: ${originalMessage}`);
        if (originalError?.status !== undefined) err.status = originalError.status;
        if (originalError?.code !== undefined) err.code = originalError.code;
        if (originalError?.requestPath !== undefined) err.requestPath = originalError.requestPath;
        if (originalError?.requestBody !== undefined) err.requestBody = originalError.requestBody;
        if (originalError?.responseBody !== undefined) err.responseBody = originalError.responseBody;
        err.provider = originalError?.provider || keySlot.provider;
        err.compatibilityModeHint = endpointMode;
        return err as Error;
    }

    private extractImageUrlsFromPayload(data: any): string[] {
        const candidates: any[] = [];
        const pushAny = (value: any) => {
            if (Array.isArray(value)) value.forEach(pushAny);
            else if (value !== undefined && value !== null) candidates.push(value);
        };

        pushAny(data?.data);
        pushAny(data?.images);
        pushAny(data?.result?.data);
        pushAny(data?.result?.images);
        pushAny(data?.output?.data);
        pushAny(data?.output?.images);

        if (typeof data?.url === 'string') candidates.push({ url: data.url });
        if (typeof data?.result?.url === 'string') candidates.push({ url: data.result.url });
        if (typeof data?.output?.url === 'string') candidates.push({ url: data.output.url });
        if (typeof data?.output?.image_url === 'string') candidates.push({ url: data.output.image_url });

        const urls: string[] = [];
        const addUrl = (raw: any) => {
            if (typeof raw !== 'string') return;
            const normalized = raw.trim();
            if (!normalized) return;
            urls.push(normalized);
        };

        candidates.forEach((item) => {
            if (typeof item === 'string') {
                addUrl(item);
                return;
            }
            if (!item || typeof item !== 'object') return;

            const b64 = item.b64_json || item.b64 || item.base64 || item.image_base64 || item?.image?.b64_json;
            if (typeof b64 === 'string' && b64.trim()) {
                const cleaned = b64
                    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
                    .replace(/\s+/g, '');
                urls.push(`data:image/png;base64,${cleaned}`);
                return;
            }

            addUrl(item.hd_url);
            addUrl(item.original_url);
            addUrl(item.full_url);
            addUrl(item.image_url);
            addUrl(item.url);
            addUrl(item.uri);
            addUrl(item.src);
        });

        const content = data?.choices?.[0]?.message?.content || data?.message || data?.output_text || '';
        if (typeof content === 'string' && content.trim()) {
            const base64Match = content.match(/data:(image\/[^;]+);base64,([A-Za-z0-9+/=\\s]+)/);
            if (base64Match?.[2]) {
                const cleaned = base64Match[2].replace(/\s+/g, '');
                urls.push(`data:${base64Match[1]};base64,${cleaned}`);
            }

            const markdownUrl = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
            if (markdownUrl?.[1]) addUrl(markdownUrl[1]);

            const rawUrl = content.match(/(https?:\/\/[^\s)]+)/);
            if (rawUrl?.[1]) addUrl(rawUrl[1]);
        }

        return Array.from(new Set(urls));
    }

    private is12AIGateway(baseUrl: string, keySlot?: KeySlot, modelId?: string): boolean {
        // 1. Check KeySlot explicit metadata
        if (keySlot) {
            const provider = (keySlot.provider || '').toUpperCase();
            const slotName = (keySlot.name || '').toLowerCase();
            if (provider === '12AI' || provider === 'SYSTEMPROXY' || slotName.includes('12ai')) return true;
        }

        // 2. 🚀 [Critical Fix] 移除了仅根据模型名称的启发式判断
        // 之前的逻辑：如果模型包含 'gemini-3.1-flash-image' 且 provider 是 Custom/OpenAI，就认为是 12AI
        // 这是错误的！因为 suxi、newapi 等第三方供应商也可能提供同名模型，但它们使用 OpenAI 格式 Bearer 认证
        // 只有 baseUrl 包含 12ai 域名或 keySlot 明确标记为 12AI 时才走 Gemini Native

        // 3. Check Hostname — 这是唯一可靠的方式
        try {
            const host = new URL(baseUrl).hostname;
            return /(^|\.)12ai\.org$/i.test(host) || /(^|\.)12ai\.(xyz|io|net)$/i.test(host);
        } catch {
            return false;
        }
    }

    private normalizeGeminiImageSize(raw: string | undefined): '512px' | '1K' | '2K' | '4K' {
        const v = (raw || '').trim().toUpperCase();
        if (v.includes('512') || v.includes('0.5K')) return '512px';
        if (v.includes('4K') || v.includes('HD')) return '4K';
        if (v.includes('2K')) return '2K';
        return '1K';
    }

    private normalizeRequestedAspectRatio(raw: string | undefined): string | undefined {
        const value = String(raw || '').trim();
        if (!value || value.toLowerCase() === AspectRatio.AUTO) {
            return undefined;
        }
        return value;
    }

    private mergeExtraBody(
        baseExtraBody: Record<string, any> | undefined,
        nextExtraBody: Record<string, any> | undefined
    ): Record<string, any> | undefined {
        if (!baseExtraBody && !nextExtraBody) return undefined;

        const merged: Record<string, any> = { ...(baseExtraBody || {}) };
        Object.entries(nextExtraBody || {}).forEach(([key, value]) => {
            const currentValue = merged[key];
            if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                currentValue &&
                typeof currentValue === 'object' &&
                !Array.isArray(currentValue)
            ) {
                merged[key] = { ...currentValue, ...value };
                return;
            }
            merged[key] = value;
        });

        return Object.keys(merged).length > 0 ? merged : undefined;
    }

    private buildNewApiGoogleExtraBody(options: ImageGenerationOptions): Record<string, any> | undefined {
        const imageConfig: Record<string, any> = {};
        const aspectRatio = this.normalizeRequestedAspectRatio(
            options.providerConfig?.google?.imageConfig?.aspectRatio || options.aspectRatio
        );
        const imageSize = options.providerConfig?.google?.imageConfig?.imageSize || options.imageSize;

        if (aspectRatio) {
            imageConfig.aspect_ratio = aspectRatio;
        }
        if (imageSize) {
            imageConfig.image_size = this.normalizeGeminiImageSize(imageSize);
        }

        const google: Record<string, any> = {};
        if (Object.keys(imageConfig).length > 0) {
            google.image_config = imageConfig;
        }

        const thinkingLevel = options.providerConfig?.google?.thinkingConfig?.thinkingLevel;
        if (thinkingLevel) {
            google.thinking_config = {
                thinking_level: thinkingLevel,
                include_thoughts: false
            };
        }

        return Object.keys(google).length > 0 ? { google } : undefined;
    }

    private isLegacyGeminiChatGateway(baseUrl: string): boolean {
        const lower = (baseUrl || '').toLowerCase();
        return lower.includes('127.0.0.1:8045') || lower.includes('antigravity');
    }

    private normalize12AIBaseUrl(baseUrl: string): string {
        let clean = (baseUrl || '').trim().replace(/\/+$/, '');
        if (!clean) return clean;

        const suffixes = [
            '/v1/chat/completions',
            '/chat/completions',
            '/v1/images/generations',
            '/images/generations',
            '/v1beta/models',
            '/api/v1/generate',
            '/api/pay',
            '/v1beta',
            '/v1',
            '/api'
        ];

        let stripped = true;
        while (stripped) {
            stripped = false;
            const lower = clean.toLowerCase();
            for (const suffix of suffixes) {
                if (lower.endsWith(suffix)) {
                    clean = clean.slice(0, -suffix.length).replace(/\/+$/, '');
                    stripped = true;
                    break;
                }
            }
        }

        // 🚀 [Critical Fix] Ensure protocol is present to avoid "Failed to fetch"
        // If the URL doesn't start with http, it's considered relative/invalid by fetch()
        if (clean && !clean.startsWith('http')) {
            clean = `https://${clean}`;
        }

        return clean;
    }

    /**
     * 🚀 [防错增强] 确保返回的是带协议头的完整基础 URL
     * 注意：对于后端转发，应返回基础域名，由 Adapter 拼接具体路径
     */
    private static normalizeUrl(url: string | undefined | null): string {
        const CN_GATEWAY = 'https://cdn.12ai.org';
        const GLOBAL_GATEWAY = 'https://new.12ai.org';

        if (!url || typeof url !== 'string') {
            // RegionService.isChina() is not available here, so we'll use a default or assume global
            // For a static method, it's better to avoid instance-specific logic like RegionService.isChina()
            // unless it's passed as an argument or accessed via a static property.
            // For now, let's default to GLOBAL_GATEWAY if RegionService isn't directly accessible here.
            return GLOBAL_GATEWAY; // Or CN_GATEWAY if this context is known to be in China
        }

        let clean = url.trim().replace(/\/+$/, '');

        // 如果没有协议头，强制加上 https
        if (!clean.startsWith('http')) {
            clean = 'https://' + clean;
        }

        // 🚀 [Critical Fix] 移除所有硬编码的路径后缀，只保留基础 Base URL
        // 具体的 /api/v1/generate 或 /v1beta 等由具体的 Adapter 决定
        const noisySuffixes = ['/api/pay', '/api/v1/generate', '/v1', '/v1beta'];
        noisySuffixes.forEach(suffix => {
            if (clean.toLowerCase().endsWith(suffix)) {
                clean = clean.substring(0, clean.length - suffix.length).replace(/\/+$/, '');
            }
        });

        return clean;
    }

    private buildSafeRequestBodyPreview(body: any): string {
        const redact = (node: any): any => {
            if (Array.isArray(node)) return node.map(redact);
            if (node && typeof node === 'object') {
                const out: Record<string, any> = {};
                Object.entries(node).forEach(([k, v]) => {
                    const lower = k.toLowerCase();
                    if (['authorization', 'api_key', 'apikey', 'token', 'secret', 'key'].includes(lower)) {
                        out[k] = '<omitted:sensitive>';
                        return;
                    }
                    out[k] = redact(v);
                });
                return out;
            }
            if (typeof node === 'string') {
                if (node.startsWith('data:')) return '<omitted:data-uri>';
                if (/^https?:\/\//i.test(node) && node.length > 120) return '<omitted:url>';
                if (/^[A-Za-z0-9+/=]+$/.test(node) && node.length > 200) return '<omitted:base64>';
                if (node.length > 400) return node.slice(0, 200) + '...<truncated>';
                return node;
            }
            return node;
        };

        try {
            return JSON.stringify(redact(body), null, 2);
        } catch {
            return '{\n  "error": "preview_unavailable"\n}';
        }
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : baseUrl + '/v1';
        const url = cleanBase + '/chat/completions';

        const messages: any[] = options.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Multimodal Handling (OpenAI Vision Format)
        if (options.inlineData && options.inlineData.length > 0) {
            const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
            if (lastUserIdx >= 0) {
                const textContent = messages[lastUserIdx].content;
                const contentParts: any[] = [{ type: 'text', text: textContent }];

                options.inlineData.forEach(media => {
                    contentParts.push({
                        type: 'image_url',
                        image_url: { url: `data:${media.mimeType};base64,${media.data}` }
                    });
                });
                messages[lastUserIdx].content = contentParts;
            }
        }

        if (options.systemPrompt) {
            messages.unshift({ role: 'system', content: options.systemPrompt });
        }

        let headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': this.getAuthorizationHeaderValue(keySlot.key)
        };

        // Custom Header Support
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        let body: any = {
            model: options.modelId,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens || 20480, // [12AI Alignment] Default to 20k for better reasoning
            stream: false
        };

        // 🚀 Provider Config (Merge into top level or extra_body?)
        if (options.providerConfig?.openai) {
            // Merge openai specific config if applicable
        }

        // Extended Params (Extra Body)
        if (options.extraBody) {
            Object.assign(body, options.extraBody);
        }

        headers = this.applyCustomHeaders(headers, keySlot);
        body = this.applyCustomBody(body, keySlot);

        // 🚀 [12AI 对齐] 负载体积检查
        const payloadStr = JSON.stringify(body);
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Chat 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: payloadStr,
            signal: options.signal
        });

        if (!response.ok) {
            const text = await response.text();
            let errMsg = `HTTP ${response.status}`;
            try {
                const err = JSON.parse(text);
                errMsg = err.error?.message || errMsg;
            } catch (e) {
                errMsg = text.substring(0, 200);
            }
            keyManager.reportCallResult(keySlot.id, false, errMsg);
            logError('OpenAIAdapter', new Error(errMsg), `URL: ${url}\nStatus: ${response.status}\nRaw Response: ${text.substring(0, 500)}`);
            throw new Error(errMsg);
        }

        const data = await response.json();
        keyManager.reportCallResult(keySlot.id, true);
        return data.choices?.[0]?.message?.content || '';
    }

    async chatStream(options: ChatOptions, keySlot: KeySlot): Promise<void> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;

        const messages: any[] = options.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        if (options.inlineData && options.inlineData.length > 0) {
            const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
            if (lastUserIdx >= 0) {
                const textContent = messages[lastUserIdx].content;
                const contentParts: any[] = [{ type: 'text', text: textContent }];
                options.inlineData.forEach(media => {
                    contentParts.push({
                        type: 'image_url',
                        image_url: { url: `data:${media.mimeType};base64,${media.data}` }
                    });
                });
                messages[lastUserIdx].content = contentParts;
            }
        }

        if (options.systemPrompt) {
            messages.unshift({ role: 'system', content: options.systemPrompt });
        }

        let headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': this.getAuthorizationHeaderValue(keySlot.key)
        };

        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        let body: any = {
            model: options.modelId,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens || 20480,
            stream: true
        };

        if (options.extraBody) {
            Object.assign(body, options.extraBody);
        }

        headers = this.applyCustomHeaders(headers, keySlot);
        body = this.applyCustomBody(body, keySlot);

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!response.ok || !response.body) {
            const text = await response.text().catch(() => '');
            const errMsg = text || `HTTP ${response.status}`;
            keyManager.reportCallResult(keySlot.id, false, errMsg);
            throw new Error(errMsg);
        }

        keyManager.reportCallResult(keySlot.id, true);
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || !line.startsWith('data:')) continue;

                const payload = line.slice(5).trim();
                if (payload === '[DONE]') return;

                try {
                    const json = JSON.parse(payload);
                    const chunk = json.choices?.[0]?.delta?.content;
                    if (chunk) {
                        options.onStream?.(chunk);
                    }
                } catch {
                    // ignore malformed stream chunks
                }
            }
        }
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        // [Note] 内置加速服务 (SystemProxy) 逻辑已移除

        const modelLower = options.modelId.toLowerCase();
        const rawBaseUrl = keySlot.baseUrl || '';
        const baseUrl = rawBaseUrl.toLowerCase();

        const isGeminiImage = modelLower.includes('gemini') && modelLower.includes('image') ||
            modelLower.includes('nano-banana') ||
            modelLower.includes('banana');

        const isQuotaLikeError = (err: any): boolean => {
            const msg = String(err?.message || '').toLowerCase();
            return msg.includes('quota') || msg.includes('no accounts available with quota') || msg.includes('insufficient_quota');
        };

        const isChatEndpointCompatibilityError = (err: any): boolean => {
            const msg = String(err?.message || '').toLowerCase();
            if (isQuotaLikeError(err)) return false;
            const isNotSupported = msg.includes('not supported') || msg.includes('unsupported');
            return (
                msg.includes('chat-to-image error (400)') ||
                msg.includes('chat-to-image error (404)') ||
                msg.includes('chat-to-image error (405)') ||
                msg.includes('chat-to-image error (422)') ||
                (msg.includes('500') && isNotSupported) ||
                isNotSupported ||
                msg.includes('invalid request') ||
                msg.includes('endpoint')
            );
        };

        const isImageEndpointCompatibilityError = (err: any): boolean => {
            const msg = String(err?.message || '').toLowerCase();
            if (isQuotaLikeError(err)) return false;
            const isNotSupported = msg.includes('not supported') || msg.includes('unsupported');
            return (
                msg.includes('openai image error: 400') ||
                msg.includes('openai image error: 404') ||
                msg.includes('openai image error: 405') ||
                msg.includes('openai image error: 415') ||
                msg.includes('openai image error: 422') ||
                msg.includes('/images/generations') ||
                msg.includes('invalid request') ||
                msg.includes('invalid parameter') ||
                msg.includes('unrecognized request argument') ||
                msg.includes('unknown field') ||
                isNotSupported
            );
        };

        // 🚀 [Protocol Routing]
        // 12AI + Gemini 图片模型：强制走 Gemini Native（严格对齐 12AI 文档），
        // 忽略 compatibilityMode='chat'，避免命中 Chat-to-Image 信道导致 503。
        const forceGeminiNativeOn12AI = this.is12AIGateway(baseUrl, keySlot, options.modelId) && isGeminiImage;
        if (keySlot.compatibilityMode === 'chat' && !forceGeminiNativeOn12AI) {
            console.log(`[OpenAICompatibleAdapter] 使用 Chat API (显式 compatibilityMode='chat') -> ${keySlot.name}`);
            if (isGeminiImage && !this.isLegacyGeminiChatGateway(baseUrl)) {
                return this.generateImageViaChatStrict(options, keySlot);
            }
            return this.generateImageViaChat(options, keySlot);
        }

        const isAntigravity = baseUrl.includes('127.0.0.1:8045') || baseUrl.includes('antigravity');
        const isOfficialOpenAI = baseUrl.includes('api.openai.com');
        const isSiliconFlow = baseUrl.includes('siliconflow');
        const isGptBest = baseUrl.includes('gpt-best') || baseUrl.includes('gptbest');
        const is12AI = this.is12AIGateway(baseUrl, keySlot, options.modelId);
        const isComfly = baseUrl.includes('comfly') || baseUrl.includes('vodeshop') || baseUrl.includes('future-api');
        const isSuxiGateway = baseUrl.includes('suxi.ai');

        if (isAntigravity) {
            if (modelLower.includes('gemini') && modelLower.includes('image')) {
                console.log(`[OpenAICompatibleAdapter] 使用 Chat API (Antigravity + Gemini模型) -> ${keySlot.name}`);
                return this.generateImageViaChat(options, keySlot);
            }
            console.log(`[OpenAICompatibleAdapter] 使用 GPT_Best_Extended API (Antigravity) -> ${keySlot.name}`);
            return this.generateImageStandard_GPT_Best_Extended(options, keySlot);
        }

        if (isOfficialOpenAI) {
            console.log(`[OpenAICompatibleAdapter] 使用 OpenAI_Strict API -> ${keySlot.name}`);
            return this.generateImageStandard_OpenAI_Strict(options, keySlot);
        }

        if (isSiliconFlow) {
            console.log(`[OpenAICompatibleAdapter] 使用 SiliconFlow API -> ${keySlot.name}`);
            return this.generateImageStandard_SiliconFlow(options, keySlot);
        }

        if (isGptBest) {
            console.log(`[OpenAICompatibleAdapter] 使用 OpenAI_Strict API (GPT-Best) -> ${keySlot.name}`);
            return this.generateImageStandard_OpenAI_Strict(options, keySlot);
        }

        if (is12AI && isGeminiImage) {
            console.log(`[OpenAICompatibleAdapter] 使用 12AI 原生 Gemini 协议 (Native) -> ${keySlot.name}`);
            return this.generateImageGeminiNative(options, keySlot);
        }

        if (is12AI) {
            console.log(`[OpenAICompatibleAdapter] 使用 OpenAI_Strict API (12AI) -> ${keySlot.name}`);
            return this.generateImageStandard_OpenAI_Strict(options, keySlot);
        }

        if (isGeminiImage) {
            console.log(`[OpenAICompatibleAdapter] Gemini模型优先尝试 Chat API (严格 new-api 兼容层) -> ${keySlot.name}`);
            try {
                return await this.generateImageViaChatStrict(options, keySlot);
            } catch (chatErr: any) {
                if (!isChatEndpointCompatibilityError(chatErr)) {
                    throw chatErr;
                }
                console.warn(`[OpenAICompatibleAdapter] Chat API compatibility fallback disabled for billing safety -> ${keySlot.name}`);
                throw this.buildImageCompatibilityModeError('chat', chatErr, keySlot);
                console.warn(`[OpenAICompatibleAdapter] Chat API 不兼容，回退 Images API -> ${keySlot.name}`);
                return this.generateImageStandard_OpenAI_Strict(options, keySlot);
            }
        }

        if (options.providerConfig?.openai?.useChatEndpoint) {
            return this.generateImageViaChat(options, keySlot);
        }

        if (isComfly) {
            return this.generateImageStandard_OpenAI_Strict(options, keySlot);
        }
        if (isSuxiGateway) {
            console.log(`[OpenAICompatibleAdapter] suxi 网关优先尝试 Chat API -> ${keySlot.name}`);
            try {
                return await this.generateImageViaChat(options, keySlot);
            } catch (chatErr: any) {
                console.warn(`[OpenAICompatibleAdapter] suxi Chat API 失败，回退 Images API -> ${keySlot.name}`);
                if (!isChatEndpointCompatibilityError(chatErr)) {
                    throw chatErr;
                }
                console.warn(`[OpenAICompatibleAdapter] suxi Chat compatibility fallback disabled for billing safety -> ${keySlot.name}`);
                throw this.buildImageCompatibilityModeError('chat', chatErr, keySlot);
                return this.generateImageStandard_OpenAI_Strict(options, keySlot);
            }
        }

        try {
            return await this.generateImageStandard_OpenAI_Strict(options, keySlot);
        } catch (imagesErr: any) {
            if (!isImageEndpointCompatibilityError(imagesErr)) {
                throw imagesErr;
            }
            console.warn(`[OpenAICompatibleAdapter] Images compatibility fallback disabled for billing safety -> ${keySlot.name}`);
            throw this.buildImageCompatibilityModeError('standard', imagesErr, keySlot);
            console.warn(`[OpenAICompatibleAdapter] Images API 疑似不兼容，自动回退 Chat API -> ${keySlot.name}`);
            try {
                return await this.generateImageViaChat(options, keySlot);
            } catch (chatErr: any) {
                throw new Error(`Images API 与 Chat API 均失败。imagesErr=${String(imagesErr?.message || imagesErr)}; chatErr=${String(chatErr?.message || chatErr)}`);
            }
        }
    }

    private async generateImageViaChat(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;
        const isLegacyGateway = this.isLegacyGeminiChatGateway(baseUrl);
        const requestedImageSize = this.normalizeGeminiImageSize(
            options.providerConfig?.google?.imageConfig?.imageSize || options.imageSize
        );
        const aspectRatio = this.normalizeRequestedAspectRatio(
            options.providerConfig?.google?.imageConfig?.aspectRatio || options.aspectRatio
        );
        const reportedImageSize = options.imageSize || requestedImageSize;
        const is4K = options.imageSize?.toUpperCase().includes('4K');
        const is2K = options.imageSize?.toUpperCase().includes('2K');
        const is05K = options.imageSize?.includes('0.5K') || options.imageSize?.includes('512');

        let dim = 1024;
        if (is4K) dim = 4096;
        else if (is2K) dim = 2048;
        else if (is05K) dim = 512;

        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let sizeString = `${dim}x${dim}`;
        if (ratio > 1) sizeString = `${dim}x${Math.round(dim / ratio)}`;
        else if (ratio < 1) sizeString = `${Math.round(dim * ratio)}x${dim}`;

        let nativeQuality = 'standard';
        let nativeImageSizeStr = '1024x1024';
        if (is4K) { nativeQuality = 'hd'; nativeImageSizeStr = '3840x2160'; }
        else if (is2K) { nativeQuality = 'medium'; nativeImageSizeStr = '2560x1440'; }

        // 🚀 [Critical Fix] Multimodal Reference Image Support
        // Convert reference images to OpenAI Vision format
        const contentParts: any[] = [{ type: 'text', text: options.prompt }];

        if (options.referenceImages?.length) {
            options.referenceImages.forEach(refImg => {
                const { data: imgData, mimeType } = extractRefImageData(refImg);
                // 使用真实 MIME 类型构建 Data URI
                const hasPrefix = imgData.startsWith('data:');
                const dataUrl = hasPrefix ? imgData : `data:${mimeType};base64,${imgData}`;
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: dataUrl }
                });
            });
            console.log(`[OpenAICompatibleAdapter] Injected ${options.referenceImages.length} reference images into chat completion`);
        }

        // 🚀 Generate Antigravity Native Params
        const body: any = {
            model: options.modelId,
            messages: [{
                role: 'user',
                content: contentParts
            }],
            // 🚀 [Universal] 全参数传递 — 兼容所有 Gemini 协议代理
            size: sizeString,             // "4096x4096" — 像素尺寸
            quality: nativeQuality,        // "hd" / "medium" / "standard"
            imageSize: is4K ? '4K' : (is2K ? '2K' : '1K'),  // 🚀 Antigravity 最高优先级参数
            aspect_ratio: options.aspectRatio || '1:1',       // 宽高比 (蛇形)
            aspectRatio: options.aspectRatio || '1:1',        // 宽高比 (驼峰 - 增强兼容性)
            max_tokens: 65535,
            maxtokens: 65535,
            maxOutputTokens: 65535,
            stream: false
        };

        // 🚀 [12AI 对齐] 转发高级功能参数
        if (options.providerConfig?.google?.thinkingConfig?.thinkingLevel) {
            body.thinking_mode = options.providerConfig.google.thinkingConfig.thinkingLevel;
        }
        if (options.providerConfig?.google?.tools) {
            const googleSearchTool = options.providerConfig.google.tools.find(t => t.googleSearch);
            if (googleSearchTool) {
                body.google_search = true;
                if (googleSearchTool.googleSearch.searchTypes?.imageSearch) {
                    body.image_search = true;
                }
            }
        }

        const requestPath = '/v1/chat/completions';
        const pythonSnippet = `import requests\n\nurl = "${url}"\nheaders = {"Authorization": "Bearer <API_KEY>", "Content-Type": "application/json"}\npayload = ${JSON.stringify(body, null, 2)}\nresp = requests.post(url, headers=headers, json=payload, timeout=150)\nprint(resp.status_code)\nprint(resp.text[:1000])`;

        console.log(`[OpenAICompatibleAdapter] Chat Image Request -> ${keySlot.name}: size=${sizeString}, quality=${nativeQuality}, imageSize=${body.imageSize}, aspectRatio=${options.aspectRatio || '1:1'}`);

        // 🚀 [12AI 对齐] 为 Gemini 协议代理设置安全钳位
        if (body.maxOutputTokens > 65535) body.maxOutputTokens = 65535;
        if (body.maxtokens > 65535) body.maxtokens = 65535;

        let headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': this.getAuthorizationHeaderValue(keySlot.key)
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        headers = this.applyCustomHeaders(headers, keySlot);

        // 🚀 [12AI 对齐] 负载体积检查
        const payloadStr = JSON.stringify(this.applyCustomBody(body, keySlot));
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Chat-Image 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body: payloadStr,
            signal: options.signal
        }, this.getTimeoutMs(keySlot, 150000), 1);

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw this.buildHttpError({
                message: `Chat-to-Image Error (${response.status}): ${text.substring(0, 200)}`,
                status: response.status,
                requestPath,
                requestBody: this.buildSafeRequestBodyPreview(body),
                responseBody: text.substring(0, 1200),
                provider: keySlot.provider
            });
        }

        const data = await response.json();

        // 兼容更多代理返回格式（优先筛选尺寸最大的图像，避免截获预览/草图）
        const messageObj = data?.choices?.[0]?.message || {};
        const allImages = [
            ...(messageObj?.images || []),
            ...(data?.images || []),
            ...(data?.data || [])
        ];

        let bestImage = null;
        if (allImages.length > 0) {
            // 根据数据长度筛选（Base64 越长，细节越丰富，尺寸越大）
            let maxLen = 0;
            for (const img of allImages) {
                const len = (img?.b64_json?.length || 0) + (img?.url?.length || 0);
                if (len > maxLen) {
                    maxLen = len;
                    bestImage = img;
                }
            }
            console.log(`[OpenAICompatibleAdapter] Evaluated ${allImages.length} images, selected candidate with weight: ${maxLen}`);
        }

        if (bestImage?.b64_json) {
            return {
                urls: [`data:image/png;base64,${String(bestImage.b64_json).replace(/\s+/g, '')}`],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString,
                metadata: {
                    requestPath,
                    requestBodyPreview: this.buildSafeRequestBodyPreview(body),
                    pythonSnippet
                }
            };
        }
        if (bestImage?.url) {
            return {
                urls: [bestImage.url],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString,
                metadata: {
                    requestPath,
                    requestBodyPreview: this.buildSafeRequestBodyPreview(body),
                    pythonSnippet
                }
            };
        }

        const content = messageObj?.content || '';

        // 🚀 Improved Regex with Mime Capture (and newline cleanup)
        const detailedMatch = content.match(/!\[.*?\]\(data:(image\/[^;]+);base64,([^)]+)\)/);
        if (detailedMatch && detailedMatch[2]) {
            const cleanBase64 = detailedMatch[2].replace(/\s+/g, ''); // Fix corrupted base64 with newlines
            console.log(`[OpenAICompatibleAdapter] Extracted Base64 Image (Length: ${cleanBase64.length})`);
            return {
                urls: [`data:${detailedMatch[1]};base64,${cleanBase64}`],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString,
                metadata: {
                    requestPath,
                    requestBodyPreview: this.buildSafeRequestBodyPreview(body),
                    pythonSnippet
                }
            };
        }

        // 🚀 Support standard Markdown URLs (http/https)
        const urlMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (urlMatch && urlMatch[1]) {
            console.log(`[OpenAICompatibleAdapter] Extracted HTTP Markdown URL: ${urlMatch[1]}`);
            return {
                urls: [urlMatch[1]],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString,
                metadata: {
                    requestPath,
                    requestBodyPreview: this.buildSafeRequestBodyPreview(body),
                    pythonSnippet
                }
            };
        }

        // 🚀 Support Raw HTTP URLs (if markdown is missing or broken)
        const rawUrlMatch = content.match(/(https?:\/\/[^\s]+)/);
        if (rawUrlMatch && rawUrlMatch[1]) {
            console.log(`[OpenAICompatibleAdapter] Extracted Raw HTTP URL: ${rawUrlMatch[1]}`);
            return {
                urls: [rawUrlMatch[1]],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString,
                metadata: {
                    requestPath,
                    requestBodyPreview: this.buildSafeRequestBodyPreview(body),
                    pythonSnippet
                }
            };
        }

        // Fallback: If no markdown image found, maybe it's raw base64 or a URL?
        // But 12AI/Gemini Proxies typically return Markdown
        throw new Error('Failed to extract image from chat response. Content starts with: ' + content.substring(0, 50));
    }

    // ============================================================================
    // 严格模式 (Official OpenAI) - 不带任何额外多余参数，避免 400 Bad Request
    // ============================================================================
    private async generateImageViaChatStrict(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;
        const requestPath = '/v1/chat/completions';

        const contentParts: any[] = [{ type: 'text', text: options.prompt }];
        if (options.referenceImages?.length) {
            options.referenceImages.forEach((refImg) => {
                const { data: imgData, mimeType } = extractRefImageData(refImg);
                const dataUrl = imgData.startsWith('data:') ? imgData : `data:${mimeType};base64,${imgData}`;
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: dataUrl }
                });
            });
        }

        const aspectRatio = this.normalizeRequestedAspectRatio(
            options.providerConfig?.google?.imageConfig?.aspectRatio || options.aspectRatio
        );
        const reportedImageSize = options.imageSize || this.normalizeGeminiImageSize(
            options.providerConfig?.google?.imageConfig?.imageSize || options.imageSize
        );

        const body: any = {
            model: options.modelId,
            messages: [{
                role: 'user',
                content: contentParts
            }],
            stream: false
        };

        body.extra_body = this.mergeExtraBody(body.extra_body, this.buildNewApiGoogleExtraBody(options));
        if (options.providerConfig?.google?.tools?.length) {
            body.tools = options.providerConfig.google.tools;
        }

        const pythonSnippet = `import requests\n\nurl = "${url}"\nheaders = {"Authorization": "Bearer <API_KEY>", "Content-Type": "application/json"}\npayload = ${JSON.stringify(body, null, 2)}\nresp = requests.post(url, headers=headers, json=payload, timeout=150)\nprint(resp.status_code)\nprint(resp.text[:1000])`;

        let headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': this.getAuthorizationHeaderValue(keySlot.key)
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }
        headers = this.applyCustomHeaders(headers, keySlot);

        const requestBody = this.applyCustomBody(body, keySlot);
        const payloadStr = JSON.stringify(requestBody);

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body: payloadStr,
            signal: options.signal
        }, this.getTimeoutMs(keySlot, 150000), 1);

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw this.buildHttpError({
                message: `Chat-to-Image Error (${response.status}): ${text.substring(0, 200)}`,
                status: response.status,
                requestPath,
                requestBody: this.buildSafeRequestBodyPreview(requestBody),
                responseBody: text.substring(0, 1200),
                provider: keySlot.provider
            });
        }

        const data = await response.json();
        const messageObj = data?.choices?.[0]?.message || {};
        const allImages = [
            ...(messageObj?.images || []),
            ...(data?.images || []),
            ...(data?.data || [])
        ];

        let bestImage = null;
        if (allImages.length > 0) {
            let maxLen = 0;
            for (const img of allImages) {
                const len = (img?.b64_json?.length || 0) + (img?.url?.length || 0);
                if (len > maxLen) {
                    maxLen = len;
                    bestImage = img;
                }
            }
        }

        if (bestImage?.b64_json) {
            return {
                urls: [`data:image/png;base64,${String(bestImage.b64_json).replace(/\s+/g, '')}`],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: reportedImageSize,
                metadata: {
                    aspectRatio,
                    requestPath,
                    requestBodyPreview: this.buildSafeRequestBodyPreview(requestBody),
                    pythonSnippet
                }
            };
        }

        if (bestImage?.url) {
            return {
                urls: [bestImage.url],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: reportedImageSize,
                metadata: {
                    aspectRatio,
                    requestPath,
                    requestBodyPreview: this.buildSafeRequestBodyPreview(requestBody),
                    pythonSnippet
                }
            };
        }

        const content = messageObj?.content || '';
        const extractedUrls = this.extractImageUrlsFromPayload({ choices: [{ message: { content } }] });
        if (extractedUrls.length > 0) {
            return {
                urls: extractedUrls,
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: reportedImageSize,
                metadata: {
                    aspectRatio,
                    requestPath,
                    requestBodyPreview: this.buildSafeRequestBodyPreview(requestBody),
                    pythonSnippet
                }
            };
        }

        throw new Error('Failed to extract image from strict chat response. Content starts with: ' + String(content).substring(0, 50));
    }

    private async generateImageStandard_OpenAI_Strict(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        // 质量与尺寸推断
        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';

        let sizeString = '1024x1024';
        if (options.aspectRatio === '16:9') sizeString = '1792x1024';
        else if (options.aspectRatio === '9:16') sizeString = '1024x1792';
        else if (options.aspectRatio === '21:9') sizeString = '2048x870';
        else if (options.aspectRatio === '4:1') sizeString = '2048x512';
        else if (options.aspectRatio === '3:2') sizeString = '1536x1024';
        else if (options.aspectRatio === '2:3') sizeString = '1024x1536';
        else if (options.aspectRatio === '4:3') sizeString = '1024x768';
        else if (options.aspectRatio === '3:4') sizeString = '768x1024';
        else if (options.aspectRatio === '1:4') sizeString = '512x2048';
        else if (options.aspectRatio === '1:8') sizeString = '512x4096';
        else if (options.aspectRatio === '8:1') sizeString = '4096x512';

        // Configuration Overrides
        let quality = is4K || is2K ? 'hd' : 'standard';
        let style: string | undefined;
        if (options.providerConfig?.openai) {
            if (options.providerConfig.openai.size) sizeString = options.providerConfig.openai.size;
            if (options.providerConfig.openai.quality) quality = options.providerConfig.openai.quality;
            if (options.providerConfig.openai.style) style = options.providerConfig.openai.style;
        }

        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            size: sizeString,
            quality: quality,
            response_format: 'b64_json'
        };

        if (style) body.style = style;

        // 官方 DALL-E 编辑功能支持（需专用 endpoint / edits 或特殊方式，先按通用传入 mask 与 image）
        if (options.editMode && options.referenceImages?.length) {
            console.warn(`[OpenAICompatibleAdapter] 官方 OpenAI 编辑端点待完整对接支持。当前先尝试基础注入。`);
            const { data: refData, mimeType: refMime } = extractRefImageData(options.referenceImages[0]);
            body.image = refData.startsWith('http') ? refData : `data:${refMime};base64,${refData}`;
            if (options.editMode === 'inpaint' && options.maskUrl) {
                body.mask = options.maskUrl.startsWith('http') ? options.maskUrl : `data:image/png;base64,${options.maskUrl}`;
            }
        } else if (options.referenceImages?.length) {
            // 🚀 [Fix] Support Reference Image for standard OpenAI-compatible generation (Image-to-Image)
            const { data: refData, mimeType: refMime } = extractRefImageData(options.referenceImages[0]);
            // Some providers (like 12AI / Midjourney-proxy) expect 'image' or 'image_url' at top level
            const dataUrl = refData.startsWith('http') ? refData : `data:${refMime};base64,${refData}`;
            body.image = dataUrl;
            // Also inject into prompt if it's a known proxy pattern (optional but improves compatibility)
            if (options.modelId.toLowerCase().includes('midjourney') || options.modelId.toLowerCase().includes('mj-')) {
                body.prompt = `${dataUrl} ${body.prompt}`;
            }
        }

        console.log(`[OpenAICompatibleAdapter] OpenAI_Strict -> size=${body.size}, quality=${body.quality}`);

        return this.executeImageRequest(url, body, keySlot, options);
    }

    // ============================================================================
    // 特殊模式 (SiliconFlow) - 需要专用的 image_size 字段
    // ============================================================================
    private async generateImageStandard_SiliconFlow(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || '').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        // 计算物理像素
        let baseDim = 1024;
        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';
        if (is4K) baseDim = 4096; else if (is2K) baseDim = 2048;

        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let sizeStr = `${baseDim}x${baseDim}`;
        if (ratio > 1) sizeStr = `${baseDim}x${Math.round(baseDim / ratio)}`;
        else if (ratio < 1) sizeStr = `${Math.round(baseDim * ratio)}x${baseDim}`;

        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            image_size: sizeStr, // SiliconFlow 特有字段
            response_format: 'b64_json'
        };

        if (options.referenceImages && options.referenceImages.length > 0) {
            body.image = options.referenceImages.map(ref => {
                const { data: d, mimeType: m } = extractRefImageData(ref);
                return d.startsWith('http') ? d : `data:${m};base64,${d}`;
            });
        }

        console.log(`[OpenAICompatibleAdapter] SiliconFlow -> image_size=${body.image_size}`);
        return this.executeImageRequest(url, body, keySlot, options);
    }

    // ============================================================================
    // 兼容扩展模式 (GPT-Best / Antigravity / Flux / MJ) 
    // 支持多类别的辅助加强参数，比如 imageSize 4K 等。
    // ============================================================================
    private async generateImageStandard_GPT_Best_Extended(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || '').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';

        // 🚀 [关键修复] 模型 ID 分辨率后缀自动映射
        // 部分代理商 (如 gpt-best) 将不同分辨率拆成独立的模型 ID：
        //   nano-banana-2 (1K) → nano-banana-2-2k (2K) → nano-banana-2-4k (4K)
        //   gemini-3-pro-image-preview -> gemini-3-pro-image-preview-4k
        //   gemini-3.1-flash-image-preview -> gemini-3.1-flash-image-preview-4k
        // 适应此代理商广泛使用的分辨率命名规则
        const effectiveModelId = options.modelId;

        let baseDim = 1024;
        if (is4K) baseDim = 4096; else if (is2K) baseDim = 2048;

        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let sizeStr = `${baseDim}x${baseDim}`;
        if (ratio > 1) sizeStr = `${baseDim}x${Math.round(baseDim / ratio)}`;
        else if (ratio < 1) sizeStr = `${Math.round(baseDim * ratio)}x${baseDim}`;

        let parsedWidth = baseDim;
        let parsedHeight = baseDim;
        const sizeMatch = sizeStr.match(/^(\d+)x(\d+)$/);
        if (sizeMatch) {
            parsedWidth = parseInt(sizeMatch[1], 10);
            parsedHeight = parseInt(sizeMatch[2], 10);
        }

        // 🚀 关键修复: 在提示词中嵌入尺寸提示
        // 部分第三方代理忽略 size/imageSize/aspect_ratio 等参数
        // 嵌入提示词可以让模型本身理解目标分辨率
        const aspectRatioStr = options.aspectRatio || '1:1';

        const body: any = {
            model: effectiveModelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            size: sizeStr,
            quality: is4K ? 'hd' : (is2K ? 'medium' : 'standard'),
            imageSize: is4K ? '4K' : (is2K ? '2K' : '1K'), // Antigravity 最高级别指令
            aspect_ratio: aspectRatioStr,
            width: parsedWidth,
            height: parsedHeight,
            response_format: 'b64_json'
        };

        // 处理编辑和参考图
        if (options.editMode) {
            body.editMode = options.editMode;
            if (options.editMode === 'inpaint' && options.maskUrl) {
                body.mask = options.maskUrl.startsWith('http') ? options.maskUrl : `data:image/png;base64,${options.maskUrl}`;
            }
        }

        if (options.referenceImages && options.referenceImages.length > 0) {
            const isFluxKontext = options.modelId.toLowerCase().includes('flux-kontext');
            const isDoubao = options.modelId.toLowerCase().includes('doubao');

            // 🚀 [Fix] 使用 extractRefImageData 提取真实 MIME 类型
            const toDataUrl = (ref: string | { data: string; mimeType: string }) => {
                const { data: d, mimeType: m } = extractRefImageData(ref);
                return d.startsWith('http') ? d : `data:${m};base64,${d}`;
            };

            if (isFluxKontext) {
                const imgLinks = options.referenceImages.map(toDataUrl).join(' ');
                body.prompt = `${body.prompt} ${imgLinks}`;
                body.image = options.referenceImages.map(toDataUrl);
            } else if (isDoubao && options.editMode === 'inpaint') {
                body.image = toDataUrl(options.referenceImages[0]);
            } else {
                body.image = options.referenceImages.map(toDataUrl);
                body.image_url = toDataUrl(options.referenceImages[0]);
            }
        }

        console.log(`[OpenAICompatibleAdapter] GPT_Best_Extended -> size=${body.size}, imageSize=${body.imageSize}, quality=${body.quality}`);
        return this.executeImageRequest(url, body, keySlot, options);
    }

    // ============================================================================
    // 🚀 [NEW] gpt-best 代理商专用模式 — 标准 DALL-E 参数 + 提示词内嵌尺寸
    // 该代理只识别标准参数 (model, prompt, n, size, response_format)
    // 额外参数 (imageSize, aspect_ratio, width, height) 会被静默忽略
    // 所以在提示词开头嵌入尺寸和宽高比提示，让模型本身理解目标分辨率
    // ============================================================================
    private async generateImageStandard_GPT_Best_Native(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || '').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';

        // 🚀 [关键修复] 模型 ID 分辨率后缀自动映射
        const effectiveModelId = options.modelId;

        // 计算基准尺寸
        let baseDim = 1024;
        if (is4K) baseDim = 4096;
        else if (is2K) baseDim = 2048;

        // 根据宽高比计算实际像素尺寸
        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let w = baseDim;
        let h = baseDim;
        if (ratio > 1) {
            w = baseDim;
            h = Math.round(baseDim / ratio);
        } else if (ratio < 1) {
            w = Math.round(baseDim * ratio);
            h = baseDim;
        }

        const sizeStr = `${w}x${h}`;

        // 🚀 关键修复: 在提示词开头嵌入尺寸提示
        // 部分代理/模型不识别 size 参数，但会解析提示词中的尺寸指令
        const body: any = {
            model: effectiveModelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            size: sizeStr,
            response_format: 'b64_json'
        };

        // 处理参考图（通用代理大多只接受单张图片作为 `image` 字段）
        // 如果有超过1张，优先取第一张
        if (options.referenceImages && options.referenceImages.length > 0) {
            const { data: refData, mimeType: refMime } = extractRefImageData(options.referenceImages[0]);
            body.image = refData.startsWith('http') ? refData : `data:${refMime};base64,${refData}`;
        }

        // 🚀 处理局部重绘 (Inpaint) - 将蒙版作为 mask 字段发送
        if (options.editMode) {
            body.editMode = options.editMode;
            if (options.editMode === 'inpaint' && options.maskUrl) {
                body.mask = options.maskUrl.startsWith('http') ? options.maskUrl : `data:image/png;base64,${options.maskUrl}`;
            }
        }

        console.log(`[OpenAICompatibleAdapter] GPT_Best_Native -> size=${body.size}, model=${options.modelId}`);
        return this.executeImageRequest(url, body, keySlot, options);
    }

    // ============================================================================
    // 通用 Request 执行包装
    // ============================================================================
    // ============================================================================
    // 🚀 [12AI 对齐] 原生 Gemini 协议 (NanoBanana / generateContent)
    // 严格遵循 https://doc.12ai.org/api/#gemini 文档要求
    // ============================================================================
    private async generateImageGeminiNative(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        // 🚀 [修复] 如果未配置 Base URL，自动根据地区选择 12AI 官方网关 (cdn.12ai.org / new.12ai.org)
        const rawBase = keySlot.baseUrl || RegionService.get12AIBaseUrl();
        const cleanBase = this.normalize12AIBaseUrl(rawBase).replace(/\/+$/, '');

        // 严格模式：模型 ID 不做任何自动回退/映射，完全按用户选择发送。
        const effectiveModelId = options.modelId;
        const requestedImageSize = this.normalizeGeminiImageSize(
            options.providerConfig?.google?.imageConfig?.imageSize || options.imageSize
        );

        // 🚀 [鉴权修复] 12AI 原生接口必须使用 URL 参数中的 key 字段进行鉴权，Header 鉴权可能无效
        const queryKey = this.getQueryApiKey(keySlot.key);
        if (!queryKey) {
            throw new Error('12AI API Key 为空或格式无效');
        }
        const url = `${cleanBase}/v1beta/models/${effectiveModelId}:generateContent?key=${encodeURIComponent(queryKey)}`;

        const parts: any[] = [];

        // 参考图支持
        if (options.referenceImages?.length) {
            for (const refImg of options.referenceImages) {
                const { data: imgData, mimeType } = extractRefImageData(refImg);
                // 确保是纯 base64 (无前缀)
                const base64 = imgData.replace(/^data:[^;]+;base64,/, '');
                parts.push({
                    inlineData: {
                        mimeType: mimeType || 'image/png',
                        data: base64
                    }
                });
            }
        }

        // 🚀 [Critical] 12AI 对齐：构造干净的负载，确保字段名与官方文档严格一致
        parts.push({ text: options.prompt });

        const requestedAspectRatio = this.normalizeRequestedAspectRatio(
            options.providerConfig?.google?.imageConfig?.aspectRatio || options.aspectRatio
        );
        const imageConfig: any = {
            imageSize: requestedImageSize
        };
        if (requestedAspectRatio) {
            imageConfig.aspectRatio = requestedAspectRatio;
        }

        const payload: any = {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig
            }
        };

        if (options.providerConfig?.google?.thinkingConfig?.thinkingLevel) {
            payload.generationConfig.thinkingConfig = {
                thinkingLevel: options.providerConfig.google.thinkingConfig.thinkingLevel,
                includeThoughts: false
            };
        }

        const googleSearchTool = options.providerConfig?.google?.tools?.find((tool: any) => tool.googleSearch);
        if (googleSearchTool) {
            const searchTypes: Record<string, Record<string, never>> = {};
            if (googleSearchTool.googleSearch?.searchTypes?.webSearch || !googleSearchTool.googleSearch?.searchTypes) {
                searchTypes.webSearch = {};
            }
            if (googleSearchTool.googleSearch?.searchTypes?.imageSearch) {
                searchTypes.imageSearch = {};
            }
            payload.tools = [{
                googleSearch: Object.keys(searchTypes).length > 0 ? { searchTypes } : {}
            }];
        }

        const payloadStr = JSON.stringify(payload);
        // 🚀 [修复] 12AI 原生接口在浏览器端极其敏感，移除特殊的 x-goog-api-key 标头
        // 官方文档要求认证仅通过 URL 参数 key=... 进行，添加额外标头常导致 CORS Preflight 失败
        let headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // 应用用户可能的自定义标头，但排除可能产生冲突的 Google 原生认证标头
        headers = this.applyCustomHeaders(headers, keySlot);
        delete headers['x-goog-api-key'];
        delete headers['Authorization'];
        delete headers['authorization'];

        const startTime = Date.now();
        const safeUrl = url.replace(/key=[^&]+/, 'key=***'); // 用于日志的安全 URL
        console.log(`[OpenAICompatibleAdapter] 12AI Native Request -> ${safeUrl}`);

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body: payloadStr,
            signal: options.signal
        }, this.getTimeoutMs(keySlot, 120000), 1);

        const duration = Date.now() - startTime;

        if (!response.ok) {
            const raw = await response.text().catch(() => '');
            let detail = `12AI Native Error: ${response.status}`;
            try {
                const err = JSON.parse(raw || '{}');
                detail = err.error?.message || err.message || detail;
            } catch {
                if (raw) detail = raw.slice(0, 500);
            }
            keyManager.reportCallResult(keySlot.id, false, detail);
            throw new Error(`[${response.status}] ${detail}`);
        }

        const data = await response.json();
        keyManager.reportCallResult(keySlot.id, true);
        const candidate = data.candidates?.[0];
        if (!candidate) throw new Error('12AI API 返回空结果 Candidate');

        const candidateParts = candidate.content?.parts || [];
        const imagePart = candidateParts.find((p: any) => p.inlineData || p.inline_data);

        if (!imagePart) {
            const textPart = candidateParts.find((p: any) => p.text);
            if (textPart?.text) throw new Error(`生成失败: ${textPart.text}`);
            throw new Error('响应中未找到图片数据');
        }

        const inlineData = imagePart.inlineData || imagePart.inline_data;
        const mime = inlineData.mimeType || inlineData.mime_type || 'image/png';
        const b64 = String(inlineData.data || '').replace(/\s+/g, '');

        return {
            urls: [`data:${mime};base64,${b64}`],
            provider: '12AI-Native',
            model: options.modelId,
            imageSize: requestedImageSize,
            metadata: {
                requestPath: `/v1beta/models/${options.modelId}:generateContent`,
                apiDurationMs: duration,
                requestBodyPreview: this.buildSafeRequestBodyPreview(payload)
            }
        };
    }

    private async executeImageRequest(url: string, body: any, keySlot: KeySlot, options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        let headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': this.getAuthorizationHeaderValue(keySlot.key)
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        headers = this.applyCustomHeaders(headers, keySlot);

        body = this.applyCustomBody(body, keySlot);

        const payloadStr = JSON.stringify(body);
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Image 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body: payloadStr,
            signal: options.signal
        }, this.getTimeoutMs(keySlot, 150000), 1);

        const requestPath = this.getRequestPathFromUrl(url);

        if (!response.ok) {
            const raw = await response.text().catch(() => '');
            let detail = `OpenAI Image Error: ${response.status}`;
            try {
                const err = JSON.parse(raw || '{}');
                const errorObj = err.error || err;
                detail = errorObj.message || (typeof errorObj === 'string' ? errorObj : JSON.stringify(errorObj));
            } catch {
                if (raw) detail = raw.slice(0, 500);
            }
            keyManager.reportCallResult(keySlot.id, false, detail);
            logError('OpenAIAdapter', new Error(detail), `URL: ${url}\nStatus: ${response.status}\nRaw Response: ${raw.slice(0, 500)}`);
            throw this.buildHttpError({
                message: `[${response.status}] ${detail}`,
                status: response.status,
                requestPath,
                requestBody: this.buildSafeRequestBodyPreview(body),
                responseBody: raw.slice(0, 1600),
                provider: keySlot.provider
            });
        }

        const data = await response.json();
        keyManager.reportCallResult(keySlot.id, true);
        const firstDataArray = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.images) ? data.images : null);

        // 🚀 [诊断] 打印代理返回的原始数据结构
        if (firstDataArray && firstDataArray.length > 0) {
            const firstItem = firstDataArray[0];
            const responseKeys = Object.keys(firstItem);
            const hasB64 = !!firstItem.b64_json;
            const hasUrl = !!firstItem.url;
            console.log(`[OpenAICompatibleAdapter] 响应数据字段: [${responseKeys.join(', ')}], b64=${hasB64}, url=${hasUrl}${hasUrl ? `, url_preview=${firstItem.url?.substring(0, 80)}...` : ''}`);

        }

        const urls = this.extractImageUrlsFromPayload(data);
        if (!urls.length) {
            const rawPreview = JSON.stringify(data || {}).slice(0, 1600);
            throw this.buildHttpError({
                message: '接口已返回成功状态，但未找到可用图片数据',
                status: response.status,
                requestPath,
                requestBody: this.buildSafeRequestBodyPreview(body),
                responseBody: rawPreview,
                provider: keySlot.provider
            });
        }

        return {
            urls,
            provider: 'OpenAI',
            providerName: keySlot.name,
            model: options.modelId,
            imageSize: body.size || body.image_size || 'Unknown',
            metadata: {
                requestPath,
                requestBodyPreview: this.buildSafeRequestBodyPreview(body),
                pythonSnippet: `import requests\n\nurl = "${url}"\nheaders = {"Authorization": "Bearer <API_KEY>", "Content-Type": "application/json"}\npayload = ${JSON.stringify(body, null, 2)}\nresp = requests.post(url, headers=headers, json=payload, timeout=150)\nprint(resp.status_code)\nprint(resp.text[:1000])`
            }
        };
    }
}

