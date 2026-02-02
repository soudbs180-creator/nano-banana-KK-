import { AspectRatio, ImageSize, ModelType, ReferenceImage, GenerationMode } from "../types";
import { keyManager, normalizeModelId } from './keyManager';
import * as costService from './costService';
import { AuthMethod, buildApiUrl, buildHeaders, GOOGLE_API_BASE } from './apiConfig';
import { ProxyModelConfig } from './proxyModelConfig';
import { logError } from './systemLogService';
import { getImage } from './imageStorage';

// Fallback control: allow config/env-driven auto-backoff when quota is exhausted
let __fallbackFlagCache: boolean | null = null;
async function getFallbackFlag(): Promise<boolean> {
  if (__fallbackFlagCache !== null) return __fallbackFlagCache;
  // Default: enabled
  let flag = true;
  // Environment variable (Node-like env); may be undefined in some bundlers
  try {
    const envVal = (typeof process !== 'undefined' && (process as any).env?.GEMINI_FALLBACK_ON_QUOTA) ?? undefined;
    if (typeof envVal === 'string') flag = envVal.toLowerCase() !== 'false';
  } catch { }
  // Configuration file (relative path at runtime)
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
  } catch {
    // ignore and keep previous flag
  }
  __fallbackFlagCache = flag;
  return flag;
}

// Detect environment
const isLocalDev = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Backend API endpoint for cloud deployment
const API_ENDPOINT = "/api/generate";

// AbortController map to track active requests
const abortControllers = new Map<string, AbortController>();

/**
 * Determine API Format based on Base URL
 */
function detectApiFormat(baseUrl: string): 'openai' | 'gemini' | 'openai-chat-compat' {
  const url = baseUrl.toLowerCase();
  if (url.includes('googleapis.com') || url.includes('google.com')) return 'gemini';
  // Check for common OpenAI-compatible proxy signatures or explicit newapi/oneapi patterns
  if (url.includes('newapi') || url.includes('oneapi') || url.includes('v1/images') || url.includes('vodeshop.com')) return 'openai-chat-compat';
  // Default to OpenAI format for custom proxies unless it looks like Gemini
  return 'openai';
}

export function normalizeProxyBaseUrl(baseUrl: string): string {
  let clean = (baseUrl || '').trim();
  if (!clean) return '';
  clean = clean.replace(/\/+$/, '');

  const suffixes = [
    '/v1/chat/completions',
    '/chat/completions',
    '/v1/images/generations',
    '/images/generations',
    '/v1beta',
    '/v1',
    '/api'
  ];

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

export function buildProxyHeaders(
  authMethod: AuthMethod,
  apiKey: string,
  headerName?: string,
  group?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (authMethod === 'header') {
    const resolvedHeader = headerName || 'Authorization';
    const normalizedHeader = resolvedHeader.toLowerCase();
    const value = normalizedHeader === 'authorization'
      ? (apiKey.toLowerCase().startsWith('bearer ') ? apiKey : `Bearer ${apiKey}`)
      : apiKey;
    headers[resolvedHeader] = value;
  }

  // OpenRouter Specific Headers for CORS
  if (apiKey.startsWith('sk-or-') || (headerName && headerName.toLowerCase() === 'authorization')) {
    if (typeof window !== 'undefined') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'KK Studio';
    }
  }

  if (group) {
    headers['X-Group'] = group;
  }

  return headers;
}

function toDataUrl(image: ReferenceImage): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

function buildChatContent(prompt: string, referenceImages: ReferenceImage[]): Array<{ type: string;[key: string]: any }> {
  const content: Array<{ type: string;[key: string]: any }> = [{ type: 'text', text: prompt }];
  referenceImages?.forEach((img) => {
    if (!img?.data) return;
    content.push({
      type: 'image_url',
      image_url: { url: toDataUrl(img) }
    });
  });
  return content;
}

function extractImageFromChatResponse(result: any): { dataUrl?: string; url?: string } | null {
  if (!result) return null;

  const directB64 = result?.data?.[0]?.b64_json;
  if (directB64) {
    return { dataUrl: `data:image/png;base64,${directB64}` };
  }
  const directUrl = result?.data?.[0]?.url;
  if (directUrl) {
    return { url: directUrl };
  }

  const content = result?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const b64 = part?.image?.b64_json || part?.b64_json;
      if (b64) {
        return { dataUrl: `data:image/png;base64,${b64}` };
      }
      const url = part?.image_url?.url || part?.image_url || part?.image?.url || part?.url;
      if (url) {
        return { url };
      }
    }
  }

  if (typeof content === 'string') {
    const mdImageRegex = /!\[.*?\]\((.*?)\)/;
    const urlRegex = /(https?:\/\/[^\s)]+)/;
    const mdMatch = content.match(mdImageRegex);
    if (mdMatch && mdMatch[1]) {
      return { url: mdMatch[1] };
    }
    const urlMatch = content.match(urlRegex);
    if (urlMatch) {
      return { url: urlMatch[1] };
    }
  }

  const legacyUrl = result?.choices?.[0]?.message?.image_url?.url || result?.choices?.[0]?.message?.image_url;
  if (legacyUrl) {
    return { url: legacyUrl };
  }

  return null;
}

/**
 * Cancel a specific generation request
 */
export const cancelGeneration = (id: string) => {
  const controller = abortControllers.get(id);
  if (controller) {
    controller.abort("Generation cancelled by user"); // Add reason
    abortControllers.delete(id);
  }
};

