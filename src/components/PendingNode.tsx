import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { AspectRatio } from '../types';
import { getCardDimensions } from '../utils/styleUtils';

interface ReferenceImage {
    id?: string;
    data: string;
    mimeType: string;
}

interface PendingNodeProps {
    prompt: string;
    parallelCount: number;
    isGenerating: boolean;
    position: { x: number; y: number };
    aspectRatio: AspectRatio;
    onPositionChange?: (pos: { x: number; y: number }) => void;
    isMobile?: boolean;
    canvasTransform?: { x: number; y: number; scale: number };
    referenceImages?: ReferenceImage[];
    sourcePosition?: { x: number; y: number };
    onDisconnect?: () => void;
}

const PendingNode: React.FC<PendingNodeProps> = ({
    prompt,
    parallelCount,
    isGenerating,
    position,
    aspectRatio,
    onPositionChange,
    isMobile = false,
    canvasTransform = { x: 0, y: 0, scale: 1 },
    referenceImages = [],
    sourcePosition,
    onDisconnect
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const dragStartPos = useRef({ x: 0, y: 0 });

    // 生成计时器
    const [elapsedTime, setElapsedTime] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // 预览卡30秒超时销毁
    const [idleTime, setIdleTime] = useState(0);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

    // 计时器逻辑 (生成中计时)
    useEffect(() => {
        if (isGenerating) {
            setElapsedTime(0);
            timerRef.current = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isGenerating]);

    // 30秒无操作自动销毁预览卡
    useEffect(() => {
        if (!isGenerating && prompt) {
            setIdleTime(0);
            idleTimerRef.current = setInterval(() => {
                setIdleTime(prev => {
                    if (prev >= 29) {
                        onDisconnect?.();
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000);
        } else {
            if (idleTimerRef.current) {
                clearInterval(idleTimerRef.current);
                idleTimerRef.current = null;
            }
            setIdleTime(0);
        }
        return () => {
            if (idleTimerRef.current) {
                clearInterval(idleTimerRef.current);
            }
        };
    }, [isGenerating, prompt, onDisconnect]);

    const { width: w, totalHeight: h } = getCardDimensions(aspectRatio, true);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        dragStartPos.current = { x: clientX, y: clientY };
        setDragOffset({ x: 0, y: 0 });
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            const dx = (clientX - dragStartPos.current.x) / canvasTransform.scale;
            const dy = (clientY - dragStartPos.current.y) / canvasTransform.scale;
            setDragOffset({ x: dx, y: dy });
        };

        const handleUp = () => {
            if (dragOffset.x !== 0 || dragOffset.y !== 0) {
                onPositionChange?.({
                    x: position.x + dragOffset.x,
                    y: position.y + dragOffset.y
                });
            }
            setIsDragging(false);
            setDragOffset({ x: 0, y: 0 });
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('touchend', handleUp);

        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleUp);
        };
    }, [isDragging, dragOffset, position, canvasTransform.scale, onPositionChange]);

    // 如果不在生成中,显示预览模式
    if (!isGenerating) {
        return (
            <div
                className="absolute z-40 flex flex-col items-center"
                style={{
                    left: position.x + dragOffset.x,
                    top: position.y + dragOffset.y,
                    transform: 'translate(-50%, -100%)',
                    cursor: isDragging ? 'grabbing' : 'grab'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
            >
                <div
                    className="rounded-xl p-3 border min-w-[280px] max-w-[320px]"
                    style={{
                        background: 'var(--bg-secondary)',
                        borderColor: 'var(--border-default)',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
                    }}
                >
                    <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-2">
                        <Loader2 size={12} className="animate-spin" />
                        <span className="text-[10px] font-medium">图像正在准备...</span>
                        {onDisconnect && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
                                className="ml-auto w-4 h-4 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center transition-colors"
                            >
                                <span className="text-red-400 text-[10px]">×</span>
                            </button>
                        )}
                    </div>
                    {referenceImages && referenceImages.length > 0 && (
                        <div className="flex gap-1 mb-1 flex-wrap">
                            {referenceImages.slice(0, 3).map((img, idx) => (
                                <img
                                    key={img.id || idx}
                                    src={`data:${img.mimeType};base64,${img.data}`}
                                    alt="Reference"
                                    className="w-8 h-8 object-cover rounded border border-[var(--border-light)]"
                                />
                            ))}
                            {referenceImages.length > 3 && (
                                <div className="w-8 h-8 rounded border border-[var(--border-light)] bg-[var(--bg-tertiary)] flex items-center justify-center text-[10px] text-[var(--text-tertiary)]">
                                    +{referenceImages.length - 3}
                                </div>
                            )}
                        </div>
                    )}
                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed line-clamp-3">{prompt}</p>
                </div>
            </div>
        );
    }

    // 生成中状态 - 显示主卡和副占位卡
    const cardWidth = w;
    const cardHeight = h;
    const gapToPlaceholders = 80; // 主卡到副卡的间距

    // 2x2 宫格布局参数
    const COLS = 2;
    const GAP = 16;

    return (
        <div
            className="absolute z-40 flex flex-col items-center"
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%)',
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
        >
            {/* 主Prompt卡 */}
            <div
                className="rounded-xl p-3 border min-w-[280px] max-w-[320px]"
                style={{
                    background: 'var(--bg-secondary)',
                    borderColor: 'var(--border-default)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
                }}
            >
                <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-2">
                    <div className="w-2 h-2 rounded-full bg-[var(--text-tertiary)] animate-pulse" />
                    <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-wider">Generating x{parallelCount}</span>
                </div>
                {referenceImages && referenceImages.length > 0 && (
                    <div className="flex gap-1 mb-1 flex-wrap">
                        {referenceImages.slice(0, 3).map((img, idx) => (
                            <img
                                key={img.id || idx}
                                src={`data:${img.mimeType};base64,${img.data}`}
                                alt="Reference"
                                className="w-8 h-8 object-cover rounded border border-[var(--border-light)]"
                            />
                        ))}
                        {referenceImages.length > 3 && (
                            <div className="w-8 h-8 rounded border border-[var(--border-light)] bg-[var(--bg-tertiary)] flex items-center justify-center text-[10px] text-[var(--text-tertiary)]">
                                +{referenceImages.length - 3}
                            </div>
                        )}
                    </div>
                )}
                <p className="text-[var(--text-secondary)] text-xs leading-relaxed line-clamp-3">{prompt}</p>
            </div>

            {/* 副占位卡 - 2x2 宫格布局 */}
            <div className="relative" style={{ height: 0 }}>
                {Array.from({ length: parallelCount }).map((_, i) => {
                    const col = i % COLS;
                    const row = Math.floor(i / COLS);

                    // 计算居中: 实际列数 = min(COLS, parallelCount)
                    const actualCols = Math.min(COLS, parallelCount);
                    const totalW = actualCols * cardWidth + (actualCols - 1) * GAP;

                    // 每个卡片的left偏移 (相对于中心点)
                    const offsetX = -totalW / 2 + col * (cardWidth + GAP) + cardWidth / 2;

                    // 每个卡片的top偏移
                    const offsetY = gapToPlaceholders + row * (cardHeight + GAP);

                    // 格式化计时
                    const mins = Math.floor(elapsedTime / 60);
                    const secs = elapsedTime % 60;
                    const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;

                    return (
                        <React.Fragment key={i}>
                            {/* 连接线 */}
                            <svg
                                className="pointer-events-none"
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: 0,
                                    overflow: 'visible',
                                    zIndex: 5
                                }}
                            >
                                <path
                                    d={`M0,0 L${offsetX},${offsetY}`}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.25)"
                                    strokeWidth="1.5"
                                    strokeDasharray="6 4"
                                />
                            </svg>

                            {/* 副占位卡 - 适配主题背景 + 扫光动画 */}
                            <div
                                style={{
                                    position: 'absolute',
                                    width: cardWidth,
                                    height: cardHeight,
                                    left: `calc(50% + ${offsetX}px)`,
                                    top: offsetY,
                                    transform: 'translateX(-50%)',
                                    borderRadius: '16px',
                                    overflow: 'hidden',
                                    boxShadow: 'var(--shadow-xl, 0 8px 32px rgba(0,0,0,0.3))',
                                    border: '1px solid var(--border-medium)',
                                    background: 'var(--bg-secondary)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    zIndex: 10
                                }}
                            >
                                {/* 45°倾斜扫光动画 + 磨砂效果 */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        background: 'linear-gradient(45deg, transparent 0%, transparent 35%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.12) 55%, transparent 65%, transparent 100%)',
                                        backgroundSize: '300% 300%',
                                        animation: 'shimmer-move 2.5s ease-in-out infinite',
                                        pointerEvents: 'none',
                                        backdropFilter: 'blur(1px)'
                                    }}
                                />

                                {/* 脉冲圆形光晕 */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        width: '120px',
                                        height: '120px',
                                        transform: 'translate(-50%, -50%)',
                                        borderRadius: '50%',
                                        background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
                                        animation: 'pulse-ring 2s ease-in-out infinite',
                                        pointerEvents: 'none'
                                    }}
                                />

                                {/* 内容 */}
                                <div style={{
                                    position: 'relative',
                                    zIndex: 10,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '12px',
                                }}>
                                    <div style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: '50%',
                                        background: 'var(--accent-primary-alpha, rgba(99,102,241,0.15))',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <Loader2 size={22} style={{ color: 'var(--accent-primary, #818cf8)' }} className="animate-spin" />
                                    </div>
                                    <span style={{
                                        fontSize: '20px',
                                        color: 'var(--text-primary)',
                                        fontWeight: 600,
                                        fontFamily: 'monospace'
                                    }}>
                                        {timeStr}
                                    </span>
                                    <span style={{
                                        fontSize: '10px',
                                        color: 'var(--text-tertiary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '1px'
                                    }}>
                                        生成中 #{i + 1}
                                    </span>
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>

            {/* 动画CSS */}
            <style>{`
                @keyframes shimmer-move {
                    0% { background-position: 200% 200%; }
                    100% { background-position: -100% -100%; }
                }
                @keyframes pulse-ring {
                    0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.8); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                }
            `}</style>
        </div>
    );
};

export default PendingNode;
