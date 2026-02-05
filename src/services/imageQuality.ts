/**
 * 图片质量分级工具（Mipmap风格）
 * 借鉴GPU纹理压缩思想，根据使用场景提供不同质量的图片
 * 
 * 🚀 4档质量系统：
 * - MICRO: 画布 <50% 时使用，150px极限压缩，保证大量卡片流畅渲染
 * - THUMBNAIL: 画布 50%-100% 时使用，300px缩略图
 * - PREVIEW: 画布 100%-150% 时使用，1024px预览
 * - ORIGINAL: 画布 >150% 或灯箱查看时使用，原图
 */

export enum ImageQuality {
    MICRO = 'micro',        // 微缩图：150px，用于超远距离全局查看（<50%缩放）
    THUMBNAIL = 'thumb',    // 缩略图：300px，用于中距离查看（50%-100%缩放）
    PREVIEW = 'preview',    // 预览：1024px，用于正常查看（100%-150%缩放）
    ORIGINAL = 'original'   // 原图：完整尺寸，用于灯箱放大（>150%缩放）
}

export interface QualityConfig {
    maxSize: number;      // 最大边长
    quality: number;      // JPEG质量 0-1
    format: 'image/jpeg' | 'image/webp';
}

// 🚀 4档质量级别配置
export const QUALITY_CONFIGS: Record<ImageQuality, QualityConfig> = {
    [ImageQuality.MICRO]: {
        maxSize: 150,     // 极小尺寸
        quality: 0.5,     // 较低质量
        format: 'image/jpeg'
    },
    [ImageQuality.THUMBNAIL]: {
        maxSize: 300,
        quality: 0.7,
        format: 'image/jpeg'
    },
    [ImageQuality.PREVIEW]: {
        maxSize: 1024,
        quality: 0.85,
        format: 'image/jpeg'
    },
    [ImageQuality.ORIGINAL]: {
        maxSize: 0, // 0表示不压缩
        quality: 1.0,
        format: 'image/jpeg'
    }
};

/**
 * 🚀 根据画布缩放等级选择合适的图片质量
 * @param scale 画布缩放比例
 * @returns 推荐的图片质量级别
 * 
 * 规则：
 *   <50%  → MICRO (极限压缩，大量卡片流畅)
 *   50%-100% → THUMBNAIL (中等压缩)
 *   100%-150% → PREVIEW (轻度压缩)
 *   >150% → ORIGINAL (无压缩)
 */
export function getAppropriateQuality(scale: number): ImageQuality {
    if (scale < 0.5) {
        // 全局查看（缩小很多）→ 微缩图
        return ImageQuality.MICRO;
    } else if (scale < 1.0) {
        // 缩小查看 → 缩略图
        return ImageQuality.THUMBNAIL;
    } else if (scale < 1.5) {
        // 正常查看 → 预览图
        return ImageQuality.PREVIEW;
    } else {
        // 放大查看 → 原图
        return ImageQuality.ORIGINAL;
    }
}

/**
 * 压缩图片到指定质量
 * @param imageData Base64 data URL
 * @param config 质量配置
 * @returns 压缩后的Base64 data URL
 */
export async function compressImageToQuality(
    imageData: string,
    config: QualityConfig
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            try {
                // 计算压缩后尺寸
                let width = img.width;
                let height = img.height;

                if (config.maxSize > 0) {
                    const maxDim = Math.max(width, height);
                    if (maxDim > config.maxSize) {
                        const scale = config.maxSize / maxDim;
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                    }
                }

                // 创建canvas压缩
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                // 绘制并压缩
                ctx.drawImage(img, 0, 0, width, height);
                const compressed = canvas.toDataURL(config.format, config.quality);

                console.log(`[ImageQuality] Compressed: ${img.width}x${img.height} → ${width}x${height}, ${(imageData.length / 1024).toFixed(1)}KB → ${(compressed.length / 1024).toFixed(1)}KB`);

                resolve(compressed);
            } catch (error) {
                reject(error);
            }
        };

        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageData;
    });
}

/**
 * 🚀 [OOM修复] 只生成必要的质量级别（2档：MICRO + ORIGINAL）
 * 移除THUMBNAIL和PREVIEW减少存储占用2/3
 * @param originalData 原始图片Base64
 * @returns 各质量级别的图片数据
 */
export async function generateAllQualities(
    originalData: string
): Promise<Record<ImageQuality, string>> {
    const results: Partial<Record<ImageQuality, string>> = {};

    // 🚀 [OOM修复] 原图直接保存（用于灯箱/下载）
    results[ImageQuality.ORIGINAL] = originalData;

    // 🚀 [OOM修复] 只生成MICRO微缩图（150px）- 用于卡片显示
    results[ImageQuality.MICRO] = await compressImageToQuality(
        originalData,
        QUALITY_CONFIGS[ImageQuality.MICRO]
    );

    // 🚀 [OOM修复] THUMBNAIL和PREVIEW不再生成，按需从ORIGINAL压缩或使用MICRO
    // 如果请求这些质量，fallback逻辑会返回MICRO或ORIGINAL
    results[ImageQuality.THUMBNAIL] = results[ImageQuality.MICRO]; // 使用MICRO代替
    results[ImageQuality.PREVIEW] = results[ImageQuality.MICRO]; // 使用MICRO代替

    return results as Record<ImageQuality, string>;
}

/**
 * 获取质量级别的存储ID
 * @param imageId 图片ID
 * @param quality 质量级别
 * @returns 存储ID
 */
export function getQualityStorageId(imageId: string, quality: ImageQuality): string {
    if (quality === ImageQuality.ORIGINAL) {
        return imageId;
    }
    return `${imageId}_${quality}`;
}
