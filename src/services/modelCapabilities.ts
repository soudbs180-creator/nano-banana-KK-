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
     * - 3: Video models (Veo) support max 3 for first/last frame or reference
     * - undefined: Defaults to 10 for image models, 3 for video models
     */
    maxRefImages?: number;
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
        maxRefImages: 3  // Veo 支持最多3张: 首帧/尾帧/参考图
    },
    'veo-3.1-fast-generate-preview': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 3  // Veo 支持最多3张
    },
    'veo-3.0-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 3  // Veo 支持最多3张
    },
    'veo-3.0-fast-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 3  // Veo 支持最多3张
    },
    'veo-2.0-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        maxRefImages: 3  // Veo 支持最多3张
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
