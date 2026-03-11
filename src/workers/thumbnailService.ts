/**
 * Thumbnail Service
 *
 * 管理Web Worker的缩略图生成服务
 * 提供简单的API供其他模块调用
 */

// Worker实例（懒加载）
let worker: Worker | null = null;
let workerReady = false;
let workerPromise: Promise<Worker> | null = null;

// 等待中的请求
interface PendingRequest {
    resolve: (data: ThumbnailResult) => void;
    reject: (error: Error) => void;
}
const pendingRequests = new Map<string, PendingRequest>();

// 缩略图生成结果
export interface ThumbnailResult {
    blob: Blob;
    width: number;
    height: number;
}

// 预设质量配置
export const THUMBNAIL_PRESETS = {
    MICRO: { maxSize: 200, quality: 0.6 },    // 极小缩略图，用于列表
    SMALL: { maxSize: 300, quality: 0.7 },    // 小缩略图
    MEDIUM: { maxSize: 500, quality: 0.75 },  // 中等缩略图，画布显示
    LARGE: { maxSize: 800, quality: 0.8 },    // 大缩略图，预览
} as const;

/**
 * 初始化Worker
 */
async function initWorker(): Promise<Worker> {
    if (worker && workerReady) {
        return worker;
    }

    if (workerPromise) {
        return workerPromise;
    }

    workerPromise = new Promise((resolve, reject) => {
        try {
            // 使用Vite的Worker导入语法
            worker = new Worker(
                new URL('./thumbnailWorker.ts', import.meta.url),
                { type: 'module' }
            );

            const onReady = (event: MessageEvent) => {
                if (event.data.type === 'ready') {
                    workerReady = true;
                    worker!.removeEventListener('message', onReady);
                    console.log('[ThumbnailService] Worker ready');
                    resolve(worker!);
                }
            };

            const onError = (event: ErrorEvent) => {
                console.error('[ThumbnailService] Worker error:', event);
                reject(new Error(`Worker failed: ${event.message}`));
            };

            worker.addEventListener('message', onReady);
            worker.addEventListener('error', onError);

            // 监听所有后续消息
            worker.addEventListener('message', handleWorkerMessage);

            // 超时检查
            setTimeout(() => {
                if (!workerReady) {
                    reject(new Error('Worker initialization timeout'));
                }
            }, 5000);

        } catch (e) {
            reject(e);
        }
    });

    return workerPromise;
}

/**
 * 处理Worker响应
 */
function handleWorkerMessage(event: MessageEvent) {
    const response = event.data;

    if (response.type === 'ready') return;

    const pending = pendingRequests.get(response.id);
    if (!pending) return;

    pendingRequests.delete(response.id);

    if (response.type === 'success') {
        const blob = new Blob([response.thumbnailData], { type: response.mimeType });
        pending.resolve({
            blob,
            width: response.width,
            height: response.height
        });
    } else {
        pending.reject(new Error(response.error || 'Unknown error'));
    }
}

/**
 * 生成缩略图
 *
 * @param source - 图片源（File, Blob, 或 base64字符串）
 * @param options - 缩略图配置
 * @returns 缩略图Blob和尺寸
 */
export async function generateThumbnail(
    source: File | Blob | string,
    options: {
        maxSize?: number;
        quality?: number;
    } = {}
): Promise<ThumbnailResult> {
    const { maxSize = 500, quality = 0.75 } = options;

    // 检查Worker支持
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
        // 回退到主线程处理
        console.warn('[ThumbnailService] Worker not supported, falling back to main thread');
        return generateThumbnailMainThread(source, maxSize, quality);
    }

    try {
        const w = await initWorker();

        // 准备图片数据
        let arrayBuffer: ArrayBuffer;
        let mimeType: string;

        if (typeof source === 'string') {
            // Base64字符串
            const match = source.match(/^data:(.+);base64,(.+)$/);
            if (!match) {
                throw new Error('Invalid base64 format');
            }
            mimeType = match[1];
            try {
                const binary = atob(match[2]); // ⚠️ 可能抛出InvalidCharacterError
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                arrayBuffer = bytes.buffer;
            } catch (error: any) {
                console.error('[ThumbnailService] atob failed:', error.message);
                throw new Error('Invalid base64 encoding');
            }
        } else {
            // File或Blob
            mimeType = source.type || 'image/png';
            arrayBuffer = await source.arrayBuffer();
        }

        // 生成请求ID
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2);

        // 发送请求
        return new Promise((resolve, reject) => {
            pendingRequests.set(id, { resolve, reject });

            // 使用Transferable传输（零拷贝）
            w.postMessage({
                id,
                type: 'generate',
                imageData: arrayBuffer,
                mimeType,
                maxSize,
                quality
            }, [arrayBuffer]);

            // 超时处理
            setTimeout(() => {
                if (pendingRequests.has(id)) {
                    pendingRequests.delete(id);
                    reject(new Error('Thumbnail generation timeout'));
                }
            }, 30000);
        });

    } catch (e) {
        console.error('[ThumbnailService] Worker failed, falling back:', e);
        return generateThumbnailMainThread(source, maxSize, quality);
    }
}

/**
 * 主线程回退实现
 */
async function generateThumbnailMainThread(
    source: File | Blob | string,
    maxSize: number,
    quality: number
): Promise<ThumbnailResult> {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            try {
                const { width, height } = img;
                const scale = Math.min(maxSize / width, maxSize / height, 1);
                const newWidth = Math.round(width * scale);
                const newHeight = Math.round(height * scale);

                const canvas = document.createElement('canvas');
                canvas.width = newWidth;
                canvas.height = newHeight;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, newWidth, newHeight);

                canvas.toBlob(
                    blob => {
                        if (blob) {
                            resolve({ blob, width: newWidth, height: newHeight });
                        } else {
                            reject(new Error('Failed to create blob'));
                        }
                        // 清理
                        URL.revokeObjectURL(img.src);
                    },
                    'image/webp',
                    quality
                );
            } catch (e) {
                reject(e);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image'));
        };

        // 设置图片源
        if (typeof source === 'string') {
            img.src = source;
        } else {
            img.src = URL.createObjectURL(source);
        }
    });
}

/**
 * 使用预设生成缩略图
 */
export async function generateThumbnailWithPreset(
    source: File | Blob | string,
    preset: keyof typeof THUMBNAIL_PRESETS
): Promise<ThumbnailResult> {
    const { maxSize, quality } = THUMBNAIL_PRESETS[preset];
    return generateThumbnail(source, { maxSize, quality });
}

/**
 * 批量生成缩略图（并发控制）
 */
export async function generateThumbnailBatch(
    sources: Array<{ id: string; source: File | Blob | string }>,
    options: {
        maxSize?: number;
        quality?: number;
        concurrency?: number;
    } = {}
): Promise<Map<string, ThumbnailResult>> {
    const { concurrency = 4, ...thumbOptions } = options;
    const results = new Map<string, ThumbnailResult>();

    // 分批处理
    for (let i = 0; i < sources.length; i += concurrency) {
        const batch = sources.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
            batch.map(async ({ id, source }) => {
                const result = await generateThumbnail(source, thumbOptions);
                return { id, result };
            })
        );

        for (const settled of batchResults) {
            if (settled.status === 'fulfilled') {
                results.set(settled.value.id, settled.value.result);
            }
        }
    }

    return results;
}

/**
 * 终止Worker
 */
export function terminateWorker(): void {
    if (worker) {
        worker.terminate();
        worker = null;
        workerReady = false;
        workerPromise = null;
        pendingRequests.clear();
        console.log('[ThumbnailService] Worker terminated');
    }
}
