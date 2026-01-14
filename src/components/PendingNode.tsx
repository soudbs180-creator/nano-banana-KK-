import React, { useState, useEffect } from 'react';
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
}

const PendingNode: React.FC<PendingNodeProps> = ({
    prompt,
    parallelCount,
    isGenerating,
    position,
    aspectRatio,
    onPositionChange,
    isMobile = false
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

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isMobile) return; // Disable dragging on mobile (allow canvas panning)

        e.stopPropagation();
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    // MUST be called unconditionally - moved before any conditional returns
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;
            onPositionChange?.({ x: newX, y: newY });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset, onPositionChange]);

    // Conditional rendering AFTER all hooks
    if (!prompt) return null;

    // 如果只是在输入中，显示一个跟随的输入气泡
    if (!isGenerating) {
        return (
            <div
                className="absolute z-50 transition-all duration-300"
                style={{
                    left: position.x,
                    top: position.y,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'grab'
                }}
                onMouseDown={handleMouseDown}
            >
                <div className="glass-strong px-6 py-4 rounded-[24px] border border-white/10 shadow-2xl max-w-[400px] min-w-[200px] animate-scaleIn">
                    <p className="text-zinc-200 text-sm font-medium leading-relaxed break-words line-clamp-3">
                        {prompt}
                        <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-500 animate-pulse align-middle rounded-full" />
                    </p>
                </div>
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
                    // Desktop: Horizontal
                    const totalWidth = parallelCount * w + (parallelCount - 1) * gap;
                    const startX = -totalWidth / 2 + w / 2;
                    offsetX = startX + i * (w + gap);
                    offsetY = 50; // Fixed distance below prompt
                }

                return (
                    <React.Fragment key={i}>
                        {/* Curved connection line from prompt to placeholder */}
                        <svg
                            className="absolute overflow-visible pointer-events-none"
                            style={{ top: 0, left: 0 }}
                        >
                            <path
                                d={`M0,0 Q${offsetX * 0.5},${offsetY * 0.7} ${offsetX},${offsetY}`}
                                fill="none"
                                stroke="rgba(129, 140, 248, 0.4)"
                                strokeWidth="2"
                                strokeDasharray="8 6"
                                strokeLinecap="round"
                            />
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
