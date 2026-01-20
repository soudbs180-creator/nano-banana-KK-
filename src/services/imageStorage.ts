/**
 * IndexedDB Storage Service for large image data
 * localStorage has a 5MB limit which is easily exceeded by base64 images
 * IndexedDB can store much more data (typically 50MB+ per origin)
 */

const DB_NAME = 'kk_studio_db';
const DB_VERSION = 1;
const IMAGES_STORE = 'images';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Create images store if it doesn't exist
            if (!db.objectStoreNames.contains(IMAGES_STORE)) {
                db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
            }
        };
    });

    return dbPromise;
}

/**
 * Save image data to IndexedDB
 */
export async function saveImage(id: string, url: string): Promise<void> {
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);

        await new Promise<void>((resolve, reject) => {
            const request = store.put({ id, url });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to save image to IndexedDB:', error);
    }
}

/**
 * Get image data from IndexedDB
 */
export async function getImage(id: string): Promise<string | null> {
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        return new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => {
                resolve(request.result?.url || null);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to get image from IndexedDB:', error);
        return null;
    }
}

/**
 * Delete image from IndexedDB
 */
export async function deleteImage(id: string): Promise<void> {
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);

        await new Promise<void>((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to delete image from IndexedDB:', error);
    }
}

/**
 * Get all images from IndexedDB
 */
export async function getAllImages(): Promise<Map<string, string>> {
    const images = new Map<string, string>();

    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result || [];
                results.forEach((item: { id: string; url: string }) => {
                    images.set(item.id, item.url);
                });
                resolve(images);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to get all images from IndexedDB:', error);
        return images;
    }
}

/**
 * Clear all images from IndexedDB (used when clearing all data)
 */
export async function clearAllImages(): Promise<void> {
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);

        await new Promise<void>((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to clear IndexedDB:', error);
    }
}
/**
 * Calculate total storage usage in bytes (approximate)
 */
export async function getStorageUsage(): Promise<number> {
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        return new Promise((resolve, reject) => {
            let totalSize = 0;
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    const value = cursor.value;
                    if (value.url) {
                        totalSize += value.url.length; // Approximate size
                    }
                    cursor.continue();
                } else {
                    resolve(totalSize);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to calculate storage usage:', error);
        return 0;
    }
}

/**
 * Cleanup logic: Replace large images with thumbnails
 */
export async function cleanupOriginals(): Promise<{ count: number, savedBytes: number }> {
    const MAX_THUMB_SIZE = 300; // Max dimension for thumbnail
    const SIZE_THRESHOLD = 50 * 1024; // Only compress if > 50KB

    let count = 0;
    let savedBytes = 0;

    try {
        const images = await getAllImages();
        const db = await openDB();

        for (const [id, url] of images.entries()) {
            if (url.length < SIZE_THRESHOLD) continue;

            // Compress
            try {
                const compressedUrl = await compressImage(url, MAX_THUMB_SIZE);
                if (compressedUrl.length < url.length) {
                    // Update in DB
                    await saveImage(id, compressedUrl);
                    savedBytes += (url.length - compressedUrl.length);
                    count++;
                }
            } catch (err) {
                console.warn(`Failed to compress image ${id}:`, err);
            }
        }
    } catch (error) {
        console.error('Cleanup failed:', error);
        throw error;
    }

    return { count, savedBytes };
}

// Helper: Compress image to thumbnail
function compressImage(dataUrl: string, maxDimension: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxDimension) {
                    height *= maxDimension / width;
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width *= maxDimension / height;
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);

            // Output as JPEG with medium-low quality for thumbnails
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}
