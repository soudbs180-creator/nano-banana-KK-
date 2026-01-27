import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize, ModelType, ReferenceImage, GenerationMode } from "../types";
import { keyManager } from './keyManager';
import * as costService from './costService';
import { AuthMethod, buildApiUrl, buildHeaders, GOOGLE_API_BASE } from './apiConfig';
import { ProxyModelConfig } from './proxyModelConfig';

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
function detectApiFormat(baseUrl: string): 'openai' | 'gemini' {
  const url = baseUrl.toLowerCase();
  if (url.includes('googleapis.com') || url.includes('google.com')) return 'gemini';
  // Check for common OpenAI-compatible proxy signatures or explicit newapi/oneapi patterns
  if (url.includes('newapi') || url.includes('oneapi') || url.includes('v1/images')) return 'openai';
  // Default to OpenAI format for custom proxies unless it looks like Gemini
  return 'openai';
}

/**
 * Cancel a specific generation request
 */
export const cancelGeneration = (id: string) => {
  const controller = abortControllers.get(id);
  if (controller) {
    controller.abort();
    abortControllers.delete(id);
  }
};

/**
 * 模型 ID 映射表
 * 将内部模型名称映射到 Google API 实际模型 ID
 */
function mapToApiModelId(internalId: string, isProxyApi: boolean = false): string {
  // 如果是第三方代理 API (如 NewAPI)，可能需要不同的模型名称
  // Google 官方 API 模型映射
  const modelMap: Record<string, string> = {
    // Nano Banana 系列 - 内部代号映射到 Google 官方模型
    'nano-banana': 'gemini-2.5-flash-image',          // 快速图像生成
    'nano-banana-pro': 'gemini-3-pro-image-preview',  // 高质量图像生成

    // 标准 Gemini Image 模型 (直接透传)
    'gemini-2.5-flash-image': 'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview': 'gemini-3-pro-image-preview',

    // Imagen 4 系列 (直接透传)
    'imagen-4.0-generate-001': 'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001': 'imagen-4.0-ultra-generate-001',
    'imagen-4.0-fast-generate-001': 'imagen-4.0-fast-generate-001',
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
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) return new Error("网络连接失败，请检查您的网络设置");
  return new Error(`生成失败: ${error.message || '未知错误'}`);
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
      [AspectRatio.LANDSCAPE_16_9]: '2048x1152',
      [AspectRatio.PORTRAIT_9_16]: '1152x2048',
      [AspectRatio.PORTRAIT_9_21]: '1080x2520',
    }
  };

  return sizeMap[imageSize]?.[aspectRatio] || sizeMap['1K'][aspectRatio] || '1024x1024';
}

