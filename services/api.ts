import { GenerationConfig } from '../types';

interface GenerateResponse {
    text: string;
    error?: string;
}

export async function generateContent(
    prompt: string,
    model: string = 'gemini-1.5-flash',
    config?: Partial<GenerationConfig>
): Promise<string> {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                model,
                config
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Generation failed with status ${response.status}`);
        }

        const data: GenerateResponse = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data.text;
    } catch (error) {
        console.error("API Generation Error:", error);
        throw error;
    }
}
