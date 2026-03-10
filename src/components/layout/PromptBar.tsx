import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { GenerationConfig, AspectRatio, ImageSize, GenerationMode, ModelType } from '../../types';
import { modelRegistry, ActiveModel } from '../../services/model/modelRegistry';
import { keyManager, getModelMetadata } from '../../services/auth/keyManager'; // Added getter
import { getModelCapabilities, modelSupportsGrounding, getModelDisplayInfo, getModelDescription, getModelThemeColor, getModelThemeBgColor, getModelDisplayName } from '../../services/model/modelCapabilities';
import ModelLogo from '../common/ModelLogo';
import { getModelBadgeInfo, getProviderBadgeColor, getProviderBadgeStyle } from '../../utils/modelBadge';
import { calculateImageHash } from '../../utils/imageUtils';
import { saveImage, getImage } from '../../services/storage/imageStorage'; // [NEW] Import getImage
import { fileSystemService } from '../../services/storage/fileSystemService'; // 🚀 参考图持久化
import { notify } from '../../services/system/notificationService';
import ImageOptionsPanel from '../image/ImageOptionsPanel';
import VideoOptionsPanel from '../video/VideoOptionsPanel';
import ImagePreview from '../image/ImagePreview';
import { sortModels, toggleModelPin, getPinnedModels, filterAndSortModels } from '../../utils/modelSorting';
import { X, Search, LayoutDashboard, Key, DollarSign, HardDrive, ScrollText, ChevronRight, ChevronUp, Activity, AlertTriangle, Plus, Trash2, FolderOpen, Globe, Loader2, RefreshCw, Copy, Check, Pause, Play, Zap, Mic, Camera, Brain, Video, Star, Sparkles, ArrowUp, Wand2 } from 'lucide-react'; // [NEW] Mobile Icons & Star & Sparkles & Wand2
import { InpaintModal } from '../image/InpaintModal';
import { BUILTIN_PROMPT_LIBRARY, PromptLibraryItem } from '../../config/promptLibrary';
import { useBilling } from '../../context/BillingContext';
import { useAuth } from '../../context/AuthContext';
import { calculateCost } from '../../services/billing/costService';
import { isCreditBasedModel, getModelCredits } from '../../services/model/modelPricing';
import PromptBarTopRow from './prompt-bar/PromptBarTopRow';
import PromptBarFooter from './prompt-bar/PromptBarFooter';


// [FIX] Robust Image Component that self-heals from Storage if data is missing
const ReferenceThumbnail: React.FC<{
    image: { id: string, data?: string, mimeType?: string, storageId?: string, url?: string };
    onClick?: (e: React.MouseEvent<HTMLDivElement>, resolvedSrc: string) => void;
    onRecovered?: (payload: { id: string; data: string; mimeType?: string; storageId?: string }) => void;
}> = ({ image, onClick, onRecovered }) => {
    const [data, setData] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        // 🚀 [Fix] If parent provided data and it's NOT a blob URL, use it directly
        // Blob URLs can expire after page refresh, so we should always try to recover from IDB
        if (image.data && !image.data.startsWith('blob:')) {
            setData(image.data);
            setLoading(false);
            setError(false);
            return;
        }

        // If no storageId, try using data directly (even if blob) or mark as error
        if (!image.storageId) {
            if (image.data || image.url) {
                setData(image.data || image.url);
                setLoading(false);
                setError(false);
            } else {
                setLoading(false);
                setError(true);
            }
            return;
        }

        // Try to recover from IDB
        let active = true;
        setLoading(true);
        setError(false);

        getImage(image.storageId)
            .then(cached => {
                if (active) {
                    if (cached) {
                        setData(cached);
                        if (!cached.startsWith('blob:') && cached !== image.data) {
                            onRecovered?.({
                                id: image.id,
                                data: cached,
                                mimeType: image.mimeType,
                                storageId: image.storageId,
                            });
                        }
                    } else if (image.data || image.url) {
                        setData(image.data || image.url);
                    } else {
                        setError(true); // truly missing
                    }
                    setLoading(false);
                }
            })
            .catch(() => {
                if (active) {
                    if (image.data || image.url) {
                        setData(image.data || image.url);
                    } else {
                        setError(true);
                    }
                    setLoading(false);
                }
            });

        return () => { active = false; };
    }, [image.data, image.url, image.storageId, image.id, image.mimeType, onRecovered]);

    if (error) {
        return (
            <div className="w-12 h-12 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center justify-center flex-col gap-0.5" title="图片加载失败">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 opacity-70">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            </div>
        );
    }

    if (loading || !data) {
        return (
            <div className="w-12 h-12 rounded-lg border border-white/10 shadow-sm bg-[var(--bg-tertiary)] flex items-center justify-center">
                <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
        );
    }

    // Robust Src Construction
    const src = (data.startsWith('data:') || data.startsWith('blob:')) ? data : `data:${image.mimeType || 'image/png'};base64,${data}`;

    return (
        <div
            onClick={(e) => onClick?.(e, src)}
            className="w-12 h-12 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
            title="点击放大查看"
        >
            <img
                src={src}
                className="w-full h-full object-cover"
                alt="参考图"
            />
        </div>
    );
};

// 计算比例图标的尺寸
const getRatioDimensions = (ratio: AspectRatio): { width: number; height: number } => {
    const maxSize = 14;

    const ratioMap: Record<string, [number, number]> = {
        [AspectRatio.SQUARE]: [1, 1],
        [AspectRatio.PORTRAIT_9_16]: [9, 16],
        [AspectRatio.LANDSCAPE_16_9]: [16, 9],
        [AspectRatio.PORTRAIT_3_4]: [3, 4],
        [AspectRatio.LANDSCAPE_4_3]: [4, 3],
        [AspectRatio.LANDSCAPE_3_2]: [3, 2],
        [AspectRatio.PORTRAIT_2_3]: [2, 3],
        [AspectRatio.LANDSCAPE_5_4]: [5, 4],
        [AspectRatio.PORTRAIT_4_5]: [4, 5],
        [AspectRatio.LANDSCAPE_21_9]: [21, 9],
        [AspectRatio.PORTRAIT_9_21]: [9, 21],
        [AspectRatio.LANDSCAPE_4_1]: [4, 1],
        [AspectRatio.PORTRAIT_1_4]: [1, 4],
        [AspectRatio.LANDSCAPE_8_1]: [8, 1],
        [AspectRatio.PORTRAIT_1_8]: [1, 8]
    };

    const [w, h] = ratioMap[ratio] || [1, 1];

    if (w > h) {
        return { width: maxSize, height: (maxSize * h) / w };
    } else {
        return { height: maxSize, width: (maxSize * w) / h };
    }
};

// 渲染比例图标
const getRatioIcon = (ratio: AspectRatio) => {
    const dims = getRatioDimensions(ratio);

    return (
        <div className="flex items-center justify-center" style={{ width: 14, height: 14 }}>
            <div
                className="border-[1.5px] border-current rounded-[2px]"
                style={{ width: dims.width, height: dims.height }}
            />
        </div>
    );
};

/**
 * 🚀 [统一] 颜色格式标准化函数
 * 确保触发按钮、下拉列表、发送按钮的颜色渲染完全一致
 * 支持 HEX (带/不带 #)、HSL、rgb() 等格式
 */
function normalizeColor(color: string | undefined, fallback: string): string {
    if (!color || color === 'undefined' || color === 'null' || color.trim() === '') {
        return fallback;
    }
    const trimmed = color.trim();
    // 已经是合法 CSS 颜色格式（hsl/rgb/rgba/var 等），直接返回
    if (trimmed.startsWith('hsl') || trimmed.startsWith('rgb') || trimmed.startsWith('var')) {
        return trimmed;
    }
    // HEX 格式：确保有 # 前缀
    if (trimmed.startsWith('#')) {
        return trimmed;
    }
    // 纯 hex 数字（无 # 前缀），补上 #
    if (/^[A-Fa-f0-9]{3,8}$/.test(trimmed)) {
        return `#${trimmed}`;
    }
    // 其他情况原样返回（可能是合法的 CSS 颜色名 如 'orange'）
    return trimmed;
}

function normalizeModelTextColor(textColor: string | undefined): string {
    return textColor === 'black' ? '#111827' : '#ffffff';
}

// 🚀 [添加] 积分专属发送按钮组件
interface CreditSendButtonProps {
    isCreditModel: boolean;
    creditCost: number;
    balance: number;
    hasPrompt: boolean;
    colorStart?: string;
    colorEnd?: string;
    onClick: () => void;
}

