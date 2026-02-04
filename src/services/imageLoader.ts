/**
 * 图片加载队列服务 - 限制并发请求数，优化加载性能
 * 
 * 核心功能：
 * 1. 限制最大并发请求数（避免阻塞浏览器）
 * 2. 支持优先级调整（可见图片优先加载）
 * 3. 支持取消请求（离开视口时取消）
 */

import { getImage, getImageByQuality } from './imageStorage';
import { ImageQuality } from './imageQuality';

// 最大并发请求数（浏览器同域限制约6个）
const MAX_CONCURRENT = 6;

interface QueueItem {
    imageId: string;
    quality: ImageQuality;
    priority: number;          // 越大越优先
    resolve: (url: string | null) => void;
    reject: (error: Error) => void;
    cancelled: boolean;
}

class ImageLoaderQueue {
    private queue: QueueItem[] = [];
    private activeCount = 0;
    private processing = false;

    /**
     * 加载图片（加入队列）
     */
    load(imageId: string, quality: ImageQuality = ImageQuality.PREVIEW, priority = 0): Promise<string | null> {
        return new Promise((resolve, reject) => {
            // 检查是否已在队列中
            const existing = this.queue.find(q => q.imageId === imageId && q.quality === quality);
            if (existing) {
                // 更新优先级（取更高的）
                existing.priority = Math.max(existing.priority, priority);
                // 链式Promise
                const originalResolve = existing.resolve;
                existing.resolve = (url) => {
                    originalResolve(url);
                    resolve(url);
                };
                return;
            }

            this.queue.push({
                imageId,
                quality,
                priority,
                resolve,
                reject,
                cancelled: false
            });

            this.processQueue();
        });
    }

    /**
     * 提升优先级（用于即将可见的图片）
     */
    prioritize(imageId: string, boost = 100): void {
        const item = this.queue.find(q => q.imageId === imageId);
        if (item) {
            item.priority += boost;
            // 重新排序队列
            this.sortQueue();
        }
    }

    /**
     * 取消请求（用于离开视口的图片）
     */
    cancel(imageId: string): void {
        const item = this.queue.find(q => q.imageId === imageId);
        if (item) {
            item.cancelled = true;
            item.resolve(null);
            this.queue = this.queue.filter(q => q.imageId !== imageId);
        }
    }

    /**
     * 取消所有请求（用于画布切换）
     */
    cancelAll(): void {
        this.queue.forEach(item => {
            item.cancelled = true;
            item.resolve(null);
        });
        this.queue = [];
    }

    /**
     * 获取队列状态
     */
    getStatus(): { queued: number; active: number } {
        return {
            queued: this.queue.length,
            active: this.activeCount
        };
    }

    private sortQueue(): void {
        // 高优先级排前面
        this.queue.sort((a, b) => b.priority - a.priority);
    }

    private async processQueue(): Promise<void> {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0 && this.activeCount < MAX_CONCURRENT) {
            this.sortQueue();
            const item = this.queue.shift();
            if (!item || item.cancelled) continue;

            this.activeCount++;

            // 异步加载，不阻塞循环
            this.loadItem(item).finally(() => {
                this.activeCount--;
                // 继续处理队列
                if (this.queue.length > 0) {
                    this.processQueue();
                }
            });
        }

        this.processing = false;
    }

    private async loadItem(item: QueueItem): Promise<void> {
        if (item.cancelled) {
            item.resolve(null);
            return;
        }

        try {
            let url: string | null = null;

            if (item.quality === ImageQuality.ORIGINAL) {
                url = await getImage(item.imageId);
            } else {
                url = await getImageByQuality(item.imageId, item.quality);
            }

            if (!item.cancelled) {
                item.resolve(url);
            }
        } catch (error) {
            if (!item.cancelled) {
                console.error(`[ImageLoader] Failed to load ${item.imageId}:`, error);
                item.resolve(null); // 失败时返回null而不是reject，避免级联错误
            }
        }
    }
}

// 单例导出
export const imageLoader = new ImageLoaderQueue();

// 便捷方法
export function loadImage(imageId: string, quality?: ImageQuality, priority?: number): Promise<string | null> {
    return imageLoader.load(imageId, quality, priority);
}

export function cancelImageLoad(imageId: string): void {
    imageLoader.cancel(imageId);
}

export function prioritizeImage(imageId: string): void {
    imageLoader.prioritize(imageId);
}

export default imageLoader;
