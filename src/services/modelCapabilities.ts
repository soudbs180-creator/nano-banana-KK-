/**
 * Model Capabilities Service
 *
 * Provides a unified interface to query model capabilities (supported ratios, sizes,
 * grounding support) regardless of whether it's a Google official model or a proxy model.
 *
 * This is the Single Source of Truth for model capabilities.
 */

import { AspectRatio, ImageSize } from '../types';
import { keyManager } from './keyManager';

/**
 * Model capability definition
 */
export interface ModelCapability {
    /** Supported aspect ratios */
    supportedRatios: AspectRatio[];

    /** Supported image/video sizes */
    supportedSizes: ImageSize[];

    /** Whether grounding (web search) is supported */
    supportsGrounding: boolean;

    /** 
     * Maximum number of reference images allowed
     * - 0: No reference image support
     * - 1-10: Limited reference images (Gemini supports up to 10)
     * - 3: Video models (Veo 2) support max 3 for first/last frame or reference
     * - undefined: Defaults to 10 for image models, 3 for video models
     */
    maxRefImages?: number;

    /**
     * Whether the model supports reference images parameter
     * - Veo 3/Veo 3 Fast: false (不支持referenceImages参数)
     * - Veo 2: true (支持referenceImages参数)
     * - 未定义时默认为true
     */
    supportsReferenceImages?: boolean;

    /**
     * Whether the model supports video extension (video parameter)
     * - Veo 3/Veo 3 Fast: false (不支持video参数)
     * - Veo 2: true (支持video扩展)
     * - 未定义时默认为true
     */
    supportsVideoExtension?: boolean;
}

/**
 * Google official model capabilities (hardcoded based on official documentation)
 * Reference: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
 */
export const GOOGLE_MODEL_CAPABILITIES: Record<string, ModelCapability> = {
    // ============================================
    // Gemini 3 Pro Image / Nano Banana Pro
    // Supports more ratios and up to 4K resolution
    // ============================================
    'gemini-3-pro-image-preview': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.LANDSCAPE_3_2,
            AspectRatio.STANDARD_2_3,
            AspectRatio.LANDSCAPE_5_4,
            AspectRatio.PORTRAIT_4_5,
            AspectRatio.LANDSCAPE_21_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: true,
        maxRefImages: 10  // Gemini 3 Pro 支持最多10张参考图
    },
    'nano-banana-pro': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.LANDSCAPE_3_2,
            AspectRatio.STANDARD_2_3,
            AspectRatio.LANDSCAPE_5_4,
            AspectRatio.PORTRAIT_4_5,
            AspectRatio.LANDSCAPE_21_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: true,
        maxRefImages: 10  // Nano Banana Pro 支持最多10张参考图
    },

    // ============================================
    // Gemini 2.5 Flash Image / Nano Banana
    // Limited ratios, only 1K, NO grounding support
    // ============================================
    'gemini-2.5-flash-image': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.STANDARD_2_3,
            AspectRatio.STANDARD_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false, // Tools not supported, causes timeout
        maxRefImages: 10  // Gemini 2.5 Flash 支持最多10张参考图
    },
    'nano-banana': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.STANDARD_2_3,
            AspectRatio.STANDARD_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 10  // Nano Banana 支持最多10张参考图
    },



    // ============================================
    // Imagen 4 Series
    // No ultra-wide (21:9), up to 2K
    // ============================================
    'imagen-4.0-generate-001': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false,
        maxRefImages: 0  // Imagen 不支持参考图片
    },
    'imagen-4.0-ultra-generate-001': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false,
        maxRefImages: 0  // Imagen 不支持参考图片
    },
    'imagen-4.0-fast-generate-001': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 0  // Imagen 不支持参考图片
    },

    // ============================================
    // Imagen 3 Series (Legacy)
    // ============================================
    'imagen-3.0-generate-002': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 0  // Imagen 不支持参考图片
    },
    'imagen-3.0-generate-001': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false,
        maxRefImages: 0  // Imagen 不支持参考图片
    },

    // ============================================
    // Veo Video Series (Limited ratio support)
    // ============================================
    'veo-3.1-generate-preview': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 0,  // Veo 3不支持参考图
        supportsReferenceImages: false,  // Veo 3不支持referenceImages参数
        supportsVideoExtension: false    // Veo 3不支持video参数（视频扩展）
    },
    'veo-3.1-fast-generate-preview': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 0,  // Veo 3 Fast不支持参考图
        supportsReferenceImages: false,  // Veo 3 Fast不支持referenceImages参数
        supportsVideoExtension: false    // Veo 3 Fast不支持video参数
    },
    'veo-3.0-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 0,  // Veo 3不支持参考图
        supportsReferenceImages: false,  // Veo 3不支持referenceImages参数
        supportsVideoExtension: false    // Veo 3不支持video参数
    },
    'veo-3.0-fast-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 0,  // Veo 3 Fast不支持参考图
        supportsReferenceImages: false,  // Veo 3 Fast不支持referenceImages参数
        supportsVideoExtension: false    // Veo 3 Fast不支持video参数
    },
    'veo-2.0-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 3,  // Veo 2支持最多3张参考图: 首帧/尾帧/参考图
        supportsReferenceImages: true,   // Veo 2支持referenceImages参数
        supportsVideoExtension: true     // Veo 2支持video参数（视频扩展）
    },

    // ============================================
    // Gemini Chat Models (for grounding check)
    // ============================================
    'gemini-2.5-pro': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    },
    'gemini-2.5-flash': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    },
    'gemini-2.5-flash-lite': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    },
    'gemini-3-pro-preview': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    },
    'gemini-3-flash-preview': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    }
};

