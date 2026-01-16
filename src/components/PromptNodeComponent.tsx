import React, { useState, useEffect, useRef } from 'react';
import { PromptNode, AspectRatio } from '../types';
import { Sparkles, Loader2 } from 'lucide-react';

interface PromptNodeProps {
    node: PromptNode;
    onPositionChange: (id: string, newPos: { x: number; y: number }) => void;
    isSelected: boolean;
    onSelect: () => void;
    onClickPrompt?: (node: PromptNode) => void;
    onConnectStart?: (id: string, startPos: { x: number; y: number }) => void;
    canvasTransform?: { x: number; y: number; scale: number };
    isMobile?: boolean;
    sourcePosition?: { x: number; y: number };
    onCancel?: (id: string) => void;
    onDelete?: (id: string) => void;
}

const PromptNodeComponent: React.FC<PromptNodeProps> = ({
    node,
    onPositionChange,
    isSelected,
    onSelect,
    onClickPrompt,
    onConnectStart,
    canvasTransform = { x: 0, y: 0, scale: 1 },
    isMobile = false,
    sourcePosition,
    onCancel,
    onDelete
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartCanvasPos = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Stop canvas panning when touching the card
        e.stopPropagation();

        setIsDragging(true);
        onSelect();

        // Handle both Mouse and Touch events
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        // Store initial positions
        dragStartPos.current = { x: clientX, y: clientY };
        dragStartCanvasPos.current = { x: node.position.x, y: node.position.y };
    };

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;

        // Prevent scrolling/panning while dragging card
        if (e.cancelable) e.preventDefault();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = (e as TouchEvent).touches[0].clientX;
            clientY = (e as TouchEvent).touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        // Calculate delta in screen space, convert to canvas space
        const deltaX = (clientX - dragStartPos.current.x) / canvasTransform.scale;
        const deltaY = (clientY - dragStartPos.current.y) / canvasTransform.scale;
        onPositionChange(node.id, {
            x: dragStartCanvasPos.current.x + deltaX,
            y: dragStartCanvasPos.current.y + deltaY
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
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

    return (
        <div
            className={`absolute z-20 flex flex-col items-center group animate-cardPopIn ${isSelected ? 'z-30' : ''}`}
            style={{
                left: node.position.x,
                top: node.position.y,
                transform: 'translate(-50%, -100%)',
                cursor: isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'box-shadow 0.2s ease'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            onClick={(e) => {
                // Single click to fill input, but not when dragging
                if (!isDragging) {
                    e.stopPropagation();
                    onClickPrompt?.(node);
                }
            }}
        >
            {/* Main Card */}
            <div className={`
                relative bg-[#18181b] border rounded-2xl p-3 shadow-xl w-[320px] max-w-[95vw] flex flex-col select-none
                ${isDragging ? '' : 'transition-all duration-200'}
                ${node.isGenerating ? 'border-indigo-500/30' : isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-white/10 hover:border-white/20'}
            `}>
                {/* Header - Changes based on generating state */}
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
                    {node.isGenerating ? (
                        <>
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                                <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </div>
                            <span className="text-xs font-medium text-indigo-400 flex-1">Generating...</span>

                            {/* Stop Button */}
                            {onCancel && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancel(node.id);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all group/stop"
                                    title="停止生成"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                        <rect x="6" y="6" width="12" height="12" rx="2" />
                                    </svg>
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                                <Sparkles size={12} className="text-white" />
                            </div>
                            <span className="text-xs font-medium text-zinc-400 flex-1">Prompt</span>

                            {/* Delete Button */}
                            {onDelete && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('删除此提示词卡片？')) {
                                            onDelete(node.id);
                                        }
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                    title="删除"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* Reference Images Thumbnails */}
                {node.referenceImages && node.referenceImages.length > 0 && (
                    <div className="flex gap-1 mb-2 flex-wrap">
                        {node.referenceImages.slice(0, 4).map((img, idx) => (
                            <img
                                key={img.id || idx}
                                src={`data:${img.mimeType};base64,${img.data}`}
                                alt="Reference"
                                className="w-10 h-10 object-cover rounded border border-white/10"
                            />
                        ))}
                        {node.referenceImages.length > 4 && (
                            <div className="w-10 h-10 rounded border border-white/10 bg-zinc-800 flex items-center justify-center text-xs text-zinc-400">
                                +{node.referenceImages.length - 4}
                            </div>
                        )}
                    </div>
                )}

                <p className="text-zinc-100 text-sm leading-relaxed line-clamp-3 font-normal flex-1">
                    {node.prompt}
                </p>
            </div>

            {/* Spacer (formerly connection dot - removed per user request) */}
            <div className="h-3 mt-3" />

            {/* Loading Placeholders - Only shown when generating */}
            {node.isGenerating && node.parallelCount && (() => {
                const count = node.parallelCount;
                const columns = Math.min(count, 2);
                const placeholderGap = 16;
                const gapToPlaceholders = 80; // Must match handleGenerate gapToImages

                // Calculate card dimensions based on aspect ratio AND mobile
                const getDims = (ratio: AspectRatio) => {
                    // Mobile dimensions (matching App.tsx logic)
                    if (isMobile) {
                        return { w: 170, h: 200 + 60 }; // cardWidth + Footer
                    }
                    // Desktop dimensions
                    switch (ratio) {
                        case AspectRatio.SQUARE: return { w: 280, h: 280 };
                        case AspectRatio.LANDSCAPE_16_9: return { w: 320, h: 180 };
                        case AspectRatio.PORTRAIT_9_16: return { w: 200, h: 355 };
                        default: return { w: 280, h: 280 };
                    }
                };
                const { w, h } = getDims(node.aspectRatio);

                return (
                    <div className="relative" style={{ height: 0 }}>
                        {Array.from({ length: count }).map((_, i) => {
                            const col = i % columns;
                            const row = Math.floor(i / columns);

                            // Calculate grid positioning
                            const itemsInRow = Math.min(columns, count - row * columns);
                            const currentGridWidth = itemsInRow * w + (itemsInRow - 1) * placeholderGap;
                            const startX = -currentGridWidth / 2;
                            const offsetX = startX + col * (w + placeholderGap) + w / 2;
                            const offsetY = gapToPlaceholders + row * (h + placeholderGap);

                            return (
                                <React.Fragment key={i}>
                                    {/* Dashed line from dot to placeholder */}
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
                                            width: w,
                                            height: h,
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
                );
            })()}

            {/* Connection Line from Source Image (Flowith style: Image bottom → Prompt top) */}
            {sourcePosition && (() => {
                // Both cards use translate(-50%, -100%) so position.y is BOTTOM

                // Start: Image bottom center
                const startX = sourcePosition.x - node.position.x;
                const startY = sourcePosition.y - node.position.y;

                // End: Prompt Top Center (approx 140px height for prompt)
                const promptHeightApprox = 140;
                const endX = 0;
                const endY = -promptHeightApprox;

                // Bezier Logic
                const deltaX = endX - startX;
                const deltaY = endY - startY;
                const absDeltaX = Math.abs(deltaX);
                const absDeltaY = Math.abs(deltaY);

                let d = '';
                if (absDeltaX > 100) {
                    // Branching S-curve
                    const controlY1 = startY + absDeltaY * 0.5;
                    const controlY2 = endY - absDeltaY * 0.5;
                    d = `M${startX},${startY} C${startX},${controlY1} ${endX},${controlY2} ${endX},${endY}`;
                } else {
                    // Standard vertical
                    const controlY1 = startY + deltaY * 0.4;
                    const controlY2 = startY + deltaY * 0.6;
                    d = `M${startX},${startY} C${startX},${controlY1} ${endX},${controlY2} ${endX},${endY}`;
                }

                return (
                    <svg
                        className="absolute pointer-events-none"
                        style={{
                            overflow: 'visible',
                            left: '50%',
                            top: 0,
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

            {/* Visual Guide Line (optional, only when dragging maybe?) */}
        </div>
    );
};

export default PromptNodeComponent;
