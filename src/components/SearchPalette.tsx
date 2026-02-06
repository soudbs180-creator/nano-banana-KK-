import React, { useState, useEffect, useRef } from 'react';
import { PromptNode, CanvasGroup } from '../types';
import { Search, MapPin, CornerDownLeft, X, Layers, Hash } from 'lucide-react';
import { generateTagColor } from '../utils/colorUtils';

interface SearchPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    promptNodes: PromptNode[];
    groups?: CanvasGroup[];
    onNavigate: (x: number, y: number, id?: string) => void;
    onMultiSelectConfirm?: (ids: string[]) => void;
}

type SearchResultItem =
    | { type: 'node'; data: PromptNode }
    | { type: 'group'; data: CanvasGroup };

const SearchPalette: React.FC<SearchPaletteProps> = ({ isOpen, onClose, promptNodes, groups = [], onNavigate, onMultiSelectConfirm }) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
    const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());

    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const lastClickedIndexRef = useRef<number>(-1); // 🚀 记录上次点击位置用于Shift区间选择

    // Normalize query
    const lowerQuery = query.toLowerCase();

    // Filter results
    // 🚀 Sorting Logic: Tag Match > Recency
    const nodeResults: SearchResultItem[] = (() => {
        const matching = promptNodes.filter(node =>
            node.prompt.toLowerCase().includes(lowerQuery) ||
            (node.tags && node.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
        );

        matching.sort((a, b) => {
            // 1. Tag Match Priority
            const aTagMatch = a.tags && a.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
            const bTagMatch = b.tags && b.tags.some(tag => tag.toLowerCase().includes(lowerQuery));

            if (aTagMatch && !bTagMatch) return -1;
            if (!aTagMatch && bTagMatch) return 1;

            // 2. Recency (Newest First)
            return b.timestamp - a.timestamp;
        });

        return matching.map(n => ({ type: 'node', data: n }));
    })();

    const groupResults: SearchResultItem[] = groups.filter(g =>
        (g.label || 'Group').toLowerCase().includes(lowerQuery)
    ).map(g => ({ type: 'group', data: g }));

    const results = [...groupResults, ...nodeResults].slice(0, 50);

    // Auto-focus input when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setMultiSelectedIds(new Set());
            setIsMultiSelectMode(false);
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
                    if (isMultiSelectMode || e.ctrlKey || e.metaKey || e.shiftKey) {
                        if (e.ctrlKey || e.metaKey) {
                            handleConfirmMultiSelect();
                        } else {
                            if (results[selectedIndex]) {
                                toggleMultiSelect(results[selectedIndex]);
                            }
                        }
                    } else {
                        if (results[selectedIndex]) {
                            handleSelect(results[selectedIndex]);
                        }
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    onClose();
                    break;
                case 'm':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        setIsMultiSelectMode(prev => !prev);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, selectedIndex, isMultiSelectMode, multiSelectedIds]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    const handleSelect = (item: SearchResultItem) => {
        if (item.type === 'node') {
            onNavigate(item.data.position.x, item.data.position.y, item.data.id);
        } else {
            const g = item.data;
            const cx = g.bounds.x + g.bounds.width / 2;
            const cy = g.bounds.y + g.bounds.height / 2;
            onNavigate(cx, cy, g.id);
        }
        onClose();
    };

    const toggleMultiSelect = (item: SearchResultItem) => {
        setMultiSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(item.data.id)) {
                next.delete(item.data.id);
            } else {
                next.add(item.data.id);
            }
            return next;
        });
    };

    const handleConfirmMultiSelect = () => {
        if (multiSelectedIds.size === 0) return;
        onMultiSelectConfirm?.(Array.from(multiSelectedIds));
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm animate-fadeIn">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative w-full max-w-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl shadow-2xl overflow-hidden animate-slideDown flex flex-col max-h-[60vh]">
                {/* Search Header */}
                <div className="flex items-center px-4 border-b border-[var(--border-light)] bg-[var(--bg-tertiary)]">
                    <Search className="text-[var(--text-tertiary)] w-5 h-5 mr-3" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setSelectedIndex(0);
                        }}
                        placeholder={isMultiSelectMode ? "多选模式: 点击选择多个，按 Ctrl+Enter 确认整理" : "搜索提示词、标签或编组..."}
                        className="flex-1 bg-transparent border-none py-4 text-lg focus:outline-none transition-all"
                        style={{
                            color: 'var(--text-primary)',
                            fontSize: '16px',
                            transitionDuration: 'var(--duration-fast)'
                        }}
                        onFocus={(e) => {
                            e.currentTarget.parentElement!.style.boxShadow = 'inset 0 0 0 2px var(--accent-blue)';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.parentElement!.style.boxShadow = 'none';
                        }}
                    />

                    {/* Multi-Select Toggle */}
                    <button
                        onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
                        className={`mr-2 px-2 py-1 rounded text-xs font-medium border transition-colors ${isMultiSelectMode
                            ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50'
                            : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:bg-[var(--toolbar-hover)]'}`}
                        title="多选模式 (Ctrl+M)"
                    >
                        {isMultiSelectMode ? '多选开启' : '多选'}
                    </button>

                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-[var(--toolbar-hover)] rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
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
                        <div className="py-12 text-center text-[var(--text-tertiary)]">
                            {query ? '未找到相关内容' : '输入关键词搜索...'}
                        </div>
                    ) : (
                        results.map((item, index) => {
                            const isFocused = index === selectedIndex;
                            const isSelected = multiSelectedIds.has(item.data.id);
                            const isGroup = item.type === 'group';

                            return (
                                <div
                                    key={item.data.id}
                                    onClick={(e) => {
                                        // 🚀 Implicit Multi-Select Logic
                                        const isModifierHeld = e.shiftKey || e.ctrlKey || e.metaKey;

                                        if (isMultiSelectMode || isModifierHeld) {
                                            if (!isMultiSelectMode) {
                                                setIsMultiSelectMode(true);
                                            }
                                            e.stopPropagation();

                                            // 1. Shift Range Select
                                            if (e.shiftKey && lastClickedIndexRef.current >= 0) {
                                                const start = Math.min(lastClickedIndexRef.current, index);
                                                const end = Math.max(lastClickedIndexRef.current, index);
                                                setMultiSelectedIds(prev => {
                                                    const next = new Set(prev);
                                                    for (let i = start; i <= end; i++) {
                                                        if (results[i]) {
                                                            next.add(results[i].data.id);
                                                        }
                                                    }
                                                    return next;
                                                });
                                            }
                                            // 2. Ctrl Toggle (Add/Remove)
                                            else {
                                                toggleMultiSelect(item);
                                            }
                                            lastClickedIndexRef.current = index;
                                        } else {
                                            // Normal Select
                                            handleSelect(item);
                                        }
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`flex items-start gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${isFocused ? 'bg-[var(--toolbar-hover)]' : ''
                                        } ${isSelected ? 'bg-indigo-500/10 border border-indigo-500/30' : ''}`}
                                >
                                    {isMultiSelectMode && (
                                        <div className={`mt-1.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-[var(--text-tertiary)] bg-transparent'
                                            }`}>
                                            {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-white"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                        </div>
                                    )}

                                    <div className={`mt-1 p-1.5 rounded-md ${isFocused ? 'bg-[var(--bg-tertiary)]' : 'bg-[var(--bg-tertiary)]'} text-[var(--text-secondary)]`}>
                                        {isGroup ? <Layers size={14} /> : <MapPin size={14} />}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <div className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-400' : 'text-[var(--text-primary)]'}`}>
                                            {item.type === 'group' ? (item.data.label || '未命名编组') : item.data.prompt}
                                        </div>

                                        {item.type === 'node' && (
                                            <>
                                                <div className="text-xs text-[var(--text-tertiary)] mt-1 flex items-center gap-2">
                                                    <span>Position: {Math.round(item.data.position.x)}, {Math.round(item.data.position.y)}</span>
                                                    <span className="w-1 h-1 bg-[var(--text-muted)] rounded-full" />
                                                    <span>{new Date(item.data.timestamp).toLocaleTimeString()}</span>
                                                </div>
                                                {item.data.tags && item.data.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                        {item.data.tags.map(tag => {
                                                            const colors = generateTagColor(tag);
                                                            return (
                                                                <span
                                                                    key={tag}
                                                                    className="px-1.5 py-0.5 text-[10px]"
                                                                    style={{
                                                                        backgroundColor: colors.bg,
                                                                        color: colors.text,
                                                                        border: `1px solid ${colors.border}`,
                                                                        borderRadius: 'var(--radius-sm)'
                                                                    }}
                                                                >
                                                                    #{tag}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {isGroup && (
                                            <div className="text-xs text-[var(--text-tertiary)] mt-1">
                                                包含了区域内的节点
                                            </div>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <CornerDownLeft size={16} className="text-[var(--text-tertiary)] mt-1" />
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Footer Tips */}
                <div className="px-4 py-2 border-t border-[var(--border-light)] bg-[var(--bg-tertiary)] flex items-center justify-between text-[10px] text-[var(--text-tertiary)]">
                    <div className="flex gap-4">
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--border-light)] font-sans">↑↓</kbd> 导航
                        </span>
                        {isMultiSelectMode ? (
                            <>
                                <span className="flex items-center gap-1 text-indigo-400 font-medium">
                                    <kbd className="px-1.5 py-0.5 bg-indigo-500/20 rounded border border-indigo-500/30 font-sans text-indigo-400">Shift+点击</kbd> 区间选择
                                </span>
                                <span className="flex items-center gap-1 text-indigo-400 font-medium">
                                    <kbd className="px-1.5 py-0.5 bg-indigo-500/20 rounded border border-indigo-500/30 font-sans text-indigo-400">Ctrl+Enter</kbd> 确认整理 ({multiSelectedIds.size})
                                </span>
                            </>
                        ) : (
                            <span className="flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--border-light)] font-sans">Enter</kbd> 定位
                            </span>
                        )}
                        <span className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 bg-[var(--bg-primary)] rounded border border-[var(--border-light)] font-sans">Ctrl+M</kbd> 切换多选
                        </span>
                    </div>
                    <span>{results.length} 个结果</span>
                </div>
            </div>

            {/* Multi-Select Floating Confirmation */}
            {isMultiSelectMode && multiSelectedIds.size > 0 && (
                <div className="absolute bottom-20 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2 animate-bounce-in cursor-pointer hover:bg-indigo-500" onClick={handleConfirmMultiSelect}>
                    <span>已选择 {multiSelectedIds.size} 项，点击整理</span>
                    <CornerDownLeft size={14} />
                </div>
            )}
        </div>
    );
};

export default SearchPalette;