/**
 * Helper to perform fetch with timeout and external signal support
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number, externalSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeoutMsg = `Request timed out after ${timeoutMs / 1000}s`;
  const timeoutId = setTimeout(() => controller.abort(timeoutMsg), timeoutMs);

  // If external signal exists, listen to it
  const onExternalAbort = () => controller.abort(externalSignal?.reason || "Operation cancelled");
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new Error(externalSignal.reason || "Operation cancelled");
    }
    externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

    // Enhance error message
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      if (controller.signal.aborted) {
        // Check if it was our timeout or external cancellation
        const reason = controller.signal.reason;
        if (reason === timeoutMsg) throw new Error("Connection timed out (Check network/proxy)");
        throw new Error(typeof reason === 'string' ? reason : "Request cancelled");
      }
    }
    throw error;
  }
}

/**
 * 模型 ID 映射表
 * 将内部模型名称映射到 Google API 实际模型 ID
 */
function mapToApiModelId(internalId: string, isProxyApi: boolean = false): string {
  // 如果是第三方代理 API (如 NewAPI)，可能需要不同的模型名称
  // Google 官方 API 模型映射
  const modelMap: Record<string, string> = {
    // Nano Banana 系列 - 内部代号映射到 Google 官方模型
    // 参考: https://ai.google.dev/gemini-api/docs/image-generation
    // gemini-2.5-flash-image 是 Google 官方支持的图像生成模型
    'nano-banana': 'gemini-2.5-flash-image',          // 快速图像生成
    'nano-banana-pro': 'gemini-3-pro-image-preview',  // 高质量图像生成

    // 标准 Gemini Image 模型 (直接透传)
    'gemini-2.5-flash-image': 'gemini-2.5-flash-image',

    // 标准 Gemini Image 模型 (直接透传，已经是正确的 Google 官方名称)
    'gemini-3-pro-image-preview': 'gemini-3-pro-image-preview',

    // Imagen 4 系列 (直接透传)
    'imagen-4.0-generate-001': 'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001': 'imagen-4.0-ultra-generate-001',
    'imagen-4.0-fast-generate-001': 'imagen-4.0-fast-generate-001',

    // Imagen 3 系列 (直接透传)
    'imagen-3.0-generate-002': 'imagen-3.0-generate-002',
    'imagen-3.0-generate-001': 'imagen-3.0-generate-001',
  };

  // Defensive: Strip '-4k' suffix if present (case insensitive)
  const normalizedId = internalId.replace(/-4k$/i, '');

  // 优先匹配映射表 (即使是 Proxy，也应该发送真实的 Gemini 模型 ID，而不是内部代号)
  if (modelMap[normalizedId]) {
    return modelMap[normalizedId];
  }

  // 如果没有匹配到 (例如 dall-e-3, flux-pro)，直接返回原 ID
  return normalizedId;
}

/**
 * Calculate estimated token usage for image generation
 */
function calculateImageTokens(model: ModelType): number {
  const tokenMap: Record<string, number> = {
    // Nano Banana (Flash) - 1290 tokens/张
    'nano-banana': 1290,
    'gemini-2.5-flash-image': 1290,

    // Nano Banana Pro - 1120 tokens/张 (1K-2K)
    'nano-banana-pro': 1120,
    'gemini-3-pro-image-preview': 1120,
  };

  return tokenMap[model] || 0;
}

const buildAutoProxyModelConfig = (modelId: string, baseUrl: string): ProxyModelConfig => {
  const idLower = modelId.toLowerCase();
  const isVideo = idLower.includes('video') || idLower.includes('veo') || idLower.includes('kling') || idLower.includes('runway') || idLower.includes('luma') || idLower.includes('sora') || idLower.includes('pika') || idLower.includes('gen-3');
  const isChat = idLower.includes('chat') || idLower.includes('gpt') || idLower.includes('claude') || idLower.includes('qwen') || idLower.includes('llama') || idLower.includes('mixtral') || idLower.includes('mistral');
  const isGoogleFamily = /gemini|imagen|veo|nano-banana/i.test(modelId);
  const isGoogleBase = baseUrl.includes('googleapis.com');
  const isAggregatorOpenAI = baseUrl.includes('newapi') || baseUrl.includes('oneapi') || baseUrl.includes('one-api');
  const isLikelyGeminiProxy = baseUrl.includes('gemini') || baseUrl.includes('google');

  const type: ProxyModelConfig['type'] = isVideo ? 'video' : isChat ? 'chat' : 'image';
  const apiFormat: ProxyModelConfig['apiFormat'] = isGoogleBase
    ? 'gemini'
    : isAggregatorOpenAI
      ? 'openai'
      : (isLikelyGeminiProxy && isGoogleFamily && type !== 'chat') ? 'gemini' : 'openai';

  return {
    id: modelId,
    label: modelId,
    type,
    provider: isGoogleFamily ? 'Google' : 'Custom',
    apiFormat,
    supportedAspectRatios: type === 'chat' ? [] : Object.values(AspectRatio),
    supportedSizes: type === 'chat' ? [] : Object.values(ImageSize),
    supportsGrounding: false,
    videoCapabilities: type === 'video' ? {
      supportsDuration: true,
      supportsFirstFrame: true,
      supportsLastFrame: false,
      supportsFps: false
    } : undefined,
    description: 'Auto-detected'
  };
};

/**
 * Normalize error messages
 */
