import type { Provider } from '../../types';

export type ProviderStrategyFormat = 'auto' | 'openai' | 'gemini';
export type ProviderStrategyAuthMethod = 'query' | 'header';
export type ProviderStrategyAuthorizationValueFormat = 'bearer' | 'raw';
export type ProviderStrategyCompatibilityMode = 'standard' | 'chat';
export type ProviderStrategyImageProfile =
    | 'openai-strict'
    | 'siliconflow'
    | 'gpt-best-extended'
    | 'antigravity'
    | 'chat-preferred';
export type ProviderStrategyVideoApiStyle = 'openai-v1-videos' | 'legacy-video-generations';

export interface ProviderStrategy {
    id: string;
    label: string;
    known: boolean;
    providerPatterns?: RegExp[];
    hostPatterns?: RegExp[];
    basePatterns?: RegExp[];
    defaultFormat?: ProviderStrategyFormat;
    defaultAuthMethod?: ProviderStrategyAuthMethod;
    geminiAuthMethod?: ProviderStrategyAuthMethod;
    defaultHeaderName?: string;
    authorizationValueFormat?: ProviderStrategyAuthorizationValueFormat;
    defaultCompatibilityMode?: ProviderStrategyCompatibilityMode;
    imageProfile?: ProviderStrategyImageProfile;
    videoApiStyle?: ProviderStrategyVideoApiStyle;
    autoGeminiNativeForGeminiModels?: boolean;
    respectProviderOnCustomHost?: boolean;
    uiProvider?: string;
}

export interface ProviderRuntimeInput {
    provider?: string | Provider;
    baseUrl?: string;
    format?: unknown;
    authMethod?: unknown;
    headerName?: string;
    compatibilityMode?: unknown;
    modelId?: string;
    fallbackFormat?: Exclude<ProviderStrategyFormat, 'auto'>;
}

export interface ResolvedProviderRuntime {
    strategy: ProviderStrategy;
    strategyId: string;
    providerName: string;
    baseUrl: string;
    host: string;
    requestedFormat: ProviderStrategyFormat;
    resolvedFormat: Exclude<ProviderStrategyFormat, 'auto'>;
    authMethod: ProviderStrategyAuthMethod;
    headerName: string;
    authorizationValueFormat: ProviderStrategyAuthorizationValueFormat;
    compatibilityMode: ProviderStrategyCompatibilityMode;
    geminiNative: boolean;
    imageProfile: ProviderStrategyImageProfile;
    videoApiStyle: ProviderStrategyVideoApiStyle;
    isKnownProvider: boolean;
    uiProvider: string;
}

const GOOGLE_API_HEADER = 'x-goog-api-key';
const AUTHORIZATION_HEADER = 'Authorization';

const FALLBACK_STRATEGY: ProviderStrategy = {
    id: 'generic-openai',
    label: 'Generic OpenAI-Compatible',
    known: false,
    defaultFormat: 'openai',
    defaultAuthMethod: 'header',
    geminiAuthMethod: 'header',
    defaultHeaderName: AUTHORIZATION_HEADER,
    authorizationValueFormat: 'bearer',
    defaultCompatibilityMode: 'standard',
    imageProfile: 'openai-strict',
    videoApiStyle: 'openai-v1-videos',
    autoGeminiNativeForGeminiModels: false,
    respectProviderOnCustomHost: true,
    uiProvider: 'OpenAI',
};

