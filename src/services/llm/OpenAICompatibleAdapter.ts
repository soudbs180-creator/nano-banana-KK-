import { LLMAdapter, ChatOptions, ImageGenerationOptions, ImageGenerationResult, AudioGenerationOptions, AudioGenerationResult } from './LLMAdapter';
import { KeySlot } from '../keyManager';
import { ImageSize, AspectRatio } from '../../types';

export class OpenAICompatibleAdapter implements LLMAdapter {
    id = 'openai-compatible-adapter';
    provider = 'OpenAI'; // Can be overridden or used for generic

    supports(modelId: string): boolean {
        // Supports basically everything that isn't strictly Google-only
        return true;
    }

    private getTimeoutMs(keySlot: KeySlot, fallbackMs: number = 120000): number {
        const raw = keySlot.timeout;
        if (!raw || Number.isNaN(raw)) return fallbackMs;
        return Math.max(15000, Math.min(raw, 240000));
    }

    private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...init,
                signal: controller.signal
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;

        const messages: any[] = options.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Multimodal Handling (OpenAI Vision Format)
        if (options.inlineData && options.inlineData.length > 0) {
            const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
            if (lastUserIdx >= 0) {
                const textContent = messages[lastUserIdx].content;
                const contentParts: any[] = [{ type: 'text', text: textContent }];

                options.inlineData.forEach(media => {
                    contentParts.push({
                        type: 'image_url',
                        image_url: { url: `data:${media.mimeType};base64,${media.data}` }
                    });
                });
                messages[lastUserIdx].content = contentParts;
            }
        }

        if (options.systemPrompt) {
            messages.unshift({ role: 'system', content: options.systemPrompt });
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };

        // Custom Header Support
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        const body: any = {
            model: options.modelId,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens || 20480, // [12AI Alignment] Default to 20k for better reasoning
            stream: false
        };

        // 🚀 [12AI 对齐] 多字段 Token 兼容性支持
        if (body.max_tokens) {
            body.maxtokens = body.max_tokens;
            body.maxOutputTokens = body.max_tokens;
        }

        // 🚀 Provider Config (Merge into top level or extra_body?)
        if (options.providerConfig?.openai) {
            // Merge openai specific config if applicable
        }

        // Extended Params (Extra Body)
        if (options.extraBody) {
            Object.assign(body, options.extraBody);
        }

