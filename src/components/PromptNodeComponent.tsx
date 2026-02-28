import React, { useState, useEffect, useRef } from 'react';
import { PromptNode, AspectRatio, GenerationMode } from '../types';
import { Sparkles, Loader2, Video, Image, Pin, Music } from 'lucide-react';
import { getCardDimensions } from '../utils/styleUtils';
import { generateTagColor } from '../utils/colorUtils';
import { getModelDisplayName } from '../services/modelCapabilities';
import { getModelBadgeInfo, getProviderBadgeColor } from '../utils/modelBadge';
import ImagePreview from './ImagePreview';

const truncateByChars = (text: string, maxChars: number): string => {
    if (!text) return '';
    return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
};

interface PromptNodeProps {
    node: PromptNode;
    onPositionChange: (id: string, newPos: { x: number; y: number }) => void;
    isSelected: boolean;
    onSelect: () => void;
    onClickPrompt?: (node: PromptNode, isOptimizedView?: boolean) => void;
    onConnectStart?: (id: string, startPos: { x: number; y: number }) => void;
    canvasTransform?: { x: number; y: number; scale: number }; // Deprecated
    zoomScale?: number;
    isMobile?: boolean;
    sourcePosition?: { x: number; y: number };
    onCancel?: (id: string) => void;
    onDelete?: (id: string) => void;
    onRetry?: (node: PromptNode) => void;
    onExportPpt?: (node: PromptNode) => void;
    onExportPptx?: (node: PromptNode) => void;
    onRetryPptPage?: (node: PromptNode, pageIndex: number) => void;
    onExportPptPage?: (node: PromptNode, pageIndex: number) => void;
    ioTrace?: {
        inputStorageIds: string[];
        outputStorageIds: string[];
    };
    onOpenStorageSettings?: () => void;
    onDisconnect?: (id: string) => void;
    onHeightChange?: (id: string, height: number) => void;
    highlighted?: boolean;
    onPin?: (id: string, mode: 'button' | 'drag') => void; // 🚀 [New Prop] Pin Draft
    onRemoveTag?: (id: string, tag: string) => void; // 🚀 [New Prop] Remove Tag
    onDragDelta?: (delta: { x: number; y: number }, sourceNodeId?: string) => void; // 🚀 [New Prop] Relative Drag
}

