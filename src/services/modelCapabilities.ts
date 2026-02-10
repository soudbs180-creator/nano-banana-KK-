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
        description: '谷歌最强，拥有超长上下文窗口，多模态理解力顶尖',
        rank: 'Gemini 3 Pro'
    },
    'gemini-3-pro-preview': {
        category: 'LLM',
        description: '谷歌最强，拥有超长上下文窗口，多模态理解力顶尖',
        rank: 'Gemini 3 Pro'
    },
    'kimi-k2.5': {
        category: 'LLM',
        description: '国产第一梯队，擅长深度思考模式与长文本分析',
        rank: 'Kimi K2.5'
    },
    'glm-4.7': {
        category: 'LLM',
        description: '智谱 AI 最新力作，指令遵循度高，中文语境理解极佳',
        rank: 'GLM-4.7'
    },
    'deepseek-v3.2': {
        category: 'LLM',
        description: '开源界性价比之王，推理速度快，逻辑能力比肩闭源',
        rank: 'DeepSeek V3.2 / R1'
    },
    'deepseek-r1': {
        category: 'LLM',
        description: '开源界性价比之王，推理速度快，逻辑能力比肩闭源',
        rank: 'DeepSeek V3.2 / R1'
    },
    'qwen-3-max': {
        category: 'LLM',
        description: '阿里通义千问最强版，数学与编程能力表现卓越',
        rank: 'Qwen 3 Max'
    },
    'grok-4': {
        category: 'LLM',
        description: 'xAI 出品，实时性强，依托 X 平台数据，风格犀利',
        rank: 'Grok 4'
    },
    'minimax-m2.1': {
        category: 'LLM',
        description: '国产通用大模型，各方面性能均衡，响应迅速',
        rank: 'MiniMax-M2.1'
    },
    'nova-2.0': {
        category: 'LLM',
        description: 'AWS 生态核心，含 Pro/Lite 版，适合企业级',
        rank: 'Nova 2.0'
    },
    'nova-2.0-pro': {
        category: 'LLM',
        description: 'AWS 生态核心，含 Pro/Lite 版，适合企业级',
        rank: 'Nova 2.0 Pro'
    },
    'nova-2.0-lite': {
        category: 'LLM',
        description: 'AWS 生态核心，含 Pro/Lite 版，适合企业级',
        rank: 'Nova 2.0 Lite'
    },
    'mimo-v2': {
        category: 'LLM',
        description: '小米出品，极速轻量，成本极低（$0.15）',
        rank: 'MiMo-V2'
    },
    'doubao-seed-code': {
        category: 'LLM',
        description: '字节跳动出品，专注于代码生成，超低成本',
        rank: 'Doubao Seed Code'
    },
    'ernie-5.0': {
        category: 'LLM',
        description: '百度文心一言最新版，具备深度思考能力',
        rank: 'ERNIE 5.0'
    },
    'gemini-3-flash': {
        category: 'LLM',
        description: '谷歌 Flash 版，百万级上下文，多模态最强',
        rank: 'Gemini 3 Flash'
    },
    'gemini-3-flash-preview': {
        category: 'LLM',
        description: '谷歌 Flash 版，百万级上下文，多模态最强',
        rank: 'Gemini 3 Flash'
    },
    'qwen-3': {
        category: 'LLM',
        description: '阿里通义千问，数学与编程强，开源闭源均有',
        rank: 'Qwen 3 系列'
    },
    'qwen-3-32b': {
        category: 'LLM',
        description: '阿里通义千问，数学与编程强，开源闭源均有',
        rank: 'Qwen 3 32B'
    },

    // ===== 二、视觉设计 (图片生成) =====
    'gpt-image-1.5': {
        category: '图像生成',
        description: '语义理解极强，极其"听话"，精准还原复杂提示词',
        rank: 'Elo Score'
    },
    'gemini-3-pro-image-preview': {
        category: '图像生成',
        description: '擅长精准文字嵌入与多图融合设计',
        rank: 'Nano Banana Pro'
    },
    'nano-banana-pro': {
        category: '图像生成',
        description: '擅长精准文字嵌入与多图融合设计',
        rank: 'Nano Banana Pro'
    },
    'hunyuan-image-3': {
        category: '图像生成',
        description: '腾讯混元，对东方审美与中文语义理解极具优势',
        rank: 'HunyuanImage 3.0'
    },
    'seedream-4.5': {
        category: '图像生成',
        description: '字节跳动出品，生成速度快，画面细节丰富且稳定',
        rank: 'Seedream 4.5'
    },
    'flux.2-pro': {
        category: '图像生成',
        description: '写实派霸主，光影质感与人体结构逼真度目前最强',
        rank: 'FLUX.2 (Pro/Max)'
    },
    'flux.2-max': {
        category: '图像生成',
        description: '写实派霸主，光影质感与人体结构逼真度目前最强',
        rank: 'FLUX.2 (Pro/Max)'
    },
    'wan-2.6-image': {
        category: '图像生成',
        description: '阿里万相，在电商场景与人物展示上表现非常出色',
        rank: 'Wan 2.6 Image'
    },
    'gemini-2.5-flash-image': {
        category: '图像生成',
        description: '快速图像生成，性价比高，支持多种宽高比',
        rank: 'Nano Banana'
    },
    'nano-banana': {
        category: '图像生成',
        description: '快速图像生成，性价比高，支持多种宽高比',
        rank: 'Nano Banana'
    },
    'reve-v1': {
        category: '图像生成',
        description: '新晋黑马，综合评分高，画面质感优秀',
        rank: 'Reve V1'
    },
    'eigen-image': {
        category: '图像生成',
        description: '小众高分模型，特定风格表现力强',
        rank: 'Eigen Image'
    },
    'qwen-image-edit': {
        category: '图像生成',
        description: '通义千问图像编辑版，擅长局部重绘与修改',
        rank: 'Qwen Image Edit'
    },
    'vidu-q2': {
        category: '图像生成',
        description: '视频大厂出的图像模型，动态捕捉能力下放',
        rank: 'Vidu Q2'
    },
    'imagen-4-ultra': {
        category: '图像生成',
        description: '谷歌上一代旗舰，写实感强，企业级应用多',
        rank: 'Imagen 4 Ultra'
    },
    'imagineart-1.5': {
        category: '图像生成',
        description: '艺术风格化强，适合创意类插画生成',
        rank: 'ImagineArt 1.5'
    },
    'firefly-image-5': {
        category: '图像生成',
        description: '集成于 PS/Adobe 全家桶，版权合规最安全',
        rank: 'Firefly Image 5'
    },
    'seedream-4.0': {
        category: '图像生成',
        description: '字节出品，生成速度快，细节丰富，性价比高',
        rank: 'Seedream 4.0'
    },

    // ===== 三、动态视界 (视频生成) =====
    'grok-video': {
        category: '视频生成',
        description: '马斯克旗下 xAI 新品，动态表现与生成连贯性惊人',
        rank: 'Grok Video'
    },
    'vidu-q3-pro': {
        category: '视频生成',
        description: '国产视频黑马，生成速度快，画面流畅度极高',
        rank: 'Vidu Q3 Pro'
    },
    'runway-gen-4.5': {
        category: '视频生成',
        description: '视频可控性之王，提供专业级运镜与笔刷控制工具',
        rank: 'Runway Gen-4.5'
    },
    'kling-2.6': {
        category: '视频生成',
        description: '物理规律模拟最真实，画面与动作连贯性国产第一',
        rank: 'Kling 2.6 (可灵)'
    },
    'veo-3': {
        category: '视频生成',
        description: 'Google 出品，4K 影视画质，支持原生音效同步生成',
        rank: 'Veo 3'
    },
    'veo-3.1-generate-preview': {
        category: '视频生成',
        description: 'Google 出品，4K 影视画质，支持原生音效同步生成',
        rank: 'Veo 3'
    },
    'veo-3.1-fast-generate-preview': {
        category: '视频生成',
        description: 'Google 出品，4K 影视画质，支持原生音效同步生成',
        rank: 'Veo 3 Fast'
    },
    'sora-2': {
        category: '视频生成',
        description: '长视频标杆，大场景一致性强，镜头语言丰富',
        rank: 'Sora 2'
    },
    'ray-3': {
        category: '视频生成',
        description: 'Luma Labs 出品，擅长生成高动态、快节奏的酷炫视频',
        rank: 'Ray 3'
    },
    'grok-imagine-video': {
        category: '视频生成',
        description: '马斯克旗下 xAI 出品，榜单第一，动态连贯，深度集成于 X 平台',
        rank: 'Grok Video'
    },
    'kling-2.5': {
        category: '视频生成',
        description: '快手可灵，物理模拟最真实，版本迭代极快',
        rank: 'Kling 2.5'
    },
    'seedance-1.5': {
        category: '视频生成',
        description: '字节跳动出品，超低成本（$1.56），适合短视频',
        rank: 'Seedance 1.5'
    },
    'hailuo-02': {
        category: '视频生成',
        description: '海螺视频，人物动态自然，生成价格合理',
        rank: 'Hailuo 02'
    },
    'wan-2.6-video': {
        category: '视频生成',
        description: '阿里万相视频版，电商模特展示效果好',
        rank: 'Wan 2.6 Video'
    },
    'pixverse-v5.5': {
        category: '视频生成',
        description: '专注于视频生成，社区活跃，风格多样',
        rank: 'PixVerse V5.5'
    },
    'vidu-q3': {
        category: '视频生成',
        description: '国产视频强手，生成流畅，性价比适中',
        rank: 'Vidu Q3'
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
