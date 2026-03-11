import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react';
import { Canvas, PromptNode, GeneratedImage, AspectRatio, CanvasGroup, CanvasDrawing, GenerationMode } from '../types';
import { saveImage, getImage, deleteImage, getAllImages, clearAllImages, getImagesPage, getImageCount } from '../services/storage/imageStorage';
import { syncService } from '../services/system/syncService';
import { fileSystemService } from '../services/storage/fileSystemService';
import { dataURLToBlob as base64ToBlob, safeRevokeBlobUrl } from '../utils/blobUtils';
import { calculateImageHash } from '../utils/imageUtils';
import { getCardDimensions } from '../utils/styleUtils';
import { supabase } from '../lib/supabase'; // Import supabase for auth check
import { notify } from '../services/system/notificationService';

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
    addImageNodes: (nodes: GeneratedImage[], parentUpdates?: Record<string, Partial<PromptNode>>) => Promise<void>;
    updatePromptNodePosition: (id: string, pos: { x: number; y: number }, options?: { moveChildren?: boolean; ignoreSelection?: boolean }) => void;
    updateImageNodePosition: (id: string, pos: { x: number; y: number }, options?: { ignoreSelection?: boolean }) => void;
    updateImageNodeDimensions: (id: string, dimensions: string) => void;
    updateImageNode: (id: string, updates: Partial<GeneratedImage>) => void; // 🚀 [New] Generic Update
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
    bringNodesToFront: (nodeIds: string[]) => void;
    moveSelectedNodes: (delta: { x: number; y: number }, sourceNodeIdOrIds?: string | string[]) => void;
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
    // 🚀 [Persistence] Urgent state saving for generation tasks
    urgentUpdatePromptNode: (node: PromptNode) => void;
    // 🚀 [Batch Update] Atomic update for multiple nodes (e.g. stacking)
    updateNodes: (updates: {
        promptNodes?: { id: string, updates: Partial<PromptNode> }[],
        imageNodes?: { id: string, updates: Partial<GeneratedImage> }[]
    }) => void;
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
const stripImageUrls = (canvases: Canvas[], aggressive: boolean = false): Canvas[] => {
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
                // [CRITICAL FIX] Keep small reference images in localStorage to prevent data loss on fast refresh.
                // If storage quota is exceeded, we retry with aggressive mode that strips all ref data.
                const shouldKeep = !aggressive && ref.data && ref.data.length < 500000;
                return {
                    ...ref,
                    data: shouldKeep ? ref.data : ''
                };
            })
        }))
    }));
};

const buildStorageState = (state: CanvasState, aggressive: boolean = false): CanvasState => ({
    ...state,
    canvases: stripImageUrls(state.canvases, aggressive),
    history: {},
    fileSystemHandle: null,
    folderName: null
});

const persistCanvasStateToLocalStorage = (state: CanvasState, context: string = 'canvas-save') => {
    const write = (aggressive: boolean) => {
        const serialized = JSON.stringify(buildStorageState(state, aggressive));
        if (!aggressive && serialized.length > 4500000) {
            console.warn(`[CanvasContext] Canvas state approaching localStorage quota limit during ${context}.`);
        }
        localStorage.setItem(STORAGE_KEY, serialized);
        return serialized.length;
    };

    try {
        write(false);
    } catch (error: any) {
        if (error?.name !== 'QuotaExceededError') throw error;

        try {
            const fallbackLength = write(true);
            console.warn(`[CanvasContext] localStorage quota exceeded during ${context}, retried with aggressive payload (${fallbackLength} chars).`);
        } catch (fallbackError) {
            throw fallbackError;
        }
    }
};

