import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, LayoutDashboard, Key, DollarSign, HardDrive, ScrollText, ChevronRight, Activity, AlertTriangle, Sparkles, Plus, Trash2, FolderOpen, Globe, Loader2, RefreshCw, Copy, Check, Pause, Play, Zap } from 'lucide-react';
import { modelRegistry, ActiveModel } from '../services/modelRegistry';
import { MODEL_PRESETS } from '../services/modelPresets';
import { KeyManager, KeySlot, keyManager } from '../services/keyManager';
import { getTodayCosts, getCostsByModel, CostBreakdownItem } from '../services/costService';
import { getTodayLogs, LogLevel, exportLogsForAI, SystemLogEntry } from '../services/systemLogService';
import { useCanvas } from '../context/CanvasContext';
import { syncService } from '../services/syncService';
import { getStorageUsage, cleanupOriginals } from '../services/imageStorage';
import { fileSystemService } from '../services/fileSystemService';
import ApiManagementView from './ApiManagementView';


export type SettingsView = 'dashboard' | 'api-management' | 'cost-estimation' | 'storage-settings' | 'system-logs';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    initialView?: SettingsView;
}

// --- Sub-components ---

const BudgetAlerts = ({ totalRemaining, dailyRemaining, isTotalUnlimited, isDailyUnlimited }: { totalRemaining: number, dailyRemaining: number, isTotalUnlimited: boolean, isDailyUnlimited: boolean }) => {
    // Determine Alert State
    let alertType: 'none' | 'info' | 'warning' | 'critical' | 'daily' = 'none';
    let message = '';
    let subMessage = '';

    // Priority: Critical Total > Warning Total > Daily Low > Info Total
    if (!isTotalUnlimited && totalRemaining < 1) {
        alertType = 'critical';
        message = 'API 预算严重不足';
        subMessage = '剩余 < 1%，请立即扩容';
    } else if (!isTotalUnlimited && totalRemaining < 10) {
        alertType = 'warning';
        message = 'API 预算告急';
        subMessage = '剩余 < 10%，请注意充值';
    } else if (!isDailyUnlimited && dailyRemaining < 5) {
        alertType = 'daily';
        message = '今日预算即将耗尽';
        subMessage = '今日剩余 < 5%';
    } else if (!isTotalUnlimited && totalRemaining < 20) {
        alertType = 'info';
        message = 'API 预算提醒';
        subMessage = '剩余 < 20%';
    }

    if (alertType === 'none') return null;

    // Color Config
    const config = {
        critical: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20', ping: 'bg-red-500' },
        warning: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20', ping: 'bg-orange-500' },
        info: { icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20', ping: 'bg-blue-400' },
        daily: { icon: Zap, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20', ping: 'bg-purple-500' }
    }[alertType];

    const Icon = config.icon;

    return (
        <div className={`fixed z-[10002] animate-in slide-in-from-bottom-4 fade-in duration-500 pointer-events-none
            /* Mobile: Top Center */
            top-6 left-1/2 -translate-x-1/2 w-max max-w-[90vw]
            /* Desktop: Bottom Right */
            md:top-auto md:left-auto md:bottom-6 md:right-6 md:transform-none
        `}>
            <div className="glass-strong rounded-full py-2 pl-3 pr-4 flex items-center gap-3 shadow-2xl" style={{ border: '1px solid var(--border-light)' }}>
                {/* Icon & Pulse */}
                <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${config.bg} ${config.color}`}>
                    <Icon size={14} className="animate-pulse" />
                    <span className={`absolute top-0 right-0 w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] animate-ping ${config.ping}`} />
                    <span className={`absolute top-0 right-0 w-2 h-2 rounded-full ${config.ping}`} />
                </div>

                {/* Text */}
                <div className="flex flex-col items-start mr-1">
                    <span className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{message}</span>
                    <span className="text-[10px] font-mono leading-tight" style={{ color: 'var(--text-tertiary)' }}>{subMessage}</span>
                </div>
            </div>
        </div>
    );
};


const DashboardView = ({ keyStats, totalConsumed, totalTokens }: { keyStats: any, totalConsumed: number, totalTokens: number }) => {
    const [dailyCosts, setDailyCosts] = React.useState(getTodayCosts());
    const [budget, setBudget] = React.useState<number>(-1);
    const [isEditingBudget, setIsEditingBudget] = React.useState(false);
    const [newBudget, setNewBudget] = React.useState('');
    const [latency, setLatency] = React.useState<number>(0);

    useEffect(() => {
        import('../services/costService').then(mod => {
            setBudget(mod.getDailyBudget());
            setDailyCosts(mod.getTodayCosts());
        });

        // Latency Check
        const checkLatency = async () => {
            const start = performance.now();
            try {
                // Pin a Google common endpoint
                await fetch('https://www.gstatic.com/generate_204', { mode: 'no-cors', cache: 'no-cache' });
                const end = performance.now();
                setLatency(Math.round(end - start));
            } catch (e) {
                // Ignore errors
            }
        };
        checkLatency();
        const interval = setInterval(checkLatency, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleSaveBudget = async () => {
        const val = parseFloat(newBudget);
        if (!isNaN(val) && val >= 0) {
            const mod = await import('../services/costService');
            mod.setDailyBudget(val);
            setBudget(val);
        } else {
            // Treat empty or invalid as unlimited if intended, 
            // but here let's assume specific input. 
            // If user clears input, maybe set to -1?
            if (newBudget.trim() === '') {
                const mod = await import('../services/costService');
                mod.setDailyBudget(-1);
                setBudget(-1);
            }
        }
        setIsEditingBudget(false);
    };

    const toggleInfinite = async () => {
        const mod = await import('../services/costService');
        mod.setDailyBudget(-1);
        setBudget(-1);
        setIsEditingBudget(false);
    };

    const [isSyncing, setIsSyncing] = React.useState(false);
    const [isSuccess, setIsSuccess] = React.useState(false);

    const handleSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        setIsSuccess(false);
        try {
            const { forceSync } = await import('../services/costService');
            await forceSync();
            // Reload budget and costs after sync to reflect merged data
            const mod = await import('../services/costService');
            setBudget(mod.getDailyBudget());
            setDailyCosts(mod.getTodayCosts());

            setIsSuccess(true);
            setTimeout(() => setIsSuccess(false), 2000);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSyncing(false);
        }
    };

    // dailyCosts is already the DailyCostData for today
    const todayData = {
        count: dailyCosts.totalImages,
        tokens: dailyCosts.totalTokens,
        costUsd: dailyCosts.totalCostUsd
    };

    // Remaining Budget view:
    // If infinite (-1): 100% full.
    // If limited (>0): 100% - usage%.
    const usagePercent = budget > 0 ? (todayData.costUsd / budget) * 100 : 0;
    const remainingPercent = budget < 0 ? 100 : Math.max(0, 100 - usagePercent);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>仪表盘 (Dashboard)</h2>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>实时监控 API 消耗与系统状态</p>
                </div>
                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className={`
                        relative overflow-hidden group px-4 py-2 rounded-full border transition-all duration-300
                        ${isSuccess
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                            : 'bg-[var(--bg-tertiary)] border-[var(--border-light)] text-zinc-300 hover:text-white hover:border-[var(--border-medium)]'
                        }
                    `}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent absolute-shine translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <div className="flex items-center gap-2 relative z-10">
                        {isSuccess ? <Check size={14} /> : <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />}
                        <span className="text-xs font-medium">{isSuccess ? '已同步' : '同步数据'}</span>
                    </div>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-4 h-auto md:h-[320px]">
                {/* 1. Hero Card: Today Consumption (Cost & Tokens) */}
                {(() => {
                    const dailyUsage = todayData.costUsd || 0;
                    const dailyTokens = todayData.tokens || 0;

                    return (
                        <div className="col-span-1 md:col-span-2 md:row-span-2 bg-gradient-to-br from-indigo-500/10 via-[var(--bg-secondary)] to-[var(--bg-secondary)] p-6 rounded-[32px] border border-[var(--border-light)] relative overflow-hidden group flex flex-col justify-between">
                            <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-indigo-500/10" />

                            <div className="relative z-10 flex items-center gap-2">
                                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><ScrollText size={20} /></div>
                                <div>
                                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">今日消耗</span>
                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-600 ml-2">(每天0点重置)</span>
                                </div>
                            </div>

                            <div className="relative z-10">
                                <div className="flex items-baseline gap-1 mb-1">
                                    <span className="text-xl font-medium" style={{ color: 'var(--text-tertiary)' }}>$</span>
                                    <span className="text-4xl md:text-6xl font-bold font-mono tracking-tight text-shadow-lg" style={{ color: 'var(--text-primary)' }}>{dailyUsage.toFixed(4)}</span>
                                </div>
                                <div className="text-sm text-zinc-500 flex items-center gap-2 mb-6">
                                    <span>约 ¥{(dailyUsage * 7.2).toFixed(2)} CNY</span>
                                </div>

                                <div className="p-4 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--border-light)] flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg"><Activity size={20} /></div>
                                        <div>
                                            <div className="text-xs text-zinc-600 dark:text-zinc-500 uppercase tracking-wider">今日 Token 消耗</div>
                                            <div className="font-mono font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                                                {dailyTokens.toLocaleString()} <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>Tokens</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* 2. Global Status: Total Consumption Budget */}
                {(() => {
                    const slots = keyManager.getSlots();
                    const totalBudget = slots.reduce((acc, s) => acc + (s.budgetLimit > 0 ? s.budgetLimit : 0), 0);
                    const hasUnlimited = slots.some(s => s.budgetLimit < 0);
                    const isTotalUnlimited = totalBudget === 0 && hasUnlimited;
                    const remainingAmount = isTotalUnlimited ? 0 : Math.max(0, totalBudget - totalConsumed);
                    const remainingPercent = isTotalUnlimited || totalBudget === 0
                        ? 100
                        : Math.max(0, ((totalBudget - totalConsumed) / totalBudget) * 100);

                    // Color Logic: Blue (>50%) -> Yellow (>20%) -> Red (<20%)
                    const progressBarColor = isTotalUnlimited || remainingPercent > 50
                        ? 'bg-blue-500'
                        : remainingPercent > 20
                            ? 'bg-yellow-500'
                            : 'bg-red-500';

                    return (
                        <div className="col-span-1 md:col-span-2 md:row-span-1 bg-[var(--bg-secondary)] p-6 rounded-[32px] border border-[var(--border-light)] flex flex-col justify-center relative overflow-hidden hover:border-[var(--border-medium)] transition-colors group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-emerald-500/10 rounded-md text-emerald-500"><DollarSign size={20} /></div>
                                    <span className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">总消耗预算</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Token 总消耗</div>
                                    <div className="font-mono font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{(totalTokens / 1000).toFixed(1)}k</div>
                                </div>
                            </div>

                            {/* Budget Progress */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-500 font-mono">
                                    <span>剩余: {isTotalUnlimited ? '∞' : `$${remainingAmount.toFixed(2)}`}</span>
                                    <span>总额: {isTotalUnlimited ? '∞' : `$${totalBudget.toFixed(2)}`}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="h-3 flex-1 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 shadow-lg ${progressBarColor}`}
                                            style={{ width: isTotalUnlimited ? '100%' : `${remainingPercent}%` }}
                                        />
                                    </div>
                                    <div className="text-sm font-bold font-mono text-right w-14" style={{ color: 'var(--text-primary)' }}>
                                        {isTotalUnlimited ? '∞' : `${remainingPercent.toFixed(1)}%`}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* 3. API Status (Refined) */}
                {(() => {
                    const slots = keyManager.getSlots();
                    const totalCount = slots.length;
                    const activeCount = slots.filter(s => s.status === 'valid' && !s.disabled).length;
                    const abnormalCount = totalCount - activeCount;

                    return (
                        <div className="col-span-1 md:col-span-2 md:row-span-1 bg-[var(--bg-secondary)] p-6 rounded-[32px] border border-[var(--border-light)] flex items-center justify-between relative overflow-hidden hover:border-[var(--border-medium)] transition-colors group">
                            <div className="flex items-center gap-5">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${activeCount > 0 ? 'bg-emerald-500/10 text-emerald-500 shadow-emerald-500/10' : 'bg-red-500/10 text-red-500 shadow-red-500/10'}`}>
                                    <Key size={24} />
                                </div>
                                <div>
                                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>API 管理状态</div>
                                    <div className="flex gap-4 text-xs font-mono">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            <span style={{ color: 'var(--text-secondary)' }}>正常 <span className="text-emerald-500 font-bold ml-0.5">{activeCount}</span></span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${abnormalCount > 0 ? 'bg-red-500' : 'bg-zinc-600'}`} />
                                            <span style={{ color: 'var(--text-secondary)' }}>异常 <span className={`${abnormalCount > 0 ? 'text-red-500' : 'text-zinc-500'} font-bold ml-0.5`}>{abnormalCount}</span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>密钥总数</div>
                                <div className="text-2xl md:text-3xl font-bold font-mono tracking-tighter" style={{ color: 'var(--text-primary)' }}>{totalCount}</div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* System Status Section - Compact (Restored) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-[24px] border p-4 flex items-center gap-3 transition-colors" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    <div className="flex-1">
                        <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>系统状态</div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>运行正常</div>
                    </div>
                </div>
                <div className="rounded-[24px] border p-4 flex items-center gap-3 transition-colors" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
                    <div className={`w-2 h-2 rounded-full ${latency > 0 && latency < 200 ? 'bg-emerald-500' : latency > 0 ? 'bg-amber-500' : 'bg-zinc-600'}`} />
                    <div className="flex-1">
                        <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>延迟</div>
                        <div className="text-sm font-medium font-mono" style={{ color: 'var(--text-primary)' }}>{latency > 0 ? `${latency}ms` : 'Checking...'}</div>
                    </div>
                </div>
                <div className="rounded-[24px] border p-4 flex items-center gap-3 transition-colors" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <div className="flex-1">
                        <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>版本</div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>v1.2.7</div>
                    </div>
                </div>
            </div>
        </div>
    );
};


const CostEstimationView = () => {
    const [breakdown, setBreakdown] = useState<CostBreakdownItem[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [activeTab, setActiveTab] = useState<'summary' | 'detailed'>('summary');
    const [entries, setEntries] = useState<any[]>([]);

    useEffect(() => {
        setBreakdown(getCostsByModel());
        // Load recent entries
        const todayData = getTodayCosts();
        if (todayData.entries) {
            setEntries(todayData.entries.slice(-20).reverse()); // Last 20, newest first
        }
    }, []);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const { forceSync, getCostsByModel: refreshData, getTodayCosts: refreshCosts } = await import('../services/costService');
            await forceSync();
            setBreakdown(refreshData());
            const todayData = refreshCosts();
            if (todayData.entries) {
                setEntries(todayData.entries.slice(-20).reverse());
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-left" style={{ color: 'var(--text-primary)' }}>成本详情</h3>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg p-0.5">
                            <button
                                onClick={() => setActiveTab('summary')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'summary' ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:text-white'}`}
                            >
                                模型汇总
                            </button>
                            <button
                                onClick={() => setActiveTab('detailed')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'detailed' ? 'bg-indigo-500/20 text-white' : 'text-zinc-400 hover:text-white'}`}
                            >
                                详细记录
                            </button>
                        </div>
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="p-2 bg-[var(--bg-tertiary)] border border-[var(--border-light)] hover:bg-white/5 text-zinc-400 hover:text-white rounded-lg transition-colors"
                            title="从云端同步数据"
                        >
                            <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>
                <p className="text-xs text-zinc-500 text-center w-full">按模型和规格统计的详细使用记录</p>
            </div>

            {/* Desktop Table View - Summary */}
            {activeTab === 'summary' && (
                <div className="hidden md:block bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[32px] overflow-x-auto shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-light)]">
                            <tr>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>模型</th>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>规格</th>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider text-right" style={{ color: 'var(--text-tertiary)' }}>数量</th>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider text-right" style={{ color: 'var(--text-tertiary)' }}>Tokens</th>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider text-right" style={{ color: 'var(--text-tertiary)' }}>成本</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {breakdown.length === 0 ? (
                                <tr><td colSpan={5} className="p-12 text-center" style={{ color: 'var(--text-tertiary)' }}>今日暂无数据</td></tr>
                            ) : (
                                breakdown.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-[var(--toolbar-hover)] transition-colors group">
                                        <td className="px-5 py-4 font-medium" style={{ color: 'var(--text-primary)' }}>{item.model}</td>
                                        <td className="px-5 py-4 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>{item.imageSize || 'Default'}</td>
                                        <td className="px-5 py-4 text-right font-mono" style={{ color: 'var(--text-primary)' }}>{item.count}</td>
                                        <td className="px-5 py-4 text-right font-mono text-indigo-500 opacity-80 group-hover:opacity-100 transition-opacity">
                                            {(item.tokens || 0).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4 text-right font-mono text-emerald-500 font-medium">
                                            ${item.cost.toFixed(5)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Desktop Table View - Detailed Entries (Last 20) */}
            {activeTab === 'detailed' && (
                <div className="hidden md:block bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[32px] overflow-x-auto shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-light)]">
                            <tr>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>时间</th>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>模型</th>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>规格</th>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider text-right" style={{ color: 'var(--text-tertiary)' }}>Tokens</th>
                                <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider text-right" style={{ color: 'var(--text-tertiary)' }}>成本</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {entries.length === 0 ? (
                                <tr><td colSpan={5} className="p-12 text-center text-zinc-500">今日暂无详细记录</td></tr>
                            ) : (
                                entries.map((entry, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                            {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </td>
                                        <td className="px-5 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{entry.model}</td>
                                        <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>{entry.imageSize || '-'}</td>
                                        <td className="px-5 py-3 text-right font-mono text-indigo-400 text-sm">
                                            {(entry.tokens || 0).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-3 text-right font-mono text-emerald-400 text-sm">
                                            ${entry.costUsd.toFixed(4)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    <div className="px-5 py-3 border-t border-[var(--border-light)] text-xs text-zinc-600 dark:text-zinc-500 text-center">
                        显示最近 {entries.length} 条记录 (最多 20 条)
                    </div>
                </div>
            )}

            {/* Mobile Vertical Card View */}
            <div className="md:hidden space-y-3">
                {breakdown.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 bg-[var(--bg-secondary)] rounded-[32px] border border-[var(--border-light)]">
                        今日暂无数据
                    </div>
                ) : (
                    breakdown.map((item, idx) => (
                        <div key={idx} className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[32px] p-5 shadow-sm space-y-3">
                            {/* Header: Model Name */}
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <span className="text-xs font-mono uppercase" style={{ color: 'var(--text-tertiary)' }}>Model</span>
                                    <div className="font-bold text-base break-all" style={{ color: 'var(--text-primary)' }}>{item.model}</div>
                                </div>
                                <div className="text-right space-y-1">
                                    <span className="text-xs text-zinc-500 font-mono uppercase">Cost</span>
                                    <div className="text-emerald-400 font-mono font-bold">${item.cost.toFixed(5)}</div>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-white/5" />

                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-[var(--bg-tertiary)] rounded-2xl p-2">
                                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Size</div>
                                    <div className="text-zinc-300 font-mono text-xs">{item.imageSize || 'Default'}</div>
                                </div>
                                <div className="bg-[var(--bg-tertiary)] rounded-2xl p-2">
                                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Count</div>
                                    <div className="text-zinc-300 font-mono text-xs">{item.count}</div>
                                </div>
                                <div className="bg-[var(--bg-tertiary)] rounded-2xl p-2">
                                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Tokens</div>
                                    <div className="text-indigo-400 font-mono text-xs">{(item.tokens || 0).toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="text-xs text-zinc-500 p-6 bg-[var(--bg-tertiary)] rounded-[32px] border border-[var(--border-light)] space-y-6">
                <div className="flex items-center justify-between mb-4">
                    <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>💰 官方定价参考</p>
                    <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer" className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                        <span>查看官方文档</span>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M10 6.5V10.5C10 10.7761 9.77614 11 9.5 11H1.5C1.22386 11 1 10.7761 1 10.5V2.5C1 2.22386 1.22386 2 1.5 2H5.5M7 1H11M11 1V5M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </a>
                </div>

                {/* 1. 文本模型 */}
                <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <div className="w-3 h-3 bg-blue-500 rounded-sm" />
                        📝 文本模型 (Token计费)
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">Gemini 3 Pro Preview</span>
                            <span className="text-blue-400 font-mono">$2.00/$12.00</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">Gemini 3 Flash Preview</span>
                            <span className="text-blue-400 font-mono">$0.50/$3.00</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">Gemini 2.5 Pro</span>
                            <span className="text-blue-400 font-mono">$1.25/$10.00</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-400">Gemini 2.5 Flash</span>
                            <span className="text-blue-400 font-mono">$0.30/$2.50</span>
                        </div>
                        <div className="flex justify-between items-center md:col-span-2">
                            <span className="text-zinc-400">Gemini 2.5 Flash-Lite</span>
                            <span className="text-blue-400 font-mono">$0.10/$0.40</span>
                        </div>
                    </div>
                    <div className="text-[10px] text-zinc-600 pl-5">
                        💡 格式: 输入价格/输出价格 (每100万tokens, 美元)
                    </div>
                </div>

                {/* 2. 图像模型 */}
                <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                        🖼️ 图像模型
                    </div>

                    {/* Imagen 4 */}
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-3 space-y-2">
                        <div className="text-[10px] text-emerald-400 font-semibold mb-2">Imagen 4 (固定计费)</div>
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                            <div className="flex flex-col items-center gap-1 bg-[var(--bg-tertiary)] rounded-lg py-2">
                                <span className="text-zinc-500">Fast</span>
                                <span className="text-emerald-400 font-mono font-bold">$0.02</span>
                            </div>
                            <div className="flex flex-col items-center gap-1 bg-[var(--bg-tertiary)] rounded-lg py-2">
                                <span className="text-zinc-500">Standard</span>
                                <span className="text-emerald-400 font-mono font-bold">$0.04</span>
                            </div>
                            <div className="flex flex-col items-center gap-1 bg-[var(--bg-tertiary)] rounded-lg py-2">
                                <span className="text-zinc-500">Ultra</span>
                                <span className="text-emerald-400 font-mono font-bold">$0.06</span>
                            </div>
                        </div>
                    </div>

                    {/* Gemini Image */}
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-3 space-y-2">
                        <div className="text-[10px] text-indigo-400 font-semibold mb-2">Gemini Image (Token计费)</div>
                        <div className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between items-center">
                                <span className="text-zinc-400">2.5 Flash Image</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-indigo-400 font-mono">$0.039</span>
                                    <span className="text-[9px] text-zinc-600">(1290 tokens)</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-zinc-400">3 Pro Image 1K-2K</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-indigo-400 font-mono">$0.134</span>
                                    <span className="text-[9px] text-zinc-600">(1120 tokens)</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-zinc-400">3 Pro Image 4K</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-indigo-400 font-mono">$0.24</span>
                                    <span className="text-[9px] text-zinc-600">(2000 tokens)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. 视频模型 */}
                <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                        <div className="w-3 h-3 bg-purple-500 rounded-sm" />
                        🎬 视频模型 (按秒计费)
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-xl p-3 space-y-2 text-[11px]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <div className="text-[10px] text-purple-400 font-semibold mb-1">Veo 3.1 标准</div>
                                <div className="flex justify-between items-center">
                                    <span className="text-zinc-500">720p/1080p</span>
                                    <span className="text-purple-400 font-mono">$0.40/秒</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-zinc-500">4K</span>
                                    <span className="text-purple-400 font-mono">$0.60/秒</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] text-purple-400 font-semibold mb-1">Veo 3.1 Fast</div>
                                <div className="flex justify-between items-center">
                                    <span className="text-zinc-500">720p/1080p</span>
                                    <span className="text-purple-400 font-mono">$0.15/秒</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-zinc-500">4K</span>
                                    <span className="text-purple-400 font-mono">$0.35/秒</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="text-[10px] text-zinc-600 pl-5">
                        ⏱️ 视频费用 = 价格/秒 × 视频时长(秒)
                    </div>
                </div>

                {/* 4. 底部说明 */}
                <div className="pt-3 border-t border-[var(--border-light)] space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] text-zinc-600">
                        <div>
                            <span className="text-zinc-500 font-semibold">Token计算:</span> 输入≈4字符/token, 参考图=560tokens/张
                        </div>
                        <div>
                            <span className="text-zinc-500 font-semibold">输出价格:</span> Flash=$30/1M, Pro=$120/1M
                        </div>
                    </div>
                    <div className="text-[10px] text-zinc-600">
                        <span className="text-zinc-500 font-semibold">视频模式:</span> 0张=文生视频, 1张=首帧生成, 2张=首尾帧, 3张=参考图生成
                    </div>
                </div>
            </div>
        </div >
    );
};

const StorageSettingsView = () => {
    const { connectLocalFolder, disconnectLocalFolder, changeLocalFolder, refreshLocalFolder, isConnectedToLocal, currentFolderName, state } = useCanvas();
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Usage Stats
    const [browserUsage, setBrowserUsage] = useState<number>(0);
    const [localUsage, setLocalUsage] = useState<number>(0);
    const [opfsUsage, setOpfsUsage] = useState<number>(0);

    // 🚀 新增：移动设备检测
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const supportsOPFS = 'storage' in navigator && 'getDirectory' in navigator.storage;
    const supportsNativeFS = 'showDirectoryPicker' in window;

    const loadStats = async () => {
        try {
            // Always load browser usage (it's the fallback/cache)
            const bUsage = await getStorageUsage();
            setBrowserUsage(bUsage);

            // If local, load local usage
            if (state.fileSystemHandle) {
                const lUsage = await fileSystemService.getFolderUsage(state.fileSystemHandle);
                setLocalUsage(lUsage);
            } else {
                setLocalUsage(0);
            }

            // 🚀 新增：加载OPFS使用量
            if (supportsOPFS) {
                try {
                    const { getOPFSUsage } = await import('../services/opfsService');
                    const oUsage = await getOPFSUsage();
                    setOpfsUsage(oUsage);
                } catch {
                    setOpfsUsage(0);
                }
            }
        } catch (e) {
            console.error('Failed to load stats', e);
        }
    };

    useEffect(() => {
        loadStats();
    }, [state.fileSystemHandle]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            if (isConnectedToLocal) {
                await refreshLocalFolder();
            }
            // Reload stats after refresh
            await loadStats();
        } finally {
            setRefreshing(false);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleConnectLocal = async () => {
        setLoading(true);
        try {
            await connectLocalFolder();
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const handleConnectBrowser = () => {
        setLoading(true);
        disconnectLocalFolder();
        setLoading(false);
    };

    const handleClearCache = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('确定要清理浏览器缓存吗？\n这将彻底删除缓存在浏览器中的所有临时图片。\n此操作不会影响「本地文件夹」中的文件。')) {
            setLoading(true);
            try {
                const { clearAllImages } = await import('../services/imageStorage');
                await clearAllImages();
                const { notify } = await import('../services/notificationService');
                notify.success('缓存已清理', '浏览器图片缓存已清空');
                await loadStats();
            } catch (e) {
                console.error('Clear cache failed', e);
            }
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 h-full flex flex-col px-1">
            <div className="flex-1">
                <h3 className="text-2xl font-bold flex items-center gap-3 text-left" style={{ color: 'var(--text-primary)' }}>
                    存储管理
                    <div className={`text-xs ml-2 font-normal px-2 py-0.5 rounded-full border ${isConnectedToLocal
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        : supportsOPFS && isMobile
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-[var(--bg-tertiary)] border-[var(--border-light)]'
                        }`} style={{ color: !isConnectedToLocal && !(supportsOPFS && isMobile) ? 'var(--text-tertiary)' : undefined }}>
                        {isConnectedToLocal ? '本地 (Local)' : supportsOPFS && isMobile ? 'OPFS (移动端)' : '临时 (Temp)'}
                    </div>
                    {isMobile && (
                        <div className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            📱 Mobile
                        </div>
                    )}
                </h3>
            </div>
            <p className="text-zinc-500 text-sm mt-1 text-left w-full">
                {isMobile
                    ? '移动端存储设置。数据将保存在浏览器私有文件系统(OPFS)中，性能接近原生。'
                    : '数据存储偏好设置。可在临时浏览器存储和本地文件系统之间切换。'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">


                <div
                    onClick={!isConnectedToLocal ? undefined : handleConnectBrowser}
                    className={`relative p-5 md:p-8 rounded-[24px] md:rounded-[32px] border transition-all duration-300 group flex flex-col justify-between overflow-hidden cursor-pointer
                    ${!isConnectedToLocal
                            ? 'bg-indigo-600/5 border-indigo-500/50 shadow-[0_0_40px_-10px_rgba(99,102,241,0.2)]'
                            : 'bg-[var(--bg-secondary)] border-[var(--border-light)] hover:border-indigo-500/30 hover:bg-white/5 opacity-60 hover:opacity-100'
                        }`}>

                    <div className="flex justify-between items-start">
                        <div className={`p-4 rounded-2xl ${!isConnectedToLocal ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-[var(--bg-tertiary)] text-zinc-500'}`}>
                            <Globe size={24} />
                        </div>
                        {!isConnectedToLocal && (
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                </span>
                                已激活 (ACTIVE)
                            </div>
                        )}
                    </div>

                    <div className="mt-8">
                        <h4 className={`text-lg font-bold ${!isConnectedToLocal ? '' : 'text-zinc-400'}`} style={{ color: !isConnectedToLocal ? 'var(--text-primary)' : undefined }}>临时文件 (Temp)</h4>
                        <div className={`text-4xl font-mono font-bold mt-2 ${!isConnectedToLocal ? 'text-indigo-400' : 'text-zinc-600'}`}>
                            {formatBytes(browserUsage)}
                        </div>
                        <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
                            数据存储在浏览器缓存中。
                            <br />
                            <span className="opacity-70">浏览器清理缓存时可能会丢失。</span>
                        </p>
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/5 flex gap-3">
                        <button
                            disabled={!isConnectedToLocal}
                            className={`flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all
                            ${!isConnectedToLocal
                                    ? 'bg-indigo-500/10 text-indigo-400 cursor-default'
                                    : 'bg-[var(--bg-tertiary)] text-zinc-300 hover:bg-indigo-600 hover:text-white hover:shadow-lg'}`}
                        >
                            {isConnectedToLocal ? '切换至临时模式' : '当前已激活'}
                        </button>

                        {isConnectedToLocal && (
                            <button
                                onClick={handleClearCache}
                                className="px-4 py-3 rounded-xl bg-[var(--bg-tertiary)] text-zinc-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 border border-transparent transition-all flex items-center justify-center cursor-pointer"
                                title="清理浏览器缓存(Clear Cache)"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Local Storage Card */}
                <div
                    onClick={isConnectedToLocal ? undefined : handleConnectLocal}
                    className={`relative p-5 md:p-8 rounded-[24px] md:rounded-[32px] border transition-all duration-300 group flex flex-col justify-between overflow-hidden cursor-pointer
                    ${isConnectedToLocal
                            ? 'bg-indigo-600/5 border-indigo-500/50 shadow-[0_0_40px_-10px_rgba(99,102,241,0.2)]'
                            : 'bg-[var(--bg-secondary)] border-[var(--border-light)] hover:border-indigo-500/30 hover:bg-white/5 opacity-60 hover:opacity-100'
                        }`}>

                    <div className="flex justify-between items-start">
                        <div className={`p-4 rounded-2xl ${isConnectedToLocal ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-[var(--bg-tertiary)] text-zinc-500'}`}>
                            <FolderOpen size={24} />
                        </div>
                        {isConnectedToLocal && (
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                </span>
                                已激活 (ACTIVE)
                            </div>
                        )}
                    </div>

                    <div className="mt-8">
                        <h4 className={`text-lg font-bold ${isConnectedToLocal ? '' : 'text-zinc-400'}`} style={{ color: isConnectedToLocal ? 'var(--text-primary)' : undefined }}>本地文件夹(Local)</h4>
                        <div className={`text-4xl font-mono font-bold mt-2 ${isConnectedToLocal ? 'text-indigo-400' : 'text-zinc-600'}`}>
                            {isConnectedToLocal ? formatBytes(localUsage) : '--'}
                        </div>
                        <div className="text-xs text-zinc-500 mt-4 leading-relaxed truncate">
                            {isConnectedToLocal ? (
                                <span className="flex items-center gap-1 text-indigo-300/80">
                                    <Check size={12} /> 已连接: {currentFolderName}
                                </span>
                            ) : (
                                "数据已保存到您的本地磁盘。"
                            )}
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-white/5 space-y-2">
                        {isConnectedToLocal ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setLoading(true); changeLocalFolder().finally(() => setLoading(false)); }}
                                    className="flex-1 py-3 bg-[var(--bg-tertiary)] hover:bg-white/5 text-zinc-300 rounded-xl text-xs font-bold transition-all border border-[var(--border-light)]"
                                >
                                    更改位置
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                                    className="px-4 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-xs font-bold transition-all border border-indigo-500/20 flex items-center justify-center"
                                    title="刷新 & 重新扫描"
                                >
                                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        ) : (
                            <button
                                disabled={isConnectedToLocal}
                                className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all
                                ${isConnectedToLocal
                                        ? 'bg-indigo-500/10 text-indigo-400 cursor-default'
                                        : 'bg-[var(--bg-tertiary)] text-zinc-300 hover:bg-indigo-600 hover:text-white hover:shadow-lg'}`}
                            >
                                切换至本地
                            </button>
                        )}
                    </div>
                </div>

                {/* 🚀 新增：OPFS存储卡片 (仅移动端显示) */}
                {isMobile && supportsOPFS && (
                    <div className="col-span-full relative p-5 md:p-8 rounded-[24px] md:rounded-[32px] border transition-all duration-300 bg-emerald-600/5 border-emerald-500/50 shadow-[0_0_40px_-10px_rgba(16,185,129,0.2)]">
                        <div className="flex justify-between items-start">
                            <div className="p-4 rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="6" width="20" height="12" rx="2" />
                                    <path d="M12 10v4" />
                                    <path d="M8 10v4" />
                                    <path d="M16 10v4" />
                                </svg>
                            </div>
                            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                移动端专用 (OPFS)
                            </div>
                        </div>

                        <div className="mt-6">
                            <h4 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>私有文件系统 (OPFS)</h4>
                            <div className="text-3xl font-mono font-bold mt-2 text-emerald-400">
                                {formatBytes(opfsUsage)}
                            </div>
                            <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
                                📱 移动端高性能存储，接近原生性能。
                                <br />
                                <span className="opacity-70">数据保存在浏览器私有文件系统中，不会被普通缓存清理删除。</span>
                            </p>
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-3 gap-4 text-xs">
                            <div className="text-center">
                                <div className="text-emerald-400 font-bold">✓ 高性能</div>
                                <div className="text-zinc-500">接近原生速度</div>
                            </div>
                            <div className="text-center">
                                <div className="text-emerald-400 font-bold">✓ 大容量</div>
                                <div className="text-zinc-500">存储上千张图</div>
                            </div>
                            <div className="text-center">
                                <div className="text-emerald-400 font-bold">✓ 流式写入</div>
                                <div className="text-zinc-500">不占用内存</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {
                loading && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 rounded-[32px]">
                        <div className="bg-[var(--bg-tertiary)] p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95">
                            <Loader2 size={40} className="text-indigo-500 animate-spin" />
                            <div className="text-white font-medium">正在切换存储模式...</div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

const SystemLogsView = () => {
    const [logs, setLogs] = useState<SystemLogEntry[]>([]);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setLogs(getTodayLogs());
    }, []);

    const handleCopy = () => {
        const text = exportLogsForAI();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col gap-3 items-start sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white text-left">系统日志</h3>
                </div>
                <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-light)] hover:bg-white/5 hover:text-white rounded-lg text-sm text-zinc-400 transition-colors">
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    {copied ? '已复制' : '导出日志'}
                </button>
            </div>
            <p className="text-xs text-zinc-500 text-left w-full">调试信息与错误追踪</p>



            <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[32px] flex-1 overflow-hidden flex flex-col shadow-inner relative">
                {logs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 gap-3">
                        <div className="p-4 bg-[var(--bg-tertiary)] rounded-full mb-2">
                            <ScrollText size={32} className="opacity-50" />
                        </div>
                        <p className="font-mono text-sm">暂无关键日志 (No Critical Logs)</p>
                        <div className="flex items-center gap-2 text-xs bg-emerald-500/5 text-emerald-500 px-3 py-1.5 rounded-full border border-emerald-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            系统运行正常 ((Active & Healthy))
                        </div>
                    </div>
                ) : (
                    <div className="overflow-y-auto p-4 space-y-2 scrollbar-thin font-mono text-xs">
                        {logs.slice().reverse().map((log) => (
                            <div key={log.id} className="group relative pl-4 border-l-2 border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors py-1">
                                <div className="flex items-center gap-2 mb-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <span className="text-zinc-500 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                    <span className={`px-1.5 rounded text-[10px] font-bold ${log.level === LogLevel.ERROR ? 'text-red-400 bg-red-500/10' :
                                        log.level === LogLevel.WARNING ? 'text-orange-400 bg-orange-500/10' :
                                            'text-blue-400 bg-blue-500/10'
                                        }`}>{log.level}</span>
                                    <span className="text-zinc-500">@{log.source}</span>
                                </div>
                                <div className="text-zinc-300 break-words leading-relaxed pl-1">{log.message}</div>
                                {log.details && (
                                    <div className="mt-1 pl-1">
                                        <pre className="text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors overflow-x-auto whitespace-pre-wrap">
                                            {log.details}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div >
    );
};

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, initialView = 'dashboard' }) => {
    const [activeView, setActiveView] = useState<SettingsView>(initialView);
    const [keyStats, setKeyStats] = useState(keyManager.getStats());
    const [slots, setSlots] = useState(keyManager.getSlots());
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    const totalConsumed = slots.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const totalTokens = slots.reduce((sum, s) => sum + (s.usedTokens || 0), 0);

    useEffect(() => {
        setActiveView(initialView);
    }, [initialView, isOpen]);

    useEffect(() => {
        const unsub = keyManager.subscribe(() => {
            setKeyStats(keyManager.getStats());
            setSlots(keyManager.getSlots());
        });
        return unsub;
    }, []);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Mobile Navigation Auto-Hide Logic
    const [isNavVisible, setIsNavVisible] = useState(true);
    const navTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const touchStartY = useRef<number | null>(null);

    const handleInteract = () => {
        setIsNavVisible(true);
        if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        navTimeoutRef.current = setTimeout(() => {
            setIsNavVisible(false);
        }, 5000);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        handleInteract();
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartY.current === null) return;
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
        // Swipe Up (Negative delta)
        if (deltaY < -20) {
            handleInteract();
        }
        touchStartY.current = null;
    };

    // Initial timer
    useEffect(() => {
        if (isMobile) {
            handleInteract();
        }
        return () => {
            if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        };
    }, [isMobile]);

    if (!isOpen) return null;

    const navItems: { id: SettingsView; label: string; icon: any }[] = [
        { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
        { id: 'api-management', label: 'API 管理', icon: Key },
        { id: 'cost-estimation', label: '成本', icon: DollarSign },
        { id: 'storage-settings', label: '存储', icon: HardDrive },
        { id: 'system-logs', label: '日志', icon: ScrollText },
    ];

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-xl animate-in fade-in duration-200 settings-panel" onClick={onClose}>
            {!isMobile ? (
                /* --- Desktop Layout - VisionOS Style --- */
                <div
                    className="hidden md:flex w-[980px] h-[640px] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                    style={{
                        backgroundColor: 'var(--bg-secondary)',
                        backdropFilter: 'blur(24px) saturate(150%)',
                        WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                        border: '1px solid var(--border-light)',
                        boxShadow: 'var(--shadow-xl)'
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Desktop Sidebar */}
                    <div className="w-64 border-r flex flex-col p-4 shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }}>
                        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20" style={{ background: 'var(--gradient-primary)', color: 'white' }}>
                                <LayoutDashboard size={18} />
                            </div>
                            <span className="font-bold tracking-tight text-lg" style={{ color: 'var(--text-primary)' }}>系统设置</span>
                        </div>

                        <div className="space-y-1">
                            {navItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveView(item.id)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
                                    style={{
                                        backgroundColor: activeView === item.id ? 'var(--toolbar-active)' : 'transparent',
                                        color: activeView === item.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                                    }}
                                >
                                    <item.icon size={16} />
                                    {item.label === '仪表盘' ? '仪表盘(Dashboard)' :
                                        item.label === 'API 管理' ? 'API 管理 (Management)' :
                                            item.label === '成本' ? '成本估算 (Cost)' :
                                                item.label === '存储' ? '存储位置 (Storage)' :
                                                    '系统日志 (Logs)'}
                                    {activeView === item.id && <ChevronRight size={14} className="ml-auto opacity-50" />}
                                </button>
                            ))}
                        </div>

                        <div className="mt-auto pt-4" style={{ borderTop: '1px solid var(--border-light)' }}>
                            <div className="px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                                <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>总消耗(Total Consumption)</div>
                                <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>${totalConsumed.toFixed(4)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Desktop Content */}
                    <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-secondary)]">
                        <div className="h-14 border-b flex items-center justify-end px-6 sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', backdropFilter: 'blur(12px)' }}>
                            <button onClick={onClose} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-tertiary)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
                            <div className="max-w-4xl mx-auto">
                                {activeView === 'dashboard' && <DashboardView keyStats={keyStats} totalConsumed={totalConsumed} totalTokens={totalTokens} />}
                                {activeView === 'api-management' && <ApiManagementView />}
                                {activeView === 'cost-estimation' && <CostEstimationView />}
                                {activeView === 'storage-settings' && <StorageSettingsView />}
                                {activeView === 'system-logs' && <SystemLogsView />}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* --- Mobile Layout (Window/Card Style for iOS) --- */
                <div
                    className="fixed inset-0 w-full h-full flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 z-[10001]"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                    onClick={(e) => {
                        e.stopPropagation();
                        // Handle tap to show nav
                        if (!activeView) return; // specific logic if needed
                        handleInteract();
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                >
                    {/* Mobile Header (iOS Style) */}
                    <div className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-20 shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', backdropFilter: 'blur(12px)' }}>
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: 'var(--accent-indigo)' }}>
                                <LayoutDashboard size={14} />
                            </div>
                            <span className="font-bold text-[17px] tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>
                                {(() => {
                                    const item = navItems.find(n => n.id === activeView);
                                    if (!item) return '设置';
                                    const map: Record<string, string> = {
                                        '仪表盘': '仪表盘',
                                        'API 管理': 'API 管理',
                                        '成本': '成本估算',
                                        '存储': '存储位置',
                                        '日志': '系统日志'
                                    };
                                    return map[item.label] || item.label;
                                })()}
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90"
                            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Mobile Content (Scrollable) */}
                    <div
                        className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-4"
                        style={{ backgroundColor: 'var(--bg-secondary)', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}
                        onScroll={() => {
                            // Optional: hide on scroll? User didn't strictly ask, but standard behavior.
                            // keeping simple auto-hide timer for now.
                            handleInteract();
                        }}
                    >
                        {/* Dynamic Content based on activeView */}
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {activeView === 'dashboard' && <DashboardView keyStats={keyStats} totalConsumed={totalConsumed} totalTokens={totalTokens} />}
                            {activeView === 'api-management' && <ApiManagementView />}
                            {activeView === 'cost-estimation' && <CostEstimationView />}
                            {activeView === 'storage-settings' && <StorageSettingsView />}
                            {activeView === 'system-logs' && <SystemLogsView />}
                        </div>
                    </div>

                    {/* Mobile Bottom Navigation Bar (Floating Glass Pill - iOS 26 Style) */}
                    <div
                        className={`absolute bottom-4 left-4 right-4 h-16 rounded-[24px] flex items-center justify-around px-2 z-[10002] liquid-glass transition-all duration-300 ease-out pb-safe mb-safe
                        ${isNavVisible ? 'translate-y-0 opacity-100' : 'translate-y-[150%] opacity-0 pointer-events-none'}`}
                        style={{
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                            backdropFilter: 'blur(20px) saturate(180%)',
                            backgroundColor: 'rgba(20, 20, 25, 0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                    >
                        {navItems.map(item => (
                            <button
                                key={item.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveView(item.id);
                                    handleInteract();
                                }}
                                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all active:scale-90 touch-target
                                    ${activeView === item.id
                                        ? 'text-white'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                <div className={`flex items-center justify-center transition-all duration-300`}>
                                    <item.icon size={20} strokeWidth={activeView === item.id ? 2.5 : 2} />
                                </div>
                                <span className={`text-[10px] font-medium tracking-tight leading-tight text-center transition-all duration-300 ${activeView === item.id
                                    ? 'opacity-100'
                                    : 'opacity-60'
                                    }`}>
                                    {item.label === '仪表盘' ? '概览' :
                                        item.label === 'API 管理' ? '通道' :
                                            item.label === '成本' ? '成本' :
                                                item.label === '存储' ? '存储' : '日志'}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPanel;
