import type { ModelPricingInfo } from '../billing/newApiPricingService';
import type { AdminModelQualityKey, AdminModelQualityPricing } from './adminModelQuality';
import { getModelPricing } from './modelPricing';

export const DEFAULT_CREDITS_PER_USD = 15;

export type AdminProviderVendorProfile = {
  key: string;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  endpointFamily: 'gemini' | 'openai';
  hint: string;
};

export type AdminModelCreditSuggestion = {
  recommendedCredits: number;
  recommendedQualityPricing: AdminModelQualityPricing;
  usdEstimate: number | null;
  source: 'cached_pricing' | 'builtin_pricing' | 'fallback';
  sourceLabel: string;
  note: string;
  matchedModel?: string;
};

const QUALITY_MULTIPLIERS: Record<AdminModelQualityKey, number> = {
  '0.5K': 0.5,
  '1K': 1,
  '2K': 2,
  '4K': 4,
};

const normalizeModelId = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/^models\//i, '')
    .split('@')[0]
    .toLowerCase();

const roundCredits = (value: number): number => Math.max(1, Math.ceil(value));

const buildQualityPricing = (
  qualities: AdminModelQualityKey[],
  baseCredits: number
): AdminModelQualityPricing => {
  const normalizedBase = roundCredits(baseCredits);

  return {
    '0.5K': {
      enabled: qualities.includes('0.5K'),
      creditCost: roundCredits(normalizedBase * QUALITY_MULTIPLIERS['0.5K']),
    },
    '1K': {
      enabled: qualities.includes('1K'),
      creditCost: roundCredits(normalizedBase * QUALITY_MULTIPLIERS['1K']),
    },
    '2K': {
      enabled: qualities.includes('2K'),
      creditCost: roundCredits(normalizedBase * QUALITY_MULTIPLIERS['2K']),
    },
    '4K': {
      enabled: qualities.includes('4K'),
      creditCost: roundCredits(normalizedBase * QUALITY_MULTIPLIERS['4K']),
    },
  };
};

const estimateUsdFromBuiltinPricing = (modelId: string): number | null => {
  const pricing = getModelPricing(modelId);
  if (!pricing) return null;

  if (typeof pricing.pricePerImage === 'number' && Number.isFinite(pricing.pricePerImage)) {
    return pricing.pricePerImage;
  }

  const standardTokens = pricing.tokensPerImage?.standard;
  if (
    typeof standardTokens === 'number' &&
    Number.isFinite(standardTokens) &&
    typeof pricing.outputPerMillionTokens === 'number' &&
    Number.isFinite(pricing.outputPerMillionTokens)
  ) {
    return (standardTokens / 1_000_000) * pricing.outputPerMillionTokens;
  }

  return null;
};

const estimateUsdFromCachedPricing = (
  modelId: string,
  cachedPricing?: ModelPricingInfo[] | null
): { usdEstimate: number; matchedModel: string } | null => {
  if (!Array.isArray(cachedPricing) || cachedPricing.length === 0) return null;

  const normalizedId = normalizeModelId(modelId);
  const exactMatch =
    cachedPricing.find((item) => normalizeModelId(item.modelId) === normalizedId) ||
    cachedPricing.find((item) => normalizeModelId(item.modelName) === normalizedId);

  if (!exactMatch) return null;

  if (!exactMatch.isPerToken) {
    const ratio = Number(exactMatch.groupRatio || 1);
    const perRequest = Number(exactMatch.inputPrice || 0) * (Number.isFinite(ratio) ? ratio : 1);
    if (Number.isFinite(perRequest) && perRequest > 0) {
      return {
        usdEstimate: perRequest,
        matchedModel: exactMatch.modelId || exactMatch.modelName,
      };
    }
  }

  return null;
};

