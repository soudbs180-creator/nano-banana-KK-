import React from 'react';
import { Trash2, Group, Tag, Layers, FolderOutput } from 'lucide-react';

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
    onMigrate
}) => {
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
            className="fixed z-[10000] flex items-center bg-zinc-800 border border-white/10 rounded-lg shadow-xl p-1 animate-in zoom-in-95 duration-200"
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%) translateY(-12px)'
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent canvas interaction
        >
            <div className="px-3 text-xs text-zinc-400 border-r border-white/10 mr-1 font-medium">
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
