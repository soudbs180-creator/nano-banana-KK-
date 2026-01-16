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

    async saveCanvas(canvas: Canvas) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        // Strip heavy data if any remains (though IndexedDB handles images, we ensure JSON is light)
        const lightCanvas = {
            ...canvas,
            // Ensure no base64 creeps in
            imageNodes: canvas.imageNodes.map(img => ({
                ...img,
                url: img.url.startsWith('data:') ? '' : img.url // Only save remote URLs or empty (if local references exist)
            }))
        };

        const { error } = await supabase
            .from('user_canvases')
            .upsert({
                user_id: user.id,
                canvas_id: canvas.id,
                name: canvas.name,
                data: lightCanvas,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, canvas_id' });

        if (error) throw error;
    },

    async loadCanvases(): Promise<Canvas[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('user_canvases')
            .select('data')
            .eq('user_id', user.id);

        if (error) throw error;
        return data.map(row => row.data as Canvas);
    },

    // --- Storage Sync (Images) ---

    async uploadImagePair(id: string, blob: Blob): Promise<{ original: string, thumbnail: string }> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not logged in');

        const pathOriginal = `${user.id}/${id}.png`;
        const pathThumb = `${user.id}/${id}${THUMB_SUFFIX}`;

        // 1. Generate Thumbnail
        const thumbBlob = await compressImage(blob, { maxWidth: 512, quality: 0.7, type: 'image/jpeg' });

        try {
            // 2. Upload Thumbnail First (Smaller, faster)
            await this._uploadWithQuotaCheck(pathThumb, thumbBlob);

            // 3. Upload Original
            await this._uploadWithQuotaCheck(pathOriginal, blob);

            // 4. Get Public URLs
            const { data: { publicUrl: thumbUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(pathThumb);
            const { data: { publicUrl: origUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(pathOriginal);

            return { original: origUrl, thumbnail: thumbUrl };
        } catch (e: any) {
            console.error('Upload failed:', e);
            throw e;
        }
    },

    // Internal: Upload with Auto-Cleanup logic
    async _uploadWithQuotaCheck(path: string, blob: Blob, retryCount = 0): Promise<void> {
        const { error } = await supabase.storage.from(BUCKET_NAME).upload(path, blob, { upsert: true });

        if (error) {
            // Check for Quota Exceeded (Supabase returns 400 or specific error for limits)
            // Note: Supabase error codes vary, assuming generic storage error implies potential full if not auth
            if ((error.message.includes('Quota') || error.message.includes('Limit') || (error as any).statusCode === 413) && retryCount < 3) {
                console.warn('Storage Quota exceeded. Triggering cleanup...');
                await this._cleanupOldestImages(5); // Delete 5 oldest
                return this._uploadWithQuotaCheck(path, blob, retryCount + 1);
            }
            throw error;
        }
    },

    // Internal: Cleanup Logic
    async _cleanupOldestImages(count: number) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // List files
        const { data: files, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list(user.id, { sortBy: { column: 'created_at', order: 'asc' }, limit: 20 });

        if (error || !files) return;

        // Identify oldest files
        // We delete both .png and _thumb.jpg pairs when possible, but simply deleting oldest items works too
        const filesToDelete = files.slice(0, count * 2).map(f => `${user.id}/${f.name}`);

        if (filesToDelete.length > 0) {
            console.log(`Auto-Cleanup: Deleting ${filesToDelete.length} old files`, filesToDelete);
            await supabase.storage.from(BUCKET_NAME).remove(filesToDelete);
        }
    }
};
