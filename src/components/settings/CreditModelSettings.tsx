import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Info, Plus, ShieldAlert, SlidersHorizontal, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notify } from '../../services/system/notificationService';
import { getCachedPricing, type ModelPricingInfo } from '../../services/billing/newApiPricingService';
import {
  ADMIN_MODEL_QUALITY_KEYS,
  type AdminModelQualityKey,
  type AdminModelQualityPricing,
  createDefaultAdminQualityPricing,
  normalizeAdminQualityPricing,
} from '../../services/model/adminModelQuality';
import {
  DEFAULT_CREDITS_PER_USD,
  buildAdminModelCreditSuggestion,
} from '../../services/model/adminModelAdvisor';
import { getModelCapabilities } from '../../services/model/modelCapabilities';
import { ImageSize } from '../../types';

type CreditModelRow = {
  provider_id: string;
  provider_name: string;
  base_url: string;
  api_keys: string[] | null;
  model_id: string;
  display_name: string;
  description: string | null;
  endpoint_type: 'openai' | 'gemini' | string;
  credit_cost: number;
  is_active: boolean;
  call_count: number | null;
  max_calls_limit: number | null;
  color: string | null;
  color_secondary: string | null;
  text_color: 'white' | 'black' | null;
  advanced_enabled?: boolean | null;
  mix_with_same_model?: boolean | null;
  quality_pricing?: Record<string, any> | null;
};

const CREDIT_MODEL_SELECT_BASE =
  'provider_id, provider_name, base_url, api_keys, model_id, display_name, description, endpoint_type, credit_cost, is_active, call_count, color, color_secondary, text_color';
const CREDIT_MODEL_SELECT_WITH_LIMIT = `${CREDIT_MODEL_SELECT_BASE}, max_calls_limit, advanced_enabled, mix_with_same_model, quality_pricing`;

const CREDIT_MODEL_OPTIONAL_COLUMNS = ['max_calls_limit', 'advanced_enabled', 'mix_with_same_model', 'quality_pricing'] as const;
type CreditModelOptionalColumn = typeof CREDIT_MODEL_OPTIONAL_COLUMNS[number];

const getCreditModelSelect = (options: {
  includeMaxCallsLimit: boolean;
  includeAdvancedSettings: boolean;
}): string => {
  const parts = [CREDIT_MODEL_SELECT_BASE];
  if (options.includeMaxCallsLimit) {
    parts.push('max_calls_limit');
  }
  if (options.includeAdvancedSettings) {
    parts.push('advanced_enabled', 'mix_with_same_model', 'quality_pricing');
  }
  return parts.join(', ');
};

const getMissingCreditModelColumns = (error: any): CreditModelOptionalColumn[] => {
  const haystack = [error?.message, error?.details, error?.hint]
    .map((item) => String(item || '').toLowerCase())
    .join(' ');

  const looksLikeMissingColumnError =
    haystack.includes('does not exist') ||
    haystack.includes('could not find') ||
    haystack.includes('column');

  if (!looksLikeMissingColumnError) {
    return [];
  }

  return CREDIT_MODEL_OPTIONAL_COLUMNS.filter((column) => haystack.includes(column));
};

type EditableModel = {
  modelId: string;
  displayName: string;
  endpointType: 'auto' | 'openai' | 'gemini';
  creditCost: number;
  description: string;
  isActive: boolean;
  maxCallsLimit: number | null;
  color: string;
  colorSecondary: string;
  textColor: 'white' | 'black';
  advancedEnabled: boolean;
  mixWithSameModel: boolean;
  qualityPricing: AdminModelQualityPricing;
};

type EditableProvider = {
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  models: EditableModel[];
};

const inferEndpointType = (modelId: string): 'openai' | 'gemini' => {
  const id = modelId.toLowerCase();
  if (id.includes('gemini') || id.includes('imagen') || id.includes('veo')) {
    return 'gemini';
  }
  return 'openai';
};

const normalizeBaseModelId = (value: string): string => {
  return (value || '').split('@')[0].trim();
};

const normalizeHexColor = (value?: string | null, fallback = ''): string => {
  let color = (value || fallback || '').trim();
  if (!color) return '';
  if (/^[A-Fa-f0-9]{3,8}$/.test(color)) {
    color = `#${color}`;
  }
  return color.toUpperCase();
};

const newModel = (): EditableModel => ({
  modelId: '',
  displayName: '',
  endpointType: 'auto',
  creditCost: 1,
  description: '',
  isActive: true,
  maxCallsLimit: null,
  color: '#3B82F6',
  colorSecondary: '',
  textColor: 'white',
  advancedEnabled: false,
  mixWithSameModel: false,
  qualityPricing: createDefaultAdminQualityPricing(1),
});

const emptyProvider = (): EditableProvider => ({
  providerId: '',
  providerName: '',
  baseUrl: '',
  apiKey: '',
  models: [newModel()],
});

const SIZE_TO_QUALITY: Record<string, AdminModelQualityKey> = {
  [ImageSize.SIZE_05K]: '0.5K',
  [ImageSize.SIZE_1K]: '1K',
  [ImageSize.SIZE_2K]: '2K',
  [ImageSize.SIZE_4K]: '4K',
};

const QUALITY_META: Record<AdminModelQualityKey, { resolution: string; hint: string }> = {
  '0.5K': { resolution: '512px', hint: '快速预览与轻量草稿' },
  '1K': { resolution: '1024px', hint: '常规出图，速度与质量均衡' },
  '2K': { resolution: '2048px', hint: '适合细节强化与展示图' },
  '4K': { resolution: '4096px', hint: '高分辨率交付与精修图' },
};

