/**
 * 12AI API Service
 * 
 * Strict implementation of 12AI API documentation
 * Docs: https://doc.12ai.org/api/
 * 
 * Base URL: https://cdn.12ai.org (recommended CDN)
 * Authentication: Bearer token in Authorization header
 */

// Base configuration per 12AI docs
const DEFAULT_BASE_URL = 'https://cdn.12ai.org';

// Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{
    text?: string;
    inline_data?: {
      mime_type: string;
      data: string;
    };
  }>;
}

export interface GeminiGenerateOptions {
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
  tools?: any[];
}

export interface GeminiGenerateResponse {
  candidates: Array<{
    content: GeminiContent;
    finishReason: string;
    index: number;
    safetyRatings: any[];
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface ImageGenerateOptions {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  style?: string;
  response_format?: 'url' | 'b64_json';
}

export interface VideoGenerateOptions {
  model: string;
  prompt: string;
  image_url?: string;
  duration?: number;
  resolution?: string;
}

class AI12APIService {
  private baseUrl: string = DEFAULT_BASE_URL;

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  // ==================== OpenAI Compatible Endpoints ====================
  // These endpoints follow OpenAI API format
  // Endpoint: POST /v1/chat/completions

  /**
   * Chat Completions (OpenAI compatible)
   * POST /v1/chat/completions
   * 
   * Authentication: Bearer token in Authorization header
   */
  async chatCompletions(
    options: ChatCompletionOptions,
    apiKey: string
  ): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.max_tokens || 2048,
        temperature: options.temperature ?? 0.7,
        top_p: options.top_p ?? 1,
        stream: options.stream ?? false,
        ...(options.tools && { tools: options.tools }),
        ...(options.tool_choice && { tool_choice: options.tool_choice }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chat completion failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Streaming Chat Completions (OpenAI compatible)
   * POST /v1/chat/completions with stream: true
   */
  async *streamChatCompletions(
    options: Omit<ChatCompletionOptions, 'stream'>,
    apiKey: string
  ): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.max_tokens || 2048,
        temperature: options.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stream failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            yield data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ==================== Gemini Native Endpoints ====================
  // These endpoints follow Google's Gemini API format
  // Base: /v1beta/models

  /**
   * Generate Content (Gemini native)
   * POST /v1beta/models/{model}:generateContent
   * 
   * For Gemini models like gemini-1.5-pro, gemini-1.5-flash, etc.
   */
  async generateContent(
    model: string,
    options: GeminiGenerateOptions,
    apiKey: string
  ): Promise<GeminiGenerateResponse> {
    // Model name format: gemini-1.5-pro, gemini-1.5-flash, etc.
    const modelName = model.includes('/') ? model.split('/').pop()! : model;
    
    const response = await fetch(
      `${this.baseUrl}/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: options.contents,
          ...(options.generationConfig && { generationConfig: options.generationConfig }),
          ...(options.safetySettings && { safetySettings: options.safetySettings }),
          ...(options.tools && { tools: options.tools }),
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Generate content failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Count Tokens (Gemini native)
   * POST /v1beta/models/{model}:countTokens
   */
  async countTokens(
    model: string,
    contents: GeminiContent[],
    apiKey: string
  ): Promise<{ totalTokens: number }> {
    const modelName = model.includes('/') ? model.split('/').pop()! : model;
    
    const response = await fetch(
      `${this.baseUrl}/v1beta/models/${modelName}:countTokens?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contents }),
      }
    );

    if (!response.ok) {
      throw new Error(`Count tokens failed: ${response.status}`);
    }

    const data = await response.json();
    return { totalTokens: data.totalTokens };
  }

  // ==================== Image Generation ====================
  // Using OpenAI compatible DALL-E format

  /**
   * Generate Image (DALL-E compatible)
   * POST /v1/images/generations
   */
  async generateImage(
    options: ImageGenerateOptions,
    apiKey: string
  ): Promise<{ data: Array<{ url?: string; b64_json?: string }> }> {
    const response = await fetch(`${this.baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        n: options.n ?? 1,
        size: options.size ?? '1024x1024',
        quality: options.quality ?? 'standard',
        response_format: options.response_format ?? 'url',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Image generation failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // ==================== Video Generation ====================
  // Native endpoint for video models

  /**
   * Generate Video
   * POST /v1/videos/generations
   */
  async generateVideo(
    options: VideoGenerateOptions,
    apiKey: string
  ): Promise<{ task_id: string; status: string }> {
    const response = await fetch(`${this.baseUrl}/v1/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        ...(options.image_url && { image_url: options.image_url }),
        ...(options.duration && { duration: options.duration }),
        ...(options.resolution && { resolution: options.resolution }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Video generation failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get Video Generation Status
   * GET /v1/videos/{task_id}
   */
  async getVideoStatus(taskId: string, apiKey: string): Promise<{
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    video_url?: string;
  }> {
    const response = await fetch(`${this.baseUrl}/v1/videos/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Get video status failed: ${response.status}`);
    }

    return response.json();
  }

  // ==================== Model Management ====================

  /**
   * List available models
   * GET /v1/models
   */
  async listModels(apiKey: string): Promise<{
    data: Array<{
      id: string;
      object: string;
      created: number;
      owned_by: string;
    }>;
  }> {
    const response = await fetch(`${this.baseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`List models failed: ${response.status}`);
    }

    return response.json();
  }

  // ==================== Helper Methods ====================

  /**
   * Determine the best endpoint based on model name
   */
  getEndpointForModel(modelId: string): 'openai' | 'gemini' {
    const lowerId = modelId.toLowerCase();
    
    // Gemini models use native endpoint
    if (lowerId.includes('gemini')) {
      return 'gemini';
    }
    
    // Default to OpenAI compatible endpoint
    return 'openai';
  }
}

export const ai12ApiService = new AI12APIService();