function normalizeError(error: any): Error {
  const msg = (error.message || error.toString()).toLowerCase();
  if (msg.includes('cancelled')) return new Error("任务已取消");
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) return new Error("请求太过频繁 (429)，正在尝试切换线路，请稍后...");
  if (msg.includes("403") || msg.includes("permission") || msg.includes("api_key_invalid")) return new Error("API Key 无效或已过期 (403)，请检查设置");
  if (msg.includes("MISSING_API_KEY")) return new Error("请先在设置中配置有效的 API Key");
  if (msg.includes("safety") || msg.includes("blocked") || msg.includes("policy")) return new Error("生成内容被安全策略拦截，请修改提示词");
  if (msg.includes("400") || msg.includes("invalid_argument")) return new Error("请求参数无效：模型可能不支持当前配置");
  if (msg.includes("500") || msg.includes("internal")) return new Error("谷歌服务器繁忙 (500)，请稍后重试");
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) return new Error("网络连接失败 (Network Error)，请检查您的网络设置或代理配置");

  // Return the original error message for better debugging
  return new Error(`生成失败: ${error.message || '未知错误'} (请按 F12 查看控制台详情)`);
}

/**
 * Map aspect ratio and size to OpenAI-compatible size string
 */
function getDallE3Size(aspectRatio: AspectRatio): string {
  switch (aspectRatio) {
    case AspectRatio.SQUARE: return '1024x1024';
    case AspectRatio.LANDSCAPE_16_9: return '1792x1024';
    case AspectRatio.PORTRAIT_9_16: return '1024x1792';
    // Approximate others to nearest standard DALL-E 3 size
    case AspectRatio.LANDSCAPE_4_3: return '1024x1024'; // Or 1792x1024
    case AspectRatio.PORTRAIT_3_4: return '1024x1024'; // Or 1024x1792
    case AspectRatio.LANDSCAPE_21_9: return '1792x1024';
    default: return '1024x1024';
  }
}

function mapToOpenAISize(aspectRatio: AspectRatio, imageSize: ImageSize, model: string = ''): string {
  // strict DALL-E 3 handling
  if (model.toLowerCase().includes('dall-e-3')) {
    return getDallE3Size(aspectRatio);
  }

  // Size mapping based on aspect ratio and target resolution
  const sizeMap: Record<string, Record<string, string>> = {
    '1K': {
      [AspectRatio.SQUARE]: '1024x1024',
      [AspectRatio.PORTRAIT_3_4]: '768x1024',
      [AspectRatio.LANDSCAPE_4_3]: '1024x768',
      [AspectRatio.PORTRAIT_9_16]: '576x1024',
      [AspectRatio.LANDSCAPE_16_9]: '1024x576',
      [AspectRatio.LANDSCAPE_21_9]: '1024x440',
      [AspectRatio.PORTRAIT_9_21]: '648x1512',
      [AspectRatio.LANDSCAPE_3_2]: '1024x683',
      [AspectRatio.PORTRAIT_2_3]: '683x1024',
    },
    '2K': {
      [AspectRatio.SQUARE]: '1792x1792',
      [AspectRatio.PORTRAIT_3_4]: '1344x1792',
      [AspectRatio.LANDSCAPE_4_3]: '1792x1344',
      [AspectRatio.PORTRAIT_9_16]: '1024x1792',
      [AspectRatio.LANDSCAPE_16_9]: '1792x1024',
      [AspectRatio.LANDSCAPE_21_9]: '1792x768',
      [AspectRatio.PORTRAIT_9_21]: '960x2240',
      [AspectRatio.LANDSCAPE_3_2]: '1792x1195',
      [AspectRatio.PORTRAIT_2_3]: '1195x1792',
    },
    '4K': {
      [AspectRatio.SQUARE]: '2048x2048',
      [AspectRatio.PORTRAIT_3_4]: '1536x2048',
      [AspectRatio.LANDSCAPE_4_3]: '2048x1536',
      [AspectRatio.PORTRAIT_9_16]: '1152x2048',
      [AspectRatio.LANDSCAPE_16_9]: '2048x1152',
      [AspectRatio.LANDSCAPE_21_9]: '2048x858',
      [AspectRatio.PORTRAIT_9_21]: '1080x2520',
      [AspectRatio.LANDSCAPE_3_2]: '2048x1365',
      [AspectRatio.PORTRAIT_2_3]: '1365x2048',
    }
  };

  return sizeMap[imageSize]?.[aspectRatio] || sizeMap['1K'][aspectRatio] || '1024x1024';
}

async function generateImageViaBackend(
  prompt: string, aspectRatio: AspectRatio, imageSize: ImageSize, referenceImages: ReferenceImage[],
  model: ModelType, apiKey: string, requestId?: string
): Promise<{ url: string, tokens?: number, cost?: number }> {
  const controller = requestId ? abortControllers.get(requestId) : undefined;
  if (controller?.signal.aborted) throw new Error('Generation cancelled');

  // ✨ 自动校正模型 ID（将旧模型迁移到新模型）
  const normalizedModel = normalizeModelId(model);
  if (normalizedModel !== model) {
    console.warn(`[GeminiService] Model "${model}" is deprecated, using "${normalizedModel}" instead`);
    model = normalizedModel as ModelType;
  }

  let effectiveKey = apiKey;
  if (!effectiveKey) {
    try {
      const stored = localStorage.getItem('kk-api-keys-local');
      if (stored) {
        const keys = JSON.parse(stored) as string[];
        effectiveKey = keys.find(k => k && k.trim()) || '';
      }
    } catch (e) { }
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt, aspectRatio, imageSize, model,
        referenceImages: referenceImages.map(img => ({ data: img.data, mimeType: img.mimeType })),
        apiKey: effectiveKey
      }),
      signal: controller?.signal
    });

    if (!response.ok) {
      let errorText = `Request failed: ${response.status}`;
      try { const errData = await response.json(); if (errData?.error) errorText = errData.error; } catch (e) { }
      throw new Error(errorText);
    }

    const data = await response.json();
    if (data.success && data.imageData) return { url: `data:${data.mimeType || "image/png"};base64,${data.imageData}`, tokens: 0, cost: 0 };
    throw new Error(data.error || "未能生成图片");

  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error('Generation cancelled');
    console.error("Backend generation error:", error);
    throw normalizeError(error);
  }
}

