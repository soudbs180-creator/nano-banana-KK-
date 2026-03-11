/**
 * 12AI API Service
 * 
 * Strict implementation following https://doc.12ai.org/api/
 * 
 * Base URL: https://cdn.12ai.org (recommended CDN)
 * Authentication: Bearer Token
 * Formats: OpenAI, Claude, Gemini
 */

import { ImageSize, AspectRatio } from '../../types';

// Base URL as per 12AI documentation
const BASE_URL = 'https://cdn.12ai.org';

// Model IDs as per 12AI documentation
export const RECOMMENDED_MODELS = {
  openai: 'gpt-5.1',
  gemini: 'gemini-3-pro-preview',
} as const;

// API Endpoints as per 12AI documentation
const ENDPOINTS = {
  // OpenAI Compatible
  openai: {
    chat: '/v1/chat/completions',
    images: '/v1/images/generations',
  },
  // Claude Native
  claude: {
    messages: '/v1/messages',
    responses: '/v1/responses',
  },
  // Gemini Format
  gemini: {
    generateContent: (model: string) => `/v1beta/models/${model}:generateContent`,
    streamGenerateContent: (model: string) => `/v1beta/models/${model}:streamGenerateContent`,
  },
  // Video Generation (Veo)
  video: {
    create: '/v1/videos',
    get: (id: string) => `/v1/videos/${id}`,
    content: (id: string) => `/v1/videos/${id}/content`,
  },
} as const;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onStream?: (chunk: string) => void;
  signal?: AbortSignal;
}

interface ImageGenerationOptions {
  model: string;
  prompt: string;
  imageSize?: ImageSize;
  aspectRatio?: AspectRatio;
  referenceImages?: string[];
  imageCount?: number;
  signal?: AbortSignal;
}

interface ImageGenerationResult {
  urls: string[];
  model: string;
  provider: string;
}

/**
 * Build full URL with base
 */
