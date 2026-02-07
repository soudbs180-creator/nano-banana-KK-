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
        maxRefImages: 5  // Allow for Proxy Chat Mode
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
        maxRefImages: 5  // Allow for Proxy Chat Mode
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
        maxRefImages: 5  // Allow for Proxy Chat Mode
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
        maxRefImages: 5  // Allow for Proxy Chat Mode
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
    if (lowerModelId.includes('gemini-3-pro') || lowerModelId.includes('nano-banana-pro')) {
        return GOOGLE_MODEL_CAPABILITIES['gemini-3-pro-image-preview'];
    }
    if (lowerModelId.includes('gemini-2.5-flash-image') || lowerModelId.includes('nano-banana')) {
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
export function getModelDisplayName(modelId: string, customLabel?: string): string {
    // 如果有自定义label，直接返回
    if (customLabel) return customLabel;

    const lowerModelId = modelId.toLowerCase().split('@')[0]; // Strip suffix for lookup

    // Gemini 3 系列
    // Gemini 3 系列
    if (lowerModelId.includes('gemini-3-pro') || lowerModelId.includes('gemini-3-pro-image') || lowerModelId.includes('nano-banana-pro')) {
        return 'Nano Banana Pro';  // ✨ Custom Name Request
    }
    if (lowerModelId.includes('gemini-3-flash')) {
        return 'Gemini 3 Flash';
    }
    // Gemini 2.5 系列
    if (lowerModelId.includes('gemini-2.5-flash-image') || lowerModelId.includes('nano-banana')) {
        return 'Nano Banana';  // ✨ Custom Name Request
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
        return 'Imagen 4.0';
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
 * 获取模型的展示信息，包括清洗后的名称、来源类型和徽章样式
 */
export function getModelDisplayInfo(model: { id: string, name?: string, provider?: string, custom?: boolean }): {
    displayName: string;
    sourceType: 'official' | 'proxy' | 'custom';
    badgeText: string;
    badgeColor: string;
} {
    const { id, name, provider, custom } = model;

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


    // 3. 获取清洗后的显示名称
    // 使用 getModelDisplayName 确保名称格式统一 (e.g. "Nano Banana Pro" 而不是 ID)
    // 如果 model.name 是用户自定义的（且不等于 ID），优先使用它，否则使用标准名称
    const standardName = getModelDisplayName(baseId);

    // Check if name provided by KeyManager is just the ID or suffixed ID
    // KeyManager passes { name: "Nano Banana Pro", ... } usually
    const displayName = (name && name !== id && name !== baseId) ? name : standardName;

    return { displayName, sourceType, badgeText, badgeColor };
}
