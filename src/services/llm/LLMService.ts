import { LLMAdapter, ChatOptions, ImageGenerationOptions, ImageGenerationResult, VideoGenerationOptions, VideoGenerationResult, AudioGenerationOptions, AudioGenerationResult, ProviderConfig } from './LLMAdapter';
import { GenerationMode } from '../../types';
import { GoogleAdapter } from './GoogleAdapter';
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter';
import { AliyunAdapter } from './AliyunAdapter';
import { TencentAdapter } from './TencentAdapter';
import { VolcengineAdapter } from './VolcengineAdapter';
import { VideoCompatibleAdapter } from './VideoCompatibleAdapter';
import { AudioCompatibleAdapter } from './AudioCompatibleAdapter';
import { KeyManager, KeySlot, getModelMetadata } from '../auth/keyManager';
import { keyManager } from '../auth/keyManager';
import * as costService from '../billing/costService';
import { logWarning } from '../system/systemLogService';
import { ImageSize, Provider } from '../../types';
import { getProviderCapability, modelSupportedByProvider, ProviderCapabilityProfile } from './providerCapabilities';
import { supabase } from '../../lib/supabase';
import { creditService } from '../billing/creditService';
import { callSecureSystemProxyChat } from '../model/secureModelProxy';

export class LLMService {
    private static instance: LLMService;
    private adapters: Map<string, LLMAdapter> = new Map(); // Keyed by Provider string
    private defaultAdapter: LLMAdapter;
    private videoAdapter: VideoCompatibleAdapter;
    private audioAdapter: AudioCompatibleAdapter;

    private constructor() {
        // Initialize Adapters
        this.registerAdapter(new GoogleAdapter());

        const openaiAdapter = new OpenAICompatibleAdapter();
        this.registerAdapter(openaiAdapter);
        this.defaultAdapter = openaiAdapter;

        this.registerAdapter(new AliyunAdapter());
        this.registerAdapter(new TencentAdapter());
        this.registerAdapter(new VolcengineAdapter());

        this.videoAdapter = new VideoCompatibleAdapter();
        this.audioAdapter = new AudioCompatibleAdapter();

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
        // 馃殌 STRICT ROUTING: No more magic sniffing of 'imagen-' or 'veo-'.
        // The KeySlot provider determines the adapter. 
        // If you want to use a Proxy for Imagen, set Provider to 'Custom' or 'OpenAI'.
        // If you want to use Google Official, set Provider to 'Google'.

        return this.adapters.get(provider) || this.defaultAdapter;
    }

    private resolveSystemBaseModelId(modelId: string): string {
        const [baseModelId] = (modelId || '').split('@');
        return baseModelId.trim();
    }

    private async getSystemProxyCallConfig(modelId: string): Promise<{
        baseUrl: string;
        apiKey: string;
        endpointType?: string;
    } | null> {
        const resolvedModelId = this.resolveSystemBaseModelId(modelId);

        const tryRpc = async (payload: Record<string, string>) => {
            return await supabase.rpc('get_credit_model_for_call', payload);
        };

        const tryExtractFromRpc = async (candidateId: string) => {
            let rpcResult = await tryRpc({ p_model_id: candidateId });
            if (rpcResult.error) {
                rpcResult = await tryRpc({ model_id: candidateId });
            }

            if (rpcResult.error) {
                return { config: null as null, error: rpcResult.error };
            }

            const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
            if (!row?.api_key || !row?.base_url) {
                return { config: null as null, error: null };
            }

            return {
                config: {
                    baseUrl: String(row.base_url),
                    apiKey: String(row.api_key),
                    endpointType: row.endpoint_type ? String(row.endpoint_type) : undefined
                },
                error: null
            };
        };

        const rpcCandidates = [resolvedModelId, `${resolvedModelId}@system`];
        let lastRpcError: any = null;
        for (const candidateId of rpcCandidates) {
            const { config, error } = await tryExtractFromRpc(candidateId);
            if (config) return config;
            if (error) lastRpcError = error;
        }

        // Compatibility fallback:
        // Some projects have not deployed get_credit_model_for_call RPC yet.
        // In that case we try reading from table directly (works only if policy allows).
        const { data: tableRows, error: tableError } = await supabase
            .from('admin_credit_models')
            .select('base_url, api_keys, endpoint_type, model_id, is_active')
            .in('model_id', rpcCandidates)
            .eq('is_active', true)
            .limit(10);

        if (!tableError && Array.isArray(tableRows) && tableRows.length > 0) {
            const row = tableRows[0] as any;
            const keys = Array.isArray(row?.api_keys)
                ? row.api_keys.map((k: unknown) => String(k || '').trim()).filter(Boolean)
                : [];
            const selectedKey = keys.length > 0
                ? keys[Math.floor(Math.random() * keys.length)]
                : '';

            if (selectedKey && row?.base_url) {
                return {
                    baseUrl: String(row.base_url),
                    apiKey: selectedKey,
                    endpointType: row.endpoint_type ? String(row.endpoint_type) : undefined
                };
            }
        }

        if (lastRpcError || tableError) {
            console.error('[LLMService] Failed to get system proxy config:', {
                modelId: resolvedModelId,
                rpcError: lastRpcError ? {
                    message: lastRpcError.message,
                    code: lastRpcError.code,
                    details: lastRpcError.details,
                    hint: lastRpcError.hint
                } : null,
                tableError: tableError ? {
                    message: tableError.message,
                    code: tableError.code,
                    details: tableError.details,
                    hint: tableError.hint
                } : null
            });
        }

        return null;
    }

