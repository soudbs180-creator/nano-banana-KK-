import { KeySlot } from '../auth/keyManager';
import { LLMAdapter, AudioGenerationOptions, AudioGenerationResult } from './LLMAdapter';

/**
 * 音频生成适配器
 * 严格使用 OpenAI 兼容格式 (/v1/audio/generations)
 * 
 * 支持：Suno 全场景 (文生歌/翻版/续写)、MiniMax 语音合成、通用 TTS
 * v2 统一格式状态码：NOT_START / SUBMITTED / QUEUED / IN_PROGRESS / SUCCESS / FAILURE
 */
export class AudioCompatibleAdapter implements LLMAdapter {
    id = 'audio-compatible-adapter';
    provider = 'AudioProxy';

    supports(modelId: string): boolean {
        const lower = modelId.toLowerCase();
        return lower.includes('suno') ||
            lower.includes('minimax') ||
            lower.includes('audio') ||
            lower.includes('tts') ||
            lower.includes('udio') ||
            lower.includes('riffusion');
    }

    async chat(): Promise<string> {
        throw new Error('音频适配器不支持聊天');
    }

    async generateImage(): Promise<any> {
        throw new Error('音频适配器不支持图像生成');
    }

    async generateAudio(options: AudioGenerationOptions, keySlot: KeySlot): Promise<AudioGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const submitUrl = `${cleanBase}/audio/generations`;
        const pollBaseUrl = submitUrl;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        // 构建请求体
        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
        };

        // Suno 特定参数
        if (options.audioDuration) {
            body.duration = options.audioDuration;
        }
        if (options.audioLyrics) {
            body.lyrics = options.audioLyrics;
            body.custom_lyrics = options.audioLyrics; // 部分平台用此字段
        }
        if (options.audioStyle) {
            body.style = options.audioStyle;
            body.tags = options.audioStyle; // Suno 用 tags 描述风格
        }
        if (options.audioTitle) {
            body.title = options.audioTitle;
        }
        // Suno 灵感模式 vs 自定义模式
        if (options.audioMode) {
            body.mode = options.audioMode; // 'inspiration' | 'custom'
        }
        // 续写参数
        if (options.audioExtendFrom) {
            body.extend_from = options.audioExtendFrom; // 续写的任务 ID
        }
        // MiniMax TTS 参数
        if (options.voiceId) {
            body.voice_id = options.voiceId;
        }
        if (options.speed) {
            body.speed = options.speed;
        }

        try {
            console.log(`[AudioAdapter] 提交音频生成: ${submitUrl}, 模型: ${options.modelId}`);
            const response = await fetch(submitUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`音频 API 错误 ${response.status}: ${errText.slice(0, 300)}`);
            }

            let data = await response.json();

            let taskId = data.task_id || data.id || data.data?.task_id;
            let audioUrl = data.audio_url || data.audio?.url || data.data?.audio_url ||
                data.data?.output || '';
            let status = data.status || data.data?.status || 'pending';
            let metadata: any = {};

            // 封面图
            if (data.image_url || data.data?.image_url) {
                metadata.coverUrl = data.image_url || data.data?.image_url;
            }

            // 同步返回
            if (this.isSuccessStatus(status) && audioUrl) {
                return {
                    url: audioUrl, taskId, status: 'success',
                    provider: this.provider,
                    providerName: keySlot.name || this.provider,
                    model: options.modelId, metadata
                };
            }

            // 异步轮询 - 指数退避
            if (taskId) {
                const pollUrl = `${pollBaseUrl}/${taskId}`;
                const maxDuration = 20 * 60 * 1000; // 最长 20 分钟
                const startTime = Date.now();
                let pollInterval = 5000; // 起始 5 秒（音频通常比视频慢）
                const maxInterval = 15000;

                while (Date.now() - startTime < maxDuration) {
                    await new Promise(r => setTimeout(r, pollInterval));
                    pollInterval = Math.min(pollInterval * 1.5, maxInterval);

                    try {
                        const pollRes = await fetch(pollUrl, { headers });
                        if (!pollRes.ok) {
                            console.warn(`[AudioAdapter] 轮询返回 ${pollRes.status}, 继续...`);
                            continue;
                        }

                        const pollData = await pollRes.json();
                        status = pollData.status || pollData.data?.status || status;

                        // 音频 URL - 兼容多种格式
                        audioUrl = pollData.audio_url || pollData.data?.audio_url ||
                            pollData.data?.output ||
                            pollData.audio?.url ||
                            (pollData.data?.outputs && pollData.data.outputs[0]) ||
                            audioUrl;

                        // 封面 URL
                        if (pollData.image_url || pollData.data?.image_url) {
                            metadata.coverUrl = pollData.image_url || pollData.data?.image_url;
                        }
                        // Suno 额外元数据
                        if (pollData.data?.title) metadata.title = pollData.data.title;
                        if (pollData.data?.lyrics) metadata.lyrics = pollData.data.lyrics;
                        if (pollData.data?.duration) metadata.duration = pollData.data.duration;

                        if (this.isSuccessStatus(status)) {
                            if (!audioUrl) throw new Error('任务完成但未返回音频 URL');
                            break;
                        }
                        if (this.isFailureStatus(status)) {
                            const reason = pollData.fail_reason || pollData.error ||
                                pollData.data?.error || JSON.stringify(pollData);
                            throw new Error(`音频生成失败: ${reason}`);
                        }
                    } catch (pollErr: any) {
                        if (pollErr.message.includes('音频生成失败')) throw pollErr;
                        console.warn(`[AudioAdapter] 轮询异常:`, pollErr.message);
                    }
                }

                if (!this.isSuccessStatus(status)) {
                    throw new Error(`音频生成超时 (20分钟)。最后状态: ${status}`);
                }
            }

            return {
                url: audioUrl, taskId, status: 'success',
                provider: this.provider,
                providerName: keySlot.name || this.provider,
                model: options.modelId, metadata
            };

        } catch (e: any) {
            console.error('[AudioCompatibleAdapter] 失败:', e);
            throw new Error(e.message || String(e));
        }
    }

    private isSuccessStatus(status: string): boolean {
        const s = status.toUpperCase();
        return s === 'SUCCESS' || s === 'COMPLETED' || s === 'SUCCEED';
    }

    private isFailureStatus(status: string): boolean {
        const s = status.toUpperCase();
        return s === 'FAILURE' || s === 'FAILED' || s === 'ERROR';
    }
}
