import { keyManager } from './keyManager';
import { llmService } from './llm/LLMService';

export interface PromptOptimizationResult {
    optimizedEn: string;
    optimizedZh: string;
    usedModelId: string;
}

const OPTIMIZER_SYSTEM_PROMPT = `You are a professional prompt optimization engine for image generation models.
Your task is to convert a user's raw idea into a complete, highly-structured, production-grade prompt.

Rules:
1) Preserve user intent exactly. Do not change core subject, scene, or required text.
2) Infer and complete missing details (composition, lighting, style, camera, material, mood) only when absent.
3) Prioritize clarity, specificity, and model executability.
4) Output must be bilingual:
   - optimized_en: final optimized English prompt (for generation use). MUST be formatted with structural tags like [Subject]: ..., [Environment]: ..., [Lighting]: ..., [Formatting]: ... etc. Make it a single cohesive but highly structured paragraph.
   - optimized_zh: faithful structured Chinese translation of optimized_en, keeping the exact same structure (e.g. [主体]: ..., [环境]: ..., [光影]: ...).
5) If user asks for text rendering in image, keep quoted text explicit and prominent.
6) Avoid unsafe or disallowed content. If unsafe, provide a safe alternative while keeping intent as much as possible.
7) If reference images are provided, visually analyze them to accurately describe the subject, style, composition, and details in your optimized prompt.

You must return STRICT JSON only, no markdown, no extra words:
{
  "optimized_en": "...",
  "optimized_zh": "...",
  "structure": {
    "subject": "...",
    "scene": "...",
    "composition": "...",
    "style": "...",
    "lighting": "...",
    "camera": "...",
    "color_palette": "...",
    "materials_texture": "...",
    "quality_details": "...",
    "negative_constraints": "..."
  }
}`;

const pickOptimizerModel = (preferredModelId?: string): string | null => {
    const models = keyManager.getGlobalModelList();
    // 强制只选择纯粹的 chat 模型用于提示词优化，避免选择了 image 变体导致接口不兼容 (如 gemini-2.5-flash-image 无法用于直接生成文本)
    const candidates = models.filter(m => m.type === 'chat');
    if (candidates.length === 0) return null;

    if (preferredModelId) {
        const exact = candidates.find(m => m.id === preferredModelId);
        if (exact) return exact.id;

        // 如果用户选了图像模型(如 gemini-2.5-flash-image)，尝试提取其基础聊天模型(gemini-2.5-flash)
        const preferredBase = preferredModelId.split('@')[0].replace('-image', '').replace('-preview', '');
        const sameBase = candidates.find(m => m.id.split('@')[0].includes(preferredBase));
        if (sameBase) return sameBase.id;
    }

    // 默认选取列表中第一个可用的聊天模型
    const chatFirst = candidates.find(m => m.type === 'chat');
    if (chatFirst) return chatFirst.id;
    return candidates[0].id;
};

const extractJsonObject = (text: string): any => {
    const direct = text.trim();
    try {
        return JSON.parse(direct);
    } catch {
        // ignore
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        const sliced = text.slice(firstBrace, lastBrace + 1);
        return JSON.parse(sliced);
    }

    throw new Error('Optimizer returned non-JSON output');
};

export const optimizePromptForImage = async (
    rawPrompt: string,
    options?: {
        preferredModelId?: string;
        aspectRatio?: string;
        imageSize?: string;
        mode?: string;
        referenceImages?: { mimeType: string; data: string }[];
    }
): Promise<PromptOptimizationResult> => {
    const input = rawPrompt.trim();
    if (!input) throw new Error('Prompt is empty');

    const modelId = pickOptimizerModel(options?.preferredModelId);
    if (!modelId) {
        throw new Error('No chat-capable model available for prompt optimization');
    }

    const userMessage = [
        `User raw prompt:\n${input}`,
        '',
        'Optional context:',
        `- aspect_ratio: ${options?.aspectRatio || 'unknown'}`,
        `- image_size: ${options?.imageSize || 'unknown'}`,
        `- mode: ${options?.mode || 'image'}`,
        `- reference_images: ${options?.referenceImages?.length ? 'Provided via attachments' : 'None'}`
    ].join('\n');

    let rawResponse: string;

    try {
        // Attempt multimodal execution first if reference images exist
        rawResponse = await llmService.chat({
            modelId,
            messages: [
                { role: 'system', content: OPTIMIZER_SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            inlineData: options?.referenceImages,
            stream: false,
            maxTokens: 1200,
            temperature: 0.2
        });
    } catch (err: any) {
        // Fallback: If the model/adapter rejects the multimodal request,
        // retry strictly with text only.
        if (options?.referenceImages?.length) {
            console.warn(`[promptOptimizerService] Multimodal optimization failed with model ${modelId}. Retrying with text-only...`, err);

            // Rewrite user message to omit reference image claim
            const fallbackUserMessage = [
                `User raw prompt:\n${input}`,
                '',
                'Optional context:',
                `- aspect_ratio: ${options?.aspectRatio || 'unknown'}`,
                `- image_size: ${options?.imageSize || 'unknown'}`,
                `- mode: ${options?.mode || 'image'}`,
                `- reference_images: None (Fallback mode)`
            ].join('\n');

            rawResponse = await llmService.chat({
                modelId,
                messages: [
                    { role: 'system', content: OPTIMIZER_SYSTEM_PROMPT },
                    { role: 'user', content: fallbackUserMessage }
                ],
                // Explicitly omit inlineData
                stream: false,
                maxTokens: 1200,
                temperature: 0.2
            });
        } else {
            // If it failed and we didn't even send images, re-throw immediately
            throw err;
        }
    }

    const parsed = extractJsonObject(rawResponse);
    const optimizedEn = String(parsed?.optimized_en || '').trim();
    const optimizedZh = String(parsed?.optimized_zh || '').trim();

    if (!optimizedEn) {
        throw new Error('Optimizer returned empty optimized_en');
    }

    return {
        optimizedEn,
        optimizedZh: optimizedZh || input,
        usedModelId: modelId
    };
};
