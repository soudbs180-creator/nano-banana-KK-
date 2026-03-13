import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import {
    Focus,
    Grid3x3,
    Layers,
    LayoutDashboard,
    Maximize2,
    Moon,
    Search,
    ScrollText,
    Square,
    Sun,
    Trash2,
    Wand2,
} from 'lucide-react';
import { useCanvas } from '../../context/CanvasContext';
import { useTheme } from '../../context/ThemeContext';
import { notify } from '../../services/system/notificationService';

interface ProjectManagerProps {
    onSearch: () => void;
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
    isMobile: boolean;
    onFitToAll: () => void;
    onResetView: () => void;
    onToggleGrid: () => void;
    onAutoArrange: () => void;
    onToggleChat?: () => void;
    isChatOpen?: boolean;
    showGrid?: boolean;
    onOpenProfile?: () => void;
    mobilePromptOptimizationEnabled?: boolean;
    mobilePromptOptimizationSupported?: boolean;
    onToggleMobilePromptOptimization?: () => void;
    onOpenMobilePromptLibrary?: () => void;
}

const ProjectManager: React.FC<ProjectManagerProps> = ({
    onSearch,
    isMobile,
    onFitToAll,
    onResetView,
    onToggleGrid,
    onAutoArrange,
    showGrid = true,
    mobilePromptOptimizationEnabled = false,
    mobilePromptOptimizationSupported = true,
    onToggleMobilePromptOptimization,
    onOpenMobilePromptLibrary,
}) => {
    const {
        state,
        activeCanvas,
        createCanvas,
        switchCanvas,
        deleteCanvas,
        renameCanvas,
        clearAllData,
        canCreateCanvas,
        mergeCanvasInto,
        cleanupInvalidCards,
    } = useCanvas();
    const { theme, toggleTheme } = useTheme();

    const [showDropdown, setShowDropdown] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [showMergeModal, setShowMergeModal] = useState(false);
    const [mergingCanvasId, setMergingCanvasId] = useState<string | null>(null);
    const [cleaningInvalid, setCleaningInvalid] = useState(false);
    const [topPosition, setTopPosition] = useState(() => {
        const saved = localStorage.getItem('kk_pm_pos');
        const parsed = saved ? Number.parseFloat(saved) : 80;
        return Number.isFinite(parsed) ? parsed : 80;
    });
    const [isDragging, setIsDragging] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const dragStartRef = useRef({ y: 0, startTop: 0 });
    const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
    const initialTop = 60;
    const activeProjectName = activeCanvas?.name || '项目';

    useEffect(() => {
        localStorage.setItem('kk_pm_pos', String(topPosition));
    }, [topPosition]);

    useEffect(() => {
        if (!isDragging) {
            return;
        }

        const handleMove = (event: MouseEvent | TouchEvent) => {
            const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
            const deltaY = clientY - dragStartRef.current.y;
            const maxTop = window.innerHeight / 2;
            const nextTop = Math.min(maxTop, Math.max(initialTop, dragStartRef.current.startTop + deltaY));
            setTopPosition(nextTop);
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
        document.body.style.touchAction = 'none';

        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleEnd);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.style.touchAction = '';
        };
    }, [isDragging]);

    const handleDragStart = (event: React.MouseEvent | React.TouchEvent) => {
        if (isMobile || (event.target as HTMLElement).closest('button')) {
            return;
        }

        const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
        dragStartRef.current = { y: clientY, startTop: topPosition };
        setIsDragging(true);
    };

    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
        }

        setIsCollapsed(false);

        if (isMobile) {
            return;
        }

        const activeElement = document.activeElement;
        const isInputFocused =
            activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement ||
            (activeElement as HTMLElement | null)?.isContentEditable;

        if (isInputFocused) {
            return;
        }

        inactivityTimerRef.current = setTimeout(() => {
            const focusedElement = document.activeElement;
            const stillEditing =
                focusedElement instanceof HTMLInputElement ||
                focusedElement instanceof HTMLTextAreaElement ||
                (focusedElement as HTMLElement | null)?.isContentEditable;

            if (!stillEditing) {
                setIsCollapsed(true);
            }
        }, 4000);
    }, [isMobile]);

    useEffect(() => {
        resetInactivityTimer();
        window.addEventListener('mousemove', resetInactivityTimer);
        window.addEventListener('touchstart', resetInactivityTimer);
        window.addEventListener('click', resetInactivityTimer);

        return () => {
            if (inactivityTimerRef.current) {
                clearTimeout(inactivityTimerRef.current);
            }
            window.removeEventListener('mousemove', resetInactivityTimer);
            window.removeEventListener('touchstart', resetInactivityTimer);
            window.removeEventListener('click', resetInactivityTimer);
        };
    }, [resetInactivityTimer]);

    useEffect(() => {
        if (!showDropdown) {
            return;
        }

        const timer = setTimeout(() => {
            setShowDropdown(false);
        }, 5000);

        return () => clearTimeout(timer);
    }, [showDropdown]);

    const saveEdit = useCallback(() => {
        if (editingId && editName.trim()) {
            renameCanvas(editingId, editName.trim());
        }
        setEditingId(null);
        setEditName('');
    }, [editName, editingId, renameCanvas]);

    const startEditing = useCallback((canvas: { id: string; name: string }) => {
        setEditingId(canvas.id);
        setEditName(canvas.name);
    }, []);

    const handleCreateProject = useCallback(() => {
        if (!canCreateCanvas) {
            notify.warning('项目数量已满', '当前最多只能创建 10 个项目。');
            return;
        }

        createCanvas();
        setShowDropdown(false);
    }, [canCreateCanvas, createCanvas]);

    const handleClearAll = useCallback(() => {
        if (window.confirm('确定要清空当前项目的数据吗？此操作无法撤销。')) {
            clearAllData();
            setShowDropdown(false);
        }
    }, [clearAllData]);

    const handleDownloadAll = useCallback(async () => {
        if (!activeCanvas || activeCanvas.imageNodes.length === 0) {
            notify.warning('暂无可下载内容', '当前项目还没有生成图片。');
            return;
        }

        if (!window.confirm('确认下载当前项目的全部图片吗？这会打包高质量原图。')) {
            return;
        }

        setIsDownloading(true);
        setShowDropdown(false);

        try {
            const zip = new JSZip();
            const folder = zip.folder(activeCanvas.name) || zip;

            let count = 0;
            await Promise.all(activeCanvas.imageNodes.map(async (image, index) => {
                try {
                    const downloadUrl = image.originalUrl || image.url;
                    if (!downloadUrl) {
                        return;
                    }

                    const response = downloadUrl.startsWith('data:')
                        ? await fetch(downloadUrl)
                        : await fetch(downloadUrl);
                    const blob = await response.blob();
                    const ext = blob.type.split('/')[1] || 'png';
                    const filename = `image_${index + 1}_${image.id.slice(0, 4)}.${ext}`;
                    folder.file(filename, blob);
                    count += 1;
                } catch (error) {
                    console.error('Failed to add image to zip', error);
                }
            }));

            if (count === 0) {
                notify.error('下载失败', '没有成功获取到图片数据。');
                return;
            }

            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, `${activeCanvas.name}_images.zip`);
        } catch (error) {
            console.error('Download failed', error);
            notify.error('下载失败', '打包图片时出现问题，请稍后重试。');
        } finally {
            setIsDownloading(false);
        }
    }, [activeCanvas]);

    const handleCleanupInvalidCards = useCallback(() => {
        if (!activeCanvas) {
            return;
        }

        setCleaningInvalid(true);
        try {
            const result = cleanupInvalidCards(activeCanvas.id);
            if (result.removedPrompts === 0 && result.removedImages === 0 && result.removedGroups === 0) {
                notify.success('无需清理', '当前项目没有发现错误卡片或失效分组。');
                return;
            }

            notify.success(
                '清理完成',
                `已清理 ${result.removedPrompts} 张主卡、${result.removedImages} 张子卡，并移除 ${result.removedGroups} 个空分组。`
            );
        } finally {
            setCleaningInvalid(false);
            setShowDropdown(false);
        }
    }, [activeCanvas, cleanupInvalidCards]);

    const handleMergeIntoCurrent = useCallback((sourceCanvasId: string) => {
        if (!activeCanvas || sourceCanvasId === activeCanvas.id) {
            return;
        }

        const sourceCanvas = state.canvases.find(canvas => canvas.id === sourceCanvasId);
        if (!sourceCanvas) {
            return;
        }

        const confirmed = window.confirm(`确认把“${sourceCanvas.name}”合并到“${activeCanvas.name}”吗？合并后原项目会被删除。`);
        if (!confirmed) {
            return;
        }

        setMergingCanvasId(sourceCanvasId);
        try {
            const result = mergeCanvasInto(sourceCanvasId, activeCanvas.id, { deleteSource: true });
            notify.success(
                '合并完成',
                `已合并 ${result.movedPrompts} 张主卡和 ${result.movedImages} 张子卡到“${activeCanvas.name}”。`
            );
            setShowMergeModal(false);
            setShowDropdown(false);
        } finally {
            setMergingCanvasId(null);
        }
    }, [activeCanvas, mergeCanvasInto, state.canvases]);

    const desktopIconButtonClass = 'group relative flex h-10 w-10 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-all active:scale-95 hover:bg-[var(--toolbar-hover)] hover:text-[var(--text-primary)]';
    const dropdownPositionStyle = isMobile
        ? { top: 'calc(100% + 10px)', left: 0, width: 'min(92vw, 340px)' }
        : undefined;

    const projectDropdown = showDropdown ? (
        <>
            <div
                className="fixed inset-0 z-40 cursor-default"
                onClick={(event) => {
                    event.stopPropagation();
                    setShowDropdown(false);
                }}
            />
            <div
                className={`absolute ${isMobile ? '' : 'left-full top-0 ml-3 w-64'} glass-strong z-50 overflow-hidden rounded-2xl border border-white/5 shadow-2xl`}
                style={dropdownPositionStyle}
            >
                <div
                    className="flex items-center justify-between border-b px-4 py-3"
                    style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-tertiary)' }}
                >
                    <h3 className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
                        我的项目
                    </h3>
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {activeProjectName}
                    </span>
                </div>

                <div className="custom-scrollbar max-h-60 overflow-y-auto">
                    {state.canvases.map((canvas) => {
                        const isActive = canvas.id === activeCanvas?.id;

                        return (
                            <div
                                key={canvas.id}
                                className="flex items-center gap-2 px-3 py-2.5 transition-colors"
                                style={{
                                    backgroundColor: isActive ? 'var(--toolbar-active)' : 'transparent',
                                    color: isActive ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                                }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    if (editingId !== canvas.id) {
                                        switchCanvas(canvas.id);
                                        setShowDropdown(false);
                                    }
                                }}
                            >
                                <div className={`flex h-4 w-4 items-center justify-center ${isActive ? 'opacity-100' : 'opacity-0'}`}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </div>

                                {editingId === canvas.id ? (
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(event) => setEditName(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                saveEdit();
                                            }
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                        onBlur={saveEdit}
                                        className="flex-1 rounded-md border px-2 py-1 text-sm focus:outline-none"
                                        style={{
                                            backgroundColor: 'rgba(15, 23, 42, 0.46)',
                                            borderColor: 'var(--accent-blue)',
                                            color: 'var(--text-primary)',
                                        }}
                                        autoFocus
                                    />
                                ) : (
                                    <span className="flex-1 truncate text-sm font-medium">{canvas.name}</span>
                                )}

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            startEditing(canvas);
                                        }}
                                        className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--toolbar-hover)] hover:text-[var(--text-primary)]"
                                        aria-label="重命名项目"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                        </svg>
                                    </button>

                                    {state.canvases.length > 1 && (
                                        <button
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setShowDeleteConfirm(canvas.id);
                                            }}
                                            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                                            aria-label="删除项目"
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div
                    className="space-y-1 border-t p-2"
                    style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-secondary)' }}
                >
                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            handleCreateProject();
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${canCreateCanvas ? 'hover:bg-[var(--toolbar-hover)]' : 'cursor-not-allowed opacity-60'}`}
                        style={{ color: canCreateCanvas ? 'var(--accent-indigo)' : 'var(--text-secondary)' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        新建项目
                    </button>

                    <div className="my-1 h-px" style={{ backgroundColor: 'var(--border-light)' }} />

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            void handleDownloadAll();
                        }}
                        disabled={isDownloading}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--toolbar-hover)] hover:text-[var(--text-primary)]"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {isDownloading ? '正在打包图片...' : '下载项目原图'}
                    </button>

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            setShowMergeModal(true);
                        }}
                        disabled={state.canvases.length < 2 || !!mergingCanvasId}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--toolbar-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Layers size={16} />
                        {mergingCanvasId ? '正在合并项目...' : '合并其他项目到当前画布'}
                    </button>

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            handleCleanupInvalidCards();
                        }}
                        disabled={cleaningInvalid}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-amber-500/10 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Trash2 size={16} />
                        {cleaningInvalid ? '正在清理错误卡片...' : '清理错误卡片'}
                    </button>

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            handleClearAll();
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                        清空项目数据
                    </button>
                </div>
            </div>
        </>
    ) : null;

    const deleteConfirmModal = showDeleteConfirm
        ? ReactDOM.createPortal(
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md"
                onClick={() => setShowDeleteConfirm(null)}
            >
                <div
                    className="glass-strong mx-4 w-[90%] max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="mb-5 flex items-center gap-4">
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">确认删除项目？</h3>
                            <p className="mt-1 text-xs text-gray-500 dark:text-zinc-500">本地文件不会被删除，只会从工作区移除。</p>
                        </div>
                    </div>

                    <p className="mb-6 rounded-lg border border-white/5 bg-white/5 p-3 text-sm leading-relaxed text-gray-700 dark:text-zinc-300">
                        删除后，该项目会从当前工作区消失。如果你之后重新同步本地素材，还可以重新导入回来。
                    </p>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setShowDeleteConfirm(null)}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-white"
                        >
                            取消
                        </button>
                        <button
                            onClick={() => {
                                if (showDeleteConfirm) {
                                    deleteCanvas(showDeleteConfirm);
                                }
                                setShowDeleteConfirm(null);
                                setShowDropdown(false);
                            }}
                            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95"
                        >
                            删除
                        </button>
                    </div>
                </div>
            </div>,
            document.body,
        )
        : null;

    const mergeCandidates = state.canvases.filter(canvas => canvas.id !== activeCanvas?.id);
    const mergeModal = showMergeModal
        ? ReactDOM.createPortal(
            <div
                className="fixed inset-0 z-[101] flex items-center justify-center bg-black/60 backdrop-blur-md"
                onClick={() => !mergingCanvasId && setShowMergeModal(false)}
            >
                <div
                    className="glass-strong mx-4 w-[92%] max-w-lg rounded-2xl border border-white/10 p-5 shadow-2xl"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">合并项目到当前画布</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
                                选择一个项目合并进“{activeProjectName}”，合并完成后原项目会自动删除。
                            </p>
                        </div>
                        <button
                            onClick={() => setShowMergeModal(false)}
                            disabled={!!mergingCanvasId}
                            className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:text-white"
                        >
                            关闭
                        </button>
                    </div>

                    <div className="mt-4 space-y-2">
                        {mergeCandidates.length === 0 ? (
                            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-gray-500 dark:text-zinc-400">
                                当前没有其他项目可合并。
                            </div>
                        ) : (
                            mergeCandidates.map((canvas) => (
                                <button
                                    key={canvas.id}
                                    onClick={() => handleMergeIntoCurrent(canvas.id)}
                                    disabled={!!mergingCanvasId}
                                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <div>
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{canvas.name}</div>
                                        <div className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                                            {canvas.promptNodes.length} 个主卡，{canvas.imageNodes.length} 个子卡
                                        </div>
                                    </div>
                                    <div className="text-xs text-sky-500">
                                        {mergingCanvasId === canvas.id ? '合并中...' : '合并'}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>,
            document.body,
        )
        : null;

    if (isMobile) {
        return (
            <>
                <div id="project-manager-container" className="ios-mobile-project-strip-wrap">
                    <div className="ios-mobile-header-glass ios-mobile-project-strip">
                        <div className="ios-mobile-project-grid">
                            <div className="relative min-w-0">
                                <button
                                id="project-manager-trigger"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    setShowDropdown((prev) => !prev);
                                }}
                                className={`ios-mobile-project-pill ${showDropdown ? 'is-active' : ''}`}
                                aria-label="打开项目列表"
                            >
                                <span className="ios-mobile-project-pill-icon">
                                    <Layers size={18} />
                                </span>
                                <span className="ios-mobile-project-pill-copy">
                                    <span className="ios-mobile-project-pill-label">项目</span>
                                    <span className="ios-mobile-project-pill-value">{activeProjectName}</span>
                                </span>
                            </button>
                                {projectDropdown}
                            </div>

                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onSearch();
                            }}
                            className="ios-mobile-project-pill ios-mobile-project-pill--search"
                            aria-label="打开搜索"
                        >
                            <span className="ios-mobile-project-pill-icon">
                                <Search size={18} />
                            </span>
                            <span className="ios-mobile-project-pill-copy">
                                <span className="ios-mobile-project-pill-label">搜索</span>
                                <span className="ios-mobile-project-pill-value">查找卡片</span>
                            </span>
                        </button>
                    </div>
                </div>
                </div>
                {deleteConfirmModal}
                {mergeModal}
            </>
        );
    }

    return (
        <>
            <div
                id="project-manager-container"
                className={`fixed left-4 z-50 flex flex-col items-center gap-2 select-none transition-all duration-300 ease-out ${isCollapsed ? '-translate-x-full opacity-35 hover:opacity-100' : 'translate-x-0 opacity-100'}`}
                style={{ top: topPosition }}
                onMouseEnter={() => setIsCollapsed(false)}
            >
                <div
                    className={`flex cursor-grab flex-col items-center gap-2 rounded-2xl p-1.5 transition-all duration-300 active:cursor-grabbing ${isDragging ? 'scale-[0.98]' : ''}`}
                    style={{
                        backgroundColor: theme === 'dark' ? '#27272a' : '#ffffff',
                        border: theme === 'dark' ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)',
                        boxShadow: theme === 'dark'
                            ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
                            : '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05)',
                    }}
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                >
                    <div className="flex w-full justify-center py-0.5 opacity-20 hover:opacity-50">
                        <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme === 'dark' ? '#ffffff' : '#000000' }} />
                    </div>

                    <div className="relative">
                        <button
                            id="project-manager-trigger"
                            onClick={(event) => {
                                event.stopPropagation();
                                setShowDropdown((prev) => !prev);
                            }}
                            className={`${desktopIconButtonClass} ${showDropdown ? 'bg-[var(--toolbar-hover)] text-[var(--accent-indigo)]' : ''}`}
                            title={activeProjectName}
                            tabIndex={-1}
                        >
                            <Layers size={20} />
                            <div className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-indigo-500 border ${theme === 'dark' ? 'border-[#27272a]' : 'border-white'}`} />
                        </button>
                        {projectDropdown}
                    </div>

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onSearch();
                        }}
                        className={desktopIconButtonClass}
                        title="搜索提示词"
                        tabIndex={-1}
                    >
                        <Search size={20} />
                    </button>

                    <div className="my-1 h-px w-full" style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onFitToAll();
                        }}
                        className={desktopIconButtonClass}
                        title="缩放到全局"
                        tabIndex={-1}
                    >
                        <Maximize2 size={20} />
                    </button>

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onResetView();
                        }}
                        className={desktopIconButtonClass}
                        title="定位卡组"
                        tabIndex={-1}
                    >
                        <Focus size={20} />
                    </button>

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleGrid();
                        }}
                        className={desktopIconButtonClass}
                        title="显示或隐藏网格"
                        tabIndex={-1}
                    >
                        {showGrid ? <Grid3x3 size={20} /> : <Square size={20} />}
                    </button>

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            onAutoArrange();
                        }}
                        className={desktopIconButtonClass}
                        title="自动整理"
                        tabIndex={-1}
                    >
                        <LayoutDashboard size={20} />
                    </button>

                    <div className="my-1 h-px w-full" style={{ backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }} />

                    <button
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleTheme();
                        }}
                        className={desktopIconButtonClass}
                        title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                        tabIndex={-1}
                    >
                        {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
                    </button>
                </div>
            </div>
            {deleteConfirmModal}
            {mergeModal}
        </>
    );
};

export default ProjectManager;
