import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Canvas, PromptNode, GeneratedImage, AspectRatio, CanvasGroup, CanvasDrawing } from '../types';
import { saveImage, getImage, deleteImage, getAllImages, clearAllImages } from '../services/imageStorage';
import { syncService } from '../services/syncService';
import { fileSystemService } from '../services/fileSystemService';
import { base64ToBlob, safeRevokeBlobUrl } from '../utils/blobUtils';
import { calculateImageHash } from '../utils/imageUtils';

const MAX_CANVASES = 10;

interface CanvasState {
    canvases: Canvas[];
    activeCanvasId: string;
    // History is keyed by canvasId. Each entry has past/future stacks of the *specific canvas content* (Canvas object)
    history: {
        [key: string]: {
            past: Canvas[];
            future: Canvas[];
        }
    };
    // Local File System Support
    fileSystemHandle: FileSystemDirectoryHandle | null;
    folderName: string | null;
    selectedNodeIds: string[];
}

interface CanvasContextType {
    state: CanvasState;
    activeCanvas: Canvas | undefined;
    createCanvas: () => boolean; // Returns false if max reached
    switchCanvas: (id: string) => void;
    deleteCanvas: (id: string) => void;
    renameCanvas: (id: string, newName: string) => void;
    addPromptNode: (node: PromptNode) => void;
    updatePromptNode: (node: PromptNode) => void;
    addImageNodes: (nodes: GeneratedImage[]) => void;
    updatePromptNodePosition: (id: string, pos: { x: number; y: number }, options?: { moveChildren?: boolean; ignoreSelection?: boolean }) => void;
    updateImageNodePosition: (id: string, pos: { x: number; y: number }, options?: { ignoreSelection?: boolean }) => void;
    updateImageNodeDimensions: (id: string, dimensions: string) => void;
    deleteImageNode: (id: string) => void;
    deletePromptNode: (id: string) => void;
    linkNodes: (promptId: string, imageId: string) => void;
    unlinkNodes: (promptId: string, imageId: string) => void;
    clearAllData: () => void;
    canCreateCanvas: boolean;
    undo: () => void;
    redo: () => void;
    pushToHistory: () => void;
    canUndo: boolean;
    canRedo: boolean;
    arrangeAllNodes: () => void; // Auto-layout cards in compact grid
    getNextCardPosition: () => { x: number; y: number }; // Get next available position for new card
    // File System
    connectLocalFolder: () => Promise<void>;
    disconnectLocalFolder: () => void;
    changeLocalFolder: () => Promise<void>;
    refreshLocalFolder: () => Promise<void>;
    isConnectedToLocal: boolean;
    currentFolderName: string | null;
    selectedNodeIds: string[];
    selectNodes: (ids: string[], exclusive?: boolean) => void;
    clearSelection: () => void;
    moveSelectedNodes: (delta: { x: number; y: number }) => void;
    findSmartPosition: (x: number, y: number, width: number, height: number, buffer?: number) => { x: number; y: number };
    findNextGroupPosition: () => { x: number; y: number }; // Grid-based Card Group placement
    addGroup: (group: CanvasGroup) => void;
    removeGroup: (id: string) => void;
    updateGroup: (group: CanvasGroup) => void;
    setNodeTags: (ids: string[], tags: string[]) => void;
    isReady: boolean;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const STORAGE_KEY = 'kk_studio_canvas_state';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const DEFAULT_CANVAS: Canvas = {
    id: 'default',
    name: '项目1',
    promptNodes: [],
    imageNodes: [],
    groups: [] as CanvasGroup[],
    drawings: [] as CanvasDrawing[],
    lastModified: Date.now()
};
const DEFAULT_STATE: CanvasState = {
    canvases: [DEFAULT_CANVAS],
    activeCanvasId: 'default',
    history: { 'default': { past: [], future: [] } },
    fileSystemHandle: null,
    folderName: null,
    selectedNodeIds: []
};

// Helper to strip image URLs and Reference Image data for localStorage
const stripImageUrls = (canvases: Canvas[]): Canvas[] => {
    return canvases.map(c => ({
        ...c,
        imageNodes: c.imageNodes.map(img => ({
            ...img,
            url: '', // Clear URL for localStorage, will be loaded from IndexedDB
            originalUrl: '' // Clear Original URL to save space
        })),
        promptNodes: c.promptNodes.map(pn => ({
            ...pn,
            referenceImages: pn.referenceImages?.map(ref => {
                // [CRITICAL FIX] Keep small reference images in localStorage to prevent data loss on fast refresh
                // 500KB limit (approx 375KB image). Larger images rely on IndexedDB.
                const shouldKeep = ref.data && ref.data.length < 500000;
                return {
                    ...ref,
                    data: shouldKeep ? ref.data : ''
                };
            })
        }))
    }));
};

export const CanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [state, setState] = useState<CanvasState>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed: CanvasState = JSON.parse(stored);

                // 架构迁移 1: 确保 history 存在
                if (!parsed.history) parsed.history = {};
                if (!parsed.selectedNodeIds) parsed.selectedNodeIds = [];

                // 架构迁移 2: 清洗节点数据 (修复旧数据的重叠/功能损坏问题)
                parsed.canvases = parsed.canvases.map(canvas => ({
                    ...canvas,
                    // 修复 Image Nodes
                    imageNodes: (canvas.imageNodes || []).map(img => ({
                        ...img,
                        // 确保新字段存在
                        generationTime: img.generationTime || Date.now(),
                        canvasId: img.canvasId || canvas.id,
                        parentPromptId: img.parentPromptId || 'unknown',
                        prompt: img.prompt || '',
                        dimensions: img.dimensions || "1024x1024", // 默认字符串
                        aspectRatio: img.aspectRatio || AspectRatio.SQUARE,
                        model: img.model || 'imagen-3.0-generate-001' // 回退到默认模型
                    })),
                    // 修复 Prompt Nodes
                    promptNodes: (canvas.promptNodes || []).map(node => ({
                        ...node,
                        referenceImages: node.referenceImages || [],
                        parallelCount: node.parallelCount || 1,
                        // 保留 generating 状态以支持 App.tsx 的自动恢复
                        isGenerating: node.isGenerating || false,
                        error: node.error,
                        tags: node.tags || []
                    })),
                    groups: canvas.groups || [],
                    drawings: canvas.drawings || []
                }));

