import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { GenerationConfig, AspectRatio, ImageSize, GenerationMode, ModelType } from '../../types';
import { modelRegistry, ActiveModel } from '../../services/model/modelRegistry';
import { keyManager, getModelMetadata } from '../../services/auth/keyManager'; // Added getter
import { getModelCapabilities, getAvailableSizes, modelSupportsGrounding, getModelDisplayInfo, getModelDescription, getModelThemeColor, getModelThemeBgColor, getModelDisplayName } from '../../services/model/modelCapabilities';
import ModelLogo from '../common/ModelLogo';
import { calculateImageHash, compressImageFile } from '../../utils/imageUtils';
import { saveImage, getImage } from '../../services/storage/imageStorage'; // [NEW] Import getImage
import { fileSystemService } from '../../services/storage/fileSystemService'; // 馃殌 鍙傝€冨浘鎸佷箙鍖?
import { notify } from '../../services/system/notificationService';
import ImageOptionsPanel from '../image/ImageOptionsPanel';
import VideoOptionsPanel from '../video/VideoOptionsPanel';
import ImagePreview from '../image/ImagePreview';
import { sortModels, toggleModelPin, getPinnedModels, filterAndSortModels } from '../../utils/modelSorting';
import { X, Search, LayoutDashboard, Key, DollarSign, HardDrive, ScrollText, ChevronRight, ChevronUp, Activity, AlertTriangle, Plus, Trash2, FolderOpen, Globe, Loader2, RefreshCw, Copy, Check, Pause, Play, Zap, Mic, Camera, Brain, Video, Star, Sparkles, ArrowUp, Wand2 } from 'lucide-react'; // [NEW] Mobile Icons & Star & Sparkles & Wand2
import { InpaintModal } from '../image/InpaintModal';
import { BUILTIN_PROMPT_LIBRARY, PromptLibraryItem } from '../../config/promptLibrary';
import {
    getAvailablePromptOptimizerTemplates,
    getDefaultPromptOptimizerTemplateId,
    getPromptOptimizerTemplate,
} from '../../config/promptOptimizerTemplates';
import { useBilling } from '../../context/BillingContext';
import { useAuth } from '../../context/AuthContext';
import { calculateCost } from '../../services/billing/costService';
import { isCreditBasedModel, getModelCredits } from '../../services/model/modelPricing';
import { getConfiguredProviderColor, hexToRgba } from '../../utils/modelBadge';
import PromptBarTopRow from './prompt-bar/PromptBarTopRow';
import PromptBarFooter from './prompt-bar/PromptBarFooter';
import { buildPromptFeatureHealthReport } from '../../utils/promptFeatureHealth';

const MOBILE_OPEN_PROMPT_LIBRARY_EVENT = 'kk-mobile-open-prompt-library';

// [Animation Styles] Mode switcher animations
const ModeSwitcherStyles = () => (
    <style>{`
        @keyframes pulse-once {
            0% { transform: scale(1); }
            50% { transform: scale(1.15); }
            100% { transform: scale(1); }
        }
        .animate-pulse-once {
            animation: pulse-once 0.4s ease-out;
        }

        @keyframes glow-pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.8; }
        }

        .mode-slider-glow {
            animation: glow-pulse 2s ease-in-out infinite;
        }
    `}</style>
);

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
        // 馃殌 [Fix] If parent provided data and it's NOT a blob URL, use it directly
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
            <div className="w-12 h-12 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center justify-center flex-col gap-0.5" title="鍥剧墖鍔犺浇澶辫触">
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
            title="鐐瑰嚮鏀惧ぇ鏌ョ湅"
        >
            <img
                src={src}
                className="w-full h-full object-cover"
                alt="鍙傝€冨浘"
            />
        </div>
    );
};

// 璁＄畻姣斾緥鍥炬爣鐨勫昂瀵?
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

