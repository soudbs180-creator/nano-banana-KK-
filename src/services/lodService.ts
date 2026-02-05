/**
 * LOD (Level of Detail) Service
 * 
 * 根据缩放级别和视口位置动态加载不同质量的图片
 * 优化内存使用和渲染性能
 */

import { ImageQuality, getQualityStorageId, QUALITY_CONFIGS } from '../services/imageQuality';
import { getImage, getImageByQuality } from '../services/imageStorage';
import { registerBlobUrl, touchBlobUrl, releaseBlobUrl } from '../services/memoryManager';

// LOD级别定义
export enum LODLevel {
    MICRO = 'micro',      // 极小缩略图 (<30% zoom)
    THUMBNAIL = 'thumb',  // 缩略图 (30-80% zoom)
    PREVIEW = 'preview',  // 预览 (80-150% zoom)
    ORIGINAL = 'original' // 原图 (>150% zoom)
}

// 缩放阈值
const ZOOM_THRESHOLDS = {
    MICRO: 0.3,      // < 30%
    THUMBNAIL: 0.8,  // 30-80%
    PREVIEW: 1.5,    // 80-150%
    // > 150% = ORIGINAL
};

// 缓存的LOD状态
interface LODState {
    currentLevel: LODLevel;
    url: string | null;
    loading: boolean;
    lastZoom: number;
}

const lodStates = new Map<string, LODState>();

/**
 * 根据缩放级别获取LOD等级
 */
export function getLODLevel(zoomScale: number): LODLevel {
    if (zoomScale < ZOOM_THRESHOLDS.MICRO) return LODLevel.MICRO;
    if (zoomScale < ZOOM_THRESHOLDS.THUMBNAIL) return LODLevel.THUMBNAIL;
    if (zoomScale < ZOOM_THRESHOLDS.PREVIEW) return LODLevel.PREVIEW;
    return LODLevel.ORIGINAL;
}

/**
 * 将LOD级别映射到ImageQuality
 */
function lodToQuality(level: LODLevel): ImageQuality {
    switch (level) {
        case LODLevel.MICRO: return ImageQuality.MICRO;
        case LODLevel.THUMBNAIL: return ImageQuality.PREVIEW; // 复用PREVIEW质量
        case LODLevel.PREVIEW: return ImageQuality.PREVIEW;
        case LODLevel.ORIGINAL: return ImageQuality.ORIGINAL;
    }
}

/**
 * 获取图片的适当LOD URL
 * 
 * @param imageId - 图片ID
 * @param zoomScale - 当前缩放比例
 * @param fallbackUrl - 默认/回退URL
 * @returns LOD URL或null
 */
