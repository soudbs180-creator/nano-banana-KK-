/**
 * NewAPI Pro Pricing Service
 * 
 * Fetches model pricing and group rates from NewAPI Pro compatible providers.
 * Reference: https://docs.newapi.pro/en/docs/api/management/auth
 */

import { supabase } from '../../lib/supabase';
import {
    buildGeminiHeaders,
    buildGeminiModelsEndpoint,
    buildOpenAIEndpoint,
    buildProxyHeaders,
    formatAuthorizationHeaderValue,
    getApiKeyToken,
    resolveApiProtocolFormat,
    type ApiProtocolFormat,
} from '../api/apiConfig';
import { resolveProviderRuntime } from '../api/providerStrategy';

export interface ModelPricingInfo {
    modelId: string;
    modelName: string;
    inputPrice: number; // per 1M tokens
    outputPrice: number; // per 1M tokens
    isPerToken: boolean; // true = per token, false = per request
    groupRatio?: number; // group multiplier
    currency: string;
    billingUnit?: string;
    displayPrice?: string;
    supportsGroups?: boolean;
    endpointUrl?: string;
    endpointPath?: string;
}

export interface NewApiProviderConfig {
    baseUrl: string;
    apiKey: string;
    systemAccessToken?: string; // for fetching pricing
}

export interface RawPricingCatalogResult {
    endpointUrl: string;
    pricingData: any[];
    groupRatio: Record<string, number>;
    source: 'direct' | 'wuyinkeji';
    supportsGroups: boolean;
}

const normalizePricingBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');
const WUYIN_DEFAULT_ROOT_URL = 'https://api.wuyinkeji.com';
const WUYIN_ASYNC_ENDPOINT_RE = /^\/api\/async\/([a-z0-9_.-]+)$/i;

export type WuyinAsyncEndpointDetails = {
    endpointUrl: string;
    endpointPath: string;
    modelId: string;
};

export function extractWuyinAsyncEndpointDetails(value: string): WuyinAsyncEndpointDetails | null {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const directPathMatch = raw.match(WUYIN_ASYNC_ENDPOINT_RE);
    if (directPathMatch && !/^detail$/i.test(directPathMatch[1])) {
        const endpointPath = raw.replace(/\/+$/, '');
        return {
            endpointUrl: `${WUYIN_DEFAULT_ROOT_URL}${endpointPath}`,
            endpointPath,
            modelId: decodeURIComponent(directPathMatch[1]),
        };
    }

    const candidates = /^https?:\/\//i.test(raw) ? [raw] : [`https://${raw}`];
    for (const candidate of candidates) {
        try {
            const parsed = new URL(candidate);
            const endpointPath = parsed.pathname.replace(/\/+$/, '');
            const match = endpointPath.match(WUYIN_ASYNC_ENDPOINT_RE);
            if (!match || /^detail$/i.test(match[1])) continue;

            return {
                endpointUrl: `${parsed.protocol}//${parsed.host}${endpointPath}`,
                endpointPath,
                modelId: decodeURIComponent(match[1]),
            };
        } catch {
            continue;
        }
    }

    return null;
}

const createFallbackWuyinCatalogItem = (modelId: string): ModelPricingInfo => ({
    modelId,
    modelName: modelId,
    inputPrice: 0,
    outputPrice: 0,
    isPerToken: false,
    groupRatio: 1,
    currency: 'CNY',
    billingUnit: '次',
    displayPrice: '待手动设置',
    supportsGroups: false,
    endpointUrl: `${WUYIN_DEFAULT_ROOT_URL}/api/async/${modelId}`,
    endpointPath: `/api/async/${modelId}`,
});

export function extractWuyinModelIdFromBaseUrl(baseUrl: string): string | null {
    return extractWuyinAsyncEndpointDetails(baseUrl)?.modelId || null;
}

export function selectWuyinCatalogModels(baseUrl: string, pricingList: ModelPricingInfo[]): ModelPricingInfo[] {
    const endpointModelId = extractWuyinModelIdFromBaseUrl(baseUrl);
    if (!endpointModelId) {
        return pricingList;
    }

    const normalizedTarget = endpointModelId.trim().toLowerCase();
    const filtered = pricingList.filter((item) => {
        const candidateIds = [
            String(item.modelId || '').trim().toLowerCase(),
            String(item.modelName || '').trim().toLowerCase(),
        ].filter(Boolean);
        return candidateIds.includes(normalizedTarget);
    });

    if (filtered.length > 0) {
        return filtered;
    }

    return [createFallbackWuyinCatalogItem(endpointModelId)];
}

