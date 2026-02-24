import { LLMAdapter, ChatOptions, ImageGenerationOptions } from './LLMAdapter';
import { GoogleAdapter } from './GoogleAdapter';
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter';
import { AliyunAdapter } from './AliyunAdapter';
import { TencentAdapter } from './TencentAdapter';
import { VolcengineAdapter } from './VolcengineAdapter';
import { KeyManager, KeySlot, Provider, getModelMetadata } from '../keyManager';
import { keyManager } from '../keyManager';
import * as costService from '../costService';
import { ImageSize } from '../../types';

export class LLMService {
    private static instance: LLMService;
    private adapters: Map<string, LLMAdapter> = new Map(); // Keyed by Provider string
    private defaultAdapter: LLMAdapter;

    private constructor() {
        // Initialize Adapters
        this.registerAdapter(new GoogleAdapter());

        const openaiAdapter = new OpenAICompatibleAdapter();
        this.registerAdapter(openaiAdapter);
        this.defaultAdapter = openaiAdapter;

        this.registerAdapter(new AliyunAdapter());
        this.registerAdapter(new TencentAdapter());
        this.registerAdapter(new VolcengineAdapter());

        // Alias Logic
        // We map specific provider strings to the OpenAI adapter instance
        this.adapters.set('SiliconFlow', openaiAdapter);
        this.adapters.set('Custom', openaiAdapter);
        this.adapters.set('OpenAI', openaiAdapter);
        this.adapters.set('Anthropic', openaiAdapter);
    }

    public static getInstance(): LLMService {
        if (!LLMService.instance) {
            LLMService.instance = new LLMService();
        }
        return LLMService.instance;
    }

    private registerAdapter(adapter: LLMAdapter) {
        this.adapters.set(adapter.provider, adapter);
    }

    private getAdapter(provider: string): LLMAdapter {
        // 🚀 STRICT ROUTING: No more magic sniffing of 'imagen-' or 'veo-'.
        // The KeySlot provider determines the adapter. 
        // If you want to use a Proxy for Imagen, set Provider to 'Custom' or 'OpenAI'.
        // If you want to use Google Official, set Provider to 'Google'.

        return this.adapters.get(provider) || this.defaultAdapter;
    }

    public async chat(options: ChatOptions): Promise<string> {
        let lastError: any;
        const maxAttempts = 3;

        for (let i = 0; i < maxAttempts; i++) {
            const keySlot = this.resolveKey(options.modelId);
            if (!keySlot) {
                if (i === 0) throw new Error(`No available key for model: ${options.modelId}`);
                break;
            }

            try {
                const adapter = this.getAdapter(keySlot.provider);

                // ✨ Suffix Stripping for API Call
                const baseModelId = options.modelId.split('@')[0];
                const cleanOptions = { ...options, modelId: baseModelId };

                const result = await adapter.chat(cleanOptions, keySlot);
                keyManager.reportSuccess(keySlot.id);

                // Track Usage (Estimate)
                const inputLen = options.messages.reduce((acc, m) => acc + m.content.length, 0);
                const outputLen = result.length;
                const tokens = Math.ceil((inputLen + outputLen) * 0.3);

                keyManager.addUsage(keySlot.id, tokens);

                return result;
            } catch (error: any) {
                lastError = error;
                console.warn(`[LLMService] Chat attempt ${i + 1} failed:`, error);
                keyManager.reportFailure(keySlot.id, error.message);
            }
        }
        throw lastError || new Error("Chat generation failed after retries");
    }

    public async generateImage(options: ImageGenerationOptions): Promise<import('./LLMAdapter').ImageGenerationResult> {
        let lastError: any;
        const maxAttempts = 3;

        for (let i = 0; i < maxAttempts; i++) {
            const keySlot = this.resolveKey(options.modelId);
            if (!keySlot) {
                if (i === 0) throw new Error(`No available key for model: ${options.modelId}`);
                break;
            }

            try {
                const adapter = this.getAdapter(keySlot.provider);

                // ✨ Suffix Stripping for API Call
                const baseModelId = options.modelId.split('@')[0];
                // Note: We might want to pass mapped options here if needed, but Adapter handles it now
                const cleanOptions = { ...options, modelId: baseModelId };

                const result = await adapter.generateImage(cleanOptions, keySlot);
                keyManager.reportSuccess(keySlot.id);

                // Track Cost & Usage
                // If Adapter returns usage, use it. Else estimate.

                let tokensForStats = result.usage?.totalTokens || 0;
                let costForStats = result.usage?.cost || 0;

                const sizeRaw = (options.imageSize) || ImageSize.SIZE_1K;
                // Note: options.imageSize is now string, locally we often use Enum '1K','2K'. 
                // Adapter returns real size used in result.imageSize

                const count = options.imageCount || 1;
                const refCount = options.referenceImages?.length || 0;

                if (tokensForStats === 0 || costForStats === 0) {
                    // Get estimate fallback using costService
                    try {
                        const est = costService.calculateCost(options.modelId, sizeRaw as ImageSize, count, options.prompt.length, refCount);
                        if (tokensForStats === 0) tokensForStats = est.tokens;
                        if (costForStats === 0) costForStats = est.cost;
                    } catch (e) {
                        // Ignore est error
                    }
                }

                keyManager.addUsage(keySlot.id, tokensForStats);
                keyManager.addCost(keySlot.id, costForStats);

                // Ensure result has usage populated for caller
                if (!result.usage) {
                    result.usage = { totalTokens: tokensForStats, cost: costForStats };
                } else {
                    if (!result.usage.cost) result.usage.cost = costForStats;
                    if (!result.usage.totalTokens) result.usage.totalTokens = tokensForStats;
                }

                if (!result.provider) {
                    result.provider = keySlot.provider;
                }

                // ✨ Populate Names for Display
                if (!result.providerName) {
                    result.providerName = keySlot.name || keySlot.provider;
                }
                if (!result.modelName) {
                    const metadata = getModelMetadata(baseModelId);
                    result.modelName = metadata?.name || baseModelId;
                }

                return result;
            } catch (error: any) {
                lastError = error;
                console.warn(`[LLMService] Image attempt ${i + 1} failed:`, error);
                keyManager.reportFailure(keySlot.id, error.message);
            }
        }
        throw lastError || new Error("Image generation failed after retries");
    }

    public resolveKey(modelId: string): KeySlot | null {
        const keyData = keyManager.getNextKey(modelId);
        if (!keyData) return null;
        return keyData as KeySlot;
    }
}

export const llmService = LLMService.getInstance();
