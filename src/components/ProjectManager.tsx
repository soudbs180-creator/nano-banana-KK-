import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useCanvas } from '../context/CanvasContext';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import {
    Loader2, Menu, Layers, Search, Maximize2,
    Focus, CircleDot, LayoutDashboard, GripVertical, Bot, Grid3x3, Square, Sun, Moon
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ProjectManagerProps {
    onSearch: () => void;
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
    isMobile: boolean;
    onFitToAll: () => void; // ✅ 缩放到全览
    onResetView: () => void;
    onToggleGrid: () => void;
    onAutoArrange: () => void;
    // Chat toggle for mobile robot button
    // Chat toggle for mobile robot button
    onToggleChat?: () => void;
    isChatOpen?: boolean;
    showGrid?: boolean;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({
    onSearch,
    isSidebarOpen,
    onToggleSidebar,
    isMobile,
    onFitToAll,
    onResetView,
    onToggleGrid,
    onAutoArrange,
    onToggleChat,
    isChatOpen,
    showGrid = true
}) => {
    // ... existing state ...
    const { state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas, clearAllData, canCreateCanvas } = useCanvas();
    const [showDropdown, setShowDropdown] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);

    // Mobile keyboard offset for sidebar
    const [keyboardOffset, setKeyboardOffset] = useState(0);

    // Track keyboard visibility using visualViewport API
    useEffect(() => {
        if (!isMobile) return;

        const handleViewportResize = () => {
            const vv = window.visualViewport;
            if (vv) {
                const heightDiff = window.innerHeight - vv.height;
                // Only apply offset if keyboard is likely open (> 100px difference)
                setKeyboardOffset(heightDiff > 100 ? heightDiff : 0);
            }
        };

        window.visualViewport?.addEventListener('resize', handleViewportResize);
        window.visualViewport?.addEventListener('scroll', handleViewportResize);

        return () => {
            window.visualViewport?.removeEventListener('resize', handleViewportResize);
            window.visualViewport?.removeEventListener('scroll', handleViewportResize);
        };
    }, [isMobile]);

    const { theme, toggleTheme } = useTheme();

    // Dragging Logic
    const [topPosition, setTopPosition] = useState(() => {
        const saved = localStorage.getItem('kk_pm_pos');
        return saved ? parseFloat(saved) : 80;
    });

    useEffect(() => {
        localStorage.setItem('kk_pm_pos', topPosition.toString());
    }, [topPosition]);

    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ y: 0, startTop: 0 });
    const hasDraggedRef = useRef(false);

    const INITIAL_TOP = 60;

    useEffect(() => {
        if (!isDragging) return;

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            const deltaY = clientY - dragStartRef.current.y;
            let newTop = dragStartRef.current.startTop + deltaY;

            // Constraints
            const MAX_TOP = window.innerHeight / 2;

            if (newTop < INITIAL_TOP) newTop = INITIAL_TOP;
            if (newTop > MAX_TOP) newTop = MAX_TOP;

            if (Math.abs(deltaY) > 5) hasDraggedRef.current = true;

            setTopPosition(newTop);
        };

        const handleEnd = () => {
            setIsDragging(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.style.touchAction = '';
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);

        document.body.style.cursor = 'grab';
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none'; // Prevent scrolling while dragging

        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging]);

    const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
        // Prevent drag if clicking a button
        if ((e.target as HTMLElement).closest('button')) return;

        // For touch, we might want to prevent default to stop scrolling,
        // but only if we are sure we are dragging.
        // e.preventDefault(); // This is handled in style for touchAction usually, but here specific event

        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        dragStartRef.current = { y: clientY, startTop: topPosition };
        hasDraggedRef.current = false;
        setIsDragging(true);
    };

    // Auto-close menu after 5 seconds of inactivity
    useEffect(() => {
        if (showDropdown) {
            const timer = setTimeout(() => {
                setShowDropdown(false);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [showDropdown]);

    const handleClearAll = () => {
        if (confirm('确定要清除所有项目数据吗？此操作无法撤销！')) {
            clearAllData();
            setShowDropdown(false);
        }
    };

    const handleDownloadAll = async () => {
        if (!activeCanvas || activeCanvas.imageNodes.length === 0) {
            alert("当前项目没有图片可下载");
            return;
        }

        if (!confirm("确认下载所有图片？\n\n此操作将打包下载当前项目的所有图片（高清原图），但不包含提示词信息。")) {
            return;
        }

        setIsDownloading(true);
        setShowDropdown(false);

        try {
            const zip = new JSZip();
            const folder = zip.folder(activeCanvas.name) || zip;

            let count = 0;
            const promises = activeCanvas.imageNodes.map(async (img, index) => {
                try {
                    const downloadUrl = img.originalUrl || img.url;
                    if (!downloadUrl) return;

                    let blob;
                    if (downloadUrl.startsWith('data:')) {
                        blob = await (await fetch(downloadUrl)).blob();
                    } else {
                        const response = await fetch(downloadUrl);
                        blob = await response.blob();
                    }
                    const ext = blob.type.split('/')[1] || 'png';
                    const filename = `image_${index + 1}_${img.id.slice(0, 4)}.${ext}`;
                    folder.file(filename, blob);
                    count++;
                } catch (e) {
                    console.error("Failed to add image to zip", e);
                }
            });

            await Promise.all(promises);

            if (count === 0) {
                alert("下载失败：无法获取图片数据");
                return;
            }

            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `${activeCanvas.name}_images.zip`);

        } catch (err) {
            console.error("Download failed", err);
            alert("打包下载失败，请重试");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleCreateProject = () => {
        if (!canCreateCanvas) {
            alert('最多只能创建 10 个项目！');
            return;
        }
        createCanvas();
        setShowDropdown(false);
    };

    const startEditing = (canvas: { id: string; name: string }) => {
        setEditingId(canvas.id);
        setEditName(canvas.name);
    };

    const saveEdit = () => {
        if (editingId && editName.trim()) {
            renameCanvas(editingId, editName.trim());
        }
        setEditingId(null);
        setEditName('');
    };

    const activeProjectName = activeCanvas?.name || '项目';


    // Auto-retract logic for Toolbar (User calls this "Sidebar")
    const [isCollapsed, setIsCollapsed] = useState(false);
    const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

    const resetInactivityTimer = () => {
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        setIsCollapsed(false);

        // 检查当前是否有输入框或文本域有焦点
        const isInputFocused = () => {
            const activeEl = document.activeElement;
            return activeEl instanceof HTMLInputElement ||
                activeEl instanceof HTMLTextAreaElement ||
                (activeEl as HTMLElement)?.isContentEditable;
        };

        // 如果输入框有焦点,不设置自动折叠定时器
        if (!isInputFocused()) {
            inactivityTimerRef.current = setTimeout(() => {
                // 再次检查,确保设置定时器后用户没有聚焦输入框
                if (!isInputFocused()) {
                    setIsCollapsed(true);
                }
            }, 4000);
        }
    };

    useEffect(() => {
        resetInactivityTimer();
        window.addEventListener('mousemove', resetInactivityTimer);
        window.addEventListener('touchstart', resetInactivityTimer);
        window.addEventListener('click', resetInactivityTimer);
        return () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            window.removeEventListener('mousemove', resetInactivityTimer);
            window.removeEventListener('touchstart', resetInactivityTimer);
            window.removeEventListener('click', resetInactivityTimer);
        };
    }, []);

    return (
        <div
            id="project-manager-container"
            className={`fixed left-4 z-50 flex flex-col items-start gap-2 select-none transition-all duration-300 ease-out ${isCollapsed ? '-translate-x-full opacity-30 hover:opacity-100' : 'translate-x-0 opacity-100'}`}
            style={{
                top: isMobile ? 20 : topPosition,
                // Move sidebar up when keyboard is open on mobile
                transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : undefined
            }}
            onMouseEnter={() => setIsCollapsed(false)}
            onTouchStart={() => setIsCollapsed(false)}
        >
            {/* Project Module Container */}
            <div
                className={`flex flex-col gap-2 p-1.5 glass-strong rounded-2xl transition-colors cursor-grab active:cursor-grabbing ${isDragging ? 'scale-[0.98]' : ''}`}
                style={{
                    borderColor: 'var(--border-light)',
                    boxShadow: 'var(--shadow-xl)'
                }}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
            >
                {/* Drag Handle Indicator */}
                <div className="w-full flex justify-center py-0.5 opacity-20 hover:opacity-50">
                    <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: 'var(--text-primary)' }} />
                </div>

                {/* 1. Sidebar Toggle REMOVED as per user request (Extra Icon) */}
                {/* 
                {(!isSidebarOpen || isMobile) && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleSidebar(); }}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                        title="打开侧边栏"
                    >
                        <Menu size={20} />
                    </button>
                )}
                */}

                {/* 2. Project Selector */}
                <div className="relative">
                    <button
                        id="project-manager-trigger"
                        onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}
                        className="p-2 rounded-lg transition-all group relative flex items-center justify-center outline-none focus:outline-none"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--text-primary)';
                            e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--text-secondary)';
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title={activeProjectName}
                        tabIndex={-1}
                    >
                        <Layers size={20} className={showDropdown ? 'text-indigo-400' : ''} />
                        <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-indigo-500 rounded-full border border-[#1c1c1e]" />
                    </button>

                    {/* Dropdown Menu Overlay */}
                    {showDropdown && (
                        <div
                            className="fixed inset-0 z-40 cursor-default"
                            onClick={(e) => { e.stopPropagation(); setShowDropdown(false); }}
                        />
                    )}

                    {/* Dropdown Menu */}
                    {showDropdown && (
                        <div className="absolute left-full top-0 ml-3 w-64 glass-strong rounded-2xl overflow-hidden z-50 animate-scaleIn origin-top-left border border-white/5 shadow-2xl cursor-default">
                            {/* ... same dropdown content ... */}
                            <div
                                className="px-4 py-3 border-b flex items-center justify-between"
                                style={{
                                    borderColor: 'var(--border-light)',
                                    backgroundColor: 'var(--bg-tertiary)'
                                }}
                            >
                                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>我的项目</h3>
                                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{activeProjectName}</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                {state.canvases.map(canvas => (
                                    <div
                                        key={canvas.id}
                                        className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${canvas.id === activeCanvas?.id ? 'text-indigo-400' : ''}`}
                                        style={{
                                            backgroundColor: canvas.id === activeCanvas?.id ? 'var(--toolbar-active)' : 'transparent',
                                            color: canvas.id === activeCanvas?.id ? 'var(--accent-indigo)' : 'var(--text-secondary)'
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (editingId !== canvas.id) {
                                                switchCanvas(canvas.id);
                                                setShowDropdown(false);
                                            }
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = canvas.id === activeCanvas?.id ? 'var(--toolbar-active)' : 'transparent'}
                                    >
                                        <div className={`w-4 h-4 flex items-center justify-center ${canvas.id === activeCanvas?.id ? 'opacity-100' : 'opacity-0'}`}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-indigo)' }}>
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </div>
                                        {/* Edit/Name logic */}
                                        {editingId === canvas.id ? (
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex-1 px-2 py-0.5 text-sm transition-all focus:outline-none"
                                                style={{
                                                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                                    border: '1px solid var(--accent-blue)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    color: 'white',
                                                    fontSize: '16px',
                                                    transitionDuration: 'var(--duration-fast)'
                                                }}
                                                onFocus={(e) => {
                                                    e.currentTarget.style.boxShadow = 'var(--glow-blue)';
                                                }}
                                                onBlur={(e) => {
                                                    e.currentTarget.style.boxShadow = 'none';
                                                    saveEdit();
                                                }}
                                                autoFocus
                                            />
                                        ) : (
                                            <span className="flex-1 text-sm truncate font-medium">{canvas.name}</span>
                                        )}
                                        {/* Buttons */}
                                        <div className="flex items-center gap-1 opacity-100">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); startEditing(canvas); }}
                                                className="p-1.5 hover:bg-white/10 rounded-md text-zinc-500 hover:text-white transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                                            </button>
                                            {state.canvases.length > 1 && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(canvas.id); }}
                                                    className="p-1.5 hover:bg-red-500/10 rounded-md text-zinc-500 hover:text-red-400 transition-colors"
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t p-2 space-y-1" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-secondary)' }}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleCreateProject(); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all ${canCreateCanvas ? 'hover:bg-opacity-10' : 'cursor-not-allowed'}`}
                                    style={{
                                        color: canCreateCanvas ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                        backgroundColor: 'transparent'
                                    }}
                                    onMouseEnter={(e) => canCreateCanvas && (e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)')}
                                    onMouseLeave={(e) => canCreateCanvas && (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>新建项目
                                </button>
                                <div className="h-px my-1" style={{ backgroundColor: 'var(--border-light)' }} />
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDownloadAll(); }}
                                    disabled={isDownloading}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors"
                                    style={{ color: 'var(--text-secondary)' }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = 'var(--text-primary)';
                                        e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>{isDownloading ? '打包中...' : '下载项目原图'}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleClearAll(); }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors"
                                    style={{ color: 'var(--text-secondary)' }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = 'var(--accent-red)';
                                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>清除项目数据
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Search Button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onSearch(); }}
                    className="p-2 rounded-lg transition-all outline-none focus:outline-none"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--text-primary)';
                        e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="搜索提示词 (Ctrl+K)"
                    tabIndex={-1}
                >
                    <Search size={20} />
                </button>

                <div className="w-full h-px my-1" style={{ backgroundColor: 'var(--toolbar-divider)' }} />

                {/* 4. Fit All - 缩放到全览 */}
                <button
                    onClick={(e) => { e.stopPropagation(); onFitToAll(); }}
                    className="p-2 rounded-lg transition-all outline-none focus:outline-none"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--text-primary)';
                        e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="缩放到全览 (Fit All)"
                    tabIndex={-1}
                >
                    <Maximize2 size={20} />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onResetView(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="定位卡组 (Locate Group)"
                    tabIndex={-1}
                >
                    <Focus size={20} />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onToggleGrid(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="显示/隐藏网点"
                    tabIndex={-1}
                >
                    {showGrid ? <Grid3x3 size={20} /> : <Square size={20} />}
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onAutoArrange(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="自动整理 (Auto Arrange)"
                    tabIndex={-1}
                >
                    <LayoutDashboard size={20} />
                </button>

                <div className="w-full h-px my-1" style={{ backgroundColor: 'var(--toolbar-divider)' }} />

                <button
                    onClick={(e) => { e.stopPropagation(); toggleTheme(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                    tabIndex={-1}
                >
                    {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                </button>


            </div>

            {/* Delete Confirmation Modal - 使用Portal渲染到body避免布局问题 */}
            {showDeleteConfirm && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn"
                    onClick={() => setShowDeleteConfirm(null)}
                >
                    <div
                        className="glass-strong p-6 rounded-2xl shadow-2xl max-w-sm w-[90%] mx-4 animate-scaleIn border border-white/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-4 mb-5">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 flex-shrink-0">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    <line x1="10" y1="11" x2="10" y2="17" />
                                    <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">确认删除项目？</h3>
                                <p className="text-zinc-500 text-xs mt-1">此操作不可恢复</p>
                            </div>
                        </div>
                        <p className="text-zinc-300 text-sm mb-6 leading-relaxed bg-white/5 p-3 rounded-lg border border-white/5">
                            删除后，该项目中的所有卡片和创作记录将永久丢失。
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => { if (showDeleteConfirm) deleteCanvas(showDeleteConfirm); setShowDeleteConfirm(null); setShowDropdown(false); }}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition-all active:scale-95"
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default ProjectManager;
