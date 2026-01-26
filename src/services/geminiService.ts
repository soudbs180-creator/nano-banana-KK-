import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize, ModelType, ReferenceImage, GenerationMode, ApiLineMode } from "../types";
import { keyManager } from './keyManager';
import * as costService from './costService';
import { AuthMethod, buildApiUrl, buildHeaders, GOOGLE_API_BASE } from './apiConfig';

// Detect environment
const isLocalDev = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Backend API endpoint for cloud deployment
const API_ENDPOINT = "/api/generate";

/**
 * Generate image using Gemini API
 * - Local dev: Calls Gemini SDK directly (faster)
 * - Production: Routes through backend (secure)
 * - apiKey is optional: backend will use stored keys or env variable
 * - Supports third-party API proxies via baseUrl configuration
 */

// AbortController map to track active requests
const abortControllers = new Map<string, AbortController>();

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
 * 
 * 参考官方文档: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
 * 
 * Gemini 原生图像生成模型:
 * - gemini-2.5-flash-image (Nano Banana) - 快速图像生成
 * - gemini-3-pro-image-preview (Nano Banana Pro) - 高质量图像生成
 * 
 * Imagen 系列:
 * - imagen-4.0-generate-001 (标准)
 * - imagen-4.0-ultra-generate-001 (超高质量)
 * - imagen-4.0-fast-generate-001 (快速)
 */
function mapToApiModelId(internalId: string, isProxyApi: boolean = false): string {
  // 如果是第三方代理 API (如 NewAPI)，可能需要不同的模型名称
  if (isProxyApi) {
    // 第三方代理通常直接使用原始模型名称
    return internalId;
  }

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

  return modelMap[normalizedId] || normalizedId; // 未匹配的直接透传
}

/**
 * Calculate estimated token usage for image generation
 * 参考: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
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
 * Reference: https://docs.newapi.pro/zh/docs
 */
// Helper to map aspect ratio to DALL-E 3 supported sizes
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

/**
 * Generate image via Proxy API (supports OpenAI or Gemini format)
 */
