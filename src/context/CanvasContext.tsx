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


// 鍓崱鎺掑垪妯″紡: 妯悜 | 瀹牸 | 绔栧悜
export type SubCardLayout = 'row' | 'grid' | 'column';

// 鏁寸悊妯″紡: 瀹牸(6鍒? | 妯悜 | 绾靛悜
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
    // 鍓崱鎺掑垪妯″紡 (杞崲: row -> grid -> column -> row)
    subCardLayoutMode: SubCardLayout;
    // 馃殌 瑙嗗彛涓績浣嶇疆锛堝姩鎬佷紭鍏堢骇鍔犺浇锛?
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
    updateImageNode: (id: string, updates: Partial<GeneratedImage>) => void; // 馃殌 [New] Generic Update
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
    arrangeAllNodes: (mode?: ArrangeMode) => void; // Auto-layout cards: grid(6鍒? | row | column
    getNextCardPosition: () => { x: number; y: number }; // Get next available position for new card
    // File System
    connectLocalFolder: () => Promise<void>;
    disconnectLocalFolder: () => Promise<void>;
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
    // 馃殌 璁剧疆瑙嗗彛涓績锛堝姩鎬佷紭鍏堢骇鍔犺浇锛?
    setViewportCenter: (center: { x: number; y: number }) => void;
    // 馃殌 杩佺Щ閫変腑鑺傜偣鍒板叾浠栭」鐩?
    migrateNodes: (nodeIds: string[], targetCanvasId: string) => void;
    mergeCanvasInto: (sourceCanvasId: string, targetCanvasId: string, options?: { deleteSource?: boolean }) => {
        movedPrompts: number;
        movedImages: number;
        deletedSource: boolean;
    };
    cleanupInvalidCards: (canvasId?: string) => {
        removedPrompts: number;
        removedImages: number;
        removedGroups: number;
    };
    // 馃殌 [Persistence] Urgent state saving for generation tasks
    urgentUpdatePromptNode: (node: PromptNode) => void;
    // 馃殌 [Batch Update] Atomic update for multiple nodes (e.g. stacking)
    updateNodes: (updates: {
        promptNodes?: { id: string, updates: Partial<PromptNode> }[],
        imageNodes?: { id: string, updates: Partial<GeneratedImage> }[]
    }) => void;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

const STORAGE_KEY = 'kk_studio_canvas_state';
const LOCAL_FOLDER_REFRESH_INTERVAL_MS = 60000;
const LOCAL_FOLDER_IDLE_GRACE_MS = 45000;
const SYNC_GENERATION_INTERRUPTED_ERROR = '页面刷新或离开时中断了同步生成请求，供应商可能已完成出图，但当前项目没有收到最终响应。';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const DEFAULT_CANVAS: Canvas = {
    id: 'default',
    name: '椤圭洰1',
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
    subCardLayoutMode: 'row', // 榛樿妯悜鎺掑垪
    viewportCenter: { x: 0, y: 0 } // 榛樿鐢诲竷涓績
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

const getExpectedPromptImageCount = (node?: Partial<PromptNode> | null): number => (
    Math.max(1, Number(node?.lastGenerationTotalCount || node?.parallelCount || 1) || 1)
);

const getPendingTaskIdsFromPrompt = (node?: Partial<PromptNode> | null): string[] => {
    const rawPendingTaskIds = (node?.generationMetadata as { pendingTaskIds?: unknown } | undefined)?.pendingTaskIds;
    if (!Array.isArray(rawPendingTaskIds)) return [];

    return Array.from(new Set(
        rawPendingTaskIds.filter((taskId): taskId is string => typeof taskId === 'string' && taskId.trim().length > 0)
    ));
};

const getPendingSyncRequestsFromPrompt = (node?: Partial<PromptNode> | null): Array<{ requestId: string }> => {
    const rawPendingSyncRequests = (node?.generationMetadata as { pendingSyncRequests?: unknown } | undefined)?.pendingSyncRequests;
    if (!Array.isArray(rawPendingSyncRequests)) return [];

    return rawPendingSyncRequests.filter((item): item is { requestId: string } => (
        !!item
        && typeof item === 'object'
        && typeof (item as { requestId?: unknown }).requestId === 'string'
        && String((item as { requestId: string }).requestId).trim().length > 0
    ));
};

const hasRecoverablePendingTask = (node?: Partial<PromptNode> | null): boolean => {
    if (!node) return false;
    if (getPendingTaskIdsFromPrompt(node).length > 0) return true;
    if (getPendingSyncRequestsFromPrompt(node).length > 0) return true;
    return typeof node.jobId === 'string' && node.jobId.trim().length > 0;
};

const resolvePromptChildImageIds = (
    node?: Pick<PromptNode, 'id' | 'childImageIds'> | null,
    imageNodes: GeneratedImage[] = []
): string[] => {
    if (!node?.id) return [];

    const orderedIds: string[] = [];
    const seenIds = new Set<string>();
    const pushId = (id?: string) => {
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);
        orderedIds.push(id);
    };

    (node.childImageIds || []).forEach(pushId);
    imageNodes.forEach((imageNode) => {
        if (imageNode.parentPromptId === node.id) {
            pushId(imageNode.id);
        }
    });

    return orderedIds;
};

const normalizeRecoveredPromptNode = (
    node: PromptNode,
    imageNodes: GeneratedImage[] = []
): PromptNode => {
    const resolvedChildImageIds = resolvePromptChildImageIds(node, imageNodes);
    const pendingTaskIds = getPendingTaskIdsFromPrompt(node);
    const pendingSyncRequests = getPendingSyncRequestsFromPrompt(node);
    const expectedImageCount = getExpectedPromptImageCount(node);
    const isEffectivelyComplete = resolvedChildImageIds.length > 0 && (
        resolvedChildImageIds.length >= expectedImageCount || (pendingTaskIds.length === 0 && pendingSyncRequests.length === 0)
    );
    const nextPendingTaskIds = isEffectivelyComplete ? [] : pendingTaskIds;
    const nextPendingSyncRequests = isEffectivelyComplete ? [] : pendingSyncRequests;
    const shouldPersistGenerationMetadata = !!node.generationMetadata || pendingTaskIds.length > 0 || pendingSyncRequests.length > 0 || isEffectivelyComplete;

    return {
        ...node,
        childImageIds: resolvedChildImageIds,
        referenceImages: node.referenceImages || [],
        parallelCount: node.parallelCount || 1,
        tags: node.tags || [],
        isGenerating: Boolean(node.isGenerating) && !isEffectivelyComplete,
        jobId: isEffectivelyComplete ? undefined : (nextPendingTaskIds[0] || node.jobId),
        generationMetadata: shouldPersistGenerationMetadata
            ? {
                ...(node.generationMetadata || {}),
                pendingTaskIds: nextPendingTaskIds,
                pendingSyncRequests: nextPendingSyncRequests
            }
            : node.generationMetadata,
        error: isEffectivelyComplete ? undefined : node.error,
    };
};

const normalizeCanvasPromptRecovery = (canvas: Canvas): Canvas => ({
    ...canvas,
    promptNodes: (canvas.promptNodes || []).map((node) => normalizeRecoveredPromptNode(node, canvas.imageNodes || [])),
    groups: canvas.groups || [],
    drawings: canvas.drawings || []
});

const markInterruptedSyncPromptGenerations = (state: CanvasState): CanvasState => ({
    ...state,
    canvases: (state.canvases || []).map((canvas) => {
        let hasChanges = false;

        const promptNodes = (canvas.promptNodes || []).map((node) => {
            const hasResolvedImages = resolvePromptChildImageIds(node, canvas.imageNodes || []).length > 0;
            const shouldMarkInterrupted = Boolean(node?.isGenerating)
                && !hasResolvedImages
                && !hasRecoverablePendingTask(node);

            if (!shouldMarkInterrupted) return node;
            hasChanges = true;

            return {
                ...node,
                isGenerating: false,
                jobId: undefined,
                error: node.error || SYNC_GENERATION_INTERRUPTED_ERROR,
                errorDetails: {
                    ...(node.errorDetails || {}),
                    code: node.errorDetails?.code || 'SYNC_REQUEST_INTERRUPTED',
                    responseBody: node.errorDetails?.responseBody || SYNC_GENERATION_INTERRUPTED_ERROR,
                    model: node.errorDetails?.model || node.model,
                    timestamp: Date.now()
                },
                generationMetadata: {
                    ...(node.generationMetadata || {}),
                    pendingTaskIds: [],
                    pendingSyncRequests: []
                }
            };
        });

        if (!hasChanges) return canvas;
        return normalizeCanvasPromptRecovery({ ...canvas, promptNodes });
    })
});

