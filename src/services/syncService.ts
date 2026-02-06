import { supabase } from '../lib/supabase';
import { compressImage } from './imageCompression';
import { Canvas } from '../types';

const BUCKET_NAME = 'generated-images';
const THUMB_SUFFIX = '_thumb.jpg';

/**
 * Service to handle Cloud Sync (Database + Storage)
 */
export const syncService = {
    // --- Database Sync (Canvas State) ---

    async saveLayout(canvases: Canvas[]) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
            const blob = new Blob([JSON.stringify(canvases)], { type: 'application/json' });
            const fileName = `${user.id}/layout.json`;

            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(fileName, blob, {
                    contentType: 'application/json',
                    upsert: true
                });

            if (error) throw error;
            console.log('[SyncService] Layout saved to cloud');
        } catch (e) {
            console.error('[SyncService] Failed to save layout:', e);
        }
    },

    async loadLayout(): Promise<Canvas[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        try {
            const fileName = `${user.id}/layout.json`;
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .download(fileName);

            if (error) {
                // If file not found, return empty (clean state)
                if (error.message.includes('not found') || error.name === 'StorageUnknownError') return [];
                throw error;
            }

            const text = await data.text();
            const canvases = JSON.parse(text) as Canvas[];
            return canvases;
        } catch (e) {
            console.error('[SyncService] Failed to load layout:', e);
            return [];
        }
    },

    // --- Storage Sync (Images) ---

    async uploadImagePair(id: string, blob: Blob): Promise<{ original: string, thumbnail: string }> {
        // DISABLE CLOUD UPLOAD
        // Return local blob URLs to satisfy interface, or empty strings.
        // The app should handle 'blob:' URLs correctly (which it does).
        // To be safe, we create a persistent ObjectURL if not already handled by caller,
        // but typically the caller (CanvasContext) already has the blob URL.
        const localUrl = URL.createObjectURL(blob);
        return { original: localUrl, thumbnail: localUrl };
    },

    // --- Cleanup Utilities ---

    /**
     * Delete ALL files in the user's cloud storage folder.
     * This allows users to wipe their cloud footprint for images.
     */
    async cleanupAllCloudImages(): Promise<{ count: number; success: boolean }> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not logged in');

        let totalDeleted = 0;
        let hasMore = true;

        try {
            while (hasMore) {
                // List files (Supabase list limit is usually 100)
                const { data: files, error } = await supabase.storage
                    .from(BUCKET_NAME)
                    .list(user.id, { limit: 100 });

                if (error) throw error;
                if (!files || files.length === 0) {
                    hasMore = false;
                    break;
                }

                const filesToDelete = files.map(f => `${user.id}/${f.name}`);
                const { error: deleteError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .remove(filesToDelete);

                if (deleteError) throw deleteError;

                totalDeleted += filesToDelete.length;
                console.log(`[Cloud Cleanup] Deleted batch of ${filesToDelete.length} files.`);
            }

            return { count: totalDeleted, success: true };
        } catch (e) {
            console.error('[Cloud Cleanup] Failed:', e);
            throw e;
        }
    },

    // Internal: Upload with Auto-Cleanup logic (Deprecated/Unused)
    async _uploadWithQuotaCheck(path: string, blob: Blob, retryCount = 0): Promise<void> {
        // No-op
        return;
    },

    // Internal: Cleanup Logic (Deprecated/Unused)
    async _cleanupOldestImages(count: number) {
        // No-op
    }
};
