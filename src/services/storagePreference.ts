/**
 * Storage Preference Service
 * Manages user's storage mode preference (local folder vs browser IndexedDB)
 */

import { supabase } from '../lib/supabase';

export type StorageMode = 'local' | 'browser';

const FOLDER_HANDLE_KEY = 'kk_studio_local_folder_handle';
const STORAGE_MODE_KEY = 'kk_studio_storage_mode';

// In-memory cache
let cachedMode: StorageMode | null = null;
let cachedFolderHandle: FileSystemDirectoryHandle | null = null;

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
    return 'showDirectoryPicker' in window;
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
    prompt?: string
): Promise<boolean> {
    const handle = await getLocalFolderHandle();
    if (!handle) {
        console.warn('[StoragePreference] No local folder handle available');
        return false;
    }

    try {
        // Request permission if needed (File System Access API extension)
        const permission = await (handle as any).requestPermission({ mode: 'readwrite' });
        if (permission !== 'granted') return false;

        // Ensure originals directory exists
        const DIRS = { ORIGINALS: 'originals' }; // Match fileSystemService
        // @ts-ignore
        const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS, { create: true });

        // Use consistent naming: ID.png (prevents duplicates and confusion)
        const filename = `${imageId}.png`;

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
