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
        logInfo('FileSystem', `User selected directory: ${handle.name}`);
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
        // @ts-ignore
        const thumbsDir = await handle.getDirectoryHandle(DIRS.THUMBNAILS, { create: true });

        // 2. Save Images (Originals & Thumbs)
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
                logError('FileSystem', err, `Failed to save original ${id}`);
            }

            // B. Generate and Save Thumbnail (if large or always for consistency)
            try {
                // Generate thumb blob
                const originalUrl = URL.createObjectURL(blob);
                const thumbBlob = await compressImageBlob(originalUrl, 300);
                URL.revokeObjectURL(originalUrl);

                // Save Thumb
                // @ts-ignore
                const thumbHandle = await thumbsDir.getFileHandle(filename, { create: true });
                // @ts-ignore
                const writable = await thumbHandle.createWritable();
                await writable.write(thumbBlob);
                await writable.close();
            } catch (err) {
                console.warn(`Failed to save thumbnail for ${id}`, err);
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

        logInfo('FileSystem', `Loading project from: ${handle.name}`);

        // 1. Load Project JSON
        try {
            // @ts-ignore
            const projectHandle = await handle.getFileHandle(PROJECT_FILE);
            // @ts-ignore
            const file = await projectHandle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);
            canvases = data.canvases || [];
            logInfo('FileSystem', `Loaded project.json`, `${canvases.length} canvases found`);
        } catch (e) {
            logInfo('FileSystem', 'No existing project.json found, starting fresh.');
        }

        // 2. Load All Images & Generate Thumbs if needed
        let imagesDir: FileSystemDirectoryHandle | null = null;
        try {
            // @ts-ignore
            imagesDir = await handle.getDirectoryHandle(DIRS.ORIGINALS);
            logInfo('FileSystem', `Found originals directory`);
        } catch (e) {
            try {
                // Fallback to legacy 'images' folder
                // @ts-ignore
                imagesDir = await handle.getDirectoryHandle(DIRS.LEGACY);
                logWarning('FileSystem', `Using legacy 'images' directory`);
            } catch (e2) {
                logWarning('FileSystem', `No images directory found (originals/images)`);
            }
        }

        if (imagesDir) {
            try {
                let count = 0;
                // @ts-ignore
                for await (const entry of imagesDir.values()) {
                    if (entry.kind === 'file' && (entry.name.endsWith('.png') || entry.name.endsWith('.jpg') || entry.name.endsWith('.webp'))) {
                        count++;
                        const id = entry.name.replace(/\.(png|jpg|webp)$/, '');
                        try {
                            // @ts-ignore
                            const file = await entry.getFile();
                            const originalUrl = URL.createObjectURL(file);

                            // If file is large (> 1MB), generate thumbnail for UI performance
                            if (file.size > 1024 * 1024) {
                                try {
                                    const thumbBlob = await compressImageBlob(originalUrl, 300); // Max 300px
                                    const thumbUrl = URL.createObjectURL(thumbBlob);
                                    images.set(id, { url: thumbUrl, originalUrl });
                                } catch (err) {
                                    console.warn(`Failed to generate thumb for ${id}, using original`, err);
                                    images.set(id, { url: originalUrl, originalUrl });
                                }
                            } else {
                                // Small enough, just use original
                                images.set(id, { url: originalUrl, originalUrl });
                            }
                        } catch (e) {
                            logError('FileSystem', e, `Failed to load image ${id}`);
                        }
                    }
                }
                logInfo('FileSystem', `Loaded ${count} images from disk`);
            } catch (e) {
                logError('FileSystem', e, "Error iterating images directory");
            }
        }

        return { canvases, images };
    },
    /**
     * Get usage of images folder in bytes
     */
    async getFolderUsage(handle: FileSystemDirectoryHandle): Promise<number> {
        let size = 0;
        let fileCount = 0;

        // 1. Count files in the ROOT directory (Legacy behavior often saved here)
        try {
            // @ts-ignore
            for await (const entry of handle.values()) {
                if (entry.kind === 'file') {
                    // @ts-ignore
                    const file = await entry.getFile();
                    size += file.size;
                    fileCount++;
                }
            }
        } catch (e) {
            console.warn('Failed to count root files', e);
        }

        // 2. Count specific subdirectories
        const countDir = async (dirName: string) => {
            try {
                // @ts-ignore
                const dirHandle = await handle.getDirectoryHandle(dirName);
                // @ts-ignore
                for await (const entry of dirHandle.values()) {
                    if (entry.kind === 'file') {
                        // @ts-ignore
                        const file = await entry.getFile();
                        size += file.size;
                        fileCount++;
                    }
                }
            } catch (e) {
                // Directory might not exist
            }
        };

        await countDir(DIRS.ORIGINALS);
        // await countDir(DIRS.LEGACY); // DIRS.LEGACY is 'images', only count if it exists as subfolder
        // Note: If files are in root, step 1 covers them. If in 'images' folder, this covers them.
        await countDir(DIRS.LEGACY);
        await countDir(DIRS.THUMBNAILS);

        logInfo('FileSystem', `Calculated folder usage`, `${fileCount} files, ${size} bytes`);
        return size;
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
     * Cleanup local folder: Replace huge images with thumbnails
     * Note: With new V2 structure, this might be less relevant or should target ORIGINALS?
     * Actually, if we have ORIGINALS, we probably don't want to destroy them.
     * Maybe this function should now just ensure thumbnails exist?
     * For now, let's keep it but targeting ORIGINALS would be destructive.
     * Let's change it to: Generate Missing Thumbnails.
     */
    async cleanupLocalFolder(handle: FileSystemDirectoryHandle): Promise<{ count: number, savedBytes: number }> {
        // Renamed logic: Ensure Thumbs
        let count = 0;
        try {
            // @ts-ignore
            const originalsDir = await handle.getDirectoryHandle(DIRS.ORIGINALS);
            // @ts-ignore
            const thumbsDir = await handle.getDirectoryHandle(DIRS.THUMBNAILS, { create: true });

            // @ts-ignore
            for await (const entry of originalsDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.png')) {
                    try {
                        // Check if thumb exists
                        try {
                            // @ts-ignore
                            await thumbsDir.getFileHandle(entry.name);
                        } catch (e) {
                            // Thumb missing, generate!
                            // @ts-ignore
                            const file = await entry.getFile();
                            const url = URL.createObjectURL(file);
                            const thumbBlob = await compressImageBlob(url, 300);
                            URL.revokeObjectURL(url);

                            // @ts-ignore
                            const newThumb = await thumbsDir.getFileHandle(entry.name, { create: true });
                            // @ts-ignore
                            const writable = await newThumb.createWritable();
                            await writable.write(thumbBlob);
                            await writable.close();
                            count++;
                        }
                    } catch (e) { }
                }
            }
        } catch (e) {
            logError('FileSystem', e, 'Cleanup/Thumb gen failed');
        }

        return { count, savedBytes: 0 }; // Bytes saved is N/A as we are generating new files
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

            // 2. Move Folders (Originals, Thumbs, etc)
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
            await moveDir(DIRS.THUMBNAILS);
            await moveDir(DIRS.LEGACY); // Move legacy images if present too

        } catch (error) {
            console.error('Failed to move project:', error);
            throw new Error('Migration failed: ' + (error as any).message);
        }
    }
};

// Helper: Compress to Blob
function compressImageBlob(dataUrl: string, maxDimension: number): Promise<Blob> {
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

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Blob creation failed'));
            }, 'image/jpeg', 0.7);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
    });
}
