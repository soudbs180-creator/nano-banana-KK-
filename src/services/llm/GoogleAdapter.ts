import { LLMAdapter, ChatOptions, ImageGenerationOptions, ImageGenerationResult, ProviderConfig } from './LLMAdapter';
import { KeySlot } from '../keyManager';
import { GOOGLE_API_BASE } from '../apiConfig';
import { logError, logWarning } from '../systemLogService';

/**
 * Helper: Convert image data (blob URL, data URL, or base64) to base64 string
 * Gemini API requires base64 encoded image data
 */
async function convertImageToBase64(imageData: string): Promise<string | null> {
    // If it's already a pure base64 string (no prefix), return as-is
    if (!imageData.includes(':') && !imageData.includes('/')) {
        return imageData;
    }

    // If it's a data URL (data:image/png;base64,...), extract base64 part
    if (imageData.startsWith('data:')) {
        const base64Match = imageData.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
            return base64Match[1];
        }
        // If data URL but not base64, try to fetch and convert
        try {
            const response = await fetch(imageData);
            const blob = await response.blob();
            return await blobToBase64(blob);
        } catch (e) {
            console.error('[GoogleAdapter] Failed to convert data URL to base64:', e);
            return null;
        }
    }

    // If it's a blob URL (blob:http://...), fetch and convert
    if (imageData.startsWith('blob:')) {
        try {
            const response = await fetch(imageData);
            const blob = await response.blob();
            return await blobToBase64(blob);
        } catch (e) {
            console.error('[GoogleAdapter] Failed to convert blob URL to base64:', e);
            return null;
        }
    }

    // Unknown format, return as-is and hope for the best
    return imageData;
}

/**
 * Helper: Convert Blob to base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Extract base64 part from data URL
            const base64Match = result.match(/^data:[^;]+;base64,(.+)$/);
            if (base64Match) {
                resolve(base64Match[1]);
            } else {
                reject(new Error('Failed to convert blob to base64'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function is12AIGateway(baseUrl: string): boolean {
    try {
        const host = new URL(baseUrl).hostname;
        return /(^|\.)12ai\.org$/i.test(host);
    } catch {
        return false;
    }
}

function normalizeGeminiImageSize(raw: string | undefined): '512px' | '1K' | '2K' | '4K' {
    const v = (raw || '').trim().toUpperCase();
    if (v.includes('512') || v.includes('0.5K')) return '512px';
    if (v.includes('4K') || v.includes('HD')) return '4K';
    if (v.includes('2K')) return '2K';
    return '1K';
}

function buildInlineImagePart(base64Data: string, mimeType: string, useSnakeCase: boolean): any {
    if (useSnakeCase) {
        return {
            inline_data: {
                mime_type: mimeType,
                data: base64Data
            }
        };
    }
    return {
        inlineData: {
            mimeType,
            data: base64Data
        }
    };
}

function normalizeToolsForGateway(tools: any[] | undefined, useSnakeCase: boolean): any[] | undefined {
    if (!tools || tools.length === 0) return tools;
    if (!useSnakeCase) return tools;
    return tools.map(tool => {
        if (tool?.googleSearch) {
            return { google_search: tool.googleSearch };
        }
        return tool;
    });
}

function buildSafeRequestBodyPreview(payload: any): string {
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
            if (node.length > 400) return `${node.slice(0, 200)}...<truncated>`;
            return node;
        }
        return node;
    };

    try {
        return JSON.stringify(redact(payload), null, 2);
    } catch {
        return '{\n  "error": "preview_unavailable"\n}';
    }
}

function extractGroundingInfo(data: any, candidate: any): {
    searchEntryPoint?: string;
    sources?: Array<{ uri: string; title?: string; imageUri?: string }>;
} {
    const rootMeta = data?.groundingMetadata || data?.grounding_metadata;
    const candidateMeta = candidate?.groundingMetadata || candidate?.grounding_metadata;
    const meta = candidateMeta || rootMeta;
    if (!meta) return {};

    const searchEntryPoint =
        meta?.searchEntryPoint?.renderedContent ||
        meta?.search_entry_point?.rendered_content ||
        '';

    const chunks = meta?.groundingChunks || meta?.grounding_chunks || [];
    const seen = new Set<string>();
    const sources: Array<{ uri: string; title?: string; imageUri?: string }> = [];
    for (const chunk of chunks) {
        const web = chunk?.web || chunk?.webChunk || chunk?.web_chunk;
        const uri = web?.uri || web?.url || '';
        if (!uri || seen.has(uri)) continue;
        seen.add(uri);
        sources.push({
            uri,
            title: web?.title,
            imageUri: web?.imageUri || web?.image_uri
        });
    }

    return {
        searchEntryPoint: searchEntryPoint || undefined,
        sources: sources.length > 0 ? sources : undefined
    };
}

/**
 * Google Adapter - Official Google API Protocol Only
 * 
 * Handles:
 * - Gemini (Chat & Image via :generateContent)
 * - Imagen (Image via :predict)
 * - Veo (Video via :predictLongRunning)
 * 
 * STRICTLY ignores OpenAI/Antigravity protocols.
 */
