export interface ModelPreset {
    id: string;
    label: string;
    provider: string; // 'Google' | 'OpenAI' | 'Midjourney' | 'Stability' | 'Luma' | 'Runway' | 'Other'
    type: 'image' | 'video' | 'chat';
    description?: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
    // ============================================
    // Google Imagen 系列 (图像生成)
    // 参考: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
    // ============================================

    // Imagen 4 - 最新图片生成模型
    // 定价: Fast $0.02/张, Ultra $0.06/张
    { id: 'imagen-4.0-generate-001', label: 'Imagen 4（图像生成）', provider: 'Google', type: 'image', description: '最新图像生成模型，文本渲染更强' },
    { id: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4 Ultra（超清）', provider: 'Google', type: 'image', description: '超高质量输出，细节更丰富' },
    { id: 'imagen-4.0-fast-generate-001', label: 'Imagen 4 Fast（快速）', provider: 'Google', type: 'image', description: '速度优先，适合快速出图' },

    // Imagen 3 - 上一代模型
    { id: 'imagen-3.0-generate-002', label: 'Imagen 3（上一代）', provider: 'Google', type: 'image', description: '质量稳定，适合日常创作' },
    { id: 'imagen-3.0-generate-001', label: 'Imagen 3.0（旧版）', provider: 'Google', type: 'image', description: '兼容旧版能力，适合历史项目' },

    // ============================================
    // Google Gemini Image 系列 (原生图像生成)
    // 参考: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
    // ============================================

    // Nano Banana - 内部代号，映射到 Gemini 2.5 Flash Image
    // 定价: 输出 $30/1M tokens, 1024x1024 需 1290 tokens = $0.039/张
    { id: 'nano-banana', label: 'Nano Banana（极速）', provider: 'Google', type: 'image', description: '极速生成，适合快速验证灵感' },

    // Nano Banana Pro - 内部代号，映射到 Gemini 3 Pro Image
    // 定价: 输出 $120/1M tokens
    // - 1K-2K: 1120 tokens = $0.134/张
    // - 4K: 2000 tokens = $0.24/张
    { id: 'nano-banana-pro', label: 'Nano Banana Pro（高质量）', provider: 'Google', type: 'image', description: '增强细节与构图，适合高质量预览' },

    // 标准 Google API 模型 ID (供高级用户直接使用)
    { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash 图像', provider: 'Google', type: 'image', description: '速度优先的原生图像生成' },
    { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro 图像（香蕉pro）', provider: 'Google', type: 'image', description: '高质量原生图像生成，细节更强' },

    // Gemini 多模态模型 (兼容图像生成)
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash（实验）', provider: 'Google', type: 'image', description: '多模态能力强，适合探索与试验' },

    // ============================================
    // Google Veo 系列 (视频生成)
    // 参考: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
    // ============================================
    { id: 'veo-3.1-generate-preview', label: 'Veo 3.1', provider: 'Google', type: 'video', description: '最新视频生成模型 (预览版)' },
    { id: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast', provider: 'Google', type: 'video', description: 'Veo 3.1 快速版' },
    { id: 'veo-3.0-generate-001', label: 'Veo 3', provider: 'Google', type: 'video', description: '稳定版视频生成模型' },
    { id: 'veo-3.0-fast-generate-001', label: 'Veo 3 Fast', provider: 'Google', type: 'video', description: 'Veo 3 快速版' },
    { id: 'veo-2.0-generate-001', label: 'Veo 2', provider: 'Google', type: 'video', description: 'Google 先进视频生成模型' },

    // ============================================
    // OpenAI (DALL-E) - 需通过第三方 API 代理
    // 参考: https://docs.newapi.pro/zh/docs
    // ============================================
    { id: 'dall-e-3', label: 'DALL-E 3', provider: 'OpenAI', type: 'image', description: 'OpenAI 最强绘图模型' },
    { id: 'dall-e-2', label: 'DALL-E 2', provider: 'OpenAI', type: 'image', description: 'OpenAI 上一代绘图模型' },

    // ============================================
    // Midjourney (需通过代理 API)
    // ============================================
    { id: 'midjourney', label: 'Midjourney V6', provider: 'Midjourney', type: 'image', description: '当前最强艺术绘图模型' },
    { id: 'mj-chat', label: 'Midjourney Chat', provider: 'Midjourney', type: 'image', description: 'MJ 对话模式' },

    // ============================================
    // Flux / Stability AI (需通过代理 API)
    // ============================================
    { id: 'flux-pro', label: 'FLUX.1 Pro', provider: 'Black Forest Labs', type: 'image', description: '顶级开源模型商业版' },
    { id: 'flux-schnell', label: 'FLUX.1 Schnell', provider: 'Black Forest Labs', type: 'image', description: 'FLUX 极速版' },
    { id: 'stable-diffusion-3.5-large', label: 'SD 3.5 Large', provider: 'Stability AI', type: 'image', description: 'Stability 最新旗舰' },

    // ============================================
    // 其他视频模型 (需通过代理 API)
    // ============================================
    { id: 'luma-dream-machine', label: 'Luma Dream Machine', provider: 'Luma', type: 'video', description: 'Luma 文生视频/图生视频' },
    { id: 'runway-gen-3-alpha', label: 'Runway Gen-3 Alpha', provider: 'Runway', type: 'video', description: 'Runway 影视级视频生成' },
    { id: 'kling-v1', label: 'Kling (可灵)', provider: 'Kuaishou', type: 'video', description: '快手可灵视频模型' },
    { id: 'cogvideox', label: 'CogVideoX', provider: 'Zhipu', type: 'video', description: '智谱 AI 视频生成' },
    { id: 'svd-xt', label: 'Stable Video Diffusion (XT)', provider: 'Stability AI', type: 'video', description: 'SVD 视频生成' },
];

export const CHAT_MODEL_PRESETS: ModelPreset[] = [
    // DeepSeek
    { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)', provider: 'DeepSeek', type: 'chat', description: '性价比极高的通用对话模型' },
    { id: 'deepseek-coder', label: 'DeepSeek Coder', provider: 'DeepSeek', type: 'chat', description: '专注于代码生成与补全' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', provider: 'DeepSeek', type: 'chat', description: 'DeepSeek 推理增强模型 (R1)' },

    // OpenAI
    { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', type: 'chat', description: 'OpenAI 旗舰全能模型' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', type: 'chat', description: '快速且低成本的轻量级模型' },
    { id: 'o1-preview', label: 'o1 Preview', provider: 'OpenAI', type: 'chat', description: 'OpenAI 强推理预览版' },

    // Anthropic
    { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet', provider: 'Anthropic', type: 'chat', description: 'Anthropic 最强平衡模型' },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', provider: 'Anthropic', type: 'chat', description: 'Anthropic 顶配模型' },
    { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', provider: 'Anthropic', type: 'chat', description: '极速响应，低延迟' },

    // SiliconFlow / Other Proxies
    { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B', provider: 'SiliconFlow', type: 'chat', description: '通义千问 7B 开源模型' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B', provider: 'SiliconFlow', type: 'chat', description: '通义千问 72B 旗舰开源模型' }
];
