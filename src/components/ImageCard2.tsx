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

    // 🚀 Robust Image Loading State - 优先使用image自带URL作为初始显示（防止刚生成的图片加载失败）
    const initialUrl = (image.url && image.url.length > 0) ? image.url : (image.originalUrl || '');
    const [displaySrc, setDisplaySrc] = useState<string | undefined>(
        initialUrl && (initialUrl.startsWith('data:') || initialUrl.startsWith('blob:') || initialUrl.startsWith('http'))
            ? initialUrl
            : undefined
    );
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
                        // 🚀 没有可用fallback，显示错误占位符
                        setIsLoading(false);
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

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            // PRIORITY: Try IndexedDB first (true original, uncompressed)
            const { getImage } = await import('../services/imageStorage');
            const indexedDbImage = await getImage(image.id);

            let blob: Blob;

            // Construct high-res URL for lightbox (fallback use)
            const highResUrl = image.originalUrl || displaySrc || image.url;

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

    // 🚀 [恢复] 拖拽逻辑所需的引用和处理函数
    const wasDraggingRef = useRef(false);

    const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // 阻止事件冒泡到 Canvas，通过 global listeners 处理拖拽
        e.stopPropagation();

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        setIsDragging(true);
        wasDraggingRef.current = false;
        dragStartPos.current = { x: clientX, y: clientY };
        // Store current position as base
        localPosRef.current = position;

        // 绑定全局事件
        const handleMouseMove = (mvEvent: MouseEvent | TouchEvent) => {
            mvEvent.preventDefault(); // 防止滚动
            const mvClientX = 'touches' in mvEvent ? mvEvent.touches[0].clientX : (mvEvent as MouseEvent).clientX;
            const mvClientY = 'touches' in mvEvent ? mvEvent.touches[0].clientY : (mvEvent as MouseEvent).clientY;

            const dx = mvClientX - dragStartPos.current.x;
            const dy = mvClientY - dragStartPos.current.y;

            // 只有移动超过一定距离才视为拖拽
            if (dx * dx + dy * dy > 25) {
                wasDraggingRef.current = true;
            }

            // 实时更新位置
            if (onPositionChange) {
                const scale = zoomScale || 1;
                const newX = localPosRef.current.x + dx / scale;
                const newY = localPosRef.current.y + dy / scale;
                onPositionChange(image.id, { x: newX, y: newY });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove, { passive: false });
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchmove', handleMouseMove, { passive: false });
        window.addEventListener('touchend', handleMouseUp);

    }, [image.id, position, zoomScale, onPositionChange]);

    const handleImageClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // 忽略按钮点击 (如删除/下载)
        if ((e.target as HTMLElement).closest('button')) return;

        // 如果刚刚拖拽过,忽略点击(防止拖拽结束时误触发)
        if (wasDraggingRef.current && e.type !== 'dblclick' && e.detail !== 2) return;

        // 🚀 [修复] 不再打开内置灯箱，统一使用onPreview避免重复预览框
        if (!wasDraggingRef.current && onPreview) {
            onPreview(image.id);
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

                        {!imgError && displaySrc ? (
                            (image.mode === GenerationMode.VIDEO || displaySrc.startsWith('data:video') || displaySrc.endsWith('.mp4')) ? (
                                <div className="relative w-full h-full">
                                    <video
                                        src={displaySrc}
                                        className="w-full h-full object-cover block select-none"
                                        muted loop playsInline autoPlay
                                        onError={() => {
                                            console.warn('[ImageCard] Video load error for', image.id);
                                            setImgError(true);
                                        }}
                                    />
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
                                {(isLoading || (!imgError && !displaySrc)) ? (
                                    /* 边框往内弥散白光 - 覆盖整个卡片，z-50确保在顶层 */
                                    <div
                                        className="absolute inset-0 z-50 rounded-lg flex items-center justify-center bg-black/60"
                                        style={{
                                            animation: 'shimmerInward 2s ease-in-out infinite'
                                        }}
                                    >
                                        <span className="text-xs text-white/70">
                                            正在加载...
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
                                            onClick={(e) => { e.stopPropagation(); cancelImageLoad(image.id); setIsLoading(true); qualityDebounceRef.current = null; /* Trigger effect re-run via state/ref reset if needed, simplified here to just reload UI state */ }}
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
                            className="px-2 py-1 flex flex-col gap-0.5 border-t-2 relative z-10 box-border cursor-pointer"
                            style={{
                                backgroundColor: 'var(--bg-elevated)',
                                borderTopColor: 'var(--border-medium)', // 使用更明显的中等边框颜色
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
                                        let textColor = 'text-zinc-400';

                                        // 如果没有保存modelLabel，则从ID推断（兼容旧数据）
                                        if (!label) {
                                            label = 'AI';
                                            if (model.includes('gemini-3-pro') || model.includes('nano-banana-pro')) {
                                                label = 'Gemini 3 Pro';
                                                textColor = 'text-purple-400';
                                            } else if (model.includes('gemini-3-flash')) {
                                                label = 'Gemini 3 Flash';
                                                textColor = 'text-cyan-400';
                                                // Gemini 2.5 系列
                                            } else if (model.includes('gemini-2.5-flash') || model.includes('nano-banana')) {
                                                label = 'Gemini 2.5 Flash';
                                                textColor = 'text-yellow-400';
                                            } else if (model.includes('gemini-2.5-pro')) {
                                                label = 'Gemini 2.5 Pro';
                                                textColor = 'text-amber-400';
                                                // Gemini 2.0 系列
                                            } else if (model.includes('gemini-2.0') || model.includes('gemini-2-')) {
                                                if (model.includes('flash')) {
                                                    label = 'Gemini 2.0 Flash';
                                                } else {
                                                    label = 'Gemini 2.0';
                                                }
                                                textColor = 'text-orange-400';
                                                // Imagen 4 系列
                                            } else if (model.includes('imagen-4') && model.includes('ultra')) {
                                                label = 'Imagen 4 Ultra';
                                                textColor = 'text-purple-400';
                                            } else if (model.includes('imagen-4') && model.includes('fast')) {
                                                label = 'Imagen 4 Fast';
                                                textColor = 'text-blue-300';
                                            } else if (model.includes('imagen-4')) {
                                                label = 'Imagen 4';
                                                textColor = 'text-blue-400';
                                                // Imagen 3 系列
                                            } else if (model.includes('imagen-3')) {
                                                label = 'Imagen 3';
                                                textColor = 'text-blue-300';
                                                // Veo 3 系列
                                            } else if (model.includes('veo-3.1') && model.includes('fast')) {
                                                label = 'Veo 3.1 Fast';
                                                textColor = 'text-fuchsia-400';
                                            } else if (model.includes('veo-3.1')) {
                                                label = 'Veo 3.1';
                                                textColor = 'text-purple-400';
                                            } else if (model.includes('veo-3') && model.includes('fast')) {
                                                label = 'Veo 3 Fast';
                                                textColor = 'text-fuchsia-400';
                                            } else if (model.includes('veo-3')) {
                                                label = 'Veo 3';
                                                textColor = 'text-purple-400';
                                                // Veo 2 系列
                                            } else if (model.includes('veo-2') || (model.includes('veo') && !model.includes('veo-3'))) {
                                                label = 'Veo 2';
                                                textColor = 'text-violet-400';
                                                // 上传图片
                                            } else if (model === 'uploaded') {
                                                label = '上传';
                                                textColor = 'text-gray-400';
                                            }
                                        }

                                        // 根据模型ID设置文字颜色（如果有modelLabel也需要设置颜色）
                                        if (model.includes('gemini-3-pro') || model.includes('nano-banana-pro')) {
                                            textColor = 'text-purple-400';
                                        } else if (model.includes('gemini-3-flash')) {
                                            textColor = 'text-cyan-400';
                                        } else if (model.includes('gemini-2.5-flash') || model.includes('nano-banana')) {
                                            textColor = 'text-yellow-400';
                                        } else if (model.includes('gemini-2.5-pro')) {
                                            textColor = 'text-amber-400';
                                        } else if (model.includes('imagen-4') && model.includes('ultra')) {
                                            textColor = 'text-purple-400';
                                        } else if (model.includes('imagen-4')) {
                                            textColor = 'text-blue-400';
                                        } else if (model.includes('veo-3')) {
                                            textColor = 'text-purple-400';
                                        } else if (model.includes('veo')) {
                                            textColor = 'text-violet-400';
                                        }

                                        return (
                                            <div
                                                className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
                                                style={{
                                                    backgroundColor: 'var(--bg-tertiary)',
                                                    borderColor: 'var(--border-light)'
                                                }}
                                            >
                                                <span className={`text-[7px] font-medium whitespace-nowrap ${textColor}`}>
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

        </>
    );
}, (prev, next) => {
    // Custom Comparison for Performance
    return (
        prev.image === next.image &&
        prev.position.x === next.position.x &&
        prev.position.y === next.position.y &&
        prev.isActive === next.isActive &&
        prev.zoomScale === next.zoomScale &&
        prev.isSelected === next.isSelected &&
        prev.highlighted === next.highlighted &&
        prev.isVisible === next.isVisible &&
        prev.onDimensionsUpdate === next.onDimensionsUpdate &&
        prev.onClick === next.onClick &&
        prev.onDelete === next.onDelete &&
        prev.onPositionChange === next.onPositionChange
    );
});

export const ImageCard2 = ImageNodeComponent;
export default ImageNodeComponent;
