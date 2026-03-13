import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calculator,
  DollarSign,
  HardDrive,
  Key,
  LayoutDashboard,
  RefreshCw,
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
  getStorageMode,
  isFileSystemAccessSupported,
  setStorageMode,
  type StorageMode,
} from '../../services/storage/storagePreference';
import { cleanupOriginals, getAllImageIds, getStorageUsage } from '../../services/storage/imageStorage';
import type { Supplier } from '../../services/billing/supplierService';
import { useCanvas } from '../../context/CanvasContext';
import { useBilling } from '../../context/BillingContext';
import { notify } from '../../services/system/notificationService';
const ApiSettingsView = lazy(() => import('./ApiSettingsView'));
const AdminSystem = lazy(() => import('./AdminSystem'));
const CostEstimation = lazy(() => import('../../pages/CostEstimation'));

export type SettingsView = 'dashboard' | 'api-management' | 'cost-estimation' | 'storage-settings' | 'system-logs' | 'admin-system';

type NavItem = {
  id: SettingsView;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
};

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: SettingsView;
  initialSupplier?: Supplier | null;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: '仪表盘', description: '查看接口、模型、费用和运行概况。', icon: LayoutDashboard },
  { id: 'api-management', label: 'API管理', description: '统一管理官方接口和第三方供应商。', icon: Key },
  { id: 'cost-estimation', label: '价格估算', description: '快速查看不同模型和分辨率的成本。', icon: Calculator },
  { id: 'storage-settings', label: '存储设置', description: '切换存储模式并检查本地占用。', icon: HardDrive },
  { id: 'system-logs', label: '系统日志', description: '排查运行日志和错误信息。', icon: ScrollText },
  { id: 'admin-system', label: '管理员后台', description: '处理后台配置、权限和系统操作。', icon: Shield },
];

const StatCard: React.FC<{ title: string; value: string; helper?: string }> = ({ title, value, helper }) => {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        {title}
      </div>
      <div className="mt-1 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      {helper ? (
        <div className="mt-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          {helper}
        </div>
      ) : null}
    </div>
  );
};

