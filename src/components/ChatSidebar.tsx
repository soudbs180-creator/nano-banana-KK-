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
                {/* Mobile Toggle Button - Bottom Right floating */}
                {!isOpen && (
                    <button
                        onClick={onToggle}
                        className="fixed bottom-36 right-4 z-[999] w-12 h-12 bg-[#1c1c1e] border border-white/10 rounded-full shadow-2xl flex items-center justify-center active:scale-90 transition-all duration-300"
                        style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)' }}
                    >
                        <Bot size={24} className="text-white" />
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
                    <div className="absolute bottom-0 left-0 right-0 h-[85vh] bg-[#1c1c1e] rounded-t-[2rem] flex flex-col overflow-hidden shadow-2xl">
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
                                            ? 'bg-indigo-500 text-white'
                                            : 'bg-[#2c2c2e] text-zinc-200'
                                            }`}>
                                            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-[#2c2c2e] rounded-2xl px-4 py-3">
                                        <Loader2 size={20} className="text-indigo-400 animate-spin" />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area - Fixed at bottom */}
                        <div className="p-4 bg-[#1c1c1e] border-t border-white/5">
                            <div className="flex gap-3 items-end">
                                <div className="flex-1 bg-[#2c2c2e] rounded-2xl px-4 py-3">
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="输入消息..."
                                        rows={1}
                                        className="w-full bg-transparent text-white text-base placeholder:text-zinc-500 focus:outline-none resize-none"
                                        style={{ maxHeight: 120 }}
                                    />
                                </div>
                                <button
                                    onClick={handleSend}
                                    disabled={isLoading || !input.trim()}
                                    className="w-12 h-12 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 rounded-full flex items-center justify-center transition-all active:scale-95"
                                >
                                    {isLoading ? (
                                        <Loader2 size={20} className="text-white animate-spin" />
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
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

    // ==================== DESKTOP UI (unchanged) ====================
    return (
        <>
            {/* Desktop Toggle Button */}
            {!isOpen && (
                <button
                    onClick={onToggle}
                    className="fixed top-1/2 left-0 -translate-y-1/2 z-[200] w-8 h-20 bg-[#1a1a1c] hover:bg-indigo-500 border border-white/10 hover:border-indigo-500 rounded-r-xl flex items-center justify-center transition-all shadow-xl"
                    title="展开对话"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            )}

            {/* Desktop Floating Draggable Window */}
            {isOpen && (
                <div
                    className="fixed z-[200] bg-[#0d0d0f]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                    style={{
                        left: position.x,
                        top: position.y,
                        width: size.width,
                        height: size.height
                    }}
                >
                    {/* Header - Draggable */}
                    <div
                        className="flex items-center justify-between p-3 border-b border-white/5 cursor-move select-none bg-white/2"
                        onMouseDown={startDrag}
                    >
                        <div className="flex items-center gap-2 pointer-events-none">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            </div>
                            <div>
                                <span className="font-semibold text-white text-sm">AI 对话</span>
                                <span className="text-[10px] text-zinc-500 ml-2">可拖动</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-0.5" onMouseDown={e => e.stopPropagation()}>
                            <button onClick={handleNewChat} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors" title="新对话">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </button>
                            <button onClick={handleClear} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors" title="清空">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                            </button>
                            <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors ml-1" title="关闭">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {messages.length === 0 ? (
                            <div className="text-center py-8 text-zinc-500">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 opacity-30">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <p className="text-xs">开始与 AI 对话</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${msg.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-300'
                                        }`}>
                                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                                    </div>
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white/5 text-zinc-400 rounded-xl px-3 py-2">
                                    <Loader2 size={14} className="animate-spin" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-white/5">
                        <div className="flex gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="输入消息..."
                                rows={1}
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/50 resize-none"
                            />
                            <button
                                onClick={handleSend}
                                disabled={isLoading || !input.trim()}
                                className="w-8 h-8 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-lg flex items-center justify-center transition-colors"
                            >
                                {isLoading ? (
                                    <Loader2 size={14} className="text-white animate-spin" />
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Resize Handles */}
                    <div className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-indigo-500/30" onMouseDown={startResize('right')} />
                    <div className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize hover:bg-indigo-500/30" onMouseDown={startResize('bottom')} />
                    <div className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-center justify-center" onMouseDown={startResize('corner')}>
                        <svg width="10" height="10" viewBox="0 0 10 10" className="text-zinc-600">
                            <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </div>
                </div>
            )}
        </>
    );
};

export default ChatSidebar;