export function buildPricingEndpointCandidates(baseUrl: string): string[] {
    const cleanUrl = normalizePricingBaseUrl(baseUrl);
    if (!cleanUrl) return [];

    const rootUrl = cleanUrl.replace(/\/v1$/i, '');
    const candidates = [
        `${cleanUrl}/pricing`,
        `${cleanUrl}/api/pricing`,
        `${cleanUrl}/price`,
        `${cleanUrl}/api/price`,
        cleanUrl !== rootUrl ? `${rootUrl}/pricing` : '',
        cleanUrl !== rootUrl ? `${rootUrl}/api/pricing` : '',
        cleanUrl !== rootUrl ? `${rootUrl}/price` : '',
        cleanUrl !== rootUrl ? `${rootUrl}/api/price` : '',
    ].filter(Boolean);

    return Array.from(new Set(candidates));
}

function extractPricingPayload(payload: any): { pricingData: any[]; groupRatio: Record<string, number> } {
    const pricingData = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.prices)
            ? payload.prices
            : Array.isArray(payload?.models)
                ? payload.models
                : Array.isArray(payload?.data?.items)
                    ? payload.data.items
                    : [];

    const groupRatio = (payload?.group_ratio || payload?.groupRatio || payload?.data?.group_ratio || {}) as Record<string, number>;
    return { pricingData, groupRatio };
}

function buildPricingHeaders(baseUrl: string, apiKey?: string, format: ApiProtocolFormat = 'auto'): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    };

    const token = String(apiKey || '').trim();
    if (!token) return headers;

    const runtime = resolveProviderRuntime({ baseUrl, format });
    if (runtime.authMethod === 'query') {
        return headers;
    }

    const headerName = runtime.headerName || 'Authorization';
    headers[headerName] = headerName === 'Authorization'
        ? formatAuthorizationHeaderValue(token, runtime.authorizationValueFormat)
        : getApiKeyToken(token);

    return headers;
}

function buildPricingRequestUrl(endpointUrl: string, baseUrl: string, apiKey?: string, format: ApiProtocolFormat = 'auto'): string {
    const token = String(apiKey || '').trim();
    if (!token) return endpointUrl;

    const runtime = resolveProviderRuntime({ baseUrl, format });
    if (runtime.authMethod !== 'query') {
        return endpointUrl;
    }

    const separator = endpointUrl.includes('?') ? '&' : '?';
    return `${endpointUrl}${separator}key=${encodeURIComponent(getApiKeyToken(token))}`;
}

function toWuyinPricingRows(pricingList: ModelPricingInfo[]): any[] {
    return pricingList.map((item) => ({
        model: item.modelId,
        model_name: item.modelName,
        billing_type: 'per_request',
        quota_type: 'per_request',
        per_request_price: item.inputPrice,
        price_per_image: item.inputPrice,
        currency: item.currency,
        pay_unit: item.billingUnit,
        display_price: item.displayPrice,
        endpoint_url: item.endpointUrl,
        endpoint_path: item.endpointPath,
    }));
}

