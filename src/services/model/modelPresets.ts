export interface ModelPreset {
    id: string;
    label: string;
    provider: string; // 'Google' | 'OpenAI' | 'Midjourney' | 'Stability' | 'Luma' | 'Runway' | 'Other'
    type: 'image' | 'video' | 'chat' | 'image+chat' | 'audio';  // ✨ 支持多模态
    description?: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
    // ============================================
    // Gemini Image 系列
    { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', provider: 'Google', type: 'image', description: '极速生成，适合快速验证灵感' },
    { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2', provider: 'Google', type: 'image', description: '最新预览版，极速生成且支持多达 14 张参考图' },
    { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro', provider: 'Google', type: 'image', description: '增强细节与构图，适合高质量预览' },

    // ============================================
    // Google Veo 系列 (视频生成)
    // 参考: https://ai.google.dev/gemini-api/docs/models/video
    // ============================================
    { id: 'veo-3.1-generate-preview', label: 'Veo 3.1', provider: 'Google', type: 'video', description: '最新视频生成模型 (预览版)' },
    { id: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast', provider: 'Google', type: 'video', description: 'Veo 3.1 快速版' },

    // ============================================
    // Google Audio/Music 音乐生成
    // ============================================
    { id: 'lyria-realtime-v1', label: 'Lyria Music', provider: 'Google', type: 'audio', description: 'Google 官方音乐生成模型，支持高质量音频' },
    { id: 'gemini-2.0-flash-audio', label: 'Gemini 2.0 Audio', provider: 'Google', type: 'audio', description: 'Gemini 2.0 多模态语音生成' },

    // ============================================
    // OpenAI (DALL-E) - 需通过第三方 API 代理
    // ============================================
    { id: 'dall-e-3', label: 'DALL-E 3', provider: 'OpenAI', type: 'image', description: 'OpenAI 最强绘图模型' },

    // ============================================
    // Flux (需通过代理 API)
    // ============================================
    { id: 'flux-pro', label: 'FLUX.1 Pro', provider: 'Black Forest Labs', type: 'image', description: '顶级开源模型商业版' },
    { id: 'flux-schnell', label: 'FLUX.1 Schnell', provider: 'Black Forest Labs', type: 'image', description: 'FLUX 极速版' },
];

export const CHAT_MODEL_PRESETS: ModelPreset[] = [
    // ============================================
    // Google Gemini 系列 (多模态对话)
    // ============================================
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro 预览', provider: 'Google', type: 'chat', description: '世界最强多模态模型，顶级推理能力' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash 预览', provider: 'Google', type: 'chat', description: 'Gemini 3 快速版，新鲜力兼鲜' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（极快式）', provider: 'Google', type: 'chat', description: '速度优先，低成本对话模型' },

    // ============================================
    // DeepSeek 系列
    // ============================================
    { id: 'deepseek-chat', label: 'DeepSeek V3', provider: 'DeepSeek', type: 'chat', description: '性价比极高的通用对话模型' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1', provider: 'DeepSeek', type: 'chat', description: 'DeepSeek 推理增强模型 (R1)' },

    // ============================================
    // OpenAI 系列
    // ============================================
    { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', type: 'chat', description: 'OpenAI 旗舰全能模型' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', type: 'chat', description: '快速且低成本的轻量级模型' },

    // ============================================
    // Anthropic 系列
    // ============================================
    { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet', provider: 'Anthropic', type: 'chat', description: 'Anthropic 最强平衡模型' },
];
