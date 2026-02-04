import React, { useState, useEffect } from 'react';
import { Tag, X, Plus } from 'lucide-react';
import { generateTagColor } from '../utils/colorUtils';

interface TagInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTags?: string[];
    onSave: (tags: string[]) => void;
}

const TagInputModal: React.FC<TagInputModalProps> = ({ isOpen, onClose, initialTags = [], onSave }) => {
    const [tags, setTags] = useState<string[]>([]);
    const [input, setInput] = useState('');

    useEffect(() => {
        if (isOpen) {
            setTags(initialTags);
            setInput('');
        }
    }, [isOpen, initialTags]);

    if (!isOpen) return null;

    const handleAdd = () => {
        const trimmed = input.trim();
        if (trimmed && !tags.includes(trimmed)) {
            setTags([...tags, trimmed]);
            setInput('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        }
    };

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleSave = () => {
        onSave(tags);
        onClose();
    };

    return (
        <div
            className="fixed inset-0 flex items-end md:items-center justify-center z-[10001] backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={onClose}
        >
            <div
                className="w-full md:w-[400px] shadow-2xl overflow-hidden animate-modal-in md:rounded-xl rounded-t-[24px] max-h-[85vh] md:max-h-[80vh] flex flex-col safe-inset-bottom"
                style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    boxShadow: 'var(--shadow-xl)'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* 🚀 移动端拖动手柄 */}
                <div className="md:hidden flex justify-center py-2">
                    <div className="sheet-handle" />
                </div>
                <div
                    className="flex items-center justify-between p-4 border-b"
                    style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-default)'
                    }}
                >
                    <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                        <Tag size={16} style={{ color: 'var(--accent-green)' }} />
                        编辑标签 (Edit Tags)
                    </h3>
                    <button
                        onClick={onClose}
                        className="transition-all active:scale-95"
                        style={{
                            color: 'var(--text-tertiary)',
                            borderRadius: 'var(--radius-sm)',
                            transitionDuration: 'var(--duration-fast)'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Tag List */}
                    <div className="flex flex-wrap gap-2 min-h-[40px]">


                        {tags.map(tag => {
                            const colors = generateTagColor(tag);
                            return (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs"
                                    style={{
                                        backgroundColor: colors.bg,
                                        color: colors.text,
                                        border: `1px solid ${colors.border}`,
                                        borderRadius: 'var(--radius-full)' // 圆形胶囊
                                    }}
                                >
                                    #{tag}
                                    <button
                                        onClick={() => removeTag(tag)}
                                        className="transition-opacity active:scale-90"
                                        style={{ opacity: 0.8 }}
                                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
                                    >
                                        <X size={12} />
                                    </button>
                                </span>
                            );
                        })}
                        {tags.length === 0 && (
                            <span className="text-zinc-500 text-sm italic">暂无标签 (No tags)</span>
                        )}
                    </div>

                    {/* Input */}
                    <div className="flex gap-2">
                        <input
                            autoFocus
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="输入标签并回车..."
                            className="flex-1 px-3 py-2 text-sm transition-all"
                            style={{
                                backgroundColor: 'var(--bg-input)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                fontSize: '16px', // 移动端防止缩放
                                transitionDuration: 'var(--duration-fast)'
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent-blue)';
                                e.currentTarget.style.boxShadow = 'var(--glow-blue)';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-default)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!input.trim()}
                            className="px-3 transition-all active:scale-95"
                            style={{
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-subtle)',
                                opacity: !input.trim() ? 0.5 : 1,
                                cursor: !input.trim() ? 'not-allowed' : 'pointer',
                                transitionDuration: 'var(--duration-fast)'
                            }}
                            onMouseEnter={(e) => {
                                if (input.trim()) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                            }}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                <div
                    className="p-4 border-t flex justify-end gap-2"
                    style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-default)'
                    }}
                >
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm transition-all active:scale-95"
                        style={{
                            color: 'var(--text-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            transitionDuration: 'var(--duration-fast)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--text-primary)';
                            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-tertiary)';
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 text-sm font-medium transition-all active:scale-95"
                        style={{
                            backgroundColor: 'var(--accent-blue)',
                            color: 'white',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                            transitionDuration: 'var(--duration-fast)'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
                        onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
                    >
                        保存标签
                    </button>
                </div>
            </div>
        </div >
    );
};

export default TagInputModal;
