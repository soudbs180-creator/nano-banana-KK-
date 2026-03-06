import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  HardDrive,
  Key,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ScrollText,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
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
import { useCanvas } from '../../context/CanvasContext';
import { useBilling } from '../../context/BillingContext';
import { notify } from '../../services/system/notificationService';
import ApiSettingsView from './ApiSettingsView';
import AdminSystem from './AdminSystem';

export type SettingsView = 'dashboard' | 'api-management' | 'storage-settings' | 'system-logs' | 'admin-system';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: SettingsView;
  onOpenSupplierManager?: () => void;
  onOpenCostEstimation?: () => void;
}

const navItems: Array<{ id: SettingsView; label: string; icon: React.ComponentType<any> }> = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { id: 'api-management', label: '接口管理', icon: Key },
  { id: 'storage-settings', label: '存储设置', icon: HardDrive },
  { id: 'system-logs', label: '系统日志', icon: ScrollText },
  { id: 'admin-system', label: '管理员后台', icon: Shield },
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
    <div className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          仪表盘
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          重点信息聚合：积分、消耗、密钥健康、供应商状态、系统日志。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div
          className="relative overflow-hidden rounded-2xl border p-4 md:col-span-8"
          style={{ borderColor: 'var(--border-light)', background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(16,185,129,0.10))' }}
        >
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-indigo-400/10 blur-2xl" />
          <div className="absolute -bottom-12 left-24 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />
          <div className="relative">
            <div className="text-xs tracking-wide text-[var(--text-tertiary)]">今日总览</div>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="text-[11px] text-[var(--text-tertiary)]">积分余额</div>
                <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{balance}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="text-[11px] text-[var(--text-tertiary)]">今日成本</div>
                <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">${todayCostUsd.toFixed(4)}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="text-[11px] text-[var(--text-tertiary)]">今日 Tokens</div>
                <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{todayTokens.toLocaleString('zh-CN')}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="text-[11px] text-[var(--text-tertiary)]">关键日志</div>
                <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{importantLogCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border p-4 md:col-span-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="text-xs text-[var(--text-tertiary)]">密钥健康度</div>
          <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{keyHealthPercent}%</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all"
              style={{ width: `${keyHealthPercent}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-[var(--text-tertiary)]">
            有效 {stats.valid} / 总计 {stats.total} · 失效 {stats.invalid} · 禁用 {stats.disabled}
          </div>
        </div>

        <div className="rounded-2xl border p-4 md:col-span-3" style={{ borderColor: 'var(--border-light)' }}>
          <div className="text-[11px] text-[var(--text-tertiary)]">官方接口</div>
          <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{officialCount}</div>
          <div className="mt-1 text-xs text-[var(--text-tertiary)]">仅当前用户可用</div>
        </div>

        <div className="rounded-2xl border p-4 md:col-span-3" style={{ borderColor: 'var(--border-light)' }}>
          <div className="text-[11px] text-[var(--text-tertiary)]">第三方供应商</div>
          <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{providerCount}</div>
          <div className="mt-1 text-xs text-[var(--text-tertiary)]">启用 {activeProviderCount} 个</div>
        </div>

        <div className="rounded-2xl border p-4 md:col-span-3" style={{ borderColor: 'var(--border-light)' }}>
          <div className="text-[11px] text-[var(--text-tertiary)]">今日生成记录</div>
          <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{todayUsageCount}</div>
          <div className="mt-1 text-xs text-[var(--text-tertiary)]">失败也会记录并走退回</div>
        </div>

        <div className="rounded-2xl border p-4 md:col-span-3" style={{ borderColor: 'var(--border-light)' }}>
          <div className="text-[11px] text-[var(--text-tertiary)]">今日充值记录</div>
          <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{todayRechargeCount}</div>
          <div className="mt-1 text-xs text-[var(--text-tertiary)]">人民币/美元分别记账</div>
        </div>

        <div className="rounded-2xl border p-4 md:col-span-8" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <Activity size={15} /> 最新状态
          </div>
          <div className="mt-2 text-xs text-[var(--text-tertiary)]">
            {latestUsage
              ? `最近一条记录：${latestUsage.type} / ${latestUsage.model_name || latestUsage.model_id || '未命名模型'} / ${new Date(
                  latestUsage.created_at
                ).toLocaleString('zh-CN', { hour12: false })}`
              : '今日暂无使用记录。'}
          </div>
          <ul className="mt-3 space-y-1 text-xs text-[var(--text-tertiary)]">
            <li>用户 API 管理仅对当前用户生效，不影响其他用户。</li>
            <li>管理员后台配置的积分模型会同步给全部用户并实时生效。</li>
            <li>模型达到总调用上限后会自动暂停，用户端模型库将自动隐藏该模型。</li>
          </ul>
        </div>

        <div className="rounded-2xl border p-4 md:col-span-4" style={{ borderColor: 'var(--border-light)' }}>
          <div className="text-sm font-medium text-[var(--text-primary)]">快速巡检</div>
          <div className="mt-2 space-y-2 text-xs text-[var(--text-tertiary)]">
            <div className="rounded-lg border border-[var(--border-light)] p-2">密钥状态：{stats.valid > 0 ? '正常' : '需配置'}</div>
            <div className="rounded-lg border border-[var(--border-light)] p-2">供应商状态：{activeProviderCount > 0 ? '可用' : '未启用'}</div>
            <div className="rounded-lg border border-[var(--border-light)] p-2">日志状态：{importantLogCount > 0 ? '有重点告警' : '无重点告警'}</div>
          </div>
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
      notify.success('切换成功', '已切换为本地文件夹存储。');
      await refresh();
    } catch (error) {
      notify.error('切换失败', '本地文件夹连接失败，请重试。');
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
      <div>
        <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          存储设置
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          调整图片存储方式，防止生成图片丢失。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard title="当前存储方式" value={mode === 'local' ? '本地文件夹' : mode === 'browser' ? '浏览器存储' : '未设置'} />
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
            切换到本地文件夹
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
          本地文件夹连接状态：{isConnectedToLocal ? '已连接' : '未连接'}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
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
  onOpenSupplierManager: _onOpenSupplierManager,
  onOpenCostEstimation: _onOpenCostEstimation,
}) => {
  const [activeView, setActiveView] = useState<SettingsView>(initialView);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

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

  const renderBody = () => {
    if (activeView === 'dashboard') return <DashboardView />;
    if (activeView === 'api-management') return <ApiSettingsView />;
    if (activeView === 'storage-settings') return <StorageSettingsView />;
    if (activeView === 'system-logs') return <SystemLogsView />;
    return <AdminSystem />;
  };

  return (
    <div className={`fixed inset-0 z-[10001] flex justify-center bg-black/55 backdrop-blur-sm ${isMobile ? 'items-end px-2 pb-0 pt-8' : 'items-center px-3 py-3'}`}>
      <div
        className={`flex w-full overflow-hidden border shadow-2xl ${isMobile ? 'h-[88dvh] max-h-[88dvh] flex-col rounded-t-[26px] rounded-b-none ios-mobile-sheet' : 'h-[80vh] max-w-[1120px] flex-row rounded-2xl'}`}
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}
      >
        <aside
          className={`${isMobile ? 'border-b px-3 pt-2 pb-3 flex-shrink-0' : 'border-r p-3 w-[220px] flex-shrink-0 overflow-y-auto'}`}
          style={{
            borderColor: 'var(--border-light)',
            backgroundColor: 'var(--bg-tertiary)',
          }}
        >
          <div className={`mb-2 flex items-center justify-between ${isMobile ? 'px-1 py-1.5' : 'px-2 py-1'}`}>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              系统设置
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border"
              style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
            >
              <X size={16} />
            </button>
          </div>

          <div className={`${isMobile ? 'flex gap-2 overflow-x-auto pb-1 scrollbar-thin' : 'space-y-1'}`}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`inline-flex items-center gap-2 rounded-xl text-sm ${isMobile ? 'min-w-[92px] shrink-0 flex-col justify-center px-2 py-2.5' : 'w-full justify-start px-3 py-2'}`}
                  style={{
                    backgroundColor: active ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: active ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid transparent',
                  }}
                >
                  <Icon size={15} />
                  <span className={isMobile ? 'text-[11px] leading-none' : ''}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className={`min-h-0 flex-1 overflow-y-auto ${isMobile ? 'p-3 pb-6' : 'p-3 md:p-4'}`}>
          {renderBody()}
        </main>
      </div>
    </div>
  );
};

export default SettingsPanel;
