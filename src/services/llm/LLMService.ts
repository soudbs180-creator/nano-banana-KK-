import { LLMAdapter, ChatOptions, ImageGenerationOptions } from './LLMAdapter';
import { GoogleAdapter } from './GoogleAdapter';
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter';
import { AliyunAdapter } from './AliyunAdapter';
import { TencentAdapter } from './TencentAdapter';
import { VolcengineAdapter } from './VolcengineAdapter';
import { KeyManager, KeySlot, Provider } from '../keyManager';
import { keyManager } from '../keyManager';
import { MODEL_REGISTRY } from '../modelRegistry';
import * as costService from '../costService';
import { ImageSize } from '../../types';

export class LLMService {
    private static instance: LLMService;
    private adapters: Map<Provider, LLMAdapter> = new Map();
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

        // Map other providers to OpenAICompatible
        this.adapters.set('SiliconFlow', openaiAdapter);
        this.adapters.set('Custom', openaiAdapter);
        this.adapters.set('OpenAI', openaiAdapter);
        this.adapters.set('Anthropic', openaiAdapter); // Assuming Anthropic via OpenAI-compat proxy for now
    }

    public static getInstance(): LLMService {
        if (!LLMService.instance) {
            LLMService.instance = new LLMService();
        }
        return LLMService.instance;
    }

    private registerAdapter(adapter: LLMAdapter) {
        // Map adapter.provider string to Provider enum if possible
        // But our Adapter interface has 'provider' as string.
        // We manually map known ones.
        if (adapter.provider === 'Google') this.adapters.set('Google', adapter);
        if (adapter.provider === 'Aliyun') this.adapters.set('Aliyun', adapter);
        if (adapter.provider === 'Tencent') this.adapters.set('Tencent', adapter);
        if (adapter.provider === 'Volcengine') this.adapters.set('Volcengine', adapter);
    }

    private getAdapter(provider: Provider): LLMAdapter {
        return this.adapters.get(provider) || this.defaultAdapter;
    }

    public async chat(options: ChatOptions): Promise<string> {
        let lastError: any;
        const maxAttempts = 3;

        for (let i = 0; i < maxAttempts; i++) {
            const keySlot = this.resolveKey(options.modelId);
            if (!keySlot) {
                // Only throw if it's the first attempt or we really can't find any key
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
                // Rough estimate: 1 char = 0.3 tokens (Chinese/English mix)
                const tokens = Math.ceil((inputLen + outputLen) * 0.3);

                keyManager.addUsage(keySlot.id, tokens);

                return result;
            } catch (error: any) {
                lastError = error;
                console.warn(`[LLMService] Chat attempt ${i + 1} failed:`, error);
                keyManager.reportFailure(keySlot.id, error.message);
                // Continue loop to get next key
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
                // The keySlot was resolved using the full ID (with suffix), but the API call needs the base ID.
                const baseModelId = options.modelId.split('@')[0];
                const cleanOptions = { ...options, modelId: baseModelId };

                const result = await adapter.generateImage(cleanOptions, keySlot);
                keyManager.reportSuccess(keySlot.id);

                // Track Cost
                const size = (options.imageSize as ImageSize) || ImageSize.SIZE_1K;
                const count = options.imageCount || 1;
                const refCount = options.referenceImages?.length || 0;

                // Priority: Explicit Usage > Estimated Usage
                // We pass the explicit usage to recordCost to handle calculation
                costService.recordCost(options.modelId, size, count, options.prompt, refCount, result.usage);

                // Also update Key Slot stats (Using the final calculated values? Or raw usage?)
                // Usage in Result might NOT have cost if we calculated it inside recordCost.
                // We might want recordCost to RETURN the final values. 
                // For now, let's use what we have or fall back to estimate for KeyStats.

                let tokensForStats = result.usage?.totalTokens || 0;
                let costForStats = result.usage?.cost || 0;

                if (tokensForStats === 0 || costForStats === 0) {
                    // Get estimate fallback
                    const est = costService.calculateCost(options.modelId, size, count, options.prompt.length, refCount);
                    if (tokensForStats === 0) tokensForStats = est.tokens;
                    if (costForStats === 0) costForStats = est.cost;
                }

                keyManager.addUsage(keySlot.id, tokensForStats);
                keyManager.addCost(keySlot.id, costForStats);

                // Ensure result has usage populated for caller if possible
                if (!result.usage) {
                    result.usage = { totalTokens: tokensForStats, cost: costForStats };
                } else {
                    if (!result.usage.cost) result.usage.cost = costForStats;
                    if (!result.usage.totalTokens) result.usage.totalTokens = tokensForStats;
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

    private resolveKey(modelId: string): KeySlot | null {
        // Use KeyManager to specific key
        const keyData = keyManager.getNextKey(modelId);
        if (!keyData) return null;
        return keyData as KeySlot; // Cast compatible shape
    }
}

export const llmService = LLMService.getInstance();
