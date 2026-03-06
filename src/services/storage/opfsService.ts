/**
 * OPFS Service - 浏览器私有文档系统服务
 * 
 * Origin Private File System (OPFS) 是现代浏览器提供的高性能虚拟文档系统
 * iOS 15.2+, Chrome 86+, Firefox 111+ 支持
 * 
 * 用途：手机端图片存储，替代FileSystemAccessAPI（手机不支持）
 */

// 检测OPFS是否可用
export const isOPFSAvailable = (): boolean => {
    return 'storage' in navigator && 'getDirectory' in navigator.storage;
};

// 获取OPFS根目录
async function getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
    if (!isOPFSAvailable()) {
        throw new Error('OPFS not available in this browser');
    }
    return await navigator.storage.getDirectory();
}

// 获取或创建子目录
async function getOrCreateDirectory(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
    return await parent.getDirectoryHandle(name, { create: true });
}

/**
 * 图片目录结构:
 * /opfs-root/
 *   /images/           - 原图
 *   /thumbnails/       - 缩略图
 *   /videos/           - 视频
 */

// 获取图片目录
async function getImagesDir(): Promise<FileSystemDirectoryHandle> {
    const root = await getOPFSRoot();
    return await getOrCreateDirectory(root, 'images');
}

// 获取缩略图目录
async function getThumbnailsDir(): Promise<FileSystemDirectoryHandle> {
    const root = await getOPFSRoot();
    return await getOrCreateDirectory(root, 'thumbnails');
}

// 获取视频目录
async function getVideosDir(): Promise<FileSystemDirectoryHandle> {
    const root = await getOPFSRoot();
    return await getOrCreateDirectory(root, 'videos');
}

/**
 * 流式写入文档到OPFS
 * 关键：不占用大量内存，适合手机端
 */
export async function saveToOPFS(
    file: File | Blob,
    id: string,
    type: 'image' | 'thumbnail' | 'video' = 'image'
): Promise<{ id: string; handle: FileSystemFileHandle }> {
    const dir = type === 'image' ? await getImagesDir()
        : type === 'thumbnail' ? await getThumbnailsDir()
            : await getVideosDir();

    // 确定文档扩展名
    let ext = 'png';
    if (file instanceof File) {
        const match = file.name.match(/\.(\w+)$/);
        if (match) ext = match[1];
    } else if (file.type) {
        const mimeMap: Record<string, string> = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/webp': 'webp',
            'image/gif': 'gif',
            'video/mp4': 'mp4',
            'video/webm': 'webm'
        };
        ext = mimeMap[file.type] || 'png';
    }

    const fileName = `${id}.${ext}`;

    // 创建文档
    const fileHandle = await dir.getFileHandle(fileName, { create: true });

    // 流式写入（关键：不占用大量内存）
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    console.log(`[OPFS] ✅ Saved ${type}: ${fileName} (${(file.size / 1024).toFixed(1)}KB)`);

    return { id, handle: fileHandle };
}

/**
 * 从OPFS读取文档
 */
export async function getFromOPFS(
    id: string,
    type: 'image' | 'thumbnail' | 'video' = 'image'
): Promise<File | null> {
    try {
        const dir = type === 'image' ? await getImagesDir()
            : type === 'thumbnail' ? await getThumbnailsDir()
                : await getVideosDir();

        // 尝试不同扩展名
        const extensions = type === 'video' ? ['mp4', 'webm'] : ['png', 'jpg', 'jpeg', 'webp', 'gif'];

        for (const ext of extensions) {
            try {
                const fileHandle = await dir.getFileHandle(`${id}.${ext}`);
                return await fileHandle.getFile();
            } catch {
                // 文档不存在，尝试下一个扩展名
            }
        }

        return null;
    } catch (e) {
        console.error(`[OPFS] Failed to get ${type}: ${id}`, e);
        return null;
    }
}

/**
 * 创建Blob URL用于渲染
 */
export async function getOPFSBlobUrl(
    id: string,
    type: 'image' | 'thumbnail' | 'video' = 'image'
): Promise<string | null> {
    const file = await getFromOPFS(id, type);
    if (!file) return null;
    return URL.createObjectURL(file);
}

/**
 * 删除OPFS中的文档
 */
export async function deleteFromOPFS(
    id: string,
    type: 'image' | 'thumbnail' | 'video' = 'image'
): Promise<boolean> {
    try {
        const dir = type === 'image' ? await getImagesDir()
            : type === 'thumbnail' ? await getThumbnailsDir()
                : await getVideosDir();

        const extensions = type === 'video' ? ['mp4', 'webm'] : ['png', 'jpg', 'jpeg', 'webp', 'gif'];

        for (const ext of extensions) {
            try {
                await dir.removeEntry(`${id}.${ext}`);
                console.log(`[OPFS] 🗑️ Deleted ${type}: ${id}.${ext}`);
                return true;
            } catch {
                // 文档不存在，尝试下一个扩展名
            }
        }

        return false;
    } catch (e) {
        console.error(`[OPFS] Failed to delete ${type}: ${id}`, e);
        return false;
    }
}

/**
 * 列出OPFS中的所有文档
 */
