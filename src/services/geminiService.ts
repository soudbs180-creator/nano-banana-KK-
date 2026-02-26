import { AspectRatio, ImageSize, ModelType, ReferenceImage, GenerationMode } from "../types";
import { keyManager, normalizeModelId } from './keyManager';
import { getImageTokenEstimate, getModelPricing } from './modelPricing';
import { AuthMethod, buildApiUrl, buildHeaders, GOOGLE_API_BASE } from './apiConfig';
import { ProxyModelConfig } from './proxyModelConfig';
import { logError } from './systemLogService';
import { getImage } from './imageStorage';
import { llmService } from './llm/LLMService';
import { ImageGenerationOptions, ProviderConfig } from './llm/LLMAdapter';


// Fallback control: allow config/env-driven auto-backoff when quota is exhausted
let __fallbackFlagCache: boolean | null = null;
async function getFallbackFlag(): Promise<boolean> {
  if (__fallbackFlagCache !== null) return __fallbackFlagCache;
  let flag = true;
  try {
    const envVal = (typeof process !== 'undefined' && (process as any).env?.GEMINI_FALLBACK_ON_QUOTA) ?? undefined;
    if (typeof envVal === 'string') flag = envVal.toLowerCase() !== 'false';
  } catch { }
  try {
    const cfgUrl = '/config/model_service_config.json';
    if (typeof fetch === 'function') {
      const resp = await fetch(cfgUrl, { cache: 'no-store' });
      if (resp.ok) {
        const cfg = await resp.json();
        const v = cfg?.transit?.fallbackOnQuota;
        if (typeof v === 'boolean') flag = v;
        else if (typeof v === 'string') flag = v.toLowerCase() !== 'false';
      }
    }
  } catch { }
  __fallbackFlagCache = flag;
  return flag;
}

const isLocalDev = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// AbortController map to track active requests
const abortControllers = new Map<string, AbortController>();

export function normalizeProxyBaseUrl(baseUrl: string): string {
  let clean = (baseUrl || '').trim();
  if (!clean) return '';
  clean = clean.replace(/\/+$/, '');
  const suffixes = ['/v1/chat/completions', '/chat/completions', '/v1/images/generations', '/images/generations', '/v1beta', '/v1', '/api'];
  let stripped = true;
  while (stripped) {
    stripped = false;
    const lower = clean.toLowerCase();
    for (const suffix of suffixes) {
      if (lower.endsWith(suffix)) {
        clean = clean.slice(0, -suffix.length).replace(/\/+$/, '');
        stripped = true;
        break;
      }
    }
  }
  return clean;
}

export const cancelGeneration = (id: string) => {
  const controller = abortControllers.get(id);
  if (controller) {
    controller.abort("Generation cancelled by user");
    abortControllers.delete(id);
  }
};

/**
 * Calculate estimated token usage for image generation
 */
function calculateImageTokens(model: ModelType): number {
  const tokenMap: Record<string, number> = {
    // Gemini Image
    'gemini-2.5-flash-image': 1290,
    'gemini-3-pro-image-preview': 1120,
  };
  return tokenMap[model] || 0;
}

function normalizeError(error: any): Error {
  const rawMessage = error?.message || error?.toString?.() || '未知错误';
  const msg = rawMessage.toLowerCase();
  if (msg.includes('cancelled')) return new Error("任务已取消");

  // 🚀 [12AI 对齐] 精准网关与状态码映射
  if (msg.includes('524') || msg.includes('timeout')) return new Error(`网络超时 (524): ${rawMessage.slice(0, 180)}`);
  if (msg.includes('530') || msg.includes('502') || msg.includes('504')) return new Error(`网关错误 (530/502/504): ${rawMessage.slice(0, 180)}`);
  if (msg.includes('413') || msg.includes('payload too large')) return new Error("请求体过大 (413)，请减少待识别的图片数量或压缩图片体积");
  if (msg.includes('503') && msg.includes('no available channel')) return new Error(`服务暂不可用 (503: 无可用渠道): ${rawMessage.slice(0, 180)}`);
  if (msg.includes('maxoutputtokens')) return new Error("Token 设置超出限制：请确保最大输出 Token 小于 65536");

  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) return new Error("请求太过频繁 (429)，正在尝试切换线路，请稍后...");
  if (msg.includes("503") || msg.includes("service unavailable") || msg.includes("too busy") || msg.includes("deadlock")) return new Error(`服务器繁忙 (503): ${rawMessage.slice(0, 180)}`);
  if (msg.includes("403") || msg.includes("permission") || msg.includes("api_key_invalid")) return new Error("API Key 无效或余额不足 (403)，请检查设置或在 12AI 官网充值");
  if (msg.includes("MISSING_API_KEY")) return new Error("请先在设置中配置有效的 API Key");
  if (msg.includes("safety") || msg.includes("blocked") || msg.includes("policy")) return new Error("内容触发安全审查 (Safety Blocked)，请更换提示词或尝试非流式模式");
  if (msg.includes("400") || msg.includes("invalid_argument")) return new Error("请求参数无效：Token 数可能过大或模型不支持当前配置");
  if (msg.includes("500") || msg.includes("internal")) return new Error("远程服务器故障 (500)，请稍后重试");
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) return new Error("网络连接失败 (Network Error)，请检查您的网络设置或代理配置");

  return new Error(`生成失败: ${error.message || '未知错误'} (请按 F12 查看控制台详情)`);
}