export class GoogleAdapter implements LLMAdapter {
    id = 'google-adapter';
    provider = 'Google';

    supports(modelId: string): boolean {
        const id = modelId.toLowerCase();
        return id.startsWith('gemini-') || id.startsWith('imagen-') || id.startsWith('veo-');
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        const baseUrl = keySlot.baseUrl || GOOGLE_API_BASE;
        const cleanBase = baseUrl.replace(/\/+$/, '');
        // 12AI 文档要求使用 Google 官方字段命名（camelCase）
        const useSnakeCase = false;
        const url = `${cleanBase}/v1beta/models/${options.modelId}:generateContent?key=${keySlot.key}`;

        const contents = options.messages.map((msg, idx) => {
            const parts: any[] = [{ text: msg.content }];

            // Handle Multimodal Input (Inline Data)
            const isLastUserMessage = msg.role === 'user' && idx === options.messages.length - 1;
            if (isLastUserMessage && options.inlineData && options.inlineData.length > 0) {
                options.inlineData.forEach(media => {
                    parts.push(buildInlineImagePart(media.data, media.mimeType, useSnakeCase));
                });
            }

            return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts
            };
        });

        // 🚀 [12AI 对齐] maxOutputTokens 安全钳位 (限制在 65535 以内)
        // 官方文档指出：maxOutputTokens 设置为 65537 或更大，Google 会拒绝请求。
        let maxTokens = options.maxTokens || 20480; // 12AI 建议在 10000～30000 之间以兼顾质量
        if (maxTokens > 65535) {
            console.warn(`[GoogleAdapter] maxOutputTokens (${maxTokens}) 超过 Google 限制，自动钳位至 65535`);
            maxTokens = 65535;
        }

        const generationConfig: any = {
            temperature: options.temperature,
            maxOutputTokens: maxTokens
        };

        // 🚀 支持 Provider Config
        if (options.providerConfig?.google) {
            if (options.providerConfig.google.responseModalities) {
                generationConfig.responseModalities = options.providerConfig.google.responseModalities;
            }
        }

        const payload: any = {
            contents,
            generationConfig
        };

        // 安全性检查: 12AI 限制 Payload 体积 (HK线路 25MB, 主站 50MB)
        const payloadStr = JSON.stringify(payload);
        if (payloadStr.length > 45 * 1024 * 1024) {
            console.error(`[GoogleAdapter] 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限，可能导致 413 错误`);
        }

        // Safety Settings
        if (options.providerConfig?.google?.safetySettings) {
            payload.safetySettings = options.providerConfig.google.safetySettings;
        }
        if (options.providerConfig?.google?.tools) {
            payload.tools = normalizeToolsForGateway(options.providerConfig.google.tools, useSnakeCase);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payloadStr,
            signal: options.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const errMsg = err.error?.message || `Google API Error: ${response.statusText}`;
            logError('GoogleAdapter', new Error(errMsg), `URL: ${url.replace(/key=[^&]+/, 'key=***')}\nStatus: ${response.status}\nResponse: ${JSON.stringify(err)}`);
            throw new Error(errMsg);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        const modelId = options.modelId.toLowerCase();

        // 1. Veo (Video)
        if (modelId.startsWith('veo-')) {
            return this.generateVeoVideo(options, keySlot);
        }

        // 2. Imagen (Image)
        if (modelId.startsWith('imagen-')) {
            return this.generateImagenImage(options, keySlot);
        }

        // 3. Gemini (Image via generateContent)
        if (modelId.includes('gemini') && modelId.includes('image')) {
            return this.generateGeminiImage(options, keySlot);
        }

        // Default or older Gemini models that might support IMAGE modality
        return this.generateGeminiImage(options, keySlot);
    }

