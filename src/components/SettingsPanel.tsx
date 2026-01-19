import React, { useState, useEffect } from 'react';
import { X, BarChart3, Wallet, AlertCircle, Settings, Key, Copy, Check } from 'lucide-react';
import { getTodayCosts, getCostsByModel, getModelDisplayName } from '../services/costService';
import { getTodayLogs, LogLevel, exportLogsForAI, SystemLogEntry } from '../services/systemLogService';
import { keyManager } from '../services/keyManager';
import { ModelType } from '../types';

type SettingsView = 'dashboard' | 'api-channels' | 'cost-estimation' | 'system-logs';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    initialView?: SettingsView;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, initialView = 'dashboard' }) => {
    const [activeView, setActiveView] = useState<SettingsView>(initialView);
    const [apiSlots, setApiSlots] = useState<{ id: string; key: string }[]>([]);
    const [newKey, setNewKey] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setActiveView(initialView);
            loadApiKeys();
        }
    }, [isOpen, initialView]);

    const loadApiKeys = async () => {
        const slots = keyManager.getSlots();
        setApiSlots(slots.map(s => ({ id: s.id, key: s.key })));
    };

    const handleAddKey = async () => {
        if (!newKey.trim()) return;
        await keyManager.addKey(newKey.trim());
        setNewKey('');
        loadApiKeys();
    };

    const handleRemoveKey = async (id: string) => {
        keyManager.removeKey(id);
        loadApiKeys();
    };

    if (!isOpen) return null;

    const renderNavItem = (view: SettingsView, icon: React.ReactNode, label: string) => (
        <button
            onClick={() => setActiveView(view)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all w-full text-left ${activeView === view
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#18181b] rounded-2xl shadow-2xl border border-white/10 w-[900px] max-w-[95vw] h-[600px] max-h-[90vh] flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-48 bg-black/20 border-r border-white/5 p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2 px-3 py-2 mb-2">
                        <Settings size={18} className="text-indigo-400" />
                        <span className="font-medium text-white">设置</span>
                    </div>
                    {renderNavItem('dashboard', <BarChart3 size={16} />, '仪表盘')}
                    {renderNavItem('api-channels', <Key size={16} />, 'API 渠道')}
                    {renderNavItem('cost-estimation', <Wallet size={16} />, '成本估算')}
                    {renderNavItem('system-logs', <AlertCircle size={16} />, '系统日志')}
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                        <h2 className="text-lg font-medium text-white">
                            {activeView === 'dashboard' && '仪表盘'}
                            {activeView === 'api-channels' && 'API 渠道管理'}
                            {activeView === 'cost-estimation' && '成本估算'}
                            {activeView === 'system-logs' && '系统日志'}
                        </h2>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
                            <X size={20} className="text-zinc-400" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-auto p-6">
                        {activeView === 'dashboard' && <DashboardView apiKeysCount={apiSlots.length} />}
                        {activeView === 'api-channels' && (
                            <ApiChannelsView
                                apiSlots={apiSlots}
                                newKey={newKey}
                                setNewKey={setNewKey}
                                onAdd={handleAddKey}
                                onRemove={handleRemoveKey}
                            />
                        )}
                        {activeView === 'cost-estimation' && <CostEstimationView />}
                        {activeView === 'system-logs' && <SystemLogsView />}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Dashboard View
const DashboardView: React.FC<{ apiKeysCount: number }> = ({ apiKeysCount }) => {
    const costs = getTodayCosts();
    const logs = getTodayLogs();
    const errorCount = logs.filter(l => l.level === LogLevel.ERROR || l.level === LogLevel.CRITICAL).length;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
                {/* Stats Cards */}
                <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-4">
                    <div className="text-xs text-zinc-400 mb-1">今日生成</div>
                    <div className="text-2xl font-bold text-white">{costs.totalImages}</div>
                    <div className="text-xs text-zinc-500">张图片</div>
                </div>
                <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-4">
                    <div className="text-xs text-zinc-400 mb-1">今日成本</div>
                    <div className="text-2xl font-bold text-white">${costs.totalCostUsd.toFixed(4)}</div>
                    <div className="text-xs text-zinc-500">USD (估算)</div>
                </div>
                <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-xl p-4">
                    <div className="text-xs text-zinc-400 mb-1">API Keys</div>
                    <div className="text-2xl font-bold text-white">{apiKeysCount}</div>
                    <div className={`text-xs ${apiKeysCount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {apiKeysCount > 0 ? '已配置' : '未配置'}
                    </div>
                </div>
            </div>

            {/* Status */}
            <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                <div className="text-sm font-medium text-white mb-3">系统状态</div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">API 连接</span>
                        <span className={apiKeysCount > 0 ? 'text-green-400' : 'text-red-400'}>
                            {apiKeysCount > 0 ? '● 正常' : '● 未配置'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">今日错误</span>
                        <span className={errorCount === 0 ? 'text-green-400' : 'text-orange-400'}>
                            {errorCount} 条
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">数据存储</span>
                        <span className="text-green-400">● 正常</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// API Channels View
interface ApiChannelsViewProps {
    apiSlots: { id: string; key: string }[];
    newKey: string;
    setNewKey: (key: string) => void;
    onAdd: () => void;
    onRemove: (id: string) => void;
}

const ApiChannelsView: React.FC<ApiChannelsViewProps> = ({ apiSlots, newKey, setNewKey, onAdd, onRemove }) => {
    return (
        <div className="space-y-4">
            {/* Add Key */}
            <div className="flex gap-2">
                <input
                    type="password"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="输入 Gemini API Key..."
                    className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button
                    onClick={onAdd}
                    disabled={!newKey.trim()}
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-50"
                >
                    添加
                </button>
            </div>

            {/* Key List */}
            <div className="space-y-2">
                {apiSlots.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                        暂无 API Key，请添加
                    </div>
                ) : (
                    apiSlots.map((slot) => (
                        <div key={slot.id} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg px-4 py-3">
                            <div className="flex items-center gap-3">
                                <Key size={16} className="text-zinc-500" />
                                <span className="text-sm text-white font-mono">
                                    {slot.key.slice(0, 8)}...{slot.key.slice(-4)}
                                </span>
                            </div>
                            <button
                                onClick={() => onRemove(slot.id)}
                                className="text-xs text-red-400 hover:text-red-300"
                            >
                                删除
                            </button>
                        </div>
                    ))
                )}
            </div>

            <p className="text-xs text-zinc-500">
                获取 API Key: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-indigo-400 hover:underline">Google AI Studio</a>
            </p>
        </div>
    );
};

// Cost Estimation View
const CostEstimationView: React.FC = () => {
    const costs = getTodayCosts();
    const breakdown = getCostsByModel();

    return (
        <div className="space-y-4">
            {/* Warning Note */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-400">
                ⚠️ 成本估算仅供参考，实际费用以 Google Cloud 账单为准。数据每日重置。
            </div>

            {/* Summary */}
            <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-6 text-center">
                <div className="text-sm text-zinc-400 mb-2">今日估算成本</div>
                <div className="text-4xl font-bold text-white">${costs.totalCostUsd.toFixed(4)}</div>
                <div className="text-sm text-zinc-500 mt-1">{costs.totalImages} 张图片</div>
            </div>

            {/* Breakdown by Model */}
            <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                    <span className="text-sm font-medium text-white">按模型分类</span>
                </div>
                <div className="divide-y divide-white/5">
                    {Object.keys(breakdown).length === 0 ? (
                        <div className="px-4 py-6 text-center text-zinc-500 text-sm">
                            今日暂无生成记录
                        </div>
                    ) : (
                        Object.entries(breakdown).map(([model, data]) => (
                            <div key={model} className="flex items-center justify-between px-4 py-3">
                                <div>
                                    <div className="text-sm text-white">{getModelDisplayName(model as ModelType)}</div>
                                    <div className="text-xs text-zinc-500">{data.count} 张</div>
                                </div>
                                <div className="text-sm text-green-400">${data.cost.toFixed(4)}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// System Logs View
const SystemLogsView: React.FC = () => {
    const [logs, setLogs] = useState<SystemLogEntry[]>([]);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        setLogs(getTodayLogs());
    }, []);

    const handleCopyForAI = () => {
        const text = exportLogsForAI();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getLevelColor = (level: LogLevel) => {
        switch (level) {
            case LogLevel.ERROR:
            case LogLevel.CRITICAL:
                return 'text-red-400 bg-red-500/10';
            case LogLevel.WARNING:
                return 'text-orange-400 bg-orange-500/10';
            default:
                return 'text-blue-400 bg-blue-500/10';
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">
                    今日共 {logs.length} 条日志
                </div>
                <button
                    onClick={handleCopyForAI}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg text-xs hover:bg-indigo-500/30"
                >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? '已复制' : '复制给 AI 调试'}
                </button>
            </div>

            {/* Note */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-400">
                💡 点击"复制给 AI 调试"可将日志以 AI 可读格式复制，方便排查问题。
            </div>

            {/* Logs List */}
            <div className="space-y-2 max-h-[350px] overflow-auto">
                {logs.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                        今日暂无系统日志
                    </div>
                ) : (
                    logs.slice().reverse().map((log) => (
                        <div key={log.id} className="bg-black/20 border border-white/5 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                                    {log.level}
                                </span>
                                <span className="text-xs text-zinc-500">{log.source}</span>
                                <span className="text-xs text-zinc-600 ml-auto">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <div className="text-sm text-white">{log.message}</div>
                            {log.details && log.details !== log.message && (
                                <details className="mt-2">
                                    <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">
                                        查看详情
                                    </summary>
                                    <pre className="mt-2 text-xs text-zinc-400 bg-black/30 rounded p-2 overflow-auto max-h-32">
                                        {log.details}
                                    </pre>
                                </details>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SettingsPanel;
