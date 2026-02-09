import { LLMAdapter, ChatOptions, ImageGenerationOptions } from './LLMAdapter';
import { KeySlot } from '../keyManager';
import { ImageSize, AspectRatio } from '../../types';

export class OpenAICompatibleAdapter implements LLMAdapter {
    id = 'openai-compatible-adapter';
    provider = 'OpenAI'; // Also covers 'Aliyun', 'Volcengine', 'SiliconFlow', 'Custom' unless specialized

    supports(modelId: string): boolean {
        // This is a catch-all adapter for non-google models usually
        return !modelId.startsWith('gemini-') && !modelId.startsWith('veo-') && !modelId.startsWith('imagen-');
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');

        // ✨ Auto-append /v1 if missing (Standard OpenAI behavior)
        // Many proxies fail if /v1 is omitted, returning 404 HTML.
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;

        const messages: any[] = options.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Handle inlineData (Multimodal)
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
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        const body = {
            model: options.modelId,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            stream: false
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const text = await response.text();
            let errMessage = `HTTP ${response.status}`;
            try {
                const err = JSON.parse(text);
                errMessage = err.error?.message || errMessage;
            } catch (e) {
                console.error('[OpenAIAdapter] Chat Error (Non-JSON):', { url, status: response.status, text: text.substring(0, 200) });
            }
            throw new Error(errMessage);
        }

        const text = await response.text();
        try {
            const data = JSON.parse(text);
            return data.choices?.[0]?.message?.content || '';
        } catch (e: any) {
            console.error('[OpenAIAdapter] Chat Parse Error:', { url, text: text.substring(0, 200) });
            throw new Error(`Failed to parse chat response: ${e.message}`);
        }
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<import('./LLMAdapter').ImageGenerationResult> {
        // Determine mode: Standard Image or Chat-as-Image
        const isChatAsImage = keySlot.compatibilityMode === 'chat';

        // Check for Video/Audio models (Suno, Luma, Kling, etc.)
        const modelLower = options.modelId.toLowerCase();
        const isVideo = modelLower.includes('video') || modelLower.includes('suno') || modelLower.includes('kling') || modelLower.includes('luma') || modelLower.includes('runway') || modelLower.includes('udon') || modelLower.includes('veo'); // Add other video keywords

        if (isVideo) {
            return { urls: await this.generateVideo(options, keySlot) };
        }

        // ✨ Smart Routing: Gemini models via Proxy usually live on Chat Endpoint
        const isGemini = modelLower.startsWith('gemini-') ||
            modelLower.startsWith('nano-banana') ||
            modelLower.includes('gemini'); // Broaden check for proxy variations

        if (isChatAsImage || isGemini) {
            return { urls: await this.generateImageViaChat(options, keySlot) };
        }

        return this.generateImageStandard(options, keySlot);
    }

    private async generateImageStandard(options: ImageGenerationOptions, keySlot: KeySlot): Promise<import('./LLMAdapter').ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        // Handle "v1/images/generations" suffix in base url vs appending it
        // Best practice: base url should be root, we append path. 
        // But some users put full path. normalizeProxyBaseUrl logic needed here?
        // For now assume base is root-ish.
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        // Map Size
        const size = '1024x1024'; // Simplified mapping for now, should port mapToOpenAISize

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };

        const body = {
            model: options.modelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            size: size,
            response_format: 'b64_json'
        };

