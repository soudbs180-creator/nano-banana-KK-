import type { Provider } from '../../types';
import type {
    ChannelEndpointStyle,
    ChannelManagementSupport,
    ChannelPricingSupport,
    ProtocolFamily,
    ProviderFamily,
} from './channelConfig';

export type ProviderStrategyFormat = 'auto' | 'openai' | 'gemini' | 'claude';
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
    providerFamily: ProviderFamily;
    providerPatterns?: RegExp[];
    hostPatterns?: RegExp[];
    basePatterns?: RegExp[];
    defaultFormat?: ProviderStrategyFormat;
    supportedFormats?: ProviderStrategyFormat[];
    defaultAuthMethod?: ProviderStrategyAuthMethod;
    geminiAuthMethod?: ProviderStrategyAuthMethod;
    claudeAuthMethod?: ProviderStrategyAuthMethod;
    defaultHeaderName?: string;
    geminiHeaderName?: string;
    claudeHeaderName?: string;
    authorizationValueFormat?: ProviderStrategyAuthorizationValueFormat;
    geminiAuthorizationValueFormat?: ProviderStrategyAuthorizationValueFormat;
    claudeAuthorizationValueFormat?: ProviderStrategyAuthorizationValueFormat;
    defaultCompatibilityMode?: ProviderStrategyCompatibilityMode;
    imageProfile?: ProviderStrategyImageProfile;
    videoApiStyle?: ProviderStrategyVideoApiStyle;
    pricingSupport?: ChannelPricingSupport;
    managementSupport?: ChannelManagementSupport;
    uiProvider?: Provider | 'Custom';
    respectProviderOnCustomHost?: boolean;
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
    providerFamily: ProviderFamily;
    protocolFamily: ProtocolFamily;
    pricingSupport: ChannelPricingSupport;
    managementSupport: ChannelManagementSupport;
    endpointStyle: ChannelEndpointStyle;
    supportedProtocolFamilies: ProtocolFamily[];
    baseUrl: string;
    host: string;
    requestedFormat: ProviderStrategyFormat;
    resolvedFormat: Exclude<ProviderStrategyFormat, 'auto'>;
    authMethod: ProviderStrategyAuthMethod;
    headerName: string;
    authorizationValueFormat: ProviderStrategyAuthorizationValueFormat;
    compatibilityMode: ProviderStrategyCompatibilityMode;
    geminiNative: boolean;
    claudeNative: boolean;
    imageProfile: ProviderStrategyImageProfile;
    videoApiStyle: ProviderStrategyVideoApiStyle;
    isKnownProvider: boolean;
    uiProvider: Provider | 'Custom';
}

export type ProviderRuntime = ResolvedProviderRuntime;

const GOOGLE_API_HEADER = 'x-goog-api-key';
const CLAUDE_API_HEADER = 'x-api-key';
const AUTHORIZATION_HEADER = 'Authorization';

const FALLBACK_STRATEGY: ProviderStrategy = {
    id: 'generic-openai',
    label: 'Generic OpenAI-Compatible',
    known: false,
    providerFamily: 'generic-openai',
    defaultFormat: 'openai',
    supportedFormats: ['openai', 'gemini', 'claude'],
    defaultAuthMethod: 'header',
    geminiAuthMethod: 'header',
    claudeAuthMethod: 'header',
    defaultHeaderName: AUTHORIZATION_HEADER,
    geminiHeaderName: AUTHORIZATION_HEADER,
    claudeHeaderName: AUTHORIZATION_HEADER,
    authorizationValueFormat: 'bearer',
    geminiAuthorizationValueFormat: 'bearer',
    claudeAuthorizationValueFormat: 'bearer',
    defaultCompatibilityMode: 'standard',
    imageProfile: 'openai-strict',
    videoApiStyle: 'openai-v1-videos',
    pricingSupport: 'none',
    managementSupport: 'none',
    respectProviderOnCustomHost: true,
    uiProvider: 'Custom',
};

