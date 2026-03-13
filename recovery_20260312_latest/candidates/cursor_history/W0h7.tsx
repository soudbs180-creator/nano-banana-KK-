import React, { useState, useCallback, useRef, useEffect } from 'react';
import InfiniteCanvas, { InfiniteCanvasHandle } from './components/canvas/InfiniteCanvas';

import PromptBar from './components/layout/PromptBar';
import ImageNode from './components/image/ImageCard2';
import PromptNodeComponent from './components/canvas/PromptNodeComponent';
import PendingNode from './components/canvas/PendingNode';
// KeyManagerModal removed - integrated into UserProfileModal
import ChatSidebar from './components/layout/ChatSidebar';
import { AspectRatio, ImageSize, GenerationConfig, PromptNode, GeneratedImage, GenerationMode, KnownModel, CanvasGroup } from './types';
import { Image as ImageIcon, Plus, Trash2, Shield, FileText, CheckCircle2, History, CreditCard, ChevronDown, Wand2, RefreshCw, Star, Coins, User, LayoutDashboard, LogOut, Settings, Zap, Sparkles } from 'lucide-react';
import { SelectionMenu } from './components/canvas/SelectionMenu';
import { MigrateModal } from './components/modals/MigrateModal';
import { CanvasGroupComponent } from './components/canvas/CanvasGroupComponent';
import { generateImage, cancelGeneration } from './services/llm/geminiService';
import { modelCaller } from './services/model/modelCaller';
import { getModelPricing, isCreditBasedModel, getModelCredits } from './services/model/modelPricing';
import { keyManager, getModelMetadata } from './services/auth/keyManager';
import { unifiedModelService } from './services/model/unifiedModelService';
import { llmService } from './services/llm/LLMService';
import { getCardDimensions } from './utils/styleUtils';
import { getViewportPreferredPosition, findSafePosition } from './utils/canvasUtils'; // 🚀 Smart Positioning
import { getViewportOffsets, getLiveViewportCenter } from './utils/canvasCenter';

