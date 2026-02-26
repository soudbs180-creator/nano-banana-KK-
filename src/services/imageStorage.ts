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

import { fileSystemService } from './fileSystemService';

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
        // 🚀 Fix: Revoke old Blob URL if overwriting
        const oldUrl = this.cache.get(id);
        if (oldUrl && oldUrl !== url && oldUrl.startsWith('blob:')) {
            URL.revokeObjectURL(oldUrl);
        }
        this.cache.set(id, url);

        // 简单的内存管理：如果超过限制，清理最旧的50%
        if (this.getApproximateSizeMB() > this.maxSizeMB) {
            this.cleanupOldest(0.5);
        }
    }

    // 删除缓存图片
    delete(id: string): void {
        // 🚀 Fix: Revoke Blob URL when deleting from cache
        const url = this.cache.get(id);
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
        this.cache.delete(id);
    }

    // 检查是否存在
    has(id: string): boolean {
        return this.cache.has(id);
    }

    // 清空所有缓存
    clear(): void {
        // 🚀 Fix: Revoke all active Blob URLs
        this.cache.forEach(url => {
            if (url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        });
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
            const id = keys[i];
            const url = this.cache.get(id);
            // 🚀 Fix: Revoke Blob URL on cache eviction to prevent massive memory leaks
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
            this.cache.delete(id);
        }

        console.log(`[ImageCache] Cleaned up ${keysToRemove} oldest entries`);
    }
}

// ========== 全局缓存实例 ==========
const memoryCache = new ImageMemoryCache(100); // 100MB限制

// ========== IndexedDB操作 ==========
let dbPromise: Promise<IDBDatabase> | null = null;

async function toBlobFromAnyUrl(dataURL: string): Promise<Blob | null> {
    try {
        if (!dataURL) return null;

        if (dataURL.startsWith('data:')) {
            const { base64ToBlob } = await import('../utils/blobUtils');
            const blob = base64ToBlob(dataURL);
            return blob.size > 0 ? blob : null;
        }

        if (dataURL.startsWith('blob:') || dataURL.startsWith('http://') || dataURL.startsWith('https://')) {
            const res = await fetch(dataURL);
            if (!res.ok) return null;
            const blob = await res.blob();
            return blob.size > 0 ? blob : null;
        }

        return null;
    } catch {
        return null;
    }
}

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
 * 🚀 保存图片（Blob模式 - 不占用JS堆内存）
 * @param id 图片唯一ID
 * @param dataURL 图片数据（base64 data URL）
 */
