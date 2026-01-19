/**
 * Update Check Service
 * Detects when a new version is deployed and prompts user to refresh
 */

const VERSION_CHECK_INTERVAL = 60000; // Check every 60 seconds
let currentBuildHash: string | null = null;
let updateAvailable = false;
let updateListeners: ((available: boolean) => void)[] = [];

/**
 * Get the current build fingerprint from index.html script tags
 * This matches ANY script src change (bundled assets), making it robust for Vite/Webpack/etc.
 */
async function fetchBuildHash(): Promise<string | null> {
    try {
        const response = await fetch('/', { cache: 'no-cache' });
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
    // Get initial build hash
    currentBuildHash = await fetchBuildHash();
    console.log('[UpdateCheck] Initial build hash:', currentBuildHash);

    // Start periodic checking
    setInterval(async () => {
        const newHash = await fetchBuildHash();

        if (newHash && currentBuildHash && newHash !== currentBuildHash && !updateAvailable) {
            console.log('[UpdateCheck] New version detected:', newHash);
            updateAvailable = true;
            notifyListeners();
        }
    }, VERSION_CHECK_INTERVAL);
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
    // Force reload to get new assets
    window.location.reload();
}

function notifyListeners(): void {
    updateListeners.forEach(l => l(updateAvailable));
}
