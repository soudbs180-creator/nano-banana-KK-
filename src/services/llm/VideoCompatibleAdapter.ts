import { KeySlot } from '../keyManager';
import { LLMAdapter, VideoGenerationOptions, VideoGenerationResult } from './LLMAdapter';
import { notify } from '../notificationService';

/**
 * 视频生成适配器
 * 支持 gpt-best v2 统一格式 (/v2/videos/generations) 和通用 OpenAI 兼容格式
 * 
 * v2 统一格式状态码：NOT_START / SUBMITTED / QUEUED / IN_PROGRESS / SUCCESS / FAILURE
 */
export class VideoCompatibleAdapter implements LLMAdapter {
    id = 'video-compatible-adapter';
    provider = 'VideoProxy';

    supports(modelId: string): boolean {
        const lower = modelId.toLowerCase();
        return lower.includes('runway') ||
            lower.includes('luma') ||
            lower.includes('kling') ||
            lower.includes('wan') ||
            lower.includes('pika') ||
            lower.includes('minimax') ||
            lower.includes('vidu') ||
            lower.includes('sora') ||
            lower.includes('veo') ||
            lower.includes('seedance') ||
            lower.includes('higgsfield') ||
            lower.includes('pixverse') ||
            lower.includes('cogvideo') ||
            lower.includes('zhipu') ||
            lower.includes('qwen-video') ||
            lower.includes('hailuo');
    }

    async chat(): Promise<string> {
        throw new Error('视频适配器不支持聊天');
    }

    async generateImage(): Promise<any> {
        throw new Error('视频适配器不支持图像生成');
    }

    async generateVideo(options: VideoGenerationOptions, keySlot: KeySlot): Promise<VideoGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
        const isGptBest = baseUrl.includes('gpt-best');

        // gpt-best 使用 v2 统一格式端点，其他使用 v1
        let submitUrl: string;
        let pollBaseUrl: string;
        if (isGptBest) {
            const cleanBase = baseUrl.replace(/\/v[12]$/, '');
            submitUrl = `${cleanBase}/v2/videos/generations`;
            pollBaseUrl = submitUrl;
        } else {
            const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
            submitUrl = `${cleanBase}/videos/generations`;
            pollBaseUrl = submitUrl;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        // 构建请求体 - 兼容 v2 统一格式
        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
        };

        // 尺寸 & 比例
        if (options.aspectRatio) {
            body.aspect_ratio = options.aspectRatio;
        }
        if (options.resolution) {
            body.resolution = options.resolution;
        }
        if (options.size) {
            body.size = options.size;
        } else {
            body.size = '1024x576'; // 默认 16:9
        }
        if (options.duration) {
            body.duration = options.duration;
        }

        // 图生视频 - images 字段
        if (options.imageUrl) {
            body.images = [options.imageUrl];
        }
        // 首尾帧 - 添加尾帧
        if (options.imageTailUrl) {
            if (!body.images) body.images = [];
            body.images.push(options.imageTailUrl);
        }
        // 视频生视频 - videos 字段
        if (options.videoUrl) {
            body.videos = [options.videoUrl];
        }

        // 水印控制
        if (options.watermark !== undefined) {
            body.watermark = options.watermark;
        }

        try {
            console.log(`[VideoAdapter] 提交视频生成: ${submitUrl}, 模型: ${options.modelId}`);
            const response = await fetch(submitUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`视频 API 错误 ${response.status}: ${errText.slice(0, 300)}`);
            }

            let data = await response.json();

            // 提取 task_id - 兼容多种返回格式
            let taskId = data.task_id || data.id || data.data?.task_id;
            let videoUrl = data.video_url || data.video?.url || data.data?.video_url ||
                data.data?.output || '';
            let status = data.status || data.data?.status || 'pending';

            // 如果直接返回结果（同步模式）
            if (this.isTerminalStatus(status) && videoUrl) {
                return {
                    url: videoUrl,
                    taskId,
                    status: 'success',
                    provider: this.provider,
                    providerName: isGptBest ? 'GPT-Best' : this.provider,
                    model: options.modelId
                };
            }

            // 异步轮询 - 指数退避策略
            if (taskId) {
                const pollUrl = `${pollBaseUrl}/${taskId}`;
                const maxDuration = 30 * 60 * 1000; // 最长 30 分钟
                const startTime = Date.now();
                let pollInterval = 3000; // 起始 3 秒
                const maxInterval = 15000; // 最大 15 秒

                while (Date.now() - startTime < maxDuration) {
                    await new Promise(r => setTimeout(r, pollInterval));
                    // 指数退避：3s → 6s → 10s → 15s (封顶)
                    pollInterval = Math.min(pollInterval * 1.5, maxInterval);

                    try {
                        const pollRes = await fetch(pollUrl, { headers });
                        if (!pollRes.ok) {
                            console.warn(`[VideoAdapter] 轮询返回 ${pollRes.status}, 继续...`);
                            continue;
                        }

                        const pollData = await pollRes.json();
                        status = pollData.status || pollData.data?.status || status;

                        // v2 统一格式：data.output 或 data.outputs
                        videoUrl = pollData.video_url ||
                            pollData.data?.video_url ||
                            pollData.data?.output ||
                            pollData.video?.url ||
                            (pollData.data?.outputs && pollData.data.outputs[0]) ||
                            videoUrl;

                        // 进度日志
                        const progress = pollData.progress || '';
                        if (progress) console.log(`[VideoAdapter] 进度: ${progress}, 状态: ${status}`);

                        // 成功完成
                        if (this.isSuccessStatus(status)) {
                            if (!videoUrl) throw new Error('任务完成但未返回视频 URL');
                            console.log(`[VideoAdapter] 视频生成成功: ${videoUrl.substring(0, 80)}...`);
                            break;
                        }

                        // 失败
                        if (this.isFailureStatus(status)) {
                            const reason = pollData.fail_reason || pollData.error ||
                                pollData.data?.error || JSON.stringify(pollData);
                            throw new Error(`视频生成失败: ${reason}`);
                        }

                    } catch (pollErr: any) {
                        if (pollErr.message.includes('视频生成失败')) throw pollErr;
                        console.warn(`[VideoAdapter] 轮询异常:`, pollErr.message);
                    }
                }

                if (!this.isSuccessStatus(status)) {
                    throw new Error(`视频生成超时 (30分钟)。最后状态: ${status}`);
                }
            }

            return {
                url: videoUrl,
                taskId,
                status: 'success',
                provider: this.provider,
                providerName: isGptBest ? 'GPT-Best' : this.provider,
                model: options.modelId
            };

        } catch (e: any) {
            console.error('[VideoCompatibleAdapter] 失败:', e);
            throw new Error(e.message || String(e));
        }
    }

    /** 判断是否为终态 */
    private isTerminalStatus(status: string): boolean {
        return this.isSuccessStatus(status) || this.isFailureStatus(status);
    }

    /** 判断是否成功 */
    private isSuccessStatus(status: string): boolean {
        const s = status.toUpperCase();
        return s === 'SUCCESS' || s === 'COMPLETED' || s === 'SUCCEED';
    }

    /** 判断是否失败 */
    private isFailureStatus(status: string): boolean {
        const s = status.toUpperCase();
        return s === 'FAILURE' || s === 'FAILED' || s === 'ERROR';
    }
}
