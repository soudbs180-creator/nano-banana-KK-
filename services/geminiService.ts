/**
 * Gemini Service - Client Side
 * 
 * This service calls the backend API routes instead of directly calling Gemini SDK.
 * The API Key is securely stored on the server and never exposed to the client.
 */

import { AspectRatio, ImageSize, ModelType, ReferenceImage } from "@/types";

export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  referenceImages: ReferenceImage[],
  model: ModelType,
  _customApiKey?: string // Ignored - server uses its own key
): Promise<string> => {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        aspectRatio,
        imageSize,
        model,
        referenceImages: referenceImages.map(img => ({
          data: img.data,
          mimeType: img.mimeType,
        })),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Image generation failed');
    }

    if (!data.success || !data.imageData) {
      throw new Error('No image data returned from server');
    }

    return data.imageData;
  } catch (error: any) {
    console.error("Image generation error:", error);
    throw new Error(error.message || "Generation failed");
  }
};

export const analyzeImageContent = async (
  imageBase64: string,
  mimeType: string,
  prompt: string = "Describe this image in detail.",
  _customApiKey?: string // Ignored - server uses its own key
): Promise<string> => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64,
        mimeType,
        prompt,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return data.error || 'Failed to analyze image';
    }

    return data.analysis || 'No analysis available.';
  } catch (error: any) {
    console.error("Analysis error:", error);
    return "Failed to analyze image.";
  }
};

// API Key validation is no longer needed on client side
// The server handles this automatically
export const validateApiKey = async (_apiKey: string): Promise<boolean> => {
  // Always return true since server manages the API key
  return true;
};
