import { KeySlot } from '../auth/keyManager';
import { formatAuthorizationHeaderValue } from '../api/apiConfig';
import { LLMAdapter, VideoGenerationOptions, VideoGenerationResult } from './LLMAdapter';
import { resolveProviderRuntime } from '../api/providerStrategy';

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
        const cleanBase = this.normalizeBaseUrl(keySlot.baseUrl);
        const runtime = resolveProviderRuntime({
            provider: keySlot.provider,
            baseUrl: cleanBase,
            format: keySlot.format,
            authMethod: keySlot.authMethod,
            headerName: keySlot.headerName,
            compatibilityMode: keySlot.compatibilityMode,
            modelId: options.modelId,
        });

        if (runtime.videoApiStyle === 'openai-v1-videos') {
            return this.generateVideoViaNewApi(options, keySlot, cleanBase);
        }

        try {
            return await this.generateVideoViaNewApi(options, keySlot, cleanBase);
        } catch (error: any) {
            if (!this.isNewApiCompatibilityError(error)) {
                throw error;
            }
            return this.generateVideoViaLegacyProxy(options, keySlot, cleanBase);
        }
    }

    private normalizeBaseUrl(baseUrl?: string): string {
        const clean = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
        return clean.endsWith('/v1') ? clean : `${clean}/v1`;
    }

    private isNewApiCompatibilityError(error: any): boolean {
        const message = String(error?.message || '').toLowerCase();
        return message.includes('/videos') ||
            message.includes('not found') ||
            message.includes('404') ||
            message.includes('405') ||
            message.includes('415') ||
            message.includes('unsupported') ||
            message.includes('invalid request');
    }

    private buildHeaders(keySlot: KeySlot, includeJsonContentType: boolean): Record<string, string> {
        const token = String(keySlot.key || '').trim();
        const runtime = resolveProviderRuntime({
            provider: keySlot.provider,
            baseUrl: this.normalizeBaseUrl(keySlot.baseUrl),
            format: keySlot.format,
            authMethod: keySlot.authMethod,
            headerName: keySlot.headerName,
            compatibilityMode: keySlot.compatibilityMode,
        });
        const headers: Record<string, string> = {
            'Authorization': formatAuthorizationHeaderValue(token, runtime.authorizationValueFormat)
        };

        if (includeJsonContentType) {
            headers['Content-Type'] = 'application/json';
        }

        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        return headers;
    }

    private getDurationSeconds(options: VideoGenerationOptions): number | undefined {
        if (typeof options.duration === 'number' && Number.isFinite(options.duration) && options.duration > 0) {
            return Math.round(options.duration);
        }

        const legacyDuration = Number.parseInt(String(options.videoDuration || '').trim(), 10);
        if (Number.isFinite(legacyDuration) && legacyDuration > 0) {
            return legacyDuration;
        }

        return undefined;
    }

    private getNormalizedAspectRatio(options: VideoGenerationOptions): '16:9' | '9:16' | '1:1' | undefined {
        const raw = String(options.aspectRatio || '').trim();
        if (!raw || raw.toLowerCase() === 'auto') {
            return undefined;
        }

        if (raw === '16:9' || raw === '9:16' || raw === '1:1') {
            return raw;
        }

        return undefined;
    }

    private getVideoSizeString(options: VideoGenerationOptions): string | undefined {
        const explicitSize = String(options.size || '').trim();
        if (/^\d+x\d+$/i.test(explicitSize)) {
            return explicitSize;
        }

        const resolution = String(options.resolution || '').trim().toLowerCase();
        const aspectRatio = this.getNormalizedAspectRatio(options) || '16:9';

        const sizeMap: Record<string, Record<'16:9' | '9:16' | '1:1', string>> = {
            '480p': {
                '16:9': '854x480',
                '9:16': '480x854',
                '1:1': '480x480'
            },
            '720p': {
                '16:9': '1280x720',
                '9:16': '720x1280',
                '1:1': '720x720'
            },
            '1080p': {
                '16:9': '1920x1080',
                '9:16': '1080x1920',
                '1:1': '1080x1080'
            },
            '4k': {
                '16:9': '3840x2160',
                '9:16': '2160x3840',
                '1:1': '2160x2160'
            }
        };

        return sizeMap[resolution]?.[aspectRatio];
    }

    private extractTaskId(payload: any): string | undefined {
        return payload?.task_id ||
            payload?.id ||
            payload?.data?.task_id ||
            payload?.data?.id;
    }

    private extractStatus(payload: any): string {
        return String(
            payload?.status ||
            payload?.data?.status ||
            payload?.state ||
            payload?.data?.state ||
            ''
        );
    }

    private extractVideoUrl(payload: any): string {
        return payload?.video_url ||
            payload?.url ||
            payload?.output ||
            payload?.data?.video_url ||
            payload?.data?.url ||
            payload?.data?.output ||
            payload?.video?.url ||
            payload?.data?.video?.url ||
            payload?.data?.outputs?.[0] ||
            '';
    }

    private isSuccessStatus(status: string): boolean {
        const normalized = status.trim().toUpperCase();
        return normalized === 'SUCCESS' ||
            normalized === 'SUCCEEDED' ||
            normalized === 'COMPLETED' ||
            normalized === 'DONE';
    }

    private isFailureStatus(status: string): boolean {
        const normalized = status.trim().toUpperCase();
        return normalized === 'FAILURE' ||
            normalized === 'FAILED' ||
            normalized === 'ERROR' ||
            normalized === 'CANCELLED';
    }

    private async appendInputReference(formData: FormData, imageSource: string): Promise<void> {
        if (!imageSource) return;

        if (imageSource.startsWith('data:')) {
            const response = await fetch(imageSource);
            const blob = await response.blob();
            formData.append('input_reference', blob, 'reference-image.png');
            return;
        }

        try {
            const response = await fetch(imageSource);
            if (response.ok) {
                const blob = await response.blob();
                const fileName = blob.type.includes('jpeg') ? 'reference-image.jpg' : 'reference-image.png';
                formData.append('input_reference', blob, fileName);
                return;
            }
        } catch (error) {
            console.warn('[VideoCompatibleAdapter] 远程参考图转文件失败，回退到兼容字段 image');
        }

        formData.append('image', imageSource);
    }

    private async fetchContentUrl(
        cleanBase: string,
        taskId: string,
        headers: Record<string, string>,
        signal?: AbortSignal
    ): Promise<string> {
        const contentUrls = [
            `${cleanBase}/videos/${encodeURIComponent(taskId)}/content`,
            `${cleanBase}/video/generations/${encodeURIComponent(taskId)}/content`
        ];

        for (const contentUrl of contentUrls) {
            const response = await fetch(contentUrl, { headers, signal });
            if (!response || !response.ok) {
                continue;
            }

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const payload = await response.json().catch(() => ({}));
                const videoUrl = this.extractVideoUrl(payload);
                if (videoUrl) {
                    return videoUrl;
                }
                continue;
            }

            const blob = await response.blob();
            if (!blob.size || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
                continue;
            }

            return URL.createObjectURL(blob);
        }

        return '';
    }

    private async generateVideoViaNewApi(
        options: VideoGenerationOptions,
        keySlot: KeySlot,
        cleanBase: string
    ): Promise<VideoGenerationResult> {
        const submitUrl = `${cleanBase}/videos`;
        const headers = this.buildHeaders(keySlot, false);
        const formData = new FormData();

        formData.append('model', options.modelId);
        formData.append('prompt', options.prompt);

        const seconds = this.getDurationSeconds(options);
        if (seconds) {
            formData.append('seconds', String(seconds));
        }

        const size = this.getVideoSizeString(options);
        if (size) {
            formData.append('size', size);
        }

        if (options.imageUrl) {
            await this.appendInputReference(formData, options.imageUrl);
        }

        if (options.aspectRatio || options.resolution || options.size || options.imageTailUrl || options.videoUrl) {
            console.warn('[VideoCompatibleAdapter] new-api 严格模式仅转发文档字段 model / prompt / seconds / input_reference，其他视频字段不再私自改写。');
        }

        const response = await fetch(submitUrl, {
            method: 'POST',
            headers,
            body: formData,
            signal: options.signal
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`视频 API 错误 ${response.status}: ${errText.slice(0, 300)}`);
        }

        const payload = await response.json().catch(() => ({}));
        const taskId = this.extractTaskId(payload);
        const directUrl = this.extractVideoUrl(payload);
        const status = this.extractStatus(payload);

        if (taskId) {
            options.onTaskId?.(taskId);
        }

        if (directUrl && (!status || this.isSuccessStatus(status))) {
            return {
                url: directUrl,
                taskId,
                status: 'success',
                provider: this.provider,
                providerName: keySlot.name || this.provider,
                model: options.modelId
            };
        }

        if (!taskId) {
            throw new Error('视频接口返回成功，但未提供任务 ID 或可用视频地址');
        }

        return this.pollNewApiTask(taskId, options, keySlot, cleanBase);
    }

    private async pollNewApiTask(
        taskId: string,
        options: VideoGenerationOptions,
        keySlot: KeySlot,
        cleanBase: string
    ): Promise<VideoGenerationResult> {
        const headers = this.buildHeaders(keySlot, false);
        const pollUrls = [
            `${cleanBase}/videos/${encodeURIComponent(taskId)}`,
            `${cleanBase}/video/generations/${encodeURIComponent(taskId)}`
        ];
        const maxDurationMs = 30 * 60 * 1000;
        const startTime = Date.now();
        let pollInterval = 3000;
        const maxInterval = 15000;

        while (Date.now() - startTime < maxDurationMs) {
            if (options.signal?.aborted) {
                throw new Error('视频生成已取消');
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
            pollInterval = Math.min(Math.round(pollInterval * 1.5), maxInterval);

            let response!: Response;
            let fatalError: Error | null = null;

            for (const pollUrl of pollUrls) {
                response = await fetch(pollUrl, {
                    headers,
                    signal: options.signal
                });

                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    if (response.status >= 500 || response.status === 404) {
                        continue;
                    }
                    fatalError = new Error(`瑙嗛杞閿欒 ${response.status}: ${errText.slice(0, 200)}`);
                    break;
                }

                break;
            }

            if (!response || !response.ok) {
                const errText = response ? await response.text().catch(() => '') : '';
                if (response?.status >= 500 || response?.status === 404) {
                    continue;
                }
                if (fatalError) {
                    throw fatalError;
                }
                throw new Error(`视频轮询错误 ${response.status}: ${errText.slice(0, 200)}`);
            }

            const payload = await response.json().catch(() => ({}));
            const status = this.extractStatus(payload);
            const directUrl = this.extractVideoUrl(payload);

            if (directUrl && this.isSuccessStatus(status || 'SUCCESS')) {
                return {
                    url: directUrl,
                    taskId,
                    status: 'success',
                    provider: this.provider,
                    providerName: keySlot.name || this.provider,
                    model: options.modelId
                };
            }

            if (this.isSuccessStatus(status)) {
                const contentUrl = await this.fetchContentUrl(cleanBase, taskId, headers, options.signal);
                if (contentUrl) {
                    return {
                        url: contentUrl,
                        taskId,
                        status: 'success',
                        provider: this.provider,
                        providerName: keySlot.name || this.provider,
                        model: options.modelId
                    };
                }

                throw new Error('视频任务已成功完成，但未取回可用的视频内容');
            }

            if (this.isFailureStatus(status)) {
                const reason = payload?.error || payload?.message || payload?.data?.error || JSON.stringify(payload);
                throw new Error(`视频生成失败: ${reason}`);
            }
        }

        throw new Error('视频生成超时（30 分钟）');
    }

    private async generateVideoViaLegacyProxy(
        options: VideoGenerationOptions,
        keySlot: KeySlot,
        cleanBase: string
    ): Promise<VideoGenerationResult> {
        const submitUrl = `${cleanBase}/videos/generations`;
        const headers = this.buildHeaders(keySlot, true);
        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
        };

        if (options.aspectRatio && String(options.aspectRatio).toLowerCase() !== 'auto') {
            body.aspect_ratio = options.aspectRatio;
        }
        if (options.resolution) {
            body.resolution = options.resolution;
        }
        if (options.size) {
            body.size = options.size;
        }
        if (this.getDurationSeconds(options)) {
            body.duration = this.getDurationSeconds(options);
        }
        if (options.imageUrl) {
            body.images = [options.imageUrl];
        }
        if (options.imageTailUrl) {
            body.images = Array.isArray(body.images) ? body.images : [];
            body.images.push(options.imageTailUrl);
        }
        if (options.videoUrl) {
            body.videos = [options.videoUrl];
        }
        if (options.watermark !== undefined) {
            body.watermark = options.watermark;
        }

        const response = await fetch(submitUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`视频 API 错误 ${response.status}: ${errText.slice(0, 300)}`);
        }

        const payload = await response.json().catch(() => ({}));
        const taskId = this.extractTaskId(payload);
        const directUrl = this.extractVideoUrl(payload);
        const status = this.extractStatus(payload);

        if (taskId) {
            options.onTaskId?.(taskId);
        }

        if (directUrl && (!status || this.isSuccessStatus(status))) {
            return {
                url: directUrl,
                taskId,
                status: 'success',
                provider: this.provider,
                providerName: keySlot.name || this.provider,
                model: options.modelId
            };
        }

        if (!taskId) {
            return {
                url: directUrl || '',
                status: directUrl ? 'success' : 'processing',
                provider: this.provider,
                providerName: keySlot.name || this.provider,
                model: options.modelId
            };
        }

        const pollHeaders = this.buildHeaders(keySlot, false);
        const pollUrl = `${submitUrl}/${encodeURIComponent(taskId)}`;
        const maxDurationMs = 30 * 60 * 1000;
        const startTime = Date.now();
        let pollInterval = 3000;
        const maxInterval = 15000;

        while (Date.now() - startTime < maxDurationMs) {
            if (options.signal?.aborted) {
                throw new Error('视频生成已取消');
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
            pollInterval = Math.min(Math.round(pollInterval * 1.5), maxInterval);

            const pollResponse = await fetch(pollUrl, {
                headers: pollHeaders,
                signal: options.signal
            });

            if (!pollResponse.ok) {
                if (pollResponse.status >= 500) {
                    continue;
                }
                const errText = await pollResponse.text().catch(() => '');
                throw new Error(`视频轮询错误 ${pollResponse.status}: ${errText.slice(0, 200)}`);
            }

            const pollPayload = await pollResponse.json().catch(() => ({}));
            const pollStatus = this.extractStatus(pollPayload);
            const pollVideoUrl = this.extractVideoUrl(pollPayload);

            if (pollVideoUrl && this.isSuccessStatus(pollStatus || 'SUCCESS')) {
                return {
                    url: pollVideoUrl,
                    taskId,
                    status: 'success',
                    provider: this.provider,
                    providerName: keySlot.name || this.provider,
                    model: options.modelId
                };
            }

            if (this.isFailureStatus(pollStatus)) {
                const reason = pollPayload?.error || pollPayload?.message || pollPayload?.data?.error || JSON.stringify(pollPayload);
                throw new Error(`视频生成失败: ${reason}`);
            }
        }

        throw new Error('视频生成超时（30 分钟）');
    }
}
