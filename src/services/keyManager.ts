/**
 * API Key Manager Service
 * 
 * Provides multi-key rotation, status monitoring, and automatic failover.
 * Similar to Gemini Balance but runs entirely on frontend.
 * NOW SUPPORTS: Supabase Cloud Sync & Third-Party API Proxies
 */
import { supabase } from '../lib/supabase';
import { AuthMethod, GOOGLE_API_BASE, getDefaultAuthMethod } from './apiConfig';
import { MODEL_PRESETS, CHAT_MODEL_PRESETS } from './modelPresets';

/**
 * Helper: Parse "id(name, description)" format
 */
export function parseModelString(input: string): { id: string; name?: string; description?: string } {
    // Normalize full-width parentheses to standard ones
    const normalized = input.replace(/（/g, '(').replace(/）/g, ')');
    const match = normalized.match(/^([^()]+)(?:\(([^/]+)(?:\/\s*(.+))?\))?$/);

    if (!match) return { id: input.trim() };

    return {
        id: match[1].trim(),
        name: match[2]?.trim(),
        description: match[3]?.trim()
    };
}



export interface KeySlot {
    id: string;
    key: string;
    name: string;
    provider: string; // 'Google', 'OpenAI', 'Anthropic', etc.

    // Channel Configuration
    baseUrl?: string;        // Custom base URL (e.g. for proxies)
    group?: string;          // Group selection for proxies
    compatibilityMode?: 'standard' | 'chat'; // 'standard' = /v1/images, 'chat' = /v1/chat
    supportedModels: string[]; // List of model IDs this channel supports

    // Auth Configuration
    authMethod?: AuthMethod; // 'query' | 'header'
    headerName?: string;     // Custom header name (default: x-goog-api-key)

    // Status & Usage
    status: 'valid' | 'invalid' | 'rate_limited' | 'unknown';
    failCount: number;
    successCount: number;
    lastUsed: number | null;
    lastError: string | null;
    disabled: boolean;
    createdAt: number;

    // Metrics
    usedTokens?: number;
    totalCost: number;
    budgetLimit: number; // -1 for unlimited
    quota?: {
        limitRequests: number;
        remainingRequests: number;
        resetConstant?: string;
        resetTime: number;
        updatedAt: number;
    };
}

interface KeyManagerState {
    slots: KeySlot[];
    currentIndex: number;
    maxFailures: number;
    rotationStrategy: 'round-robin' | 'sequential'; // New strategy field
}

const STORAGE_KEY = 'kk_studio_key_manager';
const DEFAULT_MAX_FAILURES = 3;
// Simple pricing estimation (avg between input/output for simplicity, or 0.15/1M)
const COST_PER_TOKEN = 0.00000015;

const LEGACY_GOOGLE_MODELS = ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
export const DEFAULT_GOOGLE_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001',
    'imagen-4.0-fast-generate-001'
];

const GOOGLE_HEADER_NAME = 'x-goog-api-key';

const inferHeaderName = (provider: string | undefined, baseUrl: string | undefined, authMethod: AuthMethod): string => {
    if (authMethod === 'query') return GOOGLE_HEADER_NAME;
    const providerLower = (provider || '').toLowerCase();
    const baseLower = (baseUrl || '').toLowerCase();
    if (providerLower === 'google' || baseLower.includes('google') || baseLower.includes('gemini')) {
        return GOOGLE_HEADER_NAME;
    }
    // OpenRouter / Other OpenAI compatible
    return 'Authorization';
};

const isLegacyGoogleModelList = (models: string[]) => {
    if (models.length !== LEGACY_GOOGLE_MODELS.length) return false;
    return models.every(m => LEGACY_GOOGLE_MODELS.includes(m));
};

type GlobalModelType = 'chat' | 'image' | 'video';

const GOOGLE_CHAT_MODELS = [
    { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite 最新款', icon: '⚡', description: '超高性价比，适合轻量对话与高并发' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash 最新款', icon: '🚀', description: '速度与质量均衡，日常对话首选' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash 预览', icon: '🌟', description: '新能力尝鲜，响应快' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro 预览', icon: '🧠', description: '最强推理与长上下文能力' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash（实验）', icon: '🧪', description: '多模态实验版，适合探索' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', icon: '🧠', description: '强推理与稳定性，适合复杂任务' },
    { id: 'gemini-1.5-flash', icon: '⚡', name: 'Gemini 1.5 Flash', description: '速度优先，成本更低' }
];

