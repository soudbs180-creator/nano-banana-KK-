import React, { useState, useCallback, useRef, useEffect } from 'react';
import InfiniteCanvas, { InfiniteCanvasHandle } from './components/InfiniteCanvas';

import PromptBar from './components/PromptBar';
import ImageNode from './components/ImageCard2';
import PromptNodeComponent from './components/PromptNodeComponent';
import PendingNode from './components/PendingNode';
// KeyManagerModal removed - integrated into UserProfileModal
import ChatSidebar from './components/ChatSidebar';
import { AspectRatio, ImageSize, GenerationConfig, PromptNode, GeneratedImage, GenerationMode, KnownModel, CanvasGroup } from './types';
import { User, LayoutDashboard, LogOut, Settings } from 'lucide-react'; // Added icons for User Menu
import { SelectionMenu } from './components/SelectionMenu';
import { CanvasGroupComponent } from './components/CanvasGroupComponent';
import { generateImage, cancelGeneration, generateVideo } from './services/geminiService';
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
import MobileTabBar from './components/MobileTabBar';
import TagInputModal from './components/TagInputModal';

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
    selectedNodeIds,
    selectNodes,
    clearSelection,
    findSmartPosition,
    findNextGroupPosition,
    addGroup,
    removeGroup,
    updateGroup,
    setNodeTags,
    arrangeAllNodes
  } = useCanvas();

  // Canvas Ref for Zoom/Pan Controls
  const canvasRef = useRef<InfiniteCanvasHandle>(null);

  const handleZoomIn = () => canvasRef.current?.zoomIn();
  const handleZoomOut = () => canvasRef.current?.zoomOut();

  const handleToggleGrid = () => setShowGrid(prev => !prev);

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

  const [settingsInitialView, setSettingsInitialView] = useState<'dashboard' | 'api-management' | 'cost-estimation' | 'storage-settings' | 'system-logs'>('dashboard');
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    const unsubscribe = keyManager.subscribe(() => {
      setKeyStats(keyManager.getStats());
    });
    return unsubscribe;
  }, []);

  // Tagging State
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [taggingNodeIds, setTaggingNodeIds] = useState<string[]>([]);
  const [initialTags, setInitialTags] = useState<string[]>([]);

  const handleTag = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setTaggingNodeIds(selectedNodeIds);

    const firstId = selectedNodeIds[0];
    const promptNode = activeCanvas?.promptNodes.find(n => n.id === firstId);
    const imageNode = activeCanvas?.imageNodes.find(n => n.id === firstId);

    const tags = promptNode?.tags || imageNode?.tags || [];
    setInitialTags(tags);
    setIsTagModalOpen(true);
    setSelectionMenuPosition(null);
  }, [selectedNodeIds, activeCanvas]);

  const handleSaveTags = useCallback((tags: string[]) => {
    setNodeTags(taggingNodeIds, tags);
    setIsTagModalOpen(false);
  }, [taggingNodeIds, setNodeTags]);


  // Sync user with KeyManager and handle Modal Logic (Storage -> API)
  useEffect(() => {
    if (user) {
      // Sync Costs (properly await the sync)
      import('./services/costService').then(async ({ setUserId }) => {
        await setUserId(user.id);
        console.log('[App] CostService sync completed for user:', user.id);
      }).catch(err => console.error('[App] CostService sync failed:', err));

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
          setSettingsInitialView('api-management');
        }
      });
    }
  }, [user]);

  // Generation config state
  // Generation config state with Persistence
  const [config, setConfig] = useState<GenerationConfig>(() => {
    // Load from localStorage
    try {
      const saved = localStorage.getItem('kk_generation_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all fields exist
        return {
          prompt: '', // Always reset prompt
          aspectRatio: parsed.aspectRatio || AspectRatio.SQUARE,
          imageSize: parsed.imageSize || ImageSize.SIZE_1K,
          parallelCount: parsed.parallelCount || 1,
          referenceImages: [], // Always reset images
          model: parsed.model || KnownModel.IMAGEN_3,
          enableGrounding: parsed.enableGrounding || false,
          mode: parsed.mode || GenerationMode.IMAGE
        };
      }
    } catch (e) {
      console.warn('Failed to load generation config', e);
    }
    // Default Fallback
    return {
      prompt: '',
      aspectRatio: AspectRatio.SQUARE,
      imageSize: ImageSize.SIZE_1K,
      parallelCount: 1,
      referenceImages: [],
      model: KnownModel.IMAGEN_3,
      enableGrounding: false,
      mode: GenerationMode.IMAGE
    };
  });

  // Persist Config Changes (Debounced/Effect)
  useEffect(() => {
    const toSave = {
      aspectRatio: config.aspectRatio,
      imageSize: config.imageSize,
      parallelCount: config.parallelCount,
      model: config.model,
      enableGrounding: config.enableGrounding,
      mode: config.mode
    };
    localStorage.setItem('kk_generation_config', JSON.stringify(toSave));
  }, [
    config.aspectRatio, config.imageSize, config.parallelCount,
    config.model, config.enableGrounding, config.mode
  ]);

  // Pending generation state
  // Active source image for continuing conversation
  const [activeSourceImage, setActiveSourceImage] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');

  // Persist Active Source Image
  useEffect(() => {
    const savedSource = localStorage.getItem('kk_active_source_image');
    if (savedSource) setActiveSourceImage(savedSource);
  }, []);

  useEffect(() => {
    if (activeSourceImage) {
      localStorage.setItem('kk_active_source_image', activeSourceImage);
    } else {
      localStorage.removeItem('kk_active_source_image');
    }
  }, [activeSourceImage]);

  const handleDisconnectPrompt = useCallback((promptId: string) => {
    const node = activeCanvas?.promptNodes.find(n => n.id === promptId);
    if (node) {
      updatePromptNode({ ...node, sourceImageId: undefined });
      notify.info('已断开连接', '该提示词已断开与原图的关联');
    }
  }, [activeCanvas, updatePromptNode]);

  // Budget Monitoring for Global Notifications
  const lastBudgetAlertRef = useRef<string | null>(null);

  useEffect(() => {
    // Periodic check or subscription
    const checkBudget = () => {
      const slots = keyManager.getSlots();
      const totalCost = slots.reduce((acc, s) => acc + (s.totalCost || 0), 0);
      const totalBudget = slots.reduce((acc, s) => acc + (s.budgetLimit > 0 ? s.budgetLimit : 0), 0);
      const hasUnlimited = slots.some(s => s.budgetLimit < 0);

      // Skip if unlimited total
      if (hasUnlimited || totalBudget === 0) return;

      const remainingPercent = Math.max(0, ((totalBudget - totalCost) / totalBudget) * 100);

      let alertKey = '';
      let title = '';
      let sub = '';

      if (remainingPercent < 1) {
        alertKey = 'critical';
        title = 'API 预算严重不足';
        sub = '剩余预算低于 1%，请立即充值';
      } else if (remainingPercent < 10) {
        alertKey = 'warning';
        title = 'API 预算不足';
        sub = '剩余预算低于 10%';
      } else if (remainingPercent < 20) {
        alertKey = 'low';
        title = 'API 预算提示';
        sub = '剩余预算低于 20%';
      }

      // Only notify if new alert state is different/higher priority or hasn't been shown
      if (alertKey && lastBudgetAlertRef.current !== alertKey) {
        lastBudgetAlertRef.current = alertKey;
        // Use appropriate level
        if (alertKey === 'critical' || alertKey === 'warning') {
          notify.warning(title, sub);
        } else {
          notify.info(title, sub);
        }
      }
    };

    // Check initially and on keyStats change (which usually happens after generation)
    checkBudget();

    // Subscribe
    const unsub = keyManager.subscribe(checkBudget);
    return unsub;
  }, []);

  // Canvas transform state (for positioning in visible area)
  const [canvasTransform, setCanvasTransform] = useState<{ x: number; y: number; scale: number }>({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1
  });

  // Derived Pending Position: Always Center (or linked to source)
  const pendingPosition = React.useMemo(() => {
    if (activeSourceImage && activeCanvas) {
      const sourceImage = activeCanvas.imageNodes.find(img => img.id === activeSourceImage);
      if (sourceImage) {
        // Calculate actual source image height dynamically
        let sourceHeight = 320; // Fallback
        if (sourceImage.dimensions) {
          const [w, h] = sourceImage.dimensions.split('x').map(Number);
          if (w && h) {
            const ratio = w / h;
            const cardWidth = ratio > 1 ? 320 : (ratio < 1 ? 200 : 280);
            sourceHeight = (cardWidth / ratio) + 40; // Image height + footer
          }
        } else {
          const { totalHeight } = getCardDimensions(sourceImage.aspectRatio, true);
          sourceHeight = totalHeight;
        }

        const GAP = 40; // Gap between source image and follow-up prompt
        return {
          x: sourceImage.position.x,
          y: sourceImage.position.y + sourceHeight + GAP
        };
      }
    }
    // Smart Top-Right Placement
    if (activeCanvas && (activeCanvas.promptNodes.length > 0 || activeCanvas.imageNodes.length > 0)) {
      let maxX = -Infinity;
      let minY = Infinity;

      activeCanvas.promptNodes.forEach(p => {
        maxX = Math.max(maxX, p.position.x + 160); // Width/2
        minY = Math.min(minY, p.position.y - (p.height || 200));
      });

      activeCanvas.imageNodes.forEach(img => {
        let w = 280;
        if (img.dimensions) {
          const [dw, dh] = img.dimensions.split('x').map(Number);
          if (dw && dh) {
            const ratio = dw / dh;
            w = ratio > 1 ? 320 : (ratio < 1 ? 200 : 280);
          }
        }
        // Height estimation (rough)
        const h = 300;
        maxX = Math.max(maxX, img.position.x + w / 2);
        minY = Math.min(minY, img.position.y - h);
      });

      if (maxX > -Infinity && minY < Infinity) {
        return {
          x: maxX + 250, // 250px Gap to the right
          y: minY + 200  // Align roughly with top (assuming card height ~200)
        };
      }
    }

    return {
      x: (window.innerWidth / 2 - canvasTransform.x) / canvasTransform.scale,
      y: (window.innerHeight / 2 - canvasTransform.y) / canvasTransform.scale
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceImage, activeCanvas, canvasTransform]);

  // Right-Click Selection State
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; current: { x: number; y: number }; active: boolean } | null>(null);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only allow box selection if clicking on background
    const target = e.target as HTMLElement;
    const isNode = target.closest('.prompt-node') || target.closest('.image-node') || target.closest('.group-container') || target.closest('button') || target.closest('input');

    if (e.button !== 2) {
      setSelectionMenuPosition(null);
    }

    // Middle click (button 1) handled by InfiniteCanvas
    if (e.button === 2 && !isNode) { // Right click on BACKGROUND only
      e.preventDefault(); // allow context menu? No, user wants box select.
      // E.preventDefault avoids native menu.
      e.stopPropagation();
      setSelectionMenuPosition(null);
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
      let nextSelectionIds: string[] = [];

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

        nextSelectionIds = ids;
        if (ids.length > 0) {
          selectNodes(ids, !e.shiftKey);
        } else {
          if (!e.shiftKey) clearSelection();
        }
      } else {
        // Clicked without drag
        // If Right Click (button 2), DO NOT clear selection (it's likely for Context Menu)
        // Only clear if Left Click and not Shift
        if (e.button !== 2 && !e.shiftKey) {
          clearSelection();
        }
      }

      if (e.button === 2) {
        const hasSelection = nextSelectionIds.length > 0 || selectedNodeIds.length > 0;
        setSelectionMenuPosition(hasSelection ? { x: selectionBox.current.x, y: selectionBox.current.y } : null);
      } else {
        setSelectionMenuPosition(null);
      }
      setSelectionBox(null);
    }
  }, [selectionBox, canvasTransform, activeCanvas, selectNodes, clearSelection, selectedNodeIds]);



  // Connection Dragging State
  const [dragConnection, setDragConnection] = useState<{
    active: boolean;
    startId: string;
    startPos: { x: number; y: number };
    currentPos: { x: number; y: number };
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // error state removed, using notify service
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

  const handleResetView = useCallback(() => {
    if (!activeCanvas) return;
    const prompts = activeCanvas.promptNodes;
    if (prompts.length === 0) {
      handleNavigateToNode(0, 0);
      return;
    }
    // Sort by timestamp descending
    const latestPrompt = [...prompts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];

    if (latestPrompt) {
      // Find associated images to calculate bounding box
      const childImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === latestPrompt.id);

      let targetX = latestPrompt.position.x;
      let targetY = latestPrompt.position.y;

      if (childImages.length > 0) {
        // Find lowest image bottom (since Y is anchor bottom for images too)
        const maxY = Math.max(...childImages.map(img => img.position.y));
        // Target vertical center between Prompt Bottom and Image(s) Bottom
        targetY = (latestPrompt.position.y + maxY) / 2;
      } else {
        // If no images yet, center roughly on the card body (Anchor is Bottom, so move Up)
        targetY = latestPrompt.position.y - 100;
      }

      handleNavigateToNode(targetX, targetY);
    }
  }, [activeCanvas, handleNavigateToNode]);

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

  const handleCancelGeneration = useCallback((id?: string) => {
    // If ID provided, cancel specific
    if (id) {
      cancelGeneration(id);
      if (activeCanvas) {
        const node = activeCanvas.promptNodes.find(n => n.id === id);
        if (node) {
          updatePromptNode({
            ...node,
            isGenerating: false,
            error: "Cancelled by user"
          });
        }
      }
    } else {
      // If no ID, cancel ALL generating nodes (Global Stop)
      if (activeCanvas) {
        const generatingNodes = activeCanvas.promptNodes.filter(n => n.isGenerating);
        generatingNodes.forEach(node => {
          // Cancel all parallel requests for this node
          const count = node.parallelCount || 1;
          for (let i = 0; i < count; i++) {
            cancelGeneration(`${node.id}-${i}`);
          }

          updatePromptNode({
            ...node,
            isGenerating: false,
            error: "Cancelled by user"
          });
        });
      }
      setIsGenerating(false);
    }
  }, [activeCanvas, updatePromptNode]);



  // Helper to estimate prompt card height based on text length
  const getPromptHeight = useCallback((text: string) => {
    // Calibrated for PromptNodeComponent (Header ~40px, Padding ~24px, Footer/Spacer ~20px)
    const baseHeight = 110;
    const charPerLine = 18; // Conservative char count (Chinese/Wide chars)
    const lineHeight = 28; // text-[15px] leading-7 = 28px
    const lines = Math.ceil((text || '').length / charPerLine) || 1;
    // Lower the floor to 130px (approx single line prompt height)
    return Math.max(130, baseHeight + (lines * lineHeight));
  }, []);

  const handleGenerate = useCallback(async () => {
    // Allow multiple concurrent generations - only check for valid prompt
    if (!config.prompt.trim()) return;
    // Note: API key is now managed server-side, no need to pass from frontend

    const effectiveModel = config.model;

    setIsGenerating(true);

    // 1. Create Persistent Prompt Node immediately
    const promptNodeId = Date.now().toString();


    // Card Group Placement Strategy: center of current view, avoid collisions
    const viewCenter = {
      x: (window.innerWidth / 2 - canvasTransform.x) / canvasTransform.scale,
      y: (window.innerHeight / 2 - canvasTransform.y) / canvasTransform.scale
    };
    const promptHeight = getPromptHeight(config.prompt);
    const targetY = viewCenter.y + promptHeight / 2;
    const currentPos = findSmartPosition(viewCenter.x, targetY, 380, promptHeight, 40);

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
      model: effectiveModel,
      childImageIds: [], // Will fill after generation
      referenceImages: finalReferenceImages,
      timestamp: Date.now(),
      // New: Generating State
      isGenerating: true,
      parallelCount: config.parallelCount,
      sourceImageId: activeSourceImage || undefined,
      mode: config.mode
    };

    // 4. Update State Immediately (Optimistic UI)
    addPromptNode(generatingNode);

    // 5. Clear Input UI immediately & Unblock
    const promptToUse = config.prompt; // Capture for API call
    setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
    setActiveSourceImage(null);
    setIsGenerating(false);

    try {
      const count = config.parallelCount;

      // Simple concurrency check based on model availability could be added here
      // For now, we trust KeyManager to handle rotation or Key exhaustion

      const buildTask = (index: number) => async () => {
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
          let generatedBase64 = '';
          let videoUrl = '';

          if (config.mode === GenerationMode.VIDEO) {
            videoUrl = await generateVideo(
              promptToUse,
              effectiveModel,
              '',
              currentRequestId
            );
          } else {
            try {
              generatedBase64 = await generateImage(
                promptToUse,
                config.aspectRatio,
                config.imageSize,
                finalReferenceImages,
                effectiveModel,
                '', // apiKey (handled internally)
                currentRequestId, // Unique requestId for cancellation
                config.enableGrounding // Pass grounding config
              );
            } catch (err: any) {
              // Simplified error handling
              throw err;
            }
          }

          isFinished = true;
          clearTimeout(timeoutId);

          const generationTime = Date.now() - startTime;

          let originalUrl = '';
          let displayUrl = generatedBase64;

          // --- Cloud Sync Upgrade: Upload Generated Image ---
          try {
            if (generatedBase64) {
              // Convert Base64 to Blob
              const res = await fetch(generatedBase64);
              const blob = await res.blob();

              // Upload (Generate Thumb + Original)
              const id = `${Date.now()}_${index}`; // Temporary ID for upload path
              const { original, thumbnail } = await syncService.uploadImagePair(id, blob);

              // Success: Use Cloud URLs
              if (!thumbnail.startsWith('blob:')) {
                originalUrl = original;
                displayUrl = thumbnail;
              }
            }
          } catch (e) {
            console.warn('Cloud upload failed, falling back to local base64:', e);
            // Fallback: url stays as base64, originalUrl empty
          }

          if (config.mode === GenerationMode.VIDEO) {
            displayUrl = videoUrl;
            originalUrl = videoUrl; // Video usually returns a remote URL or data URI
          }

          return {
            index,
            url: displayUrl,
            originalUrl,
            generationTime,
            base64: generatedBase64, // Return base64 for local saving
            mode: config.mode
          };
        } catch (error: any) {
          isFinished = true;
          clearTimeout(timeoutId);
          console.error(`Generation ${index} failed:`, error);
          return { error: error.message || 'Unknown error' };
        }
      };

      const tasks = Array.from({ length: count }).map((_, index) => buildTask(index));

      const runWithConcurrency = async <T,>(taskList: Array<() => Promise<T>>, limit: number): Promise<T[]> => {
        const results: T[] = new Array(taskList.length);
        let nextIndex = 0;
        const workers = Array.from({ length: Math.max(1, limit) }).map(async () => {
          while (nextIndex < taskList.length) {
            const current = nextIndex;
            nextIndex += 1;
            results[current] = await taskList[current]();
          }
        });
        await Promise.all(workers);
        return results;
      };

      const imageData = await runWithConcurrency(tasks, count);

      // Validate results and narrow type
      type SuccessResult = { index: number; url: string; originalUrl: string; generationTime: number; base64: string; mode: GenerationMode };
      const validImageData = imageData.filter((d): d is SuccessResult => !!d && !('error' in d) && !!d.url);

      if (validImageData.length === 0) {
        // Find first error
        const firstError = imageData.find(d => d && 'error' in d);
        throw new Error(firstError && 'error' in firstError ? firstError.error : 'All generated images failed');
      }

      // Use the stable position determined at start of generation
      const livePos = currentPos;

      // Now calculate positions using the LIVE position
      const gapToImages = 80; // Increased to match visual style (dotted line)
      const gap = 16;

      const { width: cardWidth, totalHeight: cardHeight } = getCardDimensions(config.aspectRatio, true);

      // Note: Both prompt and image use translate(-50%, -100%), so position.y = BOTTOM
      // For image TOP to be 80px below prompt BOTTOM:
      //   imageY - imageHeight = promptY + 80
      //   imageY = promptY + 80 + imageHeight

      const validResults: GeneratedImage[] = validImageData.map(({ index, url, originalUrl, generationTime, base64, mode }) => {
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
      console.error(err);
      updatePromptNode({ ...generatingNode, isGenerating: false, error: err.message || 'Failed' });
      notify.error('生成任务失败', err.message || "Generation failed.");
      if (err.message && (err.message.includes("API Key") || err.message.includes("403"))) {
        setShowSettingsPanel(true);
        setSettingsInitialView('api-management');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [config, addPromptNode, addImageNodes, activeCanvas, activeSourceImage, isGenerating, isMobile, canvasTransform, findSmartPosition, getPromptHeight]);

  // Handle reference images
  const handleFilesDrop = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (config.referenceImages.length + files.length > 5) {
      notify.warning('无法添加图片', "最多支持 5 张参考图");
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

  // Auto-arrange with compact grid: normals first, errors stacked below
  const handleAutoArrange = useCallback(() => {
    if (!activeCanvas) return;

    const START_Y = 80;
    const ROW_GAP = 32;
    const COL_GAP = 16;
    const PROMPT_WIDTH = 380;
    const NODE_GAP = 20;
    const COL_GAP_IMG = 12;
    const NORMAL_PER_ROW = 14;
    const ERRORS_PER_ROW = 14;

    const clampGap = (h: number) => Math.min(36, Math.max(16, Math.round(h * 0.12)));

    const runLayout = () => {
      const canvas = activeCanvasRef.current;
      if (!canvas) return;

      const normals = canvas.promptNodes.filter(p => !p.error);
      const errors = canvas.promptNodes.filter(p => p.error);

      const measureBlock = (prompt: PromptNode) => {
        const promptHeight = getPromptHeight(prompt.prompt);
        const children = canvas.imageNodes.filter(img => img.parentPromptId === prompt.id);
        const dims = children.map(img => getCardDimensions(img.aspectRatio, true));
        const rowWidth = dims.reduce((s, d) => s + d.width, 0) + (dims.length > 0 ? (dims.length - 1) * COL_GAP_IMG : 0);
        const rowHeight = dims.length > 0 ? Math.max(...dims.map(d => d.totalHeight)) : 0;
        const blockWidth = Math.max(PROMPT_WIDTH, rowWidth);
        const promptToImageGap = children.length > 0 ? clampGap(promptHeight) : 0;
        const blockHeight = promptHeight + (children.length > 0 ? promptToImageGap + rowHeight : 0) + NODE_GAP;
        return { promptHeight, children, dims, rowWidth, blockWidth, blockHeight, promptToImageGap };
      };

      const placePrompt = (prompt: PromptNode, xLeft: number, yTop: number) => {
        const info = measureBlock(prompt);
        const centerX = xLeft + info.blockWidth / 2;
        const promptBottom = yTop + info.promptHeight;

        updatePromptNodePosition(prompt.id, { x: centerX, y: promptBottom }, { moveChildren: false, ignoreSelection: true });

        if (info.children.length > 0) {
          let cursorX = centerX - info.rowWidth / 2;
          const rowTop = promptBottom + info.promptToImageGap;
          info.children.forEach((img, idx) => {
            const dim = info.dims[idx];
            updateImageNodePosition(img.id, { x: cursorX + dim.width / 2, y: rowTop + dim.totalHeight }, { ignoreSelection: true });
            cursorX += dim.width + COL_GAP_IMG;
          });
        }

        return { width: info.blockWidth, height: info.blockHeight };
      };

      // Normals grid
      const normalsSorted = [...normals].sort((a, b) => parseInt(a.id) - parseInt(b.id));
      let x = 0, y = START_Y, rowH = 0, count = 0;
      normalsSorted.forEach(p => {
        const info = measureBlock(p);
        if (count >= NORMAL_PER_ROW) {
          y += rowH + ROW_GAP;
          x = 0;
          rowH = 0;
          count = 0;
        }

        placePrompt(p, x, y);
        x += info.blockWidth + COL_GAP;
        rowH = Math.max(rowH, info.blockHeight);
        count += 1;
      });

      // Errors stacked below normals
      const errorsSorted = [...errors].sort((a, b) => parseInt(a.id) - parseInt(b.id));
      let xe = 0, ye = y + rowH + ROW_GAP, eRowH = 0, eCount = 0;
      errorsSorted.forEach(p => {
        const info = measureBlock(p);
        if (eCount >= ERRORS_PER_ROW) {
          ye += eRowH + ROW_GAP;
          xe = 0;
          eRowH = 0;
          eCount = 0;
        }
        placePrompt(p, xe, ye);
        xe += info.blockWidth + COL_GAP;
        eRowH = Math.max(eRowH, info.blockHeight);
        eCount += 1;
      });
    };

    clearSelection();
    requestAnimationFrame(runLayout);
  }, [activeCanvas, clearSelection, updateImageNodePosition, updatePromptNodePosition, getPromptHeight]);

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
          let b64 = '';
          const currentMode = node.mode || GenerationMode.IMAGE;

          if (currentMode === GenerationMode.VIDEO) {
            b64 = await generateVideo(node.prompt, node.model, '', requestId);
          } else {
            b64 = await generateImage(
              node.prompt,
              node.aspectRatio,
              node.imageSize,
              node.referenceImages || [],
              node.model,
              '', // managed key
              requestId,
              false // grounding
            );
          }

          isFinished = true;
          clearTimeout(timer);

          // Upload
          let url = b64;
          let originalUrl = '';

          if (currentMode === GenerationMode.IMAGE) {
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
          } else {
            // For video, assume URL is remote or data URI
            url = b64;
            originalUrl = b64;
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
            mimeType: currentMode === GenerationMode.VIDEO ? 'video/mp4' : 'image/png',
            timestamp: Date.now(),
            mode: currentMode
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
          // Add promptCardHeight to properly position below prompt
          const promptCardHeight = node.height || 200;

          const offsetY = promptCardHeight + gapToImages + mobileImageHeight + row * (mobileImageHeight + mobileGap);
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

          // Y: Prompt Bottom + Prompt Height (visual) + Gap + Image Height
          // node.position.y is bottom anchor, but we need to add the prompt's visual height
          // to position the image BELOW the prompt card (not overlapping)
          const promptCardHeight = node.height || 200; // Use dynamic height if available
          const rowHeight = exactImageHeight;
          const rowOffsetY = row * (rowHeight + gap);

          // Final Y (Bottom Anchor) = PromptBottom + PromptHeight + Gap + ImageHeight + RowOffset
          const offsetY = promptCardHeight + gapToImages + exactImageHeight + rowOffsetY;

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

  // Auto-Recover Interrupted Tasks
  useEffect(() => {
    if (activeCanvas) {
      const interruptedNodes = activeCanvas.promptNodes.filter(n => n.error === '::INTERRUPTED::');
      if (interruptedNodes.length > 0) {
        console.log('[App] Auto-recovering interrupted nodes:', interruptedNodes.length);

        interruptedNodes.forEach(node => {
          handleRetryNode(node);
        });

        notify.info('恢复任务', `系统已自动重新开始 ${interruptedNodes.length} 个中断的任务`);
      }
    }
  }, [activeCanvas, handleRetryNode]);

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


      {/* Top Right User Menu - Desktop Only */}
      <div className="absolute top-4 right-4 z-[100] hidden md:flex items-center gap-3">

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
      {selectionMenuPosition && selectedNodeIds.length > 0 && (
        <SelectionMenu
          position={selectionMenuPosition}
          selectedCount={selectedNodeIds.length}
          onDelete={() => {
            if (activeCanvas) {
              const prompts = activeCanvas.promptNodes.filter(n => selectedNodeIds.includes(n.id));
              const images = activeCanvas.imageNodes.filter(n => selectedNodeIds.includes(n.id));
              prompts.forEach(n => deletePromptNode(n.id));
              images.forEach(n => deleteImageNode(n.id));
              clearSelection();
            }
            setSelectionMenuPosition(null);
          }}
          onGroup={() => {
            if (!activeCanvas) return;
            // Calculate bounds
            const prompts = activeCanvas.promptNodes.filter(n => selectedNodeIds.includes(n.id));
            const images = activeCanvas.imageNodes.filter(n => selectedNodeIds.includes(n.id));

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            prompts.forEach(n => {
              const w = 380; // Assuming prompt width
              const h = n.height || 200;
              minX = Math.min(minX, n.position.x - w / 2);
              maxX = Math.max(maxX, n.position.x + w / 2);
              minY = Math.min(minY, n.position.y - h); // Anchor bottom
              maxY = Math.max(maxY, n.position.y);
            });

            images.forEach(n => {
              const { width, totalHeight } = getCardDimensions(n.aspectRatio, true);
              minX = Math.min(minX, n.position.x - width / 2);
              maxX = Math.max(maxX, n.position.x + width / 2);
              minY = Math.min(minY, n.position.y - totalHeight);
              maxY = Math.max(maxY, n.position.y);
            });

            if (minX === Infinity) {
              setSelectionMenuPosition(null);
              return;
            }

            const padding = 20;
            const group: CanvasGroup = {
              id: Date.now().toString(),
              nodeIds: [...prompts.map(n => n.id), ...images.map(n => n.id)],
              bounds: {
                x: minX - padding,
                y: minY - padding,
                width: (maxX - minX) + padding * 2,
                height: (maxY - minY) + padding * 2
              },
              type: 'custom'
            };
            addGroup(group);
            clearSelection();
            setSelectionMenuPosition(null);
          }}
          onTag={handleTag}
        />
      )}

      {/* Main Infinite Canvas */}
      <InfiniteCanvas
        ref={canvasRef}
        showGrid={showGrid}
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
          setSelectionMenuPosition(null);
        }}
        onAutoArrange={handleAutoArrange}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
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

          {/* 1. Prompt -> Image Connections (Generation Flow) */}
          {activeCanvas?.promptNodes.map(pn => {
            return pn.childImageIds.map((childId) => {
              const childNode = activeCanvas.imageNodes.find(img => img.id === childId);
              if (!childNode) return null;

              // Flowith-style: Prompt Bottom → Image Top
              // Prompt Anchor: Bottom Center (pn.position)
              // Image Anchor: Bottom Center (childNode.position)

              // Start: Prompt Bottom Center
              const startX = pn.position.x + 5000;
              const startY = pn.position.y + 5000;

              // End: Image Top Center (Bottom - Height)
              // Calculate rough height based on aspect ratio needed for Top anchor
              const { width: cardWidth, totalHeight: theoreticalHeight } = getCardDimensions(childNode.aspectRatio, true);
              let imageHeight = theoreticalHeight;
              if (childNode.dimensions) {
                const parts = childNode.dimensions.split('x').map(Number);
                if (parts.length === 2 && parts[1] > 0) {
                  const aspect = parts[0] / parts[1];
                  const realParams = getCardDimensions(childNode.aspectRatio, false);
                  imageHeight = (realParams.width / aspect) + 40;
                }
              }
              const endX = childNode.position.x + 5000;
              const endY = (childNode.position.y - imageHeight) + 5005;

              // Bezier Logic (Waterfall) - Straightens when close
              const distY = Math.abs(endY - startY);
              // handleLen proportional to distance, no minimum - straightens when close
              const handleLen = Math.min(distY * 0.4, 150);
              const controlY1 = startY + handleLen;
              const controlY2 = endY - handleLen;
              const d = `M${startX},${startY} C${startX},${controlY1} ${endX},${controlY2} ${endX},${endY}`;

              return (
                <g key={`${pn.id}-${childId}`}>
                  <circle cx={startX} cy={startY} r="2" fill="#52525b" />
                  <path
                    d={d}
                    fill="none"
                    stroke="#3f3f46"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                    strokeLinecap="round"
                  />
                </g>
              );
            });
          })}

          {/* 2. Image -> Prompt/Pending Connections (Follow-up Flow) */}
          {/* A. Existing Prompts */}
          {activeCanvas?.promptNodes.map(pn => {
            if (!pn.sourceImageId) return null;
            const sourceNode = activeCanvas.imageNodes.find(img => img.id === pn.sourceImageId);
            if (!sourceNode) return null;

            // Source: Image Bottom Center (+5000 offset)
            const startX = sourceNode.position.x + 5000;
            const startY = sourceNode.position.y + 5000;

            // Target: Prompt Top Center (+5000 offset)
            // Use exact height if available, otherwise estimate
            const height = pn.height || getPromptHeight(pn.prompt);
            const endX = pn.position.x + 5000;
            const endY = (pn.position.y - height) + 5000;

            // Waterfall Bezier - Straightens when close
            const distY = Math.abs(endY - startY);
            const handleLen = Math.min(distY * 0.4, 150);
            const controlY1 = startY + handleLen;
            const controlY2 = endY - handleLen;
            const d = `M${startX},${startY} C${startX},${controlY1} ${endX},${controlY2} ${endX},${endY}`;

            // Midpoint for Button (t=0.5)
            // B(t) = (1-t)^3 P0 + ...
            const t = 0.5;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const t2 = t * t;

            const btnX = mt * mt2 * startX + 3 * mt2 * t * startX + 3 * mt * t2 * endX + t * t2 * endX;
            const btnY = mt * mt2 * startY + 3 * mt2 * t * controlY1 + 3 * mt * t2 * controlY2 + t * t2 * endY;

            return (
              <g key={`followup-${pn.id}`} className="group">
                {/* Curve - Bottom Layer */}
                <path
                  d={d}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                  opacity="0.5"
                  className="transition-all duration-300 group-hover:stroke-red-400 group-hover:opacity-100 group-hover:stroke-[2px]"
                />

                {/* Transparent Hit Area */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="20"
                  className="pointer-events-auto cursor-pointer"
                />

                {/* Start/End Dots - REMOVED per user request */}
                {/* <circle cx={startX} cy={startY} r="3" fill="#6366f1" opacity="0.6" /> */}
                {/* <circle cx={endX} cy={endY} r="2" fill="#6366f1" opacity="0.5" /> */}

                {/* Disconnect Button - Visible on Hover */}
                <foreignObject
                  x={btnX - 12}
                  y={btnY - 12}
                  width={24}
                  height={24}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ pointerEvents: 'auto' }}
                >
                  <div
                    className="w-6 h-6 rounded-full bg-[#18181b] border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center cursor-pointer shadow-lg scale-90 hover:scale-110 active:scale-95 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnectPrompt(pn.id);
                    }}
                    title="断开连接"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* B. Pending Node Connection */}
          {activeSourceImage && (() => {
            const sourceNode = activeCanvas?.imageNodes.find(img => img.id === activeSourceImage);
            if (!sourceNode) return null;

            // Position + 5000 Offset
            const startX = sourceNode.position.x + 5000;
            const startY = sourceNode.position.y + 5000;

            // Pending Node Position (Bottom Center)
            const endX = pendingPosition.x + 5000;
            const endY = (pendingPosition.y - 140) + 5000;

            const distY = Math.abs(endY - startY);
            const handleLen = Math.min(distY * 0.4, 150);
            const controlY1 = startY + handleLen;
            const controlY2 = endY - handleLen;
            const d = `M${startX},${startY} C${startX},${controlY1} ${endX},${controlY2} ${endX},${endY}`;

            // Midpoint (t=0.5)
            const t = 0.5;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const t2 = t * t;
            const btnX = mt * mt2 * startX + 3 * mt2 * t * startX + 3 * mt * t2 * endX + t * t2 * endX;
            const btnY = mt * mt2 * startY + 3 * mt2 * t * controlY1 + 3 * mt * t2 * controlY2 + t * t2 * endY;

            return (
              <g key="pending-connection" className="group">
                <path
                  d={d}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                  opacity="0.5"
                  className="transition-all duration-300 group-hover:stroke-red-400 group-hover:opacity-100 group-hover:stroke-[2px]"
                />
                <path d={d} stroke="transparent" strokeWidth="20" fill="none" className="pointer-events-auto cursor-pointer" />
                <circle cx={startX} cy={startY} r="3" fill="#6366f1" opacity="0.6" />
                <circle cx={endX} cy={endY} r="2" fill="#6366f1" opacity="0.5" />

                <foreignObject
                  x={btnX - 12}
                  y={btnY - 12}
                  width={24}
                  height={24}
                  className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ pointerEvents: 'auto' }}
                >
                  <div
                    className="w-6 h-6 rounded-full bg-[#18181b] border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center cursor-pointer shadow-lg scale-90 hover:scale-110 active:scale-95 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSourceImage(null);
                      setConfig(prev => ({ ...prev, referenceImages: [] }));
                    }}
                    title="断开连接"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </div>
                </foreignObject>
              </g>
            );
          })()}

        </svg>




        {/* 2. Persistent Prompt Nodes */}
        {activeCanvas?.promptNodes.map(node => (
          <PromptNodeComponent
            key={node.id}
            node={node}
            onPositionChange={updatePromptNodePosition}
            isSelected={selectedNodeIds.includes(node.id)}
            onSelect={() => selectNodes([node.id], !(window.event as any)?.shiftKey)}
            onClickPrompt={(clickedNode) => {
              // Clear continue mode - clicking prompt = start NEW conversation
              setActiveSourceImage(null);
              // ... (existing config update logic) ...
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
            onDisconnect={handleDisconnectPrompt}
            onHeightChange={(id, height) => {
              if (node.height !== height) {
                updatePromptNode({ ...node, height });
              }
            }}
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
              selectNodes([imageId], !(window.event as any)?.shiftKey);

              // Set this image as source for continuing conversation
              setActiveSourceImage(imageId);
              // Clear prompt and existing references to start fresh continue-conversation
              setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
            }}
            isActive={node.id === activeSourceImage}
            isSelected={selectedNodeIds.includes(node.id)}
            onSelect={() => selectNodes([node.id], !(window.event as any)?.shiftKey)}
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
          // Position fixed to center, no drag needed
          isMobile={isMobile}
          canvasTransform={canvasTransform}
          referenceImages={config.referenceImages}
          sourcePosition={activeSourceImage
            ? activeCanvas?.imageNodes.find(n => n.id === activeSourceImage)?.position
            : undefined
          }
          onDisconnect={() => {
            setActiveSourceImage(null);
            setConfig(prev => ({ ...prev, referenceImages: [] })); // Also clear generic references if they came from source? Maybe debatable.
          }}
        />
      </InfiniteCanvas>

      {/* Mobile Top Right Avatar - Removed by user request */}

      {/* Prompt Bar */}
      <PromptBar
        config={config}
        setConfig={setConfig}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
        onCancel={handleCancelGeneration}
        onFilesDrop={handleFilesDrop}
        activeSourceImage={activeSourceImage ?
          (activeCanvas?.imageNodes.find(n => n.id === activeSourceImage) ? {
            id: activeSourceImage,
            url: activeCanvas.imageNodes.find(n => n.id === activeSourceImage)!.url,
            prompt: activeCanvas.imageNodes.find(n => n.id === activeSourceImage)!.prompt
          } : null) : null
        }
        onClearSource={() => setActiveSourceImage(null)}
        isMobile={isMobile}
        onOpenSettings={(view) => {
          setSettingsInitialView(view || 'api-management');
          setShowSettingsPanel(true);
        }}
      />

      {/* Liquid Glass SVG Filter Definition */}
      {/* Liquid Glass SVG Filter Removed (User Request) */}
      {/* Chat Sidebar (Left) */}
      <ChatSidebar
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(prev => !prev)}
        onClose={() => setIsChatOpen(false)}
        isMobile={isMobile}
        onOpenSettings={(view) => {
          setSettingsInitialView(view || 'api-management');
          setShowSettingsPanel(true);
        }}
      />

      {/* Legacy KeyManagerModal removed - integrated into UserProfileModal */}

      {/* User Profile Modal (Unified) */}
      {/* Modals */}
      <TagInputModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        initialTags={initialTags}
        onSave={handleSaveTags}
      />
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
            setSettingsInitialView('api-management');
          }
        }}
      />



      {/* Version Badge - Bottom Right */}
      <div className="fixed bottom-4 right-20 z-40 text-[10px] text-zinc-600 select-none">
        v1.2.1
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
        showGrid={showGrid}
        onAutoArrange={handleAutoArrange}
        onToggleChat={() => setIsChatOpen(prev => !prev)}
        isChatOpen={isChatOpen}
      />

      {/* Search Palette */}
      <SearchPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        promptNodes={activeCanvas?.promptNodes || []}
        onNavigate={handleNavigateToNode}
      />

      {/* VisionOS Mobile Bottom Bar */}
      {/* VisionOS Mobile Bottom Bar - Hidden in Chat */}
      {!isChatOpen && (
        <MobileTabBar
          onSetMode={(mode) => {
            setConfig(prev => ({ ...prev, mode }));
            setIsSidebarOpen(false);
            setIsChatOpen(false);
            setShowSettingsPanel(false);
            setShowProfileModal(false);
          }}
          onOpenSettings={() => { setShowSettingsPanel(true); setIsSidebarOpen(false); }}
          onOpenProfile={() => { setShowProfileModal(true); setIsSidebarOpen(false); }}
          currentMode={config.mode}
          currentView={
            showProfileModal ? 'profile' :
              showSettingsPanel ? 'settings' :
                isSidebarOpen ? 'gallery' : 'home'
          }
        />
      )}
    </div>
  );
};

const App: React.FC = () => {
  const { user, loading } = useAuth();

  // Initialize update check on mount (must be before any conditional returns per React Rules of Hooks)
  useEffect(() => {
    initUpdateCheck();
  }, []);

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

  return (
    <CanvasProvider>
      <NotificationToast />
      <UpdateNotification />
      <AppContent />
    </CanvasProvider>
  );
};

export default App;
