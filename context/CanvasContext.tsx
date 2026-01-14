'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Canvas, PromptNode, GeneratedImage } from '@/types';

interface CanvasState {
    canvases: Canvas[];
    activeCanvasId: string;
}

interface CanvasContextType {
    state: CanvasState;
    activeCanvas: Canvas | undefined;
    createCanvas: () => void;
    switchCanvas: (id: string) => void;
    deleteCanvas: (id: string) => void;
    addPromptNode: (node: PromptNode) => void;
    addImageNodes: (nodes: GeneratedImage[]) => void;
    updatePromptNodePosition: (id: string, pos: { x: number; y: number }) => void;
    updateImageNodePosition: (id: string, pos: { x: number; y: number }) => void;
    deleteImageNode: (id: string) => void;
    deletePromptNode: (id: string) => void;
    linkNodes: (promptId: string, imageId: string) => void;
    unlinkNodes: (promptId: string, imageId: string) => void;
    clearAllData: () => void;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const STORAGE_KEY = 'kk_studio_canvas_state';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const DEFAULT_CANVAS: Canvas = {
    id: 'default',
    name: 'Canvas 1',
    promptNodes: [],
    imageNodes: [],
    lastModified: Date.now()
};

export const CanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<CanvasState>({
        canvases: [DEFAULT_CANVAS],
        activeCanvasId: DEFAULT_CANVAS.id
    });

    // Load state from localStorage on mount (client-side only)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    setState(parsed);
                } catch (e) {
                    console.error("Failed to parse stored state", e);
                }
            }
        }
    }, []);

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

    const createCanvas = useCallback(() => {
        const newCanvas: Canvas = {
            id: generateId(),
            name: `Canvas ${state.canvases.length + 1}`,
            promptNodes: [],
            imageNodes: [],
            lastModified: Date.now()
        };
        setState(prev => ({
            ...prev,
            canvases: [...prev.canvases, newCanvas],
            activeCanvasId: newCanvas.id
        }));
    }, [state.canvases.length]);

    const switchCanvas = useCallback((id: string) => {
        setState(prev => ({ ...prev, activeCanvasId: id }));
    }, []);

    const deleteCanvas = useCallback((id: string) => {
        setState(prev => {
            if (prev.canvases.length <= 1) return prev; // Cannot delete last one
            const newCanvases = prev.canvases.filter(c => c.id !== id);
            const newActiveId = prev.activeCanvasId === id ? newCanvases[0].id : prev.activeCanvasId;
            return {
                canvases: newCanvases,
                activeCanvasId: newActiveId
            };
        });
    }, []);

    const updateCanvas = useCallback((updater: (canvas: Canvas) => Canvas) => {
        setState(prev => ({
            ...prev,
            canvases: prev.canvases.map(c => c.id === prev.activeCanvasId ? updater(c) : c)
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
                    img.id === imageId ? { ...img, parentPromptId: undefined } : img
                )
            };
        });
    }, [updateCanvas]);

    const clearAllData = useCallback(() => {
        // Clear localStorage
        localStorage.removeItem(STORAGE_KEY);
        // Reset to default state
        setState({
            canvases: [DEFAULT_CANVAS],
            activeCanvasId: DEFAULT_CANVAS.id
        });
    }, []);

    return (
        <CanvasContext.Provider value={{
            state, activeCanvas, createCanvas, switchCanvas, deleteCanvas,
            addPromptNode, addImageNodes, updatePromptNodePosition, updateImageNodePosition,
            deleteImageNode, deletePromptNode, linkNodes, unlinkNodes, clearAllData
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