export async function saveImage(id: string, dataURL: string): Promise<void> {
    try {
        // 🚀 转换为Blob（兼容 data:/blob:/http）
        const blob = await toBlobFromAnyUrl(dataURL);

        // 如果 blob 为 null（无效URL），直接返回
        if (!blob) {
            console.warn(`[ImageStorage] Cannot save ${id}: invalid or expired URL`);
            // Fallback: 尝试保存原始 dataURL 到内存
            memoryCache.set(id, dataURL);
            return;
        }

        // 1. 内存缓存：存储Blob URL（轻量）
        const blobURL = URL.createObjectURL(blob);
        memoryCache.set(id, blobURL);

        // 2. IndexedDB：存储Blob对象（不占JS内存）
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);

        await new Promise<void>((resolve, reject) => {
            // 🚀 关键：保存Blob而非Base64字符串
            const request = store.put({ id, blob });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        console.log(`[ImageStorage] Saved ${id} as Blob (memory-efficient)`);
    } catch (error) {
        console.error('[ImageStorage] Failed to save image:', error);
        // Fallback: 至少保存到内存缓存
        memoryCache.set(id, dataURL);
    }
}

/**
 * 🚀 获取图片（Blob URL模式 - 不占用JS堆内存）
 * @param id 图片唯一ID
 * @returns Blob URL或null
 */
export async function getImage(id: string): Promise<string | null> {
    // 1. 优先从内存缓存读取（快速路径）
    if (memoryCache.has(id)) {
        const url = memoryCache.get(id);
        return url;
    }

    // 2. 内存未命中，从IndexedDB读取
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        const result: { id: string; blob?: Blob; url?: string } | undefined = await new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!result) {
            return null;
        }

        // 🚀 关键：优先使用Blob，创建Blob URL
        if (result.blob) {
            if (result.blob.size === 0) {
                console.warn(`[ImageStorage] Invalid empty blob detected for ${id}, ignoring corrupted cache`);
                return null;
            }
            const blobURL = URL.createObjectURL(result.blob);
            memoryCache.set(id, blobURL);
            console.log(`[ImageStorage] Loaded ${id} as Blob URL`);
            return blobURL;
        }

        // Fallback: 旧数据为Base64字符串（兼容）
        if (result.url) {
            console.warn(`[ImageStorage] ${id} is old Base64 format`);
            memoryCache.set(id, result.url);
            return result.url;
        }

        return null;
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
 * ⚠️ 注意：此函数会加载所有图片到内存，可能导致内存溢出！
 * 建议使用 getImagesPage() 进行分页加载
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
 * 获取图片总数（不加载数据，只统计）
 */
export async function getImageCount(): Promise<number> {
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        return new Promise<number>((resolve, reject) => {
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('[ImageStorage] Failed to count images:', error);
        return 0;
    }
}

/**
 * 分页获取图片（推荐：避免一次性加载过多数据）
 * @param offset 起始位置
 * @param limit 获取数量
 * @returns 图片Map和是否还有更多数据
 */
export async function getImagesPage(offset: number, limit: number): Promise<{
    images: Map<string, string>;
    hasMore: boolean;
    total: number;
}> {
    const images = new Map<string, string>();
    let hasMore = false;
    let total = 0;

    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        // 先获取总数
        total = await new Promise<number>((resolve, reject) => {
            const countRequest = store.count();
            countRequest.onsuccess = () => resolve(countRequest.result);
            countRequest.onerror = () => reject(countRequest.error);
        });

        // 使用cursor分页
        await new Promise<void>((resolve, reject) => {
            const request = store.openCursor();
            let currentIndex = 0;
            let loaded = 0;

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;

                if (!cursor) {
                    resolve();
                    return;
                }

                // 跳过offset之前的记录
                if (currentIndex < offset) {
                    currentIndex++;
                    cursor.continue();
                    return;
                }

                // 加载limit数量的记录
                if (loaded < limit) {
                    const { id, url, blob } = cursor.value;
                    // 🚀 Fix: If blob exists, build a Blob URL to avoid downloading it again!
                    const finalUrl = blob ? URL.createObjectURL(blob) : url;

                    if (finalUrl) {
                        images.set(id, finalUrl);
                        // 同步到内存缓存
                        memoryCache.set(id, finalUrl);
                        loaded++;
                    }
                    currentIndex++;
                    cursor.continue();
                } else {
                    // 达到limit，检查是否还有更多
                    hasMore = true;
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });

        console.log(`[ImageStorage] Loaded page: offset=${offset}, limit=${limit}, got=${images.size}, total=${total}`);
    } catch (error) {
        console.error('[ImageStorage] Failed to get images page:', error);
    }

    return { images, hasMore, total };
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
        // 🚀 改为分批加载避免内存溢出
        const BATCH_SIZE = 10;
        const totalImages = await getImageCount();
        const db = await openDB();

        console.log(`[compressLargeImages] Processing ${totalImages} images in batches of ${BATCH_SIZE}`);

        for (let offset = 0; offset < totalImages; offset += BATCH_SIZE) {
            const { images } = await getImagesPage(offset, BATCH_SIZE);

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
                    console.warn(`[compressLargeImages] Failed to compress ${id}`, err);
                }
            }

            console.log(`[compressLargeImages] Processed batch ${Math.floor(offset / BATCH_SIZE) + 1}/${Math.ceil(totalImages / BATCH_SIZE)}`);
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

// ============================================
// 🚀 图片质量分级功能
// ============================================

import { ImageQuality, generateAllQualities, getQualityStorageId } from './imageQuality';

/**
 * 🚀 保存图片（支持质量分级）
 * 自动生成4个质量级别：微缩图、缩略图、预览图、原图
 * @param id 图片唯一ID
 * @param originalUrl 原图Base64数据
 */
export async function saveImageWithQualities(id: string, originalUrl: string): Promise<void> {
    try {
        console.log(`[ImageQuality] Generating qualities for ${id}...`);

        // 1. 生成所有质量级别
        const qualities = await generateAllQualities(originalUrl);

        // 2. 保存每个质量
        const savePromises = Object.entries(qualities).map(([quality, data]) => {
            const storageId = getQualityStorageId(id, quality as ImageQuality);
            return saveImage(storageId, data);
        });

        await Promise.all(savePromises);

        console.log(`[ImageQuality] Saved ${id} with all quality levels`);
    } catch (error) {
        console.error(`[ImageQuality] Failed to save qualities for ${id}:`, error);
        // Fallback: 至少保存原图
        await saveImage(id, originalUrl);
    }
}

/**
 * 🚀 获取指定质量的图片
 * @param id 图片ID
 * @param quality 质量级别
 * @returns 图片数据或null
 */
export async function getImageByQuality(
    id: string,
    quality: ImageQuality = ImageQuality.ORIGINAL
): Promise<string | null> {
    const storageId = getQualityStorageId(id, quality);
    const image = await getImage(storageId);

    // 如果指定质量不存在，fallback到原图
    if (!image && quality !== ImageQuality.ORIGINAL) {
        console.warn(`[ImageQuality] Quality ${quality} not found for ${id}, using original`);
        return getImage(id);
    }

    return image;
}

/**
 * 🚀 删除图片的所有质量级别
 * @param id 图片ID
 */
export async function deleteImageAllQualities(id: string): Promise<void> {
    const deletePromises = Object.values(ImageQuality).map(quality => {
        const storageId = getQualityStorageId(id, quality);
        return deleteImage(storageId);
    });

    await Promise.all(deletePromises);
}

// ========== 🔒 原图双层保护函数 ==========

/**
 * 🔒 保存原图（带重试机制和受保护标记）
 * @param id 图片唯一ID
 * @param dataURL 原图数据（base64 data URL）
 */
export async function saveOriginalImage(id: string, dataURL: string, isVideo: boolean = false): Promise<void> {
    const MAX_RETRIES = 3;

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            // 转换为Blob（兼容 data:/blob:/http）
            const blob = await toBlobFromAnyUrl(dataURL);

            // 如果 blob 为 null（无效URL），跳过
            if (!blob) {
                console.warn(`[ImageStorage] Cannot save original ${id}: invalid or expired URL`);
                return;
            }

            // 1. 🚀【第一优先级】自动备份到本地文件系统 (如果已连接)
            // 用户要求：本地文件优先保存
            const globalHandle = fileSystemService.getGlobalHandle();
            if (globalHandle) {
                try {
                    await fileSystemService.saveImageToHandle(globalHandle, id, blob, isVideo);
                    console.log(`[ImageStorage] 🔒 Local-First: Saved to disk: ${id}`);
                } catch (e) {
                    console.error(`[ImageStorage] ⚠️ Failed to save to local disk ${id}`, e);
                    // 如果本地保存失败，且没有IndexedDB兜底，则继续尝试存入DB
                }
            }

            // 2. 内存缓存：存储Blob URL
            const blobURL = URL.createObjectURL(blob);
            memoryCache.set(id, blobURL);

            // 3. IndexedDB：存储Blob对象（带保护标记）
            const db = await openDB();
            const transaction = db.transaction(IMAGES_STORE, 'readwrite');
            const store = transaction.objectStore(IMAGES_STORE);

            await new Promise<void>((resolve, reject) => {
                // 🔒 关键：标记为原图，永不删除
                const request = store.put({
                    id,
                    blob,
                    quality: 'original',
                    timestamp: Date.now(),
                    protected: true // 🔒 受保护标记
                });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            console.log(`[ImageStorage] 🔒 Original image saved successfully to IDB (attempt ${i + 1}/${MAX_RETRIES})`);
            return; // 成功，退出
        } catch (error) {
            console.warn(`[ImageStorage] 🔒 Save retry ${i + 1}/${MAX_RETRIES}:`, error);
            if (i === MAX_RETRIES - 1) {
                // 最后一次失败，至少保存到内存
                console.error('[ImageStorage] 🔒 All retries failed, saving to memory only');
                memoryCache.set(id, dataURL);
                throw error;
            }
            // 等待一小段时间再重试
            await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
        }
    }
}

/**
 * 🔒 获取原图（强制加载，绝对优先级）
 * @param id 图片唯一ID
 * @returns 原图数据URL或Blob URL
 */
export async function getOriginalImage(id: string): Promise<string | null> {
    // 1. 先检查内存缓存
    if (memoryCache.has(id)) {
        const cached = memoryCache.get(id);
        console.log(`[ImageStorage] 🔒 Original found in memory cache: ${id}`);
        return cached;
    }

    // 2. 从IndexedDB加载原图
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        const result: { id: string; blob?: Blob; url?: string; quality?: string } | undefined = await new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!result) {
            console.warn(`[ImageStorage] 🔒 Original not found in IndexedDB: ${id}. Attempting disk recovery...`);

            // 🚀 Fallback: 尝试从本地文件加载 (最后的防线)
            const globalHandle = fileSystemService.getGlobalHandle();
            if (globalHandle) {
                try {
                    const blob = await fileSystemService.loadOriginalFromDisk(globalHandle, id);
                    if (blob) {
                        const blobURL = URL.createObjectURL(blob);
                        // 恢复到内存
                        memoryCache.set(id, blobURL);

                        // 恢复到 IndexedDB (以便下次快速读取)
                        // 将恢复也视为一次 "saveOriginalImage" 的部分流程，确保护航本地优先的逻辑一致性
                        // 注意：这里我们异步恢复，不阻塞返回
                        saveOriginalImage(id, blobURL).catch(e =>
                            console.warn('[ImageStorage] Failed to restore fallback image to DB', e)
                        );

                        console.log(`[ImageStorage] 🔒 Recovered ${id} from local disk fallback`);
                        return blobURL;
                    }
                } catch (e) {
                    console.warn(`[ImageStorage] Failed to load from local disk fallback: ${id}`, e);
                }
            }

            return null;
        }

        // 优先使用Blob
        if (result.blob) {
            if (result.blob.size === 0) {
                console.warn(`[ImageStorage] 🔒 Empty blob detected for original ${id}, treating as missing`);
                return null;
            }
            const blobURL = URL.createObjectURL(result.blob);
            memoryCache.set(id, blobURL);
            console.log(`[ImageStorage] 🔒 Original loaded from IndexedDB (Blob): ${id}`);
            return blobURL;
        }

        // 兼容旧格式（data URL）
        if (result.url) {
            memoryCache.set(id, result.url);
            console.log(`[ImageStorage] 🔒 Original loaded from IndexedDB (data URL): ${id}`);
            return result.url;
        }

        console.warn(`[ImageStorage] 🔒 Original record exists but no data: ${id}`);
        return null;
    } catch (error) {
        console.error('[ImageStorage] 🔒 Failed to get original from IndexedDB:', error);
        return null;
    }
}

/**
 * 🔒 获取所有图片ID列表（用于批量导出）
 * @returns 所有图片ID数组
 */
export async function getAllImageIds(): Promise<string[]> {
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
            const request = store.getAllKeys();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const ids = keys.map(k => k.toString());
        console.log(`[ImageStorage] 🔒 Found ${ids.length} images in IndexedDB`);
        return ids;
    } catch (error) {
        console.error('[ImageStorage] 🔒 Failed to get all image IDs:', error);
        return [];
    }
}

/**
 * 获取图片元数据 (用于同步等)
 */
export async function getImageMetadata(id: string): Promise<{ timestamp?: number; quality?: string; protected?: boolean } | null> {
    try {
        const db = await openDB();
        const transaction = db.transaction(IMAGES_STORE, 'readonly');
        const store = transaction.objectStore(IMAGES_STORE);

        const result: any = await new Promise((resolve, reject) => {
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        if (!result) return null;

        return {
            timestamp: result.timestamp,
            quality: result.quality,
            protected: result.protected
        };
    } catch (error) {
        console.error('[ImageStorage] Failed to get metdata:', error);
        return null;
    }
}

