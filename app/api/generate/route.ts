import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Get API Key from server environment (never exposed to client)
const getApiKey = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        throw new Error('GEMINI_API_KEY is not configured on the server');
    }
    return key;
};

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt, aspectRatio, imageSize, model, referenceImages } = body;

        if (!prompt) {
            return NextResponse.json(
                { error: 'Prompt is required' },
                { status: 400 }
            );
        }

        const apiKey = getApiKey();
        const ai = new GoogleGenAI({ apiKey });

        // Build parts array
        const parts: any[] = [];

        // Add reference images if provided
        if (referenceImages && Array.isArray(referenceImages)) {
            referenceImages.forEach((img: { data: string; mimeType: string }) => {
                parts.push({
                    inlineData: {
                        data: img.data,
                        mimeType: img.mimeType,
                    },
                });
            });
        }

        // Add text prompt
        parts.push({ text: prompt });

        // Build image config
        const imageConfig: any = {
            aspectRatio: aspectRatio || '1:1',
        };

        // Only Pro model supports explicit imageSize
        if (model === 'gemini-3-pro-image-preview' && imageSize) {
            imageConfig.imageSize = imageSize;
        }

        const response = await ai.models.generateContent({
            model: model || 'gemini-2.5-flash-image',
            contents: [{
                role: 'user',
                parts: parts,
            }],
            config: {
                imageConfig: imageConfig,
            },
        });

        if (response.candidates && response.candidates.length > 0 && response.candidates[0].content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return NextResponse.json({
                        success: true,
                        imageData: `data:image/png;base64,${part.inlineData.data}`,
                    });
                }
            }
        }

        return NextResponse.json(
            { error: 'No image data found in response' },
            { status: 500 }
        );
    } catch (error: any) {
        console.error('Image generation error:', error);

        const msg = error.message || error.toString();

        if (msg.includes('GEMINI_API_KEY')) {
            return NextResponse.json(
                { error: 'Server API Key not configured' },
                { status: 500 }
            );
        }
        if (msg.includes('403') || msg.includes('permission')) {
            return NextResponse.json(
                { error: 'Permission Denied: Check server API Key configuration' },
                { status: 403 }
            );
        }
        if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
            return NextResponse.json(
                { error: 'Invalid Request: The model may not support this configuration or the prompt is blocked' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: msg },
            { status: 500 }
        );
    }
}
