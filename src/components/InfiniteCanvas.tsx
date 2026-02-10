

import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import UpdateNotification from './UpdateNotification';

export interface InfiniteCanvasHandle {
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    fitToAll: () => void; // ✅ 缩放到全览所有卡片
    setView: (x: number, y: number, scale: number) => void;
    getCurrentTransform: () => { x: number; y: number; scale: number }; // 🚀 获取当前实时的 transform
}

interface InfiniteCanvasProps {
    children: React.ReactNode;
    showGrid?: boolean;
    onTransformChange?: (transform: { x: number; y: number; scale: number }) => void;
    onCanvasClick?: () => void; // Called when clicking empty canvas area
    onCanvasDoubleClick?: () => void; // [NEW] Called when double clicking empty canvas area
    onAutoArrange?: () => void; // Called when arrange button is clicked
    onResetView?: () => void; // Called when ESC is pressed (定位最新)
    cardPositions?: { x: number; y: number }[]; // For auto-arrange calculation
    onMouseDown?: (e: React.MouseEvent) => void;
    onMouseMove?: (e: React.MouseEvent) => void;
    onMouseUp?: (e: React.MouseEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onImageDrop?: (file: File, canvasPosition: { x: number; y: number }) => void; // [NEW] 拖入图片创建副卡
    id?: string;
}

interface Transform {
    x: number;
    y: number;
    scale: number;
}

const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(({ children, showGrid = true, onTransformChange, onCanvasClick, onCanvasDoubleClick, onAutoArrange, onResetView, cardPositions, onMouseDown, onMouseMove, onMouseUp, onContextMenu, onImageDrop, id }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const lastTransform = useRef({ x: 0, y: 0 });

    // 🚀 性能优化：拖动时的临时transform，不触发重绘
    const [tempTransform, setTempTransform] = useState<Transform | null>(null);
    const isDraggingRef = useRef(false);

    // 🚀 性能优化：缩放防抖
    const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [isImageDragOver, setIsImageDragOver] = useState(false); // 图片拖拽悬停状态
    const dragCounter = useRef(0); // 防止拖拽事件抖动

    // Center the canvas on mount OR restore from localStorage
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Try to load saved view
        try {
            const savedView = localStorage.getItem('kk_canvas_view');
            if (savedView) {
                const parsed = JSON.parse(savedView);
                if (parsed.x !== undefined && parsed.y !== undefined && parsed.scale !== undefined) {
                    setTransform(parsed);
                    onTransformChange?.(parsed);
                    return;
                }
            }
        } catch (e) {
            console.error("Failed to load canvas view", e);
        }

        // Fallback to center
        const rect = container.getBoundingClientRect();
        const initialTransform = {
            x: rect.width / 2,
            y: rect.height / 2,
            scale: 1
        };
        setTransform(initialTransform);
        onTransformChange?.(initialTransform);
    }, []);

    // Save view to localStorage on change (debounced)
    useEffect(() => {
        const timer = setTimeout(() => {
            localStorage.setItem('kk_canvas_view', JSON.stringify(transform));
        }, 500);
        return () => clearTimeout(timer);
    }, [transform]);

    // Handle mouse wheel zoom
    // 🚀 优化：缩放时使用临时transform + 防抖 + 缓动曲线
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 🚀 动态缓动：根据滚轮速度自适应intensity
        // 快速滚动时响应更大，慢速滚动时更精细
        const rawDelta = Math.abs(e.deltaY);
        const speedFactor = Math.min(1, rawDelta / 100); // 0-1，100+为快速滚动

        // 缓动曲线：easeOutQuad - 快速开始，缓慢结束
        const easedFactor = 1 - (1 - speedFactor) * (1 - speedFactor);

        // intensity范围：0.0005（慢）到 0.002（快）
        const minIntensity = 0.0005;
        const maxIntensity = 0.002;
        const zoomIntensity = minIntensity + easedFactor * (maxIntensity - minIntensity);

        const delta = -e.deltaY * zoomIntensity;
        const currentTransform = tempTransform || transform;
        const newScale = Math.max(0.1, Math.min(3, currentTransform.scale * (1 + delta)));

