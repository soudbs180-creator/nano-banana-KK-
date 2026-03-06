/**
 * Model Capabilities Service
 *
 * Provides a unified interface to query model capabilities (supported ratios, sizes,
 * grounding support) regardless of whether it's a Google official model or a proxy model.
 *
 * This is the Single Source of Truth for model capabilities.
 */

import { AspectRatio, ImageSize } from '../../types';
import { keyManager } from '../auth/keyManager';

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

    /**
     * Whether the video model supports audio generation
     * - Wan / Seedance (即梦): true
     * - Others (Luma, Runway, Sora): false
     */
    supportsVideoAudio?: boolean;

    /** 🚀 Whether the model supports thinking mode (Gemini 3.1+) */
    supportsThinking?: boolean;

    /** 🚀 Whether the model supports structured image search (Gemini 3.1+) */
    supportsImageSearch?: boolean;
}

/**
 * Built-in model capabilities (hardcoded based on official documentation or common proxy models)
 * Reference: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
 */
export const BUILTIN_MODEL_CAPABILITIES: Record<string, ModelCapability> = {
    // ============================================
    // Gemini 3.1 Flash Image Preview (Nano Banana 2)
    // 11 Ratios, up to 4K
    // ============================================
    'gemini-3.1-flash-image-preview': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_1_4,
            AspectRatio.PORTRAIT_1_8,
            AspectRatio.PORTRAIT_2_3,
            AspectRatio.LANDSCAPE_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_1,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_4_5,
            AspectRatio.LANDSCAPE_5_4,
            AspectRatio.LANDSCAPE_8_1,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.LANDSCAPE_21_9
        ],
        supportedSizes: [ImageSize.SIZE_05K, ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: true,
        supportsThinking: true,      // 🚀 开启思考模式支持
        supportsImageSearch: true,   // 🚀 开启图片搜索支持
        maxRefImages: 14 // 🚀 Update: Gemini 3.1 Flash specifies up to 14 reference images
    },

    // ============================================
    // Gemini 3 Pro Image / Nano Banana Pro
    // 11 Ratios, up to 4K
    // ============================================
    'gemini-3-pro-image-preview': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_2_3,
            AspectRatio.LANDSCAPE_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_4_5,
            AspectRatio.LANDSCAPE_5_4,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.LANDSCAPE_21_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: true,
        supportsThinking: true,      // 🚀 Gemini 3 Pro 也支持思考模式
        supportsImageSearch: false,   // 🚀 3 Pro 不支持图片搜索，仅 3.1 Flash 支持
        maxRefImages: 14  // 🚀 Update: Gemini 3 Pro specifies up to 14 reference images
    },

    // ============================================
    // Gemini 2.5 Flash Image / Nano Banana
    // 10 Ratios (no 1:4, 1:8, 4:1, 8:1), up to 4K, NO grounding support
    // ============================================
    'gemini-2.5-flash-image': {
        supportedRatios: [
            AspectRatio.AUTO,
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_2_3,
            AspectRatio.LANDSCAPE_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_4_5,
            AspectRatio.LANDSCAPE_5_4,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.LANDSCAPE_21_9
        ],
        supportedSizes: [ImageSize.SIZE_1K], // 文档：仅支持 1024 像素
        supportsGrounding: false, // Tools not supported, causes timeout
        maxRefImages: 14  // 🚀 Update: Support up to 14 reference images (Matches Gemini 2.0/3.1 capabilities)
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
        maxRefImages: 0  // 🚀 Imagen 4.0 does not support Reference Images
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
        maxRefImages: 0  // 🚀 Imagen 4.0 Ultra does not support Reference Images
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
        maxRefImages: 0  // 🚀 Imagen 4.0 Fast does not support Reference Images
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
        maxRefImages: 0  // 🚀 Imagen 3.0 does not support Reference Images
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
        maxRefImages: 5  // Allow for Proxy Chat Mode
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
    },

    // ============================================
    // Common Proxy Models Constraints
    // ============================================
    'grok-video': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'grok-imagine-video': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'vidu-q3': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.SQUARE],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'vidu-q3-pro': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.SQUARE],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false
    },
    'ray-3': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'runway-gen-4.5': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.SQUARE],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false
    },
    'kling-2.5': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.SQUARE],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false
    },
    'kling-2.6': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.SQUARE],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false
    },
    'hailuo-02': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.SQUARE],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'wan-2.6-video': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },
    'pixverse-v5.5': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.SQUARE],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: false
    },
    'seedance-1.5': {
        supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
    },

    // Quick Flux variants (usually square or landscape)
    'flux-schnell': {
        supportedRatios: [AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false
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
    // 1. Check exact match in Builtin Models (Highest Priority)
    if (BUILTIN_MODEL_CAPABILITIES[modelId]) {
        return BUILTIN_MODEL_CAPABILITIES[modelId];
    }

    const lowerModelId = modelId.toLowerCase();

    // 2. Check if model ID contains known patterns (for Builtin models not in exact list)
    if (lowerModelId.includes('gemini-3-pro') || lowerModelId.includes('nano-banana-pro')) {
        return BUILTIN_MODEL_CAPABILITIES['gemini-3-pro-image-preview'];
    }
    if (lowerModelId.includes('gemini-3.1-flash') || lowerModelId.includes('nano-banana-2')) {
        return BUILTIN_MODEL_CAPABILITIES['gemini-3.1-flash-image-preview'];
    }
    if (lowerModelId.includes('gemini-2.5-flash-image') || lowerModelId.includes('nano-banana')) {
        return BUILTIN_MODEL_CAPABILITIES['gemini-2.5-flash-image'];
    }
    if (lowerModelId.includes('imagen')) {
        return BUILTIN_MODEL_CAPABILITIES['imagen-4.0-generate-001'];
    }
    if (lowerModelId.includes('veo')) {
        return BUILTIN_MODEL_CAPABILITIES['veo-3.0-generate-001'];
    }

    // 3. Fallback capabilities base
    let fallbackCapabilities: ModelCapability | null = null;

    // 4. Keyword-based matching for common model families (captures Proxy variants)
    const ALL_IMAGE_RATIOS = [AspectRatio.AUTO, AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.LANDSCAPE_4_3, AspectRatio.PORTRAIT_3_4];
    const VIDEO_RATIOS = [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.SQUARE];

    if (lowerModelId.includes('midjourney') || lowerModelId.startsWith('mj-')) {
        fallbackCapabilities = {
            supportedRatios: [AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16, AspectRatio.LANDSCAPE_4_3, AspectRatio.PORTRAIT_3_4, AspectRatio.LANDSCAPE_21_9],
            supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
            supportsGrounding: false
        };
    } else if (lowerModelId.includes('flux')) {
        let sizes = [ImageSize.SIZE_1K];
        if (lowerModelId.includes('max')) sizes = [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K];
        else if (lowerModelId.includes('pro')) sizes = [ImageSize.SIZE_1K, ImageSize.SIZE_2K];

        fallbackCapabilities = {
            supportedRatios: ALL_IMAGE_RATIOS,
            supportedSizes: sizes,
            supportsGrounding: false
        };
    } else if (lowerModelId.includes('kling')) {
        fallbackCapabilities = {
            supportedRatios: VIDEO_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('runway') || lowerModelId.includes('gen-3') || lowerModelId.includes('gen-4')) {
        fallbackCapabilities = {
            supportedRatios: VIDEO_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('luma') || lowerModelId.includes('dream-machine')) {
        fallbackCapabilities = {
            supportedRatios: VIDEO_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('ideogram')) {
        fallbackCapabilities = {
            supportedRatios: ALL_IMAGE_RATIOS,
            supportedSizes: lowerModelId.includes('v3') ? [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K] : [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
            supportsGrounding: false
        };
    } else if (lowerModelId.includes('wan')) {
        fallbackCapabilities = {
            supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
            supportedSizes: [ImageSize.SIZE_1K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('pixverse')) {
        fallbackCapabilities = {
            supportedRatios: VIDEO_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('recraft')) {
        fallbackCapabilities = {
            supportedRatios: ALL_IMAGE_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
            supportsGrounding: false
        };
    } else if (lowerModelId.includes('cogvideo')) {
        fallbackCapabilities = {
            supportedRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
            supportedSizes: [ImageSize.SIZE_1K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('minimax') || lowerModelId.includes('hailuo')) {
        fallbackCapabilities = {
            supportedRatios: VIDEO_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('seedance') || lowerModelId.includes('vidu') || lowerModelId.includes('ray-') || lowerModelId.includes('jimeng')) {
        fallbackCapabilities = {
            supportedRatios: VIDEO_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('dall-e') || lowerModelId.includes('dalle')) {
        fallbackCapabilities = {
            supportedRatios: [AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
            supportedSizes: [ImageSize.SIZE_1K],
            supportsGrounding: false
        };
    } else if (lowerModelId.includes('pika') || lowerModelId.includes('viggle') || lowerModelId.includes('higgsfield')) {
        fallbackCapabilities = {
            supportedRatios: VIDEO_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K],
            supportsGrounding: false,
            supportsVideoAudio: true
        };
    } else if (lowerModelId.includes('sora')) {
        fallbackCapabilities = {
            supportedRatios: VIDEO_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K],
            supportsGrounding: false,
            supportsVideoAudio: lowerModelId.includes('sora-2')
        };
    } else if (lowerModelId.includes('seedream') || lowerModelId.includes('imagen')) {
        fallbackCapabilities = {
            supportedRatios: ALL_IMAGE_RATIOS,
            supportedSizes: lowerModelId.includes('4.0') || lowerModelId.includes('4') ? [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K] : [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
            supportsGrounding: false
        };
    } else if (lowerModelId.includes('qwen-image') || lowerModelId.includes('gemini') || lowerModelId.includes('sdxl') || lowerModelId.includes('stable-diffusion') || lowerModelId.includes('gpt-4o') || lowerModelId.includes('gpt-image')) {
        fallbackCapabilities = {
            supportedRatios: ALL_IMAGE_RATIOS,
            supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
            supportsGrounding: false
        };
    } else if (lowerModelId.includes('nano-banana')) {
        // Nano Banana = Gemini 2.5 Flash Image
        // Nano Banana 2 = Gemini 3.1 Flash Image Preview
        // Nano Banana Pro = Gemini 3 Pro Image Preview
        if (lowerModelId.includes('2')) {
            // Nano Banana 2 (Gemini 3.1 Flash Image)
            fallbackCapabilities = Object.assign({}, BUILTIN_MODEL_CAPABILITIES['gemini-3.1-flash-image-preview']);
        } else if (lowerModelId.includes('pro')) {
            // Nano Banana Pro (Gemini 3 Pro Image)
            fallbackCapabilities = Object.assign({}, BUILTIN_MODEL_CAPABILITIES['gemini-3-pro-image-preview']);
        } else {
            // Nano Banana (Gemini 2.5 Flash Image)
            fallbackCapabilities = Object.assign({}, BUILTIN_MODEL_CAPABILITIES['gemini-2.5-flash-image']);
        }
    }

    // 5. If no keyword matched, try KeyManager Proxy Models (Generic Defaults)
    if (!fallbackCapabilities) {
        const proxyModels = keyManager.getAvailableProxyModels();
        const proxyModel = proxyModels.find(m => m.id === modelId);

        if (proxyModel) {
            fallbackCapabilities = {
                supportedRatios: proxyModel.supportedAspectRatios,
                supportedSizes: proxyModel.supportedSizes,
                supportsGrounding: proxyModel.supportsGrounding
            };
        } else {
            // Ultimate Default fallback: allow all options
            fallbackCapabilities = {
                supportedRatios: Object.values(AspectRatio),
                supportedSizes: Object.values(ImageSize),
                supportsGrounding: false
            };
        }
    }

    // 6. Dynamic Suffix Parsing: Overrides sizes even for Proxy Models
    // If the model ID explicitly indicates a size (e.g. -4k, -2k, -1k), restrict options to that size
    if (lowerModelId.includes('-4k') || lowerModelId.endsWith('4k')) {
        fallbackCapabilities.supportedSizes = [ImageSize.SIZE_4K];
    } else if (lowerModelId.includes('-2k') || lowerModelId.endsWith('2k')) {
        fallbackCapabilities.supportedSizes = [ImageSize.SIZE_2K];
    } else if (lowerModelId.includes('-1k') || lowerModelId.endsWith('1k')) {
        fallbackCapabilities.supportedSizes = [ImageSize.SIZE_1K];
    }

    return fallbackCapabilities;
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
 * Automatically detect proper image size from the model ID.
 * Features like "-2k" or "-4k" in the model name will adjust the default ImageSize.
 * @param modelId - The selected model ID
 * @param currentSize - The currently selected image size in config (fallback)
 * @returns The best matching ImageSize
 */
export function autoDetectImageSize(modelId: string, currentSize: ImageSize): ImageSize {
    const lowerId = modelId.toLowerCase();

    if (lowerId.includes('-4k') || lowerId.endsWith('4k')) {
        return ImageSize.SIZE_4K;
    }
    if (lowerId.includes('-2k') || lowerId.includes('2k')) { // Changed from endsWith to includes for better matching
        return ImageSize.SIZE_2K;
    }

    return currentSize;
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
        return 1; // Allow 1 reference image (for Proxy Chat Mode compatibility)
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
export function getModelDisplayName(modelId: string, customLabel?: string, provider?: string): string {
    const lowerModelId = modelId.toLowerCase();
    // 🚀 [Fix] 支持多种系统积分模型后缀
    const isSystem = lowerModelId.includes('@system') || 
                     lowerModelId.includes('@12ai') || 
                     lowerModelId.includes('@systemproxy') ||
                     lowerModelId.includes('@google') ||
                     lowerModelId.includes('@openai') ||
                     lowerModelId.includes('@anthropic');
    const baseId = lowerModelId.split('@')[0];

    // 🏷️ 优先使用管理员配置的自定义名称（如果提供）
    if (customLabel) return customLabel;

    // 🍌 Nano Banana 系列模型 - 默认显示名称（仅当没有自定义label时使用）
    if (baseId.includes('gemini-3.1-flash-image') || baseId.includes('nano-banana-2')) return 'Nano Banana 2';
    if (baseId.includes('gemini-3-pro-image') || baseId.includes('nano-banana-pro')) return 'Nano Banana Pro';
    if (baseId.includes('gemini-2.5-flash-image') || (baseId.includes('nano-banana') && !baseId.includes('chat'))) return 'Nano Banana';

    // 系统线路的其他 Gemini 模型
    if (isSystem && baseId.includes('gemini-2.5-flash')) return 'Nano Banana Chat';

    // 官方或普通代理线路：保留更正式的名称
    let cleanName = baseId;
    if (baseId.includes('gemini-3.1-flash')) cleanName = 'Gemini 3.1 Flash';
    else if (baseId.includes('gemini-3-pro')) cleanName = 'Gemini 3 Pro';
    else if (baseId.includes('gemini-3-flash')) cleanName = 'Gemini 3 Flash';
    else if (baseId.includes('gemini-2.5-flash-image')) cleanName = 'Gemini 2.5 Flash (Image)';
    else if (baseId.includes('gemini-2.5-flash')) cleanName = 'Gemini 2.5 Flash';
    else if (baseId.includes('gemini-2.5-pro')) cleanName = 'Gemini 2.5 Pro';
    else if (baseId.includes('gemini-2.0') || baseId.includes('gemini-2-')) cleanName = 'Gemini 2.0 Flash';
    else if (lowerModelId.includes('imagen-4') && lowerModelId.includes('ultra')) cleanName = 'Imagen 4 Ultra';
    else if (lowerModelId.includes('imagen-4') && lowerModelId.includes('fast')) cleanName = 'Imagen 4 Fast';
    else if (lowerModelId.includes('imagen-4')) cleanName = 'Imagen 4.0';
    else if (lowerModelId.includes('imagen-3')) cleanName = 'Imagen 3';
    else if (lowerModelId.includes('veo-3.1') && lowerModelId.includes('fast')) cleanName = 'Veo 3.1 Fast';
    else if (lowerModelId.includes('veo-3.1')) cleanName = 'Veo 3.1';
    else if (lowerModelId.includes('veo-3') && lowerModelId.includes('fast')) cleanName = 'Veo 3 Fast';
    else if (lowerModelId.includes('veo-3')) cleanName = 'Veo 3';
    else if (lowerModelId.includes('veo-2') || lowerModelId.includes('veo')) cleanName = 'Veo 2';
    else cleanName = modelId.split('@')[0]; // Final fallback to base ID

    return cleanName.trim();
}

/**
 * 获取模型的主题色
 * 对于已知模型，返回特定颜色。
 * 对于未知模型，根据ID进行确定性哈希，返回一个固定颜色。
 */
export function getModelThemeColor(modelId: string): string {
    const lowerId = modelId.toLowerCase().split('@')[0]; // Strip suffix

    // 1. 已知模型的特定颜色映射
    if (lowerId.includes('gemini-3-pro')) return 'text-purple-400 border-purple-400';
    if (lowerId.includes('gemini-3-flash')) return 'text-cyan-400 border-cyan-400';
    if (lowerId.includes('gemini-2.5-pro')) return 'text-amber-400 border-amber-400';
    if (lowerId.includes('gemini-2.5-flash')) return 'text-yellow-400 border-yellow-400';

    // 旧版本 Gemini - 区分颜色
    if (lowerId.includes('gemini-1.5-pro')) return 'text-indigo-400 border-indigo-400';
    if (lowerId.includes('gemini-1.5-flash')) return 'text-lime-400 border-lime-400';

    // Imagen 系列
    if (lowerId.includes('imagen-4') && lowerId.includes('ultra')) return 'text-rose-400 border-rose-400';
    if (lowerId.includes('imagen')) return 'text-blue-400 border-blue-400';

    // Veo 视频模型
    if (lowerId.includes('veo-3')) return 'text-fuchsia-400 border-fuchsia-400';
    if (lowerId.includes('veo')) return 'text-violet-400 border-violet-400';

    // 2. 未知模型的确定性颜色生成
    const palette = [
        'text-red-400 border-red-400',
        'text-orange-400 border-orange-400',
        'text-amber-400 border-amber-400',
        'text-yellow-400 border-yellow-400',
        'text-lime-400 border-lime-400',
        'text-green-400 border-green-400',
        'text-emerald-400 border-emerald-400',
        'text-teal-400 border-teal-400',
        'text-cyan-400 border-cyan-400',
        'text-sky-400 border-sky-400',
        'text-blue-400 border-blue-400',
        'text-indigo-400 border-indigo-400',
        'text-violet-400 border-violet-400',
        'text-purple-400 border-purple-400',
        'text-fuchsia-400 border-fuchsia-400',
        'text-pink-400 border-pink-400',
        'text-rose-400 border-rose-400'
    ];

    let hash = 0;
    for (let i = 0; i < modelId.length; i++) {
        hash = modelId.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % palette.length;
    return palette[index];
}

/**
 * 获取模型的主题背景色（用于药丸框）
 * 对于积分模型返回特定的渐变色，对于其他模型返回半透明的主题背景色
 */
export function getModelThemeBgColor(modelId: string): string {
    const lowerId = modelId.toLowerCase().split('@')[0];

    // 1. 积分专属模型渐变色 (与 PromptBar 选择器一致)
    if (lowerId.includes('gemini-3-pro') || lowerId.includes('nano-banana-pro')) {
        return 'bg-[linear-gradient(180deg,#c084fc_0%,#9333ea_100%)] border-purple-500/30';
    }
    if (lowerId.includes('gemini-3.1-flash') || lowerId.includes('nano-banana-2')) {
        return 'bg-[linear-gradient(180deg,#818cf8_0%,#4f46e5_100%)] border-indigo-500/30';
    }
    if (lowerId.includes('gemini-2.5-flash-image') || lowerId.includes('nano-banana')) {
        return 'bg-[linear-gradient(180deg,#22d3ee_0%,#0891b2_100%)] border-cyan-500/30';
    }

    // 2. 默认返回透明背景
    return 'bg-[var(--bg-tertiary)] border-[var(--border-light)]';
}

/**
 * 获取模型的展示信息，包括清洗后的名称、来源类型和徽章样式
 */
export function getModelDisplayInfo(model: { id: string, name?: string, label?: string, provider?: string, custom?: boolean }): {
    displayName: string;
    sourceType: 'official' | 'proxy' | 'custom';
    badgeText: string;
    badgeColor: string;
} {
    const { id, name, label, provider, custom } = model;

    // Parse ID for suffix
    const [baseId, suffix] = id.split('@');

    // 1. 确定来源类型
    let sourceType: 'official' | 'proxy' | 'custom' = 'custom';

    // 官方模型：Provider 为 Google (且无后缀)
    if (provider === 'Google' && !suffix && !custom) {
        sourceType = 'official';
    }
    // 代理模型：有后缀 (e.g. @MyProxy)
    else if (suffix) {
        sourceType = 'proxy';
    }
    // 自动探测代理：没有后缀但ID包含官方特征 (fallback)
    else if (
        baseId.includes('gemini') ||
        baseId.includes('imagen') ||
        baseId.includes('veo') ||
        baseId.includes('nano-banana')
    ) {
        sourceType = 'proxy';
    }

    // 2. 确定徽章文本和颜色
    let badgeText = '第三方';

    // 获取统一的主题色
    const themeColor = getModelThemeColor(baseId); // Use base ID for color lookup
    let badgeColor = themeColor; // 默认使用主题色

    if (sourceType === 'official') {
        badgeText = '官方';
    } else if (sourceType === 'proxy') {
        // 使用 suffix 作为徽章文本 (e.g. MyProxy)
        // 如果没有 suffix (自动探测情况)，显示 '代理'
        badgeText = suffix || '代理';
        // 代理模型也使用模型本身的主题色
    }

    // 🚀 [Fix] 模型名称显示逻辑：
    // 1. 优先使用管理员配置的自定义名称（如果有效且不等于ID）
    // 2. Nano Banana 系列使用友好名称（如果管理员没配置自定义名称）
    // 3. 其他模型使用原始名称（name/label）
    // 4. 最后回退到ID
    let displayName: string;
    
    // 判断是否有有效的自定义名称（不等于ID的基础部分）
    // 🚀 [Fix] 管理员配置的 displayName 优先级最高
    const hasValidCustomLabel = label && label !== id && label !== baseId && label.toLowerCase() !== baseId.toLowerCase();
    const hasValidCustomName = name && name !== id && name !== baseId && name.toLowerCase() !== baseId.toLowerCase();
    
    if (hasValidCustomLabel) {
        // 🚀 使用管理员配置的自定义 label（最高优先级）
        displayName = label;
    } else if (hasValidCustomName) {
        // 使用模型原始 name
        displayName = name;
    } else {
        // 🍌 Nano Banana 系列模型 - 使用友好名称（仅当管理员没配置时）
        const lowerBaseId = baseId.toLowerCase();
        if (lowerBaseId.includes('gemini-3.1-flash-image') || lowerBaseId.includes('nano-banana-2')) {
            displayName = 'Nano Banana 2';
        } else if (lowerBaseId.includes('gemini-3-pro-image') || lowerBaseId.includes('nano-banana-pro')) {
            displayName = 'Nano Banana Pro';
        } else if (lowerBaseId.includes('gemini-2.5-flash-image') || (lowerBaseId.includes('nano-banana') && !lowerBaseId.includes('chat'))) {
            displayName = 'Nano Banana';
        } else {
            // 最后回退到 ID 的基础部分（去掉 @后缀）
            displayName = baseId;
        }
    }

    return { displayName, sourceType, badgeText, badgeColor };
}

/**
 * 模型描述信息映射
 * 按类别组织：LLM、图像生成、视频生成
 */
export const MODEL_DESCRIPTIONS: Record<string, { category: string; description: string; rank?: string }> = {
    // ===== 一、最强综合大脑 (LLM 文本与推理) =====
    'claude-opus-4': {
        category: 'LLM',
        description: '代码与复杂逻辑推理能力的行业天花板',
        rank: 'Artificial Analysis Intelligence Index'
    },
    'claude-4-5-opus': {
        category: 'LLM',
        description: '代码与复杂逻辑推理能力的行业天花板',
        rank: 'Artificial Analysis Intelligence Index'
    },
    'claude-4-6-opus': {
        category: 'LLM',
        description: '代码与复杂逻辑推理能力的行业天花板',
        rank: 'Artificial Analysis Intelligence Index'
    },
    'gpt-5': {
        category: 'LLM',
        description: 'OpenAI 最新旗舰，综合能力最强，通用任务表现极稳',
        rank: 'GPT-5.2 Series'
    },
    'gpt-5.2': {
        category: 'LLM',
        description: 'OpenAI 最新旗舰，综合能力最强，通用任务表现极稳',
        rank: 'GPT-5.2 Series'
    },
    'gemini-3-pro': {
        category: 'LLM',
        description: '全球领先的多模态理解、智能体功能和氛围编程模型',
        rank: 'Gemini 3 Pro'
    },
    'gemini-3-pro-preview': {
        category: 'LLM',
        description: '全球领先的多模态理解、智能体功能和氛围编程模型',
        rank: 'Gemini 3 Pro'
    },
    'gemini-3.1-pro-preview': {
        category: 'LLM',
        description: '最适合需要广泛的世界知识和跨模态高级推理的复杂任务',
        rank: 'Gemini 3.1 Pro'
    },
    'kimi-k2.5': {
        category: 'LLM',
        description: '擅长深度思考与长文本分析',
        rank: 'Kimi K2.5'
    },
    'glm-4.7': {
        category: 'LLM',
        description: '指令遵循度高，中文语境理解佳',
        rank: 'GLM-4.7'
    },
    'deepseek-v3.2': {
        category: 'LLM',
        description: '极具性价比，推理速度快',
        rank: 'DeepSeek V3.2 / R1'
    },
    'deepseek-r1': {
        category: 'LLM',
        description: '极具性价比，推理深度强',
        rank: 'DeepSeek V3.2 / R1'
    },
    'qwen-3-max': {
        category: 'LLM',
        description: '数学与编程强化',
        rank: 'Qwen 3 Max'
    },
    'grok-4': {
        category: 'LLM',
        description: '实时性强，风格犀利',
        rank: 'Grok 4'
    },
    'minimax-m2.1': {
        category: 'LLM',
        description: '各方面性能均衡，响应迅速',
        rank: 'MiniMax-M2.1'
    },
    'nova-2.0': {
        category: 'LLM',
        description: 'AWS 生态，适合企业级',
        rank: 'Nova 2.0'
    },
    'nova-2.0-pro': {
        category: 'LLM',
        description: 'AWS 生态，适合企业级',
        rank: 'Nova 2.0 Pro'
    },
    'nova-2.0-lite': {
        category: 'LLM',
        description: 'AWS 生态，适合企业级',
        rank: 'Nova 2.0 Lite'
    },
    'mimo-v2': {
        category: 'LLM',
        description: '极速轻量，超低价格',
        rank: 'MiMo-V2'
    },
    'doubao-seed-code': {
        category: 'LLM',
        description: '专注于代码生成，极低成本',
        rank: 'Doubao Seed Code'
    },
    'ernie-5.0': {
        category: 'LLM',
        description: '具备深度思考能力',
        rank: 'ERNIE 5.0'
    },
    'gemini-3-flash': {
        category: 'LLM',
        description: '具有专业级智能，但速度和价格与 Flash 相当',
        rank: 'Gemini 3 Flash'
    },
    'gemini-3-flash-preview': {
        category: 'LLM',
        description: '具有专业级智能，但速度和价格与 Flash 相当',
        rank: 'Gemini 3 Flash'
    },
    'qwen-3': {
        category: 'LLM',
        description: '数学与编程能力强',
        rank: 'Qwen 3 系列'
    },
    'qwen-3-32b': {
        category: 'LLM',
        description: '数学与编程能力强',
        rank: 'Qwen 3 32B'
    },

    // ===== 二、视觉设计 (图片生成) =====
    'gpt-image-1.5': {
        category: '图像生成',
        description: '极强语义理解，精准还原设计',
        rank: 'Elo Score'
    },
    'gemini-3-pro-image-preview': {
        category: '图像生成',
        description: '最高品质生图，利用高级推理遵循复杂的指令并呈现高保真文本',
        rank: 'Nano Banana Pro'
    },
    'nano-banana-pro': {
        category: '图像生成',
        description: '最高品质生图，利用高级推理遵循复杂的指令并呈现高保真文本',
        rank: 'Nano Banana Pro'
    },
    'gemini-3.1-flash-image-preview': {
        category: '图像生成',
        description: '针对速度和高用量优化，高效率、价格更低',
        rank: 'Nano Banana 2'
    },
    'hunyuan-image-3': {
        category: '图像生成',
        description: '擅长东方审美与中文语义',
        rank: 'HunyuanImage 3.0'
    },
    'seedream-4.5': {
        category: '图像生成',
        description: '高速生成，画面稳定丰富',
        rank: 'Seedream 4.5'
    },
    'flux.2-pro': {
        category: '图像生成',
        description: '写实光影与人体结构标杆',
        rank: 'FLUX.2 (Pro/Max)'
    },
    'flux.2-max': {
        category: '图像生成',
        description: '写实光影与人体结构标杆',
        rank: 'FLUX.2 (Pro/Max)'
    },
    'wan-2.6-image': {
        category: '图像生成',
        description: '擅长电商场景与人物展示',
        rank: 'Wan 2.6 Image'
    },
    'gemini-2.5-flash-image': {
        category: '图像生成',
        description: '专为速度和效率设计，可处理高数据量、低延迟任务',
        rank: 'Nano Banana'
    },
    'nano-banana': {
        category: '图像生成',
        description: '专为速度和效率设计，可处理高数据量、低延迟任务',
        rank: 'Nano Banana'
    },
    'reve-v1': {
        category: '图像生成',
        description: '综合能力佳，质感优秀',
        rank: 'Reve V1'
    },
    'eigen-image': {
        category: '图像生成',
        description: '小众高分，特定风格突出',
        rank: 'Eigen Image'
    },
    'qwen-image-edit': {
        category: '图像生成',
        description: '专精图像局部重绘与修改',
        rank: 'Qwen Image Edit'
    },
    'vidu-q2': {
        category: '图像生成',
        description: '具备视频级的动态捕捉感',
        rank: 'Vidu Q2'
    },
    'imagen-4.0-ultra-generate-001': {
        category: '图像生成',
        description: 'Google 的高保真图片生成模型 (Ultra)',
        rank: 'Imagen 4 Ultra'
    },
    'imagen-4.0-generate-001': {
        category: '图像生成',
        description: 'Google 的高保真图片生成模型 (标准)',
        rank: 'Imagen 4 Standard'
    },
    'imagen-4.0-fast-generate-001': {
        category: '图像生成',
        description: 'Google 的高保真图片生成模型 (快速)',
        rank: 'Imagen 4 Fast'
    },
    'imagineart-1.5': {
        category: '图像生成',
        description: '艺术风格强烈，适合插画',
        rank: 'ImagineArt 1.5'
    },
    'firefly-image-5': {
        category: '图像生成',
        description: '无版权争议安全模型',
        rank: 'Firefly Image 5'
    },
    'seedream-4.0': {
        category: '图像生成',
        description: '高性价比快速生成',
        rank: 'Seedream 4.0'
    },

    // ===== 三、动态视界 (视频生成) =====
    'grok-video': {
        category: '视频生成',
        description: '动态连贯性惊艳，榜单第一',
        rank: 'Grok Video'
    },
    'vidu-q3-pro': {
        category: '视频生成',
        description: '画面流畅度高，生成速度快',
        rank: 'Vidu Q3 Pro'
    },
    'runway-gen-4.5': {
        category: '视频生成',
        description: '专业运镜与笔刷控制',
        rank: 'Runway Gen-4.5'
    },
    'kling-2.6': {
        category: '视频生成',
        description: '物理模拟真实，动作极度连贯',
        rank: 'Kling 2.6 (可灵)'
    },
    'veo-3': {
        category: '视频生成',
        description: '官方按秒计费，支持原生音效',
        rank: 'Veo 3'
    },
    'veo-3.1-generate-preview': {
        category: '视频生成',
        description: '官方按秒计费，支持原生音效',
        rank: 'Veo 3'
    },
    'veo-3.1-fast-generate-preview': {
        category: '视频生成',
        description: '官方按秒计费，支持原生音效',
        rank: 'Veo 3 Fast'
    },
    'sora-2': {
        category: '视频生成',
        description: '长视频大场景一致性强',
        rank: 'Sora 2'
    },
    'ray-3': {
        category: '视频生成',
        description: '擅长高动态与快节奏镜头',
        rank: 'Ray 3'
    },
    'grok-imagine-video': {
        category: '视频生成',
        description: '动态连贯，多项榜单第一',
        rank: 'Grok Video'
    },
    'kling-2.5': {
        category: '视频生成',
        description: '物理模拟真实，人物动作自然',
        rank: 'Kling 2.5'
    },
    'seedance-1.5': {
        category: '视频生成',
        description: '超低成本，适合短视频',
        rank: 'Seedance 1.5'
    },
    'hailuo-02': {
        category: '视频生成',
        description: '人物动态生成极度自然',
        rank: 'Hailuo 02'
    },
    'wan-2.6-video': {
        category: '视频生成',
        description: '适合电商模特细节展示',
        rank: 'Wan 2.6 Video'
    },
    'pixverse-v5.5': {
        category: '视频生成',
        description: '社区活跃，风格化多样',
        rank: 'PixVerse V5.5'
    },
    'vidu-q3': {
        category: '视频生成',
        description: '流畅度与性价比均衡推荐',
        rank: 'Vidu Q3'
    },

    // ===== GPT-Best DALL-E 格式绘图扩展 =====
    'gpt-image-1': {
        category: '图像生成',
        description: '支持 Mask 局部重绘与高级修复',
        rank: 'GPT Image 1'
    },
    'gpt-4o-image': {
        category: '图像生成',
        description: '原生图像生成强悍理解',
        rank: 'GPT-4o Image'
    },
    'flux-kontext-pro': {
        category: '图像生成',
        description: '高画质参考图生成，风格迁移强',
        rank: 'Flux Kontext Pro'
    },
    'flux-kontext-max': {
        category: '图像生成',
        description: '最高画质参考图生成，顶级风格迁移',
        rank: 'Flux Kontext Max'
    },
    'doubao-seedream-4-0-250828': {
        category: '图像生成',
        description: '支持多参考图并行，高速生成',
        rank: 'Doubao Seedream 4.0'
    },
    'doubao-seededit-3-0-i2i-250628': {
        category: '图像生成',
        description: '专精图生图编辑模式',
        rank: 'Doubao SeedEdit 3.0'
    },
    'qwen-image-edit-2509': {
        category: '图像生成',
        description: '支持多图组合输入编辑',
        rank: 'Qwen Image Edit 2509'
    },
    'dall-e-3': {
        category: '图像生成',
        description: '文本理解好，风格多样化',
        rank: 'DALL-E 3'
    },
    'recraftv3': {
        category: '图像生成',
        description: '矢量图/图标/排版版式专家',
        rank: 'Recraft V3'
    },
    'ideogram-3.0': {
        category: '图像生成',
        description: '排版与极难文本嵌入标杆',
        rank: 'Ideogram 3.0'
    },

    // ===== GPT-Best 视频模型扩展 =====
    'seedance-1.0': {
        category: '视频生成',
        description: '入门级低成本首选',
        rank: 'Seedance 1.0'
    },
    'higgsfield': {
        category: '视频生成',
        description: '支持动作模板与高级预设',
        rank: 'Higgsfield'
    },
    'minimax-video': {
        category: '视频生成',
        description: '支持文/单图/多频参考频生成',
        rank: 'MiniMax Video'
    },
    'cogvideo': {
        category: '视频生成',
        description: '国产高质量串行模型',
        rank: 'CogVideo'
    },

    // ===== GPT-Best 音频模型 =====
    'suno-v4': {
        category: '音频生成',
        description: '支持片段续写、风格迁移等全场景',
        rank: 'Suno V4'
    },
    'suno-v3.5': {
        category: '音频生成',
        description: '高性价比流派音乐生成',
        rank: 'Suno V3.5'
    },
    'minimax-tts': {
        category: '音频生成',
        description: '多语种高质量人声配音',
        rank: 'MiniMax TTS'
    }
};

/**
 * 获取模型描述信息
 * @param modelId 模型 ID
 * @returns 模型描述对象，如果没有则返回 undefined
 */
export function getModelDescription(modelId: string): { category: string; description: string; rank?: string } | undefined {
    // 先尝试完整匹配
    if (MODEL_DESCRIPTIONS[modelId]) {
        return MODEL_DESCRIPTIONS[modelId];
    }

    // 尝试匹配基础 ID（去掉 @ 后缀）
    const baseId = modelId.split('@')[0];
    if (MODEL_DESCRIPTIONS[baseId]) {
        return MODEL_DESCRIPTIONS[baseId];
    }

    return undefined;
}
