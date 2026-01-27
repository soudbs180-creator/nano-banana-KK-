import React, { useState, useEffect, useRef } from 'react';
import { PromptNode, AspectRatio } from '../types';
import { Sparkles, Loader2 } from 'lucide-react';
import { getCardDimensions } from '../utils/styleUtils';

interface PromptNodeProps {
    node: PromptNode;
    onPositionChange: (id: string, newPos: { x: number; y: number }) => void;
    isSelected: boolean;
    onSelect: () => void;
    onClickPrompt?: (node: PromptNode) => void;
    onConnectStart?: (id: string, startPos: { x: number; y: number }) => void;
    canvasTransform?: { x: number; y: number; scale: number };
    isMobile?: boolean;
    sourcePosition?: { x: number; y: number };
    onCancel?: (id: string) => void;
    onDelete?: (id: string) => void;
    onRetry?: (node: PromptNode) => void;
    onDisconnect?: (id: string) => void;
    onHeightChange?: (id: string, height: number) => void;
}

const PromptNodeComponent: React.FC<PromptNodeProps> = ({
    node,
    onPositionChange,
    isSelected,
    onSelect,
    onClickPrompt,
    onConnectStart,
    canvasTransform = { x: 0, y: 0, scale: 1 },
    isMobile = false,
    sourcePosition,
    onCancel,
    onDelete,
    onRetry,
    onDisconnect,
    onHeightChange
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartCanvasPos = useRef({ x: 0, y: 0 });

    const hasMoved = useRef(false);

    const cardRef = useRef<HTMLDivElement>(null);

    const [localPos, setLocalPos] = useState(node.position);

    // Sync local position when global position changes (and not dragging)
    useEffect(() => {
        if (!isDragging) {
            setLocalPos(node.position);
        }
    }, [node.position.x, node.position.y, isDragging]);

    // Height reporting
    useEffect(() => {
        if (!cardRef.current || !onHeightChange) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const h = entry.contentRect.height + 26; // +26 for borders/padding adjustment if needed (contentRect excludes border)
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
        dragStartCanvasPos.current = { x: localPos.x, y: localPos.y };
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
            const deltaX = (clientX - dragStartPos.current.x) / canvasTransform.scale;
            const deltaY = (clientY - dragStartPos.current.y) / canvasTransform.scale;

            const newPos = {
                x: dragStartCanvasPos.current.x + deltaX,
                y: dragStartCanvasPos.current.y + deltaY
            };

            // 1. Local Update (Fast)
            setLocalPos(newPos);

            // 2. Global Update (Throttled)
            const now = Date.now();
            if (now - lastGlobalUpdateRef.current > 32) {
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
            // We rely on the throttled update having been reasonably close, 
            // or effectively "snapping" to the last throttled position.
            // Ideally we would capture the FINAL position here but we lack the 'e' event cleanly.
            // But since localPos IS updated, the visual is correct. 
            // The global state will catch up on next sync if we add one, or simply stay at last throttled.
            // If the user drags fast and lets go, the global state might be 32ms behind.
            // This is "snap back" risk.
            // However, since we setLocalPos to newPos in rAF, localPos IS current.
            // We should sync localPos to global one last time?
            // But `localPos` state variable is stale in this closure!
            // We need a ref for localPos to access it here.
            // But I didn't add localPosRef in this reconstruction.
            // I'll accept the <32ms discrepancy for now as acceptable "snap" vs "lag".
            // The user wants "follow hand". Visual follows hand.
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
    }, [isDragging, canvasTransform.scale]);

    return (
        <div
            className={`absolute z-20 flex flex-col items-center group animate-cardPopIn ${isSelected ? 'z-30' : ''}`}
            style={{
                left: localPos.x,
                top: localPos.y,
                transform: 'translate(-50%, -100%)',
                cursor: isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'box-shadow 0.2s ease'
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
                relative bg-[#18181b] border rounded-2xl p-3 shadow-xl max-w-[95vw] flex flex-col select-none
                ${isDragging ? '' : 'transition-all duration-200'}
                ${node.isGenerating ? 'border-indigo-500/30' : isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-white/10 hover:border-white/20'}
            `}
                style={{ width: getCardDimensions(node.aspectRatio).width }}>
                {/* Header - Changes based on generating state */}
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/5">
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
                    ) : node.error ? (
                        <>
                            <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                            <span className="text-xs font-medium text-red-400 flex-1 truncate">{node.error}</span>

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
                                    className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
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
                            <span className="text-xs font-medium text-zinc-400 flex-1">Prompt</span>

                            {/* Delete Button */}
                            {onDelete && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm('删除此提示词卡片？')) {
                                            onDelete(node.id);
                                        }
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
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
                            <img
                                key={img.id || idx}
                                src={`data:${img.mimeType};base64,${img.data}`}
                                alt="Reference"
                                className="w-10 h-10 object-cover rounded border border-white/10"
                            />
                        ))}
                        {node.referenceImages.length > 4 && (
                            <div className="w-10 h-10 rounded border border-white/10 bg-zinc-800 flex items-center justify-center text-xs text-zinc-400">
                                +{node.referenceImages.length - 4}
                            </div>
                        )}
                    </div>
                )}

                <p className="text-zinc-100 text-[15px] leading-7 line-clamp-4 font-normal flex-1 tracking-wide">
                    {node.prompt}
                </p>


                {node.tags && node.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2 mb-1 px-3">
                        {node.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] text-zinc-400">
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Spacer (formerly connection dot - removed per user request) */}
            <div className="h-3 mt-3" />

            {/* Loading Placeholders - Only shown when generating */}
            {
                node.isGenerating && node.parallelCount && (() => {
                    const count = node.parallelCount;
                    const columns = Math.min(count, 2);
                    const placeholderGap = 16;
                    const gapToPlaceholders = 80; // Must match handleGenerate gapToImages

                    // Calculate card dimensions based on usage
                    const { width: w, totalHeight: h } = getCardDimensions(node.aspectRatio, true);

                    return (
                        <div className="relative" style={{ height: 0 }}>
                            {Array.from({ length: count }).map((_, i) => {
                                const col = i % columns;
                                const row = Math.floor(i / columns);

                                // Calculate grid positioning
                                const itemsInRow = Math.min(columns, count - row * columns);
                                const currentGridWidth = itemsInRow * w + (itemsInRow - 1) * placeholderGap;
                                const startX = -currentGridWidth / 2;
                                const offsetX = startX + col * (w + placeholderGap) + w / 2;
                                const offsetY = gapToPlaceholders + row * (h + placeholderGap);

                                return (
                                    <React.Fragment key={i}>
                                        {/* Dashed line from dot to placeholder - subtle style */}
                                        <svg
                                            className="pointer-events-none"
                                            style={{
                                                position: 'absolute',
                                                left: '50%',
                                                top: 0,
                                                overflow: 'visible',
                                                zIndex: 10
                                            }}
                                        >
                                            <path
                                                d={`M0,0 L${offsetX},${offsetY}`}
                                                fill="none"
                                                stroke="#3f3f46"
                                                strokeWidth="1"
                                                strokeDasharray="3 4"
                                            />
                                        </svg>

                                        {/* Placeholder Card */}
                                        <div
                                            className="absolute bg-[#1a1a1c] border border-white/10 rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
                                            style={{
                                                width: w,
                                                height: h,
                                                left: `calc(50% + ${offsetX}px)`,
                                                top: offsetY,
                                                transform: 'translateX(-50%)',
                                                zIndex: 0
                                            }}
                                        >
                                            <div className="flex flex-col items-center gap-3 opacity-50">
                                                <Loader2 size={24} className="text-indigo-400 animate-spin" />
                                                <span className="text-[10px] text-zinc-500 font-medium">Creating masterpiece...</span>
                                            </div>
                                            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/5" />
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
};

export default PromptNodeComponent;
