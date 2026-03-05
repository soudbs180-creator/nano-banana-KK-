/**
 * Gemini API Response Cache
 * 
 * Caches API responses to reduce redundant calls and improve performance.
 * Uses localStorage for persistence across page refreshes.
 */

interface CacheEntry {
    response: string;
    timestamp: number;
}

interface CacheStorage {
    [key: string]: CacheEntry;
}

const CACHE_KEY = 'kk_studio_gemini_cache';
const DEFAULT_TTL_HOURS = 24;

class GeminiCache {
    private cache: CacheStorage = {};
    private ttlMs: number;

    constructor(ttlHours: number = DEFAULT_TTL_HOURS) {
        this.ttlMs = ttlHours * 60 * 60 * 1000;
        this.loadFromStorage();
    }

    /**
     * Generate a cache key from prompt and model
     */
    private getCacheKey(prompt: string, model: string): string {
        const content = `${model}:${prompt}`;
        // Simple hash function for cache key
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(16);
    }

    /**
     * Load cache from localStorage
     */
    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(CACHE_KEY);
            if (stored) {
                this.cache = JSON.parse(stored);
                // Clean expired entries on load
                this.cleanExpired();
            }
        } catch (error) {
            console.warn('Failed to load cache from localStorage:', error);
            this.cache = {};
        }
    }

    /**
     * Save cache to localStorage
     */
    private saveToStorage(): void {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache));
        } catch (error) {
            console.warn('Failed to save cache to localStorage:', error);
        }
    }

    /**
     * Remove expired entries
     */
    private cleanExpired(): void {
        const now = Date.now();
        let hasExpired = false;

        for (const key in this.cache) {
            if (now - this.cache[key].timestamp > this.ttlMs) {
                delete this.cache[key];
                hasExpired = true;
            }
        }

        if (hasExpired) {
            this.saveToStorage();
        }
    }

    /**
     * Get cached response if available and not expired
     */
    get(prompt: string, model: string): string | null {
        const key = this.getCacheKey(prompt, model);
        const entry = this.cache[key];

        if (entry) {
            const now = Date.now();
            if (now - entry.timestamp < this.ttlMs) {
                console.log('[Cache] Hit for prompt:', prompt.substring(0, 50) + '...');
                return entry.response;
            } else {
                // Expired, remove it
                delete this.cache[key];
                this.saveToStorage();
            }
        }

        console.log('[Cache] Miss for prompt:', prompt.substring(0, 50) + '...');
        return null;
    }

    /**
     * Set cache entry
     */
    set(prompt: string, model: string, response: string): void {
        const key = this.getCacheKey(prompt, model);
        this.cache[key] = {
            response,
            timestamp: Date.now()
        };
        this.saveToStorage();
        console.log('[Cache] Stored response for prompt:', prompt.substring(0, 50) + '...');
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache = {};
        localStorage.removeItem(CACHE_KEY);
        console.log('[Cache] Cleared all entries');
    }

    /**
     * Get cache statistics
     */
    getStats(): { count: number; oldestAge: number | null } {
        const keys = Object.keys(this.cache);
        if (keys.length === 0) {
            return { count: 0, oldestAge: null };
        }

        const now = Date.now();
        let oldestTimestamp = now;
        for (const key of keys) {
            if (this.cache[key].timestamp < oldestTimestamp) {
                oldestTimestamp = this.cache[key].timestamp;
            }
        }

        return {
            count: keys.length,
            oldestAge: Math.round((now - oldestTimestamp) / 1000 / 60) // in minutes
        };
    }
}

// Singleton instance
export const geminiCache = new GeminiCache(DEFAULT_TTL_HOURS);

export default GeminiCache;
