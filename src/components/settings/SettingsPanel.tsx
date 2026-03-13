import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calculator,
  ChevronRight,
  DollarSign,
  HardDrive,
  Key,
  LayoutDashboard,
  RefreshCw,
  Search,
  ScrollText,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { Suspense, lazy } from 'react';
import keyManager from '../../services/auth/keyManager';
import { getTodayCosts } from '../../services/billing/costService';
import {
  clearLogs,
  exportLogsForAI,
  getTodayLogs,
  LogLevel,
  subscribeToLogs,
  type SystemLogEntry,
} from '../../services/system/systemLogService';
import {
  getLocalFolderHandle,
  getStorageMode,
  isFileSystemAccessSupported,
  setStorageMode,
  type StorageMode,
} from '../../services/storage/storagePreference';
import { cleanupImagesOlderThan, cleanupOriginals, getAllImageIds, getStorageUsage } from '../../services/storage/imageStorage';
import type { Supplier } from '../../services/billing/supplierService';
import { useCanvas } from '../../context/CanvasContext';
import { useBilling } from '../../context/BillingContext';
import { notify } from '../../services/system/notificationService';
import { writeTextToClipboard } from '../../utils/clipboard';
import {
  SETTINGS_DANGER_STYLE,
  SETTINGS_ELEVATED_STYLE,
  SETTINGS_INPUT_CLASSNAME,
  SETTINGS_PANEL_STYLE,
  SETTINGS_SUCCESS_STYLE,
  SETTINGS_WARNING_STYLE,
  SettingsActionButton,
  SettingsBadge,
  SettingsHero,
  SettingsMetricCard,
  SettingsSection,
  SettingsViewShell,
} from './SettingsScaffold';
const ApiSettingsView = lazy(() => import('./ApiSettingsView'));
const AdminSystem = lazy(() => import('./AdminSystem'));
const CostEstimation = lazy(() => import('../../pages/CostEstimation'));

export type SettingsView = 'dashboard' | 'api-management' | 'cost-estimation' | 'storage-settings' | 'system-logs' | 'admin-system';
type NavSectionId = 'workspace' | 'system';

type NavItem = {
  id: SettingsView;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  section: NavSectionId;
};

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: SettingsView;
  initialSupplier?: Supplier | null;
}

const navSections: Array<{ id: NavSectionId; label: string }> = [
  { id: 'workspace', label: '工作台' },
  { id: 'system', label: '系统与维护' },
];

const navItems: NavItem[] = [
  { id: 'dashboard', label: '仪表盘', description: '查看接口、模型、费用和运行概况。', icon: LayoutDashboard, section: 'workspace' },
  { id: 'api-management', label: 'API管理', description: '统一管理官方接口和第三方供应商。', icon: Key, section: 'workspace' },
  { id: 'cost-estimation', label: '价格估算', description: '快速查看不同模型和分辨率的成本。', icon: Calculator, section: 'workspace' },
  { id: 'storage-settings', label: '存储设置', description: '切换存储模式并检查本地占用。', icon: HardDrive, section: 'system' },
  { id: 'system-logs', label: '系统日志', description: '排查运行日志和错误信息。', icon: ScrollText, section: 'system' },
  { id: 'admin-system', label: '管理员后台', description: '处理后台配置、权限和系统操作。', icon: Shield, section: 'system' },
];

type DashboardTone = 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'neutral';

type DashboardPriorityItem = {
  id: string;
  tone: DashboardTone;
  title: string;
  description: string;
  actionLabel: string;
  actionView: SettingsView;
};

const dashboardToneStyles: Record<DashboardTone, { iconStyle: React.CSSProperties; meterColor: string }> = {
  indigo: {
    iconStyle: {
      border: '1px solid var(--state-info-border)',
      backgroundColor: 'var(--state-info-bg)',
      color: 'var(--state-info-text)',
    },
    meterColor: 'var(--state-info-text)',
  },
  emerald: {
    iconStyle: {
      border: '1px solid var(--state-success-border)',
      backgroundColor: 'var(--state-success-bg)',
      color: 'var(--state-success-text)',
    },
    meterColor: 'var(--state-success-text)',
  },
  sky: {
    iconStyle: {
      border: '1px solid var(--state-info-border)',
      backgroundColor: 'var(--state-info-bg)',
      color: 'var(--state-info-text)',
    },
    meterColor: 'var(--state-info-text)',
  },
  amber: {
    iconStyle: {
      border: '1px solid var(--state-warning-border)',
      backgroundColor: 'var(--state-warning-bg)',
      color: 'var(--state-warning-text)',
    },
    meterColor: 'var(--state-warning-text)',
  },
  rose: {
    iconStyle: {
      border: '1px solid var(--state-danger-border)',
      backgroundColor: 'var(--state-danger-bg)',
      color: 'var(--state-danger-text)',
    },
    meterColor: 'var(--state-danger-text)',
  },
  slate: {
    iconStyle: {
      border: '1px solid var(--border-light)',
      backgroundColor: 'var(--bg-overlay)',
      color: 'var(--text-secondary)',
    },
    meterColor: 'var(--text-secondary)',
  },
  neutral: {
    iconStyle: {
      border: '1px solid var(--border-light)',
      backgroundColor: 'var(--bg-overlay)',
      color: 'var(--text-secondary)',
    },
    meterColor: 'var(--text-secondary)',
  },
};

const formatMetricNumber = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits }).format(value);

const isSameLocalDay = (value?: string | null) => {
  if (!value) return false;

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;

  const today = new Date();
  return (
    target.getFullYear() === today.getFullYear() &&
    target.getMonth() === today.getMonth() &&
    target.getDate() === today.getDate()
  );
};

const formatDateTime = (value?: string | number | null) => {
  if (!value) return '暂无记录';

  const target = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(target.getTime())) return '暂无记录';

  return target.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStorageModeLabel = (mode: StorageMode | null) => {
  if (mode === 'local') return '本地文档夹';
  if (mode === 'opfs') return '设备私有存储';
  if (mode === 'browser') return '浏览器存储';
  return '未设置';
};

const getSectionLabel = (section: NavSectionId) =>
  navSections.find((item) => item.id === section)?.label || '工作台';

const DashboardInfoCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
  tone: DashboardTone;
}> = ({ icon, title, value, description, tone }) => {
  const toneStyle = dashboardToneStyles[tone];

  return (
    <div className="settings-dashboard-card">
      <div className="settings-dashboard-card__header">
        <div className="settings-dashboard-card__icon" style={toneStyle.iconStyle}>
          {icon}
        </div>
        <SettingsBadge tone={tone} className="settings-dashboard-card__value">
          {value}
        </SettingsBadge>
      </div>
      <div className="settings-dashboard-card__title">{title}</div>
      <div className="settings-dashboard-card__description">{description}</div>
    </div>
  );
};

const DashboardCheckCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  value: string;
  tone: DashboardTone;
  progress?: number;
}> = ({ icon, title, description, value, tone, progress }) => {
  const toneStyle = dashboardToneStyles[tone];

  return (
    <div className="settings-dashboard-card">
      <div className="settings-dashboard-card__header">
        <div className="settings-dashboard-card__icon" style={toneStyle.iconStyle}>
          {icon}
        </div>
        <SettingsBadge tone={tone} className="settings-dashboard-card__value">
          {value}
        </SettingsBadge>
      </div>
      <div className="settings-dashboard-card__title">{title}</div>
      <div className="settings-dashboard-card__description">{description}</div>
      {typeof progress === 'number' ? (
        <div className="settings-dashboard-card__meter">
          <span
            style={{
              width: `${Math.max(0, Math.min(100, progress))}%`,
              backgroundColor: toneStyle.meterColor,
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

const DashboardView: React.FC<{ onNavigate: (view: SettingsView) => void }> = ({ onNavigate }) => {
  const { balance, billingLogs, usageLogs } = useBilling();
  const [stats, setStats] = useState(() => keyManager.getStats());
  const [todayCostUsd, setTodayCostUsd] = useState(() => getTodayCosts().totalCostUsd || 0);
  const [todayTokens, setTodayTokens] = useState(() => getTodayCosts().totalTokens || 0);
  const [officialCount, setOfficialCount] = useState(0);
  const [providerCount, setProviderCount] = useState(0);
  const [activeProviderCount, setActiveProviderCount] = useState(0);
  const [storageMode, setStorageMode] = useState<StorageMode | null>(null);
  const [logs, setLogs] = useState<SystemLogEntry[]>(() => getTodayLogs());

  useEffect(() => {
    let isMounted = true;

    const refresh = async () => {
      const nextStats = keyManager.getStats();
      const allSlots = keyManager.getSlots();
      const providers = keyManager.getProviders();
      const cost = getTodayCosts();
      const nextStorageMode = await getStorageMode();

      const official = allSlots.filter((slot) => {
        if (!slot.key || slot.disabled) return false;
        if (slot.baseUrl) return false;
        if (slot.provider === 'SystemProxy') return false;
        return slot.type === 'official' || slot.provider === 'Google' || slot.provider === 'OpenAI';
      });

      if (!isMounted) return;

      setStats(nextStats);
      setTodayCostUsd(cost.totalCostUsd || 0);
      setTodayTokens(cost.totalTokens || 0);
      setOfficialCount(official.length);
      setProviderCount(providers.length);
      setActiveProviderCount(providers.filter((item) => item.isActive).length);
      setStorageMode(nextStorageMode);
    };

    void refresh();
    const unsubscribe = keyManager.subscribe(() => {
      void refresh();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [billingLogs.length, usageLogs.length]);

  useEffect(() => {
    setLogs(getTodayLogs());
    const unsubscribe = subscribeToLogs((next) => setLogs(next));
    return unsubscribe;
  }, []);

  const keyHealthPercent =
    stats.total > 0 ? Math.max(0, Math.min(100, Math.round((stats.valid / stats.total) * 100))) : 0;

  const todayUsageLogs = useMemo(() => usageLogs.filter((log) => isSameLocalDay(log.created_at)), [usageLogs]);
  const todayRechargeLogs = useMemo(() => billingLogs.filter((log) => isSameLocalDay(log.created_at)), [billingLogs]);
  const importantLogs = useMemo(
    () => logs.filter((item) => item.level === LogLevel.WARNING || item.level === LogLevel.ERROR || item.level === LogLevel.CRITICAL),
    [logs]
  );

  const todayUsageCount = todayUsageLogs.length;
  const todayRechargeCount = todayRechargeLogs.length;
  const importantLogCount = importantLogs.length;
  const latestUsage = todayUsageLogs[0] || usageLogs[0] || null;
  const latestRecharge = todayRechargeLogs[0] || billingLogs[0] || null;
  const latestImportantLogs = importantLogs.slice(-3).reverse();
  const latestLog = latestImportantLogs[0];

  const storageModeLabel = getStorageModeLabel(storageMode);
  const hasCriticalLogs = importantLogs.some((item) => item.level === LogLevel.ERROR || item.level === LogLevel.CRITICAL);
  const hasAvailableRoute = stats.valid > 0 || activeProviderCount > 0;

  const readinessTone: DashboardTone = !hasAvailableRoute
    ? 'rose'
    : hasCriticalLogs || stats.rateLimited > 0 || !storageMode
      ? 'amber'
      : 'emerald';
  const readinessLabel =
    readinessTone === 'emerald' ? '已就绪' : readinessTone === 'amber' ? '需留意' : '待补齐';
  const readinessTitle =
    readinessTone === 'emerald'
      ? '当前设置状态良好'
      : readinessTone === 'amber'
        ? '还有几项配置值得先检查'
        : '开始前建议先补齐关键入口';
  const readinessDescription =
    readinessTone === 'emerald'
      ? '接口、存储和日志状态基本正常，可以直接继续使用。'
      : readinessTone === 'amber'
        ? '链路大体可用，但日志、限流或存储状态可能影响稳定性。'
        : '当前缺少可用链路或基础配置，建议先进入 API 管理补齐。';

  const keyTone: DashboardTone =
    stats.total === 0 || stats.valid === 0 ? 'rose' : stats.invalid > 0 || stats.rateLimited > 0 ? 'amber' : 'emerald';
  const providerTone: DashboardTone =
    providerCount === 0 ? 'slate' : activeProviderCount === 0 ? 'rose' : activeProviderCount < providerCount ? 'amber' : 'emerald';
  const logTone: DashboardTone = hasCriticalLogs ? 'rose' : importantLogCount > 0 ? 'amber' : 'emerald';
  const storageTone: DashboardTone = storageMode ? (storageMode === 'browser' ? 'sky' : 'emerald') : 'amber';

  const priorityItems: DashboardPriorityItem[] = [];

  if (!hasAvailableRoute) {
    priorityItems.push({
      id: 'missing-route',
      tone: 'rose',
      title: '没有可继续生成的主链路',
      description: '当前既没有可用密钥，也没有在线供应商。建议优先去 API 管理补齐接口来源。',
      actionLabel: '前往 API 管理',
      actionView: 'api-management',
    });
  }

  if (stats.rateLimited > 0) {
    priorityItems.push({
      id: 'rate-limited',
      tone: 'amber',
      title: `${stats.rateLimited} 个密钥处于限流冷却`,
      description: '继续高频调用会影响稳定性，建议先检查接口配额，或者补充备用通道。',
      actionLabel: '检查接口状态',
      actionView: 'api-management',
    });
  }

  if (importantLogCount > 0) {
    priorityItems.push({
      id: 'important-logs',
      tone: hasCriticalLogs ? 'rose' : 'amber',
      title: `${importantLogCount} 条重要日志待处理`,
      description: latestLog?.message || '建议先查看系统日志，确认有没有会影响生成的错误或警告。',
      actionLabel: '查看系统日志',
      actionView: 'system-logs',
    });
  }

  if (!storageMode) {
    priorityItems.push({
      id: 'storage-mode',
      tone: 'amber',
      title: '图片存储方式还没明确',
      description: '建议尽快确认存储位置，后续排查图片缺失、迁移或清缓存会更简单。',
      actionLabel: '打开存储设置',
      actionView: 'storage-settings',
    });
  }

  const overviewRows = [
    {
      key: 'balance',
      icon: <DollarSign size={16} />,
      title: '账户余额',
      value: formatMetricNumber(balance, Number.isInteger(balance) ? 0 : 2),
      description: latestRecharge ? `最近充值：${formatDateTime(latestRecharge.created_at)}` : '今天还没有新的充值记录',
      tone: 'emerald' as DashboardTone,
    },
    {
      key: 'cost',
      icon: <Activity size={16} />,
      title: '今日成本',
      value: `$${todayCostUsd.toFixed(2)}`,
      description: `Tokens ${formatMetricNumber(todayTokens)}，生成 ${formatMetricNumber(todayUsageCount)} 次`,
      tone: 'amber' as DashboardTone,
    },
    {
      key: 'routes',
      icon: <Key size={16} />,
      title: '接口接入',
      value: `${officialCount + providerCount} 个入口`,
      description:
        providerCount > 0
          ? `官方 ${officialCount} 个，第三方 ${providerCount} 个，在线 ${activeProviderCount} 个`
          : `当前主要依赖官方接口，已识别 ${officialCount} 个入口`,
      tone: 'indigo' as DashboardTone,
    },
    {
      key: 'storage',
      icon: <HardDrive size={16} />,
      title: '存储方式',
      value: storageModeLabel,
      description: storageMode ? '图片保存位置已经明确。' : '建议先确认图片保存位置。',
      tone: storageTone,
    },
  ];

  const recentRows = [
    {
      key: 'generation',
      icon: <RefreshCw size={16} />,
      title: '最近一条生成',
      value: latestUsage?.model_name || latestUsage?.model_id || latestUsage?.description || '今天暂无生成记录',
      description: latestUsage
        ? `${formatDateTime(latestUsage.created_at)} · ${latestUsage.type === 'consumption' ? '生成扣费' : latestUsage.type}`
        : '完成一次生成后，这里会显示最近一条记录。',
      tone: 'indigo' as DashboardTone,
    },
    {
      key: 'recharge',
      icon: <DollarSign size={16} />,
      title: '充值与余额',
      value: todayRechargeCount > 0 ? `今天新增 ${todayRechargeCount} 条` : '今天没有新增充值',
      description: latestRecharge
        ? `最近充值时间：${formatDateTime(latestRecharge.created_at)}`
        : `当前余额 ${formatMetricNumber(balance, Number.isInteger(balance) ? 0 : 2)}`,
      tone: 'emerald' as DashboardTone,
    },
    {
      key: 'logs',
      icon: <ScrollText size={16} />,
      title: '系统反馈',
      value: importantLogCount > 0 ? `${importantLogCount} 条待看` : '暂无异常日志',
      description: latestLog
        ? `${formatDateTime(latestLog.timestamp)} · ${latestLog.message}`
        : '如果后续出现告警或错误，这里会优先显示。',
      tone: logTone,
    },
  ];

  return (
    <SettingsViewShell>
      <SettingsSection
        title="当前状态"
        description={readinessDescription}
        action={<SettingsBadge tone={readinessTone}>{readinessLabel}</SettingsBadge>}
      >
        <div className="settings-dashboard-banner">
          <div className="settings-dashboard-banner__title">{readinessTitle}</div>
          <div className="settings-dashboard-banner__actions">
            <SettingsActionButton icon={Key} tone="primary" size="sm" onClick={() => onNavigate('api-management')}>
              API 管理
            </SettingsActionButton>
            <SettingsActionButton icon={ScrollText} size="sm" onClick={() => onNavigate('system-logs')}>
              系统日志
            </SettingsActionButton>
            <SettingsActionButton icon={HardDrive} size="sm" onClick={() => onNavigate('storage-settings')}>
              存储设置
            </SettingsActionButton>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="概览"
        description="只保留今天最关键的四项状态，用统一卡片收紧信息密度。"
      >
        <div className="settings-dashboard-grid">
          {overviewRows.map((row) => (
            <DashboardInfoCard
              key={row.key}
              icon={row.icon}
              title={row.title}
              value={row.value}
              description={row.description}
              tone={row.tone}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="需要处理"
        description="真正影响继续工作的事项只放这里。"
        action={
          <SettingsBadge tone={priorityItems.length > 0 ? 'amber' : 'emerald'}>
            {priorityItems.length > 0 ? `${priorityItems.length} 项待处理` : '当前稳定'}
          </SettingsBadge>
        }
      >
        {priorityItems.length === 0 ? (
          <div className="settings-dashboard-quiet" style={SETTINGS_SUCCESS_STYLE}>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              当前没有必须立刻处理的问题
            </div>
            <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
              可以继续使用，也可以去 API 管理、价格估算和存储设置做进一步微调。
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {priorityItems.map((item) => (
              <div key={item.id} className="settings-dashboard-priority">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {item.title}
                    </div>
                    <SettingsBadge tone={item.tone}>{item.actionLabel}</SettingsBadge>
                  </div>
                  <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                    {item.description}
                  </div>
                </div>
                <SettingsActionButton size="sm" onClick={() => onNavigate(item.actionView)}>
                  处理
                </SettingsActionButton>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SettingsSection
          title="最近变化"
          description="只看最近一次生成、充值和系统反馈。"
          action={
            <SettingsBadge tone={todayUsageCount > 0 || todayRechargeCount > 0 ? 'indigo' : 'neutral'}>
              {todayUsageCount > 0 || todayRechargeCount > 0 ? '有新变化' : '暂无新变化'}
            </SettingsBadge>
          }
        >
          <div className="settings-dashboard-grid settings-dashboard-grid--stacked">
            {recentRows.map((row) => (
              <DashboardInfoCard
                key={row.key}
                icon={row.icon}
                title={row.title}
                value={row.value}
                description={row.description}
                tone={row.tone}
              />
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          title="健康检查"
          description="快速确认接口、供应商、存储和日志状态。"
        >
          <div className="settings-dashboard-grid">
            <DashboardCheckCard
              icon={<Key size={16} />}
              title="密钥池健康"
              description={
                stats.total > 0
                  ? `有效 ${stats.valid} / 总计 ${stats.total}，限流 ${stats.rateLimited}，失效 ${stats.invalid}`
                  : '当前还没有可统计的密钥，建议先补齐至少一个可调度入口。'
              }
              value={stats.total > 0 ? `${keyHealthPercent}%` : '未配置'}
              tone={keyTone}
              progress={stats.total > 0 ? keyHealthPercent : undefined}
            />
            <DashboardCheckCard
              icon={<LayoutDashboard size={16} />}
              title="供应商连通"
              description={
                providerCount > 0
                  ? `在线 ${activeProviderCount} / ${providerCount}，第三方通道越完整，越适合长期工作。`
                  : officialCount > 0
                    ? '当前没有启用第三方供应商，主要使用官方接口。'
                    : '还没有任何供应商或官方接口入口。'
              }
              value={providerCount > 0 ? `${activeProviderCount}/${providerCount}` : '未接入'}
              tone={providerTone}
              progress={providerCount > 0 ? Math.round((activeProviderCount / providerCount) * 100) : undefined}
            />
            <DashboardCheckCard
              icon={<HardDrive size={16} />}
              title="存储状态"
              description={
                storageMode
                  ? '图片存储位置已经明确，后续清理和迁移会更直接。'
                  : '存储方式未明确时，后续排查成本会更高。'
              }
              value={storageModeLabel}
              tone={storageTone}
            />
            <DashboardCheckCard
              icon={<Activity size={16} />}
              title="日志风险"
              description={
                importantLogCount > 0
                  ? '今天有告警或错误，建议尽快检查。'
                  : '今天没有新的警告或错误。'
              }
              value={importantLogCount > 0 ? `${importantLogCount} 条` : '正常'}
              tone={logTone}
            />
          </div>
        </SettingsSection>
      </div>

      <SettingsSection
        title="重点日志"
        description="只展示最近几条告警和错误。"
        action={
          importantLogCount > 0 ? (
            <SettingsActionButton size="sm" icon={ScrollText} onClick={() => onNavigate('system-logs')}>
              查看全部
            </SettingsActionButton>
          ) : undefined
        }
      >
        {latestImportantLogs.length === 0 ? (
          <div className="settings-dashboard-quiet" style={SETTINGS_ELEVATED_STYLE}>
            <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              今日暂无需要优先关注的告警或错误。
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {latestImportantLogs.map((log) => {
              const tone: DashboardTone =
                log.level === LogLevel.ERROR || log.level === LogLevel.CRITICAL ? 'rose' : 'amber';
              const detailPreview = log.details.split('\n').find((line) => line.trim()) || log.details;

              return (
                <div key={log.id} className="settings-dashboard-log">
                  <div className="flex flex-wrap items-center gap-2">
                    <SettingsBadge tone={tone}>{log.level}</SettingsBadge>
                    <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDateTime(log.timestamp)}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      来源：{log.source}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-medium leading-6" style={{ color: 'var(--text-primary)' }}>
                    {log.message}
                  </div>
                  <div className="mt-1 text-xs leading-5" style={{ color: 'var(--text-tertiary)' }}>
                    {detailPreview}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingsSection>
    </SettingsViewShell>
  );
};

const StorageSettingsView: React.FC = () => {
  const {
    connectLocalFolder,
    disconnectLocalFolder,
    isConnectedToLocal,
    state,
    activeCanvas,
    mergeCanvasInto,
    cleanupInvalidCards,
  } = useCanvas();

  const [mode, setMode] = useState<StorageMode | null>(null);
  const [usageMB, setUsageMB] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [switchingMode, setSwitchingMode] = useState<'local' | 'browser' | null>(null);
  const [cleanupType, setCleanupType] = useState<'compress' | number | null>(null);
  const [projectAction, setProjectAction] = useState<'merge' | 'cleanup' | null>(null);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [lastActionMessage, setLastActionMessage] = useState('最近一次状态读取尚未执行。');

  const supportsLocal = isFileSystemAccessSupported();
  const isBusy = refreshing || switchingMode !== null || cleanupType !== null;
  const cleanupOptions = [
    { label: '清理 1 天前缓存', days: 1 },
    { label: '清理 7 天前缓存', days: 7 },
    { label: '清理 30 天前缓存', days: 30 },
  ] as const;
  const mergeCandidates = state.canvases.filter((canvas) => canvas.id !== activeCanvas?.id);

  const formatSavedSpace = (savedBytes: number) => `${(savedBytes / (1024 * 1024)).toFixed(2)} MB`;

  useEffect(() => {
    setMergeSourceId((current) => {
      if (current && mergeCandidates.some((canvas) => canvas.id === current)) {
        return current;
      }
      return mergeCandidates[0]?.id || '';
    });
  }, [mergeCandidates]);

  const refresh = async () => {
    setRefreshing(true);
    setLastActionMessage('正在重新读取存储状态...');
    try {
      const [storedMode, usageBytes, ids] = await Promise.all([
        getStorageMode(),
        getStorageUsage(),
        getAllImageIds(),
      ]);

      setMode(storedMode);
      setUsageMB(usageBytes / (1024 * 1024));
      setImageCount(ids.length);
      setLastActionMessage(`状态已刷新：共 ${ids.length} 张图片，占用 ${(usageBytes / (1024 * 1024)).toFixed(2)} MB。`);
    } catch (error) {
      console.error('[StorageSettingsView] 刷新失败:', error);
      setLastActionMessage('刷新失败，请稍后重试。');
      notify.error('刷新失败', '当前状态暂时无法读取，请稍后再试。');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const switchToLocal = async () => {
    if (!supportsLocal) {
      notify.error('当前浏览器不支持', '请改用最新版 Chrome 或 Edge。');
      return;
    }

    setSwitchingMode('local');
    setLastActionMessage('正在切换到本地文档夹存储...');
    try {
      await connectLocalFolder();
      const handle = await getLocalFolderHandle();
      if (!handle) {
        notify.warning('未完成授权', '请先选择并授权本地文档夹。');
        setLastActionMessage('本地目录授权未完成。');
        return;
      }

      const ok = await setStorageMode('local');
      if (!ok) {
        notify.error('切换失败', '本地文档夹模式保存失败，请重试。');
        setLastActionMessage('切换到本地文档夹失败。');
        return;
      }

      notify.success('切换成功', '已切换为本地文档夹存储。');
      await refresh();
    } catch (error) {
      notify.error('切换失败', '本地文档夹连接失败，请重试。');
      console.error('[StorageSettingsView] 切换本地模式失败:', error);
      setLastActionMessage('切换到本地文档夹失败。');
    } finally {
      setSwitchingMode(null);
    }
  };

  const switchToBrowser = async () => {
    setSwitchingMode('browser');
    setLastActionMessage('正在切换到浏览器存储...');
    try {
      await disconnectLocalFolder();
      const ok = await setStorageMode('browser');
      if (!ok) {
        notify.error('切换失败', '浏览器存储模式保存失败，请重试。');
        setLastActionMessage('切换到浏览器存储失败。');
        return;
      }

      notify.success('切换成功', '已切换为浏览器存储。');
      await refresh();
    } catch (error) {
      notify.error('切换失败', '浏览器存储切换失败，请重试。');
      console.error('[StorageSettingsView] 切换浏览器模式失败:', error);
      setLastActionMessage('切换到浏览器存储失败。');
    } finally {
      setSwitchingMode(null);
    }
  };

  const handleCleanup = async () => {
    setCleanupType('compress');
    setLastActionMessage('正在压缩并清理原图缓存...');
    try {
      const result = await cleanupOriginals();
      const summary = `共处理 ${result.count} 条缓存，预计释放 ${formatSavedSpace(result.savedBytes)}。`;
      notify.success('清理完成', summary);
      setLastActionMessage(summary);
      await refresh();
    } catch (error) {
      notify.error('清理失败', '请稍后重试。');
      console.error('[StorageSettingsView] 清理失败:', error);
      setLastActionMessage('原图缓存清理失败。');
    } finally {
      setCleanupType(null);
    }
  };

  const handleCleanupByAge = async (days: number) => {
    setCleanupType(days);
    setLastActionMessage(`正在清理 ${days} 天前的缓存图片...`);
    try {
      const result = await cleanupImagesOlderThan(days);
      const summary =
        result.count > 0
          ? `已清理 ${days} 天前的 ${result.count} 条缓存，预计释放 ${formatSavedSpace(result.savedBytes)}。`
          : `没有找到 ${days} 天前可清理的缓存图片。`;
      notify.success('按时间清理完成', summary);
      setLastActionMessage(summary);
      await refresh();
    } catch (error) {
      notify.error('按时间清理失败', '请稍后重试。');
      console.error('[StorageSettingsView] 按时间清理失败:', error);
      setLastActionMessage(`清理 ${days} 天前缓存失败。`);
    } finally {
      setCleanupType(null);
    }
  };

  const handleMergeProject = async () => {
    if (!activeCanvas || !mergeSourceId) {
      notify.warning('请选择项目', '先选一个要合并进当前画布的项目。');
      return;
    }

    const sourceCanvas = mergeCandidates.find((canvas) => canvas.id === mergeSourceId);
    if (!sourceCanvas) {
      notify.warning('项目不存在', '目标项目列表已变化，请重新选择。');
      return;
    }

    setProjectAction('merge');
    setLastActionMessage(`正在把“${sourceCanvas.name}”合并到“${activeCanvas.name}”...`);
    try {
      const result = mergeCanvasInto(sourceCanvas.id, activeCanvas.id, { deleteSource: true });
      const summary = `已合并 ${result.movedPrompts} 张主卡和 ${result.movedImages} 张子卡到“${activeCanvas.name}”。`;
      notify.success('项目合并完成', summary);
      setLastActionMessage(summary);
    } catch (error) {
      console.error('[StorageSettingsView] 项目合并失败:', error);
      notify.error('项目合并失败', '请稍后重试。');
      setLastActionMessage('项目合并失败。');
    } finally {
      setProjectAction(null);
    }
  };

  const handleCleanupProjectCards = async () => {
    if (!activeCanvas) {
      notify.warning('没有活动项目', '请先打开一个项目再执行清理。');
      return;
    }

    setProjectAction('cleanup');
    setLastActionMessage(`正在清理“${activeCanvas.name}”中的错误卡片...`);
    try {
      const result = cleanupInvalidCards(activeCanvas.id);
      const summary =
        result.removedPrompts === 0 && result.removedImages === 0 && result.removedGroups === 0
          ? `“${activeCanvas.name}”里没有发现需要清理的错误卡片。`
          : `已清理 ${result.removedPrompts} 张主卡、${result.removedImages} 张子卡，并移除 ${result.removedGroups} 个空分组。`;
      notify.success('项目整理完成', summary);
      setLastActionMessage(summary);
    } catch (error) {
      console.error('[StorageSettingsView] 错误卡片清理失败:', error);
      notify.error('错误卡片清理失败', '请稍后重试。');
      setLastActionMessage('错误卡片清理失败。');
    } finally {
      setProjectAction(null);
    }
  };

  const modeLabel =
    mode === 'local' ? '本地文档夹' : mode === 'browser' ? '浏览器存储' : '未设置';
  const modeTone = mode === 'local' ? 'emerald' : mode === 'browser' ? 'sky' : 'neutral';
  const localStateTone = isConnectedToLocal ? 'emerald' : 'amber';

  return (
    <SettingsViewShell>
      <SettingsHero
        tone="sky"
        icon={HardDrive}
        eyebrow="STORAGE CONTROL"
        title="存储设置"
        description="统一管理图片保存位置、本地目录连接和缓存维护。"
        badge={<SettingsBadge tone={modeTone}>{modeLabel}</SettingsBadge>}
        actions={
          <SettingsActionButton icon={RefreshCw} loading={refreshing} onClick={() => void refresh()} disabled={isBusy}>
            {refreshing ? '正在刷新...' : '刷新状态'}
          </SettingsActionButton>
        }
        metrics={
          <>
            <SettingsMetricCard
              label="当前存储方式"
              value={modeLabel}
              helper={mode === 'local' ? '适合长期归档和项目交付。' : '适合快速试用和轻量工作流。'}
              icon={HardDrive}
              tone={modeTone}
            />
            <SettingsMetricCard
              label="本地连接状态"
              value={mode === 'local' ? (isConnectedToLocal ? '已连接' : '等待连接') : '未启用'}
              helper={supportsLocal ? 'Chrome / Edge 可直接选择本地目录。' : '当前浏览器暂不支持文件系统访问。'}
              icon={RefreshCw}
              tone={localStateTone}
            />
            <SettingsMetricCard
              label="已存图片数量"
              value={`${imageCount} 张`}
              helper="统计当前存储空间内可识别的图片记录。"
              icon={Activity}
              tone="indigo"
            />
            <SettingsMetricCard
              label="占用空间"
              value={`${usageMB.toFixed(2)} MB`}
              helper={usageMB > 512 ? '占用偏高，建议定期清理原图缓存。' : '容量处于可控范围。'}
              icon={Trash2}
              tone={usageMB > 512 ? 'amber' : 'neutral'}
            />
          </>
        }
      />

      <SettingsSection
        eyebrow="MODE SWITCH"
        title="存储策略"
        description="长期生产推荐本地文档夹，临时体验可保留浏览器存储。"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <div
            className="rounded-2xl border p-5"
            style={mode === 'local' ? (isConnectedToLocal ? SETTINGS_SUCCESS_STYLE : SETTINGS_WARNING_STYLE) : SETTINGS_ELEVATED_STYLE}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  本地文档夹存储
                </div>
                <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                  生成结果直接写入你选定的本地目录，更适合长期留存、素材整理和跨浏览器访问。
                </p>
              </div>
              <SettingsBadge tone={mode === 'local' ? localStateTone : 'neutral'}>
                {mode === 'local' ? (isConnectedToLocal ? '当前启用' : '等待连接') : '可切换'}
              </SettingsBadge>
            </div>

            <div className="mt-4 space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              <div>适合归档原图、项目交付和本地备份。</div>
              <div>首次切换会请求目录授权，后续可持续使用同一目录。</div>
              <div>当前状态：{isConnectedToLocal ? '目录已连接，可直接写入。' : '目录未连接，切换时会重新请求授权。'}</div>
            </div>

            <div className="mt-5">
              <SettingsActionButton
                icon={HardDrive}
                tone={mode === 'local' ? 'secondary' : 'primary'}
                onClick={() => void switchToLocal()}
                disabled={isBusy || !supportsLocal || (mode === 'local' && isConnectedToLocal)}
              >
                {switchingMode === 'local' ? '正在切换...' : mode === 'local' ? '当前已启用本地模式' : '切换到本地文档夹'}
              </SettingsActionButton>
            </div>
          </div>

          <div
            className="rounded-2xl border p-5"
            style={mode === 'browser' ? SETTINGS_SUCCESS_STYLE : SETTINGS_ELEVATED_STYLE}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  浏览器存储
                </div>
                <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                  无需额外授权，适合演示、试跑和轻量操作，但数据会跟随当前浏览器环境。
                </p>
              </div>
              <SettingsBadge tone={mode === 'browser' ? 'sky' : 'neutral'}>
                {mode === 'browser' ? '当前启用' : '快速开始'}
              </SettingsBadge>
            </div>

            <div className="mt-4 space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              <div>零配置即可使用，适合临时任务和未授权目录的场景。</div>
              <div>清缓存、换设备或换浏览器后，历史图片可能无法保留。</div>
              <div>当前状态：{mode === 'browser' ? '正在使用浏览器本地空间。' : '可作为无需授权的备用方案。'}</div>
            </div>

            <div className="mt-5">
              <SettingsActionButton
                icon={RefreshCw}
                tone={mode === 'browser' ? 'secondary' : 'primary'}
                onClick={() => void switchToBrowser()}
                disabled={isBusy || mode === 'browser'}
              >
                {switchingMode === 'browser' ? '正在切换...' : mode === 'browser' ? '当前已启用浏览器存储' : '切换到浏览器存储'}
              </SettingsActionButton>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="MAINTENANCE"
        title="维护与清理"
        description="支持立即刷新、压缩原图缓存，以及按 1 / 7 / 30 天清理旧缓存。"
        action={<SettingsBadge tone={usageMB > 512 ? 'amber' : 'neutral'}>{usageMB > 512 ? '建议清理缓存' : '状态稳定'}</SettingsBadge>}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
          <div className="rounded-2xl border p-5" style={SETTINGS_ELEVATED_STYLE}>
            <div className="space-y-2">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                当前维护动作
              </div>
              <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                刷新会同步模式、图片数量和空间占用；清理缓存则用于释放原图占用，适合在长期使用后定期执行。
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <SettingsActionButton icon={RefreshCw} loading={refreshing} onClick={() => void refresh()} disabled={isBusy}>
                {refreshing ? '正在读取...' : '重新读取统计'}
              </SettingsActionButton>
              <SettingsActionButton
                icon={Trash2}
                tone="danger"
                onClick={() => void handleCleanup()}
                disabled={isBusy}
                loading={cleanupType === 'compress'}
              >
                {cleanupType === 'compress' ? '正在清理...' : '压缩原图缓存'}
              </SettingsActionButton>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {cleanupOptions.map((option) => (
                <SettingsActionButton
                  key={option.days}
                  size="sm"
                  tone="secondary"
                  icon={Trash2}
                  onClick={() => void handleCleanupByAge(option.days)}
                  disabled={isBusy}
                  loading={cleanupType === option.days}
                >
                  {cleanupType === option.days ? `清理 ${option.days} 天前...` : option.label}
                </SettingsActionButton>
              ))}
            </div>

            <div
              className="mt-4 rounded-2xl border px-4 py-3 text-sm leading-6"
              style={refreshing || cleanupType !== null ? SETTINGS_WARNING_STYLE : SETTINGS_PANEL_STYLE}
            >
              {lastActionMessage}
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={supportsLocal ? SETTINGS_PANEL_STYLE : SETTINGS_WARNING_STYLE}>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              使用建议
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              <div>长期生产环境优先使用本地文档夹，避免浏览器数据清理后图片丢失。</div>
              <div>浏览器存储更适合临时调试、移动设备体验或尚未授权目录时使用。</div>
              <div>按时间清理会删除旧缓存图片，建议先合并需要保留的画布项目后再做清理。</div>
              <div>{supportsLocal ? '当前环境支持本地目录接入。' : '当前环境不支持本地目录接入，请使用 Chrome 或 Edge。'}</div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="PROJECT MAINTENANCE"
        title="画布项目整理"
        description="把多个项目合并到当前画布，并清理当前项目里的错误卡片和空分组。"
        action={<SettingsBadge tone={mergeCandidates.length > 0 ? 'sky' : 'neutral'}>{activeCanvas ? `当前项目：${activeCanvas.name}` : '暂无活动项目'}</SettingsBadge>}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
          <div className="rounded-2xl border p-5" style={SETTINGS_ELEVATED_STYLE}>
            <div className="space-y-2">
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                合并项目
              </div>
              <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                选择一个旧项目，把它的卡片整体并入当前画布。合并后旧项目会自动删除，方便把内容集中到一个画布继续整理。
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <select
                value={mergeSourceId}
                onChange={(event) => setMergeSourceId(event.target.value)}
                className={SETTINGS_INPUT_CLASSNAME}
                disabled={projectAction !== null || mergeCandidates.length === 0}
              >
                {mergeCandidates.length === 0 ? (
                  <option value="">没有可合并的其他项目</option>
                ) : (
                  mergeCandidates.map((canvas) => (
                    <option key={canvas.id} value={canvas.id}>
                      {canvas.name} · {canvas.promptNodes.length} 主卡 / {canvas.imageNodes.length} 子卡
                    </option>
                  ))
                )}
              </select>

              <SettingsActionButton
                icon={Activity}
                tone="primary"
                onClick={() => void handleMergeProject()}
                disabled={projectAction !== null || mergeCandidates.length === 0 || !mergeSourceId}
                loading={projectAction === 'merge'}
              >
                {projectAction === 'merge' ? '正在合并...' : '合并到当前画布'}
              </SettingsActionButton>
            </div>

            <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--border-light)' }}>
              <div className="space-y-2">
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  清理错误卡片
                </div>
                <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                  自动清掉失败卡、空卡、失效关联子卡，以及已经没有节点的空分组。
                </p>
              </div>

              <div className="mt-4">
                <SettingsActionButton
                  icon={Trash2}
                  tone="danger"
                  onClick={() => void handleCleanupProjectCards()}
                  disabled={projectAction !== null || !activeCanvas}
                  loading={projectAction === 'cleanup'}
                >
                  {projectAction === 'cleanup' ? '正在清理...' : '清理当前项目错误卡片'}
                </SettingsActionButton>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-5" style={SETTINGS_PANEL_STYLE}>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              当前整理建议
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              <div>当前共有 {state.canvases.length} 个项目，建议把已完成或零散项目合并到一个主画布中。</div>
              <div>{mergeCandidates.length > 0 ? `还有 ${mergeCandidates.length} 个项目可合并。` : '当前没有其他项目可合并。'}</div>
              <div>{activeCanvas ? `你正在整理“${activeCanvas.name}”。` : '当前还没有活动项目。'}</div>
              <div>先合并项目，再按时间清理旧缓存，能更稳妥地避免误删还要继续用的素材。</div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </SettingsViewShell>
  );
};

const SystemLogsView: React.FC = () => {
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);

  useEffect(() => {
    setLogs(getTodayLogs());
    const unsubscribe = subscribeToLogs((next) => setLogs(next));
    return unsubscribe;
  }, []);

  const importantLogs = useMemo(
    () => logs.filter((item) => item.level === LogLevel.WARNING || item.level === LogLevel.ERROR || item.level === LogLevel.CRITICAL),
    [logs]
  );
  const errorLogs = useMemo(
    () => logs.filter((item) => item.level === LogLevel.ERROR || item.level === LogLevel.CRITICAL),
    [logs]
  );
  const latestLog = useMemo(
    () =>
      logs.reduce<SystemLogEntry | null>((latest, entry) => {
        if (!latest) return entry;
        return new Date(entry.timestamp).getTime() > new Date(latest.timestamp).getTime() ? entry : latest;
      }, null),
    [logs]
  );
  const sourceCount = useMemo(() => new Set(logs.map((item) => item.source)).size, [logs]);

  const handleExport = async () => {
    try {
      const text = exportLogsForAI();
      await writeTextToClipboard(text);
      notify.success('导出成功', '系统日志已复制到剪贴板。');
    } catch (error) {
      console.error('[SystemLogsView] 导出失败:', error);
      notify.error('导出失败', '当前环境无法写入剪贴板，请稍后重试。');
    }
  };

  const handleClear = () => {
    clearLogs();
    notify.success('已清空', '今日系统日志已清空。');
  };

  const formatLogTime = (timestamp?: string | number) =>
    timestamp ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false }) : '暂无记录';

  const getLogTone = (level: LogLevel) => {
    if (level === LogLevel.CRITICAL || level === LogLevel.ERROR) return 'rose';
    if (level === LogLevel.WARNING) return 'amber';
    return 'neutral';
  };

  return (
    <SettingsViewShell>
      <SettingsHero
        tone={importantLogs.length > 0 ? 'amber' : 'emerald'}
        icon={ScrollText}
        eyebrow="LOG CENTER"
        title="系统日志"
        description="集中查看今天的重要告警、错误和关键运行信息。"
        badge={
          <SettingsBadge tone={importantLogs.length > 0 ? 'amber' : 'emerald'}>
            {importantLogs.length > 0 ? `${importantLogs.length} 条重点事件` : '运行平稳'}
          </SettingsBadge>
        }
        actions={
          <>
            <SettingsActionButton icon={ScrollText} onClick={() => void handleExport()}>
              导出日志
            </SettingsActionButton>
            <SettingsActionButton icon={Trash2} tone="danger" onClick={handleClear}>
              清空日志
            </SettingsActionButton>
          </>
        }
        metrics={
          <>
            <SettingsMetricCard
              label="今日总日志数"
              value={`${logs.length} 条`}
              helper="包含普通运行记录与重点事件。"
              icon={ScrollText}
              tone="sky"
            />
            <SettingsMetricCard
              label="重点事件"
              value={`${importantLogs.length} 条`}
              helper="显示 Warning、Error、Critical。"
              icon={Activity}
              tone={importantLogs.length > 0 ? 'amber' : 'emerald'}
            />
            <SettingsMetricCard
              label="错误与严重错误"
              value={`${errorLogs.length} 条`}
              helper={errorLogs.length > 0 ? '建议优先排查最新一条。' : '当前未发现错误级事件。'}
              icon={Shield}
              tone={errorLogs.length > 0 ? 'rose' : 'neutral'}
            />
            <SettingsMetricCard
              label="最近更新时间"
              value={formatLogTime(latestLog?.timestamp)}
              helper={sourceCount > 0 ? `来自 ${sourceCount} 个日志来源。` : '今日尚未产生系统日志。'}
              icon={RefreshCw}
              tone="indigo"
            />
          </>
        }
      />

      <SettingsSection
        eyebrow="FOCUS EVENTS"
        title="重点事件列表"
        description="只保留需要人工关注的警告和错误。"
        action={<SettingsBadge tone="neutral">仅展示 Warning 及以上</SettingsBadge>}
      >
        {importantLogs.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed px-5 py-10 text-center"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
          >
            今日暂无重要日志，当前系统状态稳定。
          </div>
        ) : (
          <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
            {importantLogs
              .slice()
              .reverse()
              .map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border p-4"
                  style={log.level === LogLevel.ERROR || log.level === LogLevel.CRITICAL ? SETTINGS_DANGER_STYLE : SETTINGS_ELEVATED_STYLE}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{formatLogTime(log.timestamp)}</span>
                    <SettingsBadge tone={getLogTone(log.level)} className="px-2 py-0.5">
                      {log.level}
                    </SettingsBadge>
                    <span>来源：{log.source}</span>
                  </div>
                  <div className="mt-3 text-sm font-medium leading-6" style={{ color: 'var(--text-primary)' }}>
                    {log.message}
                  </div>
                  {log.details ? (
                    <pre className="mt-3 whitespace-pre-wrap break-all rounded-xl border p-3 text-xs leading-5" style={SETTINGS_PANEL_STYLE}>
                      {log.details}
                    </pre>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </SettingsSection>
    </SettingsViewShell>
  );
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  initialView = 'dashboard',
  initialSupplier = null,
}) => {
  const [activeView, setActiveView] = useState<SettingsView>(initialView);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const [navQuery, setNavQuery] = useState('');
  const activeNavItem = useMemo(() => navItems.find((item) => item.id === activeView) || navItems[0], [activeView]);
  const filteredNavItems = useMemo(() => {
    const keyword = navQuery.trim().toLowerCase();
    if (!keyword) return navItems;

    return navItems.filter((item) => {
      const haystack = `${item.label} ${item.description} ${getSectionLabel(item.section)}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [navQuery]);
  const groupedNavItems = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: filteredNavItems.filter((item) => item.section === section.id),
        }))
        .filter((section) => section.items.length > 0),
    [filteredNavItems]
  );
  const activeSectionLabel = getSectionLabel(activeNavItem.section);

  useEffect(() => {
    if (isOpen) {
      setActiveView(initialView);
      setNavQuery('');
    }
  }, [initialView, isOpen]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const lazyFallback = (
    <div className="flex min-h-[280px] items-center justify-center">
      <div className="settings-shell-loading-card">
        <div className="settings-shell-kicker">Loading</div>
        <div className="mt-2 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          正在加载设置内容
        </div>
        <div className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          当前模块会在准备完成后显示。
        </div>
      </div>
    </div>
  );

  const renderBody = () => {
    if (activeView === 'dashboard') return <DashboardView onNavigate={setActiveView} />;
    if (activeView === 'api-management') {
      return (
        <Suspense fallback={lazyFallback}>
          <ApiSettingsView key={initialSupplier?.id || 'default-api-management'} initialSupplier={initialSupplier} />
        </Suspense>
      );
    }
    if (activeView === 'cost-estimation') {
      return (
        <Suspense fallback={lazyFallback}>
          <CostEstimation embedded />
        </Suspense>
      );
    }
    if (activeView === 'storage-settings') return <StorageSettingsView />;
    if (activeView === 'system-logs') return <SystemLogsView />;
    return (
      <Suspense fallback={lazyFallback}>
        <AdminSystem />
      </Suspense>
    );
  };

  return (
    <div
      className={`settings-panel settings-shell-backdrop fixed inset-0 z-[10001] flex justify-center ${isMobile ? 'items-end px-2 pb-0 pt-8' : 'items-center px-3 py-3'}`}
      onClick={onClose}
    >
      {isMobile ? (
        <div
          className="settings-panel apple-glass-card settings-shell-mobile flex h-[min(100dvh,100svh)] max-h-[min(100dvh,100svh)] w-full flex-col overflow-hidden rounded-t-[30px] rounded-b-none ios-mobile-sheet shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="settings-shell-mobile__handle">
            <span />
          </div>

          <div className="settings-shell-mobile__topbar">
            <div className="settings-shell-mobile__title-wrap">
              <div className="settings-shell-kicker">Settings</div>
              <div className="mt-2 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                高级设置
              </div>
              <div className="mt-1 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                统一管理接口、费用、存储和系统维护。
              </div>
            </div>
            <button
              onClick={onClose}
              className="apple-icon-button h-10 w-10 shrink-0 rounded-2xl"
            >
              <X size={16} />
            </button>
          </div>

          <aside className="settings-shell-mobile__tabs">
            <div className="settings-shell-mobile__tab-list flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={`apple-pill-button settings-shell-mobile__tab min-w-[96px] shrink-0 justify-center px-3 py-3 sm:min-w-[106px] ${active ? 'active' : ''}`}
                  >
                    <Icon size={15} />
                    <span className="text-[11px] leading-none">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="settings-shell-main min-h-0 flex-1 overflow-hidden">
            <main className="settings-shell-page settings-shell-page--mobile h-full overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-4">
              {renderBody()}
            </main>
          </section>
        </div>
      ) : (
        <div
          className="settings-shell-desktop flex h-[88vh] max-h-[960px] w-full max-w-[1280px] items-stretch gap-5"
          onClick={(e) => e.stopPropagation()}
        >
          <aside className="w-[292px] flex-shrink-0">
            <div className="settings-panel apple-glass-card settings-shell-nav flex h-full flex-col rounded-[32px] p-4 shadow-2xl">
              <div className="settings-shell-nav__title">
                <div className="settings-shell-kicker">Settings</div>
                <div className="mt-1.5 text-[22px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                  高级设置
                </div>
              </div>

              <label className="settings-shell-nav__search">
                <Search size={15} />
                <input
                  value={navQuery}
                  onChange={(event) => setNavQuery(event.target.value)}
                  placeholder="搜索设置项"
                />
              </label>

              <div className="settings-shell-nav__list flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                {groupedNavItems.length === 0 ? (
                  <div className="settings-shell-empty">
                    没有匹配到设置项，请换个关键词试试。
                  </div>
                ) : (
                  groupedNavItems.map((section) => (
                    <div key={section.id} className="settings-shell-nav__group">
                      <div className="settings-shell-nav__group-label">{section.label}</div>
                      <div className="settings-shell-nav__group-list">
                        {section.items.map((item) => {
                          const Icon = item.icon;
                          const active = activeView === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => setActiveView(item.id)}
                              className={`settings-sidebar-item ${active ? 'active' : ''}`}
                            >
                              <span className="settings-sidebar-item__icon">
                                <Icon size={16} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">{item.label}</span>
                                <span className="settings-sidebar-item__desc mt-1 block text-xs leading-5">{item.description}</span>
                              </span>
                              <ChevronRight size={15} className="settings-sidebar-item__arrow" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          <section className="settings-panel apple-glass-card settings-shell-main flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[32px] shadow-2xl">
            <div className="settings-shell-main__topbar">
              <div className="settings-shell-main__module">
                <div className="min-w-0">
                  <div className="settings-shell-kicker">{activeSectionLabel}</div>
                  <div className="mt-2 text-[28px] font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                    {activeNavItem.label}
                  </div>
                  <div className="settings-shell-toolbar__description mt-2">
                    {activeNavItem.description}
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="apple-icon-button h-10 w-10 rounded-2xl"
              >
                <X size={16} />
              </button>
            </div>

            <main className="settings-shell-page settings-shell-page--desktop min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-5 md:px-6 md:pb-7">
              <div className="settings-shell-content">{renderBody()}</div>
            </main>
          </section>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
