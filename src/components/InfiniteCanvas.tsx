import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface InfiniteCanvasHandle {
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    setView: (x: number, y: number, scale: number) => void;
}

interface InfiniteCanvasProps {
    children: React.ReactNode;
    showGrid?: boolean;
    onTransformChange?: (transform: { x: number; y: number; scale: number }) => void;
    onCanvasClick?: () => void; // Called when clicking empty canvas area
    onAutoArrange?: () => void; // Called when arrange button is clicked
    cardPositions?: { x: number; y: number }[]; // For auto-arrange calculation
}

interface Transform {
    x: number;
    y: number;
    scale: number;
}

const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(({ children, showGrid = true, onTransformChange, onCanvasClick, onAutoArrange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const lastTransform = useRef({ x: 0, y: 0 });

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
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Zoom factor
        const zoomIntensity = 0.001;
        const delta = -e.deltaY * zoomIntensity;
        const newScale = Math.max(0.1, Math.min(3, transform.scale * (1 + delta)));

        // Zoom towards mouse position
        const scaleRatio = newScale / transform.scale;
        const newX = mouseX - (mouseX - transform.x) * scaleRatio;
        const newY = mouseY - (mouseY - transform.y) * scaleRatio;

        const newTransform = { x: newX, y: newY, scale: newScale };
        setTransform(newTransform);
        onTransformChange?.(newTransform);
    }, [transform, onTransformChange]);

    // Handle mouse down for panning
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const isEmptyCanvas = e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-grid');

        // Pan on Middle Button (1) OR Left Button (0) on empty background
        // IGNORE Right Button (2) to allow external handling (Selection)
        if (e.button === 1 || (isEmptyCanvas && e.button === 0)) {
            e.preventDefault();
            setIsDragging(true);
            dragStart.current = { x: e.clientX, y: e.clientY };
            lastTransform.current = { x: transform.x, y: transform.y };
        }
    }, [transform]);

    // Handle mouse move for panning
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;

        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;

        const newTransform = {
            x: lastTransform.current.x + dx,
            y: lastTransform.current.y + dy,
            scale: transform.scale
        };
        setTransform(newTransform);
        onTransformChange?.(newTransform);
    }, [isDragging, transform.scale, onTransformChange]);

    // Handle mouse up
    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (isDragging) {
            const dist = Math.hypot(e.clientX - dragStart.current.x, e.clientY - dragStart.current.y);
            if (dist < 5 && e.button === 0) {
                onCanvasClick?.();
            }
            setIsDragging(false);
        }
    }, [isDragging, onCanvasClick]);

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

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        zoomIn,
        zoomOut,
        resetView,
        setView: (x: number, y: number, scale: number) => {
            const newTransform = { x, y, scale };
            setTransform(newTransform);
            onTransformChange?.(newTransform);
        }
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
            resetView();
        }
        if (e.key === '+' || e.key === '=') {
            zoomIn();
        }
        if (e.key === '-' || e.key === '_') {
            zoomOut();
        }
    }, [resetView, zoomIn, zoomOut]);

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
                className="canvas-container outline-none focus:outline-none"
                tabIndex={-1}
                onMouseDown={handleMouseDown}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
                {/* Grid Background */}
                {showGrid && (
                    <div className="canvas-grid" />
                )}

                {/* Viewport with transform */}
                <div
                    className="canvas-viewport"
                    style={{
                        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    }}
                >
                    {children}
                </div>
            </div>

            {/* Scale Indicator */}
            <div className="absolute bottom-4 right-4 z-50">
                <div className="glass px-3 py-1.5 rounded-lg text-xs text-zinc-400 font-medium">
                    {Math.round(transform.scale * 100)}%
                </div>
            </div>
        </div>
    );
});

export default InfiniteCanvas;
