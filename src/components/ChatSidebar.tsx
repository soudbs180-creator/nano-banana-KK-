import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, X, Trash2, ChevronDown, GripVertical } from 'lucide-react';
import { generateText } from '../services/geminiService';
import { notify } from '../services/notificationService';
import { keyManager } from '../services/keyManager';
import { ApiLineMode } from '../types';

interface ChatSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    onClose?: () => void;
    isMobile: boolean;
    onOpenSettings?: (view?: 'api-channels') => void;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

// Models as requested by user with descriptions
// Models as requested by user with descriptions
const AVAILABLE_MODELS = [
    {
        id: 'gemini-flash-lite-latest',
        name: 'Gemini 3 Flash Lite',
        icon: '⚡',
        desc: '超高性价比，超低延迟 (Best Value)'
    },
    {
        id: 'gemini-flash-latest', // Fixed duplicate ID
        name: 'Gemini 3 Flash',
        icon: '🚀',
        desc: '性能均衡，高吞吐量 (Balanced)'
    },
    {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash (Preview)',
        icon: '🌟',
        desc: '最新预览版，更强逻辑 (Preview)'
    },
    {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro (Preview)',
        icon: '🧠',
        desc: '顶级推理能力，适合复杂任务 (Top Tier)'
    },
];

