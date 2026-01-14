import React, { useRef, useState, useCallback, useEffect } from 'react';
import { GenerationConfig, AspectRatio, ImageSize, ModelType, ReferenceImage } from '../types';
import {
    ArrowUp,
    ImagePlus,
    X,
    Loader2,
    ChevronDown,
    ChevronUp,
    Sparkles,
    Zap,
    Image as ImageIcon
} from 'lucide-react';

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
                <div className="absolute inset-0 z-50 bg-indigo-500/20 backdrop-blur-sm rounded-3xl flex items-center justify-center animate-fadeIn pointer-events-none">
                    <div className="flex flex-col items-center gap-2 text-white drop-shadow-lg">
                        <ImagePlus size={32} className="text-indigo-400" />
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
                            <X size={12} />
                        </button>
                    </div>
                )}

                {/* Quick Options Row */}
                <div className="input-bar-options">
                    {/* Aspect Ratio */}
                    <div className="relative">
                        <button
                            className="input-bar-option"
                            onClick={() => toggleMenu('ratio')}
                        >
                            <span>{config.aspectRatio}</span>
                            <ChevronDown size={12} className="opacity-50" />
                        </button>
                        {activeMenu === 'ratio' && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20">
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

                    {/* Image Size (Pro only) */}
                    {config.model === ModelType.PRO_QUALITY && (
                        <div className="relative">
                            <button
                                className="input-bar-option"
                                onClick={() => toggleMenu('size')}
                            >
                                <span>{config.imageSize}</span>
                                <ChevronDown size={12} className="opacity-50" />
                            </button>
                            {activeMenu === 'size' && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20">
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
                                    <X size={10} className="text-white" />
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
                    placeholder="描述你想要生成的图片..."
                    className="input-bar-textarea"
                    rows={1}
                />

                {/* Footer */}
                <div className="input-bar-footer">
                    {/* Left: Mode & Model */}
                    <div className="flex items-center gap-2">
                        {/* Mode Icon */}
                        <div className="w-6 h-6 flex items-center justify-center rounded-md bg-zinc-800 text-zinc-400">
                            <ImageIcon size={14} />
                        </div>

                        <span className="text-xs text-zinc-500">图片生成模式</span>

                        <div className="w-px h-3 bg-zinc-700 mx-1" />

                        {/* Model Selector */}
                        <div className="relative">
                            <button
                                className="input-bar-model"
                                onClick={() => toggleMenu('model')}
                            >
                                <Zap size={12} className={config.model === ModelType.PRO_QUALITY ? 'text-yellow-500' : 'text-blue-400'} />
                                <span className="text-xs truncate max-w-[120px]">
                                    {config.model === ModelType.PRO_QUALITY ? 'Nano Banana Pro (🍌 Pro)' : 'Nano Banana Flash'}
                                </span>
                                <ChevronUp size={12} className="opacity-50" />
                            </button>
                            {activeMenu === 'model' && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20">
                                    <div className="dropdown static w-56 animate-scaleIn origin-bottom">
                                        <button
                                            className={`dropdown-item ${config.model === ModelType.NANO_BANANA ? 'active' : ''}`}
                                            onClick={() => {
                                                setConfig(prev => ({ ...prev, model: ModelType.NANO_BANANA }));
                                                setActiveMenu(null);
                                            }}
                                        >
                                            <Zap size={14} className="text-blue-400" />
                                            <div>
                                                <div className="font-medium text-zinc-200">Nano Banana Flash</div>
                                                <div className="text-[10px] text-zinc-500">快速生成</div>
                                            </div>
                                        </button>
                                        <button
                                            className={`dropdown-item ${config.model === ModelType.PRO_QUALITY ? 'active' : ''}`}
                                            onClick={() => {
                                                setConfig(prev => ({ ...prev, model: ModelType.PRO_QUALITY }));
                                                setActiveMenu(null);
                                            }}
                                        >
                                            <Zap size={14} className="text-yellow-500" />
                                            <div>
                                                <div className="font-medium text-zinc-200">Nano Banana Pro</div>
                                                <div className="text-[10px] text-zinc-500">高质量，较慢</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="input-bar-actions">
                        {/* Parallel Count */}
                        <div className="relative">
                            <button
                                className="input-bar-option"
                                onClick={() => toggleMenu('count')}
                            >
                                <span>x{config.parallelCount}</span>
                                <ChevronDown size={12} className="opacity-50" />
                            </button>
                            {activeMenu === 'count' && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20">
                                    <div className="dropdown static w-16 animate-scaleIn origin-bottom">
                                        {[1, 2, 3, 4].map(num => (
                                            <button
                                                key={num}
                                                className={`dropdown-item text-center ${config.parallelCount === num ? 'active' : ''}`}
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

                        {/* Upload Button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="toolbar-btn"
                            title="上传参考图"
                        >
                            <ImagePlus size={16} />
                        </button>

                        {/* Send Button */}
                        <button
                            onClick={onGenerate}
                            disabled={!config.prompt || isGenerating}
                            className="input-bar-send"
                        >
                            {isGenerating ? (
                                <Loader2 size={18} className="loading-spinner" />
                            ) : (
                                <ArrowUp size={18} />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept="image/*"
                onChange={(e) => e.target.files && processFiles(e.target.files)}
            />
        </div>
    );
};

export default PromptBar;