    /**
     * Helper to prepare system proxy model details and deduct credits.
     * Required so we use the admin configured base URL and API key and accurately deduct user balances.
     */
    private async prepareSystemProxy(keySlot: KeySlot, modelId: string): Promise<{ slot: KeySlot, transactionId?: string }> {
        if (keySlot.provider !== 'SystemProxy') return { slot: keySlot };
        const baseModelId = this.resolveSystemBaseModelId(modelId);
        const config = await this.getSystemProxyCallConfig(modelId);
        if (!config) {
            throw new Error(`无法从 Supabase 加载系统模型路由：${baseModelId}`);
        }

        // Build a temporary slot with server-managed route values for this request.
        // This keeps adapter code unchanged while resolving model config dynamically.


        // Replace placeholder key/baseUrl with resolved values.
        const newSlot: KeySlot = {
            ...keySlot,
            key: config.apiKey,
            baseUrl: config.baseUrl
        };

        return { slot: newSlot };
    }

    public getProviderProfile(provider: Provider): ProviderCapabilityProfile | null {
        return getProviderCapability(provider);
    }

    public getProviderProfiles(): ProviderCapabilityProfile[] {
        const providers: Provider[] = ['Google', 'OpenAI', 'Anthropic', 'Aliyun', 'Tencent', 'Volcengine', 'SiliconFlow', 'Custom'];
        return providers
            .map(item => getProviderCapability(item))
            .filter((item): item is ProviderCapabilityProfile => !!item);
    }

    public canProviderHandleModel(provider: Provider, modelId: string): boolean {
        return modelSupportedByProvider(provider, modelId);
    }

