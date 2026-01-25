/**
 * Model Capabilities Service
 *
 * Provides a unified interface to query model capabilities (supported ratios, sizes,
 * grounding support) regardless of whether it's a Google official model or a proxy model.
 *
 * This is the Single Source of Truth for model capabilities.
 */

import { AspectRatio, ImageSize, ApiLineMode } from '../types';
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
            AspectRatio.SQUARE,
            AspectRatio.STANDARD_2_3,
            AspectRatio.STANDARD_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.LANDSCAPE_21_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: true
    },
    'nano-banana-pro': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.STANDARD_2_3,
            AspectRatio.STANDARD_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.LANDSCAPE_21_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: true
    },

    // ============================================
    // Gemini 2.5 Flash Image / Nano Banana
    // Limited ratios, only 1K, NO grounding support
    // ============================================
    'gemini-2.5-flash-image': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.STANDARD_2_3,
            AspectRatio.STANDARD_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false // Tools not supported, causes timeout
    },
    'nano-banana': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.STANDARD_2_3,
            AspectRatio.STANDARD_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },

    // ============================================
    // Gemini 2.0 Flash (Experimental)
    // ============================================
    'gemini-2.0-flash-exp': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.STANDARD_2_3,
            AspectRatio.STANDARD_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },

    // ============================================
    // Imagen 4 Series
    // No ultra-wide (21:9), up to 2K
    // ============================================
    'imagen-4.0-generate-001': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'imagen-4.0-ultra-generate-001': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'imagen-4.0-fast-generate-001': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },

    // ============================================
    // Imagen 3 Series (Legacy)
    // ============================================
    'imagen-3.0-generate-002': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'imagen-3.0-generate-001': {
        supportedRatios: [
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false
    },

    // ============================================
    // Veo Video Series (Limited ratio support)
    // ============================================
    'veo-3.1-generate-preview': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'veo-3.1-fast-generate-preview': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'veo-3.0-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'veo-3.0-fast-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'veo-2.0-generate-001': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },

    // ============================================
    // Chat Models (for grounding check)
    // ============================================
    'gemini-flash-lite-latest': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    },
    'gemini-flash-latest': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    },
    'gemini-3-flash-preview': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    },
    'gemini-3-pro-preview': {
        supportedRatios: [],
        supportedSizes: [],
        supportsGrounding: true
    }
};

/**
 * Get model capabilities based on model ID and line mode
 *
 * @param modelId - The model ID to query
 * @param lineMode - API line mode (google_direct or proxy)
 * @returns Model capabilities or null if not found
 */
export function getModelCapabilities(
    modelId: string,
    lineMode: ApiLineMode
): ModelCapability | null {
    if (lineMode === 'google_direct') {
        // Check exact match first
        if (GOOGLE_MODEL_CAPABILITIES[modelId]) {
            return GOOGLE_MODEL_CAPABILITIES[modelId];
        }

        // Fallback: check if model ID contains known patterns
        const lowerModelId = modelId.toLowerCase();
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

        // Default fallback: allow all options
        return {
            supportedRatios: Object.values(AspectRatio),
            supportedSizes: Object.values(ImageSize),
            supportsGrounding: false
        };
    }

    // Proxy mode: get capabilities from keyManager's proxy model configs
    const proxyModels = keyManager.getAvailableProxyModels();
    const proxyModel = proxyModels.find(m => m.id === modelId);

    if (proxyModel) {
        return {
            supportedRatios: proxyModel.supportedAspectRatios,
            supportedSizes: proxyModel.supportedSizes,
            supportsGrounding: proxyModel.supportsGrounding
        };
    }

    // Not found in proxy models - return all options as fallback
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
    modelId: string,
    lineMode: ApiLineMode
): boolean {
    const caps = getModelCapabilities(modelId, lineMode);
    return caps?.supportsGrounding ?? false;
}

/**
 * Get available aspect ratios for a model
 */
export function getAvailableRatios(
    modelId: string,
    lineMode: ApiLineMode
): AspectRatio[] {
    const caps = getModelCapabilities(modelId, lineMode);
    return caps?.supportedRatios ?? Object.values(AspectRatio);
}

/**
 * Get available sizes for a model
 */
export function getAvailableSizes(
    modelId: string,
    lineMode: ApiLineMode
): ImageSize[] {
    const caps = getModelCapabilities(modelId, lineMode);
    return caps?.supportedSizes ?? Object.values(ImageSize);
}
