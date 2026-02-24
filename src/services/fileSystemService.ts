import { Canvas } from '../types';
import { logError, logInfo, logWarning } from './systemLogService';

/**
 * Service to handle Local File System Access API
 * Allows saving/loading project data directly to a user-selected directory.
 */

const PROJECT_FILE = 'project.json';
const DIRS = {
    // 🚀 新目录结构
    PICTURE: 'picture',           // 图片文件
    VIDEO: 'video',               // 视频文件
    REFS: 'refs',                 // 参考图压缩备份
    SETTINGS: 'settings',         // 布局和设置信息
    TAGS: 'tags',                 // 标签快捷链接子目录名
    // 兼容旧目录
    ORIGINALS: 'originals',       // 旧版原图目录（向后兼容）
    THUMBNAILS: 'thumbnails',
    CACHE: 'cache',
    LEGACY: 'images'
};

// 🚀 全局句柄（单例），用于跨服务访问（如自动备份）
let globalHandle: FileSystemDirectoryHandle | null = null;

export interface FileSystemState {
    handle: FileSystemDirectoryHandle | null;
    isConnected: boolean;
    folderName: string;
}

export const fileSystemService = {
    /**
     * 设置全局句柄 (供自动备份使用)
     */
    setGlobalHandle(handle: FileSystemDirectoryHandle | null) {
        globalHandle = handle;
        if (handle) {
            logInfo('FileSystem', 'Global handle set', handle.name);
        } else {
            logInfo('FileSystem', 'Global handle cleared');
        }
    },

    /**
     * 获取全局句柄
     */
    getGlobalHandle(): FileSystemDirectoryHandle | null {
        return globalHandle;
    },

    /**
     * Request user to select a directory
     */
    async selectDirectory(): Promise<FileSystemDirectoryHandle> {
        // @ts-ignore - File System Access API types might be missing in some envs
        const handle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });
        logInfo('FileSystem', `用户选择了文件夹`, `directory: ${handle.name}`);
        return handle;
    },

    /**
     * Verify we have permission to read/write
     */
    async verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
        // @ts-ignore
        const options = { mode: 'readwrite' };
        // @ts-ignore
        if ((await handle.queryPermission(options)) === 'granted') {
            return true;
        }
        // @ts-ignore
        if ((await handle.requestPermission(options)) === 'granted') {
            return true;
        }
        return false;
    },

    /**
     * Save the entire project state and new images
     */
    async saveProject(
        handle: FileSystemDirectoryHandle,
        state: { canvases: Canvas[] },
        imagesToSave: Map<string, Blob>
    ): Promise<void> {
        // 1. Ensure directories exist
        // @ts-ignore
        const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS, { create: true });

        // 2. Save Images (Originals Only)
        for (const [id, blob] of imagesToSave.entries()) {
            const filename = `${id}.png`;

            // A. Save Original
            try {
                // Check if file exists to prevent overwriting high-res with low-res
                let shouldWrite = true;
                try {
                    // @ts-ignore
                    const existingHandle = await originalsDir.getFileHandle(filename);
                    // @ts-ignore
                    const existingFile = await existingHandle.getFile();
                    // Safety check: Don't overwrite if existing file is significantly larger
                    if (existingFile.size > blob.size * 1.5) {
                        console.warn(`[FileSystem] Preventing overwrite of ${id}: Existing (${existingFile.size}) > New (${blob.size})`);
                        shouldWrite = false;
                    }
                } catch (e) {
                    // File doesn't exist, safe to write
                }

                if (shouldWrite) {
                    // @ts-ignore
                    const fileHandle = await originalsDir.getFileHandle(filename, { create: true });
                    // @ts-ignore
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                }
            } catch (err) {
                logError('FileSystem', err, `保存图片失败: ${id}`);
            }
        }

        // 3. Save Project JSON (Clean state without base64)
        // @ts-ignore
        const projectFile = await handle.getFileHandle(PROJECT_FILE, { create: true });
        // @ts-ignore
        const writable = await projectFile.createWritable();
        await writable.write(JSON.stringify(state, null, 2));
        await writable.close();
    },


    /**
     * Load project from directory with Thumbnail Generation
     */
    async loadProjectWithThumbs(handle: FileSystemDirectoryHandle): Promise<{ canvases: Canvas[], images: Map<string, { url: string, originalUrl?: string, filename?: string }>, activeCanvasId: string | null }> {
        // 🚀 自动注册全局句柄，开启自动备份
        this.setGlobalHandle(handle);

        const images = new Map<string, { url: string, originalUrl?: string, filename?: string }>();
        let canvases: Canvas[] = [];
        let activeCanvasId: string | null = null;  // 🚀 记录上次活动的项目

        logInfo('FileSystem', `正在加载项目`, `folder: ${handle.name}`);

        // CLEANUP: Remove thumbnails folder if exists (User request)
        try {
            // @ts-ignore
            await handle.removeEntry(DIRS.THUMBNAILS, { recursive: true });
            logInfo('FileSystem', '已清理缩略图目录', 'thumbnails dir removed');
        } catch (err) {
            // 清理缩略图目录失败，可能是目录不存在
            console.debug('[FileSystem] Thumbnails cleanup skipped:', err);
        }

        // 1. Load Project JSON
        try {
            // @ts-ignore
            const projectHandle = await handle.getFileHandle(PROJECT_FILE);
            // @ts-ignore
            const file = await projectHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            canvases = data.canvases || [];
            activeCanvasId = data.activeCanvasId || null;  // 🚀 恢复上次活动的项目
            logInfo('FileSystem', `已加载项目配置`, `${canvases.length} 个画布, activeCanvasId: ${activeCanvasId}`);
        } catch (e) {
            logInfo('FileSystem', '暂无项目文件，将创建新项目', 'project.json not found');
        }

        // 2. Load All Images & Generate Thumbs if needed
        // 2. Load All Images & Generate Thumbs if needed
        // Initialize images map with filename support


        // Helper to scan a directory
        const scanDirectory = async (dirName: string) => {
            try {
                // @ts-ignore
                const dirHandle = await handle.getDirectoryHandle(dirName);
                // @ts-ignore
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'file' && /\.(png|jpg|webp|mp4|webm|mov)$/i.test(entry.name)) {
                        let id = entry.name.substring(0, entry.name.lastIndexOf('.'));

                        // Handle YYYYMM_{id} format
                        if (/^\d{6}_/.test(id)) {
                            id = id.substring(7); // Remove YYYYMM_ prefix
                        }

                        try {
                            // @ts-ignore
                            const file = await entry.getFile();
                            const url = URL.createObjectURL(file);

                            // Prevent overwriting if already loaded (e.g. from priority folder)
                            if (!images.has(id)) {
                                images.set(id, { url, originalUrl: url, filename: entry.name });
                            }
                        } catch (e) {
                            // ignore read error
                        }
                    }
                }
            } catch (e) {
                // directory not found, ignore
            }
        };

        // Scan directories in priority order: Picture -> Video -> Originals(Legacy) -> Legacy
        await scanDirectory(DIRS.PICTURE);
        await scanDirectory(DIRS.VIDEO);
        await scanDirectory(DIRS.ORIGINALS);
        await scanDirectory(DIRS.LEGACY);

        logInfo('FileSystem', `已加载 ${images.size} 个媒体文件`, 'scan complete');


        return { canvases, images, activeCanvasId };
    },
    /**
     * Get usage of images folder in bytes (Recursive)
     */
    async getFolderUsage(handle: FileSystemDirectoryHandle): Promise<{ size: number, count: number }> {
        let totalSize = 0;
        let fileCount = 0;

        const processHandle = async (currentHandle: FileSystemDirectoryHandle, depth: number) => {
            if (depth > 3) return; // Limit depth to avoid performance issues

            try {
                // @ts-ignore
                for await (const entry of currentHandle.values()) {
                    if (entry.kind === 'file') {
                        try {
                            // @ts-ignore
                            const file = await entry.getFile();
                            totalSize += file.size;
                            fileCount++;
                        } catch (e) {
                            // Ignore file read error
                        }
                    } else if (entry.kind === 'directory') {
                        // Exclude hidden or system folders if needed?
                        if (!entry.name.startsWith('.')) {
                            // @ts-ignore
                            const subHandle = await currentHandle.getDirectoryHandle(entry.name);
                            await processHandle(subHandle, depth + 1);
                        }
                    }
                }
            } catch (e) {
                console.warn(`Failed to read directory at depth ${depth}`, e);
            }
        };

        await processHandle(handle, 0);

        logInfo('FileSystem', `已计算文件夹大小`, `${fileCount} 个文件, ${totalSize} 字节`);
        return { size: totalSize, count: fileCount };
    },

    /**
     * Load a single original image from disk by ID
     */
    async loadOriginalFromDisk(handle: FileSystemDirectoryHandle, id: string): Promise<Blob | null> {
        try {
            // 1. 先尝试在 picture/ 和 video/ 目录下搜索 (新架构)
            const mediaDirs = [DIRS.PICTURE, DIRS.VIDEO];
            for (const dirName of mediaDirs) {
                try {
                    // @ts-ignore
                    const dirHandle = await handle.getDirectoryHandle(dirName);
                    // 由于新架构下文件名包含日期前缀 (YYYYMM_{id}.ext)，我们需要遍历或精准匹配
                    // 这里我们尝试通过遍历匹配包含 id 的文件
                    // @ts-ignore
                    for await (const entry of dirHandle.values()) {
                        if (entry.kind === 'file' && entry.name.includes(id)) {
                            // @ts-ignore
                            return await entry.getFile();
                        }
                    }
                } catch (e) {
                    // 目录不存在或读取失败
                }
            }

            // 2. 尝试旧版的 originals/ 目录
            try {
                // @ts-ignore
                const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS);
                // @ts-ignore
                const fileHandle = await originalsDir.getFileHandle(`${id}.png`);
                // @ts-ignore
                return await fileHandle.getFile();
            } catch (e) {
                // Not in originals
            }

            // 3. 尝试 legacy (images 根目录)
            try {
                // @ts-ignore
                const legacyDir = await handle.getDirectoryHandle(DIRS.LEGACY);
                // @ts-ignore
                const fileHandle = await legacyDir.getFileHandle(`${id}.png`);
                // @ts-ignore
                return await fileHandle.getFile();
            } catch (e) {
                // Not found
            }

            return null;
        } catch (e) {
            console.error('Failed to load original from disk', e);
            return null;
        }
    },

    /**
     * Cleanup local folder: Just remove thumbnails
     */
    async cleanupLocalFolder(handle: FileSystemDirectoryHandle): Promise<{ count: number, savedBytes: number }> {
        // Cleanup: Just ensure thumbnails dir is gone
        try {
            // @ts-ignore
            await handle.removeEntry(DIRS.THUMBNAILS, { recursive: true });
        } catch (e) { }
        return { count: 0, savedBytes: 0 };
    },

    /**
     * Move project data from one folder to another (Cut & Paste)
     */
    async moveProject(sourceHandle: FileSystemDirectoryHandle, targetHandle: FileSystemDirectoryHandle): Promise<void> {
        try {
            // 1. Move Project JSON
            try {
                // @ts-ignore
                const projectFile = await sourceHandle.getFileHandle(PROJECT_FILE);
                // @ts-ignore
                const file = await projectFile.getFile();
                const content = await file.text();

                // Write to new
                // @ts-ignore
                const newProjectFile = await targetHandle.getFileHandle(PROJECT_FILE, { create: true });
                // @ts-ignore
                const writable = await newProjectFile.createWritable();
                await writable.write(content);
                await writable.close();

                // Delete old
                // @ts-ignore
                await sourceHandle.removeEntry(PROJECT_FILE);
            } catch (e) {
                console.warn('Project JSON not found or failed to move', e);
            }

            // 2. Move Folders (Originals only, Thumbs are dead)
            // Helper to move a directory
            const moveDir = async (dirName: string) => {
                try {
                    // @ts-ignore
                    const sourceDir = await sourceHandle.getDirectoryHandle(dirName);
                    // @ts-ignore
                    const targetDir = await targetHandle.getDirectoryHandle(dirName, { create: true });

                    // @ts-ignore
                    for await (const entry of sourceDir.values()) {
                        if (entry.kind === 'file') {
                            // @ts-ignore
                            const file = await entry.getFile();
                            // @ts-ignore
                            const newFileHandle = await targetDir.getFileHandle(entry.name, { create: true });
                            // @ts-ignore
                            const writable = await newFileHandle.createWritable();
                            await writable.write(file);
                            await writable.close();

                            // Delete legacy file
                            // @ts-ignore
                            await sourceDir.removeEntry(entry.name);
                        }
                    }
                    // Finally remove source dir
                    // @ts-ignore
                    await sourceHandle.removeEntry(dirName);
                } catch (e) {
                    // Dir might not exist
                }
            };

            await moveDir(DIRS.ORIGINALS);
            await moveDir(DIRS.LEGACY); // Move legacy images if present too
            // Note: We intentionally DO NOT move thumbnails.

        } catch (error) {
            console.error('Failed to move project:', error);
            throw new Error('Migration failed: ' + (error as any).message);
        }
    },

    /**
     * 🚀 Save a single image/video to the appropriate directory
     * New format: YYYYMM_{storageId}.{ext} in picture/ or video/
     * @param isVideo - true for video files, false for images
     */
    async saveImageToHandle(handle: FileSystemDirectoryHandle, id: string, blob: Blob, isVideo: boolean = false): Promise<string> {
        try {
            // 确定目标目录
            const targetDirName = isVideo ? DIRS.VIDEO : DIRS.PICTURE;
            // @ts-ignore
            const targetDir = await handle.getDirectoryHandle(targetDirName, { create: true });

            // 生成新格式文件名: YYYYMM_{id}.{ext}
            const now = new Date();
            const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
            const ext = isVideo ? 'mp4' : 'png';
            const newFilename = `${datePrefix}_${id}.${ext}`;

            // 检查是否已存在（去重）
            try {
                // @ts-ignore
                await targetDir.getFileHandle(newFilename);
                // 已存在，跳过保存
                return newFilename;
            } catch {
                // 不存在，继续保存
            }

            // @ts-ignore
            const fileHandle = await targetDir.getFileHandle(newFilename, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            logInfo('FileSystem', `已保存${isVideo ? '视频' : '图片'}`, `${newFilename} (${Math.round(blob.size / 1024)}KB)`);
            return newFilename;
        } catch (e) {
            console.error('Failed to save image to handle', e);
            throw e;
        }
    },

    /**
     * 🚀 从本地文件夹彻底删除图片或视频文件
     */
    async deleteImageFromHandle(handle: FileSystemDirectoryHandle, id: string): Promise<boolean> {
        let deleted = false;
        try {
            // 遍历所有可能的存放目录进行删除
            const targetDirs = [DIRS.PICTURE, DIRS.VIDEO, DIRS.ORIGINALS, DIRS.LEGACY];

            for (const dirName of targetDirs) {
                try {
                    // @ts-ignore
                    const dirHandle = await handle.getDirectoryHandle(dirName);

                    // @ts-ignore
                    for await (const entry of dirHandle.values()) {
                        if (entry.kind === 'file' && entry.name.includes(id)) {
                            // @ts-ignore
                            await dirHandle.removeEntry(entry.name);
                            logInfo('FileSystem', `已从本地删除文件`, `${dirName}/${entry.name}`);
                            deleted = true;
                        }
                    }
                } catch (e) {
                    // 目录不存在，忽略
                }
            }
        } catch (e) {
            console.error('Failed to delete image from handle', e);
        }
        return deleted;
    },

    /**
     * 🚀 向后兼容：保存到旧版 originals/ 目录
     */
    async saveImageToOriginalsLegacy(handle: FileSystemDirectoryHandle, id: string, blob: Blob): Promise<void> {
        try {
            // @ts-ignore
            const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS, { create: true });
            const filename = `${id}.png`;

            // Check existence
            try {
                // @ts-ignore
                await originalsDir.getFileHandle(filename);
                return;
            } catch {
                // Not found, proceed
            }

            // @ts-ignore
            const fileHandle = await originalsDir.getFileHandle(filename, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
        } catch (e) {
            console.error('Failed to save image to originals', e);
        }
    },

    /**
     * 🚀 保存参考图到 refs/ 目录（压缩为 50% JPEG）
     * 使用 storageId 作为文件名，自动去重
     */
    async saveReferenceImage(handle: FileSystemDirectoryHandle, storageId: string, base64Data: string, mimeType: string = 'image/jpeg'): Promise<void> {
        try {
            // @ts-ignore
            const refsDir = await handle.getDirectoryHandle(DIRS.REFS, { create: true });
            const filename = `${storageId}.jpg`;

            // 检查是否已存在（去重）
            try {
                // @ts-ignore
                await refsDir.getFileHandle(filename);
                // 已存在，跳过保存
                console.log(`[FileSystem] 参考图已存在: ${storageId}`);
                return;
            } catch {
                // 不存在，继续保存
            }

            // 压缩图片到 50% 质量 JPEG
            const compressedBlob = await this.compressImage(base64Data, mimeType, 0.5);

            // @ts-ignore
            const fileHandle = await refsDir.getFileHandle(filename, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(compressedBlob);
            await writable.close();

            logInfo('FileSystem', `已保存参考图`, `${storageId} (${Math.round(compressedBlob.size / 1024)}KB)`);
        } catch (e) {
            logError('FileSystem', e, `保存参考图失败: ${storageId}`);
        }
    },

    /**
     * 🚀 从 refs/ 目录加载参考图
     */
    async loadReferenceImage(handle: FileSystemDirectoryHandle, storageId: string): Promise<string | null> {
        try {
            // @ts-ignore
            const refsDir = await handle.getDirectoryHandle(DIRS.REFS);
            const filename = `${storageId}.jpg`;

            // @ts-ignore
            const fileHandle = await refsDir.getFileHandle(filename);
            // @ts-ignore
            const file = await fileHandle.getFile();

            // 转换为 base64
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    const base64 = result.split(',')[1]; // 移除 data:... 前缀
                    resolve(base64);
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(file);
            });
        } catch (e) {
            // 文件不存在
            return null;
        }
    },

    /**
     * 🚀 加载所有参考图映射（storageId -> base64）
     */
    async loadAllReferenceImages(handle: FileSystemDirectoryHandle): Promise<Map<string, string>> {
        const refs = new Map<string, string>();

        try {
            // @ts-ignore
            const refsDir = await handle.getDirectoryHandle(DIRS.REFS);

            // @ts-ignore
            for await (const entry of refsDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.jpg')) {
                    const storageId = entry.name.replace('.jpg', '');
                    try {
                        // @ts-ignore
                        const file = await entry.getFile();
                        const url = URL.createObjectURL(file);
                        refs.set(storageId, url);
                    } catch (e) {
                        logWarning('FileSystem', `加载参考图失败: ${storageId}`, '');
                    }
                }
            }

            logInfo('FileSystem', `已加载 ${refs.size} 张参考图`, 'from refs/');
        } catch (e) {
            // refs/ 目录不存在
        }

        return refs;
    },

    /**
     * 🚀 压缩图片工具函数
     */
    async compressImage(base64Data: string, mimeType: string, quality: number): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0);

                canvas.toBlob(
                    (blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Failed to compress image'));
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = `data:${mimeType};base64,${base64Data}`;
        });
    },

    /**
     * 🚀 创建标签快捷链接
     * 在 picture/tags/{tagName}/ 或 video/tags/{tagName}/ 下创建指向原文件的.url快捷方式
     */
    async createTagShortcut(handle: FileSystemDirectoryHandle, tag: string, filename: string, isVideo: boolean = false): Promise<void> {
        try {
            const mediaDir = isVideo ? DIRS.VIDEO : DIRS.PICTURE;
            // @ts-ignore
            const mediaDirHandle = await handle.getDirectoryHandle(mediaDir, { create: true });
            // @ts-ignore
            const tagsDir = await mediaDirHandle.getDirectoryHandle(DIRS.TAGS, { create: true });
            // @ts-ignore
            const tagDir = await tagsDir.getDirectoryHandle(tag, { create: true });

            // 创建 .url 快捷方式文件（Windows格式）
            const shortcutFilename = `${filename}.url`;
            const relativePath = `..\\..\\${filename}`;

            // 检查是否已存在
            try {
                // @ts-ignore
                await tagDir.getFileHandle(shortcutFilename);
                return; // 已存在
            } catch {
                // 不存在，继续创建
            }

            // 创建 Windows URL Shortcut 文件格式
            const shortcutContent = `[InternetShortcut]\r\nURL=file:///${relativePath.replace(/\\/g, '/')}\r\n[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,11\r\n`;

            // @ts-ignore
            const fileHandle = await tagDir.getFileHandle(shortcutFilename, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(shortcutContent);
            await writable.close();

            logInfo('FileSystem', `已创建标签快捷链接`, `${tag}/${shortcutFilename}`);
        } catch (e) {
            logWarning('FileSystem', `创建标签快捷链接失败: ${tag}/${filename}`, (e as Error).message);
        }
    },

    /**
     * 🚀 删除标签快捷链接
     */
    async removeTagShortcut(handle: FileSystemDirectoryHandle, tag: string, filename: string, isVideo: boolean = false): Promise<void> {
        try {
            const mediaDir = isVideo ? DIRS.VIDEO : DIRS.PICTURE;
            // @ts-ignore
            const mediaDirHandle = await handle.getDirectoryHandle(mediaDir);
            // @ts-ignore
            const tagsDir = await mediaDirHandle.getDirectoryHandle(DIRS.TAGS);
            // @ts-ignore
            const tagDir = await tagsDir.getDirectoryHandle(tag);

            const shortcutFilename = `${filename}.url`;

            // @ts-ignore
            await tagDir.removeEntry(shortcutFilename);
            logInfo('FileSystem', `已删除标签快捷链接`, `${tag}/${shortcutFilename}`);

            // 清理空文件夹
            await this.cleanupEmptyTagFolder(handle, tag, isVideo);
        } catch (e) {
            // 文件可能不存在，忽略错误
        }
    },

    /**
     * 🚀 清理空的标签文件夹
     */
    async cleanupEmptyTagFolder(handle: FileSystemDirectoryHandle, tag: string, isVideo: boolean = false): Promise<void> {
        try {
            const mediaDir = isVideo ? DIRS.VIDEO : DIRS.PICTURE;
            // @ts-ignore
            const mediaDirHandle = await handle.getDirectoryHandle(mediaDir);
            // @ts-ignore
            const tagsDir = await mediaDirHandle.getDirectoryHandle(DIRS.TAGS);
            // @ts-ignore
            const tagDir = await tagsDir.getDirectoryHandle(tag);

            // 检查是否为空
            let isEmpty = true;
            // @ts-ignore
            for await (const _ of tagDir.values()) {
                isEmpty = false;
                break;
            }

            if (isEmpty) {
                // @ts-ignore
                await tagsDir.removeEntry(tag);
                logInfo('FileSystem', `已删除空标签文件夹`, tag);
            }
        } catch (e) {
            // 目录可能不存在，忽略
        }
    },

    /**
     * 🚀 为文件的所有标签创建快捷链接
     */
    async syncFileTagShortcuts(handle: FileSystemDirectoryHandle, filename: string, tags: string[], isVideo: boolean = false): Promise<void> {
        for (const tag of tags) {
            await this.createTagShortcut(handle, tag, filename, isVideo);
        }
    },

    /**
     * 🚀 保存布局和设置到 settings/ 目录
     */
    async saveSettings(handle: FileSystemDirectoryHandle, settings: Record<string, any>): Promise<void> {
        try {
            // @ts-ignore
            const settingsDir = await handle.getDirectoryHandle(DIRS.SETTINGS, { create: true });
            // @ts-ignore
            const fileHandle = await settingsDir.getFileHandle('layout.json', { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(settings, null, 2));
            await writable.close();
            logInfo('FileSystem', `已保存设置`, 'settings/layout.json');
        } catch (e) {
            logError('FileSystem', e, '保存设置失败');
        }
    },

    /**
     * 🚀 加载布局和设置
     */
    async loadSettings(handle: FileSystemDirectoryHandle): Promise<Record<string, any> | null> {
        try {
            // @ts-ignore
            const settingsDir = await handle.getDirectoryHandle(DIRS.SETTINGS);
            // @ts-ignore
            const fileHandle = await settingsDir.getFileHandle('layout.json');
            // @ts-ignore
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    },

    /**
     * 🚀 迁移旧文件到新目录结构
     * 将 originals/ 和 images/ 中的文件移动到 picture/ 或 video/
     * 并重命名为 YYYYMM_{id}.{ext} 格式
     * @returns 迁移的文件数量和ID映射
     */
    async migrateLegacyFiles(handle: FileSystemDirectoryHandle): Promise<{ count: number, idMapping: Map<string, string> }> {
        const idMapping = new Map<string, string>();
        let count = 0;

        const migrateFromDir = async (dirName: string) => {
            try {
                // @ts-ignore
                const legacyDir = await handle.getDirectoryHandle(dirName);
                const now = new Date();
                const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

                // @ts-ignore
                for await (const entry of legacyDir.values()) {
                    if (entry.kind !== 'file') continue;

                    const ext = entry.name.split('.').pop()?.toLowerCase() || '';
                    const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
                    const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);

                    if (!isVideo && !isImage) continue;

                    // 提取原始ID
                    const oldId = entry.name.replace(/\.[^.]+$/, '');
                    const newFilename = `${datePrefix}_${oldId}.${isVideo ? 'mp4' : 'png'}`;

                    // 读取文件
                    // @ts-ignore
                    const file = await entry.getFile();

                    // 保存到新目录
                    const targetDirName = isVideo ? DIRS.VIDEO : DIRS.PICTURE;
                    // @ts-ignore
                    const targetDir = await handle.getDirectoryHandle(targetDirName, { create: true });

                    // 检查新文件是否已存在
                    try {
                        // @ts-ignore
                        await targetDir.getFileHandle(newFilename);
                        // 已存在，跳过
                        idMapping.set(oldId, newFilename);
                        continue;
                    } catch {
                        // 不存在，继续迁移
                    }

                    // 写入新位置
                    // @ts-ignore
                    const newFileHandle = await targetDir.getFileHandle(newFilename, { create: true });
                    // @ts-ignore
                    const writable = await newFileHandle.createWritable();
                    await writable.write(file);
                    await writable.close();

                    // 删除旧文件
                    // @ts-ignore
                    await legacyDir.removeEntry(entry.name);

                    idMapping.set(oldId, newFilename);
                    count++;

                    logInfo('FileSystem', `已迁移文件`, `${entry.name} -> ${targetDirName}/${newFilename}`);
                }

                // 如果目录为空，删除旧目录
                let isEmpty = true;
                // @ts-ignore
                for await (const _ of legacyDir.values()) {
                    isEmpty = false;
                    break;
                }
                if (isEmpty) {
                    // @ts-ignore
                    await handle.removeEntry(dirName);
                    logInfo('FileSystem', `已删除旧目录`, dirName);
                }
            } catch (e) {
                // 目录不存在，忽略
            }
        };

        // 迁移两个旧目录
        await migrateFromDir(DIRS.ORIGINALS);
        await migrateFromDir(DIRS.LEGACY);

        if (count > 0) {
            logInfo('FileSystem', `迁移完成`, `共迁移 ${count} 个文件`);
        }

        return { count, idMapping };
    }
};
