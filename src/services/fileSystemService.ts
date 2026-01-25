import { Canvas } from '../types';
import { logError, logInfo, logWarning } from './systemLogService';

/**
 * Service to handle Local File System Access API
 * Allows saving/loading project data directly to a user-selected directory.
 */

const PROJECT_FILE = 'project.json';
const DIRS = {
    ORIGINALS: 'originals',
    THUMBNAILS: 'thumbnails',
    CACHE: 'cache', // Reserved for future use
    LEGACY: 'images'
};

export interface FileSystemState {
    handle: FileSystemDirectoryHandle | null;
    isConnected: boolean;
    folderName: string;
}

export const fileSystemService = {
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
    async loadProjectWithThumbs(handle: FileSystemDirectoryHandle): Promise<{ canvases: Canvas[], images: Map<string, { url: string, originalUrl?: string }> }> {
        const images = new Map<string, { url: string, originalUrl?: string }>();
        let canvases: Canvas[] = [];

        logInfo('FileSystem', `正在加载项目`, `folder: ${handle.name}`);

        // CLEANUP: Remove thumbnails folder if exists (User request)
        try {
            // @ts-ignore
            await handle.removeEntry(DIRS.THUMBNAILS, { recursive: true });
            logInfo('FileSystem', '已清理缩略图目录', 'thumbnails dir removed');
        } catch (ignore) { }

        // 1. Load Project JSON
        try {
            // @ts-ignore
            const projectHandle = await handle.getFileHandle(PROJECT_FILE);
            // @ts-ignore
            const file = await projectHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            canvases = data.canvases || [];
            logInfo('FileSystem', `已加载项目配置`, `${canvases.length} 个画布`);
        } catch (e) {
            logInfo('FileSystem', '暂无项目文件，将创建新项目', 'project.json not found');
        }

        // 2. Load All Images & Generate Thumbs if needed
        let imagesDir: FileSystemDirectoryHandle | null = null;
        try {
            // @ts-ignore
            imagesDir = await handle.getDirectoryHandle(DIRS.ORIGINALS);
            logInfo('FileSystem', `找到原图目录`, 'originals dir exists');
        } catch (e) {
            try {
                // Fallback to legacy 'images' folder
                // @ts-ignore
                imagesDir = await handle.getDirectoryHandle(DIRS.LEGACY);
                logWarning('FileSystem', `使用旧版图片目录`, 'fallback to legacy images dir');
            } catch (e2) {
                logWarning('FileSystem', `未找到图片目录`, 'no originals or images dir found');
            }
        }

        if (imagesDir) {
            try {
                let count = 0;
                // @ts-ignore
                for await (const entry of imagesDir.values()) {
                    if (entry.kind === 'file' && /\.(png|jpg|webp)$/i.test(entry.name)) {
                        count++;
                        const id = entry.name.replace(/\.(png|jpg|webp)$/i, '');
                        try {
                            // @ts-ignore
                            const file = await entry.getFile();
                            const originalUrl = URL.createObjectURL(file);

                            // DIRECT LOAD: Use original image to ensure visibility
                            // Skipping thumbnail generation prevents loading hangs/errors
                            images.set(id, { url: originalUrl, originalUrl });

                        } catch (e) {
                            logError('FileSystem', e, `加载图片失败: ${id}`);
                        }
                    }
                }
                logInfo('FileSystem', `已加载 ${count} 张图片`, `from disk`);
            } catch (e) {
                logError('FileSystem', e, "遍历图片目录失败");
            }
        }

        return { canvases, images };
    },
    /**
     * Get usage of images folder in bytes (Recursive)
     */
    async getFolderUsage(handle: FileSystemDirectoryHandle): Promise<number> {
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
        return totalSize;
    },

    /**
     * Load a single original image from disk by ID
     */
    async loadOriginalFromDisk(handle: FileSystemDirectoryHandle, id: string): Promise<Blob | null> {
        try {
            // 1. Try _originals
            try {
                // @ts-ignore
                const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS);
                // @ts-ignore
                const fileHandle = await originalsDir.getFileHandle(`${id}.png`);
                // @ts-ignore
                return await fileHandle.getFile();
            } catch (e) {
                // Not in originals, try legacy
            }

            // 2. Try legacy (root)
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
     * Save a single image to the directory handle
     */
    async saveImageToHandle(handle: FileSystemDirectoryHandle, id: string, blob: Blob): Promise<void> {
        try {
            // @ts-ignore
            const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS, { create: true });
            const filename = `${id}.png`;

            // Check existence
            try {
                // @ts-ignore
                await originalsDir.getFileHandle(filename);
                // If exists, skip to save time
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
            console.error('Failed to save image to handle', e);
            throw e;
        }
    }
};
