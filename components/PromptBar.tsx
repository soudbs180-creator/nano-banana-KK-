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
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl z-40 px-4">
            <div className="bg-[#18181b]/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-2 transition-all duration-300">

                {/* Reference Images Preview Area */}
                {(config.referenceImages.length > 0 || activeSourceImage) && (
                    <div className="flex gap-2 px-2 pt-2 pb-1 overflow-x-auto scrollbar-hide mb-2 border-b border-white/5">
                        {config.referenceImages.map((img) => (
                            <div key={img.id} className="relative group flex-shrink-0">
                                <img
                                    src={`data:${img.mimeType};base64,${img.data}`}
                                    alt="Reference"
                                    className="w-12 h-12 rounded-lg object-cover border border-white/10"
                                />
                                <button
                                    onClick={() => removeReferenceImage(img.id)}
                                    className="absolute -top-1 -right-1 p-0.5 bg-zinc-800 rounded-full text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        ))}

                        {/* Dragged Source Image */}
                        {activeSourceImage && (
                            <div className="relative group flex-shrink-0 animate-fadeIn">
                                <img
                                    src={activeSourceImage.url}
                                    alt="Source"
                                    className="w-12 h-12 rounded-lg object-cover border border-indigo-500/50 ring-1 ring-indigo-500"
                                />
                                <div className="absolute inset-0 bg-indigo-500/10 rounded-lg pointer-events-none" />
                                <button
                                    onClick={onClearSource}
                                    className="absolute -top-1 -right-1 p-0.5 bg-zinc-800 rounded-full text-zinc-400 hover:text-white"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-end gap-2">
                    {/* Add Image Button */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0"
                        title="Add reference image"
                    >
                        <ImagePlus size={20} />
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
                            className={`menu-trigger p-3 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors ${activeMenu === 'ratio' ? 'bg-white/10 text-white' : ''}`}
                            onClick={() => toggleMenu('ratio')}
                            title="Aspect Ratio"
                        >
                            <Ratio size={20} />
                        </button>

                        {activeMenu === 'ratio' && (
                            <div className="menu-dropdown absolute bottom-full left-0 mb-2 p-2 bg-[#18181b] border border-white/10 rounded-xl shadow-xl flex flex-col gap-1 w-40 animate-slideUp">
                                {aspectRatios.map((ratio) => (
                                    <button
                                        key={ratio.value}
                                        onClick={() => {
                                            setConfig(prev => ({ ...prev, aspectRatio: ratio.value }));
                                            setActiveMenu(null);
                                        }}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${config.aspectRatio === ratio.value ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
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
                            className={`menu-trigger p-3 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors ${activeMenu === 'settings' ? 'bg-white/10 text-white' : ''}`}
                            onClick={() => toggleMenu('settings')}
                            title="Advanced Settings"
                        >
                            <Settings2 size={20} />
                        </button>

                        {activeMenu === 'settings' && (
                            <div className="menu-dropdown absolute bottom-full left-0 mb-2 p-4 bg-[#18181b] border border-white/10 rounded-2xl shadow-xl w-64 animate-slideUp">
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-medium text-zinc-400">Model</span>
                                        </div>
                                        <div className="flex gap-1 p-1 bg-black/20 rounded-lg">
                                            <button
                                                onClick={() => setConfig(prev => ({ ...prev, model: ModelType.GEMINI_PRO }))}
                                                className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${config.model === ModelType.GEMINI_PRO ? 'bg-indigo-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                            >
                                                PRO
                                            </button>
                                            <button
                                                onClick={() => setConfig(prev => ({ ...prev, model: ModelType.GEMINI_FLASH }))}
                                                className={`flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all ${config.model === ModelType.GEMINI_FLASH ? 'bg-emerald-500 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                                            >
                                                FLASH
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-medium text-zinc-400">Parallel Gen</span>
                                            <span className="text-xs text-zinc-500">{config.parallelCount}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="1"
                                            max="4"
                                            value={config.parallelCount}
                                            onChange={(e) => setConfig(prev => ({ ...prev, parallelCount: parseInt(e.target.value) }))}
                                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Prompt Input Area */}
                    <div className="flex-1 relative">
                        <textarea
                            ref={textareaRef}
                            value={config.prompt}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe your imagination... (Enter to generate)"
                            className="w-full bg-transparent text-zinc-200 placeholder-zinc-500 text-sm resize-none focus:outline-none py-3 px-2 max-h-[160px] scrollbar-hide"
                            rows={1}
                            style={{ minHeight: '44px' }}
                        />
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={onGenerate}
                        disabled={isGenerating || !config.prompt.trim()}
                        className={`
                            p-3 rounded-full flex items-center justify-center transition-all duration-300
                            ${isGenerating
                                ? 'bg-zinc-800 cursor-not-allowed text-zinc-500'
                                : config.prompt.trim()
                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                    : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                            }
                        `}
                    >
                        {isGenerating ? (
                            <Loader2 size={20} className="animate-spin" />
                        ) : (
                            <ArrowUp size={20} className={config.prompt.trim() ? 'animate-pulse' : ''} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PromptBar;
