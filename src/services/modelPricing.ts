import { ImageSize } from '../types';

export type ModelPricing = {
  inputPerMillionTokens?: number;
  outputPerMillionTokens?: number;
  pricePerImage?: number;
  tokensPerImage?: {
    standard?: number;
    hd?: number;
  };
  refImageTokens?: number;
  currency?: string;
  groupMultiplier?: number;
  modelMultiplier?: number;
  completionMultiplier?: number;
};

const STORAGE_KEY = 'kk_model_pricing_overrides';
const DEFAULT_REF_IMAGE_TOKENS = 560;



const BUILTIN_PRICING: Record<string, ModelPricing> = {

  // ============================================
  // OpenAI Models (Official Pricing)
  // https://openai.com/api/pricing/
  // ============================================
  'gpt-4o': {
    inputPerMillionTokens: 2.50,
    outputPerMillionTokens: 10.00,
    currency: 'USD'
  },
  'gpt-4o-mini': {
    inputPerMillionTokens: 0.15,
    outputPerMillionTokens: 0.60,
    currency: 'USD'
  },
  'o1-preview': {
    inputPerMillionTokens: 15.00,
    outputPerMillionTokens: 60.00,
    currency: 'USD'
  },
  'o1-mini': {
    inputPerMillionTokens: 3.00,
    outputPerMillionTokens: 12.00,
    currency: 'USD'
  },
  'dall-e-3': {
    pricePerImage: 0.040, // Standard 1024x1024
    currency: 'USD'
  },

  // ============================================
  // Anthropic Models (Official Pricing)
  // https://www.anthropic.com/pricing
  // ============================================
  'claude-3-5-sonnet-20241022': {
    inputPerMillionTokens: 3.00,
    outputPerMillionTokens: 15.00,
    currency: 'USD'
  },
  'claude-3-5-haiku-20241022': {
    inputPerMillionTokens: 0.25,
    outputPerMillionTokens: 1.25,
    currency: 'USD'
  },
  'claude-3-opus-20240229': {
    inputPerMillionTokens: 15.00,
    outputPerMillionTokens: 75.00,
    currency: 'USD'
  },

  // ============================================
  // DeepSeek Models (Official Pricing)
  // https://api-docs.deepseek.com/quick_start/pricing
  // ============================================
  'deepseek-chat': { // DeepSeek-V3
    inputPerMillionTokens: 0.14, // ~1 RMB
    outputPerMillionTokens: 0.28, // ~2 RMB
    currency: 'USD' // Converted approx
  },
  'deepseek-reasoner': { // DeepSeek-R1
    inputPerMillionTokens: 0.55, // ~4 RMB
    outputPerMillionTokens: 2.19, // ~16 RMB
    currency: 'USD'
  },

  // ============================================
  // Imagen 4 系列 (Google 官方定价)
  // https://ai.google.dev/gemini-api/docs/pricing
  // ============================================
  'imagen-4.0-fast-generate-001': {
    pricePerImage: 0.02,
    currency: 'USD'
  },
  'imagen-4.0-generate-001': {
    pricePerImage: 0.04,
    currency: 'USD'
  },
  'imagen-4.0-ultra-generate-001': {
    pricePerImage: 0.06,
    currency: 'USD'
  },

  // Imagen 3 系列
  'imagen-3.0-generate-002': {
    pricePerImage: 0.04,
    currency: 'USD'
  },
  'imagen-3.0-generate-001': {
    pricePerImage: 0.04,
    currency: 'USD'
  },

  // ============================================
  // Gemini 文本模型 (Token计费)
  // https://ai.google.dev/gemini-api/docs/pricing
  // ============================================
  // Gemini 3 Pro 预览版
  'gemini-3-pro-preview': {
    inputPerMillionTokens: 2.00,   // <= 20万tokens
    outputPerMillionTokens: 12.00,  // <= 20万tokens (包括思考token)
    currency: 'USD'
  },
  // Gemini 3 Flash 预览版
  'gemini-3-flash-preview': {
    inputPerMillionTokens: 0.50,   // 文字/图片/视频
    outputPerMillionTokens: 3.00,  // 包括思考token
    currency: 'USD'
  },
  // Gemini 2.5 Pro
  'gemini-2.5-pro': {
    inputPerMillionTokens: 1.25,   // <= 20万tokens
    outputPerMillionTokens: 10.00,  // <= 20万tokens (包括思考token)
    currency: 'USD'
  },
  // Gemini 2.5 Flash
  'gemini-2.5-flash': {
    inputPerMillionTokens: 0.30,   // 文字/图片/视频
    outputPerMillionTokens: 2.50,  // 包括思考token
    currency: 'USD'
  },
  // Gemini 2.5 Flash-Lite
  'gemini-2.5-flash-lite': {
    inputPerMillionTokens: 0.10,   // 文字/图片/视频
    outputPerMillionTokens: 0.40,  // 包括思考token
    currency: 'USD'
  },

  // ============================================
  // Gemini 图像模型 (Token计费)
  // ============================================
  // Gemini 2.5 Flash Image
  // 输出: $30/1M tokens, 1024x1024 = 1290 tokens = $0.039/张
  'gemini-2.5-flash-image': {
    inputPerMillionTokens: 0.30,
    outputPerMillionTokens: 30,
    tokensPerImage: { standard: 1290 },
    refImageTokens: DEFAULT_REF_IMAGE_TOKENS,
    currency: 'USD'
  },
  // Gemini 3 Pro Image Preview
  // 输出: $120/1M tokens
  // 1K-2K: 1120 tokens = $0.134/张, 4K: 2000 tokens = $0.24/张
  'gemini-3-pro-image-preview': {
    inputPerMillionTokens: 2.00,
    outputPerMillionTokens: 120,
    tokensPerImage: { standard: 1120, hd: 2000 },
    refImageTokens: DEFAULT_REF_IMAGE_TOKENS,
    currency: 'USD'
  },

  // ============================================
  // Veo 视频生成模型 (按秒计费)
  // https://ai.google.dev/gemini-api/docs/pricing
  // 注意: Veo 模型需要付费层级,无免费额度
  // 价格为每秒价格,需要乘以视频时长
  // ============================================
  // Veo 3.1 系列 (最新)
  'veo-3.1-generate-preview': {
    pricePerImage: 0.40,  // 720p/1080p:$0.40/秒, 4K:$0.60/秒 (这里使用平均值)
    currency: 'USD'
  },
  'veo-3.1-fast-generate-preview': {
    pricePerImage: 0.15,  // 720p/1080p:$0.15/秒, 4K:$0.35/秒 (这里使用平均值)
    currency: 'USD'
  },
  // Veo 3 系列 (稳定版)
  'veo-3.0-generate-001': {
    pricePerImage: 0.40,
    currency: 'USD'
  },
  'veo-3.0-fast-generate-001': {
    pricePerImage: 0.15,
    currency: 'USD'
  },
  // Veo 2 系列
  'veo-2.0-generate-001': {
    pricePerImage: 0.35,
    currency: 'USD'
  },

  // ============================================
  // Flux (Black Forest Labs)
  // ============================================
  'flux-pro': { pricePerImage: 0.055, currency: 'USD' },
  'flux-1.1-pro': { pricePerImage: 0.055, currency: 'USD' },
  'flux-dev': { pricePerImage: 0.03, currency: 'USD' },
  'flux-schnell': { pricePerImage: 0.003, currency: 'USD' }, // Very cheap usually

  // ============================================
  // Midjourney (Proxy)
  // ============================================
  'mj-chat': { pricePerImage: 0.05, currency: 'USD' },
  'midjourney': { pricePerImage: 0.05, currency: 'USD' },

  // ============================================
  // Suno (Music)
  // ============================================
  'suno-v3.5': { pricePerImage: 0.10, currency: 'USD' }, // Tasks often cost 5 credits ~ $0.05-$0.10
  'suno-v3': { pricePerImage: 0.05, currency: 'USD' },

  // ============================================
  // Video Generation (Runway/Luma/Kling/Pika)
  // ============================================
  'runway-gen3': { pricePerImage: 0.50, currency: 'USD' }, // High cost for video
  'luma-ray': { pricePerImage: 0.50, currency: 'USD' },
  'luma-photon': { pricePerImage: 0.05, currency: 'USD' }, // Image model
  'kling-v1': { pricePerImage: 0.50, currency: 'USD' },
  'kling-v1-pro': { pricePerImage: 0.80, currency: 'USD' },
  'pika-art': { pricePerImage: 0.20, currency: 'USD' },

  // ============================================
  // Recraft / SD3
  // ============================================
  'recraft-v3': { pricePerImage: 0.04, currency: 'USD' },
  'sd3.5-large': { pricePerImage: 0.065, currency: 'USD' },
  'sd3.5-large-turbo': { pricePerImage: 0.035, currency: 'USD' },

  // ============================================
  // Alibaba (Wanx/Qwen)
  // ============================================
  'wanx-v1': { pricePerImage: 0.02, currency: 'USD' },
  'qwen-vl-max': { inputPerMillionTokens: 3.0, outputPerMillionTokens: 9.0, currency: 'USD' }, // Approx
  'qwen-vl-plus': { inputPerMillionTokens: 1.5, outputPerMillionTokens: 4.5, currency: 'USD' },

  // ============================================
  // Tencent (Hunyuan)
  // ============================================
  'hunyuan-video': { pricePerImage: 0.30, currency: 'USD' },
  'hunyuan-image': { pricePerImage: 0.02, currency: 'USD' },


};

