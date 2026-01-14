import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize, ModelType, ReferenceImage } from "../types";

// Helper to get client with custom or default key
const getAiClient = (customKey?: string) => {
  // Priority: Custom Key -> Env Key
  const apiKey = customKey || import.meta.env.VITE_API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  customApiKey?: string
): Promise<string> => {
  try {
    const ai = getAiClient(customApiKey);
    const parts: any[] = [];

    // Add all reference images first
    referenceImages.forEach(img => {
      parts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      });
    });

    // Add text prompt
    parts.push({ text: prompt });

    // Build configuration based on model capabilities
    const imageConfig: any = {
      aspectRatio: aspectRatio,
    };

    // Only Pro model supports explicit imageSize (1K, 2K, 4K)
    if (model === ModelType.PRO_QUALITY) {
      imageConfig.imageSize = imageSize;
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: [{
        role: 'user',
        parts: parts,
      }],
      config: {
        imageConfig: imageConfig,
      },
    });

    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data found in response");
  } catch (error: any) {
    console.error("Image generation error:", error);

    // Normalize error messages for the UI
    const msg = error.message || error.toString();

    if (msg.includes("MISSING_API_KEY")) {
      throw new Error("Please enter your API Key in the settings (top right).");
    }
    if (msg.includes("403") || msg.includes("permission")) {
      throw new Error("Permission Denied: Please check if your API Key is valid and Billing is enabled on your Google Cloud Project.");
    }
    if (msg.includes("400") || msg.includes("INVALID_ARGUMENT")) {
      throw new Error("Invalid Request: The model may not support this configuration or the prompt is blocked.");
    }

    throw new Error(msg);
  }
};

export const analyzeImageContent = async (
  imageBase64: string,
  mimeType: string,
  prompt: string = "Describe this image in detail.",
  customApiKey?: string
): Promise<string> => {
  try {
    const ai = getAiClient(customApiKey);
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash', // Use Flash for text analysis
      contents: {
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType: mimeType,
            },
          },
          { text: prompt },
        ],
      },
    });

    return response.text || "No analysis available.";
  } catch (error: any) {
    console.error("Analysis error:", error);
    if (error.message.includes("MISSING_API_KEY")) return "Please set API Key.";
    return "Failed to analyze image.";
  }
};

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  // Basic format check (Google API keys usually start with AIza)
  if (!apiKey.startsWith('AIza')) {
    // Don't fail immediately, but it's suspicious.
    // Continue to validation.
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    // Try a minimal model lookup first
    // usage of any model that is likely to exist
    await ai.models.get({ model: 'models/gemini-1.5-flash' });
    return true;
  } catch (e: any) {
    // If getting model failed, try one more simple call
    try {
      const ai = new GoogleGenAI({ apiKey });
      await ai.models.countTokens({
        model: 'gemini-1.5-flash',
        contents: [{ parts: [{ text: 'test' }] }]
      });
      return true;
    } catch (innerE: any) {
      // Now analyze the error
      const msg = (innerE.message || innerE.toString()).toLowerCase();

      // Only return false for explicit Auth errors
      if (msg.includes('403') || msg.includes('401') || msg.includes('permission denied') || msg.includes('unauthenticated') || msg.includes('key not valid')) {
        console.warn("API Key Validation - Auth Error:", innerE);
        return false;
      }

      // For other errors (like 404 model not found, 429 quota, etc.), 
      // assume the key IS valid but something else is wrong.
      // This prevents "Red Dot" when the key is actually correct.
      console.warn("API Key Validation - Non-Auth Error (Assuming Valid):", innerE);
      return true;
    }
  }
};
