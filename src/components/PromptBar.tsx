import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { GenerationConfig, AspectRatio, ImageSize, GenerationMode, ModelType } from '../types';
import { modelRegistry, ActiveModel } from '../services/modelRegistry';
import { keyManager, getModelMetadata } from '../services/keyManager'; // Added getter
import { getModelCapabilities, modelSupportsGrounding, getModelDisplayInfo, getModelDescription, autoDetectImageSize } from '../services/modelCapabilities';
import { getModelBadgeInfo, getProviderBadgeColor } from '../utils/modelBadge';
import { calculateImageHash } from '../utils/imageUtils';
import { saveImage, getImage } from '../services/imageStorage'; // [NEW] Import getImage
import { fileSystemService } from '../services/fileSystemService'; // 🚀 参考图持久化
import { notify } from '../services/notificationService';
import ImageOptionsPanel from './ImageOptionsPanel';
import VideoOptionsPanel from './VideoOptionsPanel';
import ImagePreview from './ImagePreview';
import { sortModels, toggleModelPin, getPinnedModels, filterAndSortModels } from '../utils/modelSorting';
import { X, Search, LayoutDashboard, Key, DollarSign, HardDrive, ScrollText, ChevronRight, ChevronUp, Activity, AlertTriangle, Plus, Trash2, FolderOpen, Globe, Loader2, RefreshCw, Copy, Check, Pause, Play, Zap, Mic, Camera, Brain, Video } from 'lucide-react'; // [NEW] Mobile Icons
import { InpaintModal } from './InpaintModal';
import { BUILTIN_PROMPT_LIBRARY, PromptLibraryItem } from '../config/promptLibrary';

// [FIX] Robust Image Component that self-heals from Storage if data is missing
const ReferenceThumbnail: React.FC<{
    image: { id: string, data?: string, mimeType?: string, storageId?: string };
    onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ image, onClick }) => {
    const [data, setData] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        // 🚀 [Fix] If parent provided data and it's NOT a blob URL, use it directly
        // Blob URLs can expire after page refresh, so we should always try to recover from IDB
        if (image.data && !image.data.startsWith('blob:')) {
            setData(image.data);
            setLoading(false);
            setError(false);
            return;
        }

        // If no storageId, try using data directly (even if blob) or mark as error
        if (!image.storageId) {
            if (image.data) {
                setData(image.data);
                setLoading(false);
                setError(false);
            } else {
                setLoading(false);
                setError(true);
            }
            return;
        }

        // Try to recover from IDB
        let active = true;
        setLoading(true);
        setError(false);

        getImage(image.storageId)
            .then(cached => {
                if (active) {
                    if (cached) {
                        setData(cached);
                    } else if (image.data) {
                        // Fallback to original data if IDB has nothing
                        setData(image.data);
                    } else {
                        setError(true); // truly missing
                    }
                    setLoading(false);
                }
            })
            .catch(() => {
                if (active) {
                    if (image.data) {
                        setData(image.data); // Fallback
                    } else {
                        setError(true);
                    }
                    setLoading(false);
                }
            });

        return () => { active = false; };
    }, [image.data, image.storageId]);

    if (error) {
        return (
            <div className="w-12 h-12 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center justify-center flex-col gap-0.5" title="图片加载失败">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 opacity-70">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            </div>
        );
    }

    if (loading || !data) {
        return (
            <div className="w-12 h-12 rounded-lg border border-white/10 shadow-sm bg-[var(--bg-tertiary)] flex items-center justify-center">
                <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
        );
    }

    // Robust Src Construction
    const src = (data.startsWith('data:') || data.startsWith('blob:')) ? data : `data:${image.mimeType || 'image/png'};base64,${data}`;

    return (
        <div
            onClick={onClick}
            className="w-12 h-12 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
            title="点击放大查看"
        >
            <img
                src={src}
                className="w-full h-full object-cover"
                alt="Reference"
            />
        </div>
    );
};

// 计算比例图标的尺寸
const getRatioDimensions = (ratio: AspectRatio): { width: number; height: number } => {
    const maxSize = 14;

    const ratioMap: Record<string, [number, number]> = {
        [AspectRatio.SQUARE]: [1, 1],
        [AspectRatio.PORTRAIT_9_16]: [9, 16],
        [AspectRatio.LANDSCAPE_16_9]: [16, 9],
        [AspectRatio.PORTRAIT_3_4]: [3, 4],
        [AspectRatio.LANDSCAPE_4_3]: [4, 3],
        [AspectRatio.LANDSCAPE_3_2]: [3, 2],
        [AspectRatio.PORTRAIT_2_3]: [2, 3],
        [AspectRatio.LANDSCAPE_21_9]: [21, 9],
    };

    const [w, h] = ratioMap[ratio] || [1, 1];

    if (w > h) {
        return { width: maxSize, height: (maxSize * h) / w };
    } else {
        return { height: maxSize, width: (maxSize * w) / h };
    }
};

// 渲染比例图标
const getRatioIcon = (ratio: AspectRatio) => {
    const dims = getRatioDimensions(ratio);

    return (
        <div className="flex items-center justify-center" style={{ width: 14, height: 14 }}>
            <div
                className="border-[1.5px] border-current rounded-[2px]"
                style={{ width: dims.width, height: dims.height }}
            />
        </div>
    );
};

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
    onInteract?: () => void;
    onFocus?: () => void;  // 输入框获取焦点时调用
    onBlur?: () => void;   // 输入框失去焦点时调用
    onOpenMore?: () => void; // [NEW] Mobile More Menu
}

