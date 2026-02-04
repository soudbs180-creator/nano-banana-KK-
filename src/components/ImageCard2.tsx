import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { AspectRatio, GeneratedImage, GenerationMode } from '../types';
import { Download, Trash2, Loader2, ImageOff } from 'lucide-react';
import { getCardDimensions } from '../utils/styleUtils';
import { generateTagColor } from '../utils/colorUtils';
import { useLazyImage } from '../hooks/useLazyImage';
import { getImage } from '../services/imageStorage';
import { loadImage, cancelImageLoad } from '../services/imageLoader';
import { ImageQuality } from '../services/imageQuality';

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
    isVisible = true // 🚀 默认可见（向后兼容）
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDragging, setIsDragging] = useState(false);

    // Local display position to avoid global re-renders during drag
    // Ref to track latest localPos without triggering effect re-runs
    const localPosRef = useRef(position);

    // [FIX] Sync localPosRef with external position updates (when not dragging)
    useEffect(() => {
        if (!isDragging) {
            localPosRef.current = position;
            // Force DOM update to match prop
            if (containerRef.current) {
                containerRef.current.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -100%)`;
            }
        }
    }, [position.x, position.y, isDragging]);

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
    const [isRecovering, setIsRecovering] = useState(false); // [NEW] Track active recovery to hide broken IMG
    const recoveryAttemptsRef = useRef(0); // 🚀 防止恢复循环 - 最多尝试2次
    const [lightboxOriginalUrl, setLightboxOriginalUrl] = useState<string | null>(null);
    const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false); // 视频默认暂停
    const videoRef = useRef<HTMLVideoElement>(null);

    // 🚀 Robust Image Loading State - 初始化为undefined强制队列加载
    const [displaySrc, setDisplaySrc] = useState<string | undefined>(undefined);
    const [currentQuality, setCurrentQuality] = useState<string>('original');
    const qualityLoadingRef = useRef(false); // 防止重复加载
    const lastZoomRef = useRef(zoomScale || 1.0); // 防抖：只在显著变化时切换
    const loadedRef = useRef(false); // 🚀 标记是否已从队列加载
    const [isLoading, setIsLoading] = useState(true); // 🚀 明确的加载状态
    const qualityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 🚀 质量切换防抖

    // 🚀 根据画布缩放自动选择合适质量 - 使用队列加载优化
    useEffect(() => {
        // 🚀 如果不可见，取消加载并跳过
        if (!isVisible) {
            cancelImageLoad(image.id);
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

        qualityDebounceRef.current = setTimeout(async () => {
            let isCancelled = false;

            try {
                qualityLoadingRef.current = true;
                lastZoomRef.current = currentZoom;

                const { getAppropriateQuality } = await import('../services/imageQuality');

                const scale = currentZoom;
                const quality = getAppropriateQuality(scale);

                // 🚀 使用队列加载，优先级基于缩放（越接近1.0优先级越高）
                const priority = Math.round(100 - Math.abs(scale - 1) * 50);
                const url = await loadImage(image.id, quality, priority);

                // 🚀 关键：只有成功获取新图后才替换，防止闪烁
                if (!isCancelled && url) {
                    setDisplaySrc(url);
                    setCurrentQuality(quality);
                    loadedRef.current = true;
                    setIsLoading(false); // 🚀 加载成功
                } else if (!isCancelled && !url) {
                    // 🚀 队列返回null - IndexedDB中没有，尝试使用image自带的URL作为fallback
                    const fallbackUrl = image.originalUrl || image.url;
                    if (fallbackUrl && (fallbackUrl.startsWith('data:') || fallbackUrl.startsWith('http') || fallbackUrl.startsWith('blob:'))) {
                        console.log(`[ImageCard] Queue returned null, using fallback URL for ${image.id}`);
                        setDisplaySrc(fallbackUrl);
                        loadedRef.current = true;
                        setIsLoading(false);
                    } else {
                        // 🚀 没有可用fallback，触发恢复流程
                        console.log(`[ImageCard] No fallback available, triggering recovery for ${image.id}`);
                        setIsLoading(false);
                        // 延迟触发恢复避免立即循环
                        setTimeout(() => recoverImage(), 100);
                    }
                }
            } catch (error) {
                console.error('[ImageCard] Failed to load quality image:', error);
            } finally {
                qualityLoadingRef.current = false;
            }
        }, displaySrc ? 500 : 100); // 🚀 已有图片时延迟500ms，首次加载时100ms

        return () => {
            if (qualityDebounceRef.current) {
                clearTimeout(qualityDebounceRef.current);
            }
            cancelImageLoad(image.id);
        };
    }, [zoomScale, image.id, isVisible]); // 移除displaySrc依赖

    // 🚀 释放Bl ob URL防止内存泄漏
    useEffect(() => {
        return () => {
            if (displaySrc && displaySrc.startsWith('blob:')) {
                URL.revokeObjectURL(displaySrc);
                console.log(`[ImageCard] Revoked Blob URL for ${image.id}`);
            }
        };
    }, [displaySrc, image.id]);

    // 🚀 [已移除] 之前这里有一个会覆盖displaySrc的useEffect，导致加载循环
    // 现在完全依赖队列加载流程，不再同步image.url到displaySrc



    // Helper: Attempt to recover image from cache
    const recoverImage = useCallback(async () => {
        if (isRecovering) return;

        // 🚀 防止恢复循环：超过2次直接失败
        if (recoveryAttemptsRef.current >= 2) {
            console.warn(`[ImageCard] Max recovery attempts reached for ${image.id}`);
            setImgError(true);
            setIsRecovering(false);
            return;
        }
        recoveryAttemptsRef.current++;

        setIsRecovering(true);
        setImgError(false);
        console.log(`[ImageCard] Attempting recovery (${recoveryAttemptsRef.current}/2) for ${image.id}...`);

        try {
            // 1. Try IndexedDB
            const { getImage } = await import('../services/imageStorage');
            // Fast timeout for IDB
            const idbPromise = getImage(image.id);
            const timeoutPromise = new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 2000));

            const cached = await Promise.race([idbPromise, timeoutPromise]);

            if (cached) {
                console.log(`[ImageCard] Recovered ${image.id} from IDB`);
                setDisplaySrc(cached);
                setIsRecovering(false);
                return;
            }

            // 2. Try Local File Handle (if applicable)
            const { getStorageMode, getLocalFolderHandle } = await import('../services/storagePreference');
            const mode = await getStorageMode();
            if (mode === 'local') {
                const handle = await getLocalFolderHandle();
                if (handle) {
                    const { fileSystemService } = await import('../services/fileSystemService');
                    const blob = await fileSystemService.loadOriginalFromDisk(handle, image.id);
                    if (blob) {
                        const objectUrl = URL.createObjectURL(blob);
                        setDisplaySrc(objectUrl);
                        setIsRecovering(false);
                        return;
                    }
                }
            }

            // 3. Fallback: If Original URL exists and is different, try it once
            if (image.originalUrl && image.originalUrl !== image.url) {
                setDisplaySrc(image.originalUrl);
                setIsRecovering(false); // Let the browser try to load this new src
                return;
            }

            // If we got here, recovery failed
            console.warn(`[ImageCard] Recovery failed to find alternative for ${image.id}`);
            setImgError(true);
            setIsRecovering(false);

        } catch (error) {
            console.error('[ImageCard] Recovery exception:', error);
            setImgError(true);
            setIsRecovering(false);
        }
    }, [image.id, image.url, image.originalUrl]);

    // 🚀 [简化] 自动恢复逻辑已移除，现在由主队列加载流程的fallback统一处理

    // Construct high-res URL for lightbox
    const highResUrl = image.originalUrl || displaySrc || image.url;

    // 🚀 Load lightbox image: 先显示预览，后台加载原图
    useEffect(() => {
        if (showLightbox && !isLoadingOriginal) {
            setIsLoadingOriginal(true);
            (async () => {
                const { getImageByQuality, saveImage } = await import('../services/imageStorage');
                const { ImageQuality, getQualityStorageId } = await import('../services/imageQuality');

                // 🚀 优化：先立即显示preview质量，然后加载原图
                if (!lightboxOriginalUrl) {
                    // Step 1: 先显示preview（如果有）
                    const previewImage = await getImageByQuality(image.id, ImageQuality.PREVIEW);
                    if (previewImage && previewImage.startsWith('data:')) {
                        setLightboxOriginalUrl(previewImage);
                        console.log(`[Lightbox] Showing PREVIEW first for ${image.id}`);
                    } else {
                        // Fallback: 显示当前displaySrc
                        setLightboxOriginalUrl(displaySrc || image.url);
                    }
                }

                // Step 2: 后台加载原图
                const originalImage = await getImageByQuality(image.id, ImageQuality.ORIGINAL);
                if (originalImage && originalImage.startsWith('data:')) {
                    setLightboxOriginalUrl(originalImage);
                    setIsLoadingOriginal(false);
                    console.log(`[Lightbox] Loaded ORIGINAL quality for ${image.id}`);
                    return;
                }

                // Fallback fetch
                let targetUrl = image.originalUrl || displaySrc || image.url;
                if (targetUrl && !targetUrl.startsWith('data:')) {
                    try {
                        const res = await fetch(targetUrl);
                        const blob = await res.blob();
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const result = reader.result as string;
                            setLightboxOriginalUrl(result);
                            // 保存为原图质量
                            const storageId = getQualityStorageId(image.id, ImageQuality.ORIGINAL);
                            saveImage(storageId, result);
                        };
                        reader.readAsDataURL(blob);
                    } catch (e) { console.error(e); }
                } else {
                    setLightboxOriginalUrl(targetUrl);
                }
                setIsLoadingOriginal(false);
            })();
        }
    }, [showLightbox, lightboxOriginalUrl, isLoadingOriginal, image.id, image.originalUrl, displaySrc, image.url]);

    // Auto-recover if URL is missing initially
    useEffect(() => {
        if (!displaySrc) {
            recoverImage();
        }
    }, []);

    // Ref to track latest localPos without triggering effect re-runs
    // (localPosRef is defined at top level)

    const wasDraggingRef = useRef(false);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Ignore Right Click (2)
        if ('button' in e && e.button === 2) return;

        // [FIX] Allow Native Drag for Images/Videos (Don't start card drag)
        // Must check this BEFORE setting isDragging or stopping propagation
        const target = e.target as HTMLElement;
        if (target.tagName === 'IMG' || target.tagName === 'VIDEO') {
            return;
        }

        // Stop canvas panning
        e.stopPropagation();

        setIsDragging(true);
        wasDraggingRef.current = false; // Reset drag flag

        // Only select if not already selected (Preserve Group)
        if (!isSelected && onSelect) {
            onSelect();
        }

        // Handle both Mouse and Touch events
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }



        // Store initial mouse position and card position
        dragStartPos.current = { x: clientX, y: clientY };
        dragStartCanvasPos.current = { x: localPosRef.current.x, y: localPosRef.current.y };

        console.log('[ImageCard] Drag Start', { clientX, clientY, localPos: localPosRef.current });
    };

    const lastGlobalUpdateRef = useRef(0);
    const requestRef = useRef<number | null>(null);

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = (e as TouchEvent).touches[0].clientX;
            clientY = (e as TouchEvent).touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        // Mark as dragged if moved more than threshold
        if (Math.abs(clientX - dragStartPos.current.x) > 10 || Math.abs(clientY - dragStartPos.current.y) > 10) {
            wasDraggingRef.current = true;
        }

        // Throttle updates using requestAnimationFrame
        if (requestRef.current !== null) return;

        requestRef.current = requestAnimationFrame(() => {
            const scale = zoomScale;
            const deltaX = (clientX - dragStartPos.current.x) / scale;
            const deltaY = (clientY - dragStartPos.current.y) / scale;

            const newPos = {
                x: dragStartCanvasPos.current.x + deltaX,
                y: dragStartCanvasPos.current.y + deltaY
            };

            // 1. Direct DOM Update (Zero React Overhead)
            if (containerRef.current) {
                containerRef.current.style.transform = `translate3d(${newPos.x}px, ${newPos.y}px, 0) translate(-50%, -100%)`;
            }
            localPosRef.current = newPos;

            // 2. Throttle Global Update (Connection Lines) to prevent lag
            // Update only every ~32ms (30fps)
            const now = Date.now();
            if (now - lastGlobalUpdateRef.current > 32) {
                onPositionChange(image.id, newPos);
                lastGlobalUpdateRef.current = now;
            }

            requestRef.current = null;
        });
    };

    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            console.log('[ImageCard] Drag End', localPosRef.current);
            // Commit final position to global state using REF value
            onPositionChange(image.id, localPosRef.current);
        }

        if (requestRef.current !== null) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = null;
        }

        // [FIX] 延迟重置wasDraggingRef,确保onClick事件能正确检测到拖拽状态
        // 但同时确保下一次点击能正常触发追问模式
        setTimeout(() => {
            wasDraggingRef.current = false;
        }, 100);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            // Touch listeners (non-passive to prevent scroll)
            window.addEventListener('touchmove', handleMouseMove, { passive: false });
            window.addEventListener('touchend', handleMouseUp);

            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('touchmove', handleMouseMove);
                window.removeEventListener('touchend', handleMouseUp);
                if (requestRef.current) {
                    cancelAnimationFrame(requestRef.current);
                }
            };
        }
    }, [isDragging, zoomScale]);

    // Handle pan/drag for lightbox image
    const handleLightboxMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 2) return;
        e.preventDefault();
        e.stopPropagation();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panStartPosRef.current = { x: lightboxPan.x, y: lightboxPan.y };
    }, [lightboxPan]);

    // Global listener for lightbox panning
    useEffect(() => {
        if (!isPanning) return;

        const handleWindowMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            setLightboxPan({
                x: panStartPosRef.current.x + dx,
                y: panStartPosRef.current.y + dy
            });
        };

        const handleWindowMouseUp = () => {
            setIsPanning(false);
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [isPanning]);

    // Handle wheel zoom with non-passive listener
    useEffect(() => {
        if (!showLightbox) return;

        const el = lightboxRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? -0.2 : 0.2; // Increase step slightly
            setLightboxZoom(prev => {
                const newZoom = Math.min(5, Math.max(0.25, prev + delta));
                return parseFloat(newZoom.toFixed(2)); // Clean precision
            });
        };

        el.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            el.removeEventListener('wheel', handleWheel);
        };
    }, [showLightbox]);

    // Reset pan and zoom when lightbox opens
    useEffect(() => {
        if (showLightbox) {
            setLightboxZoom(1);
            setLightboxPan({ x: 0, y: 0 });
            // openTimeRef is now set synchronously in handleImageClick
        }
    }, [showLightbox]);


    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            // PRIORITY: Try IndexedDB first (true original, uncompressed)
            const { getImage } = await import('../services/imageStorage');
            const indexedDbImage = await getImage(image.id);

            let blob: Blob;

            if (indexedDbImage && indexedDbImage.startsWith('data:')) {
                // Found original in IndexedDB - use it (uncompressed)
                console.log('[ImageCard] Using original from IndexedDB');
                const res = await fetch(indexedDbImage);
                blob = await res.blob();
            } else if (highResUrl && highResUrl.startsWith('data:')) {
                // Base64 URL directly (already original)
                console.log('[ImageCard] Using highResUrl base64');
                const res = await fetch(highResUrl);
                blob = await res.blob();
            } else if (image.originalUrl) {
                // Try original URL from cloud
                console.log('[ImageCard] Fetching original from cloud');
                const response = await fetch(image.originalUrl);
                if (!response.ok) throw new Error('Original fetch failed');
                blob = await response.blob();
            } else {
                // Fallback: Use displayed image URL
                console.warn('[ImageCard] Using thumbnail as fallback');
                const response = await fetch(image.url);
                if (!response.ok) throw new Error('Download failed (404)');
                blob = await response.blob();
            }

            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sanitizedPrompt = (image.prompt || 'image').slice(0, 30).replace(/[<>;\"/\\\\|?*]/g, '');
            const filename = `${sanitizedPrompt}_${timestamp}.png`;

            // Browser download - saves to user's Downloads folder
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const { notify } = await import('../services/notificationService');
            notify.success('下载成功', `已保存到下载文件夹: ${filename}`);
        } catch (err: any) {
            console.error('Download failed:', err);
            const { notify } = await import('../services/notificationService');
            notify.error(
                '下载失败',
                '原图可能已被清理或无法访问',
                `ImageCard Download Error: ${err.message || err}`
            );
        }
    };

    const handleImageClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // 忽略按钮点击 (如删除/下载)
        if ((e.target as HTMLElement).closest('button')) return;

        // 如果刚刚拖拽过,忽略点击(防止拖拽结束时误触发)
        if (wasDraggingRef.current && e.type !== 'dblclick' && e.detail !== 2) return;

        // 同步：在状态触发渲染前立即设置打开时间
        openTimeRef.current = Date.now();

        if (onPreview) {
            onPreview(image.id);
        } else {
            setLightboxZoom(1);
            setShowLightbox(true);
        }
    };

    const getDims = () => {
        // Use shared utility for consistent sizing
        // Pass 'true' to include footer height
        const { width, totalHeight } = getCardDimensions(image.aspectRatio, true);
        return { w: width, h: totalHeight };
    };
    const { w: nodeWidth, h: nodeHeight } = getDims();

    return (
        // ... (Wrapper Divs) ...
        <>
            <div
                ref={containerRef}
                className={`absolute flex flex-col items-center group animate-cardPopIn select-none ${isActive ? 'z-15' : 'z-5'}`}
                // ... (Style) ...
                style={{
                    left: 0,
                    top: 0,
                    width: nodeWidth,
                    transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -100%)`, // Anchor Bottom
                    cursor: isDragging ? 'grabbing' : 'grab',
                    transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
                    willChange: isDragging || isSelected ? 'transform' : 'auto',
                    backfaceVisibility: 'hidden'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!wasDraggingRef.current) onClick?.(image.id);
                }}
                onDoubleClick={handleImageClick}
            >
                <div
                    className={`
                        relative w-full overflow-hidden
                        border shadow-xl
                        ${isDragging ? '' : 'transition-all'}
                        ${isSelected ?
                            'animate-glow-pulse' :
                            'hover:shadow-2xl'
                        }
                        ${highlighted ? 'scale-[1.02] z-50' : ''}
                    `}
                    style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: isSelected ?
                            'var(--selected-border)' :
                            isActive ?
                                'var(--accent-gold)' :
                                highlighted ?
                                    'var(--accent-gold)' :
                                    'var(--border-default)',
                        borderRadius: 'var(--radius-lg)', // 12px
                        boxShadow: isSelected ?
                            'var(--glow-blue)' :
                            highlighted ?
                                'var(--glow-gold)' :
                                'var(--shadow-xl)',
                        transitionDuration: isDragging ? '0ms' : 'var(--duration-normal)',
                        transitionProperty: 'box-shadow, border-color, transform'
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
                        style={{ aspectRatio: image.aspectRatio.replace(':', '/') }} // [FIX] 强制锁定宽高比，防止恢复时高度跳动
                        onClick={handleImageClick}
                        onDoubleClick={handleImageClick}
                    >

                        {!imgError && !isRecovering && displaySrc ? (
                            (image.mode === GenerationMode.VIDEO || displaySrc.startsWith('data:video') || displaySrc.endsWith('.mp4')) ? (
                                <div className="relative w-full h-full">
                                    <video
                                        ref={videoRef}
                                        src={displaySrc}
                                        className="w-full h-full object-cover block select-none"
                                        muted loop playsInline
                                        onError={() => {
                                            console.warn('[ImageCard] Video load error for', image.id, '- attempting recovery...');
                                            recoverImage(); // 尝试从本地存储恢复视频
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (videoRef.current) {
                                                if (videoRef.current.paused) {
                                                    videoRef.current.play();
                                                    setIsVideoPlaying(true);
                                                } else {
                                                    videoRef.current.pause();
                                                    setIsVideoPlaying(false);
                                                }
                                            }
                                        }}
                                    />
                                    {/* 播放/暂停指示器 */}
                                    {!isVideoPlaying && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                                            <div className="w-12 h-12 rounded-full bg-white/80 flex items-center justify-center">
                                                <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-gray-800 border-b-[8px] border-b-transparent ml-1" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <img
                                    src={displaySrc} // React handles updates. Native lazy is often enough.
                                    // Make it aggressive: decoding async
                                    decoding="async"
                                    loading="lazy"
                                    alt={image.prompt}
                                    style={{
                                        color: 'transparent',
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        // 关键优化: 确保缩放时快速响应清晰度
                                        imageRendering: 'auto', // 高质量缩放
                                        // GPU 加速
                                        transform: 'translateZ(0)',
                                        willChange: 'auto'
                                    }}

                                    onError={(e) => {
                                        recoverImage();
                                    }}
                                    onLoad={(e) => {
                                        setImgError(false);
                                        const img = e.target as HTMLImageElement;
                                        const dims = `${img.naturalWidth}x${img.naturalHeight}`;
                                        if (onDimensionsUpdate && image.dimensions !== dims) {
                                            onDimensionsUpdate(image.id, dims);
                                        }
                                    }}
                                    className="w-full h-auto block select-none"
                                    draggable={true}
                                    onDragStart={(e) => {
                                        // HTML5 Drag for Data Transfer (to PromptBar)
                                        e.stopPropagation();
                                        const url = displaySrc || image.url;
                                        if (url) {
                                            e.dataTransfer.setData('text/plain', url);
                                            // [NEW] Pass structured data for efficient reuse (consistent with PromptNode)
                                            e.dataTransfer.setData('application/x-kk-image-ref', JSON.stringify({
                                                storageId: image.storageId || image.id,
                                                mimeType: 'image/png', // Default, hard to know without fetch or magic
                                                source: 'image-card',
                                                data: url.startsWith('data:') ? url : undefined
                                            }));
                                            e.dataTransfer.effectAllowed = 'copy';
                                        }
                                    }}
                                />
                            )
                        ) : (

                            <div className="w-full h-full min-h-[150px] flex flex-col items-center justify-center text-[var(--text-secondary)] p-4 text-center">

                                {/* 🚀 加载/恢复状态 - 居中显示 */}
                                {(isLoading || isRecovering || (!imgError && !displaySrc)) ? (
                                    /* 边框往内弥散白光 - 覆盖整个卡片，z-50确保在顶层 */
                                    <div
                                        className="absolute inset-0 z-50 rounded-lg flex items-center justify-center bg-black/60"
                                        style={{
                                            animation: 'shimmerInward 2s ease-in-out infinite'
                                        }}
                                    >
                                        <span className="text-xs text-white/70">
                                            {isRecovering ? '正在恢复...' : '正在加载...'}
                                        </span>
                                    </div>
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
                                            {(image.mode === GenerationMode.VIDEO ||
                                                image.url?.includes('.mp4') ||
                                                image.url?.startsWith('data:video') ||
                                                displaySrc?.includes('.mp4') ||
                                                displaySrc?.startsWith('data:video'))
                                                ? '(Video Load Error)'
                                                : '(Image Load Error)'}
                                        </span>
                                        {/* Retry Button */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); recoverImage(); }}
                                            className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                                        >
                                            点击重试
                                        </button>
                                    </>
                                )}
                            </div>
                        )}



                        {/* Tags Layer */}
                        {image.tags && image.tags.length > 0 && (
                            <div className="absolute bottom-[36px] left-0 right-0 p-2 flex flex-wrap gap-1 justify-end pointer-events-none">
                                {image.tags.map(tag => {
                                    const colors = generateTagColor(tag);
                                    return (
                                        <span
                                            key={tag}
                                            className="px-1.5 py-0.5 backdrop-blur-sm text-[9px] shadow-sm"
                                            style={{
                                                backgroundColor: colors.bg,
                                                color: colors.text,
                                                border: `1px solid ${colors.border}`,
                                                borderRadius: 'var(--radius-sm)' // 4px
                                            }}
                                        >
                                            #{tag}
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        {/* Footer - Compact Two Row Layout - 点击进入追问模式 */}
                        <div
                            className="px-2 py-1 flex flex-col gap-0.5 border-t relative z-10 box-border cursor-pointer"
                            style={{
                                backgroundColor: 'var(--bg-elevated)',
                                borderTopColor: 'var(--border-default)',
                                minHeight: '36px'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                // 单击信息栏进入追问模式
                                if (!wasDraggingRef.current) onClick?.(image.id);
                            }}
                        >
                            {/* Row 1: 模型信息 OR 文件信息 + 比例尺寸 + 按钮 */}
                            <div className="flex items-center gap-1">
                                {/* 孤独副卡：显示文件名 */}
                                {image.orphaned && image.fileName ? (
                                    <div
                                        className="flex items-center gap-1 px-1.5 py-0.5 rounded border flex-1 min-w-0"
                                        style={{
                                            backgroundColor: 'var(--bg-tertiary)',
                                            borderColor: 'var(--border-light)'
                                        }}
                                        title={image.fileName}
                                    >
                                        <span className="w-1 h-1 rounded-full bg-zinc-500"></span>
                                        <span className="text-[7px] font-medium text-[var(--text-secondary)] truncate">
                                            {image.fileName}
                                        </span>
                                    </div>
                                ) : (
                                    /* 普通卡片：显示模型信息 */
                                    (() => {
                                        const model = (image.model || '').toLowerCase();

                                        // 🚀 优先使用用户选择时的显示名称
                                        let label = image.modelLabel || '';
                                        let dotColor = 'bg-zinc-500';

                                        // 如果没有保存modelLabel，则从ID推断（兼容旧数据）
                                        if (!label) {
                                            label = 'AI';
                                            if (model.includes('gemini-3-pro') || model.includes('nano-banana-pro')) {
                                                label = 'Gemini 3 Pro';
                                                dotColor = 'bg-purple-600';
                                            } else if (model.includes('gemini-3-flash')) {
                                                label = 'Gemini 3 Flash';
                                                dotColor = 'bg-cyan-500';
                                                // Gemini 2.5 系列
                                            } else if (model.includes('gemini-2.5-flash') || model.includes('nano-banana')) {
                                                label = 'Gemini 2.5 Flash';
                                                dotColor = 'bg-yellow-500';
                                            } else if (model.includes('gemini-2.5-pro')) {
                                                label = 'Gemini 2.5 Pro';
                                                dotColor = 'bg-amber-500';
                                                // Gemini 2.0 系列
                                            } else if (model.includes('gemini-2.0') || model.includes('gemini-2-')) {
                                                if (model.includes('flash')) {
                                                    label = 'Gemini 2.0 Flash';
                                                } else {
                                                    label = 'Gemini 2.0';
                                                }
                                                dotColor = 'bg-orange-500';
                                                // Imagen 4 系列
                                            } else if (model.includes('imagen-4') && model.includes('ultra')) {
                                                label = 'Imagen 4 Ultra';
                                                dotColor = 'bg-purple-500';
                                            } else if (model.includes('imagen-4') && model.includes('fast')) {
                                                label = 'Imagen 4 Fast';
                                                dotColor = 'bg-blue-400';
                                            } else if (model.includes('imagen-4')) {
                                                label = 'Imagen 4';
                                                dotColor = 'bg-blue-500';
                                                // Imagen 3 系列
                                            } else if (model.includes('imagen-3')) {
                                                label = 'Imagen 3';
                                                dotColor = 'bg-blue-400';
                                                // Veo 3 系列
                                            } else if (model.includes('veo-3.1') && model.includes('fast')) {
                                                label = 'Veo 3.1 Fast';
                                                dotColor = 'bg-fuchsia-500';
                                            } else if (model.includes('veo-3.1')) {
                                                label = 'Veo 3.1';
                                                dotColor = 'bg-purple-500';
                                            } else if (model.includes('veo-3') && model.includes('fast')) {
                                                label = 'Veo 3 Fast';
                                                dotColor = 'bg-fuchsia-500';
                                            } else if (model.includes('veo-3')) {
                                                label = 'Veo 3';
                                                dotColor = 'bg-purple-500';
                                                // Veo 2 系列
                                            } else if (model.includes('veo-2') || (model.includes('veo') && !model.includes('veo-3'))) {
                                                label = 'Veo 2';
                                                dotColor = 'bg-violet-500';
                                                // 上传图片
                                            } else if (model === 'uploaded') {
                                                label = '上传';
                                                dotColor = 'bg-gray-500';
                                            }
                                        }

                                        // 根据模型ID设置圆点颜色（如果有modelLabel也需要设置颜色）
                                        if (model.includes('gemini-3-pro') || model.includes('nano-banana-pro')) {
                                            dotColor = 'bg-purple-600';
                                        } else if (model.includes('gemini-3-flash')) {
                                            dotColor = 'bg-cyan-500';
                                        } else if (model.includes('gemini-2.5-flash') || model.includes('nano-banana')) {
                                            dotColor = 'bg-yellow-500';
                                        } else if (model.includes('gemini-2.5-pro')) {
                                            dotColor = 'bg-amber-500';
                                        } else if (model.includes('imagen-4') && model.includes('ultra')) {
                                            dotColor = 'bg-purple-500';
                                        } else if (model.includes('imagen-4')) {
                                            dotColor = 'bg-blue-500';
                                        } else if (model.includes('veo-3')) {
                                            dotColor = 'bg-purple-500';
                                        } else if (model.includes('veo')) {
                                            dotColor = 'bg-violet-500';
                                        }

                                        return (
                                            <div
                                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
                                                style={{
                                                    backgroundColor: 'var(--bg-tertiary)',
                                                    borderColor: 'var(--border-light)'
                                                }}
                                            >
                                                <span className={`w-1 h-1 rounded-full ${dotColor}`}></span>
                                                <span className="text-[7px] font-medium text-[var(--text-secondary)] whitespace-nowrap">
                                                    {label}
                                                </span>
                                            </div>
                                        );
                                    })()
                                )}

                                {/* Ratio + Size Container - Compact style */}
                                <div
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
                                    style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        borderColor: 'var(--border-light)'
                                    }}
                                >
                                    <span className="text-[7px] font-medium text-[var(--text-secondary)] whitespace-nowrap">
                                        {image.aspectRatio || '1:1'} · {(image.mode === GenerationMode.VIDEO || image.model?.toLowerCase().includes('veo') || image.url?.startsWith('data:video')) ? '720p' : (image.imageSize || '1K')}
                                    </span>
                                </div>

                                {/* Spacer */}
                                <div className="flex-1" />

                                {/* Download */}
                                <button
                                    onClick={handleDownload}
                                    className="flex items-center justify-center transition-all active:scale-95 hover:bg-[var(--bg-hover)]"
                                    title="下载"
                                    style={{
                                        color: 'var(--accent-blue)',
                                        borderRadius: 'var(--radius-sm)',
                                        width: '20px',
                                        height: '20px'
                                    }}
                                >
                                    <Download size={10} strokeWidth={2} />
                                </button>

                                {/* Delete */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                                    className="flex items-center justify-center transition-all active:scale-95 hover:bg-[var(--bg-hover)]"
                                    title="删除"
                                    style={{
                                        color: 'var(--accent-red)',
                                        borderRadius: 'var(--radius-sm)',
                                        width: '20px',
                                        height: '20px'
                                    }}
                                >
                                    <Trash2 size={10} strokeWidth={2} />
                                </button>
                            </div>

                            {/* Divider between rows */}
                            <div className="w-full my-1" style={{ height: '0.5px', backgroundColor: 'var(--border-light)', opacity: 0.5 }}></div>

                            {/* Row 2: 孤独副卡显示分辨率+文件大小 OR 普通卡片显示耗时+令牌+费用 */}
                            {image.orphaned ? (
                                /* 孤独副卡信息 */
                                <div className="flex items-center justify-center gap-2 text-[7px] font-mono">
                                    {/* 分辨率 */}
                                    {image.dimensions && (
                                        <>
                                            <span className="text-[var(--text-tertiary)]">
                                                分辨率 <span className="text-[var(--text-secondary)]">{image.dimensions}</span>
                                            </span>
                                            <span className="text-[var(--border-medium)]">|</span>
                                        </>
                                    )}
                                    {/* 文件大小 */}
                                    {image.fileSize && (
                                        <span className="text-[var(--text-tertiary)]">
                                            大小 <span className="text-[var(--text-secondary)]">{(image.fileSize / 1024).toFixed(1)} KB</span>
                                        </span>
                                    )}
                                </div>
                            ) : (
                                /* 普通卡片信息 */
                                <div className="flex items-center justify-center gap-2 text-[7px] font-mono">
                                    {/* Time */}
                                    {image.generationTime && (
                                        <>
                                            <span className="text-[var(--text-tertiary)]">
                                                耗时 <span className="text-[var(--text-secondary)]">{(image.generationTime / 1000).toFixed(1)}s</span>
                                            </span>
                                            <span className="text-[var(--border-medium)]">|</span>
                                        </>
                                    )}
                                    {/* Tokens */}
                                    <span className="text-emerald-500/70">
                                        令牌 <span className="text-emerald-500/90">{image.tokens || 0}</span>
                                    </span>
                                    <span className="text-[var(--border-medium)]">|</span>
                                    {/* Cost */}
                                    <span className="text-amber-500/70" title={`$${(image.cost || 0).toFixed(6)}`}>
                                        费用 <span className="text-amber-500/90">${(image.cost || 0).toFixed(4)}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Lightbox Modal - Rendered to body via Portal for true top-level z-index */}
            {
                showLightbox && ReactDOM.createPortal(
                    <div
                        ref={lightboxRef}
                        className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center animate-fadeIn select-none"
                        onClick={() => {
                            // Prevent accidental close from double-click (second click hitting backdrop)
                            if (Date.now() - openTimeRef.current < 600) return;
                            !isPanning && setShowLightbox(false);
                        }}
                        style={{ backdropFilter: 'blur(8px)', cursor: isPanning ? 'grabbing' : 'default' }}
                    >
                        {/* Close Button - Top Right */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowLightbox(false); }}
                            className="absolute top-4 right-4 z-[100000] w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-110"
                            title="关闭"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>

                        {/* Zoom Controls */}
                        <div className="absolute bottom-6 right-6 z-[100000] flex items-center gap-2 bg-black/50 rounded-lg p-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); setLightboxZoom(prev => Math.max(0.25, prev - 0.25)); }}
                                className="w-8 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white"
                                title="缩小"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                            <span className="text-white text-sm min-w-[50px] text-center">{Math.round(lightboxZoom * 100)}%</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); setLightboxZoom(prev => Math.min(5, prev + 0.25)); }}
                                className="w-8 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white"
                                title="放大"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }}
                                className="w-8 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white ml-1"
                                title="重置"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /></svg>
                            </button>
                        </div>

                        {/* Main Image/Video - Drag to pan, scroll to zoom */}
                        {(image.mode === GenerationMode.VIDEO || lightboxOriginalUrl?.startsWith('data:video') || highResUrl?.startsWith('data:video') || highResUrl?.endsWith('.mp4')) ? (
                            <video
                                src={lightboxOriginalUrl || highResUrl}
                                controls
                                autoPlay
                                loop
                                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                                style={{
                                    maxWidth: '95vw',
                                    maxHeight: '95vh',
                                    transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`,
                                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                                    cursor: isPanning ? 'grabbing' : 'auto'
                                }}
                                onClick={(e) => e.stopPropagation()} // Prevent click from closing lightbox
                                onDoubleClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowLightbox(false); // Double click to close
                                }}
                            />
                        ) : (
                            <img
                                src={lightboxOriginalUrl || highResUrl}
                                onError={(e) => {
                                    console.warn('[Lightbox] Failed to load original, falling back to thumbnail');
                                }}
                                alt={image.prompt}
                                onMouseDown={handleLightboxMouseDown}
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowLightbox(false);
                                }}
                                onContextMenu={(e) => e.stopPropagation()}
                                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                                draggable={false}
                                style={{
                                    maxWidth: '95vw',
                                    maxHeight: '95vh',
                                    transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`,
                                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                                    cursor: isPanning ? 'grabbing' : 'grab',
                                    // 高质量渲染
                                    imageRendering: 'auto',
                                    // GPU 加速
                                    willChange: isPanning ? 'transform' : 'auto'
                                }}
                            />
                        )}

                        {/* Download Button in Lightbox */}
                        <button
                            onClick={handleDownload}
                            className="absolute bottom-6 left-6 z-[100000] flex items-center gap-2 bg-black/50 hover:bg-white/20 text-white rounded-lg px-4 py-2 transition-colors"
                            title="下载原图"
                        >
                            <Download size={16} />
                            <span className="text-sm">下载原图</span>
                        </button>

                        {/* Metadata Overlay (Bottom Center) */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none select-none z-[100000]">
                            {/* Metadata Panel */}
                            <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-3 flex items-center gap-4 shadow-2xl">
                                {/* Model Badge */}
                                {(() => {
                                    const model = image.model || '';
                                    let label = 'AI';
                                    let style = 'border-white/20 text-zinc-300 bg-white/5'; // Lightbox specific dark theme style

                                    if (model.includes('ultra')) {
                                        label = 'Imagen 4 Ultra';
                                        style = 'border-purple-400/30 text-purple-300 bg-purple-500/20';
                                    } else if (model.includes('imagen-4')) {
                                        label = 'Imagen 4';
                                        style = 'border-blue-400/30 text-blue-300 bg-blue-500/20';
                                    } else if (model.includes('pro')) {
                                        label = 'Gemini 3 Pro';
                                        style = 'border-amber-400/30 text-amber-300 bg-amber-500/20';
                                    } else if (model.includes('flash')) {
                                        label = 'Gemini 2.5';
                                        style = 'border-yellow-400/30 text-yellow-300 bg-yellow-500/20';
                                    }

                                    return (
                                        <span className={`text-[10px] px-2 py-1 rounded font-medium border whitespace-nowrap ${style}`}>
                                            {label}
                                        </span>
                                    );
                                })()}

                                {/* Dimensions */}
                                <div className="h-6 w-px bg-white/10" />
                                <div className="flex flex-col items-start gap-0.5">
                                    <span className="text-[10px] text-white/50 leading-none">Resolution</span>
                                    <span className="text-xs text-white/90 font-mono tracking-wide leading-none">
                                        {image.dimensions ? (() => {
                                            const [w, h] = image.dimensions.split('x').map(Number);
                                            if (!w || !h) return image.dimensions;

                                            // Mapping common approximate ratios for cleaner display
                                            let displayRatio = `${w}:${h}`;
                                            const ratioVal = w / h;
                                            if (Math.abs(ratioVal - 1) < 0.05) displayRatio = '1:1';
                                            else if (Math.abs(ratioVal - 4 / 3) < 0.05) displayRatio = '4:3';
                                            else if (Math.abs(ratioVal - 3 / 4) < 0.05) displayRatio = '3:4';
                                            else if (Math.abs(ratioVal - 16 / 9) < 0.05) displayRatio = '16:9';
                                            else if (Math.abs(ratioVal - 9 / 16) < 0.05) displayRatio = '9:16';

                                            let sizeLabel = '1K';
                                            if (w >= 3000 || h >= 3000) sizeLabel = '4K';
                                            else if (w >= 1500 || h >= 1500) sizeLabel = '2K';

                                            return `${displayRatio} · ${sizeLabel}`;
                                        })() : 'Unknown'}
                                    </span>
                                </div>

                                {/* Generation Time */}
                                {image.generationTime && (
                                    <>
                                        <div className="h-6 w-px bg-white/10" />
                                        <div className="flex flex-col items-start gap-0.5">
                                            <span className="text-[10px] text-white/50 leading-none">Generated in</span>
                                            <span className="text-xs text-white/90 font-mono leading-none">
                                                {(image.generationTime / 1000).toFixed(1)}s
                                            </span>
                                        </div>
                                    </>
                                )}

                                {/* Token & Cost */}
                                {(image.tokens !== undefined || image.cost !== undefined) && (
                                    <>
                                        <div className="h-6 w-px bg-white/10" />
                                        <div className="flex flex-col items-start gap-0.5">
                                            {image.tokens && (
                                                <span className="text-[10px] text-emerald-400 font-mono leading-none">
                                                    {image.tokens} tokens
                                                </span>
                                            )}
                                            {image.cost !== undefined && (
                                                <span className="text-[10px] text-emerald-400/80 font-mono leading-none">
                                                    ${image.cost < 0.0001 && image.cost > 0 ? '<0.0001' : image.cost.toFixed(4)}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Controls Hint */}
                            <div className="text-white/30 text-[10px]">
                                滚轮缩放 · 拖拽平移 · 双击关闭
                            </div>
                        </div>
                    </div>,
                    document.body
                )
            }
        </>
    );
});

export default ImageNodeComponent;
