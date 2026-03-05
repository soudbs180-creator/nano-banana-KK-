/**
 * Storage Adapter - 双模存储适配器
 * 
 * 根据设备能力自动切换数据源：
 * - PC端 (引用模式): 使用FileSystemAccessAPI，直接读取用户硬盘
 * - 手机端 (托管模式): 使用OPFS，将文件复制到浏览器私有文件系统
 */

import {
    isOPFSAvailable,
    saveToOPFS,
    getFromOPFS,
    getOPFSBlobUrl,
    deleteFromOPFS,
    getOPFSUsage,
    importToOPFS,
    compressIfNeeded
} from './opfsService';

import { fileSystemService } from './fileSystemService';

// ============================================
// 设备能力检测
// ============================================

/**
 * 是否支持PC端的FileSystemAccessAPI（选择文件夹）
 */
export const supportsNativeFileSystem = (): boolean => {
    return 'showDirectoryPicker' in window;
};

/**
 * 是否支持OPFS（手机端存储）
 */
export const supportsOPFS = (): boolean => {
    return isOPFSAvailable();
};

/**
 * 获取当前设备的存储模式
 */
export type StorageMode = 'native' | 'opfs' | 'indexeddb';

export const getStorageMode = (): StorageMode => {
    if (supportsNativeFileSystem()) {
        return 'native';
    } else if (supportsOPFS()) {
        return 'opfs';
    } else {
        return 'indexeddb';
    }
};

/**
 * 是否为移动设备
 */
export const isMobileDevice = (): boolean => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// ============================================
// 统一的图片项类型
// ============================================

export interface ImageItem {
    id: string;
    type: StorageMode;

    // 文件句柄（PC端或OPFS）
    handle?: FileSystemFileHandle;

    // 预览URL（缩略图Blob URL）
    previewUrl?: string;

    // 原图URL（仅当加载原图时设置）
    originalUrl?: string;

    // 图片尺寸
    width: number;
    height: number;

    // 画布位置
    x: number;
    y: number;

    // 额外元数据
    mimeType?: string;
    size?: number;
    createdAt?: number;
}

// ============================================
// 统一的导入接口
// ============================================

/**
 * 导入图片（自动适配存储模式）
 * 
 * PC端：返回文件句柄，不复制文件
 * 手机端：写入OPFS，生成缩略图
 */
export async function importImages(
    files: File[],
    options: {
        maxSize?: number;       // 最大尺寸（手机端压缩用）
        thumbnailSize?: number; // 缩略图尺寸
    } = {}
): Promise<ImageItem[]> {
    const mode = getStorageMode();
    const results: ImageItem[] = [];

    for (const file of files) {
        const id = crypto.randomUUID();

        if (mode === 'native') {
            // PC端：不复制文件，直接使用
            // 注意：这里需要用户已经选择了文件夹并授权
            // 实际的句柄保存在CanvasContext中
            const dimensions = await getImageDimensionsFromFile(file);

            results.push({
                id,
                type: 'native',
                width: dimensions.width,
                height: dimensions.height,
                x: 0,
                y: 0,
                mimeType: file.type,
                size: file.size,
                createdAt: Date.now(),
                // 临时创建Blob URL用于预览
                previewUrl: URL.createObjectURL(file)
            });

        } else if (mode === 'opfs') {
            // 手机端：写入OPFS
            try {
                const result = await importToOPFS(file, id, {
                    maxSize: options.maxSize || 4096,
                    thumbnailSize: options.thumbnailSize || 500
                });

                // 获取缩略图URL
                const thumbnailUrl = await getOPFSBlobUrl(id, 'thumbnail');

                results.push({
                    id,
                    type: 'opfs',
                    handle: result.originalHandle,
                    previewUrl: thumbnailUrl || undefined,
                    width: result.width,
                    height: result.height,
                    x: 0,
                    y: 0,
                    mimeType: file.type,
                    size: file.size,
                    createdAt: Date.now()
                });
            } catch (e) {
                console.error(`[StorageAdapter] Failed to import ${file.name} to OPFS`, e);
            }

        } else {
            // IndexedDB回退（旧逻辑）
            const dimensions = await getImageDimensionsFromFile(file);

            results.push({
                id,
                type: 'indexeddb',
                width: dimensions.width,
                height: dimensions.height,
                x: 0,
                y: 0,
                mimeType: file.type,
                size: file.size,
                createdAt: Date.now(),
                previewUrl: URL.createObjectURL(file)
            });
        }
    }

    return results;
}

// ============================================
// 统一的读取接口
// ============================================

/**
 * 获取图片的Blob URL（用于渲染）
 * 
 * @param item - 图片项
 * @param quality - 'preview' 返回缩略图, 'original' 返回原图
 */
export async function getImageUrl(
    item: ImageItem,
    quality: 'preview' | 'original' = 'preview'
): Promise<string | null> {
    if (quality === 'preview' && item.previewUrl) {
        return item.previewUrl;
    }

    if (quality === 'original' && item.originalUrl) {
        return item.originalUrl;
    }

    switch (item.type) {
        case 'native':
            // PC端：从句柄读取
            if (item.handle) {
                try {
                    const file = await item.handle.getFile();
                    return URL.createObjectURL(file);
                } catch (e) {
                    console.error(`[StorageAdapter] Failed to read native file: ${item.id}`, e);
                    return null;
                }
            }
            return null;

        case 'opfs':
            // 手机端：从OPFS读取
            const opfsType = quality === 'original' ? 'image' : 'thumbnail';
            return await getOPFSBlobUrl(item.id, opfsType);

        case 'indexeddb':
            // IndexedDB：通过现有的imageStorage服务
            // 这里需要集成现有的getImage函数
            return item.previewUrl || null;

        default:
            return null;
    }
}

