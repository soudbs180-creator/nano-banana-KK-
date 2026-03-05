import { useState, useEffect } from 'react';
import { ImageQuality, getAppropriateQuality } from '../services/image/imageQuality';
import { getImageByQuality } from '../services/storage/imageStorage';

/**
 * 🚀 根据画布缩放自动选择合适质量的图片Hook
 * @param imageId 图片ID
 * @param currentScale 当前画布缩放比例
 * @returns 图片URL（根据缩放自动选择质量）
 */
export function useImageQuality(imageId: string, currentScale: number): string | null {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    // 根据缩放等级确定质量
    const quality = getAppropriateQuality(currentScale);

    useEffect(() => {
        let isCancelled = false;

        (async () => {
            try {
                const url = await getImageByQuality(imageId, quality);
                if (!isCancelled && url) {
                    setImageUrl(url);
                }
            } catch (error) {
                console.error(`[useImageQuality] Failed to load image ${imageId} with quality ${quality}:`, error);
            }
        })();

        return () => {
            isCancelled = true;
        };
    }, [imageId, quality]);

    return imageUrl;
}

/**
 * 🚀 获取当前画布缩放等级
 * 从 InfiniteCanvas 组件的 DOM 元素中读取 transform scale
 * 如果无法获取，返回默认 1.0
 */
export function useCanvasScale(): number {
    // 尝试从 DOM 中获取画布的缩放比例
    if (typeof document !== 'undefined') {
        const canvasContainer = document.querySelector('[data-canvas-container="true"]');
        if (canvasContainer) {
            const transform = window.getComputedStyle(canvasContainer).transform;
            if (transform && transform !== 'none') {
                // 解析 matrix(a, b, c, d, e, f) 中的 a 值作为 scaleX
                const match = transform.match(/matrix\(([^,]+),/);
                if (match) {
                    const scale = parseFloat(match[1]);
                    if (!isNaN(scale) && scale > 0) {
                        return scale;
                    }
                }
            }
        }
    }
    // 默认返回 1.0
    return 1.0;
}
