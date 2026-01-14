import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Get API Key from server environment
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
        const { imageBase64, mimeType, prompt } = body;

        if (!imageBase64 || !mimeType) {
            return NextResponse.json(
                { error: 'Image data and mimeType are required' },
                { status: 400 }
            );
        }

        const apiKey = getApiKey();
        const ai = new GoogleGenAI({ apiKey });

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            data: imageBase64,
                            mimeType: mimeType,
                        },
                    },
                    { text: prompt || 'Describe this image in detail.' },
                ],
            },
        });

        return NextResponse.json({
            success: true,
            analysis: response.text || 'No analysis available.',
        });
    } catch (error: any) {
        console.error('Analysis error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to analyze image' },
            { status: 500 }
        );
    }
}
