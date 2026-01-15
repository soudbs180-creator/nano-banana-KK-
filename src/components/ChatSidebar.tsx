import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatService, ChatMessage } from '../services/chatService';
import { Loader2, Bot } from 'lucide-react';

interface ChatSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    isMobile?: boolean;
}

type ResizeDirection = 'right' | 'bottom' | 'corner' | null;

const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onToggle, isMobile = false }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Desktop: Window position and size (not used on mobile)
    const [position, setPosition] = useState({ x: 16, y: 60 });
    const [size, setSize] = useState({ width: 380, height: 500 });
    const [isDragging, setIsDragging] = useState(false);
    const [resizeDir, setResizeDir] = useState<ResizeDirection>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
    const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
    const isSendingRef = useRef(false);

    const MIN_WIDTH = 300;
    const MAX_WIDTH = 800;
    const MIN_HEIGHT = 300;

    // Load messages on mount
    useEffect(() => {
        const session = chatService.getCurrentSession();
        if (session) {
            setMessages(session.messages);
        }
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle drag and resize (desktop only)
    useEffect(() => {
        if (isMobile) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                const deltaX = e.clientX - dragStartRef.current.x;
                const deltaY = e.clientY - dragStartRef.current.y;
                setPosition({
                    x: Math.max(0, dragStartRef.current.posX + deltaX),
                    y: Math.max(0, dragStartRef.current.posY + deltaY)
                });
            }

            if (resizeDir) {
                const deltaX = e.clientX - resizeStartRef.current.x;
                const deltaY = e.clientY - resizeStartRef.current.y;

                if (resizeDir === 'right' || resizeDir === 'corner') {
                    const newWidth = resizeStartRef.current.width + deltaX;
                    setSize(prev => ({ ...prev, width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)) }));
                }

                if (resizeDir === 'bottom' || resizeDir === 'corner') {
                    const newHeight = resizeStartRef.current.height + deltaY;
                    setSize(prev => ({ ...prev, height: Math.max(MIN_HEIGHT, newHeight) }));
                }
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setResizeDir(null);
        };

        if (isDragging || resizeDir) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = isDragging ? 'move' : resizeDir === 'corner' ? 'nwse-resize' : resizeDir === 'right' ? 'ew-resize' : 'ns-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isDragging, resizeDir, isMobile]);

    const startDrag = (e: React.MouseEvent) => {
        if (isMobile) return;
        e.preventDefault();
        dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
        setIsDragging(true);
    };

    const startResize = (dir: ResizeDirection) => (e: React.MouseEvent) => {
        if (isMobile) return;
        e.preventDefault();
        e.stopPropagation();
        resizeStartRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height };
        setResizeDir(dir);
    };

    const handleSend = useCallback(async () => {
        if (!input.trim() || isLoading || isSendingRef.current) return;
        isSendingRef.current = true;

        const userInput = input.trim();
        setInput('');
        setIsLoading(true);

        const tempUserMsg: ChatMessage = {
            id: `temp_${Date.now()}`,
            role: 'user',
            content: userInput,
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, tempUserMsg]);

        try {
            await chatService.sendMessage(userInput);
            const session = chatService.getCurrentSession();
            if (session) {
                setMessages(session.messages);
            }
        } catch (error: any) {
            setMessages(prev => [
                ...prev.filter(m => m.id !== tempUserMsg.id),
                tempUserMsg,
                {
                    id: `error_${Date.now()}`,
                    role: 'assistant',
                    content: `❌ ${error.message || '发送失败'}`,
                    timestamp: Date.now()
                }
            ]);
        } finally {
            setIsLoading(false);
            isSendingRef.current = false;
        }
    }, [input, isLoading]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleClear = () => {
        chatService.clearCurrentSession();
        setMessages([]);
    };

    const handleNewChat = () => {
        chatService.createNewSession();
        setMessages([]);
    };

    // ==================== MOBILE UI ====================
    if (isMobile) {
        return (
            <>
                {/* Mobile Toggle Button - Bottom Right floating (same style as desktop) */}
                {!isOpen && (
                    <button
                        onClick={onToggle}
                        className="fixed bottom-36 right-4 z-[999] w-[52px] h-[52px] rounded-full flex items-center justify-center active:scale-90 transition-all duration-300 animate-bubble-breathe"
                        style={{
                            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.05) 100%), linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                            backdropFilter: 'blur(20px)',
                            border: '0.5px solid rgba(255, 255, 255, 0.35)',
                            boxShadow: '0 4px 20px rgba(0, 122, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                        }}
                    >
                        <Bot size={24} className="text-white drop-shadow-sm animate-icon-breathe" />
                    </button>
                )}

                {/* Mobile Full Screen Panel - Slides up from bottom */}
                <div
                    className={`fixed inset-0 z-[200] transition-all duration-300 ease-out ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
                        }`}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onToggle} />

                    {/* Panel - Apple Style */}
                    <div className="absolute bottom-0 left-0 right-0 h-[92vh] bg-[#1c1c1e] rounded-t-[2rem] flex flex-col overflow-hidden shadow-2xl">
                        {/* Handle Bar */}
                        <div className="flex justify-center py-3">
                            <div className="w-10 h-1 bg-white/20 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-white font-semibold text-lg">AI 对话</h2>
                                    <p className="text-zinc-500 text-xs">Gemini 2.0 Flash</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleNewChat}
                                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center active:bg-white/10"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                </button>
                                <button
                                    onClick={handleClear}
                                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center active:bg-white/10"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                </button>
                                <button
                                    onClick={onToggle}
                                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center active:bg-white/10"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
                            {messages.length === 0 ? (
                                <div className="text-center py-16 text-zinc-500">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-400">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-base font-medium mb-1">开始对话</p>
                                    <p className="text-sm text-zinc-600">向 AI 提问任何问题</p>
                                </div>
                            ) : (
                                messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                            ? 'bg-[#007AFF] text-white'
                                            : 'bg-[#3a3a3c] text-zinc-200'
                                            }`}>
                                            <p className="text-[15px] whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-[#3a3a3c] rounded-2xl px-4 py-3">
                                        <Loader2 size={20} className="text-zinc-400 animate-spin" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area - Apple iMessage Style */}
                        <div className="px-3 pb-6 pt-2 bg-[#1c1c1e]">
                            <div className="flex gap-2 items-center">
                                {/* Input Field - iMessage Style */}
                                <div className="flex-1 bg-[#3a3a3c] rounded-[22px] border border-white/10 overflow-hidden">
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="信息"
                                        rows={1}
                                        className="w-full bg-transparent text-white text-[17px] placeholder:text-zinc-500 focus:outline-none resize-none px-4 py-[10px]"
                                        style={{ maxHeight: 120, minHeight: 44 }}
                                    />
                                </div>
                                {/* Send Button - Apple Style, aligned with input height */}
                                <button
                                    onClick={handleSend}
                                    disabled={isLoading || !input.trim()}
                                    className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 disabled:opacity-30"
                                    style={{
                                        background: input.trim() ? '#007AFF' : '#3a3a3c',
                                    }}
                                >
                                    {isLoading ? (
                                        <Loader2 size={20} className="text-white animate-spin" />
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            {/* Safe area padding for iPhone */}
                            <div className="h-safe-area-inset-bottom" />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // ==================== DESKTOP UI - Floating Bubble ====================
    const [isHovered, setIsHovered] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Drag state for floating bubble
    const [bubblePosition, setBubblePosition] = useState({ x: 24, y: 24 }); // Distance from right/bottom edges
    const [isBubbleDragging, setIsBubbleDragging] = useState(false);
    const bubbleDragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

    // Handle bubble drag
    useEffect(() => {
        if (!isBubbleDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = bubbleDragStartRef.current.x - e.clientX;
            const deltaY = bubbleDragStartRef.current.y - e.clientY;

            // Mark as dragged if moved more than 5 pixels
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                hasDraggedRef.current = true;
            }

            // Calculate new position (distance from right/bottom edges)
            const newX = Math.max(10, Math.min(window.innerWidth - 70, bubbleDragStartRef.current.posX + deltaX));
            const newY = Math.max(10, Math.min(window.innerHeight - 70, bubbleDragStartRef.current.posY + deltaY));

            setBubblePosition({ x: newX, y: newY });
        };

        const handleMouseUp = () => {
            setIsBubbleDragging(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isBubbleDragging]);

    // Track if actual dragging happened (to distinguish from click)
    const hasDraggedRef = useRef(false);

    const startBubbleDrag = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        bubbleDragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: bubblePosition.x,
            posY: bubblePosition.y
        };
        hasDraggedRef.current = false;
        setIsBubbleDragging(true);
    }, [bubblePosition]);

    // Track if the panel is pinned (opened by click vs hover)
    const [isPinned, setIsPinned] = useState(false);

    const handleBubbleClick = useCallback(() => {
        // Only toggle if it was a click, not a drag
        if (!hasDraggedRef.current) {
            if (isHovered && isPinned) {
                // If already pinned, unpin and close
                setIsPinned(false);
                setIsHovered(false);
            } else {
                // Pin the panel open
                setIsPinned(true);
                setIsHovered(true);
            }
        }
    }, [isHovered, isPinned]);

    // Handle mouse enter/leave with delay
    const handleMouseEnter = useCallback(() => {
        if (isBubbleDragging) return; // Don't show panel while dragging
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setIsHovered(true);
    }, [isBubbleDragging]);

    const handleMouseLeave = useCallback(() => {
        // Don't close if pinned
        if (isPinned) return;
        // Small delay before closing to allow moving to expanded panel
        hoverTimeoutRef.current = setTimeout(() => {
            setIsHovered(false);
        }, 300);
    }, [isPinned]);

    // Auto-open when there's a pending message
    useEffect(() => {
        if (input.trim()) {
            setIsHovered(true);
        }
    }, [input]);

    // Determine expand direction based on bubble position
    const [expandToRight, setExpandToRight] = useState(false);

    // Update expand direction when bubble position changes
    useEffect(() => {
        // If bubble is on the left half of screen, expand to right
        // bubblePosition.x is distance from RIGHT edge, so larger value = more to the left
        const bubbleLeftEdge = window.innerWidth - bubblePosition.x - 54;
        setExpandToRight(bubbleLeftEdge < window.innerWidth / 2);
    }, [bubblePosition.x]);

    return (
        <div
            ref={containerRef}
            className="fixed z-[200]"
            style={{
                right: expandToRight ? 'auto' : bubblePosition.x,
                left: expandToRight ? (window.innerWidth - bubblePosition.x - 54) : 'auto',
                bottom: bubblePosition.y
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Unified Chat Card with Bubble */}
            <div
                className="relative transition-all duration-300 ease-out"
                style={{
                    width: isHovered || isOpen ? 360 : 54,
                    height: isHovered || isOpen ? 480 : 54,
                }}
            >
                {/* Chat Panel - Only visible when expanded */}
                <div
                    className={`absolute flex flex-col overflow-hidden transition-all duration-300 ${isHovered || isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                        }`}
                    style={{
                        width: 360,
                        height: 480,
                        right: expandToRight ? 'auto' : 0,
                        left: expandToRight ? 0 : 'auto',
                        bottom: 0,
                        background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.98) 0%, rgba(8, 12, 21, 0.99) 100%)',
                        backdropFilter: 'blur(40px)',
                        border: '1px solid rgba(56, 189, 248, 0.15)',
                        borderRadius: '24px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px -10px rgba(56, 189, 248, 0.15)'
                    }}
                >
                    {/* Header - Draggable */}
                    <div
                        className="flex items-center justify-between px-4 py-3 flex-shrink-0 cursor-move"
                        onMouseDown={startBubbleDrag}
                        style={{
                            background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.05) 0%, transparent 100%)',
                            borderBottom: '1px solid rgba(56, 189, 248, 0.1)'
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-2xl flex items-center justify-center relative overflow-hidden"
                                style={{
                                    background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 50%, #14b8a6 100%)',
                                    boxShadow: '0 4px 15px rgba(14, 165, 233, 0.4)'
                                }}
                            >
                                {/* Sparkle Icon */}
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
                                </svg>
                                {/* Shimmer */}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full animate-shimmer" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-white">AI 智能助手</h3>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                    <span className="text-[10px] text-slate-400">Gemini 2.0 Flash</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={handleNewChat} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all" title="新对话">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                            </button>
                            <button onClick={handleClear} className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all" title="清空">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-thin">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 relative overflow-hidden"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(20, 184, 166, 0.15) 100%)',
                                        border: '1px solid rgba(56, 189, 248, 0.2)'
                                    }}
                                >
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-cyan-400">
                                        <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
                                    </svg>
                                </div>
                                <h4 className="text-sm font-medium text-slate-200 mb-1">开始智能对话</h4>
                                <p className="text-[11px] text-slate-500 max-w-[180px]">向 AI 助手提问，获取即时帮助</p>
                            </div>
                        ) : (
                            messages.map((msg, index) => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`} style={{ animation: `fadeSlideIn 0.2s ease-out ${index * 0.03}s both` }}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-7 h-7 rounded-xl flex items-center justify-center mr-2 mt-0.5 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                                <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
                                            </svg>
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-slate-200'}`}
                                        style={msg.role === 'user' ? {
                                            background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
                                            boxShadow: '0 4px 15px rgba(14, 165, 233, 0.3)'
                                        } : {
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(56, 189, 248, 0.1)'
                                        }}
                                    >
                                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                                    </div>
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="w-7 h-7 rounded-xl flex items-center justify-center mr-2 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
                                    </svg>
                                </div>
                                <div className="rounded-2xl px-4 py-2.5 flex items-center gap-2" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    <span className="text-[11px] text-slate-400">思考中...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area - Apple iMessage Style (same as mobile) */}
                    <div
                        className="flex items-center gap-2 p-3 flex-shrink-0"
                        style={{ borderTop: '1px solid rgba(56, 189, 248, 0.1)' }}
                    >
                        {/* Input Field - iMessage Style */}
                        <div className="flex-1 bg-[#3a3a3c] rounded-[22px] border border-white/10 overflow-hidden">
                            <input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onFocus={() => setIsPinned(true)}
                                placeholder="信息"
                                className="w-full bg-transparent text-white text-[15px] placeholder:text-zinc-500 focus:outline-none px-4 py-[10px]"
                            />
                        </div>
                        {/* Send Button - Apple Style, aligned with input height */}
                        <button
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                            className="w-[44px] h-[44px] rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 disabled:opacity-30"
                            style={{
                                background: input.trim() ? '#007AFF' : '#3a3a3c',
                            }}
                        >
                            {isLoading ? (
                                <Loader2 size={20} className="text-white animate-spin" />
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>

                {/* Draggable Bubble - Position adapts to expand direction */}
                <button
                    onMouseDown={startBubbleDrag}
                    onClick={handleBubbleClick}
                    className={`absolute transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-center rounded-full ${isBubbleDragging ? 'cursor-grabbing scale-95' : 'cursor-grab'
                        } ${!isHovered && !isOpen && !isBubbleDragging ? 'animate-bubble-breathe' : ''} hover:scale-105 active:scale-95`}
                    style={{
                        width: isHovered || isOpen ? 44 : 52,
                        height: isHovered || isOpen ? 44 : 52,
                        // When expanded to right, bubble stays at left; otherwise at right
                        right: expandToRight
                            ? 'auto'
                            : (isHovered || isOpen ? 8 : 0),
                        left: expandToRight
                            ? (isHovered || isOpen ? 8 : 0)
                            : 'auto',
                        bottom: isHovered || isOpen ? 10 : 0,
                        background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.05) 100%), linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                        backdropFilter: 'blur(20px)',
                        border: '0.5px solid rgba(255, 255, 255, 0.35)',
                        boxShadow: isHovered || isOpen
                            ? '0 2px 10px rgba(0, 122, 255, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                            : undefined // Let CSS animation control shadow
                    }}
                >
                    {/* Robot Icon with breathing animation */}
                    <Bot
                        size={isHovered || isOpen ? 20 : 24}
                        className={`text-white drop-shadow-sm ${!isHovered && !isOpen && !isBubbleDragging ? 'animate-icon-breathe' : ''}`}
                    />

                    {/* Notification indicator */}
                    {messages.length > 0 && !isHovered && !isOpen && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm" />
                    )}
                </button>
            </div>
        </div>
    );
};

export default ChatSidebar;
