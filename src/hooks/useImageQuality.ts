import { useState, useEffect } from 'react';
import { ImageQuality, getAppropriateQuality } from '../services/imageQuality';
import { getImageByQuality } from '../services/imageStorage';

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
        let isCancel led = false;

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
 * 🚀 获取当前画布缩放等级（从CanvasContext）
 * 这个Hook需要在InfiniteCanvas或其子组件中使用
 */
export function useCanvasScale(): number {
    // TODO: 从CanvasContext获取transform.scale
    // 临时返回1.0
    return 1.0;
}