async function generateImageViaProxy(
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  model: string,
  requestId?: string
): Promise<string> {
  // Get proxy key from keyManager
  const keyData = keyManager.getNextKey('proxy');
  if (!keyData) {
    throw new Error("没有可用的中转代理 API Key，请在设置中添加并配置模型");
  }

  // Lookup model config to determine API Format
  const proxyModels = keyManager.getAvailableProxyModels();
  const modelConfig = proxyModels.find(m => m.id === model);
  if (!modelConfig) {
    throw new Error('代理模型未配置：请在 API 设置中添加该模型后再试');
  }
  const proxyBaseUrl = keyData.baseUrl.trim();
  const isGoogleBase = proxyBaseUrl.includes('googleapis.com');
  const apiFormat = modelConfig.apiFormat || (isGoogleBase ? 'gemini' : 'openai');

  const controller = requestId ? abortControllers.get(requestId) : undefined;
  if (controller?.signal.aborted) {
    throw new Error('Generation cancelled');
  }

  // Build base URL (remove trailing slash and whitespace)
  let baseUrl = keyData.baseUrl.trim().replace(/\/$/, '');

  // For Gemini format, we need the root domain, not the /v1 suffix that users often copy
  // Example: user enters "https://api.example.com/v1", we need "https://api.example.com/v1beta/..."
  if (apiFormat === 'gemini') {
    if (baseUrl.endsWith('/v1')) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 3);
    } else if (baseUrl.endsWith('/v1beta')) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 7);
    }
  }

  if (!baseUrl) {
    throw new Error("代理服务器地址 (Base URL) 未配置，请在设置中完善");
  }
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }

  // Decide Endpoint and Body based on Format
  let apiUrl = '';
  let requestMethod = 'POST';
  let requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${keyData.key}` // Standard Proxy Auth
  };
  let requestBody: any = {};

  if (apiFormat === 'gemini') {
    // Gemini Format: /v1beta/models/{model}:generateContent
    apiUrl = `${baseUrl}/v1beta/models/${model}:generateContent`;

    // Construct Generation Config with Image params
    const generationConfig: any = {
      responseMimeType: "image/jpeg"
    };

    // Inject Aspect Ratio / Size if applicable
    if (aspectRatio && aspectRatio !== AspectRatio.SQUARE) {
      if (!generationConfig.imageConfig) generationConfig.imageConfig = {};
      generationConfig.imageConfig.aspectRatio = aspectRatio;
    }

    if (imageSize && imageSize !== '1K') {
      if (!generationConfig.imageConfig) generationConfig.imageConfig = {};
      generationConfig.imageConfig.imageSize = imageSize;
    }

    requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig
    };

    // Some proxies might require x-goog-api-key header instead/also
    requestHeaders['x-goog-api-key'] = keyData.key;

    console.log(`[Proxy] Generating image via Gemini format: ${apiUrl}`);
  } else {
    // OpenAI Format (Default): /v1/images/generations
    apiUrl = `${baseUrl}/v1/images/generations`;
    const size = mapToOpenAISize(aspectRatio, imageSize, model);

    requestBody = {
      model,
      prompt,
      n: 1,
      size,
      response_format: 'b64_json'
    };

    console.log(`[Proxy] Generating image via OpenAI format: ${apiUrl}`);
    console.log(`[Proxy] Model: ${model}, Size: ${size}`);
  }

  const MAX_ATTEMPTS = 3;
  let lastError: any = null;
  let currentKeyData = keyData;

  // Defensive: Strip '-4k' suffix if present in model ID (case insensitive)
  // This prevents issues where '4K' size selection might have inadvertently leaked into the model ID
  if (apiUrl.includes(model)) {
    const cleanModel = model.replace(/-4k$/i, '');
    if (cleanModel !== model) {
      console.log(`[Proxy] Auto-corrected model ID: ${model} -> ${cleanModel}`);
      apiUrl = apiUrl.replace(model, cleanModel);
      // Also update body if needed
      if (requestBody.model === model) {
        requestBody.model = cleanModel;
      }
    }
  } else if (requestBody.model) {
    const cleanModel = requestBody.model.replace(/-4k$/i, '');
    if (cleanModel !== requestBody.model) {
      console.log(`[Proxy] Auto-corrected model ID body: ${requestBody.model} -> ${cleanModel}`);
      requestBody.model = cleanModel;
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: requestMethod,
        headers: {
          ...requestHeaders,
          'Authorization': `Bearer ${currentKeyData.key}` // Ensure fresh key on rotate
        },
        body: JSON.stringify(requestBody),
        signal: controller?.signal || AbortSignal.timeout(180000) // 3 minutes timeout
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const result = await response.json();

      // Handle Response based on Format
      let imageData: string | undefined;

      if (apiFormat === 'gemini') {
        // Gemini Response
        imageData = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;

        if (!imageData && result.data?.[0]?.b64_json) {
          imageData = result.data[0].b64_json;
        }
      } else {
        // OpenAI Response
        imageData = result.data?.[0]?.b64_json;

        // Handle URL response (NewAPI/MJ fallback)
        if (!imageData && result.data?.[0]?.url) {
          console.log("Got URL response, fetching image...");
          const imageUrl = result.data[0].url;
          try {
            const imgRes = await fetch(imageUrl);
            const blob = await imgRes.blob();
            // Convert blob to base64
            imageData = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
              };
              reader.readAsDataURL(blob);
            });
          } catch (err) {
            console.error("Failed to fetch image from URL:", err);
          }
        }
      }

      if (imageData) {
        // Report success
        keyManager.reportSuccess(currentKeyData.id);
        return `data:image/png;base64,${imageData}`;
      }

      throw new Error("未能从代理获取图片数据 (No Image Data)");

    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Generation cancelled') {
        throw new Error('任务已取消');
      }

      console.warn(`[Proxy] Attempt ${attempt + 1} failed:`, error.message);
      keyManager.reportFailure(currentKeyData.id, error.message);

      // Try to get next proxy key
      const nextKey = keyManager.getNextKey('proxy');
      if (nextKey && nextKey.id !== currentKeyData.id) {
        currentKeyData = nextKey;
        // Should really update apiUrl base base if key changes, but we assume same proxy provider for simplicity OR we should rebuild apiUrl
        // Rebuilding apiUrl:
        const newBase = currentKeyData.baseUrl.replace(/\/$/, '');
        if (apiFormat === 'gemini') apiUrl = `${newBase}/v1beta/models/${model}:generateContent`;
        else apiUrl = `${newBase}/v1/images/generations`;
      } else {
        lastError = error;
        break;
      }

      lastError = error;
    }
  }

  throw normalizeError(lastError || new Error("代理图片生成失败"));
}


async function generateImageDirect(
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string,
  requestId?: string,
  enableGrounding: boolean = false,
  lineMode: ApiLineMode = 'google_direct'
): Promise<string> {
  // Route to proxy if lineMode is 'proxy'
  if (lineMode === 'proxy') {
    return generateImageViaProxy(prompt, aspectRatio, imageSize, model, requestId);
  }

  let effectiveKey = apiKey;
  let keyId: string | undefined;
  let controller: AbortController | undefined;
  // Proxy configuration (defaults to Google official)
  let baseUrl = GOOGLE_API_BASE;
  let authMethod: AuthMethod = 'query';
  let headerName = 'x-goog-api-key';

  // Use provided requestId's controller if available
  if (requestId) {
    controller = abortControllers.get(requestId);
  }

  // Key Rotation Logic if no specific key provided
  if (!effectiveKey) {
    // For google_direct mode, only use Google official keys
    const keyData = keyManager.getNextKey('google');

    if (keyData) {
      effectiveKey = keyData.key;
      keyId = keyData.id;
      // Capture proxy configuration
      baseUrl = keyData.baseUrl;
      authMethod = keyData.authMethod;
      headerName = keyData.headerName;
    } else {
      throw new Error("没有可用的 Google 官方 API Key，请检查设置");
    }
  }

  if (!effectiveKey) throw new Error("MISSING_API_KEY");

  // Robust Failover: Try up to 50 times (effectively "infinite" for typical key counts)
  // keyManager will automatically disable keys after X failures, ensuring we eventually rotate through all or fail.
  const MAX_ATTEMPTS = 50;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // If we don't have a key (and logic above didn't find one), break.
    if (!effectiveKey) break;

    try {
      if (requestId && controller?.signal.aborted) {
        throw new Error('Generation cancelled');
      }

      console.log(`[Gemini] Attempt ${attempt + 1}/${MAX_ATTEMPTS} using key ${keyId || 'env'}`);

      // 检查是否为 Imagen (通过 predict 接口)
      const isImagen = model.startsWith('imagen-');

      if (isImagen) {
        let safeAspectRatio = aspectRatio;
        if (aspectRatio === AspectRatio.LANDSCAPE_21_9) safeAspectRatio = AspectRatio.LANDSCAPE_16_9;
        else if (aspectRatio === AspectRatio.STANDARD_2_3) safeAspectRatio = AspectRatio.PORTRAIT_9_16;
        else if (aspectRatio === AspectRatio.STANDARD_3_2) safeAspectRatio = AspectRatio.LANDSCAPE_16_9;

        const response = await fetch(
          buildApiUrl(baseUrl, model, 'predict', authMethod, effectiveKey),
          {
            method: 'POST',
            headers: buildHeaders(authMethod, effectiveKey, headerName),
            body: JSON.stringify({
              instances: [{ prompt }],
              parameters: { sampleCount: 1, aspectRatio: safeAspectRatio }
            }),
            signal: controller?.signal || AbortSignal.timeout(240000) // 4 minutes timeout
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // If 429/403, we should definitely retry
          throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();
        const prediction = result.predictions?.[0];

        if (prediction?.bytesBase64Encoded) {
          if (keyId) {
            keyManager.reportSuccess(keyId);
          }
          return `data:image/png;base64,${prediction.bytesBase64Encoded}`;
        }

        throw new Error("未能生成图片 (No Image Data)");

      } else {
        // Gemini Models
        // Gemini models (generateContent) do NOT support aspectRatio/imageSize in generationConfig
        // We must inject them into the prompt instead.
        // Gemini models (generateContent) DO support imageConfig since recent updates
        // so we don't need prompt injection anymore.
        const finalPrompt = prompt;

        const parts: any[] = [];
        if (finalPrompt) parts.push({ text: finalPrompt });
        if (referenceImages?.length > 0) {
          referenceImages.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
        }

        // Removed unsupported imageConfig logic for generateContent
        const imageConfig: any = {};

        const tools: any[] = [];
        // Gemini 2.5 Flash Image (Nano Banana) 不支持 Tools (Grounding)，会导致超时
        // 只有 Gemini 3 Pro / Nano Banana Pro 支持
        const supportsTools = !model.includes('gemini-2.5-flash-image') && !model.includes('nano-banana') && model !== 'gemini-2.0-flash-exp';

        if (enableGrounding && supportsTools) {
          tools.push({ googleSearch: {} });
        }

        // 检测是否使用第三方代理 API (非 Google 官方)
        const isProxyApi = !!(baseUrl && !baseUrl.includes('googleapis.com') && !baseUrl.includes('google.com'));

        // 使用映射后的 API 模型 ID
        const apiModelId = mapToApiModelId(model, isProxyApi);
        console.log(`[Gemini] Mapping model '${model}' -> '${apiModelId}' (Proxy: ${isProxyApi})`);

        // 构建 generationConfig - 必须包含 responseModalities 才能生成图像
        // 参考: https://ai.google.dev/gemini-api/docs/image-generation
        const generationConfig: any = {
          responseModalities: ['TEXT', 'IMAGE'],
        };

        // Gemini 3 Pro / Nano Banana Pro 及 Flash 等都支持 imageConfig 的 aspectRatio
        // 参考: https://ai.google.dev/gemini-api/docs/image-generation
        generationConfig.imageConfig = {};

        if (aspectRatio) {
          generationConfig.imageConfig.aspectRatio = aspectRatio;
        }

        // 仅 Pro / Ultra 模型支持 imageSize (Flash/Nano Banana 只有 1K)
        // 修复: 使用严格判断避免 nano-banana-pro 被误伤
        const isFlashModel = model === 'nano-banana' || model.includes('gemini-2.5-flash-image');

        if (!isFlashModel) {
          if (imageSize && imageSize !== '1K') {
            generationConfig.imageConfig.imageSize = imageSize; // 支持 "2K", "4K"
          }
        }

        const apiUrl = buildApiUrl(baseUrl, apiModelId, 'generateContent', authMethod, effectiveKey);
        console.log(`[Gemini] Requesting URL: ${apiUrl}`);

        let response: Response;
        try {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: buildHeaders(authMethod, effectiveKey, headerName),
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig,
              tools: tools.length > 0 ? tools : undefined
            }),
            signal: controller?.signal || AbortSignal.timeout(240000) // 4 minutes timeout
          });
        } catch (e) {
          // 超时或网络错误，尝试降级重试 (去掉 tools 或降低分辨率)
          console.warn("[Gemini] Request failed, retrying with simplified config...", e);

          // 降级配置：去掉 tools，强制 1K
          const simplifiedConfig = { ...generationConfig, imageSize: '1K' };

          response = await fetch(apiUrl, {
            method: 'POST',
            headers: buildHeaders(authMethod, effectiveKey, headerName),
            body: JSON.stringify({
              contents: [{ role: 'user', parts }],
              generationConfig: simplifiedConfig,
              // tools: undefined // 移除 tools
            }),
            signal: controller?.signal || AbortSignal.timeout(240000)
          });
        }

        // Update Quota
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
        const inlineData = candidate?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;

        if (inlineData) {
          if (keyId) {
            keyManager.reportSuccess(keyId);
            const tokens = calculateImageTokens(model);

            // Calculate cost details using CostService (Single Source of Truth)
            const { cost, tokens: calculatedTokens } = costService.calculateCost(
              model,
              imageSize || ImageSize.SIZE_1K,
              1,
              prompt.length,
              referenceImages?.length || 0
            );

            // 1. Sync to Key Usage
            keyManager.addUsage(keyId, calculatedTokens);
            keyManager.addCost(keyId, cost);

            // 2. Record Transaction (Global History)
            costService.recordCost(
              model,
              imageSize || ImageSize.SIZE_1K,
              1,
              prompt,
              referenceImages?.length || 0
            );
          }
          return `data:image/png;base64,${inlineData.data}`;
        }

        throw new Error("未能生成图片 (No Image Data)");
      }

    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Generation cancelled') throw new Error('Generation cancelled');

      console.warn(`[Gemini] Attempt ${attempt + 1} failed with key ${keyId || 'env'}:`, error.message);

      if (keyId) {
        keyManager.reportFailure(keyId, error.message || 'Unknown error');

        // IMMEDIATE GLOBAL ROTATION:
        // Get the NEXT available key (with its proxy config)
        const nextKeyStruct = keyManager.getNextKey();
        if (nextKeyStruct) {
          effectiveKey = nextKeyStruct.key;
          keyId = nextKeyStruct.id;
          // Update proxy config for next attempt
          baseUrl = nextKeyStruct.baseUrl;
          authMethod = nextKeyStruct.authMethod;
          headerName = nextKeyStruct.headerName;
        } else {
          console.error('[Gemini] No more keys available!');
          break; // No valid keys left
        }
      } else {
        // If using env key and it failed, we can't switch to anything else unless we have managed keys
        // If we had managed keys, we would have started with them.
        // So just break or retry logic? 
        // If we are here, it means we don't have managed keys. 
        break;
      }

      lastError = error;
    }
  }

  if (lastError) throw normalizeError(lastError);
  throw new Error("Unable to generate image after retries (All keys exhausted)");
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

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string = '',
  requestId?: string,
  enableGrounding: boolean = false,
  lineMode: ApiLineMode = 'google_direct'
): Promise<string> => {
  // Defensive: Strip '-4k' suffix globally if present
  // This ensures checking for '4K' size doesn't leak into model ID
  if (model.toLowerCase().endsWith('-4k')) {
    console.warn(`[GeminiService] Detected invalid suffix in model ID '${model}', stripping it.`);
    model = model.replace(/-4k$/i, '');
  }

  // Create AbortController if requestId provided
  if (requestId) {
    if (!abortControllers.has(requestId)) {
      abortControllers.set(requestId, new AbortController());
    }
  }

  // Route to proxy if lineMode is 'proxy'
  if (lineMode === 'proxy') {
    return generateImageViaProxy(prompt, aspectRatio, imageSize, model, requestId);
  }

  const hasClientKeys = keyManager.hasValidKeys() || !!apiKey || !!import.meta.env.VITE_GEMINI_API_KEY;

  if (hasClientKeys) {
    return await generateImageDirect(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, requestId, enableGrounding, lineMode);
  } else {
    // Fallback to backend only if no client keys
    return await generateImageViaBackend(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, requestId);
  }
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

  // Key Selection
  if (!effectiveKey) {
    const keyData = keyManager.getNextKey();
    if (keyData) {
      effectiveKey = keyData.key;
      keyId = keyData.id;
      // Capture proxy configuration
      baseUrl = keyData.baseUrl;
      authMethod = keyData.authMethod;
      headerName = keyData.headerName;
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

      const response = await fetch(
        buildApiUrl(baseUrl, model, 'generateContent', authMethod, effectiveKey),
        {
          method: 'POST',
          headers: buildHeaders(authMethod, effectiveKey, headerName),
          body: JSON.stringify({ contents }),
          signal: AbortSignal.timeout(30000) // 30s timeout for chat
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
        const nextKeyStruct = keyManager.getNextKey();
        if (nextKeyStruct) {
          effectiveKey = nextKeyStruct.key;
          keyId = nextKeyStruct.id;
          // Update proxy config
          baseUrl = nextKeyStruct.baseUrl;
          authMethod = nextKeyStruct.authMethod;
          headerName = nextKeyStruct.headerName;
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
