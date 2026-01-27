
/**
 * Converts a Base64 Data URI to a Blob object.
 * This is used to store images as Blobs in memory (via URL.createObjectURL) 
 * instead of large Base64 strings, significantly reducing React State overhead.
 * 
 * @param dataURI The full data URI (e.g., "data:image/png;base64,iVBORw0KGgo...")
 * @returns Blob object
 */
export const base64ToBlob = (dataURI: string): Blob => {
    // Split metadata from data
    const splitDataURI = dataURI.split(',');
    const byteString = atob(splitDataURI[1]);
    const mimeString = splitDataURI[0].split(':')[1].split(';')[0];

    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);

    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ab], { type: mimeString });
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