        // Zoom towards mouse position
        const scaleRatio = newScale / currentTransform.scale;
        const newX = mouseX - (mouseX - currentTransform.x) * scaleRatio;
        const newY = mouseY - (mouseY - currentTransform.y) * scaleRatio;

        const newTransform = { x: newX, y: newY, scale: newScale };

        // 🚀 立即更新临时transform，视觉上立即响应
        setTempTransform(newTransform);

        // 🚀 防抖：50ms后再提交最终transform
        if (zoomTimeoutRef.current) {
            clearTimeout(zoomTimeoutRef.current);
        }
        zoomTimeoutRef.current = setTimeout(() => {
            setTransform(newTransform);
            onTransformChange?.(newTransform);
            setTempTransform(null);
        }, 50);
    }, [transform, tempTransform, onTransformChange]);

    // 图片拖拽处理
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;

        if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            setIsImageDragOver(true);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;

        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsImageDragOver(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsImageDragOver(false);

        if (!onImageDrop) return;

        // 🚀 [FIX] Ignore Internal Drags (prevent orphan creation from internal move)
        // Check if the drag data includes our internal type
        if (e.dataTransfer.types.includes('application/x-kk-image-ref')) {
            return;
        }

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
            if (imageFile) {
                const container = containerRef.current;
                if (!container) return;

                const rect = container.getBoundingClientRect();
                const clientX = e.clientX - rect.left;
                const clientY = e.clientY - rect.top;

                const canvasX = (clientX - transform.x) / transform.scale;
                const canvasY = (clientY - transform.y) / transform.scale;

                onImageDrop(imageFile, { x: canvasX, y: canvasY });
            }
        }
    }, [onImageDrop, transform]);

    // Handle mouse down for panning
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const isEmptyCanvas = e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-grid');

        // Call parent handler first
        onMouseDown?.(e);

        // Pan on Middle Button (1) OR Left Button (0) on empty background
        // IGNORE Right Button (2) to allow external handling (Selection)
        if (e.button === 1 || (isEmptyCanvas && e.button === 0)) {
            e.preventDefault();
            setIsDragging(true);
            isDraggingRef.current = true; // 🚀 设置拖动标记
            dragStart.current = { x: e.clientX, y: e.clientY };
            lastTransform.current = { x: transform.x, y: transform.y };
        }
    }, [transform, onMouseDown]);

    // Handle mouse move for panning
    // 🚀 优化：拖动时只更新临时transform，不触发重绘
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current) return;

        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;

        const newTransform = {
            x: lastTransform.current.x + dx,
            y: lastTransform.current.y + dy,
            scale: transform.scale
        };

        // 只更新临时transform，不调用onTransformChange（避免重绘）
        setTempTransform(newTransform);
    }, [transform.scale]);

    // Handle mouse up
    // 🚀 优化：mouseUp时才提交最终transform，触发一次重绘
    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (isDraggingRef.current) {
            const dist = Math.hypot(e.clientX - dragStart.current.x, e.clientY - dragStart.current.y);

            // 提交最终transform（触发重绘）
            if (tempTransform) {
                setTransform(tempTransform);
                onTransformChange?.(tempTransform);
                setTempTransform(null);
            }

            // 检查是否是点击（移动距离<5px）
            if (dist < 5 && e.button === 0) {
                onCanvasClick?.();
            }

            isDraggingRef.current = false;
            setIsDragging(false);
        }
    }, [tempTransform, onTransformChange, onCanvasClick]);

    // Zoom controls
    const zoomIn = useCallback(() => {
        const newScale = Math.min(3, transform.scale * 1.1);
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const scaleRatio = newScale / transform.scale;
        const newX = centerX - (centerX - transform.x) * scaleRatio;
        const newY = centerY - (centerY - transform.y) * scaleRatio;

        const newTransform = { x: newX, y: newY, scale: newScale };
        setTransform(newTransform);
        onTransformChange?.(newTransform);
    }, [transform, onTransformChange]);

    const zoomOut = useCallback(() => {
        const newScale = Math.max(0.1, transform.scale / 1.1);
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const scaleRatio = newScale / transform.scale;
        const newX = centerX - (centerX - transform.x) * scaleRatio;
        const newY = centerY - (centerY - transform.y) * scaleRatio;

        const newTransform = { x: newX, y: newY, scale: newScale };
        setTransform(newTransform);
        onTransformChange?.(newTransform);
    }, [transform, onTransformChange]);

    const resetView = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const newTransform = {
            x: rect.width / 2,
            y: rect.height / 2,
            scale: 1
        };
        setTransform(newTransform);
        onTransformChange?.(newTransform);
    }, [onTransformChange]);

    // ✅ 缩放到全览所有卡片
    const fitToAll = useCallback(() => {
        const container = containerRef.current;
        if (!container || !cardPositions || cardPositions.length === 0) {
            resetView();
            return;
        }

        // 计算所有卡片的边界
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        cardPositions.forEach(pos => {
            minX = Math.min(minX, pos.x - 200); // 估算卡片宽度
            maxX = Math.max(maxX, pos.x + 200);
            minY = Math.min(minY, pos.y - 400); // 估算卡片高度
            maxY = Math.max(maxY, pos.y + 100);
        });

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const rect = container.getBoundingClientRect();
        const padding = 100; // 边距
        const availableWidth = rect.width - padding * 2;
        const availableHeight = rect.height - padding * 2;

        // 计算适合的缩放比例
        const scaleX = availableWidth / contentWidth;
        const scaleY = availableHeight / contentHeight;
        const newScale = Math.min(Math.max(0.1, Math.min(scaleX, scaleY, 1)), 1); // 最大100%

        // 计算新的x,y使内容居中
        const newX = rect.width / 2 - centerX * newScale;
        const newY = rect.height / 2 - centerY * newScale;

        const newTransform = { x: newX, y: newY, scale: newScale };
        setTransform(newTransform);
        onTransformChange?.(newTransform);
    }, [cardPositions, onTransformChange, resetView]);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        zoomIn,
        zoomOut,
        resetView,
        fitToAll,
        setView: (x: number, y: number, scale: number) => {
            const newTransform = { x, y, scale };
            setTransform(newTransform);
            onTransformChange?.(newTransform);
        },
        // 🚀 获取当前实时的 transform（包括拖动中的 tempTransform）
        getCurrentTransform: () => tempTransform || transform
    }));

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ignore if input/textarea is focused
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) {
            return;
        }

        // Prevent default space action (scrolling/button press)
        // Check for both 'Space' code and ' ' key to be robust
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
        }

        if (e.key === 'Escape' || e.key === 'Home') {
            // 如果有onResetView prop,使用它(定位最新),否则使用resetView(重置到中心)
            if (onResetView) {
                onResetView();
            } else {
                resetView();
            }
        }
        if (e.key === '+' || e.key === '=') {
            zoomIn();
        }
        if (e.key === '-' || e.key === '_') {
            zoomOut();
        }
    }, [resetView, zoomIn, zoomOut, onResetView]);

    // Touch Handling (Mirroring Mouse Logic)
    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            setIsDragging(true);
            dragStart.current = { x: touch.clientX, y: touch.clientY };
            lastTransform.current = { x: transform.x, y: transform.y };
        }
    }, [transform]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isDragging) return;
        if (e.touches.length === 1) {
            if (e.cancelable) e.preventDefault(); // Stop Browser Scroll
            const touch = e.touches[0];
            const dx = touch.clientX - dragStart.current.x;
            const dy = touch.clientY - dragStart.current.y;

            const newTransform = {
                x: lastTransform.current.x + dx,
                y: lastTransform.current.y + dy,
                scale: transform.scale
            };
            setTransform(newTransform);
            onTransformChange?.(newTransform);
        }
    }, [isDragging, transform.scale, onTransformChange]);

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Setup event listeners
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('wheel', handleWheel, { passive: false });
        // Touch Listeners (Passive: false to allow preventDefault)
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);

            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleWheel, handleMouseMove, handleMouseUp, handleKeyDown]);

    return (
        <div className="relative w-full h-full">
            {/* Canvas Container */}
            <div
                ref={containerRef}
                className={`canvas-container outline-none focus:outline-none gpu-accelerated ${isDragging ? 'is-dragging' : ''} ${isImageDragOver ? 'ring-4 ring-indigo-500' : ''}`}
                tabIndex={-1}
                onMouseDown={handleMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onContextMenu={(e) => {
                    if (onContextMenu) {
                        onContextMenu(e);
                    } else {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }}
                onDoubleClick={(e) => {
                    const isEmptyCanvas = e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-grid');
                    if (isEmptyCanvas) {
                        onCanvasDoubleClick?.();
                    }
                }}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
                {/* 拖拽悬停效果 - 只显示边框高亮，不显示提示文字 */}
                {/* Grid Background */}
                {showGrid && <div className="canvas-grid" />}

                {/* Viewport with transform - GPU accelerated */}
                <div
                    className="canvas-viewport"
                    style={{
                        // 🚀 [Fix] 使用 2D translate 代替 translate3d，并移除 backfaceVisibility
                        // 这能防止浏览器将画布强制视为位图纹理，从而在缩放后重新渲染高清晰度的文字和矢量图标
                        transform: `translate(${(tempTransform || transform).x}px, ${(tempTransform || transform).y}px) scale(${(tempTransform || transform).scale})`,
                        willChange: isDragging ? 'transform' : 'auto',
                        transformOrigin: '0 0', // Explicitly set origin
                    }}
                >
                    {children}
                </div>
            </div>

            {/* Zoom Slider & Version - Bottom Left */}
            <div className="absolute bottom-4 left-4 z-50 hidden md:flex items-center gap-3">
                {/* Zoom Slider */}
                <div className="glass h-10 px-4 rounded-xl flex items-center gap-3">
                    <input
                        type="range"
                        min="10"
                        max="300"
                        value={Math.round(transform.scale * 100)}
                        onChange={(e) => {
                            const newScale = parseInt(e.target.value) / 100;
                            const container = containerRef.current;
                            if (!container) return;

                            const rect = container.getBoundingClientRect();
                            const centerX = rect.width / 2;
                            const centerY = rect.height / 2;

                            const scaleRatio = newScale / transform.scale;
                            const newX = centerX - (centerX - transform.x) * scaleRatio;
                            const newY = centerY - (centerY - transform.y) * scaleRatio;

                            const newTransform = { x: newX, y: newY, scale: newScale };
                            setTransform(newTransform);
                            onTransformChange?.(newTransform);
                        }}
                        className="w-32 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer
                            [&::-webkit-slider-thumb]:appearance-none
                            [&::-webkit-slider-thumb]:w-3
                            [&::-webkit-slider-thumb]:h-3
                            [&::-webkit-slider-thumb]:rounded-full
                            [&::-webkit-slider-thumb]:bg-zinc-400
                            [&::-webkit-slider-thumb]:hover:bg-white
                            [&::-webkit-slider-thumb]:transition-colors
                            [&::-moz-range-thumb]:w-3
                            [&::-moz-range-thumb]:h-3
                            [&::-moz-range-thumb]:rounded-full
                            [&::-moz-range-thumb]:bg-zinc-400
                            [&::-moz-range-thumb]:hover:bg-white
                            [&::-moz-range-thumb]:border-0
                            [&::-moz-range-thumb]:transition-colors"
                    />
                    <span className="text-xs text-zinc-400 font-semibold min-w-[3ch] text-right">
                        {Math.round(transform.scale * 100)}%
                    </span>
                </div>

                {/* Version Badge */}
                <div className="glass h-10 px-3 rounded-xl flex items-center">
                    <span className="text-xs text-zinc-500 font-semibold">v1.3.0</span>
                </div>

                {/* Update Notification */}
                <UpdateNotification />
            </div>
        </div>
    );
});

export default InfiniteCanvas;
