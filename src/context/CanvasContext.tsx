import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Canvas, PromptNode, GeneratedImage, AspectRatio, ModelType } from '../types';
import { saveImage, getImage, deleteImage, getAllImages, clearAllImages } from '../services/imageStorage';
import { syncService } from '../services/syncService';

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
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const STORAGE_KEY = 'kk_studio_canvas_state';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const DEFAULT_CANVAS: Canvas = {
    id: 'default',
    name: '画布1',
    promptNodes: [],
    imageNodes: [],
    lastModified: Date.now()
};

// Helper to strip image URLs and Reference Image data for localStorage
const stripImageUrls = (canvases: Canvas[]): Canvas[] => {
    return canvases.map(c => ({
        ...c,
        imageNodes: c.imageNodes.map(img => ({
            ...img,
            url: '' // Clear URL for localStorage, will be loaded from IndexedDB
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
                if (!parsed.history) {
                    parsed.history = {};
                }

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
                        isGenerating: false, // Reset generating state on reload
                        error: undefined     // Clear old errors
                    }))
                }));

                return parsed;
            } catch (e) {
                console.error("Failed to parse stored state, resetting...", e);
            }
        }
        return {
            canvases: [DEFAULT_CANVAS],
            activeCanvasId: DEFAULT_CANVAS.id,
            history: {}
        };
    });

    // Load image URLs from IndexedDB on mount, with migration support
    useEffect(() => {
        const loadImages = async () => {
            try {
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
        loadImages();
    }, []);

    // Persistence with error handling AND Cloud Sync
    useEffect(() => {
        if (isLoading) return; // Don't save while loading

        const saveState = async () => {
            try {
                // 1. Local Storage Save (Backup/Offline)
                const stateToSave = {
                    ...state,
                    canvases: stripImageUrls(state.canvases),
                    history: {}
                };
                const jsonStr = JSON.stringify(stateToSave);
                if (jsonStr.length > 4500000) {
                    console.warn('Canvas state approaching localStorage quota limit.');
                }
                localStorage.setItem(STORAGE_KEY, jsonStr);

                // 2. Cloud Sync (if logged in)
                if (state.activeCanvasId) {
                    const activeCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
                    if (activeCanvas) {
                        try {
                            await syncService.saveCanvas(activeCanvas);
                        } catch (e) {
                            // Ignored
                        }
                    }
                }
            } catch (error: any) {
                if (error.name === 'QuotaExceededError') {
                    console.error('localStorage quota exceeded.');
                } else {
                    console.error('Failed to save state:', error);
                }
            }
        };

        // Debounce saving
        const timer = setTimeout(saveState, 500); // Reduced to 500ms

        // Save immediately on page unload
        const handleBeforeUnload = () => {
            // Attempt synchronous save logic for localStorage (syncService is async, might fail)
            try {
                const stateToSave = {
                    ...state,
                    canvases: stripImageUrls(state.canvases),
                    history: {}
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
            } catch (e) {
                console.error('Failed to save state on unload:', e);
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [state, isLoading]);

    // Initial Load: Merge Cloud Data
    useEffect(() => {
        const loadCloud = async () => {
            try {
                const cloudCanvases = await syncService.loadCanvases();
                if (cloudCanvases.length > 0) {
                    setState(prev => {
                        // Simple merge strategy: Cloud wins on ID match, append new
                        const merged = [...prev.canvases];
                        cloudCanvases.forEach(cloudC => {
                            const idx = merged.findIndex(c => c.id === cloudC.id);
                            if (idx >= 0) {
                                // Overwrite if newer? For now, just prefer Cloud as source of truth
                                merged[idx] = cloudC;
                            } else {
                                merged.push(cloudC);
                            }
                        });
                        return {
                            ...prev,
                            canvases: merged
                        };
                    });
                }
            } catch (e) {
                console.log('No cloud data or not logged in');
            }
        };
        // Wait a bit for auth to settle
        const t = setTimeout(loadCloud, 2000);
        return () => clearTimeout(t);
    }, []);

    const activeCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
    const canCreateCanvas = state.canvases.length < MAX_CANVASES;

    const createCanvas = useCallback((): boolean => {
        if (state.canvases.length >= MAX_CANVASES) {
            return false; // Max reached
        }

        // Find next available number for "画布X"
        const existingNumbers = state.canvases
            .map(c => {
                const match = c.name.match(/^画布(\d+)$/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter(n => n > 0);
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

        const newCanvas: Canvas = {
            id: generateId(),
            name: `画布${nextNumber}`,
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
                history: prev.history
            };
        });
    }, []);

    const updateCanvas = useCallback((updater: (canvas: Canvas) => Canvas) => {
        setState(prev => ({
            ...prev,
            canvases: prev.canvases.map(c => c.id === prev.activeCanvasId ? updater(c) : c),
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

        // Save images to IndexedDB robustly
        try {
            await Promise.all(validNodes.map(node => saveImage(node.id, node.url)));
        } catch (error) {
            console.error('[CanvasContext] Failed to save images to IndexedDB:', error);
            // We continue to update state so UI shows standard image even if persistence failed temporarily
        }

        updateCanvas(c => ({
            ...c,
            imageNodes: [...c.imageNodes, ...validNodes]
        }));
    }, [updateCanvas]);

    const updatePromptNodePosition = useCallback((id: string, pos: { x: number; y: number }) => {
        updateCanvas(c => {
            const node = c.promptNodes.find(n => n.id === id);
            if (!node) return c;

            const dx = pos.x - node.position.x;
            const dy = pos.y - node.position.y;

            // Move all child images along with the prompt node
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
    }, [updateCanvas]);

    const updateImageNodePosition = useCallback((id: string, pos: { x: number; y: number }) => {
        updateCanvas(c => ({
            ...c,
            imageNodes: c.imageNodes.map(img =>
                img.id === id ? { ...img, position: pos } : img
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
                canvases: prev.canvases.map(c => c.id === prev.activeCanvasId ? previousState : c),
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
                canvases: prev.canvases.map(c => c.id === prev.activeCanvasId ? nextState : c),
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
            history: {}
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

        // Helper: Get image card dimensions based on aspectRatio
        const getImageDims = (aspectRatio?: string) => {
            switch (aspectRatio) {
                case '16:9': return { w: 320, h: 240 };
                case '9:16': return { w: 200, h: 415 };
                case '1:1':
                default: return { w: 280, h: 340 };
            }
        };

        const PROMPT_WIDTH = 320;
        const PROMPT_HEIGHT = 200;
        const GAP_X = 40; // Gap between projects
        const GAP_Y = 30; // Gap between prompt and images

        setState(prev => {
            const currentCanvas = prev.canvases.find(c => c.id === prev.activeCanvasId);
            if (!currentCanvas) return prev;

            const promptPositions: { [id: string]: { x: number; y: number } } = {};
            const imagePositions: { [id: string]: { x: number; y: number } } = {};

            // Group: each prompt with its child images
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
                    const dims = getImageDims(img.aspectRatio);
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

                // Position images horizontally below prompt, centered
                if (project.images.length > 0) {
                    const imagesStartX = currentX + (projectWidth - totalImagesWidth) / 2;
                    const imageY = promptY + GAP_Y + maxImageHeight; // All images at same Y (bottom anchor)

                    let imgX = imagesStartX;
                    project.images.forEach((img, idx) => {
                        const dims = imageDims[idx];
                        imagePositions[img.id] = {
                            x: imgX + dims.w / 2, // Center anchor
                            y: imageY
                        };
                        imgX += dims.w + IMAGE_GAP;
                    });
                }

                // Move X for next project
                currentX += projectWidth + GAP_X;
                projectIndex++;
            });

            // Orphan images at the end
            orphanImages.forEach((img, idx) => {
                const dims = getImageDims(img.aspectRatio);
                const imgX = currentX + dims.w / 2;
                const imgY = currentY + PROMPT_HEIGHT + GAP_Y + dims.h;
                imagePositions[img.id] = { x: imgX, y: imgY };
                currentX += dims.w + GAP_X;
            });

            return {
                ...prev,
                canvases: prev.canvases.map(c => {
                    if (c.id !== prev.activeCanvasId) return c;
                    return {
                        ...c,
                        promptNodes: c.promptNodes.map(n => ({
                            ...n,
                            position: promptPositions[n.id] || n.position
                        })),
                        imageNodes: c.imageNodes.map(n => ({
                            ...n,
                            position: imagePositions[n.id] || n.position
                        })),
                        lastModified: Date.now()
                    };
                })
            };
        });
    }, [pushToHistory]);

    /**
     * Get the next available position for a new card (to the right of existing cards)
     */
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
            addPromptNode, updatePromptNode, addImageNodes, updatePromptNodePosition, updateImageNodePosition,
            deleteImageNode, deletePromptNode, linkNodes, unlinkNodes, clearAllData, canCreateCanvas,
            undo, redo, pushToHistory, canUndo, canRedo, arrangeAllNodes, getNextCardPosition
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
