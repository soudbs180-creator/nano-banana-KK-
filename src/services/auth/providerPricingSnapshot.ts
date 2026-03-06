export interface ProviderPricingSnapshot {
  fetchedAt: number;
  note?: string;
  rows?: Array<{
    model: string;
    provider?: string;
    providerLabel?: string;
    providerLogo?: string;
    tags?: string[];
    tokenGroup?: string;
    billingType?: string;
    endpointType?: string;
    modelRatio?: number;
    modelPrice?: number;
    completionRatio?: number;
    quotaType?: number | string;
    sizeRatio?: Record<string, number>;
    groupModelRatio?: Record<string, number>;
    groupSizeRatio?: Record<string, Record<string, number>>;
    groupModelPrice?: Record<string, { modelRatio?: number; completionRatio?: number; modelPrice?: number }>;
  }>;
  groupRatio?: number;
  groupRatioMap?: Record<string, number>;
  modelPrices?: Record<string, number>;
  modelRatios?: Record<string, number>;
  sizeRatios?: Record<string, Record<string, number>>;
  groupModelRatios?: Record<string, number>;
  groupModelRatioMaps?: Record<string, Record<string, number>>;
  groupSizeRatios?: Record<string, Record<string, Record<string, number>>>;
  groupModelPrices?: Record<string, Record<string, { modelRatio?: number; completionRatio?: number; modelPrice?: number }>>;
  completionRatios?: Record<string, number>;
  modelMeta?: Record<string, {
    provider?: string;
    providerLabel?: string;
    providerLogo?: string;
    tags?: string[];
    tokenGroup?: string;
    billingType?: string;
    endpointType?: string;
  }>;
  _rawData?: any[];
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeRatioMap = (value: unknown): Record<string, number> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const normalized = Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, raw]) => {
    const parsed = toNumber(raw);
    if (parsed !== undefined) {
      acc[String(key)] = parsed;
    }
    return acc;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeNestedRatioMap = (value: unknown): Record<string, Record<string, number>> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const normalized = Object.entries(value as Record<string, unknown>).reduce<Record<string, Record<string, number>>>(
    (acc, [key, raw]) => {
      const ratioMap = normalizeRatioMap(raw);
      if (ratioMap) {
        acc[String(key)] = ratioMap;
      }
      return acc;
    },
    {}
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizeGroupModelPriceMap = (
  value: unknown
): Record<string, { modelRatio?: number; completionRatio?: number; modelPrice?: number }> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const normalized = Object.entries(value as Record<string, unknown>).reduce<
    Record<string, { modelRatio?: number; completionRatio?: number; modelPrice?: number }>
  >((acc, [key, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return acc;

    const item = raw as Record<string, unknown>;
    const modelRatio = toNumber(item.model_ratio ?? item.modelRatio);
    const completionRatio = toNumber(item.completion_ratio ?? item.completionRatio);
    const modelPrice = toNumber(item.model_price ?? item.modelPrice ?? item.price);

    if (modelRatio !== undefined || completionRatio !== undefined || modelPrice !== undefined) {
      acc[String(key)] = { modelRatio, completionRatio, modelPrice };
    }

    return acc;
  }, {});

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const getDefaultGroupRatio = (groupRatioMap?: Record<string, number>): number => {
  if (!groupRatioMap) return 1;
  return (
    groupRatioMap.default ??
    groupRatioMap.Default ??
    groupRatioMap.DEFAULT ??
    Object.values(groupRatioMap).find((value) => Number.isFinite(value)) ??
    1
  );
};

export const buildProviderPricingSnapshot = (
  pricingData: any[] = [],
  groupRatioInput?: Record<string, number> | number,
  options?: { fetchedAt?: number; note?: string }
): ProviderPricingSnapshot => {
  const fetchedAt = options?.fetchedAt ?? Date.now();
  const groupRatioMap =
    typeof groupRatioInput === 'number'
      ? { default: groupRatioInput }
      : normalizeRatioMap(groupRatioInput) ?? undefined;

  const snapshot: ProviderPricingSnapshot = {
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
    _rawData: Array.isArray(pricingData) ? pricingData : [],
  };

  for (const item of Array.isArray(pricingData) ? pricingData : []) {
    const model = String(item?.model_name || item?.model || '').trim();
    if (!model) continue;

    const modelPrice = toNumber(item?.model_price);
    const modelRatio = toNumber(item?.model_ratio);
    const completionRatio = toNumber(item?.completion_ratio);
    const quotaType = item?.quota_type;
    const provider = typeof item?.provider === 'string' ? item.provider.trim() : undefined;
    const providerLabel = typeof item?.provider_label === 'string' ? item.provider_label.trim() : undefined;
    const providerLogo = typeof item?.provider_logo === 'string' ? item.provider_logo.trim() : undefined;
    const tags = Array.isArray(item?.tags)
      ? item.tags.map((value: unknown) => String(value || '').trim()).filter(Boolean)
      : undefined;
    const tokenGroup = typeof item?.token_group === 'string' ? item.token_group.trim() : undefined;
    const billingType = typeof item?.billing_type === 'string' ? item.billing_type.trim() : undefined;
    const endpointType = typeof item?.endpoint_type === 'string' ? item.endpoint_type.trim() : undefined;
    const sizeRatio = normalizeRatioMap(item?.size_ratio);
    const groupModelRatio = normalizeRatioMap(item?.group_model_ratio);
    const groupSizeRatio = normalizeNestedRatioMap(item?.group_size_ratio);
    const groupModelPrice = normalizeGroupModelPriceMap(item?.group_model_price);

    snapshot.rows!.push({
      model,
      provider,
      providerLabel,
      providerLogo,
      tags,
      tokenGroup,
      billingType,
      endpointType,
      modelRatio,
      modelPrice,
      completionRatio,
      quotaType,
      sizeRatio,
      groupModelRatio,
      groupSizeRatio,
      groupModelPrice,
    });

    if (quotaType === 1 || quotaType === 'per_request') {
      if (modelPrice !== undefined) {
        snapshot.modelPrices![model] = modelPrice;
      }
    } else if (modelRatio !== undefined) {
      snapshot.modelRatios![model] = modelRatio;
    } else if (modelPrice !== undefined) {
      snapshot.modelPrices![model] = modelPrice;
    }

    if (completionRatio !== undefined) {
      snapshot.completionRatios![model] = completionRatio;
    }

    if (provider || providerLabel || providerLogo || tags?.length || tokenGroup || billingType || endpointType) {
      snapshot.modelMeta![model] = {
        provider,
        providerLabel,
        providerLogo,
        tags,
        tokenGroup,
        billingType,
        endpointType,
      };
    }

    if (sizeRatio) {
      snapshot.sizeRatios![model] = sizeRatio;
    }

    if (groupModelRatio) {
      snapshot.groupModelRatioMaps![model] = groupModelRatio;
      snapshot.groupModelRatios![model] =
        groupModelRatio.default ??
        groupModelRatio.Default ??
        groupModelRatio.DEFAULT ??
        Object.values(groupModelRatio).find((value) => Number.isFinite(value)) ??
        1;
    }

    if (groupSizeRatio) {
      snapshot.groupSizeRatios![model] = groupSizeRatio;
    }

    if (groupModelPrice) {
      snapshot.groupModelPrices![model] = groupModelPrice;
    }
  }

  if (Object.keys(snapshot.modelPrices!).length === 0) delete snapshot.modelPrices;
  if (Object.keys(snapshot.modelRatios!).length === 0) delete snapshot.modelRatios;
  if (Object.keys(snapshot.sizeRatios!).length === 0) delete snapshot.sizeRatios;
  if (Object.keys(snapshot.groupModelRatios!).length === 0) delete snapshot.groupModelRatios;
  if (Object.keys(snapshot.groupModelRatioMaps!).length === 0) delete snapshot.groupModelRatioMaps;
  if (Object.keys(snapshot.groupSizeRatios!).length === 0) delete snapshot.groupSizeRatios;
  if (Object.keys(snapshot.groupModelPrices!).length === 0) delete snapshot.groupModelPrices;
  if (Object.keys(snapshot.completionRatios!).length === 0) delete snapshot.completionRatios;
  if (Object.keys(snapshot.modelMeta!).length === 0) delete snapshot.modelMeta;
  if (!snapshot.rows?.length) delete snapshot.rows;
  if (!snapshot._rawData?.length) delete snapshot._rawData;

  return snapshot;
};

const mergeRatioMap = <T extends Record<string, any> | undefined>(primary: T, fallback: T): T => {
  if (!primary && !fallback) return undefined as T;
  return {
    ...(fallback || {}),
    ...(primary || {}),
  } as T;
};

export const mergeProviderPricingSnapshot = (
  primary?: ProviderPricingSnapshot,
  fallback?: ProviderPricingSnapshot
): ProviderPricingSnapshot | undefined => {
  if (!primary && !fallback) return undefined;
  if (!primary) return fallback;
  if (!fallback) return primary;

  const rowsByModel = new Map<string, NonNullable<ProviderPricingSnapshot['rows']>[number]>();
  for (const row of fallback.rows || []) {
    const model = String(row?.model || '').trim();
    if (!model) continue;
    rowsByModel.set(model.toLowerCase(), { ...row });
  }
  for (const row of primary.rows || []) {
    const model = String(row?.model || '').trim();
    if (!model) continue;
    const key = model.toLowerCase();
    const previous = rowsByModel.get(key);
    rowsByModel.set(key, {
      ...(previous || {}),
      ...row,
      sizeRatio: mergeRatioMap(row.sizeRatio, previous?.sizeRatio),
      groupModelRatio: mergeRatioMap(row.groupModelRatio, previous?.groupModelRatio),
      groupSizeRatio: mergeRatioMap(row.groupSizeRatio, previous?.groupSizeRatio),
      groupModelPrice: mergeRatioMap(row.groupModelPrice, previous?.groupModelPrice),
    });
  }

  const merged: ProviderPricingSnapshot = {
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
    _rawData:
      (Array.isArray(primary._rawData) && primary._rawData.length ? primary._rawData : undefined) ||
      (Array.isArray(fallback._rawData) && fallback._rawData.length ? fallback._rawData : undefined),
  };

  if (!merged.rows?.length) delete merged.rows;
  if (!merged._rawData?.length) delete merged._rawData;

  return merged;
};
