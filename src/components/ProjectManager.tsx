import React, { useState, useEffect, useRef } from 'react';
import { useCanvas } from '../context/CanvasContext';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import {
    Loader2, Menu, Layers, Search, ZoomIn, ZoomOut,
    Focus, Grid3x3, LayoutDashboard, GripVertical, Bot
} from 'lucide-react';

interface ProjectManagerProps {
    onSearch: () => void;
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
    isMobile: boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetView: () => void;
    onToggleGrid: () => void;
    onAutoArrange: () => void;
    // Chat toggle for mobile robot button
    onToggleChat?: () => void;
    isChatOpen?: boolean;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({
    onSearch,
    isSidebarOpen,
    onToggleSidebar,
    isMobile,
    onZoomIn,
    onZoomOut,
    onResetView,
    onToggleGrid,
    onAutoArrange,
    onToggleChat,
    isChatOpen
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

    // Dragging Logic
    const [topPosition, setTopPosition] = useState(() => {
        const saved = localStorage.getItem('kk_pm_pos');
        return saved ? parseFloat(saved) : 80;
    }); // Initial top: 28 * 4 = 112px or saved -> Adjusted to 80px

    useEffect(() => {
        localStorage.setItem('kk_pm_pos', topPosition.toString());
    }, [topPosition]);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ y: 0, startTop: 0 });
    const hasDraggedRef = useRef(false);

    const INITIAL_TOP = 60;

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaY = e.clientY - dragStartRef.current.y;
            let newTop = dragStartRef.current.startTop + deltaY;

            // Constraints
            const MAX_TOP = window.innerHeight / 2;

            if (newTop < INITIAL_TOP) newTop = INITIAL_TOP;
            if (newTop > MAX_TOP) newTop = MAX_TOP;

            if (Math.abs(deltaY) > 5) hasDraggedRef.current = true;

            setTopPosition(newTop);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'grab'; // Vertical drag cursor
        document.body.style.userSelect = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handleMouseDown = (e: React.MouseEvent) => {
        // Prevent drag if clicking a button (handled by e.stopPropagation in buttons if needed, but easier to check target)
        // Actually, we'll make the container draggable but buttons stop propagation? 
        // Or check if target is a button.
        if ((e.target as HTMLElement).closest('button')) return;

        e.preventDefault();
        dragStartRef.current = { y: e.clientY, startTop: topPosition };
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
        inactivityTimerRef.current = setTimeout(() => {
            setIsCollapsed(true);
        }, 4000);
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
            className={`fixed left-4 z-50 flex flex-col items-start gap-2 select-none transition-all duration-300 ease-out ${isCollapsed ? '-translate-x-full opacity-30 hover:opacity-100' : 'translate-x-0 opacity-100'}`}
            style={{
                top: isMobile ? 80 : topPosition,
                // Move sidebar up when keyboard is open on mobile
                transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : undefined
            }}
            onMouseEnter={() => setIsCollapsed(false)}
            onTouchStart={() => setIsCollapsed(false)}
        >
            {/* Project Module Container */}
            <div
                className={`flex flex-col gap-2 p-1.5 glass-strong rounded-2xl border border-white/5 shadow-xl transition-colors hover:bg-[#1c1c1e]/90 cursor-grab active:cursor-grabbing ${isDragging ? 'scale-[0.98]' : ''}`}
                onMouseDown={handleMouseDown}
            >
                {/* Drag Handle Indicator */}
                <div className="w-full flex justify-center py-0.5 opacity-20 hover:opacity-50">
                    <div className="w-4 h-0.5 bg-white/50 rounded-full" />
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
                        onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all group relative flex items-center justify-center outline-none focus:outline-none"
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
                            <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">我的项目</h3>
                                <span className="text-[10px] text-zinc-500">{activeProjectName}</span>
                            </div>
                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                {state.canvases.map(canvas => (
                                    <div
                                        key={canvas.id}
                                        className={`flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 cursor-pointer transition-colors ${canvas.id === activeCanvas?.id ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-300'}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (editingId !== canvas.id) {
                                                switchCanvas(canvas.id);
                                                setShowDropdown(false);
                                            }
                                        }}
                                    >
                                        <div className={`w-4 h-4 flex items-center justify-center ${canvas.id === activeCanvas?.id ? 'opacity-100' : 'opacity-0'}`}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </div>
                                        {/* Edit/Name logic */}
                                        {editingId === canvas.id ? (
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onBlur={saveEdit}
                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex-1 bg-black/30 border border-indigo-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
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
                            <div className="border-t border-white/5 p-2 space-y-1 bg-black/20">
                                <button onClick={(e) => { e.stopPropagation(); handleCreateProject(); }} className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all ${canCreateCanvas ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-zinc-600 cursor-not-allowed'}`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>新建项目</button>
                                <div className="h-px bg-white/5 my-1" />
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadAll(); }} disabled={isDownloading} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>{isDownloading ? '打包中...' : '下载项目原图'}</button>
                                <button onClick={(e) => { e.stopPropagation(); handleClearAll(); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>清除项目数据</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Search Button */}
                <button
                    onClick={(e) => { e.stopPropagation(); onSearch(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="搜索提示词 (Ctrl+K)"
                    tabIndex={-1}
                >
                    <Search size={20} />
                </button>

                <div className="w-full h-px bg-white/5 my-1" />

                {/* 4. Zoom Controls and Tools */}
                <button
                    onClick={(e) => { e.stopPropagation(); onZoomIn(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="放大 (+)"
                    tabIndex={-1}
                >
                    <ZoomIn size={20} />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onZoomOut(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="缩小 (-)"
                    tabIndex={-1}
                >
                    <ZoomOut size={20} />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onResetView(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="重置视图 / 定位最新 (Fit View)"
                    tabIndex={-1}
                >
                    <Focus size={20} />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onToggleGrid(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="显示/隐藏网格"
                    tabIndex={-1}
                >
                    <Grid3x3 size={20} />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); onAutoArrange(); }}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-all outline-none focus:outline-none"
                    title="自动整理 (Auto Arrange)"
                    tabIndex={-1}
                >
                    <LayoutDashboard size={20} />
                </button>

                {/* Mobile Only: Robot Chat Button */}
                {isMobile && onToggleChat && (
                    <>
                        <div className="w-full h-px bg-white/5 my-1" />
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleChat(); }}
                            className={`p-2 rounded-lg transition-all outline-none focus:outline-none relative ${isChatOpen
                                ? 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30'
                                : 'text-zinc-400 hover:text-white hover:bg-white/10'
                                }`}
                            title="AI 助手"
                            tabIndex={-1}
                        >
                            <Bot size={20} />
                            {/* Status Dot */}
                            <span className="absolute top-1 right-1 w-2 h-2 bg-emerald-400 rounded-full border border-[#1c1c1e] animate-pulse" />
                        </button>
                    </>
                )}

            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn cursor-default">
                    <div
                        className="glass-strong p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-scaleIn border border-white/10"
                        onMouseDown={(e) => e.stopPropagation()} // Prevent dragging underlying toolbar? No, modal is separate
                    >
                        <div className="flex items-center gap-4 mb-5">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
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
                </div>
            )}
        </div>
    );
};

export default ProjectManager;
