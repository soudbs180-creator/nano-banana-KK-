/**
 * Storage Preference Service
 * Manages user's storage mode preference (local folder vs browser IndexedDB vs OPFS)
 */

import { supabase } from '../lib/supabase';

// 🚀 新增OPFS模式支持手机端
export type StorageMode = 'local' | 'browser' | 'opfs';

const FOLDER_HANDLE_KEY = 'kk_studio_local_folder_handle';
const STORAGE_MODE_KEY = 'kk_studio_storage_mode';

// In-memory cache
let cachedMode: StorageMode | null = null;
let cachedFolderHandle: FileSystemDirectoryHandle | null = null;

/**
 * Check if File System Access API is supported (PC端)
 */
export function isFileSystemAccessSupported(): boolean {
    return 'showDirectoryPicker' in window;
}

/**
 * Check if OPFS is supported (手机端)
 */
export function isOPFSSupported(): boolean {
    return 'storage' in navigator && 'getDirectory' in navigator.storage;
}

/**
 * 是否为移动设备
 */
export function isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * 获取推荐的存储模式
 * PC端推荐local，手机端推荐opfs
 */
export function getRecommendedStorageMode(): StorageMode {
    if (isFileSystemAccessSupported() && !isMobileDevice()) {
        return 'local';
    } else if (isOPFSSupported()) {
        return 'opfs';
    } else {
        return 'browser';
    }
}

/**
 * Get storage mode from localStorage (browser local, not cloud)
 */
export async function getStorageMode(): Promise<StorageMode | null> {
    if (cachedMode) return cachedMode;

    try {
        const stored = localStorage.getItem(STORAGE_MODE_KEY);
        cachedMode = stored as StorageMode || null;
        return cachedMode;
    } catch (e) {
        console.error('[StoragePreference] Error getting storage mode:', e);
        return null;
    }
}

/**
 * Set storage mode in localStorage (browser local, not cloud)
 */
export async function setStorageMode(mode: StorageMode): Promise<boolean> {
    try {
        localStorage.setItem(STORAGE_MODE_KEY, mode);
        cachedMode = mode;

        import('./notificationService').then(({ notify }) => {
            notify.success('存储设置成功', mode === 'browser' ? '原图将保存在浏览器中' : '原图将保存到本地文件夹');
        });
        return true;
    } catch (e: any) {
        console.error('[StoragePreference] Error setting storage mode:', e);
        import('./notificationService').then(({ notify }) => {
            notify.error(
                '存储设置失败',
                '无法保存设置',
                `LocalStorage Error: ${e.message || e}`
            );
        });
        return false;
    }
}

/**
 * Get local folder handle from IndexedDB
 */
export async function getLocalFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (cachedFolderHandle) {
        // Verify permission is still valid
        try {
            // File System Access API extensions - not in standard types
            const permission = await (cachedFolderHandle as any).queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') return cachedFolderHandle;
        } catch {
            cachedFolderHandle = null;
        }
    }

    try {
        const db = await openFolderHandleDB();
        return new Promise((resolve) => {
            const tx = db.transaction('handles', 'readonly');
            const store = tx.objectStore('handles');
            const request = store.get(FOLDER_HANDLE_KEY);
            request.onsuccess = () => {
                cachedFolderHandle = request.result?.handle || null;
                resolve(cachedFolderHandle);
            };
            request.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

/**
 * Set local folder handle in IndexedDB
 */
export async function setLocalFolderHandle(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        const db = await openFolderHandleDB();
        return new Promise((resolve) => {
            const tx = db.transaction('handles', 'readwrite');
            const store = tx.objectStore('handles');
            const request = store.put({ id: FOLDER_HANDLE_KEY, handle });
            request.onsuccess = () => {
                cachedFolderHandle = handle;
                resolve(true);
            };
            request.onerror = () => resolve(false);
        });
    } catch {
        return false;
    }
}

/**
 * Attempt to restore local folder handle with user permission
 * Must be called inside a user gesture (e.g., button click)
 */
export async function restoreLocalFolderConnection(): Promise<FileSystemDirectoryHandle | null> {
    if (!isFileSystemAccessSupported()) return null;

    try {
        const handle = await getLocalFolderHandle();
        if (!handle) return null;

        // "readwrite" permission is required for saving changes.
        // requestPermission MUST be called in a user gesture context.
        // If we are here, we assume the caller is wrapping this in a click handler.
        const headerPermission = await (handle as any).requestPermission({ mode: 'readwrite' });

        if (headerPermission === 'granted') {
            return handle;
        }
        return null;
    } catch (e) {
        console.error('[StoragePreference] Permission restore failed:', e);
        return null;
    }
}

/**
 * Prompt user to select local folder
 */
export async function selectLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
    if (!isFileSystemAccessSupported()) {
        console.warn('[StoragePreference] File System Access API not supported');
        return null;
    }

    try {
        const handle = await (window as any).showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'pictures'
        });
        await setLocalFolderHandle(handle);

        // 🚀 Auto-merge existing images to the new folder
        await mergeStorages();

        return handle;
    } catch (e: any) {
        if (e.name !== 'AbortError') {
            console.error('[StoragePreference] Folder selection failed:', e);
            // Dynamic import of notify for error display
            import('./notificationService').then(({ notify }) => {
                notify.error(
                    '文件夹选择失败',
                    '无法获取文件夹访问权限',
                    `StoragePreference Error: ${e.message || e}`
                );
            });
        }
        return null;
    }
}

