/**
 * Imagen Image Generation Service (独立服务)
 * 
 * 官方文档: https://ai.google.dev/gemini-api/docs/imagen
 * 
 * 端点: POST /v1beta/models/{model}:predict
 * 认证: x-goog-api-key header
 * 格式: instances + parameters
 */

import { AspectRatio, ImageSize } from '../types';

// Google 官方 API Base URL
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com';

/**
 * Imagen 配置
 */
export interface ImagenConfig {
    prompt: string;
    model?: string;           // 默认: imagen-4.0-generate-001
    aspectRatio?: AspectRatio;
    imageSize?: ImageSize;    // 仅 Standard/Ultra 支持
    numberOfImages?: number;  // 1-4, 默认 4
    personGeneration?: 'dont_allow' | 'allow_adult' | 'allow_all';
}

/**
 * Imagen 生成结果
 */
export interface ImagenResult {
    url: string;        // data:image/png;base64,...
    tokens?: number;
    cost?: number;
}

/**
 * 生成图片 - Imagen API
 * 
 * @param config - 图片配置
 * @param apiKey - Google API Key
 * @param baseUrl - API Base URL (可选，用于代理)
 * @param signal - AbortSignal (可选，用于取消)
 */
export async function generateImagenImage(
    config: ImagenConfig,
    apiKey: string,
    baseUrl?: string,
    signal?: AbortSignal
): Promise<ImagenResult> {
    // ✨ Sanitize API Key (Remove non-ASCII characters)
    // Fixes: "String contains non ISO-8859-1 code point"
    const cleanKey = apiKey.replace(/[^\x00-\x7F]/g, "").trim();

    if (!cleanKey) {
        throw new Error("Invalid API Key: Key is empty after sanitization (contained only non-ASCII characters?)");
    }

    const model = config.model || 'imagen-4.0-generate-001';
    const cleanBase = baseUrl || GOOGLE_API_BASE;

    // ========== 构建请求 URL ==========
    // 官方格式: POST /v1beta/models/{model}:predict
    const apiUrl = `${cleanBase}/v1beta/models/${model}:predict`;

    // ========== 构建 Headers ==========
    // 官方使用 x-goog-api-key header 认证
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey
    };

    // ========== 构建 Payload ==========
    // 官方格式: { instances: [{ prompt }], parameters: { ... } }
    const parameters: Record<string, any> = {
        sampleCount: config.numberOfImages || 1
    };

    // 宽高比
    if (config.aspectRatio && config.aspectRatio !== AspectRatio.AUTO) {
        parameters.aspectRatio = config.aspectRatio;
    }

    // 图片尺寸 (仅 Standard/Ultra 支持, Fast 版本不支持)
    const supportsSampleImageSize = !model.includes('fast');
    if (config.imageSize && supportsSampleImageSize) {
        parameters.sampleImageSize = config.imageSize;
    }

    // 人物生成控制
    if (config.personGeneration) {
        parameters.personGeneration = config.personGeneration;
    }

    const payload = {
        instances: [{ prompt: config.prompt }],
        parameters
    };

    // ========== 发送请求 ==========
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Imagen API Error: HTTP ${response.status}`);
    }

    const result = await response.json();

    // ========== 解析响应 ==========
    // 响应格式: { predictions: [{ bytesBase64Encoded: "..." }] }
    const imageData = result.predictions?.[0]?.bytesBase64Encoded;

    if (!imageData) {
        throw new Error('No image data in Imagen response');
    }

    return {
        url: `data:image/png;base64,${imageData}`
    };
}

/**
 * 支持的 Imagen 模型列表
 */
export const IMAGEN_MODELS = [
    'imagen-4.0-generate-001',       // Imagen 4 Standard
    'imagen-4.0-ultra-generate-001', // Imagen 4 Ultra
    'imagen-4.0-fast-generate-001',  // Imagen 4 Fast
    'imagen-3.0-generate-002',       // Imagen 3
    'imagen-3.0-generate-001'        // Imagen 3 (旧版)
] as const;

/**
 * 检查是否为 Imagen 模型
 */
export function isImagenModel(modelId: string): boolean {
    return modelId.startsWith('imagen-');
}
