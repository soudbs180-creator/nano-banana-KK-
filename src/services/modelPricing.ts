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
};

const STORAGE_KEY = 'kk_model_pricing_overrides';
const DEFAULT_REF_IMAGE_TOKENS = 560;

const PRICING_ALIASES: Record<string, string> = {
  'nano-banana': 'gemini-2.5-flash-image',
  'nano-banana-pro': 'gemini-3-pro-image-preview'
};

const BUILTIN_PRICING: Record<string, ModelPricing> = {
  // Cherry AI Nano Banana 系列 (基于 Cherry API 定价)
  'nano-banana': {
    pricePerImage: 0.003,
    currency: 'USD'
  },
  'nano-banana-pro': {
    pricePerImage: 0.008,
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
  // Gemini 图像模型 (Token计费)
  // ============================================
  // Gemini 2.5 Flash Image
  // 输出: $30/1M tokens, 1024x1024 = 1290 tokens = $0.039/张
  'gemini-2.5-flash-image': {
    inputPerMillionTokens: 0.075,
    outputPerMillionTokens: 30,
    tokensPerImage: { standard: 1290 },
    refImageTokens: DEFAULT_REF_IMAGE_TOKENS,
    currency: 'USD'
  },
  // Gemini 3 Pro Image Preview
  // 输出: $120/1M tokens
  // 1K-2K: 1120 tokens = $0.134/张, 4K: 2000 tokens = $0.24/张
  'gemini-3-pro-image-preview': {
    inputPerMillionTokens: 3.5,
    outputPerMillionTokens: 120,
    tokensPerImage: { standard: 1120, hd: 2000 },
    refImageTokens: DEFAULT_REF_IMAGE_TOKENS,
    currency: 'USD'
  },

  // ============================================
  // Veo 视频生成模型 (固定每视频计费)
  // https://ai.google.dev/gemini-api/docs/pricing
  // 注意: Veo 模型需要付费层级,无免费额度
  // ============================================
  // Veo 3.1 系列 (最新)
  'veo-3.1-generate-preview': {
    pricePerImage: 0.50,  // 每视频估算 $0.50
    currency: 'USD'
  },
  'veo-3.1-fast-generate-preview': {
    pricePerImage: 0.25,  // 快速版 $0.25
    currency: 'USD'
  },
  // Veo 3 系列 (稳定版)
  'veo-3.0-generate-001': {
    pricePerImage: 0.50,
    currency: 'USD'
  },
  'veo-3.0-fast-generate-001': {
    pricePerImage: 0.25,
    currency: 'USD'
  },
  // Veo 2 系列
  'veo-2.0-generate-001': {
    pricePerImage: 0.35,
    currency: 'USD'
  }
};

const FALLBACK_IMAGE_TOKENS: Record<string, number> = {
  'gemini-2.5-flash-image': 1290,
  'nano-banana': 1290,
  'gemini-3-pro-image-preview': 1120,
  'nano-banana-pro': 1120
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
    currency: input.currencySymbol ?? input.currency
  };

  const hasAny = pricing.inputPerMillionTokens || pricing.outputPerMillionTokens || pricing.pricePerImage || pricing.tokensPerImage;
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
  const aliased = PRICING_ALIASES[normalized] || normalized;
  const overrides = loadOverrides();
  return overrides[aliased] || BUILTIN_PRICING[aliased] || null;
};

export const getRefImageTokenEstimate = (modelId: string): number => {
  const pricing = getModelPricing(modelId);
  return pricing?.refImageTokens || DEFAULT_REF_IMAGE_TOKENS;
};

export const getImageTokenEstimate = (modelId: string, size: ImageSize): number => {
  const pricing = getModelPricing(modelId);
  const tokens = pricing?.tokensPerImage;
  const isHd = size === ImageSize.SIZE_4K;
  const value = isHd
    ? (tokens?.hd ?? tokens?.standard)
    : (tokens?.standard ?? tokens?.hd);

  if (value) return value;

  const fallback = FALLBACK_IMAGE_TOKENS[normalizeModelId(modelId)];
  return fallback || 0;
};

export const MODEL_PRICING_STORAGE_KEY = STORAGE_KEY;