/**
 * Save original image to local folder
 */
export async function saveOriginalToLocalFolder(
    imageId: string,
    blob: Blob,
    prompt?: string,
    existingTimestamp?: number
): Promise<boolean> {
    const handle = await getLocalFolderHandle();
    if (!handle) {
        console.warn('[StoragePreference] No local folder handle available');
        return false;
    }

    try {
        // Request permission if needed
        const permission = await (handle as any).requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') return false;

        // Ensure originals directory exists
        const DIRS = { ORIGINALS: 'originals' };
        // @ts-ignore
        const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS, { create: true });

        // Generate filename: YYYY-MM-{id}.png
        // Use existing timestamp if available (for merge), otherwise current time
        const date = existingTimestamp ? new Date(existingTimestamp) : new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const filename = `${year}-${month}-${imageId}.png`;

        // Create file and write
        // @ts-ignore
        const fileHandle = await originalsDir.getFileHandle(filename, { create: true });
        // @ts-ignore
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();

        console.log(`[StoragePreference] Saved to originals: ${filename}`);
        return true;
    } catch (e) {
        console.error('[StoragePreference] Failed to save to local folder:', e);
        return false;
    }
}

/**
 * Merge browser cache images into local folder
 * Prevents data loss when switching storage modes
 */
export async function mergeStorages(): Promise<void> {
    const handle = await getLocalFolderHandle();
    if (!handle) return;

    console.log('[StoragePreference] Starting storage merge...');

    try {
        // Dynamic import to avoid circular dependencies
        const { getAllImageIds, getImage, getImageMetadata } = await import('./imageStorage');
        const { dataURLToBlob } = await import('./blobUtils');

        const ids = await getAllImageIds();
        console.log(`[StoragePreference] Found ${ids.length} images in browser cache to check`);

        let mergedCount = 0;
        let skippedCount = 0;

        // Notify user about start
        import('./notificationService').then(({ notify }) => {
            notify.info('正在同步图片', `正在将 ${ids.length} 张图片同步到本地文件夹...`);
        });

        for (const id of ids) {
            const metadata = await getImageMetadata(id);
            const timestamp = metadata?.timestamp;

            // Check if file already exists locally to skip
            // We can predict the filename now!
            if (timestamp) {
                const date = new Date(timestamp);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const filename = `${year}-${month}-${id}.png`;

                try {
                    const DIRS = { ORIGINALS: 'originals' };
                    // @ts-ignore
                    const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS);
                    // @ts-ignore
                    await originalsDir.getFileHandle(filename);
                    // If found, skip!
                    skippedCount++;
                    continue;
                } catch {
                    // Not found, proceed to save
                }
            }

            const dataUrl = await getImage(id);
            if (dataUrl) {
                const blob = await dataURLToBlob(dataUrl);
                if (blob) {
                    // Pass timestamp to ensure correct filename
                    const saved = await saveOriginalToLocalFolder(id, blob, undefined, timestamp);
                    if (saved) mergedCount++;
                } else {
                    console.warn(`[StoragePreference] Skipping ${id}: invalid data URL`);
                }
            }
        }

        console.log(`[StoragePreference] Merge complete. Synced ${mergedCount} images, skipped ${skippedCount}.`);

        if (mergedCount > 0 || skippedCount > 0) {
            import('./notificationService').then(({ notify }) => {
                notify.success('同步完成', `成功同步 ${mergedCount} 张图片，跳过 ${skippedCount} 张重复图片`);
            });
        }


    } catch (e) {
        console.error('[StoragePreference] Merge failed:', e);
        import('./notificationService').then(({ notify }) => {
            notify.error('同步失败', '合并存储时发生错误');
        });
    }
}

/**
 * Clear cached data (on logout)
 */
export function clearStoragePreferenceCache(): void {
    cachedMode = null;
    cachedFolderHandle = null;
}

// --- Internal: IndexedDB for folder handle ---
let folderHandleDB: IDBDatabase | null = null;

function openFolderHandleDB(): Promise<IDBDatabase> {
    if (folderHandleDB) return Promise.resolve(folderHandleDB);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open('kk_studio_folder_handles', 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore('handles', { keyPath: 'id' });
        };
        request.onsuccess = () => {
            folderHandleDB = request.result;
            resolve(folderHandleDB);
        };
        request.onerror = () => reject(request.error);
    });
}