        // 🚀 [12AI 对齐] 负载体积检查
        const payloadStr = JSON.stringify(body);
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Chat 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: payloadStr,
            signal: options.signal
        });

        if (!response.ok) {
            const text = await response.text();
            let errMsg = `HTTP ${response.status}`;
            try {
                const err = JSON.parse(text);
                errMsg = err.error?.message || errMsg;
            } catch (e) {
                errMsg = text.substring(0, 200);
            }
            throw new Error(errMsg);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    async chatStream(options: ChatOptions, keySlot: KeySlot): Promise<void> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;

        const messages: any[] = options.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        if (options.inlineData && options.inlineData.length > 0) {
            const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
            if (lastUserIdx >= 0) {
                const textContent = messages[lastUserIdx].content;
                const contentParts: any[] = [{ type: 'text', text: textContent }];
                options.inlineData.forEach(media => {
                    contentParts.push({
                        type: 'image_url',
                        image_url: { url: `data:${media.mimeType};base64,${media.data}` }
                    });
                });
                messages[lastUserIdx].content = contentParts;
            }
        }

        if (options.systemPrompt) {
            messages.unshift({ role: 'system', content: options.systemPrompt });
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };

        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        const body: any = {
            model: options.modelId,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens || 20480,
            stream: true
        };

        if (body.max_tokens) {
            body.maxtokens = body.max_tokens;
            body.maxOutputTokens = body.max_tokens;
        }

        if (options.extraBody) {
            Object.assign(body, options.extraBody);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: options.signal
        });

        if (!response.ok || !response.body) {
            const text = await response.text().catch(() => '');
            throw new Error(text || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || !line.startsWith('data:')) continue;

                const payload = line.slice(5).trim();
                if (payload === '[DONE]') return;

                try {
                    const json = JSON.parse(payload);
                    const chunk = json.choices?.[0]?.delta?.content;
                    if (chunk) {
                        options.onStream?.(chunk);
                    }
                } catch {
                    // ignore malformed stream chunks
                }
            }
        }
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<ImageGenerationResult> {
        const modelLower = options.modelId.toLowerCase();
        const baseUrl = (keySlot.baseUrl || '').toLowerCase();

        // 🚀 [Protocol Routing] 三级判断逻辑：
        // 1. KeySlot 显式配置 (compatibilityMode)
        // 2. BaseURL 特征检测 (Antigravity/反代 等已知 Gemini/GPT-Best 协议代理)
        // 3. 模型名称启发式推断 (包含 gemini + image 的模型)

        // 级别1: 显式配置 — 用户或系统已明确设置API格式
        if (keySlot.compatibilityMode === 'chat') {
            console.log(`[OpenAICompatibleAdapter] 使用 Chat API (显式 compatibilityMode='chat') -> ${keySlot.name}`);
            return this.generateImageViaChat(options, keySlot);
        }

        // 级别2: BaseURL特征检测
        const isAntigravity = baseUrl.includes('127.0.0.1:8045') || baseUrl.includes('antigravity');
        const isOfficialOpenAI = baseUrl.includes('api.openai.com');
        const isSiliconFlow = baseUrl.includes('siliconflow');
        // 🚀 [NEW] 检测 gpt-best 代理商
        const isGptBest = baseUrl.includes('gpt-best') || baseUrl.includes('gptbest');

        if (isAntigravity) {
            // Antigravity 支持 OpenAI Images API（推荐方式一）和 Chat API
            if (modelLower.includes('gemini') && modelLower.includes('image')) {
                console.log(`[OpenAICompatibleAdapter] 使用 Chat API (Antigravity + Gemini模型) -> ${keySlot.name}`);
                return this.generateImageViaChat(options, keySlot);
            }
            console.log(`[OpenAICompatibleAdapter] 使用 GPT_Best_Extended API (Antigravity) -> ${keySlot.name}`);
            return this.generateImageStandard_GPT_Best_Extended(options, keySlot);
        }

        if (isOfficialOpenAI) {
            console.log(`[OpenAICompatibleAdapter] 使用 OpenAI_Strict API -> ${keySlot.name}`);
            return this.generateImageStandard_OpenAI_Strict(options, keySlot);
        }

        if (isSiliconFlow) {
            console.log(`[OpenAICompatibleAdapter] 使用 SiliconFlow API -> ${keySlot.name}`);
            return this.generateImageStandard_SiliconFlow(options, keySlot);
        }

        // 🚀 [NEW] gpt-best 代理商专用路径
        if (isGptBest) {
            console.log(`[OpenAICompatibleAdapter] 使用 GPT_Best_Native API -> ${keySlot.name}`);
            return this.generateImageStandard_GPT_Best_Native(options, keySlot);
        }

        // 级别3: 模型名称启发式推断
        if ((modelLower.includes('gemini') && modelLower.includes('image')) || options.providerConfig?.openai?.useChatEndpoint) {
            console.log(`[OpenAICompatibleAdapter] 使用 Chat API (模型名称推断) -> ${keySlot.name}`);
            return this.generateImageViaChat(options, keySlot);
        }

        // 默认: 使用兼容度最高的被动模式 (Extended)
        console.log(`[OpenAICompatibleAdapter] 使用 GPT_Best_Extended API (默认后备) -> ${keySlot.name}`);
        return this.generateImageStandard_GPT_Best_Extended(options, keySlot);
    }

    private async generateImageViaChat(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/chat/completions`;

        // 🚀 [Critical Fix] 4K & Real Pixel Mapping
        // Detect target resolution based on imageSize modifier
        const is4K = options.imageSize?.toUpperCase().includes('4K');
        const is2K = options.imageSize?.toUpperCase().includes('2K');

        // Base dimensions (1K)
        let dim = 1024;
        if (is4K) dim = 4096;
        else if (is2K) dim = 2048;

        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let sizeString = '1024x1024';
        if (ratio > 1) sizeString = `${dim}x${Math.round(dim / ratio)}`;
        else if (ratio < 1) sizeString = `${Math.round(dim * ratio)}x${dim}`;
        else sizeString = `${dim}x${dim}`;

        console.log(`[OpenAICompatibleAdapter] Mapped Chat Image Size: ${options.imageSize} -> ${sizeString}`);

        // 🚀 [Critical Fix] Multimodal Reference Image Support
        // Convert reference images to OpenAI Vision format
        const contentParts: any[] = [{ type: 'text', text: options.prompt }];

        if (options.referenceImages?.length) {
            options.referenceImages.forEach(imageData => {
                // Ensure proper Data URI format
                const hasPrefix = imageData.startsWith('data:');
                const dataUrl = hasPrefix ? imageData : `data:image/jpeg;base64,${imageData}`;
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: dataUrl }
                });
            });
            console.log(`[OpenAICompatibleAdapter] Injected ${options.referenceImages.length} reference images into chat completion`);
        }

        // 🚀 Generate Antigravity Native Params
        let nativeQuality = 'standard';
        let nativeImageSizeStr = '1024x1024';
        if (is4K) { nativeQuality = 'hd'; nativeImageSizeStr = '3840x2160'; }
        else if (is2K) { nativeQuality = 'medium'; nativeImageSizeStr = '2560x1440'; }

        const body: any = {
            model: options.modelId,
            messages: [{
                role: 'user',
                content: contentParts
            }],
            // 🚀 [Universal] 全参数传递 — 兼容所有 Gemini 协议代理
            size: sizeString,             // "4096x4096" — 像素尺寸
            quality: nativeQuality,        // "hd" / "medium" / "standard"
            imageSize: is4K ? '4K' : (is2K ? '2K' : '1K'),  // 🚀 Antigravity 最高优先级参数
            aspect_ratio: options.aspectRatio || '1:1',       // 宽高比
            max_tokens: 65535,
            maxtokens: 65535,
            maxOutputTokens: 65535,
            stream: false
        };

        console.log(`[OpenAICompatibleAdapter] Chat Image Request -> ${keySlot.name}: size=${sizeString}, quality=${nativeQuality}, imageSize=${body.imageSize}, aspectRatio=${options.aspectRatio || '1:1'}`);

        // 🚀 [12AI 对齐] 为 Gemini 协议代理设置安全钳位
        if (body.maxOutputTokens > 65535) body.maxOutputTokens = 65535;
        if (body.maxtokens > 65535) body.maxtokens = 65535;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        // 🚀 [12AI 对齐] 负载体积检查
        const payloadStr = JSON.stringify(body);
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Chat-Image 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body: payloadStr
        }, this.getTimeoutMs(keySlot, 150000));

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Chat-to-Image Error (${response.status}): ${text.substring(0, 200)}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        // 🚀 Improved Regex with Mime Capture (and newline cleanup)
        const detailedMatch = content.match(/!\[.*?\]\(data:(image\/[^;]+);base64,([^)]+)\)/);
        if (detailedMatch && detailedMatch[2]) {
            const cleanBase64 = detailedMatch[2].replace(/\s+/g, ''); // Fix corrupted base64 with newlines
            console.log(`[OpenAICompatibleAdapter] Extracted Base64 Image (Length: ${cleanBase64.length})`);
            return {
                urls: [`data:${detailedMatch[1]};base64,${cleanBase64}`],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString
            };
        }

        // 🚀 Support standard Markdown URLs (http/https)
        const urlMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
        if (urlMatch && urlMatch[1]) {
            console.log(`[OpenAICompatibleAdapter] Extracted HTTP Markdown URL: ${urlMatch[1]}`);
            return {
                urls: [urlMatch[1]],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString
            };
        }

        // 🚀 Support Raw HTTP URLs (if markdown is missing or broken)
        const rawUrlMatch = content.match(/(https?:\/\/[^\s]+)/);
        if (rawUrlMatch && rawUrlMatch[1]) {
            console.log(`[OpenAICompatibleAdapter] Extracted Raw HTTP URL: ${rawUrlMatch[1]}`);
            return {
                urls: [rawUrlMatch[1]],
                provider: 'OpenAI-Chat',
                model: options.modelId,
                imageSize: sizeString
            };
        }

        // Fallback: If no markdown image found, maybe it's raw base64 or a URL?
        // But 12AI/Gemini Proxies typically return Markdown
        throw new Error('Failed to extract image from chat response. Content starts with: ' + content.substring(0, 50));
    }

    // ============================================================================
    // 严格模式 (Official OpenAI) - 不带任何额外多余参数，避免 400 Bad Request
    // ============================================================================
    private async generateImageStandard_OpenAI_Strict(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        // 质量与尺寸推断
        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';

        let sizeString = '1024x1024';
        if (options.aspectRatio === '16:9') sizeString = '1792x1024';
        else if (options.aspectRatio === '9:16') sizeString = '1024x1792';

        // Configuration Overrides
        let quality = is4K || is2K ? 'hd' : 'standard';
        let style: string | undefined;
        if (options.providerConfig?.openai) {
            if (options.providerConfig.openai.size) sizeString = options.providerConfig.openai.size;
            if (options.providerConfig.openai.quality) quality = options.providerConfig.openai.quality;
            if (options.providerConfig.openai.style) style = options.providerConfig.openai.style;
        }

        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            size: sizeString,
            quality: quality,
            response_format: 'b64_json'
        };

        if (style) body.style = style;

        // 官方 DALL-E 编辑功能支持（需专用 endpoint / edits 或特殊方式，先按通用传入 mask 与 image）
        if (options.editMode && options.referenceImages?.length) {
            console.warn(`[OpenAICompatibleAdapter] 官方 OpenAI 编辑端点待完整对接支持。当前先尝试基础注入。`);
            body.image = options.referenceImages[0].startsWith('http') ? options.referenceImages[0] : `data:image/png;base64,${options.referenceImages[0]}`;
            if (options.editMode === 'inpaint' && options.maskUrl) {
                body.mask = options.maskUrl.startsWith('http') ? options.maskUrl : `data:image/png;base64,${options.maskUrl}`;
            }
        }

        console.log(`[OpenAICompatibleAdapter] OpenAI_Strict -> size=${body.size}, quality=${body.quality}`);

        return this.executeImageRequest(url, body, keySlot, options);
    }

    // ============================================================================
    // 特殊模式 (SiliconFlow) - 需要专用的 image_size 字段
    // ============================================================================
    private async generateImageStandard_SiliconFlow(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || '').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        // 计算物理像素
        let baseDim = 1024;
        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';
        if (is4K) baseDim = 4096; else if (is2K) baseDim = 2048;

        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let sizeStr = `${baseDim}x${baseDim}`;
        if (ratio > 1) sizeStr = `${baseDim}x${Math.round(baseDim / ratio)}`;
        else if (ratio < 1) sizeStr = `${Math.round(baseDim * ratio)}x${baseDim}`;

        const body: any = {
            model: options.modelId,
            prompt: options.prompt,
            n: options.imageCount || 1,
            image_size: sizeStr, // SiliconFlow 特有字段
            response_format: 'b64_json'
        };

        if (options.referenceImages && options.referenceImages.length > 0) {
            body.image = options.referenceImages.map(img => img.startsWith('http') ? img : `data:image/png;base64,${img}`);
        }

        console.log(`[OpenAICompatibleAdapter] SiliconFlow -> image_size=${body.image_size}`);
        return this.executeImageRequest(url, body, keySlot, options);
    }

    // ============================================================================
    // 兼容扩展模式 (GPT-Best / Antigravity / Flux / MJ) 
    // 支持多类别的辅助加强参数，比如 imageSize 4K 等。
    // ============================================================================
    private async generateImageStandard_GPT_Best_Extended(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || '').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';

        // 🚀 [关键修复] 模型 ID 分辨率后缀自动映射
        // 部分代理商 (如 gpt-best) 将不同分辨率拆成独立的模型 ID：
        //   nano-banana-2 (1K) → nano-banana-2-2k (2K) → nano-banana-2-4k (4K)
        //   gemini-3-pro-image-preview -> gemini-3-pro-image-preview-4k
        // 适应此代理商广泛使用的分辨率命名规则
        let effectiveModelId = options.modelId;
        if (is4K || is2K) {
            const modelLower = effectiveModelId.toLowerCase();

            // 如果模型自带高分辨率标记，说明用户手动选了高分模型，不加后缀
            const hasExistingResSuffix = /(?:-4k|-2k|-1k|-hd)$/i.test(modelLower);

            // 某些特殊的模型可能不支持加后缀，可以在此排除
            const excludedModels = ['dall-e-3', 'dall-e-2', 'flux-1', 'midjourney'];
            const shouldExclude = excludedModels.some(exclude => modelLower.includes(exclude));

            if (!hasExistingResSuffix && !shouldExclude) {
                const suffix = is4K ? '-4k' : '-2k';
                effectiveModelId = effectiveModelId + suffix;
                console.log(`[OpenAICompatibleAdapter] 高分模型映射: ${options.modelId} → ${effectiveModelId}`);
            }
        }

        let baseDim = 1024;
        if (is4K) baseDim = 4096; else if (is2K) baseDim = 2048;

        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let sizeStr = `${baseDim}x${baseDim}`;
        if (ratio > 1) sizeStr = `${baseDim}x${Math.round(baseDim / ratio)}`;
        else if (ratio < 1) sizeStr = `${Math.round(baseDim * ratio)}x${baseDim}`;

        let parsedWidth = baseDim;
        let parsedHeight = baseDim;
        const sizeMatch = sizeStr.match(/^(\d+)x(\d+)$/);
        if (sizeMatch) {
            parsedWidth = parseInt(sizeMatch[1], 10);
            parsedHeight = parseInt(sizeMatch[2], 10);
        }

        // 🚀 关键修复: 在提示词中嵌入尺寸提示
        // 部分第三方代理忽略 size/imageSize/aspect_ratio 等参数
        // 嵌入提示词可以让模型本身理解目标分辨率
        const aspectRatioStr = options.aspectRatio || '1:1';
        let enhancedPrompt = options.prompt;
        if (is4K || is2K || aspectRatioStr !== '1:1') {
            enhancedPrompt = `[${sizeStr}, ${aspectRatioStr}] ${options.prompt}`;
        }

        const body: any = {
            model: effectiveModelId,
            prompt: enhancedPrompt,
            n: options.imageCount || 1,
            size: sizeStr,
            quality: is4K ? 'hd' : (is2K ? 'medium' : 'standard'),
            imageSize: is4K ? '4K' : (is2K ? '2K' : '1K'), // Antigravity 最高级别指令
            aspect_ratio: aspectRatioStr,
            width: parsedWidth,
            height: parsedHeight,
            response_format: 'b64_json'
        };

        // 处理编辑和参考图
        if (options.editMode) {
            body.editMode = options.editMode;
            if (options.editMode === 'inpaint' && options.maskUrl) {
                body.mask = options.maskUrl.startsWith('http') ? options.maskUrl : `data:image/png;base64,${options.maskUrl}`;
            }
        }

        if (options.referenceImages && options.referenceImages.length > 0) {
            const isFluxKontext = options.modelId.toLowerCase().includes('flux-kontext');
            const isDoubao = options.modelId.toLowerCase().includes('doubao');

            if (isFluxKontext) {
                const imgLinks = options.referenceImages.map(img => img.startsWith('http') ? img : `data:image/png;base64,${img}`).join(' ');
                body.prompt = `${body.prompt} ${imgLinks}`;
                body.image = options.referenceImages.map(img => img.startsWith('http') ? img : `data:image/png;base64,${img}`);
            } else if (isDoubao && options.editMode === 'inpaint') {
                body.image = options.referenceImages[0].startsWith('http') ? options.referenceImages[0] : `data:image/png;base64,${options.referenceImages[0]}`;
            } else {
                // OpenAI Images API format typically uses 'image' or 'images' array for reference
                // Antigravity translates this automatically.
                body.image = options.referenceImages.map(img => img.startsWith('http') ? img : `data:image/png;base64,${img}`);

                // Fallback for some proxies that expect reference images inside the prompt or messages array even for standard Image endpoints
                // if they strictly use Chat completions under the hood. (Antigravity supports 'image' array).
            }
        }

        console.log(`[OpenAICompatibleAdapter] GPT_Best_Extended -> size=${body.size}, imageSize=${body.imageSize}, quality=${body.quality}`);
        return this.executeImageRequest(url, body, keySlot, options);
    }

    // ============================================================================
    // 🚀 [NEW] gpt-best 代理商专用模式 — 标准 DALL-E 参数 + 提示词内嵌尺寸
    // 该代理只识别标准参数 (model, prompt, n, size, response_format)
    // 额外参数 (imageSize, aspect_ratio, width, height) 会被静默忽略
    // 所以在提示词开头嵌入尺寸和宽高比提示，让模型本身理解目标分辨率
    // ============================================================================
    private async generateImageStandard_GPT_Best_Native(
        options: ImageGenerationOptions,
        keySlot: KeySlot
    ): Promise<ImageGenerationResult> {
        const baseUrl = (keySlot.baseUrl || '').replace(/\/+$/, '');
        const cleanBase = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        const url = `${cleanBase}/images/generations`;

        const is4K = options.imageSize === '4K' || options.imageSize === 'SIZE_4K';
        const is2K = options.imageSize === '2K' || options.imageSize === 'SIZE_2K';

        // 🚀 [关键修复] 模型 ID 分辨率后缀自动映射
        let effectiveModelId = options.modelId;
        if (is4K || is2K) {
            const modelLower = effectiveModelId.toLowerCase();
            const hasExistingResSuffix = /(?:-4k|-2k|-1k|-hd)$/i.test(modelLower);
            const excludedModels = ['dall-e-3', 'dall-e-2', 'flux-1', 'midjourney'];
            const shouldExclude = excludedModels.some(exclude => modelLower.includes(exclude));

            if (!hasExistingResSuffix && !shouldExclude) {
                const suffix = is4K ? '-4k' : '-2k';
                effectiveModelId = effectiveModelId + suffix;
                console.log(`[OpenAICompatibleAdapter] 高分模型映射(Native): ${options.modelId} → ${effectiveModelId}`);
            }
        }

        // 计算基准尺寸
        let baseDim = 1024;
        if (is4K) baseDim = 4096;
        else if (is2K) baseDim = 2048;

        // 根据宽高比计算实际像素尺寸
        const parts = (options.aspectRatio || '1:1').split(':');
        const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);

        let w = baseDim;
        let h = baseDim;
        if (ratio > 1) {
            w = baseDim;
            h = Math.round(baseDim / ratio);
        } else if (ratio < 1) {
            w = Math.round(baseDim * ratio);
            h = baseDim;
        }

        const sizeStr = `${w}x${h}`;

        // 🚀 关键修复: 在提示词开头嵌入尺寸提示
        // 部分代理/模型不识别 size 参数，但会解析提示词中的尺寸指令
        const aspectRatioStr = options.aspectRatio || '1:1';
        let promptPrefix = '';
        // 只在非默认设置时添加前缀，避免干扰提示词
        if (is4K || is2K || aspectRatioStr !== '1:1') {
            promptPrefix = `[${sizeStr}, ${aspectRatioStr}] `;
        }

        const body: any = {
            model: effectiveModelId,
            prompt: promptPrefix + options.prompt,
            n: options.imageCount || 1,
            size: sizeStr,
            response_format: 'b64_json'
        };

        // 处理参考图（部分 gpt-best 模型支持 image 参数）
        if (options.referenceImages && options.referenceImages.length > 0) {
            body.image = options.referenceImages.map(img =>
                img.startsWith('http') ? img : `data:image/png;base64,${img}`
            );
        }

        // 🚀 处理局部重绘 (Inpaint) - 将蒙版作为 mask 字段发送
        if (options.editMode) {
            body.editMode = options.editMode;
            if (options.editMode === 'inpaint' && options.maskUrl) {
                body.mask = options.maskUrl.startsWith('http') ? options.maskUrl : `data:image/png;base64,${options.maskUrl}`;
            }
        }

        console.log(`[OpenAICompatibleAdapter] GPT_Best_Native -> size=${body.size}, prompt_prefix="${promptPrefix.trim()}", model=${options.modelId}`);
        return this.executeImageRequest(url, body, keySlot, options);
    }

    // ============================================================================
    // 通用 Request 执行包装
    // ============================================================================
    private async executeImageRequest(url: string, body: any, keySlot: KeySlot, options: ImageGenerationOptions): Promise<ImageGenerationResult> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${keySlot.key}`
        };
        if (keySlot.headerName && keySlot.headerName !== 'Authorization') {
            headers[keySlot.headerName] = keySlot.key;
        }

        const payloadStr = JSON.stringify(body);
        if (payloadStr.length > 48 * 1024 * 1024) {
            console.error(`[OpenAICompatibleAdapter] Image 请求体积 (${(payloadStr.length / 1024 / 1024).toFixed(2)}MB) 接近 50MB 上限!`);
        }

        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers,
            body: payloadStr
        }, this.getTimeoutMs(keySlot, 150000));

        if (!response.ok) {
            const raw = await response.text().catch(() => '');
            let detail = `OpenAI Image Error: ${response.status}`;
            try {
                const err = JSON.parse(raw || '{}');
                detail = err.error?.message || err.message || detail;
            } catch {
                if (raw) detail = raw.slice(0, 500);
            }
            throw new Error(`[${response.status}] ${detail}`);
        }

        const data = await response.json();

        // 🚀 [诊断] 打印代理返回的原始数据结构
        if (data.data && data.data.length > 0) {
            const firstItem = data.data[0];
            const responseKeys = Object.keys(firstItem);
            const hasB64 = !!firstItem.b64_json;
            const hasUrl = !!firstItem.url;
            console.log(`[OpenAICompatibleAdapter] 响应数据字段: [${responseKeys.join(', ')}], b64=${hasB64}, url=${hasUrl}${hasUrl ? `, url_preview=${firstItem.url?.substring(0, 80)}...` : ''}`);

            // 🚀 [DEBUG DUMP] Save raw response to localStorage so the browser subagent can easily read it
            try {
                window.localStorage.setItem('DEBUG_LAST_PROXY_RESPONSE', JSON.stringify(data));
                fetch('http://localhost:3001', { method: 'POST', body: JSON.stringify(data) }).catch(e => console.error(e));
            } catch (e) { }
        }

        const urls = data.data.map((d: any) => {
            // 优先使用 b64_json（完整原图数据）
            if (d.b64_json) {
                return `data:image/png;base64,${d.b64_json}`;
            }
            // 部分代理会同时返回缩略图 url 和原图 url（字段名可能不同）
            // 按优先级尝试多种字段
            const fullUrl = d.hd_url || d.original_url || d.full_url || d.url;
            if (fullUrl) {
                console.log(`[OpenAICompatibleAdapter] 使用远程图片URL (非base64): ${fullUrl.substring(0, 100)}`);
                return fullUrl;
            }
            return d.url || '';
        });

        return {
            urls,
            provider: 'OpenAI',
            providerName: keySlot.name,
            model: options.modelId,
            imageSize: body.size || body.image_size || 'Unknown'
        };
    }
}
