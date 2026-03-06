/**
 * Blob URL utilities
 */

/**
 * Convert a data/blob URL into Blob.
 * Returns null instead of throwing on parse failure.
 */
export async function dataURLToBlob(dataURL: string): Promise<Blob | null> {
    if (dataURL.startsWith('blob:')) {
        try {
            const response = await fetch(dataURL);
            if (response.ok) {
                return response.blob();
            }
        } catch (e) {
            console.warn('[blobUtils] Blob URL invalid or expired:', dataURL.slice(0, 50));
        }
        return null;
    }

    if (dataURL.startsWith('data:')) {
        try {
            const [header, payload] = dataURL.split(',');
            if (!payload) {
                console.warn('[blobUtils] Invalid data URL format');
                return null;
            }

            const mimeMatch = header.match(/data:([^;]+)/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

            if (!/;base64/i.test(header)) {
                const decoded = decodeURIComponent(payload);
                return new Blob([decoded], { type: mimeType });
            }

            const normalizedBase64 = payload
                .replace(/[\s\r\n]+/g, '')
                .replace(/-/g, '+')
                .replace(/_/g, '/');
            const paddedBase64 = normalizedBase64.padEnd(
                normalizedBase64.length + ((4 - normalizedBase64.length % 4) % 4),
                '=',
            );

            const byteString = atob(paddedBase64);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);

            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }

            return new Blob([ab], { type: mimeType });
        } catch (e) {
            console.error('[blobUtils] Failed to parse data URL:', e);
            return null;
        }
    }

    console.warn('[blobUtils] Unknown URL format:', dataURL.slice(0, 50));
    return null;
}

/**
 * Convert Blob to data URL.
 */
export async function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Create blob URL.
 */
export function createBlobURL(blob: Blob): string {
    return URL.createObjectURL(blob);
}

/**
 * Revoke blob URL.
 */
export function revokeBlobURL(url: string): void {
    if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
    }
}
