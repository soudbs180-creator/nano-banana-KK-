import React, { useRef, useEffect, useState, useCallback } from 'react';
import { APP_DISPLAY_VERSION } from '../../config/appInfo';

interface InfiniteCanvasProps {
    children: React.ReactNode;
    onTransformChange?: (transform: { x: number; y: number; scale: number }) => void;
    onCanvasClick?: () => void; // Called when clicking empty canvas area
    cardPositions?: { x: number; y: number }[]; // All card positions for locate function
    onAutoArrange?: () => void; // Called to auto-arrange all cards
}

interface Transform {
    x: number;
    y: number;
    scale: number;
}

const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ children, onTransformChange, onCanvasClick, cardPositions = [], onAutoArrange }) => {
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

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key === 'Home') {
            locateAllCards();
        }
        if (e.key === '+' || e.key === '=') {
            zoomIn();
        }
        if (e.key === '-' || e.key === '_') {
            zoomOut();
        }
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

    // Locate all cards - center view on all cards
    const locateAllCards = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();

        // If no cards, just reset to center
        if (cardPositions.length === 0) {
            const newTransform = {
                x: rect.width / 2,
                y: rect.height / 2,
                scale: 1
            };
            setTransform(newTransform);
            onTransformChange?.(newTransform);
            return;
        }

        // Calculate bounding box of all cards
        const minX = Math.min(...cardPositions.map(p => p.x));
        const maxX = Math.max(...cardPositions.map(p => p.x));
        const minY = Math.min(...cardPositions.map(p => p.y));
        const maxY = Math.max(...cardPositions.map(p => p.y));

        // Center point of all cards
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Calculate scale to fit all cards with padding
        const cardsWidth = maxX - minX + 600; // Add padding for card width
        const cardsHeight = maxY - minY + 600; // Add padding for card height
        const scaleX = rect.width / cardsWidth;
        const scaleY = rect.height / cardsHeight;
        const fitScale = Math.min(scaleX, scaleY, 1); // Don't zoom in more than 100%

        // New transform: center viewport on cards center
        const newTransform = {
            x: rect.width / 2 - centerX * fitScale,
            y: rect.height / 2 - centerY * fitScale,
            scale: fitScale
        };
        setTransform(newTransform);
        onTransformChange?.(newTransform);
    }, [cardPositions, onTransformChange]);

    const toggleGrid = useCallback(() => {
        setShowGrid(prev => !prev);
    }, []);

    // Handle touch start for panning
    const handleTouchStart = useCallback((e: TouchEvent) => {
        // e.preventDefault(); // Don't prevent default here to allow clicking buttons, etc. 
        // Logic to detect if we are touching empty canvas
        const target = e.target as HTMLElement;
        const isEmptyCanvas = target === containerRef.current || target.classList.contains('canvas-grid');

        if (e.touches.length === 1 && isEmptyCanvas) {
            // e.preventDefault(); // Prevent scrolling if we are on empty canvas? 
            // Better to prevent default on move if dragging
            setIsDragging(true);
            dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            lastTransform.current = { x: transform.x, y: transform.y };

            // Notify click for empty canvas on simple tap? 
            // Complex to distinguish tap vs drag, for now ignore to keep simple.
        }
    }, [transform]);

    // Handle touch move for panning
    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isDragging || e.touches.length !== 1) return;

        // Critical: Prevent scrolling while dragging canvas
        if (e.cancelable) e.preventDefault();

        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;

        const newTransform = {
            x: lastTransform.current.x + dx,
            y: lastTransform.current.y + dy,
            scale: transform.scale
        };
        setTransform(newTransform);
        onTransformChange?.(newTransform);
    }, [isDragging, transform.scale, onTransformChange]);

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Setup event listeners
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Non-passive listeners for touch to allow preventing default
        container.addEventListener('wheel', handleWheel, { passive: false });
        // Use window for move/up to catch drags outside
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        window.addEventListener('touchend', handleTouchEnd);

        // 🚀 使用 passive 监听器提升性能
        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        window.addEventListener('mouseup', handleMouseUp, { passive: true });
        window.addEventListener('keydown', handleKeyDown, { passive: true });

        return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);

            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleWheel, handleMouseMove, handleMouseUp, handleKeyDown, handleTouchStart, handleTouchMove, handleTouchEnd]);

    return (
        <div className="relative w-full h-full">
            {/* Canvas Container */}
            <div
                ref={containerRef}
                className="canvas-container"
                onMouseDown={handleMouseDown}
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
                {/* Dot Pattern Background */}
                {showGrid && (
                    <div
                        className="canvas-grid"
                        style={{ pointerEvents: 'none' }}
                    />
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

            {/* Canvas Controls - Bottom Left (Desktop) / Top Left (Mobile) */}
            <div id="canvas-toolbar" className="absolute md:bottom-4 md:left-4 top-24 left-4 z-[1001]">
                <div className="toolbar !grid grid-cols-2 !gap-2 md:!flex md:!flex-col md:!gap-1">
                    {/* 1. Locate (Home) - Clean Target */}
                    <button className="toolbar-btn group" onClick={locateAllCards} title="定位 (Home)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-zinc-400 group-hover:text-gray-800 dark:group-hover:text-white transition-colors">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </button>
                    {/* 4. Dots - Clean Dot Pattern */}
                    <button
                        className={`toolbar-btn group ${showGrid ? 'active' : ''}`}
                        onClick={toggleGrid}
                        title="点阵 (Dots)"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" className={showGrid ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-zinc-400 group-hover:text-gray-800 dark:group-hover:text-white transition-colors"}>
                            <circle cx="6" cy="6" r="2" />
                            <circle cx="12" cy="6" r="2" />
                            <circle cx="18" cy="6" r="2" />
                            <circle cx="6" cy="12" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="18" cy="12" r="2" />
                            <circle cx="6" cy="18" r="2" />
                            <circle cx="12" cy="18" r="2" />
                            <circle cx="18" cy="18" r="2" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Zoom Slider & Version - Bottom Left */}
            <div className="absolute bottom-4 left-4 z-50 flex items-center gap-3">
                {/* Zoom Slider */}
                <div className="glass px-4 py-2.5 rounded-xl flex items-center gap-3">
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
                        className="zoom-slider w-24 h-1.5 bg-gray-300 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer
                                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-600 dark:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                                   [&::-webkit-slider-thumb]:hover:bg-cyan-500 dark:hover:bg-cyan-400 [&::-webkit-slider-thumb]:transition-colors
                                   [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full 
                                   [&::-moz-range-thumb]:bg-gray-600 dark:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer
                                   [&::-moz-range-thumb]:hover:bg-cyan-500 dark:hover:bg-cyan-400 [&::-moz-range-thumb]:transition-colors"
                        title={`缩放: ${Math.round(transform.scale * 100)}%`}
                    />
                    <span className="text-xs text-gray-500 dark:text-zinc-400 font-medium min-w-[42px] text-right">
                        {Math.round(transform.scale * 100)}%
                    </span>
                </div>

                {/* Version Badge */}
                <div className="glass px-3 py-2 rounded-xl">
                    <span className="text-xs text-gray-400 dark:text-zinc-500 font-semibold">{APP_DISPLAY_VERSION}</span>
                </div>
            </div>
        </div>
    );
};

export default InfiniteCanvas;
