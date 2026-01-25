export interface ModelPreset {
    id: string;
    label: string;
    provider: string; // 'Google' | 'OpenAI' | 'Midjourney' | 'Stability' | 'Luma' | 'Runway' | 'Other'
    type: 'image' | 'video';
    description?: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
    // ============================================
    // Google Imagen 系列 (图像生成)
    // 参考: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
    // ============================================

    // Imagen 4 - 最新图片生成模型
    // 定价: Fast $0.02/张, Ultra $0.06/张
    { id: 'imagen-4.0-generate-001', label: 'Imagen 4', provider: 'Google', type: 'image', description: '最新图片生成模型，显著提升文本渲染效果' },
    { id: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4 Ultra', provider: 'Google', type: 'image', description: 'Imagen 4 超高质量版' },
    { id: 'imagen-4.0-fast-generate-001', label: 'Imagen 4 Fast', provider: 'Google', type: 'image', description: 'Imagen 4 快速版 ($0.02/张)' },

    // Imagen 3 - 上一代模型
    { id: 'imagen-3.0-generate-002', label: 'Imagen 3', provider: 'Google', type: 'image', description: 'Google 高质量绘图模型' },
    { id: 'imagen-3.0-generate-001', label: 'Imagen 3.0 (Legacy)', provider: 'Google', type: 'image', description: 'Imagen 3.0 旧版本' },

    // ============================================
    // Google Gemini Image 系列 (原生图像生成)
    // 参考: https://ai.google.dev/gemini-api/docs/pricing?hl=zh-cn
    // ============================================

    // Nano Banana - 内部代号，映射到 Gemini 2.5 Flash Image
    // 定价: 输出 $30/1M tokens, 1024x1024 需 1290 tokens = $0.039/张
    { id: 'nano-banana', label: 'Nano Banana', provider: 'Google', type: 'image', description: '极速生成，适合快速验证灵感' },

    // Nano Banana Pro - 内部代号，映射到 Gemini 3 Pro Image
    // 定价: 输出 $120/1M tokens
    // - 1K-2K: 1120 tokens = $0.134/张
    // - 4K: 2000 tokens = $0.24/张
    { id: 'nano-banana-pro', label: 'Nano Banana Pro', provider: 'Google', type: 'image', description: '增强细节与构图，适合高质量预览' },

    // 标准 Google API 模型 ID (供高级用户直接使用)
    { id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image', provider: 'Google', type: 'image', description: '速度优化的原生图像生成 ($0.039/张)' },
    { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image', provider: 'Google', type: 'image', description: '高质量原生图像生成 (预览版)' },

    // Gemini 多模态模型 (兼容图像生成)
    { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Exp)', provider: 'Google', type: 'image', description: 'Google 多模态极速模型' },

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
