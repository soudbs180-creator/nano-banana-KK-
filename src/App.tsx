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
import { generateImage, cancelGeneration } from './services/geminiService';
import { keyManager } from './services/keyManager';
import { getCardDimensions } from './utils/styleUtils';
// Lucide icons replaced with SVGs
import { CanvasProvider, useCanvas } from './context/CanvasContext';
import { ThemeProvider } from './context/ThemeContext';
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
import { calculateImageHash } from './utils/imageUtils';
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
import TutorialOverlay from './components/TutorialOverlay';
import { GlobalLightbox } from './components/GlobalLightbox';

const AppContent: React.FC = () => {
  const {
    user,
    loading: authLoading,
    signOut
  } = useAuth();
  const [showTutorial, setShowTutorial] = useState(false);
  // [Draft Feature] Persistent Input Card State (Moved to top to avoid ReferenceError)
  const [draftNodeId, setDraftNodeId] = useState<string | null>(null);




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
    arrangeAllNodes,
    moveSelectedNodes,
    isReady
  } = useCanvas();

  // Canvas Ref for Zoom/Pan Controls
  const canvasRef = useRef<InfiniteCanvasHandle>(null);

  const handleZoomIn = () => canvasRef.current?.zoomIn();
  const handleZoomOut = () => canvasRef.current?.zoomOut();

  const handleToggleGrid = () => setShowGrid(prev => !prev);



  // Ref to access fresh state in async functions (fixing Stale Closure issue)
  const activeCanvasRef = useRef(activeCanvas);
  useEffect(() => {
    activeCanvasRef.current = activeCanvas;
  }, [activeCanvas]);

  // [新功能] 全局灯箱状态 (针对图片浏览)
  const [previewImages, setPreviewImages] = useState<GeneratedImage[] | null>(null);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);

  const handleOpenPreview = useCallback((imageId: string) => {
    const canvas = activeCanvasRef.current;
    if (!canvas) return;

    // 1. 编组逻辑 (优先处理画布编组)
    const group = canvas.groups.find(g => g.nodeIds.includes(imageId));
    let list: GeneratedImage[] = [];

    if (group) {
      list = canvas.imageNodes.filter(n => group.nodeIds.includes(n.id))
        .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
    } else {
      // 2. 提示词同级逻辑 (生成批次/多张变体)
      const prompt = canvas.promptNodes.find(p => p.childImageIds?.includes(imageId));
      if (prompt) {
        list = canvas.imageNodes.filter(n => prompt.childImageIds.includes(n.id))
          .sort((a, b) => a.timestamp - b.timestamp || (a.position.x - b.position.x));
      } else {
        // 3. 兜底逻辑 (单张图片)
        const target = canvas.imageNodes.find(n => n.id === imageId);
        if (target) list = [target];
      }
    }

    if (list.length > 0) {
      const idx = list.findIndex(n => n.id === imageId);
      setPreviewImages(list);
      setPreviewInitialIndex(idx >= 0 ? idx : 0);
    }
  }, []);

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

  /* Tutorial Logic - Delayed until Storage is Checked */
  const [isStorageChecked, setIsStorageChecked] = useState(false);

  useEffect(() => {
    // Only trigger if storage is checked AND we are not showing the modal
    // AND Canvas is fully Ready (Hydration complete, prompts dismissed)
    if (isStorageChecked && !showStorageModal && isReady) {
      const seen = localStorage.getItem('kk_tutorial_seen');
      if (!seen) {
        // Wait for potential redirect/settings panel to close or settle
        const timer = setTimeout(() => {
          // If we are in API management, don't show tutorial yet
          if (!showSettingsPanel) {
            setShowTutorial(true);
          }
        }, 1500); // Keep 1.5s delay for smooth UX
        return () => clearTimeout(timer);
      }
    }
  }, [isStorageChecked, showStorageModal, showSettingsPanel, isReady]);

  const [settingsInitialView, setSettingsInitialView] = useState<'dashboard' | 'api-management' | 'cost-estimation' | 'storage-settings' | 'system-logs'>('dashboard');
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    const unsubscribe = keyManager.subscribe(() => {
      setKeyStats(keyManager.getStats());
    });
    return unsubscribe;
  }, []);

  // Mobile Nav Bar Visibility (Swipe to Show, Auto Hide)
  const [isMobileNavVisible, setIsMobileNavVisible] = useState(false);
  const mobileNavTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleShowMobileNav = useCallback(() => {
    setIsMobileNavVisible(true);
    if (mobileNavTimerRef.current) {
      clearTimeout(mobileNavTimerRef.current);
    }
    mobileNavTimerRef.current = setTimeout(() => {
      setIsMobileNavVisible(false);
    }, 5000); // Auto hide after 5s
  }, []);

  const handleHideMobileNav = useCallback(() => {
    setIsMobileNavVisible(false);
    if (mobileNavTimerRef.current) {
      clearTimeout(mobileNavTimerRef.current);
    }
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
    if (authLoading) return;

    const init = async () => {
      // 1. Sync User ID
      if (user) {
        import('./services/costService').then(async ({ setUserId }) => {
          await setUserId(user.id);
        }).catch(err => console.error('[App] CostService sync failed:', err));
        await keyManager.setUserId(user.id);

        // [New] Mark user as logged in on this browser (for future skips)
        localStorage.setItem('kk_has_logged_in', 'true');
      }

      // 2. Check for Returning User (Smart Skip)
      const hasLoggedInBefore = localStorage.getItem('kk_has_logged_in');
      const isDevMode = window.location.hostname === 'localhost';

      // 3. Storage Mode Check
      const { getStorageMode } = await import('./services/storagePreference');
      const storageMode = await getStorageMode();

      // 4. Tutorial Logic
      const tutorialSeen = localStorage.getItem('kk_tutorial_seen');

      // [Smart Logic]
      // A. Storage Modal: Show ONLY if no mode set AND user is NOT a returning user (unless critical)
      // Actually, if storageMode is missing, we MUST show it or default it, otherwise app won't work.
      // But user said: "If storage settings are already set, do not pop up" -> Already handled by `!storageMode` check.
      // "If my account has already logged in ... do not pop up selection" -> This implies we might need a default if missing?
      // For safety, if storageMode is MISSING, we must ask. But if it exists, we skip.

      if (!storageMode) {
        // If returning user but somehow lost storage config? 
        // We still need to ask, to avoid data saving to nowhere.
        // However, if the user implies "don't ask me *again*", likely they have it set.
        // Current logic: `if (!storageMode) setShowStorageModal(true)`
        setShowStorageModal(true);
      } else {
        // Mode exists -> Check Keys for API Panel
        const hasKeys = keyManager.hasValidKeys();
        if (!hasKeys) {
          // Optional: Skip API setup for returning users too? User didn't specify, but implies "don't annoy me".
          // We'll keep it for now as it's critical functionality.
          setShowSettingsPanel(true);
          setSettingsInitialView('api-management');
        }
        setIsStorageChecked(true);
      }

      // B. Tutorial Logic
      // "Only new users and developer mode should pop up tutorial"
      // "If my account has already logged in ... do not pop up tutorial"
      if (isDevMode) {
        // Dev Mode: Allow normal logic (show if not seen, or always? User said "Only... pop up")
        // We'll stick to "Show if not seen" for Devs, unless user explicitly meant "Always for Devs".
        // Assuming "Only [New Users OR Dev Mode] get it" implies Devs get it too.
        if (!tutorialSeen) {
          // Handled by the other useEffect, we just ensure we don't block it here.
        }
      } else {
        if (hasLoggedInBefore) {
          // Returning User -> FORCE SKIP TUTORIAL
          // Even if 'kk_tutorial_seen' is missing (e.g. cleared cache but kept local storage key?)
          // We'll trust 'kk_has_logged_in'.
          // actually 'kk_has_logged_in' is set above.
          localStorage.setItem('kk_tutorial_seen', 'true'); // Silently mark as seen
        }
      }
    };

    init();
  }, [user, authLoading]);

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
    // Smart Center Placement (finding empty space)
    const viewCenter = {
      x: (window.innerWidth / 2 - canvasTransform.x) / canvasTransform.scale,
      y: (window.innerHeight / 2 - canvasTransform.y) / canvasTransform.scale
    };
    // Use findSmartPosition to avoid overlap around center
    // 350x250 is a safe bounding box for the new card
    return findSmartPosition(viewCenter.x, viewCenter.y, 350, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceImage, activeCanvas, canvasTransform, findSmartPosition]);

  // [Draft Feature] Persistent Input Card State - Moved to Top


  // Sync Config -> Draft Node
  useEffect(() => {
    // 1. Check if we have content to sync
    const hasContent = config.prompt || config.referenceImages.length > 0;

    if (hasContent) {
      if (!draftNodeId) {
        // [Draft Logic] Recover existing draft from canvas (e.g. after refresh)
        const existingDraft = activeCanvas?.promptNodes.find(n => n.isDraft);
        if (existingDraft) {
          setDraftNodeId(existingDraft.id);
          return;
        }

        // [Create Draft] If no draft linked, create one using pendingPosition logic
        const newId = Date.now().toString();

        addPromptNode({
          id: newId,
          prompt: config.prompt,
          position: pendingPosition,
          aspectRatio: config.aspectRatio,
          imageSize: config.imageSize,
          model: config.model,
          childImageIds: [],
          referenceImages: config.referenceImages,
          timestamp: Date.now(),
          sourceImageId: activeSourceImage || undefined,
          isDraft: true,
          mode: config.mode,
          tags: []
        });
        setDraftNodeId(newId);
      } else {
        // [Update Draft] Sync changes to existing draft
        const node = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
        if (node) {
          // Detect changes to avoid loop
          const hasChanged = node.prompt !== config.prompt ||
            node.model !== config.model ||
            node.aspectRatio !== config.aspectRatio ||
            node.imageSize !== config.imageSize ||
            JSON.stringify(node.referenceImages) !== JSON.stringify(config.referenceImages) ||
            node.sourceImageId !== (activeSourceImage || undefined);

          if (hasChanged) {
            updatePromptNode({
              ...node,
              prompt: config.prompt,
              aspectRatio: config.aspectRatio,
              imageSize: config.imageSize,
              model: config.model,
              referenceImages: config.referenceImages,
              sourceImageId: activeSourceImage || undefined,
              mode: config.mode
            });
          }
        } else {
          // Draft ID exists but node not found (deleted?), reset ID
          setDraftNodeId(null);
        }
      }
    } else {
      // Config is empty.
      // If we are linked to a draft, delete it to clear the "Preview Box"
      if (draftNodeId) {
        const node = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
        if (node) {
          deletePromptNode(draftNodeId);
          setDraftNodeId(null);
        }
      }
    }
  }, [config, draftNodeId, activeCanvas, addPromptNode, updatePromptNode, pendingPosition, activeSourceImage]);

  const handleDisconnectPrompt = useCallback((promptId: string) => {
    const node = activeCanvas?.promptNodes.find(n => n.id === promptId);
    if (node) {
      updatePromptNode({ ...node, sourceImageId: undefined });
      // [Draft Logic] If disconnecting draft, clear global source state too
      if (node.id === draftNodeId) {
        setActiveSourceImage(null);
      }
      notify.info('已断开连接', '该提示词已断开与原图的关联');
    }
  }, [activeCanvas, updatePromptNode, draftNodeId, setActiveSourceImage]);

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
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Clean Fly-to Navigation Logic
  const handleNavigateToNode = useCallback((targetX: number, targetY: number, id?: string) => {
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

    // Keep local state in sync
    setCanvasTransform({
      x: newX,
      y: newY,
      scale: targetScale
    });

    if (id) {
      setHighlightedId(id);
      setTimeout(() => setHighlightedId(null), 3000); // Highlight for 3 seconds
    }
  }, []);

  const handleMultiSelectConfirm = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    selectNodes(ids, true);
    setTimeout(() => {
      arrangeAllNodes();
    }, 100);
  }, [selectNodes, arrangeAllNodes]);

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

  // Extracted Execution Logic
  const executeGeneration = useCallback(async (node: PromptNode) => {
    const { id: promptNodeId, prompt: promptToUse, parallelCount: count = 1, model: effectiveModel, mode, referenceImages: files = [] } = node;

    // [FIX] Get fresh position from canvas state to support moving during generation
    const liveNode = activeCanvas?.promptNodes.find(n => n.id === promptNodeId);
    if (!liveNode) {
      console.error("Node lost during generation");
      return;
    }
    const livePos = liveNode.position;
    const isVideo = mode === GenerationMode.VIDEO;

    try {
      const buildTask = (index: number) => async () => {
        const startTime = Date.now();
        const currentRequestId = `${promptNodeId}-${index}`;

        // Timeout Check (4 minutes)
        let isFinished = false;
        const timeoutId = setTimeout(() => {
          if (!isFinished) {
            cancelGeneration(currentRequestId);
            updatePromptNode({
              ...node,
              isGenerating: false,
              error: '生成超时，请重新发送任务'
            });
            notify.warning('生成超时', '已超过4分钟，任务已自动停止。请检查网络后重试。');
          }
        }, 240000);

        try {
          let generatedBase64 = '';
          let videoUrl = '';
          let tokenUsage = 0;
          let costUsd = 0;

          if (isVideo) {
            throw new Error('视频生成功能尚未实现');
          } else {
            const result = await generateImage(
              promptToUse,
              node.aspectRatio,
              node.imageSize,
              files,
              effectiveModel,
              '',
              currentRequestId,
              false // grounding config not preserved in node? assuming false for resume or need to add to PromptNode
            );
            generatedBase64 = result.url;
            tokenUsage = result.tokens || 0;
            costUsd = result.cost || 0;
          }

          isFinished = true;
          clearTimeout(timeoutId);

          const generationTime = Date.now() - startTime;
          let originalUrl = '';
          let displayUrl = generatedBase64;

          // Cloud Sync / Upload
          try {
            if (generatedBase64) {
              const res = await fetch(generatedBase64);
              const blob = await res.blob();
              const id = `${Date.now()}_${index}`;
              const { original, thumbnail } = await syncService.uploadImagePair(id, blob);
              if (!thumbnail.startsWith('blob:')) {
                originalUrl = original;
                displayUrl = thumbnail;
              }
            }
          } catch (e) {
            console.warn('Cloud upload failed, falling back to local base64:', e);
          }

          if (isVideo) {
            displayUrl = videoUrl;
            originalUrl = videoUrl;
          }

          return {
            index,
            url: displayUrl,
            originalUrl,
            generationTime,
            base64: generatedBase64,
            mode,
            tokens: tokenUsage,
            cost: costUsd
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

      // 过滤成功的结果
      const validImageData = imageData.filter(d => !!d && !('error' in d) && !!d.url && typeof d.index === 'number') as Array<{
        index: number;
        url: string;
        originalUrl: string;
        generationTime: number;
        base64: string;
        mode: GenerationMode;
        tokens: number;
        cost: number;
      }>;

      if (validImageData.length === 0) {
        const firstError = imageData.find(d => d && 'error' in d);
        throw new Error(firstError && 'error' in firstError ? firstError.error : '所有图片生成失败');
      }

      // 计算位置
      const gapToImages = 80;
      const gap = 16;
      const { width: cardWidth, totalHeight: cardHeight } = getCardDimensions(node.aspectRatio, true);

      const validResults: GeneratedImage[] = validImageData.map((item, mapIndex) => {
        // 使用 mapIndex 作为后备，因为 item.index 已在 filter 中验证
        const idx = item.index ?? mapIndex;
        const { url, originalUrl, generationTime, base64, tokens, cost } = item;
        let x, y;

        if (isMobile) {
          const cols = Math.min(count, 2);
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const mobileCardWidth = 170;
          const mobileCardHeight = 260;
          const mobileGap = 10;
          const itemsInRow = Math.min(cols, count - row * cols);
          const currentGridWidth = itemsInRow * mobileCardWidth + (itemsInRow - 1) * mobileGap;
          const startX = -currentGridWidth / 2;
          const offsetX = startX + col * (mobileCardWidth + mobileGap) + mobileCardWidth / 2;
          const offsetY = gapToImages + mobileCardHeight + row * (mobileCardHeight + mobileGap);
          x = livePos.x + offsetX;
          y = livePos.y + offsetY;
        } else {
          const columns = Math.min(count, 2);
          const col = idx % columns;
          const row = Math.floor(idx / columns);
          const itemsInRow = Math.min(columns, count - row * columns);
          const currentGridWidth = itemsInRow * cardWidth + (itemsInRow - 1) * gap;
          const startX = -currentGridWidth / 2;
          const offsetX = startX + col * (cardWidth + gap) + cardWidth / 2;
          const offsetY = gapToImages + cardHeight + row * (cardHeight + gap);
          x = livePos.x + offsetX;
          y = livePos.y + offsetY;
        }

        const uniqueId = Date.now().toString() + idx + Math.random();
        if (base64) {
          saveImage(uniqueId, base64).catch(err => console.error("Failed to cache original locally", err));
        }

        return {
          id: uniqueId,
          url,
          originalUrl,
          prompt: promptToUse,
          aspectRatio: node.aspectRatio,
          timestamp: Date.now(),
          model: effectiveModel,
          canvasId: activeCanvas?.id || 'default',
          parentPromptId: promptNodeId,
          position: { x, y },
          dimensions: `${node.aspectRatio} · ${node.imageSize || '1K'}`,
          generationTime,
          tokens,
          cost
        } as GeneratedImage;
      });

      const updatedNode = {
        ...node,
        isGenerating: false,
        childImageIds: validResults.map(r => r.id)
      };

      updatePromptNode(updatedNode);
      addImageNodes(validResults);

      import('./services/costService').then(({ recordCost }) => {
        recordCost(
          effectiveModel,
          node.imageSize,
          validResults.length,
          promptToUse,
          files.length
        );
      });

      // Clear active source if it was this node (simple check)
      if (activeSourceImage && activeSourceImage === node.sourceImageId) {
        setActiveSourceImage(null);
      }

    } catch (err: any) {
      console.error(err);
      updatePromptNode({ ...node, isGenerating: false, error: err.message || 'Failed' });
      notify.error('生成任务失败', err.message || "Generation failed.");
      if (err.message && (err.message.includes("API Key") || err.message.includes("403"))) {
        setShowSettingsPanel(true);
        setSettingsInitialView('api-management');
      }
    }
  }, [isMobile, updatePromptNode, addImageNodes, activeCanvas, activeSourceImage, getCardDimensions]);

  // Auto-Resume Effect
  const hasResumedRef = useRef(false);
  useEffect(() => {
    // Wait for canvas to be ready and loaded
    if (!activeCanvas || hasResumedRef.current) return;

    const interruptedNodes = activeCanvas.promptNodes.filter(n => n.isGenerating);
    if (interruptedNodes.length > 0) {
      console.log(`[Auto-Resume] Found ${interruptedNodes.length} interrupted tasks. Resuming...`);
      interruptedNodes.forEach(node => {
        // Delay slightly to prevent UI contention
        setTimeout(() => executeGeneration(node), 500);
      });
      notify.info('任务自动恢复', `已恢复 ${interruptedNodes.length} 个未完成的生成任务`);
    }
    hasResumedRef.current = true;
  }, [activeCanvas, executeGeneration]);


  const handleGenerate = useCallback(async () => {
    if (!config.prompt.trim()) return;

    setIsGenerating(true);

    // [Draft Logic] Use existing draft if available
    let promptNodeId = draftNodeId;
    let isReusingDraft = false;
    let currentPos = findNextGroupPosition(); // Fallback for new

    if (promptNodeId) {
      // We have a draft. Use it.
      const draft = activeCanvas?.promptNodes.find(n => n.id === promptNodeId);
      if (draft) {
        isReusingDraft = true;
        // [FIX] Update draft position to current view center (where user sees it)
        const viewCenter = {
          x: (window.innerWidth / 2 - canvasTransform.x) / canvasTransform.scale,
          y: (window.innerHeight / 2 - canvasTransform.y) / canvasTransform.scale
        };
        currentPos = viewCenter;
      } else {
        // Draft ID stale?
        promptNodeId = Date.now().toString();
      }
    } else {
      promptNodeId = Date.now().toString();
    }

    setDraftNodeId(null); // Detach status immediately

    const viewCenter = {
      x: (window.innerWidth / 2 - canvasTransform.x) / canvasTransform.scale,
      y: (window.innerHeight / 2 - canvasTransform.y) / canvasTransform.scale
    };

    // Legacy calculation reference, but we used currentPos above.
    const promptHeight = getPromptHeight(config.prompt);

    let finalReferenceImages = [...config.referenceImages];
    if (activeSourceImage) {
      const sourceImage = activeCanvas?.imageNodes.find(img => img.id === activeSourceImage);
      if (sourceImage && sourceImage.url) {
        try {
          const response = await fetch(sourceImage.url);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const matches = result.match(/^data:(.+);base64,(.+)$/);
              resolve(matches ? matches[2] : '');
            };
            reader.readAsDataURL(blob);
          });
          if (base64) {
            const alreadyAdded = finalReferenceImages.some(ref => ref.id === sourceImage.id);
            if (!alreadyAdded) {
              finalReferenceImages.push({
                id: sourceImage.id,
                data: base64, // @ts-ignore
                mimeType: blob.type || 'image/png'
              });
            }
          }
        } catch (filesErr) {
          console.warn('Ref load error', filesErr);
        }
      }
    }

    // Ensure all reference images are saved to IDB for persistence
    // (Large images might be stripped from localStorage)
    finalReferenceImages.forEach(ref => {
      if (ref.data) {
        import('./services/imageStorage').then(({ saveImage }) => {
          // IMPORTANT: store as full DataURL so CanvasContext can rehydrate mimeType/base64 reliably
          const mime = (ref as any).mimeType || 'image/png';
          const fullUrl = ref.data!.startsWith('data:') ? ref.data! : `data:${mime};base64,${ref.data!}`;
          saveImage(ref.id, fullUrl).catch(e => console.warn('Ref save failed', e));
        });
      }
    });

    const generatingNode: PromptNode = {
      id: promptNodeId!,
      prompt: config.prompt,
      position: currentPos,
      aspectRatio: config.aspectRatio,
      imageSize: config.imageSize,
      model: config.model,
      childImageIds: [],
      referenceImages: finalReferenceImages,
      timestamp: Date.now(),
      isGenerating: true,
      parallelCount: config.parallelCount,
      sourceImageId: activeSourceImage || undefined,
      mode: config.mode,
      isDraft: false // Ensure it is NOT a draft anymore
    };

    if (isReusingDraft) {
      updatePromptNode(generatingNode);
    } else {
      addPromptNode(generatingNode);
    }

    setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
    setActiveSourceImage(null);
    setIsGenerating(false); // Global spinner off, local spinner on

    // Execute immediately
    executeGeneration(generatingNode);

  }, [config, draftNodeId, addPromptNode, updatePromptNode, activeCanvas, activeSourceImage, canvasTransform, findNextGroupPosition, executeGeneration, getPromptHeight]);

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

      // Layout should appear near current viewport center (avoid "arranged far away")
      const viewCenter = {
        x: (window.innerWidth / 2 - canvasTransform.x) / canvasTransform.scale,
        y: (window.innerHeight / 2 - canvasTransform.y) / canvasTransform.scale
      };

      // 智能整理逻辑: 如果有选中，仅整理选中内容 (及其关联的卡片)
      // If selection exists, filter targets. Otherwise arrange ALL.
      let targets = canvas.promptNodes;

      if (selectedNodeIds.length > 0) {
        const selectedSet = new Set(selectedNodeIds);

        // Find prompts involved in selection
        targets = canvas.promptNodes.filter(p => {
          // 1. Prompt itself is selected
          if (selectedSet.has(p.id)) return true;

          // 2. Child Image is selected (Implies "Organize Local Group")
          if (p.childImageIds.some(cid => selectedSet.has(cid))) return true;

          // 3. Prompt belongs to a selected Group
          const parentGroup = canvas.groups.find(g => g.id === p.id || g.nodeIds.includes(p.id));
          if (parentGroup && selectedSet.has(parentGroup.id)) return true; // (Wait, group ID usually distinct)

          // Check actual Group objects for selection
          const groupsSelected = canvas.groups.filter(g => selectedSet.has(g.id));
          if (groupsSelected.some(g => g.nodeIds.includes(p.id))) return true;

          return false;
        });

        if (targets.length === 0) {
          // Maybe only images selected but no parents? (Orphans)
          // We can't easily auto-arrange orphans with this logic.
          return;
        }
      }

      const normals = targets.filter(p => !p.error);
      const errors = targets.filter(p => p.error);

      // Prefer measured node height (from PromptNodeComponent) to avoid overlap/misalignment.
      const getPromptHeightForLayout = (p: PromptNode) => p.height || getPromptHeight(p.prompt);

      // Get image dims consistent with rendering + connection-line math
      const getImageDimsForLayout = (img: any) => {
        const base = getCardDimensions(img.aspectRatio, true);

        // If we have real pixel dimensions like "1024x768", compute height precisely
        if (typeof img.dimensions === 'string' && /^\d+\s*x\s*\d+$/.test(img.dimensions)) {
          const [w, h] = img.dimensions.split('x').map((s: string) => parseInt(s.trim(), 10));
          if (w > 0 && h > 0) {
            const ratio = w / h;
            // Render width is driven by aspectRatio mapping, not by pixel width
            const renderWidth = getCardDimensions(img.aspectRatio, false).width;
            const exactTotalHeight = (renderWidth / ratio) + 40; // footer
            return { width: renderWidth, totalHeight: exactTotalHeight };
          }
        }

        return base;
      };

      const measureBlock = (prompt: PromptNode) => {
        const promptHeight = getPromptHeightForLayout(prompt);
        const children = canvas.imageNodes.filter(img => img.parentPromptId === prompt.id);
        const dims = children.map(img => getImageDimsForLayout(img));
        const rowWidth = dims.reduce((s, d) => s + d.width, 0) + (dims.length > 0 ? (dims.length - 1) * COL_GAP_IMG : 0);
        const rowHeight = dims.length > 0 ? Math.max(...dims.map(d => d.totalHeight)) : 0;
        const blockWidth = Math.max(PROMPT_WIDTH, rowWidth);
        const promptToImageGap = children.length > 0 ? clampGap(promptHeight) : 0;
        const blockHeight = promptHeight + (children.length > 0 ? promptToImageGap + rowHeight : 0) + NODE_GAP;
        return { promptHeight, children, dims, rowWidth, blockWidth, blockHeight, promptToImageGap };
      };

      // Stage positions first, then apply a single global offset so the result is centered near viewCenter.
      const promptPositions: Record<string, { x: number; y: number }> = {};
      const imagePositions: Record<string, { x: number; y: number }> = {};

      const placePrompt = (prompt: PromptNode, xLeft: number, yTop: number) => {
        const info = measureBlock(prompt);
        const centerX = xLeft + info.blockWidth / 2;
        const promptBottom = yTop + info.promptHeight;

        promptPositions[prompt.id] = { x: centerX, y: promptBottom };

        if (info.children.length > 0) {
          let cursorX = centerX - info.rowWidth / 2;
          const rowTop = promptBottom + info.promptToImageGap;
          info.children.forEach((img, idx) => {
            const dim = info.dims[idx];
            imagePositions[img.id] = { x: cursorX + dim.width / 2, y: rowTop + dim.totalHeight };
            cursorX += dim.width + COL_GAP_IMG;
          });
        }

        return { width: info.blockWidth, height: info.blockHeight };
      };

      // Normals grid
      const normalsSorted = [...normals].sort((a, b) => parseInt(a.id) - parseInt(b.id));
      let x = 0, y = 0, rowH = 0, count = 0;
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

      // Compute bounds (using staged positions + real sizes) and shift whole layout to viewCenter.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const addRect = (cx: number, bottomY: number, w: number, h: number) => {
        // Anchor is bottom-center
        const left = cx - w / 2;
        const right = cx + w / 2;
        const top = bottomY - h;
        const bottom = bottomY;
        minX = Math.min(minX, left);
        maxX = Math.max(maxX, right);
        minY = Math.min(minY, top);
        maxY = Math.max(maxY, bottom);
      };

      canvas.promptNodes.forEach(p => {
        const pos = promptPositions[p.id];
        if (!pos) return;
        addRect(pos.x, pos.y, PROMPT_WIDTH, getPromptHeightForLayout(p));
      });

      canvas.imageNodes.forEach(img => {
        const pos = imagePositions[img.id];
        if (!pos) return;
        const dim = getImageDimsForLayout(img);
        addRect(pos.x, pos.y, dim.width, dim.totalHeight);
      });

      if (minX !== Infinity && minY !== Infinity && maxX !== -Infinity && maxY !== -Infinity) {
        const layoutCenterX = (minX + maxX) / 2;
        const layoutCenterY = (minY + maxY) / 2;
        const dx = viewCenter.x - layoutCenterX;
        const dy = viewCenter.y - layoutCenterY;

        Object.keys(promptPositions).forEach(id => {
          const p = promptPositions[id];
          promptPositions[id] = { x: p.x + dx, y: p.y + dy };
        });
        Object.keys(imagePositions).forEach(id => {
          const p = imagePositions[id];
          imagePositions[id] = { x: p.x + dx, y: p.y + dy };
        });
      }

      // Apply updates (ignore selection + do not auto-move children because we explicitly set image positions)
      canvas.promptNodes.forEach(p => {
        const pos = promptPositions[p.id];
        if (pos) updatePromptNodePosition(p.id, pos, { moveChildren: false, ignoreSelection: true });
      });
      canvas.imageNodes.forEach(img => {
        const pos = imagePositions[img.id];
        if (pos) updateImageNodePosition(img.id, pos, { ignoreSelection: true });
      });
    };

    clearSelection();
    requestAnimationFrame(runLayout);
  }, [activeCanvas, canvasTransform, clearSelection, updateImageNodePosition, updatePromptNodePosition, getPromptHeight]);

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
        }, 360000);

        try {
          let b64 = '';
          const currentMode: GenerationMode = node.mode || GenerationMode.IMAGE;

          if (currentMode === GenerationMode.VIDEO) {
            throw new Error('视频生成功能尚未实现');
          } else {
            const result = await generateImage(
              node.prompt,
              node.aspectRatio,
              node.imageSize,
              node.referenceImages || [],
              node.model,
              '', // managed key
              requestId,
              false // grounding
            );
            b64 = result.url;
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

          // Calculate Hash/StorageID
          const storageId = await calculateImageHash(url);

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
            storageId, // Content-Based ID
            // 在此分支中 currentMode 只能是 IMAGE（VIDEO 在上面抛出错误）
            mimeType: 'image/png',
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

  // Optimization: Stable handlers for Node Clicks
  const handlePromptClick = useCallback((clickedNode: PromptNode) => {
    setActiveSourceImage(null);
    setConfig(prev => ({
      ...prev,
      prompt: clickedNode.prompt,
      aspectRatio: clickedNode.aspectRatio,
      imageSize: clickedNode.imageSize,
      model: clickedNode.model,
      referenceImages: clickedNode.referenceImages || []
    }));

    // [Draft Logic] Resume Draft if clicked on a draft node
    if (clickedNode.isDraft) {
      setDraftNodeId(clickedNode.id);
    } else {
      // Detach draft if clicking a finalized node (acting as "Edit Template" or "Remix")
      setDraftNodeId(null);
    }
  }, [setConfig]);

  const handleImageClick = useCallback((imageId: string) => {
    // Click to select
    selectNodes([imageId], !(window.event as any)?.shiftKey);

    // Set this image as source for continuing conversation
    setActiveSourceImage(imageId);
    // Clear prompt and existing references to start fresh continue-conversation
    setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
  }, [selectNodes, setConfig]);

  // Dynamic Group Bounds Calculation
  const getComputedGroupBounds = useCallback((group: CanvasGroup) => {
    if (!activeCanvas) return undefined;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasNodes = false;
    const PADDING = 48;
    const TOP_EXTRA = 36;

    // Helper to merge rect into bounds
    const addRect = (x: number, y: number, w: number, h: number) => {
      // Anchored at Bottom Center (x, y)
      const left = x - w / 2;
      const right = x + w / 2;
      const top = y - h;
      const bottom = y;

      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
      hasNodes = true;
    };

    group.nodeIds.forEach(id => {
      // 1. Check Prompts
      const prompt = activeCanvas.promptNodes.find(p => p.id === id);
      if (prompt) {
        addRect(prompt.position.x, prompt.position.y, 380, prompt.height || 200);
        return;
      }
      // 2. Check Images
      const img = activeCanvas.imageNodes.find(n => n.id === id);
      if (img) {
        const { width, totalHeight } = getCardDimensions(img.aspectRatio, true);
        addRect(img.position.x, img.position.y, width, totalHeight);
      }
    });

    if (!hasNodes) return undefined;

    return {
      x: minX - PADDING,
      y: minY - (PADDING + TOP_EXTRA),
      width: (maxX - minX) + PADDING * 2,
      height: (maxY - minY) + PADDING + TOP_EXTRA
    };
  }, [activeCanvas]);

  // Viewport Culling (Virtualization) Logic
  // Optimization: Only render nodes overlapping with the current viewport (+buffer)
  const { visiblePromptNodes, visibleImageNodes, visibleGroups } = React.useMemo(() => {
    if (!activeCanvas) {
      return { visiblePromptNodes: [], visibleImageNodes: [], visibleGroups: [] };
    }

    // Buffer: Load 1 screen worth of content around the viewport to prevent flash on scroll
    const BUFFER = 2000;

    // Viewport Render Bounds in Canvas Coordinates
    // Screen (0,0) -> Canvas (vLeft, vTop)
    const vLeft = -canvasTransform.x / canvasTransform.scale - BUFFER;
    const vTop = -canvasTransform.y / canvasTransform.scale - BUFFER;
    const vRight = (window.innerWidth - canvasTransform.x) / canvasTransform.scale + BUFFER;
    const vBottom = (window.innerHeight - canvasTransform.y) / canvasTransform.scale + BUFFER;

    // 1. Filter Groups
    const visibleGroups = activeCanvas.groups.filter(g => {
      const { x, y, width, height } = g.bounds;
      return !(x > vRight || x + width < vLeft || y > vBottom || y + height < vTop);
    });

    // 2. Filter Prompt Nodes
    const visiblePromptNodes = activeCanvas.promptNodes.filter(n => {
      // Estimate Bounds (Center X, Bottom Y)
      const w = 500; // Generous width
      const h = 500; // Generous height
      const x = n.position.x - w / 2;
      const y = n.position.y - h;
      return !(x > vRight || x + w < vLeft || y > vBottom || y + h < vTop);
    });

    // 3. Filter Image Nodes
    const visibleImageNodes = activeCanvas.imageNodes.filter(n => {
      // Estimate Bounds (Center X, Bottom Y)
      const w = 400;
      const h = 700; // Vertical images can be tall
      const x = n.position.x - w / 2;
      const y = n.position.y - h;
      return !(x > vRight || x + w < vLeft || y > vBottom || y + h < vTop);
    });

    return { visiblePromptNodes, visibleImageNodes, visibleGroups };
  }, [activeCanvas, canvasTransform]);

  return (
    <div id="canvas-container" className="relative w-screen h-screen bg-[#09090b] overflow-hidden text-zinc-100 font-inter selection:bg-indigo-500/30"
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
      <div id="header-user-menu" className="absolute top-4 right-4 z-[100] hidden md:flex items-center gap-3">

        {/* User Avatar & Dropdown Trigger */}
        <div className="relative group">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="relative w-10 h-10 rounded-full overflow-hidden border-2 transition-all shadow-2xl bg-[#1a1a1c] flex items-center justify-center cursor-pointer active:scale-95"
            style={{ borderColor: 'var(--border-light)' }}
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
              <div className="absolute top-12 right-0 w-64 border rounded-xl shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100 origin-top-right" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>

                {/* User Info Header */}
                <div className="px-3 py-3 border-b mb-2 rounded-lg transition-colors cursor-pointer group"
                  style={{ borderColor: 'var(--border-light)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  onClick={() => {
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
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.user_metadata?.full_name || 'User'}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>{user?.email}</div>
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
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-blue)' }}><User size={14} /></div>
                    个人中心
                  </button>

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowSettingsPanel(true);
                      setSettingsInitialView('dashboard');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  >
                    <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-purple)' }}><LayoutDashboard size={14} /></div>
                    设置
                  </button>

                  <div className="h-px my-1" style={{ backgroundColor: 'var(--border-light)' }} />

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
      {/* Selection Menu Overlay */}
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

            // [FIX] Include child images of selected prompts for adaptive bounding
            const childImageIds = prompts.flatMap(p => p.childImageIds || []);
            const images = activeCanvas.imageNodes.filter(n => selectedNodeIds.includes(n.id) || childImageIds.includes(n.id));

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
        id="canvas-container"
        ref={canvasRef}
        showGrid={showGrid}
        onTransformChange={setCanvasTransform}
        cardPositions={[
          ...(activeCanvas?.promptNodes.map(n => n.position) || []),
          ...(activeCanvas?.imageNodes.map(n => n.position) || [])
        ]}
        onCanvasClick={() => {
          // [Draft Logic] Detach from draft when clicking background
          if (draftNodeId) setDraftNodeId(null);

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
                    strokeDasharray="4 4"
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




        {/* 2. 编组层 (位于卡片后方) */}
        {visibleGroups.map(group => (
          <CanvasGroupComponent
            key={group.id}
            group={group}
            zoom={canvasTransform.scale}
            highlighted={highlightedId === group.id}
            onUngroup={removeGroup}
            onDragStart={(id, e) => {
              const nodeIds = group.nodeIds;
              const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;
              const alreadySelected = selectedNodeIds || [];

              // If dragging an already selected group (part of a multi-selection), ensure we don't wipe selection
              // Unless we are holding shift (toggling)
              const allNodesSelected = nodeIds.every(nid => alreadySelected.includes(nid));

              if (isMultiSelect) {
                selectNodes(nodeIds, true);
                return;
              }

              if (alreadySelected.length > 0 && allNodesSelected) {
                return;
              }

              selectNodes(nodeIds, false);
            }}
            onGroupDrag={(delta) => moveSelectedNodes(delta)}
            onUpdateGroup={updateGroup}
            computedBounds={getComputedGroupBounds(group)}
          />
        ))}

        {/* 3. 持久化提示词节点 (Filter out Draft Node) */}
        {visiblePromptNodes.filter(n => n.id !== draftNodeId).map(node => (
          <PromptNodeComponent
            key={node.id}
            node={node}
            onPositionChange={updatePromptNodePosition}
            isSelected={selectedNodeIds.includes(node.id)}
            highlighted={highlightedId === node.id}
            onSelect={() => selectNodes([node.id], !(window.event as any)?.shiftKey)}
            onClickPrompt={handlePromptClick}
            onConnectStart={handleConnectStart}
            zoomScale={canvasTransform.scale}
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

        {/* 3. 图片节点 */}
        {visibleImageNodes.map(node => (
          <ImageNode
            key={node.id}
            image={node}
            position={node.position}
            onPositionChange={updateImageNodePosition}
            highlighted={highlightedId === node.id}
            onDimensionsUpdate={updateImageNodeDimensions}
            onDelete={deleteImageNode}
            onConnectEnd={handleConnectEnd}
            onClick={handleImageClick}
            isActive={node.id === activeSourceImage}
            isSelected={selectedNodeIds.includes(node.id)}
            onSelect={() => selectNodes([node.id], !(window.event as any)?.shiftKey)}
            zoomScale={canvasTransform.scale}
            isMobile={isMobile}
            onPreview={handleOpenPreview}
          />
        ))}

        {/* 4. Pending / Typing Node */}
        {/* 4. Pending / Typing Node - Removed (Now handled by Persistent Draft DraftNode) */}
        {/* <PendingNode ... /> removed */}
      </InfiniteCanvas>

      {/* Mobile Top Right Avatar - Removed by user request */}

      {/* Prompt Bar */}
      <div className="contents">
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
            handleHideMobileNav(); // Hide nav when opening settings (optional, but requested behavior implies consistent handling)
          }}
          onInteract={handleShowMobileNav}
        />
      </div>

      {/* Liquid Glass SVG Filter Definition */}
      {/* Liquid Glass SVG Filter Removed (User Request) */}
      {/* Chat Sidebar (Left) */}
      <div id="chat-sidebar-wrapper">
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
      </div>

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
          setIsStorageChecked(true);
          if (!keyManager.hasValidKeys()) {
            setShowSettingsPanel(true);
            setSettingsInitialView('api-management');
          }
        }}
      />




      {/* Version Badge - Bottom Right */}
      <div className="fixed bottom-4 right-20 z-40 text-[10px] text-zinc-600 select-none">
        v1.2.3
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



      {/* [NEW] Draft Node Overlay (Fixed Center) */}
      {draftNodeId && (() => {
        const draftNode = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
        if (!draftNode) return null;

        // Mock position 0,0 for component, handle centering via container
        const displayNode = { ...draftNode, position: { x: 0, y: 0 } };

        return (
          <div className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center">
            {/* Wrapper to handle PromptNode's bottom-center anchor */}
            <div className="relative pointer-events-auto transform translate-y-[50%]">
              <PromptNodeComponent
                node={displayNode}
                onPositionChange={() => { }} // No-op during preview
                isSelected={true}
                onSelect={() => { }}
                zoomScale={1} // Always 1:1 in preview? Or match canvas? User said "center area". 1:1 is clearer.
                isMobile={isMobile}
                onCancel={handleCancelGeneration}
                // Disable drag for the overlay
                onConnectStart={() => { }}
              />
            </div>
          </div>
        );
      })()}


      {/* 全局灯箱与搜索面板 (搜索面板置于底部，灯箱置于最上层) */}
      {previewImages && (
        <GlobalLightbox
          images={previewImages}
          initialIndex={previewInitialIndex}
          onClose={() => setPreviewImages(null)}
        />
      )}
      <SearchPalette
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        promptNodes={activeCanvas?.promptNodes || []}
        groups={activeCanvas?.groups || []}
        onNavigate={handleNavigateToNode}
        onMultiSelectConfirm={handleMultiSelectConfirm}
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
            handleShowMobileNav(); // Keep visible on interaction
          }}
          onOpenSettings={() => {
            setShowSettingsPanel(true);
            setIsSidebarOpen(false);
            handleShowMobileNav();
          }}
          onOpenProfile={() => {
            setShowProfileModal(true);
            setIsSidebarOpen(false);
            handleShowMobileNav();
          }}
          currentMode={config.mode}
          currentView={
            showProfileModal ? 'profile' :
              showSettingsPanel ? 'settings' :
                isSidebarOpen ? 'gallery' : 'home'
          }
          isVisible={isMobileNavVisible}
          onInteract={handleShowMobileNav}
        />
      )}
      {showTutorial && (
        <TutorialOverlay
          onComplete={() => {
            setShowTutorial(false);
            localStorage.setItem('kk_tutorial_seen', 'true');
          }}
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
    return (
      <ThemeProvider>
        <LoginScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <CanvasProvider>
        <NotificationToast />
        <UpdateNotification />
        <AppContent />
      </CanvasProvider>
    </ThemeProvider>
  );
};

export default App;
// Force Rebuild
