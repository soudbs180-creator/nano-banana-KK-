import React, { useState, useCallback, useRef, useEffect } from 'react';
import InfiniteCanvas, { InfiniteCanvasHandle } from './components/InfiniteCanvas';

import PromptBar from './components/PromptBar';
import ImageNode from './components/ImageCard2';
import PromptNodeComponent from './components/PromptNodeComponent';
import PendingNode from './components/PendingNode';
// KeyManagerModal removed - integrated into UserProfileModal
import ChatSidebar from './components/ChatSidebar';
import { PromptNode, GeneratedImage, AspectRatio, ImageSize, ModelType, GenerationConfig } from './types';
import { User, LayoutDashboard, LogOut, Settings } from 'lucide-react'; // Added icons for User Menu
import { generateImage, validateApiKey, cancelGeneration } from './services/geminiService';
import { keyManager } from './services/keyManager';
import { getCardDimensions } from './utils/styleUtils';
// Lucide icons replaced with SVGs
import { CanvasProvider, useCanvas } from './context/CanvasContext';
import ConnectionDot from './components/ConnectionDot';
import LoginScreen from './components/LoginScreen';
import UserProfileModal, { UserProfileView } from './components/UserProfileModal';
import StorageSelectionModal from './components/StorageSelectionModal';
import SettingsPanel from './components/SettingsPanel';
import { useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';

import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { syncService } from './services/syncService';
import { saveImage } from './services/imageStorage';
import NotificationToast from './components/NotificationToast';
import { notify } from './services/notificationService';
import UpdateNotification from './components/UpdateNotification';
import { initUpdateCheck } from './services/updateCheck';

// ProjectManager imported from components
import ProjectManager from './components/ProjectManager';
import SearchPalette from './components/SearchPalette';
import { Search } from 'lucide-react'; // Import Search icon

const AppContent: React.FC = () => {
  const {
    activeCanvas,
    addPromptNode,
    updatePromptNode,
    addImageNodes,
    updatePromptNodePosition, updateImageNodePosition, updateImageNodeDimensions,
    deletePromptNode,
    deleteImageNode,
    linkNodes,
    unlinkNodes,
    undo,
    redo,
    canUndo,
    canRedo,
    arrangeAllNodes,
    selectedNodeIds,
    selectNodes,
    clearSelection
  } = useCanvas();

  // Canvas Ref for Zoom/Pan Controls
  const canvasRef = useRef<InfiniteCanvasHandle>(null);

  const handleZoomIn = () => canvasRef.current?.zoomIn();
  const handleZoomOut = () => canvasRef.current?.zoomOut();
  const handleResetView = () => canvasRef.current?.resetView();
  const handleToggleGrid = () => canvasRef.current?.toggleGrid();

  const { user, signOut } = useAuth();

  // Ref to access fresh state in async functions (fixing Stale Closure issue)
  const activeCanvasRef = useRef(activeCanvas);
  useEffect(() => {
    activeCanvasRef.current = activeCanvas;
  }, [activeCanvas]);

  // Reactively track KeyManager state
  const [keyStats, setKeyStats] = useState(keyManager.getStats());

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false); // New User Menu State
  useEffect(() => {
    console.log('[App] showProfileModal changed:', showProfileModal);
  }, [showProfileModal]);
  const [profileInitialView, setProfileInitialView] = useState<UserProfileView>('main');
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  const [settingsInitialView, setSettingsInitialView] = useState<'dashboard' | 'api-channels' | 'cost-estimation' | 'storage-settings' | 'system-logs'>('dashboard');

  useEffect(() => {
    const unsubscribe = keyManager.subscribe(() => {
      setKeyStats(keyManager.getStats());
    });
    return unsubscribe;
  }, []);

  // Sync user with KeyManager and handle Modal Logic (Storage -> API)
  useEffect(() => {
    if (user) {
      // First sync KeyManager
      keyManager.setUserId(user.id).then(async () => {
        // Check storage mode first
        const { getStorageMode } = await import('./services/storagePreference');
        const storageMode = await getStorageMode();

        if (!storageMode) {
          // Show storage selection modal first
          setShowStorageModal(true);
        } else if (!keyManager.hasValidKeys()) {
          setShowSettingsPanel(true);
          setSettingsInitialView('api-channels');
        }
      });
    }
  }, [user]);

  // Generation config state
  const [config, setConfig] = useState<GenerationConfig>({
    prompt: '',
    aspectRatio: AspectRatio.SQUARE,
    imageSize: ImageSize.SIZE_1K,
    parallelCount: 1,
    referenceImages: [],
    model: ModelType.NANO_BANANA_PRO,
    enableGrounding: false // Default to false
  });

  // Pending generation state
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Use ref to track pending position for async access (fixing jump on completion)
  const pendingPositionRef = useRef(pendingPosition);
  useEffect(() => {
    pendingPositionRef.current = pendingPosition;
  }, [pendingPosition]);

  // Canvas transform state (for positioning in visible area)
  const [canvasTransform, setCanvasTransform] = useState<{ x: number; y: number; scale: number }>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1
  });

  // Right-Click Selection State
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; current: { x: number; y: number }; active: boolean } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle click (button 1) or Left click (button 0) are handled by InfiniteCanvas
    if (e.button === 2) { // Right click
      e.preventDefault();
      e.stopPropagation();
      setSelectionBox({
        start: { x: e.clientX, y: e.clientY },
        current: { x: e.clientX, y: e.clientY },
        active: true
      });
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (selectionBox?.active) {
      setSelectionBox(prev => prev ? ({ ...prev, current: { x: e.clientX, y: e.clientY } }) : null);
    }
  }, [selectionBox]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (selectionBox?.active) {
      const startX = Math.min(selectionBox.start.x, selectionBox.current.x);
      const startY = Math.min(selectionBox.start.y, selectionBox.current.y);
      const endX = Math.max(selectionBox.start.x, selectionBox.current.x);
      const endY = Math.max(selectionBox.start.y, selectionBox.current.y);
      const width = endX - startX;
      const height = endY - startY;

      if (width > 5 || height > 5) {
        // Convert screen rect to canvas rect
        const s = canvasTransform.scale;
        const ox = canvasTransform.x;
        const oy = canvasTransform.y;

        const canvasRect = {
          x: (startX - ox) / s,
          y: (startY - oy) / s,
          w: width / s,
          h: height / s
        };

        const ids: string[] = [];
        // Check prompts
        activeCanvas?.promptNodes.forEach(node => {
          const { width: nw } = getCardDimensions(node.aspectRatio);
          const nh = 140; // Approx height
          // Card origin (x,y) is Bottom Center.
          // Rect is [x - w/2, y - h, w, h]
          const nx = node.position.x - nw / 2;
          const ny = node.position.y - nh;

          if (nx < canvasRect.x + canvasRect.w && nx + nw > canvasRect.x &&
            ny < canvasRect.y + canvasRect.h && ny + nh > canvasRect.y) {
            ids.push(node.id);
          }
        });

        // Check images
        activeCanvas?.imageNodes.forEach(node => {
          const { width: nw, totalHeight: nh } = getCardDimensions(node.aspectRatio, true);
          const nx = node.position.x - nw / 2;
          const ny = node.position.y - nh;

          if (nx < canvasRect.x + canvasRect.w && nx + nw > canvasRect.x &&
            ny < canvasRect.y + canvasRect.h && ny + nh > canvasRect.y) {
            ids.push(node.id);
          }
        });

        if (ids.length > 0) {
          selectNodes(ids, !e.shiftKey);
        } else {
          if (!e.shiftKey) clearSelection();
        }
      } else {
        // Clicked without drag - Clear selection? 
        // If purely right click, we might want context menu (but we prevented it)
        // Just clear for now
        if (!e.shiftKey) clearSelection();
      }
      setSelectionBox(null);
    }
  }, [selectionBox, canvasTransform, activeCanvas, selectNodes, clearSelection]);

  // Active source image for continuing conversation
  const [activeSourceImage, setActiveSourceImage] = useState<string | null>(null);

  // Connection Dragging State
  const [dragConnection, setDragConnection] = useState<{
    active: boolean;
    startId: string;
    startPos: { x: number; y: number };
    currentPos: { x: number; y: number };
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && !isSidebarOpen) setIsSidebarOpen(true); // Auto-open on desktop if closed? Or just default?
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidebarOpen]);

  // Initial Sidebar State
  useEffect(() => {
    if (!isMobile) setIsSidebarOpen(true);
  }, []);

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Clean Fly-to Navigation Logic
  const handleNavigateToNode = useCallback((targetX: number, targetY: number) => {
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;

    // Calculate new position to center the target
    // We want: targetX * scale + transformX = screenCenterX
    // So: transformX = screenCenterX - targetX * scale

    // User requested "Zoom and Pan" (平移并缩放)
    const targetScale = 1; // Reset to 1:1 view for clarity

    const newX = screenCenterX - targetX * targetScale;
    const newY = screenCenterY - targetY * targetScale;

    // IMPERATIVE UPDATE: Tell InfiniteCanvas to move
    canvasRef.current?.setView(newX, newY, targetScale);

    // Keep local state in sync (though onTransformChange should technically handle this, 
    // doing it here ensures immediate React updates if needed)
    setCanvasTransform({
      x: newX,
      y: newY,
      scale: targetScale
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl + K or Cmd + K to open Search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          if (canRedo) redo();
        } else {
          e.preventDefault();
          if (canUndo) undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        if (canRedo) redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  // const [showApiModal, setShowApiModal] = useState(false); // Removed
  // Duplicate showProfileModal removed

  // Get derived API status for UI indicator - use keyManager
  const derivedApiStatus = keyStats.valid > 0 ? 'success' : keyStats.invalid > 0 ? 'error' : 'neutral';

  const handleCancelGeneration = useCallback((id: string) => {
    // 1. Cancel request in service
    cancelGeneration(id);

    // 2. Update UI state
    updatePromptNode({
      id,
      isGenerating: false,
      error: "Cancelled by user"
    } as any); // Partial update logic handled by reducer/context usually, but here we might need full object? 
    // Wait, updatePromptNode expects PromptNode. I need to get the current node or just pass the id and partial?
    // Looking at useCanvas definition (not visible here), usually updates match partial or full. 
    // Let's assume we need to fetch it first? Or does updatePromptNode handle partials?
    // In many React apps, we'd need the full object. 
    // Let's safe bet: find it first.

    if (activeCanvas) {
      const node = activeCanvas.promptNodes.find(n => n.id === id);
      if (node) {
        updatePromptNode({
          ...node,
          isGenerating: false
        });
      }
    }
  }, [activeCanvas, updatePromptNode]);



  // Track if position has been set for current prompt session using ref (more stable than state)
  const positionLockedRef = useRef(false);
  const prevPromptRef = useRef('');

  // Calculate pending position ONLY when starting a fresh prompt (first character)
  useEffect(() => {
    const prevPrompt = prevPromptRef.current;
    prevPromptRef.current = config.prompt;

    // If prompt is cleared, unlock position for next input
    if (!config.prompt) {
      positionLockedRef.current = false;
      return;
    }

    // Only calculate position when going from empty to non-empty (first character)
    // This ensures position is set once and never changes until prompt is cleared
    if (prevPrompt !== '' || positionLockedRef.current) {
      return; // Already have a position, don't recalculate
    }

    // Don't recalculate during generation
    if (isGenerating) return;

    // Lock position immediately
    positionLockedRef.current = true;

    // If there's an active source image, position below it
    if (activeSourceImage) {
      const sourceImage = activeCanvas?.imageNodes.find(img => img.id === activeSourceImage);
      if (sourceImage) {
        // Calculate actual card height: image height + footer (~36px)
        const footerHeight = 36;
        let imageHeight = 280;
        switch (sourceImage.aspectRatio) {
          case AspectRatio.LANDSCAPE_16_9: imageHeight = 180; break;
          case AspectRatio.PORTRAIT_9_16: imageHeight = 350; break;
          default: imageHeight = 280;
        }
        const cardHeight = imageHeight + footerHeight;
        // Position new prompt below the source image card with some spacing
        // sourceImage.position.y is TOP of card (due to translate(-50%, 0))
        setPendingPosition({
          x: sourceImage.position.x, // Keep same horizontal center
          y: sourceImage.position.y + cardHeight + 80 // Below card with gap
        });
        return;
      }
    }

    // Calculate position in VISIBLE canvas area (upper-center)
    const screenCenterX = window.innerWidth / 2;
    const screenUpperY = window.innerHeight / 3;
    const canvasCenterX = (screenCenterX - canvasTransform.x) / canvasTransform.scale;
    const canvasCenterY = (screenUpperY - canvasTransform.y) / canvasTransform.scale;

    // Check for overlaps with prompt cards only
    const cardWidth = 350; // Reduced for tighter spacing
    const cardHeight = 150;
    const promptPositions = activeCanvas?.promptNodes.map(n => n.position) || [];

    const hasOverlap = (testX: number, testY: number) => {
      return promptPositions.some((pos: { x: number; y: number }) => {
        const dx = Math.abs(pos.x - testX);
        const dy = Math.abs(pos.y - testY);
        return dx < cardWidth && dy < cardHeight;
      });
    };

    let finalX = canvasCenterX;
    const stepX = cardWidth + 20; // Smaller gap between cards
    while (hasOverlap(finalX, canvasCenterY) && finalX < canvasCenterX + stepX * 10) {
      finalX += stepX;
    }

    setPendingPosition({ x: finalX, y: canvasCenterY });

    // eslint-disable-next-line react-hooks/exhaustive-deps  
  }, [config.prompt]);

  // Helper to estimate prompt card height based on text length
  const getPromptHeight = useCallback((text: string) => {
    const baseHeight = 160; // Padding + Header + Footer
    const charPerLine = 20; // Approx characters per line
    const lineHeight = 24;
    const lines = Math.ceil((text || '').length / charPerLine);
    // Clamp min height to avoid too small cards
    return Math.max(200, baseHeight + (lines * lineHeight));
  }, []);

  const handleGenerate = useCallback(async () => {
    // Allow multiple concurrent generations - only check for valid prompt
    if (!config.prompt.trim()) return;
    // Note: API key is now managed server-side, no need to pass from frontend

    setIsGenerating(true);
    setError(null);

    // 1. Create Persistent Prompt Node immediately
    const promptNodeId = Date.now().toString();
    // Default to center of viewport if no position set
    const currentPos = (pendingPosition.x === 0 && pendingPosition.y === 0)
      ? { x: window.innerWidth / 2, y: 200 }
      : pendingPosition;

    // If continuing from an image, auto-add it as reference (img2img)
    let finalReferenceImages = [...config.referenceImages];
    if (activeSourceImage) {
      const sourceImage = activeCanvas?.imageNodes.find(img => img.id === activeSourceImage);
      if (sourceImage && sourceImage.url) {
        // Fetch image and convert to base64 to use as reference
        try {
          const response = await fetch(sourceImage.url);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const matches = result.match(/^data:(.+);base64,(.+)$/);
              if (matches) {
                resolve(matches[2]);
              } else {
                resolve('');
              }
            };
            reader.readAsDataURL(blob);
          });
          if (base64) {
            // Check if not already in references
            const alreadyAdded = finalReferenceImages.some(ref => ref.id === sourceImage.id);
            if (!alreadyAdded) {
              finalReferenceImages.push({
                id: sourceImage.id,
                data: base64,
                mimeType: blob.type || 'image/png'
              });
            }
          }
        } catch (fetchErr) {
          console.warn('Could not fetch source image for reference:', fetchErr);
        }
      }
    }

    const generatingNode: PromptNode = {
      id: promptNodeId,
      prompt: config.prompt,
      position: currentPos,
      aspectRatio: config.aspectRatio,
      imageSize: config.imageSize,
      model: config.model,
      childImageIds: [], // Will fill after generation
      referenceImages: finalReferenceImages,
      timestamp: Date.now(),
      // New: Generating State
      isGenerating: true,
      parallelCount: config.parallelCount,
      sourceImageId: activeSourceImage || undefined
    };

    // 4. Update State Immediately (Optimistic UI)
    // 4. Update State Immediately (Optimistic UI)
    addPromptNode(generatingNode);

    // 5. Clear Input UI immediately & Unblock
    const promptToUse = config.prompt; // Capture for API call
    setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
    setActiveSourceImage(null);
    setPendingPosition({ x: 0, y: 0 });
    setIsGenerating(false);

    try {
      const count = config.parallelCount;

      const imageDataPromises = Array.from({ length: count }).map(async (_, index) => {
        const startTime = Date.now();
        const currentRequestId = `${promptNodeId}-${index}`;

        // Timeout Check (4 minutes)
        let isFinished = false;
        let isTimedOut = false;
        const timeoutId = setTimeout(() => {
          if (!isFinished) {
            isTimedOut = true;
            cancelGeneration(currentRequestId);
            // Update prompt node with timeout error
            updatePromptNode({
              ...generatingNode,
              isGenerating: false,
              error: '生成超时，请重新发送任务'
            });
            // Show system notification
            notify.warning('生成超时', '已超过4分钟，任务已自动停止。请检查网络后重试。');
          }
        }, 240000); // 4 minutes

        try {
          const generatedBase64 = await generateImage(
            promptToUse,
            config.aspectRatio,
            config.imageSize,
            finalReferenceImages,
            config.model,
            '', // apiKey (handled internally)
            currentRequestId, // Unique requestId for cancellation
            config.enableGrounding // Pass grounding config
          );
          isFinished = true;
          clearTimeout(timeoutId);

          const generationTime = Date.now() - startTime;

          let originalUrl = '';
          let displayUrl = generatedBase64;

          // --- Cloud Sync Upgrade: Upload Generated Image ---
          try {
            // Convert Base64 to Blob
            const res = await fetch(generatedBase64);
            const blob = await res.blob();

            // Upload (Generate Thumb + Original)
            const id = `${Date.now()}_${index}`; // Temporary ID for upload path
            const { original, thumbnail } = await syncService.uploadImagePair(id, blob);

            // Success: Use Cloud URLs
            // CHECK: If syncService returns a blob: URL (local mock), ignore it to keep Base64 for persistence
            if (!thumbnail.startsWith('blob:')) {
              originalUrl = original;
              displayUrl = thumbnail;
            } else {
              // It's a local blob, so we stick to 'generatedBase64' (already set above)
              // This ensures we save the full data to IndexedDB, not a temporary link
            }

          } catch (e) {
            console.warn('Cloud upload failed, falling back to local base64:', e);
            // Fallback: url stays as base64, originalUrl empty
          }

          return {
            index,
            url: displayUrl,
            originalUrl,
            generationTime,
            base64: generatedBase64 // Return base64 for local saving
          };
        } catch (error: any) {
          isFinished = true;
          clearTimeout(timeoutId);
          console.error(`Generation ${index} failed:`, error);
          return { error: error.message || 'Unknown error' };
        }
      });

      const imageData = await Promise.all(imageDataPromises);

      // Validate results and narrow type
      type SuccessResult = { index: number; url: string; originalUrl: string; generationTime: number; base64: string };
      const validImageData = imageData.filter((d): d is SuccessResult => !!d && !('error' in d) && !!d.url);

      if (validImageData.length === 0) {
        // Find first error
        const firstError = imageData.find(d => d && 'error' in d);
        throw new Error(firstError && 'error' in firstError ? firstError.error : 'All generated images failed');
      }

      // Get the prompt node's CURRENT position (from REF to avoid stale closure)
      // CRITICAL: Use pendingPositionRef because the PendingNode might have been dragged 
      // while generation was running. The PromptNode created at start has stale pos.
      const latestPendingPos = pendingPositionRef.current;
      const livePromptNode = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);

      // We should UPDATE the persistent prompt node to match where the user left the Pending Node
      if (livePromptNode && (latestPendingPos.x !== 0 || latestPendingPos.y !== 0)) {
        // Update local ref variable for calculation
        livePromptNode.position = latestPendingPos;
        // Also update global store? handleGenerate is inside App, so we might need a way to commit this.
        // Since we are about to add images relative to this, we use this 'livePromptNode' for calculation.
        // NOTE: We must actually update the canvas state for this to persist visually.
        updatePromptNodePosition(promptNodeId, latestPendingPos);
      }

      const livePos = latestPendingPos.x !== 0 ? latestPendingPos : (livePromptNode?.position || currentPos);

      // Now calculate positions using the LIVE position
      const gapToImages = 80; // Increased to match visual style (dotted line)
      const gap = 16;

      const { width: cardWidth, totalHeight: cardHeight } = getCardDimensions(config.aspectRatio, true);

      // Note: Both prompt and image use translate(-50%, -100%), so position.y = BOTTOM
      // For image TOP to be 80px below prompt BOTTOM:
      //   imageY - imageHeight = promptY + 80
      //   imageY = promptY + 80 + imageHeight

      const validResults: GeneratedImage[] = validImageData.map(({ index, url, originalUrl, generationTime, base64 }) => {
        let x, y;

        // Calculate offset based on device type
        if (isMobile) {
          const cols = Math.min(count, 2);
          const col = index % cols;
          const row = Math.floor(index / cols);

          const mobileCardWidth = 170;
          const mobileCardHeight = 260;
          const mobileGap = 10;

          const itemsInRow = Math.min(cols, count - row * cols);
          const currentGridWidth = itemsInRow * mobileCardWidth + (itemsInRow - 1) * mobileGap;

          const startX = -currentGridWidth / 2;
          const offsetX = startX + col * (mobileCardWidth + mobileGap) + mobileCardWidth / 2;
          const offsetY = gapToImages + mobileCardHeight + row * (mobileCardHeight + mobileGap);

          // Apply to live position
          x = livePos.x + offsetX;
          y = livePos.y + offsetY;
        } else {
          // Desktop Layout
          const columns = Math.min(count, 2);
          const col = index % columns;
          const row = Math.floor(index / columns);

          const itemsInRow = Math.min(columns, count - row * columns);
          const currentGridWidth = itemsInRow * cardWidth + (itemsInRow - 1) * gap;

          const startX = -currentGridWidth / 2;
          const offsetX = startX + col * (cardWidth + gap) + cardWidth / 2;
          const offsetY = gapToImages + cardHeight + row * (cardHeight + gap);

          // Apply to live position
          x = livePos.x + offsetX;
          y = livePos.y + offsetY;
        }

        const uniqueId = Date.now().toString() + index + Math.random();

        // Save Original to IndexedDB (Local Cache) if available
        if (base64) {
          // We save the Base64 string directly as 'url' in IndexedDB
          // This matches what 'saveImage' expects (id, url)
          saveImage(uniqueId, base64).catch(err => console.error("Failed to cache original locally", err));
        }

        return {
          id: uniqueId,
          url,
          originalUrl,
          prompt: config.prompt,
          aspectRatio: config.aspectRatio,
          timestamp: Date.now(),
          model: config.model,
          canvasId: activeCanvas?.id || 'default',
          parentPromptId: promptNodeId,
          position: { x, y },
          dimensions: `${config.aspectRatio} · ${config.imageSize || '1K'}`,
          generationTime
        } as GeneratedImage;
      });

      // Update the prompt node with success state
      const updatedNode = {
        ...generatingNode,
        isGenerating: false,
        childImageIds: validResults.map(r => r.id)
      };

      updatePromptNode(updatedNode);
      addImageNodes(validResults);

      // Record cost for this generation
      import('./services/costService').then(({ recordCost }) => {
        recordCost(
          config.model,
          config.imageSize,
          validResults.length,
          config.prompt,
          finalReferenceImages.length
        );
      });

      // Clear active source image after successful generation
      setActiveSourceImage(null);

      // Keep prompt for continuous generation (don't clear)

      // Auto-scroll to center the new content (Mobile Only)
      if (isMobile) {
        // We want to center on the NEW PROMPT node, or slightly below it to see images
        // Target Y is prompt position Y + some offset
        const targetX = livePos.x;
        const targetY = livePos.y + 150; // Center between prompt and images

        // Calculate new translation to put (targetX, targetY) at screen center
        // visualX = targetX * scale + newTranslateX = screenW / 2
        // => newTranslateX = screenW / 2 - targetX * scale

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        setCanvasTransform(prev => ({
          ...prev,
          x: screenW / 2 - targetX * prev.scale,
          y: screenH / 2 - targetY * prev.scale
        }));
      }

    } catch (err: any) {
      console.error(err);
      updatePromptNode({ ...generatingNode, isGenerating: false, error: err.message || 'Failed' });
      setError(err.message || "Generation failed.");
      if (err.message && (err.message.includes("API Key") || err.message.includes("403"))) {
        setShowSettingsPanel(true);
        setSettingsInitialView('api-channels');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [config, pendingPosition, addPromptNode, addImageNodes, activeCanvas, activeSourceImage, isGenerating, isMobile]);

  // Handle reference images
  const handleFilesDrop = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (config.referenceImages.length + files.length > 5) {
      setError("Max 5 reference images allowed");
      files = files.slice(0, 5 - config.referenceImages.length);
    }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const matches = (reader.result as string).match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          setConfig(prev => ({
            ...prev,
            referenceImages: [...prev.referenceImages, {
              id: Date.now() + Math.random().toString(),
              data: matches[2],
              mimeType: matches[1]
            }]
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  }, [config.referenceImages]);

  const handleConnectStart = useCallback((id: string, startPos: { x: number; y: number }) => {
    setDragConnection({
      active: true,
      startId: id,
      startPos,
      currentPos: startPos
    });
  }, []);

  const handleConnectEnd = useCallback((targetId: string) => {
    if (dragConnection?.active) {
      linkNodes(dragConnection.startId, targetId);
    }
    setDragConnection(null);
  }, [dragConnection, linkNodes]);

  // Auto-arrange all cards in a grid layout (Compact & Dynamic)
  const handleAutoArrange = useCallback(() => {
    if (!activeCanvas) return;

    // Configuration
    const colWidth = 380;
    const startY = 100;
    const imageVirtualHeight = 320; // Height of an image row

    // Get all prompt nodes sorted by creation time
    const sortedPrompts = [...activeCanvas.promptNodes].sort((a, b) =>
      parseInt(a.id) - parseInt(b.id)
    );

    if (isMobile) {
      // Mobile: Single vertical column
      let currentY = 0;

      sortedPrompts.forEach((pn) => {
        const promptHeight = getPromptHeight(pn.prompt);
        const childImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === pn.id);
        const imageRows = Math.ceil(childImages.length / 2);

        // Calculate total node block height
        // Prompt + Gap + Images + Bottom Padding
        const nodeBlockHeight = promptHeight + 80 + (imageRows * imageVirtualHeight) + 80;

        updatePromptNodePosition(pn.id, { x: 0, y: currentY });

        // Arrange images
        childImages.forEach((img, imgIndex) => {
          const col = imgIndex % 2;
          const row = Math.floor(imgIndex / 2);
          const imgWidth = 170;
          const gap = 10;
          const startX = -(imgWidth * 2 + gap) / 2 + imgWidth / 2;

          updateImageNodePosition(img.id, {
            x: startX + col * (imgWidth + gap),
            y: currentY + 80 + 320 + row * 320 // +320 = imageHeight so TOP is below prompt
          });
        });

        currentY += nodeBlockHeight;
      });

    } else {
      // Desktop: 3 Columns Grid
      const columns = 3;
      const colGap = 50;
      const totalGridWidth = (columns * 350) + ((columns - 1) * colGap);
      const startX = -(totalGridWidth / 2) + (350 / 2);

      // Track the Y position for each column
      const columnY = [startY, startY, startY];

      sortedPrompts.forEach((pn, index) => {
        const colIndex = index % columns;
        const currentY = columnY[colIndex];
        const cx = startX + colIndex * (350 + colGap);

        // Dynamic Height Calculation
        // Prompt height is flexible based on text, but width depends on aspect ratio
        // Actually PromptNodeComponent uses getCardDimensions(pn.aspectRatio).width now
        // So we should respect that column width.
        // But for grid layout we used a fixed 350px column width.
        // We might need to adjust column info based on max width?
        // Let's keep 3 Columns of fixed width for now, but ensure nodes are centered.
        // Standard width is 320 for landscape, 280 square, 240 portrait. 350 column covers all.

        const promptHeight = getPromptHeight(pn.prompt);

        updatePromptNodePosition(pn.id, { x: cx, y: currentY });

        // Arrange Images for this Prompt
        const childImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === pn.id);

        let imagesBlockHeight = 0;
        if (childImages.length > 0) {
          // Images Layout: 2 Columns Grid under the prompt
          const imgCols = 2;
          const imgGap = 16;

          // Determine dimensions for this batch (assuming same aspect ratio for children of same prompt)
          // Use first image to decide dimensions
          const firstImg = childImages[0];
          const dim = getCardDimensions(firstImg.aspectRatio, true);
          const imgWidth = dim.width;
          const imgHeight = dim.totalHeight;

          childImages.forEach((img, i) => {
            const row = Math.floor(i / imgCols);
            const col = i % imgCols;

            // Center the grid under the prompt
            const totalRowWidth = (Math.min(childImages.length, imgCols) * imgWidth) +
              ((Math.min(childImages.length, imgCols) - 1) * imgGap);
            const rowStartX = cx - (totalRowWidth / 2) + (imgWidth / 2);

            updateImageNodePosition(img.id, {
              x: rowStartX + col * (imgWidth + imgGap),
              y: currentY + 80 + imgHeight + (row * imgHeight) // +imgHeight because anchor is bottom
            });
          });

          const rows = Math.ceil(childImages.length / imgCols);
          imagesBlockHeight = rows * imgHeight;
        }

        // Update column Y tracker
        const totalNodeHeight = 80 + imagesBlockHeight + 100; // Gap + images + spacing
        columnY[colIndex] += totalNodeHeight;
      });
    }
  }, [activeCanvas, updatePromptNodePosition, updateImageNodePosition, isMobile]);

  const handleCutConnection = useCallback((promptId: string, imageId: string) => {
    unlinkNodes(promptId, imageId);
  }, [unlinkNodes]);

  // Retry Logic (In-Place Regeneration)
  const handleRetryNode = useCallback(async (node: PromptNode) => {
    // 1. Reset state to generating
    updatePromptNode({
      ...node,
      isGenerating: true,
      error: undefined
    });

    const currentNodeId = node.id;
    const count = node.parallelCount || config.parallelCount || 1;
    const startTime = Date.now();

    try {
      const results = await Promise.all(Array.from({ length: count }).map(async (_, index) => {
        const requestId = `${currentNodeId}-${index}`;

        let isFinished = false;
        const timer = setTimeout(() => {
          if (!isFinished) {
            cancelGeneration(requestId);
            updatePromptNode({ ...node, isGenerating: false, error: '生成超时' });
          }
        }, 240000);

        try {
          const apiModel = node.model;
          const b64 = await generateImage(
            node.prompt,
            node.aspectRatio,
            node.imageSize,
            node.referenceImages || [],
            apiModel,
            '', // managed key
            requestId,
            false // grounding
          );
          isFinished = true;
          clearTimeout(timer);

          // Upload
          let url = b64;
          let originalUrl = '';
          try {
            const res = await fetch(b64);
            const blob = await res.blob();
            const id = `${Date.now()}_${index}`;
            const { original, thumbnail } = await syncService.uploadImagePair(id, blob);
            url = thumbnail;
            originalUrl = original;
          } catch (e) {
            console.warn('Upload failed, using local base64');
          }

          const generationTime = Date.now() - startTime;

          return {
            canvasId: activeCanvas?.id || 'default',
            parentPromptId: node.id,
            dimensions: `${node.aspectRatio} · ${node.imageSize || '1K'}`,
            generationTime,
            index,
            url,
            originalUrl,
            prompt: node.prompt,
            width: 0,
            height: 0,
            aspectRatio: node.aspectRatio,
            imageSize: node.imageSize,
            model: node.model,
            seed: -1,
            id: `${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
            mimeType: 'image/png',
            timestamp: Date.now()
          };
        } catch (e: any) {
          isFinished = true;
          clearTimeout(timer);
          throw e;
        }
      }));

      // Calculate Positions
      const gapToImages = 20; // Reduced to minimum for tight layout
      const gap = 16;

      const { width: cardWidth, totalHeight: cardHeight } = getCardDimensions(node.aspectRatio, true);

      const newImageNodes = results.map((img, i) => {
        let x, y;

        // STRICT LAYOUT LOGIC (Matching arrangeAllNodes)
        // 1. Calculate Image Height strictly based on dimensions/aspectRatio (Footer included +40)
        let exactImageHeight = cardHeight;
        if (img.dimensions) {
          const [w, h] = img.dimensions.split('x').map(Number);
          if (w && h) {
            const ratio = w / h;
            const displayWidth = ratio > 1 ? 320 : (ratio < 1 ? 200 : 280);
            exactImageHeight = (displayWidth / ratio) + 40;
          }
        } else {
          // Fallback
          // Use shared utility
          const { totalHeight } = getCardDimensions(node.aspectRatio, true);
          exactImageHeight = totalHeight;
        }

        // 2. Position:
        // Y: Prompt Bottom + Gap + Image Height (Because Image Y is anchor bottom!)
        // Note: node.position.y is Prompt Bottom.
        // So Image Y = node.position.y + gapToImages + exactImageHeight.

        if (isMobile) {
          // Mobile: Maintain Desktop Size but Single Column
          const cols = 1; // Force single column to fit screen
          const col = 0; // Always col 0
          const row = i; // Row increments with index
          const mobileCardWidth = cardWidth; // Use full desktop width

          const mobileGap = 20;
          // Center X
          const startX = -mobileCardWidth / 2;
          const offsetX = startX + mobileCardWidth / 2; // Center anchor

          const mobileImageHeight = exactImageHeight; // Use full desktop height
          // Let's stick to simple mobile logic for now or align with desktop logic but scaled
          // For now, keep existing Mobile Y logic roughly, but center X

          const offsetY = gapToImages + (cardHeight) + row * (mobileImageHeight + mobileGap);
          x = node.position.x + offsetX;
          y = node.position.y + offsetY;
        } else {
          // DESKTOP LOGIC
          const cols = Math.min(count, 2);
          const col = i % cols;
          const row = Math.floor(i / cols);
          const itemsInRow = Math.min(cols, count - row * cols);

          // Calculate grid width for centering
          const currentGridWidth = itemsInRow * cardWidth + (itemsInRow - 1) * gap;
          const startX = -currentGridWidth / 2;

          // X: Center relative to Prompt X
          const offsetX = startX + col * (cardWidth + gap) + cardWidth / 2;

          // Y: Prompt Bottom + Gap + Image Height (for specific row)
          // If multiple rows, add height of previous rows
          // Simplifying: Assume uniform height for generated batch 
          const rowHeight = exactImageHeight;
          const rowOffsetY = row * (rowHeight + gap);

          // Final Y (Bottom Anchor) = PromptBottom + Gap + ThisImageHeight + RowOffset
          const offsetY = gapToImages + exactImageHeight + rowOffsetY;

          x = node.position.x + offsetX;
          y = node.position.y + offsetY;
        }
        return {
          ...img,
          position: { x, y }
        };
      });

      // Add to canvas
      addImageNodes(newImageNodes);

      // Update Prompt Node (Success)
      updatePromptNode({
        ...node,
        isGenerating: false,
        childImageIds: newImageNodes.map(n => n.id),
        error: undefined
      });

      // Record cost
      import('./services/costService').then(({ recordCost }) => {
        recordCost(
          node.model,
          node.imageSize,
          newImageNodes.length,
          node.prompt,
          node.referenceImages?.length || 0
        );
      });
      notify.success('生成完成', '重新生成成功');

    } catch (error: any) {
      updatePromptNode({
        ...node,
        isGenerating: false,
        error: error.message || 'Retry failed'
      });
      notify.error('重试失败', error.message);
    }
  }, [config.parallelCount, isMobile, updatePromptNode, addImageNodes, config.enableGrounding]);

  return (
    <div className="relative w-screen h-screen bg-[#09090b] overflow-hidden text-zinc-100 font-inter selection:bg-indigo-500/30"
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onMouseMove={(e) => {
        handleMouseMove(e);
        if (dragConnection?.active) {
          // Convert client to canvas
          const canvasX = (e.clientX - canvasTransform.x) / canvasTransform.scale;
          const canvasY = (e.clientY - canvasTransform.y) / canvasTransform.scale;
          setDragConnection(prev => prev ? ({ ...prev, currentPos: { x: canvasX, y: canvasY } }) : null);
        }
      }}
      onMouseUp={(e) => {
        handleMouseUp(e);
        if (dragConnection?.active) {
          setDragConnection(null);
        }
      }}
    >


      {/* Chat Sidebar (Left) */}


      {/* Top Right User Menu */}
      <div className="absolute top-4 right-4 z-[100] flex items-center gap-3">

        {/* User Avatar & Dropdown Trigger */}
        <div className="relative group">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 hover:border-indigo-500 transition-all shadow-2xl bg-[#1a1a1c] flex items-center justify-center cursor-pointer active:scale-95"
          >
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-amber-500 flex items-center justify-center font-bold text-white text-sm">
                {user?.email?.[0].toUpperCase() || 'K'}
              </div>
            )}
          </button>

          {/* API Status Dot */}
          <div className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#09090b] z-10 shadow-lg ${derivedApiStatus === 'success' ? 'bg-green-500' :
            derivedApiStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
            }`} />

          {/* New User Menu Dropdown */}
          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute top-12 right-0 w-64 bg-[#18181b] border border-zinc-800 rounded-xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100 origin-top-right">

                {/* User Info Header */}
                <div className="px-3 py-3 border-b border-white/5 mb-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer" onClick={() => {
                  setProfileInitialView('main');
                  setShowProfileModal(true);
                  setShowUserMenu(false);
                }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden">
                      {user?.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} className="w-full h-full object-cover" />
                      ) : user?.email?.[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{user?.user_metadata?.full_name || 'User'}</div>
                      <div className="text-xs text-zinc-400 truncate">{user?.email}</div>
                    </div>
                  </div>
                </div>

                {/* Menu Items */}
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setProfileInitialView('main');
                      setShowProfileModal(true);
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left"
                  >
                    <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg"><User size={14} /></div>
                    个人中心
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowSettingsPanel(true);
                      setSettingsInitialView('dashboard');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left"
                  >
                    <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg"><LayoutDashboard size={14} /></div>
                    设置
                  </button>

                  <div className="h-px bg-white/5 my-1" />

                  <button
                    onClick={() => {
                      signOut();
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                  >
                    <div className="p-1.5 bg-red-500/10 rounded-lg"><LogOut size={14} /></div>
                    退出登录
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Selection Box Overlay */}
      {selectionBox && selectionBox.active && (
        <div
          className="fixed z-[9999] border border-indigo-500 bg-indigo-500/10 pointer-events-none"
          style={{
            left: Math.min(selectionBox.start.x, selectionBox.current.x),
            top: Math.min(selectionBox.start.y, selectionBox.current.y),
            width: Math.abs(selectionBox.current.x - selectionBox.start.x),
            height: Math.abs(selectionBox.current.y - selectionBox.start.y),
          }}
        />
      )}

      {/* Main Infinite Canvas */}
      <InfiniteCanvas
        ref={canvasRef}
        onTransformChange={setCanvasTransform}
        cardPositions={[
          ...(activeCanvas?.promptNodes.map(n => n.position) || []),
          ...(activeCanvas?.imageNodes.map(n => n.position) || [])
        ]}
        onCanvasClick={() => {
          // Clear input when clicking empty canvas, but NOT during generation
          // and NOT when in "continue from image" mode
          if (!isGenerating && !activeSourceImage) {
            setConfig(prev => ({ ...prev, prompt: '' }));
          }
          // Always clear selection on empty click
          clearSelection();
        }}
        onAutoArrange={arrangeAllNodes}
      >
        {/* 1. Connection Lines Layer (SVG) - Below all cards */}
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: '10000px',
            height: '10000px',
            left: '-5000px',
            top: '-5000px',
            overflow: 'visible',
            zIndex: 1
          }}
        >
          {/* Active Drag Line */}
          {dragConnection?.active && (
            <path
              d={`M${dragConnection.startPos.x},${dragConnection.startPos.y} L${dragConnection.currentPos.x},${dragConnection.currentPos.y}`}
              fill="none"
              stroke="#6366f1"
              strokeWidth="3"
              strokeDasharray="6 4"
              className="opacity-80 animate-pulse"
            />
          )}
          {activeCanvas?.promptNodes.map(pn => {
            return pn.childImageIds.map((childId) => {
              const childNode = activeCanvas.imageNodes.find(img => img.id === childId);
              if (!childNode) {
                console.warn(`[Connection] Child node ${childId} not found for prompt ${pn.id}`);
                return null;
              }

              // Flowith-style: Prompt Bottom → Image Top
              // 1. Calculate Image Height to find Top anchor (matching ImageCard2 width logic)
              const { totalHeight: imageHeight } = getCardDimensions(childNode.aspectRatio, true);

              // Start: Prompt Bottom Center
              // Both use translate(-50%, -100%), so position.y is BOTTOM
              const startX = pn.position.x + 5000;
              const startY = pn.position.y + 5000;

              // End: Image Top Center (Bottom - Height)
              const endX = childNode.position.x + 5000;
              // Add offset (+15) to ensure line touches the visual card top (gap fix)
              const endY = (childNode.position.y - imageHeight) + 5015;

              // Bezier Logic
              const deltaX = endX - startX;
              const deltaY = endY - startY;
              const absDeltaX = Math.abs(deltaX);
              const absDeltaY = Math.abs(deltaY);

              let d = '';
              // User requested Straight Line style if aligned
              if (absDeltaX < 20) {
                // Strictly straight if aligned
                d = `M${startX},${startY} L${endX},${endY}`;
              } else {
                // Minimal S-curve only if significantly offset
                const controlY1 = startY + deltaY * 0.5;
                const controlY2 = endY - deltaY * 0.5;
                d = `M${startX},${startY} C${startX},${controlY1} ${endX},${controlY2} ${endX},${endY}`;
              }

              return (
                <g key={`${pn.id}-${childId}-${Math.round(startX)}-${Math.round(endX)}`}>
                  {/* Starting dot */}
                  <circle cx={startX} cy={startY} r="3" fill="#D1D5DB" />
                  {/* Smooth curve */}
                  <path
                    d={d}
                    fill="none"
                    stroke="#D1D5DB"
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                    className="transition-all duration-300 ease-in-out"
                  />
                </g>
              );
            });
          })}
        </svg>

        {/* 2. Persistent Prompt Nodes */}
        {activeCanvas?.promptNodes.map(node => (
          <PromptNodeComponent
            key={node.id}
            node={node}
            onPositionChange={updatePromptNodePosition}
            isSelected={selectedNodeIds.includes(node.id)}
            onSelect={() => selectNodes([node.id], !window.event?.shiftKey)}
            onClickPrompt={(clickedNode) => {
              // Clear continue mode - clicking prompt = start NEW conversation
              setActiveSourceImage(null);
              setConfig(prev => ({
                ...prev,
                prompt: clickedNode.prompt,
                aspectRatio: clickedNode.aspectRatio,
                imageSize: clickedNode.imageSize,
                model: clickedNode.model,
                referenceImages: clickedNode.referenceImages || []
              }));
            }}
            onConnectStart={handleConnectStart}
            canvasTransform={canvasTransform}
            isMobile={isMobile}
            sourcePosition={node.sourceImageId
              ? activeCanvas?.imageNodes.find(n => n.id === node.sourceImageId)?.position
              : undefined
            }
            onCancel={handleCancelGeneration}
            onRetry={handleRetryNode}
            onDelete={deletePromptNode}
          />
        ))}

        {/* 3. Image Nodes */}
        {activeCanvas?.imageNodes.map(node => (
          <ImageNode
            key={node.id}
            image={node}
            position={node.position}
            onPositionChange={updateImageNodePosition}
            onDimensionsUpdate={updateImageNodeDimensions}
            onDelete={deleteImageNode}
            onConnectEnd={handleConnectEnd}
            onClick={(imageId) => {
              // Click to select
              selectNodes([imageId], !window.event?.shiftKey);

              // Set this image as source for continuing conversation
              setActiveSourceImage(imageId);
              // Clear prompt and existing references to start fresh continue-conversation
              setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
            }}
            isActive={node.id === activeSourceImage}
            isSelected={selectedNodeIds.includes(node.id)}
            onSelect={() => selectNodes([node.id], !window.event?.shiftKey)}
            canvasTransform={canvasTransform}
            isMobile={isMobile}
          />
        ))}

        {/* 4. Pending / Typing Node */}
        <PendingNode
          prompt={config.prompt}
          parallelCount={config.parallelCount}
          isGenerating={isGenerating}
          position={pendingPosition}
          aspectRatio={config.aspectRatio}
          onPositionChange={setPendingPosition}
          isMobile={isMobile}
          canvasTransform={canvasTransform}
          referenceImages={config.referenceImages}
          sourcePosition={activeSourceImage
            ? activeCanvas?.imageNodes.find(n => n.id === activeSourceImage)?.position
            : undefined
          }
        />
      </InfiniteCanvas>

      {/* Prompt Bar */}
      <PromptBar
        config={config}
        setConfig={setConfig}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        onFilesDrop={handleFilesDrop}
        activeSourceImage={activeSourceImage ?
          activeCanvas?.imageNodes.find(n => n.id === activeSourceImage) ? {
            id: activeSourceImage,
            url: activeCanvas?.imageNodes.find(n => n.id === activeSourceImage)?.url || '',
            prompt: activeCanvas?.imageNodes.find(n => n.id === activeSourceImage)?.prompt || ''
          } : null : null
        }
        onClearSource={() => setActiveSourceImage(null)}
        isMobile={isMobile}
      />

      {/* Chat Sidebar (Left) */}
      <ChatSidebar
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(prev => !prev)}
        onClose={() => setIsChatOpen(false)}
        isMobile={isMobile}
      />

      {/* Legacy KeyManagerModal removed - integrated into UserProfileModal */}

      {/* User Profile Modal (Unified) */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onSignOut={signOut}
        initialView={profileInitialView}
      />

      {/* Settings Panel (Dashboard, API Channels, Cost, Logs) */}
      <SettingsPanel
        isOpen={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        initialView={settingsInitialView}
      />

      {/* Storage Selection Modal (Post-Login) */}
      <StorageSelectionModal
        isOpen={showStorageModal}
        onComplete={() => {
          setShowStorageModal(false);
          // After storage configured, check if API key is set
          // Using hasValidKeys to ensure we catch cases with no keys or only invalid ones
          // If keys are missing, open settings but user can close it (Skip logic)
          if (!keyManager.hasValidKeys()) {
            setShowSettingsPanel(true);
            setSettingsInitialView('api-channels');
          }
        }}
      />

      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-red-500/10 border border-red-500/20 backdrop-blur-xl text-red-400 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-slideDown">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="font-medium text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:bg-red-500/20 p-1 rounded-lg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Version Badge - Bottom Right */}
      <div className="fixed bottom-4 right-20 z-40 text-[10px] text-zinc-600 select-none">
        v1.1.8
      </div>

      {/* Project Manager (Replaces Canvas Manager) */}
      <ProjectManager
        onSearch={() => setIsSearchOpen(true)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        isMobile={isMobile}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        onToggleGrid={handleToggleGrid}
        onAutoArrange={arrangeAllNodes}
      />

      {/* Search Palette */}
      <SearchPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        promptNodes={activeCanvas?.promptNodes || []}
        onNavigate={handleNavigateToNode}
      />
    </div>
  );
};

const App: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0d0d0f] flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Initialize update check on mount
  useEffect(() => {
    initUpdateCheck();
  }, []);

  return (
    <CanvasProvider>
      <NotificationToast />
      <UpdateNotification />
      <AppContent />
    </CanvasProvider>
  );
};

export default App;
