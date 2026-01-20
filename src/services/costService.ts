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

    // 2. Gemini Pro Models (Tier 1 Pricing - $3.50/$10.50)
    // Covering: gemini-3-pro-preview, gemini-1.5-pro, gemini-3-pro
    if (modelId.includes('pro') && !modelId.includes('lite') && !modelId.includes('flash')) {
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

    // 3. Gemini Flash / Lite Models (Tier 2 Pricing - $0.075/$0.30)
    // Covering: gemini-flash-latest, gemini-flash-lite-latest, gemini-3-flash-preview
    // Lite is usually cheaper, but using Flash rate as safe baseline or defining Lite specific if critical.
    // Flash Lite (Preview) often free, but let's estimate as Flash rate for budget safety.
    if (modelId.includes('flash') || modelId.includes('lite') || modelId.includes('banana')) {
        // Flash Pricing
        const inputRate = 0.075;
        const outputRate = 0.30;

        // If it's pure text generation (Chat), 'count' might be 1 (msg), promptLen is input chars.
        // For Image gen (Flash Image), we use per-image token estimation.
        // Let's distinguish by context? Or just use generic token calc.
        // Assuming this function is primarily for IMAGE gen cost (based on 'imageSize' arg).
        // BUT user asked to count CHAT cost?
        // Chat cost usually handled separately or via recordCost with count=1.

        // Image Gen logic (Flash Image):
        const outputTokens = count * PRICING.GEMINI_2_5.GEN_TOKENS_STD;
        const outputCost = (outputTokens / 1_000_000) * outputRate;

        const textTokens = Math.ceil(promptLen / 4);
        const refTokens = refCount * PRICING.GEMINI_2_5.REF_IMG_TOKENS;
        const inputTokens = textTokens + refTokens;
        const inputCost = (inputTokens / 1_000_000) * inputRate;

        cost = Math.max(0.000001, inputCost + outputCost);
        tokens = inputTokens + outputTokens;
        details = `Flash: ${tokens} Tokens`;
        return { cost, details, tokens };
    }

    return { cost: 0, details: 'Unknown', tokens: 0 };
};

// Add separate text-only cost calculator if needed, or rely on recordCost passing accurate 'promptLen' and 'count=0' (if image cost).
// Actually, ChatSidebar calls generateText using geminiService.
// We need to ensure ChatSidebar calls 'recordCost' too, or geminiService does.
// Currently ChatSidebar doesn't seem to call recordCost. 
// I should check ChatSidebar.tsx to see if it records usage.
// Checking previous view: ChatSidebar.tsx handles 'handleSend' but no 'recordCost' call visible in snippet.
// I will need to add recordCost to ChatSidebar.tsx.

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

    // Trigger Sync
    saveToCloud();
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

const BUDGET_STORAGE_KEY = 'kk_studio_daily_budget';

export function getDailyBudget(): number {
    const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
    return stored ? parseFloat(stored) : -1;
}

export function setDailyBudget(amount: number): void {
    localStorage.setItem(BUDGET_STORAGE_KEY, amount.toString());
    saveToCloud();
}

// --- Cloud Sync ---
import { supabase } from '../lib/supabase';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { notify } from './notificationService';

let currentUserId: string | null = null;
let isSyncing = false;

export async function setUserId(userId: string | null) {
    if (currentUserId === userId) return;
    currentUserId = userId;
    if (userId) {
        console.log('[CostService] Setting user and syncing:', userId);
        await loadFromCloud();
    }
}

export async function forceSync(): Promise<boolean> {
    if (!currentUserId) return false;
    console.log('[CostService] Force sync requested');
    await loadFromCloud();
    return true;
}

async function loadFromCloud() {
    if (!currentUserId || isSyncing) return;
    isSyncing = true;
    try {
        const { data, error } = await supabase.from('user_settings').select('daily_budget, usage_stats').eq('user_id', currentUserId).single();

        if (error) {
            if (error.code !== 'PGRST116') { // Ignore "Row not found" (new user)
                throw error;
            }
        }

        if (data) {
            // Sync Budget
            if (data.daily_budget !== null && data.daily_budget !== undefined) {
                localStorage.setItem(BUDGET_STORAGE_KEY, String(data.daily_budget));
            }

            // Sync Usage Stats
            if (data.usage_stats) {
                const cloudStats = data.usage_stats as DailyCostData;
                const local = loadDailyCosts();

                // Only sync if it's for today (CostService resets daily)
                const isToday = cloudStats.date === getTodayString();

                if (isToday) {
                    // Simple merge: keep whichever has higher cost (assuming accumulation)
                    if (cloudStats.totalCostUsd > local.totalCostUsd) {
                        try {
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudStats));
                            console.log('[CostService] Synced from cloud (Higher cost found)');
                        } catch (e) { console.warn('Failed to save synced costs', e); }
                    } else if (local.totalCostUsd > cloudStats.totalCostUsd) {
                        // Local is ahead of cloud, push it
                        saveToCloud();
                    }
                }
            }
        }
    } catch (e: any) {
        console.warn('[CostService] Sync load failed', e);
    } finally {
        isSyncing = false;
    }
}

async function saveToCloud() {
    if (!currentUserId) return;
    try {
        // Use UPSERT to update cost fields without validating other columns (like api_keys)
        const { error } = await supabase.from('user_settings').upsert({
            user_id: currentUserId,
            daily_budget: getDailyBudget(),
            usage_stats: loadDailyCosts(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        if (error) throw error;

    } catch (e: any) {
        console.warn('[CostService] Sync save failed', e);
        // If table doesn't exist (42P01), notify user specifically about setup
        if (e.code === '42P01') {
            notify.error('同步配置缺失', '请在 Supabase 创建 user_settings 表以同步成本数据');
        }
    }
}
