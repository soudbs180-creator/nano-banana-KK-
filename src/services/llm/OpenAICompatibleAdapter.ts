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
            max_tokens: options.maxTokens,
            stream: false
        };

        // 🚀 Provider Config (Merge into top level or extra_body?)
        // OpenAI standard puts 'size', 'quality' in image generation, not chat.
        // But for Chat Completion we might have specific params.
        if (options.providerConfig?.openai) {
            // Merge openai specific config if applicable
        }

        // Extended Params (Extra Body)
        if (options.extraBody) {
            Object.assign(body, options.extraBody);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
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

        // Map Size
        let size = '1024x1024';
        if (options.aspectRatio === '16:9') size = '1280x720';
        else if (options.aspectRatio === '9:16') size = '720x1280';
        else if (options.aspectRatio === '4:3') size = '1216x896';
        else if (options.aspectRatio === '3:4') size = '896x1216'; // Guessing reciprocal

        // Handle "4K" / "2K" modifiers if present in options.imageSize (User didn't specify mapping for 4K but we can try)
        // For now, stick to the explicit user examples: 1:1, 16:9, 9:16, 4:3

        const body: any = {
            model: options.modelId,
            messages: [{
                role: 'user',
                content: options.prompt // Just send the prompt directly
            }],
            // 🚀 Inject 'size' param into top-level body as per user example (via extra_body in python)
            size: size,
            stream: false
        };

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Chat-to-Image Error (${response.status}): ${text.substring(0, 200)}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // Parse Markdown Image: ![image](data:image/jpeg;base64,...)
        // Regex to capture the base64 part
        const match = content.match(/!\[.*?\]\(data:image\/[^;]+;base64,([^)]+)\)/);

        if (match && match[1]) {
            return {
                urls: [`data:image/png;base64,${match[1]}`], // Normalize prefix to png if needed, or just use what we have? 
                // Actually, let's keep the prefix if we can, but the regex captures ONLY the base64.
                // We'll reconstruct a standard data URI. User's example had jpeg, we can default to png or check headers?
                // Simpler: Just use png prefix for internal consistency, or try to detect from the original string if we caught the mime type.
                // Let's adjust regex to capture mime type too.
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: size
            };
        }

        // 🚀 Improved Regex with Mime Capture
        const detailedMatch = content.match(/!\[.*?\]\(data:(image\/[^;]+);base64,([^)]+)\)/);
        if (detailedMatch && detailedMatch[2]) {
            return {
                urls: [`data:${detailedMatch[1]};base64,${detailedMatch[2]}`],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: size
            };
        }

        throw new Error('Failed to extract image from chat response. Content: ' + content.substring(0, 50) + '...');
    }

    private async generateImageStandard(
        options: ImageGenerationOptions,
        keySlot: KeySlot,
        isAntigravity: boolean
    ): Promise<ImageGenerationResult> {

        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        // Default Params
        let size = '1024x1024';
        let quality: 'standard' | 'hd' = 'standard';
        let style: 'vivid' | 'natural' | undefined;

        // 1. Check Provider Config First
        if (options.providerConfig?.openai) {
            if (options.providerConfig.openai.size) size = options.providerConfig.openai.size;
            if (options.providerConfig.openai.quality) quality = options.providerConfig.openai.quality;
            if (options.providerConfig.openai.style) style = options.providerConfig.openai.style;
        }

        // 2. Fallback to High Level Options Logic if not in Provider Config
        else {
            // Logic for Size Calculation
            const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
            const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';

            if (is4K || is2K) quality = 'hd';

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

                // DALL-E 2 only supports 256/512/1024 squares usually.
                // Assuming DALL-E 3 modern standard.
            }
        }

        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            size,
            quality,
            response_format: 'b64_json'
        };

        if (style) body.style = style; // DALL-E 3 specific

        // Reference Images (if supported by proxy extensions, usually appended to prompt)
        if (options.referenceImages?.length) {
            // Some proxies support 'image_url' in prompt? 
            // Standard OpenAI Images API does NOT support ref images (except edits/variations endpoints).
            // We append URLs to prompt for proxies that might handle it (like Midjourney via proxy).
            // For base64, we can't do much in standard API.
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
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
