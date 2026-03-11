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

interface CostEstimationProps {
  onBack?: () => void;
  embedded?: boolean;
}

const formatUsd = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value: number) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

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
      const models = adminModelService
        .getModels()
        .filter((item) => item.creditCost !== undefined && item.creditCost > 0);
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

  const content = (
    <div className="space-y-6">
      <div className={embedded ? 'apple-glass-card rounded-[28px] p-5 md:p-6' : 'apple-glass-card rounded-[30px] p-5 md:p-6'}>
        <div className="flex flex-col items-start gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            {!embedded && onBack ? (
              <button onClick={onBack} className="apple-icon-button mt-0.5">
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div>
              <div className="apple-badge info mb-3">成本与积分面板</div>
              <h1 className={`${embedded ? 'text-2xl' : 'text-[28px]'} font-semibold tracking-tight text-[var(--text-primary)]`}>
                价格估算
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                分别查看模型累计消耗、单次消耗记录，以及积分模型的当前可用情况。
              </p>
            </div>
          </div>

          <div className="apple-pill-group self-start">
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
        </div>
      </div>

      {activeTab === 'records' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="apple-soft-card rounded-[24px] p-5">
              <div className="text-xs text-[var(--text-tertiary)]">模型累计总消耗</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                {formatUsd(recordsOverview.totalCost)}
              </div>
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">按模型累计，持续计入总成本</div>
            </div>

            <div className="apple-soft-card rounded-[24px] p-5">
              <div className="text-xs text-[var(--text-tertiary)]">累计调用次数</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                {recordsOverview.totalCount}
              </div>
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">统计所有成功记录</div>
            </div>

            <div className="apple-soft-card rounded-[24px] p-5">
              <div className="text-xs text-[var(--text-tertiary)]">累计 Tokens</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                {recordsOverview.totalTokens.toLocaleString('zh-CN')}
              </div>
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">来自费用记录汇总</div>
            </div>
          </div>

          <div className="apple-table-card">
            <div className="flex flex-col items-start gap-3 border-b border-[rgba(148,163,184,0.14)] px-6 py-5 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">该模型总消耗</h3>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  每个模型的累计费用会持续累加，便于长期核算成本。
                </p>
              </div>
              <button
                onClick={() => setRefreshTick((value) => value + 1)}
                className="apple-button-secondary self-start px-3 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                刷新
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="apple-table">
                <thead>
                  <tr>
                    <th className="text-left">模型</th>
                    <th className="text-left">来源</th>
                    <th className="text-right">累计次数</th>
                    <th className="text-right">累计 Tokens</th>
                    <th className="text-right">累计费用</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.length > 0 ? (
                    summaryRows.map((item, index) => {
                      const parsed = parseModelSource(item.model);
                      return (
                        <tr key={`${item.model}_${item.imageSize}_${index}`}>
                          <td>
                            <div className="text-sm font-medium text-[var(--text-primary)]">{parsed.modelId}</div>
                            <div className="mt-1 text-xs text-[var(--text-tertiary)]">{item.imageSize}</div>
                          </td>
                          <td className="text-sm text-[var(--text-secondary)]">{parsed.source}</td>
                          <td className="text-right text-sm text-[var(--text-secondary)]">{item.count}</td>
                          <td className="text-right text-sm text-[var(--text-secondary)]">
                            {item.tokens.toLocaleString('zh-CN')}
                          </td>
                          <td className="text-right text-sm font-semibold text-emerald-600">{formatUsd(item.cost)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm text-[var(--text-tertiary)]">
                        暂无累计费用记录，生成成功后这里会逐步汇总每个模型的总消耗。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="apple-table-card">
            <div className="border-b border-[rgba(148,163,184,0.14)] px-6 py-5">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">单次消耗记录</h3>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                每一次调用都会单独记录，方便回查某次生成的实际消耗。
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="apple-table">
                <thead>
                  <tr>
                    <th className="text-left">时间</th>
                    <th className="text-left">模型</th>
                    <th className="text-right">本次数量</th>
                    <th className="text-right">本次 Tokens</th>
                    <th className="text-right">本次费用</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.length > 0 ? (
                    recentRows.map((entry) => {
                      const parsed = parseModelSource(entry.model);
                      return (
                        <tr key={entry.id}>
                          <td className="text-sm text-[var(--text-secondary)]">{formatDateTime(entry.timestamp)}</td>
                          <td>
                            <div className="text-sm font-medium text-[var(--text-primary)]">{parsed.modelId}</div>
                            <div className="mt-1 text-xs text-[var(--text-tertiary)]">{parsed.source}</div>
                          </td>
                          <td className="text-right text-sm text-[var(--text-secondary)]">{entry.count}</td>
                          <td className="text-right text-sm text-[var(--text-secondary)]">
                            {(entry.tokens || 0).toLocaleString('zh-CN')}
                          </td>
                          <td className="text-right text-sm font-semibold text-emerald-600">
                            {formatUsd(entry.costUsd)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm text-[var(--text-tertiary)]">
                        暂无单次消耗记录。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="apple-note-card flex items-start gap-3 rounded-[24px] p-5">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-sky-600" />
            <div className="text-sm text-[var(--text-secondary)]">
              <p className="mb-1 font-medium text-sky-700">费用记录说明</p>
              <p>
                上面的“该模型总消耗”会累计计入模型总成本；下面的“单次消耗记录”只记录某一次调用本身的消耗，
                两者分开用于长期统计和单次排查。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="apple-glass-card rounded-[28px] p-6">
            <div className="mb-4 flex items-center gap-3">
              <Calculator className="h-6 w-6 text-indigo-600" />
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">积分系统</h3>
            </div>
            <p className="mb-4 text-sm leading-6 text-[var(--text-secondary)]">
              积分模型由管理员统一配置，用户调用时会直接扣减积分，无需单独填写对应模型的 API Key。
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="apple-soft-card rounded-[22px] p-4">
                <p className="text-2xl font-semibold text-[var(--text-primary)]">
                  {userBalance !== null ? userBalance.toString() : '--'}
                </p>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">当前可用积分</p>
              </div>
              <div className="apple-soft-card rounded-[22px] p-4">
                <p className="text-2xl font-semibold text-[var(--text-primary)]">{adminModels.length}</p>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">可用积分模型</p>
              </div>
              <div className="apple-soft-card rounded-[22px] p-4">
                <p className="text-2xl font-semibold text-[var(--text-primary)]">联系管理员</p>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">充值与补充方式</p>
              </div>
            </div>
          </div>

          <div className="apple-table-card">
            <div className="border-b border-[rgba(148,163,184,0.14)] px-6 py-5">
              <h4 className="text-lg font-medium text-[var(--text-primary)]">积分模型列表</h4>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {adminModels.length > 0 ? (
                  adminModels.map((model) => (
                    <div key={model.id} className="apple-soft-card flex items-center justify-between rounded-[22px] p-4">
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{model.displayName}</p>
                        <p className="text-sm text-[var(--text-tertiary)]">{model.id}@system</p>
                      </div>
                      <span className="apple-badge warn">{model.creditCost} 积分 / 次</span>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">暂无积分模型，或正在加载中...</p>
                )}
              </div>
            </div>
          </div>

          <div className="apple-note-card flex items-start gap-3 rounded-[24px] p-5">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-sky-600" />
            <div className="text-sm text-[var(--text-secondary)]">
              <p className="mb-1 font-medium text-sky-700">关于积分系统</p>
              <p>
                积分模型通过系统代理调用，用户无需再单独配置 API Key；调用时会自动扣减对应积分，积分不足时请先联系管理员充值。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  const contentBlocks = React.Children.toArray(content.props.children);

  return (
    <div className="apple-page-shell">
      <header className="apple-topbar">
        <div className="apple-shell py-4">{contentBlocks[0]}</div>
      </header>
      <main className="apple-shell py-6">{contentBlocks.slice(1)}</main>
    </div>
  );
};

export default CostEstimation;
