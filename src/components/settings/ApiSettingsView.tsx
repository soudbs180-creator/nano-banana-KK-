
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
  Shuffle,
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
import { formatAuthorizationHeaderValue, type ApiProtocolFormat } from '../../services/api/apiConfig';
import { resolveProviderRuntime } from '../../services/api/providerStrategy';
import { fetchRawPricingCatalog, fetchWuyinPricingCatalog } from '../../services/billing/newApiPricingService';
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
  format: ApiProtocolFormat;
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
  billingUnit?: string;
  displayPrice?: string;
  sizeRatioMap: Record<string, number>;
  groupModelRatioMap: Record<string, number>;
  groupSizeRatioMap: Record<string, Record<string, number>>;
  groupPriceMap: Record<string, GroupPriceValue>;
};

type SelectOption = {
  value: string;
  label: string;
};

type StatusTone = 'green' | 'amber' | 'red' | 'slate' | 'indigo' | 'sky';

type StatusMeta = {
  label: string;
  tone: StatusTone;
  helper: string;
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
  format: 'auto',
  group: '',
  costMode: 'unlimited',
  costValue: 0,
  providerColor: '#3B82F6',
  isActive: true,
};

const LEGACY_API_SETTINGS_MIGRATION_KEY = 'kk_api_settings_legacy_migration_v1';

const normalizeProviderSignaturePart = (value: string): string =>
  value.trim().replace(/\/+$/, '').toLowerCase();

const buildProviderSignature = (baseUrl: string, apiKey: string): string =>
  `${normalizeProviderSignaturePart(baseUrl)}|${apiKey.trim()}`;

const providerColorPalette = [
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#EC4899',
  '#F43F5E',
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EAB308',
  '#22C55E',
  '#10B981',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
];

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

const statusToneStyles: Record<StatusTone, { borderColor: string; backgroundColor: string; color: string }> = {
  green: {
    borderColor: 'rgba(16, 185, 129, 0.28)',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    color: '#10B981',
  },
  amber: {
    borderColor: 'rgba(245, 158, 11, 0.28)',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    color: '#F59E0B',
  },
  red: {
    borderColor: 'rgba(239, 68, 68, 0.28)',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    color: '#EF4444',
  },
  slate: {
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    color: '#94A3B8',
  },
  indigo: {
    borderColor: 'rgba(99, 102, 241, 0.28)',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    color: '#6366F1',
  },
  sky: {
    borderColor: 'rgba(14, 165, 233, 0.28)',
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    color: '#0EA5E9',
  },
};

const normalizeProviderColor = (value?: string) => String(value || '').trim().toUpperCase();

const pickRandomProviderColor = (usedColors: string[] = [], currentColor?: string) => {
  const normalizedUsed = usedColors.map((color) => normalizeProviderColor(color));
  const normalizedCurrent = normalizeProviderColor(currentColor);
  const preferred = providerColorPalette.filter((color) => !normalizedUsed.includes(normalizeProviderColor(color)));
  const fallback = providerColorPalette.filter((color) => normalizeProviderColor(color) !== normalizedCurrent);
  const candidates = preferred.length > 0 ? preferred : (fallback.length > 0 ? fallback : providerColorPalette);
  return candidates[Math.floor(Math.random() * candidates.length)] || providerColorPalette[0];
};

const collectProviderColors = (providers: ThirdPartyProvider[], excludeProviderId?: string) =>
  providers
    .filter((provider) => provider.id !== excludeProviderId)
    .map((provider) => provider.providerColor || provider.badgeColor || '')
    .filter(Boolean);

const FormSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}> = ({ value, onChange, options, disabled = false }) => (
  <div className="relative">
    <select
      className="h-10 w-full appearance-none rounded-xl border bg-transparent pl-3 pr-10 text-sm outline-none"
      style={formFieldStyle}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
          {option.label}
        </option>
      ))}
    </select>
    <span className="pointer-events-none absolute right-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-[var(--text-tertiary)]">
      <ChevronDown size={16} />
    </span>
  </div>
);