const GOOGLE_MODEL_METADATA = new Map<string, {
    name: string;
    description?: string;
    icon?: string;
    contextLength?: number;
    pricing?: { prompt: string; completion: string; image?: string; request?: string };
}>(
    GOOGLE_CHAT_MODELS.map(model => [model.id, { name: model.name, description: model.description, icon: model.icon }])
);

const MODEL_TYPE_MAP = new Map<string, GlobalModelType>();
GOOGLE_CHAT_MODELS.forEach(model => MODEL_TYPE_MAP.set(model.id, 'chat'));
MODEL_PRESETS.forEach(preset => MODEL_TYPE_MAP.set(preset.id, preset.type));

MODEL_PRESETS.filter(preset => preset.provider === 'Google').forEach(preset => {
    if (!GOOGLE_MODEL_METADATA.has(preset.id)) {
        GOOGLE_MODEL_METADATA.set(preset.id, { name: preset.label, description: preset.description });
    }
});

export const getModelMetadata = (modelId: string) => GOOGLE_MODEL_METADATA.get(modelId);

const inferModelType = (modelId: string): GlobalModelType => {
    const id = modelId.toLowerCase();

    // OpenRouter Specific: "provider/model" format usually implies chat unless "flux", "sd", "ideogram" etc.
    const isOpenRouter = id.includes('/') && !id.startsWith('models/');

    const isVideo = id.includes('video') || id.includes('veo') || id.includes('kling') || id.includes('runway') || id.includes('luma') || id.includes('sora') || id.includes('pika');
    if (isVideo) return 'video';


    const isImage = id.includes('imagen') || id.includes('image') || id.includes('img') || id.includes('dall-e') || id.includes('midjourney') || id.includes('nano-banana') || id.includes('flux') || id.includes('stable') || id.includes('sd') || id.includes('diffusion');
    if (isImage) return 'image';

    const isChat = id.includes('gemini') || id.includes('gpt') || id.includes('claude') || id.includes('deepseek') || id.includes('qwen') || id.includes('llama') || id.includes('mistral') || id.includes('yi-') || id.includes(':free');
    if (isChat) return 'chat';

    // Default OpenRouter to chat if ambivalent
    if (isOpenRouter) return 'chat';


    return 'image';
};

// Register Chat Model Presets
CHAT_MODEL_PRESETS.forEach(preset => {
    if (!GOOGLE_MODEL_METADATA.has(preset.id)) {
        GOOGLE_MODEL_METADATA.set(preset.id, { name: preset.label, description: preset.description });
    }
});

export class KeyManager {
    private state: KeyManagerState;
    private listeners: Set<() => void> = new Set();
    private userId: string | null = null;
    private isSyncing = false;

    constructor() {
        this.state = this.loadState();
        // Ensure strategy exists for legacy state
        if (!this.state.rotationStrategy) {
            this.state.rotationStrategy = 'round-robin';
        }

        // Ensure loaded slots have sane defaults
        this.state.slots = this.state.slots.map(s => ({
            ...s,
            disabled: s.disabled ?? false,
            status: s.status || 'valid'
        }));
    }

