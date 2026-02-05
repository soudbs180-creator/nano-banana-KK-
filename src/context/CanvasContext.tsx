import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Canvas, PromptNode, GeneratedImage, AspectRatio, CanvasGroup, CanvasDrawing } from '../types';
import { saveImage, getImage, deleteImage, getAllImages, clearAllImages, getImagesPage, getImageCount } from '../services/imageStorage';
import { syncService } from '../services/syncService';
import { fileSystemService } from '../services/fileSystemService';
import { base64ToBlob, safeRevokeBlobUrl } from '../utils/blobUtils';
import { calculateImageHash } from '../utils/imageUtils';

const MAX_CANVASES = 10;


// 副卡排列模式: 横向 | 宫格 | 竖向
export type SubCardLayout = 'row' | 'grid' | 'column';

// 整理模式: 宫格(6列) | 横向 | 纵向
export type ArrangeMode = 'grid' | 'row' | 'column';


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
    // 副卡排列模式 (轮换: row -> grid -> column -> row)
    subCardLayoutMode: SubCardLayout;
    // 🚀 视口中心位置（动态优先级加载）
    viewportCenter: { x: number; y: number };
}

interface CanvasContextType {
    state: CanvasState;
    activeCanvas: Canvas | undefined;
    createCanvas: () => string | null; // Returns new canvas ID or null if max reached
    switchCanvas: (id: string) => void;
    deleteCanvas: (id: string) => void;
    renameCanvas: (id: string, newName: string) => void;
    addPromptNode: (node: PromptNode) => Promise<void>;
    updatePromptNode: (node: PromptNode) => Promise<void>;
    addImageNodes: (nodes: GeneratedImage[]) => Promise<void>;
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
    arrangeAllNodes: (mode?: ArrangeMode) => void; // Auto-layout cards: grid(6列) | row | column
    getNextCardPosition: () => { x: number; y: number }; // Get next available position for new card
    // File System
    connectLocalFolder: () => Promise<void>;
    disconnectLocalFolder: () => void;
    changeLocalFolder: () => Promise<void>;
    refreshLocalFolder: () => Promise<void>;
    isConnectedToLocal: boolean;
    currentFolderName: string | null;
    selectedNodeIds: string[];
    selectNodes: (ids: string[], mode?: 'replace' | 'add' | 'remove' | 'toggle') => void;
    clearSelection: () => void;
    moveSelectedNodes: (delta: { x: number; y: number }) => void;
    findSmartPosition: (x: number, y: number, width: number, height: number, buffer?: number) => { x: number; y: number };
    findNextGroupPosition: () => { x: number; y: number }; // Grid-based Card Group placement
    addGroup: (group: CanvasGroup) => void;
    removeGroup: (id: string) => void;
    updateGroup: (group: CanvasGroup) => void;
    setNodeTags: (ids: string[], tags: string[]) => void;
    isReady: boolean;
    // 🚀 设置视口中心（动态优先级加载）
    setViewportCenter: (center: { x: number; y: number }) => void;
    // 🚀 迁移选中节点到其他项目
    migrateNodes: (nodeIds: string[], targetCanvasId: string) => void;
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
    selectedNodeIds: [],
    subCardLayoutMode: 'row', // 默认横向排列
    viewportCenter: { x: 0, y: 0 } // 默认画布中心
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

    // 🚀 [防刷新丢失] 追踪未完成的保存任务
    const pendingSavesRef = useRef<Set<Promise<void>>>(new Set());