const PROVIDER_STRATEGIES: ProviderStrategy[] = [
    {
        id: 'systemproxy',
        label: 'System Proxy',
        known: true,
        providerFamily: 'system-proxy',
        providerPatterns: [/^systemproxy$/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'none',
        managementSupport: 'none',
        respectProviderOnCustomHost: true,
        uiProvider: 'Custom',
    },
    {
        id: 'google',
        label: 'Google Gemini',
        known: true,
        providerFamily: 'google-official',
        providerPatterns: [/^google$/i, /^gemini$/i],
        hostPatterns: [/^generativelanguage\.googleapis\.com$/i],
        basePatterns: [/googleapis\.com/i, /generativelanguage\.googleapis\.com/i],
        defaultFormat: 'gemini',
        supportedFormats: ['gemini'],
        defaultAuthMethod: 'query',
        geminiAuthMethod: 'query',
        defaultHeaderName: GOOGLE_API_HEADER,
        geminiHeaderName: GOOGLE_API_HEADER,
        authorizationValueFormat: 'raw',
        geminiAuthorizationValueFormat: 'raw',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'none',
        managementSupport: 'none',
        respectProviderOnCustomHost: false,
        uiProvider: 'Google',
    },
    {
        id: '12ai',
        label: '12AI',
        known: true,
        providerFamily: '12ai',
        providerPatterns: [/^12ai$/i],
        hostPatterns: [/^cdn\.12ai\.org$/i, /^new\.12ai\.org$/i, /^hk\.12ai\.org$/i, /(^|\.)12ai\.(org|xyz|io|net)$/i],
        basePatterns: [/12ai\.(org|xyz|io|net)/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai', 'gemini', 'claude'],
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'query',
        claudeAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        geminiHeaderName: GOOGLE_API_HEADER,
        claudeHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        geminiAuthorizationValueFormat: 'raw',
        claudeAuthorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'native',
        managementSupport: 'none',
        respectProviderOnCustomHost: true,
        uiProvider: '12AI',
    },
    {
        id: 'wuyinkeji',
        label: 'Wuyin Keji',
        known: true,
        providerFamily: 'newapi-family',
        basePatterns: [/api\.wuyinkeji\.com/i, /wuyinkeji/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai', 'gemini'],
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'query',
        defaultHeaderName: AUTHORIZATION_HEADER,
        geminiHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'raw',
        geminiAuthorizationValueFormat: 'raw',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'native',
        managementSupport: 'native',
        respectProviderOnCustomHost: true,
        uiProvider: 'Custom',
    },
    {
        id: 'newapi',
        label: 'NewAPI / OneAPI',
        known: true,
        providerFamily: 'newapi-family',
        providerPatterns: [/^newapi$/i, /^oneapi$/i, /^cherry(\s+studio)?$/i],
        hostPatterns: [/^ai\.newapi\.pro$/i, /^docs\.newapi\.pro$/i, /(^|\.)newapi\./i, /(^|\.)oneapi\./i],
        basePatterns: [/newapi/i, /oneapi/i, /future-api/i, /vodeshop/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai', 'gemini'],
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        geminiHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        geminiAuthorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'native',
        managementSupport: 'native',
        respectProviderOnCustomHost: true,
        uiProvider: 'Custom',
    },
    {
        id: 'suxi',
        label: 'Suxi',
        known: true,
        providerFamily: 'newapi-family',
        providerPatterns: [/^suxi$/i],
        hostPatterns: [/^suxi\.ai$/i, /(^|\.)suxi\./i],
        basePatterns: [/suxi/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai', 'gemini'],
        defaultAuthMethod: 'header',
        geminiAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        geminiHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        geminiAuthorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'chat',
        imageProfile: 'chat-preferred',
        videoApiStyle: 'legacy-video-generations',
        pricingSupport: 'native',
        managementSupport: 'native',
        respectProviderOnCustomHost: true,
        uiProvider: 'Custom',
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        known: true,
        providerFamily: 'generic-openai',
        providerPatterns: [/^openrouter$/i],
        hostPatterns: [/^openrouter\.ai$/i],
        basePatterns: [/openrouter/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'manual',
        managementSupport: 'external',
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'openai',
        label: 'OpenAI',
        known: true,
        providerFamily: 'generic-openai',
        providerPatterns: [/^openai$/i],
        hostPatterns: [/^api\.openai\.com$/i],
        basePatterns: [/api\.openai\.com/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'manual',
        managementSupport: 'external',
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        known: true,
        providerFamily: 'claude-native',
        providerPatterns: [/^anthropic$/i],
        hostPatterns: [/^api\.anthropic\.com$/i],
        basePatterns: [/anthropic\.com/i],
        defaultFormat: 'claude',
        supportedFormats: ['claude'],
        defaultAuthMethod: 'header',
        claudeAuthMethod: 'header',
        defaultHeaderName: CLAUDE_API_HEADER,
        claudeHeaderName: CLAUDE_API_HEADER,
        authorizationValueFormat: 'raw',
        claudeAuthorizationValueFormat: 'raw',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'none',
        managementSupport: 'none',
        respectProviderOnCustomHost: true,
        uiProvider: 'Anthropic',
    },
    {
        id: 'siliconflow',
        label: 'SiliconFlow',
        known: true,
        providerFamily: 'generic-openai',
        providerPatterns: [/^siliconflow$/i],
        hostPatterns: [/^api\.siliconflow\.cn$/i],
        basePatterns: [/siliconflow/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'chat',
        imageProfile: 'siliconflow',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'manual',
        managementSupport: 'external',
        respectProviderOnCustomHost: true,
        uiProvider: 'SiliconFlow',
    },
    {
        id: 'antigravity',
        label: 'Antigravity',
        known: true,
        providerFamily: 'generic-openai',
        providerPatterns: [/^antigravity$/i],
        basePatterns: [/127\.0\.0\.1:8045/i, /localhost:8045/i, /antigravity/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'chat',
        imageProfile: 'antigravity',
        videoApiStyle: 'legacy-video-generations',
        pricingSupport: 'native',
        managementSupport: 'native',
        respectProviderOnCustomHost: true,
        uiProvider: 'Custom',
    },
    {
        id: 'gpt-best',
        label: 'GPT-Best',
        known: false,
        providerFamily: 'newapi-family',
        basePatterns: [/gpt-best/i, /gptbest/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'standard',
        imageProfile: 'gpt-best-extended',
        videoApiStyle: 'legacy-video-generations',
        pricingSupport: 'native',
        managementSupport: 'native',
        respectProviderOnCustomHost: true,
        uiProvider: 'Custom',
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        known: true,
        providerFamily: 'generic-openai',
        providerPatterns: [/^deepseek$/i],
        hostPatterns: [/^api\.deepseek\.com$/i],
        basePatterns: [/deepseek/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'manual',
        managementSupport: 'external',
        respectProviderOnCustomHost: true,
        uiProvider: 'OpenAI',
    },
    {
        id: 'volcengine',
        label: 'Volcengine',
        known: true,
        providerFamily: 'generic-openai',
        providerPatterns: [/^volcengine$/i],
        basePatterns: [/volces\.com/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'manual',
        managementSupport: 'external',
        respectProviderOnCustomHost: true,
        uiProvider: 'Volcengine',
    },
    {
        id: 'aliyun',
        label: 'Aliyun',
        known: true,
        providerFamily: 'generic-openai',
        providerPatterns: [/^aliyun$/i],
        basePatterns: [/aliyuncs\.com/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'manual',
        managementSupport: 'external',
        respectProviderOnCustomHost: true,
        uiProvider: 'Aliyun',
    },
    {
        id: 'tencent',
        label: 'Tencent',
        known: true,
        providerFamily: 'generic-openai',
        providerPatterns: [/^tencent$/i],
        basePatterns: [/tencent\.com/i, /tencentcloudapi/i],
        defaultFormat: 'openai',
        supportedFormats: ['openai'],
        defaultAuthMethod: 'header',
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: 'bearer',
        defaultCompatibilityMode: 'chat',
        imageProfile: 'openai-strict',
        videoApiStyle: 'openai-v1-videos',
        pricingSupport: 'manual',
        managementSupport: 'external',
        respectProviderOnCustomHost: true,
        uiProvider: 'Tencent',
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
    if (normalized === 'openai' || normalized === 'gemini' || normalized === 'claude' || normalized === 'auto') {
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

    const candidates = /^https?:\/\//i.test(raw) ? [raw] : [`https://${raw}`, `http://${raw}`];
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
        matchesAny(strategy.hostPatterns, host) || matchesAny(strategy.basePatterns, normalizedBase),
    );
}

function findStrategyByProvider(provider?: string | Provider): ProviderStrategy | undefined {
    const normalizedProvider = normalizeProviderName(provider);
    if (!normalizedProvider) return undefined;

    return PROVIDER_STRATEGIES.find((strategy) => matchesAny(strategy.providerPatterns, normalizedProvider));
}

function toProtocolFamily(format: Exclude<ProviderStrategyFormat, 'auto'>): ProtocolFamily {
    if (format === 'gemini') return 'gemini-native';
    if (format === 'claude') return 'claude-native';
    return 'openai-compatible';
}

function toProviderFamily(strategy: ProviderStrategy, protocolFamily: ProtocolFamily): ProviderFamily {
    if (strategy.providerFamily === 'generic-openai') {
        if (protocolFamily === 'gemini-native') return 'generic-gemini';
        if (protocolFamily === 'claude-native') return 'claude-native';
    }

    if (strategy.providerFamily === 'claude-native') {
        return 'claude-native';
    }

    return strategy.providerFamily;
}

function toEndpointStyle(strategy: ProviderStrategy, protocolFamily: ProtocolFamily): ChannelEndpointStyle {
    if (strategy.providerFamily === 'system-proxy') return 'system-proxy';
    if (strategy.providerFamily === 'google-official' && protocolFamily === 'gemini-native') return 'google-official';
    if (protocolFamily === 'gemini-native') return 'gemini-native';
    if (protocolFamily === 'claude-native') return 'claude-native';
    return 'openai-compatible';
}

function resolveSupportedProtocolFamilies(strategy: ProviderStrategy): ProtocolFamily[] {
    const formats = strategy.supportedFormats?.length
        ? strategy.supportedFormats
        : [strategy.defaultFormat || 'openai'];

    return Array.from(new Set(
        formats
            .filter((format): format is Exclude<ProviderStrategyFormat, 'auto'> => format !== 'auto')
            .map(toProtocolFamily),
    ));
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

export function resolveProviderRuntime(input: ProviderRuntimeInput = {}): ResolvedProviderRuntime {
    const strategy = resolveProviderStrategy(input.provider, input.baseUrl);
    const requestedFormat = normalizeFormat(
        input.format,
        strategy.defaultFormat === 'gemini'
            ? 'gemini'
            : strategy.defaultFormat === 'claude'
                ? 'claude'
                : 'auto',
    );
    const strategyFallback = strategy.defaultFormat && strategy.defaultFormat !== 'auto'
        ? strategy.defaultFormat
        : 'openai';
    const fallbackFormat = input.fallbackFormat || strategyFallback;
    const supportedFormats = (strategy.supportedFormats || []).filter(
        (format): format is Exclude<ProviderStrategyFormat, 'auto'> => format !== 'auto',
    );
    const preferredFormat = requestedFormat === 'auto' ? fallbackFormat : requestedFormat;
    const resolvedFormat = supportedFormats.length > 0 && !supportedFormats.includes(preferredFormat)
        ? supportedFormats[0]
        : preferredFormat;
    const protocolFamily = toProtocolFamily(resolvedFormat);
    const providerFamily = toProviderFamily(strategy, protocolFamily);

    const authMethod = normalizeAuthMethod(input.authMethod)
        || (
            protocolFamily === 'gemini-native'
                ? (strategy.geminiAuthMethod || strategy.defaultAuthMethod || 'header')
                : protocolFamily === 'claude-native'
                    ? (strategy.claudeAuthMethod || strategy.defaultAuthMethod || 'header')
                    : (strategy.defaultAuthMethod || 'header')
        );

    const defaultHeaderName = protocolFamily === 'gemini-native'
        ? (strategy.geminiHeaderName || (providerFamily === 'google-official' ? GOOGLE_API_HEADER : strategy.defaultHeaderName || AUTHORIZATION_HEADER))
        : protocolFamily === 'claude-native'
            ? (strategy.claudeHeaderName || strategy.defaultHeaderName || AUTHORIZATION_HEADER)
            : (strategy.defaultHeaderName || AUTHORIZATION_HEADER);
    const headerName = String(input.headerName || '').trim() || defaultHeaderName;

    const authorizationValueFormat = protocolFamily === 'gemini-native'
        ? (strategy.geminiAuthorizationValueFormat || strategy.authorizationValueFormat || (headerName === GOOGLE_API_HEADER ? 'raw' : 'bearer'))
        : protocolFamily === 'claude-native'
            ? (strategy.claudeAuthorizationValueFormat || strategy.authorizationValueFormat || (headerName === CLAUDE_API_HEADER ? 'raw' : 'bearer'))
            : (strategy.authorizationValueFormat || 'bearer');

    const compatibilityMode = normalizeCompatibilityMode(input.compatibilityMode)
        || strategy.defaultCompatibilityMode
        || 'standard';

    return {
        strategy,
        strategyId: strategy.id,
        providerName: normalizeProviderName(input.provider),
        providerFamily,
        protocolFamily,
        pricingSupport: strategy.pricingSupport || (providerFamily === 'generic-openai' ? 'manual' : 'none'),
        managementSupport: strategy.managementSupport || 'none',
        endpointStyle: toEndpointStyle(strategy, protocolFamily),
        supportedProtocolFamilies: resolveSupportedProtocolFamilies(strategy),
        baseUrl: normalizeBaseUrl(input.baseUrl),
        host: normalizeHost(input.baseUrl),
        requestedFormat,
        resolvedFormat,
        authMethod,
        headerName,
        authorizationValueFormat,
        compatibilityMode,
        geminiNative: protocolFamily === 'gemini-native',
        claudeNative: protocolFamily === 'claude-native',
        imageProfile: strategy.imageProfile || 'openai-strict',
        videoApiStyle: strategy.videoApiStyle || 'openai-v1-videos',
        isKnownProvider: strategy.known,
        uiProvider: strategy.uiProvider || 'Custom',
    };
}

export function resolveProviderKeyType(
    provider?: string | Provider,
    baseUrl?: string,
): 'official' | 'proxy' | 'third-party' {
    const normalizedProvider = normalizeProviderName(provider);
    const runtime = resolveProviderRuntime({
        provider,
        baseUrl,
    });

    if (
        normalizedProvider === 'google'
        && (
            !normalizeBaseUrl(baseUrl)
            || runtime.providerFamily === 'google-official'
        )
    ) {
        return 'official';
    }

    if (normalizedProvider === 'google' || runtime.providerFamily === 'system-proxy') {
        return 'proxy';
    }

    return 'third-party';
}
