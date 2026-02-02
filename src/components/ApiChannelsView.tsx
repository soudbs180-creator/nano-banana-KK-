import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Plus, Trash2, Activity, Pencil, Zap,
    DollarSign, Check, Pause, Play, RefreshCw, Server,
    Globe, Shield, Box, Key, Terminal, Sparkles, Clock, Maximize2
} from 'lucide-react';
import keyManager, { KeySlot, autoDetectAndConfigureModels, parseModelString, categorizeModels } from '../services/keyManager';
import { comprehensiveConnectionTest } from "../services/connectionTest";
import { notify } from '../services/notificationService';
import { CHAT_MODEL_PRESETS } from '../services/modelPresets';


// Helper to split model strings respecting parentheses and group labels
const splitModelStrings = (input: string): string[] => {
    if (!input || !input.trim()) return [];

    // 移除emoji和分组标签(如"📸 图像:"、"🎬 视频:"等)
    const cleanInput = input
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // 移除emoji
        .replace(/(图像|视频|聊天|其他)\s*:/g, '') // 移除中文标签
        .replace(/(image|video|chat|other)\s*:/gi, ''); // 移除英文标签 (可选)

    // 使用parseModelString处理每个模型
    return cleanInput
        .split(/[,\n]/) // 按逗号或换行符分割
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => parseModelString(s).id); // 只保留ID
};

// Google默认模型列表
const DEFAULT_GOOGLE_MODELS = [
    // 图片模型
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001',
    'imagen-4.0-fast-generate-001',
    // 视频模型
    'veo-3.1-generate-preview',
    'veo-3.1-fast-generate-preview',
    // 聊天模型
    'gemini-3-pro-preview',
    'gemini-3-flash-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
];

