/**
 * API Provider Configuration
 *
 * Defines API provider types and utilities for third-party proxy support.
 * Supports Google official API and custom proxies (e.g., gemini-balance-lite).
 */

/**
 * API authentication method
 * - 'query': API key passed as URL query parameter (?key=xxx)
 * - 'header': API key passed in request header (x-goog-api-key: xxx)
 */
export type AuthMethod = 'query' | 'header';

/**
 * API Provider configuration interface
 */
export interface ApiProvider {
    id: string;
    name: string;
    baseUrl: string;
    authMethod: AuthMethod;
    headerName?: string;  // Custom header name (default: x-goog-api-key)
}

/**
 * Default provider configurations
 */
export const DEFAULT_PROVIDERS: ApiProvider[] = [
    {
        id: 'google',
        name: 'Google (官方)',
        baseUrl: 'https://generativelanguage.googleapis.com',
        authMethod: 'query'
    },
    {
        id: 'custom',
        name: '自定义代理',
        baseUrl: '',
        authMethod: 'header',
        headerName: 'x-goog-api-key'
    }
];

/**
 * Google official API base URL
 */
export const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com';

/**
 * Build API URL for model operations
 *
 * @param baseUrl - Base URL of API provider
 * @param model - Model name (e.g., 'gemini-2.5-flash-image')
 * @param action - API action (e.g., 'generateContent', 'predict')
 * @param authMethod - Authentication method
 * @param apiKey - API key (only used when authMethod is 'query')
 * @returns Full API URL
 */
export function buildApiUrl(
    baseUrl: string | undefined,
    model: string,
    action: string,
    authMethod: AuthMethod,
    apiKey?: string
): string {
    const base = baseUrl || GOOGLE_API_BASE;

    // Normalize model ID: remove 'models/' prefix if present
    const normalizedModel = model.replace(/^models\//, '');

    // Special handling: Preview models like gemini-3-pro-image-preview require v1beta
    // Also 'exp' (experimental), 'gemini-2', 'flash' (often newer) usually work better on v1beta
    const useBeta = normalizedModel.includes('preview') ||
        normalizedModel.includes('exp') ||
        normalizedModel.includes('gemini-2') ||
        normalizedModel.includes('gemini-3') ||
        normalizedModel.includes('ultra'); // Imagen 3 Ultra / Gemini 1.5 Ultra?

    const apiVersion = useBeta ? 'v1beta' : 'v1';

    const url = `${base}/${apiVersion}/models/${normalizedModel}:${action}`;
    return authMethod === 'query' && apiKey ? `${url}?key=${apiKey}` : url;
}

/**
 * Build request headers for API calls
 *
 * @param authMethod - Authentication method
 * @param apiKey - API key
 * @param headerName - Custom header name (default: x-goog-api-key)
 * @returns Headers object
 */
export function buildHeaders(
    authMethod: AuthMethod,
    apiKey: string,
    headerName?: string
): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (authMethod === 'header') {
        headers[headerName || 'x-goog-api-key'] = apiKey;
    }

    return headers;
}

/**
 * Normalize Proxy Base URL (strip trailing slash and /v1)
 */
export function normalizeProxyBaseUrl(url: string | undefined): string {
    if (!url) return '';
    let clean = url.trim();
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    if (clean.endsWith('/v1')) clean = clean.slice(0, -3);
    return clean;
}

/**
 * Build headers for Proxy API requests (OpenAI-compatible)
 */
export function buildProxyHeaders(
    authMethod: AuthMethod,
    apiKey: string,
    headerName: string = 'Authorization',
    group?: string
): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (authMethod === 'header' && apiKey) {
        // Special handling for Authorization header: Add Bearer prefix if missing
        if (headerName === 'Authorization' && !apiKey.startsWith('Bearer ')) {
            headers[headerName] = `Bearer ${apiKey}`;
        } else {
            headers[headerName] = apiKey;
        }
    } else if (authMethod === 'query') {
        // Some proxies accept key in query, handled by URL builder, but we leave headers clean unless needed
    }

    // OpenRouter Specific Headers for CORS
    if (apiKey.startsWith('sk-or-') || (headerName && headerName.toLowerCase() === 'authorization')) {
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

/**
 * Get default auth method for a base URL
 * Proxy URLs typically use header auth, Google uses query
 */
export function getDefaultAuthMethod(baseUrl?: string): AuthMethod {
    if (!baseUrl || baseUrl.includes('googleapis.com')) {
        return 'query';
    }
    return 'header';
}