const FALLBACK_IMAGE_TOKENS: Record<string, number> = {
  'gemini-2.5-flash-image': 1290,
  'gemini-3-pro-image-preview': 1120,
  // Imagen 4: 1K=1120 tokens, 4K=2000 tokens (估算值)
  'imagen-4.0-generate-001': 1120,
  'imagen-4.0-fast-generate-001': 1120,
  'imagen-4.0-ultra-generate-001': 1120,
  'imagen-3.0-generate-001': 1120,
  'imagen-3.0-generate-002': 1120
};

const normalizeModelId = (modelId: string): string => modelId.trim().toLowerCase();

const toNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const convertPricing = (input: any): ModelPricing | null => {
  if (!input || typeof input !== 'object') return null;

  const pricing: ModelPricing = {
    inputPerMillionTokens: toNumber(input.input_per_million_tokens ?? input.inputPerMillionTokens ?? input.input),
    outputPerMillionTokens: toNumber(input.output_per_million_tokens ?? input.outputPerMillionTokens ?? input.output),
    pricePerImage: toNumber(input.price_per_image ?? input.pricePerImage ?? input.per_image),
    tokensPerImage: input.tokens_per_image ?? input.tokensPerImage,
    refImageTokens: toNumber(input.ref_image_tokens ?? input.refImageTokens),
    currency: input.currencySymbol ?? input.currency,
    groupMultiplier: toNumber(input.group_multiplier ?? input.groupMultiplier),
    modelMultiplier: toNumber(input.model_multiplier ?? input.modelMultiplier),
    completionMultiplier: toNumber(input.completion_multiplier ?? input.completionMultiplier)
  };

  // Convert multiplier pricing to standard USD tokens if missing token pricing
  // Assumption: 500,000 quota = 1 USD -> 1M tokens = 2 USD base
  if (pricing.groupMultiplier !== undefined && pricing.modelMultiplier !== undefined) {
    if (pricing.inputPerMillionTokens === undefined) {
      pricing.inputPerMillionTokens = (pricing.groupMultiplier * pricing.modelMultiplier) * 2;
    }
    if (pricing.outputPerMillionTokens === undefined) {
      const compMult = pricing.completionMultiplier ?? 1; // Default to 1 if not provided
      pricing.outputPerMillionTokens = (pricing.groupMultiplier * pricing.modelMultiplier * compMult) * 2;
    }
  }

  const hasAny = pricing.inputPerMillionTokens !== undefined || pricing.outputPerMillionTokens !== undefined || pricing.pricePerImage !== undefined || pricing.tokensPerImage !== undefined || pricing.groupMultiplier !== undefined;
  return hasAny ? pricing : null;
};

