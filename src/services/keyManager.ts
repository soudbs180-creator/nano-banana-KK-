/**
 * API Key Manager Service
 * 
 * Provides multi-key rotation, status monitoring, and automatic failover.
 * Similar to Gemini Balance but runs entirely on frontend.
 * NOW SUPPORTS: Supabase Cloud Sync & Third-Party API Proxies
 */
import { supabase } from '../lib/supabase';
import { AuthMethod, GOOGLE_API_BASE } from './apiConfig';
import { ProxyModelConfig } from './proxyModelConfig';

export interface KeySlot {
    id: string;
    key: string;
    name: string; // User defined name
    provider: string; // e.g. 'Gemini', 'OpenAI'
    // Proxy configuration
    baseUrl?: string;        // Custom base URL for proxy (empty = Google official)
    authMethod?: AuthMethod; // 'query' (Google) or 'header' (proxies)
    headerName?: string;     // Custom header name (default: x-goog-api-key)
    // Status fields
    status: 'valid' | 'invalid' | 'rate_limited' | 'unknown';
    failCount: number;
    successCount: number;
    lastUsed: number | null;
    lastError: string | null;
    disabled: boolean;
    createdAt: number;
    usedTokens?: number; // Total tokens consumed
    totalCost: number; // Total cost in USD
    budgetLimit: number; // Budget limit in USD (-1 for unlimited)
    quota?: {
        limitRequests: number;
        remainingRequests: number;
        resetConstant?: string; // e.g. "1m"
        resetTime: number; // timestamp when it resets
        updatedAt: number;
    };
    // New Strategy Fields
    strategy: 'load_balance' | 'sequential'; // Default: sequential
    priority: number; // For manual ordering (lower = higher priority)
    // Proxy-specific: Configured models for this API key
    proxyModels?: ProxyModelConfig[];
}

interface KeyManagerState {
    slots: KeySlot[];
    currentIndex: number;
    maxFailures: number;
    activeStrategy: 'concurrent' | 'sequential'; // Global strategy preference
}

const STORAGE_KEY = 'kk_studio_key_manager';
const DEFAULT_MAX_FAILURES = 3;
// Simple pricing estimation (avg between input/output for simplicity, or 0.15/1M)
const COST_PER_TOKEN = 0.00000015;

export class KeyManager {
    private state: KeyManagerState;
    private listeners: Set<() => void> = new Set();
    private userId: string | null = null;
    private isSyncing = false;

    constructor() {
        this.state = this.loadState();
    }

    /**
     * Add token usage to a key and update cost
     * 预算耗尽时自动将 key 移到队列末尾
     */
    addUsage(keyId: string, tokens: number): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.usedTokens = (slot.usedTokens || 0) + tokens;


            // Check budget - 预算耗尽时自动轮换
            if (slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit) {
                console.log(`[KeyManager] API ${slot.name} 预算已耗尽 ($${slot.totalCost.toFixed(2)}/$${slot.budgetLimit})`);
                if (slot.strategy === 'sequential') {
                    this.rotateToBottom(keyId);
                }
            }

