import { Provider } from '../keyManager';

export type LLMCapability = 'chat' | 'stream' | 'image' | 'video' | 'multimodal';

export interface ProviderCapabilityProfile {
    provider: Provider;
    adapterId: string;
    capability: Record<LLMCapability, boolean>;
    modelPatterns: RegExp[];
    notes?: string;
}

export const PROVIDER_CAPABILITY_REGISTRY: ProviderCapabilityProfile[] = [
    {
        provider: 'Google',
        adapterId: 'google-adapter',
        capability: {
            chat: true,
            stream: false,
            image: true,
            video: true,
            multimodal: true
        },
        modelPatterns: [/^gemini-/i, /^imagen-/i, /^veo-/i],
        notes: 'Official Google routes: Gemini / Imagen / Veo'
    },
    {
        provider: 'OpenAI',
        adapterId: 'openai-compatible-adapter',
        capability: {
            chat: true,
            stream: false,
            image: true,
            video: false,
            multimodal: true
        },
        modelPatterns: [/./],
        notes: 'OpenAI compatible endpoint. Image support via /images or chat extensions'
    },
    {
        provider: 'Anthropic',
        adapterId: 'openai-compatible-adapter',
        capability: {
            chat: true,
            stream: false,
            image: true,
            video: false,
            multimodal: true
        },
        modelPatterns: [/./]
    },
    {
        provider: 'SiliconFlow',
        adapterId: 'openai-compatible-adapter',
        capability: {
            chat: true,
            stream: false,
            image: true,
            video: false,
            multimodal: true
        },
        modelPatterns: [/./]
    },
    {
        provider: 'Custom',
        adapterId: 'openai-compatible-adapter',
        capability: {
            chat: true,
            stream: false,
            image: true,
            video: false,
            multimodal: true
        },
        modelPatterns: [/./],
        notes: 'Custom/provider proxy. Exact capability depends on channel config'
    },
    {
        provider: 'Aliyun',
        adapterId: 'aliyun-adapter',
        capability: {
            chat: true,
            stream: false,
            image: true,
            video: false,
            multimodal: true
        },
        modelPatterns: [/./]
    },
    {
        provider: 'Tencent',
        adapterId: 'tencent-adapter',
        capability: {
            chat: true,
            stream: false,
            image: true,
            video: false,
            multimodal: true
        },
        modelPatterns: [/./]
    },
    {
        provider: 'Volcengine',
        adapterId: 'volcengine-adapter',
        capability: {
            chat: true,
            stream: false,
            image: true,
            video: false,
            multimodal: true
        },
        modelPatterns: [/./]
    }
];

export function getProviderCapability(provider: Provider): ProviderCapabilityProfile | null {
    return PROVIDER_CAPABILITY_REGISTRY.find(item => item.provider === provider) || null;
}

export function modelSupportedByProvider(provider: Provider, modelId: string): boolean {
    const profile = getProviderCapability(provider);
    if (!profile) return false;
    return profile.modelPatterns.some(pattern => pattern.test(modelId));
}