/**
 * Get model capabilities based on model ID
 *
 * @param modelId - The model ID to query
 * @returns Model capabilities or null if not found
 */
export function getModelCapabilities(
    modelId: string
): ModelCapability | null {
    // 1. Check exact match in Google Standard Models
    if (GOOGLE_MODEL_CAPABILITIES[modelId]) {
        return GOOGLE_MODEL_CAPABILITIES[modelId];
    }

    // 2. Check Proxy Models via KeyManager
    const proxyModels = keyManager.getAvailableProxyModels();
    const proxyModel = proxyModels.find(m => m.id === modelId);

    if (proxyModel) {
        return {
            supportedRatios: proxyModel.supportedAspectRatios,
            supportedSizes: proxyModel.supportedSizes,
            supportsGrounding: proxyModel.supportsGrounding
        };
    }

    // 3. Fallback: check if model ID contains known patterns (for Google models not in exact list)
    const lowerModelId = modelId.toLowerCase();

    // Google Model Fallback Logic
    if (lowerModelId.includes('nano-banana-pro') ||
        lowerModelId.includes('gemini-3-pro')) {
        return GOOGLE_MODEL_CAPABILITIES['gemini-3-pro-image-preview'];
    }
    if (lowerModelId.includes('nano-banana') ||
        lowerModelId.includes('gemini-2.5-flash-image')) {
        return GOOGLE_MODEL_CAPABILITIES['gemini-2.5-flash-image'];
    }
    if (lowerModelId.includes('imagen')) {
        return GOOGLE_MODEL_CAPABILITIES['imagen-4.0-generate-001'];
    }
    if (lowerModelId.includes('veo')) {
        return GOOGLE_MODEL_CAPABILITIES['veo-3.0-generate-001'];
    }

    // 4. Default fallback: allow all options (Assume Custom Proxy with full capabilities if unknown)
    return {
        supportedRatios: Object.values(AspectRatio),
        supportedSizes: Object.values(ImageSize),
        supportsGrounding: false
    };
}

/**
 * Check if a specific model supports grounding
 */
export function modelSupportsGrounding(
    modelId: string
): boolean {
    const caps = getModelCapabilities(modelId);
    return caps?.supportsGrounding ?? false;
}

/**
 * Get available aspect ratios for a model
 */
export function getAvailableRatios(
    modelId: string
): AspectRatio[] {
    const caps = getModelCapabilities(modelId);
    return caps?.supportedRatios && caps.supportedRatios.length > 0
        ? caps.supportedRatios
        : Object.values(AspectRatio);
}

