import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Canvas, PromptNode, GeneratedImage, AspectRatio, ModelType } from '../types';
import { saveImage, getImage, deleteImage, getAllImages, clearAllImages } from '../services/imageStorage';
import { syncService } from '../services/syncService';
import { fileSystemService } from '../services/fileSystemService';

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
    updatePromptNodePosition: (id: string, pos: { x: number; y: number }) => void;
    updateImageNodePosition: (id: string, pos: { x: number; y: number }) => void;
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
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const STORAGE_KEY = 'kk_studio_canvas_state';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const DEFAULT_CANVAS: Canvas = {
    id: 'default',
    name: '项目1',
    promptNodes: [],
    imageNodes: [],
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
            referenceImages: pn.referenceImages?.map(ref => ({
                ...ref,
                data: '' // Clear base64 data for localStorage
            }))
        }))
    }));
};

export const CanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [state, setState] = useState<CanvasState>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed: CanvasState = JSON.parse(stored);

                // Schema migration 1: Ensure history exists
                if (!parsed.history) parsed.history = {};
                if (!parsed.selectedNodeIds) parsed.selectedNodeIds = [];

                // Schema migration 2: Sanitize Nodes (Fix "Overlap/Broken Features" from old data)
                parsed.canvases = parsed.canvases.map(canvas => ({
                    ...canvas,
                    // Fix Image Nodes
                    imageNodes: (canvas.imageNodes || []).map(img => ({
                        ...img,
                        // Ensure new fields exist
                        generationTime: img.generationTime || Date.now(),
                        canvasId: img.canvasId || canvas.id,
                        parentPromptId: img.parentPromptId || 'unknown',
                        prompt: img.prompt || '',
                        dimensions: img.dimensions || "1024x1024", // Default string
                        aspectRatio: img.aspectRatio || AspectRatio.SQUARE,
                        model: img.model || ModelType.IMAGEN_4 // Fallback valid enum
                    })),
                    // Fix Prompt Nodes
                    promptNodes: (canvas.promptNodes || []).map(node => ({
                        ...node,
                        referenceImages: node.referenceImages || [],
                        parallelCount: node.parallelCount || 1,
                        // Reset generating state on load. If reload page, process is dead.
                        isGenerating: false,
                        error: node.isGenerating ? '::INTERRUPTED::' : undefined
                    }))
                }));

                return parsed;
            } catch (e) {
                console.error('Failed to parse stored canvas state', e);
                return DEFAULT_STATE;
            }
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
                                    logInfo('CanvasContext', `Restored local folder handle: ${handle.name}`);

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
                                    logInfo('CanvasContext', `Local folder permission pending: ${perm}`);
                                }
                            } else {
                                logInfo('CanvasContext', 'No persisted local folder handle found.');
                            }
                        } catch (e) {
                            logError('CanvasContext', e, 'Failed to restore folder handle');
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
                            imageNodes: c.imageNodes.map(img => ({
                                ...img,
                                url: img.url || imageMap.get(img.id) || '',
                                // Hydrate originalUrl from IndexedDB (Local Original Cache)
                                originalUrl: imageMap.get(img.id) || img.originalUrl
                            })),
                            // Rehydrate reference images
                            promptNodes: c.promptNodes.map(pn => ({
                                ...pn,
                                referenceImages: pn.referenceImages?.map(ref => {
                                    const storedUrl = imageMap.get(ref.id);
                                    if (storedUrl) {
                                        // Parse back the base64 data and mime type
                                        const matches = storedUrl.match(/^data:(.+);base64,(.+)$/);
                                        if (matches) {
                                            return { ...ref, mimeType: matches[1], data: matches[2] };
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

    // Initial Load: Merge Cloud Data - DISABLED (Local Only Mode)
    /*
    useEffect(() => {
        // Cloud sync disabled per user request
    }, []);
    */

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
                    const fullUrl = ref.data.startsWith('data:') ? ref.data : `data:${ref.mimeType};base64,${ref.data}`;
                    saveImage(ref.id, fullUrl);
                }
            });
        }
        updateCanvas(c => ({
            ...c,
            promptNodes: [...c.promptNodes, node]
        }));
    }, [updateCanvas]);

    const updatePromptNode = useCallback((node: PromptNode) => {
        // Save reference images to IndexedDB
        if (node.referenceImages) {
            node.referenceImages.forEach(ref => {
                if (ref.data) {
                    const fullUrl = ref.data.startsWith('data:') ? ref.data : `data:${ref.mimeType};base64,${ref.data}`;
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

        // 1. Optimistic Update: Add to State immediately so it's visible & persistable in LS
        updateCanvas(c => ({
            ...c,
            imageNodes: [...c.imageNodes, ...validNodes]
        }));

        // 2. Save to IndexedDB (and FileSystem) in background
        try {
            await Promise.all(validNodes.map(async node => {
                // A. IndexedDB (Fast Cache)
                await saveImage(node.id, node.url);

                // B. File System (Persistent Disk)
                if (state.fileSystemHandle) {
                    try {
                        const res = await fetch(node.url);
                        const blob = await res.blob();
                        await fileSystemService.saveImageToHandle(state.fileSystemHandle, node.id, blob);
                    } catch (e) {
                        console.warn(`[CanvasContext] Failed to save image ${node.id} to disk`, e);
                    }
                }
            }));
        } catch (error) {
            console.error('[CanvasContext] Failed to save images:', error);
            // We continue to update state so UI shows standard image even if persistence failed temporarily
        }
    }, [updateCanvas]);

    const updatePromptNodePosition = useCallback((id: string, pos: { x: number; y: number }) => {
        updateCanvas(c => {
            const node = c.promptNodes.find(n => n.id === id);
            if (!node) return c;

            const dx = pos.x - node.position.x;
            const dy = pos.y - node.position.y;

            // GROUP MOVE LOGIC
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

    const updateImageNodePosition = useCallback((id: string, pos: { x: number; y: number }) => {
        updateCanvas(c => {
            const node = c.imageNodes.find(n => n.id === id);
            if (!node) return c;

            const dx = pos.x - node.position.x;
            const dy = pos.y - node.position.y;

            // GROUP MOVE LOGIC
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

        updateCanvas(c => ({
            ...c,
            imageNodes: c.imageNodes.filter(n => n.id !== id),
            // Also update parent prompt node to remove from child list
            promptNodes: c.promptNodes.map(p => ({
                ...p,
                childImageIds: p.childImageIds.filter(cid => cid !== id)
            }))
        }));
    }, [updateCanvas]);

    const deletePromptNode = useCallback((id: string) => {
        pushToHistory();

        // Get child image IDs to delete from IndexedDB
        const canvas = state.canvases.find(c => c.id === state.activeCanvasId);
        const promptNode = canvas?.promptNodes.find(p => p.id === id);
        const childImageIds = canvas?.imageNodes
            .filter(img => img.parentPromptId === id)
            .map(img => img.id) || [];

        // Delete child images from IndexedDB
        childImageIds.forEach(imgId => deleteImage(imgId));

        updateCanvas(c => ({
            ...c,
            promptNodes: c.promptNodes.filter(n => n.id !== id),
            imageNodes: c.imageNodes.filter(img => img.parentPromptId !== id)
        }));
    }, [updateCanvas, state.canvases, state.activeCanvasId]);

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
    }, []);

    /**
     * Arrange all nodes: Group by project (prompt + child images)
     * - Each project: prompt on top, images below (vertical)
     * - Projects arranged left-to-right (horizontal)
     * - No overlapping
     */
    const arrangeAllNodes = useCallback(() => {
        pushToHistory(); // Allow undo

        // Helper: Get image card dimensions based on aspectRatio (Must match App.tsx rendering)
        const getImageDims = (aspectRatio?: string, dimensions?: string) => {
            // Priority: Try to use actual dimensions if available
            if (dimensions) {
                const [w, h] = dimensions.split('x').map(Number);
                if (w && h) {
                    const ratio = w / h;
                    const cardWidth = ratio > 1 ? 320 : (ratio < 1 ? 200 : 280);
                    const imageHeight = (cardWidth / ratio) + 40; // +40 Footer
                    return { w: cardWidth, h: imageHeight };
                }
            }

            // Fallback to AspectRatio enum
            switch (aspectRatio) {
                case '16:9': return { w: 320, h: 220 }; // 180 + 40
                case '9:16': return { w: 200, h: 395 }; // 355 + 40
                case '1:1':
                default: return { w: 280, h: 320 }; // 280 + 40
            }
        };

        const PROMPT_WIDTH = 320;
        const PROMPT_HEIGHT = 200;
        const GAP_X = 40; // Gap between projects
        const GAP_Y = 60; // Gap between prompt and images

        // 1. Calculate New Layout synchronously using current state
        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!currentCanvas) return;

        const promptPositions: { [id: string]: { x: number; y: number } } = {};
        const imagePositions: { [id: string]: { x: number; y: number } } = {};

        interface ProjectGroup {
            prompt: typeof currentCanvas.promptNodes[0];
            images: typeof currentCanvas.imageNodes;
        }

        const projects: ProjectGroup[] = currentCanvas.promptNodes
            .map(pn => ({
                prompt: pn,
                images: currentCanvas.imageNodes.filter(img => img.parentPromptId === pn.id)
            }))
            .sort((a, b) => a.prompt.timestamp - b.prompt.timestamp);

        // Orphan images (no parent)
        const orphanImages = currentCanvas.imageNodes.filter(
            img => !currentCanvas.promptNodes.some(pn => pn.id === img.parentPromptId)
        );

        // Start position
        let currentX = 50;
        let currentY = 50;
        const MAX_PER_ROW = 10;
        let projectIndex = 0;
        let maxRowHeight = 0;
        const ROW_GAP = 100;

        // Layout each project
        projects.forEach(project => {
            // Calculate image dimensions and total width
            const imageDims: { w: number; h: number }[] = [];
            let totalImagesWidth = 0;
            let maxImageHeight = 0;
            const IMAGE_GAP = 15;

            project.images.forEach(img => {
                const dims = getImageDims(img.aspectRatio, img.dimensions);
                imageDims.push(dims);
                totalImagesWidth += dims.w;
                maxImageHeight = Math.max(maxImageHeight, dims.h);
            });

            // Add gaps between images
            if (project.images.length > 1) {
                totalImagesWidth += (project.images.length - 1) * IMAGE_GAP;
            }

            // Project width = max of prompt width and total images width
            const projectWidth = Math.max(PROMPT_WIDTH, totalImagesWidth);
            const projectHeight = PROMPT_HEIGHT + GAP_Y + maxImageHeight;

            // WRAP LOGIC: Check if we need to start a new row
            if (projectIndex > 0 && projectIndex % MAX_PER_ROW === 0) {
                currentX = 50;
                currentY += maxRowHeight + ROW_GAP;
                maxRowHeight = 0;
            }

            maxRowHeight = Math.max(maxRowHeight, projectHeight);

            // Position prompt (anchor is center-bottom)
            const promptX = currentX + projectWidth / 2;
            const promptY = currentY + PROMPT_HEIGHT;
            promptPositions[project.prompt.id] = { x: promptX, y: promptY };

            // Position images horizontally below prompt
            if (project.images.length > 0) {
                const imagesStartX = currentX + (projectWidth - totalImagesWidth) / 2;
                // Note: No longer using single imageY. Calculating per image to ensure uniform top-alignment.

                let imgX = imagesStartX + (imageDims[0]?.w || 0) / 2; // Center first image X

                project.images.forEach((img, idx) => {
                    const dims = imageDims[idx];
                    const thisImageY = promptY + GAP_Y + dims.h; // Y is Bottom. Top = Y - h = Prompt + Gap. Uniform Top!

                    if (idx > 0) {
                        const prevDims = imageDims[idx - 1];
                        imgX += prevDims.w / 2 + IMAGE_GAP + dims.w / 2;
                    }

                    imagePositions[img.id] = { x: imgX, y: thisImageY };
                });
            }

            // Move X for next project
            currentX += projectWidth + GAP_X;
            projectIndex++;
        });

        // Orphan images at the end
        orphanImages.forEach((img, idx) => {
            const dims = getImageDims(img.aspectRatio);
            imagePositions[img.id] = { x: 50 + idx * 300, y: 500 }; // Simplified fallback
        });

        // 2. Construct New Canvases List synchronously
        const newCanvases = state.canvases.map(c =>
            c.id === state.activeCanvasId ? {
                ...c,
                promptNodes: c.promptNodes.map(pn => ({ ...pn, position: promptPositions[pn.id] || pn.position })),
                imageNodes: c.imageNodes.map(img => ({ ...img, position: imagePositions[img.id] || img.position })),
                lastModified: Date.now()
            } : c
        );

        // 3. Update React State
        setState(prev => ({
            ...prev,
            canvases: newCanvases
        }));

        // 4. FORCE SAVE synchronously (Critical Fix for immediate refresh)
        // ONLY if NOT connected to a local folder.
        if (!state.fileSystemHandle) {
            try {
                const stateToSave = {
                    ...state,
                    canvases: stripImageUrls(newCanvases),
                    history: {} // Don't save history to avoid quota limits
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
            } catch (e) {
                console.error('Failed to force save layout:', e);
                alert('布局保存失败：存储空间不足或发生错误。请尝试删除不需要的项目。');
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
                        reader.onloadend = () => {
                            if (reader.result) saveImage(img.id, reader.result as string);
                        };
                        reader.readAsDataURL(blob);
                    }).catch(e => console.warn('Background cache failed', e));
                }
            });

            // B. Cache Reference Images (Fix for missing refs)
            currentCanvas.promptNodes.forEach(pn => {
                pn.referenceImages?.forEach(ref => {
                    if (ref.data) {
                        // Ensure it's a full data URL for storage
                        const fullUrl = ref.data.startsWith('data:')
                            ? ref.data
                            : `data:${ref.mimeType || 'image/png'};base64,${ref.data}`;
                        saveImage(ref.id, fullUrl).catch(e => console.warn('Ref cache failed', e));
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

            // Reload state
            if (canvases.length > 0) {
                setState(prev => ({
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
                }));
            }
            alert('本地文件夹刷新成功！');

        } catch (error) {
            console.error('Failed to refresh folder:', error);
            alert('刷新文件夹失败。');
        }
    }, [state.fileSystemHandle]);

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
            moveSelectedNodes
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