export const CanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [state, setState] = useState<CanvasState>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            console.log('[CanvasProvider] localStorage 状态恢复:', stored ? `找到数据 (${stored.length} 字符)` : '无数据');
            if (stored) {
                const parsed: CanvasState = JSON.parse(stored);
                console.log('[CanvasProvider] 解析成功:', `画布数: ${parsed.canvases?.length || 0}`);

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
                    promptNodes: (canvas.promptNodes || []).map(node => {
                        const hasChildren = node.childImageIds && node.childImageIds.length > 0;
                        return {
                            ...node,
                            referenceImages: node.referenceImages || [],
                            parallelCount: node.parallelCount || 1,
                            // 保留 generating 状态以支持 App.tsx 的自动恢复
                            // 🚀 [Critical Fix] 如果节点已经有了关联的子图片，它肯定已经生成完毕了，此时即使 isGenerating 为 true 也就是因为防抖数据未落盘，强制修回到 false，防止被 App.tsx 误认为断连并重试导致报错
                            isGenerating: node.isGenerating && !hasChildren,
                            // 如果它有子图且曾标记错误，也应被视为实际上成功或至少不是“完全失败”，这里可以选择不清除历史 error ，或者直接清掉防冲突
                            error: hasChildren ? undefined : node.error,
                            tags: node.tags || []
                        };
                    }),
                    groups: canvas.groups || [],
                    drawings: canvas.drawings || []
                }));

                // 🚀 [Critical Fix] FileSystemHandle 不能从 localStorage 恢复 (会变成普通对象)
                // 必须强制设为 null，依赖 useEffect + IndexedDB 恢复
                parsed.fileSystemHandle = null;
                // FolderName 可以保留用于 UI 显示，但如果不连接也没意义，不过保留着也没坏处
                // parsed.folderName = null;

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
                import('../services/storage/storagePreference').then(async ({ getLocalFolderHandle }) => {
                    import('../services/system/systemLogService').then(async ({ logInfo, logError }) => {
                        try {
                            const handle = await getLocalFolderHandle();
                            if (handle) {
                                // Verify permission before setting state (Cloud/Web requirement)
                                // @ts-ignore
                                const perm = await handle.queryPermission({ mode: 'readwrite' });
                                if (perm === 'granted') {
                                    logInfo('CanvasContext', `已恢复本地文档夹`, `folder: ${handle.name}`);

                                    // [NEW] Load actual project data from disk to ensure sync
                                    // This overrides localStorage state with the true file state
                                    try {
                                        const { fileSystemService } = await import('../services/storage/fileSystemService');
                                        logInfo('CanvasContext', '开始从硬盘加载项目数据', handle.name);
                                        const { canvases, images, activeCanvasId: savedActiveCanvasId } = await fileSystemService.loadProjectWithThumbs(handle);
                                        logInfo('CanvasContext', '硬盘数据加载完成', `画布数: ${canvases.length}, 图片数: ${images.size}, 活动ID: ${savedActiveCanvasId}`);

                                        // Hydrate IDB images (Background)
                                        for (const [id, data] of images.entries()) {
                                            if (data.url) saveImage(id, data.url).catch(e => console.warn('Cache failed', e));
                                        }

                                        // 🚀 [NEW] 加载参考图映射并用于恢复丢失的参考图
                                        let refUrls = new Map<string, string>();
                                        try {
                                            refUrls = await fileSystemService.loadAllReferenceImages(handle);
                                        } catch (e) {
                                            console.warn('[CanvasContext] Failed to load reference images', e);
                                        }

                                        if (canvases.length > 0) {
                                            setState(prev => {
                                                // 🚀 [关键修复] 合并硬盘的 project.json 和刚从 localStorage 加载的最新 state
                                                // 如果刚刷新页面，localStorage 通常会通过 beforeunload 保存最新状态，
                                                // 而 project.json 可能因为异步来不及写而陈旧，所以要双向合并防覆盖
                                                const mergedCanvases = mergeCanvases(prev.canvases, canvases);
                                                const finalActiveId = resolvePreferredActiveCanvasId(
                                                    prev.activeCanvasId,
                                                    savedActiveCanvasId,
                                                    mergedCanvases
                                                );

                                                return {
                                                    ...prev,
                                                    canvases: mergedCanvases.map(c => {
                                                        // 硬盘数据可能多出已绑定的 url，需要与 merge 后的匹配
                                                        const diskSpecificCanvas = canvases.find(dc => dc.id === c.id);
                                                        return {
                                                            ...c,
                                                            imageNodes: c.imageNodes.map(img => ({
                                                                ...img,
                                                                url: (images.get(img.storageId || img.id)?.url || images.get(img.id)?.url) || img.url || '',
                                                                originalUrl: (images.get(img.storageId || img.id)?.originalUrl || images.get(img.id)?.originalUrl) || img.originalUrl
                                                            })),
                                                            promptNodes: c.promptNodes.map(pn => ({
                                                                ...pn,
                                                                // 🚀 恢复丢失的参考图：如果data为空但有storageId，尝试从refs/恢复
                                                                referenceImages: pn.referenceImages?.map(ref => ({
                                                                    ...ref,
                                                                    ...((!ref.data && ref.storageId && refUrls.has(ref.storageId)) ? {
                                                                        data: refUrls.get(ref.storageId)
                                                                    } : {})
                                                                })) || []
                                                            }))
                                                        };
                                                    }),
                                                    activeCanvasId: finalActiveId,
                                                    fileSystemHandle: handle,
                                                    folderName: handle.name
                                                };
                                            });
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
                                    logInfo('CanvasContext', `本地文档夹权限等待中`, `permission: ${perm}`);
                                }
                            } else {
                                logInfo('CanvasContext', '未找到已保存的本地文档夹', 'no persisted handle found');
                            }
                        } catch (e) {
                            logError('CanvasContext', e, '恢复文档夹句柄失败');
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
                const BATCH_SIZE = 5; // 减小批量大小，避免内存峰值

                for (let i = 0; i < imageIdsArray.length; i += BATCH_SIZE) {
                    const batch = imageIdsArray.slice(i, i + BATCH_SIZE);
                    // 🚀 [OOM修复] 加载MICRO质量（最小缩略图<50KB）而不是THUMBNAIL
                    const { getImageByQuality } = await import('../services/storage/imageStorage');
                    const { ImageQuality } = await import('../services/image/imageQuality');
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
                    console.debug(`[CanvasContext] ${requiredImageIds.size - imageMap.size} images not found in IndexedDB`);
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
                                    // IMPORTANT:
                                    // `storedUrl` here is the MICRO preview loaded for canvas performance,
                                    // not the protected original. Never hydrate it into `originalUrl`,
                                    // otherwise lightbox will mistake the thumbnail for the full image.
                                    originalUrl: img.originalUrl
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

    // Helper: Strip image URLs for storage


    const getCanvasCardCount = (canvas?: Canvas | null): number => {
        if (!canvas) return 0;
        return (canvas.promptNodes?.length || 0) + (canvas.imageNodes?.length || 0);
    };

    const isCanvasEffectivelyEmpty = (canvas?: Canvas | null): boolean => getCanvasCardCount(canvas) === 0;

    const mergeItemsById = <T extends { id: string }>(localItems: T[] = [], diskItems: T[] = []): T[] => {
        const map = new Map<string, T>();
        diskItems.forEach(item => map.set(item.id, item));
        localItems.forEach(item => {
            const existing = map.get(item.id);
            map.set(item.id, existing ? { ...existing, ...item } : item);
        });
        return Array.from(map.values());
    };

    const mergeSingleCanvas = (localCanvas: Canvas, diskCanvas: Canvas): Canvas => {
        const localCount = getCanvasCardCount(localCanvas);
        const diskCount = getCanvasCardCount(diskCanvas);

        if (localCount === 0 && diskCount > 0) {
            return {
                ...localCanvas,
                ...diskCanvas,
                name: diskCanvas.name || localCanvas.name,
                folderName: diskCanvas.folderName || localCanvas.folderName,
                promptNodes: diskCanvas.promptNodes || [],
                imageNodes: diskCanvas.imageNodes || [],
                groups: diskCanvas.groups || [],
                drawings: diskCanvas.drawings || [],
                lastModified: Math.max(localCanvas.lastModified || 0, diskCanvas.lastModified || 0)
            };
        }

        if (diskCount === 0 && localCount > 0) {
            return {
                ...diskCanvas,
                ...localCanvas,
                promptNodes: localCanvas.promptNodes || [],
                imageNodes: localCanvas.imageNodes || [],
                groups: localCanvas.groups || [],
                drawings: localCanvas.drawings || [],
                lastModified: Math.max(localCanvas.lastModified || 0, diskCanvas.lastModified || 0)
            };
        }

        const preferLocal = (localCanvas.lastModified || 0) >= (diskCanvas.lastModified || 0);
        const baseCanvas = preferLocal ? diskCanvas : localCanvas;
        const overrideCanvas = preferLocal ? localCanvas : diskCanvas;

        return {
            ...baseCanvas,
            ...overrideCanvas,
            name: overrideCanvas.name || baseCanvas.name,
            folderName: overrideCanvas.folderName || baseCanvas.folderName,
            promptNodes: mergeItemsById(localCanvas.promptNodes || [], diskCanvas.promptNodes || []),
            imageNodes: mergeItemsById(localCanvas.imageNodes || [], diskCanvas.imageNodes || []),
            groups: mergeItemsById(localCanvas.groups || [], diskCanvas.groups || []),
            drawings: mergeItemsById(localCanvas.drawings || [], diskCanvas.drawings || []),
            lastModified: Math.max(localCanvas.lastModified || 0, diskCanvas.lastModified || 0)
        };
    };

    const mergeCanvases = (local: Canvas[], disk: Canvas[]): Canvas[] => {
        const map = new Map<string, Canvas>();
        disk.forEach(canvas => map.set(canvas.id, canvas));

        local.forEach(localCanvas => {
            const diskCanvas = map.get(localCanvas.id);
            if (!diskCanvas) {
                map.set(localCanvas.id, localCanvas);
                return;
            }

            map.set(localCanvas.id, mergeSingleCanvas(localCanvas, diskCanvas));
        });

        return Array.from(map.values());
    };

    const resolvePreferredActiveCanvasId = (
        localActiveId: string | undefined,
        diskActiveId: string | null | undefined,
        canvases: Canvas[]
    ): string => {
        const localActiveCanvas = localActiveId ? canvases.find(c => c.id === localActiveId) : undefined;
        const diskActiveCanvas = diskActiveId ? canvases.find(c => c.id === diskActiveId) : undefined;

        if (localActiveCanvas && !isCanvasEffectivelyEmpty(localActiveCanvas)) {
            return localActiveCanvas.id;
        }

        if (diskActiveCanvas && !isCanvasEffectivelyEmpty(diskActiveCanvas)) {
            return diskActiveCanvas.id;
        }

        if (localActiveCanvas && diskActiveCanvas && localActiveCanvas.id !== diskActiveCanvas.id) {
            return diskActiveCanvas.id;
        }

        const firstNonEmptyCanvas = canvases.find(canvas => !isCanvasEffectivelyEmpty(canvas));
        if (firstNonEmptyCanvas) {
            return firstNonEmptyCanvas.id;
        }

        if (diskActiveCanvas) return diskActiveCanvas.id;
        if (localActiveCanvas) return localActiveCanvas.id;
        return canvases[0]?.id || 'default';
    };

    // 🚀 Cloud Sync: Load & Merge on Init
    useEffect(() => {
        const loadCloud = async () => {
            // Wait for auth?
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            try {
                const cloudCanvases = await syncService.loadLayout();
                if (cloudCanvases && cloudCanvases.length > 0) {
                    setState(prev => {
                        const merged = mergeCanvases(prev.canvases, cloudCanvases);
                        // Check if anything changed
                        if (JSON.stringify(merged) !== JSON.stringify(prev.canvases)) {
                            console.log('[CanvasContext] Merged cloud layout.', { local: prev.canvases.length, cloud: cloudCanvases.length, merged: merged.length });

                            // 🚀 Hydrate newly added nodes (simulated)
                            // Since we don't have URLs, we rely on IDB hydration loop or trigger it?
                            // Re-triggering full init is heavy.
                            // Let's rely on lazy hydration if accessed?
                            // Or simple re-hydration loop for the merged set.

                            // Trigger background hydration
                            hydrateMergedImages(merged).catch(console.error);

                            return { ...prev, canvases: merged };
                        }
                        return prev;
                    });
                }
            } catch (e) {
                console.error('[CanvasContext] Cloud load failed', e);
            }
        };

        const hydrateMergedImages = async (canvases: Canvas[]) => {
            // Try to find images in IDB for nodes that are missing URLs
            const { getImage } = await import('../services/storage/imageStorage');
            let hasUpdates = false;

            // Map IDs to URLs
            const urlMap = new Map<string, string>();
            const promises: Promise<void>[] = [];

            for (const c of canvases) {
                for (const img of c.imageNodes) {
                    if (!img.url && (img.storageId || img.id)) {
                        promises.push(
                            getImage(img.storageId || img.id).then(url => {
                                if (url) {
                                    urlMap.set(img.id, url);
                                    hasUpdates = true;
                                }
                            }).catch(() => { })
                        );
                    }
                }
            }

            if (promises.length === 0) return;

            await Promise.all(promises);

            if (hasUpdates) {
                setState(prev => ({
                    ...prev,
                    canvases: prev.canvases.map(c => ({
                        ...c,
                        imageNodes: c.imageNodes.map(img =>
                            urlMap.has(img.id) ? { ...img, url: urlMap.get(img.id)! } : img
                        )
                    }))
                }));
                console.log(`[CanvasContext] Hydrated ${urlMap.size} images from cloud layout.`);
            }
        };

        if (!isLoading) loadCloud();
    }, [isLoading]);

    // 🚀 Cloud Sync: Auto-Save
    useEffect(() => {
        if (isLoading || state.canvases.length === 0) return;

        const timer = setTimeout(() => {
            const stripped = stripImageUrls(state.canvases);
            syncService.saveLayout(stripped).catch(e => console.error('[CanvasContext] Cloud save failed', e));
        }, 3000); // 3s debounce

        return () => clearTimeout(timer);
    }, [state.canvases, isLoading]);



    const stateRef = useRef(state);
    const isLoadingRef = useRef(isLoading);
    // 🚀 [防刷新漏洞] 用于标记需要紧急出盘(绕过200ms防抖)的关键操作
    const urgentSaveRef = useRef(false);
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
                persistCanvasStateToLocalStorage(state, 'debounced-save');
            } catch (error: any) {
                if (error.name === 'QuotaExceededError') console.error('localStorage quota exceeded.');
                else console.error('Failed to save state:', error);
            }
        };

        let timer: any;
        if (urgentSaveRef.current) {
            // 🚀 紧急情况：立即执行保存，绕过防抖，并重置标志
            urgentSaveRef.current = false;
            saveState();
        } else {
            timer = setTimeout(saveState, 200);
        }

        return () => clearTimeout(timer);
    }, [state, isLoading]);

    // 2. Stable Safety Save (Unload / Hidden) - Unmounts only once
    useEffect(() => {
        const handleSave = () => {
            if (isLoadingRef.current) return;
            try {
                const currentState = stateRef.current;
                persistCanvasStateToLocalStorage(currentState, 'visibility-save');
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

        const canvasName = `项目${nextNumber}`;
        const newCanvas: Canvas = {
            id: generateId(),
            name: canvasName,
            folderName: canvasName, // 【重要】首次创建时冻结物理文档夹名，此后改名只改 name 不改这个
            promptNodes: [],
            imageNodes: [],
            groups: [] as CanvasGroup[],
            drawings: [] as CanvasDrawing[],
            lastModified: Date.now()
        };
        urgentSaveRef.current = true; // 新建后强制立即保存
        setState(prev => ({
            ...prev,
            canvases: [...prev.canvases, newCanvas],
            activeCanvasId: newCanvas.id
        }));
        return newCanvas.id; // 返回新画布ID便于迁移
    }, [state.canvases.length, state.canvases]);

    const switchCanvas = useCallback((id: string) => {
        urgentSaveRef.current = true; // 切换后强制立即保存
        setState(prev => ({ ...prev, activeCanvasId: id }));
    }, []);

    const renameCanvas = useCallback(async (id: string, newName: string) => {
        const targetCanvas = state.canvases.find(c => c.id === id);
        if (!targetCanvas) return;
        const oldName = targetCanvas.name;
        const finalNewName = newName.trim() || oldName;

        if (oldName === finalNewName) return;

        // 【轻量级快捷方式重命名】物理文档夹名字永远不变，只修改 project.json 内的显示名
        // 并在文档夹里写入一个说明性文本文档充当"快捷方式"标记
        import('../services/storage/storagePreference').then(async ({ getLocalFolderHandle }) => {
            const handle = await getLocalFolderHandle();
            if (handle) {
                try {
                    // 物理文档夹名使用首次创建时固定的 folderName，如果没有则用旧名
                    const physicalFolderName = (targetCanvas.folderName || oldName).trim().replace(/[\\/:*?"<>|]/g, '_');
                    // @ts-ignore
                    const projectDir = await handle.getDirectoryHandle(physicalFolderName);

                    // 1. 更新 project.json 的 canvas.name
                    try {
                        // @ts-ignore
                        const pFile = await projectDir.getFileHandle('project.json');
                        // @ts-ignore
                        const pText = await (await pFile.getFile()).text();
                        const pData = JSON.parse(pText);
                        if (pData.canvas) {
                            pData.canvas.name = finalNewName;
                        }
                        // @ts-ignore
                        const writable = await pFile.createWritable();
                        await writable.write(JSON.stringify(pData, null, 2));
                        await writable.close();
                    } catch (e) { /* project.json 不存在时忽略，下次保存会创建 */ }

                    // 2. 清除旧的快捷方式提示文档
                    try {
                        // @ts-ignore
                        for await (const entry of projectDir.values()) {
                            if (entry.kind === 'file' && entry.name.startsWith('👉此项目已重命名为_')) {
                                // @ts-ignore
                                await projectDir.removeEntry(entry.name);
                            }
                        }
                    } catch (e) { /* 忽略 */ }

                    // 3. 写入新的快捷方式提示文档
                    const hintFileName = `👉此项目已重命名为_${finalNewName.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
                    // @ts-ignore
                    const hintFile = await projectDir.getFileHandle(hintFileName, { create: true });
                    // @ts-ignore
                    const hintWritable = await hintFile.createWritable();
                    await hintWritable.write(`此文档夹对应的 KK Studio 项目已被重命名为: ${finalNewName}\n原始文档夹名: ${physicalFolderName}\n更新时间: ${new Date().toLocaleString()}`);
                    await hintWritable.close();

                    console.log(`[CanvasContext] 项目重命名成功 (轻量级): ${oldName} -> ${finalNewName}, 物理目录保持: ${physicalFolderName}`);
                } catch (e) {
                    console.warn('[CanvasContext] 本地快捷方式更新失败（不影响使用）', e);
                }
            }
        });

        // 立即更新 UI 状态（folderName 保持不变）
        setState(prev => ({
            ...prev,
            canvases: prev.canvases.map(c =>
                c.id === id ? { ...c, name: finalNewName, folderName: c.folderName || oldName } : c
            )
        }));
    }, [state.canvases]);

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
            updateCanvas(c => {
                const allZIndices = [
                    ...c.promptNodes.map(n => n.zIndex ?? 0),
                    ...c.imageNodes.map(n => n.zIndex ?? 0),
                    ...(c.groups || []).map(g => g.zIndex ?? 0)
                ];
                let maxZ = allZIndices.length > 0 ? Math.max(...allZIndices) : 0;

                // 赋予新创建的 PromptNode 最高层级，确保不被旧卡片遮挡
                const nodeWithZIndex = { ...node, zIndex: maxZ + 1 };

                return {
                    ...c,
                    promptNodes: c.promptNodes.some(n => n.id === node.id) ?
                        (console.warn(`[CanvasContext] Skip duplicate promptNodeID: ${node.id}`), c.promptNodes) :
                        [...c.promptNodes, nodeWithZIndex]
                };
            });
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
                            import('../services/system/notificationService').then(({ notificationService }) => {
                                notificationService.warning('参考图保存失败', `参考图 ${index + 1} 保存失败，刷新后可能丢失`);
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
            import('../services/system/notificationService').then(({ notificationService }) => {
                notificationService.error('添加卡片失败', `无法创建卡片：${error?.message || '未知错误'}`);
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
            promptNodes: c.promptNodes.map(n => {
                if (n.id === node.id) {
                    // 🛡️ [Defensive Merge]
                    // We must ensure we don't accidentally overwrite existing valid data with empty data
                    // especially during rapid status updates (generating -> success)
                    const merged: PromptNode = {
                        ...n,
                        ...node,
                        // 🚀 If the incoming node has empty prompt/refs, but the existing one has them, KEEP existing ones!
                        // Unless we are explicitly clearing them (which usually happens via setConfig/delete)
                        // But updatePromptNode is mostly used for status updates.
                        prompt: (node.prompt && node.prompt.length > 0) ? node.prompt : n.prompt,
                        referenceImages: (node.referenceImages && node.referenceImages.length > 0) ? node.referenceImages : n.referenceImages
                    };

                    // 🚀 [Bugfix] 防止陈旧回调把已完成/已失败节点错误地改回“正在生成”
                    // 典型场景：ResizeObserver(onHeightChange)叠加闭包竞争，携带旧node快照覆盖最新状态
                    const hasFinished = (n.childImageIds?.length || 0) > 0;
                    const hasFailed = !!n.error;

                    if ((hasFinished || hasFailed) && node.isGenerating === true && n.isGenerating === false) {
                        merged.isGenerating = false;
                        // 同时也保护 error 不被旧快照的 undefined 覆盖
                        // 🚀 [Fix] 但允许显式清除 error（当调用方传入 error: undefined 时）
                        if (hasFailed && !merged.error && !('error' in node)) {
                            merged.error = n.error;
                            merged.errorDetails = n.errorDetails;
                        }
                    }

                    return merged;
                }
                return n;
            })
        }));
    }, [updateCanvas]);

    const urgentUpdatePromptNode = useCallback((node: PromptNode) => {
        // 🚀 [Persistence] We bypass the debounced save and force an immediate state save
        // 1. Update React State (UI will reflect change)
        updateCanvas(c => ({
            ...c,
            promptNodes: c.promptNodes.map(n => n.id === node.id ? { ...n, ...node } : n)
        }));

        // 2. Immediate LocalStorage Save (Prevention for Refresh/Close)
        // We use stateRef to get the most recent state since setState is async
        const recentState = stateRef.current;
        const activeCanvas = recentState.canvases.find(c => c.id === recentState.activeCanvasId);

        if (activeCanvas) {
            const updatedCanvases = recentState.canvases.map(c => {
                if (c.id === recentState.activeCanvasId) {
                    return {
                        ...c,
                        promptNodes: c.promptNodes.map(n => n.id === node.id ? { ...n, ...node } : n)
                    };
                }
                return c;
            });

            const stateToSave = { ...recentState, canvases: updatedCanvases };

            try {
                persistCanvasStateToLocalStorage(stateToSave, 'urgent-node-save');
                console.log(`[CanvasContext] 🚀 URGENT SAVE for Node ${node.id} to localStorage`);
            } catch (e) {
                console.error('[CanvasContext] ❌ Urgent save failed', e);
            }
        }
    }, [updateCanvas]);

    const addImageNodes = useCallback(async (nodes: GeneratedImage[], parentUpdates?: Record<string, Partial<PromptNode>>) => {
        console.log('[CanvasContext.addImageNodes] 🖼️ 开始添加图片节点', { count: nodes?.length, hasParentUpdates: !!parentUpdates });

        // 🛡️ 防御性检查：过滤掉无效节点 (允许 isGenerating 状态的节点)
        const validNodes = Array.isArray(nodes) ? nodes.filter(n => n && n.id && (n.url || n.isGenerating)) : [];
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
                    const preferredOriginalSource = node.originalUrl || node.url;

                    // 🚀 [关键修复] 先保存原图到本地文档系统（最安全的存储）
                    // A. File System First (持久化到本地磁盘 - 优先级最高)
                    // 🚀 [闭包修复] 使用getLocalFolderHandle动态获取最新handle，不依赖陈旧的state
                    const { getLocalFolderHandle, getStorageMode } = await import('../services/storage/storagePreference');
                    const selectedStorageMode = await getStorageMode();
                    const currentHandle = selectedStorageMode === 'local' ? await getLocalFolderHandle() : null;

                    if (selectedStorageMode === 'local' && currentHandle) {
                        try {
                            const res = await fetch(preferredOriginalSource); // works with data:/blob:/http:
                            const blob = await res.blob();
                            await fileSystemService.saveImageToHandle(currentHandle, storageId, blob, isVideo);
                            console.log(`[CanvasContext] ✅ Saved ORIGINAL ${isVideo ? 'video' : 'image'} ${storageId} to LOCAL DISK`);
                        } catch (e) {
                            console.error(`[CanvasContext] ❌ Failed to save ${isVideo ? 'video' : 'image'} ${node.id} to LOCAL DISK`, e);
                        }
                    } else if (selectedStorageMode === 'opfs') {
                        // 🚀 [添加] 没有本地文档夹时，检测是否支持OPFS（手机端）
                        const { isOPFSAvailable, saveToOPFS } = await import('../services/storage/opfsService');

                        if (isOPFSAvailable()) {
                            // 手机端：使用OPFS保存原图
                            try {
                                const res = await fetch(preferredOriginalSource);
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
                    } else {
                        console.log(`[CanvasContext] Browser storage mode selected, skipping local/OPFS for ${storageId}`);
                    }

                    // B. IndexedDB (浏览器缓存) - 始终保存一份可快速恢复的数据
                    if (isVideo) {
                        // 视频：直接保存，不压缩
                        const { saveImage } = await import('../services/storage/imageStorage');
                        await saveImage(storageId, preferredOriginalSource);
                        console.log(`[CanvasContext] Saved video ${storageId} to IndexedDB cache`);
                    } else {
                        const { saveImage, saveOriginalImage } = await import('../services/storage/imageStorage');
                        const { getQualityStorageId, ImageQuality } = await import('../services/image/imageQuality');

                        // 🚀 双保险：无论是否有本地/OPFS，都保存 ORIGINAL 到 IndexedDB
                        // 这样首屏与重载都能通过 storageId 秒级命中，不必等待磁盘回读
                        await saveOriginalImage(storageId, preferredOriginalSource);
                        console.log(`[CanvasContext] ✅ Saved ORIGINAL for ${storageId} to IndexedDB cache`);

                        // 🚀 [优化] 使用Web Worker生成缩略图，不阻塞主线程
                        try {
                            const { generateThumbnailWithPreset } = await import('../workers/thumbnailService');
                            const { blob } = await generateThumbnailWithPreset(preferredOriginalSource, 'MICRO');

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

                            if (selectedStorageMode === 'local' && currentHandle) {
                                await fileSystemService.saveThumbnailToHandle(currentHandle, storageId, blob);
                            }

                            // 预览档兜底到原图，避免 PREVIEW 级读取时出现空洞
                            const previewId = getQualityStorageId(storageId, ImageQuality.PREVIEW);
                            await saveImage(previewId, preferredOriginalSource);
                        } catch (workerError) {
                            // Worker失败时回退到主线程
                            console.warn(`[CanvasContext] Worker failed, falling back to main thread:`, workerError);
                            const { compressImageToQuality, QUALITY_CONFIGS } = await import('../services/image/imageQuality');
                            const microData = await compressImageToQuality(preferredOriginalSource, QUALITY_CONFIGS[ImageQuality.MICRO]);
                            const microId = getQualityStorageId(storageId, ImageQuality.MICRO);
                            await saveImage(microId, microData);
                            console.log(`[CanvasContext] ✅ Saved MICRO thumbnail (main thread) for ${storageId}`);

                            if (selectedStorageMode === 'local' && currentHandle) {
                                const microBlob = base64ToBlob(microData);
                                await fileSystemService.saveThumbnailToHandle(currentHandle, storageId, microBlob);
                            }

                            const previewId = getQualityStorageId(storageId, ImageQuality.PREVIEW);
                            await saveImage(previewId, preferredOriginalSource);
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
            updateCanvas(c => {
                let nextPromptNodes = [...c.promptNodes];
                const existingImageIds = new Set(c.imageNodes.map(existing => existing.id));
                const appendedNodes = stateNodes.filter(node => !existingImageIds.has(node.id));
                const parentIdsToPromote = new Set<string>();

                appendedNodes.forEach(node => {
                    if (node.parentPromptId) {
                        parentIdsToPromote.add(node.parentPromptId);
                    }
                });

                if (parentUpdates) {
                    Object.keys(parentUpdates).forEach(promptId => {
                        if (promptId) parentIdsToPromote.add(promptId);
                    });
                }

                const allZIndices = [
                    ...c.promptNodes.map(node => node.zIndex ?? 0),
                    ...c.imageNodes.map(node => node.zIndex ?? 0),
                    ...(c.groups || []).map(group => group.zIndex ?? 0)
                ];
                let maxZ = allZIndices.length > 0 ? Math.max(...allZIndices) : 0;

                const nextPromptZById = new Map<string, number>();
                const nextExistingImageZById = new Map<string, number>();
                const nextAppendedImageZById = new Map<string, number>();

                Array.from(parentIdsToPromote).forEach(promptId => {
                    if (c.promptNodes.some(promptNode => promptNode.id === promptId)) {
                        nextPromptZById.set(promptId, ++maxZ);
                    }

                    c.imageNodes
                        .filter(imageNode => imageNode.parentPromptId === promptId)
                        .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0) || left.timestamp - right.timestamp)
                        .forEach(imageNode => {
                            nextExistingImageZById.set(imageNode.id, ++maxZ);
                        });
                });

                appendedNodes.forEach(node => {
                    nextAppendedImageZById.set(node.id, node.zIndex ?? ++maxZ);
                });

                // 🚀 [Critical Fix] Atomic linking: update parent nodes in the same state transaction
                if (parentUpdates) {
                    nextPromptNodes = nextPromptNodes.map(pn => {
                        const updates = parentUpdates[pn.id];
                        const nextZIndex = nextPromptZById.get(pn.id);
                        if (updates) {
                            return { ...pn, ...updates, ...(nextZIndex !== undefined ? { zIndex: nextZIndex } : {}) };
                        }
                        if (nextZIndex !== undefined) {
                            return { ...pn, zIndex: nextZIndex };
                        }
                        return pn;
                    });
                } else {
                    // Backward compatibility: If no explicit updates, auto-link based on parentPromptId
                    const parentIds = Array.from(new Set(appendedNodes.map(n => n.parentPromptId).filter(Boolean)));
                    if (parentIds.length > 0) {
                        nextPromptNodes = nextPromptNodes.map(pn => {
                            if (parentIds.includes(pn.id)) {
                                const newChildIds = appendedNodes.filter(n => n.parentPromptId === pn.id).map(n => n.id);
                                return {
                                    ...pn,
                                    childImageIds: [...new Set([...(pn.childImageIds || []), ...newChildIds])],
                                    isGenerating: false,
                                    ...(nextPromptZById.has(pn.id) ? { zIndex: nextPromptZById.get(pn.id)! } : {})
                                };
                            }
                            const nextZIndex = nextPromptZById.get(pn.id);
                            if (nextZIndex !== undefined) {
                                return { ...pn, zIndex: nextZIndex };
                            }
                            return pn;
                        });
                    }
                }

                let nextImageNodes = c.imageNodes.map(imageNode => {
                    const nextZIndex = nextExistingImageZById.get(imageNode.id);
                    if (nextZIndex !== undefined) {
                        return { ...imageNode, zIndex: nextZIndex };
                    }
                    return imageNode;
                });

                nextImageNodes = [
                    ...nextImageNodes,
                    ...appendedNodes.map(node => ({
                        ...node,
                        zIndex: nextAppendedImageZById.get(node.id) ?? node.zIndex
                    }))
                ];

                const promotedNodeIds = new Set<string>([
                    ...Array.from(parentIdsToPromote),
                    ...Array.from(nextExistingImageZById.keys()),
                    ...appendedNodes.map(node => node.id)
                ]);

                const nextGroups = (c.groups || []).map(group => (
                    group.nodeIds.some(nodeId => promotedNodeIds.has(nodeId))
                        ? { ...group, zIndex: ++maxZ }
                        : group
                ));

                return {
                    ...c,
                    promptNodes: nextPromptNodes,
                    imageNodes: nextImageNodes,
                    groups: nextGroups
                };
            });
            console.log('[CanvasContext.addImageNodes] ✅ UI更新成功，卡片已显示');
        } catch (uiError: any) {
            // 🚨 致命错误：UI更新失败
            console.error('[CanvasContext.addImageNodes] 🔥 UI更新失败!', uiError);
            import('../services/system/notificationService').then(({ notificationService }) => {
                notificationService.error('显示图片失败', `无法显示图片：${uiError?.message || '未知错误'}`);
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
                import('../services/system/notificationService').then(({ notificationService }) => {
                    notificationService.warning('图片保存失败', `${failed}张图片保存失败，建议重新保存或重试`);
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

            // [MODIFIED] Removed repulsion logic as per user request
            // Freely update position without checking for overlap/pushing
            return {
                ...c,
                promptNodes: c.promptNodes.map(n => n.id === id ? { ...n, position: pos } : n),
                imageNodes: c.imageNodes
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
                    // [MODIFIED] Removed repulsion hook

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

            // SINGLE MOVE - Removed repulsion logic
            return {
                ...c,
                promptNodes: c.promptNodes, // No changes to prompt nodes
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

    const updateImageNode = useCallback((id: string, updates: Partial<GeneratedImage>) => {
        updateCanvas(c => ({
            ...c,
            imageNodes: c.imageNodes.map(img =>
                img.id === id ? { ...img, ...updates } : img
            )
        }));
    }, [updateCanvas]);

    // 🚀 [Batch Update] Implementation for stacking or massive moves
    const updateNodes = useCallback((batch: {
        promptNodes?: { id: string, updates: Partial<PromptNode> }[],
        imageNodes?: { id: string, updates: Partial<GeneratedImage> }[]
    }) => {
        updateCanvas(c => {
            let nextPromptNodes = [...c.promptNodes];
            let nextImageNodes = [...c.imageNodes];
            let changed = false;

            if (batch.promptNodes && batch.promptNodes.length > 0) {
                const updateMap = new Map(batch.promptNodes.map(u => [u.id, u.updates]));
                nextPromptNodes = nextPromptNodes.map(n => {
                    const u = updateMap.get(n.id);
                    if (u) {
                        changed = true;
                        return { ...n, ...u };
                    }
                    return n;
                });
            }

            if (batch.imageNodes && batch.imageNodes.length > 0) {
                const updateMap = new Map(batch.imageNodes.map(u => [u.id, u.updates]));
                nextImageNodes = nextImageNodes.map(img => {
                    const u = updateMap.get(img.id);
                    if (u) {
                        changed = true;
                        return { ...img, ...u };
                    }
                    return img;
                });
            }

            return changed ? { ...c, promptNodes: nextPromptNodes, imageNodes: nextImageNodes } : c;
        });
    }, [updateCanvas]);


    const deleteImageNode = useCallback((id: string) => {
        pushToHistory();

        // Delete from IndexedDB (existing logic)
        deleteImage(id);

        // 🚀 [关键修复] 让 storageAdapter 去尝试删除全局磁盘文档/OPFS
        import('../services/storage/storageAdapter').then(({ deleteImage: deleteImageFromDisk }) => {
            deleteImageFromDisk({
                id: id,
                type: 'native', // Trigger native local disk check
                width: 0,
                height: 0,
                x: 0,
                y: 0
            });
        }).catch(e => console.error('Failed to invoke safe physical deletion', e));

        urgentSaveRef.current = true; // 删除后强制挂载存储
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
                    childImageIds: p.childImageIds.filter(cid => cid !== id),
                    // [Ref Fix] Also clear sourceImageId if this image was a source for a follow-up
                    sourceImageId: p.sourceImageId === id ? undefined : p.sourceImageId
                }))
            };
        });
    }, [updateCanvas]);

    const deletePromptNode = useCallback((id: string) => {
        pushToHistory();

        urgentSaveRef.current = true; // 父节点删除后同步存盘
        updateCanvas(c => {
            // [Strict Logic] Delete Main Card -> Sub-cards become Lonely Sub Cards (Orphaned)
            // DO NOT delete the images. Just clear their parentPromptId.

            const newImageNodes = c.imageNodes.map(img => {
                if (img.parentPromptId === id) {
                    return { ...img, parentPromptId: '' }; // Orphan it (empty string)
                }
                return img;
            });

            // Filter out the deleted prompt node
            const newPromptNodes = c.promptNodes.filter(n => n.id !== id);

            return {
                ...c,
                promptNodes: newPromptNodes,
                imageNodes: newImageNodes
            };
        });
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
        const AUTO_ARRANGE_GROUPS_PER_ROW = 20; // ✅ 每行固定按20个卡组换行
        const AUTO_ARRANGE_SUB_COLUMNS = 20; // ✅ 副卡默认尽量横向排开，4张也保持单行
        const AUTO_ARRANGE_GROUP_GAP_X = 56; // ✅ 自动整理时卡组横向进一步放宽
        const AUTO_ARRANGE_GROUP_GAP_Y = 120; // ✅ 自动整理时卡组行距明显增加
        const AUTO_ARRANGE_SUB_IMAGE_GAP = 32; // ✅ 副卡之间进一步拉开
        const AUTO_ARRANGE_PROMPT_TO_SUB_GAP = 56; // ✅ 主卡与副卡之间增加更明显留白

        // --- Helper: Get dimensions ---
        const getImageDims = (aspectRatio?: string, dimensions?: string) => {
            // Using EXACT components dimensions to ensure perfect top alignment CSS logic
            const { width, totalHeight } = getCardDimensions(aspectRatio as AspectRatio, true);
            return { w: width, h: totalHeight };
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
                        const targetMode: SubCardLayout = prompt.mode === GenerationMode.PPT ? 'column' : mode;
                        const SUB_GAP = AUTO_ARRANGE_SUB_IMAGE_GAP;
                        const PROMPT_TO_SUB_GAP = AUTO_ARRANGE_PROMPT_TO_SUB_GAP;

                        // 计算副卡尺寸
                        const imageDims = childImages.map(img => getImageDims(img.aspectRatio, img.dimensions));
                        const avgWidth = imageDims.reduce((sum, d) => sum + d.w, 0) / imageDims.length;
                        const avgHeight = imageDims.reduce((sum, d) => sum + d.h, 0) / imageDims.length;

                        const newImagePositions: Record<string, { x: number, y: number }> = {};
                        const promptCenterX = prompt.position.x;
                        const promptBottom = prompt.position.y;

                        if (targetMode === 'row') {
                            // 横向排列: 副卡水平排成一行,居中对齐
                            const totalWidth = childImages.length * avgWidth + (childImages.length - 1) * SUB_GAP;
                            let currentX = promptCenterX - totalWidth / 2 + avgWidth / 2;
                            const y = promptBottom + PROMPT_TO_SUB_GAP + avgHeight;

                            childImages.forEach((img, i) => {
                                const dims = imageDims[i];
                                newImagePositions[img.id] = { x: currentX, y };
                                currentX += dims.w + SUB_GAP;
                            });
                        } else if (targetMode === 'grid') {
                            // 宫格排列: 4列网格,居中对齐
                            const columns = Math.min(AUTO_ARRANGE_SUB_COLUMNS, childImages.length);
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

                        setState(prev => ({ ...prev, canvases: newCanvases, subCardLayoutMode: targetMode }));
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
                        let width, height;

                        if (r.type === 'prompt') {
                            // 🚀 [FIX] Calculate Bounding Box of Prompt + All Children
                            const children = currentCanvas.imageNodes.filter(img => img.parentPromptId === node.id);

                            // 1. Initial Bounds (Prompt itself) - Anchor: Bottom Center
                            const pH = node.height || 200;
                            let minTop = node.position.y - pH;
                            let maxBottom = node.position.y;
                            let minLeft = node.position.x - PROMPT_WIDTH / 2;
                            let maxRight = node.position.x + PROMPT_WIDTH / 2;

                            // 2. Expand with Children
                            children.forEach(child => {
                                const dims = getImageDims(child.aspectRatio, child.dimensions);
                                // Anchor: Bottom Center (Assuming consistent system)
                                const cTop = child.position.y - dims.h;
                                const cBottom = child.position.y;
                                const cLeft = child.position.x - dims.w / 2;
                                const cRight = child.position.x + dims.w / 2;

                                if (cTop < minTop) minTop = cTop;
                                if (cBottom > maxBottom) maxBottom = cBottom;
                                if (cLeft < minLeft) minLeft = cLeft;
                                if (cRight > maxRight) maxRight = cRight;
                            });

                            width = maxRight - minLeft;
                            height = maxBottom - minTop;
                        } else {
                            const dims = getImageDims(node.aspectRatio, node.dimensions);
                            width = dims.w;
                            height = dims.h;
                        }

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
                    const GAP = 120; // ✅ 增大分组间距 (Was 80)
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
                {
                    const selectionSubColumns = AUTO_ARRANGE_SUB_COLUMNS;
                    const selectionSubImageGap = AUTO_ARRANGE_SUB_IMAGE_GAP;
                    const selectionPromptToSubGap = AUTO_ARRANGE_PROMPT_TO_SUB_GAP;
                    const selectionGroupGapX = AUTO_ARRANGE_GROUP_GAP_X;
                    const selectionGroupGapY = AUTO_ARRANGE_GROUP_GAP_Y;

                    type SelectedGroup = {
                        prompt?: typeof selectedPrompts[0];
                        images: typeof selectedImages;
                        originalX: number;
                        originalY: number;
                    };
                    type SelectedImagePlacement = {
                        id: string;
                        xOffset: number;
                        bottomOffset: number;
                    };
                    type SelectedGroupLayout = {
                        promptHeight: number;
                        width: number;
                        height: number;
                        imageLayoutHeight: number;
                        imagePlacements: SelectedImagePlacement[];
                    };
                    type PositionedSelectedGroup = SelectedGroup & { layout: SelectedGroupLayout };

                    const buildSelectionImageLayout = (
                        images: typeof selectedImages,
                        layoutMode: SubCardLayout
                    ): { width: number; height: number; placements: SelectedImagePlacement[] } => {
                        if (images.length === 0) {
                            return { width: 0, height: 0, placements: [] };
                        }

                        const imageDims = images.map(img => getImageDims(img.aspectRatio, img.dimensions));

                        if (layoutMode === 'column') {
                            const maxWidth = Math.max(...imageDims.map(d => d.w));
                            const totalHeight = imageDims.reduce((sum, d) => sum + d.h, 0) + (imageDims.length - 1) * selectionSubImageGap;
                            let currentTop = 0;
                            const placements = images.map((img, index) => {
                                const dims = imageDims[index];
                                const placement = {
                                    id: img.id,
                                    xOffset: 0,
                                    bottomOffset: currentTop + dims.h
                                };
                                currentTop += dims.h + selectionSubImageGap;
                                return placement;
                            });
                            return { width: maxWidth, height: totalHeight, placements };
                        }

                        if (layoutMode === 'row') {
                            const totalWidth = imageDims.reduce((sum, d) => sum + d.w, 0) + (imageDims.length - 1) * selectionSubImageGap;
                            const maxHeight = Math.max(...imageDims.map(d => d.h));
                            let currentLeft = -totalWidth / 2;
                            const placements = images.map((img, index) => {
                                const dims = imageDims[index];
                                const placement = {
                                    id: img.id,
                                    xOffset: currentLeft + dims.w / 2,
                                    bottomOffset: dims.h
                                };
                                currentLeft += dims.w + selectionSubImageGap;
                                return placement;
                            });
                            return { width: totalWidth, height: maxHeight, placements };
                        }

                        const maxWidth = Math.max(...imageDims.map(d => d.w));
                        const maxHeight = Math.max(...imageDims.map(d => d.h));
                        const columns = Math.min(selectionSubColumns, imageDims.length);
                        const totalWidth = columns * maxWidth + (columns - 1) * selectionSubImageGap;
                        const totalHeight = Math.ceil(imageDims.length / columns) * maxHeight + (Math.ceil(imageDims.length / columns) - 1) * selectionSubImageGap;
                        const startOffsetX = -totalWidth / 2;
                        const placements = images.map((img, index) => {
                            const dims = imageDims[index];
                            const col = index % columns;
                            const row = Math.floor(index / columns);
                            return {
                                id: img.id,
                                xOffset: startOffsetX + col * (maxWidth + selectionSubImageGap) + maxWidth / 2,
                                bottomOffset: row * (maxHeight + selectionSubImageGap) + dims.h
                            };
                        });

                        return { width: totalWidth, height: totalHeight, placements };
                    };

                    const selectedGroupsForArrange: SelectedGroup[] = [];
                    const groupedImageIds = new Set<string>();

                    selectedPrompts.forEach(prompt => {
                        const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);
                        childImages.forEach(img => groupedImageIds.add(img.id));
                        selectedGroupsForArrange.push({
                            prompt,
                            images: childImages,
                            originalX: prompt.position.x,
                            originalY: prompt.position.y
                        });
                    });

                    selectedImages
                        .filter(img => !groupedImageIds.has(img.id))
                        .forEach(img => {
                            selectedGroupsForArrange.push({
                                images: [img],
                                originalX: img.position.x,
                                originalY: img.position.y
                            });
                        });

                    if (selectedGroupsForArrange.length > 0) {
                        selectedGroupsForArrange.sort((a, b) => {
                            const rowDiff = Math.floor(a.originalY / 200) - Math.floor(b.originalY / 200);
                            if (rowDiff !== 0) return rowDiff;
                            return a.originalX - b.originalX;
                        });

                        const selectionCenterX = selectedGroupsForArrange.reduce((sum, group) => sum + group.originalX, 0) / selectedGroupsForArrange.length;
                        const selectionCenterY = selectedGroupsForArrange.reduce((sum, group) => sum + group.originalY, 0) / selectedGroupsForArrange.length;

                        const positionedSelectionGroups: PositionedSelectedGroup[] = selectedGroupsForArrange.map(group => {
                            const layoutMode: SubCardLayout = group.prompt?.mode === GenerationMode.PPT ? 'column' : mode;
                            const imageLayout = buildSelectionImageLayout(group.images, layoutMode);
                            const promptHeight = group.prompt?.height || 0;
                            const width = group.prompt ? Math.max(PROMPT_WIDTH, imageLayout.width) : imageLayout.width;
                            const height = group.prompt
                                ? promptHeight + (imageLayout.height > 0 ? selectionPromptToSubGap + imageLayout.height : 0)
                                : imageLayout.height;

                            return {
                                ...group,
                                layout: {
                                    promptHeight,
                                    width,
                                    height,
                                    imageLayoutHeight: imageLayout.height,
                                    imagePlacements: imageLayout.placements
                                }
                            };
                        });

                        const selectionStrategy: 'matrix' | 'row' | 'column' = mode === 'grid' ? 'matrix' : mode;
                        const selectionRows: Array<{ groups: PositionedSelectedGroup[]; maxPromptHeight: number; maxTotalHeight: number; rowWidth: number }> = [];
                        const createSelectionRow = () => ({ groups: [] as PositionedSelectedGroup[], maxPromptHeight: 0, maxTotalHeight: 0, rowWidth: 0 });
                        const pushGroupIntoRow = (
                            row: { groups: PositionedSelectedGroup[]; maxPromptHeight: number; maxTotalHeight: number; rowWidth: number },
                            group: PositionedSelectedGroup
                        ) => {
                            row.rowWidth += (row.groups.length > 0 ? selectionGroupGapX : 0) + group.layout.width;
                            row.groups.push(group);
                            row.maxPromptHeight = Math.max(row.maxPromptHeight, group.layout.promptHeight);
                            row.maxTotalHeight = Math.max(
                                row.maxTotalHeight,
                                group.prompt
                                    ? row.maxPromptHeight + (group.layout.imageLayoutHeight > 0 ? selectionPromptToSubGap + group.layout.imageLayoutHeight : 0)
                                    : group.layout.height
                            );
                        };

                        if (selectionStrategy === 'row') {
                            const row = createSelectionRow();
                            positionedSelectionGroups.forEach(group => pushGroupIntoRow(row, group));
                            if (row.groups.length > 0) selectionRows.push(row);
                        } else if (selectionStrategy === 'column') {
                            positionedSelectionGroups.forEach(group => {
                                const row = createSelectionRow();
                                pushGroupIntoRow(row, group);
                                selectionRows.push(row);
                            });
                        } else {
                            const gridColumns = Math.min(AUTO_ARRANGE_GROUPS_PER_ROW, Math.max(1, positionedSelectionGroups.length));
                            let currentSelectionRow = createSelectionRow();
                            positionedSelectionGroups.forEach(group => {
                                if (currentSelectionRow.groups.length >= gridColumns) {
                                    selectionRows.push(currentSelectionRow);
                                    currentSelectionRow = createSelectionRow();
                                }
                                pushGroupIntoRow(currentSelectionRow, group);
                            });
                            if (currentSelectionRow.groups.length > 0) selectionRows.push(currentSelectionRow);
                        }

                        const totalSelectionHeight = selectionRows.reduce((sum, row) => sum + row.maxTotalHeight, 0) + (selectionRows.length - 1) * selectionGroupGapY;
                        let currentTopY = selectionCenterY - totalSelectionHeight / 2;
                        const arrangedPositions: Record<string, { x: number; y: number }> = {};

                        selectionRows.forEach(row => {
                            let currentLeftX = selectionCenterX - row.rowWidth / 2;
                            const rowTopY = currentTopY;
                            const rowSubCardsTopY = rowTopY + row.maxPromptHeight + selectionPromptToSubGap;

                            row.groups.forEach(group => {
                                const groupCenterX = currentLeftX + group.layout.width / 2;

                                if (group.prompt) {
                                    arrangedPositions[group.prompt.id] = {
                                        x: groupCenterX,
                                        y: rowTopY + group.layout.promptHeight
                                    };
                                }

                                const imageTopY = group.prompt ? rowSubCardsTopY : rowTopY;
                                group.layout.imagePlacements.forEach(placement => {
                                    arrangedPositions[placement.id] = {
                                        x: groupCenterX + placement.xOffset,
                                        y: imageTopY + placement.bottomOffset
                                    };
                                });

                                currentLeftX += group.layout.width + selectionGroupGapX;
                            });

                            currentTopY += row.maxTotalHeight + selectionGroupGapY;
                        });

                        const arrangedCanvases = state.canvases.map(canvas => {
                            if (canvas.id !== state.activeCanvasId) return canvas;
                            return {
                                ...canvas,
                                promptNodes: canvas.promptNodes.map(prompt =>
                                    arrangedPositions[prompt.id] ? { ...prompt, position: arrangedPositions[prompt.id] } : prompt
                                ),
                                imageNodes: canvas.imageNodes.map(image =>
                                    arrangedPositions[image.id] ? { ...image, position: arrangedPositions[image.id] } : image
                                ),
                                lastModified: Date.now()
                            };
                        });

                        setState(prev => ({ ...prev, canvases: arrangedCanvases, subCardLayoutMode: mode }));
                        return;
                    }
                }
                // ✅ 框选整理: 按卡组处理,支持副卡顶部对齐和就近原则

                // 1. 构建卡组列表 (类似全局整理)
                const SUB_COLUMNS = AUTO_ARRANGE_SUB_COLUMNS; // 副卡默认横排，4张也不折行
                const SUB_IMAGE_GAP = AUTO_ARRANGE_SUB_IMAGE_GAP;
                const PROMPT_TO_SUB_GAP = AUTO_ARRANGE_PROMPT_TO_SUB_GAP;
                const GROUP_GAP_X = AUTO_ARRANGE_GROUP_GAP_X;
                const GROUP_GAP_Y = AUTO_ARRANGE_GROUP_GAP_Y;

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
                const gridColumns = Math.min(AUTO_ARRANGE_GROUPS_PER_ROW, Math.max(1, groups.length));
                const layoutRows: Array<{ groups: SelectionGroup[]; maxPromptHeight: number; maxTotalHeight: number }> = [];
                let currentRow: typeof layoutRows[0] = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0 };
                groups.forEach((group) => {
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
                            const promptHeight = group.prompt.height || 200;
                            newPositions[group.prompt.id] = {
                                x: groupCenterX,
                                y: startY + promptHeight // ✅ 确保所有主卡的顶部正好平齐对齐在 startY
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
        const GROUPS_PER_ROW = AUTO_ARRANGE_GROUPS_PER_ROW;  // 每行固定20个卡组
        const GROUP_GAP_X = AUTO_ARRANGE_GROUP_GAP_X;     // ✅ 卡组之间的横向间距
        const GROUP_GAP_Y = AUTO_ARRANGE_GROUP_GAP_Y;     // ✅ 行之间的纵向间距
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
        type LayoutGroup = {
            type: LayoutGroupType;
            prompt?: typeof normalPrompts[0];
            images: typeof currentCanvas.imageNodes;
            width: number;
            height: number;
            sourcePromptId?: string;
            layoutHeight?: number;
        };
        const layoutGroups: LayoutGroup[] = [];
        const promptById = new Map(currentCanvas.promptNodes.map(prompt => [prompt.id, prompt]));
        const imageById = new Map(currentCanvas.imageNodes.map(img => [img.id, img]));

        // 2a. 正确的卡组(Prompt + 子Image)
        const SUB_COLUMNS = AUTO_ARRANGE_SUB_COLUMNS; // ✅ 副卡默认横排，4张也不折行
        const SUB_IMAGE_GAP = AUTO_ARRANGE_SUB_IMAGE_GAP; // 子卡间距
        const PROMPT_TO_SUB_GAP = AUTO_ARRANGE_PROMPT_TO_SUB_GAP; // 主卡和副卡之间的间距

        normalPrompts.forEach(prompt => {
            const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);
            const promptWidth = 320;
            const promptHeight = prompt.height || 200;
            const sourceImage = prompt.sourceImageId ? imageById.get(prompt.sourceImageId) : undefined;
            const sourcePromptId = sourceImage?.parentPromptId && promptById.has(sourceImage.parentPromptId)
                ? sourceImage.parentPromptId
                : undefined;

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
                height: groupHeight,
                sourcePromptId
            });
        });

        // 2b. 孤独的Prompt卡
        orphanPrompts.forEach(prompt => {
            const sourceImage = prompt.sourceImageId ? imageById.get(prompt.sourceImageId) : undefined;
            const sourcePromptId = sourceImage?.parentPromptId && promptById.has(sourceImage.parentPromptId)
                ? sourceImage.parentPromptId
                : undefined;
            layoutGroups.push({
                type: 'orphan-prompt',
                prompt,
                images: [],
                width: 320,
                height: prompt.height || 200,
                sourcePromptId
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

        // 3. 布局正常卡组 + 孤独卡组 (每行固定20组)
        // ✅ 两遍处理:
        //   第一遍: 分配卡组到行,计算每行的最大主卡高度
        //   第二遍: 根据每行的最大主卡高度设置位置,实现副卡顶部对齐

        const followUpGroups = layoutGroups.filter(group => !!group.sourcePromptId && group.prompt);
        const rootLayoutGroups = layoutGroups.filter(group => !group.sourcePromptId);
        const followUpChildrenMap = new Map<string, LayoutGroup[]>();
        followUpGroups.forEach(group => {
            const sourcePromptId = group.sourcePromptId!;
            const existing = followUpChildrenMap.get(sourcePromptId) || [];
            existing.push(group);
            followUpChildrenMap.set(sourcePromptId, existing);
        });
        followUpChildrenMap.forEach((groups) => {
            groups.sort((a, b) => (a.prompt?.timestamp || 0) - (b.prompt?.timestamp || 0));
        });

        const computeLayoutHeight = (group: LayoutGroup, stack = new Set<string>()): number => {
            const promptId = group.prompt?.id;
            if (!promptId || stack.has(promptId)) return group.height;
            const nextStack = new Set(stack);
            nextStack.add(promptId);
            const children = followUpChildrenMap.get(promptId) || [];
            return children.length === 0
                ? group.height
                : Math.max(group.height, ...children.map(child => computeLayoutHeight(child, nextStack)));
        };

        rootLayoutGroups.forEach(group => {
            group.layoutHeight = computeLayoutHeight(group);
        });

        // ✅ 第一遍: 将卡组分配到行
        const rows: Array<{
            groups: LayoutGroup[];
            maxPromptHeight: number;  // 该行最高主卡高度
            maxTotalHeight: number;   // 该行最高卡组总高度
            startX: number;
        }> = [];

        let currentX = START_X;
        let currentRow: typeof rows[0] = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0, startX: START_X };

        rootLayoutGroups.forEach((group) => {
            const groupsInCurrentRow = currentRow.groups.length;

            // 换行检查：只按卡组数换行，不按卡组宽度提前换行
            if (groupsInCurrentRow >= GROUPS_PER_ROW) {
                rows.push(currentRow);
                currentX = START_X;
                currentRow = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0, startX: START_X };
            }

            // 添加到当前行
            currentRow.groups.push(group);

            // 更新该行最大主卡高度
            const promptHeight = group.prompt?.height || 200;
            currentRow.maxPromptHeight = Math.max(currentRow.maxPromptHeight, promptHeight);
            currentRow.maxTotalHeight = Math.max(currentRow.maxTotalHeight, group.layoutHeight || group.height);

            currentX += group.width + GROUP_GAP_X;
        });

        // 添加最后一行
        if (currentRow.groups.length > 0) {
            rows.push(currentRow);
        }

        // ✅ 第二遍: 根据每行的最大主卡高度设置位置
        const positions: { [id: string]: { x: number; y: number } } = {};
        const placedBounds = new Map<string, { left: number; top: number; right: number; bottom: number; width: number; height: number }>();
        const followUpRightEdge = new Map<string, number>();
        let currentY = START_Y;

        const placeGroup = (group: LayoutGroup, left: number, top: number) => {
            const groupCenterX = left + group.width / 2;
            const promptHeight = group.prompt?.height || 200;
            const subCardsStartY = top + promptHeight + PROMPT_TO_SUB_GAP;

            if (group.type === 'normal' && group.prompt) {
                positions[group.prompt.id] = {
                    x: groupCenterX,
                    y: top + promptHeight
                };

                if (group.images.length > 0) {
                    const imageDims = group.images.map(img => getImageDims(img.aspectRatio, img.dimensions));
                    const maxWidth = Math.max(...imageDims.map(d => d.w));
                    const maxHeight = Math.max(...imageDims.map(d => d.h));
                    const actualColumns = Math.min(SUB_COLUMNS, group.images.length);
                    const blockWidth = actualColumns * maxWidth + (actualColumns - 1) * SUB_IMAGE_GAP;
                    const blockStartX = groupCenterX - blockWidth / 2;

                    group.images.forEach((img, index) => {
                        const col = index % SUB_COLUMNS;
                        const imgRow = Math.floor(index / SUB_COLUMNS);
                        const cardCenterX = blockStartX + col * (maxWidth + SUB_IMAGE_GAP) + maxWidth / 2;
                        const cardTopY = subCardsStartY + imgRow * (maxHeight + SUB_IMAGE_GAP);
                        const dims = imageDims[index];
                        positions[img.id] = {
                            x: cardCenterX,
                            y: cardTopY + dims.h
                        };
                    });
                }
            } else if (group.type === 'orphan-prompt' && group.prompt) {
                positions[group.prompt.id] = {
                    x: groupCenterX,
                    y: top + promptHeight
                };
            } else if (group.type === 'orphan-image' && group.images[0]) {
                const img = group.images[0];
                const dims = getImageDims(img.aspectRatio, img.dimensions);
                positions[img.id] = {
                    x: groupCenterX,
                    y: subCardsStartY + dims.h
                };
            }

            if (group.prompt?.id) {
                placedBounds.set(group.prompt.id, {
                    left,
                    top,
                    right: left + group.width,
                    bottom: top + group.height,
                    width: group.width,
                    height: group.height
                });
            }
        };

        rows.forEach((row) => {
            let rowX = START_X;

            row.groups.forEach((group) => {
                placeGroup(group, rowX, currentY);
                rowX += group.width + GROUP_GAP_X;
            });

            currentY += row.maxTotalHeight + GROUP_GAP_Y;
        });

        const pendingFollowUps = [...followUpGroups];
        let guard = 0;

        while (pendingFollowUps.length > 0 && guard < 1000) {
            guard += 1;
            let placedInLoop = 0;

            for (let index = 0; index < pendingFollowUps.length; index += 1) {
                const group = pendingFollowUps[index];
                const sourcePromptId = group.sourcePromptId;

                if (!sourcePromptId) {
                    continue;
                }

                const anchorBounds = placedBounds.get(sourcePromptId);
                if (!anchorBounds) {
                    continue;
                }

                const left = followUpRightEdge.get(sourcePromptId) ?? (anchorBounds.right + GROUP_GAP_X);
                placeGroup(group, left, anchorBounds.top);

                if (group.prompt?.id) {
                    const placed = placedBounds.get(group.prompt.id);
                    if (placed) {
                        followUpRightEdge.set(sourcePromptId, placed.right + GROUP_GAP_X);
                    }
                }

                pendingFollowUps.splice(index, 1);
                index -= 1;
                placedInLoop += 1;
            }

            if (placedInLoop === 0) {
                pendingFollowUps.forEach((group) => {
                    placeGroup(group, START_X, currentY);
                    currentY += (group.layoutHeight || group.height) + GROUP_GAP_Y;
                });
                pendingFollowUps.length = 0;
            }
        }

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

                // 换行检查：错误卡组也只按卡组数换行
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
                    persistCanvasStateToLocalStorage({
                        ...prev,
                        canvases: updatedCanvases,
                        history: {}
                    } as CanvasState, 'layout-save');
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
                const { restoreLocalFolderConnection } = await import('../services/storage/storagePreference');
                handle = await restoreLocalFolderConnection();
            } catch (err) {
                // 恢复本地文档夹连接失败，将继续使用文档选择器
                console.warn('[CanvasContext] Failed to restore local folder:', err);
            }

            // 2. Fallback to Full Picker
            if (!handle) {
                handle = await fileSystemService.selectDirectory();
                const { setLocalFolderHandle } = await import('../services/storage/storagePreference');
                await setLocalFolderHandle(handle);
            }

            if (!handle) {
                return;
            }

            setState(prev => ({
                ...prev,
                fileSystemHandle: handle,
                folderName: handle.name
            }));

            void (async () => {
                try {

                    // [NEW] Migration: Save currently loaded images (Temp) to the new Local Folder
                    // This ensures work done in Temp mode is not lost/abandoned when switching
                    if (handle) {
                        // 🚀 不再调用getAllImages，只迁移当前状态需要的图片

                        // Helper to save base64/blob to disk
                        const saveToDisk = async (id: string, urlOrData: string, isVideo: boolean = false) => {
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

                                // 🚀 使用新版 saveImageToHandle (支持视频和图片分离)
                                await fileSystemService.saveImageToHandle(handle!, id, blob, isVideo);

                                if (!isVideo) {
                                    const { generateThumbnailWithPreset } = await import('../workers/thumbnailService');
                                    const { blob: thumbnailBlob } = await generateThumbnailWithPreset(urlOrData, 'MICRO');
                                    await fileSystemService.saveThumbnailToHandle(handle!, id, thumbnailBlob);
                                }
                            } catch (e) {
                                console.warn(`Failed to migrate image ${id} to local folder`, e);
                            }
                        };

                        // 🚀 只迁移当前状态实际需要的图片
                        const promises: Promise<void>[] = [];
                        state.canvases.forEach(c => {
                            c.imageNodes.forEach(img => {
                                if (img.id && img.url) {
                                    // 检查是否是视频
                                    const isVideo = img.url.startsWith('data:video/') || img.model?.includes('veo') || false;
                                    const lookupId = img.storageId || img.id;
                                    promises.push(saveToDisk(lookupId, img.url, isVideo));
                                }
                            });
                            c.promptNodes.forEach(pn => {
                                pn.referenceImages?.forEach(ref => {
                                    // 🚀 使用专门的 saveReferenceImage 函数（保存到 refs/ 并压缩）
                                    if (ref.storageId && ref.data) {
                                        // saveReferenceImage expects base64 string without "data:mimeType;base64," prefix
                                        const base64Data = ref.data.startsWith('data:') ? ref.data.split(',')[1] : ref.data;
                                        promises.push(
                                            fileSystemService.saveReferenceImage(handle!, ref.storageId, base64Data, ref.mimeType)
                                        );
                                    } else if (ref.id && ref.data) {
                                        // Fallback for old refs without storageId
                                        // saveReferenceImage expects base64 string without "data:mimeType;base64," prefix
                                        const base64Data = ref.data.startsWith('data:') ? ref.data.split(',')[1] : ref.data;
                                        promises.push(
                                            fileSystemService.saveReferenceImage(handle!, ref.id, base64Data, ref.mimeType)
                                        );
                                    }
                                });
                            });
                        });

                        // 等待所有保存完成
                        try {
                            await Promise.allSettled(promises);
                        } catch (e) {
                            console.warn('Migration partial failure', e);
                        }

                        if (promises.length > 0) {
                            // eslint-disable-next-line @typescript-eslint/no-var-requires
                            const { notify } = await import('../services/system/notificationService');
                            notify.success('数据迁移', `已将 ${promises.length} 张临时图片保存到本地文档夹`);
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

                    // If found existing project in the folder, MERGE instead of overwrite
                    if (canvases.length > 0) {
                        setState(prev => {
                            const mergedCanvases = mergeCanvases(prev.canvases, canvases);
                            const finalCanvases = mergedCanvases.map(canvas => ({
                                ...canvas,
                                imageNodes: (canvas.imageNodes || []).map(img => {
                                    const lookupId = img.storageId || img.id;
                                    const localData = images.get(lookupId) || images.get(img.id);
                                    return {
                                        ...img,
                                        url: localData?.url || img.url || '',
                                        originalUrl: localData?.originalUrl || img.originalUrl,
                                        filename: localData?.filename || img.fileName
                                    };
                                }),
                                promptNodes: (canvas.promptNodes || []).map(pn => ({
                                    ...pn,
                                    referenceImages: pn.referenceImages?.map(ref => ({ ...ref })) || []
                                }))
                            }));

                            const finalActiveId = resolvePreferredActiveCanvasId(
                                prev.activeCanvasId,
                                null,
                                finalCanvases
                            );

                            console.log(`[CanvasContext] 🚀 Merged local folder canvases: ${prev.canvases.length} memory + ${canvases.length} disk -> ${finalCanvases.length}`);

                            return {
                                ...prev,
                                canvases: finalCanvases,
                                activeCanvasId: finalActiveId,
                                fileSystemHandle: handle,
                                folderName: handle.name,
                                history: {}
                            };
                        });
                    } else {
                        // New folder (empty), just attach handle to current state (Save to Local)
                        setState(prev => ({
                            ...prev,
                            fileSystemHandle: handle,
                            folderName: handle.name
                        }));
                    }

                    // 🚀 [Fix] Persist handle to IndexedDB so it can be restored on reload
                    import('../services/storage/storagePreference').then(({ setLocalFolderHandle }) => {
                        if (handle) setLocalFolderHandle(handle);
                    });
                } catch (backgroundError) {
                    console.error('[CanvasContext] Failed to hydrate local folder in background:', backgroundError);
                }
            })();

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
        fileSystemService.setGlobalHandle(null);
        setState(prev => ({
            ...prev,
            fileSystemHandle: null,
            folderName: null
        }));

        // 3. Notify
        const { notify } = await import('../services/system/notificationService');
        notify.success('已切换到临时模式', '项目数据已保留');

    }, [state.canvases, state.activeCanvasId]);

    const changeLocalFolder = useCallback(async () => {
        if (!state.fileSystemHandle) return;

        try {
            // 1. Pick new folder
            const newHandle = await fileSystemService.selectDirectory();
            if (newHandle.name === state.folderName) {
                notify.info('提示', '您选择了同一个文档夹');
                return;
            }

            // 2. Confirm Migration
            const confirmed = window.confirm(
                `移动项目到 "${newHandle.name}"?\n\n` +
                `这将 移动 (剪切 & 粘贴) 所有文档从 "${state.folderName}" 到新位置。`
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

                // 🚀 [Fix] Persist new handle
                import('../services/storage/storagePreference').then(({ setLocalFolderHandle }) => {
                    setLocalFolderHandle(newHandle);
                });

                notify.success('移动成功', '项目已成功移动到新位置');

            } catch (error: any) {
                notify.error('移动失败', `迁移失败: ${error.message}`);
                console.error(error);
            } finally {
                setIsLoading(false);
            }

        } catch (error) {
            // Cancelled picker
        }
    }, [state.fileSystemHandle, state.folderName]);

    // 🚀 已失败的图片 ID 缓存，避免每 15 秒重复报错刷屏
    const failedReloadIdsRef = useRef<Set<string>>(new Set());
    // 🚀 [Fix] 写入锁，防止 refresh 与 save 竞态条件
    const isSavingRef = useRef(false);

    const refreshLocalFolder = useCallback(async () => {
        if (!state.fileSystemHandle) return;
        // 🚀 [Fix] 若正在保存，跳过本轮刷新，避免读到半写入的 project.json
        if (isSavingRef.current) {
            console.debug('[CanvasContext] Skipping refresh: save in progress');
            return;
        }
        try {
            const handle = state.fileSystemHandle;
            const { canvases, images } = await fileSystemService.loadProjectWithThumbs(handle);

            // Hydrate images map to IndexedDB
            for (const [id, data] of images.entries()) {
                const blobUrl = data.url;
                if (blobUrl) {
                    // 🚀 跳过已知失败的 ID，不再重复尝试和报错
                    if (failedReloadIdsRef.current.has(id)) continue;

                    try {
                        // 检查是否是有效的 blob URL
                        if (blobUrl.startsWith('blob:')) {
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
                        }
                    } catch (e) {
                        // blob URL 已过期，尝试从本地文档系统重新加载
                        console.debug(`[CanvasContext] Blob URL expired for ${id}, trying to reload from local file system`);
                        try {
                            const file = await fileSystemService.loadOriginalFromDisk(handle, id);
                            if (!file) throw new Error('file not found');
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                                const base64data = reader.result as string;
                                if (base64data) {
                                    await saveImage(id, base64data);
                                    console.log(`[CanvasContext] Reloaded ${id} from local file system`);
                                }
                            };
                            reader.readAsDataURL(file);
                        } catch (fsErr) {
                            // 🚀 记录失败的 ID，后续不再重试
                            failedReloadIdsRef.current.add(id);
                            console.debug(`[CanvasContext] Failed to reload ${id} from local file system (will skip future retries)`);
                        }
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

                    const hydratedDiskCanvases = canvases.map(diskCanvas => ({
                        ...diskCanvas,
                        imageNodes: (diskCanvas.imageNodes || []).map(img => {
                            const lookupId = img.storageId || img.id;
                            const localData = images.get(lookupId) || images.get(img.id);
                            return {
                                ...img,
                                url: localData?.url || img.url || '',
                                originalUrl: localData?.originalUrl || img.originalUrl,
                                fileName: localData?.filename || img.fileName
                            };
                        }),
                        promptNodes: (diskCanvas.promptNodes || []).map(prompt => ({
                            ...prompt,
                            referenceImages: prompt.referenceImages?.map(ref => ({ ...ref })) || []
                        }))
                    }));

                    const mergedCanvases = mergeCanvases(prev.canvases, hydratedDiskCanvases);
                    const finalActiveId = resolvePreferredActiveCanvasId(
                        prev.activeCanvasId,
                        null,
                        mergedCanvases
                    );

                    return {
                        ...prev,
                        canvases: mergedCanvases,
                        activeCanvasId: finalActiveId
                    };
                });
            }
            // Silent refresh success (no alert)
        } catch (error) {
            console.error('Failed to refresh folder:', error);
            // Silent failure
        }
    }, [state.fileSystemHandle]);

    // Auto-Sync: Poll local folder every 15 seconds if connected (降低频率以减少竞态冲突)
    useEffect(() => {
        if (!state.fileSystemHandle) return;
        const interval = setInterval(refreshLocalFolder, 15000);
        return () => clearInterval(interval);
    }, [state.fileSystemHandle, refreshLocalFolder]);

    // Enhanced Persistence (Local Storage + File System)
    useEffect(() => {
        if (isLoading) return;

        const saveState = async () => {
            // 🚀 [Fix] 设置写入锁，防止 refresh 读到半写入状态
            isSavingRef.current = true;
            try {
                // 1. Save to LocalStorage (Only if NOT using File System)
                if (!state.fileSystemHandle) {
                    try {
                        persistCanvasStateToLocalStorage(state, 'periodic-save');
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
                                try {
                                    const res = await fetch(url);
                                    if (!res.ok) throw new Error(`Fetch status: ${res.status}`);
                                    const blob = await res.blob();
                                    imagesToSave.set(id, blob);
                                } catch (err: any) {
                                    // 🚀 [Fix] Ignore known blob errors to prevent console spam
                                    if (err.message && err.message.includes('ERR_UPLOAD_FILE_CHANGED')) {
                                        console.warn(`[CanvasContext] Blob reference lost for ${id} (file changed/moved), skipping save.`);
                                    } else if (err instanceof TypeError && String(err.message || '').includes('Failed to fetch')) {
                                        // blob/data URL 在生命周期末期可能已失效，这类错误可安全忽略
                                    } else {
                                        console.warn(`[CanvasContext] Skip saving image ${id} (fetch failed):`, err);
                                    }
                                }
                            }
                        }

                        // Prepare Clean State for JSON
                        // 🛡️ [防御性修复] 确保 canvases 不为空且包含 activeCanvasId
                        const cleanCanvases = stripImageUrls(state.canvases);
                        if (cleanCanvases.length === 0) {
                            console.error('[CanvasContext] 🚨 Aborting save: canvases array is empty! This would wipe project.json');
                            return;
                        }

                        const fsState = {
                            canvases: cleanCanvases,
                            activeCanvasId: state.activeCanvasId || cleanCanvases[0]?.id || 'default',
                            version: 1
                        };

                        console.log('[CanvasContext] 💾 Saving project to disk:', {
                            canvasesCount: fsState.canvases.length,
                            activeCanvasId: fsState.activeCanvasId,
                            imagesToSave: imagesToSave.size
                        });

                        await fileSystemService.saveProject(state.fileSystemHandle, fsState as any, imagesToSave);

                    } catch (error) {
                        console.error('File System Save Failed:', error);
                    }
                }
            } finally {
                // 🚀 [Fix] 释放写入锁
                isSavingRef.current = false;
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
            let newSelectedIds: string[] = [];

            switch (mode) {
                case 'replace':
                    // 完全替换选择
                    newSelectedIds = ids;
                    break;

                case 'add':
                    // 添加到选择（Shift+框选）
                    ids.forEach(id => current.add(id));
                    newSelectedIds = Array.from(current);
                    break;

                case 'remove':
                    // 从选择中移除（Alt+框选）
                    ids.forEach(id => current.delete(id));
                    newSelectedIds = Array.from(current);
                    break;

                case 'toggle':
                    // 切换选择（Ctrl+点击）
                    ids.forEach(id => {
                        if (current.has(id)) {
                            current.delete(id);
                        } else {
                            current.add(id);
                        }
                    });
                    newSelectedIds = Array.from(current);
                    break;

                default:
                    newSelectedIds = ids;
            }

            return { ...prev, selectedNodeIds: newSelectedIds };
        });
    }, []);

    const clearSelection = useCallback(() => {
        setState(prev => ({ ...prev, selectedNodeIds: [] }));
    }, []);

    // 🚀 [Layering] Bring nodes to front by assigning higher zIndex
    const bringNodesToFront = useCallback((nodeIds: string[]) => {
        if (nodeIds.length === 0) return;

        setState(prev => {
            const currentCanvas = prev.canvases.find(c => c.id === prev.activeCanvasId);
            if (!currentCanvas) return prev;

            const promptById = new Map(currentCanvas.promptNodes.map(node => [node.id, node]));
            const imageById = new Map(currentCanvas.imageNodes.map(node => [node.id, node]));
            const canvasGroupsByNodeId = new Map<string, CanvasGroup[]>();
            currentCanvas.groups.forEach(group => {
                group.nodeIds.forEach(id => {
                    const linkedGroups = canvasGroupsByNodeId.get(id) || [];
                    linkedGroups.push(group);
                    canvasGroupsByNodeId.set(id, linkedGroups);
                });
            });
            const orderedNodeIds: string[] = [];
            const orderedNodeIdSet = new Set<string>();
            const expandedPromptIds = new Set<string>();
            const expandedCanvasGroupIds = new Set<string>();

            const pushCanvasGroup = (group: CanvasGroup) => {
                if (expandedCanvasGroupIds.has(group.id)) return;
                expandedCanvasGroupIds.add(group.id);

                group.nodeIds.forEach(memberId => {
                    const prompt = promptById.get(memberId);
                    if (prompt) {
                        pushPromptGroup(prompt.id);
                        return;
                    }

                    const image = imageById.get(memberId);
                    if (image?.parentPromptId) {
                        pushPromptGroup(image.parentPromptId);
                        return;
                    }

                    pushNodeId(memberId);
                });
            };

            const pushNodeId = (id?: string) => {
                if (!id || orderedNodeIdSet.has(id)) return;
                orderedNodeIdSet.add(id);
                orderedNodeIds.push(id);

                const linkedGroups = canvasGroupsByNodeId.get(id) || [];
                linkedGroups.forEach(pushCanvasGroup);
            };

            const pushPromptGroup = (promptId: string) => {
                if (expandedPromptIds.has(promptId)) return;
                expandedPromptIds.add(promptId);

                const prompt = promptById.get(promptId);
                if (!prompt) return;

                pushNodeId(prompt.id);

                const childImageIds = new Set<string>(
                    (prompt.childImageIds || []).filter((id): id is string => Boolean(id))
                );

                currentCanvas.imageNodes.forEach(image => {
                    if (image.parentPromptId === promptId) {
                        childImageIds.add(image.id);
                    }
                });

                childImageIds.forEach(pushNodeId);
            };

            nodeIds.forEach(id => {
                const prompt = promptById.get(id);
                if (prompt) {
                    pushPromptGroup(prompt.id);
                    return;
                }

                const image = imageById.get(id);
                if (image) {
                    if (image.parentPromptId) {
                        pushPromptGroup(image.parentPromptId);
                    } else {
                        pushNodeId(image.id);
                    }
                    return;
                }

                pushNodeId(id);
            });

            const nodeIdSet = new Set(orderedNodeIds);

            // Find current max zIndex
            const allZIndices = [
                ...currentCanvas.promptNodes.map(n => n.zIndex ?? 0),
                ...currentCanvas.imageNodes.map(n => n.zIndex ?? 0),
                ...currentCanvas.groups.map(g => g.zIndex ?? 0)
            ];
            let maxZ = allZIndices.length > 0 ? Math.max(...allZIndices) : 0;
            const nextZIndexById = new Map<string, number>();

            orderedNodeIds.forEach(id => {
                nextZIndexById.set(id, ++maxZ);
            });

            // Update prompt nodes
            const newPromptNodes = currentCanvas.promptNodes.map(n => {
                const nextZIndex = nextZIndexById.get(n.id);
                if (nextZIndex !== undefined) {
                    return { ...n, zIndex: nextZIndex };
                }
                return n;
            });

            // Update image nodes
            const newImageNodes = currentCanvas.imageNodes.map(n => {
                const nextZIndex = nextZIndexById.get(n.id);
                if (nextZIndex !== undefined) {
                    return { ...n, zIndex: nextZIndex };
                }
                return n;
            });

            // Also bring groups to front if they contain any of the selected nodes
            const newGroups = currentCanvas.groups.map(g => {
                const hasSelectedNode = g.nodeIds.some(id => nodeIdSet.has(id));
                if (hasSelectedNode) {
                    return { ...g, zIndex: ++maxZ };
                }
                return g;
            });

            const newCanvases = prev.canvases.map(c =>
                c.id === prev.activeCanvasId
                    ? { ...c, promptNodes: newPromptNodes, imageNodes: newImageNodes, groups: newGroups }
                    : c
            );

            return { ...prev, canvases: newCanvases };
        });
    }, []);

    // 🚀 [Layering] Auto-bring selected nodes to front when selection changes
    const prevSelectedRef = useRef<string[]>([]);
    useEffect(() => {
        const currentSelected = state.selectedNodeIds || [];
        const prevSelected = prevSelectedRef.current;

        // Only bring to front if there are newly selected nodes (not just deselection)
        const hasNewSelection = currentSelected.length > 0 &&
            (currentSelected.length > prevSelected.length ||
                currentSelected.some(id => !prevSelected.includes(id)));

        if (hasNewSelection) {
            // Small delay to avoid state update during render
            const timer = setTimeout(() => {
                bringNodesToFront(currentSelected);
            }, 0);
            return () => clearTimeout(timer);
        }

        prevSelectedRef.current = [...currentSelected];
    }, [state.selectedNodeIds, bringNodesToFront]);

    // 🚀 [Drag Optimization] Real-time state update for smooth drag and connection lines
    const prevGeneratingRef = useRef<string[]>([]);
    const prevGeneratingCanvasIdRef = useRef<string | null>(null);
    useEffect(() => {
        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!currentCanvas) {
            prevGeneratingRef.current = [];
            prevGeneratingCanvasIdRef.current = null;
            return;
        }

        if (prevGeneratingCanvasIdRef.current !== currentCanvas.id) {
            prevGeneratingRef.current = [];
            prevGeneratingCanvasIdRef.current = currentCanvas.id;
        }

        const currentGeneratingIds = [
            ...currentCanvas.promptNodes.filter(node => node.isGenerating).map(node => node.id),
            ...currentCanvas.imageNodes.filter(node => node.isGenerating).map(node => node.id)
        ];
        const prevGeneratingSet = new Set(prevGeneratingRef.current);
        const newGeneratingIds = currentGeneratingIds.filter(id => !prevGeneratingSet.has(id));

        prevGeneratingRef.current = currentGeneratingIds;

        if (newGeneratingIds.length === 0) return;

        const timer = setTimeout(() => {
            bringNodesToFront(newGeneratingIds);
        }, 0);

        return () => clearTimeout(timer);
    }, [state.canvases, state.activeCanvasId, bringNodesToFront]);

    const applyMoveSelectedNodes = useCallback((delta: { x: number; y: number }, sourceNodeIdOrIds?: string | string[]) => {
        setState(prev => {
            let selectedIds = prev.selectedNodeIds || [];

            if (Array.isArray(sourceNodeIdOrIds) && sourceNodeIdOrIds.length > 0) {
                selectedIds = sourceNodeIdOrIds;
            } else if (typeof sourceNodeIdOrIds === 'string' && sourceNodeIdOrIds) {
                selectedIds = selectedIds.includes(sourceNodeIdOrIds) ? selectedIds : [sourceNodeIdOrIds];
            }
            if (selectedIds.length === 0) return prev;

            const currentCanvas = prev.canvases.find(c => c.id === prev.activeCanvasId);
            if (!currentCanvas) return prev;

            // Simple set-based selection
            const selectedSet = new Set(selectedIds);

            // Move only selected nodes
            const newPromptNodes = currentCanvas.promptNodes.map(n => {
                if (selectedSet.has(n.id)) {
                    return { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y }, userMoved: true };
                }
                return n;
            });

            const newImageNodes = currentCanvas.imageNodes.map(n => {
                if (selectedSet.has(n.id)) {
                    return { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } };
                }
                return n;
            });

            const newCanvases = prev.canvases.map(c =>
                c.id === prev.activeCanvasId ? { ...c, promptNodes: newPromptNodes, imageNodes: newImageNodes } : c
            );

            return { ...prev, canvases: newCanvases };
        });
    }, []);

    const pendingMoveDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const pendingMoveSourceRef = useRef<string | string[] | undefined>(undefined);
    const moveRafRef = useRef<number | null>(null);

    const moveSelectedNodes = useCallback((delta: { x: number; y: number }, sourceNodeIdOrIds?: string | string[]) => {
        pendingMoveDeltaRef.current = {
            x: pendingMoveDeltaRef.current.x + delta.x,
            y: pendingMoveDeltaRef.current.y + delta.y,
        };

        if (sourceNodeIdOrIds !== undefined) {
            pendingMoveSourceRef.current = sourceNodeIdOrIds;
        }

        if (moveRafRef.current !== null) {
            return;
        }

        moveRafRef.current = window.requestAnimationFrame(() => {
            moveRafRef.current = null;
            const batchedDelta = pendingMoveDeltaRef.current;
            const batchedSource = pendingMoveSourceRef.current;

            pendingMoveDeltaRef.current = { x: 0, y: 0 };
            pendingMoveSourceRef.current = undefined;

            if (batchedDelta.x !== 0 || batchedDelta.y !== 0) {
                applyMoveSelectedNodes(batchedDelta, batchedSource);
            }
        });
    }, [applyMoveSelectedNodes]);

    useEffect(() => {
        return () => {
            if (moveRafRef.current !== null) {
                cancelAnimationFrame(moveRafRef.current);
            }
        };
    }, []);

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
            groups: [
                ...(canvas.groups || []),
                group.zIndex !== undefined
                    ? group
                    : {
                        ...group,
                        zIndex: Math.max(
                            0,
                            ...canvas.promptNodes.map(node => node.zIndex ?? 0),
                            ...canvas.imageNodes.map(node => node.zIndex ?? 0),
                            ...(canvas.groups || []).map(existingGroup => existingGroup.zIndex ?? 0)
                        ) + 1
                    }
            ]
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

    // 🚀 迁移选中节点到其他项目
    const migrateNodes = useCallback((nodeIds: string[], targetCanvasId: string) => {
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
                    const { saveImage, getImage } = await import('../services/storage/imageStorage');
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
    }, []);

    // 🚀 [性能优化] 缓存 Context Value，防止高频 state（如 viewportCenter）改变时所有消费组件全量重渲染
    const contextValue = React.useMemo(() => ({
        state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas,
        addPromptNode, updatePromptNode, addImageNodes, updatePromptNodePosition, updateImageNodePosition, updateImageNodeDimensions, updateImageNode,
        updateNodes, // 🚀 Batch Update
        deleteImageNode, deletePromptNode, linkNodes, unlinkNodes, clearAllData, canCreateCanvas,
        undo, redo, pushToHistory, canUndo, canRedo, arrangeAllNodes, getNextCardPosition,
        connectLocalFolder, disconnectLocalFolder, changeLocalFolder, refreshLocalFolder,
        isConnectedToLocal: !!state.fileSystemHandle,
        currentFolderName: state.folderName,
        selectedNodeIds: state.selectedNodeIds || [],
        selectNodes,
        clearSelection,
        bringNodesToFront,
        moveSelectedNodes,
        findSmartPosition,
        findNextGroupPosition,
        addGroup,
        removeGroup,
        updateGroup,
        setNodeTags,
        isReady: !isLoading,
        setViewportCenter,
        migrateNodes,
        urgentUpdatePromptNode
    }), [
        state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas,
        addPromptNode, updatePromptNode, addImageNodes, updatePromptNodePosition, updateImageNodePosition, updateImageNodeDimensions, updateImageNode,
        updateNodes,
        deleteImageNode, deletePromptNode, linkNodes, unlinkNodes, clearAllData, canCreateCanvas,
        undo, redo, pushToHistory, canUndo, canRedo, arrangeAllNodes, getNextCardPosition,
        connectLocalFolder, disconnectLocalFolder, changeLocalFolder, refreshLocalFolder,
        isLoading, selectNodes, clearSelection, bringNodesToFront, moveSelectedNodes, findSmartPosition, findNextGroupPosition, addGroup, removeGroup, updateGroup, setNodeTags, setViewportCenter, migrateNodes, urgentUpdatePromptNode
    ]);

    return (
        <CanvasContext.Provider value={contextValue}>
            {children}
        </CanvasContext.Provider>
    );
};

export const useCanvas = () => {
    const context = useContext(CanvasContext);
    if (!context) throw new Error('useCanvas must be used within CanvasProvider');
    return context;
};