// Lucide icons replaced with SVGs
import { CanvasProvider, useCanvas } from './context/CanvasContext';
import { ThemeProvider } from './context/ThemeContext';
import ConnectionDot from './components/canvas/ConnectionDot';
import LoginScreen from './components/auth/LoginScreen';
import UserProfileModal, { UserProfileView } from './components/modals/UserProfileModal';
import StorageSelectionModal from './components/modals/StorageSelectionModal';
import SettingsPanel from './components/settings/SettingsPanel';
import { useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';
import { BillingProvider, useBilling } from './context/BillingContext';


import { saveAs } from 'file-saver';
import JSZip from 'jszip';
// import { syncService } from './services/system/syncService'; // [FIX] Dynamic Import
import { saveImage, saveOriginalImage } from './services/storage/imageStorage';
import { calculateImageHash } from './utils/imageUtils';
import { optimizePromptForImage } from './services/llm/promptOptimizerService';
import NotificationToast from './components/common/NotificationToast';
// import { notify } from './services/system/notificationService'; // [FIX] Dynamic Import

// import { initUpdateCheck } from './services/system/updateCheck'; // [FIX] Dynamic Import

// ProjectManager imported from components
import ProjectManager from './components/settings/ProjectManager';
import SearchPalette from './components/layout/SearchPalette';
import { Search } from 'lucide-react'; // Import Search icon
import MobileTabBar from './components/mobile/MobileTabBar';
import MobileHeader from './components/mobile/MobileHeader'; // [NEW] Mobile Header
import TagInputModal from './components/modals/TagInputModal';
import TutorialOverlay from './components/common/TutorialOverlay';
import { GlobalLightbox } from './components/image/GlobalLightbox';
import GpuBackground from './components/layout/GpuBackground';
import RechargeModal from './components/modals/RechargeModal';
import { ApiKeyManager } from './components/api/ApiKeyManager';
import { ApiKeyModal } from './components/api/ApiKeyModal';
import { CostEstimation } from './pages/CostEstimation';
import type { Supplier } from './services/billing/supplierService';
import { apiKeyModalService } from './services/api/apiKeyModalService';

interface AppContentProps {
  onOpenSupplierManager?: () => void;
  onOpenCostEstimation?: () => void;
  onOpenGlobalApiKeyModal?: (supplier?: Supplier) => void;
}

const AppContent: React.FC<AppContentProps> = ({ onOpenSupplierManager, onOpenCostEstimation, onOpenGlobalApiKeyModal }) => {
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
    updatePromptNodePosition, updateImageNodePosition, updateImageNodeDimensions, updateImageNode, // 🚀
    deletePromptNode,
    deleteImageNode,
    urgentUpdatePromptNode, // 🚀 [New] 紧急状态同步
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
    isReady,
    setViewportCenter, // 🚀 视口中心动态优先级
    state, // 🚀 迁移需要访问canvases列表
    migrateNodes, // 🚀 迁移节点到其他项目
    createCanvas, // 🚀 创建新项目
    switchCanvas  // 🚀 切换项目
  } = useCanvas();

  const { balance, loading: balanceLoading, setShowRechargeModal, consumeCredits, refundCredits } = useBilling();

  // 🚀 [Fix] Force re-render tick for real-time connection line updates during drag
  const [dragUpdateTick, setDragUpdateTick] = useState(0);

  // Canvas Ref for Zoom/Pan Controls
  const canvasRef = useRef<InfiniteCanvasHandle>(null);

  const handleFitToAll = () => canvasRef.current?.fitToAll();

  const handleToggleGrid = () => setShowGrid(prev => !prev);



  // Ref to access fresh state in async functions (fixing Stale Closure issue)
  const activeCanvasRef = useRef(activeCanvas);
  useEffect(() => {
    activeCanvasRef.current = activeCanvas;
  }, [activeCanvas]);

  const selectedNodeIdsRef = useRef<string[]>(selectedNodeIds);
  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds;
  }, [selectedNodeIds]);

  // Track reserved regions for rapid-fire generation to prevent overlaps (before React update reflects)
  const reservedRegionsRef = useRef<{ bounds: { x: number; y: number; width: number; height: number }; timestamp: number; }[]>([]);



  // [新功能] 全局灯箱状态 (针对图片浏览)
  const [previewImages, setPreviewImages] = useState<GeneratedImage[] | null>(null);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [showMigrateModal, setShowMigrateModal] = useState(false); // 🚀 迁移弹窗状态

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
      // 2. 提示词家族(Lineage)逻辑栈 (包含父图、变体、扩图、重绘的整条衍生链)
      const graphImages = new Set<string>();
      const queue = [imageId];

      while (queue.length > 0) {
        const currId = queue.shift()!;
        if (!graphImages.has(currId)) {
          graphImages.add(currId);
          const img = canvas.imageNodes.find(n => n.id === currId);
          if (img) {
            // 向上找：同级的兄弟图片，以及孕育这个Prompt的父图片
            const prompt = canvas.promptNodes.find(p => p.id === img.parentPromptId);
            if (prompt) {
              prompt.childImageIds?.forEach(id => {
                if (!graphImages.has(id) && !queue.includes(id)) queue.push(id);
              });
              if (prompt.sourceImageId && !graphImages.has(prompt.sourceImageId) && !queue.includes(prompt.sourceImageId)) {
                queue.push(prompt.sourceImageId);
              }
            }
            // 向下找：以当前图片作为父图衍生出的子卡组图片
            const childPrompts = canvas.promptNodes.filter(p => p.sourceImageId === currId);
            childPrompts.forEach(cp => {
              cp.childImageIds?.forEach(id => {
                if (!graphImages.has(id) && !queue.includes(id)) queue.push(id);
              });
            });
          }
        }
      }

      if (graphImages.size > 0) {
        list = canvas.imageNodes.filter(n => graphImages.has(n.id))
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

  const [settingsInitialView, setSettingsInitialView] = useState<'dashboard' | 'api-management' | 'storage-settings' | 'system-logs'>('dashboard');
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
  const [isPromptFocused, setIsPromptFocused] = useState(false); // 跟踪输入框焦点状态
  const [isSidebarHovered, setIsSidebarHovered] = useState(false); // 跟踪侧边栏hover状态
  const lastMouseMoveRef = useRef<number>(Date.now()); // 记录最后一次鼠标移动时间

  const handleShowMobileNav = useCallback(() => {
    const timeSinceLastMouseMove = Date.now() - lastMouseMoveRef.current;
    const isMouseActive = timeSinceLastMouseMove < 5000; // 5秒内有鼠标活动

    console.log('[handleShowMobileNav] isPromptFocused:', isPromptFocused, 'isSidebarHovered:', isSidebarHovered, 'isMouseActive:', isMouseActive);
    setIsMobileNavVisible(true);
    // 清除旧定时器
    if (mobileNavTimerRef.current) {
      clearTimeout(mobileNavTimerRef.current);
    }
    // 如果输入框有焦点、鼠标在侧边栏上、或鼠标正在活动,不设置自动隐藏定时器
    if (!isPromptFocused && !isSidebarHovered && !isMouseActive) {
      console.log('[handleShowMobileNav] 设置5秒自动隐藏定时器');
      mobileNavTimerRef.current = setTimeout(() => {
        console.log('[handleShowMobileNav] 5秒后自动隐藏');
        setIsMobileNavVisible(false);
      }, 5000);
    } else {
      console.log('[handleShowMobileNav] 不设置定时器 - 有活动:', { isPromptFocused, isSidebarHovered, isMouseActive });
    }
  }, [isPromptFocused, isSidebarHovered]);

  const handleHideMobileNav = useCallback(() => {
    setIsMobileNavVisible(false);
    if (mobileNavTimerRef.current) {
      clearTimeout(mobileNavTimerRef.current);
    }
  }, []);

  // 全局鼠标移动监听 - 重置定时器
  useEffect(() => {
    const handleGlobalMouseMove = () => {
      lastMouseMoveRef.current = Date.now();
      // 鼠标移动时,如果侧边栏可见且没有活动定时器,重新显示并重置定时器
      if (isMobileNavVisible) {
        handleShowMobileNav();
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isMobileNavVisible, handleShowMobileNav]);

  // Tagging State
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [taggingNodeIds, setTaggingNodeIds] = useState<string[]>([]);
  const [initialTags, setInitialTags] = useState<string[]>([]);

  // Tag Constraints State
  const [tagLimits, setTagLimits] = useState({ maxTags: 10, maxChars: 6 });

  // 🚀 New State for enhanced TagInputModal
  const [allTags, setAllTags] = useState<string[]>([]);
  const [inheritedTags, setInheritedTags] = useState<string[]>([]);
  const [isSubCard, setIsSubCard] = useState(false);

  const handleTag = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setTaggingNodeIds(selectedNodeIds);

    const firstId = selectedNodeIds[0];
    const promptNode = activeCanvas?.promptNodes.find(n => n.id === firstId);
    const imageNode = activeCanvas?.imageNodes.find(n => n.id === firstId);

    // 🚀 Collect all existing tags from canvas for suggestions
    const allPromptTags = activeCanvas?.promptNodes.flatMap(n => n.tags || []) || [];
    const allImageTags = activeCanvas?.imageNodes.flatMap(n => n.tags || []) || [];
    const uniqueAllTags = [...new Set([...allPromptTags, ...allImageTags])];
    setAllTags(uniqueAllTags);

    // Determine if editing Sub Card and find inherited tags
    if (imageNode) {
      // 🚀 Sub Card - find parent's tags
      const parentPrompt = activeCanvas?.promptNodes.find(n => n.id === imageNode.parentPromptId);
      setInheritedTags(parentPrompt?.tags || []);
      setIsSubCard(true);
      setTagLimits({ maxTags: 3, maxChars: 6 });
    } else {
      // Main Card
      setInheritedTags([]);
      setIsSubCard(false);
      setTagLimits({ maxTags: 8, maxChars: 6 });
    }

    const tags = promptNode?.tags || imageNode?.tags || [];
    setInitialTags(tags);
    setIsTagModalOpen(true);
    setSelectionMenuPosition(null);
  }, [selectedNodeIds, activeCanvas]);

  const handleSaveTags = useCallback(async (tags: string[]) => {
    const firstId = taggingNodeIds[0];
    const promptNode = activeCanvas?.promptNodes.find(n => n.id === firstId);

    // 🚀 Deduplication Logic: If Main Card adds a tag, remove from its Sub Cards
    if (promptNode) {
      // Editing a Main Card
      const childImageIds = promptNode.childImageIds || [];
      const newMainTags = tags;

      // For each child sub-card, remove any tag that now exists on the main card
      childImageIds.forEach(imgId => {
        const img = activeCanvas?.imageNodes.find(n => n.id === imgId);
        if (img && img.tags && img.tags.length > 0) {
          const filteredTags = img.tags.filter(t => !newMainTags.includes(t));
          if (filteredTags.length !== img.tags.length) {
            // Tags were removed, update the sub-card
            setNodeTags([imgId], filteredTags);
          }
        }
      });
    }

    setNodeTags(taggingNodeIds, tags);
    setIsTagModalOpen(false);

    // 🚀 File System Shortcut Integration
    try {
      const { fileSystemService } = await import('./services/storage/fileSystemService');
      const handle = fileSystemService.getGlobalHandle();

      if (handle) {
        for (const nodeId of taggingNodeIds) {
          const img = activeCanvas?.imageNodes.find(n => n.id === nodeId);
          // Only process ImageNodes that have a filename (from local storage)
          // @ts-ignore - filename injected by CanvasContext
          if (img && img.fileName) {
            const oldTags = img.tags || [];
            const newTags = tags;

            // Diff tags
            const added = newTags.filter(t => !oldTags.includes(t));
            const removed = oldTags.filter(t => !newTags.includes(t));

            const isVideo = img.url?.startsWith('data:video/') || img.model?.includes('veo') || false;

            // Execute updates
            // @ts-ignore
            const filename = img.fileName;

            for (const tag of added) {
              await fileSystemService.createTagShortcut(handle, tag, filename, isVideo);
            }
            for (const tag of removed) {
              await fileSystemService.removeTagShortcut(handle, tag, filename, isVideo);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[App] Failed to update tag shortcuts:', e);
    }
  }, [taggingNodeIds, setNodeTags, activeCanvas]);


  // Sync user with KeyManager and handle Modal Logic (Storage -> API)
  useEffect(() => {
    if (authLoading) return;

    const init = async () => {
      // 0. Initialize Unified Model Service (loads admin configured models)
      await unifiedModelService.initialize();

      // 1. Sync User ID
      if (user) {
        import('./services/billing/costService').then(async ({ setUserId }) => {
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
      const { getStorageMode } = await import('./services/storage/storagePreference');
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
        // 🚀 [修复] 仅对首次用户显示 API 设置面板，返回用户不自动弹出
        const hasKeys = keyManager.hasValidKeys();
        if (!hasKeys && !hasLoggedInBefore && !isDevMode) {
          // 只有首次用户才自动弹出 API 设置面板
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
          prompt: parsed.prompt || '', // 🚀 恢复持久化的 Prompt
          enablePromptOptimization: parsed.enablePromptOptimization || false,
          aspectRatio: parsed.aspectRatio || AspectRatio.AUTO, // [Default: Auto]
          imageSize: parsed.imageSize || ImageSize.SIZE_1K,
          parallelCount: parsed.parallelCount || 1,
          // 🚀 [Fix] 恢复参考图元数据（不含 base64），让 hydrate effect 从 IndexedDB 还原图片数据
          referenceImages: (parsed.referenceImages || []).map((img: any) => ({
            ...img,
            data: undefined // data 需要从 IndexedDB hydrate，不从 localStorage 恢复
          })),
          model: parsed.model || KnownModel.IMAGEN_3,
          enableGrounding: parsed.enableGrounding || false,
          enableImageSearch: parsed.enableImageSearch || false,
          thinkingMode: (parsed.thinkingMode === 'high' || parsed.thinkingMode === 'deep') ? 'high' : 'minimal',
          mode: parsed.mode || GenerationMode.IMAGE,
          pptSlides: Array.isArray(parsed.pptSlides) ? parsed.pptSlides : [],
          pptStyleLocked: parsed.pptStyleLocked !== false
        };
      }
    } catch (e) {
      console.warn('Failed to load generation config', e);
    }
    // Default Fallback
    return {
      prompt: '',
      enablePromptOptimization: false,
      aspectRatio: AspectRatio.AUTO, // [Default: Auto]
      imageSize: ImageSize.SIZE_1K,
      parallelCount: 1,
      referenceImages: [],
      model: KnownModel.IMAGEN_3,
      enableGrounding: false,
      enableImageSearch: false,
      thinkingMode: 'minimal',
      mode: GenerationMode.IMAGE,
      pptSlides: [],
      pptStyleLocked: true
    };
  });

  const [modePreferredKeyMap, setModePreferredKeyMap] = useState<Partial<Record<GenerationMode, string>>>(() => {
    try {
      const raw = localStorage.getItem('kk_mode_preferred_key_map');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  });

  const getPreferredKeyForMode = useCallback((mode?: GenerationMode) => {
    const m = mode || GenerationMode.IMAGE;
    return modePreferredKeyMap[m];
  }, [modePreferredKeyMap]);

  const rememberPreferredKeyForMode = useCallback((mode: GenerationMode | undefined, keySlotId?: string) => {
    if (!mode || !keySlotId) return;
    setModePreferredKeyMap(prev => {
      if (prev[mode] === keySlotId) return prev;
      const next = { ...prev, [mode]: keySlotId };
      localStorage.setItem('kk_mode_preferred_key_map', JSON.stringify(next));
      return next;
    });
  }, []);

  // [New] Hydrate Reference Images from IndexedDB
  useEffect(() => {
    const hydrate = async () => {
      // Only hydrate if we have images with storageId but missing data
      const needsHydration = config.referenceImages.some(img => !img.data && img.storageId);
      if (!needsHydration) return;

      const { getImage } = await import('./services/storage/imageStorage');

      const hydratedImages = await Promise.all(config.referenceImages.map(async (img) => {
        if (!img.data && img.storageId) {
          try {
            // Try to find image by storageId
            const dataUrl = await getImage(img.storageId);

            if (dataUrl) {
              // [FIX] Strip Data URL prefix to comply with PromptBar's raw Base64 expectation
              // The storage returns a full Data URL (e.g. "data:image/png;base64,...")
              // but PromptBar constructs the src by prepending "data:..." again.
              const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
              if (matches && matches[2]) {
                return {
                  ...img,
                  data: matches[2],
                  mimeType: matches[1] || img.mimeType
                };
              }

              // Fallback: If it doesn't match standard Data URL format, use as is.
              // This handles edge cases or if raw base64 was somehow saved.
              return { ...img, data: dataUrl };
            }
          } catch (e) {
            console.error('Failed to hydrate image', img.id, e);
          }
        }
        return img;
      }));

      // Update state with hydrated images, only if actually changed
      // To avoid infinite loop, we compare stringified or reference equality?
      // But 'hydrate' runs on config change. If we update config, it runs again.
      // We must ensure we don't trigger if already hydrated.
      // The check `needsHydration` handles this.

      setConfig(prev => {
        // [FIX] Race Condition: The async hydration might finish AFTER the user has deleted an image.
        // We must NOT overwrite 'prev.referenceImages' with the stale 'hydratedImages' array.
        // Instead, we update only the images that still exist in 'prev'.

        const hydratedMap = new Map(hydratedImages.map(img => [img.id, img]));

        const newImages = prev.referenceImages.map(img => {
          // If we found a hydrated version (with data) for this existing image, use it.
          const hydrated = hydratedMap.get(img.id);
          if (hydrated && hydrated.data && !img.data) {
            return { ...img, data: hydrated.data };
          }
          return img;
        });

        // Optimization: strict equality check to avoid re-render if nothing effectively changed
        // But for object references in map, it's safer to just return new state if we are unsure.
        // Given React batching, this is fine.
        return { ...prev, referenceImages: newImages };
      });
    };

    hydrate();
  }, [config.referenceImages]); // Run when referenceImages array changes (e.g. loaded from empty metadata)


  // Persist Config Changes (Debounced/Effect)
  useEffect(() => {
    // 1. [REMOVED] Save Image Data to IndexedDB (Async side effect)
    // The "Write-First" strategy in PromptBar now handles this immediately upon upload.

    const toSave = {
      enablePromptOptimization: config.enablePromptOptimization || false,
      aspectRatio: config.aspectRatio,
      imageSize: config.imageSize,
      parallelCount: config.parallelCount,
      model: config.model,
      enableGrounding: config.enableGrounding,
      enableImageSearch: config.enableImageSearch || false,
      thinkingMode: config.thinkingMode || 'minimal',
      mode: config.mode,
      pptSlides: config.pptSlides || [],
      pptStyleLocked: config.pptStyleLocked !== false,
      // 🚀 [New] 补齐缺失的视频、音频及提示词字段
      prompt: config.prompt || '',
      videoResolution: config.videoResolution,
      videoDuration: config.videoDuration,
      videoAudio: config.videoAudio,
      audioDuration: config.audioDuration,
      audioLyrics: config.audioLyrics,
      maskUrl: config.maskUrl,
      editMode: config.editMode,
      // Save metadata only (strip heavy data) appropriately? 
      // Actually PromptBar renders using `img.data`.
      // We must save the array structure, but we want `data` to be undefined or null in localStorage to save space.
      referenceImages: config.referenceImages.map(img => ({
        ...img,
        data: undefined // Don't save base64 to localStorage
      }))
    };
    localStorage.setItem('kk_generation_config', JSON.stringify(toSave));
  }, [
    config.enablePromptOptimization,
    config.aspectRatio, config.imageSize, config.parallelCount,
    config.model, config.enableGrounding, config.enableImageSearch, config.thinkingMode, config.mode, config.pptSlides, config.pptStyleLocked,
    config.referenceImages, // Add referenceImages to dep array
    config.prompt, config.videoResolution, config.videoDuration, config.videoAudio, config.audioDuration, config.audioLyrics, config.maskUrl, config.editMode // 🚀 全量依赖监听
  ]);

  // Pending generation state
  // Active source image for continuing conversation
  const [activeSourceImage, setActiveSourceImage] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');

  // Persist Active Source Image
  useEffect(() => {
    // [FIX] Do not restore active source image
    // const savedSource = localStorage.getItem('kk_active_source_image');
    // if (savedSource) setActiveSourceImage(savedSource);
    localStorage.removeItem('kk_active_source_image'); // Ensure it's cleared
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
        import('./services/system/notificationService').then(({ notify }) => {
          if (alertKey === 'critical' || alertKey === 'warning') {
            notify.warning(title, sub);
          } else {
            notify.info(title, sub);
          }
        });
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

  // 🚀 同步视口中心到CanvasContext（用于动态优先级加载）
  useEffect(() => {
    // 计算当前视口中心在画布坐标中的位置
    const centerX = (window.innerWidth / 2 - canvasTransform.x) / canvasTransform.scale;
    const centerY = (window.innerHeight / 2 - canvasTransform.y) / canvasTransform.scale;
    setViewportCenter({ x: centerX, y: centerY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasTransform]); // 🚀 移除setViewportCenter依赖防止无限循环

  // Derived Pending Position: Always Center (or linked to source)
  const pendingPosition = React.useMemo(() => {
    if (activeSourceImage && activeCanvas) {
      const sourceImage = activeCanvas.imageNodes.find(img => img.id === activeSourceImage);
      if (sourceImage) {
        // 🚀 追问模式：新主卡放在原父卡组下方
        const parentPromptId = sourceImage.parentPromptId;
        const parentPrompt = activeCanvas.promptNodes.find(p => p.id === parentPromptId);

        if (parentPrompt) {
          // 找到父主卡下所有子卡，计算最大Y位置
          const siblingImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === parentPromptId);
          let maxY = parentPrompt.position.y; // 父主卡的Y位置（底部锚点）

          // 计算所有子卡的最大Y位置（底部）
          siblingImages.forEach(img => {
            const { totalHeight } = getCardDimensions(img.aspectRatio, true);
            const imgBottom = img.position.y + totalHeight;
            maxY = Math.max(maxY, imgBottom);
          });

          const GAP = 60; // 新主卡与子卡组的间距
          return {
            x: parentPrompt.position.x,  // 与父主卡X对齐
            y: maxY + GAP  // 放在最下方子卡的下面
          };
        }

        // 如果没有父主卡（孤儿副卡），放在源图片下方
        let sourceHeight = 320;
        if (sourceImage.dimensions) {
          const [w, h] = sourceImage.dimensions.split('x').map(Number);
          if (w && h) {
            const ratio = w / h;
            const cardWidth = ratio > 1 ? 320 : (ratio < 1 ? 200 : 280);
            sourceHeight = (cardWidth / ratio) + 40;
          }
        } else {
          const { totalHeight } = getCardDimensions(sourceImage.aspectRatio, true);
          sourceHeight = totalHeight;
        }

        const GAP = 40;
        return {
          x: sourceImage.position.x,
          y: sourceImage.position.y + sourceHeight + GAP
        };
      }
    }
    // Smart Center Placement - Manual Mode (Always Center)
    // 🚀 [Fix] 使用 InfiniteCanvas 的实际可见区域 + 实时 transform 计算精确中心
    const currentTf = canvasRef.current?.getCurrentTransform() || canvasTransform;
    const vpRect = canvasRef.current?.getCanvasRect() || null;
    return getViewportPreferredPosition(currentTf, vpRect, 180);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceImage, activeCanvas, canvasTransform]);

  // [Draft Feature] Persistent Input Card State - Moved to Top





  // 🚀 清除追问源图片，同时删除追问Draft节点
  const handleClearSource = useCallback(() => {
    setActiveSourceImage(null);
    // 如果有追问Draft且没有内容，删除它
    if (draftNodeId) {
      const draftNode = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
      if (draftNode && draftNode.sourceImageId && !draftNode.prompt.trim()) {
        // 只有当Draft是追问模式(有sourceImageId)且没有内容时才删除
        deletePromptNode(draftNodeId);
        setDraftNodeId(null);
      }
    }
  }, [draftNodeId, activeCanvas, deletePromptNode]);

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
          // 🚀 Shift=加选, Ctrl=减选, 无修饰键=替换
          const mode = e.ctrlKey ? 'remove' : (e.shiftKey ? 'add' : 'replace');
          selectNodes(ids, mode);
        } else {
          if (!e.shiftKey && !e.ctrlKey) clearSelection();
        }
      } else {
        // Clicked without drag
        // If Right Click (button 2), DO NOT clear selection (it's likely for Context Menu)
        // Only clear if Left Click and not Shift
        if (e.button !== 2 && !e.shiftKey) {
          clearSelection();
        }
      }
      // 🚀 Show selection menu centered on selection bounds (not at mouse)
      if (e.button === 2) {
        const allSelectedIds = nextSelectionIds.length > 0 ? nextSelectionIds : selectedNodeIds;
        if (allSelectedIds.length > 0) {
          // Calculate center position immediately - getSelectionScreenCenter depends on activeCanvas
          // which may not include newly selected IDs, so we compute manually here
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          let hasNodes = false;

          activeCanvas?.promptNodes
            .filter(n => allSelectedIds.includes(n.id))
            .forEach(n => {
              const w = 380;
              const h = n.height || 200;
              minX = Math.min(minX, n.position.x - w / 2);
              maxX = Math.max(maxX, n.position.x + w / 2);
              minY = Math.min(minY, n.position.y - h);
              maxY = Math.max(maxY, n.position.y);
              hasNodes = true;
            });

          activeCanvas?.imageNodes
            .filter(n => allSelectedIds.includes(n.id))
            .forEach(n => {
              const { width, totalHeight } = getCardDimensions(n.aspectRatio, true);
              minX = Math.min(minX, n.position.x - width / 2);
              maxX = Math.max(maxX, n.position.x + width / 2);
              minY = Math.min(minY, n.position.y - totalHeight);
              maxY = Math.max(maxY, n.position.y);
              hasNodes = true;
            });

          if (hasNodes) {
            const centerX = (minX + maxX) / 2;
            const topY = minY;
            const screenX = centerX * canvasTransform.scale + canvasTransform.x;
            const screenY = topY * canvasTransform.scale + canvasTransform.y;
            setSelectionMenuPosition({ x: screenX, y: screenY });
          } else {
            setSelectionMenuPosition(null);
          }
        } else {
          setSelectionMenuPosition(null);
        }
      } else {
        // Left click clears position unless clicking on a node (handled separately)
        setSelectionMenuPosition(null);
      }
      setSelectionBox(null);
    }
  }, [selectionBox, canvasTransform, activeCanvas, selectNodes, clearSelection, selectedNodeIds, getCardDimensions]);



  // Connection Dragging State
  const [dragConnection, setDragConnection] = useState<{
    active: boolean;
    startId: string;
    startPos: { x: number; y: number };
    currentPos: { x: number; y: number };
  } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const generateLockRef = useRef(false);
  // error state removed, using notify service
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatSidebarWidth, setChatSidebarWidth] = useState(420);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // 使用新封装的 CanvasCenter API（引入自 src/utils/canvasCenter.ts）

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && !isSidebarOpen) setIsSidebarOpen(true); // Auto-open on desktop if closed? Or just default?
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!isMobile) setIsSidebarOpen(true);
  }, []);

  // [Draft Sync Effect] Keep the draft node in sync with PromptBar config
  // AND [Smart Re-centering] Auto-calculate position for new/stale drafts
  useEffect(() => {
    if (draftNodeId && activeCanvas) {
      if (config.prompt.trim()) {
        const node = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
        if (node) {
          // Detect changes to avoid loop
          const hasChanged = node.prompt !== config.prompt ||
            node.model !== config.model ||
            node.aspectRatio !== config.aspectRatio ||
            node.imageSize !== config.imageSize ||
            (node.thinkingMode || 'minimal') !== (config.thinkingMode || 'minimal') ||
            !!node.enableGrounding !== !!config.enableGrounding ||
            !!node.enableImageSearch !== !!config.enableImageSearch ||
            JSON.stringify(node.referenceImages) !== JSON.stringify(config.referenceImages) ||
            node.sourceImageId !== (activeSourceImage || undefined);

          const shouldAutoCenter = !node.userMoved && !node.sourceImageId;

          if (hasChanged || shouldAutoCenter) {
            // 🚀 [Smart Re-centering]
            // If the user hasn't moved the draft, and it's a normal draft (not follow-up),
            // auto-sync its position to current viewport center
            const currentTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;
            const viewportRect = canvasRef.current?.getCanvasRect() || null;
            const leftOffset = isSidebarOpen && !isMobile ? 260 : (isMobile ? 0 : 60);
            const rightOffset = isChatOpen && !isMobile ? 420 : 0;
            const liveCenter = getViewportPreferredPosition(currentTransform, viewportRect, 180, { left: leftOffset, right: rightOffset });

            // Only update position if it actually needs to move (avoid spam)
            const isPositionDifferent = Math.abs(node.position.x - liveCenter.x) > 1 || Math.abs(node.position.y - liveCenter.y) > 1;

            if (hasChanged || (shouldAutoCenter && isPositionDifferent)) {
              updatePromptNode({
                ...node,
                prompt: config.prompt,
                aspectRatio: config.aspectRatio,
                imageSize: config.imageSize,
                model: config.model,
                thinkingMode: config.thinkingMode || 'minimal',
                enableGrounding: !!config.enableGrounding,
                enableImageSearch: !!config.enableImageSearch,
                referenceImages: config.referenceImages,
                sourceImageId: activeSourceImage || undefined,
                mode: config.mode,
                position: shouldAutoCenter ? liveCenter : node.position
              });
            }
          }
        } else {
          setDraftNodeId(null);
        }
      }
    } else {
      // Config is empty
      if (draftNodeId) {
        const node = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
        if (node && !node.sourceImageId && !node.isGenerating) {
          deletePromptNode(draftNodeId);
          setDraftNodeId(null);
        }
      }
    }
  }, [config, draftNodeId, activeCanvas, addPromptNode, updatePromptNode, pendingPosition, activeSourceImage, isSidebarOpen, isChatOpen, canvasTransform]);

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
    selectNodes(ids, 'replace');
    setTimeout(() => {
      arrangeAllNodes();
    }, 100);
  }, [selectNodes, arrangeAllNodes]);

  // 🚀 Helper: Compute selection bounds center in screen coordinates
  const getSelectionScreenCenter = useCallback((nodeIds: string[]) => {
    if (!activeCanvas || nodeIds.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasNodes = false;

    // Check prompts
    activeCanvas.promptNodes
      .filter(n => nodeIds.includes(n.id))
      .forEach(n => {
        const w = 380;
        const h = n.height || 200;
        minX = Math.min(minX, n.position.x - w / 2);
        maxX = Math.max(maxX, n.position.x + w / 2);
        minY = Math.min(minY, n.position.y - h);
        maxY = Math.max(maxY, n.position.y);
        hasNodes = true;
      });

    // Check images
    activeCanvas.imageNodes
      .filter(n => nodeIds.includes(n.id))
      .forEach(n => {
        const { width, totalHeight } = getCardDimensions(n.aspectRatio, true);
        minX = Math.min(minX, n.position.x - width / 2);
        maxX = Math.max(maxX, n.position.x + width / 2);
        minY = Math.min(minY, n.position.y - totalHeight);
        maxY = Math.max(maxY, n.position.y);
        hasNodes = true;
      });

    if (!hasNodes) return null;

    // Convert canvas coords to screen coords
    const centerX = (minX + maxX) / 2;
    const topY = minY; // Use top of bounds for menu position (above selection)

    const screenX = centerX * canvasTransform.scale + canvasTransform.x;
    const screenY = topY * canvasTransform.scale + canvasTransform.y;

    return { x: screenX, y: screenY };
  }, [activeCanvas, canvasTransform, getCardDimensions]);

  // 🚀 定位卡组：优先定位选中卡组，无选中时定位最新
  const handleResetView = useCallback(() => {
    if (!activeCanvas) return;

    // 1. 如果有选中的节点，优先定位到选中的卡组
    if (selectedNodeIds.length > 0) {
      // 找到选中的提示词节点和图片节点
      const selectedPrompts = activeCanvas.promptNodes.filter(p => selectedNodeIds.includes(p.id));
      const selectedImages = activeCanvas.imageNodes.filter(img => selectedNodeIds.includes(img.id));

      // 计算选中节点的中心位置
      const allPositions = [
        ...selectedPrompts.map(p => p.position),
        ...selectedImages.map(img => img.position)
      ];

      if (allPositions.length > 0) {
        const avgX = allPositions.reduce((sum, pos) => sum + pos.x, 0) / allPositions.length;
        const avgY = allPositions.reduce((sum, pos) => sum + pos.y, 0) / allPositions.length;
        handleNavigateToNode(avgX, avgY);
        return;
      }
    }

    // 2. 无选中时，定位到最新生成的卡组
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
  }, [activeCanvas, handleNavigateToNode, selectedNodeIds]);

  // 处理拖入图片创建孤独副卡
  const handleImageDrop = useCallback(async (file: File, canvasPosition: { x: number; y: number }) => {
    if (!activeCanvas) return;

    try {
      // 读取图片
      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) return;

        // 获取图片尺寸
        const img = new Image();
        img.onload = async () => {
          const calc = await import('./utils/imageUtils');
          const storageId = await calc.calculateImageHash(dataUrl.split(',')[1]);

          // 保存到存储
          const storage = await import('./services/storage/imageStorage');
          await storage.saveImage(storageId, dataUrl).catch(err =>
            console.error("Failed to save dropped image", err)
          );

          // 计算宽高比
          const calcAspect = (w: number, h: number): AspectRatio => {
            const ratio = w / h;
            if (Math.abs(ratio - 1) < 0.1) return AspectRatio.SQUARE;
            if (ratio < 1) return AspectRatio.PORTRAIT_3_4;
            return AspectRatio.LANDSCAPE_4_3;
          };

          // 创建孤独副卡
          const newImage: GeneratedImage = {
            id: Date.now().toString(),
            storageId,
            url: dataUrl,
            prompt: `拖入图片: ${file.name}`,
            aspectRatio: calcAspect(img.width, img.height),
            timestamp: Date.now(),
            model: 'uploaded',
            canvasId: activeCanvas.id,
            parentPromptId: '', // 孤独卡片无父节点
            position: canvasPosition,
            dimensions: `${img.width}×${img.height}`,
            orphaned: true, // 标记为孤独卡片
            fileName: file.name,
            fileSize: file.size
          };

          addImageNodes([newImage]);

          // 通知用户
          import('./services/system/notificationService').then(({ notify }) => {
            notify.success('图片已添加', `${file.name} (${img.width}×${img.height})`);
          });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to process dropped image:', error);
      import('./services/system/notificationService').then(({ notify }) => {
        notify.error('图片处理失败', '请重试');
      });
    }
  }, [activeCanvas, addImageNodes]);



  // Handle keys logic (kept as is)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
        return;
      }

      // Delete selected nodes via keyboard (after box-select or multi-select)
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ids = selectedNodeIdsRef.current;
        if (ids.length > 0) {
          e.preventDefault();
          const canvas = activeCanvasRef.current;
          if (canvas) {
            const idSet = new Set(ids);
            const prompts = canvas.promptNodes.filter(n => idSet.has(n.id));
            const images = canvas.imageNodes.filter(n => idSet.has(n.id));
            prompts.forEach(n => deletePromptNode(n.id));
            images.forEach(n => deleteImageNode(n.id));
            clearSelection();
            setSelectionMenuPosition(null);
          }
          return;
        }
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
  }, [undo, redo, canUndo, canRedo, deletePromptNode, deleteImageNode, clearSelection]);

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
            error: "Cancelled by user",
            errorDetails: {
              code: 'CANCELLED',
              responseBody: 'Generation cancelled by user',
              model: node.model,
              timestamp: Date.now()
            }
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
            error: "Cancelled by user",
            errorDetails: {
              code: 'CANCELLED',
              responseBody: 'Generation cancelled by user',
              model: node.model,
              timestamp: Date.now()
            }
          });
        });
      }
      setIsGenerating(false);
    }
  }, [activeCanvas, updatePromptNode, cancelGeneration]);



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

  const inferAspectRatioFromDimensions = useCallback((w: number, h: number): AspectRatio => {
    if (!w || !h) return AspectRatio.SQUARE;
    const ratio = w / h;
    const targets: Array<{ ratio: AspectRatio; value: number }> = [
      { ratio: AspectRatio.SQUARE, value: 1 / 1 },
      { ratio: AspectRatio.PORTRAIT_3_4, value: 3 / 4 },
      { ratio: AspectRatio.PORTRAIT_4_5, value: 4 / 5 },
      { ratio: AspectRatio.PORTRAIT_9_16, value: 9 / 16 },
      { ratio: AspectRatio.PORTRAIT_9_21, value: 9 / 21 },
      { ratio: AspectRatio.PORTRAIT_2_3, value: 2 / 3 },
      { ratio: AspectRatio.LANDSCAPE_4_3, value: 4 / 3 },
      { ratio: AspectRatio.LANDSCAPE_5_4, value: 5 / 4 },
      { ratio: AspectRatio.LANDSCAPE_16_9, value: 16 / 9 },
      { ratio: AspectRatio.LANDSCAPE_21_9, value: 21 / 9 },
      { ratio: AspectRatio.LANDSCAPE_3_2, value: 3 / 2 }
    ];

    let best = targets[0];
    let minDiff = Infinity;
    targets.forEach(t => {
      const diff = Math.abs(t.value - ratio);
      if (diff < minDiff) {
        minDiff = diff;
        best = t;
      }
    });
    return best.ratio;
  }, []);

  const updateImageNodeDisplayMeta = useCallback((id: string, dimensions: string) => {
    const match = dimensions.match(/(\d+)\s*[xX]\s*(\d+)/);
    if (!match) {
      updateImageNodeDimensions(id, dimensions);
      return;
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) {
      updateImageNodeDimensions(id, dimensions);
      return;
    }

    const maxDim = Math.max(width, height);
    const effectiveSize = maxDim > 3000 ? ImageSize.SIZE_4K : maxDim > 1500 ? ImageSize.SIZE_2K : ImageSize.SIZE_1K;
    const inferredRatio = inferAspectRatioFromDimensions(width, height);

    updateImageNode(id, {
      dimensions,
      imageSize: effectiveSize,
      aspectRatio: inferredRatio,
      exactDimensions: { width, height }
    });
  }, [inferAspectRatioFromDimensions, updateImageNode, updateImageNodeDimensions]);

  const extractErrorDetails = useCallback((error: any, fallbackModel?: string) => {
    const details = {
      code: error?.code ? String(error.code) : undefined,
      status: typeof error?.status === 'number' ? error.status : (typeof error?.response?.status === 'number' ? error.response.status : undefined),
      requestBody: undefined as string | undefined,
      responseBody: undefined as string | undefined,
      provider: error?.provider ? String(error.provider) : undefined,
      model: fallbackModel,
      timestamp: Date.now()
    };

    if (error?.requestBody) {
      details.requestBody = typeof error.requestBody === 'string' ? error.requestBody : JSON.stringify(error.requestBody, null, 2);
    } else if (error?.request?.body) {
      details.requestBody = typeof error.request.body === 'string' ? error.request.body : JSON.stringify(error.request.body, null, 2);
    }

    if (error?.responseBody) {
      details.responseBody = typeof error.responseBody === 'string' ? error.responseBody : JSON.stringify(error.responseBody, null, 2);
    } else if (error?.response?.data) {
      details.responseBody = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data, null, 2);
    }

    if (error?.message && !details.responseBody) {
      details.responseBody = String(error.message);
    }

    if (!details.code && !details.status && !details.requestBody && !details.responseBody && !details.provider) {
      return undefined;
    }
    return details;
  }, []);

  const parsePptOutlineLine = useCallback((raw?: string) => {
    const text = String(raw || '').trim();
    if (!text) return { title: '', subtitle: '' };

    const splitBy = (token: string) => {
      const idx = text.indexOf(token);
      if (idx <= 0) return null;
      const title = text.slice(0, idx).trim();
      const subtitle = text.slice(idx + token.length).trim();
      return { title, subtitle };
    };

    const byColon = splitBy('：') || splitBy(':');
    if (byColon) return byColon;

    const byDash = splitBy(' - ') || splitBy(' — ') || splitBy(' – ');
    if (byDash) return byDash;

    return { title: text, subtitle: '' };
  }, []);

  const getNodeIoTrace = useCallback((nodeId: string) => {
    const node = activeCanvas?.promptNodes.find(n => n.id === nodeId);
    const inputStorageIds = (node?.referenceImages || []).map(ref => ref.storageId || ref.id).filter(Boolean) as string[];
    const outputStorageIds = (activeCanvas?.imageNodes || [])
      .filter(img => img.parentPromptId === nodeId)
      .map(img => img.storageId || img.id)
      .filter(Boolean) as string[];
    return { inputStorageIds, outputStorageIds };
  }, [activeCanvas]);

  const buildAutoPptSlides = useCallback((topicRaw: string, totalRaw: number) => {
    const topic = String(topicRaw || '').trim() || '主题演示';
    const total = Math.min(20, Math.max(1, Number(totalRaw) || 1));

    const basePool = [
      `背景与问题定义：${topic}`,
      `行业趋势与机会：${topic}`,
      `目标用户与核心场景：${topic}`,
      `解决方案概览：${topic}`,
      `核心能力与差异化：${topic}`,
      `关键数据与证据：${topic}`,
      `典型案例与应用示例：${topic}`,
      `落地路径与实施步骤：${topic}`,
      `风险评估与应对策略：${topic}`,
      `里程碑与路线图：${topic}`,
      `资源需求与协同机制：${topic}`,
      `预期收益与评估指标：${topic}`
    ];

    const pages: string[] = [];
    pages.push(`封面：${topic}`);

    if (total >= 3) {
      pages.push(`目录：${topic} 的核心章节`);
    }

    const remainForMiddle = Math.max(0, total - 1 - pages.length);
    for (let i = 0; i < remainForMiddle; i++) {
      pages.push(basePool[i % basePool.length]);
    }

    if (pages.length < total) {
      pages.push(`总结与行动建议：${topic}`);
    }

    return pages.slice(0, total);
  }, []);

  // Extracted Execution Logic
  const executeGeneration = useCallback(async (node: PromptNode) => {
    const { id: promptNodeId, prompt: promptToUse, parallelCount: count = 1, model: initialModel, mode, referenceImages: files = [] } = node;
    const generationPrompt = (node.promptOptimizationEnabled && node.optimizedPromptEn?.trim())
      ? node.optimizedPromptEn.trim()
      : promptToUse;
    let effectiveModel = initialModel;
    let successResults: GeneratedImage[] = [];

    // 🚀 [Critical Fix] Define finalPos at a higher scope to ensure Error cards also land at latest center
    let finalPos = node.position;

    // [FIX] Get fresh position from canvas state to support moving during generation
    // ✅ 使用ref获取最新状态,避免闭包问题
    const freshCanvas = activeCanvasRef.current;
    const liveNode = freshCanvas?.promptNodes.find(n => n.id === promptNodeId);

    // 🚀 [修复] 如果找不到节点，使用传入的 node 参数作为后备
    if (!liveNode) {
      console.warn('[executeGeneration] Node not found in canvas, using original node as fallback:', promptNodeId);
    }

    const isVideo = mode === GenerationMode.VIDEO;
    const isAudio = mode === GenerationMode.AUDIO;
    const isPpt = mode === GenerationMode.PPT;
    const effectiveSlideLines = isPpt
      ? ((node.pptSlides || []).map(line => String(line || '').trim()).filter(Boolean))
      : [];

    const buildPptPagePrompt = (basePrompt: string, index: number, total: number) => {
      const pageNo = index + 1;
      const getLayoutDirective = (text: string) => {
        const t = (text || '').toLowerCase();
        if (/封面|cover|title/.test(t)) return '采用封面版式：大标题+副标题+视觉主图，信息精简。';
        if (/目录|agenda|contents?/.test(t)) return '采用目录版式：清晰列出3-6个章节条目，层级分明。';
        if (/总结|结论|行动|summary|conclusion/.test(t)) return '采用总结版式：结论要点+行动建议，重点高亮。';
        if (/章节|section|transition/.test(t)) return '采用章节过渡页版式：章节标题突出，辅以关键关键词。';
        return '采用内容页版式：标题+3-5个信息块，层次清晰。';
      };
      const lockStyle = node.pptStyleLocked !== false;
      const styleDirective = lockStyle
        ? '与整套PPT保持完全统一的视觉语言（配色、字体、版式、插画风格一致）'
        : '保持基础统一但允许该页视觉变化';
      const slideLines = effectiveSlideLines.length > 0
        ? effectiveSlideLines
        : buildAutoPptSlides(basePrompt, total);
      if (slideLines.length > 0) {
        const picked = slideLines[Math.min(index, slideLines.length - 1)];
        return `PPT第${pageNo}页：${picked}。16:9 演示文稿风格，中文排版清晰，信息层次分明。${styleDirective}。${getLayoutDirective(picked)}`;
      }
      const lines = basePrompt
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*\d.)、\s]+/, '').trim())
        .filter(Boolean);

      if (lines.length >= total) {
        const picked = lines[Math.min(index, lines.length - 1)];
        return `PPT第${pageNo}页：${picked}。16:9 演示文稿风格，中文排版清晰，信息层次分明。${styleDirective}。${getLayoutDirective(picked)}`;
      }

      return `你正在设计同一套PPT。当前生成第${pageNo}/${total}页。主题：${basePrompt}。请输出与其他页面风格统一但内容不重复的一页，16:9，包含明确标题与结构化信息区块。${styleDirective}。采用内容页版式：标题+3-5个信息块，层次清晰。`;
    };

    // 🚀 [Safe State Tracking] Track success to prevent error overwrite

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
              error: '生成超时，请重新发送任务',
              errorDetails: {
                code: 'TIMEOUT',
                responseBody: 'Request exceeded 240000ms timeout in executeGeneration',
                model: node.model,
                timestamp: Date.now()
              }
            });
            import('./services/system/notificationService').then(({ notify }) => {
              notify.warning('生成超时', '已超过4分钟，任务已自动停止。请检查网络后重试。');
            });

            // 🚀 返还积分
            if (node.cost && node.cost > 0) {
              refundCredits(node.cost, `超时退款: ${node.id}`);
            } else if (node.provider !== 'Google') {
              refundCredits(1, `超时退款: ${node.id}`); // 默认退还1
            }
          }
        }, 240000);

        try {
          let generatedBase64 = '';
          let videoUrl = '';
          const taskPrompt = isPpt ? buildPptPagePrompt(generationPrompt, index, actualCount) : generationPrompt;
          let tokenUsage = 0;
          let costUsd = 0;
          let currentAspectRatio = node.aspectRatio;
          let currentSize = node.imageSize;
          let exactDimensions: { width: number; height: number } | undefined = undefined;
          let provider: string | undefined = undefined; // 🚀 Provider info
          let providerLabel: string | undefined = undefined; // 🚀 Provider display name
          let modelLabel: string | undefined = undefined; // 🚀 Model display name
          let keySlotId: string | undefined = node.keySlotId;
          let requestPath: string | undefined = undefined;
          let requestBodyPreview: string | undefined = undefined;
          let pythonSnippet: string | undefined = undefined;
          let apiDurationMs: number | undefined = undefined;

          if (isAudio) {
            // 🚀 音频生成路由
            const audioResult = await llmService.generateAudio({
              modelId: node.model,
              prompt: taskPrompt,
              audioDuration: node.audioDuration,
              audioLyrics: node.audioLyrics,
              preferredKeyId: node.keySlotId,
              providerConfig: {}
            });

            videoUrl = audioResult.url; // 复用 videoUrl 字段存储音频 URL
            generatedBase64 = '';
            tokenUsage = audioResult.usage?.totalTokens || 0;
            costUsd = audioResult.usage?.cost || 0.05;

            if (audioResult.provider) provider = audioResult.provider;
            if (audioResult.providerName) providerLabel = audioResult.providerName;
            if (audioResult.modelName) modelLabel = audioResult.modelName;
            if (audioResult.keySlotId) keySlotId = audioResult.keySlotId;

          } else if (isVideo) {
            const videoResolution = (() => {
              if (node.videoResolution) return node.videoResolution;
              const size = node.imageSize?.toLowerCase() || '';
              if (size.includes('4k') || size.includes('ultra')) return '4k';
              if (size.includes('1080') || size.includes('hd')) return '1080p';
              return '720p'; // 默认720p
            })();

            const videoAspect = node.aspectRatio === '9:16' ? '9:16' : '16:9';

            const videoResult = await llmService.generateVideo({
              modelId: node.model,
              prompt: taskPrompt,
              aspectRatio: videoAspect,
              imageUrl: files[0]?.data,
              imageTailUrl: files[1]?.data,
              videoDuration: node.videoDuration,
              preferredKeyId: node.keySlotId,
              providerConfig: {
                google: {
                  imageConfig: { imageSize: videoResolution }
                }
              },
              onTaskId: (taskId: string) => {
                console.log(`[executeGeneration] Received Video TaskID: ${taskId} for node ${promptNodeId}`);
                const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                if (fresh) updatePromptNode({ ...fresh, jobId: taskId });
              }
            });

            videoUrl = videoResult.url;
            generatedBase64 = ''; // 视频没有base64
            tokenUsage = videoResult.usage?.totalTokens || 0;
            costUsd = videoResult.usage?.cost || (effectiveModel.toLowerCase().includes('fast') ? 0.15 : 0.30);

            if (videoResult.provider) provider = videoResult.provider;
            if (videoResult.providerName) providerLabel = videoResult.providerName;
            if (videoResult.modelName) modelLabel = videoResult.modelName;
            if (videoResult.keySlotId) keySlotId = videoResult.keySlotId;

          } else {
            const result = await generateImage(
              taskPrompt,
              node.aspectRatio,
              node.imageSize,
              files,
              effectiveModel,
              '',
              currentRequestId,
              !!node.enableGrounding || !!node.enableImageSearch,
              {
                maskUrl: node.maskUrl,
                editMode: node.mode === GenerationMode.INPAINT ? 'inpaint' : (node.mode === GenerationMode.EDIT ? 'edit' : undefined),
                preferredKeyId: node.keySlotId,
                enableWebSearch: !!node.enableGrounding,
                enableImageSearch: !!node.enableImageSearch,
                thinkingMode: node.thinkingMode || 'minimal',
                onTaskId: (taskId) => {
                  console.log(`[executeGeneration] Received TaskID: ${taskId} for node ${promptNodeId}`);
                  const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                  if (fresh) updatePromptNode({ ...fresh, jobId: taskId });
                }
              }
            );
            generatedBase64 = result.url;
            tokenUsage = result.tokens || 0;
            costUsd = result.cost || 0;
            // 🚀 Update effective model and size from result if available
            if (result.model) effectiveModel = result.model;
            // Capture returned metadata
            if (result.imageSize) currentSize = result.imageSize;
            if (result.aspectRatio) currentAspectRatio = result.aspectRatio;
            // 🚀 Capture exact dimensions for AUTO mode
            if (result.dimensions) {
              exactDimensions = result.dimensions;
            }
            if (result.provider) provider = result.provider; // 🚀 Capture provider
            if (result.providerName) providerLabel = result.providerName;
            if (result.modelName) modelLabel = result.modelName;
            if (result.keySlotId) keySlotId = result.keySlotId;
            requestPath = result.requestPath;
            requestBodyPreview = result.requestBodyPreview;
            pythonSnippet = result.pythonSnippet;
            apiDurationMs = result.apiDurationMs;
          }

          isFinished = true;
          clearTimeout(timeoutId);

          const generationTime = (apiDurationMs && apiDurationMs > 0)
            ? apiDurationMs
            : (Date.now() - startTime);

          // 🚀 Latency Optimization: avoid blocking UI on remote image re-download
          let originalUrl = generatedBase64;
          let displayUrl = generatedBase64;
          const isRemoteGenerated = generatedBase64.startsWith('http');

          // Keep remote URL directly for first paint; persistence fallback is handled asynchronously.
          if (!isRemoteGenerated) {
            // Ensure data: URIs are also treated as original
            originalUrl = generatedBase64;
          }

          // Cloud Sync / Upload (后台执行，不阻塞返回)
          if (generatedBase64 && generatedBase64.startsWith('data:')) {
            // 后台上传到云端，但不影响本地显示
            import('./services/system/syncService').then(async ({ syncService }) => {
              try {
                const res = await fetch(generatedBase64);
                const blob = await res.blob();
                const id = `${Date.now()}_${index}`;
                await syncService.uploadImagePair(id, blob);
                // 云端上传成功后不更新本地状态，因为本地已有 base64
              } catch (e) {
                console.warn('Cloud upload failed (non-blocking):', e);
              }
            }).catch(() => { });
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
            cost: costUsd,
            effectiveModel,
            effectiveSize: currentSize,
            effectiveAspectRatio: currentAspectRatio,
            exactDimensions, // 🚀 Pass exact dimensions
            provider, // 🚀 Pass provider
            providerLabel: providerLabel, // 🚀 Pass Display Provider Name
            modelName: modelLabel, // 🚀 Pass Display Model Name
            keySlotId,
            taskPrompt,
            requestPath,
            requestBodyPreview,
            pythonSnippet
          };
        } catch (error: any) {
          isFinished = true;
          clearTimeout(timeoutId);
          console.error(`Generation ${index} failed:`, error);
          return {
            error: error.message || 'Unknown error',
            errorDetails: extractErrorDetails(error, node.model)
          };
        }
      };

      const requestedCount = Math.max(1, Number(count) || 1);
      const actualCount = isPpt ? Math.min(20, requestedCount) : requestedCount;
      const tasks = Array.from({ length: actualCount }).map((_, index) => buildTask(index));

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

      const imageData = await runWithConcurrency(tasks, actualCount);

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
        effectiveModel?: string; // 🚀 Pass through
        effectiveSize?: string; // 🚀 Pass through
        effectiveAspectRatio?: AspectRatio; // 🚀 Pass through
        exactDimensions?: { width: number; height: number }; // 🚀 Pass through
        provider?: string; // 🚀 Pass through
        providerLabel?: string; // 🚀 Pass through
        modelName?: string; // 🚀 Pass through
        keySlotId?: string;
        taskPrompt?: string;
        requestPath?: string;
        requestBodyPreview?: string;
        pythonSnippet?: string;
      }>;

      if (validImageData.length === 0) {
        const firstError = imageData.find(d => d && 'error' in d);
        const message = firstError && 'error' in firstError ? firstError.error : '所有图片生成失败';
        const enrichedError = new Error(message);
        (enrichedError as any).details = firstError && 'errorDetails' in firstError ? firstError.errorDetails : undefined;
        throw enrichedError;
      }

      // ✅ 生成完成后重新获取主卡最新位置 (支持生成过程中拖动)
      const finalCanvas = activeCanvasRef.current;
      const latestNode = finalCanvas?.promptNodes.find(n => n.id === promptNodeId);
      const effectiveNodeForPos = latestNode || node;

      // 🚀 [Critical Fix] 直接使用在 handleGenerate 确定的/被用户拖动后的真实位置。
      // 不再强制动态计算屏幕中心 (latestCenter)，防止用户在生成期间平移画布导致新卡片位置突变。
      finalPos = effectiveNodeForPos.position;

      console.log('[executeGeneration] Resolving Position (Final Sync):', {
        original: node.position,
        latestFromCanvas: latestNode?.position,
        finalUsed: finalPos,
      });

      // 🛡️ [Anti-Zero-Bug]
      if (finalPos.x === 0 && finalPos.y === 0 && (node.position.x !== 0 || node.position.y !== 0)) {
        console.warn('[App] Detected zero-position bug, falling back to original position', node.position);
        finalPos = node.position;
      }

      const effectiveNode = effectiveNodeForPos;

      if (!latestNode) {
        console.warn("Critical: PromptNode missing in activeCanvas after generation, using fallback node", promptNodeId);
        // We continue instead of returning, to ensure we at least show the result
      }
      // Use latestNode for all future updates instead of stale 'node' closure

      // 计算位置
      const gapToImages = 80; // 主卡和副卡之间的距离
      const gap = 20; // 副卡之间的间距
      const { width: cardWidth, totalHeight: cardHeight } = getCardDimensions(node.aspectRatio, true);

      // 🚀 [Safe State Tracking] Inner block
      try {
        const results = validImageData.map((item, mapIndex) => {
          // ... (Mapping Logic) ...
          // 使用 mapIndex 作为后备，因为 item.index 已在 filter 中验证
          const idx = item.index ?? mapIndex;
          const {
            url, originalUrl, generationTime, base64, mode: itemMode, tokens, cost,
            effectiveModel: resModel, effectiveSize: resSize, effectiveAspectRatio: resRatio,
            exactDimensions, provider, providerLabel: itemProviderLabel, modelName, taskPrompt: itemTaskPrompt
            , keySlotId, requestPath, requestBodyPreview, pythonSnippet
          } = item;

          // 🚀 Use result model/size if available, otherwise fallback
          const finalModel = resModel || effectiveModel;
          const finalSize = resSize || node.imageSize;
          const finalAspectRatio = resRatio || node.aspectRatio;
          let x, y;

          // ✅ 统一布局: 固定2列,使用和PendingNode相同的计算公式
          const columns = 2; // 固定2列
          const col = idx % columns;
          const row = Math.floor(idx / columns);


          // 计算当前行实际有多少张卡片
          const totalCards = validImageData.length;
          const cardsInCurrentRow = Math.min(columns, totalCards - row * columns);

          if (isPpt) {
            const pptGap = 28;
            const offsetY = gapToImages + cardHeight + idx * (cardHeight + pptGap);
            x = finalPos.x;
            y = finalPos.y + offsetY;
          } else if (isMobile) {
            const mobileCardWidth = 170;
            const mobileCardHeight = 260;
            const mobileGap = 10;
            // 居中计算:先算出当前行的总宽度,然后居中对齐
            const rowWidth = cardsInCurrentRow * mobileCardWidth + (cardsInCurrentRow - 1) * mobileGap;
            const startX = -rowWidth / 2; // 相对主卡中心的起始位置
            const offsetX = startX + col * (mobileCardWidth + mobileGap) + mobileCardWidth / 2;
            const offsetY = gapToImages + mobileCardHeight + row * (mobileCardHeight + mobileGap);
            x = finalPos.x + offsetX; // Use FINAL calibrated position
            y = finalPos.y + offsetY;
          } else {
            // 居中计算:先算出当前行的总宽度,然后居中对齐
            const rowWidth = cardsInCurrentRow * cardWidth + (cardsInCurrentRow - 1) * gap;
            const startX = -rowWidth / 2; // 相对主卡中心的起始位置
            const offsetX = startX + col * (cardWidth + gap) + cardWidth / 2;
            const offsetY = gapToImages + cardHeight + row * (cardHeight + gap);
            x = finalPos.x + offsetX; // Use FINAL calibrated position
            y = finalPos.y + offsetY;
          }

          const uniqueId = Date.now().toString() + idx + Math.random();
          if (base64) {
            saveOriginalImage(uniqueId, base64, itemMode === GenerationMode.VIDEO)
              .catch(err => {
                console.error("Failed to persist original locally", err);
                saveImage(uniqueId, base64).catch(e2 => console.error("Fallback cache also failed", e2));
              });
          }

          return {
            id: uniqueId,
            storageId: uniqueId, // 🚀 确保 storageId 被设置，用于持久化恢复
            url,
            originalUrl,
            prompt: itemTaskPrompt || node.originalPrompt || promptToUse,
            aspectRatio: finalAspectRatio, // 🚀 Use resolved ratio
            imageSize: finalSize, // Add imageSize field
            timestamp: Date.now(),
            model: finalModel,
            modelLabel: modelName || (() => {
              const m = finalModel.toLowerCase();
              if (m.includes('gemini-3-pro')) return 'Gemini 3 Pro Image';
              if (m.includes('gemini-2.5-flash-image')) return 'Gemini 2.5 Flash Image';
              if (m.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
              if (m.includes('gemini-2.5-pro')) return 'Gemini 2.5 Pro';
              if (m.includes('imagen-4') && m.includes('ultra')) return 'Imagen 4 Ultra';
              if (m.includes('imagen-4') && m.includes('fast')) return 'Imagen 4 Fast';
              if (m.includes('imagen-4')) return 'Imagen 4';
              if (m.includes('veo-3.1') && m.includes('fast')) return 'Veo 3.1 Fast';
              if (m.includes('veo-3.1')) return 'Veo 3.1';
              if (m.includes('veo-3') && m.includes('fast')) return 'Veo 3 Fast';
              if (m.includes('veo-3')) return 'Veo 3';
              if (m.includes('veo')) return 'Veo 2';
              return effectiveModel;
            })(),
            provider: provider,
            providerLabel: itemProviderLabel || provider, // ✨ Use custom name if available, else provider ID
            keySlotId,
            sourceReferenceStorageIds: (files || []).map(ref => ref.storageId || ref.id).filter(Boolean),
            requestPath,
            requestBodyPreview,
            pythonSnippet,
            alias: isPpt ? `图${idx + 1}` : undefined,
            mode: itemMode,
            canvasId: activeCanvasRef.current?.id || 'default',
            parentPromptId: promptNodeId,
            position: { x, y },
            dimensions: isVideo
              ? `${finalAspectRatio} · 720p`
              : `${finalAspectRatio} · ${finalSize || '1K'}`,
            generationTime,
            tokens,
            cost,
            exactDimensions,
            promptOptimizerResult: node.promptOptimizerResult, // 🚀 全链路同步编译器结果
            optimizedPromptEn: node.optimizedPromptEn, // 🚀 同步优化后的英文
            optimizedPromptZh: node.optimizedPromptZh  // 🚀 同步优化后的中文
          } as GeneratedImage;
        });

        successResults = results; // ✅ Mark as safe
      } catch (mapErr) {
        console.error("Result Mapping Failed", mapErr);
        throw mapErr;
      }

      const updatedNode = {
        ...effectiveNode, // 🚀 Use effectiveNode (latest or fallback)
        position: finalPos,
        isGenerating: false,
        childImageIds: successResults.map(r => r.id), // Use successResults
        keySlotId: successResults[0]?.keySlotId || effectiveNode.keySlotId,
        isDraft: false,
      };

      rememberPreferredKeyForMode(updatedNode.mode, updatedNode.keySlotId);

      // 🚀 [Critical Fix] Execute updates in sequence/batch to prevent state overwrite race conditions
      // 先清理旧子卡，避免并发/重入导致同一主卡出现重复副卡
      const oldChildIds = (effectiveNode.childImageIds || []).filter(id => !successResults.some(r => r.id === id));
      oldChildIds.forEach(id => deleteImageNode(id));

      updatePromptNode(updatedNode);
      addImageNodes(successResults);

      // 🚀 [Critical Fix] 强制立即持久化：由于状态更新和200ms防抖存在窗口期，如果用户此时刷新
      // localStorage里尚未记录子图且 isGenerating 还是 true。在此做紧急快照修补
      setTimeout(() => {
        try {
          const stored = localStorage.getItem('kk_studio_canvas_state');
          if (stored) {
            const state = JSON.parse(stored);
            const activeC = state.canvases.find((c: any) => c.id === state.activeCanvasId);
            if (activeC) {
              const pn = activeC.promptNodes.find((n: any) => n.id === updatedNode.id);
              if (pn) {
                pn.isGenerating = false;
                pn.childImageIds = updatedNode.childImageIds;
                localStorage.setItem('kk_studio_canvas_state', JSON.stringify(state));
              }
            }
          }
        } catch (e) { }
      }, 50);

      import('./services/billing/costService').then(({ recordCost }) => {
        const usedModel = successResults[0]?.model || effectiveModel;
        const usedSize = successResults[0]?.imageSize || effectiveNode.imageSize;
        const firstDebug = validImageData[0];

        recordCost(
          usedModel,
          usedSize,
          successResults.length,
          generationPrompt,
          files.length,
          undefined,
          {
            requestPath: firstDebug?.requestPath,
            requestBodyPreview: firstDebug?.requestBodyPreview,
            pythonSnippet: firstDebug?.pythonSnippet
          }
        );
      });

      // Clear active source if it was this node (simple check)
      if (activeSourceImage && activeSourceImage === effectiveNode.sourceImageId) {
        setActiveSourceImage(null);
      }

    } catch (err: any) {
      console.error('[executeGeneration] Error:', err);

      // 🚀 [Safe Fault Tolerance] If we generated images but failed later (e.g. Cost Service / UI Update),
      // DO NOT mark the node as failed. Just log it and ensure it's not "Generating".
      if (successResults.length > 0) {
        console.warn('[executeGeneration] Partial Success - Images generated but post-processing failed. Ignoring error state.');
        // Force "Done" state without error
        const currentCanvas = activeCanvasRef.current;
        const currentNode = currentCanvas?.promptNodes.find(n => n.id === node.id) || node;
        updatePromptNode({
          ...currentNode,
          isGenerating: false,
          // Do NOT set error.
        });
        return; // 🚀 Exit without showing error notification
      }

      // 🚀 [竞态检测] 获取节点最新实时状态，检查是否已被 pollTaskStatus 标记为成功
      const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
      const hasImagesOnFreshNode = freshNode && (freshNode.childImageIds?.length || 0) > 0;
      const isNoLongerGenerating = freshNode && !freshNode.isGenerating;

      if (hasImagesOnFreshNode || isNoLongerGenerating) {
        console.warn('[executeGeneration] 发现竞态冲突：原始连接超时报错，但节点已通过轮询成功完成。放弃显示失败状态。', {
          nodeId: node.id,
          hasImages: hasImagesOnFreshNode,
          isGenerating: freshNode?.isGenerating
        });
        return; // 💥 直接退出，不更新错误状态
      }

      // 🚀 [修复] 确保错误卡片始终显示在当前最新的 finalPos 上
      const viewportRect = canvasRef.current?.getCanvasRect() || null;
      const viewportOffsets = getViewportOffsets(isSidebarOpen, isChatOpen, isMobile, chatSidebarWidth);
      const latestCenter = getLiveViewportCenter(canvasTransform, viewportRect, viewportOffsets);
      const errorPos = (liveNode?.userMoved) ? liveNode.position : latestCenter;

      const currentCanvasForError = activeCanvasRef.current;
      const currentNode = currentCanvasForError?.promptNodes.find(n => n.id === node.id) || node;

      // 🚀 [Fix] 判断是否需要退费
      // 条件：已扣费（cost > 0 且 isPaymentProcessed）或使用积分模型
      const isCreditModelForError = node.model.includes('@system') || node.model.includes('@google') || isCreditBasedModel(node.model);
      // 🚀 [关键修复] 放宽退费条件 - 只要有记录的 cost > 0 就尝试退费
      const shouldRefund = (node.cost && node.cost > 0 && isCreditModelForError);

      const errorNode = {
        ...currentNode,
        position: errorPos, // 🚀 Use latest center even on error!
        isGenerating: false,
        error: err.message || 'Failed',
        errorDetails: (err as any)?.details || extractErrorDetails(err, currentNode.model),
        // 🚀 [修复] 使用 as const 修复类型错误
        refundStatus: shouldRefund ? 'pending' as const : undefined
      };
      const existsInCanvas = currentCanvasForError?.promptNodes.some((n: any) => n.id === node.id);

      // 🚀 [Refund Credits Fix] 退还此节点消耗的积分
      const hasCustomUserKey = keyManager.hasCustomKeyForModel(node.model);
      const isCreditModel = isCreditBasedModel(node.model, undefined, undefined, hasCustomUserKey);
      let refundPromise: Promise<boolean> = Promise.resolve(false);
      // 🚀 [修复] 放宽退费条件 - 只要是积分模型且有消费记录就退费
      const shouldTryRefund = isCreditModel && (node.cost && node.cost > 0);
      if (shouldTryRefund) {
        const costToRefund = node.cost || (node.mode === GenerationMode.PPT ? (node.childImageIds?.length || 1) : (node.parallelCount || 1));
        refundPromise = refundCredits(costToRefund, `生成失败退回: ${node.model} (${node.id})`);
        refundPromise
          .then(success => {
            if (success) {
              console.log(`[executeGeneration] 退回积分成功: ${costToRefund}`);
              // 🚀 更新节点状态为"积分已退回"
              const updatedNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
              if (updatedNode) {
                updatePromptNode({ ...updatedNode, refundStatus: 'success' as const });
              }
            } else {
              const updatedNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
              if (updatedNode) {
                updatePromptNode({ ...updatedNode, refundStatus: 'failed' as const });
              }
            }
          })
          .catch(e => {
            console.error('[executeGeneration] 退回积分异常:', e);
            const updatedNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
            if (updatedNode) {
              updatePromptNode({ ...updatedNode, refundStatus: 'failed' as const });
            }
          });
      }
      // 🚀 [Fix] 只更新已存在的节点，不再添加新节点避免重复
      if (existsInCanvas) {
        updatePromptNode(errorNode);
      } else {
        console.warn('[executeGeneration] Error node not found in canvas, skipping update:', node.id);
      }

      // 🚀 [Fix] 等待退费完成后显示提示，告知用户积分已退回
      refundPromise.then((refundSuccess) => {
        import('./services/system/notificationService').then(({ notify }) => {
          // 🚀 过滤掉模型不支持参考图的错误提示，不显示给用户
          if (err.message && err.message.includes('does not support image input')) {
            return;
          }
          // 🚀 [Fix] 只有 @system 后缀的积分模型才显示"积分已退回"
          const isCredit = node.model?.toLowerCase().endsWith('@system') || isCreditModel;
          const refundMsg = (isCredit && refundSuccess) ? '，积分已退回' : '';
          notify.error('生成失败' + refundMsg, err.message || "Generation failed.");
        });
      });
      if (err.message && (err.message.includes("API Key") || err.message.includes("403"))) {
        setShowSettingsPanel(true);
        setSettingsInitialView('api-management');
      }
    }
  }, [isMobile, updatePromptNode, addPromptNode, addImageNodes, activeCanvas, activeSourceImage, getCardDimensions, extractErrorDetails, buildAutoPptSlides, rememberPreferredKeyForMode]);

  // [New] Poll for task status
  const pollTaskStatus = useCallback(async (node: PromptNode) => {
    if (!node.jobId) return;

    console.log(`[Auto-Resume] Polling task status for node ${node.id}, jobId: ${node.jobId}`);

    try {
      // Create a temporary "pending" state visualization if needed, 
      // but usually the node is already in isGenerating state.

      const result = await llmService.checkTaskStatus(node.jobId, node.mode || GenerationMode.IMAGE, node.keySlotId ? { id: node.keySlotId } as any : undefined);

      if (result && 'status' in result && (result.status === 'success' || result.status === 'failed')) {
        // We got a final result! 
        // We can't easily "inject" this back into executeGeneration without refactoring, 
        // so we'll handle the insertion here or trigger a simplified success flow.

        if (result.status === 'success') {
          console.log(`[Auto-Resume] Task success for node ${node.id}`);
          // Handle result insertion... 
          // (Simplified: just call executeGeneration to let it handle the full flow 
          // if we can't easily mock the success)
          // Actually, if it's already success, checkTaskStatus should return the URLs.

          // For now, if it's finished, let's just let executeGeneration handles it if possible, 
          // or we just call addImageNodes here.

          // If result has urls/url, we can finish it.
          const imageUrls = (result as any).urls || [(result as any).url].filter(Boolean);
          if (imageUrls.length > 0) {
            addImageNodes(imageUrls.map((url: string) => ({
              url,
              prompt: node.prompt,
              model: node.model,
              aspectRatio: node.aspectRatio,
              imageSize: node.imageSize
            })));
            updatePromptNode({ ...node, isGenerating: false });
            return;
          }
        } else {
          // Failed
          updatePromptNode({ ...node, isGenerating: false, error: '生成任务在后端执行失败' });
          return;
        }
      }

      // If still pending, poll again in 10s
      setTimeout(() => {
        // Refresh node from state to check if it's still generating
        const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
        if (freshNode && freshNode.isGenerating) {
          pollTaskStatus(freshNode);
        }
      }, 10000);

    } catch (err: any) {
      console.error(`[Auto-Resume] Polling failed for node ${node.id}:`, err);
      // Fallback: restart generation if polling fails
      setTimeout(() => executeGeneration(node), 1000);
    }
  }, [llmService, updatePromptNode, addImageNodes, executeGeneration]);

  // Auto-Resume Effect
  const hasResumedRef = useRef(false);
  useEffect(() => {
    // Wait for canvas to be ready and loaded
    if (!activeCanvas || hasResumedRef.current || !isReady) return;

    const interruptedNodes = activeCanvas.promptNodes.filter(n => n.isGenerating);
    if (interruptedNodes.length > 0) {
      console.log(`[Auto-Resume] Found ${interruptedNodes.length} interrupted tasks. Resuming...`);
      interruptedNodes.forEach(node => {
        if (node.jobId) {
          // Delay to ensure services are ready
          setTimeout(() => pollTaskStatus(node), 1000);
        } else {
          // Restart normally
          setTimeout(() => executeGeneration(node), 1500);
        }
      });
      import('./services/system/notificationService').then(({ notify }) => {
        notify.info('任务自动恢复', `已恢复 ${interruptedNodes.length} 个未完成的生成任务`);
      });
    }
    hasResumedRef.current = true;
  }, [activeCanvas, isReady, executeGeneration, pollTaskStatus]);


  const handleGenerate = useCallback(async () => {
    if (generateLockRef.current) {
      console.warn('[handleGenerate] blocked duplicate trigger');
      return;
    }
    if (!config.prompt.trim()) return;

    // 🚀 [真实计费拦截与扣除]
    // 首先判断是否为系统按积分计费的模型（自己添加的第三方渠道模型或明确带有 @ 后缀的调用不走积分流程）
    const provider = config.model.includes('@') ? config.model.split('@')[1] : undefined;
    const customLocal = (() => {
      try {
        return JSON.parse(localStorage.getItem('kk_model_customizations') || '{}')[config.model] || {};
      } catch { return {}; }
    })();

    const hasCustomUserKey = keyManager.hasCustomKeyForModel(config.model);
    const isCreditModel = isCreditBasedModel(
      config.model,
      provider,
      customLocal.alias,
      hasCustomUserKey
    );

    console.log('[handleGenerate] 计费检查:', {
      model: config.model,
      provider,
      hasCustomUserKey,
      isCreditModel,
      mode: config.mode
    });

    let requiredCredits = 0;
    if (isCreditModel) {
      const perImageCost = getModelCredits(config.model);
      if (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) {
        requiredCredits = (config.parallelCount || 1) * perImageCost;
      } else {
        requiredCredits = perImageCost || 1;
      }

      // 如果需要扣费，调用 Supabase RPC 扣除 
      if (requiredCredits > 0) {
        console.log('[handleGenerate] 准备扣费:', { model: config.model, requiredCredits });
        // 🚀 [修复] 确保在扣费前记录消耗预估，以便 executeGeneration 失败时能退款
        // @ts-ignore
        const isPaymentSuccess = await consumeCredits(config.model, requiredCredits);
        console.log('[handleGenerate] 扣费结果:', { isPaymentSuccess });
        if (!isPaymentSuccess) {
          import('./services/system/notificationService').then(({ notify }) => {
            notify.error('生成失败', '您的账户余额不足，请先充值积分。');
          });
          setShowRechargeModal(true); // 自动弹出充值入口
          return;
        }
      }
    }

    generateLockRef.current = true;
    setIsGenerating(true);
    try {

      // 4. Calculate Position
      // 普通模式应使用当前视口中心；追问模式保留原有草稿定位逻辑
      const isFollowUp = !!activeSourceImage;
      const currentTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;
      const viewportRect = canvasRef.current?.getCanvasRect() || null;
      const viewportOffsets = getViewportOffsets(isSidebarOpen, isChatOpen, isMobile);
      const liveCenter = getLiveViewportCenter(currentTransform, viewportRect, viewportOffsets);
      const realViewCenter = liveCenter;
      let viewCenter = { ...liveCenter };
      let currentPos = { ...viewCenter };

      // [Draft Logic] Use existing draft only for follow-up mode.
      // Normal mode must always lock to the current viewport center.
      const canvasNow = activeCanvasRef.current;
      let promptNodeId = draftNodeId;
      let isReusingDraft = false;

      if (!isFollowUp) {
        promptNodeId = `node_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        currentPos = { ...liveCenter };
        isReusingDraft = false;
        console.log('[handleGenerate] Normal mode - locked to current viewport center:', currentPos);
      } else if (promptNodeId) {
        // We have a draft. Use it.
        const draft = canvasNow?.promptNodes.find(n => n.id === promptNodeId);
        if (draft) {
          isReusingDraft = true;
          currentPos = draft.position;

          // 🚀 [Smart Re-centering Fix]
          // If the draft is an auto-center draft (not moved by user), FORCE it to stay at the REAL center
          // during the final generation calculation, even if the canvas was panned just now.
          const shouldAutoCenter = !draft.userMoved && !draft.sourceImageId && !draft.isGenerating;

          if (shouldAutoCenter) {
            console.log('[handleGenerate] Auto-centering draft to latest viewCenter for precise placement');
            currentPos = { ...viewCenter };
          } else {
            // 🚀 [Auto-Center Fallback] If draft is off-screen, snap it to current view center
            // This fixes the issue where users pan away from a draft and then generate, causing the result to be "lost"
            // 🚀 使用实时 transform（包括拖动中的位置）
            const currentTransformForVisibility = canvasRef.current?.getCurrentTransform() || canvasTransform;
            const vLeft = -currentTransformForVisibility.x / currentTransformForVisibility.scale;
            const vTop = -currentTransformForVisibility.y / currentTransformForVisibility.scale;
            const vWidth = window.innerWidth / currentTransformForVisibility.scale;
            const vHeight = window.innerHeight / currentTransformForVisibility.scale;

            // Margin of error (e.g. 100px)
            const margin = 100;
            const isVisible =
              currentPos.x >= vLeft - margin &&
              currentPos.x <= vLeft + vWidth + margin &&
              currentPos.y >= vTop - margin &&
              currentPos.y <= vTop + vHeight + margin;

            if (!isVisible) {
              console.warn('[handleGenerate] Draft is off-screen, moving to center:', {
                currentPos,
                viewCenter,
                viewport: { vLeft, vRight: vLeft + vWidth, vTop, vBottom: vTop + vHeight }
              });
              currentPos = { ...viewCenter };
            } else {
              console.log('[handleGenerate] Reusing draft at position (Visible):', currentPos);
            }
          }

          // 🚀 [Collision Check] Ensure draft doesn't overlap others
          const freshCanvas = activeCanvasRef.current; // Use Ref for fresh state
          const now = Date.now();

          // [Rapid-Fire] Prune old reserved regions (>3s)
          reservedRegionsRef.current = reservedRegionsRef.current.filter(r => now - r.timestamp < 3000);

          const otherNodes = [
            ...(freshCanvas?.promptNodes || [])
              .filter(n => n.id !== draft.id)
              .map(n => ({ x: n.position.x, y: n.position.y, width: n.width || 380, height: n.height || 200 })),
            ...(freshCanvas?.imageNodes || []).map(n => {
              const { width, totalHeight } = getCardDimensions(n.aspectRatio, true);
              return { x: n.position.x, y: n.position.y, width, height: totalHeight };
            }),
            ...(reservedRegionsRef.current || []).map(r => ({ x: r.bounds.x, y: r.bounds.y, width: r.bounds.width, height: r.bounds.height }))
          ];

          // 🚀 [Fix] If reusing a draft (user placed), Respect its position! 
          // Only use safe-find for completely new/automatic generations.
          let safePos = currentPos;
          if (!isReusingDraft) {
            safePos = findSafePosition(currentPos, otherNodes);
          } else {
            // Ensure we are snapping to integer coordinates for sharpness
            safePos = { x: Math.round(currentPos.x), y: Math.round(currentPos.y) };
          }

          // 🚀 Always reserve the FINAL position (whether shifted or not)
          reservedRegionsRef.current.push({
            timestamp: now,
            bounds: { x: safePos.x, y: safePos.y, width: 380, height: 200 }
          });

          if (safePos.x !== currentPos.x || safePos.y !== currentPos.y) {
            console.log('[handleGenerate] Draft collision detected, shifting to:', safePos);
            // 💡 Persist the shift to canvas state so it doesn't "jump back" or collide with next card
            updatePromptNode({ ...draft, position: safePos });
            currentPos = safePos;
          }
        } else {
          // Draft ID stale?
          promptNodeId = `node_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
          console.log('[handleGenerate] Creating new node at view center (Stale ID):', currentPos);
        }
      } else {
        // Follow-up mode but no draft id: create a new node at computed center/path
        promptNodeId = `node_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        console.log('[handleGenerate] Follow-up mode without draft, using computed center:', currentPos);
      }

      // setDraftNodeId(null); // Moved to end to prevent flicker

      // Legacy calculation reference, but we used currentPos above.
      const promptHeight = getPromptHeight(config.prompt);

      // [CRITICAL FIX] Hydrate reference images before sending
      // When dragging from ImageCard, data might be empty (only storageId is passed)
      const { getImage } = await import('./services/storage/imageStorage');
      const { fileSystemService } = await import('./services/storage/fileSystemService');
      const globalHandle = fileSystemService.getGlobalHandle();

      let finalReferenceImages = await Promise.all(
        config.referenceImages.map(async (img) => {
          // If data is missing but storageId exists, try to load from IDB first
          if (!img.data && img.storageId) {
            try {
              const dataUrl = await getImage(img.storageId);
              if (dataUrl) {
                // Extract base64 from data URL
                const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
                if (matches && matches[2]) {
                  return {
                    ...img,
                    data: matches[2],
                    mimeType: matches[1] || img.mimeType || 'image/png'
                  };
                }
                // If not standard data URL format, use as-is
                return { ...img, data: dataUrl };
              }
            } catch (e) {
              console.warn('[handleGenerate] Failed to load from IDB:', img.id, e);
            }

            // If IDB failed, try to load from local file system (refs/ directory)
            if (globalHandle) {
              try {
                const base64Data = await fileSystemService.loadReferenceImage(globalHandle, img.storageId);
                if (base64Data) {
                  console.log('[handleGenerate] Loaded ref image from local file system:', img.storageId);
                  return {
                    ...img,
                    data: base64Data,
                    mimeType: 'image/jpeg' // refs/ 目录中的图片都是 JPEG
                  };
                }
              } catch (e) {
                console.warn('[handleGenerate] Failed to load from local file system:', img.storageId, e);
              }
            }
          }
          return img;
        })
      );

      // Filter out images that still don't have data
      finalReferenceImages = finalReferenceImages.filter(img => img.data);

      if (activeSourceImage) {
        const sourceImage = activeCanvasRef.current?.imageNodes.find(img => img.id === activeSourceImage);
        // [FIX] Prefer originalUrl (High Res) over url (Thumbnail) to prevent blurry reference images
        const targetUrl = sourceImage?.originalUrl || sourceImage?.url;

        if (sourceImage && targetUrl) {
          try {
            const response = await fetch(targetUrl);
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
          import('./services/storage/imageStorage').then(({ saveImage }) => {
            // IMPORTANT: store as full DataURL so CanvasContext can rehydrate mimeType/base64 reliably
            const mime = (ref as any).mimeType || 'image/png';
            const fullUrl = ref.data!.startsWith('data:') ? ref.data! : `data:${mime};base64,${ref.data!}`;
            saveImage(ref.id, fullUrl).catch(e => console.warn('Ref save failed', e));
          });
        }
      });

      // 🚀 Final hard-guard: in normal mode, always lock to CURRENT viewport center at click-time
      // This prevents any stale draft/canvas closure from pulling position back to initial canvas.
      if (!isFollowUp) {
        const latestTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;
        const latestViewportRect = canvasRef.current?.getCanvasRect() || null;
        const latestOffsets = getViewportOffsets(isSidebarOpen, isChatOpen, isMobile, chatSidebarWidth);
        currentPos = getLiveViewportCenter(latestTransform, latestViewportRect, latestOffsets);
        console.log('[handleGenerate] Final position hard-guard (normal mode):', currentPos);
      }

      const isNewAnim = true; // 🚀 Always set for standard generation

      const rawPrompt = config.prompt.trim();
      let optimizedPromptEn: string | undefined;
      let optimizedPromptZh: string | undefined;
      let promptOptimizerResult: any | undefined; // 🚀 [New] 提示词编译器结果

      if ((config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) && config.enablePromptOptimization && rawPrompt) {
        try {
          const optimized = await optimizePromptForImage(rawPrompt, {
            preferredModelId: config.model,
            aspectRatio: config.aspectRatio,
            mode: config.mode,
            referenceImages: finalReferenceImages
              .filter(ref => ref.data)
              .map(ref => {
                const mime = (ref as any).mimeType || 'image/png';
                let base64Data = ref.data!;
                if (base64Data.startsWith('data:')) {
                  const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
                  if (match) {
                    base64Data = match[2];
                  }
                }
                return { mimeType: mime, data: base64Data };
              })
          });
          optimizedPromptEn = optimized.optimizedEn;
          optimizedPromptZh = optimized.optimizedZh;
          promptOptimizerResult = optimized.fullResult; // 🚀 捕获完整编译器结果
        } catch (e: any) {
          console.warn('[handleGenerate] Prompt optimization failed, fallback to raw prompt:', e);
          import('./services/system/notificationService').then(({ notify }) => {
            notify.error('提示词优化失败', '无法调用对话模型，已自动降级为原始提示词: ' + (e.message || ''));
          });
        }
      }

      const baseModelIdForPreview = config.model.split('@')[0];
      const modelSuffixForPreview = config.model.split('@')[1];
      const previewModelLabel = getModelMetadata(baseModelIdForPreview)?.name || baseModelIdForPreview;
      const selectedKey = keyManager.getNextKey(config.model, getPreferredKeyForMode(config.mode));
      const previewProvider = selectedKey?.provider || (modelSuffixForPreview ? 'Custom' : 'Google');
      const previewProviderLabel = selectedKey?.name || modelSuffixForPreview || 'Google';
      const pptCount = config.mode === GenerationMode.PPT
        ? Math.min(20, Math.max(1, config.parallelCount || 1))
        : Math.min(4, Math.max(1, config.parallelCount || 1));
      const normalizedSlides = (config.pptSlides || []).map(s => String(s || '').trim()).filter(Boolean);
      const effectivePptSlides = config.mode === GenerationMode.PPT
        ? (normalizedSlides.length > 0 ? normalizedSlides.slice(0, pptCount) : buildAutoPptSlides(rawPrompt, pptCount))
        : [];

      const generatingNode: PromptNode = {
        id: promptNodeId!,
        prompt: rawPrompt,
        originalPrompt: rawPrompt,
        optimizedPromptEn,
        optimizedPromptZh,
        promptOptimizerResult, // 🚀 [New] 存储编译器结果
        promptOptimizationEnabled: !!(config.enablePromptOptimization && (optimizedPromptEn || promptOptimizerResult)),
        position: currentPos,
        aspectRatio: config.aspectRatio,
        imageSize: config.imageSize,
        model: config.model,
        modelLabel: previewModelLabel,
        thinkingMode: config.thinkingMode || 'minimal',
        enableGrounding: !!config.enableGrounding,
        enableImageSearch: !!config.enableImageSearch,
        provider: previewProvider,
        providerLabel: previewProviderLabel,
        keySlotId: selectedKey?.id,
        childImageIds: [],
        referenceImages: finalReferenceImages,
        timestamp: Date.now(),
        isGenerating: true,
        isNew: isNewAnim, // 🚀 启用动画标记
        parallelCount: pptCount,
        sourceImageId: activeSourceImage || undefined,
        mode: config.mode,
        isDraft: false, // Ensure it is NOT a draft anymore
        videoResolution: config.videoResolution,
        videoDuration: config.videoDuration,
        videoAudio: config.videoAudio,
        pptSlides: effectivePptSlides,
        pptStyleLocked: config.pptStyleLocked !== false,
        cost: requiredCredits, // 🚀 [Fix] 明确记录本次消耗的积分，用于失败退回
        isPaymentProcessed: requiredCredits > 0, // Mark that payment was successfully deducted
      };

      // 🚀 [Fix Duplicate Placeholders]
      // Always check if the ID we are about to add/update actually exists on canvas
      // If not, revert to add. If yes, update.
      const canvasForWrite = activeCanvasRef.current;
      const existingNode = canvasForWrite?.promptNodes.find(n => n.id === generatingNode.id);

      if (existingNode) {
        console.log('[handleGenerate] Updating existing node:', generatingNode.id);
        await updatePromptNode(generatingNode);
      } else {
        // Safety: Check if ANY draft exists that we might have missed (stale closure)
        const strayDraft = canvasForWrite?.promptNodes.find(n => n.isDraft);
        if (strayDraft) {
          console.log('[handleGenerate] Found stray draft during generation, converting it:', strayDraft.id);
          // Replace the stray draft's ID with our generating ID? 
          // Or just update the stray draft with our config?
          // Better to update the stray draft to avoid orphans.
          // IMPORTANT: keep the freshly calculated generation position (current viewport center in normal mode)
          // Do NOT reuse stray draft position, otherwise node may jump back to old/initial canvas location.
          const fusedNode = { ...generatingNode, id: strayDraft.id, position: generatingNode.position };
          await updatePromptNode(fusedNode);
          // Update our local ID reference for executeGeneration
          generatingNode.id = strayDraft.id;
        } else {
          console.log('[handleGenerate] Creating NEW node:', generatingNode.id);
          await addPromptNode(generatingNode);
          console.log('[handleGenerate] ✅ addPromptNode completed for:', generatingNode.id, 'isDraft:', generatingNode.isDraft);
        }
      }

      // 🚀 [Cleanup] Remove any OTHER drafts if they exist (duplicate prevention)
      // This is a safety measure - uncommented to fix orphan card issue
      const leftovers = canvasForWrite?.promptNodes.filter(n => n.isDraft && n.id !== generatingNode.id);
      if (leftovers && leftovers.length > 0) {
        console.log('[handleGenerate] Cleaning up orphan drafts:', leftovers.map(n => n.id));
        leftovers.forEach(n => deletePromptNode(n.id));
      }

      setDraftNodeId(null); // Detach status NOW that the node is updated in canvas
      setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
      setActiveSourceImage(null);

      // Execute immediately after save completed
      await executeGeneration(generatingNode);
    } catch (e: any) {
      console.error('[handleGenerate] failed:', e);
      import('./services/system/notificationService').then(({ notify }) => {
        notify.error('发送失败', e?.message || '请重试');
      });
    } finally {
      generateLockRef.current = false;
      // 🚀 [Fix] 不在此处 setIsGenerating(false)，因为 executeGeneration 内部已管理此状态
      // 原来未 await executeGeneration 导致此处提前执行，generateLockRef 被过早解锁
    }
  }, [config, draftNodeId, addPromptNode, updatePromptNode, activeCanvas, activeSourceImage, canvasTransform, findNextGroupPosition, executeGeneration, getPromptHeight, isSidebarOpen, isChatOpen, isMobile, chatSidebarWidth, buildAutoPptSlides, getPreferredKeyForMode, consumeCredits, balance, setShowRechargeModal]);

  // Handle reference images
  const handleFilesDrop = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (config.referenceImages.length + files.length > 5) {
      import('./services/system/notificationService').then(({ notify }) => {
        notify.warning('无法添加图片', "最多支持 5 张参考图");
      });
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

  // 自动整理：委托给 CanvasContext
  const handleAutoArrange = useCallback(() => {
    arrangeAllNodes();
  }, [arrangeAllNodes]);

  // --- 连接管理 ---
  const handleCutConnection = useCallback((promptId: string, imageId: string) => {
    unlinkNodes(promptId, imageId);
  }, [unlinkNodes]);

  // 🚀 [Strict Logic] Disconnect Parent -> Child Group becomes Normal Group
  const handleDisconnectPrompt = useCallback((id: string) => {
    const node = activeCanvas?.promptNodes.find(n => n.id === id);
    if (node && node.sourceImageId) {
      updatePromptNode({ ...node, sourceImageId: undefined });

      // [Draft Logic] If disconnecting draft, clear global source state too
      if (node.id === draftNodeId) {
        setActiveSourceImage(null);
      }

      import('./services/system/notificationService').then(({ notify }) => {
        notify.success('已断开连接', '卡组已拆分为独立卡组');
      });
    }
  }, [activeCanvas, updatePromptNode, draftNodeId, setActiveSourceImage]);

  // 🚀 [Strict Logic] Pin Draft -> Create Lonely Main Card
  const handlePinDraft = useCallback((id: string, mode: 'button' | 'drag') => {
    const node = activeCanvas?.promptNodes.find(n => n.id === id);
    if (!node) return;

    // Pin: Move up 350px to avoid overlap with where the next preview will appear
    // Matches user requirement: "Main Card generated ABOVE... DO NOT OVERLAP"
    const newPos = { ...node.position, y: node.position.y - 350 };

    updatePromptNode({
      ...node,
      position: newPos,
      isDraft: false
    });

    // Clear Draft ID so next typing creates new draft
    setDraftNodeId(null);
    // 🚀 [New Requirement] Clear input box and active source
    setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
    setActiveSourceImage(null);

    import('./services/system/notificationService').then(({ notify }) => {
      notify.success('已固定', '草稿已转换为独立卡片');
    });
  }, [activeCanvas, updatePromptNode, setDraftNodeId, setConfig]);

  // 🚀 [New Feature] Pin Image -> Convert to Lonely Main Card (Idea Freeze)
  const handlePinImage = useCallback(async (imageId: string) => {
    const imageNode = activeCanvas?.imageNodes.find(n => n.id === imageId);
    if (!imageNode) return;

    // 1. Create New Prompt Node based on Image
    const newPromptId = Date.now().toString();
    const newPromptNode: PromptNode = {
      id: newPromptId,
      prompt: imageNode.prompt || '',
      position: imageNode.position, // Take image's place
      width: undefined as number | undefined, // Default width
      height: undefined as number | undefined,
      isDraft: false, // Lonely Main Card (Permanent)
      model: imageNode.model,
      imageSize: imageNode.imageSize || ImageSize.SIZE_1K,
      aspectRatio: imageNode.aspectRatio,
      childImageIds: [], // Initialize empty array for new prompt node
      // 🚀 Use the image itself as a reference to preserve the "Idea"
      referenceImages: [{
        id: `ref-${newPromptId}`,
        storageId: imageNode.storageId || imageNode.id,
        url: imageNode.url, // Thumbnail
        data: imageNode.url, // Base64/Blob
        mimeType: imageNode.mimeType || 'image/png'
      }],
      timestamp: Date.now()
    };

    // 2. Add New Prompt Node
    addPromptNode(newPromptNode);

    // 3. Delete Original Image Node (Transformation complete)
    deleteImageNode(imageId);

    import('./services/system/notificationService').then(({ notify }) => {
      notify.success('想法已定格', '图片已转换为独立主卡');
    });

  }, [activeCanvas, addPromptNode, deleteImageNode]);

  // Retry Logic (In-Place Regeneration)
  const handleRetryNode = useCallback(async (node: PromptNode) => {
    // 1. Reset state to generating
    updatePromptNode({
      ...node,
      isGenerating: true,
      error: undefined,
      errorDetails: undefined,
      isDraft: false, // 🚀 [Fix] Ensure visibility
      timestamp: Date.now() // Reset timer
    });

    const currentNodeId = node.id;
    const requestedCount = node.parallelCount || config.parallelCount || 1;
    const count = node.mode === GenerationMode.PPT ? Math.min(20, Math.max(1, requestedCount)) : requestedCount;
    const startTime = Date.now();

    try {
      const results = await Promise.all(Array.from({ length: count }).map(async (_, index) => {
        const requestId = `${currentNodeId}-${index}`;

        let isFinished = false;
        const timer = setTimeout(() => {
          if (!isFinished) {
            cancelGeneration(requestId);
            updatePromptNode({
              ...node,
              isGenerating: false,
              isDraft: false, // 🚀 [Fix] Prevent disappearance on timeout
              error: '生成超时',
              errorDetails: {
                code: 'TIMEOUT',
                responseBody: 'Retry request exceeded 360000ms timeout',
                model: node.model,
                timestamp: Date.now()
              }
            });
          }
        }, 360000);

        try {
          let b64 = '';
          let requestPath: string | undefined = undefined;
          let requestBodyPreview: string | undefined = undefined;
          let pythonSnippet: string | undefined = undefined;
          let apiDurationMs: number | undefined = undefined;
          const currentMode: GenerationMode = node.mode || GenerationMode.IMAGE;
          const taskPrompt = currentMode === GenerationMode.PPT
            ? (() => {
              const slideLines = (node.pptSlides || []).map(line => String(line || '').trim()).filter(Boolean);
              const styleDirective = node.pptStyleLocked !== false
                ? '与整套PPT保持完全统一的视觉语言'
                : '保持基础统一但允许该页视觉变化';
              const picked = slideLines.length > 0
                ? slideLines[Math.min(index, slideLines.length - 1)]
                : `主题：${node.prompt}。保持同一套视觉风格，页面内容独立不重复`;
              return `PPT第${index + 1}/${count}页。${picked}。16:9。${styleDirective}。`;
            })()
            : node.prompt;

          if (currentMode === GenerationMode.VIDEO) {
            const videoResolution = (() => {
              if (node.videoResolution) return node.videoResolution;
              const size = node.imageSize?.toLowerCase() || '';
              if (size.includes('4k') || size.includes('ultra')) return '4k';
              if (size.includes('1080') || size.includes('hd')) return '1080p';
              return '720p'; // 默认720p
            })();
            const videoAspect = node.aspectRatio === '9:16' ? '9:16' : '16:9';
            const videoResult = await llmService.generateVideo({
              modelId: node.model,
              prompt: taskPrompt,
              aspectRatio: videoAspect,
              imageUrl: node.referenceImages?.[0]?.data,
              imageTailUrl: node.referenceImages?.[1]?.data,
              videoDuration: node.videoDuration,
              preferredKeyId: node.keySlotId,
              providerConfig: {
                google: {
                  imageConfig: { imageSize: videoResolution }
                }
              }
            });
            b64 = videoResult.url;
          } else {
            const result = await generateImage(
              taskPrompt,
              node.aspectRatio,
              node.imageSize,
              node.referenceImages || [],
              node.model,
              '', // managed key
              requestId,
              !!node.enableGrounding || !!node.enableImageSearch
              , {
                preferredKeyId: node.keySlotId,
                enableWebSearch: !!node.enableGrounding,
                enableImageSearch: !!node.enableImageSearch,
                thinkingMode: node.thinkingMode || 'minimal'
              }
            );
            b64 = result.url;
            requestPath = result.requestPath;
            requestBodyPreview = result.requestBodyPreview;
            pythonSnippet = result.pythonSnippet;
            apiDurationMs = result.apiDurationMs;
          }

          isFinished = true;
          clearTimeout(timer);

          // Upload (non-blocking for latency)
          let url = b64;
          let originalUrl = '';

          if (currentMode === GenerationMode.IMAGE || currentMode === GenerationMode.PPT) {
            originalUrl = b64;
            if (b64.startsWith('data:')) {
              import('./services/system/syncService').then(async ({ syncService }) => {
                try {
                  const res = await fetch(b64);
                  const blob = await res.blob();
                  const id = `${Date.now()}_${index}`;
                  await syncService.uploadImagePair(id, blob);
                } catch (e) {
                  console.warn('Cloud upload failed (retry flow, non-blocking)', e);
                }
              }).catch(() => { });
            }
          } else {
            // For video, assume URL is remote or data URI
            url = b64;
            originalUrl = b64;
          }

          const generationTime = (apiDurationMs && apiDurationMs > 0)
            ? apiDurationMs
            : (Date.now() - startTime);

          // Calculate Hash/StorageID
          const storageId = await calculateImageHash(url);

          // 🚀 [Fair Billing] Detect ACTUAL dimensions from the blob/image
          // This ensures we bill for what was received (e.g. 1K), not what was requested (e.g. 4K)
          // if the API downgraded it.
          let actualWidth = 1024;
          let actualHeight = 1024;
          let displayDimensions = `${node.aspectRatio} · ${node.imageSize || '1K'}`;
          let computedImageSize = node.imageSize || 'SIZE_1K'; // Default fallback

          try {
            if (typeof createImageBitmap !== 'undefined' && b64.startsWith('blob:')) {
              // Fast path for Blobs
              const res = await fetch(b64);
              const blob = await res.blob();
              const bitmap = await createImageBitmap(blob);
              actualWidth = bitmap.width;
              actualHeight = bitmap.height;
              bitmap.close();
            } else {
              // Slow path for Data URLs / Remote URLs
              const img = new Image();
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
              });
              actualWidth = img.naturalWidth;
              actualHeight = img.naturalHeight;
            }

            // Update display string to show REAL pixels
            displayDimensions = `${actualWidth}x${actualHeight}`;

            // Determine Billing Tier based on Max Dimension
            // 1K Tier: max <= 1500 (approx)
            // 2K Tier: max > 1500 && max <= 3000
            // 4K Tier: max > 3000
            const maxDim = Math.max(actualWidth, actualHeight);
            if (maxDim > 3000) {
              computedImageSize = ImageSize.SIZE_4K; // Map to enum manually or use string
            } else if (maxDim > 1500) {
              computedImageSize = ImageSize.SIZE_2K;
            } else {
              computedImageSize = ImageSize.SIZE_1K;
            }
            console.log(`[Fair Billing] Requested: ${node.imageSize}, Received: ${actualWidth}x${actualHeight}, Billed As: ${computedImageSize}`);

          } catch (e) {
            console.warn('[App] Failed to detect actual dimensions, falling back to requested', e);
          }

          return {
            canvasId: activeCanvas?.id || 'default',
            parentPromptId: node.id,
            dimensions: displayDimensions, // 🚀 Use Real Dimensions
            generationTime,
            index,
            url,
            originalUrl,
            prompt: taskPrompt,
            width: actualWidth,
            height: actualHeight,
            aspectRatio: node.aspectRatio,
            imageSize: computedImageSize, // 🚀 Use Computed Cost Tier
            model: node.model,
            keySlotId: node.keySlotId,
            sourceReferenceStorageIds: (node.referenceImages || []).map(ref => ref.storageId || ref.id).filter(Boolean),
            alias: currentMode === GenerationMode.PPT ? `图${index + 1}` : undefined,
            seed: -1,
            id: `${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
            storageId, // Content-Based ID
            mimeType: currentMode === GenerationMode.VIDEO ? 'video/mp4' : 'image/png',
            timestamp: Date.now(),
            mode: currentMode,
            requestPath,
            requestBodyPreview,
            pythonSnippet
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
          const match = img.dimensions.match(/(\d+)\s*[xX]\s*(\d+)/);
          if (match && match[1] && match[2]) {
            const w = parseInt(match[1], 10);
            const h = parseInt(match[2], 10);
            if (w > 0 && h > 0) {
              const ratio = w / h;
              const displayWidth = ratio > 1 ? 320 : (ratio < 1 ? 200 : 280);
              exactImageHeight = (displayWidth / ratio) + 40;
            }
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

        const isPptMode = (node.mode || GenerationMode.IMAGE) === GenerationMode.PPT;

        if (isPptMode) {
          const pptGap = 28;
          const offsetY = gapToImages + exactImageHeight + i * (exactImageHeight + pptGap);
          x = node.position.x;
          y = node.position.y + offsetY;
        } else if (isMobile) {
          // Mobile: Maintain Desktop Size but Single Column
          const cols = 1; // Force single column to fit screen
          const col = 0; // Always col 0
          const row = i; // Row increments with index
          const mobileCardWidth = cardWidth; // Use full desktop width

          const mobileGap = 20;
          const startX = -mobileCardWidth / 2;
          const offsetX = startX + mobileCardWidth / 2;

          // 🚀 [Fix] Image Y should be exactly below Prompt Y, without adding promptCardHeight
          // Because Prompt Y is already its bottom edge.
          const offsetY = gapToImages + exactImageHeight + row * (exactImageHeight + mobileGap);
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

          // Y: Prompt Bottom + Gap + Image Height
          // 🚀 [Fix] node.position.y is already bottom anchor. Do NOT add promptCardHeight!
          const rowHeight = exactImageHeight;
          const rowOffsetY = row * (rowHeight + gap);

          // Final Y (Bottom Anchor) = PromptBottom + Gap + ImageHeight + RowOffset
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
        isDraft: false, // 🚀 [Fix] Ensure persistence
        childImageIds: newImageNodes.map(n => n.id),
        error: undefined,
        errorDetails: undefined
      });

      // Record cost
      // 🚀 [Fair Billing] Use the computed/effective size from the first result (assuming all in batch are same)
      const effectiveSize = newImageNodes[0]?.imageSize || node.imageSize; // fallback

      import('./services/billing/costService').then(({ recordCost }) => {
        const firstDebug = (results as any[])[0] || {};
        recordCost(
          node.model,
          effectiveSize as any, // Cast to ImageSize
          newImageNodes.length,
          node.prompt,
          node.referenceImages?.length || 0,
          undefined,
          {
            requestPath: firstDebug.requestPath,
            requestBodyPreview: firstDebug.requestBodyPreview,
            pythonSnippet: firstDebug.pythonSnippet
          }
        );
      });
      import('./services/system/notificationService').then(({ notify }) => {
        notify.success('生成完成', '重新生成成功');
      });

    } catch (error: any) {
      updatePromptNode({
        ...node,
        isGenerating: false,
        isDraft: false, // 🚀 [Fix] Prevent disappearance on error
        error: error.message || 'Retry failed',
        errorDetails: extractErrorDetails(error, node.model)
      });
      import('./services/system/notificationService').then(({ notify }) => {
        notify.error('重试失败', error.message);
      });
    }
  }, [config.parallelCount, isMobile, updatePromptNode, addImageNodes, config.enableGrounding, extractErrorDetails]);

  const handleExportPptPackage = useCallback(async (node: PromptNode) => {
    if (!activeCanvas) return;
    const childImages = activeCanvas.imageNodes
      .filter(img => img.parentPromptId === node.id)
      .sort((a, b) => {
        const getNum = (x: string | undefined) => {
          if (!x) return Number.POSITIVE_INFINITY;
          const m = x.match(/图\s*(\d+)/);
          return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
        };
        const diff = getNum(a.alias) - getNum(b.alias);
        if (Number.isFinite(diff) && diff !== 0) return diff;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });

    if (childImages.length === 0) {
      import('./services/system/notificationService').then(({ notify }) => {
        notify.warning('无可导出页面', '当前主卡还没有生成副卡页面');
      });
      return;
    }

    const zip = new JSZip();
    const pagesMeta: Array<any> = [];

    for (let i = 0; i < childImages.length; i++) {
      const img = childImages[i];
      const pageNo = i + 1;
      const pageName = img.alias || `图${pageNo}`;
      const outlineRaw = node.pptSlides?.[i] || img.alias || '';
      const { title: outlineTitle, subtitle: outlineSubtitle } = parsePptOutlineLine(outlineRaw);
      const fileName = `pages/${String(pageNo).padStart(2, '0')}-${pageName.replace(/[\\/:*?"<>|]/g, '_')}.png`;
      const src = img.originalUrl || img.url;

      try {
        const res = await fetch(src);
        const blob = await res.blob();
        zip.file(fileName, blob);
      } catch {
        // Skip broken pages but keep metadata
      }

      pagesMeta.push({
        page: pageNo,
        title: pageName,
        outlineTitle,
        outlineSubtitle,
        prompt: img.prompt,
        model: img.model,
        provider: img.providerLabel || img.provider,
        keySlotId: img.keySlotId,
        dimensions: img.dimensions,
        imageSize: img.imageSize,
        timestamp: img.timestamp,
        file: fileName
      });
    }

    const outlinePages = (node.pptSlides || []).map((text, idx) => ({
      page: idx + 1,
      text
    }));

    zip.file('meta/manifest.json', JSON.stringify({
      exportedAt: new Date().toISOString(),
      nodeId: node.id,
      nodePrompt: node.prompt,
      pageCount: childImages.length,
      pages: pagesMeta
    }, null, 2));

    zip.file('outline/ppt-outline.json', JSON.stringify({
      topic: node.prompt,
      pageCount: Math.max(childImages.length, outlinePages.length),
      styleLocked: node.pptStyleLocked !== false,
      pages: outlinePages
    }, null, 2));

    zip.file('meta/node-meta.json', JSON.stringify({
      nodeId: node.id,
      model: node.model,
      modelLabel: node.modelLabel,
      provider: node.provider,
      providerLabel: node.providerLabel,
      keySlotId: node.keySlotId,
      aspectRatio: node.aspectRatio,
      imageSize: node.imageSize,
      parallelCount: node.parallelCount,
      styleLocked: node.pptStyleLocked !== false,
      referenceStorageIds: (node.referenceImages || []).map(ref => ref.storageId || ref.id).filter(Boolean)
    }, null, 2));

    const slidesHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PPT Export Preview</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b1020; color: #e5e7eb; margin: 0; padding: 20px; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
    .card { background: #121a2f; border: 1px solid #23304f; border-radius: 10px; overflow: hidden; }
    .meta { padding: 10px 12px; font-size: 12px; line-height: 1.4; }
    .title { color: #7dd3fc; font-weight: 600; margin-bottom: 6px; }
    img { width: 100%; display: block; background: #0f172a; }
  </style>
</head>
<body>
  <h1>${(node.prompt || 'PPT 导出').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
  <div class="grid">
    ${pagesMeta.map(p => `
      <div class="card">
        <img src="../${p.file}" alt="${String(p.title).replace(/"/g, '&quot;')}" />
        <div class="meta">
          <div class="title">第${p.page}页 · ${String(p.title).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          <div>${String(p.prompt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>
      </div>`).join('')}
  </div>
</body>
</html>`;
    zip.file('outline/slides-preview.html', slidesHtml);

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ppt-pages-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    import('./services/system/notificationService').then(({ notify }) => {
      notify.success('导出完成', `已导出 ${childImages.length} 页与 pages/outline/meta 目录`);
    });
  }, [activeCanvas, parsePptOutlineLine]);

  const handleRetryPptSinglePage = useCallback(async (node: PromptNode, pageIndex: number) => {
    if (!activeCanvas) return;
    if (node.mode !== GenerationMode.PPT) return;

    const ordered = activeCanvas.imageNodes
      .filter(img => img.parentPromptId === node.id)
      .sort((a, b) => {
        const num = (val?: string) => {
          if (!val) return Number.POSITIVE_INFINITY;
          const m = val.match(/图\s*(\d+)/);
          return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
        };
        const d = num(a.alias) - num(b.alias);
        if (Number.isFinite(d) && d !== 0) return d;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });

    const target = ordered[pageIndex];
    if (!target) {
      import('./services/system/notificationService').then(({ notify }) => {
        notify.warning('页面不存在', `未找到图${pageIndex + 1}`);
      });
      return;
    }

    const slides = (node.pptSlides || []).map(s => String(s || '').trim()).filter(Boolean);
    const slideText = slides[pageIndex]
      || slides[slides.length - 1]
      || `主题：${node.prompt}。保持同一套视觉风格，页面内容独立不重复`;
    const layoutDirective = (() => {
      const t = slideText.toLowerCase();
      if (/封面|cover|title/.test(t)) return '采用封面版式：大标题+副标题+视觉主图，信息精简。';
      if (/目录|agenda|contents?/.test(t)) return '采用目录版式：清晰列出3-6个章节条目，层级分明。';
      if (/总结|结论|行动|summary|conclusion/.test(t)) return '采用总结版式：结论要点+行动建议，重点高亮。';
      if (/章节|section|transition/.test(t)) return '采用章节过渡页版式：章节标题突出，辅以关键关键词。';
      return '采用内容页版式：标题+3-5个信息块，层次清晰。';
    })();
    const styleDirective = node.pptStyleLocked !== false
      ? '与整套PPT保持完全统一的视觉语言'
      : '保持基础统一但允许该页视觉变化';
    const previousVisualHint = (() => {
      const raw = (target.prompt || '').replace(/PPT第\d+\/?\d*页。?/g, '').trim();
      if (!raw) return '';
      const compact = raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;
      return `参考上一版视觉关键词：${compact}。`;
    })();
    const taskPrompt = `PPT第${pageIndex + 1}/${Math.max(1, node.childImageIds.length)}页。${slideText}。16:9。${styleDirective}。${layoutDirective}${previousVisualHint}`;

    updateImageNode(target.id, {
      isGenerating: true,
      error: undefined
    });

    const startTime = Date.now();
    try {
      const result = await generateImage(
        taskPrompt,
        node.aspectRatio,
        node.imageSize,
        node.referenceImages || [],
        node.model,
        '',
        `${node.id}-ppt-single-${pageIndex}`,
        !!node.enableGrounding || !!node.enableImageSearch,
        {
          preferredKeyId: node.keySlotId,
          enableWebSearch: !!node.enableGrounding,
          enableImageSearch: !!node.enableImageSearch,
          thinkingMode: node.thinkingMode || 'minimal'
        }
      );

      let storageId = target.storageId;
      if (result.url.startsWith('data:')) {
        try {
          const hash = await calculateImageHash(result.url);
          storageId = hash;
          await saveOriginalImage(hash, result.url);
        } catch {
          // ignore storage failures, keep in-memory preview
        }
      }

      updateImageNode(target.id, {
        url: result.url,
        originalUrl: result.url,
        prompt: taskPrompt,
        timestamp: Date.now(),
        generationTime: Date.now() - startTime,
        model: result.model || node.model,
        modelLabel: result.modelName || target.modelLabel,
        provider: result.provider || target.provider,
        providerLabel: result.providerName || target.providerLabel,
        keySlotId: result.keySlotId || node.keySlotId,
        imageSize: result.imageSize || node.imageSize,
        aspectRatio: result.aspectRatio || node.aspectRatio,
        dimensions: result.dimensions ? `${result.dimensions.width}x${result.dimensions.height}` : target.dimensions,
        exactDimensions: result.dimensions || target.exactDimensions,
        sourceReferenceStorageIds: (node.referenceImages || []).map(ref => ref.storageId || ref.id).filter(Boolean),
        alias: `图${pageIndex + 1}`,
        storageId,
        isGenerating: false,
        error: undefined
      });

      rememberPreferredKeyForMode(node.mode, result.keySlotId || node.keySlotId);

      import('./services/system/notificationService').then(({ notify }) => {
        notify.success('单页重生完成', `已更新图${pageIndex + 1}`);
      });
    } catch (error: any) {
      updateImageNode(target.id, {
        isGenerating: false,
        error: error?.message || '单页重生失败'
      });
      import('./services/system/notificationService').then(({ notify }) => {
        notify.error('单页重生失败', error?.message || '请稍后重试');
      });
    }
  }, [activeCanvas, updateImageNode, rememberPreferredKeyForMode]);

  const handleExportPptSinglePage = useCallback(async (node: PromptNode, pageIndex: number) => {
    if (!activeCanvas) return;
    if (node.mode !== GenerationMode.PPT) return;

    const ordered = activeCanvas.imageNodes
      .filter(img => img.parentPromptId === node.id)
      .sort((a, b) => {
        const num = (val?: string) => {
          if (!val) return Number.POSITIVE_INFINITY;
          const m = val.match(/图\s*(\d+)/);
          return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
        };
        const d = num(a.alias) - num(b.alias);
        if (Number.isFinite(d) && d !== 0) return d;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });

    const target = ordered[pageIndex];
    if (!target) return;

    try {
      const res = await fetch(target.originalUrl || target.url);
      const blob = await res.blob();
      const name = `ppt-page-${String(pageIndex + 1).padStart(2, '0')}.png`;
      saveAs(blob, name);
      import('./services/system/notificationService').then(({ notify }) => {
        notify.success('导出完成', `已导出图${pageIndex + 1}`);
      });
    } catch (e: any) {
      import('./services/system/notificationService').then(({ notify }) => {
        notify.error('导出失败', e?.message || '无法导出该页面');
      });
    }
  }, [activeCanvas]);

  const handleExportPptx = useCallback(async (node: PromptNode) => {
    if (!activeCanvas) return;
    if (node.mode !== GenerationMode.PPT) return;

    const ordered = activeCanvas.imageNodes
      .filter(img => img.parentPromptId === node.id)
      .sort((a, b) => {
        const num = (val?: string) => {
          if (!val) return Number.POSITIVE_INFINITY;
          const m = val.match(/图\s*(\d+)/);
          return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
        };
        const d = num(a.alias) - num(b.alias);
        if (Number.isFinite(d) && d !== 0) return d;
        return (a.timestamp || 0) - (b.timestamp || 0);
      })
      .slice(0, 20);

    if (ordered.length === 0) {
      import('./services/system/notificationService').then(({ notify }) => {
        notify.warning('无可导出页面', '当前主卡还没有生成副卡页面');
      });
      return;
    }

    const escapeXml = (s: string) => String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const zip = new JSZip();

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${ordered.map((_, i) => `  <Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n')}
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

    zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(node.prompt || 'KK Studio PPT Export')}</dc:title>
  <dc:creator>KK Studio</dc:creator>
  <cp:lastModifiedBy>KK Studio</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);

    zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>KK Studio</Application>
  <Slides>${ordered.length}</Slides>
</Properties>`);

    zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>
    ${ordered.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

    zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${ordered.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('\n')}
</Relationships>`);

    zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);

    zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);

    zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);

    zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

    zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Default"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Default"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme><a:fmtScheme name="Default"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);

    for (let i = 0; i < ordered.length; i++) {
      const img = ordered[i];
      const outlineRaw = node.pptSlides?.[i] || img.alias || `第${i + 1}页`;
      const { title: outlineTitle, subtitle: outlineSubtitle } = parsePptOutlineLine(outlineRaw);
      const titleText = outlineTitle || `第${i + 1}页`;
      const subtitleText = outlineSubtitle || '';
      const src = img.originalUrl || img.url;
      const res = await fetch(src);
      const blob = await res.blob();
      const mime = blob.type || 'image/png';
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
      const mediaPath = `ppt/media/image${i + 1}.${ext}`;
      zip.file(mediaPath, blob);

      zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="2" name="${escapeXml(img.alias || `Slide ${i + 1}`)}"/>
          <p:cNvPicPr/>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="rId1"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Title Box"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="228600"/><a:ext cx="11277600" cy="731520"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="111827"><a:alpha val="42000"/></a:srgbClr></a:solidFill>
          <a:ln><a:noFill/></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr lIns="114300" tIns="57150" rIns="114300" bIns="57150"/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="zh-CN" b="1" sz="3200"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr>
              <a:t>${escapeXml(titleText)}</a:t>
            </a:r>
            <a:endParaRPr lang="zh-CN" sz="3200"/>
          </a:p>
        </p:txBody>
      </p:sp>
      ${subtitleText ? `<p:sp>
        <p:nvSpPr>
          <p:cNvPr id="4" name="Subtitle Box"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="1005840"/><a:ext cx="11277600" cy="548640"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="0F172A"><a:alpha val="28000"/></a:srgbClr></a:solidFill>
          <a:ln><a:noFill/></a:ln>
        </p:spPr>
        <p:txBody>
          <a:bodyPr lIns="114300" tIns="38100" rIns="114300" bIns="38100"/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="zh-CN" sz="1800"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:rPr>
              <a:t>${escapeXml(subtitleText)}</a:t>
            </a:r>
            <a:endParaRPr lang="zh-CN" sz="1800"/>
          </a:p>
        </p:txBody>
      </p:sp>` : ''}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`);

      zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i + 1}.${ext}"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);
    }

    const pptxBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(pptxBlob, `ppt-slides-${Date.now()}.pptx`);
    import('./services/system/notificationService').then(({ notify }) => {
      notify.success('PPTX导出完成', `已导出 ${ordered.length} 页的 .pptx 文件`);
    });
  }, [activeCanvas, parsePptOutlineLine]);

  // Auto-Recover Interrupted Tasks
  useEffect(() => {
    if (activeCanvas) {
      const interruptedNodes = activeCanvas.promptNodes.filter(n => n.error === '::INTERRUPTED::');
      if (interruptedNodes.length > 0) {
        console.log('[App] Auto-recovering interrupted nodes:', interruptedNodes.length);

        interruptedNodes.forEach(node => {
          handleRetryNode(node);
        });

        import('./services/system/notificationService').then(({ notify }) => {
          notify.info('恢复任务', `系统已自动重新开始 ${interruptedNodes.length} 个中断的任务`);
        });
      }
    }
  }, [activeCanvas, handleRetryNode]);

  // Optimization: Stable handlers for Node Clicks
  const handlePromptClick = useCallback(async (clickedNode: PromptNode, isOptimizedView?: boolean) => {
    setActiveSourceImage(null);

    let referenceImages = clickedNode.referenceImages || [];

    // Pre-hydrate if needed to prevent flicker
    // We do this BEFORE setting config so the UI never sees the "loading" state
    if (referenceImages.some(img => !img.data && img.storageId)) {
      try {
        const { getImage } = await import('./services/storage/imageStorage');
        const hydrated = await Promise.all(referenceImages.map(async (img) => {
          if (!img.data && img.storageId) {
            const data = await getImage(img.storageId);
            if (data) return { ...img, data };
          }
          return img;
        }));
        referenceImages = hydrated;
      } catch (e) {
        console.error('Failed to pre-hydrate reference images', e);
      }
    }

    const textToCopy = (isOptimizedView && clickedNode.optimizedPromptEn?.trim())
      ? clickedNode.optimizedPromptEn.trim()
      : clickedNode.prompt;

    setConfig(prev => ({
      ...prev,
      prompt: textToCopy,
      aspectRatio: clickedNode.aspectRatio,
      imageSize: clickedNode.imageSize,
      model: clickedNode.model,
      referenceImages: referenceImages,
      mode: clickedNode.mode || GenerationMode.IMAGE // 🚀 Sync Mode (Image/Video)
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
    // 🚀 Shift=切换(向后兼容), 无修饰键=替换
    selectNodes([imageId], (window.event as any)?.shiftKey ? 'toggle' : 'replace');

    // Set this image as source for continuing conversation
    setActiveSourceImage(imageId);
    // Clear prompt and existing references to start fresh continue-conversation
    setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));

    // 🚀 立即创建追问模式的Draft节点
    // 删除现有的draft（如果有）
    if (draftNodeId) {
      deletePromptNode(draftNodeId);
    }

    // 计算追问Draft的位置（在父卡组下方）
    const sourceImage = activeCanvas?.imageNodes.find(img => img.id === imageId);
    if (sourceImage) {
      const parentPromptId = sourceImage.parentPromptId;
      const parentPrompt = activeCanvas?.promptNodes.find(p => p.id === parentPromptId);

      // 🚀 计算源图片的底部Y（图片使用底部锚点，position.y就是底部）
      const sourceBottom = sourceImage.position.y;

      let draftPos = { x: sourceImage.position.x, y: sourceBottom + 100 }; // fallback：源图片下方100px

      if (parentPrompt) {
        // 找到父主卡下所有子卡，计算最大Y位置（底部）
        const siblingImages = activeCanvas?.imageNodes.filter(img => img.parentPromptId === parentPromptId) || [];
        let maxY = parentPrompt.position.y; // 主卡底部锚点

        siblingImages.forEach(img => {
          // 🚀 FIX: 图片使用底部锚点，position.y就是底部，无需再加高度
          maxY = Math.max(maxY, img.position.y);
        });

        draftPos = {
          x: parentPrompt.position.x,
          y: maxY + 80  // 在最底部的卡片下方80px
        };
      }

      const newId = Date.now().toString();
      addPromptNode({
        id: newId,
        prompt: '',  // 空prompt，等待用户输入
        position: draftPos,
        aspectRatio: config.aspectRatio,
        imageSize: config.imageSize,
        model: config.model,
        childImageIds: [],
        referenceImages: [],  // 源图片会在handleGenerate时自动添加
        timestamp: Date.now(),
        sourceImageId: imageId,
        isDraft: true,
        mode: config.mode,
        tags: []
      });
      setDraftNodeId(newId);
    }
  }, [selectNodes, setConfig, draftNodeId, deletePromptNode, activeCanvas, addPromptNode, config, getCardDimensions]);

  // Dynamic Group Bounds Calculation
  const getComputedGroupBounds = useCallback((group: CanvasGroup) => {
    if (!activeCanvas) return undefined;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasNodes = false;
    // 🚀 Uniform 40px padding on all sides
    const PADDING = 40;
    const TOP_EXTRA = 40; // Extra for header
    const BOTTOM_EXTRA = 40;

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
      height: (maxY - minY) + PADDING + TOP_EXTRA + BOTTOM_EXTRA
    };
  }, [activeCanvas]);

  // Viewport Culling (Virtualization) Logic
  // Optimization: Only render nodes overlapping with the current viewport (+buffer)
  const { visiblePromptNodes, visibleImageNodes, visibleGroups } = React.useMemo(() => {
    if (!activeCanvas) {
      return { visiblePromptNodes: [], visibleImageNodes: [], visibleGroups: [] };
    }

    // Buffer: Load 2 screens worth of content around the viewport to prevent flash on drag
    const BUFFER = 5000; // 🚀 增大缓冲区防止拖动时消失

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

    // 2. Filter Prompt Nodes (排除草稿节点，草稿由中心叠加层单独渲染)
    const visiblePromptNodes = activeCanvas.promptNodes.filter(n => {
      // 🚀 [Fix Bug #1] 草稿节点由固定中心叠加层渲染，此处跳过避免重复
      if (n.isDraft) {
        // console.log('[App] Filter: Skipping draft node', n.id);
        return false;
      }

      // Estimate Bounds (Center X, Bottom Y) - 🚀 增大估算确保不消失
      const w = 800;
      const h = 800;
      const x = n.position.x - w / 2;
      const y = n.position.y - h;

      const isVisible = !(x > vRight || x + w < vLeft || y > vBottom || y + h < vTop);
      if (!isVisible) {
        // console.log('[App] Filter: Node culled', n.id, { x, y, vLeft, vRight, vTop, vBottom });
      } else {
        // console.log('[App] Filter: Node visible', n.id);
      }
      return isVisible;
    });

    // 3. Filter Image Nodes
    const visibleImageNodes = activeCanvas.imageNodes.filter(n => {
      // Estimate Bounds (Center X, Bottom Y) - 🚀 增大估算确保不消失
      const w = 800;
      const h = 1200;
      const x = n.position.x - w / 2;
      const y = n.position.y - h;
      return !(x > vRight || x + w < vLeft || y > vBottom || y + h < vTop);
    });

    return { visiblePromptNodes, visibleImageNodes, visibleGroups };
  }, [activeCanvas, canvasTransform]);
  // [Blocking Load] Wait for Canvas Hydration to prevent "Triple Load" flash
  if (!isReady) {
    return (
      <div className="fixed inset-0 bg-[#0d0d0f] flex items-center justify-center z-50">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  // Adaptive connector styles for zoomed canvas (keep dashed lines visible when zoomed out)
  const zoomForConnectors = Math.max(0.1, canvasTransform.scale || 1);
  const connectorStroke = Math.max(1, Math.min(3, 1 / zoomForConnectors));
  const connectorDashA = Math.max(2, Math.min(10, 4 / zoomForConnectors));
  const connectorDashB = Math.max(2, Math.min(10, 4 / zoomForConnectors));
  const activeDragStroke = Math.max(2, Math.min(6, 3 / zoomForConnectors));
  const activeDragDashA = Math.max(3, Math.min(12, 6 / zoomForConnectors));
  const activeDragDashB = Math.max(2, Math.min(10, 4 / zoomForConnectors));
  const connectorHitStroke = Math.max(16, Math.min(40, 20 / zoomForConnectors));
  const connectorDotStart = Math.max(2, Math.min(4.5, 3 / zoomForConnectors));
  const connectorDotEnd = Math.max(1.5, Math.min(3.5, 2 / zoomForConnectors));


  return (
    <div id="canvas-container" className="relative w-screen h-screen overflow-hidden text-zinc-100 font-inter selection:bg-indigo-500/30"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
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
      {/* Top Left Credits Display */}
      {!isMobile && (
        <div className="absolute top-4 left-4 z-[100] flex items-center gap-2">
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-full border shadow-2xl backdrop-blur-md transition-all hover:border-[var(--border-medium)] group"
            style={{ backgroundColor: 'rgba(26, 26, 28, 0.8)', borderColor: 'var(--border-light)' }}
          >
            <div className="flex items-center gap-1.5 pt-0.5">
              <Sparkles size={18} fill="currentColor" className="text-blue-500 mb-0.5" />
              <div className="flex items-center select-none gap-1">
                <span className="text-[18px] font-mono font-bold leading-none min-w-[20px] text-white drop-shadow-sm">
                  {balanceLoading ? (
                    <Loader2 size={16} className="animate-spin opacity-40 text-blue-400" />
                  ) : balance}
                </span>
                <span className="text-[14px] font-bold text-blue-400 mt-0.5">积分</span>
              </div>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <button
              onClick={() => setShowRechargeModal(true)}
              className="px-3 py-1 bg-indigo-500 hover:bg-indigo-400 text-white text-[11px] font-bold rounded-lg transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
            >
              充值
            </button>
          </div>
        </div>
      )}

      {/* [NEW] Mobile Header & Navigation */}
      {isMobile && (
        <>
          <MobileHeader
            onMenuClick={() => setIsSidebarOpen(true)}
            onDashboardClick={() => {
              setShowSettingsPanel(true);
              setSettingsInitialView('dashboard');
            }}
            onSettingsClick={() => {
              setShowSettingsPanel(true);
              setSettingsInitialView('api-management');
            }}
            onUserClick={() => {
              setProfileInitialView('main');
              setShowProfileModal(true);
            }}
            onBillingClick={() => {
              setProfileInitialView('billing');
              setShowProfileModal(true);
            }}
            title="KK Studio"
          />
          <MobileTabBar
            onSetMode={(mode) => setConfig(prev => ({ ...prev, mode }))}
            onOpenSettings={() => {
              setShowSettingsPanel(true);
              setSettingsInitialView('dashboard');
            }}
            onOpenProfile={() => {
              setShowProfileModal(true);
              setProfileInitialView('main');
            }}
            onToggleChat={() => setIsChatOpen(prev => !prev)}
            currentMode={config.mode}
            currentView={showSettingsPanel ? 'settings' : (showProfileModal ? 'profile' : (isChatOpen ? 'chat' : 'home'))}
          />
        </>
      )}

      {/* Chat Sidebar (Left) */}


      {/* Top Right User Menu - Desktop Only */}
      {/* Top Right User Menu - Desktop Only */}
      {!isMobile && (
        <div id="header-user-menu" className="absolute top-4 z-[100] hidden md:flex items-center gap-3 transition-all duration-300" style={{ right: isChatOpen ? `calc(min(100vw - 60px, ${chatSidebarWidth + 28}px))` : '48px' }}>
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

                    {/* [NEW] 账户管理入口 */}
                    <button
                      onClick={() => {
                        setProfileInitialView('billing');
                        setShowProfileModal(true);
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--toolbar-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                      <div className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-yellow)' }}><Zap size={14} /></div>
                      账户管理
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
      )}

      {/* Selection Box Overlay */}
      {selectionBox && selectionBox.active && (
        <div
          className="fixed z-[9999] border border-indigo-500 bg-indigo-500/10 pointer-events-none rounded-lg"
          style={{
            left: Math.min(selectionBox.start.x, selectionBox.current.x),
            top: Math.min(selectionBox.start.y, selectionBox.current.y),
            width: Math.abs(selectionBox.current.x - selectionBox.start.x),
            height: Math.abs(selectionBox.current.y - selectionBox.start.y),
          }}
        />
      )}
      {/* Selection Menu Overlay */}
      {selectionMenuPosition && selectedNodeIds.length > 0 && (() => {
        // 🚀 计算详细统计：组数/图片数/视频数
        const selectedPrompts = activeCanvas?.promptNodes.filter(n => selectedNodeIds.includes(n.id)) || [];
        const selectedImages = activeCanvas?.imageNodes.filter(n => selectedNodeIds.includes(n.id)) || [];

        const groupCount = selectedPrompts.length; // 主卡 = 组
        const videoCount = selectedImages.filter(img =>
          img.mode === GenerationMode.VIDEO ||
          img.url?.includes('.mp4') ||
          img.url?.startsWith('data:video')
        ).length;
        const imageCount = selectedImages.length - videoCount; // 图片 = 副卡总数 - 视频数

        return (
          <SelectionMenu
            position={selectionMenuPosition}
            selectedCount={selectedNodeIds.length}
            groupCount={groupCount}
            imageCount={imageCount}
            videoCount={videoCount}
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

              // 🚀 Merge Logic: Find existing groups that contain any of the selected nodes
              const selectedNodeSet = new Set([...prompts.map(n => n.id), ...images.map(n => n.id)]);
              const existingGroupsInSelection = activeCanvas.groups.filter(g =>
                g.nodeIds.some(nid => selectedNodeSet.has(nid))
              );

              // Collect all node IDs from existing groups to ensure they're merged
              const allMergedNodeIds = new Set<string>();
              existingGroupsInSelection.forEach(g => g.nodeIds.forEach(nid => allMergedNodeIds.add(nid)));
              selectedNodeSet.forEach(nid => allMergedNodeIds.add(nid));

              // 🚀 Label Merge Logic
              let mergedLabel: string | undefined;
              const existingLabels = existingGroupsInSelection
                .map(g => g.label?.trim())
                .filter((l): l is string => !!l && l !== 'Group');

              // Remove duplicates
              const uniqueLabels = [...new Set(existingLabels)];

              if (uniqueLabels.length === 0) {
                mergedLabel = undefined; // Use default 'Group'
              } else if (uniqueLabels.length === 1) {
                mergedLabel = uniqueLabels[0];
              } else {
                // Combine names: "Name1 + Name2"
                mergedLabel = uniqueLabels.join(' + ');
              }

              // 🚀 Remove old groups that are being merged
              existingGroupsInSelection.forEach(g => removeGroup(g.id));

              // Calculate combined bounds (using all merged nodes)
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

              // Find all prompts and images by ID
              const allPrompts = activeCanvas.promptNodes.filter(n => allMergedNodeIds.has(n.id));
              const allImages = activeCanvas.imageNodes.filter(n => allMergedNodeIds.has(n.id));

              allPrompts.forEach(n => {
                const w = 380; // Assuming prompt width
                const h = n.height || 200;
                minX = Math.min(minX, n.position.x - w / 2);
                maxX = Math.max(maxX, n.position.x + w / 2);
                minY = Math.min(minY, n.position.y - h); // Anchor bottom
                maxY = Math.max(maxY, n.position.y);
              });

              allImages.forEach(n => {
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

              const padding = 40; // 🚀 Uniform 40px all sides
              const topExtra = 40;
              const bottomExtra = 40;
              const group: CanvasGroup = {
                id: Date.now().toString(),
                nodeIds: [...allMergedNodeIds],
                bounds: {
                  x: minX - padding,
                  y: minY - (padding + topExtra),
                  width: (maxX - minX) + padding * 2,
                  height: (maxY - minY) + padding + topExtra + bottomExtra
                },
                label: mergedLabel,
                type: 'custom'
              };
              addGroup(group);
              clearSelection();
              setSelectionMenuPosition(null);
            }}
            onTag={handleTag}
            onMigrate={() => {
              setSelectionMenuPosition(null);
              setShowMigrateModal(true);
            }}
            onArrange={(mode) => {
              arrangeAllNodes(mode);
              setSelectionMenuPosition(null);
            }}
          />
        );
      })()}



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
          // if (draftNodeId) setDraftNodeId(null); // 🚀 [FIX] Prevent detaching draft on background click to avoid "Lonely Main Card" orphans

          // Clear input when clicking empty canvas, but NOT during generation
          // and NOT when in "continue from image" mode
          // Clear input when clicking empty canvas? NO, user reported this is annoying.
          // Keep the prompt draft even if deselected.
          /*
          if (!isGenerating && !activeSourceImage) {
            setConfig(prev => ({ ...prev, prompt: '' }));
          }
          */
          // Always clear selection on empty click
          clearSelection();
          setSelectionMenuPosition(null);
        }}
        onCanvasDoubleClick={() => {
          // [NEW] Double click to clear EVERYTHING (Prompt + Images)
          if (!isGenerating) {
            setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
            setActiveSourceImage(null);
            // Also clear selection
            clearSelection();
            setSelectionMenuPosition(null);
            // 🚀 [Fix] Explicitly remove draft node so preview disappears
            if (draftNodeId) {
              deletePromptNode(draftNodeId);
              setDraftNodeId(null);
            }
          }
        }}
        onAutoArrange={handleAutoArrange}
        onResetView={() => {
          // 定位到最新生成的卡片
          const latestImage = activeCanvas?.imageNodes[activeCanvas.imageNodes.length - 1];
          const latestPrompt = activeCanvas?.promptNodes[activeCanvas.promptNodes.length - 1];

          // 优先定位到最新的图片,如果没有则定位到最新的提示词
          const targetNode = latestImage || latestPrompt;

          if (targetNode && canvasRef.current) {
            // 使用InfiniteCanvas的setView方法定位到目标卡片
            const container = document.getElementById('canvas-container');
            if (container) {
              const rect = container.getBoundingClientRect();
              const centerX = rect.width / 2;
              const centerY = rect.height / 2;

              // 计算需要的transform使目标卡片居中
              const newX = centerX - targetNode.position.x * canvasTransform.scale;
              const newY = centerY - targetNode.position.y * canvasTransform.scale;

              canvasRef.current.setView(newX, newY, canvasTransform.scale);
            }
          }
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onImageDrop={handleImageDrop}
      >
        {/* 1. Connection Lines Layer (SVG) - Below all cards */}
        <svg
          className="absolute top-0 left-0 pointer-events-none will-change-transform"
          style={{
            width: '10000px',
            height: '10000px',
            left: '-5000px',
            top: '-5000px',
            overflow: 'visible',
            zIndex: 1,
            transform: 'translateZ(0)' // 🚀 [GPU加速] 强制GPU渲染提升拖拽性能
          }}
        >
          {/* Active Drag Line */}
          {dragConnection?.active && (
            <path
              d={`M${dragConnection.startPos.x},${dragConnection.startPos.y} L${dragConnection.currentPos.x},${dragConnection.currentPos.y}`}
              fill="none"
              stroke="#6366f1"
              strokeWidth={activeDragStroke}
              strokeDasharray={`${activeDragDashA} ${activeDragDashB}`}
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
              const { width: cardWidth, totalHeight: theoreticalHeight } = getCardDimensions(childNode.aspectRatio, true);
              let imageHeight = theoreticalHeight;

              if (childNode.dimensions && typeof childNode.dimensions === 'string') {
                // 🚀 [Fix Bug] Extract purely the dimension part: "1:1 · 4096x4096" -> "4096x4096"
                // Then split by 'x' to avoid parsing the "1:1" as "1"
                const match = childNode.dimensions.match(/(\d+)\s*[xX]\s*(\d+)/);
                if (match && match[1] && match[2]) {
                  const w = parseInt(match[1], 10);
                  const h = parseInt(match[2], 10);
                  if (w > 0 && h > 0) {
                    const aspect = w / h;
                    const realParams = getCardDimensions(childNode.aspectRatio, false);
                    imageHeight = (realParams.width / aspect) + 40; // 40px for footer
                  }
                }
              }
              /* 🚀 主卡和副卡之间的连线保持白灰色 */

              if (isNaN(imageHeight) || imageHeight <= 0) {
                imageHeight = theoreticalHeight;
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
                  <circle cx={startX} cy={startY} r={connectorDotEnd} fill="var(--connector-color, #6366f1)" opacity="0.8" />
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--connector-color, #6366f1)"
                    strokeWidth={connectorStroke}
                    strokeDasharray={`${connectorDashA} ${connectorDashB}`}
                    strokeLinecap="round"
                    opacity="0.6"
                    className="group-hover:opacity-100"
                  />
                  <path d={d} stroke="transparent" strokeWidth={connectorHitStroke} fill="none" className="pointer-events-auto cursor-pointer" />
                </g>
              );
            });
          })}

          {/* 2. Image -> Prompt/Pending Connections (Follow-up Flow) */}
          {/* A. Existing Prompts */}
          {activeCanvas?.promptNodes.map(pn => {
            if (pn.isDraft) return null; // Draft/pending connection is rendered by pending-connection block below
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

            /* 🚀 新颜色逻辑：重绘为绿色，追问为金色 */
            const baseColor = pn.mode === GenerationMode.INPAINT ? '#22c55e' : '#eab308';
            const hoverClass = pn.mode === GenerationMode.INPAINT ? 'group-hover:stroke-green-400' : 'group-hover:stroke-yellow-400';

            return (
              <g key={`followup-${pn.id}`} className="group">
                {/* Curve - Bottom Layer */}
                <path
                  d={d}
                  fill="none"
                  stroke={baseColor}
                  strokeWidth={connectorStroke}
                  strokeDasharray={`${connectorDashA} ${connectorDashB}`}
                  strokeLinecap="round"
                  opacity="0.5"
                  className={`transition-opacity duration-200 ${hoverClass} group-hover:opacity-100`}
                />

                {/* Transparent Hit Area */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={connectorHitStroke}
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
            const hasDraftFollowup = !!activeCanvas?.promptNodes.some(p => p.isDraft && p.sourceImageId === activeSourceImage);
            if (hasDraftFollowup) return null;
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

            /* 🚀 新颜色逻辑对于待生成连接：利用配置中的模式判断 */
            const baseColor = config.mode === GenerationMode.INPAINT ? '#22c55e' : '#eab308';
            const hoverClass = config.mode === GenerationMode.INPAINT ? 'group-hover:stroke-green-400' : 'group-hover:stroke-yellow-400';

            return (
              <g key="pending-connection" className="group">
                <path
                  d={d}
                  fill="none"
                  stroke={baseColor}
                  strokeWidth={connectorStroke}
                  strokeDasharray={`${connectorDashA} ${connectorDashB}`}
                  strokeLinecap="round"
                  opacity="0.5"
                  className={`transition-opacity duration-200 ${hoverClass} group-hover:opacity-100`}
                />
                <path d={d} stroke="transparent" strokeWidth={connectorHitStroke} fill="none" className="pointer-events-auto cursor-pointer" />
                <circle cx={startX} cy={startY} r={connectorDotStart} fill={baseColor} opacity="0.6" />
                <circle cx={endX} cy={endY} r={connectorDotEnd} fill={baseColor} opacity="0.5" />

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
                selectNodes(nodeIds, 'replace');
                return;
              }

              if (alreadySelected.length > 0 && allNodesSelected) {
                return;
              }

              selectNodes(nodeIds, 'toggle');
            }}
            onGroupDrag={(delta, sourceNodeIds) => moveSelectedNodes(delta, sourceNodeIds)}
            onUpdateGroup={updateGroup}
            computedBounds={getComputedGroupBounds(group)}
          />
        ))}

        {/* 3. 持久化提示词节点 */}
        {visiblePromptNodes.map(node => (
          <PromptNodeComponent
            key={node.id}
            node={node}
            onPositionChange={updatePromptNodePosition}
            isSelected={selectedNodeIds.includes(node.id)}
            highlighted={highlightedId === node.id}
            onSelect={() => {
              selectNodes([node.id], (window.event as any)?.shiftKey ? 'toggle' : 'replace');
              // 🚀 Right Click triggers Selection Menu centered on node bounds
              if ((window.event as any)?.button === 2) {
                const pos = getSelectionScreenCenter([node.id]);
                if (pos) setSelectionMenuPosition(pos);
              }
            }}
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
            onExportPpt={handleExportPptPackage}
            onExportPptx={handleExportPptx}
            onRetryPptPage={handleRetryPptSinglePage}
            onExportPptPage={handleExportPptSinglePage}
            ioTrace={getNodeIoTrace(node.id)}
            onOpenStorageSettings={() => {
              setShowSettingsPanel(true);
              setSettingsInitialView('storage-settings');
            }}
            onDelete={deletePromptNode}
            onDisconnect={handleDisconnectPrompt}
            onUpdateNode={updatePromptNode}
            onHeightChange={(id, height) => {
              const latestNode = activeCanvas?.promptNodes.find(n => n.id === id);
              const targetNode = latestNode || node;
              if (targetNode.height !== height) {
                updatePromptNode({ ...targetNode, height });
              }
            }}
            onPin={handlePinDraft}
            onRemoveTag={(id, tag) => {
              const node = activeCanvas?.promptNodes.find(n => n.id === id);
              if (node && node.tags) {
                const newTags = node.tags.filter(t => t !== tag);
                updatePromptNode({ ...node, tags: newTags });
              }
            }}
            onDragDelta={(delta, sourceNodeId) => {
              if (!sourceNodeId) return;

              // 🚀 [主卡拖动逻辑] 如果拖动的是主卡(有childImageIds)，则同时拖动所有副卡
              const mainCard = activeCanvas?.promptNodes.find(p => p.id === sourceNodeId);
              const childImageIds = mainCard?.childImageIds || [];

              if (childImageIds.length > 0) {
                // 主卡拖动：移动主卡 + 所有副卡
                const allIdsToMove: string[] = [sourceNodeId, ...childImageIds.filter((id): id is string => !!id)];
                moveSelectedNodes(delta, allIdsToMove);
              } else if (selectedNodeIds.includes(sourceNodeId)) {
                moveSelectedNodes(delta, selectedNodeIds);
              } else {
                moveSelectedNodes(delta, sourceNodeId);
              }
              // 🚀 [Fix] Force re-render for real-time connection line updates
              setDragUpdateTick(t => t + 1);
            }} // 🚀 Enable Safe Relative Drag
            canvasTransform={canvasTransform} // 🚀 Pass Transform for Animation Calculation
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
            onDimensionsUpdate={updateImageNodeDisplayMeta}
            onUpdate={updateImageNode} // 🚀
            onDelete={deleteImageNode}
            onConnectEnd={handleConnectEnd}
            onClick={handleImageClick}
            isActive={node.id === activeSourceImage}
            isSelected={selectedNodeIds.includes(node.id)}
            onSelect={() => {
              selectNodes([node.id], (window.event as any)?.shiftKey ? 'toggle' : 'replace');
              // 🚀 Right Click triggers Selection Menu centered on node bounds
              if ((window.event as any)?.button === 2) {
                const pos = getSelectionScreenCenter([node.id]);
                if (pos) setSelectionMenuPosition(pos);
              }
            }}
            zoomScale={canvasTransform.scale}
            isMobile={isMobile}
            onPreview={handleOpenPreview}
            // 🚀 [Optimization] Identify if the node was created in the last 10 seconds
            isNew={Date.now() - (node.timestamp || 0) < 10000}
            canvasTransform={canvasTransform} // 🚀 Pass Transform for Animation Calculation
            onDragDelta={(delta, sourceNodeId) => {
              // 🚀 [副卡拖动逻辑] 如果拖动的是副卡(有parentPromptId)，只拖动副卡本身
              const isSubCard = node.parentPromptId && activeCanvas?.promptNodes.some(p => p.id === node.parentPromptId);

              if (isSubCard) {
                // 副卡拖动：只移动副卡本身，不移动主卡
                moveSelectedNodes(delta, sourceNodeId);
              } else if (sourceNodeId && selectedNodeIds.includes(sourceNodeId)) {
                moveSelectedNodes(delta, selectedNodeIds);
              } else {
                moveSelectedNodes(delta, sourceNodeId);
              }
              // 🚀 [Fix] Force re-render for real-time connection line updates
              setDragUpdateTick(t => t + 1);
            }} // 🚀 Enable Safe Relative Drag
          />
        ))}

        {/* 4. Pending / Typing Node */}
        {/* 4. Pending / Typing Node - Removed (Now handled by Persistent Draft DraftNode) */}
        {/* <PendingNode ... /> removed */}
      </InfiniteCanvas>



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
          onClearSource={handleClearSource}
          isMobile={isMobile}
          onOpenSettings={(view) => {
            setSettingsInitialView(view || 'api-management');
            setShowSettingsPanel(true);
            handleHideMobileNav(); // Hide nav when opening settings (optional, but requested behavior implies consistent handling)
          }}
          onInteract={handleShowMobileNav}
          onFocus={() => {
            console.log('[PromptBar] onFocus - 设置isPromptFocused=true');
            setIsPromptFocused(true);
          }}
          onBlur={() => {
            console.log('[PromptBar] onBlur - 设置isPromptFocused=false');
            setIsPromptFocused(false);
            // 失去焦点后,立即重新设置5秒定时器
            setTimeout(() => handleShowMobileNav(), 0);
          }}
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
          onHoverChange={(isHovered) => setIsSidebarHovered(isHovered)}
          onWidthChange={setChatSidebarWidth}
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
        maxTags={tagLimits.maxTags}
        maxChars={tagLimits.maxChars}
        allTags={allTags}
        inheritedTags={inheritedTags}
        isSubCard={isSubCard}
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
        onOpenSupplierManager={() => {
          setShowSettingsPanel(false);
          onOpenSupplierManager?.();
        }}
        onOpenCostEstimation={() => {
          setShowSettingsPanel(false);
          onOpenCostEstimation?.();
        }}
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







      {/* Project Manager (Replaces Canvas Manager) */}
      <ProjectManager
        onSearch={() => setIsSearchOpen(true)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
        isMobile={isMobile}
        onFitToAll={handleFitToAll}
        onResetView={handleResetView}
        onToggleGrid={handleToggleGrid}
        showGrid={showGrid}
        onAutoArrange={handleAutoArrange}
        onToggleChat={() => setIsChatOpen(prev => !prev)}
        isChatOpen={isChatOpen}
      />



      {/* [NEW] Draft Node Overlay (Fixed Center) - 🚀 [已禁用] 用户不想要追问时的预览卡片 */}
      {/* {draftNodeId && (() => {
        const draftNode = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
        // 🚀 [Fix] 只有当节点仍然是草稿时才显示叠加层，生成中的节点应该只在画布上显示
        if (!draftNode || !draftNode.isDraft) return null;

        // Mock position 0,0 for component, handle centering via container
        const displayNode = { ...draftNode, position: { x: 0, y: 0 } };

        // 🚀 [Sidebar Responsive Layout]
        // Calculate center for the overlay (Accurate widths from components)
        const overlayOffsets = getViewportOffsets(isSidebarOpen, isChatOpen, isMobile, chatSidebarWidth);
        const overlayLeft = overlayOffsets.left;
        const overlayRight = overlayOffsets.right;

        return (
          <div
            className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center transition-all duration-300"
            style={{
              paddingLeft: overlayLeft,
              paddingRight: overlayRight,
              // Move layout center above prompt bar
              paddingBottom: 110
            }}
          >
           
            <div className="relative pointer-events-auto transform translate-y-[50%]">
              <PromptNodeComponent
                node={displayNode}
                onPositionChange={() => { }} 
                isSelected={true}
                onSelect={() => { }}
                zoomScale={1} 
                isMobile={isMobile}
                onCancel={handleCancelGeneration}
               
                onConnectStart={() => { }}
                onPin={handlePinDraft} 
              />
            </div>
          </div>
        );
      })()} */}



      {/* 全局灯箱与搜索面板 (搜索面板置于底部，灯箱置于最上层) */}
      {previewImages && (
        <GlobalLightbox
          images={previewImages}
          initialIndex={previewInitialIndex}
          onClose={() => setPreviewImages(null)}
          onInpaint={(image, maskBase64, prompt) => {
            const userPrompt = (prompt || '局部重绘').trim();
            // 🚀 [简化对齐] 这里的 prompt 将会进入优化器，因此不需要带有太重的硬编码中文指令。
            // 只需要标明核心意图：如果是 mask，强调修改涂抹区域；如果是全局参考，强调重绘。
            const finalPrompt = maskBase64
              ? `${userPrompt} (change masked area only)`
              : `${userPrompt} (remix based on image)`;

            const sourceImage = activeCanvas?.imageNodes.find(img => img.id === image.id) || image;
            const parentPromptId = sourceImage.parentPromptId;
            const parentPrompt = activeCanvas?.promptNodes.find(p => p.id === parentPromptId);

            let nodePos = { x: sourceImage.position.x, y: sourceImage.position.y + 80 };
            if (parentPrompt && activeCanvas) {
              const siblingImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === parentPromptId);
              const maxY = siblingImages.reduce((acc, img) => Math.max(acc, img.position.y), parentPrompt.position.y);
              nodePos = { x: parentPrompt.position.x, y: maxY + 80 };
            }

            const promptNodeId = `${Date.now()}_inpaint_prompt`;

            const inpaintNode: PromptNode = {
              id: promptNodeId,
              prompt: finalPrompt,
              originalPrompt: finalPrompt,
              position: nodePos,
              aspectRatio: sourceImage.aspectRatio || config.aspectRatio,
              imageSize: sourceImage.imageSize || config.imageSize,
              model: sourceImage.model || config.model,
              modelLabel: sourceImage.modelLabel || undefined,
              provider: sourceImage.provider || undefined,
              providerLabel: sourceImage.providerLabel || undefined,
              childImageIds: [],
              referenceImages: [{
                id: sourceImage.id,
                data: sourceImage.originalUrl || sourceImage.url,
                mimeType: 'image/png'
              }],
              timestamp: Date.now(),
              sourceImageId: sourceImage.id,
              isGenerating: true,
              maskUrl: maskBase64,
              mode: GenerationMode.INPAINT,
              tags: []
            };

            addPromptNode(inpaintNode);
            executeGeneration(inpaintNode);
            setPreviewImages(null);
          }}
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

      {/* Navigation and Overlays Removed for Mobile Bottom Dock Consistency */}
      {showTutorial && (
        <TutorialOverlay
          onComplete={() => {
            setShowTutorial(false);
            localStorage.setItem('kk_tutorial_seen', 'true');
          }}
        />
      )}


      {/* AI聊天按钮 - 右下角固定 */}
      {/* AI聊天按钮 - 右下角固定 */}
      <div className="absolute bottom-6 z-50 transition-all duration-300 hidden md:block" style={{ right: isChatOpen ? `calc(min(100vw - 60px, ${chatSidebarWidth + 28}px))` : '48px' }}>
        <button
          id="chat-trigger-button"
          className="ai-chat-btn flex items-center justify-center cursor-pointer focus-visible:outline-none text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-blue-400/80 hover:shadow-[0_0_35px] bg-transparent overflow-hidden relative rounded-full aspect-square h-10 hover:scale-110 transition-all duration-300 p-2"
          type="button"
          onClick={() => setIsChatOpen(prev => !prev)}
        >
          <div className="uiverse w-full h-full absolute top-0 left-0 z-[-1] visible">
            <div className="circle circle-12"></div>
            <div className="circle circle-11"></div>
            <div className="circle circle-10"></div>
            <div className="circle circle-9"></div>
            <div className="circle circle-8"></div>
            <div className="circle circle-7"></div>
            <div className="circle circle-6"></div>
            <div className="circle circle-5"></div>
            <div className="circle circle-4"></div>
            <div className="circle circle-3"></div>
            <div className="circle circle-2"></div>
            <div className="circle circle-1"></div>
          </div>

          {/* 蓝色半透明遮罩层 */}
          <div className="absolute inset-0 rounded-full bg-blue-500/15 z-[1]"></div>

          {/* 星光图标 - 悬停时缓慢旋转90度 */}
          <svg
            className="ai-chat-icon relative z-10"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="rgba(255, 255, 255, 0.95)"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))' }}
          >
            <path d="M11.6061 4.23218C11.6838 3.79153 12.3162 3.79153 12.3939 4.23218L12.5268 4.98521C13.1111 8.29642 15.7036 10.8889 19.0148 11.4732L19.7678 11.6061C20.2085 11.6838 20.2085 12.3162 19.7678 12.3939L19.0148 12.5268C15.7036 13.1111 13.1111 15.7036 12.5268 19.0148L12.3939 19.7678C12.3162 20.2085 11.6838 20.2085 11.6061 19.7678L11.4732 19.0148C10.8889 15.7036 8.29642 13.1111 4.98521 12.5268L4.23218 12.3939C3.79153 12.3162 3.79153 11.6838 4.23218 11.6061L4.98521 11.4732C8.29642 10.8889 10.8889 8.29642 11.4732 4.98521L11.6061 4.23218Z" fill="rgba(255, 255, 255, 0.95)"></path>
          </svg>
          <style>{`
            .ai-chat-icon {
              transition: transform 0.7s ease-out;
            }
            .ai-chat-btn:hover .ai-chat-icon {
              transform: rotate(90deg);
            }
            .ai-chat-btn:hover .uiverse .circle {
              animation-duration: calc(var(--duration) / 3) !important;
            }
          `}</style>
        </button>
      </div>

      {/* 🚀 迁移弹窗 */}
      <MigrateModal
        isOpen={showMigrateModal}
        onClose={() => setShowMigrateModal(false)}
        canvases={state.canvases}
        currentCanvasId={state.activeCanvasId}
        selectedCount={selectedNodeIds.length}
        onMigrate={(targetCanvasId) => {
          // 🚀 处理"新建项目并迁移"
          if (targetCanvasId === '__new__') {
            // 创建新项目（返回新画布ID）
            const newCanvasId = createCanvas();
            if (newCanvasId) {
              // 🚀 直接使用返回的新画布ID进行迁移，无需等待state更新
              // 保存当前项目ID用于迁移
              const originalCanvasId = state.activeCanvasId;

              // 切换回原项目执行迁移
              switchCanvas(originalCanvasId);

              // 稍等一下确保切换完成后执行迁移
              setTimeout(() => {
                migrateNodes(selectedNodeIds, newCanvasId);
                switchCanvas(newCanvasId);

                import('./services/system/notificationService').then(({ notify }) => {
                  notify.success('迁移成功', `已创建新项目并迁移 ${selectedNodeIds.length} 个项目`);
                });
              }, 50);
            }
          } else {
            // 迁移到现有项目
            migrateNodes(selectedNodeIds, targetCanvasId);
          }
          setShowMigrateModal(false);
          clearSelection();
        }}
      />

      {/* 🚀 全局充值模态框 */}
      <RechargeModal />
    </div>
  );
};

const App: React.FC = () => {
  const { user, loading } = useAuth();

  // New Supplier System States
  const [showApiKeyManager, setShowApiKeyManager] = useState(false);
  const [showCostEstimation, setShowCostEstimation] = useState(false);

  // Global ApiKeyModal State
  const [showGlobalApiKeyModal, setShowGlobalApiKeyModal] = useState(false);
  const [editGlobalSupplier, setEditGlobalSupplier] = useState<Supplier | null>(null);

  // Global modal handlers
  const openGlobalApiKeyModal = (supplier?: Supplier) => {
    setEditGlobalSupplier(supplier || null);
    setShowGlobalApiKeyModal(true);
  };

  const closeGlobalApiKeyModal = () => {
    setShowGlobalApiKeyModal(false);
    setEditGlobalSupplier(null);
  };

  // Expose global API for opening modal from anywhere
  useEffect(() => {
    (window as any).openApiKeyModal = openGlobalApiKeyModal;
    apiKeyModalService.setOpenCallback(openGlobalApiKeyModal);
    return () => {
      delete (window as any).openApiKeyModal;
      apiKeyModalService.setOpenCallback(() => { });
    };
  }, [openGlobalApiKeyModal]);

  // Initialize update check on mount (must be before any conditional returns per React Rules of Hooks)
  useEffect(() => {
    // Dynamic Import for Update Check
    import('./services/system/updateCheck').then(({ initUpdateCheck }) => {
      initUpdateCheck();
    });
  }, []);

  // 🚀 Pre-load admin models for credit-based model display
  useEffect(() => {
    import('./services/model/adminModelService').then(({ adminModelService }) => {
      adminModelService.loadAdminModels();
    });
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

  // New Supplier System Pages
  if (showApiKeyManager) {
    return (
      <ThemeProvider>
        <ApiKeyManager
          onNavigateToPricing={() => {
            setShowApiKeyManager(false);
            setShowCostEstimation(true);
          }}
        />
      </ThemeProvider>
    );
  }

  if (showCostEstimation) {
    return (
      <ThemeProvider>
        <CostEstimation
          onBack={() => setShowCostEstimation(false)}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <BillingProvider>
        <CanvasProvider>
          <GpuBackground opacity={0.4} showConnections={true} />
          <NotificationToast />
          {/* <UpdateNotification /> moved to InfiniteCanvas */}
          <AppContent
            onOpenSupplierManager={() => setShowApiKeyManager(true)}
            onOpenCostEstimation={() => setShowCostEstimation(true)}
            onOpenGlobalApiKeyModal={openGlobalApiKeyModal}
          />
        </CanvasProvider>
      </BillingProvider>

      {/* Global API Key Modal - 在所有 Provider 之外，确保最高层级 */}
      <ApiKeyModal
        isOpen={showGlobalApiKeyModal}
        onClose={closeGlobalApiKeyModal}
        editSupplier={editGlobalSupplier}
      />
    </ThemeProvider>
  );
};

export default App;
// Force Rebuild
