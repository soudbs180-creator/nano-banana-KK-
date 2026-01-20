import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize, ModelType, ReferenceImage } from "../types";
import { keyManager } from './keyManager';

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
 * Calculate estimated token usage for image generation
 */
function calculateImageTokens(model: ModelType): number {
  if (model === ModelType.NANO_BANANA) return 1290;
  if (model === ModelType.NANO_BANANA_PRO) return 1120;
  return 0;
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

async function generateImageDirect(
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string,
  requestId?: string,
  enableGrounding: boolean = false
): Promise<string> {
  let effectiveKey = apiKey;
  let keyId: string | undefined;
  let controller: AbortController | undefined;

  // Use provided requestId's controller if available
  if (requestId) {
    controller = abortControllers.get(requestId);
  }

  // Key Rotation Logic if no specific key provided
  if (!effectiveKey) {
    const keyData = keyManager.getNextKey();
    if (keyData) {
      effectiveKey = keyData.key;
      keyId = keyData.id;
    } else {
      // Try env var failover
      effectiveKey = import.meta.env.VITE_GEMINI_API_KEY || '';
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

      const isImagen = model.startsWith('imagen-');

      if (isImagen) {
        let safeAspectRatio = aspectRatio;
        if (aspectRatio === AspectRatio.LANDSCAPE_21_9) safeAspectRatio = AspectRatio.LANDSCAPE_16_9;
        else if (aspectRatio === AspectRatio.STANDARD_2_3) safeAspectRatio = AspectRatio.PORTRAIT_9_16;
        else if (aspectRatio === AspectRatio.STANDARD_3_2) safeAspectRatio = AspectRatio.LANDSCAPE_16_9;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${effectiveKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: safeAspectRatio }
          }),
          signal: controller?.signal || AbortSignal.timeout(45000)
        });

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
        const parts: any[] = [];
        if (prompt) parts.push({ text: prompt });
        if (referenceImages?.length > 0) {
          referenceImages.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } }));
        }

        const imageConfig: any = { aspectRatio };
        // Pass imageSize if model supports it (experimental) or just for completeness
        if (model === ModelType.NANO_BANANA_PRO || (imageSize && imageSize !== '1K')) {
          imageConfig.imageSize = imageSize;
        }

        const tools: any[] = [];
        if (enableGrounding) tools.push({ googleSearch: {} });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${effectiveKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { imageConfig },
            tools: tools.length > 0 ? tools : undefined
          }),
          signal: controller?.signal || AbortSignal.timeout(45000)
        });

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
            keyManager.addUsage(keyId, tokens);
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
        // Get the NEXT available key
        const nextKeyStruct = keyManager.getNextKey();
        if (nextKeyStruct) {
          effectiveKey = nextKeyStruct.key;
          keyId = nextKeyStruct.id;
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
  prompt: string, aspectRatio: AspectRatio, imageSize: ImageSize, referenceImages: ReferenceImage[],
  model: ModelType, apiKey: string = '', requestId?: string, enableGrounding: boolean = false
): Promise<string> => {
  // Create AbortController if requestId provided
  if (requestId) {
    if (!abortControllers.has(requestId)) {
      abortControllers.set(requestId, new AbortController());
    }
  }

  const hasClientKeys = keyManager.hasValidKeys() || !!apiKey || !!import.meta.env.VITE_GEMINI_API_KEY;

  if (hasClientKeys) {
    return await generateImageDirect(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, requestId, enableGrounding);
  } else {
    // Fallback to backend only if no client keys
    // But usually we prefer direct if possible.
    // If purely backend needed, we call backend.
    return await generateImageViaBackend(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, requestId);
  }
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
 */
export const generateText = async (
  messages: { role: 'user' | 'assistant', content: string }[],
  model: string,
  apiKey: string = ''
): Promise<string> => {
  let effectiveKey = apiKey;
  let keyId: string | undefined;

  // Key Selection
  if (!effectiveKey) {
    const keyData = keyManager.getNextKey();
    if (keyData) {
      effectiveKey = keyData.key;
      keyId = keyData.id;
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

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${effectiveKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal: AbortSignal.timeout(30000) // 30s timeout for chat
      });

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
        // Rotate key
        const nextKeyStruct = keyManager.getNextKey();
        if (nextKeyStruct) {
          effectiveKey = nextKeyStruct.key;
          keyId = nextKeyStruct.id;
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
