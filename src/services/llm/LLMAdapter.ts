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
    provider?: string; // 🚀 API Provider

    // Metadata for debugging/display
    metadata?: {
        aspectRatio?: string;
        dimensions?: { width: number; height: number };
        requestId?: string;
    };
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
}
