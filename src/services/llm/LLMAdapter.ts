import { KeySlot } from '../keyManager';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: string[]; // Base64 or URL
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
}

export interface ImageGenerationOptions {
    modelId: string;
    prompt: string;
    aspectRatio?: string;
    negativePrompt?: string;
    seed?: number;
    width?: number;
    height?: number;
    imageCount?: number;
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
