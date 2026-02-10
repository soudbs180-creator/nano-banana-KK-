
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowUp, Bot, ChevronDown, Eraser, FileText, Film, Image as ImageIcon, Layout, MessageSquare, Mic, Paperclip, Plus, User, X, Zap, Sparkles } from 'lucide-react';
import { generateImage } from '../services/geminiService';
import { llmService } from '../services/llm/LLMService';
import { notify } from '../services/notificationService';
import { keyManager } from '../services/keyManager';
import { agentService, AgentConfig } from '../services/agentService';
import { getModelDisplayInfo } from '../services/modelCapabilities';
import { sortModels, toggleModelPin, getPinnedModels, filterAndSortModels } from '../utils/modelSorting';
import ReactDOM from 'react-dom';
import { AspectRatio, ImageSize } from '../types';

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
    content: string; // 可能是Markdown文本，也可能包含图片Markdown
    timestamp: number;
    attachments?: Attachment[]; // 附件列表
    isImageGeneration?: boolean; // 标记是否为图片生成结果
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
    // ✨ 支持多模态模型 (image+chat) + 🚀 去重
    const [availableModels, setAvailableModels] = useState<ChatModel[]>(() => {
        const models = keyManager.getGlobalModelList().filter(model => {
            const idLower = model.id.toLowerCase();

            // 🚀 Allow Image Models (for /image command usage)
            // We consciously allow them so user can select "Imagen 4.0" and use /image
            if (model.type === 'image') return true;
            if (model.type === 'video') return false; // Keep video hidden for now unless requested

            // 排除Nano Banana/Flux/Midjourney等纯图像生成模型 (即使被误判为chat)
            // ✨ Update: We WANT Nano Banana (it is image+chat capable usually, or at least image)
            // If it's pure image, we already allowed it above.

            if (idLower.includes('flux') || idLower.includes('midjourney') || idLower.includes('dall-e') || idLower.includes('stable-diffusion') || idLower.includes('sdxl')) return false;
            if (idLower.includes('nano') && idLower.includes('banana') && model.type !== 'image+chat') return false;
            if (idLower.includes('flux') || idLower.includes('midjourney') || idLower.includes('dall-e') || idLower.includes('stable-diffusion') || idLower.includes('sdxl')) return false;

            // 必须是 Chat 或 Image+Chat
            return model.type === 'chat' || model.type === 'image+chat';
        });
        // 🚀 去重：使用 Map 按 ID 去重
        const uniqueMap = new Map<string, ChatModel>();
        models.forEach(m => { if (!uniqueMap.has(m.id)) uniqueMap.set(m.id, m); });
        return Array.from(uniqueMap.values());
    });
    const [selectedModel, setSelectedModel] = useState<ChatModel>(() => availableModels[0] || { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', isCustom: false });
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [modelSearch, setModelSearch] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, modelId: string } | null>(null);
    const [pinnedUpdate, setPinnedUpdate] = useState(0); // Trigger re-render for sorting

    // [NEW] Model Customizations (read from localStorage)
    const [modelCustomizations, setModelCustomizations] = useState<Record<string, { alias?: string; description?: string }>>(() => {
        try {
            const stored = localStorage.getItem('kk_model_customizations');
            return stored ? JSON.parse(stored) : {};
        } catch { return {}; }
    });

    // Listen for storage changes (to sync with PromptBar updates)
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'kk_model_customizations' && e.newValue) {
                setModelCustomizations(JSON.parse(e.newValue));
            }
        };
        window.addEventListener('storage', handleStorageChange);
        // Also poll/check on focus in case change happened in same window but different component
        const handleFocus = () => {
            try {
                const stored = localStorage.getItem('kk_model_customizations');
                if (stored) setModelCustomizations(JSON.parse(stored));
            } catch { }
        };
        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    useEffect(() => {
        // Close menu on click anywhere
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    // Agent State Management
    const [agentMode, setAgentMode] = useState(false);
    const [currentAgent, setCurrentAgent] = useState<AgentConfig | null>(() => agentService.getActive());

    // Subscribe to keyManager updates
    useEffect(() => {
        const updateModels = () => {
            // ✨ 支持多模态模型 (image+chat) + 🚀 去重
            const rawModels = keyManager.getGlobalModelList().filter(model => {
                const idLower = model.id.toLowerCase();

                // 🚀 Allow Image Models
                if (model.type === 'image') return true;
                if (model.type === 'video') return false;

                if (idLower.includes('flux') || idLower.includes('midjourney') || idLower.includes('dall-e') || idLower.includes('stable-diffusion') || idLower.includes('sdxl')) return false;

                return model.type === 'chat' || model.type === 'image+chat';
            });
            // 🚀 去重：使用 Map 按 ID 去重
            const uniqueMap = new Map<string, ChatModel>();
            rawModels.forEach(m => { if (!uniqueMap.has(m.id)) uniqueMap.set(m.id, m); });
            const models = Array.from(uniqueMap.values());
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
            content: '你好！我是 KK Studio 数字助手。\n有什么我可以帮您？\n\n试试输入 "/image 一只猫" 来生成图片！',
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

    // ✨ 图片生成逻辑
    const handleImageGeneration = async (prompt: string) => {
        setIsThinking(true);
        registerActivity();

        try {
            // 1. 查找可用的绘图模型
            const allModels = keyManager.getGlobalModelList();

            // 🚀 Use Selected Model if it supports image generation
            let imageModel = allModels.find(m => m.id === selectedModel.id && (m.type === 'image' || m.type === 'image+chat'));

            // Fallback strategy
            if (!imageModel) {
                imageModel = allModels.find(m => m.type === 'image' && !m.id.includes('video')) ||
                    allModels.find(m => m.id.includes('imagen')) ||
                    allModels.find(m => m.id.includes('stable-diffusion') || m.id.includes('flux')) ||
                    allModels.find(m => m.type === 'image+chat' && m.id.includes('gemini'));
            }

            if (!imageModel) {
                throw new Error("未找到可用的绘图模型，请在设置中添加支持绘图的模型 (如 Imagen 3/4, Gemini Flash Image等)");
            }

            // 2. 调用生成服务
            const result = await generateImage(
                prompt,
                AspectRatio.SQUARE, // 默认方形
                ImageSize.SIZE_1K,  // 默认1K
                [], // TODO: 支持参考图?
                imageModel.id as any,
                '', // apiKey auto-resolved
                undefined,
                false
            );

            // 3. 构建结果消息
            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `✨ 已为您生成图片: "${prompt}" (使用模型: ${imageModel.name})`,
                timestamp: Date.now(),
                isImageGeneration: true,
                attachments: [{
                    id: Date.now().toString(),
                    type: 'image',
                    name: `generated-${Date.now()}.png`,
                    data: result.url,
                    mimeType: 'image/png'
                }]
            };
            setMessages(prev => [...prev, aiMsg]);

        } catch (error: any) {
            console.error('Image Generation Error:', error);
            notify.error('图片生成失败', error.message);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `⚠️ 图片生成失败: ${error.message}`,
                timestamp: Date.now()
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    const handleSend = async () => {
        if ((!input.trim() && attachments.length === 0) || isThinking) return;

        const userText = input.trim();

        // ✨ 检查是否为生成图片指令
        // Regex: /image prompt OR 画 prompt OR 生成 prompt
        const imageRegex = /^(\/image|画|生成|draw|gen)\s+(.+)/i;
        const match = userText.match(imageRegex);

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

        // 如果匹配到绘图指令，且没有附件(暂不支持图生图)，则走绘图流程
        if (match && currentAttachments.length === 0) {
            const prompt = match[2];
            handleImageGeneration(prompt);
            return;
        }

        // 🚀 Guard: Pure Image Models cannot chat
        if (selectedModel.type === 'image') {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: `⚠️ "${getModelDisplayInfo(selectedModel).displayName}" 是纯绘图模型，不支持文本对话。\n\n请尝试输入 "/image ${userText}" 来生成图片。`,
                timestamp: Date.now()
            }]);
            return;
        }

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
            const responseText = await llmService.chat({
                modelId: selectedModel.id,
                messages: history,
                inlineData: inlineData.length > 0 ? inlineData : undefined
            });

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
                content: `⚠️ 出错了: ${error.message} `,
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
        return `${x} ${y} `;
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
                        : 'top-0 right-0 bottom-0 w-[420px]'
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
                                <div className={`max-w-[82%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    {/* 消息文本 */}
                                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-tr-md border border-[var(--border-light)]'
                                        : 'bg-blue-500/12 text-[var(--text-primary)] border border-blue-500/25 rounded-tl-md backdrop-blur-sm'
                                        }`}>
                                        <div className="whitespace-pre-wrap">{msg.content}</div>
                                    </div>

                                    {/* 附件/生成结果展示 */}
                                    {msg.attachments && msg.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {msg.attachments.map(att => (
                                                <div key={att.id} className="relative group overflow-hidden rounded-xl border border-[var(--border-light)] shadow-sm transition-transform hover:scale-[1.02]">
                                                    {att.type === 'image' ? (
                                                        <a href={att.data} target="_blank" rel="noopener noreferrer" className="block cursor-zoom-in">
                                                            <img
                                                                src={att.data}
                                                                alt={att.name}
                                                                className="max-w-[240px] max-h-[240px] object-cover bg-[var(--bg-secondary)]"
                                                            />
                                                        </a>
                                                    ) : (
                                                        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] cursor-default">
                                                            {att.type === 'video' && <Film size={16} className="text-purple-400" />}
                                                            {att.type === 'audio' && <Mic size={16} className="text-green-400" />}
                                                            {att.type === 'document' && <FileText size={16} className="text-blue-400" />}
                                                            <span className="text-xs text-[var(--text-secondary)] truncate max-w-[150px]">{att.name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
                                    className="w-full py-1.5 px-3 gap-2 transition-all flex items-center justify-center rounded-lg hover:bg-[var(--toolbar-hover)] text-sm"
                                >
                                    {availableModels.length === 0 ? (
                                        <>
                                            <span className="text-base">⚙️</span>
                                            <span className="text-[var(--text-secondary)]">配置模型</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-base">{selectedModel.icon || '🤖'}</span>
                                            <span className={`text-[var(--text-secondary)] truncate ${getModelDisplayInfo(selectedModel).badgeColor}`}>
                                                {modelCustomizations[selectedModel.id]?.alias || getModelDisplayInfo(selectedModel).displayName}
                                            </span>

                                            {/* 🚀 [NEW] 来源标签 - 横排 */}
                                            {getModelDisplayInfo(selectedModel).badgeText && (
                                                <span
                                                    className={`text-[9px] px-1 py-0.5 rounded border opacity-80 ${getModelDisplayInfo(selectedModel).badgeColor}`}
                                                    style={{
                                                        marginLeft: 'auto',
                                                        marginRight: '4px',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {getModelDisplayInfo(selectedModel).badgeText}
                                                </span>
                                            )}

                                            <ChevronDown size={14} className={`text-[var(--text-tertiary)] flex-shrink-0 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
                                        </>
                                    )}
                                </button>

                                {/* Model Dropdown */}
                                {showModelMenu && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowModelMenu(false)} />

                                        {/* Container for positioning both modules */}
                                        <div
                                            className="absolute bottom-full mb-2 z-20 flex flex-col gap-2"
                                            style={{
                                                right: '-48px',
                                                width: isMobile ? 'calc(100vw - 2rem)' : '388px',
                                                maxWidth: 'calc(100vw - 2rem)'
                                            }}
                                        >
                                            {/* 🔍 Search Module */}
                                            <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl shadow-xl p-2">
                                                <div className="relative flex items-center">
                                                    <svg className="absolute left-2 w-3.5 h-3.5 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                    <input
                                                        type="text"
                                                        value={modelSearch}
                                                        onChange={(e) => setModelSearch(e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        placeholder="搜索模型..."
                                                        className="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs rounded-xl py-1.5 pl-7 pr-2 outline-none border border-transparent focus:border-indigo-500/50 placeholder-[var(--text-tertiary)]"
                                                        autoFocus
                                                    />
                                                    {modelSearch && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setModelSearch(''); }}
                                                            className="absolute right-2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Model List Module */}
                                            <div
                                                className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl shadow-2xl p-1.5 max-h-[300px] overflow-y-auto scrollbar-thin"
                                            >
                                                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-bold border-b border-[var(--border-light)] mb-1 select-none flex justify-between items-center">
                                                    <span>选择模型 (右键可顶置)</span>
                                                </div>

                                                {filterAndSortModels(availableModels, modelSearch, modelCustomizations)
                                                    .map((model: any) => {
                                                        const custom = modelCustomizations[model.id] || {};
                                                        const displayName = custom.alias || model.name || model.id;
                                                        const advantage = custom.description || model.description || (model.provider ? `${model.provider} 模型` : '自定义模型');
                                                        const isPinned = getPinnedModels().includes(model.id);

                                                        return (
                                                            <button
                                                                key={model.id}
                                                                onClick={() => { setSelectedModel(model); setShowModelMenu(false); setModelSearch(''); }}
                                                                onContextMenu={(e) => {
                                                                    e.preventDefault();
                                                                    setContextMenu({ x: e.clientX, y: e.clientY, modelId: model.id });
                                                                }}
                                                                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-all ${selectedModel.id === model.id ? 'bg-white/10 ring-1 ring-white/20' : 'text-[var(--text-secondary)] hover:bg-[var(--toolbar-hover)] border border-transparent'}`}
                                                            >
                                                                <span className="mt-0.5 text-base relative">
                                                                    {model.icon || '🤖'}
                                                                    {isPinned && <span className="absolute -top-1 -right-1 text-[8px]">📌</span>}
                                                                </span>
                                                                <div className="flex flex-col gap-0.5 w-full">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className={`font-medium ${selectedModel.id === model.id ? getModelDisplayInfo(model).badgeColor : 'text-[var(--text-primary)]'}`}>
                                                                            {displayName}
                                                                        </span>
                                                                        {/* 🚀 [NEW] 下拉菜单中的来源标签 - 改为横排，居中对齐，稍微大一点 */}
                                                                        {getModelDisplayInfo(model).badgeText && (
                                                                            <span
                                                                                className={`text-[10px] px-1.5 py-0.5 rounded border opacity-80 ml-auto ${getModelDisplayInfo(model).badgeColor}`}
                                                                                style={{
                                                                                    flexShrink: 0,
                                                                                    whiteSpace: 'nowrap'
                                                                                }}
                                                                            >
                                                                                {getModelDisplayInfo(model).badgeText}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] opacity-70 leading-tight truncate">{advantage}</span>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                {sortModels(availableModels).filter(m => {
                                                    if (!modelSearch) return true;
                                                    const custom = modelCustomizations[m.id] || {};
                                                    const searchLower = modelSearch.toLowerCase();
                                                    return (
                                                        m.id.toLowerCase().includes(searchLower) ||
                                                        (m.name && m.name.toLowerCase().includes(searchLower)) ||
                                                        (custom.alias && custom.alias.toLowerCase().includes(searchLower)) ||
                                                        (m.provider && m.provider.toLowerCase().includes(searchLower))
                                                    );
                                                }).length === 0 && (
                                                        <div className="p-4 text-center text-xs text-[var(--text-tertiary)]">
                                                            未找到匹配的模型
                                                        </div>
                                                    )}
                                            </div>

                                        </div>

                                        {/* Context Menu for Pinning */}
                                        {contextMenu && ReactDOM.createPortal(
                                            <div
                                                className="fixed z-[10010] bg-[#2a2a2e] border border-white/10 rounded-lg shadow-xl py-1 w-32 backdrop-blur-md"
                                                style={{ top: contextMenu.y, left: contextMenu.x }}
                                            >
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleModelPin(contextMenu.modelId);
                                                        setContextMenu(null);
                                                        // Force re-render if needed, but sortModels reads from localStorage directly 
                                                        // We might need a state trigger here too like in PromptBar
                                                        setPinnedUpdate(prev => prev + 1);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 flex items-center gap-2"
                                                >
                                                    {getPinnedModels().includes(contextMenu.modelId) ? '取消顶置' : '📌 顶置模型'}
                                                </button>
                                            </div>,
                                            document.body
                                        )}
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
