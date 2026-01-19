import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface InfiniteCanvasHandle {
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    toggleGrid: () => void;
    setView: (x: number, y: number, scale: number) => void;
}

interface InfiniteCanvasProps {
    children: React.ReactNode;
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

const InfiniteCanvas = forwardRef<InfiniteCanvasHandle, InfiniteCanvasProps>(({ children, onTransformChange, onCanvasClick, onAutoArrange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const [showGrid, setShowGrid] = useState(true);
    const dragStart = useRef({ x: 0, y: 0 });
    const lastTransform = useRef({ x: 0, y: 0 });

    // Center the canvas on mount
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const initialTransform = {
            x: rect.width / 2,
            y: rect.height / 2,
            scale: 1
        };
        setTransform(initialTransform);
        onTransformChange?.(initialTransform);
    }, []);

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

        if (e.button === 1 || isEmptyCanvas) {
            e.preventDefault();
            setIsDragging(true);
            dragStart.current = { x: e.clientX, y: e.clientY };
            lastTransform.current = { x: transform.x, y: transform.y };

            // Notify parent when clicking empty canvas (for clearing input)
            if (isEmptyCanvas && e.button === 0) {
                onCanvasClick?.();
            }
        }
    }, [transform, onCanvasClick]);

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
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Zoom controls
    const zoomIn = useCallback(() => {
        const newScale = Math.min(3, transform.scale * 1.2);
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
        const newScale = Math.max(0.1, transform.scale / 1.2);
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

    const toggleGrid = useCallback(() => {
        setShowGrid(prev => !prev);
    }, []);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        zoomIn,
        zoomOut,
        resetView,
        toggleGrid,
        setView: (x: number, y: number, scale: number) => {
            const newTransform = { x, y, scale };
            setTransform(newTransform);
            onTransformChange?.(newTransform);
        }
    }));

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
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

    // Setup event listeners
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            container.removeEventListener('wheel', handleWheel);
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
                className="canvas-container"
                onMouseDown={handleMouseDown}
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
