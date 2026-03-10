import { supabase } from '../../lib/supabase';

export interface SecureProxyChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SecureProxyChatRequest {
  modelId: string;
  messages: SecureProxyChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface SecureProxyChatResponse {
  content: string;
  deducted?: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  endpointType?: 'openai' | 'gemini';
}

export interface SecureProxyImageRequest {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  imageCount?: number;
  referenceImages?: Array<string | { data: string; mimeType: string }>;
}

export interface SecureProxyImageResponse {
  urls: string[];
  deducted?: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
  };
  endpointType?: 'openai' | 'gemini';
}

export interface SecureProxyVideoRequest {
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  videoDuration?: string;
  imageUrl?: string;
  imageTailUrl?: string;
}

export interface SecureProxyVideoResponse {
  taskId: string;
  status: 'pending' | 'success' | 'failed';
  url?: string;
  deducted?: boolean;
  endpointType?: 'openai' | 'gemini';
}

export interface SecureProxyAudioRequest {
  modelId: string;
  prompt: string;
}

export interface SecureProxyAudioResponse {
  url: string;
  deducted?: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
  };
  endpointType?: 'openai' | 'gemini';
}

export interface SecureProxyTaskStatusResponse {
  status: 'pending' | 'success' | 'failed';
  url?: string;
  deducted?: boolean;
}

export async function cancelSecureSystemProxyTask(taskId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('secure-model-proxy', {
    body: {
      mode: 'cancel_task',
      taskId,
    },
  });

  if (error) {
    throw new Error(error.message || 'System proxy cancel invocation failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'System proxy returned error');
  }

  return true;
}

export async function deleteSecureSystemProxyTask(taskId: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('secure-model-proxy', {
    body: {
      mode: 'delete_task',
      taskId,
    },
  });

  if (error) {
    throw new Error(error.message || 'System proxy delete invocation failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'System proxy returned error');
  }

  return true;
}

export async function downloadSecureSystemProxyTaskContent(taskId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('secure-model-proxy', {
    body: {
      mode: 'download_task',
      taskId,
    },
  });

  if (error) {
    throw new Error(error.message || 'System proxy download invocation failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'System proxy returned error');
  }

  return String(data.url || '');
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
      .join('\n');
  }
  if (content == null) return '';
  return String(content);
}

export async function callSecureSystemProxyChat(
  payload: SecureProxyChatRequest
): Promise<SecureProxyChatResponse> {
  const normalizedMessages = payload.messages.map((message) => ({
    role: message.role,
    content: normalizeMessageContent(message.content),
  }));

  const { data, error } = await supabase.functions.invoke('secure-model-proxy', {
    body: {
      mode: 'chat',
      modelId: payload.modelId,
      messages: normalizedMessages,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
      stream: payload.stream ?? false,
    },
  });

  if (error) {
    throw new Error(error.message || 'System proxy invocation failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'System proxy returned error');
  }

  return {
    content: data.content || '',
    deducted: Boolean(data.deducted),
    usage: data.usage,
    endpointType: data.endpointType,
  };
}

export async function callSecureSystemProxyImage(
  payload: SecureProxyImageRequest
): Promise<SecureProxyImageResponse> {
  const { data, error } = await supabase.functions.invoke('secure-model-proxy', {
    body: {
      mode: 'image',
      modelId: payload.modelId,
      prompt: payload.prompt,
      aspectRatio: payload.aspectRatio,
      imageSize: payload.imageSize,
      imageCount: payload.imageCount ?? 1,
      referenceImages: payload.referenceImages ?? [],
    },
  });

  if (error) {
    throw new Error(error.message || 'System proxy image invocation failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'System proxy returned error');
  }

  return {
    urls: Array.isArray(data.urls) ? data.urls : [],
    deducted: Boolean(data.deducted),
    usage: data.usage,
    endpointType: data.endpointType,
  };
}

export async function callSecureSystemProxyVideo(
  payload: SecureProxyVideoRequest
): Promise<SecureProxyVideoResponse> {
  const { data, error } = await supabase.functions.invoke('secure-model-proxy', {
    body: {
      mode: 'video',
      modelId: payload.modelId,
      prompt: payload.prompt,
      aspectRatio: payload.aspectRatio,
      resolution: payload.resolution,
      duration: payload.duration,
      videoDuration: payload.videoDuration,
      imageUrl: payload.imageUrl,
      imageTailUrl: payload.imageTailUrl,
    },
  });

  if (error) {
    throw new Error(error.message || 'System proxy video invocation failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'System proxy returned error');
  }

  return {
    taskId: data.taskId || '',
    status: data.status || 'pending',
    url: data.url,
    deducted: Boolean(data.deducted),
    endpointType: data.endpointType,
  };
}

export async function callSecureSystemProxyAudio(
  payload: SecureProxyAudioRequest
): Promise<SecureProxyAudioResponse> {
  const { data, error } = await supabase.functions.invoke('secure-model-proxy', {
    body: {
      mode: 'audio',
      modelId: payload.modelId,
      prompt: payload.prompt,
    },
  });

  if (error) {
    throw new Error(error.message || 'System proxy audio invocation failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'System proxy returned error');
  }

  return {
    url: data.url || '',
    deducted: Boolean(data.deducted),
    usage: data.usage,
    endpointType: data.endpointType,
  };
}

export async function checkSecureSystemProxyTaskStatus(taskId: string): Promise<SecureProxyTaskStatusResponse> {
  const { data, error } = await supabase.functions.invoke('secure-model-proxy', {
    body: {
      mode: 'task_status',
      taskId,
    },
  });

  if (error) {
    throw new Error(error.message || 'System proxy task status invocation failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'System proxy returned error');
  }

  return {
    status: data.status || 'pending',
    url: data.url,
    deducted: Boolean(data.deducted),
  };
}
