import React, { useEffect, useMemo, useState } from 'react';
import { Plus, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notify } from '../../services/system/notificationService';
import {
  ADMIN_MODEL_QUALITY_KEYS,
  type AdminModelQualityKey,
  type AdminModelQualityPricing,
  createDefaultAdminQualityPricing,
  normalizeAdminQualityPricing,
} from '../../services/model/adminModelQuality';
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

const CreditModelSettings: React.FC = () => {
  const [rows, setRows] = useState<CreditModelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supportsMaxCallsLimit, setSupportsMaxCallsLimit] = useState(true);
  const [supportsAdvancedSettings, setSupportsAdvancedSettings] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [form, setForm] = useState<EditableProvider>(emptyProvider());

  const providers = useMemo(() => {
    const grouped = new Map<string, CreditModelRow[]>();
    for (const row of rows) {
      const key = row.provider_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    return Array.from(grouped.entries()).map(([providerId, items]) => ({ providerId, items }));
  }, [rows]);

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
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="h-4 w-4" />
          积分模型配置（全局）
        </div>
        <p className="mt-2 text-xs text-amber-200/90">
          这里配置的是管理员全局积分模型，会同步给所有用户。用户自己的接口配置不在本页面修改。
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-light)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-white/5"
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
        <button
          onClick={resetForm}
          className="rounded-lg border border-[var(--border-light)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-white/5"
        >
          新建供应商
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px,1fr]">
        <div className="rounded-2xl border border-[var(--border-light)] p-3">
          <div className="mb-2 text-xs text-[var(--text-tertiary)]">已配置供应商</div>
          <div className="space-y-2">
            {providers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border-light)] p-3 text-xs text-[var(--text-tertiary)]">
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
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
                    >
                      删除
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-light)] p-4 space-y-4">
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

          <div className="space-y-3">
            <div className="text-xs font-semibold text-[var(--text-primary)]">模型配置</div>
            {!supportsMaxCallsLimit && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                当前数据库未包含总调用上限字段（`max_calls_limit`），已自动降级兼容。
                执行最新 Supabase 迁移后，可启用“总调用上限/自动暂停”能力。
              </div>
            )}
            {!supportsAdvancedSettings && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                当前数据库未包含高级设置字段（`advanced_enabled / mix_with_same_model / quality_pricing`），
                已自动隐藏画质定价与混合路由配置。执行最新 Supabase 迁移后即可启用。
              </div>
            )}
            {form.models.map((model, index) => {
              const callsUsed = rows.find(
                (row) => row.provider_id === form.providerId && row.model_id === model.modelId
              )?.call_count;

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
                          {(() => {
                            const caps = getModelCapabilities(model.modelId);
                            const supportedSizes = caps?.supportedSizes || [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K];
                            const sizeToQuality: Record<string, AdminModelQualityKey> = {
                              [ImageSize.SIZE_05K]: '0.5K',
                              [ImageSize.SIZE_1K]: '1K',
                              [ImageSize.SIZE_2K]: '2K',
                              [ImageSize.SIZE_4K]: '4K',
                            };
                            const sizeLabel: Record<string, string> = {
                              [ImageSize.SIZE_05K]: '512px',
                              [ImageSize.SIZE_1K]: '1K',
                              [ImageSize.SIZE_2K]: '2K',
                              [ImageSize.SIZE_4K]: '4K',
                            };
                            return supportedSizes.map(size => {
                              const quality = sizeToQuality[size];
                              if (!quality) return null;
                              const rule = model.qualityPricing[quality];
                              const isEnabled = rule.enabled !== false;
                              return (
                                <span 
                                  key={quality}
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                                    isEnabled 
                                      ? 'bg-indigo-500/20 text-indigo-300' 
                                      : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] line-through'
                                  }`}
                                >
                                  {sizeLabel[size]}: {rule.creditCost}
                                  {!isEnabled && <span className="text-[8px]">(已禁用)</span>}
                                </span>
                              );
                            });
                          })()}
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
                    <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-tertiary)]/40 overflow-hidden">
                      {/* 高级设置头部 */}
                      <div className="flex items-center justify-between gap-3 p-3 border-b border-[var(--border-light)]">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[var(--text-primary)]">高级设置</div>
                            <div className="text-[11px] text-[var(--text-tertiary)]">
                              自定义画质定价与多供应商混合策略
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={model.advancedEnabled}
                          onClick={() => {
                            const enabled = !model.advancedEnabled;
                            updateModelAt(index, {
                              advancedEnabled: enabled,
                              qualityPricing: normalizeAdminQualityPricing(model.qualityPricing, model.creditCost),
                            });
                          }}
                          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                            model.advancedEnabled ? 'bg-indigo-500' : 'bg-gray-500'
                          }`}
                        >
                          <span className="sr-only">启用高级设置</span>
                          <span
                            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              model.advancedEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {model.advancedEnabled && (
                        <div className="p-3 space-y-4">
                          {/* 混合模式开关 */}
                          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[var(--bg-elevated)]/50 border border-[var(--border-light)]">
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded bg-emerald-500/20 flex items-center justify-center">
                                <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                              </div>
                              <div>
                                <div className="text-xs font-medium text-[var(--text-primary)]">多供应商混合</div>
                                <div className="text-[10px] text-[var(--text-tertiary)]">自动均衡各API用量，优先使用调用次数少的供应商</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={model.mixWithSameModel}
                              onClick={() => updateModelAt(index, { mixWithSameModel: !model.mixWithSameModel })}
                              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                model.mixWithSameModel ? 'bg-emerald-500' : 'bg-gray-500'
                              }`}
                            >
                              <span className="sr-only">启用多供应商混合</span>
                              <span
                                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  model.mixWithSameModel ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          {/* 画质定价配置 */}
                          <div>
                            <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">画质定价配置</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {(() => {
                                // 获取模型支持的尺寸
                                const caps = getModelCapabilities(model.modelId);
                                const supportedSizes = caps?.supportedSizes || [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K];
                                
                                // 尺寸到 quality key 的映射
                                const sizeToQuality: Record<string, AdminModelQualityKey> = {
                                  [ImageSize.SIZE_05K]: '0.5K',
                                  [ImageSize.SIZE_1K]: '1K',
                                  [ImageSize.SIZE_2K]: '2K',
                                  [ImageSize.SIZE_4K]: '4K',
                                };
                                
                                // 过滤出支持的 quality keys
                                const supportedQualities = supportedSizes
                                  .map(size => sizeToQuality[size])
                                  .filter((q): q is AdminModelQualityKey => !!q);
                                
                                // 如果没有支持的 sizes，默认显示所有
                                const qualitiesToShow = supportedQualities.length > 0 ? supportedQualities : ADMIN_MODEL_QUALITY_KEYS;
                                
                                return qualitiesToShow.map((quality) => {
                                  const rule = model.qualityPricing[quality];
                                  const isEnabled = rule.enabled !== false;
                                  return (
                                    <div 
                                      key={quality} 
                                      className={`relative rounded-lg border p-2.5 transition-all ${
                                        isEnabled 
                                          ? 'bg-[var(--bg-surface)] border-indigo-500/30 shadow-sm' 
                                          : 'bg-[var(--bg-elevated)]/30 border-[var(--border-light)] opacity-60'
                                      }`}
                                    >
                                      {/* 启用开关 */}
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={isEnabled}
                                        onClick={() => updateModelQualityAt(index, quality, { enabled: !isEnabled })}
                                        className={`absolute top-2 right-2 inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                          isEnabled ? 'bg-indigo-500' : 'bg-gray-500'
                                        }`}
                                      >
                                        <span className="sr-only">启用{quality}</span>
                                        <span
                                          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                                            isEnabled ? 'translate-x-4' : 'translate-x-0'
                                          }`}
                                        />
                                      </button>

                                      <div className="pr-6">
                                        <div className={`text-sm font-bold ${isEnabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                                          {quality}
                                        </div>
                                        <div className="text-[10px] text-[var(--text-tertiary)] mb-1.5">
                                          {quality === '0.5K' ? '512px' : quality === '1K' ? '1024px' : quality === '2K' ? '2048px' : '4096px'}
                                        </div>
                                        <input
                                          type="number"
                                          min={1}
                                          disabled={!isEnabled}
                                          value={rule.creditCost}
                                          onChange={(e) => updateModelQualityAt(index, quality, { creditCost: Math.max(1, Number(e.target.value || model.creditCost || 1)) })}
                                          className="w-full h-7 text-xs rounded-md border border-[var(--border-light)] bg-[var(--bg-elevated)] px-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                        />
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>

                          {/* 路由规则说明 */}
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-[11px] leading-4 text-blue-300/90">
                              <span className="font-medium">混合路由策略：</span>
                              当同一模型有多个供应商开启混合时，系统会优先选择
                              <span className="text-blue-200 font-medium">调用次数最少</span>
                              的供应商，实现API用量均衡。若用量相同，则选择价格更低的。相同价格时会分散请求以均衡负载。
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
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
                      <button onClick={() => removeModel(index)} className="text-xs text-red-400 hover:text-red-300">
                        删除模型
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={addModel} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-2 text-xs">
              <Plus size={12} />
              添加模型
            </button>
            <button
              onClick={() => void saveProvider()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white hover:bg-indigo-500 disabled:opacity-60"
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