const PROVIDER_STRATEGIES: ProviderStrategy[] = [
    {
        id: 'google',
        label: 'Google Gemini',
        known: true,
        providerPatterns: [/^google$/i, /^gemini$/i],
        hostPatterns: [/^generativelanguage\.googleapis\.com$/i],
        basePatterns: [/googleapis\.com/i],
        defaultFormat: 'gemini',
        defaultAuthMethod: 'query',
        geminiAuthMethod: 'query',
        defaultHeaderName: GOOGLE_API_HEADER,
        authorizationValueFormat: 'raw',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: true,
        respectProviderOnCustomHost: false,
        uiProvider: 'Google',
    },
    {
        id: '12ai',
        label: '12AI',
        known: true,
        providerPatterns: [/^12ai$/i, /^systemproxy$/i],
        hostPatterns: [/^cdn\.12ai\.org$/i, /^new\.12ai\.org$/i, /^hk\.12ai\.org$/i, /(^|\.)12ai\.(org|xyz|io|net)$/i],
        basePatterns: [/12ai\.(org|xyz|io|net)/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'query',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: true,
        respectProviderOnCustomHost: true,
        uiProvider: '12AI',
    },
    {
        id: 'wuyinkeji',
        label: 'Wuyin Keji',
        known: true,
        basePatterns: [/api\.wuyinkeji\.com/i, /wuyinkeji/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'query',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'raw',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'newapi',
        label: 'NewAPI / OneAPI',
        known: true,
        providerPatterns: [/^newapi$/i, /^oneapi$/i, /^cherry(\s+studio)?$/i],
        hostPatterns: [/^ai\.newapi\.pro$/i, /^docs\.newapi\.pro$/i, /(^|\.)newapi\./i, /(^|\.)oneapi\./i],
        basePatterns: [/newapi/i, /oneapi/i, /vodeshop/i, /future-api/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        known: true,
        providerPatterns: [/^openrouter$/i],
        hostPatterns: [/^openrouter\.ai$/i],
        basePatterns: [/openrouter/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'openai',
        label: 'OpenAI',
        known: true,
        providerPatterns: [/^openai$/i],
        hostPatterns: [/^api\.openai\.com$/i],
        basePatterns: [/api\.openai\.com/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'siliconflow',
        label: 'SiliconFlow',
        known: true,
        providerPatterns: [/^siliconflow$/i],
        hostPatterns: [/^api\.siliconflow\.cn$/i],
        basePatterns: [/siliconflow/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'chat',
        imageProfile: 'siliconflow',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'SiliconFlow',
    },
    {
        id: 'antigravity',
        label: 'Antigravity',
        known: true,
        providerPatterns: [/^antigravity$/i],
        basePatterns: [/127\.0\.0\.1:8045/i, /localhost:8045/i, /antigravity/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'chat',
        imageProfile: 'antigravity',
        videoApiStyle: 'legacy-video-generations',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'gpt-best',
        label: 'GPT-Best',
        known: false,
        basePatterns: [/gpt-best/i, /gptbest/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'standard',
        imageProfile: 'gpt-best-extended',
        videoApiStyle: 'legacy-video-generations',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'suxi',
        label: 'Suxi',
        known: false,
        basePatterns: [/suxi\.ai/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'chat',
        imageProfile: 'chat-preferred',
        videoApiStyle: 'legacy-video-generations',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        known: true,
        providerPatterns: [/^deepseek$/i],
        hostPatterns: [/^api\.deepseek\.com$/i],
        basePatterns: [/deepseek/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'volcengine',
        label: 'Volcengine',
        known: true,
        providerPatterns: [/^volcengine$/i],
        basePatterns: [/volces\.com/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'Volcengine',
    },
    {
        id: 'aliyun',
        label: 'Aliyun',
        known: true,
        providerPatterns: [/^aliyun$/i],
        basePatterns: [/aliyuncs\.com/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'Aliyun',
    },
    {
        id: 'tencent',
        label: 'Tencent',
        known: true,
        providerPatterns: [/^tencent$/i],
        basePatterns: [/tencent\.com/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'Tencent',
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        known: true,
        providerPatterns: [/^anthropic$/i],
        basePatterns: [/anthropic\.com/i],
        defaultFormat: 'openai',
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: 'Anthropic',
    },
];

function normalizeBaseUrl(baseUrl?: string): string {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function normalizeProviderName(provider?: string | Provider): string {
    return String(provider || '').trim().toLowerCase();
}

function normalizeFormat(format: unknown, fallback: ProviderStrategyFormat = 'auto'): ProviderStrategyFormat {
    const normalized = String(format || '').trim().toLowerCase();
    if (normalized === 'openai' || normalized === 'gemini' || normalized === 'auto') {
        return normalized;
    }
    return fallback;
}

function normalizeAuthMethod(authMethod: unknown): ProviderStrategyAuthMethod | undefined {
    const normalized = String(authMethod || '').trim().toLowerCase();
    if (normalized === 'query' || normalized === 'header') {
        return normalized;
    }
    return undefined;
}

function normalizeCompatibilityMode(mode: unknown): ProviderStrategyCompatibilityMode | undefined {
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'standard' || normalized === 'chat') {
        return normalized;
    }
    return undefined;
}

function normalizeHost(baseUrl?: string): string {
    const raw = normalizeBaseUrl(baseUrl);
    if (!raw) return '';

    const candidates = raw.startsWith('http://') || raw.startsWith('https://')
        ? [raw]
        : [`https://${raw}`, `http://${raw}`];

    for (const candidate of candidates) {
        try {
            return new URL(candidate).hostname.toLowerCase();
        } catch {
            continue;
        }
    }

    return raw.toLowerCase();
}

function matchesAny(patterns: RegExp[] | undefined, value: string): boolean {
    if (!patterns || !value) return false;
    return patterns.some((pattern) => pattern.test(value));
}

function findStrategyByBase(baseUrl?: string): ProviderStrategy | undefined {
    const normalizedBase = normalizeBaseUrl(baseUrl).toLowerCase();
    const host = normalizeHost(baseUrl);
    if (!normalizedBase && !host) return undefined;

    return PROVIDER_STRATEGIES.find((strategy) =>
        matchesAny(strategy.hostPatterns, host) || matchesAny(strategy.basePatterns, normalizedBase)
    );
}

function findStrategyByProvider(provider?: string | Provider): ProviderStrategy | undefined {
    const normalizedProvider = normalizeProviderName(provider);
    if (!normalizedProvider) return undefined;

    return PROVIDER_STRATEGIES.find((strategy) => matchesAny(strategy.providerPatterns, normalizedProvider));
}

export function isGeminiFamilyModel(modelId?: string): boolean {
    const lower = String(modelId || '').trim().split('@')[0].toLowerCase();
    return lower.startsWith('gemini-') || lower.startsWith('imagen-') || lower.startsWith('veo-');
}

export function resolveProviderStrategy(provider?: string | Provider, baseUrl?: string): ProviderStrategy {
    const baseMatch = findStrategyByBase(baseUrl);
    if (baseMatch) {
        return baseMatch;
    }

    const providerMatch = findStrategyByProvider(provider);
    if (!providerMatch) {
        return FALLBACK_STRATEGY;
    }

    if (normalizeBaseUrl(baseUrl) && providerMatch.respectProviderOnCustomHost === false) {
        return FALLBACK_STRATEGY;
    }

    return providerMatch;
}

export function resolveProviderKeyType(
    provider?: string | Provider,
    baseUrl?: string
): 'official' | 'proxy' | 'third-party' {
    const normalizedProvider = normalizeProviderName(provider);
    const strategy = resolveProviderStrategy(provider, baseUrl);
    const host = normalizeHost(baseUrl);
    const googleHost = matchesAny(PROVIDER_STRATEGIES.find((item) => item.id === 'google')?.hostPatterns, host)
        || /googleapis\.com$/i.test(host);

    if (normalizedProvider === 'google' && (!normalizeBaseUrl(baseUrl) || googleHost || strategy.id === 'google')) {
        return 'official';
    }

    if (normalizedProvider === 'google') {
        return 'proxy';
    }

    return 'third-party';
}

export function resolveProviderRuntime(input: ProviderRuntimeInput): ResolvedProviderRuntime {
    const strategy = resolveProviderStrategy(input.provider, input.baseUrl);
    const requestedFormat = normalizeFormat(
        input.format,
        strategy.id === 'google' ? 'gemini' : 'auto'
    );
    const fallbackFormat = input.fallbackFormat || (strategy.defaultFormat === 'gemini' ? 'gemini' : 'openai');
    const resolvedFormat = requestedFormat === 'auto' ? fallbackFormat : requestedFormat;
    const geminiNative = requestedFormat === 'gemini'
        || (requestedFormat !== 'openai'
            && !!strategy.autoGeminiNativeForGeminiModels
            && isGeminiFamilyModel(input.modelId));
    const authMethod = normalizeAuthMethod(input.authMethod)
        || (geminiNative
            ? (strategy.geminiAuthMethod || strategy.defaultAuthMethod || 'header')
            : (strategy.defaultAuthMethod || 'header'));
    const headerName = String(input.headerName || '').trim()
        || (geminiNative && strategy.id === 'google'
            ? GOOGLE_API_HEADER
            : strategy.defaultHeaderName || AUTHORIZATION_HEADER);
    const authorizationValueFormat = strategy.authorizationValueFormat || 'bearer';
    const compatibilityMode = normalizeCompatibilityMode(input.compatibilityMode)
        || strategy.defaultCompatibilityMode
        || 'standard';

    return {
        strategy,
        strategyId: strategy.id,
        providerName: normalizeProviderName(input.provider),
        baseUrl: normalizeBaseUrl(input.baseUrl),
        host: normalizeHost(input.baseUrl),
        requestedFormat,
        resolvedFormat,
        authMethod,
        headerName,
        authorizationValueFormat,
        compatibilityMode,
        geminiNative,
        imageProfile: strategy.imageProfile || 'openai-strict',
        videoApiStyle: strategy.videoApiStyle || 'openai-v1-videos',
        isKnownProvider: strategy.known,
        uiProvider: strategy.uiProvider || 'OpenAI',
    };
}
