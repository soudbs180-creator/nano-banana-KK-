import {
    buildClaudeEndpoint,
    buildClaudeHeaders,
    type AuthMethod,
} from '../api/apiConfig';
import { resolveProviderRuntime } from '../api/providerStrategy';
import type {
    AudioGenerationOptions,
    AudioGenerationResult,
    ChatMessage,
    ChatOptions,
    ImageGenerationOptions,
    ImageGenerationResult,
    LLMAdapter,
    VideoGenerationOptions,
    VideoGenerationResult,
} from './LLMAdapter';
import type { KeySlot } from '../auth/keyManager';

type ClaudeContentBlock = {
    type: 'text';
    text: string;
};

type ClaudeMessagePayload = {
    role: 'user' | 'assistant';
    content: ClaudeContentBlock[];
};

function normalizeClaudeMessages(messages: ChatMessage[]): {
    system?: string;
    messages: ClaudeMessagePayload[];
} {
    const systemParts: string[] = [];
    const normalizedMessages: ClaudeMessagePayload[] = [];

    messages.forEach((message) => {
        const text = typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);
        if (!text.trim()) return;

        if (message.role === 'system') {
            systemParts.push(text);
            return;
        }

        normalizedMessages.push({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: [{ type: 'text', text }],
        });
    });

    return {
        system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
        messages: normalizedMessages.length > 0
            ? normalizedMessages
            : [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    };
}

function extractClaudeText(data: any): string {
    if (typeof data?.content === 'string') {
        return data.content;
    }

    if (Array.isArray(data?.content)) {
        return data.content
            .map((block: any) => {
                if (typeof block?.text === 'string') return block.text;
                if (typeof block === 'string') return block;
                return '';
            })
            .join('');
    }

    return '';
}

export class ClaudeNativeAdapter implements LLMAdapter {
    id = 'claude-native-adapter';
    provider = 'ClaudeNative';

    supports(modelId: string): boolean {
        return /claude/i.test(modelId) || true;
    }

    private resolveRuntime(keySlot: KeySlot) {
        return resolveProviderRuntime({
            provider: keySlot.provider,
            baseUrl: keySlot.baseUrl,
            format: 'claude',
            authMethod: keySlot.authMethod,
            headerName: keySlot.headerName,
            compatibilityMode: keySlot.compatibilityMode,
        });
    }

    private getHeaders(keySlot: KeySlot): Record<string, string> {
        const runtime = this.resolveRuntime(keySlot);
        return buildClaudeHeaders(
            runtime.authMethod as AuthMethod,
            keySlot.key,
            runtime.headerName,
            runtime.authorizationValueFormat,
        );
    }

    private getMessagesEndpoint(keySlot: KeySlot): string {
        return buildClaudeEndpoint(keySlot.baseUrl || 'https://api.anthropic.com', '/messages');
    }

    async chat(options: ChatOptions, keySlot: KeySlot): Promise<string> {
        const { system, messages } = normalizeClaudeMessages(options.messages);
        const response = await fetch(this.getMessagesEndpoint(keySlot), {
            method: 'POST',
            headers: this.getHeaders(keySlot),
            body: JSON.stringify({
                model: options.modelId,
                messages,
                system: options.systemPrompt || system,
                stream: false,
                temperature: options.temperature,
                max_tokens: options.maxTokens || 2048,
            }),
            signal: options.signal,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Claude native chat failed (${response.status}): ${errorText || response.statusText}`);
        }

        const data = await response.json();
        return extractClaudeText(data);
    }

    async chatStream(options: ChatOptions, keySlot: KeySlot): Promise<void> {
        const { system, messages } = normalizeClaudeMessages(options.messages);
        const response = await fetch(this.getMessagesEndpoint(keySlot), {
            method: 'POST',
            headers: this.getHeaders(keySlot),
            body: JSON.stringify({
                model: options.modelId,
                messages,
                system: options.systemPrompt || system,
                stream: true,
                temperature: options.temperature,
                max_tokens: options.maxTokens || 2048,
            }),
            signal: options.signal,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Claude native stream failed (${response.status}): ${errorText || response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Claude native stream has no response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop() || '';

                for (const eventChunk of events) {
                    const dataLine = eventChunk
                        .split('\n')
                        .find((line) => line.startsWith('data:'));
                    if (!dataLine) continue;

                    const raw = dataLine.slice(5).trim();
                    if (!raw || raw === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(raw);
                        const chunk = parsed?.delta?.text
                            || parsed?.content_block?.text
                            || parsed?.content?.[0]?.text
                            || (parsed?.type === 'content_block_delta' ? parsed?.delta?.text : '');
                        if (chunk) {
                            options.onStream?.(chunk);
                        }
                    } catch {
                        // Ignore malformed stream chunks.
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    async generateImage(_options: ImageGenerationOptions, _keySlot: KeySlot): Promise<ImageGenerationResult> {
        throw new Error('Claude-native protocol does not support image generation in this channel.');
    }

    async generateVideo(_options: VideoGenerationOptions, _keySlot: KeySlot): Promise<VideoGenerationResult> {
        throw new Error('Claude-native protocol does not support video generation in this channel.');
    }

    async generateAudio(_options: AudioGenerationOptions, _keySlot: KeySlot): Promise<AudioGenerationResult> {
        throw new Error('Claude-native protocol does not support audio generation in this channel.');
    }
}