/**
 * Export result interface
 */
export interface GenerateImageResult {
  url: string;
  tokens?: number;
  cost?: number;
  model?: string;
  imageSize?: ImageSize;
  effectiveModel?: string; // Actual model used
  effectiveSize?: ImageSize; // Actual size used
  aspectRatio?: AspectRatio; // Aspect Ratio
  dimensions?: { width: number; height: number }; // Exact dimensions for AUTO mode
  provider?: string; // API Provider Internal
  providerName?: string; // User-defined Provider Name
  modelName?: string; // User-friendly Model Name
}

/**
 * Parse model suffix
 */
function parseModelSuffix(modelId: string): {
  baseModel: string;
  aspectRatio?: AspectRatio;
  quality?: 'standard' | 'hd' | 'medium';
  imageSize?: ImageSize;
} {
  const [baseId] = modelId.split('@');
  const suffixMatch = baseId.match(/-((?:\d+-)?\d+-\d+|1-1|4-3|3-4|16-9|9-16|21-9|9-21|3-2|2-3)(?:-(4k|2k|hd|medium|standard))?$/i);

  if (!suffixMatch) {
    return { baseModel: modelId };
  }

  const aspectPart = suffixMatch[1];
  const qualityPart = suffixMatch[2]?.toLowerCase();

  const aspectMap: Record<string, AspectRatio> = {
    '1-1': AspectRatio.SQUARE,
    '4-3': AspectRatio.LANDSCAPE_4_3,
    '3-4': AspectRatio.PORTRAIT_3_4,
    '16-9': AspectRatio.LANDSCAPE_16_9,
    '9-16': AspectRatio.PORTRAIT_9_16,
    '21-9': AspectRatio.LANDSCAPE_21_9,
    '9-21': AspectRatio.PORTRAIT_9_21,
    '3-2': AspectRatio.LANDSCAPE_3_2,
    '2-3': AspectRatio.PORTRAIT_2_3,
  };

  const qualityToSize: Record<string, ImageSize> = {
    '4k': ImageSize.SIZE_4K,
    '2k': ImageSize.SIZE_2K,
    'hd': ImageSize.SIZE_4K,
    'medium': ImageSize.SIZE_2K,
    'standard': ImageSize.SIZE_1K,
  };

  const baseModel = baseId.replace(suffixMatch[0], '');

  return {
    baseModel,
    aspectRatio: aspectMap[aspectPart],
    quality: qualityPart as 'standard' | 'hd' | 'medium' | undefined,
    imageSize: qualityToSize[qualityPart || ''],
  };
}

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[] = [],
  model: ModelType = 'gemini-2.5-flash-image',
  negativePrompt: string = '',
  requestId?: string,
  grounding: boolean = false,
  options?: {
    size?: string;  // e.g. "1920x1080"
    quality?: 'standard' | 'hd' | 'medium';
    maskUrl?: string; // 🚀 Advanced Editing
    editMode?: 'inpaint' | 'outpaint' | 'vectorize' | 'reframe' | 'upscale' | 'replace-background' | 'edit';
  }
): Promise<GenerateImageResult> => {
  // 🚀 Parse Model Suffix (Consistency)
  const parsedSuffix = parseModelSuffix(model);
  if (parsedSuffix.baseModel !== model) {
    console.log(`[GeminiService] Parsed model suffix: ${model} -> ${parsedSuffix.baseModel}`, parsedSuffix);
    model = parsedSuffix.baseModel as ModelType;
    if (parsedSuffix.aspectRatio && aspectRatio === AspectRatio.AUTO) aspectRatio = parsedSuffix.aspectRatio;
    if (parsedSuffix.imageSize && imageSize === ImageSize.SIZE_1K) imageSize = parsedSuffix.imageSize;
  }

  // 🚀 Parse size option
  if (options?.size) {
    const sizeMatch = options.size.match(/^(\d+)x(\d+)$/);
    if (sizeMatch) {
      const width = parseInt(sizeMatch[1]);
      const height = parseInt(sizeMatch[2]);
      const ratio = width / height;
      // Heuristic mapping for standard ratios
      if (Math.abs(ratio - 16 / 9) < 0.1) aspectRatio = AspectRatio.LANDSCAPE_16_9;
      else if (Math.abs(ratio - 9 / 16) < 0.1) aspectRatio = AspectRatio.PORTRAIT_9_16;
      else if (Math.abs(ratio - 4 / 3) < 0.1) aspectRatio = AspectRatio.LANDSCAPE_4_3;
      else if (Math.abs(ratio - 3 / 4) < 0.1) aspectRatio = AspectRatio.PORTRAIT_3_4;
      else if (Math.abs(ratio - 21 / 9) < 0.1) aspectRatio = AspectRatio.LANDSCAPE_21_9;
      else if (Math.abs(ratio - 1) < 0.1) aspectRatio = AspectRatio.SQUARE;
      else if (Math.abs(ratio - 3 / 2) < 0.1) aspectRatio = AspectRatio.LANDSCAPE_3_2;
      else if (Math.abs(ratio - 2 / 3) < 0.1) aspectRatio = AspectRatio.PORTRAIT_2_3;
    }
  }

  // 🚀 Parse quality option
  if (options?.quality) {
    const qualityMap: Record<string, ImageSize> = {
      'hd': ImageSize.SIZE_4K,
      'medium': ImageSize.SIZE_2K,
      'standard': ImageSize.SIZE_1K,
    };
    if (qualityMap[options.quality]) imageSize = qualityMap[options.quality];
  }

  // Defensive: Strip '-4k' suffix globally if present (backward compatibility)
  if (model.toLowerCase().endsWith('-4k')) {
    model = model.replace(/-4k$/i, '') as ModelType;
  }

  let resolvedRatio = aspectRatio;
  let autoRatioDimensions: { width: number; height: number } | undefined;

  // Resolve AUTO aspect ratio
  if (aspectRatio === AspectRatio.AUTO) {
    if (referenceImages.length > 0 && referenceImages[0].data) {
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load reference'));
          img.src = `data:${referenceImages[0].mimeType};base64,${referenceImages[0].data}`;
        });
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const ratio = w / h;
        autoRatioDimensions = { width: w, height: h };

        if (ratio > 2.0) resolvedRatio = AspectRatio.LANDSCAPE_21_9;
        else if (ratio > 1.6) resolvedRatio = AspectRatio.LANDSCAPE_16_9;
        else if (ratio > 1.2) resolvedRatio = AspectRatio.LANDSCAPE_4_3;
        else if (ratio > 0.9) resolvedRatio = AspectRatio.SQUARE;
        else if (ratio > 0.66) resolvedRatio = AspectRatio.PORTRAIT_3_4;
        else resolvedRatio = AspectRatio.PORTRAIT_9_16;
      } catch (e) {
        resolvedRatio = AspectRatio.SQUARE;
      }
    } else {
      resolvedRatio = AspectRatio.LANDSCAPE_16_9;
    }
  }
  aspectRatio = resolvedRatio;

  console.log(`[GeminiService] Generating with Model: ${model}, Ratio: ${aspectRatio}, Size: ${imageSize}`);

  // Process Use Reference Images
  const processedReferences = (await Promise.all((referenceImages || []).map(async (img) => {
    let currentData = img.data;

    // 1. If data missing, try IDB recovery
    if (!currentData && (img.storageId || img.id)) {
      try {
        const cached = await getImage(img.storageId || img.id);
        if (cached && typeof cached === 'string') {
          currentData = cached;
        }
      } catch (e) {
        // ignore
      }
    }

    if (!currentData) return null;

    // 2. Hydrate URL/Blob
    const isUrl = currentData.startsWith('http') || currentData.startsWith('blob:') || currentData.startsWith('file:');
    if (isUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        let response: Response;
        try {
          response = await fetch(currentData, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }
        const blob = await response.blob();
        return new Promise<ReferenceImage>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result as string;
            // Standardize to pure base64
            const match = res.match(/^data:(.+);base64,(.+)$/);
            if (match) {
              resolve({ ...img, mimeType: match[1], data: match[2] });
            } else {
              resolve({ ...img, data: res });
            }
          };
          reader.onerror = () => resolve({ ...img, data: currentData });
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        // Skip this reference on timeout/fetch error to avoid blocking whole request
        return null;
      }
    }

    // 3. Fallback: Strip data uri prefix if present
    const cleanData = currentData.replace(/^data:image\/\w+;base64,/, '');
    return { ...img, data: cleanData };
  }))).filter((img): img is ReferenceImage => !!img && !!img.data);

  // Create AbortController if requestId provided
  if (requestId && !abortControllers.has(requestId)) {
    abortControllers.set(requestId, new AbortController());
  }
  const controller = requestId ? abortControllers.get(requestId) : undefined;
  if (controller?.signal.aborted) throw new Error('Generation cancelled');

  // --- Prepare Universal Provider Config ---
  const is4K = imageSize === ImageSize.SIZE_4K || imageSize.includes('4K');
  const is2K = imageSize === ImageSize.SIZE_2K || imageSize.includes('2K');

  const providerConfig: ProviderConfig = {
    // 1. Google Gemini Config
    google: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: is4K ? '4K' : (is2K ? '2K' : '1K')
      }
    },
    // 2. Imagen Config
    imagen: {
      aspectRatio: aspectRatio,
      sampleCount: 1,
      personGeneration: 'allow_adult',
      // Imagen 4 only supports 1K/2K. Map 4K -> 2K
      imageSize: (is4K || is2K) ? '2K' : '1K'
    },
    // 3. OpenAI Config
    openai: {
      quality: (is4K || is2K) ? 'hd' : 'standard',
      // Size is handled dynamically by adapter if not precise, but we can hint
      // We let adapter handle specific pixel logic for Antigravity, 
      // but strictly standard OpenAI uses specific sizes.
    }
  };

  const llmOptions: ImageGenerationOptions = {
    modelId: model,
    prompt: prompt,
    aspectRatio: aspectRatio,
    imageSize: imageSize, // Pass high level enum
    imageCount: 1,
    referenceImages: processedReferences.map(r => r.data).filter((d): d is string => !!d && !d.startsWith('http') && !d.startsWith('blob:') && !d.startsWith('file:')),
    providerConfig: providerConfig, // 🚀 Pass the Universal Config
    maskUrl: options?.maskUrl, // 🚀 Pass Edit Options
    editMode: options?.editMode
  };

  try {
    const result = await llmService.generateImage(llmOptions);
    const resultUrl = result.urls[0];

    // --- Cost Estimation Cleanup ---
    let cost = result.usage?.cost || 0;
    let tokens = result.usage?.totalTokens || 0;

    if (tokens === 0) {
      tokens = getImageTokenEstimate(model, imageSize);
    }

    // 🚀 [Fix Cost Calculation] Don't hide behind 'tokens > 0' check. Some models charge per image strictly.
    if (cost === 0) {
      const pricing = getModelPricing(model);
      if (pricing) {
        if (pricing.pricePerImage) {
          cost = pricing.pricePerImage;
        } else if (pricing.outputPerMillionTokens && tokens > 0) {
          cost = (tokens / 1000000) * pricing.outputPerMillionTokens;
        }
      }
    }

    return {
      url: resultUrl,
      tokens,
      cost,
      imageSize: (result.imageSize as ImageSize) || imageSize || ImageSize.SIZE_1K,
      effectiveModel: result.model || model,
      effectiveSize: (result.imageSize as ImageSize) || imageSize || ImageSize.SIZE_1K,
      aspectRatio,
      dimensions: result.metadata?.dimensions || autoRatioDimensions,
      provider: result.provider,
      providerName: result.providerName,
      modelName: result.modelName
    };

  } catch (error: any) {
    if (error.name === 'AbortError' || error.message === 'Generation cancelled') throw error;
    console.error(`[GeminiService] LLMService Generation Failed:`, error);
    throw normalizeError(error);
  }
};
