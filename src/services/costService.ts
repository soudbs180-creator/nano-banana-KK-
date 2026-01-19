/**
 * Cost Estimation Service
 * Tracks daily API usage costs based on Gemini pricing
 * Data resets at midnight each day
 * 
 * Pricing Reference (per image):
 * - Gemini 2.5 Flash Image: $0.039
 * - Gemini 3 Pro Image (1K-2K): $0.134
 * - Gemini 3 Pro Image (4K): $0.24
 * - Imagen 4: $0.02
 * - Imagen 4 Ultra: $0.04
 */

import { ModelType, ImageSize } from '../types';

interface CostEntry {
    id: string;
    model: ModelType;
    imageSize: ImageSize;
    count: number;
    costUsd: number;
    timestamp: number;
}

interface DailyCostData {
    date: string; // YYYY-MM-DD
    entries: CostEntry[];
    totalCostUsd: number;
    totalImages: number;
}

const STORAGE_KEY = 'kk_studio_daily_costs';

// Pricing per image in USD
const MODEL_PRICING: Record<string, Record<string, number>> = {
    [ModelType.NANO_BANANA]: {
        [ImageSize.SIZE_1K]: 0.039,
        [ImageSize.SIZE_2K]: 0.039,
        [ImageSize.SIZE_4K]: 0.039, // Same for Flash
    },
    [ModelType.NANO_BANANA_PRO]: {
        [ImageSize.SIZE_1K]: 0.134,
        [ImageSize.SIZE_2K]: 0.134,
        [ImageSize.SIZE_4K]: 0.24,
    },
    [ModelType.IMAGEN_4]: {
        [ImageSize.SIZE_1K]: 0.02,
        [ImageSize.SIZE_2K]: 0.02,
        [ImageSize.SIZE_4K]: 0.03,
    },
    [ModelType.IMAGEN_4_ULTRA]: {
        [ImageSize.SIZE_1K]: 0.04,
        [ImageSize.SIZE_2K]: 0.04,
        [ImageSize.SIZE_4K]: 0.06,
    },
};

/**
 * Get today's date string in YYYY-MM-DD format
 */
function getTodayString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

/**
 * Load daily cost data from localStorage
 */
function loadDailyCosts(): DailyCostData {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const data: DailyCostData = JSON.parse(stored);
            // Check if it's today's data
            if (data.date === getTodayString()) {
                return data;
            }
        }
    } catch (e) {
        console.warn('[CostService] Failed to load costs:', e);
    }

    // Return fresh data for new day
    return {
        date: getTodayString(),
        entries: [],
        totalCostUsd: 0,
        totalImages: 0
    };
}

/**
 * Save daily cost data to localStorage
 */
function saveDailyCosts(data: DailyCostData): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[CostService] Failed to save costs:', e);
    }
}

/**
 * Get price for a specific model and size
 */
export function getModelPrice(model: ModelType, size: ImageSize): number {
    const modelPrices = MODEL_PRICING[model];
    if (!modelPrices) return 0;
    return modelPrices[size] || modelPrices[ImageSize.SIZE_1K] || 0;
}

/**
 * Record a generation cost
 */
export function recordCost(model: ModelType, size: ImageSize, count: number = 1): void {
    const pricePerImage = getModelPrice(model, size);
    const totalCost = pricePerImage * count;

    const data = loadDailyCosts();

    const entry: CostEntry = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        model,
        imageSize: size,
        count,
        costUsd: totalCost,
        timestamp: Date.now()
    };

    data.entries.push(entry);
    data.totalCostUsd += totalCost;
    data.totalImages += count;

    saveDailyCosts(data);

    console.log(`[CostService] Recorded: ${count} images @ $${pricePerImage}/ea = $${totalCost.toFixed(4)}`);
}

/**
 * Get today's cost summary
 */
export function getTodayCosts(): DailyCostData {
    return loadDailyCosts();
}

/**
 * Get cost breakdown by model
 */
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

/**
 * Get human-readable model name
 */
export function getModelDisplayName(model: ModelType): string {
    switch (model) {
        case ModelType.NANO_BANANA:
            return 'Gemini 2.5 Flash Image';
        case ModelType.NANO_BANANA_PRO:
            return 'Gemini 3 Pro Image';
        case ModelType.IMAGEN_4:
            return 'Imagen 4';
        case ModelType.IMAGEN_4_ULTRA:
            return 'Imagen 4 Ultra';
        default:
            return model;
    }
}

/**
 * Clear today's costs (for testing)
 */
export function clearTodayCosts(): void {
    localStorage.removeItem(STORAGE_KEY);
}
