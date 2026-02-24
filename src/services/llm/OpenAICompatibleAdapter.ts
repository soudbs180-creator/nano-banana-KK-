import { LLMAdapter, ChatOptions, ImageGenerationOptions, ImageGenerationResult } from './LLMAdapter';
import { KeySlot } from '../keyManager';
import { ImageSize, AspectRatio } from '../../types';

export class OpenAICompatibleAdapter implements LLMAdapter {
    id = 'openai-compatible-adapter';
    provider = 'OpenAI'; // Can be overridden or used for generic

    supports(modelId: string): boolean {
        // Supports basically everything that isn't strictly Google-only
        return true;
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;

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

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };

        // Custom Header Support
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        const body: any = {
            model: options.modelId,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens || 20480, // [12AI Alignment] Default to 20k for better reasoning
            stream: false
        };

        // 🚀 [12AI 对齐] 多字段 Token 兼容性支持
        if (body.max_tokens) {
            body.maxtokens = body.max_tokens;
            body.maxOutputTokens = body.max_tokens;
        }

        // 🚀 Provider Config (Merge into top level or extra_body?)
        if (options.providerConfig?.openai) {
            // Merge openai specific config if applicable
        }

        // Extended Params (Extra Body)
        if (options.extraBody) {
            Object.assign(body, options.extraBody);
        }

        // 🚀 [12AI 对齐] 负载体积检查
        const payloadStr = JSON.stringify(body);
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Chat 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: payloadStr
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
            throw new Error(errMsg);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        const modelLower = options.modelId.toLowerCase();

        // 1. Video Support (via OpenAI-compatible video extensions like Kling/Suno if supported via proxy)
        // ... (as before)

        // 2. 🚀 Chat-based Image Generation (Custom Providers like User's Gemini Proxy)
        // Detects "gemini" and "image" in the name, OR specific config
        if ((modelLower.includes('gemini') && modelLower.includes('image')) || options.providerConfig?.openai?.useChatEndpoint) {
            return this.generateImageViaChat(options, keySlot);
        }

        // 3. Antigravity Special Handling (Local Proxy)
        const isAntigravity = (keySlot.baseUrl || '').includes('127.0.0.1:8045') || (keySlot.baseUrl || '').includes('antigravity');

