import { LLMAdapter, ChatOptions, ImageGenerationOptions } from './LLMAdapter';
import { KeySlot } from '../auth/keyManager';

export class AliyunAdapter implements LLMAdapter {
    id = 'aliyun-adapter';
    provider = 'Aliyun';

    supports(modelId: string): boolean {
        return modelId.startsWith('qwen') || modelId.startsWith('wanx');
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        // DashScope / OpenAI Compatible
        // Aliyun DashScope is OpenAI compatible at https://dashscope.aliyuncs.com/compatible-mode/v1
        const baseUrl = keySlot.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

        return this.openaiFetch(baseUrl, options, keySlot);
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<import('./LLMAdapter').ImageGenerationResult> {
        // Wanx (Tongyi Wanxiang)
        // If the user uses OpenAI compatible endpoint for Wanx, we use that.
        // DashScope has valid OpenAI image endpoint? 
        // Docs say: https://help.aliyun.com/zh/dashscope/developer-reference/openai-interface-compatibility
        // It supports /v1/images/generations for wanx-v1

        const baseUrl = keySlot.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
        const url = `${baseUrl}/images/generations`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${keySlot.key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: options.modelId, // e.g. wanx-v1
                prompt: options.prompt,
                n: options.imageCount || 1,
                size: '1024x1024' // Validate supported sizes for Wanx
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Aliyun Error: ${response.status}`);
        }

        const data = await response.json();
        const urls = data.data.map((d: any) => d.url || d.b64_json);

        return { urls };
    }

    private async openaiFetch(baseUrl: string, options: ChatOptions, keySlot: KeySlot): Promise<string> {
        const url = `${baseUrl}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${keySlot.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: options.modelId,
                messages: options.messages.map(m => ({ role: m.role, content: m.content })),
                stream: false
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Aliyun Error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }
}