/**
 * 获取图片的原始文件（用于下载/编辑）
 */
export async function getImageFile(item: ImageItem): Promise<File | Blob | null> {
    switch (item.type) {
        case 'native':
            if (item.handle) {
                try {
                    return await item.handle.getFile();
                } catch (e) {
                    console.error(`[StorageAdapter] Failed to read native file: ${item.id}`, e);
                    return null;
                }
            }
            return null;

        case 'opfs':
            return await getFromOPFS(item.id, 'image');

        case 'indexeddb':
            // 需要通过现有的imageStorage获取
            return null;

        default:
            return null;
    }
}

// ============================================
// 统一的删除接口
// ============================================

/**
 * 删除图片
 */
export async function deleteImage(item: ImageItem): Promise<boolean> {
    // 释放Blob URL
    if (item.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
    }
    if (item.originalUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.originalUrl);
    }

    // 🚀 [关键修复] 强制尝试从物理磁盘删除文件（防止被刷新死灰复燃）
    const globalHandle = fileSystemService.getGlobalHandle();
    if (globalHandle) {
        await fileSystemService.deleteImageFromHandle(globalHandle, item.id);
    }

    switch (item.type) {
        case 'native':
            // PC端：原来不需要删除实际文件，现在上面已全局删除
            return true;

        case 'opfs':
            // 手机端：删除OPFS中的文件
            const deletedOriginal = await deleteFromOPFS(item.id, 'image');
            const deletedThumbnail = await deleteFromOPFS(item.id, 'thumbnail');
            return deletedOriginal || deletedThumbnail;

        case 'indexeddb':
            // 需要通过现有的imageStorage删除
            return true;

        default:
            return false;
    }
}

// ============================================
// 存储统计
// ============================================

export interface StorageStats {
    mode: StorageMode;
    opfsUsage: number;       // OPFS使用量（字节）
    indexeddbUsage: number;  // IndexedDB使用量（字节）
    imageCount: number;      // 图片数量
}

export async function getStorageStats(): Promise<StorageStats> {
    const mode = getStorageMode();
    let opfsUsage = 0;
    let indexeddbUsage = 0;

    if (mode === 'opfs' || supportsOPFS()) {
        try {
            opfsUsage = await getOPFSUsage();
        } catch {
            // OPFS不可用
        }
    }

    // IndexedDB使用量通过现有的getStorageUsage获取
    // 这里暂时返回0，后续集成

    return {
        mode,
        opfsUsage,
        indexeddbUsage,
        imageCount: 0 // 需要集成实际计数
    };
}

// ============================================
// 辅助函数
// ============================================

async function getImageDimensionsFromFile(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.width, height: img.height });
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            // 默认尺寸
            resolve({ width: 1024, height: 1024 });
        };

        img.src = url;
    });
}

// ============================================
// 生成图片保存（AI生成结果）
// ============================================

/**
 * 保存AI生成的图片
 * 统一接口，根据设备模式自动选择存储方式
 */
export async function saveGeneratedImage(
    base64OrBlob: string | Blob,
    id: string,
    options: {
        generateThumbnail?: boolean;
        thumbnailSize?: number;
    } = {}
): Promise<{
    success: boolean;
    previewUrl?: string;
    originalUrl?: string;
}> {
    const mode = getStorageMode();
    const { generateThumbnail = true, thumbnailSize = 500 } = options;

    // 转换Base64为Blob
    let blob: Blob;
    if (typeof base64OrBlob === 'string') {
        const match = base64OrBlob.match(/^data:(.+);base64,(.+)$/);
        if (match) {
            try {
                const byteString = atob(match[2]); // ⚠️ 可能抛出InvalidCharacterError
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                blob = new Blob([ab], { type: match[1] });
            } catch (error: any) {
                console.error('[StorageAdapter] atob failed:', error.message);
                // 🚀 [关键修复] 返回失败而不是崩溃
                return { success: false };
            }
        } else {
            console.error('[StorageAdapter] Invalid base64 format');
            return { success: false };
        }
    } else {
        blob = base64OrBlob;
    }

    if (mode === 'opfs') {
        try {
            // 保存原图
            await saveToOPFS(blob, id, 'image');

            // 生成并保存缩略图
            if (generateThumbnail) {
                const thumbnailBlob = await generateThumbnailBlob(blob, thumbnailSize);
                await saveToOPFS(thumbnailBlob, id, 'thumbnail');
            }

            // 获取URL
            const previewUrl = await getOPFSBlobUrl(id, 'thumbnail') || await getOPFSBlobUrl(id, 'image');

            return {
                success: true,
                previewUrl: previewUrl || undefined
            };
        } catch (e) {
            console.error('[StorageAdapter] Failed to save to OPFS', e);
            return { success: false };
        }

    } else {
        // PC端或IndexedDB：返回Blob URL
        const url = URL.createObjectURL(blob);
        return {
            success: true,
            previewUrl: url,
            originalUrl: url
        };
    }
}

// 生成缩略图Blob
async function generateThumbnailBlob(blob: Blob, maxSize: number): Promise<Blob> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);

            const { width, height } = img;
            const scale = Math.min(maxSize / width, maxSize / height, 1);
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);

            const canvas = document.createElement('canvas');
            canvas.width = newWidth;
            canvas.height = newHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            canvas.toBlob(result => resolve(result!), 'image/webp', 0.7);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(blob);
        };

        img.src = url;
    });
}