            this.saveState();
            this.notifyListeners();
        }
    }



    /**
     * Load state from localStorage
     */
    private loadState(): KeyManagerState {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Migration for existing keys (add new proxy fields with defaults)
                const slots = (parsed.slots || []).map((s: any) => ({
                    ...s,
                    name: s.name || 'Unnamed Key',
                    provider: s.provider || 'Gemini',
                    totalCost: s.totalCost || 0,
                    budgetLimit: s.budgetLimit !== undefined ? s.budgetLimit : -1,
                    // Proxy config defaults
                    baseUrl: s.baseUrl || '',
                    authMethod: s.authMethod || 'query',

                    headerName: s.headerName || 'x-goog-api-key',
                    // Default strategy
                    strategy: s.strategy || 'sequential',
                    priority: s.priority || 0
                }));
                return {
                    slots: slots,
                    currentIndex: parsed.currentIndex || 0,
                    maxFailures: parsed.maxFailures || DEFAULT_MAX_FAILURES,
                    activeStrategy: parsed.activeStrategy || 'concurrent'
                };
            }
        } catch (e) {
            console.warn('[KeyManager] Failed to load state:', e);
        }

        // Try to migrate from old storage format
        return this.migrateFromOldFormat();
    }

    /**
     * Migrate from old kk-api-keys-local format
     */
    private migrateFromOldFormat(): KeyManagerState {
        try {
            const oldKeys = localStorage.getItem('kk-api-keys-local');
            if (oldKeys) {
                const keys = JSON.parse(oldKeys) as string[];
                const slots: KeySlot[] = keys
                    .filter(k => k && k.trim())
                    .map((key, i) => ({
                        id: `key_${Date.now()}_${i}`,
                        key: key.trim(),
                        name: `Migrated Key ${i + 1}`,
                        provider: 'Gemini',
                        status: 'unknown' as const,
                        failCount: 0,
                        successCount: 0,
                        lastUsed: null,
                        lastError: null,
                        disabled: false,
                        createdAt: Date.now(),
                        totalCost: 0,

                        budgetLimit: -1,
                        strategy: 'sequential',
                        priority: 0
                    }));

                if (slots.length > 0) {
                    console.log(`[KeyManager] Migrated ${slots.length} keys from old format`);
                    const state: KeyManagerState = {
                        slots,
                        currentIndex: 0,
                        maxFailures: DEFAULT_MAX_FAILURES,
                        activeStrategy: 'concurrent'
                    };
                    this.saveState(state);
                    return state;
                }
            }
        } catch (e) {
            console.warn('[KeyManager] Migration failed:', e);
        }

        return {
            slots: [],
            currentIndex: 0,
            maxFailures: DEFAULT_MAX_FAILURES,
            activeStrategy: 'concurrent'
        };
    }

    /**
     * Save state to localStorage
     */
    private saveState(state?: KeyManagerState): void {
        const toSave = state || this.state;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));

            // Sync to cloud if user is logged in
            if (this.userId && !this.isSyncing) {
                this.saveToCloud(toSave);
            }
        } catch (e) {
            console.error('[KeyManager] Failed to save state:', e);
        }
    }

    /**
     * Set user ID and sync with cloud
     */
    async setUserId(userId: string | null) {
        if (this.userId === userId) return;

        const previousUserId = this.userId;
        const localKeys = [...this.state.slots]; // Save local keys before potential clear

        // Only clear keys if switching between different logged-in users
        // (not when logging in from anonymous or logging out)
        if (previousUserId && userId && previousUserId !== userId) {
            // Switching users - clear for security
            this.clearAll();
        }

        this.userId = userId;
        if (userId) {
            // Pass local keys to merge with cloud
            await this.loadFromCloud(localKeys);
        } else {
            // Logging out - keep local keys as-is
        }
    }

    /**
     * Load state from Supabase and merge with local keys
     */
    private async loadFromCloud(localKeys: KeySlot[] = []) {
        if (!this.userId) return;

        try {
            this.isSyncing = true;
            const { data, error } = await supabase
                .from('user_settings')
                .select('api_keys')
                .eq('user_id', this.userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
                console.warn('[KeyManager] Failed to fetch cloud settings:', error);
                // Keep local keys if cloud fetch fails
                if (localKeys.length > 0 && this.state.slots.length === 0) {
                    this.state.slots = localKeys;
                    this.saveState();
                }
                return;
            }

            if (data && data.api_keys) {
                // Parse cloud slots and ensure new fields exist
                let cloudSlots = data.api_keys as KeySlot[];
                if (Array.isArray(cloudSlots)) {
                    // Backfill new fields if missing from cloud
                    cloudSlots = cloudSlots.map(s => ({
                        ...s,
                        name: s.name || 'Cloud Key',
                        provider: s.provider || 'Gemini',
                        totalCost: s.totalCost || 0,

                        budgetLimit: s.budgetLimit !== undefined ? s.budgetLimit : -1,
                        strategy: s.strategy || 'sequential',
                        priority: s.priority || 0
                    }));

                    // Merge: cloud keys take priority, add unique local keys
                    const cloudKeySet = new Set(cloudSlots.map(s => s.key));
                    const uniqueLocalKeys = localKeys.filter(local => !cloudKeySet.has(local.key));

                    this.state.slots = [...cloudSlots, ...uniqueLocalKeys];

                    if (uniqueLocalKeys.length > 0) {
                        console.log(`[KeyManager] Merged ${uniqueLocalKeys.length} local keys with ${cloudSlots.length} cloud keys`);
                        // Save merged result to cloud
                        await this.saveToCloud(this.state);
                    }

                    this.saveState(); // Update local storage
                    this.notifyListeners();
                }
            } else {
                // No cloud data, use local keys if available
                if (localKeys.length > 0) {
                    this.state.slots = localKeys;
                    this.saveState();
                    // Save local keys to cloud for this user
                    await this.saveToCloud(this.state);
                    console.log(`[KeyManager] Uploaded ${localKeys.length} local keys to cloud`);
                }
            }
        } catch (e) {
            console.error('[KeyManager] Error loading from cloud:', e);
            // Keep local keys on error
            if (localKeys.length > 0 && this.state.slots.length === 0) {
                this.state.slots = localKeys;
                this.saveState();
            }
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Update budgets and usage from Cloud (called by CostService)
     */
    updateBudgetsFromCloud(budgets: { id: string, budget: number, used?: number }[]): void {
        const slots = this.state.slots;
        let changed = false;

        budgets.forEach(b => {
            const slot = slots.find(s => s.id === b.id);
            if (slot) {
                if (b.budget !== undefined && slot.budgetLimit !== b.budget) {
                    slot.budgetLimit = b.budget;
                    changed = true;
                }
                if (b.used !== undefined && (slot.totalCost || 0) < b.used) {
                    slot.totalCost = b.used;
                    changed = true;
                }
            }
        });

        if (changed) {
            this.saveState();
            this.notifyListeners();
        }
    }


    /**
     * Save state to Supabase
     */
    private async saveToCloud(state: KeyManagerState) {
        if (!this.userId) return;

        try {
            // Sync full API keys to 'api_keys' column (associated with account)
            await supabase
                .from('user_settings')
                .upsert({
                    user_id: this.userId,
                    api_keys: state.slots,
                    updated_at: new Date().toISOString()
                });

            // Also trigger CostService sync to update profile/stats
            const { forceSync } = await import('./costService');
            forceSync().catch(console.error);

        } catch (e) {
            console.error('[KeyManager] Error saving to cloud:', e);
        }
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(): void {
        this.listeners.forEach(fn => fn());
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Set Global Strategy Mode
     */
    setStrategyMode(mode: 'concurrent' | 'sequential') {
        this.state.activeStrategy = mode;
        this.saveState();
        this.notifyListeners();
    }

    getStrategyMode() {
        return this.state.activeStrategy;
    }

    /**
     * Auto Sort Sequential Keys
     * Rules: Active > Budget Desc (Unlimited Top) > Google > Others
     */
    autoSortSequentialKeys() {
        const sequentialSlots = this.state.slots.filter(s => (s.strategy || 'sequential') === 'sequential');

        // Sorting Logic
        sequentialSlots.sort((a, b) => {
            // 1. Status: Active First (Disabled at bottom)
            if (!a.disabled && b.disabled) return -1;
            if (a.disabled && !b.disabled) return 1;

            // 1.5 Sub-Status: Valid (Green) First
            // Prioritize explicitly 'valid' keys over 'unknown'/'rate_limited'/'invalid'
            const aValid = a.status === 'valid';
            const bValid = b.status === 'valid';
            if (aValid && !bValid) return -1;
            if (!aValid && bValid) return 1;

            // Prefer Unknown over Invalid/RateLimited
            const aBad = a.status === 'invalid' || a.status === 'rate_limited';
            const bBad = b.status === 'invalid' || b.status === 'rate_limited';
            if (!aBad && bBad) return -1;
            if (aBad && !bBad) return 1;

            // 2. Budget: Unlimited (-1) First, then Higher Limits
            const aUnlimited = a.budgetLimit < 0;
            const bUnlimited = b.budgetLimit < 0;
            if (aUnlimited && !bUnlimited) return -1;
            if (!aUnlimited && bUnlimited) return 1;

            // Both limited: Higher limit first
            if (!aUnlimited && !bUnlimited) {
                if (a.budgetLimit !== b.budgetLimit) return b.budgetLimit - a.budgetLimit;
            }

            // 3. Provider: Google First (REMOVED as per user request to treat them equally)
            // const aIsGoogle = !a.baseUrl || a.baseUrl.includes('googleapis.com');
            // const bIsGoogle = !b.baseUrl || b.baseUrl.includes('googleapis.com');
            // if (aIsGoogle && !bIsGoogle) return -1;
            // if (!aIsGoogle && bIsGoogle) return 1;

            // 4. Stable sort (preserve index if available, or name)
            return 0;
        });

        // Re-assign priorities
        sequentialSlots.forEach((slot, index) => {
            slot.priority = index;
        });

        this.saveState();
        this.notifyListeners();
    }

    /**
     * Get the next available API key using a hierarchical strategy:
     * Respects KeyManager.state.activeStrategy as the primary selector.
     * 
     * @param providerMode - Optional filter: 'google' (Official Only), 'proxy' (Third-Party Only), or 'all' (default)
     */
    getNextKey(providerMode: 'google' | 'proxy' | 'all' = 'all'): {
        id: string;
        key: string;
        baseUrl: string;
        authMethod: AuthMethod;
        headerName: string;
    } | null {
        // Filter healthy slots: not disabled, not manually marked invalid, and within budget
        const isHealthy = (s: KeySlot) => !s.disabled && s.status !== 'invalid' && (s.budgetLimit < 0 || s.totalCost < s.budgetLimit);

        // Filter by provider mode if specified
        const matchesProvider = (s: KeySlot) => {
            const isGoogle = !s.baseUrl || s.baseUrl.includes('googleapis.com');
            if (providerMode === 'google') return isGoogle;
            if (providerMode === 'proxy') return !isGoogle;
            return true;
        };

        const allAvailable = this.state.slots.filter(s => isHealthy(s) && matchesProvider(s));
        if (allAvailable.length === 0) return null;

        // --- Determine Target Pool based on Active Strategy ---
        const preferredStrategy = this.state.activeStrategy;

        let targetPool = allAvailable.filter(s => {
            const strategy = s.strategy || 'sequential';
            return strategy === (preferredStrategy === 'concurrent' ? 'load_balance' : 'sequential');
        });

        // Fallback: If preferred pool is empty, try the other one
        if (targetPool.length === 0) {
            targetPool = allAvailable.filter(s => {
                const strategy = s.strategy || 'sequential';
                return strategy !== (preferredStrategy === 'concurrent' ? 'load_balance' : 'sequential');
            });
        }

        if (targetPool.length === 0) return null;

        // --- Selection Logic ---

        // Case A: Concurrent (Load Balance)
        if (targetPool.some(s => s.strategy === 'load_balance')) {
            // 排序优先级：
            // 1. 无限预算优先 (budgetLimit < 0)
            // 2. 剩余预算多的优先
            // 3. Round Robin (Least Recently Used) for equal tiers

            const sortedSlots = targetPool.sort((a, b) => {
                // 1. 无限预算优先
                if (a.budgetLimit < 0 && b.budgetLimit >= 0) return -1;
                if (b.budgetLimit < 0 && a.budgetLimit >= 0) return 1;

                // 2. If both unlimited (or both limited), Prefer "Least Recently Used" to balance load
                // (Simulates Round Robin)
                // Use random for now as lastUsed updates are async/not guaranteed on selection immediately
                return 0;
            });

            // Re-sort for weighted random among best candidates
            // Picking from the top tier (e.g. all unlimited ones)
            const bestCandidates = sortedSlots.filter(s => {
                if (sortedSlots[0].budgetLimit < 0) return s.budgetLimit < 0; // All unlimited
                return true; // Or just take top few
            });

            // Pick random from best candidates to distribute load
            const winner = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];

            return this.prepareKeyResult(winner);
        }

        // Case B: Sequential
        // Simply Sort by priority
        const sequentialSlots = targetPool.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        return this.prepareKeyResult(sequentialSlots[0]);
    }

    /**
     * Helper to format the key result and update metadata
     */
    private prepareKeyResult(slot: KeySlot) {
        // Update last used timestamp
        const actualSlot = this.state.slots.find(s => s.id === slot.id);
        if (actualSlot) {
            actualSlot.lastUsed = Date.now();
            this.saveState();
        }

        return {
            id: slot.id,
            key: slot.key,
            baseUrl: slot.baseUrl || GOOGLE_API_BASE,
            authMethod: slot.authMethod || 'query',
            headerName: slot.headerName || 'x-goog-api-key'
        };
    }

    /**
     * Report successful API call
     */
    reportSuccess(keyId: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.status = 'valid';
            slot.successCount++;
            slot.failCount = 0; // Reset fail count on success
            slot.lastError = null;
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Report failed API call - 失败后将该 key 移到顺序队列末尾
     */
    reportFailure(keyId: string, error: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.failCount++;
            slot.lastError = error;
            slot.lastUsed = Date.now();

            // 判断错误类型
            if (error.includes('429') || error.includes('rate limit')) {
                slot.status = 'rate_limited';
            } else if (error.includes('401') || error.includes('403') || error.includes('invalid')) {
                slot.status = 'invalid';
            }

            // 将失败的 key 移到顺序队列末尾
            if (slot.strategy === 'sequential') {
                this.rotateToBottom(keyId);
            }

            // 多路并发模式：10-30秒快速重试
            // 顺序模式：5分钟后重试
            if (slot.failCount >= this.state.maxFailures || slot.status === 'rate_limited') {
                const retryDelay = slot.strategy === 'load_balance'
                    ? (10 + Math.random() * 20) * 1000  // 多路并发: 10-30秒随机重试
                    : 5 * 60 * 1000;  // 顺序: 5分钟

                console.warn(`[KeyManager] API ${slot.name} 连续失败 ${slot.failCount} 次，${Math.round(retryDelay / 1000)}秒后重试`);

                setTimeout(() => {
                    const s = this.state.slots.find(ss => ss.id === keyId);
                    if (s && (s.status === 'invalid' || s.status === 'rate_limited')) {
                        s.failCount = 0;
                        s.status = 'unknown';
                        console.log(`[KeyManager] API ${s.name} 自动重试中...`);
                        this.saveState();
                        this.notifyListeners();
                    }
                }, retryDelay);
            }

            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * 将指定 key 移到顺序队列末尾（预算耗尽或失败时调用）
     */
    rotateToBottom(keyId: string): void {
        const sequentialSlots = this.state.slots
            .filter(s => (s.strategy || 'sequential') === 'sequential')
            .sort((a, b) => (a.priority || 0) - (b.priority || 0));

        if (sequentialSlots.length <= 1) return;

        const targetSlot = sequentialSlots.find(s => s.id === keyId);
        if (!targetSlot) return;

        // 获取当前最大优先级
        const maxPriority = Math.max(...sequentialSlots.map(s => s.priority || 0));

        // 将目标 key 移到末尾
        targetSlot.priority = maxPriority + 1;

        // 重新排序并重置优先级（0, 1, 2, 3...）
        const reordered = this.state.slots
            .filter(s => (s.strategy || 'sequential') === 'sequential')
            .sort((a, b) => (a.priority || 0) - (b.priority || 0));

        reordered.forEach((s, i) => {
            s.priority = i;
        });

        console.log(`[KeyManager] API ${targetSlot.name} 已移至顺序队列末尾`);
        this.saveState();
        this.notifyListeners();
    }

    /**
     * 检查预算是否耗尽，耗尽则自动轮换
     */
    checkBudgetAndRotate(keyId: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot && slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit) {
            console.log(`[KeyManager] API ${slot.name} 预算已耗尽，移至末尾`);
            if (slot.strategy === 'sequential') {
                this.rotateToBottom(keyId);
            }
        }
    }

    /**
     * Toggle disabled state for manual pause/resume
     * 暂停的 key 会移到顺序队列末尾
     */
    toggleKey(keyId: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.disabled = !slot.disabled;

            if (slot.disabled) {
                // 暂停时移到队列末尾
                if (slot.strategy === 'sequential') {
                    this.rotateToBottom(keyId);
                }
                console.log(`[KeyManager] API ${slot.name} 已暂停并移至末尾`);
            } else {
                // 恢复时重置失败计数
                slot.failCount = 0;
                slot.status = 'unknown';
                // 手动开启时，自动提升到顶部
                if (slot.strategy === 'sequential') {
                    this.rotateToTop(keyId);
                }
                console.log(`[KeyManager] API ${slot.name} 已恢复`);
            }

            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * 将指定 key 移到顺序队列顶部（手动启用时调用）
     */
    rotateToTop(keyId: string): void {
        const sequentialSlots = this.state.slots
            .filter(s => (s.strategy || 'sequential') === 'sequential')
            .sort((a, b) => (a.priority || 0) - (b.priority || 0));

        if (sequentialSlots.length <= 1) return;

        const targetSlot = sequentialSlots.find(s => s.id === keyId);
        if (!targetSlot) return;

        // Shuffle everyone down by 1
        sequentialSlots.forEach(s => {
            if (s.id !== keyId) {
                s.priority = (s.priority || 0) + 1;
            }
        });

        // Set target to 0
        targetSlot.priority = 0;

        // Re-normalize to Ensure clean 0, 1, 2... order
        const reordered = this.state.slots
            .filter(s => (s.strategy || 'sequential') === 'sequential')
            .sort((a, b) => (a.priority || 0) - (b.priority || 0));

        reordered.forEach((s, i) => {
            s.priority = i;
        });

        this.saveState();
    }


    /**
     * Update quota information for a key
     */
    updateQuota(keyId: string, quota: KeySlot['quota']): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot && quota) {
            slot.quota = quota;
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Add exact cost usage to a key (syncs with CostService)
     */
    addCost(keyId: string, cost: number): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.totalCost = (slot.totalCost || 0) + cost;
            this.saveState();
            this.notifyListeners();
            this.checkBudgetAndRotate(keyId);
        }
    }



    /**
     * Add a new API key
     */
    async addKey(key: string, options?: {
        name?: string;
        provider?: string;
        budgetLimit?: number;
        // Proxy configuration
        baseUrl?: string;
        authMethod?: AuthMethod;

        headerName?: string;
        // Strategy
        strategy?: 'load_balance' | 'sequential';
        priority?: number;
        totalCost?: number;
    }): Promise<{ success: boolean; error?: string }> {
        const trimmedKey = key.trim();

        if (!trimmedKey) {
            return { success: false, error: '请输入 API Key' };
        }

        // Check for duplicates
        if (this.state.slots.some(s => s.key === trimmedKey)) {
            return { success: false, error: '该 Key 已存在' };
        }

        // Validate the key (skip validation for proxies as they may have different endpoints)
        const isProxy = options?.baseUrl && !options.baseUrl.includes('googleapis.com');
        const validation = isProxy
            ? { valid: true }
            : await this.validateKey(trimmedKey, options?.provider);

        const newSlot: KeySlot = {
            id: `key_${Date.now()}`,
            key: trimmedKey,
            name: options?.name || 'My Key',
            provider: options?.provider || 'Gemini',
            // Proxy configuration
            baseUrl: options?.baseUrl || '',
            authMethod: options?.authMethod || (isProxy ? 'header' : 'query'),
            headerName: options?.headerName || 'x-goog-api-key',
            // Status
            status: validation.valid ? 'valid' : 'invalid',
            failCount: 0,
            successCount: 0,
            lastUsed: null,
            lastError: validation.error || null,
            disabled: !validation.valid,
            createdAt: Date.now(),
            totalCost: options?.totalCost || 0,
            budgetLimit: options?.budgetLimit ?? -1,
            strategy: options?.strategy || 'sequential',
            priority: options?.priority ?? -1 // Default to -1 (top) then normalize
        };

        this.state.slots.push(newSlot);

        // Normalize priority if sequential
        if (newSlot.strategy === 'sequential') {
            this.rotateToTop(newSlot.id);
        }

        this.saveState();
        this.notifyListeners();

        return {
            success: true,
            error: validation.valid ? undefined : `Key 添加成功但验证失败: ${validation.error}`
        };
    }

    /**
     * Remove an API key
     */
    removeKey(keyId: string): void {
        this.state.slots = this.state.slots.filter(s => s.id !== keyId);
        this.saveState();
        this.notifyListeners();
    }

    /**
     * Update an existing API key
     */
    updateKey(id: string, updates: {
        name?: string,
        budgetLimit?: number,
        baseUrl?: string,
        authMethod?: AuthMethod,

        headerName?: string,
        strategy?: 'load_balance' | 'sequential',
        priority?: number,
        totalCost?: number
    }): void {
        const slot = this.state.slots.find(s => s.id === id);
        if (slot) {
            if (updates.name !== undefined) slot.name = updates.name;
            if (updates.budgetLimit !== undefined) slot.budgetLimit = updates.budgetLimit;
            if (updates.totalCost !== undefined) slot.totalCost = updates.totalCost;
            if (updates.baseUrl !== undefined) slot.baseUrl = updates.baseUrl;
            if (updates.authMethod !== undefined) slot.authMethod = updates.authMethod;

            if (updates.headerName !== undefined) slot.headerName = updates.headerName;
            if (updates.strategy !== undefined) slot.strategy = updates.strategy;
            if (updates.priority !== undefined) slot.priority = updates.priority;

            this.saveState();
            this.notifyListeners();
        }
    }



    /**
     * Validate an API key by making a test request
     */
    async validateKey(key: string, provider: string = 'Gemini'): Promise<{ valid: boolean; error?: string }> {
        if (provider !== 'Gemini') {
            return { valid: true }; // Skip validation for other providers for now
        }

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
                { method: 'GET' }
            );

            // Capture Quota Headers
            const limitRequests = response.headers.get('x-ratelimit-limit-requests');
            const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
            const resetRequests = response.headers.get('x-ratelimit-reset-requests');

            // Find keyId if it exists (for existing keys being re-validated)
            const existingSlot = this.state.slots.find(s => s.key === key);
            if (existingSlot && (limitRequests || remainingRequests)) {
                const resetSeconds = resetRequests ? (parseInt(resetRequests) || 0) : 0;
                this.updateQuota(existingSlot.id, {
                    limitRequests: parseInt(limitRequests || '0'),
                    remainingRequests: parseInt(remainingRequests || '0'),
                    resetConstant: resetRequests || '',
                    resetTime: Date.now() + (resetSeconds * 1000),
                    updatedAt: Date.now()
                });
            }

            if (response.ok) {
                return { valid: true };
            } else if (response.status === 429) {
                return { valid: true, error: '有效但已限流' };
            } else if (response.status === 401 || response.status === 403) {
                return { valid: false, error: 'API Key 无效' };
            } else {
                return { valid: false, error: `HTTP ${response.status}` };
            }
        } catch (e: any) {
            return { valid: false, error: e.message || '网络错误' };
        }
    }



    /**
     * Refresh a single key
     */
    async refreshKey(id: string): Promise<void> {
        const slot = this.state.slots.find(s => s.id === id);
        if (slot) {
            const result = await this.validateKey(slot.key, slot.provider);
            slot.status = result.valid ? 'valid' : 'invalid';
            slot.lastError = result.error || null;
            if (result.valid) {
                slot.disabled = false;
                slot.failCount = 0;
            }
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Re-validate all keys
     */
    async revalidateAll(): Promise<void> {
        for (const slot of this.state.slots) {
            const result = await this.validateKey(slot.key, slot.provider);
            slot.status = result.valid ? 'valid' : 'invalid';
            slot.lastError = result.error || null;
            if (result.valid) {
                slot.disabled = false;
                slot.failCount = 0;
            }
        }
        this.saveState();
        this.notifyListeners();
    }

    /**
     * Get all key slots
     */
    getSlots(): KeySlot[] {
        return [...this.state.slots];
    }

    /**
     * Get statistics
     */
    getStats(): {
        total: number;
        valid: number;
        invalid: number;
        disabled: number;
        rateLimited: number;
    } {
        const slots = this.state.slots;
        return {
            total: slots.length,
            valid: slots.filter(s => s.status === 'valid' && !s.disabled).length,
            invalid: slots.filter(s => s.status === 'invalid').length,
            disabled: slots.filter(s => s.disabled).length,
            rateLimited: slots.filter(s => s.status === 'rate_limited').length
        };
    }

    /**
     * Check if any valid keys are available
     */
    hasValidKeys(): boolean {
        return this.state.slots.some(s => !s.disabled && s.status !== 'invalid');
    }

    /**
     * Set max failures threshold
     */
    setMaxFailures(count: number): void {
        this.state.maxFailures = Math.max(1, count);
        this.saveState();
    }

    /**
     * Clear all keys
     */
    clearAll(): void {
        this.state.slots = [];
        this.state.currentIndex = 0;
        this.saveState();
        this.notifyListeners();
    }

    // ============================================
    // Proxy Model Configuration Methods
    // ============================================

    /**
     * Update proxy models for a specific API key
     */
    updateProxyModels(keyId: string, models: ProxyModelConfig[]): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.proxyModels = models;
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Add a single proxy model to an API key
     */
    addProxyModel(keyId: string, model: ProxyModelConfig): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            if (!slot.proxyModels) {
                slot.proxyModels = [];
            }
            // Check for duplicate
            if (!slot.proxyModels.some(m => m.id === model.id)) {
                slot.proxyModels.push(model);
                this.saveState();
                this.notifyListeners();
            }
        }
    }

    /**
     * Remove a proxy model from an API key
     */
    removeProxyModel(keyId: string, modelId: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot && slot.proxyModels) {
            slot.proxyModels = slot.proxyModels.filter(m => m.id !== modelId);
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Update a single proxy model
     */
    updateProxyModel(keyId: string, oldModelId: string, model: ProxyModelConfig): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot && slot.proxyModels) {
            // Remove old if ID changed, or just find index
            const index = slot.proxyModels.findIndex(m => m.id === oldModelId);
            if (index !== -1) {
                // Check if new ID collides with another existing model (if ID changed)
                if (model.id !== oldModelId && slot.proxyModels.some(m => m.id === model.id)) {
                    // Start override or Error? User probably wants to rename.
                    // If conflict, we overwrite the other one? Or fail?
                    // Let's just overwrite the index. If duplicate ID exists else where, it effectively merges?
                    // Better to just update at index.
                }
                slot.proxyModels[index] = model;
                this.saveState();
                this.notifyListeners();
            }
        }
    }

    /**
     * Get all available proxy models from all enabled proxy API keys
     * Aggregates models from all proxy keys (non-Google)
     *
     * @param type Optional filter by model type ('image', 'video', 'chat')
     */
    getAvailableProxyModels(type?: 'image' | 'video' | 'chat'): ProxyModelConfig[] {
        const allModels: ProxyModelConfig[] = [];
        const seenIds = new Set<string>();

        for (const slot of this.state.slots) {
            // Skip disabled keys
            if (slot.disabled) continue;

            // Only include proxy keys (non-Google)
            const isProxy = slot.baseUrl && !slot.baseUrl.includes('googleapis.com');
            if (!isProxy) continue;

            // Skip keys without configured models
            if (!slot.proxyModels || slot.proxyModels.length === 0) continue;

            for (const model of slot.proxyModels) {
                // Skip duplicates
                if (seenIds.has(model.id)) continue;

                // Filter by type if specified
                if (type && model.type !== type) continue;

                allModels.push(model);
                seenIds.add(model.id);
            }
        }

        return allModels;
    }

    /**
     * Check if there are any proxy keys with configured models
     */
    hasConfiguredProxyModels(type?: 'image' | 'video' | 'chat'): boolean {
        return this.getAvailableProxyModels(type).length > 0;
    }
}

// Singleton instance
export const keyManager = new KeyManager();

export default KeyManager;

// Re-export ProxyModelConfig for convenience
export type { ProxyModelConfig } from './proxyModelConfig';
