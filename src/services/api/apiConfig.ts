/**
 * API Provider Configuration
 *
 * Centralized helpers for protocol/auth resolution and endpoint building.
 */

import {
    resolveProviderRuntime,
    type ProviderStrategyAuthMethod,
    type ProviderStrategyAuthorizationValueFormat,
} from './providerStrategy';

/**
 * API authentication method
 * - 'query': API key passed as URL query parameter (?key=xxx)
 * - 'header': API key passed in request header
 */
export type AuthMethod = 'query' | 'header';
export type ApiProtocolFormat = 'auto' | 'openai' | 'gemini';

/**
 * API Provider configuration interface
 */
export interface ApiProvider {
    id: string;
    name: string;
    baseUrl: string;
    authMethod: AuthMethod;
    headerName?: string;
}

/**
 * Default provider configurations
 */
export const DEFAULT_PROVIDERS: ApiProvider[] = [
    {
        id: 'google',
        name: 'Google Official',
        baseUrl: 'https://generativelanguage.googleapis.com',
        authMethod: 'query',
        headerName: 'x-goog-api-key',
    },
    {
        id: 'custom',
        name: 'Custom Proxy',
        baseUrl: '',
        authMethod: 'header',
        headerName: 'Authorization',
    },
];

/**
 * Google official API base URL
 */
export const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com';

export function normalizeApiProtocolFormat(
    format: unknown,
    fallback: ApiProtocolFormat = 'auto'
): ApiProtocolFormat {
    const normalized = String(format || '').trim().toLowerCase();
    if (normalized === 'openai' || normalized === 'gemini' || normalized === 'auto') {
        return normalized;
    }
    return fallback;
}

export function resolveApiProtocolFormat(
    format: unknown,
    baseUrl?: string,
    fallback: Exclude<ApiProtocolFormat, 'auto'> = 'openai',
    provider?: string
): Exclude<ApiProtocolFormat, 'auto'> {
    return resolveProviderRuntime({
        provider,
        baseUrl,
        format,
        fallbackFormat: fallback,
    }).resolvedFormat;
}

export function getApiKeyToken(apiKey: string): string {
    return String(apiKey || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\r?\n|\r|\t/g, '')
        .trim()
        .replace(/^Bearer\s+/i, '')
        .replace(/\s+/g, '')
        .trim();
}