const DashboardView: React.FC = () => {
  const { balance, billingLogs, usageLogs } = useBilling();
  const [stats, setStats] = useState(() => keyManager.getStats());
  const [todayCostUsd, setTodayCostUsd] = useState(0);
  const [todayTokens, setTodayTokens] = useState(0);
  const [officialCount, setOfficialCount] = useState(0);
  const [providerCount, setProviderCount] = useState(0);
  const [activeProviderCount, setActiveProviderCount] = useState(0);
  const [importantLogCount, setImportantLogCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      const nextStats = keyManager.getStats();
      const allSlots = keyManager.getSlots();
      const providers = keyManager.getProviders();
      const cost = getTodayCosts();
      const importantLogs = getTodayLogs().filter(
        (item) =>
          item.level === LogLevel.WARNING ||
          item.level === LogLevel.ERROR ||
          item.level === LogLevel.CRITICAL
      );

      const official = allSlots.filter((slot) => {
        if (!slot.key || slot.disabled) return false;
        if (slot.baseUrl) return false;
        if (slot.provider === 'SystemProxy') return false;
        return slot.type === 'official' || slot.provider === 'Google' || slot.provider === 'OpenAI';
      });

      setStats(nextStats);
      setTodayCostUsd(cost.totalCostUsd || 0);
      setTodayTokens(cost.totalTokens || 0);
      setOfficialCount(official.length);
      setProviderCount(providers.length);
      setActiveProviderCount(providers.filter((item) => item.isActive).length);
      setImportantLogCount(importantLogs.length);
    };

    refresh();
    const unsubscribe = keyManager.subscribe(refresh);
    return unsubscribe;
  }, []);

  const keyHealthPercent =
    stats.total > 0 ? Math.max(0, Math.min(100, Math.round((stats.valid / stats.total) * 100))) : 0;
  const todayUsageCount = usageLogs.length;
  const todayRechargeCount = billingLogs.length;
  const latestUsage = usageLogs[0];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr,380px]">
      {/* 左侧主要内容区域 */}
      <div className="space-y-5">
        {/* 供应商 & 官方接口 大卡片 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 供应商 */}
          <div 
            className="relative overflow-hidden rounded-3xl border p-6 min-h-[200px] flex flex-col justify-between"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10">
                <LayoutDashboard size={28} className="text-indigo-400" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-4xl font-black text-[var(--text-primary)]">{providerCount}</span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  ACTIVE {activeProviderCount}
                </span>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--text-secondary)]">供应商</div>
            </div>
          </div>

          {/* 官方接口 */}
          <div 
            className="relative overflow-hidden rounded-3xl border p-6 min-h-[200px] flex flex-col justify-between"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/10">
                <Key size={28} className="text-fuchsia-400" />
              </div>
              <span className="text-4xl font-black text-[var(--text-primary)]">{officialCount}</span>
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--text-secondary)]">官方接口</div>
            </div>
          </div>
        </div>

        {/* 今日生成 & 今日充值记录 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div 
            className="flex items-center gap-4 rounded-2xl border p-4"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
              <RefreshCw size={24} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-xs text-[var(--text-tertiary)]">今日生成</div>
              <div className="text-2xl font-bold text-[var(--text-primary)]">{todayUsageCount}</div>
            </div>
          </div>

          <div 
            className="flex items-center gap-4 rounded-2xl border p-4"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
              <DollarSign size={24} className="text-amber-400" />
            </div>
            <div>
              <div className="text-xs text-[var(--text-tertiary)]">今日充值记录</div>
              <div className="text-2xl font-bold text-[var(--text-primary)]">{todayRechargeCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧系统检查区域 */}
      <div className="space-y-4">
        {/* SYSTEM CHECKUP 标题 */}
        <div className="text-right">
          <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-tertiary)]">SYSTEM</div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-tertiary)]">CHECKUP</div>
        </div>

        {/* 核心链路状态卡片 */}
        <div 
          className="rounded-2xl border p-5"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
        >
          <div className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
            核心链路可用，但检测到日志告警或部分配置需要留意。
          </div>
          <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
            这里聚合密钥可用性、供应商连通情况和本地配置状态，帮助你快速判断当前是否适合继续生成。
          </p>
        </div>

        {/* 性能指标小卡片 */}
        <div className="grid grid-cols-3 gap-3">
          <div 
            className="rounded-xl border p-3 text-center"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="text-[10px] text-[var(--text-tertiary)]">性能模式</div>
            <div className="mt-1 text-xs font-semibold text-[var(--text-primary)]">高性能设备</div>
          </div>
          <div 
            className="rounded-xl border p-3 text-center"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="text-[10px] text-[var(--text-tertiary)]">FPS</div>
            <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">47</div>
          </div>
          <div 
            className="rounded-xl border p-3 text-center"
            style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="text-[10px] text-[var(--text-tertiary)]">告警日志</div>
            <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{importantLogCount}</div>
          </div>
        </div>

        {/* 密钥池健康 */}
        <div 
          className="rounded-2xl border p-5"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Key size={20} className="text-emerald-400" />
            </div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              正常
            </span>
          </div>
          <div className="mb-1 text-sm text-[var(--text-secondary)]">密钥池健康</div>
          <div className="mb-3 text-2xl font-black text-[var(--text-primary)]">{stats.valid}/{stats.total} 可用</div>
          <p className="text-xs text-[var(--text-tertiary)]">当前仍有可调度密钥，生成请求可继续分发。</p>
        </div>

        {/* 供应商连通 */}
        <div 
          className="rounded-2xl border p-5"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
              <LayoutDashboard size={20} className="text-indigo-400" />
            </div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              在线
            </span>
          </div>
          <div className="mb-1 text-sm text-[var(--text-secondary)]">供应商连通</div>
          <div className="mb-3 text-2xl font-black text-[var(--text-primary)]">{activeProviderCount}/{providerCount} 在线</div>
          <p className="text-xs text-[var(--text-tertiary)]">至少有一个聚合供应商处于启用状态，可承接模型调用。</p>
        </div>

        {/* 配置与存储 */}
        <div 
          className="rounded-2xl border p-5"
          style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10">
              <HardDrive size={20} className="text-sky-400" />
            </div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
              已就绪
            </span>
          </div>
          <div className="mb-1 text-sm text-[var(--text-secondary)]">配置与存储</div>
          <div className="text-2xl font-black text-[var(--text-primary)]">已就绪</div>
        </div>
      </div>
    </div>
  );
};

