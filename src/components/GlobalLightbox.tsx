import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { GeneratedImage, GenerationMode } from '../types';
import { Download, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw, Pen } from 'lucide-react';
import { InpaintModal } from './InpaintModal';

interface GlobalLightboxProps {
    images: GeneratedImage[];
    initialIndex: number;
    onClose: () => void;
    onInpaint?: (image: GeneratedImage, maskBase64: string, prompt?: string) => void;
}

/**
 * 全局灯箱组件
 * 用于全屏查看生成的图片或视频，支持缩放、平移和列表导航
 * @param images 图片对象数组
 * @param initialIndex 初始显示的图片索引
 * @param onClose 关闭事件回调
 */
export const GlobalLightbox: React.FC<GlobalLightboxProps> = ({ images, initialIndex, onClose, onInpaint }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [showInpaint, setShowInpaint] = useState(false);

    // 图片加载状态
    const [displaySrc, setDisplaySrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const image = images[currentIndex];
    const panStartRef = useRef({ x: 0, y: 0 });
    const panStartPosRef = useRef({ x: 0, y: 0 });

    // 🚀 [Fix] Real Dimensions State
    const [realDimensions, setRealDimensions] = useState<string | null>(null);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
            setRealDimensions(`${img.naturalWidth}x${img.naturalHeight}`);
        }
    };

    // 1. 加载高清图逻辑
    useEffect(() => {
        let active = true;
        setHasError(false);
        // 🚀 Reset zoom on image switch to show full frame
        setZoom(1);
        setPan({ x: 0, y: 0 });

        const sanitizeUrl = (url: string | null) => {
            if (url && url.startsWith('data:')) {
                const parts = url.split(',');
                if (parts.length === 2) {
                    return `${parts[0]},${parts[1].replace(/[\r\n\s]+/g, '')}`;
                }
            }
            return url;
        };

        // 🚀 [Fix] 立即显示传入的已知可用 URL，消除"加载中"黑屏感
        // The image object has `url` (often the blob URL or base64 rendered on canvas)
        const initialSrc = image.originalUrl || image.url || null;
        if (initialSrc) {
            setDisplaySrc(sanitizeUrl(initialSrc));
            setIsLoading(false); // 已经有图了，不显示 loading
        } else {
            setDisplaySrc(null);
            setIsLoading(true); // 完全没图才显示 loading
        }

        const loadContent = async () => {
            try {
                // 🔒 强制加载原图（新的保护机制）
                const { getOriginalImage } = await import('../services/imageStorage');
                // const metadata = await getImageMetadata(image.id); // Check protection status
                let original = await getOriginalImage(image.id);

                // 生成完成后 saveImage/saveOriginalImage 是异步落盘，灯箱可能先打开导致首轮 miss
                // 做一次短延迟重试，尽量拿到本地原图而不是临时远程 URL
                if (!original) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    original = await getOriginalImage(image.id);
                }

                if (!active) return;

                if (original) {
                    const cleanOriginal = sanitizeUrl(original);
                    // 只有当加载到的原图和当前显示的不同，才静默替换（避免 flicker）
                    if (cleanOriginal !== sanitizeUrl(initialSrc)) {
                        setDisplaySrc(cleanOriginal);
                        console.log(`[Lightbox] 🔒 ✅ Upgraded to High-Res Original`);
                    }
                    setIsLoading(false);
                } else {
                    // 🔒 Fallback 策略：尝试使用storageId
                    console.warn('[Lightbox] 🔒 ⚠️ Original not found, trying fallback strategies...');

                    // 策略1: 尝试从storageId加载
                    if (image.storageId && image.storageId !== image.id) {
                        const fromStorage = await getOriginalImage(image.storageId);
                        if (fromStorage && active) {
                            const cleanFromStorage = sanitizeUrl(fromStorage);
                            if (cleanFromStorage !== sanitizeUrl(initialSrc)) {
                                setDisplaySrc(cleanFromStorage);
                                console.log('[Lightbox] 🔒 ✅ Recovered from storageId');
                            }
                            setIsLoading(false);
                            return;
                        }
                    }

                    // 策略2: 如果还是没有，已经 fallback 到 initialSrc 了，不用再设置
                    if (active) setIsLoading(false);
                }
            } catch (e) {
                console.error("[Lightbox] 🔒 ❌ Load error:", e);
                if (active) {
                    // 最终兜底，维持 initialSrc
                    if (!initialSrc) setDisplaySrc(sanitizeUrl(image.url || null));
                    setIsLoading(false);
                }
            }
        };

        loadContent();
        return () => { active = false; };
    }, [image]); // 依赖当前图片对象

    // 2. 事件监听 (键盘控制)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'ArrowRight') handleNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, images.length]); // 重新绑定以获取最新索引

    // 3. 导航处理函数
    const handlePrev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
    }, [images.length]);

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
    }, [images.length]);

    // 4. 缩放/平移逻辑
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        setZoom(prev => Math.min(5, Math.max(0.25, prev + delta)));
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 2) return;
        e.preventDefault();
        e.stopPropagation();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panStartPosRef.current = { x: pan.x, y: pan.y };
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isPanning) return;
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({
            x: panStartPosRef.current.x + dx,
            y: panStartPosRef.current.y + dy
        });
    }, [isPanning]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    useEffect(() => {
        if (isPanning) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isPanning, handleMouseMove, handleMouseUp]);

    // 5. 下载逻辑
    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const { getOriginalImage } = await import('../services/imageStorage');
            const { triggerDownload } = await import('../utils/downloadUtils');

            // 优先下载本地原图通道（IDB/本地磁盘恢复）
            let target = await getOriginalImage(image.id);
            if (!target && image.storageId && image.storageId !== image.id) {
                target = await getOriginalImage(image.storageId);
            }
            target = target || displaySrc || image.originalUrl || image.url;
            if (!target) return;

            // data/blob 直接下载；http(s) 先拉取 blob，避免跨域/临时 URL 导致浏览器下载失败
            if (target.startsWith('data:') || target.startsWith('blob:')) {
                triggerDownload(target, `image-${image.id}.png`);
                return;
            }

            const response = await fetch(target);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            try {
                triggerDownload(objectUrl, `image-${image.id}.png`);
            } finally {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            }
        } catch (err) {
            // 最后兜底：新标签页打开
            const fallback = displaySrc || image.originalUrl || image.url;
            if (fallback) window.open(fallback, '_blank', 'noopener,noreferrer');
        }
    };

    // 6. 防止双击过快导致的误触关闭 (600ms安全期 - 支持慢速双击)
    const [isReady, setIsReady] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 600);
        return () => clearTimeout(timer);
    }, []);

    const handleBackgroundClick = useCallback(() => {
        if (isReady) onClose();
    }, [isReady, onClose]);

    // 7. [Fix] Native Video DoubleClick Capture

    // React's onDoubleClick bubbles, but video fullscreen often happens on native event.
    // We use a capture listener to intercept it BEFORE the browser handles it.
    // 7. [Fix] Native Video DoubleClick Capture (Mousedown Strategy)
    // Browser fullscreen often triggers on the second mousedown, NOT the dblclick event.
    // We use capture: true on mousedown to intercept the 2nd click (`e.detail > 1`)
    // before the video element sees it.
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        const handleNativeMousedown = (e: MouseEvent) => {
            // Check if this is the second click (or more) of a double-click
            if (e.detail > 1) {
                // Stop everything immediately
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                onClose();
            }
        };

        // Use capture: true to intercept BEFORE the video element
        videoEl.addEventListener('mousedown', handleNativeMousedown, { capture: true });
        return () => {
            videoEl.removeEventListener('mousedown', handleNativeMousedown, { capture: true });
        };
    }, [onClose]);

    if (!image) return null;

    const isVideo = image.mode === GenerationMode.VIDEO || displaySrc?.startsWith('data:video') || displaySrc?.endsWith('.mp4');
    const isAudio = image.mode === GenerationMode.AUDIO || displaySrc?.endsWith('.mp3') || displaySrc?.endsWith('.wav');

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-[99999] bg-black/95 flex flex-col items-center justify-center animate-fadeIn select-none overflow-hidden"
            onClick={handleBackgroundClick}
        >
            {/* 顶栏: 关闭按钮 */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-50 p-2 bg-white/10 hover:opacity-80 rounded-full text-white transition-opacity"
                title="关闭 (Close)"
            >
                <X size={24} />
            </button>

            {/* 导航区域 (隐形或微弱提示) */}
            {images.length > 1 && (
                <>
                    <div
                        className="absolute left-0 top-0 bottom-0 w-[15%] z-40 flex items-center justify-start pl-4 cursor-pointer transition-colors group"
                        onClick={handlePrev}
                        title="上一张 (Previous)"
                    >
                        <div className="p-3 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronLeft size={32} />
                        </div>
                    </div>

                    <div
                        className="absolute right-0 top-0 bottom-0 w-[15%] z-40 flex items-center justify-end pr-4 cursor-pointer transition-colors group"
                        onClick={handleNext}
                        title="下一张 (Next)"
                    >
                        <div className="p-3 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight size={32} />
                        </div>
                    </div>
                </>
            )}

            {/* 主内容区域 */}
            {/* 高度限制: 100vh - 100px (底部栏) */}
            <div
                className="relative flex-1 w-full h-[calc(100vh-100px)] flex items-center justify-center overflow-hidden"
                onWheel={handleWheel}
                onClick={(e) => e.stopPropagation()} // 防止点击画布关闭
            >
                {isLoading ? (
                    <div className="text-white">加载中...</div>
                ) : isAudio ? (
                    <div className="flex flex-col items-center justify-center gap-6">
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-pink-400/60">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                        </svg>
                        <audio
                            src={displaySrc!}
                            controls
                            autoPlay
                            className="w-80"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>
                ) : isVideo ? (
                    <div
                        className="max-w-full max-h-full flex items-center justify-center"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            cursor: isPanning ? 'grabbing' : 'grab' // Apply cursor to wrapper
                        }}
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        <video
                            ref={videoRef}
                            src={displaySrc!}
                            controls
                            autoPlay
                            loop
                            playsInline
                            className="max-w-full max-h-full object-contain pointer-events-auto"
                            // Native listener handles double click
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%'
                            }}
                        />
                    </div>
                ) : (
                    <img
                        src={displaySrc!}
                        alt={image.prompt}
                        referrerPolicy="no-referrer"
                        className={`max-w-full max-h-full object-contain transition-transform duration-100 ${!displaySrc || hasError ? 'opacity-0' : ''}`}
                        draggable={false}
                        onLoad={handleImageLoad} // 🚀 [Fix] Capture real dimensions
                        onMouseDown={handleMouseDown}
                        onDoubleClick={(e) => { e.preventDefault(); onClose(); }}
                        onContextMenu={(e) => e.stopPropagation()}
                        onError={() => setHasError(true)}
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            cursor: isPanning ? 'grabbing' : 'grab'
                        }}
                    />
                )}
                {/* Error Fallback */}
                {hasError && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-[var(--bg-tertiary)] p-4 rounded-lg text-red-400 flex flex-col items-center gap-2">
                            <ZoomOut size={24} />
                            <span>图片加载失败 (Image Load Failed)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 底部信息面板 */}
            {/* 固定高度，位于图片下方，防止遮挡 */}
            <div
                className="h-[100px] w-full bg-[var(--bg-secondary)]/90 border-t border-[var(--border-light)] flex items-center justify-between px-8 py-4 z-50 text-[var(--text-primary)]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col max-w-[70%]">
                    <div
                        className="text-sm font-medium line-clamp-2 cursor-pointer hover:text-indigo-300 transition-colors"
                        title="点击复制提示词"
                        onClick={async (e) => {
                            e.stopPropagation();
                            try {
                                await navigator.clipboard.writeText(image.prompt);
                                const { notify } = await import('../services/notificationService');
                                notify.success('已复制', '提示词已复制到剪贴板');
                            } catch (err) {
                                console.error('Copy failed', err);
                            }
                        }}
                    >
                        {image.prompt}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-tertiary)]">
                        <span className="bg-[var(--bg-tertiary)] px-2 py-0.5 rounded border border-[var(--border-medium)]">
                            {currentIndex + 1} / {images.length}
                        </span>
                        <span>{image.model.split('/').pop()}</span>
                        {/* 🚀 [Fix] Show REAL dimensions from loaded image, fallback to metadata */}
                        <span>{realDimensions || image.dimensions || 'Loading...'}</span>
                        {image.generationTime && <span>{(image.generationTime / 1000).toFixed(1)}s</span>}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* 控制栏 */}
                    <div className="flex items-center bg-[var(--bg-tertiary)] rounded-lg p-1">
                        <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-2 hover:bg-[var(--bg-secondary)] rounded" title="缩小"><ZoomOut size={16} /></button>
                        <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} className="p-2 hover:bg-[var(--bg-secondary)] rounded" title="放大"><ZoomIn size={16} /></button>
                        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="p-2 hover:bg-[var(--bg-secondary)] rounded ml-1 border-l border-[var(--border-light)]" title="重置"><RotateCcw size={16} /></button>
                    </div>

                    {/* 局部重绘按钮 - 仅对图片显示 */}
                    {onInpaint && !isVideo && !isAudio && displaySrc && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowInpaint(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-purple-600/80 border border-[var(--border-medium)] hover:border-purple-500 rounded-lg text-sm font-medium transition-all"
                            title="局部重绘"
                        >
                            <Pen size={16} />
                            重绘
                        </button>
                    )}

                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
                        title="下载原始图片"
                    >
                        <Download size={16} />
                        下载
                    </button>
                </div>
            </div>

            {/* InpaintModal - 局部重绘弹窗 */}
            {showInpaint && displaySrc && (
                <InpaintModal
                    imageUrl={displaySrc}
                    onCancel={() => setShowInpaint(false)}
                    onSave={(maskBase64, prompt) => {
                        setShowInpaint(false);
                        if (onInpaint) {
                            onInpaint(image, maskBase64, prompt);
                        }
                        onClose();
                    }}
                />
            )}
        </div>,
        document.body
    );
};
