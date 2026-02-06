/**
 * Gemini Image Generation Service (独立服务)
 * 
 * 官方文档: https://ai.google.dev/gemini-api/docs/image-generation
 * 
 * 端点: POST /v1beta/models/{model}:generateContent
 * 认证: x-goog-api-key header
 * 格式: contents + generationConfig
 * 
 * 支持模型:
 * - gemini-2.5-flash-image (Nano Banana)
 * - gemini-3-pro-image-preview (Nano Banana Pro)
 */

import { AspectRatio, ImageSize, ReferenceImage } from '../types';

// Google 官方 API Base URL
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com';

/**
 * Gemini Image 配置
 */
export interface GeminiImageConfig {
    prompt: string;
    model?: string;                    // 默认: gemini-2.5-flash-image
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;             // 仅 gemini-3-pro-image-preview 支持
    referenceImages?: ReferenceImage[]; // 参考图片 (最多 14 张)
    enableGrounding?: boolean;          // 启用 Google 搜索建立依据
}

/**
 * Gemini Image 生成结果
 */
export interface GeminiImageResult {
    url: string;        // data:image/png;base64,...
    tokens?: number;
    cost?: number;
    text?: string;      // 模型可能返回的文字说明
}

/**
 * 生成图片 - Gemini Image API
 * 
 * @param config - 图片配置
 * @param apiKey - Google API Key
 * @param baseUrl - API Base URL (可选，用于代理)
 * @param signal - AbortSignal (可选，用于取消)
 */
export async function generateGeminiImage(
    config: GeminiImageConfig,
    apiKey: string,
    baseUrl?: string,
    signal?: AbortSignal
): Promise<GeminiImageResult> {
    const model = config.model || 'gemini-2.5-flash-image';
    const cleanBase = baseUrl || GOOGLE_API_BASE;

    // ========== 构建请求 URL ==========
    // 官方格式: POST /v1beta/models/{model}:generateContent
    const apiUrl = `${cleanBase}/v1beta/models/${model}:generateContent`;

    // ========== 构建 Headers ==========
    // 官方使用 x-goog-api-key header 认证
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
    };

    // ========== 构建 Parts 数组 ==========
    const parts: any[] = [{ text: config.prompt }];

    // 添加参考图片
    if (config.referenceImages && config.referenceImages.length > 0) {
        for (const img of config.referenceImages) {
            if (!img.data) continue;

            let base64Data = img.data;
            let mimeType = img.mimeType || 'image/png';

            // 处理 data URL 格式
            if (img.data.startsWith('data:')) {
                const matches = img.data.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    mimeType = matches[1];
                    base64Data = matches[2];
                }
            }

            // 跳过远程 URL (需要先下载转换)
            if (!img.data.startsWith('http') && !img.data.startsWith('blob:')) {
                parts.push({
                    inlineData: {
                        mimeType,
                        data: base64Data
                    }
                });
            }
        }
    }

    // ========== 构建 Generation Config ==========
    const generationConfig: Record<string, any> = {
        responseModalities: ['TEXT', 'IMAGE']
    };

    // 图片配置
    const imageConfig: Record<string, any> = {};

    if (config.aspectRatio && config.aspectRatio !== AspectRatio.AUTO) {
        imageConfig.aspectRatio = config.aspectRatio;
    }

    // imageSize 仅 gemini-3-pro-image-preview 支持
    if (config.imageSize && model.includes('gemini-3-pro-image')) {
        imageConfig.imageSize = config.imageSize;
    }

    if (Object.keys(imageConfig).length > 0) {
        generationConfig.imageConfig = imageConfig;
    }

    // ========== 构建 Payload ==========
    const payload: Record<string, any> = {
        contents: [{
            role: 'user',
            parts
        }],
        generationConfig
    };

    // 启用 Google 搜索建立依据 (仅 gemini-3-pro-image-preview 支持)
    if (config.enableGrounding && model.includes('gemini-3-pro-image')) {
        payload.tools = [{ googleSearch: {} }];
    }

    // ========== 发送请求 ==========
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Gemini Image API Error: HTTP ${response.status}`);
    }

    const result = await response.json();

    // ========== 解析响应 ==========
    // 响应格式: { candidates: [{ content: { parts: [{ inlineData: {...} }, { text: "..." }] } }] }
    const responseParts = result.candidates?.[0]?.content?.parts || [];

    let imageUrl: string | null = null;
    let textContent: string | null = null;

    for (const part of responseParts) {
        if (part.inlineData) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            imageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
        }
        if (part.text) {
            textContent = part.text;
        }
    }

    if (!imageUrl) {
        throw new Error('No image data in Gemini response');
    }

    return {
        url: imageUrl,
        text: textContent || undefined
    };
}

/**
 * 支持的 Gemini Image 模型列表
 */
export const GEMINI_IMAGE_MODELS = [
    'gemini-2.5-flash-image',       // Nano Banana
    'gemini-3-pro-image-preview'    // Nano Banana Pro
] as const;

/**
 * 检查是否为 Gemini Image 模型
 */
export function isGeminiImageModel(modelId: string): boolean {
    return modelId.includes('gemini') && modelId.includes('image');
}

/**
 * 获取模型支持的最大参考图片数量
 */
export function getMaxReferenceImages(modelId: string): number {
    // gemini-3-pro-image-preview 支持最多 14 张参考图片
    if (modelId.includes('gemini-3-pro-image')) {
        return 14;
    }
    // gemini-2.5-flash-image 支持最多 10 张
    return 10;
}