const StorageSettingsView: React.FC = () => {
  const { connectLocalFolder, disconnectLocalFolder, isConnectedToLocal } = useCanvas();

  const [mode, setMode] = useState<StorageMode | null>(null);
  const [usageMB, setUsageMB] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const supportsLocal = isFileSystemAccessSupported();

  const refresh = async () => {
    setLoading(true);
    try {
      const [storedMode, usageBytes, ids] = await Promise.all([
        getStorageMode(),
        getStorageUsage(),
        getAllImageIds(),
      ]);

      setMode(storedMode);
      setUsageMB(usageBytes / (1024 * 1024));
      setImageCount(ids.length);
    } catch (error) {
      console.error('[StorageSettingsView] 刷新失败:', error);
    } finally {
      setLoading(false);
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

    setLoading(true);
    try {
      await connectLocalFolder();
      await setStorageMode('local');
      notify.success('切换成功', '已切换为本地文档夹存储。');
      await refresh();
    } catch (error) {
      notify.error('切换失败', '本地文档夹连接失败，请重试。');
      console.error('[StorageSettingsView] 切换本地模式失败:', error);
      setLoading(false);
    }
  };

  const switchToBrowser = async () => {
    setLoading(true);
    try {
      disconnectLocalFolder();
      await setStorageMode('browser');
      notify.success('切换成功', '已切换为浏览器存储。');
      await refresh();
    } catch (error) {
      notify.error('切换失败', '浏览器存储切换失败，请重试。');
      console.error('[StorageSettingsView] 切换浏览器模式失败:', error);
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    setLoading(true);
    try {
      const result = await cleanupOriginals();
      notify.success('清理完成', `共清理 ${result.count} 条原图缓存。`);
      await refresh();
    } catch (error) {
      notify.error('清理失败', '请稍后重试。');
      console.error('[StorageSettingsView] 清理失败:', error);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border p-5"
        style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
      >
        <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          存储设置
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          调整图片存储方式，防止生成图片丢失。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard title="当前存储方式" value={mode === 'local' ? '本地文档夹' : mode === 'browser' ? '浏览器存储' : '未设置'} />
        <StatCard title="已存图片数量" value={`${imageCount} 张`} />
        <StatCard title="占用空间" value={`${usageMB.toFixed(2)} MB`} />
      </div>

      <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          存储模式切换
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <button
            onClick={() => void switchToLocal()}
            disabled={loading || !supportsLocal}
            className="inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm disabled:opacity-60"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          >
            切换到本地文档夹
          </button>

          <button
            onClick={() => void switchToBrowser()}
            disabled={loading}
            className="inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm disabled:opacity-60"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          >
            切换到浏览器存储
          </button>
        </div>

        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          本地文档夹连接状态：{isConnectedToLocal ? '已连接' : '未连接'}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border px-3 text-xs disabled:opacity-60"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>

        <button
          onClick={() => void handleCleanup()}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs text-amber-300 disabled:opacity-60"
        >
          <Trash2 size={13} /> 清理原图缓存
        </button>
      </div>
    </div>
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

  const handleExport = async () => {
    const text = exportLogsForAI();
    await navigator.clipboard.writeText(text);
    notify.success('导出成功', '系统日志已复制到剪贴板。');
  };

  const handleClear = () => {
    clearLogs();
    notify.success('已清空', '今日系统日志已清空。');
  };

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-5"
        style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
      >
        <div>
          <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            系统日志
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            记录重要错误、警告与关键运行信息。
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void handleExport()}
            className="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
          >
            导出日志
          </button>
          <button
            onClick={handleClear}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs text-red-300"
          >
            清空日志
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border-light)' }}>
        {importantLogs.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            今日暂无重要日志。
          </div>
        ) : (
          <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {importantLogs
              .slice()
              .reverse()
              .map((log) => (
                <div key={log.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-light)' }}>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{new Date(log.timestamp).toLocaleString('zh-CN', { hour12: false })}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 ${log.level === LogLevel.CRITICAL || log.level === LogLevel.ERROR
                        ? 'border-red-500/30 bg-red-500/10 text-red-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        }`}
                    >
                      {log.level}
                    </span>
                    <span>来源：{log.source}</span>
                  </div>
                  <div className="mt-1 text-sm" style={{ color: 'var(--text-primary)' }}>
                    {log.message}
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap break-all text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {log.details}
                  </pre>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  initialView = 'dashboard',
  initialSupplier = null,
}) => {
  const [activeView, setActiveView] = useState<SettingsView>(initialView);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const activeNavItem = useMemo(() => navItems.find((item) => item.id === activeView) || navItems[0], [activeView]);
  const ActiveIcon = activeNavItem.icon;

  useEffect(() => {
    if (isOpen) {
      setActiveView(initialView);
    }
  }, [initialView, isOpen]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!isOpen) return null;

  const lazyFallback = (
    <div className="flex min-h-[240px] items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
      正在加载设置内容...
    </div>
  );

  const renderBody = () => {
    if (activeView === 'dashboard') return <DashboardView />;
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
      className={`settings-panel fixed inset-0 z-[10001] flex justify-center bg-black/38 backdrop-blur-md ${isMobile ? 'items-end px-2 pb-0 pt-8' : 'items-center px-3 py-3'}`}
      onClick={onClose}
    >
      {isMobile ? (
        <div
          className="settings-panel apple-glass-card flex h-[88dvh] max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[26px] rounded-b-none ios-mobile-sheet shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <aside
            className="border-b px-3 pt-3 pb-3 flex-shrink-0"
            style={{
              borderColor: 'var(--border-light)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={`apple-pill-button min-w-[92px] shrink-0 flex-col justify-center px-2 py-2.5 ${active ? 'active' : ''}`}
                  >
                    <Icon size={15} />
                    <span className="text-[11px] leading-none">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-h-0 flex-1 overflow-hidden">
            <div
              className="settings-panel-header border-b px-4 py-4"
              style={{
                borderColor: 'var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {activeNavItem.label}
                  </div>
                  <div className="mt-0.5 text-xs leading-4" style={{ color: 'var(--text-tertiary)' }}>
                    {activeNavItem.description}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="apple-icon-button h-8 w-8 rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <main className="h-full overflow-y-auto p-3 pt-4 pb-6">
              {renderBody()}
            </main>
          </section>
        </div>
      ) : (
        <div
          className="flex h-[86vh] max-h-[940px] w-full max-w-[1200px] items-stretch gap-5"
          onClick={(e) => e.stopPropagation()}
        >
          <aside className="w-[260px] flex-shrink-0">
            <div
              className="settings-panel apple-glass-card flex h-full flex-col rounded-[32px] p-4 shadow-2xl"
              style={{ backgroundColor: 'var(--bg-surface)' }}
            >
              <div className="mb-4 flex items-center gap-3 px-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                  <ActiveIcon size={18} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    高级设置
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {navItems.map((item) => {
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
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section
            className="settings-panel apple-glass-card flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[32px] shadow-2xl"
            style={{ backgroundColor: 'var(--bg-surface)' }}
          >
            <div
              className="settings-panel-header border-b px-6 py-4"
              style={{
                borderColor: 'var(--border-light)',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                    <ActiveIcon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {activeNavItem.label}
                    </div>
                    <div className="mt-0.5 text-xs leading-4" style={{ color: 'var(--text-tertiary)' }}>
                      {activeNavItem.description}
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="apple-icon-button h-9 w-9 rounded-xl"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-4 md:px-6 md:pb-6">
              {renderBody()}
            </main>
          </section>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
