'use client';

import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { GeneratedImage } from '@/types';
import { Download, Trash2 } from 'lucide-react';

interface ImageNodeProps {
    image: GeneratedImage;
    position: { x: number; y: number };
    onPositionChange: (id: string, position: { x: number; y: number }) => void;
    onDelete: (id: string) => void;
    onConnectEnd?: (imageId: string) => void;
    onClick?: (imageId: string) => void;
    isActive?: boolean;
}

const ImageNodeComponent: React.FC<ImageNodeProps> = ({
    image,
    position,
    onPositionChange,
    onDelete,
    onConnectEnd,
    onClick,
    isActive = false
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [showLightbox, setShowLightbox] = useState(false);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        onPositionChange(image.id, {
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    React.useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset, image.id, onPositionChange]);

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

    const handleImageClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowLightbox(true);
    };

    const nodeWidth = image.aspectRatio === '1:1' ? 280 :
        image.aspectRatio === '16:9' ? 320 :
            image.aspectRatio === '9:16' ? 200 : 280;

    return (
        <>
            <div
                className={`absolute flex flex-col items-center group ${isActive ? 'z-10' : 'z-1'}`}
                style={{
                    left: position.x,
                    top: position.y,
                    width: nodeWidth,
                    transform: 'translate(-50%, 0)', // Center horizontally
                    cursor: isDragging ? 'grabbing' : 'grab'
                }}
                onMouseDown={handleMouseDown}
            >
                {/* Image Card */}
                <div
                    className={`
                        relative bg-[#18181b] border rounded-2xl overflow-hidden shadow-xl w-full
                        transition-all duration-200 hover:shadow-2xl
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
                        onDoubleClick={handleImageClick}
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

                    {/* Main Image - Click anywhere to close, right-click to copy */}
                    <img
                        src={image.url}
                        alt={image.prompt}
                        onClick={() => setShowLightbox(false)}
                        onContextMenu={(e) => e.stopPropagation()}
                        className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl cursor-pointer animate-scaleIn"
                        draggable={false}
                        style={{
                            animation: 'lightboxScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
                        }}
                    />

                    {/* Hint text */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 text-xs">
                        点击任意处关闭 · 右键复制图片
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ImageNodeComponent;
