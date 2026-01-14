'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { GenerationConfig, AspectRatio, ImageSize, ModelType, ReferenceImage } from '@/types';
import {
    ArrowUp,
    ImagePlus,
    X,
    Loader2,
    ChevronDown,
    ChevronUp,
    Zap,
    Settings2,
    Maximize2,
    Minimize2,
    Ratio
} from 'lucide-react';

interface PromptBarProps {
    config: GenerationConfig;
    setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
    onGenerate: () => void;
    isGenerating: boolean;
    onFilesDrop?: (files: File[]) => void;
    // For drag and drop source image
    activeSourceImage?: { id: string; url: string; prompt: string } | null;
    onClearSource?: () => void;
}

const PromptBar: React.FC<PromptBarProps> = ({
    config,
    setConfig,
    onGenerate,
    isGenerating,
    onFilesDrop,
    activeSourceImage,
    onClearSource
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    // Auto-resize textarea
    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setConfig(prev => ({ ...prev, prompt: e.target.value }));
        e.target.style.height = 'auto'; // Reset height
        e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
    }, [setConfig]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (config.prompt.trim() && !isGenerating) {
                onGenerate();
            }
        }
    };

    const processFiles = useCallback((files: FileList | null) => {
        if (!files) return;

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

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [config.referenceImages, setConfig]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        processFiles(e.target.files);
    };

    const toggleMenu = useCallback((menu: string) => {
        setActiveMenu(prev => prev === menu ? null : menu);
    }, []);

    const removeReferenceImage = useCallback((id: string) => {
        setConfig(prev => ({
            ...prev,
            referenceImages: prev.referenceImages.filter(img => img.id !== id)
        }));
    }, [setConfig]);

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.menu-trigger') &&
                !(e.target as HTMLElement).closest('.menu-dropdown')) {
                setActiveMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Placeholder for other settings
    const aspectRatios = [
        { label: '1:1 Square', value: AspectRatio.SQUARE, icon: <div className="w-4 h-4 border-2 border-current rounded-sm" /> },
        { label: '16:9 Landscape', value: AspectRatio.LANDSCAPE_16_9, icon: <div className="w-6 h-3.5 border-2 border-current rounded-sm" /> },
        { label: '9:16 Portrait', value: AspectRatio.PORTRAIT_9_16, icon: <div className="w-3.5 h-6 border-2 border-current rounded-sm" /> },
    ];

    return (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl z-40 px-4 animate-slideUp">
            <div className="glass-panel rounded-3xl p-2 transition-all duration-300 relative shadow-2xl ring-1 ring-white/10 group-hover:ring-white/20">

                {/* Reference Images Preview Area */}
                {(config.referenceImages.length > 0 || activeSourceImage) && (
                    <div className="flex gap-2 px-2 pt-2 pb-2 overflow-x-auto scrollbar-hide mb-2 border-b border-white/5">
                        {config.referenceImages.map((img) => (
                            <div key={img.id} className="relative group/image flex-shrink-0">
                                <img
                                    src={`data:${img.mimeType};base64,${img.data}`}
                                    alt="Reference"
                                    className="w-14 h-14 rounded-lg object-cover border border-white/10 shadow-sm"
                                />
                                <button
                                    onClick={() => removeReferenceImage(img.id)}
                                    className="absolute -top-1.5 -right-1.5 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover/image:opacity-100 transition-all scale-90 hover:scale-100 shadow-md"
                                >
                                    <X size={10} strokeWidth={3} />
                                </button>
                            </div>
                        ))}

                        {/* Dragged Source Image */}
                        {activeSourceImage && (
                            <div className="relative group/image flex-shrink-0 animate-fadeIn">
                                <img
                                    src={activeSourceImage.url}
                                    alt="Source"
                                    className="w-14 h-14 rounded-lg object-cover border-2 border-primary shadow-lg shadow-primary/20"
                                />
                                <div className="absolute inset-0 bg-primary/10 rounded-lg pointer-events-none" />
                                <button
                                    onClick={onClearSource}
                                    className="absolute -top-1.5 -right-1.5 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover/image:opacity-100 transition-all scale-90 hover:scale-100 shadow-md"
                                >
                                    <X size={10} strokeWidth={3} />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-end gap-2 pl-2">
                    {/* Add Image Button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-2xl transition-all duration-200 flex-shrink-0"
                        title="Add reference image"
                    >
                        <ImagePlus size={22} strokeWidth={1.5} />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        accept="image/*"
                        multiple
                    />

                    {/* Aspect Ratio Menu */}
                    <div className="relative">
                        <button
                            className={`menu-trigger p-3 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-2xl transition-all duration-200 ${activeMenu === 'ratio' ? 'bg-white/10 text-foreground' : ''}`}
                            onClick={() => toggleMenu('ratio')}
                            title="Aspect Ratio"
                        >
                            <Ratio size={22} strokeWidth={1.5} />
                        </button>

                        {activeMenu === 'ratio' && (
                            <div className="menu-dropdown absolute bottom-full left-0 mb-3 p-1.5 bg-zinc-900/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl flex flex-col gap-1 w-48 animate-slideUp overflow-hidden ring-1 ring-white/5">
                                {aspectRatios.map((ratio) => (
                                    <button
                                        key={ratio.value}
                                        onClick={() => {
                                            setConfig(prev => ({ ...prev, aspectRatio: ratio.value }));
                                            setActiveMenu(null);
                                        }}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${config.aspectRatio === ratio.value
                                                ? 'bg-primary/20 text-primary font-medium'
                                                : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                                            }`}
                                    >
                                        {ratio.icon}
                                        {ratio.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Main Settings Menu */}
                    <div className="relative">
                        <button
                            className={`menu-trigger p-3 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-2xl transition-all duration-200 ${activeMenu === 'settings' ? 'bg-white/10 text-foreground' : ''}`}
                            onClick={() => toggleMenu('settings')}
                            title="Advanced Settings"
                        >
                            <Settings2 size={22} strokeWidth={1.5} />
                        </button>

                        {activeMenu === 'settings' && (
                            <div className="menu-dropdown absolute bottom-full left-0 mb-3 p-4 bg-zinc-900/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl w-72 animate-slideUp ring-1 ring-white/5">
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Model</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-white/5">
                                            <button
                                                onClick={() => setConfig(prev => ({ ...prev, model: ModelType.GEMINI_PRO }))}
                                                className={`py-2 text-xs font-medium rounded-lg transition-all ${config.model === ModelType.GEMINI_PRO
                                                        ? 'bg-primary text-primary-foreground shadow-lg'
                                                        : 'text-zinc-500 hover:text-zinc-300'
                                                    }`}
                                            >
                                                PRO
                                            </button>
                                            <button
                                                onClick={() => setConfig(prev => ({ ...prev, model: ModelType.GEMINI_FLASH }))}
                                                className={`py-2 text-xs font-medium rounded-lg transition-all ${config.model === ModelType.GEMINI_FLASH
                                                        ? 'bg-emerald-600 text-white shadow-lg'
                                                        : 'text-zinc-500 hover:text-zinc-300'
                                                    }`}
                                            >
                                                FLASH
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Parallel Count</span>
                                            <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded text-zinc-300">{config.parallelCount}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="4"
                                            value={config.parallelCount}
                                            onChange={(e) => setConfig(prev => ({ ...prev, parallelCount: parseInt(e.target.value) }))}
                                            className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all"
                                        />
                                        <div className="flex justify-between text-[10px] text-zinc-600 mt-2 px-1">
                                            <span>1</span>
                                            <span>4</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Prompt Input Area */}
                    <div className="flex-1 relative mx-1">
                        <textarea
                            ref={textareaRef}
                            value={config.prompt}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe your imagination..."
                            className="w-full bg-transparent text-foreground placeholder-zinc-500 text-[15px] resize-none focus:outline-none py-3 px-2 max-h-[200px] scrollbar-hide leading-relaxed"
                            rows={1}
                            style={{ minHeight: '48px' }}
                        />
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={onGenerate}
                        disabled={isGenerating || !config.prompt.trim()}
                        className={`
                            group relative p-3 rounded-2xl flex items-center justify-center transition-all duration-300 mb-1 mr-1
                            ${isGenerating
                                ? 'bg-zinc-800 cursor-not-allowed text-zinc-500'
                                : config.prompt.trim()
                                    ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 scale-100 hover:scale-105 active:scale-95'
                                    : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                            }
                        `}
                    >
                        {isGenerating ? (
                            <Loader2 size={24} className="animate-spin" />
                        ) : (
                            <ArrowUp size={24} className={`transition-transform duration-300 ${config.prompt.trim() ? 'group-hover:-translate-y-0.5 group-hover:translate-x-0.5' : ''}`} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PromptBar;
