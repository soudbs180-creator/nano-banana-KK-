
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import {
  buildProviderPricingSnapshot,
  type ProviderPricingSnapshot,
} from '../../services/auth/providerPricingSnapshot';
import { supplierService, type Supplier as LegacySupplier } from '../../services/billing/supplierService';
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
  group: string;
  costMode: CostMode;
  costValue: number;
  providerColor: string;
  isActive: boolean;
};

type AdvancedResult = {
  models: string[];
  apiType: string;
  pricingHint: string;
  fetchedAt: number;
  pricingData?: any[];
  groupRatio?: Record<string, number>;
  availableGroups?: string[];
};

type GroupPriceValue = {
  modelRatio?: number;
  completionRatio?: number;
  modelPrice?: number;
};

type AdvancedPricingRow = {
  model: string;
  provider?: string;
  providerLabel?: string;
  tokenGroup?: string;
  billingType?: string;
  quotaType?: number | string;
  basePrice?: number;
  modelRatio?: number;
  completionRatio?: number;
  inputPrice?: number;
  outputPrice?: number;
  cacheReadPrice?: number;
  cacheCreationPrice?: number;
  perRequestPrice?: number;
  groupRatio?: number;
  currency?: string;
  sizeRatioMap: Record<string, number>;
  groupModelRatioMap: Record<string, number>;
  groupSizeRatioMap: Record<string, Record<string, number>>;
  groupPriceMap: Record<string, GroupPriceValue>;
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
  group: '',
  costMode: 'unlimited',
  costValue: 0,
  providerColor: '#3B82F6',
  isActive: true,
};

const elevatedPanelStyle = {
  borderColor: 'var(--border-light)',
  backgroundColor: 'var(--bg-elevated)',
} as const;

const overlayPanelStyle = {
  borderColor: 'var(--border-light)',
  backgroundColor: 'var(--bg-overlay)',
} as const;

const formFieldStyle = {
  borderColor: 'var(--border-light)',
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-elevated)',
} as const;

const secondaryButtonStyle = {
  borderColor: 'var(--border-light)',
  color: 'var(--text-primary)',
  backgroundColor: 'var(--bg-elevated)',
} as const;

const toProviderForm = (provider?: ThirdPartyProvider): ProviderForm => {
  if (!provider) return defaultProviderForm;

  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    group: provider.group || '',
    costMode: (provider.customCostMode as CostMode | undefined) || 'unlimited',
    costValue: Number(provider.customCostValue || 0),
    providerColor: provider.providerColor || provider.badgeColor || '#3B82F6',
    isActive: provider.isActive,
  };
};

const formatDate = (ts?: number) => {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
};

interface ApiSettingsViewProps {
  initialSupplier?: LegacySupplier | null;
}

const toFiniteNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatMultiplier = (value: unknown) => {
  const num = toFiniteNumber(value);
  return num === undefined ? '-' : `×${num}`;
};

const normalizeRatioMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, raw]) => {
    const num = toFiniteNumber(raw);
    if (num !== undefined) {
      acc[String(key)] = num;
    }
    return acc;
  }, {});
};

const normalizeNestedRatioMap = (value: unknown): Record<string, Record<string, number>> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, Record<string, number>>>((acc, [key, raw]) => {
    const ratioMap = normalizeRatioMap(raw);
    if (Object.keys(ratioMap).length > 0) {
      acc[String(key)] = ratioMap;
    }
    return acc;
  }, {});
};

const normalizeGroupPriceMap = (value: unknown): Record<string, GroupPriceValue> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, GroupPriceValue>>((acc, [key, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return acc;
    const item = raw as Record<string, unknown>;
    const modelRatio = toFiniteNumber(item.modelRatio ?? item.model_ratio);
    const completionRatio = toFiniteNumber(item.completionRatio ?? item.completion_ratio);
    const modelPrice = toFiniteNumber(item.modelPrice ?? item.model_price ?? item.price);

    if (modelRatio !== undefined || completionRatio !== undefined || modelPrice !== undefined) {
      acc[String(key)] = { modelRatio, completionRatio, modelPrice };
    }

    return acc;
  }, {});
};

const formatPricingAmount = (value: unknown, suffix = '') => {
  const num = toFiniteNumber(value);
  return num === undefined ? null : `¥${num.toFixed(4)}${suffix}`;
};

const resolveBillingLabel = (billingType?: string, quotaType?: number | string, perRequestPrice?: number) => {
  const normalized = String(billingType || '').trim().toLowerCase();
  if (
    normalized.includes('request') ||
    normalized.includes('per_request') ||
    normalized.includes('image') ||
    quotaType === 1 ||
    quotaType === 'per_request' ||
    perRequestPrice !== undefined
  ) {
    return '按次';
  }
  return '按量';
};

const sortRatioEntries = (ratioMap: Record<string, number>) =>
  Object.entries(ratioMap).sort(([left], [right]) => {
    if (left === '1K') return -1;
    if (right === '1K') return 1;
    if (left === '4K') return 1;
    if (right === '4K') return -1;
    return left.localeCompare(right, 'zh-CN');
  });
};

const restorePricingDataFromSnapshot = (snapshot?: ProviderPricingSnapshot) => {
  if (!snapshot) return undefined;
  if (Array.isArray(snapshot._rawData) && snapshot._rawData.length > 0) {
    return snapshot._rawData;
  }

  if (!Array.isArray(snapshot.rows) || snapshot.rows.length === 0) {
    return undefined;
  }

  return snapshot.rows
    .map((item) => {
      const model = String(item.model || '').trim();
      if (!model) return null;
      return {
        model,
        provider: item.provider,
        provider_label: item.providerLabel,
        provider_logo: item.providerLogo,
        tags: item.tags,
        token_group: item.tokenGroup,
        billing_type: item.billingType,
        endpoint_type: item.endpointType,
        model_name: model,
        model_ratio: item.modelRatio,
        model_price: item.modelPrice,
        completion_ratio: item.completionRatio,
        quota_type: item.quotaType,
        size_ratio: item.sizeRatio,
        group_model_ratio: item.groupModelRatio,
        group_size_ratio: item.groupSizeRatio,
        group_model_price: item.groupModelPrice,
      };
    })
    .filter(Boolean);
};

const costModeText: Record<CostMode, string> = {
  unlimited: '无限',
  amount: '金额',
  tokens: 'Tokens',
};

const getDefaultGroupRatio = (groupRatio?: Record<string, number>) => {
  if (!groupRatio) return 1;
  return (
    groupRatio.default ??
    groupRatio.Default ??
    groupRatio.DEFAULT ??
    Object.values(groupRatio).find((value) => Number.isFinite(value)) ??
    1
  );
};

