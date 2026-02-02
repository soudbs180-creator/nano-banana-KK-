/**
 * 双缓存图片存储服务（内存优先 + IndexedDB兜底）
 * 
 * 架构设计：
 * 1. 内存缓存（Map<string, string>）- 快速访问，毫秒级响应
 * 2. IndexedDB持久化 - 数据安全，页面刷新后恢复
 * 
 * 使用策略：
 * - 保存：同时写入内存和IndexedDB（并行）
 * - 读取：优先内存，未命中则从IndexedDB读取并同步到内存
 * - 删除：同时从内存和IndexedDB删除
 */

const DB_NAME = 'kk_studio_db';
const DB_VERSION = 1;
const IMAGES_STORE = 'images';

// ========== 内存缓存层 ==========
class ImageMemoryCache {
    private cache: Map<string, string> = new Map();
    private maxSizeMB: number;

    constructor(maxSizeMB: number = 100) {
        this.maxSizeMB = maxSizeMB;
    }

    // 获取缓存的图片
    get(id: string): string | null {
        return this.cache.get(id) || null;
    }

    // 设置缓存图片
    set(id: string, url: string): void {
        this.cache.set(id, url);

        // 简单的内存管理：如果超过限制，清理最旧的50%
        if (this.getApproximateSizeMB() > this.maxSizeMB) {
            this.cleanupOldest(0.5);
        }
    }

    // 删除缓存图片
    delete(id: string): void {
        this.cache.delete(id);
    }

    // 检查是否存在
    has(id: string): boolean {
        return this.cache.has(id);
    }

    // 清空所有缓存
    clear(): void {
        this.cache.clear();
    }

    // 获取所有ID
    keys(): string[] {
        return Array.from(this.cache.keys());
    }

    // 获取缓存大小（近似MB）
    private getApproximateSizeMB(): number {
        let totalBytes = 0;
        this.cache.forEach(url => {
            totalBytes += url.length;
        });
        return totalBytes / (1024 * 1024);
    }

    // 清理最旧的N%缓存（简单FIFO策略）
    private cleanupOldest(percentage: number): void {
        const keysToRemove = Math.floor(this.cache.size * percentage);
        const keys = Array.from(this.cache.keys());

        for (let i = 0; i < keysToRemove; i++) {
            this.cache.delete(keys[i]);
        }

        console.log(`[ImageCache] Cleaned up ${keysToRemove} oldest entries`);
    }
}

// ========== 全局缓存实例 ==========
const memoryCache = new ImageMemoryCache(100); // 100MB限制

// ========== IndexedDB操作 ==========
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

// ========== 公共API ==========

/**
 * 生成唯一图片ID（保证全局唯一性）
 */
export function generateImageId(): string {
    const timestamp = Date.now().toString(16);
    const random = Math.random().toString(16).slice(2, 8);
    return `img_${timestamp}_${random}`;
}

/**
 * 保存图片（双存储：内存 + IndexedDB）
 * @param id 图片唯一ID
 * @param url 图片数据（base64 data URL）
 */
export async function saveImage(id: string, url: string): Promise<void> {
    // 1. 立即写入内存缓存（同步，快速可用）
    memoryCache.set(id, url);

    // 2. 异步写入IndexedDB（持久化）
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
        console.error('[ImageStorage] Failed to save to IndexedDB:', error);
        // 注意：即使IDB失败，内存缓存仍然有效
    }
}

/**
 * 获取图片（优先内存，再IndexedDB）
 * @param id 图片唯一ID
 * @returns 图片数据或null
 */
export async function getImage(id: string): Promise<string | null> {
    // 1. 优先从内存缓存读取（快速路径）
    if (memoryCache.has(id)) {
        const url = memoryCache.get(id);
        // console.log(`[ImageStorage] Cache HIT for ${id}`);
        return url;
    }

    // 2. 内存未命中，从IndexedDB读取
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        const url = await new Promise<string | null>((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => {
                resolve(request.result?.url || null);
            };
            request.onerror = () => reject(request.error);
        });

        // 3. 如果IndexedDB有数据，同步到内存缓存
        if (url) {
            memoryCache.set(id, url);
            console.log(`[ImageStorage] Cache MISS, loaded from IndexedDB: ${id}`);
        }

        return url;
    } catch (error) {
        console.error('[ImageStorage] Failed to get from IndexedDB:', error);
        return null;
    }
}

/**
 * 删除图片（双删除：内存 + IndexedDB）
 */
export async function deleteImage(id: string): Promise<void> {
    // 1. 从内存缓存删除
    memoryCache.delete(id);

    // 2. 从IndexedDB删除
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
        console.error('[ImageStorage] Failed to delete from IndexedDB:', error);
    }
}

/**
 * 获取所有图片（从IndexedDB读取，并同步到内存）
 */
export async function getAllImages(): Promise<Map<string, string>> {
    const images = new Map<string, string>();

    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        await new Promise<void>((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const results = request.result || [];
                results.forEach((item: { id: string; url: string }) => {
                    images.set(item.id, item.url);
                    // 同步到内存缓存
                    memoryCache.set(item.id, item.url);
                });
                resolve();
            };
            request.onerror = () => reject(request.error);
        });

        console.log(`[ImageStorage] Loaded ${images.size} images from IndexedDB to memory`);
    } catch (error) {
        console.error('[ImageStorage] Failed to get all images from IndexedDB:', error);
    }

    return images;
}

/**
 * 清空所有图片（双清空：内存 + IndexedDB）
 */
export async function clearAllImages(): Promise<void> {
    // 1. 清空内存缓存
    memoryCache.clear();

    // 2. 清空IndexedDB
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);

        await new Promise<void>((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        console.log('[ImageStorage] Cleared all images from memory and IndexedDB');
    } catch (error) {
        console.error('[ImageStorage] Failed to clear IndexedDB:', error);
    }
}

/**
 * 获取存储使用量（字节）
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
                        totalSize += value.url.length;
                    }
                    cursor.continue();
                } else {
                    resolve(totalSize);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[ImageStorage] Failed to calculate storage usage:', error);
        return 0;
    }
}

/**
 * 清除内存缓存（不影响IndexedDB）
 * 用于内存压力大时手动释放
 */
export function clearMemoryCache(): void {
    memoryCache.clear();
    console.log('[ImageStorage] Memory cache cleared');
}

/**
 * 获取内存缓存统计信息
 */
export function getCacheStats(): { count: number; ids: string[] } {
    return {
        count: memoryCache.keys().length,
        ids: memoryCache.keys()
    };
}

/**
 * 清理原始大图，保留缩略图（压缩存储）
 */
export async function cleanupOriginals(): Promise<{ count: number; savedBytes: number }> {
    const MAX_THUMB_SIZE = 300;
    const SIZE_THRESHOLD = 50 * 1024;

    let count = 0;
    let savedBytes = 0;

    try {
        const images = await getAllImages();
        const db = await openDB();

        for (const [id, url] of images.entries()) {
            if (url.length < SIZE_THRESHOLD) continue;

            try {
                const compressedUrl = await compressImage(url, MAX_THUMB_SIZE);
                if (compressedUrl.length < url.length) {
                    await saveImage(id, compressedUrl);
                    savedBytes += (url.length - compressedUrl.length);
                    count++;
                }
            } catch (err) {
                console.warn(`[ImageStorage] Failed to compress ${id}:`, err);
            }
        }
    } catch (error) {
        console.error('[ImageStorage] Cleanup failed:', error);
        throw error;
    }

    return { count, savedBytes };
}

// ========== 辅助函数 ==========

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

            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}