    /**
     * Gemini Image Generation (Multimodal)
     */
    private async generateGeminiImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        const cleanBase = (keySlot.baseUrl || GOOGLE_API_BASE).replace(/\/+$/, '');
        const is12AI = is12AIGateway(cleanBase);
        // 严格对齐 12AI 文档：使用 Google 官方 camelCase 字段
        const useSnakeCase = false;
        const url = `${cleanBase}/v1beta/models/${options.modelId}:generateContent?key=${keySlot.key}`;

        const parts: any[] = [{ text: options.prompt }];

        // Multimodal Reference Images - convert blob URLs to base64
        if (options.referenceImages?.length) {
            const convertedImages = await Promise.all(
                options.referenceImages.map(async (imageData) => {
                    const base64 = await convertImageToBase64(imageData);
                    return base64 ? { mimeType: 'image/png', data: base64 } : null;
                })
            );

            convertedImages.forEach(inlineData => {
                if (inlineData) {
                    parts.push(buildInlineImagePart(inlineData.data, inlineData.mimeType || 'image/png', useSnakeCase));
                }
            });
        }

        const generationConfig: any = {
            responseModalities: ["IMAGE"]
        };
        if (!is12AI) {
            generationConfig.temperature = 0.9; // Gemini Image defaults
        }

        // Map Options -> ImageConfig
        const imageConfig: any = {};

        // Aspect Ratio
        if (options.aspectRatio) {
            imageConfig.aspectRatio = options.aspectRatio;
        }

        // Image Size (1K/2K/4K)
        // 兼容策略：先按请求携带 imageSize；若上游不支持再自动回退
        const requestedSize = normalizeGeminiImageSize(
            options.providerConfig?.google?.imageConfig?.imageSize || options.imageSize
        );
        let lastRequestPayload = '';
        let lastRequestPayloadObj: any = {};

        const requestGemini = async (withImageSize: boolean) => {
            const effectiveImageConfig: any = { ...imageConfig };
            if (withImageSize) {
                effectiveImageConfig.imageSize = requestedSize;
            }

            const payload: any = {
                contents: [{ parts }],
                generationConfig: {
                    ...generationConfig,
                    imageConfig: effectiveImageConfig
                }
            };
            lastRequestPayload = JSON.stringify(payload);
            lastRequestPayloadObj = payload;

            // 🚀 Inject Tools if present (like Google Search Grounding for Gemini 3)
            if (options.providerConfig?.google?.tools) {
                payload.tools = normalizeToolsForGateway(options.providerConfig.google.tools, useSnakeCase);
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                const msg = err?.error?.message || `Gemini Image Error: ${response.status}`;
                logError('GoogleAdapter', new Error(msg), `URL: ${url.replace(/key=[^&]+/, 'key=***')}\nStatus: ${response.status}\nResponse: ${JSON.stringify(err)}`);
                throw new Error(msg);
            }

            const data = await response.json();
            return { data, effectiveImageConfig };
        };

        let data: any;
        let effectiveImageConfig: any = imageConfig;
        const wantsLargeSize = !!options.imageSize && requestedSize !== '1K';

        try {
            const first = await requestGemini(wantsLargeSize || !!options.imageSize);
            data = first.data;
            effectiveImageConfig = first.effectiveImageConfig;
        } catch (e: any) {
            const msg = String(e?.message || '').toLowerCase();
            const likelySizeNotSupported = msg.includes('invalid_argument') || msg.includes('imagesize') || msg.includes('image_size');

            if (wantsLargeSize && likelySizeNotSupported) {
                console.warn('[GoogleAdapter] imageSize not supported by current endpoint, retrying without imageSize');
                const fallback = await requestGemini(false);
                data = fallback.data;
                effectiveImageConfig = fallback.effectiveImageConfig;
            } else {
                throw e;
            }
        }

        // 🚀 Robust Multimodal Response Parsing
        // Google API can return multiple candidates. Usually we want the first.
        const candidate = data.candidates?.[0];
        if (!candidate) {
            throw new Error(`Google API returned no candidates. Finish Reason: ${data.candidates?.[0]?.finishReason || 'Unknown'}`);
        }