/**
 * Unified Image Generation Function
 * Automatically routes based on KeyManager channels
 */
export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string = '',
  requestId?: string,
  enableGrounding: boolean = false
): Promise<{ url: string, tokens?: number, cost?: number }> => {
  // Defensive: Strip '-4k' suffix globally if present
  if (model.toLowerCase().endsWith('-4k')) {
    model = model.replace(/-4k$/i, '') as ModelType;
  }

  // Resolve AUTO aspect ratio
  let resolvedRatio = aspectRatio;
  if (aspectRatio === AspectRatio.AUTO) {
    // Try to infer from reference image dimensions
    if (referenceImages.length > 0 && referenceImages[0].data) {
      try {
        // Create image to get dimensions
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load reference'));
          img.src = `data:${referenceImages[0].mimeType};base64,${referenceImages[0].data}`;
        });
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const ratio = w / h;

        // Map to closest standard ratio
        if (ratio > 2.0) resolvedRatio = AspectRatio.LANDSCAPE_21_9;
        else if (ratio > 1.6) resolvedRatio = AspectRatio.LANDSCAPE_16_9;
        else if (ratio > 1.2) resolvedRatio = AspectRatio.LANDSCAPE_4_3;
        else if (ratio > 0.9) resolvedRatio = AspectRatio.SQUARE;
        else if (ratio > 0.66) resolvedRatio = AspectRatio.PORTRAIT_3_4;
        else resolvedRatio = AspectRatio.PORTRAIT_9_16;

        console.log(`[Auto Ratio] Inferred ${resolvedRatio} from reference (${w}x${h}, ratio=${ratio.toFixed(2)})`);
      } catch (e) {
        console.warn('[Auto Ratio] Failed to infer from reference, using SQUARE');
        resolvedRatio = AspectRatio.SQUARE;
      }
    } else {
      // Default to 16:9 if no reference (Modern Standard)
      resolvedRatio = AspectRatio.LANDSCAPE_16_9;
    }
  }
  aspectRatio = resolvedRatio;

  // [VERIFY] Log final effective params for User Assurance
  console.log(`[GeminiService] Generating with Model: ${model}, Ratio: ${aspectRatio}, Size: ${imageSize}`);

  // Critical for correctly handling images dragged from canvas (Blob URLs) or retried history (Remote URLs)
  // [ENHANCED] Also recover from IndexedDB if data is missing (persistence restore)
  const processedReferences = await Promise.all((referenceImages || []).map(async (img) => {
    // 1. If data missing, try IDB
    if (!img.data) {
      if (img.storageId || img.id) {
        try {
          const cached = await getImage(img.storageId || img.id);
          if (cached && typeof cached === 'string') {
            return { ...img, data: cached.replace(/^data:image\/\w+;base64,/, ''), mimeType: 'image/png' }; // Simple patch, logic below handles full data uri
          }
        } catch (e) {
          console.warn('[GeminiService] IDB recovery failed', e);
        }
      }
      return img; // Return as-is (will be skipped later)
    }

    // 2. Hydrate URL/Blob
    const isUrl = img.data.startsWith('http') || img.data.startsWith('blob:') || img.data.startsWith('file:');
    if (isUrl) {
      try {
        const response = await fetch(img.data);
        const blob = await response.blob();
        return new Promise<ReferenceImage>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const res = reader.result as string;
            // Standardize to pure base64 for internal logic
            const match = res.match(/^data:(.+);base64,(.+)$/);
            if (match) {
              resolve({ ...img, mimeType: match[1], data: match[2] });
            } else {
              // Fallback: use data URI
              resolve({ ...img, data: res });
            }
          };
          reader.onerror = () => resolve(img);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn(`[GeminiService] Failed to hydrate reference image ${img.id}`, e);
        return img;
      }
    }
    return img;
  }));

  // Create AbortController if requestId provided
  if (requestId && !abortControllers.has(requestId)) {
    abortControllers.set(requestId, new AbortController());
  }

  const controller = requestId ? abortControllers.get(requestId) : undefined;
  if (controller?.signal.aborted) throw new Error('Generation cancelled');

  // 1. Resolve Effective Key & Setup
  let effectiveKey = apiKey;
  let keyId: string | undefined;
  let baseUrl = GOOGLE_API_BASE;
  let authMethod: AuthMethod = 'query';
  let headerName = 'x-goog-api-key';
  let provider: string = 'Google';
  let group: string | undefined;
  let compatibilityMode: 'standard' | 'chat' = 'standard';

  // If no explicit API key, ask KeyManager
  if (!effectiveKey) {
    const keyData = keyManager.getNextKey(model);
    if (keyData) {
      effectiveKey = keyData.key;
      keyId = keyData.id;
      baseUrl = keyData.baseUrl || GOOGLE_API_BASE;
      authMethod = keyData.authMethod;
      headerName = keyData.headerName;
      group = keyData.group;
      provider = keyData.provider;
      compatibilityMode = (keyData as any).compatibilityMode || 'standard';
      console.log(`[GeminiService] ✓ Key found for model "${model}": Provider=${provider}, BaseUrl=${baseUrl}`);
    } else {
      // DIAGNOSTIC: Log all available keys and their supported models
      console.warn(`[GeminiService] ⚠ No API Key found for model "${model}"`);
      const allSlots = keyManager.getSlots();
      if (allSlots.length === 0) {
        console.error('[GeminiService] ✗ No API Keys configured! Please add a key in Settings.');
      } else {
        console.group('[GeminiService] Available Keys:');
        allSlots.forEach((slot: any, i: number) => {
          console.log(`  [${i + 1}] ${slot.name || slot.id} (${slot.provider || 'Google'})`);
          console.log(`      Status: ${slot.status || 'unknown'}, Disabled: ${slot.disabled || false}`);
          console.log(`      Supported Models: ${(slot.supportedModels || []).join(', ') || 'NONE'}`);
        });
        console.groupEnd();
        console.error(`[GeminiService] ✗ None of the above keys support model "${model}". Please edit your key and add this model to the supported list.`);
      }

      // Fallback: Check env var (only for basic local setup)
      if (import.meta.env.VITE_GEMINI_API_KEY) {
        effectiveKey = import.meta.env.VITE_GEMINI_API_KEY;
        console.log('[GeminiService] Using fallback VITE_GEMINI_API_KEY from environment');
        // Provider stays Google default
      }
    }
  }

  // If still no key, fallback to backend (if not local dev with no key)
  if (!effectiveKey) {
    return await generateImageViaBackend(prompt, aspectRatio, imageSize, processedReferences, model, apiKey, requestId);
  }

  // 2. Retry Loop
  const MAX_ATTEMPTS = 3;
  let lastError: any = null;
  let lastFormat: 'openai' | 'gemini' | 'openai-chat-compat' | null = null;

  // 3. Detect API format and prepare request
  let apiFormat: 'openai' | 'gemini' | 'openai-chat-compat' = detectApiFormat(baseUrl);
  const cleanBase = normalizeProxyBaseUrl(baseUrl) || baseUrl.trim().replace(/\/$/, '');

  // 4. Smart fallback for Cherry API vs Standard NewAPI
  // IMPORTANT: Only override apiFormat for PROXY APIs, NOT for Google official API
  const safeModel = model || '';
  const isGoogleOfficial = apiFormat === 'gemini'; // Already detected as Google

  if (!isGoogleOfficial && (safeModel.includes('nano-banana'))) {
    apiFormat = 'openai-chat-compat';
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      let usageData = { tokens: 0, cost: 0 };
      let result: any;

      // -----------------------------------------------------------------------
      // CASE 1: Chat Compatibility Mode (Cherry API / Midjourney Proxy)
      // -----------------------------------------------------------------------
      if (apiFormat === 'openai-chat-compat' || compatibilityMode === 'chat') {
        const apiUrl = `${cleanBase}/v1/chat/completions`;

        // ... (body construction skipped for brevity, assumed unchanged) ...
        const contentParts: any[] = [{ type: 'text', text: prompt }];
        processedReferences?.forEach((img) => {
          if (img?.data) {
            let finalUrl = img.data;
            if (!img.data.startsWith('data:') && !img.data.startsWith('http')) {
              finalUrl = `data:${img.mimeType || 'image/png'};base64,${img.data}`;
            }
            contentParts.push({ type: 'image_url', image_url: { url: finalUrl } });
          }
        });

        // Map internal model ID to actual API model ID for proxy APIs
        const apiModelId = mapToApiModelId(model);
        const requestBody = {
          model: apiModelId,
          stream: false,
          messages: [{ role: 'user', content: contentParts }],
          max_tokens: 4096
        };

        const response = await fetchWithTimeout(apiUrl, {
          method: 'POST',
          headers: buildProxyHeaders(authMethod, effectiveKey, headerName, group),
          body: JSON.stringify(requestBody)
        }, 300000, controller?.signal);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Chat-Image Request Failed: ${response.status}`);
        }

        result = await response.json();
        const extracted = extractImageFromChatResponse(result);

        if (extracted?.dataUrl || extracted?.url) {
          if (keyId) {
            keyManager.reportSuccess(keyId);
            const { cost, tokens } = costService.calculateCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt.length, processedReferences?.length || 0);
            keyManager.addUsage(keyId, tokens);
            keyManager.addCost(keyId, cost);
            costService.recordCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt, processedReferences?.length || 0);
            usageData = { tokens, cost };
          }
          if (extracted.dataUrl) return { url: extracted.dataUrl, ...usageData };
          if (extracted.url) return { url: extracted.url, ...usageData };
        }
        throw new Error("Model responded but no image URL found in chat response");

      }
      // -----------------------------------------------------------------------
      // ====================================================================
      // Native Gemini API - 严格区分模型类型
      // ====================================================================
      else if (apiFormat === 'gemini') {
        const apiModelId = mapToApiModelId(model);
        const isImagenModel = model.startsWith('imagen-4') || model.startsWith('imagen-3');
        const isVeoModel = model.startsWith('veo-');

        // ========== 分支 1: Veo 视频模型 ==========
        // Endpoint: :predictLongRunning
        // 特点: 异步操作,需要轮询
        if (isVeoModel) {
          // 导入VeoVideoService
          const { startVeoVideoGeneration, pollVeoVideoOperation } = await import('./VeoVideoService');

          // 启动异步生成
          const { operationId } = await startVeoVideoGeneration(
            {
              prompt,
              aspectRatio,
              model: apiModelId
            },
            effectiveKey,
            cleanBase
          );

          // 轮询直到完成
          const videoResult = await pollVeoVideoOperation(
            operationId,
            effectiveKey,
            cleanBase,
            (progress) => {
              console.log(`[Veo] 生成进度: ${progress.toFixed(1)}%`);
            },
            controller?.signal
          );

          if (keyId) {
            keyManager.reportSuccess(keyId);
            const cost = 0.5; // 临时成本
            keyManager.addCost(keyId, cost);
            usageData = { tokens: 0, cost };
          }

          return { url: videoResult.url, ...usageData };
        }

        // ========== 分支 2: Imagen 图像模型 ==========
        // Endpoint: :predict
        // 格式: instances + parameters
        // ⚠️ Imagen实际使用generativelanguage.googleapis.com,但格式不同
        if (isImagenModel) {
          // Imagen使用与Gemini相同的base URL
          const imagenUrl = `${cleanBase}/v1beta/models/${apiModelId}:predict`;
          const finalUrl = authMethod === 'query' ? `${imagenUrl}?key=${effectiveKey}` : imagenUrl;

          const headers = buildHeaders(authMethod, effectiveKey, headerName);
          if (group) headers['X-Group'] = group;

          // Imagen API format: instances + parameters
          const parameters: any = {
            sampleCount: 1
          };

          if (aspectRatio && aspectRatio !== AspectRatio.AUTO) {
            parameters.aspectRatio = aspectRatio;
          }

          // ⚠️ 只有非Fast版本的Imagen支持sampleImageSize
          // imagen-4.0-fast-generate-001 不支持此参数
          const supportsSampleImageSize = !apiModelId.includes('fast');
          if (imageSize && supportsSampleImageSize) {
            parameters.sampleImageSize = imageSize;
          }

          const payload = {
            instances: [{ prompt }],
            parameters
          };

          const response = await fetchWithTimeout(finalUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          }, 300000, controller?.signal);

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
          }

          result = await response.json();
          const imageData = result.predictions?.[0]?.bytesBase64Encoded;

          if (imageData) {
            if (keyId) {
              keyManager.reportSuccess(keyId);
              const { cost, tokens } = costService.calculateCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt.length, processedReferences?.length || 0);
              keyManager.addUsage(keyId, tokens);
              keyManager.addCost(keyId, cost);
              costService.recordCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt, processedReferences?.length || 0);
              usageData = { tokens, cost };
            }
            return { url: `data:image/png;base64,${imageData}`, ...usageData };
          }
          throw new Error("No image data in Imagen response");
        }

        // Gemini Image models use :generateContent
        const apiUrl = buildApiUrl(cleanBase, apiModelId, 'generateContent', authMethod, effectiveKey);
        const headers = buildHeaders(authMethod, effectiveKey, headerName);
        if (group) headers['X-Group'] = group;

        // Build parts array with clean prompt (no aspect ratio string)
        const parts: any[] = [{ text: prompt }];
        processedReferences?.forEach((img) => {
          if (img?.data) {
            let base64Data = img.data;
            let mimeType = img.mimeType || 'image/png';
            if (img.data.startsWith('data:')) {
              const matches = img.data.match(/^data:(.+);base64,(.+)$/);
              if (matches) { mimeType = matches[1]; base64Data = matches[2]; }
            }
            if (!img.data.startsWith('http') && !img.data.startsWith('blob:')) {
              parts.push({ inlineData: { mimeType, data: base64Data } });
            }
          }
        });

        // Create Image Generation Configuration
        const generationConfig: any = {
          responseModalities: ["TEXT", "IMAGE"]
        };

        // Gemini Image models use imageConfig with camelCase
        const imageConfig: any = {};

        if (aspectRatio && aspectRatio !== AspectRatio.AUTO) {
          imageConfig.aspectRatio = aspectRatio;
        }

        // ⚠️ 只有 gemini-3-pro-image-preview 支持 imageSize
        // gemini-2.5-flash-image 不支持此参数
        if (imageSize && model.includes('gemini-3-pro-image')) {
          imageConfig.imageSize = imageSize;
        }

        if (Object.keys(imageConfig).length > 0) {
          generationConfig.imageConfig = imageConfig;
        }

        const tools = enableGrounding ? [{ googleSearch: {} }] : undefined;

        // Construct payload dynamically to avoid sending empty objects/undefined keys
        const payload: any = {
          contents: [{ role: 'user', parts }]
        };

        if (generationConfig && Object.keys(generationConfig).length > 0) {
          payload.generationConfig = generationConfig;
        }

        if (tools) {
          payload.tools = tools;
        }

        const response = await fetchWithTimeout(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        }, 300000, controller?.signal);

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        result = await response.json();
        const inlineData = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;

        if (inlineData) {
          if (keyId) {
            keyManager.reportSuccess(keyId);
            const { cost, tokens } = costService.calculateCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt.length, processedReferences?.length || 0);
            keyManager.addUsage(keyId, tokens);
            keyManager.addCost(keyId, cost);
            costService.recordCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt, processedReferences?.length || 0);
            usageData = { tokens, cost };
          }
          return { url: `data:image/png;base64,${inlineData.data}`, ...usageData };
        }
        throw new Error("No image data in Gemini response");
      }
      // -----------------------------------------------------------------------
      // CASE 3: Standard OpenAI Image API (Default)
      // -----------------------------------------------------------------------
      else {
        const apiUrl = `${cleanBase}/v1/images/generations`;
        const size = mapToOpenAISize(aspectRatio, imageSize, model);
        const requestBody = {
          model: model,
          prompt: prompt,
          n: 1,
          size: size,
          response_format: 'b64_json'
        };
        const headers = buildProxyHeaders(authMethod, effectiveKey, headerName, group);

        let response;
        try {
          response = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
          }, 300000, controller?.signal);
        } catch (netErr) {
          throw netErr;
        }

        // >>> AUTO-FALLBACK LOGIC <<<
        // If 404/405 (Method Not Allowed), switch to Chat Mode immediately
        if (response.status === 404 || response.status === 405) {
          console.log(`[GenService] Image endpoint ${response.status}, switching to Chat Mode (Auto-Fallback)...`);
          apiFormat = 'openai-chat-compat';
          attempt--; // Retry immediately
          continue;
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${response.status}`;

          // Retry without response_format if not supported
          if (errMsg.toLowerCase().includes('response_format') || errMsg.toLowerCase().includes('b64_json')) {
            const fallbackBody = { ...requestBody } as Record<string, any>;
            delete fallbackBody.response_format;
            response = await fetchWithTimeout(apiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(fallbackBody)
            }, 300000, controller?.signal);
          } else {
            // Fallback to backend if quota exhausted
            const shouldFallback = await getFallbackFlag();
            if (shouldFallback && (errMsg.toLowerCase().includes('quota') || (errData?.error?.code ?? '').toString().toLowerCase().includes('quota'))) {
              return await generateImageViaBackend(prompt, aspectRatio, imageSize, processedReferences, model, apiKey, requestId);
            }
            throw new Error(errMsg);
          }
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        result = await response.json();
        const b64 = result.data?.[0]?.b64_json;

        if (b64) {
          if (keyId) {
            keyManager.reportSuccess(keyId);
            const { cost, tokens } = costService.calculateCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt.length, 0);
            keyManager.addUsage(keyId, tokens);
            keyManager.addCost(keyId, cost);
            costService.recordCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt, 0);
            usageData = { tokens, cost };
          }
          return { url: `data:image/png;base64,${b64}`, ...usageData };
        }

        if (result.data?.[0]?.url) {
          const imageUrl = result.data[0].url;
          if (!imageUrl.startsWith('http')) throw new Error("Invalid URL protocol: " + imageUrl);

          const imgRes = await fetch(imageUrl);
          const blob = await imgRes.blob();
          const reader = new FileReader();
          return new Promise((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              const mimeType = blob.type || 'image/png';
              if (keyId) {
                keyManager.reportSuccess(keyId);
                const { cost, tokens } = costService.calculateCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt.length, 0);
                keyManager.addUsage(keyId, tokens);
                keyManager.addCost(keyId, cost);
                costService.recordCost(model, imageSize || ImageSize.SIZE_1K, 1, prompt, 0);
              }
              resolve({ url: `data:${mimeType};base64,${base64}`, ...usageData });
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
        throw new Error("No image data in OpenAI images response");
      }

    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Generation cancelled') throw error;

      console.warn(`[GenService] Error attempt ${attempt + 1}:`, error.message);
      logError('GeminiService', error, `model=${model} format=${lastFormat || 'unknown'} baseUrl=${baseUrl} provider=${provider}`);

      if (keyId) {
        keyManager.reportFailure(keyId, error.message);
        const nextKey = keyManager.getNextKey(model);
        if (nextKey && nextKey.id !== keyId) {
          keyId = nextKey.id;
          effectiveKey = nextKey.key;
          baseUrl = nextKey.baseUrl || GOOGLE_API_BASE;
          authMethod = nextKey.authMethod;
          headerName = nextKey.headerName;
          provider = nextKey.provider || provider;
          group = nextKey.group;
          compatibilityMode = (nextKey as any).compatibilityMode || 'standard';
        } else {
          break;
        }
      } else {
        break;
      }
      lastError = error;
    }
  }

  throw normalizeError(lastError || new Error("Image generation failed"));
};