export async function listOPFS(type: 'image' | 'thumbnail' | 'video' = 'image'): Promise<string[]> {
    try {
        const dir = type === 'image' ? await getImagesDir()
            : type === 'thumbnail' ? await getThumbnailsDir()
                : await getVideosDir();

        const files: string[] = [];
        // @ts-ignore - values() may not be in types
        for await (const entry of dir.values()) {
            if (entry.kind === 'file') {
                // 去掉扩展名得到ID
                const id = entry.name.replace(/\.\w+$/, '');
                files.push(id);
            }
        }

        return files;
    } catch (e) {
        console.error(`[OPFS] Failed to list ${type}s`, e);
        return [];
    }
}

/**
 * 获取OPFS使用量（字节）
 */
export async function getOPFSUsage(): Promise<number> {
    try {
        let totalSize = 0;

        for (const type of ['image', 'thumbnail', 'video'] as const) {
            const dir = type === 'image' ? await getImagesDir()
                : type === 'thumbnail' ? await getThumbnailsDir()
                    : await getVideosDir();

            // @ts-ignore
            for await (const entry of dir.values()) {
                if (entry.kind === 'file') {
                    try {
                        const file = await entry.getFile();
                        totalSize += file.size;
                    } catch {
                        // 忽略无法读取的文档
                    }
                }
            }
        }

        return totalSize;
    } catch (e) {
        console.error('[OPFS] Failed to get usage', e);
        return 0;
    }
}

/**
 * 清空OPFS中的所有文档
 */
export async function clearOPFS(): Promise<void> {
    try {
        const root = await getOPFSRoot();

        for (const dirName of ['images', 'thumbnails', 'videos']) {
            try {
                await root.removeEntry(dirName, { recursive: true });
            } catch {
                // 目录不存在
            }
        }

        console.log('[OPFS] 🧹 Cleared all files');
    } catch (e) {
        console.error('[OPFS] Failed to clear', e);
    }
}

/**
 * 检查并压缩过大的图片（防止手机内存崩溃）
 * 如果宽/高 > maxSize，压缩到maxSize
 */
export async function compressIfNeeded(
    file: File | Blob,
    maxSize: number = 2048
): Promise<Blob> {
    return new Promise(async (resolve) => {
        // 创建Image读取尺寸
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);

            const { width, height } = img;

            // 如果尺寸在限制内，直接返回
            if (width <= maxSize && height <= maxSize) {
                resolve(file);
                return;
            }

            // 计算缩放比例
            const scale = Math.min(maxSize / width, maxSize / height);
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);

            // 使用OffscreenCanvas压缩（如果支持）
            if (typeof OffscreenCanvas !== 'undefined') {
                const canvas = new OffscreenCanvas(newWidth, newHeight);
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                canvas.convertToBlob({ type: 'image/webp', quality: 0.85 }).then(blob => {
                    console.log(`[OPFS] 📐 Compressed ${width}x${height} -> ${newWidth}x${newHeight}`);
                    resolve(blob);
                });
            } else {
                // 回退到普通Canvas
                const canvas = document.createElement('canvas');
                canvas.width = newWidth;
                canvas.height = newHeight;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                canvas.toBlob(blob => {
                    console.log(`[OPFS] 📐 Compressed ${width}x${height} -> ${newWidth}x${newHeight}`);
                    resolve(blob!);
                }, 'image/webp', 0.85);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file); // 加载失败，返回原文档
        };

        img.src = url;
    });
}

/**
 * 导入图片到OPFS（手机端完整流程）
 * 1. 检查尺寸，必要时压缩
 * 2. 保存原图/压缩图
 * 3. 生成并保存缩略图
 */
export async function importToOPFS(
    file: File,
    id: string,
    options: {
        maxSize?: number;
        thumbnailSize?: number;
    } = {}
): Promise<{
    id: string;
    originalHandle: FileSystemFileHandle;
    thumbnailHandle: FileSystemFileHandle;
    width: number;
    height: number;
}> {
    const { maxSize = 4096, thumbnailSize = 500 } = options;

    // 1. 压缩过大的图片
    const compressedBlob = await compressIfNeeded(file, maxSize);

    // 2. 获取图片尺寸
    const dimensions = await getImageDimensions(compressedBlob);

    // 3. 保存原图
    const { handle: originalHandle } = await saveToOPFS(compressedBlob, id, 'image');

    // 4. 生成缩略图
    const thumbnailBlob = await generateThumbnail(compressedBlob, thumbnailSize);
    const { handle: thumbnailHandle } = await saveToOPFS(thumbnailBlob, id, 'thumbnail');

    return {
        id,
        originalHandle,
        thumbnailHandle,
        width: dimensions.width,
        height: dimensions.height
    };
}

// 辅助函数：获取图片尺寸
async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.width, height: img.height });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };
        img.src = url;
    });
}

// 辅助函数：生成缩略图
async function generateThumbnail(blob: Blob, maxSize: number): Promise<Blob> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);

            const { width, height } = img;
            const scale = Math.min(maxSize / width, maxSize / height, 1);
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);

            if (typeof OffscreenCanvas !== 'undefined') {
                const canvas = new OffscreenCanvas(newWidth, newHeight);
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                canvas.convertToBlob({ type: 'image/webp', quality: 0.7 }).then(resolve);
            } else {
                const canvas = document.createElement('canvas');
                canvas.width = newWidth;
                canvas.height = newHeight;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                canvas.toBlob(blob => resolve(blob!), 'image/webp', 0.7);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(blob); // 失败时返回原图
        };

        img.src = url;
    });
}