const VENDOR_RULES: Array<{
  test: RegExp;
  profile: AdminProviderVendorProfile;
}> = [
  {
    test: /(googleapis|generativelanguage|gemini|imagen|veo)/,
    profile: {
      key: 'google',
      label: 'Google / Gemini',
      confidence: 'high',
      endpointFamily: 'gemini',
      hint: '识别为 Google 官方或 Gemini 兼容链路。',
    },
  },
  {
    test: /(openai|gpt-|dall-e|o1|o3|gpt-image)/,
    profile: {
      key: 'openai',
      label: 'OpenAI',
      confidence: 'medium',
      endpointFamily: 'openai',
      hint: '识别为 OpenAI 官方或 OpenAI 兼容链路。',
    },
  },
  {
    test: /(anthropic|claude)/,
    profile: {
      key: 'anthropic',
      label: 'Anthropic / Claude',
      confidence: 'medium',
      endpointFamily: 'openai',
      hint: '识别为 Claude / Anthropic 兼容链路。',
    },
  },
  {
    test: /(volc|ark\.cn|doubao)/,
    profile: {
      key: 'volcengine',
      label: 'Volcengine / Doubao',
      confidence: 'high',
      endpointFamily: 'openai',
      hint: '识别为火山引擎或豆包上游链路。',
    },
  },
  {
    test: /(aliyun|dashscope|wanx|qwen)/,
    profile: {
      key: 'aliyun',
      label: 'Aliyun / Tongyi',
      confidence: 'medium',
      endpointFamily: 'openai',
      hint: '识别为阿里云、通义千问或万相链路。',
    },
  },
  {
    test: /(tencent|hunyuan)/,
    profile: {
      key: 'tencent',
      label: 'Tencent / Hunyuan',
      confidence: 'medium',
      endpointFamily: 'openai',
      hint: '识别为腾讯混元链路。',
    },
  },
  {
    test: /(deepseek)/,
    profile: {
      key: 'deepseek',
      label: 'DeepSeek',
      confidence: 'medium',
      endpointFamily: 'openai',
      hint: '识别为 DeepSeek 官方或兼容链路。',
    },
  },
  {
    test: /(12ai)/,
    profile: {
      key: '12ai',
      label: '12AI',
      confidence: 'high',
      endpointFamily: 'gemini',
      hint: '识别为 12AI 聚合上游。',
    },
  },
  {
    test: /(siliconflow|black-forest-labs|flux)/,
    profile: {
      key: 'siliconflow',
      label: 'SiliconFlow / FLUX',
      confidence: 'medium',
      endpointFamily: 'openai',
      hint: '识别为 SiliconFlow 或 FLUX 系列链路。',
    },
  },
];

export function detectAdminProviderVendor(input: {
  providerId?: string;
  providerName?: string;
  baseUrl?: string;
  modelIds?: string[];
}): AdminProviderVendorProfile {
  const haystack = [input.providerId, input.providerName, input.baseUrl, ...(input.modelIds || [])]
    .map((value) => String(value || '').trim().toLowerCase())
    .join(' ');

  const matched = VENDOR_RULES.find((rule) => rule.test.test(haystack));
  if (matched) {
    return matched.profile;
  }

  return {
    key: 'custom',
    label: '自定义兼容厂商',
    confidence: 'low',
    endpointFamily: 'openai',
    hint: '未命中已知厂商规则，建议按实际协议和结算方式人工确认。',
  };
}

export function buildAdminModelCreditSuggestion(input: {
  modelId: string;
  currentCreditCost: number;
  supportedQualities: AdminModelQualityKey[];
  cachedPricing?: ModelPricingInfo[] | null;
  creditsPerUsd?: number;
}): AdminModelCreditSuggestion {
  const creditsPerUsd = Math.max(1, Number(input.creditsPerUsd || DEFAULT_CREDITS_PER_USD));
  const cachedPricingEstimate = estimateUsdFromCachedPricing(input.modelId, input.cachedPricing);
  const builtinUsdEstimate = estimateUsdFromBuiltinPricing(input.modelId);

  let usdEstimate: number | null = null;
  let source: AdminModelCreditSuggestion['source'] = 'fallback';
  let sourceLabel = '当前积分';
  let note = '暂未命中缓存价格或内置定价，建议先保留当前积分。';
  let matchedModel: string | undefined;

  if (cachedPricingEstimate) {
    usdEstimate = cachedPricingEstimate.usdEstimate;
    source = 'cached_pricing';
    sourceLabel = '缓存价格';
    matchedModel = cachedPricingEstimate.matchedModel;
    note = '建议来自 provider_pricing_cache 中的单次请求价格。';
  } else if (builtinUsdEstimate !== null) {
    usdEstimate = builtinUsdEstimate;
    source = 'builtin_pricing';
    sourceLabel = '内置定价';
    note = '建议来自仓库内置的模型定价参考。';
  }

  const recommendedCredits =
    usdEstimate !== null ? roundCredits(usdEstimate * creditsPerUsd) : roundCredits(input.currentCreditCost);

  return {
    recommendedCredits,
    recommendedQualityPricing: buildQualityPricing(input.supportedQualities, recommendedCredits),
    usdEstimate,
    source,
    sourceLabel,
    note,
    matchedModel,
  };
}