export const generateVideo = async (
  prompt: string,
  model: string,
  apiKey: string = '',
  requestId?: string
): Promise<string> => {
  // Placeholder for Video Generation
  console.log('[GeminiService] generateVideo called', { prompt, model });
  // Simulate delay
  await new Promise(r => setTimeout(r, 2000));
  throw new Error("Video generation is not yet fully implemented for model: " + model);
};

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  try {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { method: 'GET' },
      15000
    );
    return response.ok;
  } catch (error) {
    return false;
  }
};

/**
 * Generate text conversation (Chat) using Gemini API
 * Supports third-party API proxies via baseUrl configuration
 * Now supports multimodal input (images, videos, audio)
 */
export const generateText = async (
  messages: { role: 'user' | 'assistant', content: string }[],
  model: string,
  apiKey: string = '',
  inlineData?: { mimeType: string; data: string }[] // 多媒体数据
): Promise<string> => {
  let effectiveKey = apiKey;
  let keyId: string | undefined;
  // Proxy configuration (defaults to Google official)
  let baseUrl = GOOGLE_API_BASE;
  let authMethod: AuthMethod = 'query';
  let headerName = 'x-goog-api-key';
  let group: string | undefined;

  // Key Selection
  if (!effectiveKey) {
    const keyData = keyManager.getNextKey(model);
    if (keyData) {
      effectiveKey = keyData.key;
      keyId = keyData.id;
      // Capture proxy configuration
      baseUrl = keyData.baseUrl || GOOGLE_API_BASE;
      authMethod = keyData.authMethod;
      headerName = keyData.headerName;
      group = keyData.group;
    } else {
      effectiveKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    }
  }

  if (!effectiveKey) throw new Error("MISSING_API_KEY");

  // Chat Logic...
  const MAX_ATTEMPTS = 3; // Retry fewer times for chat to be responsive
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!effectiveKey) break;

    try {
      // Map 'assistant' role to 'model' for API
      // 构建contents,最后一条用户消息包含多媒体数据
      const contents = messages.map((m, idx) => {
        const isLastUserMessage = m.role === 'user' && idx === messages.length - 1;
        const parts: any[] = [{ text: m.content }];

        // 如果是最后一条用户消息且有多媒体数据,添加到parts
        if (isLastUserMessage && inlineData && inlineData.length > 0) {
          inlineData.forEach(media => {
            parts.push({ inlineData: { mimeType: media.mimeType, data: media.data } });
          });
        }

        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts
        };
      });

      const headers = buildHeaders(authMethod, effectiveKey, headerName);
      if (group) {
        headers['X-Group'] = group;
      }
      const response = await fetchWithTimeout(
        buildApiUrl(baseUrl, model, 'generateContent', authMethod, effectiveKey),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ contents }),
        },
        120000
      ); // 120s timeout

      // Update Quota (if using managed key)
      if (keyId) {
        const limit = response.headers.get('x-ratelimit-limit-requests');
        const remaining = response.headers.get('x-ratelimit-remaining-requests');
        const reset = response.headers.get('x-ratelimit-reset-requests');
        if (limit || remaining) {
          keyManager.updateQuota(keyId, {
            limitRequests: parseInt(limit || '0'),
            remainingRequests: parseInt(remaining || '0'),
            resetConstant: reset || '',
            resetTime: Date.now() + ((parseInt(reset || '0')) * 1000),
            updatedAt: Date.now()
          });
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const candidate = result.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;

      if (text) {
        if (keyId) {
          keyManager.reportSuccess(keyId);
          // Estimate chat tokens (very rough approximation: 1 char ~ 0.25 token)
          // Input + Output
          const inputLen = messages.reduce((acc, m) => acc + m.content.length, 0);
          const outputLen = text.length;
          const tokens = Math.ceil((inputLen + outputLen) * 0.3);
          keyManager.addUsage(keyId, tokens);
        }
        return text;
      }

      throw new Error("No text response from model");

    } catch (error: any) {
      console.warn(`[Gemini Chat] Attempt ${attempt + 1} failed:`, error.message);

      if (keyId) {
        keyManager.reportFailure(keyId, error.message);
        // Rotate key (with proxy config)
        const nextKeyStruct = keyManager.getNextKey(model);
        if (nextKeyStruct) {
          effectiveKey = nextKeyStruct.key;
          keyId = nextKeyStruct.id;
          // Update proxy config
          baseUrl = nextKeyStruct.baseUrl || GOOGLE_API_BASE;
          authMethod = nextKeyStruct.authMethod;
          headerName = nextKeyStruct.headerName;
          group = nextKeyStruct.group;
        } else {
          break;
        }
      } else {
        break;
      }
      lastError = error;
    }
  }

  if (lastError) throw normalizeError(lastError);
  throw new Error("Chat generation failed");
};

