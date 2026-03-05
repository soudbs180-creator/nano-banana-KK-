/**
 * Veo 视频生成服务
 * 独立于图片生成,使用 Google Veo API
 * 
 * 图片数量决定生成模式:
 * - 0张图片: 文生视频 (Text-to-Video)
 * - 1张图片: 首帧生成 (Image-to-Video, first frame)
 * - 2张图片: 首尾帧生成 (Interpolation, first & last frame)
 * - 3张图片: 参考图生成 (Reference images as style guide) - 仅Veo 2支持
 * 
 * 注意：Veo 3/Veo 3 Fast不支持referenceImages参数
 * 视频模式下最多支持上传3张图片
 */

import { getModelCapabilities } from '../model/modelCapabilities';

export interface VideoGenerationConfig {
    prompt: string;
    model?: string; // 默认: 'veo-3.1-generate-preview'
    aspectRatio?: '16:9' | '9:16';
    resolution?: '720p' | '1080p' | '4k'; // 🚀 [新增] 分辨率参数
    negativePrompt?: string;
    /** 
     * 参考图片数组 (Base64编码, 不含data:前缀)
     * 最多3张:
     * - 1张: 作为首帧
     * - 2张: 作为首尾帧
     * - 3张: 作为参考图片 (仅Veo 2支持)
     */
    referenceImages?: string[];
}

export interface VideoGenerationResult {
    videoUrl: string;
    generationTime: number; // 毫秒
    mode: 'text-to-video' | 'first-frame' | 'interpolation' | 'reference';
}

const DEFAULT_GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com';

/**
 * 生成视频 - 使用 Veo 3.1 API
 * 这是一个异步操作,会轮询直到视频生成完成
 */
export async function generateVideo(
    config: VideoGenerationConfig,
    apiKey: string,
    baseUrl?: string, // 🚀 [新增] 支持自定义代理 Base URL
    onProgress?: (status: string) => void,
    signal?: AbortSignal
): Promise<VideoGenerationResult> {
    const startTime = Date.now();
    const model = config.model || 'veo-3.1-generate-preview';
    const images = config.referenceImages || [];
    const imageCount = Math.min(images.length, 3); // 最多3张

    // 检查模型能力
    const modelCaps = getModelCapabilities(model);
    const supportsReferenceImages = modelCaps?.supportsReferenceImages !== false; // 默认为true

    // 确定生成模式
    let mode: VideoGenerationResult['mode'];
    let modeLabel: string;
    if (imageCount === 0) {
        mode = 'text-to-video';
        modeLabel = '文生视频';
    } else if (imageCount === 1) {
        mode = 'first-frame';
        modeLabel = '首帧生成';
    } else if (imageCount === 2) {
        mode = 'interpolation';
        modeLabel = '首尾帧生成';
    } else {
        // 3张图片使用referenceImages
        if (!supportsReferenceImages) {
            // Veo 3不支持referenceImages，降级为只使用首帧
            console.warn(`[VideoService] 模型 ${model} 不支持referenceImages参数，使用首帧模式`);
            mode = 'first-frame';
            modeLabel = '首帧生成';
        } else {
            mode = 'reference';
            modeLabel = '参考图生成';
        }
    }

    onProgress?.(`${modeLabel} - 准备中...`);

    // 构建请求体 - 基础结构
    const instance: Record<string, unknown> = {
        prompt: config.prompt,
    };

    // 构建parameters对象 (aspectRatio和negativePrompt在这里)
    const parameters: Record<string, unknown> = {};

    // 添加宽高比到parameters
    if (config.aspectRatio) {
        parameters.aspectRatio = config.aspectRatio;
    }

    // 🚀 [新增] 添加分辨率到parameters
    if (config.resolution) {
        parameters.resolution = config.resolution;
        console.log(`[VideoService] 设置分辨率: ${config.resolution}`);
    }

    // 添加负面提示到parameters
    if (config.negativePrompt) {
        parameters.negativePrompt = config.negativePrompt;
    }

    // 根据图片数量添加不同参数
    if (imageCount === 1) {
        // 1张图片: 作为首帧 (image)
        instance.image = {
            bytesBase64Encoded: images[0]
        };
    } else if (imageCount === 2) {
        // 2张图片: 首尾帧 (image + lastFrame)
        instance.image = {
            bytesBase64Encoded: images[0]
        };
        instance.lastFrame = {
            bytesBase64Encoded: images[1]
        };
    } else if (imageCount >= 3 && supportsReferenceImages) {
        // 3张图片: 参考图 (referenceImages in parameters)
        // 仅当模型支持时才发送referenceImages参数
        parameters.referenceImages = images.slice(0, 3).map(img => ({
            image: {
                inlineData: {
                    mimeType: 'image/png',
                    data: img
                }
            },
            referenceType: 'asset'
        }));
    } else if (imageCount >= 3 && !supportsReferenceImages) {
        // Veo 3不支持referenceImages，只使用第一张图作为首帧
        instance.image = {
            bytesBase64Encoded: images[0]
        };
    }

    // 构建请求体
    const requestBody: Record<string, unknown> = {
        instances: [instance]
    };

    // 只有有参数时才添加parameters
    if (Object.keys(parameters).length > 0) {
        requestBody.parameters = parameters;
    }

    // 🚀 [修复] 如果传入了 Base URL，使用它。否则使用官方默认地址。
    const finalBaseUrl = baseUrl || DEFAULT_GOOGLE_BASE_URL;
    const cleanBase = finalBaseUrl.replace(/\/+$/, '');
    // 确保包含版本号 (通常是 v1beta)
    const apiBase = cleanBase.includes('/v1') ? cleanBase : `${cleanBase}/v1beta`;

    return await executeVideoGeneration(requestBody, apiKey, model, apiBase, onProgress, signal, startTime, mode, modeLabel);
}

