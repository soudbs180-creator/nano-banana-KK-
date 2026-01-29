import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { AspectRatio } from '../types';
import { getCardDimensions } from '../utils/styleUtils';

interface ReferenceImage {
    id?: string;
    data: string;
    mimeType: string;
}

interface PendingNodeProps {
    prompt: string;
    parallelCount: number;
    isGenerating: boolean;
    position: { x: number; y: number };
    aspectRatio: AspectRatio;
    onPositionChange?: (pos: { x: number; y: number }) => void;
    isMobile?: boolean;
    canvasTransform?: { x: number; y: number; scale: number };
    referenceImages?: ReferenceImage[];
    sourcePosition?: { x: number; y: number };
    onDisconnect?: () => void;
}

const PendingNode: React.FC<PendingNodeProps> = ({
    prompt,
    parallelCount,
    isGenerating,
    position,
    aspectRatio,
    onPositionChange,
    isMobile = false,
    canvasTransform = { x: 0, y: 0, scale: 1 },
    referenceImages = [],
    sourcePosition,
    onDisconnect
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 });

    const { width: w, totalHeight: h } = getCardDimensions(aspectRatio, true); // Include footer for placeholder height
    const totalWidth = parallelCount * (w + 20) - 20;
    // const startX = -(totalWidth / 2) + w / 2; // Unused in final layout logic

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Allow dragging on mobile too (consistency across platforms)

        e.stopPropagation();
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
        setDragOffset({
            x: clientX,
            y: clientY
        });
        // Store the starting position of the card
        dragStartPos.current = { x: position.x, y: position.y };
    };

    // MUST be called unconditionally - moved before any conditional returns
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;

            // Prevent scrolling while dragging
            if (e.cancelable) e.preventDefault();

            let clientX, clientY;
            if ('touches' in e) {
                clientX = (e as TouchEvent).touches[0].clientX;
                clientY = (e as TouchEvent).touches[0].clientY;
            } else {
                clientX = (e as MouseEvent).clientX;
                clientY = (e as MouseEvent).clientY;
            }

            // Calculate delta in screen space, then convert to canvas space by dividing by scale
            const deltaX = (clientX - dragOffset.x) / canvasTransform.scale;
            const deltaY = (clientY - dragOffset.y) / canvasTransform.scale;

            onPositionChange?.({
                x: dragStartPos.current.x + deltaX,
                y: dragStartPos.current.y + deltaY
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('touchmove', handleMouseMove, { passive: false });
            window.addEventListener('touchend', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging, dragOffset, onPositionChange, canvasTransform.scale]);

    // Conditional rendering AFTER all hooks
    if (!prompt) return null;

    // 如果只是在输入中，显示一个跟随的输入气泡
    // Uses same transform as PromptNodeComponent: translate(-50%, -100%)
    if (!isGenerating) {
        return (
            <div
                className="absolute z-50 transition-all duration-300"
                style={{
                    left: position.x,
                    top: position.y,
                    transform: 'translate(-50%, -100%)', // Same as PromptNodeComponent
                    cursor: 'grab'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
            >
                {/* Preview Card */}
                <div
                    className="rounded-2xl p-3 shadow-xl animate-scaleIn"
                    style={{
                        width: getCardDimensions(aspectRatio).width,
                        backgroundColor: 'rgba(24, 24, 27, 0.6)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        border: '1px solid rgba(99, 102, 241, 0.2)'
                    }}
                >
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500/50 to-purple-500/50 flex items-center justify-center">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                            </svg>
                        </div>
                        <span className="text-xs font-medium text-zinc-400">Prompt Preview</span>
                    </div>
                    <p className="text-zinc-100 text-sm leading-relaxed line-clamp-4 font-normal">
                        {prompt}
                        <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-500 animate-pulse align-middle rounded-full" />
                    </p>
                </div>
            </div>
        );
    }

    // 如果正在生成中，显示主卡片和连接的子占位符
    const cardWidth = w;
    const cardHeight = h;
    const gapToPlaceholders = 80;

    // Calculate placeholder grid
    const columns = isMobile ? Math.min(parallelCount, 2) : Math.min(parallelCount, 2);
    const placeholderGap = isMobile ? 10 : 16;

    return (
        <div
            className="absolute z-40 flex flex-col items-center"
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)',
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
        >


            {/* Main Prompt Node */}
            <div
                className="rounded-2xl p-4 shadow-xl flex flex-col gap-3 animate-fadeIn"
                style={{
                    width: getCardDimensions(aspectRatio).width,
                    backgroundColor: 'rgba(26, 26, 28, 0.6)',
                    backdropFilter: 'blur(40px) saturate(180%)',
                    border: '1px solid rgba(99, 102, 241, 0.2)'
                }}
            >
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Generating x{parallelCount}</span>
                </div>
                {referenceImages && referenceImages.length > 0 && (
                    <div className="flex gap-1 mb-1 flex-wrap">
                        {referenceImages.slice(0, 3).map((img, idx) => (
                            <img
                                key={img.id || idx}
                                src={`data:${img.mimeType};base64,${img.data}`}
                                alt="Reference"
                                className="w-8 h-8 object-cover rounded border border-white/10"
                            />
                        ))}
                        {referenceImages.length > 3 && (
                            <div className="w-8 h-8 rounded border border-white/10 bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400">
                                +{referenceImages.length - 3}
                            </div>
                        )}
                    </div>
                )}
                <p className="text-zinc-300 text-xs leading-relaxed line-clamp-3">{prompt}</p>
            </div>

            {/* Placeholders */}
            <div className="relative" style={{ height: 0 }}>
                {Array.from({ length: parallelCount }).map((_, i) => {
                    const cardW = isMobile ? 170 : w;
                    const cardH = isMobile ? 260 : h;

                    const col = i % columns;
                    const row = Math.floor(i / columns);

                    const itemsInRow = Math.min(columns, parallelCount - row * columns);
                    const currentGridWidth = itemsInRow * cardW + (itemsInRow - 1) * placeholderGap;
                    const startX = -currentGridWidth / 2;

                    const offsetX = startX + col * (cardW + placeholderGap) + cardW / 2;
                    const offsetY = gapToPlaceholders + cardH + row * (cardH + placeholderGap);

                    return (
                        <React.Fragment key={i}>
                            <svg className="pointer-events-none" style={{ position: 'absolute', left: '50%', top: 0, overflow: 'visible', zIndex: 10 }}>
                                <path d={`M0,0 L${offsetX},${offsetY}`} fill="none" stroke="#3f3f46" strokeWidth="1" strokeDasharray="4 4" />
                            </svg>
                            <div
                                className="absolute rounded-2xl overflow-hidden shadow-lg flex items-center justify-center"
                                style={{
                                    backgroundColor: 'rgba(26, 26, 28, 0.5)',
                                    backdropFilter: 'blur(20px)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    width: cardW,
                                    height: cardH,
                                    left: `calc(50% + ${offsetX}px)`,
                                    top: offsetY,
                                    transform: 'translateX(-50%)',
                                    zIndex: 0
                                }}
                            >
                                <div className="flex flex-col items-center gap-3 opacity-50">
                                    <Loader2 size={24} className="text-indigo-400 animate-spin" />
                                    <span className="text-[10px] text-zinc-500 font-medium">Creating masterpiece...</span>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/5" />
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default PendingNode;