export async function fetchRawPricingCatalog(
    baseUrl: string,
    apiKey?: string,
    format: ApiProtocolFormat = 'auto'
): Promise<RawPricingCatalogResult | null> {
    const cleanUrl = normalizePricingBaseUrl(baseUrl);
    if (!cleanUrl) return null;

    const runtime = resolveProviderRuntime({ baseUrl: cleanUrl, format });
    if (runtime.strategyId === 'wuyinkeji') {
        const pricingList = selectWuyinCatalogModels(cleanUrl, await fetchWuyinPricingCatalog(cleanUrl));
        const rootUrl = runtime.host === 'api.wuyinkeji.com' ? 'https://api.wuyinkeji.com' : cleanUrl;
        return {
            endpointUrl: `${rootUrl}${WUYIN_PRICE_API_PATH}`,
            pricingData: toWuyinPricingRows(pricingList),
            groupRatio: {},
            source: 'wuyinkeji',
            supportsGroups: false,
        };
    }

    const candidateUrls = buildPricingEndpointCandidates(cleanUrl);
    const headers = buildPricingHeaders(cleanUrl, apiKey, format);

    for (const endpointUrl of candidateUrls) {
        try {
            const response = await fetch(buildPricingRequestUrl(endpointUrl, cleanUrl, apiKey, format), {
                method: 'GET',
                headers,
            });

            if (!response.ok) {
                console.warn(`[NewApiPricing] Pricing endpoint ${endpointUrl} returned ${response.status}`);
                continue;
            }

            const text = await response.text();
            if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
                console.warn(`[NewApiPricing] Pricing endpoint ${endpointUrl} returned HTML`);
                continue;
            }

            const payload = JSON.parse(text);
            const { pricingData, groupRatio } = extractPricingPayload(payload);
            if (!pricingData.length) {
                console.warn(`[NewApiPricing] Pricing endpoint ${endpointUrl} returned empty pricing data`);
                continue;
            }

            return {
                endpointUrl,
                pricingData,
                groupRatio,
                source: 'direct',
                supportsGroups: true,
            };
        } catch (error) {
            console.warn(`[NewApiPricing] Pricing endpoint ${endpointUrl} failed:`, error);
        }
    }

    return null;
}

/**
 * Fetch pricing from NewAPI Pro compatible provider
 * The system access token is only used once and not stored
 */
