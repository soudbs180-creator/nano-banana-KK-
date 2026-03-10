import { KeySlot } from '../auth/keyManager';
import { LLMAdapter, VideoGenerationOptions, VideoGenerationResult } from './LLMAdapter';

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

        if (this.isNewApiLikeGateway(cleanBase, keySlot)) {
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

    private isNewApiLikeGateway(cleanBase: string, keySlot: KeySlot): boolean {
        const fingerprint = [
            cleanBase,
            keySlot.name || '',
            String(keySlot.provider || '')
        ].join(' ').toLowerCase();

        return fingerprint.includes('newapi') ||
            fingerprint.includes('new-api') ||
            fingerprint.includes('oneapi') ||
            fingerprint.includes('one-api');
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
        const headers: Record<string, string> = {
            'Authorization': /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`
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
        const contentUrl = `${cleanBase}/videos/${encodeURIComponent(taskId)}/content`;
        const response = await fetch(contentUrl, { headers, signal });
        if (!response.ok) {
            return '';
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const payload = await response.json().catch(() => ({}));
            return this.extractVideoUrl(payload);
        }

        const blob = await response.blob();
        if (!blob.size || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
            return '';
        }

        return URL.createObjectURL(blob);
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
        const pollUrl = `${cleanBase}/videos/${encodeURIComponent(taskId)}`;
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

            const response = await fetch(pollUrl, {
                headers,
                signal: options.signal
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                if (response.status >= 500) {
                    continue;
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