        // 🚀 [Feature] If reference images are provided and are URLs, append to prompt (for MJ-like behaviors on standard slots)
        if (options.referenceImages && options.referenceImages.length > 0) {
            const urls = options.referenceImages
                .filter(img => img && (img.startsWith('http') || img.length < 500)) // Only URLs, not base64
                .join(' ');
            if (urls) {
                body.prompt = `${body.prompt} ${urls}`;
            }
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const urls = data.data.map((d: any) => d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url);

        // Usage Extraction (OneAPI / Generic Format)
        // Some proxies return usage: { total_tokens: ... } or meta: { billing: { cost: ... } }
        // Standard OpenAI Image API does NOT return usage, but some proxies do (e.g. GoAmz)
        let usage: any = undefined;
        if (data.usage || (data.meta && data.meta.billing)) {
            usage = {};
            if (data.usage) {
                usage.promptTokens = data.usage.prompt_tokens;
                usage.completionTokens = data.usage.completion_tokens;
                usage.totalTokens = data.usage.total_tokens;
                // Some proxies (OneAPI) might put cost in usage? Not standard.
            }
            // Check for explicit cost (Non-standard but common in proxies)
            if (data.cost) usage.cost = data.cost;
            // GoAmz / OneAPI extensions
            // e.g. "usage": { "total_tokens": 1000 }
        }

        return { urls, usage };
    }

    private async generateVideo(options: ImageGenerationOptions, keySlot: KeySlot): Promise<string[]> {
        const { generateOpenAIVideo, mapAspectRatioToSize } = await import('../OpenAIVideoService');
        const baseUrl = keySlot.baseUrl || 'https://api.openai.com/v1';

        const size = mapAspectRatioToSize(options.aspectRatio as AspectRatio || AspectRatio.LANDSCAPE_16_9, options.modelId);

        const refImage = options.referenceImages && options.referenceImages.length > 0 ? options.referenceImages[0] : undefined;

        const result = await generateOpenAIVideo({
            model: options.modelId,
            prompt: options.prompt,
            size: size,
            seconds: 5, // Default
            referenceImage: refImage
        }, keySlot.key, baseUrl);

        return [result.url];
    }

    private async generateImageViaChat(options: ImageGenerationOptions, keySlot: KeySlot): Promise<string[]> {
        console.log('[OpenAIAdapter] Routing to Chat for Image Generation:', options.modelId);
        // MJ Proxy style: Send prompt to chat, get markdown image back
        const prompt = options.prompt + (options.aspectRatio ? ` --ar ${options.aspectRatio.replace(':', ':')} ` : '');

        // Call chat with strict text return
        const chatOptions: ChatOptions = {
            modelId: options.modelId,
            messages: [{ role: 'user', content: prompt }]
        };

        // 🚀 [Fix] Pass reference images as inlineData if available
        if (options.referenceImages && options.referenceImages.length > 0) {
            // Convert strings (base64) to inlineData format
            chatOptions.inlineData = options.referenceImages.map(img => ({
                mimeType: 'image/png', // Assume PNG or detect? ReferenceImage type usually has mimeType.
                data: img.replace(/^data:image\/\w+;base64,/, '')
            }));
        }

        const chatResponse = await this.chat(chatOptions, keySlot);

        console.log('[OpenAIAdapter] Chat Response for Image:', chatResponse);

        // Extract URL - Enhanced Regex
        // 1. Markdown Image: ![alt](url) - Supports HTTP and Data URIs
        const mdImageRegex = /!\[.*?\]\(((?:https?:\/\/|data:image\/)[^\s)]+)\)/;
        // 2. Pure URL (handling potential quotes or brackets)
        const urlRegex = /((?:https?:\/\/|data:image\/)[^\s"<>\[\]\(\)]+)/;

        const mdMatch = chatResponse.match(mdImageRegex);
        const urlMatch = chatResponse.match(urlRegex);

        let imageUrl = mdMatch ? mdMatch[1] : (urlMatch ? urlMatch[1] : null);

        if (imageUrl) {
            // Clean up URL if needed (sometimes proxies wrap in quotes or formatting)
            imageUrl = imageUrl.trim().replace(/['"]+/g, '');
            // console.log('[OpenAIAdapter] Extracted Image URL:', imageUrl.substring(0, 50) + '...');
            return [imageUrl];
        }

        console.error('[OpenAIAdapter] Failed to extract URL from:', chatResponse);
        throw new Error("No image URL found in chat response");
    }
}
