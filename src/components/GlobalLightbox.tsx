import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { GeneratedImage, GenerationMode } from '../types';
import { Download, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface GlobalLightboxProps {
    images: GeneratedImage[];
    initialIndex: number;
    onClose: () => void;
}

/**
 * 全局灯箱组件
 * 用于全屏查看生成的图片或视频，支持缩放、平移和列表导航
 * @param images 图片对象数组
 * @param initialIndex 初始显示的图片索引
 * @param onClose 关闭事件回调
 */
export const GlobalLightbox: React.FC<GlobalLightboxProps> = ({ images, initialIndex, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);

    // 图片加载状态
    const [displaySrc, setDisplaySrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const image = images[currentIndex];
    const panStartRef = useRef({ x: 0, y: 0 });
    const panStartPosRef = useRef({ x: 0, y: 0 });

    // 1. 加载高清图逻辑
    useEffect(() => {
        let active = true;
        setIsLoading(true);
        setHasError(false);
        setDisplaySrc(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });

        const loadContent = async () => {
            try {
                // 确定目标资源：优先使用 originalUrl，其次使用 url
                // 如果是 blob/data URL，直接使用
                // 尝试从 IndexedDB 获取原始质量图片
                const { getImage } = await import('../services/imageStorage');
                const cached = await getImage(image.id);

                if (!active) return;

                if (cached && cached.startsWith('data:')) {
                    setDisplaySrc(cached);
                } else if (image.originalUrl) {
                    setDisplaySrc(image.originalUrl);
                } else {
                    setDisplaySrc(image.url);
                }
            } catch (e) {
                console.error("Lightbox load error", e);
                if (active) setDisplaySrc(image.url); // 兜底方案
            } finally {
                if (active) setIsLoading(false);
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
        // 简化版下载逻辑 (如有需要可移植完整的 imageStorage 下载逻辑)
        if (!displaySrc) return;
        const a = document.createElement('a');
        a.href = displaySrc;
        a.download = `image-${image.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    if (!image) return null;

    const isVideo = image.mode === GenerationMode.VIDEO || displaySrc?.startsWith('data:video') || displaySrc?.endsWith('.mp4');

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-[99999] bg-black/95 flex flex-col items-center justify-center animate-fadeIn select-none overflow-hidden"
            onClick={onClose}
        >
            {/* 顶栏: 关闭按钮 */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-50 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
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
                ) : isVideo ? (
                    <video
                        src={displaySrc!}
                        controls
                        autoPlay
                        loop
                        onDoubleClick={(e) => { e.preventDefault(); onClose(); }}
                        className="max-w-full max-h-full object-contain"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            cursor: isPanning ? 'grabbing' : 'grab'
                        }}
                    />
                ) : (
                    <img
                        src={displaySrc!}
                        alt={image.prompt}
                        className={`max-w-full max-h-full object-contain transition-transform duration-100 ${!displaySrc || hasError ? 'opacity-0' : ''}`}
                        draggable={false}
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
                    <div className="text-sm font-medium line-clamp-2" title={image.prompt}>
                        {image.prompt}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-[var(--text-tertiary)]">
                        <span className="bg-[var(--bg-tertiary)] px-2 py-0.5 rounded border border-[var(--border-medium)]">
                            {currentIndex + 1} / {images.length}
                        </span>
                        <span>{image.model.split('/').pop()}</span>
                        {image.dimensions && <span>{image.dimensions}</span>}
                        {image.generationTime && <span>{(image.generationTime / 1000).toFixed(1)}s</span>}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* 控制栏 */}
                    <div className="flex items-center bg-[var(--bg-tertiary)] rounded-lg p-1">
                        <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-2 hover:bg-[var(--bg-secondary)] rounded" title="缩小"><ZoomOut size={16} /></button>
                        <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} className="p-2 hover:bg-[var(--bg-secondary)] rounded" title="放大"><ZoomIn size={16} /></button>
                        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="p-2 hover:bg-[var(--bg-secondary)] rounded ml-1 border-l border-[var(--border-light)]" title="重置"><RotateCcw size={16} /></button>
                    </div>

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
        </div>,
        document.body
    );
};
