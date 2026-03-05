import { Canvas } from '../../types';
import { logError, logInfo, logWarning } from '../system/systemLogService';
import { notify } from '../system/notificationService';
import { supabase } from '../../lib/supabase';

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
     * Set global handle for auto-saving
     */
    setGlobalHandle(handle: FileSystemDirectoryHandle) {
        globalHandle = handle;
    },

    /**
     * [重构版] - 模拟文件夹重命名逻辑（因浏览器无原生 API 支持，采用全息克隆转移方案）
     * 传入工作区根 handle，旧名字和新名字
     */
    async renameProjectFolder(handle: FileSystemDirectoryHandle, oldName: string, newName: string): Promise<boolean> {
        try {
            const safeOldName = oldName.trim().replace(/[\\/:*?"<>|]/g, '_');
            const safeNewName = newName.trim().replace(/[\\/:*?"<>|]/g, '_');

            if (safeOldName === safeNewName) return true;

            // 1. 尝试获取旧文件夹
            let oldDirHandle: FileSystemDirectoryHandle;
            try {
                // @ts-ignore
                oldDirHandle = await handle.getDirectoryHandle(safeOldName);
            } catch (e) {
                console.log(`[FileSystem] 旧文件夹 ${safeOldName} 不存在，无需重命名，将在下次保存时建新结构`);
                return true;
            }

            // 2. 检查新名字是否被占用，带上指纹保护
            const { data: { session } } = await supabase.auth.getSession();
            const ownerId = session?.user?.id || 'local_user';

            let finalNewName = safeNewName;
            let isOwner = true;
            try {
                // @ts-ignore
                const newDirHandle = await handle.getDirectoryHandle(finalNewName);
                // @ts-ignore
                const pFile = await newDirHandle.getFileHandle(PROJECT_FILE);
                const pText = await (await pFile.getFile()).text();
                if (JSON.parse(pText).metadata?.ownerId !== ownerId) {
                    isOwner = false;
                }
            } catch (e) {
                // 不存在，安全
            }

            if (!isOwner) {
                let suffix = 1;
                while (!isOwner) {
                    finalNewName = `${safeNewName} (${suffix})`;
                    try {
                        // @ts-ignore
                        const newDirHandle = await handle.getDirectoryHandle(finalNewName);
                        // @ts-ignore
                        const pFile = await newDirHandle.getFileHandle(PROJECT_FILE);
                        const pText = await (await pFile.getFile()).text();
                        if (JSON.parse(pText).metadata?.ownerId !== ownerId) suffix++;
                        else isOwner = true;
                    } catch (e) {
                        isOwner = true;
                    }
                }
            }

            console.log(`[FileSystem] 开始重命名流转移：${safeOldName} -> ${finalNewName}`);

            // 3. 创建新文件夹并开始全息克隆
            // @ts-ignore
            const newDirHandle = await handle.getDirectoryHandle(finalNewName, { create: true });

            // 递归复制函数
            const copyDir = async (srcHandle: FileSystemDirectoryHandle, destHandle: FileSystemDirectoryHandle) => {
                // @ts-ignore
                for await (const entry of srcHandle.values()) {
                    if (entry.kind === 'file') {
                        // @ts-ignore
                        const file = await entry.getFile();
                        // @ts-ignore
                        const newFile = await destHandle.getFileHandle(entry.name, { create: true });
                        // @ts-ignore
                        const writable = await newFile.createWritable();
                        await writable.write(file);
                        await writable.close();
                    } else if (entry.kind === 'directory') {
                        // @ts-ignore
                        const newSubDir = await destHandle.getDirectoryHandle(entry.name, { create: true });
                        // @ts-ignore
                        const oldSubDir = await srcHandle.getDirectoryHandle(entry.name);
                        await copyDir(oldSubDir, newSubDir);
                    }
                }
            };

            await copyDir(oldDirHandle, newDirHandle);

            // 4. 修改新文件夹里的 project.json
            try {
                // @ts-ignore
                const pFile = await newDirHandle.getFileHandle(PROJECT_FILE);
                // @ts-ignore
                const pText = await (await pFile.getFile()).text();
                const pData = JSON.parse(pText);
                if (pData.canvas) {
                    pData.canvas.name = newName; // 顺手把 json 里的名字盖了，保证一致性
                }
                // @ts-ignore
                const writable = await pFile.createWritable();
                await writable.write(JSON.stringify(pData, null, 2));
                await writable.close();
            } catch (e) { /* ignore */ }

            // 5. 摧毁旧文件夹
            // @ts-ignore
            await handle.removeEntry(safeOldName, { recursive: true });

            console.log(`[FileSystem] 目录重命名同步成功！`);
            return true;
        } catch (e) {
            console.error('[FileSystem] 发生重命名转移致命错误', e);
            return false; // 如果复制到一半卡死，最好不要报毒抛出
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
     * Load project from directory with Thumbnail Generation
     * [重构版] - 支持工作区（多项目子文件夹）分层架构与无缝老工程迁移
     */
    async loadProjectWithThumbs(handle: FileSystemDirectoryHandle): Promise<{ canvases: Canvas[], images: Map<string, { url: string, originalUrl?: string, filename?: string }>, activeCanvasId: string | null }> {
        this.setGlobalHandle(handle);

        const images = new Map<string, { url: string, originalUrl?: string, filename?: string }>();
        let canvases: Canvas[] = [];
        let activeCanvasId: string | null = null;
        let rootProjectData: any = null;

        logInfo('FileSystem', `正在加载工作区`, `folder: ${handle.name}`);

        // --- 0. 环境指纹 ---
        const { data: { session } } = await supabase.auth.getSession();
        const ownerId = session?.user?.id || 'local_user';

        // --- 1. 优先加载根目录的 project.json (整合版) ---
        let hasRootConfig = false;
        try {
            // @ts-ignore
            const rootFile = await handle.getFileHandle(PROJECT_FILE);
            // @ts-ignore
            const text = await (await rootFile.getFile()).text();
            rootProjectData = JSON.parse(text);

            if (rootProjectData?.canvases || rootProjectData?.canvas) {
                if (rootProjectData.canvases) {
                    canvases = rootProjectData.canvases;
                } else if (rootProjectData.canvas) {
                    canvases = [rootProjectData.canvas];
                }
                activeCanvasId = rootProjectData.activeCanvasId || (canvases[0]?.id) || null;
                hasRootConfig = true;
                logInfo('FileSystem', '已从根目录加载整合配置文件', `共 ${canvases.length} 个画布`);
            }
        } catch (e) {
            // 根目录无配置或解析失败
        }

        // --- 2. 遍历子文件夹：仅用于加载媒体文件 & 扫描旧版配置以便迁移 ---
        // @ts-ignore
        for await (const entry of handle.values()) {
            if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
                // @ts-ignore
                const projectDirHandle = await handle.getDirectoryHandle(entry.name);

                try {
                    // --- 2.1 扫描媒体文件 (picture / video) ---
                    const scanSubDirectory = async (mediaDirName: string) => {
                        try {
                            // @ts-ignore
                            const mediaDirHandle = await projectDirHandle.getDirectoryHandle(mediaDirName);
                            // @ts-ignore
                            for await (const mediaEntry of mediaDirHandle.values()) {
                                if (mediaEntry.kind === 'file' && /\.(png|jpg|webp|mp4|webm|mov)$/i.test(mediaEntry.name)) {
                                    let id = mediaEntry.name.substring(0, mediaEntry.name.lastIndexOf('.'));
                                    if (/^\d{6}_/.test(id)) id = id.substring(7);

                                    try {
                                        // @ts-ignore
                                        const file = await mediaEntry.getFile();
                                        const url = URL.createObjectURL(file);
                                        if (!images.has(id)) {
                                            images.set(id, { url, originalUrl: url, filename: mediaEntry.name });
                                        }
                                    } catch (e) { /* ignore */ }
                                }
                            }
                        } catch (e) { /* ignore missing */ }
                    };

                    await scanSubDirectory(DIRS.PICTURE);
                    await scanSubDirectory(DIRS.VIDEO);

                    // --- 2.2 辅助：如果根目录没配置，则尝试从子目录合并配置 (旧架构兼容) ---
                    if (!hasRootConfig) {
                        try {
                            // @ts-ignore
                            const pFile = await projectDirHandle.getFileHandle(PROJECT_FILE);
                            // @ts-ignore
                            const pText = await (await pFile.getFile()).text();
                            const pData = JSON.parse(pText);

                            if (pData.canvas) {
                                // 检查 ownerId 匹配
                                if (!pData.metadata?.ownerId || pData.metadata.ownerId === ownerId) {
                                    // 检查是否已存在（防冲突）
                                    if (!canvases.find(c => c.id === pData.canvas.id)) {
                                        canvases.push(pData.canvas);
                                    }
                                }
                            } else if (pData.canvases && Array.isArray(pData.canvases)) {
                                pData.canvases.forEach((c: Canvas) => {
                                    if (!canvases.find(can => can.id === c.id)) {
                                        canvases.push(c);
                                    }
                                });
                            }
                        } catch (e) { /* 子目录无 project.json */ }
                    }

                } catch (e) { /* 遍历项目出错 */ }
            }
        }

        // --- 4. 容错回退机制 ---
        if (canvases.length === 0) {
            logInfo('FileSystem', '工作区为空或无归属权项目，将创建全新空配置', 'project.json not found');
            canvases = [];
        } else if (!activeCanvasId) {
            activeCanvasId = canvases[0]?.id || null;
        }

        logInfo('FileSystem', `已深度挂载 ${canvases.length} 个项目, 共找到 ${images.size} 个媒体文件`, 'load complete');

        return { canvases, images, activeCanvasId };
    },
    /**
     * Get usage of images folder in bytes (Recursive)
     * [重构版] - 考虑到多项目架构，自动对所有子文件夹包含的内容进行统计
     */
    async getFolderUsage(handle: FileSystemDirectoryHandle): Promise<{ size: number, count: number }> {
        let totalSize = 0;
        let fileCount = 0;

        const processHandle = async (currentHandle: FileSystemDirectoryHandle, depth: number) => {
            if (depth > 4) return; // Limit depth to avoid performance issues

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
                        // Exclude hidden or system folders
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

        logInfo('FileSystem', `已计算工作区大小`, `${fileCount} 个文件, ${totalSize} 字节`);
        return { size: totalSize, count: fileCount };
    },

    /**
     * 快速获取本地媒体 ID 集合（仅遍历文件名，不读取文件内容）
     * [重构版] - 作用域仅限于传入的句柄（如果传项目子文件夹，则扫子文件夹；如果传工作区根目录，会扫描一层深度的子文件夹）
     */
    async getLocalMediaIds(handle: FileSystemDirectoryHandle): Promise<Set<string>> {
        const ids = new Set<string>();

        const scanDirectory = async (dirHandle: FileSystemDirectoryHandle, depth: number) => {
            if (depth > 2) return;
            try {
                // @ts-ignore
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'file') {
                        if (/\.(png|jpg|jpeg|webp|mp4|webm|mov)$/i.test(entry.name)) {
                            let id = entry.name.substring(0, entry.name.lastIndexOf('.'));
                            if (/^\d{6}_/.test(id)) id = id.substring(7);
                            if (id) ids.add(id);
                        }
                    } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
                        // @ts-ignore
                        const subHandle = await dirHandle.getDirectoryHandle(entry.name);
                        await scanDirectory(subHandle, depth + 1);
                    }
                }
            } catch {
                // ignore
            }
        };

        // 直接对传入的句柄启动全域递归（限深2）
        await scanDirectory(handle, 0);

        return ids;
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

            // 2. Move Folders (支持递归子目录，避免 tags/ 等子目录遗漏)
            const copyDirRecursive = async (
                sourceDir: FileSystemDirectoryHandle,
                targetDir: FileSystemDirectoryHandle
            ) => {
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
                    } else if (entry.kind === 'directory') {
                        // @ts-ignore
                        const subSource = await sourceDir.getDirectoryHandle(entry.name);
                        // @ts-ignore
                        const subTarget = await targetDir.getDirectoryHandle(entry.name, { create: true });
                        await copyDirRecursive(subSource, subTarget);
                    }
                }
            };

            // Helper to move a directory
            const moveDir = async (dirName: string) => {
                try {
                    // @ts-ignore
                    const sourceDir = await sourceHandle.getDirectoryHandle(dirName);
                    // @ts-ignore
                    const targetDir = await targetHandle.getDirectoryHandle(dirName, { create: true });

                    await copyDirRecursive(sourceDir, targetDir);

                    // Finally remove source dir (recursive)
                    // @ts-ignore
                    await sourceHandle.removeEntry(dirName, { recursive: true });
                } catch (e) {
                    // Dir might not exist
                }
            };

            await moveDir(DIRS.PICTURE);
            await moveDir(DIRS.VIDEO);
            await moveDir(DIRS.REFS);
            await moveDir(DIRS.SETTINGS);
            await moveDir(DIRS.ORIGINALS);
            await moveDir(DIRS.LEGACY); // Move legacy images if present too
            // Note: We intentionally DO NOT move thumbnails.

        } catch (error) {
            console.error('Failed to move project:', error);
            throw new Error('Migration failed: ' + (error as any).message);
        }
    },

    /**
     * Store new generated image as Blob
     * [重构版] - 支持写入对应项目的子目录。若提供 canvasDirName，则结构为 `Workspace/项目名/picture/xxx.png`
     */
    async saveImageToHandle(handle: FileSystemDirectoryHandle, id: string, blob: Blob, isVideo: boolean = false, canvasDirName?: string): Promise<string> {
        try {
            const targetDirName = isVideo ? DIRS.VIDEO : DIRS.PICTURE;

            // 如果传了特定的项目目录名，则将写入锚点转至该子目录
            let baseHandle = handle;
            if (canvasDirName) {
                // @ts-ignore
                baseHandle = await handle.getDirectoryHandle(canvasDirName, { create: true });
            }

            // @ts-ignore
            const targetDir = await baseHandle.getDirectoryHandle(targetDirName, { create: true });

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
     * [重构版] - 考虑到多项目结构体系，自动深入到所有可能的画板子文件夹进行全局清除
     */
    async deleteImageFromHandle(handle: FileSystemDirectoryHandle, id: string): Promise<boolean> {
        let deleted = false;

        const processHandle = async (currentHandle: FileSystemDirectoryHandle, depth: number) => {
            if (depth > 4) return; // 限制深度，防死循环

            try {
                // @ts-ignore
                for await (const entry of currentHandle.values()) {
                    if (entry.kind === 'file' && entry.name.includes(id)) {
                        try {
                            // @ts-ignore
                            await currentHandle.removeEntry(entry.name);
                            logInfo('FileSystem', `已从本地删除文件`, `${currentHandle.name}/${entry.name}`);
                            deleted = true;
                        } catch (e) {
                            console.error(`Failed to delete ${entry.name}`, e);
                        }
                    } else if (entry.kind === 'directory' && !entry.name.startsWith('.')) {
                        // 继续深挖
                        // @ts-ignore
                        const subHandle = await currentHandle.getDirectoryHandle(entry.name);
                        await processHandle(subHandle, depth + 1);
                    }
                }
            } catch (e) {
                // Ignore traversing error
            }
        }

        try {
            await processHandle(handle, 0);
        } catch (e) {
            console.error('Failed to run recursive delete image from handle', e);
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
     * Save the entire project state and new images
     * [重构版] - 按项目名子文件夹独立保存，支持账户隔离
     */
    async saveProject(
        handle: FileSystemDirectoryHandle,
        state: { canvases: Canvas[], activeCanvasId: string },
        imagesToSave: Map<string, Blob>
    ): Promise<void> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const ownerId = session?.user?.id || 'local_user';

            // 1. 获取并合并根目录的 project.json
            let finalCanvases = [...state.canvases];
            try {
                // @ts-ignore
                const rootFile = await handle.getFileHandle(PROJECT_FILE);
                // @ts-ignore
                const text = await (await rootFile.getFile()).text();
                const rootData = JSON.parse(text);
                const cloudCanvases = rootData.canvases || (rootData.canvas ? [rootData.canvas] : []);

                // 以当前内存 state 为准合并（更新已有或添加新项）
                const mergedMap = new Map<string, Canvas>();
                // 先加载文件中已有的
                cloudCanvases.forEach((c: Canvas) => mergedMap.set(c.id, c));
                // 再覆盖内存中最新的
                finalCanvases.forEach((c: Canvas) => mergedMap.set(c.id, c));
                finalCanvases = Array.from(mergedMap.values());
            } catch (e) {
                // 如果文件不存在，则直接使用传入的 canvases
            }

            // 2. 写入根目录整合配置文件
            const consolidatedState = {
                metadata: {
                    version: "3.0", // 升级版本号表示整合版
                    lastSaved: Date.now(),
                    ownerId: ownerId,
                    mode: 'consolidated_workspace'
                },
                activeCanvasId: state.activeCanvasId,
                canvases: finalCanvases
            };

            // @ts-ignore
            const projectFile = await handle.getFileHandle(PROJECT_FILE, { create: true });
            // @ts-ignore
            const writable = await projectFile.createWritable();
            await writable.write(JSON.stringify(consolidatedState, null, 2));
            await writable.close();

            // 3. 增量保存图片到对应的子目录
            const activeCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
            if (activeCanvas && imagesToSave.size > 0) {
                let projectDirName = (activeCanvas.folderName || activeCanvas.name || '未命名项目').trim();
                projectDirName = projectDirName.replace(/[\\/:*?"<>|]/g, '_');

                // @ts-ignore
                const projectDirHandle = await handle.getDirectoryHandle(projectDirName, { create: true });
                const existingIds = await this.getLocalMediaIds(projectDirHandle);

                for (const [id, blob] of imagesToSave.entries()) {
                    if (existingIds.has(id)) continue;
                    await this.saveImageToHandle(projectDirHandle, id, blob, false);
                }
            }

        } catch (error) {
            console.error('[FileSystem] Consolidated Project Save Error:', error);
            throw error;
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
