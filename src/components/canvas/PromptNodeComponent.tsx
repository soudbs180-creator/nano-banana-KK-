import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { PromptNode, AspectRatio, GenerationMode } from '../../types';
import { Sparkles, Loader2, Video, Image, Pin, Music, Copy, Check, Languages, Info, ChevronRight, Shield, CheckCircle2, AlertTriangle } from 'lucide-react';
import { getCardDimensions } from '../../utils/styleUtils';
import { generateTagColor } from '../../utils/colorUtils';
import { getModelDisplayName } from '../../services/model/modelCapabilities';
import { notify } from '../../services/system/notificationService';
import { getModelBadgeInfo, getProviderBadgeColor, getProviderBadgeStyle } from '../../utils/modelBadge';
import { writeTextToClipboard } from '../../utils/clipboard';
import { getLaunchTimelineByOffset, getPromptBarLaunchPoint } from '../../utils/cardLaunch';
import ImagePreview from '../image/ImagePreview';

const truncateByChars = (text: string, maxChars: number): string => {
    if (!text) return '';
    return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
};

const getPromptStackZIndex = (node: PromptNode, isSelected: boolean, groupLayerZIndex?: number) => {
    const persistedOrder = (groupLayerZIndex ?? node.zIndex ?? 0) * 100;

    if (node.isGenerating) return persistedOrder + 40;
    if (node.isNew) return persistedOrder + 30;
    if (isSelected) return persistedOrder + 20;
    return persistedOrder + 10;
};

const snapCanvasCoordinate = (value: number, scale: number = 1) => {
    if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) return value;
    return Math.round(value * scale) / scale;
};

