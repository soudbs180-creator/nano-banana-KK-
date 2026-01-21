/**
 * Cost Estimation Service
 * Tracks daily API usage costs based on updated pricing models.
 * 
 * Pricing Reference (Updated 2026-01-21):
 * - Imagen 4 Fast: $0.02/img, Ultra: $0.06/img
 * - Gemini 3 Pro Image: Input $0.0011/img (560 tokens), Output $120/1M tokens
 *   - 1K-2K output: 1120 tokens = $0.134/img
 *   - 4K output: 2000 tokens = $0.24/img
 * - Gemini 2.5 Flash Image: Input $0.075/1M, Output $30/1M tokens
 *   - 1024x1024: 1290 tokens = $0.039/img
 */

import { ModelType, ImageSize } from '../types';
import type { KeySlot } from './keyManager';
import { supabase } from '../lib/supabase';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { notify } from './notificationService';

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
const BUDGET_STORAGE_KEY = 'kk_studio_daily_budget';

let currentUserId: string | null = null;
let isSyncing = false;
let syncTimer: any = null;

const PRICING = {
    IMAGEN: {
        FAST: 0.02,
        STD: 0.04,
        ULTRA: 0.06
    },
    // Gemini 3 Pro Image: $120/1M output tokens
    // - 1K-2K: 1120 tokens = $0.134/img
    // - 4K: 2000 tokens = $0.24/img
    // - Ref image input: 560 tokens = $0.0011/img
    GEMINI_3_PRO: {
        INPUT_1M: 3.50,
        OUTPUT_1M: 120.00,  // Updated: was 10.50
        REF_IMG_TOKENS: 560, // Updated: was 258
        GEN_TOKENS_STD: 1120,
        GEN_TOKENS_HD: 2000
    },
    // Gemini 2.5 Flash Image: $30/1M output tokens
    // - 1024x1024: 1290 tokens = $0.039/img
    GEMINI_2_5: {
        INPUT_1M: 0.075,
        OUTPUT_1M: 30.00,    // Updated: was 0.30
        REF_IMG_TOKENS: 560, // Updated: was 258
        GEN_TOKENS_STD: 1290 // Updated: was 258
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
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5), // Add random suffix to prevent exact timestamp collision on diff devices
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

    // Trigger Safe Sync (Debounced)
    scheduleSync();
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

export function getDailyBudget(): number {
    const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
    return stored ? parseFloat(stored) : -1;
}

export function setDailyBudget(amount: number): void {
    localStorage.setItem(BUDGET_STORAGE_KEY, amount.toString());
    scheduleSync();
}

/**
 * Sync Management
 */
export async function setUserId(userId: string | null): Promise<void> {
    console.log('[CostService] setUserId called with:', userId, 'Current:', currentUserId);
    if (currentUserId === userId) {
        console.log('[CostService] userId unchanged, skipping');
        return;
    }
    currentUserId = userId;
    if (userId) {
        console.log('[CostService] Setting user and syncing:', userId);
        try {
            await syncWithCloud();
            console.log('[CostService] Initial sync completed for user:', userId);
        } catch (e) {
            console.error('[CostService] Initial sync failed:', e);
        }
    }
}

export function getCurrentUserId(): string | null {
    return currentUserId;
}

export async function forceSync(): Promise<boolean> {
    console.log('[CostService] forceSync called, currentUserId:', currentUserId);
    if (!currentUserId) {
        console.warn('[CostService] forceSync: No user ID set, cannot sync');
        return false;
    }
    console.log('[CostService] Force sync requested for user:', currentUserId);
    await syncWithCloud();
    return true;
}

function scheduleSync() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncWithCloud();
    }, 2000); // 2s debounce
}

async function syncWithCloud() {
    if (!currentUserId || isSyncing) return;
    isSyncing = true;
    try {
        // 1. Fetch Cloud State
        const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', currentUserId).single();

        // 2. Load & Merge Local State
        let local = loadDailyCosts();

        if (data) {
            // A. Sync Daily Stats
            if (data.daily_date === getTodayString()) {
                // Merge Logic: Take max values for counters to avoid decrementing
                const newCost = Math.max(local.totalCostUsd, data.daily_cost || 0);
                const newImages = Math.max(local.totalImages, data.daily_images || 0);
                const newTokens = Math.max(local.totalTokens, data.daily_tokens || 0);

                if (newCost !== local.totalCostUsd || newImages !== local.totalImages) {
                    local.totalCostUsd = newCost;
                    local.totalImages = newImages;
                    local.totalTokens = newTokens;
                    saveDailyCosts(local);
                }
            }

            // B. Sync API Budgets to KeyManager
            if (data.api_budgets && Array.isArray(data.api_budgets)) {
                const { keyManager } = await import('./keyManager');
                const slots = keyManager.getSlots();
                let changed = false;

                data.api_budgets.forEach((cb: any) => {
                    const slot = slots.find(s => s.id === cb.id);
                    if (slot) {
                        // Sync Budget Limit
                        if (cb.budget !== undefined && slot.budgetLimit !== cb.budget) {
                            slot.budgetLimit = cb.budget;
                            changed = true;
                        }
                        // Sync Total Cost/Usage (if cloud has more usage)
                        if (cb.used !== undefined && (slot.totalCost || 0) < cb.used) {
                            slot.totalCost = cb.used;
                            changed = true;
                        }
                    }
                });

                if (changed) {
                    // Update keyManager state with budgets from cloud
                    keyManager.updateBudgetsFromCloud(data.api_budgets);
                }
            }
        }

        // 3. Prepare Push

        // Get latest keyManager state again (in case we just updated it)
        const { keyManager } = await import('./keyManager');
        const slots = keyManager.getSlots();
        let totalBudget = 0;
        let totalUsed = 0;
        const apiBudgets = slots.map((slot: KeySlot) => ({
            id: slot.id,
            name: slot.name,
            budget: slot.budgetLimit,
            used: slot.totalCost || 0,
            status: slot.status
        }));

        slots.forEach((slot: KeySlot) => {
            if (slot.budgetLimit > 0) {
                totalBudget += slot.budgetLimit;
            }
            totalUsed += slot.totalCost || 0;
        });

        // Simplified sync: only push daily summary
        console.log('[CostService] Syncing daily summary to cloud...');

        // Get user profile from Auth to sync to settings table for easy viewing
        const { data: { user } } = await supabase.auth.getUser();
        const profile = {
            display_name: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
            avatar_url: user?.user_metadata?.avatar_url || ''
        };

        const { error: upsertError } = await supabase.from('user_settings').upsert({
            user_id: currentUserId,
            // Profile
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            // Daily summary
            daily_cost: local.totalCostUsd,
            daily_images: local.totalImages,
            daily_tokens: local.totalTokens,
            daily_date: local.date,
            // Total budget from all API keys
            total_budget: totalBudget > 0 ? totalBudget : -1,
            total_used: totalUsed,
            // API budgets detail
            api_budgets: apiBudgets,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        if (upsertError) throw upsertError;
        console.log('[CostService] Sync complete');

    } catch (e: any) {
        console.warn('[CostService] Sync failed', e);
        if (e.code === '42P01') {
            notify.error('配置缺失', '请在 Supabase 创建 user_settings 表');
        }
    } finally {
        isSyncing = false;
    }
}

