import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calculator, DollarSign, Info, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { creditService } from '../services/billing/creditService';
import {
  getHistorySummary,
  getRecentEntries,
  parseModelSource,
  type CostBreakdownItem,
  type CostEntry,
} from '../services/billing/costService';
import { adminModelService, type AdminModelConfig } from '../services/model/adminModelService';
import type { AdminModelQualityKey } from '../services/model/adminModelQuality';
import {
  SETTINGS_ELEVATED_STYLE,
  SettingsActionButton,
  SettingsBadge,
  SettingsHero,
  SettingsMetricCard,
  SettingsSection,
  SettingsViewShell,
} from '../components/settings/SettingsScaffold';

interface CostEstimationProps {
  onBack?: () => void;
  embedded?: boolean;
}

type CreditModelDisplayRow = {
  key: string;
  displayName: string;
  systemModelId: string;
  providerLabel: string;
  qualitySummary: string[];
};

const formatUsd = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value: number) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const tableWrapperStyle = {
  borderColor: 'var(--border-light)',
  backgroundColor: 'var(--bg-elevated)',
} as const;

const tableHeaderCellClassName =
  'px-4 py-2.5 text-left text-[11px] font-semibold tracking-[0.06em] text-[var(--text-tertiary)] whitespace-nowrap';

const tableCellClassName = 'px-4 py-3.5 align-top text-sm';

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm leading-6"
    style={{
      borderColor: 'var(--border-light)',
      backgroundColor: 'var(--bg-elevated)',
      color: 'var(--text-tertiary)',
    }}
  >
    {children}
  </div>
);

const InfoPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-2xl border p-4" style={SETTINGS_ELEVATED_STYLE}>
    <div className="flex items-start gap-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--state-info-text)' }} />
      <div className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {title}
        </div>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  </section>
);

const CREDIT_QUALITY_DISPLAY_ORDER: AdminModelQualityKey[] = ['1K', '2K', '4K', '0.5K'];

const sortAdminModelsForDisplay = (models: AdminModelConfig[]) =>
  [...models].sort((left, right) => {
    const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;

    const weightDiff = Number(right.weight || 0) - Number(left.weight || 0);
    if (weightDiff !== 0) return weightDiff;

    return String(left.providerName || left.provider || '').localeCompare(
      String(right.providerName || right.provider || ''),
      'zh-CN'
    );
  });

const buildQualitySummary = (model: AdminModelConfig): string[] => {
  if (!model.advancedEnabled || !model.qualityPricing) {
    return [`1K/${model.creditCost}积分`];
  }

  const enabledQualities = CREDIT_QUALITY_DISPLAY_ORDER.filter(
    (quality) => model.qualityPricing?.[quality]?.enabled !== false
  );

  if (enabledQualities.length === 0) {
    return [`1K/${model.creditCost}积分`];
  }

  return enabledQualities.map(
    (quality) => `${quality}/${model.qualityPricing?.[quality]?.creditCost ?? model.creditCost}积分`
  );
};

const buildCreditModelDisplayRows = (models: AdminModelConfig[]): CreditModelDisplayRow[] => {
  const grouped = new Map<string, AdminModelConfig[]>();

  models.forEach((model) => {
    if (!grouped.has(model.id)) {
      grouped.set(model.id, []);
    }
    grouped.get(model.id)!.push(model);
  });

  const rows: CreditModelDisplayRow[] = [];

  grouped.forEach((items, modelId) => {
    const sortedItems = sortAdminModelsForDisplay(items);
    const mixedItems = sortedItems.filter((item) => item.mixWithSameModel);

    if (mixedItems.length > 1) {
      const primary = mixedItems[0];
      rows.push({
        key: `mixed:${modelId}`,
        displayName: primary.displayName,
        systemModelId: `${modelId}@system`,
        providerLabel: `混合路由 · ${mixedItems.length} 个供应商`,
        qualitySummary: buildQualitySummary(primary),
      });
      return;
    }

    sortedItems.forEach((item) => {
      rows.push({
        key: `${item.providerId || item.provider}:${item.id}`,
        displayName: item.displayName,
        systemModelId: `${item.id}@system`,
        providerLabel: item.providerName || item.provider || '系统模型',
        qualitySummary: buildQualitySummary(item),
      });
    });
  });

  return rows.sort((left, right) => left.displayName.localeCompare(right.displayName, 'zh-CN'));
};

