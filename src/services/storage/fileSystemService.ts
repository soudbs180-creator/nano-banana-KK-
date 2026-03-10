import { Canvas } from '../../types';
import { logError, logInfo, logWarning } from '../system/systemLogService';
import { supabase } from '../../lib/supabase';

/**
 * Service to handle Local File System Access API
 * Allows saving/loading project data directly to a user-selected directory.
 */

const PROJECT_FILE = 'project.json';
const DIRS = {
    ORIGINALS: 'originals',
    THUMBNAILS: 'thumbnails',
    REFS: 'refs',
    PICTURE: 'picture',
    VIDEO: 'video',
    SETTINGS: 'settings',
    TAGS: 'tags',
    CACHE: 'cache',
    LEGACY: 'images'
};

const ROOT_CANONICAL_DIRS = new Set([
    DIRS.ORIGINALS,
    DIRS.THUMBNAILS,
    DIRS.REFS
]);

const ROOT_LEGACY_DIRS = new Set([
    DIRS.PICTURE,
    DIRS.VIDEO,
    DIRS.SETTINGS,
    DIRS.TAGS,
    DIRS.CACHE,
    DIRS.LEGACY
]);

const ALL_MANAGED_ROOT_DIRS = new Set([
    ...Array.from(ROOT_CANONICAL_DIRS),
    ...Array.from(ROOT_LEGACY_DIRS)
]);

const MEDIA_EXTENSIONS = /\.(png|jpe?g|webp|gif|bmp|mp4|webm|mov)$/i;
const THUMBNAIL_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

const consolidatedWorkspaceHandles = new WeakSet<FileSystemDirectoryHandle>();

function normalizeStoredFileId(filename: string): string {
    const baseName = filename.replace(/\.[^.]+$/, '');
    return /^\d{6}_/.test(baseName) ? baseName.slice(7) : baseName;
}

function getFileExtension(filename: string, fallback: string): string {
    const match = filename.match(/\.([^.]+)$/);
    return (match?.[1] || fallback).toLowerCase();
}

function extensionFromMimeType(mimeType: string | undefined, fallback: string): string {
    const normalizedMimeType = (mimeType || '').toLowerCase();

    if (normalizedMimeType.includes('png')) return 'png';
    if (normalizedMimeType.includes('jpeg') || normalizedMimeType.includes('jpg')) return 'jpg';
    if (normalizedMimeType.includes('webp')) return 'webp';
    if (normalizedMimeType.includes('gif')) return 'gif';
    if (normalizedMimeType.includes('bmp')) return 'bmp';
    if (normalizedMimeType.includes('mp4')) return 'mp4';
    if (normalizedMimeType.includes('webm')) return 'webm';
    if (normalizedMimeType.includes('quicktime') || normalizedMimeType.includes('mov')) return 'mov';

    return fallback;
}

function matchesStoredFileId(filename: string, id: string): boolean {
    const normalizedId = normalizeStoredFileId(filename);
    const baseName = filename.replace(/\.[^.]+$/, '');
    return normalizedId === id || baseName === id || filename.startsWith(`${id}.`);
}

async function findExistingFileNameByStoredId(
    dirHandle: FileSystemDirectoryHandle,
    id: string,
    pattern: RegExp
): Promise<string | null> {
    // @ts-ignore
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && pattern.test(entry.name) && matchesStoredFileId(entry.name, id)) {
            return entry.name;
        }
    }
    return null;
}

async function copyFileBetweenDirectories(
    sourceDirHandle: FileSystemDirectoryHandle,
    sourceFilename: string,
    targetDirHandle: FileSystemDirectoryHandle,
    targetFilename: string
): Promise<void> {
    // @ts-ignore
    const sourceFileHandle = await sourceDirHandle.getFileHandle(sourceFilename);
    // @ts-ignore
    const file = await sourceFileHandle.getFile();
    // @ts-ignore
    const targetFileHandle = await targetDirHandle.getFileHandle(targetFilename, { create: true });
    // @ts-ignore
    const writable = await targetFileHandle.createWritable();
    await writable.write(file);
    await writable.close();
}

async function removeEntryIfExists(
    dirHandle: FileSystemDirectoryHandle,
    entryName: string,
    recursive: boolean = false
): Promise<void> {
    try {
        if (recursive) {
            // @ts-ignore
            await dirHandle.removeEntry(entryName, { recursive: true });
        } else {
            // @ts-ignore
            await dirHandle.removeEntry(entryName);
        }
    } catch {
        // ignore
    }
}

