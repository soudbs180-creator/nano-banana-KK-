import React, { useState, useEffect } from 'react';
import { Tag, X, Plus } from 'lucide-react';

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001] backdrop-blur-sm">
            <div className="bg-zinc-900 border border-white/10 rounded-xl w-[400px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-800/50">
                    <h3 className="text-sm font-medium text-white flex items-center gap-2">
                        <Tag size={16} className="text-emerald-400" />
                        编辑标签 (Edit Tags)
                    </h3>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Tag List */}
                    <div className="flex flex-wrap gap-2 min-h-[40px]">
                        {tags.map(tag => (
                            <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">
                                {tag}
                                <button onClick={() => removeTag(tag)} className="hover:text-emerald-300">
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
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
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!input.trim()}
                            className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg px-3 disabled:opacity-50 transition-colors border border-white/5"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-4 border-t border-white/10 bg-zinc-800/30 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all font-medium"
                    >
                        保存标签
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TagInputModal;