/**
 * Get available sizes for a model
 */
export function getAvailableSizes(
    modelId: string
): ImageSize[] {
    const caps = getModelCapabilities(modelId);
    return caps?.supportedSizes && caps.supportedSizes.length > 0
        ? caps.supportedSizes
        : Object.values(ImageSize);
}

/**
 * Get maximum number of reference images allowed for a model
 * 
 * @param modelId - The model ID to query
 * @returns Maximum reference images:
 *   - 0: Model doesn't support reference images (e.g., Imagen)
 *   - 3: Video models (Veo) - supports first frame, last frame, or reference images
 *   - 10: Gemini image models - supports up to 10 reference images
 *   - Default: 10 for unknown image models, 3 for unknown video models
 */
export function getMaxRefImages(modelId: string): number {
    const caps = getModelCapabilities(modelId);

    // If explicitly set, use that value
    if (caps?.maxRefImages !== undefined) {
        return caps.maxRefImages;
    }

    // Fallback based on model type
    const lowerModelId = modelId.toLowerCase();
    if (lowerModelId.includes('veo')) {
        return 3; // Video models default to 3
    }
    if (lowerModelId.includes('imagen')) {
        return 0; // Imagen doesn't support reference images
    }

    // Default for unknown models (assume Gemini-like)
    return 10;
}

/**
 * 🚀 获取模型的用户友好显示名称
 * 如果模型有自定义label则返回该label，否则从ID推断
 * 
 * @param modelId - 模型ID（如 'gemini-3-pro-image-preview'）
 * @param customLabel - 可选的自定义显示名称
 * @returns 用户友好的模型名称
 */
export function getModelDisplayName(modelId: string, customLabel?: string): string {
    // 如果有自定义label，直接返回
    if (customLabel) return customLabel;

    const lowerModelId = modelId.toLowerCase();

    // Gemini 3 系列
    if (lowerModelId.includes('gemini-3-pro') || lowerModelId.includes('nano-banana-pro')) {
        return 'Nano Banana Pro';  // 使用市场名称
    }
    if (lowerModelId.includes('gemini-3-flash')) {
        return 'Gemini 3 Flash';
    }
    // Gemini 2.5 系列
    if (lowerModelId.includes('gemini-2.5-flash-image') || lowerModelId.includes('nano-banana')) {
        return 'Nano Banana';  // 使用市场名称
    }
    if (lowerModelId.includes('gemini-2.5-flash')) {
        return 'Gemini 2.5 Flash';
    }
    if (lowerModelId.includes('gemini-2.5-pro')) {
        return 'Gemini 2.5 Pro';
    }
    // Gemini 2.0 系列
    if (lowerModelId.includes('gemini-2.0') || lowerModelId.includes('gemini-2-')) {
        return 'Gemini 2.0 Flash';
    }
    // Imagen 4 系列
    if (lowerModelId.includes('imagen-4') && lowerModelId.includes('ultra')) {
        return 'Imagen 4 Ultra';
    }
    if (lowerModelId.includes('imagen-4') && lowerModelId.includes('fast')) {
        return 'Imagen 4 Fast';
    }
    if (lowerModelId.includes('imagen-4')) {
        return 'Imagen 4';
    }
    // Imagen 3 系列
    if (lowerModelId.includes('imagen-3')) {
        return 'Imagen 3';
    }
    // Veo 3 系列
    if (lowerModelId.includes('veo-3.1') && lowerModelId.includes('fast')) {
        return 'Veo 3.1 Fast';
    }
    if (lowerModelId.includes('veo-3.1')) {
        return 'Veo 3.1';
    }
    if (lowerModelId.includes('veo-3') && lowerModelId.includes('fast')) {
        return 'Veo 3 Fast';
    }
    if (lowerModelId.includes('veo-3')) {
        return 'Veo 3';
    }
    // Veo 2 系列
    if (lowerModelId.includes('veo-2') || lowerModelId.includes('veo')) {
        return 'Veo 2';
    }

    // 默认返回模型ID
    return modelId;
}
