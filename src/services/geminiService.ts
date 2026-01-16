import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize, ModelType, ReferenceImage } from "../types";

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
 * Generate image using Gemini API
 * - Local dev: Calls Gemini SDK directly (faster)
 * - Production: Routes through backend (secure)
 * - apiKey is optional: backend will use stored keys or env variable
 */
export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string = '', // Optional
  requestId?: string // Optional ID for cancellation
): Promise<string> => {
  // Check availability of client-side keys
  const { keyManager } = await import('./keyManager');
  const hasClientKeys = keyManager.hasValidKeys() || !!apiKey || !!import.meta.env.VITE_GEMINI_API_KEY;

  // Create AbortController if requestId provided
  if (requestId) {
    const controller = new AbortController();
    abortControllers.set(requestId, controller);
  }

  try {
    // 1. Prioritize Client-Side Generation if keys are available
    if (hasClientKeys) {
      return await generateImageDirect(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, requestId);
    }

    // 2. If no client keys, try Backend (Server-Side Key)
    return await generateImageViaBackend(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, requestId);

  } catch (e: any) {
    // If Backend is missing (404), fallback to Direct (which validates keys and throws useful error)
    if (e.message.includes("Backend function not found") || e.message.includes("404")) {
      return await generateImageDirect(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, requestId);
    }
    throw e;
  } finally {
    // Cleanup controller
    if (requestId) {
      abortControllers.delete(requestId);
    }
  }
};

/**
 * Direct Gemini API call (for local development fallback)
 * Uses keyManager for multi-key rotation with automatic failover
 */
async function generateImageDirect(
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string,
  requestId?: string
): Promise<string> {
  // Check cancellation before starting
  if (requestId && abortControllers.get(requestId)?.signal.aborted) {
    throw new Error('Generation cancelled');
  }

  // Import keyManager dynamically to avoid circular dependencies
  const { keyManager } = await import('./keyManager');

  // Try to get API key from various sources
  let effectiveKey = apiKey;
  let keyId: string | null = null;
  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    attempts++;

    // If not first attempt or no initial key, get next key
    if ((!effectiveKey && attempts === 1) || attempts > 1) {
      // Try keyManager first (multi-key rotation)
      const nextKey = keyManager.getNextKey();
      if (nextKey) {
        effectiveKey = nextKey.key;
        keyId = nextKey.id;
        console.log(`[GeminiService] Using key from rotation (Attempt ${attempts}):`, keyId);
      }
    }

    if (!effectiveKey) {
      // Try environment variable as fallback
      effectiveKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    }

    if (!effectiveKey) {
      throw new Error("请先在设置中配置 API Key");
    }

    const controller = requestId ? abortControllers.get(requestId) : undefined;

    try {
      // Determine if this is an Imagen model (uses different API)
      const isImagen = model.startsWith('imagen-');

      if (isImagen) {
        // Imagen models use :predict endpoint with different payload
        // Imagen supports limited aspect ratios: 1:1, 9:16, 16:9, 4:3, 3:4
        let safeAspectRatio = aspectRatio;
        if (aspectRatio === AspectRatio.LANDSCAPE_21_9) safeAspectRatio = AspectRatio.LANDSCAPE_16_9;
        else if (aspectRatio === AspectRatio.STANDARD_2_3) safeAspectRatio = AspectRatio.PORTRAIT_9_16; // Closest vertical
        else if (aspectRatio === AspectRatio.STANDARD_3_2) safeAspectRatio = AspectRatio.LANDSCAPE_16_9; // Closest horizontal

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${effectiveKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: safeAspectRatio,
              // Add other Imagen-specific params if needed
            }
          }),
          signal: controller?.signal || AbortSignal.timeout(45000)
        });

        // Update Quota Information
        if (keyId) {
          const limitRequests = response.headers.get('x-ratelimit-limit-requests');
          const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
          const resetRequests = response.headers.get('x-ratelimit-reset-requests');

          if (limitRequests || remainingRequests) {
            const resetSeconds = resetRequests ? (parseInt(resetRequests) || 0) : 0;
            keyManager.updateQuota(keyId, {
              limitRequests: parseInt(limitRequests || '0'),
              remainingRequests: parseInt(remainingRequests || '0'),
              resetConstant: resetRequests || '',
              resetTime: Date.now() + (resetSeconds * 1000),
              updatedAt: Date.now()
            });
          }
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();

        // Imagen response format: predictions[].bytesBase64Encoded
        if (result.predictions && result.predictions.length > 0) {
          const imageBase64 = result.predictions[0].bytesBase64Encoded;
          if (imageBase64) {
            if (keyId) keyManager.reportSuccess(keyId);
            return `data:image/png;base64,${imageBase64}`;
          }
        }

        throw new Error("Imagen 未能生成图片");

      } else {
        // Gemini models use :generateContent endpoint
        const parts: any[] = [];
        if (prompt) parts.push({ text: prompt });

        // Add reference images if any
        if (referenceImages && referenceImages.length > 0) {
          referenceImages.forEach(img => {
            parts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.data,
              },
            });
          });
        }

        // Build config
        const imageConfig: any = { aspectRatio };
        if (model === ModelType.NANO_BANANA_PRO) {
          imageConfig.imageSize = imageSize;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${effectiveKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              imageConfig
            }
          }),
          signal: controller?.signal || AbortSignal.timeout(45000)
        });

        // Update Quota Information
        if (keyId) {
          const limitRequests = response.headers.get('x-ratelimit-limit-requests');
          const remainingRequests = response.headers.get('x-ratelimit-remaining-requests');
          const resetRequests = response.headers.get('x-ratelimit-reset-requests');

          if (limitRequests || remainingRequests) {
            const resetSeconds = resetRequests ? (parseInt(resetRequests) || 0) : 0;
            keyManager.updateQuota(keyId, {
              limitRequests: parseInt(limitRequests || '0'),
              remainingRequests: parseInt(remainingRequests || '0'),
              resetConstant: resetRequests || '',
              resetTime: Date.now() + (resetSeconds * 1000),
              updatedAt: Date.now()
            });
          }
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0) {
          for (const part of result.candidates[0].content?.parts || []) {
            if (part.inlineData) {
              if (keyId) keyManager.reportSuccess(keyId);
              return `data:image/png;base64,${part.inlineData.data}`;
            }
          }
        }

        throw new Error("未能生成图片");
      }
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Generation cancelled') {
        throw new Error('Generation cancelled');
      }

      console.error(`Attempt failed with key ${keyId || 'unknown'}:`, error);

      // Report failure to keyManager
      if (keyId) {
        keyManager.reportFailure(keyId, error.message || 'Unknown error');
      }

      lastError = error;
      // Continue loop
    }
  } // End of retry loop

  if (lastError) {
    throw normalizeError(lastError);
  }
  throw new Error("Unable to generate image after retries");
}

