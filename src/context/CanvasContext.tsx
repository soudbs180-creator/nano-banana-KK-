import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Canvas, PromptNode, GeneratedImage } from '../types';

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
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const STORAGE_KEY = 'kk_studio_canvas_state';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const DEFAULT_CANVAS: Canvas = {
    id: 'default',
    name: '默认画布',
    promptNodes: [],
    imageNodes: [],
    lastModified: Date.now()
};

export const CanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<CanvasState>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Schema migration: Ensure history exists for old data
                if (!parsed.history) {
                    parsed.history = {};
                }
                return parsed;
            } catch (e) {
                console.error("Failed to parse stored state", e);
            }
        }
        return {
            canvases: [DEFAULT_CANVAS],
            activeCanvasId: DEFAULT_CANVAS.id,
            history: {}
        };
    });

    // Persistence with error handling
    useEffect(() => {
        try {
            const jsonStr = JSON.stringify(state);
            // Check if we're approaching quota limits
            if (jsonStr.length > 4500000) { // ~4.5MB (留出buffer)
                console.warn('Canvas state approaching localStorage quota limit');
            }
            localStorage.setItem(STORAGE_KEY, jsonStr);
        } catch (error: any) {
            if (error.name === 'QuotaExceededError') {
                console.error('localStorage quota exceeded. Canvas state not saved.');
                // Optionally: notify user or clear old data
            } else {
                console.error('Failed to save to localStorage:', error);
            }
        }
    }, [state]);

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
        updateCanvas(c => ({
            ...c,
            promptNodes: [...c.promptNodes, node]
        }));
    }, [updateCanvas]);

    const addImageNodes = useCallback((nodes: GeneratedImage[]) => {
        // Defensive check: filter out any invalid nodes
        const validNodes = Array.isArray(nodes) ? nodes.filter(n => n && n.id && n.url) : [];
        if (validNodes.length === 0) {
            console.warn('addImageNodes called with no valid nodes');
            return;
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
        updateCanvas(c => ({
            ...c,
            imageNodes: c.imageNodes.filter(n => n.id !== id),
            // Also update parent prompt node to remove strictly from child list?
            promptNodes: c.promptNodes.map(p => ({
                ...p,
                childImageIds: p.childImageIds.filter(cid => cid !== id)
            }))
        }));
    }, [updateCanvas]);

    const deletePromptNode = useCallback((id: string) => {
        pushToHistory();
        updateCanvas(c => ({
            ...c,
            promptNodes: c.promptNodes.filter(n => n.id !== id),
            // Optionally delete children images?
            imageNodes: c.imageNodes.filter(img => img.parentPromptId !== id)
        }));
    }, [updateCanvas]);

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
        // Warning: clearAllData clears history too in current impl, maybe we want to undo clear?
        // If we want to undo clear, we should keep history and only clear current canvas arrays?
        // But user asked to "Clear All Data" which implies full reset. 
        // Let's assume clearAllData is a hard reset.

        // Clear localStorage
        localStorage.removeItem(STORAGE_KEY);
        // Reset to default state
        setState({
            canvases: [DEFAULT_CANVAS],
            activeCanvasId: DEFAULT_CANVAS.id,
            history: {}
        });
    }, []);

    return (
        <CanvasContext.Provider value={{
            state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas,
            addPromptNode, addImageNodes, updatePromptNodePosition, updateImageNodePosition,
            deleteImageNode, deletePromptNode, linkNodes, unlinkNodes, clearAllData, canCreateCanvas,
            undo, redo, pushToHistory, canUndo, canRedo
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
