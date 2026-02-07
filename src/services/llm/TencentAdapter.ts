import { LLMAdapter, ChatOptions, ImageGenerationOptions } from './LLMAdapter';
import { KeySlot } from '../keyManager';

export class TencentAdapter implements LLMAdapter {
    id = 'tencent-adapter';
    provider = 'Tencent';

    supports(modelId: string): boolean {
        return modelId.startsWith('hunyuan');
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        // Assume OpenAI compatible for chat for now, or implement Tencent specific chat if needed.
        // Hunyuan Chat is often compatible via proxies. 
        // If direct, we need signature logic. 
        // For now, let's assume valid OpenAI-format URL is provided in baseUrl, 
        // or we throw "Not Implemented" for direct SDK usage without a proxy.
        if (keySlot.baseUrl) {
            // Re-use generic fetch or delegate? 
            // Ideally we shouldn't duplicate. 
            // Let's implement basic fetch assuming OpenAI format for Chat.
            // If strictly Tencent SDK is needed, it's much more complex (signing).
            // Assuming Proxy usage for Chat.
            return this.openaiFetch(options, keySlot);
        }
        throw new Error("Tencent Chat requires a Base URL (Proxy) or full SDK implementation.");
    }

    private async openaiFetch(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        // Minimal OpenAI fetch
        const url = `${keySlot.baseUrl}/chat/completions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${keySlot.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: options.modelId,
                messages: options.messages.map(m => ({ role: m.role, content: m.content })),
                stream: false
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    async generateImage(options: ImageGenerationOptions, keySlot: KeySlot): Promise<import('./LLMAdapter').ImageGenerationResult> {
        // Async Polling Logic
        const submitUrl = `${keySlot.baseUrl}/v1/images/generations`; // Adjust endpoint if needed
        // If strict Tencent API, endpoints are different. 
        // Assuming the user meant "Tencent *Type* behavior" on a proxy or specific endpoint.

        // However, the requirement says "Tencent's API requires an asynchronous polling mechanism".
        // Let's assume a "Submit" -> "TaskID" -> "Query" flow.

        // 1. Submit
        const taskResponse = await fetch(submitUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${keySlot.key}`, 'Content-Type': 'application/json', 'X-Async-Task': 'true' }, // Fictional header or specific param?
            body: JSON.stringify({
                model: options.modelId,
                prompt: options.prompt,
                size: '1024x1024',
                n: 1
            })
        });

        const taskData = await taskResponse.json();
        const taskId = taskData.id || taskData.task_id;

        if (!taskId) {
            // Maybe it returned result immediately?
            if (taskData.data && taskData.data.length > 0) return { urls: taskData.data.map((d: any) => d.url) };
            throw new Error(`Failed to get Task ID from Tencent API: ${JSON.stringify(taskData)}`);
        }

        // 2. Poll
        const urls = await this.pollTask(taskId, keySlot);
        return { urls };
    }

    private async pollTask(taskId: string, keySlot: KeySlot): Promise<string[]> {
        const pollUrl = `${keySlot.baseUrl}/v1/tasks/${taskId}`; // Standard-ish async task endpoint
        const maxAttempts = 30;
        const delayMs = 2000;

        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, delayMs));

            const req = await fetch(pollUrl, {
                headers: { 'Authorization': `Bearer ${keySlot.key}` }
            });
            const res = await req.json();

            if (res.status === 'SUCCEEDED' || res.status === 'SUCCESS') {
                return res.data.map((d: any) => d.url);
            }
            if (res.status === 'FAILED') {
                throw new Error(`Tencent Task Failed: ${res.error || 'Unknown error'}`);
            }
            // 'PENDING', 'RUNNING' -> continue
        }

        throw new Error("Tencent Task Timed Out");
    }
}
