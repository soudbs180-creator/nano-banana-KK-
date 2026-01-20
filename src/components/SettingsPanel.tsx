import React, { useState, useEffect } from 'react';
import { X, Search, LayoutDashboard, Key, DollarSign, HardDrive, ScrollText, ChevronRight, Activity, AlertTriangle, Sparkles, Plus, Trash2, FolderOpen, Globe, Loader2, RefreshCw, Copy, Check } from 'lucide-react';
import { keyManager, KeySlot } from '../services/keyManager';
import { getTodayCosts, getCostsByModel, CostBreakdownItem } from '../services/costService';
import { getTodayLogs, LogLevel, exportLogsForAI, SystemLogEntry } from '../services/systemLogService';
import { useCanvas } from '../context/CanvasContext';
import { syncService } from '../services/syncService';
import { getStorageUsage, cleanupOriginals } from '../services/imageStorage';
import { fileSystemService } from '../services/fileSystemService';

export type SettingsView = 'dashboard' | 'api-channels' | 'cost-estimation' | 'storage-settings' | 'system-logs';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    initialView?: SettingsView;
}

// --- Sub-components ---

const DashboardView = ({ keyStats }: { keyStats: any }) => {
    const dailyCosts = getTodayCosts();
    const [budget, setBudget] = React.useState<number>(-1);
    const [isEditingBudget, setIsEditingBudget] = React.useState(false);
    const [newBudget, setNewBudget] = React.useState('');

    useEffect(() => {
        import('../services/costService').then(mod => {
            setBudget(mod.getDailyBudget());
        });
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

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const { forceSync } = await import('../services/costService');
            await forceSync();
            // Reload budget after sync
            const mod = await import('../services/costService');
            setBudget(mod.getDailyBudget());
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
            <div className="flex justify-between items-start mb-6 hidden md:flex">
                <div>
                    <h3 className="text-2xl font-bold text-white">
                        仪表盘 (Dashboard)
                    </h3>
                    <span className="block text-xs text-zinc-500 font-normal mt-1">系统概览与偏好设置 (System Dashboard & Preferences)</span>
                </div>
                <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="group relative flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 bg-[length:200%_100%] hover:bg-right transition-all duration-500 text-white rounded-full shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    <RefreshCw size={16} className={isSyncing ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"} />
                    <span className="text-sm font-bold tracking-wide">同步数据 (Sync)</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-4 h-auto md:h-[320px]">
                {/* Hero Card: Cost */}
                <div className="col-span-1 md:col-span-2 md:row-span-2 bg-gradient-to-br from-indigo-500/10 via-[#1c1c1e] to-[#1c1c1e] p-5 md:p-6 rounded-[32px] border border-indigo-500/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-24 md:p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-indigo-500/10" />

                    <div className="flex flex-col h-full justify-between gap-4 md:gap-0 relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><DollarSign size={24} /></div>
                            <div>
                                <span className="text-zinc-400 font-medium block">今日预估成本</span>
                                <span className="text-xs text-zinc-600 block">Today's Estimated Cost</span>
                            </div>
                        </div>

                        <div>
                            <div className="text-4xl md:text-5xl font-bold text-white font-mono tracking-tight mb-2">
                                ${todayData.costUsd.toFixed(4)}
                            </div>
                            <div className="text-sm text-zinc-500">
                                ≈ ¥{(todayData.costUsd * 7.2).toFixed(2)} CNY
                            </div>
                        </div>

                        <div className="w-full bg-zinc-800/50 h-1.5 rounded-full overflow-hidden mt-2 md:mt-4">
                            <div
                                className={`h-full transition-all duration-500 ${remainingPercent < 20 ? 'bg-red-500' : 'bg-indigo-500'}`}
                                style={{ width: `${remainingPercent}%` }}
                            />
                        </div>
                        <div className="flex justify-between items-center text-xs text-zinc-500 mt-2">
                            <div className="flex items-center gap-2">
                                <span>每日预算 (Daily Budget)</span>
                            </div>

                            {isEditingBudget ? (
                                <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                                    <input
                                        autoFocus
                                        className="w-20 bg-[#09090b] text-white rounded-lg px-2 py-1 text-right outline-none border border-zinc-800 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 placeholder:text-zinc-700 text-sm font-mono"
                                        placeholder="$"
                                        value={newBudget}
                                        onChange={e => setNewBudget(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSaveBudget()}
                                    />
                                    <button onClick={handleSaveBudget} className="text-emerald-500 hover:text-emerald-400"><Check size={14} /></button>
                                    <button onClick={toggleInfinite} className="text-indigo-500 hover:text-indigo-400 text-[10px] whitespace-nowrap">无限 ∞</button>
                                    <button onClick={() => setIsEditingBudget(false)} className="text-red-500 hover:text-red-400"><X size={14} /></button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setNewBudget(budget > 0 ? budget.toString() : ''); setIsEditingBudget(true); }}
                                    className="flex items-center gap-1 hover:text-white transition-colors group/btn"
                                >
                                    <span className="font-mono">
                                        {budget < 0 ? '无限 (Unlimited)' : `$${budget.toFixed(2)}`}
                                    </span>
                                    <div className="opacity-0 group-hover/btn:opacity-100 transition-opacity"><ScrollText size={10} /></div>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Secondary Card: Images */}
                <div className="col-span-1 md:col-span-1 md:row-span-1 bg-[#1c1c1e] p-5 rounded-[32px] border border-zinc-800/50 flex flex-col justify-between relative overflow-hidden hover:border-zinc-700 transition-colors group">
                    <div className="absolute right-3 top-3 text-zinc-600 group-hover:text-emerald-500 transition-colors"><Sparkles size={20} /></div>
                    <div>
                        <div className="text-zinc-400 text-sm font-medium">今日生成</div>
                        <div className="text-xs text-zinc-600">Images Generated</div>
                    </div>
                    <div className="flex items-baseline gap-1 mt-4 md:mt-0">
                        <span className="text-3xl font-bold text-white font-mono">{todayData.count}</span>
                        <span className="text-xs text-zinc-500">张 (Count)</span>
                    </div>
                </div>

                {/* Secondary Card: Tokens */}
                <div className="col-span-1 md:col-span-1 md:row-span-1 bg-[#1c1c1e] p-5 rounded-[32px] border border-zinc-800/50 flex flex-col justify-between relative overflow-hidden hover:border-zinc-700 transition-colors group">
                    <div className="absolute right-3 top-3 text-zinc-600 group-hover:text-blue-500 transition-colors"><Activity size={20} /></div>
                    <div>
                        <div className="text-zinc-400 text-sm font-medium">Token 消耗</div>
                        <div className="text-xs text-zinc-600">Tokens Used</div>
                    </div>
                    <div className="flex items-baseline gap-1 mt-4 md:mt-0">
                        <span className="text-2xl font-bold text-white font-mono">{(todayData.tokens / 1000).toFixed(1)}</span>
                        <span className="text-xs text-zinc-500">k</span>
                    </div>
                </div>

                {/* Wide Card: API Status */}
                <div className="col-span-1 md:col-span-2 md:row-span-1 bg-[#1c1c1e] p-5 rounded-[32px] border border-zinc-800/50 flex flex-col justify-center relative overflow-hidden hover:border-zinc-700 transition-colors">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${keyStats.valid > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                <Key size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-zinc-300">API 渠道状态</div>
                                <div className="text-xs text-zinc-600 hidden md:block">API Channels Status</div>
                                <div className="text-xs text-zinc-500 flex flex-wrap gap-2 mt-1">
                                    <span className="text-emerald-500">{keyStats.valid} 正常 (Active)</span>
                                    <span className="text-zinc-600">|</span>
                                    <span className={keyStats.invalid > 0 ? "text-red-500" : "text-zinc-600"}>{keyStats.invalid} 异常 (Error)</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-zinc-500 mb-1">密钥总数</div>
                            <div className="text-xl font-bold text-white font-mono">{keyStats.total}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* System Status Section - Compact */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#1c1c1e] rounded-[32px] border border-zinc-800/50 p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">系统状态 (System Status)</div>
                        <div className="text-sm font-medium text-zinc-300">运行正常 (Operational)</div>
                    </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-[32px] border border-zinc-800/50 p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">延迟 (Latency)</div>
                        <div className="text-sm font-medium text-zinc-300 font-mono">45ms</div>
                    </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-[32px] border border-zinc-800/50 p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">版本 (Version)</div>
                        <div className="text-sm font-medium text-zinc-300">v1.1.8</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ApiChannelsView = () => {
    const [slots, setSlots] = useState<KeySlot[]>(keyManager.getSlots());
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null); // New State for copy feedback

    // Form State
    const [formKey, setFormKey] = useState('');
    const [formName, setFormName] = useState('');
    const [formProvider, setFormProvider] = useState('Gemini');
    const [formBudget, setFormBudget] = useState('');

    useEffect(() => {
        const unsub = keyManager.subscribe(() => setSlots(keyManager.getSlots()));
        return unsub;
    }, []);

    const openAddModal = () => {
        setEditingId(null);
        setFormKey('');
        setFormName('Google API');
        setFormProvider('Gemini');
        setFormBudget('');
        setIsModalOpen(true);
    };

    const openEditModal = (slot: KeySlot) => {
        setEditingId(slot.id);
        setFormKey(slot.key);
        setFormName(slot.name);
        setFormProvider(slot.provider);
        setFormBudget(slot.budgetLimit > 0 ? slot.budgetLimit.toString() : '');
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        setLoading(true);

        if (editingId) {
            // Edit Mode
            keyManager.updateKey(editingId, {
                name: formName.trim() || 'API Key',
                budgetLimit: formBudget ? parseFloat(formBudget) : -1
            });
        } else {
            // Add Mode
            if (!formKey.trim()) {
                setLoading(false);
                return;
            }
            await keyManager.addKey(formKey.trim(), {
                name: formName.trim() || 'Google API',
                provider: formProvider,
                budgetLimit: formBudget ? parseFloat(formBudget) : -1
            });
        }

        // Reset
        setIsModalOpen(false);
        setLoading(false);
    };

    const handleRefresh = async () => {
        setLoading(true);
        await keyManager.revalidateAll();
        setLoading(false);
    }

    const handleDelete = (id: string) => {
        if (confirm('确定要删除此 API 密钥吗？')) {
            keyManager.removeKey(id);
        }
    };

    const handleCopy = (key: string, id: string) => {
        navigator.clipboard.writeText(key);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-end md:justify-between items-center flex-shrink-0">
                <div className="hidden md:block">
                    <h3 className="text-2xl font-bold text-white">API 渠道管理 (API Channels)</h3>
                    <p className="text-xs text-zinc-500 mt-1">云端同步 · 查看消耗 · 预算控制 (Cloud Sync & Budget)</p>
                </div>
                <div className="hidden md:flex gap-2">
                    <button onClick={handleRefresh} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors" title="刷新所有状态 (Refresh)">
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                    >
                        <Plus size={16} /> 添加密钥 (Add Key)
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pr-1 p-1">
                {slots.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl text-zinc-500 flex flex-col items-center">
                        <div className="p-4 bg-zinc-900/50 rounded-full mb-3">
                            <Key size={32} className="opacity-30" />
                        </div>
                        <p>暂无 API 密钥配置 (No API Keys Configured)</p>
                        <button onClick={openAddModal} className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 border-b border-dashed border-indigo-400/50 hover:border-indigo-300">点击添加 (Click to Add)</button>
                    </div>
                ) : (
                    slots.map(slot => (
                        <div key={slot.id} className="group relative bg-zinc-900/30 backdrop-blur-md border border-white/5 hover:border-white/10 rounded-[24px] p-5 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-black/20">

                            <div className="flex flex-col gap-4">
                                {/* Top Row: Header Info */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br ${slot.provider === 'Gemini' ? 'from-blue-500/20 to-indigo-500/20 text-blue-400' : 'from-zinc-700/50 to-zinc-800/50 text-zinc-400'}`}>
                                            {/* Icon based on provider could go here */}
                                            <span className="font-bold text-xs">{slot.provider.substring(0, 1)}</span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-white text-base">{slot.name || 'API Key'}</h4>
                                                {/* Glowing Status Dot */}
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/20 border border-white/5">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${slot.status === 'valid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' :
                                                        slot.status === 'invalid' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
                                                            'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]'}`}
                                                    />
                                                    <span className={`text-[10px] font-medium ${slot.status === 'valid' ? 'text-emerald-500' :
                                                        slot.status === 'invalid' ? 'text-red-500' :
                                                            'text-amber-500'
                                                        }`}>
                                                        {slot.status === 'valid' ? 'Active' : slot.status === 'invalid' ? 'Error' : 'Limit'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-xs text-zinc-500 font-mono mt-0.5 opacity-60">Provider: {slot.provider}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => openEditModal(slot)}
                                            className="p-2 text-zinc-500 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                                        >
                                            <Sparkles size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(slot.id)}
                                            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Middle Row: Key Display & Copy */}
                                <div
                                    onClick={() => handleCopy(slot.key, slot.id)}
                                    className="relative flex items-center justify-between bg-black/20 hover:bg-black/30 border border-white/5 rounded-xl px-3 py-2.5 cursor-pointer group/key transition-colors"
                                >
                                    <div className="font-mono text-zinc-400 text-xs tracking-wider group-hover/key:text-zinc-200 transition-colors">
                                        {slot.key.substring(0, 8)} •••• •••• {slot.key.slice(-6)}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-zinc-600 group-hover/key:text-zinc-300 transition-colors">
                                        <span className="text-[10px] opacity-0 group-hover/key:opacity-100 transition-opacity uppercase tracking-widest font-bold">
                                            {copiedId === slot.id ? 'Copied' : 'Copy'}
                                        </span>
                                        {copiedId === slot.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </div>
                                </div>

                                {/* Bottom Row: Stats */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Usage / Budget */}
                                    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="text-[10px] text-zinc-500">USAGE / BUDGET</span>
                                            <span className="text-[10px] text-zinc-300 font-mono">
                                                ${(slot.totalCost || 0).toFixed(4)} <span className="text-zinc-600">/</span> {slot.budgetLimit > 0 ? `$${slot.budgetLimit}` : '∞'}
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                                                    }`}
                                                style={{ width: slot.budgetLimit > 0 ? `${Math.min(100, (slot.totalCost / slot.budgetLimit) * 100)}%` : '0%' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Calls / Quota */}
                                    <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col justify-center">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] text-zinc-500">SUCCESS</span>
                                            <span className="text-xs text-indigo-400 font-mono font-bold">{slot.successCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] text-zinc-500">REMAINING</span>
                                            <span className="text-xs text-zinc-400 font-mono">{slot.quota?.remainingRequests ?? '--'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Mobile Floating Actions (Middle Bottom) */}
            <div className="hidden max-md:flex absolute bottom-24 inset-x-0 z-30 items-center justify-center gap-4 pointer-events-none">
                <button
                    onClick={handleRefresh}
                    className="pointer-events-auto w-12 h-12 flex items-center justify-center bg-zinc-800/90 hover:bg-zinc-700 text-white rounded-full shadow-lg backdrop-blur-md border border-white/10 active:scale-90 transition-all"
                >
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                    onClick={openAddModal}
                    className="pointer-events-auto flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold shadow-[0_8px_20px_rgba(79,70,229,0.4)] active:scale-95 transition-all backdrop-blur-sm border border-white/10"
                >
                    <Plus size={18} />
                    <span>添加密钥 (Add Key)</span>
                </button>
            </div>

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                    <div className="bg-[#161618] w-full max-w-md rounded-2xl border border-zinc-700 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 text-left" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-lg font-bold text-white">{editingId ? '编辑 API 密钥 (Edit API Key)' : '添加新的 API 密钥 (Add API Key)'}</h4>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
                        </div>
                        {/* Form reuse same as before, simplified for brevity in this replace block */}
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 block">备注名称 (Name)</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
                                    placeholder="e.g. Google API"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            {!editingId && (
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1.5 block">平台供应商 (Provider)</label>
                                    <select
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
                                        value={formProvider}
                                        onChange={e => setFormProvider(e.target.value)}
                                    >
                                        <option value="Gemini">Google Gemini</option>
                                        <option value="OpenAI">OpenAI (暂未支持验证)</option>
                                        <option value="Claude">Anthropic Claude (暂未支持验证)</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 block">API Key {editingId ? '(不可修改 / Read Only)' : <span className="text-red-500">*</span>}</label>
                                <input
                                    className={`w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors font-mono ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    placeholder="sk-..."
                                    value={formKey}
                                    onChange={e => setFormKey(e.target.value)}
                                    disabled={!!editingId} // Disable key editing
                                />
                            </div>

                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 block">总预算限制 (Budget Limit in USD)</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-2 text-zinc-500 text-sm">$</div>
                                    <input
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-6 pr-3 py-2 text-sm text-white focus:border-indigo-500 outline-none transition-colors"
                                        placeholder="No Limit (无限)"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formBudget}
                                        onChange={e => setFormBudget(e.target.value)}
                                    />
                                </div>
                                <p className="text-[10px] text-zinc-500 mt-1">Leave empty for unlimited. 超过预算将自动停用此Key。</p>
                            </div>
                        </div>

                        <div className="pt-2 flex gap-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-sm font-medium"
                            >
                                取消 (Cancel)
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!formKey || loading}
                                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 size={14} className="animate-spin" />}
                                {editingId ? '保存修改 (Save)' : '确认添加 (Add)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const CostEstimationView = () => {
    const [breakdown, setBreakdown] = useState<CostBreakdownItem[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        setBreakdown(getCostsByModel());
    }, []);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const { forceSync, getCostsByModel: refreshData } = await import('../services/costService');
            await forceSync();
            setBreakdown(refreshData());
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
                    <h3 className="text-2xl font-bold text-white">成本详情 (Cost Breakdown)</h3>
                    <p className="text-xs text-zinc-500 mt-1">按模型和规格统计的详细使用记录 (Detailed usage by model and size)</p>
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



            {/* Desktop Table View */}
            <div className="hidden md:block bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-x-auto shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900 border-b border-zinc-800">
                        <tr>
                            <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">模型 (Model)</th>
                            <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider">规格 (Size)</th>
                            <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">数量 (Count)</th>
                            <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">Tokens</th>
                            <th className="px-5 py-4 font-medium text-zinc-400 text-xs uppercase tracking-wider text-right">成本 (USD)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {breakdown.length === 0 ? (
                            <tr><td colSpan={5} className="p-12 text-center text-zinc-500">今日暂无数据 (No Data Today)</td></tr>
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

            {/* Mobile Vertical Card View */}
            <div className="md:hidden space-y-3">
                {breakdown.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 bg-[#1c1c1e] rounded-[32px] border border-zinc-800">
                        今日暂无数据 (No Data Today)
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
                <p className="font-medium text-zinc-400 mb-2">计费参考 (Pricing Reference)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                        <span>Gemini: $0.075/百万输入, $0.3/百万输出</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    <span>Imagen: 标准版 $0.04/张 (Approx)</span>
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
        if (confirm('确定要清理浏览器缓存吗？\n这将彻底删除缓存在浏览器中的所有临时图片。\n此操作不会影响“本地文件夹”中的文件。')) {
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
                        {isConnectedToLocal ? '本地模式 (Local)' : '临时模式 (Temp)'}
                    </div>
                </h3>
                <p className="text-zinc-500 text-sm mt-1 max-w-2xl">
                    数据存储偏好设置。可在临时浏览器存储和本地文件系统之间切换。
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">


                <div
                    onClick={!isConnectedToLocal ? undefined : handleConnectBrowser}
                    className={`relative p-8 rounded-[32px] border transition-all duration-300 group flex flex-col justify-between overflow-hidden cursor-pointer
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
                                使用中 (ACTIVE)
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
                            {isConnectedToLocal ? '切换到临时模式' : '当前已激活'}
                        </button>

                        {isConnectedToLocal && (
                            <button
                                onClick={handleClearCache}
                                className="px-4 py-3 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 border border-transparent transition-all flex items-center justify-center cursor-pointer"
                                title="清理浏览器缓存 (Clear Cache)"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Local Storage Card */}
                <div
                    onClick={isConnectedToLocal ? undefined : handleConnectLocal}
                    className={`relative p-8 rounded-[32px] border transition-all duration-300 group flex flex-col justify-between overflow-hidden cursor-pointer
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
                                使用中 (ACTIVE)
                            </div>
                        )}
                    </div>

                    <div className="mt-8">
                        <h4 className={`text-lg font-bold ${isConnectedToLocal ? 'text-white' : 'text-zinc-400'}`}>本地文件夹 (Local)</h4>
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
                                切换到本地
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
                    <p className="text-xs text-zinc-500 mt-1">调试信息与错误追踪 (Debug & Trace)</p>
                </div>
                <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 hover:text-white rounded-lg text-sm text-zinc-400 transition-colors border border-transparent hover:border-zinc-600">
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    {copied ? '已复制 (Copied)' : '导出日志 (Export Logs)'}
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
                        {logs.map((log) => (
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

    useEffect(() => {
        setActiveView(initialView);
    }, [initialView, isOpen]);

    useEffect(() => {
        const unsub = keyManager.subscribe(() => setKeyStats(keyManager.getStats()));
        return unsub;
    }, []);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (!isOpen) return null;

    const navItems: { id: SettingsView; label: string; icon: any }[] = [
        { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
        { id: 'api-channels', label: 'API 渠道', icon: Key },
        { id: 'cost-estimation', label: '成本', icon: DollarSign },
        { id: 'storage-settings', label: '存储', icon: HardDrive },
        { id: 'system-logs', label: '日志', icon: ScrollText },
    ];

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            {!isMobile ? (
                /* --- Desktop Layout (Strictly Preserved) --- */
                <div
                    className="hidden md:flex w-[980px] h-[640px] bg-[#0d0d0e] rounded-2xl shadow-2xl border border-zinc-800/50 overflow-hidden animate-in zoom-in-95 duration-200"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Desktop Sidebar */}
                    <div className="w-64 bg-[#161618] border-r border-white/5 flex flex-col p-4 shrink-0">
                        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                                <LayoutDashboard size={18} />
                            </div>
                            <span className="font-bold text-white tracking-tight">系统设置 (System Settings)</span>
                        </div>

                        <div className="space-y-1">
                            {navItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveView(item.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeView === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                                >
                                    <item.icon size={16} />
                                    {item.label === '仪表盘' ? '仪表盘 (Dashboard)' :
                                        item.label === 'API 渠道' ? 'API 渠道 (Channels)' :
                                            item.label === '成本' ? '成本估算 (Cost)' :
                                                item.label === '存储' ? '存储位置 (Storage)' :
                                                    '系统日志 (Logs)'}
                                    {activeView === item.id && <ChevronRight size={14} className="ml-auto opacity-50" />}
                                </button>
                            ))}
                        </div>

                        <div className="mt-auto pt-4 border-t border-white/5">
                            <div className="px-3 py-2 bg-zinc-900 rounded-lg">
                                <div className="text-xs text-zinc-500 mb-1">总消耗 (Total Consumption)</div>
                                <div className="text-lg font-bold text-white font-mono">${getTodayCosts().entries.reduce((a, b) => a + b.costUsd, 0).toFixed(4)}</div>
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
                                {activeView === 'dashboard' && <DashboardView keyStats={keyStats} />}
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
                                        'API 渠道': 'API 渠道',
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
                    <div className="flex-1 overflow-y-auto p-4 scrollbar-none space-y-4 pb-32 bg-[#000000]">
                        {/* Dynamic Content based on activeView */}
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {activeView === 'dashboard' && <DashboardView keyStats={keyStats} />}
                            {activeView === 'api-channels' && <ApiChannelsView />}
                            {activeView === 'cost-estimation' && <CostEstimationView />}
                            {activeView === 'storage-settings' && <StorageSettingsView />}
                            {activeView === 'system-logs' && <SystemLogsView />}
                        </div>
                    </div>

                    {/* Mobile Bottom Navigation Bar (iOS Tab Bar Style) */}
                    {/* Mobile Bottom Navigation Bar (Floating Glass Pill - iOS 26 Style) */}
                    <div className="absolute bottom-6 left-0 right-0 mx-auto w-[90%] max-w-[360px] bg-[#161618]/80 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center justify-around h-[64px] px-2 z-[10002]">
                        {navItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setActiveView(item.id)}
                                className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-all active:scale-90
                                    ${activeView === item.id
                                        ? 'text-blue-500'
                                        : 'text-zinc-400 hover:text-zinc-200'
                                    }`}
                            >
                                <div className={`p-1.5 rounded-full transition-all duration-300 ${activeView === item.id ? 'bg-blue-500/15 translate-y-[-2px]' : ''}`}>
                                    <item.icon size={22} strokeWidth={activeView === item.id ? 2.5 : 2} />
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
