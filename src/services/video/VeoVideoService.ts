/**
 * Veo Video Generation Service
 * 
 * 处理Veo视频模型的异步生成
 * API文档: https://ai.google.dev/gemini-api/docs/video
 */

import { AspectRatio } from '../../types';
import { buildApiUrl, buildHeaders } from '../api/apiConfig';

/**
 * Veo视频配置
 */
export interface VeoVideoConfig {
    prompt: string;
    aspectRatio?: AspectRatio;
    model?: string; // 默认: veo-3.1-generate-preview
}

/**
 * Operation状态
 */
interface VeoOperation {
    name: string;
    done: boolean;
    response?: {
        generateVideoResponse?: {
            generatedSamples?: Array<{
                video?: {
                    uri: string;
                };
            }>;
        };
    };
    error?: {
        code: number;
        message: string;
    };
}

/**
 * 视频生成结果
 */
export interface VeoVideoResult {
    url: string; // Blob URL
    operationId: string;
}

/**
 * 生成Veo视频 - 启动异步操作
 */
export async function startVeoVideoGeneration(
    config: VeoVideoConfig,
    apiKey: string,
    baseUrl?: string
): Promise<{ operationId: string }> {
    const model = config.model || 'veo-3.1-generate-preview';
    const cleanBase = baseUrl || 'https://generativelanguage.googleapis.com';

    // 构建请求 - 使用 header 认证 (官方文档标准)
    const apiUrl = `${cleanBase}/v1beta/models/${model}:predictLongRunning`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
    };

    const payload: any = {
        instances: [{ prompt: config.prompt }]
    };

    // 添加parameters
    if (config.aspectRatio && config.aspectRatio !== AspectRatio.AUTO) {
        payload.parameters = {
            aspectRatio: config.aspectRatio
        };
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result.name) {
        throw new Error('No operation name returned');
    }

    return { operationId: result.name };
}

/**
 * 轮询视频生成状态
 */
export async function pollVeoVideoOperation(
    operationId: string,
    apiKey: string,
    baseUrl?: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
): Promise<VeoVideoResult> {
    const cleanBase = baseUrl || 'https://generativelanguage.googleapis.com';
    // 轮询 URL: 使用 header 认证 (不需要 query 参数)
    const pollUrl = `${cleanBase}/v1beta/${operationId}`;

    let pollCount = 0;
    const maxPolls = 180; // 最多轮询3分钟 (每10秒一次)

    while (pollCount < maxPolls) {
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        const response = await fetch(pollUrl, {
            headers: { 'x-goog-api-key': apiKey }
        });

        if (!response.ok) {
            throw new Error(`Polling failed: HTTP ${response.status}`);
        }

        const operation: VeoOperation = await response.json();

        // 检查错误
        if (operation.error) {
            throw new Error(operation.error.message || 'Video generation failed');
        }

        // 检查是否完成
        if (operation.done) {
            const videoUri = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;

            if (!videoUri) {
                throw new Error('No video URI in response');
            }

            // 下载视频
            const videoBlob = await downloadVideo(videoUri, apiKey);
            const blobUrl = URL.createObjectURL(videoBlob);

            return {
                url: blobUrl,
                operationId
            };
        }

        // 更新进度 (简化: 根据轮询次数估算)
        const progress = Math.min(pollCount / maxPolls * 100, 95);
        onProgress?.(progress);

        // 等待10秒再次轮询
        await new Promise(resolve => setTimeout(resolve, 10000));
        pollCount++;
    }

    throw new Error('Video generation timeout');
}

/**
 * 下载视频
 */
async function downloadVideo(uri: string, apiKey: string): Promise<Blob> {
    const response = await fetch(uri, {
        headers: { 'x-goog-api-key': apiKey }
    });

    if (!response.ok) {
        throw new Error(`Video download failed: HTTP ${response.status}`);
    }

    return await response.blob();
}

/**
 * 取消视频生成操作
 */
export async function cancelVeoVideoOperation(
    operationId: string,
    apiKey: string,
    baseUrl?: string
): Promise<void> {
    const cleanBase = baseUrl || 'https://generativelanguage.googleapis.com';
    // 取消 URL: 使用 header 认证
    const cancelUrl = `${cleanBase}/v1beta/${operationId}:cancel`;

    const response = await fetch(cancelUrl, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey }
    });

    if (!response.ok) {
        throw new Error(`Cancel failed: HTTP ${response.status}`);
    }
}