// 娓叉煋姣斾緥鍥炬爣
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
 * 馃殌 [缁熶竴] 棰滆壊鏍煎紡鏍囧噯鍖栧嚱鏁?
 * 纭繚瑙﹀彂鎸夐挳銆佷笅鎷夊垪琛ㄣ€佸彂閫佹寜閽殑棰滆壊娓叉煋瀹屽叏涓€鑷?
 * 鏀寔 HEX (甯?涓嶅甫 #)銆丠SL銆乺gb() 绛夋牸寮?
 */
function normalizeColor(color: string | undefined, fallback: string): string {
    if (!color || color === 'undefined' || color === 'null' || color.trim() === '') {
        return fallback;
    }
    const trimmed = color.trim();
    // 宸茬粡鏄悎娉?CSS 棰滆壊鏍煎紡锛坔sl/rgb/rgba/var 绛夛級锛岀洿鎺ヨ繑鍥?
    if (trimmed.startsWith('hsl') || trimmed.startsWith('rgb') || trimmed.startsWith('var')) {
        return trimmed;
    }
    // HEX 鏍煎紡锛氱‘淇濇湁 # 鍓嶇紑
    if (trimmed.startsWith('#')) {
        return trimmed;
    }
    // 绾?hex 鏁板瓧锛堟棤 # 鍓嶇紑锛夛紝琛ヤ笂 #
    if (/^[A-Fa-f0-9]{3,8}$/.test(trimmed)) {
        return `#${trimmed}`;
    }
    // 鍏朵粬鎯呭喌鍘熸牱杩斿洖锛堝彲鑳芥槸鍚堟硶鐨?CSS 棰滆壊鍚?濡?'orange'锛?
    return trimmed;
}

function normalizeModelTextColor(textColor: string | undefined): string {
    return textColor === 'black' ? '#111827' : '#ffffff';
}

function getProviderAccentStyle(provider?: string): React.CSSProperties | undefined {
    const accent = getConfiguredProviderColor(provider);
    if (!accent) return undefined;

    return {
        color: accent,
        backgroundColor: hexToRgba(accent, 0.14),
        borderColor: hexToRgba(accent, 0.3),
    };
}

function getModelSourceScope(model: Pick<ActiveModel, 'id' | 'isSystemInternal'>): 'system' | 'user' | 'official' {
    if (model.isSystemInternal) return 'system';
    return String(model.id || '').includes('@') ? 'user' : 'official';
}

function getModelSourceLabel(model: Pick<ActiveModel, 'id' | 'isSystemInternal'>): string {
    const scope = getModelSourceScope(model);
    if (scope === 'system') return '绯荤粺绉垎妯″瀷';
    if (scope === 'user') return '鐢ㄦ埛 / 绗笁鏂?API';
    return '瀹樻柟鐩磋繛妯″瀷';
}

// 馃殌 [娣诲姞] 绉垎涓撳睘鍙戦€佹寜閽粍浠?
interface CreditSendButtonProps {
    isCreditModel: boolean;
    creditCost: number;
    balance: number;
    hasPrompt: boolean;
    colorStart?: string;
    colorEnd?: string;
    textColor?: string;
    isGenerating?: boolean;
    isMobile?: boolean;
    onClick: () => void;
}

const CreditSendButton: React.FC<CreditSendButtonProps> = ({
    isCreditModel,
    creditCost,
    balance,
    hasPrompt,
    colorStart,
    colorEnd,
    textColor,
    isGenerating,
    isMobile = false,
    onClick
}) => {
    // 鍒ゆ柇绉垎鏄惁涓嶈冻
    const isInsufficient = isCreditModel && creditCost > 0 && balance < creditCost && !isGenerating;

    // 璁＄畻鏄惁绂佺敤
    const isDisabled = !hasPrompt || !!isGenerating;
    const resolvedStart = normalizeColor(colorStart, '#3B82F6');
    const resolvedEnd = normalizeColor(colorEnd, '#2563EB');
    const resolvedTextColor = normalizeColor(textColor, '#FFFFFF');
    const buttonStyle: React.CSSProperties = isInsufficient
        ? {
            background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.92) 0%, rgba(220, 38, 38, 0.96) 52%, rgba(153, 27, 27, 0.92) 100%)',
            color: '#fff1f2',
            border: '1px solid rgba(254, 202, 202, 0.3)',
            boxShadow: '0 18px 36px rgba(127, 29, 29, 0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
            backdropFilter: 'blur(20px) saturate(170%)',
            WebkitBackdropFilter: 'blur(20px) saturate(170%)'
        }
        : isCreditModel
            ? {
                background: `linear-gradient(135deg, ${resolvedStart} 0%, ${resolvedEnd} 100%)`,
                color: resolvedTextColor,
                border: '1px solid rgba(255,255,255,0.22)',
                boxShadow: '0 18px 38px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255,255,255,0.16)',
                backdropFilter: 'blur(20px) saturate(170%)',
                WebkitBackdropFilter: 'blur(20px) saturate(170%)',
                opacity: isDisabled ? 0.58 : 1
            }
            : {
                background: 'linear-gradient(135deg, #3f3f46 0%, #52525b 100%)',
                color: '#fafafa',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 16px 34px rgba(24, 24, 27, 0.28), inset 0 1px 0 rgba(255,255,255,0.08)',
                backdropFilter: 'blur(18px) saturate(155%)',
                WebkitBackdropFilter: 'blur(18px) saturate(155%)',
                opacity: isDisabled ? 0.56 : 1
            };
    const dividerClassName = isInsufficient
        ? 'bg-white/18'
        : isCreditModel
            ? resolvedTextColor === '#111827'
                ? 'bg-black/18'
                : 'bg-white/18'
            : 'bg-white/12';
    const arrowSurfaceStyle: React.CSSProperties = isInsufficient
        ? {
            background: 'rgba(255, 255, 255, 0.14)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            color: '#ffffff'
        }
        : isCreditModel
            ? {
                background: resolvedTextColor === '#111827' ? 'rgba(255,255,255,0.48)' : 'rgba(255,255,255,0.18)',
                border: resolvedTextColor === '#111827' ? '1px solid rgba(17,24,39,0.08)' : '1px solid rgba(255,255,255,0.18)',
                color: resolvedTextColor
            }
            : {
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#ffffff'
            };

    // 馃殌 [绉垎妯″瀷涓撳睘] 浣跨敤妯″瀷涓婚鑹茬殑娓愬彉鏍峰紡 - 鏇寸簿鑷寸殑鐜荤拑鎬佹晥鏋?
    const getGradientStyle = () => {
        if (!isCreditModel || isDisabled) return {};
        const start = normalizeColor(colorStart, '#3B82F6');
        const end = normalizeColor(colorEnd, '#2563EB');
        return {
            background: `linear-gradient(135deg, ${start} 0%, ${end} 100%)`,
            boxShadow: `0 2px 8px 0 ${start}50, inset 0 1px 0 0 rgba(255,255,255,0.2)`
        };
    };

    // 馃殌 [鏅€氭ā鍨?绂佺敤鐘舵€乚 鏍峰紡
    const getDefaultStyle = () => {
        if (isDisabled) {
            return { className: 'bg-gray-100 dark:bg-zinc-800/50 cursor-not-allowed opacity-50' };
        }
        if (isInsufficient) {
            return { className: 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20' };
        }

        // 濡傛灉鏈夎嚜瀹氫箟棰滆壊锛屽垯浣跨敤鑷畾涔夋笎鍙橈紝鍚﹀垯浣跨敤榛樿绫?
        return {
            className: 'border border-[var(--border-light)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] shadow-sm hover:bg-[var(--bg-hover)] hover:border-[var(--border-medium)]'
        };
    };

    // 馃殌 [鍔ㄧ敾] 绠ご浠庡乏鍒板彸鐨勬粦鍔ㄥ姩鐢诲叧閿抚
    const arrowAnimStyle = `
        @keyframes arrow-slide-right {
            0% { transform: translateX(-3px); opacity: 0.4; }
            50% { transform: translateX(2px); opacity: 1; }
            100% { transform: translateX(-3px); opacity: 0.4; }
        }
    `;
    const creditUnitLabel = '\u79ef\u5206';
    const sendLabel = '\u53d1\u9001';
    const insufficientLabel = '\u79ef\u5206\u4e0d\u8db3';
    const needPrefixLabel = '\u9700';
    const generateWithCreditsLabel = `\u6d88\u8017 ${creditCost} ${creditUnitLabel}\u751f\u6210`;
    const insufficientAriaLabel = `\u79ef\u5206\u4e0d\u8db3\uff0c\u9700\u8981 ${creditCost} ${creditUnitLabel}`;
    const outerButtonClassName = isMobile
        ? 'group relative flex h-10 min-w-[96px] max-w-full shrink-0 items-center gap-2 overflow-visible rounded-full px-3 py-1 pr-1 whitespace-nowrap transition-all duration-300 ease-out'
        : 'group relative ml-auto flex h-[42px] min-w-[104px] max-w-full shrink-0 items-center gap-2.5 overflow-visible rounded-full px-3.5 py-1.5 pr-1.5 whitespace-nowrap transition-all duration-300 ease-out';
    const outerButtonMotionClassName = isDisabled ? 'cursor-not-allowed' : 'hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.985]';
    const creditTextClassName = isMobile ? 'text-[12px] font-semibold tracking-[0.01em]' : 'text-[13px] font-semibold tracking-[0.01em] sm:text-sm';
    const sendTextClassName = isMobile ? 'text-[12px] font-semibold tracking-[0.01em] text-white' : 'text-[13px] font-semibold tracking-[0.01em] text-white sm:text-sm';
    const arrowSurfaceClassName = isMobile
        ? `relative z-10 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full backdrop-blur-md transition-all duration-300 ${!isDisabled ? 'group-hover:translate-x-0.5 group-hover:scale-110' : ''}`
        : `relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full backdrop-blur-md transition-all duration-300 ${!isDisabled ? 'group-hover:translate-x-0.5 group-hover:scale-110' : ''}`;

    // 濡傛灉鏄Н鍒嗘ā鍨嬩笖鏈夋彁绀鸿瘝锛屼娇鐢ㄨ兌鍥婃笎鍙樻牱寮?
    if (isCreditModel && hasPrompt && !isInsufficient) {
        return (
            <>
                <style>{arrowAnimStyle}</style>
                <button
                    onClick={onClick}
                    className={`${outerButtonClassName} ${outerButtonMotionClassName}`}
                    style={buttonStyle}
                    aria-label={generateWithCreditsLabel}
                    disabled={isDisabled}
                >
                    {/* 绉垎娑堣€楁樉绀?*/}
                    <span
                        className="pointer-events-none absolute inset-[1px] rounded-full opacity-90"
                        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 100%)' }}
                    />

                    <div className="relative z-10 flex min-w-0 items-center gap-1.5 pl-0.5">
                        <Sparkles size={15} className="shrink-0" fill="currentColor" />
                        <span className={creditTextClassName}>
                            {creditCost} {creditUnitLabel}
                        </span>
                    </div>

                    {/* 鍒嗛殧绾?*/}
                    <div className={`relative z-10 h-5 w-px shrink-0 ${dividerClassName}`} />

                    {/* 鍙戦€佺澶存寜閽?- 鍐呭祵鍦嗗舰鎸夐挳 馃殌 绠ご鏈濆彸 + 婊戝姩鍔ㄧ敾 */}
                    <div className={arrowSurfaceClassName} style={arrowSurfaceStyle}>
                        {isGenerating ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="transition-transform duration-300"
                                style={{ animation: 'arrow-slide-right 1.5s ease-in-out infinite' }}
                            >
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        )}
                    </div>

                    {/* 鎮仠鎻愮ず - 绮剧‘灞呬腑浜庢暣涓寜閽?*/}
                    <div aria-hidden="true" className="pointer-events-none absolute -top-12 left-1/2 hidden -translate-x-1/2 sm:flex">
                        <div className="relative rounded-full border border-black/10 bg-black/82 px-3 py-1.5 text-xs font-medium text-transparent shadow-lg opacity-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:opacity-100">
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
                                娑堣€?{creditCost} 绉垎鐢熸垚
                            </span>
                            娑堣€?{creditCost} 绉垎鐢熸垚
                            <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-black/82" />
                        </div>
                    </div>
                </button>
            </>
        );
    }

    // 馃殌 [鏅€氱姸鎬?绂佺敤鐘舵€乚 榛樿鏍峰紡 - 鐢ㄦ埛 API 妯″瀷鍙樉绀?鍙戦€?
    return (
        <>
            <style>{arrowAnimStyle}</style>
            <button
                onClick={onClick}
                disabled={isDisabled}
                className={`${outerButtonClassName} ${outerButtonMotionClassName}`}
                style={buttonStyle}
                aria-label={isCreditModel ? (isInsufficient ? insufficientAriaLabel : generateWithCreditsLabel) : sendLabel}
            >
                <span
                    className="pointer-events-none absolute inset-[1px] rounded-full opacity-90"
                    style={{
                        background: isInsufficient
                            ? 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 100%)'
                            : isCreditModel
                                ? 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 100%)'
                                : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)'
                    }}
                />

                <div className="relative z-10 flex min-w-0 items-center gap-2 pl-0.5">
                    {isCreditModel ? (
                        isInsufficient ? (
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={15} className="shrink-0" />
                                <div className="flex items-baseline gap-1.5">
                                    <span className={creditTextClassName}>{insufficientLabel}</span>
                                    <span className={`${isMobile ? 'text-[10px]' : 'text-[11px] sm:text-xs'} font-medium text-white/80`}>{needPrefixLabel}{creditCost}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <Sparkles size={15} className="shrink-0" fill="currentColor" />
                                <span className={creditTextClassName}>
                                    {creditCost} {creditUnitLabel}
                                </span>
                            </div>
                        )
                    ) : (
                        <span className={sendTextClassName}>
                            {sendLabel}
                        </span>
                    )}
                </div>

                <div className={`relative z-10 h-5 w-px shrink-0 ${dividerClassName}`} />

                {/* 鍙戦€佺澶?馃殌 绠ご鏈濆彸 + 鍔ㄧ敾 */}
                <div className={arrowSurfaceClassName} style={arrowSurfaceStyle}>
                    {isGenerating ? (
                        <Loader2 size={15} className="animate-spin" />
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                            className="transition-transform duration-300"
                            style={!isDisabled ? { animation: 'arrow-slide-right 1.5s ease-in-out infinite' } : undefined}
                        >
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                        </svg>
                    )}
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
    onFocus?: () => void;  // 杈撳叆妗嗚幏鍙栫劍鐐规椂璋冪敤
    onBlur?: () => void;   // 杈撳叆妗嗗け鍘荤劍鐐规椂璋冪敤
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

    // [NEW] 鍙傝€冨浘鏀惧ぇ鐘舵€?
    const [previewImage, setPreviewImage] = useState<{ url: string; originRect: DOMRect } | null>(null);
    const [inpaintImage, setInpaintImage] = useState<{ url: string } | null>(null); // [NEW] 灞€閮ㄩ噸缁樻墍闇€鍥惧儚

    const refContainerRef = useRef<HTMLDivElement>(null);
    const optionsPanelRef = useRef<HTMLDivElement>(null); // [NEW] Ref for options panel

    // 鐘舵€侊細閫夐」闈㈡澘鏄剧ず
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
    const availableOptimizerTemplates = useMemo(
        () => getAvailablePromptOptimizerTemplates(config.mode),
        [config.mode],
    );
    const selectedOptimizerTemplate = useMemo(
        () => getPromptOptimizerTemplate(config.promptOptimizationTemplateId, config.mode),
        [config.mode, config.promptOptimizationTemplateId],
    );
    const normalizedOptimizerTemplateId = selectedOptimizerTemplate?.id
        || getDefaultPromptOptimizerTemplateId(config.mode);
    const promptFeatureHealth = useMemo(
        () => buildPromptFeatureHealthReport(BUILTIN_PROMPT_LIBRARY, availableOptimizerTemplates, {
            enablePromptOptimization: !!config.enablePromptOptimization,
            promptOptimizationMode: config.promptOptimizationMode,
            promptOptimizationTemplateId: config.promptOptimizationTemplateId,
            promptOptimizationCustomPrompt: config.promptOptimizationCustomPrompt,
            mode: config.mode,
        }),
        [
            availableOptimizerTemplates,
            config.enablePromptOptimization,
            config.mode,
            config.promptOptimizationCustomPrompt,
            config.promptOptimizationMode,
            config.promptOptimizationTemplateId,
        ],
    );
    const [isInputAreaHovered, setIsInputAreaHovered] = useState(false); // Phase 3: hover state
    const [uploadingCount, setUploadingCount] = useState(0); // [NEW] Uploading indicator count
    const { balance, recharge, loading: billingLoading, showRechargeModal, setShowRechargeModal } = useBilling();

    // 馃殌 [NEW] 妯″瀷鎵嬪姩閿佸畾鏍囪瘑 - 瑙ｅ喅鏇存崲 API 鎴栨ā寮忓悗鑷姩璺崇涓€涓殑闇€姹?
    const [isModelManuallyLocked, setIsModelManuallyLocked] = useState<boolean>(() => {
        try {
            return localStorage.getItem('kk_model_manually_locked') === 'true';
        } catch { return false; }
    });

    // 馃殌 [Fix] 鐩戝惉椤剁疆鍙樺寲浜嬩欢锛岃Е鍙?sortedAvailableModels 閲嶆柊鎺掑簭
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

    // 馃殌 [Deleted] enableOptimize state removed to use config.enablePromptOptimization instead

    useEffect(() => {
        if (config.mode !== GenerationMode.IMAGE && config.mode !== GenerationMode.PPT) {
            return;
        }

        setConfig((prev) => {
            const nextMode = prev.promptOptimizationMode || 'auto';
            const nextTemplateId = getPromptOptimizerTemplate(prev.promptOptimizationTemplateId, prev.mode)?.id
                || normalizedOptimizerTemplateId;
            const nextCustomPrompt = typeof prev.promptOptimizationCustomPrompt === 'string'
                ? prev.promptOptimizationCustomPrompt
                : '';

            if (
                prev.promptOptimizationMode === nextMode
                && prev.promptOptimizationTemplateId === nextTemplateId
                && prev.promptOptimizationCustomPrompt === nextCustomPrompt
            ) {
                return prev;
            }

            return {
                ...prev,
                promptOptimizationMode: nextMode,
                promptOptimizationTemplateId: nextTemplateId,
                promptOptimizationCustomPrompt: nextCustomPrompt,
            };
        });
    }, [config.mode, normalizedOptimizerTemplateId, setConfig]);

    const promptHealthSignatureRef = useRef('');
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null); // 3-second hover delay timer
    const touchStartY = useRef<number | null>(null);
    const modelDropdownRef = useRef<HTMLDivElement>(null); // Model dropdown ref
    const modelListScrollRef = useRef<HTMLDivElement>(null); // Model list scroll container ref
    const modelListScrollPos = useRef<number>(0); // Save scroll position

    useEffect(() => {
        if (promptFeatureHealth.issues.length === 0) {
            promptHealthSignatureRef.current = '';
            return;
        }

        const signature = promptFeatureHealth.issues.map((issue) => issue.id).join('|');
        if (promptHealthSignatureRef.current === signature) {
            return;
        }

        promptHealthSignatureRef.current = signature;
        console.warn('[PromptBar] Prompt feature self-check issues:', promptFeatureHealth.issues);

        const primaryIssue = promptFeatureHealth.issues[0];
        notify.warning('鎻愮ず璇嶅姛鑳借嚜妫€', primaryIssue.message);
    }, [promptFeatureHealth]);

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
        if (!isMobile) return;

        const handleOpenPromptLibrary = () => {
            setShowPromptLibrary(true);
            setShowPptOutlinePanel(false);
            setShowOptionsPanel(false);
            setActiveMenu(null);
        };

        window.addEventListener(MOBILE_OPEN_PROMPT_LIBRARY_EVENT, handleOpenPromptLibrary);
        return () => window.removeEventListener(MOBILE_OPEN_PROMPT_LIBRARY_EVENT, handleOpenPromptLibrary);
    }, [isMobile]);

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
            // 鎭㈠婊氬姩浣嶇疆
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
            .map(line => line.replace(/^[-*\d.)銆乗s]+/, '').trim())
            .filter(Boolean);
        setPptOutlineDraft(fromPrompt.join('\n'));
    }, [config.mode, config.pptSlides, config.prompt]);

    useEffect(() => {
        if (config.mode !== GenerationMode.PPT) return;
        if ((config.pptSlides || []).length > 0) return;

        const desiredCount = Math.min(20, Math.max(1, Number(config.parallelCount) || 1));
        if (desiredCount <= 1) return;

        const currentDraftSlides = pptOutlineDraft
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .slice(0, 20);
        if (currentDraftSlides.length > 1) return;

        const topic = String(config.prompt || '').trim() || '涓婚婕旂ず';
        const basePool = [
            `鑳屾櫙涓庨棶棰樺畾涔夛細${topic}`,
            `琛屼笟瓒嬪娍涓庢満浼氾細${topic}`,
            `鐩爣鐢ㄦ埛涓庢牳蹇冨満鏅細${topic}`,
            `瑙ｅ喅鏂规姒傝锛?{topic}`,
            `鏍稿績鑳藉姏涓庡樊寮傚寲锛?{topic}`,
            `鍏抽敭鏁版嵁涓庤瘉鎹細${topic}`,
            `鍏稿瀷妗堜緥涓庡簲鐢ㄧず渚嬶細${topic}`,
            `钀藉湴璺緞涓庡疄鏂芥楠わ細${topic}`,
            `椋庨櫓璇勪及涓庡簲瀵圭瓥鐣ワ細${topic}`,
            `閲岀▼纰戜笌璺嚎鍥撅細${topic}`,
            `璧勬簮闇€姹備笌鍗忓悓鏈哄埗锛?{topic}`,
            `棰勬湡鏀剁泭涓庤瘎浼版寚鏍囷細${topic}`
        ];
        const nextSlides: string[] = [`封面：${topic}`];
        if (desiredCount >= 3) {
            nextSlides.push(`目录：${topic} 的核心章节`);
        }
        const remainForMiddle = Math.max(0, desiredCount - 1 - nextSlides.length);
        for (let i = 0; i < remainForMiddle; i++) {
            nextSlides.push(basePool[i % basePool.length]);
        }
        if (nextSlides.length < desiredCount) {
            nextSlides.push(`总结与行动建议：${topic}`);
        }
        const nextDraft = nextSlides.join('\n');
        if (nextDraft !== pptOutlineDraft) {
            setPptOutlineDraft(nextDraft);
        }
    }, [config.mode, config.parallelCount, config.pptSlides, config.prompt, pptOutlineDraft]);

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
        // 馃殌 [Fix] 鍒濆鍔犺浇鏃跺埛鏂版ā鍨嬪垪琛紝纭繚鑾峰彇鏈€鏂扮殑 admin models
        const refreshModels = async () => {
            try {
                const { adminModelService } = await import('../../services/model/adminModelService');
                console.log('[PromptBar] Loading admin models...');
                await adminModelService.forceLoadAdminModels?.();
                // 馃殌 [Fix] 绛夊緟涓€灏忔鏃堕棿纭繚鏁版嵁宸插啓鍏?
                await new Promise(r => setTimeout(r, 100));
                const newModels = keyManager.getGlobalModelList();
                console.log('[PromptBar] Loaded models:', newModels.length);
                // 馃殌 [Debug] 鎵撳嵃绉垎妯″瀷鐨勯鑹?
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

            // 馃殌 [Fix] 浼樺厛浣跨敤鍘熷妯″瀷鐨勯鑹插拰绠＄悊鍛橀厤缃?
            return {
                id: m.id,
                label: m.name || m.id,
                provider: m.provider,
                providerLabel: m.providerLabel,
                isSystemInternal: m.isSystemInternal,
                sourceScope: getModelSourceScope(m),
                sourceLabel: getModelSourceLabel(m),
                type: inferredType,
                enabled: true,
                description: m.description,
                creditCost: m.creditCost,
                colorStart: m.colorStart,
                colorEnd: m.colorEnd,
                colorSecondary: m.colorSecondary,
                textColor: m.textColor,
            } as ActiveModel;
        });

        return step2.filter(m => {
            const type = m.type || 'image';
            // 馃殌 [Fix] 涓ユ牸鎸夋ā寮忚繃婊ゆā鍨嬬被鍨嬶紝涓嶆幒鏉傚叾浠栫被鍨?
            // 馃殌 [Fix] 鏀寔澶氭ā鎬佹ā鍨嬶細image+chat 鍦?image 妯″紡涓嬩篃鍙敤
            if (config.mode === GenerationMode.IMAGE) return type === 'image' || type === 'image+chat';
            if (config.mode === GenerationMode.PPT) return type === 'image' || type === 'image+chat';
            if (config.mode === GenerationMode.VIDEO) return type === 'video';
            if (config.mode === GenerationMode.AUDIO) return type === 'audio';
            return type === config.mode;
        });
    }, [globalModels, config.mode]);

    const sortedAvailableModels = useMemo(() => {
        return filterAndSortModels(availableModels, '', modelCustomizations);
        // 馃殌 [Fix] 鍔犲叆 pinnedVersion 渚濊禆锛岀‘淇濋《缃彉鍖栨椂閲嶆柊鎺掑簭
    }, [availableModels, modelCustomizations, pinnedVersion]);

    const getDefaultImageSizeForModel = useCallback((modelId: string): ImageSize => {
        const supported = getAvailableSizes(modelId);
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

    // 馃殌 [澧炲己鐗堟ā鍨嬭嚜鍔ㄩ€夋嫨閫昏緫]
    // 閫昏緫锛?. 濡傛灉褰撳墠閫変腑鐨勬ā鍨嬪凡澶辨晥锛堜笉鍦ㄥ綋鍓嶅彲鐢ㄥ垪琛ㄤ腑锛夛紝鍒欏繀椤婚噸鏂伴€変竴涓€?
    //       2. 濡傛灉褰撳墠妯″紡鍙戠敓鍙樺寲锛堢敱 config.mode 瑙﹀彂锛夛紝涓旂敤鎴峰苟鏈€滄墜鍔ㄩ攣瀹氣€濇ā鍨嬶紝鍒欓粯璁よ烦鍒扮涓€涓紙婊¤冻鈥滀紭鍏堥《缃€濋渶姹傦級銆?
    useEffect(() => {
        if (sortedAvailableModels.length === 0) return;

        const currentModelValid = sortedAvailableModels.find(m => m.id === config.model);
        const firstModelId = sortedAvailableModels[0].id;

        // 浠呭湪浠ヤ笅鎯呭喌閲嶇疆涓虹涓€涓ā鍨嬶細
        // 1. 褰撳墠妯″瀷瀹屽叏澶辨晥
        // 2. 褰撳墠鏄垰杩涘叆褰撳墠妯″紡锛屼笖鐢ㄦ埛娌℃湁鎵嬪姩閿佸畾閫夋嫨
        const isInitialSelectInMode = !isModelManuallyLocked && config.model !== firstModelId;
        const shouldResetToFirst = !currentModelValid || isInitialSelectInMode;

        if (shouldResetToFirst) {
            setConfig(prev => {
                const newModel = firstModelId;
                // 馃殌 [Fix] 鏅鸿兘鍙傛暟淇濇寔锛氳幏鍙栨柊妯″瀷鏀寔鐨勫弬鏁?
                const newModelCaps = getModelCapabilities(newModel);
                const supportedSizes = getAvailableSizes(newModel);
                const supportedRatios = newModelCaps?.supportedRatios?.length ? newModelCaps.supportedRatios : Object.values(AspectRatio);

                // 妫€鏌ュ綋鍓嶅弬鏁版槸鍚﹁鏂版ā鍨嬫敮鎸侊紝鏀寔鍒欎繚鎸侊紝涓嶆敮鎸佸垯鍥為€€鍒伴粯璁ゅ€?
                const newImageSize = supportedSizes.includes(prev.imageSize) ? prev.imageSize : getDefaultImageSizeForModel(newModel);
                const newAspectRatio = supportedRatios.includes(prev.aspectRatio) ? prev.aspectRatio : getDefaultAspectForModel(newModel);

                return { ...prev, model: newModel, imageSize: newImageSize, aspectRatio: newAspectRatio };
            });
        }
    }, [config.mode, sortedAvailableModels, setConfig, getDefaultImageSizeForModel, getDefaultAspectForModel]); // 绉婚櫎浜?isModelManuallyLocked 鍜?config.model 渚濊禆锛岄伩鍏嶉€変腑鍚庨噸澶嶈Е鍙?

    // Get available ratios and sizes based on model capabilities
    const modelCaps = useMemo(() => {
        return getModelCapabilities(config.model);
    }, [config.model]);

    const availableRatios = useMemo(() => {
        const ratios = modelCaps?.supportedRatios;
        return ratios && ratios.length > 0 ? ratios : Object.values(AspectRatio);
    }, [modelCaps]);

    const availableSizes = useMemo(() => {
        const sizes = getAvailableSizes(config.model);
        return sizes && sizes.length > 0 ? sizes : Object.values(ImageSize);
    }, [config.model]);

    const groundingSupported = useMemo(() => {
        return modelSupportsGrounding(config.model);
    }, [config.model]);

    const thinkingSupported = useMemo(() => {
        return !!modelCaps?.supportsThinking;
    }, [modelCaps]);

    const imageSearchSupported = useMemo(() => {
        return !!modelCaps?.supportsImageSearch;
    }, [modelCaps]);

    // 馃殌 [Note] 璁¤垂閫昏緫宸茬Щ闄わ紝鍐呯疆鍔犻€熷姛鑳戒笉鍐嶅彲鐢?
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

    // 馃殌 [ID Healing] 鑷姩杩佺Щ鏃х殑鍐呯疆妯″瀷 ID 鍒版柊鐨?@system 鍛藉悕绌洪棿
    useEffect(() => {
        const currentModelId = config.model || '';
        if (!currentModelId || currentModelId.includes('@')) return;

        // 濡傛灉褰撳墠妯″瀷 ID 鍦ㄥ垪琛ㄤ腑鎵句笉鍒帮紝灏濊瘯鍔犱笂 @system 鏌ユ壘
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
        // 馃殌 [淇] 鏍规嵁妯″瀷鍔ㄦ€佽幏鍙栨渶澶у弬鑰冨浘鏁伴噺
        const modelCaps = getModelCapabilities(config.model);
        const maxRefImages = modelCaps?.maxRefImages ?? 5; // 榛樿 5 寮狅紝Gemini 3 Pro 鏀寔 10 寮?

        if (config.referenceImages.length >= maxRefImages) {
            notify.warning('参考图数量限制', `最多只能上传 ${maxRefImages} 张参考图`);
            return;
        }

        const remainingSlots = maxRefImages - config.referenceImages.length;
        const fileArray = Array.from(files).filter(f => {
            // 鏍规嵁褰撳墠妯″紡鍐冲畾鎺ュ彈浠€涔堢被鍨嬬殑鏂囨。
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
                id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substring(2),
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
                let file = filesToProcess[index];
                try {
                    // Downscale image if it is too massive, avoiding memory or size limit issues
                    if (file.type.startsWith('image/')) {
                        file = await compressImageFile(file);
                    }

                    const result = await readAsDataUrl(file);

                    // Robust Data URL parsing without greedy Regex to avoid Maximum Call Stack Size Exceeded
                    const commaIdx = result.indexOf(',');
                    if (commaIdx === -1) {
                        throw new Error('INVALID_IMAGE_DATA_FORMAT');
                    }

                    const header = result.substring(0, commaIdx);
                    const data = result.substring(commaIdx + 1);

                    let mimeType = 'image/png';
                    const mimeMatch = header.match(/^data:([^;]+);base64$/i);
                    if (mimeMatch && mimeMatch[1]) {
                        mimeType = mimeMatch[1];
                    }
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
                    notify.error('鍙傝€冨浘澶勭悊澶辫触', String(err));
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
                notify.info('宸茶烦杩囬噸澶嶅弬鑰冨浘', `妫€娴嬪埌 ${duplicateCount} 寮犻噸澶嶅浘鐗囷紝鏈噸澶嶆坊鍔犮€俙);
            }
        } finally {
        }
    }, [config.referenceImages, setConfig]);

    const toggleMenu = useCallback((menu: string) => {
        setShowOptionsPanel(false); // 鍏抽棴Options Panel
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
            // 濮嬬粓鍏佽鍙戦€佹柊璇锋眰锛屽嵆浣挎鍦ㄧ敓鎴愪腑
            onGenerate();
        }
    }, [onGenerate]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const imageFiles: File[] = [];
        let hasImage = false;

        // 1. Prioritize native files collection (OS copied files)
        if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
            for (let i = 0; i < e.clipboardData.files.length; i++) {
                const file = e.clipboardData.files[i];
                if (file.type.startsWith('image/')) {
                    imageFiles.push(file);
                    hasImage = true;
                }
            }
        }

        const items = e.clipboardData?.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                // If we already got the image from .files, avoid duplicates, but items have no direct names usually.
                // However, items[i].getAsFile() returns the same file.
                // We just rely on items for text/plain URL fetching if no native image files were found.
                if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file && !imageFiles.some(f => f.name === file.name && f.size === file.size)) {
                        imageFiles.push(file);
                        hasImage = true;
                    }
                } else if (!hasImage && items[i].type === 'text/plain') {
                    // Handle Image URL Paste if no image files were directly copied
                    items[i].getAsString((text) => {
                        const url = text.trim();
                        if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || url.startsWith('http')) {
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
                                .catch(() => { });
                        }
                    });
                }
            }
        }

        if (imageFiles.length > 0) {
            e.preventDefault();
            processFiles(imageFiles);
        }
    }, [processFiles]);

    const dragCounter = useRef(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragSafetyTimer = useRef<NodeJS.Timeout | null>(null);

    // [FIX] 4绉掓棤鎿嶄綔鑷姩澶嶄綅锛堥槻姝㈠崱椤匡級
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
        notify.success('提示词已插入', '已追加到输入框，可继续编辑后发送生成');
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
            return `${topic} - 第 ${pageNo} 页核心内容`;
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
        notify.success('PPT 页纲已应用', `已设置 ${nextCount} 页，生成时将按图1~图${nextCount} 输出`);
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
        next.splice(index + 1, 0, `鏂伴〉闈?${Math.min(20, index + 2)}`);
        setPptOutlineDraft(next.slice(0, 20).join('\n'));
    }, [parsePptSlides, pptOutlineDraft]);

    const appendPptTemplateSlide = useCallback((template: 'cover' | 'agenda' | 'section' | 'summary') => {
        const slides = parsePptSlides(pptOutlineDraft);
        if (slides.length >= 20) return;
        const topic = (config.prompt || '').trim() || '主题演示';
        const text = template === 'cover'
            ? `封面：${topic}`
            : template === 'agenda'
                ? `目录页：${topic} 内容结构与章节安排`
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
            parallelCount: slides.length > 0
                ? Math.max(Math.max(1, prev.parallelCount || 1), Math.min(20, slides.length))
                : Math.max(1, prev.parallelCount || 1)
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
            label: '鍥剧墖',
            icon: Camera,
            color: '#8b5cf6',
            activeBg: 'rgba(139,92,246,0.18)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.IMAGE, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.VIDEO,
            label: '瑙嗛',
            icon: Video,
            color: '#a855f7',
            activeBg: 'rgba(168,85,247,0.18)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.VIDEO, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.AUDIO,
            label: '闊充箰',
            icon: Mic,
            color: '#ec4899',
            activeBg: 'rgba(236,72,153,0.18)',
            onSelect: () => setConfig(prev => ({ ...prev, mode: GenerationMode.AUDIO, parallelCount: Math.min(4, Math.max(1, prev.parallelCount || 1)) }))
        },
        {
            mode: GenerationMode.PPT,
            label: 'PPT',
            icon: LayoutDashboard,
            color: '#0ea5e9',
            activeBg: 'rgba(14,165,233,0.18)',
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

                        // 馃殌 [淇] 鏍规嵁妯″瀷鍔ㄦ€佽幏鍙栨渶澶у弬鑰冨浘鏁伴噺
                        const modelCaps = getModelCapabilities(config.model);
                        const maxRefImages = modelCaps?.maxRefImages ?? 5;

                        if (prev.referenceImages.length >= maxRefImages) {
                            notify.warning('鍙傝€冨浘鏁伴噺闄愬埗', `鏈€澶氬彧鑳戒笂浼?${maxRefImages} 寮犲弬鑰冨浘`);
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
                                        // 馃殌 [Fix] IndexedDB 涓病鏈夋暟鎹紝灏濊瘯浠?URL 鑾峰彇
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
                                                            // 淇濆瓨鍒?IndexedDB 浠ヤ究涓嬫鎭㈠
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

        // 2. 澶勭悊鏂囨。 (External files - only if not internal ref)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
            return;
        }

        // 3. 澶勭悊 URL (浠庡浘鐗囧崱鐗囨嫋鎷?- Fallback or External)
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

            // 妫€鏌ユ槸鍚︿负鏈夋晥 URL 鎴?Data URI
            if (url.startsWith('http') || url.startsWith('blob:')) {
                // 鑾峰彇骞惰浆鎹负 File 瀵硅薄浠ュ鐢?processFiles 閫昏緫
                fetch(url)
                    .then(res => res.blob())
                    .then(blob => {
                        const file = new File([blob], "dropped_image.png", { type: blob.type });
                        processFiles([file]);
                    })
                    .catch(err => {
                        console.error("澶勭悊鎷栨嫿 URL 澶辫触:", err);
                    });
            }
        }
    }, [applyPromptTemplate, processFiles]);

    const isModelListEmpty = availableModels.length === 0;
    const currentModel = availableModels.find(m => m.id === config.model);

    // 馃殌 [Fix] 鍒ゆ柇鏄惁涓虹郴缁熺Н鍒嗘ā鍨?
    const getDisplayedCreditCost = useCallback((model?: ActiveModel | null) => {
        if (!model) return 0;
        if (model.isSystemInternal) {
            return getModelCredits(model.id || '', config.imageSize);
        }
        if (typeof model.creditCost === 'number') {
            return model.creditCost;
        }
        return getModelCredits(model.id || '', config.imageSize);
    }, [config.imageSize]);

    const isAdminModel = !!currentModel?.isSystemInternal;
    const useCurrentModelTheme = !!currentModel?.isSystemInternal && !!currentModel?.colorStart && !!currentModel?.colorEnd;
    // 馃殌 浼樺厛浣跨敤妯″瀷鑷甫鐨?creditCost锛屽鏋滄病鏈夊垯閫氳繃 getModelCredits 鏌ヨ
    const currentCreditCost = isModelListEmpty ? 0 : getDisplayedCreditCost(currentModel);

    // 馃殌 [NEW] 璁＄畻鎬绘垚鏈?(鍗曚环 * 鏁伴噺)
    const totalCreditCost = currentCreditCost * (config.parallelCount || 1);
    const currentModelPrimaryColor = normalizeColor(currentModel?.colorStart, '#3B82F6');
    const currentModelSecondaryColor = normalizeColor(currentModel?.colorSecondary || currentModel?.colorEnd, '#2563EB');
    const currentModelTextColor = normalizeModelTextColor(currentModel?.textColor);
    const currentProviderAccentStyle = getProviderAccentStyle(currentModel?.provider);

    // 优先显示配置别名，其次回退到模型映射名称
    let currentModelName = isModelListEmpty
        ? '无可用模型'

    // 闅愯棌妯″瀷鍚嶅瓧涓嫭鍙峰強鎷彿鍐呯殑鍐呭锛岄伩鍏嶅悕绉拌繃闀胯秴鍑鸿緭鍏ユ
    if (typeof currentModelName === 'string') {
        currentModelName = currentModelName.replace(/\s*[锛圽(].*?[锛塡)]\s*/g, '');
    }

    // 馃殌 [NEW] 鑾峰彇灞曠ず淇℃伅 (鏉ユ簮鏍囩)
    const truncateModelLabel = useCallback((label: string, max = 25) => {
        if (label.length <= max) return label;
        return label.slice(0, max - 1) + '…';
    }, []);

    const truncateProviderLabel = useCallback((label: string) => {
        const max = 5;
        if (label.length <= max) return label;
        return label.slice(0, max - 1) + '…';
    }, []);

    // 馃殌 [NEW] 鑾峰彇灞曠ず淇℃伅 (鏉ユ簮鏍囩) - 闄愬埗25瀛楃闃叉鎸夐挳杩囧
    const displayModelLabel = useMemo(() => {
        return truncateModelLabel(currentModelName, 25);
    }, [currentModelName, truncateModelLabel]);

    // 馃殌 [Mobile Layout] Dock to bottom on mobile
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
    const mobileFloatingSheetBottom = 'calc(env(safe-area-inset-bottom, 0px) + var(--mobile-tabbar-total-height) + var(--mobile-floating-sheet-clearance))';
    const mobileFloatingSheetMaxHeight = 'min(62vh, calc(100vh - var(--mobile-content-top-inset) - env(safe-area-inset-bottom, 0px) - var(--mobile-tabbar-total-height) - var(--mobile-floating-sheet-clearance) - 18px))';

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
    // 瀹藉害绛栫暐锛氶伩鍏嶉儴缃茬幆澧冨瓧浣?缂╂斁宸紓瀵艰嚧搴曢儴鎸夐挳琚尋鍑哄鍣?

    return (
        <>
            <ModeSwitcherStyles />
            <div
                id="prompt-bar-container"
                className={`input-bar ${isMobile ? 'ios-mobile-prompt' : ''} transition-all duration-300 !overflow-visible ${isDragging ? 'ring-2 ring-indigo-500' : ''}`}
                style={{
                    ...(isMobile ? mobileStyle : { bottom: '32px' }),
                    width: isMobile ? mobileStyle.width : '700px',
                    maxWidth: isMobile ? mobileStyle.maxWidth : '700px'
                }}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Drag Overlay */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-indigo-500/20 backdrop-blur-md rounded-[inherit] flex items-center justify-center animate-fadeIn pointer-events-none">
                        <span className="font-bold text-sm text-white drop-shadow-md">閲婃斁娣诲姞鍙傝€冨浘</span>
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
                        <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl border transition-all animate-in slide-in-from-bottom-2 group"
                            style={{
                                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                borderColor: 'rgba(245, 158, 11, 0.2)'
                            }}
                        >
                            <img
                                src={activeSourceImage.url}
                                alt="婧愬浘"
                                className="w-10 h-10 object-cover rounded-lg shadow-sm"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-amber-600 dark:text-amber-500">从此图继续创作</div>
                                <div className="text-xs text-[var(--text-tertiary)] truncate">{activeSourceImage.prompt}</div>
                            </div>
                            <button
                                onClick={onClearSource}
                                className="
                                    flex items-center justify-center w-7 h-7 rounded-lg
                                    bg-amber-500/10 hover:bg-amber-500/20
                                    text-amber-600 dark:text-amber-500
                                    transition-all duration-200
                                    hover:scale-110 active:scale-95
                                    opacity-80 hover:opacity-100
                                "
                                title="鍙栨秷缁х画鍒涗綔"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Top Controls Row: Mode toggle on left, prompt optimizer on right */}
                    <PromptBarTopRow isMobile={isMobile}>
                        {!isMobile && (
                            <div className="flex items-center gap-2">
                                {(() => {
                                const MODE_SLOT_WIDTH = isMobile ? 72 : 82;
                                const sliderWidth = isMobile ? 64 : 74;
                                const sliderLeft = 4 + activeModeIndex * MODE_SLOT_WIDTH + (MODE_SLOT_WIDTH - sliderWidth) / 2;
                                return (
                                    <div className={`
                                        relative inline-flex items-center p-1 rounded-xl border
                                        ${isMobile ? 'min-w-max' : ''}
                                        backdrop-blur-sm
                                    `}
                                        style={{
                                            backgroundColor: 'var(--bg-tertiary)',
                                            borderColor: 'var(--border-light)',
                                            boxShadow: `
                                                0 1px 2px rgba(0,0,0,0.05),
                                                0 0 0 1px rgba(255,255,255,0.02) inset
                                            `,
                                        }}
                                    >
                                        <div
                                            className="absolute top-1 h-[calc(100%-8px)] rounded-lg transition-all duration-500"
                                            style={{
                                                width: `${sliderWidth}px`,
                                                left: `${sliderLeft}px`,
                                                backgroundColor: modeOptions[activeModeIndex]?.activeBg || 'rgba(99,102,241,0.16)',
                                                boxShadow: `
                                                    0 0 20px ${modeOptions[activeModeIndex]?.color || '#818cf8'}30,
                                                    0 2px 8px rgba(0,0,0,0.15) inset,
                                                    0 1px 0 rgba(255,255,255,0.1) inset
                                                `,
                                                transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                                            }}
                                        />

                                        {[1, 2, 3].map((splitIndex) => {
                                            // Calculate if this divider is near the active slider for dynamic effect
                                            const dividerCenter = 4 + splitIndex * MODE_SLOT_WIDTH;
                                            const sliderCenter = sliderLeft + sliderWidth / 2;
                                            const distance = Math.abs(dividerCenter - sliderCenter);
                                            const maxDistance = MODE_SLOT_WIDTH;
                                            const opacity = Math.max(0.04, 0.12 - (distance / maxDistance) * 0.08);
                                            const scaleY = Math.max(0.5, 1 - (distance / maxDistance) * 0.5);

                                            return (
                                                <span
                                                    key={`split-${splitIndex}`}
                                                    className="absolute inset-y-0 my-auto w-px pointer-events-none transition-all duration-500"
                                                    style={{
                                                        left: `${dividerCenter}px`,
                                                        height: `${50 * scaleY}%`,
                                                        backgroundColor: `rgba(255,255,255,${opacity})`,
                                                        transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                    }}
                                                />
                                            );
                                        })}

                                        {modeOptions.map((item) => {
                                            const isActive = config.mode === item.mode;
                                            const Icon = item.icon;
                                            return (
                                                <div key={item.mode} className="relative z-10">
                                                    <button
                                                        className={`
                                                            px-2 py-1.5 rounded-lg font-medium
                                                            ${isMobile ? 'w-[72px] text-[12px]' : 'w-[82px] text-sm'}
                                                            transition-all duration-300 ease-out
                                                            hover:scale-105 active:scale-95
                                                            ${isActive ? 'scale-105' : 'hover:text-[var(--text-primary)]'}
                                                        `}
                                                        style={{
                                                            color: isActive ? item.color : 'var(--text-secondary)',
                                                            textShadow: isActive ? `0 0 12px ${item.color}40` : 'none',
                                                        }}
                                                        onClick={item.onSelect}
                                                    >
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <Icon
                                                                size={isActive ? 14 : 13}
                                                                className={`
                                                                    transition-all duration-300 ease-out
                                                                    ${isActive ? 'animate-pulse-once' : ''}
                                                                `}
                                                                style={{
                                                                    filter: isActive ? `drop-shadow(0 0 6px ${item.color})` : 'none',
                                                                }}
                                                            />
                                                            <span className={`
                                                                transition-all duration-300
                                                                ${isActive ? 'font-semibold tracking-wide' : ''}
                                                            `}>
                                                                {item.label}
                                                            </span>
                                                        </span>
                                                    </button>
                                                </div>
                                        );
                                    })}
                                </div>
                                );
                            })()}
                            </div>
                        )}

                        <div className={`relative flex items-center gap-1 ${isMobile ? 'w-full overflow-x-auto scrollbar-none pb-0.5 flex-nowrap' : ''}`}>
                            {!isMobile && (
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
                                title="鎵撳紑鎻愮ず璇嶅簱"
                            >
                                <span>鎻愮ず璇嶅簱</span>
                            </button>

                            )}

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
                                    title="缂栬緫PPT椤电翰"
                                >
                                    <span>椤电翰</span>
                                </button>
                            )}

                            {!isMobile && (
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
                                title={(config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) ? '开启后会先优化提示词，再发送生成' : '仅图片/PPT 模式支持提示词优化'}
                            >
                                <Wand2 className={`w-3 h-3 ${config.enablePromptOptimization ? 'animate-pulse' : ''}`} />
                                <span className="font-bold">优化提示词</span>
                            </button>

                            )}

                            {showPromptLibrary && (
                                <div
                                    className={isMobile
                                        ? 'fixed left-3 right-3 z-[1005] ios-mobile-floating-sheet rounded-[30px] p-3 shadow-2xl overflow-hidden'
                                        : 'absolute bottom-full right-0 mb-2 z-40 rounded-2xl border shadow-xl p-2 max-w-[calc(100vw-24px)]'}
                                    style={isMobile
                                        ? {
                                            bottom: mobileFloatingSheetBottom,
                                            maxHeight: mobileFloatingSheetMaxHeight,
                                            overscrollBehavior: 'contain',
                                        }
                                        : {
                                            width: 'min(34rem, calc(100vw - 24px))',
                                            backgroundColor: 'var(--bg-secondary)',
                                            borderColor: 'var(--border-medium)'
                                        }}
                                >
                                    <div className={`mb-2 gap-1 ${isMobile ? 'flex flex-wrap items-center' : 'flex items-center'}`}>
                                        <button
                                            className={`px-2 py-1 rounded-md text-[11px] border ${promptLibraryCategory === 'all' ? 'text-blue-400 border-blue-400/40 bg-blue-500/10' : 'text-[var(--text-secondary)] border-[var(--border-light)]'}`}
                                            onClick={() => setPromptLibraryCategory('all')}
                                        >鍏ㄩ儴</button>
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
                                        >閫氱敤</button>
                                        <input
                                            value={promptLibrarySearch}
                                            onChange={(e) => setPromptLibrarySearch(e.target.value)}
                                            placeholder="鎼滅储鏍囬/鍐呭"
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
                                                            >鎻掑叆</button>
                                                            <button
                                                                className="text-[11px] px-2 py-1 rounded-md border border-[var(--border-light)] hover:bg-white/5"
                                                                style={{ color: isFavorite ? '#fbbf24' : 'var(--text-secondary)' }}
                                                                onClick={() => togglePromptFavorite(item.id)}
                                                                title={isFavorite ? '鍙栨秷鏀惰棌' : '鏀惰棌'}
                                                            >收藏</button>
                                                        </div>
                                                    </div>
                                                    {item.source && <div className="text-[10px] mt-1 text-[var(--text-tertiary)]">鏉ユ簮: {item.source}</div>}
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
                                        <div className="text-xs font-semibold text-[var(--text-primary)]">PPT椤电翰锛堟瘡琛屼竴椤碉級</div>
                                        <div className="text-[10px] text-[var(--text-tertiary)]">{Math.min(20, parsePptSlides(pptOutlineDraft).length)} / 20 椤碉紝鐢熸垚缁撴灉鎸夊浘1~鍥綨鍛藉悕</div>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <button
                                            className={`px-2 py-1 rounded-md text-[11px] border ${config.pptStyleLocked !== false ? 'border-sky-500/40 bg-sky-500/10 text-sky-300' : 'border-[var(--border-light)] text-[var(--text-secondary)]'}`}
                                            onClick={() => setConfig(prev => ({ ...prev, pptStyleLocked: !(prev.pptStyleLocked !== false) }))}
                                            title="閿佸畾鏁村PPT瑙嗚椋庢牸涓€鑷存€?
                                        >
                                            椋庢牸閿佸畾 {config.pptStyleLocked !== false ? 'ON' : 'OFF'}
                                        </button>
                                        <div className="text-[10px] text-[var(--text-tertiary)]">ON 鏇村亸鍚戞暣濂楄瑙変竴鑷达紝OFF 鍏佽鍗曢〉鍙樺寲</div>
                                    </div>
                                    <div className="flex items-center gap-1 mb-2">
                                        <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('cover')}>+灏侀潰</button>
                                        <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('agenda')}>+鐩綍</button>
                                        <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('section')}>+绔犺妭</button>
                                        <button className="px-2 py-1 rounded-md text-[10px] border border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5" onClick={() => appendPptTemplateSlide('summary')}>+鎬荤粨</button>
                                    </div>
                                    <textarea
                                        value={pptOutlineDraft}
                                        onChange={(e) => setPptOutlineDraft(e.target.value)}
                                        className="w-full h-44 rounded-lg border p-2 text-xs outline-none resize-none"
                                        style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                                        placeholder="示例：
封面：AI 产品季度汇报
市场洞察
产品路线图
关键案例
总结与下一步"
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
                                                    <span className="text-[10px] w-4 shrink-0 text-[var(--text-tertiary)] cursor-grab">☰</span>
                                                    <span className="text-[10px] text-sky-400 w-8 shrink-0">图{idx + 1}</span>
                                                    <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1" title={line}>{line}</span>
                                                    <button
                                                        className="text-[10px] px-1 py-0.5 rounded border border-[var(--border-light)]"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                        onClick={() => movePptSlide(idx, -1)}
                                                        title="涓婄Щ"
                                                    >上移</button>
                                                    <button
                                                        className="text-[10px] px-1 py-0.5 rounded border border-[var(--border-light)]"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                        onClick={() => movePptSlide(idx, 1)}
                                                        title="涓嬬Щ"
                                                    >下移</button>
                                                    <button
                                                        className="text-[10px] px-1 py-0.5 rounded border border-red-500/30"
                                                        style={{ color: '#fca5a5' }}
                                                        onClick={() => removePptSlide(idx)}
                                                        title="鍒犻櫎姝ら〉"
                                                    >删除</button>
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
                                            鎸変富棰樻媶椤?
                                        </button>
                                        <button
                                            className="px-2 py-1 rounded-md text-[11px] border border-[var(--border-light)] hover:bg-white/5"
                                            style={{ color: 'var(--text-secondary)' }}
                                            onClick={exportPptOutlineJson}
                                        >
                                            瀵煎嚭JSON
                                        </button>
                                        <button
                                            className="px-2 py-1 rounded-md text-[11px] border border-[var(--border-light)] hover:bg-white/5"
                                            style={{ color: 'var(--text-secondary)' }}
                                            onClick={() => setPptOutlineDraft('')}
                                        >
                                            娓呯┖
                                        </button>
                                        <button
                                            className="ml-auto px-2 py-1 rounded-md text-[11px] border border-sky-400/40 bg-sky-500/10"
                                            style={{ color: '#38bdf8' }}
                                            onClick={applyPptOutlineDraft}
                                        >
                                            搴旂敤椤电翰
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        {config.enablePromptOptimization && (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) && (
                            <div
                                className="mt-2 rounded-2xl border px-3 py-3"
                                style={{
                                    backgroundColor: 'rgba(16,185,129,0.08)',
                                    borderColor: 'rgba(16,185,129,0.2)',
                                }}
                            >
                                <div className={`gap-2 ${isMobile ? 'flex flex-col items-start' : 'flex items-center justify-between'}`}>
                                    <div>
                                        <div className="text-xs font-semibold text-[var(--text-primary)]">提示词优化策略</div>
                                        <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                                            {selectedOptimizerTemplate
                                                ? `${selectedOptimizerTemplate.title} 路 ${selectedOptimizerTemplate.description}`
                                                : '系统会自动补齐目标、约束、风格与校验项。'}
                                        </div>
                                        <div className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                                            {thinkingSupported
                                                ? '当前模型支持思考模式，优化器会优先压缩成目标导向的精简提示词。'
                                                : '当前模型不带强思考能力，优化器会自动展开成更显式的结构化提示词。'}
                                        </div>
                                        <div
                                            className="mt-2 inline-flex items-center rounded-full border px-2 py-1 text-[10px]"
                                            style={{
                                                backgroundColor: promptFeatureHealth.hasBlockingIssue
                                                    ? 'rgba(239,68,68,0.08)'
                                                    : promptFeatureHealth.issues.length > 0
                                                        ? 'rgba(245,158,11,0.08)'
                                                        : 'rgba(16,185,129,0.08)',
                                                borderColor: promptFeatureHealth.hasBlockingIssue
                                                    ? 'rgba(239,68,68,0.22)'
                                                    : promptFeatureHealth.issues.length > 0
                                                        ? 'rgba(245,158,11,0.22)'
                                                        : 'rgba(16,185,129,0.22)',
                                                color: promptFeatureHealth.hasBlockingIssue
                                                    ? '#fca5a5'
                                                    : promptFeatureHealth.issues.length > 0
                                                        ? '#fcd34d'
                                                        : '#86efac',
                                            }}
                                        >
                                            {promptFeatureHealth.summary}
                                        </div>
                                    </div>
                                    <div
                                        className="flex items-center gap-1 rounded-xl border p-1"
                                        style={{
                                            backgroundColor: 'var(--bg-tertiary)',
                                            borderColor: 'var(--border-light)',
                                        }}
                                    >
                                        <button
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${config.promptOptimizationMode !== 'custom'
                                                ? 'bg-green-500/15 text-green-400'
                                                : 'text-[var(--text-secondary)]'
                                                }`}
                                            onClick={() => setConfig((prev) => ({ ...prev, promptOptimizationMode: 'auto' }))}
                                        >
                                            鏅鸿兘浼樺寲
                                        </button>
                                        <button
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${config.promptOptimizationMode === 'custom'
                                                ? 'bg-green-500/15 text-green-400'
                                                : 'text-[var(--text-secondary)]'
                                                }`}
                                            onClick={() => setConfig((prev) => ({ ...prev, promptOptimizationMode: 'custom' }))}
                                        >
                                            鑷畾涔夎鍒?                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {availableOptimizerTemplates.map((template) => {
                                        const isActive = template.id === normalizedOptimizerTemplateId;
                                        return (
                                            <button
                                                key={template.id}
                                                className="rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all"
                                                style={{
                                                    backgroundColor: isActive ? 'rgba(16,185,129,0.14)' : 'var(--bg-tertiary)',
                                                    color: isActive ? '#34d399' : 'var(--text-secondary)',
                                                    borderColor: isActive ? 'rgba(52,211,153,0.35)' : 'var(--border-light)',
                                                }}
                                                onClick={() => setConfig((prev) => ({
                                                    ...prev,
                                                    promptOptimizationTemplateId: template.id,
                                                }))}
                                            >
                                                {template.title}
                                            </button>
                                        );
                                    })}
                                </div>

                                {config.promptOptimizationMode === 'custom' && (
                                    <textarea
                                        value={config.promptOptimizationCustomPrompt || ''}
                                        onChange={(e) => setConfig((prev) => ({
                                            ...prev,
                                            promptOptimizationCustomPrompt: e.target.value,
                                        }))}
                                        className="mt-3 h-24 w-full rounded-xl border px-3 py-2 text-[11px] outline-none resize-none"
                                        style={{
                                            backgroundColor: 'var(--bg-tertiary)',
                                            borderColor: 'var(--border-light)',
                                            color: 'var(--text-primary)',
                                        }}
                                        placeholder="补充必须保留的元素、品牌语气、避免项或版式限制，例如：保留品牌蓝和极简留白，不要额外添加人物，不要过度写实。"
                                    />
                                )}

                                <div className="mt-2 text-[10px] text-[var(--text-tertiary)]">
                                    生成前会先补齐目标、约束、画面结构和检查项；生成后可在卡片中直接查看假设、避免项和校验建议。
                            </div>
                        )}
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
                                                {/* Mask Indicator - 褰撳墠宸茶缃伄缃╂椂鏄剧ず楂樹寒杈规 */}
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

                                {/* Upload Button - At the end of reference images row - 濮嬬粓鏄剧ず */}
                                <button
                                    className="w-12 h-12 rounded-md transition-all duration-200 border hover:bg-white/5 flex items-center justify-center flex-shrink-0 opacity-60 hover:opacity-100"
                                    style={{
                                        backgroundColor: 'var(--bg-tertiary)',
                                        color: 'var(--text-secondary)',
                                        borderColor: 'var(--border-light)'
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                    title="涓婁紶鍙傝€冨浘"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Upload button when no reference images - 濮嬬粓鏄剧ず锛屼笌鍙傝€冨浘鍚岃瀵归綈 */}
                        {config.referenceImages.length === 0 && uploadingCount === 0 && (
                            <div className="flex items-center p-2 px-3 mt-1">
                                <button
                                    className="w-12 h-12 rounded-lg transition-all border-2 border-dashed hover:bg-white/5 flex items-center justify-center flex-shrink-0 opacity-40 hover:opacity-80"
                                    style={{
                                        color: 'var(--text-secondary)',
                                        borderColor: 'var(--border-light)'
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                    title="涓婁紶鍙傝€冨浘"
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
                                onFocus?.(); // 閫氱煡渚ц竟鏍? 杈撳叆妗嗘湁鐒︾偣,涓嶈鑷姩闅愯棌
                            }}
                            onBlur={() => {
                                onBlur?.(); // 閫氱煡渚ц竟鏍? 杈撳叆妗嗗け鍘荤劍鐐?鍙互鑷姩闅愯棌
                            }}
                            placeholder={config.mode === GenerationMode.VIDEO ? "鎻忚堪浣犳兂瑕佺敓鎴愮殑瑙嗛..." : config.mode === GenerationMode.AUDIO ? "鎻忚堪浣犳兂瑕佺敓鎴愮殑闊充箰椋庢牸銆佹瓕璇嶆垨鏃嬪緥..." : config.mode === GenerationMode.PPT ? "杈撳叆PPT涓婚锛屽皢鎵归噺鐢熸垚鍥?~鍥綨椤甸潰..." : "鎻忚堪浣犳兂瑕佺敓鎴愮殑鍥剧墖..."}
                            className="input-bar-textarea w-full max-w-full bg-transparent border-none outline-none text-[15px] resize-none mt-1 py-1 px-3 box-border overflow-y-auto"
                            style={{
                                color: 'var(--text-primary)', // 浣跨敤 CSS 鍙橀噺閫傞厤涓婚
                                minHeight: '36px',
                                maxHeight: '135px', // 6 lines * 22.5px line-height
                                lineHeight: '1.5'
                            }}
                            rows={1}
                        />
                    </div> {/* End of input area hover wrapper */}

                    {/* Footer - Modified to be a standard flex row, flowing or wrapping lightly on mobile */}
                    <PromptBarFooter isMobile={isMobile}>
                        <div className={`flex min-w-0 items-center ${isMobile ? 'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2' : 'w-full flex-nowrap gap-1 overflow-visible'}`}>
                            {/* Model Button */}
                            <div className={`relative inline-flex min-w-0 ${isMobile ? 'col-span-2' : 'flex-[0_1_12.375rem] max-w-full lg:max-w-[12.375rem]'}`}>
                                <button
                                    id="models-dropdown-trigger"
                                    className={`input-bar-model flex w-full max-w-full items-center flex-nowrap justify-center gap-1.5 md:gap-[6px] px-2 md:px-[10px] h-10 md:h-[38px] rounded-lg border transition-all duration-300 min-w-0 overflow-hidden ${isModelListEmpty
                                        ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] cursor-not-allowed border-[var(--border-light)]'
                                        : useCurrentModelTheme
                                            ? 'border-white/20 !opacity-100 shadow-sm'
                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-opacity-50'
                                        }`}
                                    style={(!isModelListEmpty && useCurrentModelTheme) ? {
                                        background: `linear-gradient(180deg, ${currentModelSecondaryColor} 0%, ${currentModelSecondaryColor} 100%)`,
                                        border: `1px solid ${currentModelPrimaryColor}`,
                                        boxShadow: `0 0 0 1px ${currentModelPrimaryColor} inset`
                                    } : {}}
                                    onMouseDown={(e) => e.stopPropagation()} // 馃殌 闃绘 mousedown 鍐掓场锛岄槻姝㈣ handleClickOutside 璇潃
                                    onClick={(e) => {
                                        e.stopPropagation(); // 馃殌 闃绘鍐掓场锛岄槻姝㈣ handleClickOutside 璇潃
                                        if (isModelListEmpty) {
                                            onOpenSettings?.('api-management');
                                        } else {
                                            toggleMenu('model');
                                        }
                                    }}
                                >
                                    <span
                                        className={`font-bold truncate flex items-center gap-1 min-w-0 ${isMobile ? 'text-[13px]' : 'text-sm'} ${useCurrentModelTheme ? '' : getModelThemeColor(currentModel?.id || '')}`}
                                        style={useCurrentModelTheme ? { color: currentModelTextColor } : undefined}
                                        title={currentModelName}
                                    >
                                        {currentModelName}
                                    </span>

                                    {/* 馃殌 [Fix] 鍖哄垎鏍囪瘑锛氱Н鍒嗘ā鍨嬫樉绀烘贰钃濊壊 鉁ㄧН鍒嗭紝鐢ㄦ埛API鏄剧ずProvider鏍囩 */}
                                    {!isModelListEmpty && !isMobile && (
                                        currentModel?.isSystemInternal ? (
                                            // 绉垎妯″瀷锛氫粎鏄剧ず 鉁ㄧН鍒嗭紝涓嶆樉绀轰緵搴斿晢
                                            <span
                                                className="text-[10px] px-2 py-0.5 rounded-full bg-sky-400/20 text-sky-200 border border-sky-300/25 font-semibold flex-shrink-0"
                                                style={{ marginLeft: '6px' }}
                                                title="系统积分模型"
                                            >
                                                积分 {Math.max(1, currentCreditCost)}
                                            </span>
                                        ) : currentModel?.provider ? (
                                            // 鐢ㄦ埛API妯″瀷锛氭樉绀篜rovider鏍囩
                                            <span
                                                className="flex-shrink-0 rounded-full border border-[var(--border-light)] bg-[var(--bg-surface)] px-2 py-0.5 text-[9px] text-[var(--text-tertiary)]"
                                                style={{ marginLeft: '6px', ...(currentProviderAccentStyle || {}) }}
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
                                        className={isMobile ? 'fixed left-3 right-3 z-[1005] ios-mobile-floating-sheet p-2 animate-scaleIn origin-bottom overflow-hidden' : 'absolute bottom-full mb-3 z-50 animate-scaleIn origin-bottom'}
                                        style={isMobile
                                            ? { bottom: mobileFloatingSheetBottom, maxHeight: mobileFloatingSheetMaxHeight, overscrollBehavior: 'contain' }
                                            : { left: '50%', transform: 'translateX(-50%)' }}
                                    >
                                        {/* 馃攳 Search Input Module - Above the list - 鍙湪澶氫釜妯″瀷鏃舵樉绀?*/}
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
                                                        placeholder="鎼滅储妯″瀷..."
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
                                                // 淇濆瓨婊氬姩浣嶇疆
                                                modelListScrollPos.current = e.currentTarget.scrollTop;
                                            }}
                                        >
                                            {(() => {
                                                const rawModels = filterAndSortModels(availableModels, modelSearch, modelCustomizations);
                                                // 馃殌 [淇] 浣跨敤澶嶅悎閿?(ID + Provider) 鍘婚噸锛岀‘淇濈Н鍒嗘ā鍨嬪拰绗笁鏂规ā鍨嬭兘鍏卞瓨
                                                const uniqueModels = Array.from(
                                                    new Map(rawModels.map(m => [`${m.id}-${m.provider || ''}`, m])).values()
                                                );

                                                const getIsExclusive = (m: any) => !!m.isSystemInternal;
                                                    // 馃殌 [Style Isolation] 涓ユ牸鍒ゆ柇锛氬繀椤绘槸绯荤粺鍐呯疆妯″瀷
                                                    // 鐢ㄦ埛娣诲姞鐨勭涓夋柟API鍗充娇妯″瀷ID鐩稿悓锛屼篃涓嶅簲璇ヤ娇鐢ㄨ兌鍥婃牱寮?

                                                uniqueModels.sort((a, b) => {
                                                    const scopeOrder = { system: 0, user: 1, official: 2 } as const;
                                                    const aScope = getModelSourceScope(a);
                                                    const bScope = getModelSourceScope(b);
                                                    if (aScope !== bScope) return scopeOrder[aScope] - scopeOrder[bScope];

                                                    const pinnedModels = getPinnedModels();
                                                    const aPinned = pinnedModels.includes(a.id);
                                                    const bPinned = pinnedModels.includes(b.id);
                                                    if (aPinned && !bPinned) return -1;
                                                    if (!aPinned && bPinned) return 1;

                                                    return 0; // 鍚屽眰绾т繚鎸佸師濮嬫帓搴?
                                                });

                                                return uniqueModels.map((model: any, index: number) => {
                                                    const isLast = index === uniqueModels.length - 1;
                                                    const custom = modelCustomizations[model.id] || {};

                                                    // 馃殌 [淇] 澧炲己 Exclusive 鍒ゅ畾閫昏緫
                                                    const isExclusive = getIsExclusive(model);
                                                    const sourceScope = getModelSourceScope(model);
                                                    const previousSourceScope = index > 0 ? getModelSourceScope(uniqueModels[index - 1]) : null;
                                                    const isGroupStart = index === 0 || previousSourceScope !== sourceScope;
                                                    const groupMeta = sourceScope === 'system'
                                                        ? {
                                                            title: '系统积分模型',
                                                            description: '由平台统一配置的积分路由模型，不读取用户自己的私有 API 密钥。',
                                                        }
                                                        : sourceScope === 'user'
                                                            ? {
                                                                title: '用户 / 第三方 API',
                                                                description: '用户自行添加的 API 与兼容网关，和系统积分模型分组展示。',
                                                            }
                                                            : {
                                                                title: '官方直连模型',
                                                                description: '当前环境可直接使用的官方模型，便于与用户 API 来源区分。',
                                                            };

                                                    // 馃殌 [娣诲姞] 鍖哄垎鏍囪瘑锛氱郴缁熺Н鍒嗘ā鍨?vs 鐢ㄦ埛API妯″瀷
                                                    const getFallbackDescription = (m: any) => {
                                                        if (m.provider) return `由 ${m.provider} 提供的可用模型`;
                                                        if (m.group) return `属于 ${m.group} 分组的引擎模型`;
                                                        return '外部集成的第三方语言模型';
                                                    };
                                                    const advantage = custom.description || model.description || getFallbackDescription(model);
                                                    const isPinned = getPinnedModels().includes(model.id);

                                                    const isActive = config.model === model.id;
                                                    // 馃殌 [Fix] 浣跨敤缁熶竴鐨?normalizeColor 鍑芥暟澶勭悊棰滆壊
                                                    const colorStart = normalizeColor(model.colorStart, '#60a5fa');
                                                    const colorEnd = normalizeColor(model.colorEnd, '#2563eb');

                                                    // 馃殌 [Fix] 绉垎妯″瀷锛氶€変腑鎴栨偓鍋滄椂鏄剧ず褰╄壊娓愬彉锛屽惁鍒欎娇鐢ㄧ伆鑹茶皟
                                                    const isModelActive = config.model === model.id;

                                                    // 榛樿浣跨敤鐨勭粺涓€鐏拌壊娓愬彉搴曟澘
                                                    const inactiveGradientStyle = {
                                                        background: `linear-gradient(180deg, rgba(75, 85, 99, 0.4) 0%, rgba(55, 65, 81, 0.4) 100%)`,
                                                    };

                                                    // 鎮仠/婵€娲绘椂鎵嶅睍绀虹殑褰╄壊搴曟澘
                                                    const activeGradientStyle = {
                                                        background: `linear-gradient(180deg, ${colorEnd} 0%, ${colorEnd} 100%)`,
                                                        border: `1px solid ${colorStart}`,
                                                        boxShadow: `0 0 0 1px ${colorStart} inset`,
                                                    };

                                                    return (
                                                        <React.Fragment key={model.id}>
                                                            {isGroupStart && (
                                                                <div className={`px-1 ${index === 0 ? '' : 'pt-3'}`}>
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                                                                            {groupMeta.title}
                                                                        </div>
                                                                        <span className="rounded-full border border-[var(--border-light)] bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                                                                            {uniqueModels.filter((item: any) => getModelSourceScope(item) === sourceScope).length}
                                                                        </span>
                                                                    </div>
                                                                    <div className="mt-1 text-[10px] leading-5 text-[var(--text-tertiary)]">
                                                                        {groupMeta.description}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <button
                                                            className={`group w-full transition-all duration-300 mx-auto cursor-pointer
                                                            ${isExclusive
                                                                    ? `h-14 px-5 flex items-center justify-between rounded-full flex-shrink-0 text-white shadow-md active:scale-[0.98] ${isLast ? '' : 'mb-3'} ${isModelActive ? 'ring-2 ring-white/50 shadow-lg scale-[1.02]' : 'hover:scale-[1.02] hover:shadow-lg opacity-80 hover:opacity-100 grayscale-[0.8] hover:grayscale-0'}`
                                                                    : `px-3 py-2.5 text-left flex flex-col gap-1 rounded-md transition-all border ${isModelActive ? 'border-[var(--border-medium)] bg-[var(--bg-tertiary)] shadow-sm' : 'border-transparent opacity-80 hover:opacity-100 hover:border-[var(--border-light)] hover:bg-[var(--bg-tertiary)]'}`}
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
                                                                setModelManualLock(true); // 馃殌 鐢ㄦ埛鎵嬪姩鐐瑰嚮锛屽紑鍚攣瀹?
                                                                setConfig(prev => {
                                                                    // 馃殌 [Fix] 鏅鸿兘鍙傛暟淇濇寔锛氳幏鍙栨柊妯″瀷鏀寔鐨勫弬鏁?
                                                                    const newModelCaps = getModelCapabilities(model.id);
                                                                    const supportedSizes = getAvailableSizes(model.id);
                                                                    const supportedRatios = newModelCaps?.supportedRatios?.length ? newModelCaps.supportedRatios : Object.values(AspectRatio);

                                                                    // 妫€鏌ュ綋鍓嶅弬鏁版槸鍚﹁鏂版ā鍨嬫敮鎸侊紝鏀寔鍒欎繚鎸侊紝涓嶆敮鎸佸垯鍥為€€鍒伴粯璁ゅ€?
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
                                                                const displayName = displayInfo.displayName;
                                                                const providerAccentStyle = getProviderAccentStyle(model.provider);

                                                                if (isExclusive) {
                                                                    // 馃殌 [Fix] 绉垎妯″瀷锛氳兌鍥婃牱寮忥紝鍥炬爣+鍚嶇О宸﹀榻愶紝绉垎鏍囪瘑鍙冲榻?
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
                                                                                    积分 {getDisplayedCreditCost(model)}
                                                                                        ? getDisplayedCreditCost(model)
                                                                                        : getDisplayedCreditCost(model)}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                // 馃殌 [Fix] API妯″瀷锛氬浘鏍囧眳涓榻愶紝鏂囨湰宸﹀榻?
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
                                                                            <span
                                                                                className={`break-all text-left text-sm font-medium ${getModelThemeColor(model.id)}`}
                                                                                title={displayInfo.displayName}
                                                                            >
                                                                                {displayName}
                                                                            </span>
                                                                        </div>
                                                                        {/* 渚涘簲鍟嗘爣绛?- 鍙冲榻愬甫妗嗭紙鏈€澶氭樉绀?0涓瓧绗︼紝鍗曡锛?*/}
                                                                        <span className="rounded-full border border-[var(--border-light)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                                                                            {model.sourceLabel || getModelSourceLabel(model)}
                                                                        </span>
                                                                        {model.provider && (
                                                                            <span
                                                                                className="flex-shrink-0 overflow-hidden whitespace-nowrap rounded-full border border-[var(--border-light)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]"
                                                                                title={model.provider}
                                                                                style={{ maxWidth: '40%', textOverflow: 'ellipsis', ...(providerAccentStyle || {}) }}
                                                                            >
                                                                                {model.provider.length > 10 ? model.provider.substring(0, 9) + '…' : model.provider}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* Metadata Display - 涓夊眰绠€娲佺粨鏋?- 涓撳睘妯″瀷涓嶆樉绀?*/}
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
                                                                        {isPinned && <span className="text-[12px] opacity-80 flex-shrink-0 mr-1 mt-0.5">馃搶</span>}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </button>
                                                        </React.Fragment>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div >
                                )}
                            </div >

                            {/* Options Button - Shows current ratio and size, shrink on mobile */}
                            <div className={`relative inline-flex min-w-0 ${isMobile ? 'row-start-2 min-w-0' : 'flex-[0_1_8.5rem]'}`}>
                                <button
                                    data-options-toggle
                                    className={`flex w-full items-center justify-center gap-1 h-10 md:h-[38px] rounded-lg border transition-all text-xs font-medium whitespace-nowrap min-w-0 ${isMobile ? 'px-2.5 max-w-none' : 'px-[7px] max-w-[8.5rem] flex-shrink'}`}
                                    style={{
                                        backgroundColor: showOptionsPanel ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                                        color: 'var(--text-secondary)',
                                        borderColor: showOptionsPanel ? 'var(--border-medium)' : 'var(--border-light)'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenu(null); // 鍏抽棴鍏朵粬鑿滃崟
                                        setShowOptionsPanel(prev => !prev);
                                    }}
                                    title="鍥剧墖/瑙嗛閫夐」"
                                >
                                    {config.mode === GenerationMode.AUDIO ? (
                                        <>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 18V5l12-2v13" />
                                                <circle cx="6" cy="18" r="3" />
                                                <circle cx="18" cy="16" r="3" />
                                            </svg>
                                            <span className="min-w-0 truncate text-center leading-none">{config.audioDuration || '鑷姩'}</span>
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
                                            <span className="min-w-0 truncate text-center leading-none">{config.aspectRatio === AspectRatio.AUTO ? '鑷€傚簲' : config.aspectRatio} 路 {config.imageSize}</span>
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
                                            <span className="min-w-0 truncate text-center leading-none">{config.aspectRatio === AspectRatio.AUTO ? '鑷€傚簲' : config.aspectRatio} 路 {config.videoResolution || '720p'}</span>
                                        </>
                                    )}
                                    <svg className={`w-3 h-3 transition-transform ${showOptionsPanel ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M6 9l6 6 6-6" />
                                    </svg>
                                </button>

                                {/* Options Panel - positioned relative to button */}
                                {showOptionsPanel && (
                                    <div
                                        className={isMobile ? 'fixed left-3 right-3 z-[1005] ios-mobile-floating-sheet p-2 animate-scaleIn origin-bottom overflow-hidden' : 'absolute bottom-full mb-2 z-30'}
                                        style={isMobile
                                            ? { bottom: mobileFloatingSheetBottom, maxHeight: mobileFloatingSheetMaxHeight, overscrollBehavior: 'contain' }
                                            : { left: '50%', transform: 'translateX(-50%)' }}
                                    >
                                        <div ref={optionsPanelRef}>
                                            {config.mode === GenerationMode.AUDIO ? (
                                                /* 闊抽閫夐」闈㈡澘 - 鏃堕暱閫夋嫨 */
                                                <div className="w-56 p-3 rounded-xl border shadow-xl animate-scaleIn origin-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-medium)' }}>
                                                    <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">闊抽鏃堕暱</div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {['鑷姩', '30s', '60s', '120s', '240s'].map(dur => (
                                                            <button
                                                                key={dur}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${(config.audioDuration || '鑷姩') === dur
                                                                    ? 'bg-pink-500/20 text-pink-400 border-pink-500/30'
                                                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-pink-500/30'
                                                                    }`}
                                                                onClick={() => setConfig(prev => ({ ...prev, audioDuration: dur === '鑷姩' ? undefined : dur }))}
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
                                                    networkOptions={[
                                                        ...(groundingSupported ? [{
                                                            id: 'grounding',
                                                            label: '鑱旂綉鎼滅储',
                                                            active: !!config.enableGrounding,
                                                            onToggle: () => setConfig(prev => ({ ...prev, enableGrounding: !prev.enableGrounding })),
                                                        }] : []),
                                                        ...(imageSearchSupported ? [{
                                                            id: 'image-search',
                                                            label: '鍥剧墖鎼滅储',
                                                            active: !!config.enableImageSearch,
                                                            onToggle: () => setConfig(prev => ({ ...prev, enableImageSearch: !prev.enableImageSearch })),
                                                        }] : []),
                                                    ]}
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
                            {/* Group 1: Network & Provider Settings - 鍙湪鏀寔鏃舵樉绀?*/}
                            {!isMobile && (groundingSupported || imageSearchSupported) && (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <div
                                        className="flex items-center gap-1 px-[3px] py-0.5 rounded-lg h-[38px] transition-all duration-200 border border-[var(--border-light)] bg-[var(--bg-tertiary)]"
                                        style={{
                                            opacity: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 0 : 1,
                                            visibility: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 'hidden' : 'visible',
                                            pointerEvents: (config.mode === GenerationMode.VIDEO || config.mode === GenerationMode.AUDIO) ? 'none' : 'auto'
                                        }}
                                    >
                                        {/* Grounding Tool */}
                                        {groundingSupported && (
                                            <button
                                                className={`flex items-center gap-1 px-1.5 h-full rounded-md transition-all text-[11px] font-medium whitespace-nowrap ${config.enableGrounding
                                                    ? 'bg-indigo-500/15 text-indigo-500 shadow-sm'
                                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)]'
                                                    }`}
                                                onClick={() => setConfig(prev => ({ ...prev, enableGrounding: !prev.enableGrounding }))}
                                                title="Google 鎼滅储 (瀹炴椂淇℃伅)"
                                            >
                                                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M2 8.8a15 15 0 0 1 20 0" />
                                                    <path d="M5 12.5a10 10 0 0 1 14 0" />
                                                    <path d="M8.5 16.3a5 5 0 0 1 7 0" />
                                                    <line x1="12" y1="20" x2="12.01" y2="20" />
                                                </svg>
                                                <span>璋锋瓕鎼滅储</span>
                                            </button>
                                        )}

                                        {/* 鍨傜洿鍒嗙晫绾?*/}
                                        {groundingSupported && imageSearchSupported && (
                                            <div className="w-[1px] h-4 bg-[var(--border-light)] mx-0.5" />
                                        )}

                                        {imageSearchSupported && (
                                            <button
                                                className={`flex items-center gap-1 px-1.5 h-full rounded-md transition-all text-[11px] font-medium whitespace-nowrap ${config.enableImageSearch
                                                    ? 'bg-indigo-500/15 text-indigo-500 shadow-sm'
                                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)]'
                                                    }`}
                                                onClick={() => setConfig(prev => ({ ...prev, enableImageSearch: !prev.enableImageSearch }))}
                                                title="鍥剧墖鎼滅储 (鍙傝€冪綉缁滃浘鐗?"
                                            >
                                                <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                                    <path d="M21 15l-5-5L5 21" />
                                                </svg>
                                                <span>鍥剧墖鎼滅储</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Group 2: Generation Settings - Hidden on mobile for compact footer */}
                            {!isMobile && (
                                <div className="flex items-center gap-px p-[3px] rounded-lg border h-[38px] shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }}>
                                    {/* Parallel Count */}
                                    <div className="relative h-full">
                                        <button
                                            className="flex items-center gap-1 px-2.5 h-full rounded-md transition-all whitespace-nowrap text-[11px] font-medium hover:bg-white/5"
                                            style={{ color: 'var(--text-secondary)' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMenu('count');
                                            }}
                                            title="骞跺彂鏁伴噺"
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
                                                    {getPinnedModels().includes(contextMenu.modelId) ? '鉂?鍙栨秷缃《' : '馃搶 缃《妯″瀷'}
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
                                                    鈿欙笍 璁剧疆
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
                                                        <h3 className="text-lg font-bold text-white">妯″瀷璁剧疆</h3>
                                                        <button onClick={() => setModelSettingsModal(null)} className="text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-white">关闭</button>
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-zinc-500 font-mono break-all">ID: {modelSettingsModal.modelId}</div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">鏄剧ず鍒悕</label>
                                                        <input
                                                            value={modelSettingsModal.alias}
                                                            onChange={(e) => setModelSettingsModal({ ...modelSettingsModal, alias: e.target.value })}
                                                            placeholder="留空则使用默认名称"
                                                            className="w-full bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">妯″瀷浠嬬粛</label>
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
                                                            鍙栨秷
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                // Placeholder function
                                                                setModelSettingsModal(null);
                                                            }}
                                                            className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
                                                        >
                                                            淇濆瓨
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>,
                                            document.body
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 馃殌 鍙戦€佹寜閽?- 绉垎涓撳睘鏍峰紡 */}
                            <div className={isMobile ? 'col-start-2 row-start-2 flex min-w-0 justify-end' : ''}>
                                <CreditSendButton
                                    isCreditModel={isAdminModel}
                                    creditCost={totalCreditCost}
                                    balance={balance}
                                    hasPrompt={!!config.prompt}
                                    colorStart={availableModels.find((m: any) => m.id === config.model)?.colorStart}
                                    colorEnd={availableModels.find((m: any) => m.id === config.model)?.colorEnd}
                                    textColor={currentModelTextColor}
                                    isGenerating={isGenerating}
                                    isMobile={isMobile}
                                    onClick={() => {
                                        if (isGenerating) return;
                                        if (isAdminModel && totalCreditCost > 0 && balance < totalCreditCost) {
                                            notify.error('绉垎涓嶈冻', `浣跨敤褰撳墠閰嶇疆闇€瑕?${totalCreditCost} 绉垎锛屽綋鍓嶀綑棰? ${balance}锛岃鍏呭€笺€俙);
                                            return;
                                        }
                                        onGenerate();
                                    }}
                                />
                            </div>
                        </div>
                    </PromptBarFooter>
                </div>

                <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*" onChange={(e) => e.target.files && processFiles(e.target.files)} />

                {/* 鍙傝€冨浘鏀惧ぇ娴眰 */}
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
