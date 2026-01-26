import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Key, Plus, Trash2, Globe, RefreshCw, Copy, Check,
    Pause, Play, Activity, Pencil, List, AlertTriangle, ChevronRight, Zap, DollarSign, GripVertical, Image, Video, MessageCircle, ListFilter
} from 'lucide-react';
import { modelRegistry, ActiveModel } from '../services/modelRegistry';
import { MODEL_PRESETS } from '../services/modelPresets';
import { KeySlot, keyManager } from '../services/keyManager';
import { ProxyModelConfig, PROXY_MODEL_PRESETS, createEmptyProxyModel, validateProxyModel } from '../services/proxyModelConfig';
import { GOOGLE_MODEL_CAPABILITIES } from '../services/modelCapabilities';
import { AspectRatio, ImageSize } from '../types';

export const ApiChannelsView = () => {
    const [slots, setSlots] = useState<KeySlot[]>(keyManager.getSlots());
    const [activeStrategy, setActiveStrategy] = useState<'concurrent' | 'sequential'>(keyManager.getStrategyMode());
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ id: string, position: 'before' | 'after' | 'column', strategy: 'load_balance' | 'sequential' } | null>(null);
    const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);

    // Model Management State
    const [activeModels, setActiveModels] = useState<ActiveModel[]>([]);
    const [modelForm, setModelForm] = useState({ input: '', showSuggestions: false });

    useEffect(() => {
        setActiveModels(modelRegistry.getModels());
        return modelRegistry.subscribe(() => setActiveModels(modelRegistry.getModels()));
    }, []);

    const handleAddModel = (id: string) => {
        if (!id.trim()) return;
        const preset = MODEL_PRESETS.find(p => p.id === id);
        if (preset) {
            modelRegistry.addModel({ ...preset, enabled: true });
        } else {
            modelRegistry.addModel({
                id: id.trim(),
                label: id.trim(),
                provider: 'Custom',
                type: 'image',
                enabled: true,
                custom: true
            });
        }
        setModelForm({ input: '', showSuggestions: false });
    };

    const handleRemoveModel = (id: string) => modelRegistry.removeModel(id);
    const toggleModel = (id: string) => {
        const model = activeModels.find(m => m.id === id);
        if (model) modelRegistry.updateModel(id, { enabled: !model.enabled });
    };

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Form State
    const [formKey, setFormKey] = useState('');
    const [formName, setFormName] = useState('');
    const [formProvider, setFormProvider] = useState('Gemini');
    const [formBudget, setFormBudget] = useState('');
    const [formUsedCost, setFormUsedCost] = useState('');
    const [formUseProxy, setFormUseProxy] = useState(false);
    const [formBaseUrl, setFormBaseUrl] = useState('');
    const [isKeyEditing, setIsKeyEditing] = useState(false);

    useEffect(() => {
        const update = () => {
            setSlots([...keyManager.getSlots()]);
            setActiveStrategy(keyManager.getStrategyMode());
        };
        const unsub = keyManager.subscribe(update);
        return unsub;
    }, []);

    // Proxy Model Configuration State
    const [showProxyModelModal, setShowProxyModelModal] = useState(false);
    const [editingProxyKeyId, setEditingProxyKeyId] = useState<string | null>(null);
    const [editingModelId, setEditingModelId] = useState<string | null>(null);
    const [newProxyModel, setNewProxyModel] = useState<ProxyModelConfig>(() => createEmptyProxyModel('image'));
    const [proxyModelError, setProxyModelError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const getProxySlot = (id: string | null) => slots.find(slot => slot.id === id) || null;

    const detectProvider = (modelId: string) => {
        const id = modelId.toLowerCase();
        if (id.includes('gemini') || id.includes('imagen') || id.includes('veo') || id.includes('nano-banana')) return 'Google';
        if (id.includes('dall-e') || id.includes('gpt-image') || id.includes('sora')) return 'OpenAI';
        if (id.includes('gpt-') || id === 'gpt' || id.includes('o1') || id.includes('o3')) return 'OpenAI';
        if (id.includes('midjourney') || id.includes('mj-')) return 'Midjourney';
        if (id.includes('flux')) return 'Black Forest Labs';
        if (id.includes('ideogram')) return 'Ideogram';
        if (id.includes('recraft')) return 'Recraft';
        if (id.includes('kling')) return 'Kuaishou';
        if (id.includes('runway') || id.includes('gen-3')) return 'Runway';
        if (id.includes('luma')) return 'Luma';
        if (id.includes('pika')) return 'Pika';
        if (id.includes('deepseek')) return 'DeepSeek';
        if (id.includes('claude')) return 'Anthropic';
        if (id.includes('qwen')) return 'Qwen';
        if (id.includes('glm')) return 'Zhipu';
        if (id.includes('llama') || id.includes('mixtral') || id.includes('mistral')) return 'Mistral';
        return '';
    };

    const detectType = (modelId: string, fallback: ProxyModelConfig['type']) => {
        const id = modelId.toLowerCase();
        if (id.includes('video') || id.includes('veo') || id.includes('kling') || id.includes('runway') || id.includes('luma') || id.includes('sora') || id.includes('pika') || id.includes('gen-3')) return 'video';
        if (id.includes('image') || id.includes('dall-e') || id.includes('flux') || id.includes('midjourney') || id.includes('ideogram') || id.includes('recraft') || id.includes('sd') || id.includes('stable') || id.includes('pixart')) return 'image';
        if (id.includes('chat') || id.includes('gpt') || id.includes('claude') || id.includes('gemini') || id.includes('deepseek') || id.includes('qwen') || id.includes('llama') || id.includes('mixtral') || id.includes('mistral')) return 'chat';
        return fallback || 'chat';
    };

    const detectVideoCapabilities = (modelId: string) => {
        const id = modelId.toLowerCase();
        const supportsDuration = true;
        const supportsFirstFrame = !(id.includes('veo') || id.includes('sora'));
        const supportsLastFrame = id.includes('kling');
        const supportsFps = id.includes('kling') || id.includes('runway');
        return { supportsDuration, supportsFirstFrame, supportsLastFrame, supportsFps };
    };

    const detectApiFormat = (modelId: string, slot: KeySlot | null, type: ProxyModelConfig['type'], fallback: ProxyModelConfig['apiFormat']) => {
        const baseUrl = slot?.baseUrl || '';
        const isGoogleBase = baseUrl.includes('googleapis.com');
        const isProxyBase = !!baseUrl && !isGoogleBase;
        const id = modelId.toLowerCase();
        const isGoogleFamily = id.includes('gemini') || id.includes('imagen') || id.includes('veo') || id.includes('nano-banana');
        if (isProxyBase) return 'openai';
        if (isGoogleBase) return 'gemini';
        if (isGoogleFamily && type !== 'chat') return 'gemini';
        if (!fallback) return 'openai';
        return fallback;
    };

    const hydrateProxyModel = (model: ProxyModelConfig, slot: KeySlot | null): ProxyModelConfig => {
        const trimmedId = model.id.trim();
        if (!trimmedId) return model;
        const preset = PROXY_MODEL_PRESETS.find(p => p.id === trimmedId);
        if (preset) {
            return {
                ...model,
                ...preset,
                id: trimmedId,
                label: model.label?.trim() || preset.label || trimmedId
            };
        }

        const caps = GOOGLE_MODEL_CAPABILITIES[trimmedId];
        const type = detectType(trimmedId, model.type);
        const label = model.label?.trim() || trimmedId;
        const provider = model.provider?.trim() || detectProvider(trimmedId);
        const apiFormat = detectApiFormat(trimmedId, slot, type, model.apiFormat);

        const supportedAspectRatios = type === 'chat'
            ? []
            : caps?.supportedRatios || Object.values(AspectRatio);
        const supportedSizes = type === 'chat'
            ? []
            : caps?.supportedSizes || Object.values(ImageSize);
        const supportsGrounding = caps?.supportsGrounding || false;
        const videoCapabilities = type === 'video' ? detectVideoCapabilities(trimmedId) : undefined;

        return {
            ...model,
            id: trimmedId,
            label,
            provider,
            type,
            apiFormat,
            supportedAspectRatios,
            supportedSizes,
            supportsGrounding,
            videoCapabilities
        };
    };

    // Calculate totals
    const totalBudget = slots.reduce((sum, s) => sum + (s.budgetLimit > 0 ? s.budgetLimit : 0), 0);
    const totalConsumed = slots.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const totalTokens = slots.reduce((sum, s) => sum + (s.usedTokens || 0), 0);
    const remainingBudget = totalBudget - totalConsumed;

    const openAddModal = () => {
        setEditingId(null);
        setFormKey('');
        setFormName('Google API');
        setFormProvider('Gemini');
        setFormBudget('');
        setFormUsedCost('');
        setFormUseProxy(false);
        setFormBaseUrl('');
        setIsKeyEditing(true);
        setIsModalOpen(true);
    };

    const openEditModal = (slot: KeySlot) => {
        setEditingId(slot.id);
        setFormKey(slot.key);
        setFormName(slot.name);
        setFormProvider(slot.provider);
        setFormBudget(slot.budgetLimit > 0 ? slot.budgetLimit.toString() : '');
        setFormUsedCost(slot.totalCost.toString());
        const isProxy = !!slot.baseUrl && !slot.baseUrl.includes('googleapis.com');
        setFormUseProxy(isProxy);
        setFormBaseUrl(slot.baseUrl || '');
        setIsKeyEditing(false);
        setIsModalOpen(true);
    };

    const maskApiKey = (key: string) => {
        const value = key.trim();
        if (value.length <= 8) return value;
        const head = value.slice(0, 4);
        const tail = value.slice(-4);
        return `${head}...${tail}`;
    };

    const cleanBaseUrl = (url: string) => {
        if (!url) return '';
        let cleaned = url.trim();
        if (cleaned.endsWith('/')) cleaned = cleaned.slice(0, -1);
        if (cleaned.endsWith('/v1')) cleaned = cleaned.replace(/\/v1$/, '');
        if (cleaned.endsWith('/v1beta')) cleaned = cleaned.replace(/\/v1beta$/, '');
        if (cleaned.endsWith('/')) cleaned = cleaned.slice(0, -1);
        return cleaned;
    };

    const handleSubmit = async () => {
        setLoading(true);
        const rawProxyUrl = formUseProxy ? formBaseUrl : '';
        const proxyBaseUrl = cleanBaseUrl(rawProxyUrl);

        if (editingId) {
            keyManager.updateKey(editingId, {
                name: formName.trim() || 'API Key',
                key: formKey.trim(),
                budgetLimit: formBudget ? parseFloat(formBudget) : -1,
                totalCost: formUsedCost ? parseFloat(formUsedCost) : 0,
                baseUrl: proxyBaseUrl,
                authMethod: formUseProxy ? 'header' : 'query',
                headerName: 'x-goog-api-key'
            });
        } else {
            if (!formKey.trim()) {
                setLoading(false);
                return;
            }
            await keyManager.addKey(formKey.trim(), {
                name: formName.trim() || (() => {
                    if (!formUseProxy) return 'Google Official';
                    if (formProvider !== 'Other') return formProvider === 'Gemini' ? 'Google Gemini' : formProvider;
                    try { return new URL(proxyBaseUrl).hostname; } catch { return 'Custom Proxy'; }
                })(),
                provider: formProvider,
                budgetLimit: formBudget ? parseFloat(formBudget) : -1,
                totalCost: formUsedCost ? parseFloat(formUsedCost) : 0,
                baseUrl: proxyBaseUrl,
                authMethod: formUseProxy ? 'header' : 'query',
                headerName: 'x-goog-api-key',
                strategy: 'sequential',
                priority: -1
            });
        }
        setIsModalOpen(false);
        setLoading(false);
    };

    // Proxy Model Handlers
    const openProxyModelModal = (keyId: string) => {
        setEditingProxyKeyId(keyId);
        setEditingModelId(null); // Reset edit mode
        setNewProxyModel(createEmptyProxyModel('image'));
        setProxyModelError(null);
        setShowProxyModelModal(true);
    };

    const handleEditProxyModel = (keyId: string, model: ProxyModelConfig) => {
        setEditingProxyKeyId(keyId);
        setEditingModelId(model.id); // Set edit mode
        setNewProxyModel({ ...model }); // Load data
        setProxyModelError(null);
        setShowProxyModelModal(true);
    };

    const handleAddProxyModel = () => {
        const slot = getProxySlot(editingProxyKeyId);
        const hydratedModel = hydrateProxyModel(newProxyModel, slot);
        setNewProxyModel(hydratedModel);
        const error = validateProxyModel(hydratedModel);
        if (error) {
            setProxyModelError(error);
            return;
        }
        if (editingProxyKeyId) {
            if (editingModelId) {
                keyManager.updateProxyModel(editingProxyKeyId, editingModelId, hydratedModel);
            } else {
                keyManager.addProxyModel(editingProxyKeyId, hydratedModel);
            }
            setShowProxyModelModal(false);
            setNewProxyModel(createEmptyProxyModel('image'));
            setEditingModelId(null);
        }
    };

    const handleRemoveProxyModel = (keyId: string, modelId: string) => {
        keyManager.removeProxyModel(keyId, modelId);
    };

    const handleAddPresetModel = (keyId: string, preset: ProxyModelConfig) => {
        keyManager.addProxyModel(keyId, preset);
    };

    const handleDelete = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (confirm('确定要删除此 API 密钥吗?')) {
            keyManager.removeKey(id);
        }
    };

    const handleCopy = (key: string, id: string) => {
        navigator.clipboard.writeText(key);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleRefreshKey = async (id: string) => {
        setRefreshingIds(prev => new Set(prev).add(id));
        await keyManager.refreshKey(id);
        setRefreshingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const handleAutoSort = () => {
        keyManager.autoSortSequentialKeys();
    };

    const handleStrategyToggle = (mode: 'concurrent' | 'sequential') => {
        keyManager.setStrategyMode(mode);
    };

    // Columns Logic
    const concurrentSlots = slots.filter(s => s.strategy === 'load_balance');
    const sequentialSlots = slots.filter(s => (s.strategy || 'sequential') === 'sequential')
        .sort((a, b) => (a.priority || 0) - (b.priority || 0));

    const handleDragStart = (e: React.DragEvent, id: string) => {
        // Set data first
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';

        // Delay the state update to next tick
        // This prevents React from re-rendering the element IN the same frame as drag start,
        // which often cancels the native drag operation in many browsers.
        setTimeout(() => {
            setDraggingId(id);
        }, 0);
    };

    const handleDragOver = (e: React.DragEvent, strategy: 'load_balance' | 'sequential', id?: string, position?: 'before' | 'after') => {
        e.preventDefault();
        e.stopPropagation();

        // Use a simpler check to avoid constant state updates if target hasn't changed
        if (dropTarget?.id === id && dropTarget?.position === position && dropTarget?.strategy === strategy) {
            return;
        }

        if (id && position) {
            setDropTarget({ id, position, strategy });
        } else {
            setDropTarget({ id: '', position: 'column', strategy });
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
            setDropTarget(null);
        }
    };

    const handleDropAction = (e: React.DragEvent, targetStrategy: 'load_balance' | 'sequential', targetIndex?: number) => {
        e.preventDefault();
        e.stopPropagation();
        setDropTarget(null);
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;

        const slot = slots.find(s => s.id === id);
        if (!slot) return;

        if (targetStrategy === 'load_balance') {
            keyManager.updateKey(id, { strategy: 'load_balance' });
        } else {
            const otherSlots = slots
                .filter(s => s.id !== id && (s.strategy || 'sequential') === 'sequential')
                .sort((a, b) => (a.priority || 0) - (b.priority || 0));

            if (targetIndex !== undefined) {
                otherSlots.splice(targetIndex, 0, slot);
            } else if (dropTarget?.id) {
                // Determine actual target index based on dropTarget
                const targetIdx = otherSlots.findIndex(s => s.id === dropTarget.id);
                if (targetIdx !== -1) {
                    otherSlots.splice(dropTarget.position === 'before' ? targetIdx : targetIdx + 1, 0, slot);
                } else {
                    otherSlots.push(slot);
                }
            } else {
                otherSlots.push(slot);
            }

            otherSlots.forEach((s, i) => {
                keyManager.updateKey(s.id, { strategy: 'sequential', priority: i });
            });
        }
        setDraggingId(null);
    };

    // Improved API Card with vertical stacked layout to prevent overlap
    const ApiCard = ({ slot, index, showPriority }: { slot: KeySlot, index?: number, showPriority?: boolean }) => {
        const isRefreshing = refreshingIds.has(slot.id);
        const budgetPercent = slot.budgetLimit > 0 ? Math.min(100, (slot.totalCost / slot.budgetLimit) * 100) : 0;
        const remaining = slot.budgetLimit > 0 ? Math.max(0, slot.budgetLimit - slot.totalCost) : -1;
        const isOverBudget = slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit;

        const isDropTargetBefore = dropTarget?.id === slot.id && dropTarget?.position === 'before';
        const isDropTargetAfter = dropTarget?.id === slot.id && dropTarget?.position === 'after';

        return (
            <div className="relative">
                {/* Drag Feedback Insertion Line (Before) */}
                {isDropTargetBefore && (
                    <div className="absolute -top-1.5 left-0 right-0 h-1 bg-indigo-500 rounded-full z-10 animate-pulse" />
                )}

                <div
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, slot.id)}
                    onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                    onDragOver={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const mid = rect.top + rect.height / 2;
                        const strategy = slot.strategy || 'sequential';
                        handleDragOver(e, strategy, slot.id, e.clientY < mid ? 'before' : 'after');
                    }}
                    className={`group bg-[#1c1c1e] rounded-xl border select-none relative overflow-hidden flex flex-col
                        ${draggingId === slot.id ? 'opacity-40 border-indigo-500/50' : 'border-zinc-800/50 hover:border-zinc-600 transition-colors'}
                    `}
                >
                    {/* Progress bar at bottom */}
                    {slot.budgetLimit > 0 && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-800/50 z-10">
                            <div
                                className={`h-full transition-all ${isOverBudget ? 'bg-red-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${budgetPercent}%` }}
                            />
                        </div>
                    )}

                    <div className="p-3">
                        {/* Header: Grip + Name & Actions */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="p-0.5 cursor-move text-zinc-600 hover:text-zinc-400 shrink-0">
                                    <GripVertical size={14} />
                                </div>
                                <div className={`shrink-0 w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]
                                    ${slot.disabled ? 'bg-zinc-600 text-zinc-600' :
                                        slot.status === 'valid' ? 'bg-emerald-500 text-emerald-500' :
                                            slot.status === 'invalid' ? 'bg-red-500 text-red-500' :
                                                slot.status === 'rate_limited' ? 'bg-amber-500 text-amber-500' : 'bg-zinc-600 text-zinc-600'}
                                `} />
                                <div className={`truncate font-bold text-sm flex-1 ${slot.disabled ? 'text-zinc-500' : 'text-white'}`}>{slot.name}</div>
                                {showPriority && index !== undefined && (
                                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono shrink-0">
                                        #{index + 1}
                                    </span>
                                )}
                            </div>

                            {/* Actions Overlay (visible on hover) */}
                            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => { e.stopPropagation(); keyManager.toggleKey(slot.id); }}
                                    className={`p-1.5 rounded-lg transition-colors ${slot.disabled ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-zinc-500 hover:text-amber-400 hover:bg-white/10'}`}
                                    title={slot.disabled ? '启用' : '暂停'}
                                >
                                    {slot.disabled ? <Play size={13} /> : <Pause size={13} />}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRefreshKey(slot.id); }}
                                    disabled={isRefreshing}
                                    className={`p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors ${isRefreshing ? 'animate-spin text-indigo-500' : ''}`}
                                    title="刷新"
                                >
                                    <RefreshCw size={13} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); openEditModal(slot); }}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-400 hover:bg-white/10 transition-colors"
                                    title="编辑"
                                >
                                    <Pencil size={13} />
                                </button>
                                <button
                                    onClick={(e) => handleDelete(slot.id, e)}
                                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-white/10 transition-colors"
                                    title="删除"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 gap-px bg-zinc-800/30 rounded-lg overflow-hidden border border-zinc-800/30">
                            {/* Budget */}
                            <div className="bg-[#1c1c1e]/50 p-2 text-center">
                                <div className="text-[10px] text-zinc-500 mb-0.5">预算</div>
                                <div className="text-xs font-mono font-bold text-white truncate">
                                    {slot.budgetLimit > 0 ? `$${slot.budgetLimit}` : '∞'}
                                </div>
                            </div>
                            {/* Used */}
                            <div className="bg-[#1c1c1e]/50 p-2 text-center relative">
                                <div className="text-[10px] text-zinc-500 mb-0.5">已用</div>
                                <div className={`text-xs font-mono font-bold truncate ${isOverBudget ? 'text-red-400' : 'text-amber-400'}`}>
                                    ${slot.totalCost.toFixed(3)}
                                </div>
                                {/* Vertical Dividers */}
                                <div className="absolute left-0 top-2 bottom-2 w-px bg-zinc-800/50"></div>
                                <div className="absolute right-0 top-2 bottom-2 w-px bg-zinc-800/50"></div>
                            </div>
                            {/* Remaining */}
                            <div className="bg-[#1c1c1e]/50 p-2 text-center">
                                <div className="text-[10px] text-zinc-500 mb-0.5">剩余</div>
                                <div className={`text-xs font-mono font-bold truncate ${remaining < 1 && remaining >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {remaining >= 0 ? `$${remaining.toFixed(2)}` : '∞'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Drag Feedback Insertion Line (After) */}
                {isDropTargetAfter && (
                    <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-indigo-500 rounded-full z-10 animate-pulse" />
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header Area */}
            <div className="flex flex-col gap-4 px-1 py-2 shrink-0">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-2xl font-bold text-white">API 调度策略</h3>
                        <p className="text-xs text-zinc-500 mt-1">拖动卡片调整优先级与并发策略</p>
                    </div>

                </div>

                {/* Strategy Toggle */}
                <div className="flex justify-end px-1">
                    <div className="bg-black/40 p-1 rounded-lg flex items-center gap-1 border border-zinc-800">
                        <button
                            onClick={() => handleStrategyToggle('concurrent')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5
                                ${activeStrategy === 'concurrent' ? 'bg-indigo-500 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}
                            `}
                        >
                            <Activity size={12} />
                            并发优先
                        </button>
                        <button
                            onClick={() => handleStrategyToggle('sequential')}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5
                                ${activeStrategy === 'sequential' ? 'bg-emerald-500 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}
                            `}
                        >
                            <List size={12} />
                            顺序优先
                        </button>
                    </div>
                </div>

                {/* Main Stats Bar - Centered Content */}
                <div className="flex items-center justify-between bg-zinc-900/40 rounded-2xl p-1 border border-zinc-800/50">
                    <div className="flex items-center gap-2 px-4 py-2">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                <DollarSign size={14} className="text-emerald-500" />
                            </div>
                            <div>
                                <div className="text-[10px] text-zinc-500">总预算</div>
                                <div className="text-sm font-mono font-bold text-white">${totalBudget > 0 ? totalBudget.toFixed(2) : '∞'}</div>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-zinc-800 mx-2" />
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                                <Activity size={14} className="text-amber-500" />
                            </div>
                            <div>
                                <div className="text-[10px] text-zinc-500">已消耗</div>
                                <div className="text-sm font-mono font-bold text-amber-400">${totalConsumed.toFixed(4)}</div>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-zinc-800 mx-2" />
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                <Zap size={14} className="text-indigo-500" />
                            </div>
                            <div>
                                <div className="text-[10px] text-zinc-500">Token</div>
                                <div className="text-sm font-mono font-bold text-indigo-400">{(totalTokens / 1000).toFixed(1)}k</div>
                            </div>
                        </div>
                        {totalBudget > 0 && (
                            <>
                                <div className="w-px h-8 bg-zinc-800 mx-2" />
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${remainingBudget < 1 ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                                        <Check size={14} className={remainingBudget < 1 ? 'text-red-500' : 'text-emerald-500'} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-zinc-500">剩余</div>
                                        <div className={`text-sm font-mono font-bold ${remainingBudget < 1 ? 'text-red-400' : 'text-emerald-400'}`}>
                                            ${remainingBudget.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all mr-1"
                    >
                        <Plus size={14} />
                        <span>添加密钥</span>
                    </button>
                </div>
            </div>

            {/* Horizontal Split View - 移动端需要更多底部内边距以避免被导航栏遮挡 */}
            <div className="flex flex-row gap-4 flex-1 min-h-0 pb-24 md:pb-4 overflow-hidden mt-2">
                {/* Left: Load Balance */}
                <div
                    className={`flex-1 bg-zinc-900/30 rounded-2xl border transition-all flex flex-col overflow-hidden min-w-0
                        ${dropTarget?.strategy === 'load_balance' ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-zinc-800/50'}
                    `}
                    onDragOver={e => handleDragOver(e, 'load_balance')}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDropAction(e, 'load_balance')}
                >
                    <div className="p-4 bg-gradient-to-r from-indigo-500/5 to-transparent border-b border-zinc-800 flex items-center justify-between shrink-0">
                        <div>
                            <div className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                                <Activity size={14} />
                                多路并发
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-0.5">无限预算优先 · 自动调配 · 10s重试</div>
                        </div>
                        <div className="text-lg font-mono font-bold text-zinc-600">{concurrentSlots.length}</div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                        {concurrentSlots.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-3 border-2 border-dashed border-zinc-800 rounded-xl min-h-[150px]">
                                <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                                    <Activity size={20} className="opacity-30" />
                                </div>
                                <span className="text-xs text-center px-4">拖拽密钥至此开启并发模式</span>
                            </div>
                        ) : (
                            concurrentSlots.map((slot) => (
                                <ApiCard key={slot.id} slot={slot} />
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Sequential */}
                <div
                    className={`flex-1 bg-zinc-900/30 rounded-2xl border transition-all flex flex-col overflow-hidden min-w-0
                        ${dropTarget?.strategy === 'sequential' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800/50'}
                    `}
                    onDragOver={e => handleDragOver(e, 'sequential')}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDropAction(e, 'sequential')}
                >
                    <div className="p-4 bg-gradient-to-r from-emerald-500/5 to-transparent border-b border-zinc-800 flex items-center justify-between shrink-0">
                        <div>
                            <div className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                                <List size={14} />
                                顺序优先消耗
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-0.5">按顺序使用 · 耗尽切换</div>
                        </div>
                        <div className="text-lg font-mono font-bold text-zinc-600">{sequentialSlots.length}</div>
                    </div>
                    {/* Auto Sort Header Action */}
                    <div className="px-3 py-2 bg-zinc-900/50 border-b border-zinc-800 flex justify-end">
                        <button
                            onClick={handleAutoSort}
                            className="text-[10px] flex items-center gap-1 text-zinc-500 hover:text-emerald-400 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                            title="自动排序: 启用 > 预算 > Google > 其他"
                        >
                            <ListFilter size={12} />
                            按规则整理
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar relative">
                        {sequentialSlots.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-3 border-2 border-dashed border-zinc-800 rounded-xl min-h-[150px]">
                                <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                                    <List size={20} className="opacity-30" />
                                </div>
                                <span className="text-xs text-center px-4">暂无备用密钥</span>
                            </div>
                        ) : (
                            sequentialSlots.map((slot, i) => (
                                <div key={slot.id} className="relative">
                                    <ApiCard slot={slot} index={i} showPriority />
                                </div>
                            ))
                        )}
                        <div
                            className="h-12 w-full shrink-0"
                            onDragOver={e => handleDragOver(e, 'sequential')}
                            onDrop={e => handleDropAction(e, 'sequential')}
                        />
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[10050] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#161618] w-full max-w-md rounded-2xl border border-zinc-700 shadow-2xl animate-in zoom-in-95 duration-200 text-left flex flex-col max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-5 border-b border-zinc-800 shrink-0">
                            <h4 className="text-lg font-bold text-white">{editingId ? '编辑密钥' : '添加密钥'}</h4>
                            <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white transition-colors"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 block">备注名称</label>
                                <input className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                    value={formName} onChange={e => setFormName(e.target.value)} autoFocus />
                            </div>
                            {!editingId && (
                                <div>
                                    <label className="text-xs text-zinc-400 mb-1.5 block">平台供应商</label>
                                    <select className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                        value={formProvider} onChange={e => setFormProvider(e.target.value)}>
                                        <option value="Gemini">Google Gemini</option>
                                        <option value="Other">其他平台</option>
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 flex justify-between items-center">
                                    <span>API Key</span>
                                </label>
                                <div className="relative">
                                    <input
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                                        type="text"
                                        value={isKeyEditing ? formKey : maskApiKey(formKey)}
                                        onChange={e => setFormKey(e.target.value)}
                                        onFocus={(e) => {
                                            setIsKeyEditing(true);
                                            requestAnimationFrame(() => e.currentTarget.select());
                                        }}
                                        onBlur={() => setIsKeyEditing(false)}
                                        placeholder="sk-..."
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 block">预算限制 (美元)</label>
                                <input className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                    type="number" min="0" step="0.01" value={formBudget} onChange={e => setFormBudget(e.target.value)} placeholder="留空为无限制" />
                            </div>
                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 block">已消耗金额 (美元)</label>
                                <input className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                    type="number" min="0" step="0.0001" value={formUsedCost} onChange={e => setFormUsedCost(e.target.value)} placeholder="0" />
                            </div>

                            {formProvider !== 'Gemini' && (
                                <div className="border-t border-zinc-800 pt-4 mt-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs text-zinc-400">使用代理</label>
                                        <button onClick={() => setFormUseProxy(!formUseProxy)} className={`w-8 h-4 rounded-full ${formUseProxy ? 'bg-indigo-600' : 'bg-zinc-700'} relative`}>
                                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${formUseProxy ? 'left-4.5' : 'left-0.5'}`} />
                                        </button>
                                    </div>
                                    {formUseProxy && (
                                        <>
                                            <input className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono mb-2"
                                                placeholder="https://api.proxy.com" value={formBaseUrl} onChange={e => setFormBaseUrl(e.target.value)} />
                                            <p className="text-[10px] text-zinc-500">
                                                *请使用支持 OpenAI 格式或 Google 原生格式的中转服务商
                                            </p>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Proxy Model Configuration Section - Only for proxy keys */}
                            {editingId && formUseProxy && (
                                <div className="border-t border-zinc-800 pt-4 mt-2">
                                    <div className="flex items-center justify-between mb-3">
                                        <h5 className="text-sm font-bold text-purple-300">代理模型配置</h5>
                                        <button
                                            onClick={() => openProxyModelModal(editingId)}
                                            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300"
                                        >
                                            <Plus size={12} /> 添加模型
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mb-3">
                                        配置此 API 支持的模型及其能力（比例、像素、联网）
                                    </p>

                                    {/* Configured Models List */}
                                    {(() => {
                                        const slot = slots.find(s => s.id === editingId);
                                        const models = slot?.proxyModels || [];
                                        if (models.length === 0) {
                                            return (
                                                <div className="text-center py-4 text-zinc-500 text-xs border border-dashed border-zinc-700 rounded-lg">
                                                    尚未配置模型，点击上方"添加模型"开始
                                                </div>
                                            );
                                        }
                                        return (
                                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                                {models.map((model) => (
                                                    <div key={model.id} className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded-lg group">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${model.type === 'image' ? 'bg-green-500/20 text-green-400' :
                                                            model.type === 'video' ? 'bg-purple-500/20 text-purple-400' :
                                                                'bg-blue-500/20 text-blue-400'
                                                            }`}>
                                                            {model.type === 'image' ? '图片' : model.type === 'video' ? '视频' : '对话'}
                                                        </span>
                                                        <span className="text-sm text-white flex-1 truncate">{model.label}</span>
                                                        <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[80px]">{model.id}</span>
                                                        <button
                                                            onClick={() => handleEditProxyModel(editingId, model)}
                                                            className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-white transition-opacity mr-1"
                                                            title="编辑模型"
                                                        >
                                                            <Pencil size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemoveProxyModel(editingId, model.id)}
                                                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}

                                    {/* Quick Add Presets */}
                                    <div className="mt-3">
                                        <div className="text-[10px] text-zinc-500 mb-2">快速添加预设模型:</div>
                                        <div className="flex flex-wrap gap-1">
                                            {PROXY_MODEL_PRESETS.map(preset => (
                                                <button
                                                    key={preset.id}
                                                    onClick={() => editingId && handleAddPresetModel(editingId, preset)}
                                                    disabled={slots.find(s => s.id === editingId)?.proxyModels?.some(m => m.id === preset.id)}
                                                    className="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-purple-600/30 text-zinc-300 hover:text-purple-300 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title={preset.description}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-5 border-t border-zinc-800 flex justify-end gap-3 bg-[#161618]">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5">取消</button>
                            <button onClick={handleSubmit} disabled={loading} className="px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
                                {loading ? '处理中...' : (editingId ? '保存' : '添加')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Proxy Model Add Modal */}
            {showProxyModelModal && createPortal(
                <div className="fixed inset-0 z-[10060] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#161618] w-full max-w-lg rounded-2xl border border-purple-500/30 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] overflow-hidden">
                        <div className="flex justify-between items-center p-5 border-b border-zinc-800 bg-gradient-to-r from-purple-900/20 to-transparent shrink-0">
                            <h4 className="text-lg font-bold text-purple-300">添加代理模型</h4>
                            <button onClick={() => setShowProxyModelModal(false)} className="text-zinc-500 hover:text-white transition-colors"><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-4">
                            {proxyModelError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                                    {proxyModelError}
                                </div>
                            )}

                            {/* Model Type */}
                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 block">模型类型</label>
                                <div className="flex gap-2">
                                    {(['image', 'video', 'chat'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setNewProxyModel(prev => ({ ...prev, type }))}
                                            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${newProxyModel.type === type
                                                ? type === 'image' ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                    : type === 'video' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                : 'bg-zinc-800 text-zinc-400 border border-transparent hover:border-zinc-600'
                                                }`}
                                        >
                                            {type === 'image' ? <Image size={14} /> : type === 'video' ? <Video size={14} /> : <MessageCircle size={14} />}
                                            {type === 'image' ? '图片' : type === 'video' ? '视频' : '对话'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Model ID - Smart Input */}
                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 flex justify-between">
                                    <span>模型 ID (API 参数)</span>
                                    <span className="text-indigo-400 cursor-pointer hover:text-indigo-300" onClick={() => {
                                        const slot = getProxySlot(editingProxyKeyId);
                                        setNewProxyModel(prev => hydrateProxyModel(prev, slot));
                                    }}>
                                        ✨ 自动识别
                                    </span>
                                </label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-purple-500 outline-none placeholder-zinc-600"
                                    placeholder="粘贴模型 ID (如 gemini-3-pro-image-preview)"
                                    value={newProxyModel.id}
                                    onChange={e => {
                                        const newId = e.target.value;
                                        setNewProxyModel(prev => {
                                            const updated = { ...prev, id: newId };
                                            const slot = getProxySlot(editingProxyKeyId);
                                            return hydrateProxyModel(updated, slot);
                                        });
                                    }}
                                />
                            </div>

                            {/* Display Name */}
                            <div>
                                <label className="text-xs text-zinc-400 mb-1.5 block">显示名称</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                    placeholder="自动生成或自定义"
                                    value={newProxyModel.label}
                                    onChange={e => setNewProxyModel(prev => ({ ...prev, label: e.target.value }))}
                                />
                            </div>

                            {/* Simple Mode: Capabilities Summary */}
                            <div className="p-3 bg-zinc-800/40 rounded-lg border border-zinc-700/50">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-zinc-300 font-medium">✨ 智能配置已启用</span>
                                    <button
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                                    >
                                        {showAdvanced ? '收起高级设置' : '展开高级设置'}
                                    </button>
                                </div>
                                <p className="text-xs text-zinc-500 leading-relaxed">
                                    系统会根据模型 ID 自动匹配能力、比例、分辨率与视频功能。
                                    {newProxyModel.apiFormat === 'openai' ? '使用 OpenAI 标准协议。' : '使用 Google 原生协议。'}
                                </p>
                            </div>

                            {/* Advanced Settings (Hidden by default) */}
                            {showAdvanced && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 pt-2">

                                    {/* API Format */}
                                    <div>
                                        <label className="text-xs text-zinc-400 mb-1.5 block">API 协议格式</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setNewProxyModel(prev => ({ ...prev, apiFormat: 'openai' }))}
                                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${newProxyModel.apiFormat !== 'gemini'
                                                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                                    : 'bg-zinc-800 text-zinc-500 border-transparent hover:border-zinc-700'}`}
                                            >
                                                OpenAI 标准 (通用)
                                            </button>
                                            <button
                                                onClick={() => setNewProxyModel(prev => ({ ...prev, apiFormat: 'gemini' }))}
                                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${newProxyModel.apiFormat === 'gemini'
                                                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                                    : 'bg-zinc-800 text-zinc-500 border-transparent hover:border-zinc-700'}`}
                                            >
                                                Google 原生
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-zinc-500 mt-1.5">* NewAPI / OneAPI 等中转商请务必选择 <b>OpenAI 标准</b></p>
                                    </div>

                                    {/* Provider */}
                                    <div>
                                        <label className="text-xs text-zinc-400 mb-1.5 block">提供商</label>
                                        <input
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                                            value={newProxyModel.provider || ''}
                                            onChange={e => setNewProxyModel(prev => ({ ...prev, provider: e.target.value }))}
                                        />
                                    </div>

                                    {/* Aspect Ratios & Sizes */}
                                    {newProxyModel.type !== 'chat' && (
                                        <>
                                            <div>
                                                <label className="text-xs text-zinc-400 mb-1.5 block">支持的宽高比</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {Object.values(AspectRatio).map(ratio => (
                                                        <label key={ratio} className={`px-2 py-1 rounded cursor-pointer text-[10px] border transition-all ${newProxyModel.supportedAspectRatios.includes(ratio)
                                                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                                            : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                                                            }`}>
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={newProxyModel.supportedAspectRatios.includes(ratio)}
                                                                onChange={e => {
                                                                    if (e.target.checked) setNewProxyModel(prev => ({ ...prev, supportedAspectRatios: [...prev.supportedAspectRatios, ratio] }));
                                                                    else setNewProxyModel(prev => ({ ...prev, supportedAspectRatios: prev.supportedAspectRatios.filter(r => r !== ratio) }));
                                                                }}
                                                            />
                                                            {ratio}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-xs text-zinc-400 mb-1.5 block">支持的分辨率</label>
                                                <div className="flex gap-2">
                                                    {Object.values(ImageSize).map(size => (
                                                        <label key={size} className={`px-2 py-1 rounded cursor-pointer text-[10px] border transition-all ${newProxyModel.supportedSizes.includes(size)
                                                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                                            : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                                                            }`}>
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={newProxyModel.supportedSizes.includes(size)}
                                                                onChange={e => {
                                                                    if (e.target.checked) setNewProxyModel(prev => ({ ...prev, supportedSizes: [...prev.supportedSizes, size] }));
                                                                    else setNewProxyModel(prev => ({ ...prev, supportedSizes: prev.supportedSizes.filter(s => s !== size) }));
                                                                }}
                                                            />
                                                            {size}
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="p-5 border-t border-zinc-800 flex justify-end gap-3 bg-[#161618]">
                            <button onClick={() => setShowProxyModelModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5">取消</button>
                            <button onClick={handleAddProxyModel} className="px-5 py-2 rounded-lg text-sm font-bold bg-white text-black hover:bg-gray-200 shadow-lg">
                                添加
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