export function formatAuthorizationHeaderValue(
    apiKey: string,
    valueFormat: ProviderStrategyAuthorizationValueFormat = 'bearer'
): string {
    const token = getApiKeyToken(apiKey);
    if (valueFormat === 'raw') {
        return token;
    }
    return /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${token}`;
}

/**
 * Build API URL for Gemini-native model operations.
 */
export function buildApiUrl(
    baseUrl: string | undefined,
    model: string,
    action: string,
    authMethod: AuthMethod,
    apiKey?: string
): string {
    const base = baseUrl || GOOGLE_API_BASE;
    const normalizedModel = model.replace(/^models\//, '');
    const useBeta = normalizedModel.includes('preview')
        || normalizedModel.includes('exp')
        || normalizedModel.includes('gemini-2')
        || normalizedModel.includes('gemini-3')
        || normalizedModel.includes('ultra');
    const apiVersion = useBeta ? 'v1beta' : 'v1';
    const url = `${base}/${apiVersion}/models/${normalizedModel}:${action}`;

    return authMethod === 'query' && apiKey ? `${url}?key=${encodeURIComponent(getApiKeyToken(apiKey))}` : url;
}

/**
 * Build request headers for generic API calls.
 */
export function buildHeaders(
    authMethod: AuthMethod,
    apiKey: string,
    headerName?: string,
    authorizationValueFormat: ProviderStrategyAuthorizationValueFormat = 'bearer'
): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (authMethod === 'header') {
        const effectiveHeaderName = headerName || 'x-goog-api-key';
        headers[effectiveHeaderName] = effectiveHeaderName === 'Authorization'
            ? formatAuthorizationHeaderValue(apiKey, authorizationValueFormat)
            : getApiKeyToken(apiKey);
    }

    return headers;
}

/**
 * Normalize proxy base URL (strip trailing slash and /v1)
 */
export function normalizeProxyBaseUrl(url: string | undefined): string {
    if (!url) return '';
    let clean = url.trim();
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    if (clean.endsWith('/v1')) clean = clean.slice(0, -3);
    return clean;
}

export function normalizeOpenAIBaseUrl(url: string | undefined): string {
    if (!url) return '';

    let clean = url.trim().replace(/\/+$/, '');
    clean = clean.replace(/\/(?:chat\/completions|images\/generations|images\/edits|responses|models)$/i, '');

    if (!/\/v\d[\w.-]*$/i.test(clean)) {
        clean = `${clean}/v1`;
    }

    return clean.replace(/\/+$/, '');
}

export function buildOpenAIEndpoint(baseUrl: string | undefined, endpoint: string): string {
    const cleanBase = normalizeOpenAIBaseUrl(baseUrl);
    return `${cleanBase}/${endpoint.replace(/^\/+/, '')}`;
}

export function normalizeGeminiBaseUrl(url: string | undefined): string {
    let clean = (url || GOOGLE_API_BASE).trim().replace(/\/+$/, '');
    clean = clean
        .replace(/\/v1beta\/models\/[^/?]+:(?:generateContent|streamGenerateContent)$/i, '')
        .replace(/\/v1\/models\/[^/?]+:(?:generateContent|streamGenerateContent)$/i, '')
        .replace(/\/+$/, '');

    const suffixes = [
        '/v1beta/models',
        '/v1/models',
        '/models',
        '/v1beta',
        '/v1',
    ];

    let stripped = true;
    while (stripped) {
        stripped = false;
        const lower = clean.toLowerCase();
        for (const suffix of suffixes) {
            if (lower.endsWith(suffix)) {
                clean = clean.slice(0, -suffix.length).replace(/\/+$/, '');
                stripped = true;
                break;
            }
        }
    }

    return clean || GOOGLE_API_BASE;
}

export function normalizeGeminiModelId(model: string): string {
    return String(model || '')
        .trim()
        .replace(/^models\//i, '')
        .split('@')[0]
        .trim();
}

export function usesGeminiQueryAuth(baseUrl: string | undefined, provider?: string): boolean {
    return resolveProviderRuntime({
        provider,
        baseUrl,
        format: 'gemini',
    }).authMethod === 'query';
}

export function resolveGeminiAuthMethod(
    baseUrl: string | undefined,
    preferred?: AuthMethod,
    provider?: string
): AuthMethod {
    return resolveProviderRuntime({
        provider,
        baseUrl,
        format: 'gemini',
        authMethod: preferred,
    }).authMethod as ProviderStrategyAuthMethod;
}

export function buildGeminiEndpoint(
    baseUrl: string | undefined,
    model: string,
    action: string,
    apiKey: string,
    authMethod?: AuthMethod,
    provider?: string
): string {
    const cleanBase = normalizeGeminiBaseUrl(baseUrl);
    const normalizedModel = normalizeGeminiModelId(model);
    const endpoint = `${cleanBase}/v1beta/models/${encodeURIComponent(normalizedModel)}:${action}`;
    if (resolveGeminiAuthMethod(baseUrl, authMethod, provider) === 'query') {
        const encodedKey = encodeURIComponent(getApiKeyToken(apiKey));
        return `${endpoint}?key=${encodedKey}`;
    }
    return endpoint;
}

export function buildGeminiModelsEndpoint(
    baseUrl: string | undefined,
    apiKey: string,
    authMethod?: AuthMethod,
    provider?: string
): string {
    const cleanBase = normalizeGeminiBaseUrl(baseUrl);
    const endpoint = `${cleanBase}/v1beta/models`;
    if (resolveGeminiAuthMethod(baseUrl, authMethod, provider) === 'query') {
        const encodedKey = encodeURIComponent(getApiKeyToken(apiKey));
        return `${endpoint}?key=${encodedKey}`;
    }
    return endpoint;
}

export function buildGeminiHeaders(
    authMethod: AuthMethod,
    apiKey: string,
    headerName?: string,
    authorizationValueFormat: ProviderStrategyAuthorizationValueFormat = 'bearer'
): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };

    if (authMethod !== 'header') {
        return headers;
    }

    const effectiveHeaderName = headerName || 'Authorization';
    headers[effectiveHeaderName] = effectiveHeaderName === 'Authorization'
        ? formatAuthorizationHeaderValue(apiKey, authorizationValueFormat)
        : getApiKeyToken(apiKey);

    return headers;
}

/**
 * Build headers for OpenAI-compatible proxy requests.
 */
export function buildProxyHeaders(
    authMethod: AuthMethod,
    apiKey: string,
    headerName: string = 'Authorization',
    group?: string,
    authorizationValueFormat: ProviderStrategyAuthorizationValueFormat = 'bearer'
): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (authMethod === 'header' && apiKey) {
        if (headerName === 'Authorization' && !/^Bearer\s+/i.test(apiKey)) {
            headers[headerName] = formatAuthorizationHeaderValue(apiKey, authorizationValueFormat);
        } else {
            headers[headerName] = headerName === 'Authorization'
                ? formatAuthorizationHeaderValue(apiKey, authorizationValueFormat)
                : apiKey;
        }
    }

    if (apiKey.startsWith('sk-or-') || headerName.toLowerCase() === 'authorization') {
        if (typeof window !== 'undefined') {
            headers['HTTP-Referer'] = window.location.origin;
            headers['X-Title'] = 'KK Studio';
        }
    }

    if (group) {
        headers['X-Group'] = group;
    }

    return headers;
}

export function resolveApiHeaderName(
    provider: string | undefined,
    baseUrl: string | undefined,
    authMethod: AuthMethod,
    format: ApiProtocolFormat = 'auto'
): string {
    return resolveProviderRuntime({
        provider,
        baseUrl,
        authMethod,
        format,
    }).headerName;
}

/**
 * Resolve the default auth method for the current provider/protocol.
 */
export function getDefaultAuthMethod(
    baseUrl?: string,
    options?: {
        provider?: string;
        format?: ApiProtocolFormat;
        modelId?: string;
    }
): AuthMethod {
    return resolveProviderRuntime({
        provider: options?.provider,
        baseUrl,
        format: options?.format,
        modelId: options?.modelId,
    }).authMethod as ProviderStrategyAuthMethod;
}