const extractAvailableGroups = (pricingData?: any[], groupRatio?: Record<string, number>) => {
  const groups = new Set<string>();

  Object.keys(groupRatio || {}).forEach((group) => {
    if (group) groups.add(String(group).trim());
  });

  for (const item of Array.isArray(pricingData) ? pricingData : []) {
    const enableGroups = Array.isArray(item?.enable_groups) ? item.enable_groups : [];
    enableGroups.forEach((group: unknown) => {
      const value = String(group || '').trim();
      if (value) groups.add(value);
    });

    const nestedGroupMaps = [
      item?.group_size_ratio,
      item?.group_model_price,
      item?.group_model_ratio,
    ];

    nestedGroupMaps.forEach((groupMap) => {
      if (!groupMap || typeof groupMap !== 'object' || Array.isArray(groupMap)) return;
      Object.keys(groupMap).forEach((group) => {
        const value = String(group || '').trim();
        if (value) groups.add(value);
      });
    });
  }

  return Array.from(groups).sort((left, right) => {
    if (left === 'default') return -1;
    if (right === 'default') return 1;
    return left.localeCompare(right, 'zh-CN');
  });
};

const ApiSettingsModal: React.FC<{
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}> = ({ children, onClose, title, subtitle }) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center overflow-y-auto bg-black/60 px-4 py-5 backdrop-blur-md sm:px-6 sm:py-6"
      onClick={onClose}
    >
      <div
        className="flex min-h-0 w-full max-w-[920px] flex-col overflow-hidden rounded-[28px] border shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
        style={{
          borderColor: 'var(--border-light)',
          background: 'linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)',
          maxHeight: 'calc(100vh - 24px)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {(title || subtitle) && (
          <div
            className="flex items-start justify-between border-b p-5 sm:p-6"
            style={{
              borderColor: 'var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <div>
              {title && <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>}
              {subtitle && <div className="mt-1 text-xs text-[var(--text-tertiary)]">{subtitle}</div>}
            </div>
            <button 
              className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs transition-colors hover:bg-white/5"
              style={secondaryButtonStyle}
              onClick={onClose}
            >
              <XCircle size={12} />关闭
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-6 sm:p-6 sm:pb-7">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

const ApiSettingsView: React.FC<ApiSettingsViewProps> = ({ initialSupplier = null }) => {
  const [tab, setTab] = useState<Tab>('thirdparty');
  const [slots, setSlots] = useState<KeySlot[]>([]);
  const [providers, setProviders] = useState<ThirdPartyProvider[]>([]);

  const [officialForm, setOfficialForm] = useState<OfficialForm>(defaultOfficialForm);
  const [providerForm, setProviderForm] = useState<ProviderForm>(defaultProviderForm);

  const [showOfficialCreateForm, setShowOfficialCreateForm] = useState(false);
  const [showProviderCreateForm, setShowProviderCreateForm] = useState(false);
  const [showAdvancedMode, setShowAdvancedMode] = useState(false);

  const [advancedResult, setAdvancedResult] = useState<AdvancedResult | null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [pricingSearch, setPricingSearch] = useState('');
  const providerEditorRef = useRef<HTMLDivElement | null>(null);
  const providerEditorBodyRef = useRef<HTMLDivElement | null>(null);
  const didAutoOpenProviderRef = useRef(false);
  const appliedInitialSupplierRef = useRef<string | null>(null);

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
        group: (supplier as any).group || undefined,
        models: (supplier.models || []).map((model) => model.id).filter(Boolean),
        format: 'auto',
        isActive: true,
        providerColor: '#3B82F6',
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
        group: slot.group || undefined,
        models: slot.supportedModels || [],
        format: 'auto',
        isActive: !slot.disabled,
        providerColor: '#3B82F6',
        badgeColor: '#3B82F6',
      } as any);

      existingSignature.add(signature);
      migratedCount += 1;
    });

    if (migratedCount > 0) {
      notify.success('历史数据已恢复', `已自动迁移 ${migratedCount} 条旧接口配置。`);
    }
  };

  const refresh = () => {
    setSlots(keyManager.getSlots());
    setProviders(keyManager.getProviders());
  };

  useEffect(() => {
    setTab('thirdparty');
    migrateLegacyDataIfNeeded();
    refresh();
    const unsubscribe = keyManager.subscribe(() => refresh());
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!showProviderCreateForm) return;
    let frameB = 0;

    const scrollEditorIntoView = () => {
      const editorCard = providerEditorRef.current;
      if (!editorCard) return;

      providerEditorBodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });

      let scrollParent: HTMLElement | null = editorCard.parentElement;
      while (scrollParent) {
        const style = window.getComputedStyle(scrollParent);
        const canScroll =
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          scrollParent.scrollHeight > scrollParent.clientHeight + 8;

        if (canScroll) {
          const targetTop =
            editorCard.getBoundingClientRect().top -
            scrollParent.getBoundingClientRect().top +
            scrollParent.scrollTop -
            20;
          scrollParent.scrollTo({
            top: Math.max(0, targetTop),
            behavior: 'auto',
          });
          return;
        }

        scrollParent = scrollParent.parentElement;
      }

      const absoluteTop = editorCard.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: Math.max(0, absoluteTop), behavior: 'auto' });
    };

    const frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(scrollEditorIntoView);
    });

    return () => {
      window.cancelAnimationFrame(frameA);
      if (frameB) {
        window.cancelAnimationFrame(frameB);
      }
    };
  }, [showProviderCreateForm, providerForm.id]);

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
  }, [officialKeys.length, providers]);
  const currentEditingProvider = useMemo(
    () => providers.find((item) => item.id === providerForm.id),
    [providers, providerForm.id]
  );
  const editingProviderName = providerForm.name.trim() || currentEditingProvider?.name || '未命名供应商';
  const editingProviderBaseUrl = providerForm.baseUrl.trim() || currentEditingProvider?.baseUrl || '';
  const filteredProviders = useMemo(() => {
    const keyword = providerSearch.trim().toLowerCase();
    if (!keyword) return providers;

    return providers.filter((provider) => {
      const haystack = [
        provider.name,
        provider.baseUrl,
        provider.group,
        ...(provider.models || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [providerSearch, providers]);
  const advancedPricingRows = useMemo(() => {
    if (!advancedResult?.pricingData?.length) return [];

    return advancedResult.pricingData
      .map((item: any) => {
        const model = String(item.model_name || item.model || '').trim();
        if (!model) return null;

        return {
          model,
          provider: typeof item.provider === 'string' ? item.provider.trim() : undefined,
          providerLabel: typeof item.provider_label === 'string' ? item.provider_label.trim() : undefined,
          tokenGroup: typeof item.token_group === 'string' ? item.token_group.trim() : undefined,
          billingType:
            typeof item.billing_type === 'string'
              ? item.billing_type.trim()
              : typeof item.type === 'string'
                ? item.type.trim()
                : undefined,
          quotaType: item.quota_type,
          basePrice: item.model_price,
          modelRatio: item.model_ratio,
          completionRatio: item.completion_ratio,
          inputPrice: toFiniteNumber(item.input_price ?? item.inputPrice ?? item.input_per_million_tokens),
          outputPrice: toFiniteNumber(item.output_price ?? item.outputPrice ?? item.output_per_million_tokens),
          cacheReadPrice: toFiniteNumber(item.cache_read_price ?? item.cacheReadPrice ?? item.cached_input_price),
          cacheCreationPrice: toFiniteNumber(item.cache_creation_price ?? item.cacheCreationPrice ?? item.cached_output_price),
          perRequestPrice: toFiniteNumber(item.per_request_price ?? item.perRequestPrice ?? item.price_per_image ?? item.pricePerImage),
          groupRatio: toFiniteNumber(item.group_ratio ?? item.groupMultiplier),
          currency: typeof item.currency === 'string' ? item.currency.trim() : undefined,
          sizeRatioMap: normalizeRatioMap(item.size_ratio ?? item.sizeRatio),
          groupModelRatioMap: normalizeRatioMap(item.group_model_ratio ?? item.groupModelRatio),
          groupSizeRatioMap: normalizeNestedRatioMap(item.group_size_ratio ?? item.groupSizeRatio),
          groupPriceMap: normalizeGroupPriceMap(item.group_model_price ?? item.groupModelPrice),
        };
      })
      .filter(Boolean) as AdvancedPricingRow[];
  }, [advancedResult]);

  const filteredAdvancedPricingRows = useMemo(() => {
    const keyword = pricingSearch.trim().toLowerCase();
    if (!keyword) return advancedPricingRows;

    return advancedPricingRows.filter((row) => {
      const haystack = [
        row.model,
        row.provider,
        row.providerLabel,
        row.tokenGroup,
        row.billingType,
        row.quotaType,
        ...Object.keys(row.sizeRatioMap),
        ...Object.keys(row.groupModelRatioMap),
        ...Object.keys(row.groupSizeRatioMap),
        ...Object.keys(row.groupPriceMap),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [advancedPricingRows, pricingSearch]);

  const parseCost = (mode: CostMode, value: number) => {
    if (mode === 'unlimited') return { budgetLimit: -1, tokenLimit: -1 };
    if (mode === 'amount') return { budgetLimit: Math.max(0, value), tokenLimit: -1 };
    return { budgetLimit: -1, tokenLimit: Math.max(0, value) };
  };

  const resetOfficialForm = (closeCreate = true) => {
    setOfficialForm(defaultOfficialForm);
    if (closeCreate) setShowOfficialCreateForm(false);
  };

  const resetThirdPartyForm = (closeCreate = true) => {
    setProviderForm(defaultProviderForm);
    setAdvancedResult(null);
    setPricingSearch('');
    // 仅关闭表单时重置高级模式，取消编辑时不影响当前展开状态
    if (closeCreate) {
      setShowAdvancedMode(false);
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
    setShowOfficialCreateForm(true);
  };

  const loadProviderToForm = (provider: ThirdPartyProvider) => {
    setProviderForm(toProviderForm(provider));
    setPricingSearch('');
    const snapshot = provider.pricingSnapshot;

    if (snapshot && snapshot.rows && snapshot.rows.length > 0) {
      const restoredPricingData = restorePricingDataFromSnapshot(snapshot);
      const restoredGroupRatio =
        snapshot.groupRatioMap ||
        (typeof snapshot.groupRatio === 'number' ? { default: snapshot.groupRatio } : undefined);

      // 从 rows 中提取模型名称
      const modelNames = snapshot.rows
        .map((item) => String(item.model || '').trim())
        .filter(Boolean);

      setAdvancedResult({
        models: modelNames,
        apiType: provider.format || 'auto',
        pricingHint: snapshot.note || `已保存 ${modelNames.length} 个模型的价格配置`,
        fetchedAt: snapshot.fetchedAt || Date.now(),
        pricingData: restoredPricingData,
        groupRatio: restoredGroupRatio,
        availableGroups: extractAvailableGroups(restoredPricingData, restoredGroupRatio),
      });
      // 如果有价格快照，自动展开高级模式以便查看
      setShowAdvancedMode(true);
    } else {
      setAdvancedResult(null);
      setShowAdvancedMode(false);
    }

    setShowProviderCreateForm(true);
  };

  useEffect(() => {
    if (!initialSupplier) return;

    const supplierSignature = [
      initialSupplier.id,
      initialSupplier.name,
      initialSupplier.baseUrl,
      initialSupplier.apiKey,
    ].join('|');

    if (appliedInitialSupplierRef.current === supplierSignature) return;

    setTab('thirdparty');

    const matchedProvider =
      providers.find((item) => item.id === initialSupplier.id) ||
      providers.find(
        (item) =>
          item.baseUrl.trim() === initialSupplier.baseUrl.trim() &&
          item.name.trim() === initialSupplier.name.trim()
      );

    appliedInitialSupplierRef.current = supplierSignature;

    if (matchedProvider) {
      loadProviderToForm(matchedProvider);
      return;
    }

    setProviderForm({
      id: undefined,
      name: initialSupplier.name || '',
      baseUrl: initialSupplier.baseUrl || '',
      apiKey: initialSupplier.apiKey || '',
      group: '',
      costMode:
        typeof initialSupplier.budgetLimit === 'number' && initialSupplier.budgetLimit > 0 ? 'amount' : 'unlimited',
      costValue:
        typeof initialSupplier.budgetLimit === 'number' && initialSupplier.budgetLimit > 0 ? initialSupplier.budgetLimit : 0,
      providerColor: '#3B82F6',
      isActive: true,
    });
    setAdvancedResult(null);
    setPricingSearch('');
    setShowAdvancedMode(false);
    setShowProviderCreateForm(true);
  }, [initialSupplier, providers]);

  useEffect(() => {
    if (initialSupplier) return;
    if (tab !== 'thirdparty') return;
    if (showProviderCreateForm) return;
    if (providerForm.id) return;
    if (didAutoOpenProviderRef.current) return;
    if (!providers.length) return;

    const preferredProvider = providers.find((item) => item.isActive) || providers[0];
    if (!preferredProvider) return;

    didAutoOpenProviderRef.current = true;
    loadProviderToForm(preferredProvider);
  }, [tab, providers, providerForm.id, showProviderCreateForm]);

  const handleSaveOfficial = async () => {
    const name = officialForm.name.trim();
    const key = officialForm.key.trim();
    if (!name || !key) {
      notify.error('保存失败', '请填写名称和 API Key。');
      return;
    }

    const { budgetLimit, tokenLimit } = parseCost(officialForm.costMode, officialForm.costValue);

    try {
      if (officialForm.id) {
        await keyManager.updateKey(officialForm.id, {
          name,
          key,
          budgetLimit,
          tokenLimit,
          disabled: false,
        });
        notify.success('保存成功', '官方接口已更新。');
      } else {
        const result = await keyManager.addKey(key, {
          name,
          provider: 'Google',
          type: 'official',
          budgetLimit,
          tokenLimit,
        });

        if (!result.success) {
          notify.error('添加失败', result.error || '无法保存官方接口。');
          return;
        }

        notify.success('添加成功', '官方接口已添加。');
      }

      resetOfficialForm(true);
      refresh();
    } catch (error: any) {
      notify.error('保存失败', error?.message || '无法保存官方接口。');
    }
  };

  const fetchPricingFromUrl = async (baseUrl: string): Promise<AdvancedResult | null> => {
    const cleanUrl = baseUrl.replace(/\/+$/, '');

    try {
      const proxyResponse = await fetch('/api/pricing-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: cleanUrl }),
      });

      if (proxyResponse.ok) {
        const proxyData = await proxyResponse.json();
        if (proxyData.error) return null;

        const pricingList: any[] = Array.isArray(proxyData.data) ? proxyData.data : [];
        const groupRatio = (proxyData.group_ratio || {}) as Record<string, number>;
        if (!pricingList.length) return null;

        return {
          models: pricingList.map((item: any) => item.model_name || item.model || '').filter(Boolean),
          apiType: 'proxy',
          pricingHint: `已从供应商价格页抓取 ${pricingList.length} 个模型的基础价与倍率。`,
          fetchedAt: Date.now(),
          pricingData: pricingList,
          groupRatio,
          availableGroups: extractAvailableGroups(pricingList, groupRatio),
        };
      }
    } catch (error) {
      console.warn('[ApiSettings] pricing proxy failed', error);
    }

    try {
      for (const endpoint of ['/api/pricing', '/pricing']) {
        const response = await fetch(`${cleanUrl}${endpoint}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) continue;
        const text = await response.text();
        if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) continue;

        const data = JSON.parse(text);
        const pricingList: any[] = Array.isArray(data.data) ? data.data : [];
        const groupRatio = (data.group_ratio || {}) as Record<string, number>;
        if (!pricingList.length) continue;

        return {
          models: pricingList.map((item: any) => item.model_name || item.model || '').filter(Boolean),
          apiType: 'direct',
          pricingHint: `已从供应商价格接口抓取 ${pricingList.length} 个模型的基础价与倍率。`,
          fetchedAt: Date.now(),
          pricingData: pricingList,
          groupRatio,
          availableGroups: extractAvailableGroups(pricingList, groupRatio),
        };
      }
    } catch (error) {
      console.warn('[ApiSettings] direct pricing fetch failed', error);
    }

    return null;
  };

  const handleDetectAdvanced = async () => {
    const baseUrl = providerForm.baseUrl.trim();
    if (!baseUrl) {
      notify.error('扫描失败', '请先填写供应商基础地址。');
      return;
    }

    setAdvancedLoading(true);
    try {
      const result = await fetchPricingFromUrl(baseUrl);
      if (!result) {
        setAdvancedResult({
          models: [],
          apiType: 'proxy',
          pricingHint: '该供应商暂未返回价格数据。',
          fetchedAt: Date.now(),
          availableGroups: [],
        });
        notify.error('扫描失败', '未从价格页获取到基础价和倍率信息。');
        return;
      }

      setAdvancedResult(result);
      setShowAdvancedMode(true);
      notify.success('扫描成功', `已识别 ${result.models.length} 个模型价格配置。`);
    } finally {
      setAdvancedLoading(false);
    }
  };

  const injectPricingOverrides = (pricingSnapshot?: ProviderPricingSnapshot, sourceData?: any[]) => {
    const rawPricingData = sourceData || pricingSnapshot?._rawData;
    if (!rawPricingData?.length) return;

    const groupRatioMap = pricingSnapshot?.groupRatioMap || {};
    const defaultGroupRatio =
      getDefaultGroupRatio(groupRatioMap) ||
      (typeof pricingSnapshot?.groupRatio === 'number' ? pricingSnapshot.groupRatio : 1);

    const enrichedData = rawPricingData.map((item: any) => ({
      ...item,
      model: item.model_name || item.model,
      group_ratio: item.group_ratio ?? defaultGroupRatio,
    }));

    mergeModelPricingOverrides(enrichedData);
  };
  const handleSaveProvider = async () => {
    const name = providerForm.name.trim();
    const baseUrl = providerForm.baseUrl.trim();
    const apiKey = providerForm.apiKey.trim();
    const existingProvider = providerForm.id ? providers.find((item) => item.id === providerForm.id) : undefined;

    if (!name || !baseUrl || !apiKey) {
      notify.error('保存失败', '请填写供应商名称、基础地址和 API Key。');
      return;
    }

    const { budgetLimit, tokenLimit } = parseCost(providerForm.costMode, providerForm.costValue);

    let models: string[] = [];
    let pricingModelNames: string[] = (advancedResult?.models || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    try {
      const detect = await autoDetectAndConfigureModels(apiKey, baseUrl);
      models = detect.models || [];
    } catch (error) {
      console.warn('[ApiSettings] detect models before save failed', error);
      models = existingProvider?.models || [];
    }

    if ((!models || models.length === 0) && existingProvider?.models?.length) {
      models = existingProvider.models;
    }

    let pricingSnapshot: ProviderPricingSnapshot | undefined;
    let sourcePricingData = advancedResult?.pricingData;

    if (advancedResult?.pricingData?.length) {
      pricingSnapshot = buildProviderPricingSnapshot(advancedResult.pricingData, advancedResult.groupRatio, {
        fetchedAt: advancedResult.fetchedAt,
        note: advancedResult.pricingHint,
      });
    } else {
      const silentResult = await fetchPricingFromUrl(baseUrl);
      if (silentResult?.pricingData?.length) {
        sourcePricingData = silentResult.pricingData;
        pricingModelNames = (silentResult.models || [])
          .map((item) => String(item || '').trim())
          .filter(Boolean);
        pricingSnapshot = buildProviderPricingSnapshot(silentResult.pricingData, silentResult.groupRatio, {
          fetchedAt: silentResult.fetchedAt,
          note: silentResult.pricingHint,
        });
      }
    }

    if (!pricingSnapshot && existingProvider?.pricingSnapshot) {
      pricingSnapshot = existingProvider.pricingSnapshot;
    }

    const snapshotModelNames = (pricingSnapshot?.rows || [])
      .map((item) => String(item?.model || '').trim())
      .filter(Boolean);

    const mergedModels = Array.from(new Set(
      [...models, ...pricingModelNames, ...snapshotModelNames]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    ));

    if (mergedModels.length > 0) {
      models = mergedModels;
    }

    const payload = {
      name,
      baseUrl,
      apiKey,
      group: providerForm.group.trim() || undefined,
      models,
      format: 'auto' as const,
      isActive: providerForm.isActive,
      budgetLimit,
      tokenLimit,
      customCostMode: providerForm.costMode,
      customCostValue: providerForm.costValue,
      providerColor: providerForm.providerColor,
      badgeColor: providerForm.providerColor,
      pricingSnapshot,
    };

    if (providerForm.id) {
      const ok = keyManager.updateProvider(providerForm.id, payload);
      if (!ok) {
        notify.error('保存失败', '供应商更新失败。');
        return;
      }
      notify.success('保存成功', '供应商配置已更新。');
    } else {
      keyManager.addProvider(payload as any);
      notify.success('添加成功', '供应商配置已保存。');
    }

    injectPricingOverrides(pricingSnapshot, sourcePricingData);
    resetThirdPartyForm(true);
    refresh();
  };

  const handleDeleteOfficial = (id: string) => {
    if (!window.confirm('确认删除该官方接口吗？')) return;
    keyManager.removeKey(id);
    if (officialForm.id === id) resetOfficialForm(true);
    notify.success('删除成功', '官方接口已删除。');
    refresh();
  };

  const handleDeleteProvider = (id: string) => {
    if (!window.confirm('确认删除该供应商吗？')) return;
    const ok = keyManager.removeProvider(id);
    if (!ok) {
      notify.error('删除失败', '供应商删除失败。');
      return;
    }
    if (providerForm.id === id) resetThirdPartyForm(true);
    notify.success('删除成功', '供应商已删除。');
    refresh();
  };

  const handleToggleProvider = (provider: ThirdPartyProvider) => {
    const nextActive = !provider.isActive;
    keyManager.updateProvider(provider.id, { isActive: nextActive });
    if (providerForm.id === provider.id) {
      setProviderForm((prev) => ({ ...prev, isActive: nextActive }));
    }
    notify.success(provider.isActive ? '已停用' : '已启用', `${provider.name} 状态已更新。`);
    refresh();
  };

  const handleValidateProvider = async (provider: ThirdPartyProvider) => {
    setDetectingProviderId(provider.id);
    try {
      const detect = await autoDetectAndConfigureModels(provider.apiKey, provider.baseUrl);

      if (detect.success) {
        keyManager.updateProvider(provider.id, {
          models: detect.models,
          status: 'active',
          lastChecked: Date.now(),
          lastError: undefined,
        } as any);
        notify.success('校验成功', `已获取 ${detect.models.length} 个模型。`);
      } else {
        keyManager.updateProvider(provider.id, {
          status: 'error',
          lastChecked: Date.now(),
          lastError: '模型获取失败，已保留原有列表。',
        } as any);
        notify.error('校验失败', '无法获取模型列表，已保留原有配置。');
      }
      refresh();
    } catch (error: any) {
      keyManager.updateProvider(provider.id, {
        status: 'error',
        lastChecked: Date.now(),
        lastError: error?.message || '连接失败',
      } as any);
      notify.error('校验失败', error?.message || '供应商连接失败。');
      refresh();
    } finally {
      setDetectingProviderId(null);
    }
  };

  const handleSyncPricing = async (provider: ThirdPartyProvider) => {
    setSyncingProviderId(provider.id);
    try {
      const result = await fetchPricingFromUrl(provider.baseUrl);
      if (!result?.pricingData?.length) {
        notify.error('同步失败', '未从价格页获取到基础价和倍率。');
        return;
      }

      const pricingSnapshot = buildProviderPricingSnapshot(result.pricingData, result.groupRatio, {
        fetchedAt: result.fetchedAt,
        note: result.pricingHint,
      });

      keyManager.updateProvider(provider.id, {
        pricingSnapshot,
        models: result.models.length ? result.models : provider.models,
      });

      injectPricingOverrides(pricingSnapshot, result.pricingData);
      notify.success('同步成功', `已更新 ${result.models.length} 个模型价格。`);

      if (providerForm.id === provider.id) {
        setAdvancedResult(result);
        if (!providerForm.group && result.availableGroups?.length) {
          setProviderForm((prev) => ({ ...prev, group: prev.group || result.availableGroups?.[0] || '' }));
        }
      }
      refresh();
    } finally {
      setSyncingProviderId(null);
    }
  };

  const renderCostEditor = (
    costMode: CostMode,
    costValue: number,
    onModeChange: (mode: CostMode) => void,
    onValueChange: (value: number) => void
  ) => (
    <div className="grid gap-3 md:grid-cols-[160px,1fr]">
      <div>
        <div className="mb-1 text-xs text-[var(--text-tertiary)]">计费模式</div>
        <select
          className="h-10 w-full rounded-xl border px-3 text-sm outline-none"
          style={formFieldStyle}
          value={costMode}
          onChange={(event) => onModeChange(event.target.value as CostMode)}
        >
          <option value="unlimited" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>无限</option>
          <option value="amount" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>金额</option>
          <option value="tokens" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>Tokens</option>
        </select>
      </div>

      <div>
        <div className="mb-1 text-xs text-[var(--text-tertiary)]">
          {costMode === 'amount' ? '金额额度' : costMode === 'tokens' ? 'Token 额度' : '额度'}
        </div>
        <input
          className="h-10 w-full rounded-xl border px-3 text-sm outline-none"
          style={formFieldStyle}
          type="number"
          min={0}
          disabled={costMode === 'unlimited'}
          value={costMode === 'unlimited' ? 0 : costValue}
          onChange={(event) => onValueChange(Number(event.target.value || 0))}
        />
      </div>
    </div>
  );

  const renderOfficialForm = () => {
    const mode = officialForm.id ? 'edit' : 'create';

    return (
      <div className="rounded-2xl border p-4" style={elevatedPanelStyle}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {mode === 'edit' ? '编辑官方接口' : '新增官方接口'}
            </div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">用于官方 API Key 的保存与额度配置。</div>
          </div>
          <button className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs" style={secondaryButtonStyle} onClick={() => resetOfficialForm(true)}>
            <XCircle size={12} />关闭
          </button>
        </div>

        <div className="grid gap-3">
          <div>
            <div className="mb-1 text-xs text-[var(--text-tertiary)]">名称</div>
            <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={officialForm.name} onChange={(event) => setOfficialForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="例如：主账号" />
          </div>

          <div>
            <div className="mb-1 text-xs text-[var(--text-tertiary)]">API Key</div>
            <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={officialForm.key} onChange={(event) => setOfficialForm((prev) => ({ ...prev, key: event.target.value }))} placeholder="输入官方 API Key" />
          </div>

          {renderCostEditor(officialForm.costMode, officialForm.costValue, (costMode) => setOfficialForm((prev) => ({ ...prev, costMode })), (costValue) => setOfficialForm((prev) => ({ ...prev, costValue })))}

          <div className="flex flex-wrap gap-2">
            <button className="inline-flex h-9 items-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm text-white" onClick={() => void handleSaveOfficial()}>
              <Save size={14} />{mode === 'edit' ? '保存修改' : '添加接口'}
            </button>
            <button className="inline-flex h-9 items-center gap-1 rounded-xl border px-4 text-sm" style={secondaryButtonStyle} onClick={() => resetOfficialForm(true)}>
              <XCircle size={14} />取消
            </button>
          </div>
        </div>
      </div>
    );
  };
  const renderProviderForm = () => {
    const mode = providerForm.id ? 'edit' : 'create';

    return (
      <div className="grid gap-3">
        <div className="rounded-2xl border px-4 py-3" style={overlayPanelStyle}>
          <div className="text-xs leading-5 text-[var(--text-tertiary)]">
            {mode === 'edit' ? '当前为编辑模式，表单会自动恢复已保存的价格配置与分组信息。' : '当前为新增模式，填写后会在右侧卡片中完整展示并保存。'}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs text-[var(--text-tertiary)]">供应商名称</div>
              <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.name} onChange={(event) => setProviderForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="例如：12AI" />
            </div>

            <div>
              <div className="mb-1 text-xs text-[var(--text-tertiary)]">供应商颜色</div>
              <div className="flex items-center gap-3">
                <input className="h-10 w-16 rounded-xl border p-1" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }} type="color" value={providerForm.providerColor} onChange={(event) => setProviderForm((prev) => ({ ...prev, providerColor: event.target.value }))} />
                <input className="h-10 flex-1 rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.providerColor} onChange={(event) => setProviderForm((prev) => ({ ...prev, providerColor: event.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-[var(--text-tertiary)]">基础地址</div>
            <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.baseUrl} onChange={(event) => setProviderForm((prev) => ({ ...prev, baseUrl: event.target.value }))} placeholder="https://example.com/v1" />
          </div>

          <div>
            <div className="mb-1 text-xs text-[var(--text-tertiary)]">API Key</div>
            <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.apiKey} onChange={(event) => setProviderForm((prev) => ({ ...prev, apiKey: event.target.value }))} placeholder="输入第三方供应商 API Key" />
          </div>

          <div>
            <div className="mb-1 text-xs text-[var(--text-tertiary)]">供应商分组</div>
            <div className="grid gap-2 md:grid-cols-[200px,1fr]">
              <select
                className="h-10 w-full rounded-xl border px-3 text-sm outline-none"
                style={formFieldStyle}
                value={advancedResult?.availableGroups?.includes(providerForm.group) ? providerForm.group : ''}
                onChange={(event) => setProviderForm((prev) => ({ ...prev, group: event.target.value }))}
              >
                <option value="" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>手动输入 / 未选择</option>
                {(advancedResult?.availableGroups || []).map((group) => (
                  <option key={group} value={group} style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                    {group}
                  </option>
                ))}
              </select>
              <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.group} onChange={(event) => setProviderForm((prev) => ({ ...prev, group: event.target.value }))} placeholder="例如：default / Standard / Mini / t1" />
            </div>
            {advancedResult?.availableGroups?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {advancedResult.availableGroups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={`rounded-full border px-2 py-1 text-[11px] ${providerForm.group === group ? 'border-indigo-500 text-indigo-500' : 'border-[var(--border-light)] text-[var(--text-secondary)]'}`}
                    onClick={() => setProviderForm((prev) => ({ ...prev, group }))}
                  >
                    {group}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {renderCostEditor(providerForm.costMode, providerForm.costValue, (costMode) => setProviderForm((prev) => ({ ...prev, costMode })), (costValue) => setProviderForm((prev) => ({ ...prev, costValue })))}

          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={providerForm.isActive} onChange={(event) => setProviderForm((prev) => ({ ...prev, isActive: event.target.checked }))} />启用该供应商
          </label>

          <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
            <button className="flex w-full items-center justify-between text-left" onClick={() => setShowAdvancedMode((prev) => !prev)}>
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">高级模式：价格扫描</div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">扫描模型广场价格页，保存基础价、模型倍率、分组倍率、尺寸倍率、completion 倍率。</div>
              </div>
              {showAdvancedMode ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showAdvancedMode && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm" style={secondaryButtonStyle} onClick={() => void handleDetectAdvanced()} disabled={advancedLoading}>
                    <Search size={14} />{advancedLoading ? '扫描中...' : '扫描价格'}
                  </button>
                  {advancedResult?.fetchedAt ? <span className="text-xs text-[var(--text-tertiary)]">最近扫描：{formatDate(advancedResult.fetchedAt)}</span> : null}
                </div>

                {advancedResult && (
                  <div className="space-y-4 rounded-2xl border p-4" style={overlayPanelStyle}>
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="rounded-xl border p-3" style={elevatedPanelStyle}><div className="text-[11px] text-[var(--text-tertiary)]">扫描来源</div><div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{advancedResult.apiType}</div></div>
                      <div className="rounded-xl border p-3" style={elevatedPanelStyle}><div className="text-[11px] text-[var(--text-tertiary)]">模型数量</div><div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{advancedResult.models.length}</div></div>
                      <div className="rounded-xl border p-3" style={elevatedPanelStyle}><div className="text-[11px] text-[var(--text-tertiary)]">说明</div><div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{advancedResult.pricingHint}</div></div>
                    </div>

                    {advancedResult.groupRatio && Object.keys(advancedResult.groupRatio).length > 0 && (
                      <div className="rounded-xl border p-3" style={elevatedPanelStyle}>
                        <div className="text-xs font-medium text-[var(--text-primary)]">分组倍率</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(advancedResult.groupRatio).map(([group, ratio]) => (
                            <span key={group} className="rounded-full border border-[var(--border-light)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">{group}: ×{ratio}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {advancedResult.availableGroups && advancedResult.availableGroups.length > 0 && (
                      <div className="rounded-xl border p-3" style={elevatedPanelStyle}>
                        <div className="text-xs font-medium text-[var(--text-primary)]">扫描到的可用分组</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {advancedResult.availableGroups.map((group) => (
                            <button
                              key={group}
                              type="button"
                              className={`rounded-full border px-2 py-1 text-[11px] ${providerForm.group === group ? 'border-indigo-500 text-indigo-500' : 'border-[var(--border-light)] text-[var(--text-secondary)]'}`}
                              onClick={() => setProviderForm((prev) => ({ ...prev, group }))}
                            >
                              {group}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border p-3" style={elevatedPanelStyle}>
                      <div className="text-xs font-medium text-[var(--text-primary)]">模型列表</div>
                      <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                        {advancedResult.models.length === 0 ? (
                          <span className="text-xs text-[var(--text-tertiary)]">暂无扫描结果</span>
                        ) : (
                          advancedResult.models.map((model) => (
                            <span key={model} className="rounded-full border border-[var(--border-light)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">{model}</span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-medium text-[var(--text-primary)]">价格明细</div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-[11px] text-[var(--text-tertiary)]">支持搜索模型 ID、quota 类型和倍率内容。</div>
                        <div className="relative w-full sm:w-72">
                          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                          <input
                            value={pricingSearch}
                            onChange={(event) => setPricingSearch(event.target.value)}
                            placeholder="搜索模型 ID / 倍率..."
                            className="h-9 w-full rounded-xl border pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none transition focus:border-indigo-500"
                            style={formFieldStyle}
                          />
                        </div>
                      </div>
                      {filteredAdvancedPricingRows.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--border-light)] p-4 text-xs text-[var(--text-tertiary)]">当前没有可展示的基础价和倍率明细。</div>
                      ) : (
                        <div className="space-y-2">
                          {filteredAdvancedPricingRows.map((row) => (
                            <div key={row.model} className="rounded-xl border p-3" style={elevatedPanelStyle}>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-[var(--text-primary)]">{row.model}</div>
                                  <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">quota_type: {row.quotaType ?? '-'}</div>
                                  <div className="mt-1 flex flex-wrap gap-1.5">
                                    {row.providerLabel || row.provider ? <span className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{row.providerLabel || row.provider}</span> : null}
                                    {row.tokenGroup ? <span className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{row.tokenGroup}</span> : null}
                                    {row.billingType ? <span className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{row.billingType}</span> : null}
                                    {row.endpointType ? <span className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{row.endpointType}</span> : null}
                                    {row.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]">#{tag}</span>)}
                                  </div>
                                </div>
                                <span className="rounded-full px-2 py-1 text-[11px] font-medium" style={{ backgroundColor: `${providerForm.providerColor}22`, color: providerForm.providerColor }}>供应商颜色</span>
                              </div>

                              <div className="mt-2 grid gap-2 sm:grid-cols-4">
                                <div className="rounded-lg border p-2" style={overlayPanelStyle}><div className="text-[10px] text-[var(--text-tertiary)]">基础价</div><div className="mt-1 text-xs font-medium text-[var(--text-primary)]">{formatPriceValue(row.basePrice)}</div></div>
                                <div className="rounded-lg border p-2" style={overlayPanelStyle}><div className="text-[10px] text-[var(--text-tertiary)]">模型倍率</div><div className="mt-1 text-xs font-medium text-[var(--text-primary)]">{formatMultiplier(row.modelRatio)}</div></div>
                                <div className="rounded-lg border p-2" style={overlayPanelStyle}><div className="text-[10px] text-[var(--text-tertiary)]">Completion</div><div className="mt-1 text-xs font-medium text-[var(--text-primary)]">{formatMultiplier(row.completionRatio)}</div></div>
                                <div className="rounded-lg border p-2" style={overlayPanelStyle}><div className="text-[10px] text-[var(--text-tertiary)]">默认分组</div><div className="mt-1 text-xs font-medium text-[var(--text-primary)]">×{getDefaultGroupRatio(advancedResult.groupRatio)}</div></div>
                              </div>

                              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                                <div className="rounded-lg border border-[var(--border-light)]/80 p-2">
                                  <div className="text-[10px] text-[var(--text-tertiary)]">尺寸倍率</div>
                                  <div className="mt-1 flex flex-wrap gap-1.5">{row.sizeRatios.length ? row.sizeRatios.map((item) => <span key={item} className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{item}</span>) : <span className="text-[10px] text-[var(--text-tertiary)]">无</span>}</div>
                                </div>

                                <div className="rounded-lg border border-[var(--border-light)]/80 p-2">
                                  <div className="text-[10px] text-[var(--text-tertiary)]">分组模型倍率</div>
                                  <div className="mt-1 flex flex-wrap gap-1.5">{row.groupModelRatios.length ? row.groupModelRatios.map((item) => <span key={item} className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{item}</span>) : <span className="text-[10px] text-[var(--text-tertiary)]">无</span>}</div>
                                </div>

                                <div className="rounded-lg border border-[var(--border-light)]/80 p-2">
                                  <div className="text-[10px] text-[var(--text-tertiary)]">分组尺寸倍率</div>
                                  <div className="mt-1 flex flex-wrap gap-1.5">{row.groupSizeRatios.length ? row.groupSizeRatios.map((item) => <span key={item} className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{item}</span>) : <span className="text-[10px] text-[var(--text-tertiary)]">无</span>}</div>
                                </div>

                                <div className="rounded-lg border border-[var(--border-light)]/80 p-2">
                                  <div className="text-[10px] text-[var(--text-tertiary)]">分组价格覆盖</div>
                                  <div className="mt-1 flex flex-wrap gap-1.5">{row.groupModelPrices.length ? row.groupModelPrices.map((item) => <span key={item} className="rounded-full border border-[var(--border-light)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{item}</span>) : <span className="text-[10px] text-[var(--text-tertiary)]">无</span>}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
    );
  };
  return (
    <div className="space-y-4 pb-8">
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
      >
        <h3 className="text-xl font-semibold text-[var(--text-primary)]">接口管理</h3>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">管理官方接口与第三方供应商，第三方支持价格扫描快照保存、恢复与计费同步。</p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border p-3 md:grid-cols-5" style={overlayPanelStyle}>
        <div className="rounded-xl border p-3" style={elevatedPanelStyle}><div className="text-[11px] text-[var(--text-tertiary)]">第三方供应商</div><div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.providerCount}</div></div>
        <div className="rounded-xl border p-3" style={elevatedPanelStyle}><div className="text-[11px] text-[var(--text-tertiary)]">官方接口</div><div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.officialCount}</div></div>
        <div className="rounded-xl border p-3" style={elevatedPanelStyle}><div className="text-[11px] text-[var(--text-tertiary)]">已启用供应商</div><div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.activeProviderCount}</div></div>
        <div className="rounded-xl border p-3" style={elevatedPanelStyle}><div className="text-[11px] text-[var(--text-tertiary)]">模型总数</div><div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{summary.modelCount}</div></div>
        <div className="rounded-xl border p-3" style={elevatedPanelStyle}><div className="text-[11px] text-[var(--text-tertiary)]">累计费用</div><div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">${summary.totalCost.toFixed(4)}</div><div className="mt-1 text-[10px] text-[var(--text-tertiary)]">Tokens：{summary.totalTokens.toLocaleString('zh-CN')}</div></div>
      </div>

      <div className="flex gap-2 rounded-2xl border p-1" style={overlayPanelStyle}>
        <button className={`flex h-10 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm ${tab === 'thirdparty' ? 'bg-indigo-600 text-white' : ''}`} style={tab === 'thirdparty' ? undefined : { color: 'var(--text-primary)', backgroundColor: 'var(--bg-elevated)' }} onClick={() => setTab('thirdparty')}>第三方供应商</button>
        <button className={`flex h-10 flex-1 items-center justify-center rounded-xl px-3 py-2 text-sm ${tab === 'official' ? 'bg-indigo-600 text-white' : ''}`} style={tab === 'official' ? undefined : { color: 'var(--text-primary)', backgroundColor: 'var(--bg-elevated)' }} onClick={() => setTab('official')}>官方接口</button>
      </div>

      {tab === 'thirdparty' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[var(--text-tertiary)]">
              {showProviderCreateForm ? '左侧只负责选择供应商，右侧固定显示当前正在编辑的 API 卡片。' : '当前默认显示第三方供应商，点击左侧供应商即可在右侧完整编辑。'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex h-9 items-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm text-white" onClick={() => { setShowProviderCreateForm(true); resetThirdPartyForm(false); }}><Plus size={14} />新增供应商</button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
            <aside className="min-w-0 self-start">
              <div className="overflow-hidden rounded-[24px] border" style={elevatedPanelStyle}>
                <div className="border-b px-4 py-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">供应商选择</div>
                      <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">左侧只保留选择列表，点哪一个，右侧就编辑哪一个 API。</div>
                    </div>
                    <span className="rounded-full border px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                      {providers.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 p-3 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
                  {providers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-6 text-left text-sm text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)' }}>
                      暂无第三方供应商配置，点击右上角“新增供应商”开始添加。
                    </div>
                  ) : (
                    providers.map((provider) => {
                      const isSelected = showProviderCreateForm && providerForm.id === provider.id;
                      const providerColor = provider.providerColor || provider.badgeColor || '#3B82F6';

                      return (
                        <button
                          key={provider.id}
                          type="button"
                          className="w-full overflow-hidden rounded-2xl border p-3 text-left transition-colors"
                          style={isSelected
                            ? {
                                borderColor: 'rgba(99,102,241,0.55)',
                                backgroundColor: 'rgba(99,102,241,0.08)',
                                boxShadow: '0 0 0 1px rgba(99,102,241,0.16)',
                              }
                            : {
                                borderColor: 'var(--border-light)',
                                backgroundColor: 'var(--bg-surface)',
                              }}
                          onClick={() => loadProviderToForm(provider)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: providerColor }} />
                                <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{provider.name}</span>
                              </div>
                              <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[var(--text-tertiary)]">{provider.baseUrl}</div>
                            </div>
                            <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium ${provider.isActive ? 'bg-emerald-500/15 text-emerald-500' : 'bg-gray-500/15 text-gray-400'}`}>
                              {provider.isActive ? '启用中' : '已停用'}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                            <span className="whitespace-nowrap">模型数 {provider.models?.length || 0}</span>
                            {provider.group ? <span className="whitespace-nowrap">分组 {provider.group}</span> : null}
                            <span className="whitespace-nowrap">上次扫描 {formatDate(provider.pricingSnapshot?.fetchedAt)}</span>
                            {isSelected ? <span className="whitespace-nowrap rounded-full bg-indigo-500/15 px-2 py-1 font-medium text-indigo-500">正在编辑</span> : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>

            <aside className="min-w-0 self-start">
              <div ref={providerEditorRef} className="overflow-hidden rounded-[24px] border scroll-mt-6" style={elevatedPanelStyle}>
                {showProviderCreateForm ? (
                  <>
                    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-[var(--text-primary)]">
                              {providerForm.id ? `正在编辑：${editingProviderName}` : '新增供应商'}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                              {providerForm.id
                                ? editingProviderBaseUrl || '请完善供应商基础地址，保存后会作为当前供应商的识别地址。'
                                : '填写名称、基础地址和 API Key 后即可保存为新的第三方供应商。'}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm text-white hover:bg-indigo-500" onClick={() => void handleSaveProvider()}>
                              <Save size={14} />{providerForm.id ? '保存供应商' : '添加供应商'}
                            </button>
                            <button className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border px-4 text-sm" style={secondaryButtonStyle} onClick={() => resetThirdPartyForm(true)}>
                              <XCircle size={14} />关闭
                            </button>
                          </div>
                        </div>

                        {currentEditingProvider ? (
                          <div className="flex flex-wrap gap-2">
                            <button className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs" style={secondaryButtonStyle} onClick={() => void handleValidateProvider(currentEditingProvider)} disabled={detectingProviderId === currentEditingProvider.id}>
                              <CheckCircle2 size={12} />{detectingProviderId === currentEditingProvider.id ? '校验中...' : '校验模型'}
                            </button>
                            <button className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs" style={secondaryButtonStyle} onClick={() => void handleSyncPricing(currentEditingProvider)} disabled={syncingProviderId === currentEditingProvider.id}>
                              <RefreshCw size={12} className={syncingProviderId === currentEditingProvider.id ? 'animate-spin' : ''} />{syncingProviderId === currentEditingProvider.id ? '同步中...' : '同步价格'}
                            </button>
                            <button className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs" style={secondaryButtonStyle} onClick={() => handleToggleProvider(currentEditingProvider)}>
                              {currentEditingProvider.isActive ? <Pause size={12} /> : <Play size={12} />}{currentEditingProvider.isActive ? '停用' : '启用'}
                            </button>
                            <button className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 text-xs text-red-500" onClick={() => handleDeleteProvider(currentEditingProvider.id)}>
                              <Trash2 size={12} />删除
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div ref={providerEditorBodyRef} className="max-h-[calc(100vh-220px)] overflow-y-auto p-5">
                      {renderProviderForm()}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 p-8 text-center">
                    <div className="rounded-2xl border px-5 py-4" style={overlayPanelStyle}>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">先从左侧选择要编辑的供应商</div>
                      <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">当前默认打开第三方供应商页。选中左侧条目后，右侧会完整显示该 API 的编辑卡片，不再遮挡。</div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button className="inline-flex h-9 items-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm text-white" onClick={() => { setShowProviderCreateForm(true); resetThirdPartyForm(false); }}>
                        <Plus size={14} />新增供应商
                      </button>
                      {providers.length > 0 ? (
                        <button className="inline-flex h-9 items-center gap-1 rounded-xl border px-4 text-sm" style={secondaryButtonStyle} onClick={() => loadProviderToForm(providers[0])}>
                          <Edit3 size={14} />编辑第一个供应商
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="inline-flex h-9 items-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm text-white" onClick={() => { setShowOfficialCreateForm(true); setOfficialForm(defaultOfficialForm); }}><Plus size={14} />新增官方接口</button>
          </div>

          {showOfficialCreateForm && renderOfficialForm()}

          <div className="grid gap-3">
            {officialKeys.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-sm text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)' }}>暂无官方接口配置。</div>
            ) : (
              officialKeys.map((slot) => (
                <div key={slot.id} className="rounded-2xl border p-4" style={elevatedPanelStyle}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{slot.name}</div>
                      <div className="mt-1 text-xs text-[var(--text-tertiary)]">{slot.provider} · {costModeText[slot.tokenLimit && slot.tokenLimit > 0 ? 'tokens' : slot.budgetLimit && slot.budgetLimit > 0 ? 'amount' : 'unlimited']}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs" style={secondaryButtonStyle} onClick={() => loadOfficialToForm(slot)}><Edit3 size={12} />编辑</button>
                      <button className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--border-light)] px-3 text-xs text-red-500" onClick={() => handleDeleteOfficial(slot.id)}><Trash2 size={12} />删除</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiSettingsView;
