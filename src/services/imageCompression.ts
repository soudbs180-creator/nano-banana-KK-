/**
 * Image Compression Service
 * Used to generate lightweight thumbnails for cloud storage.
 */

interface CompressionOptions {
    maxWidth: number;
    quality: number; // 0 to 1
    type: 'image/jpeg' | 'image/webp';
}

const DEFAULT_OPTIONS: CompressionOptions = {
    maxWidth: 512,
    quality: 0.7,
    type: 'image/jpeg'
};

/**
 * Compresses an image file (Blob/File) to a target size/quality
 */
export async function compressImage(file: Blob, options: Partial<CompressionOptions> = {}): Promise<Blob> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.src = e.target?.result as string;
        };
        reader.onerror = (e) => reject(new Error('Failed to read image file'));

        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions
            if (width > opts.maxWidth) {
                height = (height * opts.maxWidth) / width;
                width = opts.maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            // Draw image to canvas
            ctx.drawImage(img, 0, 0, width, height);

            // Export compressed blob
            canvas.toBlob(
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Compression failed'));
                },
                opts.type,
                opts.quality
            );
        };
        img.onerror = () => reject(new Error('Failed to load image for compression'));

        reader.readAsDataURL(file);
    });
}
