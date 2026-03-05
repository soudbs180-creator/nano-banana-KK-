import React, { useEffect, useMemo, useState } from 'react';
import { Plus, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { notify } from '../../services/system/notificationService';

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
};

const CREDIT_MODEL_SELECT_BASE =
  'provider_id, provider_name, base_url, api_keys, model_id, display_name, description, endpoint_type, credit_cost, is_active, call_count, color, color_secondary, text_color';
const CREDIT_MODEL_SELECT_WITH_LIMIT = `${CREDIT_MODEL_SELECT_BASE}, max_calls_limit`;

const isMissingMaxCallsLimitColumn = (error: any): boolean => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  return (
    (message.includes('max_calls_limit') || details.includes('max_calls_limit') || hint.includes('max_calls_limit')) &&
    (message.includes('does not exist') || details.includes('does not exist') || message.includes('column'))
  );
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
});

const emptyProvider = (): EditableProvider => ({
  providerId: '',
  providerName: '',
  baseUrl: 'https://cdn.12ai.org',
  apiKey: '',
  models: [newModel()],
});

const CreditModelSettings: React.FC = () => {
  const [rows, setRows] = useState<CreditModelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supportsMaxCallsLimit, setSupportsMaxCallsLimit] = useState(true);
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

      if (error && isMissingMaxCallsLimitColumn(error)) {
        const legacy = await supabase
          .from('admin_credit_models')
          .select(CREDIT_MODEL_SELECT_BASE)
          .order('provider_id', { ascending: true })
          .order('priority', { ascending: false });

        if (legacy.error) throw legacy.error;

        const normalized = ((legacy.data || []) as Array<Omit<CreditModelRow, 'max_calls_limit'>>).map((row) => ({
          ...row,
          max_calls_limit: null,
        }));

        setRows(normalized as CreditModelRow[]);
        setSupportsMaxCallsLimit(false);
        notify.warning('已启用兼容模式', '当前数据库缺少调用上限字段，模型已正常加载。运行最新迁移后可使用总调用上限。');
        return;
      }

      if (error) throw error;
      setRows((data || []) as CreditModelRow[]);
      setSupportsMaxCallsLimit(true);
    } catch (error: any) {
      notify.error('加载失败', error.message || '无法加载积分模型配置');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
      })),
    });
  }, [providers, selectedProviderId]);

  const resetForm = () => {
    setSelectedProviderId('');
    setForm(emptyProvider());
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

      const { error } = await supabase.rpc('save_credit_provider', {
        p_provider_id: form.providerId.trim(),
        p_provider_name: form.providerName.trim(),
        p_base_url: form.baseUrl.trim(),
        p_api_keys: [form.apiKey.trim()],
        p_models: payloadModels,
      });

      if (error) throw error;
      notify.success('保存成功', '积分模型配置已更新');
      await load();
      setSelectedProviderId(form.providerId.trim());
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
                  placeholder="例如：https://cdn.12ai.org"
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
                      <span className="text-[11px] text-[var(--text-tertiary)]">积分消耗</span>
                      <input
                        type="number"
                        min={1}
                        value={model.creditCost}
                        onChange={(e) => {
                          const value = Number(e.target.value || 1);
                          setForm((prev) => ({
                            ...prev,
                            models: prev.models.map((item, i) => (i === index ? { ...item, creditCost: value } : item)),
                          }));
                        }}
                        className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
                      />
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
                      <span className="text-[11px] text-[var(--text-tertiary)]">文字颜色</span>
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

