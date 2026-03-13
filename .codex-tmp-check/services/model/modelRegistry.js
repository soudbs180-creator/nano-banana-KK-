// src/services/model/modelRegistry.ts
var MODEL_REGISTRY = {
  // --- Google ---
  "gemini-2.0-flash-exp": { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash", provider: "Google", type: "chat", contextWindow: 1048576, isVision: true },
  "gemini-1.5-pro-latest": { id: "gemini-1.5-pro-latest", name: "Gemini 1.5 Pro", provider: "Google", type: "chat", contextWindow: 2097152, isVision: true },
  "gemini-1.5-flash-latest": { id: "gemini-1.5-flash-latest", name: "Gemini 1.5 Flash", provider: "Google", type: "chat", contextWindow: 1048576, isVision: true },
  "imagen-3.0-generate-001": { id: "imagen-3.0-generate-001", name: "Imagen 3", provider: "Google", type: "image" },
  "imagen-3.0-fast-generate-001": { id: "imagen-3.0-fast-generate-001", name: "Imagen 3 Fast", provider: "Google", type: "image" },
  "imagen-4.0-generate-001": { id: "imagen-4.0-generate-001", name: "Imagen 4", provider: "Google", type: "image" },
  "imagen-4.0-fast-generate-001": { id: "imagen-4.0-fast-generate-001", name: "Imagen 4 Fast", provider: "Google", type: "image" },
  "imagen-4.0-ultra-generate-001": { id: "imagen-4.0-ultra-generate-001", name: "Imagen 4 Ultra", provider: "Google", type: "image" },
  "gemini-3.1-flash-image-preview": { id: "gemini-3.1-flash-image-preview", name: "Nano Banana 2", provider: "Google", type: "image" },
  "gemini-3-pro-image-preview": { id: "gemini-3-pro-image-preview", name: "Nano Banana Pro", provider: "Google", type: "image" },
  "gemini-2.5-flash-image": { id: "gemini-2.5-flash-image", name: "Nano Banana", provider: "Google", type: "image" },
  "veo-2.0-generate-001": { id: "veo-2.0-generate-001", name: "Veo 2.0", provider: "Google", type: "video" },
  "lyria-realtime-v1": { id: "lyria-realtime-v1", name: "Lyria Music", provider: "Google", type: "audio", isSystemInternal: true },
  "gemini-2.0-flash-audio": { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Audio", provider: "Google", type: "audio" },
  // --- Audio/Music Models ---
  "suno-v4": { id: "suno-v4", name: "Suno V4", provider: "Custom", type: "audio" },
  "suno-v3.5": { id: "suno-v3.5", name: "Suno v3.5", provider: "Custom", type: "audio" },
  "suno-v3": { id: "suno-v3", name: "Suno v3", provider: "Custom", type: "audio" },
  "udio-v1": { id: "udio-v1", name: "Udio V1", provider: "Custom", type: "audio" },
  "riffusion": { id: "riffusion", name: "Riffusion", provider: "Custom", type: "audio" },
  "minimax-tts": { id: "minimax-tts", name: "MiniMax TTS", provider: "Custom", type: "audio" },
  "minimax-music": { id: "minimax-music", name: "MiniMax Music", provider: "Custom", type: "audio" },
  // --- OpenAI ---
  "gpt-4o": { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", type: "chat", contextWindow: 128e3, isVision: true },
  "gpt-4o-mini": { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", type: "chat", contextWindow: 128e3, isVision: true },
  "o1-preview": { id: "o1-preview", name: "o1 Preview", provider: "OpenAI", type: "chat", contextWindow: 128e3 },
  "dall-e-3": { id: "dall-e-3", name: "DALL\xB7E 3", provider: "OpenAI", type: "image" },
  // --- Anthropic ---
  "claude-3-5-sonnet-20241022": { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "Anthropic", type: "chat", contextWindow: 2e5, isVision: true },
  "claude-3-5-haiku-20241022": { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "Anthropic", type: "chat", contextWindow: 2e5 },
  // --- Volcengine (Doubao) ---
  "doubao-pro-32k": { id: "doubao-pro-32k", name: "Doubao Pro 32k", provider: "Volcengine", type: "chat", contextWindow: 32768 },
  "doubao-lite-32k": { id: "doubao-lite-32k", name: "Doubao Lite 32k", provider: "Volcengine", type: "chat", contextWindow: 32768 },
  "doubao-pro-128k": { id: "doubao-pro-128k", name: "Doubao Pro 128k", provider: "Volcengine", type: "chat", contextWindow: 131072 },
  // --- Aliyun (Qwen) ---
  "qwen-max": { id: "qwen-max", name: "Qwen Max", provider: "Aliyun", type: "chat", contextWindow: 32768 },
  "qwen-plus": { id: "qwen-plus", name: "Qwen Plus", provider: "Aliyun", type: "chat", contextWindow: 131072 },
  "qwen-turbo": { id: "qwen-turbo", name: "Qwen Turbo", provider: "Aliyun", type: "chat", contextWindow: 131072 },
  "wanx-v1": { id: "wanx-v1", name: "Wanx V1", provider: "Aliyun", type: "image" },
  "wanx-v2": { id: "wanx-v2", name: "Wanx V2", provider: "Aliyun", type: "image" },
  // --- Tencent (Hunyuan) ---
  "hunyuan-pro": { id: "hunyuan-pro", name: "Hunyuan Pro", provider: "Tencent", type: "chat" },
  "hunyuan-lite": { id: "hunyuan-lite", name: "Hunyuan Lite", provider: "Tencent", type: "chat" },
  "hunyuan-standard": { id: "hunyuan-standard", name: "Hunyuan Standard", provider: "Tencent", type: "chat" },
  "hunyuan-vision": { id: "hunyuan-vision", name: "Hunyuan Vision", provider: "Tencent", type: "chat", isVision: true },
  // --- SiliconFlow ---
  "deepseek-ai/DeepSeek-V3": { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", provider: "SiliconFlow", type: "chat" },
  "deepseek-ai/DeepSeek-R1": { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1", provider: "SiliconFlow", type: "chat" },
  "black-forest-labs/FLUX.1-schnell": { id: "black-forest-labs/FLUX.1-schnell", name: "FLUX.1 Schnell", provider: "SiliconFlow", type: "image" },
  "black-forest-labs/FLUX.1-dev": { id: "black-forest-labs/FLUX.1-dev", name: "FLUX.1 Dev", provider: "SiliconFlow", type: "image" },
  "stabilityai/stable-diffusion-3-5-large": { id: "stabilityai/stable-diffusion-3-5-large", name: "SD 3.5 Large", provider: "SiliconFlow", type: "image" },
  // --- Proxy / Common ---
  "midjourney": { id: "midjourney", name: "Midjourney V6", provider: "Custom", type: "image" },
  "mj-chat": { id: "mj-chat", name: "Midjourney Chat", provider: "Custom", type: "image" },
  "flux-pro": { id: "flux-pro", name: "FLUX Pro", provider: "Custom", type: "image" },
  "ideogram": { id: "ideogram", name: "Ideogram", provider: "Custom", type: "image" },
  "kling-v1": { id: "kling-v1", name: "Kling Video", provider: "Custom", type: "video" },
  "luma-dream-machine": { id: "luma-dream-machine", name: "Luma Dream Machine", provider: "Custom", type: "video" }
};
var getModelsByProvider = (provider) => {
  return Object.values(MODEL_REGISTRY).filter((m) => m.provider === provider);
};
var getModelInfo = (modelId) => {
  return MODEL_REGISTRY[modelId];
};
var modelRegistry = {
  getModels: () => {
    return Object.values(MODEL_REGISTRY).map((m) => ({
      id: m.id,
      label: m.name,
      provider: m.provider,
      type: m.type,
      enabled: true,
      isSystemInternal: m.isSystemInternal
    }));
  }
};
export {
  MODEL_REGISTRY,
  getModelInfo,
  getModelsByProvider,
  modelRegistry
};
