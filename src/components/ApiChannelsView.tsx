import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Plus, Trash2, Activity, Pencil, Zap,
    DollarSign, Check, Pause, Play, RefreshCw, Server,
    Globe, Shield, Box, Key, Terminal
} from 'lucide-react';
import { KeySlot, keyManager, DEFAULT_GOOGLE_MODELS, parseModelString } from '../services/keyManager';
import { generateImage } from "../services/geminiService";
import { comprehensiveConnectionTest } from "../services/connectionTest"; // Use new test service
import { notify } from '../services/notificationService';
import { CHAT_MODEL_PRESETS } from '../services/modelPresets';

// Helper to split model strings respecting parentheses
const splitModelStrings = (input: string): string[] => {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (char === '(') depth++;
        if (char === ')') depth--;

        if ((char === ',' || char === '，' || char === '\n') && depth === 0) {
            if (current.trim()) result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) result.push(current.trim());
    return result;
};

// Preset Providers Configuration
const PRESET_PROVIDERS = [
    { label: 'Cherry Studio', url: 'https://future-api.vodeshop.com', provider: 'OpenAI', mode: 'chat', models: 'nano-banana(Nano Banana), nano-banana-pro(Nano Banana Pro), flux-schnell(Flux Fast), gemini-2.5-flash-image(Gemini 2.5 Flash)' },
    { label: 'Gemini-API.cn', url: 'https://gemini-api.cn', provider: 'OpenAI', mode: 'standard', models: 'gemini-2.5-flash-image, gemini-3-pro-image-preview, imagen-3.0-generate-001' },
    { label: 'SiliconFlow (硅基流动)', url: 'https://api.siliconflow.cn', provider: 'OpenAI', mode: 'chat', models: 'deepseek-ai/DeepSeek-V3, deepseek-ai/DeepSeek-R1, black-forest-labs/FLUX.1-schnell, stabilityai/stable-diffusion-3-medium' },
    { label: 'DeepSeek Official', url: 'https://api.deepseek.com', provider: 'OpenAI', mode: 'chat', models: 'deepseek-chat, deepseek-reasoner' },
    { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', provider: 'OpenAI', mode: 'standard', models: 'google/gemini-2.0-flash-exp:free, google/gemini-flash-1.5, openai/gpt-4o, anthropic/claude-3.5-sonnet' },
    { label: 'OpenAI Official', url: 'https://api.openai.com/v1', provider: 'OpenAI', mode: 'standard', models: 'dall-e-3(DALL-E 3), gpt-4o(GPT-4o), gpt-4o-mini' },
    { label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com', provider: 'Google', mode: 'standard', models: DEFAULT_GOOGLE_MODELS.join(', ') },
];

export const ApiChannelsView = ({ mode = 'dispatch' }: { mode?: 'dispatch' | 'assets' }) => {
    const [slots, setSlots] = useState<KeySlot[]>(keyManager.getSlots());
    const [strategy, setStrategy] = useState(keyManager.getStrategy());

    const clampAndFormat = (value?: number) => {
        const v = Math.floor(value || 0);
        return v.toLocaleString('en-US');
    };
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
    const [formCompatibility, setFormCompatibility] = useState<'standard' | 'chat'>('standard');
    const [isKeyEditing, setIsKeyEditing] = useState(false);

    // Auto-detect provider & settings from Key pattern
    const detectProviderFromKey = (key: string) => {
        const k = key.trim();
        if (k.startsWith('AIza')) {
            // Google
            setFormProvider('Google');
            setFormBaseUrl('https://generativelanguage.googleapis.com');
            setFormModels(DEFAULT_GOOGLE_MODELS.join(', '));
            setFormCompatibility('standard');
        } else if (k.startsWith('sk-ant')) {
            // Anthropic
            setFormProvider('Anthropic');
            setFormBaseUrl('https://api.anthropic.com');
            setFormCompatibility('standard');
        } else if (k.startsWith('sk-or-')) {
            // OpenRouter
            const preset = PRESET_PROVIDERS.find(p => p.label === 'OpenRouter');
            if (preset) {
                setFormProvider(preset.provider);
                setFormBaseUrl(preset.url);
                setFormCompatibility(preset.mode as any);
            }
        }
        // For generic 'sk-', we rely on Base URL detection or user preset selection
    };

    // Auto-detect settings from Base URL
    const detectSettingsFromUrl = (url: string) => {
        const lower = url.toLowerCase();
        if (lower.includes('googleapis.com')) {
            setFormProvider('Google');
            setFormCompatibility('standard');
        } else if (lower.includes('anthropic.com')) {
            setFormProvider('Anthropic');
            setFormCompatibility('standard');
        } else {
            // Default to OpenAI Compatible for most custom URLs
            setFormProvider('OpenAI');

            // Auto-detect Chat Mode for known chat-only providers
            if (lower.includes('vodeshop') || lower.includes('cherry') || lower.includes('siliconflow') || lower.includes('deepseek')) {
                setFormCompatibility('chat');
            } else {
                setFormCompatibility('standard'); // Default standard for NewAPI/OneAPI
            }
        }
    };

    // Apply Preset
    const applyPreset = (label: string) => {
        const preset = PRESET_PROVIDERS.find(p => p.label === label);
        if (preset) {
            setFormBaseUrl(preset.url);
            setFormProvider(preset.provider);
            setFormCompatibility(preset.mode as any);
            if (preset.models) {
                setFormModels(preset.models);
            }
            if (formName === 'New Channel' || !formName) {
                setFormName(preset.label);
            }
        }
    };

    // Test Status
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');

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
        setFormCompatibility('standard');
        setFormModels(DEFAULT_GOOGLE_MODELS.join(', '));
        setTestStatus('idle');
        setTestMessage('');
        setIsModalOpen(true);
        setIsKeyEditing(true);
    };

    const openEditModal = (slot: KeySlot) => {
        setEditingId(slot.id);
        setFormName(slot.name);
        setFormProvider(slot.provider);
        setFormKey(slot.key);
        setFormBaseUrl(slot.baseUrl || '');
        setFormCompatibility(slot.compatibilityMode || 'standard');
        setFormModels((slot.supportedModels || []).join(', '));
        setTestStatus('idle');
        setTestMessage('');
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
            const result = await keyManager.testChannel(targetUrl, slot.key, slot.provider, slot.authMethod, slot.headerName);

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

    const handleTestConnection = async () => {
        if (!formKey || (!formBaseUrl && formProvider !== 'Google')) {
            setTestStatus('error');
            setTestMessage('请先填写完整 API Key 和 接口地址');
            return;
        }

        setTestStatus('testing');
        setTestMessage('正在连接测试...');

        try {
            // Use new comprehensive test
            const results = await comprehensiveConnectionTest({
                apiKey: formKey,
                baseUrl: formBaseUrl || (formProvider === 'Google' ? 'https://generativelanguage.googleapis.com' : ''),
                model: formModels.split(',')[0]?.trim() || 'gpt-3.5-turbo',
                compatibilityMode: formCompatibility,
                provider: formProvider
            });

            const successTest = results.find(r => r.success);
            const failTest = results.find(r => !r.success);

            if (successTest) {
                setTestStatus('success');
                // Prefer showing the API test message if available
                const apiMsg = results.find(r => r.message.includes('API'))?.message;
                setTestMessage(apiMsg || successTest.message);
            } else {
                setTestStatus('error');
                setTestMessage(failTest?.message || '连接失败');
            }
        } catch (e: any) {
            setTestStatus('error');
            setTestMessage(e.message || '连接失败');
        }
    };

    const handleSubmit = async () => {
        if (!formKey.trim()) return;
        setLoading(true);

        const modelsArray = splitModelStrings(formModels);
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
            compatibilityMode: formCompatibility,
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
                    <h3 className="text-2xl font-bold text-left" style={{ color: 'var(--text-primary)' }}>API 通道</h3>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {isSequential ? '顺序优先: 按列表顺序依次调用' : '并发优先: 随机/负载均衡调用'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Strategy Switcher */}
                    <div className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-xl p-1 flex items-center">
                        <button
                            onClick={() => handleStrategyChange('round-robin')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${strategy === 'round-robin'
                                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm border border-[var(--border-light)]'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                }`}
                            title="随机/负载均衡"
                        >
                            并发优先
                        </button>
                        <button
                            onClick={() => handleStrategyChange('sequential')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${strategy === 'sequential'
                                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm border border-[var(--border-light)]'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                                }`}
                            title="顺序优先"
                        >
                            顺序优先
                        </button>
                    </div>

                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 !text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                        style={{ color: 'white' }}
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
                    <div className="h-full flex flex-col items-center justify-center text-[var(--text-tertiary)] space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)]/50 flex items-center justify-center">
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
                    <div className={
                        isSequential
                            ? "flex flex-col gap-3 max-w-3xl mx-auto w-full pb-4 pt-2 px-4"
                            : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 px-4 pb-6 pt-2"
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
                                        ? 'bg-[var(--bg-tertiary)]/30 border-[var(--border-medium)]/50 opacity-60'
                                        : 'bg-[var(--bg-secondary)] border-[var(--border-light)] hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5'
                                    }
                                    p-4 w-full
                                    ${draggedId === slot.id ? 'opacity-20 border-dashed border-indigo-500 scale-[0.98]' : 'hover:-translate-y-1 hover:z-10 relative'}
                                `}
                            >
                                {/* Sequential Order Badge */}
                                {isSequential && (
                                    <div className="absolute top-4 left-4 shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-xs font-mono text-indigo-400 font-semibold">
                                        {index + 1}
                                    </div>
                                )}

                                {/* Card Content Container */}
                                <div className="flex-1 min-w-0">

                                    {/* Main Info */}
                                    <div className={`min-w-0 ${isSequential ? 'pl-8' : ''}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${refreshingIds.has(slot.id) ? 'bg-blue-500 animate-pulse' :
                                                    slot.disabled ? 'bg-[var(--text-tertiary)]' :
                                                        slot.status === 'valid' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' :
                                                            (slot.status === 'invalid' || slot.status === 'rate_limited') ? 'bg-red-500' :
                                                                'bg-[var(--text-tertiary)]'
                                                    }`} />
                                                <h4 className="font-medium truncate pr-2" style={{ color: 'var(--text-primary)' }} title={slot.name}>
                                                    {slot.name}
                                                </h4>
                                            </div>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${slot.provider === 'Google'
                                                ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                : 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                                                }`}>
                                                {slot.provider}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                                            <Key size={12} />
                                            <span className="truncate">{maskApiKey(slot.key)}</span>
                                        </div>
                                    </div>

                                    {/* Stats & Actions */}
                                    <div className="mt-4 pt-4 border-t border-[var(--border-light)] flex items-center justify-between">
                                        {/* Usage Stats */}
                                        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
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
                                                className={`p-1.5 rounded-lg transition-colors ${refreshingIds.has(slot.id) ? 'animate-spin text-indigo-500' : 'hover:bg-[var(--toolbar-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                                                title="验证连通性"
                                            >
                                                <RefreshCw size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => handleToggle(slot.id, e)}
                                                className={`p-1.5 rounded-lg transition-colors ${slot.disabled
                                                    ? 'hover:bg-emerald-500/10 text-[var(--text-tertiary)] hover:text-emerald-500'
                                                    : 'hover:bg-amber-500/10 text-emerald-500 hover:text-amber-500'
                                                    }`}
                                                title={slot.disabled ? "启用通道" : "禁用通道"}
                                            >
                                                {slot.disabled ? <Play size={14} /> : <Pause size={14} />}
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(slot.id, e)}
                                                className="p-1.5 hover:bg-red-500/10 text-[var(--text-tertiary)] hover:text-red-500 rounded-lg transition-colors"
                                                title="删除通道"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Stats (Fixed Width for Alignment in Sequential Desktop, Block in Mobile) */}
                                    <div className={`grid grid-cols-2 gap-2 bg-[var(--bg-tertiary)] rounded-lg p-2 border border-[var(--border-light)] ${isSequential ? 'w-full mt-3' : 'w-full mt-3'}`}>
                                        <div className="text-center">
                                            <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Tokens消耗</div>
                                            <div className="text-xs font-mono text-emerald-500 break-all" style={{ fontWeight: 600 }}>{clampAndFormat(slot.usedTokens)}</div>
                                        </div>
                                        <div className="text-center border-l" style={{ borderColor: 'var(--border-light)' }}>
                                            <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>费用消耗</div>
                                            <div className="text-xs font-mono text-amber-500 break-all" style={{ fontWeight: 600 }}>${clampAndFormat(slot.totalCost)}</div>
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
            {
                isModalOpen && createPortal(
                    <div className="fixed inset-0 z-[10050] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-[var(--bg-secondary)] w-full max-w-md rounded-2xl border border-[var(--border-light)] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] overflow-hidden">
                            <div className="flex justify-between items-center p-5 border-b border-[var(--border-light)]">
                                <h4 className="text-lg font-bold text-[var(--text-primary)]">{editingId ? '编辑通道' : '添加通道'}</h4>
                                <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={20} /></button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">

                                {/* Step 1: Connection Details */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-bold">
                                        连接配置
                                    </div>

                                    {formProvider !== 'Google' && (
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <label className="text-xs text-[var(--text-secondary)]">接口地址 (Base URL)</label>
                                                <select
                                                    className="bg-[var(--bg-tertiary)] text-[10px] border border-[var(--border-light)] rounded px-2 py-0.5 text-[var(--text-tertiary)] outline-none hover:border-indigo-500/50 cursor-pointer"
                                                    onChange={(e) => {
                                                        if (e.target.value) applyPreset(e.target.value);
                                                        e.target.value = ''; // Reset
                                                    }}
                                                >
                                                    <option value="">🚀 快速选择...</option>
                                                    {PRESET_PROVIDERS.filter(p => p.provider !== 'Google').map(p => (
                                                        <option key={p.label} value={p.label}>{p.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[var(--text-primary)] font-mono outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 placeholder-zinc-600 transition-all"
                                                    placeholder={formProvider === 'Google' ? "https://generativelanguage.googleapis.com" : "https://api.openai.com/v1"}
                                                    value={formBaseUrl}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setFormBaseUrl(val);
                                                        detectSettingsFromUrl(val);

                                                        // Auto-name if default
                                                        if (val.includes('deepseek')) { setFormName(n => n === 'New Channel' || !n ? 'DeepSeek' : n); }
                                                        else if (val.includes('silicon')) { setFormName(n => n === 'New Channel' || !n ? 'SiliconFlow' : n); }
                                                        else if (val.includes('openrouter')) { setFormName(n => n === 'New Channel' || !n ? 'OpenRouter' : n); }
                                                    }}
                                                />
                                                <Globe className="absolute left-3 top-2.5 text-[var(--text-secondary)] pointer-events-none" size={14} />
                                            </div>

                                            {/* Test Connection Button (Moved here) */}
                                            <div className="flex justify-end mt-2">
                                                <button
                                                    type="button"
                                                    onClick={handleTestConnection}
                                                    disabled={testStatus === 'testing'}
                                                    className={`text-[10px] px-3 py-1.5 rounded border flex items-center gap-2 transition-colors ${testStatus === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                        testStatus === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                            'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border-[var(--border-medium)] hover:text-[var(--text-secondary)]'
                                                        }`}
                                                >
                                                    {testStatus === 'testing' ? <Globe size={12} className="animate-spin" /> : <Terminal size={12} />}
                                                    {testStatus === 'testing' ? '测试中...' : '测试连接 (Test Connection)'}
                                                </button>
                                            </div>
                                            {testMessage && (
                                                <div className={`text-[10px] mt-2 p-2 rounded text-right ${testStatus === 'success' ? 'text-emerald-400' :
                                                    testStatus === 'error' ? 'text-red-400' : 'text-[var(--text-tertiary)]'
                                                    }`}>
                                                    {testMessage}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Auto-detected Endpoint Info (Hidden Select) */}
                                    {formProvider !== 'Google' && (
                                        <div className="bg-[var(--bg-primary)] rounded px-3 py-2 border border-[var(--border-light)] flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-bold tracking-wider">自动适配模式</span>
                                                <span className="text-xs text-[var(--text-secondary)]">
                                                    {formCompatibility === 'standard' ? '标准 API (Standard)' : '对话模拟 (Chat Compat)'}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-[var(--text-secondary)] max-w-[50%] text-right">
                                                {formCompatibility === 'standard'
                                                    ? '适用于大多数兼容 OpenAI 的中转站'
                                                    : '适用于 Cherry Studio、SiliconFlow 等特殊渠道'}
                                            </div>
                                        </div>
                                    )}

                                    {/* API Key */}
                                    <div>
                                        <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">API Key</label>
                                        <div className="relative">
                                            <input
                                                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg pl-9 pr-10 py-2.5 text-sm text-[var(--text-primary)] font-mono outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                                                type={isKeyEditing ? "text" : "password"}
                                                value={isKeyEditing ? formKey : maskApiKey(formKey)}
                                                onChange={e => {
                                                    setFormKey(e.target.value);
                                                    detectProviderFromKey(e.target.value);
                                                }}
                                                onFocus={() => setIsKeyEditing(true)}
                                                onBlur={() => setIsKeyEditing(false)}
                                                placeholder="sk-..."
                                                autoComplete="off"
                                            />
                                            <Key className="absolute left-3 top-2.5 text-[var(--text-secondary)] pointer-events-none" size={14} />
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
                                                    const models = await keyManager.fetchRemoteModels(targetUrl, formKey, undefined, undefined, formProvider);
                                                    if (models.length > 0) {
                                                        setFormModels(models.join(', '));
                                                        // Auto-name if still default
                                                        if (formName === 'New Channel' || !formName) {
                                                            try {
                                                                const url = new URL(targetUrl);
                                                                const domain = url.hostname.split('.').slice(-2).join('.').split('.')[0];
                                                                setFormName(domain.charAt(0).toUpperCase() + domain.slice(1));
                                                            } catch (e) {
                                                            }
                                                        }
                                                        notify.success('成功获取模型', `成功获取 ${models.length} 个模型！`);
                                                    } else {
                                                        notify.warning('未发现模型', '请检查 URL 和 Key，或手动输入模型。');
                                                    }
                                                } catch (e: any) {
                                                    notify.error('连接失败', e.message || '无法连接到 API 服务');
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            disabled={loading || !formKey}
                                            className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all ${loading || !formKey
                                                ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed'
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
                                    <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-bold">
                                        基础信息 & 模型
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">通道名称</label>
                                            <input
                                                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
                                                placeholder="My Channel"
                                                value={formName}
                                                onChange={e => setFormName(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-[var(--text-secondary)] mb-1.5 block">供应商类型</label>
                                            <select
                                                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-indigo-500/50"
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
                                        <label className="text-xs text-[var(--text-secondary)] mb-1.5 flex justify-between items-center">
                                            <span>可用模型 ID (逗号分隔)</span>
                                        </label>
                                        <textarea
                                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] font-mono outline-none focus:border-indigo-500/50 min-h-[100px] leading-relaxed resize-none"
                                            placeholder="模型 ID 列表，支持格式: ID(自定义名称/描述)&#10;建议点击上方“自动获取”按钮来填充可用模型"
                                            value={formModels}
                                            onChange={e => setFormModels(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>


                            <div className="p-5 border-t border-[var(--border-light)] flex justify-end gap-3 bg-[var(--bg-secondary)]">
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
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
                )
            }
        </div >
    );
};