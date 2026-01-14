import { GoogleGenAI } from "@google/genai";

interface GenerateRequest {
    prompt: string;
    aspectRatio: string;
    imageSize?: string;
    model: string;
    referenceImages?: Array<{ data: string; mimeType: string }>;
    apiKey?: string;
    useFreeTier?: boolean;
}

export default async (request: Request) => {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }

    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        // Parse body
        let body: GenerateRequest;
        try {
            body = await request.json();
        } catch (e) {
            console.error("Failed to parse request body:", e);
            return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const { prompt, aspectRatio, imageSize, model, referenceImages, useFreeTier } = body;

        // Security: Determine effective API Key
        let effectiveApiKey = body.apiKey;

        if (useFreeTier) {
            // Use server-side environment variable for Free Tier, with fallback to the specific provided key
            // This ensures the key is never exposed to the client
            effectiveApiKey = process.env.FREE_TIER_KEY || "AIzaSyBCV8yD_VdxZb3EBcv0pyJiFNTgXh_mNzQ";

            // Enforce Nano Banana (Fast) model for Free Tier
            if (model !== 'gemini-2.0-flash-preview-image-generation') {
                return new Response(JSON.stringify({ error: "Free Tier only supports Nano Banana Flash model" }), {
                    status: 403,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        if (!effectiveApiKey) {
            return new Response(JSON.stringify({ error: "API key is required (or FREE_TIER_KEY env var missing)" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Initialize Gemini client with user's API key
        const ai = new GoogleGenAI({ apiKey: effectiveApiKey });

        // Build content parts
        const parts: any[] = [];

        // Add reference images if provided
        if (referenceImages && referenceImages.length > 0) {
            for (const img of referenceImages) {
                parts.push({
                    inlineData: {
                        data: img.data,
                        mimeType: img.mimeType,
                    },
                });
            }
        }

        // Add prompt text
        parts.push({ text: prompt });

        // Build image generation config
        let requestConfig: any = undefined;
        let finalPrompt = prompt;

        if (model.includes('imagen')) {
            requestConfig = { imageConfig: { aspectRatio } };
            if (model === "imagen-3.0-generate-002" && imageSize) {
                requestConfig.imageConfig.imageSize = imageSize;
            }
        } else {
            // Gemini models: Add aspect ratio to prompt
            finalPrompt = `${prompt} (Aspect Ratio: ${aspectRatio})`;
        }

        // Re-build contents with modified prompt if needed
        // Note: 'parts' already contains reference images and the *original* prompt text at the end (line 69)
        // We need to replace the text part or clear parts and rebuild.
        // Easier: Just rebuild the text part.

        const finalParts = [];
        if (referenceImages && referenceImages.length > 0) {
            for (const img of referenceImages) {
                finalParts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
            }
        }
        finalParts.push({ text: finalPrompt });

        // Call Gemini API
        const response = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: finalParts }],
            config: requestConfig,
        });

        // Extract image from response
        if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.content?.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData?.data) {
                        return new Response(
                            JSON.stringify({
                                success: true,
                                imageData: part.inlineData.data,
                                mimeType: part.inlineData.mimeType || "image/png",
                            }),
                            {
                                status: 200,
                                headers: {
                                    "Content-Type": "application/json",
                                    "Access-Control-Allow-Origin": "*",
                                },
                            }
                        );
                    }
                }
            }
        }

        return new Response(
            JSON.stringify({ error: "No image generated" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );

    } catch (error: any) {
        console.error("Generation error:", error);

        let errorMessage = error.message || "Generation failed";
        let statusCode = 500;

        // Parse common Gemini API errors
        if (errorMessage.includes("403") || errorMessage.includes("permission")) {
            errorMessage = "API Key invalid or billing not enabled";
            statusCode = 403;
        } else if (errorMessage.includes("400") || errorMessage.includes("INVALID_ARGUMENT")) {
            errorMessage = "Invalid request - model may not support this configuration";
            statusCode = 400;
        } else if (errorMessage.includes("leaked")) {
            errorMessage = "This API key has been reported as leaked. Please use a new key.";
            statusCode = 403;
        }

        return new Response(
            JSON.stringify({ error: errorMessage }),
            {
                status: statusCode,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    }
};

export const config = {
    path: "/api/generate",
};
