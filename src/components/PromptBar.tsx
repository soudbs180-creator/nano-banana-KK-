import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { GenerationConfig, AspectRatio, ImageSize, GenerationMode, ModelType } from '../types';
import { modelRegistry, ActiveModel } from '../services/modelRegistry';
import { keyManager, getModelMetadata } from '../services/keyManager'; // Added getter
import { getModelCapabilities, modelSupportsGrounding, getModelDisplayInfo } from '../services/modelCapabilities';
import { calculateImageHash } from '../utils/imageUtils';
import { saveImage, getImage } from '../services/imageStorage'; // [NEW] Import getImage
import { fileSystemService } from '../services/fileSystemService'; // 🚀 参考图持久化
import ImageOptionsPanel from './ImageOptionsPanel';
import VideoOptionsPanel from './VideoOptionsPanel';
import ImagePreview from './ImagePreview';
import { sortModels, toggleModelPin, getPinnedModels } from '../utils/modelSorting';

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
}

const PromptBar: React.FC<PromptBarProps> = ({ config, setConfig, onGenerate, isGenerating, onFilesDrop, activeSourceImage, onClearSource, onCancel, isMobile = false, onOpenSettings, onInteract, onFocus, onBlur }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
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
    const refContainerRef = useRef<HTMLDivElement>(null);
    const optionsPanelRef = useRef<HTMLDivElement>(null); // [NEW] Ref for options panel

    // 状态：选项面板显示
    const [showOptionsPanel, setShowOptionsPanel] = useState(false);
    const [isInputAreaHovered, setIsInputAreaHovered] = useState(false); // Phase 3: hover state
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
            // ✨ 支持多模态模型：image+chat 在 image 模式下也可用
            if (config.mode === 'image' && type === 'image+chat') return true;
            if (config.mode === 'video' && type === 'image+chat') return false;
            return type === config.mode;
        });

        console.log('[PromptBar.availableModels] 最终结果:', result.length, result.map(m => ({ id: m.id, type: m.type, label: m.label })));
        return result;
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
        if (filesToProcess.length === 0) return;

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

        // [FIX] Ignore internal drags (e.g. reordering reference images)
        // If we are dragging an internal item, we don't want the huge "Drop Files" overlay
        if (dragSourceId) return;

        // Check if it's a file drag from OS
        if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
        }
    }, [dragSourceId]);
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
                        if (prev.referenceImages.length >= 5) {
                            alert("最多只能上传 5 张参考图");
                            return prev;
                        }

                        // [FIX] Use passed data if available to avoid loading state
                        let finalData = '';
                        if (data && data.startsWith('data:')) {
                            const matches = data.match(/^data:(.+);base64,(.+)$/);
                            if (matches && matches[2]) {
                                finalData = matches[2];
                            } else {
                                finalData = data; // Fallback
                            }
                        }

                        return {
                            ...prev,
                            referenceImages: [...prev.referenceImages, {
                                id: Date.now() + Math.random().toString(),
                                storageId,
                                mimeType: mimeType || 'image/png',
                                data: finalData // Use pure data if available, else empty (triggers healing)
                            }]
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
    }, [processFiles]);

    const isModelListEmpty = availableModels.length === 0;


    const currentModel = availableModels.find(m => m.id === config.model);
    const currentModelLabel = isModelListEmpty
        ? '无可用模型 (请配置 API)'
        : (currentModel ? getModelDisplayInfo(currentModel).displayName : '未知模型');

    // 🚀 [NEW] 获取展示信息 (来源标签)
    const modelDisplayInfo = currentModel ? getModelDisplayInfo(currentModel) : null;

    const truncateModelLabel = useCallback((label: string) => {
        const max = isMobile ? 14 : 18;
        if (label.length <= max) return label;
        const head = Math.max(6, Math.floor(max * 0.6));
        const tail = Math.max(3, max - head - 3);
        return `${label.slice(0, head)}...${label.slice(-tail)} `;
    }, [isMobile]);

    const displayModelLabel = truncateModelLabel(currentModelLabel);

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

    return (
        <div
            id="prompt-bar-container"
            className={`input-bar transition-all duration-300 ${isDragging ? 'ring-2 ring-indigo-500' : ''} ${isMobile ? 'mobile-docked' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onTouchStart={handleContainerTouchStart} // Use new handler
            onTouchEnd={handleContainerTouchEnd}     // Use new handler
            // onClick removed for mobile to prevent accidental showing. 
            // We can keep onClick for desktop if needed, but 'onInteract' was mainly for mobile nav.
            style={{
                ...mobileStyle,
                // On mobile, bottom is 0 (fixed). On desktop, existing logic applies.
                bottom: isMobile ? 0 : '32px'
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
                        // Start scale/pos is handled by initial render, but React might batch it. 
                        // Ideally we render at start, then next frame set target. 
                        // For simplicity in this edit, we rely on CSS animation from internal state if we used a library, 
                        // but here we might need a 2-step state or simple keyframe.
                        // Actually, 'transition-all' + changing style prop works best if we render once.
                        // Let's use a keyframe animation instead for guaranteed "fly from A to B".
                        animation: `flyToTarget 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                        // We need to inject the dynamic keyframes or use inline styles for start/end.
                        // Since keyframes are static, let's use Inline Styles + mounted LayoutEffect? 
                        // EASIER: Just use `transform` and a `useEffect` to trigger the move.
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
                        <button
                            onClick={onClearSource}
                            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-500/10 text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                )}

                {/* Mode Toggle - HIDE on mobile (mode is in MobileTabBar) */}
                {!isMobile && (
                    <div className="flex justify-center mb-2">
                        <div className="relative inline-flex items-center p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', width: 'auto' }}>
                            {/* Sliding highlight background */}
                            <div
                                className="absolute h-[calc(100%-8px)] rounded-md transition-all duration-300 ease-out"
                                style={{
                                    width: '80px',
                                    left: config.mode === GenerationMode.IMAGE ? '4px' : 'calc(50% + 2px)',
                                    backgroundColor: config.mode === GenerationMode.IMAGE ? 'rgba(99, 102, 241, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                                    boxShadow: config.mode === GenerationMode.IMAGE
                                        ? '0 0 8px rgba(99, 102, 241, 0.3)'
                                        : '0 0 8px rgba(168, 85, 247, 0.3)'
                                }}
                            />

                            <button
                                className={`relative z-10 w-20 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-300 ${config.mode === GenerationMode.IMAGE ? 'text-indigo-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                                onClick={() => setConfig(prev => ({ ...prev, mode: GenerationMode.IMAGE }))}
                            >
                                图片
                            </button>
                            <button
                                className={`relative z-10 w-20 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-300 ${config.mode === GenerationMode.VIDEO ? 'text-purple-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                                onClick={() => setConfig(prev => ({ ...prev, mode: GenerationMode.VIDEO }))}
                            >
                                视频
                            </button>
                        </div>
                    </div>
                )}

                {/* Input Area Wrapper with hover detection */}
                <div
                    onMouseEnter={() => {
                        // Clear existing timer
                        if (hoverTimerRef.current) {
                            clearTimeout(hoverTimerRef.current);
                        }
                        // Set 3-second delay before showing upload button
                        hoverTimerRef.current = setTimeout(() => {
                            setIsInputAreaHovered(true);
                        }, 3000);
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
                    {/* Reference Images - Only show when images exist */}
                    {config.referenceImages.length > 0 && (
                        <div
                            ref={refContainerRef}
                            className="flex gap-2 flex-wrap duration-300 mb-2"
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

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
                                // If we stopPropagation here, the parent won't see it.
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
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeReferenceImage(img.id);
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110"
                                            >
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                            </button>
                                        </div>
                                    </React.Fragment>
                                );
                            })}

                            <div
                                id="spacer"
                                className={`transition-all duration-300 ease-[cubic-bezier(0.25, 1, 0.5, 1)] rounded-lg overflow-hidden ${dropTargetIndex === config.referenceImages.length ? 'w-12 opacity-100 h-12' : 'w-0 opacity-0 h-0'}`}
                            >
                                <div className="w-12 h-12 rounded-lg border-2 border-dashed border-indigo-500/30 bg-indigo-500/5"></div>
                            </div>

                            {/* Upload Button - At the end of reference images row - show on hover */}
                            <button
                                className={`w-12 h-12 rounded-md transition-all duration-200 border hover:bg-white/5 flex items-center justify-center flex-shrink-0 ${isInputAreaHovered ? 'opacity-100' : 'opacity-0'
                                    }`}
                                style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    color: 'var(--text-secondary)',
                                    borderColor: 'var(--border-light)',
                                    pointerEvents: isInputAreaHovered ? 'auto' : 'none'
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

                    {/* Upload button when no reference images - show on hover */}
                    {config.referenceImages.length === 0 && isInputAreaHovered && (
                        <button
                            className="w-12 h-12 rounded-md transition-all border hover:bg-white/5 flex items-center justify-center flex-shrink-0 mb-2"
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
                        placeholder={config.mode === GenerationMode.VIDEO ? "描述你想要生成的视频..." : "描述你想要生成的图片..."}
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

                {/* Footer - Mobile: Simplified compact horizontal row. Desktop: Normal layout. */}
                <div className={`input-bar-footer flex items-center ${isMobile ? 'justify-evenly gap-0 flex-nowrap px-0' : 'justify-between'} pt-3 mt-1`} style={isMobile ? {} : { borderTop: '1px solid var(--border-light)' }}>
                    {/* Left: Model & Settings */}
                    {/* Model Button - compact on mobile */}
                    {/* Model Button */}
                    <div className={`relative ${isMobile ? 'flex-shrink' : 'inline-flex flex-shrink-0'}`} style={isMobile ? { display: 'contents' } : {}}>
                        <button
                            id="models-dropdown-trigger"
                            className={`input-bar-model flex items-center justify-center gap-2 px-1.5 md:px-3 py-1 md:py-1.5 rounded-lg border transition-all duration-500 ease-[cubic-bezier(0.23, 1, 0.32, 1)] ${isModelListEmpty
                                ? 'bg-[var(--bg-tertiary)] border-[var(--border-light)] text-[var(--text-tertiary)] cursor-not-allowed'
                                : 'bg-[var(--bg-tertiary)] border-[var(--border-light)] text-[var(--text-secondary)] hover:border-opacity-50'
                                }`}
                            style={{ minWidth: isMobile ? 'auto' : '200px', maxWidth: isMobile ? '80px' : '200px', flexShrink: isMobile ? 1 : 0 }}
                            onClick={() => {
                                if (isModelListEmpty) {
                                    onOpenSettings?.('api-management');
                                } else {
                                    toggleMenu('model');
                                }
                            }}
                        >
                            <span className={`text-xs text-center truncate font-medium whitespace-nowrap transition-all duration-300 ${!isModelListEmpty && modelDisplayInfo ? modelDisplayInfo.badgeColor : ''}`}>
                                {displayModelLabel}
                            </span>

                            {/* 🚀 [NEW] 来源标签 - 改回横排，与文字居中对齐 */}
                            {!isModelListEmpty && modelDisplayInfo && (
                                <span
                                    className={`text-[9px] px-1 py-0.5 rounded border opacity-80 ${modelDisplayInfo.badgeColor}`}
                                    style={{
                                        marginLeft: '4px',
                                        flexShrink: 0
                                    }}
                                >
                                    {modelDisplayInfo.badgeText}
                                </span>
                            )}
                        </button>

                        {/* Dropdown Menu */}
                        {!isModelListEmpty && activeMenu === 'model' && (
                            <div className="absolute bottom-full mb-2 z-20" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                                <div className="dropdown static w-[min(16rem,90vw)] max-w-[90vw] max-h-[360px] overflow-y-auto scrollbar-thin animate-scaleIn origin-bottom p-1 flex flex-col gap-1" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-xl)' }}>
                                    {availableModels.map(model => {
                                        const custom = modelCustomizations[model.id] || {};
                                        const displayName = custom.alias || model.label || model.id;
                                        const advantage = custom.description || model.description || (model.provider ? `${model.provider} 模型` : '自定义模型');
                                        const isPinned = getPinnedModels().includes(model.id);
                                        return (
                                            <button
                                                key={model.id}
                                                className={`w-full px-3 py-2.5 text-left flex flex-col gap-0.5 hover:bg-white/5 transition-colors rounded-md ${config.model === model.id ? 'bg-white/5' : ''}`}
                                                onClick={() => {
                                                    setConfig(prev => ({ ...prev, model: model.id }));
                                                    setActiveMenu(null);
                                                }}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setContextMenu({ x: e.clientX, y: e.clientY, modelId: model.id });
                                                }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs font-medium ${config.model === model.id ? getModelDisplayInfo(model).badgeColor : 'text-[var(--text-primary)]'}`}>
                                                            {getModelDisplayInfo(model).displayName}
                                                        </span>
                                                        {isPinned && <span className="absolute -top-1 -right-1 text-[8px]">📌</span>}
                                                        {/* 来源标签 */}
                                                        <span
                                                            className={`text-[10px] px-1.5 py-0.5 rounded border opacity-80 ${getModelDisplayInfo(model).badgeColor}`}
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            {getModelDisplayInfo(model).badgeText}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Metadata Display */}
                                                {(() => {
                                                    const meta = getModelMetadata(model.id);
                                                    const features = [];
                                                    if (meta?.contextLength) features.push(`${Math.round(meta.contextLength / 1000)}K Context`);
                                                    if (meta?.pricing) {
                                                        const p = meta.pricing;
                                                        // Simple cost display: Input/Output per M
                                                        if (p.prompt === '0' && p.completion === '0') features.push('Free');
                                                        else features.push(`$${p.prompt}/$${p.completion} per M`);
                                                    } else {
                                                        // Fallback or Advantage
                                                        features.push(advantage);
                                                    }

                                                    return (
                                                        <div className="flex flex-col gap-0.5 mt-1">
                                                            <span className="text-[10px] text-[var(--text-tertiary)] leading-tight break-all">ID: {model.id.split('@')[0]}</span>
                                                            {features.length > 0 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {features.map((f, i) => (
                                                                        <span key={i} className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-1 rounded border border-[var(--border-light)]">
                                                                            {f}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </button >
                                        );
                                    })}
                                </div >
                            </div >
                        )}
                    </div >

                    {/* Options Button - Shows current ratio and size, shrink on mobile */}
                    <div className={`relative ${isMobile ? 'flex-shrink' : 'inline-flex'}`} style={isMobile ? { display: 'contents' } : {}}>
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
                            {config.mode === GenerationMode.IMAGE ? (
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
                                    {config.mode === GenerationMode.IMAGE ? (
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
                                opacity: config.mode === GenerationMode.VIDEO ? 0 : 1,
                                visibility: config.mode === GenerationMode.VIDEO ? 'hidden' : 'visible',
                                pointerEvents: config.mode === GenerationMode.VIDEO ? 'none' : 'auto'
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
                                title={groundingSupported ? "Grounding with Google Search" : "当前模型不支持联网模式"}
                            >
                                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 8.8a15 15 0 0 1 20 0" />
                                    <path d="M5 12.5a10 10 0 0 1 14 0" />
                                    <path d="M8.5 16.3a5 5 0 0 1 7 0" />
                                    <line x1="12" y1="20" x2="12.01" y2="20" />
                                </svg>
                                <span className="hidden md:inline">联网</span>
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
                                                {[1, 2, 3, 4].map(count => (
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

                    <button
                        onClick={isGenerating ? onCancel : onGenerate}
                        disabled={!isGenerating && !config.prompt}
                        className={`
                            group relative px-6 h-8 rounded-full flex items-center justify-center gap-2 transition-all duration-300 border
                            ${isGenerating
                                ? 'shadow-[0_4px_12px_rgba(239,68,68,0.4)] hover:shadow-[0_6px_16px_rgba(239,68,68,0.5)]'
                                : `${!isGenerating && !config.prompt
                                    ? 'border-zinc-200 dark:border-zinc-800 cursor-not-allowed' // Disabled
                                    : 'border-zinc-200 dark:border-zinc-700/50 hover:border-blue-500 dark:hover:border-blue-500 dark:hover:bg-white/5' // Enabled
                                }`
                            }
                        `}
                        style={!isGenerating ? {
                            backgroundColor: 'var(--bg-surface)', // 适配主题
                            color: !config.prompt ? 'var(--text-tertiary)' : 'var(--text-primary)', // 适配主题
                            boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                        } : {
                            background: 'linear-gradient(to bottom right, rgb(239, 68, 68), rgb(220, 38, 38))',
                            color: 'rgb(255, 255, 255)'
                        }}
                    >
                        {/* Hover Glow Effect for Non-Generating State (Enabled) */}
                        {!isGenerating && !(!isGenerating && !config.prompt) && (
                            <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                                style={{
                                    background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(59,130,246,0.1) 100%)',
                                    boxShadow: '0 8px 20px -4px rgba(59, 130, 246, 0.6), inset 0 0 0 1px rgba(59, 130, 246, 0.3)'
                                }}
                            />
                        )}

                        {isGenerating ? (
                            <>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                <span className="text-[13px] font-semibold">停止</span>
                            </>
                        ) : (
                            <>
                                <span className="relative z-10 text-[13px] font-semibold">发送</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 transition-transform group-hover:translate-x-1">
                                    <path d="M5 12h14" />
                                    <path d="M12 5l7 7-7 7" />
                                </svg>
                            </>
                        )}
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
        </div >
    );
};

export default PromptBar;
