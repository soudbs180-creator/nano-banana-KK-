import React, { useState, useEffect } from 'react';
import { X, Search, LayoutDashboard, Key, DollarSign, HardDrive, ScrollText, ChevronRight, Activity, AlertTriangle, Sparkles, Plus, Trash2, FolderOpen, Globe, Loader2, RefreshCw, Copy, Check } from 'lucide-react';
import { keyManager, KeySlot } from '../services/keyManager';
import { getTodayCosts, getCostsByModel, CostBreakdownItem } from '../services/costService';
import { getTodayLogs, LogLevel, exportLogsForAI, SystemLogEntry } from '../services/systemLogService';

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
            <h3 className="text-2xl font-bold text-white mb-6">
                设置 (Settings)
                <span className="block text-xs text-zinc-500 font-normal mt-1">系统概览与偏好设置 (System Dashboard & Preferences)</span>
            </h3>

            <div className="grid grid-cols-4 grid-rows-2 gap-4 h-[320px]">
                {/* Hero Card: Cost */}
                <div className="col-span-2 row-span-2 bg-gradient-to-br from-indigo-500/10 via-[#1c1c1e] to-[#1c1c1e] p-6 rounded-2xl border border-indigo-500/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-indigo-500/10" />

                    <div className="flex flex-col h-full justify-between relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><DollarSign size={24} /></div>
                            <div>
                                <span className="text-zinc-400 font-medium block">今日预估成本</span>
                                <span className="text-xs text-zinc-600 block">Today's Estimated Cost</span>
                            </div>
                        </div>

                        <div>
                            <div className="text-5xl font-bold text-white font-mono tracking-tight mb-2">
                                ${todayData.costUsd.toFixed(4)}
                            </div>
                            <div className="text-sm text-zinc-500">
                                ≈ ¥{(todayData.costUsd * 7.2).toFixed(2)} CNY
                            </div>
                        </div>

                        <div className="w-full bg-zinc-800/50 h-1.5 rounded-full overflow-hidden mt-4">
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
                <div className="col-span-1 row-span-1 bg-[#1c1c1e] p-5 rounded-2xl border border-zinc-800/50 flex flex-col justify-between relative overflow-hidden hover:border-zinc-700 transition-colors group">
                    <div className="absolute right-3 top-3 text-zinc-600 group-hover:text-emerald-500 transition-colors"><Sparkles size={20} /></div>
                    <div>
                        <div className="text-zinc-400 text-sm font-medium">今日生成</div>
                        <div className="text-xs text-zinc-600">Images Generated</div>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white font-mono">{todayData.count}</span>
                        <span className="text-xs text-zinc-500">张 (Count)</span>
                    </div>
                </div>

                {/* Secondary Card: Tokens */}
                <div className="col-span-1 row-span-1 bg-[#1c1c1e] p-5 rounded-2xl border border-zinc-800/50 flex flex-col justify-between relative overflow-hidden hover:border-zinc-700 transition-colors group">
                    <div className="absolute right-3 top-3 text-zinc-600 group-hover:text-blue-500 transition-colors"><Activity size={20} /></div>
                    <div>
                        <div className="text-zinc-400 text-sm font-medium">Token 消耗</div>
                        <div className="text-xs text-zinc-600">Tokens Used</div>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-white font-mono">{(todayData.tokens / 1000).toFixed(1)}</span>
                        <span className="text-xs text-zinc-500">k</span>
                    </div>
                </div>

                {/* Wide Card: API Status */}
                <div className="col-span-2 row-span-1 bg-[#1c1c1e] p-5 rounded-2xl border border-zinc-800/50 flex flex-col justify-center relative overflow-hidden hover:border-zinc-700 transition-colors">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${keyStats.valid > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                <Key size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-zinc-300">API 渠道状态</div>
                                <div className="text-xs text-zinc-600">API Channels Status</div>
                                <div className="text-xs text-zinc-500 flex gap-2 mt-1">
                                    <span className="text-emerald-500">{keyStats.valid} 正常 (Active)</span>
                                    <span className="text-zinc-600">|</span>
                                    <span className={keyStats.invalid > 0 ? "text-red-500" : "text-zinc-600"}>{keyStats.invalid} 异常 (Error)</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-zinc-500 mb-1">密钥总数 (Total Keys)</div>
                            <div className="text-xl font-bold text-white font-mono">{keyStats.total}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* System Status Section - Compact */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#1c1c1e] rounded-xl border border-zinc-800/50 p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">系统状态 (System Status)</div>
                        <div className="text-sm font-medium text-zinc-300">运行正常 (Operational)</div>
                    </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-xl border border-zinc-800/50 p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">延迟 (Latency)</div>
                        <div className="text-sm font-medium text-zinc-300 font-mono">45ms</div>
                    </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-xl border border-zinc-800/50 p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">版本 (Version)</div>
                        <div className="text-sm font-medium text-zinc-300">v1.1.7</div>
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

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center flex-shrink-0">
                <div>
                    <h3 className="text-2xl font-bold text-white">API 渠道管理 (API Channels)</h3>
                    <p className="text-xs text-zinc-500 mt-1">云端同步 · 查看消耗 · 预算控制 (Cloud Sync & Budget)</p>
                </div>
                <div className="flex gap-2">
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
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
                {slots.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl text-zinc-500">
                        <Key size={32} className="mx-auto mb-3 opacity-20" />
                        <p>暂无 API 密钥配置 (No API Keys Configured)</p>
                        <button onClick={openAddModal} className="text-indigo-400 hover:text-indigo-300 text-sm mt-2">点击添加 (Click to Add)</button>
                    </div>
                ) : (
                    slots.map(slot => (
                        <div key={slot.id} className="group bg-[#1c1c1e] border border-zinc-800 hover:border-zinc-600 rounded-2xl p-4 transition-all duration-200 shadow-sm relative overflow-hidden">
                            {/* Status Indicator Bar */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${slot.status === 'valid' ? 'bg-emerald-500' : slot.status === 'invalid' ? 'bg-red-500' : 'bg-zinc-700'}`} />

                            <div className="pl-3 flex flex-col gap-3">
                                {/* Top Row: Name, Provider, Status */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <h4 className="font-bold text-white text-base">{slot.name || 'API Key'}</h4>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase">{slot.provider || 'Gemini'}</span>
                                        {slot.status !== 'valid' && (
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${slot.status === 'invalid' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                                }`}>
                                                {slot.status === 'rate_limited' ? '速率限制 (Rate Limited)' : '无效 (Invalid)'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => openEditModal(slot)}
                                            className="p-1.5 text-zinc-600 hover:text-white rounded-md transition-colors"
                                            title="编辑 / Edit"
                                        >
                                            <Sparkles size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(slot.id)}
                                            className="p-1.5 text-zinc-600 hover:text-red-400 rounded-md transition-colors"
                                            title="删除 / Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Middle Row: Key Masked */}
                                <div className="font-mono text-zinc-500 text-xs tracking-wider cursor-pointer hover:text-zinc-300 transition-colors" onClick={() => navigator.clipboard.writeText(slot.key)} title="Click to Copy Key">
                                    {slot.key.substring(0, 8)} •••• •••• {slot.key.slice(-6)}
                                </div>

                                {/* Bottom Row: Budget & Usage */}
                                <div className="grid grid-cols-2 gap-4 mt-1">
                                    {/* Cost / Budget */}
                                    <div className="bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/50">
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-[10px] text-zinc-500">已用 / 预算 (Cost)</span>
                                            <span className="text-[10px] text-zinc-400 font-mono">
                                                ${(slot.totalCost || 0).toFixed(4)} <span className="text-zinc-600">/</span> {slot.budgetLimit > 0 ? `$${slot.budgetLimit}` : '∞'}
                                            </span>
                                        </div>
                                        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit ? 'bg-red-500' : 'bg-indigo-500'}`}
                                                style={{ width: slot.budgetLimit > 0 ? `${Math.min(100, (slot.totalCost / slot.budgetLimit) * 100)}%` : '0%' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Quota / Tokens (if available) */}
                                    <div className="bg-zinc-900/50 rounded-lg p-2 border border-zinc-800/50 flex items-center justify-between">
                                        <div>
                                            <div className="text-[10px] text-zinc-500">调用次数 (Calls)</div>
                                            <div className="text-xs text-white font-mono mt-0.5">{slot.successCount} <span className="text-zinc-600 text-[10px]">成功 (Success)</span></div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-zinc-500">剩余请求 (Requests Left)</div>
                                            <div className="text-xs text-zinc-300 font-mono mt-0.5">{slot.quota?.remainingRequests ?? '--'}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                    <div className="bg-[#161618] w-full max-w-md rounded-2xl border border-zinc-700 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200 text-left" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-lg font-bold text-white">{editingId ? '编辑 API 密钥 (Edit API Key)' : '添加新的 API 密钥 (Add API Key)'}</h4>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
                        </div>

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

    useEffect(() => {
        setBreakdown(getCostsByModel());
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-white">成本详情 (Cost Breakdown)</h3>
                <p className="text-xs text-zinc-500 mt-1">按模型和规格统计的详细使用记录 (Detailed usage by model and size)</p>
            </div>

            <div className="bg-[#1c1c1e] border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
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

            <div className="text-xs text-zinc-500 p-5 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
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
        </div>
        </div >
    );
};

const StorageSettingsView = () => {
    const [currentMode, setCurrentMode] = useState<string>('loading');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        import('../services/storagePreference').then(async mod => {
            setCurrentMode(await mod.getStorageMode() || 'browser');
        });
    }, []);

    const handleChange = async (mode: 'local' | 'browser') => {
        setLoading(true);
        const mod = await import('../services/storagePreference');
        if (mode === 'local') {
            const handle = await mod.selectLocalFolder();
            if (handle) {
                await mod.setStorageMode('local');
                setCurrentMode('local');
            }
        } else {
            await mod.setStorageMode('browser');
            setCurrentMode('browser');
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-2xl font-bold text-white">存储位置 (Storage Location)</h3>
                <p className="text-zinc-400 text-sm mt-1">选择原图的保存方式 (缩略图始终同步至云端) / Cloud Sync</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={() => handleChange('browser')}
                    className={`relative p-6 rounded-2xl border transition-all duration-200 group text-left ${currentMode === 'browser' ? 'bg-blue-600/10 border-blue-500 ring-1 ring-blue-500/50' : 'bg-[#1c1c1e] border-zinc-800 hover:border-zinc-600'}`}
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className={`p-3 rounded-xl ${currentMode === 'browser' ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-white transition-colors'}`}>
                            <Globe size={24} />
                        </div>
                        {currentMode === 'browser' && <div className="p-1 bg-blue-500 rounded-full"><Check size={12} className="text-white" /></div>}
                    </div>

                    <span className={`text-lg font-bold block mb-1 ${currentMode === 'browser' ? 'text-white' : 'text-zinc-200'}`}>浏览器缓存 (Browser)</span>
                    <span className="text-xs text-zinc-500 leading-relaxed block">
                        临时存储。图片可能会被浏览器自动清除。适合快速测试。
                        <br /><span className="opacity-80">Temporary storage. May be cleared by browser. Good for testing.</span>
                    </span>
                </button>

                <button
                    onClick={() => handleChange('local')}
                    className={`relative p-6 rounded-2xl border transition-all duration-200 group text-left ${currentMode === 'local' ? 'bg-indigo-600/10 border-indigo-500 ring-1 ring-indigo-500/50' : 'bg-[#1c1c1e] border-zinc-800 hover:border-zinc-600'}`}
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className={`p-3 rounded-xl ${currentMode === 'local' ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-white transition-colors'}`}>
                            <FolderOpen size={24} />
                        </div>
                        {currentMode === 'local' && <div className="p-1 bg-indigo-500 rounded-full"><Check size={12} className="text-white" /></div>}
                    </div>

                    <span className={`text-lg font-bold block mb-1 ${currentMode === 'local' ? 'text-white' : 'text-zinc-200'}`}>本地文件夹 (Local)</span>
                    <span className="text-xs text-zinc-500 leading-relaxed block">
                        直接保存到电脑硬盘。推荐用于生产环境，安全且持久。
                        <br /><span className="opacity-80">Save directly to disk. Recommended for production, secure & persistent.</span>
                    </span>
                </button>
            </div>
            {loading && (
                <div className="flex items-center justify-center gap-2 p-4 bg-zinc-900/50 rounded-lg text-sm text-zinc-400 animate-pulse">
                    <Loader2 size={16} className="animate-spin" />
                    <span>切换存储模式中... (Switching Storage Mode...)</span>
                </div>
            )}
        </div>
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
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h3 className="text-2xl font-bold text-white">系统日志 (System Logs)</h3>
                    <p className="text-xs text-zinc-500 mt-1">调试信息与错误追踪 (Debug & Trace)</p>
                </div>
                <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 hover:text-white rounded-lg text-sm text-zinc-400 transition-colors border border-transparent hover:border-zinc-600">
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    {copied ? '已复制 (Copied)' : '导出日志 (Export Logs)'}
                </button>
            </div>

            <div className="bg-[#0f0f10] border border-zinc-800 rounded-2xl flex-1 overflow-hidden flex flex-col shadow-inner relative">
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
        </div>
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

    if (!isOpen) return null;

    const navItems: { id: SettingsView; label: string; icon: any }[] = [
        { id: 'dashboard', label: '仪表盘 (Dashboard)', icon: LayoutDashboard },
        { id: 'api-channels', label: 'API 渠道 (Channels)', icon: Key },
        { id: 'cost-estimation', label: '成本估算 (Cost)', icon: DollarSign },
        { id: 'storage-settings', label: '存储位置 (Storage)', icon: HardDrive },
        { id: 'system-logs', label: '系统日志 (Logs)', icon: ScrollText },
    ];

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="w-[980px] h-[640px] max-w-[95vw] bg-[#0d0d0e] rounded-2xl shadow-2xl border border-zinc-800/50 flex overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Sidebar */}
                <div className="w-64 bg-[#161618] border-r border-white/5 flex flex-col p-4">
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
                                {item.label}
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

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#0d0d0e]">
                    <div className="h-14 border-b border-white/5 flex items-center justify-end px-6 bg-[#0d0d0e]/50 backdrop-blur-xl sticky top-0 z-10">
                        <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
                        {activeView === 'dashboard' && <DashboardView keyStats={keyStats} />}
                        {activeView === 'api-channels' && <ApiChannelsView />}
                        {activeView === 'cost-estimation' && <CostEstimationView />}
                        {activeView === 'storage-settings' && <StorageSettingsView />}
                        {activeView === 'system-logs' && <SystemLogsView />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel;
