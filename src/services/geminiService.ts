import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize, ModelType, ReferenceImage } from "../types";

// Detect environment
const isLocalDev = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Backend API endpoint for cloud deployment
const API_ENDPOINT = "/.netlify/functions/generate";

/**
 * Generate image using Gemini API
 * - Local dev: Calls Gemini SDK directly (faster)
 * - Production: Routes through backend (secure)
 */
export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string,
  useFreeTier: boolean = false
): Promise<string> => {
  if (!apiKey && !useFreeTier) {
    throw new Error("请在设置中输入您的 API Key（右上角）");
  }

  // Local development: Direct API call
  if (isLocalDev) {
    // For local dev with Free Tier, we need the key client-side or use backend
    // If usage is Free Tier, let's try to use backend even in local dev? 
    // Or just use the key if provided.
    // Simplifying: If Free Tier, use backend (so we can hide key in .env)
    return await generateImageViaBackend(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, useFreeTier);
  }

  // Production: Call backend
  return await generateImageViaBackend(prompt, aspectRatio, imageSize, referenceImages, model, apiKey, useFreeTier);
};

/**
 * Direct Gemini API call (for local development)
 */
async function generateImageDirect(
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  apiKey: string
): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const parts: any[] = [];

    // Add reference images
    referenceImages.forEach(img => {
      parts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      });
    });

    // Add prompt
    parts.push({ text: prompt });

    // Build config
    const imageConfig: any = { aspectRatio };
    if (model === ModelType.PRO_QUALITY) {
      imageConfig.imageSize = imageSize;
    }

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: { imageConfig },
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
  apiKey: string,
  useFreeTier?: boolean
): Promise<string> {
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
        apiKey,
        useFreeTier
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `请求失败: ${response.status}`);
    }

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