export async function getLODUrl(
    imageId: string,
    zoomScale: number,
    fallbackUrl?: string
): Promise<string | null> {
    const targetLevel = getLODLevel(zoomScale);
    const state = lodStates.get(imageId);

    // 如果已有相同级别的缓存，直接返回
    if (state && state.currentLevel === targetLevel && state.url) {
        touchBlobUrl(imageId);
        return state.url;
    }

    // 检查是否是微小的缩放变化（防抖）
    if (state && Math.abs(state.lastZoom - zoomScale) < 0.05) {
        return state.url;
    }

    // 如果正在加载，返回当前URL
    if (state?.loading) {
        return state.url || fallbackUrl || null;
    }

    // 开始加载新的LOD级别
    const newState: LODState = {
        currentLevel: targetLevel,
        url: state?.url || fallbackUrl || null,
        loading: true,
        lastZoom: zoomScale
    };
    lodStates.set(imageId, newState);

    try {
        // 尝试从存储加载
        const quality = lodToQuality(targetLevel);
        const storageId = imageId; // 或使用getQualityStorageId

        let imageData: string | null = null;

        // 先尝试从IndexedDB加载指定质量
        if (targetLevel === LODLevel.ORIGINAL) {
            // 原图：尝试多个来源
            imageData = await getImageByQuality(storageId, ImageQuality.ORIGINAL);

            if (!imageData) {
                // 尝试从OPFS加载
                const { isOPFSAvailable, getOPFSBlobUrl } = await import('../services/opfsService');
                if (isOPFSAvailable()) {
                    const opfsUrl = await getOPFSBlobUrl(storageId, 'image');
                    if (opfsUrl) {
                        newState.url = opfsUrl;
                        newState.loading = false;
                        registerBlobUrl(imageId, opfsUrl, { priority: 'high' });
                        return opfsUrl;
                    }
                }

                // 尝试从本地磁盘加载
                const { getLocalFolderHandle } = await import('../services/storagePreference');
                const handle = await getLocalFolderHandle();
                if (handle) {
                    const { fileSystemService } = await import('../services/fileSystemService');
                    const blob = await fileSystemService.loadOriginalFromDisk(handle, storageId);
                    if (blob) {
                        const blobUrl = URL.createObjectURL(blob);
                        newState.url = blobUrl;
                        newState.loading = false;
                        registerBlobUrl(imageId, blobUrl, {
                            size: blob.size,
                            priority: 'high'
                        });
                        return blobUrl;
                    }
                }
            }
        } else {
            // 缩略图/预览：从IndexedDB加载
            const qualityId = targetLevel === LODLevel.MICRO
                ? getQualityStorageId(storageId, ImageQuality.MICRO)
                : getQualityStorageId(storageId, ImageQuality.PREVIEW);

            imageData = await getImage(qualityId);
        }

        if (imageData) {
            // 如果是base64，转换为blob URL以节省内存
            if (imageData.startsWith('data:')) {
                const blob = await fetch(imageData).then(r => r.blob());
                const blobUrl = URL.createObjectURL(blob);

                // 释放旧的blob URL
                if (state?.url?.startsWith('blob:')) {
                    releaseBlobUrl(imageId);
                }

                newState.url = blobUrl;
                registerBlobUrl(imageId, blobUrl, {
                    size: blob.size,
                    priority: targetLevel === LODLevel.ORIGINAL ? 'high' : 'normal'
                });
            } else {
                newState.url = imageData;
            }
        }

        newState.loading = false;
        return newState.url || fallbackUrl || null;

    } catch (e) {
        console.error(`[LOD] Failed to load ${targetLevel} for ${imageId}:`, e);
        newState.loading = false;
        return newState.url || fallbackUrl || null;
    }
}

/**
 * 清除图片的LOD缓存
 */
export function clearLODCache(imageId: string): void {
    const state = lodStates.get(imageId);
    if (state?.url?.startsWith('blob:')) {
        releaseBlobUrl(imageId);
    }
    lodStates.delete(imageId);
}

/**
 * 清除所有LOD缓存
 */
export function clearAllLODCache(): void {
    for (const [imageId, state] of lodStates) {
        if (state.url?.startsWith('blob:')) {
            releaseBlobUrl(imageId);
        }
    }
    lodStates.clear();
    console.log('[LOD] Cleared all LOD cache');
}

/**
 * 预加载图片的LOD
 */
export async function preloadLOD(
    imageId: string,
    level: LODLevel,
    fallbackUrl?: string
): Promise<void> {
    const zoomForLevel = {
        [LODLevel.MICRO]: 0.2,
        [LODLevel.THUMBNAIL]: 0.5,
        [LODLevel.PREVIEW]: 1.0,
        [LODLevel.ORIGINAL]: 2.0
    };

    await getLODUrl(imageId, zoomForLevel[level], fallbackUrl);
}

/**
 * 批量更新可见图片的LOD
 */
export async function updateVisibleLODs(
    visibleImages: Array<{ id: string; zoom: number; fallbackUrl?: string }>,
    options: { concurrency?: number } = {}
): Promise<void> {
    const { concurrency = 3 } = options;

    // 分批处理
    for (let i = 0; i < visibleImages.length; i += concurrency) {
        const batch = visibleImages.slice(i, i + concurrency);
        await Promise.all(
            batch.map(({ id, zoom, fallbackUrl }) => getLODUrl(id, zoom, fallbackUrl))
        );
    }
}

/**
 * 获取LOD统计信息
 */
export function getLODStats(): {
    totalCached: number;
    byLevel: Record<LODLevel, number>;
    loading: number;
} {
    const byLevel: Record<LODLevel, number> = {
        [LODLevel.MICRO]: 0,
        [LODLevel.THUMBNAIL]: 0,
        [LODLevel.PREVIEW]: 0,
        [LODLevel.ORIGINAL]: 0
    };

    let loading = 0;

    for (const state of lodStates.values()) {
        byLevel[state.currentLevel]++;
        if (state.loading) loading++;
    }

    return {
        totalCached: lodStates.size,
        byLevel,
        loading
    };
}
