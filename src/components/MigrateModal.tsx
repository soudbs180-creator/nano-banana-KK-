import React from 'react';
import { Canvas } from '../types';
import { X, FolderOutput, Check } from 'lucide-react';

interface MigrateModalProps {
    isOpen: boolean;
    onClose: () => void;
    canvases: Canvas[];
    currentCanvasId: string;
    selectedCount: number;
    onMigrate: (targetCanvasId: string) => void;
}

export const MigrateModal: React.FC<MigrateModalProps> = ({
    isOpen,
    onClose,
    canvases,
    currentCanvasId,
    selectedCount,
    onMigrate
}) => {
    if (!isOpen) return null;

    const availableCanvases = canvases.filter(c => c.id !== currentCanvasId);

    return (
        <div
            className="fixed inset-0 z-[10001] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
            onClick={onClose}
        >
            <div
                className="bg-zinc-900 border border-white/10 shadow-2xl w-full md:max-w-md overflow-hidden animate-scaleIn
                           md:rounded-xl rounded-t-[24px] max-h-[85vh] md:max-h-[80vh] flex flex-col safe-inset-bottom"
                onClick={e => e.stopPropagation()}
            >
                {/* 🚀 移动端拖动手柄 */}
                <div className="md:hidden flex justify-center py-2">
                    <div className="sheet-handle" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-zinc-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                            <FolderOutput size={20} className="text-amber-400" />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold text-white">迁移到其他项目</h3>
                            <p className="text-xs text-zinc-400">已选择 {selectedCount} 个项目</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="touch-target hover:bg-white/10 rounded-xl text-zinc-400 hover:text-white transition-colors haptic-press"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 overflow-y-auto smooth-scroll">
                    {availableCanvases.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            <p>没有其他项目可供迁移</p>
                            <p className="text-xs mt-1">请先创建新项目</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {availableCanvases.map(canvas => (
                                <button
                                    key={canvas.id}
                                    onClick={() => onMigrate(canvas.id)}
                                    className="w-full flex items-center justify-between px-4 py-4 bg-zinc-800/50 hover:bg-zinc-700/50 active:bg-zinc-600/50 border border-white/5 hover:border-amber-500/30 rounded-xl transition-colors group haptic-press touch-target"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-sm font-bold text-indigo-400">
                                            {canvas.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-white group-hover:text-amber-300 transition-colors">
                                                {canvas.name}
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                {canvas.promptNodes.length} 个主卡 · {canvas.imageNodes.length} 个副卡
                                            </p>
                                        </div>
                                    </div>
                                    <Check size={18} className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-white/10 bg-zinc-800/30">
                    <button
                        onClick={onClose}
                        className="w-full md:w-auto px-6 py-3 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors touch-target haptic-press"
                    >
                        取消
                    </button>
                </div>
            </div>
        </div>
    );
};
