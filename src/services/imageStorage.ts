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
