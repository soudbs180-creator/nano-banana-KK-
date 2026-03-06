/**
 * Cost Estimation Service
 * Tracks daily API usage costs based on updated pricing models.
 * Includes 30-day history and recent 50 detailed entries.
 */

import { ModelType, ImageSize } from '../../types';
import { getModelPricing, getRefImageTokenEstimate, getImageTokenEstimate } from '../model/modelPricing';
import { keyManager, type KeySlot } from '../auth/keyManager';
import { supabase } from '../../lib/supabase';
import { notify } from '../system/notificationService';

// --- Interfaces ---

export interface CostEntry {
    id: string;
    model: string; // Can be "model@source"
    imageSize: ImageSize;
    count: number;
    costUsd: number;
    timestamp: number;
    details?: string;
    tokens?: number;
    requestPath?: string;
    requestBodyPreview?: string;
    pythonSnippet?: string;
}

export interface CostDebugMeta {
    requestPath?: string;
    requestBodyPreview?: string;
    pythonSnippet?: string;
}

export interface CostBreakdownItem {
    model: string;
    imageSize: ImageSize;
    count: number;
    tokens: number;
    cost: number;
}

export interface DayStats {
    date: string;
    totalCostUsd: number;
    totalImages: number;
    totalTokens: number;
    breakdown: CostBreakdownItem[];
}

export interface CostHistory {
    daily: DayStats[]; // Limit 30 days
    recent: CostEntry[]; // Limit 50 entries
}

export interface UsageStats {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number; // Explicit cost from provider
}

// --- Storage Keys ---
const HISTORY_STORAGE_KEY = 'kk_studio_cost_history';
const BUDGET_STORAGE_KEY = 'kk_studio_daily_budget';

// --- State ---
let currentUserId: string | null = null;
let isSyncing = false;
let syncTimer: any = null;

// --- Helpers ---

function getTodayString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

function loadHistory(): CostHistory {
    try {
        const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            // Migrate old format or ensure structure
            if (!data.daily) data.daily = [];
            if (!data.recent) data.recent = [];
            return data;
        }
    } catch (e) {
        console.warn('[CostService] Failed to load history:', e);
    }
    return { daily: [], recent: [] };
}

function saveHistory(data: CostHistory): void {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('[CostService] Failed to save history:', e);
    }
}

/**
 * Parses "model@source" into { modelId, source }
 */
export function parseModelSource(fullModelId: string): { modelId: string; source: string } {
    if (!fullModelId) return { modelId: 'Unknown', source: 'Unknown' };

    if (fullModelId.includes('@')) {
        const [model, source] = fullModelId.split('@');
        return { modelId: model, source: source || 'Custom' };
    }
    return { modelId: fullModelId, source: 'Official' }; // Default to Official if no @
}

// --- Core Logic ---

export const calculateCost = (
    fullModelId: string,
    size: ImageSize,
    count: number,
    promptLen: number = 0,
    refCount: number = 0,
    keySlotId?: string
): { cost: number; details: string; tokens: number } => {
    let cost = 0;
    let details = '';
    let tokens = 0;

    const { modelId } = parseModelSource(fullModelId);
    const normalizedId = modelId.toLowerCase();

    // =============== 新版 API 接口自定义计费逻辑 ===============
    if (keySlotId) {
        const slot = keyManager.getProviders().find(p => p.id === keySlotId);
        if (slot && slot.pricingSnapshot) {
            const snap = slot.pricingSnapshot;
            const mPrice = snap.modelPrices?.[modelId];
            const mRatio = snap.modelRatios?.[modelId];

            // 如果是按次计费
            if (mPrice !== undefined) {
                cost = mPrice * count;
                details = `API按次: $${mPrice}/img`;
                return { cost, details, tokens: 0 };
            }

            // 否则尝试按 token 混合计费
            if (mRatio !== undefined) {
                const gRatio = snap.groupRatio || 1;
                const gmRatio = snap.groupModelRatios?.[modelId] || 1;

                const textTokens = Math.ceil(promptLen / 4);
                const refTokens = refCount * 560;
                const inputTokens = textTokens + refTokens;

                const outputTokensPerImage = getImageTokenEstimate(normalizedId, size);
                const outputTokens = count * outputTokensPerImage;

                const sRatioObj = snap.sizeRatios?.[modelId];
                let strSize = "Unknown";
                if (typeof size === 'object' && size !== null && 'width' in size && 'height' in size) {
                    strSize = `${(size as any).width}x${(size as any).height}`;
                } else {
                    strSize = String(size);
                }
                const sRatio = sRatioObj ? (sRatioObj[strSize] || 1) : 1;

                const cRatio = snap.completionRatios?.[modelId] || 1;

                // 计算总倍率下的相当于多少标准 token (通常 OneAPI 的 model_ratio 表示按 500000 相当于 $1 的计价基准乘数)
                // 具体计价常数因站而异，如果没有定义，系统目前使用兜底价格：0.002 / 1000 => 2 / 1000000
                const baseRate = 2.0 / 1000000; // $0.002 per 1k ratio

                const inputCost = inputTokens * baseRate * mRatio * gRatio * gmRatio;
                const outputCost = outputTokens * baseRate * mRatio * cRatio * sRatio * gRatio * gmRatio;

                cost = Math.max(0.000001, inputCost + outputCost);
                tokens = inputTokens + outputTokens;
                details = `API按量: ${tokens} Toks (Ratio: ${mRatio})`;
                return { cost, details, tokens };
            }
        }
    }
    // =========================================================

    const pricing = getModelPricing(normalizedId);

    // Prioritize Pricing Registry
    if (pricing) {
        if (pricing.pricePerImage) {
            cost = pricing.pricePerImage * count;
            details = `Fixed: $${pricing.pricePerImage}/img`;
            return { cost, details, tokens: 0 };
        }

        if (pricing.inputPerMillionTokens || pricing.outputPerMillionTokens) {
            const textTokens = Math.ceil(promptLen / 4);
            const refTokens = refCount * (pricing.refImageTokens || 560);
            const inputTokens = textTokens + refTokens;

            const outputTokensPerImage = getImageTokenEstimate(normalizedId, size);
            const outputTokens = count * outputTokensPerImage;

            const inputCost = (inputTokens / 1_000_000) * (pricing.inputPerMillionTokens || 0);
            const outputCost = (outputTokens / 1_000_000) * (pricing.outputPerMillionTokens || 0);

            cost = Math.max(0.000001, inputCost + outputCost);
            tokens = inputTokens + outputTokens;
            details = `Pricing: ${tokens} Toks`;
            return { cost, details, tokens };
        }
    }

    // Fallback Hardcoded Logic (only if not in registry)
    // ... (Keep generic fallbacks if necessary, but registry should cover most)

    // Simple fallback for unknown models
    return { cost: 0, details: 'Unknown Model', tokens: 0 };
};

