
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ArrowUp, Bot, Check, ChevronDown, ChevronRight, Copy, Eraser, FileText, Film, GitBranch, Image as ImageIcon, Layout, MessageSquare, Mic, Paperclip, Pencil, Plus, RotateCcw, Square, User, X, Zap, Sparkles, Search, Download, Upload, Archive, Edit2, Trash2 } from 'lucide-react';
import { generateImage } from '../../services/llm/geminiService';
import { llmService } from '../../services/llm/LLMService';
import { notify } from '../../services/system/notificationService';
import { keyManager } from '../../services/auth/keyManager';
import { agentService, AgentConfig } from '../../services/chat/agentService';
import { getModelDisplayInfo } from '../../services/model/modelCapabilities';
import { sortModels, toggleModelPin, getPinnedModels, filterAndSortModels } from '../../utils/modelSorting';
import ReactDOM from 'react-dom';
import { AspectRatio, ImageSize } from '../../types';

interface ChatSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    onClose?: () => void;
    isMobile: boolean;
    onOpenSettings?: (view?: 'api-management') => void;
    onHoverChange?: (isHovered: boolean) => void; // 通知父组件hover状态变化
    onWidthChange?: (width: number) => void;
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
    type?: 'chat' | 'image' | 'video' | 'image+chat' | 'audio';  // ✨ 支持多模态
    icon?: string;
    displayName?: string;
    description?: string;
}

interface ChatSessionItem {
    id: string;
    title: string;
    messages: Message[];
    updatedAt: number;
    customTitle?: boolean;
    parentSessionId?: string;
    branchFromMessageId?: string;
    archived?: boolean;
}

interface SessionContextMenu {
    x: number;
    y: number;
    sessionId: string;
}

type SessionImportMode = 'replace' | 'append' | 'smart';

interface SessionImportPreview {
    sessions: ChatSessionItem[];
    activeSessionId?: string;
    stats: {
        imported: number;
        conflictsById: number;
        duplicatesByFingerprint: number;
        newById: number;
        conflictTitles: string[];
        duplicateTitles: string[];
        newTitles: string[];
        conflictIds: string[];
        duplicateIds: string[];
        newIds: string[];
        conflictPairs: Array<{ incoming: string; existing: string }>;
        duplicatePairs: Array<{ incoming: string; existing: string }>;
    };
}

const CHAT_SESSION_STORAGE_KEY = 'kk_chat_sidebar_sessions_v1';
const CHAT_SESSION_TREE_EXPAND_KEY = 'kk_chat_sidebar_tree_expand_v1';

const createWelcomeMessage = (): Message => ({
    id: 'welcome',
    role: 'assistant',
    content: '你好！我是 KK Studio 数字助手。\n有什么我可以帮您？\n\n试试输入 "/image 一只猫" 来生成图片！',
    timestamp: Date.now()
});

const getSessionTitle = (messages: Message[]): string => {
    const firstUser = messages.find(m => m.role === 'user' && m.content && m.content !== '(附件)');
    if (!firstUser) return '新对话';
    return firstUser.content.slice(0, 18);
};

const formatSessionMeta = (session: ChatSessionItem): string => {
    const count = Math.max(0, (session.messages || []).filter(m => m.id !== 'welcome').length);
    const date = new Date(session.updatedAt || Date.now());
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${count}条 · ${hh}:${mm}`;
};

const makeSessionFingerprint = (session: ChatSessionItem): string => {
    const lastMsg = (session.messages || [])[session.messages.length - 1];
    const lastContent = (lastMsg?.content || '').slice(0, 64);
    const messageCount = (session.messages || []).length;
    return `${session.title || ''}::${messageCount}::${lastContent}`;
};

const getSessionLabel = (session: ChatSessionItem): string => {
    const title = session.title || '未命名会话';
    const count = Math.max(0, (session.messages || []).filter(m => m.id !== 'welcome').length);
    return `${title} (${count})`;
};

const ensureUniqueIds = (existing: ChatSessionItem[], imported: ChatSessionItem[]): ChatSessionItem[] => {
    const used = new Set(existing.map(s => s.id));
    const idMap = new Map<string, string>();

    const withIds = imported.map((s, idx) => {
        let nextId = s.id || `session_import_${Date.now()}_${idx}`;
        if (used.has(nextId)) {
            nextId = `${nextId}_import_${Date.now()}_${idx}`;
        }
        used.add(nextId);
        idMap.set(s.id, nextId);
        return { ...s, id: nextId };
    });

    return withIds.map(session => ({
        ...session,
        parentSessionId: session.parentSessionId ? (idMap.get(session.parentSessionId) || session.parentSessionId) : undefined
    }));
};

const buildImportPreview = (existing: ChatSessionItem[], imported: ChatSessionItem[]): SessionImportPreview['stats'] => {
    const existingById = new Map(existing.map(s => [s.id, s]));
    const existingByFp = new Map(existing.map(s => [makeSessionFingerprint(s), s]));

    let conflictsById = 0;
    let duplicatesByFingerprint = 0;
    let newById = 0;
    const conflictTitles: string[] = [];
    const duplicateTitles: string[] = [];
    const newTitles: string[] = [];
    const conflictIds: string[] = [];
    const duplicateIds: string[] = [];
    const newIds: string[] = [];
    const conflictPairs: Array<{ incoming: string; existing: string }> = [];
    const duplicatePairs: Array<{ incoming: string; existing: string }> = [];

    imported.forEach(session => {
        const existingBySameId = existingById.get(session.id);
        if (existingBySameId) {
            conflictsById += 1;
            conflictTitles.push(getSessionLabel(session));
            conflictIds.push(session.id);
            if (conflictPairs.length < 20) {
                conflictPairs.push({ incoming: getSessionLabel(session), existing: getSessionLabel(existingBySameId) });
            }
        } else {
            newById += 1;
            newTitles.push(getSessionLabel(session));
            newIds.push(session.id);
        }

        const fp = makeSessionFingerprint(session);
        const existingBySameFp = existingByFp.get(fp);
        if (existingBySameFp) {
            duplicatesByFingerprint += 1;
            duplicateTitles.push(getSessionLabel(session));
            duplicateIds.push(session.id);
            if (duplicatePairs.length < 20) {
                duplicatePairs.push({ incoming: getSessionLabel(session), existing: getSessionLabel(existingBySameFp) });
            }
        }
    });

    return {
        imported: imported.length,
        conflictsById,
        duplicatesByFingerprint,
        newById,
        conflictTitles,
        duplicateTitles,
        newTitles,
        conflictIds,
        duplicateIds,
        newIds,
        conflictPairs,
        duplicatePairs
    };
};

const buildMessageWithAttachments = (
    userText: string,
    atts: Attachment[]
): { messageContent: string; inlineData: { mimeType: string; data: string }[] } => {
    let messageContent = userText;
    const inlineData: { mimeType: string; data: string }[] = [];

    for (const att of atts) {
        if (att.type === 'image' || att.type === 'video' || att.type === 'audio') {
            const base64Match = att.data.match(/^data:([^;]+);base64,(.+)$/);
            if (base64Match) {
                inlineData.push({
                    mimeType: base64Match[1],
                    data: base64Match[2]
                });
            }
        } else if (att.type === 'document') {
            messageContent += `\n\n[文档: ${att.name}]`;
        }
    }

    return { messageContent, inlineData };
};

type AgentIntent = 'qa' | 'image-generate' | 'image-edit';

const buildAgentSystemPrompt = (customPrompt?: string): string => {
    const base = customPrompt?.trim() || '你是一个专业、友好的AI助手。请用简洁明了的方式回答用户的问题。';
    return `${base}\n\n你当前处于“全能Agent模式”，请遵循以下执行框架：\n1) 先识别意图：问答 / 生成图片 / 修改图片 / 文档任务。\n2) 若为问答：给出结论+关键依据+可执行步骤。\n3) 若为创作请求：先补全关键缺失信息（构图、主体、光线、风格），再给出最终可执行指令。\n4) 若为图片编辑：优先保留主体身份与风格一致性，明确“保留项/修改项/禁止项”。\n5) 输出风格：结构化、可执行、不过度啰嗦。\n6) 不确定时主动给出最合理假设，不要空泛追问。`;
};

interface AgentActionPlan {
    intent: AgentIntent;
    prompt: string;
    confidence: number;
    reason?: string;
}

const pickPlannerModelId = (models: ChatModel[], selected: ChatModel): string | null => {
    if (selected.type === 'chat' || selected.type === 'image+chat') return selected.id;
    const fallback = models.find(m => m.type === 'chat' || m.type === 'image+chat');
    return fallback?.id || null;
};

const extractJson = (raw: string): any => {
    const txt = (raw || '').trim();
    try {
        return JSON.parse(txt);
    } catch {
        const s = txt.indexOf('{');
        const e = txt.lastIndexOf('}');
        if (s >= 0 && e > s) {
            return JSON.parse(txt.slice(s, e + 1));
        }
    }
    throw new Error('Planner returned invalid JSON');
};

const planAgentAction = async (
    plannerModelId: string,
    userText: string,
    atts: Attachment[]
): Promise<AgentActionPlan> => {
    const attachmentSummary = atts.map(a => `${a.type}:${a.name}`).join(', ') || 'none';
    const plannerSystem = `You are an intent planner for an AI assistant.
