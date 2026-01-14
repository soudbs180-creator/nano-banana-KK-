import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { GeneratedImage } from '../types';
import { Download, Trash2 } from 'lucide-react';

interface ImageNodeProps {
    image: GeneratedImage;
    position: { x: number; y: number };
    onPositionChange: (id: string, position: { x: number; y: number }) => void;
    onDelete: (id: string) => void;
    onConnectEnd?: (imageId: string) => void;
    onClick?: (imageId: string) => void;
    isActive?: boolean;
    canvasTransform?: { x: number; y: number; scale: number };
    isMobile?: boolean;
}

const ImageNodeComponent: React.FC<ImageNodeProps> = ({
    image,
    position,
    onPositionChange,
    onDelete,
    onConnectEnd,
    onClick,
    isActive = false,
    canvasTransform = { x: 0, y: 0, scale: 1 },
    isMobile = false
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [showLightbox, setShowLightbox] = useState(false);
    const [lightboxZoom, setLightboxZoom] = useState(1); // 50% to 200%
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartCanvasPos = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // e.preventDefault(); // Optional: prevent scroll on card drag?
        e.stopPropagation(); // Stop canvas panning

        setIsDragging(true);

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
        dragStartCanvasPos.current = { x: position.x, y: position.y };
    };

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;
        e.preventDefault(); // Prevent scrolling while dragging card

        let clientX, clientY;
        if ('touches' in e) {
            clientX = (e as TouchEvent).touches[0].clientX;
            clientY = (e as TouchEvent).touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        // Calculate delta in screen space, then convert to canvas space
        const deltaX = (clientX - dragStartPos.current.x) / canvasTransform.scale;
        const deltaY = (clientY - dragStartPos.current.y) / canvasTransform.scale;

        onPositionChange(image.id, {
            x: dragStartCanvasPos.current.x + deltaX,
            y: dragStartCanvasPos.current.y + deltaY
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    React.useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            // Touch listeners (non-passive to prevent scroll)
            window.addEventListener('touchmove', handleMouseMove, { passive: false });
            window.addEventListener('touchend', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging, canvasTransform.scale]);

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const response = await fetch(image.url);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kk-studio-${image.id}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download failed:', err);
        }
    };

    const handleImageDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLightboxZoom(1); // Reset zoom on open
        setShowLightbox(true);
    };

    const getMobileWidth = () => {
        // Mobile 2-column grid uses ~170px width
        return 170;
    };

    const nodeWidth = isMobile ? getMobileWidth() : (
        image.aspectRatio === '1:1' ? 280 :
            image.aspectRatio === '16:9' ? 320 :
                image.aspectRatio === '9:16' ? 200 : 280
    );

    return (
        <>
            <div
                className={`absolute flex flex-col items-center group animate-cardPopIn ${isActive ? 'z-10' : 'z-1'}`}
                style={{
                    left: position.x,
                    top: position.y,
                    width: nodeWidth,
                    transform: 'translate(-50%, 0)',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    transition: isDragging ? 'none' : 'box-shadow 0.2s ease'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
                onClick={(e) => { e.stopPropagation(); onClick?.(image.id); }}
            >
                {/* Image Card */}
                <div
                    className={`
                        relative bg-[#18181b] border rounded-2xl overflow-hidden shadow-xl w-full
                        ${isDragging ? '' : 'transition-all duration-200'} hover:shadow-2xl
                        ${isActive ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-white/5 hover:border-white/10'}
                    `}
                >
                    {/* Connection Point - Top Center */}
                    <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-transparent hover:bg-indigo-500/50 rounded-full z-50 cursor-crosshair"
                        onMouseUp={() => onConnectEnd?.(image.id)}
                    />

                    {/* Main Image - Double-click to enlarge */}
                    <div
                        className="relative aspect-auto cursor-pointer"
                        onDoubleClick={handleImageDoubleClick}
                    >
                        <img
                            src={image.url}
                            alt={image.prompt}
                            className="w-full h-auto block select-none pointer-events-none"
                            draggable={false}
                        />
                    </div>

                    {/* Footer - Model badge + Download + Delete */}
                    <div className="px-3 py-2 bg-[#121212]/50 flex items-center justify-between border-t border-white/5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${image.model?.includes('pro')
                            ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                            : 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                            }`}>
                            {image.model?.includes('pro') ? 'PRO' : 'FAST'}
                        </span>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleDownload}
                                className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
                                title="下载"
                            >
                                <Download size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                                className="text-zinc-500 hover:text-red-400 p-1 rounded-md hover:bg-white/5 transition-colors"
                                title="删除"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lightbox Modal - Rendered to body via Portal for true top-level z-index */}
            {showLightbox && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center animate-fadeIn"
                    onClick={() => setShowLightbox(false)}
                    onWheel={(e) => {
                        e.preventDefault();
                        setLightboxZoom(prev => {
                            const delta = e.deltaY > 0 ? -0.1 : 0.1;
                            return Math.min(2, Math.max(0.5, prev + delta));
                        });
                    }}
                    style={{ backdropFilter: 'blur(8px)' }}
                >
                    {/* Close Button - Top Right */}
                    <button
                        onClick={() => setShowLightbox(false)}
                        className="absolute top-4 right-4 z-[100000] w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-110"
                        title="关闭"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Zoom indicator */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 px-3 py-1 rounded-full text-white text-sm">
                        {Math.round(lightboxZoom * 100)}%
                    </div>

                    {/* Main Image - Click anywhere to close, scroll to zoom */}
                    <img
                        src={image.url}
                        alt={image.prompt}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={() => setShowLightbox(false)}
                        onContextMenu={(e) => e.stopPropagation()}
                        className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl cursor-zoom-in"
                        draggable={false}
                        style={{
                            transform: `scale(${lightboxZoom})`,
                            transition: 'transform 0.1s ease-out',
                            animation: 'lightboxScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
                        }}
                    />

                    {/* Hint text */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 text-xs">
                        滚轮缩放 · 双击关闭 · 右键复制图片
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ImageNodeComponent;