                return parsed;
            }
        } catch (e) {
            // [CRITICAL FIX] 捕获初始化时的 Stack Overflow 或解析错误
            // 如果本地数据损坏导致崩溃，必须重置并清除 localStorage，防止无限崩溃循环
            console.error('[CanvasProvider] Failed to parse stored state (Resetting):', e);
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (cleanupErr) {
                console.error('[CanvasProvider] Failed to clear localStorage:', cleanupErr);
            }
            return DEFAULT_STATE;
        }
        return DEFAULT_STATE;
    });

    // Load image URLs from IndexedDB AND Restore Folder Handle
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Restore Local Folder Handle (Fix for 0B issue)
                import('../services/storagePreference').then(async ({ getLocalFolderHandle }) => {
                    import('../services/systemLogService').then(async ({ logInfo, logError }) => {
                        try {
                            const handle = await getLocalFolderHandle();
                            if (handle) {
                                // Verify permission before setting state (Cloud/Web requirement)
                                // @ts-ignore
                                const perm = await handle.queryPermission({ mode: 'readwrite' });
                                if (perm === 'granted') {
                                    logInfo('CanvasContext', `已恢复本地文件夹`, `folder: ${handle.name}`);

                                    // [NEW] Load actual project data from disk to ensure sync
                                    // This overrides localStorage state with the true file state
                                    try {
                                        const { fileSystemService } = await import('../services/fileSystemService');
                                        const { canvases, images } = await fileSystemService.loadProjectWithThumbs(handle);

                                        // Hydrate IDB images (Background)
                                        for (const [id, data] of images.entries()) {
                                            if (data.url) saveImage(id, data.url).catch(e => console.warn('Cache failed', e));
                                        }

                                        if (canvases.length > 0) {
                                            setState(prev => ({
                                                ...prev,
                                                canvases: canvases.map(c => ({
                                                    ...c,
                                                    imageNodes: c.imageNodes.map(img => ({
                                                        ...img,
                                                        url: images.get(img.id)?.url || img.url || '',
                                                        originalUrl: images.get(img.id)?.originalUrl || img.originalUrl
                                                    })),
                                                    promptNodes: c.promptNodes.map(pn => ({
                                                        ...pn,
                                                        referenceImages: pn.referenceImages?.map(ref => ({
                                                            ...ref,
                                                        })) || []
                                                    }))
                                                })),
                                                activeCanvasId: canvases[0].id,
                                                fileSystemHandle: handle,
                                                folderName: handle.name
                                            }));
                                        } else {
                                            // Empty project on disk? Just connect.
                                            setState(prev => ({ ...prev, fileSystemHandle: handle, folderName: handle.name }));
                                        }
                                    } catch (err) {
                                        console.error('Failed to load project from restored handle', err);
                                        // Fallback just connect
                                        setState(prev => ({ ...prev, fileSystemHandle: handle, folderName: handle.name }));
                                    }
                                } else {
                                    logInfo('CanvasContext', `本地文件夹权限等待中`, `permission: ${perm}`);
                                }
                                logInfo('CanvasContext', '未找到已保存的本地文件夹', 'no persisted handle found');
                            }
                        } catch (e) {
                            logError('CanvasContext', e, '恢复文件夹句柄失败');
                        }
                    });
                });

                // 2. Load Images from IndexedDB
                const imageMap = await getAllImages();

                // Migrate old images: if localStorage has URLs but IndexedDB doesn't, save them
                // Also migrate Reference Images
                let needsMigration = false;
                const imagesToMigrate: { id: string; url: string }[] = [];

                state.canvases.forEach(c => {
                    // Check generated images
                    c.imageNodes.forEach(img => {
                        if (img.url && img.url.startsWith('data:') && !imageMap.has(img.id)) {
                            imagesToMigrate.push({ id: img.id, url: img.url });
                            needsMigration = true;
                        }
                    });

                    // Check reference images in prompt nodes
                    c.promptNodes.forEach(pn => {
                        if (pn.referenceImages) {
                            pn.referenceImages.forEach(ref => {
                                if (ref.data && !imageMap.has(ref.id)) {
                                    // Reconstruct data URL if needed or just store raw base64 depending on storage format
                                    // referenceImages.data is typically just the base64 string, not full URL
                                    const fullUrl = ref.data.startsWith('data:') ? ref.data : `data:${ref.mimeType};base64,${ref.data}`;
                                    imagesToMigrate.push({ id: ref.id, url: fullUrl });
                                    needsMigration = true;
                                }
                            });
                        }
                    });
                });

                // Save migrated images to IndexedDB
                for (const img of imagesToMigrate) {
                    await saveImage(img.id, img.url);
                    imageMap.set(img.id, img.url);
                }

                if (needsMigration) {
                    console.log(`Migrated ${imagesToMigrate.length} images (generated & references) to IndexedDB`);
                }

                // Update state with images from IndexedDB (or already in state)
                if (imageMap.size > 0) {
                    setState(prev => ({
                        ...prev,
                        canvases: prev.canvases.map(c => ({
                            ...c,
                            imageNodes: c.imageNodes.map(img => {
                                const storedUrl = imageMap.get(img.storageId || img.id);
                                // Prefer cached URL. It might be:
                                // - data:... (base64) -> convert to blob URL for perf
                                // - http(s)/blob:...  -> use as-is (fix for empty url after strip)
                                let displayUrl = img.url || '';
                                if (storedUrl) {
                                    if (storedUrl.startsWith('data:')) {
                                        const blob = base64ToBlob(storedUrl);
                                        displayUrl = URL.createObjectURL(blob);
                                    } else {
                                        displayUrl = storedUrl;
                                    }
                                }
                                return {
                                    ...img,
                                    url: displayUrl, // Use Blob URL
                                    // Hydrate originalUrl from IndexedDB (Local Original Cache)
                                    originalUrl: storedUrl || img.originalUrl
                                };
                            }),
                            // Rehydrate reference images
                            promptNodes: c.promptNodes.map(pn => ({
                                ...pn,
                                referenceImages: pn.referenceImages?.map(ref => {
                                    const storedUrl = imageMap.get(ref.storageId || ref.id);
                                    if (storedUrl) {
                                        let finalData = storedUrl;
                                        let finalMime = ref.mimeType || 'image/png';

                                        // [SELF-HEALING] Detect corrupted double-wrapped URLs (e.g. data:image/png;base64,http...)
                                        // This fixes images that were saved with the previous buggy logic
                                        const corruptedMatch = storedUrl.match(/^data:.*;base64,(http.*|blob:.*)$/);
                                        if (corruptedMatch) {
                                            console.log('[CanvasContext] Recovering corrupted URL:', corruptedMatch[1]);
                                            finalData = corruptedMatch[1];
                                        } else if (storedUrl.startsWith('data:')) {
                                            // Normal Data URL extraction
                                            const matches = storedUrl.match(/^data:(.+);base64,(.+)$/);
                                            if (matches) {
                                                finalMime = matches[1];
                                                // We keep the full URL for the component to render, or just the base64?
                                                // ReferenceThumbnail handles both, but let's keep full URL for consistency if it's valid
                                            }
                                        }

                                        // Accept Data URL, HTTP, Blob, or Raw Base64
                                        if (finalData.startsWith('data:') || finalData.startsWith('http') || finalData.startsWith('blob:') || finalData.length > 20) {
                                            return { ...ref, mimeType: finalMime, data: finalData };
                                        }
                                    }
                                    return ref;
                                }) || []
                            }))
                        }))
                    }));
                }
            } catch (error) {
                console.error('Failed to load images from IndexedDB:', error);
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, []);

    // State Ref for stable access in event listeners
    const stateRef = useRef(state);
    const isLoadingRef = useRef(isLoading);

    useLayoutEffect(() => {
        stateRef.current = state;
        isLoadingRef.current = isLoading;
    }, [state, isLoading]);

    // Persistence Mechanism
    useEffect(() => {
        // 1. Debounced Auto-Save
        if (isLoading) return;

        const saveState = async () => {
            try {
                const stateToSave = {
                    ...state,
                    canvases: stripImageUrls(state.canvases),
                    history: {}
                };
                const jsonStr = JSON.stringify(stateToSave);
                if (jsonStr.length > 4500000) console.warn('Canvas state approaching localStorage quota limit.');
                localStorage.setItem(STORAGE_KEY, jsonStr);

                // [NEW] Auto-save to Local File System if connected
                if (state.fileSystemHandle) {
                    try {
                        // @ts-ignore
                        const projectFile = await state.fileSystemHandle.getFileHandle('project.json', { create: true });
                        // @ts-ignore
                        const writable = await projectFile.createWritable();
                        // Save minimal state (canvases only) to keep project.json clean compatible with other tools
                        await writable.write(JSON.stringify({ canvases: stateToSave.canvases }, null, 2));
                        await writable.close();
                    } catch (e) {
                        // Permission might be lost or handle invalid
                    }
                }

            } catch (error: any) {
                if (error.name === 'QuotaExceededError') console.error('localStorage quota exceeded.');
                else console.error('Failed to save state:', error);
            }
        };

        const timer = setTimeout(saveState, 200);

        return () => clearTimeout(timer);
    }, [state, isLoading]);

    // 2. Stable Safety Save (Unload / Hidden) - Unmounts only once
    useEffect(() => {
        const handleSave = () => {
            if (isLoadingRef.current) return;
            try {
                const currentState = stateRef.current;
                const stateToSave = {
                    ...currentState,
                    canvases: stripImageUrls(currentState.canvases),
                    history: {}
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
            } catch (e) {
                console.error('Failed to save state on unload:', e);
            }
        };

        window.addEventListener('beforeunload', handleSave);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') handleSave();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleSave);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Hydrate Reference Images from IDB (if stripped from localStorage)
    useEffect(() => {
        if (!state.activeCanvasId) return;
        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!currentCanvas) return;

        let hasUpdates = false;
        const updates: { nodeId: string; refs: any[] }[] = [];

        const hydrateRefs = async () => {
            const promises = currentCanvas.promptNodes.map(async (node) => {
                if (!node.referenceImages || node.referenceImages.length === 0) return;

                let nodeUpdated = false;
                const newRefs = await Promise.all(node.referenceImages.map(async (ref) => {
                    // If data is missing (stripped), try to load from IDB
                    if ((!ref.data || ref.data === '') && ref.id) {
                        try {
                            const data = await getImage(ref.id);
                            if (data) {
                                nodeUpdated = true;
                                return { ...ref, data };
                            }
                        } catch (e) {
                            // console.warn('Failed to hydrate ref', ref.id);
                        }
                    }
                    return ref;
                }));

                if (nodeUpdated) {
                    updates.push({ nodeId: node.id, refs: newRefs });
                    hasUpdates = true;
                }
            });

            await Promise.all(promises);

            if (hasUpdates) {
                setState(prev => ({
                    ...prev,
                    canvases: prev.canvases.map(c => c.id === prev.activeCanvasId ? {
                        ...c,
                        promptNodes: c.promptNodes.map(pn => {
                            const update = updates.find(u => u.nodeId === pn.id);
                            return update ? { ...pn, referenceImages: update.refs } : pn;
                        })
                    } : c)
                }));
            }
        };

        // Delay slighty to defer IO
        setTimeout(hydrateRefs, 500);

    }, [state.activeCanvasId]); // Run when canvas changes (or roughly once on load if active ID is set)


    const activeCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
    const canCreateCanvas = state.canvases.length < MAX_CANVASES;

    const createCanvas = useCallback((): boolean => {
        if (state.canvases.length >= MAX_CANVASES) {
            return false; // Max reached
        }

        // Find next available number for "项目X"
        const existingNumbers = state.canvases
            .map(c => {
                const match = c.name.match(/^项目(\d+)$/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter(n => n > 0);
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

        const newCanvas: Canvas = {
            id: generateId(),
            name: `项目${nextNumber}`,
            promptNodes: [],
            imageNodes: [],
            groups: [] as CanvasGroup[],
            drawings: [] as CanvasDrawing[],
            lastModified: Date.now()
        };
        setState(prev => ({
            ...prev,
            canvases: [...prev.canvases, newCanvas],
            activeCanvasId: newCanvas.id
        }));
        return true;
    }, [state.canvases.length, state.canvases]);

    const switchCanvas = useCallback((id: string) => {
        setState(prev => ({ ...prev, activeCanvasId: id }));
    }, []);

    const renameCanvas = useCallback((id: string, newName: string) => {
        setState(prev => ({
            ...prev,
            canvases: prev.canvases.map(c =>
                c.id === id ? { ...c, name: newName.trim() || c.name } : c
            )
        }));
    }, []);

    const deleteCanvas = useCallback((id: string) => {
        setState(prev => {
            if (prev.canvases.length <= 1) return prev; // Cannot delete last one
            const newCanvases = prev.canvases.filter(c => c.id !== id);
            const newActiveId = prev.activeCanvasId === id ? newCanvases[0].id : prev.activeCanvasId;
            return {
                canvases: newCanvases,
                activeCanvasId: newActiveId,
                history: prev.history,
                fileSystemHandle: prev.fileSystemHandle,
                folderName: prev.folderName,
                selectedNodeIds: []
            };
        });
    }, []);

    const updateCanvas = useCallback((updater: (canvas: Canvas) => Canvas) => {
        setState(prev => ({
            ...prev,
            canvases: prev.canvases.map(c =>
                c.id === prev.activeCanvasId ? { ...updater(c), lastModified: Date.now() } : c
            ),
            // Maintain existing history structure when updating canvas content
            history: prev.history
        }));
    }, []);

    const addPromptNode = useCallback((node: PromptNode) => {
        // Save reference images to IndexedDB
        if (node.referenceImages) {
            node.referenceImages.forEach(ref => {
                if (ref.data) {
                    const mime = ref.mimeType || 'image/png';
                    let fullUrl = ref.data;
                    if (!fullUrl.startsWith('data:') && !fullUrl.startsWith('blob:') && !fullUrl.startsWith('http')) {
                        fullUrl = `data:${mime};base64,${ref.data}`;
                    }
                    saveImage(ref.id, fullUrl);
                }
            });
        }
        updateCanvas(c => ({
            ...c,
            promptNodes: [...c.promptNodes, node]
        }));
    }, [updateCanvas]);

    const pushToHistory = useCallback(() => {
        const current = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!current) return;

        setState(prev => {
            const historyEntry = prev.history[prev.activeCanvasId] || { past: [], future: [] };
            const newPast = [...historyEntry.past, current]; // Push current state to past

            // Limit history depth
            if (newPast.length > 20) newPast.shift();

            return {
                ...prev,
                history: {
                    ...prev.history,
                    [prev.activeCanvasId]: {
                        past: newPast,
                        future: [] // Clear future on new action
                    }
                }
            };
        });
    }, [state.activeCanvasId, state.canvases]);

    const updatePromptNode = useCallback((node: PromptNode) => {
        // Save reference images to IndexedDB
        if (node.referenceImages) {
            node.referenceImages.forEach(ref => {
                if (ref.data) {
                    const mime = ref.mimeType || 'image/png';
                    let fullUrl = ref.data;
                    if (!fullUrl.startsWith('data:') && !fullUrl.startsWith('blob:') && !fullUrl.startsWith('http')) {
                        fullUrl = `data:${mime};base64,${ref.data}`;
                    }
                    saveImage(ref.id, fullUrl);
                }
            });
        }
        updateCanvas(c => ({
            ...c,
            promptNodes: c.promptNodes.map(n => n.id === node.id ? node : n)
        }));
    }, [updateCanvas]);

    const addImageNodes = useCallback(async (nodes: GeneratedImage[]) => {
        // Defensive check: filter out any invalid nodes
        const validNodes = Array.isArray(nodes) ? nodes.filter(n => n && n.id && n.url) : [];
        if (validNodes.length === 0) {
            console.warn('addImageNodes called with no valid nodes');
            return;
        }

        // Process Nodes: Create Blob URLs for State, Keep Base64 for Persistence
        const stateNodes: GeneratedImage[] = [];
        const persistenceTasks: Promise<void>[] = [];

        for (const node of validNodes) {
            let displayUrl = node.url;
            // If Base64, convert to Blob URL for optimized rendering
            if (node.url.startsWith('data:')) {
                try {
                    const blob = base64ToBlob(node.url);
                    displayUrl = URL.createObjectURL(blob);
                } catch (e) {
                    console.error('Failed to create Blob URL', e);
                }
            }

            stateNodes.push({ ...node, url: displayUrl });

            // Persistence: Save ORIGINAL (Base64) to IndexedDB
            persistenceTasks.push((async () => {
                try {
                    // A. IndexedDB (Fast Cache) - Save ORIGINAL URL (Base64)
                    await saveImage(node.storageId || node.id, node.url);

                    // B. File System (Persistent Disk)
                    if (state.fileSystemHandle) {
                        try {
                            const res = await fetch(node.url); // works with data: or blob:
                            const blob = await res.blob();
                            await fileSystemService.saveImageToHandle(state.fileSystemHandle, node.storageId || node.id, blob);
                        } catch (e) {
                            console.warn(`[CanvasContext] Failed to save image ${node.id} to disk`, e);
                        }
                    }
                } catch (e) {
                    console.error(`[CanvasContext] Failed to save image ${node.id}`, e);
                }
            })());
        }

        // 1. Optimistic Update: Add to State immediately (using Blob URLs)
        updateCanvas(c => ({
            ...c,
            imageNodes: [...c.imageNodes, ...stateNodes]
        }));

        // 2. Execute Persistence in Background
        await Promise.all(persistenceTasks);
    }, [updateCanvas]);

    const updatePromptNodePosition = useCallback((
        id: string,
        pos: { x: number; y: number },
        options?: { moveChildren?: boolean; ignoreSelection?: boolean }
    ) => {
        updateCanvas(c => {
            const node = c.promptNodes.find(n => n.id === id);
            if (!node) return c;

            const dx = pos.x - node.position.x;
            const dy = pos.y - node.position.y;
            const moveChildren = options?.moveChildren !== false;
            const ignoreSelection = options?.ignoreSelection === true;

            // GROUP MOVE LOGIC
            if (!ignoreSelection) {
                const selectedIds = new Set(state.selectedNodeIds || []);
                if (selectedIds.has(id)) {
                    const newPromptNodes = c.promptNodes.map(n => {
                        if (selectedIds.has(n.id)) {
                            return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
                        }
                        return n;
                    });

                    const movedPromptIds = new Set(c.promptNodes.filter(n => selectedIds.has(n.id)).map(n => n.id));
                    const newImageNodes = c.imageNodes.map(img => {
                        if (selectedIds.has(img.id) || (img.parentPromptId && movedPromptIds.has(img.parentPromptId))) {
                            return { ...img, position: { x: img.position.x + dx, y: img.position.y + dy } };
                        }
                        return img;
                    });

                    return { ...c, promptNodes: newPromptNodes, imageNodes: newImageNodes };
                }
            }

            if (!moveChildren) {
                return {
                    ...c,
                    promptNodes: c.promptNodes.map(n => n.id === id ? { ...n, position: pos } : n)
                };
            }

            // SINGLE MOVE LOGIC
            const newImageNodes = c.imageNodes.map(img => {
                if (img.parentPromptId === id) {
                    return {
                        ...img,
                        position: {
                            x: img.position.x + dx,
                            y: img.position.y + dy
                        }
                    };
                }
                return img;
            });

            return {
                ...c,
                promptNodes: c.promptNodes.map(n => n.id === id ? { ...n, position: pos } : n),
                imageNodes: newImageNodes
            };
        });
    }, [updateCanvas, state.selectedNodeIds]);

    const updateImageNodePosition = useCallback((
        id: string,
        pos: { x: number; y: number },
        options?: { ignoreSelection?: boolean }
    ) => {
        updateCanvas(c => {
            const node = c.imageNodes.find(n => n.id === id);
            if (!node) return c;

            const dx = pos.x - node.position.x;
            const dy = pos.y - node.position.y;
            const ignoreSelection = options?.ignoreSelection === true;

            // GROUP MOVE LOGIC
            if (!ignoreSelection) {
                const selectedIds = new Set(state.selectedNodeIds || []);
                if (selectedIds.has(id)) {
                    const newPromptNodes = c.promptNodes.map(n => {
                        if (selectedIds.has(n.id)) {
                            return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
                        }
                        return n;
                    });

                    const movedPromptIds = new Set(c.promptNodes.filter(n => selectedIds.has(n.id)).map(n => n.id));
                    const newImageNodes = c.imageNodes.map(img => {
                        if (selectedIds.has(img.id) || (img.parentPromptId && movedPromptIds.has(img.parentPromptId))) {
                            return { ...img, position: { x: img.position.x + dx, y: img.position.y + dy } };
                        }
                        return img;
                    });

                    return { ...c, promptNodes: newPromptNodes, imageNodes: newImageNodes };
                }
            }

            return {
                ...c,
                imageNodes: c.imageNodes.map(img =>
                    img.id === id ? { ...img, position: pos } : img
                )
            };
        });
    }, [updateCanvas, state.selectedNodeIds]);

    const updateImageNodeDimensions = useCallback((id: string, dimensions: string) => {
        updateCanvas(c => ({
            ...c,
            imageNodes: c.imageNodes.map(img =>
                img.id === id ? { ...img, dimensions } : img
            )
        }));
    }, [updateCanvas]);

    const deleteImageNode = useCallback((id: string) => {
        pushToHistory();
        // Delete from IndexedDB
        deleteImage(id);

        updateCanvas(c => {
            // Revoke Blob URL to free memory
            const node = c.imageNodes.find(n => n.id === id);
            if (node) {
                safeRevokeBlobUrl(node.url);
            }
            return {
                ...c,
                imageNodes: c.imageNodes.filter(n => n.id !== id),
                // Also update parent prompt node to remove from child list
                promptNodes: c.promptNodes.map(p => ({
                    ...p,
                    childImageIds: p.childImageIds.filter(cid => cid !== id)
                }))
            };
        });
    }, [updateCanvas]);

    const deletePromptNode = useCallback((id: string) => {
        pushToHistory();

        // 核心修改: 仅删除提示词卡片，保留子图片 (除非是框选删除逻辑在外部处理)
        // 子图片变为 "游离" 状态 (parentPromptId = undefined)

        updateCanvas(c => ({
            ...c,
            promptNodes: c.promptNodes.filter(n => n.id !== id),
            imageNodes: c.imageNodes.map(img =>
                img.parentPromptId === id ? { ...img, parentPromptId: '' } : img
            )
        }));
    }, [updateCanvas, pushToHistory]);

    const linkNodes = useCallback((promptId: string, imageId: string) => {
        updateCanvas(c => {
            // Avoid duplicates
            const promptNode = c.promptNodes.find(p => p.id === promptId);
            if (!promptNode || promptNode.childImageIds.includes(imageId)) return c;

            return {
                ...c,
                promptNodes: c.promptNodes.map(p =>
                    p.id === promptId ? { ...p, childImageIds: [...p.childImageIds, imageId] } : p
                ),
                imageNodes: c.imageNodes.map(img =>
                    img.id === imageId ? { ...img, parentPromptId: promptId } : img
                )
            };
        });
    }, [updateCanvas]);

    const unlinkNodes = useCallback((promptId: string, imageId: string) => {
        updateCanvas(c => {
            return {
                ...c,
                promptNodes: c.promptNodes.map(p =>
                    p.id === promptId ? { ...p, childImageIds: p.childImageIds.filter(id => id !== imageId) } : p
                ),
                imageNodes: c.imageNodes.map(img =>
                    img.id === imageId ? { ...img, parentPromptId: '' } : img
                )
            };
        });
    }, [updateCanvas]);


    const undo = useCallback(() => {
        setState(prev => {
            const currentCanvas = prev.canvases.find(c => c.id === prev.activeCanvasId);
            const historyEntry = prev.history[prev.activeCanvasId];

            if (!currentCanvas || !historyEntry || historyEntry.past.length === 0) return prev;

            const previousState = historyEntry.past[historyEntry.past.length - 1];
            const newPast = historyEntry.past.slice(0, -1);

            return {
                ...prev,
                canvases: prev.canvases.map(c =>
                    c.id === prev.activeCanvasId ? { ...previousState, lastModified: Date.now() } : c
                ),
                history: {
                    ...prev.history,
                    [prev.activeCanvasId]: {
                        past: newPast,
                        future: [currentCanvas, ...historyEntry.future]
                    }
                }
            };
        });
    }, []);

    const redo = useCallback(() => {
        setState(prev => {
            const currentCanvas = prev.canvases.find(c => c.id === prev.activeCanvasId);
            const historyEntry = prev.history[prev.activeCanvasId];

            if (!currentCanvas || !historyEntry || historyEntry.future.length === 0) return prev;

            const nextState = historyEntry.future[0];
            const newFuture = historyEntry.future.slice(1);

            return {
                ...prev,
                canvases: prev.canvases.map(c =>
                    c.id === prev.activeCanvasId ? { ...nextState, lastModified: Date.now() } : c
                ),
                history: {
                    ...prev.history,
                    [prev.activeCanvasId]: {
                        past: [...historyEntry.past, currentCanvas],
                        future: newFuture
                    }
                }
            };
        });
    }, []);

    const canUndo = (state.history[state.activeCanvasId]?.past.length || 0) > 0;
    const canRedo = (state.history[state.activeCanvasId]?.future.length || 0) > 0;

    const clearAllData = useCallback(() => {
        // [Optimization] Revoke all Blob URLs to free memory
        state.canvases.forEach(c => {
            c.imageNodes.forEach(img => {
                safeRevokeBlobUrl(img.url);
            });
        });

        // Clear localStorage
        localStorage.removeItem(STORAGE_KEY);
        // Clear IndexedDB images
        clearAllImages();
        // Reset to default state
        setState({
            canvases: [DEFAULT_CANVAS],
            activeCanvasId: DEFAULT_CANVAS.id,
            history: {},
            fileSystemHandle: null,
            folderName: null,
            selectedNodeIds: []
        });
    }, [state.canvases]);

    /**
     * Arrange all nodes: Group by project (prompt + child images)
     * - Each project: prompt on top, images below (vertical)
     * - Projects arranged left-to-right (horizontal)
     * - No overlapping
     */
    const arrangeAllNodes = useCallback(() => {
        pushToHistory(); // Allow undo

        // --- Configuration ---
        const PROMPT_WIDTH = 320;
        const PROMPT_HEIGHT = 160; // Base height, dynamic in reality but fixed for grid slot
        const GAP_X = 60;  // Horizontal gap between branches
        const GAP_Y = 80;  // Vertical gap between levels
        const IMAGE_GAP = 20; // Gap between sibling images

        // --- Helper: Get dimensions ---
        const getImageDims = (aspectRatio?: string, dimensions?: string) => {
            if (dimensions) {
                const [w, h] = dimensions.split('x').map(Number);
                if (w && h) {
                    const ratio = w / h;
                    const cardWidth = ratio > 1 ? 320 : (ratio < 1 ? 200 : 280);
                    const imageHeight = (cardWidth / ratio) + 40;
                    return { w: cardWidth, h: imageHeight };
                }
            }
            switch (aspectRatio) {
                case '16:9': return { w: 320, h: 220 };
                case '9:16': return { w: 200, h: 395 };
                case '1:1':
                default: return { w: 280, h: 320 };
            }
        };

        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!currentCanvas) return;

        // --- SCOPED ARRANGE: Selected Nodes Only (Smart Layout) ---
        const initialSelectedIds = state.selectedNodeIds || [];

        // [NEW] Expand Group Selection: If a group is selected, arrange its children
        let selectedIds = [...initialSelectedIds];
        const groups = currentCanvas.groups || [];
        const selectedGroups = groups.filter(g => initialSelectedIds.includes(g.id));

        if (selectedGroups.length > 0) {
            selectedGroups.forEach(g => {
                if (g.nodeIds && g.nodeIds.length > 0) {
                    selectedIds.push(...g.nodeIds);
                }
            });
            // Deduplicate and remove Group IDs (they are not actual node IDs)
            const groupIdSet = new Set(groups.map(g => g.id));
            selectedIds = Array.from(new Set(selectedIds)).filter(id => !groupIdSet.has(id));
        }

        if (selectedIds.length > 0) {
            {
                // 1. Analyze Selection Composition
                const selectedPrompts = currentCanvas.promptNodes.filter(p => selectedIds.includes(p.id));
                const selectedImages = currentCanvas.imageNodes.filter(img => selectedIds.includes(img.id));

                const isPromptOnly = selectedPrompts.length > 0 && selectedImages.length === 0;
                const isImageOnly = selectedPrompts.length === 0 && selectedImages.length > 0;

                // 2. Identify Roots & Sync Mode
                let roots: any[] = [];
                let syncChildren = false;

                if (isPromptOnly) {
                    // [MODE A] Prompt Only: Sort Prompts independent of children
                    roots = selectedPrompts.map(p => ({
                        id: p.id, type: 'prompt', obj: p,
                        x: p.position.x, y: p.position.y,
                        width: PROMPT_WIDTH, height: p.height || 200,
                        visualCx: p.position.x, visualCy: p.position.y - (p.height || 200) / 2
                    }));
                    syncChildren = false;
                }
                else if (isImageOnly) {
                    // [MODE B] Image Only: Sort Images independent of parents
                    roots = selectedImages.map(img => {
                        const dims = getImageDims(img.aspectRatio, img.dimensions);
                        return {
                            id: img.id, type: 'image', obj: img,
                            x: img.position.x, y: img.position.y,
                            width: dims.w, height: dims.h,
                            visualCx: img.position.x, visualCy: img.position.y - dims.h / 2
                        };
                    });
                    syncChildren = false;
                }
                else {
                    // [MODE C] Mixed/Group: Use Group Logic
                    syncChildren = true;
                    const uniqueRootsMap = new Map<string, { id: string, type: 'prompt' | 'image', obj: any }>();
                    const getPrompt = (id: string) => currentCanvas.promptNodes.find(p => p.id === id);
                    const getImage = (id: string) => currentCanvas.imageNodes.find(img => img.id === id);

                    selectedIds.forEach(id => {
                        const p = getPrompt(id);
                        if (p) {
                            uniqueRootsMap.set(p.id, { id: p.id, type: 'prompt', obj: p });
                            return;
                        }
                        const img = getImage(id);
                        if (img) {
                            if (img.parentPromptId) {
                                const parent = getPrompt(img.parentPromptId);
                                if (parent) uniqueRootsMap.set(parent.id, { id: parent.id, type: 'prompt', obj: parent });
                                else uniqueRootsMap.set(img.id, { id: img.id, type: 'image', obj: img });
                            } else {
                                uniqueRootsMap.set(img.id, { id: img.id, type: 'image', obj: img });
                            }
                        }
                    });

                    roots = Array.from(uniqueRootsMap.values()).map(r => {
                        const node = r.obj;
                        const width = r.type === 'prompt' ? PROMPT_WIDTH : getImageDims(node.aspectRatio, node.dimensions).w;
                        const height = r.type === 'prompt' ? (node.height || 200) : getImageDims(node.aspectRatio, node.dimensions).h;
                        return {
                            ...r,
                            x: node.position.x, y: node.position.y,
                            width, height,
                            visualCx: node.position.x, visualCy: node.position.y - height / 2,
                        };
                    });
                }

                if (roots.length >= 2) {
                    // 2. Decide Strategy
                    let strategy: 'matrix' | 'row' | 'column' = 'row';
                    const GAP = 40; // Group Gap

                    if (roots.length >= 4) {
                        strategy = 'matrix';
                    } else {
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        roots.forEach(r => {
                            minX = Math.min(minX, r.x);
                            maxX = Math.max(maxX, r.x);
                            minY = Math.min(minY, r.y);
                            maxY = Math.max(maxY, r.y);
                        });
                        if ((maxY - minY) > (maxX - minX) * 1.5) { // Bias towards row unless clearly column
                            strategy = 'column';
                        }
                    }

                    // 3. Arrange
                    const newPositions: Record<string, { x: number, y: number }> = {};

                    if (strategy === 'matrix') {
                        // Grid Sort: Rough Row-Major
                        roots.sort((a, b) => {
                            if (Math.abs(a.visualCy - b.visualCy) > 200) return a.visualCy - b.visualCy;
                            return a.visualCx - b.visualCx;
                        });

                        // Determine Grid Dimensions
                        const columns = Math.ceil(Math.sqrt(roots.length));
                        // Center around average center
                        const avgX = roots.reduce((s, r) => s + r.x, 0) / roots.length;
                        const avgY = roots.reduce((s, r) => s + r.y, 0) / roots.length;

                        // Calculate grid total size
                        const maxW = Math.max(...roots.map(r => r.width));
                        const maxH = Math.max(...roots.map(r => r.height));
                        const CELL_W = maxW + GAP;
                        const CELL_H = maxH + GAP;

                        const gridW = columns * CELL_W;
                        const rows = Math.ceil(roots.length / columns);
                        const gridH = rows * CELL_H;

                        const startX = avgX - gridW / 2 + CELL_W / 2; // + Half cell because anchor is center
                        const startY = avgY - gridH / 2 + CELL_H; // + Full cell H because anchor is bottom

                        roots.forEach((r, i) => {
                            const col = i % columns;
                            const row = Math.floor(i / columns);
                            newPositions[r.id] = {
                                x: startX + col * CELL_W,
                                y: startY + row * CELL_H
                            };
                        });

                    } else if (strategy === 'column') {
                        // Sort Top->Bottom
                        roots.sort((a, b) => a.visualCy - b.visualCy);
                        const avgX = roots.reduce((s, r) => s + r.x, 0) / roots.length;

                        // Start Y = Top-most Top + First Height
                        const topY = Math.min(...roots.map(r => r.visualCy - r.height / 2));
                        let currentY = topY;

                        roots.forEach((r) => {
                            currentY += r.height; // Bottom Anchor
                            newPositions[r.id] = { x: avgX, y: currentY };
                            currentY += GAP;
                        });

                    } else {
                        // Row (Default) - Sort Left->Right
                        roots.sort((a, b) => a.visualCx - b.visualCx);
                        // Align Centers Vertically
                        const avgCy = roots.reduce((s, r) => s + r.visualCy, 0) / roots.length;

                        let currentLeft = Math.min(...roots.map(r => r.visualCx - r.width / 2));

                        roots.forEach((r) => {
                            const newX = currentLeft + r.width / 2;
                            newPositions[r.id] = { x: newX, y: avgCy + r.height / 2 };
                            currentLeft += r.width + GAP;
                        });
                    }

                    // 4. Apply & Sync Children
                    const newCanvases = state.canvases.map(c => {
                        if (c.id !== state.activeCanvasId) return c;

                        const getRootDelta = (rid: string) => {
                            const target = newPositions[rid];
                            const original = roots.find(r => r.id === rid);
                            if (!target || !original) return { x: 0, y: 0 };
                            return { x: target.x - original.x, y: target.y - original.y };
                        };

                        return {
                            ...c,
                            promptNodes: c.promptNodes.map(pn => newPositions[pn.id] ? { ...pn, position: newPositions[pn.id] } : pn),
                            imageNodes: c.imageNodes.map(img => {
                                // If it's a Root
                                if (newPositions[img.id]) return { ...img, position: newPositions[img.id] };
                                // If it's a Child of a Root (Only if Sync Enabled)
                                if (syncChildren && img.parentPromptId && newPositions[img.parentPromptId]) {
                                    const delta = getRootDelta(img.parentPromptId);
                                    return { ...img, position: { x: img.position.x + delta.x, y: img.position.y + delta.y } };
                                }
                                return img;
                            }),
                            lastModified: Date.now()
                        };
                    });

                    setState(prev => ({ ...prev, canvases: newCanvases }));
                    return;
                }
            }

            // Filter selected nodes
            const selectedPrompts = currentCanvas.promptNodes.filter(p => selectedIds.includes(p.id));
            const selectedImages = currentCanvas.imageNodes.filter(img => selectedIds.includes(img.id));
            const selectedCount = selectedPrompts.length + selectedImages.length;

            if (selectedCount > 1) {
                // 1. Prepare data with visual dimensions and centers
                // Card Anchor is Bottom-Center (x, y). 
                // Visual Center Y = y - height / 2.
                const allSelected = [
                    ...selectedPrompts.map(p => ({
                        id: p.id,
                        type: 'prompt',
                        obj: p,
                        x: p.position.x,
                        y: p.position.y,
                        width: PROMPT_WIDTH,
                        height: p.height || 200, // Use tracked height or fallback
                        visualCy: p.position.y - (p.height || 200) / 2
                    })),
                    ...selectedImages.map(img => {
                        const dims = getImageDims(img.aspectRatio, img.dimensions);
                        return {
                            id: img.id,
                            type: 'image',
                            obj: img,
                            x: img.position.x,
                            y: img.position.y,
                            width: dims.w,
                            height: dims.h,
                            visualCy: img.position.y - dims.h / 2
                        };
                    })
                ];

                // 2. Sort by current X to maintain relative left-to-right order
                allSelected.sort((a, b) => a.x - b.x);

                // 3. Calculate Visual Vertical Center Line (Average of visual centers)
                const avgVisualCy = allSelected.reduce((sum, n) => sum + n.visualCy, 0) / allSelected.length;

                // 4. Distribute Horizontally with Fixed Gap
                const DISTRIBUTION_GAP = 40; // Fixed distance requested by user

                // Start X: Keep the group centered around the same visual center X? 
                // Or start from the leftmost item's X? 
                // Let's preserve the "Leftmost Edge" of the group to avoid jumping too much.
                // Leftmost Edge = allSelected[0].x - allSelected[0].width / 2
                let currentLeftEdge = allSelected[0].x - allSelected[0].width / 2;

                const newPositions: Record<string, { x: number, y: number }> = {};
                const movedPrompts = new Set<string>();

                // Calculate new positions for SELECTED nodes
                allSelected.forEach((node) => {
                    // Horizontal: Place based on accumulated width
                    // Node Center X = currentLeftEdge + node.width / 2
                    const newX = currentLeftEdge + node.width / 2;

                    // Vertical: Align Visual Center
                    // New Bottom Y = avgVisualCy + height / 2
                    const newY = avgVisualCy + node.height / 2;

                    newPositions[node.id] = { x: newX, y: newY };

                    // Advance X cursor
                    currentLeftEdge += node.width + DISTRIBUTION_GAP;

                    // Track prompt moves to sync children later
                    if (node.type === 'prompt') movedPrompts.add(node.id);
                });

                // 5. Apply updates & Handle Implicit Child Movement
                // If a prompt moved, its unselected child images should move with it.
                const newCanvases = state.canvases.map(c => {
                    if (c.id !== state.activeCanvasId) return c;

                    // Helper to get delta for a specific prompt
                    const getPromptDelta = (pid: string) => {
                        if (!newPositions[pid]) return { x: 0, y: 0 };
                        // Find original pos
                        const original = allSelected.find(s => s.id === pid);
                        if (!original) return { x: 0, y: 0 };
                        return {
                            x: newPositions[pid].x - original.x,
                            y: newPositions[pid].y - original.y
                        };
                    };

                    return {
                        ...c,
                        promptNodes: c.promptNodes.map(pn => newPositions[pn.id] ? { ...pn, position: newPositions[pn.id] } : pn),
                        imageNodes: c.imageNodes.map(img => {
                            // Case 1: Image is explicitly selected and arranged
                            if (newPositions[img.id]) {
                                return { ...img, position: newPositions[img.id] };
                            }
                            // Case 2: Image is NOT selected, but its Parent Prompt moved
                            if (img.parentPromptId && movedPrompts.has(img.parentPromptId)) {
                                // Sync move
                                const delta = getPromptDelta(img.parentPromptId);
                                if (delta.x !== 0 || delta.y !== 0) {
                                    return {
                                        ...img,
                                        position: {
                                            x: img.position.x + delta.x,
                                            y: img.position.y + delta.y
                                        }
                                    };
                                }
                            }
                            return img;
                        }),
                        lastModified: Date.now()
                    };
                });

                setState(prev => ({ ...prev, canvases: newCanvases }));
                return;
            }
        }

        // --- 1. Build Data Structures (Original Full Layout) ---
        const errorPrompts = currentCanvas.promptNodes.filter(p => p.error);
        const errorPromptIds = new Set(errorPrompts.map(p => p.id));
        const normalPrompts = currentCanvas.promptNodes.filter(p => !errorPromptIds.has(p.id));
        const normalImages = currentCanvas.imageNodes.filter(img => !img.parentPromptId || !errorPromptIds.has(img.parentPromptId));

        const promptMap = new Map(normalPrompts.map(n => [n.id, n]));
        const imageMap = new Map(normalImages.map(n => [n.id, n]));

        // Track visited to prevent infinite loops (though DAG is expected)
        const visited = new Set<string>();

        // Tree Node Definition
        interface TreeNode {
            id: string;
            type: 'prompt' | 'image';
            width: number;
            height: number;
            children: TreeNode[]; // Images have Prompt children (follow-ups), Prompts have Image children
            subtreeWidth: number;
            x?: number;
            y?: number;
        }

        // Recursive Build
        const buildTree = (nodeId: string, type: 'prompt' | 'image'): TreeNode | null => {
            if (visited.has(nodeId)) return null;
            visited.add(nodeId);

            let node: any;
            let width = 0;
            let height = 0;
            let childrenIds: string[] = [];
            let childType: 'prompt' | 'image';

            if (type === 'prompt') {
                node = promptMap.get(nodeId);
                if (!node) return null;
                width = PROMPT_WIDTH;
                height = node.height || 200; // Use actual height if available
                // Children are Images created by this prompt
                childrenIds = normalImages
                    .filter(img => img.parentPromptId === nodeId)
                    .map(img => img.id);
                childType = 'image';
            } else {
                node = imageMap.get(nodeId);
                if (!node) return null;
                const dims = getImageDims(node.aspectRatio, node.dimensions);
                width = dims.w;
                height = dims.h;
                // Children are Prompts that use this image as source (Follow-ups)
                childrenIds = normalPrompts
                    .filter(p => p.sourceImageId === nodeId)
                    .map(p => p.id);
                childType = 'prompt';
            }

            const children = childrenIds
                .map(id => buildTree(id, childType))
                .filter((n): n is TreeNode => n !== null);

            return { id: nodeId, type, width, height, children, subtreeWidth: 0 };
        };

        // --- 2. Identify Roots ---
        // Root Prompts: No sourceImageId OR sourceImageId not found
        const rootPrompts = normalPrompts.filter(p =>
            !p.sourceImageId || !imageMap.has(p.sourceImageId)
        );

        // Root Images: No parentPromptId OR parentPromptId not found (Orphans)
        const rootImages = normalImages.filter(img =>
            !img.parentPromptId || !promptMap.has(img.parentPromptId)
        );

        const forest: TreeNode[] = [];
        rootPrompts.forEach(p => {
            const tree = buildTree(p.id, 'prompt');
            if (tree) forest.push(tree);
        });
        rootImages.forEach(img => {
            const tree = buildTree(img.id, 'image');
            if (tree) forest.push(tree);
        });

        // --- 3. Measure Subtrees (Bottom-Up) ---
        // 副卡横向排列，计算子树宽度时需考虑居中对齐
        const measureTree = (node: TreeNode) => {
            if (node.children.length === 0) {
                node.subtreeWidth = node.width;
                return;
            }

            // Measure all children first
            node.children.forEach(measureTree);

            // 计算子节点行的总宽度
            // 如果父节点是 prompt，子节点是 images：使用紧凑间距，横向居中
            // 如果父节点是 image，子节点是 prompts：使用宽间距
            const childGap = node.type === 'prompt' ? IMAGE_GAP : GAP_X;

            const childrenTotalWidth = node.children.reduce((sum, child) => sum + child.subtreeWidth, 0)
                + (node.children.length - 1) * childGap;

            // 子树宽度取父节点宽度和子节点总宽度的较大值
            node.subtreeWidth = Math.max(node.width, childrenTotalWidth);
        };

        forest.forEach(measureTree);

        // --- 4. 布局（自顶向下）---
        // Layout: Top-Down positioning with sub-cards centered under main cards
        const positions: { [id: string]: { x: number; y: number } } = {};

        const layoutTree = (node: TreeNode, x: number, y: number) => {
            // 对于居中锚点的卡片（translate -50%）：
            // X 应该是卡片的视觉中心
            // 分配的子树宽度范围是 [x, x + node.subtreeWidth]
            // 我们希望卡片中心位于此分配区域的中心
            const nodeX = x + node.subtreeWidth / 2;
            positions[node.id] = { x: nodeX, y };

            // 如果没有子节点，无需进一步布局
            if (node.children.length === 0) return;

            // 计算子节点块的总宽度
            const childGap = node.type === 'prompt' ? IMAGE_GAP : GAP_X;
            const childrenBlockWidth = node.children.reduce((sum, c) => sum + c.subtreeWidth, 0)
                + (node.children.length - 1) * childGap;

            // 副卡居中对齐：计算起始X使子节点块在父节点子树中居中
            let currentChildX = x;
            if (childrenBlockWidth < node.subtreeWidth) {
                currentChildX += (node.subtreeWidth - childrenBlockWidth) / 2;
            }

            // 底部锚点卡片（translate -50%, -100%）的Y计算：
            // - node.position.y 是卡片的视觉底部
            // - 子节点的视觉顶部应该在父节点底部 + 间距
            // - 由于子节点也使用底部锚点：child.y = parentBottom + GAP + childHeight
            const baseY = y + GAP_Y;

            node.children.forEach(child => {
                const childY = baseY + child.height;
                layoutTree(child, currentChildX, childY);
                currentChildX += child.subtreeWidth + childGap;
            });
        };

        let currentRootX = 0; // Start from 0 for easier centering calculation
        const baseRootY = 100;

        // First pass: layout from X=0 to calculate total width
        forest.forEach(root => {
            const rootY = baseRootY + root.height;
            layoutTree(root, currentRootX, rootY);
            currentRootX += root.subtreeWidth + 100;
        });

        // Calculate total width and center offset
        const totalWidth = currentRootX - 100; // Remove trailing gap
        const centerOffsetX = -totalWidth / 2; // Canvas uses 0,0 as center

        // Shift all positions to center
        Object.keys(positions).forEach(id => {
            positions[id].x += centerOffsetX;
        });


        // --- 5. Error Prompt Layout (Right of Normal Groups) ---
        if (errorPrompts.length > 0) {
            const errorGapX = 80;
            const errorGapY = 40;
            const errorImageGap = 16;

            let maxRight = 0;
            normalPrompts.forEach(p => {
                const pos = positions[p.id];
                if (!pos) return;
                maxRight = Math.max(maxRight, pos.x + PROMPT_WIDTH / 2);
            });
            normalImages.forEach(img => {
                const pos = positions[img.id];
                if (!pos) return;
                const dims = getImageDims(img.aspectRatio, img.dimensions);
                maxRight = Math.max(maxRight, pos.x + dims.w / 2);
            });
            (currentCanvas.groups || []).forEach(group => {
                maxRight = Math.max(maxRight, group.bounds.x + group.bounds.width);
            });

            const errorStartX = maxRight + errorGapX;
            let cursorY = baseRootY;

            const sortedErrors = [...errorPrompts].sort((a, b) => parseInt(a.id) - parseInt(b.id));
            sortedErrors.forEach(prompt => {
                const promptHeight = prompt.height || PROMPT_HEIGHT;
                const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);
                const imageDims = childImages.map(img => getImageDims(img.aspectRatio, img.dimensions));
                const rowWidth = imageDims.reduce((sum, dim) => sum + dim.w, 0) + Math.max(0, childImages.length - 1) * errorImageGap;
                const rowHeight = imageDims.length > 0 ? Math.max(...imageDims.map(dim => dim.h)) : 0;
                const blockWidth = Math.max(PROMPT_WIDTH, rowWidth);
                const promptToImageGap = childImages.length > 0 ? 20 : 0;

                const promptX = errorStartX + blockWidth / 2;
                const promptBottom = cursorY + promptHeight;
                positions[prompt.id] = { x: promptX, y: promptBottom };

                if (childImages.length > 0) {
                    let imgCursorX = errorStartX + (blockWidth - rowWidth) / 2;
                    const rowTop = cursorY + promptHeight + promptToImageGap;
                    childImages.forEach((img, index) => {
                        const dims = imageDims[index];
                        positions[img.id] = {
                            x: imgCursorX + dims.w / 2,
                            y: rowTop + dims.h
                        };
                        imgCursorX += dims.w + errorImageGap;
                    });
                }

                cursorY += promptHeight + promptToImageGap + rowHeight + errorGapY;
            });
        }

        // --- 6. Apply & Save ---
        const newCanvases = state.canvases.map(c =>
            c.id === state.activeCanvasId ? {
                ...c,
                promptNodes: c.promptNodes.map(pn => ({ ...pn, position: positions[pn.id] || pn.position })),
                imageNodes: c.imageNodes.map(img => ({ ...img, position: positions[img.id] || img.position })),
                lastModified: Date.now()
            } : c
        );

        setState(prev => ({ ...prev, canvases: newCanvases }));

        // Force Save
        if (!state.fileSystemHandle) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    ...state,
                    canvases: stripImageUrls(newCanvases),
                    history: {}
                }));
            } catch (e) {
                console.error('Failed to save layout:', e);
            }
        }

    }, [state]);

    // --- File System Implementation ---

    const connectLocalFolder = useCallback(async () => {
        try {
            let handle: FileSystemDirectoryHandle | null = null;

            // 1. Try Optimized Restore (Permission Prompt instead of Picker)
            try {
                const { restoreLocalFolderConnection } = await import('../services/storagePreference');
                handle = await restoreLocalFolderConnection();
            } catch (ignore) { }

            // 2. Fallback to Full Picker
            if (!handle) {
                handle = await fileSystemService.selectDirectory();
            }

            // [NEW] Migration: Save currently loaded images (Temp) to the new Local Folder
            // This ensures work done in Temp mode is not lost/abandoned when switching
            if (handle) {
                const currentImages = await getAllImages(); // Map<id, base64/url>

                // Helper to save base64/blob to disk
                const saveToDisk = async (id: string, urlOrData: string) => {
                    try {
                        let blob: Blob;
                        if (urlOrData.startsWith('data:')) {
                            const res = await fetch(urlOrData);
                            blob = await res.blob();
                        } else {
                            // It's a blob URL
                            const res = await fetch(urlOrData);
                            blob = await res.blob();
                        }

                        await fileSystemService.saveImageToHandle(handle!, id, blob);
                    } catch (e) {
                        console.warn(`Failed to migrate image ${id} to local folder`, e);
                    }
                };

                // Identify images in current state
                const promises: Promise<void>[] = [];
                state.canvases.forEach(c => {
                    c.imageNodes.forEach(img => {
                        if (img.id) promises.push(saveToDisk(img.id, img.url || currentImages.get(img.id) || ''));
                    });
                    c.promptNodes.forEach(pn => {
                        pn.referenceImages?.forEach(ref => {
                            if (ref.id && ref.data) {
                                const data = ref.data.startsWith('data:') ? ref.data : `data:${ref.mimeType};base64,${ref.data}`;
                                promises.push(saveToDisk(ref.id, data));
                            }
                        });
                    });
                });

                if (promises.length > 0) {
                    await Promise.allSettled(promises);
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const { notify } = await import('../services/notificationService');
                    notify.success('数据迁移', `已将 ${promises.length} 张临时图片保存到本地文件夹`);
                }
            }

            const { canvases, images } = await fileSystemService.loadProjectWithThumbs(handle);

            // Hydrate images map to IndexedDB for performance/caching
            for (const [id, data] of images.entries()) {
                // Determine what to cache: the display URL (thumbnail or original if small)
                const blobUrl = data.url;
                if (blobUrl) {
                    try {
                        const res = await fetch(blobUrl);
                        const blob = await res.blob();
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                            const base64data = reader.result as string;
                            if (base64data) {
                                await saveImage(id, base64data);
                            }
                        };
                        reader.readAsDataURL(blob);
                    } catch (e) {
                        console.error(`Failed to cache image ${id}`, e);
                    }
                }
            }

            // If found existing project in the folder, check if we need to warn user about overwriting current work
            if (canvases.length > 0) {
                // Check if current state has meaningful data
                const hasUnsavedWork = state.canvases.length > 1 ||
                    state.canvases.some(c => c.imageNodes.length > 0 || c.promptNodes.length > 0);

                if (hasUnsavedWork) {
                    const confirmed = window.confirm(
                        `当前工作区包含未保存的数据。\n\n` +
                        `所选文件夹 "${handle.name}" 包含现有的项目。\n` +
                        `打开它将 替换 您当前的工作区。\n\n` +
                        `您确定要继续并覆盖当前工作区吗？`
                    );
                    if (!confirmed) return; // Abort connection
                }

                setState(prev => ({
                    ...prev,
                    canvases: canvases.map(c => ({
                        ...c,
                        // Ensure images have URLs pointed to Blob/IDB
                        imageNodes: c.imageNodes.map(img => {
                            const localData = images.get(img.id);
                            return {
                                ...img,
                                url: localData?.url || img.url || '',
                                originalUrl: localData?.originalUrl || img.originalUrl
                            };
                        }),
                        promptNodes: c.promptNodes.map(pn => ({
                            ...pn,
                            referenceImages: pn.referenceImages?.map(ref => ({
                                ...ref,
                            })) || []
                        }))
                    })),
                    activeCanvasId: canvases[0].id,
                    fileSystemHandle: handle,
                    folderName: handle.name,
                    history: {} // Clear history on new load
                }));
            } else {
                // New folder (empty), just attach handle to current state (Save to Local)
                setState(prev => ({
                    ...prev,
                    fileSystemHandle: handle,
                    folderName: handle.name
                }));
            }

        } catch (error) {
            console.error('Failed to connect local folder:', error);
            // If user likely cancelled, we can ignore. If error, maybe alert?
            // For now console.error is enough as selectDirectory throws AbortError usually
        }
    }, [state.canvases]);

    const disconnectLocalFolder = useCallback(async () => {
        // 1. Ensure all current images are cached in IndexedDB (Data Safety)
        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (currentCanvas) {
            // A. Cache Generated Images
            currentCanvas.imageNodes.forEach(img => {
                if (img.url && !img.url.startsWith('data:')) {
                    fetch(img.url).then(r => r.blob()).then(blob => {
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                            if (reader.result) {
                                const data = reader.result as string;
                                const sid = img.storageId || await calculateImageHash(data);
                                saveImage(sid, data);
                            }
                        };
                        reader.readAsDataURL(blob);
                    }).catch(e => console.warn('Background cache failed', e));
                }
            });

            // B. Cache Reference Images (Fix for missing refs)
            currentCanvas.promptNodes.forEach(pn => {
                pn.referenceImages?.forEach(async ref => {
                    if (ref.data) {
                        // Ensure it's a full data URL for storage
                        const fullUrl = ref.data.startsWith('data:')
                            ? ref.data
                            : `data:${ref.mimeType || 'image/png'};base64,${ref.data}`;
                        const sid = ref.storageId || await calculateImageHash(fullUrl);
                        saveImage(sid, fullUrl).catch(e => console.warn('Ref cache failed', e));
                    }
                });
            });
        }

        // 2. Switch Mode
        setState(prev => ({
            ...prev,
            fileSystemHandle: null,
            folderName: null
        }));

        // 3. Notify
        const { notify } = await import('../services/notificationService');
        notify.success('已切换到临时模式', '项目数据已保留');

    }, [state.canvases, state.activeCanvasId]);

    const changeLocalFolder = useCallback(async () => {
        if (!state.fileSystemHandle) return;

        try {
            // 1. Pick new folder
            const newHandle = await fileSystemService.selectDirectory();
            if (newHandle.name === state.folderName) {
                alert('您选择了同一个文件夹。');
                return;
            }

            // 2. Confirm Migration
            const confirmed = window.confirm(
                `移动项目到 "${newHandle.name}"?\n\n` +
                `这将 移动 (剪切 & 粘贴) 所有文件从 "${state.folderName}" 到新位置。`
            );

            if (!confirmed) return;

            setIsLoading(true);
            try {
                // 3. Perform Move
                await fileSystemService.moveProject(state.fileSystemHandle, newHandle);

                // 4. Update State to new handle
                setState(prev => ({
                    ...prev,
                    fileSystemHandle: newHandle,
                    folderName: newHandle.name
                }));

                alert('项目移动成功！');

            } catch (error: any) {
                alert('迁移失败: ' + error.message);
                console.error(error);
            } finally {
                setIsLoading(false);
            }

        } catch (error) {
            // Cancelled picker
        }
    }, [state.fileSystemHandle, state.folderName]);

    const refreshLocalFolder = useCallback(async () => {
        if (!state.fileSystemHandle) return;
        try {
            const handle = state.fileSystemHandle;
            const { canvases, images } = await fileSystemService.loadProjectWithThumbs(handle);

            // Hydrate images map to IndexedDB
            for (const [id, data] of images.entries()) {
                const blobUrl = data.url;
                if (blobUrl) {
                    try {
                        const res = await fetch(blobUrl);
                        const blob = await res.blob();
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                            const base64data = reader.result as string;
                            if (base64data) {
                                await saveImage(id, base64data);
                            }
                        };
                        reader.readAsDataURL(blob);
                    } catch (e) {
                        console.error(`Failed to cache image ${id}`, e);
                    }
                }
            }

            // Reload state only if changed
            if (canvases.length > 0) {
                setState(prev => {
                    // Simple check: Compare lastModified of active canvas (simplified sync)
                    // Ideally we check all, but for now let's check the first/active one.

                    const newCanvas = canvases[0];
                    const currentCanvas = prev.canvases.find(c => c.id === newCanvas.id);

                    // If timestamps are close (within 2s) and item counts match, skip update to prevent flash
                    // Note: fileSystemService might not set exact lastModified from file stats, 
                    // dependent on how loadProject works.
                    // Let's implement a deeper equality check or just check node counts for now.

                    if (currentCanvas) {
                        const countMatch = currentCanvas.promptNodes.length === newCanvas.promptNodes.length &&
                            currentCanvas.imageNodes.length === newCanvas.imageNodes.length;

                        // If counts match, assume no external change for now to stop flashing. 
                        // [FIX] Strict Timestamp Check: If local state is newer than disk, DO NOT OVERWRITE.
                        // allow 2s margin for FS precision issues.
                        if (currentCanvas) {
                            // If local is "dirtier" (newer) than incoming, skip refresh
                            if (currentCanvas.lastModified > newCanvas.lastModified + 2000) {
                                return prev;
                            }

                            const countMatch = currentCanvas.promptNodes.length === newCanvas.promptNodes.length &&
                                currentCanvas.imageNodes.length === newCanvas.imageNodes.length;

                            if (countMatch && Math.abs(currentCanvas.lastModified - newCanvas.lastModified) < 5000) {
                                return prev;
                            }
                        }
                    }

                    return {
                        ...prev,
                        canvases: canvases.map(c => ({
                            ...c,
                            imageNodes: c.imageNodes.map(img => {
                                const localData = images.get(img.id);
                                return {
                                    ...img,
                                    url: localData?.url || img.url || '',
                                    originalUrl: localData?.originalUrl || img.originalUrl
                                };
                            })
                        }))
                    };
                });
            }
            // Silent refresh success (no alert)
        } catch (error) {
            console.error('Failed to refresh folder:', error);
            // Silent failure
        }
    }, [state.fileSystemHandle]);

    // Auto-Sync: Poll local folder every 5 seconds if connected
    useEffect(() => {
        if (!state.fileSystemHandle) return;
        const interval = setInterval(refreshLocalFolder, 5000);
        return () => clearInterval(interval);
    }, [state.fileSystemHandle, refreshLocalFolder]);

    // Enhanced Persistence (Local Storage + File System)
    useEffect(() => {
        if (isLoading) return;

        const saveState = async () => {
            // 1. Save to LocalStorage (Only if NOT using File System)
            if (!state.fileSystemHandle) {
                try {
                    const stateToSave = {
                        ...state,
                        canvases: stripImageUrls(state.canvases),
                        history: {},
                        fileSystemHandle: undefined,
                        folderName: undefined
                    };
                    const jsonStr = JSON.stringify(stateToSave);
                    if (jsonStr.length > 4500000) console.warn('Canvas state approaching localStorage quota limit.');
                    localStorage.setItem(STORAGE_KEY, jsonStr);
                } catch (e: any) {
                    if (e.name === 'QuotaExceededError') console.error('localStorage quota exceeded.');
                    else console.error('Failed to save state:', e);
                }
            }

            // 2. Save to File System if connected
            if (state.fileSystemHandle) {
                try {
                    // Gather all dirty/needed images
                    const imagesToSave = new Map<string, Blob>();

                    const allImages = new Map<string, string>();
                    state.canvases.forEach(c => {
                        c.imageNodes.forEach(img => {
                            // PRIORITIZE ORIGINAL URL! otherwise we overwrite high-res with thumbnail blob
                            if (img.originalUrl) {
                                allImages.set(img.id, img.originalUrl);
                            } else if (img.url) {
                                allImages.set(img.id, img.url);
                            }
                        });
                    });

                    for (const [id, url] of allImages.entries()) {
                        // Only fetch if it's a blob url (local)
                        if (url.startsWith('blob:') || url.startsWith('data:')) {
                            const res = await fetch(url);
                            const blob = await res.blob();
                            imagesToSave.set(id, blob);
                        }
                    }

                    // Prepare Clean State for JSON
                    const fsState = {
                        canvases: stripImageUrls(state.canvases),
                        version: 1
                    };

                    await fileSystemService.saveProject(state.fileSystemHandle, fsState as any, imagesToSave);

                } catch (error) {
                    console.error('File System Save Failed:', error);
                }
            }
        };

        const timer = setTimeout(saveState, 1000); // 1s debounce for FS operations
        return () => clearTimeout(timer);
    }, [state, isLoading]);


    /**
     * Get the next available position for a new card (to the right of existing cards)
     */
    const selectNodes = useCallback((ids: string[], exclusive = true) => {
        setState(prev => {
            // Toggle logic if not exclusive? No, usually shift-click adds.
            // If exclusive, replace. If not, append unique.
            // Actually, for toggle behavior (click on selected to deselect), the caller usually handles logic or we can add it.
            // But strict "add to selection" is safer for now.
            // Let's support naive "add".
            // If the user wants to toggle, they can pass the new list.
            // Wait, UI usually does: if shift, new = old + clicked. If not, new = clicked.
            // App.tsx handles the logic?
            // "onSelect={() => selectNodes([node.id], !window.event?.shiftKey)}"
            // So if exclusive (no shift), we pass just [id]. If not exclusive (shift), we pass [id].
            // My App.tsx logic: "selectNodes([node.id], !window.event?.shiftKey)"
            // If shift is pressed, exclusive=false.
            // So we need to MERGE `ids` with current.
            // But usually shift-click on ALREADY selected item DESELECTS it.
            // Let's implement smart toggle if exclusive=false && ids.length===1?
            // "selectedNodeIds.includes(node.id)" is passed in props but logic is here.

            if (exclusive) {
                return { ...prev, selectedNodeIds: ids };
            }

            // Additive mode
            const current = new Set(prev.selectedNodeIds || []);
            let modified = false;
            ids.forEach(id => {
                if (current.has(id)) {
                    current.delete(id); // Toggle off
                } else {
                    current.add(id); // Toggle on
                }
                modified = true;
            });

            return modified ? { ...prev, selectedNodeIds: Array.from(current) } : prev;
        });
    }, []);

    const clearSelection = useCallback(() => {
        setState(prev => ({ ...prev, selectedNodeIds: [] }));
    }, []);

    const moveSelectedNodes = useCallback((delta: { x: number; y: number }) => {
        updateCanvas(c => {
            const selectedIds = state.selectedNodeIds || [];
            if (selectedIds.length === 0) return c;

            // Move prompt nodes
            const newPromptNodes = c.promptNodes.map(n => {
                if (selectedIds.includes(n.id)) {
                    return { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } };
                }
                return n;
            });

            // Move image nodes
            // Note: If a prompt node moves, its children effectively move? 
            // `updatePromptNodePosition` moves children. But here we are moving raw positions.
            // If we select a Prompt + its Child Image, and move both...
            // If we blindly move both, they stay relative.
            // If we Select Prompt ONLY, and move it... does child move?
            // In `updatePromptNodePosition` (Line 467), we move children.
            // Here we are updating ALL selected nodes.
            // If I select Prompt, I expect children to move?
            // Current `moveSelectedNodes` logic moves explicitly selected nodes.
            // Behavior: if I select Prompt but NOT image, Image stays? 
            // Ideally: Moving a prompt moves its children.
            // Let's match `updatePromptNodePosition` behavior for selected Prompts.

            const movedPromptIds = new Set(selectedIds.filter(id => c.promptNodes.some(p => p.id === id)));

            const newImageNodes = c.imageNodes.map(n => {
                // If explicitly selected, move it.
                if (selectedIds.includes(n.id)) {
                    return { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } };
                }
                // If parent Prompt was moved, move this image too?
                // `updatePromptNodePosition` does this.
                if (n.parentPromptId && movedPromptIds.has(n.parentPromptId)) {
                    return { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } };
                }
                return n;
            });

            return {
                ...c,
                promptNodes: newPromptNodes,
                imageNodes: newImageNodes
            };
        });
    }, [updateCanvas, state.selectedNodeIds]);

    const getNextCardPosition = useCallback((): { x: number; y: number } => {
        const CARD_WIDTH = 280;
        const CARD_HEIGHT = 320;
        const GAP_X = 20;
        const GAP_Y = 20;
        const MAX_WIDTH = 1600;
        const SLOT_WIDTH = CARD_WIDTH + GAP_X;
        const SLOT_HEIGHT = CARD_HEIGHT + GAP_Y;
        const columnsPerRow = Math.floor(MAX_WIDTH / SLOT_WIDTH);

        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!currentCanvas) return { x: 0, y: 0 };

        const totalCards = currentCanvas.promptNodes.length + currentCanvas.imageNodes.length;
        const col = totalCards % columnsPerRow;
        const row = Math.floor(totalCards / columnsPerRow);

        return { x: col * SLOT_WIDTH, y: row * SLOT_HEIGHT };
    }, [state]);

    /**
     * Find a smart position that doesn't overlap with existing nodes.
     * Starts at target (x,y) and spirals/shifts out until free space found.
     */
    const findSmartPosition = useCallback((targetX: number, targetY: number, width: number, height: number, buffer = 20): { x: number; y: number } => {
        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!currentCanvas) return { x: targetX, y: targetY };

        // Helper: Check collision
        const checkCollision = (cx: number, cy: number) => {
            // Check groups first (Large blocks)
            for (const g of currentCanvas.groups) {
                const gX = g.bounds.x;
                const gY = g.bounds.y;
                const gW = g.bounds.width;
                const gH = g.bounds.height;

                const myX = cx - width / 2; // Anchor Center Helper
                const myY = cy - height;    // Anchor Bottom Helper

                // Check Overlap
                // My: [myX, myY, width, height]
                // Group: [gX, gY, gW, gH]
                if (myX < gX + gW + buffer && myX + width + buffer > gX &&
                    myY < gY + gH + buffer && myY + height + buffer > gY) {
                    return true;
                }
            }

            // Check prompts
            for (const p of currentCanvas.promptNodes) {
                // Approximate prompt dimensions (default width 320, height ~160+)
                // Origin is Bottom Center, but stored pos is card bottom center? 
                // Wait, in `layoutTree`: "nodeX = x + width/2", "positions[node.id] = {x, y}"
                // And App.tsx `getCardDimensions` logic implies stored pos is bottom center?
                // Let's assume standard card calc:
                const pW = 320;
                const pH = 200; // Roughly
                // Rect: [p.x - pW/2, p.y - pH, pW, pH]
                const px = p.position.x - pW / 2;
                const py = p.position.y - pH;

                // My Candidate Rect: [cx - width/2, cy - height, width, height]
                const myX = cx - width / 2;
                const myY = cy - height;

                if (myX < px + pW + buffer && myX + width + buffer > px &&
                    myY < py + pH + buffer && myY + height + buffer > py) {
                    return true;
                }
            }

            // Check images
            for (const img of currentCanvas.imageNodes) {
                // Check dims
                let iW = 280;
                let iH = 320;
                if (img.dimensions) {
                    const [w, h] = img.dimensions.split('x').map(Number);
                    if (w && h) {
                        const ratio = w / h;
                        iW = ratio > 1 ? 320 : (ratio < 1 ? 200 : 280);
                        iH = (iW / ratio) + 40;
                    }
                }
                const ix = img.position.x - iW / 2;
                const iy = img.position.y - iH;

                const myX = cx - width / 2;
                const myY = cy - height;

                if (myX < ix + iW + buffer && myX + width + buffer > ix &&
                    myY < iy + iH + buffer && myY + height + buffer > iy) {
                    return true;
                }
            }

            return false;
        };

        // If no collision at target, return immediately
        if (!checkCollision(targetX, targetY)) return { x: targetX, y: targetY };

        // Simple Shift Strategy: Try moving Down, then Right, then Diagonal
        // Iterating shifts
        const shifts = [
            { dx: 0, dy: height + buffer }, // Down 1 slot
            { dx: width + buffer, dy: 0 },  // Right 1 slot
            { dx: -(width + buffer), dy: 0 }, // Left 1 slot
            { dx: 0, dy: -(height + buffer) }, // Up 1 slot

            { dx: width + buffer, dy: height + buffer }, // Diagonal Right Down
            { dx: -(width + buffer), dy: height + buffer }, // Diagonal Left Down

            { dx: (width + buffer) * 2, dy: 0 }, // Right 2
            { dx: 0, dy: (height + buffer) * 2 }, // Down 2
        ];

        for (const shift of shifts) {
            const sx = targetX + shift.dx;
            const sy = targetY + shift.dy;
            if (!checkCollision(sx, sy)) return { x: sx, y: sy };
        }

        // Fallback: Just put it far below
        return { x: targetX, y: targetY + height + buffer + 100 };
    }, [state]);

    /**
     * 查找下一个卡组的网格位置
     * 规则：优先向右排列，每排30个卡组后换行
     * 返回主卡（提示词）的底部中心位置
     * 
     * Card Group Layout Strategy:
     * - Each group consists of a Main Card (Prompt) and Sub Cards (Images)
     * - Groups are arranged in a grid: 30 per row, then wrap to next row
     * - Dynamic width calculation based on existing sub-cards
     */
    const findNextGroupPosition = useCallback((): { x: number; y: number } => {
        // 卡组布局参数
        const SUB_CARD_WIDTH = 280;      // 副卡宽度
        const SUB_CARD_GAP = 16;         // 副卡之间间距
        const GROUP_BASE_WIDTH = 380;   // 单副卡时的卡组基础宽度
        const GROUP_HEIGHT = 600;        // 主卡 + 间距 + 副卡高度
        const GAP_X = 40;                // 卡组水平间距
        const GAP_Y = 80;                // 排间垂直间距
        const GROUPS_PER_ROW = 30;       // 每排最大卡组数

        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!currentCanvas) return { x: 0, y: 200 };

        const groupCount = currentCanvas.promptNodes.length;

        // 如果没有现有卡组，返回初始位置
        if (groupCount === 0) {
            return { x: 0, y: 200 };
        }

        // 计算每个现有卡组的实际宽度（基于副卡数量）
        const getGroupWidth = (promptId: string): number => {
            const childCount = currentCanvas.imageNodes.filter(
                img => img.parentPromptId === promptId
            ).length;

            // 副卡最多2列排列
            const cols = Math.min(Math.max(childCount, 1), 2);
            const width = cols * SUB_CARD_WIDTH + (cols - 1) * SUB_CARD_GAP + 40;
            return Math.max(GROUP_BASE_WIDTH, width);
        };

        // 计算当前行号和列号
        const row = Math.floor(groupCount / GROUPS_PER_ROW);
        const col = groupCount % GROUPS_PER_ROW;

        // 计算当前行的累积X偏移
        const startRowIdx = row * GROUPS_PER_ROW;
        let xOffset = 0;

        // 累加当前行中所有已存在卡组的宽度
        for (let i = startRowIdx; i < groupCount; i++) {
            const prompt = currentCanvas.promptNodes[i];
            if (prompt) {
                xOffset += getGroupWidth(prompt.id) + GAP_X;
            }
        }

        // 统一左对齐排布
        const startX = 0;

        // 新卡组X位置 = 起始X + 累积偏移 + 新卡组宽度的一半（居中锚点）
        const newGroupWidth = GROUP_BASE_WIDTH;
        const x = startX + xOffset + newGroupWidth / 2;

        // Y位置根据行号计算
        const y = 200 + row * (GROUP_HEIGHT + GAP_Y);

        return { x, y };
    }, [state]);

    /** Group Management */
    const addGroup = useCallback((group: CanvasGroup) => {
        updateCanvas((canvas) => ({
            ...canvas,
            groups: [...(canvas.groups || []), group]
        }));
    }, [updateCanvas]);

    const removeGroup = useCallback((id: string) => {
        updateCanvas((canvas) => ({
            ...canvas,
            groups: (canvas.groups || []).filter(g => g.id !== id)
        }));
    }, [updateCanvas]);

    const updateGroup = useCallback((group: CanvasGroup) => {
        updateCanvas((canvas) => ({
            ...canvas,
            groups: (canvas.groups || []).map(g => g.id === group.id ? group : g)
        }));
    }, [updateCanvas]);

    const setNodeTags = useCallback((ids: string[], tags: string[]) => {
        updateCanvas((canvas) => ({
            ...canvas,
            promptNodes: canvas.promptNodes.map(n => ids.includes(n.id) ? { ...n, tags } : n),
            imageNodes: canvas.imageNodes.map(n => ids.includes(n.id) ? { ...n, tags } : n)
        }));
    }, [updateCanvas]);

    return (
        <CanvasContext.Provider value={{
            state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas,
            addPromptNode, updatePromptNode, addImageNodes, updatePromptNodePosition, updateImageNodePosition, updateImageNodeDimensions,
            deleteImageNode, deletePromptNode, linkNodes, unlinkNodes, clearAllData, canCreateCanvas,
            undo, redo, pushToHistory, canUndo, canRedo, arrangeAllNodes, getNextCardPosition,
            // File System
            connectLocalFolder, disconnectLocalFolder, changeLocalFolder, refreshLocalFolder,
            isConnectedToLocal: !!state.fileSystemHandle,
            currentFolderName: state.folderName,
            // Selection
            selectedNodeIds: state.selectedNodeIds || [],
            selectNodes,
            clearSelection,
            moveSelectedNodes,
            findSmartPosition,
            findNextGroupPosition,
            addGroup,
            removeGroup,
            updateGroup,
            setNodeTags,
            isReady: !isLoading
        }}>
            {children}
        </CanvasContext.Provider>
    );
};

export const useCanvas = () => {
    const context = useContext(CanvasContext);
    if (!context) throw new Error('useCanvas must be used within CanvasProvider');
    return context;
};
