import { useState, useCallback, useRef, useEffect } from 'react';
import { PromptNode, GeneratedImage, GenerationMode, AspectRatio, ImageSize, ReferenceImage } from '../types';
import { llmService } from '../services/llm/LLMService';
import { generateImage, cancelGeneration } from '../services/llm/geminiService';
import { useCanvas } from '../context/CanvasContext';
import { useBilling } from '../context/BillingContext';
import { saveImage, saveOriginalImage, getImage } from '../services/storage/imageStorage';
import { fileSystemService } from '../services/storage/fileSystemService';
import { keyManager } from '../services/auth/keyManager';
import { isCreditBasedModel } from '../services/model/modelPricing';
import { 
  normalizePptSlidesForCount, 
  buildAutoPptSlides, 
  buildPptPageAlias 
} from '../utils/pptUtils';
import { clearSyncImageBridgeRequest, getSyncImageBridgeRequest } from '../services/llm/syncImageBridge';

const GENERATE_TIMEOUT_MS = 600000;
const SYNC_BRIDGE_RECOVERY_RETRY_MS = 2500;
const SYNC_BRIDGE_RECOVERY_MAX_AGE_MS = 15 * 60 * 1000;

type PendingSyncRequest = {
  requestId: string;
  index: number;
  prompt: string;
  startedAt: number;
  keySlotId?: string;
};

const hasRecoverableReferenceImage = (img?: Partial<ReferenceImage> | null): boolean => {
  if (!img) return false;

  const data = typeof img.data === 'string' ? img.data.trim() : '';
  if (data.length > 0) return true;

  if (typeof img.storageId === 'string' && img.storageId.trim().length > 0) return true;
  if (typeof img.url === 'string' && img.url.trim().length > 0) return true;

  // Keep legacy records that rely on id-only cache recovery.
  return typeof img.id === 'string' && img.id.trim().length > 0;
};

