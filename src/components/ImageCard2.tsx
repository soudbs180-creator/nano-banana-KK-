import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { AspectRatio, GeneratedImage, GenerationMode } from '../types';
import { Download, Trash2, Loader2, ImageOff, Play, Pause, Music } from 'lucide-react';
import { getCardDimensions } from '../utils/styleUtils';
import { generateTagColor } from '../utils/colorUtils';
import { useLazyImage } from '../hooks/useLazyImage';
import { getImage, getOriginalImage } from '../services/imageStorage';
import { getModelBadgeInfo, getProviderBadgeColor } from '../utils/modelBadge';
import { loadImage, cancelImageLoad } from '../services/imageLoader';
import { ImageQuality } from '../services/imageQuality';
import { getModelThemeColor, getModelDisplayName } from '../services/modelCapabilities';

const truncateByChars = (text: string, maxChars: number): string => {
    if (!text) return '';
    return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
};

interface ImageNodeProps {
    image: GeneratedImage;
    position: { x: number; y: number };
    onPositionChange: (id: string, position: { x: number; y: number }) => void;
    onDelete: (id: string) => void;
    onConnectEnd?: (imageId: string) => void;
    onClick?: (imageId: string) => void;
    onDimensionsUpdate?: (id: string, dimensions: string) => void;
    isActive?: boolean;
    canvasTransform?: { x: number; y: number; scale: number }; // Deprecated in favor of zoomScale
    zoomScale?: number;
    isMobile?: boolean;
    isSelected?: boolean;
    onSelect?: () => void;
    highlighted?: boolean;
    onPreview?: (imageId: string) => void;
    isVisible?: boolean; // 🚀 视口可见性控制（从父组件传入）
    onUpdate?: (id: string, updates: Partial<GeneratedImage>) => void; // 🚀 [New] 更新回调
    onDragDelta?: (delta: { x: number; y: number }, sourceNodeId?: string) => void; // 🚀 [New] Relative Drag
}