const PromptBar: React.FC<PromptBarProps> = ({ config, setConfig, onGenerate, isGenerating, onFilesDrop, activeSourceImage, onClearSource, onCancel, isMobile = false, onOpenSettings, onInteract, onFocus, onBlur, onOpenMore }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [modelSearch, setModelSearch] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, modelId: string } | null>(null);

    // [NEW] Model Settings Modal State
    const [modelSettingsModal, setModelSettingsModal] = useState<{ modelId: string; alias: string; description: string } | null>(null);

    // [NEW] Model Customizations (stored in localStorage)
    const [modelCustomizations, setModelCustomizations] = useState<Record<string, { alias?: string; description?: string }>>(() => {
        try {
            const stored = localStorage.getItem('kk_model_customizations');
            return stored ? JSON.parse(stored) : {};
        } catch { return {}; }
    });

    // Save model customizations to localStorage
    const saveModelCustomization = (modelId: string, alias: string, description: string) => {
        const newCustomizations = {
            ...modelCustomizations,
            [modelId]: { alias: alias.trim() || undefined, description: description.trim() || undefined }
        };
        // Clean up empty entries
        if (!newCustomizations[modelId].alias && !newCustomizations[modelId].description) {
            delete newCustomizations[modelId];
        }
        setModelCustomizations(newCustomizations);
        localStorage.setItem('kk_model_customizations', JSON.stringify(newCustomizations));
    };

    // [NEW] Drag-to-Reorder State
    const [dragSourceId, setDragSourceId] = useState<string | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

    // [NEW] Flying Animation State
    const [flyingImage, setFlyingImage] = useState<{
        x: number;
        y: number;
        url: string;
        targetX: number;
        targetY: number;
    } | null>(null);

    // [NEW] 参考图放大状态
    const [previewImage, setPreviewImage] = useState<{ url: string; originRect: DOMRect } | null>(null);
    const [inpaintImage, setInpaintImage] = useState<{ id: string; url: string } | null>(null); // [NEW] 局部重绘所需图像
    const refContainerRef = useRef<HTMLDivElement>(null);
    const optionsPanelRef = useRef<HTMLDivElement>(null); // [NEW] Ref for options panel

    // 状态：选项面板显示
    const [showOptionsPanel, setShowOptionsPanel] = useState(false);
    const [showPromptLibrary, setShowPromptLibrary] = useState(false);
    const [showPptOutlinePanel, setShowPptOutlinePanel] = useState(false);
    const [pptOutlineDraft, setPptOutlineDraft] = useState('');
    const [pptDragIndex, setPptDragIndex] = useState<number | null>(null);
    const [pptDropIndex, setPptDropIndex] = useState<number | null>(null);
    const [promptLibrarySearch, setPromptLibrarySearch] = useState('');
    const [promptLibraryCategory, setPromptLibraryCategory] = useState<'all' | PromptLibraryItem['category']>('all');
    const [favoritePromptIds, setFavoritePromptIds] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem('kk_prompt_library_favorites');
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [isInputAreaHovered, setIsInputAreaHovered] = useState(false); // Phase 3: hover state
    const [uploadingCount, setUploadingCount] = useState(0); // [NEW] Uploading indicator count

    // 🚀 [NEW] 模型手动锁定标识 - 解决更换 API 或模式后自动跳第一个的需求
    const [isModelManuallyLocked, setIsModelManuallyLocked] = useState<boolean>(() => {
        try {
            return localStorage.getItem('kk_model_manually_locked') === 'true';
        } catch { return false; }
    });

    const setModelManualLock = (locked: boolean) => {
        setIsModelManuallyLocked(locked);
        localStorage.setItem('kk_model_manually_locked', locked ? 'true' : 'false');
    };
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null); // 3-second hover delay timer
    const touchStartY = useRef<number | null>(null);

    // [NEW] Click outside to close options panel
    useEffect(() => {
        if (!showOptionsPanel) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Element;
            // Check if click is outside panel AND not on the toggle button itself
            if (optionsPanelRef.current && !optionsPanelRef.current.contains(target)) {
                // Find the toggle button by checking if target is within it or is the button
                const toggleButton = document.querySelector('[data-options-toggle]');
                if (toggleButton && (toggleButton.contains(target) || toggleButton === target)) {
                    // Click was on toggle button, let onClick handle it
                    return;
                }
                setShowOptionsPanel(false);
            }
        };

        // Add a small delay to prevent immediate closing from the toggle click
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showOptionsPanel]);

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    useEffect(() => {
        if (config.mode !== GenerationMode.PPT) {
            setShowPptOutlinePanel(false);
            return;
        }
        const slides = (config.pptSlides || []).map(s => String(s || '').trim()).filter(Boolean);
        if (slides.length > 0) {
            setPptOutlineDraft(slides.join('\n'));
            return;
        }
        const fromPrompt = (config.prompt || '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => line.replace(/^[-*\d.)、\s]+/, '').trim())
            .filter(Boolean);
        setPptOutlineDraft(fromPrompt.join('\n'));
    }, [config.mode, config.pptSlides, config.prompt]);

    // Cleanup hover timer on unmount
    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
            }
        };
    }, []);

    // Swipe Detection


    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        onInteract?.(); // General interaction
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartY.current === null) return;
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;

        // Swipe Up (Negative delta)
        if (deltaY < -20) {
            onInteract?.();
        }
        touchStartY.current = null;
    };

    // Dynamic Model State
    const [globalModels, setGlobalModels] = useState(keyManager.getGlobalModelList());


    useEffect(() => {
        const unsubscribeKeyManager = keyManager.subscribe(() => {
            const newModels = keyManager.getGlobalModelList();
            console.log('[PromptBar.keyManager订阅] 收到更新通知');
            console.log('[PromptBar.keyManager订阅] 新的模型列表:', newModels.map(m => ({ id: m.id, type: m.type })));
            setGlobalModels(newModels);
        });
        return () => {
            unsubscribeKeyManager();
        };
    }, []);

    // Get available models based on global list and current mode
    const availableModels = useMemo(() => {
        console.log('[PromptBar.availableModels] 开始计算');
        console.log('[PromptBar.availableModels] globalModels数量:', globalModels.length);
        console.log('[PromptBar.availableModels] globalModels:', globalModels.map(m => ({ id: m.id, type: m.type, name: m.name })));
        console.log('[PromptBar.availableModels] 当前mode:', config.mode);

        const step1 = globalModels.filter(m => m.type !== 'chat');
        console.log('[PromptBar.availableModels] 过滤chat后:', step1.length, step1.map(m => ({ id: m.id, type: m.type })));

        const step2 = step1.map(m => {
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
        });
        console.log('[PromptBar.availableModels] map后:', step2.length, step2.map(m => ({ id: m.id, type: m.type })));

        const result = step2.filter(m => {
            const type = m.type || 'image';
            const isImageLikeMode = config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT;
            // ✨ 支持多模态模型：image+chat 在 image 模式下也可用
            if (isImageLikeMode && type === 'image+chat') return true;
            if (config.mode === GenerationMode.VIDEO && type === 'image+chat') return false;
            if (config.mode === GenerationMode.PPT) return type === 'image';
            return type === config.mode;
        });

        console.log('[PromptBar.availableModels] 最终结果:', result.length, result.map(m => ({ id: m.id, type: m.type, label: m.label })));
        return result;
    }, [globalModels, config.mode]);

    const sortedAvailableModels = useMemo(() => {
        return filterAndSortModels(availableModels, '', modelCustomizations);
    }, [availableModels, modelCustomizations]);

    // 🚀 [增强版模型自动选择逻辑]
    // 逻辑：1. 如果当前选中的模型已失效，则必须重新选一个。
    //       2. 如果当前模式、列表发生了变化，且用户并未“手动锁定”模型，则默认跳到第一个（满足“优先顶置”需求）。
    useEffect(() => {
        if (sortedAvailableModels.length === 0) return;

        const currentModelValid = sortedAvailableModels.find(m => m.id === config.model);

        // 获取当前列表的首位模型 ID
        const firstModelId = sortedAvailableModels[0].id;

        // 执行自动切换的条件：
        // 1. 当前模型不再列表中（必须跳）。
        // 2. 或者：列表不为空，但用户并未手动锁定选择（API 或模式切换时自动回滚到第一个）。
        const shouldResetToFirst = !currentModelValid || (!isModelManuallyLocked && config.model !== firstModelId);

        if (shouldResetToFirst) {
            console.log('[PromptBar.autoSelect] 自动切换模型到列表首位:', firstModelId, { 原因: !currentModelValid ? '当前模型无效' : '列表更新且未锁定' });
            setConfig(prev => {
                const newModel = firstModelId;
                const newImageSize = autoDetectImageSize(newModel, prev.imageSize);
                return { ...prev, model: newModel, imageSize: newImageSize };
            });
        }
    }, [config.mode, sortedAvailableModels, isModelManuallyLocked, config.model, setConfig]);

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
        const newHeight = Math.max(36, Math.min(e.target.scrollHeight, 200));
        e.target.style.height = `${newHeight}px`;
    }, [setConfig]);

    // Auto-resize height when prompt changes (handles paste, select, clear)
    useEffect(() => {
        if (textareaRef.current) {
            // Reset to auto to get correct scrollHeight for shrinkage
            textareaRef.current.style.height = 'auto';

            if (config.prompt) {
                // detailed check: if it has content, expand up to max
                const newHeight = Math.max(36, Math.min(textareaRef.current.scrollHeight, 200));
                textareaRef.current.style.height = `${newHeight}px`;
            } else {
                // empty content - shrink to 1 row
                textareaRef.current.style.height = '36px';
            }
        }
    }, [config.prompt]);

    const processFiles = useCallback(async (files: FileList | File[]) => {
        // 🚀 [修复] 根据模型动态获取最大参考图数量
        const modelCaps = getModelCapabilities(config.model);
        const maxRefImages = modelCaps?.maxRefImages ?? 5; // 默认 5 张，Gemini 3 Pro 支持 10 张

        if (config.referenceImages.length >= maxRefImages) {
            notify.warning('参考图数量限制', `最多只能上传 ${maxRefImages} 张参考图`);
            return;
        }

        const remainingSlots = maxRefImages - config.referenceImages.length;
        const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
        // TODO: Video upload support for Video mode

        if (fileArray.length > remainingSlots) {
            notify.info('参考图已调整', `最多只能上传 ${maxRefImages} 张参考图，已自动忽略 ${fileArray.length - remainingSlots} 张`);
        }

        const filesToProcess = fileArray.slice(0, remainingSlots);
        if (filesToProcess.length === 0) return;

        setUploadingCount((prev) => prev + filesToProcess.length);

        try {
            // Process all files in parallel
            const newImages = await Promise.all(filesToProcess.map(async (file) => {
                return new Promise<{ id: string, storageId: string, mimeType: string, data: string } | null>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        const result = reader.result as string;
                        const matches = result.match(/^data:(.+);base64,(.+)$/);
                        if (matches) {
                            const mimeType = matches[1];
                            const data = matches[2];
                            const storageId = await calculateImageHash(data);

                            // 🚀 [FIX] 立即保存到 IndexedDB（使用正确格式）
                            // 🚀 [关键修复] 必须await等待保存完成，否则刷新时可能丢失
                            const fullDataUrl = `data:${mimeType};base64,${data}`;
                            try {
                                await saveImage(storageId, fullDataUrl);
                                console.log('[PromptBar] ✅ 参考图已保存到 IndexedDB:', storageId);
                            } catch (err) {
                                console.error("[PromptBar] ❌ Failed to save image to IndexedDB:", err);
                            }

                            // 🚀 [NEW] 同时保存到本地文件系统（如果已连接项目文件夹）
                            const handle = fileSystemService.getGlobalHandle();
                            if (handle) {
                                fileSystemService.saveReferenceImage(handle, storageId, data, mimeType).catch(err =>
                                    console.error("[PromptBar] Failed to save reference to file system:", err)
                                );
                            }

                            resolve({
                                id: Date.now() + Math.random().toString(),
                                storageId,
                                mimeType,
                                data
                            });
                        } else {
                            resolve(null);
                        }
                    };
                    reader.readAsDataURL(file);
                });
            }));

            const validImages = newImages.filter((img): img is NonNullable<typeof img> => img !== null);

            if (validImages.length > 0) {
                setConfig(prev => ({
                    ...prev,
                    referenceImages: [...prev.referenceImages, ...validImages]
                }));
            }
        } finally {
            setUploadingCount((prev) => Math.max(0, prev - filesToProcess.length));
        }
    }, [config.referenceImages, setConfig]);

    const toggleMenu = useCallback((menu: string) => {
        setShowOptionsPanel(false); // 关闭Options Panel
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
            // 始终允许发送新请求，即使正在生成中
            onGenerate();
        }
    }, [onGenerate]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles: File[] = [];
        let hasImage = false;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    imageFiles.push(file);
                    hasImage = true;
                }
            } else if (items[i].type === 'text/plain') {
                // 🚀 [NEW] Handle Image URL Paste
                items[i].getAsString((text) => {
                    const url = text.trim();
                    if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || url.startsWith('http')) {
                        // Optimistic check: looks like an image URL?
                        // Fetch it
                        fetch(url)
                            .then(res => {
                                if (!res.ok) throw new Error('Fetch failed');
                                const contentType = res.headers.get('content-type');
                                if (contentType && contentType.startsWith('image/')) {
                                    return res.blob();
                                }
                                throw new Error('Not an image');
                            })
                            .then(blob => {
                                const file = new File([blob], "pasted_image.png", { type: blob.type });
                                processFiles([file]);
                            })
                            .catch(err => {
                                // Not an image URL, just normal text. 
                                // We don't interfere with normal text paste if it fails.
                            });
                    }
                });
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault();
            // Convert to FileList-like object
            const dt = new DataTransfer();
            imageFiles.forEach(f => dt.items.add(f));
            processFiles(dt.files);
        }
    }, [processFiles]);

    const dragCounter = useRef(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragSafetyTimer = useRef<NodeJS.Timeout | null>(null);

    // [FIX] 4秒无操作自动复位（防止卡顿）
    const resetDragSafetyTimer = useCallback(() => {
        if (dragSafetyTimer.current) clearTimeout(dragSafetyTimer.current);
        dragSafetyTimer.current = setTimeout(() => {
            console.warn('[PromptBar] Drag timeout - resetting state');
            setIsDragging(false);
            dragCounter.current = 0;
        }, 4000);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.input-bar-inner')) {
                setActiveMenu(null);
                setShowPromptLibrary(false);
                setShowPptOutlinePanel(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (dragSafetyTimer.current) clearTimeout(dragSafetyTimer.current);
        };
    }, []);

    const saveFavoritePromptIds = useCallback((ids: string[]) => {
        setFavoritePromptIds(ids);
        localStorage.setItem('kk_prompt_library_favorites', JSON.stringify(ids));
    }, []);

    const togglePromptFavorite = useCallback((id: string) => {
        if (favoritePromptIds.includes(id)) {
            saveFavoritePromptIds(favoritePromptIds.filter(item => item !== id));
            return;
        }
        saveFavoritePromptIds([id, ...favoritePromptIds]);
    }, [favoritePromptIds, saveFavoritePromptIds]);

    const applyPromptTemplate = useCallback((templatePrompt: string) => {
        const current = (config.prompt || '').trim();
        const nextPrompt = current
            ? `${config.prompt.replace(/\s+$/, '')}\n${templatePrompt}`
            : templatePrompt;
        setConfig(prev => ({ ...prev, prompt: nextPrompt }));
        setShowPromptLibrary(false);
        notify.success('提示词已插入', '已追加到输入框，可继续编辑后发送');
    }, [config.prompt, setConfig]);

    const parsePptSlides = useCallback((text: string) => {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .slice(0, 20);
    }, []);

    const generatePptOutlineByTopic = useCallback(() => {
        const topic = (config.prompt || '').trim() || '主题演示';
        const total = Math.min(20, Math.max(1, Number(config.parallelCount) || 1));
        const pages = Array.from({ length: total }).map((_, idx) => {
            const pageNo = idx + 1;
            if (pageNo === 1) return `封面：${topic}`;
            if (pageNo === total) return `总结与行动建议：${topic}`;
            return `${topic} - 第${pageNo}页核心内容`;
        });
        setPptOutlineDraft(pages.join('\n'));
    }, [config.parallelCount, config.prompt]);

    const applyPptOutlineDraft = useCallback(() => {
        const slides = parsePptSlides(pptOutlineDraft);
        const nextCount = Math.max(1, Math.min(20, slides.length || Number(config.parallelCount) || 1));
        setConfig(prev => ({
            ...prev,
            pptSlides: slides,
            parallelCount: nextCount
        }));
        notify.success('PPT页纲已应用', `已设置 ${nextCount} 页，生成时将按图1~图${nextCount}输出`);
    }, [config.parallelCount, parsePptSlides, pptOutlineDraft, setConfig]);

    const exportPptOutlineJson = useCallback(() => {
        const slides = parsePptSlides(pptOutlineDraft);
        const payload = {
            topic: (config.prompt || '').trim(),
            pageCount: slides.length,
            pages: slides.map((text, idx) => ({ page: idx + 1, text })),
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ppt-outline-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [config.prompt, parsePptSlides, pptOutlineDraft]);

    const movePptSlide = useCallback((index: number, direction: -1 | 1) => {
        const slides = parsePptSlides(pptOutlineDraft);
        const target = index + direction;
        if (target < 0 || target >= slides.length) return;
        const next = [...slides];
        const tmp = next[index];
        next[index] = next[target];
        next[target] = tmp;
        setPptOutlineDraft(next.join('\n'));
    }, [parsePptSlides, pptOutlineDraft]);

    const removePptSlide = useCallback((index: number) => {
        const slides = parsePptSlides(pptOutlineDraft);
        const next = slides.filter((_, i) => i !== index);
        setPptOutlineDraft(next.join('\n'));
    }, [parsePptSlides, pptOutlineDraft]);

    const insertPptSlideAfter = useCallback((index: number) => {
        const slides = parsePptSlides(pptOutlineDraft);
        if (slides.length >= 20) return;
        const next = [...slides];
        next.splice(index + 1, 0, `新页面 ${Math.min(20, index + 2)}`);
        setPptOutlineDraft(next.slice(0, 20).join('\n'));
    }, [parsePptSlides, pptOutlineDraft]);

    const appendPptTemplateSlide = useCallback((template: 'cover' | 'agenda' | 'section' | 'summary') => {
        const slides = parsePptSlides(pptOutlineDraft);
        if (slides.length >= 20) return;
        const topic = (config.prompt || '').trim() || '主题演示';
        const text = template === 'cover'
            ? `封面：${topic}`
            : template === 'agenda'
                ? `目录页：${topic} 核心议题与章节安排`
                : template === 'section'
                    ? `章节过渡页：${topic} - 阶段重点`
                    : `总结页：${topic} 结论与下一步行动`;
        setPptOutlineDraft([...slides, text].join('\n'));
    }, [config.prompt, parsePptSlides, pptOutlineDraft]);

    const dropPptSlide = useCallback(() => {
        if (pptDragIndex === null || pptDropIndex === null) return;
        const slides = parsePptSlides(pptOutlineDraft);
        if (pptDragIndex < 0 || pptDragIndex >= slides.length) return;
        const target = Math.max(0, Math.min(slides.length - 1, pptDropIndex));
        if (target === pptDragIndex) return;
        const next = [...slides];
        const [moved] = next.splice(pptDragIndex, 1);
        next.splice(target, 0, moved);
        setPptOutlineDraft(next.join('\n'));
        setPptDragIndex(null);
        setPptDropIndex(null);
    }, [parsePptSlides, pptDragIndex, pptDropIndex, pptOutlineDraft]);

    useEffect(() => {
        if (config.mode !== GenerationMode.PPT) return;
        const slides = parsePptSlides(pptOutlineDraft);
        const current = (config.pptSlides || []).map(s => String(s || '').trim()).filter(Boolean);
        const draftKey = slides.join('\n');
        const currentKey = current.join('\n');
        if (draftKey === currentKey) return;

        setConfig(prev => ({
            ...prev,
            pptSlides: slides,
            parallelCount: Math.max(1, Math.min(20, slides.length || prev.parallelCount || 1))
        }));
    }, [config.mode, config.pptSlides, parsePptSlides, pptOutlineDraft, setConfig]);

    const filteredPromptLibrary = useMemo(() => {
        const keyword = promptLibrarySearch.trim().toLowerCase();
        const isFavoriteOnly = promptLibraryCategory === 'all' && keyword === 'fav';

        const base = BUILTIN_PROMPT_LIBRARY.filter(item => {
            if (promptLibraryCategory !== 'all' && item.category !== promptLibraryCategory) return false;
            if (isFavoriteOnly && !favoritePromptIds.includes(item.id)) return false;
            if (!keyword || keyword === 'fav') return true;
            return (
                item.title.toLowerCase().includes(keyword)
                || item.prompt.toLowerCase().includes(keyword)
                || (item.source || '').toLowerCase().includes(keyword)
            );
        });

        return base.sort((a, b) => {
            const aFav = favoritePromptIds.includes(a.id) ? 1 : 0;
            const bFav = favoritePromptIds.includes(b.id) ? 1 : 0;
            return bFav - aFav;
        });
    }, [favoritePromptIds, promptLibraryCategory, promptLibrarySearch]);

    const modeOptions = useMemo(() => ([
        {
            mode: GenerationMode.IMAGE,
            label: '图片',
            icon: Camera,
            color: '#818cf8',
            activeBg: 'rgba(99,102,241,0.16)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.IMAGE, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.VIDEO,
            label: '视频',
            icon: Video,
            color: '#c084fc',
            activeBg: 'rgba(168,85,247,0.16)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.VIDEO, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.AUDIO,
            label: '音乐',
            icon: Mic,
            color: '#f472b6',
            activeBg: 'rgba(236,72,153,0.16)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.AUDIO, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.PPT,
            label: 'PPT',
            icon: LayoutDashboard,
            color: '#38bdf8',
            activeBg: 'rgba(14,165,233,0.16)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.PPT, parallelCount: Math.min(20, Math.max(1, prev.parallelCount || 6)), pptStyleLocked: prev.pptStyleLocked !== false }))
        }
    ]), [setConfig]);

    const activeModeIndex = useMemo(() => {
        const idx = modeOptions.findIndex(item => item.mode === config.mode);
        return idx >= 0 ? idx : 0;
    }, [config.mode, modeOptions]);

    // Drag & Drop handlers...
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;

        resetDragSafetyTimer(); // Start/Reset timer

        // [FIX] Ignore internal drags (e.g. reordering reference images)
        if (dragSourceId) return;

        // Check if it's a file drag from OS
        if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
        }
    }, [dragSourceId, resetDragSafetyTimer]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resetDragSafetyTimer(); // Keep alive
    }, [resetDragSafetyTimer]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;

        // Don't clear timer here immediately, allow slight buffer or let Over handle it? 
        // Actually if we leave, we might want to kill it if count is 0.
        // But if we leave to a child, Over will fire there (bubbling?). 
        // Safest is to rely on the counter logic + the fallback timer.

        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsDragging(false);
            if (dragSafetyTimer.current) clearTimeout(dragSafetyTimer.current);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDragging(false);
        if (dragSafetyTimer.current) clearTimeout(dragSafetyTimer.current);

        // Prompt template drag-and-drop
        const promptTemplate = e.dataTransfer.getData('application/x-kk-prompt-template');
        if (promptTemplate) {
            applyPromptTemplate(promptTemplate);
            return;
        }

        // 1. 处理文件 (Prioritize files)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
            return;
        }

        // 2. [NEW] Handle Internal Image Reuse (Optimized)
        const internalRefData = e.dataTransfer.getData('application/x-kk-image-ref');
        if (internalRefData) {
            try {
                const { storageId, mimeType, data } = JSON.parse(internalRefData);
                if (storageId) {
                    // reuse existing storageId!
                    setConfig(prev => {
                        // Prevent duplicates
                        if (prev.referenceImages.some(img => img.storageId === storageId)) return prev;

                        // 🚀 [修复] 根据模型动态获取最大参考图数量
                        const modelCaps = getModelCapabilities(config.model);
                        const maxRefImages = modelCaps?.maxRefImages ?? 5;

                        if (prev.referenceImages.length >= maxRefImages) {
                            notify.warning('参考图数量限制', `最多只能上传 ${maxRefImages} 张参考图`);
                            return prev;
                        }

                        // [FIX] Use passed data if available to avoid loading state
                        let finalData = '';
                        if (data) {
                            if (data.startsWith('data:')) {
                                const matches = data.match(/^data:(.+);base64,(.+)$/);
                                if (matches && matches[2]) {
                                    finalData = matches[2];
                                } else {
                                    finalData = data; // Fallback for other data URIs
                                }
                            } else {
                                // Allow blob: URLs or raw base64 to pass through
                                finalData = data;
                            }
                        }

                        const newRef = {
                            id: Date.now() + Math.random().toString(),
                            storageId,
                            mimeType: mimeType || 'image/png',
                            data: finalData // Use pure data if available, else empty (triggers healing)
                        };

                        // [NEW] If no data but storageId exists, hydrate it!
                        if (!finalData && storageId) {
                            import('../services/imageStorage').then(({ getImage }) => {
                                getImage(storageId).then((loadedData) => {
                                    if (loadedData) {
                                        setConfig(curr => ({
                                            ...curr,
                                            referenceImages: curr.referenceImages.map(img =>
                                                img.id === newRef.id ? { ...img, data: loadedData } : img
                                            )
                                        }));
                                    }
                                });
                            });
                        }

                        return {
                            ...prev,
                            referenceImages: [...prev.referenceImages, newRef]
                        };
                    });
                    return;
                }
            } catch (err) {
                console.error("Failed to parse internal image ref", err);
            }
        }

        // 3. 处理 URL (从图片卡片拖拽 - Fallback or External)
        const url = e.dataTransfer.getData('text/plain');
        if (url) {
            // [OPTIMIZATION] Handle Data URIs directly without fetch
            if (url.startsWith('data:')) {
                const matches = url.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    const mimeType = matches[1];
                    const data = matches[2];
                    // Wrap in a fake File object-like structure or just call logic?
                    // Reuse direct logic to avoid File overhead if possible, but processFiles expects File[].
                    // Let's create a File. Fast enough.
                    fetch(url)
                        .then(res => res.blob())
                        .then(blob => {
                            const file = new File([blob], "dropped_image.png", { type: mimeType });
                            processFiles([file]);
                        });
                    return;
                }
            }

            // 检查是否为有效 URL 或 Data URI
            if (url.startsWith('http') || url.startsWith('blob:')) {
                // 获取并转换为 File 对象以复用 processFiles 逻辑
                fetch(url)
                    .then(res => res.blob())
                    .then(blob => {
                        const file = new File([blob], "dropped_image.png", { type: blob.type });
                        processFiles([file]);
                    })
                    .catch(err => {
                        console.error("处理拖拽 URL 失败:", err);
                    });
            }
        }
    }, [applyPromptTemplate, processFiles]);

    const isModelListEmpty = availableModels.length === 0;


    const currentModel = availableModels.find(m => m.id === config.model);
    const currentModelName = isModelListEmpty
        ? '无可用模型'
        : (currentModel ? (currentModel.label || currentModel.id.split('@')[0]) : '未知模型');

    // 🚀 [NEW] 获取展示信息 (来源标签)
    const modelDisplayInfo = currentModel ? getModelDisplayInfo(currentModel) : null;

    const truncateModelLabel = useCallback((label: string) => {
        const max = 15;
        if (label.length <= max) return label;
        return label.slice(0, max - 1) + '…';
    }, []);

    const truncateProviderLabel = useCallback((label: string) => {
        const max = 5;
        if (label.length <= max) return label;
        return label.slice(0, max - 1) + '…';
    }, []);

    const displayModelLabel = truncateModelLabel(currentModelName);

    // 🚀 [Mobile Layout] Dock to bottom on mobile
    const mobileStyle: React.CSSProperties = isMobile ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        maxWidth: '100%',
        margin: 0,
        borderRadius: 0, // Flat for docked bar
        borderTop: '1px solid rgba(255,255,255,0.1)',
        borderBottom: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        zIndex: 50,
        padding: '12px 16px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        backdropFilter: 'blur(20px)',
        backgroundColor: 'rgba(20, 20, 23, 0.85)', // Dark translucent iOS style
        boxShadow: '0 -4px 30px rgba(0,0,0,0.5)',
        alignItems: 'center'
    } : {
        // Desktop floating style handling...
    };

    // Swipe Detection State
    const wrapperTouchStartY = useRef<number | null>(null);

    const handleContainerTouchStart = (e: React.TouchEvent) => {
        wrapperTouchStartY.current = e.touches[0].clientY;
        handleTouchStart(e); // Keep existing handler
    };

    const handleContainerTouchEnd = (e: React.TouchEvent) => {
        if (wrapperTouchStartY.current !== null) {
            const touchEndY = e.changedTouches[0].clientY;
            const deltaY = touchEndY - wrapperTouchStartY.current;

            // Swipe Up Detection (threshold 30px)
            if (deltaY < -30) {
                onInteract?.(); // Trigger Nav Show
            }
            wrapperTouchStartY.current = null;
        }
        handleTouchEnd(e); // Keep existing handler
    };

    // Desktop floating style handling is used for both now
    // 宽度策略：避免部署环境字体/缩放差异导致底部按钮被挤出容器

    return (
        <div
            id="prompt-bar-container"
            className={`input-bar transition-all duration-300 w-[calc(100vw-32px)] sm:w-[min(94vw,860px)] md:w-[min(90vw,980px)] lg:w-[min(86vw,1100px)] ${isDragging ? 'ring-2 ring-indigo-500' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
                bottom: '32px'
            }}
        >
            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-500/20 backdrop-blur-md rounded-[inherit] flex items-center justify-center animate-fadeIn pointer-events-none">
                    <span className="font-bold text-sm text-white drop-shadow-md">释放添加参考图</span>
                </div>
            )}

            {/* [NEW] Flying Image Animation */}
            {flyingImage && (
                <div
                    className="fixed z-[9999] w-12 h-12 rounded-lg border-2 border-indigo-500 shadow-xl overflow-hidden pointer-events-none transition-all ease-in-out duration-500"
                    style={{
                        left: 0,
                        top: 0,
                        backgroundImage: `url(${flyingImage.url})`,
                        backgroundSize: 'cover',
                        transform: `translate(${flyingImage.targetX}px, ${flyingImage.targetY}px) scale(1)`,
                        animation: `flyToTarget 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                    }}
                >
                    <style>{`
@keyframes flyToTarget {
    0% { transform: translate(${flyingImage.x}px, ${flyingImage.y}px) scale(1); opacity: 0.8; }
    50% { opacity: 1; scale: 1.2; }
    100% { transform: translate(${flyingImage.targetX}px, ${flyingImage.targetY}px) scale(1); opacity: 0; }
}
`}</style>
                </div>
            )}

            <div
                className="input-bar-inner"
                style={{
                    position: 'relative'
                    // Mobile: No capsule wrapper - keep it clean and flat
                }}
            >

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
                            <div className="text-xs font-semibold text-amber-600 dark:text-amber-500">从此图继续创作</div>
                            <div className="text-xs text-[var(--text-tertiary)] truncate">{activeSourceImage.prompt}</div>
                        </div>
                    </div>
                )}

                {/* Top Controls Row: Mode toggle on left, prompt optimizer on right */}
                <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2">
                        {(() => {
                            const MODE_SLOT_WIDTH = 82;
                            const sliderWidth = 74;
                            const sliderLeft = 4 + activeModeIndex * MODE_SLOT_WIDTH + (MODE_SLOT_WIDTH - sliderWidth) / 2;
                            return (
                                <div className="relative inline-flex items-center p-1 rounded-xl border"
                                    style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-light)'
                                    }}
                                >
                                    <div
                                        className="absolute top-1 h-[calc(100%-8px)] rounded-md transition-all duration-300 ease-out"
                                        style={{
                                            width: `${sliderWidth}px`,
                                            left: `${sliderLeft}px`,
                                            backgroundColor: modeOptions[activeModeIndex]?.activeBg || 'rgba(99,102,241,0.16)',
                                            boxShadow: '0 0 10px rgba(0,0,0,0.18) inset'
                                        }}
                                    />

                                    {[1, 2, 3].map((splitIndex) => (
                                        <span
                                            key={`split-${splitIndex}`}
                                            className="absolute inset-y-0 my-auto w-px h-[50%] pointer-events-none"
                                            style={{
                                                left: `${4 + splitIndex * MODE_SLOT_WIDTH}px`,
                                                backgroundColor: 'rgba(255,255,255,0.08)'
                                            }}
                                        />
                                    ))}

                                    {modeOptions.map((item) => {
                                        const isActive = config.mode === item.mode;
                                        const Icon = item.icon;
                                        return (
                                            <div key={item.mode} className="relative z-10">
                                                <button
                                                    className="w-[82px] px-2 py-1 rounded-md text-sm font-medium transition-all duration-200"
                                                    style={{
                                                        color: isActive ? item.color : 'var(--text-secondary)'
                                                    }}
                                                    onClick={item.onSelect}
                                                >
                                                    <span className="inline-flex items-center gap-1">
                                                        <Icon size={12} />
                                                        <span>{item.label}</span>
                                                    </span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>

                    <div className="relative flex items-center gap-1">
                        <button
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all text-[11px] font-medium whitespace-nowrap flex-shrink-0"
                            style={{
                                backgroundColor: showPromptLibrary ? 'rgba(59,130,246,0.14)' : 'var(--bg-tertiary)',
                                color: showPromptLibrary ? '#60a5fa' : 'var(--text-secondary)',
                                borderColor: showPromptLibrary ? 'rgba(96,165,250,0.35)' : 'var(--border-light)'
                            }}
                            onClick={() => {
                                setShowPromptLibrary(prev => !prev);
                                setShowPptOutlinePanel(false);
                                setActiveMenu(null);
                            }}
                            title="打开提示词库"
                        >
                            <span>提示词库</span>
                        </button>

                        {config.mode === GenerationMode.PPT && (
                            <button
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all text-[11px] font-medium whitespace-nowrap flex-shrink-0"
                                style={{
                                    backgroundColor: showPptOutlinePanel ? 'rgba(14,165,233,0.14)' : 'var(--bg-tertiary)',
                                    color: showPptOutlinePanel ? '#38bdf8' : 'var(--text-secondary)',
                                    borderColor: showPptOutlinePanel ? 'rgba(56,189,248,0.35)' : 'var(--border-light)'
                                }}
                                onClick={() => {
                                    setShowPptOutlinePanel(prev => !prev);
                                    setShowPromptLibrary(false);
                                    setActiveMenu(null);
                                }}
                                title="编辑PPT页纲"
                            >
                                <span>页纲</span>
                            </button>
                        )}

                        <button
                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all text-[11px] font-medium whitespace-nowrap flex-shrink-0"
                            style={{
                                backgroundColor: config.enablePromptOptimization ? 'rgba(34,197,94,0.14)' : 'var(--bg-tertiary)',
                                color: config.enablePromptOptimization ? '#34d399' : 'var(--text-secondary)',
                                borderColor: config.enablePromptOptimization ? 'rgba(52,211,153,0.35)' : 'var(--border-light)',
                                opacity: (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? 1 : 0.45,
                                pointerEvents: (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? 'auto' : 'none'
                            }}
                            onClick={() => setConfig(prev => ({ ...prev, enablePromptOptimization: !prev.enablePromptOptimization }))}
                            title={(config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? '开启后先优化提示词，再发送生成' : '仅图片/PPT模式支持提示词优化'}
                        >
                            <span>优化提示词</span>
                            <span className="text-[10px] opacity-80">{config.enablePromptOptimization ? 'ON' : 'OFF'}</span>
                        </button>

                        {showPromptLibrary && (
                            <div className="absolute bottom-full right-0 mb-2 z-40 w-[min(34rem,90vw)] rounded-2xl border shadow-xl p-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)' }}>
                                <div className="flex items-center gap-1 mb-2">
                                    <button
                                        className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'all' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                        onClick={() => setPromptLibraryCategory('all')}
                                    >全部</button>
                                    <button
                                        className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'banana-pro' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                        onClick={() => setPromptLibraryCategory('banana-pro')}
                                    >Banana Pro</button>
                                    <button
                                        className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'banana' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                        onClick={() => setPromptLibraryCategory('banana')}
                                    >Banana</button>
                                    <button
                                        className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'general' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                        onClick={() => setPromptLibraryCategory('general')}
                                    >通用</button>
                                    <input
                                        value={promptLibrarySearch}
                                        onChange={(e) => setPromptLibrarySearch(e.target.value)}
                                        placeholder="搜索标题/内容"
                                        className="ml-auto w-40 bg-[var(--bg-tertiary)] text-[11px] rounded-md px-2 py-1 border border-[var(--border-light)] outline-none"
                                    />
                                </div>

                                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                                    {filteredPromptLibrary.map(item => {
                                        const isFavorite = favoritePromptIds.includes(item.id);
                                        return (
                                            <div
                                                key={item.id}
                                                className="rounded-lg border p-2"
                                                style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('application/x-kk-prompt-template', item.prompt);
                                                    e.dataTransfer.setData('text/plain', item.prompt);
                                                    e.dataTransfer.effectAllowed = 'copy';
                                                }}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-xs font-medium text-[var(--text-primary)] truncate">{item.title}</div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            className="text-[10px] px-2 py-1 rounded-md border border-[var(--border-light)] hover:bg-white/5"
                                                            style={{ color: 'var(--text-secondary)' }}
                                                            onClick={() => applyPromptTemplate(item.prompt)}
                                                        >插入</button>
                                                        <button
                                                            className="text-[11px] px-2 py-1 rounded-md border border-[var(--border-light)] hover:bg-white/5"
                                                            style={{ color: isFavorite ? '#fbbf24' : 'var(--text-secondary)' }}
                                                            onClick={() => togglePromptFavorite(item.id)}
                                                            title={isFavorite ? '取消收藏' : '收藏'}
                                                        >★</button>
                                                    </div>
                                                </div>
                                                {item.source && <div className="text-[10px] mt-1 text-[var(--text-tertiary)]">来源: {item.source}</div>}
                                                <div className="text-[11px] mt-1 text-[var(--text-secondary)] max-h-8 overflow-hidden">{item.prompt}</div>
                                            </div>
                                        );
                                    })}
                                    {filteredPromptLibrary.length === 0 && (
                                        <div className="text-xs text-[var(--text-tertiary)] text-center py-4">没有匹配项</div>
                                    )}
                                </div>
                                <div className="text-[10px] mt-2 text-[var(--text-tertiary)]">支持拖拽到输入区直接插入；收藏会保存在本地。</div>
                            </div>
                        )}

                        {showPptOutlinePanel && config.mode === GenerationMode.PPT && (
                            <div className="absolute bottom-full right-0 mb-2 z-40 w-[min(38rem,92vw)] rounded-2xl border shadow-xl p-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)' }}>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="text-xs font-semibold text-[var(--text-primary)]">PPT页纲（每行一页）</div>
                                    <div className="text-[10px] text-[var(--text-tertiary)]">{Math.min(20, parsePptSlides(pptOutlineDraft).length)} / 20 页，生成结果按图1~图N命名</div>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <button
                                        className={`px-2 py-1 rounded-md text-[11px] border ${config.pptStyleLocked !== false ? 'border-sky-500/40 bg-sky-500/10 text-sky-300' : 'border-[var(--border-light)] text-[var(--text-secondary)]'}`}
                                        onClick={() => setConfig(prev => ({ ...prev, pptStyleLocked: !(prev.pptStyleLocked !== false) }))}
                                        title="锁定整套PPT视觉风格一致性"
                                    >
                                        风格锁定 {config.pptStyleLocked !== false ? 'ON' : 'OFF'}
                                    </button>
                                    <div className="text-[10px] text-[var(--text-tertiary)]">ON 更偏向整套视觉一致，OFF 允许单页变化</div>
                                </div>
                                <div className="flex items-center gap-1 mb-2">
                                    <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('cover')}>+封面</button>
                                    <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('agenda')}>+目录</button>
                                    <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('section')}>+章节</button>
                                    <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('summary')}>+总结</button>
                                </div>
                                <textarea
                                    value={pptOutlineDraft}
                                    onChange={(e) => setPptOutlineDraft(e.target.value)}
                                    className="w-full h-44 rounded-lg border p-2 text-xs outline-none resize-none"
                                    style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                                    placeholder="示例：\n封面：AI产品季度汇报\n市场洞察\n产品路线图\n关键案例\n总结与下一步"
                                />
                                {parsePptSlides(pptOutlineDraft).length > 0 && (
                                    <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1">
                                        {parsePptSlides(pptOutlineDraft).map((line, idx) => (
                                            <div
                                                key={`${idx}-${line}`}
                                                className="relative flex items-center gap-1 rounded-md border px-2 py-1"
                                                style={{
                                                    borderColor: (pptDropIndex === idx && pptDragIndex !== null && pptDragIndex !== idx)
                                                        ? 'rgba(56,189,248,0.45)'
                                                        : 'var(--border-light)',
                                                    backgroundColor: (pptDropIndex === idx && pptDragIndex !== null && pptDragIndex !== idx)
                                                        ? 'rgba(14,165,233,0.12)'
                                                        : 'var(--bg-tertiary)',
                                                    opacity: pptDragIndex === idx ? 0.65 : 1
                                                }}
                                                draggable
                                                onDragStart={() => {
                                                    setPptDragIndex(idx);
                                                    setPptDropIndex(idx);
                                                }}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    setPptDropIndex(idx);
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setPptDropIndex(idx);
                                                    setTimeout(() => dropPptSlide(), 0);
                                                }}
                                                onDragEnd={() => {
                                                    setPptDragIndex(null);
                                                    setPptDropIndex(null);
                                                }}
                                            >
                                                {(pptDropIndex === idx && pptDragIndex !== null && pptDragIndex !== idx) && (
                                                    <div className="absolute left-1 right-1 -top-[1px] h-[2px] rounded-full bg-sky-400/80 pointer-events-none" />
                                                )}
                                                <span className="text-[10px] w-4 shrink-0 text-[var(--text-tertiary)] cursor-grab">⋮</span>
                                                <span className="text-[10px] text-sky-400 w-8 shrink-0">图{idx + 1}</span>
                                                <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1" title={line}>{line}</span>
                                                <button
                                                    className="text-[10px] px-1 py-0.5 rounded border border-[var(--border-light)]"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                    onClick={() => movePptSlide(idx, -1)}
                                                    title="上移"
                                                >↑</button>
                                                <button
                                                    className="text-[10px] px-1 py-0.5 rounded border border-[var(--border-light)]"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                    onClick={() => movePptSlide(idx, 1)}
                                                    title="下移"
                                                >↓</button>
                                                <button
                                                    className="text-[10px] px-1 py-0.5 rounded border border-red-500/30"
                                                    style={{ color: '#fca5a5' }}
                                                    onClick={() => removePptSlide(idx)}
                                                    title="删除此页"
                                                >删</button>
                                                <button
                                                    className="text-[10px] px-1 py-0.5 rounded border border-sky-500/30"
                                                    style={{ color: '#7dd3fc' }}
                                                    onClick={() => insertPptSlideAfter(idx)}
                                                    title="在后方插入新页"
                                                >+</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center gap-1 mt-2">
                                    <button
                                        className="px-2 py-1 rounded-md text-[11px] border border-[var(--border-light)] hover:bg-white/5"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onClick={generatePptOutlineByTopic}
                                    >
                                        按主题拆页
                                    </button>
                                    <button
                                        className="px-2 py-1 rounded-md text-[11px] border border-[var(--border-light)] hover:bg-white/5"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onClick={exportPptOutlineJson}
                                    >
                                        导出JSON
                                    </button>
                                    <button
                                        className="px-2 py-1 rounded-md text-[11px] border border-[var(--border-light)] hover:bg-white/5"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onClick={() => setPptOutlineDraft('')}
                                    >
                                        清空
                                    </button>
                                    <button
                                        className="ml-auto px-2 py-1 rounded-md text-[11px] border border-sky-400/40 bg-sky-500/10"
                                        style={{ color: '#38bdf8' }}
                                        onClick={applyPptOutlineDraft}
                                    >
                                        应用页纲
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Input Area Wrapper with hover detection */}
                <div
                    onMouseEnter={() => {
                        // Clear existing timer
                        if (hoverTimerRef.current) {
                            clearTimeout(hoverTimerRef.current);
                        }
                        // Set 500ms delay before showing upload button
                        hoverTimerRef.current = setTimeout(() => {
                            setIsInputAreaHovered(true);
                        }, 500);
                    }}
                    onMouseLeave={() => {
                        // Clear timer on leave
                        if (hoverTimerRef.current) {
                            clearTimeout(hoverTimerRef.current);
                            hoverTimerRef.current = null;
                        }
                        // Immediately hide
                        setIsInputAreaHovered(false);
                    }}
                >
                    {/* Reference Images List */}
                    {(config.referenceImages && config.referenceImages.length > 0 || uploadingCount > 0) && (
                        <div
                            ref={refContainerRef}
                            className="flex flex-nowrap items-center gap-2 transition-all p-2 mx-1 mt-1 rounded-lg overflow-x-auto overflow-y-hidden scrollbar-thin"
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';

                                // Calculate insertion index based on mouse cursor X
                                if (refContainerRef.current) {
                                    const children = Array.from(refContainerRef.current.children).filter(c => !c.id.includes('spacer'));
                                    let insertIndex = children.length;

                                    for (let i = 0; i < children.length; i++) {
                                        const rect = children[i].getBoundingClientRect();
                                        const centerX = rect.left + rect.width / 2;
                                        if (e.clientX < centerX) {
                                            insertIndex = i;
                                            break;
                                        }
                                    }

                                    // Don't show gap if we are hovering over the source itself or its immediate neighbor in a way that wouldn't change order
                                    if (dragSourceId) {
                                        const sourceIndex = config.referenceImages.findIndex(img => img.id === dragSourceId);
                                        if (insertIndex === sourceIndex || insertIndex === sourceIndex + 1) {
                                            setDropTargetIndex(null);
                                            return;
                                        }
                                    }

                                    setDropTargetIndex(insertIndex);
                                }
                            }}
                            onDragLeave={(e) => {
                                // Only clear if we actually left the container, not just entered a child
                                if (refContainerRef.current && !refContainerRef.current.contains(e.relatedTarget as Node)) {
                                    setDropTargetIndex(null);
                                }
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDropTargetIndex(null);

                                // 1. Internal Reorder
                                if (dragSourceId) {
                                    if (dropTargetIndex !== null) {
                                        setConfig(prev => {
                                            const newImages = [...prev.referenceImages];
                                            const sourceIndex = newImages.findIndex(i => i.id === dragSourceId);
                                            if (sourceIndex === -1) return prev;

                                            const [moved] = newImages.splice(sourceIndex, 1);
                                            // Adjust target index if we removed an item before it
                                            let finalTargetIndex = dropTargetIndex;
                                            if (sourceIndex < finalTargetIndex) {
                                                finalTargetIndex -= 1;
                                            }

                                            newImages.splice(finalTargetIndex, 0, moved);
                                            return { ...prev, referenceImages: newImages };
                                        });
                                    }
                                    setDragSourceId(null);
                                    return;
                                }

                                // 2. Pass to parent (handleDrop) for file processing
                                // We need to re-fire the drop event on the parent or call logic.
                                // Since we stopped prop, we must call it manually or refactor.
                                // Simplest: Call onFilesDrop if provided? 
                                // But existing architecture uses the parent <div> onDrop={handleDrop}.
                                // If we stopPropagation here, the parent sees it.
                                // If we DON'T stopPropagation, the parent sees it.
                                // But we want to handle Internal Reorder here exclusively.

                                // Solution: Check if it's Files. If so, let it bubble (remove e.stopPropagation()).
                                // If it's internal dragSourceId, handle and stop.
                            }}
                        >
                            {config.referenceImages.map((img, index) => {
                                const isSource = dragSourceId === img.id;

                                // Spacer Logic
                                const showSpacer = dropTargetIndex === index;

                                return (
                                    <React.Fragment key={img.id}>
                                        {/* Spacer */}
                                        <div
                                            id="spacer"
                                            className={`transition-all duration-300 ease-[cubic-bezier(0.25, 1, 0.5, 1)] rounded-lg overflow-hidden ${showSpacer ? 'w-12 opacity-100 mr-2' : 'w-0 opacity-0 mr-0'}`}
                                            style={{ height: showSpacer ? '48px' : '0px' }}
                                        >
                                            <div className="w-12 h-12 rounded-lg border-2 border-dashed border-indigo-500/30 bg-indigo-500/5"></div>
                                        </div>

                                        <div
                                            className={`relative group cursor-move transition-all duration-300 ${isSource ? 'opacity-0 w-0 overflow-hidden m-0 p-0 scale-0' : 'hover:scale-105'} ${!isSource ? 'w-12' : ''}`}
                                            draggable
                                            onDragStart={(e) => {
                                                e.stopPropagation();
                                                setDragSourceId(img.id);
                                                e.dataTransfer.setData('text/plain', img.id);
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragEnd={() => {
                                                setDragSourceId(null);
                                                setDropTargetIndex(null);
                                            }}
                                        >
                                            <ReferenceThumbnail
                                                image={img}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    const src = (img.data?.startsWith('data:') || img.data?.startsWith('blob:'))
                                                        ? img.data
                                                        : `data:${img.mimeType || 'image/png'};base64,${img.data}`;
                                                    setPreviewImage({ url: src, originRect: rect });
                                                }}
                                            />
                                            {/* Mask Indicator - 当前已设置遮罩时显示高亮边框 */}
                                            {config.maskUrl && config.editMode === 'inpaint' && (
                                                <div className="absolute inset-0 border-2 border-indigo-500 rounded-lg pointer-events-none" />
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeReferenceImage(img.id);
                                                    if (config.maskUrl) {
                                                        setConfig(prev => ({ ...prev, maskUrl: undefined, editMode: undefined }));
                                                    }
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110 z-10"
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                            </button>
                                        </div>
                                    </React.Fragment>
                                );
                            })}

                            {/* [NEW] Uploading Skeletons */}
                            {Array.from({ length: uploadingCount }).map((_, idx) => (
                                <div key={`uploading-${idx}`} className="relative w-12 h-12 rounded-lg border-2 border-dashed border-zinc-500/30 flex items-center justify-center bg-zinc-800/50 overflow-hidden flex-shrink-0 animate-pulse">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-zinc-400">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                </div>
                            ))}

                            <div
                                id="spacer"
                                className={`transition-all duration-300 ease-[cubic-bezier(0.25, 1, 0.5, 1)] rounded-lg overflow-hidden ${dropTargetIndex === config.referenceImages.length ? 'w-12 opacity-100 h-12' : 'w-0 opacity-0 h-0'}`}
                            >
                                <div className="w-12 h-12 rounded-lg border-2 border-dashed border-indigo-500/30 bg-indigo-500/5"></div>
                            </div>

                            {/* Upload Button - At the end of reference images row - 始终显示 */}
                            <button
                                className="w-12 h-12 rounded-md transition-all duration-200 border hover:bg-white/5 flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100"
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
                        </div>
                    )}

                    {/* Upload button when no reference images - 始终显示，与参考图同行对齐 */}
                    {config.referenceImages.length === 0 && uploadingCount === 0 && (
                        <div className="flex items-center p-2 mx-1 mt-1">
                            <button
                                className="w-12 h-12 rounded-lg transition-all border-2 border-dashed hover:bg-white/5 flex items-center justify-center flex-shrink-0 opacity-40 hover:opacity-80"
                                style={{
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
                        </div>
                    )}

                    {/* Text Input Area */}
                    <textarea
                        ref={textareaRef}
                        value={config.prompt}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        onFocus={() => {
                            setActiveMenu(null);
                            onFocus?.(); // 通知侧边栏: 输入框有焦点,不要自动隐藏
                        }}
                        onBlur={() => {
                            onBlur?.(); // 通知侧边栏: 输入框失去焦点,可以自动隐藏
                        }}
                        placeholder={config.mode === GenerationMode.VIDEO ? "描述你想要生成的视频..." : config.mode === GenerationMode.AUDIO ? "描述你想要生成的音乐风格、歌词或旋律..." : config.mode === GenerationMode.PPT ? "输入PPT主题，将批量生成图1~图N页面..." : "描述你想要生成的图片..."}
                        className="input-bar-textarea w-full bg-transparent border-none outline-none text-[15px] resize-none mt-1 py-1"
                        style={{
                            color: 'var(--text-primary)', // 使用 CSS 变量适配主题
                            minHeight: '36px',
                            maxHeight: '200px',
                            lineHeight: '1.5'
                        }}
                        rows={1}
                    />
                </div> {/* End of input area hover wrapper */}

                {/* Footer - Modified to be a standard flex row, flowing or wrapping lightly on mobile */}
                <div className={`input-bar-footer flex flex-wrap items-center pt-3 mt-1 border-t border-[var(--border-light)] gap-2`}>
                    {/* Left: Model & Settings */}
                    {/* Model Button */}
                    <div className="relative inline-flex flex-shrink-0">
                        <button
                            id="models-dropdown-trigger"
                            className={`input-bar-model flex items-center flex-nowrap justify-center gap-2 px-1.5 md:px-3 py-1 md:py-1.5 rounded-lg border transition-all duration-500 ease-[cubic-bezier(0.23, 1, 0.32, 1)] ${isModelListEmpty
                                ? 'bg-[var(--bg-tertiary)] border-[var(--border-light)] text-[var(--text-tertiary)] cursor-not-allowed'
                                : 'bg-[var(--bg-tertiary)] border-[var(--border-light)] text-[var(--text-secondary)] hover:border-opacity-50'
                                }`}
                            style={{ minWidth: isMobile ? '140px' : '160px', maxWidth: isMobile ? '180px' : '230px' }}
                            onClick={() => {
                                if (isModelListEmpty) {
                                    onOpenSettings?.('api-management');
                                } else {
                                    toggleMenu('model');
                                }
                            }}
                        >
                            {(() => {
                                const badgeInfo = getModelBadgeInfo({ id: currentModel?.id ?? '', label: currentModel?.label ?? '', provider: currentModel?.provider });
                                return (
                                    <span className={`text-xs font-medium whitespace-nowrap truncate max-w-[15ch] ${badgeInfo.colorClass}`} title={badgeInfo.text}>
                                        {displayModelLabel}
                                    </span>
                                );
                            })()}

                            {/* 🚀 [NEW] 供应商标签 - 带框右对齐 */}
                            {!isModelListEmpty && currentModel?.provider && (
                                <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded border flex-shrink-0 ${getProviderBadgeColor(currentModel.provider)}`}
                                    style={{ marginLeft: '6px' }}
                                    title={currentModel.provider}
                                >
                                    <span className="whitespace-nowrap">{truncateProviderLabel(currentModel.provider)}</span>
                                </span>
                            )}
                        </button>

                        {/* Dropdown Menu */}
                        {!isModelListEmpty && activeMenu === 'model' && (
                            <div className="absolute bottom-full mb-2 z-20" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                                {/* 🔍 Search Input Module - Above the list */}
                                <div className="mb-2 p-2 bg-[var(--bg-secondary)] border border-[var(--border-medium)] rounded-2xl shadow-xl animate-scaleIn origin-bottom" style={{ width: 'min(16rem,90vw)' }}>
                                    <div className="relative flex items-center">
                                        <svg className="absolute left-2 w-3.5 h-3.5 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            value={modelSearch}
                                            onChange={(e) => setModelSearch(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="搜索模型..."
                                            className="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs rounded-xl py-1.5 pl-7 pr-2 outline-none border border-transparent focus:border-indigo-500/50 placeholder-[var(--text-tertiary)]"
                                            autoFocus
                                        />
                                        {modelSearch && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setModelSearch(''); }}
                                                className="absolute right-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="dropdown static w-[min(16rem,90vw)] max-w-[90vw] max-h-[360px] overflow-y-auto scrollbar-thin animate-scaleIn origin-bottom p-1 flex flex-col gap-1" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-xl)', borderRadius: '1rem' }}>

                                    {filterAndSortModels(availableModels, modelSearch, modelCustomizations)
                                        .map((model: any) => {
                                            const custom = modelCustomizations[model.id] || {};
                                            const baseName = custom.alias || model.label || model.id;

                                            const getFallbackDescription = (m: any) => {
                                                if (m.provider) return `由 ${m.provider} 通道提供的可用模型`;
                                                if (m.group) return `隶属于 ${m.group} 分组的引擎模型`;
                                                return '外部集成的第三方语言模型';
                                            };
                                            const advantage = custom.description || model.description || getFallbackDescription(model);
                                            const isPinned = getPinnedModels().includes(model.id);
                                            return (
                                                <button
                                                    key={model.id}
                                                    className={`w-full px-3 py-2.5 text-left flex flex-col gap-1 hover:bg-white/5 transition-colors rounded-md ${config.model === model.id ? 'bg-white/10 ring-1 ring-white/20' : ''}`}
                                                    onClick={() => {
                                                        setModelManualLock(true); // 🚀 用户手动点击，开启锁定
                                                        setConfig(prev => {
                                                            const newImageSize = autoDetectImageSize(model.id, prev.imageSize);
                                                            return { ...prev, model: model.id, imageSize: newImageSize };
                                                        });
                                                        setActiveMenu(null);
                                                        setModelSearch(''); // Clear search on selection
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        setContextMenu({ x: e.clientX, y: e.clientY, modelId: model.id });
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
                                                            {(() => {
                                                                const displayInfo = getModelDisplayInfo(model);
                                                                const badgeInfo = getModelBadgeInfo({ id: model.id, label: model.label, provider: model.provider });
                                                                let displayName = displayInfo.displayName;

                                                                // 模型名字只显示20个(空格和符号不算), 隐藏中间字段用点...显示
                                                                let totalValid = 0;
                                                                for (let i = 0; i < displayName.length; i++) {
                                                                    if (!/[\s\-_/\\|;:'",.<>?!@#$%^&*()[\]]/.test(displayName[i])) totalValid++;
                                                                }

                                                                if (totalValid > 20) {
                                                                    let startIdx = 0, endIdx = displayName.length - 1;
                                                                    let currentValid = 0;
                                                                    for (let i = 0; i < displayName.length; i++) {
                                                                        if (!/[\s\-_/\\|;:'",.<>?!@#$%^&*()[\]]/.test(displayName[i])) currentValid++;
                                                                        if (currentValid === 10) { startIdx = i; break; }
                                                                    }
                                                                    currentValid = 0;
                                                                    for (let i = displayName.length - 1; i >= 0; i--) {
                                                                        if (!/[\s\-_/\\|;:'",.<>?!@#$%^&*()[\]]/.test(displayName[i])) currentValid++;
                                                                        if (currentValid === 10) { endIdx = i; break; }
                                                                    }
                                                                    if (startIdx < endIdx - 1) {
                                                                        displayName = displayName.substring(0, startIdx + 1) + '...' + displayName.substring(endIdx);
                                                                    }
                                                                }

                                                                return <span className={`text-xs font-medium ${badgeInfo.colorClass} truncate`} title={displayInfo.displayName}>{displayName}</span>;
                                                            })()}
                                                        </div>
                                                        {/* 供应商标签 - 右对齐带框（最多显示10个字符，单行） */}
                                                        {model.provider && (
                                                            <span
                                                                className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 whitespace-nowrap overflow-hidden ${getProviderBadgeColor(model.provider)}`}
                                                                title={model.provider}
                                                                style={{ maxWidth: '40%', textOverflow: 'ellipsis' }}
                                                            >
                                                                {model.provider.length > 10 ? model.provider.substring(0, 9) + '…' : model.provider}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Metadata Display - 三层简洁结构 */}
                                                    {(() => {
                                                        const modelDesc = getModelDescription(model.id);
                                                        const description = modelDesc?.description || advantage;

                                                        return (
                                                            <div className="flex justify-between items-start mt-1 gap-2">
                                                                <div className="flex flex-col gap-1 flex-1 min-w-0">
                                                                    <span className="text-[10px] text-[var(--text-tertiary)] leading-tight truncate opacity-60">ID: {model.id.split('@')[0]}</span>
                                                                    {description && (
                                                                        <span className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                                                            {description}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {isPinned && <span className="text-[12px] opacity-80 flex-shrink-0 mr-1 mt-0.5">📌</span>}
                                                            </div>
                                                        );
                                                    })()}
                                                </button >
                                            );
                                        })}
                                    {availableModels.filter(m => {
                                        if (!modelSearch) return true;
                                        const custom = modelCustomizations[m.id] || {};
                                        const searchLower = modelSearch.toLowerCase();
                                        return (
                                            m.id.toLowerCase().includes(searchLower) ||
                                            (m.label && m.label.toLowerCase().includes(searchLower)) ||
                                            (custom.alias && custom.alias.toLowerCase().includes(searchLower)) ||
                                            (m.provider && m.provider.toLowerCase().includes(searchLower))
                                        );
                                    }).length === 0 && (
                                            <div className="p-3 text-center text-xs text-[var(--text-tertiary)]">
                                                未找到匹配的模型
                                            </div>
                                        )}
                                </div >
                            </div >
                        )}
                    </div >

                    {/* Options Button - Shows current ratio and size, shrink on mobile */}
                    <div className="relative inline-flex flex-shrink-0">
                        <button
                            data-options-toggle
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs font-medium whitespace-nowrap flex-shrink-0"
                            style={{
                                backgroundColor: showOptionsPanel ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                                color: 'var(--text-secondary)',
                                borderColor: showOptionsPanel ? 'var(--border-medium)' : 'var(--border-light)'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenu(null); // 关闭其他菜单
                                setShowOptionsPanel(prev => !prev);
                            }}
                            title="图片/视频选项"
                        >
                            {config.mode === GenerationMode.AUDIO ? (
                                <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 18V5l12-2v13" />
                                        <circle cx="6" cy="18" r="3" />
                                        <circle cx="18" cy="16" r="3" />
                                    </svg>
                                    <span>{config.audioDuration || '自动'}</span>
                                </>
                            ) : (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? (
                                <>
                                    {config.aspectRatio === AspectRatio.AUTO ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                                            <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                                            <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                                            <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                                            <rect width="10" height="8" x="7" y="8" rx="1"></rect>
                                        </svg>
                                    ) : (
                                        getRatioIcon(config.aspectRatio)
                                    )}
                                    <span>{config.aspectRatio === AspectRatio.AUTO ? '自适应' : config.aspectRatio} · {config.imageSize}</span>
                                </>
                            ) : (
                                <>
                                    {config.aspectRatio === AspectRatio.AUTO ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                                            <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                                            <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                                            <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                                            <rect width="10" height="8" x="7" y="8" rx="1"></rect>
                                        </svg>
                                    ) : (
                                        getRatioIcon(config.aspectRatio)
                                    )}
                                    <span>{config.aspectRatio === AspectRatio.AUTO ? '自适应' : config.aspectRatio} · {config.videoResolution || '720p'}</span>
                                </>
                            )}
                            <svg className={`w-3 h-3 transition-transform ${showOptionsPanel ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </button>

                        {/* Options Panel - positioned relative to button */}
                        {showOptionsPanel && (
                            <div className="absolute bottom-full mb-2 z-30" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                                <div ref={optionsPanelRef}>
                                    {config.mode === GenerationMode.AUDIO ? (
                                        /* 音频选项面板 - 时长选择 */
                                        <div className="w-56 p-3 rounded-xl border shadow-xl animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)' }}>
                                            <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">音频时长</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {['自动', '30s', '60s', '120s', '240s'].map(dur => (
                                                    <button
                                                        key={dur}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${(config.audioDuration || '自动') === dur
                                                            ? 'bg-pink-500/20 text-pink-400 border-pink-500/30'
                                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-pink-500/30'
                                                            }`}
                                                        onClick={() => setConfig(prev => ({ ...prev, audioDuration: dur === '自动' ? undefined : dur }))}
                                                    >
                                                        {dur}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? (
                                        <ImageOptionsPanel
                                            aspectRatio={config.aspectRatio}
                                            imageSize={config.imageSize}
                                            onAspectRatioChange={(ratio) => setConfig(prev => ({ ...prev, aspectRatio: ratio }))}
                                            onImageSizeChange={(size) => setConfig(prev => ({ ...prev, imageSize: size }))}
                                            availableRatios={availableRatios}
                                            availableSizes={availableSizes}
                                        />
                                    ) : (
                                        <VideoOptionsPanel
                                            aspectRatio={config.aspectRatio}
                                            resolution={config.videoResolution || '720p'}
                                            duration={config.videoDuration || '4s'}
                                            audio={config.videoAudio || false}
                                            onAspectRatioChange={(ratio) => setConfig(prev => ({ ...prev, aspectRatio: ratio }))}
                                            onResolutionChange={(res) => setConfig(prev => ({ ...prev, videoResolution: res }))}
                                            onDurationChange={(dur) => setConfig(prev => ({ ...prev, videoDuration: dur }))}
                                            onAudioChange={(audio) => setConfig(prev => ({ ...prev, videoAudio: audio }))}
                                            availableRatios={availableRatios}
                                            supportsAudio={!!getModelCapabilities(config.model)?.supportsVideoAudio}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Removed duplicate ratio and size controls - now only in options panel */}
                    {/* End of Left Group Items */}

                    {/* Right: Actions Group */}
                    {/* Group 1: Network & Provider Settings - Hidden on mobile for compact layout */}
                    {!isMobile && (
                        <div
                            className="flex items-center gap-0.5 p-0.5 rounded-lg border h-[32px] transition-opacity duration-200"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                borderColor: 'var(--border-light)',
                                opacity: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 0 : 1,
                                visibility: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 'hidden' : 'visible',
                                pointerEvents: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 'none' : 'auto'
                            }}
                        >
                            {/* Grounding Tool - Now with capability check */}
                            <button
                                className={`flex items-center gap-1.5 px-3 h-full rounded-md transition-all text-[11px] font-medium whitespace-nowrap ${!groundingSupported
                                    ? 'opacity-40 cursor-not-allowed text-[var(--text-tertiary)]'
                                    : config.enableGrounding
                                        ? 'bg-indigo-500/15 text-indigo-500 shadow-sm'
                                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)]'
                                    }`}
                                onClick={() => groundingSupported && setConfig(prev => ({ ...prev, enableGrounding: !prev.enableGrounding }))}
                                disabled={!groundingSupported}
                                title={groundingSupported ? "联网模式 (Google Search)" : "当前模型不支持联网模式"}
                            >
                                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 8.8a15 15 0 0 1 20 0" />
                                    <path d="M5 12.5a10 10 0 0 1 14 0" />
                                    <path d="M8.5 16.3a5 5 0 0 1 7 0" />
                                    <line x1="12" y1="20" x2="12.01" y2="20" />
                                </svg>
                                <span className="hidden md:inline">Google 搜索</span>
                            </button >

                        </div >
                    )}

                    {/* Group 2: Generation Settings - Hidden on mobile for compact footer */}
                    {!isMobile && (
                        <div className="flex items-center gap-0.5 p-0.5 rounded-lg border h-[32px]" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }}>
                            {/* Parallel Count */}
                            <div className="relative h-full">
                                <button
                                    className="flex items-center gap-1.5 px-3 h-full rounded-md transition-all whitespace-nowrap text-[11px] font-medium"
                                    style={{ color: 'var(--text-secondary)' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleMenu('count');
                                    }}
                                    title="并发数量"
                                >
                                    <span className="text-[11px] font-medium"><span className="hidden md:inline">数量 </span>{config.parallelCount}</span>
                                    <svg className={`w-2.5 h-2.5 opacity-50 flex-shrink-0 transition-transform duration-200 ${activeMenu === 'count' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                                </button>
                                {
                                    activeMenu === 'count' && (
                                        <div className="absolute bottom-full mb-2 z-20" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                                            <div className="dropdown static w-24 animate-scaleIn origin-bottom p-1 flex flex-col gap-1" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                                {(config.mode === GenerationMode.PPT
                                                    ? Array.from({ length: 20 }, (_, i) => i + 1)
                                                    : [1, 2, 3, 4]
                                                ).map(count => (
                                                    <button key={count} className={`dropdown-item justify-between rounded-md ${config.parallelCount === count ? 'active' : ''}`} onClick={() => { setConfig(prev => ({ ...prev, parallelCount: count })); setActiveMenu(null); }}>
                                                        <span>{count} 张</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                }

                                {/* Context Menu for Pinning */}
                                {contextMenu && ReactDOM.createPortal(
                                    <div
                                        className="fixed z-[10010] bg-[#2a2a2e] border border-white/10 rounded-lg shadow-xl py-1 w-32 backdrop-blur-md"
                                        style={{ top: contextMenu.y, left: contextMenu.x }}
                                    >
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleModelPin(contextMenu.modelId);
                                                setContextMenu(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 flex items-center gap-2"
                                        >
                                            {getPinnedModels().includes(contextMenu.modelId) ? '❌ 取消置顶' : '📌 置顶模型'}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const custom = modelCustomizations[contextMenu.modelId] || {};
                                                setModelSettingsModal({
                                                    modelId: contextMenu.modelId,
                                                    alias: custom.alias || '',
                                                    description: custom.description || ''
                                                });
                                                setContextMenu(null);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 flex items-center gap-2"
                                        >
                                            ⚙️ 设置
                                        </button>
                                    </div>,
                                    document.body
                                )}

                                {/* Model Settings Modal */}
                                {modelSettingsModal && ReactDOM.createPortal(
                                    <div
                                        className="fixed inset-0 z-[10020] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                                        onClick={() => setModelSettingsModal(null)}
                                    >
                                        <div
                                            className="bg-[#1e1e20] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-5 space-y-4"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-lg font-bold text-white">模型设置</h3>
                                                <button onClick={() => setModelSettingsModal(null)} className="text-zinc-400 hover:text-white">✕</button>
                                            </div>
                                            <div className="text-xs text-zinc-500 font-mono break-all">ID: {modelSettingsModal.modelId}</div>
                                            <div>
                                                <label className="block text-xs font-medium text-zinc-400 mb-1.5">显示别名</label>
                                                <input
                                                    value={modelSettingsModal.alias}
                                                    onChange={(e) => setModelSettingsModal({ ...modelSettingsModal, alias: e.target.value })}
                                                    placeholder="留空则使用默认名称"
                                                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-zinc-400 mb-1.5">模型介绍</label>
                                                <textarea
                                                    value={modelSettingsModal.description}
                                                    onChange={(e) => setModelSettingsModal({ ...modelSettingsModal, description: e.target.value })}
                                                    placeholder="留空则使用默认介绍"
                                                    rows={2}
                                                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2 pt-2">
                                                <button
                                                    onClick={() => setModelSettingsModal(null)}
                                                    className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5"
                                                >
                                                    取消
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        saveModelCustomization(modelSettingsModal.modelId, modelSettingsModal.alias, modelSettingsModal.description);
                                                        setModelSettingsModal(null);
                                                    }}
                                                    className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
                                                >
                                                    保存
                                                </button>
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div >
                        </div >
                    )}



                    {/* 发送按钮 - 始终可用，支持连续发送 */}
                    <button
                        onClick={onGenerate}
                        disabled={!config.prompt}
                        className={`
                            group relative px-6 h-8 rounded-full flex flex-row items-center justify-center gap-2 whitespace-nowrap shrink-0 ml-auto transition-all duration-300 border
                            ${!config.prompt
                                ? 'border-zinc-200 dark:border-zinc-800 cursor-not-allowed'
                                : 'border-zinc-200 dark:border-zinc-700/50 hover:border-blue-500 dark:hover:border-blue-500 dark:hover:bg-white/5'
                            }
                        `}
                        style={{
                            backgroundColor: 'var(--bg-surface)',
                            color: !config.prompt ? 'var(--text-tertiary)' : 'var(--text-primary)',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                        }}
                    >
                        {/* Hover Glow Effect */}
                        {config.prompt && (
                            <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                                style={{
                                    background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(59,130,246,0.1) 100%)',
                                    boxShadow: '0 8px 20px -4px rgba(59, 130, 246, 0.6), inset 0 0 0 1px rgba(59, 130, 246, 0.3)'
                                }}
                            />
                        )}
                        <span className="relative z-10 text-[13px] font-semibold">发送</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 transition-transform group-hover:translate-x-1">
                            <path d="M5 12h14" />
                            <path d="M12 5l7 7-7 7" />
                        </svg>
                    </button>
                </div >
            </div >

            <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={(e) => e.target.files && processFiles(e.target.files)} />

            {/* [NEW] 参考图放大浮层 */}
            {
                previewImage && (
                    <ImagePreview
                        imageUrl={previewImage.url}
                        originRect={previewImage.originRect}
                        onClose={() => setPreviewImage(null)}
                    />
                )
            }

            {/* [NEW] Inpaint Modal */}
            {
                inpaintImage && (
                    <InpaintModal
                        imageUrl={inpaintImage.url}
                        onCancel={() => setInpaintImage(null)}
                        onSave={(maskBase64) => {
                            setConfig(prev => ({
                                ...prev,
                                maskUrl: maskBase64,
                                editMode: 'inpaint'
                            }));
                            setInpaintImage(null);
                        }}
                    />
                )
            }
        </div >
    );
};

export default PromptBar;