const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onToggle, onClose, isMobile, onOpenSettings }) => {
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
    const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0]); // Default Lite
    const [showModelMenu, setShowModelMenu] = useState(false);

    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
    const [lineMode, setLineMode] = useState<ApiLineMode>('google_direct');
    const [proxyModels, setProxyModels] = useState(() => keyManager.getAvailableProxyModels('chat'));

    // Subscribe to proxy model changes
    useEffect(() => {
        const unsubscribe = keyManager.subscribe(() => {
            setProxyModels(keyManager.getAvailableProxyModels('chat'));
        });
        return unsubscribe;
    }, []);

    // Get available models based on line mode
    const availableModels = useMemo(() => {
        if (lineMode === 'google_direct') {
            return AVAILABLE_MODELS;
        }
        // Proxy mode: use configured chat models
        if (proxyModels.length === 0) {
            return [];
        }
        return proxyModels.map(m => ({
            id: m.id,
            name: m.label,
            icon: '🔌',
            desc: m.description || '中转代理模型'
        }));
    }, [lineMode, proxyModels]);

    // Auto-select first model when line mode changes
    useEffect(() => {
        if (availableModels.length > 0) {
            const currentValid = availableModels.find(m => m.id === selectedModel.id);
            if (!currentValid) {
                setSelectedModel(availableModels[0]);
            }
        }
    }, [lineMode, availableModels]);

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

    // Auto-close timer ref
    const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (autoCloseTimerRef.current) {
            clearTimeout(autoCloseTimerRef.current);
            autoCloseTimerRef.current = null;
        }
    };

    const handleMouseLeave = () => {
        if (isOpen && !isDragging) {
            autoCloseTimerRef.current = setTimeout(() => {
                if (isOpen && onClose) {
                    onClose();
                }
            }, 5000); // 5 seconds
        }
    };

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
    // Using simple offset from bottom-left corner or restoration
    const [position, setPosition] = useState(() => {
        try {
            const saved = localStorage.getItem('kk_chat_pos');
            if (saved) return JSON.parse(saved);
        } catch (e) { }

        // Mobile Default: Top-Left (High Y value because Y is distance from bottom)
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
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

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

            // Calculate new position (inverted Y because bottom-based)
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
        if (isOpen) return; // Disable drag when open (or maybe allow? usually bubble is draggable)
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        startPosRef.current = { ...position };
    };

    const handleSend = async () => {
        if (!input.trim() || isThinking) return;

        const userText = input.trim();
        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText, timestamp: Date.now() };

        // Optimistic update
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsThinking(true);

        // Reset timer if user is typing/sending (activity)
        handleMouseEnter();

        try {
            // Build history for context
            // Exclude the welcome message if it's just static, but here we include all for continuity
            // Map to the simple format expected by generateText
            const history = messages
                .filter(m => m.id !== 'welcome') // Optional: exclude welcome msg from prompt context
                .map(m => ({ role: m.role, content: m.content }));

            // Add current user message
            history.push({ role: 'user', content: userText });

            // Call API
            const responseText = await generateText(history, selectedModel.id);

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: responseText,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, aiMsg]);

            // Record Cost (Estimation)
            // We treat both input and output as 'context' for simplicity in this version, 
            // casting to '1K' size logic just for rate lookup
            import('../services/costService').then(({ recordCost }) => {
                const fullText = history.map(m => m.content).join('') + userText + responseText;
                // Pass 0 images, but long prompt. 
                // Note: costService currently calculates cost based on Image Count mainly for output.
                // To track text cost properly, we'd need a dedicated Text API in costService.
                // For now, we log the prompt length which triggers Input Token cost.
                recordCost(
                    selectedModel.id as any, // Cast to ModelType
                    '1K' as any,
                    0, // 0 Images
                    fullText
                );
            });

        } catch (error: any) {
            console.error('Chat Error:', error);
            notify.error('AI 生成失败', error.message || '请检查网络或 API Key');

            // Add error message to chat for visibility
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

    // Calculate transform origin based on bubble position (approximate corner)
    // If bubble is on left/right half, anchor X. If top/bottom half, anchor Y.
    const getTransformOrigin = () => {
        const x = position.x < window.innerWidth / 2 ? 'left' : 'right';
        const y = position.y < window.innerHeight / 2 ? 'bottom' : 'bottom'; // Usually bottom since it's a bubble
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
                        className={`group relative w-12 h-12 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-2xl animate-float-breathe cursor-move active:scale-95 transition-transform hover:brightness-110 ${isDragging ? 'cursor-grabbing scale-95' : ''}`}
                        title="Open AI Assistant (Drag to move)"
                    >
                        {/* Inner Icon Breathing - Smaller now */}
                        <Bot size={24} className="animate-icon-breathe drop-shadow-md pointer-events-none" />

                        {/* Status Dot - Smaller */}
                        <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#09090b] shadow-lg animate-pulse pointer-events-none" />

                        {/* Click handler strictly on a overlay to separate from drag?
                        Actually standard click works if no drag occurred.
                        But we need to distinguish click vs dragend.
                        Simple check: if moved > threshold.
                        For now, let's assume a clean click is quick.
                    */}
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

            {/* 2. Chat Card Popover (Morph Transformation) - Fullscreen on Mobile */}
            {isOpen && (
                <div
                    onMouseEnter={handleMouseEnter}
                    className={`fixed z-[100] flex flex-col bg-[#131316]/95 backdrop-blur-2xl border border-purple-500/30 shadow-[0_0_50px_-12px_rgba(124,58,237,0.5)] animate-scale-up-corner overflow-hidden ring-1 ring-white/10 ${isMobile
                        ? 'inset-0 rounded-none pb-0' // Reduced padding as bottom bar is hidden
                        : 'w-[380px] h-[600px] max-h-[80vh] rounded-3xl origin-bottom-left'
                        }`}
                    style={isMobile ? {
                        height: keyboardHeight > 0 ? `${viewportHeight}px` : '100dvh',
                        transition: 'height 0.2s ease-out'
                    } : {
                        left: Math.min(window.innerWidth - 390, Math.max(20, position.x)),
                        bottom: Math.max(20, position.y), // Align bottom with bubble to look like expansion
                        transformOrigin: getTransformOrigin()
                    }}
                >

                    {/* Header */}
                    <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-gradient-to-r from-purple-900/40 to-indigo-900/20 shrink-0">
                        {/* Model Selector */}
                        <div className="relative flex items-center gap-2">
                            {/* Line Mode Toggle */}
                            <button
                                onClick={() => setLineMode(prev => prev === 'google_direct' ? 'proxy' : 'google_direct')}
                                className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${lineMode === 'google_direct'
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    }`}
                                title={lineMode === 'google_direct' ? '谷歌专线' : '中转代理'}
                            >
                                {lineMode === 'google_direct' ? '谷歌' : '代理'}
                            </button>

                            {/* Model Button */}
                            <button
                                onClick={() => {
                                    if (lineMode === 'proxy' && proxyModels.length === 0) {
                                        onOpenSettings?.('api-channels');
                                    } else {
                                        setShowModelMenu(!showModelMenu);
                                    }
                                }}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-colors text-xs font-medium group ${lineMode === 'proxy' && proxyModels.length === 0
                                        ? 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-300'
                                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-100'
                                    }`}
                            >
                                {lineMode === 'proxy' && proxyModels.length === 0 ? (
                                    <>
                                        <span className="text-base">⚙️</span>
                                        <span className="underline underline-offset-2">请到API设置模型</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-base">{selectedModel.icon}</span>
                                        <span>{selectedModel.name}</span>
                                        <ChevronDown size={12} className={`text-zinc-500 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
                                    </>
                                )}
                            </button>

                            {/* Dropdown */}
                            {showModelMenu && (
                                <>
                                    <div className="fixed inset-0 z-10 bg-black/20 backdrop-blur-sm" onClick={() => setShowModelMenu(false)} />
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-20 p-1.5 animate-in fade-in zoom-in-95 duration-100 ring-1 ring-white/5">
                                        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 font-bold border-b border-white/5 mb-1 select-none">Select Model</div>
                                        {AVAILABLE_MODELS.map(model => (
                                            <button
                                                key={model.id}
                                                onClick={() => { setSelectedModel(model); setShowModelMenu(false); }}
                                                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-all ${selectedModel.id === model.id ? 'bg-purple-600/20 text-purple-300 border border-purple-500/20 shadow-inner' : 'text-zinc-300 hover:bg-white/10 hover:text-white border border-transparent'
                                                    }`}
                                            >
                                                <span className="mt-0.5 text-base">{model.icon}</span>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className={`font-medium ${selectedModel.id === model.id ? 'text-purple-200' : 'text-zinc-200'}`}>{model.name}</span>
                                                    <span className="text-[10px] opacity-70 leading-tight">{model.desc}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                            {/* Drag Handle for Card? (Optional) */}
                            {/* <div className="p-2 text-zinc-600 cursor-move"><GripVertical size={18} /></div> */}
                            <button onClick={handleClear} className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                            <button onClick={onToggle} className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"><X size={18} /></button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} group`}>
                                {/* Avatar */}
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-lg ${msg.role === 'user'
                                    ? 'bg-zinc-800 border border-zinc-700'
                                    : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-purple-500/20'
                                    }`}>
                                    {msg.role === 'user' ? <User size={14} className="text-zinc-400" /> : <Bot size={16} className="animate-icon-breathe" />}
                                </div>

                                {/* Content */}
                                <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-[#27272a] text-zinc-100 rounded-tr-sm border border-zinc-700/50'
                                    : 'bg-purple-500/10 text-purple-100 border border-purple-500/20 rounded-tl-sm backdrop-blur-sm'
                                    }`}>
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                </div>
                            </div>
                        ))}

                        {isThinking && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shrink-0">
                                    <Bot size={16} className="animate-pulse" />
                                </div>
                                <div className="flex items-center gap-1 p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl rounded-tl-sm h-10">
                                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input - Floating Capsule */}
                    <div className="px-4 pb-2 pt-2 bg-transparent shrink-0 pointer-events-none">
                        <div className="relative group/input max-w-[95%] mx-auto pointer-events-auto">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/30 to-indigo-500/30 rounded-[32px] blur opacity-0 group-hover/input:opacity-100 transition-opacity duration-500" />
                            <div className="relative flex items-end gap-2 bg-[#131316] border border-white/10 rounded-[32px] p-2 shadow-2xl shadow-black/50 focus-within:border-purple-500/50 focus-within:ring-1 focus-within:ring-purple-500/20 transition-all">
                                <textarea
                                    className="flex-1 bg-transparent text-white text-base px-4 py-2.5 outline-none resize-none scrollbar-hide max-h-32 placeholder:text-zinc-500"
                                    placeholder={`Message ${selectedModel.name.split(' ')[0]}...`}
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
                                    className="p-2.5 bg-gradient-to-tr from-purple-600 to-indigo-600 text-white rounded-full hover:shadow-lg hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shrink-0"
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
