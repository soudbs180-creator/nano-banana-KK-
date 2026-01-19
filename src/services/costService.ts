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
    details?: string; // e.g. "Input: 100, Output: 2000"
}

interface DailyCostData {
    date: string; // YYYY-MM-DD
    entries: CostEntry[];
    totalCostUsd: number;
    totalImages: number;
}

const STORAGE_KEY = 'kk_studio_daily_costs';

const PRICING = {
    IMAGEN: {
        FAST: 0.02,
        STD: 0.04,
        ULTRA: 0.06
    },
    GEMINI_3_PRO: {
        INPUT_1M: 2.00,
        OUTPUT_1M: 120.00,
        REF_IMG_TOKENS: 560,
        GEN_TOKENS_STD: 1120, // 1K, 2K
        GEN_TOKENS_HD: 2000   // 4K
    },
    GEMINI_2_5: {
        INPUT_1M: 0.10,
        OUTPUT_1M: 0.40,
        REF_IMG_TOKENS: 258,
        GEN_TOKENS_STD: 258 // Assuming output tokens for image if applicable
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
        totalImages: 0
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
): { cost: number; details: string } => {
    let cost = 0;
    let details = '';

    // Imagen Models (Fixed Price)
    if (model.includes('imagen')) {
        let pricePerImage = PRICING.IMAGEN.STD;
        if (model.includes('fast')) pricePerImage = PRICING.IMAGEN.FAST;
        if (model.includes('ultra')) pricePerImage = PRICING.IMAGEN.ULTRA;
        cost = pricePerImage * count;
        details = `Fixed: $${pricePerImage}/img`;
        return { cost, details };
    }

    // Gemini 3 Pro (Token Based)
    if (model.includes('banana-pro') || model.includes('gemini-3')) {
        // Output Tokens: Generation
        const isHD = size === ImageSize.SIZE_4K;
        const outputTokens = count * (isHD ? PRICING.GEMINI_3_PRO.GEN_TOKENS_HD : PRICING.GEMINI_3_PRO.GEN_TOKENS_STD);
        const outputCost = (outputTokens / 1_000_000) * PRICING.GEMINI_3_PRO.OUTPUT_1M;

        // Input Tokens: Prompt + References
        const textTokens = Math.ceil(promptLen / 4);
        const refTokens = refCount * PRICING.GEMINI_3_PRO.REF_IMG_TOKENS;
        const inputTokens = textTokens + refTokens;
        const inputCost = (inputTokens / 1_000_000) * PRICING.GEMINI_3_PRO.INPUT_1M;

        cost = inputCost + outputCost;
        details = `In: ${inputTokens}tk, Out: ${outputTokens}tk`;
        return { cost, details };
    }

    // Gemini 2.5 Flash (Standard)
    if (model.includes('banana') || model.includes('flash')) {
        const outputTokens = count * PRICING.GEMINI_2_5.GEN_TOKENS_STD;
        const outputCost = (outputTokens / 1_000_000) * PRICING.GEMINI_2_5.OUTPUT_1M;

        const textTokens = Math.ceil(promptLen / 4);
        const refTokens = refCount * PRICING.GEMINI_2_5.REF_IMG_TOKENS;
        const inputTokens = textTokens + refTokens;
        const inputCost = (inputTokens / 1_000_000) * PRICING.GEMINI_2_5.INPUT_1M;

        cost = Math.max(0.0001, inputCost + outputCost);
        details = `In: ${inputTokens}tk, Out: ${outputTokens}tk (Flash)`;
        return { cost, details };
    }

    return { cost: 0, details: 'Unknown Model' };
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
    const { cost, details } = calculateCost(model, imageSize, count, prompt.length, refImageCount);

    currentData.totalCostUsd += cost;
    currentData.totalImages += count;

    currentData.entries.push({
        id: Date.now().toString(),
        model,
        imageSize,
        count,
        costUsd: cost,
        timestamp: Date.now(),
        details
    });

    saveDailyCosts(currentData);
    console.log(`[CostService] Recorded: $${cost.toFixed(4)} (${details})`);
}

export function getTodayCosts(): DailyCostData {
    return loadDailyCosts();
}

export function getCostsByModel(): Record<string, { count: number; cost: number }> {
    const data = loadDailyCosts();
    const breakdown: Record<string, { count: number; cost: number }> = {};
    data.entries.forEach(entry => {
        if (!breakdown[entry.model]) {
            breakdown[entry.model] = { count: 0, cost: 0 };
        }
        breakdown[entry.model].count += entry.count;
        breakdown[entry.model].cost += entry.costUsd;
    });
    return breakdown;
}
