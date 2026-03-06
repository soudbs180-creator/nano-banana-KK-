import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import keyManager, {
  autoDetectAndConfigureModels,
  type KeySlot,
  type ThirdPartyProvider,
} from '../../services/auth/keyManager';
import { supplierService } from '../../services/billing/supplierService';
import { notify } from '../../services/system/notificationService';

type Tab = 'official' | 'thirdparty';
type CostMode = 'unlimited' | 'amount' | 'tokens';

type OfficialForm = {
  id?: string;
  name: string;
  key: string;
  costMode: CostMode;
  costValue: number;
};

type ProviderForm = {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  costMode: CostMode;
  costValue: number;
  badgeColor: string;
  isActive: boolean;
};

type AdvancedResult = {
  models: string[];
  apiType: string;
  pricingHint: string;
  fetchedAt: number;
};

const defaultOfficialForm: OfficialForm = {
  name: '',
  key: '',
  costMode: 'unlimited',
  costValue: 0,
};

const defaultProviderForm: ProviderForm = {
  name: '',
  baseUrl: '',
  apiKey: '',
  costMode: 'unlimited',
  costValue: 0,
  badgeColor: '#3B82F6',
  isActive: true,
};

const toProviderForm = (provider?: ThirdPartyProvider): ProviderForm => {
  if (!provider) return defaultProviderForm;

  const customCostMode = (provider as any).customCostMode as CostMode | undefined;
  const customCostValue = Number((provider as any).customCostValue || 0);

  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    costMode: customCostMode || 'unlimited',
    costValue: customCostValue,
    badgeColor: ((provider as any).badgeColor as string) || '#3B82F6',
    isActive: provider.isActive,
  };
};

const formatDate = (ts?: number) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
};

const costModeText: Record<CostMode, string> = {
  unlimited: '无限',
  amount: '金额',
  tokens: 'Tokens',
};