export const useImageGeneration = (options: {
  isMobile: boolean;
  getCardDimensions: (ratio: AspectRatio, hasToolbar?: boolean) => { width: number; totalHeight: number };
  rememberPreferredKeyForMode: (mode: GenerationMode | undefined, keySlotId: string | undefined) => void;
}) => {
  const { isMobile, getCardDimensions, rememberPreferredKeyForMode } = options;
  const { 
    activeCanvas, 
    updatePromptNode, 
    urgentUpdatePromptNode, 
    addImageNodes, 
    deleteImageNode,
    updateImageNode,
    updateImageNodePosition
  } = useCanvas();
  
  const { refundCredits } = useBilling();
  const [isGenerating, setIsGenerating] = useState(false);
  
  const activeCanvasRef = useRef(activeCanvas);
  useEffect(() => {
    activeCanvasRef.current = activeCanvas;
  }, [activeCanvas]);

  // --- Helpers ---

  const extractErrorDetails = useCallback((error: any, fallbackModel?: string) => {
    const details = {
      code: error?.code ? String(error.code) : undefined,
      status: typeof error?.status === 'number' ? error.status : (typeof error?.response?.status === 'number' ? error.response.status : undefined),
      requestPath: error?.requestPath ? String(error.requestPath) : (error?.request?.path ? String(error.request.path) : undefined),
      requestBody: undefined as string | undefined,
      responseBody: undefined as string | undefined,
      provider: error?.provider ? String(error.provider) : undefined,
      model: fallbackModel,
      timestamp: Date.now()
    };
    if (error?.requestBody) details.requestBody = typeof error.requestBody === 'string' ? error.requestBody : JSON.stringify(error.requestBody, null, 2);
    if (error?.responseBody) details.responseBody = typeof error.responseBody === 'string' ? error.responseBody : JSON.stringify(error.responseBody, null, 2);
    if (error?.message && !details.responseBody) details.responseBody = String(error.message);
    return details;
  }, []);

  const resolveProviderDisplay = useCallback((keySlotId?: string, fallbackProviderLabel?: string, fallbackProvider?: string) => {
    if (fallbackProviderLabel) return { provider: fallbackProvider, providerLabel: fallbackProviderLabel };
    if (keySlotId) {
      const provider = keyManager.getProvider(keySlotId);
      if (provider) return { provider: provider.name || fallbackProvider, providerLabel: provider.name || fallbackProviderLabel || 'Custom' };
      const keySlot = keyManager.getKey(keySlotId);
      if (keySlot) return { provider: String(keySlot.provider || ''), providerLabel: keySlot.name || String(keySlot.provider || 'Official') };
    }
    return { provider: fallbackProvider, providerLabel: fallbackProviderLabel || fallbackProvider };
  }, []);

  // --- Task State Helpers ---

  const getPendingTaskIds = useCallback((node?: PromptNode | null): string[] => {
    const rawPendingTaskIds = (node?.generationMetadata as { pendingTaskIds?: unknown } | undefined)?.pendingTaskIds;
    const fallbackTaskIds = node?.jobId ? [node.jobId] : [];
    const normalizedTaskIds = Array.isArray(rawPendingTaskIds) ? rawPendingTaskIds : fallbackTaskIds;
    return Array.from(new Set(
      normalizedTaskIds.filter((taskId): taskId is string => typeof taskId === 'string' && taskId.trim().length > 0)
    ));
  }, []);

  const buildGenerationMetadata = useCallback((node: PromptNode | null | undefined, partial: Record<string, unknown>) => ({
    ...(node?.generationMetadata || {}),
    ...partial,
  }), []);

  const getPendingSyncRequests = useCallback((node?: PromptNode | null): PendingSyncRequest[] => {
    const rawPendingSyncRequests = (node?.generationMetadata as { pendingSyncRequests?: unknown } | undefined)?.pendingSyncRequests;
    if (!Array.isArray(rawPendingSyncRequests)) return [];

    return rawPendingSyncRequests.filter((item): item is PendingSyncRequest => (
      !!item
      && typeof item === 'object'
      && typeof (item as PendingSyncRequest).requestId === 'string'
      && (item as PendingSyncRequest).requestId.trim().length > 0
    ));
  }, []);

  const buildPendingTaskMetadata = useCallback((node: PromptNode | null | undefined, pendingTaskIds: string[]) => (
    buildGenerationMetadata(node, { pendingTaskIds })
  ), [buildGenerationMetadata]);

  const buildPendingSyncMetadata = useCallback((node: PromptNode | null | undefined, pendingSyncRequests: PendingSyncRequest[]) => (
    buildGenerationMetadata(node, { pendingSyncRequests })
  ), [buildGenerationMetadata]);

  const registerPendingTaskId = useCallback((node: PromptNode, taskId: string): PromptNode => {
    const nextPendingTaskIds = Array.from(new Set([...getPendingTaskIds(node), taskId]));
    return {
      ...node,
      jobId: nextPendingTaskIds[0],
      generationMetadata: buildPendingTaskMetadata(node, nextPendingTaskIds),
    };
  }, [buildPendingTaskMetadata, getPendingTaskIds]);

  const registerPendingSyncRequest = useCallback((node: PromptNode, pendingRequest: PendingSyncRequest): PromptNode => {
    const existing = getPendingSyncRequests(node);
    const nextPendingSyncRequests = existing.some(item => item.requestId === pendingRequest.requestId)
      ? existing
      : [...existing, pendingRequest];

    return {
      ...node,
      generationMetadata: buildPendingSyncMetadata(node, nextPendingSyncRequests),
    };
  }, [buildPendingSyncMetadata, getPendingSyncRequests]);

  const clearPendingSyncRequests = useCallback((node: PromptNode, requestIds: string[]): PromptNode => {
    if (!requestIds.length) return node;
    const requestIdSet = new Set(requestIds);
    const nextPendingSyncRequests = getPendingSyncRequests(node).filter(item => !requestIdSet.has(item.requestId));
    return {
      ...node,
      generationMetadata: buildPendingSyncMetadata(node, nextPendingSyncRequests),
    };
  }, [buildPendingSyncMetadata, getPendingSyncRequests]);

  const resolvePendingTaskState = useCallback((node: PromptNode, completedTaskId?: string) => {
    const currentPendingTaskIds = getPendingTaskIds(node);
    const nextPendingTaskIds = completedTaskId
      ? currentPendingTaskIds.filter(taskId => taskId !== completedTaskId)
      : [];
    return {
      nextPendingTaskIds,
      nextJobId: nextPendingTaskIds[0],
      nextGenerationMetadata: buildPendingTaskMetadata(node, nextPendingTaskIds),
    };
  }, [buildPendingTaskMetadata, getPendingTaskIds]);

  const getExpectedGenerationCount = useCallback((node?: PromptNode | null) => (
    Math.max(1, Number(node?.lastGenerationTotalCount || node?.parallelCount || 1) || 1)
  ), []);

  const getGeneratedImagePosition = useCallback((
    basePosition: { x: number; y: number },
    aspectRatio: AspectRatio,
    mode: GenerationMode | undefined,
    index: number,
    totalCount: number
  ) => {
    const safeTotalCount = Math.max(1, totalCount);
    const gapToImages = 80;
    const gap = 20;
    const { width: cardWidth, totalHeight: cardHeight } = getCardDimensions(aspectRatio, true);
    const columns = 2;
    const row = Math.floor(index / columns);
    const col = index % columns;
    const cardsInCurrentRow = Math.min(columns, safeTotalCount - row * columns);

    if (mode === GenerationMode.PPT) {
      const pptGap = 28;
      return { x: basePosition.x, y: basePosition.y + gapToImages + cardHeight + index * (cardHeight + pptGap) };
    }
    
    if (isMobile) {
      const mobileCardWidth = 170;
      const mobileCardHeight = 260;
      const mobileGap = 10;
      const rowWidth = cardsInCurrentRow * mobileCardWidth + (cardsInCurrentRow - 1) * mobileGap;
      const startX = -rowWidth / 2;
      return {
        x: basePosition.x + startX + col * (mobileCardWidth + mobileGap) + mobileCardWidth / 2,
        y: basePosition.y + gapToImages + mobileCardHeight + row * (mobileCardHeight + mobileGap),
      };
    }

    const rowWidth = cardsInCurrentRow * cardWidth + (cardsInCurrentRow - 1) * gap;
    const startX = -rowWidth / 2;
    return {
      x: basePosition.x + startX + col * (cardWidth + gap) + cardWidth / 2,
      y: basePosition.y + gapToImages + cardHeight + row * (cardHeight + gap),
    };
  }, [isMobile, getCardDimensions]);

  const syncBridgeRecoveryTimersRef = useRef<Map<string, number>>(new Map());
  const syncBridgeRecoveryInFlightRef = useRef<Set<string>>(new Set());

  const clearSyncBridgeRecoveryTimer = useCallback((requestId: string) => {
    const timer = syncBridgeRecoveryTimersRef.current.get(requestId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      syncBridgeRecoveryTimersRef.current.delete(requestId);
    }
  }, []);

  const scheduleSyncBridgeRecovery = useCallback((nodeId: string, pendingRequest: PendingSyncRequest, delayMs: number = SYNC_BRIDGE_RECOVERY_RETRY_MS) => {
    clearSyncBridgeRecoveryTimer(pendingRequest.requestId);
    const timer = window.setTimeout(() => {
      syncBridgeRecoveryTimersRef.current.delete(pendingRequest.requestId);
      syncBridgeRecoveryInFlightRef.current.delete(pendingRequest.requestId);
      void recoverSyncBridgeRequest(nodeId, pendingRequest);
    }, delayMs);
    syncBridgeRecoveryTimersRef.current.set(pendingRequest.requestId, timer);
  }, [clearSyncBridgeRecoveryTimer]);

  const recoverSyncBridgeRequest = useCallback(async (nodeId: string, pendingRequest: PendingSyncRequest) => {
    if (syncBridgeRecoveryInFlightRef.current.has(pendingRequest.requestId)) return;
    syncBridgeRecoveryInFlightRef.current.add(pendingRequest.requestId);

    try {
      const bridgeResult = await getSyncImageBridgeRequest(pendingRequest.requestId);
      const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === nodeId);
      if (!latestNode) {
        await clearSyncImageBridgeRequest(pendingRequest.requestId).catch(() => undefined);
        return;
      }

      if (bridgeResult.status === 'pending' || bridgeResult.status === 'missing') {
        const elapsed = Date.now() - (pendingRequest.startedAt || 0);
        if (elapsed < SYNC_BRIDGE_RECOVERY_MAX_AGE_MS) {
          scheduleSyncBridgeRecovery(nodeId, pendingRequest);
        } else {
          const nextNode = clearPendingSyncRequests(latestNode, [pendingRequest.requestId]);
          urgentUpdatePromptNode({
            ...nextNode,
            isGenerating: getPendingTaskIds(nextNode).length > 0 || getPendingSyncRequests(nextNode).length > 0,
            jobId: getPendingTaskIds(nextNode)[0],
            error: getPendingTaskIds(nextNode).length === 0 && getPendingSyncRequests(nextNode).length === 0
              ? '同步生成恢复超时，供应商结果未能重新接回。'
              : nextNode.error,
            errorDetails: {
              ...(nextNode.errorDetails || {}),
              code: nextNode.errorDetails?.code || 'SYNC_BRIDGE_TIMEOUT',
              responseBody: nextNode.errorDetails?.responseBody || 'Sync bridge result recovery timed out',
              model: nextNode.errorDetails?.model || nextNode.model,
              timestamp: Date.now()
            }
          });
          await clearSyncImageBridgeRequest(pendingRequest.requestId).catch(() => undefined);
        }
        return;
      }

      if (bridgeResult.status === 'error') {
        const nextNode = clearPendingSyncRequests(latestNode, [pendingRequest.requestId]);
        const remainingTaskIds = getPendingTaskIds(nextNode);
        const remainingSyncRequests = getPendingSyncRequests(nextNode);
        urgentUpdatePromptNode({
          ...nextNode,
          isGenerating: remainingTaskIds.length > 0 || remainingSyncRequests.length > 0,
          jobId: remainingTaskIds[0],
          error: remainingTaskIds.length === 0 && remainingSyncRequests.length === 0
            ? bridgeResult.error
            : nextNode.error,
          errorDetails: {
            ...(nextNode.errorDetails || {}),
            code: bridgeResult.code || nextNode.errorDetails?.code || 'SYNC_BRIDGE_ERROR',
            status: bridgeResult.responseStatus || nextNode.errorDetails?.status,
            responseBody: bridgeResult.responseBodyPreview || bridgeResult.error || nextNode.errorDetails?.responseBody,
            model: nextNode.errorDetails?.model || nextNode.model,
            timestamp: Date.now()
          }
        });
        await clearSyncImageBridgeRequest(pendingRequest.requestId).catch(() => undefined);
        return;
      }

      const currentChildIds = Array.from(new Set((latestNode.childImageIds || []).filter(Boolean)));
      const expectedCount = getExpectedGenerationCount(latestNode);
      const recoveredResults = bridgeResult.urls.map((url, index) => {
        const imageId = `${nodeId}_sync_recovered_${Date.now()}_${pendingRequest.index}_${index}`;
        const layoutIndex = pendingRequest.index + index;
        return {
          id: imageId,
          storageId: imageId,
          url,
          originalUrl: url,
          prompt: pendingRequest.prompt || latestNode.prompt,
          model: latestNode.model,
          modelLabel: latestNode.modelLabel,
          modelColorStart: latestNode.modelColorStart,
          modelColorEnd: latestNode.modelColorEnd,
          modelColorSecondary: latestNode.modelColorSecondary,
          modelTextColor: latestNode.modelTextColor,
          aspectRatio: latestNode.aspectRatio,
          imageSize: latestNode.imageSize,
          timestamp: Date.now(),
          canvasId: activeCanvasRef.current?.id || 'default',
          parentPromptId: nodeId,
          position: getGeneratedImagePosition(latestNode.position, latestNode.aspectRatio, latestNode.mode, layoutIndex, expectedCount),
          provider: latestNode.provider,
          providerLabel: latestNode.providerLabel,
          keySlotId: pendingRequest.keySlotId || latestNode.keySlotId,
          generationTime: 0,
          alias: latestNode.mode === GenerationMode.PPT ? buildPptPageAlias(latestNode.pptSlides?.[layoutIndex], layoutIndex) : undefined,
        };
      });

      const mergedChildIds = Array.from(new Set([...currentChildIds, ...recoveredResults.map(result => result.id)]));
      const nextNode = clearPendingSyncRequests(latestNode, [pendingRequest.requestId]);
      const remainingTaskIds = getPendingTaskIds(nextNode);
      const remainingSyncRequests = getPendingSyncRequests(nextNode);
      const nextSuccessCount = mergedChildIds.length;
      const nextFailCount = remainingTaskIds.length > 0 || remainingSyncRequests.length > 0
        ? Math.max(0, expectedCount - nextSuccessCount - remainingTaskIds.length - remainingSyncRequests.length)
        : Math.max(0, expectedCount - nextSuccessCount);

      addImageNodes(recoveredResults as any, {
        [latestNode.id]: {
          ...nextNode,
          isGenerating: remainingTaskIds.length > 0 || remainingSyncRequests.length > 0,
          jobId: remainingTaskIds[0],
          childImageIds: mergedChildIds,
          error: undefined,
          lastGenerationSuccessCount: nextSuccessCount,
          lastGenerationFailCount: nextFailCount
        }
      });
      await clearSyncImageBridgeRequest(pendingRequest.requestId).catch(() => undefined);
    } catch (error) {
      console.warn('[useImageGeneration] Sync bridge recovery failed:', error);
      scheduleSyncBridgeRecovery(nodeId, pendingRequest, 4000);
    } finally {
      syncBridgeRecoveryInFlightRef.current.delete(pendingRequest.requestId);
    }
  }, [
    addImageNodes,
    buildPptPageAlias,
    clearPendingSyncRequests,
    getExpectedGenerationCount,
    getGeneratedImagePosition,
    getPendingSyncRequests,
    getPendingTaskIds,
    scheduleSyncBridgeRecovery,
    urgentUpdatePromptNode
  ]);

  useEffect(() => {
    const canvas = activeCanvas;
    if (!canvas?.promptNodes?.length) return;

    canvas.promptNodes.forEach((node) => {
      getPendingSyncRequests(node).forEach((pendingRequest) => {
        if (!pendingRequest?.requestId) return;
        if (syncBridgeRecoveryInFlightRef.current.has(pendingRequest.requestId)) return;
        if (syncBridgeRecoveryTimersRef.current.has(pendingRequest.requestId)) return;
        void recoverSyncBridgeRequest(node.id, pendingRequest);
      });
    });
  }, [activeCanvas, getPendingSyncRequests, recoverSyncBridgeRequest]);

  useEffect(() => () => {
    syncBridgeRecoveryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    syncBridgeRecoveryTimersRef.current.clear();
    syncBridgeRecoveryInFlightRef.current.clear();
  }, []);

  // --- Polling Logic ---

  const pollTaskStatus = useCallback(async (node: PromptNode, taskIdOverride?: string) => {
    const targetTaskId = taskIdOverride || node.jobId;
    if (!targetTaskId) return;

    try {
      const result = await llmService.checkTaskStatus(targetTaskId, node.mode || GenerationMode.IMAGE, node.keySlotId ? { id: node.keySlotId } as any : undefined);

      if (result && 'status' in result && (result.status === 'success' || result.status === 'failed')) {
        const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id) || node;
        const pendingTaskIds = getPendingTaskIds(latestNode);
        const { nextPendingTaskIds, nextJobId, nextGenerationMetadata } = resolvePendingTaskState(latestNode, targetTaskId);
        const expectedCount = getExpectedGenerationCount(latestNode);
        const currentChildIds = Array.from(new Set((latestNode.childImageIds || []).filter(Boolean)));
        
        if (result.status === 'success') {
          const imageUrls = (result as any).urls || [(result as any).url].filter(Boolean);
          if (imageUrls.length > 0) {
            // Success recovery logic (similar to executeGeneration completion)
            const recoveredImageNodes = imageUrls.map((url: string, index: number) => {
              const imageId = `${node.id}_recovered_${Date.now()}_${index}`;
              const layoutIndex = currentChildIds.length + index;
              const resolvedAspectRatio = (result as any).aspectRatio || latestNode.aspectRatio;
              const resolvedImageSize = (result as any).imageSize || latestNode.imageSize;
              return {
                id: imageId, storageId: imageId, url, originalUrl: url,
                prompt: latestNode.prompt, model: (result as any).model || latestNode.model,
                modelLabel: (result as any).modelName || latestNode.modelLabel,
                modelColorStart: latestNode.modelColorStart,
                modelColorEnd: latestNode.modelColorEnd,
                modelColorSecondary: latestNode.modelColorSecondary,
                modelTextColor: latestNode.modelTextColor,
                aspectRatio: resolvedAspectRatio, imageSize: resolvedImageSize,
                timestamp: Date.now(), canvasId: activeCanvasRef.current?.id || 'default',
                parentPromptId: node.id,
                position: getGeneratedImagePosition(latestNode.position, resolvedAspectRatio, latestNode.mode, layoutIndex, expectedCount),
                dimensions: `${resolvedAspectRatio} 路 ${resolvedImageSize || '1K'}`,
                provider: latestNode.provider || (result as any).provider,
                providerLabel: latestNode.providerLabel || (result as any).providerName,
                keySlotId: (result as any).keySlotId || latestNode.keySlotId,
                generationTime: (result as any).generationTime || 0,
                alias: latestNode.mode === GenerationMode.PPT ? buildPptPageAlias(latestNode.pptSlides?.[layoutIndex], layoutIndex) : undefined,
              };
            });

            const mergedChildIds = Array.from(new Set([...currentChildIds, ...recoveredImageNodes.map((img: any) => img.id)]));
            const nextSuccessCount = mergedChildIds.length;
            const nextFailCount = nextPendingTaskIds.length > 0 ? Math.max(0, expectedCount - nextSuccessCount - nextPendingTaskIds.length) : Math.max(0, expectedCount - nextSuccessCount);

            addImageNodes(recoveredImageNodes as any, {
              [latestNode.id]: {
                ...latestNode,
                isGenerating: nextPendingTaskIds.length > 0,
                jobId: nextJobId,
                childImageIds: mergedChildIds,
                error: undefined,
                lastGenerationSuccessCount: nextSuccessCount,
                lastGenerationFailCount: nextFailCount,
                generationMetadata: nextGenerationMetadata
              }
            });
            
            if (nextPendingTaskIds.length > 0) {
              setTimeout(() => {
                const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
                if (fresh?.isGenerating) nextPendingTaskIds.forEach(tid => pollTaskStatus(fresh, tid));
              }, 5000);
            }
          }
        } else {
          // Failed
          urgentUpdatePromptNode({ ...latestNode, isGenerating: nextPendingTaskIds.length > 0, jobId: nextJobId, generationMetadata: nextGenerationMetadata, error: nextPendingTaskIds.length === 0 ? 'Task failed on backend' : undefined });
        }
      } else {
        // Still pending
        setTimeout(() => {
          const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
          if (freshNode && freshNode.isGenerating) pollTaskStatus(freshNode, targetTaskId);
        }, 10000);
      }
    } catch (err) {
      console.error(`[useImageGeneration] Polling failed:`, err);
      const message = err instanceof Error ? err.message : String(err || 'Task polling failed');
      if (/credit rollback failed/i.test(message)) {
        const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id) || node;
        const { nextPendingTaskIds, nextJobId, nextGenerationMetadata } = resolvePendingTaskState(latestNode, targetTaskId);
        urgentUpdatePromptNode({
          ...latestNode,
          isGenerating: nextPendingTaskIds.length > 0,
          jobId: nextJobId,
          generationMetadata: nextGenerationMetadata,
          error: message,
          errorDetails: extractErrorDetails(err, latestNode.model)
        });
        return;
      }
      setTimeout(() => {
        const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
        if (freshNode?.isGenerating) pollTaskStatus(freshNode, targetTaskId);
      }, 15000);
    }
  }, [llmService, addImageNodes, urgentUpdatePromptNode, resolvePendingTaskState, getExpectedGenerationCount, getGeneratedImagePosition, buildPptPageAlias, getPendingTaskIds, extractErrorDetails]);

  // --- Execution Logic ---

  const executeGeneration = useCallback(async (node: PromptNode) => {
    const { id: promptNodeId, prompt: promptToUse, parallelCount: count = 1, mode, referenceImages: initialFiles = [] } = node;
    setIsGenerating(true);
    
    try {
      const { getImage } = await import('../services/storage/imageStorage');
      const { fileSystemService } = await import('../services/storage/fileSystemService');
      const globalHandle = fileSystemService.getGlobalHandle();
      
      const hydratedFiles = await Promise.all(initialFiles.map(async (img) => {
        if (img.data && img.data.length > 100) return img;
        if (img.storageId) {
          try {
            const dataUrl = await getImage(img.storageId);
            if (dataUrl) {
              const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
              if (matches && matches[2]) return { ...img, data: matches[2], mimeType: matches[1] || img.mimeType || 'image/png' };
              return { ...img, data: dataUrl };
            }
          } catch {}
          if (globalHandle) {
             try {
               const base64Data = await fileSystemService.loadReferenceImage(globalHandle, img.storageId);
               if (base64Data) return { ...img, data: base64Data, mimeType: 'image/jpeg' };
             } catch {}
          }
        }
        return img;
      }));
      
      const files = hydratedFiles.filter(hasRecoverableReferenceImage);
      if (initialFiles.length > 0) {
        const droppedCount = Math.max(0, hydratedFiles.length - files.length);
        console.log(`[useImageGeneration] Reference images prepared: input=${initialFiles.length}, hydrated=${hydratedFiles.length}, forwarded=${files.length}, dropped=${droppedCount}`);
        if (droppedCount > 0) {
          console.warn(`[useImageGeneration] Dropped ${droppedCount} empty reference image(s) before generation.`);
        }
      }
      const resolvedKey = keyManager.getNextKey(node.model, node.keySlotId);
      const effectiveKeySlotId = resolvedKey?.id || node.keySlotId;
      const resolvedProviderDisplay = effectiveKeySlotId
        ? resolveProviderDisplay(effectiveKeySlotId)
        : resolveProviderDisplay(undefined, node.providerLabel, node.provider);
      const executionNode: PromptNode = {
        ...node,
        keySlotId: effectiveKeySlotId,
        provider: resolvedProviderDisplay.provider || node.provider,
        providerLabel: resolvedProviderDisplay.providerLabel || node.providerLabel,
      };

      if (
        executionNode.keySlotId !== node.keySlotId ||
        executionNode.provider !== node.provider ||
        executionNode.providerLabel !== node.providerLabel
      ) {
        const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId) || node;
        urgentUpdatePromptNode({
          ...latestNode,
          keySlotId: executionNode.keySlotId,
          provider: executionNode.provider,
          providerLabel: executionNode.providerLabel,
        });
      }

      const isVideo = mode === GenerationMode.VIDEO;
      const isAudio = mode === GenerationMode.AUDIO;
      const isPpt = mode === GenerationMode.PPT;
      const effectiveSlideLines = isPpt ? normalizePptSlidesForCount(executionNode.pptSlides, executionNode.prompt, count) : [];
      
      const buildPptPagePrompt = (basePrompt: string, index: number, total: number) => {
        const pageNo = index + 1;
        const slideLines = effectiveSlideLines.length > 0 ? effectiveSlideLines : buildAutoPptSlides(basePrompt, total);
        const picked = slideLines[index] || `第 ${pageNo} 页：${basePrompt}`;
        return `PPT 第 ${pageNo} 页：${picked}。16:9 演示文稿风格，中文排版清晰，信息层次分明。`;
      };

      const requestedCount = Math.max(1, Number(count) || 1);
      const actualCount = isPpt ? Math.min(20, requestedCount) : requestedCount;
      
      const buildTask = (index: number) => async () => {
        const startTime = Date.now();
        const currentRequestId = `${promptNodeId}-${index}`;
        let taskIdForRecovery: string | undefined = undefined;

        try {
          let generatedBase64 = '';
          let videoUrl = '';
          const taskPrompt = isPpt ? buildPptPagePrompt(promptToUse, index, actualCount) : promptToUse;
          let resolvedResultKeySlotId: string | undefined = executionNode.keySlotId;
          let resolvedProvider = executionNode.provider;
          let resolvedProviderName = executionNode.providerLabel;
          let resolvedModelName = executionNode.modelLabel;
          let resolvedModelId = executionNode.model;
          
          if (isAudio) {
            const audioResult = await llmService.generateAudio({ modelId: executionNode.model, prompt: taskPrompt, audioDuration: executionNode.audioDuration, audioLyrics: executionNode.audioLyrics, preferredKeyId: executionNode.keySlotId, providerConfig: {} });
            videoUrl = audioResult.url;
            resolvedResultKeySlotId = audioResult.keySlotId || resolvedResultKeySlotId;
            resolvedProvider = audioResult.provider || resolvedProvider;
            resolvedProviderName = audioResult.providerName || resolvedProviderName;
            resolvedModelName = audioResult.modelName || resolvedModelName;
            resolvedModelId = audioResult.model || resolvedModelId;
          } else if (isVideo) {
            const videoResult = await llmService.generateVideo({ 
              modelId: executionNode.model, prompt: taskPrompt, aspectRatio: executionNode.aspectRatio === '9:16' ? '9:16' : '16:9', 
              imageUrl: files[0]?.data, videoDuration: executionNode.videoDuration, preferredKeyId: executionNode.keySlotId, 
              providerConfig: {}, 
              onTaskId: (taskId) => {
                taskIdForRecovery = taskId;
                const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                if (fresh) urgentUpdatePromptNode(registerPendingTaskId(fresh, taskId));
              }
            });
            videoUrl = videoResult.url;
            resolvedResultKeySlotId = videoResult.keySlotId || resolvedResultKeySlotId;
            resolvedProvider = videoResult.provider || resolvedProvider;
            resolvedProviderName = videoResult.providerName || resolvedProviderName;
            resolvedModelName = videoResult.modelName || resolvedModelName;
            resolvedModelId = videoResult.model || resolvedModelId;
          } else {
            const result = await generateImage(taskPrompt, executionNode.aspectRatio, executionNode.imageSize, files, executionNode.model, '', currentRequestId, !!executionNode.enableGrounding || !!executionNode.enableImageSearch, {
              maskUrl: executionNode.maskUrl, editMode: executionNode.mode === GenerationMode.INPAINT ? 'inpaint' : (executionNode.mode === GenerationMode.EDIT ? 'edit' : undefined),
              preferredKeyId: executionNode.keySlotId, 
              onTaskId: (taskId) => {
                taskIdForRecovery = taskId;
                const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                if (fresh) urgentUpdatePromptNode(clearPendingSyncRequests(registerPendingTaskId(fresh, taskId), [currentRequestId]));
              },
              onSyncBridgeRegistered: (requestId: string) => {
                const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                if (!fresh) return;
                urgentUpdatePromptNode(registerPendingSyncRequest(fresh, {
                  requestId,
                  index,
                  prompt: taskPrompt,
                  startedAt: Date.now(),
                  keySlotId: executionNode.keySlotId
                }));
              }
            });
            generatedBase64 = result.url;
            resolvedResultKeySlotId = result.keySlotId || resolvedResultKeySlotId;
            resolvedProvider = result.provider || resolvedProvider;
            resolvedProviderName = result.providerName || resolvedProviderName;
            resolvedModelName = result.modelName || resolvedModelName;
            resolvedModelId = result.effectiveModel || resolvedModelId;
          }

          return { 
            index, url: isVideo || isAudio ? videoUrl : generatedBase64, originalUrl: isVideo || isAudio ? videoUrl : generatedBase64, 
            generationTime: Date.now() - startTime, base64: generatedBase64, mode, 
            taskId: taskIdForRecovery, taskPrompt, keySlotId: resolvedResultKeySlotId, requestId: currentRequestId,
            provider: resolvedProvider, providerName: resolvedProviderName, modelName: resolvedModelName, model: resolvedModelId 
          };
        } catch (error: any) {
          return { error: error.message || 'Unknown error', errorDetails: extractErrorDetails(error, executionNode.model), taskId: taskIdForRecovery, requestId: currentRequestId };
        }
      };

      const tasks = Array.from({ length: actualCount }).map((_, index) => buildTask(index));
      const imageData = await Promise.all(tasks.map(t => t()));
      
      const validImageData = imageData.filter(d => !('error' in d)) as any[];
      const failedImageData = imageData.filter(d => 'error' in d) as any[];
      
      if (validImageData.length > 0) {
        const results = validImageData.map(item => {
          const idx = item.index;
          const uniqueId = `${Date.now()}_${idx}_${Math.random()}`;
          if (item.base64?.startsWith('data:')) saveOriginalImage(uniqueId, item.base64, mode === GenerationMode.VIDEO).catch(() => {});
          
          return {
            id: uniqueId, storageId: uniqueId, url: item.url, originalUrl: item.originalUrl,
            prompt: item.taskPrompt || promptToUse, aspectRatio: executionNode.aspectRatio, imageSize: executionNode.imageSize,
            timestamp: Date.now(), model: item.model || executionNode.model, canvasId: activeCanvasRef.current?.id || 'default',
            modelLabel: item.modelName || executionNode.modelLabel,
            modelColorStart: executionNode.modelColorStart,
            modelColorEnd: executionNode.modelColorEnd,
            modelColorSecondary: executionNode.modelColorSecondary,
            modelTextColor: executionNode.modelTextColor,
            provider: item.provider || executionNode.provider,
            providerLabel: item.providerName || executionNode.providerLabel,
            parentPromptId: promptNodeId, position: getGeneratedImagePosition(executionNode.position, executionNode.aspectRatio, executionNode.mode, idx, actualCount),
            generationTime: item.generationTime, keySlotId: item.keySlotId, mode
          };
        });

        const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId) || node;
        const pendingIds = getPendingTaskIds(latestNode).filter(tid => !validImageData.some(v => v.taskId === tid));
        const completedSyncRequestIds = imageData
          .map(item => item.requestId)
          .filter((requestId): requestId is string => typeof requestId === 'string' && requestId.trim().length > 0);
        const nextNodeBase = clearPendingSyncRequests(latestNode, completedSyncRequestIds);
        const remainingSyncRequests = getPendingSyncRequests(nextNodeBase);
        const firstSuccess = validImageData[0];
        const resolvedSuccessDisplay = firstSuccess?.keySlotId
          ? resolveProviderDisplay(firstSuccess.keySlotId)
          : resolveProviderDisplay(undefined, executionNode.providerLabel, executionNode.provider);
        
        const updatedNode = {
          ...nextNodeBase, isGenerating: pendingIds.length > 0 || remainingSyncRequests.length > 0, jobId: pendingIds[0],
          childImageIds: results.map(r => r.id), lastGenerationSuccessCount: validImageData.length,
          lastGenerationFailCount: failedImageData.length, lastGenerationTotalCount: actualCount,
          generationMetadata: buildGenerationMetadata(nextNodeBase, { pendingTaskIds: pendingIds, pendingSyncRequests: remainingSyncRequests }),
          keySlotId: firstSuccess?.keySlotId || executionNode.keySlotId,
          provider: resolvedSuccessDisplay.provider || executionNode.provider,
          providerLabel: resolvedSuccessDisplay.providerLabel || executionNode.providerLabel,
          modelLabel: firstSuccess?.modelName || executionNode.modelLabel
        };
        
        addImageNodes(results as any, { [updatedNode.id]: updatedNode });
        completedSyncRequestIds.forEach((requestId) => {
          void clearSyncImageBridgeRequest(requestId).catch(() => undefined);
          clearSyncBridgeRecoveryTimer(requestId);
        });
        rememberPreferredKeyForMode(mode, updatedNode.keySlotId);
        
        if (pendingIds.length > 0) {
          setTimeout(() => {
            const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
            if (fresh?.isGenerating) pendingIds.forEach(tid => pollTaskStatus(fresh, tid));
          }, 5000);
        }
      } else {
        const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId) || node;
        const completedSyncRequestIds = imageData
          .map(item => item.requestId)
          .filter((requestId): requestId is string => typeof requestId === 'string' && requestId.trim().length > 0);
        const nextNodeBase = clearPendingSyncRequests(latestNode, completedSyncRequestIds);
        updatePromptNode({
          ...nextNodeBase,
          isGenerating: getPendingTaskIds(nextNodeBase).length > 0 || getPendingSyncRequests(nextNodeBase).length > 0,
          jobId: getPendingTaskIds(nextNodeBase)[0],
          error: failedImageData[0]?.error || 'Generation failed',
          errorDetails: failedImageData[0]?.errorDetails || extractErrorDetails(new Error(failedImageData[0]?.error || 'Generation failed'), executionNode.model)
        });
        completedSyncRequestIds.forEach((requestId) => {
          void clearSyncImageBridgeRequest(requestId).catch(() => undefined);
          clearSyncBridgeRecoveryTimer(requestId);
        });
        throw new Error(failedImageData[0]?.error || 'Generation failed');
      }

    } catch (err: any) {
      console.error('[useImageGeneration] Execution error:', err);
      const latest = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId) || node;
      updatePromptNode({ ...latest, isGenerating: false, error: err.message, errorDetails: extractErrorDetails(err, node.model) });
      if (node.cost && node.cost > 0) refundCredits(node.cost, `退款 ${node.id}`);
    } finally {
      setIsGenerating(false);
    }
  }, [
    activeCanvasRef,
    addImageNodes,
    updatePromptNode,
    urgentUpdatePromptNode,
    getGeneratedImagePosition,
    registerPendingTaskId,
    registerPendingSyncRequest,
    clearPendingSyncRequests,
    getPendingTaskIds,
    getPendingSyncRequests,
    buildPendingTaskMetadata,
    buildGenerationMetadata,
    pollTaskStatus,
    extractErrorDetails,
    normalizePptSlidesForCount,
    buildAutoPptSlides,
    rememberPreferredKeyForMode,
    refundCredits,
    resolveProviderDisplay,
    clearSyncBridgeRecoveryTimer
  ]);

  const hookCancelGeneration = useCallback((nodeId?: string) => {
    if (!nodeId) return;
    cancelGeneration(nodeId);
  }, []);

  return { isGenerating, executeGeneration, pollTaskStatus, getPendingTaskIds, cancelGeneration: hookCancelGeneration };
};
