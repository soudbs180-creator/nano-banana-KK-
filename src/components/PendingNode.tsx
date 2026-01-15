import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { AspectRatio } from '../types';

interface PendingNodeProps {
    prompt: string;
    parallelCount: number;
    isGenerating: boolean;
    position: { x: number; y: number };
    aspectRatio: AspectRatio;
    onPositionChange?: (pos: { x: number; y: number }) => void;
    isMobile?: boolean;
    canvasTransform?: { x: number; y: number; scale: number };
}

const PendingNode: React.FC<PendingNodeProps> = ({
    prompt,
    parallelCount,
    isGenerating,
    position,
    aspectRatio,
    onPositionChange,
    isMobile = false,
    canvasTransform = { x: 0, y: 0, scale: 1 }
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
        if (isMobile) return; // Disable dragging on mobile (allow canvas panning)

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

                {/* Connection Dot - Below card (same as PromptNodeComponent) */}
                <div className="w-3 h-3 bg-indigo-500/50 rounded-full border-2 border-[#121212] shadow-sm mt-3 mx-auto transition-transform" />
            </div>
        );
    }

    // 如果正在生成中，显示主卡片和连接的子占位符（放在右侧）
    return (
        <div
            className="absolute z-40"
            style={{
                left: position.x,
                top: position.y,
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
        >
            {/* Main Prompt Node */}
            <div
                className="absolute bg-[#1a1a1c] border-2 border-indigo-500/30 rounded-2xl p-4 shadow-xl w-[320px] -translate-x-1/2 -translate-y-full flex flex-col gap-3 animate-fadeIn"
                style={{ marginBottom: '12px' }}
            >
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Generating x{parallelCount}</span>
                </div>
                <p className="text-zinc-300 text-xs leading-relaxed line-clamp-3">{prompt}</p>
            </div>

            {/* Connecting Lines and Placeholders - Positioned BELOW prompt, HORIZONTAL layout */}
            {Array.from({ length: parallelCount }).map((_, i) => {
                // Horizontal layout: centered with prompt card
                const gap = 20;

                let offsetX, offsetY;

                if (isMobile) {
                    // Mobile: Vertical 2-col grid
                    const col = i % 2;
                    const row = Math.floor(i / 2);
                    const mobileCardWidth = 170; // Approximation
                    const mobileGap = 10;

                    // Center the 2-column grid relative to the prompt (x=0 is center of prompt)
                    const gridWidth = mobileCardWidth * 2 + mobileGap;
                    const startX = -gridWidth / 2 + mobileCardWidth / 2;

                    offsetX = startX + col * (mobileCardWidth + mobileGap);
                    offsetY = 150 + row * (250 + mobileGap); // Vertical offset below prompt
                } else {
                    // Desktop: 2-column grid (matching final generation layout)
                    const columns = 2;
                    const gap = 16;
                    const col = i % columns;
                    const row = Math.floor(i / columns);

                    // Calculate grid width for centering
                    const gridWidth = columns * w + (columns - 1) * gap;
                    const startX = -gridWidth / 2 + w / 2;

                    offsetX = startX + col * (w + gap);
                    // Calculate card height based on aspect ratio
                    const cardHeight = h + 50; // Approximate with some padding
                    offsetY = 50 + row * (cardHeight + gap);
                }

                return (
                    <React.Fragment key={i}>
                        {/* Curved connection line from prompt dot to placeholder top-center */}
                        <svg
                            className="absolute overflow-visible pointer-events-none"
                            style={{ top: 0, left: 0 }}
                        >
                            {/* Start at dot position (18px below origin), end at top-center of placeholder */}
                            <path
                                d={`M0,18 Q${offsetX * 0.5},${(18 + offsetY) * 0.5} ${offsetX},${offsetY}`}
                                fill="none"
                                stroke="rgba(99, 102, 241, 0.4)"
                                strokeWidth="1.5"
                                strokeDasharray="6 4"
                                strokeLinecap="round"
                            />
                            {/* Small dot at connection point */}
                            <circle cx={offsetX} cy={offsetY} r="2" fill="rgba(99, 102, 241, 0.5)" />
                        </svg>

                        {/* Placeholder Card - horizontal layout */}
                        <div
                            className="absolute bg-[#1a1a1c]/80 border border-white/5 rounded-xl overflow-hidden backdrop-blur-sm animate-pulse flex items-center justify-center"
                            style={{
                                width: w,
                                height: h,
                                left: offsetX - w / 2,
                                top: offsetY
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
};

export default PendingNode;
