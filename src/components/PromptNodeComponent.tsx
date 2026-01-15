import React, { useState, useEffect, useRef } from 'react';
import { PromptNode, AspectRatio } from '../types';
import { Sparkles } from 'lucide-react';

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
    sourcePosition
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
                relative bg-[#18181b] border rounded-2xl p-3 shadow-xl w-[320px] flex flex-col
                ${isDragging ? '' : 'transition-all duration-200'}
                ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-white/10 hover:border-white/20'}
            `}>
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                        <Sparkles size={12} className="text-white" />
                    </div>
                    <span className="text-xs font-medium text-zinc-400">Prompt</span>
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
                {/* Generating Loading State */}
                {node.isGenerating && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] rounded-2xl flex flex-col items-center justify-center z-50">
                        <div className="flex items-center gap-2 text-indigo-400">
                            {/* Loader icon */}
                            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-xs font-medium">Coming soon...</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Connection Dot - Bottom Center */}
            {/* Connection Dot - Bottom Center */}
            <div
                className="w-3 h-3 bg-indigo-500 rounded-full border-2 border-[#121212] shadow-sm mt-3 relative z-10 transition-transform group-hover:scale-125 cursor-crosshair hover:bg-indigo-400"
                onMouseDown={(e) => {
                    e.stopPropagation();
                    // Pass center X position (card left + half width)
                    onConnectStart?.(node.id, { x: node.position.x + 160, y: node.position.y + 12 });
                }}
            />

            {/* Connection Line to Source */}
            {sourcePosition && (
                <svg
                    className="absolute pointer-events-none"
                    style={{
                        overflow: 'visible',
                        left: '50%',
                        top: 0, // This is at 'top' of the container (which is card bottom due to flow?)
                        // Wait, container is absolute at node.position (Bottom).
                        // So 0,0 is Bottom-Center.
                        // We want line from Source Bottom to Card Top.
                        // Card Top is roughly -140px (depending on height).
                        // Let's use negative Y for local point.
                        zIndex: -1
                    }}
                >
                    <path
                        // sourcePosition is Absolute Top of Source.
                        // node.position is Absolute Bottom of This.
                        // Source Bottom ~ sourcePosition.y + 300.
                        // This Top ~ node.position.y - CardHeight (~150).
                        // Delta X = sourcePosition.x - node.position.x
                        // Delta Y = (sourcePosition.y + 320) - node.position.y
                        // Draw from (DeltaX, DeltaY) to (0, -150)
                        d={`M${sourcePosition.x - node.position.x},${sourcePosition.y - node.position.y + 320} L0,${-140}`}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        className="animate-pulse"
                    />
                    {/* Dot at Start */}
                    <circle
                        cx={sourcePosition.x - node.position.x}
                        cy={sourcePosition.y - node.position.y + 320}
                        r="3"
                        fill="#6366f1"
                    />
                </svg>
            )}

            {/* Visual Guide Line (optional, only when dragging maybe?) */}
        </div>
    );
};

export default PromptNodeComponent;
