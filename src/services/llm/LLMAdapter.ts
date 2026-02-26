import { KeySlot } from '../keyManager';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: string[]; // Base64 or URL
}

/**
 * Provider specific configuration
 * strictly typed to support different provider requirements
 */
export interface ProviderConfig {
    // Google Specific
    google?: {
        responseModalities?: ('TEXT' | 'IMAGE')[];
        safetySettings?: { category: string; threshold: string }[];
        imageConfig?: {
            aspectRatio?: string; // "16:9", "1:1" etc
            imageSize?: string;   // "2K", "4K"
        };
        // Tools/Grounding
        tools?: any[];
        groundingConfig?: any;
    };

    // Imagen Specific (via Google)
    imagen?: {
        sampleCount?: number;
        personGeneration?: 'dont_allow' | 'allow_adult' | 'allow_all';
        aspectRatio?: string;
        imageSize?: string; // "1K", "2K"
    };

    // OpenAI Specific
    openai?: {
        size?: string; // "1024x1024"
        quality?: 'standard' | 'hd';
        style?: 'vivid' | 'natural';
        useChatEndpoint?: boolean; // 🚀 New: Force usage of /chat/completions for Image Models
    };

    // Generic / Custom
    [key: string]: any;
}

export interface ChatOptions {
    modelId: string;
    messages: ChatMessage[];
    stream?: boolean;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string; // Optional system instruction override
    onStream?: (chunk: string) => void;
    signal?: AbortSignal;
    inlineData?: { mimeType: string; data: string }[]; // Multimodal support

    // 🚀 Standardized Provider Config
    providerConfig?: ProviderConfig;

    /** @deprecated use providerConfig instead */
    extraBody?: Record<string, any>;
}

export interface ImageGenerationOptions {
    modelId: string;
    prompt: string;
    negativePrompt?: string;
    seed?: number;

    // Standard High-Level Options (Adapter should map these to provider specific params)
    aspectRatio?: string; // "16:9", "1:1"
    width?: number;       // Optional explicit width
    height?: number;      // Optional explicit height
    imageCount?: number;

    // 🚀 Standardized Provider Config
    providerConfig?: ProviderConfig;

    /** 
     * @deprecated use providerConfig.openai.size or providerConfig.imagen.imageSize 
     * Kept for backward compat during migration
     */
    imageSize?: string;

    referenceImages?: string[]; // Base64 strings

    // 🚀 Advanced Editing Options
    maskUrl?: string; // Base64 mask for inpainting
    editMode?: 'inpaint' | 'outpaint' | 'vectorize' | 'reframe' | 'upscale' | 'replace-background' | 'edit';
}

export interface ImageGenerationResult {
    urls: string[];
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        cost?: number; // Explicit cost if returned by API
    };
    model?: string; // Actual model used
    imageSize?: string; // Actual size used
    provider?: string; // 🚀 API Provider (Internal ID e.g. 'Google')
    providerName?: string; // 🚀 User-defined Channel Name (e.g. 'Google Official')
    modelName?: string; // 🚀 User-friendly Model Name (e.g. 'Nano Banana Pro')

    // Metadata for debugging/display
    metadata?: {
        aspectRatio?: string;
        dimensions?: { width: number; height: number };
        requestId?: string;
    };
}

export interface VideoGenerationOptions {
    modelId: string;
    prompt: string;
    imageUrl?: string; // 图生视频 - 首帧图
    imageTailUrl?: string; // 首尾帧视频 - 尾帧图
    videoUrl?: string; // 视频生视频 - 原始视频 URL
    aspectRatio?: string; // '16:9', '9:16', '1:1'
    videoDuration?: string; // 向后兼容
    duration?: number; // v2 统一格式：视频时长（秒）
    resolution?: string; // v2 统一格式：'480P', '720P', '1080P'
    size?: string; // 像素尺寸 '1024x576'
    watermark?: boolean; // 是否添加水印
    providerConfig?: ProviderConfig;
}

export interface VideoGenerationResult {
    url: string; // The generated MP4/video URL
    taskId?: string; // If async
    status?: 'pending' | 'processing' | 'success' | 'failed';
    progress?: number;
    usage?: {
        totalTokens?: number;
        cost?: number;
    };
    model?: string;
    provider?: string;
    providerName?: string;
    modelName?: string;
}

export interface AudioGenerationOptions {
    modelId: string;
    prompt: string;
    audioDuration?: string; // 音频时长
    audioLyrics?: string; // Suno 歌词
    audioStyle?: string; // Suno 风格标签 (tags)
    audioTitle?: string; // Suno 歌曲标题
    audioMode?: string; // 'inspiration' | 'custom' - Suno 模式
    audioExtendFrom?: string; // 续写的任务 ID
    voiceId?: string; // MiniMax TTS 声音 ID
    speed?: number; // MiniMax TTS 语速
    providerConfig?: ProviderConfig;
}

export interface AudioGenerationResult {
    url: string; // The generated MP3/WAV/Audio URL
    taskId?: string; // If async
    status?: 'pending' | 'processing' | 'success' | 'failed';
    progress?: number;
    usage?: {
        totalTokens?: number;
        cost?: number;
    };
    model?: string;
    provider?: string;
    providerName?: string;
    modelName?: string;
    metadata?: any;
}

export interface LLMAdapter {
    /**
     * Unique ID for the adapter instance (e.g. "google-adapter", "openai-adapter")
     */
    id: string;

    /**
     * Specific provider type this adapter handles
     */
    provider: string; // 'Google' | 'OpenAI' | ...

    /**
     * Standard Chat Completion
     */
    chat(options: ChatOptions, keySlot: KeySlot): Promise<string>;

    /**
     * Stream Chat Completion (Internal logic might differ)
     */
    chatStream?(options: ChatOptions, keySlot: KeySlot): Promise<void>;

    /**
     * Image Generation
     */
    generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult>;

    /**
     * Check if this adapter supports the given model/feature
     */
    supports(modelId: string): boolean;

    /**
     * Video Generation (Optional, not all adapters support it)
     */
    generateVideo?(options: VideoGenerationOptions, keySlot: KeySlot): Promise<VideoGenerationResult>;

    /**
     * Audio Generation (Optional)
     */
    generateAudio?(options: AudioGenerationOptions, keySlot: KeySlot): Promise<AudioGenerationResult>;
}
