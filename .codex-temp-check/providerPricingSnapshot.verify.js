// src/services/auth/providerPricingSnapshot.ts
var toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return void 0;
};
var normalizeRatioMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const normalized = Object.entries(value).reduce((acc, [key, raw]) => {
    const parsed = toNumber(raw);
    if (parsed !== void 0) {
      acc[String(key)] = parsed;
    }
    return acc;
  }, {});
  return Object.keys(normalized).length > 0 ? normalized : void 0;
};
var normalizeNestedRatioMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const normalized = Object.entries(value).reduce(
    (acc, [key, raw]) => {
      const ratioMap = normalizeRatioMap(raw);
      if (ratioMap) {
        acc[String(key)] = ratioMap;
      }
      return acc;
    },
    {}
  );
  return Object.keys(normalized).length > 0 ? normalized : void 0;
};
var normalizeGroupModelPriceMap = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const normalized = Object.entries(value).reduce((acc, [key, raw]) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return acc;
    const item = raw;
    const modelRatio = toNumber(item.model_ratio ?? item.modelRatio);
    const completionRatio = toNumber(item.completion_ratio ?? item.completionRatio);
    const modelPrice = toNumber(item.model_price ?? item.modelPrice ?? item.price);
    if (modelRatio !== void 0 || completionRatio !== void 0 || modelPrice !== void 0) {
      acc[String(key)] = { modelRatio, completionRatio, modelPrice };
    }
    return acc;
  }, {});
  return Object.keys(normalized).length > 0 ? normalized : void 0;
};
var getDefaultGroupRatio = (groupRatioMap) => {
  if (!groupRatioMap) return 1;
  return groupRatioMap.default ?? groupRatioMap.Default ?? groupRatioMap.DEFAULT ?? Object.values(groupRatioMap).find((value) => Number.isFinite(value)) ?? 1;
};
var buildProviderPricingSnapshot = (pricingData = [], groupRatioInput, options) => {
  const fetchedAt = options?.fetchedAt ?? Date.now();
  const groupRatioMap = typeof groupRatioInput === "number" ? { default: groupRatioInput } : normalizeRatioMap(groupRatioInput) ?? void 0;
  const snapshot = {
    fetchedAt,
    note: options?.note,
    rows: [],
    groupRatio: getDefaultGroupRatio(groupRatioMap),
    groupRatioMap,
    modelPrices: {},
    modelRatios: {},
    sizeRatios: {},
    groupModelRatios: {},
    groupModelRatioMaps: {},
    groupSizeRatios: {},
    groupModelPrices: {},
    completionRatios: {},
    modelMeta: {},
    _rawData: Array.isArray(pricingData) ? pricingData : []
  };
  for (const item of Array.isArray(pricingData) ? pricingData : []) {
    const model = String(item?.model || item?.model_name || "").trim();
    if (!model) continue;
    const perRequestPrice = toNumber(item?.per_request_price ?? item?.perRequestPrice ?? item?.price_per_image ?? item?.pricePerImage);
    const modelPrice = toNumber(item?.model_price ?? item?.modelPrice) ?? perRequestPrice;
    const modelRatio = toNumber(item?.model_ratio);
    const completionRatio = toNumber(item?.completion_ratio);
    const quotaType = item?.quota_type ?? item?.quotaType ?? (perRequestPrice !== void 0 ? "per_request" : void 0);
    const provider = typeof item?.provider === "string" ? item.provider.trim() : void 0;
    const providerLabel = typeof item?.provider_label === "string" ? item.provider_label.trim() : void 0;
    const providerLogo = typeof item?.provider_logo === "string" ? item.provider_logo.trim() : void 0;
    const tags = Array.isArray(item?.tags) ? item.tags.map((value) => String(value || "").trim()).filter(Boolean) : void 0;
    const tokenGroup = typeof item?.token_group === "string" ? item.token_group.trim() : void 0;
    const billingType = typeof item?.billing_type === "string" ? item.billing_type.trim() : void 0;
    const endpointType = typeof item?.endpoint_type === "string" ? item.endpoint_type.trim() : void 0;
    const endpointUrl = typeof item?.endpoint_url === "string" ? item.endpoint_url.trim() : typeof item?.endpointUrl === "string" ? item.endpointUrl.trim() : void 0;
    const endpointPath = typeof item?.endpoint_path === "string" ? item.endpoint_path.trim() : typeof item?.endpointPath === "string" ? item.endpointPath.trim() : void 0;
    const currency = typeof item?.currency === "string" ? item.currency.trim() : void 0;
    const billingUnit = typeof item?.pay_unit === "string" ? item.pay_unit.trim() : typeof item?.billing_unit === "string" ? item.billing_unit.trim() : void 0;
    const displayPrice = typeof item?.display_price === "string" ? item.display_price.trim() : void 0;
    const sizeRatio = normalizeRatioMap(item?.size_ratio);
    const groupModelRatio = normalizeRatioMap(item?.group_model_ratio);
    const groupSizeRatio = normalizeNestedRatioMap(item?.group_size_ratio);
    const groupModelPrice = normalizeGroupModelPriceMap(item?.group_model_price);
    snapshot.rows.push({
      model,
      provider,
      providerLabel,
      providerLogo,
      tags,
      tokenGroup,
      billingType,
      endpointType,
      endpointUrl,
      endpointPath,
      modelRatio,
      modelPrice,
      perRequestPrice,
      currency,
      billingUnit,
      displayPrice,
      completionRatio,
      quotaType,
      sizeRatio,
      groupModelRatio,
      groupSizeRatio,
      groupModelPrice
    });
    if (quotaType === 1 || quotaType === "per_request") {
      if (modelPrice !== void 0) {
        snapshot.modelPrices[model] = modelPrice;
      }
    } else if (modelRatio !== void 0) {
      snapshot.modelRatios[model] = modelRatio;
    } else if (modelPrice !== void 0) {
      snapshot.modelPrices[model] = modelPrice;
    }
    if (completionRatio !== void 0) {
      snapshot.completionRatios[model] = completionRatio;
    }
    if (provider || providerLabel || providerLogo || tags?.length || tokenGroup || billingType || endpointType || endpointUrl || endpointPath) {
      snapshot.modelMeta[model] = {
        provider,
        providerLabel,
        providerLogo,
        tags,
        tokenGroup,
        billingType,
        endpointType,
        endpointUrl,
        endpointPath
      };
    }
    if (sizeRatio) {
      snapshot.sizeRatios[model] = sizeRatio;
    }
    if (groupModelRatio) {
      snapshot.groupModelRatioMaps[model] = groupModelRatio;
      snapshot.groupModelRatios[model] = groupModelRatio.default ?? groupModelRatio.Default ?? groupModelRatio.DEFAULT ?? Object.values(groupModelRatio).find((value) => Number.isFinite(value)) ?? 1;
    }
    if (groupSizeRatio) {
      snapshot.groupSizeRatios[model] = groupSizeRatio;
    }
    if (groupModelPrice) {
      snapshot.groupModelPrices[model] = groupModelPrice;
    }
  }
  if (Object.keys(snapshot.modelPrices).length === 0) delete snapshot.modelPrices;
  if (Object.keys(snapshot.modelRatios).length === 0) delete snapshot.modelRatios;
  if (Object.keys(snapshot.sizeRatios).length === 0) delete snapshot.sizeRatios;
  if (Object.keys(snapshot.groupModelRatios).length === 0) delete snapshot.groupModelRatios;
  if (Object.keys(snapshot.groupModelRatioMaps).length === 0) delete snapshot.groupModelRatioMaps;
  if (Object.keys(snapshot.groupSizeRatios).length === 0) delete snapshot.groupSizeRatios;
  if (Object.keys(snapshot.groupModelPrices).length === 0) delete snapshot.groupModelPrices;
  if (Object.keys(snapshot.completionRatios).length === 0) delete snapshot.completionRatios;
  if (Object.keys(snapshot.modelMeta).length === 0) delete snapshot.modelMeta;
  if (!snapshot.rows?.length) delete snapshot.rows;
  if (!snapshot._rawData?.length) delete snapshot._rawData;
  return snapshot;
};
var mergeRatioMap = (primary, fallback) => {
  if (!primary && !fallback) return void 0;
  return {
    ...fallback || {},
    ...primary || {}
  };
};
var mergeProviderPricingSnapshot = (primary, fallback) => {
  if (!primary && !fallback) return void 0;
  if (!primary) return fallback;
  if (!fallback) return primary;
  const rowsByModel = /* @__PURE__ */ new Map();
  for (const row of fallback.rows || []) {
    const model = String(row?.model || "").trim();
    if (!model) continue;
    rowsByModel.set(model.toLowerCase(), { ...row });
  }
  for (const row of primary.rows || []) {
    const model = String(row?.model || "").trim();
    if (!model) continue;
    const key = model.toLowerCase();
    const previous = rowsByModel.get(key);
    rowsByModel.set(key, {
      ...previous || {},
      ...row,
      sizeRatio: mergeRatioMap(row.sizeRatio, previous?.sizeRatio),
      groupModelRatio: mergeRatioMap(row.groupModelRatio, previous?.groupModelRatio),
      groupSizeRatio: mergeRatioMap(row.groupSizeRatio, previous?.groupSizeRatio),
      groupModelPrice: mergeRatioMap(row.groupModelPrice, previous?.groupModelPrice)
    });
  }
  const merged = {
    ...fallback,
    ...primary,
    fetchedAt: Math.max(primary.fetchedAt || 0, fallback.fetchedAt || 0),
    note: primary.note || fallback.note,
    groupRatio: primary.groupRatio ?? fallback.groupRatio,
    groupRatioMap: mergeRatioMap(primary.groupRatioMap, fallback.groupRatioMap),
    modelPrices: mergeRatioMap(primary.modelPrices, fallback.modelPrices),
    modelRatios: mergeRatioMap(primary.modelRatios, fallback.modelRatios),
    sizeRatios: mergeRatioMap(primary.sizeRatios, fallback.sizeRatios),
    groupModelRatios: mergeRatioMap(primary.groupModelRatios, fallback.groupModelRatios),
    groupModelRatioMaps: mergeRatioMap(primary.groupModelRatioMaps, fallback.groupModelRatioMaps),
    groupSizeRatios: mergeRatioMap(primary.groupSizeRatios, fallback.groupSizeRatios),
    groupModelPrices: mergeRatioMap(primary.groupModelPrices, fallback.groupModelPrices),
    completionRatios: mergeRatioMap(primary.completionRatios, fallback.completionRatios),
    rows: Array.from(rowsByModel.values()),
    _rawData: (Array.isArray(primary._rawData) && primary._rawData.length ? primary._rawData : void 0) || (Array.isArray(fallback._rawData) && fallback._rawData.length ? fallback._rawData : void 0)
  };
  if (!merged.rows?.length) delete merged.rows;
  if (!merged._rawData?.length) delete merged._rawData;
  return merged;
};
export {
  buildProviderPricingSnapshot,
  mergeProviderPricingSnapshot
};