    public async chat(options: ChatOptions): Promise<string> {
        let lastError: any;
        const maxAttempts = 3;

        for (let i = 0; i < maxAttempts; i++) {
            const keySlot = this.resolveKey(options.modelId, options.preferredKeyId);
            if (!keySlot) {
                if (i === 0) throw new Error(`No available key for model: ${options.modelId} `);
                break;
            }

            try {
                if (keySlot.provider === 'SystemProxy') {
                    const response = await callSecureSystemProxyChat({
                        modelId: options.modelId,
                        messages: options.messages.map((message) => ({
                            role: message.role as 'system' | 'user' | 'assistant',
                            content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                        })),
                        temperature: options.temperature,
                        maxTokens: options.maxTokens,
                        stream: false,
                    });

                    keyManager.reportSuccess(keySlot.id);
                    return response.content;
                }

                const adapter = this.getAdapter(keySlot.provider);

                if (!this.canProviderHandleModel(keySlot.provider, options.modelId)) {
                    throw new Error(`Provider ${keySlot.provider} does not match model ${options.modelId} `);
                }

                const baseModelId = options.modelId.split('@')[0];
                const cleanOptions = { ...options, modelId: baseModelId };

                const callerOnStream = options.onStream;
                let streamedText = '';
                const streamOptions = {
                    ...cleanOptions,
                    onStream: (chunk: string) => {
                        streamedText += chunk;
                        callerOnStream?.(chunk);
                    }
                };

                let result: string;
                if (options.stream && adapter.chatStream) {
                    await adapter.chatStream(streamOptions, keySlot);
                    result = streamedText;
                } else {
                    result = await adapter.chat(cleanOptions, keySlot);
                }
                keyManager.reportSuccess(keySlot.id);

                const inputLen = options.messages.reduce((acc, m) => acc + m.content.length, 0);
                const outputLen = result.length;
                const tokens = Math.ceil((inputLen + outputLen) * 0.3);

                keyManager.addUsage(keySlot.id, tokens);
                if (keySlot.creditCost !== undefined) {
                    keyManager.addCost(keySlot.id, keySlot.creditCost);
                }

                return result;
            } catch (error: any) {
                lastError = error;
                console.warn(`[LLMService] Chat attempt ${i + 1} failed: `, error);

                logWarning('LLMService', `Chat attempt ${i + 1} failed(${keySlot.name})`,
                    `Model: ${options.modelId} \nProvider: ${keySlot.provider} \nError: ${error.message} `);

                keyManager.reportFailure(keySlot.id, error.message);
            }
        }
        throw lastError || new Error("Chat generation failed after retries");
    }
    public async generateImage(options: ImageGenerationOptions, onTaskId?: (id: string) => void): Promise<import('./LLMAdapter').ImageGenerationResult> {
        let lastError: any;
        const maxAttempts = 3;

        for (let i = 0; i < maxAttempts; i++) {
            let keySlot = this.resolveKey(options.modelId, options.preferredKeyId);
            if (!keySlot) {
                if (i === 0) throw new Error(`No available key for model: ${options.modelId} `);
                break;
            }

            let transactionId: string | undefined;
            // 馃殌 [Fix] For system credit models, fetch actual config and handle billing
            if (keySlot.provider === 'SystemProxy') {
                const prep = await this.prepareSystemProxy(keySlot, options.modelId);
                keySlot = prep.slot;
                transactionId = prep.transactionId;
            }

            try {
                const adapter = this.getAdapter(keySlot.provider);

                if (keySlot.provider !== 'SystemProxy' && !this.canProviderHandleModel(keySlot.provider, options.modelId)) {
                    throw new Error(`Provider ${keySlot.provider} does not match model ${options.modelId} `);
                }

                // 鉁?Suffix Stripping for API Call
                const fullBaseId = options.modelId.split('@')[0];
                const cleanModelId = fullBaseId.split('|')[0]; // Strip Provider/Name metadata

                // Note: We might want to pass mapped options here if needed, but Adapter handles it now
                const cleanOptions: any = { ...options, modelId: cleanModelId, onTaskId };

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
                        const est = costService.calculateCost(options.modelId, sizeRaw as ImageSize, count, options.prompt.length, refCount, keySlot.id);
                        if (tokensForStats === 0) tokensForStats = est.tokens;
                        if (costForStats === 0) costForStats = keySlot.creditCost !== undefined ? keySlot.creditCost : est.cost;
                    } catch (e) {
                        // Ignore est error
                        if (costForStats === 0 && keySlot.creditCost !== undefined) costForStats = keySlot.creditCost;
                    }
                } else if (keySlot.creditCost !== undefined) {
                    // Override with user custom cost if provided
                    costForStats = keySlot.creditCost;
                }

                // 系统积分模型不计入用户渠道 token/cost 统计，避免“积分 + 用户API”双重消耗感知
                const isSystemRoute = keySlot.provider === 'SystemProxy';
                if (!isSystemRoute) {
                    keyManager.addUsage(keySlot.id, tokensForStats);
                    keyManager.addCost(keySlot.id, costForStats);
                }

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
                if (!result.keySlotId) {
                    result.keySlotId = keySlot.id;
                }

                // 鉁?Populate Names for Display
                if (!result.providerName) {
                    result.providerName = keySlot.name || keySlot.provider;
                }
                if (!result.modelName) {
                    const metadata = getModelMetadata(cleanModelId);
                    result.modelName = metadata?.name || cleanModelId;
                }

                return result;
            } catch (error: any) {
                if (transactionId) {
                    await creditService.refundCredits(transactionId, 'image_generation_failed');
                }
                lastError = error;
                console.warn(`[LLMService] Image attempt ${i + 1} failed: `, error);

                // 馃殌 [鏃ュ織澧炲己] 璁板綍鍗曟灏濊瘯澶辫触
                logWarning('LLMService', `Image generation attempt ${i + 1} failed(${keySlot.name})`,
                    `Model: ${options.modelId} \nProvider: ${keySlot.provider} \nError: ${error.message} `);

                keyManager.reportFailure(keySlot.id, error.message);
            }
        }
        throw lastError || new Error("Image generation failed after retries");
    }

    public resolveKey(modelId: string, preferredKeyId?: string): KeySlot | null {
        const lowerModelId = modelId.toLowerCase();
        const isSystemRoute = lowerModelId.includes('@system');

        if (isSystemRoute) {
            // For system credit models, return a virtual slot
            // The actual API key will be fetched by the adapter using modelCaller
            return {
                id: 'system_proxy_slot',
                key: 'system_proxy_key', // Placeholder, will be replaced by adapter
                name: 'System Proxy',
                provider: 'SystemProxy' as Provider,
                baseUrl: '', // Will be determined by adapter
                status: 'valid',
                supportedModels: [modelId.split('@')[0]],
                authMethod: 'header',
                headerName: 'Authorization',
                disabled: false,
            } as KeySlot;
        }

        const keyData = keyManager.getNextKey(modelId, preferredKeyId);
        if (!keyData) return null;
        return keyData as KeySlot;
    }

    public async generateVideo(options: VideoGenerationOptions, onTaskId?: (id: string) => void): Promise<VideoGenerationResult> {
        let lastError: any;
        const maxAttempts = 3;

        for (let i = 0; i < maxAttempts; i++) {
            let keySlot = this.resolveKey(options.modelId, options.preferredKeyId);
            if (!keySlot) {
                if (i === 0) throw new Error(`No available key for model: ${options.modelId} `);
                break;
            }

            let transactionId: string | undefined;
            // 馃殌 [Fix] For system credit models, fetch actual config and handle billing
            if (keySlot.provider === 'SystemProxy') {
                const prep = await this.prepareSystemProxy(keySlot, options.modelId);
                keySlot = prep.slot;
                transactionId = prep.transactionId;
            }

            try {
                const adapter = this.getAdapter(keySlot.provider);
                const targetAdapter = adapter.generateVideo ? adapter : this.videoAdapter;

                // 鉁?Suffix Stripping for API Call
                const fullBaseId = options.modelId.split('@')[0];
                const cleanModelId = fullBaseId.split('|')[0]; // Strip Provider/Name metadata
                const cleanOptions: any = { ...options, modelId: cleanModelId, onTaskId };

                const result = await targetAdapter.generateVideo!(cleanOptions, keySlot);
                keyManager.reportSuccess(keySlot.id);

                if (!result.provider) result.provider = keySlot.provider;
                if (!result.providerName) result.providerName = keySlot.name || keySlot.provider;
                if (!result.modelName) {
                    const metadata = getModelMetadata(cleanModelId);
                    result.modelName = metadata?.name || cleanModelId;
                }
                if (!result.keySlotId) {
                    result.keySlotId = keySlot.id;
                }

                if (keySlot.creditCost !== undefined && keySlot.provider !== 'SystemProxy') {
                    keyManager.addCost(keySlot.id, keySlot.creditCost);
                }

                return result;
            } catch (error: any) {
                if (transactionId) {
                    await creditService.refundCredits(transactionId, 'video_generation_failed');
                }
                lastError = error;
                console.warn(`[LLMService] Video attempt ${i + 1} failed: `, error);

                // 馃殌 [鏃ュ織澧炲己] 璁板綍鍗曟灏濊瘯澶辫触
                logWarning('LLMService', `Video generation attempt ${i + 1} failed(${keySlot.name})`,
                    `Model: ${options.modelId} \nProvider: ${keySlot.provider} \nError: ${error.message} `);

                keyManager.reportFailure(keySlot.id, error.message);
            }
        }
        throw lastError || new Error("Video generation failed after retries");
    }

    public async generateAudio(options: AudioGenerationOptions, onTaskId?: (id: string) => void): Promise<AudioGenerationResult> {
        let lastError: any;
        const maxAttempts = 3;

        for (let i = 0; i < maxAttempts; i++) {
            let keySlot = this.resolveKey(options.modelId, options.preferredKeyId);
            if (!keySlot) {
                if (i === 0) throw new Error(`No available key for model: ${options.modelId} `);
                break;
            }

            let transactionId: string | undefined;
            // 馃殌 [Fix] For system credit models, fetch actual config and handle billing
            if (keySlot.provider === 'SystemProxy') {
                const prep = await this.prepareSystemProxy(keySlot, options.modelId);
                keySlot = prep.slot;
                transactionId = prep.transactionId;
            }

            try {
                const adapter = this.getAdapter(keySlot.provider);
                const targetAdapter = adapter.generateAudio ? adapter : this.audioAdapter;

                // 鉁?Suffix Stripping for API Call
                const cleanModelId = options.modelId.split('@')[0];
                const cleanOptions: any = { ...options, modelId: cleanModelId, onTaskId };

                const result = await targetAdapter.generateAudio!(cleanOptions, keySlot);
                keyManager.reportSuccess(keySlot.id);

                if (!result.provider) result.provider = keySlot.provider;
                if (!result.providerName) result.providerName = keySlot.name || keySlot.provider;
                if (!result.modelName) {
                    const metadata = getModelMetadata(cleanModelId);
                    result.modelName = metadata?.name || cleanModelId;
                }
                if (!result.keySlotId) {
                    result.keySlotId = keySlot.id;
                }

                if (keySlot.creditCost !== undefined && keySlot.provider !== 'SystemProxy') {
                    keyManager.addCost(keySlot.id, keySlot.creditCost);
                }

                return result;
            } catch (error: any) {
                if (transactionId) {
                    await creditService.refundCredits(transactionId, 'audio_generation_failed');
                }
                lastError = error;
                console.warn(`[LLMService] Audio attempt ${i + 1} failed: `, error);

                // 馃殌 [鏃ュ織澧炲己] 璁板綍鍗曟灏濊瘯澶辫触
                logWarning('LLMService', `Audio generation attempt ${i + 1} failed(${keySlot.name})`,
                    `Model: ${options.modelId} \nProvider: ${keySlot.provider} \nError: ${error.message} `);

                keyManager.reportFailure(keySlot.id, error.message);
            }
        }
        throw lastError || new Error("Audio generation failed after retries");
    }

    /**
     * 馃殌 [Persistence] Check status/poll for background tasks
     */
    public async checkTaskStatus(taskId: string, mode: GenerationMode, preferredKeyId?: string): Promise<any> {
        // Try to get the key first to identify the provider
        const nextKey = keyManager.getNextKey(mode === GenerationMode.VIDEO ? 'veo-3.1-generate-preview' : 'gemini-1.5-flash', preferredKeyId);
        if (!nextKey) throw new Error("No API key available to check task status");

        const keySlot = keyManager.getKey(nextKey.id);
        if (!keySlot) throw new Error("No API key available to check task status");

        const adapter = this.getAdapter(keySlot.provider);
        if (!adapter.checkTaskStatus) {
            throw new Error(`Adapter for ${keySlot.provider} does not support task polling`);
        }

        const result = await adapter.checkTaskStatus(taskId, mode, keySlot);

        // Enrich result with provider info (consistent with generate methods)
        if (!result.provider) result.provider = keySlot.provider;
        if (!result.providerName) result.providerName = keySlot.name || keySlot.provider;
        if (!result.keySlotId) result.keySlotId = keySlot.id;

        return result;
    }
}

export const llmService = LLMService.getInstance();