const ApiSettingsView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('official');
  const [slots, setSlots] = useState<KeySlot[]>([]);
  const [providers, setProviders] = useState<ThirdPartyProvider[]>([]);

  const [officialForm, setOfficialForm] = useState<OfficialForm>(defaultOfficialForm);
  const [providerForm, setProviderForm] = useState<ProviderForm>(defaultProviderForm);

  const [showOfficialCreateForm, setShowOfficialCreateForm] = useState(false);
  const [showProviderCreateForm, setShowProviderCreateForm] = useState(false);
  const [showAdvancedMode, setShowAdvancedMode] = useState(false);

  const [advancedIdentityKey, setAdvancedIdentityKey] = useState('');
  const [advancedResult, setAdvancedResult] = useState<AdvancedResult | null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);

  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [detectingProviderId, setDetectingProviderId] = useState<string | null>(null);

  const migrateLegacyDataIfNeeded = () => {
    const existingProviders = keyManager.getProviders();
    const existingSignature = new Set(existingProviders.map((item) => `${item.name}|${item.baseUrl}`));

    let migratedCount = 0;

    const legacySuppliers = supplierService.getAll();
    legacySuppliers.forEach((supplier) => {
      if (!supplier.name || !supplier.baseUrl || !supplier.apiKey) return;
      const signature = `${supplier.name}|${supplier.baseUrl}`;
      if (existingSignature.has(signature)) return;

      keyManager.addProvider({
        name: supplier.name,
        baseUrl: supplier.baseUrl,
        apiKey: supplier.apiKey,
        models: (supplier.models || []).map((model) => model.id).filter(Boolean),
        format: 'auto',
        isActive: true,
        badgeColor: '#3B82F6',
        identityKey: (supplier as any).systemToken || undefined,
        pricingSnapshot: supplier.models?.length
          ? {
            fetchedAt: Date.now(),
            note: '旧版供应商数据自动迁移',
            rows: supplier.models.map((model) => ({ model: model.id })),
          }
          : undefined,
      } as any);

      existingSignature.add(signature);
      migratedCount += 1;
    });

    const legacySlots = keyManager.getSlots().filter((slot) => !!slot.baseUrl && !!slot.key);
    legacySlots.forEach((slot) => {
      const name = slot.name || slot.provider || '第三方供应商';
      const baseUrl = slot.baseUrl || '';
      if (!baseUrl) return;

      const signature = `${name}|${baseUrl}`;
      if (existingSignature.has(signature)) return;

      keyManager.addProvider({
        name,
        baseUrl,
        apiKey: slot.key,
        models: slot.supportedModels || [],
        format: 'auto',
        isActive: !slot.disabled,
        badgeColor: '#3B82F6',
      } as any);

      existingSignature.add(signature);
      migratedCount += 1;
    });

    if (migratedCount > 0) {
      notify.success('历史接口已恢复', `已自动恢复 ${migratedCount} 条已添加接口。`);
    }
  };

  const refresh = () => {
    setSlots(keyManager.getSlots());
    setProviders(keyManager.getProviders());
  };

  useEffect(() => {
    migrateLegacyDataIfNeeded();
    refresh();
    const unsubscribe = keyManager.subscribe(() => refresh());
    return unsubscribe;
  }, []);

  const officialKeys = useMemo(
    () =>
      slots.filter((slot) => {
        if (!slot.key || slot.disabled) return false;
        if (slot.baseUrl) return false;
        if (slot.provider === 'SystemProxy') return false;
        return slot.type === 'official' || slot.provider === 'Google' || slot.provider === 'OpenAI';
      }),
    [slots]
  );

  const summary = useMemo(() => {
    const activeProviders = providers.filter((item) => item.isActive);
    const modelCount = providers.reduce((sum, item) => sum + (item.models?.length || 0), 0);
    const totalTokens = providers.reduce((sum, item) => sum + (item.usage?.totalTokens || 0), 0);
    const totalCost = providers.reduce((sum, item) => sum + (item.usage?.totalCost || 0), 0);
    return {
      officialCount: officialKeys.length,
      providerCount: providers.length,
      activeProviderCount: activeProviders.length,
      modelCount,
      totalTokens,
      totalCost,
    };
  }, [providers, officialKeys.length]);

  const parseCost = (mode: CostMode, value: number) => {
    if (mode === 'unlimited') return { budgetLimit: -1, tokenLimit: -1 };
    if (mode === 'amount') return { budgetLimit: Math.max(0, value), tokenLimit: -1 };
    return { budgetLimit: -1, tokenLimit: Math.max(0, value) };
  };

  const resetOfficialForm = (closeCreate = true) => {
    setOfficialForm(defaultOfficialForm);
    if (closeCreate) {
      setShowOfficialCreateForm(false);
    }
  };

  const resetThirdPartyForm = (closeCreate = true) => {
    setProviderForm(defaultProviderForm);
    setAdvancedIdentityKey('');
    setAdvancedResult(null);
    setShowAdvancedMode(false);
    if (closeCreate) {
      setShowProviderCreateForm(false);
    }
  };

  const loadOfficialToForm = (slot: KeySlot) => {
    setOfficialForm({
      id: slot.id,
      name: slot.name,
      key: slot.key,
      costMode:
        slot.tokenLimit && slot.tokenLimit > 0
          ? 'tokens'
          : slot.budgetLimit && slot.budgetLimit > 0
            ? 'amount'
            : 'unlimited',
      costValue:
        slot.tokenLimit && slot.tokenLimit > 0
          ? slot.tokenLimit
          : slot.budgetLimit && slot.budgetLimit > 0
            ? slot.budgetLimit
            : 0,
    });
    setShowOfficialCreateForm(false);
  };

  const loadProviderToForm = (provider: ThirdPartyProvider) => {
    setProviderForm(toProviderForm(provider));
    setAdvancedIdentityKey(((provider as any).identityKey as string) || '');

    const snapshot = (provider as any).pricingSnapshot as
      | { fetchedAt?: number; apiType?: string; note?: string; rows?: Array<{ model?: string }> }
      | undefined;

    if (snapshot) {
      setAdvancedResult({
        models: (snapshot.rows || []).map((item) => item.model || '').filter(Boolean),
        apiType: snapshot.apiType || 'auto',
        pricingHint: snapshot.note || '已保存价格快照',
        fetchedAt: snapshot.fetchedAt || Date.now(),
      });
    } else {
      setAdvancedResult(null);
    }

    setShowProviderCreateForm(false);
    setShowAdvancedMode(false);
  };

  const handleSaveOfficial = async () => {
    const name = officialForm.name.trim();
    const key = officialForm.key.trim();
    if (!name || !key) {
      notify.error('缺少字段', '供应商名称和接口密钥为必填项。');
      return;
    }

    const { budgetLimit, tokenLimit } = parseCost(officialForm.costMode, officialForm.costValue);

    if (officialForm.id) {
      await keyManager.updateKey(officialForm.id, {
        name,
        key,
        provider: 'Google',
        type: 'official',
        baseUrl: '',
        budgetLimit,
        tokenLimit,
      });
      notify.success('更新成功', '官方接口已更新。');
    } else {
      const result = await keyManager.addKey(key, {
        name,
        provider: 'Google',
        type: 'official',
        budgetLimit,
        tokenLimit,
      });
      if (!result.success) {
        notify.error('添加失败', result.error || '添加官方接口失败。');
        return;
      }
      notify.success('添加成功', '官方接口已添加。');
    }

    resetOfficialForm(true);
    refresh();
  };

  const handleTestOfficial = async (slot: KeySlot) => {
    setTestingKeyId(slot.id);
    try {
      const result = await keyManager.testChannel(
        'https://generativelanguage.googleapis.com',
        slot.key,
        'Google',
        'query'
      );

      if (result.success) {
        keyManager.reportSuccess(slot.id);
        notify.success('连接成功', '官方接口可用。');
      } else {
        keyManager.reportFailure(slot.id, result.message || '测试失败');
        notify.error('连接失败', result.message || '接口密钥无效或网络异常。');
      }
      refresh();
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleDetectAdvanced = async () => {
    const providerName = providerForm.name.trim();
    const baseUrl = providerForm.baseUrl.trim();
    const identityKey = advancedIdentityKey.trim();

    if (!providerName || !baseUrl || !identityKey) {
      notify.error('缺少字段', '请先填写供应商名称、接口地址和系统令牌。');
      return;
    }

    setAdvancedLoading(true);
    try {
      const detect = await autoDetectAndConfigureModels(identityKey, baseUrl);
      const result: AdvancedResult = {
        models: detect.models || [],
        apiType: detect.apiType || 'auto',
        pricingHint: '该供应商价格体系已按当前系统令牌抓取。系统令牌刷新后，请重新粘贴并重新获取。',
        fetchedAt: Date.now(),
      };
      setAdvancedResult(result);
      notify.success('获取成功', `已识别 ${result.models.length} 个模型。`);
    } catch (error: any) {
      const errMsg = error?.message || '请检查系统令牌与接口地址。';
      notify.error('获取失败', errMsg.includes('401')
        ? `${errMsg} 提示：若使用12AI，请在主站令牌管理页重新创建 sk- 密钥。`
        : errMsg);
    } finally {
      setAdvancedLoading(false);
    }
  };

  const handleSaveProvider = async () => {
    const name = providerForm.name.trim();
    const baseUrl = providerForm.baseUrl.trim();
    const apiKey = providerForm.apiKey.trim();

    if (!name || !baseUrl || !apiKey) {
      notify.error('缺少字段', '供应商名称、接口地址和接口密钥为必填项。');
      return;
    }

    const { budgetLimit, tokenLimit } = parseCost(providerForm.costMode, providerForm.costValue);

    // 🚀 [Fix] 优先使用高级模式（系统身份令牌）已获取的模型列表
    // 系统令牌通常是一次性的或有时效性的，保存时不应再次消耗
    let models: string[] = [];
    if (advancedResult && advancedResult.models.length > 0) {
      models = advancedResult.models;
    } else {
      try {
        const detect = await autoDetectAndConfigureModels(apiKey, baseUrl);
        models = detect.models || [];
      } catch (saveDetectErr: any) {
        console.warn('[ApiSettings] 保存时自动获取模型失败:', saveDetectErr?.message);
        models = [];
      }
    }

    const payload = {
      name,
      baseUrl,
      apiKey,
      models,
      format: 'auto' as const,
      isActive: providerForm.isActive,
      budgetLimit,
      tokenLimit,
      customCostMode: providerForm.costMode,
      customCostValue: providerForm.costValue,
      badgeColor: providerForm.badgeColor,
      identityKey: advancedIdentityKey.trim() || undefined,
      pricingSnapshot: advancedResult
        ? {
          fetchedAt: advancedResult.fetchedAt,
          apiType: advancedResult.apiType,
          note: advancedResult.pricingHint,
          rows: advancedResult.models.map((model) => ({ model })),
        }
        : undefined,
    } as any;

    if (providerForm.id) {
      const ok = keyManager.updateProvider(providerForm.id, payload);
      if (!ok) {
        notify.error('更新失败', '未找到该供应商。');
        return;
      }
      notify.success('更新成功', '第三方供应商已更新。');
    } else {
      keyManager.addProvider(payload);
      notify.success('添加成功', '第三方供应商已添加。');
    }

    resetThirdPartyForm(true);
    refresh();
  };

  const handleDeleteProvider = (id: string) => {
    if (!confirm('确认删除该供应商吗？')) return;
    const ok = keyManager.removeProvider(id);
    if (!ok) {
      notify.error('删除失败', '未找到该供应商。');
      return;
    }
    if (providerForm.id === id) resetThirdPartyForm(true);
    notify.success('删除成功', '供应商已删除。');
    refresh();
  };

  const handleToggleProvider = (provider: ThirdPartyProvider) => {
    keyManager.updateProvider(provider.id, { isActive: !provider.isActive });
    notify.success(provider.isActive ? '已暂停' : '已启用', `${provider.name} 状态已更新。`);
    refresh();
  };

  const handleValidateProvider = async (provider: ThirdPartyProvider) => {
    setDetectingProviderId(provider.id);
    try {
      // 先尝试用普通 apiKey 检测
      let detect = await autoDetectAndConfigureModels(provider.apiKey, provider.baseUrl);

      // 如果普通 apiKey 获取为空，并且有系统令牌，尝试用系统令牌
      if (!detect.success && (provider as any).identityKey) {
        try {
          detect = await autoDetectAndConfigureModels((provider as any).identityKey, provider.baseUrl);
        } catch { /* 忽略系统令牌失败 */ }
      }

      if (detect.success) {
        // 🚀 检测成功：更新模型列表和状态
        keyManager.updateProvider(provider.id, {
          models: detect.models,
          status: 'active',
          lastChecked: Date.now(),
          lastError: undefined,
        } as any);
        notify.success('验证完成', `已获取 ${detect.models.length} 个模型。`);
      } else {
        // 🚀 [Fix] 检测失败：只更新状态，不覆盖已有模型列表
        keyManager.updateProvider(provider.id, {
          status: 'error',
          lastChecked: Date.now(),
          lastError: '模型获取失败，已保留原有列表',
        } as any);
        notify.error('验证失败', `无法获取模型列表，但已保留原有 ${provider.models.length} 个模型。`);
      }
      refresh();
    } catch (error: any) {
      // 🚀 [Fix] 异常时也不覆盖模型列表
      const errDetail = error?.message || '网络异常';
      keyManager.updateProvider(provider.id, {
        status: 'error',
        lastChecked: Date.now(),
        lastError: errDetail,
      } as any);
      // 根据错误类型给出更友好的提示
      const userTip = errDetail.includes('401')
        ? `${errDetail} 提示：请确认密钥有效且为 sk- 格式。`
        : errDetail;
      notify.error('验证失败', userTip);
      refresh();
    } finally {
      setDetectingProviderId(null);
    }
  };

  const renderOfficialForm = (mode: 'create' | 'edit') => (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-[var(--text-primary)]">
        {mode === 'edit' ? `编辑官方接口：${officialForm.name || '未命名接口'}` : '添加官方接口'}
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">供应商名称</span>
          <input
            value={officialForm.name}
            onChange={(event) => setOfficialForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="例如：官方直连"
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">接口密钥</span>
          <input
            type="password"
            value={officialForm.key}
            onChange={(event) => setOfficialForm((prev) => ({ ...prev, key: event.target.value }))}
            placeholder="输入官方接口密钥"
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">消耗类型</span>
          <select
            value={officialForm.costMode}
            onChange={(event) => setOfficialForm((prev) => ({ ...prev, costMode: event.target.value as CostMode }))}
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
          >
            <option value="unlimited">无限</option>
            <option value="amount">金额</option>
            <option value="tokens">Tokens</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">消耗值</span>
          <input
            type="number"
            min={0}
            disabled={officialForm.costMode === 'unlimited'}
            value={officialForm.costValue}
            onChange={(event) => setOfficialForm((prev) => ({ ...prev, costValue: Number(event.target.value || 0) }))}
            placeholder={officialForm.costMode === 'tokens' ? 'Tokens 数量' : '金额'}
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-xs text-white" onClick={() => void handleSaveOfficial()}>
          <Save size={12} /> {mode === 'edit' ? '保存修改' : '保存并添加'}
        </button>
        <button className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 text-xs" onClick={() => resetOfficialForm(true)}>
          <XCircle size={12} /> 取消
        </button>
      </div>
    </div>
  );

  const renderProviderForm = (mode: 'create' | 'edit') => (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-[var(--text-primary)]">
        {mode === 'edit' ? `编辑第三方供应商：${providerForm.name || '未命名供应商'}` : '添加第三方供应商'}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">供应商名称</span>
          <input
            value={providerForm.name}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="例如：网关 A"
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">接口地址</span>
          <input
            value={providerForm.baseUrl}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
            placeholder="例如：https://api.example.com"
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">接口密钥</span>
          <input
            type="password"
            value={providerForm.apiKey}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, apiKey: event.target.value }))}
            placeholder="输入该供应商接口密钥"
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">副卡颜色</span>
          <input
            type="color"
            value={providerForm.badgeColor}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, badgeColor: event.target.value }))}
            className="h-10 w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-2"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">消耗类型</span>
          <select
            value={providerForm.costMode}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, costMode: event.target.value as CostMode }))}
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
          >
            <option value="unlimited">无限</option>
            <option value="amount">金额</option>
            <option value="tokens">Tokens</option>
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-[11px] text-[var(--text-tertiary)]">消耗值</span>
          <input
            type="number"
            min={0}
            disabled={providerForm.costMode === 'unlimited'}
            value={providerForm.costValue}
            onChange={(event) => setProviderForm((prev) => ({ ...prev, costValue: Number(event.target.value || 0) }))}
            placeholder={providerForm.costMode === 'tokens' ? 'Tokens 数量' : '金额'}
            className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={providerForm.isActive}
          onChange={(event) => setProviderForm((prev) => ({ ...prev, isActive: event.target.checked }))}
        />
        启用供应商
      </label>

      <div className="rounded-xl border border-[var(--border-light)] p-3">
        <button
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
          onClick={() => setShowAdvancedMode((prev) => !prev)}
          type="button"
        >
          {showAdvancedMode ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showAdvancedMode ? '收起高级模式' : '展开高级模式'}
        </button>

        {showAdvancedMode && (
          <div className="mt-3 space-y-2">
            <div className="text-sm font-medium text-[var(--text-primary)]">高级模式（按该供应商独立价格体系）</div>
            <p className="text-xs text-[var(--text-tertiary)]">
              使用该供应商系统令牌抓取模型与价格体系。令牌刷新后需重新粘贴并重新获取。
            </p>

            <label className="block space-y-1">
              <span className="text-[11px] text-[var(--text-tertiary)]">系统令牌</span>
              <input
                type="password"
                value={advancedIdentityKey}
                onChange={(event) => setAdvancedIdentityKey(event.target.value)}
                placeholder="粘贴该供应商系统令牌（会刷新）"
                className="w-full rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 text-xs text-indigo-300"
                onClick={() => void handleDetectAdvanced()}
                disabled={advancedLoading}
              >
                <Search size={12} /> {advancedLoading ? '获取中...' : '获取模型与价格体系'}
              </button>
            </div>

            {advancedResult && (
              <div className="rounded-lg border border-[var(--border-light)] p-3 text-xs text-[var(--text-tertiary)]">
                <div>最近获取：{formatDate(advancedResult.fetchedAt)}</div>
                <div className="mt-1">接口类型：{advancedResult.apiType}</div>
                <div className="mt-1">{advancedResult.pricingHint}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {advancedResult.models.length === 0 ? (
                    <span>暂无模型</span>
                  ) : (
                    advancedResult.models.map((model) => (
                      <span key={model} className="rounded-full border border-[var(--border-light)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                        {model}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-xs text-white" onClick={() => void handleSaveProvider()}>
          <Plus size={12} /> {mode === 'edit' ? '保存并验证' : '添加并验证'}
        </button>
        <button className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 text-xs" onClick={() => resetThirdPartyForm(true)}>
          <XCircle size={12} /> 取消
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-8">
      <div className="px-1">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          接口管理
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          用户接口仅自己可用；管理员全局积分模型请在“管理员后台”配置。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border p-3 md:grid-cols-5" style={{ borderColor: 'var(--border-light)' }}>
        <div className="rounded-xl border border-[var(--border-light)] p-3">
          <div className="text-[11px] text-[var(--text-tertiary)]">官方接口</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.officialCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-light)] p-3">
          <div className="text-[11px] text-[var(--text-tertiary)]">第三方供应商</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.providerCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-light)] p-3">
          <div className="text-[11px] text-[var(--text-tertiary)]">已启用供应商</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.activeProviderCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-light)] p-3">
          <div className="text-[11px] text-[var(--text-tertiary)]">模型总数</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.modelCount}</div>
        </div>
        <div className="rounded-xl border border-[var(--border-light)] p-3">
          <div className="text-[11px] text-[var(--text-tertiary)]">累计消耗估算</div>
          <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">${summary.totalCost.toFixed(4)}</div>
          <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">Tokens：{summary.totalTokens.toLocaleString('zh-CN')}</div>
        </div>
      </div>

      <div className="flex gap-2 rounded-2xl border p-1" style={{ borderColor: 'var(--border-light)' }}>
        <button
          className={`flex h-10 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm ${tab === 'official' ? 'bg-indigo-600 text-white' : 'text-[var(--text-secondary)]'
            }`}
          onClick={() => setTab('official')}
        >
          官方接口
        </button>
        <button
          className={`flex h-10 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm ${tab === 'thirdparty' ? 'bg-indigo-600 text-white' : 'text-[var(--text-secondary)]'
            }`}
          onClick={() => setTab('thirdparty')}
        >
          第三方供应商
        </button>
      </div>

      {tab === 'official' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-light)] px-3 py-2">
            <div className="text-sm text-[var(--text-secondary)]">官方接口列表</div>
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 text-xs text-indigo-300"
              onClick={() => {
                setShowOfficialCreateForm((prev) => {
                  const next = !prev;
                  if (next) {
                    setOfficialForm(defaultOfficialForm);
                  }
                  return next;
                });
              }}
            >
              <Plus size={12} /> {showOfficialCreateForm ? '收起添加' : '添加官方接口'}
            </button>
          </div>

          {showOfficialCreateForm && !officialForm.id && (
            <div className="rounded-2xl border border-[var(--border-light)] p-4">{renderOfficialForm('create')}</div>
          )}

          <div className="space-y-2">
            {officialKeys.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)' }}>
                暂无官方接口配置。
              </div>
            ) : (
              officialKeys.map((slot) => (
                <div key={slot.id} className="rounded-xl border" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text-primary)]">{slot.name}</div>
                      <div className="text-xs font-mono text-[var(--text-tertiary)]">
                        {slot.key.slice(0, 8)}...{slot.key.slice(-4)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="rounded-lg border border-[var(--border-light)] px-2 py-1 text-xs" onClick={() => void handleTestOfficial(slot)} title="验证连接">
                        <RefreshCw size={12} className={testingKeyId === slot.id ? 'animate-spin' : ''} />
                      </button>
                      <button className="rounded-lg border border-[var(--border-light)] px-2 py-1 text-xs" onClick={() => loadOfficialToForm(slot)} title="编辑">
                        <Edit3 size={12} />
                      </button>
                      <button
                        className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-400"
                        onClick={() => {
                          if (!confirm('确认删除该官方接口吗？')) return;
                          keyManager.removeKey(slot.id);
                          if (officialForm.id === slot.id) resetOfficialForm(true);
                          refresh();
                        }}
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {officialForm.id === slot.id && <div className="border-t border-[var(--border-light)] p-4">{renderOfficialForm('edit')}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'thirdparty' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border-light)] px-3 py-2">
            <div className="text-sm text-[var(--text-secondary)]">第三方供应商列表</div>
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 text-xs text-indigo-300"
              onClick={() => {
                setShowProviderCreateForm((prev) => {
                  const next = !prev;
                  if (next) {
                    setProviderForm(defaultProviderForm);
                    setAdvancedIdentityKey('');
                    setAdvancedResult(null);
                    setShowAdvancedMode(false);
                  }
                  return next;
                });
              }}
            >
              <Plus size={12} /> {showProviderCreateForm ? '收起添加' : '添加第三方供应商'}
            </button>
          </div>

          {showProviderCreateForm && !providerForm.id && (
            <div className="rounded-2xl border border-[var(--border-light)] p-4">{renderProviderForm('create')}</div>
          )}

          <div className="space-y-2">
            {providers.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)' }}>
                暂无第三方供应商配置。
              </div>
            ) : (
              providers.map((provider) => {
                const snapshot = (provider as any).pricingSnapshot as { fetchedAt?: number; rows?: Array<{ model?: string }> } | undefined;
                return (
                  <div key={provider.id} className="rounded-xl border" style={{ borderColor: 'var(--border-light)' }}>
                    <div className="flex items-start justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${!provider.isActive
                              ? 'bg-zinc-500'
                              : provider.status === 'error'
                                ? 'bg-red-500'
                                : provider.status === 'checking' || detectingProviderId === provider.id
                                  ? 'bg-blue-500 animate-pulse'
                                  : 'bg-emerald-500'
                              }`}
                          />
                          <div className="text-sm font-medium text-[var(--text-primary)]">{provider.name}</div>
                          <span className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                            {costModeText[((provider as any).customCostMode as CostMode) || 'unlimited']}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{provider.baseUrl}</div>
                        <div className="mt-1 text-xs text-[var(--text-tertiary)]">模型自动获取：{provider.models.length} 个</div>
                        <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                          状态：
                          {!provider.isActive ? (
                            <span className="ml-1 inline-flex items-center gap-1 text-zinc-400">
                              <Pause size={12} /> 已暂停
                            </span>
                          ) : provider.status === 'error' ? (
                            <span className="ml-1 inline-flex items-center gap-1 text-red-400">
                              <XCircle size={12} /> 异常
                            </span>
                          ) : provider.status === 'checking' || detectingProviderId === provider.id ? (
                            <span className="ml-1 inline-flex items-center gap-1 text-blue-400">
                              <RefreshCw size={12} className="animate-spin" /> 验证中
                            </span>
                          ) : (
                            <span className="ml-1 inline-flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 size={12} /> 正常
                            </span>
                          )}
                        </div>
                        {provider.status === 'error' && (provider as any).lastError && (
                          <div className="mt-0.5 text-[11px] text-red-400/70">
                            错误详情：{(provider as any).lastError}
                          </div>
                        )}
                        {snapshot?.fetchedAt ? <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">高级模式获取：{formatDate(snapshot.fetchedAt)}</div> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="rounded-lg border border-[var(--border-light)] px-2 py-1 text-xs" onClick={() => loadProviderToForm(provider)} title="编辑">
                          <Edit3 size={12} />
                        </button>
                        <button className="rounded-lg border border-[var(--border-light)] px-2 py-1 text-xs" onClick={() => void handleValidateProvider(provider)} title="重新验证">
                          <RefreshCw size={12} className={detectingProviderId === provider.id ? 'animate-spin' : ''} />
                        </button>
                        <button className="rounded-lg border border-[var(--border-light)] px-2 py-1 text-xs" onClick={() => handleToggleProvider(provider)} title={provider.isActive ? '暂停' : '启用'}>
                          {provider.isActive ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                        <button className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-400" onClick={() => handleDeleteProvider(provider.id)} title="删除">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {providerForm.id === provider.id && <div className="border-t border-[var(--border-light)] p-4">{renderProviderForm('edit')}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiSettingsView;
