import { keyManager } from '../auth/keyManager';
import { llmService } from './LLMService';
import { PromptOptimizerResult } from '../../types';

export interface PromptOptimizationResult {
    optimizedEn: string;
    optimizedZh: string;
    usedModelId: string;
    fullResult?: PromptOptimizerResult; // 🚀 [New] 包含完整编译器结果
}

type OptimizerCacheEntry = {
    result: PromptOptimizationResult;
    createdAt: number;
};

const OPTIMIZER_CACHE_KEY = 'kk_prompt_optimizer_cache_v2'; // 🚀 Version update for schema change
const OPTIMIZER_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const readOptimizerCache = (): Record<string, OptimizerCacheEntry> => {
    try {
        const raw = localStorage.getItem(OPTIMIZER_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const writeOptimizerCache = (cache: Record<string, OptimizerCacheEntry>) => {
    try {
        localStorage.setItem(OPTIMIZER_CACHE_KEY, JSON.stringify(cache));
    } catch { }
};

const buildOptimizerCacheKey = (
    input: string,
    options?: {
        preferredModelId?: string;
        aspectRatio?: string;
        imageSize?: string;
        mode?: string;
        referenceImages?: { mimeType: string; data: string }[];
    }
) => {
    const model = (options?.preferredModelId || '').toLowerCase();
    const ratio = (options?.aspectRatio || '').toLowerCase();
    const size = (options?.imageSize || '').toLowerCase();
    const mode = (options?.mode || '').toLowerCase();
    const refSign = (options?.referenceImages || [])
        .map(ref => `${(ref.mimeType || '').toLowerCase()}:${(ref.data || '').slice(0, 32)}`)
        .join('|');
    return `${model}::${ratio}::${size}::${mode}::${input.trim()}::${refSign}`;
};

/**
 * 🚀 [PRD] 提示词编译器系统指令
 * 采用严格的 JSON 输出协议，包含解析、扩写、任务模板与 UI 载荷。
 */
const OPTIMIZER_SYSTEM_PROMPT = `You are the "Prompt Compiler v1", a specialized engine that transforms short, vague user ideas into professional, high-fidelity visual prompts for Nano Banana 2 (Imagen 4).

### MISSION:
Analyze user input -> Recognize task type -> Expand using visual vocabulary -> Render structured JSON.

### TASK TYPES & TEMPLATES (Automatic Recognition):
1. **icon_set**: For "icons", "stickers", "buttons". 
   - Focus: Consistency, white/transparent background, clean vector lines, 3D clay or flat style, uniform margins.
2. **ecommerce_hero**: For "main image", "amazon", "product photo", "KV". 
   - Focus: Commercial lighting (softbox, rim), premium materials (brushed metal, frosted glass), minimalist environment, realistic shadows.
3. **lifestyle_photo**: For "person", "outdoor", "street scene", "travel". 
   - Focus: Cinematic lens (85mm f/1.8), natural lighting (golden hour), authentic textures, candid atmosphere.
4. **infographic / layout**: For "poster", "UI", "slide", "dashboard". 
   - Focus: Grid-based alignment, hierarchy, negative space, modern typography (if requested), clean color palette.

### VAGUE-TO-CONCRETE DICTIONARY:
- "高级" -> "premium minimal aesthetic, clean reflections, commercial-grade, high-end material finish"
- "真实" -> "photorealistic, accurate geometry, natural shadows, 8k resolution textures"
- "简洁" -> "minimal, uncluttered, strong focal point, balanced negative space"

### CONSTRAINTS:
- OUTPUT MUST BE STRICT JSON. No conversational filler or reasoning.
- optimized_prompt_en: Professional, structured, NO Chinese. NO "thinking" words.
- optimized_prompt_zh_display: User-friendly Chinese explanation.
- Default to "opt" tab in ui_payload.

### JSON SCHEMA:
{
  "raw_prompt_original": "User's input",
  "optimized_prompt_en": "Professional English prompt",
  "optimized_prompt_zh_display": "Friendly Chinese explanation",
  "assumptions": ["List of default assumptions used to fill gaps"],
  "params": {
    "task_type": "icon_set | ecommerce_hero | lifestyle_photo | infographic | logo | ui | other",
    "subject": "Core subject",
    "style": "Visual style description",
    "lighting": "Lighting setup",
    "background": "Background description",
    "aspect_ratio": "1:1 | 16:9 | 9:16 | 4:5 | etc"
  },
  "ui_payload": {
    "tabs": [
      {"id": "raw", "label_zh": "未优化", "label_en": "Raw"},
      {"id": "opt", "label_zh": "已优化", "label_en": "Optimized"}
    ],
    "default_tab": "opt"
  },
  "meta": { "version": "prompt-compiler-v1", "timestamp": "current-iso" }
}`;

const buildNativeStructuredPrompt = (
    input: string,
    options?: { aspectRatio?: string; mode?: string; }
): PromptOptimizerResult => {
    const ratio = options?.aspectRatio || '1:1';
    const lowerInput = input.toLowerCase();

    let task_type: any = 'other';
    let en = input;
    let zh = `基于您的输入“${input}”，已应用通用高质量优化库。`;

    if (lowerInput.includes('icon') || lowerInput.includes('图标') || lowerInput.includes('sticker')) {
        task_type = 'icon_set';
        en = `A set of professional ${input}, high-quality 3D render, minimalist clay style, pure white background, soft ambient occlusion, high-contrast, commercial design.`;
        zh = `已按图标集（Icon Set）规范重构，采用 3D 黏土风格，确保背景纯净与视觉统一。`;
    } else if (lowerInput.includes('主图') || lowerInput.includes('产品') || lowerInput.includes('ecommerce')) {
        task_type = 'ecommerce_hero';
        en = `Professional product photography of ${input}, ultra-detailed, commercial studio lighting, soft rim light, minimalist high-end background, photorealistic textures, 8k resolution.`;
        zh = `已按电商主图（Ecommerce Hero）规范重构，注入棚拍级光影与高级材质细节。`;
    }

    return {
        raw_prompt_original: input,
        optimized_prompt_en: en,
        optimized_prompt_zh_display: zh,
        params: {
            task_type,
            subject: input,
            aspect_ratio: ratio
        },
        ui_payload: {
            tabs: [
                { id: 'raw', label_zh: '未优化', label_en: 'Raw' },
                { id: 'opt', label_zh: '已优化', label_en: 'Optimized' }
            ],
            default_tab: 'opt'
        },
        meta: {
            version: 'prompt-compiler-fallback-v1',
            timestamp: new Date().toISOString()
        }
    };
};

const pickOptimizerModel = (preferredModelId?: string): string | null => {
    const models = keyManager.getGlobalModelList();
    const candidates = models.filter(m => m.type === 'chat');
    if (candidates.length === 0) return null;

    if (preferredModelId) {
        // 1. Exact match if the preferred model IS a chat model
        const exact = candidates.find(m => m.id === preferredModelId);
        if (exact) return exact.id;

        const parts = preferredModelId.split('@');
        const preferredBase = parts[0].replace('-image', '').replace('-preview', '');
        const suffix = parts.length > 1 ? parts[1] : null;

        // 2. Look for any chat model pointing to the same custom provider (same suffix)
        if (suffix) {
            // Priority: A model with same base AND same suffix
            const sameBaseAndSuffix = candidates.find(m => m.id.split('@')[0].includes(preferredBase) && m.id.split('@')[1] === suffix);
            if (sameBaseAndSuffix) return sameBaseAndSuffix.id;

            // Priority: ANY chat model with the same suffix (i.e. same custom API)
            const sameSuffix = candidates.find(m => m.id.endsWith(`@${suffix}`));
            if (sameSuffix) {
                // Ideally pick a lightweight/cheap model like flash/mini if available
                const lightweight = candidates.find(m => m.id.endsWith(`@${suffix}`) && (m.id.includes('flash') || m.id.includes('mini') || m.id.includes('haiku')));
                return lightweight ? lightweight.id : sameSuffix.id;
            }
        } else {
            // 3. Look for models with the same base (No suffix case)
            const sameBase = candidates.find(m => m.id.split('@')[0].includes(preferredBase) && !m.id.includes('@'));
            if (sameBase) return sameBase.id;
        }
    }

    // Fallback: system chat model (will consume points if it's a system proxy model)
    const chatFirst = candidates.find(m => m.id.toLowerCase().includes('gemini-2.5-flash'));
    return chatFirst ? chatFirst.id : candidates[0].id;
};

const extractJsonObject = (text: string): any => {
    try {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(text.slice(firstBrace, lastBrace + 1));
        }
        return JSON.parse(text);
    } catch {
        throw new Error('Optimizer returned non-JSON output');
    }
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

    const cacheKey = buildOptimizerCacheKey(input, options);
    const cache = readOptimizerCache();
    if (cache[cacheKey] && (Date.now() - cache[cacheKey].createdAt) < OPTIMIZER_CACHE_TTL_MS) {
        return cache[cacheKey].result;
    }

    const modelId = pickOptimizerModel(options?.preferredModelId);
    if (!modelId) throw new Error('No chat model available');

    const executeWithRetry = async (useImages: boolean): Promise<any> => {
        const userMessage = [
            `User raw prompt: "${input}"`,
            `Context: { ratio: "${options?.aspectRatio || '1:1'}", mode: "${options?.mode || 'image'}" }`
        ].join('\n');

        const raw = await llmService.chat({
            modelId,
            messages: [
                { role: 'system', content: OPTIMIZER_SYSTEM_PROMPT },
                { role: 'user', content: userMessage }
            ],
            inlineData: useImages ? options?.referenceImages : undefined,
            stream: false,
            maxTokens: 1500,
            temperature: 0.1
        });
        return extractJsonObject(raw);
    };

    try {
        let parsed: any;
        try {
            parsed = await executeWithRetry(!!options?.referenceImages?.length);
        } catch (e) {
            if (options?.referenceImages?.length) {
                console.warn('[Optimizer] Multimodal failed, retrying text-only');
                parsed = await executeWithRetry(false);
            } else throw e;
        }

        const fullResult: PromptOptimizerResult = {
            raw_prompt_original: input,
            optimized_prompt_en: String(parsed.optimized_prompt_en || input),
            optimized_prompt_zh_display: String(parsed.optimized_prompt_zh_display || '已优化'),
            params: parsed.params || { task_type: 'other', subject: input },
            assumptions: parsed.assumptions || [],
            ui_payload: parsed.ui_payload || {
                tabs: [{ id: 'raw', label_zh: '未优化', label_en: 'Raw' }, { id: 'opt', label_zh: '已优化', label_en: 'Optimized' }],
                default_tab: 'opt'
            },
            meta: parsed.meta || { version: 'compiler-v1', timestamp: new Date().toISOString() }
        };

        const result: PromptOptimizationResult = {
            optimizedEn: fullResult.optimized_prompt_en,
            optimizedZh: fullResult.optimized_prompt_zh_display,
            usedModelId: modelId,
            fullResult
        };

        cache[cacheKey] = { result, createdAt: Date.now() };
        writeOptimizerCache(cache);
        return result;

    } catch (err) {
        console.warn('[Optimizer] Failed, using fallback', err);
        const fallback = buildNativeStructuredPrompt(input, { aspectRatio: options?.aspectRatio, mode: options?.mode });
        return {
            optimizedEn: fallback.optimized_prompt_en,
            optimizedZh: fallback.optimized_prompt_zh_display,
            usedModelId: 'fallback',
            fullResult: fallback
        };
    }
};
