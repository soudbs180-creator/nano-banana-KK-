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
        return {
            modelId: model.split('|')[0].replace(/^models\//, ''),
            source: source || 'Custom'
        };
    }
    return { modelId: fullModelId.split('|')[0].replace(/^models\//, ''), source: 'Official' }; // Default to Official if no @
}

function getSnapshotNumber(
    source: Record<string, any> | undefined,
    key: string
): number | undefined {
    if (!source) return undefined;
    const direct = source[key];
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
    if (typeof direct === 'string' && direct.trim() !== '') {
        const parsed = Number(direct);
        if (Number.isFinite(parsed)) return parsed;
    }

    const caseInsensitiveKey = Object.keys(source).find((entry) => entry.toLowerCase() === key.toLowerCase());
    if (!caseInsensitiveKey) return undefined;

    const fallback = source[caseInsensitiveKey];
    if (typeof fallback === 'number' && Number.isFinite(fallback)) return fallback;
    if (typeof fallback === 'string' && fallback.trim() !== '') {
        const parsed = Number(fallback);
        if (Number.isFinite(parsed)) return parsed;
    }

    return undefined;
}

function resolveSnapshotGroupRatio(groupRatio: unknown): number {
    if (typeof groupRatio === 'number' && Number.isFinite(groupRatio)) return groupRatio;
    if (groupRatio && typeof groupRatio === 'object' && !Array.isArray(groupRatio)) {
        const map = groupRatio as Record<string, unknown>;
        const direct =
            map.default ??
            map.Default ??
            map.DEFAULT ??
            Object.values(map).find((value) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''));

        if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
        if (typeof direct === 'string' && direct.trim() !== '') {
            const parsed = Number(direct);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return 1;
}

function resolveSizeRatio(sizeRatioMap: Record<string, number> | undefined, size: ImageSize): number {
    if (!sizeRatioMap) return 1;

    const rawSize = typeof size === 'object' && size !== null && 'width' in size && 'height' in size
        ? `${(size as any).width}x${(size as any).height}`
        : String(size || '');

    const normalized = rawSize.toLowerCase();
    const candidates = new Set<string>([
        rawSize,
        normalized,
        rawSize.replace(/x/gi, '*'),
        normalized.replace(/x/gi, '*'),
    ]);

    if (normalized === '1k' || normalized === '1024x1024') {
        candidates.add('1K');
        candidates.add('1024x1024');
        candidates.add('1024*1024');
    } else if (normalized === '2k' || normalized === '2048x2048') {
        candidates.add('2K');
        candidates.add('2048x2048');
        candidates.add('2048*2048');
    } else if (normalized === '4k' || normalized === '4096x4096') {
        candidates.add('4K');
        candidates.add('4096x4096');
        candidates.add('4096*4096');
    }

    for (const candidate of candidates) {
        const ratio = getSnapshotNumber(sizeRatioMap as Record<string, any>, candidate);
        if (ratio !== undefined) return ratio;
    }

    return 1;
}

function getDefaultGroupEntry<T>(map: Record<string, T> | undefined): T | undefined {
    if (!map) return undefined;
    return map.default ?? map.Default ?? map.DEFAULT ?? Object.values(map)[0];
}

function getPreferredGroupKey(
    preferredGroup: string | undefined,
    map: Record<string, any> | undefined
): string | undefined {
    if (!map) return undefined;
    if (preferredGroup) {
        const exact = Object.keys(map).find((key) => key === preferredGroup);
        if (exact) return exact;
        const normalized = preferredGroup.trim().toLowerCase();
        const insensitive = Object.keys(map).find((key) => key.trim().toLowerCase() === normalized);
        if (insensitive) return insensitive;
    }

    return Object.keys(map).find((key) => ['default', 'Default', 'DEFAULT'].includes(key)) || Object.keys(map)[0];
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

    // =============== 鏂扮増 API 鎺ュ彛鑷畾涔夎璐归€昏緫 ===============
    if (keySlotId) {
        const slot = keyManager.getProviders().find(p => p.id === keySlotId);
        if (slot && slot.pricingSnapshot) {
            const snap = slot.pricingSnapshot;
            const preferredGroup = slot.group;
            const mPrice = getSnapshotNumber(snap.modelPrices, modelId) ?? getSnapshotNumber(snap.modelPrices, normalizedId);
            let mRatio = getSnapshotNumber(snap.modelRatios, modelId) ?? getSnapshotNumber(snap.modelRatios, normalizedId);
            const groupRatioKey = getPreferredGroupKey(preferredGroup, snap.groupRatioMap);
            const gRatio =
                (groupRatioKey ? getSnapshotNumber(snap.groupRatioMap, groupRatioKey) : undefined) ??
                resolveSnapshotGroupRatio(snap.groupRatio ?? snap.groupRatioMap);
            const groupModelRatioMap = snap.groupModelRatioMaps?.[modelId] || snap.groupModelRatioMaps?.[normalizedId];
            const groupModelRatioKey = getPreferredGroupKey(preferredGroup, groupModelRatioMap);
            const gmRatio =
                (groupModelRatioKey ? getSnapshotNumber(groupModelRatioMap, groupModelRatioKey) : undefined) ??
                getSnapshotNumber(snap.groupModelRatios, modelId) ??
                getSnapshotNumber(snap.groupModelRatios, normalizedId) ??
                1;

            // 濡傛灉鏄寜娆¤璐?
            if (mPrice !== undefined) {
                cost = mPrice * gRatio * gmRatio * count;
                details = `API按次: $${mPrice}/img | 组=${preferredGroup || groupRatioKey || 'default'} | 分组×${gRatio} | 模型组×${gmRatio}`;
                return { cost, details, tokens: 0 };
            }

            // 鍚﹀垯灏濊瘯鎸?token 娣峰悎璁¤垂
            if (mRatio !== undefined) {
                const textTokens = Math.ceil(promptLen / 4);
                const refTokens = refCount * 560;
                const inputTokens = textTokens + refTokens;

                const outputTokensPerImage = getImageTokenEstimate(normalizedId, size);
                const outputTokens = count * outputTokensPerImage;

                const sRatioObj = snap.sizeRatios?.[modelId] || snap.sizeRatios?.[normalizedId];
                const groupSizeMap = snap.groupSizeRatios?.[modelId] || snap.groupSizeRatios?.[normalizedId];
                const groupSizeKey = getPreferredGroupKey(preferredGroup, groupSizeMap);
                const groupSizeObj =
                    (groupSizeKey ? groupSizeMap?.[groupSizeKey] : undefined) ||
                    getDefaultGroupEntry(groupSizeMap);
                const sRatio = Math.max(resolveSizeRatio(sRatioObj, size), resolveSizeRatio(groupSizeObj, size));

                let cRatio =
                    getSnapshotNumber(snap.completionRatios, modelId) ??
                    getSnapshotNumber(snap.completionRatios, normalizedId) ??
                    1;

                const groupPriceMap = snap.groupModelPrices?.[modelId] || snap.groupModelPrices?.[normalizedId];
                const groupPriceKey = getPreferredGroupKey(preferredGroup, groupPriceMap);
                const groupPriceOverride =
                    (groupPriceKey ? groupPriceMap?.[groupPriceKey] : undefined) ||
                    getDefaultGroupEntry(groupPriceMap);

                const overrideModelPrice = getSnapshotNumber(groupPriceOverride as Record<string, any> | undefined, 'modelPrice');
                const overrideModelRatio = getSnapshotNumber(groupPriceOverride as Record<string, any> | undefined, 'modelRatio');
                const overrideCompletionRatio = getSnapshotNumber(groupPriceOverride as Record<string, any> | undefined, 'completionRatio');

                if (overrideModelPrice !== undefined) {
                    cost = overrideModelPrice * gRatio * count;
                    details = `API按次(分组覆盖): $${overrideModelPrice}/img | 组=${preferredGroup || groupPriceKey || 'default'} | 分组×${gRatio}`;
                    return { cost, details, tokens: 0 };
                }

                if (overrideModelRatio !== undefined) {
                    mRatio = overrideModelRatio;
                }

                if (overrideCompletionRatio !== undefined) {
                    cRatio = overrideCompletionRatio;
                }

                // 璁＄畻鎬诲€嶇巼涓嬬殑鐩稿綋浜庡灏戞爣鍑?token (閫氬父 OneAPI 鐨?model_ratio 琛ㄧず鎸?500000 鐩稿綋浜?$1 鐨勮浠峰熀鍑嗕箻鏁?
                // 鍏蜂綋璁′环甯告暟鍥犵珯鑰屽紓锛屽鏋滄病鏈夊畾涔夛紝绯荤粺鐩墠浣跨敤鍏滃簳浠锋牸锛?.002 / 1000 => 2 / 1000000
                const baseRate = 2.0 / 1000000; // $0.002 per 1k ratio

                const inputCost = inputTokens * baseRate * mRatio * gRatio * gmRatio;
                const outputCost = outputTokens * baseRate * mRatio * cRatio * sRatio * gRatio * gmRatio;

                cost = Math.max(0.000001, inputCost + outputCost);
                tokens = inputTokens + outputTokens;
                details = `API按量: ${tokens} Toks | 组=${preferredGroup || groupRatioKey || 'default'} | 模型×${mRatio} | 补全×${cRatio} | 尺寸×${sRatio} | 分组×${gRatio} | 模型组×${gmRatio}`;
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
        const estimatedDetails = details;
        if (usage.totalTokens !== undefined) {
            tokens = usage.totalTokens;
            details = `Actual: ${tokens} Toks`;
        }
        if (usage.cost !== undefined) {
            cost = usage.cost;
            details += ` | Cost: $${cost.toFixed(6)}`;
            if (estimatedDetails) {
                details += ` | Est: ${estimatedDetails}`;
            }
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
            // 缁熻鏁版嵁瑙ｆ瀽澶辫触锛岃繑鍥為粯璁ゅ€?
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