async function generateImageViaBackend(
  prompt: string, aspectRatio: AspectRatio, imageSize: ImageSize, referenceImages: ReferenceImage[],
  model: ModelType, apiKey: string, requestId?: string
): Promise<string> {
  const controller = requestId ? abortControllers.get(requestId) : undefined;
  if (controller?.signal.aborted) throw new Error('Generation cancelled');

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
    if (data.success && data.imageData) return `data:${data.mimeType || "image/png"};base64,${data.imageData}`;
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
): Promise<string> => {
  // Defensive: Strip '-4k' suffix globally if present
  if (model.toLowerCase().endsWith('-4k')) {
    model = model.replace(/-4k$/i, '') as ModelType;
  }

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

  // If no explicit API key, ask KeyManager
  if (!effectiveKey) {
    const keyData = keyManager.getNextKey(model);
    if (keyData) {
      effectiveKey = keyData.key;
      keyId = keyData.id;
      baseUrl = keyData.baseUrl || GOOGLE_API_BASE;
      authMethod = keyData.authMethod;
      headerName = keyData.headerName;
      // provider is not in the minimal result, but we can infer or if we updated getNextKey to return it (recommended)
      // For now, assume if baseUrl is default -> Google, else -> Custom/Proxy
      provider = (baseUrl.includes('googleapis.com') || !baseUrl) ? 'Google' : 'Custom';
    } else {
      // Fallback: Check env var (only for basic local setup)
      if (import.meta.env.VITE_GEMINI_API_KEY) {
        effectiveKey = import.meta.env.VITE_GEMINI_API_KEY;
        // Provider stays Google default
      }
    }
  }

  // If still no key, fallback to backend (if not local dev with no key)
  if (!effectiveKey) {
    return await generateImageViaBackend(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, requestId);
  }

  // 2. Retry Loop
  const MAX_ATTEMPTS = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      if (controller?.signal.aborted) throw new Error('Generation cancelled');

      // Determine API Format
      const apiFormat = detectApiFormat(baseUrl);

      console.log(`[GenService] Attempt ${attempt + 1} | Model: ${model} | Format: ${apiFormat} | BaseURL: ${baseUrl}`);

      if (apiFormat === 'gemini') {
        // --- GEMINI FORMAT (Official / Vertex / Gemini Proxy) ---

        // Prepare contents
        const parts: any[] = [{ text: prompt }];
        referenceImages?.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));

        // Prepare Config
        const generationConfig: any = { responseModalities: ['TEXT', 'IMAGE'] };

        // Tools (Grounding)
        const supportsTools = !model.includes('gemini-2.5-flash-image') && !model.includes('nano-banana');
        const tools = (enableGrounding && supportsTools) ? [{ googleSearch: {} }] : undefined;

        // Image Config
        generationConfig.imageConfig = {};
        if (aspectRatio) generationConfig.imageConfig.aspectRatio = aspectRatio;
        const isFlashModel = model === 'nano-banana' || model.includes('gemini-2.5-flash-image');
        if (!isFlashModel && imageSize && imageSize !== '1K') {
          generationConfig.imageConfig.imageSize = imageSize;
        }

        // Map Model ID (important for aliases like nano-banana)
        // If it's a proxy (custom base url), we usually keep original ID unless we have specific mapping logic
        const isProxy = provider !== 'Google';
        const apiModelId = mapToApiModelId(model, isProxy);

        const apiUrl = buildApiUrl(baseUrl, apiModelId, 'generateContent', authMethod, effectiveKey);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: buildHeaders(authMethod, effectiveKey, headerName),
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig,
            tools
          }),
          signal: controller?.signal || AbortSignal.timeout(300000)
        });

        // Update Quota
        if (keyId) {
          const limit = response.headers.get('x-ratelimit-limit-requests');
          const remaining = response.headers.get('x-ratelimit-remaining-requests');
          if (limit || remaining) {
            keyManager.updateQuota(keyId, {
              limitRequests: parseInt(limit || '0'),
              remainingRequests: parseInt(remaining || '0'),
              resetTime: Date.now() + 60000, // Estimate 1 min reset if not provided
              updatedAt: Date.now()
            });
          }
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        const inlineData = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;

        if (inlineData) {
          if (keyId) {
            keyManager.reportSuccess(keyId);
            const { cost, tokens } = costService.calculateCost(model, imageSize || '1K', 1, prompt.length, referenceImages?.length || 0);
            keyManager.addUsage(keyId, tokens);
            keyManager.addCost(keyId, cost);
            costService.recordCost(model, imageSize || '1K', 1, prompt, referenceImages?.length || 0);
          }
          return `data:image/png;base64,${inlineData.data}`;
        }
        throw new Error("No image data in Gemini response");

      } else {
        // --- OPENAI FORMAT (NewAPI / OneAPI / OpenAI) ---
        // Clean URL
        let cleanBase = baseUrl.trim().replace(/\/$/, '');
        if (cleanBase.endsWith('/v1')) cleanBase = cleanBase.substring(0, cleanBase.length - 3);
        const apiUrl = `${cleanBase}/v1/images/generations`;

        const size = mapToOpenAISize(aspectRatio, imageSize, model);

        const requestBody = {
          model: model,
          prompt: prompt,
          n: 1,
          size: size,
          response_format: 'b64_json'
        };

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${effectiveKey}`,
            'x-goog-api-key': effectiveKey // Sometimes needed
          },
          body: JSON.stringify(requestBody),
          signal: controller?.signal || AbortSignal.timeout(300000)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        const b64 = result.data?.[0]?.b64_json;
        if (b64) {
          if (keyId) {
            keyManager.reportSuccess(keyId);
            // Assume similar price logging for compatibility
            const { cost, tokens } = costService.calculateCost(model, imageSize || '1K', 1, prompt.length, 0);
            keyManager.addUsage(keyId, tokens);
            keyManager.addCost(keyId, cost);
            costService.recordCost(model, imageSize || '1K', 1, prompt, 0);
          }
          return `data:image/png;base64,${b64}`;
        }

        // Handle URL fallback
        if (result.data?.[0]?.url) {
          // ... fetch url logic ...
          // For brevity, assuming B64 preferred or simple fetch
          const imgRes = await fetch(result.data[0].url);
          const blob = await imgRes.blob();
          const reader = new FileReader();
          return new Promise((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              if (keyId) keyManager.reportSuccess(keyId);
              resolve(`data:image/png;base64,${base64}`);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }

        throw new Error("No image data in OpenAI response");
      }

    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Generation cancelled') throw error;

      console.warn(`[GenService] Error attempt ${attempt + 1}:`, error.message);

      if (keyId) {
        keyManager.reportFailure(keyId, error.message);
        // Rotate Key
        const nextKey = keyManager.getNextKey(model);
        if (nextKey && nextKey.id !== keyId) {
          keyId = nextKey.id;
          effectiveKey = nextKey.key;
          baseUrl = nextKey.baseUrl || GOOGLE_API_BASE;
          authMethod = nextKey.authMethod;
          headerName = nextKey.headerName;
        } else {
          // No more keys
          break;
        }
      } else {
        break; // Env key failed, no rotation
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
  if (isLocalDev) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      await ai.models.get({ model: 'models/gemini-1.5-flash' });
      return true;
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      return !(msg.includes('403') || msg.includes('401') || msg.includes('permission'));
    }
  }
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "test", aspectRatio: "1:1", model: "imagen-3.0-generate-001", referenceImages: [], apiKey }),
    });
    return response.status !== 403;
  } catch { return true; }
};

/**
 * Generate text conversation (Chat) using Gemini API
 * Supports third-party API proxies via baseUrl configuration
 */
export const generateText = async (
  messages: { role: 'user' | 'assistant', content: string }[],
  model: string,
  apiKey: string = ''
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

  const MAX_ATTEMPTS = 3; // Retry fewer times for chat to be responsive
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!effectiveKey) break;

    try {
      // Map 'assistant' role to 'model' for API
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const headers = buildHeaders(authMethod, effectiveKey, headerName);
      if (group) {
        headers['X-Group'] = group;
      }
      const response = await fetch(
        buildApiUrl(baseUrl, model, 'generateContent', authMethod, effectiveKey),
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ contents }),
          signal: AbortSignal.timeout(120000) // 120s timeout for chat (Increased for complex tasks)
        }
      );

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
