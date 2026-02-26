
/**
 * Converts a Base64 Data URI to a Blob object.
 * This is used to store images as Blobs in memory (via URL.createObjectURL) 
 * instead of large Base64 strings, significantly reducing React State overhead.
 * 
 * @param dataURI The full data URI (e.g., "data:image/png;base64,iVBORw0KGgo...")
 * @returns Blob object
 */
export const base64ToBlob = (dataURI: string): Blob => {
    try {
        // Split metadata from data
        const splitDataURI = dataURI.split(',');
        if (splitDataURI.length !== 2) {
            console.error('[blobUtils] Invalid data URI format');
            return new Blob([], { type: 'image/png' });
        }

        const byteString = atob(splitDataURI[1]); // ⚠️ 可能抛出InvalidCharacterError
        const mimeString = splitDataURI[0].split(':')[1].split(';')[0];

        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);

        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }

        return new Blob([ab], { type: mimeString });
    } catch (error: any) {
        console.debug('[blobUtils] base64ToBlob failed:', error.message);
        // 🚀 [关键修复] 返回空Blob而不是崩溃
        return new Blob([], { type: 'image/png' });
    }
};

/**
 * Revokes a Blob URL to free memory.
 * Safe to call even if url is not a blob url (ignores it).
 */
export const safeRevokeBlobUrl = (url?: string) => {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
};
