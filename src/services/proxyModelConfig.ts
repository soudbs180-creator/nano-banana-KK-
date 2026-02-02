/**
 * Proxy Model Configuration Service
 *
 * Manages third-party proxy model configurations for the relay proxy mode.
 * Each API key can have its own set of configured models with specific capabilities.
 *
 * Reference: https://docs.newapi.pro/zh/docs
 */

import { AspectRatio, ImageSize } from '../types';

/**
 * Proxy model configuration interface
 * Defines a model available through third-party proxy APIs
 */
export interface ProxyModelConfig {
    /** Unique model ID (used as API parameter) */
    id: string;

    /** Display name for UI */
    label: string;

    /** Model type: image generation, video generation, or chat */
    type: 'image' | 'video' | 'chat';

    /** Provider name (e.g., OpenAI, Midjourney, Stability AI) */
    provider?: string;

    /** API Format: Standard OpenAI format or Google Gemini format */
    apiFormat?: 'openai' | 'gemini';

    /** Supported aspect ratios for this model */
    supportedAspectRatios: AspectRatio[];

    /** Supported image/video sizes for this model */
    supportedSizes: ImageSize[];

    /** Whether this model supports grounding/web search */
    supportsGrounding: boolean;

    /** Video specific capabilities */
    videoCapabilities?: {
        supportsDuration?: boolean;   // Allow selecting duration (5s, 10s)
        supportsFirstFrame?: boolean; // Allow image-to-video (start frame)
        supportsLastFrame?: boolean;  // Allow image-to-video (end frame)
        supportsFps?: boolean;        // Allow FPS selection
    };

    /** Optional description for UI display */
    description?: string;
}

/**
 * Storage structure for proxy models organized by type
 */
export interface ProxyModelStore {
    imageModels: ProxyModelConfig[];
    videoModels: ProxyModelConfig[];
    chatModels: ProxyModelConfig[];
}

/**
 * Default proxy model presets for common third-party models
 * Users can add these as starting points
 */
