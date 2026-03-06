export interface ProviderPricingSnapshot {
  fetchedAt: number;
  note?: string;
  rows?: Array<{
    model: string;
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
    _rawData: Array.isArray(pricingData) ? pricingData : [],
  };

  for (const item of Array.isArray(pricingData) ? pricingData : []) {
    const model = String(item?.model_name || item?.model || '').trim();
    if (!model) continue;

    const modelPrice = toNumber(item?.model_price);
    const modelRatio = toNumber(item?.model_ratio);
    const completionRatio = toNumber(item?.completion_ratio);
    const quotaType = item?.quota_type;
    const sizeRatio = normalizeRatioMap(item?.size_ratio);
    const groupModelRatio = normalizeRatioMap(item?.group_model_ratio);
    const groupSizeRatio = normalizeNestedRatioMap(item?.group_size_ratio);
    const groupModelPrice = normalizeGroupModelPriceMap(item?.group_model_price);

    snapshot.rows!.push({
      model,
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
  if (!snapshot.rows?.length) delete snapshot.rows;
  if (!snapshot._rawData?.length) delete snapshot._rawData;

  return snapshot;
};
