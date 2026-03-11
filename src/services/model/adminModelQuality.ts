export type AdminModelQualityKey = '0.5K' | '1K' | '2K' | '4K';

export type AdminModelQualityRule = {
  enabled: boolean;
  creditCost: number;
};

export type AdminModelQualityPricing = Record<AdminModelQualityKey, AdminModelQualityRule>;

export const ADMIN_MODEL_QUALITY_KEYS: AdminModelQualityKey[] = ['0.5K', '1K', '2K', '4K'];

export const normalizeAdminQualityKey = (value?: string | null): AdminModelQualityKey => {
  const raw = String(value || '1K').toUpperCase();
  if (raw.includes('4K')) return '4K';
  if (raw.includes('2K')) return '2K';
  if (raw.includes('0.5K') || raw.includes('512')) return '0.5K';
  return '1K';
};

export const createDefaultAdminQualityPricing = (baseCost = 1): AdminModelQualityPricing => ({
  '0.5K': { enabled: true, creditCost: Math.max(1, Math.floor(Number(baseCost || 1) * 0.5)) },
  '1K': { enabled: true, creditCost: Math.max(1, Number(baseCost || 1)) },
  '2K': { enabled: true, creditCost: Math.max(1, Number(baseCost || 1) * 2) },
  '4K': { enabled: true, creditCost: Math.max(1, Number(baseCost || 1) * 4) },
});

export const normalizeAdminQualityPricing = (
  input: unknown,
  fallbackCost = 1
): AdminModelQualityPricing => {
  const defaults = createDefaultAdminQualityPricing(fallbackCost);
  if (!input || typeof input !== 'object') {
    return defaults;
  }

  const source = input as Record<string, any>;
  const next = { ...defaults };

  ADMIN_MODEL_QUALITY_KEYS.forEach((quality) => {
    const item = source[quality];
    if (!item || typeof item !== 'object') return;

    next[quality] = {
      enabled: item.enabled !== false,
      creditCost: Math.max(1, Number(item.creditCost || defaults[quality].creditCost || fallbackCost || 1)),
    };
  });

  return next;
};

export const getAdminQualityRule = (
  advancedEnabled: boolean,
  qualityPricing: AdminModelQualityPricing | undefined,
  imageSize?: string | null
): AdminModelQualityRule => {
  const qualityKey = normalizeAdminQualityKey(imageSize);
  const pricing = qualityPricing || createDefaultAdminQualityPricing();
  const rule = pricing[qualityKey] || pricing['1K'];

  if (!advancedEnabled) {
    return {
      enabled: true,
      creditCost: Math.max(1, Number(rule?.creditCost || pricing['1K']?.creditCost || 1)),
    };
  }

  return {
    enabled: rule?.enabled !== false,
    creditCost: Math.max(1, Number(rule?.creditCost || pricing['1K']?.creditCost || 1)),
  };
};

export const getAdminModelCreditCostForSize = (
  baseCost: number,
  advancedEnabled: boolean,
  qualityPricing: AdminModelQualityPricing | undefined,
  imageSize?: string | null
): number => {
  if (!advancedEnabled) {
    return Math.max(1, Number(baseCost || 1));
  }

  return getAdminQualityRule(advancedEnabled, qualityPricing, imageSize).creditCost;
};

export const isAdminQualityEnabled = (
  advancedEnabled: boolean,
  qualityPricing: AdminModelQualityPricing | undefined,
  imageSize?: string | null
): boolean => {
  if (!advancedEnabled) return true;
  return getAdminQualityRule(advancedEnabled, qualityPricing, imageSize).enabled;
};

/**
 * 混合模式路由选择 - 基于API用量平衡
 * 优先选择调用次数最少的供应商，实现负载均衡
 */
export const selectBalancedProvider = (
  candidates: Array<{
    providerId: string;
    creditCost: number;
    callCount?: number;
    weight?: number;
  }>
): { providerId: string; creditCost: number } | null => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { providerId: candidates[0].providerId, creditCost: candidates[0].creditCost };
  }

  // 按调用次数升序排序，优先选择用量最少的
  const sorted = [...candidates].sort((a, b) => {
    const countA = a.callCount ?? 0;
    const countB = b.callCount ?? 0;
    if (countA !== countB) return countA - countB;
    
    // 如果调用次数相同，按价格优先
    if (a.creditCost !== b.creditCost) return a.creditCost - b.creditCost;
    
    // 最后按权重
    return (b.weight ?? 1) - (a.weight ?? 1);
  });

  // 返回用量最少的供应商
  return { providerId: sorted[0].providerId, creditCost: sorted[0].creditCost };
};