export const PROXY_MODEL_PRESETS: ProxyModelConfig[] = [
    // OpenAI DALL-E Series
    {
        id: 'dall-e-3',
        label: 'DALL-E 3',
        type: 'image',
        provider: 'OpenAI',
        apiFormat: 'openai',
        supportedAspectRatios: [
            AspectRatio.SQUARE,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.PORTRAIT_9_16
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false,
        description: 'OpenAI 最强绘图模型'
    },

    // Midjourney
    {
        id: 'midjourney',
        label: 'Midjourney V6',
        type: 'image',
        provider: 'Midjourney',
        apiFormat: 'openai',
        supportedAspectRatios: [
            AspectRatio.SQUARE,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.LANDSCAPE_21_9
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: false,
        description: '当前最强艺术绘图模型'
    },
    {
        id: 'mj-chat',
        label: 'Midjourney Chat',
        type: 'image',
        provider: 'Midjourney',
        apiFormat: 'openai',
        supportedAspectRatios: [AspectRatio.SQUARE],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        description: 'MJ 对话模式 (支持复杂参数)'
    },

    // Flux Series
    {
        id: 'flux-pro-1.1-ultra',
        label: 'FLUX 1.1 Pro Ultra',
        type: 'image',
        provider: 'Black Forest Labs',
        apiFormat: 'openai',
        supportedAspectRatios: [
            AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_21_9, AspectRatio.PORTRAIT_9_21
        ],
        supportedSizes: [ImageSize.SIZE_2K, ImageSize.SIZE_4K],
        supportsGrounding: false,
        description: 'FLUX 最新 Ultra 版，画质极高'
    },
    {
        id: 'flux-pro',
        label: 'FLUX.1 Pro',
        type: 'image',
        provider: 'Black Forest Labs',
        apiFormat: 'openai',
        supportedAspectRatios: [
            AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16,
            AspectRatio.PORTRAIT_3_4, AspectRatio.LANDSCAPE_4_3
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false,
        description: 'FLUX 专业版'
    },
    {
        id: 'flux-schnell',
        label: 'FLUX.1 Schnell',
        type: 'image',
        provider: 'Black Forest Labs',
        apiFormat: 'openai',
        supportedAspectRatios: [AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        description: 'FLUX 极速版 (4步出图)'
    },

    // Ideogram
    {
        id: 'ideogram-v2',
        label: 'Ideogram v2',
        type: 'image',
        provider: 'Ideogram',
        apiFormat: 'openai',
        supportedAspectRatios: [
            AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_3_2, AspectRatio.PORTRAIT_2_3
        ],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false,
        description: '文字渲染能力极强'
    },

    // Recraft
    {
        id: 'recraft-v3',
        label: 'Recraft v3',
        type: 'image',
        provider: 'Recraft',
        apiFormat: 'openai',
        supportedAspectRatios: [AspectRatio.SQUARE, AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        description: '矢量图与可编辑设计生成'
    },

    // Video Models
    {
        id: 'kling-v1.5',
        label: 'Kling 1.5 (可灵)',
        type: 'video',
        provider: 'Kuaishou',
        apiFormat: 'openai',
        supportedAspectRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K, ImageSize.SIZE_2K],
        supportsGrounding: false,
        videoCapabilities: {
            supportsDuration: true,
            supportsFirstFrame: true, // 图生视频
            supportsLastFrame: true   // 尾帧控制
        },
        description: '快手可灵最新版 1080p'
    },
    {
        id: 'runway-gen-3-alpha-turbo',
        label: 'Runway Gen-3 Turbo',
        type: 'video',
        provider: 'Runway',
        apiFormat: 'openai',
        supportedAspectRatios: [AspectRatio.LANDSCAPE_16_9],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        videoCapabilities: {
            supportsDuration: true,
            supportsFirstFrame: true
        },
        description: 'Runway 极速生成模型'
    },
    {
        id: 'luma-dream-machine',
        label: 'Luma Dream Machine',
        type: 'video',
        provider: 'Luma',
        apiFormat: 'openai',
        supportedAspectRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        videoCapabilities: {
            supportsDuration: true,
            supportsFirstFrame: true,
            supportsLastFrame: true
        },
        description: 'Luma 物理模拟视频'
    },
    {
        id: 'hailuo-video',
        label: 'Hailuo (海螺/MiniMax)',
        type: 'video',
        provider: 'MiniMax',
        apiFormat: 'openai',
        supportedAspectRatios: [AspectRatio.LANDSCAPE_16_9],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        videoCapabilities: {
            supportsFirstFrame: true
        },
        description: 'MiniMax 海螺视频模型'
    },
    {
        id: 'cogvideox',
        label: 'CogVideoX',
        type: 'video',
        provider: 'Zhipu',
        apiFormat: 'openai',
        supportedAspectRatios: [AspectRatio.LANDSCAPE_16_9, AspectRatio.PORTRAIT_9_16],
        supportedSizes: [ImageSize.SIZE_1K],
        supportsGrounding: false,
        description: '智谱 AI 视频生成'
    },

    // Gemini Series (via Proxy) - 已移除旧版本，请直接使用 Google 官方 API
    // 最新模型: gemini-2.5-pro, gemini-2.5-flash, gemini-3-pro-preview, gemini-3-flash-preview

    // Chat Models (OpenAI format)
    {
        id: 'gpt-4o',
        label: 'GPT-4o',
        type: 'chat',
        provider: 'OpenAI',
        apiFormat: 'openai',
        supportedAspectRatios: [],
        supportedSizes: [],
        supportsGrounding: true,
        description: 'OpenAI 最新全能模型'
    },
    {
        id: 'claude-3-5-sonnet-20240620',
        label: 'Claude 3.5 Sonnet',
        type: 'chat',
        provider: 'Anthropic',
        apiFormat: 'openai', // Most proxies map Anthropic to OpenAI format
        supportedAspectRatios: [],
        supportedSizes: [],
        supportsGrounding: false,
        description: 'Anthropic 编码最强模型'
    },
    {
        id: 'deepseek-chat',
        label: 'DeepSeek V3',
        type: 'chat',
        provider: 'DeepSeek',
        apiFormat: 'openai',
        supportedAspectRatios: [],
        supportedSizes: [],
        supportsGrounding: true,
        description: 'DeepSeek 性价比之王'
    }
];

/**
 * Create a new empty proxy model config
 */
export function createEmptyProxyModel(type: 'image' | 'video' | 'chat'): ProxyModelConfig {
    return {
        id: '',
        label: '',
        type,
        provider: '',
        apiFormat: 'openai',
        supportedAspectRatios: type === 'chat' ? [] : Object.values(AspectRatio),
        supportedSizes: type === 'chat' ? [] : Object.values(ImageSize),
        supportsGrounding: false,
        videoCapabilities: type === 'video' ? {
            supportsFirstFrame: true,
            supportsDuration: true,
            supportsLastFrame: true,
            supportsFps: true
        } : undefined,
        description: ''
    };
}

/**
 * Validate a proxy model configuration
 */
export function validateProxyModel(model: ProxyModelConfig): string | null {
    if (!model.id || !model.id.trim()) {
        return '请输入模型 ID';
    }
    if (!model.label || !model.label.trim()) {
        return '请输入显示名称';
    }
    if (model.type !== 'chat') {
        if (model.supportedAspectRatios.length === 0) {
            return '请至少选择一个支持的比例';
        }
        if (model.supportedSizes.length === 0) {
            return '请至少选择一个支持的分辨率';
        }
    }
    return null;
}