type PricingCacheStatus = 'idle' | 'loading' | 'ready' | 'empty';

const formatUsdEstimate = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '--';
  return value >= 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
};

const areQualityPricingEqual = (
  left: AdminModelQualityPricing,
  right: AdminModelQualityPricing,
  qualities: AdminModelQualityKey[]
): boolean =>
  qualities.every((quality) => {
    const leftRule = left[quality];
    const rightRule = right[quality];

    return (
      Boolean(leftRule?.enabled !== false) === Boolean(rightRule?.enabled !== false) &&
      Number(leftRule?.creditCost || 0) === Number(rightRule?.creditCost || 0)
    );
  });

const getSupportedQualities = (modelId: string): AdminModelQualityKey[] => {
  const caps = getModelCapabilities(modelId);
  const supportedSizes = caps?.supportedSizes || [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K];
  const supportedQualities = supportedSizes
    .map((size) => SIZE_TO_QUALITY[size])
    .filter((quality): quality is AdminModelQualityKey => !!quality);

  return supportedQualities.length > 0 ? supportedQualities : ADMIN_MODEL_QUALITY_KEYS;
};

type AdvancedToggleProps = {
  checked: boolean;
  label: string;
  onToggle: () => void;
  tone?: 'indigo' | 'emerald';
  size?: 'default' | 'compact';
};