// Preset Providers Configuration
const PRESET_PROVIDERS = [
    { label: 'Cherry Studio', url: 'https://future-api.vodeshop.com', provider: 'OpenAI', mode: 'chat', models: 'nano-banana(Nano Banana), nano-banana-pro(Nano Banana Pro), flux-schnell(Flux Fast), gemini-2.5-flash-image(Gemini 2.5 Flash)' },
    { label: 'Gemini-API.cn', url: 'https://gemini-api.cn', provider: 'OpenAI', mode: 'standard', models: 'gemini-2.5-flash-image, gemini-3-pro-image-preview, imagen-3.0-generate-001' },
    { label: 'SiliconFlow (硅基流动)', url: 'https://api.siliconflow.cn', provider: 'OpenAI', mode: 'chat', models: 'deepseek-ai/DeepSeek-V3, deepseek-ai/DeepSeek-R1, black-forest-labs/FLUX.1-schnell, stabilityai/stable-diffusion-3-medium' },
    { label: 'DeepSeek Official', url: 'https://api.deepseek.com', provider: 'OpenAI', mode: 'chat', models: 'deepseek-chat, deepseek-reasoner' },
    { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', provider: 'OpenAI', mode: 'standard', models: 'google/gemini-2.5-flash:free, google/gemini-3-flash-preview, openai/gpt-4o, anthropic/claude-3.5-sonnet' },
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
    // 分组模型state
    const [formImageModels, setFormImageModels] = useState('');
    const [formVideoModels, setFormVideoModels] = useState('');
    const [formChatModels, setFormChatModels] = useState('');
    const [formOtherModels, setFormOtherModels] = useState('');
    const [formCompatibility, setFormCompatibility] = useState<'standard' | 'chat'>('standard');
    const [expandedType, setExpandedType] = useState<'image' | 'video' | 'chat' | 'other' | null>(null);
    const [formBudgetLimit, setFormBudgetLimit] = useState<number>(-1); // -1 = unlimited
    const [isKeyEditing, setIsKeyEditing] = useState(false);

    // Auto-detect provider & settings from Key pattern
    const detectProviderFromKey = (key: string) => {
        const k = key.trim();
        if (k.startsWith('AIza')) {
            // Google
            setFormProvider('Google');
            setFormBaseUrl('https://generativelanguage.googleapis.com');
            // 设置默认Google图像模型
            setFormImageModels('gemini-2.5-flash-image, gemini-3-pro-image-preview');
            setFormVideoModels('');
            setFormChatModels('');
            setFormOtherModels('');
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
                // 对预设的模型进行分类
                const models = splitModelStrings(preset.models);
                const categorized = categorizeModels(models);
                setFormImageModels(categorized.imageModels.join(', '));
                setFormVideoModels(categorized.videoModels.join(', '));
                setFormChatModels(categorized.chatModels.join(', '));
                setFormOtherModels(categorized.otherModels?.join(', ') || '');
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
            const allSlots = keyManager.getSlots();
            // ✨ 排序逻辑:开启的排前面,暂停的排后面,各自组内按创建时间排序
            const sortedSlots = allSlots.sort((a, b) => {
                // 1. 开启的(disabled=false)排在暂停的(disabled=true)前面
                if (a.disabled !== b.disabled) {
                    return a.disabled ? 1 : -1;
                }
                // 2. 同一状态内,按创建时间升序(旧的在前)
                return a.createdAt - b.createdAt;
            });
            setSlots(sortedSlots);
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
        // 分组初始化
        setFormImageModels('gemini-2.5-flash-image, gemini-3-pro-image-preview');
        setFormVideoModels('');
        setFormChatModels('');
        setFormOtherModels('');
        setFormBudgetLimit(-1);
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
        // 对已有模型进行分类
        const models = slot.supportedModels || [];
        const categorized = categorizeModels(models);
        setFormImageModels(categorized.imageModels.join(', '));
        setFormVideoModels(categorized.videoModels.join(', '));
        setFormChatModels(categorized.chatModels.join(', '));
        setFormOtherModels(categorized.otherModels?.join(', ') || '');
        setFormBudgetLimit(slot.budgetLimit ?? -1); // Load existing budget
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
            // 合并所有分组的模型用于测试
            const allModels = [
                ...splitModelStrings(formImageModels),
                ...splitModelStrings(formVideoModels),
                ...splitModelStrings(formChatModels),
                ...splitModelStrings(formOtherModels)
            ];
            const testModel = allModels[0] || 'gpt-3.5-turbo';

            const results = await comprehensiveConnectionTest({
                apiKey: formKey,
                baseUrl: formBaseUrl || (formProvider === 'Google' ? 'https://generativelanguage.googleapis.com' : ''),
                model: testModel,
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

        // 合并所有分组的模型
        const allModels = [
            ...splitModelStrings(formImageModels),
            ...splitModelStrings(formVideoModels),
            ...splitModelStrings(formChatModels),
            ...splitModelStrings(formOtherModels)
        ];

        let finalModels = allModels;
        if (finalModels.length === 0 && (formProvider === 'Google' || !formBaseUrl)) {
            finalModels = [...DEFAULT_GOOGLE_MODELS];
        }

        const keyData = {
            name: formName.trim() || 'API Channel',
            key: formKey.trim(),
            provider: formProvider,
            baseUrl: formBaseUrl.trim(),
            compatibilityMode: formCompatibility,
            supportedModels: finalModels,
            budgetLimit: formBudgetLimit
        };

        console.log('[ApiChannelsView] 保存前的数据:', {
            finalModels,
            allModels,
            formImageModels,
            formVideoModels,
            formChatModels,
            formOtherModels,
            keyData
        });

        let result;
        if (editingId) {
            await keyManager.updateKey(editingId, keyData);
        } else {
            result = await keyManager.addKey(formKey.trim(), keyData);
        }

        console.log('[ApiChannelsView] 保存结果:', result);

        if (result && !result.success) {
            console.error('[ApiChannelsView] 保存失败:', result.error);
            alert(`保存失败: ${result.error}`);
            setLoading(false);
            return;
        }

        setLoading(false);
        setIsModalOpen(false);
    };

    const maskApiKey = (key: string) => {
        const value = key.trim();
        if (value.length <= 8) return value;
        const head = value.slice(0, 4);
        const tail = value.slice(-4);
        return `${head}...${tail} `;
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
                    <div className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-xl h-10 p-1 flex items-center">
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
                            : "flex flex-col gap-6 px-4 pb-6 pt-2 max-w-3xl mx-auto"
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
                                                <h4 className="text-base font-semibold truncate pr-2" style={{ color: 'var(--text-primary)' }} title={slot.name}>
                                                    {slot.name}
                                                </h4>
                                            </div>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${slot.provider === 'Google'
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

                                        {/* New: Status Details & Performance Metrics */}
                                        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--border-light)]/50">
                                            {/* Status Indicator */}
                                            <div className="flex items-center gap-1.5 text-xs">
                                                {refreshingIds.has(slot.id) ? (
                                                    <>
                                                        <Clock className="text-blue-400 animate-pulse" size={12} />
                                                        <span style={{ color: '#60a5fa' }}>检测中</span>
                                                    </>
                                                ) : slot.disabled ? (
                                                    <>
                                                        <Pause size={12} />
                                                        <span style={{ color: 'var(--text-tertiary)' }}>已禁用</span>
                                                    </>
                                                ) : slot.status === 'valid' ? (
                                                    <>
                                                        <Check className="text-emerald-500" size={12} />
                                                        <span style={{ color: '#10b981' }}>在线</span>
                                                    </>
                                                ) : slot.status === 'rate_limited' ? (
                                                    <>
                                                        <Clock className="text-orange-500" size={12} />
                                                        <span style={{ color: '#f59e0b' }}>限流</span>
                                                    </>
                                                ) : slot.status === 'invalid' ? (
                                                    <>
                                                        <X className="text-red-500" size={12} />
                                                        <span style={{ color: '#ef4444' }}>离线</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Activity size={12} style={{ color: 'var(--text-tertiary)' }} />
                                                        <span style={{ color: 'var(--text-tertiary)' }}>未知</span>
                                                    </>
                                                )}
                                            </div>

                                            {/* Success Rate */}
                                            {(slot.successRate !== undefined || (slot.successCount && slot.failCount !== undefined)) && (
                                                <div className="flex items-center gap-1.5 text-xs" title="成功率">
                                                    <Activity size={12} style={{ color: 'var(--text-tertiary)' }} />
                                                    <span style={{
                                                        color: (slot.successRate || (slot.successCount / (slot.successCount + slot.failCount) * 100)) >= 95
                                                            ? '#10b981'
                                                            : (slot.successRate || (slot.successCount / (slot.successCount + slot.failCount) * 100)) >= 80
                                                                ? '#f59e0b'
                                                                : '#ef4444'
                                                    }}>
                                                        {(slot.successRate ?? ((slot.successCount / Math.max(1, slot.successCount + slot.failCount)) * 100)).toFixed(1)}%
                                                    </span>
                                                </div>
                                            )}

                                            {/* Average Response Time */}
                                            {slot.avgResponseTime !== undefined && (
                                                <div className="flex items-center gap-1.5 text-xs" title="平均响应时间">
                                                    <Zap size={12} style={{ color: 'var(--text-tertiary)' }} />
                                                    <span style={{
                                                        color: slot.avgResponseTime < 1000
                                                            ? '#10b981'
                                                            : slot.avgResponseTime < 3000
                                                                ? '#f59e0b'
                                                                : '#ef4444'
                                                    }}>
                                                        {slot.avgResponseTime < 1000 ? `${slot.avgResponseTime}ms` : `${(slot.avgResponseTime / 1000).toFixed(1)}s`}
                                                    </span>
                                                </div>
                                            )}
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
                                                className={`p - 1.5 rounded - lg transition - colors ${refreshingIds.has(slot.id) ? 'animate-spin text-indigo-500' : 'hover:bg-[var(--toolbar-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'} `}
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
                                    {/* Stats (2-Column Layout: Left=Tokens+Cost stacked, Right=Budget centered) */}
                                    <div className="flex gap-3 bg-[var(--bg-tertiary)] rounded-xl p-4 border border-[var(--border-light)] mt-3">
                                        {/* Left Column: Tokens + Cost (Stacked, Vertically Centered) */}
                                        <div className="flex-1 flex flex-col gap-3 justify-center">
                                            {/* Tokens消耗 */}
                                            <div className="flex items-baseline gap-2">
                                                <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>令牌</div>
                                                <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                                                    {slot.usedTokens?.toLocaleString() || 0}
                                                </div>
                                            </div>

                                            {/* 费用消耗 */}
                                            <div className="flex items-baseline gap-2">
                                                <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>费用</div>
                                                <div className="text-xl font-bold text-emerald-400">
                                                    ${slot.totalCost.toFixed(2)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Column: Budget (Centered) */}
                                        <div className="flex-1 flex flex-col justify-center items-center gap-2 border-l border-[var(--border-light)] pl-4">
                                            <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>💰 预算</div>
                                            {(slot.budgetLimit && slot.budgetLimit > 0) ? (
                                                <>
                                                    <div className="text-2xl font-bold" style={{ color: slot.totalCost >= slot.budgetLimit ? '#ef4444' : 'var(--text-primary)' }}>
                                                        ${slot.budgetLimit.toFixed(2)}
                                                    </div>
                                                    {/* 预算进度条 */}
                                                    <div className="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full transition-all duration-300 rounded-full"
                                                            style={{
                                                                width: `${Math.min(100, (slot.totalCost / slot.budgetLimit) * 100)}%`,
                                                                backgroundColor: slot.totalCost >= slot.budgetLimit ? '#ef4444' : slot.totalCost >= slot.budgetLimit * 0.8 ? '#f59e0b' : '#3b82f6'
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                                                        {((slot.totalCost / slot.budgetLimit) * 100).toFixed(1)}% 已使用
                                                    </div>
                                                    {slot.totalCost >= slot.budgetLimit && (
                                                        <div className="text-xs font-semibold" style={{ color: '#ef4444' }}>
                                                            ⚠️ 预算已耗尽
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                                                    <span>♾️</span>
                                                    <span className="text-sm">无限制</span>
                                                </div>
                                            )}
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
                                                    className={`text - [10px] px - 3 py - 1.5 rounded border flex items - center gap - 2 transition - colors ${testStatus === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                        testStatus === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                            'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border-[var(--border-medium)] hover:text-[var(--text-secondary)]'
                                                        } `}
                                                >
                                                    {testStatus === 'testing' ? <Globe size={12} className="animate-spin" /> : <Terminal size={12} />}
                                                    {testStatus === 'testing' ? '测试中...' : '测试连接 (Test Connection)'}
                                                </button>
                                            </div>
                                            {testMessage && (
                                                <div className={`text - [10px] mt - 2 p - 2 rounded text - right ${testStatus === 'success' ? 'text-emerald-400' :
                                                    testStatus === 'error' ? 'text-red-400' : 'text-[var(--text-tertiary)]'
                                                    } `}>
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

                                    {/* Auto Detect & Fetch Button */}
                                    <div>
                                        <button
                                            onClick={async () => {
                                                if (!formKey) {
                                                    notify.warning('请先输入API Key', '需要API Key才能检测');
                                                    return;
                                                }
                                                setLoading(true);

                                                try {
                                                    // 检测是否为Google API (Key以AIza开头)
                                                    const isGoogleApi = formKey.trim().startsWith('AIza');

                                                    if (isGoogleApi) {
                                                        // Google API: 如果模型框为空,填充默认列表;否则验证
                                                        const hasModels = formImageModels || formVideoModels || formChatModels;

                                                        if (!hasModels) {
                                                            // ✨ 填充Google默认模型
                                                            setFormImageModels('gemini-2.5-flash-image, gemini-3-pro-image-preview, imagen-4.0-generate-001, imagen-4.0-ultra-generate-001, imagen-4.0-fast-generate-001');
                                                            setFormVideoModels('veo-3.1-generate-preview, veo-3.1-fast-generate-preview');
                                                            setFormChatModels('gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite');
                                                            setFormOtherModels('');

                                                            if (formName === 'New Channel' || !formName) {
                                                                setFormName('Google API');
                                                                setFormProvider('Google');
                                                            }

                                                            notify.success(
                                                                '✨ 已填充Google默认模型',
                                                                '📸 图片: 5个\n🎬 视频: 2个\n💬 聊天: 5个\n\n共12个模型'
                                                            );
                                                        } else {
                                                            // ✓ 验证已输入的模型
                                                            const allModels = [
                                                                ...formImageModels.split(',').map(m => m.trim()).filter(Boolean),
                                                                ...formVideoModels.split(',').map(m => m.trim()).filter(Boolean),
                                                                ...formChatModels.split(',').map(m => m.trim()).filter(Boolean),
                                                            ];

                                                            notify.success(
                                                                '✓ 模型格式检验通过',
                                                                `共 ${allModels.length} 个模型\n\n📸 图片: ${formImageModels.split(',').filter(Boolean).length}个\n🎬 视频: ${formVideoModels.split(',').filter(Boolean).length}个\n💬 聊天: ${formChatModels.split(',').filter(Boolean).length}个`
                                                            );
                                                        }
                                                    } else {
                                                        // 其他API: 使用原有的自动检测逻辑
                                                        const result = await autoDetectAndConfigureModels(formKey, formBaseUrl);

                                                        if (result.success && result.models.length > 0) {
                                                            const { imageModels, videoModels, chatModels, otherModels } = result.categories;

                                                            setFormImageModels(imageModels.join(', '));
                                                            setFormVideoModels(videoModels.join(', '));
                                                            setFormChatModels(chatModels.join(', '));
                                                            setFormOtherModels(otherModels ? otherModels.join(', ') : '');

                                                            if (formName === 'New Channel' || !formName) {
                                                                if (formBaseUrl) {
                                                                    try {
                                                                        const url = new URL(formBaseUrl);
                                                                        const domain = url.hostname.split('.').slice(-2).join('.').split('.')[0];
                                                                        setFormName(domain.charAt(0).toUpperCase() + domain.slice(1));
                                                                    } catch (e) {
                                                                        setFormName('API Channel');
                                                                    }
                                                                }
                                                            }

                                                            notify.success(
                                                                '✨ 自动检测成功',
                                                                `检测到 ${result.models.length} 个模型\n\n📸 图像: ${imageModels.length}个\n🎬 视频: ${videoModels.length}个\n💬 聊天: ${chatModels.length}个${otherModels && otherModels.length > 0 ? `\n🔧 其他: ${otherModels.length}个` : ''}`
                                                            );
                                                        } else {
                                                            notify.warning('未检测到模型', '请检查API Key或手动输入模型');
                                                        }
                                                    }
                                                } catch (e: any) {
                                                    console.error('[ApiChannelsView] Model check error:', e);
                                                    notify.error('检测失败', e.message || '操作失败');
                                                } finally {
                                                    setLoading(false);
                                                }
                                            }}
                                            disabled={loading || !formKey}
                                            className={`w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all ${loading || !formKey
                                                ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed'
                                                : 'bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-400 hover:from-indigo-500/20 hover:to-purple-500/20 hover:text-indigo-300 border border-indigo-500/20'
                                                }`}
                                        >
                                            {loading ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                                            {loading ? '正在检测...' : '检验/填充模型'}
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
                                                    if (nextProvider === 'Google' && !formImageModels && !formChatModels) {
                                                        // Set defaults
                                                        setFormImageModels('gemini-2.5-flash-image, gemini-3-pro-image-preview');
                                                        setFormVideoModels('veo-3.1-generate-preview');
                                                        setFormChatModels('gemini-2.5-flash');
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
                                    {/* Models - Grouped Cards */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs text-[var(--text-secondary)]">可用模型列表 (按类型分组)</label>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            {/* Image Models */}
                                            <div
                                                onClick={() => setExpandedType('image')}
                                                className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg p-3 flex flex-col gap-2 relative group cursor-pointer hover:border-indigo-500/50 transition-all"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                                                        <span>📸</span>
                                                        <span>图像模型 (Image)</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setFormImageModels(''); }}
                                                        className="text-red-400 hover:text-red-300 p-1 opacity-60 group-hover:opacity-100 transition-all rounded"
                                                        title="清空图像模型"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                                <textarea
                                                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded p-2 text-xs font-mono outline-none focus:border-indigo-500/50 min-h-[60px] resize-none"
                                                    placeholder="gemini-2.5-flash-image..."
                                                    value={formImageModels}
                                                    onChange={e => setFormImageModels(e.target.value)}
                                                />
                                            </div>

                                            {/* Video Models */}
                                            <div
                                                onClick={(e) => { e.stopPropagation(); setExpandedType('video'); }}
                                                className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg p-3 flex flex-col gap-2 relative group cursor-pointer hover:border-indigo-500/30 transition-all">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                                                        <span>🎬</span>
                                                        <span>视频模型 (Video)</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setFormVideoModels(''); }}
                                                        className="text-red-400 hover:text-red-300 p-1 opacity-60 group-hover:opacity-100 transition-all rounded"
                                                        title="清空视频模型"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                                <textarea
                                                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded p-2 text-xs font-mono outline-none focus:border-indigo-500/50 min-h-[60px] resize-none"
                                                    placeholder="veo-3.1-generate-preview..."
                                                    value={formVideoModels}
                                                    onChange={e => setFormVideoModels(e.target.value)}
                                                />
                                            </div>

                                            <div
                                                onClick={(e) => { e.stopPropagation(); setExpandedType('chat'); }}
                                                className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg p-3 flex flex-col gap-2 relative group cursor-pointer hover:border-indigo-500/30 transition-all">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                                                        <span>💬</span>
                                                        <span>聊天/推理 (Chat)</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setFormChatModels(''); }}
                                                        className="text-red-400 hover:text-red-300 p-1 opacity-60 group-hover:opacity-100 transition-all rounded"
                                                        title="清空聊天模型"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                                <textarea
                                                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded p-2 text-xs font-mono outline-none focus:border-indigo-500/50 min-h-[60px] resize-none"
                                                    placeholder="gemini-2.5-flash..."
                                                    value={formChatModels}
                                                    onChange={e => setFormChatModels(e.target.value)}
                                                />
                                            </div>

                                            {/* Other Models */}
                                            <div
                                                onClick={(e) => { e.stopPropagation(); setExpandedType('other'); }}
                                                className="bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg p-3 flex flex-col gap-2 relative group cursor-pointer hover:border-indigo-500/30 transition-all">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                                                        <span>🔧</span>
                                                        <span>其他/多模态 (Other)</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setFormOtherModels(''); }}
                                                        className="text-red-400 hover:text-red-300 p-1 opacity-60 group-hover:opacity-100 transition-all rounded"
                                                        title="清空其他模型"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                                <textarea
                                                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded p-2 text-xs font-mono outline-none focus:border-indigo-500/50 min-h-[60px] resize-none"
                                                    placeholder="其他模型 ID..."
                                                    value={formOtherModels}
                                                    onChange={e => setFormOtherModels(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-[var(--text-tertiary)]">
                                            💡 提示: 点击上方“智能检测模型”会自动填充到对应分类
                                        </p>
                                    </div>

                                    {/* Budget Limit */}
                                    <div>
                                        <label className="text-xs text-[var(--text-secondary)] mb-1.5 flex justify-between items-center">
                                            <span>💰 预算限制 (Budget Limit)</span>
                                            <span className="text-[10px] text-[var(--text-tertiary)]">
                                                {formBudgetLimit < 0 ? '♾️ 无限制' : `$${formBudgetLimit.toFixed(2)}`}
                                            </span>
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <DollarSign size={14} className="text-[var(--text-secondary)]" />
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="-1"
                                                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] font-mono outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                                                placeholder="-1"
                                                value={formBudgetLimit}
                                                onChange={e => setFormBudgetLimit(parseFloat(e.target.value) || -1)}
                                            />
                                            <span className="text-xs text-[var(--text-tertiary)]">USD</span>
                                        </div>
                                        <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5 flex items-start gap-1">
                                            <span>💡</span>
                                            <span>-1 = 无限制 | &gt;0 = 达到预算后自动停用此通道</span>
                                        </p>
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

            {/* Expanded Edit Modal */}
            {expandedType && createPortal(
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[var(--bg-secondary)] w-full max-w-2xl rounded-xl shadow-2xl border border-[var(--border-light)] flex flex-col max-h-[80vh] m-4 animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-[var(--border-light)] flex items-center justify-between">
                            <h3 className="font-bold flex items-center gap-2">
                                {expandedType === 'image' && '📸 编辑图像模型'}
                                {expandedType === 'video' && '🎬 编辑视频模型'}
                                {expandedType === 'chat' && '💬 编辑聊天模型'}
                                {expandedType === 'other' && '🔧 编辑其他模型'}
                            </h3>
                            <button onClick={() => setExpandedType(null)} className="p-1 hover:bg-[var(--bg-tertiary)] rounded-full transition-colors">
                                <X size={20} className="text-[var(--text-secondary)]" />
                            </button>
                        </div>
                        <div className="flex-1 p-4 flex flex-col min-h-0">
                            <p className="text-xs text-[var(--text-tertiary)] mb-2">每行一个ID，或用逗号分隔。支持 "ID (别名)" 格式。</p>
                            <textarea
                                className="flex-1 w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-lg p-3 text-sm font-mono outline-none focus:border-indigo-500/50 resize-none leading-relaxed"
                                value={
                                    expandedType === 'image' ? formImageModels :
                                        expandedType === 'video' ? formVideoModels :
                                            expandedType === 'chat' ? formChatModels :
                                                formOtherModels
                                }
                                onChange={e => {
                                    const val = e.target.value;
                                    if (expandedType === 'image') setFormImageModels(val);
                                    else if (expandedType === 'video') setFormVideoModels(val);
                                    else if (expandedType === 'chat') setFormChatModels(val);
                                    else setFormOtherModels(val);
                                }}
                                autoFocus
                            />
                        </div>
                        <div className="p-4 border-t border-[var(--border-light)] flex justify-end">
                            <button
                                onClick={() => setExpandedType(null)}
                                className="px-6 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                            >
                                完成 (Done)
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};