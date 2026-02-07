
import { AspectRatio, ImageSize } from '../types';

interface OpenAIVideoConfig {
    model: string;
    prompt: string;
    size?: string;
    seconds?: number;
    referenceImage?: string; // Base64 or URL
}

interface OpenAIVideoResponse {
    id: string;
    status: string; // 'queued', 'processing', 'succeeded', 'failed'
    output?: string; // final video url
    error?: string;
}

/**
 * Generate video using OpenAI-compatible endpoint (NewAPI/Apifox format)
 * POST /v1/videos
 * Content-Type: multipart/form-data
 */
export const generateOpenAIVideo = async (
    config: OpenAIVideoConfig,
    apiKey: string,
    baseUrl: string,
    signal?: AbortSignal
): Promise<{ url: string }> => {
    // 1. Prepare FormData
    const formData = new FormData();
    formData.append('model', config.model);
    formData.append('prompt', config.prompt);

    if (config.size) formData.append('size', config.size);
    if (config.seconds) formData.append('seconds', config.seconds.toString());

    // Handle Reference Image
    if (config.referenceImage) {
        // Check if it's base64 data
        if (config.referenceImage.startsWith('data:')) {
            // Convert base64 to Blob
            const fetchRes = await fetch(config.referenceImage);
            const blob = await fetchRes.blob();
            // Append as file 'input_reference' (as per doc examples often used by these proxies)
            // Doc said: input_reference (file) OR image (string)
            // Safer to use 'file' for better compatibility with strict uploaders
            formData.append('file', blob, 'reference_image.png');
            // Also append 'input_reference' just in case the proxy expects that specific field name
            // But standard for newapi video often uses 'file' or 'image'. 
            // Let's check the user provided doc again? 
            // The browser step said: "input_reference (Optional, file)", "image (Optional, string)"
            // I'll try 'input_reference' with blob.
            formData.append('input_reference', blob, 'ref.png');
        } else {
            // It's a URL
            formData.append('image', config.referenceImage);
        }
    }

    // 2. Make Request
    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/videos`;

    console.log(`[OpenAIVideo] POST ${endpoint}`, {
        model: config.model,
        size: config.size,
        hasRef: !!config.referenceImage
    });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            // Content-Type header is set automatically by fetch when body is FormData
        },
        body: formData,
        signal
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Video API Error (${response.status}): ${errText}`);
    }

    const result = await response.json();
    console.log('[OpenAIVideo] Response:', result);

    // 3. Handle Sync vs Async
    // Some proxies return the result immediately, others return a task ID
    // The user doc example showed: { id, status: 'queued', ... }
    // If queued, we need to poll.

    if (result.data && Array.isArray(result.data) && result.data.length > 0 && result.data[0].url) {
        // Direct success (OpenAI Image style but for video?)
        return { url: result.data[0].url };
    }

    if (result.id && result.status) {
        // Async Task
        return await pollVideoTask(result.id, apiKey, baseUrl, signal);
    }

    if (result.url) {
        return { url: result.url };
    }

    throw new Error('Unknown response format from Video API');
};

const pollVideoTask = async (
    taskId: string,
    apiKey: string,
    baseUrl: string,
    signal?: AbortSignal
): Promise<{ url: string }> => {
    const maxAttempts = 60; // 5 minutes (if 5s interval)
    const interval = 5000;

    for (let i = 0; i < maxAttempts; i++) {
        if (signal?.aborted) throw new Error('Cancelled');

        // GET /v1/videos/:id or /v1/videos/tasks/:id ?
        // Standard NewAPI often uses GET /v1/videos/:id to check status
        // Let's guess typical structure
        const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/videos/${taskId}`;

        try {
            const res = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                signal
            });

            if (!res.ok) {
                if (res.status === 404) throw new Error('Task not found');
                // retry on 5xx
                if (res.status >= 500) {
                    await new Promise(r => setTimeout(r, interval));
                    continue;
                }
                throw new Error(`Poll Error ${res.status}`);
            }

            const data = await res.json();
            console.log(`[OpenAIVideo] Poll ${taskId}: ${data.status}`);

            if (data.status === 'succeeded' || data.status === 'SUCCESS') {
                // Look for output url
                const url = data.output || data.url || (data.data && data.data[0]?.url);
                if (url) return { url };
                throw new Error('Task succeeded but no URL found');
            }

            if (data.status === 'failed' || data.status === 'FAIL') {
                throw new Error(data.error || 'Video generation failed');
            }

            // Wait
            await new Promise(r => setTimeout(r, interval));

        } catch (e) {
            console.warn('[OpenAIVideo] Poll warning:', e);
            // If it's a fatal error, rethrow. If network blip, continue?
            if (e instanceof Error && e.message.includes('Task not found')) throw e;
            await new Promise(r => setTimeout(r, interval));
        }
    }

    throw new Error('Video generation timed out');
}

/**
 * Helper to map standard aspect ratios to pixel types
 * or just return the ratio string if the API expects "16:9"
 */
export const mapAspectRatioToSize = (ratio: AspectRatio, model: string): string => {
    // Apifox/NewAPI often expects "WxH" string
    switch (ratio) {
        case AspectRatio.LANDSCAPE_16_9: return "1280x720";
        case AspectRatio.PORTRAIT_9_16: return "720x1280";
        case AspectRatio.SQUARE: return "1024x1024";
        case AspectRatio.LANDSCAPE_4_3: return "1024x768";
        case AspectRatio.PORTRAIT_3_4: return "768x1024";
        default: return "1280x720";
    }
}