const AdvancedToggle: React.FC<AdvancedToggleProps> = ({
  checked,
  label,
  onToggle,
  tone = 'indigo',
  size = 'default',
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    data-tone={tone}
    className={`credit-advanced-switch ${checked ? 'is-on' : ''} ${
      size === 'compact' ? 'credit-advanced-switch--compact' : ''
    }`}
  >
    <span className="sr-only">{label}</span>
    <span className="credit-advanced-switch__thumb" />
  </button>
);

const CreditModelSettings: React.FC = () => {
  const [rows, setRows] = useState<CreditModelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supportsMaxCallsLimit, setSupportsMaxCallsLimit] = useState(true);
  const [supportsAdvancedSettings, setSupportsAdvancedSettings] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [form, setForm] = useState<EditableProvider>(emptyProvider());
  const [cachedPricing, setCachedPricing] = useState<ModelPricingInfo[] | null>(null);
  const [pricingCacheStatus, setPricingCacheStatus] = useState<PricingCacheStatus>('idle');
  const [pricingMultiplier, setPricingMultiplier] = useState(1);

  const providers = useMemo(() => {
    const grouped = new Map<string, CreditModelRow[]>();
    for (const row of rows) {
      const key = row.provider_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    return Array.from(grouped.entries()).map(([providerId, items]) => ({ providerId, items }));
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    const providerId = form.providerId.trim();

    if (!providerId) {
      setCachedPricing(null);
      setPricingCacheStatus('idle');
      return;
    }

    setPricingCacheStatus('loading');
    void getCachedPricing(providerId)
      .then((data) => {
        if (cancelled) return;
        const nextPricing = Array.isArray(data) ? data : null;
        setCachedPricing(nextPricing);
        setPricingCacheStatus(nextPricing && nextPricing.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (cancelled) return;
        setCachedPricing(null);
        setPricingCacheStatus('empty');
      });

    return () => {
      cancelled = true;
    };
  }, [form.providerId]);

  const modelMixSnapshots = useMemo(() => {
    const currentProviderId = form.providerId.trim() || '__draft_provider__';
    const currentProviderName = form.providerName.trim() || form.providerId.trim() || '当前供应商';
    const providerNameMap = new Map<string, string>();
    const routeProvidersByBaseId = new Map<string, Set<string>>();

    rows
      .filter((row) => row.provider_id !== currentProviderId)
      .forEach((row) => {
        const baseId = normalizeBaseModelId(row.model_id);
        if (!baseId) return;
        if (!routeProvidersByBaseId.has(baseId)) {
          routeProvidersByBaseId.set(baseId, new Set());
        }
        routeProvidersByBaseId.get(baseId)!.add(row.provider_id);
        providerNameMap.set(row.provider_id, row.provider_name || row.provider_id);
      });

    form.models.forEach((model) => {
      const baseId = normalizeBaseModelId(model.modelId);
      if (!baseId) return;
      if (!routeProvidersByBaseId.has(baseId)) {
        routeProvidersByBaseId.set(baseId, new Set());
      }
      routeProvidersByBaseId.get(baseId)!.add(currentProviderId);
      providerNameMap.set(currentProviderId, currentProviderName);
    });

    return form.models.map((model, index) => {
      const baseModelId = normalizeBaseModelId(model.modelId);
      const providerIds = baseModelId ? Array.from(routeProvidersByBaseId.get(baseModelId) || []) : [];
      const peerProviderIds = providerIds.filter((providerId) => providerId !== currentProviderId);

      return {
        index,
        baseModelId,
        routeCount: providerIds.length,
        peerProviderCount: peerProviderIds.length,
        peerProviders: peerProviderIds.map((providerId) => providerNameMap.get(providerId) || providerId),
      };
    });
  }, [rows, form.providerId, form.providerName, form.models]);

  const creditsPerUsd = useMemo(
    () => Math.max(1, DEFAULT_CREDITS_PER_USD * pricingMultiplier),
    [pricingMultiplier]
  );

  const modelSuggestions = useMemo(
    () =>
      form.models.map((model, index) => {
        const baseModelId = normalizeBaseModelId(model.modelId);
        const supportedQualities = getSupportedQualities(baseModelId || model.modelId);
        const suggestion = buildAdminModelCreditSuggestion({
          modelId: baseModelId || model.modelId,
          currentCreditCost: Number(model.creditCost || 1),
          supportedQualities,
          cachedPricing,
          creditsPerUsd,
        });

        const qualitySuggestionChanged =
          supportsAdvancedSettings &&
          !areQualityPricingEqual(model.qualityPricing, suggestion.recommendedQualityPricing, supportedQualities);

        return {
          index,
          baseModelId,
          supportedQualities,
          suggestion,
          mixSnapshot: modelMixSnapshots[index],
          hasSuggestedChange:
            suggestion.recommendedCredits !== Number(model.creditCost || 1) || qualitySuggestionChanged,
        };
      }),
    [form.models, cachedPricing, creditsPerUsd, modelMixSnapshots, supportsAdvancedSettings]
  );

  const pricingCacheSummary = useMemo(() => {
    if (pricingCacheStatus === 'loading') return '正在读取价格缓存...';
    if (pricingCacheStatus === 'ready') {
      return `已读取 ${cachedPricing?.length || 0} 条缓存价格，优先用于积分建议。`;
    }
    if (pricingCacheStatus === 'empty') {
      return '未找到缓存价格，将自动回退到内置定价或当前积分。';
    }
    return '填写供应商 ID 后会自动尝试读取价格缓存。';
  }, [cachedPricing, pricingCacheStatus]);

  const suggestionChangeCount = modelSuggestions.filter((item) => item.hasSuggestedChange).length;

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_credit_models')
        .select(CREDIT_MODEL_SELECT_WITH_LIMIT)
        .order('provider_id', { ascending: true })
        .order('priority', { ascending: false });

      const missingColumns = getMissingCreditModelColumns(error);
      if (error && missingColumns.length > 0) {
        const fallbackSelect = getCreditModelSelect({
          includeMaxCallsLimit: !missingColumns.includes('max_calls_limit'),
          includeAdvancedSettings: !missingColumns.some((column) =>
            ['advanced_enabled', 'mix_with_same_model', 'quality_pricing'].includes(column)
          ),
        });

        const legacy = await supabase
          .from('admin_credit_models')
          .select(fallbackSelect)
          .order('provider_id', { ascending: true })
          .order('priority', { ascending: false });

        if (legacy.error) throw legacy.error;

        const normalized = ((legacy.data || []) as Array<Partial<CreditModelRow>>).map((row) => ({
          ...row,
          provider_id: row.provider_id || '',
          provider_name: row.provider_name || '',
          base_url: row.base_url || '',
          api_keys: row.api_keys || [],
          model_id: row.model_id || '',
          display_name: row.display_name || '',
          description: row.description || '',
          endpoint_type: row.endpoint_type || 'openai',
          credit_cost: Number(row.credit_cost || 1),
          is_active: row.is_active !== false,
          call_count: row.call_count ?? null,
          max_calls_limit: !missingColumns.includes('max_calls_limit') ? row.max_calls_limit ?? null : null,
          color: row.color || '#3B82F6',
          color_secondary: row.color_secondary || null,
          text_color: row.text_color === 'black' ? 'black' : 'white',
          advanced_enabled: missingColumns.includes('advanced_enabled') ? false : Boolean(row.advanced_enabled),
          mix_with_same_model: missingColumns.includes('mix_with_same_model') ? false : Boolean(row.mix_with_same_model),
          quality_pricing: missingColumns.includes('quality_pricing') ? null : row.quality_pricing ?? null,
        }));

        setRows(normalized as CreditModelRow[]);
        setSupportsMaxCallsLimit(!missingColumns.includes('max_calls_limit'));
        setSupportsAdvancedSettings(
          !missingColumns.includes('advanced_enabled') &&
            !missingColumns.includes('mix_with_same_model') &&
            !missingColumns.includes('quality_pricing')
        );
        notify.warning(
          '已启用兼容模式',
          `当前数据库缺少字段：${missingColumns.join('、')}。模型已正常加载，执行最新 Supabase 迁移后可启用对应能力。`
        );
        return;
      }

      if (error) throw error;
      setRows((data || []) as CreditModelRow[]);
      setSupportsMaxCallsLimit(true);
      setSupportsAdvancedSettings(true);
    } catch (error: any) {
      notify.error('加载失败', error.message || '无法加载积分模型配置');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const loadProviderRows = async (providerId: string): Promise<CreditModelRow[]> => {
    const { data, error } = await supabase
      .from('admin_credit_models')
      .select(CREDIT_MODEL_SELECT_BASE)
      .eq('provider_id', providerId)
      .order('priority', { ascending: false });

    if (error) throw error;
    return (data || []) as CreditModelRow[];
  };

  const needsDirectStyleRepair = (
    savedRows: CreditModelRow[],
    payloadModels: Array<{
      model_id: string;
      color: string;
      color_secondary: string | null;
      text_color: 'white' | 'black';
    }>
  ) => {
    const rowMap = new Map(
      savedRows.map((row) => [normalizeBaseModelId(row.model_id), row] as const)
    );

    return payloadModels.some((model) => {
      const saved = rowMap.get(normalizeBaseModelId(model.model_id));
      if (!saved) return true;

      const expectedPrimary = normalizeHexColor(model.color, '#3B82F6');
      const savedPrimary = normalizeHexColor(saved.color, '#3B82F6');
      if (savedPrimary !== expectedPrimary) return true;

      const expectedSecondary = normalizeHexColor(model.color_secondary);
      const savedSecondary = normalizeHexColor(saved.color_secondary);
      if (expectedSecondary && savedSecondary !== expectedSecondary) return true;

      const expectedText = model.text_color === 'black' ? 'black' : 'white';
      const savedText = saved.text_color === 'black' ? 'black' : 'white';
      if (savedText !== expectedText) return true;

      return false;
    });
  };

  const saveProviderDirect = async (
    payloadModels: Array<{
      model_id: string;
      display_name: string;
      description: string;
      endpoint_type: string;
      credit_cost: number;
      priority: number;
      weight: number;
      is_active: boolean;
      color: string;
      color_secondary: string | null;
      text_color: 'white' | 'black';
      max_calls_limit?: number | null;
      auto_pause_on_limit?: boolean;
    }>
  ) => {
    const providerId = form.providerId.trim();
    const providerName = form.providerName.trim();
    const baseUrl = form.baseUrl.trim();
    const apiKey = form.apiKey.trim();

    const { error: deleteError } = await supabase
      .from('admin_credit_models')
      .delete()
      .eq('provider_id', providerId);

    if (deleteError) throw deleteError;

    const rowsToInsert = payloadModels.map((item) => ({
      provider_id: providerId,
      provider_name: providerName,
      base_url: baseUrl,
      api_keys: [apiKey],
      model_id: normalizeBaseModelId(item.model_id),
      display_name: item.display_name.trim(),
      description: item.description || '',
      endpoint_type: item.endpoint_type,
      credit_cost: Number(item.credit_cost || 1),
      priority: item.priority,
      weight: item.weight,
      is_active: Boolean(item.is_active),
      color: normalizeHexColor(item.color, '#3B82F6') || '#3B82F6',
      color_secondary: normalizeHexColor(item.color_secondary) || null,
      text_color: item.text_color === 'black' ? 'black' : 'white',
      gradient: 'from-blue-500 to-indigo-600',
      ...(supportsMaxCallsLimit
        ? {
            max_calls_limit: item.max_calls_limit ?? null,
            auto_pause_on_limit: item.auto_pause_on_limit ?? true,
          }
        : {}),
    }));

    const { error: insertError } = await supabase
      .from('admin_credit_models')
      .insert(rowsToInsert);

    if (insertError) throw insertError;
  };

  const refreshAdminModelSync = async () => {
    const [{ adminModelService }, { unifiedModelService }] = await Promise.all([
      import('../../services/model/adminModelService'),
      import('../../services/model/unifiedModelService'),
    ]);

    await adminModelService.forceLoadAdminModels();
    await unifiedModelService.refreshModels();
  };

  useEffect(() => {
    if (!selectedProviderId) return;
    const entry = providers.find((item) => item.providerId === selectedProviderId);
    if (!entry) return;
    const first = entry.items[0];
    setForm({
      providerId: first.provider_id,
      providerName: first.provider_name,
      baseUrl: first.base_url,
      apiKey: first.api_keys?.[0] || '',
      models: entry.items.map((row) => ({
        modelId: normalizeBaseModelId(row.model_id),
        displayName: row.display_name,
        endpointType: row.endpoint_type === 'gemini' ? 'gemini' : 'openai',
        creditCost: Number(row.credit_cost || 1),
        description: row.description || '',
        isActive: Boolean(row.is_active),
        maxCallsLimit: row.max_calls_limit,
        color: row.color || '#3B82F6',
        colorSecondary: row.color_secondary || '',
        textColor: row.text_color === 'black' ? 'black' : 'white',
        advancedEnabled: Boolean(row.advanced_enabled),
        mixWithSameModel: Boolean(row.mix_with_same_model),
        qualityPricing: normalizeAdminQualityPricing(row.quality_pricing, Number(row.credit_cost || 1)),
      })),
    });
  }, [providers, selectedProviderId]);

  const resetForm = () => {
    setSelectedProviderId('');
    setForm(emptyProvider());
  };

  const updateModelAt = (index: number, patch: Partial<EditableModel>) => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const updateModelQualityAt = (
    index: number,
    quality: AdminModelQualityKey,
    patch: Partial<AdminModelQualityPricing[AdminModelQualityKey]>
  ) => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          qualityPricing: {
            ...item.qualityPricing,
            [quality]: {
              ...item.qualityPricing[quality],
              ...patch,
            },
          },
        };
      }),
    }));
  };

  const addModel = () => {
    setForm((prev) => ({
      ...prev,
      models: [...prev.models, newModel()],
    }));
  };

  const removeModel = (index: number) => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index),
    }));
  };

  const applySuggestionToModel = (index: number) => {
    const entry = modelSuggestions[index];
    if (!entry) return;

    setForm((prev) => ({
      ...prev,
      models: prev.models.map((item, i) =>
        i === index
          ? {
              ...item,
              creditCost: entry.suggestion.recommendedCredits,
              qualityPricing: supportsAdvancedSettings
                ? entry.suggestion.recommendedQualityPricing
                : item.qualityPricing,
            }
          : item
      ),
    }));
  };

  const applyAllSuggestions = () => {
    setForm((prev) => ({
      ...prev,
      models: prev.models.map((item, index) => {
        const entry = modelSuggestions[index];
        if (!entry) return item;

        return {
          ...item,
          creditCost: entry.suggestion.recommendedCredits,
          qualityPricing: supportsAdvancedSettings
            ? entry.suggestion.recommendedQualityPricing
            : item.qualityPricing,
        };
      }),
    }));

    notify.success(
      '建议已应用',
      supportsAdvancedSettings ? '积分与画质矩阵已回填建议值。' : '基础积分已回填建议值。'
    );
  };

  const saveProvider = async () => {
    if (!form.providerId.trim() || !form.providerName.trim() || !form.baseUrl.trim()) {
      notify.error('缺少字段', '供应商 ID、名称和基础 地址 为必填项');
      return;
    }
    if (!form.apiKey.trim()) {
      notify.error('缺少 接口密钥', '请填写上游 接口密钥');
      return;
    }

    const validModels = form.models.filter((item) => item.modelId.trim() && item.displayName.trim());
    if (validModels.length === 0) {
      notify.error('模型无效', '至少配置一个有效模型');
      return;
    }

    setSaving(true);
    try {
      const payloadModels = validModels.map((item, index) => ({
        model_id: normalizeBaseModelId(item.modelId),
        display_name: item.displayName.trim(),
        description: item.description || '',
        endpoint_type: item.endpointType === 'auto' ? inferEndpointType(item.modelId) : item.endpointType,
        credit_cost: Number(item.creditCost || 1),
        advanced_enabled: Boolean(item.advancedEnabled),
        mix_with_same_model: Boolean(item.mixWithSameModel),
        quality_pricing: ADMIN_MODEL_QUALITY_KEYS.reduce<Record<string, { enabled: boolean; creditCost: number }>>((acc, quality) => {
          const rule = item.qualityPricing[quality];
          acc[quality] = {
            enabled: rule.enabled !== false,
            creditCost: Math.max(1, Number(rule.creditCost || item.creditCost || 1)),
          };
          return acc;
        }, {}),
        priority: 10 - index,
        weight: 1,
        is_active: Boolean(item.isActive),
        color: item.color || '#3B82F6',
        color_secondary: item.colorSecondary || null,
        text_color: item.textColor,
        ...(supportsMaxCallsLimit
          ? {
              max_calls_limit: item.maxCallsLimit && item.maxCallsLimit > 0 ? item.maxCallsLimit : null,
              auto_pause_on_limit: true,
            }
          : {}),
      }));

      const providerId = form.providerId.trim();
      const { error } = await supabase.rpc('save_credit_provider', {
        p_provider_id: providerId,
        p_provider_name: form.providerName.trim(),
        p_base_url: form.baseUrl.trim(),
        p_api_keys: [form.apiKey.trim()],
        p_models: payloadModels,
      });

      if (error) {
        throw error;
      }

      notify.success('保存成功', '积分模型配置已更新');
      await load();
      setSelectedProviderId(providerId);
      await refreshAdminModelSync();
    } catch (error: any) {
      notify.error('保存失败', error.message || '请检查 Supabase 权限和 RPC');
    } finally {
      setSaving(false);
    }
  };

  const deleteProvider = async (providerId: string) => {
    if (!confirm(`确认删除供应商 ${providerId} 及其全部积分模型吗？`)) return;
    try {
      const { error } = await supabase.rpc('delete_credit_provider', {
        p_provider_id: providerId,
      });
      if (error) throw error;
      notify.success('删除成功', '供应商积分模型已删除');
      if (selectedProviderId === providerId) resetForm();
      await load();
    } catch (error: any) {
      notify.error('删除失败', error.message || '请使用正确权限后重试');
    }
  };

  return (
    <div className="space-y-4">
      <div className="settings-intent-card settings-intent-card--warning">
        <div className="settings-intent-card__title">
          <ShieldAlert className="h-4 w-4" />
          积分模型配置（全局）
        </div>
        <p className="settings-intent-card__body">
          这里配置的是管理员全局积分模型，会同步给所有用户。用户自己的接口配置不在本页面修改。
        </p>
      </div>

      <div className="settings-action-row">
        <button
          onClick={() => void load()}
          disabled={loading}
          className="apple-button-secondary min-h-10 px-3 text-xs"
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
        <button
          onClick={resetForm}
          className="apple-button-secondary min-h-10 px-3 text-xs"
        >
          新建供应商
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px,minmax(0,1fr)]">
        <div className="settings-section-card self-start p-3 xl:sticky xl:top-4">
          <div className="mb-2 text-xs text-[var(--text-tertiary)]">已配置供应商</div>
          <div className="settings-scroll-region space-y-2 pr-1">
            {providers.length === 0 ? (
              <div className="apple-empty-state rounded-lg border border-dashed border-[var(--border-light)] p-3 text-xs text-[var(--text-tertiary)]">
                暂无积分供应商配置。
              </div>
            ) : (
              providers.map((item) => {
                const first = item.items[0];
                const activeCount = item.items.filter((m) => m.is_active).length;
                return (
                  <div
                    key={item.providerId}
                    className={`rounded-lg border p-2 ${selectedProviderId === item.providerId ? 'border-indigo-400/60 bg-indigo-500/10' : 'border-[var(--border-light)]'}`}
                  >
                    <button onClick={() => setSelectedProviderId(item.providerId)} className="w-full text-left">
                      <div className="text-sm text-[var(--text-primary)]">{first.provider_name}</div>
                      <div className="text-[11px] text-[var(--text-tertiary)]">{item.providerId}</div>
                      <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                        模型总数：{item.items.length} | 启用：{activeCount}
                      </div>
                    </button>
                    <button
                      onClick={() => void deleteProvider(item.providerId)}
                      className="settings-danger-text mt-2 inline-flex items-center gap-1 text-[11px]"
                    >
                      删除
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="settings-section-card space-y-4 p-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-[var(--text-primary)]">供应商基础信息</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] text-[var(--text-tertiary)]">供应商 编号（唯一）</span>
                <input
                  value={form.providerId}
                  onChange={(e) => setForm((prev) => ({ ...prev, providerId: e.target.value }))}
                  placeholder="例如：cdn.12ai"
                  className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-[var(--text-tertiary)]">供应商名称</span>
                <input
                  value={form.providerName}
                  onChange={(e) => setForm((prev) => ({ ...prev, providerName: e.target.value }))}
                  placeholder="例如：官方镜像"
                  className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-[var(--text-tertiary)]">基础 地址</span>
                <input
                  value={form.baseUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                  placeholder="例如：https://api.example.com/v1"
                  className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-[var(--text-tertiary)]">上游 接口密钥</span>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="请输入上游 接口密钥"
                  className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">价格建议 / 快速调节</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">
                    依据缓存价格、内置定价和积分换算系数，快速回填每个模型的推荐积分。
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyAllSuggestions}
                  disabled={suggestionChangeCount === 0}
                  className="apple-button-secondary min-h-9 px-3 text-[11px] disabled:opacity-60"
                >
                  应用全部建议
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr),120px]">
                <div className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2">
                  <div className="text-[11px] font-medium text-[var(--text-primary)]">
                    $1 ≈ {DEFAULT_CREDITS_PER_USD} 积分 × 系数 = {creditsPerUsd.toFixed(1)} 积分
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--text-tertiary)]">
                    {pricingCacheSummary}
                  </div>
                </div>
                <label className="space-y-1">
                  <span className="text-[11px] text-[var(--text-tertiary)]">调节系数</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={pricingMultiplier}
                    onChange={(e) => {
                      const nextValue = Number(e.target.value);
                      setPricingMultiplier(Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1);
                    }}
                    className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-3 space-y-2">
                {modelSuggestions.filter((item) => item.baseModelId).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border-light)] px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
                    添加模型后，这里会自动显示当前积分与建议积分的对照。
                  </div>
                ) : (
                  modelSuggestions
                    .filter((item) => item.baseModelId)
                    .map((item) => {
                      const model = form.models[item.index];
                      const qualityPreview = item.supportedQualities
                        .map(
                          (quality) =>
                            `${quality}: ${item.suggestion.recommendedQualityPricing[quality].creditCost}`
                        )
                        .join(' / ');

                      return (
                        <div
                          key={`${item.baseModelId}-${item.index}`}
                          className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-[var(--text-primary)]">
                                {model.displayName || item.baseModelId}
                              </div>
                              <div className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">
                                当前 {model.creditCost} 积分 → 建议 {item.suggestion.recommendedCredits} 积分
                              </div>
                              <div className="text-[11px] leading-5 text-[var(--text-tertiary)]">
                                来源：{item.suggestion.sourceLabel}
                                {item.suggestion.usdEstimate !== null
                                  ? ` · 估算单次成本 ${formatUsdEstimate(item.suggestion.usdEstimate)}`
                                  : ''}
                                {item.suggestion.matchedModel ? ` · 匹配 ${item.suggestion.matchedModel}` : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => applySuggestionToModel(item.index)}
                              disabled={!item.hasSuggestedChange}
                              className="apple-button-secondary min-h-9 px-3 text-[11px] disabled:opacity-60"
                            >
                              套用建议
                            </button>
                          </div>
                          <div className="mt-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
                            {item.suggestion.note}
                          </div>
                          {supportsAdvancedSettings && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <span className="rounded-full bg-indigo-500/14 px-2 py-1 text-[10px] font-medium text-indigo-200">
                                画质矩阵建议
                              </span>
                              <span className="text-[10px] leading-5 text-[var(--text-tertiary)]">
                                {qualityPreview} 积分
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-[var(--text-primary)]">模型配置</div>
            {!supportsMaxCallsLimit && (
              <div className="settings-intent-card settings-intent-card--warning px-3 py-2 text-[11px]">
                当前数据库未包含总调用上限字段（`max_calls_limit`），已自动降级兼容。
                执行最新 Supabase 迁移后，可启用“总调用上限/自动暂停”能力。
              </div>
            )}
            {!supportsAdvancedSettings && (
              <div className="settings-intent-card settings-intent-card--warning px-3 py-2 text-[11px]">
                当前数据库未包含高级设置字段（`advanced_enabled / mix_with_same_model / quality_pricing`），
                已自动隐藏画质定价与混合路由配置。执行最新 Supabase 迁移后即可启用。
              </div>
            )}
            {form.models.map((model, index) => {
              const callsUsed = rows.find(
                (row) => row.provider_id === form.providerId && row.model_id === model.modelId
              )?.call_count;
              const qualitiesToShow = getSupportedQualities(model.modelId);
              const enabledQualityCount = qualitiesToShow.filter(
                (quality) => model.qualityPricing[quality]?.enabled !== false
              ).length;

              return (
                <div key={`${model.modelId}-${index}`} className="rounded-xl border border-[var(--border-light)] p-3 space-y-2">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-[11px] text-[var(--text-tertiary)]">模型编号</span>
                      <input
                        value={model.modelId}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) => (i === index ? { ...item, modelId: value } : item)),
                          }));
                        }}
                        placeholder="例如：gemini-2.5-flash"
                        className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-[var(--text-tertiary)]">显示名称</span>
                      <input
                        value={model.displayName}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) => (i === index ? { ...item, displayName: value } : item)),
                          }));
                        }}
                        placeholder="例如：Gemini 2.5 Flash"
                        className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-[var(--text-tertiary)]">接口类型</span>
                      <select
                        value={model.endpointType}
                        onChange={(e) => {
                          const value = e.target.value as EditableModel['endpointType'];
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) => (i === index ? { ...item, endpointType: value } : item)),
                          }));
                        }}
                        className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                      >
                        <option value="auto">自动判断</option>
                        <option value="openai">通用兼容接口</option>
                        <option value="gemini">谷歌接口</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        积分消耗
                        {model.advancedEnabled && (
                          <span className="ml-1.5 text-[10px] text-indigo-400">(高级模式)</span>
                        )}
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={model.creditCost}
                        onChange={(e) => {
                          const value = Number(e.target.value || 1);
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) => (
                              i === index
                                ? {
                                    ...item,
                                    creditCost: value,
                                    qualityPricing: item.advancedEnabled ? item.qualityPricing : createDefaultAdminQualityPricing(value),
                                  }
                                : item
                            )),
                          }));
                        }}
                        className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                      />
                      {model.advancedEnabled && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {qualitiesToShow.map((quality) => {
                            const rule = model.qualityPricing[quality];
                            const isEnabled = rule.enabled !== false;
                            const qualityMeta = QUALITY_META[quality];

                            return (
                              <span
                                key={quality}
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium ${
                                  isEnabled
                                    ? 'bg-indigo-500/14 text-indigo-500 dark:text-indigo-200'
                                    : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)]'
                                }`}
                              >
                                <span>{qualityMeta.resolution}</span>
                                <span>{rule.creditCost} 积分</span>
                                {!isEnabled ? <span className="opacity-80">已停用</span> : null}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-[var(--text-tertiary)]">主颜色</span>
                      <input
                        type="color"
                        value={model.color}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) => (i === index ? { ...item, color: value } : item)),
                          }));
                        }}
                        className="h-10 w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-2"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-[var(--text-tertiary)]">副颜色（可选）</span>
                      <input
                        type="color"
                        value={model.colorSecondary || '#3B82F6'}
                        onChange={(e) => {
                          const value = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) => (i === index ? { ...item, colorSecondary: value } : item)),
                          }));
                        }}
                        className="h-10 w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-2"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-[var(--text-tertiary)]">文本颜色</span>
                      <select
                        value={model.textColor}
                        onChange={(e) => {
                          const value = e.target.value as 'white' | 'black';
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) => (i === index ? { ...item, textColor: value } : item)),
                          }));
                        }}
                        className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                      >
                        <option value="white">白色</option>
                        <option value="black">黑色</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-[var(--text-tertiary)]">总调用上限（留空为无限）</span>
                      <input
                        type="number"
                        min={1}
                        disabled={!supportsMaxCallsLimit}
                        value={model.maxCallsLimit ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const value = raw ? Number(raw) : null;
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) =>
                              i === index ? { ...item, maxCallsLimit: value && value > 0 ? value : null } : item
                            ),
                          }));
                        }}
                        placeholder="默认无限"
                        className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </label>
                  </div>

                  <label className="space-y-1 block">
                    <span className="text-[11px] text-[var(--text-tertiary)]">描述（可选）</span>
                    <input
                      value={model.description}
                      onChange={(e) => {
                        const value = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          models: prev.models.map((item, i) => (i === index ? { ...item, description: value } : item)),
                        }));
                      }}
                      placeholder="例如：高质量图像生成，适合专业设计"
                      className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                    />
                  </label>

                  {supportsAdvancedSettings && (
                    <div className="credit-advanced-panel">
                      <div className="credit-advanced-panel__header">
                        <div className="credit-advanced-panel__intro">
                          <div className="credit-advanced-panel__icon">
                            <SlidersHorizontal size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="credit-advanced-panel__eyebrow">Advanced Controls</div>
                            <div className="credit-advanced-panel__title-row">
                              <div className="credit-advanced-panel__title">高级设置</div>
                              <span className={`credit-advanced-panel__status ${model.advancedEnabled ? 'is-on' : ''}`}>
                                {model.advancedEnabled ? '已启用' : '未启用'}
                              </span>
                            </div>
                            <div className="credit-advanced-panel__description">
                              把复杂配置收敛成两件事：混合路由和分辨率定价。
                            </div>
                          </div>
                        </div>
                        <div className="credit-advanced-panel__control">
                          <div className="credit-advanced-panel__control-label">启用高级策略</div>
                          <AdvancedToggle
                            checked={model.advancedEnabled}
                            label="启用高级设置"
                            onToggle={() => {
                              const enabled = !model.advancedEnabled;
                              updateModelAt(index, {
                                advancedEnabled: enabled,
                                qualityPricing: normalizeAdminQualityPricing(model.qualityPricing, model.creditCost),
                              });
                            }}
                          />
                        </div>
                      </div>

                      {model.advancedEnabled && (
                        <div className="credit-advanced-panel__body">
                          <div className="credit-advanced-grid">
                            <div className="credit-advanced-card">
                              <div className="credit-advanced-card__head">
                                <div className="credit-advanced-card__icon-badge credit-advanced-card__icon-badge--emerald">
                                  <ArrowRightLeft size={15} />
                                </div>
                                <div>
                                  <div className="credit-advanced-card__title">多供应商混合</div>
                                  <div className="credit-advanced-card__description">
                                    自动均衡同模型下的请求量，优先使用调用次数较少的供应商。
                                  </div>
                                </div>
                              </div>
                              <div className="credit-advanced-card__footer">
                                <span className={`credit-advanced-card__pill ${model.mixWithSameModel ? 'is-on' : ''}`}>
                                  {model.mixWithSameModel ? '自动均衡已开启' : '保持单供应商'}
                                </span>
                                <AdvancedToggle
                                  checked={model.mixWithSameModel}
                                  label="启用多供应商混合"
                                  onToggle={() => updateModelAt(index, { mixWithSameModel: !model.mixWithSameModel })}
                                  tone="emerald"
                                />
                              </div>
                            </div>

                            <div className="credit-advanced-card">
                              <div className="credit-advanced-card__head">
                                <div className="credit-advanced-card__icon-badge credit-advanced-card__icon-badge--indigo">
                                  <Sparkles size={15} />
                                </div>
                                <div>
                                  <div className="credit-advanced-card__title">画质定价</div>
                                  <div className="credit-advanced-card__description">
                                    按分辨率单独设置积分成本，方便把高质量出图与默认费率区分开。
                                  </div>
                                </div>
                              </div>
                              <div className="credit-advanced-card__stats">
                                <div className="credit-advanced-card__stat">
                                  <span className="credit-advanced-card__stat-label">可配置规格</span>
                                  <span className="credit-advanced-card__stat-value">{qualitiesToShow.length}</span>
                                </div>
                                <div className="credit-advanced-card__stat">
                                  <span className="credit-advanced-card__stat-label">当前启用</span>
                                  <span className="credit-advanced-card__stat-value">{enabledQualityCount}</span>
                                </div>
                                <div className="credit-advanced-card__stat">
                                  <span className="credit-advanced-card__stat-label">默认积分</span>
                                  <span className="credit-advanced-card__stat-value">{model.creditCost}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="credit-quality-section">
                            <div className="credit-quality-section__header">
                              <div>
                                <div className="credit-quality-section__eyebrow">Pricing Matrix</div>
                                <div className="credit-quality-section__title">按画质单独定价</div>
                              </div>
                              <div className="credit-quality-section__summary">
                                已启用 {enabledQualityCount} / {qualitiesToShow.length}
                              </div>
                            </div>
                            <div className="credit-quality-grid">
                              {qualitiesToShow.map((quality) => {
                                const rule = model.qualityPricing[quality];
                                const isEnabled = rule.enabled !== false;
                                const qualityMeta = QUALITY_META[quality];

                                return (
                                  <div
                                    key={quality}
                                    className={`credit-quality-card ${isEnabled ? 'is-enabled' : 'is-disabled'}`}
                                  >
                                    <div className="credit-quality-card__top">
                                      <div>
                                        <div className="credit-quality-card__label-row">
                                          <div className="credit-quality-card__name">{quality}</div>
                                          <span className="credit-quality-card__resolution">{qualityMeta.resolution}</span>
                                        </div>
                                        <div className="credit-quality-card__hint">{qualityMeta.hint}</div>
                                      </div>
                                      <AdvancedToggle
                                        checked={isEnabled}
                                        label={`启用 ${quality}`}
                                        onToggle={() => updateModelQualityAt(index, quality, { enabled: !isEnabled })}
                                        size="compact"
                                      />
                                    </div>

                                    <label className="credit-quality-card__field">
                                      <span className="credit-quality-card__field-label">
                                        {isEnabled ? '单次积分' : '当前已停用'}
                                      </span>
                                      <div className="credit-quality-card__input-wrap">
                                        <input
                                          type="number"
                                          min={1}
                                          disabled={!isEnabled}
                                          value={rule.creditCost}
                                          onChange={(e) =>
                                            updateModelQualityAt(index, quality, {
                                              creditCost: Math.max(1, Number(e.target.value || model.creditCost || 1)),
                                            })
                                          }
                                          className="credit-quality-input"
                                        />
                                        <span className="credit-quality-card__suffix">积分</span>
                                      </div>
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="credit-advanced-note">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="text-[11px] leading-5">
                              <span className="font-semibold">混合路由策略：</span>
                              同一模型有多个供应商开启混合时，系统会先选择调用次数更少的供应商；若用量相同，再优先选择成本更低的链路。
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      已调用：{callsUsed ?? 0}
                      {model.maxCallsLimit ? ` / ${model.maxCallsLimit}` : ' / 无限'}
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="text-xs text-[var(--text-secondary)]">
                        <input
                          className="mr-2"
                          type="checkbox"
                          checked={model.isActive}
                          onChange={(e) => {
                            const value = e.target.checked;
                            setForm((prev) => ({
                              ...prev,
                              models: prev.models.map((item, i) => (i === index ? { ...item, isActive: value } : item)),
                            }));
                          }}
                        />
                        启用
                      </label>
                      <button onClick={() => removeModel(index)} className="settings-danger-text text-xs">
                        删除模型
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="settings-action-row">
            <button onClick={addModel} className="apple-button-secondary min-h-10 px-3 text-xs">
              <Plus size={12} />
              添加模型
            </button>
            <button
              onClick={() => void saveProvider()}
              disabled={saving}
              className="apple-button-primary min-h-10 px-3 text-xs disabled:opacity-60"
            >
              {saving ? '保存中...' : '保存供应商'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditModelSettings;