interface PromptNodeProps {
    node: PromptNode;
    groupLayerZIndex?: number;
    stackZIndexOverride?: number;
    actualChildImageCount?: number;
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
    onEditPptDeck?: (node: PromptNode) => void;
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
    onUpdateNode?: (node: PromptNode) => void; // 🚀 [New Prop] Update node externally
    isChatMode?: boolean; // 🚀 [New Prop] Render as standard block in chat feed
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
        import('../../services/storage/imageStorage').then(({ getImage }) => {
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
            data-native-drag-source="true"
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
                // 🚀 [添加] 触发自定义事件通知 ImagePreview 关闭
                window.dispatchEvent(new CustomEvent('kk-drag-start'));
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
                        display: 'block'
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
        statusText = '等待时间较长';
    } else if (seconds < 600) {
        colorClass = 'text-red-400';
        iconColorClass = 'text-red-400';
        statusText = '建议重新生成';
    } else {
        colorClass = 'text-red-600';
        iconColorClass = 'text-red-600';
        statusText = '即将超时';
    }

    return (
        <div className="flex flex-col items-center gap-0.5 pointer-events-none select-none">
            <div className={`text-[10px] opacity-80 font-medium tracking-widest mb-0.5 ${colorClass}`}>
                {statusText}
            </div>
            <div className={`flex items-center gap-2 ${colorClass}`}>
                <Loader2 className={`animate-spin ${iconColorClass}`} size={14} />
                <div className="font-mono text-lg font-medium tabular-nums tracking-wider drop-shadow-sm transform translate-y-[-1px]">
                    {displayTime}s
                </div>
            </div>
        </div>
    );
};

const PromptNodeComponent: React.FC<PromptNodeProps> = React.memo(({
    node,
    groupLayerZIndex,
    stackZIndexOverride,
    actualChildImageCount = 0,

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
    onEditPptDeck,
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
    onDragDelta,
    onUpdateNode,
    isChatMode = false
}) => {
    // 🚀 [DEBUG] Trace PromptNode Rendering
    // if (node.isGenerating) {
    //    console.log('[PromptNode] Rendering Generating Node:', node.id, 'Parallel:', node.parallelCount);
    // }

    const [isDragging, setIsDragging] = useState(false);
    const [cardHeight, setCardHeight] = useState(200); // 默认高度??00px,会在渲染后更??
    const borderScale = zoomScale || 1;
    const adaptiveBorderWidth = Math.max(1, 1.5 / borderScale);
    const baseCardWidth = 320;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : baseCardWidth;
    const cardWidth = isMobile ? Math.min(baseCardWidth, Math.max(248, viewportWidth - 24)) : baseCardWidth;
    const [previewImage, setPreviewImage] = useState<{ url: string; originRect: DOMRect } | null>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const lastMousePos = useRef({ x: 0, y: 0 });

    const hasMoved = useRef(false);
    const [activeTab, setActiveTab] = useState<'raw' | 'opt'>('raw');
    const [copyStatus, setCopyStatus] = useState<'idle' | 'en' | 'zh'>('idle');
    const [showErrorDetails, setShowErrorDetails] = useState(false);
    const [showTraceDetails, setShowTraceDetails] = useState(false);
    const timerStartRef = useRef<number>(node.timestamp || Date.now());

    const containerRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const localPosRef = useRef(node.position);
    const hasAnimatedRef = useRef<string | null>(null);

    // Sync ref when node.position updates externally (and not dragging)
    // 🚀 [Fix] 使用更宽松的条件，避免拖动结束后位置回弹
    useEffect(() => {
        if (!isDragging && !isChatMode) {
            localPosRef.current = node.position;
            // 🚀 [Fix] 只在位置差异较大时才强制更新 DOM，避免微小更新导致的抖动
            if (containerRef.current) {
                const currentLeft = parseFloat(containerRef.current.style.left) || 0;
                const currentTop = parseFloat(containerRef.current.style.top) || 0;
                const targetLeft = Math.round(node.position.x - cardWidth / 2);
                const targetTop = Math.round(node.position.y - cardHeight);
                
                // 只在差异超过 2px 时才更新，避免微小抖动
                if (Math.abs(currentLeft - targetLeft) > 2 || Math.abs(currentTop - targetTop) > 2) {
                    containerRef.current.style.left = `${targetLeft}px`;
                    containerRef.current.style.top = `${targetTop}px`;
                    containerRef.current.style.transform = 'translate3d(0, 0, 0)';
                }
            }
        }
    }, [node.position.x, node.position.y, isDragging, cardWidth, cardHeight, isChatMode]);

    useEffect(() => {
        // 🚀 默认展示优化后的结果 (若存在)
        if (node.promptOptimizerResult || (node.optimizedPromptEn && node.optimizedPromptZh)) {
            setActiveTab('opt');
        } else {
            setActiveTab('raw');
        }
        setShowErrorDetails(false);
        setShowTraceDetails(false);
    }, [node.id]);

    useEffect(() => {
        timerStartRef.current = node.timestamp || Date.now();
    }, [node.id, node.timestamp]);

    // 🚀 [丝滑优化] 统一飞入动画：从输入框中心飞向画布目标位置
    // 使用 useLayoutEffect + 单一 gsap.fromTo 避免双重动画冲突和位置跳动
    useLayoutEffect(() => {
        if (node.isDraft || hasAnimatedRef.current === node.id) return;

        const now = Date.now();
        const isFresh = node.timestamp && (now - node.timestamp < 1500);

        if (isFresh && canvasTransform && containerRef.current) {
            hasAnimatedRef.current = node.id;
            const el = containerRef.current;
            const restoreVisibility = () => {
                if (!el || !el.isConnected) return;
                el.style.opacity = '1';
                el.style.willChange = '';
                el.style.zIndex = '';
            };

            import('gsap').then(({ default: gsap }) => {
                if (!el || !el.isConnected) return;

                try {
                    // 仅在 GSAP 成功加载后再隐藏，避免卡片永久透明
                    el.style.opacity = '0';
                    el.style.willChange = 'transform, opacity';

                    // 1. 计算起始世界坐标（从输入框下沿外侧弹出，避免压在输入框上层）
                    const launchPoint = getPromptBarLaunchPoint(18, 'bottom');
                    const startScreenX = launchPoint.x;
                    const startScreenY = launchPoint.y;
                    const offsetX = (startScreenX - canvasTransform.x) / canvasTransform.scale - node.position.x;
                    const offsetY = (startScreenY - canvasTransform.y) / canvasTransform.scale - node.position.y;
                    const timelineConfig = getLaunchTimelineByOffset(offsetX, offsetY, canvasTransform.scale || 1);

                    // 2. 单一 fromTo 动画 —— 避免双重动画覆盖
                    const timeline = gsap.timeline({
                        defaults: { force3D: true, overwrite: 'auto' },
                        onStart: () => {
                            document.body.classList.add('is-animating-card');
                            el.style.zIndex = String((stackZIndexOverride ?? getPromptStackZIndex(node, isSelected, groupLayerZIndex)) + 1);
                        },
                        onComplete: () => {
                            document.body.classList.remove('is-animating-card');
                            el.style.willChange = '';
                            el.style.zIndex = '';
                        },
                        onInterrupt: () => {
                            document.body.classList.remove('is-animating-card');
                            el.style.willChange = '';
                            el.style.zIndex = '';
                        },
                    });

                    timeline
                        .set(el, {
                            x: timelineConfig.startX,
                            y: timelineConfig.startY,
                            scale: timelineConfig.startScale,
                            opacity: 0,
                            transformOrigin: '50% 100%',
                        })
                        .to(el, {
                            opacity: 1,
                            duration: timelineConfig.fadeInDuration,
                            ease: 'sine.out',
                        })
                        .to(el, {
                            x: timelineConfig.midX,
                            y: timelineConfig.midY,
                            scale: timelineConfig.midScale,
                            duration: timelineConfig.travelDuration,
                            ease: 'power2.out',
                        }, '<')
                        .to(el, {
                            x: timelineConfig.nearX,
                            y: timelineConfig.nearY,
                            scale: timelineConfig.nearScale,
                            duration: timelineConfig.nearDuration,
                            ease: 'sine.out',
                        })
                        .to(el, {
                            x: 0,
                            y: 0,
                            scale: 1,
                            opacity: 1,
                            duration: timelineConfig.settleDuration + 0.06,
                            ease: 'expo.out',
                            clearProps: 'transform,opacity,will-change',
                        });
                } catch (error) {
                    console.warn('[PromptNodeComponent] Entry animation failed, restored visibility.', error);
                    document.body.classList.remove('is-animating-card');
                    restoreVisibility();
                }
            }).catch((error) => {
                console.warn('[PromptNodeComponent] Failed to load GSAP, restored visibility.', error);
                document.body.classList.remove('is-animating-card');
                restoreVisibility();
            });
        }
    }, [node.id, node.timestamp, node.isDraft, canvasTransform, isChatMode, isSelected, node.zIndex, groupLayerZIndex, stackZIndexOverride]);

    // 🚀 [New] Entry Animation Cleanup: remove 'isNew' status after animation ends
    useEffect(() => {
        if (node.isNew) {
            const timer = setTimeout(() => {
                if (onUpdateNode) {
                    onUpdateNode({ ...node, isNew: false });
                }
            }, 1000); // 增加清理时间窗口
            return () => clearTimeout(timer);
        }
    }, [node.id, node.isNew, onUpdateNode]);


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
        if (isChatMode) return; // Disable drag/select logic in chat mode
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

        // Store initial mouse position
        dragStartPos.current = { x: clientX, y: clientY };
        lastMousePos.current = { x: clientX, y: clientY };

        setIsDragging(true);
        hasMoved.current = false;

        // 🚀 [添加] 触发自定义事件通知 ImagePreview 关闭
        window.dispatchEvent(new CustomEvent('kk-drag-start'));
    };

    // 🚀 Simple drag - just update React state on every move
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

        const scale = zoomScale || 1;

        // 增量计算
        const dx = (clientX - lastMousePos.current.x) / scale;
        const dy = (clientY - lastMousePos.current.y) / scale;

        lastMousePos.current = { x: clientX, y: clientY };

        // 只更新 React 状态，连接线会跟随
        if (onDragDelta && (dx !== 0 || dy !== 0)) {
            onDragDelta({ x: dx, y: dy }, node.id);
        }
    };

    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            lastMousePos.current = { x: 0, y: 0 };
        }
    };

    useEffect(() => {
        if (isDragging) {
            // 🚀 使用 passive: true 提升性能，因为我们在 handleMouseMove 中调用 preventDefault
            window.addEventListener('mousemove', handleMouseMove, { passive: false });
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

    const effectiveChildImageCount = Math.max(actualChildImageCount, node.childImageIds?.length || 0);
    const renderedSuccessCount = effectiveChildImageCount > 0
        ? effectiveChildImageCount
        : (node.lastGenerationSuccessCount || 0);
    const renderedFailCount = Math.max(0, Number(node.lastGenerationFailCount || 0));
    const showError = Boolean(node.error) && renderedSuccessCount === 0;
    const stackZIndex = stackZIndexOverride ?? getPromptStackZIndex(node, isSelected, groupLayerZIndex);
    const renderLeft = snapCanvasCoordinate(node.position.x - cardWidth / 2, zoomScale || 1);
    const renderTop = snapCanvasCoordinate(node.position.y - cardHeight, zoomScale || 1);

    return (
        <div
            ref={containerRef}
            className={`${isChatMode ? 'relative w-full max-w-[460px] mx-auto my-3' : 'absolute'} flex flex-col items-center group antialiased select-none ${node.isNew && !canvasTransform && !isChatMode ? 'is-new' : ''}`}
            style={isChatMode ? {
                zIndex: stackZIndex,
                opacity: 1,
            } : {
                left: renderLeft,
                top: renderTop,
                zIndex: stackZIndex,
                opacity: 1,
                cursor: isDragging ? 'grabbing' : 'grab',
                willChange: isDragging ? 'transform, left, top' : 'auto', // 🚀 [性能优化] 拖拽时启用GPU加速
                transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
                pointerEvents: 'auto',
                touchAction: 'none'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
        >
            {/* Main Content Card */}
            <div
                ref={cardRef}
                data-canvas-surface="prompt"
                className="relative flex flex-col rounded-2xl border transition-all"
                style={{
                    width: isChatMode ? '100%' : cardWidth,
                    maxWidth: isMobile && !isChatMode ? 'calc(100vw - 24px)' : undefined,
                    backgroundColor: 'var(--bg-overlay)',
                    borderColor: showError
                        ? 'rgba(239, 68, 68, 0.5)'
                        : isSelected ? 'rgba(59, 130, 246, 0.6)' : 'var(--border-light)',
                    boxShadow: showError
                        ? '0 0 15px rgba(239, 68, 68, 0.15), 0 0 0 1px rgba(239, 68, 68, 0.5)'
                        : isSelected
                            ? '0 0 20px rgba(59, 130, 246, 0.4), 0 0 40px rgba(59, 130, 246, 0.15), 0 0 0 1px rgba(59, 130, 246, 0.5)'
                            : '0 4px 20px -2px rgba(0,0,0,0.15), 0 0 0 1px var(--border-light)',
                }}
            >
                {/* 🚀 [NEW] Connection Point - Bottom Center */}
                {onConnectStart && !isChatMode && (
                    <div
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-transparent hover:bg-indigo-500/50 rounded-full z-50 cursor-crosshair transition-colors"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            // Calculate start position in canvas coordinates
                            const rect = cardRef.current?.getBoundingClientRect();
                            if (rect) {
                                const startPos = {
                                    x: node.position.x,
                                    y: node.position.y
                                };
                                onConnectStart(node.id, startPos);
                            }
                        }}
                        title="拖拽连线"
                    />
                )}
                {/* Header (Status & Actions) */}
                <div className="flex items-center justify-between px-4 py-3 w-full" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Left: Status Icon and Text */}
                    <div className="flex flex-1 items-center gap-2 min-w-0">
                        {showError ? (
                            <>
                                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-red-500/15">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="12" y1="8" x2="12" y2="12"></line>
                                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                    </svg>
                                </div>
                                <span className="text-[13px] font-medium tracking-wide truncate text-red-500" title={node.error}>
                                    生成失败{(() => {
                                        // 🚀 [Fix] 只有 SystemProxy 或者明确带有 @system 后缀才是积分模型
                                        const lowerModelId = node.model?.toLowerCase() || '';
                                        const isCreditModel = node.provider === 'SystemProxy' || lowerModelId.includes('@system') || lowerModelId.includes('@systemproxy');
                                        if (!isCreditModel) return '';
                                        if (node.refundStatus === 'success') return '，积分已退回';
                                        if (node.refundStatus === 'failed') return '，积分退回失败';
                                        if (node.isPaymentProcessed) return '，积分已退回';
                                        return '';
                                    })()}
                                </span>
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
                                    {renderedSuccessCount > 0 ? (
                                        <span className="text-[var(--text-secondary)]">
                                            {renderedFailCount > 0
                                                ? `成功 ${renderedSuccessCount} 张，失败 ${renderedFailCount} 张`
                                                : `已生成 ${renderedSuccessCount} 张`}
                                        </span>
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
                        {/* 提示词编译器 Tab 切换 */}
                        {(node.promptOptimizerResult || node.optimizedPromptEn) && (
                            <div className="flex bg-[var(--bg-tertiary)] rounded-lg p-0.5 border border-[var(--border-light)] ml-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveTab('raw'); }}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${activeTab === 'raw'
                                        ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                        }`}
                                >
                                    原文
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveTab('opt'); }}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${activeTab === 'opt'
                                        ? 'bg-blue-500/15 text-blue-400 shadow-sm'
                                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                        }`}
                                >
                                    <Sparkles size={8} />
                                    优化
                                </button>
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

                    {/* Prompt Text Area - 文本可选，但选择范围被约束在本卡片内 */}
                    <div
                        className="relative text-[var(--text-primary)] text-[15px] leading-7 font-normal flex-1 tracking-wide overflow-y-auto max-h-[160px] custom-scrollbar pr-1 min-h-[40px] select-text cursor-text group/content"
                        onWheel={(e) => e.stopPropagation()}
                        onMouseDown={(e) => {
                            e.stopPropagation();
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
                            const sel = document.getSelection();
                            if (sel && sel.toString().length > 0) return;
                            if (onClickPrompt) onClickPrompt(node, activeTab === 'opt');
                        }}
                    >
                        {activeTab === 'opt' && (node.optimizedPromptEn || node.promptOptimizerResult) ? (
                            <div className="flex flex-col gap-3 py-1 relative">
                                {/* Task Type Badge (if available) */}
                                {node.promptOptimizerResult?.params?.task_type && (
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-bold uppercase tracking-wider border border-blue-500/20">
                                            {node.promptOptimizerResult.params.task_type.replace('_', ' ')}
                                        </div>
                                        {node.promptOptimizerResult?.params?.aspect_ratio && (
                                            <div className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] text-[9px] font-bold border border-[var(--border-light)]">
                                                {node.promptOptimizerResult.params.aspect_ratio}
                                            </div>
                                        )}
                                        {node.promptOptimizerResult?.meta?.template_title && (
                                            <div className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[9px] font-bold border border-emerald-500/20">
                                                {node.promptOptimizerResult.meta.template_title}
                                            </div>
                                        )}
                                        {node.promptOptimizerResult?.confidence && (
                                            <div className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] text-[9px] font-bold border border-[var(--border-light)]">
                                                {node.promptOptimizerResult.confidence}
                                            </div>
                                        )}
                                        {node.promptOptimizerResult?.meta?.strategy && (
                                            <div className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 text-[9px] font-bold border border-violet-500/20">
                                                {node.promptOptimizerResult.meta.strategy}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* English - Professional Structure */}
                                <div className="relative group/en">
                                    <div className="text-[14px] leading-relaxed text-[var(--text-primary)] font-medium tracking-tight font-serif-ui whitespace-pre-wrap selection:bg-blue-500/30 pr-8">
                                        {node.optimizedPromptEn || node.promptOptimizerResult?.optimized_prompt_en}
                                    </div>
                                    <button
                                        className="absolute top-0 right-0 p-1.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[var(--text-tertiary)] hover:text-blue-400 hover:border-blue-500/50 opacity-0 group-hover/content:opacity-100 transition-all shadow-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const text = node.optimizedPromptEn || node.promptOptimizerResult?.optimized_prompt_en || '';
                                            void writeTextToClipboard(text)
                                                .then(() => {
                                                    setCopyStatus('en');
                                                    setTimeout(() => setCopyStatus('idle'), 2000);
                                                })
                                                .catch((error) => {
                                                    console.error('[PromptNodeComponent] Copy English prompt failed:', error);
                                                    notify.warning('复制失败', '当前环境无法复制英文提示词。');
                                                });
                                        }}
                                        title="复制英文提示词"
                                    >
                                        {copyStatus === 'en' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                    </button>
                                </div>

                                {/* Divider with Icon */}
                                <div className="flex items-center gap-2 opacity-20 my-1">
                                    <div className="h-px flex-1 bg-current"></div>
                                    <Languages size={10} />
                                    <div className="h-px flex-1 bg-current"></div>
                                </div>

                                {/* Chinese - User Friendly Explanation */}
                                <div className="relative group/zh">
                                    <div className="text-[12px] leading-6 text-[var(--text-secondary)] font-normal italic opacity-90 whitespace-pre-wrap selection:bg-amber-500/20 pr-8">
                                        {node.optimizedPromptZh || node.promptOptimizerResult?.optimized_prompt_zh_display || 'AI 正在解析您的创意...'}
                                    </div>
                                    <button
                                        className="absolute top-0 right-0 p-1.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border-light)] text-[var(--text-tertiary)] hover:text-amber-400 hover:border-amber-500/50 opacity-0 group-hover/content:opacity-100 transition-all shadow-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const text = node.optimizedPromptZh || node.promptOptimizerResult?.optimized_prompt_zh_display || '';
                                            void writeTextToClipboard(text)
                                                .then(() => {
                                                    setCopyStatus('zh');
                                                    setTimeout(() => setCopyStatus('idle'), 2000);
                                                })
                                                .catch((error) => {
                                                    console.error('[PromptNodeComponent] Copy Chinese prompt failed:', error);
                                                    notify.warning('复制失败', '当前环境无法复制中文提示词。');
                                                });
                                        }}
                                        title="复制中文注释"
                                    >
                                        {copyStatus === 'zh' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                                    </button>
                                </div>

                                {/* Assumptions / Tips */}
                                {(node.promptOptimizerResult?.assumptions || []).length > 0 && (
                                    <div className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                                        <Info size={12} className="text-blue-400 mt-0.5 shrink-0" />
                                        <div className="space-y-1 text-[10px] text-blue-300/80 leading-normal">
                                            {(node.promptOptimizerResult?.assumptions || []).map((assumption, index) => (
                                                <div key={`assumption-${index}`}>{assumption}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(node.promptOptimizerResult?.negative_constraints || []).length > 0 && (
                                    <div className="mt-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-300/90 mb-2">
                                            <Shield size={12} />
                                            <span>避免项</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(node.promptOptimizerResult?.negative_constraints || []).map((constraint, index) => (
                                                <span
                                                    key={`constraint-${index}`}
                                                    className="px-2 py-1 rounded-full text-[10px] border border-amber-500/20 bg-amber-500/10 text-amber-200/90"
                                                >
                                                    {constraint}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(node.promptOptimizerResult?.validation_checks || []).length > 0 && (
                                    <div className="mt-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300/90 mb-2">
                                            <CheckCircle2 size={12} />
                                            <span>校验清单</span>
                                        </div>
                                        <div className="space-y-1 text-[10px] text-emerald-100/80 leading-normal">
                                            {(node.promptOptimizerResult?.validation_checks || []).map((checkItem, index) => (
                                                <div key={`validation-${index}`}>{checkItem}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(node.promptOptimizerResult?.missing_inputs || []).length > 0 && (
                                    <div className="mt-2 p-2 rounded-lg bg-red-500/5 border border-red-500/15">
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-300/90 mb-2">
                                            <AlertTriangle size={12} />
                                            <span>仍可补充</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(node.promptOptimizerResult?.missing_inputs || []).map((item, index) => (
                                                <span
                                                    key={`missing-${index}`}
                                                    className="px-2 py-1 rounded-full text-[10px] border border-red-500/20 bg-red-500/10 text-red-200/90"
                                                >
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[15px] leading-7 text-[var(--text-primary)] font-normal selection:bg-blue-500/20 pr-2">
                                {node.originalPrompt || node.prompt || (node.isDraft ? <span className="text-[var(--text-tertiary)] italic">输入提示词...</span> : '')}
                            </div>
                        )}

                        {onEditPptDeck && node.mode === GenerationMode.PPT && (node.childImageIds?.length || 0) > 0 && !node.isGenerating && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEditPptDeck(node);
                                }}
                                className="px-2 py-1 rounded-md border text-[11px] leading-none bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
                                title="Edit layered PPT content"
                            >
                                Edit Deck
                            </button>
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
                                title="导出PPTX文档"
                            >
                                导出PPTX
                            </button>
                        )}
                    </div>

                    {/* 错误详情面板已被移除 */}


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
                    {/* 🚀 Generating Overlay - Simple & Focused */}
                    {node.isGenerating && !showError && (() => {
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
                            // Note: Better auto-detection would require reading actual image dimensions
                            // from the reference image metadata. Currently defaults to SQUARE as the safest
                            // generic shape to avoid layout jumping when actual generation result has different ratio.
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

                        if (isChatMode) {
                            return (
                                <div className="mobile-generating-stack">
                                    {Array.from({ length: count }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="mobile-generating-stack__card"
                                            style={{
                                                minHeight: h,
                                                zIndex: count - i,
                                                marginTop: i === 0 ? 0 : -Math.min(h * 0.72, 108),
                                                transform: `translateX(${Math.min(i * 6, 18)}px) scale(${Math.max(0.92, 1 - i * 0.025)})`
                                            }}
                                        >
                                            <div className="mobile-generating-stack__card-sheen" />
                                            <div className="mobile-generating-stack__card-grid" />

                                            <div className="absolute inset-x-0 top-4 flex items-center justify-between gap-3 px-4">
                                                <span className="mobile-generating-stack__badge">生成中 {i + 1}/{count}</span>
                                                <span className="mobile-generating-stack__hint">
                                                    {node.aspectRatio || '1:1'} · {node.mode === GenerationMode.PPT ? 'PPT' : node.imageSize || '1K'}
                                                </span>
                                            </div>

                                            <div className="absolute inset-x-0 bottom-4 flex items-center justify-between gap-3 px-4">
                                                <span className="mobile-generating-stack__status">
                                                    {i === 0 ? '正在为这组卡片生成结果' : '等待上一张完成后继续'}
                                                </span>
                                                {i === 0 ? (
                                                    <GenerationTimer
                                                        start={timerStartRef.current}
                                                        onTimeout={() => onCancel && onCancel(node.id)}
                                                    />
                                                ) : (
                                                    <span className="mobile-generating-stack__hint">AI Queue</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        }

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
                                                    zIndex: stackZIndex + 100, // 🚀 [Fix] 使用更高的 z-index 确保置顶
                                                    background: 'var(--bg-surface)',
                                                    border: '1px solid var(--border-light)',
                                                    cursor: isDragging ? 'grabbing' : 'grab' // 🚀 Allow grab cursor to bubble
                                                }}
                                            >
                                                {/* 生成中扫光层（严格限定在图片区域，不覆盖底栏 bottom-8） */}
                                                <div
                                                    className="absolute left-0 right-0 top-0 bottom-8 pointer-events-none z-[6] overflow-hidden"
                                                    style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}
                                                >
                                                    <div
                                                        className="absolute inset-0 opacity-80"
                                                        style={{
                                                            background: 'linear-gradient(135deg, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.01) 100%)'
                                                        }}
                                                    />
                                                    <div
                                                        className="absolute top-[-20%] bottom-[-20%] w-[150%] animate-prompt-shimmer-sweep"
                                                        style={{
                                                            background: 'linear-gradient(105deg, transparent 15%, rgba(255,255,255,0.1) 35%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.1) 65%, transparent 85%)',
                                                            filter: 'blur(4px)',
                                                            transformOrigin: 'center'
                                                        }}
                                                    />
                                                </div>

                                                <div className="absolute inset-0 bottom-8 flex flex-col items-center justify-center z-10">
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
                                                            const modelBadge = getModelBadgeInfo({
                                                                id: modelId,
                                                                label: modelText,
                                                                provider: providerText,
                                                                colorStart: node.modelColorStart,
                                                                colorEnd: node.modelColorEnd,
                                                                textColor: node.modelTextColor,
                                                            });

                                                            const isCreditModel = modelId.toLowerCase().includes('@system');

                                                            return (
                                                                <>
                                                                    <span className={`text-[7px] leading-none font-medium whitespace-nowrap max-w-[88px] truncate ${modelBadge.colorClass}`} title={modelText}>
                                                                        {truncateByChars(modelText, 15)}
                                                                    </span>
                                                                    {providerText && !isCreditModel && (
                                                                        <span
                                                                            className={`text-[7px] leading-none px-1 py-0.5 rounded whitespace-nowrap border ${getProviderBadgeColor(providerText)}`}
                                                                            title={providerText}
                                                                            style={getProviderBadgeStyle(providerText)}
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

            {/* [NEW] 局部专属占位扫光动画 */}
            <style>{`
                @keyframes prompt-shimmer-sweep {
                    0% { transform: translateX(-150%) skewX(-15deg); }
                    100% { transform: translateX(200%) skewX(-15deg); }
                }
                .animate-prompt-shimmer-sweep {
                    animation: prompt-shimmer-sweep 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
            `}</style>

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
        prev.actualChildImageCount === next.actualChildImageCount &&
        prev.isSelected === next.isSelected &&
        prev.highlighted === next.highlighted &&
        prev.zoomScale === next.zoomScale &&
        prev.isMobile === next.isMobile &&
        prev.sourcePosition?.x === next.sourcePosition?.x &&
        prev.sourcePosition?.y === next.sourcePosition?.y
    );
});

export default PromptNodeComponent;