export const CostEstimation: React.FC<CostEstimationProps> = ({ onBack, embedded = false }) => {
  const [activeTab, setActiveTab] = useState<'records' | 'credits'>('records');
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [adminModels, setAdminModels] = useState<AdminModelConfig[]>([]);
  const [summaryRows, setSummaryRows] = useState<CostBreakdownItem[]>([]);
  const [recentRows, setRecentRows] = useState<CostEntry[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const fetchBalance = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const credits = await creditService.getUserCredits(user.id);
        setUserBalance(credits?.balance ?? 0);
      }
    };

    const updateAdminModels = () => {
      const models = adminModelService.getModels().filter((item) => item.creditCost !== undefined && item.creditCost > 0);
      setAdminModels(models);
    };

    void fetchBalance();
    updateAdminModels();
    void adminModelService.loadAdminModels().then(updateAdminModels);

    const unsubscribeAdmin = adminModelService.subscribe(updateAdminModels);
    return unsubscribeAdmin;
  }, []);

  useEffect(() => {
    setSummaryRows(getHistorySummary(30));
    setRecentRows(getRecentEntries(50));
  }, [refreshTick, activeTab]);

  useEffect(() => {
    const handleFocus = () => setRefreshTick((value) => value + 1);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const recordsOverview = useMemo(() => {
    const totalCost = summaryRows.reduce((sum, item) => sum + (item.cost || 0), 0);
    const totalTokens = summaryRows.reduce((sum, item) => sum + (item.tokens || 0), 0);
    const totalCount = summaryRows.reduce((sum, item) => sum + (item.count || 0), 0);

    return {
      totalCost,
      totalTokens,
      totalCount,
    };
  }, [summaryRows]);

  const creditModelDisplayRows = useMemo(() => buildCreditModelDisplayRows(adminModels), [adminModels]);

  const heroMetrics =
    activeTab === 'records' ? (
      <>
        <SettingsMetricCard
          label="累计成本"
          value={formatUsd(recordsOverview.totalCost)}
          helper="基于近 30 天成本记录汇总，帮助判断主要消耗方向。"
          icon={DollarSign}
          tone="amber"
        />
        <SettingsMetricCard
          label="累计调用"
          value={recordsOverview.totalCount.toLocaleString('zh-CN')}
          helper="统计所有成功写入的费用记录。"
          icon={RefreshCw}
          tone="indigo"
        />
        <SettingsMetricCard
          label="累计 Tokens"
          value={recordsOverview.totalTokens.toLocaleString('zh-CN')}
          helper="用于识别高消耗模型和长期使用趋势。"
          icon={Calculator}
          tone="sky"
        />
        <SettingsMetricCard
          label="最近一条"
          value={recentRows.length > 0 ? formatDateTime(recentRows[0].timestamp) : '暂无'}
          helper="展示最近一次费用记录的时间。"
          icon={Info}
          tone="neutral"
        />
      </>
    ) : (
      <>
        <SettingsMetricCard
          label="当前积分"
          value={userBalance !== null ? userBalance.toString() : '--'}
          helper="当前账号还可直接使用的积分余额。"
          icon={Calculator}
          tone="emerald"
        />
        <SettingsMetricCard
          label="积分模型"
          value={creditModelDisplayRows.length.toString()}
          helper="由后台统一配置，前台可直接调用。"
          icon={DollarSign}
          tone="indigo"
        />
        <SettingsMetricCard
          label="计费方式"
          value="按模型扣减"
          helper="调用积分模型时会直接扣除对应积分。"
          icon={RefreshCw}
          tone="sky"
        />
        <SettingsMetricCard
          label="补充方式"
          value="联系管理员"
          helper="当积分不足时，可通过后台完成充值或补量。"
          icon={Info}
          tone="neutral"
        />
      </>
    );

  const content = (
    <SettingsViewShell>
      <SettingsHero
        tone={activeTab === 'records' ? 'indigo' : 'emerald'}
        icon={activeTab === 'records' ? DollarSign : Calculator}
        eyebrow="COST CENTER"
        title="价格估算"
        description={
          activeTab === 'records'
            ? '把累计成本、最近记录和模型来源整理到一个视图里，方便快速定位费用变化。'
            : '积分模式保留最关键的信息：余额、可用模型和补充方式，减少不必要的后台干扰。'
        }
        badge={<SettingsBadge tone={activeTab === 'records' ? 'amber' : 'emerald'}>{activeTab === 'records' ? '费用记录' : '积分系统'}</SettingsBadge>}
        actions={
          <>
            {!embedded && onBack ? (
              <SettingsActionButton icon={ArrowLeft} onClick={onBack}>
                返回
              </SettingsActionButton>
            ) : null}
            <SettingsActionButton icon={RefreshCw} onClick={() => setRefreshTick((value) => value + 1)}>
              刷新
            </SettingsActionButton>
            <div className="apple-pill-group">
              <button
                onClick={() => setActiveTab('records')}
                className={`apple-pill-button ${activeTab === 'records' ? 'active' : ''}`}
              >
                <DollarSign className="h-4 w-4" />
                费用记录
              </button>
              <button
                onClick={() => setActiveTab('credits')}
                className={`apple-pill-button ${activeTab === 'credits' ? 'active' : ''}`}
              >
                <Calculator className="h-4 w-4" />
                积分系统
              </button>
            </div>
          </>
        }
        metrics={heroMetrics}
      />

      {activeTab === 'records' ? (
        <>
          <SettingsSection
            eyebrow="MODEL SUMMARY"
            title="按模型汇总"
            description="查看每个模型在近 30 天内的调用次数、Token 消耗和费用表现。"
            action={<SettingsBadge tone="neutral">近 30 天</SettingsBadge>}
          >
            {summaryRows.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border" style={tableWrapperStyle}>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead style={{ backgroundColor: 'var(--bg-overlay)' }}>
                      <tr>
                        <th className={tableHeaderCellClassName}>模型</th>
                        <th className={tableHeaderCellClassName}>来源</th>
                        <th className={`${tableHeaderCellClassName} text-right`}>累计调用</th>
                        <th className={`${tableHeaderCellClassName} text-right`}>累计 Tokens</th>
                        <th className={`${tableHeaderCellClassName} text-right`}>累计费用</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryRows.map((item, index) => {
                        const parsed = parseModelSource(item.model);
                        return (
                          <tr key={`${item.model}_${item.imageSize}_${index}`} className="border-t" style={{ borderColor: 'var(--border-light)' }}>
                            <td className={tableCellClassName}>
                              <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {parsed.modelId}
                              </div>
                              <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                {item.imageSize}
                              </div>
                            </td>
                            <td className={tableCellClassName}>
                              <SettingsBadge tone="neutral">{parsed.source}</SettingsBadge>
                            </td>
                            <td className={`${tableCellClassName} text-right`} style={{ color: 'var(--text-secondary)' }}>
                              {item.count.toLocaleString('zh-CN')}
                            </td>
                            <td className={`${tableCellClassName} text-right`} style={{ color: 'var(--text-secondary)' }}>
                              {item.tokens.toLocaleString('zh-CN')}
                            </td>
                            <td className={`${tableCellClassName} text-right font-semibold`} style={{ color: 'var(--state-success-text)' }}>
                              {formatUsd(item.cost)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyState>暂无累计费用记录，完成生成后这里会逐步汇总每个模型的成本。</EmptyState>
            )}
          </SettingsSection>

          <SettingsSection
            eyebrow="RECENT ENTRIES"
            title="最近记录"
            description="保留最近 50 条单次费用记录，方便快速回看和排查。"
          >
            {recentRows.length > 0 ? (
              <div className="overflow-hidden rounded-2xl border" style={tableWrapperStyle}>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead style={{ backgroundColor: 'var(--bg-overlay)' }}>
                      <tr>
                        <th className={tableHeaderCellClassName}>时间</th>
                        <th className={tableHeaderCellClassName}>模型</th>
                        <th className={`${tableHeaderCellClassName} text-right`}>本次调用</th>
                        <th className={`${tableHeaderCellClassName} text-right`}>本次 Tokens</th>
                        <th className={`${tableHeaderCellClassName} text-right`}>本次费用</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRows.map((entry) => {
                        const parsed = parseModelSource(entry.model);
                        return (
                          <tr key={entry.id} className="border-t" style={{ borderColor: 'var(--border-light)' }}>
                            <td className={tableCellClassName} style={{ color: 'var(--text-secondary)' }}>
                              {formatDateTime(entry.timestamp)}
                            </td>
                            <td className={tableCellClassName}>
                              <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {parsed.modelId}
                              </div>
                              <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                {parsed.source}
                              </div>
                            </td>
                            <td className={`${tableCellClassName} text-right`} style={{ color: 'var(--text-secondary)' }}>
                              {entry.count.toLocaleString('zh-CN')}
                            </td>
                            <td className={`${tableCellClassName} text-right`} style={{ color: 'var(--text-secondary)' }}>
                              {(entry.tokens || 0).toLocaleString('zh-CN')}
                            </td>
                            <td className={`${tableCellClassName} text-right font-semibold`} style={{ color: 'var(--state-success-text)' }}>
                              {formatUsd(entry.costUsd)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <EmptyState>暂无单次费用记录。</EmptyState>
            )}
          </SettingsSection>

          <InfoPanel title="费用说明">
            “按模型汇总”会持续累计模型总成本；“最近记录”只展示单次调用本身的消耗，两者分别用于长期观察和短期排查。
          </InfoPanel>
        </>
      ) : (
        <>
          <SettingsSection
            eyebrow="CREDIT MODELS"
            title="积分模型列表"
            description="积分模型由后台统一维护，用户在前台可直接使用，不需要单独配置 API Key。"
            action={<SettingsBadge tone="neutral">{creditModelDisplayRows.length} 个模型</SettingsBadge>}
          >
            {creditModelDisplayRows.length > 0 ? (
              <div className="grid gap-3">
                {creditModelDisplayRows.map((model) => (
                  <div key={model.key} className="rounded-2xl border px-4 py-3" style={SETTINGS_ELEVATED_STYLE}>
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {model.displayName}
                          </div>
                          <SettingsBadge tone="neutral">{model.providerLabel}</SettingsBadge>
                        </div>
                        <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {model.systemModelId}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {model.qualitySummary.map((summary) => (
                          <span
                            key={`${model.key}:${summary}`}
                            className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
                            style={{
                              borderColor: 'rgba(245, 158, 11, 0.24)',
                              backgroundColor: 'rgba(245, 158, 11, 0.12)',
                              color: 'var(--state-warning-text)',
                            }}
                          >
                            {summary}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>暂无积分模型，或仍在加载中。</EmptyState>
            )}
          </SettingsSection>

          <InfoPanel title="关于积分系统">
            积分模型通过系统代理调用，用户无需维护对应的 API Key；当积分不足时，可以通过后台完成充值或补量。
          </InfoPanel>
        </>
      )}
    </SettingsViewShell>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="apple-page-shell">
      <main className="apple-shell py-6">{content}</main>
    </div>
  );
};

export default CostEstimation;