const CreditSendButton: React.FC<CreditSendButtonProps> = ({
    isCreditModel,
    creditCost,
    balance,
    hasPrompt,
    colorStart,
    colorEnd,
    onClick
}) => {
    // 判断积分是否不足
    const isInsufficient = isCreditModel && creditCost > 0 && balance < creditCost;

    // 计算是否禁用
    const isDisabled = !hasPrompt;

    // 🚀 [积分模型专属] 使用模型主题色的渐变样式 - 更精致的玻璃态效果
    const getGradientStyle = () => {
        if (!isCreditModel || isDisabled) return {};
        const start = normalizeColor(colorStart, '#3B82F6');
        const end = normalizeColor(colorEnd, '#2563EB');
        return {
            background: `linear-gradient(135deg, ${start} 0%, ${end} 100%)`,
            boxShadow: `0 2px 8px 0 ${start}50, inset 0 1px 0 0 rgba(255,255,255,0.2)`
        };
    };

    // 🚀 [普通模型/禁用状态] 样式
    const getDefaultStyle = () => {
        if (isDisabled) {
            return { className: 'bg-gray-100 dark:bg-zinc-800/50 cursor-not-allowed opacity-50' };
        }
        if (isInsufficient) {
            return { className: 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20' };
        }

        // 如果有自定义颜色，则使用自定义渐变，否则使用默认类
        if (colorStart || colorEnd) {
            const start = normalizeColor(colorStart, '#3B82F6');
            const end = normalizeColor(colorEnd, '#2563EB');
            return {
                className: 'text-white shadow-md hover:shadow-lg transition-shadow',
                style: {
                    background: `linear-gradient(135deg, ${start} 0%, ${end} 100%)`,
                    boxShadow: `0 2px 8px 0 ${start}40`
                }
            };
        }
        return { className: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30' };
    };

    // 🚀 [动画] 箭头从左到右的滑动动画关键帧
    const arrowAnimStyle = `
        @keyframes arrow-slide-right {
            0% { transform: translateX(-3px); opacity: 0.4; }
            50% { transform: translateX(2px); opacity: 1; }
            100% { transform: translateX(-3px); opacity: 0.4; }
        }
    `;

    // 如果是积分模型且有提示词，使用胶囊渐变样式
    if (isCreditModel && hasPrompt && !isInsufficient) {
        return (
            <>
                <style>{arrowAnimStyle}</style>
                <button
                    onClick={onClick}
                    className="group relative h-10 pl-3.5 pr-1 rounded-full flex items-center gap-2 ml-auto transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:-translate-y-0.5"
                    style={getGradientStyle()}
                >
                    {/* 积分消耗显示 */}
                    <div className="flex items-center gap-1 text-white/95">
                        <Sparkles size={14} className="animate-pulse" fill="currentColor" />
                        <span className="text-sm font-bold tabular-nums">{creditCost}</span>
                    </div>

                    {/* 分隔线 */}
                    <div className="w-px h-4 bg-white/25" />

                    {/* 发送箭头按钮 - 内嵌圆形按钮 🚀 箭头朝右 + 滑动动画 */}
                    <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center transition-all duration-200 group-hover:bg-white/35 group-hover:scale-105 backdrop-blur-sm overflow-hidden">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white transition-transform duration-300 group-hover:translate-x-0.5" style={{ animation: 'arrow-slide-right 1.5s ease-in-out infinite' }}>
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                        </svg>
                    </div>

                    {/* 悬停提示 - 精确居中于整个按钮 */}
                    <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none">
                        <div className="px-3 py-1.5 bg-black/85 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap scale-95 group-hover:scale-100">
                            消耗 {creditCost} 积分生成
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/85 rotate-45" />
                        </div>
                    </div>
                </button>
            </>
        );
    }

    // 🚀 [普通状态/禁用状态] 默认样式 - 用户 API 模型只显示"发送"
    const defaultStyleProps = getDefaultStyle() as any;

    return (
        <>
            <style>{arrowAnimStyle}</style>
            <button
                onClick={onClick}
                disabled={isDisabled}
                className={`
                    group relative h-10 px-1 py-1 rounded-full flex flex-row items-center whitespace-nowrap shrink-0 ml-auto transition-all duration-200
                    ${defaultStyleProps.className || ''}
                `}
                style={{ paddingRight: '4px', ...(defaultStyleProps.style || {}) }}
            >
                <div className="flex items-center gap-2 px-3">
                    {isCreditModel && creditCost > 0 ? (
                        <div className="flex items-center gap-1.5">
                            <Sparkles size={14} fill="currentColor" className={isDisabled ? 'text-gray-400' : isInsufficient ? 'text-red-500' : 'text-white'} />
                            <span className={`text-sm font-bold ${isDisabled ? 'text-gray-400' : isInsufficient ? 'text-red-500' : 'text-white'}`}>
                                {isInsufficient ? '积分不足' : creditCost}
                            </span>
                        </div>
                    ) : (
                        <span className={`text-sm font-bold ${isDisabled ? 'text-gray-400' : isInsufficient ? 'text-red-500' : 'text-white'}`}>
                            发送
                        </span>
                    )}
                </div>

                {/* 发送箭头 🚀 箭头朝右 + 动画 */}
                <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden
                    ${isDisabled
                        ? 'bg-gray-300 dark:bg-zinc-700 text-gray-500'
                        : isInsufficient
                            ? 'bg-red-500 text-white'
                            : 'bg-white/20 text-white group-hover:scale-110'
                    }
                `}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className="transition-transform duration-300 group-hover:translate-x-0.5"
                        style={!isDisabled ? { animation: 'arrow-slide-right 1.5s ease-in-out infinite' } : undefined}
                    >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                    </svg>
                </div>
            </button>
        </>
    );
};

interface PromptBarProps {
    config: GenerationConfig;
    setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
    onGenerate: () => void;
    isGenerating: boolean;
    onFilesDrop?: (files: File[]) => void;
    activeSourceImage?: { id: string; url: string; prompt: string } | null;
    onClearSource?: () => void;
    onCancel?: () => void;
    isMobile?: boolean;
    onOpenSettings?: (view?: 'api-management') => void;
    onInteract?: () => void;
    onFocus?: () => void;  // 输入框获取焦点时调用
    onBlur?: () => void;   // 输入框失去焦点时调用
    onOpenMore?: () => void; // [NEW] Mobile More Menu
}

const PromptBar: React.FC<PromptBarProps> = ({ config, setConfig, onGenerate, isGenerating, onFilesDrop, activeSourceImage, onClearSource, onCancel, isMobile = false, onOpenSettings, onInteract, onFocus, onBlur, onOpenMore }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [modelSearch, setModelSearch] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, modelId: string } | null>(null);

    // [NEW] Model Settings Modal State
    const [modelSettingsModal, setModelSettingsModal] = useState<{ modelId: string; alias: string; description: string } | null>(null);

    // [NEW] Model Customizations (stored in localStorage)
    const [modelCustomizations, setModelCustomizations] = useState<Record<string, { alias?: string; description?: string }>>(() => {
        try {
            const stored = localStorage.getItem('kk_model_customizations');
            return stored ? JSON.parse(stored) : {};
        } catch { return {}; }
    });

    // Save model customizations to localStorage
    const saveModelCustomization = (modelId: string, alias: string, description: string) => {
        const newCustomizations = {
            ...modelCustomizations,
            [modelId]: { alias: alias.trim() || undefined, description: description.trim() || undefined }
        };
        // Clean up empty entries
        if (!newCustomizations[modelId].alias && !newCustomizations[modelId].description) {
            delete newCustomizations[modelId];
        }
        setModelCustomizations(newCustomizations);
        localStorage.setItem('kk_model_customizations', JSON.stringify(newCustomizations));
    };

    // [NEW] Drag-to-Reorder State
    const [dragSourceId, setDragSourceId] = useState<string | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

    // [NEW] Flying Animation State
    const [flyingImage, setFlyingImage] = useState<{
        x: number;
        y: number;
        url: string;
        targetX: number;
        targetY: number;
    } | null>(null);

    // [NEW] 参考图放大状态
    const [previewImage, setPreviewImage] = useState<{ url: string; originRect: DOMRect } | null>(null);
    const [inpaintImage, setInpaintImage] = useState<{ url: string } | null>(null); // [NEW] 局部重绘所需图像

    const refContainerRef = useRef<HTMLDivElement>(null);
    const optionsPanelRef = useRef<HTMLDivElement>(null); // [NEW] Ref for options panel

    // 状态：选项面板显示
    const [showOptionsPanel, setShowOptionsPanel] = useState(false);
    const [showPromptLibrary, setShowPromptLibrary] = useState(false);
    const [showPptOutlinePanel, setShowPptOutlinePanel] = useState(false);
    const [pptOutlineDraft, setPptOutlineDraft] = useState('');
    const [pptDragIndex, setPptDragIndex] = useState<number | null>(null);
    const [pptDropIndex, setPptDropIndex] = useState<number | null>(null);
    const [promptLibrarySearch, setPromptLibrarySearch] = useState('');
    const [promptLibraryCategory, setPromptLibraryCategory] = useState<'all' | PromptLibraryItem['category']>('all');
    const [favoritePromptIds, setFavoritePromptIds] = useState<string[]>(() => {
        try {
            const raw = localStorage.getItem('kk_prompt_library_favorites');
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [isInputAreaHovered, setIsInputAreaHovered] = useState(false); // Phase 3: hover state
    const [uploadingCount, setUploadingCount] = useState(0); // [NEW] Uploading indicator count
    const { balance, recharge, loading: billingLoading, showRechargeModal, setShowRechargeModal } = useBilling();

    // 🚀 [NEW] 模型手动锁定标识 - 解决更换 API 或模式后自动跳第一个的需求
    const [isModelManuallyLocked, setIsModelManuallyLocked] = useState<boolean>(() => {
        try {
            return localStorage.getItem('kk_model_manually_locked') === 'true';
        } catch { return false; }
    });

    // 🚀 [Fix] 监听顶置变化事件，触发 sortedAvailableModels 重新排序
    const [pinnedVersion, setPinnedVersion] = useState(0);
    useEffect(() => {
        const handlePinChange = () => setPinnedVersion(v => v + 1);
        window.addEventListener('model-pinned-change', handlePinChange);
        return () => window.removeEventListener('model-pinned-change', handlePinChange);
    }, []);

    const setModelManualLock = (locked: boolean) => {
        setIsModelManuallyLocked(locked);
        localStorage.setItem('kk_model_manually_locked', locked ? 'true' : 'false');
    };

    // 🚀 [Deleted] enableOptimize state removed to use config.enablePromptOptimization instead

    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null); // 3-second hover delay timer
    const touchStartY = useRef<number | null>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null); // Model dropdown ref
    const modelListScrollRef = useRef<HTMLDivElement>(null); // Model list scroll container ref
    const modelListScrollPos = useRef<number>(0); // Save scroll position

    // [NEW] Click outside to close options panel
    useEffect(() => {
        if (!showOptionsPanel) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Element;
            // Check if click is outside panel AND not on the toggle button itself
            if (optionsPanelRef.current && !optionsPanelRef.current.contains(target)) {
                // Find the toggle button by checking if target is within it or is the button
                const toggleButton = document.querySelector('[data-options-toggle]');
                if (toggleButton && (toggleButton.contains(target) || toggleButton === target)) {
                    // Click was on toggle button, let onClick handle it
                    return;
                }
                setShowOptionsPanel(false);
            }
        };

        // Add a small delay to prevent immediate closing from the toggle click
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showOptionsPanel]);

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, []);

    // [NEW] Click outside to close model dropdown
    useEffect(() => {
        if (activeMenu !== 'model') return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Element;
            // Check if click is outside dropdown AND not on the model button trigger
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(target)) {
                const triggerButton = document.getElementById('models-dropdown-trigger');
                if (triggerButton && (triggerButton.contains(target) || triggerButton === target)) {
                    // Click was on trigger button, let onClick handle it
                    return;
                }
                setActiveMenu(null);
            }
        };

        // Add a small delay to prevent immediate closing from the toggle click
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
            // 恢复滚动位置
            if (modelListScrollRef.current && modelListScrollPos.current > 0) {
                modelListScrollRef.current.scrollTop = modelListScrollPos.current;
            }
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [activeMenu]);

    useEffect(() => {
        if (config.mode !== GenerationMode.PPT) {
            setShowPptOutlinePanel(false);
            return;
        }
        const slides = (config.pptSlides || []).map(s => String(s || '').trim()).filter(Boolean);
        if (slides.length > 0) {
            setPptOutlineDraft(slides.join('\n'));
            return;
        }
        const fromPrompt = (config.prompt || '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => line.replace(/^[-*\d.)、\s]+/, '').trim())
            .filter(Boolean);
        setPptOutlineDraft(fromPrompt.join('\n'));
    }, [config.mode, config.pptSlides, config.prompt]);

    // Cleanup hover timer on unmount
    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
            }
        };
    }, []);

    // Swipe Detection


    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
        onInteract?.(); // General interaction
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartY.current === null) return;
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;

        // Swipe Up (Negative delta)
        if (deltaY < -20) {
            onInteract?.();
        }
        touchStartY.current = null;
    };

    // Dynamic Model State
    const [globalModels, setGlobalModels] = useState(keyManager.getGlobalModelList());


    useEffect(() => {
        // 🚀 [Fix] 初始加载时刷新模型列表，确保获取最新的 admin models
        const refreshModels = async () => {
            try {
                const { adminModelService } = await import('../../services/model/adminModelService');
                console.log('[PromptBar] Loading admin models...');
                await adminModelService.forceLoadAdminModels?.();
                // 🚀 [Fix] 等待一小段时间确保数据已写入
                await new Promise(r => setTimeout(r, 100));
                const newModels = keyManager.getGlobalModelList();
                console.log('[PromptBar] Loaded models:', newModels.length);
                // 🚀 [Debug] 打印积分模型的颜色
                const creditModels = newModels.filter((m: any) => m.isSystemInternal);
                creditModels.forEach((m: any) => {
                    console.log(`[PromptBar] Credit model: ${m.id}, color: ${m.colorStart} -> ${m.colorEnd}`);
                });
                setGlobalModels(newModels);
            } catch (err) {
                console.error('[PromptBar] Failed to load models:', err);
            }
        };
        refreshModels();

        const unsubscribeKeyManager = keyManager.subscribe(() => {
            const newModels = keyManager.getGlobalModelList();
            setGlobalModels(newModels);
        });
        return () => {
            unsubscribeKeyManager();
        };
    }, []);

    // Get available models based on global list and current mode
    const availableModels = useMemo(() => {
        const step1 = globalModels.filter(m => m.type !== 'chat');

        const step2 = step1.map(m => {
            // Infer type for custom models
            const lowerId = m.id.toLowerCase();
            const isVideo = lowerId.includes('video') ||
                lowerId.includes('veo') ||
                lowerId.includes('kling') ||
                lowerId.includes('luma') ||
                lowerId.includes('gen-3') ||
                lowerId.includes('gen-2') ||
                lowerId.includes('hailuo') ||
                lowerId.includes('vidu');

            const isImage = lowerId.includes('image') ||
                lowerId.includes('imagen') ||
                lowerId.includes('flux') ||
                lowerId.includes('midjourney') ||
                lowerId.includes('dall-e') ||
                lowerId.includes('sd-') ||
                lowerId.includes('stable-diffusion') ||
                lowerId.includes('ideogram');

            let inferredType = m.type || (isVideo ? 'video' : (isImage ? 'image' : 'chat'));

            // 🚀 [Fix] 优先使用原始模型的颜色和管理员配置
            return {
                id: m.id,
                label: m.name || m.id,
                provider: m.provider,
                isSystemInternal: m.isSystemInternal,
                type: inferredType,
                enabled: true,
                description: m.description,
                creditCost: m.creditCost,
                colorStart: m.colorStart,
                colorEnd: m.colorEnd,
                colorSecondary: m.colorSecondary,
                textColor: m.textColor
            } as ActiveModel;
        });

        return step2.filter(m => {
            const type = m.type || 'image';
            // 🚀 [Fix] 严格按模式过滤模型类型，不掺杂其他类型
            // 🚀 [Fix] 支持多模态模型：image+chat 在 image 模式下也可用
            if (config.mode === GenerationMode.IMAGE) return type === 'image' || type === 'image+chat';
            if (config.mode === GenerationMode.PPT) return type === 'image' || type === 'image+chat';
            if (config.mode === GenerationMode.VIDEO) return type === 'video';
            if (config.mode === GenerationMode.AUDIO) return type === 'audio';
            return type === config.mode;
        });
    }, [globalModels, config.mode]);

    const sortedAvailableModels = useMemo(() => {
        return filterAndSortModels(availableModels, '', modelCustomizations);
        // 🚀 [Fix] 加入 pinnedVersion 依赖，确保顶置变化时重新排序
    }, [availableModels, modelCustomizations, pinnedVersion]);

    const getDefaultImageSizeForModel = useCallback((modelId: string): ImageSize => {
        const caps = getModelCapabilities(modelId);
        const supported = caps?.supportedSizes;
        if (!supported || supported.length === 0) return ImageSize.SIZE_1K;
        if (supported.includes(ImageSize.SIZE_1K)) return ImageSize.SIZE_1K;
        return supported[0];
    }, []);

    const getDefaultAspectForModel = useCallback((modelId: string): AspectRatio => {
        const caps = getModelCapabilities(modelId);
        const supported = caps?.supportedRatios;
        if (!supported || supported.length === 0) return AspectRatio.AUTO;
        if (supported.includes(AspectRatio.AUTO)) return AspectRatio.AUTO;
        return supported[0];
    }, []);

    // 🚀 [增强版模型自动选择逻辑]
    // 逻辑：1. 如果当前选中的模型已失效（不在当前可用列表中），则必须重新选一个。
    //       2. 如果当前模式发生变化（由 config.mode 触发），且用户并未“手动锁定”模型，则默认跳到第一个（满足“优先顶置”需求）。
    useEffect(() => {
        if (sortedAvailableModels.length === 0) return;

        const currentModelValid = sortedAvailableModels.find(m => m.id === config.model);
        const firstModelId = sortedAvailableModels[0].id;

        // 仅在以下情况重置为第一个模型：
        // 1. 当前模型完全失效
        // 2. 当前是刚进入当前模式，且用户没有手动锁定选择
        const isInitialSelectInMode = !isModelManuallyLocked && config.model !== firstModelId;
        const shouldResetToFirst = !currentModelValid || isInitialSelectInMode;

        if (shouldResetToFirst) {
            setConfig(prev => {
                const newModel = firstModelId;
                // 🚀 [Fix] 智能参数保持：获取新模型支持的参数
                const newModelCaps = getModelCapabilities(newModel);
                const supportedSizes = newModelCaps?.supportedSizes?.length ? newModelCaps.supportedSizes : Object.values(ImageSize);
                const supportedRatios = newModelCaps?.supportedRatios?.length ? newModelCaps.supportedRatios : Object.values(AspectRatio);

                // 检查当前参数是否被新模型支持，支持则保持，不支持则回退到默认值
                const newImageSize = supportedSizes.includes(prev.imageSize) ? prev.imageSize : getDefaultImageSizeForModel(newModel);
                const newAspectRatio = supportedRatios.includes(prev.aspectRatio) ? prev.aspectRatio : getDefaultAspectForModel(newModel);

                return { ...prev, model: newModel, imageSize: newImageSize, aspectRatio: newAspectRatio };
            });
        }
    }, [config.mode, sortedAvailableModels, setConfig, getDefaultImageSizeForModel, getDefaultAspectForModel]); // 移除了 isModelManuallyLocked 和 config.model 依赖，避免选中后重复触发

    // Get available ratios and sizes based on model capabilities
    const modelCaps = useMemo(() => {
        return getModelCapabilities(config.model);
    }, [config.model]);

    const availableRatios = useMemo(() => {
        const ratios = modelCaps?.supportedRatios;
        return ratios && ratios.length > 0 ? ratios : Object.values(AspectRatio);
    }, [modelCaps]);

    const availableSizes = useMemo(() => {
        const sizes = modelCaps?.supportedSizes;
        return sizes && sizes.length > 0 ? sizes : Object.values(ImageSize);
    }, [modelCaps]);

    const groundingSupported = useMemo(() => {
        return modelSupportsGrounding(config.model);
    }, [config.model]);

    const thinkingSupported = useMemo(() => {
        return !!modelCaps?.supportsThinking;
    }, [modelCaps]);

    const imageSearchSupported = useMemo(() => {
        return !!modelCaps?.supportsImageSearch;
    }, [modelCaps]);

    // 🚀 [Note] 计费逻辑已移除，内置加速功能不再可用
    const estimatedCredits = 0;

    // Auto-reset grounding if not supported - REMOVED to allow preference persistence
    /*
    useEffect(() => {
        if (config.enableGrounding && !groundingSupported) {
            setConfig(prev => ({ ...prev, enableGrounding: false }));
        }
    }, [groundingSupported, config.enableGrounding, setConfig]);

    useEffect(() => {
        if (!thinkingSupported && config.thinkingMode === 'high') {
            setConfig(prev => ({ ...prev, thinkingMode: 'minimal' }));
        }
        if (!imageSearchSupported && config.enableImageSearch) {
            setConfig(prev => ({ ...prev, enableImageSearch: false }));
        }
    }, [thinkingSupported, imageSearchSupported, config.enableImageSearch, config.thinkingMode, setConfig]);

    useEffect(() => {
        if (thinkingSupported && !config.thinkingMode) {
            setConfig(prev => ({ ...prev, thinkingMode: 'minimal' }));
        }
    }, [thinkingSupported, config.thinkingMode, setConfig]);
    */

    // Auto-adjust ratio/size if current selection not available
    useEffect(() => {
        if (!availableRatios.includes(config.aspectRatio) && availableRatios.length > 0) {
            setConfig(prev => ({ ...prev, aspectRatio: availableRatios[0] }));
        }
    }, [availableRatios, config.aspectRatio, setConfig]);

    useEffect(() => {
        if (!availableSizes.includes(config.imageSize) && availableSizes.length > 0) {
            setConfig(prev => ({ ...prev, imageSize: availableSizes[0] }));
        }
    }, [availableSizes, config.imageSize, setConfig]);

    // NOTE: Legacy functions removed - now using modelCapabilities service

    // 🚀 [ID Healing] 自动迁移旧的内置模型 ID 到新的 @system 命名空间
    useEffect(() => {
        const currentModelId = config.model || '';
        if (!currentModelId || currentModelId.includes('@')) return;

        // 如果当前模型 ID 在列表中找不到，尝试加上 @system 查找
        const existsAsIs = availableModels.some(m => m.id === currentModelId);
        if (!existsAsIs) {
            const systemId = `${currentModelId}@system`;
            const existsWithSystem = availableModels.some(m => m.id === systemId);
            if (existsWithSystem) {
                setConfig(prev => ({ ...prev, model: systemId }));
            }
        }
    }, [availableModels, config.model, setConfig]);

    const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setConfig(prev => ({ ...prev, prompt: e.target.value }));
        // Auto-resize up to 6 lines, then scroll
        e.target.style.height = 'auto';
        const lineHeight = 22.5; // 1.5 * 15px (text-[15px] with line-height: 1.5)
        const maxHeight = lineHeight * 6; // 6 lines max
        const newHeight = Math.max(36, Math.min(e.target.scrollHeight, maxHeight));
        e.target.style.height = `${newHeight}px`;
    }, [setConfig]);

    // Auto-resize height when prompt changes (handles paste, select, clear)
    useEffect(() => {
        if (textareaRef.current) {
            // Reset to auto to get correct scrollHeight for shrinkage
            textareaRef.current.style.height = 'auto';

            if (config.prompt) {
                // detailed check: if it has content, expand up to max
                const newHeight = Math.max(36, Math.min(textareaRef.current.scrollHeight, 200));
                textareaRef.current.style.height = `${newHeight}px`;
            } else {
                // empty content - shrink to 1 row
                textareaRef.current.style.height = '36px';
            }
        }
    }, [config.prompt]);

    const processFiles = useCallback(async (files: FileList | File[]) => {
        // 🚀 [修复] 根据模型动态获取最大参考图数量
        const modelCaps = getModelCapabilities(config.model);
        const maxRefImages = modelCaps?.maxRefImages ?? 5; // 默认 5 张，Gemini 3 Pro 支持 10 张

        if (config.referenceImages.length >= maxRefImages) {
            notify.warning('参考图数量限制', `最多只能上传 ${maxRefImages} 张参考图`);
            return;
        }

        const remainingSlots = maxRefImages - config.referenceImages.length;
        const fileArray = Array.from(files).filter(f => {
            // 根据当前模式决定接受什么类型的文档
            if (config.mode === GenerationMode.VIDEO) {
                return f.type.startsWith('video/');
            }
            return f.type.startsWith('image/');
        });

        if (fileArray.length > remainingSlots) {
            notify.info('参考图已调整', `最多只能上传 ${maxRefImages} 张参考图，已自动忽略 ${fileArray.length - remainingSlots} 张`);
        }

        const filesToProcess = fileArray.slice(0, remainingSlots);
        if (filesToProcess.length === 0) return;

        const existingStorageIds = new Set(
            config.referenceImages
                .map((img) => img.storageId)
                .filter((value): value is string => Boolean(value))
        );
        let duplicateCount = 0;

        setUploadingCount((prev) => prev + filesToProcess.length);

        try {
            const placeholders = filesToProcess.map((file) => ({
                id: crypto.randomUUID(),
                mimeType: file.type || 'image/png',
                data: '',
                url: URL.createObjectURL(file)
            }));

            setConfig(prev => ({
                ...prev,
                referenceImages: [...prev.referenceImages, ...placeholders]
            }));

            const readAsDataUrl = (file: File) =>
                new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(file);
                });

            await Promise.allSettled(placeholders.map(async (placeholder, index) => {
                const file = filesToProcess[index];
                try {
                    const result = await readAsDataUrl(file);
                    const matches = result.match(/^data:(.+);base64,(.+)$/);
                    if (!matches) {
                        throw new Error('INVALID_IMAGE_DATA');
                    }

                    const mimeType = matches[1];
                    const data = matches[2];
                    const storageId = await calculateImageHash(data);
                    const fullDataUrl = `data:${mimeType};base64,${data}`;

                    if (existingStorageIds.has(storageId)) {
                        duplicateCount += 1;
                        if (placeholder.url.startsWith('blob:')) {
                            URL.revokeObjectURL(placeholder.url);
                        }
                        setConfig(prev => ({
                            ...prev,
                            referenceImages: prev.referenceImages.filter((img) => img.id !== placeholder.id)
                        }));
                        return;
                    }

                    existingStorageIds.add(storageId);

                    setConfig(prev => ({
                        ...prev,
                        referenceImages: prev.referenceImages.map((img) =>
                            img.id === placeholder.id
                                ? { ...img, storageId, mimeType, data }
                                : img
                        )
                    }));

                    if (placeholder.url.startsWith('blob:')) {
                        URL.revokeObjectURL(placeholder.url);
                    }

                    saveImage(storageId, fullDataUrl).catch((err) => {
                        console.error('[PromptBar] Failed to save image to IndexedDB:', err);
                    });

                    const handle = fileSystemService.getGlobalHandle();
                    if (handle) {
                        fileSystemService.saveReferenceImage(handle, storageId, data, mimeType).catch((err) =>
                            console.error('[PromptBar] Failed to save reference to file system:', err)
                        );
                    }
                } catch (err) {
                    console.error('[PromptBar] Failed to process reference image:', err);
                    if (placeholder.url.startsWith('blob:')) {
                        URL.revokeObjectURL(placeholder.url);
                    }
                    setConfig(prev => ({
                        ...prev,
                        referenceImages: prev.referenceImages.filter((img) => img.id !== placeholder.id)
                    }));
                } finally {
                    setUploadingCount((prev) => Math.max(0, prev - 1));
                }
            }));

            if (duplicateCount > 0) {
                notify.info('已跳过重复参考图', `检测到 ${duplicateCount} 张重复图片，未重复添加。`);
            }
        } finally {
        }
    }, [config.referenceImages, setConfig]);

    const toggleMenu = useCallback((menu: string) => {
        setShowOptionsPanel(false); // 关闭Options Panel
        setActiveMenu(prev => prev === menu ? null : menu);
    }, []);

    const removeReferenceImage = useCallback((id: string) => {
        setConfig(prev => ({
            ...prev,
            referenceImages: prev.referenceImages.filter(img => {
                const shouldKeep = img.id !== id;
                if (!shouldKeep && img.url?.startsWith('blob:')) {
                    URL.revokeObjectURL(img.url);
                }
                return shouldKeep;
            })
        }));
    }, [setConfig]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // 始终允许发送新请求，即使正在生成中
            onGenerate();
        }
    }, [onGenerate]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles: File[] = [];
        let hasImage = false;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    imageFiles.push(file);
                    hasImage = true;
                }
            } else if (items[i].type === 'text/plain') {
                // 🚀 [NEW] Handle Image URL Paste
                items[i].getAsString((text) => {
                    const url = text.trim();
                    if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || url.startsWith('http')) {
                        // Optimistic check: looks like an image URL?
                        // Fetch it
                        fetch(url)
                            .then(res => {
                                if (!res.ok) throw new Error('Fetch failed');
                                const contentType = res.headers.get('content-type');
                                if (contentType && contentType.startsWith('image/')) {
                                    return res.blob();
                                }
                                throw new Error('Not an image');
                            })
                            .then(blob => {
                                const file = new File([blob], "pasted_image.png", { type: blob.type });
                                processFiles([file]);
                            })
                            .catch(err => {
                                // Not an image URL, just normal text. 
                                // We don't interfere with normal text paste if it fails.
                            });
                    }
                });
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault();
            // Convert to FileList-like object
            const dt = new DataTransfer();
            imageFiles.forEach(f => dt.items.add(f));
            processFiles(dt.files);
        }
    }, [processFiles]);

    const dragCounter = useRef(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragSafetyTimer = useRef<NodeJS.Timeout | null>(null);

    // [FIX] 4秒无操作自动复位（防止卡顿）
    const resetDragSafetyTimer = useCallback(() => {
        if (dragSafetyTimer.current) clearTimeout(dragSafetyTimer.current);
        dragSafetyTimer.current = setTimeout(() => {
            console.warn('[PromptBar] Drag timeout - resetting state');
            setIsDragging(false);
            dragCounter.current = 0;
        }, 4000);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target.closest('.input-bar-inner')) {
                setActiveMenu(null);
                setShowPromptLibrary(false);
                setShowPptOutlinePanel(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (dragSafetyTimer.current) clearTimeout(dragSafetyTimer.current);
        };
    }, []);

    const saveFavoritePromptIds = useCallback((ids: string[]) => {
        setFavoritePromptIds(ids);
        localStorage.setItem('kk_prompt_library_favorites', JSON.stringify(ids));
    }, []);

    const togglePromptFavorite = useCallback((id: string) => {
        if (favoritePromptIds.includes(id)) {
            saveFavoritePromptIds(favoritePromptIds.filter(item => item !== id));
            return;
        }
        saveFavoritePromptIds([id, ...favoritePromptIds]);
    }, [favoritePromptIds, saveFavoritePromptIds]);

    const applyPromptTemplate = useCallback((templatePrompt: string) => {
        const current = (config.prompt || '').trim();
        const nextPrompt = current
            ? `${config.prompt.replace(/\s+$/, '')}\n${templatePrompt}`
            : templatePrompt;
        setConfig(prev => ({ ...prev, prompt: nextPrompt }));
        setShowPromptLibrary(false);
        notify.success('提示词已插入', '已追加到输入框，可继续编辑后发送');
    }, [config.prompt, setConfig]);

    const parsePptSlides = useCallback((text: string) => {
        return text
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .slice(0, 20);
    }, []);

    const generatePptOutlineByTopic = useCallback(() => {
        const topic = (config.prompt || '').trim() || '主题演示';
        const total = Math.min(20, Math.max(1, Number(config.parallelCount) || 1));
        const pages = Array.from({ length: total }).map((_, idx) => {
            const pageNo = idx + 1;
            if (pageNo === 1) return `封面：${topic}`;
            if (pageNo === total) return `总结与行动建议：${topic}`;
            return `${topic} - 第${pageNo}页内核内容`;
        });
        setPptOutlineDraft(pages.join('\n'));
    }, [config.parallelCount, config.prompt]);

    const applyPptOutlineDraft = useCallback(() => {
        const slides = parsePptSlides(pptOutlineDraft);
        const nextCount = Math.max(1, Math.min(20, slides.length || Number(config.parallelCount) || 1));
        setConfig(prev => ({
            ...prev,
            pptSlides: slides,
            parallelCount: nextCount
        }));
        notify.success('PPT页纲已应用', `已设置 ${nextCount} 页，生成时将按图1~图${nextCount}输出`);
    }, [config.parallelCount, parsePptSlides, pptOutlineDraft, setConfig]);

    const exportPptOutlineJson = useCallback(() => {
        const slides = parsePptSlides(pptOutlineDraft);
        const payload = {
            topic: (config.prompt || '').trim(),
            pageCount: slides.length,
            pages: slides.map((text, idx) => ({ page: idx + 1, text })),
            exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ppt-outline-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [config.prompt, parsePptSlides, pptOutlineDraft]);

    const movePptSlide = useCallback((index: number, direction: -1 | 1) => {
        const slides = parsePptSlides(pptOutlineDraft);
        const target = index + direction;
        if (target < 0 || target >= slides.length) return;
        const next = [...slides];
        const tmp = next[index];
        next[index] = next[target];
        next[target] = tmp;
        setPptOutlineDraft(next.join('\n'));
    }, [parsePptSlides, pptOutlineDraft]);

    const removePptSlide = useCallback((index: number) => {
        const slides = parsePptSlides(pptOutlineDraft);
        const next = slides.filter((_, i) => i !== index);
        setPptOutlineDraft(next.join('\n'));
    }, [parsePptSlides, pptOutlineDraft]);

    const insertPptSlideAfter = useCallback((index: number) => {
        const slides = parsePptSlides(pptOutlineDraft);
        if (slides.length >= 20) return;
        const next = [...slides];
        next.splice(index + 1, 0, `新页面 ${Math.min(20, index + 2)}`);
        setPptOutlineDraft(next.slice(0, 20).join('\n'));
    }, [parsePptSlides, pptOutlineDraft]);

    const appendPptTemplateSlide = useCallback((template: 'cover' | 'agenda' | 'section' | 'summary') => {
        const slides = parsePptSlides(pptOutlineDraft);
        if (slides.length >= 20) return;
        const topic = (config.prompt || '').trim() || '主题演示';
        const text = template === 'cover'
            ? `封面：${topic}`
            : template === 'agenda'
                ? `目录页：${topic} 内核议题与章节安排`
                : template === 'section'
                    ? `章节过渡页：${topic} - 阶段重点`
                    : `总结页：${topic} 结论与下一步行动`;
        setPptOutlineDraft([...slides, text].join('\n'));
    }, [config.prompt, parsePptSlides, pptOutlineDraft]);

    const dropPptSlide = useCallback(() => {
        if (pptDragIndex === null || pptDropIndex === null) return;
        const slides = parsePptSlides(pptOutlineDraft);
        if (pptDragIndex < 0 || pptDragIndex >= slides.length) return;
        const target = Math.max(0, Math.min(slides.length - 1, pptDropIndex));
        if (target === pptDragIndex) return;
        const next = [...slides];
        const [moved] = next.splice(pptDragIndex, 1);
        next.splice(target, 0, moved);
        setPptOutlineDraft(next.join('\n'));
        setPptDragIndex(null);
        setPptDropIndex(null);
    }, [parsePptSlides, pptDragIndex, pptDropIndex, pptOutlineDraft]);

    useEffect(() => {
        if (config.mode !== GenerationMode.PPT) return;
        const slides = parsePptSlides(pptOutlineDraft);
        const current = (config.pptSlides || []).map(s => String(s || '').trim()).filter(Boolean);
        const draftKey = slides.join('\n');
        const currentKey = current.join('\n');
        if (draftKey === currentKey) return;

        setConfig(prev => ({
            ...prev,
            pptSlides: slides,
            parallelCount: Math.max(1, Math.min(20, slides.length || prev.parallelCount || 1))
        }));
    }, [config.mode, config.pptSlides, parsePptSlides, pptOutlineDraft, setConfig]);

    const filteredPromptLibrary = useMemo(() => {
        const keyword = promptLibrarySearch.trim().toLowerCase();
        const isFavoriteOnly = promptLibraryCategory === 'all' && keyword === 'fav';

        const base = BUILTIN_PROMPT_LIBRARY.filter(item => {
            if (promptLibraryCategory !== 'all' && item.category !== promptLibraryCategory) return false;
            if (isFavoriteOnly && !favoritePromptIds.includes(item.id)) return false;
            if (!keyword || keyword === 'fav') return true;
            return (
                item.title.toLowerCase().includes(keyword)
                || item.prompt.toLowerCase().includes(keyword)
                || (item.source || '').toLowerCase().includes(keyword)
            );
        });

        return base.sort((a, b) => {
            const aFav = favoritePromptIds.includes(a.id) ? 1 : 0;
            const bFav = favoritePromptIds.includes(b.id) ? 1 : 0;
            return bFav - aFav;
        });
    }, [favoritePromptIds, promptLibraryCategory, promptLibrarySearch]);

    const modeOptions = useMemo(() => ([
        {
            mode: GenerationMode.IMAGE,
            label: '图片',
            icon: Camera,
            color: '#818cf8',
            activeBg: 'rgba(99,102,241,0.16)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.IMAGE, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.VIDEO,
            label: '视频',
            icon: Video,
            color: '#c084fc',
            activeBg: 'rgba(168,85,247,0.16)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.VIDEO, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.AUDIO,
            label: '音乐',
            icon: Mic,
            color: '#f472b6',
            activeBg: 'rgba(236,72,153,0.16)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.AUDIO, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.PPT,
            label: 'PPT',
            icon: LayoutDashboard,
            color: '#38bdf8',
            activeBg: 'rgba(14,165,233,0.16)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.PPT, parallelCount: Math.min(20, Math.max(1, prev.parallelCount || 6)), pptStyleLocked: prev.pptStyleLocked !== false }))
        }
    ]), [setConfig]);

    const activeModeIndex = useMemo(() => {
        const idx = modeOptions.findIndex(item => item.mode === config.mode);
        return idx >= 0 ? idx : 0;
    }, [config.mode, modeOptions]);

    // Drag & Drop handlers...
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;

        resetDragSafetyTimer(); // Start/Reset timer

        // [FIX] Ignore internal drags (e.g. reordering reference images)
        if (dragSourceId) return;

        // Check if it's a file drag from OS
        if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
        }
    }, [dragSourceId, resetDragSafetyTimer]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resetDragSafetyTimer(); // Keep alive
    }, [resetDragSafetyTimer]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;

        // Don't clear timer here immediately, allow slight buffer or let Over handle it? 
        // Actually if we leave, we might want to kill it if count is 0.
        // But if we leave to a child, Over will fire there (bubbling?). 
        // Safest is to rely on the counter logic + the fallback timer.

        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsDragging(false);
            if (dragSafetyTimer.current) clearTimeout(dragSafetyTimer.current);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDragging(false);
        if (dragSafetyTimer.current) clearTimeout(dragSafetyTimer.current);

        // Prompt template drag-and-drop
        const promptTemplate = e.dataTransfer.getData('application/x-kk-prompt-template');
        if (promptTemplate) {
            applyPromptTemplate(promptTemplate);
            return;
        }

        // 1. [NEW] Handle Internal Image Reuse (Optimized) - Prioritize internal ref over files
        const internalRefData = e.dataTransfer.getData('application/x-kk-image-ref');
        if (internalRefData) {
            try {
                const { storageId, mimeType, data } = JSON.parse(internalRefData);
                if (storageId) {
                    // reuse existing storageId!
                    setConfig(prev => {
                        // Prevent duplicates
                        if (prev.referenceImages.some(img => img.storageId === storageId)) return prev;

                        // 🚀 [修复] 根据模型动态获取最大参考图数量
                        const modelCaps = getModelCapabilities(config.model);
                        const maxRefImages = modelCaps?.maxRefImages ?? 5;

                        if (prev.referenceImages.length >= maxRefImages) {
                            notify.warning('参考图数量限制', `最多只能上传 ${maxRefImages} 张参考图`);
                            return prev;
                        }

                        // [FIX] Use passed data if available to avoid loading state
                        let finalData = '';
                        if (data) {
                            if (data.startsWith('data:')) {
                                const matches = data.match(/^data:(.+);base64,(.+)$/);
                                if (matches && matches[2]) {
                                    finalData = matches[2];
                                } else {
                                    finalData = data; // Fallback for other data URIs
                                }
                            } else {
                                // Allow blob: URLs or raw base64 to pass through
                                finalData = data;
                            }
                        }

                        const newRef = {
                            id: Date.now() + Math.random().toString(),
                            storageId,
                            mimeType: mimeType || 'image/png',
                            data: finalData // Use pure data if available, else empty (triggers healing)
                        };

                        // [NEW] If no data but storageId exists, hydrate it!
                        if (!finalData && storageId) {
                            import('../../services/storage/imageStorage').then(({ getImage }) => {
                                getImage(storageId).then((loadedData) => {
                                    if (loadedData) {
                                        setConfig(curr => ({
                                            ...curr,
                                            referenceImages: curr.referenceImages.map(img =>
                                                img.id === newRef.id ? { ...img, data: loadedData } : img
                                            )
                                        }));
                                    } else {
                                        // 🚀 [Fix] IndexedDB 中没有数据，尝试从 URL 获取
                                        const url = e.dataTransfer.getData('text/plain');
                                        if (url && (url.startsWith('data:') || url.startsWith('blob:'))) {
                                            fetch(url)
                                                .then(res => res.blob())
                                                .then(blob => {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        const result = reader.result as string;
                                                        const matches = result.match(/^data:(.+);base64,(.+)$/);
                                                        if (matches) {
                                                            const base64Data = matches[2];
                                                            // 保存到 IndexedDB 以便下次恢复
                                                            saveImage(storageId, result).catch(() => { });
                                                            setConfig(curr => ({
                                                                ...curr,
                                                                referenceImages: curr.referenceImages.map(img =>
                                                                    img.id === newRef.id ? { ...img, data: base64Data, mimeType: matches[1] } : img
                                                                )
                                                            }));
                                                        }
                                                    };
                                                    reader.readAsDataURL(blob);
                                                })
                                                .catch(err => console.error('[PromptBar] Failed to fetch image from URL:', err));
                                        }
                                    }
                                });
                            });
                        }

                        return {
                            ...prev,
                            referenceImages: [...prev.referenceImages, newRef]
                        };
                    });
                    return;
                }
            } catch (err) {
                console.error("Failed to parse internal image ref", err);
            }
        }

        // 2. 处理文档 (External files - only if not internal ref)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
            return;
        }

        // 3. 处理 URL (从图片卡片拖拽 - Fallback or External)
        const url = e.dataTransfer.getData('text/plain');
        if (url) {
            // [OPTIMIZATION] Handle Data URIs directly without fetch
            if (url.startsWith('data:')) {
                const matches = url.match(/^data:(.+);base64,(.+)$/);
                if (matches) {
                    const mimeType = matches[1];
                    const data = matches[2];
                    // Wrap in a fake File object-like structure or just call logic?
                    // Reuse direct logic to avoid File overhead if possible, but processFiles expects File[].
                    // Let's create a File. Fast enough.
                    fetch(url)
                        .then(res => res.blob())
                        .then(blob => {
                            const file = new File([blob], "dropped_image.png", { type: mimeType });
                            processFiles([file]);
                        });
                    return;
                }
            }

            // 检查是否为有效 URL 或 Data URI
            if (url.startsWith('http') || url.startsWith('blob:')) {
                // 获取并转换为 File 对象以复用 processFiles 逻辑
                fetch(url)
                    .then(res => res.blob())
                    .then(blob => {
                        const file = new File([blob], "dropped_image.png", { type: blob.type });
                        processFiles([file]);
                    })
                    .catch(err => {
                        console.error("处理拖拽 URL 失败:", err);
                    });
            }
        }
    }, [applyPromptTemplate, processFiles]);

    const isModelListEmpty = availableModels.length === 0;
    const currentModel = availableModels.find(m => m.id === config.model);

    // 🚀 [Fix] 判断是否为系统积分模型
    const isNanoBanana2 = !!currentModel?.isSystemInternal;
    // 🚀 优先使用模型自带的 creditCost，如果没有则通过 getModelCredits 查询
    const currentCreditCost = isModelListEmpty ? 0 :
        (currentModel?.creditCost !== undefined ? currentModel.creditCost : getModelCredits((currentModel?.id || '').split('@')[0]));

    // 🚀 [NEW] 计算总成本 (单价 * 数量)
    const totalCreditCost = currentCreditCost * (config.parallelCount || 1);
    const currentModelPrimaryColor = normalizeColor(currentModel?.colorStart, '#3B82F6');
    const currentModelSecondaryColor = normalizeColor(currentModel?.colorSecondary || currentModel?.colorEnd, '#2563EB');
    const currentModelTextColor = normalizeModelTextColor(currentModel?.textColor);

    // 🚀 [Fix] 模型名称显示：优先使用管理员配置的label，其次使用ID映射的友好名称
    let currentModelName = isModelListEmpty
        ? '无可用模型'
        : (currentModel ? getModelDisplayName(currentModel.id, currentModel.label, currentModel.provider as any) : '未知模型');

    // 隐藏模型名字中括号及括号内的内容，避免名称过长超出输入框
    if (typeof currentModelName === 'string') {
        currentModelName = currentModelName.replace(/\s*[（\(].*?[）\)]\s*/g, '');
    }

    // 🚀 [NEW] 获取展示信息 (来源标签)
    const modelDisplayInfo = currentModel ? getModelDisplayInfo(currentModel) : null;

    const truncateModelLabel = useCallback((label: string, max = 25) => {
        if (label.length <= max) return label;
        return label.slice(0, max - 1) + '…';
    }, []);

    const truncateProviderLabel = useCallback((label: string) => {
        const max = 5;
        if (label.length <= max) return label;
        return label.slice(0, max - 1) + '…';
    }, []);

    // 🚀 [NEW] 获取展示信息 (来源标签) - 限制25字符防止按钮过宽
    const displayModelLabel = useMemo(() => {
        return truncateModelLabel(currentModelName, 25);
    }, [currentModelName, truncateModelLabel]);

    // 🚀 [Mobile Layout] Dock to bottom on mobile
    const mobileStyle: React.CSSProperties = isMobile ? {
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--mobile-tabbar-height, 72px) + var(--mobile-tabbar-floating-offset, 12px) + var(--mobile-prompt-gap, 12px))',
        left: '50%',
        transform: 'translateX(-50%) translateZ(0)',
        width: 'calc(100vw - 20px)',
        maxWidth: 'min(960px, calc(100vw - 20px))',
        margin: 0,
        borderRadius: '22px',
        border: '1px solid var(--mobile-glass-border, rgba(255,255,255,0.16))',
        zIndex: 960,
        padding: 0,
        WebkitBackdropFilter: 'blur(26px) saturate(170%)',
        backdropFilter: 'blur(26px) saturate(170%)',
        background: 'var(--mobile-glass-bg, rgba(20, 20, 23, 0.84))',
        boxShadow: '0 24px 56px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.15)',
        willChange: 'transform',
        contain: 'layout style paint'
    } : {
        // Desktop floating style handling...
    };

    // Swipe Detection State
    const wrapperTouchStartY = useRef<number | null>(null);

    const handleContainerTouchStart = (e: React.TouchEvent) => {
        wrapperTouchStartY.current = e.touches[0].clientY;
        handleTouchStart(e); // Keep existing handler
    };

    const handleContainerTouchEnd = (e: React.TouchEvent) => {
        if (wrapperTouchStartY.current !== null) {
            const touchEndY = e.changedTouches[0].clientY;
            const deltaY = touchEndY - wrapperTouchStartY.current;

            // Swipe Up Detection (threshold 30px)
            if (deltaY < -30) {
                onInteract?.(); // Trigger Nav Show
            }
            wrapperTouchStartY.current = null;
        }
        handleTouchEnd(e); // Keep existing handler
    };

    // Desktop floating style handling is used for both now
    // 宽度策略：避免部署环境字体/缩放差异导致底部按钮被挤出容器

    return (
        <>
            <div
                id="prompt-bar-container"
                className={`input-bar ${isMobile ? 'ios-mobile-prompt' : ''} transition-all duration-300 !overflow-visible w-[calc(100vw-32px)] sm:w-[min(95vw,960px)] md:w-[min(93vw,1080px)] lg:w-[min(92vw,1200px)] ${isDragging ? 'ring-2 ring-indigo-500' : ''}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={isMobile ? mobileStyle : { bottom: '32px' }}
            >
                {/* Drag Overlay */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-indigo-500/20 backdrop-blur-md rounded-[inherit] flex items-center justify-center animate-fadeIn pointer-events-none">
                        <span className="font-bold text-sm text-white drop-shadow-md">释放添加参考图</span>
                    </div>
                )}

                {/* [NEW] Flying Image Animation */}
                {flyingImage && (
                    <div
                        className="fixed z-[9999] w-12 h-12 rounded-lg border-2 border-indigo-500 shadow-xl overflow-hidden pointer-events-none transition-all ease-in-out duration-500"
                        style={{
                            left: 0,
                            top: 0,
                            backgroundImage: `url(${flyingImage.url})`,
                            backgroundSize: 'cover',
                            transform: `translate(${flyingImage.targetX}px, ${flyingImage.targetY}px) scale(1)`,
                            animation: `flyToTarget 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                        }}
                    >
                        <style>{`
@keyframes flyToTarget {
    0% { transform: translate(${flyingImage.x}px, ${flyingImage.y}px) scale(1); opacity: 0.8; }
    50% { opacity: 1; scale: 1.2; }
    100% { transform: translate(${flyingImage.targetX}px, ${flyingImage.targetY}px) scale(1); opacity: 0; }
}
`}</style>
                    </div>
                )}

                <div
                    className="input-bar-inner !overflow-visible"
                    style={{
                        position: 'relative'
                        // Mobile: No capsule wrapper - keep it clean and flat
                    }}
                >

                    {/* Mode Toggle (Floating above on Desktop, or Integrated?)
                     Design choice: Put it inside "Tools" or main bar?
                     Main bar is better for visibility. 
                     Let's add a small toggle at the top left of the input bar or left side.
                  */}



                    {/* Active Source Image Banner */}
                    {activeSourceImage && (
                        <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl border transition-all animate-in slide-in-from-bottom-2"
                            style={{
                                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                borderColor: 'rgba(245, 158, 11, 0.2)'
                            }}
                        >
                            <img
                                src={activeSourceImage.url}
                                alt="源图"
                                className="w-10 h-10 object-cover rounded-lg shadow-sm"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-amber-600 dark:text-amber-500">从此图继续创作</div>
                                <div className="text-xs text-[var(--text-tertiary)] truncate">{activeSourceImage.prompt}</div>
                            </div>
                        </div>
                    )}

                    {/* Top Controls Row: Mode toggle on left, prompt optimizer on right */}
                    <PromptBarTopRow isMobile={isMobile}>
                        <div className={isMobile ? 'w-full overflow-x-auto scrollbar-none pb-0.5' : 'flex items-center gap-2'}>


                            {(() => {
                                const MODE_SLOT_WIDTH = isMobile ? 72 : 82;
                                const sliderWidth = isMobile ? 64 : 74;
                                const sliderLeft = 4 + activeModeIndex * MODE_SLOT_WIDTH + (MODE_SLOT_WIDTH - sliderWidth) / 2;
                                return (
                                    <div className={`relative inline-flex items-center p-1 rounded-xl border ${isMobile ? 'min-w-max' : ''}`}
                                        style={{
                                            backgroundColor: 'var(--bg-tertiary)',
                                            borderColor: 'var(--border-light)'
                                        }}
                                    >
                                        <div
                                            className="absolute top-1 h-[calc(100%-8px)] rounded-md transition-all duration-300 ease-out"
                                            style={{
                                                width: `${sliderWidth}px`,
                                                left: `${sliderLeft}px`,
                                                backgroundColor: modeOptions[activeModeIndex]?.activeBg || 'rgba(99,102,241,0.16)',
                                                boxShadow: '0 0 10px rgba(0,0,0,0.18) inset'
                                            }}
                                        />

                                        {[1, 2, 3].map((splitIndex) => (
                                            <span
                                                key={`split-${splitIndex}`}
                                                className="absolute inset-y-0 my-auto w-px h-[50%] pointer-events-none"
                                                style={{
                                                    left: `${4 + splitIndex * MODE_SLOT_WIDTH}px`,
                                                    backgroundColor: 'rgba(255,255,255,0.08)'
                                                }}
                                            />
                                        ))}

                                        {modeOptions.map((item) => {
                                            const isActive = config.mode === item.mode;
                                            const Icon = item.icon;
                                            return (
                                                <div key={item.mode} className="relative z-10">
                                                    <button
                                                        className={`px-2 py-1 rounded-md font-medium transition-all duration-200 ${isMobile ? 'w-[72px] text-[12px]' : 'w-[82px] text-sm'}`}
                                                        style={{
                                                            color: isActive ? item.color : 'var(--text-secondary)'
                                                        }}
                                                        onClick={item.onSelect}
                                                    >
                                                        <span className="inline-flex items-center gap-1">
                                                            <Icon size={12} />
                                                            <span>{item.label}</span>
                                                        </span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>

                        <div className={`relative flex items-center gap-1 ${isMobile ? 'flex-wrap' : ''}`}>
                            <button
                                className="flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all text-[11px] font-medium whitespace-nowrap flex-shrink-0"
                                style={{
                                    backgroundColor: showPromptLibrary ? 'rgba(59,130,246,0.14)' : 'var(--bg-tertiary)',
                                    color: showPromptLibrary ? '#60a5fa' : 'var(--text-secondary)',
                                    borderColor: showPromptLibrary ? 'rgba(96,165,250,0.35)' : 'var(--border-light)'
                                }}
                                onMouseDown={(e) => e.stopPropagation()} onClick={(e) => {
                                    e.stopPropagation();
                                    setShowPromptLibrary(prev => !prev);
                                    setShowPptOutlinePanel(false);
                                    setActiveMenu(null);
                                }}
                                title="打开提示词库"
                            >
                                <span>提示词库</span>
                            </button>

                            {config.mode === GenerationMode.PPT && (
                                <button
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all text-[11px] font-medium whitespace-nowrap flex-shrink-0"
                                    style={{
                                        backgroundColor: showPptOutlinePanel ? 'rgba(14,165,233,0.14)' : 'var(--bg-tertiary)',
                                        color: showPptOutlinePanel ? '#38bdf8' : 'var(--text-secondary)',
                                        borderColor: showPptOutlinePanel ? 'rgba(56,189,248,0.35)' : 'var(--border-light)'
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()} onClick={(e) => {
                                        e.stopPropagation();
                                        setShowPptOutlinePanel(prev => !prev);
                                        setShowPromptLibrary(false);
                                        setActiveMenu(null);
                                    }}
                                    title="编辑PPT页纲"
                                >
                                    <span>页纲</span>
                                </button>
                            )}

                            <button
                                className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-[11px] font-medium whitespace-nowrap flex-shrink-0 ${config.enablePromptOptimization
                                    ? 'bg-green-500/15 text-green-500 border-green-500/30'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-[var(--border-medium)]'
                                    }`}
                                style={{
                                    opacity: (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? 1 : 0.45,
                                    pointerEvents: (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? 'auto' : 'none'
                                }}
                                onClick={() => setConfig(prev => ({ ...prev, enablePromptOptimization: !prev.enablePromptOptimization }))}
                                title={(config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? '开启后先优化提示词，再发送生成' : '仅图片/PPT模式支持提示词优化'}
                            >
                                <Wand2 className={`w-3 h-3 ${config.enablePromptOptimization ? 'animate-pulse' : ''}`} />
                                <span className="font-bold">优化提示词</span>
                            </button>

                            {showPromptLibrary && (
                                <div
                                    className="absolute bottom-full right-0 mb-2 z-40 rounded-2xl border shadow-xl p-2 max-w-[calc(100vw-24px)]"
                                    style={{
                                        width: 'min(34rem, calc(100vw - 24px))',
                                        backgroundColor: 'var(--bg-secondary)',
                                        borderColor: 'var(--border-medium)'
                                    }}
                                >
                                    <div className={`mb-2 gap-1 ${isMobile ? 'flex flex-wrap items-center' : 'flex items-center'}`}>
                                        <button
                                            className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'all' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                            onClick={() => setPromptLibraryCategory('all')}
                                        >全部</button>
                                        <button
                                            className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'banana-pro' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                            onClick={() => setPromptLibraryCategory('banana-pro')}
                                        >Banana Pro</button>
                                        <button
                                            className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'banana' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                            onClick={() => setPromptLibraryCategory('banana')}
                                        >Banana</button>
                                        <button
                                            className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'general' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                            onClick={() => setPromptLibraryCategory('general')}
                                        >通用</button>
                                        <input
                                            value={promptLibrarySearch}
                                            onChange={(e) => setPromptLibrarySearch(e.target.value)}
                                            placeholder="搜索标题/内容"
                                            className={`bg-[var(--bg-tertiary)] text-[11px] rounded-md px-2 py-1 border border-[var(--border-light)] outline-none ${isMobile ? 'w-full basis-full mt-1' : 'ml-auto w-40'}`}
                                        />
                                    </div>

                                    <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                                        {filteredPromptLibrary.map(item => {
                                            const isFavorite = favoritePromptIds.includes(item.id);
                                            return (
                                                <div
                                                    key={item.id}
                                                    className="rounded-lg border p-2"
                                                    style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('application/x-kk-prompt-template', item.prompt);
                                                        e.dataTransfer.setData('text/plain', item.prompt);
                                                        e.dataTransfer.effectAllowed = 'copy';
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-xs font-medium text-[var(--text-primary)] truncate">{item.title}</div>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                className="text-[10px] px-2 py-1 rounded-md border border-[var(--border-light)] hover:bg-white/5"
                                                                style={{ color: 'var(--text-secondary)' }}
                                                                onClick={() => applyPromptTemplate(item.prompt)}
                                                            >插入</button>
                                                            <button
                                                                className="text-[11px] px-2 py-1 rounded-md border border-[var(--border-light)] hover:bg-white/5"
                                                                style={{ color: isFavorite ? '#fbbf24' : 'var(--text-secondary)' }}
                                                                onClick={() => togglePromptFavorite(item.id)}
                                                                title={isFavorite ? '取消收藏' : '收藏'}
                                                            >★</button>
                                                        </div>
                                                    </div>
                                                    {item.source && <div className="text-[10px] mt-1 text-[var(--text-tertiary)]">来源: {item.source}</div>}
                                                    <div className="text-[11px] mt-1 text-[var(--text-secondary)] max-h-8 overflow-hidden">{item.prompt}</div>
                                                </div>
                                            );
                                        })}
                                        {filteredPromptLibrary.length === 0 && (
                                            <div className="text-xs text-[var(--text-tertiary)] text-center py-4">没有匹配项</div>
                                        )}
                                    </div>
                                    <div className="text-[10px] mt-2 text-[var(--text-tertiary)]">支持拖拽到输入区直接插入；收藏会保存在本地。</div>
                                </div>
                            )}

                            {showPptOutlinePanel && config.mode === GenerationMode.PPT && (
                                <div className="absolute bottom-full right-0 mb-2 z-40 w-[min(38rem,92vw)] rounded-2xl border shadow-xl p-2" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)' }}>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="text-xs font-semibold text-[var(--text-primary)]">PPT页纲（每行一页）</div>
                                        <div className="text-[10px] text-[var(--text-tertiary)]">{Math.min(20, parsePptSlides(pptOutlineDraft).length)} / 20 页，生成结果按图1~图N命名</div>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <button
                                            className={`px-2 py-1 rounded-md text-[11px] border ${config.pptStyleLocked !== false ? 'border-sky-500/40 bg-sky-500/10 text-sky-300' : 'border-[var(--border-light)] text-[var(--text-secondary)]'}`}
                                            onClick={() => setConfig(prev => ({ ...prev, pptStyleLocked: !(prev.pptStyleLocked !== false) }))}
                                            title="锁定整套PPT视觉风格一致性"
                                        >
                                            风格锁定 {config.pptStyleLocked !== false ? 'ON' : 'OFF'}
                                        </button>
                                        <div className="text-[10px] text-[var(--text-tertiary)]">ON 更偏向整套视觉一致，OFF 允许单页变化</div>
                                    </div>
                                    <div className="flex items-center gap-1 mb-2">
                                        <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('cover')}>+封面</button>
                                        <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('agenda')}>+目录</button>
                                        <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('section')}>+章节</button>
                                        <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('summary')}>+总结</button>
                                    </div>
                                    <textarea
                                        value={pptOutlineDraft}
                                        onChange={(e) => setPptOutlineDraft(e.target.value)}
                                        className="w-full h-44 rounded-lg border p-2 text-xs outline-none resize-none"
                                        style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                                        placeholder="示例：\n封面：AI产品季度汇报\n市场洞察\n产品路线图\n关键案例\n总结与下一步"
                                    />
                                    {parsePptSlides(pptOutlineDraft).length > 0 && (
                                        <div className="mt-2 max-h-36 overflow-y-auto space-y-1 pr-1">
                                            {parsePptSlides(pptOutlineDraft).map((line, idx) => (
                                                <div
                                                    key={`${idx}-${line}`}
                                                    className="relative flex items-center gap-1 rounded-md border px-2 py-1"
                                                    style={{
                                                        borderColor: (pptDropIndex === idx && pptDragIndex !== null && pptDragIndex !== idx)
                                                            ? 'rgba(56,189,248,0.45)'
                                                            : 'var(--border-light)',
                                                        backgroundColor: (pptDropIndex === idx && pptDragIndex !== null && pptDragIndex !== idx)
                                                            ? 'rgba(14,165,233,0.12)'
                                                            : 'var(--bg-tertiary)',
                                                        opacity: pptDragIndex === idx ? 0.65 : 1
                                                    }}
                                                    draggable
                                                    onDragStart={() => {
                                                        setPptDragIndex(idx);
                                                        setPptDropIndex(idx);
                                                    }}
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        setPptDropIndex(idx);
                                                    }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        setPptDropIndex(idx);
                                                        setTimeout(() => dropPptSlide(), 0);
                                                    }}
                                                    onDragEnd={() => {
                                                        setPptDragIndex(null);
                                                        setPptDropIndex(null);
                                                    }}
                                                >
                                                    {(pptDropIndex === idx && pptDragIndex !== null && pptDragIndex !== idx) && (
                                                        <div className="absolute left-1 right-1 -top-[1px] h-[2px] rounded-full bg-sky-400/80 pointer-events-none" />
                                                    )}
                                                    <span className="text-[10px] w-4 shrink-0 text-[var(--text-tertiary)] cursor-grab">⋮</span>
                                                    <span className="text-[10px] text-sky-400 w-8 shrink-0">图{idx + 1}</span>
                                                    <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1" title={line}>{line}</span>
                                                    <button
                                                        className="text-[10px] px-1 py-0.5 rounded border border-[var(--border-light)]"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                        onClick={() => movePptSlide(idx, -1)}
                                                        title="上移"
                                                    >↑</button>
                                                    <button
                                                        className="text-[10px] px-1 py-0.5 rounded border border-[var(--border-light)]"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                        onClick={() => movePptSlide(idx, 1)}
                                                        title="下移"
                                                    >↓</button>
                                                    <button
                                                        className="text-[10px] px-1 py-0.5 rounded border border-red-500/30"
                                                        style={{ color: '#fca5a5' }}
                                                        onClick={() => removePptSlide(idx)}
                                                        title="删除此页"
                                                    >删</button>
                                                    <button
                                                        className="text-[10px] px-1 py-0.5 rounded border border-sky-500/30"
                                                        style={{ color: '#7dd3fc' }}
                                                        onClick={() => insertPptSlideAfter(idx)}
                                                        title="在后方插入新页"
                                                    >+</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 mt-2">
                                        <button
                                            className="px-2 py-1 rounded-md text-[11px] border border-[var(--border-light)] hover:bg-white/5"
                                            style={{ color: 'var(--text-secondary)' }}
                                            onClick={generatePptOutlineByTopic}
                                        >
                                            按主题拆页
                                        </button>
                                        <button
                                            className="px-2 py-1 rounded-md text-[11px] border border-[var(--border-light)] hover:bg-white/5"
                                            style={{ color: 'var(--text-secondary)' }}
                                            onClick={exportPptOutlineJson}
                                        >
                                            导出JSON
                                        </button>
                                        <button
                                            className="px-2 py-1 rounded-md text-[11px] border border-[var(--border-light)] hover:bg-white/5"
                                            style={{ color: 'var(--text-secondary)' }}
                                            onClick={() => setPptOutlineDraft('')}
                                        >
                                            清空
                                        </button>
                                        <button
                                            className="ml-auto px-2 py-1 rounded-md text-[11px] border border-sky-400/40 bg-sky-500/10"
                                            style={{ color: '#38bdf8' }}
                                            onClick={applyPptOutlineDraft}
                                        >
                                            应用页纲
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </PromptBarTopRow>

                    {/* Input Area Wrapper with hover detection */}
                    <div
                        onMouseEnter={() => {
                            // Clear existing timer
                            if (hoverTimerRef.current) {
                                clearTimeout(hoverTimerRef.current);
                            }
                            // Set 500ms delay before showing upload button
                            hoverTimerRef.current = setTimeout(() => {
                                setIsInputAreaHovered(true);
                            }, 500);
                        }}
                        onMouseLeave={() => {
                            // Clear timer on leave
                            if (hoverTimerRef.current) {
                                clearTimeout(hoverTimerRef.current);
                                hoverTimerRef.current = null;
                            }
                            // Immediately hide
                            setIsInputAreaHovered(false);
                        }}
                    >
                        {/* Reference Images List */}
                        {(config.referenceImages && config.referenceImages.length > 0 || uploadingCount > 0) && (
                            <div
                                ref={refContainerRef}
                                className="flex flex-nowrap items-center gap-2 transition-all p-2 px-3 mt-1 rounded-lg overflow-x-auto overflow-y-hidden scrollbar-thin"
                                style={{
                                    WebkitOverflowScrolling: 'touch',
                                    overscrollBehaviorX: 'contain',
                                    touchAction: 'pan-x'
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';

                                    // Calculate insertion index based on mouse cursor X
                                    if (refContainerRef.current) {
                                        const children = Array.from(refContainerRef.current.children).filter(c => !c.id.includes('spacer'));
                                        let insertIndex = children.length;

                                        for (let i = 0; i < children.length; i++) {
                                            const rect = children[i].getBoundingClientRect();
                                            const centerX = rect.left + rect.width / 2;
                                            if (e.clientX < centerX) {
                                                insertIndex = i;
                                                break;
                                            }
                                        }

                                        // Don't show gap if we are hovering over the source itself or its immediate neighbor in a way that wouldn't change order
                                        if (dragSourceId) {
                                            const sourceIndex = config.referenceImages.findIndex(img => img.id === dragSourceId);
                                            if (insertIndex === sourceIndex || insertIndex === sourceIndex + 1) {
                                                setDropTargetIndex(null);
                                                return;
                                            }
                                        }

                                        setDropTargetIndex(insertIndex);
                                    }
                                }}
                                onDragLeave={(e) => {
                                    // Only clear if we actually left the container, not just entered a child
                                    if (refContainerRef.current && !refContainerRef.current.contains(e.relatedTarget as Node)) {
                                        setDropTargetIndex(null);
                                    }
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDropTargetIndex(null);

                                    // 1. Internal Reorder
                                    if (dragSourceId) {
                                        if (dropTargetIndex !== null) {
                                            setConfig(prev => {
                                                const newImages = [...prev.referenceImages];
                                                const sourceIndex = newImages.findIndex(i => i.id === dragSourceId);
                                                if (sourceIndex === -1) return prev;

                                                const [moved] = newImages.splice(sourceIndex, 1);
                                                // Adjust target index if we removed an item before it
                                                let finalTargetIndex = dropTargetIndex;
                                                if (sourceIndex < finalTargetIndex) {
                                                    finalTargetIndex -= 1;
                                                }

                                                newImages.splice(finalTargetIndex, 0, moved);
                                                return { ...prev, referenceImages: newImages };
                                            });
                                        }
                                        setDragSourceId(null);
                                        return;
                                    }

                                    // 2. Pass to parent (handleDrop) for file processing
                                    // We need to re-fire the drop event on the parent or call logic.
                                    // Since we stopped prop, we must call it manually or refactor.
                                    // Simplest: Call onFilesDrop if provided? 
                                    // But existing architecture uses the parent <div> onDrop={handleDrop}.
                                    // If we stopPropagation here, the parent sees it.
                                    // If we DON'T stopPropagation, the parent sees it.
                                    // But we want to handle Internal Reorder here exclusively.

                                    // Solution: Check if it's Files. If so, let it bubble (remove e.stopPropagation()).
                                    // If it's internal dragSourceId, handle and stop.
                                }}
                            >
                                {config.referenceImages.map((img, index) => {
                                    const isSource = dragSourceId === img.id;

                                    // Spacer Logic
                                    const showSpacer = dropTargetIndex === index;

                                    return (
                                        <React.Fragment key={img.id}>
                                            {/* Spacer */}
                                            <div
                                                id="spacer"
                                                className={`transition-all duration-300 ease-[cubic-bezier(0.25, 1, 0.5, 1)] rounded-lg overflow-hidden ${showSpacer ? 'w-12 opacity-100 mr-2' : 'w-0 opacity-0 mr-0'}`}
                                                style={{ height: showSpacer ? '48px' : '0px' }}
                                            >
                                                <div className="w-12 h-12 rounded-lg border-2 border-dashed border-indigo-500/30 bg-indigo-500/5"></div>
                                            </div>

                                            <div
                                                className={`relative group cursor-move transition-all duration-300 ${isSource ? 'opacity-0 w-0 overflow-hidden m-0 p-0 scale-0' : 'hover:scale-105'} ${!isSource ? 'w-12' : ''}`}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.stopPropagation();
                                                    setDragSourceId(img.id);
                                                    e.dataTransfer.setData('text/plain', img.id);
                                                    e.dataTransfer.effectAllowed = 'move';
                                                }}
                                                onDragEnd={() => {
                                                    setDragSourceId(null);
                                                    setDropTargetIndex(null);
                                                }}
                                            >
                                                <ReferenceThumbnail
                                                    image={img}
                                                    onRecovered={(payload) => {
                                                        setConfig(curr => ({
                                                            ...curr,
                                                            referenceImages: curr.referenceImages.map(ref =>
                                                                ref.id === payload.id
                                                                    ? {
                                                                        ...ref,
                                                                        data: payload.data,
                                                                        mimeType: payload.mimeType || ref.mimeType,
                                                                        storageId: payload.storageId || ref.storageId,
                                                                    }
                                                                    : ref
                                                            )
                                                        }));
                                                    }}
                                                    onClick={(e, resolvedSrc) => {
                                                        e.stopPropagation();
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setPreviewImage({ url: resolvedSrc, originRect: rect });
                                                    }}
                                                />
                                                {/* Mask Indicator - 当前已设置遮罩时显示高亮边框 */}
                                                {config.maskUrl && config.editMode === 'inpaint' && (
                                                    <div className="absolute inset-0 border-2 border-indigo-500 rounded-lg pointer-events-none" />
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeReferenceImage(img.id);
                                                        if (config.maskUrl) {
                                                            setConfig(prev => ({ ...prev, maskUrl: undefined, editMode: undefined }));
                                                        }
                                                    }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110 z-10"
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                </button>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}

                                {/* [NEW] Uploading Skeletons */}
                                {Array.from({ length: uploadingCount }).map((_, idx) => (
                                    <div key={`uploading-${idx}`} className="relative w-12 h-12 rounded-lg border-2 border-dashed border-gray-400/30 dark:border-zinc-500/30 flex items-center justify-center bg-gray-100/50 dark:bg-zinc-800/50 overflow-hidden flex-shrink-0 animate-pulse">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-gray-500 dark:text-zinc-400">
                                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                        </svg>
                                    </div>
                                ))}

                                <div
                                    id="spacer"
                                    className={`transition-all duration-300 ease-[cubic-bezier(0.25, 1, 0.5, 1)] rounded-lg overflow-hidden ${dropTargetIndex === config.referenceImages.length ? 'w-12 opacity-100 h-12' : 'w-0 opacity-0 h-0'}`}
                                >
                                    <div className="w-12 h-12 rounded-lg border-2 border-dashed border-indigo-500/30 bg-indigo-500/5"></div>
                                </div>

                                {/* Upload Button - At the end of reference images row - 始终显示 */}
                                <button
                                    className="w-12 h-12 rounded-md transition-all duration-200 border hover:bg-white/5 flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100"
                                    style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        color: 'var(--text-secondary)',
                                        borderColor: 'var(--border-light)'
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                    title="上传参考图"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Upload button when no reference images - 始终显示，与参考图同行对齐 */}
                        {config.referenceImages.length === 0 && uploadingCount === 0 && (
                            <div className="flex items-center p-2 px-3 mt-1">
                                <button
                                    className="w-12 h-12 rounded-lg transition-all border-2 border-dashed hover:bg-white/5 flex items-center justify-center flex-shrink-0 opacity-40 hover:opacity-80"
                                    style={{
                                        color: 'var(--text-secondary)',
                                        borderColor: 'var(--border-light)'
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                    title="上传参考图"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Text Input Area */}
                        <textarea
                            ref={textareaRef}
                            value={config.prompt}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            onFocus={() => {
                                setActiveMenu(null);
                                onFocus?.(); // 通知侧边栏: 输入框有焦点,不要自动隐藏
                            }}
                            onBlur={() => {
                                onBlur?.(); // 通知侧边栏: 输入框失去焦点,可以自动隐藏
                            }}
                            placeholder={config.mode === GenerationMode.VIDEO ? "描述你想要生成的视频..." : config.mode === GenerationMode.AUDIO ? "描述你想要生成的音乐风格、歌词或旋律..." : config.mode === GenerationMode.PPT ? "输入PPT主题，将批量生成图1~图N页面..." : "描述你想要生成的图片..."}
                            className="input-bar-textarea w-full max-w-full bg-transparent border-none outline-none text-[15px] resize-none mt-1 py-1 px-3 box-border overflow-y-auto"
                            style={{
                                color: 'var(--text-primary)', // 使用 CSS 变量适配主题
                                minHeight: '36px',
                                maxHeight: '135px', // 6 lines * 22.5px line-height
                                lineHeight: '1.5'
                            }}
                            rows={1}
                        />
                    </div> {/* End of input area hover wrapper */}

                    {/* Footer - Modified to be a standard flex row, flowing or wrapping lightly on mobile */}
                    <PromptBarFooter isMobile={isMobile}>
                        <div className={`flex items-center gap-1.5 min-w-0 ${isMobile ? 'w-full' : 'flex-1'}`}>
                            {/* Model Button */}
                            <div className={`relative inline-flex min-w-0 ${isMobile ? 'flex-1' : 'flex-shrink-0'}`}>
                                <button
                                    id="models-dropdown-trigger"
                                    className={`input-bar-model flex w-full max-w-full items-center flex-nowrap justify-center gap-1.5 md:gap-2 px-2 md:px-3 h-10 rounded-lg border transition-all duration-300 min-w-0 overflow-hidden ${isModelListEmpty
                                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed border-[var(--border-light)]'
                                        : (currentModel?.colorStart && currentModel?.colorEnd)
                                            ? 'border-white/20 !opacity-100 shadow-sm'
                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-opacity-50'
                                        }`}
                                    style={(!isModelListEmpty && currentModel?.colorStart && currentModel?.colorEnd) ? {
                                        background: `linear-gradient(180deg, ${currentModelSecondaryColor} 0%, ${currentModelSecondaryColor} 100%)`,
                                        border: `1px solid ${currentModelPrimaryColor}`,
                                        boxShadow: `0 0 0 1px ${currentModelPrimaryColor} inset`
                                    } : {}}
                                    onMouseDown={(e) => e.stopPropagation()} // 🚀 阻止 mousedown 冒泡，防止被 handleClickOutside 误杀
                                    onClick={(e) => {
                                        e.stopPropagation(); // 🚀 阻止冒泡，防止被 handleClickOutside 误杀
                                        if (isModelListEmpty) {
                                            onOpenSettings?.('api-management');
                                        } else {
                                            toggleMenu('model');
                                        }
                                    }}
                                >
                                    {(() => {
                                        const badgeInfo = getModelBadgeInfo({ id: currentModel?.id ?? '', label: currentModel?.label ?? '', provider: currentModel?.provider });
                                        return (
                                            <span
                                                className={`font-bold truncate flex items-center gap-1 min-w-0 ${isMobile ? 'text-[13px]' : 'text-sm'} ${(!isModelListEmpty && currentModel?.colorStart && currentModel?.colorEnd) ? '' : badgeInfo.colorClass}`}
                                                style={(!isModelListEmpty && currentModel?.colorStart && currentModel?.colorEnd) ? { color: currentModelTextColor } : undefined}
                                                title={currentModelName}
                                            >
                                                {currentModelName}
                                            </span>
                                        );
                                    })()}

                                    {/* 🚀 [Fix] 区分标识：积分模型显示淡蓝色 ✨积分，用户API显示Provider标签 */}
                                    {!isModelListEmpty && !isMobile && (
                                        currentModel?.isSystemInternal ? (
                                            // 积分模型：仅显示 ✨积分，不显示供应商
                                            <span
                                                className="text-[10px] px-2 py-0.5 rounded-full bg-sky-400/20 text-sky-200 border border-sky-300/25 font-semibold flex-shrink-0"
                                                style={{ marginLeft: '6px' }}
                                                title="系统积分模型"
                                            >
                                                ✨{Math.max(1, currentCreditCost)}
                                            </span>
                                        ) : currentModel?.provider ? (
                                            // 用户API模型：显示Provider标签
                                            <span
                                                className={`text-[9px] px-1.5 py-0.5 rounded border flex-shrink-0 ${getProviderBadgeColor(currentModel.provider)}`}
                                                style={{ marginLeft: '6px', ...getProviderBadgeStyle(currentModel.provider) }}
                                                title={currentModel.provider}
                                            >
                                                <span className="whitespace-nowrap">{truncateProviderLabel(currentModel.provider)}</span>
                                            </span>
                                        ) : null
                                    )}
                                </button>

                                {/* Dropdown Menu */}
                                {!isModelListEmpty && activeMenu === 'model' && (
                                    <div
                                        ref={modelDropdownRef}
                                        className="absolute bottom-full mb-3 z-50 animate-scaleIn origin-bottom"
                                        style={isMobile ? { left: 0, transform: 'none' } : { left: '50%', transform: 'translateX(-50%)' }}
                                    >
                                        {/* 🔍 Search Input Module - Above the list - 只在多个模型时显示 */}
                                        {sortedAvailableModels.length > 1 && (
                                            <div className="mb-2 p-2.5 bg-[var(--bg-secondary)] border border-[var(--border-medium)] rounded-2xl shadow-xl animate-scaleIn origin-bottom max-w-[calc(100vw-24px)]" style={{ width: 'min(22rem, calc(100vw - 24px))' }}>
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
                                        )}

                                        <div
                                            ref={modelListScrollRef}
                                            className="dropdown static w-[min(22rem,calc(100vw-24px))] max-w-[calc(100vw-24px)] max-h-[50vh] overflow-y-auto scrollbar-thin animate-scaleIn origin-bottom p-4 flex flex-col gap-2"
                                            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-xl)', borderRadius: '1rem' }}
                                            onScroll={(e) => {
                                                // 保存滚动位置
                                                modelListScrollPos.current = e.currentTarget.scrollTop;
                                            }}
                                        >
                                            {(() => {
                                                const rawModels = filterAndSortModels(availableModels, modelSearch, modelCustomizations);
                                                // 🚀 [修正] 使用复合键 (ID + Provider) 去重，确保积分模型和第三方模型能共存
                                                let uniqueModels = Array.from(new Map(rawModels.map(m => [`${m.id}-${m.provider || ''}`, m])).values());

                                                const getIsExclusive = (m: any) => {
                                                    // 🚀 [Style Isolation] 严格判断：必须是系统内置模型
                                                    // 用户添加的第三方API即使模型ID相同，也不应该使用胶囊样式
                                                    return !!m.isSystemInternal;
                                                };

                                                uniqueModels.sort((a, b) => {
                                                    const aExclusive = getIsExclusive(a);
                                                    const bExclusive = getIsExclusive(b);
                                                    if (aExclusive && !bExclusive) return -1;
                                                    if (!aExclusive && bExclusive) return 1;

                                                    const pinnedModels = getPinnedModels();
                                                    const aPinned = pinnedModels.includes(a.id);
                                                    const bPinned = pinnedModels.includes(b.id);
                                                    if (aPinned && !bPinned) return -1;
                                                    if (!aPinned && bPinned) return 1;

                                                    return 0; // 同层级保持原始排序
                                                });

                                                return uniqueModels.map((model: any, index: number) => {
                                                    const isLast = index === uniqueModels.length - 1;
                                                    const lowerId = model.id.toLowerCase();
                                                    const custom = modelCustomizations[model.id] || {};
                                                    const baseName = custom.alias || (model.label || model.id);

                                                    // 🚀 [修正] 增强 Exclusive 判定逻辑
                                                    const isExclusive = getIsExclusive(model);

                                                    // 🚀 [添加] 区分标识：系统积分模型 vs 用户API模型
                                                    const isSystemCreditModel = isExclusive;
                                                    const isUserApiModel = !isExclusive && (model.provider === 'Google' || model.provider === 'Custom' || model.provider === 'OpenAI');


                                                    const getFallbackDescription = (m: any) => {
                                                        if (m.provider) return `由 ${m.provider} 信道提供的可用模型`;
                                                        if (m.group) return `隶属于 ${m.group} 分组的引擎模型`;
                                                        return '外部集成的第三方语言模型';
                                                    };
                                                    const advantage = custom.description || model.description || getFallbackDescription(model);
                                                    const isPinned = getPinnedModels().includes(model.id);

                                                    const isActive = config.model === model.id;
                                                    // 🚀 [Fix] 使用统一的 normalizeColor 函数处理颜色
                                                    const colorStart = normalizeColor(model.colorStart, '#60a5fa');
                                                    const colorEnd = normalizeColor(model.colorEnd, '#2563eb');

                                                    // 🚀 [Fix] 积分模型：选中或悬停时显示彩色渐变，否则使用灰色调
                                                    const isModelActive = config.model === model.id;

                                                    // 默认使用的统一灰色渐变底板
                                                    const inactiveGradientStyle = {
                                                        background: `linear-gradient(180deg, rgba(75, 85, 99, 0.4) 0%, rgba(55, 65, 81, 0.4) 100%)`,
                                                    };

                                                    // 悬停/激活时才展示的彩色底板
                                                    const activeGradientStyle = {
                                                        background: `linear-gradient(180deg, ${colorEnd} 0%, ${colorEnd} 100%)`,
                                                        border: `1px solid ${colorStart}`,
                                                        boxShadow: `0 0 0 1px ${colorStart} inset`,
                                                    };

                                                    return (
                                                        <button
                                                            key={model.id}
                                                            className={`group w-full transition-all duration-300 mx-auto cursor-pointer
                                                            ${isExclusive
                                                                    ? `h-14 px-5 flex items-center justify-between rounded-full flex-shrink-0 text-white shadow-md active:scale-[0.98] ${isLast ? '' : 'mb-3'} ${isModelActive ? 'ring-2 ring-white/50 shadow-lg scale-[1.02]' : 'hover:scale-[1.02] hover:shadow-lg opacity-80 hover:opacity-100 grayscale-[0.8] hover:grayscale-0'}`
                                                                    : `px-3 py-2.5 text-left flex flex-col gap-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-all border-2 ${isModelActive ? 'bg-blue-50 dark:bg-white/10 ring-2 ring-blue-500 dark:ring-white/40 border-blue-500 dark:border-white/20 shadow-md' : 'border-transparent opacity-80 hover:opacity-100 grayscale-[0.8] hover:grayscale-0'}`}
                                                            `}
                                                            style={isExclusive ? (isModelActive ? activeGradientStyle : inactiveGradientStyle) : undefined}
                                                            onMouseEnter={(e) => {
                                                                if (isExclusive && !isModelActive) {
                                                                    e.currentTarget.style.background = activeGradientStyle.background;
                                                                    e.currentTarget.style.border = activeGradientStyle.border || '';
                                                                    e.currentTarget.style.boxShadow = activeGradientStyle.boxShadow || '';
                                                                }
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                if (isExclusive && !isModelActive) {
                                                                    e.currentTarget.style.background = inactiveGradientStyle.background;
                                                                    e.currentTarget.style.border = '';
                                                                    e.currentTarget.style.boxShadow = '';
                                                                }
                                                            }}
                                                            onClick={() => {
                                                                setModelManualLock(true); // 🚀 用户手动点击，开启锁定
                                                                setConfig(prev => {
                                                                    // 🚀 [Fix] 智能参数保持：获取新模型支持的参数
                                                                    const newModelCaps = getModelCapabilities(model.id);
                                                                    const supportedSizes = newModelCaps?.supportedSizes?.length ? newModelCaps.supportedSizes : Object.values(ImageSize);
                                                                    const supportedRatios = newModelCaps?.supportedRatios?.length ? newModelCaps.supportedRatios : Object.values(AspectRatio);

                                                                    // 检查当前参数是否被新模型支持，支持则保持，不支持则回退到默认值
                                                                    const newImageSize = supportedSizes.includes(prev.imageSize) ? prev.imageSize : getDefaultImageSizeForModel(model.id);
                                                                    const newAspectRatio = supportedRatios.includes(prev.aspectRatio) ? prev.aspectRatio : getDefaultAspectForModel(model.id);

                                                                    return { ...prev, model: model.id, imageSize: newImageSize, aspectRatio: newAspectRatio };
                                                                });
                                                                setActiveMenu(null);
                                                                setModelSearch(''); // Clear search on selection
                                                            }}
                                                            onContextMenu={(e) => {
                                                                if (isExclusive) {
                                                                    e.preventDefault();
                                                                    return; // Disallow context menu for exclusive models
                                                                }
                                                                e.preventDefault();
                                                                setContextMenu({ x: e.clientX, y: e.clientY, modelId: model.id });
                                                            }}
                                                        >
                                                            {(() => {
                                                                const displayInfo = getModelDisplayInfo(model);
                                                                const badgeInfo = getModelBadgeInfo({ id: model.id, label: model.label, provider: model.provider });
                                                                const displayName = displayInfo.displayName;

                                                                if (isExclusive) {
                                                                    // 🚀 [Fix] 积分模型：胶囊样式，图标+名称左对齐，积分标识右对齐
                                                                    return (
                                                                        <div className="flex items-center justify-between w-full h-full">
                                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6">
                                                                                    <ModelLogo
                                                                                        modelId={model.id}
                                                                                        provider={model.provider}
                                                                                        size={20}
                                                                                        active={isActive}
                                                                                    />
                                                                                </div>
                                                                                <span className="text-sm font-semibold truncate text-white text-left">
                                                                                    {displayName}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                                                                                <span className="text-xs px-2.5 py-1 rounded-full bg-white/25 text-white border border-white/30 font-semibold flex items-center gap-1">
                                                                                    ✨{model.creditCost !== undefined ? model.creditCost : getModelCredits((model.id || '').split('@')[0])}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                // 🚀 [Fix] API模型：图标居中对齐，文本左对齐
                                                                return (
                                                                    <div className="flex items-center justify-between w-full">
                                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                            <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                                                                                <ModelLogo
                                                                                    modelId={model.id}
                                                                                    provider={model.provider}
                                                                                    size={16}
                                                                                    active={isActive}
                                                                                />
                                                                            </div>
                                                                            <span className={`text-sm font-medium ${badgeInfo.colorClass} break-all text-left`} title={displayInfo.displayName}>
                                                                                {displayName}
                                                                            </span>
                                                                        </div>
                                                                        {/* 供应商标签 - 右对齐带框（最多显示10个字符，单行） */}
                                                                        {model.provider && (
                                                                            <span
                                                                                className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 whitespace-nowrap overflow-hidden ${getProviderBadgeColor(model.provider)}`}
                                                                                title={model.provider}
                                                                                style={{ maxWidth: '40%', textOverflow: 'ellipsis', ...getProviderBadgeStyle(model.provider) }}
                                                                            >
                                                                                {model.provider.length > 10 ? model.provider.substring(0, 9) + '…' : model.provider}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* Metadata Display - 三层简洁结构 - 专属模型不显示 */}
                                                            {!isExclusive && (() => {
                                                                const modelDesc = getModelDescription(model.id);
                                                                const description = modelDesc?.description || advantage;

                                                                return (
                                                                    <div className="flex justify-between items-start mt-1 gap-2">
                                                                        <div className="flex flex-col gap-1 flex-1 min-w-0">

                                                                            {description && (
                                                                                <span className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                                                                                    {description}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {isPinned && <span className="text-[12px] opacity-80 flex-shrink-0 mr-1 mt-0.5">📌</span>}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </button >
                                                    );
                                                })
                                            })()}
                                        </div>
                                    </div >
                                )}
                            </div >

                            {/* Options Button - Shows current ratio and size, shrink on mobile */}
                            <div className="relative inline-flex flex-shrink-0">
                                <button
                                    data-options-toggle
                                    className={`flex items-center gap-1.5 h-10 rounded-lg border transition-all text-xs font-medium whitespace-nowrap flex-shrink-0 min-w-0 ${isMobile ? 'px-2 max-w-[9.5rem]' : 'px-3'}`}
                                    style={{
                                        backgroundColor: showOptionsPanel ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                                        color: 'var(--text-secondary)',
                                        borderColor: showOptionsPanel ? 'var(--border-medium)' : 'var(--border-light)'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenu(null); // 关闭其他菜单
                                        setShowOptionsPanel(prev => !prev);
                                    }}
                                    title="图片/视频选项"
                                >
                                    {config.mode === GenerationMode.AUDIO ? (
                                        <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 18V5l12-2v13" />
                                                <circle cx="6" cy="18" r="3" />
                                                <circle cx="18" cy="16" r="3" />
                                            </svg>
                                            <span>{config.audioDuration || '自动'}</span>
                                        </>
                                    ) : (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? (
                                        <>
                                            {config.aspectRatio === AspectRatio.AUTO ? (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                                                    <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                                                    <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                                                    <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                                                    <rect width="10" height="8" x="7" y="8" rx="1"></rect>
                                                </svg>
                                            ) : (
                                                getRatioIcon(config.aspectRatio)
                                            )}
                                            <span className="min-w-0 truncate">{config.aspectRatio === AspectRatio.AUTO ? '自适应' : config.aspectRatio} · {config.imageSize}</span>
                                        </>
                                    ) : (
                                        <>
                                            {config.aspectRatio === AspectRatio.AUTO ? (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                                                    <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                                                    <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                                                    <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                                                    <rect width="10" height="8" x="7" y="8" rx="1"></rect>
                                                </svg>
                                            ) : (
                                                getRatioIcon(config.aspectRatio)
                                            )}
                                            <span className="min-w-0 truncate">{config.aspectRatio === AspectRatio.AUTO ? '自适应' : config.aspectRatio} · {config.videoResolution || '720p'}</span>
                                        </>
                                    )}
                                    <svg className={`w-3 h-3 transition-transform ${showOptionsPanel ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M6 9l6 6 6-6" />
                                    </svg>
                                </button>

                                {/* Options Panel - positioned relative to button */}
                                {showOptionsPanel && (
                                    <div
                                        className="absolute bottom-full mb-2 z-30"
                                        style={isMobile ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }}
                                    >
                                        <div ref={optionsPanelRef}>
                                            {config.mode === GenerationMode.AUDIO ? (
                                                /* 音频选项面板 - 时长选择 */
                                                <div className="w-56 p-3 rounded-xl border shadow-xl animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)' }}>
                                                    <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">音频时长</div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {['自动', '30s', '60s', '120s', '240s'].map(dur => (
                                                            <button
                                                                key={dur}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${(config.audioDuration || '自动') === dur
                                                                    ? 'bg-pink-500/20 text-pink-400 border-pink-500/30'
                                                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-pink-500/30'
                                                                    }`}
                                                                onClick={() => setConfig(prev => ({ ...prev, audioDuration: dur === '自动' ? undefined : dur }))}
                                                            >
                                                                {dur}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? (
                                                <ImageOptionsPanel
                                                    aspectRatio={config.aspectRatio}
                                                    imageSize={config.imageSize}
                                                    showThinkingMode={thinkingSupported}
                                                    thinkingMode={config.thinkingMode || 'minimal'}
                                                    onThinkingModeChange={(mode) => setConfig(prev => ({ ...prev, thinkingMode: mode }))}
                                                    onAspectRatioChange={(ratio) => setConfig(prev => ({ ...prev, aspectRatio: ratio }))}
                                                    onImageSizeChange={(size) => setConfig(prev => ({ ...prev, imageSize: size }))}
                                                    availableRatios={availableRatios}
                                                    availableSizes={availableSizes}
                                                />
                                            ) : (
                                                <VideoOptionsPanel
                                                    aspectRatio={config.aspectRatio}
                                                    resolution={config.videoResolution || '720p'}
                                                    duration={config.videoDuration || '4s'}
                                                    audio={config.videoAudio || false}
                                                    onAspectRatioChange={(ratio) => setConfig(prev => ({ ...prev, aspectRatio: ratio }))}
                                                    onResolutionChange={(res) => setConfig(prev => ({ ...prev, videoResolution: res }))}
                                                    onDurationChange={(dur) => setConfig(prev => ({ ...prev, videoDuration: dur }))}
                                                    onAudioChange={(audio) => setConfig(prev => ({ ...prev, videoAudio: audio }))}
                                                    availableRatios={availableRatios}
                                                    supportsAudio={!!getModelCapabilities(config.model)?.supportsVideoAudio}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Removed duplicate ratio and size controls - now only in options panel */}
                            {/* End of Left Group Items */}

                            {/* Right: Actions Group */}
                            {/* Group 1: Network & Provider Settings - Hidden on mobile for compact layout */}
                            {/* Group 1: Network & Provider Settings - 只在支持时显示 */}
                            {!isMobile && (groundingSupported || imageSearchSupported) && (
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <div
                                        className="flex items-center gap-1.5 px-1 py-0.5 rounded-lg h-10 transition-all duration-200 border border-[var(--border-light)] bg-[var(--bg-tertiary)]"
                                        style={{
                                            opacity: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 0 : 1,
                                            visibility: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 'hidden' : 'visible',
                                            pointerEvents: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 'none' : 'auto'
                                        }}
                                    >
                                        {/* Grounding Tool */}
                                        {groundingSupported && (
                                            <button
                                                className={`flex items-center gap-1.5 px-2 h-full rounded-md transition-all text-[11px] font-medium whitespace-nowrap ${config.enableGrounding
                                                    ? 'bg-indigo-500/15 text-indigo-500 shadow-sm'
                                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)]'
                                                    }`}
                                                onClick={() => setConfig(prev => ({ ...prev, enableGrounding: !prev.enableGrounding }))}
                                                title="Google 搜索 (实时信息)"
                                            >
                                                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M2 8.8a15 15 0 0 1 20 0" />
                                                    <path d="M5 12.5a10 10 0 0 1 14 0" />
                                                    <path d="M8.5 16.3a5 5 0 0 1 7 0" />
                                                    <line x1="12" y1="20" x2="12.01" y2="20" />
                                                </svg>
                                                <span>谷歌搜索</span>
                                            </button>
                                        )}

                                        {/* 垂直分界线 */}
                                        {groundingSupported && imageSearchSupported && (
                                            <div className="w-[1px] h-4 bg-[var(--border-light)] mx-0.5" />
                                        )}

                                        {imageSearchSupported && (
                                            <button
                                                className={`flex items-center gap-1.5 px-2 h-full rounded-md transition-all text-[11px] font-medium whitespace-nowrap ${config.enableImageSearch
                                                    ? 'bg-indigo-500/15 text-indigo-500 shadow-sm'
                                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)]'
                                                    }`}
                                                onClick={() => setConfig(prev => ({ ...prev, enableImageSearch: !prev.enableImageSearch }))}
                                                title="图片搜索 (参考网络图片)"
                                            >
                                                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                                    <path d="M21 15l-5-5L5 21" />
                                                </svg>
                                                <span>图片搜索</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Group 2: Generation Settings - Hidden on mobile for compact footer */}
                            {!isMobile && (
                                <div className="flex items-center gap-0.5 p-0.5 rounded-lg border h-10 shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }}>
                                    {/* Parallel Count */}
                                    <div className="relative h-full">
                                        <button
                                            className="flex items-center gap-1.5 px-3 h-full rounded-md transition-all whitespace-nowrap text-[11px] font-medium hover:bg-white/5"
                                            style={{ color: 'var(--text-secondary)' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMenu('count');
                                            }}
                                            title="并发数量"
                                        >
                                            <span className="text-[11px] font-medium">{config.parallelCount} 张</span>
                                            <svg className={`w-2.5 h-2.5 opacity-50 flex-shrink-0 transition-transform duration-200 ${activeMenu === 'count' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                                        </button>
                                        {
                                            activeMenu === 'count' && (
                                                <div className="absolute bottom-full mb-2 z-20" style={{ left: '50%', transform: 'translateX(-50%)' }}>
                                                    <div className="dropdown static w-24 animate-scaleIn origin-bottom p-1 flex flex-col gap-1" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)', boxShadow: 'var(--shadow-lg)' }}>
                                                        {(config.mode === GenerationMode.PPT
                                                            ? Array.from({ length: 20 }, (_, i) => i + 1)
                                                            : [1, 2, 3, 4]
                                                        ).map(count => (
                                                            <button key={count} className={`dropdown-item justify-between rounded-md ${config.parallelCount === count ? 'active' : ''}`} onClick={() => { setConfig(prev => ({ ...prev, parallelCount: count })); setActiveMenu(null); }}>
                                                                <span>{count} 张</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        }

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
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 flex items-center gap-2"
                                                >
                                                    {getPinnedModels().includes(contextMenu.modelId) ? '❌ 取消置顶' : '📌 置顶模型'}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const custom = modelCustomizations[contextMenu.modelId] || {};
                                                        setModelSettingsModal({
                                                            modelId: contextMenu.modelId,
                                                            alias: custom.alias || '',
                                                            description: custom.description || ''
                                                        });
                                                        setContextMenu(null);
                                                    }}
                                                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 flex items-center gap-2"
                                                >
                                                    ⚙️ 设置
                                                </button>
                                            </div>,
                                            document.body
                                        )}

                                        {/* Model Settings Modal */}
                                        {modelSettingsModal && ReactDOM.createPortal(
                                            <div
                                                className="fixed inset-0 z-[10020] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                                                onClick={() => setModelSettingsModal(null)}
                                            >
                                                <div
                                                    className="bg-[#1e1e20] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-5 space-y-4"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <h3 className="text-lg font-bold text-white">模型设置</h3>
                                                        <button onClick={() => setModelSettingsModal(null)} className="text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-white">✕</button>
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-zinc-500 font-mono break-all">ID: {modelSettingsModal.modelId}</div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">显示别名</label>
                                                        <input
                                                            value={modelSettingsModal.alias}
                                                            onChange={(e) => setModelSettingsModal({ ...modelSettingsModal, alias: e.target.value })}
                                                            placeholder="留空则使用默认名称"
                                                            className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">模型介绍</label>
                                                        <textarea
                                                            value={modelSettingsModal.description}
                                                            onChange={(e) => setModelSettingsModal({ ...modelSettingsModal, description: e.target.value })}
                                                            placeholder="留空则使用默认介绍"
                                                            rows={2}
                                                            className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                                                        />
                                                    </div>
                                                    <div className="flex justify-end gap-2 pt-2">
                                                        <button
                                                            onClick={() => setModelSettingsModal(null)}
                                                            className="px-4 py-2 rounded-lg text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-white hover:bg-white/5"
                                                        >
                                                            取消
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                // Placeholder function
                                                                setModelSettingsModal(null);
                                                            }}
                                                            className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
                                                        >
                                                            保存
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>,
                                            document.body
                                        )}
                                    </div>
                                </div>
                            )}                            {/* 🚀 发送按钮 - 积分专属样式 */}
                            <CreditSendButton
                                isCreditModel={isNanoBanana2}
                                creditCost={totalCreditCost}
                                balance={balance}
                                hasPrompt={!!config.prompt}
                                colorStart={availableModels.find((m: any) => m.id === config.model)?.colorStart}
                                colorEnd={availableModels.find((m: any) => m.id === config.model)?.colorEnd}
                                onClick={() => {
                                    if (isNanoBanana2 && totalCreditCost > 0 && balance < totalCreditCost) {
                                        notify.error('积分不足', `使用当前配置需要 ${totalCreditCost} 积分，当前余额: ${balance}，请充值。`);
                                        return;
                                    }
                                    onGenerate();
                                }}
                            />
                        </div>
                    </PromptBarFooter>
                </div>

                <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={(e) => e.target.files && processFiles(e.target.files)} />

                {/* 参考图放大浮层 */}
                {
                    previewImage && (
                        <ImagePreview
                            imageUrl={previewImage!.url}
                            originRect={previewImage!.originRect}
                            onClose={() => setPreviewImage(null)}
                        />
                    )
                }

                {/* Inpaint Modal */}
                {
                    inpaintImage && (
                        <InpaintModal
                            imageUrl={inpaintImage!.url}
                            onCancel={() => setInpaintImage(null)}
                            onSave={(maskBase64) => {
                                setConfig(prev => ({
                                    ...prev,
                                    maskUrl: maskBase64,
                                    editMode: 'inpaint'
                                }));
                                setInpaintImage(null);
                            }}
                        />
                    )
                }
            </div>
        </>
    );
};

export default PromptBar;
