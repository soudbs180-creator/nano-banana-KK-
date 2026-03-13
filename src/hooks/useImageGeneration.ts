import { useState, useCallback, useRef, useEffect } from 'react';
import { PromptNode, GeneratedImage, GenerationMode, AspectRatio, ImageSize } from '../types';
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

const GENERATE_TIMEOUT_MS = 600000;

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

  const buildPendingTaskMetadata = useCallback((node: PromptNode | null | undefined, pendingTaskIds: string[]) => ({
    ...(node?.generationMetadata || {}),
    pendingTaskIds,
  }), []);

  const registerPendingTaskId = useCallback((node: PromptNode, taskId: string): PromptNode => {
    const nextPendingTaskIds = Array.from(new Set([...getPendingTaskIds(node), taskId]));
    return {
      ...node,
      jobId: nextPendingTaskIds[0],
      generationMetadata: buildPendingTaskMetadata(node, nextPendingTaskIds),
    };
  }, [buildPendingTaskMetadata, getPendingTaskIds]);

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
      setTimeout(() => {
        const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
        if (freshNode?.isGenerating) pollTaskStatus(freshNode, targetTaskId);
      }, 15000);
    }
  }, [llmService, addImageNodes, urgentUpdatePromptNode, resolvePendingTaskState, getExpectedGenerationCount, getGeneratedImagePosition, buildPptPageAlias, getPendingTaskIds]);

  // --- Execution Logic ---

  const executeGeneration = useCallback(async (node: PromptNode) => {
    const { id: promptNodeId, prompt: promptToUse, parallelCount: count = 1, model: initialModel, mode, referenceImages: initialFiles = [] } = node;
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
      
      const files = hydratedFiles.filter(img => img.data && img.data.length > 100);
      const isVideo = mode === GenerationMode.VIDEO;
      const isAudio = mode === GenerationMode.AUDIO;
      const isPpt = mode === GenerationMode.PPT;
      const effectiveSlideLines = isPpt ? normalizePptSlidesForCount(node.pptSlides, node.prompt, count) : [];
      
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
          
          if (isAudio) {
            const audioResult = await llmService.generateAudio({ modelId: node.model, prompt: taskPrompt, audioDuration: node.audioDuration, audioLyrics: node.audioLyrics, preferredKeyId: node.keySlotId, providerConfig: {} });
            videoUrl = audioResult.url;
          } else if (isVideo) {
            const videoResult = await llmService.generateVideo({ 
              modelId: node.model, prompt: taskPrompt, aspectRatio: node.aspectRatio === '9:16' ? '9:16' : '16:9', 
              imageUrl: files[0]?.data, videoDuration: node.videoDuration, preferredKeyId: node.keySlotId, 
              providerConfig: {}, 
              onTaskId: (taskId) => {
                taskIdForRecovery = taskId;
                const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                if (fresh) urgentUpdatePromptNode(registerPendingTaskId(fresh, taskId));
              }
            });
            videoUrl = videoResult.url;
          } else {
            const result = await generateImage(taskPrompt, node.aspectRatio, node.imageSize, files, node.model, '', currentRequestId, !!node.enableGrounding || !!node.enableImageSearch, {
              maskUrl: node.maskUrl, editMode: node.mode === GenerationMode.INPAINT ? 'inpaint' : (node.mode === GenerationMode.EDIT ? 'edit' : undefined),
              preferredKeyId: node.keySlotId, 
              onTaskId: (taskId) => {
                taskIdForRecovery = taskId;
                const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                if (fresh) urgentUpdatePromptNode(registerPendingTaskId(fresh, taskId));
              }
            });
            generatedBase64 = result.url;
          }

          return { 
            index, url: isVideo || isAudio ? videoUrl : generatedBase64, originalUrl: isVideo || isAudio ? videoUrl : generatedBase64, 
            generationTime: Date.now() - startTime, base64: generatedBase64, mode, 
            taskId: taskIdForRecovery, taskPrompt, keySlotId: node.keySlotId 
          };
        } catch (error: any) {
          return { error: error.message || 'Unknown error', errorDetails: extractErrorDetails(error, node.model), taskId: taskIdForRecovery };
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
            prompt: item.taskPrompt || promptToUse, aspectRatio: node.aspectRatio, imageSize: node.imageSize,
            timestamp: Date.now(), model: node.model, canvasId: activeCanvasRef.current?.id || 'default',
            modelLabel: item.modelName || node.modelLabel,
            modelColorStart: node.modelColorStart,
            modelColorEnd: node.modelColorEnd,
            modelColorSecondary: node.modelColorSecondary,
            modelTextColor: node.modelTextColor,
            provider: node.provider || item.provider,
            providerLabel: node.providerLabel || item.providerName,
            parentPromptId: promptNodeId, position: getGeneratedImagePosition(node.position, node.aspectRatio, node.mode, idx, actualCount),
            generationTime: item.generationTime, keySlotId: item.keySlotId, mode
          };
        });

        const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId) || node;
        const pendingIds = getPendingTaskIds(latestNode).filter(tid => !validImageData.some(v => v.taskId === tid));
        
        const updatedNode = {
          ...latestNode, isGenerating: pendingIds.length > 0, jobId: pendingIds[0],
          childImageIds: results.map(r => r.id), lastGenerationSuccessCount: validImageData.length,
          lastGenerationFailCount: failedImageData.length, lastGenerationTotalCount: actualCount,
          generationMetadata: buildPendingTaskMetadata(latestNode, pendingIds)
        };
        
        addImageNodes(results as any, { [updatedNode.id]: updatedNode });
        rememberPreferredKeyForMode(mode, updatedNode.keySlotId);
        
        if (pendingIds.length > 0) {
          setTimeout(() => {
            const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
            if (fresh?.isGenerating) pendingIds.forEach(tid => pollTaskStatus(fresh, tid));
          }, 5000);
        }
      } else {
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
  }, [activeCanvasRef, addImageNodes, updatePromptNode, urgentUpdatePromptNode, getGeneratedImagePosition, registerPendingTaskId, getPendingTaskIds, buildPendingTaskMetadata, pollTaskStatus, extractErrorDetails, normalizePptSlidesForCount, buildAutoPptSlides, rememberPreferredKeyForMode, refundCredits]);

  const hookCancelGeneration = useCallback((nodeId?: string) => {
    if (!nodeId) return;
    cancelGeneration(nodeId);
  }, []);

  return { isGenerating, executeGeneration, pollTaskStatus, getPendingTaskIds, cancelGeneration: hookCancelGeneration };
};