async function isDirectoryEmpty(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
    // @ts-ignore
    for await (const _ of dirHandle.values()) {
        return false;
    }
    return true;
}

function sanitizeCanvasesForProjectFile(canvases: Canvas[]): Canvas[] {
    return canvases.map(canvas => ({
        ...canvas,
        imageNodes: (canvas.imageNodes || []).map(imageNode => ({
            ...imageNode,
            url: '',
            originalUrl: '',
            requestBodyPreview: undefined,
            pythonSnippet: undefined,
            fileName: imageNode.fileName || imageNode.storageId || imageNode.id
        })),
        promptNodes: (canvas.promptNodes || []).map(promptNode => ({
            ...promptNode,
            referenceImages: (promptNode.referenceImages || []).map(ref => ({
                ...ref,
                storageId: ref.storageId || ref.id,
                data: '',
                url: undefined
            })),
            errorDetails: promptNode.errorDetails ? {
                code: promptNode.errorDetails.code,
                status: promptNode.errorDetails.status,
                requestPath: promptNode.errorDetails.requestPath,
                provider: promptNode.errorDetails.provider,
                model: promptNode.errorDetails.model,
                timestamp: promptNode.errorDetails.timestamp
            } : undefined
        }))
    }));
}

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
    setGlobalHandle(handle: FileSystemDirectoryHandle | null) {
        globalHandle = handle;
    },

    /**
     * [重构版] - 模拟文档夹重命名逻辑（因浏览器无原生 API 支持，采用全息克隆转移方案）
     * 传入工作区根 handle，旧名字和新名字
     */
    async renameProjectFolder(handle: FileSystemDirectoryHandle, oldName: string, newName: string): Promise<boolean> {
        try {
            const safeOldName = oldName.trim().replace(/[\\/:*?"<>|]/g, '_');
            const safeNewName = newName.trim().replace(/[\\/:*?"<>|]/g, '_');

            if (safeOldName === safeNewName) return true;

            // 1. 尝试获取旧文档夹
            let oldDirHandle: FileSystemDirectoryHandle;
            try {
                // @ts-ignore
                oldDirHandle = await handle.getDirectoryHandle(safeOldName);
            } catch (e) {
                console.log(`[FileSystem] 旧文档夹 ${safeOldName} 不存在，无需重命名，将在下次保存时建新结构`);
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

            // 3. 创建新文档夹并开始全息克隆
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

            // 4. 修改新文档夹里的 project.json
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

            // 5. 摧毁旧文档夹
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
        logInfo('FileSystem', `用户选择了文档夹`, `directory: ${handle.name}`);
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
     * [重构版] - 支持工作区（多项目子文档夹）分层架构与无缝老工程迁移
     */
    async loadProjectWithThumbs(handle: FileSystemDirectoryHandle): Promise<{ canvases: Canvas[], images: Map<string, { url: string, originalUrl?: string, filename?: string }>, activeCanvasId: string | null }> {
        this.setGlobalHandle(handle);

        const images = new Map<string, { url: string, originalUrl?: string, filename?: string }>();
        let canvases: Canvas[] = [];
        let activeCanvasId: string | null = null;
        let rootProjectData: any = null;

        logInfo('FileSystem', 'Loading workspace', `folder: ${handle.name}`);

        const { data: { session } } = await supabase.auth.getSession();
        const ownerId = session?.user?.id || 'local_user';
        let hasRootConfig = false;
        const canvasMap = new Map<string, Canvas>();

        const mergeCanvasList = (incoming: Canvas[] | undefined, overwrite: boolean = true) => {
            (incoming || []).forEach((canvas) => {
                if (!canvas?.id) return;
                if (!overwrite && canvasMap.has(canvas.id)) return;
                canvasMap.set(canvas.id, canvas);
            });
        };

        const registerOriginalMedia = async (dirHandle: FileSystemDirectoryHandle) => {
            // @ts-ignore
            for await (const mediaEntry of dirHandle.values()) {
                if (mediaEntry.kind !== 'file' || !MEDIA_EXTENSIONS.test(mediaEntry.name)) continue;
                const id = normalizeStoredFileId(mediaEntry.name);
                try {
                    // @ts-ignore
                    const file = await mediaEntry.getFile();
                    const url = URL.createObjectURL(file);
                    const current = images.get(id);
                    images.set(id, {
                        url: current?.url || url,
                        originalUrl: url,
                        filename: mediaEntry.name
                    });
                } catch {
                    // ignore file read error
                }
            }
        };

        const registerThumbnailMedia = async (dirHandle: FileSystemDirectoryHandle) => {
            // @ts-ignore
            for await (const mediaEntry of dirHandle.values()) {
                if (mediaEntry.kind !== 'file' || !THUMBNAIL_EXTENSIONS.test(mediaEntry.name)) continue;
                const id = normalizeStoredFileId(mediaEntry.name);
                try {
                    // @ts-ignore
                    const file = await mediaEntry.getFile();
                    const url = URL.createObjectURL(file);
                    const current = images.get(id);
                    images.set(id, {
                        url,
                        originalUrl: current?.originalUrl || current?.url,
                        filename: current?.filename || mediaEntry.name
                    });
                } catch {
                    // ignore file read error
                }
            }
        };

        const scanDirectoryMedia = async (baseHandle: FileSystemDirectoryHandle, dirName: string, mode: 'original' | 'thumbnail') => {
            try {
                // @ts-ignore
                const dirHandle = await baseHandle.getDirectoryHandle(dirName);
                if (mode === 'thumbnail') {
                    await registerThumbnailMedia(dirHandle);
                } else {
                    await registerOriginalMedia(dirHandle);
                }
            } catch {
                // ignore missing directories
            }
        };

        try {
            // @ts-ignore
            const rootFile = await handle.getFileHandle(PROJECT_FILE);
            // @ts-ignore
            const text = await (await rootFile.getFile()).text();
            rootProjectData = JSON.parse(text);

            if (rootProjectData?.canvases || rootProjectData?.canvas) {
                if (rootProjectData.canvases) {
                    mergeCanvasList(rootProjectData.canvases);
                } else if (rootProjectData.canvas) {
                    mergeCanvasList([rootProjectData.canvas]);
                }
                activeCanvasId = rootProjectData.activeCanvasId || null;
                hasRootConfig = true;
                logInfo('FileSystem', 'Loaded root project metadata', `activeCanvas: ${activeCanvasId || 'none'}`);
            } else {
                logInfo('FileSystem', 'No canvas data in root project.json', JSON.stringify(rootProjectData).slice(0, 200));
            }
        } catch (e) {
            logWarning('FileSystem', 'Failed to parse root project.json, fallback to legacy recovery', e instanceof Error ? e.message : 'unknown');
        }

        await scanDirectoryMedia(handle, DIRS.ORIGINALS, 'original');
        await scanDirectoryMedia(handle, DIRS.THUMBNAILS, 'thumbnail');
        await scanDirectoryMedia(handle, DIRS.PICTURE, 'original');
        await scanDirectoryMedia(handle, DIRS.VIDEO, 'original');
        await scanDirectoryMedia(handle, DIRS.LEGACY, 'original');

        // @ts-ignore
        for await (const entry of handle.values()) {
            if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue;
            if (ALL_MANAGED_ROOT_DIRS.has(entry.name)) continue;

            // @ts-ignore
            const projectDirHandle = await handle.getDirectoryHandle(entry.name);

            try {
                await scanDirectoryMedia(projectDirHandle, DIRS.ORIGINALS, 'original');
                await scanDirectoryMedia(projectDirHandle, DIRS.THUMBNAILS, 'thumbnail');
                await scanDirectoryMedia(projectDirHandle, DIRS.PICTURE, 'original');
                await scanDirectoryMedia(projectDirHandle, DIRS.VIDEO, 'original');
                await scanDirectoryMedia(projectDirHandle, DIRS.LEGACY, 'original');

                try {
                    // @ts-ignore
                    const pFile = await projectDirHandle.getFileHandle(PROJECT_FILE);
                    // @ts-ignore
                    const pText = await (await pFile.getFile()).text();
                    const pData = JSON.parse(pText);

                    if (pData.canvas) {
                        if (!pData.metadata?.ownerId || pData.metadata.ownerId === ownerId) {
                            mergeCanvasList([pData.canvas], !hasRootConfig);
                        }
                    } else if (pData.canvases && Array.isArray(pData.canvases)) {
                        mergeCanvasList(pData.canvases, !hasRootConfig);
                    }
                } catch {
                    // ignore nested project.json parse failures
                }
            } catch {
                // ignore nested workspace traversal errors
            }
        }

        canvases = Array.from(canvasMap.values());

        if (canvases.length === 0) {
            logInfo('FileSystem', 'Workspace contains no recoverable canvases', 'project.json not found');
            canvases = [];
        } else if (!activeCanvasId || !canvases.some(canvas => canvas.id === activeCanvasId)) {
            activeCanvasId = canvases[0]?.id || null;
        }

        logInfo('FileSystem', `Loaded ${canvases.length} canvases and ${images.size} media files`, hasRootConfig ? 'root+legacy merged' : 'legacy recovered');

        if (!consolidatedWorkspaceHandles.has(handle)) {
            try {
                await this.consolidateWorkspaceLayout(handle, canvases, activeCanvasId);
                consolidatedWorkspaceHandles.add(handle);
            } catch (e) {
                logWarning('FileSystem', 'Workspace consolidation skipped after failure', e instanceof Error ? e.message : 'unknown');
            }
        }

        return { canvases, images, activeCanvasId };
    },

    async consolidateWorkspaceLayout(
        handle: FileSystemDirectoryHandle,
        canvases: Canvas[] = [],
        activeCanvasId: string | null = null
    ): Promise<void> {
        // @ts-ignore
        const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS, { create: true });
        // @ts-ignore
        const thumbnailsDir = await handle.getDirectoryHandle(DIRS.THUMBNAILS, { create: true });
        // @ts-ignore
        const refsDir = await handle.getDirectoryHandle(DIRS.REFS, { create: true });

        let movedFiles = 0;
        let cleanedFolders = 0;
        let wroteRootProject = false;

        const moveManagedFiles = async (
            baseHandle: FileSystemDirectoryHandle,
            sourceDirName: string,
            kind: 'original' | 'thumbnail' | 'ref'
        ) => {
            try {
                // @ts-ignore
                const sourceDirHandle = await baseHandle.getDirectoryHandle(sourceDirName);

                // @ts-ignore
                for await (const entry of sourceDirHandle.values()) {
                    if (entry.kind !== 'file') continue;

                    const normalizedId = normalizeStoredFileId(entry.name);
                    if (!normalizedId) continue;

                    let targetDirHandle = originalsDir;
                    let targetFilename = entry.name;
                    let allowedPattern = MEDIA_EXTENSIONS;

                    if (kind === 'thumbnail') {
                        allowedPattern = THUMBNAIL_EXTENSIONS;
                        if (!allowedPattern.test(entry.name)) continue;
                        targetDirHandle = thumbnailsDir;
                        const ext = getFileExtension(entry.name, 'webp');
                        targetFilename = `${normalizedId}.${ext}`;
                    } else if (kind === 'ref') {
                        allowedPattern = /\.(png|jpe?g|webp|gif|bmp)$/i;
                        if (!allowedPattern.test(entry.name)) continue;
                        targetDirHandle = refsDir;
                        const ext = getFileExtension(entry.name, 'jpg');
                        targetFilename = `${normalizedId}.${ext}`;
                    } else {
                        if (!allowedPattern.test(entry.name)) continue;
                        targetDirHandle = originalsDir;
                        const ext = getFileExtension(entry.name, 'png');
                        targetFilename = `${normalizedId}.${ext}`;
                    }

                    const isAlreadyCanonicalLocation =
                        baseHandle === handle &&
                        ((kind === 'original' && sourceDirName === DIRS.ORIGINALS) ||
                            (kind === 'thumbnail' && sourceDirName === DIRS.THUMBNAILS) ||
                            (kind === 'ref' && sourceDirName === DIRS.REFS)) &&
                        entry.name === targetFilename;

                    if (!isAlreadyCanonicalLocation) {
                        const existingFileName = await findExistingFileNameByStoredId(targetDirHandle, normalizedId, allowedPattern);
                        if (!existingFileName) {
                            await copyFileBetweenDirectories(sourceDirHandle, entry.name, targetDirHandle, targetFilename);
                            movedFiles++;
                        }

                        await removeEntryIfExists(sourceDirHandle, entry.name);
                    }
                }

                if (
                    sourceDirName !== DIRS.ORIGINALS &&
                    sourceDirName !== DIRS.THUMBNAILS &&
                    sourceDirName !== DIRS.REFS &&
                    await isDirectoryEmpty(sourceDirHandle)
                ) {
                    await removeEntryIfExists(baseHandle, sourceDirName, true);
                    cleanedFolders++;
                }
            } catch {
                // ignore missing directory
            }
        };

        await moveManagedFiles(handle, DIRS.ORIGINALS, 'original');
        await moveManagedFiles(handle, DIRS.PICTURE, 'original');
        await moveManagedFiles(handle, DIRS.VIDEO, 'original');
        await moveManagedFiles(handle, DIRS.LEGACY, 'original');
        await moveManagedFiles(handle, DIRS.THUMBNAILS, 'thumbnail');
        await moveManagedFiles(handle, DIRS.REFS, 'ref');

        const nestedFolderNames: string[] = [];

        // @ts-ignore
        for await (const entry of handle.values()) {
            if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue;
            if (ALL_MANAGED_ROOT_DIRS.has(entry.name) || ROOT_CANONICAL_DIRS.has(entry.name)) continue;

            nestedFolderNames.push(entry.name);

            try {
                // @ts-ignore
                const projectDirHandle = await handle.getDirectoryHandle(entry.name);
                await moveManagedFiles(projectDirHandle, DIRS.ORIGINALS, 'original');
                await moveManagedFiles(projectDirHandle, DIRS.PICTURE, 'original');
                await moveManagedFiles(projectDirHandle, DIRS.VIDEO, 'original');
                await moveManagedFiles(projectDirHandle, DIRS.LEGACY, 'original');
                await moveManagedFiles(projectDirHandle, DIRS.THUMBNAILS, 'thumbnail');
                await moveManagedFiles(projectDirHandle, DIRS.REFS, 'ref');
            } catch {
                // ignore nested folder failure
            }
        }

        const sanitizedCanvases = sanitizeCanvasesForProjectFile(canvases);
        if (sanitizedCanvases.length > 0) {
            const { data: { session } } = await supabase.auth.getSession();
            const ownerId = session?.user?.id || 'local_user';
            const consolidatedState = {
                metadata: {
                    version: '4.0',
                    lastSaved: Date.now(),
                    ownerId,
                    mode: 'single_file_workspace'
                },
                activeCanvasId: activeCanvasId || sanitizedCanvases[0]?.id || null,
                canvases: sanitizedCanvases
            };

            // @ts-ignore
            const projectFile = await handle.getFileHandle(PROJECT_FILE, { create: true });
            // @ts-ignore
            const writable = await projectFile.createWritable();
            await writable.write(JSON.stringify(consolidatedState, null, 2));
            await writable.close();
            wroteRootProject = true;
        }

        for (const nestedFolderName of nestedFolderNames) {
            try {
                // @ts-ignore
                const projectDirHandle = await handle.getDirectoryHandle(nestedFolderName);
                const removeChildDirIfEmpty = async (dirName: string) => {
                    try {
                        // @ts-ignore
                        const childDirHandle = await projectDirHandle.getDirectoryHandle(dirName);
                        if (await isDirectoryEmpty(childDirHandle)) {
                            await removeEntryIfExists(projectDirHandle, dirName, true);
                        }
                    } catch {
                        // ignore missing directory
                    }
                };

                if (wroteRootProject) {
                    await removeEntryIfExists(projectDirHandle, PROJECT_FILE);
                }

                await removeChildDirIfEmpty(DIRS.PICTURE);
                await removeChildDirIfEmpty(DIRS.VIDEO);
                await removeChildDirIfEmpty(DIRS.ORIGINALS);
                await removeChildDirIfEmpty(DIRS.LEGACY);
                await removeChildDirIfEmpty(DIRS.THUMBNAILS);
                await removeChildDirIfEmpty(DIRS.REFS);
                await removeEntryIfExists(projectDirHandle, DIRS.SETTINGS, true);
                await removeEntryIfExists(projectDirHandle, DIRS.TAGS, true);
                await removeEntryIfExists(projectDirHandle, DIRS.CACHE, true);

                if (wroteRootProject && await isDirectoryEmpty(projectDirHandle)) {
                    await removeEntryIfExists(handle, nestedFolderName, true);
                    cleanedFolders++;
                }
            } catch {
                // ignore nested cleanup failure
            }
        }

        const removeRootDirIfEmpty = async (dirName: string) => {
            try {
                // @ts-ignore
                const childDirHandle = await handle.getDirectoryHandle(dirName);
                if (await isDirectoryEmpty(childDirHandle)) {
                    await removeEntryIfExists(handle, dirName, true);
                }
            } catch {
                // ignore missing directory
            }
        };

        await removeRootDirIfEmpty(DIRS.PICTURE);
        await removeRootDirIfEmpty(DIRS.VIDEO);
        await removeRootDirIfEmpty(DIRS.LEGACY);
        await removeEntryIfExists(handle, DIRS.SETTINGS, true);
        await removeEntryIfExists(handle, DIRS.TAGS, true);
        await removeEntryIfExists(handle, DIRS.CACHE, true);

        logInfo(
            'FileSystem',
            'Workspace consolidated',
            `movedFiles=${movedFiles}, cleanedFolders=${cleanedFolders}, wroteRootProject=${wroteRootProject}`
        );
    },
    /**
     * Get usage of images folder in bytes (Recursive)
     * [重构版] - 考虑到多项目架构，自动对所有子文档夹包含的内容进行统计
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

        logInfo('FileSystem', `已计算工作区大小`, `${fileCount} 个文档, ${totalSize} 字节`);
        return { size: totalSize, count: fileCount };
    },

    /**
     * 快速获取本地媒体 ID 集合（仅遍历文档名，不读取文档内容）
     * [重构版] - 作用域仅限于传入的句柄（如果传项目子文档夹，则扫子文档夹；如果传工作区根目录，会扫描一层深度的子文档夹）
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
            const readFromDirectories = async (
                baseHandle: FileSystemDirectoryHandle,
                dirNames: string[]
            ): Promise<Blob | null> => {
                for (const dirName of dirNames) {
                    try {
                        // @ts-ignore
                        const dirHandle = await baseHandle.getDirectoryHandle(dirName);
                        const existingFileName = await findExistingFileNameByStoredId(dirHandle, id, MEDIA_EXTENSIONS);
                        if (!existingFileName) continue;
                        // @ts-ignore
                        const fileHandle = await dirHandle.getFileHandle(existingFileName);
                        // @ts-ignore
                        return await fileHandle.getFile();
                    } catch {
                        // ignore missing directory
                    }
                }
                return null;
            };

            const rootFile = await readFromDirectories(handle, [
                DIRS.ORIGINALS,
                DIRS.PICTURE,
                DIRS.VIDEO,
                DIRS.LEGACY
            ]);
            if (rootFile) return rootFile;

            // @ts-ignore
            for await (const entry of handle.values()) {
                if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue;
                if (ALL_MANAGED_ROOT_DIRS.has(entry.name) || ROOT_CANONICAL_DIRS.has(entry.name)) continue;

                try {
                    // @ts-ignore
                    const projectDirHandle = await handle.getDirectoryHandle(entry.name);
                    const nestedFile = await readFromDirectories(projectDirHandle, [
                        DIRS.ORIGINALS,
                        DIRS.PICTURE,
                        DIRS.VIDEO,
                        DIRS.LEGACY
                    ]);
                    if (nestedFile) return nestedFile;
                } catch {
                    // ignore nested directory failure
                }
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
     * [重构版] - 统一写入根目录 originals/，不再拆分到子项目目录
     */
    async saveImageToHandle(handle: FileSystemDirectoryHandle, id: string, blob: Blob, isVideo: boolean = false, canvasDirName?: string): Promise<string> {
        try {
            // @ts-ignore
            const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS, { create: true });
            const existingFileName = await findExistingFileNameByStoredId(originalsDir, id, MEDIA_EXTENSIONS);
            if (existingFileName) {
                return existingFileName;
            }

            const ext = extensionFromMimeType(blob.type, isVideo ? 'mp4' : 'png');
            const filename = `${id}.${ext}`;

            // @ts-ignore
            const fileHandle = await originalsDir.getFileHandle(filename, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            logInfo(
                'FileSystem',
                `已保存${isVideo ? '视频' : '图片'}`,
                `${filename} (${Math.round(blob.size / 1024)}KB)${canvasDirName ? `, source=${canvasDirName}` : ''}`
            );
            return filename;
        } catch (e) {
            console.error('Failed to save image to handle', e);
            throw e;
        }
    },

    async saveThumbnailToHandle(handle: FileSystemDirectoryHandle, id: string, blob: Blob): Promise<string> {
        try {
            // @ts-ignore
            const thumbnailsDir = await handle.getDirectoryHandle(DIRS.THUMBNAILS, { create: true });
            const existingFileName = await findExistingFileNameByStoredId(thumbnailsDir, id, THUMBNAIL_EXTENSIONS);
            if (existingFileName) {
                return existingFileName;
            }

            const ext = extensionFromMimeType(blob.type, 'webp');
            const filename = `${id}.${ext}`;

            // @ts-ignore
            const fileHandle = await thumbnailsDir.getFileHandle(filename, { create: true });
            // @ts-ignore
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();

            logInfo('FileSystem', '已保存缩略图', `${filename} (${Math.round(blob.size / 1024)}KB)`);
            return filename;
        } catch (e) {
            console.error('Failed to save thumbnail to handle', e);
            throw e;
        }
    },

    /**
     * 🚀 从本地文档夹彻底删除图片或视频文档
     * [重构版] - 考虑到多项目结构体系，自动深入到所有可能的画板子文档夹进行全局清除
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
                            logInfo('FileSystem', `已从本地删除文档`, `${currentHandle.name}/${entry.name}`);
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
     * 使用 storageId 作为文档名，自动去重
     */
    async saveReferenceImage(handle: FileSystemDirectoryHandle, storageId: string, base64Data: string, mimeType: string = 'image/jpeg'): Promise<void> {
        try {
            // @ts-ignore
            const refsDir = await handle.getDirectoryHandle(DIRS.REFS, { create: true });
            const existingFileName = await findExistingFileNameByStoredId(refsDir, storageId, /\.(png|jpe?g|webp|gif|bmp)$/i);
            if (existingFileName) {
                console.log(`[FileSystem] 参考图已存在: ${storageId}`);
                return;
            }

            const filename = `${storageId}.jpg`;

            // 检查是否已存在（去重）
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
            const filename = await findExistingFileNameByStoredId(refsDir, storageId, /\.(png|jpe?g|webp|gif|bmp)$/i);
            if (!filename) {
                return null;
            }

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
            // 文档不存在
            return null;
        }
    },

    /**
     * Save the entire project state and new images
     * [重构版] - 统一写入根目录 project.json，卡片位置全部存一份
     */
    async saveProject(
        handle: FileSystemDirectoryHandle,
        state: { canvases: Canvas[], activeCanvasId: string },
        imagesToSave: Map<string, Blob>
    ): Promise<void> {
        try {
            // 🛡️ [防御性修复] 防止保存空数据导致 project.json 被清空
            if (!state.canvases || state.canvases.length === 0) {
                console.error('[FileSystem] 🚨 Aborting save: state.canvases is empty! This would corrupt project.json');
                throw new Error('Cannot save empty project: canvases array is empty');
            }

            const { data: { session } } = await supabase.auth.getSession();
            const ownerId = session?.user?.id || 'local_user';

            // 1. 获取并合并根目录的 project.json
            let finalCanvases = [...state.canvases];
            let existingCanvases: Canvas[] = [];
            try {
                // @ts-ignore
                const rootFile = await handle.getFileHandle(PROJECT_FILE);
                // @ts-ignore
                const text = await (await rootFile.getFile()).text();
                const rootData = JSON.parse(text);
                existingCanvases = rootData.canvases || (rootData.canvas ? [rootData.canvas] : []);

                // 🛡️ [防御性修复] 如果内存中的 canvases 数量显著少于磁盘中的，可能是数据丢失
                if (existingCanvases.length > 0 && state.canvases.length < existingCanvases.length / 2) {
                    console.warn('[FileSystem] ⚠️ Memory has significantly fewer canvases than disk:', {
                        memory: state.canvases.length,
                        disk: existingCanvases.length
                    });
                }

                // 以当前内存 state 为准合并（更新已有或添加新项）
                const mergedMap = new Map<string, Canvas>();
                // 先加载文档中已有的
                existingCanvases.forEach((c: Canvas) => mergedMap.set(c.id, c));
                // 再覆盖内存中最新的
                finalCanvases.forEach((c: Canvas) => mergedMap.set(c.id, c));
                finalCanvases = Array.from(mergedMap.values());
            } catch (e) {
                // 如果文档不存在，则直接使用传入的 canvases
                console.log('[FileSystem] No existing project.json found, creating new one');
            }

            // 🛡️ [最终检查] 确保 finalCanvases 不为空
            if (finalCanvases.length === 0) {
                console.error('[FileSystem] 🚨 CRITICAL: finalCanvases is empty after merge! Aborting save to prevent data loss.');
                throw new Error('Cannot save: final canvases array is empty after merge');
            }

            const sanitizedCanvases = sanitizeCanvasesForProjectFile(finalCanvases);

            // 2. 写入根目录 project.json
            const consolidatedState = {
                metadata: {
                    version: '4.0',
                    lastSaved: Date.now(),
                    ownerId,
                    mode: 'single_file_workspace'
                },
                activeCanvasId: state.activeCanvasId || sanitizedCanvases[0]?.id || null,
                canvases: sanitizedCanvases
            };

            // @ts-ignore
            const projectFile = await handle.getFileHandle(PROJECT_FILE, { create: true });
            // @ts-ignore
            const writable = await projectFile.createWritable();
            await writable.write(JSON.stringify(consolidatedState, null, 2));
            await writable.close();

            // 3. 增量保存原图到根目录 originals/
            if (imagesToSave.size > 0) {
                // @ts-ignore
                const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS, { create: true });

                for (const [id, blob] of imagesToSave.entries()) {
                    const existingFileName = await findExistingFileNameByStoredId(originalsDir, id, MEDIA_EXTENSIONS);
                    if (existingFileName) continue;
                    await this.saveImageToHandle(handle, id, blob, false);
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
                if (entry.kind === 'file' && /\.(png|jpe?g|webp|gif|bmp)$/i.test(entry.name)) {
                    const storageId = normalizeStoredFileId(entry.name);
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
     * 在 picture/tags/{tagName}/ 或 video/tags/{tagName}/ 下创建指向原文档的.url快捷方式
     */
    async createTagShortcut(handle: FileSystemDirectoryHandle, tag: string, filename: string, isVideo: boolean = false): Promise<void> {
        logInfo('FileSystem', '跳过标签快捷方式', `${tag}/${filename}`);
    },

    /**
     * 🚀 删除标签快捷链接
     */
    async removeTagShortcut(handle: FileSystemDirectoryHandle, tag: string, filename: string, isVideo: boolean = false): Promise<void> {
        logInfo('FileSystem', '跳过删除标签快捷方式', `${tag}/${filename}`);
    },

    /**
     * 🚀 清理空的标签文档夹
     */
    async cleanupEmptyTagFolder(handle: FileSystemDirectoryHandle, tag: string, isVideo: boolean = false): Promise<void> {
        logInfo('FileSystem', '跳过标签目录清理', tag);
    },

    /**
     * 🚀 为文档的所有标签创建快捷链接
     */
    async syncFileTagShortcuts(handle: FileSystemDirectoryHandle, filename: string, tags: string[], isVideo: boolean = false): Promise<void> {
        logInfo('FileSystem', '跳过批量标签快捷方式', `${filename} (${tags.length})`);
    },

    /**
     * 🚀 保存布局和设置到 settings/ 目录
     */
    async saveSettings(handle: FileSystemDirectoryHandle, settings: Record<string, any>): Promise<void> {
        logInfo('FileSystem', '跳过文件系统设置保存', Object.keys(settings || {}).join(','));
    },

    /**
     * 🚀 加载布局和设置
     */
    async loadSettings(handle: FileSystemDirectoryHandle): Promise<Record<string, any> | null> {
        return null;
    },

    /**
     * 🚀 迁移旧文档到新目录结构
     * 将 originals/ 和 images/ 中的文档移动到 picture/ 或 video/
     * 并重命名为 YYYYMM_{id}.{ext} 格式
     * @returns 迁移的文档数量和ID映射
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

                    // 读取文档
                    // @ts-ignore
                    const file = await entry.getFile();

                    // 保存到新目录
                    const targetDirName = isVideo ? DIRS.VIDEO : DIRS.PICTURE;
                    // @ts-ignore
                    const targetDir = await handle.getDirectoryHandle(targetDirName, { create: true });

                    // 检查新文档是否已存在
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

                    // 删除旧文档
                    // @ts-ignore
                    await legacyDir.removeEntry(entry.name);

                    idMapping.set(oldId, newFilename);
                    count++;

                    logInfo('FileSystem', `已迁移文档`, `${entry.name} -> ${targetDirName}/${newFilename}`);
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
            logInfo('FileSystem', `迁移完成`, `共迁移 ${count} 个文档`);
        }

        return { count, idMapping };
    }
};
