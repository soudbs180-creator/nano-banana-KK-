import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { GenerationConfig, AspectRatio, ImageSize, GenerationMode, ModelType } from '../types';
import { modelRegistry, ActiveModel } from '../services/modelRegistry';
import { keyManager } from '../services/keyManager';
import { getModelCapabilities, modelSupportsGrounding } from '../services/modelCapabilities';

const MobileMenu = ({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) => (
    <>
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md animate-fadeIn" onClick={onClose} />
        <div className="fixed bottom-4 left-4 right-4 z-[201] bg-[#1c1c1e] border border-white/10 rounded-[32px] p-5 animate-slideUp shadow-2xl flex flex-col gap-5 max-h-[80vh] origin-bottom transform transition-transform">
            <div className="w-10 h-1 bg-zinc-700/50 rounded-full mx-auto" />
            <div className="flex items-center justify-between px-1">
                <span className="text-base font-bold text-white tracking-wide">{title}</span>
                <button
                    onClick={onClose}
                    className="w-7 h-7 flex items-center justify-center bg-zinc-800/50 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar px-1 pb-1">
                {children}
            </div>
        </div>
    </>
);

interface PromptBarProps {
    config: GenerationConfig;
    setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
    onGenerate: () => void;
    isGenerating: boolean;
    onFilesDrop?: (files: File[]) => void;
    activeSourceImage?: { id: string; url: string; prompt: string } | null;
    onClearSource?: () => void;
    onCancel?: () => void;
    isMobile?: boolean;
    onOpenSettings?: (view?: 'api-management') => void;
}

const PromptBar: React.FC<PromptBarProps> = ({ config, setConfig, onGenerate, isGenerating, onFilesDrop, activeSourceImage, onClearSource, onCancel, isMobile = false, onOpenSettings }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    // Dynamic Model State
    const [globalModels, setGlobalModels] = useState(keyManager.getGlobalModelList());

    useEffect(() => {
        const unsubscribeKeyManager = keyManager.subscribe(() => {
            setGlobalModels(keyManager.getGlobalModelList());
        });
        return () => {
            unsubscribeKeyManager();
        };
    }, []);

    // Get available models based on global list and current mode
    const availableModels = useMemo(() => {
        return globalModels
            .filter(m => m.type !== 'chat')
            .map(m => {
                // Check if explicitly in registry (for overrides)
                const registryModel = modelRegistry.getModels().find(r => r.id === m.id);
                if (registryModel) return registryModel;

                // Infer type for custom models
                const isVideo = m.id.toLowerCase().includes('video') ||
                    m.id.toLowerCase().includes('runway') ||
                    m.id.toLowerCase().includes('kling') ||
                    m.id.toLowerCase().includes('luma') ||
                    m.id.toLowerCase().includes('veo');
                const modelType = m.type || (isVideo ? 'video' : 'image');

                return {
                    id: m.id,
                    label: m.name || m.id,
                    provider: m.provider,
                    type: modelType,
                    enabled: true,
                    description: m.description
                } as ActiveModel;
            })
            .filter(m => (m.type || 'image') === config.mode);
    }, [globalModels, config.mode]);

    // Auto-select valid model when switching modes
    useEffect(() => {
        const currentModelValid = availableModels.find(m => m.id === config.model);
        if (!currentModelValid && availableModels.length > 0) {
            setConfig(prev => ({ ...prev, model: availableModels[0].id }));
        }
    }, [config.mode, availableModels, config.model, setConfig]);

    // Get available ratios and sizes based on model capabilities
    const modelCaps = useMemo(() => {
        return getModelCapabilities(config.model);
    }, [config.model]);

    const availableRatios = useMemo(() => {
        const ratios = modelCaps?.supportedRatios;
        return ratios && ratios.length > 0 ? ratios : Object.values(AspectRatio);
    }, [modelCaps]);

    const availableSizes = useMemo(() => {
        const sizes = modelCaps?.supportedSizes;
        return sizes && sizes.length > 0 ? sizes : Object.values(ImageSize);
    }, [modelCaps]);

    const groundingSupported = useMemo(() => {
        return modelSupportsGrounding(config.model);
    }, [config.model]);

    // Auto-reset grounding if not supported
    useEffect(() => {
        if (config.enableGrounding && !groundingSupported) {
            setConfig(prev => ({ ...prev, enableGrounding: false }));
        }
    }, [groundingSupported, config.enableGrounding, setConfig]);

    // Auto-adjust ratio/size if current selection not available
    useEffect(() => {
        if (!availableRatios.includes(config.aspectRatio) && availableRatios.length > 0) {
            setConfig(prev => ({ ...prev, aspectRatio: availableRatios[0] }));
        }
    }, [availableRatios, config.aspectRatio, setConfig]);

    useEffect(() => {
        if (!availableSizes.includes(config.imageSize) && availableSizes.length > 0) {
            setConfig(prev => ({ ...prev, imageSize: availableSizes[0] }));
        }
    }, [availableSizes, config.imageSize, setConfig]);

    // NOTE: Legacy functions removed - now using modelCapabilities service

    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setConfig(prev => ({ ...prev, prompt: e.target.value }));
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
    }, [setConfig]);

    // Reset height when prompt is cleared programmatically
    useEffect(() => {
        if (!config.prompt && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    }, [config.prompt]);

    const processFiles = useCallback((files: FileList) => {
        if (config.referenceImages.length >= 5) {
            alert("最多只能上传 5 张参考图");
            return;
        }

        const remainingSlots = 5 - config.referenceImages.length;
        const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
        // TODO: Video upload support for Video mode

        if (fileArray.length > remainingSlots) {
            alert(`最多只能上传 5 张参考图，已自动忽略 ${fileArray.length - remainingSlots} 张`);
        }

        const filesToProcess = fileArray.slice(0, remainingSlots);

        filesToProcess.forEach(file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const matches = (reader.result as string).match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    setConfig(prev => ({
                        ...prev,
                        referenceImages: [...prev.referenceImages, {
                            id: Date.now() + Math.random().toString(),
                            mimeType: matches[1],
                            data: matches[2]
                        }]
                    }));
                }
            };
            reader.readAsDataURL(file);
        });
    }, [config.referenceImages, setConfig]);

    const toggleMenu = useCallback((menu: string) => {
        setActiveMenu(prev => prev === menu ? null : menu);
    }, []);

    const removeReferenceImage = useCallback((id: string) => {
        setConfig(prev => ({
            ...prev,
            referenceImages: prev.referenceImages.filter(img => img.id !== id)
        }));
    }, [setConfig]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isGenerating && onCancel) {
                onCancel();
            } else {
                onGenerate();
            }
        }
    }, [onGenerate, isGenerating, onCancel]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) imageFiles.push(file);
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault();
            const fileList = new DataTransfer();
            imageFiles.forEach(f => fileList.items.add(f));
            processFiles(fileList.files);
        }
    }, [processFiles]);

    const dragCounter = useRef(0);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.input-bar-inner')) {
                setActiveMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Drag & Drop handlers...
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
        }
    }, []);
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsDragging(false);
        }
    }, []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    }, [processFiles]);

    const isModelListEmpty = availableModels.length === 0;


    const currentModel = availableModels.find(m => m.id === config.model);
    const currentModelLabel = isModelListEmpty
        ? '无可用模型 (请配置 API)'
        : (currentModel?.label || currentModel?.id || '未知模型');

    const truncateModelLabel = useCallback((label: string) => {
        const max = isMobile ? 14 : 18;
        if (label.length <= max) return label;
        const head = Math.max(6, Math.floor(max * 0.6));
        const tail = Math.max(3, max - head - 3);
        return `${label.slice(0, head)}...${label.slice(-tail)}`;
    }, [isMobile]);

    const displayModelLabel = truncateModelLabel(currentModelLabel);

    return (
        <div
            id="prompt-bar-container"
            className={`input-bar transition-all duration-300 ${isDragging ? 'ring-2 ring-indigo-500' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
                borderRadius: '24px',
                bottom: isMobile ? 'calc(96px + env(safe-area-inset-bottom))' : '32px'
            }}
        >
            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-500/20 backdrop-blur-md rounded-[inherit] flex items-center justify-center animate-fadeIn pointer-events-none">
                    <span className="font-bold text-sm text-white drop-shadow-md">释放添加参考图</span>
                </div>
            )}

            <div className="input-bar-inner" style={{ position: 'relative' }}>

                {/* Mode Toggle (Floating above on Desktop, or Integrated?)
                     Design choice: Put it inside "Tools" or main bar?
                     Main bar is better for visibility. 
                     Let's add a small toggle at the top left of the input bar or left side.
                  */}



                {/* Active Source Image Banner */}
                {activeSourceImage && (
                    <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl border transition-all animate-in slide-in-from-bottom-2"
                        style={{
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            borderColor: 'rgba(245, 158, 11, 0.2)'
                        }}
                    >
                        <img
                            src={activeSourceImage.url}
                            alt="Source"
                            className="w-10 h-10 object-cover rounded-lg shadow-sm"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-amber-500">从此图继续创作</div>
                            <div className="text-xs text-zinc-400 truncate">{activeSourceImage.prompt}</div>
                        </div>
                        <button
                            onClick={onClearSource}
                            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-500/10 text-zinc-500 hover:text-red-500 transition-colors"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                )}

                {/* Quick Options Row */}
                <div className="input-bar-options">
                    {/* Mode Toggle (Desktop Only - hidden on mobile) */}
                    {!isMobile && (
                        <div className="hidden md:flex items-center gap-1 mr-2 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                            <button
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${config.mode === GenerationMode.IMAGE ? 'bg-indigo-500/20 text-indigo-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                                onClick={() => setConfig(prev => ({ ...prev, mode: GenerationMode.IMAGE }))}
                            >
                                图片
                            </button>
                            <button
                                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${config.mode === GenerationMode.VIDEO ? 'bg-purple-500/20 text-purple-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                                onClick={() => setConfig(prev => ({ ...prev, mode: GenerationMode.VIDEO }))}
                            >
                                视频
                            </button>
                        </div>
                    )}
                </div>

                {/* Reference Images */}
                {config.referenceImages.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-2">
                        {config.referenceImages.map(img => (
                            <div key={img.id} className="relative group">
                                <img src={`data:${img.mimeType};base64,${img.data}`} className="w-12 h-12 object-cover rounded-lg border border-white/10 shadow-sm" alt="Reference" />
                                <button onClick={() => removeReferenceImage(img.id)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Text Input */}
                <textarea
                    ref={textareaRef}
                    value={config.prompt}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onFocus={() => setActiveMenu(null)}
                    placeholder={config.mode === GenerationMode.VIDEO ? "描述你想要生成的视频..." : "描述你想要生成的图片..."}
                    className="input-bar-textarea w-full bg-transparent border-none outline-none text-sm resize-none mt-2"
                    style={{ color: 'var(--text-primary)', minHeight: '48px', maxHeight: '160px', lineHeight: '1.6', fontSize: '15px' }}
                    rows={1}
                />

                {/* Footer */}
                <div className="input-bar-footer flex items-center justify-start sm:justify-between pt-3 mt-1" style={{ borderTop: '1px solid var(--border-light)' }}>
                    {/* Left: Model & Settings - Coalescing Animation */}
                    <div className="flex items-center gap-2 min-w-0 sm:min-w-[236px] w-full sm:w-auto flex-wrap sm:flex-nowrap">
                        {/* Model Button */}
                        <div className="relative">
                            <button
                                id="models-dropdown-trigger"
                                className={`input-bar-model flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] max-w-[70vw] sm:max-w-none ${isModelListEmpty
                                    ? 'bg-zinc-800/50 border-zinc-700 text-zinc-500 min-w-0 sm:min-w-[220px] cursor-not-allowed'
                                    : 'bg-[var(--bg-tertiary)] border-[var(--border-light)] text-[var(--text-secondary)] hover:border-opacity-50 min-w-0 w-auto'
                                    }`}
                                onClick={() => {
                                    if (isModelListEmpty) {
                                        onOpenSettings?.('api-management');
                                    } else {
                                        toggleMenu('model');
                                    }
                                }}
                            >
                                <span className={`w-2 h-2 rounded-full transition-colors duration-300 ${isModelListEmpty
                                    ? 'bg-zinc-600'
                                    : (config.mode === GenerationMode.VIDEO ? 'bg-purple-500' : 'bg-green-500')
                                    }`}></span>
                                <span className="text-xs text-center truncate font-medium whitespace-nowrap transition-all duration-300">
                                    {displayModelLabel}
                                </span>
                            </button>

                            {/* Dropdown Menu */}
                            {!isModelListEmpty && activeMenu === 'model' && (
                                <div className="absolute bottom-full mb-2 z-20" style={{ left: '0' }}>
                                    <div className="dropdown static w-[min(16rem,90vw)] max-w-[90vw] animate-scaleIn origin-bottom p-1" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-xl)' }}>
                                        {availableModels.map(model => {
                                            const displayName = model.label || model.id;
                                            const advantage = model.description || (model.provider ? `${model.provider} 模型` : '自定义模型');
                                            return (
                                                <button
                                                    key={model.id}
                                                    className={`w-full px-3 py-2.5 text-left flex flex-col gap-0.5 hover:bg-white/5 transition-colors rounded-md ${config.model === model.id ? 'bg-white/5' : ''}`}
                                                    onClick={() => {
                                                        setConfig(prev => ({ ...prev, model: model.id }));
                                                        setActiveMenu(null);
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-xs font-medium ${config.model === model.id ? 'text-indigo-400' : 'text-slate-200'}`}>
                                                            {displayName}
                                                        </span>
                                                        {config.model === model.id && (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-zinc-500 leading-tight break-all">ID: {model.id}</span>
                                                    <span className="text-[10px] text-zinc-500 leading-tight">{advantage}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Aspect Ratio & Size - Slide Animation */}
                        <div className={`flex items-center gap-2 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isModelListEmpty
                            ? 'max-w-0 opacity-0 -translate-x-4 pointer-events-none overflow-hidden'
                            : 'max-w-[300px] opacity-100 translate-x-0 overflow-visible'
                            }`}>
                            {/* Aspect Ratio */}
                            <div className="relative flex-shrink-0">
                                <button
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all"
                                    style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-light)',
                                        color: 'var(--text-secondary)'
                                    }}
                                    onClick={() => toggleMenu('ratio')}
                                    title="宽高比"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="5" width="18" height="14" rx="2" />
                                    </svg>
                                    <span className="text-[11px] font-medium">{config.aspectRatio}</span>
                                </button>
                                {activeMenu === 'ratio' && (
                                    <div className="absolute bottom-full mb-2 z-20" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                                        <div className="dropdown static animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                            {availableRatios.map(ratio => (
                                                <button key={ratio} className={`dropdown-item ${config.aspectRatio === ratio ? 'active' : ''}`} onClick={() => { setConfig(prev => ({ ...prev, aspectRatio: ratio })); setActiveMenu(null); }}>
                                                    {ratio}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Image Size */}
                            <div className="relative flex-shrink-0">
                                <button
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all"
                                    style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-light)',
                                        color: 'var(--text-secondary)'
                                    }}
                                    onClick={() => toggleMenu('size')}
                                    title="分辨率"
                                >
                                    <span className="text-[11px] font-medium">{config.imageSize}</span>
                                </button>
                                {activeMenu === 'size' && (
                                    <div className="absolute bottom-full mb-2 z-20" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                                        <div className="dropdown static w-20 animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                            {availableSizes.map(size => (
                                                <button key={size} className={`dropdown-item ${config.imageSize === size ? 'active' : ''}`} onClick={() => { setConfig(prev => ({ ...prev, imageSize: size })); setActiveMenu(null); }}>
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions Group */}
                    <div className="input-bar-actions flex items-center gap-2">

                        {/* Group 1: Network & Provider Settings */}
                        <div className="flex items-center gap-0.5 p-0.5 rounded-full border h-[32px]" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }}>
                            {/* Grounding Tool - Now with capability check */}
                            <button
                                className={`flex items-center gap-1.5 px-3 h-full rounded-full transition-all text-[11px] font-medium whitespace-nowrap ${!groundingSupported
                                    ? 'opacity-40 cursor-not-allowed text-[var(--text-tertiary)]'
                                    : config.enableGrounding
                                        ? 'bg-indigo-500/15 text-indigo-500 shadow-sm'
                                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)]'
                                    }`}
                                onClick={() => groundingSupported && setConfig(prev => ({ ...prev, enableGrounding: !prev.enableGrounding }))}
                                disabled={!groundingSupported}
                                title={groundingSupported ? "Grounding with Google Search" : "当前模型不支持联网模式"}
                            >
                                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                                <span>联网</span>
                            </button>

                        </div>

                        {/* Group 2: Generation Settings */}
                        <div className="flex items-center gap-0.5 p-0.5 rounded-full border h-[32px]" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }}>
                            {/* Parallel Count */}
                            <div className="relative h-full">
                                <button
                                    className="flex items-center gap-1.5 px-3 h-full rounded-full transition-all whitespace-nowrap"
                                    style={{ color: 'var(--text-secondary)' }}
                                    onClick={() => toggleMenu('count')}
                                    title="并发数量"
                                >
                                    <span className="text-[11px] font-medium">数量 {config.parallelCount}</span>
                                    <svg className="w-2.5 h-2.5 opacity-50 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                                </button>
                                {activeMenu === 'count' && (
                                    <div className="absolute bottom-full mb-2 z-20 right-0">
                                        <div className="dropdown static w-24 animate-scaleIn origin-bottom-right" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                            {[1, 2, 3, 4].map(count => (
                                                <button key={count} className={`dropdown-item justify-between ${config.parallelCount === count ? 'active' : ''}`} onClick={() => { setConfig(prev => ({ ...prev, parallelCount: count })); setActiveMenu(null); }}>
                                                    <span>{count} 张</span>
                                                    {config.parallelCount === count && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Upload Button */}
                        <button
                            className="p-2.5 rounded-full transition-all border"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-secondary)',
                                borderColor: 'var(--border-light)'
                            }}
                            onClick={() => fileInputRef.current?.click()}
                            title="上传参考图"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </button>

                        <div className="w-[1px] h-6 bg-white/10 mx-1"></div>

                        <button
                            onClick={isGenerating ? onCancel : onGenerate}
                            disabled={!isGenerating && !config.prompt}
                            className={`input-bar-send ${isGenerating ? 'sending' : ''}`}
                            style={{
                                background: isGenerating
                                    ? 'rgba(239, 68, 68, 0.9)'
                                    : 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                                boxShadow: isGenerating
                                    ? '0 0 20px rgba(239, 68, 68, 0.5)'
                                    : '0 0 20px rgba(139, 92, 246, 0.4), 0 0 30px rgba(59, 130, 246, 0.3)',
                                border: 'none'
                            }}
                        >
                            {isGenerating ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                    <rect x="6" y="6" width="12" height="12" rx="1" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="send-icon text-white">
                                    <path d="M22 2L11 13" />
                                    <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={(e) => e.target.files && processFiles(e.target.files)} />
        </div >
    );
};

export default PromptBar;
