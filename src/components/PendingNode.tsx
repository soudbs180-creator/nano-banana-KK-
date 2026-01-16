import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { AspectRatio } from '../types';

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
    sourcePosition
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Calculate dimensions based on aspect ratio for placeholders
    const getDims = (ratio: AspectRatio) => {
        switch (ratio) {
            case AspectRatio.SQUARE: return { w: 280, h: 280 };
            case AspectRatio.LANDSCAPE_16_9: return { w: 320, h: 180 };
            case AspectRatio.PORTRAIT_9_16: return { w: 200, h: 355 };
            default: return { w: 280, h: 280 };
        }
    };

    const { w, h } = getDims(aspectRatio);
    const totalWidth = parallelCount * (w + 20) - 20;
    const startX = -(totalWidth / 2) + w / 2;

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

    // Reference to store starting card position
    const dragStartPos = useRef({ x: 0, y: 0 });

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
    // This ensures the position matches before and after generation
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
                {/* Preview Card - matches PromptNodeComponent dimensions */}
                <div className="bg-[#18181b] border border-indigo-500/30 rounded-2xl p-3 shadow-xl w-[320px] animate-scaleIn">
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
    // 使用与 PromptNodeComponent 相同的 transform: translate(-50%, -100%)
    const cardWidth = 320;
    const cardHeight = 140; // approximate card height
    const dotSize = 12;
    const dotMarginTop = 12; // Same as PromptNodeComponent: mt-3 = 12px
    const gapToPlaceholders = 80; // Must match handleGenerate gapToImages

    // Calculate placeholder grid - use actual count for columns calculation
    const columns = isMobile ? Math.min(parallelCount, 2) : Math.min(parallelCount, 2);
    const placeholderGap = isMobile ? 10 : 16;

    return (
        <div
            className="absolute z-40 flex flex-col items-center"
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)', // SAME AS PromptNodeComponent
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
        >
            {/* Connection Line from Source Image (Flowith style: Image bottom → Prompt top) */}
            {sourcePosition && (() => {
                // Both cards use translate(-50%, -100%) so position.y is BOTTOM

                // Start: Image bottom center
                const startX = sourcePosition.x - position.x;
                const startY = sourcePosition.y - position.y;

                // End: Prompt Top Center (approx 140px height)
                const promptHeightApprox = 140;
                const endX = 0;
                const endY = -promptHeightApprox; // Target TOP of this card

                // Bezier Logic
                const deltaX = endX - startX;
                const deltaY = endY - startY;
                const absDeltaX = Math.abs(deltaX);
                const absDeltaY = Math.abs(deltaY);

                // User requested Straight Line style (matching the "Generating" look)
                let d = '';
                if (absDeltaX < 20) {
                    // Strictly straight if aligned
                    d = `M${startX},${startY} L${endX},${endY}`;
                } else {
                    // Minimal curve if offset
                    const controlY1 = startY + deltaY * 0.5;
                    const controlY2 = endY - deltaY * 0.5;
                    d = `M${startX},${startY} C${startX},${controlY1} ${endX},${controlY2} ${endX},${endY}`;
                }

                return (
                    <svg
                        className="absolute pointer-events-none"
                        style={{
                            overflow: 'visible',
                            left: '50%',
                            bottom: 0,
                            zIndex: -1
                        }}
                    >
                        {/* Starting dot */}
                        <circle
                            cx={startX}
                            cy={startY}
                            r="3"
                            fill="#D1D5DB"
                        />
                        {/* Smooth Bezier curve */}
                        <path
                            d={d}
                            fill="none"
                            stroke="#D1D5DB"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                            strokeLinecap="round"
                            className="transition-all duration-300 ease-in-out"
                        />
                    </svg>
                );
            })()}

            {/* Main Prompt Node - Same structure as PromptNodeComponent */}
            <div
                className="bg-[#1a1a1c] border-2 border-indigo-500/30 rounded-2xl p-4 shadow-xl flex flex-col gap-3 animate-fadeIn"
                style={{ width: cardWidth }}
            >
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Generating x{parallelCount}</span>
                </div>
                {/* Reference Images Thumbnails */}
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

            {/* Placeholders - Positioned BELOW the card bottom */}
            {/* Since container uses translate(-50%, -100%), 'bottom' of container is at position.y */}
            {/* Placeholders need to be positioned below using absolute positioning from container bottom */}
            <div className="relative" style={{ height: 0 }}>
                {Array.from({ length: parallelCount }).map((_, i) => {
                    const cardW = isMobile ? 170 : w;
                    // Add 60px footer height to match final ImageCard2
                    const cardH = (isMobile ? 200 : h) + 60;

                    const col = i % columns;
                    const row = Math.floor(i / columns);

                    // Calculate actual grid width based on items in current row
                    const itemsInRow = Math.min(columns, parallelCount - row * columns);
                    const currentGridWidth = itemsInRow * cardW + (itemsInRow - 1) * placeholderGap;
                    const startX = -currentGridWidth / 2;

                    // For single item, center it; for multiple, position in grid
                    const offsetX = startX + col * (cardW + placeholderGap) + cardW / 2;
                    const offsetY = gapToPlaceholders + cardH + row * (cardH + placeholderGap);

                    return (
                        <React.Fragment key={i}>
                            {/* Dashed line from dot to placeholder center */}
                            <svg
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: 0,
                                    overflow: 'visible',
                                    zIndex: 10
                                }}
                            >
                                <path
                                    d={`M0,0 L${offsetX},${offsetY}`}
                                    fill="none"
                                    stroke="#52525b"
                                    strokeWidth="1.5"
                                    strokeDasharray="4 3"
                                />
                            </svg>

                            {/* Placeholder Card */}
                            <div
                                className="absolute bg-[#1a1a1c] border border-white/10 rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
                                style={{
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
