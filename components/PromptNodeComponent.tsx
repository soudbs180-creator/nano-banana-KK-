'use client';

import React, { useState, useEffect } from 'react';
import { PromptNode, AspectRatio } from '@/types';
import { Sparkles } from 'lucide-react';

interface PromptNodeProps {
    node: PromptNode;
    onPositionChange: (id: string, newPos: { x: number; y: number }) => void;
    isSelected: boolean;
    onSelect: () => void;
    onClickPrompt?: (node: PromptNode) => void;
    onConnectStart?: (id: string, startPos: { x: number; y: number }) => void;
}

const PromptNodeComponent: React.FC<PromptNodeProps> = ({
    node,
    onPositionChange,
    isSelected,
    onSelect,
    onClickPrompt,
    onConnectStart
}) => {
    // ... existing state ...

    // ... skipping to return ...


    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - node.position.x,
            y: e.clientY - node.position.y
        });
        onSelect();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;
        onPositionChange(node.id, { x: newX, y: newY });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset, node.id, onPositionChange]);

    return (
        <div
            className={`absolute z-20 flex flex-col items-center group ${isSelected ? 'z-30' : ''}`}
            style={{
                left: node.position.x,
                top: node.position.y,
                transform: 'translate(-50%, -100%)', // Anchor at bottom center
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
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
                relative bg-[#18181b] border rounded-2xl p-3 shadow-xl w-[320px] 
                transition-all duration-200
                ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-white/10 hover:border-white/20'}
            `}>
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                        <Sparkles size={12} className="text-white" />
                    </div>
                    <span className="text-xs font-medium text-zinc-400">Prompt</span>
                </div>

                <p className="text-zinc-100 text-sm leading-relaxed line-clamp-4 font-normal">
                    {node.prompt}
                </p>
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

            {/* Visual Guide Line (optional, only when dragging maybe?) */}
        </div>
    );
};

export default PromptNodeComponent;