const hasUnrecoverableSyncGenerationInFlight = (state?: CanvasState | null): boolean => {
    if (!state?.canvases?.length) return false;

    return state.canvases.some((canvas) =>
        (canvas.promptNodes || []).some((node) =>
            Boolean(node?.isGenerating)
            && resolvePromptChildImageIds(node, canvas.imageNodes || []).length === 0
            && !hasRecoverablePendingTask(node)
        )
    );
};

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
            console.log('[CanvasProvider] localStorage restore status:', stored ? 'Found persisted canvas data' : 'No data');
            if (stored) {
                const parsed: CanvasState = JSON.parse(stored);
                console.log('[CanvasProvider] 瑙ｆ瀽鎴愬姛:', `鐢诲竷鏁? ${parsed.canvases?.length || 0}`);

                // 鏋舵瀯杩佺Щ 1: 纭繚 history 瀛樺湪
                if (!parsed.history) parsed.history = {};
                if (!parsed.selectedNodeIds) parsed.selectedNodeIds = [];

                // 鏋舵瀯杩佺Щ 2: 娓呮礂鑺傜偣鏁版嵁 (淇鏃ф暟鎹殑閲嶅彔/鍔熻兘鎹熷潖闂)
                parsed.canvases = parsed.canvases.map(canvas => ({
                    ...canvas,
                    // 淇 Image Nodes
                    imageNodes: (canvas.imageNodes || []).map(img => ({
                        ...img,
                        // 纭繚鏂板瓧娈靛瓨鍦?
                        generationTime: img.generationTime || Date.now(),
                        canvasId: img.canvasId || canvas.id,
                        parentPromptId: img.parentPromptId || 'unknown',
                        prompt: img.prompt || '',
                        dimensions: img.dimensions || "1024x1024", // 榛樿瀛楃涓?
                        aspectRatio: img.aspectRatio || AspectRatio.SQUARE,
                        model: img.model || 'imagen-3.0-generate-001' // 鍥為€€鍒伴粯璁ゆā鍨?
                    })),
                })).map(normalizeCanvasPromptRecovery);

                // 馃殌 [Critical Fix] FileSystemHandle 涓嶈兘浠?localStorage 鎭㈠ (浼氬彉鎴愭櫘閫氬璞?
                // 蹇呴』寮哄埗璁句负 null锛屼緷璧?useEffect + IndexedDB 鎭㈠
                parsed.fileSystemHandle = null;
                // FolderName 鍙互淇濈暀鐢ㄤ簬 UI 鏄剧ず锛屼絾濡傛灉涓嶈繛鎺ヤ篃娌℃剰涔夛紝涓嶈繃淇濈暀鐫€涔熸病鍧忓
                // parsed.folderName = null;

                return parsed;
            }
        } catch (e) {
            // [CRITICAL FIX] 鎹曡幏鍒濆鍖栨椂鐨?Stack Overflow 鎴栬В鏋愰敊璇?
            // 濡傛灉鏈湴鏁版嵁鎹熷潖瀵艰嚧宕╂簝锛屽繀椤婚噸缃苟娓呴櫎 localStorage锛岄槻姝㈡棤闄愬穿婧冨惊鐜?
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

    // 馃殌 [闃插埛鏂颁涪澶盷 杩借釜鏈畬鎴愮殑淇濆瓨浠诲姟
    const pendingSavesRef = useRef<Set<Promise<void>>>(new Set());
    const stateRef = useRef(state);
    const lastUserActivityAtRef = useRef<number>(Date.now());

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        const markUserActivity = () => {
            lastUserActivityAtRef.current = Date.now();
        };

        window.addEventListener('pointerdown', markUserActivity);
        window.addEventListener('keydown', markUserActivity);
        window.addEventListener('wheel', markUserActivity);
        window.addEventListener('touchstart', markUserActivity);

        return () => {
            window.removeEventListener('pointerdown', markUserActivity);
            window.removeEventListener('keydown', markUserActivity);
            window.removeEventListener('wheel', markUserActivity);
            window.removeEventListener('touchstart', markUserActivity);
        };
    }, []);

    // 馃殌 [闃插埛鏂颁涪澶盷 beforeunload 浜嬩欢璀﹀憡鐢ㄦ埛
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const currentState = stateRef.current;
            const hasPendingSaves = pendingSavesRef.current.size > 0;
            const hasRiskySyncGeneration = hasUnrecoverableSyncGenerationInFlight(currentState);

            if (hasPendingSaves || hasRiskySyncGeneration) {
                e.preventDefault();
                e.returnValue = hasRiskySyncGeneration
                    ? '当前有同步图片生成正在返回结果，刷新或离开会导致项目收不到最终图片。'
                    : '鍥剧墖姝ｅ湪淇濆瓨涓紝绂诲紑鍙兘瀵艰嚧鏁版嵁涓㈠け';
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
                                    logInfo('CanvasContext', `宸叉仮澶嶆湰鍦版枃妗ｅす`, `folder: ${handle.name}`);

                                    // [NEW] Load actual project data from disk to ensure sync
                                    // This overrides localStorage state with the true file state
                                    try {
                                        const { fileSystemService } = await import('../services/storage/fileSystemService');
                                        logInfo('CanvasContext', '寮€濮嬩粠纭洏鍔犺浇椤圭洰鏁版嵁', handle.name);
                                        const { canvases, images, activeCanvasId: savedActiveCanvasId } = await fileSystemService.loadProjectWithThumbs(handle);
                                        logInfo('CanvasContext', '纭洏鏁版嵁鍔犺浇瀹屾垚', `鐢诲竷鏁? ${canvases.length}, 鍥剧墖鏁? ${images.size}, 娲诲姩ID: ${savedActiveCanvasId}`);

                                        // Hydrate IDB images (Background)
                                        for (const [id, data] of images.entries()) {
                                            if (data.url) saveImage(id, data.url).catch(e => console.warn('Cache failed', e));
                                        }

                                        // 馃殌 [NEW] 鍔犺浇鍙傝€冨浘鏄犲皠骞剁敤浜庢仮澶嶄涪澶辩殑鍙傝€冨浘
                                        let refUrls = new Map<string, string>();
                                        try {
                                            refUrls = await fileSystemService.loadAllReferenceImages(handle);
                                        } catch (e) {
                                            console.warn('[CanvasContext] Failed to load reference images', e);
                                        }

                                        if (canvases.length > 0) {
                                            setState(prev => {
                                                // 馃殌 [鍏抽敭淇] 鍚堝苟纭洏鐨?project.json 鍜屽垰浠?localStorage 鍔犺浇鐨勬渶鏂?state
                                                // 濡傛灉鍒氬埛鏂伴〉闈紝localStorage 閫氬父浼氶€氳繃 beforeunload 淇濆瓨鏈€鏂扮姸鎬侊紝
                                                // 鑰?project.json 鍙兘鍥犱负寮傛鏉ヤ笉鍙婂啓鑰岄檲鏃э紝鎵€浠ヨ鍙屽悜鍚堝苟闃茶鐩?
                                                const mergedCanvases = mergeCanvases(prev.canvases, canvases);
                                                const finalActiveId = resolvePreferredActiveCanvasId(
                                                    prev.activeCanvasId,
                                                    savedActiveCanvasId,
                                                    mergedCanvases
                                                );

                                                return {
                                                    ...prev,
                                                    canvases: mergedCanvases.map(c => {
                                                        // 纭洏鏁版嵁鍙兘澶氬嚭宸茬粦瀹氱殑 url锛岄渶瑕佷笌 merge 鍚庣殑鍖归厤
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
                                                                // 馃殌 鎭㈠涓㈠け鐨勫弬鑰冨浘锛氬鏋渄ata涓虹┖浣嗘湁storageId锛屽皾璇曚粠refs/鎭㈠
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
                                    logInfo('CanvasContext', `鏈湴鏂囨。澶规潈闄愮瓑寰呬腑`, `permission: ${perm}`);
                                }
                            } else {
                                logInfo('CanvasContext', '鏈壘鍒板凡淇濆瓨鐨勬湰鍦版枃妗ｅす', 'no persisted handle found');
                            }
                        } catch (e) {
                            logError('CanvasContext', e, '恢复文件夹句柄失败');
                        }
                    });
                });

                // 2. Load Images from IndexedDB (浼樺寲锛氭寜闇€鍔犺浇)
                console.log('[CanvasContext] Starting optimized image loading...');
                const totalImages = await getImageCount();
                console.log(`[CanvasContext] Total images in DB: ${totalImages}`);

                // 馃殌 鏀堕泦褰撳墠鐘舵€佷腑闇€瑕佺殑鍥剧墖ID
                const requiredImageIds = new Set<string>();
                state.canvases.forEach(c => {
                    // 鏀堕泦鐢熸垚鐨勫浘鐗嘔D - 浣跨敤storageId浼樺厛锛堜繚瀛樻椂鐢ㄧ殑鏄痵torageId锛?
                    c.imageNodes.forEach(img => {
                        requiredImageIds.add(img.storageId || img.id);
                    });
                    // 鏀堕泦鍙傝€冨浘鐗嘔D
                    c.promptNodes.forEach(pn => {
                        if (pn.referenceImages) {
                            pn.referenceImages.forEach(ref => {
                                requiredImageIds.add(ref.storageId || ref.id);
                            });
                        }
                    });
                });


                console.log(`[CanvasContext] Found ${requiredImageIds.size} images needed in current state`);

                // 馃殌 鍒嗙鍙傝€冨浘鍜岀敓鎴愬浘
                const referenceImageIds = new Set<string>();
                const generatedImageIds = new Set<string>();

                state.canvases.forEach(c => {
                    // 鐢熸垚鐨勫浘鐗?
                    c.imageNodes.forEach(img => {
                        generatedImageIds.add(img.storageId || img.id);
                    });
                    // 鍙傝€冨浘 - 鍗曠嫭鏀堕泦锛岀‘淇濅紭鍏堝姞杞?
                    c.promptNodes.forEach(pn => {
                        if (pn.referenceImages) {
                            pn.referenceImages.forEach(ref => {
                                referenceImageIds.add(ref.storageId || ref.id);
                            });
                        }
                    });
                });

                // 馃殌 [淇] 鍙傝€冨浘蹇呴』鍏ㄩ儴鍔犺浇锛屼笉鍙楅檺鍒?
                // 鐢熸垚鍥炬墠闄愬埗鏁伴噺
                const MAX_GENERATED_LOAD = 5;
                let generatedIdsArray = Array.from(generatedImageIds);

                // 馃殌 浼樺厛鍔犺浇闈犺繎瑙嗗彛涓績鐨勭敓鎴愬浘
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

                // 鎸夎窛绂绘帓搴忥紝浼樺厛鍔犺浇涓績鍖哄煙
                imagesWithDistance.sort((a, b) => a.distance - b.distance);
                generatedIdsArray = imagesWithDistance.slice(0, MAX_GENERATED_LOAD).map(item => item.id);

                // 馃殌 [鍏抽敭淇] 鍚堝苟锛氬弬鑰冨浘 + 闄愬埗鍚庣殑鐢熸垚鍥?
                const imageIdsArray = [...Array.from(referenceImageIds), ...generatedIdsArray];

                if (generatedImageIds.size > MAX_GENERATED_LOAD) {
                    console.warn(`[CanvasContext] Too many generated images (${generatedImageIds.size}), loading only ${MAX_GENERATED_LOAD} nearest to center`);
                }
                console.log(`[CanvasContext] Loading ${referenceImageIds.size} reference images + ${generatedIdsArray.length} generated images`);

                // 馃殌 鎸夐渶鍔犺浇锛氬彧鍔犺浇褰撳墠鐘舵€侀渶瑕佺殑鍥剧墖
                const imageMap = new Map<string, string>();
                const BATCH_SIZE = 5; // 鍑忓皬鎵归噺澶у皬锛岄伩鍏嶅唴瀛樺嘲鍊?

                for (let i = 0; i < imageIdsArray.length; i += BATCH_SIZE) {
                    const batch = imageIdsArray.slice(i, i + BATCH_SIZE);
                    // 馃殌 [OOM淇] 鍔犺浇MICRO璐ㄩ噺锛堟渶灏忕缉鐣ュ浘<50KB锛夎€屼笉鏄疶HUMBNAIL
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
            return normalizeCanvasPromptRecovery({
                ...localCanvas,
                ...diskCanvas,
                name: diskCanvas.name || localCanvas.name,
                folderName: diskCanvas.folderName || localCanvas.folderName,
                promptNodes: diskCanvas.promptNodes || [],
                imageNodes: diskCanvas.imageNodes || [],
                groups: diskCanvas.groups || [],
                drawings: diskCanvas.drawings || [],
                lastModified: Math.max(localCanvas.lastModified || 0, diskCanvas.lastModified || 0)
            });
        }

        if (diskCount === 0 && localCount > 0) {
            return normalizeCanvasPromptRecovery({
                ...diskCanvas,
                ...localCanvas,
                promptNodes: localCanvas.promptNodes || [],
                imageNodes: localCanvas.imageNodes || [],
                groups: localCanvas.groups || [],
                drawings: localCanvas.drawings || [],
                lastModified: Math.max(localCanvas.lastModified || 0, diskCanvas.lastModified || 0)
            });
        }

        const preferLocal = (localCanvas.lastModified || 0) >= (diskCanvas.lastModified || 0);
        const baseCanvas = preferLocal ? diskCanvas : localCanvas;
        const overrideCanvas = preferLocal ? localCanvas : diskCanvas;

        return normalizeCanvasPromptRecovery({
            ...baseCanvas,
            ...overrideCanvas,
            name: overrideCanvas.name || baseCanvas.name,
            folderName: overrideCanvas.folderName || baseCanvas.folderName,
            promptNodes: mergeItemsById(localCanvas.promptNodes || [], diskCanvas.promptNodes || []),
            imageNodes: mergeItemsById(localCanvas.imageNodes || [], diskCanvas.imageNodes || []),
            groups: mergeItemsById(localCanvas.groups || [], diskCanvas.groups || []),
            drawings: mergeItemsById(localCanvas.drawings || [], diskCanvas.drawings || []),
            lastModified: Math.max(localCanvas.lastModified || 0, diskCanvas.lastModified || 0)
        });
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

    // 馃殌 Cloud Sync: Load & Merge on Init
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

                            // 馃殌 Hydrate newly added nodes (simulated)
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

    // 馃殌 Cloud Sync: Auto-Save
    useEffect(() => {
        if (isLoading || state.canvases.length === 0) return;

        const timer = setTimeout(() => {
            const stripped = stripImageUrls(state.canvases);
            syncService.saveLayout(stripped).catch(e => console.error('[CanvasContext] Cloud save failed', e));
        }, 3000); // 3s debounce

        return () => clearTimeout(timer);
    }, [state.canvases, isLoading]);
    const isLoadingRef = useRef(isLoading);
    // 馃殌 [闃插埛鏂版紡娲瀅 鐢ㄤ簬鏍囪闇€瑕佺揣鎬ュ嚭鐩?缁曡繃200ms闃叉姈)鐨勫叧閿搷浣?
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
            // 馃殌 绱ф€ユ儏鍐碉細绔嬪嵆鎵ц淇濆瓨锛岀粫杩囬槻鎶栵紝骞堕噸缃爣蹇?
            urgentSaveRef.current = false;
            saveState();
        } else {
            timer = setTimeout(saveState, 200);
        }

        return () => clearTimeout(timer);
    }, [state, isLoading]);

    // 2. Stable Safety Save (Unload / Hidden) - Unmounts only once
    useEffect(() => {
        const handleSave = (source: 'visibility' | 'beforeunload') => {
            if (isLoadingRef.current) return;
            try {
                const currentState = stateRef.current;
                const stateToPersist = source === 'beforeunload'
                    ? markInterruptedSyncPromptGenerations(currentState)
                    : currentState;
                persistCanvasStateToLocalStorage(stateToPersist, source === 'beforeunload' ? 'beforeunload-save' : 'visibility-save');
            } catch (e) {
                console.error('Failed to save state on unload:', e);
            }
        };

        const handleBeforeUnloadSave = () => handleSave('beforeunload');
        window.addEventListener('beforeunload', handleBeforeUnloadSave);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') handleSave('visibility');
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnloadSave);
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

        // Find next available number for "椤圭洰X"
        const existingNumbers = state.canvases
            .map(c => {
                const match = c.name.match(/^椤圭洰(\d+)$/);
                return match ? parseInt(match[1], 10) : 0;
            })
            .filter(n => n > 0);
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

        const canvasName = `椤圭洰${nextNumber}`;
        const newCanvas: Canvas = {
            id: generateId(),
            name: canvasName,
            folderName: canvasName, // 銆愰噸瑕併€戦娆″垱寤烘椂鍐荤粨鐗╃悊鏂囨。澶瑰悕锛屾鍚庢敼鍚嶅彧鏀?name 涓嶆敼杩欎釜
            promptNodes: [],
            imageNodes: [],
            groups: [] as CanvasGroup[],
            drawings: [] as CanvasDrawing[],
            lastModified: Date.now()
        };
        urgentSaveRef.current = true; // 鏂板缓鍚庡己鍒剁珛鍗充繚瀛?
        setState(prev => ({
            ...prev,
            canvases: [...prev.canvases, newCanvas],
            activeCanvasId: newCanvas.id
        }));
        return newCanvas.id; // 杩斿洖鏂扮敾甯僆D渚夸簬杩佺Щ
    }, [state.canvases.length, state.canvases]);

    const switchCanvas = useCallback((id: string) => {
        urgentSaveRef.current = true; // 鍒囨崲鍚庡己鍒剁珛鍗充繚瀛?
        setState(prev => ({ ...prev, activeCanvasId: id }));
    }, []);

    const renameCanvas = useCallback(async (id: string, newName: string) => {
        const targetCanvas = state.canvases.find(c => c.id === id);
        if (!targetCanvas) return;
        const oldName = targetCanvas.name;
        const finalNewName = newName.trim() || oldName;

        if (oldName === finalNewName) return;

        // 銆愯交閲忕骇蹇嵎鏂瑰紡閲嶅懡鍚嶃€戠墿鐞嗘枃妗ｅす鍚嶅瓧姘歌繙涓嶅彉锛屽彧淇敼 project.json 鍐呯殑鏄剧ず鍚?
        // 骞跺湪鏂囨。澶归噷鍐欏叆涓€涓鏄庢€ф枃鏈枃妗ｅ厖褰?蹇嵎鏂瑰紡"鏍囪
        import('../services/storage/storagePreference').then(async ({ getLocalFolderHandle }) => {
            const handle = await getLocalFolderHandle();
            if (handle) {
                try {
                    // 鐗╃悊鏂囨。澶瑰悕浣跨敤棣栨鍒涘缓鏃跺浐瀹氱殑 folderName锛屽鏋滄病鏈夊垯鐢ㄦ棫鍚?
                    const physicalFolderName = (targetCanvas.folderName || oldName).trim().replace(/[\\/:*?"<>|]/g, '_');
                    // @ts-ignore
                    const projectDir = await handle.getDirectoryHandle(physicalFolderName);

                    // 1. 鏇存柊 project.json 鐨?canvas.name
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
                    } catch (e) { /* project.json 涓嶅瓨鍦ㄦ椂蹇界暐锛屼笅娆′繚瀛樹細鍒涘缓 */ }

                    // 2. 娓呴櫎鏃х殑蹇嵎鏂瑰紡鎻愮ず鏂囨。
                    try {
                        // @ts-ignore
                        for await (const entry of projectDir.values()) {
                            if (entry.kind === 'file' && entry.name.startsWith('project-renamed-to_')) {
                                // @ts-ignore
                                await projectDir.removeEntry(entry.name);
                            }
                        }
                    } catch (e) { /* 蹇界暐 */ }

                    // 3. 鍐欏叆鏂扮殑蹇嵎鏂瑰紡鎻愮ず鏂囨。
                    const hintFileName = `project-renamed-to_${finalNewName.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
                    // @ts-ignore
                    const hintFile = await projectDir.getFileHandle(hintFileName, { create: true });
                    // @ts-ignore
                    const hintWritable = await hintFile.createWritable();
                    await hintWritable.write(`This folder corresponds to the KK Studio project renamed to: ${finalNewName}\nOriginal folder name: ${physicalFolderName}\nUpdated at: ${new Date().toLocaleString()}`);
                    await hintWritable.close();

                    console.log('[CanvasContext] Project rename completed (light rename)', { oldName, finalNewName, physicalFolderName });
                } catch (e) {
                    console.warn('[CanvasContext] Failed to update local shortcut (non-blocking)', e);
                }
            }
        });

        // 绔嬪嵆鏇存柊 UI 鐘舵€侊紙folderName 淇濇寔涓嶅彉锛?
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
        console.log('[CanvasContext.addPromptNode] Starting prompt node insert', { nodeId: node.id, prompt: node.prompt?.substring(0, 50) });

        try {
            // 馃殌 [闃插尽鎬т慨澶峕 鍏堟坊鍔犺妭鐐瑰埌鐘舵€侊紝淇濊瘉UI绔嬪嵆鏄剧ず
            updateCanvas(c => {
                const allZIndices = [
                    ...c.promptNodes.map(n => n.zIndex ?? 0),
                    ...c.imageNodes.map(n => n.zIndex ?? 0),
                    ...(c.groups || []).map(g => g.zIndex ?? 0)
                ];
                let maxZ = allZIndices.length > 0 ? Math.max(...allZIndices) : 0;

                // 璧嬩簣鏂板垱寤虹殑 PromptNode 鏈€楂樺眰绾э紝纭繚涓嶈鏃у崱鐗囬伄鎸?
                const nodeWithZIndex = { ...node, zIndex: maxZ + 1 };

                return {
                    ...c,
                    promptNodes: c.promptNodes.some(n => n.id === node.id) ?
                        (console.warn(`[CanvasContext] Skip duplicate promptNodeID: ${node.id}`), c.promptNodes) :
                        [...c.promptNodes, nodeWithZIndex]
                };
            });
            console.log('[CanvasContext.addPromptNode] Prompt card added to canvas');

            // 馃殌 [鍏抽敭淇] 寮傛淇濆瓨鍙傝€冨浘 - 鍗充娇澶辫触涔熶笉褰卞搷鍗＄墖鏄剧ず
            if (node.referenceImages && node.referenceImages.length > 0) {
                console.log(`[CanvasContext.addPromptNode] Saving ${node.referenceImages.length} reference images`);
                const saveTasks = node.referenceImages.map(async (ref, index) => {
                    if (ref.data) {
                        const mime = ref.mimeType || 'image/png';
                        let fullUrl = ref.data;
                        if (!fullUrl.startsWith('data:') && !fullUrl.startsWith('blob:') && !fullUrl.startsWith('http')) {
                            fullUrl = `data:${mime};base64,${ref.data}`;
                        }
                        try {
                            await saveImage(ref.id, fullUrl);
                            console.log(`[CanvasContext.addPromptNode] Reference image ${index + 1}/${node.referenceImages?.length || 0} saved:`, ref.id);
                        } catch (e: any) {
                            console.error(`[CanvasContext.addPromptNode] Failed to save reference image ${index + 1}:`, ref.id, e?.message || e);
                            // 馃敂 閫氱煡鐢ㄦ埛锛堜絾涓嶉樆姝㈡祦绋嬶級
                            import('../services/system/notificationService').then(({ notificationService }) => {
                                notificationService.warning('参考图保存失败', `参考图 ${index + 1} 保存失败，刷新后可能丢失`);
                            });
                        }
                    }
                });
                await Promise.allSettled(saveTasks); // 浣跨敤 allSettled 鑰屼笉鏄?all锛岀‘淇濇墍鏈変换鍔″畬鎴?
                console.log('[CanvasContext.addPromptNode] Reference image persistence finished');
            }
        } catch (error: any) {
            // 馃毃 鑷村懡閿欒锛氭坊鍔犲崱鐗囧け璐?
            console.error('[CanvasContext.addPromptNode] Failed to add prompt node', error);
            import('../services/system/notificationService').then(({ notificationService }) => {
                notificationService.error('添加卡片失败', '无法创建卡片：' + (error?.message || '未知错误'));
            });
            // 鈿狅笍 涓峵hrow锛岄伩鍏嶄腑鏂悗缁祦绋嬶紙鍥剧墖鐢熸垚锛?
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
        // 馃殌 [鍏抽敭淇] 鍏堜繚瀛樺弬鑰冨浘鍐嶆洿鏂拌妭鐐?- 闃叉鍒锋柊涓㈠け
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
                        console.error(`[CanvasContext] Failed to save reference image ${ref.id}`, e);
                    }
                }
            });
            await Promise.all(saveTasks);
        }

        updateCanvas(c => ({
            ...c,
            promptNodes: c.promptNodes.map(n => {
                if (n.id === node.id) {
                    // 馃洝锔?[Defensive Merge]
                    // We must ensure we don't accidentally overwrite existing valid data with empty data
                    // especially during rapid status updates (generating -> success)
                    const merged: PromptNode = {
                        ...n,
                        ...node,
                        // 馃殌 If the incoming node has empty prompt/refs, but the existing one has them, KEEP existing ones!
                        // Unless we are explicitly clearing them (which usually happens via setConfig/delete)
                        // But updatePromptNode is mostly used for status updates.
                        prompt: (node.prompt && node.prompt.length > 0) ? node.prompt : n.prompt,
                        referenceImages: (node.referenceImages && node.referenceImages.length > 0) ? node.referenceImages : n.referenceImages
                    };

                    // 馃殌 [Bugfix] 闃叉闄堟棫鍥炶皟鎶婂凡瀹屾垚/宸插け璐ヨ妭鐐归敊璇湴鏀瑰洖鈥滄鍦ㄧ敓鎴愨€?
                    // 鍏稿瀷鍦烘櫙锛歊esizeObserver(onHeightChange)鍙犲姞闂寘绔炰簤锛屾惡甯︽棫node蹇収瑕嗙洊鏈€鏂扮姸鎬?
                    const hasFinished = resolvePromptChildImageIds(n, c.imageNodes).length > 0;
                    const hasFailed = !!n.error;

                    if ((hasFinished || hasFailed) && node.isGenerating === true && n.isGenerating === false) {
                        merged.isGenerating = false;
                        // 鍚屾椂涔熶繚鎶?error 涓嶈鏃у揩鐓х殑 undefined 瑕嗙洊
                        // 馃殌 [Fix] 浣嗗厑璁告樉寮忔竻闄?error锛堝綋璋冪敤鏂逛紶鍏?error: undefined 鏃讹級
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
        // 馃殌 [Persistence] We bypass the debounced save and force an immediate state save
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
                console.log(`[CanvasContext] URGENT SAVE for node ${node.id} to localStorage`);
            } catch (e) {
                console.error('[CanvasContext] Urgent save failed', e);
            }
        }
    }, [updateCanvas]);

    const addImageNodes = useCallback(async (nodes: GeneratedImage[], parentUpdates?: Record<string, Partial<PromptNode>>) => {
        console.log('[CanvasContext.addImageNodes] Starting image node insert', { count: nodes?.length, hasParentUpdates: !!parentUpdates });

        // 馃洝锔?闃插尽鎬ф鏌ワ細杩囨护鎺夋棤鏁堣妭鐐?(鍏佽 isGenerating 鐘舵€佺殑鑺傜偣)
        const validNodes = Array.isArray(nodes) ? nodes.filter(n => n && n.id && (n.url || n.isGenerating)) : [];
        if (validNodes.length === 0) {
            console.warn('[CanvasContext.addImageNodes] No valid image nodes to add.');
            return;
        }
        console.log('[CanvasContext.addImageNodes] Validation passed', validNodes.length, 'nodes');

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
                    const stableOriginalSource = preferredOriginalSource.startsWith('blob:')
                        ? null
                        : preferredOriginalSource;
                    const previewSource = stableOriginalSource || preferredOriginalSource;

                    // 馃殌 [鍏抽敭淇] 鍏堜繚瀛樺師鍥惧埌鏈湴鏂囨。绯荤粺锛堟渶瀹夊叏鐨勫瓨鍌級
                    // A. File System First (鎸佷箙鍖栧埌鏈湴纾佺洏 - 浼樺厛绾ф渶楂?
                    // 馃殌 [闂寘淇] 浣跨敤getLocalFolderHandle鍔ㄦ€佽幏鍙栨渶鏂癶andle锛屼笉渚濊禆闄堟棫鐨剆tate
                    const { getLocalFolderHandle, getStorageMode } = await import('../services/storage/storagePreference');
                    const selectedStorageMode = await getStorageMode();
                    const currentHandle = selectedStorageMode === 'local' ? await getLocalFolderHandle() : null;

                    if (selectedStorageMode === 'local' && currentHandle) {
                        try {
                            const res = await fetch(previewSource); // works with data:/blob:/http:
                            const blob = await res.blob();
                            await fileSystemService.saveImageToHandle(currentHandle, storageId, blob, isVideo);
                            console.log(`[CanvasContext] Saved ORIGINAL ${isVideo ? 'video' : 'image'} ${storageId} to LOCAL DISK`);
                        } catch (e) {
                            if (!preferredOriginalSource.startsWith('blob:')) {
                                console.error(`[CanvasContext] Failed to save ${isVideo ? 'video' : 'image'} ${node.id} to LOCAL DISK`, e);
                            }
                        }
                    } else if (selectedStorageMode === 'opfs') {
                        // 馃殌 [娣诲姞] 娌℃湁鏈湴鏂囨。澶规椂锛屾娴嬫槸鍚︽敮鎸丱PFS锛堟墜鏈虹锛?
                        const { isOPFSAvailable, saveToOPFS } = await import('../services/storage/opfsService');

                        if (isOPFSAvailable()) {
                            // 鎵嬫満绔細浣跨敤OPFS淇濆瓨鍘熷浘
                            try {
                                const res = await fetch(previewSource);
                                const blob = await res.blob();

                                if (isVideo) {
                                    await saveToOPFS(blob, storageId, 'video');
                                    console.log(`[CanvasContext] Saved video ${storageId} to OPFS`);
                                } else {
                                    await saveToOPFS(blob, storageId, 'image');
                                    console.log(`[CanvasContext] Saved ORIGINAL image ${storageId} to OPFS`);
                                }
                            } catch (e) {
                                if (!preferredOriginalSource.startsWith('blob:')) {
                                    console.error(`[CanvasContext] Failed to save to OPFS`, e);
                                }
                            }
                        } else {
                            console.log(`[CanvasContext] No local folder or OPFS available, using IndexedDB for ${storageId}`);
                        }
                    } else {
                        console.log(`[CanvasContext] Browser storage mode selected, skipping local/OPFS for ${storageId}`);
                    }

                    // B. IndexedDB (娴忚鍣ㄧ紦瀛? - 濮嬬粓淇濆瓨涓€浠藉彲蹇€熸仮澶嶇殑鏁版嵁
                    if (isVideo) {
                        // 瑙嗛锛氱洿鎺ヤ繚瀛橈紝涓嶅帇缂?
                        const { saveImage } = await import('../services/storage/imageStorage');
                        await saveImage(storageId, previewSource);
                        console.log(`[CanvasContext] Saved video ${storageId} to IndexedDB cache`);
                    } else {
                        const { saveImage, saveOriginalImage } = await import('../services/storage/imageStorage');
                        const { getQualityStorageId, ImageQuality } = await import('../services/image/imageQuality');

                        // 馃殌 鍙屼繚闄╋細鏃犺鏄惁鏈夋湰鍦?OPFS锛岄兘淇濆瓨 ORIGINAL 鍒?IndexedDB
                        // 杩欐牱棣栧睆涓庨噸杞介兘鑳介€氳繃 storageId 绉掔骇鍛戒腑锛屼笉蹇呯瓑寰呯鐩樺洖璇?
                        if (stableOriginalSource) {
                            await saveOriginalImage(storageId, stableOriginalSource);
                            console.log(`[CanvasContext] Saved ORIGINAL for ${storageId} to IndexedDB cache`);
                        } else {
                            console.debug(`[CanvasContext] Skip ORIGINAL IDB save for transient blob ${storageId}`);
                        }

                        // 馃殌 [浼樺寲] 浣跨敤Web Worker鐢熸垚缂╃暐鍥撅紝涓嶉樆濉炰富绾跨▼
                        try {
                            const { generateThumbnailWithPreset } = await import('../workers/thumbnailService');
                            const { blob } = await generateThumbnailWithPreset(previewSource, 'MICRO');

                            // 杞崲涓篵ase64淇濆瓨鍒癐ndexedDB
                            const reader = new FileReader();
                            const microData = await new Promise<string>((resolve, reject) => {
                                reader.onload = () => resolve(reader.result as string);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });

                            const microId = getQualityStorageId(storageId, ImageQuality.MICRO);
                            await saveImage(microId, microData);
                            console.log(`[CanvasContext] Saved MICRO thumbnail (Worker) for ${storageId}`);

                            if (selectedStorageMode === 'local' && currentHandle) {
                                await fileSystemService.saveThumbnailToHandle(currentHandle, storageId, blob);
                            }

                            // 棰勮妗ｅ厹搴曞埌鍘熷浘锛岄伩鍏?PREVIEW 绾ц鍙栨椂鍑虹幇绌烘礊
                            const previewId = getQualityStorageId(storageId, ImageQuality.PREVIEW);
                            await saveImage(previewId, previewSource);
                        } catch (workerError) {
                            // Worker澶辫触鏃跺洖閫€鍒颁富绾跨▼
                            console.warn(`[CanvasContext] Worker failed, falling back to main thread:`, workerError);
                            const { compressImageToQuality, QUALITY_CONFIGS } = await import('../services/image/imageQuality');
                            const microData = await compressImageToQuality(previewSource, QUALITY_CONFIGS[ImageQuality.MICRO]);
                            const microId = getQualityStorageId(storageId, ImageQuality.MICRO);
                            await saveImage(microId, microData);
                            console.log(`[CanvasContext] Saved MICRO thumbnail (main thread) for ${storageId}`);

                            if (selectedStorageMode === 'local' && currentHandle) {
                                const microBlob = base64ToBlob(microData);
                                await fileSystemService.saveThumbnailToHandle(currentHandle, storageId, microBlob);
                            }

                            const previewId = getQualityStorageId(storageId, ImageQuality.PREVIEW);
                            await saveImage(previewId, previewSource);
                        }
                    }
                } catch (e) {
                    console.error(`[CanvasContext] Failed to save ${node.id}`, e);
                }
            })());
        }

        // 馃殌 [淇] 鍏堢珛鍗虫樉绀哄浘鐗囷紙涔愯鏇存柊锛夛紝淇濇寔杩炵画鍙戦€佽兘鍔?
        console.log('[CanvasContext.addImageNodes] Updating UI immediately with nodes:', stateNodes.length);
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
                const promotedGroupZByPromptId = new Map<string, number>();

                Array.from(parentIdsToPromote).forEach(promptId => {
                    const promotedGroupZIndex = ++maxZ;
                    promotedGroupZByPromptId.set(promptId, promotedGroupZIndex);
                    if (c.promptNodes.some(promptNode => promptNode.id === promptId)) {
                        nextPromptZById.set(promptId, promotedGroupZIndex);
                    }

                    c.imageNodes
                        .filter(imageNode => imageNode.parentPromptId === promptId)
                        .forEach(imageNode => {
                            nextExistingImageZById.set(imageNode.id, promotedGroupZIndex);
                        });
                });

                appendedNodes.forEach(node => {
                    if (node.parentPromptId) {
                        const promotedGroupZIndex = promotedGroupZByPromptId.get(node.parentPromptId);
                        if (promotedGroupZIndex !== undefined) {
                            nextAppendedImageZById.set(node.id, promotedGroupZIndex);
                            return;
                        }
                    }
                    nextAppendedImageZById.set(node.id, node.zIndex ?? ++maxZ);
                });

                // 馃殌 [Critical Fix] Atomic linking: update parent nodes in the same state transaction
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
            console.log('[CanvasContext.addImageNodes] UI update completed, images are visible');
        } catch (uiError: any) {
            // 馃毃 鑷村懡閿欒锛歎I鏇存柊澶辫触
            console.error('[CanvasContext.addImageNodes] UI update failed!', uiError);
            import('../services/system/notificationService').then(({ notificationService }) => {
                notificationService.error('显示图片失败', '无法显示图片：' + (uiError?.message || '未知错误'));
            });
            throw uiError;
        }

        // 馃殌 鍚庡彴鎵ц鎸佷箙鍖栦换鍔★紙涓嶉樆濉濽I锛?
        console.log('[CanvasContext.addImageNodes] Starting background persistence tasks:', persistenceTasks.length);
        // 浣跨敤鍏ㄥ眬杩借釜鍣ㄩ槻姝㈠埛鏂版椂涓㈠け
        const savePromise = Promise.allSettled(persistenceTasks).then((results) => {
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            console.log('[CanvasContext.addImageNodes] Persistence completed:', successful, 'succeeded /', failed, 'failed /', results.length, 'total');

            if (failed > 0) {
                console.warn('[CanvasContext.addImageNodes] Some image persistence tasks failed; data may be missing after refresh');
                import('../services/system/notificationService').then(({ notificationService }) => {
                    notificationService.warning('图片保存失败', failed + ' 张图片保存失败，建议重新保存或重试。');
                });
            }
        }).catch(e => {
            console.error('[CanvasContext.addImageNodes] Persistence task failed:', e);
        });

        // 杩借釜鏈畬鎴愮殑淇濆瓨浠诲姟
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

    // 馃殌 [Batch Update] Implementation for stacking or massive moves
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

        // 馃殌 [鍏抽敭淇] 璁?storageAdapter 鍘诲皾璇曞垹闄ゅ叏灞€纾佺洏鏂囨。/OPFS
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

        urgentSaveRef.current = true; // 鍒犻櫎鍚庡己鍒舵寕杞藉瓨鍌?
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

        urgentSaveRef.current = true; // 鐖惰妭鐐瑰垹闄ゅ悗鍚屾瀛樼洏
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
        const GAP_X = 100;  // 鉁?澧炲ぇ姘村钩闂磋窛闃叉鍫嗗彔
        const GAP_Y = 120;  // 鉁?澧炲ぇ鍨傜洿闂磋窛闃叉鍫嗗彔
        const IMAGE_GAP = 40; // 鉁?澧炲ぇ鍥剧墖闂磋窛
        const AUTO_ARRANGE_GROUPS_PER_ROW = 20; // 鉁?姣忚鍥哄畾鎸?0涓崱缁勬崲琛?
        const AUTO_ARRANGE_SUB_COLUMNS = 20; // 鉁?鍓崱榛樿灏介噺妯悜鎺掑紑锛?寮犱篃淇濇寔鍗曡
        const AUTO_ARRANGE_GROUP_GAP_X = 56; // 鉁?鑷姩鏁寸悊鏃跺崱缁勬í鍚戣繘涓€姝ユ斁瀹?
        const AUTO_ARRANGE_GROUP_GAP_Y = 120; // 鉁?鑷姩鏁寸悊鏃跺崱缁勮璺濇槑鏄惧鍔?
        const AUTO_ARRANGE_SUB_IMAGE_GAP = 32; // 鉁?鍓崱涔嬮棿杩涗竴姝ユ媺寮€
        const AUTO_ARRANGE_PROMPT_TO_SUB_GAP = 56; // 鉁?涓诲崱涓庡壇鍗′箣闂村鍔犳洿鏄庢樉鐣欑櫧

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

                // [NEW] 鍗曢€変富鍗℃椂: 瀵瑰叾鍓崱搴旂敤鎺掑垪妯″紡杞崲
                if (isPromptOnly && selectedPrompts.length === 1) {
                    const prompt = selectedPrompts[0];
                    const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);

                    if (childImages.length > 0) {
                        const targetMode: SubCardLayout = prompt.mode === GenerationMode.PPT ? 'column' : mode;
                        const SUB_GAP = AUTO_ARRANGE_SUB_IMAGE_GAP;
                        const PROMPT_TO_SUB_GAP = AUTO_ARRANGE_PROMPT_TO_SUB_GAP;

                        // 璁＄畻鍓崱灏哄
                        const imageDims = childImages.map(img => getImageDims(img.aspectRatio, img.dimensions));
                        const avgWidth = imageDims.reduce((sum, d) => sum + d.w, 0) / imageDims.length;
                        const avgHeight = imageDims.reduce((sum, d) => sum + d.h, 0) / imageDims.length;

                        const newImagePositions: Record<string, { x: number, y: number }> = {};
                        const promptCenterX = prompt.position.x;
                        const promptBottom = prompt.position.y;

                        if (targetMode === 'row') {
                            // 妯悜鎺掑垪: 鍓崱姘村钩鎺掓垚涓€琛?灞呬腑瀵归綈
                            const totalWidth = childImages.length * avgWidth + (childImages.length - 1) * SUB_GAP;
                            let currentX = promptCenterX - totalWidth / 2 + avgWidth / 2;
                            const y = promptBottom + PROMPT_TO_SUB_GAP + avgHeight;

                            childImages.forEach((img, i) => {
                                const dims = imageDims[i];
                                newImagePositions[img.id] = { x: currentX, y };
                                currentX += dims.w + SUB_GAP;
                            });
                        } else if (targetMode === 'grid') {
                            // 瀹牸鎺掑垪: 4鍒楃綉鏍?灞呬腑瀵归綈
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
                            // 绔栧悜鎺掑垪: 鍓崱鍨傜洿鎺掓垚涓€鍒?灞呬腑瀵归綈
                            let currentY = promptBottom + PROMPT_TO_SUB_GAP + avgHeight;

                            childImages.forEach((img, i) => {
                                const dims = imageDims[i];
                                newImagePositions[img.id] = { x: promptCenterX, y: currentY };
                                currentY += dims.h + SUB_GAP;
                            });
                        }

                        // 杞崲鍒颁笅涓€涓ā寮?

                        // 搴旂敤浣嶇疆鍙樻洿
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
                    // [MODE A] Prompt Only: 馃殌 鏀逛负鍚屾瀛愬崱锛屽疄鐜板崱缁勬暣浣撴暣鐞?
                    roots = selectedPrompts.map(p => ({
                        id: p.id, type: 'prompt', obj: p,
                        x: p.position.x, y: p.position.y,
                        width: PROMPT_WIDTH, height: p.height || 200,
                        visualCx: p.position.x, visualCy: p.position.y - (p.height || 200) / 2
                    }));
                    syncChildren = true; // 馃殌 鍚敤瀛愬崱鍚屾锛岃鍓崱璺熼殢涓诲崱绉诲姩
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
                            // 馃殌 [FIX] Calculate Bounding Box of Prompt + All Children
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
                    // 2. 浣跨敤浼犲叆鐨刴ode纭畾绛栫暐
                    const strategy: 'matrix' | 'row' | 'column' = mode === 'grid' ? 'matrix' : mode;
                    const GAP = 120; // 鉁?澧炲ぇ鍒嗙粍闂磋窛 (Was 80)
                    const GRID_COLUMNS = 6; // 瀹牸妯″紡鍥哄畾6鍒?

                    // 3. Arrange
                    const newPositions: Record<string, { x: number, y: number }> = {};

                    if (strategy === 'matrix') {
                        // Grid Sort: Rough Row-Major
                        roots.sort((a, b) => {
                            if (Math.abs(a.visualCy - b.visualCy) > 200) return a.visualCy - b.visualCy;
                            return a.visualCx - b.visualCx;
                        });

                        // 浣跨敤鍥哄畾6鍒?
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
                // 鉁?妗嗛€夋暣鐞? 鎸夊崱缁勫鐞?鏀寔鍓崱椤堕儴瀵归綈鍜屽氨杩戝師鍒?

                // 1. 鏋勫缓鍗＄粍鍒楄〃 (绫讳技鍏ㄥ眬鏁寸悊)
                const SUB_COLUMNS = AUTO_ARRANGE_SUB_COLUMNS; // 鍓崱榛樿妯帓锛?寮犱篃涓嶆姌琛?
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

                // 2a. 澶勭悊閫変腑鐨勪富鍗″強鍏跺壇鍗?
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

                // 2b. 澶勭悊閫変腑浣嗘棤涓诲崱鐨勫绔嬪壇鍗?
                selectedImages.filter(img => !processedImageIds.has(img.id)).forEach(img => {
                    const dims = getImageDims(img.aspectRatio, img.dimensions);
                    groups.push({
                        images: [img],
                        width: dims.w,
                        height: dims.h + 200 + PROMPT_TO_SUB_GAP, // 鍋囪鏈変富鍗￠珮搴?
                        originalX: img.position.x,
                        originalY: img.position.y
                    });
                });

                if (groups.length === 0) return;

                // 3. 鎸夊師浣嶇疆鎺掑簭 (灏辫繎鍘熷垯)
                groups.sort((a, b) => {
                    const rowDiff = Math.floor(a.originalY / 200) - Math.floor(b.originalY / 200);
                    if (rowDiff !== 0) return rowDiff;
                    return a.originalX - b.originalX;
                });

                // 4. 璁＄畻閫変腑鍖哄煙涓績 (灏辫繎鍘熷垯)
                const centerX = groups.reduce((sum, g) => sum + g.originalX, 0) / groups.length;
                const centerY = groups.reduce((sum, g) => sum + g.originalY, 0) / groups.length;

                // 5. 涓ら亶澶勭悊: 鍏堝垎琛?鍐嶈缃綅缃?
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

                // 6. 璁＄畻鎬诲昂瀵稿苟浠庝腑蹇冪偣寮€濮嬪竷灞€
                const maxGroupWidth = Math.max(...groups.map(g => g.width));
                const totalLayoutWidth = gridColumns * maxGroupWidth + (gridColumns - 1) * GROUP_GAP_X;
                const totalLayoutHeight = layoutRows.reduce((sum, r) => sum + r.maxTotalHeight, 0) + (layoutRows.length - 1) * GROUP_GAP_Y;
                const startX = centerX - totalLayoutWidth / 2;
                let startY = centerY - totalLayoutHeight / 2;

                const newPositions: Record<string, { x: number; y: number }> = {};
                const movedPrompts = new Set<string>();

                // 7. 璁剧疆浣嶇疆 (鍓崱椤堕儴瀵归綈)
                layoutRows.forEach(layoutRow => {
                    let rowX = startX;
                    const rowMaxPromptHeight = layoutRow.maxPromptHeight;
                    const subCardsStartY = startY + rowMaxPromptHeight + PROMPT_TO_SUB_GAP;

                    layoutRow.groups.forEach(group => {
                        // 馃殌 [淇] 浣跨敤褰撳墠缁勭殑瀹為檯瀹藉害璁＄畻涓績鐐?
                        const groupCenterX = rowX + group.width / 2;

                        if (group.prompt) {
                            const promptHeight = group.prompt.height || 200;
                            newPositions[group.prompt.id] = {
                                x: groupCenterX,
                                y: startY + promptHeight // 鉁?纭繚鎵€鏈変富鍗＄殑椤堕儴姝ｅソ骞抽綈瀵归綈鍦?startY
                            };
                            movedPrompts.add(group.prompt.id);

                            // 鍓崱浣嶇疆
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
                            // 瀛ょ珛鍓崱
                            const img = group.images[0];
                            const dims = getImageDims(img.aspectRatio, img.dimensions);
                            newPositions[img.id] = { x: groupCenterX, y: subCardsStartY + dims.h };
                        }

                        // 馃殌 [淇] 浣跨敤褰撳墠缁勭殑瀹為檯瀹藉害鑰屼笉鏄痬axGroupWidth锛岄槻姝㈤噸鍙?
                        rowX += group.width + GROUP_GAP_X;
                    });

                    startY += layoutRow.maxTotalHeight + GROUP_GAP_Y;
                });

                // 8. 搴旂敤浣嶇疆
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

        // --- 鏂板竷灞€閫昏緫: 浠庡乏涓婅寮€濮?姣忚20缁?---
        // 閰嶇疆
        const GROUPS_PER_ROW = AUTO_ARRANGE_GROUPS_PER_ROW;  // 姣忚鍥哄畾20涓崱缁?
        const GROUP_GAP_X = AUTO_ARRANGE_GROUP_GAP_X;     // 鉁?鍗＄粍涔嬮棿鐨勬í鍚戦棿璺?
        const GROUP_GAP_Y = AUTO_ARRANGE_GROUP_GAP_Y;     // 鉁?琛屼箣闂寸殑绾靛悜闂磋窛
        const START_X = -2000;      // 鐢诲竷宸︿笂瑙掕捣濮媂
        const START_Y = 200;        // 鐢诲竷宸︿笂瑙掕捣濮媃

        // 1. 鍒嗙被鍗＄墖
        const errorPrompts = currentCanvas.promptNodes.filter(p => p.error);
        const errorPromptIds = new Set(errorPrompts.map(p => p.id));

        // 姝ｇ‘鐨凱rompt鍗?鏈夊瓙鍗＄殑)
        const normalPrompts = currentCanvas.promptNodes.filter(p =>
            !errorPromptIds.has(p.id) &&
            currentCanvas.imageNodes.some(img => img.parentPromptId === p.id)
        );

        // 瀛ょ嫭鐨凱rompt鍗?娌℃湁瀛愬崱鐨?
        const orphanPrompts = currentCanvas.promptNodes.filter(p =>
            !errorPromptIds.has(p.id) &&
            !currentCanvas.imageNodes.some(img => img.parentPromptId === p.id)
        );

        // 瀛ょ嫭鐨処mage鍗?娌℃湁鐖禤rompt鐨?
        const orphanImages = currentCanvas.imageNodes.filter(img =>
            !img.parentPromptId ||
            !currentCanvas.promptNodes.some(p => p.id === img.parentPromptId)
        );

        // 2. 鏋勫缓鍗＄粍鍒楄〃
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

        // 2a. 姝ｇ‘鐨勫崱缁?Prompt + 瀛怚mage)
        const SUB_COLUMNS = AUTO_ARRANGE_SUB_COLUMNS; // 鉁?鍓崱榛樿妯帓锛?寮犱篃涓嶆姌琛?
        const SUB_IMAGE_GAP = AUTO_ARRANGE_SUB_IMAGE_GAP; // 瀛愬崱闂磋窛
        const PROMPT_TO_SUB_GAP = AUTO_ARRANGE_PROMPT_TO_SUB_GAP; // 涓诲崱鍜屽壇鍗′箣闂寸殑闂磋窛

        normalPrompts.forEach(prompt => {
            const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);
            const promptWidth = 320;
            const promptHeight = prompt.height || 200;
            const sourceImage = prompt.sourceImageId ? imageById.get(prompt.sourceImageId) : undefined;
            const sourcePromptId = sourceImage?.parentPromptId && promptById.has(sourceImage.parentPromptId)
                ? sourceImage.parentPromptId
                : undefined;

            // 璁＄畻瀛愬崱灏哄
            let maxSubWidth = 0;
            let maxSubHeight = 0;
            childImages.forEach(img => {
                const dims = getImageDims(img.aspectRatio, img.dimensions);
                maxSubWidth = Math.max(maxSubWidth, dims.w);
                maxSubHeight = Math.max(maxSubHeight, dims.h);
            });

            // 瀹為檯鍒楁暟 (涓嶈秴杩囧浘鐗囨暟閲?
            const actualColumns = Math.min(SUB_COLUMNS, childImages.length);
            const rows = Math.ceil(childImages.length / SUB_COLUMNS);

            // 瀛愬崱鍧楀昂瀵?
            const subBlockWidth = actualColumns > 0
                ? actualColumns * maxSubWidth + (actualColumns - 1) * SUB_IMAGE_GAP
                : 0;
            const subBlockHeight = rows > 0
                ? rows * maxSubHeight + (rows - 1) * SUB_IMAGE_GAP
                : 0;

            // 鍗＄粍鎬诲搴﹀拰楂樺害
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

        // 2b. 瀛ょ嫭鐨凱rompt鍗?
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

        // 2c. 瀛ょ嫭鐨処mage鍗?
        orphanImages.forEach(img => {
            const dims = getImageDims(img.aspectRatio, img.dimensions);
            layoutGroups.push({
                type: 'orphan-image',
                images: [img],
                width: dims.w,
                height: dims.h
            });
        });

        // 3. 甯冨眬姝ｅ父鍗＄粍 + 瀛ょ嫭鍗＄粍 (姣忚鍥哄畾20缁?
        // 鉁?涓ら亶澶勭悊:
        //   绗竴閬? 鍒嗛厤鍗＄粍鍒拌,璁＄畻姣忚鐨勬渶澶т富鍗￠珮搴?
        //   绗簩閬? 鏍规嵁姣忚鐨勬渶澶т富鍗￠珮搴﹁缃綅缃?瀹炵幇鍓崱椤堕儴瀵归綈

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

        // 鉁?绗竴閬? 灏嗗崱缁勫垎閰嶅埌琛?
        const rows: Array<{
            groups: LayoutGroup[];
            maxPromptHeight: number;  // 璇ヨ鏈€楂樹富鍗￠珮搴?
            maxTotalHeight: number;   // 璇ヨ鏈€楂樺崱缁勬€婚珮搴?
            startX: number;
        }> = [];

        let currentX = START_X;
        let currentRow: typeof rows[0] = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0, startX: START_X };

        rootLayoutGroups.forEach((group) => {
            const groupsInCurrentRow = currentRow.groups.length;

            // 鎹㈣妫€鏌ワ細鍙寜鍗＄粍鏁版崲琛岋紝涓嶆寜鍗＄粍瀹藉害鎻愬墠鎹㈣
            if (groupsInCurrentRow >= GROUPS_PER_ROW) {
                rows.push(currentRow);
                currentX = START_X;
                currentRow = { groups: [], maxPromptHeight: 0, maxTotalHeight: 0, startX: START_X };
            }

            // 娣诲姞鍒板綋鍓嶈
            currentRow.groups.push(group);

            // 鏇存柊璇ヨ鏈€澶т富鍗￠珮搴?
            const promptHeight = group.prompt?.height || 200;
            currentRow.maxPromptHeight = Math.max(currentRow.maxPromptHeight, promptHeight);
            currentRow.maxTotalHeight = Math.max(currentRow.maxTotalHeight, group.layoutHeight || group.height);

            currentX += group.width + GROUP_GAP_X;
        });

        // 娣诲姞鏈€鍚庝竴琛?
        if (currentRow.groups.length > 0) {
            rows.push(currentRow);
        }

        // 鉁?绗簩閬? 鏍规嵁姣忚鐨勬渶澶т富鍗￠珮搴﹁缃綅缃?
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

        // 4. 閿欒鍗＄墖鍗曠嫭鎹㈣鎺掑垪
        if (errorPrompts.length > 0) {
            // 鏂拌寮€濮?- 鉁?浣跨敤鏂扮殑灞€閮ㄥ彉閲?
            let errorX = START_X;
            let errorRowMaxHeight = 0;
            let errorGroupsInRow = 0;
            currentY += GROUP_GAP_Y + 50; // 棰濆50px鍒嗛殧

            const ERROR_GAP_X = 40; // 閿欒鍗＄墖涔嬮棿鏇寸揣鍑?

            errorPrompts.forEach(prompt => {
                const promptWidth = 320;
                const promptHeight = prompt.height || 200;
                const childImages = currentCanvas.imageNodes.filter(img => img.parentPromptId === prompt.id);

                // 璁＄畻閿欒鍗＄粍灏哄 (浣跨敤涓庢甯稿崱缁勭浉鍚岀殑4鍒楀竷灞€)
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

                // 鎹㈣妫€鏌ワ細閿欒鍗＄粍涔熷彧鎸夊崱缁勬暟鎹㈣
                if (errorGroupsInRow >= GROUPS_PER_ROW) {
                    errorX = START_X;
                    currentY += errorRowMaxHeight + GROUP_GAP_Y;
                    errorRowMaxHeight = 0;
                    errorGroupsInRow = 0;
                }

                const groupCenterX = errorX + groupWidth / 2;

                // Prompt浣嶇疆
                positions[prompt.id] = {
                    x: groupCenterX,
                    y: currentY + promptHeight
                };

                // 瀛怚mage浣嶇疆: 妯悜4鍒楀眳涓?椤堕儴瀵归綈
                if (childImages.length > 0) {
                    const promptBottom = currentY + promptHeight + PROMPT_TO_SUB_GAP;

                    // 璁＄畻瀛愬崱灏哄
                    const imageDims = childImages.map(img => getImageDims(img.aspectRatio, img.dimensions));
                    const maxWidth = Math.max(...imageDims.map(d => d.w));
                    const maxHeight = Math.max(...imageDims.map(d => d.h));

                    // 璁＄畻瀹為檯鍒楁暟
                    const actualColumns = Math.min(SUB_COLUMNS, childImages.length);
                    const blockWidth = actualColumns * maxWidth + (actualColumns - 1) * SUB_IMAGE_GAP;
                    const blockStartX = groupCenterX - blockWidth / 2;

                    childImages.forEach((img, i) => {
                        const col = i % SUB_COLUMNS;
                        const row = Math.floor(i / SUB_COLUMNS);
                        const cardCenterX = blockStartX + col * (maxWidth + SUB_IMAGE_GAP) + maxWidth / 2;
                        // 椤堕儴瀵归綈: y = 椤堕儴浣嶇疆 + 鍗＄墖楂樺害 (搴曢儴閿氱偣)
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
            // 馃殌 浣跨敤prev鑾峰彇鏈€鏂扮姸鎬侊紝閲嶆柊璁＄畻newCanvases
            const updatedCanvases = prev.canvases.map(c =>
                c.id === prev.activeCanvasId ? {
                    ...c,
                    promptNodes: c.promptNodes.map(pn => ({ ...pn, position: positions[pn.id] || pn.position })),
                    imageNodes: c.imageNodes.map(img => ({ ...img, position: positions[img.id] || img.position })),
                    lastModified: Date.now()
                } : c
            );

            // Force Save - 浣跨敤鏇存柊鍚庣殑鐘舵€?
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

    }, [pushToHistory]); // 馃殌 绉婚櫎state渚濊禆锛屼娇鐢ㄥ嚱鏁板紡鏇存柊

    // --- File System Implementation ---

    const connectLocalFolder = useCallback(async () => {
        try {
            let handle: FileSystemDirectoryHandle | null = null;

            // 1. Try Optimized Restore (Permission Prompt instead of Picker)
            try {
                const { restoreLocalFolderConnection } = await import('../services/storage/storagePreference');
                handle = await restoreLocalFolderConnection();
            } catch (err) {
                // 鎭㈠鏈湴鏂囨。澶硅繛鎺ュけ璐ワ紝灏嗙户缁娇鐢ㄦ枃妗ｉ€夋嫨鍣?
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
                        // 馃殌 涓嶅啀璋冪敤getAllImages锛屽彧杩佺Щ褰撳墠鐘舵€侀渶瑕佺殑鍥剧墖

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

                                // 馃殌 浣跨敤鏂扮増 saveImageToHandle (鏀寔瑙嗛鍜屽浘鐗囧垎绂?
                                await fileSystemService.saveImageToHandle(handle!, id, blob, isVideo);

                                if (!isVideo) {
                                    const { generateThumbnailWithPreset } = await import('../workers/thumbnailService');
                                    const { blob: thumbnailBlob } = await generateThumbnailWithPreset(urlOrData, 'MICRO');
                                    await fileSystemService.saveThumbnailToHandle(handle!, id, thumbnailBlob);
                                }
                            } catch (e) {
                                console.warn('[CanvasContext] Failed to migrate image ' + id + ' to local folder', e);
                            }
                        };

                        // 馃殌 鍙縼绉诲綋鍓嶇姸鎬佸疄闄呴渶瑕佺殑鍥剧墖
                        const promises: Promise<void>[] = [];
                        state.canvases.forEach(c => {
                            c.imageNodes.forEach(img => {
                                if (img.id && img.url) {
                                    // 妫€鏌ユ槸鍚︽槸瑙嗛
                                    const isVideo = img.url.startsWith('data:video/') || img.model?.includes('veo') || false;
                                    const lookupId = img.storageId || img.id;
                                    promises.push(saveToDisk(lookupId, img.url, isVideo));
                                }
                            });
                            c.promptNodes.forEach(pn => {
                                pn.referenceImages?.forEach(ref => {
                                    // 馃殌 浣跨敤涓撻棬鐨?saveReferenceImage 鍑芥暟锛堜繚瀛樺埌 refs/ 骞跺帇缂╋級
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

                        // 绛夊緟鎵€鏈変繚瀛樺畬鎴?
                        try {
                            await Promise.allSettled(promises);
                        } catch (e) {
                            console.warn('Migration partial failure', e);
                        }

                        if (promises.length > 0) {
                            // eslint-disable-next-line @typescript-eslint/no-var-requires
                            const { notify } = await import('../services/system/notificationService');
                            notify.success('数据迁移', '已将 ' + promises.length + ' 张临时图片保存到本地文件夹。');
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
                                console.error('[CanvasContext] Failed to cache image ' + id, e);
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

                            console.log('[CanvasContext] Merged local folder canvases:', prev.canvases.length, 'memory +', canvases.length, 'disk ->', finalCanvases.length);

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

                    // 馃殌 [Fix] Persist handle to IndexedDB so it can be restored on reload
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
                            : 'data:' + (ref.mimeType || 'image/png') + ';base64,' + ref.data;
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
        notify.success('已切换到临时模式', '项目数据已保留。');

    }, [state.canvases, state.activeCanvasId]);

    const changeLocalFolder = useCallback(async () => {
        const currentState = stateRef.current;
        if (!currentState.fileSystemHandle) return;

        try {
            // 1. Pick new folder
            const newHandle = await fileSystemService.selectDirectory();
            if (newHandle.name === currentState.folderName) {
                notify.info('提示', '您选择了同一个文件夹');
                return;
            }

            // 2. Confirm Migration
            const confirmed = window.confirm(
                '移动项目到 "' + newHandle.name + '"?\n\n这将移动所有文件，从 "' + currentState.folderName + '" 到新位置。'
            );

            if (!confirmed) return;
            const currentHandle = currentState.fileSystemHandle;
            if (!currentHandle) {
                notify.error('Move failed', 'Current project is not linked to a local folder.');
                return;
            }
            setIsLoading(true);
            try {
                // 3. Perform Move
                await fileSystemService.moveProject(currentHandle, newHandle);

                // 4. Update State to new handle
                setState(prev => ({
                    ...prev,
                    fileSystemHandle: newHandle,
                    folderName: newHandle.name
                }));

                // 馃殌 [Fix] Persist new handle
                import('../services/storage/storagePreference').then(({ setLocalFolderHandle }) => {
                    setLocalFolderHandle(newHandle);
                });

                notify.success('移动成功', '项目已成功移动到新位置。');

            } catch (error: any) {
                notify.error('移动失败', '迁移失败: ' + error.message);
                console.error(error);
            } finally {
                setIsLoading(false);
            }

        } catch (error) {
            // Cancelled picker
        }
    }, [state.fileSystemHandle, state.folderName]);

    // 馃殌 宸插け璐ョ殑鍥剧墖 ID 缂撳瓨锛岄伩鍏嶆瘡 15 绉掗噸澶嶆姤閿欏埛灞?
    const failedReloadIdsRef = useRef<Set<string>>(new Set());
    // 馃殌 [Fix] 鍐欏叆閿侊紝闃叉 refresh 涓?save 绔炴€佹潯浠?
    const isSavingRef = useRef(false);

    const runLocalFolderRefresh = useCallback(async (reason: 'manual' | 'interval' = 'manual') => {
        const currentState = stateRef.current;
        if (!currentState.fileSystemHandle) return;
        // 馃殌 [Fix] 鑻ユ鍦ㄤ繚瀛橈紝璺宠繃鏈疆鍒锋柊锛岄伩鍏嶈鍒板崐鍐欏叆鐨?project.json
        if (isSavingRef.current) {
            console.debug('[CanvasContext] Skipping refresh: save in progress');
            return;
        }
        if (reason === 'interval') {
            const isVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
            const isUserActiveRecently = Date.now() - lastUserActivityAtRef.current < LOCAL_FOLDER_IDLE_GRACE_MS;
            const activeCanvas = currentState.canvases.find(c => c.id === currentState.activeCanvasId);
            const hasRunningGeneration = Boolean(
                activeCanvas?.promptNodes.some(node => node.isGenerating) ||
                activeCanvas?.imageNodes.some(node => node.isGenerating)
            );
            const hasSelection = (currentState.selectedNodeIds?.length || 0) > 0;

            if (isVisible) {
                console.debug('[CanvasContext] Skipping auto refresh: page is visible');
                return;
            }

            if (isUserActiveRecently) {
                console.debug('[CanvasContext] Skipping auto refresh: recent user activity');
                return;
            }

            if (hasRunningGeneration) {
                console.debug('[CanvasContext] Skipping auto refresh: generation in progress');
                return;
            }

            if (hasSelection) {
                console.debug('[CanvasContext] Skipping auto refresh: selection is active');
                return;
            }
        }
        try {
            const handle = currentState.fileSystemHandle;
            const { canvases, images } = await fileSystemService.loadProjectWithThumbs(handle);

            // Hydrate images map to IndexedDB
            for (const [id, data] of images.entries()) {
                const blobUrl = data.url;
                if (blobUrl) {
                    // 馃殌 璺宠繃宸茬煡澶辫触鐨?ID锛屼笉鍐嶉噸澶嶅皾璇曞拰鎶ラ敊
                    if (failedReloadIdsRef.current.has(id)) continue;

                    try {
                        // 妫€鏌ユ槸鍚︽槸鏈夋晥鐨?blob URL
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
                        // blob URL 宸茶繃鏈燂紝灏濊瘯浠庢湰鍦版枃妗ｇ郴缁熼噸鏂板姞杞?
                        console.debug('[CanvasContext] Blob URL expired for ' + id + ', trying to reload from local file system');
                        try {
                            const file = await fileSystemService.loadOriginalFromDisk(handle, id);
                            if (!file) throw new Error('file not found');
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                                const base64data = reader.result as string;
                                if (base64data) {
                                    await saveImage(id, base64data);
                                    console.log('[CanvasContext] Reloaded ' + id + ' from local file system');
                                }
                            };
                            reader.readAsDataURL(file);
                        } catch (fsErr) {
                            // 馃殌 璁板綍澶辫触鐨?ID锛屽悗缁笉鍐嶉噸璇?
                            failedReloadIdsRef.current.add(id);
                            console.debug('[CanvasContext] Failed to reload ' + id + ' from local file system (will skip future retries)');
                        }
                    }
                }
            }

            // Reload state only if changed
            if (canvases.length > 0) {
                setState(prev => {
                    const nextActiveCanvasId = currentState.activeCanvasId || prev.activeCanvasId;
                    const incomingActiveCanvas = canvases.find(c => c.id === nextActiveCanvasId) || canvases[0];
                    const currentActiveCanvas = prev.canvases.find(c => c.id === incomingActiveCanvas?.id);

                    if (incomingActiveCanvas && currentActiveCanvas) {
                        if ((currentActiveCanvas.lastModified || 0) > (incomingActiveCanvas.lastModified || 0) + 2000) {
                            return prev;
                        }

                        const promptCountMatch = currentActiveCanvas.promptNodes.length === incomingActiveCanvas.promptNodes.length;
                        const imageCountMatch = currentActiveCanvas.imageNodes.length === incomingActiveCanvas.imageNodes.length;

                        if (
                            promptCountMatch &&
                            imageCountMatch &&
                            Math.abs((currentActiveCanvas.lastModified || 0) - (incomingActiveCanvas.lastModified || 0)) < 5000
                        ) {
                            return prev;
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
    }, []);

    // Auto-Sync: Poll local folder every 15 seconds if connected (闄嶄綆棰戠巼浠ュ噺灏戠珵鎬佸啿绐?
    const refreshLocalFolder = useCallback(async () => {
        await runLocalFolderRefresh('manual');
    }, [runLocalFolderRefresh]);

    useEffect(() => {
        if (!state.fileSystemHandle) return;
        const interval = window.setInterval(() => {
            void runLocalFolderRefresh('interval');
        }, LOCAL_FOLDER_REFRESH_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [state.fileSystemHandle, runLocalFolderRefresh]);

    // Enhanced Persistence (Local Storage + File System)
    useEffect(() => {
        if (isLoading) return;

        const saveState = async () => {
            // 馃殌 [Fix] 璁剧疆鍐欏叆閿侊紝闃叉 refresh 璇诲埌鍗婂啓鍏ョ姸鎬?
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
                                    if (!res.ok) throw new Error('Fetch status: ' + res.status);
                                    const blob = await res.blob();
                                    imagesToSave.set(id, blob);
                                } catch (err: any) {
                                    // 馃殌 [Fix] Ignore known blob errors to prevent console spam
                                    if (err.message && err.message.includes('ERR_UPLOAD_FILE_CHANGED')) {
                                        console.warn('[CanvasContext] Blob reference lost for ' + id + ' (file changed/moved), skipping save.');
                                    } else if (err instanceof TypeError && String(err.message || '').includes('Failed to fetch')) {
                                        // blob/data URL 鍦ㄧ敓鍛藉懆鏈熸湯鏈熷彲鑳藉凡澶辨晥锛岃繖绫婚敊璇彲瀹夊叏蹇界暐
                                    } else {
                                        console.warn('[CanvasContext] Skip saving image ' + id + ' (fetch failed):', err);
                                    }
                                }
                            }
                        }

                        // Prepare Clean State for JSON
                        // 馃洝锔?[闃插尽鎬т慨澶峕 纭繚 canvases 涓嶄负绌轰笖鍖呭惈 activeCanvasId
                        const cleanCanvases = stripImageUrls(state.canvases);
                        if (cleanCanvases.length === 0) {
                            console.error('[CanvasContext] Aborting save: canvases array is empty! This would wipe project.json');
                            return;
                        }

                        const fsState = {
                            canvases: cleanCanvases,
                            activeCanvasId: state.activeCanvasId || cleanCanvases[0]?.id || 'default',
                            version: 1
                        };

                        console.log('[CanvasContext] Saving project to disk:', {
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
                // 馃殌 [Fix] 閲婃斁鍐欏叆閿?
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
                    // 瀹屽叏鏇挎崲閫夋嫨
                    newSelectedIds = ids;
                    break;

                case 'add':
                    // 娣诲姞鍒伴€夋嫨锛圫hift+妗嗛€夛級
                    ids.forEach(id => current.add(id));
                    newSelectedIds = Array.from(current);
                    break;

                case 'remove':
                    // 浠庨€夋嫨涓Щ闄わ紙Alt+妗嗛€夛級
                    ids.forEach(id => current.delete(id));
                    newSelectedIds = Array.from(current);
                    break;

                case 'toggle':
                    // 鍒囨崲閫夋嫨锛圕trl+鐐瑰嚮锛?
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

    // 馃殌 [Layering] Bring nodes to front by assigning higher zIndex
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

            const getPromptGroupImageIds = (promptId: string) => {
                const prompt = promptById.get(promptId);
                if (!prompt) return [] as string[];

                const childImageIds = new Set<string>(
                    (prompt.childImageIds || []).filter((id): id is string => Boolean(id))
                );

                currentCanvas.imageNodes.forEach(image => {
                    if (image.parentPromptId === promptId) {
                        childImageIds.add(image.id);
                    }
                });

                return Array.from(childImageIds);
            };

            const pushPromptGroup = (promptId: string) => {
                if (expandedPromptIds.has(promptId)) return;
                expandedPromptIds.add(promptId);

                const prompt = promptById.get(promptId);
                if (!prompt) return;

                pushNodeId(prompt.id);
                getPromptGroupImageIds(promptId).forEach(pushNodeId);
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
            const promotedPromptGroupIds = new Set<string>();

            orderedNodeIds.forEach(id => {
                const prompt = promptById.get(id);
                if (prompt) {
                    if (promotedPromptGroupIds.has(prompt.id)) return;
                    promotedPromptGroupIds.add(prompt.id);
                    const groupZIndex = ++maxZ;
                    nextZIndexById.set(prompt.id, groupZIndex);
                    getPromptGroupImageIds(prompt.id).forEach(childImageId => {
                        nextZIndexById.set(childImageId, groupZIndex);
                    });
                    return;
                }

                const image = imageById.get(id);
                if (image?.parentPromptId && promptById.has(image.parentPromptId)) {
                    if (promotedPromptGroupIds.has(image.parentPromptId)) return;
                    promotedPromptGroupIds.add(image.parentPromptId);
                    const groupZIndex = ++maxZ;
                    nextZIndexById.set(image.parentPromptId, groupZIndex);
                    getPromptGroupImageIds(image.parentPromptId).forEach(childImageId => {
                        nextZIndexById.set(childImageId, groupZIndex);
                    });
                    return;
                }

                if (!nextZIndexById.has(id)) {
                    nextZIndexById.set(id, ++maxZ);
                }
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

    // 馃殌 [Layering] Auto-bring selected nodes to front when selection changes
    const prevSelectedRef = useRef<string[]>([]);
    useEffect(() => {
        const currentSelected = state.selectedNodeIds || [];
        const prevSelected = prevSelectedRef.current;

        // Only bring to front if there are newly selected nodes (not just deselection)
        const hasNewSelection = currentSelected.length > 0 &&
            (currentSelected.length > prevSelected.length ||
                currentSelected.some(id => !prevSelected.includes(id)));

        if (hasNewSelection) {
            prevSelectedRef.current = [...currentSelected];
            // Small delay to avoid state update during render
            const timer = setTimeout(() => {
                bringNodesToFront(currentSelected);
            }, 0);
            return () => clearTimeout(timer);
        }

        prevSelectedRef.current = [...currentSelected];
    }, [state.selectedNodeIds, bringNodesToFront]);

    // 馃殌 [Drag Optimization] Real-time state update for smooth drag and connection lines
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
     * 鏌ユ壘涓嬩竴涓崱缁勭殑缃戞牸浣嶇疆
     * 瑙勫垯锛氫紭鍏堝悜鍙虫帓鍒楋紝姣忔帓30涓崱缁勫悗鎹㈣
     * 杩斿洖涓诲崱锛堟彁绀鸿瘝锛夌殑搴曢儴涓績浣嶇疆
     *
     * Card Group Layout Strategy:
     * - Each group consists of a Main Card (Prompt) and Sub Cards (Images)
     * - Groups are arranged in a grid: 30 per row, then wrap to next row
     * - Dynamic width calculation based on existing sub-cards
     */
    const findNextGroupPosition = useCallback((): { x: number; y: number } => {
        // 鍗＄粍甯冨眬鍙傛暟
        const SUB_CARD_WIDTH = 280;      // 鍓崱瀹藉害
        const SUB_CARD_GAP = 16;         // 鍓崱涔嬮棿闂磋窛
        const GROUP_BASE_WIDTH = 380;   // 鍗曞壇鍗℃椂鐨勫崱缁勫熀纭€瀹藉害
        const GROUP_HEIGHT = 600;        // 涓诲崱 + 闂磋窛 + 鍓崱楂樺害
        const GAP_X = 40;                // 鍗＄粍姘村钩闂磋窛
        const GAP_Y = 80;                // 鎺掗棿鍨傜洿闂磋窛
        const GROUPS_PER_ROW = 30;       // 姣忔帓鏈€澶у崱缁勬暟

        const currentCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (!currentCanvas) return { x: 0, y: 200 };

        const groupCount = currentCanvas.promptNodes.length;

        // 濡傛灉娌℃湁鐜版湁鍗＄粍锛岃繑鍥炲垵濮嬩綅缃?
        if (groupCount === 0) {
            return { x: 0, y: 200 };
        }

        // 璁＄畻姣忎釜鐜版湁鍗＄粍鐨勫疄闄呭搴︼紙鍩轰簬鍓崱鏁伴噺锛?
        const getGroupWidth = (promptId: string): number => {
            const childCount = currentCanvas.imageNodes.filter(
                img => img.parentPromptId === promptId
            ).length;

            // 鍓崱鏈€澶?鍒楁帓鍒?
            const cols = Math.min(Math.max(childCount, 1), 2);
            const width = cols * SUB_CARD_WIDTH + (cols - 1) * SUB_CARD_GAP + 40;
            return Math.max(GROUP_BASE_WIDTH, width);
        };

        // 璁＄畻褰撳墠琛屽彿鍜屽垪鍙?
        const row = Math.floor(groupCount / GROUPS_PER_ROW);
        const col = groupCount % GROUPS_PER_ROW;

        // 璁＄畻褰撳墠琛岀殑绱НX鍋忕Щ
        const startRowIdx = row * GROUPS_PER_ROW;
        let xOffset = 0;

        // 绱姞褰撳墠琛屼腑鎵€鏈夊凡瀛樺湪鍗＄粍鐨勫搴?
        for (let i = startRowIdx; i < groupCount; i++) {
            const prompt = currentCanvas.promptNodes[i];
            if (prompt) {
                xOffset += getGroupWidth(prompt.id) + GAP_X;
            }
        }

        // 缁熶竴宸﹀榻愭帓甯?
        const startX = 0;

        // 鏂板崱缁刋浣嶇疆 = 璧峰X + 绱Н鍋忕Щ + 鏂板崱缁勫搴︾殑涓€鍗婏紙灞呬腑閿氱偣锛?
        const newGroupWidth = GROUP_BASE_WIDTH;
        const x = startX + xOffset + newGroupWidth / 2;

        // Y浣嶇疆鏍规嵁琛屽彿璁＄畻
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

    // 馃殌 瑙嗗彛涓績鍔ㄦ€佸姞杞?- 浣跨敤useCallback闃叉鏃犻檺寰幆
    const setViewportCenter = useCallback((center: { x: number; y: number }) => {
        setState(prev => ({ ...prev, viewportCenter: center }));
    }, []);

    // 馃殌 杩佺Щ閫変腑鑺傜偣鍒板叾浠栭」鐩?
    const migrateNodes = useCallback((nodeIds: string[], targetCanvasId: string) => {
        setState(prev => {
            const sourceCanvas = prev.canvases.find(c => c.id === prev.activeCanvasId);
            const targetCanvas = prev.canvases.find(c => c.id === targetCanvasId);
            if (!sourceCanvas || !targetCanvas) return prev;

            // 鎵惧嚭瑕佽縼绉荤殑鑺傜偣
            const promptsToMigrate = sourceCanvas.promptNodes.filter(n => nodeIds.includes(n.id));
            const imagesToMigrate = sourceCanvas.imageNodes.filter(n => nodeIds.includes(n.id));

            // 濡傛灉杩佺Щ鐨勬槸涓诲崱,涔熻縼绉诲叾瀛愬浘鐗?
            const childImageIds = promptsToMigrate.flatMap(p => p.childImageIds || []);
            const childImagesToMigrate = sourceCanvas.imageNodes.filter(n => childImageIds.includes(n.id) && !nodeIds.includes(n.id));

            // 璁＄畻鍋忕Щ閲?鏀惧湪鐩爣鐢诲竷鍙充晶)
            const offsetX = targetCanvas.promptNodes.length > 0
                ? Math.max(...targetCanvas.promptNodes.map(n => n.position.x)) + 500
                : 0;

            // 鏇存柊杩佺Щ鑺傜偣鐨勪綅缃?- 馃敡 淇濈暀鍥剧墖URL纭繚鑳芥纭樉绀?
            const migratedPrompts = promptsToMigrate.map(p => ({
                ...p,
                position: { x: p.position.x + offsetX, y: p.position.y }
            }));
            const migratedImages = [...imagesToMigrate, ...childImagesToMigrate].map(img => ({
                ...img,
                position: { x: img.position.x + offsetX, y: img.position.y },
                // 馃敡 鍏抽敭锛氱‘淇漊RL瀹屾暣淇濈暀浠ヤ究瀛樺偍灞傝兘姝ｇ‘淇濆瓨
                url: img.url || '',
                originalUrl: img.originalUrl || ''
            }));

            // 馃敡 杩佺Щ鍚庣珛鍗充繚瀛樺浘鐗囧埌IndexedDB锛堝紓姝ワ紝涓嶉樆濉濽I锛?
            (async () => {
                try {
                    const { saveImage, getImage } = await import('../services/storage/imageStorage');
                    for (const img of migratedImages) {
                        // 纭繚鍥剧墖宸插瓨鍦ㄤ簬IndexedDB
                        const existingUrl = await getImage(img.id);
                        if (!existingUrl && (img.url || img.originalUrl)) {
                            const urlToSave = img.originalUrl || img.url;
                            if (urlToSave && !urlToSave.startsWith('blob:')) {
                                await saveImage(img.id, urlToSave);
                                console.log('[MigrateNodes] Saved image ' + img.id + ' to IndexedDB');
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[MigrateNodes] Failed to save images to IndexedDB', e);
                }
            })();

            // 浠庢簮鐢诲竷鍒犻櫎,娣诲姞鍒扮洰鏍囩敾甯?
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

            console.log('[MigrateNodes] Migrated', migratedPrompts.length, 'prompts,', migratedImages.length, 'images to canvas', targetCanvasId);
            return { ...prev, canvases: updatedCanvases, selectedNodeIds: [] };
        });
    }, []);

    const mergeCanvasInto = useCallback((sourceCanvasId: string, targetCanvasId: string, options?: { deleteSource?: boolean }) => {
        const deleteSource = options?.deleteSource !== false;
        let summary = {
            movedPrompts: 0,
            movedImages: 0,
            deletedSource: false
        };

        setState(prev => {
            if (sourceCanvasId === targetCanvasId) {
                return prev;
            }

            const sourceCanvas = prev.canvases.find(c => c.id === sourceCanvasId);
            const targetCanvas = prev.canvases.find(c => c.id === targetCanvasId);
            if (!sourceCanvas || !targetCanvas) {
                return prev;
            }

            const targetPromptIds = new Set(targetCanvas.promptNodes.map(node => node.id));
            const targetImageIds = new Set(targetCanvas.imageNodes.map(node => node.id));
            const targetGroupIds = new Set((targetCanvas.groups || []).map(group => group.id));
            const targetMaxX = Math.max(
                0,
                ...targetCanvas.promptNodes.map(node => node.position.x || 0),
                ...targetCanvas.imageNodes.map(node => node.position.x || 0)
            );
            const offsetX = targetCanvas.promptNodes.length > 0 || targetCanvas.imageNodes.length > 0 ? targetMaxX + 500 : 0;

            const movedPrompts = sourceCanvas.promptNodes
                .filter(node => !targetPromptIds.has(node.id))
                .map(node => ({
                    ...node,
                    position: { x: node.position.x + offsetX, y: node.position.y }
                }));

            const movedImages = sourceCanvas.imageNodes
                .filter(node => !targetImageIds.has(node.id))
                .map(node => ({
                    ...node,
                    canvasId: targetCanvasId,
                    position: { x: node.position.x + offsetX, y: node.position.y }
                }));

            const movedNodeIds = new Set<string>([
                ...movedPrompts.map(node => node.id),
                ...movedImages.map(node => node.id)
            ]);

            const movedGroups = (sourceCanvas.groups || [])
                .filter(group => !targetGroupIds.has(group.id))
                .map(group => ({
                    ...group,
                    nodeIds: (group.nodeIds || []).filter(nodeId => movedNodeIds.has(nodeId))
                }))
                .filter(group => group.nodeIds.length > 0);

            summary = {
                movedPrompts: movedPrompts.length,
                movedImages: movedImages.length,
                deletedSource: deleteSource
            };

            const updatedCanvases = prev.canvases
                .map(canvas => {
                    if (canvas.id === targetCanvasId) {
                        return {
                            ...canvas,
                            promptNodes: [...canvas.promptNodes, ...movedPrompts],
                            imageNodes: [...canvas.imageNodes, ...movedImages],
                            groups: [...(canvas.groups || []), ...movedGroups],
                            lastModified: Date.now()
                        };
                    }

                    if (canvas.id === sourceCanvasId && !deleteSource) {
                        return {
                            ...canvas,
                            promptNodes: [],
                            imageNodes: [],
                            groups: [],
                            lastModified: Date.now()
                        };
                    }

                    return canvas;
                })
                .filter(canvas => !(deleteSource && canvas.id === sourceCanvasId));

            return {
                ...prev,
                canvases: updatedCanvases,
                activeCanvasId: prev.activeCanvasId === sourceCanvasId && deleteSource ? targetCanvasId : prev.activeCanvasId,
                selectedNodeIds: []
            };
        });

        return summary;
    }, []);

    const cleanupInvalidCards = useCallback((canvasId?: string) => {
        let summary = {
            removedPrompts: 0,
            removedImages: 0,
            removedGroups: 0
        };

        setState(prev => {
            const targetCanvasId = canvasId || prev.activeCanvasId;
            const targetCanvas = prev.canvases.find(c => c.id === targetCanvasId);
            if (!targetCanvas) {
                return prev;
            }

            const promptIds = new Set(targetCanvas.promptNodes.map(node => node.id));
            const promptIdsToRemove = new Set(
                targetCanvas.promptNodes
                    .filter(node => !node.isGenerating && !!node.error && (node.childImageIds?.length || 0) === 0)
                    .map(node => node.id)
            );

            const imageIdsToRemove = new Set(
                targetCanvas.imageNodes
                    .filter(node => {
                        const hasBrokenParent = !!node.parentPromptId && !node.orphaned && !promptIds.has(node.parentPromptId);
                        const hasBrokenContent = !node.isGenerating && !node.url && !node.originalUrl;
                        const hasErrorState = !node.isGenerating && !!node.error;
                        return hasBrokenParent || hasBrokenContent || hasErrorState;
                    })
                    .map(node => node.id)
            );

            const nextPromptNodes = targetCanvas.promptNodes
                .filter(node => !promptIdsToRemove.has(node.id))
                .map(node => ({
                    ...node,
                    childImageIds: (node.childImageIds || []).filter(childId => !imageIdsToRemove.has(childId))
                }));

            const nextPromptIds = new Set(nextPromptNodes.map(node => node.id));
            const nextImageNodes = targetCanvas.imageNodes.filter(node => {
                if (imageIdsToRemove.has(node.id)) {
                    return false;
                }
                if (!node.orphaned && node.parentPromptId && !nextPromptIds.has(node.parentPromptId)) {
                    imageIdsToRemove.add(node.id);
                    return false;
                }
                return true;
            });

            const remainingNodeIds = new Set<string>([
                ...nextPromptNodes.map(node => node.id),
                ...nextImageNodes.map(node => node.id)
            ]);
            const nextGroups = (targetCanvas.groups || []).filter(group =>
                (group.nodeIds || []).some(nodeId => remainingNodeIds.has(nodeId))
            );

            summary = {
                removedPrompts: targetCanvas.promptNodes.length - nextPromptNodes.length,
                removedImages: targetCanvas.imageNodes.length - nextImageNodes.length,
                removedGroups: (targetCanvas.groups || []).length - nextGroups.length
            };

            if (summary.removedPrompts === 0 && summary.removedImages === 0 && summary.removedGroups === 0) {
                return prev;
            }

            return {
                ...prev,
                canvases: prev.canvases.map(canvas =>
                    canvas.id === targetCanvasId
                        ? {
                            ...canvas,
                            promptNodes: nextPromptNodes,
                            imageNodes: nextImageNodes,
                            groups: nextGroups,
                            lastModified: Date.now()
                        }
                        : canvas
                ),
                selectedNodeIds: prev.selectedNodeIds.filter(nodeId => remainingNodeIds.has(nodeId))
            };
        });

        return summary;
    }, []);

    // 馃殌 [鎬ц兘浼樺寲] 缂撳瓨 Context Value锛岄槻姝㈤珮棰?state锛堝 viewportCenter锛夋敼鍙樻椂鎵€鏈夋秷璐圭粍浠跺叏閲忛噸娓叉煋
    const contextValue = React.useMemo(() => ({
        state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas,
        addPromptNode, updatePromptNode, addImageNodes, updatePromptNodePosition, updateImageNodePosition, updateImageNodeDimensions, updateImageNode,
        updateNodes, // 馃殌 Batch Update
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
        mergeCanvasInto,
        cleanupInvalidCards,
        urgentUpdatePromptNode
    }), [
        state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas,
        addPromptNode, updatePromptNode, addImageNodes, updatePromptNodePosition, updateImageNodePosition, updateImageNodeDimensions, updateImageNode,
        updateNodes,
        deleteImageNode, deletePromptNode, linkNodes, unlinkNodes, clearAllData, canCreateCanvas,
        undo, redo, pushToHistory, canUndo, canRedo, arrangeAllNodes, getNextCardPosition,
        connectLocalFolder, disconnectLocalFolder, changeLocalFolder, refreshLocalFolder,
        isLoading, selectNodes, clearSelection, bringNodesToFront, moveSelectedNodes, findSmartPosition, findNextGroupPosition, addGroup, removeGroup, updateGroup, setNodeTags, setViewportCenter, migrateNodes, mergeCanvasInto, cleanupInvalidCards, urgentUpdatePromptNode
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