// [FIX] Self-healing thumbnail component that recovers data from IDB if missing
const ReferenceThumbnail: React.FC<{
    image: { id: string, data?: string, mimeType?: string },
    onClick?: (e: React.MouseEvent) => void
}> = ({ image, onClick }) => {
    const [data, setData] = useState<string | undefined>(undefined);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 🚀 [Fix] If data exists and is NOT a blob URL, use it directly
        // Blob URLs can expire after page refresh, so we should try to recover from IDB
        if (image.data && !image.data.startsWith('blob:')) {
            setData(image.data);
            setLoading(false);
            return;
        }

        // If data missing OR is a blob URL (may be expired), try recover from IDB
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
                    } else if (active && image.data) {
                        // Fallback to original data if IDB returns nothing
                        setData(image.data);
                    }
                    if (active) setLoading(false);
                })
                .catch((e) => {
                    // Fallback to original data on error
                    if (active && image.data) {
                        setData(image.data);
                    }
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
            className="w-10 h-10 rounded border border-[var(--border-light)] overflow-hidden relative bg-[var(--bg-tertiary)] cursor-pointer active:scale-95 transition-transform"
            draggable={!!src}
            onMouseDown={(e) => {
                // Allow Standard Click, but prevent Drag unless moved
                e.stopPropagation();
            }}
            onClick={(e) => {
                e.stopPropagation(); // Prevent card selection
                if (onClick) onClick(e);
            }}
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

// [NEW] Timer for generation status - 3档颜色系统
// ✅ <200s: 绿色 - "正在生成"
// ⚠️ 200-400s: 黄色 - "等待时间过长"
// 🔴 400-600s: 红色 - "建议重新生成"
// ❌ >600s: 自动取消并转为错误卡
const GenerationTimer: React.FC<{ start: number; onTimeout?: () => void }> = ({ start, onTimeout }) => {
    const [elapsed, setElapsed] = useState(0);
    const timeoutTriggered = useRef(false);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now() - start;
            setElapsed(now);

            // 🚀 超过600秒自动取消
            if (now > 600000 && !timeoutTriggered.current && onTimeout) {
                timeoutTriggered.current = true;
                onTimeout();
            }
        }, 100);
        return () => clearInterval(interval);
    }, [start, onTimeout]);

    const seconds = Math.floor(elapsed / 1000);
    const displayTime = (elapsed / 1000).toFixed(1);

    // 计算颜色和状态信息
    let colorClass: string;
    let statusText: string;
    let iconColorClass: string;

    if (seconds < 200) {
        colorClass = 'text-green-400';
        iconColorClass = 'text-green-400';
        statusText = '正在生成';
    } else if (seconds < 400) {
        colorClass = 'text-yellow-400';
        iconColorClass = 'text-yellow-400';
        statusText = '等待时间过长';
    } else {
        colorClass = 'text-red-400';
        iconColorClass = 'text-red-400';
        statusText = '建议重新生成';
    }

    return (
        <div className="flex flex-col items-center gap-0.5 pointer-events-none select-none">
            <div className={`text-[10px] opacity-80 font-medium tracking-widest mb-0.5 ${colorClass}`}>
                {statusText}
            </div>
            <div className={`flex items-center gap-2 ${colorClass}`}>
                <Loader2 className={`animate-spin ${iconColorClass}`} size={14} />
                <div className="font-mono text-lg font-medium tabular-nums tracking-wider drop-shadow-sm">
                    {displayTime}s
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
    onExportPpt,
    onExportPptx,
    onRetryPptPage,
    onExportPptPage,
    ioTrace,
    onOpenStorageSettings,
    onDisconnect,
    onHeightChange,
    highlighted,
    onPin,
    onRemoveTag,
    onDragDelta
}) => {
    // 🚀 [DEBUG] Trace PromptNode Rendering
    // if (node.isGenerating) {
    //    console.log('[PromptNode] Rendering Generating Node:', node.id, 'Parallel:', node.parallelCount);
    // }

    const [isDragging, setIsDragging] = useState(false);
    const [cardHeight, setCardHeight] = useState(200); // 默认高度??00px,会在渲染后更??
    const borderScale = zoomScale || 1;
    const adaptiveBorderWidth = Math.max(1, 1.5 / borderScale);
    const cardWidth = 320; // 固定宽度，与CSS w-[320px] 保持一致
    const [previewImage, setPreviewImage] = useState<{ url: string; originRect: DOMRect } | null>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartCanvasPos = useRef({ x: 0, y: 0 });
    const lastMousePos = useRef<{ x: number; y: number } | null>(null);
    const pendingDelta = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const hasMoved = useRef(false);
    const [showOptimizedPrompt, setShowOptimizedPrompt] = useState(false);
    const [showErrorDetails, setShowErrorDetails] = useState(false);
    const [showTraceDetails, setShowTraceDetails] = useState(false);
    const timerStartRef = useRef<number>(node.timestamp || Date.now());

    const containerRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const localPosRef = useRef(node.position);

    // Sync ref when node.position updates externally (and not dragging)
    useEffect(() => {
        if (!isDragging) {
            localPosRef.current = node.position;
            // Force update DOM to match new prop position if needed
            if (containerRef.current) {
                containerRef.current.style.left = `${Math.round(node.position.x - cardWidth / 2)}px`;
                containerRef.current.style.top = `${Math.round(node.position.y - cardHeight)}px`;
                containerRef.current.style.transform = 'none';
            }
        }
    }, [node.position.x, node.position.y, isDragging, cardWidth, cardHeight]);

    useEffect(() => {
        setShowOptimizedPrompt(false);
        setShowErrorDetails(false);
        setShowTraceDetails(false);
    }, [node.id]);

    useEffect(() => {
        timerStartRef.current = node.timestamp || Date.now();
    }, [node.id, node.timestamp]);

    // 🚀 [New] Transition Animation from Center (Draft Overlay) to Canvas Position
    useEffect(() => {
        // Only trigger for "fresh" nodes (created < 1s ago) that are NOT drafts and NOT generating (or maybe yes generating?)
        // The transition happens when Draft -> Generating (fixed).
        // So we look for !isDraft.
        if (node.isDraft) return;

        const now = Date.now();
        const isFresh = node.timestamp && (now - node.timestamp < 1000);

        // We only animate if it's fresh AND we have canvas transform data
        if (isFresh && canvasTransform && containerRef.current) {
            import('gsap').then(({ default: gsap }) => {
                // 1. Calculate Screen Center in World Coordinates
                // ScreenCenter(screenX, screenY) = (WorldX * Scale + TrX, WorldY * Scale + TrY)
                // WorldX = (ScreenX - TrX) / Scale
                const screenCenterX = window.innerWidth / 2;
                const screenCenterY = window.innerHeight / 2;

                const worldCenterX = (screenCenterX - canvasTransform.x) / canvasTransform.scale;
                const worldCenterY = (screenCenterY - canvasTransform.y) / canvasTransform.scale;

                // 2. Calculate Start Scale (Overlay is 1:1 on Screen, so World Scale is 1/Zoom)
                // If Zoom is 0.5, Overlay is 2x World Size. We animate from 2x to 1x.
                const startScale = 1 / canvasTransform.scale;

                // 3. Animate
                gsap.from(containerRef.current, {
                    x: worldCenterX - node.position.x, // Relative offset (GSAP 'x' is translate)
                    y: worldCenterY - node.position.y,
                    scale: startScale,
                    opacity: 0, // Fade in slightly
                    duration: 0.6,
                    ease: "power3.out",
                    clearProps: "transform,opacity"
                });
            });
        }
    }, [node.id, node.timestamp, node.isDraft]); // Run once when these change match criteria


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
                // 🚀 [Fix] Only update if height actually changed to prevent infinite loop
                if (height > 0) {
                    setCardHeight(prev => (Math.abs(prev - height) > 2 ? height : prev));
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
        if ('button' in e && e.button === 2) return; // Right click
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
        lastMousePos.current = { x: clientX, y: clientY }; // 🚀 Track frame delta
        dragStartCanvasPos.current = { x: localPosRef.current.x, y: localPosRef.current.y };

        setIsDragging(true);
        hasMoved.current = false;
        pendingDelta.current = { x: 0, y: 0 };
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
            const scale = zoomScale;
            // 1. Calculate Absolute Delta (For Local Visuals - Smoothness)
            const absoluteDeltaX = (clientX - dragStartPos.current.x) / scale;
            const absoluteDeltaY = (clientY - dragStartPos.current.y) / scale;

            // 🚀 [Fix Text Jitter] Map dynamic drag coordinates to absolute integer pixel boundaries
            const newPos = {
                x: Math.round(dragStartCanvasPos.current.x + absoluteDeltaX),
                y: Math.round(dragStartCanvasPos.current.y + absoluteDeltaY)
            };

            // 2. Direct DOM Update (Visuals)
            if (containerRef.current) {
                containerRef.current.style.left = `${Math.round(newPos.x - cardWidth / 2)}px`;
                containerRef.current.style.top = `${Math.round(newPos.y - cardHeight)}px`;
                containerRef.current.style.transform = 'none';
            }
            localPosRef.current = newPos;

            // 3. Global Update (Logic)
            if (onDragDelta && lastMousePos.current) {
                // 🚀 Relative Delta Mode (Robust against external jumps)
                const stepDeltaX = (clientX - lastMousePos.current.x) / scale;
                const stepDeltaY = (clientY - lastMousePos.current.y) / scale;

                lastMousePos.current = { x: clientX, y: clientY };

                // Accumulate
                pendingDelta.current.x += stepDeltaX;
                pendingDelta.current.y += stepDeltaY;

                onDragDelta(pendingDelta.current, node.id);
                pendingDelta.current = { x: 0, y: 0 };

            } else {
                // Fallback: Absolute Position Update (Legacy)
                const now = Date.now();
                if (now - lastGlobalUpdateRef.current > 50) {
                    onPositionChange(node.id, newPos);
                    lastGlobalUpdateRef.current = now;
                }
            }

            requestRef.current = null;
        });
    };

    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            // Commit final position IF NOT using Delta Mode
            // In Delta mode, state is updated incrementally, so we don't need a final absolute commit
            // which could fight with external state.
            if (!onDragDelta) {
                onPositionChange(node.id, localPosRef.current);
            }
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
    }, [isDragging, zoomScale, onDragDelta, onPositionChange, node.id]);

    return (
        <div
            ref={containerRef}
            className={`absolute z-20 flex flex-col items-center group animate-cardPopIn antialiased select-none ${isSelected ? 'z-30' : ''}`}
            style={{
                left: Math.round(node.position.x - cardWidth / 2),
                top: Math.round(node.position.y - cardHeight),
                transform: 'none',
                willChange: 'auto', // Preserve baseline subpixel AA text rendering
                cursor: isDragging ? 'grabbing' : 'grab',
                // Disable transition during drag to prevent fighting with JS updates
                transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
                backfaceVisibility: 'visible'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
        >
            {/* Main Content Card */}
            <div
                ref={cardRef}
                className={`relative flex flex-col w-[320px] rounded-2xl border transition-all`}
                style={{
                    backgroundColor: 'var(--bg-overlay)',
                    borderColor: node.error
                        ? 'rgba(239, 68, 68, 0.5)'
                        : isSelected ? 'rgba(59, 130, 246, 0.6)' : 'var(--border-light)',
                    boxShadow: node.error
                        ? '0 0 15px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.5)'
                        : isSelected
                            ? '0 0 20px rgba(59, 130, 246, 0.4), 0 0 40px rgba(59, 130, 246, 0.15), 0 0 0 1px rgba(59, 130, 246, 0.5)'
                            : '0 4px 20px -2px rgba(0,0,0,0.15), 0 0 0 1px var(--border-light)',
                }}
            >
                {/* Header (Status & Actions) */}
                <div className="flex items-center justify-between px-4 py-3 w-full" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Left: Status Icon and Text */}
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                        {node.error ? (
                            <>
                                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-red-500/15">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="12" y1="8" x2="12" y2="12"></line>
                                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                    </svg>
                                </div>
                                <span className="text-[13px] font-medium tracking-wide truncate text-red-500" title={node.error}>
                                    生成失败: {node.error.replace(/^Error:\s*/i, '').split(/[:：]/)[0].trim()}
                                </span>
                                {node.errorDetails && (
                                    <button
                                        className="ml-1 px-1.5 py-0.5 rounded border border-red-500/30 text-[10px] text-red-300 hover:bg-red-500/10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowErrorDetails(prev => !prev);
                                        }}
                                    >
                                        {showErrorDetails ? '收起详情' : '错误详情'}
                                    </button>
                                )}
                            </>
                        ) : node.isGenerating ? (
                            <>
                                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-blue-500/15">
                                    <Sparkles size={12} className="text-blue-400 animate-pulse" />
                                </div>
                                <span className="text-[13px] font-medium tracking-wide truncate text-blue-400">
                                    正在生成 {node.parallelCount || 1} 张
                                </span>
                            </>
                        ) : (
                            <>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-amber-500/10`}>
                                    <Sparkles size={12} className="text-amber-400" />
                                </div>
                                <span className="text-[13px] font-medium tracking-wide truncate">
                                    {node.childImageIds?.length > 0 ? (
                                        <span className="text-[var(--text-secondary)]">已生成 {node.childImageIds.length} 张</span>
                                    ) : (
                                        <span className="text-[var(--text-tertiary)]">
                                            {node.isDraft && !node.originalPrompt && !node.prompt ? '输入提示词...' : (node as any).title || node.id.slice(0, 8) + '...'}
                                        </span>
                                    )}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                        {/* 优化提示词 Toggle */}
                        {(node.optimizedPromptEn || node.optimizedPromptZh) && (
                            <div
                                className={`flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors select-none text-[11px] font-medium leading-none ${showOptimizedPrompt
                                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border-light)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                    }`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowOptimizedPrompt(!showOptimizedPrompt);
                                }}
                                title={showOptimizedPrompt ? '当前显示优化后提示词，点击切换为原始提示词' : '当前显示原始提示词，点击切换为优化后提示词'}
                            >
                                {showOptimizedPrompt ? '优化' : '原始'}
                            </div>
                        )}

                        {/* Delete Button */}
                        {onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(node.id);
                                }}
                                className="p-1 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                title="删除提示词"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Content Padding Wrapper */}
                <div className="p-3 flex flex-col flex-1">
                    {/* Reference Images Thumbnails */}
                    {node.referenceImages && node.referenceImages.length > 0 && (
                        <div className="flex gap-1 mb-2 flex-wrap">
                            {node.referenceImages.slice(0, 4).map((img, idx) => (
                                <ReferenceThumbnail
                                    key={img.id || idx}
                                    image={img}
                                    onClick={(e) => {
                                        const refThumb = e.currentTarget.querySelector('img');
                                        if (refThumb) {
                                            const rect = refThumb.getBoundingClientRect();
                                            const src = refThumb.src; // Use the rendered src (which is resolved)
                                            setPreviewImage({ url: src, originRect: rect });
                                        }
                                    }}
                                />
                            ))}
                            {node.referenceImages.length > 4 && (
                                <div className="w-10 h-10 rounded border border-[var(--border-light)] bg-[var(--bg-tertiary)] flex items-center justify-center text-xs text-[var(--text-secondary)]">
                                    +{node.referenceImages.length - 4}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Prompt Text Area - 文字可选，但选择范围被约束在本卡片内 */}
                    <div
                        className="text-[var(--text-primary)] text-[15px] leading-7 font-normal flex-1 tracking-wide overflow-y-auto max-h-[132px] custom-scrollbar pr-1 min-h-[28px] select-text cursor-text"
                        onWheel={(e) => e.stopPropagation()}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            // 🚀 动态注入全局 CSS 规则：强制禁选所有其他 .select-text 元素
                            //    唯独当前元素通过 data 属性排除，确保选择不会跨卡片
                            const el = e.currentTarget;
                            el.setAttribute('data-text-selecting', 'true');
                            const style = document.createElement('style');
                            style.id = 'kk-text-select-lock';
                            style.textContent = `
                                .select-text:not([data-text-selecting]) {
                                    -webkit-user-select: none !important;
                                    user-select: none !important;
                                }
                            `;
                            document.head.appendChild(style);
                            const cleanup = () => {
                                el.removeAttribute('data-text-selecting');
                                const s = document.getElementById('kk-text-select-lock');
                                if (s) s.remove();
                                document.removeEventListener('mouseup', cleanup);
                            };
                            document.addEventListener('mouseup', cleanup);
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            // 只在非选择操作时触发编辑（选中了文字就不打开编辑器）
                            const sel = document.getSelection();
                            if (sel && sel.toString().length > 0) return;
                            if (onClickPrompt) onClickPrompt(node, showOptimizedPrompt);
                        }}
                    >
                        {showOptimizedPrompt && node.optimizedPromptEn ? (
                            <div className="space-y-2">
                                <div className="text-[13px] leading-6 text-[var(--text-primary)] whitespace-pre-wrap">{node.optimizedPromptEn}</div>
                                <div className="text-[12px] leading-5 text-[var(--text-secondary)] whitespace-pre-wrap">{node.optimizedPromptZh || node.originalPrompt || node.prompt}</div>
                            </div>
                        ) : (
                            node.originalPrompt || node.prompt || (node.isDraft ? <span className="text-[var(--text-tertiary)] italic">输入提示词...</span> : '')
                        )}

                        {onExportPpt && node.mode === GenerationMode.PPT && (node.childImageIds?.length || 0) > 0 && !node.isGenerating && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onExportPpt(node);
                                }}
                                className="px-2 py-1 rounded-md border text-[11px] leading-none bg-sky-500/10 text-sky-300 border-sky-500/30 hover:bg-sky-500/20"
                                title="导出该PPT主卡的页面包"
                            >
                                导出包
                            </button>
                        )}

                        {onExportPptx && node.mode === GenerationMode.PPT && (node.childImageIds?.length || 0) > 0 && !node.isGenerating && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onExportPptx(node);
                                }}
                                className="px-2 py-1 rounded-md border text-[11px] leading-none bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20"
                                title="导出PPTX文件"
                            >
                                导出PPTX
                            </button>
                        )}
                    </div>

                    {node.error && node.errorDetails && showErrorDetails && (
                        <div className="mt-2 p-2 rounded-lg border text-[10px] font-mono leading-4 whitespace-pre-wrap max-h-40 overflow-y-auto"
                            style={{
                                borderColor: 'rgba(239,68,68,0.35)',
                                backgroundColor: 'rgba(127,29,29,0.18)',
                                color: 'rgba(254,226,226,0.95)'
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            {`code: ${node.errorDetails.code || '-'}\nstatus: ${node.errorDetails.status ?? '-'}\nprovider: ${node.errorDetails.provider || '-'}\nmodel: ${node.errorDetails.model || '-'}\nrequest:\n${node.errorDetails.requestBody || '-'}\nresponse:\n${node.errorDetails.responseBody || '-'}`}
                        </div>
                    )}



                    {node.mode === GenerationMode.PPT && !node.isGenerating && (node.childImageIds?.length || 0) > 0 && onRetryPptPage && (
                        <div className="mt-2 p-2 rounded-lg border" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}>
                            <div className="text-[10px] mb-1 text-[var(--text-tertiary)]">单页重生</div>
                            <div className="flex flex-wrap gap-1">
                                {Array.from({ length: Math.min(20, node.childImageIds.length) }).map((_, idx) => (
                                    <div key={`retry-ppt-${idx}`} className="flex items-center gap-0.5">
                                        <button
                                            className="px-1.5 py-0.5 rounded border text-[10px] border-[var(--border-light)] text-[var(--text-secondary)] hover:bg-white/5"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRetryPptPage(node, idx);
                                            }}
                                            title={`重生图${idx + 1}`}
                                        >
                                            图{idx + 1}
                                        </button>
                                        {onExportPptPage && (
                                            <button
                                                className="px-1 py-0.5 rounded border text-[10px] border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onExportPptPage(node, idx);
                                                }}
                                                title={`导出图${idx + 1}`}
                                            >
                                                导
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 🚀 Main Card Tags: Centered Layout with Hover Blur + X Delete */}
                    {node.tags && node.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3 mb-1 px-2 w-full box-border justify-center">
                            {node.tags.slice(0, 8).map(tag => {
                                const colors = generateTagColor(tag);
                                return (
                                    <div
                                        key={tag}
                                        className="relative group/tag flex items-center justify-center px-3 py-1 text-xs font-medium rounded-lg border transition-all cursor-default select-none overflow-hidden"
                                        style={{
                                            backgroundColor: colors.bg,
                                            color: colors.text,
                                            borderColor: colors.border,
                                            minHeight: '24px' // Consistent height
                                        }}
                                    >
                                        {/* Tag Text - Blurs on hover */}
                                        <span className="whitespace-nowrap transition-all duration-200 group-hover/tag:blur-sm group-hover/tag:opacity-30">#{tag}</span>

                                        {/* Delete Button - Centered, visible on hover */}
                                        {onRemoveTag && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRemoveTag(node.id, tag);
                                                }}
                                                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition-all duration-200"
                                                title="移除标签"
                                            >
                                                <div className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500/90 text-white shadow-sm">
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Spacer */}
                    <div className="h-3 mt-3" />

                    {/* Loading Placeholders - 2x2 Grid Layout with Shimmer */}
                    {node.isGenerating && (() => {
                        // 🚀 [Fix] Force count to at least 1 if undefined, ensuring placeholders appear
                        const count = node.parallelCount || 1;
                        const COLS = node.mode === GenerationMode.PPT ? 1 : 2; // PPT副卡较长，默认单列
                        const GAP = node.mode === GenerationMode.PPT ? 28 : 20;
                        const gapToPlaceholders = 80;

                        // 🚀 [Fix] Auto Aspect Ratio Resolution
                        // If ratio is AUTO, try to infer from reference image, otherwise default to SQUARE
                        let resolvedRatio = node.aspectRatio;
                        if (resolvedRatio === AspectRatio.AUTO && node.referenceImages && node.referenceImages.length > 0) {
                            // If they HAVE refs, 1:1 is also safe-ish but might be wrong.
                            // TODO: Better auto-detection requires image metadata.
                            resolvedRatio = AspectRatio.SQUARE;
                        }

                        // Actually, if it IS auto, let's just use Square for now as it's the safest generic shape.
                        // The user issue "frame and image different ratio" likely means they uploaded a 16:9 image,
                        // selected "Auto", got a Square placeholder, and then the result was 16:9.
                        // To fix the "jumping" effect, we should ideally know the target ratio.
                        // Without it, Square is the best we can do.
                        // UNLESS we check if the user selected a specific model that enforces a ratio?

                        const { width: w, totalHeight: h } = getCardDimensions(resolvedRatio, true);
                        const rows = Math.ceil(count / COLS);
                        const totalPlaceholderHeight = gapToPlaceholders + rows * (h + GAP);

                        return (
                            <div
                                className="absolute w-full"
                                style={{
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    height: totalPlaceholderHeight
                                }}
                            >
                                {Array.from({ length: count }).map((_, i) => {
                                    const col = i % COLS;
                                    const row = Math.floor(i / COLS);
                                    const cardsInCurrentRow = Math.min(COLS, count - row * COLS);
                                    const rowWidth = cardsInCurrentRow * w + (cardsInCurrentRow - 1) * GAP;
                                    const startX = -rowWidth / 2;
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
                                                    {/* 发光滤镜 - Scoped ID */}
                                                    <filter id={`glow-${node.id}-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                                                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                                        <feMerge>
                                                            <feMergeNode in="coloredBlur" />
                                                            <feMergeNode in="SourceGraphic" />
                                                        </feMerge>
                                                    </filter>

                                                    {/* 能量流动渐变 - Scoped ID */}
                                                    <linearGradient id={`energy-gradient-${node.id}-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
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
                                                    filter={`url(#glow-${node.id}-${i})`}
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
                                                    stroke={`url(#energy-gradient-${node.id}-${i})`}
                                                    strokeWidth="4"
                                                    strokeLinecap="round"
                                                    filter={`url(#glow-${node.id}-${i})`}
                                                />

                                                {/* 能量粒子1 - 快速 */}
                                                <circle r="4" fill="#a855f7" opacity="0" filter={`url(#glow-${node.id}-${i})`}>
                                                    <animateMotion
                                                        dur="1.5s"
                                                        repeatCount="indefinite"
                                                        path={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                    />
                                                    <animate attributeName="opacity" values="0;1;0" dur="1.5s" repeatCount="indefinite" />
                                                    <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />
                                                </circle>

                                                {/* 能量粒子2 - 中速 */}
                                                <circle r="3" fill="#8b5cf6" opacity="0" filter={`url(#glow-${node.id}-${i})`}>
                                                    <animateMotion
                                                        dur="1.8s"
                                                        repeatCount="indefinite"
                                                        begin="0.3s"
                                                        path={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                    />
                                                    <animate attributeName="opacity" values="0;0.8;0" dur="1.8s" repeatCount="indefinite" begin="0.3s" />
                                                </circle>

                                                {/* 能量粒子3 - 慢速 */}
                                                <circle r="2.5" fill="#6366f1" opacity="0" filter={`url(#glow-${node.id}-${i})`}>
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
                                                    border: '1px solid var(--border-light)',
                                                    cursor: isDragging ? 'grabbing' : 'grab' // 🚀 Allow grab cursor to bubble
                                                }}
                                            >
                                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
                                                    <GenerationTimer
                                                        start={timerStartRef.current}
                                                        onTimeout={() => onCancel && onCancel(node.id)}
                                                    />
                                                </div>

                                                <div
                                                    className="absolute bottom-0 left-0 right-0 h-8 flex items-center justify-center px-2 gap-2"
                                                    style={{
                                                        background: 'var(--bg-tertiary)',
                                                        borderTop: '1px solid var(--border-light)'
                                                    }}
                                                >
                                                    <div
                                                        className="flex items-center gap-1.5 px-2 py-0.5 rounded"
                                                        style={{
                                                            backgroundColor: 'var(--bg-tertiary)',
                                                            border: '1px solid var(--border-light)'
                                                        }}
                                                    >
                                                        {(() => {
                                                            const modelId = node.model || '';
                                                            const modelText = node.modelLabel || getModelDisplayName(modelId);
                                                            const providerText = node.providerLabel || node.provider || (modelId.includes('@') ? modelId.split('@')[1] : 'Google');
                                                            const modelBadge = getModelBadgeInfo({ id: modelId, label: modelText, provider: providerText });

                                                            return (
                                                                <>
                                                                    <span className={`text-[7px] leading-none font-medium whitespace-nowrap max-w-[88px] truncate ${modelBadge.colorClass}`} title={modelText}>
                                                                        {truncateByChars(modelText, 15)}
                                                                    </span>
                                                                    {providerText && (
                                                                        <span
                                                                            className={`text-[7px] leading-none px-1 py-0.5 rounded whitespace-nowrap border ${getProviderBadgeColor(providerText)}`}
                                                                            title={providerText}
                                                                        >
                                                                            {truncateByChars(providerText, 5)}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[var(--border-medium)] text-[7px]">|</span>
                                                                    <span className="text-[7px] leading-none font-medium text-[var(--text-secondary)] whitespace-nowrap">
                                                                        {node.aspectRatio || '1:1'} · {node.mode === GenerationMode.VIDEO ? '720p' :
                                                                            node.mode === GenerationMode.AUDIO ? '音频' :
                                                                                node.mode === GenerationMode.PPT ? 'PPT' :
                                                                                (node.imageSize as string) === '1024x1024' || (node.imageSize as string) === '1K' ? '1K' :
                                                                                    (node.imageSize as string) === '2048x2048' || (node.imageSize as string) === '2K' ? '2K' :
                                                                                        (node.imageSize as string) === '4096x4096' || (node.imageSize as string) === '4K' ? '4K' :
                                                                                            (node.imageSize as string) || '1K'}
                                                                    </span>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* [NEW] 参考图放大浮层 */}
            {previewImage && (
                <ImagePreview
                    imageUrl={previewImage.url}
                    originRect={previewImage.originRect}
                    onClose={() => setPreviewImage(null)}
                />
            )}
        </div>
    );
}, (prev, next) => {
    // 🚀 [Fix] Only compare state/data props to avoid rendering on inline function identity changes
    if (prev.node.isGenerating !== next.node.isGenerating) return false;
    return (
        prev.node === next.node &&
        prev.isSelected === next.isSelected &&
        prev.highlighted === next.highlighted &&
        prev.zoomScale === next.zoomScale &&
        prev.isMobile === next.isMobile &&
        prev.sourcePosition?.x === next.sourcePosition?.x &&
        prev.sourcePosition?.y === next.sourcePosition?.y
    );
});

export default PromptNodeComponent;