/**
 * Test a specific channel configuration functionality
 */
export const testChannelConfig = async (
  config: { apiKey: string, baseUrl: string, model: string, compatibilityMode: 'standard' | 'chat', provider: string }
): Promise<{ success: boolean; message: string; details?: any }> => {
  try {
    const prompt = "Test connection";
    const model = config.model || 'gpt-3.5-turbo'; // Default if empty
    const isChatMode = config.compatibilityMode === 'chat';

    const url = normalizeProxyBaseUrl(config.baseUrl) || config.baseUrl.replace(/\/$/, '');
    const inferredAuthMethod: AuthMethod = config.provider === 'Google' ? 'query' : 'header';
    const inferredHeaderName = config.provider === 'Google' ? 'x-goog-api-key' : 'Authorization';

    const endpoint = isChatMode
      ? `${url}/v1/chat/completions`
      : (config.provider === 'Google' ? buildApiUrl(config.baseUrl, model, 'generateContent', 'query', config.apiKey) : `${url}/v1/images/generations`);

    // Simplified test request
    // If Chat format, try a simple chat
    if (isChatMode) {
      const res = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: buildProxyHeaders(inferredAuthMethod, config.apiKey, inferredHeaderName),
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
          max_tokens: 5
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || res.statusText);
      }
      return { success: true, message: "Connected to Chat Endpoint successfully!" };
    } else {
      // Standard Image: Use list models as a proxy for "Connection OK".
      const listUrl = config.provider === 'Google'
        ? `${url}/v1beta/models?key=${config.apiKey}`
        : `${url}/v1/models`;
      const res = await fetch(listUrl, { headers: buildProxyHeaders(inferredAuthMethod, config.apiKey, inferredHeaderName) });
      if (res.ok) return { success: true, message: "Connection verified (Models listed)" };

      if (res.status === 404 || res.status === 405) {
        return { success: false, message: "Could not list models. Creating a real test generation is recommended." };
      }
      throw new Error(`Connection failed: ${res.status}`);
    }
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};
