import React, { useState, useEffect, useRef } from 'react';
import { PromptNode } from '../types';
import { Search, MapPin, CornerDownLeft, X } from 'lucide-react';

interface SearchPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    promptNodes: PromptNode[];
    onNavigate: (x: number, y: number) => void;
}

const SearchPalette: React.FC<SearchPaletteProps> = ({ isOpen, onClose, promptNodes, onNavigate }) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Filter results
    const results = promptNodes.filter(node =>
        node.prompt.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 50); // Limit to 50 results

    // Auto-focus input when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setSelectedIndex(prev => (prev + 1) % results.length);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (results[selectedIndex]) {
                        handleSelect(results[selectedIndex]);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    onClose();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, selectedIndex]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    const handleSelect = (node: PromptNode) => {
        onNavigate(node.position.x, node.position.y);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm animate-fadeIn">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-xl shadow-2xl overflow-hidden animate-slideDown flex flex-col max-h-[60vh]">
                {/* Search Header */}
                <div className="flex items-center px-4 border-b border-white/5 bg-white/[0.02]">
                    <Search className="text-zinc-500 w-5 h-5 mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                        placeholder="搜索提示词卡片..."
                        className="flex-1 bg-transparent border-none py-4 text-white placeholder-zinc-500 focus:outline-none text-lg"
                    />
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded-md text-zinc-500 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Results List */}
                <div
                    ref={listRef}
                    className="overflow-y-auto custom-scrollbar flex-1 p-2"
                >
                    {results.length === 0 ? (
                        <div className="py-12 text-center text-zinc-500">
                            {query ? '未找到相关卡片' : '输入关键词搜索...'}
                        </div>
                    ) : (
                        results.map((node, index) => (
                            <div
                                key={node.id}
                                onClick={() => handleSelect(node)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                className={`flex items-start gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${index === selectedIndex ? 'bg-indigo-500/10' : 'hover:bg-white/5'
                                    }`}
                            >
                                <div className={`mt-1 p-1.5 rounded-md ${index === selectedIndex ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-zinc-500'
                                    }`}>
                                    <MapPin size={14} />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <div className={`text-sm font-medium truncate ${index === selectedIndex ? 'text-indigo-300' : 'text-zinc-300'
                                        }`}>
                                        {node.prompt}
                                    </div>
                                    <div className="text-xs text-zinc-600 mt-1 flex items-center gap-2">
                                        <span>Postion: {Math.round(node.position.x)}, {Math.round(node.position.y)}</span>
                                        <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                                        <span>{new Date(node.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                                {index === selectedIndex && (
                                    <CornerDownLeft size={16} className="text-zinc-500 mt-1" />
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer Tips */}
                <div className="px-4 py-2 border-t border-white/5 bg-white/[0.02] flex items-center justify-between text-[10px] text-zinc-600">
                    <div className="flex gap-4">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 font-sans">↑↓</kbd> 导航
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 font-sans">Enter</kbd> 定位
                        </span>
                    </div>
                    <span>{results.length} 个结果</span>
                </div>
            </div>
        </div>
    );
};

export default SearchPalette;
