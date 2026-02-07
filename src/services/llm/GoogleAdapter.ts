import { LLMAdapter, ChatOptions, ImageGenerationOptions } from './LLMAdapter';
import { KeySlot } from '../keyManager';
import { GOOGLE_API_BASE } from '../apiConfig';
import * as costService from '../costService';
import { ImageSize, AspectRatio } from '../../types';

export class GoogleAdapter implements LLMAdapter {
    id = 'google-adapter';
    provider = 'Google';

    supports(modelId: string): boolean {
        return modelId.startsWith('gemini-') || modelId.startsWith('imagen-') || modelId.startsWith('veo-');
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        // Native Gemini Chat (v1beta)
        const baseUrl = keySlot.baseUrl || GOOGLE_API_BASE;
        const cleanBase = baseUrl.replace(/\/+$/, '');
        const url = `${cleanBase}/v1beta/models/${options.modelId}:generateContent?key=${keySlot.key}`;

        const contents = options.messages.map((msg, idx) => {
            const parts: any[] = [{ text: msg.content }];

            // Handle Multimodal (inlineData)
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

        if (options.systemPrompt) {
            // Google uses system_instruction or explicit system role
            // v1beta supports system_instruction at top level
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                generationConfig: {
                    temperature: options.temperature,
                    maxOutputTokens: options.maxTokens
                }
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || response.statusText);
        }

        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<import('./LLMAdapter').ImageGenerationResult> {
        const { modelId, prompt, aspectRatio, imageSize } = options;
        const cleanBase = (keySlot.baseUrl || GOOGLE_API_BASE).replace(/\/+$/, '');
        const key = keySlot.key;

        // Is Imagen?
        if (modelId.startsWith('imagen-')) {
            const { generateImagenImage } = await import('../ImagenService');
            // Assuming generateImagenImage logic is compatible or we wrap it
            // We need to match the signature or reuse the logic.
            // Since ImagenService is existing, we can reuse it but passing explicit params.
            const result = await generateImagenImage(
                {
                    prompt,
                    model: modelId,
                    aspectRatio: aspectRatio as AspectRatio || AspectRatio.SQUARE,
                    imageSize: (imageSize as ImageSize) || ImageSize.SIZE_1K,
                    numberOfImages: 1
                },
                key,
                cleanBase
            );
            return {
                urls: [result.url],
                usage: {
                    cost: result.cost,
                    totalTokens: result.tokens
                }
            };
        }

        // Is Veo?
        if (modelId.startsWith('veo-')) {
            const { startVeoVideoGeneration, pollVeoVideoOperation } = await import('../VeoVideoService');
            const { operationId } = await startVeoVideoGeneration(
                { prompt, aspectRatio: aspectRatio as AspectRatio, model: modelId },
                key,
                cleanBase
            );

            // For adapter, we might want to wait or return operation ID?
            // Standard interface returns string[] (urls). So we wait.
            const result = await pollVeoVideoOperation(operationId, key, cleanBase);
            return { urls: [result.url] }; // Veo doesn't return usage yet
        }

        throw new Error(`Model ${modelId} not supported by GoogleAdapter logic`);
    }
}
