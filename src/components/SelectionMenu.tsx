import React from 'react';
import { Trash2, PenTool, Tag, Layers } from 'lucide-react';

interface SelectionMenuProps {
    position: { x: number; y: number };
    selectedCount: number;
    onDelete: () => void;
    onGroup: () => void;
    onTag: () => void;
    // onPaint: () => void; // Maybe later?
}

export const SelectionMenu: React.FC<SelectionMenuProps> = ({
    position,
    selectedCount,
    onDelete,
    onGroup,
    onTag
}) => {
    return (
        <div
            className="fixed z-[10000] flex items-center bg-zinc-800 border border-white/10 rounded-lg shadow-xl p-1 animate-in zoom-in-95 duration-200"
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%) translateY(-12px)'
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent canvas interaction
        >
            <div className="px-2 text-xs text-zinc-400 border-r border-white/10 mr-1 font-medium">
                {selectedCount} 个项目
            </div>

            <button
                onClick={onGroup}
                className="p-2 hover:bg-white/10 rounded text-indigo-400 hover:text-indigo-300 transition-colors tooltip-trigger"
                title="编组 / 画笔 (Group)"
            >
                <PenTool size={16} />
            </button>

            <button
                onClick={onTag}
                className="p-2 hover:bg-white/10 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
                title="添加标签 (Tag)"
            >
                <Tag size={16} />
            </button>

            <div className="w-px h-4 bg-white/10 mx-1" />

            <button
                onClick={onDelete}
                className="p-2 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
                title="删除选中 (Delete)"
            >
                <Trash2 size={16} />
            </button>
        </div>
    );
};
