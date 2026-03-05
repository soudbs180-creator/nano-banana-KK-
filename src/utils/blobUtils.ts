
/**
 * Converts a Base64 Data URI to a Blob object.
 * This is used to store images as Blobs in memory (via URL.createObjectURL) 
 * instead of large Base64 strings, significantly reducing React State overhead.
 * 
 * @param dataURI The full data URI (e.g., "data:image/png;base64,iVBORw0KGgo...")
 * @returns Blob object
 */
export const dataURLToBlob = (dataURI: string): Blob => {
    try {
        // Split metadata from data
        const splitDataURI = dataURI.split(',');
        if (splitDataURI.length !== 2) {
            console.error('[blobUtils] Invalid data URI format');
            return new Blob([], { type: 'image/png' });
        }

        // 进一步清理 base64 中的所有潜在非法字符，仅保留合法的 base64 字符
        const base64Data = splitDataURI[1].trim();
        const cleanBase64 = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');

        try {
            const byteString = atob(cleanBase64);
            const mimeString = splitDataURI[0].split(':')[1].split(';')[0];

            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);

            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }

            return new Blob([ab], { type: mimeString });
        } catch (e) {
            console.error('[blobUtils] atob failed for string:', cleanBase64.slice(0, 50) + '...', e);
            return new Blob([], { type: 'image/png' });
        }
    } catch (error: any) {
        console.error('[blobUtils] dataURLToBlob fatal error:', error.message);
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
