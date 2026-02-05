import React, { useState, useEffect, useRef } from 'react';
import { PromptNode, AspectRatio, GenerationMode } from '../types';
import { Sparkles, Loader2, Video, Image } from 'lucide-react';
import { getCardDimensions } from '../utils/styleUtils';
import { generateTagColor } from '../utils/colorUtils';
import { getModelDisplayName } from '../services/modelCapabilities';
import ImagePreview from './ImagePreview';

interface PromptNodeProps {
    node: PromptNode;
    onPositionChange: (id: string, newPos: { x: number; y: number }) => void;
    isSelected: boolean;
    onSelect: () => void;
    onClickPrompt?: (node: PromptNode) => void;
    onConnectStart?: (id: string, startPos: { x: number; y: number }) => void;
    canvasTransform?: { x: number; y: number; scale: number }; // Deprecated
    zoomScale?: number;
    isMobile?: boolean;
    sourcePosition?: { x: number; y: number };
    onCancel?: (id: string) => void;
    onDelete?: (id: string) => void;
    onRetry?: (node: PromptNode) => void;
    onDisconnect?: (id: string) => void;
    onHeightChange?: (id: string, height: number) => void;
    highlighted?: boolean;
}

// [FIX] Self-healing thumbnail component that recovers data from IDB if missing
const ReferenceThumbnail: React.FC<{ image: { id: string, data?: string, mimeType?: string } }> = ({ image }) => {
    const [data, setData] = useState<string | undefined>(image.data);
    const [loading, setLoading] = useState(!image.data);

    useEffect(() => {
        if (image.data) {
            setData(image.data);
            setLoading(false);
            return;
        }

        // If data missing, try recover from IDB
        let active = true;
        setLoading(true);
        import('../services/imageStorage').then(({ getImage }) => {
            // Add 3s timeout to prevent infinite spinning if IDB hangs
            const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000));
            // Prefer storageId if available, otherwise fallback to id
            const lookupId = (image as any).storageId || image.id;

            Promise.race([getImage(lookupId), timeoutPromise])
                .then(cached => {
                    if (active && typeof cached === 'string') {
                        setData(cached);
                    }
                    if (active) setLoading(false);
                })
                .catch((e) => {
                    // console.warn('Ref load failed/timeout', e);
                    if (active) setLoading(false);
                });
        });

        return () => { active = false; };
    }, [image.id, (image as any).storageId, image.data]);

    const src = data ? (
        data.startsWith('data:') || data.startsWith('http') || data.startsWith('blob:')
            ? data
            : `data:${image.mimeType || 'image/png'};base64,${data}`
    ) : '';

    return (
        <div
            className="w-10 h-10 rounded border border-[var(--border-light)] overflow-hidden relative bg-[var(--bg-tertiary)] cursor-grab active:cursor-grabbing"
            draggable={!!src}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => {
                if (!src) {
                    e.preventDefault();
                    return;
                }
                e.stopPropagation(); // Prevent card drag
                // Pass URL as text so PromptBar can read it
                e.dataTransfer.setData('text/plain', src);
                e.dataTransfer.setData('text/uri-list', src);
                // [NEW] Pass structured data for efficient reuse
                // We include 'data' (the Base64/Blob URL) directly to avoid hydration issues on drop
                // if 'src' is a Data URL, we pass it as 'data'. 
                // If it's a blob url, we might not be able to pass it as base64 easily here without reading it,
                // but our 'src' variable in this component comes from 'data' state which IS base64 (mostly).
                // Let's check:
                // const src = data ? (data.startsWith...) : '';
                // So 'src' is likely the full data URL.

                e.dataTransfer.setData('application/x-kk-image-ref', JSON.stringify({
                    storageId: (image as any).storageId || image.id,
                    mimeType: image.mimeType || 'image/png',
                    source: 'reference-thumb',
                    data: src.startsWith('data:') ? src : undefined // Pass full data URL if available
                }));
                e.dataTransfer.effectAllowed = 'copy';
            }}
        >
            {src ? (
                <img
                    src={src}
                    alt="Ref"
                    className="w-full h-full object-cover pointer-events-none"
                    style={{
                        imageRendering: 'auto',
                        transform: 'translateZ(0)'
                    }}
                />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                    {loading ? (
                        <Loader2 className="w-3 h-3 text-[var(--text-tertiary)] animate-spin" />
                    ) : (
                        <div className="w-3 h-3 rounded-full bg-red-500/20" title="Lost" />
                    )}
                </div>
            )}
        </div>

    );
};