        // Parts can be many: Text description + Image data
        const candidateParts = candidate.content?.parts || [];
        const imageParts = candidateParts.filter((p: any) => {
            const inlineData = p?.inlineData || p?.inline_data;
            const mimeType = inlineData?.mimeType || inlineData?.mime_type || '';
            return typeof mimeType === 'string' && mimeType.startsWith('image/');
        });

        if (imageParts.length > 0) {
            // 🚀 [CRITICAL FIX] 4K Support: API returns multiple images (preview + final)
            // When requesting 4K, we get: 1) Low-res preview (768×1376) 2) High-res final (3072×5504)
            // We need to select the largest image by data size (base64 length)
            let bestImage = imageParts[0];
            let maxDataLength = 0;

            if (imageParts.length > 1) {
                console.log(`[GoogleAdapter] Detected ${imageParts.length} images in response, selecting largest...`);
                for (const part of imageParts) {
                    const inlineData = part?.inlineData || part?.inline_data;
                    const dataLength = inlineData?.data?.length || 0;
                    if (dataLength > maxDataLength) {
                        maxDataLength = dataLength;
                        bestImage = part;
                    }
                }
                console.log(`[GoogleAdapter] Selected image with data length: ${maxDataLength} (${(maxDataLength * 0.75 / 1024 / 1024).toFixed(2)}MB estimated)`);
            }

            const bestInlineData = bestImage?.inlineData || bestImage?.inline_data;
            const bestMime = bestInlineData?.mimeType || bestInlineData?.mime_type || 'image/png';
            const grounding = extractGroundingInfo(data, candidate);

            return {
                urls: [`data:${bestMime};base64,${bestInlineData.data}`],
                provider: 'Google',
                model: options.modelId,
                imageSize: effectiveImageConfig.imageSize || '1K',
                metadata: {
                    aspectRatio: effectiveImageConfig.aspectRatio || effectiveImageConfig.aspect_ratio,
                    grounding,
                    requestPath: (() => {
                        try {
                            return new URL(url).pathname;
                        } catch {
                            return url;
                        }
                    })(),
                    requestBodyPreview: buildSafeRequestBodyPreview(lastRequestPayloadObj),
                    pythonSnippet: (() => {
                        const safeUrl = (() => {
                            try {
                                const u = new URL(url);
                                return `${u.origin}${u.pathname}?key=<API_KEY>`;
                            } catch {
                                return url;
                            }
                        })();
                        return `import requests\n\nurl = "${safeUrl}"\npayload = ${lastRequestPayload || '{}'}\nresp = requests.post(url, json=payload, timeout=150)\nprint(resp.status_code)\nprint(resp.text[:1000])`;
                    })()
                }
            };
        }

        // Fallback: Check if there's any text describing why it failed (e.g. Safety)
        const textPart = candidateParts.find((p: any) => p.text);
        if (textPart?.text) {
            throw new Error(`Gemini Image Generation Fail: ${textPart.text}`);
        }

