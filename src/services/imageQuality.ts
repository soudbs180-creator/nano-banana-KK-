/**
 * 图片质量分级工具（Mipmap风格）
 * 借鉴GPU纹理压缩思想，根据使用场景提供不同质量的图片
 */

export enum ImageQuality {
    THUMBNAIL = 'thumb',    // 缩略图：300px，用于全局查看
    PREVIEW = 'preview',    // 预览：1024px，用于正常查看
    ORIGINAL = 'original'   // 原图：完整尺寸，用于灯箱放大
}

export interface QualityConfig {
    maxSize: number;      // 最大边长
    quality: number;      // JPEG质量 0-1
    format: 'image/jpeg' | 'image/webp';
}

// 质量级别配置
export const QUALITY_CONFIGS: Record<ImageQuality, QualityConfig> = {
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
 * 根据画布缩放等级选择合适的图片质量
 * @param scale 画布缩放比例
 * @returns 推荐的图片质量级别
 */
export function getAppropriateQuality(scale: number): ImageQuality {
    if (scale < 0.5) {
        // 全局查看（缩小很多）→ 缩略图
        return ImageQuality.THUMBNAIL;
    } else if (scale < 1.0) {
        // 缩小查看 → 预览图
        return ImageQuality.PREVIEW;
    } else {
        // 正常/放大查看 → 原图
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
 * 生成所有质量级别的图片
 * @param originalData 原始图片Base64
 * @returns 各质量级别的图片数据
 */
export async function generateAllQualities(
    originalData: string
): Promise<Record<ImageQuality, string>> {
    const results: Partial<Record<ImageQuality, string>> = {};

    // 原图直接保存
    results[ImageQuality.ORIGINAL] = originalData;

    // 生成预览图
    results[ImageQuality.PREVIEW] = await compressImageToQuality(
        originalData,
        QUALITY_CONFIGS[ImageQuality.PREVIEW]
    );

    // 生成缩略图
    results[ImageQuality.THUMBNAIL] = await compressImageToQuality(
        originalData,
        QUALITY_CONFIGS[ImageQuality.THUMBNAIL]
    );

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
