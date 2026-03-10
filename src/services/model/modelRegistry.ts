import { ModelType, ImageSize, Provider } from '../../types';

export interface ModelCapability {
    id: string;
    name: string;
    provider: Provider;
    type: 'chat' | 'image' | 'video' | 'audio';
    contextWindow?: number;
    maxOutputTokens?: number;
    costPer1kInput?: number; // USD
    costPer1kOutput?: number; // USD
    pricingRef?: string; // 引用 pricing key
    isVision?: boolean;
    isSystemInternal?: boolean; // 🚀 是否是系统内置模型
}

// 静态模型注册表 (Phase 1: 基础填充)
export const MODEL_REGISTRY: Record<string, ModelCapability> = {
    // --- Google ---
    'gemini-2.0-flash-exp': { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', provider: 'Google', type: 'chat', contextWindow: 1048576, isVision: true },
    'gemini-1.5-pro-latest': { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', provider: 'Google', type: 'chat', contextWindow: 2097152, isVision: true },
    'gemini-1.5-flash-latest': { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash', provider: 'Google', type: 'chat', contextWindow: 1048576, isVision: true },
    'imagen-3.0-generate-001': { id: 'imagen-3.0-generate-001', name: 'Imagen 3', provider: 'Google', type: 'image' },
    'imagen-3.0-fast-generate-001': { id: 'imagen-3.0-fast-generate-001', name: 'Imagen 3 Fast', provider: 'Google', type: 'image' },
    'imagen-4.0-generate-001': { id: 'imagen-4.0-generate-001', name: 'Imagen 4', provider: 'Google', type: 'image' },
    'imagen-4.0-fast-generate-001': { id: 'imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast', provider: 'Google', type: 'image' },
    'imagen-4.0-ultra-generate-001': { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra', provider: 'Google', type: 'image' },
    'gemini-3.1-flash-image-preview': { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', provider: 'Google', type: 'image' },
    'gemini-3-pro-image-preview': { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro', provider: 'Google', type: 'image' },
    'gemini-2.5-flash-image': { id: 'gemini-2.5-flash-image', name: 'Nano Banana', provider: 'Google', type: 'image' },
    'veo-2.0-generate-001': { id: 'veo-2.0-generate-001', name: 'Veo 2.0', provider: 'Google', type: 'video' },
    'lyria-realtime-v1': { id: 'lyria-realtime-v1', name: 'Lyria Music', provider: 'Google', type: 'audio', isSystemInternal: true },
    'gemini-2.0-flash-audio': { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Audio', provider: 'Google', type: 'audio' },

    // --- OpenAI ---
    'gpt-4o': { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', type: 'chat', contextWindow: 128000, isVision: true },
    'gpt-4o-mini': { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', type: 'chat', contextWindow: 128000, isVision: true },
    'o1-preview': { id: 'o1-preview', name: 'o1 Preview', provider: 'OpenAI', type: 'chat', contextWindow: 128000 },
    'dall-e-3': { id: 'dall-e-3', name: 'DALL·E 3', provider: 'OpenAI', type: 'image' },

    // --- Anthropic ---
    'claude-3-5-sonnet-20241022': { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', type: 'chat', contextWindow: 200000, isVision: true },
    'claude-3-5-haiku-20241022': { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'Anthropic', type: 'chat', contextWindow: 200000 },

    // --- Volcengine (Doubao) ---
    'doubao-pro-32k': { id: 'doubao-pro-32k', name: 'Doubao Pro 32k', provider: 'Volcengine', type: 'chat', contextWindow: 32768 },
    'doubao-lite-32k': { id: 'doubao-lite-32k', name: 'Doubao Lite 32k', provider: 'Volcengine', type: 'chat', contextWindow: 32768 },
    'doubao-pro-128k': { id: 'doubao-pro-128k', name: 'Doubao Pro 128k', provider: 'Volcengine', type: 'chat', contextWindow: 131072 },

    // --- Aliyun (Qwen) ---
    'qwen-max': { id: 'qwen-max', name: 'Qwen Max', provider: 'Aliyun', type: 'chat', contextWindow: 32768 },
    'qwen-plus': { id: 'qwen-plus', name: 'Qwen Plus', provider: 'Aliyun', type: 'chat', contextWindow: 131072 },
    'qwen-turbo': { id: 'qwen-turbo', name: 'Qwen Turbo', provider: 'Aliyun', type: 'chat', contextWindow: 131072 },
    'wanx-v1': { id: 'wanx-v1', name: 'Wanx V1', provider: 'Aliyun', type: 'image' },
    'wanx-v2': { id: 'wanx-v2', name: 'Wanx V2', provider: 'Aliyun', type: 'image' },

    // --- Tencent (Hunyuan) ---
    'hunyuan-pro': { id: 'hunyuan-pro', name: 'Hunyuan Pro', provider: 'Tencent', type: 'chat' },
    'hunyuan-lite': { id: 'hunyuan-lite', name: 'Hunyuan Lite', provider: 'Tencent', type: 'chat' },
    'hunyuan-standard': { id: 'hunyuan-standard', name: 'Hunyuan Standard', provider: 'Tencent', type: 'chat' },
    'hunyuan-vision': { id: 'hunyuan-vision', name: 'Hunyuan Vision', provider: 'Tencent', type: 'chat', isVision: true },

    // --- SiliconFlow ---
    'deepseek-ai/DeepSeek-V3': { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', provider: 'SiliconFlow', type: 'chat' },
    'deepseek-ai/DeepSeek-R1': { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', provider: 'SiliconFlow', type: 'chat' },
    'black-forest-labs/FLUX.1-schnell': { id: 'black-forest-labs/FLUX.1-schnell', name: 'FLUX.1 Schnell', provider: 'SiliconFlow', type: 'image' },
    'black-forest-labs/FLUX.1-dev': { id: 'black-forest-labs/FLUX.1-dev', name: 'FLUX.1 Dev', provider: 'SiliconFlow', type: 'image' },
    'stabilityai/stable-diffusion-3-5-large': { id: 'stabilityai/stable-diffusion-3-5-large', name: 'SD 3.5 Large', provider: 'SiliconFlow', type: 'image' },

    // --- Proxy / Common ---
    'midjourney': { id: 'midjourney', name: 'Midjourney V6', provider: 'Custom', type: 'image' },
    'mj-chat': { id: 'mj-chat', name: 'Midjourney Chat', provider: 'Custom', type: 'image' },
    'suno-v3.5': { id: 'suno-v3.5', name: 'Suno v3.5', provider: 'Custom', type: 'audio' },
    'flux-pro': { id: 'flux-pro', name: 'FLUX Pro', provider: 'Custom', type: 'image' },
    'ideogram': { id: 'ideogram', name: 'Ideogram', provider: 'Custom', type: 'image' },
    'kling-v1': { id: 'kling-v1', name: 'Kling Video', provider: 'Custom', type: 'video' },
    'luma-dream-machine': { id: 'luma-dream-machine', name: 'Luma Dream Machine', provider: 'Custom', type: 'video' },
};

export const getModelsByProvider = (provider: Provider): ModelCapability[] => {
    return Object.values(MODEL_REGISTRY).filter(m => m.provider === provider);
};

export const getModelInfo = (modelId: string): ModelCapability | undefined => {
    return MODEL_REGISTRY[modelId];
};

/**
 * Compatible Interface for UI components (ActiveModel)
 */
export interface ActiveModel {
    id: string;
    label: string;
    provider: Provider;
    type: string;
    enabled: boolean;
    description?: string;
    isSystemInternal?: boolean;
    creditCost?: number;
    colorStart?: string;
    colorEnd?: string;
    colorSecondary?: string;
    textColor?: 'white' | 'black';
    providerLabel?: string;
    providerLogo?: string;
    tags?: string[];
    tokenGroup?: string;
    billingType?: string;
    endpointType?: string;
}

/**
 * Compatible Registry Object for UI components
 */
export const modelRegistry = {
    getModels: (): ActiveModel[] => {
        return Object.values(MODEL_REGISTRY).map(m => ({
            id: m.id,
            label: m.name,
            provider: m.provider,
            type: m.type,
            enabled: true,
            isSystemInternal: m.isSystemInternal
        }));
    }
};

