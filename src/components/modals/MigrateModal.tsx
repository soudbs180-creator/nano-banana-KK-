import React from 'react';
import { Canvas } from '../../types';
import { X, FolderOutput, Check, Plus } from 'lucide-react';

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
                className="shadow-2xl w-full md:max-w-md overflow-hidden animate-scaleIn
                           md:rounded-xl rounded-t-[24px] max-h-[85vh] md:max-h-[80vh] flex flex-col safe-inset-bottom"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)', borderWidth: '1px' }}
                onClick={e => e.stopPropagation()}
            >
                {/* 🚀 移动端拖动手柄 */}
                <div className="md:hidden flex justify-center py-2">
                    <div className="sheet-handle" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)' }}>
                            <FolderOutput size={20} style={{ color: '#fbbf24' }} />
                        </div>
                        <div>
                            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>迁移到其他项目</h3>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>已选择 {selectedCount} 个项目</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="touch-target rounded-xl transition-colors haptic-press"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 overflow-y-auto smooth-scroll">
                    <div className="space-y-2">
                        {/* 🚀 新建项目选项 - 始终显示在最前面 */}
                        <button
                            onClick={() => onMigrate('__new__')}
                            className="w-full flex items-center justify-between px-4 py-4 border rounded-xl transition-all group haptic-press touch-target"
                            style={{ 
                                background: 'linear-gradient(to right, rgba(16, 185, 129, 0.1), rgba(20, 184, 166, 0.1))',
                                borderColor: 'rgba(16, 185, 129, 0.2)'
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(to bottom right, rgba(16, 185, 129, 0.3), rgba(20, 184, 166, 0.3))' }}>
                                    <Plus size={20} style={{ color: '#34d399' }} />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-medium transition-colors" style={{ color: '#6ee7b7' }}>
                                        新建项目
                                    </p>
                                    <p className="text-xs" style={{ color: 'rgba(16, 185, 129, 0.7)' }}>
                                        创建新项目并迁移到该项目
                                    </p>
                                </div>
                            </div>
                            <Plus size={18} style={{ color: '#34d399', opacity: 0.6 }} className="group-hover:opacity-100 transition-opacity" />
                        </button>

                        {/* 现有项目列表 */}
                        {availableCanvases.length === 0 ? (
                            <div className="text-center py-4 text-gray-500 dark:text-zinc-500">
                                <p className="text-xs">暂无其他项目</p>
                            </div>
                        ) : (
                            <>
                                <div className="text-xs px-1 pt-2" style={{ color: 'var(--text-muted)' }}>现有项目</div>
                                {availableCanvases.map(canvas => (
                                    <button
                                        key={canvas.id}
                                        onClick={() => onMigrate(canvas.id)}
                                        className="w-full flex items-center justify-between px-4 py-4 border rounded-xl transition-colors group haptic-press touch-target"
                                        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-light)' }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'linear-gradient(to bottom right, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))', color: '#818cf8' }}>
                                                {canvas.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-medium transition-colors" style={{ color: 'var(--text-primary)' }}>
                                                    {canvas.name}
                                                </p>
                                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    {canvas.promptNodes.length} 个主卡 · {canvas.imageNodes.length} 个副卡
                                                </p>
                                            </div>
                                        </div>
                                        <Check size={18} style={{ color: '#fbbf24' }} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}>
                    <button
                        onClick={onClose}
                        className="w-full md:w-auto px-6 py-3 text-sm rounded-xl transition-colors touch-target haptic-press"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)';
                            e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                    >
                        取消
                    </button>
                </div>
            </div>
        </div>
    );
};
