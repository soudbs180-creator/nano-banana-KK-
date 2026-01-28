import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { CanvasGroup } from '../types';
import { Type, GripHorizontal, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface CanvasGroupProps {
    group: CanvasGroup;
    zoom: number;
    onUngroup: (id: string) => void;
    onDragStart: (id: string, e: React.MouseEvent) => void;
    onGroupDrag?: (delta: { x: number; y: number }) => void;
    onUpdateGroup?: (group: CanvasGroup) => void;
    highlighted?: boolean;
    computedBounds?: { x: number; y: number; width: number; height: number };
}

export const CanvasGroupComponent: React.FC<CanvasGroupProps> = ({
    group,
    zoom,
    onUngroup,
    onDragStart,
    onGroupDrag,
    onUpdateGroup,
    highlighted,
    computedBounds
}) => {
    // Shared state for drag
    const lastPos = useRef<{ x: number; y: number } | null>(null);
    const rafRef = useRef<number | null>(null);
    const pendingDelta = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);

    // Direct DOM Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const localBoundsRef = useRef(computedBounds || group.bounds);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Rename state
    const [isEditing, setIsEditing] = useState(false);
    const [label, setLabel] = useState(group.label || 'Group');
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync label
    useEffect(() => {
        setLabel(group.label || 'Group');
    }, [group.label]);

    // Sync bounds (if not dragging)
    useEffect(() => {
        if (!isDragging) {
            const newBounds = computedBounds || group.bounds;
            localBoundsRef.current = newBounds;
            if (containerRef.current) {
                containerRef.current.style.transform = `translate3d(${newBounds.x}px, ${newBounds.y}px, 0)`;
                containerRef.current.style.width = `${newBounds.width}px`;
                containerRef.current.style.height = `${newBounds.height}px`;
            }
        }
    }, [computedBounds, group.bounds, isDragging]);

    // Focus input on edit start
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Handle Context Menu
    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    // Close menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    useLayoutEffect(() => {
        if (!contextMenu) {
            setMenuPosition(null);
            return;
        }
        const updatePosition = () => {
            const menuEl = menuRef.current;
            if (!menuEl) {
                setMenuPosition({ x: contextMenu.x + 6, y: contextMenu.y + 6 });
                return;
            }
            const rect = menuEl.getBoundingClientRect();
            const x = Math.min(contextMenu.x + 6, window.innerWidth - rect.width - 8);
            const y = Math.min(contextMenu.y + 6, window.innerHeight - rect.height - 8);
            setMenuPosition({ x: Math.max(8, x), y: Math.max(8, y) });
        };
        updatePosition();
    }, [contextMenu]);

    const handleRename = () => {
        if (label.trim() && label !== group.label && onUpdateGroup) {
            onUpdateGroup({ ...group, label: label.trim() });
        }
        setIsEditing(false);
    };

    // Use computed bounds if available, otherwise fall back to stored group bounds
    const bounds = computedBounds || group.bounds;

    const handleMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent canvas pan
        onDragStart(group.id, e); // Select the group nodes

        if (!onGroupDrag) return;

        lastPos.current = { x: e.clientX, y: e.clientY };
        setIsDragging(true);

        const handleMouseMove = (ev: MouseEvent) => {
            if (!lastPos.current) return;

            const dx = (ev.clientX - lastPos.current.x) / zoom;
            const dy = (ev.clientY - lastPos.current.y) / zoom;
            lastPos.current = { x: ev.clientX, y: ev.clientY };

            // Accumulate deltas (even if RAF is pending)
            pendingDelta.current = {
                x: pendingDelta.current.x + dx,
                y: pendingDelta.current.y + dy
            };

            // Schedule RAF if not already pending
            if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                    // 1. Update Group Box DOM
                    if (containerRef.current) {
                        const cb = localBoundsRef.current;
                        const newX = cb.x + pendingDelta.current.x;
                        const newY = cb.y + pendingDelta.current.y;
                        localBoundsRef.current = { ...cb, x: newX, y: newY };
                        containerRef.current.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
                    }

                    // 2. Move Cards (flush accumulated delta)
                    if (onGroupDrag) {
                        onGroupDrag(pendingDelta.current);
                    }

                    // Reset
                    pendingDelta.current = { x: 0, y: 0 };
                    rafRef.current = null;
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            lastPos.current = null;
            pendingDelta.current = { x: 0, y: 0 };
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <>
            <div
                ref={containerRef}
                className={`absolute border-2 rounded-xl group-container
                    ${highlighted
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.3)] z-10'
                        : 'border-dashed border-zinc-400/30 bg-zinc-400/5 hover:border-zinc-400/50 hover:bg-zinc-400/10 dark:border-white/20 dark:bg-white/5 dark:hover:border-white/30 dark:hover:bg-white/10'
                    } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                    left: 0,
                    top: 0,
                    width: bounds.width,
                    height: bounds.height,
                    transform: `translate3d(${bounds.x}px, ${bounds.y}px, 0)`,
                    zIndex: 5, // Below cards (z-10/20) but above lines
                    pointerEvents: 'auto',
                    willChange: isDragging ? 'transform' : 'auto', // GPU Optimization
                    // Disable transition during drag to prevent rubber-banding
                    transition: isDragging ? 'none' : 'box-shadow 0.3s ease, transform 0.1s linear, width 0.1s linear, height 0.1s linear',
                    backfaceVisibility: 'hidden'
                }}
                onMouseDown={handleMouseDown} // Allow dragging from anywhere in the group box
                onContextMenu={handleContextMenu}
            >
                {/* Header / Drag Handle */}
                <div
                    className="absolute -top-8 left-0 flex items-center gap-2 px-2 py-1 rounded-t-lg border-t border-l border-r transition-opacity opacity-100 backdrop-blur"
                    style={{
                        backgroundColor: highlighted ? 'rgba(99,102,241,0.12)' : 'var(--bg-tertiary)',
                        borderColor: highlighted ? 'rgba(99,102,241,0.35)' : 'var(--border-light)'
                    }}
                >
                    <GripHorizontal size={14} style={{ color: highlighted ? 'var(--accent-indigo)' : 'var(--text-tertiary)' }} />
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            onBlur={handleRename}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename();
                                if (e.key === 'Escape') {
                                    setLabel(group.label || 'Group');
                                    setIsEditing(false);
                                }
                                e.stopPropagation();
                            }}
                            onMouseDown={(e) => e.stopPropagation()} // Allow text alignment/cursor
                            className="w-32 bg-transparent text-xs font-medium border-none outline-none focus:ring-1 focus:ring-indigo-500/50 rounded px-1"
                            style={{ color: 'var(--text-primary)' }}
                        />
                    ) : (
                        <span
                            className="text-xs font-medium whitespace-nowrap"
                            style={{ color: highlighted ? 'var(--accent-indigo)' : 'var(--text-secondary)' }}
                        >
                            {group.label || 'Group'}
                        </span>
                    )}
                </div>
            </div>

            {/* Context Menu Portal (Fixed Position) */}
            {contextMenu && createPortal(
                <div
                    ref={menuRef}
                    className="fixed z-[9999] bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-lg shadow-xl p-1 min-w-[140px] animate-fadeIn"
                    style={{ left: (menuPosition?.x ?? contextMenu.x + 6), top: (menuPosition?.y ?? contextMenu.y + 6) }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => {
                            setContextMenu(null);
                            setIsEditing(true);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--toolbar-hover)] hover:text-[var(--text-primary)] rounded transition-colors text-left"
                    >
                        <Type size={14} />
                        重命名
                    </button>
                    <div className="h-[1px] bg-[var(--border-light)] my-1" />
                    <button
                        onClick={() => {
                            setContextMenu(null);
                            onUngroup(group.id);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 hover:text-red-400 rounded transition-colors text-left"
                    >
                        <Trash2 size={14} />
                        取消打组
                    </button>
                </div>,
                document.body
            )}
        </>
    );
};