const ImageNodeComponent: React.FC<ImageNodeProps> = React.memo(({
    image,
    position,
    onPositionChange,
    onDelete,
    onConnectEnd,
    onClick,
    onDimensionsUpdate,
    isActive = false,
    zoomScale = 1,
    isMobile = false,
    isSelected = false,
    onSelect,
    highlighted,
    onPreview,
    isVisible = true, // 🚀 默认可见（向后兼容）
    onUpdate,
    onDragDelta
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const dragCleanupRef = useRef<(() => void) | null>(null); // 🚀 [Fix] Drag Cleanup Ref
    const dragRafRef = useRef<number | null>(null);
    const latestPointerRef = useRef<{ x: number; y: number } | null>(null);

    const [isDragging, setIsDragging] = useState(false);

    const getDims = () => {
        const { width, totalHeight } = getCardDimensions(image.aspectRatio, true);
        return { w: width, h: totalHeight };
    };
    const { w: nodeWidth, h: nodeHeight } = getDims();

    // Local display position to avoid global re-renders during drag
    // Ref to track latest localPos without triggering effect re-runs
    const localPosRef = useRef(position);

    // [FIX] Sync localPosRef with external position updates (when not dragging)
    useEffect(() => {
        if (!isDragging) {
            localPosRef.current = position;
            // Force update DOM if needed
            if (containerRef.current) {
                containerRef.current.style.left = `${Math.round(position.x - nodeWidth / 2)}px`;
                containerRef.current.style.top = `${Math.round(position.y - nodeHeight)}px`;
                containerRef.current.style.transform = 'none';
            }
        }
    }, [position.x, position.y, isDragging, nodeWidth, nodeHeight]);

    const [showLightbox, setShowLightbox] = useState(false);
    const [lightboxZoom, setLightboxZoom] = useState(1);
    const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const panStartPosRef = useRef({ x: 0, y: 0 });
    const lightboxRef = useRef<HTMLDivElement>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartCanvasPos = useRef({ x: 0, y: 0 });
    // Track when lightbox was opened to prevent instant closing on double-click
    const openTimeRef = useRef(0);

    // Stored reference for cleanup (persists across effect calls)
    const wheelCleanupRef = useRef<(() => void) | null>(null);

    const [imgError, setImgError] = useState(false);

    // 🚀 Robust Image Loading State - 优先使用image自带URL作为初始显示（防止刚生成的图片加载失败）
    const initialUrl = (image.url && image.url.length > 0) ? image.url : (image.originalUrl || '');
    const formatInitialUrl = (url: string) => {
        if (!url) return undefined;
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) {
            return url;
        }
        return `data:${image.mimeType || 'image/png'};base64,${url.replace(/[\r\n\s]+/g, '')}`;
    };

    const [displaySrc, setDisplaySrc] = useState<string | undefined>(formatInitialUrl(initialUrl));

    // Reset image error state if displaySrc changes (e.g., loaded from IDB)
    useEffect(() => {
        if (displaySrc) {
            setImgError(false);
        }
    }, [displaySrc]);
    const [currentQuality, setCurrentQuality] = useState<string>('original');
    const qualityLoadingRef = useRef(false); // 防止重复加载
    const lastZoomRef = useRef(zoomScale || 1.0); // 防抖：只在显著变化时切换
    const loadedRef = useRef(false); // 🚀 标记是否已从队列加载
    const [isLoading, setIsLoading] = useState(true); // 🚀 明确的加载状态
    const qualityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 🚀 质量切换防抖
    const [retryTick, setRetryTick] = useState(0); // 主动重试触发器
    const autoRetryRef = useRef(0); // 🚀 自动重试计数器（刷新后IndexedDB竞态）
    const loadGenRef = useRef(0); // 🚀 加载代次计数器（替代 isCancelled 闭包变量）

    // 使用稳定存储键：优先 storageId，其次 image.id
    const imageStorageKey = image.storageId || image.id;

    // Video Control
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(true); // Default autoPlay is true

    // 🚀 根据画布缩放自动选择合适质量 - 使用队列加载优化
    useEffect(() => {
        // 🚀 如果不可见，取消加载并跳过
        if (!isVisible) {
            cancelImageLoad(imageStorageKey);
            if (qualityDebounceRef.current) {
                clearTimeout(qualityDebounceRef.current);
            }
            return;
        }

        // 🚀 如果已加载过且有显示图，完全跳过质量切换（大幅提升性能）
        // 只在首次加载或缩放变化非常大(>50%)时才切换质量
        const currentZoom = zoomScale || 1.0;
        const zoomChange = Math.abs(currentZoom - lastZoomRef.current) / lastZoomRef.current;

        if (displaySrc && loadedRef.current && zoomChange < 0.5) {
            // 🚀 已加载的图片，缩放变化<50%时完全跳过
            return;
        }

        // 正在加载时跳过
        if (qualityLoadingRef.current) return;

        // 🚀 防抖：等待500ms缩放稳定后再切换质量（关键性能优化）
        if (qualityDebounceRef.current) {
            clearTimeout(qualityDebounceRef.current);
        }

        // 🚀 [Fix] 使用 ref 替代闭包变量，避免 cleanup 误取消有效加载结果
        const loadId = ++loadGenRef.current;

        const loadQualityImage = async () => {
            if (qualityLoadingRef.current) return;
            // 🚀 如果已被新一轮加载取代，跳过
            if (loadId !== loadGenRef.current) return;
            qualityLoadingRef.current = true;

            const sanitizeUrl = (url: string | null | undefined): string | undefined => {
                if (!url) return undefined;
                if (url.startsWith('data:')) {
                    const parts = url.split(',');
                    if (parts.length === 2) {
                        return `${parts[0]},${parts[1].replace(/[\r\n\s]+/g, '')}`;
                    }
                    return url;
                }
                if (url.startsWith('http') || url.startsWith('blob:')) {
                    return url;
                }
                // Assume it's raw base64 if it has no recognizable prefix
                const mimeType = image.mimeType || 'image/png';
                return `data:${mimeType};base64,${url.replace(/[\r\n\s]+/g, '')}`;
            };

            try {
                lastZoomRef.current = currentZoom;
                const { getAppropriateQuality } = await import('../services/imageQuality');

                const scale = currentZoom;
                const quality = getAppropriateQuality(scale);

                // 🚀 使用队列加载，优先级基于缩放（越接近1.0优先级越高）
                const priority = Math.round(100 - Math.abs(scale - 1) * 50);
                const url = await loadImage(imageStorageKey, quality, priority);

                // 🚀 检查是否已被取代
                if (loadId !== loadGenRef.current) return;

                // 🚀 关键：只有成功获取新图后才替换，防止闪烁
                if (url) {
                    setDisplaySrc(sanitizeUrl(url));
                    setCurrentQuality(quality);
                    loadedRef.current = true;
                    setIsLoading(false); // 🚀 加载成功
                    autoRetryRef.current = 0; // 重置重试计数
                } else {
                    // 🚀 队列返回null - IndexedDB中没有，尝试多种fallback策略
                    console.debug(`[ImageCard] Queue returned null for ${image.id}, trying fallback recovery...`);

                    // 策略1: 尝试使用storageId直接加载
                    if (image.storageId && image.storageId !== image.id) {
                        try {
                            const recoveredFromStorage = await getImage(image.storageId);
                            if (recoveredFromStorage && loadId === loadGenRef.current) {
                                console.debug(`[ImageCard] ✅ Recovered from storageId: ${image.storageId}`);
                                setDisplaySrc(sanitizeUrl(recoveredFromStorage));
                                loadedRef.current = true;
                                setIsLoading(false);
                                return; // 恢复成功，退出
                            }
                        } catch (err) {
                            console.debug(`[ImageCard] Failed to recover from storageId:`, err);
                        }
                    }

                    // 策略1.5: 通过原图读取通道恢复（支持本地磁盘/OPFS回填到缓存）
                    try {
                        const recoveredOriginal = await getOriginalImage(imageStorageKey);
                        if (recoveredOriginal && loadId === loadGenRef.current) {
                            console.debug(`[ImageCard] ✅ Recovered from original channel: ${imageStorageKey}`);
                            setDisplaySrc(sanitizeUrl(recoveredOriginal));
                            loadedRef.current = true;
                            setIsLoading(false);
                            return;
                        }
                    } catch (err) {
                        console.debug(`[ImageCard] Failed to recover from original channel:`, err);
                    }

                    // 策略2: 使用image自带的URL作为fallback
                    const fallbackUrl = image.originalUrl || image.url;
                    if (fallbackUrl && (fallbackUrl.startsWith('data:') || fallbackUrl.startsWith('http') || fallbackUrl.startsWith('blob:'))) {
                        console.debug(`[ImageCard] Using fallback URL for ${image.id}`);
                        setDisplaySrc(sanitizeUrl(fallbackUrl));
                        loadedRef.current = true;
                        setIsLoading(false);
                    } else {
                        // 🚀 自动重试机制 — IndexedDB 可能尚未就绪（刷新后竞态条件）
                        if (autoRetryRef.current < 3) {
                            const retryDelay = [500, 1500, 3000][autoRetryRef.current] || 3000;
                            autoRetryRef.current++;
                            console.debug(`[ImageCard] ⏳ Auto-retry #${autoRetryRef.current} for ${image.id} in ${retryDelay}ms...`);
                            qualityLoadingRef.current = false;
                            setTimeout(() => {
                                if (loadId === loadGenRef.current) {
                                    loadedRef.current = false;
                                    setRetryTick(prev => prev + 1);
                                }
                            }, retryDelay);
                        } else {
                            // 最终放弃
                            console.debug(`[ImageCard] All recovery strategies failed for ${image.id} after ${autoRetryRef.current} retries`);
                            setIsLoading(false);
                        }
                    }
                }
            } catch (error) {
                console.error('[ImageCard] Failed to load quality image:', error);
            } finally {
                qualityLoadingRef.current = false;
            }
        };

        qualityDebounceRef.current = setTimeout(() => {
            loadQualityImage();
        }, displaySrc ? 500 : 100); // 🚀 已有图片时延迟500ms，首次加载时100ms

        return () => {
            // 🚀 [Fix] 只清除防抖定时器，不取消队列中的加载
            // 取消只在 isVisible=false 时发生（在 effect 开头处理）
            if (qualityDebounceRef.current) {
                clearTimeout(qualityDebounceRef.current);
            }
        };
    }, [zoomScale, image.id, image.storageId, isVisible, retryTick]); // 移除displaySrc依赖

    const handleRetryLoad = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        cancelImageLoad(imageStorageKey);
        if (qualityDebounceRef.current) {
            clearTimeout(qualityDebounceRef.current);
            qualityDebounceRef.current = null;
        }
        qualityLoadingRef.current = false;
        loadedRef.current = false;
        setImgError(false);
        setIsLoading(true);
        setDisplaySrc(undefined);
        setRetryTick(prev => prev + 1);
    }, [imageStorageKey]);

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const { getOriginalImage } = await import('../services/imageStorage');
            const { base64ToBlob, triggerDownload } = await import('../utils/downloadUtils');
            const { notify } = await import('../services/notificationService');

            // 1. 优先从 IndexedDB (受保护层) 或 磁盘恢复 获取原始未压缩数据
            const originalData = await getOriginalImage(image.id);

            let blob: Blob;

            if (originalData) {
                if (originalData.startsWith('data:')) {
                    // Base64 -> Blob (避免使用 fetch 处理 Data URL 的潜在限制)
                    blob = base64ToBlob(originalData);
                } else if (originalData.startsWith('blob:')) {
                    // 已经是 Blob URL
                    const res = await fetch(originalData);
                    blob = await res.blob();
                } else {
                    throw new Error('Unsupported storage format');
                }
            } else if (image.originalUrl && image.originalUrl.startsWith('http')) {
                // 2. 如果本地由于特殊原因找不到，回退到云端原图
                console.log('[ImageCard] Fetching from cloud fallback');
                const response = await fetch(image.originalUrl);
                if (!response.ok) throw new Error('Cloud fetch failed');
                blob = await response.blob();
            } else {
                // 3. 最后兜底：使用当前显示的图片数据
                const fallbackUrl = displaySrc || image.url;
                if (!fallbackUrl) throw new Error('No image data found');

                if (fallbackUrl.startsWith('data:')) {
                    blob = base64ToBlob(fallbackUrl);
                } else {
                    const response = await fetch(fallbackUrl);
                    if (!response.ok) throw new Error('Fallback fetch failed');
                    blob = await response.blob();
                }
            }

            // 生成文件名
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sanitizedPrompt = (image.prompt || 'image').slice(0, 30).replace(/[<>;\"/\\\\|?*]/g, '');
            const isVideoMode = image.mode === GenerationMode.VIDEO || (image.url && image.url.includes('.mp4'));
            const isAudioMode = image.mode === GenerationMode.AUDIO || (image.url && (image.url.includes('.mp3') || image.url.includes('.wav')));
            const extension = isAudioMode ? 'mp3' : (isVideoMode ? 'mp4' : 'png');
            const filename = `${sanitizedPrompt}_${timestamp}.${extension}`;

            // 执行下载
            triggerDownload(blob, filename);

            notify.success('下载成功', `已保存到下载文件夹: ${filename}`);
        } catch (err: any) {
            console.error('Download failed:', err);

            // CORS Fallback for Remote Video URLs
            const fallbackUrl = displaySrc || image.url;
            if (fallbackUrl && fallbackUrl.startsWith('http') && err.message === 'Failed to fetch') {
                console.warn('[ImageCard2] CORS blocked download, opening in new tab instead.');
                window.open(fallbackUrl, '_blank');
                return;
            }

            const { notify } = await import('../services/notificationService');
            notify.error(
                '下载失败',
                '原图可能无法访问',
                `ImageCard Download Error: ${err.message || err}`
            );
        }
    };

    // 🚀 [恢复] 拖拽逻辑所需的引用和处理函数
    const wasDraggingRef = useRef(false);
    const lastMousePos = useRef<{ x: number; y: number } | null>(null); // To track previous mouse position for delta

    useEffect(() => {
        return () => {
            if (dragRafRef.current !== null) {
                cancelAnimationFrame(dragRafRef.current);
                dragRafRef.current = null;
            }
        };
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // Handle Right Click (2) - Select Only
        if ('button' in e && e.button === 2) {
            e.stopPropagation();
            if (onSelect) onSelect();
            return;
        }

        // 阻止事件冒泡到 Canvas，通过 global listeners 处理拖拽
        e.stopPropagation();

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        setIsDragging(true);
        wasDraggingRef.current = false;

        // 🚀 [Fix] Auto-Select logic for dragging unselected cards
        // If we start dragging an unselected card and NOT holding Shift/Ctrl, 
        // we should select ONLY this card to avoid dragging other selected cards
        if (!isSelected && onSelect) {
            // 检查是否按住了多选键
            const mouseEvent = e as React.MouseEvent;
            const isMultiSelect = mouseEvent.shiftKey || mouseEvent.ctrlKey || mouseEvent.metaKey;

            if (!isMultiSelect) {
                // 如果没有按多选键，先清除其他选择，只选中当前卡片
                // 使用自定义事件标记这是拖拽开始的选择
                (window as any).__dragSelectStart = true;
                onSelect();
                delete (window as any).__dragSelectStart;
            } else {
                // 按住了多选键，添加到选择
                onSelect();
            }
        }

        dragStartPos.current = { x: clientX, y: clientY };
        // Store current position as fixed base for this drag (avoid cumulative drift)
        dragStartCanvasPos.current = { x: position.x, y: position.y };
        localPosRef.current = position;
        lastMousePos.current = { x: clientX, y: clientY }; // Initialize lastMousePos

        // 绑定全局事件
        const handleMouseMove = (mvEvent: MouseEvent | TouchEvent) => {
            mvEvent.preventDefault(); // 防止滚动
            const mvClientX = 'touches' in mvEvent ? mvEvent.touches[0].clientX : (mvEvent as MouseEvent).clientX;
            const mvClientY = 'touches' in mvEvent ? mvEvent.touches[0].clientY : (mvEvent as MouseEvent).clientY;

            latestPointerRef.current = { x: mvClientX, y: mvClientY };
            if (dragRafRef.current !== null) return;

            dragRafRef.current = requestAnimationFrame(() => {
                const pointer = latestPointerRef.current;
                if (!pointer) {
                    dragRafRef.current = null;
                    return;
                }

                const dx = pointer.x - dragStartPos.current.x;
                const dy = pointer.y - dragStartPos.current.y;

                // 只有移动超过一定距离才视为拖拽
                if (dx * dx + dy * dy > 25) {
                    wasDraggingRef.current = true;
                }

                const scale = zoomScale || 1;
                const rawPos = {
                    x: dragStartCanvasPos.current.x + dx / scale,
                    y: dragStartCanvasPos.current.y + dy / scale
                };

                // Snap world coords to screen pixel grid (reduces text baseline flutter under zoom)
                const newPos = {
                    x: Math.round(rawPos.x * scale) / scale,
                    y: Math.round(rawPos.y * scale) / scale
                };
                const prevPos = localPosRef.current;

                // 2. Direct DOM Update (Visuals)
                if (containerRef.current) {
                    containerRef.current.style.left = `${Math.round(newPos.x - nodeWidth / 2)}px`;
                    containerRef.current.style.top = `${Math.round(newPos.y - nodeHeight)}px`;
                    containerRef.current.style.transform = 'none';
                }

                localPosRef.current = newPos;

                // 3. Global Update (Logic)
                if (onDragDelta && lastMousePos.current) {
                    const stepX = newPos.x - prevPos.x;
                    const stepY = newPos.y - prevPos.y;
                    onDragDelta({ x: stepX, y: stepY }, image.id);
                } else if (onPositionChange) {
                    // Fallback 只移动当前卡片
                    onPositionChange(image.id, newPos);
                }
                lastMousePos.current = { x: pointer.x, y: pointer.y };
                dragRafRef.current = null;
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
            dragCleanupRef.current = null;
            latestPointerRef.current = null;
            if (dragRafRef.current !== null) {
                cancelAnimationFrame(dragRafRef.current);
                dragRafRef.current = null;
            }

            // Final Commit - Only if NOT using delta (Delta commits incrementally)
            if (!onDragDelta) {
                // Calculate final pos
                // ...
                // Actually existing code relied on handleMouseMove firing last update.
                // But handleMouseUp generally doesn't fire move.
            }
        };



        // 🚀 Store cleanup for external cancellation (e.g. HTML5 Drag)
        dragCleanupRef.current = handleMouseUp;

        window.addEventListener('mousemove', handleMouseMove, { passive: false });
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchmove', handleMouseMove, { passive: false });
        window.addEventListener('touchend', handleMouseUp);

    }, [
        image.id,
        position,
        zoomScale,
        onPositionChange,
        onDragDelta,
        onSelect,
        isSelected,
        nodeWidth,
        nodeHeight
    ]);

    // 🚀 [New] Alias Editing Logic
    const [isEditingAlias, setIsEditingAlias] = useState(false);
    const [aliasValue, setAliasValue] = useState(image.alias || image.fileName || 'Image');

    const handleAliasCommit = () => {
        setIsEditingAlias(false);
        if (aliasValue !== image.alias) {
            onUpdate?.(image.id, { alias: aliasValue });
        }
    };

    const handleImageClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // 忽略按钮点击 (如删除/下载)
        if ((e.target as HTMLElement).closest('button')) return;
        if ((e.target as HTMLElement).closest('input')) return; // Ignore input clicks

        // 如果刚刚拖拽过,忽略点击(防止拖拽结束时误触发)
        if (wasDraggingRef.current && e.type !== 'dblclick' && e.detail !== 2) return;

        // 🚀 [修复] 单击/双击均打开灯箱
        if (!wasDraggingRef.current && onPreview) {
            onPreview(image.id);
        }
    };

    const borderScale = zoomScale || 1;
    const adaptiveBorderWidth = Math.max(1, 1.5 / borderScale);
    const adaptiveSubBorderWidth = Math.max(1, 1.2 / borderScale);
    const renderPos = isDragging ? localPosRef.current : position;

    return (
        // ... (Wrapper Divs) ...
        <>
            <div
                ref={containerRef}
                className={`absolute flex flex-col items-center group animate-cardPopIn select-none ${isActive ? 'z-15' : 'z-5'}`}
                // ... (Style) ...
                style={{
                    left: Math.round(renderPos.x - nodeWidth / 2),
                    top: Math.round(renderPos.y - nodeHeight),
                    width: nodeWidth,
                    transform: 'none',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
                    // Ensure subpixel text antialiasing is NOT destroyed entirely 
                    willChange: 'auto',
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!wasDraggingRef.current) onClick?.(image.id);
                }}
            >
                <div
                    className={`
                        relative w-full overflow-hidden
                        border shadow-xl
                        ${isDragging ? '' : 'transition-shadow'}
                        ${isSelected ? 'shadow-2xl' : 'hover:shadow-2xl'}
                        ${highlighted ? 'scale-[1.02] z-50' : ''}
                    `}
                    style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: image.error && !image.isGenerating ?
                            'rgb(239, 68, 68)' :
                            isSelected ?
                                'var(--selected-border)' :
                                isActive ?
                                    'var(--accent-gold)' :
                                    highlighted ?
                                        'var(--accent-gold)' :
                                        'var(--border-default)',
                        borderRadius: 'var(--radius-lg)', // 12px
                        borderWidth: adaptiveBorderWidth,
                        boxShadow: image.error && !image.isGenerating ?
                            '0 0 12px rgba(239, 68, 68, 0.3), 0 0 4px rgba(239, 68, 68, 0.2)' :
                            isSelected ?
                                'var(--glow-blue)' :
                                highlighted ?
                                    'var(--glow-gold)' :
                                    'var(--shadow-xl)',
                        transitionDuration: isDragging ? '0ms' : 'var(--duration-normal)',
                        transitionProperty: 'box-shadow, border-color'
                    }}
                >
                    {/* Connection Point */}
                    <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-transparent hover:bg-indigo-500/50 rounded-full z-50 cursor-crosshair"
                        onMouseUp={() => onConnectEnd?.(image.id)}
                    />

                    {/* 图片视图，支持懒加载/虚拟化 - 单击打开灯箱 */}
                    <div
                        className="relative w-full cursor-pointer bg-[var(--bg-tertiary)]"
                        onClick={handleImageClick}
                        onDoubleClick={handleImageClick}
                    >
                        {/* 🚀 [FIX] 图片独立容器：aspectRatio + overflow-hidden 锁定图片尺寸
                            图片使用 absolute 定位填满容器，不参与容器高度计算
                            防止拖拽时图片拉伸导致信息栏被挤压 */}
                        <div
                            className="relative w-full overflow-hidden"
                            style={{ aspectRatio: image.aspectRatio.replace(':', '/') }}
                        >
                            {!imgError && displaySrc ? (
                                (image.mode === GenerationMode.AUDIO || displaySrc.endsWith('.mp3') || displaySrc.endsWith('.wav')) ? (
                                    <div className="relative w-full h-full group/audio bg-gradient-to-br from-indigo-900/90 to-purple-900/90 flex flex-col items-center justify-center overflow-hidden">
                                        <Music size={48} className="text-indigo-300/30 mb-4 z-10 pointer-events-none" />
                                        <audio
                                            src={displaySrc}
                                            controls
                                            controlsList="nodownload"
                                            className="relative z-10 w-11/12 h-10 opacity-80 hover:opacity-100 transition-opacity"
                                            onError={() => {
                                                console.warn('[ImageCard] Audio load error for', image.id);
                                                setImgError(true);
                                            }}
                                            onPlay={(e) => { e.stopPropagation(); setIsPlaying(true); }}
                                            onPause={(e) => { e.stopPropagation(); setIsPlaying(false); }}
                                            onClick={(e) => e.stopPropagation()}
                                            onDoubleClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                ) : (image.mode === GenerationMode.VIDEO || displaySrc.startsWith('data:video') || displaySrc.endsWith('.mp4')) ? (
                                    <div className="relative w-full h-full group/video">
                                        <video
                                            ref={videoRef}
                                            src={displaySrc}
                                            className="w-full h-full object-cover block select-none"
                                            muted loop playsInline
                                            onPlay={() => setIsPlaying(true)}
                                            onPause={() => setIsPlaying(false)}
                                            onError={() => {
                                                console.warn('[ImageCard] Video load error for', image.id);
                                                setImgError(true);
                                            }}
                                        />
                                        {/* Play/Pause Overlay with smooth transitions */}
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/video:opacity-100 transition-opacity duration-300 bg-black/0 hover:bg-black/20">
                                            <button
                                                className="w-12 h-12 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white transition-all duration-300 transform hover:scale-110 active:scale-95 shadow-lg border border-white/20"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (videoRef.current) {
                                                        if (videoRef.current.paused) videoRef.current.play();
                                                        else videoRef.current.pause();
                                                    }
                                                }}
                                            >
                                                {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <img
                                        src={displaySrc}
                                        decoding="async"
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        alt={image.prompt}
                                        style={{
                                            color: 'transparent',
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            display: 'block',
                                            imageRendering: 'auto',
                                        }}

                                        onError={(e) => {
                                            setImgError(true);
                                        }}
                                        onLoad={(e) => {
                                            setImgError(false);
                                            const img = e.target as HTMLImageElement;
                                            const dims = `${img.naturalWidth}x${img.naturalHeight}`;
                                            if (onDimensionsUpdate && image.dimensions !== dims) {
                                                onDimensionsUpdate(image.id, dims);
                                            }
                                        }}
                                        className="w-full h-full block select-none"
                                        draggable={true}
                                        onDragStart={(e) => {
                                            // HTML5 Drag for Data Transfer (to PromptBar)
                                            e.stopPropagation();
                                            const url = displaySrc || image.url;
                                            if (url) {
                                                e.dataTransfer.setData('text/plain', url);
                                                // [NEW] Pass structured data for efficient reuse (consistent with PromptNode)
                                                // 🚀 [FIX] Stop Canvas Drag when HTML5 Drag starts
                                                if (dragCleanupRef.current) dragCleanupRef.current();

                                                e.dataTransfer.setData('application/x-kk-image-ref', JSON.stringify({
                                                    storageId: image.storageId || image.id,
                                                    mimeType: 'image/png', // Default, hard to know without fetch or magic
                                                    source: 'image-card',
                                                    data: url.startsWith('data:') ? url : undefined
                                                }));
                                                e.dataTransfer.effectAllowed = 'copy';

                                                // 🚀 [NEW] 如果 URL 是 data URL，同时保存到本地文件系统
                                                if (url.startsWith('data:')) {
                                                    const storageId = image.storageId || image.id;
                                                    import('../services/fileSystemService').then(({ fileSystemService }) => {
                                                        const handle = fileSystemService.getGlobalHandle();
                                                        if (handle) {
                                                            const matches = url.match(/^data:[^,]+,(.+)$/);
                                                            if (matches && matches[1]) {
                                                                fileSystemService.saveReferenceImage(
                                                                    handle,
                                                                    storageId,
                                                                    matches[1],
                                                                    image.mimeType || 'image/png'
                                                                ).catch(err => {
                                                                    console.warn('[ImageCard2] Failed to save reference to file system:', err);
                                                                });
                                                            }
                                                        }
                                                    });
                                                }
                                            }
                                        }}
                                    />
                                )
                            ) : (

                                <div className="w-full h-full min-h-[150px] flex flex-col items-center justify-center text-[var(--text-secondary)] p-4 text-center">

                                    {/* 🚀 加载/恢复状态 - 居中显示 */}
                                    {(isLoading || (!imgError && !displaySrc)) ? (
                                        // 加载状态由全局遮罩处理，这里显示空白占位
                                        <div className="absolute inset-0 bg-transparent" />
                                    ) : (
                                        <>
                                            <ImageOff size={24} className="mb-2 opacity-50 text-rose-400" />
                                            <span className="text-xs text-rose-300">
                                                {/* 统一视频判断：mode/data:video/.mp4/image.url */}
                                                {(image.mode === GenerationMode.VIDEO ||
                                                    image.url?.includes('.mp4') ||
                                                    image.url?.startsWith('data:video') ||
                                                    displaySrc?.includes('.mp4') ||
                                                    displaySrc?.startsWith('data:video'))
                                                    ? '视频加载失败'
                                                    : '图片加载失败'}
                                            </span>
                                            <span className="text-[9px] opacity-60">
                                                {(image.mode === GenerationMode.AUDIO || displaySrc?.includes('.mp3'))
                                                    ? '(Audio Load Error)'
                                                    : (image.mode === GenerationMode.VIDEO ||
                                                        image.url?.includes('.mp4') ||
                                                        image.url?.startsWith('data:video') ||
                                                        displaySrc?.includes('.mp4') ||
                                                        displaySrc?.startsWith('data:video'))
                                                        ? '(Video Load Error)'
                                                        : '(Image Load Error)'}
                                            </span>
                                            {/* Retry Button */}
                                            <button
                                                onClick={handleRetryLoad}
                                                className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                                            >
                                                点击重试
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>{/* 关闭图片独立容器 */}


                        {/* Tags Layer - REMOVED: Tags are now only in footer row, not floating on image */}

                        {/* 🚀 错误状态遮罩 — 红色标志显示生成错误/超时 */}
                        {image.error && !image.isGenerating && (
                            <div
                                className="absolute inset-0 z-40 rounded-lg flex flex-col items-center justify-center p-4 text-center"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(220,38,38,0.15) 0%, rgba(153,27,27,0.25) 100%)',
                                    backdropFilter: 'blur(2px)'
                                }}
                            >
                                {/* 红色警告图标 */}
                                <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-2">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(239,68,68)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                </div>
                                {/* 错误分类 */}
                                <span className="text-xs font-semibold text-red-400 mb-1">
                                    {image.error.toLowerCase().includes('timeout') || image.error.toLowerCase().includes('timed out') || image.error.toLowerCase().includes('超时')
                                        ? '⏱ 生成超时'
                                        : image.error.toLowerCase().includes('cancel') || image.error.toLowerCase().includes('取消')
                                            ? '🚫 已取消'
                                            : '❌ 生成错误'}
                                </span>
                                {/* 截断后的错误信息 */}
                                <span className="text-[10px] text-red-300/70 leading-tight max-w-full overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
                                    {image.error.length > 120 ? image.error.slice(0, 120) + '...' : image.error}
                                </span>
                            </div>
                        )}

                        {/* 🚀 全局加载遮罩 - 覆盖整个卡片包括信息栏 */}
                        {(isLoading || (!imgError && !displaySrc)) && !image.error && (
                            <div
                                className="absolute inset-0 z-50 rounded-lg flex flex-col items-center justify-center bg-black/60"
                                style={{
                                    animation: 'shimmerInward 2s ease-in-out infinite',
                                    top: 0,
                                    bottom: 0
                                }}
                            >
                                <span className="text-xs text-white/70 mb-2">
                                    正在加载...
                                </span>
                            </div>
                        )}

                        {/* Footer - 根据卡片类型显示不同布局 */}
                        <div
                            className="px-2 py-2 flex flex-col gap-1.5 border-t-2 relative z-10 box-border cursor-pointer"
                            style={{
                                backgroundColor: 'var(--bg-elevated)',
                                borderTopColor: 'var(--border-medium)',
                                borderTopWidth: adaptiveSubBorderWidth,
                                minHeight: image.orphaned ? '32px' : (image.isGenerating ? '32px' : 'auto')
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!wasDraggingRef.current) onClick?.(image.id);
                            }}
                        >
                            {/* 状态1: 孤独副卡（从外面拖入的图片）- 只有一层 */}
                            {image.orphaned && (
                                <div className="flex items-center justify-between h-5">
                                    {/* 左侧：文件名 + 像素尺寸 */}
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {isEditingAlias ? (
                                            <input
                                                className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-[var(--text-primary)] leading-none p-0"
                                                value={aliasValue}
                                                onChange={(e) => setAliasValue(e.target.value)}
                                                onBlur={handleAliasCommit}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleAliasCommit(); }}
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span
                                                className="text-xs font-medium text-[var(--text-secondary)] truncate cursor-text hover:text-[var(--text-primary)]"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAliasValue(image.alias || image.fileName || 'Image');
                                                    setIsEditingAlias(true);
                                                }}
                                                title={image.alias || image.fileName || 'Reference Image'}
                                            >
                                                {image.alias || image.fileName || 'Reference Image'}
                                            </span>
                                        )}
                                        {/* 像素尺寸 */}
                                        {image.dimensions && (
                                            <span className="text-2xs text-[var(--text-tertiary)] whitespace-nowrap">
                                                {image.dimensions}
                                            </span>
                                        )}
                                    </div>
                                    {/* 右侧：删除按钮 */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                                        className="hover:text-[var(--accent-red)] transition-colors p-0.5 ml-2"
                                        title="删除"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            )}

                            {/* 状态2: 生成过程中 - 只有一层，居中显示 */}
                            {!image.orphaned && image.isGenerating && (
                                <div className="flex items-center justify-center h-5 gap-2 flex-nowrap">
                                    <div className="flex items-center gap-1 px-2 h-5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-light)] min-w-0 max-w-[170px]">
                                        <span className={`text-2xs leading-none font-medium whitespace-nowrap truncate ${(() => {
                                            const modelId = image.model || '';
                                            return getModelThemeColor(modelId);
                                        })()}`} title={image.modelLabel || image.model || 'AI'}>
                                            {truncateByChars(image.modelLabel || image.model || 'AI', 15)}
                                        </span>
                                        {(image.providerLabel || image.provider) && (
                                            <span
                                                className={`text-[9px] leading-none px-1 py-0.5 rounded whitespace-nowrap border shrink-0 ${getProviderBadgeColor(image.providerLabel || image.provider)}`}
                                                title={image.providerLabel || image.provider}
                                            >
                                                {truncateByChars(image.providerLabel || image.provider || '', 5)}
                                            </span>
                                        )}
                                    </div>
                                    {/* 参数也加框 */}
                                    <div className="flex items-center gap-1 px-2 h-5 rounded-lg border bg-[var(--bg-tertiary)] border-[var(--border-light)]">
                                        <span className="text-2xs leading-none text-[var(--text-secondary)] whitespace-nowrap">
                                            {image.aspectRatio || '1:1'} · {(image.mode === GenerationMode.VIDEO || (image.imageSize as any) === 'Video') ? '720p' : (image.imageSize || '1K')}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* 状态3: 生成完成 - 两层或三层结构 */}
                            {!image.orphaned && !image.isGenerating && (
                                <>
                                    {/* 第一层：左侧模型和参数，右侧下载和删除 */}
                                    <div className="flex items-center justify-between h-5 gap-2 w-full">
                                        <div className="flex flex-1 items-center gap-1.5 min-w-0">
                                            {/* Model Name + Provider Badge inside ONE box */}
                                            <div className="inline-flex items-center w-fit min-w-0 max-w-[240px] shrink px-1.5 h-5 rounded-md border bg-[var(--bg-tertiary)] border-[var(--border-light)] gap-1.5 overflow-hidden">
                                                {(() => {
                                                    const modelIdForBadge = image.model || image.id;
                                                    const modelTextForBadge = image.modelLabel || image.model || image.id;
                                                    const badge = getModelBadgeInfo({
                                                        id: modelIdForBadge,
                                                        label: modelTextForBadge,
                                                        provider: image.providerLabel || image.provider
                                                    });
                                                    return (
                                                        <span className={`text-2xs leading-none font-medium whitespace-nowrap truncate min-w-0 max-w-[160px] ${badge.colorClass}`} title={badge.text}>
                                                            {truncateByChars(badge.text, 15)}
                                                        </span>
                                                    );
                                                })()}
                                                {(image.providerLabel || image.provider) && (
                                                    <span
                                                        className={`text-[9px] leading-none px-1 py-0.5 rounded whitespace-nowrap border shrink-0 ${getProviderBadgeColor(image.providerLabel || image.provider)}`}
                                                        title={image.provider || image.providerLabel}
                                                    >
                                                        {truncateByChars(image.providerLabel || image.provider || '', 5)}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Aspect Ratio / Size */}
                                            <div className="flex flex-shrink-0 items-center px-1.5 h-5 rounded-md border bg-[var(--bg-tertiary)] border-[var(--border-light)]">
                                                <span className="text-2xs leading-none text-[var(--text-secondary)] whitespace-nowrap shrink-0">
                                                    {image.aspectRatio || '1:1'} · {(image.mode === GenerationMode.VIDEO || (image.imageSize as any) === 'Video') ? '720p' : (image.imageSize || '1K')}
                                                </span>
                                            </div>
                                        </div>
                                        {/* 右侧：下载 + 删除 */}
                                        <div className="flex items-center gap-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                                            <button onClick={handleDownload} className="hover:text-[var(--accent-blue)] transition-colors p-0.5" title="下载原图">
                                                <Download size={10} />
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); onDelete(image.id); }} className="hover:text-[var(--accent-red)] transition-colors p-0.5" title="删除">
                                                <Trash2 size={10} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Delicate Separator 1 */}
                                    <div className="w-full h-px bg-[var(--text-primary)]/5 my-0.5"></div>

                                    {/* 第二层：居中显示耗时、令牌、费用 - 使用缩小字号 */}
                                    <div className="flex items-center justify-center gap-2 h-5 text-2xs leading-none text-[var(--text-secondary)]">
                                        {image.generationTime ? (
                                            <span title="耗时" className="text-blue-400">耗时 {(image.generationTime / 1000).toFixed(1)}s</span>
                                        ) : (
                                            <span className="text-blue-400/50">耗时 --</span>
                                        )}
                                        <span className="text-[var(--border-medium)]">|</span>
                                        <span title="Token消耗" className="text-emerald-400">令牌 {image.tokens || 0}</span>
                                        <span className="text-[var(--border-medium)]">|</span>
                                        <span title="费用" className="text-amber-400">费用 ${image.cost ? image.cost.toFixed(4) : '0'}</span>
                                    </div>

                                    {/* Delicate Separator 2 - Only if tags exist */}
                                    {image.tags && image.tags.length > 0 && (
                                        <div className="w-full h-px bg-[var(--text-primary)]/5 my-0.5"></div>
                                    )}

                                    {/* 第三层：标签（如果有），最多4个，每个最多6个字 */}
                                    {image.tags && image.tags.length > 0 && (
                                        <div className="flex items-center justify-center gap-1.5 flex-wrap pt-0.5">
                                            {image.tags.slice(0, 4).map(tag => {
                                                const colors = generateTagColor(tag);
                                                // 截断超过6个字的标签
                                                const displayTag = tag.length > 6 ? tag.slice(0, 6) : tag;
                                                return (
                                                    <span
                                                        key={tag}
                                                        className="flex items-center justify-center px-2 h-5 text-xs font-medium rounded-lg whitespace-nowrap border"
                                                        style={{
                                                            backgroundColor: colors.bg,
                                                            color: colors.text,
                                                            borderColor: colors.border
                                                        }}
                                                        title={tag}
                                                    >
                                                        #{displayTag}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div >

        </>
    );
}, (prev, next) => {
    // 🚀 [Fix] Only compare state/data props to avoid rendering on inline function identity changes
    return (
        prev.image === next.image &&
        prev.position.x === next.position.x &&
        prev.position.y === next.position.y &&
        prev.isActive === next.isActive &&
        prev.zoomScale === next.zoomScale &&
        prev.isSelected === next.isSelected &&
        prev.highlighted === next.highlighted &&
        prev.isVisible === next.isVisible
    );
});

export const ImageCard2 = ImageNodeComponent;
export default ImageNodeComponent;
