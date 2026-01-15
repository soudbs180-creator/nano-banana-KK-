/**
 * API Key Manager Service
 * 
 * Provides multi-key rotation, status monitoring, and automatic failover.
 * Similar to Gemini Balance but runs entirely on frontend.
 * NOW SUPPORTS: Supabase Cloud Sync
 */
import { supabase } from '../lib/supabase';

export interface KeySlot {
    id: string;
    key: string;
    status: 'valid' | 'invalid' | 'rate_limited' | 'unknown';
    failCount: number;
    successCount: number;
    lastUsed: number | null;
    lastError: string | null;
    disabled: boolean;
    createdAt: number;
}

interface KeyManagerState {
    slots: KeySlot[];
    currentIndex: number;
    maxFailures: number;
}

const STORAGE_KEY = 'kk_studio_key_manager';
const DEFAULT_MAX_FAILURES = 3;

class KeyManager {
    private state: KeyManagerState;
    private listeners: Set<() => void> = new Set();
    private userId: string | null = null;
    private isSyncing = false;

    constructor() {
        this.state = this.loadState();
    }

    /**
     * Load state from localStorage
     */
    private loadState(): KeyManagerState {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return {
                    slots: parsed.slots || [],
                    currentIndex: parsed.currentIndex || 0,
                    maxFailures: parsed.maxFailures || DEFAULT_MAX_FAILURES
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
                        status: 'unknown' as const,
                        failCount: 0,
                        successCount: 0,
                        lastUsed: null,
                        lastError: null,
                        disabled: false,
                        createdAt: Date.now()
                    }));

                if (slots.length > 0) {
                    console.log(`[KeyManager] Migrated ${slots.length} keys from old format`);
                    const state = {
                        slots,
                        currentIndex: 0,
                        maxFailures: DEFAULT_MAX_FAILURES
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
            maxFailures: DEFAULT_MAX_FAILURES
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

        // Security: Clear all keys when user changes or logs out
        // This prevents User B from seeing User A's keys in local storage
        this.clearAll();

        this.userId = userId;
        if (userId) {
            await this.loadFromCloud();
        }
    }

    /**
     * Load state from Supabase
     */
    private async loadFromCloud() {
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
                return;
            }

            if (data && data.api_keys) {
                // Merge cloud keys with local keys? Or overwrite? 
                // For simplicity, let's trust cloud if it has data, but merge carefully.
                // Actually, let's just use cloud valid data.
                const cloudSlots = data.api_keys as KeySlot[];
                if (Array.isArray(cloudSlots) && cloudSlots.length > 0) {
                    this.state.slots = cloudSlots;
                    this.saveState(); // Update local storage
                    this.notifyListeners();
                }
            } else {
                // Init user settings if empty
                await this.saveToCloud(this.state);
            }
        } catch (e) {
            console.error('[KeyManager] Error loading from cloud:', e);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Save state to Supabase
     */
    private async saveToCloud(state: KeyManagerState) {
        if (!this.userId) return;

        try {
            await supabase
                .from('user_settings')
                .upsert({
                    user_id: this.userId,
                    api_keys: state.slots,
                    updated_at: new Date().toISOString()
                });
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
     * Get the next available API key using round-robin rotation
     */
    getNextKey(): { id: string; key: string } | null {
        const availableSlots = this.state.slots.filter(
            s => !s.disabled && s.status !== 'invalid'
        );

        if (availableSlots.length === 0) {
            // Fallback: try any non-disabled key
            const anySlot = this.state.slots.find(s => !s.disabled);
            if (anySlot) {
                return { id: anySlot.id, key: anySlot.key };
            }
            return null;
        }

        // Round-robin selection
        const index = this.state.currentIndex % availableSlots.length;
        const slot = availableSlots[index];

        // Update index for next call
        this.state.currentIndex = (this.state.currentIndex + 1) % availableSlots.length;

        // Update last used
        const slotIndex = this.state.slots.findIndex(s => s.id === slot.id);
        if (slotIndex >= 0) {
            this.state.slots[slotIndex].lastUsed = Date.now();
        }

        this.saveState();

        return { id: slot.id, key: slot.key };
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

            // Check if key should be disabled
            if (slot.failCount >= this.state.maxFailures) {
                slot.disabled = true;
                slot.status = 'invalid';
                console.warn(`[KeyManager] Key ${keyId} disabled after ${slot.failCount} failures`);
            } else if (error.includes('429') || error.includes('rate limit')) {
                slot.status = 'rate_limited';
            } else if (error.includes('401') || error.includes('403') || error.includes('invalid')) {
                slot.status = 'invalid';
            }

            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Add a new API key
     */
    async addKey(key: string): Promise<{ success: boolean; error?: string }> {
        const trimmedKey = key.trim();

        if (!trimmedKey) {
            return { success: false, error: '请输入 API Key' };
        }

        // Check for duplicates
        if (this.state.slots.some(s => s.key === trimmedKey)) {
            return { success: false, error: '该 Key 已存在' };
        }

        // Validate the key
        const validation = await this.validateKey(trimmedKey);

        const newSlot: KeySlot = {
            id: `key_${Date.now()}`,
            key: trimmedKey,
            status: validation.valid ? 'valid' : 'invalid',
            failCount: 0,
            successCount: 0,
            lastUsed: null,
            lastError: validation.error || null,
            disabled: !validation.valid,
            createdAt: Date.now()
        };

        this.state.slots.push(newSlot);
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
     * Toggle key enabled/disabled
     */
    toggleKey(keyId: string): void {
        const slot = this.state.slots.find(s => s.id === keyId);
        if (slot) {
            slot.disabled = !slot.disabled;
            if (!slot.disabled) {
                slot.failCount = 0; // Reset fail count when re-enabling
            }
            this.saveState();
            this.notifyListeners();
        }
    }

    /**
     * Validate an API key by making a test request
     */
    async validateKey(key: string): Promise<{ valid: boolean; error?: string }> {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
                { method: 'GET' }
            );

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
     * Re-validate all keys
     */
    async revalidateAll(): Promise<void> {
        for (const slot of this.state.slots) {
            const result = await this.validateKey(slot.key);
            slot.status = result.valid ? 'valid' : 'invalid';
            slot.lastError = result.error || null;
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
}

// Singleton instance
export const keyManager = new KeyManager();

export default KeyManager;