export async function fetchProviderPricing(
    baseUrl: string,
    systemAccessToken: string
): Promise<ModelPricingInfo[]> {
    try {
        const runtime = resolveProviderRuntime({ baseUrl, format: 'openai' });
        if (runtime.strategyId === 'wuyinkeji') {
            return selectWuyinCatalogModels(baseUrl, await fetchWuyinPricingCatalog(baseUrl));
        }

        // NewAPI Pro pricing endpoint
        const pricingUrl = `${baseUrl.replace(/\/$/, '')}/api/pricing`;
        
        const response = await fetch(pricingUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${systemAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to fetch pricing: ${error}`);
        }

        const data = await response.json();
        
        // Parse NewAPI Pro response format
        if (data.data && Array.isArray(data.data)) {
            return data.data.map((item: any) => ({
                modelId: item.model || '',
                modelName: item.model_name || item.model || '',
                inputPrice: parseFloat(item.input_price) || 0,
                outputPrice: parseFloat(item.output_price) || 0,
                isPerToken: item.type === 'tokens' || (!item.type && item.input_price > 0),
                groupRatio: parseFloat(item.group_ratio) || 1.0,
                currency: item.currency || 'USD',
                billingUnit: item.type === 'tokens' || (!item.type && item.input_price > 0) ? '1M tokens' : 'request',
                supportsGroups: true,
            }));
        }

        return [];
    } catch (error) {
        console.error('[NewApiPricing] Error fetching pricing:', error);
        throw error;
    }
}

/**
 * Fetch available models from provider
 */
export async function fetchProviderModels(
    baseUrl: string,
    apiKey: string,
    format: ApiProtocolFormat | 'claude' = 'openai'
): Promise<string[]> {
    try {
        const resolvedFormat = resolveApiProtocolFormat(format, baseUrl);
        const runtime = resolveProviderRuntime({
            baseUrl,
            format: resolvedFormat === 'gemini' ? 'gemini' : format,
        });
        if (runtime.strategyId === 'wuyinkeji') {
            const catalog = selectWuyinCatalogModels(baseUrl, await fetchWuyinPricingCatalog(baseUrl));
            return catalog.map((item) => item.modelId).filter(Boolean);
        }
        const geminiAuthMethod = runtime.authMethod as 'query' | 'header';
        const response = await fetch(
            resolvedFormat === 'gemini'
                ? buildGeminiModelsEndpoint(baseUrl, apiKey, geminiAuthMethod)
                : buildOpenAIEndpoint(baseUrl, 'models'),
            {
                method: 'GET',
                headers: resolvedFormat === 'gemini'
                    ? buildGeminiHeaders(geminiAuthMethod, apiKey, runtime.headerName, runtime.authorizationValueFormat)
                    : buildProxyHeaders(runtime.authMethod as 'query' | 'header', apiKey, runtime.headerName, undefined, runtime.authorizationValueFormat)
            }
        );

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        
        const models = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];

        if (models.length > 0) {
            return models
                .map((m: any) => (m.id || m.model || m.name || '').replace(/^models\//i, ''))
                .filter(Boolean);
        }

        return [];
    } catch (error) {
        console.error('[NewApiPricing] Error fetching models:', error);
        return [];
    }
}

type WuyinCatalogResponse = {
    code?: number;
    msg?: string;
    data?: {
        api_list?: Array<{
            id?: string | number;
            name?: string;
            url?: string;
            price?: string;
            balance_sum?: string | number;
            pay_unit?: string;
            api_type?: string | number;
            tags?: string[];
        }>;
    };
};

type WuyinCatalogItem = NonNullable<NonNullable<WuyinCatalogResponse['data']>['api_list']>[number];

const WUYIN_PRICE_API_PATH = '/themes/DigitalBlue/api?action=api_list';

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '');

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const toFiniteNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
};

const extractWuyinDisplayPrice = (item: WuyinCatalogItem) => {
    const unit = String(item?.pay_unit || '').trim() || '次';
    const text = stripHtml(String(item?.price || ''));
    const priceMatch = text.match(/([0-9]+(?:\.[0-9]+)?)/);
    const numeric = toFiniteNumber(item?.balance_sum) ?? (priceMatch ? Number(priceMatch[1]) : undefined) ?? 0;
    const displayPrice = numeric > 0 ? `${numeric}元/${unit}` : (text || `0元/${unit}`);
    return {
        numeric,
        unit,
        displayPrice,
    };
};

export async function fetchWuyinPricingCatalog(baseUrl: string): Promise<ModelPricingInfo[]> {
    const runtime = resolveProviderRuntime({ baseUrl, format: 'openai' });
    const rootUrl = runtime.host === 'api.wuyinkeji.com'
        ? 'https://api.wuyinkeji.com'
        : normalizeBaseUrl(baseUrl);

    const response = await fetch(`${rootUrl}${WUYIN_PRICE_API_PATH}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch Wuyin pricing catalog: HTTP ${response.status}`);
    }

    const data = await response.json() as WuyinCatalogResponse;
    const apiList: WuyinCatalogItem[] = Array.isArray(data?.data?.api_list)
        ? data.data.api_list
        : [];

    return apiList.map((item) => {
        const { numeric, unit, displayPrice } = extractWuyinDisplayPrice(item);
        const endpoint = extractWuyinAsyncEndpointDetails(String(item?.url || '').trim());
        const modelId =
            endpoint?.modelId ||
            String(item?.name || '').trim() ||
            String(item?.id || '').trim();

        return {
            modelId,
            modelName: String(item?.name || modelId).trim(),
            inputPrice: numeric,
            outputPrice: 0,
            isPerToken: false,
            groupRatio: 1,
            currency: 'CNY',
            billingUnit: unit,
            displayPrice,
            supportsGroups: false,
            endpointUrl: endpoint?.endpointUrl,
            endpointPath: endpoint?.endpointPath,
        };
    }).filter((item) => item.modelId);
}

/**
 * Calculate cost for a request
 */
export function calculateRequestCost(
    pricing: ModelPricingInfo,
    inputTokens: number,
    outputTokens: number
): number {
    if (!pricing.isPerToken) {
        // Per request pricing
        return pricing.inputPrice;
    }

    // Per token pricing (prices are per 1M tokens)
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPrice;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPrice;
    
    // Apply group ratio
    const ratio = pricing.groupRatio || 1.0;
    return (inputCost + outputCost) * ratio;
}

/**
 * Save pricing info to Supabase (temporarily cached)
 */
export async function cacheProviderPricing(
    providerId: string,
    pricing: ModelPricingInfo[]
): Promise<void> {
    try {
        const { error } = await supabase
            .from('provider_pricing_cache')
            .upsert({
                provider_id: providerId,
                pricing: pricing,
                cached_at: new Date().toISOString()
            }, {
                onConflict: 'provider_id'
            });

        if (error) {
            console.error('[NewApiPricing] Error caching pricing:', error);
        }
    } catch (e) {
        console.error('[NewApiPricing] Error:', e);
    }
}

/**
 * Get cached pricing
 */
export async function getCachedPricing(
    providerId: string
): Promise<ModelPricingInfo[] | null> {
    try {
        const { data, error } = await supabase
            .from('provider_pricing_cache')
            .select('pricing')
            .eq('provider_id', providerId)
            .single();

        if (error || !data) return null;
        return data.pricing as ModelPricingInfo[];
    } catch (e) {
        return null;
    }
}
