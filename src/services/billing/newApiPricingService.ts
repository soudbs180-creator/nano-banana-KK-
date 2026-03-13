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
}

export interface NewApiProviderConfig {
    baseUrl: string;
    apiKey: string;
    systemAccessToken?: string; // for fetching pricing
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
                currency: item.currency || 'USD'
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
        const geminiAuthMethod = runtime.authMethod as 'query' | 'header';
        const response = await fetch(
            resolvedFormat === 'gemini'
                ? buildGeminiModelsEndpoint(baseUrl, apiKey, geminiAuthMethod)
                : buildOpenAIEndpoint(baseUrl, 'models'),
            {
                method: 'GET',
                headers: resolvedFormat === 'gemini'
                    ? buildGeminiHeaders(geminiAuthMethod, apiKey, runtime.headerName)
                    : {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
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
