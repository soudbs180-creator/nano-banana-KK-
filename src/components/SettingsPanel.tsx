import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, LayoutDashboard, Key, DollarSign, HardDrive, ScrollText, ChevronRight, Activity, AlertTriangle, Sparkles, Plus, Trash2, FolderOpen, Globe, Loader2, RefreshCw, Copy, Check, Pause, Play, Zap, Settings2 } from 'lucide-react';
import { modelRegistry, ActiveModel } from '../services/modelRegistry';
import { MODEL_PRESETS } from '../services/modelPresets';
import { KeyManager, KeySlot, keyManager } from '../services/keyManager';
import { getTodayCosts, getCostsByModel, CostBreakdownItem } from '../services/costService';
import { getTodayLogs, LogLevel, exportLogsForAI, SystemLogEntry } from '../services/systemLogService';
import { useCanvas } from '../context/CanvasContext';
import { syncService } from '../services/syncService';
import { getStorageUsage, cleanupOriginals } from '../services/imageStorage';
import { fileSystemService } from '../services/fileSystemService';
import { ApiChannelsView } from './ApiChannelsView';

export type SettingsView = 'dashboard' | 'api-channels' | 'cost-estimation' | 'storage-settings' | 'system-logs';

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
            <div className="bg-[#18181b]/90 backdrop-blur-xl border border-white/10 rounded-full py-2 pl-3 pr-4 flex items-center gap-3 shadow-2xl">
                {/* Icon & Pulse */}
                <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${config.bg} ${config.color}`}>
                    <Icon size={14} className="animate-pulse" />
                    <span className={`absolute top-0 right-0 w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] animate-ping ${config.ping}`} />
                    <span className={`absolute top-0 right-0 w-2 h-2 rounded-full ${config.ping}`} />
                </div>

                {/* Text */}
                <div className="flex flex-col items-start mr-1">
                    <span className="text-sm font-bold text-white leading-tight">{message}</span>
                    <span className="text-[10px] text-zinc-400 font-mono leading-tight">{subMessage}</span>
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
                    <h2 className="text-2xl font-bold text-white tracking-tight">仪表盘 (Dashboard)</h2>
                    <p className="text-xs text-zinc-500 mt-1">实时监控 API 消耗与系统状态</p>
                </div>
                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className={`
                        relative overflow-hidden group px-4 py-2 rounded-full border transition-all duration-300
                        ${isSuccess
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                            : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white hover:border-zinc-600'
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
                        <div className="col-span-1 md:col-span-2 md:row-span-2 bg-gradient-to-br from-indigo-500/10 via-[#1c1c1e] to-[#1c1c1e] p-6 rounded-[32px] border border-indigo-500/20 relative overflow-hidden group flex flex-col justify-between">
                            <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-indigo-500/10" />

                            <div className="relative z-10 flex items-center gap-2">
                                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><ScrollText size={20} /></div>
                                <div>
                                    <span className="text-zinc-400 font-medium">今日消耗</span>
                                    <span className="text-[10px] text-zinc-600 ml-2">(每天0点重置)</span>
                                </div>
                            </div>

                            <div className="relative z-10">
                                <div className="flex items-baseline gap-1 mb-1">
                                    <span className="text-xl text-zinc-400 font-medium">$</span>
                                    <span className="text-6xl font-bold text-white font-mono tracking-tight text-shadow-lg">{dailyUsage.toFixed(4)}</span>
                                </div>
                                <div className="text-sm text-zinc-500 flex items-center gap-2 mb-6">
                                    <span>约 ¥{(dailyUsage * 7.2).toFixed(2)} CNY</span>
                                </div>

                                <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg"><Activity size={20} /></div>
                                        <div>
                                            <div className="text-xs text-zinc-500 uppercase tracking-wider">今日 Token 消耗</div>
                                            <div className="text-white font-mono font-bold text-lg">
                                                {dailyTokens.toLocaleString()} <span className="text-xs text-zinc-500 font-normal">Tokens</span>
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
                        <div className="col-span-1 md:col-span-2 md:row-span-1 bg-[#1c1c1e] p-6 rounded-[32px] border border-zinc-800/50 flex flex-col justify-center relative overflow-hidden hover:border-zinc-700 transition-colors group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-emerald-500/10 rounded-md text-emerald-500"><DollarSign size={20} /></div>
                                    <span className="text-zinc-400 text-sm font-medium">总消耗预算</span>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-zinc-500 uppercase">Token 总消耗</div>
                                    <div className="text-white font-mono font-bold text-lg">{(totalTokens / 1000).toFixed(1)}k</div>
                                </div>
                            </div>

                            {/* Budget Progress */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-zinc-500 font-mono">
                                    <span>剩余: {isTotalUnlimited ? '∞' : `$${remainingAmount.toFixed(2)}`}</span>
                                    <span>总额: {isTotalUnlimited ? '∞' : `$${totalBudget.toFixed(2)}`}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="h-3 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 shadow-lg ${progressBarColor}`}
                                            style={{ width: isTotalUnlimited ? '100%' : `${remainingPercent}%` }}
                                        />
                                    </div>
                                    <div className="text-sm font-bold font-mono text-white text-right w-14">
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
                        <div className="col-span-1 md:col-span-2 md:row-span-1 bg-[#1c1c1e] p-6 rounded-[32px] border border-zinc-800/50 flex items-center justify-between relative overflow-hidden hover:border-zinc-700 transition-colors group">
                            <div className="flex items-center gap-5">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${activeCount > 0 ? 'bg-emerald-500/10 text-emerald-500 shadow-emerald-500/10' : 'bg-red-500/10 text-red-500 shadow-red-500/10'}`}>
                                    <Key size={24} />
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-zinc-400 mb-1">API 管理状态</div>
                                    <div className="flex gap-4 text-xs font-mono">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            <span className="text-zinc-300">正常 <span className="text-emerald-500 font-bold ml-0.5">{activeCount}</span></span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${abnormalCount > 0 ? 'bg-red-500' : 'bg-zinc-600'}`} />
                                            <span className="text-zinc-300">异常 <span className={`${abnormalCount > 0 ? 'text-red-500' : 'text-zinc-500'} font-bold ml-0.5`}>{abnormalCount}</span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-zinc-500 mb-1">密钥总数</div>
                                <div className="text-3xl font-bold text-zinc-300 font-mono tracking-tighter">{totalCount}</div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* System Status Section - Compact (Restored) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#1c1c1e] rounded-[24px] border border-zinc-800/50 p-4 flex items-center gap-3 hover:border-zinc-700 transition-colors">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">系统状态</div>
                        <div className="text-sm font-medium text-zinc-300">运行正常</div>
                    </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-[24px] border border-zinc-800/50 p-4 flex items-center gap-3 hover:border-zinc-700 transition-colors">
                    <div className={`w-2 h-2 rounded-full ${latency > 0 && latency < 200 ? 'bg-emerald-500' : latency > 0 ? 'bg-amber-500' : 'bg-zinc-600'}`} />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">延迟</div>
                        <div className="text-sm font-medium text-zinc-300 font-mono">{latency > 0 ? `${latency}ms` : 'Checking...'}</div>
                    </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-[24px] border border-zinc-800/50 p-4 flex items-center gap-3 hover:border-zinc-700 transition-colors">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">版本</div>
                        <div className="text-sm font-medium text-zinc-300">v1.2.0</div>
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
            <div className="hidden md:flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-bold text-white">成本详情</h3>
                    <p className="text-xs text-zinc-500 mt-1">按模型和规格统计的详细使用记录</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Tab Toggle */}
                    <div className="flex bg-zinc-800/50 rounded-lg p-0.5">
                        <button
                            onClick={() => setActiveTab('summary')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'summary' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            模型汇总
                        </button>
                        <button
                            onClick={() => setActiveTab('detailed')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'detailed' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                        >
                            详细记录
                        </button>
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
                        title="从云端同步数据"
                    >
                        <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Desktop Table View - Summary */}
            {activeTab === 'summary' && (
                <div className="hidden md:block bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-x-auto shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-900 border-b border-zinc-800">
                            <tr>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">模型</th>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">规格</th>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">数量</th>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">Tokens</th>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">成本</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {breakdown.length === 0 ? (
                                <tr><td colSpan={5} className="p-12 text-center text-zinc-500">今日暂无数据</td></tr>
                            ) : (
                                breakdown.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-800/30 transition-colors group">
                                        <td className="px-5 py-4 text-white font-medium">{item.model}</td>
                                        <td className="px-5 py-4 text-zinc-500 font-mono text-xs">{item.imageSize || 'Default'}</td>
                                        <td className="px-5 py-4 text-right font-mono text-zinc-300">{item.count}</td>
                                        <td className="px-5 py-4 text-right font-mono text-indigo-400 opacity-80 group-hover:opacity-100 transition-opacity">
                                            {(item.tokens || 0).toLocaleString()}
                                        </td>
                                        <td className="px-5 py-4 text-right font-mono text-emerald-400 font-medium">
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
                <div className="hidden md:block bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-x-auto shadow-sm">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-900 border-b border-zinc-800">
                            <tr>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">时间</th>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">模型</th>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">规格</th>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">Tokens</th>
                                <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">成本</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {entries.length === 0 ? (
                                <tr><td colSpan={5} className="p-12 text-center text-zinc-500">今日暂无详细记录</td></tr>
                            ) : (
                                entries.map((entry, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                                        <td className="px-5 py-3 text-zinc-400 font-mono text-xs">
                                            {new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </td>
                                        <td className="px-5 py-3 text-white text-sm">{entry.model}</td>
                                        <td className="px-5 py-3 text-zinc-500 font-mono text-xs">{entry.imageSize || '-'}</td>
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
                    <div className="px-5 py-3 border-t border-zinc-800/50 text-xs text-zinc-500 text-center">
                        显示最近 {entries.length} 条记录 (最多 20 条)
                    </div>
                </div>
            )}

            {/* Mobile Vertical Card View */}
            <div className="md:hidden space-y-3">
                {breakdown.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 bg-[#1c1c1e] rounded-[32px] border border-zinc-800">
                        今日暂无数据
                    </div>
                ) : (
                    breakdown.map((item, idx) => (
                        <div key={idx} className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] p-5 shadow-sm space-y-3">
                            {/* Header: Model Name */}
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <span className="text-xs text-zinc-500 font-mono uppercase">Model</span>
                                    <div className="text-white font-bold text-base break-all">{item.model}</div>
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
                                <div className="bg-zinc-900/50 rounded-2xl p-2">
                                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Size</div>
                                    <div className="text-zinc-300 font-mono text-xs">{item.imageSize || 'Default'}</div>
                                </div>
                                <div className="bg-zinc-900/50 rounded-2xl p-2">
                                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Count</div>
                                    <div className="text-zinc-300 font-mono text-xs">{item.count}</div>
                                </div>
                                <div className="bg-zinc-900/50 rounded-2xl p-2">
                                    <div className="text-[10px] text-zinc-500 uppercase mb-1">Tokens</div>
                                    <div className="text-indigo-400 font-mono text-xs">{(item.tokens || 0).toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="text-xs text-zinc-500 p-5 bg-zinc-900/50 rounded-[32px] border border-zinc-800/50">
                <p className="font-medium text-zinc-400 mb-3">计费参考</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Imagen */}
                    <div className="space-y-1.5">
                        <div className="text-[10px] text-zinc-300 font-semibold uppercase tracking-wider mb-1">Imagen 4</div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            <span>Fast: <span className="text-emerald-400 font-mono">$0.02</span>/张</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            <span>Ultra: <span className="text-emerald-400 font-mono">$0.06</span>/张</span>
                        </div>
                    </div>
                    {/* Gemini */}
                    <div className="space-y-1.5">
                        <div className="text-[10px] text-zinc-300 font-semibold uppercase tracking-wider mb-1">Gemini Image</div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            <span>2.5 Flash: <span className="text-indigo-400 font-mono">$0.039</span>/张(1290 tokens)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            <span>3 Pro (1K-2K): <span className="text-indigo-400 font-mono">$0.134</span>/张</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            <span>3 Pro (4K): <span className="text-indigo-400 font-mono">$0.24</span>/张</span>
                        </div>
                    </div>
                </div>
                <div className="mt-3 pt-3 border-t border-zinc-800/50 text-[10px] text-zinc-600">
                    Token 计费: Gemini 2.5 Flash Image 输出 $30/1M, Gemini 3 Pro Image 输出 $120/1M
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
            <div className="hidden md:block">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                    存储管理
                    <div className={`text-xs ml-2 font-normal px-2 py-0.5 rounded-full border ${isConnectedToLocal
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        }`}>
                        {isConnectedToLocal ? '本地 (Local)' : '临时 (Temp)'}
                    </div>
                </h3>
                <p className="text-zinc-500 text-sm mt-1 max-w-2xl">
                    数据存储偏好设置。可在临时浏览器存储和本地文件系统之间切换。
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">


                <div
                    onClick={!isConnectedToLocal ? undefined : handleConnectBrowser}
                    className={`relative p-5 md:p-8 rounded-[24px] md:rounded-[32px] border transition-all duration-300 group flex flex-col justify-between overflow-hidden cursor-pointer
                    ${!isConnectedToLocal
                            ? 'bg-indigo-600/5 border-indigo-500/50 shadow-[0_0_40px_-10px_rgba(99,102,241,0.2)]'
                            : 'bg-[#18181b] border-zinc-800/50 hover:border-indigo-500/30 hover:bg-zinc-800/50 opacity-60 hover:opacity-100'
                        }`}>

                    <div className="flex justify-between items-start">
                        <div className={`p-4 rounded-2xl ${!isConnectedToLocal ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-zinc-800 text-zinc-500'}`}>
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
                        <h4 className={`text-lg font-bold ${!isConnectedToLocal ? 'text-white' : 'text-zinc-400'}`}>临时文件 (Temp)</h4>
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
                                    : 'bg-zinc-800 text-zinc-300 hover:bg-indigo-600 hover:text-white hover:shadow-lg'}`}
                        >
                            {isConnectedToLocal ? '切换至临时模式' : '当前已激活'}
                        </button>

                        {isConnectedToLocal && (
                            <button
                                onClick={handleClearCache}
                                className="px-4 py-3 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 border border-transparent transition-all flex items-center justify-center cursor-pointer"
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
                            : 'bg-[#18181b] border-zinc-800/50 hover:border-indigo-500/30 hover:bg-zinc-800/50 opacity-60 hover:opacity-100'
                        }`}>

                    <div className="flex justify-between items-start">
                        <div className={`p-4 rounded-2xl ${isConnectedToLocal ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-zinc-800 text-zinc-500'}`}>
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
                        <h4 className={`text-lg font-bold ${isConnectedToLocal ? 'text-white' : 'text-zinc-400'}`}>本地文件夹(Local)</h4>
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
                                    className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition-all border border-white/5"
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
                                        : 'bg-zinc-800 text-zinc-300 hover:bg-indigo-600 hover:text-white hover:shadow-lg'}`}
                            >
                                切换至本地
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {
                loading && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 rounded-[32px]">
                        <div className="bg-[#18181b] p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95">
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
            <div className="flex justify-end md:justify-between items-center mb-2">
                <div className="hidden md:block">
                    <h3 className="text-2xl font-bold text-white">系统日志 (System Logs)</h3>
                    <p className="text-xs text-zinc-500 mt-1">调试信息与错误追踪(Debug & Trace)</p>
                </div>
                <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 hover:text-white rounded-lg text-sm text-zinc-400 transition-colors border border-transparent hover:border-zinc-600">
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    {copied ? '已复制(Copied)' : '导出日志 (Export Logs)'}
                </button>
            </div>



            <div className="bg-[#0f0f10] border border-zinc-800 rounded-[32px] flex-1 overflow-hidden flex flex-col shadow-inner relative">
                {logs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 gap-3">
                        <div className="p-4 bg-zinc-900 rounded-full mb-2">
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
                            <div key={log.id} className="group relative pl-4 border-l-2 border-zinc-800 hover:border-zinc-600 transition-colors py-1">
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

    if (!isOpen) return null;

    const navItems: { id: SettingsView; label: string; icon: any }[] = [
        { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
        { id: 'api-channels', label: 'API 管理', icon: Key },
        { id: 'cost-estimation', label: '成本', icon: DollarSign },
        { id: 'storage-settings', label: '存储', icon: HardDrive },
        { id: 'system-logs', label: '日志', icon: ScrollText },
    ];

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-xl animate-in fade-in duration-200" onClick={onClose}>
            {!isMobile ? (
                /* --- Desktop Layout - VisionOS Style --- */
                <div
                    className="hidden md:flex w-[980px] h-[640px] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                    style={{
                        backgroundColor: 'rgba(13, 13, 14, 0.85)',
                        backdropFilter: 'blur(40px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 32px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05) inset'
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Desktop Sidebar */}
                    <div className="w-64 border-r border-white/5 flex flex-col p-4 shrink-0" style={{ backgroundColor: 'rgba(22, 22, 24, 0.5)' }}>
                        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                                <LayoutDashboard size={18} />
                            </div>
                            <span className="font-bold text-white tracking-tight">系统设置</span>
                        </div>

                        <div className="space-y-1">
                            {navItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveView(item.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeView === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
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

                        <div className="mt-auto pt-4 border-t border-white/5">
                            <div className="px-3 py-2 bg-zinc-900 rounded-lg">
                                <div className="text-xs text-zinc-500 mb-1">总消耗(Total Consumption)</div>
                                <div className="text-lg font-bold text-white font-mono">${totalConsumed.toFixed(4)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Desktop Content */}
                    <div className="flex-1 flex flex-col min-w-0 bg-[#0d0d0e]">
                        <div className="h-14 border-b border-white/5 flex items-center justify-end px-6 bg-[#0d0d0e]/50 backdrop-blur-xl sticky top-0 z-10">
                            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
                            <div className="max-w-4xl mx-auto">
                                {activeView === 'dashboard' && <DashboardView keyStats={keyStats} totalConsumed={totalConsumed} totalTokens={totalTokens} />}
                                {activeView === 'api-channels' && <ApiChannelsView />}
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
                    className="fixed inset-0 w-full h-full bg-[#000000] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 z-[10001]"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Mobile Header (iOS Style) */}
                    <div className="h-14 border-b border-white/5 flex items-center justify-between px-5 bg-[#161618]/80 backdrop-blur-xl sticky top-0 z-20 shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-900/20">
                                <LayoutDashboard size={14} />
                            </div>
                            <span className="text-white font-bold text-[17px] tracking-tight truncate">
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
                            className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white bg-zinc-800/80 rounded-full transition-all active:scale-90"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Mobile Content (Scrollable) */}
                    <div className="flex-1 overflow-y-auto p-4 scrollbar-hide space-y-4 pb-32 bg-black">
                        {/* Dynamic Content based on activeView */}
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {activeView === 'dashboard' && <DashboardView keyStats={keyStats} totalConsumed={totalConsumed} totalTokens={totalTokens} />}
                            {activeView === 'api-channels' && <ApiChannelsView />}
                            {activeView === 'cost-estimation' && <CostEstimationView />}
                            {activeView === 'storage-settings' && <StorageSettingsView />}
                            {activeView === 'system-logs' && <SystemLogsView />}
                        </div>
                    </div>

                    {/* Mobile Bottom Navigation Bar (iOS Tab Bar Style) */}
                    {/* Mobile Bottom Navigation Bar (Floating Glass Pill - iOS 26 Style) */}
                    <div
                        className="absolute bottom-4 mx-4 left-0 right-0 h-14 rounded-[24px] flex items-center justify-around px-2 z-[10002] liquid-glass"
                        style={{
                            // Handled by CSS class
                        }}
                    >
                        {navItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setActiveView(item.id)}
                                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all active:scale-90
                                    ${activeView === item.id
                                        ? 'text-white'
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                            >
                                <div className={`p-1.5 rounded-xl transition-all duration-300 ${activeView === item.id ? 'bg-white/10' : ''}`}>
                                    <item.icon size={22} strokeWidth={activeView === item.id ? 2 : 2} />
                                </div>
                                <span className={`text-[9px] font-medium tracking-tight transform ${activeView === item.id ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsPanel;
