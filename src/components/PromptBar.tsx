import React, { useRef, useState, useCallback, useEffect } from 'react';
import { GenerationConfig, AspectRatio, ImageSize, ModelType, ReferenceImage } from '../types';
// Lucide icons replaced with SVGs

const MobileMenu = ({ title, onClose, children }: { title: string, onClose: () => void, children: React.ReactNode }) => (
    <>
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md animate-fadeIn" onClick={onClose} />
        <div className="fixed bottom-0 left-0 right-0 z-[201] bg-[#1c1c1e]/95 backdrop-blur-2xl border-t border-white/10 rounded-t-[32px] p-6 animate-slideUp pb-12 flex flex-col gap-6 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] transform transition-transform">
            <div className="w-12 h-1.5 bg-zinc-700/50 rounded-full mx-auto -mt-2 mb-1" />
            <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-white tracking-tight">{title}</span>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center bg-zinc-800/50 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto w-full custom-scrollbar overscroll-contain">
                <div className="flex flex-col gap-3 w-full">
                    {children}
                </div>
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
    isMobile?: boolean;
}

const PromptBar: React.FC<PromptBarProps> = ({ config, setConfig, onGenerate, isGenerating, onFilesDrop, activeSourceImage, onClearSource, isMobile = false }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    // Filter available aspect ratios based on model
    const getAvailableAspectRatios = () => {
        const ratios = [
            AspectRatio.SQUARE,
            AspectRatio.STANDARD_2_3,
            AspectRatio.STANDARD_3_2,
            AspectRatio.PORTRAIT_3_4,
            AspectRatio.LANDSCAPE_4_3,
            AspectRatio.PORTRAIT_9_16,
            AspectRatio.LANDSCAPE_16_9,
            AspectRatio.LANDSCAPE_21_9
        ];

        if (config.model === ModelType.IMAGEN_4) {
            // Imagen 4.0 does not support 21:9
            return ratios.filter(r => r !== AspectRatio.LANDSCAPE_21_9);
        }
        return ratios;
    };

    // Filter available image sizes based on model
    const getAvailableImageSizes = () => {
        const sizes = [ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K];

        if (config.model === ModelType.IMAGEN_4) {
            // Imagen 4.0 supports max 2K usually (checking vs user request which says 4K not supported)
            return sizes.filter(s => s !== ImageSize.SIZE_4K);
        }
        return sizes;
    };

    const availableRatios = getAvailableAspectRatios();
    const availableSizes = getAvailableImageSizes();

    // Auto-correct config if the selected option is no longer available
    useEffect(() => {
        if (!availableRatios.includes(config.aspectRatio)) {
            setConfig(prev => ({ ...prev, aspectRatio: AspectRatio.SQUARE }));
        }
        if (!availableSizes.includes(config.imageSize)) {
            setConfig(prev => ({ ...prev, imageSize: ImageSize.SIZE_1K }));
        }
    }, [config.model]); // Check when model changes

    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setConfig(prev => ({ ...prev, prompt: e.target.value }));
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
    }, [setConfig]);

    // Reset height when prompt is cleared programmatically or manually
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
            onGenerate();
        }
    }, [onGenerate]);

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
            // Don't call onFilesDrop here - it would duplicate the images
        }
    }, [processFiles]);

    const [isDragging, setIsDragging] = useState(false);

    // Click outside to close menus
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

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
            // Don't call onFilesDrop here - processFiles already handles the images
        }
    }, [processFiles]);

    return (
        <div
            className={`input-bar transition-all duration-300 ${isDragging ? 'ring-2 ring-indigo-500 scale-[1.02]' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
                backgroundColor: 'var(--toolbar-bg-dark)',
                backdropFilter: 'blur(20px) saturate(180%)',
                borderColor: 'var(--border-medium)',
                boxShadow: 'var(--shadow-xl)',
                borderRadius: 'var(--radius-xl)'
            }}
        >
            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-500/20 backdrop-blur-md rounded-[inherit] flex items-center justify-center animate-fadeIn pointer-events-none">
                    <div className="flex flex-col items-center gap-2 text-white drop-shadow-lg">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                            <line x1="12" y1="8" x2="12" y2="16" strokeWidth="2" />
                            <line x1="8" y1="12" x2="16" y2="12" strokeWidth="2" />
                        </svg>
                        <span className="font-bold text-sm">释放添加参考图</span>
                    </div>
                </div>
            )}

            <div className="input-bar-inner">
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Quick Options Row */}
                <div className="input-bar-options">
                    {/* Aspect Ratio */}
                    <div className="relative">
                        <button
                            className="input-bar-option group"
                            onClick={() => toggleMenu('ratio')}
                            title="宽高比"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                borderColor: 'var(--border-light)',
                                color: 'var(--text-secondary)'
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-indigo-400 transition-colors">
                                <rect x="3" y="5" width="18" height="14" rx="2" />
                            </svg>
                            <span className="text-xs font-medium">{config.aspectRatio}</span>
                        </button>
                        {activeMenu === 'ratio' && (
                            isMobile ? (
                                <MobileMenu title="选择宽高比" onClose={() => setActiveMenu(null)}>
                                    <div className="grid grid-cols-2 gap-2">
                                        {availableRatios.map(ratio => (
                                            <button
                                                key={ratio}
                                                className={`p-3 rounded-lg border text-xs font-medium transition-all ${config.aspectRatio === ratio
                                                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                                                    : 'bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10'
                                                    }`}
                                                onClick={() => {
                                                    setConfig(prev => ({ ...prev, aspectRatio: ratio }));
                                                    setActiveMenu(null);
                                                }}
                                            >
                                                {ratio}
                                            </button>
                                        ))}
                                    </div>
                                </MobileMenu>
                            ) : (
                                <div
                                    className="absolute bottom-full mb-2 z-20"
                                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                                >
                                    <div className="dropdown static animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                        {availableRatios.map(ratio => (
                                            <button
                                                key={ratio}
                                                className={`dropdown-item ${config.aspectRatio === ratio ? 'active' : ''}`}
                                                onClick={() => {
                                                    setConfig(prev => ({ ...prev, aspectRatio: ratio }));
                                                    setActiveMenu(null);
                                                }}
                                                style={{ color: config.aspectRatio === ratio ? 'var(--accent-indigo-light)' : 'var(--text-secondary)' }}
                                            >
                                                {ratio}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )
                        )}
                    </div>

                    {/* Image Size */}
                    {(config.model === ModelType.NANO_BANANA_PRO || config.model === ModelType.IMAGEN_4 || config.model === ModelType.IMAGEN_4_ULTRA) && (
                        <div className="relative">
                            <button
                                className="input-bar-option group"
                                onClick={() => toggleMenu('size')}
                                title="分辨率"
                                style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: 'var(--border-light)',
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-indigo-400 transition-colors">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                </svg>
                                <span className="text-xs font-medium">{config.imageSize}</span>
                            </button>
                            {activeMenu === 'size' && (
                                isMobile ? (
                                    <MobileMenu title="选择分辨率" onClose={() => setActiveMenu(null)}>
                                        <div className="flex flex-col gap-2">
                                            {availableSizes.map(size => (
                                                <button
                                                    key={size}
                                                    className={`p-3 rounded-lg border text-sm font-medium transition-all ${config.imageSize === size
                                                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                                                        : 'bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10'
                                                        }`}
                                                    onClick={() => {
                                                        setConfig(prev => ({ ...prev, imageSize: size }));
                                                        setActiveMenu(null);
                                                    }}
                                                >
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    </MobileMenu>
                                ) : (
                                    <div
                                        className="absolute bottom-full mb-2 z-20"
                                        style={{ left: '50%', transform: 'translateX(-50%)' }}
                                    >
                                        <div className="dropdown static animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                            {availableSizes.map(size => (
                                                <button
                                                    key={size}
                                                    className={`dropdown-item ${config.imageSize === size ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setConfig(prev => ({ ...prev, imageSize: size }));
                                                        setActiveMenu(null);
                                                    }}
                                                    style={{ color: config.imageSize === size ? 'var(--accent-indigo-light)' : 'var(--text-secondary)' }}
                                                >
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>

                {/* Reference Images */}
                {config.referenceImages.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-2">
                        {config.referenceImages.map(img => (
                            <div key={img.id} className="relative group">
                                <img
                                    src={`data:${img.mimeType};base64,${img.data}`}
                                    className="w-12 h-12 object-cover rounded-lg border border-white/10 shadow-sm"
                                    alt="Reference"
                                />
                                <button
                                    onClick={() => removeReferenceImage(img.id)}
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
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
                    placeholder="描述你想要生成的图片..."
                    className="input-bar-textarea w-full bg-transparent border-none outline-none text-sm resize-none mt-2"
                    style={{
                        color: 'var(--text-primary)',
                        minHeight: '48px',
                        maxHeight: '160px',
                        lineHeight: '1.6',
                        fontSize: '15px'
                    }}
                    rows={1}
                />

                {/* Footer */}
                <div className="input-bar-footer flex items-center justify-between pt-3 mt-1" style={{ borderTop: '1px solid var(--border-light)' }}>
                    {/* Left: Model */}
                    <div className="flex items-center gap-2">
                        {/* Model Selector */}
                        <div className="relative">
                            <button
                                className="input-bar-model flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all hover:border-opacity-50"
                                onClick={() => toggleMenu('model')}
                                style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderColor: 'var(--border-light)',
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={config.model === ModelType.NANO_BANANA ? 'text-blue-400' : 'text-yellow-500'}>
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                                <span className="text-xs flex-1 text-center truncate font-medium">
                                    {config.model === ModelType.NANO_BANANA && 'Nano Banana'}
                                    {config.model === ModelType.NANO_BANANA_PRO && 'Nano Banana Pro'}
                                    {config.model === ModelType.IMAGEN_4 && 'Imagen 4.0'}
                                    {config.model === ModelType.IMAGEN_4_ULTRA && 'Imagen 4.0 Ultra'}
                                </span>
                            </button>
                            {activeMenu === 'model' && (
                                isMobile ? (
                                    <MobileMenu title="选择模型" onClose={() => setActiveMenu(null)}>
                                        <div className="flex flex-col gap-2">
                                            {[
                                                { id: ModelType.NANO_BANANA, label: 'Nano Banana', desc: '极速生成，适合快速验证灵感' },
                                                { id: ModelType.NANO_BANANA_PRO, label: 'Nano Banana Pro', desc: '增强细节与构图，适合高质量预览' },
                                                { id: ModelType.IMAGEN_4, label: 'Imagen 4.0', desc: '谷歌最新旗舰，写实感与光影极佳' },
                                                { id: ModelType.IMAGEN_4_ULTRA, label: 'Imagen 4.0 Ultra', desc: '极致画质与分辨率，适合商业级输出' }
                                            ].map(model => (
                                                <button
                                                    key={model.id}
                                                    className={`w-full px-4 py-3 text-left flex flex-col gap-1 rounded-xl border transition-all ${config.model === model.id ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                                    onClick={() => {
                                                        setConfig(prev => ({ ...prev, model: model.id }));
                                                        setActiveMenu(null);
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-sm font-semibold ${config.model === model.id ? 'text-indigo-400' : 'text-slate-200'}`}>
                                                            {model.label}
                                                        </span>
                                                        {config.model === model.id && (
                                                            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-zinc-500 leading-tight block">{model.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </MobileMenu>
                                ) : (
                                    <div
                                        className="absolute bottom-full mb-2 z-20"
                                        style={{ left: '0' }}
                                    >
                                        <div className="dropdown static w-64 animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-xl)' }}>
                                            {[
                                                { id: ModelType.NANO_BANANA, label: 'Nano Banana', desc: '极速生成，适合快速验证灵感' },
                                                { id: ModelType.NANO_BANANA_PRO, label: 'Nano Banana Pro', desc: '增强细节与构图，适合高质量预览' },
                                                { id: ModelType.IMAGEN_4, label: 'Imagen 4.0', desc: '谷歌最新旗舰，写实感与光影极佳' },
                                                { id: ModelType.IMAGEN_4_ULTRA, label: 'Imagen 4.0 Ultra', desc: '极致画质与分辨率，适合商业级输出' }
                                            ].map(model => (
                                                <button
                                                    key={model.id}
                                                    className={`w-full px-3 py-2.5 text-left flex flex-col gap-0.5 hover:bg-white/5 transition-colors ${config.model === model.id ? 'bg-white/5' : ''}`}
                                                    onClick={() => {
                                                        setConfig(prev => ({ ...prev, model: model.id }));
                                                        setActiveMenu(null);
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className={`text-xs font-medium ${config.model === model.id ? 'text-indigo-400' : 'text-slate-200'}`}>
                                                            {model.label}
                                                        </span>
                                                        {config.model === model.id && (
                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-zinc-500 leading-tight">{model.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="input-bar-actions flex items-center gap-2">
                        {/* Tools */}
                        <div className="relative">
                            <button
                                className={`input-bar-option group p-2 rounded-full transition-all ${config.enableGrounding ? 'bg-indigo-500/10' : 'bg-transparent hover:bg-white/5'}`}
                                onClick={() => toggleMenu('tools')}
                                title="工具与设置"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-colors ${config.enableGrounding ? 'text-indigo-400' : 'text-zinc-400 group-hover:text-indigo-400'}`}>
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                            </button>
                            {activeMenu === 'tools' && (
                                isMobile ? (
                                    <MobileMenu title="工具与设置" onClose={() => setActiveMenu(null)}>
                                        <button
                                            className={`w-full px-4 py-3 flex items-center justify-between rounded-xl border transition-all ${!config.model.includes('gemini') ? 'opacity-50 cursor-not-allowed bg-white/5 border-white/5' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                                            onClick={() => {
                                                if (config.model.includes('gemini')) {
                                                    setConfig(prev => ({ ...prev, enableGrounding: !prev.enableGrounding }));
                                                } else {
                                                    alert("Grounding 仅支持 Gemini 系列模型");
                                                }
                                            }}
                                        >
                                            <div className="flex flex-col items-start gap-1">
                                                <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                                    </svg>
                                                    Grounding with Google Search
                                                </div>
                                                <div className="text-xs text-zinc-500">使用谷歌搜索优化生成结果</div>
                                            </div>

                                            <div className={`w-10 h-6 rounded-full relative transition-colors ${config.enableGrounding ? 'bg-indigo-500' : 'bg-zinc-700'}`}>
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${config.enableGrounding ? 'left-5' : 'left-1'}`} />
                                            </div>
                                        </button>
                                    </MobileMenu>
                                ) : (
                                    <div
                                        className="absolute bottom-full mb-2 z-20"
                                        style={{ left: '50%', transform: 'translateX(-50%)' }}
                                    >
                                        <div className="dropdown static w-64 animate-scaleIn origin-bottom p-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                            <div className="text-[10px] font-bold text-zinc-500 px-2 py-1 uppercase tracking-wider">Tools</div>

                                            <button
                                                className={`w-full px-2 py-2 flex items-center justify-between rounded-lg hover:bg-white/5 transition-colors ${!config.model.includes('gemini') ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                onClick={() => {
                                                    if (config.model.includes('gemini')) {
                                                        setConfig(prev => ({ ...prev, enableGrounding: !prev.enableGrounding }));
                                                    } else {
                                                        alert("Grounding 仅支持 Gemini 系列模型");
                                                    }
                                                }}
                                            >
                                                <div className="flex flex-col items-start gap-0.5">
                                                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                                        </svg>
                                                        Grounding with Google Search
                                                    </div>
                                                    <div className="text-[10px] text-zinc-500">使用谷歌搜索优化生成结果</div>
                                                </div>

                                                <div className={`w-8 h-4 rounded-full relative transition-colors ${config.enableGrounding ? 'bg-indigo-500' : 'bg-zinc-700'}`}>
                                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${config.enableGrounding ? 'left-4.5' : 'left-0.5'}`} style={{ left: config.enableGrounding ? '18px' : '2px' }} />
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Parallel Count */}
                        <div className="relative">
                            <button
                                className="input-bar-option group p-2 rounded-full bg-transparent hover:bg-white/5 transition-all"
                                onClick={() => toggleMenu('count')}
                                title="生成数量"
                            >
                                <div className="flex items-center gap-1">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-indigo-400 transition-colors">
                                        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                                        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                                    </svg>
                                    <span className="text-xs font-medium text-zinc-400 group-hover:text-indigo-400">x{config.parallelCount}</span>
                                </div>
                            </button>
                            {activeMenu === 'count' && (
                                isMobile ? (
                                    <MobileMenu title="选择生成数量" onClose={() => setActiveMenu(null)}>
                                        <div className="flex gap-2 justify-center">
                                            {[1, 2, 3, 4].map(num => (
                                                <button
                                                    key={num}
                                                    className={`flex-1 p-3 rounded-lg border text-base font-bold transition-all ${config.parallelCount === num
                                                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                                                        : 'bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10'
                                                        }`}
                                                    onClick={() => {
                                                        setConfig(prev => ({ ...prev, parallelCount: num }));
                                                        setActiveMenu(null);
                                                    }}
                                                >
                                                    {num}
                                                </button>
                                            ))}
                                        </div>
                                    </MobileMenu>
                                ) : (
                                    <div
                                        className="absolute bottom-full mb-2 z-20"
                                        style={{ left: '50%', transform: 'translateX(-50%)' }}
                                    >
                                        <div className="dropdown static w-20 animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                            {[1, 2, 3, 4].map(num => (
                                                <button
                                                    key={num}
                                                    className={`dropdown-item ${config.parallelCount === num ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setConfig(prev => ({ ...prev, parallelCount: num }));
                                                        setActiveMenu(null);
                                                    }}
                                                    style={{ color: config.parallelCount === num ? 'var(--accent-indigo-light)' : 'var(--text-secondary)' }}
                                                >
                                                    x{num}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Upload Button */}
                        <button
                            className="input-bar-option group p-2 rounded-full bg-transparent hover:bg-white/5 transition-all"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={config.referenceImages.length >= 5}
                            title="上传参考图"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-indigo-400 transition-colors">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </button>

                        {/* Send Button */}
                        <div className="w-[1px] h-6 bg-white/10 mx-1"></div>

                        <button
                            onClick={onGenerate}
                            disabled={!config.prompt}
                            className={`input-bar-send ${isGenerating ? 'sending' : ''}`}
                            style={{
                                background: 'var(--gradient-primary)',
                                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                                border: 'none'
                            }}
                        >
                            {isGenerating ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="animate-spin text-white">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
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
            </div >

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept="image/*"
                onChange={(e) => e.target.files && processFiles(e.target.files)}
            />
        </div >
    );
};

export default PromptBar;
