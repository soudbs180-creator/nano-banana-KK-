import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, Bot, User, X, Trash2, ChevronDown, GripVertical, Plus, MessageCircle, ArrowUp, Image, FileText, Link2, Film } from 'lucide-react';
import { generateText } from '../services/geminiService';
import { notify } from '../services/notificationService';
import { keyManager } from '../services/keyManager';
import { agentService, AgentConfig } from '../services/agentService';

interface ChatSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    onClose?: () => void;
    isMobile: boolean;
    onOpenSettings?: (view?: 'api-management') => void;
    onHoverChange?: (isHovered: boolean) => void; // 通知父组件hover状态变化
}

// 附件类型
interface Attachment {
    id: string;
    type: 'image' | 'document' | 'video' | 'audio' | 'url';
    name: string;
    data: string; // base64 或 URL
    mimeType?: string;
    size?: number;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    attachments?: Attachment[]; // 附件列表
}

interface ChatModel {
    id: string;
    name: string;
    provider: string;
    isCustom: boolean;
    type?: 'chat' | 'image' | 'video' | 'image+chat';  // ✨ 支持多模态
    icon?: string;
    displayName?: string;
    description?: string;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onToggle, onClose, isMobile, onOpenSettings, onHoverChange }) => {
    // 1. Model State Management
    // ✨ 支持多模态模型 (image+chat)
    const [availableModels, setAvailableModels] = useState<ChatModel[]>(() =>
        keyManager.getGlobalModelList().filter(model => {
            // 排除图像/视频模型
            if (model.type === 'image' || model.type === 'video') return false;
            // 排除Nano Banana图像生成模型
            if (model.id.includes('-image')) return false;
            return model.type === 'chat' || model.type === 'image+chat';
        })
    );
    const [selectedModel, setSelectedModel] = useState<ChatModel>(() => availableModels[0] || { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', isCustom: false });
    const [showModelMenu, setShowModelMenu] = useState(false);

    // Agent State Management
    const [agentMode, setAgentMode] = useState(false);
    const [currentAgent, setCurrentAgent] = useState<AgentConfig | null>(() => agentService.getActive());

    // Subscribe to keyManager updates
    useEffect(() => {
        const updateModels = () => {
            // ✨ 支持多模态模型 (image+chat)
            const models = keyManager.getGlobalModelList().filter(model => {
                // 排除图像/视频模型
                if (model.type === 'image' || model.type === 'video') return false;
                // 排除Nano Banana图像生成模型
                if (model.id.includes('-image')) return false;
                return model.type === 'chat' || model.type === 'image+chat';
            });
            setAvailableModels(models);

            if (models.length > 0) {
                const exists = models.find(m => m.id === selectedModel.id);
                if (!exists) {
                    setSelectedModel(models[0]);
                } else {
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
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 3. Layout State
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(window.innerHeight);

    // 4. Drag State (must be declared before scheduleAutoClose uses it)
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const startPosRef = useRef({ x: 0, y: 0 });

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

    // Auto-close logic
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
        }, delay) as any;
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

    // Draggable Position State (Default Right-Bottom)
    const [position, setPosition] = useState(() => {
        // Clear old position and use new default
        localStorage.removeItem('kk_chat_pos');

        if (isMobile) {
            return { x: 20, y: (window.innerHeight - 180) };
        }
        // Fixed position: 24px from right and bottom
        return { x: window.innerWidth - 24 - 64, y: window.innerHeight - 24 - 64 };
    });

    useEffect(() => {
        localStorage.setItem('kk_chat_pos', JSON.stringify(position));
    }, [position]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    // Cleanup drag listeners
    useEffect(() => {
        let rafId: number | null = null;

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            // Cancel previous animation frame
            if (rafId) {
                cancelAnimationFrame(rafId);
            }

            // Throttle using requestAnimationFrame for smooth dragging
            rafId = requestAnimationFrame(() => {
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;

                setPosition({
                    x: Math.max(0, Math.min(window.innerWidth - 64, startPosRef.current.x + dx)),
                    y: Math.max(0, Math.min(window.innerHeight - 64, startPosRef.current.y + dy))
                });
            });
        };

        const handleMouseUp = () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            if (rafId) {
                cancelAnimationFrame(rafId);
            }
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

    // 处理文件选择
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const newAttachments: Attachment[] = [];

        for (const file of Array.from(files)) {
            const reader = new FileReader();

            const attachment = await new Promise<Attachment>((resolve) => {
                reader.onloadend = () => {
                    let type: Attachment['type'] = 'document';
                    if (file.type.startsWith('image/')) type = 'image';
                    else if (file.type.startsWith('video/')) type = 'video';
                    else if (file.type.startsWith('audio/')) type = 'audio';

                    resolve({
                        id: Date.now().toString() + Math.random(),
                        type,
                        name: file.name,
                        data: reader.result as string,
                        mimeType: file.type,
                        size: file.size
                    });
                };
                reader.readAsDataURL(file);
            });

            newAttachments.push(attachment);
        }

        setAttachments(prev => [...prev, ...newAttachments]);
        registerActivity();

        // 重置文件输入
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // 删除附件
    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    const handleSend = async () => {
        if ((!input.trim() && attachments.length === 0) || isThinking) return;

        const userText = input.trim();
        const currentAttachments = [...attachments]; // 保存当前附件
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userText || '(附件)',
            timestamp: Date.now(),
            attachments: currentAttachments.length > 0 ? currentAttachments : undefined
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setAttachments([]); // 清空附件
        setIsThinking(true);
        registerActivity();

        try {
            // 构建历史记录
            const history = messages
                .filter(m => m.id !== 'welcome')
                .map(m => ({ role: m.role, content: m.content }));

            // Agent模式:添加系统提示词
            if (agentMode && currentAgent) {
                history.unshift({ role: 'user', content: currentAgent.systemPrompt });
            }

            // 构建当前消息(包含附件)
            let messageContent = userText;
            const inlineData: { mimeType: string; data: string }[] = [];

            // 处理附件 - 转换为Gemini API格式
            for (const att of currentAttachments) {
                if (att.type === 'image' || att.type === 'video' || att.type === 'audio') {
                    // 提取base64数据 (去除data:xxx;base64,前缀)
                    const base64Match = att.data.match(/^data:([^;]+);base64,(.+)$/);
                    if (base64Match) {
                        inlineData.push({
                            mimeType: base64Match[1],
                            data: base64Match[2]
                        });
                    }
                } else if (att.type === 'document') {
                    // 文档:添加到文本中作为上下文
                    messageContent += `\n\n[文档: ${att.name}]`;
                }
            }

            history.push({ role: 'user', content: messageContent });

            // 调用API (传递附件数据)
            const responseText = await generateText(
                history,
                selectedModel.id,
                '', // apiKey
                inlineData.length > 0 ? inlineData : undefined // 传递多媒体数据
            );

            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: responseText,
                timestamp: Date.now()
            };
            setMessages(prev => [...prev, aiMsg]);

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
            {/* 2. Chat Card Popover (Morph Transformation) */}
            {isOpen && (
                <div
                    onMouseEnter={() => {
                        setIsHovering(true);
                        clearAutoClose();
                        onHoverChange?.(true); // 通知App组件
                    }}
                    onMouseLeave={() => {
                        setIsHovering(false);
                        scheduleAutoClose();
                        onHoverChange?.(false); // 通知App组件
                    }}
                    onMouseDown={registerActivity}
                    onWheel={registerActivity}
                    className={`fixed z-[100] flex flex-col bg-[var(--bg-secondary)] backdrop-blur-2xl border-l border-[var(--border-light)] shadow-[var(--shadow-lg)] overflow-hidden ${isMobile
                        ? 'inset-0 rounded-none pb-0'
                        : 'top-0 right-0 bottom-0 w-[380px]'
                        }`}
                    style={isMobile ? {
                        height: keyboardHeight > 0 ? `${viewportHeight}px` : '100dvh',
                        transition: 'height 0.2s ease-out'
                    } : {
                        // Full height sidebar on the right
                        transform: 'translateX(0)',
                        transition: 'transform 0.3s ease-out'
                    }}
                >

                    {/* Floating Close Button */}
                    <button
                        onClick={onToggle}
                        className="absolute top-4 right-4 z-10 p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)] rounded-full transition-colors backdrop-blur-sm bg-[var(--bg-tertiary)]/80"
                        title="关闭"
                    >
                        <X size={20} />
                    </button>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin pt-16">
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} group`}>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${msg.role === 'user'
                                    ? 'bg-[var(--bg-tertiary)] border border-[var(--border-light)]'
                                    : 'bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-500 text-white'
                                    }`}>
                                    {msg.role === 'user' ? <User size={14} className="text-[var(--text-tertiary)]" /> : <Bot size={16} className="animate-icon-breathe" />}
                                </div>
                                <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-tr-md border border-[var(--border-light)]'
                                    : 'bg-blue-500/12 text-[var(--text-primary)] border border-blue-500/25 rounded-tl-md backdrop-blur-sm'
                                    }`}>
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                </div>
                            </div>
                        ))}

                        {isThinking && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-500 flex items-center justify-center shrink-0 shadow-md">
                                    <Bot size={16} className="animate-pulse text-white" />
                                </div>
                                <div className="flex items-center gap-1.5 px-4 py-3 bg-blue-500/12 border border-blue-500/25 rounded-2xl rounded-tl-md h-11">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Bottom Area */}
                    <div className="px-4 pb-4 pt-3 shrink-0">
                        {/* Input Area - Always visible */}
                        <div className="mb-3 px-2">
                            <textarea
                                className="w-full border-none shadow-none text-base p-0 bg-transparent resize-none scrollbar-thin focus:outline-none text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
                                placeholder="开启你的灵感之旅"
                                rows={1}
                                value={input}
                                onChange={e => {
                                    setInput(e.target.value);
                                    registerActivity();
                                    e.target.style.height = 'auto';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                autoFocus
                            />
                        </div>

                        {/* Attachments Preview */}
                        {attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3 px-2">
                                {attachments.map(att => (
                                    <div key={att.id} className="relative group">
                                        {att.type === 'image' ? (
                                            <img
                                                src={att.data}
                                                alt={att.name}
                                                className="w-16 h-16 object-cover rounded-lg border border-[var(--border-light)]"
                                            />
                                        ) : (
                                            <div className="w-16 h-16 rounded-lg border border-[var(--border-light)] bg-[var(--bg-tertiary)] flex flex-col items-center justify-center gap-1">
                                                {att.type === 'video' && <Film size={20} className="text-purple-400" />}
                                                {att.type === 'audio' && <Film size={20} className="text-green-400" />}
                                                {att.type === 'document' && <FileText size={20} className="text-blue-400" />}
                                                <span className="text-[8px] text-[var(--text-tertiary)] truncate max-w-14 px-1">{att.name}</span>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => removeAttachment(att.id)}
                                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Bottom Toolbar */}
                        <div className="flex items-center gap-2">
                            {/* Hidden File Input */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.md"
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            {/* Add Attachment Button */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 rounded-lg hover:bg-[var(--toolbar-hover)] transition-colors"
                                title="添加附件 (图片/视频/文档)"
                            >
                                <Plus size={20} className="text-[var(--text-secondary)]" />
                            </button>

                            {/* Agent Toggle Button */}
                            <button
                                onClick={() => {
                                    setAgentMode(!agentMode);
                                    registerActivity();
                                    if (!agentMode && !currentAgent) {
                                        // 如果开启Agent但没有激活的Agent,使用默认Agent
                                        setCurrentAgent(agentService.getActive());
                                    }
                                }}
                                className={`p-2 rounded-lg transition-all ${agentMode
                                    ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                                    : 'hover:bg-[var(--toolbar-hover)] text-[var(--text-secondary)]'
                                    }`}
                                title={agentMode ? 'Agent: ON' : 'Agent: OFF'}
                            >
                                <Bot size={20} className={agentMode ? 'animate-pulse' : ''} />
                            </button>

                            {/* Model Selector */}
                            <div className="relative flex-1">
                                <button
                                    onClick={() => {
                                        registerActivity();
                                        if (availableModels.length === 0) {
                                            onOpenSettings?.('api-management');
                                        } else {
                                            setShowModelMenu(!showModelMenu);
                                        }
                                    }}
                                    className="w-full py-1.5 px-3 gap-1.5 transition-all flex items-center rounded-lg hover:bg-[var(--toolbar-hover)] text-sm"
                                >
                                    {availableModels.length === 0 ? (
                                        <>
                                            <span className="text-base">⚙️</span>
                                            <span className="text-[var(--text-secondary)]">配置模型</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-base">{selectedModel.icon || '🤖'}</span>
                                            <span className="text-[var(--text-secondary)]">{selectedModel.name || selectedModel.id}</span>
                                            <ChevronDown size={14} className={`text-[var(--text-tertiary)] ml-auto transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
                                        </>
                                    )}
                                </button>

                                {/* Model Dropdown */}
                                {showModelMenu && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowModelMenu(false)} />
                                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl shadow-2xl z-20 p-1.5 max-h-[300px] overflow-y-auto scrollbar-thin">
                                            <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold border-b border-[var(--border-light)] mb-1 select-none">选择模型</div>
                                            {availableModels.map(model => {
                                                const displayName = model.name || model.id;
                                                const advantage = model.description || (model.provider ? `${model.provider} 模型` : '自定义模型');
                                                return (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => { setSelectedModel(model); setShowModelMenu(false); }}
                                                        className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-all ${selectedModel.id === model.id ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20' : 'text-[var(--text-secondary)] hover:bg-[var(--toolbar-hover)] border border-transparent'
                                                            }`}
                                                    >
                                                        <span className="mt-0.5 text-base">{model.icon || '🤖'}</span>
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className={`font-medium ${selectedModel.id === model.id ? 'text-blue-600' : 'text-[var(--text-primary)]'}`}>{displayName}</span>
                                                            <span className="text-[10px] opacity-70 leading-tight">{advantage}</span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Send Button */}
                            <button
                                onClick={() => {
                                    if (input.trim()) {
                                        handleSend();
                                    }
                                }}
                                disabled={isThinking}
                                className="size-10 rounded-full cursor-pointer flex items-center justify-center bg-[var(--text-tertiary)] text-white hover:bg-[var(--text-secondary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <ArrowUp size={18} />
                            </button>
                        </div>
                    </div>
                </div >
            )}
        </>
    );
};

export default ChatSidebar;