export function recordCost(
    model: string,
    imageSize: ImageSize,
    count: number,
    prompt: string = '',
    refImageCount: number = 0,
    usage?: UsageStats,
    debugMeta?: CostDebugMeta,
    keySlotId?: string
): void {
    if (count <= 0) return;

    const history = loadHistory();
    const todayStr = getTodayString();

    // 1. Calculate Cost
    let { cost, details, tokens } = calculateCost(model, imageSize, count, prompt.length, refImageCount, keySlotId);

    if (usage) {
        if (usage.totalTokens !== undefined) {
            tokens = usage.totalTokens;
            details = `Actual: ${tokens} Toks`;
        }
        if (usage.cost !== undefined) {
            cost = usage.cost;
            details += ` | Cost: $${cost.toFixed(6)}`;
        } else if (usage.totalTokens !== undefined) {
            // Re-calculate cost based on actual tokens if pricing exists
            const { modelId } = parseModelSource(model);
            const pricing = getModelPricing(modelId);
            if (pricing && (pricing.inputPerMillionTokens || pricing.outputPerMillionTokens)) {
                // Approximate split if not provided
                const pTokens = usage.promptTokens || 0;
                const cTokens = usage.completionTokens || (usage.totalTokens - pTokens);
                const iCost = (pTokens / 1000000) * (pricing.inputPerMillionTokens || 0);
                const oCost = (cTokens / 1000000) * (pricing.outputPerMillionTokens || 0);
                cost = iCost + oCost;
            }
        }
    }

    // 2. Create Entry
    const newEntry: CostEntry = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        model,
        imageSize,
        count,
        costUsd: cost,
        timestamp: Date.now(),
        details,
        tokens,
        requestPath: debugMeta?.requestPath,
        requestBodyPreview: debugMeta?.requestBodyPreview,
        pythonSnippet: debugMeta?.pythonSnippet
    };

    // 3. Update Recent List (Max 50)
    history.recent.unshift(newEntry);
    if (history.recent.length > 50) {
        history.recent = history.recent.slice(0, 50);
    }

    // 4. Update Daily Stats (Max 30 Days)
    let dayStats = history.daily.find(d => d.date === todayStr);
    if (!dayStats) {
        dayStats = {
            date: todayStr,
            totalCostUsd: 0,
            totalImages: 0,
            totalTokens: 0,
            breakdown: []
        };
        history.daily.unshift(dayStats); // Newest day first
    }

    // Update Totals
    dayStats.totalCostUsd += cost;
    dayStats.totalImages += count;
    dayStats.totalTokens += tokens;

    // Update Breakdown
    const breakdownKey = `${model}_${imageSize}`;
    let breakdownItem = dayStats.breakdown.find(b => `${b.model}_${b.imageSize}` === breakdownKey);
    if (!breakdownItem) {
        breakdownItem = {
            model,
            imageSize,
            count: 0,
            tokens: 0,
            cost: 0
        };
        dayStats.breakdown.push(breakdownItem);
    }
    breakdownItem.count += count;
    breakdownItem.tokens += tokens;
    breakdownItem.cost += cost;

    // Prune old days (> 30)
    if (history.daily.length > 30) {
        history.daily = history.daily.slice(0, 30);
    }

    saveHistory(history);
    console.log(`[CostService] Recorded: $${cost.toFixed(4)} (${details})`);

    // Trigger Sync
    scheduleSync();
}