// [NEW] Timer for generation status
const GenerationTimer: React.FC<{ start: number }> = ({ start }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(Date.now() - start);
        }, 100);
        return () => clearInterval(interval);
    }, [start]);

    const seconds = (elapsed / 1000).toFixed(1);

    return (
        <div className="flex flex-col items-center gap-0.5 pointer-events-none select-none">
            <div className="text-[10px] text-current opacity-60 font-medium tracking-widest mb-0.5 transform scale-90">等待时间</div>
            <div className="flex items-center gap-2 text-current">
                <Loader2 className="animate-spin" size={14} />
                <div className="font-mono text-lg font-medium tabular-nums tracking-wider drop-shadow-sm">
                    {seconds}s
                </div>
            </div>
        </div>
    );
};

const PromptNodeComponent: React.FC<PromptNodeProps> = React.memo(({
    node,

    onPositionChange,
    isSelected,
    onSelect,
    onClickPrompt,
    onConnectStart,
    canvasTransform, // Optional now
    zoomScale = 1,
    isMobile = false,
    sourcePosition,
    onCancel,
    onDelete,
    onRetry,
    onDisconnect,
    onHeightChange,
    highlighted
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [cardHeight, setCardHeight] = useState(200); // 默认高度??00px,会在渲染后更??
    const [previewImage, setPreviewImage] = useState<{ url: string; originRect: DOMRect } | null>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartCanvasPos = useRef({ x: 0, y: 0 });

    const hasMoved = useRef(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const localPosRef = useRef(node.position);

    // Sync ref when node.position updates externally (and not dragging)
    useEffect(() => {
        if (!isDragging) {
            localPosRef.current = node.position;
            // Force update DOM to match new prop position if needed
            if (containerRef.current) {
                containerRef.current.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0) translate(-50%, -100%)`;
            }
        }
    }, [node.position.x, node.position.y, isDragging]);

    // Height reporting
    useEffect(() => {
        if (!cardRef.current || !onHeightChange) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Actually offsetHeight is safer for visual boundaries
                const offsetHeight = (entry.target as HTMLElement).offsetHeight;
                if (offsetHeight && Math.abs(offsetHeight - (node.height || 0)) > 2) {
                    onHeightChange(node.id, offsetHeight);
                }
            }
        });
        observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [node.id, onHeightChange, node.height]); // Depend on node.height to prevent loop if stable

    // 动态更新cardHeight用于连接线起??
    useEffect(() => {
        const updateHeight = () => {
            if (cardRef.current) {
                const height = cardRef.current.offsetHeight;
                if (height > 0) {
                    setCardHeight(height);
                }
            }
        };

        // 初始更新
        updateHeight();

        // 利用已有的ResizeObserver来监听高度变??
        const observer = new ResizeObserver(updateHeight);
        if (cardRef.current) {
            observer.observe(cardRef.current);
        }

        return () => observer.disconnect();
    }, [node.prompt, node.referenceImages]);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Ignore Right Click (2)
        if ('button' in e && e.button === 2) return;

        // Stop canvas panning when touching the card
        e.stopPropagation();

        setIsDragging(true);
        hasMoved.current = false; // Reset hasMoved on new drag/click attempt

        // Only select if not already selected (Preserve Group)
        if (!isSelected) {
            onSelect();
        }

        // Handle both Mouse and Touch events
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        // Store initial positions
        dragStartPos.current = { x: clientX, y: clientY };
        dragStartCanvasPos.current = { x: localPosRef.current.x, y: localPosRef.current.y };
    };

    const requestRef = useRef<number | null>(null);
    const lastGlobalUpdateRef = useRef(0);

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;

        // Prevent scrolling/panning while dragging card
        if (e.cancelable) e.preventDefault();

        let clientX, clientY;
        if ('touches' in e) {
            clientX = (e as TouchEvent).touches[0].clientX;
            clientY = (e as TouchEvent).touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        const moveDist = Math.hypot(clientX - dragStartPos.current.x, clientY - dragStartPos.current.y);
        if (moveDist > 3) {
            hasMoved.current = true;
        }

        if (requestRef.current !== null) return;

        requestRef.current = requestAnimationFrame(() => {
            const scale = zoomScale; // Use zoomScale directly
            const deltaX = (clientX - dragStartPos.current.x) / scale;
            const deltaY = (clientY - dragStartPos.current.y) / scale;

            const newPos = {
                x: dragStartCanvasPos.current.x + deltaX,
                y: dragStartCanvasPos.current.y + deltaY
            };

            // 1. Direct DOM Update (Zero React Overhead for 120fps smooth drag)
            if (containerRef.current) {
                containerRef.current.style.transform = `translate3d(${newPos.x}px, ${newPos.y}px, 0) translate(-50%, -100%)`;
            }
            localPosRef.current = newPos;

            // 2. Global Update (Throttled)
            /* 
               [NOTE] We maintain a throttled global update to ensure connection lines follow the card.
               We keep the rate low (e.g. 50ms / 20fps) to avoid choking the main thread,
               relying on the Direct DOM Update above for perceived smoothness.
            */
            const now = Date.now();
            if (now - lastGlobalUpdateRef.current > 50) {
                onPositionChange(node.id, newPos);
                lastGlobalUpdateRef.current = now;
            }

            requestRef.current = null;
        });
    };

    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            // Commit final position
            onPositionChange(node.id, localPosRef.current);
        }
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = null;
        }
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            // Touch listeners (non-passive to prevent scroll)
            window.addEventListener('touchmove', handleMouseMove, { passive: false });
            window.addEventListener('touchend', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchmove', handleMouseMove);
            window.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging, zoomScale]); // Use zoomScale here

    return (
        <div
            ref={containerRef}
            className={`absolute z-20 flex flex-col items-center group animate-cardPopIn antialiased ${isSelected ? 'z-30' : ''}`}
            style={{
                left: 0,
                top: 0,
                // [FIX] Round coordinates to integer pixels to prevent text blurring on some displays
                transform: `translate3d(${Math.round(node.position.x)}px, ${Math.round(node.position.y)}px, 0) translate(-50%, -100%)`,
                willChange: isDragging ? 'transform' : 'auto', // Only optimize during active drag
                cursor: isDragging ? 'grabbing' : 'grab',
                // Disable transition during drag to prevent fighting with JS updates
                // Disable transition during drag to prevent fighting with JS updates
                transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.2s ease',
                backfaceVisibility: 'hidden' // Re-enabled to match ImageCard sharps rendering
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
            onClick={(e) => {
                e.stopPropagation();
                // If clicked (not dragged) and isSelected, reset to single selection (Exclusive)
                if (isSelected && !hasMoved.current) {
                    onSelect();
                }

                if (!hasMoved.current) {
                    onClickPrompt?.(node);
                }
            }}
        >
            {/* Main Card */}
            <div
                ref={cardRef}
                className={`
                    relative border p-3 shadow-xl max-w-[95vw] flex flex-col select-none
                    ${isDragging ? '' : 'transition-all'}
                    ${node.isGenerating ? 'generating-flow-bg shadow-2xl' : ''}
                    ${node.isDraft ? 'backdrop-blur-2xl backdrop-saturate-150' : ''}
                    ${isSelected ? 'animate-glow-pulse' : ''}
                    ${highlighted ? 'scale-[1.02] z-50' : ''}
                `}
                style={{
                    width: getCardDimensions(node.aspectRatio).width,
                    backgroundColor: 'var(--bg-surface)', // ? 不透明背景
                    borderColor: node.isGenerating ?
                        'var(--border-subtle)' :
                        node.isDraft ?
                            'var(--accent-indigo)' :
                            isSelected ?
                                'var(--selected-border)' :
                                highlighted ?
                                    'var(--accent-gold)' :
                                    'var(--border-default)',
                    borderRadius: 'var(--radius-lg)', // 12px
                    boxShadow: isSelected ?
                        'var(--glow-blue)' :
                        node.isDraft ?
                            'var(--glow-indigo)' :
                            highlighted ?
                                'var(--glow-gold)' :
                                'var(--shadow-xl)',
                    transitionDuration: isDragging ? '0ms' : 'var(--duration-normal)',
                    transitionProperty: 'box-shadow, border-color, transform'
                }}>
                {/* Header - Changes based on generating state */}
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-black/10 dark:border-white/10">
                    {node.isGenerating ? (
                        <>
                            <div className="w-6 h-6 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">
                                <svg className="animate-spin h-3 w-3 text-black dark:text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </div>
                            <span className="text-xs font-medium text-black dark:text-white flex-1">别催了！在生成呐</span>

                            {/* Stop Button */}
                            {onCancel && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancel(node.id);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full transition-all active:scale-95 group/stop"
                                    title="停止生成"
                                    style={{
                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                        color: 'var(--accent-red)',
                                        transitionDuration: 'var(--duration-fast)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'var(--accent-red)';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                        e.currentTarget.style.color = 'var(--accent-red)';
                                    }}
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                        <rect x="6" y="6" width="12" height="12" rx="2" />
                                    </svg>
                                </button>
                            )}
                        </>
                    ) : node.isDraft ? (
                        <>
                            <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30">
                                <Sparkles size={12} className="text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <span className="text-xs font-medium text-[var(--accent-indigo)] flex-1">偷瞄一眼效果..</span>
                        </>
                    ) : node.error ? (
                        <>
                            <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                            <span
                                className="text-xs font-medium text-red-400 flex-1 truncate cursor-help"
                                title={node.error}
                            >
                                {node.error?.includes('API key') ? 'API Key 罢工了' :
                                    node.error?.includes('Invalid URL') ? '参考图迷路了' :
                                        node.error?.includes('Ref img fetch failed') ? '参考图加载失败' :
                                            node.error?.includes('Failed to fetch') ? '网络开小差了' :
                                                node.error?.includes('40') ? '权限验证失败' :
                                                    '哎呀，翻车了...'}
                            </span>

                            {/* Retry Button */}
                            {onRetry && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRetry(node);
                                    }}
                                    className="px-2 py-1 text-xs transition-all active:scale-95"
                                    title="重新生成"
                                    style={{
                                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                        color: 'var(--accent-blue)',
                                        borderRadius: 'var(--radius-sm)',
                                        transitionDuration: 'var(--duration-fast)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = 'var(--accent-blue)';
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                                        e.currentTarget.style.color = 'var(--accent-blue)';
                                    }}
                                >
                                    重试
                                </button>
                            )}

                            {/* Delete Button */}
                            {onDelete && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(node.id);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                    title="删除"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            )}
                        </>
                    ) : (
                        // Default / Success State
                        <>
                            <div className="w-6 h-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center border border-[var(--border-light)]">
                                {node.mode === GenerationMode.VIDEO ? (
                                    <Video size={12} className="text-purple-500" />
                                ) : node.childImageIds && node.childImageIds.length > 0 ? (
                                    <Sparkles size={12} className="text-yellow-500" />
                                ) : (
                                    <Image size={12} className="text-[var(--text-tertiary)]" />
                                )}
                            </div>
                            <span className="text-xs font-medium text-[var(--text-secondary)] flex-1">
                                {node.mode === GenerationMode.VIDEO
                                    ? (node.childImageIds && node.childImageIds.length > 0 ? '视频生成完成 🎬' : '视频模式 🎬')
                                    : (node.childImageIds && node.childImageIds.length > 0 ? '图片生成完成 ✨' : '准备就绪 ✏️')}
                            </span>
                            {/* Delete Button (Always show for idle/success nodes too) */}
                            {onDelete && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(node.id);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-red-500/10 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                    title="删除"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            )}
                        </>
                    )}
                </div>

                {/* Reference Images Thumbnails */}
                {node.referenceImages && node.referenceImages.length > 0 && (
                    <div className="flex gap-1 mb-2 flex-wrap">
                        {node.referenceImages.slice(0, 4).map((img, idx) => (
                            <div
                                key={img.id || idx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const refThumb = e.currentTarget.querySelector('img');
                                    if (refThumb) {
                                        const rect = refThumb.getBoundingClientRect();
                                        const src = img.data?.startsWith('data:') || img.data?.startsWith('http') || img.data?.startsWith('blob:')
                                            ? img.data
                                            : `data:${img.mimeType || 'image/png'};base64,${img.data}`;
                                        setPreviewImage({ url: src, originRect: rect });
                                    }
                                }}
                            >
                                <ReferenceThumbnail
                                    image={img}
                                />
                            </div>
                        ))}
                        {node.referenceImages.length > 4 && (
                            <div className="w-10 h-10 rounded border border-[var(--border-light)] bg-[var(--bg-tertiary)] flex items-center justify-center text-xs text-[var(--text-secondary)]">
                                +{node.referenceImages.length - 4}
                            </div>
                        )}
                    </div>
                )}

                <div
                    className="text-[var(--text-primary)] text-[15px] leading-7 font-normal flex-1 tracking-wide overflow-y-auto max-h-[112px] custom-scrollbar pr-1"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {node.prompt}
                </div>


                {node.tags && node.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 mb-1 px-3">
                        {node.tags.map(tag => {
                            const colors = generateTagColor(tag);
                            return (
                                <span
                                    key={tag}
                                    className="px-1.5 py-0.5 text-[10px]"
                                    style={{
                                        backgroundColor: colors.bg,
                                        color: colors.text,
                                        border: `1px solid ${colors.border}`,
                                        borderRadius: 'var(--radius-sm)' // 4px
                                    }}
                                >
                                    #{tag}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Spacer (formerly connection dot - removed per user request) */}
            <div className="h-3 mt-3" />

            {/* Loading Placeholders - 2x2 Grid Layout with Shimmer */}
            {
                node.isGenerating && node.parallelCount && (() => {
                    const count = node.parallelCount;
                    const COLS = 2; // 固定2列
                    const GAP = 16;
                    const gapToPlaceholders = 80;

                    const { width: w, totalHeight: h } = getCardDimensions(node.aspectRatio, true);

                    return (
                        <div className="relative" style={{ height: 0 }}>
                            {Array.from({ length: count }).map((_, i) => {
                                const col = i % COLS;
                                const row = Math.floor(i / COLS);

                                // 计算当前行实际有多少张卡片(与App.tsx逻辑一致)
                                const cardsInCurrentRow = Math.min(COLS, count - row * COLS);
                                const rowWidth = cardsInCurrentRow * w + (cardsInCurrentRow - 1) * GAP;
                                const startX = -rowWidth / 2; // 相对主卡中心的起始位置

                                // 居中布局
                                const offsetX = startX + col * (w + GAP) + w / 2;
                                const offsetY = gapToPlaceholders + row * (h + GAP);

                                return (
                                    <React.Fragment key={i}>
                                        {/* 能量流动线 */}
                                        <svg
                                            className="pointer-events-none"
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: 0,
                                                overflow: 'visible',
                                                zIndex: 1
                                            }}
                                        >
                                            <defs>
                                                {/* 发光滤镜 */}
                                                <filter id={`glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                                                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                                    <feMerge>
                                                        <feMergeNode in="coloredBlur" />
                                                        <feMergeNode in="SourceGraphic" />
                                                    </feMerge>
                                                </filter>

                                                {/* 能量流动渐变 */}
                                                <linearGradient id={`energy-gradient-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0">
                                                        <animate attributeName="offset" values="0;0.3;0" dur="1.5s" repeatCount="indefinite" />
                                                    </stop>
                                                    <stop offset="30%" stopColor="#8b5cf6" stopOpacity="1">
                                                        <animate attributeName="offset" values="0.3;0.7;0.3" dur="1.5s" repeatCount="indefinite" />
                                                    </stop>
                                                    <stop offset="60%" stopColor="#a855f7" stopOpacity="0.8">
                                                        <animate attributeName="offset" values="0.6;1;0.6" dur="1.5s" repeatCount="indefinite" />
                                                    </stop>
                                                    <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>

                                            {/* 外发光层 */}
                                            <path
                                                d={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                fill="none"
                                                stroke="#8b5cf6"
                                                strokeWidth="8"
                                                opacity="0.1"
                                                filter={`url(#glow-${i})`}
                                            />

                                            {/* 基础线条(脉冲效果) */}
                                            <path
                                                d={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                fill="none"
                                                stroke="#6366f1"
                                                strokeWidth="2"
                                                opacity="0.3"
                                            >
                                                <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
                                            </path>

                                            {/* 能量流动线 */}
                                            <path
                                                d={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                fill="none"
                                                stroke={`url(#energy-gradient-${i})`}
                                                strokeWidth="4"
                                                strokeLinecap="round"
                                                filter={`url(#glow-${i})`}
                                            />

                                            {/* 能量粒子1 - 快速 */}
                                            <circle r="4" fill="#a855f7" opacity="0" filter={`url(#glow-${i})`}>
                                                <animateMotion
                                                    dur="1.5s"
                                                    repeatCount="indefinite"
                                                    path={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                />
                                                <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite" />
                                                <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />
                                            </circle>

                                            {/* 能量粒子2 - 中速 */}
                                            <circle r="3" fill="#8b5cf6" opacity="0" filter={`url(#glow-${i})`}>
                                                <animateMotion
                                                    dur="1.8s"
                                                    repeatCount="indefinite"
                                                    begin="0.3s"
                                                    path={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                />
                                                <animate attributeName="opacity" values="0;0.8;0" dur="1.8s" repeatCount="indefinite" begin="0.3s" />
                                            </circle>

                                            {/* 能量粒子3 - 慢速 */}
                                            <circle r="2.5" fill="#6366f1" opacity="0" filter={`url(#glow-${i})`}>
                                                <animateMotion
                                                    dur="2s"
                                                    repeatCount="indefinite"
                                                    begin="0.6s"
                                                    path={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                />
                                                <animate attributeName="opacity" values="0;0.6;0" dur="2s" repeatCount="indefinite" begin="0.6s" />
                                            </circle>
                                        </svg>

                                        {/* 副占位卡 */}
                                        <div
                                            className="absolute rounded-xl overflow-hidden shadow-lg"
                                            style={{
                                                width: w,
                                                height: h,
                                                left: `calc(50% + ${offsetX}px)`,
                                                top: offsetY,
                                                transform: 'translateX(-50%)',
                                                zIndex: 20,
                                                background: 'var(--bg-surface)',
                                                border: '1px solid var(--border-light)'
                                            }}
                                        >
                                            {/* 扫光动画层 - 暗色白灰/亮色灰黑 */}
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    background: 'linear-gradient(110deg, transparent 30%, var(--shimmer-color, rgba(255,255,255,0.05)) 45%, var(--shimmer-color, rgba(255,255,255,0.2)) 50%, var(--shimmer-color, rgba(255,255,255,0.05)) 55%, transparent 70%)',
                                                    backgroundSize: '200% 100%',
                                                    animation: 'shimmer-sweep 2s linear infinite'
                                                }}
                                            />

                                            {/* 内容区 */}
                                            <div className="flex-1 flex flex-col items-center justify-center h-full relative z-10">
                                                <GenerationTimer start={node.timestamp || Date.now()} />
                                            </div>

                                            {/* 底部信息栏 */}
                                            <div
                                                className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center px-2 gap-2"
                                                style={{
                                                    background: 'var(--bg-tertiary)',
                                                    borderTop: '1px solid var(--border-light)'
                                                }}
                                            >
                                                <div
                                                    className="flex items-center gap-2 px-2 py-0.5 rounded"
                                                    style={{
                                                        backgroundColor: 'var(--bg-tertiary)',
                                                        border: '1px solid var(--border-light)'
                                                    }}
                                                >
                                                    <span className={`text-[7px] font-medium whitespace-nowrap ${(() => {
                                                        const m = (node.model || '').toLowerCase();
                                                        if (m.includes('gemini-3-pro') || m.includes('nano-banana-pro')) return 'text-purple-400';
                                                        if (m.includes('gemini-3-flash')) return 'text-cyan-400';
                                                        if (m.includes('gemini-2.5-flash') || m.includes('nano-banana')) return 'text-yellow-400';
                                                        if (m.includes('gemini-2.5-pro')) return 'text-amber-400';
                                                        if (m.includes('imagen-4') && m.includes('ultra')) return 'text-purple-400';
                                                        if (m.includes('imagen-4')) return 'text-blue-400';
                                                        if (m.includes('veo-3')) return 'text-purple-400';
                                                        if (m.includes('veo')) return 'text-violet-400';
                                                        return 'text-[var(--text-secondary)]';
                                                    })()}`}>
                                                        {getModelDisplayName(node.model || '')}
                                                    </span>
                                                    <span className="text-[var(--border-medium)] text-[7px]">|</span>
                                                    <span className="text-[7px] font-medium text-[var(--text-secondary)] whitespace-nowrap">
                                                        {node.aspectRatio || '1:1'} · {(node.imageSize as string) === '1024x1024' || (node.imageSize as string) === '1K' ? '1K' :
                                                            (node.imageSize as string) === '2048x2048' || (node.imageSize as string) === '2K' ? '2K' :
                                                                (node.imageSize as string) === '4096x4096' || (node.imageSize as string) === '4K' ? '4K' :
                                                                    (node.imageSize as string) || '1K'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}

                            {/* 扫光动画CSS */}
                            <style>{`
                                @keyframes shimmer-sweep {
                                    0% { background-position: -200% 0; }
                                    100% { background-position: 200% 0; }
                                }
                                :root {
                                    --shimmer-color: rgba(255, 255, 255, 0.08);
                                }
                                .dark {
                                    --shimmer-color: rgba(255, 255, 255, 0.08);
                                }
                                :root:not(.dark) {
                                    --shimmer-color: rgba(0, 0, 0, 0.05);
                                }
                            `}</style>
                        </div>
                    );
                })()
            }

            {/* Visual Guide Line (optional, only when dragging maybe?) */}

            {/* [NEW] 参考图放大浮层 */}
            {previewImage && (
                <ImagePreview
                    imageUrl={previewImage.url}
                    originRect={previewImage.originRect}
                    onClose={() => setPreviewImage(null)}
                />
            )}
        </div >
    );
});

export default PromptNodeComponent;

