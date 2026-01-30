import React, { useState, useEffect, useRef } from 'react';
import { PromptNode, AspectRatio } from '../types';
import { Sparkles, Loader2 } from 'lucide-react';
import { getCardDimensions } from '../utils/styleUtils';
import { generateTagColor } from '../utils/colorUtils';

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
                e.dataTransfer.setData('application/x-kk-image-ref', JSON.stringify({
                    storageId: (image as any).storageId || image.id,
                    mimeType: image.mimeType || 'image/png',
                    source: 'reference-thumb'
                }));
                e.dataTransfer.effectAllowed = 'copy';
            }}
        >
            {src ? (
                <img
                    src={src}
                    alt="Ref"
                    className="w-full h-full object-cover pointer-events-none"
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
        <div className="flex flex-col items-center gap-0.5">
            <div className="text-[10px] text-indigo-500/60 dark:text-indigo-300/50 font-medium tracking-widest mb-0.5 transform scale-90">等待时间</div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
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
            className={`absolute z-20 flex flex-col items-center group animate-cardPopIn ${isSelected ? 'z-30' : ''}`}
            style={{
                left: 0,
                top: 0,
                // Initial transform from prop (or ref)
                transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0) translate(-50%, -100%)`,
                willChange: isDragging || isSelected ? 'transform' : 'auto', // GPU hint for drag OR selection
                cursor: isDragging ? 'grabbing' : 'grab',
                // Disable transition during drag to prevent fighting with JS updates
                transition: isDragging ? 'none' : 'transform 0.1s linear, box-shadow 0.2s ease',
                // backfaceVisibility: 'hidden' // Removed to fix text blurriness on zoom
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
                    relative border rounded-2xl p-3 shadow-xl max-w-[95vw] flex flex-col select-none
                    ${isDragging ? '' : 'transition-all duration-200'}
                    ${node.isGenerating
                        ? 'bg-[var(--bg-secondary)] border-indigo-500/30'
                        : node.isDraft
                            ? 'bg-white/90 dark:bg-zinc-900/90 border-indigo-500/50 shadow-[0_8px_32px_rgba(99,102,241,0.15)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150'
                            : isSelected
                                ? 'bg-[var(--bg-secondary)] border-indigo-500 ring-1 ring-indigo-500/50'
                                : 'bg-[var(--bg-secondary)] border-[var(--border-light)] hover:border-[var(--border-medium)]'
                    }
                    ${highlighted ? 'ring-2 ring-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.5)] z-50 scale-[1.02]' : ''}
                `}
                style={{ width: getCardDimensions(node.aspectRatio).width }}>
                {/* Header - Changes based on generating state */}
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[var(--border-light)]">
                    {node.isGenerating ? (
                        <>
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                                <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </div>
                            <span className="text-xs font-medium text-indigo-400 flex-1">Generating...</span>

                            {/* Stop Button */}
                            {onCancel && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCancel(node.id);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all group/stop"
                                    title="停止生成"
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
                            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex-1">预览 (Preview)</span>
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
                                {node.error?.includes('API key') ? 'API Key 无效' :
                                    node.error?.includes('Invalid URL') ? '参考图无效' :
                                        node.error?.includes('Ref img fetch failed') ? '参考图已失效(需重传)' :
                                            node.error?.includes('Failed to fetch') ? '网络请求失败' :
                                                node.error?.includes('40') ? '鉴权失败' :
                                                    '生成失败'}
                            </span>

                            {/* Retry Button */}
                            {onRetry && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRetry(node);
                                    }}
                                    className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500 hover:text-white transition-all"
                                    title="重新发送"
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
                        <>
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
                                <Sparkles size={12} className="text-white" />
                            </div>
                            <span className="text-xs font-medium text-[var(--text-secondary)] flex-1">Prompt</span>

                            {/* Delete Button */}
                            {onDelete && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('删除此提示词卡片？')) {
                                            onDelete(node.id);
                                        }
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                    title="删除"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
                            <ReferenceThumbnail
                                key={img.id || idx}
                                image={img}
                            />
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
                                <span key={tag}
                                    className={`px-1.5 py-0.5 rounded text-[10px] border ${colors.bg} ${colors.border} ${colors.text}`}>
                                    #{tag}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Spacer (formerly connection dot - removed per user request) */}
            <div className="h-3 mt-3" />

            {/* Loading Placeholders - Updated Design */}
            {
                node.isGenerating && node.parallelCount && (() => {
                    const count = node.parallelCount;
                    const columns = Math.min(count, 2);
                    const placeholderGap = 16;
                    const gapToPlaceholders = 80;

                    const { width: w, totalHeight: h } = getCardDimensions(node.aspectRatio, true);

                    return (
                        <div className="relative" style={{ height: 0 }}>
                            {Array.from({ length: count }).map((_, i) => {
                                const col = i % columns;
                                const row = Math.floor(i / columns);

                                const itemsInRow = Math.min(columns, count - row * columns);
                                const currentGridWidth = itemsInRow * w + (itemsInRow - 1) * placeholderGap;
                                const startX = -currentGridWidth / 2;
                                const offsetX = startX + col * (w + placeholderGap) + w / 2;
                                const offsetY = gapToPlaceholders + row * (h + placeholderGap);

                                return (
                                    <React.Fragment key={i}>
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
                                            <path
                                                d={`M0,0 C0,${offsetY * 0.5} ${offsetX},${offsetY * 0.5} ${offsetX},${offsetY}`}
                                                fill="none"
                                                stroke="#3f3f46"
                                                strokeWidth="1.5"
                                                strokeDasharray="4 4"
                                            />
                                        </svg>

                                        {/* Placeholder Card */}
                                        <div
                                            className="absolute border border-[var(--border-light)] rounded-xl overflow-hidden shadow-lg flex flex-col bg-white/60 dark:bg-zinc-900/60 backdrop-blur-2xl backdrop-saturate-150"
                                            style={{
                                                width: w,
                                                height: h,
                                                left: `calc(50% + ${offsetX}px)`,
                                                top: offsetY,
                                                transform: 'translateX(-50%)',
                                                zIndex: 20
                                            }}
                                        >
                                            {/* Main Area: Timer & Spinner */}
                                            <div className="flex-1 flex flex-col items-center justify-center relative">
                                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/5 animate-pulse" />

                                                <div className="relative z-10 flex flex-col items-center gap-2">
                                                    <div className="relative">
                                                        <div className="absolute inset-0 rounded-full blur-lg bg-indigo-500/20" />
                                                        {/* Removed large redundant spinner, integrated into GenerationTimer */}
                                                    </div>
                                                    <GenerationTimer start={node.timestamp || Date.now()} />
                                                </div>
                                            </div>

                                            {/* Footer Info - Clean & Dark */}
                                            <div className="h-8 bg-zinc-50/50 dark:bg-[#09090b] border-t border-[var(--border-light)] dark:border-white/5 flex items-center justify-center px-3 text-[10px] gap-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-amber-500/90 font-medium px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                                        {node.model?.replace(/gemini-?/i, '') || 'AI'}
                                                    </span>
                                                    <span className="text-zinc-500 font-medium border-l border-zinc-200 dark:border-white/10 pl-2">
                                                        {node.aspectRatio}
                                                    </span>
                                                    <span className="text-zinc-600 font-mono border-l border-zinc-200 dark:border-white/10 pl-2">
                                                        {(node.imageSize as string) === '1024x1024' || (node.imageSize as string) === '1K' ? '1K' :
                                                            (node.imageSize as string) === '2048x2048' || (node.imageSize as string) === '2K' ? '2K' :
                                                                (node.imageSize as string) === '4096x4096' || (node.imageSize as string) === '4K' ? '4K' :
                                                                    (node.imageSize as string)}
                                                    </span>
                                                    {node.mode === 'video' && (
                                                        <span className="text-purple-600 dark:text-purple-400 font-medium border-l border-zinc-200 dark:border-white/10 pl-2">
                                                            5s
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    );
                })()
            }

            {/* Visual Guide Line (optional, only when dragging maybe?) */}
        </div >
    );
});

export default PromptNodeComponent;
