/**
 * Thumbnail Generation Worker
 * 
 * 在Web Worker中生成缩略图，不阻塞主线程
 * 使用OffscreenCanvas进行高效图片处理
 */

// Worker接收的消息类型
interface ThumbnailRequest {
    id: string;
    type: 'generate';
    imageData: ArrayBuffer;
    mimeType: string;
    maxSize: number;  // 最大边长
    quality: number;  // 0-1
}

// Worker发送的消息类型
interface ThumbnailResponse {
    id: string;
    type: 'success' | 'error';
    thumbnailData?: ArrayBuffer;
    mimeType?: string;
    width?: number;
    height?: number;
    error?: string;
}

// Worker上下文
const ctx: Worker = self as unknown as Worker;

/**
 * 从ArrayBuffer创建ImageBitmap
 */
async function createBitmapFromBuffer(buffer: ArrayBuffer, mimeType: string): Promise<ImageBitmap> {
    const blob = new Blob([buffer], { type: mimeType });
    return await createImageBitmap(blob);
}

/**
 * 计算缩放后的尺寸
 */
function calculateScaledSize(
    width: number,
    height: number,
    maxSize: number
): { width: number; height: number; scale: number } {
    const scale = Math.min(maxSize / width, maxSize / height, 1);
    return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        scale
    };
}

/**
 * 生成缩略图
 */
async function generateThumbnail(
    bitmap: ImageBitmap,
    maxSize: number,
    quality: number
): Promise<{ blob: Blob; width: number; height: number }> {
    const { width, height } = calculateScaledSize(bitmap.width, bitmap.height, maxSize);

    // 使用OffscreenCanvas（Worker中可用）
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to get 2D context from OffscreenCanvas');
    }

    // 绘制缩放后的图片
    ctx.drawImage(bitmap, 0, 0, width, height);

    // 转换为WebP（更小的文档大小）
    const blob = await canvas.convertToBlob({
        type: 'image/webp',
        quality
    });

    return { blob, width, height };
}

/**
 * 处理缩略图生成请求
 */
async function handleRequest(request: ThumbnailRequest): Promise<ThumbnailResponse> {
    try {
        // 1. 从ArrayBuffer创建ImageBitmap
        const bitmap = await createBitmapFromBuffer(request.imageData, request.mimeType);

        // 2. 生成缩略图
        const { blob, width, height } = await generateThumbnail(
            bitmap,
            request.maxSize,
            request.quality
        );

        // 3. 转换为ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();

        // 4. 释放资源
        bitmap.close();

        return {
            id: request.id,
            type: 'success',
            thumbnailData: arrayBuffer,
            mimeType: 'image/webp',
            width,
            height
        };

    } catch (error) {
        return {
            id: request.id,
            type: 'error',
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// 监听消息
ctx.addEventListener('message', async (event: MessageEvent<ThumbnailRequest>) => {
    const request = event.data;

    if (request.type === 'generate') {
        const response = await handleRequest(request);

        // 使用Transferable传输ArrayBuffer（零拷贝）
        if (response.thumbnailData) {
            ctx.postMessage(response, [response.thumbnailData]);
        } else {
            ctx.postMessage(response);
        }
    }
});

// 通知主线程Worker已就绪
ctx.postMessage({ type: 'ready' });
