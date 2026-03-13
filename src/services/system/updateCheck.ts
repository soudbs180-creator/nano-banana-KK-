/**
 * Update Check Service
 * Detects when a new version is deployed and prompts user to refresh
 */

const VERSION_CHECK_INTERVAL = 60000; // Check every 60 seconds
const UPDATE_CHECK_QUERY_KEY = '__kk_update_check__';
const FORCE_REFRESH_QUERY_KEY = '__kk_update__';
let currentBuildHash: string | null = null;
let updateAvailable = false;
let updateListeners: ((available: boolean) => void)[] = [];
let initPromise: Promise<void> | null = null;
let intervalId: number | null = null;

function isExplicitUpdateCheckEnabled(): boolean {
    return import.meta.env.VITE_ENABLE_UPDATE_CHECK === 'true';
}

function isUpdateCheckDisabled(): boolean {
    const protocol = window.location.protocol;

    return !isExplicitUpdateCheckEnabled()
        || import.meta.env.DEV
        || protocol !== 'http:' && protocol !== 'https:'
        || window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1';
}

function buildNoCacheUrl(queryKey: string): string {
    const url = new URL(window.location.href);
    url.searchParams.set(queryKey, Date.now().toString());
    return url.toString();
}

async function clearRuntimeCaches(): Promise<void> {
    if (!('caches' in window)) return;

    try {
        const cacheKeys = await window.caches.keys();
        await Promise.allSettled(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
    } catch (e) {
        console.warn('[UpdateCheck] Failed to clear runtime caches:', e);
    }
}

/**
 * Get the current build fingerprint from index.html script tags
 * This matches ANY script src change (bundled assets), making it robust for Vite/Webpack/etc.
 */
async function fetchBuildHash(): Promise<string | null> {
    try {
        const response = await fetch(buildNoCacheUrl(UPDATE_CHECK_QUERY_KEY), {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache'
            }
        });
        const html = await response.text();

        // Extract all script src values
        // Matches <script ... src="..."></script>
        const scriptSrcs = Array.from(html.matchAll(/<script[^>]*src="([^"]*)"[^>]*>/g))
            .map(match => match[1]);

        // Filter for app-like bundles (ignore external CDNs if needed, but safer to track all)
        // In Vite prod, usually /assets/index-HASH.js
        // In Vite dev, /src/main.tsx

        if (scriptSrcs.length === 0) return null;

        // Join them to form a unique version fingerprint
        return scriptSrcs.join('|');
    } catch (e) {
        console.warn('[UpdateCheck] Failed to fetch build hash:', e);
        return null;
    }
}

/**
 * Initialize version checking
 */
export async function initUpdateCheck(): Promise<void> {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        if (isUpdateCheckDisabled()) {
            updateAvailable = false;
            if (intervalId !== null) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
            notifyListeners();
            console.info('[UpdateCheck] Disabled unless VITE_ENABLE_UPDATE_CHECK=true to avoid disruptive reload prompts.');
            return;
        }

        currentBuildHash = await fetchBuildHash();
        console.log('[UpdateCheck] Initial build hash:', currentBuildHash);

        if (intervalId !== null) {
            window.clearInterval(intervalId);
        }

        intervalId = window.setInterval(async () => {
            const newHash = await fetchBuildHash();

            if (newHash && currentBuildHash && newHash !== currentBuildHash && !updateAvailable) {
                console.log('[UpdateCheck] New version detected:', newHash);
                updateAvailable = true;
                notifyListeners();
            }
        }, VERSION_CHECK_INTERVAL);
    })();

    return initPromise;
}

/**
 * Subscribe to update availability changes
 */
export function subscribeToUpdates(callback: (available: boolean) => void): () => void {
    updateListeners.push(callback);
    // Immediately notify if update already available
    if (updateAvailable) {
        callback(true);
    }
    return () => {
        updateListeners = updateListeners.filter(l => l !== callback);
    };
}

/**
 * Check if update is available
 */
export function isUpdateAvailable(): boolean {
    return updateAvailable;
}

/**
 * Refresh the page to get the new version
 * Data is preserved because we save to IndexedDB/localStorage/Supabase
 */
export function applyUpdate(): void {
    if (isUpdateCheckDisabled()) {
        console.info('[UpdateCheck] Ignoring applyUpdate in local development.');
        return;
    }

    updateAvailable = false;
    notifyListeners();

    const targetUrl = buildNoCacheUrl(FORCE_REFRESH_QUERY_KEY);

    void clearRuntimeCaches().finally(() => {
        window.location.replace(targetUrl);
    });
}

function notifyListeners(): void {
    updateListeners.forEach(l => l(updateAvailable));
}
