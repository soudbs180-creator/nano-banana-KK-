/**
 * Cost Estimation Service
 * Tracks daily API usage costs based on updated pricing models.
 * 
 * Pricing Reference:
 * - Imagen 4 ($0.02), Ultra ($0.04) (Fixed)
 * - Gemini 3 Pro (Token Based): Input $2/1M, Output $120/1M
 * - Gemini 2.5 Flash: Input $0.10/1M, Output $0.40/1M (Approx)
 */

import { ModelType, ImageSize } from '../types';

interface CostEntry {
    id: string;
    model: ModelType;
    imageSize: ImageSize;
    count: number;
    costUsd: number;
    timestamp: number;
    details?: string;
    tokens?: number; // New: Track tokens
}

interface DailyCostData {
    date: string;
    entries: CostEntry[];
    totalCostUsd: number;
    totalImages: number;
    totalTokens: number; // New: Track total tokens
}

const STORAGE_KEY = 'kk_studio_daily_costs';

const PRICING = {
    IMAGEN: {
        FAST: 0.02,
        STD: 0.04,
        ULTRA: 0.06
    },
    GEMINI_3_PRO: {
        INPUT_1M: 3.50,
        OUTPUT_1M: 10.50,
        REF_IMG_TOKENS: 258,
        GEN_TOKENS_STD: 1120,
        GEN_TOKENS_HD: 2000
    },
    GEMINI_2_5: {
        INPUT_1M: 0.075,
        OUTPUT_1M: 0.30,
        REF_IMG_TOKENS: 258,
        GEN_TOKENS_STD: 258
    }
};

function getTodayString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

function loadDailyCosts(): DailyCostData {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const data: DailyCostData = JSON.parse(stored);
            if (data.date === getTodayString()) {
                // Ensure totalTokens exists for backward compatibility
                if (typeof data.totalTokens === 'undefined') data.totalTokens = 0;
                return data;
            }
        }
    } catch (e) {
        console.warn('[CostService] Failed to load costs:', e);
    }
    return {
        date: getTodayString(),
        entries: [],
        totalCostUsd: 0,
        totalImages: 0,
        totalTokens: 0
    };
}

function saveDailyCosts(data: DailyCostData): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[CostService] Failed to save costs:', e);
    }
}

export const calculateCost = (
    model: ModelType,
    size: ImageSize,
    count: number,
    promptLen: number = 0,
    refCount: number = 0
): { cost: number; details: string; tokens: number } => {
    let cost = 0;
    let details = '';
    let tokens = 0;

    const modelId = model.toLowerCase();

    // 1. Imagen Models (Fixed Price per Image)
    if (modelId.includes('imagen')) {
        let pricePerImage = 0.03;
        if (modelId.includes('ultra') || modelId.includes('imagen-4.0-ultra')) {
            pricePerImage = 0.06;
        } else if (modelId.includes('fast') || modelId.includes('flash')) {
            pricePerImage = 0.02;
        }
        cost = pricePerImage * count;
        details = `Fixed: $${pricePerImage}/img`;
        return { cost, details, tokens: 0 };
    }

    // 2. Gemini Pro Models (Tier 1 Pricing)
    if (modelId.includes('pro') || modelId.includes('gemini-3') || modelId.includes('gemini-1.5-pro')) {
        const isHD = size === ImageSize.SIZE_4K;
        const outputTokens = count * (isHD ? PRICING.GEMINI_3_PRO.GEN_TOKENS_HD : PRICING.GEMINI_3_PRO.GEN_TOKENS_STD);
        const outputCost = (outputTokens / 1_000_000) * PRICING.GEMINI_3_PRO.OUTPUT_1M;

        const textTokens = Math.ceil(promptLen / 4);
        const refTokens = refCount * PRICING.GEMINI_3_PRO.REF_IMG_TOKENS;
        const inputTokens = textTokens + refTokens;
        const inputCost = (inputTokens / 1_000_000) * PRICING.GEMINI_3_PRO.INPUT_1M;

        cost = inputCost + outputCost;
        tokens = inputTokens + outputTokens;
        details = `Pro: ${tokens} Tokens`;
        return { cost, details, tokens };
    }

    // 3. Gemini Flash Models (Tier 2 Pricing)
    if (modelId.includes('flash') || modelId.includes('banana') || modelId.includes('lite') || modelId.includes('gemini-1.5-flash')) {
        const outputTokens = count * PRICING.GEMINI_2_5.GEN_TOKENS_STD;
        const outputCost = (outputTokens / 1_000_000) * PRICING.GEMINI_2_5.OUTPUT_1M;

        const textTokens = Math.ceil(promptLen / 4);
        const refTokens = refCount * PRICING.GEMINI_2_5.REF_IMG_TOKENS;
        const inputTokens = textTokens + refTokens;
        const inputCost = (inputTokens / 1_000_000) * PRICING.GEMINI_2_5.INPUT_1M;

        cost = Math.max(0.000001, inputCost + outputCost);
        tokens = inputTokens + outputTokens;
        details = `Flash: ${tokens} Tokens`;
        return { cost, details, tokens };
    }

    return { cost: 0, details: 'Unknown', tokens: 0 };
};

/**
 * Record a new cost entry
 */
export function recordCost(
    model: ModelType,
    imageSize: ImageSize,
    count: number,
    prompt: string = '',
    refImageCount: number = 0
): void {
    if (count <= 0) return;

    const currentData = loadDailyCosts();
    const { cost, details, tokens } = calculateCost(model, imageSize, count, prompt.length, refImageCount);

    currentData.totalCostUsd += cost;
    currentData.totalImages += count;
    currentData.totalTokens += tokens;

    currentData.entries.push({
        id: Date.now().toString(),
        model,
        imageSize,
        count,
        costUsd: cost,
        timestamp: Date.now(),
        details,
        tokens
    });

    saveDailyCosts(currentData);
    console.log(`[CostService] Recorded: $${cost.toFixed(4)} (${details})`);
}

export function getTodayCosts(): DailyCostData {
    return loadDailyCosts();
}

export interface CostBreakdownItem {
    model: string;
    imageSize: ImageSize;
    count: number;
    tokens: number;
    cost: number;
}

export function getCostsByModel(): CostBreakdownItem[] {
    const data = loadDailyCosts();
    const map = new Map<string, CostBreakdownItem>();

    data.entries.forEach(entry => {
        const key = `${entry.model}_${entry.imageSize}`;
        if (!map.has(key)) {
            map.set(key, {
                model: entry.model,
                imageSize: entry.imageSize,
                count: 0,
                tokens: 0,
                cost: 0
            });
        }
        const item = map.get(key)!;
        item.count += entry.count;
        item.tokens += (entry.tokens || 0); // Handle legacy data
        item.cost += entry.costUsd;
    });

    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

export function getModelDisplayName(model: string): string {
    if (model.includes('imagen-3.0-generate-001')) return 'Imagen 3 Fast';
    if (model.includes('imagen-3.0-generate-002')) return 'Imagen 3';
    if (model.includes('gemini-2.0-flash-exp')) return 'Gemini 2.0 Flash';
    if (model.includes('gemini-2.0-pro-exp')) return 'Gemini 2.0 Pro'; // Common name if applicable
    if (model.includes('nano-banana')) return 'Gemini 2.5 Flash'; // Mapping internal ID
    if (model.includes('nano-banana-pro')) return 'Gemini 3 Pro'; // Mapping internal ID

    // Fallback cleanup
    return model
        .replace('models/', '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