const extractPricingMap = (raw: any): Record<string, ModelPricing> => {
  const map: Record<string, ModelPricing> = {};

  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (!item?.id) return;
      const pricing = convertPricing(item.pricing ?? item);
      if (pricing) map[normalizeModelId(item.id)] = pricing;
    });
    return map;
  }

  if (raw?.models && Array.isArray(raw.models)) {
    return extractPricingMap(raw.models);
  }

  if (raw?.data && Array.isArray(raw.data)) {
    return extractPricingMap(raw.data);
  }

  if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([id, value]) => {
      const pricing = convertPricing((value as any)?.pricing ?? value);
      if (pricing) map[normalizeModelId(id)] = pricing;
    });
  }

  return map;
};

let cachedOverrides: Record<string, ModelPricing> | null = null;

const loadOverrides = (): Record<string, ModelPricing> => {
  if (cachedOverrides) return cachedOverrides;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedOverrides = {};
      return cachedOverrides;
    }
    const parsed = JSON.parse(raw);
    cachedOverrides = extractPricingMap(parsed);
  } catch {
    cachedOverrides = {};
  }
  return cachedOverrides;
};

export const setModelPricingOverrides = (input: unknown): void => {
  const map = extractPricingMap(input);
  cachedOverrides = map;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
};

export const getModelPricing = (modelId: string): ModelPricing | null => {
  const normalized = normalizeModelId(modelId);
  // ✨ Refactored: Removed legacy aliases (Nano Banana)
  const overrides = loadOverrides();
  return overrides[normalized] || BUILTIN_PRICING[normalized] || null;
};

export const getRefImageTokenEstimate = (modelId: string): number => {
  const pricing = getModelPricing(modelId);
  return pricing?.refImageTokens || DEFAULT_REF_IMAGE_TOKENS;
};

export const getImageTokenEstimate = (modelId: string, size: ImageSize): number => {
  const pricing = getModelPricing(modelId);
  const tokens = pricing?.tokensPerImage;
  const isHd = size === ImageSize.SIZE_4K;
  const is2K = size === ImageSize.SIZE_2K;

  // 对于支持 HD/2K 的模型，使用对应的 token 数
  if (tokens) {
    if (isHd && tokens.hd) return tokens.hd;
    if (is2K && tokens.hd) return tokens.hd;
    return tokens.standard || tokens.hd || 0;
  }

  const fallback = FALLBACK_IMAGE_TOKENS[normalizeModelId(modelId)];

  // 🚀 [修复] 如果是按张定价的模型（如 Imagen），估算一个合理的 token 数用于显示
  // Imagen 4: 1K=1120 tokens, 2K=1560 tokens, 4K=2000 tokens (近似值)
  if ((fallback === 0 || fallback === undefined) && pricing?.pricePerImage) {
    if (isHd) return 2000;
    if (is2K) return 1560;
    return 1120; // Standard 1K
  }

  return fallback || 0;
};

export const MODEL_PRICING_STORAGE_KEY = STORAGE_KEY;