Decide action intent from user request and attachments.
Allowed intents: qa, image-generate, image-edit.
Rules:
1) image-edit requires image attachment and an edit request.
2) image-generate is for creating new image from text.
3) otherwise qa.
Return STRICT JSON only:
{"intent":"qa|image-generate|image-edit","prompt":"string","confidence":0-1,"reason":"short"}`;

    const plannerUser = `User text:\n${userText}\n\nAttachments:\n${attachmentSummary}`;
    const plannedRaw = await llmService.chat({
        modelId: plannerModelId,
        messages: [
            { role: 'system', content: plannerSystem },
            { role: 'user', content: plannerUser }
        ],
        stream: false,
        temperature: 0.1,
        maxTokens: 300
    });

    const planned = extractJson(plannedRaw);
    const intent = (planned?.intent || 'qa') as AgentIntent;
    const prompt = String(planned?.prompt || userText).trim() || userText;
    const confidence = Number(planned?.confidence || 0.5);

    if (intent !== 'qa' && intent !== 'image-generate' && intent !== 'image-edit') {
        return { intent: 'qa', prompt: userText, confidence: 0.3, reason: 'fallback-invalid-intent' };
    }

    return {
        intent,
        prompt,
        confidence: Number.isFinite(confidence) ? confidence : 0.5,
        reason: planned?.reason
    };
};

const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onToggle, onClose, isMobile, onOpenSettings, onHoverChange, onWidthChange }) => {
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
    const modelMenuButtonRef = useRef<HTMLButtonElement>(null);
    const [modelMenuLayout, setModelMenuLayout] = useState<{ left: number; bottom: number; width: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, modelId: string } | null>(null);
    const [sessionContextMenu, setSessionContextMenu] = useState<SessionContextMenu | null>(null);
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
                try {
                    const parsed = JSON.parse(e.newValue);
                    setModelCustomizations(parsed && typeof parsed === 'object' ? parsed : {});
                } catch {
                    setModelCustomizations({});
                }
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
        const closeMenu = () => {
            setContextMenu(null);
            setSessionContextMenu(null);
        };
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    const updateModelMenuLayout = useCallback(() => {
        const btn = modelMenuButtonRef.current;
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        const viewportPadding = 8;
        const menuWidth = Math.min(360, Math.max(280, window.innerWidth - viewportPadding * 2));
        const alignedLeft = rect.right - menuWidth;
        const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
        const left = Math.min(Math.max(viewportPadding, alignedLeft), maxLeft);
        const bottom = Math.max(viewportPadding, window.innerHeight - rect.top + 8);

        setModelMenuLayout({ left, bottom, width: menuWidth });
    }, []);

    useEffect(() => {
        if (!showModelMenu) return;

        updateModelMenuLayout();
        const onReposition = () => updateModelMenuLayout();

        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);

        return () => {
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [showModelMenu, updateModelMenuLayout]);

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
    const [sessions, setSessions] = useState<ChatSessionItem[]>(() => {
        try {
            const raw = localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch {
            // ignore
        }

        return [{
            id: `session_${Date.now()}`,
            title: '新对话',
            messages: [createWelcomeMessage()],
            updatedAt: Date.now()
        }];
    });
    const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]?.id || `session_${Date.now()}`);
    const [messages, setMessages] = useState<Message[]>(() => sessions[0]?.messages || [createWelcomeMessage()]);
    const [sessionSearch, setSessionSearch] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [importPreview, setImportPreview] = useState<SessionImportPreview | null>(null);
    const [importPreviewSearch, setImportPreviewSearch] = useState('');
    const [importPreviewShowAll, setImportPreviewShowAll] = useState(false);
    const [importExcludedIds, setImportExcludedIds] = useState<string[]>([]);
    const [importPreviewOnlyExcluded, setImportPreviewOnlyExcluded] = useState(false);
    const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>(() => {
        try {
            const raw = localStorage.getItem(CHAT_SESSION_TREE_EXPAND_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });
    const [input, setInput] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sessionImportRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [isDropActive, setIsDropActive] = useState(false);

    // 3. Layout State
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        // [NEW] Added width sync
        setTimeout(() => onWidthChange && onWidthChange(
            Math.max(320, parseInt(localStorage.getItem('kk_chat_width') || '420', 10))
        ), 0);

        const saved = localStorage.getItem('kk_chat_width');
        return saved ? Math.max(320, parseInt(saved, 10)) : 420;
    });

    // 🚀 Sync width to parent in real-time during live resize drag
    useEffect(() => {
        if (onWidthChange) {
            onWidthChange(sidebarWidth);
        }
    }, [sidebarWidth, onWidthChange]);


    // 4. Drag State (must be declared before scheduleAutoClose uses it)
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const startPosRef = useRef({ x: 0, y: 0 });

    // [NEW] History Panel State
    const [showHistoryPanel, setShowHistoryPanel] = useState(false);

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

    const lastAssistantIndex = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') return i;
        }
        return -1;
    }, [messages]);

    const filteredSessions = useMemo(() => {
        const sorted = sessions
            .filter(session => showArchived || !session.archived)
            .sort((a, b) => b.updatedAt - a.updatedAt);
        if (!sessionSearch.trim()) return sorted;
        const q = sessionSearch.trim().toLowerCase();
        return sorted.filter(session => {
            if ((session.title || '').toLowerCase().includes(q)) return true;
            return session.messages.some(m => (m.content || '').toLowerCase().includes(q));
        });
    }, [sessionSearch, sessions, showArchived]);

    const sessionMap = useMemo(() => {
        const map = new Map<string, ChatSessionItem>();
        sessions.forEach(session => map.set(session.id, session));
        return map;
    }, [sessions]);

    const activeSession = useMemo(() => {
        return sessions.find(s => s.id === activeSessionId) || null;
    }, [sessions, activeSessionId]);

    const activeBranchTrail = useMemo(() => {
        if (!activeSession) return [] as ChatSessionItem[];
        const trail: ChatSessionItem[] = [];
        let cursor: ChatSessionItem | undefined | null = activeSession;
        const guard = new Set<string>();

        while (cursor && !guard.has(cursor.id)) {
            trail.unshift(cursor);
            guard.add(cursor.id);
            cursor = cursor.parentSessionId ? (sessionMap.get(cursor.parentSessionId) || null) : null;
        }
        return trail;
    }, [activeSession, sessionMap]);

    const activeChildren = useMemo(() => {
        return sessions
            .filter(s => s.parentSessionId === activeSessionId)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }, [sessions, activeSessionId]);

    const sessionTreeRows = useMemo(() => {
        const visibleSessions = sessions.filter(session => showArchived || !session.archived);
        const childMap = new Map<string, ChatSessionItem[]>();
        visibleSessions.forEach(session => {
            if (!session.parentSessionId) return;
            if (!childMap.has(session.parentSessionId)) childMap.set(session.parentSessionId, []);
            childMap.get(session.parentSessionId)!.push(session);
        });

        childMap.forEach(list => list.sort((a, b) => b.updatedAt - a.updatedAt));

        const roots = visibleSessions
            .filter(session => !session.parentSessionId || !sessionMap.has(session.parentSessionId))
            .sort((a, b) => b.updatedAt - a.updatedAt);

        const rows: Array<{ session: ChatSessionItem; depth: number; hasChildren: boolean }> = [];
        const activePath = new Set(activeBranchTrail.map(item => item.id));

        const dfs = (session: ChatSessionItem, depth: number) => {
            const children = childMap.get(session.id) || [];
            const hasChildren = children.length > 0;
            rows.push({ session, depth, hasChildren });

            const expanded = expandedNodes[session.id] ?? (depth === 0 || activePath.has(session.id));
            if (!expanded) return;

            children.forEach(child => dfs(child, depth + 1));
        };

        roots.forEach(root => dfs(root, 0));
        return rows;
    }, [activeBranchTrail, expandedNodes, sessionMap, sessions, showArchived]);

    useEffect(() => {
        const active = sessions.find(s => s.id === activeSessionId);
        if (active) {
            setMessages(active.messages?.length ? active.messages : [createWelcomeMessage()]);
            return;
        }

        if (sessions.length > 0) {
            setActiveSessionId(sessions[0].id);
        }
    }, [activeSessionId, sessions]);

    useEffect(() => {
        setSessions(prev => prev.map(session => {
            if (session.id !== activeSessionId) return session;
            return {
                ...session,
                messages,
                title: session.customTitle ? session.title : getSessionTitle(messages),
                updatedAt: Date.now()
            };
        }));
    }, [messages, activeSessionId]);

    useEffect(() => {
        try {
            localStorage.setItem(CHAT_SESSION_STORAGE_KEY, JSON.stringify(sessions.slice(0, 20)));
        } catch {
            // ignore
        }
    }, [sessions]);

    useEffect(() => {
        try {
            localStorage.setItem(CHAT_SESSION_TREE_EXPAND_KEY, JSON.stringify(expandedNodes));
        } catch {
            // ignore
        }
    }, [expandedNodes]);

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

    const appendFilesAsAttachments = useCallback(async (files: File[]) => {
        if (!files || files.length === 0) return;

        const newAttachments: Attachment[] = [];
        for (const file of files) {
            const reader = new FileReader();
            const attachment = await new Promise<Attachment>((resolve) => {
                reader.onloadend = () => {
                    let type: Attachment['type'] = 'document';
                    if (file.type.startsWith('image/')) type = 'image';
                    else if (file.type.startsWith('video/')) type = 'video';
                    else if (file.type.startsWith('audio/')) type = 'audio';

                    resolve({
                        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
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

        if (newAttachments.length > 0) {
            setAttachments(prev => [...prev, ...newAttachments]);
            registerActivity();
        }
    }, [registerActivity]);

    // 处理文档选择
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        await appendFilesAsAttachments(files);

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleInputPaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const clipboard = e.clipboardData;
        if (!clipboard) return;

        const dedupeFiles = (files: File[]): File[] => {
            const map = new Map<string, File>();
            files.forEach(file => {
                const key = `${file.name}::${file.type}::${file.size}::${file.lastModified}`;
                if (!map.has(key)) {
                    map.set(key, file);
                }
            });
            return Array.from(map.values());
        };

        const fromFiles = Array.from(clipboard.files || []);
        const fromItems = Array.from(clipboard.items || [])
            .filter(item => item.kind === 'file')
            .map(item => item.getAsFile())
            .filter((f): f is File => !!f);

        const merged = dedupeFiles([...fromFiles, ...fromItems]);
        if (merged.length === 0) return;

        e.preventDefault();
        await appendFilesAsAttachments(merged);
        notify.success('已添加参考附件', `粘贴导入 ${merged.length} 个文档`);
    }, [appendFilesAsAttachments]);

    const handleDropToAttach = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDropActive(false);

        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length === 0) return;

        await appendFilesAsAttachments(files);
        notify.success('已添加参考附件', `拖拽导入 ${files.length} 个文档`);
    }, [appendFilesAsAttachments]);

    // 删除附件
    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    // ✨ 图片生成逻辑（支持参考图编辑）
    const handleImageGeneration = async (prompt: string, refs: Attachment[] = [], editMode?: 'edit') => {
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

            const referenceImages = refs
                .filter(a => a.type === 'image' && a.data.startsWith('data:'))
                .map((a) => {
                    const matched = a.data.match(/^data:([^;]+);base64,(.+)$/);
                    if (!matched) return null;
                    return {
                        id: a.id,
                        data: matched[2],
                        mimeType: matched[1]
                    };
                })
                .filter(Boolean) as Array<{ id: string; data: string; mimeType: string }>;

            const lowerModelId = (imageModel.id || '').toLowerCase();
            let targetSize = ImageSize.SIZE_1K;
            if (lowerModelId.includes('4k') || lowerModelId.includes('gemini-3-pro-image-preview') || lowerModelId.includes('nano-banana-pro')) {
                targetSize = ImageSize.SIZE_4K;
            } else if (lowerModelId.includes('2k')) {
                targetSize = ImageSize.SIZE_2K;
            }

            // 2. 调用生成服务
            const result = await generateImage(
                prompt,
                AspectRatio.SQUARE, // 默认方形
                targetSize,
                referenceImages as any,
                imageModel.id as any,
                '', // apiKey auto-resolved
                undefined,
                false,
                editMode ? { editMode } : undefined
            );

            if (result.referenceImagesDropped && result.referenceImagesDropped > 0) {
                notify.warning(
                    '参考图已自动裁剪',
                    `模型最多使用 ${result.referenceImagesUsed || 0} 张，已忽略 ${result.referenceImagesDropped} 张`
                );
            }

            const sourceLines = (result.groundingSources || []).slice(0, 5).map((src, idx) => {
                const title = src.title || src.uri;
                return `${idx + 1}. ${title}\n${src.uri}`;
            });
            const sourceText = sourceLines.length > 0
                ? `\n\n🔎 来源参考:\n${sourceLines.join('\n')}`
                : '';

            // 3. 构建结果消息
            const actionLabel = editMode ? '修改图片' : '生成图片';
            const aiMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `✨ 已为您${actionLabel}: "${prompt}" (使用模型: ${imageModel.name})${sourceText}`,
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
        // Regex: /image prompt OR 画 prompt OR 生成 prompt OR 画猫
        const imageRegex = /^(\/image|画|生成|draw|gen)[\s]*(.+)/i;
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

        // 如果匹配到绘图指令，且没有附件(普通模式)，则走绘图流程
        if (!agentMode && match && currentAttachments.length === 0) {
            const prompt = match[2];
            handleImageGeneration(prompt);
            return;
        }

        // Agent模式: 先做“思考式规划”，再执行路由
        if (agentMode) {
            try {
                const plannerModelId = pickPlannerModelId(availableModels, selectedModel);
                if (plannerModelId) {
                    const plan = await planAgentAction(plannerModelId, userText, currentAttachments);

                    if (plan.intent === 'image-generate') {
                        await handleImageGeneration(plan.prompt, currentAttachments);
                        return;
                    }

                    if (plan.intent === 'image-edit') {
                        await handleImageGeneration(plan.prompt, currentAttachments, 'edit');
                        return;
                    }
                }
            } catch (e) {
                console.warn('[Agent] Planning failed, fallback to normal chat:', e);
            }
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

        const assistantMsgId = `assistant_${Date.now()}`;
        setMessages(prev => [...prev, {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: Date.now()
        }]);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            // 构建历史记录
            const history = messages
                .filter(m => m.id !== 'welcome')
                .map(m => ({ role: m.role, content: m.content }));

            // Agent模式:添加系统提示词
            if (agentMode && currentAgent) {
                history.unshift({ role: 'system' as any, content: buildAgentSystemPrompt(currentAgent.systemPrompt) });
            }

            const { messageContent, inlineData } = buildMessageWithAttachments(userText, currentAttachments);

            history.push({ role: 'user', content: messageContent });

            // 调用API (传递附件数据)
            const responseText = await llmService.chat({
                modelId: selectedModel.id,
                messages: history,
                inlineData: inlineData.length > 0 ? inlineData : undefined,
                stream: false,
                signal: controller.signal
            });

            const finalText = responseText || '...';
            setMessages(prev => prev.map(m => {
                if (m.id !== assistantMsgId) return m;
                return { ...m, content: finalText };
            }));

            import('../../services/billing/costService').then(({ recordCost }) => {
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
            const isAborted = error?.name === 'AbortError';
            if (!isAborted) {
                notify.error('AI 生成失败', error.message || '请检查网络或 API Key');
            }

            setMessages(prev => prev.map(m => {
                if (m.id !== assistantMsgId) return m;
                if (isAborted) {
                    return { ...m, content: m.content || '⏹️ 已停止生成' };
                }
                return { ...m, content: `⚠️ 出错了: ${error.message || '未知错误'}` };
            }));
        } finally {
            abortControllerRef.current = null;
            setIsThinking(false);
        }
    };

    const handleStopGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    const handleEditResend = useCallback((msg: Message) => {
        if (msg.role !== 'user') return;
        setInput(msg.content === '(附件)' ? '' : msg.content);
        setAttachments(msg.attachments || []);
        setTimeout(() => {
            inputRef.current?.focus();
            const v = inputRef.current?.value || '';
            inputRef.current?.setSelectionRange(v.length, v.length);
        }, 0);
    }, []);

    const handleCopyMessage = useCallback(async (msg: Message) => {
        const text = (msg.content || '').trim();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessageId(msg.id);
            setTimeout(() => {
                setCopiedMessageId(prev => (prev === msg.id ? null : prev));
            }, 1200);
        } catch {
            notify.warning('复制失败', '当前环境不支持剪贴板写入');
        }
    }, []);

    const handleEditFromAssistant = useCallback((assistantMessageId: string) => {
        const assistantIndex = messages.findIndex(m => m.id === assistantMessageId);
        if (assistantIndex < 0) return;
        for (let i = assistantIndex - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                handleEditResend(messages[i]);
                return;
            }
        }
        notify.warning('未找到可编辑的上一条提问', '请直接输入新的内容');
    }, [handleEditResend, messages]);

    const handleBranchFrom = useCallback((index: number) => {
        const forkBase = messages.slice(0, index + 1);
        if (forkBase.length === 0) return;

        const branchId = `session_${Date.now()}`;
        const branchTitle = `分支 · ${getSessionTitle(forkBase)}`;
        const branchSession: ChatSessionItem = {
            id: branchId,
            title: branchTitle,
            customTitle: true,
            messages: forkBase,
            updatedAt: Date.now(),
            parentSessionId: activeSessionId,
            branchFromMessageId: messages[index]?.id
        };

        setSessions(prev => [branchSession, ...prev]);
        setActiveSessionId(branchId);
        setInput('');
        setAttachments([]);
        notify.success('已创建分支会话', '可以在新分支继续对话');
    }, [activeSessionId, messages]);

    const handleRegenerateAssistant = useCallback(async (assistantId: string) => {
        if (isThinking) return;

        const assistantIndex = messages.findIndex(m => m.id === assistantId);
        if (assistantIndex < 0) return;

        let userIndex = -1;
        for (let i = assistantIndex - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                userIndex = i;
                break;
            }
        }
        if (userIndex < 0) return;

        const userMsg = messages[userIndex];
        const sourceText = userMsg.content === '(附件)' ? '' : userMsg.content;
        const sourceAttachments = userMsg.attachments || [];
        const { messageContent, inlineData } = buildMessageWithAttachments(sourceText, sourceAttachments);

        const history = messages
            .slice(0, userIndex)
            .filter(m => m.id !== 'welcome')
            .map(m => ({ role: m.role, content: m.content }));

        if (agentMode && currentAgent) {
            history.unshift({ role: 'system' as any, content: buildAgentSystemPrompt(currentAgent.systemPrompt) });
        }
        history.push({ role: 'user', content: messageContent });

        setIsThinking(true);
        registerActivity();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, content: '' } : m)));

        try {
            const responseText = await llmService.chat({
                modelId: selectedModel.id,
                messages: history,
                inlineData: inlineData.length > 0 ? inlineData : undefined,
                stream: false,
                signal: controller.signal
            });

            const finalText = responseText || '...';
            setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, content: finalText } : m)));
        } catch (error: any) {
            const isAborted = error?.name === 'AbortError';
            if (!isAborted) {
                notify.error('重新生成失败', error.message || '请检查网络或 API Key');
            }
            setMessages(prev => prev.map(m => {
                if (m.id !== assistantId) return m;
                return { ...m, content: isAborted ? (m.content || '⏹️ 已停止生成') : `⚠️ 出错了: ${error.message || '未知错误'}` };
            }));
        } finally {
            abortControllerRef.current = null;
            setIsThinking(false);
        }
    }, [agentMode, currentAgent, isThinking, messages, registerActivity, selectedModel.id]);

    const handleNewSession = useCallback(() => {
        const id = `session_${Date.now()}`;
        const item: ChatSessionItem = {
            id,
            title: '新对话',
            messages: [createWelcomeMessage()],
            updatedAt: Date.now()
        };
        setSessions(prev => [item, ...prev]);
        setActiveSessionId(id);
        setInput('');
        setAttachments([]);
    }, []);

    const handleSwitchSession = useCallback((id: string) => {
        if (id === activeSessionId) return;
        setActiveSessionId(id);
        setInput('');
        setAttachments([]);
    }, [activeSessionId]);

    const handleDeleteSession = useCallback((id: string) => {
        if (sessions.length <= 1) {
            notify.warning('无法删除', '至少保留一个会话');
            return;
        }

        const next = sessions.filter(s => s.id !== id);
        setSessions(next);
        if (activeSessionId === id) {
            setActiveSessionId(next[0].id);
        }
    }, [activeSessionId, sessions]);

    const handleRenameSession = useCallback((id: string) => {
        const target = sessions.find(s => s.id === id);
        if (!target) return;

        const renamed = window.prompt('重命名会话', target.title || '新对话');
        if (renamed === null) return;

        const title = renamed.trim() || '新对话';
        setSessions(prev => prev.map(session => {
            if (session.id !== id) return session;
            return {
                ...session,
                title,
                customTitle: true,
                updatedAt: Date.now()
            };
        }));
    }, [sessions]);

    const toggleSessionExpand = useCallback((id: string) => {
        setExpandedNodes(prev => ({
            ...prev,
            [id]: !(prev[id] ?? true)
        }));
    }, []);

    const getBranchSourcePreview = useCallback((session: ChatSessionItem): string | null => {
        if (!session.parentSessionId || !session.branchFromMessageId) return null;
        const parent = sessionMap.get(session.parentSessionId);
        if (!parent) return null;
        const source = parent.messages.find(m => m.id === session.branchFromMessageId);
        if (!source || !source.content) return null;
        return source.content.replace(/\s+/g, ' ').slice(0, 40);
    }, [sessionMap]);

    const handleToggleArchiveSession = useCallback((id: string) => {
        setSessions(prev => prev.map(session => {
            if (session.id !== id) return session;
            return {
                ...session,
                archived: !session.archived,
                updatedAt: Date.now()
            };
        }));
    }, []);

    const handleDuplicateSession = useCallback((id: string) => {
        const target = sessions.find(s => s.id === id);
        if (!target) return;

        const cloned: ChatSessionItem = {
            ...target,
            id: `session_${Date.now()}`,
            title: `${target.title || '新对话'} 副本`,
            customTitle: true,
            updatedAt: Date.now(),
            archived: false
        };
        setSessions(prev => [cloned, ...prev]);
        setActiveSessionId(cloned.id);
        setSessionContextMenu(null);
    }, [sessions]);

    const handleExportSessions = useCallback(() => {
        try {
            const payload = {
                version: 1,
                exportedAt: Date.now(),
                activeSessionId,
                sessions
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `kk-chat-sessions-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            notify.success('导出成功', '会话已导出为 JSON');
        } catch (error: any) {
            notify.error('导出失败', error?.message || '未知错误');
        }
    }, [activeSessionId, sessions]);

    const applyImportMode = useCallback((mode: SessionImportMode) => {
        if (!importPreview) return;

        const excluded = new Set(importExcludedIds);
        const importedSessions = importPreview.sessions.filter(s => !excluded.has(s.id));
        if (importedSessions.length === 0) {
            notify.warning('没有可导入会话', '请取消部分排除项后重试');
            return;
        }

        if (mode === 'replace') {
            const next = importedSessions.slice(0, 50);
            setSessions(next);
            setActiveSessionId(importPreview.activeSessionId || next[0].id);
            setImportPreview(null);
            setImportPreviewSearch('');
            setImportPreviewShowAll(false);
            setImportExcludedIds([]);
            setImportPreviewOnlyExcluded(false);
            notify.success('导入成功', `覆盖导入 ${next.length} 个会话`);
            return;
        }

        if (mode === 'append') {
            const appendList = ensureUniqueIds(sessions, importedSessions);
            const merged = [...appendList, ...sessions].slice(0, 50);
            setSessions(merged);
            setActiveSessionId(importPreview.activeSessionId && appendList.some(s => s.id === importPreview.activeSessionId)
                ? importPreview.activeSessionId
                : appendList[0]?.id || activeSessionId);
            setImportPreview(null);
            setImportPreviewSearch('');
            setImportPreviewShowAll(false);
            setImportExcludedIds([]);
            setImportPreviewOnlyExcluded(false);
            notify.success('导入成功', `追加导入 ${appendList.length} 个会话`);
            return;
        }

        const byId = new Map<string, ChatSessionItem>();
        sessions.forEach(s => byId.set(s.id, s));
        importedSessions.forEach(s => {
            const prev = byId.get(s.id);
            if (!prev || (s.updatedAt || 0) >= (prev.updatedAt || 0)) {
                byId.set(s.id, s);
            }
        });

        const byFingerprint = new Map<string, ChatSessionItem>();
        Array.from(byId.values()).forEach(session => {
            const fp = makeSessionFingerprint(session);
            const prev = byFingerprint.get(fp);
            if (!prev || (session.updatedAt || 0) > (prev.updatedAt || 0)) {
                byFingerprint.set(fp, session);
            }
        });

        const smartMerged = Array.from(byFingerprint.values())
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .slice(0, 50);
        setSessions(smartMerged);

        const preferredActive = importPreview.activeSessionId || activeSessionId;
        const hasPreferred = smartMerged.some(s => s.id === preferredActive);
        setActiveSessionId(hasPreferred ? preferredActive : smartMerged[0].id);
        setImportPreview(null);
        setImportPreviewSearch('');
        setImportPreviewShowAll(false);
        setImportExcludedIds([]);
        setImportPreviewOnlyExcluded(false);
        notify.success('导入成功', `智能合并后保留 ${smartMerged.length} 个会话`);
    }, [activeSessionId, importExcludedIds, importPreview, sessions]);

    const handleImportSessions = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result || '{}'));
                if (!parsed || !Array.isArray(parsed.sessions)) {
                    throw new Error('格式不正确');
                }
                const importedSessions: ChatSessionItem[] = parsed.sessions.map((s: any, idx: number) => ({
                    id: s.id || `session_import_${Date.now()}_${idx}`,
                    title: s.title || '导入会话',
                    messages: Array.isArray(s.messages) && s.messages.length > 0 ? s.messages : [createWelcomeMessage()],
                    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
                    customTitle: !!s.customTitle,
                    parentSessionId: s.parentSessionId,
                    branchFromMessageId: s.branchFromMessageId,
                    archived: !!s.archived
                }));

                if (importedSessions.length === 0) throw new Error('没有可导入会话');
                setImportPreview({
                    sessions: importedSessions,
                    activeSessionId: parsed.activeSessionId,
                    stats: buildImportPreview(sessions, importedSessions)
                });
                setImportPreviewSearch('');
                setImportPreviewShowAll(false);
                setImportExcludedIds([]);
                setImportPreviewOnlyExcluded(false);
            } catch (error: any) {
                notify.error('导入失败', error?.message || 'JSON 解析失败');
            }
        };
        reader.readAsText(file, 'utf-8');
    }, [sessions]);

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
                    className={`fixed z-[100] flex flex-col bg-[var(--bg-secondary)] backdrop-blur-2xl border-[var(--border-light)] shadow-[var(--shadow-lg)] overflow-hidden ${isMobile
                        ? 'left-2 right-2 rounded-[24px] border pb-0'
                        : 'top-0 right-0 bottom-0 border-l border-t-0 border-r-0 border-b-0'
                        }`}
                    style={isMobile ? {
                        top: 'calc(env(safe-area-inset-top, 0px) + var(--mobile-header-height, 56px) + 10px)',
                        bottom: keyboardHeight > 0
                            ? 'max(env(safe-area-inset-bottom, 0px), 6px)'
                            : 'calc(env(safe-area-inset-bottom, 0px) + var(--mobile-tabbar-height, 72px) + var(--mobile-tabbar-floating-offset, 12px) + 8px)',
                        transition: 'top 0.25s ease, bottom 0.25s ease'
                    } : {
                        // Full height sidebar on the right
                        width: `${sidebarWidth}px`,
                        transform: 'translateX(0)',
                        transition: 'transform 0.3s ease-out'
                    }}
                >
                    {/* Resize Handle */}
                    {!isMobile && (
                        <div
                            onMouseDown={(e: React.MouseEvent) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startWidth = sidebarWidth;

                                const onMouseMove = (moveEvent: MouseEvent) => {
                                    const deltaX = startX - moveEvent.clientX;
                                    const newWidth = Math.max(320, Math.min(800, startWidth + deltaX));
                                    setSidebarWidth(newWidth);
                                };

                                const onMouseUp = (upEvent: MouseEvent) => {
                                    const deltaX = startX - upEvent.clientX;
                                    const newWidth = Math.max(320, Math.min(800, startWidth + deltaX));
                                    localStorage.setItem('kk_chat_width', newWidth.toString());
                                    document.removeEventListener('mousemove', onMouseMove);
                                    document.removeEventListener('mouseup', onMouseUp);
                                };

                                document.addEventListener('mousemove', onMouseMove);
                                document.addEventListener('mouseup', onMouseUp);
                            }}
                            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-[var(--primary)] transition-colors z-50"
                        />
                    )}

                    {/* Session Header */}
                    <div className={`relative z-10 flex flex-col bg-[var(--bg-secondary)] border-b border-[var(--border-light)] shrink-0 ${isMobile ? 'pt-3' : 'pt-4'}`}>
                        <div className="flex items-center justify-between px-4 pb-3">
                            {/* Left: Active Session Title */}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                                <button
                                    onClick={() => handleRenameSession(activeSessionId)}
                                    className="flex items-center gap-2 max-w-full group hover:bg-[var(--toolbar-hover)] px-2 py-1 rounded-lg transition-colors cursor-text"
                                    title="点击重命名"
                                >
                                    <MessageSquare size={16} className="text-[var(--primary)] shrink-0" />
                                    <span className="font-medium text-sm text-[var(--text-primary)] truncate">
                                        {activeSession?.title || '新对话'}
                                    </span>
                                </button>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-1 shrink-0 ml-4 mb-2">
                                <button
                                    onClick={handleNewSession}
                                    className="p-1.5 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--primary-light)] rounded-md transition-colors"
                                    title="新建对话"
                                >
                                    <Plus size={18} />
                                </button>
                                <button
                                    onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                                    className={`p-1.5 flex items-center justify-center rounded-md transition-colors ${showHistoryPanel ? 'text-[var(--primary)] bg-[var(--primary-light)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)]'}`}
                                    title="历史记录与分支"
                                >
                                    <Layout size={18} />
                                </button>
                                <div className="w-px h-4 bg-white/10 mx-1 border-[var(--border-light)]" />
                                <button
                                    onClick={onToggle}
                                    className="p-1.5 flex items-center justify-center text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                                    title="关闭侧边栏"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Expandable History Panel */}
                        {showHistoryPanel && (
                            <div className="flex flex-col border-t border-[var(--border-light)] bg-[var(--bg-tertiary)]/30 max-h-[40vh] overflow-hidden">
                                {/* Panel Controls */}
                                <div className="flex items-center px-4 py-2 gap-2 border-b border-white/5">
                                    <input
                                        ref={sessionImportRef}
                                        type="file"
                                        accept="application/json"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleImportSessions(file);
                                            e.currentTarget.value = '';
                                        }}
                                    />
                                    <div className="relative flex-1 min-w-0">
                                        <input
                                            value={sessionSearch}
                                            onChange={(e) => setSessionSearch(e.target.value)}
                                            placeholder="搜索历史记录..."
                                            className="w-full h-7 pl-8 pr-2 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-light)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--primary)] transition-colors"
                                        />
                                        <div className="absolute left-2.5 top-1.5 text-[var(--text-tertiary)] pointer-events-none">
                                            <Search size={14} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={handleExportSessions}
                                            className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                            title="导出全部会话"
                                        >
                                            <Download size={14} />
                                        </button>
                                        <button
                                            onClick={() => sessionImportRef.current?.click()}
                                            className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                            title="导入会话"
                                        >
                                            <Upload size={14} />
                                        </button>
                                        <button
                                            onClick={() => setShowArchived(prev => !prev)}
                                            className={`p-1.5 rounded-md transition-colors ${showArchived ? 'bg-amber-500/20 text-amber-300' : 'hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                                            title={showArchived ? "隐藏已归档" : "显示已归档"}
                                        >
                                            <Archive size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Tree List */}
                                <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
                                    {sessionTreeRows.map(row => (
                                        <div
                                            key={row.session.id}
                                            className="flex items-center group py-1"
                                            style={{ paddingLeft: `${row.depth * 16}px` }}
                                        >
                                            {/* Parent toggle */}
                                            <div className="w-5 flex justify-center shrink-0">
                                                {row.hasChildren ? (
                                                    <button
                                                        onClick={() => toggleSessionExpand(row.session.id)}
                                                        className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-0.5 rounded transition-colors"
                                                    >
                                                        {(expandedNodes[row.session.id] ?? (row.depth === 0 || activeBranchTrail.some(p => p.id === row.session.id))) ? (
                                                            <ChevronDown size={14} />
                                                        ) : (
                                                            <ChevronRight size={14} />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="w-1 h-1 rounded-full bg-white/10 opacity-50" />
                                                )}
                                            </div>

                                            {/* Item Content */}
                                            <button
                                                onClick={() => handleSwitchSession(row.session.id)}
                                                onContextMenu={(e) => {
                                                    e.preventDefault();
                                                    setSessionContextMenu({ x: e.clientX, y: e.clientY, sessionId: row.session.id });
                                                }}
                                                className={`flex-1 flex flex-col text-left px-2 py-1.5 min-w-0 rounded-lg border border-transparent transition-colors ${row.session.id === activeSessionId
                                                    ? 'bg-[var(--primary-light)] text-[var(--primary)] border-[var(--primary)]/30'
                                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                                                    }`}
                                            >
                                                <div className="truncate text-xs font-medium">
                                                    {row.session.parentSessionId && <span className="text-emerald-500/80 mr-1 text-[10px]">🌿</span>}
                                                    {row.session.title || '新对话'}
                                                </div>
                                                <div className="truncate text-[10px] opacity-60 flex items-center justify-between mt-0.5">
                                                    <span>{formatSessionMeta(row.session)}</span>
                                                    <span>{Math.max(0, row.session.messages.filter(m => m.id !== 'welcome').length)} 条</span>
                                                </div>
                                            </button>

                                            {/* Quick Actions (Hover overlay) */}
                                            <div className="hidden group-hover:flex items-center gap-0.5 px-1 shrink-0 ml-1">
                                                <button
                                                    onClick={() => handleRenameSession(row.session.id)}
                                                    className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--primary)] hover:bg-[var(--primary-light)] transition-colors"
                                                    title="重命名"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleArchiveSession(row.session.id)}
                                                    className="p-1 rounded text-[var(--text-tertiary)] hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                                                    title={row.session.archived ? '取消归档' : '归档'}
                                                >
                                                    <Archive size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteSession(row.session.id)}
                                                    className="p-1 rounded text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                    title="删除"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {sessionTreeRows.length === 0 && (
                                        <div className="py-8 text-center text-[var(--text-tertiary)] text-xs">
                                            暂无历史记录
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Messages */}
                    <div className={`flex-1 overflow-y-auto space-y-4 scrollbar-thin ${isMobile ? 'px-3 py-3' : 'px-6 py-4'}`}>
                        {messages.map((msg, idx) => (
                            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} group`}>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${msg.role === 'user'
                                    ? 'bg-[var(--bg-tertiary)] border border-[var(--border-light)]'
                                    : 'bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-500 text-white'
                                    }`}>
                                    {msg.role === 'user' ? <User size={14} className="text-[var(--text-tertiary)]" /> : <Bot size={16} className="animate-icon-breathe" />}
                                </div>
                                <div className={`${isMobile ? 'max-w-[90%]' : 'max-w-[82%]'} flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
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

                                    {msg.id !== 'welcome' && (
                                        <div className={`flex items-center gap-1 text-[10px] transition-opacity ${isMobile
                                            ? 'opacity-85'
                                            : 'opacity-0 group-hover:opacity-100'
                                            } ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            {msg.role === 'user' && (
                                                <button
                                                    onClick={() => handleEditResend(msg)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 hover:bg-white/10"
                                                    title="编辑后重发"
                                                >
                                                    <Pencil size={12} />
                                                    {!isMobile && <span>编辑</span>}
                                                </button>
                                            )}
                                            {msg.role === 'assistant' && idx === lastAssistantIndex && (
                                                <button
                                                    onClick={() => handleRegenerateAssistant(msg.id)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-50"
                                                    disabled={isThinking}
                                                    title="重试这一轮回答"
                                                >
                                                    <RotateCcw size={12} />
                                                    {!isMobile && <span>重试</span>}
                                                </button>
                                            )}
                                            {msg.role === 'assistant' && (
                                                <button
                                                    onClick={() => handleEditFromAssistant(msg.id)}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 hover:bg-white/10"
                                                    title="编辑上一条提问"
                                                >
                                                    <Pencil size={12} />
                                                    {!isMobile && <span>编辑提问</span>}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleBranchFrom(idx)}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 hover:bg-white/10"
                                                title="从当前消息创建分支"
                                            >
                                                <GitBranch size={12} />
                                                {!isMobile && <span>分支</span>}
                                            </button>
                                            <button
                                                onClick={() => handleCopyMessage(msg)}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 hover:bg-white/10"
                                                title="复制消息文本"
                                            >
                                                {copiedMessageId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                                                {!isMobile && <span>{copiedMessageId === msg.id ? '已复制' : '复制'}</span>}
                                            </button>
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
                    <div
                        className="px-4 pb-4 pt-3 shrink-0"
                        style={isMobile ? { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' } : undefined}
                    >
                        {/* Input Area - Always visible */}
                        <div
                            className={`mb-3 px-2 rounded-xl border transition-colors ${isDropActive
                                ? 'border-blue-400/60 bg-blue-500/10'
                                : 'border-transparent'
                                }`}
                            onDragEnter={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDropActive(true);
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!isDropActive) setIsDropActive(true);
                            }}
                            onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (e.currentTarget === e.target) {
                                    setIsDropActive(false);
                                }
                            }}
                            onDrop={handleDropToAttach}
                        >
                            <textarea
                                ref={inputRef}
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
                                onPaste={handleInputPaste}
                                autoFocus
                            />
                            {isDropActive && (
                                <div className="mt-2 text-[11px] text-blue-300">
                                    松开鼠标即可添加图片/视频/文档作为参考
                                </div>
                            )}
                        </div>

                        {/* Attachments Preview */}
                        {attachments.length > 0 && (
                            <div className="flex flex-nowrap gap-2 mb-3 px-2 overflow-x-auto scrollbar-thin pb-1">
                                {attachments.map(att => (
                                    <div key={att.id} className="relative group shrink-0">
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
                                            className={`absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center transition-opacity ${isMobile ? 'opacity-95' : 'opacity-0 group-hover:opacity-100'}`}
                                        >
                                            <X size={10} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Bottom Toolbar */}
                        <div className={isMobile ? 'grid grid-cols-[1fr_auto] gap-2' : 'flex items-center gap-2'}>
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
                                className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[var(--toolbar-hover)] transition-colors active:scale-95 ${isMobile ? 'col-start-1 row-start-2 justify-self-start' : ''}`}
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
                                className={`px-2.5 min-h-[44px] flex items-center gap-1.5 justify-center rounded-lg border transition-all active:scale-95 ${isMobile ? 'col-start-2 row-start-2 justify-self-end' : ''} ${agentMode
                                    ? 'bg-violet-500/15 border-violet-400/30 text-violet-300 hover:bg-violet-500/25'
                                    : 'border-transparent hover:bg-[var(--toolbar-hover)] text-[var(--text-secondary)]'
                                    }`}
                                title={agentMode ? 'Agent 已开启：可自动路由问答/生成图/改图/文档任务' : '开启 Agent 增强模式'}
                            >
                                <Bot size={16} className={agentMode ? 'animate-pulse' : ''} />
                                <span className="text-xs font-medium">Agent</span>
                                <span className="text-[10px] opacity-80">{agentMode ? 'ON' : 'OFF'}</span>
                            </button>

                            {/* Model Selector */}
                            <div className={`relative min-w-0 ${isMobile ? 'col-start-1 row-start-1' : 'flex-1'}`}>
                                <button
                                    ref={modelMenuButtonRef}
                                    onClick={() => {
                                        registerActivity();
                                        if (availableModels.length === 0) {
                                            onOpenSettings?.('api-management');
                                        } else {
                                            if (!showModelMenu) {
                                                updateModelMenuLayout();
                                            }
                                            setShowModelMenu(!showModelMenu);
                                        }
                                    }}
                                    className="w-full py-1.5 px-3 min-h-[44px] gap-2 transition-all flex items-center justify-center rounded-lg hover:bg-[var(--toolbar-hover)] active:bg-[var(--bg-tertiary)] text-sm"
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
                                        {ReactDOM.createPortal(
                                            <>
                                                <div className="fixed inset-0 z-[10000]" onClick={() => setShowModelMenu(false)} />

                                                {modelMenuLayout && (
                                                    <div
                                                        className="fixed z-[10001] flex flex-col gap-2"
                                                        style={{
                                                            left: `${modelMenuLayout.left}px`,
                                                            bottom: `${modelMenuLayout.bottom}px`,
                                                            width: `${modelMenuLayout.width}px`,
                                                            maxWidth: 'calc(100vw - 1rem)'
                                                        }}
                                                    >
                                                        <div className="flex flex-col gap-2">
                                                            {/* Search Module */}
                                                            <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl shadow-xl p-2 relative z-30">
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
                                                            <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl shadow-2xl p-1.5 max-h-[50vh] overflow-y-auto overflow-x-hidden scrollbar-thin relative z-30">
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
                                                                                <span className="mt-0.5 text-base relative shrink-0">
                                                                                    {model.icon || '🤖'}
                                                                                    {isPinned && <span className="absolute -top-1 -right-1 text-[8px]">📌</span>}
                                                                                </span>
                                                                                <div className="flex flex-col gap-0.5 w-full min-w-0">
                                                                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                                                                        <span className={`font-medium truncate min-w-0 ${selectedModel.id === model.id ? getModelDisplayInfo(model).badgeColor : 'text-[var(--text-primary)]'}`}>
                                                                                            {getModelDisplayInfo(model).displayName}
                                                                                        </span>
                                                                                        {getModelDisplayInfo(model).badgeText && (
                                                                                            <span
                                                                                                className={`text-[10px] px-1.5 py-0.5 rounded border opacity-80 shrink-0 ${getModelDisplayInfo(model).badgeColor}`}
                                                                                                style={{ whiteSpace: 'nowrap' }}
                                                                                            >
                                                                                                {getModelDisplayInfo(model).badgeText}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="text-[10px] opacity-70 leading-tight truncate min-w-0">{advantage}</span>
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
                                                    </div>
                                                )}
                                            </>,
                                            document.body
                                        )}

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
                            {isThinking ? (
                                <button
                                    onClick={handleStopGeneration}
                                    className={`min-w-[44px] min-h-[44px] rounded-full cursor-pointer flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-transform active:scale-95 ${isMobile ? 'col-start-2 row-start-1' : ''}`}
                                    title="停止生成"
                                >
                                    <Square size={14} />
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        if (input.trim() || attachments.length > 0) {
                                            handleSend();
                                        }
                                    }}
                                    className={`min-w-[44px] min-h-[44px] rounded-full cursor-pointer flex items-center justify-center bg-[var(--text-tertiary)] text-white hover:bg-[var(--text-secondary)] transition-transform active:scale-95 ${isMobile ? 'col-start-2 row-start-1' : ''}`}
                                >
                                    <ArrowUp size={18} />
                                </button>
                            )}
                        </div>

                    </div>
                </div >
            )}
            {sessionContextMenu && ReactDOM.createPortal(
                <div
                    className="fixed z-[10020] bg-[#2a2a2e] border border-white/10 rounded-lg shadow-xl py-1 w-40 backdrop-blur-md"
                    style={{ top: sessionContextMenu.y, left: sessionContextMenu.x }}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleRenameSession(sessionContextMenu.sessionId);
                            setSessionContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10"
                    >
                        重命名
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateSession(sessionContextMenu.sessionId);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10"
                    >
                        复制分支
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleToggleArchiveSession(sessionContextMenu.sessionId);
                            setSessionContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10"
                    >
                        归档/取消归档
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(sessionContextMenu.sessionId);
                            setSessionContextMenu(null);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
                    >
                        删除会话
                    </button>
                </div>,
                document.body
            )}
            {importPreview && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[10030] bg-black/50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-xl border border-white/10 bg-[var(--bg-secondary)] shadow-2xl p-4">
                        <div className="text-sm font-medium text-[var(--text-primary)] mb-2">导入预览</div>
                        <div className="text-xs text-[var(--text-secondary)] space-y-1 mb-4">
                            <div>导入会话: {importPreview.stats.imported}</div>
                            <div>新会话(ID): {importPreview.stats.newById}</div>
                            <div>ID 冲突: {importPreview.stats.conflictsById}</div>
                            <div>内容重复(指纹): {importPreview.stats.duplicatesByFingerprint}</div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2">
                            <input
                                value={importPreviewSearch}
                                onChange={(e) => setImportPreviewSearch(e.target.value)}
                                placeholder="搜索导入明细..."
                                className="h-8 w-full sm:w-auto sm:flex-1 px-2 rounded-lg border border-white/10 bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setImportPreviewShowAll(prev => !prev)}
                                    className="flex-1 sm:flex-none h-8 px-2 rounded-lg border border-white/10 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--toolbar-hover)] whitespace-nowrap"
                                >
                                    {importPreviewShowAll ? '收起' : '查看全部'}
                                </button>
                                <button
                                    onClick={() => setImportPreviewOnlyExcluded(prev => !prev)}
                                    className={`flex-1 sm:flex-none h-8 px-2 rounded-lg border text-[11px] whitespace-nowrap transition-colors ${importPreviewOnlyExcluded
                                        ? 'border-red-400/40 bg-red-500/15 text-red-200'
                                        : 'border-white/10 text-[var(--text-secondary)] hover:bg-[var(--toolbar-hover)]'
                                        }`}
                                >
                                    {importPreviewOnlyExcluded ? '显示全部' : '只看已勾选'}
                                </button>
                            </div>
                        </div>
                        {(() => {
                            const q = importPreviewSearch.trim().toLowerCase();
                            const conflictSet = new Set(importPreview.stats.conflictIds);
                            const duplicateSet = new Set(importPreview.stats.duplicateIds);
                            const newSet = new Set(importPreview.stats.newIds);
                            const filtered = importPreview.sessions.filter(session => {
                                if (!q) return true;
                                return getSessionLabel(session).toLowerCase().includes(q);
                            }).filter(session => importPreviewOnlyExcluded ? importExcludedIds.includes(session.id) : true);
                            const visible = importPreviewShowAll ? filtered : filtered.slice(0, 10);

                            return (
                                <div className="mb-3 border border-white/10 rounded-lg p-2 max-h-44 overflow-y-auto scrollbar-thin">
                                    <div className="text-[10px] text-[var(--text-tertiary)] mb-2">排除项（勾选后不导入）</div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <button
                                            onClick={() => setImportExcludedIds(visible.map(s => s.id))}
                                            className="text-[10px] px-2 py-1 rounded border border-white/10 hover:bg-[var(--toolbar-hover)]"
                                        >全选可见</button>
                                        <button
                                            onClick={() => setImportExcludedIds([])}
                                            className="text-[10px] px-2 py-1 rounded border border-white/10 hover:bg-[var(--toolbar-hover)]"
                                        >清空排除</button>
                                        <span className="text-[10px] text-[var(--text-tertiary)]">已排除 {importExcludedIds.length} 条</span>
                                    </div>
                                    <div className="space-y-1">
                                        {visible.map(session => {
                                            const checked = importExcludedIds.includes(session.id);
                                            return (
                                                <label key={`exclude-${session.id}`} className="flex items-center gap-2 text-[10px] cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            setImportExcludedIds(prev => e.target.checked
                                                                ? [...prev, session.id]
                                                                : prev.filter(id => id !== session.id));
                                                        }}
                                                    />
                                                    <span className="flex-1 truncate text-[var(--text-secondary)]">{getSessionLabel(session)}</span>
                                                    {newSet.has(session.id) && <span className="px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-200">添加</span>}
                                                    {conflictSet.has(session.id) && <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-200">冲突</span>}
                                                    {duplicateSet.has(session.id) && <span className="px-1 py-0.5 rounded bg-blue-500/20 text-blue-200">重复</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                        <div className="space-y-2 mb-4 max-h-40 overflow-y-auto scrollbar-thin">
                            {importPreview.stats.newTitles.length > 0 && (() => {
                                const list = importPreview.stats.newTitles.filter(name => name.toLowerCase().includes(importPreviewSearch.toLowerCase()));
                                const visible = importPreviewShowAll ? list : list.slice(0, 8);
                                return visible.length > 0 && (
                                    <div>
                                        <div className="text-[10px] text-emerald-300 mb-1">将添加</div>
                                        <div className="text-[10px] text-[var(--text-secondary)] space-y-0.5">
                                            {visible.map((name, idx) => <div key={`new-${idx}`}>{name}</div>)}
                                        </div>
                                    </div>
                                );
                            })()}
                            {importPreview.stats.conflictTitles.length > 0 && (() => {
                                const list = importPreview.stats.conflictTitles.filter(name => name.toLowerCase().includes(importPreviewSearch.toLowerCase()));
                                const visible = importPreviewShowAll ? list : list.slice(0, 8);
                                return visible.length > 0 && (
                                    <div>
                                        <div className="text-[10px] text-amber-300 mb-1">ID冲突</div>
                                        <div className="text-[10px] text-[var(--text-secondary)] space-y-0.5">
                                            {visible.map((name, idx) => <div key={`conf-${idx}`}>{name}</div>)}
                                        </div>
                                        {importPreview.stats.conflictPairs.length > 0 && (
                                            <div className="mt-1 text-[9px] text-[var(--text-tertiary)] space-y-0.5">
                                                {importPreview.stats.conflictPairs
                                                    .filter(pair => `${pair.incoming} ${pair.existing}`.toLowerCase().includes(importPreviewSearch.toLowerCase()))
                                                    .slice(0, importPreviewShowAll ? 20 : 4)
                                                    .map((pair, idx) => (
                                                        <div key={`conf-pair-${idx}`} className="truncate">{pair.incoming} → {pair.existing}</div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                            {importPreview.stats.duplicateTitles.length > 0 && (() => {
                                const list = importPreview.stats.duplicateTitles.filter(name => name.toLowerCase().includes(importPreviewSearch.toLowerCase()));
                                const visible = importPreviewShowAll ? list : list.slice(0, 8);
                                return visible.length > 0 && (
                                    <div>
                                        <div className="text-[10px] text-blue-300 mb-1">内容疑似重复</div>
                                        <div className="text-[10px] text-[var(--text-secondary)] space-y-0.5">
                                            {visible.map((name, idx) => <div key={`dup-${idx}`}>{name}</div>)}
                                        </div>
                                        {importPreview.stats.duplicatePairs.length > 0 && (
                                            <div className="mt-1 text-[9px] text-[var(--text-tertiary)] space-y-0.5">
                                                {importPreview.stats.duplicatePairs
                                                    .filter(pair => `${pair.incoming} ${pair.existing}`.toLowerCase().includes(importPreviewSearch.toLowerCase()))
                                                    .slice(0, importPreviewShowAll ? 20 : 4)
                                                    .map((pair, idx) => (
                                                        <div key={`dup-pair-${idx}`} className="truncate">{pair.incoming} → {pair.existing}</div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="grid grid-cols-1 gap-2 mb-3">
                            <button
                                onClick={() => applyImportMode('smart')}
                                className="w-full py-2 rounded-lg bg-blue-500/20 border border-blue-400/40 text-blue-200 text-sm hover:bg-blue-500/30"
                            >
                                智能合并（推荐）
                            </button>
                            <button
                                onClick={() => applyImportMode('append')}
                                className="w-full py-2 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-sm hover:bg-emerald-500/25"
                            >
                                追加保留当前
                            </button>
                            <button
                                onClick={() => applyImportMode('replace')}
                                className="w-full py-2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-200 text-sm hover:bg-amber-500/25"
                            >
                                覆盖当前
                            </button>
                        </div>
                        <button
                            onClick={() => {
                                setImportPreview(null);
                                setImportPreviewSearch('');
                                setImportPreviewShowAll(false);
                                setImportExcludedIds([]);
                                setImportPreviewOnlyExcluded(false);
                            }}
                            className="w-full py-2 rounded-lg border border-white/10 text-[var(--text-secondary)] text-sm hover:bg-[var(--toolbar-hover)]"
                        >
                            取消
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ChatSidebar;