const StatusBadge: React.FC<{
  label: string;
  tone: StatusTone;
  helper?: string;
  compact?: boolean;
}> = ({ label, tone, helper, compact = false }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border font-medium ${compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
    style={statusToneStyles[tone]}
  >
    <span>{label}</span>
    {helper ? <span className={`${compact ? 'hidden' : 'inline'} opacity-75`}>· {helper}</span> : null}
  </span>
);

const toProviderForm = (provider?: ThirdPartyProvider): ProviderForm => {
  if (!provider) return defaultProviderForm;

  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    format: provider.format || 'auto',
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

// Helper to format budget info for provider cards
const formatBudgetInfo = (provider: ThirdPartyProvider) => {
  const mode = provider.customCostMode || 'unlimited';
  
  if (mode === 'unlimited') {
    return {
      total: '∞',
      used: provider.usage?.totalCost ? `¥${provider.usage.totalCost.toFixed(2)}` : '¥0.00',
      remaining: '∞',
      unit: '',
    };
  }
  
  if (mode === 'amount') {
    const total = provider.budgetLimit || provider.customCostValue || 0;
    const used = provider.usage?.totalCost || 0;
    const remaining = Math.max(0, total - used);
    return {
      total: `¥${total.toFixed(2)}`,
      used: `¥${used.toFixed(2)}`,
      remaining: remaining > 0 ? `¥${remaining.toFixed(2)}` : '¥0.00',
      unit: '元',
    };
  }
  
  // mode === 'tokens'
  const total = provider.tokenLimit || provider.customCostValue || 0;
  const used = provider.usage?.totalTokens || 0;
  const remaining = Math.max(0, total - used);
  return {
    total: total.toLocaleString(),
    used: used.toLocaleString(),
    remaining: remaining > 0 ? remaining.toLocaleString() : '0',
    unit: 'tokens',
  };
};

const providerHasPricingSnapshot = (provider?: Pick<ThirdPartyProvider, 'pricingSnapshot'> | null) =>
  Boolean(provider?.pricingSnapshot?.rows?.length);

const getProviderStatusMeta = (
  provider?: ThirdPartyProvider | null,
  options: { hasPricingSnapshot?: boolean } = {}
): StatusMeta => {
  const hasPricingSnapshot = options.hasPricingSnapshot ?? providerHasPricingSnapshot(provider);

  if (!provider) {
    return hasPricingSnapshot
      ? { label: '待保存', tone: 'indigo', helper: '价格快照已准备好' }
      : { label: '草稿中', tone: 'indigo', helper: '保存后进入供应商队列' };
  }

  if (!provider.isActive) {
    return { label: '已停用', tone: 'slate', helper: '当前不会参与调度' };
  }

  if (provider.status === 'error' || provider.lastError) {
    return { label: '异常', tone: 'red', helper: provider.lastError ? '最近一次校验失败' : '需要重新检查连接' };
  }

  if (provider.status === 'checking') {
    return { label: '校验中', tone: 'sky', helper: '正在同步模型状态' };
  }

  if (!hasPricingSnapshot) {
    return { label: '待同步', tone: 'amber', helper: '建议拉取价格快照' };
  }

  return { label: '已就绪', tone: 'green', helper: '连接、模型与价格已齐备' };
};

interface ApiSettingsViewProps {
  initialSupplier?: LegacySupplier | null;
}

const toFiniteNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatMultiplier = (value: unknown, currency = '', suffix = '') => {
  const num = toFiniteNumber(value);
  if (num === undefined) return null;
  if (currency === 'CNY') {
    return `¥${num.toFixed(num >= 1 ? 2 : 3)}${suffix}`;
  }
  return `$${num.toFixed(4)}${suffix}`;
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

const formatPricingAmount = (value: unknown, suffix = '', currency = 'USD') => {
  const num = toFiniteNumber(value);
  return num === undefined ? null : `¥${num.toFixed(4)}${suffix}`;
};

const formatMoneyDisplay = (value: unknown, suffix = '', currency = 'USD') => {
  const num = toFiniteNumber(value);
  if (num === undefined) return null;
  if (currency === 'CNY') {
    return `¥${num.toFixed(num >= 1 ? 2 : 3)}${suffix}`;
  }
  return `$${num.toFixed(4)}${suffix}`;
};

const formatRatioDisplay = (value: unknown) => {
  const num = toFiniteNumber(value);
  return num === undefined ? '-' : `×${num}`;
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

const isNoGroupProvider = (baseUrl?: string) => resolveProviderRuntime({ baseUrl, format: 'openai' }).strategyId === 'wuyinkeji';

const extractAvailableGroups = (pricingData?: any[], groupRatio?: Record<string, number>, baseUrl?: string) => {
  if (isNoGroupProvider(baseUrl)) return [];
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
  const appliedInitialSupplierRef = useRef<string | null>(null);

  const [detectingProviderId, setDetectingProviderId] = useState<string | null>(null);
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null);
  const [highlightedProviderId, setHighlightedProviderId] = useState<string | null>(null);
  const providerListRef = useRef<HTMLDivElement | null>(null);

  const dedupeProvidersIfNeeded = () => {
    const seen = new Set<string>();
    const duplicateIds: string[] = [];

    keyManager.getProviders().forEach((provider) => {
      if (!provider.baseUrl || !provider.apiKey) return;

      const signature = buildProviderSignature(provider.baseUrl, provider.apiKey);
      if (seen.has(signature)) {
        duplicateIds.push(provider.id);
        return;
      }

      seen.add(signature);
    });

    duplicateIds.forEach((id) => keyManager.removeProvider(id));

    if (duplicateIds.length > 0) {
      notify.success('已清理重复配置', `已移除 ${duplicateIds.length} 条旧版重复供应商。`);
    }
  };

  const migrateLegacyDataIfNeeded = () => {
    const legacySuppliers = supplierService.getAll();

    try {
      if (localStorage.getItem(LEGACY_API_SETTINGS_MIGRATION_KEY) === 'done') {
        if (legacySuppliers.length > 0) {
          supplierService.clearLegacyStorage();
        }
        return;
      }
    } catch (error) {
      console.warn('[ApiSettingsView] Failed to read migration flag:', error);
    }

    const existingProviders = keyManager.getProviders();
    const existingSignature = new Set(
      existingProviders.map((item) => buildProviderSignature(item.baseUrl, item.apiKey))
    );
    let migratedCount = 0;

    legacySuppliers.forEach((supplier) => {
      if (!supplier.name || !supplier.baseUrl || !supplier.apiKey) return;
      const signature = buildProviderSignature(supplier.baseUrl, supplier.apiKey);
      if (existingSignature.has(signature)) return;

      keyManager.addProvider({
        name: supplier.name,
        baseUrl: supplier.baseUrl,
        apiKey: supplier.apiKey,
        group: (supplier as any).group || undefined,
        models: (supplier.models || []).map((model) => model.id).filter(Boolean),
        format: supplier.format || 'auto',
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

      const signature = buildProviderSignature(baseUrl, slot.key);
      if (existingSignature.has(signature)) return;

      keyManager.addProvider({
        name,
        baseUrl,
        apiKey: slot.key,
        group: slot.group || undefined,
        models: slot.supportedModels || [],
        format: slot.format || 'auto',
        isActive: !slot.disabled,
        providerColor: '#3B82F6',
        badgeColor: '#3B82F6',
      } as any);

      existingSignature.add(signature);
      migratedCount += 1;
    });

    try {
      localStorage.setItem(LEGACY_API_SETTINGS_MIGRATION_KEY, 'done');
    } catch (error) {
      console.warn('[ApiSettingsView] Failed to persist migration flag:', error);
    }

    if (legacySuppliers.length > 0) {
      supplierService.clearLegacyStorage();
    }

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
    dedupeProvidersIfNeeded();
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
  const providerWorkspaceSummary = useMemo(() => {
    const syncedCount = providers.filter((item) => providerHasPricingSnapshot(item)).length;
    const errorCount = providers.filter((item) => item.status === 'error' || Boolean(item.lastError)).length;
    const limitedCount = providers.filter((item) => (item.customCostMode || 'unlimited') !== 'unlimited').length;
    const pendingSyncCount = providers.filter((item) => item.isActive && !providerHasPricingSnapshot(item)).length;

    return {
      syncedCount,
      errorCount,
      limitedCount,
      pendingSyncCount,
    };
  }, [providers]);
  const currentEditingProvider = useMemo(
    () => providers.find((item) => item.id === providerForm.id),
    [providers, providerForm.id]
  );
  const currentProviderSnapshotCount =
    advancedResult?.pricingData?.length || currentEditingProvider?.pricingSnapshot?.rows?.length || 0;
  const currentProviderModelCount =
    currentEditingProvider?.models?.length || advancedResult?.models?.length || 0;
  const currentProviderSupportsGroups = !isNoGroupProvider(providerForm.baseUrl);
  const currentProviderGroupCount =
    currentProviderSupportsGroups ? (advancedResult?.availableGroups?.length || (providerForm.group.trim() ? 1 : 0)) : 0;
  const currentProviderLastSync = advancedResult?.fetchedAt || currentEditingProvider?.pricingSnapshot?.fetchedAt;
  const currentProviderStatus = useMemo(
    () => getProviderStatusMeta(currentEditingProvider, { hasPricingSnapshot: currentProviderSnapshotCount > 0 }),
    [currentEditingProvider, currentProviderSnapshotCount]
  );
  const hasProviderConnection = Boolean(
    providerForm.name.trim() && providerForm.baseUrl.trim() && providerForm.apiKey.trim()
  );
  const providerWorkflowSteps = useMemo(
    () => [
      {
        key: 'connection',
        label: '连接信息',
        description: hasProviderConnection ? '名称、地址与 API Key 已填写' : '补齐名称、基础地址与 API Key',
        complete: hasProviderConnection,
      },
      {
        key: 'saved',
        label: '保存配置',
        description: providerForm.id ? '当前供应商已进入调度队列' : '保存后才会出现在正式供应商列表',
        complete: Boolean(providerForm.id),
      },
      {
        key: 'models',
        label: '模型校验',
        description: currentEditingProvider?.lastChecked
          ? `最近校验 ${formatDate(currentEditingProvider.lastChecked)}`
          : currentProviderModelCount > 0
            ? `当前已记录 ${currentProviderModelCount} 个模型`
            : '保存后可执行模型校验',
        complete: Boolean(currentEditingProvider?.lastChecked || currentProviderModelCount > 0),
      },
      {
        key: 'pricing',
        label: '价格同步',
        description:
          currentProviderSnapshotCount > 0
            ? `已准备 ${currentProviderSnapshotCount} 条价格记录`
            : '建议同步价格快照与分组倍率',
        complete: currentProviderSnapshotCount > 0,
      },
    ],
    [
      currentEditingProvider?.lastChecked,
      currentProviderModelCount,
      currentProviderSnapshotCount,
      hasProviderConnection,
      providerForm.id,
    ]
  );
  const currentProviderBudgetPreview = useMemo(() => {
    if (currentEditingProvider) {
      return formatBudgetInfo(currentEditingProvider);
    }

    if (providerForm.costMode === 'unlimited') {
      return {
        total: '∞',
        used: providerForm.id ? '¥0.00' : '未开始',
        remaining: '∞',
        unit: '',
      };
    }

    if (providerForm.costMode === 'amount') {
      const value = Math.max(0, providerForm.costValue || 0);
      return {
        total: `¥${value.toFixed(2)}`,
        used: '¥0.00',
        remaining: `¥${value.toFixed(2)}`,
        unit: '元',
      };
    }

    const value = Math.max(0, providerForm.costValue || 0);
    return {
      total: value.toLocaleString('zh-CN'),
      used: '0',
      remaining: value.toLocaleString('zh-CN'),
      unit: 'tokens',
    };
  }, [currentEditingProvider, providerForm.costMode, providerForm.costValue, providerForm.id]);
  const applyRandomProviderColor = (excludeProviderId?: string) => {
    setProviderForm((prev) => ({
      ...prev,
      providerColor: pickRandomProviderColor(collectProviderColors(providers, excludeProviderId), prev.providerColor),
    }));
  };
  const editingProviderName = providerForm.name.trim() || currentEditingProvider?.name || '未命名供应商';
  const editingProviderBaseUrl = providerForm.baseUrl.trim() || currentEditingProvider?.baseUrl || '';
  // 🚀 [Fix] 改进搜索逻辑：优先搜索名字，然后是地址
  const searchResult = useMemo(() => {
    const keyword = providerSearch.trim().toLowerCase();
    if (!keyword) return { providers, highlightId: null as string | null };

    // 首先按名字搜索
    const nameMatches = providers.filter((provider) => 
      provider.name?.toLowerCase().includes(keyword)
    );
    
    // 然后按地址搜索（排除已匹配的）
    const nameMatchIds = new Set(nameMatches.map(p => p.id));
    const urlMatches = providers.filter((provider) => 
      !nameMatchIds.has(provider.id) && 
      provider.baseUrl?.toLowerCase().includes(keyword)
    );
    
    // 合并结果：名字匹配优先
    const result = [...nameMatches, ...urlMatches];
    
    // 第一个匹配项作为高亮目标
    const highlightId = result.length > 0 ? result[0].id : null;
    
    return { providers: result, highlightId };
  }, [providerSearch, providers]);
  
  const filteredProviders = searchResult.providers;

  // 🚀 [Fix] 搜索后自动滚动并高亮
  useEffect(() => {
    if (searchResult.highlightId && providerSearch.trim()) {
      setHighlightedProviderId(searchResult.highlightId);
      
      // 延迟滚动，等待渲染完成
      setTimeout(() => {
        const element = document.querySelector(`[data-provider-id="${searchResult.highlightId}"]`);
        if (element && providerListRef.current) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      
      // 3秒后取消高亮
      const timer = setTimeout(() => {
        setHighlightedProviderId(null);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [searchResult.highlightId, providerSearch]);
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
          billingUnit: typeof item.pay_unit === 'string' ? item.pay_unit.trim() : undefined,
          displayPrice: typeof item.display_price === 'string' ? item.display_price.trim() : undefined,
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
  const defaultScannedGroupRatio = getDefaultGroupRatio(advancedResult?.groupRatio);
  const renderPricingDetailBadges = (row: AdvancedPricingRow) => {
    const billingLabel = resolveBillingLabel(row.billingType, row.quotaType, row.perRequestPrice);
    const detailBadges: Array<{ label: string; value: string; accent?: boolean }> = [];

    if (billingLabel === '按量') {
      const directPriceBadges = [
        row.inputPrice ? { label: '输入', value: formatMoneyDisplay(row.inputPrice, '/1M Tokens', row.currency) } : null,
        row.outputPrice ? { label: '补全', value: formatMoneyDisplay(row.outputPrice, '/1M Tokens', row.currency) } : null,
        row.cacheReadPrice ? { label: '缓存读取', value: formatMoneyDisplay(row.cacheReadPrice, '/1M Tokens', row.currency) } : null,
        row.cacheCreationPrice ? { label: '缓存创建', value: formatMoneyDisplay(row.cacheCreationPrice, '/1M Tokens', row.currency) } : null,
      ].filter(Boolean) as Array<{ label: string; value: string | null }>;

      if (directPriceBadges.length > 0) {
        return directPriceBadges
          .filter((item): item is { label: string; value: string } => Boolean(item.value))
          .map((item, index) => ({
            label: item.label,
            value: item.value,
            accent: index === 0,
          }));
      }

      const activeGroup = row.tokenGroup || providerForm.group || 'default';
      const fallbackGroupRatio =
        row.groupRatio ??
        advancedResult?.groupRatio?.[activeGroup] ??
        advancedResult?.groupRatio?.default ??
        defaultScannedGroupRatio;
      const groupOverride = activeGroup ? row.groupPriceMap[activeGroup] : undefined;
      const effectiveModelRatio = groupOverride?.modelRatio ?? row.modelRatio;
      const effectiveCompletionRatio = groupOverride?.completionRatio ?? row.completionRatio;

      if (fallbackGroupRatio !== undefined) {
        detailBadges.push({
          label: '分组倍率',
          value: `${activeGroup} ${formatRatioDisplay(fallbackGroupRatio)}`,
          accent: true,
        });
      }
      if (effectiveModelRatio !== undefined) {
        detailBadges.push({ label: '模型倍率', value: formatRatioDisplay(effectiveModelRatio) });
      }
      if (effectiveCompletionRatio !== undefined) {
        detailBadges.push({ label: '补全倍率', value: formatRatioDisplay(effectiveCompletionRatio) });
      }

      return detailBadges;
    }

    const activeGroup = row.tokenGroup || providerForm.group || 'default';
    const explicitGroupPrice = activeGroup ? row.groupPriceMap[activeGroup]?.modelPrice : undefined;
    const basePrice = explicitGroupPrice ?? row.perRequestPrice ?? row.basePrice;
    const scopedGroupSizeRatios =
      row.groupSizeRatioMap[activeGroup] ||
      row.groupSizeRatioMap.default ||
      row.groupSizeRatioMap.Default ||
      row.groupSizeRatioMap.DEFAULT ||
      {};
    const mergedSizeRatios =
      Object.keys(scopedGroupSizeRatios).length > 0 ? scopedGroupSizeRatios : row.sizeRatioMap;
    const activeSizeRatio = mergedSizeRatios[activeGroup] ?? row.sizeRatioMap[activeGroup];

    if (basePrice !== undefined) {
      detailBadges.push({
        label: '基础单价',
        value: row.displayPrice || formatMoneyDisplay(basePrice, `/${row.billingUnit || '次'}`, row.currency) || '-',
        accent: true,
      });
    }

    const ratioEntries = sortRatioEntries(mergedSizeRatios);
    ratioEntries.forEach(([size, ratio]) => {
      if (basePrice === undefined) {
        detailBadges.push({
          label: size,
          value: formatRatioDisplay(ratio),
          accent: size === activeGroup,
        });
        return;
      }

      detailBadges.push({
        label: size,
        value: `${formatRatioDisplay(ratio)} = ${formatMoneyDisplay(basePrice * ratio, `/${row.billingUnit || '次'}`, row.currency)}`,
        accent: size === activeGroup,
      });
    });

    if (!ratioEntries.length && activeSizeRatio !== undefined && basePrice !== undefined) {
      detailBadges.push({
        label: activeGroup,
        value: `${formatRatioDisplay(activeSizeRatio)} = ${formatMoneyDisplay(basePrice * activeSizeRatio, `/${row.billingUnit || '次'}`, row.currency)}`,
        accent: true,
      });
    }

    if (!detailBadges.length && row.groupRatio !== undefined) {
      detailBadges.push({
        label: '分组倍率',
        value: `${activeGroup} ${formatRatioDisplay(row.groupRatio)}`,
        accent: true,
      });
    }

    return detailBadges;
  };

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
    setProviderForm({
      ...defaultProviderForm,
      providerColor: pickRandomProviderColor(collectProviderColors(providers)),
    });
    setAdvancedResult(null);
    setPricingSearch('');
    setShowAdvancedMode(false);
    if (closeCreate) {
      setShowProviderCreateForm(false);
    }
  };

  useEffect(() => {
    if (initialSupplier) return;
    resetThirdPartyForm(true);
    appliedInitialSupplierRef.current = '';
  }, [initialSupplier]);

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
        availableGroups: extractAvailableGroups(restoredPricingData, restoredGroupRatio, provider.baseUrl),
      });
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
      format: initialSupplier.format || 'auto',
      group: '',
      costMode:
        typeof initialSupplier.budgetLimit === 'number' && initialSupplier.budgetLimit > 0 ? 'amount' : 'unlimited',
      costValue:
        typeof initialSupplier.budgetLimit === 'number' && initialSupplier.budgetLimit > 0 ? initialSupplier.budgetLimit : 0,
      providerColor: pickRandomProviderColor(collectProviderColors(providers)),
      isActive: true,
    });
    setAdvancedResult(null);
    setPricingSearch('');
    setShowAdvancedMode(false);
    setShowProviderCreateForm(true);
  }, [initialSupplier, providers]);

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

  const fetchPricingFromUrl = async (baseUrl: string, apiKey?: string): Promise<AdvancedResult | null> => {
    const cleanUrl = baseUrl.replace(/\/+$/, '');

    try {
      const directPricing = await fetchRawPricingCatalog(cleanUrl, apiKey, providerForm.format || 'auto');
      if (directPricing) {
        return {
          models: directPricing.pricingData.map((item: any) => item.model_name || item.model || item.id || '').filter(Boolean),
          apiType: directPricing.source,
          pricingHint: `已从 ${directPricing.endpointUrl} 同步 ${directPricing.pricingData.length} 条价格配置。`,
          fetchedAt: Date.now(),
          pricingData: directPricing.pricingData,
          groupRatio: directPricing.groupRatio,
          availableGroups: directPricing.supportsGroups
            ? extractAvailableGroups(directPricing.pricingData, directPricing.groupRatio, cleanUrl)
            : [],
        };
      }
    } catch (error) {
      console.warn('[ApiSettings] direct pricing fetch failed:', error);
    }

    if (isNoGroupProvider(cleanUrl)) {
      try {
        const pricingList = await fetchWuyinPricingCatalog(cleanUrl);
        return {
          models: pricingList.map((item) => item.modelId).filter(Boolean),
          apiType: 'wuyinkeji',
          pricingHint: `已从无音科技产品目录同步 ${pricingList.length} 个计费项，按供应商原始单位展示（如 元/张、元/次、元/秒）。`,
          fetchedAt: Date.now(),
          pricingData: pricingList.map((item) => ({
            model: item.modelId,
            model_name: item.modelName,
            billing_type: 'per_request',
            quota_type: 'per_request',
            per_request_price: item.inputPrice,
            price_per_image: item.inputPrice,
            currency: item.currency,
            pay_unit: item.billingUnit,
            display_price: item.displayPrice,
          })),
          groupRatio: {},
          availableGroups: [],
        };
      } catch (error) {
        console.warn('[ApiSettings] wuyinkeji pricing fetch failed:', error);
      }
    }

    // 🚀 [Fix] 尝试多个可能的价格接口路径
    const runtime = resolveProviderRuntime({ baseUrl: cleanUrl, format: providerForm.format || 'auto' });
    if (runtime.strategyId === '12ai') {
      return {
        models: [],
        apiType: '12ai',
        pricingHint: '12AI 当前没有兼容 NewAPI 的 /api/pricing 管理接口，价格扫描已跳过。这里出现 404 不代表生成接口配置错误，请以实际生成请求是否成功为准。',
        fetchedAt: Date.now(),
        pricingData: [],
        groupRatio: {},
        availableGroups: [],
      };
    }

    const endpoints = ['/api/pricing', '/pricing', '/v1/pricing', '/api/price', '/price'];
    
    for (const endpoint of endpoints) {
      try {
        const headers: Record<string, string> = { 
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        };
        
        // 如果有 API Key，添加到请求头
        if (apiKey) {
          const runtime = resolveProviderRuntime({ baseUrl: cleanUrl, format: 'openai' });
          headers['Authorization'] = formatAuthorizationHeaderValue(apiKey, runtime.authorizationValueFormat);
        }
        
        const response = await fetch(`${cleanUrl}${endpoint}`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          console.warn(`[ApiSettings] pricing endpoint ${endpoint} returned ${response.status}`);
          continue;
        }
        
        const text = await response.text();
        if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
          console.warn(`[ApiSettings] pricing endpoint ${endpoint} returned HTML`);
          continue;
        }

        const data = JSON.parse(text);
        
        // 🚀 [Fix] 支持多种价格数据格式
        const pricingList: any[] = Array.isArray(data.data) ? data.data : 
                                  Array.isArray(data.prices) ? data.prices :
                                  Array.isArray(data.models) ? data.models : [];
        
        const groupRatio = (data.group_ratio || data.groupRatio || {}) as Record<string, number>;
        
        if (!pricingList.length) {
          console.warn(`[ApiSettings] pricing endpoint ${endpoint} returned empty list`);
          continue;
        }

        console.log(`[ApiSettings] Successfully fetched pricing from ${endpoint}: ${pricingList.length} models`);

        return {
          models: pricingList.map((item: any) => item.model_name || item.model || item.id || '').filter(Boolean),
          apiType: 'direct',
          pricingHint: `已从供应商价格接口抓取 ${pricingList.length} 个模型的基础价与倍率。`,
          fetchedAt: Date.now(),
          pricingData: pricingList,
          groupRatio,
          availableGroups: extractAvailableGroups(pricingList, groupRatio, cleanUrl),
        };
      } catch (error) {
        console.warn(`[ApiSettings] pricing endpoint ${endpoint} failed:`, error);
      }
    }

    // 如果所有端点都失败，尝试代理
    try {
      const proxyResponse = await fetch('/api/pricing-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: cleanUrl, apiKey }),
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
          availableGroups: extractAvailableGroups(pricingList, groupRatio, cleanUrl),
        };
      }
    } catch (error) {
      console.warn('[ApiSettings] pricing proxy failed', error);
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
      // 🚀 [Fix] 传递 API Key 以支持需要认证的接口
      const result = await fetchPricingFromUrl(baseUrl, providerForm.apiKey);
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
      if (isNoGroupProvider(baseUrl)) {
        setProviderForm((prev) => ({ ...prev, group: '' }));
      }
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

    setSavingProviderId(providerForm.id || 'new');

    const { budgetLimit, tokenLimit } = parseCost(providerForm.costMode, providerForm.costValue);

    let models: string[] = [];
    let pricingModelNames: string[] = (advancedResult?.models || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    try {
      const detect = await autoDetectAndConfigureModels(apiKey, baseUrl, providerForm.format);
      models = detect.models || [];
    } catch (error) {
      console.warn('[ApiSettings] detect models before save failed', error);
      models = existingProvider?.models || [];
    }

    if ((!models || models.length === 0) && existingProvider?.models?.length) {
      models = existingProvider.models;
    }

    let pricingSnapshot: ProviderPricingSnapshot | undefined;
    const sourcePricingData = advancedResult?.pricingData;

    // Keep pricing sync manual so saving stays fast and avoids pricing fetch errors.
    if (advancedResult?.pricingData?.length) {
      pricingSnapshot = buildProviderPricingSnapshot(advancedResult.pricingData, advancedResult.groupRatio, {
        fetchedAt: advancedResult.fetchedAt,
        note: advancedResult.pricingHint,
      });
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
      group: currentProviderSupportsGroups ? (providerForm.group.trim() || undefined) : undefined,
      models,
      format: providerForm.format,
      isActive: providerForm.isActive,
      budgetLimit,
      tokenLimit,
      customCostMode: providerForm.costMode,
      customCostValue: providerForm.costValue,
      providerColor: providerForm.providerColor,
      badgeColor: providerForm.providerColor,
      pricingSnapshot,
    };

    try {
      let persistedProviderId = providerForm.id;

      if (providerForm.id) {
        const ok = keyManager.updateProvider(providerForm.id, payload);
        if (!ok) {
          notify.error('保存失败', '供应商更新失败。');
          return;
        }
        notify.success('保存成功', '供应商配置已更新。');
      } else {
        const createdProvider = keyManager.addProvider(payload as any);
        persistedProviderId = createdProvider.id;
        setHighlightedProviderId(createdProvider.id);
        window.setTimeout(() => {
          setHighlightedProviderId((prev) => (prev === createdProvider.id ? null : prev));
        }, 2400);
        notify.success('添加成功', '供应商配置已保存。');
      }

      injectPricingOverrides(pricingSnapshot, sourcePricingData);

      refresh();

      if (persistedProviderId) {
        const persistedProvider = keyManager.getProviders().find((item) => item.id === persistedProviderId);
        if (persistedProvider) {
          setProviderForm(toProviderForm(persistedProvider));
          setShowProviderCreateForm(true);
        }
      }
    } catch (error: any) {
      notify.error('保存失败', error?.message || '无法保存供应商配置。');
    } finally {
      setSavingProviderId(null);
    }
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
      const detect = await autoDetectAndConfigureModels(provider.apiKey, provider.baseUrl, provider.format);

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
      // 🚀 [Fix] 传递 API Key 以支持需要认证的接口
      const result = await fetchPricingFromUrl(provider.baseUrl, provider.apiKey);
      if (!result?.pricingData?.length) {
        notify.error('同步失败', '未从价格页获取到基础价和倍率。请检查供应商地址和 API Key 是否正确。');
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
        setShowAdvancedMode(true);
        if (isNoGroupProvider(provider.baseUrl)) {
          setProviderForm((prev) => ({ ...prev, group: '' }));
        } else if (!providerForm.group && result.availableGroups?.length) {
          setProviderForm((prev) => ({ ...prev, group: prev.group || result.availableGroups?.[0] || '' }));
        }
      }
      refresh();
    } finally {
      setSyncingProviderId(null);
    }
  };

  const handleFetchAndSyncPricing = async () => {
    if (currentEditingProvider) {
      await handleSyncPricing(currentEditingProvider);
      return;
    }

    await handleDetectAdvanced();
  };

  const renderCostEditor = (
    costMode: CostMode,
    costValue: number,
    onModeChange: (mode: CostMode) => void,
    onValueChange: (value: number) => void
  ) => (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="mb-1 text-xs text-[var(--text-tertiary)]">计费模式</div>
        <FormSelect
          value={costMode}
          onChange={(value) => onModeChange(value as CostMode)}
          options={[
            { value: 'unlimited', label: '无限' },
            { value: 'amount', label: '金额' },
            { value: 'tokens', label: 'Tokens' },
          ]}
        />
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
      <div className="settings-section-card p-4" style={elevatedPanelStyle}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {mode === 'edit' ? '编辑官方接口' : '新增官方接口'}
            </div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">用于官方 API Key 的保存与额度配置。</div>
          </div>
          <button className="apple-button-secondary h-8 px-3 text-xs" style={secondaryButtonStyle} onClick={() => resetOfficialForm(true)}>
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

          <div className="settings-action-row">
            <button className="apple-button-primary h-9 px-4 text-sm" onClick={() => void handleSaveOfficial()}>
              <Save size={14} />{mode === 'edit' ? '保存修改' : '添加接口'}
            </button>
            <button className="apple-button-secondary h-9 px-4 text-sm" style={secondaryButtonStyle} onClick={() => resetOfficialForm(true)}>
              <XCircle size={14} />取消
            </button>
          </div>
        </div>
      </div>
    );
  };
  const renderProviderForm = () => {
    const mode = providerForm.id ? 'edit' : 'create';
    const canOperateOnCurrentProvider = Boolean(currentEditingProvider);
    const priceSyncStatus: StatusMeta =
      currentProviderSnapshotCount > 0
        ? { label: '已同步快照', tone: 'green', helper: `${currentProviderSnapshotCount} 条记录` }
        : { label: '未同步', tone: 'amber', helper: '建议先扫描价格' };
    const nextPendingStep = providerWorkflowSteps.find((step) => !step.complete);
    const editorSummaryCards = [
      { label: '基础地址', value: editingProviderBaseUrl || '待填写' },
      { label: '默认分组', value: providerForm.group.trim() || '未设置' },
      { label: '模型 / 价格', value: `${currentProviderModelCount} / ${currentProviderSnapshotCount}` },
      { label: '最近同步', value: currentProviderLastSync ? formatDate(currentProviderLastSync) : '未同步' },
    ];
    const syncSummaryRows = [
      { label: '扫描状态', value: priceSyncStatus.label },
      { label: '可用分组', value: String(currentProviderGroupCount) },
      { label: '最近扫描', value: currentProviderLastSync ? formatDate(currentProviderLastSync) : '未扫描' },
    ];

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
          <div className="flex flex-col gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: providerForm.providerColor }} />
                <div className="text-lg font-semibold text-[var(--text-primary)]">{editingProviderName}</div>
                <StatusBadge label={currentProviderStatus.label} tone={currentProviderStatus.tone} compact />
              </div>
              <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {mode === 'edit'
                  ? '当前供应商的连接、校验和价格同步都集中在这里处理。'
                  : '先补齐基础连接并保存，再继续校验模型和同步价格。'}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border px-3 py-1.5 text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                  额度模式 {costModeText[providerForm.costMode]}
                </span>
                <span className="rounded-full border px-3 py-1.5 text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                  {providerForm.apiKey.trim() ? 'API Key 已填写' : 'API Key 待填写'}
                </span>
                <span className="rounded-full border px-3 py-1.5 text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                  {providerForm.isActive ? '当前启用' : '当前停用'}
                </span>
                <span className="rounded-full border px-3 py-1.5 text-xs text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                  {nextPendingStep ? `下一步：${nextPendingStep.label}` : '连接、校验与价格同步已补齐'}
                </span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {editorSummaryCards.map((row) => (
                <div key={row.label} className="rounded-xl border p-3" style={elevatedPanelStyle}>
                  <div className="text-[11px] text-[var(--text-tertiary)]">{row.label}</div>
                  <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-4">
            <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
              <div className="mb-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">基础连接</div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">名称、颜色、基础地址和 API Key 都在这里统一维护。</div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),minmax(280px,0.9fr)]">
                <div>
                  <div className="mb-1 text-xs text-[var(--text-tertiary)]">供应商名称</div>
                  <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.name} onChange={(event) => setProviderForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="例如：12AI" />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[var(--text-tertiary)]">供应商颜色</div>
                  <div className="grid gap-3 sm:grid-cols-[72px,minmax(0,1fr),auto]">
                    <input className="h-10 w-16 rounded-xl border p-1" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }} type="color" value={providerForm.providerColor} onChange={(event) => setProviderForm((prev) => ({ ...prev, providerColor: event.target.value }))} />
                    <input className="h-10 flex-1 rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.providerColor} onChange={(event) => setProviderForm((prev) => ({ ...prev, providerColor: event.target.value }))} />
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm"
                      style={secondaryButtonStyle}
                      onClick={() => applyRandomProviderColor(providerForm.id)}
                      title="随机分配一个和其他供应商尽量不重复的颜色"
                    >
                      <Shuffle size={14} />随机
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <div className="mb-1 text-xs text-[var(--text-tertiary)]">基础地址</div>
                  <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.baseUrl} onChange={(event) => setProviderForm((prev) => ({ ...prev, baseUrl: event.target.value }))} placeholder="https://example.com/v1" />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[var(--text-tertiary)]">API Key</div>
                  <input className="h-10 w-full rounded-xl border px-3 text-sm outline-none" style={formFieldStyle} value={providerForm.apiKey} onChange={(event) => setProviderForm((prev) => ({ ...prev, apiKey: event.target.value }))} placeholder="输入第三方供应商 API Key" />
                </div>

                <div>
                  <div className="mb-1 text-xs text-[var(--text-tertiary)]">协议格式</div>
                  <select
                    className="h-10 w-full rounded-xl border px-3 text-sm outline-none"
                    style={formFieldStyle}
                    value={providerForm.format}
                    onChange={(event) => setProviderForm((prev) => ({ ...prev, format: event.target.value as ApiProtocolFormat }))}
                  >
                    <option value="openai">OpenAI 兼容</option>
                    <option value="gemini">Gemini 原生</option>
                    <option value="auto">自动检测</option>
                  </select>
                </div>
              </div>
              <div className="mt-2 text-xs text-[var(--text-tertiary)]">
                OpenAI 兼容会调用 `/v1/chat/completions`；Gemini 原生会调用 `/v1beta/models/...:generateContent?key=...`。
              </div>
            </div>

            <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">校验与同步</div>
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">所有扫描和同步动作都集中在这里，不再和状态说明重复出现。</div>
                </div>
                <StatusBadge label={priceSyncStatus.label} tone={priceSyncStatus.tone} helper={priceSyncStatus.helper} compact />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60" style={secondaryButtonStyle} onClick={() => void handleFetchAndSyncPricing()} disabled={advancedLoading || syncingProviderId === currentEditingProvider?.id}>
                  <Search size={14} />{advancedLoading ? '扫描中...' : '扫描价格'}
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  style={secondaryButtonStyle}
                  onClick={() => currentEditingProvider && void handleValidateProvider(currentEditingProvider)}
                  disabled={!canOperateOnCurrentProvider || detectingProviderId === currentEditingProvider?.id}
                >
                  <CheckCircle2 size={14} />{detectingProviderId === currentEditingProvider?.id ? '校验中...' : '校验模型'}
                </button>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  style={secondaryButtonStyle}
                  onClick={() => currentEditingProvider && void handleSyncPricing(currentEditingProvider)}
                  disabled={!canOperateOnCurrentProvider || syncingProviderId === currentEditingProvider?.id}
                  hidden
                >
                  <RefreshCw size={14} className={syncingProviderId === currentEditingProvider?.id ? 'animate-spin' : ''} />
                  {syncingProviderId === currentEditingProvider?.id ? '同步中...' : '同步到供应商'}
                </button>
              </div>

              <div className="api-settings-summary-list mt-3 rounded-xl border p-3" style={elevatedPanelStyle}>
                <div className="grid gap-2 sm:grid-cols-3">
                  {syncSummaryRows.map((row) => (
                    <div key={row.label} className="rounded-xl border px-3 py-3" style={overlayPanelStyle}>
                      <div className="text-[11px] text-[var(--text-tertiary)]">{row.label}</div>
                      <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {!canOperateOnCurrentProvider ? (
                <div className="mt-3 rounded-xl border border-dashed px-3 py-3 text-xs leading-5 text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                  新供应商在保存前可以先扫描价格，但“校验模型”和“同步到供应商”会在保存后解锁。
                </div>
              ) : currentEditingProvider?.lastError ? (
                <div className="mt-3 rounded-xl border px-3 py-3 text-xs leading-5 text-red-400" style={{ borderColor: 'rgba(239, 68, 68, 0.22)', backgroundColor: 'rgba(239, 68, 68, 0.06)' }}>
                  最近错误：{currentEditingProvider.lastError}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">分组、额度与启用状态</div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">默认分组、额度模式和启用状态会直接影响调度与计费。</div>
              </div>
              <StatusBadge label={currentProviderStatus.label} tone={currentProviderStatus.tone} compact />
            </div>

            <div>
              <div className="mb-1 text-xs text-[var(--text-tertiary)]">默认分组</div>
              <input
                className="h-10 w-full rounded-xl border px-3 text-sm outline-none"
                style={formFieldStyle}
                value={providerForm.group}
                onChange={(event) => setProviderForm((prev) => ({ ...prev, group: event.target.value }))}
                disabled={!currentProviderSupportsGroups}
                placeholder="例如：default"
              />
            </div>

            {currentProviderSupportsGroups && advancedResult?.availableGroups?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {advancedResult.availableGroups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-left text-xs ${providerForm.group === group ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-[var(--border-light)] text-[var(--text-secondary)] hover:border-indigo-400 hover:text-indigo-400'}`}
                    onClick={() => setProviderForm((prev) => ({ ...prev, group }))}
                  >
                    {group}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed px-3 py-3 text-xs text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                暂未扫描到可选分组，可以先手动填写默认分组。
              </div>
            )}

            <div className="mt-4 rounded-xl border p-3" style={elevatedPanelStyle}>
              <div className="mb-3 text-xs text-[var(--text-tertiary)]">额度设置</div>
              {renderCostEditor(providerForm.costMode, providerForm.costValue, (costMode) => setProviderForm((prev) => ({ ...prev, costMode })), (costValue) => setProviderForm((prev) => ({ ...prev, costValue })))}
            </div>

            <label className="mt-4 flex items-center justify-between rounded-xl border px-3 py-3 text-sm text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: providerForm.isActive ? '#10b981' : '#6b7280' }} />
                启用该供应商
              </span>
              <input type="checkbox" checked={providerForm.isActive} onChange={(event) => setProviderForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
            </label>

            <div className="api-settings-summary-list mt-4 rounded-xl border p-3" style={elevatedPanelStyle}>
              <div className="api-settings-summary-item">
                <span className="api-settings-summary-item__label">总额度</span>
                <span className="api-settings-summary-item__value">{currentProviderBudgetPreview.total}</span>
              </div>
              <div className="api-settings-summary-item">
                <span className="api-settings-summary-item__label">已使用</span>
                <span className="api-settings-summary-item__value text-amber-500">{currentProviderBudgetPreview.used}</span>
              </div>
              <div className="api-settings-summary-item">
                <span className="api-settings-summary-item__label">剩余</span>
                <span className="api-settings-summary-item__value text-emerald-500">{currentProviderBudgetPreview.remaining}</span>
              </div>
            </div>

            <div className="mt-3 rounded-xl border px-3 py-3 text-xs leading-6 text-[var(--text-tertiary)]" style={elevatedPanelStyle}>
              {currentProviderStatus.helper}
              {currentProviderBudgetPreview.unit ? ` 当前额度单位为 ${currentProviderBudgetPreview.unit}。` : ''}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
            <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setShowAdvancedMode((prev) => !prev)}>
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">价格同步与快照</div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">把价格扫描、分组倍率和最终价格明细收在同一个区域，避免在列表和表单之间来回跳。</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge label={currentProviderSnapshotCount > 0 ? '已同步' : '待扫描'} tone={priceSyncStatus.tone} compact />
                {showAdvancedMode ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {(showAdvancedMode || advancedResult) && (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button className="inline-flex h-9 items-center gap-1 rounded-xl border px-3 text-sm" style={secondaryButtonStyle} onClick={() => void handleDetectAdvanced()} disabled={advancedLoading}>
                    <Search size={14} />{advancedLoading ? '扫描中...' : '重新扫描价格'}
                  </button>
                  {advancedResult?.fetchedAt ? <span className="text-xs text-[var(--text-tertiary)]">最近扫描：{formatDate(advancedResult.fetchedAt)}</span> : null}
                </div>

                {advancedResult ? (
                  <div className="space-y-4 rounded-2xl border p-4" style={elevatedPanelStyle}>
                    <div className="rounded-xl border px-3 py-3 text-xs leading-5 text-[var(--text-tertiary)]" style={overlayPanelStyle}>
                      {advancedResult.pricingHint}
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border p-3" style={overlayPanelStyle}>
                        <div className="text-[11px] text-[var(--text-tertiary)]">扫描来源</div>
                        <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{advancedResult.apiType}</div>
                      </div>
                      <div className="rounded-xl border p-3" style={overlayPanelStyle}>
                        <div className="text-[11px] text-[var(--text-tertiary)]">模型数量</div>
                        <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{advancedResult.models.length}</div>
                      </div>
                      <div className="rounded-xl border p-3" style={overlayPanelStyle}>
                        <div className="text-[11px] text-[var(--text-tertiary)]">默认分组倍率</div>
                        <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{formatRatioDisplay(defaultScannedGroupRatio)}</div>
                      </div>
                    </div>

                    {currentProviderSupportsGroups && advancedResult.availableGroups && advancedResult.availableGroups.length > 0 ? (
                      <div className="rounded-xl border p-3" style={overlayPanelStyle}>
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
                    ) : null}

                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-xs font-medium text-[var(--text-primary)]">价格明细</div>
                          <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">只展示品牌供应商、分组、计费方式，以及最终价格或倍率。</div>
                        </div>
                        <div className="relative w-full sm:w-80">
                          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center justify-center text-[var(--text-tertiary)]">
                            <Search size={15} />
                          </span>
                          <input
                            value={pricingSearch}
                            onChange={(event) => setPricingSearch(event.target.value)}
                            placeholder="搜索模型 / 分组 / 供应商"
                            className="h-9 w-full rounded-xl border pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none transition focus:border-indigo-500"
                            style={formFieldStyle}
                          />
                        </div>
                      </div>

                      {filteredAdvancedPricingRows.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[var(--border-light)] p-4 text-xs text-[var(--text-tertiary)]">当前没有可展示的价格明细。</div>
                      ) : (
                        <div className="space-y-3">
                          {filteredAdvancedPricingRows.map((row) => {
                            const billingLabel = resolveBillingLabel(row.billingType, row.quotaType, row.perRequestPrice);
                            const detailBadges = renderPricingDetailBadges(row);

                            return (
                              <div key={row.model} className="rounded-xl border p-4" style={overlayPanelStyle}>
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-[var(--text-primary)]">{row.model}</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <span className="rounded-full border px-2.5 py-1 text-[11px] text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)' }}>
                                        品牌 {row.providerLabel || row.provider || '未标注'}
                                      </span>
                                      <span className="rounded-full border px-2.5 py-1 text-[11px] text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)' }}>
                                        分组 {row.tokenGroup || providerForm.group || 'default'}
                                      </span>
                                      <span className="rounded-full border px-2.5 py-1 text-[11px] text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)' }}>
                                        计费 {billingLabel}
                                      </span>
                                    </div>
                                  </div>
                                  <span className="inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: `${providerForm.providerColor}22`, color: providerForm.providerColor }}>
                                    {providerForm.group || row.tokenGroup || 'default'}
                                  </span>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {detailBadges.length > 0 ? (
                                    detailBadges.map((item) => (
                                      <div
                                        key={`${row.model}-${item.label}-${item.value}`}
                                        className="rounded-full border px-3 py-1.5 text-[11px]"
                                        style={{
                                          borderColor: item.accent ? `${providerForm.providerColor}55` : 'var(--border-light)',
                                          backgroundColor: item.accent ? `${providerForm.providerColor}12` : 'var(--bg-elevated)',
                                          color: item.accent ? providerForm.providerColor : 'var(--text-secondary)',
                                        }}
                                      >
                                        <span className="mr-1 opacity-70">{item.label}</span>
                                        <span className="font-medium">{item.value}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded-full border px-3 py-1.5 text-[11px] text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)' }}>
                                      当前模型未返回可直接展示的价格字段
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm leading-6 text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                    扫描价格后，这里会展示供应商返回的品牌、分组、计费方式和最终价格，方便你直接确认同步内容。
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
    );
  };

  const renderProviderEditorCard = () => (
    <div ref={providerEditorRef} className="api-settings-editor-card overflow-hidden rounded-[24px] border scroll-mt-6" style={elevatedPanelStyle}>
      {showProviderCreateForm ? (
        <>
          <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-[var(--text-primary)]">
                    {providerForm.id ? `正在编辑：${editingProviderName}` : '新增供应商'}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                    {providerForm.id
                      ? editingProviderBaseUrl || '请完善供应商基础地址，保存后会作为当前供应商的识别地址。'
                      : '填写名称、基础地址和 API Key 后即可保存为新的第三方供应商。'}
                  </div>
                </div>
                <div className="api-settings-editor-toolbar flex flex-wrap gap-2 overflow-visible pb-1">
                  <button
                    className="apple-button-primary h-9 px-4 text-sm transition-all active:scale-95 disabled:opacity-70 whitespace-nowrap"
                    onClick={() => void handleSaveProvider()}
                    disabled={savingProviderId === (providerForm.id || 'new')}
                  >
                    <Save size={14} />
                    {savingProviderId === (providerForm.id || 'new') ? '保存中...' : (providerForm.id ? '保存供应商' : '添加供应商')}
                  </button>
                  <button className="apple-button-secondary h-9 px-4 text-sm transition-all active:scale-95 whitespace-nowrap" style={secondaryButtonStyle} onClick={() => resetThirdPartyForm(true)}>
                    <XCircle size={14} />关闭
                  </button>
                  {currentEditingProvider ? (
                    <>
                      <button
                        className="apple-button-secondary h-8 px-3 text-xs transition-all active:scale-95 whitespace-nowrap"
                        style={secondaryButtonStyle}
                        onClick={() => handleToggleProvider(currentEditingProvider)}
                      >
                        {currentEditingProvider.isActive ? <Pause size={12} /> : <Play size={12} />}
                        {currentEditingProvider.isActive ? '停用' : '启用'}
                      </button>
                      <button className="apple-button-danger h-8 px-3 text-xs transition-all active:scale-95 whitespace-nowrap" onClick={() => handleDeleteProvider(currentEditingProvider.id)}>
                        <Trash2 size={12} />删除
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div ref={providerEditorBodyRef} className="max-h-none overflow-y-visible p-5 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
            {renderProviderForm()}
          </div>
        </>
      ) : (
        <>
          <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
            <div className="text-base font-semibold text-[var(--text-primary)]">供应商工作区</div>
            <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
              先从上方列表选中一个供应商，再在这里处理连接配置、模型校验和价格同步。
            </div>
          </div>

          <div className="p-5">
            <div className="space-y-4">
              <div className="rounded-2xl border p-5" style={overlayPanelStyle}>
                <div className="text-sm font-semibold text-[var(--text-primary)]">先选择，再处理</div>
                <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  列表卡片只负责帮你快速定位对象，具体编辑和同步动作统一放在工作区里，页面层级会更清晰。
                </div>

                <div className="mt-5 space-y-3">
                  {[
                    { title: '1. 选择供应商', description: '从上方队列点选供应商，编辑卡片会直接在该供应商卡片下方展开。' },
                    { title: '2. 补齐连接信息', description: '统一修改名称、地址、API Key、默认分组和额度模式。' },
                    { title: '3. 完成校验同步', description: '保存后继续做模型校验、价格扫描与正式同步。' },
                  ].map((item) => (
                    <div key={item.title} className="rounded-xl border p-4" style={elevatedPanelStyle}>
                      <div className="text-sm font-medium text-[var(--text-primary)]">{item.title}</div>
                      <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{item.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
                  <div className="text-[11px] text-[var(--text-tertiary)]">当前队列</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{summary.providerCount}</div>
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">已启用 {summary.activeProviderCount}</div>
                </div>
                <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
                  <div className="text-[11px] text-[var(--text-tertiary)]">待处理</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{providerWorkspaceSummary.pendingSyncCount + providerWorkspaceSummary.errorCount}</div>
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">价格待同步或存在异常</div>
                </div>
                <button
                  className="apple-button-primary h-10 w-full text-sm"
                  onClick={() => {
                    setShowProviderCreateForm(true);
                    resetThirdPartyForm(false);
                  }}
                >
                  <Plus size={14} />新增供应商
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="api-settings-view space-y-4 pb-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr,minmax(auto,580px)] xl:grid-cols-[1fr,minmax(auto,620px)]">
        {/* 左侧分区：标题与说明 */}
        <div className="rounded-[24px] border p-5 md:p-6" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}>
          <div className="min-w-0">
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">API 管理</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              统一管理官方接口与第三方供应商。在此可以配置 API 密钥、同步模型价格以及管理供应商队列。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                左侧队列
              </span>
              <span className="rounded-full border px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                右侧连续工作区
              </span>
            </div>
          </div>
        </div>

        {/* 右侧分区：切换与统计 */}
        <div className="rounded-[24px] border p-5 md:p-6" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}>
          <div className="flex flex-col gap-4">
            <div className="apple-pill-group self-start">
              <button
                className={`apple-pill-button ${tab === 'thirdparty' ? 'active' : ''}`}
                onClick={() => setTab('thirdparty')}
              >
                第三方供应商
                <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: 'currentColor' }}>
                  {summary.providerCount}
                </span>
              </button>
              <button
                className={`apple-pill-button ${tab === 'official' ? 'active' : ''}`}
                onClick={() => setTab('official')}
              >
                官方接口
                <span className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: 'currentColor' }}>
                  {summary.officialCount}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              <div className="rounded-2xl border p-3" style={elevatedPanelStyle}>
                <div className="text-[11px] text-[var(--text-tertiary)]">供应商</div>
                <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{summary.providerCount}</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">启用 {summary.activeProviderCount}</div>
              </div>
              <div className="rounded-2xl border p-3" style={elevatedPanelStyle}>
                <div className="text-[11px] text-[var(--text-tertiary)]">已同步</div>
                <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{providerWorkspaceSummary.syncedCount}</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">待办 {providerWorkspaceSummary.pendingSyncCount}</div>
              </div>
              <div className="rounded-2xl border p-3" style={elevatedPanelStyle}>
                <div className="text-[11px] text-[var(--text-tertiary)]">异常</div>
                <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{providerWorkspaceSummary.errorCount}</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">受限 {providerWorkspaceSummary.limitedCount}</div>
              </div>
              <div className="rounded-2xl border p-3" style={elevatedPanelStyle}>
                <div className="text-[11px] text-[var(--text-tertiary)]">累计成本</div>
                <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">${summary.totalCost.toFixed(2)}</div>
                <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">Tk {summary.totalTokens.toLocaleString('zh-CN')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>


      {tab === 'thirdparty' ? (
        <div className="api-settings-layout">
            <aside className="api-settings-list-panel min-w-0 self-start">
              <div
                className="overflow-hidden rounded-[24px] border"
                style={elevatedPanelStyle}
              >
                <div className="border-b px-4 py-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">供应商队列</div>
                        <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                          左侧只负责快速选中供应商，右侧工作区再连续完成编辑、校验和价格同步。
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)' }}>
                          {providerSearch.trim() ? `${filteredProviders.length}/${providers.length}` : providers.length}
                        </span>
                        <button
                          className="apple-button-primary h-9 px-4 text-sm"
                          onClick={() => {
                            setShowProviderCreateForm(true);
                            resetThirdPartyForm(false);
                          }}
                        >
                          <Plus size={14} />新增供应商
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl border px-3 py-3" style={elevatedPanelStyle}>
                        <div className="text-[11px] text-[var(--text-tertiary)]">待同步</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{providerWorkspaceSummary.pendingSyncCount}</div>
                      </div>
                      <div className="rounded-xl border px-3 py-3" style={elevatedPanelStyle}>
                        <div className="text-[11px] text-[var(--text-tertiary)]">异常</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{providerWorkspaceSummary.errorCount}</div>
                      </div>
                      <div className="rounded-xl border px-3 py-3" style={elevatedPanelStyle}>
                        <div className="text-[11px] text-[var(--text-tertiary)]">受限额度</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{providerWorkspaceSummary.limitedCount}</div>
                      </div>
                    </div>

                    <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center justify-center text-[var(--text-tertiary)]">
                      <Search size={15} />
                    </span>
                    <input
                      value={providerSearch}
                      onChange={(event) => setProviderSearch(event.target.value)}
                      placeholder="搜索供应商名称或地址..."
                      className="h-10 w-full rounded-xl border pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none"
                      style={formFieldStyle}
                    />
                  </div>
                  </div>
                </div>

                <div ref={providerListRef} className="api-settings-provider-list space-y-3 p-3 lg:max-h-[calc(100vh-240px)] lg:overflow-y-auto">
                  {filteredProviders.length === 0 ? (
                    <div className="apple-empty-state rounded-2xl border border-dashed p-6 text-left text-sm text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)' }}>
                      {providers.length === 0 ? '暂无第三方供应商配置，点击右上角“新增供应商”开始添加。' : '没有匹配到供应商，请换个关键词试试。'}
                    </div>
                  ) : (
                    filteredProviders.map((provider) => {
                      const isSelected = providerForm.id === provider.id;
                      const isHighlighted = highlightedProviderId === provider.id;
                      const providerColor = provider.providerColor || provider.badgeColor || '#3B82F6';
                      const providerStatus = getProviderStatusMeta(provider);
                      const providerPricingCount = provider.pricingSnapshot?.rows?.length || 0;
                      const budget = formatBudgetInfo(provider);
                      const isLimited = provider.customCostMode !== 'unlimited';
                      const latestActivity = provider.pricingSnapshot?.fetchedAt || provider.lastChecked;

                      return (
                        <React.Fragment key={provider.id}>
                        <article
                          data-provider-id={provider.id}
                          role="button"
                          tabIndex={0}
                          className={`api-settings-provider-item w-full cursor-pointer overflow-hidden rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 ${isHighlighted ? 'animate-pulse-highlight' : ''}`}
                          style={isSelected
                            ? {
                                borderColor: `${providerColor}88`,
                                backgroundColor: `${providerColor}12`,
                                boxShadow: `0 0 0 1px ${providerColor}33`,
                              }
                            : isHighlighted
                              ? {
                                  borderColor: 'rgba(34,197,94,0.8)',
                                  backgroundColor: 'rgba(34,197,94,0.15)',
                                  boxShadow: '0 0 0 2px rgba(34,197,94,0.4), 0 0 20px rgba(34,197,94,0.2)',
                                }
                              : {
                                  borderColor: 'var(--border-light)',
                                  backgroundColor: 'var(--bg-surface)',
                                }}
                          onClick={() => loadProviderToForm(provider)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              loadProviderToForm(provider);
                            }
                          }}
                          aria-label={`编辑供应商 ${provider.name}`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: providerColor }} />
                                  <span className="api-settings-provider-name text-sm font-semibold text-[var(--text-primary)]">{provider.name}</span>
                                  {isSelected ? (
                                    <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-medium" style={{ backgroundColor: `${providerColor}18`, color: providerColor }}>
                                      工作区中
                                    </span>
                                  ) : null}
                                </div>
                                <div className="api-settings-provider-url mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{provider.baseUrl}</div>
                              </div>

                              <StatusBadge label={providerStatus.label} tone={providerStatus.tone} compact />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="api-settings-provider-meta">
                              <span>模型 {provider.models?.length || 0}</span>
                              <span>价格 {providerPricingCount}</span>
                              {provider.group ? <span>分组 {provider.group}</span> : null}
                              <span>{latestActivity ? `最近 ${formatDate(latestActivity)}` : '未校验'}</span>
                              </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                className="apple-button-secondary h-8 px-3 text-xs transition-all active:scale-95 whitespace-nowrap"
                                style={secondaryButtonStyle}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleToggleProvider(provider);
                                }}
                              >
                                {provider.isActive ? <Pause size={12} /> : <Play size={12} />}
                                {provider.isActive ? '暂停刷新' : '恢复刷新'}
                              </button>
                              <button
                                type="button"
                                className="apple-button-secondary h-8 px-3 text-xs transition-all active:scale-95 whitespace-nowrap"
                                style={secondaryButtonStyle}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleSyncPricing(provider);
                                }}
                              >
                                <RefreshCw size={12} className={syncingProviderId === provider.id ? 'animate-spin' : ''} />
                                价格查询
                              </button>
                              <button
                                type="button"
                                className="apple-button-danger h-8 px-3 text-xs transition-all active:scale-95 whitespace-nowrap"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteProvider(provider.id);
                                }}
                              >
                                <Trash2 size={12} />
                                删除
                              </button>
                            </div>

                            </div>

                            <div className="rounded-xl border p-3" style={elevatedPanelStyle}>
                              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-[var(--text-tertiary)]">
                                <span>{costModeText[(provider.customCostMode as CostMode | undefined) || 'unlimited']}额度</span>
                                <span>{provider.isActive ? '参与调度中' : '当前停用'}</span>
                              </div>
                              <div className="api-settings-provider-budget mt-0">
                                <div className="api-settings-provider-budget-item">
                                  <span className="api-settings-provider-budget-item__label">总额度</span>
                                  <span className={`api-settings-provider-budget-item__value tabular-nums ${isLimited ? 'text-[var(--text-primary)]' : 'text-emerald-500'}`}>{budget.total}</span>
                                </div>
                                <div className="api-settings-provider-budget-item">
                                  <span className="api-settings-provider-budget-item__label">已使用</span>
                                  <span className="api-settings-provider-budget-item__value tabular-nums text-amber-500">{budget.used}</span>
                                </div>
                                <div className="api-settings-provider-budget-item">
                                  <span className="api-settings-provider-budget-item__label">剩余</span>
                                  <span className="api-settings-provider-budget-item__value tabular-nums text-emerald-500">{budget.remaining}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 text-[11px]">
                              <span style={{ color: 'var(--text-tertiary)' }}>{providerStatus.helper}</span>
                              <span className="font-medium" style={{ color: isSelected ? providerColor : 'var(--text-secondary)' }}>
                                {isSelected ? '正在编辑' : '点击进入工作区'}
                              </span>
                            </div>
                          </div>
                        </article>
                        {isSelected && showProviderCreateForm ? (
                          <div className="pt-1">
                            {renderProviderEditorCard()}
                          </div>
                        ) : null}
                        </React.Fragment>
                      );
                    })
                  )}

                  {!providerForm.id ? (
                    <div className="pt-1">
                      {renderProviderEditorCard()}
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>

            <aside className="api-settings-editor-panel min-w-0 self-start">
              <div ref={providerEditorRef} className="api-settings-editor-card overflow-hidden rounded-[24px] border scroll-mt-6" style={elevatedPanelStyle}>
                {showProviderCreateForm ? (
                  <>
                    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-base font-semibold text-[var(--text-primary)]">
                              {providerForm.id ? `正在编辑：${editingProviderName}` : '新增供应商'}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                              {providerForm.id
                                ? editingProviderBaseUrl || '请完善供应商基础地址，保存后会作为当前供应商的识别地址。'
                                : '填写名称、基础地址和 API Key 后即可保存为新的第三方供应商。'}
                            </div>
                          </div>
                          <div className="api-settings-editor-toolbar flex flex-wrap gap-2 overflow-visible pb-1">
                            <button
                              className="apple-button-primary h-9 px-4 text-sm transition-all active:scale-95 disabled:opacity-70 whitespace-nowrap"
                              onClick={() => void handleSaveProvider()}
                              disabled={savingProviderId === (providerForm.id || 'new')}
                            >
                              <Save size={14} />
                              {savingProviderId === (providerForm.id || 'new') ? '保存中...' : (providerForm.id ? '保存供应商' : '添加供应商')}
                            </button>
                            <button className="apple-button-secondary h-9 px-4 text-sm transition-all active:scale-95 whitespace-nowrap" style={secondaryButtonStyle} onClick={() => resetThirdPartyForm(true)}>
                              <XCircle size={14} />关闭
                            </button>
                            {currentEditingProvider ? (
                              <>
                                <button
                                  className="apple-button-secondary h-8 px-3 text-xs transition-all active:scale-95 whitespace-nowrap"
                                  style={secondaryButtonStyle}
                                  onClick={() => handleToggleProvider(currentEditingProvider)}
                                >
                                  {currentEditingProvider.isActive ? <Pause size={12} /> : <Play size={12} />}
                                  {currentEditingProvider.isActive ? '停用' : '启用'}
                                </button>
                                <button className="apple-button-danger h-8 px-3 text-xs transition-all active:scale-95 whitespace-nowrap" onClick={() => handleDeleteProvider(currentEditingProvider.id)}>
                                  <Trash2 size={12} />删除
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div ref={providerEditorBodyRef} className="max-h-none overflow-y-visible p-5 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
                      {renderProviderForm()}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
                      <div className="text-base font-semibold text-[var(--text-primary)]">供应商工作区</div>
                      <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                        先从左侧队列选中一个供应商，再在这里处理连接配置、模型校验和价格同步。
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="space-y-4">
                        <div className="rounded-2xl border p-5" style={overlayPanelStyle}>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">先选择，再处理</div>
                          <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                            列表卡片只负责帮助你快速定位对象，具体编辑和同步动作统一放在工作区，页面层级会更清楚。
                          </div>

                          <div className="mt-5 space-y-3">
                            {[
                              { title: '1. 选择供应商', description: '从左侧队列点选供应商，工作区自动切换到当前对象。' },
                              { title: '2. 补齐连接信息', description: '统一修改名称、地址、API Key、默认分组和额度模式。' },
                              { title: '3. 完成校验同步', description: '保存后继续做模型校验、价格扫描与正式同步。' },
                            ].map((item) => (
                              <div key={item.title} className="rounded-xl border p-4" style={elevatedPanelStyle}>
                                <div className="text-sm font-medium text-[var(--text-primary)]">{item.title}</div>
                                <div className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">{item.description}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
                            <div className="text-[11px] text-[var(--text-tertiary)]">当前队列</div>
                            <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{summary.providerCount}</div>
                            <div className="mt-1 text-xs text-[var(--text-tertiary)]">已启用 {summary.activeProviderCount}</div>
                          </div>
                          <div className="rounded-2xl border p-4" style={overlayPanelStyle}>
                            <div className="text-[11px] text-[var(--text-tertiary)]">待处理</div>
                            <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{providerWorkspaceSummary.pendingSyncCount + providerWorkspaceSummary.errorCount}</div>
                            <div className="mt-1 text-xs text-[var(--text-tertiary)]">价格待同步或存在异常</div>
                          </div>
                          <button
                            className="apple-button-primary h-10 w-full text-sm"
                            onClick={() => {
                              setShowProviderCreateForm(true);
                              resetThirdPartyForm(false);
                            }}
                          >
                            <Plus size={14} />新增供应商
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>
      ) : (
        <div className="space-y-4">
          <div className="settings-action-row justify-end">
            <button className="apple-button-primary h-9 px-4 text-sm" onClick={() => { setShowOfficialCreateForm(true); setOfficialForm(defaultOfficialForm); }}><Plus size={14} />新增官方接口</button>
          </div>

          {showOfficialCreateForm && renderOfficialForm()}

          <div className="grid gap-3">
            {officialKeys.length === 0 ? (
              <div className="apple-empty-state rounded-2xl border border-dashed p-6 text-sm text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-light)' }}>暂无官方接口配置。</div>
            ) : (
              officialKeys.map((slot) => (
                <div key={slot.id} className="settings-section-card p-4" style={elevatedPanelStyle}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{slot.name}</div>
                      <div className="mt-1 text-xs text-[var(--text-tertiary)]">{slot.provider} · {costModeText[slot.tokenLimit && slot.tokenLimit > 0 ? 'tokens' : slot.budgetLimit && slot.budgetLimit > 0 ? 'amount' : 'unlimited']}</div>
                      {/* Usage display for official key */}
                      {(() => {
                        const mode = slot.tokenLimit && slot.tokenLimit > 0 ? 'tokens' : slot.budgetLimit && slot.budgetLimit > 0 ? 'amount' : 'unlimited';
                        const isUnlimited = mode === 'unlimited';
                        const isTokenMode = mode === 'tokens';
                        const total = isTokenMode ? (slot.tokenLimit || 0) : (slot.budgetLimit || 0);
                        const used = isTokenMode ? (slot.usedTokens || 0) : (slot.totalCost || 0);
                        const remaining = isUnlimited ? Infinity : Math.max(0, total - used);
                        
                        return (
                          <div className="mt-2 space-y-1.5 rounded-lg bg-[var(--bg-overlay)] p-2">
                            <div className="flex items-center justify-between gap-4">
                              <div className="text-[10px] text-[var(--text-tertiary)]">{isTokenMode ? '总Token' : '总额度'}</div>
                              <div className={`text-xs font-semibold tabular-nums ${isUnlimited ? 'text-emerald-500' : 'text-[var(--text-secondary)]'}`}>
                                {isUnlimited ? '∞' : isTokenMode ? total.toLocaleString() : `¥${total.toFixed(2)}`}
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="text-[10px] text-[var(--text-tertiary)]">已使用</div>
                              <div className="text-xs font-semibold tabular-nums text-amber-500">
                                {isTokenMode ? used.toLocaleString() : `¥${used.toFixed(2)}`}
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <div className="text-[10px] text-[var(--text-tertiary)]">剩余</div>
                              <div className={`text-xs font-semibold tabular-nums ${remaining === 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {isUnlimited ? '∞' : isTokenMode ? (remaining as number).toLocaleString() : `¥${(remaining as number).toFixed(2)}`}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="settings-action-row">
                      <button className="apple-button-secondary h-8 px-3 text-xs" style={secondaryButtonStyle} onClick={() => loadOfficialToForm(slot)}><Edit3 size={12} />编辑</button>
                      <button className="apple-button-danger h-8 px-3 text-xs" onClick={() => handleDeleteOfficial(slot.id)}><Trash2 size={12} />删除</button>
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