    // 🚀 [防刷新丢失] beforeunload 事件警告用户
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (pendingSavesRef.current.size > 0) {
                e.preventDefault();
                e.returnValue = '图片正在保存中，离开可能导致数据丢失';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

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
                                        const { canvases, images, activeCanvasId: savedActiveCanvasId } = await fileSystemService.loadProjectWithThumbs(handle);

                                        // Hydrate IDB images (Background)
                                        for (const [id, data] of images.entries()) {
                                            if (data.url) saveImage(id, data.url).catch(e => console.warn('Cache failed', e));
                                        }

                                        if (canvases.length > 0) {
                                            // 🚀 恢复上次活动的项目，如果找不到则使用第一个
                                            const validActiveId = savedActiveCanvasId && canvases.some(c => c.id === savedActiveCanvasId)
                                                ? savedActiveCanvasId
                                                : canvases[0].id;

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
                                                activeCanvasId: validActiveId,
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

                // 2. Load Images from IndexedDB (优化：按需加载)
                console.log('[CanvasContext] Starting optimized image loading...');
                const totalImages = await getImageCount();
                console.log(`[CanvasContext] Total images in DB: ${totalImages}`);

                // 🚀 收集当前状态中需要的图片ID
                const requiredImageIds = new Set<string>();
                state.canvases.forEach(c => {
                    // 收集生成的图片ID - 使用storageId优先（保存时用的是storageId）
                    c.imageNodes.forEach(img => {
                        requiredImageIds.add(img.storageId || img.id);
                    });
                    // 收集参考图片ID
                    c.promptNodes.forEach(pn => {
                        if (pn.referenceImages) {
                            pn.referenceImages.forEach(ref => {
                                requiredImageIds.add(ref.storageId || ref.id);
                            });
                        }
                    });
                });


                console.log(`[CanvasContext] Found ${requiredImageIds.size} images needed in current state`);

                // 🚀 分离参考图和生成图
                const referenceImageIds = new Set<string>();
                const generatedImageIds = new Set<string>();

                state.canvases.forEach(c => {
                    // 生成的图片
                    c.imageNodes.forEach(img => {
                        generatedImageIds.add(img.storageId || img.id);
                    });
                    // 参考图 - 单独收集，确保优先加载
                    c.promptNodes.forEach(pn => {
                        if (pn.referenceImages) {
                            pn.referenceImages.forEach(ref => {
                                referenceImageIds.add(ref.storageId || ref.id);
                            });
                        }
                    });
                });

                // 🚀 [修复] 参考图必须全部加载，不受限制
                // 生成图才限制数量
                const MAX_GENERATED_LOAD = 5;
                let generatedIdsArray = Array.from(generatedImageIds);

                // 🚀 优先加载靠近视口中心的生成图
                const viewportX = state.viewportCenter.x;
                const viewportY = state.viewportCenter.y;
                const imagesWithDistance = generatedIdsArray.map(id => {
                    let minDistance = Infinity;
                    state.canvases.forEach(c => {
                        const node = c.imageNodes.find(n => (n.storageId || n.id) === id);
                        if (node) {
                            const dx = node.position.x - viewportX;
                            const dy = node.position.y - viewportY;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            minDistance = Math.min(minDistance, distance);
                        }
                    });
                    return { id, distance: minDistance };
                });

                // 按距离排序，优先加载中心区域
                imagesWithDistance.sort((a, b) => a.distance - b.distance);
                generatedIdsArray = imagesWithDistance.slice(0, MAX_GENERATED_LOAD).map(item => item.id);

                // 🚀 [关键修复] 合并：参考图 + 限制后的生成图
                const imageIdsArray = [...Array.from(referenceImageIds), ...generatedIdsArray];

                if (generatedImageIds.size > MAX_GENERATED_LOAD) {
                    console.warn(`[CanvasContext] Too many generated images (${generatedImageIds.size}), loading only ${MAX_GENERATED_LOAD} nearest to center`);
                }
                console.log(`[CanvasContext] Loading ${referenceImageIds.size} reference images + ${generatedIdsArray.length} generated images`);

                // 🚀 按需加载：只加载当前状态需要的图片
                const imageMap = new Map<string, string>();
                const BATCH_SIZE = 5; // 减小批次大小，避免内存峰值

                for (let i = 0; i < imageIdsArray.length; i += BATCH_SIZE) {
                    const batch = imageIdsArray.slice(i, i + BATCH_SIZE);
                    // 🚀 [OOM修复] 加载MICRO质量（最小缩略图<50KB）而不是THUMBNAIL
                    const { getImageByQuality } = await import('../services/imageStorage');
                    const { ImageQuality } = await import('../services/imageQuality');
                    const batchPromises = batch.map(id => getImageByQuality(id, ImageQuality.MICRO));
                    const batchResults = await Promise.all(batchPromises);

                    batch.forEach((id, index) => {
                        const url = batchResults[index];
                        if (url) {
                            imageMap.set(id, url);
                        }
                    });

                    console.log(`[CanvasContext] Loaded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(imageIdsArray.length / BATCH_SIZE)} (${imageMap.size}/${imageIdsArray.length})`);
                }

                console.log(`[CanvasContext] Successfully loaded ${imageMap.size}/${requiredImageIds.size} required images`);

                if (imageMap.size < requiredImageIds.size) {
                    console.warn(`[CanvasContext] ${requiredImageIds.size - imageMap.size} images not found in IndexedDB`);
                }

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
                        // Save minimal state (canvases + activeCanvasId) to keep project.json clean compatible with other tools
                        await writable.write(JSON.stringify({
                            canvases: stateToSave.canvases,
                            activeCanvasId: state.activeCanvasId  // 🚀 记住当前活动项目
                        }, null, 2));
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

    const createCanvas = useCallback((): string | null => {
        if (state.canvases.length >= MAX_CANVASES) {
            return null; // Max reached
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
        return newCanvas.id; // 返回新画布ID便于迁移
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
                selectedNodeIds: [],
                subCardLayoutMode: prev.subCardLayoutMode,
                viewportCenter: prev.viewportCenter
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

    const addPromptNode = useCallback(async (node: PromptNode) => {
        console.log('[CanvasContext.addPromptNode] 🚀 开始添加提示词卡片', { nodeId: node.id, prompt: node.prompt?.substring(0, 50) });

        try {
            // 🚀 [防御性修复] 先添加节点到状态，保证UI立即显示
            updateCanvas(c => ({
                ...c,
                promptNodes: [...c.promptNodes, node]
            }));
            console.log('[CanvasContext.addPromptNode] ✅ 卡片已添加到画布');

            // 🚀 [关键修复] 异步保存参考图 - 即使失败也不影响卡片显示
            if (node.referenceImages && node.referenceImages.length > 0) {
                console.log(`[CanvasContext.addPromptNode] 📸 开始保存 ${node.referenceImages.length} 张参考图`);
                const saveTasks = node.referenceImages.map(async (ref, index) => {
                    if (ref.data) {
                        const mime = ref.mimeType || 'image/png';
                        let fullUrl = ref.data;
                        if (!fullUrl.startsWith('data:') && !fullUrl.startsWith('blob:') && !fullUrl.startsWith('http')) {
                            fullUrl = `data:${mime};base64,${ref.data}`;
                        }
                        try {
                            await saveImage(ref.id, fullUrl);
                            console.log(`[CanvasContext.addPromptNode] ✅ 参考图 ${index + 1}/${node.referenceImages?.length || 0} 保存成功:`, ref.id);
                        } catch (e: any) {
                            console.error(`[CanvasContext.addPromptNode] ❌ 参考图 ${index + 1} 保存失败:`, ref.id, e?.message || e);
                            // 🔔 通知用户（但不阻止流程）
                            import('../services/notificationService').then(({ notificationService }) => {
                                notificationService.warning(`参考图 ${index + 1} 保存失败，刷新后可能丢失`);
                            });
                        }
                    }
                });
                await Promise.allSettled(saveTasks); // 使用 allSettled 而不是 all，确保所有任务完成
                console.log('[CanvasContext.addPromptNode] 📸 参考图保存任务完成');
            }
        } catch (error: any) {
            // 🚨 致命错误：添加卡片失败
            console.error('[CanvasContext.addPromptNode] 🔥 致命错误：添加卡片失败!', error);
            import('../services/notificationService').then(({ notificationService }) => {
                notificationService.error(`添加卡片失败：${error?.message || '未知错误'}`);
            });
            // ⚠️ 不throw，避免中断后续流程（图片生成）
        }
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

    const updatePromptNode = useCallback(async (node: PromptNode) => {
        // 🚀 [关键修复] 先保存参考图再更新节点 - 防止刷新丢失
        if (node.referenceImages && node.referenceImages.length > 0) {
            const saveTasks = node.referenceImages.map(async ref => {
                if (ref.data) {
                    const mime = ref.mimeType || 'image/png';
                    let fullUrl = ref.data;
                    if (!fullUrl.startsWith('data:') && !fullUrl.startsWith('blob:') && !fullUrl.startsWith('http')) {
                        fullUrl = `data:${mime};base64,${ref.data}`;
                    }
                    try {
                        await saveImage(ref.id, fullUrl);
                    } catch (e) {
                        console.error(`[CanvasContext] ❌ Failed to save reference image ${ref.id}`, e);
                    }
                }
            });
            await Promise.all(saveTasks);
        }
        updateCanvas(c => ({
            ...c,
            promptNodes: c.promptNodes.map(n => n.id === node.id ? node : n)
        }));
    }, [updateCanvas]);

    const addImageNodes = useCallback(async (nodes: GeneratedImage[]) => {
        console.log('[CanvasContext.addImageNodes] 🖼️ 开始添加图片节点', { count: nodes?.length });

        // 🛡️ 防御性检查：过滤掉无效节点
        const validNodes = Array.isArray(nodes) ? nodes.filter(n => n && n.id && n.url) : [];
        if (validNodes.length === 0) {
            console.warn('[CanvasContext.addImageNodes] ⚠️ 没有有效的图片节点');
            return;
        }
        console.log('[CanvasContext.addImageNodes] ✅ 验证通过：', validNodes.length, '个有效节点');

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
                    const isVideo = node.mode === 'video' || node.url.startsWith('data:video/');
                    const storageId = node.storageId || node.id;

                    // 🚀 [关键修复] 先保存原图到本地文件系统（最安全的存储）
                    // A. File System First (持久化到本地磁盘 - 优先级最高)
                    // 🚀 [闭包修复] 使用getLocalFolderHandle动态获取最新handle，不依赖陈旧的state
                    const { getLocalFolderHandle } = await import('../services/storagePreference');
                    const currentHandle = await getLocalFolderHandle();

                    if (currentHandle) {
                        try {
                            const res = await fetch(node.url); // works with data: or blob:
                            const blob = await res.blob();

                            if (isVideo) {
                                // 视频：保存为.mp4
                                // @ts-ignore
                                const videosDir = await currentHandle.getDirectoryHandle('videos', { create: true });
                                // @ts-ignore
                                const fileHandle = await videosDir.getFileHandle(`${storageId}.mp4`, { create: true });
                                // @ts-ignore
                                const writable = await fileHandle.createWritable();
                                await writable.write(blob);
                                await writable.close();
                                console.log(`[CanvasContext] ✅ Saved ORIGINAL video ${storageId} to LOCAL DISK`);
                            } else {
                                // 图片：保存原图到本地
                                await fileSystemService.saveImageToHandle(currentHandle, storageId, blob);
                                console.log(`[CanvasContext] ✅ Saved ORIGINAL image ${storageId} to LOCAL DISK`);
                            }
                        } catch (e) {
                            console.error(`[CanvasContext] ❌ Failed to save ${isVideo ? 'video' : 'image'} ${node.id} to LOCAL DISK`, e);
                        }
                    } else {
                        // 🚀 [新增] 没有本地文件夹时，检测是否支持OPFS（手机端）
                        const { isOPFSAvailable, saveToOPFS } = await import('../services/opfsService');

                        if (isOPFSAvailable()) {
                            // 手机端：使用OPFS保存原图
                            try {
                                const res = await fetch(node.url);
                                const blob = await res.blob();

                                if (isVideo) {
                                    await saveToOPFS(blob, storageId, 'video');
                                    console.log(`[CanvasContext] ✅ Saved video ${storageId} to OPFS`);
                                } else {
                                    await saveToOPFS(blob, storageId, 'image');
                                    console.log(`[CanvasContext] ✅ Saved ORIGINAL image ${storageId} to OPFS`);
                                }
                            } catch (e) {
                                console.error(`[CanvasContext] ❌ Failed to save to OPFS`, e);
                            }
                        } else {
                            console.log(`[CanvasContext] No local folder or OPFS available, using IndexedDB for ${storageId}`);
                        }
                    }

                    // B. IndexedDB (浏览器缓存) - 始终保存缩略图
                    if (isVideo) {
                        // 视频：直接保存，不压缩
                        const { saveImage } = await import('../services/imageStorage');
                        await saveImage(storageId, node.url);
                        console.log(`[CanvasContext] Saved video ${storageId} to IndexedDB cache`);
                    } else {
                        const { saveImage } = await import('../services/imageStorage');
                        const { getQualityStorageId, ImageQuality } = await import('../services/imageQuality');

                        // 🚀 [优化] 使用Web Worker生成缩略图，不阻塞主线程
                        try {
                            const { generateThumbnailWithPreset } = await import('../workers/thumbnailService');
                            const { blob } = await generateThumbnailWithPreset(node.url, 'MICRO');

                            // 转换为base64保存到IndexedDB
                            const reader = new FileReader();
                            const microData = await new Promise<string>((resolve, reject) => {
                                reader.onload = () => resolve(reader.result as string);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });

                            const microId = getQualityStorageId(storageId, ImageQuality.MICRO);
                            await saveImage(microId, microData);
                            console.log(`[CanvasContext] ✅ Saved MICRO thumbnail (Worker) for ${storageId}`);
                        } catch (workerError) {
                            // Worker失败时回退到主线程
                            console.warn(`[CanvasContext] Worker failed, falling back to main thread:`, workerError);
                            const { compressImageToQuality, QUALITY_CONFIGS } = await import('../services/imageQuality');
                            const microData = await compressImageToQuality(node.url, QUALITY_CONFIGS[ImageQuality.MICRO]);
                            const microId = getQualityStorageId(storageId, ImageQuality.MICRO);
                            await saveImage(microId, microData);
                            console.log(`[CanvasContext] ✅ Saved MICRO thumbnail (main thread) for ${storageId}`);
                        }

                        // 🚀 [关键修复] 如果没有本地文件夹也没有OPFS，保存ORIGINAL到IndexedDB
                        const { isOPFSAvailable: checkOPFS } = await import('../services/opfsService');
                        if (!currentHandle && !checkOPFS()) {
                            await saveImage(storageId, node.url);
                            console.log(`[CanvasContext] ✅ Saved ORIGINAL for ${storageId} to IndexedDB (no local folder or OPFS)`);
                        }
                    }
                } catch (e) {
                    console.error(`[CanvasContext] Failed to save ${node.id}`, e);
                }
            })());
        }

        // 🚀 [修复] 先立即显示图片（乐观更新），保持连续发送能力
        console.log('[CanvasContext.addImageNodes] 🎨 立即更新UI，添加', stateNodes.length, '个节点到画布');
        try {
            updateCanvas(c => ({
                ...c,
                imageNodes: [...c.imageNodes, ...stateNodes]
            }));
            console.log('[CanvasContext.addImageNodes] ✅ UI更新成功，卡片已显示');
        } catch (uiError: any) {
            // 🚨 致命错误：UI更新失败
            console.error('[CanvasContext.addImageNodes] 🔥 UI更新失败!', uiError);
            import('../services/notificationService').then(({ notificationService }) => {
                notificationService.error(`显示图片失败：${uiError?.message || '未知错误'}`);
            });
            throw uiError;
        }

        // 🚀 后台执行持久化任务（不阻塞UI）
        console.log('[CanvasContext.addImageNodes] 💾 开始后台保存任务，共', persistenceTasks.length, '个');
        // 使用全局追踪器防止刷新时丢失
        const savePromise = Promise.allSettled(persistenceTasks).then((results) => {
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            console.log(`[CanvasContext.addImageNodes] 💾 保存完成：${successful}成功 / ${failed}失败 / ${results.length}总数`);

            if (failed > 0) {
                console.warn('[CanvasContext.addImageNodes] ⚠️ 部分图片保存失败，刷新后可能丢失');
                import('../services/notificationService').then(({ notificationService }) => {
                    notificationService.warning(`${failed}张图片保存失败，建议重新生成`);
                });
            }
        }).catch(e => {
            console.error('[CanvasContext.addImageNodes] ❌ 保存任务异常:', e);
        });

        // 追踪未完成的保存任务
        pendingSavesRef.current.add(savePromise);
        savePromise.finally(() => {
            pendingSavesRef.current.delete(savePromise);
        });
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

            // [MODIFIED] 卡组内排斥逻辑:主卡靠近副卡时被弹开
            // 不再让副卡跟随移动,而是保持互相排斥
            const REPULSION_THRESHOLD = 80;
            const MIN_DISTANCE = 100;

            let finalPos = { ...pos };
            const promptHeight = node.height || 200;
            const promptWidth = 320;

            // 找到该主卡的所有副卡
            const childImages = c.imageNodes.filter(img => img.parentPromptId === id);

            for (const childImg of childImages) {
                const imgHeight = 200;
                const imgWidth = 280;

                // 主卡边界
                const promptTop = pos.y - promptHeight;
                const promptBottom = pos.y;
                const promptLeft = pos.x - promptWidth / 2;
                const promptRight = pos.x + promptWidth / 2;

                // 副卡边界
                const imgTop = childImg.position.y - imgHeight;
                const imgBottom = childImg.position.y;
                const imgLeft = childImg.position.x - imgWidth / 2;
                const imgRight = childImg.position.x + imgWidth / 2;

                // 检测重叠
                const horizontalOverlap = promptLeft < imgRight + REPULSION_THRESHOLD &&
                    promptRight > imgLeft - REPULSION_THRESHOLD;
                const verticalOverlap = promptTop < imgBottom + REPULSION_THRESHOLD &&
                    promptBottom > imgTop - REPULSION_THRESHOLD;

                if (horizontalOverlap && verticalOverlap) {
                    // 计算中心距离
                    const promptCenterX = pos.x;
                    const promptCenterY = pos.y - promptHeight / 2;
                    const imgCenterX = childImg.position.x;
                    const imgCenterY = childImg.position.y - imgHeight / 2;

                    const centerDx = promptCenterX - imgCenterX;
                    const centerDy = promptCenterY - imgCenterY;
                    const dist = Math.sqrt(centerDx * centerDx + centerDy * centerDy) || 1;

                    // 如果太近,弹开主卡
                    if (dist < MIN_DISTANCE) {
                        const pushRatio = MIN_DISTANCE / dist;
                        finalPos = {
                            x: imgCenterX + centerDx * pushRatio,
                            y: imgCenterY + centerDy * pushRatio + promptHeight / 2
                        };
                    }
                }
            }

            return {
                ...c,
                promptNodes: c.promptNodes.map(n => n.id === id ? { ...n, position: finalPos } : n),
                imageNodes: c.imageNodes // 副卡位置不变
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

            // 辅助函数:当副卡靠近主卡时,推开主卡(实时磁铁效果)
            const pushPromptAwayFromImage = (
                imgPos: { x: number; y: number },
                imgNode: typeof node,
                promptNodes: typeof c.promptNodes
            ): typeof c.promptNodes => {
                // Debug log
                console.log('[Repulsion] Checking:', imgNode.id, 'parentPromptId:', imgNode.parentPromptId);

                if (!imgNode.parentPromptId) {
                    console.log('[Repulsion] No parentPromptId, skipping');
                    return promptNodes;
                }

                const parentPrompt = promptNodes.find(p => p.id === imgNode.parentPromptId);
                if (!parentPrompt) {
                    console.log('[Repulsion] Parent prompt not found');
                    return promptNodes;
                }

                // 排斥参数
                const REPULSION_ZONE = 20; // 边界外多少像素开始排斥
                const PUSH_STRENGTH = 1.5; // 推力强度

                const promptHeight = parentPrompt.height || 200;
                const promptWidth = 320;
                const imgHeight = 200;
                const imgWidth = 280;

                // 主卡边界 (position是底部中心)
                const promptTop = parentPrompt.position.y - promptHeight;
                const promptBottom = parentPrompt.position.y;
                const promptLeft = parentPrompt.position.x - promptWidth / 2;
                const promptRight = parentPrompt.position.x + promptWidth / 2;

                // 副卡边界 (position是底部中心)
                const imgTop = imgPos.y - imgHeight;
                const imgBottom = imgPos.y;
                const imgLeft = imgPos.x - imgWidth / 2;
                const imgRight = imgPos.x + imgWidth / 2;

                // 检测边界框是否重叠或接近
                const horizontalOverlap = imgRight > promptLeft - REPULSION_ZONE && imgLeft < promptRight + REPULSION_ZONE;
                const verticalOverlap = imgBottom > promptTop - REPULSION_ZONE && imgTop < promptBottom + REPULSION_ZONE;

                console.log('[Repulsion] Overlap check:', { horizontalOverlap, verticalOverlap });

                if (horizontalOverlap && verticalOverlap) {
                    // 计算推开方向和距离
                    const imgCenterX = imgPos.x;
                    const imgCenterY = imgPos.y - imgHeight / 2;
                    const promptCenterX = parentPrompt.position.x;
                    const promptCenterY = parentPrompt.position.y - promptHeight / 2;

                    // 方向向量 (从副卡指向主卡的反方向)
                    let pushX = promptCenterX - imgCenterX;
                    let pushY = promptCenterY - imgCenterY;

                    // 归一化并乘以推力
                    const dist = Math.sqrt(pushX * pushX + pushY * pushY) || 1;
                    const pushAmount = Math.max(0, (REPULSION_ZONE + 50) - dist) * PUSH_STRENGTH;

                    pushX = (pushX / dist) * pushAmount;
                    pushY = (pushY / dist) * pushAmount;

                    console.log('[Repulsion] Pushing prompt by:', { pushX, pushY });

                    // 更新主卡位置
                    return promptNodes.map(p =>
                        p.id === parentPrompt.id
                            ? { ...p, position: { x: p.position.x + pushX, y: p.position.y + pushY } }
                            : p
                    );
                }
                return promptNodes;
            };

            // GROUP MOVE LOGIC
            if (!ignoreSelection) {
                const selectedIds = new Set(state.selectedNodeIds || []);
                if (selectedIds.has(id)) {
                    // 先应用排斥效果
                    let newPromptNodes = pushPromptAwayFromImage(pos, node, c.promptNodes);

                    newPromptNodes = newPromptNodes.map(n => {
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

            // SINGLE MOVE - 副卡拖动时推开主卡
            const updatedPromptNodes = pushPromptAwayFromImage(pos, node, c.promptNodes);

            return {
                ...c,
                promptNodes: updatedPromptNodes,
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
            selectedNodeIds: [],
            subCardLayoutMode: 'row',
            viewportCenter: { x: 0, y: 0 }
        });
    }, [state.canvases]);

    /**
     * Arrange all nodes: Group by project (prompt + child images)
     * - Each project: prompt on top, images below (vertical)
     * - Projects arranged left-to-right (horizontal)
     * - No overlapping
     */
    const arrangeAllNodes = useCallback((mode: ArrangeMode = 'grid') => {
        pushToHistory(); // Allow undo

        // --- Configuration ---
        const PROMPT_WIDTH = 320;
        const PROMPT_HEIGHT = 160; // Base height, dynamic in reality but fixed for grid slot
        const GAP_X = 100;  // ✅ 增大水平间距防止堆叠
        const GAP_Y = 120;  // ✅ 增大垂直间距防止堆叠
        const IMAGE_GAP = 40; // ✅ 增大图片间距

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

                // [NEW] 单选主卡时: 对其副卡应用排列模式轮换
                if (isPromptOnly && selectedPrompts.length === 1) {
                    const prompt = selectedPrompts[0];
                    const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);

                    if (childImages.length > 0) {
                        const currentMode = state.subCardLayoutMode;
                        const SUB_GAP = 16;
                        const PROMPT_TO_SUB_GAP = 60;

                        // 计算副卡尺寸
                        const imageDims = childImages.map(img => getImageDims(img.aspectRatio, img.dimensions));
                        const avgWidth = imageDims.reduce((sum, d) => sum + d.w, 0) / imageDims.length;
                        const avgHeight = imageDims.reduce((sum, d) => sum + d.h, 0) / imageDims.length;

                        const newImagePositions: Record<string, { x: number, y: number }> = {};
                        const promptCenterX = prompt.position.x;
                        const promptBottom = prompt.position.y;

                        if (currentMode === 'row') {
                            // 横向排列: 副卡水平排成一行,居中对齐
                            const totalWidth = childImages.length * avgWidth + (childImages.length - 1) * SUB_GAP;
                            let currentX = promptCenterX - totalWidth / 2 + avgWidth / 2;
                            const y = promptBottom + PROMPT_TO_SUB_GAP + avgHeight;

                            childImages.forEach((img, i) => {
                                const dims = imageDims[i];
                                newImagePositions[img.id] = { x: currentX, y };
                                currentX += dims.w + SUB_GAP;
                            });
                        } else if (currentMode === 'grid') {
                            // 宫格排列: 4列网格,居中对齐
                            const columns = Math.min(4, childImages.length);
                            const rows = Math.ceil(childImages.length / columns);
                            const totalWidth = columns * avgWidth + (columns - 1) * SUB_GAP;
                            const startX = promptCenterX - totalWidth / 2 + avgWidth / 2;
                            const startY = promptBottom + PROMPT_TO_SUB_GAP + avgHeight;

                            childImages.forEach((img, i) => {
                                const col = i % columns;
                                const row = Math.floor(i / columns);
                                newImagePositions[img.id] = {
                                    x: startX + col * (avgWidth + SUB_GAP),
                                    y: startY + row * (avgHeight + SUB_GAP)
                                };
                            });
                        } else {
                            // 竖向排列: 副卡垂直排成一列,居中对齐
                            let currentY = promptBottom + PROMPT_TO_SUB_GAP + avgHeight;

                            childImages.forEach((img, i) => {
                                const dims = imageDims[i];
                                newImagePositions[img.id] = { x: promptCenterX, y: currentY };
                                currentY += dims.h + SUB_GAP;
                            });
                        }

                        // 轮换到下一个模式
                        const nextMode: SubCardLayout = currentMode === 'row' ? 'grid' : currentMode === 'grid' ? 'column' : 'row';

                        // 应用位置变更
                        const newCanvases = state.canvases.map(c => {
                            if (c.id !== state.activeCanvasId) return c;
                            return {
                                ...c,
                                imageNodes: c.imageNodes.map(img =>
                                    newImagePositions[img.id] ? { ...img, position: newImagePositions[img.id] } : img
                                ),
                                lastModified: Date.now()
                            };
                        });

                        setState(prev => ({ ...prev, canvases: newCanvases, subCardLayoutMode: nextMode }));
                        return;
                    }
                }

                // 2. Identify Roots & Sync Mode
                let roots: any[] = [];
                let syncChildren = false;

                if (isPromptOnly) {
                    // [MODE A] Prompt Only: 🚀 改为同步子卡，实现卡组整体整理
                    roots = selectedPrompts.map(p => ({
                        id: p.id, type: 'prompt', obj: p,
                        x: p.position.x, y: p.position.y,
                        width: PROMPT_WIDTH, height: p.height || 200,
                        visualCx: p.position.x, visualCy: p.position.y - (p.height || 200) / 2
                    }));
                    syncChildren = true; // 🚀 启用子卡同步，让副卡跟随主卡移动
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
                    // 2. 使用传入的mode确定策略
                    const strategy: 'matrix' | 'row' | 'column' = mode === 'grid' ? 'matrix' : mode;
                    const GAP = 80; // 分组间距
                    const GRID_COLUMNS = 6; // 宫格模式固定6列

                    // 3. Arrange
                    const newPositions: Record<string, { x: number, y: number }> = {};

                    if (strategy === 'matrix') {
                        // Grid Sort: Rough Row-Major
                        roots.sort((a, b) => {
                            if (Math.abs(a.visualCy - b.visualCy) > 200) return a.visualCy - b.visualCy;
                            return a.visualCx - b.visualCx;
                        });

                        // 使用固定6列
                        const columns = GRID_COLUMNS;
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
                // ✅ 框选整理: 按卡组处理,支持副卡顶部对齐和就近原则

                // 1. 构建卡组列表 (类似全局整理)
                const SUB_COLUMNS = 4; // 副卡4列
                const SUB_IMAGE_GAP = 16;
                const PROMPT_TO_SUB_GAP = 60;
                const GROUP_GAP_X = 100;
                const GROUP_GAP_Y = 160;

                type SelectionGroup = {
                    prompt?: typeof selectedPrompts[0];
                    images: typeof selectedImages;
                    width: number;
                    height: number;
                    originalX: number;
                    originalY: number;
                };

                const groups: SelectionGroup[] = [];
                const processedImageIds = new Set<string>();

                // 2a. 处理选中的主卡及其副卡
                selectedPrompts.forEach(prompt => {
                    const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);
                    const promptHeight = prompt.height || 200;

                    let maxSubWidth = 0;
                    let maxSubHeight = 0;
                    childImages.forEach(img => {
                        const dims = getImageDims(img.aspectRatio, img.dimensions);
                        maxSubWidth = Math.max(maxSubWidth, dims.w);
                        maxSubHeight = Math.max(maxSubHeight, dims.h);
                        processedImageIds.add(img.id);
                    });

                    const actualColumns = Math.min(SUB_COLUMNS, childImages.length);
                    const rows = Math.ceil(childImages.length / SUB_COLUMNS);
                    const subBlockWidth = actualColumns > 0 ? actualColumns * maxSubWidth + (actualColumns - 1) * SUB_IMAGE_GAP : 0;
                    const subBlockHeight = rows > 0 ? rows * maxSubHeight + (rows - 1) * SUB_IMAGE_GAP : 0;

                    const groupWidth = Math.max(PROMPT_WIDTH, subBlockWidth);
                    const groupHeight = promptHeight + (childImages.length > 0 ? PROMPT_TO_SUB_GAP + subBlockHeight : 0);

                    groups.push({
                        prompt,
                        images: childImages,
                        width: groupWidth,
                        height: groupHeight,
                        originalX: prompt.position.x,
                        originalY: prompt.position.y
                    });
                });

                // 2b. 处理选中但无主卡的孤立副卡
                selectedImages.filter(img => !processedImageIds.has(img.id)).forEach(img => {
                    const dims = getImageDims(img.aspectRatio, img.dimensions);
                    groups.push({
                        images: [img],
                        width: dims.w,
                        height: dims.h + 200 + PROMPT_TO_SUB_GAP, // 假设有主卡高度
                        originalX: img.position.x,
                        originalY: img.position.y
                    });
                });

                if (groups.length === 0) return;

                // 3. 按原位置排序 (就近原则)
                groups.sort((a, b) => {
                    const rowDiff = Math.floor(a.originalY / 200) - Math.floor(b.originalY / 200);
                    if (rowDiff !== 0) return rowDiff;
                    return a.originalX - b.originalX;
                });

                // 4. 计算选中区域中心 (就近原则)
                const centerX = groups.reduce((sum, g) => sum + g.originalX, 0) / groups.length;
                const centerY = groups.reduce((sum, g) => sum + g.originalY, 0) / groups.length;

                // 5. 两遍处理: 先分行,再设置位置
                const gridColumns = Math.ceil(Math.sqrt(groups.length));
                const layoutRows: Array<{ groups: SelectionGroup[]; maxPromptHeight: number; maxTotalHeight: number }> = [];
                let currentRow: typeof layoutRows[0] = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0 };

                groups.forEach((group, i) => {
                    if (currentRow.groups.length >= gridColumns) {
                        layoutRows.push(currentRow);
                        currentRow = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0 };
                    }
                    currentRow.groups.push(group);
                    const promptHeight = group.prompt?.height || 200;
                    currentRow.maxPromptHeight = Math.max(currentRow.maxPromptHeight, promptHeight);
                    currentRow.maxTotalHeight = Math.max(currentRow.maxTotalHeight, group.height);
                });
                if (currentRow.groups.length > 0) layoutRows.push(currentRow);

                // 6. 计算总尺寸并从中心点开始布局
                const maxGroupWidth = Math.max(...groups.map(g => g.width));
                const totalLayoutWidth = gridColumns * maxGroupWidth + (gridColumns - 1) * GROUP_GAP_X;
                const totalLayoutHeight = layoutRows.reduce((sum, r) => sum + r.maxTotalHeight, 0) + (layoutRows.length - 1) * GROUP_GAP_Y;
                const startX = centerX - totalLayoutWidth / 2;
                let startY = centerY - totalLayoutHeight / 2;

                const newPositions: Record<string, { x: number; y: number }> = {};
                const movedPrompts = new Set<string>();

                // 7. 设置位置 (副卡顶部对齐)
                layoutRows.forEach(layoutRow => {
                    let rowX = startX;
                    const rowMaxPromptHeight = layoutRow.maxPromptHeight;
                    const subCardsStartY = startY + rowMaxPromptHeight + PROMPT_TO_SUB_GAP;

                    layoutRow.groups.forEach(group => {
                        // 🚀 [修复] 使用当前组的实际宽度计算中心点
                        const groupCenterX = rowX + group.width / 2;

                        if (group.prompt) {
                            newPositions[group.prompt.id] = {
                                x: groupCenterX,
                                y: startY + rowMaxPromptHeight
                            };
                            movedPrompts.add(group.prompt.id);

                            // 副卡位置
                            if (group.images.length > 0) {
                                const imageDims = group.images.map(img => getImageDims(img.aspectRatio, img.dimensions));
                                const maxWidth = Math.max(...imageDims.map(d => d.w));
                                const maxHeight = Math.max(...imageDims.map(d => d.h));
                                const actualColumns = Math.min(SUB_COLUMNS, group.images.length);
                                const blockWidth = actualColumns * maxWidth + (actualColumns - 1) * SUB_IMAGE_GAP;
                                const blockStartX = groupCenterX - blockWidth / 2;

                                group.images.forEach((img, i) => {
                                    const col = i % SUB_COLUMNS;
                                    const imgRow = Math.floor(i / SUB_COLUMNS);
                                    const cardCenterX = blockStartX + col * (maxWidth + SUB_IMAGE_GAP) + maxWidth / 2;
                                    const cardTopY = subCardsStartY + imgRow * (maxHeight + SUB_IMAGE_GAP);
                                    const dims = imageDims[i];
                                    newPositions[img.id] = { x: cardCenterX, y: cardTopY + dims.h };
                                });
                            }
                        } else if (group.images[0]) {
                            // 孤立副卡
                            const img = group.images[0];
                            const dims = getImageDims(img.aspectRatio, img.dimensions);
                            newPositions[img.id] = { x: groupCenterX, y: subCardsStartY + dims.h };
                        }

                        // 🚀 [修复] 使用当前组的实际宽度而不是maxGroupWidth，防止重叠
                        rowX += group.width + GROUP_GAP_X;
                    });

                    startY += layoutRow.maxTotalHeight + GROUP_GAP_Y;
                });

                // 8. 应用位置
                const newCanvases = state.canvases.map(c => {
                    if (c.id !== state.activeCanvasId) return c;
                    return {
                        ...c,
                        promptNodes: c.promptNodes.map(pn => newPositions[pn.id] ? { ...pn, position: newPositions[pn.id] } : pn),
                        imageNodes: c.imageNodes.map(img => newPositions[img.id] ? { ...img, position: newPositions[img.id] } : img),
                        lastModified: Date.now()
                    };
                });

                setState(prev => ({ ...prev, canvases: newCanvases }));
                return;
            }
        }

        // --- 新布局逻辑: 从左上角开始,每行20组 ---
        // 配置
        const GROUPS_PER_ROW = 20;  // 每行20个卡组
        const GROUP_GAP_X = 100;    // ✅ 卡组之间的横向间距 (增加防止重叠)
        const GROUP_GAP_Y = 160;    // ✅ 行之间的纵向间距 (增加防止重叠)
        const SUB_CARD_GAP = 20;    // 子卡片之间的间距
        const START_X = -2000;      // 画布左上角起始X
        const START_Y = 200;        // 画布左上角起始Y

        // 1. 分类卡片
        const errorPrompts = currentCanvas.promptNodes.filter(p => p.error);
        const errorPromptIds = new Set(errorPrompts.map(p => p.id));

        // 正确的Prompt卡(有子卡的)
        const normalPrompts = currentCanvas.promptNodes.filter(p =>
            !errorPromptIds.has(p.id) &&
            currentCanvas.imageNodes.some(img => img.parentPromptId === p.id)
        );

        // 孤独的Prompt卡(没有子卡的)
        const orphanPrompts = currentCanvas.promptNodes.filter(p =>
            !errorPromptIds.has(p.id) &&
            !currentCanvas.imageNodes.some(img => img.parentPromptId === p.id)
        );

        // 孤独的Image卡(没有父Prompt的)
        const orphanImages = currentCanvas.imageNodes.filter(img =>
            !img.parentPromptId ||
            !currentCanvas.promptNodes.some(p => p.id === img.parentPromptId)
        );

        // 2. 构建卡组列表
        type LayoutGroupType = 'normal' | 'orphan-prompt' | 'orphan-image' | 'error';
        const layoutGroups: Array<{
            type: LayoutGroupType;
            prompt?: typeof normalPrompts[0];
            images: typeof currentCanvas.imageNodes;
            width: number;
            height: number;
        }> = [];

        // 2a. 正确的卡组(Prompt + 子Image)
        const SUB_COLUMNS = 4; // ✅ 副卡横向4列
        const SUB_IMAGE_GAP = 16; // 子卡间距
        const PROMPT_TO_SUB_GAP = 60; // 主卡和副卡之间的间距 (行间距的1/2)

        normalPrompts.forEach(prompt => {
            const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);
            const promptWidth = 320;
            const promptHeight = prompt.height || 200;

            // 计算子卡尺寸
            let maxSubWidth = 0;
            let maxSubHeight = 0;
            childImages.forEach(img => {
                const dims = getImageDims(img.aspectRatio, img.dimensions);
                maxSubWidth = Math.max(maxSubWidth, dims.w);
                maxSubHeight = Math.max(maxSubHeight, dims.h);
            });

            // 实际列数 (不超过图片数量)
            const actualColumns = Math.min(SUB_COLUMNS, childImages.length);
            const rows = Math.ceil(childImages.length / SUB_COLUMNS);

            // 子卡块尺寸
            const subBlockWidth = actualColumns > 0
                ? actualColumns * maxSubWidth + (actualColumns - 1) * SUB_IMAGE_GAP
                : 0;
            const subBlockHeight = rows > 0
                ? rows * maxSubHeight + (rows - 1) * SUB_IMAGE_GAP
                : 0;

            // 卡组总宽度和高度
            const groupWidth = Math.max(promptWidth, subBlockWidth);
            const groupHeight = promptHeight + (childImages.length > 0 ? PROMPT_TO_SUB_GAP + subBlockHeight : 0);

            layoutGroups.push({
                type: 'normal',
                prompt,
                images: childImages,
                width: groupWidth,
                height: groupHeight
            });
        });

        // 2b. 孤独的Prompt卡
        orphanPrompts.forEach(prompt => {
            layoutGroups.push({
                type: 'orphan-prompt',
                prompt,
                images: [],
                width: 320,
                height: prompt.height || 200
            });
        });

        // 2c. 孤独的Image卡
        orphanImages.forEach(img => {
            const dims = getImageDims(img.aspectRatio, img.dimensions);
            layoutGroups.push({
                type: 'orphan-image',
                images: [img],
                width: dims.w,
                height: dims.h
            });
        });

        // 3. 布局正常卡组 + 孤独卡组 (每行20组或超出最大宽度)
        // ✅ 两遍处理: 
        //   第一遍: 分配卡组到行,计算每行的最大主卡高度
        //   第二遍: 根据每行的最大主卡高度设置位置,实现副卡顶部对齐

        const STANDARD_CARD_WIDTH = 320;
        const MAX_ROW_WIDTH = GROUPS_PER_ROW * (STANDARD_CARD_WIDTH + GROUP_GAP_X);

        // ✅ 第一遍: 将卡组分配到行
        const rows: Array<{
            groups: typeof layoutGroups;
            maxPromptHeight: number;  // 该行最高主卡高度
            maxTotalHeight: number;   // 该行最高卡组总高度
            startX: number;
        }> = [];

        let currentX = START_X;
        let currentRow: typeof rows[0] = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0, startX: START_X };

        layoutGroups.forEach((group) => {
            const willExceedWidth = (currentX - START_X + group.width + GROUP_GAP_X) > MAX_ROW_WIDTH;
            const groupsInCurrentRow = currentRow.groups.length;

            // 换行检查
            if (groupsInCurrentRow >= GROUPS_PER_ROW || (groupsInCurrentRow > 0 && willExceedWidth)) {
                rows.push(currentRow);
                currentX = START_X;
                currentRow = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0, startX: START_X };
            }

            // 添加到当前行
            currentRow.groups.push(group);

            // 更新该行最大主卡高度
            const promptHeight = group.prompt?.height || 200;
            currentRow.maxPromptHeight = Math.max(currentRow.maxPromptHeight, promptHeight);
            currentRow.maxTotalHeight = Math.max(currentRow.maxTotalHeight, group.height);

            currentX += group.width + GROUP_GAP_X;
        });

        // 添加最后一行
        if (currentRow.groups.length > 0) {
            rows.push(currentRow);
        }

        // ✅ 第二遍: 根据每行的最大主卡高度设置位置
        const positions: { [id: string]: { x: number; y: number } } = {};
        let currentY = START_Y;

        rows.forEach((row) => {
            let rowX = START_X;
            const rowMaxPromptHeight = row.maxPromptHeight; // 该行最高主卡高度
            const subCardsStartY = currentY + rowMaxPromptHeight + PROMPT_TO_SUB_GAP; // ✅ 该行所有副卡的顶部Y

            row.groups.forEach((group) => {
                const groupCenterX = rowX + group.width / 2;

                if (group.type === 'normal' && group.prompt) {
                    // ✅ 主卡位置: 底部与该行最高主卡底部对齐
                    const promptHeight = group.prompt.height || 200;
                    positions[group.prompt.id] = {
                        x: groupCenterX,
                        y: currentY + rowMaxPromptHeight  // 所有主卡底部对齐到该行最高主卡底部
                    };

                    // ✅ 子卡位置: 所有副卡顶部对齐到 subCardsStartY
                    if (group.images.length > 0) {
                        const imageDims = group.images.map(img => getImageDims(img.aspectRatio, img.dimensions));
                        const maxWidth = Math.max(...imageDims.map(d => d.w));
                        const maxHeight = Math.max(...imageDims.map(d => d.h));

                        const actualColumns = Math.min(SUB_COLUMNS, group.images.length);
                        const blockWidth = actualColumns * maxWidth + (actualColumns - 1) * SUB_IMAGE_GAP;
                        const blockStartX = groupCenterX - blockWidth / 2;

                        group.images.forEach((img, i) => {
                            const col = i % SUB_COLUMNS;
                            const imgRow = Math.floor(i / SUB_COLUMNS);
                            const cardCenterX = blockStartX + col * (maxWidth + SUB_IMAGE_GAP) + maxWidth / 2;
                            // ✅ 副卡顶部对齐: 使用该行统一的副卡起始Y
                            const cardTopY = subCardsStartY + imgRow * (maxHeight + SUB_IMAGE_GAP);
                            const dims = imageDims[i];
                            positions[img.id] = {
                                x: cardCenterX,
                                y: cardTopY + dims.h  // 底部锚点
                            };
                        });
                    }
                } else if (group.type === 'orphan-prompt' && group.prompt) {
                    // 孤立主卡: 底部与该行最高主卡底部对齐
                    positions[group.prompt.id] = {
                        x: groupCenterX,
                        y: currentY + rowMaxPromptHeight
                    };
                } else if (group.type === 'orphan-image' && group.images[0]) {
                    // ✅ 孤立副卡: 顶部与该行其他副卡对齐
                    const img = group.images[0];
                    const dims = getImageDims(img.aspectRatio, img.dimensions);
                    positions[img.id] = {
                        x: groupCenterX,
                        y: subCardsStartY + dims.h  // 底部锚点
                    };
                }

                rowX += group.width + GROUP_GAP_X;
            });

            // 下一行起始Y = 当前行所有卡组的最大总高度 + 行间距
            currentY += row.maxTotalHeight + GROUP_GAP_Y;
        });

        // 4. 错误卡片单独换行排列
        if (errorPrompts.length > 0) {
            // 新行开始 - ✅ 使用新的局部变量
            let errorX = START_X;
            let errorRowMaxHeight = 0;
            let errorGroupsInRow = 0;
            currentY += GROUP_GAP_Y + 50; // 额外50px分隔

            const ERROR_GAP_X = 40; // 错误卡片之间更紧凑

            errorPrompts.forEach(prompt => {
                const promptWidth = 320;
                const promptHeight = prompt.height || 200;
                const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);

                // 计算错误卡组尺寸 (使用与正常卡组相同的4列布局)
                let groupWidth = promptWidth;
                let groupHeight = promptHeight;

                if (childImages.length > 0) {
                    let maxSubWidth = 0;
                    let maxSubHeight = 0;
                    childImages.forEach(img => {
                        const dims = getImageDims(img.aspectRatio, img.dimensions);
                        maxSubWidth = Math.max(maxSubWidth, dims.w);
                        maxSubHeight = Math.max(maxSubHeight, dims.h);
                    });
                    const actualColumns = Math.min(SUB_COLUMNS, childImages.length);
                    const rows = Math.ceil(childImages.length / SUB_COLUMNS);
                    const subBlockWidth = actualColumns * maxSubWidth + (actualColumns - 1) * SUB_IMAGE_GAP;
                    const subBlockHeight = rows * maxSubHeight + (rows - 1) * SUB_IMAGE_GAP;
                    groupWidth = Math.max(promptWidth, subBlockWidth);
                    groupHeight = promptHeight + PROMPT_TO_SUB_GAP + subBlockHeight;
                }

                // 换行检查
                if (errorGroupsInRow >= GROUPS_PER_ROW) {
                    errorX = START_X;
                    currentY += errorRowMaxHeight + GROUP_GAP_Y;
                    errorRowMaxHeight = 0;
                    errorGroupsInRow = 0;
                }

                const groupCenterX = errorX + groupWidth / 2;

                // Prompt位置
                positions[prompt.id] = {
                    x: groupCenterX,
                    y: currentY + promptHeight
                };

                // 子Image位置: 横向4列居中,顶部对齐
                if (childImages.length > 0) {
                    const promptBottom = currentY + promptHeight + PROMPT_TO_SUB_GAP;

                    // 计算子卡尺寸
                    const imageDims = childImages.map(img => getImageDims(img.aspectRatio, img.dimensions));
                    const maxWidth = Math.max(...imageDims.map(d => d.w));
                    const maxHeight = Math.max(...imageDims.map(d => d.h));

                    // 计算实际列数
                    const actualColumns = Math.min(SUB_COLUMNS, childImages.length);
                    const blockWidth = actualColumns * maxWidth + (actualColumns - 1) * SUB_IMAGE_GAP;
                    const blockStartX = groupCenterX - blockWidth / 2;

                    childImages.forEach((img, i) => {
                        const col = i % SUB_COLUMNS;
                        const row = Math.floor(i / SUB_COLUMNS);
                        const cardCenterX = blockStartX + col * (maxWidth + SUB_IMAGE_GAP) + maxWidth / 2;
                        // 顶部对齐: y = 顶部位置 + 卡片高度 (底部锚点)
                        const cardTopY = promptBottom + row * (maxHeight + SUB_IMAGE_GAP);
                        const dims = imageDims[i];
                        positions[img.id] = {
                            x: cardCenterX,
                            y: cardTopY + dims.h
                        };
                    });
                }

                errorX += groupWidth + ERROR_GAP_X;
                errorRowMaxHeight = Math.max(errorRowMaxHeight, groupHeight);
                errorGroupsInRow++;
            });
        }