    private getStorageKey(): string {
        if (!this.userId) return STORAGE_KEY; // Default global key for anon
        return `${STORAGE_KEY}_${this.userId}`;
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
                // Removed strategy-based rotation, now handled by external logic or just disabled
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
            const key = this.getStorageKey();
            const stored = localStorage.getItem(key);

            // If scoped key not found, DO NOT fallback to global key to prevent leakage.
            // Only fallback if userId is null (already handled by getStorageKey).

            if (stored) {
                const parsed = JSON.parse(stored);
                // Migration for existing keys
                const slots = (parsed.slots || []).map((s: any) => {
                    const provider = s.provider || 'Google';
                    const baseUrl = s.baseUrl || '';
                    const authMethod = s.authMethod || getDefaultAuthMethod(baseUrl);
                    const shouldOverrideHeader = !s.headerName || (
                        s.headerName === GOOGLE_HEADER_NAME &&
                        provider !== 'Google' &&
                        !baseUrl.toLowerCase().includes('google')
                    );
                    const headerName = shouldOverrideHeader ? inferHeaderName(provider, baseUrl, authMethod) : s.headerName;
                    const rawModels = Array.isArray(s.supportedModels) ? s.supportedModels : [];
                    const supportedModels = provider === 'Google' && (rawModels.length === 0 || isLegacyGoogleModelList(rawModels))
                        ? [...DEFAULT_GOOGLE_MODELS]
                        : rawModels;

                    return {
                        ...s,
                        name: s.name || 'Unnamed Channel',
                        provider,
                        totalCost: s.totalCost || 0,
                        budgetLimit: s.budgetLimit !== undefined ? s.budgetLimit : -1,
                        baseUrl,
                        authMethod,
                        headerName,
                        compatibilityMode: s.compatibilityMode || 'standard',
                        supportedModels,
                        disabled: s.disabled ?? false,
                        status: s.status || 'valid'
                    };
                });

                const state: KeyManagerState = {
                    slots,
                    currentIndex: 0,
                    maxFailures: DEFAULT_MAX_FAILURES,
                    rotationStrategy: parsed.rotationStrategy || this.state?.rotationStrategy || 'round-robin'
                };

                // No immediate saveState here to avoid overwriting on read
                return state;
            }
        } catch (e) {
            console.warn('[KeyManager] Load failed:', e);
        }