/**
 * 执行视频生成请求并轮询结果
 */
async function executeVideoGeneration(
    requestBody: Record<string, unknown>,
    apiKey: string,
    model: string,
    apiBase: string, // 🚀 传入计算后的 apiBase
    onProgress: ((status: string) => void) | undefined,
    signal: AbortSignal | undefined,
    startTime: number,
    mode: VideoGenerationResult['mode'],
    modeLabel: string
): Promise<VideoGenerationResult> {

    // 1. 发起生成请求
    onProgress?.('开始视频生成...');
    const initResponse = await fetch(
        `${apiBase}/models/${model}:predictLongRunning?key=${apiKey}`, // 🚀 使用 apiBase 并支持 URL key
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 同时保留 header 认证以增强兼容性
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(requestBody),
            signal,
        }
    );

    if (!initResponse.ok) {
        const error = await initResponse.text();
        throw new Error(`视频生成请求失败: ${error}`);
    }

    const initData = await initResponse.json();
    const operationName = initData.name;

    if (!operationName) {
        throw new Error('未获取到操作ID');
    }

    // 2. 轮询操作状态
    let pollCount = 0;
    const maxPolls = 120; // 最多轮询 120 次 (约 20 分钟)
    const pollInterval = 10000; // 10 秒

    while (pollCount < maxPolls) {
        if (signal?.aborted) {
            throw new Error('操作已取消');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;

        onProgress?.(`视频生成中... (${pollCount * 10}秒)`);

        const statusResponse = await fetch(
            `${apiBase}/${operationName}?key=${apiKey}`, // 🚀 使用 apiBase
            {
                headers: {
                    'x-goog-api-key': apiKey,
                },
                signal,
            }
        );

        if (!statusResponse.ok) {
            const error = await statusResponse.text();
            throw new Error(`状态查询失败: ${error}`);
        }

        const statusData = await statusResponse.json();

        if (statusData.done) {
            // 3. 提取视频 URL
            const videoUri = statusData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;

            if (!videoUri) {
                // 检查是否有错误
                if (statusData.error) {
                    throw new Error(`视频生成失败: ${statusData.error.message || JSON.stringify(statusData.error)}`);
                }
                throw new Error('未获取到视频URL');
            }

            const generationTime = Date.now() - startTime;
            onProgress?.('视频生成完成,正在下载...');

            // 4. 下载视频并转为 Data URL (解决CORS问题)
            // 使用 header 认证而非 query 参数
            let videoDataUrl: string;

            try {
                console.log('[VideoService] 开始下载视频:', videoUri);
                const blob = await downloadVideoWithAuth(videoUri, apiKey, signal);
                videoDataUrl = await videoToBase64(blob);
                console.log('[VideoService] 视频转Base64成功,长度:', videoDataUrl.length);
                onProgress?.('视频下载完成!');
            } catch (downloadError: any) {
                console.error('[VideoService] 视频下载失败:', downloadError);
                // 不降级,直接抛出错误让用户知道
                throw new Error(`视频下载失败: ${downloadError.message || '网络错误'}`);
            }

            return {
                videoUrl: videoDataUrl,
                generationTime,
                mode,
            };
        }
    }

    throw new Error('视频生成超时');
}

/**
 * 下载视频 (使用 x-goog-api-key header 认证)
 * 这是推荐的下载方式,避免在URL中暴露API Key
 */
export async function downloadVideoWithAuth(
    videoUri: string,
    apiKey: string,
    signal?: AbortSignal,
    maxRetries = 3
): Promise<Blob> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[VideoService] 下载视频尝试 ${attempt}/${maxRetries}:`, videoUri);

            const response = await fetch(videoUri, {
                signal,
                headers: {
                    'x-goog-api-key': apiKey,
                    'Accept': 'video/mp4,video/*,*/*'
                },
                redirect: 'follow' // 自动跟随重定向
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            console.log('[VideoService] 视频Content-Type:', contentType);

            const blob = await response.blob();
            console.log('[VideoService] 视频下载成功,大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');

            if (blob.size === 0) {
                throw new Error('下载的视频为空');
            }

            return blob;
        } catch (error: any) {
            lastError = error;
            console.error(`[VideoService] 下载尝试 ${attempt} 失败:`, error.message);

            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    throw lastError || new Error('视频下载失败');
}

/**
 * 下载视频为 Blob (带重试机制) - 旧版本,保留兼容
 */
export async function downloadVideoAsBlob(
    videoUrl: string,
    signal?: AbortSignal,
    maxRetries = 3
): Promise<Blob> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[VideoService] 下载视频尝试 ${attempt}/${maxRetries}:`, videoUrl.substring(0, 100));

            const response = await fetch(videoUrl, {
                signal,
                // 添加必要的headers
                headers: {
                    'Accept': 'video/mp4,video/*,*/*'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            console.log('[VideoService] 视频Content-Type:', contentType);

            const blob = await response.blob();
            console.log('[VideoService] 视频下载成功,大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB');

            if (blob.size === 0) {
                throw new Error('下载的视频为空');
            }

            return blob;
        } catch (error: any) {
            lastError = error;
            console.error(`[VideoService] 下载尝试 ${attempt} 失败:`, error.message);

            if (attempt < maxRetries) {
                // 等待后重试
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    throw lastError || new Error('视频下载失败');
}

/**
 * 将视频 Blob 转换为 Base64 Data URL
 */
export async function videoToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