/**
 * Backend API call (for production)
 */
async function generateImageViaBackend(
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string,
  requestId?: string
): Promise<string> {
  // Check cancellation
  if (requestId && abortControllers.get(requestId)?.signal.aborted) {
    throw new Error('Generation cancelled');
  }

  // Try to get API key from localStorage if not provided
  let effectiveKey = apiKey;
  if (!effectiveKey) {
    try {
      const stored = localStorage.getItem('kk-api-keys-local');
      if (stored) {
        const keys = JSON.parse(stored) as string[];
        effectiveKey = keys.find(k => k && k.trim()) || '';
      }
    } catch (e) {
      console.warn('Failed to read keys from localStorage');
    }
  }

  try {
    const controller = requestId ? abortControllers.get(requestId) : undefined;

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        aspectRatio,
        imageSize,
        model,
        referenceImages: referenceImages.map(img => ({
          data: img.data,
          mimeType: img.mimeType,
        })),
        apiKey: effectiveKey, // Pass the key from localStorage
      }),
      signal: controller?.signal
    });

    // Handle non-OK responses first to avoid parsing empty bodies
    if (!response.ok) {
      // Try to parse error message, but fallback if empty
      let errorText = `Request failed: ${response.status} ${response.statusText}`;
      try {
        const errData = await response.json();
        if (errData && errData.error) errorText = errData.error;
      } catch (e) {
        // If body is empty or not JSON, stick to statusText
        if (response.status === 404) {
          errorText = "Backend function not found. (If local, make sure Netlify Dev is running)";
        }
      }
      throw new Error(errorText);
    }

    const data = await response.json();

    if (data.success && data.imageData) {
      return `data:${data.mimeType || "image/png"};base64,${data.imageData}`;
    }

    throw new Error(data.error || "未能生成图片");
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Generation cancelled');
    }
    console.error("Backend generation error:", error);
    throw normalizeError(error);
  }
}

/**
 * Normalize error messages for UI
 */
function normalizeError(error: any): Error {
  const msg = (error.message || error.toString()).toLowerCase();

  // Cancelled
  if (msg.includes('cancelled')) {
    return new Error("任务已取消");
  }

  // Rate Limit
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return new Error("请求太过频繁 (429)，正在尝试切换线路，请稍后...");
  }

  // Auth / Permission
  if (msg.includes("403") || msg.includes("permission") || msg.includes("api_key_invalid")) {
    return new Error("API Key 无效或已过期 (403)，请检查设置");
  }

  if (msg.includes("MISSING_API_KEY")) {
    return new Error("请先在设置中配置有效的 API Key");
  }

  // Safety / Policy
  if (msg.includes("safety") || msg.includes("blocked") || msg.includes("policy")) {
    return new Error("生成内容被安全策略拦截，请修改提示词");
  }

  // Argument Error
  if (msg.includes("400") || msg.includes("invalid_argument")) {
    return new Error("请求参数无效：模型可能不支持当前配置");
  }

  // Network / Server
  if (msg.includes("500") || msg.includes("internal")) {
    return new Error("谷歌服务器繁忙 (500)，请稍后重试");
  }

  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
    return new Error("网络连接失败，请检查您的网络设置");
  }

  // Default fallback with translated hint if possible, otherwise original
  return new Error(`生成失败: ${error.message || '未知错误'}`);
}

/**
 * Validate API key
 */
export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;

  // For local dev, test directly
  if (isLocalDev) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      await ai.models.get({ model: 'models/gemini-1.5-flash' });
      return true;
    } catch (e: any) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('403') || msg.includes('401') || msg.includes('permission')) {
        return false;
      }
      return true; // Other errors don't mean invalid key
    }
  }

  // For production, test via backend
  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "test",
        aspectRatio: "1:1",
        model: "imagen-3.0-generate-001",
        referenceImages: [],
        apiKey,
      }),
    });

    return response.status !== 403;
  } catch {
    return true; // Network errors don't mean invalid key
  }
};
