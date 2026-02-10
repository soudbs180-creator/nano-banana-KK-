import { LLMAdapter, ChatOptions, ImageGenerationOptions, ImageGenerationResult, ProviderConfig } from './LLMAdapter';
import { KeySlot } from '../keyManager';
import { GOOGLE_API_BASE } from '../apiConfig';

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
        const url = `${cleanBase}/v1beta/models/${options.modelId}:generateContent?key=${keySlot.key}`;

        const contents = options.messages.map((msg, idx) => {
            const parts: any[] = [{ text: msg.content }];

            // Handle Multimodal Input (Inline Data)
            const isLastUserMessage = msg.role === 'user' && idx === options.messages.length - 1;
            if (isLastUserMessage && options.inlineData && options.inlineData.length > 0) {
                options.inlineData.forEach(media => {
                    parts.push({
                        inlineData: {
                            mimeType: media.mimeType,
                            data: media.data
                        }
                    });
                });
            }

            return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts
            };
        });

        const generationConfig: any = {
            temperature: options.temperature,
            maxOutputTokens: options.maxTokens
        };

        // 🚀 Support Provider Config
        if (options.providerConfig?.google) {
            if (options.providerConfig.google.responseModalities) {
                generationConfig.responseModalities = options.providerConfig.google.responseModalities;
            }
            if (options.providerConfig.google.safetySettings) {
                // top level in payload, not inside generationConfig
            }
        }

        const payload: any = {
            contents,
            generationConfig
        };

        // Safety Settings
        if (options.providerConfig?.google?.safetySettings) {
            payload.safetySettings = options.providerConfig.google.safetySettings;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Google API Error: ${response.statusText}`);
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
        return this.generateGeminiImage(options, keySlot);
    }

    /**
     * Gemini Image Generation (Multimodal)
     */
    private async generateGeminiImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        const cleanBase = (keySlot.baseUrl || GOOGLE_API_BASE).replace(/\/+$/, '');
        const url = `${cleanBase}/v1beta/models/${options.modelId}:generateContent?key=${keySlot.key}`;

        const parts: any[] = [{ text: options.prompt }];

        // Multimodal Reference Images
        if (options.referenceImages?.length) {
            options.referenceImages.forEach(b64 => {
                parts.push({
                    inlineData: { mimeType: 'image/png', data: b64 }
                });
            });
        }

        const generationConfig: any = {
            responseModalities: ["IMAGE"],
            temperature: 0.9 // Gemini Image defaults
        };

        // Map Options -> ImageConfig
        const imageConfig: any = {};

        // Aspect Ratio
        if (options.aspectRatio) {
            imageConfig.aspectRatio = options.aspectRatio; // "16:9", "1:1" (Google supports these strings directly now)
        }

        // Image Size (1K, 2K, 4K) - NOT pixels
        // Map common "4K" or "2048x2048" to "2K" (Gemini 3 supports it) or check if "4K" is supported
        // Documentation says "1K", "2K", "4K" (case sensitive 'K')
        if (options.providerConfig?.google?.imageConfig?.imageSize) {
            imageConfig.imageSize = options.providerConfig.google.imageConfig.imageSize;
        } else if (options.imageSize) {
            // Heuristic map
            const size = options.imageSize.toUpperCase(); // Ensure upper case
            if (size.includes('4K') || size.includes('HD')) imageConfig.imageSize = '4K'; // Gemini 3 Pro supports 4K? Docs said "2K" for Imagen, but "4K" for Gemini 3
            else if (size.includes('2K')) imageConfig.imageSize = '2K';
            else imageConfig.imageSize = '1K';
        }

        generationConfig.imageConfig = imageConfig;

        const payload = {
            contents: [{ parts }],
            generationConfig
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini Image Error: ${response.status}`);
        }

        const data = await response.json();
        const part = data.candidates?.[0]?.content?.parts?.[0];

        if (part?.inlineData) {
            return {
                urls: [`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`],
                provider: 'Google',
                model: options.modelId,
                imageSize: imageConfig.imageSize || '1K'
            };
        }

        throw new Error("No image data in response");
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

        const payload = {
            instances: [{ prompt: options.prompt }],
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
        const b64 = data.predictions?.[0]?.bytesBase64Encoded;

        if (b64) {
            return {
                urls: [`data:image/png;base64,${b64}`],
                provider: 'Google',
                model: options.modelId
            };
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
}
