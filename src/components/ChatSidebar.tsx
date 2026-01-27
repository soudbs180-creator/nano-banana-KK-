import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, Bot, User, X, Trash2, ChevronDown, GripVertical } from 'lucide-react';
import { generateText } from '../services/geminiService';
import { notify } from '../services/notificationService';
import { keyManager } from '../services/keyManager';

interface ChatSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    onClose?: () => void;
    isMobile: boolean;
    onOpenSettings?: (view?: 'api-management') => void;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface ChatModel {
    id: string;
    name: string;
    provider: string;
    isCustom: boolean;
    type?: 'chat' | 'image' | 'video';
    icon?: string;
    displayName?: string; // Optional override
    description?: string;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onToggle, onClose, isMobile, onOpenSettings }) => {
    // 1. Model State Management
    const [availableModels, setAvailableModels] = useState<ChatModel[]>(() => keyManager.getGlobalModelList().filter(model => model.type === 'chat'));
    const [selectedModel, setSelectedModel] = useState<ChatModel>(() => availableModels[0] || { id: 'gemini-flash-latest', name: 'Gemini Flash', provider: 'Google', isCustom: false });
    const [showModelMenu, setShowModelMenu] = useState(false);



    // Subscribe to keyManager updates
    useEffect(() => {
        const updateModels = () => {
            const models = keyManager.getGlobalModelList().filter(model => model.type === 'chat');
            setAvailableModels(models);

            // Validate current selection
            if (models.length > 0) {
                // Check if current selected model still exists
                const exists = models.find(m => m.id === selectedModel.id);
                if (!exists) {
                    setSelectedModel(models[0]);
                } else {
                    // Update metadata if changed
                    if (exists.name !== selectedModel.name || exists.description !== selectedModel.description) {
                        setSelectedModel(exists);
                    }
                }
            }
        };

        const unsubscribe = keyManager.subscribe(updateModels);
        return unsubscribe;
    }, [selectedModel.id]);


    // 2. Chat State
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: '你好！我是 KK Studio 数字助手。\n有什么我可以帮您？',
            timestamp: Date.now()
        }
    ]);
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);

    // 3. Layout State
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

    // Track keyboard visibility using visualViewport API
    useEffect(() => {
        if (!isMobile) return;

        const handleViewportResize = () => {
            const vv = window.visualViewport;
            if (vv) {
                const heightDiff = window.innerHeight - vv.height;
                setKeyboardHeight(heightDiff > 100 ? heightDiff : 0);
                setViewportHeight(vv.height);
            }
        };

        window.visualViewport?.addEventListener('resize', handleViewportResize);
        window.visualViewport?.addEventListener('scroll', handleViewportResize);

        return () => {
            window.visualViewport?.removeEventListener('resize', handleViewportResize);
            window.visualViewport?.removeEventListener('scroll', handleViewportResize);
        };
    }, [isMobile]);

    const [isHovering, setIsHovering] = useState(false);
    const lastActivityRef = useRef<number>(Date.now());
    const autoCloseTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

    const clearAutoClose = useCallback(() => {
        if (autoCloseTimerRef.current) {
            clearTimeout(autoCloseTimerRef.current);
            autoCloseTimerRef.current = null;
        }
    }, []);

    const closeChat = useCallback(() => {
        if (onClose) {
            onClose();
        } else {
            onToggle();
        }
    }, [onClose, onToggle]);

    const scheduleAutoClose = useCallback(() => {
        clearAutoClose();
        if (!isOpen || isHovering || isDragging) return;
        const elapsed = Date.now() - lastActivityRef.current;
        const delay = Math.max(20000 - elapsed, 0);
        autoCloseTimerRef.current = window.setTimeout(() => {
            if (!isHovering && isOpen) closeChat();
        }, delay);
    }, [clearAutoClose, closeChat, isDragging, isHovering, isOpen]);

    const registerActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        scheduleAutoClose();
    }, [scheduleAutoClose]);

    useEffect(() => {
        if (!isOpen) {
            clearAutoClose();
            return;
        }
        lastActivityRef.current = Date.now();
        scheduleAutoClose();
        return clearAutoClose;
    }, [isOpen, scheduleAutoClose, clearAutoClose]);

    // Cleanup timer on unmount or when closed
    useEffect(() => {
        return () => {
            if (autoCloseTimerRef.current) {
                clearTimeout(autoCloseTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isOpen && autoCloseTimerRef.current) {
            clearTimeout(autoCloseTimerRef.current);
            autoCloseTimerRef.current = null;
        }
    }, [isOpen]);

    // Draggable Position State (Default Left-Bottom)
    const [position, setPosition] = useState(() => {
        try {
            const saved = localStorage.getItem('kk_chat_pos');
            if (saved) return JSON.parse(saved);
        } catch (e) { }

        if (isMobile) {
            return { x: 20, y: (window.innerHeight - 180) };
        }
        return { x: 20, y: 20 };
    });

    useEffect(() => {
        localStorage.setItem('kk_chat_pos', JSON.stringify(position));
    }, [position]);


    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const startPosRef = useRef({ x: 0, y: 0 });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    // Cleanup drag listeners
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;

            setPosition({
                x: Math.max(0, startPosRef.current.x + dx),
                y: Math.max(0, startPosRef.current.y - dy)
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const startDrag = (e: React.MouseEvent) => {
        if (isOpen) return;
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        startPosRef.current = { ...position };
    };

    const handleSend = async () => {
        if (!input.trim() || isThinking) return;

        const userText = input.trim();
        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText, timestamp: Date.now() };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsThinking(true);
        handleMouseEnter();

        try {
            // Build history for context
            const history = messages
                .filter(m => m.id !== 'welcome')
                .map(m => ({ role: m.role, content: m.content }));

            history.push({ role: 'user', content: userText });

            // Call API with selected model ID
            const responseText = await generateText(history, selectedModel.id);

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: responseText,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, aiMsg]);

            // Record Cost (Estimation) in background
            import('../services/costService').then(({ recordCost }) => {
                const fullText = history.map(m => m.content).join('') + userText + responseText;
                recordCost(
                    selectedModel.id as any,
                    '1K' as any,
                    0,
                    fullText
                );
            });

        } catch (error: any) {
            console.error('Chat Error:', error);
            notify.error('AI 生成失败', error.message || '请检查网络或 API Key');

            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `⚠️ 出错了: ${error.message}`,
                timestamp: Date.now()
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    const handleClear = () => {
        if (confirm('确定要清空对话历史吗?')) {
            setMessages([{ id: Date.now().toString(), role: 'assistant', content: '对话已重置。', timestamp: Date.now() }]);
        }
    };

    const getTransformOrigin = () => {
        const x = position.x < window.innerWidth / 2 ? 'left' : 'right';
        const y = position.y < window.innerHeight / 2 ? 'bottom' : 'bottom';
        return `${x} ${y}`;
    };

    return (
        <>
            {/* 1. Draggable Floating Trigger (Purple Breathing) - Desktop Only */}
            {!isMobile && (
                <div
                    className={`fixed z-[90] transition-all duration-300 ease-in-out ${isOpen ? 'opacity-0 scale-50 pointer-events-none' : 'opacity-100 scale-100'}`}
                    style={{ left: position.x, bottom: position.y }}
                >
                    <div
                        onMouseDown={startDrag}
                        className={`group relative w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center text-white shadow-2xl animate-float-breathe cursor-move active:scale-95 transition-transform hover:brightness-110 ${isDragging ? 'cursor-grabbing scale-95' : ''}`}
                        title="Open AI Assistant (Drag to move)"
                    >
                        <Bot size={24} className="animate-icon-breathe drop-shadow-md pointer-events-none" />
                        <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#09090b] shadow-lg animate-pulse pointer-events-none" />
                        <div
                            className="absolute inset-0 rounded-full"
                            onClick={(e) => {
                                if (!isDragging) {
                                    e.stopPropagation();
                                    onToggle();
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* 2. Chat Card Popover (Morph Transformation) */}
            {isOpen && (
                <div
                    onMouseEnter={handleMouseEnter}
                    className={`fixed z-[100] flex flex-col bg-[var(--bg-secondary)] backdrop-blur-2xl border border-[var(--border-light)] shadow-[var(--shadow-lg)] animate-scale-up-corner overflow-hidden ring-1 ring-[var(--border-light)] ${isMobile
                        ? 'inset-0 rounded-none pb-0'
                        : 'w-[380px] h-[600px] max-h-[80vh] rounded-3xl origin-bottom-left'
                        }`}
                    style={isMobile ? {
                        height: keyboardHeight > 0 ? `${viewportHeight}px` : '100dvh',
                        transition: 'height 0.2s ease-out'
                    } : {
                        left: Math.min(window.innerWidth - 390, Math.max(20, position.x)),
                        bottom: Math.max(20, position.y),
                        transformOrigin: getTransformOrigin()
                    }}
                >

                    {/* Header */}
                    <div className="h-14 border-b border-[var(--border-light)] flex items-center justify-between px-4 bg-[var(--bg-tertiary)] shrink-0">
                        {/* Model Selector - NOW UNIFIED */}
                        <div className="relative flex items-center gap-2">

                            {/* Model Button */}
                            <button
                                onClick={() => {
                                    if (availableModels.length === 0) {
                                        onOpenSettings?.('api-management');
                                    } else {
                                        setShowModelMenu(!showModelMenu);
                                    }
                                }}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors text-xs font-medium group ${availableModels.length === 0
                                    ? 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-500'
                                    : 'bg-[var(--bg-tertiary)] hover:bg-[var(--toolbar-hover)] border-[var(--border-light)] text-[var(--text-primary)]'
                                    }`}
                            >
                                {availableModels.length === 0 ? (
                                    <>
                                        <span className="text-base">⚙️</span>
                                        <span className="underline underline-offset-2">请配置模型</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-base">{selectedModel.icon || '🤖'}</span>
                                        <span>{selectedModel.name || selectedModel.id}</span>
                                        <ChevronDown size={12} className={`text-[var(--text-tertiary)] transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
                                    </>
                                )}
                            </button>

                            {/* Dropdown */}
                            {showModelMenu && (
                                <>
                                    <div className="fixed inset-0 z-10 bg-black/20 backdrop-blur-sm" onClick={() => setShowModelMenu(false)} />
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl shadow-2xl z-20 p-1.5 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-[var(--border-light)] max-h-[300px] overflow-y-auto scrollbar-thin">
                                        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold border-b border-[var(--border-light)] mb-1 select-none">Select Model</div>
                                        {availableModels.map(model => {
                                            const displayName = model.name || model.id;
                                            const advantage = model.description || (model.provider ? `${model.provider} 模型` : '自定义模型');
                                            return (
                                                <button
                                                    key={model.id}
                                                    onClick={() => { setSelectedModel(model); setShowModelMenu(false); }}
                                                    className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-all ${selectedModel.id === model.id ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20 shadow-inner' : 'text-[var(--text-secondary)] hover:bg-[var(--toolbar-hover)] hover:text-[var(--text-primary)] border border-transparent'
                                                        }`}
                                                >
                                                    <span className="mt-0.5 text-base">{model.icon || '🤖'}</span>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className={`font-medium ${selectedModel.id === model.id ? 'text-blue-600' : 'text-[var(--text-primary)]'}`}>{displayName}</span>
                                                        <span className="text-[10px] opacity-70 leading-tight break-all">ID: {model.id}</span>
                                                        <span className="text-[10px] opacity-70 leading-tight">{advantage}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                            <button onClick={handleClear} className="p-1.5 text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                            <button onClick={onToggle} className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)] rounded-lg transition-colors"><X size={18} /></button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} group`}>
                                {/* Avatar */}
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'user'
                                    ? 'bg-[var(--bg-tertiary)] border border-[var(--border-light)]'
                                    : 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white'
                                    }`}>
                                    {msg.role === 'user' ? <User size={14} className="text-[var(--text-tertiary)]" /> : <Bot size={16} className="animate-icon-breathe" />}
                                </div>

                                {/* Content */}
                                <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-tr-sm border border-[var(--border-light)]'
                                    : 'bg-blue-500/10 text-[var(--text-primary)] border border-blue-500/20 rounded-tl-sm backdrop-blur-sm'
                                    }`}>
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                </div>
                            </div>
                        ))}

                        {isThinking && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shrink-0">
                                    <Bot size={16} className="animate-pulse" />
                                </div>
                                <div className="flex items-center gap-1 p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl rounded-tl-sm h-10">
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input - Floating Capsule */}
                    <div className="px-4 pb-2 pt-2 bg-transparent shrink-0 pointer-events-none">
                        <div className="relative group/input max-w-[95%] mx-auto pointer-events-auto">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/30 to-cyan-400/30 rounded-[32px] blur opacity-0 group-hover/input:opacity-100 transition-opacity duration-500" />
                            <div className="relative flex items-end gap-2 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-[32px] p-2 shadow-2xl focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
                                <textarea
                                    className="flex-1 bg-transparent text-[var(--text-primary)] text-base px-4 py-2.5 outline-none resize-none scrollbar-hide max-h-32 placeholder:text-[var(--text-tertiary)]"
                                    placeholder={`Message ${selectedModel?.name?.split(' ')[0] || 'AI'}...`}
                                    rows={1}
                                    value={input}
                                    onChange={e => {
                                        setInput(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isThinking}
                                    className="p-2.5 bg-gradient-to-tr from-blue-500 to-cyan-400 text-white rounded-full hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ChatSidebar;
