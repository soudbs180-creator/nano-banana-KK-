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
    // dailyCosts is already the DailyCostData for today
    const todayData = {
        count: dailyCosts.totalImages,
        tokens: dailyCosts.totalTokens,
        costUsd: dailyCosts.totalCostUsd
    };

    return (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white mb-6">仪表盘 Dashboard</h3>

            <div className="grid grid-cols-4 grid-rows-2 gap-4 h-[320px]">
                {/* Hero Card: Cost */}
                <div className="col-span-2 row-span-2 bg-gradient-to-br from-indigo-500/10 via-[#1c1c1e] to-[#1c1c1e] p-6 rounded-2xl border border-indigo-500/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-indigo-500/10" />

                    <div className="flex flex-col h-full justify-between relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400"><DollarSign size={24} /></div>
                            <span className="text-zinc-400 font-medium">今日预估成本</span>
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
                            <div className="h-full bg-indigo-500 w-[15%]" />
                        </div>
                        <div className="flex justify-between text-xs text-zinc-500 mt-2">
                            <span>Daily Budget</span>
                            <span>$5.00</span>
                        </div>
                    </div>
                </div>

                {/* Secondary Card: Images */}
                <div className="col-span-1 row-span-1 bg-[#1c1c1e] p-5 rounded-2xl border border-zinc-800/50 flex flex-col justify-between relative overflow-hidden hover:border-zinc-700 transition-colors group">
                    <div className="absolute right-3 top-3 text-zinc-600 group-hover:text-emerald-500 transition-colors"><Sparkles size={20} /></div>
                    <div className="text-zinc-400 text-sm font-medium">今日生成</div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white font-mono">{todayData.count}</span>
                        <span className="text-xs text-zinc-500">张</span>
                    </div>
                </div>

                {/* Secondary Card: Tokens */}
                <div className="col-span-1 row-span-1 bg-[#1c1c1e] p-5 rounded-2xl border border-zinc-800/50 flex flex-col justify-between relative overflow-hidden hover:border-zinc-700 transition-colors group">
                    <div className="absolute right-3 top-3 text-zinc-600 group-hover:text-blue-500 transition-colors"><Activity size={20} /></div>
                    <div className="text-zinc-400 text-sm font-medium">Token 消耗</div>
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
                                <div className="text-xs text-zinc-500 flex gap-2 mt-0.5">
                                    <span className="text-emerald-500">{keyStats.valid} 正常</span>
                                    <span className="text-zinc-600">|</span>
                                    <span className={keyStats.invalid > 0 ? "text-red-500" : "text-zinc-600"}>{keyStats.invalid} 异常</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-zinc-500 mb-1">Total Keys</div>
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
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">System Status</div>
                        <div className="text-sm font-medium text-zinc-300">Operational</div>
                    </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-xl border border-zinc-800/50 p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">Latency</div>
                        <div className="text-sm font-medium text-zinc-300 font-mono">45ms</div>
                    </div>
                </div>
                <div className="bg-[#1c1c1e] rounded-xl border border-zinc-800/50 p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <div className="flex-1">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider">Version</div>
                        <div className="text-sm font-medium text-zinc-300">v1.1.6</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ApiChannelsView = () => {
    const [slots, setSlots] = useState<KeySlot[]>(keyManager.getSlots());
    const [newKey, setNewKey] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const unsub = keyManager.subscribe(() => setSlots(keyManager.getSlots()));
        return unsub;
    }, []);

    const handleAdd = async () => {
        if (!newKey.trim()) return;
        setLoading(true);
        await keyManager.addKey(newKey);
        setNewKey('');
        setLoading(false);
    };

    const handleRefresh = async () => {
        setLoading(true);
        await keyManager.revalidateAll();
        setLoading(false);
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">API 渠道管理</h3>
                <button onClick={handleRefresh} className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"><Key size={14} /></div>
                    <input
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        placeholder="输入 API Key (sk-...)"
                        className="w-full bg-[#1c1c1e] border border-zinc-800 rounded-lg pl-9 pr-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                </div>
                <button onClick={handleAdd} disabled={loading || !newKey} className="px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium flex items-center gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 添加
                </button>
            </div>

            <div className="space-y-3">
                {slots.map(slot => (
                    <div key={slot.id} className="flex items-center gap-4 p-4 bg-[#1c1c1e] border border-zinc-800 rounded-xl">
                        <div className={`w-2 h-2 rounded-full ${slot.status === 'valid' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-white text-sm">...{slot.key.slice(-8)}</span>
                                {slot.status === 'rate_limited' && <span className="text-[10px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded">Rate Limited</span>}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                                <span>Used: <span className="text-indigo-400 font-mono">{slot.usedTokens?.toLocaleString() || 0}</span> Tokens</span>
                                <span>Remaining: <span className="text-zinc-300 font-mono">{slot.quota?.remainingRequests || '--'}</span> reqs</span>
                            </div>
                        </div>
                        <button onClick={() => keyManager.removeKey(slot.id)} className="p-2 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-lg transition-colors">
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>
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
            <h3 className="text-2xl font-bold text-white mb-6">成本估算 Cost Estimation</h3>

            <div className="bg-[#1c1c1e] border border-zinc-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900 text-zinc-400">
                        <tr>
                            <th className="px-4 py-3 font-medium">模型 (Model)</th>
                            <th className="px-4 py-3 font-medium">规格 (Size)</th>
                            <th className="px-4 py-3 font-medium text-right">数量 (Count)</th>
                            <th className="px-4 py-3 font-medium text-right">Tokens</th>
                            <th className="px-4 py-3 font-medium text-right">成本 (USD)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-zinc-300">
                        {breakdown.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-zinc-500">暂无使用记录</td></tr>
                        ) : (
                            breakdown.map((item, idx) => (
                                <tr key={idx} className="hover:bg-zinc-800/30">
                                    <td className="px-4 py-3">{item.model}</td>
                                    <td className="px-4 py-3 text-zinc-500">{item.imageSize || 'Default'}</td>
                                    <td className="px-4 py-3 text-right font-mono">{item.count}</td>
                                    <td className="px-4 py-3 text-right font-mono text-indigo-400">{(item.tokens || 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-mono text-emerald-400">${item.cost.toFixed(5)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="text-xs text-zinc-500 p-4 bg-zinc-900/50 rounded-lg">
                <p>计费说明：</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Gemini 模型按 Token 计费 (Input: $0.075/1M, Output: $0.3/1M)</li>
                    <li>Imagen 模型按图片张数计费 (Standard: $0.04/张)</li>
                    <li>以上成本仅供参考，实际以 Google Cloud 账单为准。</li>
                </ul>
            </div>
        </div>
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
            <h3 className="text-2xl font-bold text-white mb-2">存储位置 Storage</h3>
            <p className="text-zinc-400 text-sm mb-6">选择原图的保存方式。缩略图始终同步至云端。</p>

            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={() => handleChange('browser')}
                    className={`p-6 rounded-xl border flex flex-col items-center gap-4 transition-all ${currentMode === 'browser' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-[#1c1c1e] border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                >
                    <Globe size={32} />
                    <span className="font-medium">浏览器缓存</span>
                    <span className="text-xs opacity-70">适合临时使用，清理缓存会丢失图片</span>
                </button>

                <button
                    onClick={() => handleChange('local')}
                    className={`p-6 rounded-xl border flex flex-col items-center gap-4 transition-all ${currentMode === 'local' ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-[#1c1c1e] border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                >
                    <FolderOpen size={32} />
                    <span className="font-medium">本地文件夹</span>
                    <span className="text-xs opacity-70">推荐：直接保存到电脑硬盘</span>
                </button>
            </div>
            {loading && <div className="text-center text-zinc-500 mt-4"><Loader2 className="animate-spin inline mr-2" /> 正在切换...</div>}
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
                <h3 className="text-2xl font-bold text-white">系统日志 System Logs</h3>
                <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors">
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    {copied ? '已复制' : '导出日志'}
                </button>
            </div>

            <div className="bg-[#1c1c1e] border border-zinc-800 rounded-xl flex-1 overflow-hidden flex flex-col">
                {logs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 gap-2">
                        <ScrollText size={32} className="opacity-20" />
                        <p>暂无关键系统错误</p>
                        <p className="text-xs bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded">System Healthy</p>
                    </div>
                ) : (
                    <div className="overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {logs.map((log) => (
                            <div key={log.id} className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${log.level === LogLevel.ERROR ? 'bg-red-500/20 text-red-400' :
                                        log.level === LogLevel.WARNING ? 'bg-orange-500/20 text-orange-400' :
                                            'bg-blue-500/20 text-blue-400'
                                        }`}>{log.level}</span>
                                    <span className="text-xs text-zinc-500 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="text-sm text-white font-medium mb-1">[{log.source}] {log.message}</div>
                                {log.details && (
                                    <pre className="text-[10px] bg-black/30 p-2 rounded text-zinc-400 font-mono overflow-x-auto">
                                        {log.details}
                                    </pre>
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
        { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
        { id: 'api-channels', label: 'API 渠道', icon: Key },
        { id: 'cost-estimation', label: '成本估算', icon: DollarSign },
        { id: 'storage-settings', label: '存储位置', icon: HardDrive },
        { id: 'system-logs', label: '系统日志', icon: ScrollText },
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
                        <span className="font-bold text-white tracking-tight">System Settings</span>
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
                            <div className="text-xs text-zinc-500 mb-1">Total Consumption</div>
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

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
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
