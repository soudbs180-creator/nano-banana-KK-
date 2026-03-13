// src/services/model/adminModelQuality.ts
var ADMIN_MODEL_QUALITY_KEYS = ["0.5K", "1K", "2K", "4K"];
var normalizeAdminQualityKey = (value) => {
  const raw = String(value || "1K").toUpperCase();
  if (raw.includes("4K")) return "4K";
  if (raw.includes("2K")) return "2K";
  if (raw.includes("0.5K") || raw.includes("512")) return "0.5K";
  return "1K";
};
var createDefaultAdminQualityPricing = (baseCost = 1) => ({
  "0.5K": { enabled: true, creditCost: Math.max(1, Math.floor(Number(baseCost || 1) * 0.5)) },
  "1K": { enabled: true, creditCost: Math.max(1, Number(baseCost || 1)) },
  "2K": { enabled: true, creditCost: Math.max(1, Number(baseCost || 1) * 2) },
  "4K": { enabled: true, creditCost: Math.max(1, Number(baseCost || 1) * 4) }
});
var normalizeAdminQualityPricing = (input, fallbackCost = 1) => {
  const defaults = createDefaultAdminQualityPricing(fallbackCost);
  if (!input || typeof input !== "object") {
    return defaults;
  }
  const source = input;
  const next = { ...defaults };
  ADMIN_MODEL_QUALITY_KEYS.forEach((quality) => {
    const item = source[quality];
    if (!item || typeof item !== "object") return;
    next[quality] = {
      enabled: item.enabled !== false,
      creditCost: Math.max(1, Number(item.creditCost || defaults[quality].creditCost || fallbackCost || 1))
    };
  });
  return next;
};
var getAdminQualityRule = (advancedEnabled, qualityPricing, imageSize) => {
  const qualityKey = normalizeAdminQualityKey(imageSize);
  const pricing = qualityPricing || createDefaultAdminQualityPricing();
  const rule = pricing[qualityKey] || pricing["1K"];
  if (!advancedEnabled) {
    return {
      enabled: true,
      creditCost: Math.max(1, Number(rule?.creditCost || pricing["1K"]?.creditCost || 1))
    };
  }
  return {
    enabled: rule?.enabled !== false,
    creditCost: Math.max(1, Number(rule?.creditCost || pricing["1K"]?.creditCost || 1))
  };
};
var getAdminModelCreditCostForSize = (baseCost, advancedEnabled, qualityPricing, imageSize) => {
  if (!advancedEnabled) {
    return Math.max(1, Number(baseCost || 1));
  }
  return getAdminQualityRule(advancedEnabled, qualityPricing, imageSize).creditCost;
};
var isAdminQualityEnabled = (advancedEnabled, qualityPricing, imageSize) => {
  if (!advancedEnabled) return true;
  return getAdminQualityRule(advancedEnabled, qualityPricing, imageSize).enabled;
};
var selectBalancedProvider = (candidates) => {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { providerId: candidates[0].providerId, creditCost: candidates[0].creditCost };
  }
  const sorted = [...candidates].sort((a, b) => {
    const countA = a.callCount ?? 0;
    const countB = b.callCount ?? 0;
    if (countA !== countB) return countA - countB;
    if (a.creditCost !== b.creditCost) return a.creditCost - b.creditCost;
    return (b.weight ?? 1) - (a.weight ?? 1);
  });
  return { providerId: sorted[0].providerId, creditCost: sorted[0].creditCost };
};
export {
  ADMIN_MODEL_QUALITY_KEYS,
  createDefaultAdminQualityPricing,
  getAdminModelCreditCostForSize,
  getAdminQualityRule,
  isAdminQualityEnabled,
  normalizeAdminQualityKey,
  normalizeAdminQualityPricing,
  selectBalancedProvider
};
