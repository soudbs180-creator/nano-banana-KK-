import React, { useRef, useState, useEffect } from 'react';
import { CanvasGroup } from '../types';
import { X, GripHorizontal } from 'lucide-react';

interface CanvasGroupProps {
    group: CanvasGroup;
    zoom: number;
    onUngroup: (id: string) => void;
    onDragStart: (id: string, e: React.MouseEvent) => void;
    highlighted?: boolean;
}

export const CanvasGroupComponent: React.FC<CanvasGroupProps> = ({
    group,
    zoom,
    onUngroup,
    onDragStart,
    highlighted
}) => {
    return (
        <div
            className={`absolute border-2 rounded-xl transition-all duration-300 group-container ${highlighted ? 'border-indigo-400 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.3)] z-10' : 'border-dashed border-indigo-500/50 bg-indigo-500/5 hover:border-indigo-400 hover:bg-indigo-500/10'
                }`}
            style={{
                left: group.bounds.x,
                top: group.bounds.y,
                width: group.bounds.width,
                height: group.bounds.height,
                zIndex: 5 // Below cards (z-10/20) but above lines
            }}
        >
            {/* Header / Drag Handle */}
            <div
                className="absolute -top-8 left-0 flex items-center gap-2 bg-indigo-500/20 backdrop-blur px-2 py-1 rounded-t-lg border-t border-l border-r border-indigo-500/30 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                onMouseDown={(e) => onDragStart(group.id, e)}
            >
                <GripHorizontal size={14} className="text-indigo-300" />
                <span className="text-xs text-indigo-200 font-medium">Group</span>
            </div>

            {/* Ungroup Button */}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onUngroup(group.id);
                }}
                className="absolute -top-8 right-0 p-1 bg-red-500/20 hover:bg-red-500 rounded-full text-red-300 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                title="Ungroup (Keep content)"
            >
                <X size={14} />
            </button>
        </div>
    );
};
