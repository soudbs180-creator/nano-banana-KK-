import React, { useRef, useState, useCallback, useEffect } from 'react';
import { GenerationConfig, AspectRatio, ImageSize, ModelType, ReferenceImage } from '../types';
// Lucide icons replaced with SVGs

interface PromptBarProps {
    config: GenerationConfig;
    setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
    onGenerate: () => void;
    isGenerating: boolean;
    onFilesDrop?: (files: File[]) => void;
    activeSourceImage?: { id: string; url: string; prompt: string } | null;
    onClearSource?: () => void;
}

const PromptBar: React.FC<PromptBarProps> = ({ config, setConfig, onGenerate, isGenerating, onFilesDrop, activeSourceImage, onClearSource }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

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
            className={`input-bar ${isDragging ? 'ring-2 ring-indigo-500' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-500/20 backdrop-blur-md rounded-3xl flex items-center justify-center animate-fadeIn pointer-events-none">
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
                {/* Continue from Image Banner */}
                {activeSourceImage && (
                    <div className="flex items-center gap-3 px-3 py-2 mb-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <img
                            src={activeSourceImage.url}
                            alt="Source"
                            className="w-10 h-10 object-cover rounded-lg border border-amber-500/30"
                        />
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-amber-400 font-medium">从此图继续创作</div>
                            <div className="text-xs text-zinc-400 truncate">{activeSourceImage.prompt}</div>
                        </div>
                        <button
                            onClick={onClearSource}
                            className="w-6 h-6 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Quick Options Row */}
                <div className="input-bar-options">
                    {/* Aspect Ratio - Clean Icon */}
                    <div className="relative">
                        <button
                            className="input-bar-option group"
                            onClick={() => toggleMenu('ratio')}
                            title="宽高比"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-indigo-400 transition-colors">
                                <rect x="3" y="5" width="18" height="14" rx="2" />
                            </svg>
                            <span className="text-xs">{config.aspectRatio}</span>
                        </button>
                        {activeMenu === 'ratio' && (
                            <div
                                className="absolute bottom-full mb-2 z-20"
                                style={{ left: '50%', transform: 'translateX(-50%)' }}
                            >
                                <div className="dropdown static animate-scaleIn origin-bottom">
                                    {[
                                        AspectRatio.SQUARE,
                                        AspectRatio.STANDARD_2_3,
                                        AspectRatio.STANDARD_3_2,
                                        AspectRatio.PORTRAIT_3_4,
                                        AspectRatio.LANDSCAPE_4_3,
                                        AspectRatio.PORTRAIT_9_16,
                                        AspectRatio.LANDSCAPE_16_9,
                                        AspectRatio.LANDSCAPE_21_9
                                    ].map(ratio => (
                                        <button
                                            key={ratio}
                                            className={`dropdown-item ${config.aspectRatio === ratio ? 'active' : ''}`}
                                            onClick={() => {
                                                setConfig(prev => ({ ...prev, aspectRatio: ratio }));
                                                setActiveMenu(null);
                                            }}
                                        >
                                            {ratio}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Image Size - Clean Icon */}
                    {(config.model === ModelType.NANO_BANANA_PRO || config.model === ModelType.IMAGEN_4 || config.model === ModelType.IMAGEN_4_ULTRA) && (
                        <div className="relative">
                            <button
                                className="input-bar-option group"
                                onClick={() => toggleMenu('size')}
                                title="分辨率"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-indigo-400 transition-colors">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                </svg>
                                <span className="text-xs">{config.imageSize}</span>
                            </button>
                            {activeMenu === 'size' && (
                                <div
                                    className="absolute bottom-full mb-2 z-20"
                                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                                >
                                    <div className="dropdown static animate-scaleIn origin-bottom">
                                        {[ImageSize.SIZE_1K, ImageSize.SIZE_2K, ImageSize.SIZE_4K].map(size => (
                                            <button
                                                key={size}
                                                className={`dropdown-item ${config.imageSize === size ? 'active' : ''}`}
                                                onClick={() => {
                                                    setConfig(prev => ({ ...prev, imageSize: size }));
                                                    setActiveMenu(null);
                                                }}
                                            >
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Reference Images */}
                {config.referenceImages.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                        {config.referenceImages.map(img => (
                            <div key={img.id} className="relative group">
                                <img
                                    src={`data:${img.mimeType};base64,${img.data}`}
                                    className="w-12 h-12 object-cover rounded-lg border border-white/10"
                                    alt="Reference"
                                />
                                <button
                                    onClick={() => removeReferenceImage(img.id)}
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                    className="input-bar-textarea"
                    rows={1}
                />

                {/* Footer */}
                <div className="input-bar-footer">
                    {/* Left: Model */}
                    <div className="flex items-center gap-2">
                        {/* Model Selector */}
                        <div className="relative">
                            <button
                                className="input-bar-model"
                                onClick={() => toggleMenu('model')}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={config.model === ModelType.NANO_BANANA ? 'text-blue-400' : 'text-yellow-500'}>
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                                <span className="text-xs flex-1 text-center truncate px-1">
                                    {config.model === ModelType.NANO_BANANA && 'Nano Banana'}
                                    {config.model === ModelType.NANO_BANANA_PRO && 'Nano Banana Pro'}
                                    {config.model === ModelType.IMAGEN_4 && 'Imagen 4.0'}
                                    {config.model === ModelType.IMAGEN_4_ULTRA && 'Imagen 4.0 Ultra'}
                                </span>
                            </button>
                            {activeMenu === 'model' && (
                                <div
                                    className="absolute bottom-full mb-2 z-20"
                                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                                >
                                    <div className="dropdown static w-64 animate-scaleIn origin-bottom">
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
                            )}
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="input-bar-actions">
                        {/* Parallel Count - Clean Icon */}
                        <div className="relative">
                            <button
                                className="input-bar-option group"
                                onClick={() => toggleMenu('count')}
                                title="生成数量"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-indigo-400 transition-colors">
                                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                                </svg>
                                <span className="text-xs">x{config.parallelCount}</span>
                            </button>
                            {activeMenu === 'count' && (
                                <div
                                    className="absolute bottom-full mb-2 z-20"
                                    style={{ left: '50%', transform: 'translateX(-50%)' }}
                                >
                                    <div className="dropdown static w-20 animate-scaleIn origin-bottom">
                                        {[1, 2, 3, 4].map(num => (
                                            <button
                                                key={num}
                                                className={`dropdown-item ${config.parallelCount === num ? 'active' : ''}`}
                                                onClick={() => {
                                                    setConfig(prev => ({ ...prev, parallelCount: num }));
                                                    setActiveMenu(null);
                                                }}
                                            >
                                                x{num}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Upload Button - Clean Icon */}
                        <button
                            className="input-bar-option group"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={config.referenceImages.length >= 5}
                            title="上传参考图"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-indigo-400 transition-colors">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </button>

                        {/* Send Button - Elegant Design */}
                        <button
                            onClick={onGenerate}
                            disabled={!config.prompt}
                            className={`input-bar-send ${isGenerating ? 'sending' : ''}`}
                        >
                            {isGenerating ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
                                </svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="send-icon">
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