// --- Getters ---

export function getTodayCosts(): DayStats {
    const history = loadHistory();
    const today = getTodayString();

    // Try to find today's stats
    let stats = history.daily.find(d => d.date === today);

    // If not found, try to migrate from old storage key just in case
    if (!stats) {
        try {
            const oldKey = 'kk_studio_daily_costs';
            const oldData = localStorage.getItem(oldKey);
            if (oldData) {
                const parsed = JSON.parse(oldData);
                if (parsed.date === today) {
                    // We found legacy data for today, let's use it temporarily or migrate it
                    // For simplicity, return it as DayStats equivalent
                    stats = {
                        date: parsed.date,
                        totalCostUsd: parsed.totalCostUsd || 0,
                        totalImages: parsed.totalImages || 0,
                        totalTokens: parsed.totalTokens || 0,
                        breakdown: [] // Reconstruction might be hard, return empty breakdown
                    };
                }
            }
        } catch (e) {
            // 统计数据解析失败，返回默认值
            console.warn('[CostService] Failed to parse stats:', e);
        }
    }

    return stats || {
        date: today,
        totalCostUsd: 0,
        totalImages: 0,
        totalTokens: 0,
        breakdown: []
    };
}

export function getHistorySummary(days: number = 30): CostBreakdownItem[] {
    const history = loadHistory();
    const map = new Map<string, CostBreakdownItem>();

    // Aggregate last N days
    const relevantDays = history.daily.slice(0, days);

    relevantDays.forEach(day => {
        day.breakdown.forEach(item => {
            const key = `${item.model}_${item.imageSize}`;
            if (!map.has(key)) {
                const clone = JSON.parse(JSON.stringify(item));
                map.set(key, clone);
            } else {
                const existing = map.get(key)!;
                existing.count += item.count;
                existing.tokens += item.tokens;
                existing.cost += item.cost;
            }
        });
    });

    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}

export function getRecentEntries(limit: number = 50): CostEntry[] {
    const history = loadHistory();
    return history.recent.slice(0, limit);
}

// Alias for compatibility if needed, but UI should switch to getHistorySummary
export function getCostsByModel(): CostBreakdownItem[] {
    return getHistorySummary(1); // Default to today/recent if called without args, or change logic
}


// --- Budget & Sync (Kept mostly same) ---

export function getDailyBudget(): number {
    const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
    return stored ? parseFloat(stored) : -1;
}

export function setDailyBudget(amount: number): void {
    localStorage.setItem(BUDGET_STORAGE_KEY, amount.toString());
    scheduleSync();
}

export async function setUserId(userId: string | null): Promise<void> {
    if (currentUserId === userId) return;
    currentUserId = userId;
    if (userId) {
        try {
            await syncWithCloud();
        } catch (e) {
            console.error('[CostService] Initial sync failed:', e);
        }
    }
}

export function getCurrentUserId(): string | null {
    return currentUserId;
}

export async function forceSync(): Promise<boolean> {
    if (!currentUserId) return false;
    await syncWithCloud();
    return true;
}

function scheduleSync() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncWithCloud();
    }, 2000);
}

async function syncWithCloud() {
    if (!currentUserId || isSyncing || currentUserId.startsWith('dev-user-')) return;
    isSyncing = true;
    try {
        const { data } = await supabase.from('profiles').select('daily_cost_usd, daily_images, daily_tokens, daily_date').eq('id', currentUserId).single();

        let localHistory = loadHistory();
        let todayStats = getTodayCosts(); // From updated logic

        // Simple Sync Logic: If cloud has today's date and higher totals, we assume cloud is source of truth for TOTALS.
        // Detailed syncing is skipped to avoid complexity for now.
        if (data && data.daily_date === getTodayString()) {
            // Logic to merge if needed
        }

        const slots = keyManager.getSlots();
        let totalBudget = 0;
        let totalUsed = 0;
        slots.forEach((s: KeySlot) => {
            if (s.budgetLimit > 0) totalBudget += s.budgetLimit;
            totalUsed += s.totalCost || 0;
        });

        const apiBudgets = slots.map((s: KeySlot) => ({
            id: s.id, name: s.name, budget: s.budgetLimit, used: s.totalCost || 0, status: s.status
        }));

        const { data: { user } } = await supabase.auth.getUser();

        await supabase.from('profiles').upsert({
            id: currentUserId,
            nickname: user?.user_metadata?.full_name || '',
            avatar_url: user?.user_metadata?.avatar_url || '',
            daily_cost_usd: todayStats.totalCostUsd,
            daily_tokens: todayStats.totalTokens,
            daily_reset_date: todayStats.date,
            total_budget: totalBudget || -1,
            total_used: totalUsed,
            user_apis: apiBudgets,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

    } catch (e) {
        console.warn('[CostService] Sync error:', e);
    } finally {
        isSyncing = false;
    }
}