        setState(prev => {
            // 🚀 使用prev获取最新状态，重新计算newCanvases
            const updatedCanvases = prev.canvases.map(c =>
                c.id === prev.activeCanvasId ? {
                    ...c,
                    promptNodes: c.promptNodes.map(pn => ({ ...pn, position: positions[pn.id] || pn.position })),
                    imageNodes: c.imageNodes.map(img => ({ ...img, position: positions[img.id] || img.position })),
                    lastModified: Date.now()
                } : c
            );

            // Force Save - 使用更新后的状态
            if (!prev.fileSystemHandle) {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({
                        ...prev,
                        canvases: stripImageUrls(updatedCanvases),
                        history: {}
                    }));
                } catch (e) {
                    console.error('Failed to save layout:', e);
                }
            }

            return { ...prev, canvases: updatedCanvases };
        });

    }, [pushToHistory]); // 🚀 移除state依赖，使用函数式更新

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
                // 🚀 不再调用getAllImages，只迁移当前状态需要的图片

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

                // 🚀 只迁移当前状态实际需要的图片
                const promises: Promise<void>[] = [];
                state.canvases.forEach(c => {
                    c.imageNodes.forEach(img => {
                        if (img.id && img.url) {
                            promises.push(saveToDisk(img.id, img.url));
                        }
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
    const selectNodes = useCallback((ids: string[], mode: 'replace' | 'add' | 'remove' | 'toggle' = 'replace') => {
        setState(prev => {
            const current = new Set(prev.selectedNodeIds || []);

            switch (mode) {
                case 'replace':
                    // 完全替换选择
                    return { ...prev, selectedNodeIds: ids };

                case 'add':
                    // 添加到选择（Shift+框选）
                    ids.forEach(id => current.add(id));
                    return { ...prev, selectedNodeIds: Array.from(current) };

                case 'remove':
                    // 从选择中移除（Alt+框选）
                    ids.forEach(id => current.delete(id));
                    return { ...prev, selectedNodeIds: Array.from(current) };

                case 'toggle':
                    // 切换选择（Ctrl+点击）
                    ids.forEach(id => {
                        if (current.has(id)) {
                            current.delete(id);
                        } else {
                            current.add(id);
                        }
                    });
                    return { ...prev, selectedNodeIds: Array.from(current) };

                default:
                    return { ...prev, selectedNodeIds: ids };
            }
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

    // 🚀 视口中心动态加载 - 使用useCallback防止无限循环
    const setViewportCenter = useCallback((center: { x: number; y: number }) => {
        setState(prev => ({ ...prev, viewportCenter: center }));
    }, []);

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
            isReady: !isLoading,
            // 🚀 视口中心动态加载（使用useCallback版本防止无限循环）
            setViewportCenter,
            // 🚀 迁移选中节点到其他项目
            migrateNodes: (nodeIds: string[], targetCanvasId: string) => {
                setState(prev => {
                    const sourceCanvas = prev.canvases.find(c => c.id === prev.activeCanvasId);
                    const targetCanvas = prev.canvases.find(c => c.id === targetCanvasId);
                    if (!sourceCanvas || !targetCanvas) return prev;

                    // 找出要迁移的节点
                    const promptsToMigrate = sourceCanvas.promptNodes.filter(n => nodeIds.includes(n.id));
                    const imagesToMigrate = sourceCanvas.imageNodes.filter(n => nodeIds.includes(n.id));

                    // 如果迁移的是主卡,也迁移其子图片
                    const childImageIds = promptsToMigrate.flatMap(p => p.childImageIds || []);
                    const childImagesToMigrate = sourceCanvas.imageNodes.filter(n => childImageIds.includes(n.id) && !nodeIds.includes(n.id));

                    // 计算偏移量(放在目标画布右侧)
                    const offsetX = targetCanvas.promptNodes.length > 0
                        ? Math.max(...targetCanvas.promptNodes.map(n => n.position.x)) + 500
                        : 0;

                    // 更新迁移节点的位置 - 🔧 保留图片URL确保能正确显示
                    const migratedPrompts = promptsToMigrate.map(p => ({
                        ...p,
                        position: { x: p.position.x + offsetX, y: p.position.y }
                    }));
                    const migratedImages = [...imagesToMigrate, ...childImagesToMigrate].map(img => ({
                        ...img,
                        position: { x: img.position.x + offsetX, y: img.position.y },
                        // 🔧 关键：确保URL完整保留以便存储层能正确保存
                        url: img.url || '',
                        originalUrl: img.originalUrl || ''
                    }));

                    // 🔧 迁移后立即保存图片到IndexedDB（异步，不阻塞UI）
                    (async () => {
                        try {
                            const { saveImage, getImage } = await import('../services/imageStorage');
                            for (const img of migratedImages) {
                                // 确保图片已存在于IndexedDB
                                const existingUrl = await getImage(img.id);
                                if (!existingUrl && (img.url || img.originalUrl)) {
                                    const urlToSave = img.originalUrl || img.url;
                                    if (urlToSave && !urlToSave.startsWith('blob:')) {
                                        await saveImage(img.id, urlToSave);
                                        console.log(`[MigrateNodes] Saved image ${img.id} to IndexedDB`);
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[MigrateNodes] Failed to save images to IndexedDB', e);
                        }
                    })();

                    // 从源画布删除,添加到目标画布
                    const allMigratedImageIds = [...imagesToMigrate, ...childImagesToMigrate].map(i => i.id);
                    const updatedCanvases = prev.canvases.map(c => {
                        if (c.id === prev.activeCanvasId) {
                            return {
                                ...c,
                                promptNodes: c.promptNodes.filter(n => !nodeIds.includes(n.id)),
                                imageNodes: c.imageNodes.filter(n => !allMigratedImageIds.includes(n.id)),
                                lastModified: Date.now()
                            };
                        }
                        if (c.id === targetCanvasId) {
                            return {
                                ...c,
                                promptNodes: [...c.promptNodes, ...migratedPrompts],
                                imageNodes: [...c.imageNodes, ...migratedImages],
                                lastModified: Date.now()
                            };
                        }
                        return c;
                    });

                    console.log(`[MigrateNodes] Migrated ${migratedPrompts.length} prompts, ${migratedImages.length} images to canvas ${targetCanvasId}`);
                    return { ...prev, canvases: updatedCanvases, selectedNodeIds: [] };
                });
            }
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
