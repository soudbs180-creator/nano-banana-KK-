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
import { mergeModelPricingOverrides } from '../../services/model/modelPricing';

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
  pricingData?: any[]; // 原始价格数据
  groupRatio?: Record<string, number>; // 分组倍率
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

  // 高级模式不再需要系统令牌，自动从 baseUrl/api/pricing 公开端点获取
  const [advancedResult, setAdvancedResult] = useState<AdvancedResult | null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);

  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [detectingProviderId, setDetectingProviderId] = useState<string | null>(null);
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);

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
    // 加载已保存的价格快照（如果有）

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

  /**
   * 从供应商的 /pricing 页面获取价格数据
   * /pricing 是 SPA 网页，/api/pricing 是其背后的 JSON 数据源
   * 通过服务端代理（/api/pricing-proxy）绕过浏览器 CORS 限制
   */
  const fetchPricingFromUrl = async (baseUrl: string): Promise<AdvancedResult | null> => {
    const cleanUrl = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');

    try {
      // 通过服务端代理请求，绕过浏览器 CORS 限制
      console.log(`[ApiSettings] 通过代理扫描价格页面: ${cleanUrl}/pricing`);
      const proxyResponse = await fetch('/api/pricing-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: cleanUrl }),
      });

      if (proxyResponse.ok) {
        const proxyData = await proxyResponse.json();

        if (proxyData.error) {
          console.log(`[ApiSettings] 代理返回错误: ${proxyData.error}`);
          return null;
        }

        const pricingList: any[] = proxyData.data || [];
        const groupRatio: Record<string, number> = proxyData.group_ratio || {};

        if (pricingList.length === 0) {
          console.log('[ApiSettings] 代理返回空的价格列表');
          return null;
        }

        const modelNames = pricingList.map((item: any) => item.model_name || item.model || '').filter(Boolean);
        console.log(`[ApiSettings] 价格扫描成功: ${pricingList.length} 个模型`);
        return {
          models: modelNames,
          apiType: 'proxy',
          pricingHint: `已从供应商价格页面获取 ${pricingList.length} 个模型的价格与倍率。`,
          fetchedAt: Date.now(),
          pricingData: pricingList,
          groupRatio,
        };
      }
    } catch (e: any) {
      console.log('[ApiSettings] 代理请求失败，尝试直接请求:', e?.message);
    }

    // 回退方案：直接请求（可能受 CORS 限制）
    try {
      const directUrl = `${cleanUrl}/api/pricing`;
      console.log(`[ApiSettings] 尝试直接请求: ${directUrl}`);
      const response = await fetch(directUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) return null;

      const text = await response.text();
      if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) return null;

      const data = JSON.parse(text);
      const pricingList: any[] = data.data || [];
      const groupRatio: Record<string, number> = data.group_ratio || {};
      if (pricingList.length === 0) return null;

      const modelNames = pricingList.map((item: any) => item.model_name || item.model || '').filter(Boolean);
      return {
        models: modelNames,
        apiType: 'proxy',
        pricingHint: `已从供应商价格页面获取 ${pricingList.length} 个模型的价格与倍率。`,
        fetchedAt: Date.now(),
        pricingData: pricingList,
        groupRatio,
      };
    } catch {
      return null;
    }
  };

  // 高级模式手动触发价格扫描
  const handleDetectAdvanced = async () => {
    const baseUrl = providerForm.baseUrl.trim();

    if (!baseUrl) {
      notify.error('缺少字段', '请先填写接口地址。');
      return;
    }

    setAdvancedLoading(true);
    try {
      const result = await fetchPricingFromUrl(baseUrl);
      if (result) {
        setAdvancedResult(result);
        notify.success('扫描成功', `已从价格页面识别 ${result.models.length} 个模型及价格。`);
      } else {
        setAdvancedResult({
          models: [],
          apiType: 'proxy',
          pricingHint: '该供应商暂不支持价格页面扫描，或价格数据为空。',
          fetchedAt: Date.now(),
        });
        notify.error('扫描失败', '未从价格页面获取到数据。该供应商可能不支持此功能。');
      }
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

    // 通过 apiKey + /v1/models 获取模型列表
    let models: string[] = [];
    try {
      const detect = await autoDetectAndConfigureModels(apiKey, baseUrl);
      models = detect.models || [];
    } catch (saveDetectErr: any) {
      console.warn('[ApiSettings] 保存时自动获取模型失败:', saveDetectErr?.message);
      models = [];
    }

    // 🚀 自动无感扫描价格页面（baseUrl/pricing 的数据源）
    let pricingSnapshot: any = undefined;
    if (advancedResult && advancedResult.pricingData && advancedResult.pricingData.length > 0) {
      // 已有手动扫描结果，直接使用
      pricingSnapshot = {
        fetchedAt: advancedResult.fetchedAt,
        note: advancedResult.pricingHint,
        rows: advancedResult.pricingData.map((item: any) => ({
          model: item.model_name || item.model || '',
          modelRatio: item.model_ratio,
          modelPrice: item.model_price,
          completionRatio: item.completion_ratio,
          quotaType: item.quota_type,
        })),
        groupRatio: advancedResult.groupRatio,
      };
    } else {
      // 静默自动扫描价格页面
      const silentResult = await fetchPricingFromUrl(baseUrl);
      if (silentResult && silentResult.pricingData && silentResult.pricingData.length > 0) {
        pricingSnapshot = {
          fetchedAt: silentResult.fetchedAt,
          note: silentResult.pricingHint,
          rows: silentResult.pricingData.map((item: any) => ({
            model: item.model_name || item.model || '',
            modelRatio: item.model_ratio,
            modelPrice: item.model_price,
            completionRatio: item.completion_ratio,
            quotaType: item.quota_type,
          })),
          groupRatio: silentResult.groupRatio,
        };
        console.log(`[ApiSettings] 自动价格扫描成功: ${silentResult.pricingData.length} 个模型`);
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
      pricingSnapshot,
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

    // 🚀 将扫描到的价格数据注入到 modelPricing 覆写系统
    // 这样 costService.calculateCost → getModelPricing 就能拿到精确的倍率和价格
    // pricingData 原始数据已包含 model_ratio、completion_ratio 等字段
    const rawPricingData = advancedResult?.pricingData || (pricingSnapshot as any)?._rawData;
    if (rawPricingData?.length) {
      // 找到 default 分组的倍率（用户大多属于 default 组）
      const gRatioMap = (advancedResult?.groupRatio || pricingSnapshot?.groupRatio || {}) as Record<string, number>;
      const defaultGroupRatio = gRatioMap['default'] ?? gRatioMap['Default'] ?? 1;

      // 为每个模型补上 group_ratio 数值（原始数据中没有逐模型的 group_ratio）
      const enrichedData = rawPricingData.map((item: any) => ({
        ...item,
        // model_name 或 model 作为 ID（extractPricingMap 会读 item.model）
        model: item.model_name || item.model,
        group_ratio: defaultGroupRatio,
      }));
      mergeModelPricingOverrides(enrichedData);
      console.log(`[ApiSettings] 已将 ${enrichedData.length} 个模型的价格数据注入计费系统 (默认组倍率: ×${defaultGroupRatio})`);
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
      // 用普通 apiKey 检测
      const detect = await autoDetectAndConfigureModels(provider.apiKey, provider.baseUrl);

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

  const handleManualSyncPricing = async (provider: ThirdPartyProvider) => {
    setSyncingProviderId(provider.id);
    try {
      const ok = await keyManager.syncProviderPricing(provider.id);
      if (ok) {
        notify.success('同步成功', `已拉取 ${provider.name} 的最新价格配置。`);
      } else {
        notify.error('同步失败', `无法拉取 ${provider.name} 的价格信息，该供应商可能不支持此功能或网络异常。`);
      }
      refresh();
    } finally {
      setSyncingProviderId(null);
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
            <div className="text-sm font-medium text-[var(--text-primary)]">价格扫描</div>
            <p className="text-xs text-[var(--text-tertiary)]">
              保存时会自动扫描供应商价格页面（接口地址/pricing）获取模型价格与倍率。也可点击下方按钮手动扫描预览。
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 text-xs text-indigo-300"
                onClick={() => void handleDetectAdvanced()}
                disabled={advancedLoading || !providerForm.baseUrl.trim()}
              >
                <Search size={12} /> {advancedLoading ? '扫描中...' : '扫描模型与价格'}
              </button>
              {!providerForm.baseUrl.trim() && (
                <span className="text-[11px] text-[var(--text-tertiary)]">请先填写接口地址</span>
              )}
            </div>

            {advancedResult && (
              <div className="rounded-lg border border-[var(--border-light)] p-3 text-xs text-[var(--text-tertiary)]">
                <div>扫描时间：{formatDate(advancedResult.fetchedAt)}</div>
                <div className="mt-1">{advancedResult.pricingHint}</div>
                {advancedResult.groupRatio && Object.keys(advancedResult.groupRatio).length > 0 && (
                  <div className="mt-1">分组倍率：{Object.entries(advancedResult.groupRatio).map(([g, r]) => `${g}(×${r})`).join('、')}</div>
                )}
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {advancedResult.models.length === 0 ? (
                    <span>暂无模型</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {advancedResult.models.map((model) => {
                        const priceInfo = advancedResult.pricingData?.find((p: any) => (p.model_name || p.model) === model);
                        const priceLabel = priceInfo
                          ? priceInfo.quota_type === 1
                            ? `¥${priceInfo.model_price}/次`
                            : `×${priceInfo.model_ratio}`
                          : '';
                        return (
                          <span key={model} className="rounded-full border border-[var(--border-light)] px-2 py-1 text-[11px] text-[var(--text-secondary)]" title={priceLabel}>
                            {model}{priceLabel ? ` (${priceLabel})` : ''}
                          </span>
                        );
                      })}
                    </div>
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
                        {snapshot?.fetchedAt && (
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                            价格同步时间：{formatDate(snapshot.fetchedAt)}
                          </div>
                        )}
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
