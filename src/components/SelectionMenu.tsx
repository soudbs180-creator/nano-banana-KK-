import React, { useState, useRef, useEffect } from 'react';
import { Trash2, Group, Tag, FolderOutput, LayoutGrid, Rows, Columns, GripHorizontal } from 'lucide-react';
import { ArrangeMode } from '../context/CanvasContext';

interface SelectionMenuProps {
    position: { x: number; y: number };
    selectedCount: number;
    // 🚀 详细统计：区分组/图片/视频数量
    groupCount?: number;
    imageCount?: number;
    videoCount?: number;
    onDelete: () => void;
    onGroup: () => void;
    onTag: () => void;
    onMigrate?: () => void; // 🚀 迁移到其他项目
    onArrange?: (mode: ArrangeMode) => void; // 🚀 整理选中项
}

export const SelectionMenu: React.FC<SelectionMenuProps> = ({
    position,
    selectedCount,
    groupCount = 0,
    imageCount = 0,
    videoCount = 0,
    onDelete,
    onGroup,
    onTag,
    onMigrate,
    onArrange
}) => {
    const [showArrangeMenu, setShowArrangeMenu] = useState(false);

    // 🚀 Drag Logic
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const initialOffsetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current) return;
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;
            setDragOffset({
                x: initialOffsetRef.current.x + dx,
                y: initialOffsetRef.current.y + dy
            });
        };
        const handleMouseUp = () => {
            isDraggingRef.current = false;
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Stop bubbling to canvas
        e.stopPropagation();

        // Allow dragging unless clicking a button
        if ((e.target as HTMLElement).closest('button')) return;

        e.preventDefault(); // Prevent text selection
        isDraggingRef.current = true;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        initialOffsetRef.current = dragOffset;
    };

    // 🚀 生成详细标识文本
    const getSelectionLabel = () => {
        const parts: string[] = [];
        if (groupCount > 0) parts.push(`${groupCount}个组`);
        if (imageCount > 0) parts.push(`${imageCount}张图片`);
        if (videoCount > 0) parts.push(`${videoCount}个视频`);

        // 如果有详细统计则显示，否则回退到总数
        if (parts.length > 0) {
            return parts.join(' + ');
        }
        return `${selectedCount} 个项目`;
    };

    return (
        <div
            className="fixed z-[10000] flex items-center bg-zinc-800 border border-white/10 rounded-lg shadow-xl p-1 animate-in zoom-in-95 duration-200 cursor-grab active:cursor-grabbing"
            style={{
                left: position.x + dragOffset.x,
                top: position.y + dragOffset.y,
                transform: 'translate(-50%, -100%) translateY(-12px)'
            }}
            onMouseDown={handleMouseDown}
        >
            <div className="px-3 text-xs text-zinc-400 border-r border-white/10 mr-1 font-medium flex items-center gap-2">
                <GripHorizontal size={14} className="text-zinc-600" />
                {getSelectionLabel()}
            </div>

            <button
                onClick={onGroup}
                className="touch-target hover:bg-white/10 rounded-lg text-indigo-400 hover:text-indigo-300 transition-colors haptic-press"
                title="编组 (Group)"
            >
                <Group size={18} />
            </button>

            <button
                onClick={onTag}
                className="touch-target hover:bg-white/10 rounded-lg text-emerald-400 hover:text-emerald-300 transition-colors haptic-press"
                title="添加标签 (Tag)"
            >
                <Tag size={18} />
            </button>

            {/* 🚀 迁移按钮 */}
            {onMigrate && (
                <button
                    onClick={onMigrate}
                    className="touch-target hover:bg-white/10 rounded-lg text-amber-400 hover:text-amber-300 transition-colors haptic-press"
                    title="迁移到其他项目 (Migrate)"
                >
                    <FolderOutput size={18} />
                </button>
            )}

            {/* 🚀 整理按钮 */}
            {onArrange && (
                <div className="relative">
                    <button
                        onClick={() => setShowArrangeMenu(!showArrangeMenu)}
                        className="touch-target hover:bg-white/10 rounded-lg text-cyan-400 hover:text-cyan-300 transition-colors haptic-press"
                        title="整理选中项 (Arrange)"
                    >
                        <LayoutGrid size={18} />
                    </button>
                    {showArrangeMenu && (
                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-zinc-800 border border-white/10 rounded-lg shadow-xl p-1 flex flex-col gap-1 min-w-[100px]">
                            <button
                                onClick={() => { onArrange('grid'); setShowArrangeMenu(false); }}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 rounded transition-colors whitespace-nowrap"
                            >
                                <LayoutGrid size={14} />
                                宫格(6列)
                            </button>
                            <button
                                onClick={() => { onArrange('row'); setShowArrangeMenu(false); }}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 rounded transition-colors whitespace-nowrap"
                            >
                                <Rows size={14} />
                                横向排列
                            </button>
                            <button
                                onClick={() => { onArrange('column'); setShowArrangeMenu(false); }}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 rounded transition-colors whitespace-nowrap"
                            >
                                <Columns size={14} />
                                纵向排列
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="w-px h-5 bg-white/10 mx-1" />

            <button
                onClick={onDelete}
                className="touch-target hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300 transition-colors haptic-press"
                title="删除选中 (Delete)"
            >
                <Trash2 size={18} />
            </button>
        </div>
    );
};
