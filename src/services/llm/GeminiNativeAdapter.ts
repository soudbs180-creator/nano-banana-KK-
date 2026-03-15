import type {
    AudioGenerationOptions,
    AudioGenerationResult,
    ChatOptions,
    ImageGenerationOptions,
    ImageGenerationResult,
    LLMAdapter,
    VideoGenerationOptions,
    VideoGenerationResult,
} from './LLMAdapter';
import type { KeySlot } from '../auth/keyManager';
import { GoogleAdapter } from './GoogleAdapter';
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter';
import { resolveProviderRuntime } from '../api/providerStrategy';
import { GenerationMode } from '../../types';
import {
    buildGeminiEndpoint,
    buildGeminiHeaders,
    type AuthMethod,
} from '../api/apiConfig';

export class GeminiNativeAdapter implements LLMAdapter {
    id = 'gemini-native-adapter';
    provider = 'GeminiNative';

    private googleAdapter = new GoogleAdapter();
    private openAICompatibleAdapter = new OpenAICompatibleAdapter();

    supports(modelId: string): boolean {
        return this.googleAdapter.supports(modelId);
    }

    private resolveRuntime(keySlot: KeySlot, modelId?: string) {
        return resolveProviderRuntime({
            provider: keySlot.provider,
            baseUrl: keySlot.baseUrl,
            format: 'gemini',
            authMethod: keySlot.authMethod,
            headerName: keySlot.headerName,
            compatibilityMode: keySlot.compatibilityMode,
            modelId,
        });
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        const runtime = this.resolveRuntime(keySlot, options.modelId);
        const authMethod = runtime.authMethod as AuthMethod;
        const endpoint = buildGeminiEndpoint(
            keySlot.baseUrl,
            options.modelId,
            'generateContent',
            keySlot.key,
            authMethod,
            keySlot.provider,
        );

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: buildGeminiHeaders(authMethod, keySlot.key, runtime.headerName, runtime.authorizationValueFormat),
            body: JSON.stringify({
                contents: [
                    ...(options.systemPrompt
                        ? [{
                            role: 'user',
                            parts: [{ text: options.systemPrompt }],
                        }]
                        : []),
                    ...options.messages.map((message) => ({
                        role: message.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) }],
                    })),
                ],
                generationConfig: {
                    temperature: options.temperature,
                    maxOutputTokens: options.maxTokens || 2048,
                },
            }),
            signal: options.signal,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Gemini-native chat failed (${response.status}): ${errorText || response.statusText}`);
        }

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        return parts
            .map((part: any) => String(part?.text || ''))
            .join('');
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        const runtime = this.resolveRuntime(keySlot, options.modelId);
        if (runtime.providerFamily === 'google-official') {
            return this.googleAdapter.generateImage(options, keySlot);
        }

        return this.openAICompatibleAdapter.generateImage(options, keySlot);
    }

    async generateVideo(options: VideoGenerationOptions, keySlot: KeySlot): Promise<VideoGenerationResult> {
        return this.googleAdapter.generateVideo!(options, keySlot);
    }

    async generateAudio(options: AudioGenerationOptions, keySlot: KeySlot): Promise<AudioGenerationResult> {
        return this.googleAdapter.generateAudio!(options, keySlot);
    }

    async checkTaskStatus(taskId: string, mode: GenerationMode, keySlot: KeySlot): Promise<any> {
        return this.googleAdapter.checkTaskStatus!(taskId, mode, keySlot);
    }
}
