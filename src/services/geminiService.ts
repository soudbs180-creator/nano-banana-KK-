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
export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string = '' // Optional: backend handles key management
): Promise<string> => {
  // Allow empty key to pass through to backend (for Server-Side Key usage)

  // Local development: Try Backend first, but Fallback if missing
  if (isLocalDev) {
    try {
      return await generateImageViaBackend(prompt, aspectRatio, imageSize, referenceImages, model, apiKey);
    } catch (e: any) {
      // If Backend is missing logic (e.g. running 'npm run dev' without Netlify), fallback to Direct
      if (e.message.includes("Backend function not found") || e.message.includes("404")) {
        console.warn("⚠️ Local Dev: Backend not found. Falling back to Direct Client-Side API call.");
        return await generateImageDirect(prompt, aspectRatio, imageSize, referenceImages, model, apiKey);
      }
      throw e;
    }
  }

  // Production: Call backend
  return await generateImageViaBackend(prompt, aspectRatio, imageSize, referenceImages, model, apiKey);
};

/**
 * Direct Gemini API call (for local development fallback)
 */
async function generateImageDirect(
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string
): Promise<string> {
  // Try to get API key from various sources
  let effectiveKey = apiKey;

  if (!effectiveKey) {
    // Try localStorage (local dev storage)
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

  if (!effectiveKey) {
    // Try environment variable
    effectiveKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  }

  if (!effectiveKey) {
    throw new Error("请先在设置中配置 API Key");
  }

  try {
    const ai = new GoogleGenAI({ apiKey: effectiveKey });
    const parts: any[] = [];
    if (prompt) parts.push({ text: prompt });

    // Add reference images if any
    if (referenceImages && referenceImages.length > 0) {
      referenceImages.forEach(img => {
        // Convert base64 to inline data
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data, // Ensure data is included
          },
        });
      });
    }
    // Build config
    const imageConfig: any = { aspectRatio };
    if (model === ModelType.PRO_QUALITY) {
      imageConfig.imageSize = imageSize;
    }

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        // @ts-ignore - GoogleGenAI SDK types might vary
        imageConfig
      },
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("未能生成图片");
  } catch (error: any) {
    console.error("Image generation error:", error);
    throw normalizeError(error);
  }
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
  apiKey: string
): Promise<string> {
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
    console.error("Backend generation error:", error);
    throw normalizeError(error);
  }
}

/**
 * Normalize error messages for UI
 */
function normalizeError(error: any): Error {
  const msg = error.message || error.toString();

  if (msg.includes("403") || msg.includes("permission") || msg.includes("leaked")) {
    return new Error("API Key 无效或已泄露，请使用新的 API Key");
  }
  if (msg.includes("400") || msg.includes("INVALID_ARGUMENT")) {
    return new Error("请求无效：模型可能不支持此配置或提示词被屏蔽");
  }
  if (msg.includes("MISSING_API_KEY")) {
    return new Error("请在设置中输入您的 API Key（右上角）");
  }
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed to fetch")) {
    return new Error("网络错误，请检查连接");
  }

  return new Error(msg);
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