        return this.generateImageStandard(options, keySlot, isAntigravity);
    }

    private async generateImageViaChat(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;

        // 🚀 [Critical Fix] 4K & Real Pixel Mapping
        // Detect target resolution based on imageSize modifier
        const is4K = options.imageSize?.toUpperCase().includes('4K');
        const is2K = options.imageSize?.toUpperCase().includes('2K');

        // Base dimensions (1K)
        let dim = 1024;
        if (is4K) dim = 4096;
        else if (is2K) dim = 2048;

        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let sizeString = '1024x1024';
        if (ratio > 1) sizeString = `${dim}x${Math.round(dim / ratio)}`;
        else if (ratio < 1) sizeString = `${Math.round(dim * ratio)}x${dim}`;
        else sizeString = `${dim}x${dim}`;

        console.log(`[OpenAICompatibleAdapter] Mapped Chat Image Size: ${options.imageSize} -> ${sizeString}`);

        // 🚀 [Critical Fix] Multimodal Reference Image Support
        // Convert reference images to OpenAI Vision format
        const contentParts: any[] = [{ type: 'text', text: options.prompt }];

        if (options.referenceImages?.length) {
            options.referenceImages.forEach(imageData => {
                const dataUrl = imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`;
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: dataUrl }
                });
            });
            console.log(`[OpenAICompatibleAdapter] Injected ${options.referenceImages.length} reference images into chat completion`);
        }

        // 🚀 Generate Antigravity Native Params
        let nativeQuality = 'standard';
        let nativeImageSizeStr = '1K';
        if (is4K) { nativeQuality = 'hd'; nativeImageSizeStr = '4K'; }
        else if (is2K) { nativeQuality = 'medium'; nativeImageSizeStr = '2K'; }

        const body: any = {
            model: options.modelId,
            messages: [{
                role: 'user',
                content: contentParts
            }],
            // 🚀 Default OpenAI spec
            size: sizeString,
            // 🚀 Inject Antigravity-specific Native Params
            imageSize: nativeImageSizeStr,
            quality: nativeQuality,
            max_tokens: 65535,
            maxtokens: 65535,
            maxOutputTokens: 65535,
            stream: false
        };

        // 🚀 [12AI 对齐] 为 Gemini 协议代理设置安全钳位
        if (body.maxOutputTokens > 65535) body.maxOutputTokens = 65535;
        if (body.maxtokens > 65535) body.maxtokens = 65535;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        // 🚀 [12AI 对齐] 负载体积检查
        const payloadStr = JSON.stringify(body);
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Chat-Image 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: payloadStr
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Chat-to-Image Error (${response.status}): ${text.substring(0, 200)}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // 🚀 Improved Regex with Mime Capture (and newline cleanup)
        const detailedMatch = content.match(/!\[.*?\]\(data:(image\/[^;]+);base64,([^)]+)\)/);
        if (detailedMatch && detailedMatch[2]) {
            const cleanBase64 = detailedMatch[2].replace(/\s+/g, ''); // Fix corrupted base64 with newlines
            console.log(`[OpenAICompatibleAdapter] Extracted Base64 Image (Length: ${cleanBase64.length})`);
            return {
                urls: [`data:${detailedMatch[1]};base64,${cleanBase64}`],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString
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
                imageSize: sizeString
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
                imageSize: sizeString
            };
        }

        // Fallback: If no markdown image found, maybe it's raw base64 or a URL?
        // But 12AI/Gemini Proxies typically return Markdown
        throw new Error('Failed to extract image from chat response. Content starts with: ' + content.substring(0, 50));
    }

    private async generateImageStandard(
        options: ImageGenerationOptions,
        keySlot: KeySlot,
        isAntigravity: boolean
    ): Promise<ImageGenerationResult> {

        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        // Logic for Size Calculation
        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';

        // Default Params
        let size = '1024x1024';
        let quality: 'standard' | 'hd' = 'standard';
        let style: 'vivid' | 'natural' | undefined;

        if (is4K || is2K) quality = 'hd';

        // 1. Check Provider Config First
        if (options.providerConfig?.openai) {
            if (options.providerConfig.openai.size) size = options.providerConfig.openai.size;
            if (options.providerConfig.openai.quality) quality = options.providerConfig.openai.quality;
            if (options.providerConfig.openai.style) style = options.providerConfig.openai.style;
        }

        // 2. Fallback to High Level Options Logic if not in Provider Config
        else {
            if (isAntigravity) {
                // Antigravity Pixel-Perfect Logic
                const parts = (options.aspectRatio || '1:1').split(':');
                const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

                if (is4K) {
                    if (ratio > 1) size = `${3840}x${Math.round(3840 / ratio)}`;
                    else if (ratio < 1) size = `${Math.round(3840 * ratio)}x${3840}`;
                    else size = '4096x4096';
                } else if (is2K) {
                    if (ratio > 1) size = `${2560}x${Math.round(2560 / ratio)}`;
                    else if (ratio < 1) size = `${Math.round(2560 * ratio)}x${2560}`;
                    else size = '2048x2048';
                } else {
                    if (ratio > 1) size = `${1280}x${Math.round(1280 / ratio)}`;
                    else if (ratio < 1) size = `${Math.round(1280 * ratio)}x${1280}`;
                    else size = '1024x1024';
                }
            } else {
                // Standard DALL-E 3 Logic (Restricted sizes)
                if (options.aspectRatio === '16:9') size = '1792x1024';
                else if (options.aspectRatio === '9:16') size = '1024x1792';
                else size = '1024x1024';
            }
        }

        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            size,
            quality,
            imageSize: (is4K ? '4K' : is2K ? '2K' : '1K'), // 🚀 Antigravity Native Param
            response_format: 'b64_json'
        };

        if (style) body.style = style; // DALL-E 3 specific

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        // 🚀 [12AI 对齐] 负载体积检查
        const payloadStr = JSON.stringify(body);
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Image 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: payloadStr
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `OpenAI Image Error: ${response.status}`);
        }

        const data = await response.json();
        const urls = data.data.map((d: any) => d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url);

        return {
            urls,
            provider: 'OpenAI',
            model: options.modelId,
            imageSize: size // Return actual used size
        };
    }
}