function buildUrl(endpoint: string, baseUrl: string = BASE_URL): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${cleanBase}${cleanEndpoint}`;
}

/**
 * Get headers for OpenAI format
 */
function getOpenAIHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

/**
 * Get headers for Claude format
 */
function getClaudeHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'anthropic-version': '2023-06-01',
  };
}

// ==================== Claude Messages API Types ====================

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface ClaudeMessagesOptions {
  model: string;
  messages: ClaudeMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  system?: string;
  signal?: AbortSignal;
}

interface ClaudeMessagesResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Get headers for Gemini format
 */
function getGeminiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Map image size to dimensions
 */
function mapImageSize(imageSize?: ImageSize, aspectRatio?: AspectRatio): string {
  const is4K = imageSize === ImageSize.SIZE_4K;
  const is2K = imageSize === ImageSize.SIZE_2K;
  const is05K = imageSize === ImageSize.SIZE_05K;
  
  let baseDim = 1024;
  if (is4K) baseDim = 4096;
  else if (is2K) baseDim = 2048;
  else if (is05K) baseDim = 512;
  
  const parts = (aspectRatio || '1:1').split(':');
  const ratio = parseFloat(parts[0]) / parseFloat(parts[1]);
  
  if (ratio > 1) return `${baseDim}x${Math.round(baseDim / ratio)}`;
  if (ratio < 1) return `${Math.round(baseDim * ratio)}x${baseDim}`;
  return `${baseDim}x${baseDim}`;
}

/**
 * Chat Completions (OpenAI format)
 * POST /v1/chat/completions
 */
export async function chatCompletions(
  apiKey: string,
  options: ChatOptions,
  baseUrl: string = BASE_URL
): Promise<string> {
  const url = buildUrl(ENDPOINTS.openai.chat, baseUrl);
  
  const body = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2048,
    stream: options.stream ?? false,
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getOpenAIHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`12AI Chat Error (${response.status}): ${error}`);
  }
  
  // Handle streaming
  if (options.stream && options.onStream) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) throw new Error('No response body for stream');
    
    let fullContent = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            fullContent += content;
            options.onStream(content);
          }
        } catch {
          // Ignore malformed JSON
        }
      }
    }
    
    return fullContent;
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ==================== Claude Messages API ====================

/**
 * Claude Messages API (Native Claude format)
 * POST /v1/messages
 * 
 * For Claude models (claude-3-5-sonnet, claude-3-opus, etc.)
 * Documentation: https://doc.12ai.org/api/
 */
export async function claudeMessages(
  apiKey: string,
  options: ClaudeMessagesOptions,
  baseUrl: string = BASE_URL
): Promise<string> {
  const url = buildUrl(ENDPOINTS.claude.messages, baseUrl);
  
  const body: any = {
    model: options.model,
    messages: options.messages,
    max_tokens: options.max_tokens ?? 4096,
    temperature: options.temperature ?? 0.7,
  };
  
  if (options.top_p !== undefined) body.top_p = options.top_p;
  if (options.system) body.system = options.system;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getClaudeHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`12AI Claude Error (${response.status}): ${error}`);
  }
  
  // Handle streaming
  if (options.stream) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    
    if (!reader) throw new Error('No response body for stream');
    
    let fullContent = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          
          try {
            const json = JSON.parse(data);
            // Claude streaming format
            const delta = json.delta?.text;
            if (delta) {
              fullContent += delta;
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return fullContent;
  }
  
  const data: ClaudeMessagesResponse = await response.json();
  
  // Extract text content from response
  const textBlocks = data.content?.filter((block) => block.type === 'text');
  return textBlocks?.map((block) => block.text).join('') || '';
}

/**
 * Streaming Claude Messages
 * POST /v1/messages with stream: true
 */
export async function* streamClaudeMessages(
  apiKey: string,
  options: Omit<ClaudeMessagesOptions, 'stream'>,
  baseUrl: string = BASE_URL
): AsyncGenerator<string, void, unknown> {
  const url = buildUrl(ENDPOINTS.claude.messages, baseUrl);
  
  const body = {
    model: options.model,
    messages: options.messages,
    max_tokens: options.max_tokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    top_p: options.top_p,
    system: options.system,
    stream: true,
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getClaudeHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  
  if (!response.ok) {
    throw new Error(`12AI Claude Stream Error (${response.status})`);
  }
  
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  
  const decoder = new TextDecoder();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          
          try {
            const json = JSON.parse(data);
            const delta = json.delta?.text;
            if (delta) yield delta;
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Generate Image (OpenAI format)
 * POST /v1/images/generations
 */
export async function generateImageOpenAI(
  apiKey: string,
  options: ImageGenerationOptions,
  baseUrl: string = BASE_URL
): Promise<ImageGenerationResult> {
  const url = buildUrl(ENDPOINTS.openai.images, baseUrl);
  
  const sizeStr = mapImageSize(options.imageSize, options.aspectRatio);
  
  const body: any = {
    model: options.model,
    prompt: options.prompt,
    n: options.imageCount || 1,
    size: sizeStr,
    response_format: 'b64_json',
  };
  
  // Add reference images if provided
  if (options.referenceImages?.length) {
    body.image = options.referenceImages.map(ref => {
      // Handle base64 or URL
      if (ref.startsWith('http')) return ref;
      if (ref.startsWith('data:')) return ref;
      return `data:image/png;base64,${ref}`;
    });
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getOpenAIHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`12AI Image Error (${response.status}): ${error}`);
  }
  
  const data = await response.json();
  
  // Extract images from response
  const images = data.data || [];
  const urls: string[] = [];
  
  for (const img of images) {
    if (img.b64_json) {
      urls.push(`data:image/png;base64,${img.b64_json}`);
    } else if (img.url) {
      urls.push(img.url);
    }
  }
  
  return {
    urls,
    model: options.model,
    provider: '12AI-OpenAI',
  };
}

/**
 * Generate Image (Gemini format - for Nano Banana models)
 * POST /v1beta/models/{model}:generateContent
 */
export async function generateImageGemini(
  apiKey: string,
  options: ImageGenerationOptions,
  baseUrl: string = BASE_URL
): Promise<ImageGenerationResult> {
  const endpoint = ENDPOINTS.gemini.generateContent(options.model);
  const url = `${buildUrl('', baseUrl)}${endpoint}?key=${apiKey}`;
  
  // Build request body in Gemini format
  const parts: any[] = [{ text: options.prompt }];
  
  // Add reference images
  if (options.referenceImages?.length) {
    for (const ref of options.referenceImages) {
      let data = ref;
      let mimeType = 'image/png';
      
      if (ref.startsWith('data:')) {
        const match = ref.match(/data:([^;]+);base64,(.+)/);
        if (match) {
          mimeType = match[1];
          data = match[2];
        }
      } else if (!ref.startsWith('http')) {
        // Assume base64 without prefix
        data = ref;
      }
      
      if (ref.startsWith('http')) {
        parts.push({
          fileData: {
            mimeType,
            fileUri: ref,
          },
        });
      } else {
        parts.push({
          inlineData: {
            mimeType,
            data,
          },
        });
      }
    }
  }
  
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['Text', 'Image'],
    },
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getGeminiHeaders(),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`12AI Gemini Error (${response.status}): ${error}`);
  }
  
  const data = await response.json();
  
  // Extract images from Gemini response
  const urls: string[] = [];
  
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const { mimeType, data: base64Data } = part.inlineData;
        urls.push(`data:${mimeType};base64,${base64Data}`);
      }
    }
  }
  
  return {
    urls,
    model: options.model,
    provider: '12AI-Gemini',
  };
}

/**
 * Unified Image Generation
 * Automatically selects the appropriate format based on model ID
 */
export async function generateImage(
  apiKey: string,
  options: ImageGenerationOptions,
  baseUrl: string = BASE_URL
): Promise<ImageGenerationResult> {
  const modelLower = options.model.toLowerCase();
  
  // Use Gemini format for Gemini models (Nano Banana)
  if (modelLower.includes('gemini') && modelLower.includes('image')) {
    return generateImageGemini(apiKey, options, baseUrl);
  }
  
  // Use OpenAI format for all other models
  return generateImageOpenAI(apiKey, options, baseUrl);
}

/**
 * Video generation options
 */
export interface VideoGenerationOptions {
  /** Prompt text for video generation */
  prompt: string;
  /** Optional image URL for image-to-video generation */
  imageUrl?: string;
  /** Video duration in seconds (supported: 5, 8, 10) */
  duration?: 5 | 8 | 10;
  /** Video resolution (supported: '480p', '720p', '1080p') */
  resolution?: '480p' | '720p' | '1080p';
  /** Aspect ratio (supported: '16:9', '9:16', '1:1') */
  aspectRatio?: '16:9' | '9:16' | '1:1';
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Create Video (Veo)
 * POST /v1/videos
 * 
 * Supports extended parameters:
 * - duration: Video length in seconds
 * - resolution: Output resolution
 * - aspectRatio: Video aspect ratio
 */
export async function createVideo(
  apiKey: string,
  options: VideoGenerationOptions,
  baseUrl: string = BASE_URL
): Promise<{ id: string; status: string }> {
  const url = buildUrl(ENDPOINTS.video.create, baseUrl);
  
  const body: any = { 
    prompt: options.prompt 
  };
  
  // Add optional parameters
  if (options.imageUrl) {
    body.image_url = options.imageUrl;
  }
  
  if (options.duration) {
    body.duration = options.duration;
  }
  
  if (options.resolution) {
    body.resolution = options.resolution;
  }
  
  if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: getOpenAIHeaders(apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`12AI Video Error (${response.status}): ${error}`);
  }
  
  return response.json();
}

/**
 * Legacy Create Video (backward compatibility)
 * @deprecated Use the new createVideo with VideoGenerationOptions instead
 */
export async function createVideoLegacy(
  apiKey: string,
  prompt: string,
  options?: {
    imageUrl?: string;
    signal?: AbortSignal;
  },
  baseUrl?: string
): Promise<{ id: string; status: string }> {
  return createVideo(
    apiKey,
    {
      prompt,
      imageUrl: options?.imageUrl,
      signal: options?.signal,
    },
    baseUrl || BASE_URL
  );
}

/**
 * Get Video Status
 * GET /v1/videos/{id}
 */
export async function getVideoStatus(
  apiKey: string,
  videoId: string,
  baseUrl: string = BASE_URL
): Promise<{ id: string; status: string; url?: string }> {
  const url = buildUrl(ENDPOINTS.video.get(videoId), baseUrl);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: getOpenAIHeaders(apiKey),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`12AI Video Status Error (${response.status}): ${error}`);
  }
  
  return response.json();
}

/**
 * Get available models from 12AI
 * This would typically be fetched from their API if available
 */
export function getAvailableModels(): { id: string; name: string; type: string }[] {
  return [
    // OpenAI format models
    { id: 'gpt-5.1', name: 'GPT-5.1', type: 'chat' },
    { id: 'gpt-4o', name: 'GPT-4o', type: 'chat' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', type: 'chat' },
    
    // Gemini format models
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', type: 'chat' },
    { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', type: 'image' },
    { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro', type: 'image' },
    { id: 'gemini-2.5-flash-image', name: 'Nano Banana', type: 'image' },
    
    // Claude format models
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', type: 'chat' },
    { id: 'claude-3-opus', name: 'Claude 3 Opus', type: 'chat' },
    
    // Image models
    { id: 'dall-e-3', name: 'DALL·E 3', type: 'image' },
    { id: 'midjourney-v6', name: 'Midjourney V6', type: 'image' },
    { id: 'flux-1', name: 'FLUX.1', type: 'image' },
    
    // Video models
    { id: 'veo-3', name: 'Veo 3', type: 'video' },
  ];
}

export const api12AIService = {
  chatCompletions,
  claudeMessages,
  streamClaudeMessages,
  generateImage,
  generateImageOpenAI,
  generateImageGemini,
  createVideo,
  createVideoLegacy,
  getVideoStatus,
  getAvailableModels,
  BASE_URL,
  RECOMMENDED_MODELS,
};