        // Return empty state if nothing found (Fresh user / Fresh storage)
        return {
            slots: [],
            currentIndex: 0,
            maxFailures: DEFAULT_MAX_FAILURES,
            rotationStrategy: 'round-robin'
        };
    }

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
                        provider: 'Google',
                        status: 'unknown' as const,
                        failCount: 0,
                        successCount: 0,
                        lastUsed: null,
                        lastError: null,
                        disabled: false,
                        createdAt: Date.now(),
                        totalCost: 0,
                        budgetLimit: -1,
                        supportedModels: [...DEFAULT_GOOGLE_MODELS],
                        baseUrl: '',
                        authMethod: 'query',
                        headerName: 'x-goog-api-key'
                    }));

                if (slots.length > 0) {
                    console.log(`[KeyManager] Migrated ${slots.length} keys from old format`);
                    const state: KeyManagerState = {
                        slots,
                        currentIndex: 0,
                        maxFailures: DEFAULT_MAX_FAILURES,
                        rotationStrategy: 'round-robin'
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
            rotationStrategy: 'round-robin'
        };
    }

    /**
     * Save state to localStorage
     */
    private saveState(state?: KeyManagerState): void {
        const toSave = state || this.state;
        try {
            const key = this.getStorageKey();
            localStorage.setItem(key, JSON.stringify(toSave));

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
        // Only clear keys if switching between different logged-in users
        // (not when logging in from anonymous or logging out)
        // Actually, we should ALWAYS reload state when ID changes to ensure isolation.

        this.userId = userId;

        // Reload state from scoped storage
        // This effectively "clears" the in-memory state if the new scope is empty
        this.state = this.loadState();
        this.notifyListeners(); // Notify UI to clear/update immediately

        if (userId) {
            // Pass local keys to merge with cloud
            // Note: After loadState(), this.state.slots might be empty (fresh scope)
            // or contain existing local keys for THIS user.
            // If we want to import previous anon keys, we would need to pass them explicitly.
            // But strict isolation means we probably shouldn't auto-merge generic keys into private accounts.
            // Let's stick to standard sync: Load from cloud.
            await this.loadFromCloud([]); // Pass empty array as we don't want to merge across scopes implicitly
        } else {
            // Logging out - just state loaded from 'global' (anon) scope
        }
    }

    /**
     * Load state from Supabase and merge with local keys
     */
    private async loadFromCloud(localKeys: KeySlot[] = []) {
        if (!this.userId) return;

        // Skip cloud load for Dev User
        if (this.userId.startsWith('dev-user-')) {
            console.log('[KeyManager] Dev user detected, skipping cloud load. Using local keys.');
            if (localKeys.length > 0 && this.state.slots.length === 0) {
                this.state.slots = localKeys;
                this.saveState();
            }
            return;
        }

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
                        supportedModels: s.supportedModels || []
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
        if (!this.userId || this.userId.startsWith('dev-user-')) return;

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
     * Test a potential channel connection
     */
    async testChannel(
        url: string,
        key: string,
        provider?: string,
        authMethod?: AuthMethod,
        headerName?: string
    ): Promise<{ success: boolean, message?: string }> {
        try {
            let targetUrl = url;
            const headers: Record<string, string> = {};

            // Pre-process URL
            const cleanUrl = url.replace(/\/chat\/completions$/, '').replace(/\/$/, '');

            const resolvedAuthMethod = authMethod || getDefaultAuthMethod(cleanUrl);
            const resolvedHeader = headerName || inferHeaderName(provider, cleanUrl, resolvedAuthMethod);

            if (url.includes('generativelanguage.googleapis.com') || provider === 'Google') {
                // Google Native Logic
                if (cleanUrl === 'https://generativelanguage.googleapis.com') {
                    // Default Google Base
                    targetUrl = `${cleanUrl}/v1beta/models`;
                } else if (!cleanUrl.endsWith('/models')) {
                    // Custom Google Proxy? Try appending models if missing
                    targetUrl = `${cleanUrl}/models`;
                }

                // Google uses Query Param or x-goog-api-key header
                // We'll use the header for cleanliness, works on v1beta
                if (resolvedAuthMethod === 'query') {
                    targetUrl = `${targetUrl}?key=${key}`;
                } else {
                    headers[resolvedHeader] = key;
                }
                // headers['Content-Type'] = 'application/json'; // Not strictly triggered for GET
            } else {
                // OpenAI Compatible Logic
                targetUrl = cleanUrl.endsWith('/models') ? cleanUrl : `${cleanUrl}/models`;
                const headerValue = resolvedHeader.toLowerCase() === 'authorization'
                    ? (key.toLowerCase().startsWith('bearer ') ? key : `Bearer ${key}`)
                    : key;
                headers[resolvedHeader] = headerValue;
            }

            // console.log(`[TestChannel] Testing ${targetUrl} (Provider: ${provider})...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort("Request Timed Out"), 15000); // Increased to 15s

            try {
                const response = await fetch(targetUrl, {
                    method: 'GET',
                    headers,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    return { success: true };
                }

                // Google often returns 400/403 with detailed JSON
                let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.error && errorData.error.message) {
                        errorMsg = errorData.error.message;
                    }
                } catch (e) {
                    // Ignore json parse error
                }

                return { success: false, message: errorMsg };
            } catch (e: any) {
                clearTimeout(timeoutId);
                const isAbort = e.name === 'AbortError' || e.message?.includes('aborted');
                return {
                    success: false,
                    message: isAbort ? 'Request Timed Out (Check Network/Proxy)' : (e.message || 'Connection failed')
                };
            }
        } catch (e: any) {
            return { success: false, message: e.message || 'Connection failed' };
        }
    }

    /**
     * Fetch available models from a remote API
     * Returns a list of model IDs or empty array on failure
     * SIDE EFFECT: Updates GOOGLE_MODEL_METADATA with rich info if available
     */
    async fetchRemoteModels(baseUrl: string, key: string, authMethod?: AuthMethod, headerName?: string, provider?: string): Promise<string[]> {
        try {
            const cleanUrl = baseUrl.replace(/\/chat\/completions$/, '').replace(/\/$/, '');
            let targetUrls = [
                cleanUrl.endsWith('/models') ? cleanUrl : `${cleanUrl}/models`,
            ];

            if (!cleanUrl.match(/\/v1\/?$/) && !cleanUrl.match(/\/v1beta\/?$/)) {
                targetUrls.push(`${cleanUrl}/v1/models`);
                targetUrls.push(`${cleanUrl}/v1beta/models`);
            }

            targetUrls = [...new Set(targetUrls)];

            const resolvedAuthMethod = authMethod || 'query'; // Simplified default
            const resolvedHeader = headerName || 'Authorization';
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            if (resolvedAuthMethod !== 'query') {
                headers[resolvedHeader] = resolvedHeader.toLowerCase() === 'authorization'
                    ? (key.toLowerCase().startsWith('bearer ') ? key : `Bearer ${key}`)
                    : key;
            }

            // OpenRouter CORS Fix
            if (cleanUrl.includes('openrouter.ai')) {
                headers['HTTP-Referer'] = window.location.origin; // Required by OpenRouter
                headers['X-Title'] = 'KK Studio'; // Optional
            }

            // Try each URL until one works
            for (const url of targetUrls) {
                try {
                    const fullUrl = resolvedAuthMethod === 'query' ? `${url}?key=${key}` : url;

                    // Use manual AbortController for broader compatibility
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort("Request Timed Out"), 8000);

                    const response = await fetch(fullUrl, {
                        method: 'GET',
                        headers,
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const data = await response.json();
                        const list = data.data || data.models || [];
                        if (Array.isArray(list)) {
                            // Process metadata if available (OpenRouter style)
                            list.forEach((m: any) => {
                                const id = m.id || m.name;
                                if (!id) return;

                                const existing = GOOGLE_MODEL_METADATA.get(id);
                                const metadata: any = {
                                    name: m.name || existing?.name || id,
                                    description: m.description || existing?.description,
                                    // OpenRouter specific fields
                                    contextLength: m.context_length || m.context_window,
                                    pricing: m.pricing // { prompt: "0.000001", completion: "0.000002" } check API docs
                                };

                                // Explicitly handle OpenRouter free tagging
                                if (id.endsWith(':free')) {
                                    metadata.pricing = { prompt: '0', completion: '0' };
                                }

                                GOOGLE_MODEL_METADATA.set(id, { ...existing, ...metadata });
                            });

                            return list.map((m: any) => m.id || m.name).filter(Boolean);
                        }
                    }
                } catch { /* continue */ }
            }
            return [];
        } catch (e) {
            console.error('Fetch models failed', e);
            return [];
        }
    }

    /**
     * Set rotation strategy
     */
    setStrategy(strategy: 'round-robin' | 'sequential') {

        this.state.rotationStrategy = strategy;
        this.saveState();
        this.notifyListeners();
    }

    /**
     * Get the current rotation strategy
     */
    getStrategy(): 'round-robin' | 'sequential' {
        return this.state.rotationStrategy || 'round-robin'; // Default to round-robin
    }

    /**
     * Get the best available channel for a specific model
     * Strategy:
     * 1. Filter channels that support the model
     * 2. Filter healthy channels (Active, Valid, Budget OK)
     * 3. Apply Rotation Strategy (Round Robin vs Sequential)
     */
    getNextKey(modelId: string): {
        id: string;
        key: string;
        baseUrl: string;
        authMethod: AuthMethod;
        headerName: string;
        group?: string;
        provider: string;
    } | null {
        // 1. Filter by Model Support
        const candidates = this.state.slots.filter(s =>
            (s.supportedModels || []).some(m => parseModelString(m).id === modelId)
        );

        if (candidates.length === 0) return null;

        // 2. Filter Healthy
        const healthy = candidates.filter(s =>
            !s.disabled &&
            s.status !== 'invalid' &&
            (s.budgetLimit < 0 || s.totalCost < s.budgetLimit)
        );

        if (healthy.length === 0) return null;

        // 3. Apply Strategy
        // Common Sort: Valid > Unknown > Rate Limited
        healthy.sort((a, b) => {
            if (a.status === 'valid' && b.status !== 'valid') return -1;
            if (a.status !== 'valid' && b.status === 'valid') return 1;
            // Secondary Sort: Stable Order (by Index/ID) for Sequential
            // tertiary sort by creation time or just preserve index order
            return 0;
        });

        // Determine Selection
        const strategy = this.state.rotationStrategy || 'round-robin';
        let winner: KeySlot;

        if (strategy === 'sequential') {
            // SEQUENTIAL: Always pick the first healthy key (Stable Priority)
            // This ensures we burn through Key 1 before touching Key 2
            winner = healthy[0];
        } else {
            // ROUND-ROBIN / CONCURRENT: Pick random from top tier to distribute load
            const topStatus = healthy[0].status;
            const topTier = healthy.filter(s => s.status === topStatus);
            winner = topTier[Math.floor(Math.random() * topTier.length)];
        }

        return this.prepareKeyResult(winner);
    }

    /**
     * Get available proxy models with default capabilities
     * Used by modelCapabilities.ts
     */
    getAvailableProxyModels(): { id: string; supportedAspectRatios: any[]; supportedSizes: any[]; supportsGrounding: boolean }[] {
        const models = new Map<string, any>();
        // Import enums to avoid circular dependency if possible, or just use strings if suitable. 
        // Actually we can access AspectRatio/ImageSize from imports if available, but to avoid circular deps with types.ts if this file imports it...
        // KeyManager imports types from apiConfig? No.
        // Let's assume defaults.
        const defaultRatios = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', '2:3', '3:2'];
        const defaultSizes = ['1024x1024', '1344x768', '768x1344']; // Approximate

        this.state.slots.forEach(s => {
            // Check if proxy (has baseUrl)
            if (s.baseUrl && !s.disabled && s.status !== 'invalid') {
                (s.supportedModels || []).forEach(m => {
                    if (!models.has(m)) {
                        models.set(m, {
                            id: m,
                            supportedAspectRatios: defaultRatios,
                            supportedSizes: defaultSizes,
                            supportsGrounding: false
                        });
                    }
                });
            }
        });
        return Array.from(models.values());
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
            headerName: slot.headerName || 'x-goog-api-key',
            compatibilityMode: slot.compatibilityMode || 'standard',
            group: slot.group,
            provider: slot.provider || 'Google'
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
     * Report failed API call
     */
    reportFailure(keyId: string, error: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.failCount++;
            slot.lastError = error;
            slot.lastUsed = Date.now();

            if (error.includes('429') || error.includes('rate limit')) {
                slot.status = 'rate_limited';
            } else if (error.includes('401') || error.includes('403') || error.includes('invalid')) {
                slot.status = 'invalid';
            }

            this.saveState();
            this.notifyListeners();
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
            if (!slot.disabled) {
                slot.failCount = 0;
                slot.status = 'unknown';
            }
            this.saveState();
            this.notifyListeners();
        }
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
        }
    }



    /**
     * Clear all keys (e.g. on user switch)
     */
    clearAll() {
        this.state.slots = [];
        this.state.currentIndex = 0;
        this.saveState();
        this.notifyListeners();
    }

    /**
     * Reorder slots (for manual sorting)
     */
    reorderSlots(fromIndex: number, toIndex: number) {
        if (fromIndex < 0 || fromIndex >= this.state.slots.length ||
            toIndex < 0 || toIndex >= this.state.slots.length) return;

        const slots = [...this.state.slots];
        const [moved] = slots.splice(fromIndex, 1);
        slots.splice(toIndex, 0, moved);

        this.state.slots = slots;
        this.saveState();
        this.notifyListeners();
    }

    async addKey(key: string, options?: {
        name?: string;
        provider?: string;
        baseUrl?: string;
        authMethod?: AuthMethod;
        headerName?: string;
        supportedModels?: string[];
        budgetLimit?: number;
    }): Promise<{ success: boolean; error?: string; id?: string }> {
        const trimmedKey = key.trim();

        if (!trimmedKey) {
            return { success: false, error: '请输入 API Key' };
        }

        // Check for duplicates
        if (this.state.slots.some(s => s.key === trimmedKey && s.baseUrl === options?.baseUrl)) {
            return { success: false, error: '该 Key 已存在' };
        }

        const baseUrl = options?.baseUrl || '';
        const authMethod = options?.authMethod || getDefaultAuthMethod(baseUrl);
        const headerName = options?.headerName || inferHeaderName(options?.provider || 'Custom', baseUrl, authMethod);

        const newSlot: KeySlot = {
            id: `key_${Date.now()}`,
            key: trimmedKey,
            name: options?.name || 'My Channel',
            provider: options?.provider || 'Custom',
            baseUrl,
            authMethod,
            headerName,
            supportedModels: options?.supportedModels || [],
            status: 'unknown',
            failCount: 0,
            successCount: 0,
            lastUsed: null,
            lastError: null,
            disabled: false,
            createdAt: Date.now(),
            totalCost: 0,
            budgetLimit: options?.budgetLimit ?? -1
        };

        this.state.slots.push(newSlot);
        this.saveState();
        this.notifyListeners();

        return {
            success: true,
            id: newSlot.id
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
    updateKey(id: string, updates: Partial<KeySlot>): void {
        const slot = this.state.slots.find(s => s.id === id);
        if (slot) {
            Object.assign(slot, updates);
            // Ensure supportedModels is always an array
            if (updates.supportedModels) {
                slot.supportedModels = updates.supportedModels;
            }
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
     * Get validated global model list from all channels (Standard + Custom)
     */
    /**
     * Get validated global model list from all channels (Standard + Custom)
     * SORTING ORDER: User Custom Models (Top) -> Standard Google Models (Bottom)
     */
    getGlobalModelList(): { id: string; name: string; provider: string; isCustom: boolean; type: GlobalModelType; icon?: string; description?: string }[] {
        const uniqueModels = new Map<string, { id: string; name: string; provider: string; isCustom: boolean; type: GlobalModelType; icon?: string; description?: string }>();
        const chatModelIds = new Set(GOOGLE_CHAT_MODELS.map(model => model.id));

        // 1. Add models from all active keys (Proxies/Custom) - THESE GO FIRST
        this.state.slots.forEach(slot => {
            if (slot.disabled || slot.status === 'invalid') return;
            if (slot.supportedModels && slot.supportedModels.length > 0) {
                slot.supportedModels.forEach(rawModelStr => {
                    const { id, name, description } = parseModelString(rawModelStr);

                    // Only add if not already present
                    if (!uniqueModels.has(id)) {
                        const meta = GOOGLE_MODEL_METADATA.get(id);
                        const mappedType = MODEL_TYPE_MAP.get(id);
                        const isGoogleProvider = slot.provider === 'Google' || chatModelIds.has(id);
                        const inferredType = mappedType || inferModelType(id);

                        // Use parsed name/desc if available, otherwise fallback to metadata or default
                        const finalName = name || (meta ? meta.name : (slot.provider ? `${slot.provider} 模型` : '自定义模型'));
                        const finalDesc = description || (meta ? meta.description : `通过 ${slot.name || slot.provider} 调用`);

                        if (meta) {
                            // If we have metadata (it's a known model), we still want to use User's Name/Desc overrides if provided
                            // But distinct "isCustom" based on provider
                            uniqueModels.set(id, {
                                id: id,
                                name: finalName,
                                provider: slot.provider || 'Google',
                                isCustom: !isGoogleProvider,
                                type: inferredType,
                                icon: meta.icon,
                                description: finalDesc
                            });
                            return;
                        }

                        uniqueModels.set(id, {
                            id: id,
                            name: finalName,
                            provider: slot.name || slot.provider,
                            isCustom: true,
                            type: inferredType,
                            icon: '🔌',
                            description: finalDesc
                        });
                    }
                });
            }
        });

        // 2. Add Standard Google Models if any Google key exists - THESE GO LAST
        // Only add if NOT already added by user custom list
        const hasGoogleKey = this.state.slots.some(s => s.provider === 'Google' && !s.disabled && s.status !== 'invalid');
        if (hasGoogleKey) {
            GOOGLE_CHAT_MODELS.forEach(model => {
                if (!uniqueModels.has(model.id)) {
                    uniqueModels.set(model.id, {
                        id: model.id,
                        name: model.name,
                        provider: 'Google',
                        isCustom: false,
                        type: 'chat',
                        icon: model.icon,
                        description: model.description
                    });
                }
            });
        }


        return Array.from(uniqueModels.values());
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



}

// Singleton instance
export const keyManager = new KeyManager();

export default KeyManager;

// Re-export ProxyModelConfig for convenience