        throw new Error("No image data in multimodal response");
    }

    /**
     * Imagen Image Generation (:predict)
     */
    private async generateImagenImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        // Delegate to shared ImagenService logic but keep it inside adapter if possible or import
        // For strictness, let's reimplement clean logic here to avoid Service circular deps

        const cleanBase = (keySlot.baseUrl || GOOGLE_API_BASE).replace(/\/+$/, '');
        const url = `${cleanBase}/v1beta/models/${options.modelId}:predict?key=${keySlot.key}`; // Note: key param preferred over header if key in slot is just a string

        const parameters: any = {
            sampleCount: options.imageCount || 1,
        };

        // Aspect Ratio
        if (options.aspectRatio) {
            parameters.aspectRatio = options.aspectRatio;
        }

        // Image Size (1K/2K) - Imagen 4 Only supports up to 2K
        if (options.imageSize) {
            const size = options.imageSize.toUpperCase();
            if (size.includes('2K') || size.includes('4K') || size.includes('HD')) parameters.sampleImageSize = '2K';
            else parameters.sampleImageSize = '1K';
        }

        // Person Gen
        if (options.providerConfig?.imagen?.personGeneration) {
            parameters.personGeneration = options.providerConfig.imagen.personGeneration;
        }

        const instances: any[] = [];

        if (options.editMode === 'inpaint' && options.maskUrl && options.referenceImages?.length) {
            // Google Imagen explicitly expects pure base64 strings
            const originalBase64 = await convertImageToBase64(options.referenceImages[0]);
            const maskBase64 = await convertImageToBase64(options.maskUrl);

            if (originalBase64 && maskBase64) {
                instances.push({
                    prompt: options.prompt,
                    image: { bytesBase64Encoded: originalBase64 }
                });

                parameters.editConfig = {
                    editMode: "INPAINT_INSERTION",
                    mask: {
                        image: { bytesBase64Encoded: maskBase64 }
                    }
                };
            } else {
                // Fallback to text + img if conversion failed silently (shouldn't happen)
                instances.push({ prompt: options.prompt });
            }
        } else {
            instances.push({ prompt: options.prompt });
        }

        const payload = {
            instances,
            parameters
        };

        // Auth Header if key not in URL (Google supports both, but key query param is easiest)
        // Check if we need to use header
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        // if (!keySlot.key) ... throw

        // Actually, for Imagen, let's stick to the URL key pattern unless it fails, 
        // to be consistent with Gemini. Docs say :predict accepts key param.

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Imagen Error: ${response.status}`);
        }

        const data = await response.json();
        const predictions = data.predictions || [];
        let bestPrediction = predictions[0];
        if (predictions.length > 1) {
            let maxLen = 0;
            for (const p of predictions) {
                const len = p?.bytesBase64Encoded?.length || 0;
                if (len > maxLen) {
                    maxLen = len;
                    bestPrediction = p;
                }
            }
            console.log(`[GoogleAdapter] Selected best Imagen prediction from ${predictions.length} options (Length: ${maxLen})`);
        }

        const b64 = bestPrediction?.bytesBase64Encoded;

        if (b64) {
            const result: ImageGenerationResult = {
                urls: [`data:image/png;base64,${b64}`],
                provider: 'Google',
                model: options.modelId,
                metadata: {
                    requestPath: (() => {
                        try { return new URL(url).pathname; } catch { return url; }
                    })(),
                    requestBodyPreview: buildSafeRequestBodyPreview(payload),
                    pythonSnippet: `import requests\n\nurl = "${url.replace(/key=[^&]+/, 'key=<API_KEY>')}"\npayload = ${JSON.stringify(payload)}\nresp = requests.post(url, json=payload, timeout=150)\nprint(resp.status_code)\nprint(resp.text[:1000])`
                }
            };
            return result;
        }

        throw new Error("No image data in Imagen response");
    }

    private async generateVeoVideo(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        const { startVeoVideoGeneration, pollVeoVideoOperation } = await import('../VeoVideoService');
        const cleanBase = (keySlot.baseUrl || GOOGLE_API_BASE).replace(/\/+$/, '');

        // Map options to Veo Config
        const { operationId } = await startVeoVideoGeneration({
            prompt: options.prompt,
            aspectRatio: options.aspectRatio as any, // Cast or map strictly
            model: options.modelId
        }, keySlot.key, cleanBase);

        const result = await pollVeoVideoOperation(operationId, keySlot.key, cleanBase);

        return {
            urls: [result.url],
            provider: 'Google',
            model: options.modelId
        };
    }

    async generateVideo(options: import('./LLMAdapter').VideoGenerationOptions, keySlot: KeySlot): Promise<import('./LLMAdapter').VideoGenerationResult> {
        const { generateVideo } = await import('../videoService');
        const cleanBase = (keySlot.baseUrl || GOOGLE_API_BASE).replace(/\/+$/, '');

        // Convert to reference config expected by old service
        const images = [];
        if (options.imageUrl) images.push(options.imageUrl);
        if (options.imageTailUrl) images.push(options.imageTailUrl);

        const videoResult = await generateVideo(
            {
                prompt: options.prompt,
                model: options.modelId,
                aspectRatio: options.aspectRatio as any,
                resolution: (options.providerConfig?.google?.imageConfig?.imageSize || '720p') as any,
                referenceImages: images.length > 0 ? images.map(i => i.replace(/^data:image\/[^;]+;base64,/, '')) : undefined
            },
            keySlot.key,
            cleanBase
        );

        return {
            url: videoResult.videoUrl, // Comes back as dataUrl or blob url from videoService
            status: 'success',
            provider: this.provider,
            model: options.modelId
        };
    }
}
