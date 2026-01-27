import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Plus, Trash2, Activity, Pencil, Zap,
    DollarSign, Check, Pause, Play, RefreshCw, Server,
    Globe, Shield, Box, Key
} from 'lucide-react';
import { KeySlot, keyManager, DEFAULT_GOOGLE_MODELS } from '../services/keyManager';
import { CHAT_MODEL_PRESETS } from '../services/modelPresets';

export const ApiChannelsView = ({ mode = 'dispatch' }: { mode?: 'dispatch' | 'assets' }) => {
    const [slots, setSlots] = useState<KeySlot[]>(keyManager.getSlots());
    const [strategy, setStrategy] = useState(keyManager.getStrategy());
    const [loading, setLoading] = useState(false);
    const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
    // DnD State
    const [draggedId, setDraggedId] = useState<string | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formName, setFormName] = useState('');
    const [formProvider, setFormProvider] = useState('Google');
    const [formKey, setFormKey] = useState('');
    const [formBaseUrl, setFormBaseUrl] = useState('');
    const [formModels, setFormModels] = useState(''); // Comma separated strings
    const [isKeyEditing, setIsKeyEditing] = useState(false);

    useEffect(() => {
        const update = () => {
            setSlots([...keyManager.getSlots()]);
            setStrategy(keyManager.getStrategy());
        };
        const unsub = keyManager.subscribe(update);
        return unsub;
    }, []);

    const handleStrategyChange = (newStrategy: 'round-robin' | 'sequential') => {
        keyManager.setStrategy(newStrategy);
        setStrategy(newStrategy);
    };

    const openAddModal = () => {
        setEditingId(null);
        setFormName('New Channel');
        setFormProvider('Google');
        setFormKey('');
        setFormBaseUrl('');
        setFormModels(DEFAULT_GOOGLE_MODELS.join(', '));
        setIsModalOpen(true);
        setIsKeyEditing(true);
    };

    const openEditModal = (slot: KeySlot) => {
        setEditingId(slot.id);
        setFormName(slot.name);
        setFormProvider(slot.provider);
        setFormKey(slot.key);
        setFormBaseUrl(slot.baseUrl || '');
        setFormModels((slot.supportedModels || []).join(', '));
        setIsModalOpen(true);
        setIsKeyEditing(false);
    };

    const handleDelete = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (confirm('确定要删除此通道吗?')) {
            keyManager.removeKey(id);
        }
    };

    const handleToggle = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        keyManager.toggleKey(id);
    };

    const handleRefresh = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setRefreshingIds(prev => new Set(prev).add(id));

        const slot = slots.find(s => s.id === id);
        if (slot) {
            const targetUrl = slot.baseUrl || 'https://generativelanguage.googleapis.com'; // Default to Google if empty
            const result = await keyManager.testChannel(targetUrl, slot.key);

            if (result.success) {
                keyManager.reportSuccess(id);
            } else {
                keyManager.reportFailure(id, result.message || 'Validation failed');
            }
        }

        setRefreshingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
        // Optimize ghost image if needed, but default is usually fine
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
    };

    const handleDragEnter = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        const fromIndex = slots.findIndex(s => s.id === draggedId);
        const toIndex = slots.findIndex(s => s.id === targetId);

        if (fromIndex !== -1 && toIndex !== -1) {
            // Live Reorder (Optimistic Swap in UI only)
            const newSlots = [...slots];
            const [moved] = newSlots.splice(fromIndex, 1);
            newSlots.splice(toIndex, 0, moved);
            setSlots(newSlots);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        // Persistence happens here based on the final order in 'slots'
        if (draggedId) {
            const finalFromIndex = keyManager.getSlots().findIndex(s => s.id === draggedId);
            const finalToIndex = slots.findIndex(s => s.id === draggedId);

            if (finalFromIndex !== -1 && finalToIndex !== -1 && finalFromIndex !== finalToIndex) {
                keyManager.reorderSlots(finalFromIndex, finalToIndex);
            }
        }
        setDraggedId(null);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
    };

    const handleSubmit = async () => {
        if (!formKey.trim()) return;
        setLoading(true);

        const modelsArray = formModels.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
        // If no models specified, and it's Google, default to standard.
        // But logic is handled in KeyManager mostly. 
        // If user explicitly leaves it empty, KeyManager might backfill default google models 
        // ONLY IF it's a legacy migration. 
        // For new keys, if empty, it might mean "no models" or "all models"? 
        // Let's assume empty means "Default Google Models" if provider is Google, 
        // or "Auto-detect" if proxy? 
        // For now, let's just pass what user typed. If empty, KeyManager defaults to Gemini models in loadState logic, 
        // but for addKey we should probably handle defaults if empty.

        let finalModels = modelsArray;
        if (finalModels.length === 0 && (formProvider === 'Google' || !formBaseUrl)) {
            finalModels = [...DEFAULT_GOOGLE_MODELS];
        }

        const keyData = {
            name: formName.trim() || 'API Channel',
            key: formKey.trim(),
            provider: formProvider,
            baseUrl: formBaseUrl.trim(),
            supportedModels: finalModels
        };

        if (editingId) {
            keyManager.updateKey(editingId, keyData);
        } else {
            await keyManager.addKey(formKey.trim(), keyData);
        }

        setLoading(false);
        setIsModalOpen(false);
    };

    const maskApiKey = (key: string) => {
        const value = key.trim();
        if (value.length <= 8) return value;
        const head = value.slice(0, 4);
        const tail = value.slice(-4);
        return `${head}...${tail}`;
    };

    // Render Logic
    const isSequential = strategy === 'sequential';

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4 px-1 py-4 shrink-0">
                <div>
                    <h3 className="text-2xl font-bold text-white text-left">API 通道</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                        {isSequential ? '顺序优先: 按列表顺序依次调用' : '并发优先: 随机/负载均衡调用'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Strategy Switcher */}
                    <div className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-xl p-1 flex items-center">
                        <button
                            onClick={() => handleStrategyChange('round-robin')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${strategy === 'round-robin'
                                ? 'bg-zinc-700 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            title="随机/负载均衡"
                        >
                            并发优先
                        </button>
                        <button
                            onClick={() => handleStrategyChange('sequential')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${strategy === 'sequential'
                                ? 'bg-zinc-700 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                            title="顺序优先"
                        >
                            顺序优先
                        </button>
                    </div>

                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                    >
                        <Plus size={14} />
                        <span className="hidden sm:inline">添加通道</span>
                        <span className="sm:hidden">添加</span>
                    </button>
                </div>
            </div>

            {/* Channels Grid/List */}
            <div className="flex-1 overflow-y-auto px-1 pb-4 min-h-0 custom-scrollbar">
                {slots.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
                            <Key className="w-8 h-8 opacity-50" />
                        </div>
                        <p>暂无 API 通道</p>
                        <button
                            onClick={openAddModal}
                            className="text-indigo-400 hover:text-indigo-300 text-sm hover:underline"
                        >
                            点击添加第一个通道
                        </button>
                    </div>
                ) : (
                    <div className={isSequential
                        ? "flex flex-col gap-3 max-w-3xl mx-0 w-full"
                        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    }>
                        {slots.map((slot, index) => (
                            <div
                                key={slot.id}
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, slot.id)}
                                onDragOver={handleDragOver}
                                onDragEnter={(e) => handleDragEnter(e, slot.id)}
                                onDrop={handleDrop}
                                onDragEnd={handleDragEnd}
                                onClick={() => openEditModal(slot)}
                                className={`
                                    group relative rounded-xl border cursor-move
                                    transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
                                    ${slot.disabled
                                        ? 'bg-zinc-900/30 border-zinc-800/50 opacity-60'
                                        : 'bg-[var(--bg-secondary)] border-[var(--border-light)] hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5'
                                    }
                                    ${isSequential ? 'flex items-center gap-4 p-3' : 'p-4'}
                                    ${draggedId === slot.id ? 'opacity-20 border-dashed border-indigo-500 scale-[0.98]' : 'hover:-translate-y-0.5'}
                                `}
                            >
                                {/* Sequential Order Badge */}
                                {isSequential && (
                                    <div className="shrink-0 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-400">
                                        {index + 1}
                                    </div>
                                )}

                                {/* Card Content Container */}
                                <div className={`flex-1 min-w-0 ${isSequential ? 'flex items-center justify-between gap-4' : ''}`}>

                                    {/* Main Info */}
                                    <div className="min-w-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${refreshingIds.has(slot.id) ? 'bg-blue-500 animate-pulse' :
                                                    slot.disabled ? 'bg-zinc-600' :
                                                        slot.status === 'valid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
                                                            (slot.status === 'invalid' || slot.status === 'rate_limited') ? 'bg-red-500' :
                                                                'bg-zinc-600'
                                                    }`} />
                                                <h4 className="font-medium text-zinc-200 truncate pr-2" title={slot.name}>
                                                    {slot.name}
                                                </h4>
                                            </div>
                                            {!isSequential && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${slot.provider === 'Google'
                                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                    : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                                    }`}>
                                                    {slot.provider}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                                            <Key size={12} />
                                            <span className="truncate">{maskApiKey(slot.key)}</span>
                                        </div>
                                    </div>

                                    {/* Stats & Actions (Horizontal in Sequential, Bottom in Grid) */}
                                    <div className={`
                                        ${isSequential
                                            ? 'flex items-center gap-6 shrink-0'
                                            : 'mt-4 pt-4 border-t border-[var(--border-light)] flex items-center justify-between'
                                        }
                                    `}>
                                        {/* Usage Stats */}
                                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                                            <div className="flex items-center gap-1" title="调用成功次数">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                                                {slot.successCount || 0}
                                            </div>
                                            <div className="flex items-center gap-1" title="调用失败次数">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
                                                {slot.failCount || 0}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => handleRefresh(slot.id, e)}
                                                disabled={refreshingIds.has(slot.id)}
                                                className={`p-1.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors ${refreshingIds.has(slot.id) ? 'animate-spin text-indigo-500' : ''
                                                    }`}
                                                title="验证连通性"
                                            >
                                                <RefreshCw size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => handleToggle(slot.id, e)}
                                                className={`p-1.5 rounded-lg transition-colors ${slot.disabled
                                                    ? 'hover:bg-emerald-500/10 text-zinc-500 hover:text-emerald-500'
                                                    : 'hover:bg-amber-500/10 text-emerald-500 hover:text-amber-500'
                                                    }`}
                                                title={slot.disabled ? "启用通道" : "禁用通道"}
                                            >
                                                {slot.disabled ? <Play size={14} /> : <Pause size={14} />}
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(slot.id, e)}
                                                className="p-1.5 hover:bg-red-500/10 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                                                title="删除通道"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Stats */}
                                    <div className="grid grid-cols-3 gap-2 bg-[var(--bg-tertiary)] rounded-lg p-2 border border-[var(--border-light)]">
                                        <div className="text-center">
                                            <div className="text-[10px] text-zinc-500">成/败</div>
                                            <div className="text-xs font-mono text-zinc-300">
                                                <span className="text-emerald-400">{slot.successCount}</span>
                                                <span className="text-zinc-600">/</span>
                                                <span className="text-red-400">{slot.failCount}</span>
                                            </div>
                                        </div>
                                        <div className="text-center border-l border-white/5">
                                            <div className="text-[10px] text-zinc-500">延迟</div>
                                            <div className="text-xs font-mono text-zinc-300">-</div>
                                        </div>
                                        <div className="text-center border-l border-white/5">
                                            <div className="text-[10px] text-zinc-500">消耗</div>
                                            <div className="text-xs font-mono text-amber-400">${(slot.totalCost || 0).toFixed(3)}</div>
                                        </div>
                                    </div>

                                    {/* Models Tags */}

                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[10050] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-secondary)] w-full max-w-md rounded-2xl border border-[var(--border-light)] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center p-5 border-b border-[var(--border-light)]">
                            <h4 className="text-lg font-bold text-white">{editingId ? '编辑通道' : '添加通道'}</h4>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white"><X size={20} /></button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">

                            {/* Step 1: Connection Details */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between text-xs text-zinc-500 uppercase tracking-wider font-bold">
                                    连接配置
                                </div>

                                {formProvider !== 'Google' && (
                                    <div>
                                        <label className="text-xs text-zinc-400 mb-1.5 block">接口地址 (Base URL)</label>
                                        <div className="relative">
                                            <input
                                                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white font-mono outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 placeholder-zinc-600 transition-all"
                                                placeholder={formProvider === 'Google' ? "https://generativelanguage.googleapis.com" : "https://api.openai.com/v1"}
                                                value={formBaseUrl}
                                                onChange={e => {
                                                    setFormBaseUrl(e.target.value);
                                                    // Auto-set provider if recognized
                                                    const val = e.target.value.toLowerCase();
                                                    if (val.includes('deepseek')) { setFormName(n => n === 'New Channel' || !n ? 'DeepSeek' : n); setFormProvider('OpenAI'); }
                                                    else if (val.includes('silicon')) { setFormName(n => n === 'New Channel' || !n ? 'SiliconFlow' : n); setFormProvider('OpenAI'); }
                                                    else if (val.includes('openrouter')) { setFormName(n => n === 'New Channel' || !n ? 'OpenRouter' : n); setFormProvider('OpenAI'); }
                                                }}
                                            />
                                            <Globe className="absolute left-3 top-2.5 text-zinc-600 pointer-events-none" size={14} />
                                        </div>
                                    </div>
                                )}

                                {/* API Key */}
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1.5 block">API Key</label>
                                    <div className="relative">
                                        <input
                                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg pl-9 pr-10 py-2.5 text-sm text-white font-mono outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                                            type={isKeyEditing ? "text" : "password"}
                                            value={isKeyEditing ? formKey : maskApiKey(formKey)}
                                            onChange={e => setFormKey(e.target.value)}
                                            onFocus={() => setIsKeyEditing(true)}
                                            onBlur={() => setIsKeyEditing(false)}
                                            placeholder="sk-..."
                                            autoComplete="off"
                                        />
                                        <Key className="absolute left-3 top-2.5 text-zinc-600 pointer-events-none" size={14} />
                                    </div>
                                </div>

                                {/* Auto Fetch Button */}
                                <div>
                                    <button
                                        onClick={async () => {
                                            if (!formBaseUrl && !formKey) return;
                                            setLoading(true);

                                            // Default URL if empty
                                            const targetUrl = formBaseUrl || 'https://api.openai.com/v1';

                                            try {
                                                const models = await keyManager.fetchRemoteModels(targetUrl, formKey);
                                                if (models.length > 0) {
                                                    setFormModels(models.join(', '));
                                                    // Auto-name if still default
                                                    if (formName === 'New Channel' || !formName) {
                                                        try {
                                                            const url = new URL(targetUrl);
                                                            const domain = url.hostname.split('.').slice(-2).join('.').split('.')[0];
                                                            setFormName(domain.charAt(0).toUpperCase() + domain.slice(1));
                                                        } catch (e) {
                                                            setFormName('Custom API');
                                                        }
                                                    }
                                                    alert(`成功获取 ${models.length} 个模型！`);
                                                } else {
                                                    alert('未发现模型，请检查 URL 和 Key，或手动输入模型。');
                                                }
                                            } catch (e) {
                                                alert('连接失败');
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                        disabled={loading || !formKey}
                                        className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all ${loading || !formKey
                                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                            : 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 border border-indigo-500/20'
                                            }`}
                                    >
                                        {loading ? <RefreshCw className="animate-spin" size={14} /> : <Zap size={14} />}
                                        {loading ? '正在获取...' : '自动获取模型列表 (Auto-Fetch)'}
                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-[var(--border-light)]" />

                            {/* Step 2: Meta Info */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between text-xs text-zinc-500 uppercase tracking-wider font-bold">
                                    基础信息 & 模型
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs text-zinc-400 mb-1.5 block">通道名称</label>
                                        <input
                                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                                            placeholder="My Channel"
                                            value={formName}
                                            onChange={e => setFormName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-400 mb-1.5 block">供应商类型</label>
                                        <select
                                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                                            value={formProvider}
                                            onChange={e => {
                                                const nextProvider = e.target.value;
                                                setFormProvider(nextProvider);
                                                if (nextProvider === 'Google' && !formModels.trim()) {
                                                    setFormModels(DEFAULT_GOOGLE_MODELS.join(', '));
                                                }
                                            }}
                                        >
                                            <option value="Google">Google / Gemini</option>
                                            <option value="OpenAI">OpenAI Compatible</option>
                                            <option value="Anthropic">Anthropic</option>
                                            <option value="Custom">Custom</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Models */}
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1.5 flex justify-between items-center">
                                        <span>可用模型 ID (逗号分隔)</span>
                                        <div className="flex gap-2 flex-wrap justify-end">
                                            {formProvider === 'Google' ? (
                                                <>
                                                    <span className="text-indigo-400 cursor-pointer hover:underline text-[10px]" onClick={() => setFormModels(prev => (prev ? prev + ', ' : '') + 'gemini-3-pro-preview')}>+ Gemini 3 Pro</span>
                                                    <span className="text-indigo-400 cursor-pointer hover:underline text-[10px]" onClick={() => setFormModels(prev => (prev ? prev + ', ' : '') + 'gemini-3-flash-preview')}>+ Gemini 3 Flash</span>
                                                    <span className="text-indigo-400 cursor-pointer hover:underline text-[10px]" onClick={() => setFormModels(DEFAULT_GOOGLE_MODELS.join(', '))}>填入热门模型</span>
                                                </>
                                            ) : (
                                                <div className="flex flex-wrap gap-2 justify-end max-w-[200px]">
                                                    {CHAT_MODEL_PRESETS.slice(0, 4).map(preset => (
                                                        <span
                                                            key={preset.id}
                                                            className="text-indigo-400 cursor-pointer hover:underline text-[10px]"
                                                            onClick={() => setFormModels(prev => {
                                                                const current = prev.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
                                                                if (current.includes(preset.id)) return prev;
                                                                return (prev ? prev + ', ' : '') + preset.id;
                                                            })}
                                                        >
                                                            + {preset.label.split(' ')[0]}
                                                        </span>
                                                    ))}
                                                    <span className="text-zinc-500 text-[10px] cursor-help" title="更多模型请手动输入或自动获取">...</span>
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                    <textarea
                                        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-xs text-white font-mono outline-none focus:border-indigo-500/50 min-h-[100px] leading-relaxed resize-none"
                                        placeholder="模型 ID 列表，例如: deepseek-chat, deepseek-coder..."
                                        value={formModels}
                                        onChange={e => setFormModels(e.target.value)}
                                    />
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {formModels.split(/[,，\n]/).filter(Boolean).slice(0, 5).map((m, i) => (
                                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-white/5 rounded text-zinc-400">{m.trim()}</span>
                                        ))}
                                        {formModels.split(/[,，\n]/).filter(Boolean).length > 5 && <span className="text-[10px] text-zinc-600">...</span>}
                                    </div>
                                    {formProvider === 'Google' && (
                                        <p className="text-[10px] text-zinc-500 mt-1">Google 通道默认已填热门模型，可按需增删。</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-5 border-t border-[var(--border-light)] flex justify-end gap-3 bg-[var(--bg-secondary)]">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="px-6 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
                            >
                                {loading ? '处理中...' : (editingId ? '保存修改' : '添加通道')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
