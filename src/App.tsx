import React, { Suspense, lazy, useState, useCallback, useRef, useEffect, startTransition } from 'react';
import InfiniteCanvas, { InfiniteCanvasHandle } from './components/canvas/InfiniteCanvas';
import MobileChatFeed from './components/MobileChatFeed';

import PromptBar from './components/layout/PromptBar';
import ImageNode from './components/image/ImageCard';
import PptStackPreviewModal from './components/image/PptStackPreviewModal';
import PromptNodeComponent from './components/canvas/PromptNodeComponent';
import PendingNode from './components/canvas/PendingNode';
// KeyManagerModal removed - integrated into UserProfileModal
import ChatSidebar from './components/layout/ChatSidebar';
import { AspectRatio, ImageSize, GenerationConfig, PromptNode, GeneratedImage, GenerationMode, KnownModel, CanvasGroup } from './types';
import { Image as ImageIcon, Plus, Trash2, Shield, FileText, CheckCircle2, History, CreditCard, ChevronDown, Wand2, RefreshCw, Star, Coins, User, LayoutDashboard, LogOut, Settings, Zap, Sparkles } from 'lucide-react';
import { SelectionMenu } from './components/canvas/SelectionMenu';
import { CanvasGroupComponent } from './components/canvas/CanvasGroupComponent';
import { generateImage, cancelGeneration } from './services/llm/geminiService';
import { modelCaller } from './services/model/modelCaller';
import { getModelPricing, isCreditBasedModel, getModelCredits } from './services/model/modelPricing';
import { keyManager, getModelMetadata } from './services/auth/keyManager';
import { adminModelService } from './services/model/adminModelService';
import { unifiedModelService } from './services/model/unifiedModelService';
import { llmService } from './services/llm/LLMService';
import { cancelSecureSystemProxyTask } from './services/model/secureModelProxy';
import { getCardDimensions } from './utils/styleUtils';
import { getViewportPreferredPosition, findSafePosition } from './utils/canvasUtils'; // 馃殌 Smart Positioning
import { getViewportOffsets, getPromptBarFrontPosition } from './utils/canvasCenter';

const GENERATE_TRIGGER_COOLDOWN_MS = 500;
const GENERATE_SIGNATURE_DEDUP_MS = 4000;
const GENERATE_TIMEOUT_MS = 600000;

type Point = { x: number; y: number };
type SelectionBoxState = { start: Point; current: Point; active: boolean } | null;
type DragConnectionState = {
  active: boolean;
  startId: string;
  startPos: Point;
  currentPos: Point;
} | null;

// Lucide icons replaced with SVGs
import { CanvasProvider, useCanvas } from './context/CanvasContext';
import { ThemeProvider } from './context/ThemeContext';
import ConnectionDot from './components/canvas/ConnectionDot';
import LoginScreen from './components/auth/LoginScreen';
import AuthCallback from './pages/AuthCallback';
import type { UserProfileView } from './components/modals/UserProfileModal';
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
import { Search } from 'lucide-react'; // Import Search icon
import MobileTabBar from './components/mobile/MobileTabBar';
import MobileHeader from './components/mobile/MobileHeader'; // [NEW] Mobile Header
import GpuBackground from './components/layout/GpuBackground';
import type { Supplier } from './services/billing/supplierService';
import { apiKeyModalService } from './services/api/apiKeyModalService';

const UserProfileModal = lazy(() => import('./components/modals/UserProfileModal'));
const SettingsPanel = lazy(() => import('./components/settings/SettingsPanel'));
const SearchPalette = lazy(() => import('./components/layout/SearchPalette'));
const TagInputModal = lazy(() => import('./components/modals/TagInputModal'));
const TutorialOverlay = lazy(() => import('./components/common/TutorialOverlay'));
const StorageSelectionModal = lazy(() => import('./components/modals/StorageSelectionModal'));
const MigrateModal = lazy(async () => {
  const module = await import('./components/modals/MigrateModal');
  return { default: module.MigrateModal };
});
const GlobalLightbox = lazy(async () => {
  const module = await import('./components/image/GlobalLightbox');
  return { default: module.GlobalLightbox };
});
const RechargeModal = lazy(() => import('./components/modals/RechargeModal'));
const CostEstimation = lazy(() => import('./pages/CostEstimation'));

interface AppContentProps {
}

const AppContent: React.FC<AppContentProps> = () => {
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
    updatePromptNodePosition, updateImageNodePosition, updateImageNodeDimensions, updateImageNode, // 馃殌
    deletePromptNode,
    deleteImageNode,
    urgentUpdatePromptNode, // 馃殌 [New] 绱ф€ョ姸鎬佸悓姝?
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
    setViewportCenter, // 馃殌 瑙嗗彛涓績鍔ㄦ€佷紭鍏堢骇
    state, // 馃殌 杩佺Щ闇€瑕佽闂甤anvases鍒楄〃
    migrateNodes, // 馃殌 杩佺Щ鑺傜偣鍒板叾浠栭」鐩?
    createCanvas, // 馃殌 鍒涘缓鏂伴」鐩?
    switchCanvas  // 馃殌 鍒囨崲椤圭洰
  } = useCanvas();

  const { balance, loading: balanceLoading, showRechargeModal, setShowRechargeModal, consumeCredits, refundCredits } = useBilling();

  // Canvas Ref for Zoom/Pan Controls
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const autoRecoveredCanvasKeyRef = useRef<string>('');

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

  const resolveProviderDisplay = useCallback((keySlotId?: string, fallbackProviderLabel?: string, fallbackProvider?: string) => {
    if (fallbackProviderLabel) {
      return {
        provider: fallbackProvider,
        providerLabel: fallbackProviderLabel,
      };
    }

    if (keySlotId) {
      const provider = keyManager.getProvider(keySlotId);
      if (provider) {
        return {
          provider: provider.name || fallbackProvider,
          providerLabel: provider.name || fallbackProvider || 'Custom',
        };
      }

      const keySlot = keyManager.getKey(keySlotId);
      if (keySlot) {
        return {
          provider: String(keySlot.provider || fallbackProvider || ''),
          providerLabel: keySlot.name || String(keySlot.provider || fallbackProvider || 'Official'),
        };
      }
    }

    return {
      provider: fallbackProvider,
      providerLabel: fallbackProviderLabel || fallbackProvider,
    };
  }, []);

  // Track reserved regions for rapid-fire generation to prevent overlaps (before React update reflects)
  const reservedRegionsRef = useRef<{ bounds: { x: number; y: number; width: number; height: number }; timestamp: number; }[]>([]);



  // [鏂板姛鑳絔 鍏ㄥ眬鐏鐘舵€?(閽堝鍥剧墖娴忚)
  const [previewImages, setPreviewImages] = useState<GeneratedImage[] | null>(null);
  const [previewInitialIndex, setPreviewInitialIndex] = useState(0);
  const [pptStackPreview, setPptStackPreview] = useState<{ images: GeneratedImage[]; initialIndex: number } | null>(null);
  const [showMigrateModal, setShowMigrateModal] = useState(false); // 馃殌 杩佺Щ寮圭獥鐘舵€?

  const handleOpenPreview = useCallback((imageId: string) => {
    const canvas = activeCanvasRef.current;
    if (!canvas) return;

    const pptBundle = getOrderedPptPreviewBundle(imageId);
    if (pptBundle) {
      setPreviewImages(pptBundle.images);
      setPreviewInitialIndex(pptBundle.currentIndex);
      return;
    }

    // 1. 缂栫粍閫昏緫 (浼樺厛澶勭悊鐢诲竷缂栫粍)
    const group = canvas.groups.find(g => g.nodeIds.includes(imageId));
    let list: GeneratedImage[] = [];

    if (group) {
      list = canvas.imageNodes.filter(n => group.nodeIds.includes(n.id))
        .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
    } else {
      // 2. 鎻愮ず璇嶅鏃?Lineage)閫昏緫鏍?(鍖呭惈鐖跺浘銆佸彉浣撱€佹墿鍥俱€侀噸缁樼殑鏁存潯琛嶇敓閾?
      const graphImages = new Set<string>();
      const queue = [imageId];

      while (queue.length > 0) {
        const currId = queue.shift()!;
        if (!graphImages.has(currId)) {
          graphImages.add(currId);
          const img = canvas.imageNodes.find(n => n.id === currId);
          if (img) {
            // 鍚戜笂鎵撅細鍚岀骇鐨勫厔寮熷浘鐗囷紝浠ュ強瀛曡偛杩欎釜Prompt鐨勭埗鍥剧墖
            const prompt = canvas.promptNodes.find(p => p.id === img.parentPromptId);
            if (prompt) {
              prompt.childImageIds?.forEach(id => {
                if (!graphImages.has(id) && !queue.includes(id)) queue.push(id);
              });
              if (prompt.sourceImageId && !graphImages.has(prompt.sourceImageId) && !queue.includes(prompt.sourceImageId)) {
                queue.push(prompt.sourceImageId);
              }
            }
            // 鍚戜笅鎵撅細浠ュ綋鍓嶅浘鐗囦綔涓虹埗鍥捐鐢熷嚭鐨勫瓙鍗＄粍鍥剧墖
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
        // 3. 鍏滃簳閫昏緫 (鍗曞紶鍥剧墖)
        const target = canvas.imageNodes.find(n => n.id === imageId);
        if (target) list = [target];
      }
    }

    if (list.length > 0) {
      const idx = list.findIndex(n => n.id === imageId);
      setPreviewImages(list);
      setPreviewInitialIndex(idx >= 0 ? idx : 0);
    }
  }, [getOrderedPptPreviewBundle]);

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
  const [settingsInitialSupplier, setSettingsInitialSupplier] = useState<Supplier | null>(null);
  const [settingsPanelSessionKey, setSettingsPanelSessionKey] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const openSettingsPanel = useCallback((
    view: 'dashboard' | 'api-management' | 'storage-settings' | 'system-logs' = 'api-management',
    supplier: Supplier | null = null
  ) => {
    setSettingsPanelSessionKey((prev) => prev + 1);
    setSettingsInitialSupplier(supplier);
    setSettingsInitialView(view);
    setShowSettingsPanel(true);
  }, []);

  useEffect(() => {
    const openApiManagement = (supplier?: Supplier) => {
      openSettingsPanel('api-management', supplier || null);
    };

    (window as any).openApiKeyModal = openApiManagement;
    apiKeyModalService.setOpenCallback(openApiManagement);

    return () => {
      delete (window as any).openApiKeyModal;
      apiKeyModalService.setOpenCallback(() => {});
    };
  }, [openSettingsPanel]);

  useEffect(() => {
    const unsubscribe = keyManager.subscribe(() => {
      setKeyStats(keyManager.getStats());
    });
    return unsubscribe;
  }, []);

  // Mobile Nav Bar Visibility (Swipe to Show, Auto Hide)
  const [isMobileNavVisible, setIsMobileNavVisible] = useState(false);
  const mobileNavTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isPromptFocused, setIsPromptFocused] = useState(false); // 璺熻釜杈撳叆妗嗙劍鐐圭姸鎬?
  const [isSidebarHovered, setIsSidebarHovered] = useState(false); // 璺熻釜渚ц竟鏍廻over鐘舵€?
  const lastMouseMoveRef = useRef<number>(Date.now()); // 璁板綍鏈€鍚庝竴娆￠紶鏍囩Щ鍔ㄦ椂闂?

  const handleShowMobileNav = useCallback(() => {
    const timeSinceLastMouseMove = Date.now() - lastMouseMoveRef.current;
    const isMouseActive = timeSinceLastMouseMove < 5000; // 5绉掑唴鏈夐紶鏍囨椿鍔?

    console.log('[handleShowMobileNav] isPromptFocused:', isPromptFocused, 'isSidebarHovered:', isSidebarHovered, 'isMouseActive:', isMouseActive);
    setIsMobileNavVisible(true);
    // 娓呴櫎鏃у畾鏃跺櫒
    if (mobileNavTimerRef.current) {
      clearTimeout(mobileNavTimerRef.current);
    }
    // 濡傛灉杈撳叆妗嗘湁鐒︾偣銆侀紶鏍囧湪渚ц竟鏍忎笂銆佹垨榧犳爣姝ｅ湪娲诲姩,涓嶈缃嚜鍔ㄩ殣钘忓畾鏃跺櫒
    if (!isPromptFocused && !isSidebarHovered && !isMouseActive) {
      console.log('[handleShowMobileNav] 设置 5 秒自动隐藏定时器');
      mobileNavTimerRef.current = setTimeout(() => {
        console.log('[handleShowMobileNav] 5 秒后自动隐藏');
        setIsMobileNavVisible(false);
      }, 5000);
    } else {
      console.log('[handleShowMobileNav] 不设置定时器，当前仍有交互', { isPromptFocused, isSidebarHovered, isMouseActive });
    }
  }, [isPromptFocused, isSidebarHovered]);

  const handleHideMobileNav = useCallback(() => {
    setIsMobileNavVisible(false);
    if (mobileNavTimerRef.current) {
      clearTimeout(mobileNavTimerRef.current);
    }
  }, []);

  // 鍏ㄥ眬榧犳爣绉诲姩鐩戝惉 - 閲嶇疆瀹氭椂鍣?
  useEffect(() => {
    const handleGlobalMouseMove = () => {
      lastMouseMoveRef.current = Date.now();
      // 榧犳爣绉诲姩鏃?濡傛灉渚ц竟鏍忓彲瑙佷笖娌℃湁娲诲姩瀹氭椂鍣?閲嶆柊鏄剧ず骞堕噸缃畾鏃跺櫒
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

  // 馃殌 New State for enhanced TagInputModal
  const [allTags, setAllTags] = useState<string[]>([]);
  const [inheritedTags, setInheritedTags] = useState<string[]>([]);
  const [isSubCard, setIsSubCard] = useState(false);

  const handleTag = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    setTaggingNodeIds(selectedNodeIds);

    const firstId = selectedNodeIds[0];
    const promptNode = activeCanvas?.promptNodes.find(n => n.id === firstId);
    const imageNode = activeCanvas?.imageNodes.find(n => n.id === firstId);

    // 馃殌 Collect all existing tags from canvas for suggestions
    const allPromptTags = activeCanvas?.promptNodes.flatMap(n => n.tags || []) || [];
    const allImageTags = activeCanvas?.imageNodes.flatMap(n => n.tags || []) || [];
    const uniqueAllTags = [...new Set([...allPromptTags, ...allImageTags])];
    setAllTags(uniqueAllTags);

    // Determine if editing Sub Card and find inherited tags
    if (imageNode) {
      // 馃殌 Sub Card - find parent's tags
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

    // 馃殌 Deduplication Logic: If Main Card adds a tag, remove from its Sub Cards
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

    // 馃殌 File System Shortcut Integration
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
        // 馃殌 [淇] 浠呭棣栨鐢ㄦ埛鏄剧ず API 璁剧疆闈㈡澘锛岃繑鍥炵敤鎴蜂笉鑷姩寮瑰嚭
        const hasKeys = keyManager.hasValidKeys();
        if (!hasKeys && !hasLoggedInBefore && !isDevMode) {
          // 鍙湁棣栨鐢ㄦ埛鎵嶈嚜鍔ㄥ脊鍑?API 璁剧疆闈㈡澘
          openSettingsPanel('api-management');
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
          prompt: parsed.prompt || '', // 馃殌 鎭㈠鎸佷箙鍖栫殑 Prompt
          enablePromptOptimization: parsed.enablePromptOptimization || false,
          aspectRatio: AspectRatio.AUTO, // [Default: Auto]
          imageSize: ImageSize.SIZE_1K,
          parallelCount: parsed.parallelCount || 1,
          // 馃殌 [Fix] 鎭㈠鍙傝€冨浘鍏冩暟鎹紙涓嶅惈 base64锛夛紝璁?hydrate effect 浠?IndexedDB 杩樺師鍥剧墖鏁版嵁
          referenceImages: (parsed.referenceImages || []).map((img: any) => ({
            ...img,
            data: undefined // data 闇€瑕佷粠 IndexedDB hydrate锛屼笉浠?localStorage 鎭㈠
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
      // 馃殌 [New] 琛ラ綈缂哄け鐨勮棰戙€侀煶棰戝強鎻愮ず璇嶅瓧娈?
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
    config.prompt, config.videoResolution, config.videoDuration, config.videoAudio, config.audioDuration, config.audioLyrics, config.maskUrl, config.editMode // 馃殌 鍏ㄩ噺渚濊禆鐩戝惉
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
        sub = '剩余预算低于 1%，请立即充值。';
      } else if (remainingPercent < 10) {
        alertKey = 'warning';
        title = 'API 预算不足';
        sub = '剩余预算低于 10%。';
      } else if (remainingPercent < 20) {
        alertKey = 'low';
        title = 'API 预算提醒';
        sub = '剩余预算低于 20%。';
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
  const [isCanvasTransforming, setIsCanvasTransforming] = useState(false);

  // 馃殌 鍚屾瑙嗗彛涓績鍒癈anvasContext锛堢敤浜庡姩鎬佷紭鍏堢骇鍔犺浇锛?
  useEffect(() => {
    // 璁＄畻褰撳墠瑙嗗彛涓績鍦ㄧ敾甯冨潗鏍囦腑鐨勪綅缃?
    const centerX = (window.innerWidth / 2 - canvasTransform.x) / canvasTransform.scale;
    const centerY = (window.innerHeight / 2 - canvasTransform.y) / canvasTransform.scale;
    setViewportCenter({ x: centerX, y: centerY });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasTransform]); // 馃殌 绉婚櫎setViewportCenter渚濊禆闃叉鏃犻檺寰幆

  // Derived Pending Position: Always Center (or linked to source)
  const pendingPosition = React.useMemo(() => {
    if (activeSourceImage && activeCanvas) {
      const sourceImage = activeCanvas.imageNodes.find(img => img.id === activeSourceImage);
      if (sourceImage) {
        // 馃殌 杩介棶妯″紡锛氭柊涓诲崱鏀惧湪鍘熺埗鍗＄粍涓嬫柟
        const parentPromptId = sourceImage.parentPromptId;
        const parentPrompt = activeCanvas.promptNodes.find(p => p.id === parentPromptId);

        if (parentPrompt) {
          // 鎵惧埌鐖朵富鍗′笅鎵€鏈夊瓙鍗★紝璁＄畻鏈€澶浣嶇疆
          const siblingImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === parentPromptId);
          let maxY = parentPrompt.position.y; // 鐖朵富鍗＄殑Y浣嶇疆锛堝簳閮ㄩ敋鐐癸級

          // 璁＄畻鎵€鏈夊瓙鍗＄殑鏈€澶浣嶇疆锛堝簳閮級
          siblingImages.forEach(img => {
            const { totalHeight } = getCardDimensions(img.aspectRatio, true);
            const imgBottom = img.position.y + totalHeight;
            maxY = Math.max(maxY, imgBottom);
          });

          const GAP = 60; // 鏂颁富鍗′笌瀛愬崱缁勭殑闂磋窛
          return {
            x: parentPrompt.position.x,  // 涓庣埗涓诲崱X瀵归綈
            y: maxY + GAP  // 鏀惧湪鏈€涓嬫柟瀛愬崱鐨勪笅闈?
          };
        }

        // 濡傛灉娌℃湁鐖朵富鍗★紙瀛ゅ効鍓崱锛夛紝鏀惧湪婧愬浘鐗囦笅鏂?
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
    // 馃殌 [Fix] 浣跨敤 InfiniteCanvas 鐨勫疄闄呭彲瑙佸尯鍩?+ 瀹炴椂 transform 璁＄畻绮剧‘涓績
    const currentTf = canvasRef.current?.getCurrentTransform() || canvasTransform;
    const vpRect = canvasRef.current?.getCanvasRect() || null;
    return getViewportPreferredPosition(currentTf, vpRect, 180);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceImage, activeCanvas, canvasTransform]);

  // [Draft Feature] Persistent Input Card State - Moved to Top





  // 馃殌 娓呴櫎杩介棶婧愬浘鐗囷紝鍚屾椂鍒犻櫎杩介棶Draft鑺傜偣
  const handleClearSource = useCallback(() => {
    setActiveSourceImage(null);
    // 濡傛灉鏈夎拷闂瓺raft涓旀病鏈夊唴瀹癸紝鍒犻櫎瀹?
    if (draftNodeId) {
      const draftNode = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
      if (draftNode && draftNode.sourceImageId && !draftNode.prompt.trim()) {
        // 鍙湁褰揇raft鏄拷闂ā寮?鏈塻ourceImageId)涓旀病鏈夊唴瀹规椂鎵嶅垹闄?
        deletePromptNode(draftNodeId);
        setDraftNodeId(null);
      }
    }
  }, [draftNodeId, activeCanvas, deletePromptNode]);

  // Right-Click Selection State
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState>(null);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const selectionBoxRef = useRef<SelectionBoxState>(null);
  const selectionBoxFrameRef = useRef<number | null>(null);
  const pendingSelectionPointRef = useRef<Point | null>(null);

  useEffect(() => {
    selectionBoxRef.current = selectionBox;
  }, [selectionBox]);

  const flushPendingSelectionBox = useCallback(() => {
    if (selectionBoxFrameRef.current !== null) {
      cancelAnimationFrame(selectionBoxFrameRef.current);
      selectionBoxFrameRef.current = null;
    }

    const pendingPoint = pendingSelectionPointRef.current;
    const currentSelection = selectionBoxRef.current;
    if (!pendingPoint || !currentSelection) return currentSelection;

    const nextSelection = { ...currentSelection, current: pendingPoint };
    selectionBoxRef.current = nextSelection;
    pendingSelectionPointRef.current = null;
    setSelectionBox(nextSelection);
    return nextSelection;
  }, []);

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
      const nextSelectionBox = {
        start: { x: e.clientX, y: e.clientY },
        current: { x: e.clientX, y: e.clientY },
        active: true
      };
      selectionBoxRef.current = nextSelectionBox;
      pendingSelectionPointRef.current = null;
      setSelectionBox(nextSelectionBox);
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!selectionBoxRef.current?.active) return;

    pendingSelectionPointRef.current = { x: e.clientX, y: e.clientY };
    if (selectionBoxFrameRef.current !== null) return;

    selectionBoxFrameRef.current = window.requestAnimationFrame(() => {
      selectionBoxFrameRef.current = null;
      const pendingPoint = pendingSelectionPointRef.current;
      const currentSelection = selectionBoxRef.current;
      if (!pendingPoint || !currentSelection) return;

      const nextSelection = { ...currentSelection, current: pendingPoint };
      selectionBoxRef.current = nextSelection;
      setSelectionBox(nextSelection);
    });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const currentSelectionBox = flushPendingSelectionBox() ?? selectionBoxRef.current;
    if (currentSelectionBox?.active) {
      const startX = Math.min(currentSelectionBox.start.x, currentSelectionBox.current.x);
      const startY = Math.min(currentSelectionBox.start.y, currentSelectionBox.current.y);
      const endX = Math.max(currentSelectionBox.start.x, currentSelectionBox.current.x);
      const endY = Math.max(currentSelectionBox.start.y, currentSelectionBox.current.y);
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
          // 馃殌 Shift=鍔犻€? Ctrl=鍑忛€? 鏃犱慨楗伴敭=鏇挎崲
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
      // 馃殌 Show selection menu centered on selection bounds (not at mouse)
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
      selectionBoxRef.current = null;
      pendingSelectionPointRef.current = null;
      setSelectionBox(null);
    }
  }, [flushPendingSelectionBox, canvasTransform, activeCanvas, selectNodes, clearSelection, selectedNodeIds, getCardDimensions]);



  // Connection Dragging State
  const [dragConnection, setDragConnection] = useState<DragConnectionState>(null);
  const dragConnectionRef = useRef<DragConnectionState>(null);
  const dragConnectionFrameRef = useRef<number | null>(null);
  const pendingDragConnectionPointRef = useRef<Point | null>(null);

  useEffect(() => {
    dragConnectionRef.current = dragConnection;
  }, [dragConnection]);

  const flushPendingDragConnection = useCallback(() => {
    if (dragConnectionFrameRef.current !== null) {
      cancelAnimationFrame(dragConnectionFrameRef.current);
      dragConnectionFrameRef.current = null;
    }

    const pendingPoint = pendingDragConnectionPointRef.current;
    const currentDragConnection = dragConnectionRef.current;
    if (!pendingPoint || !currentDragConnection) return currentDragConnection;

    const nextDragConnection = { ...currentDragConnection, currentPos: pendingPoint };
    dragConnectionRef.current = nextDragConnection;
    pendingDragConnectionPointRef.current = null;
    setDragConnection(nextDragConnection);
    return nextDragConnection;
  }, []);
  const [isGenerating, setIsGenerating] = useState(false);
  const lastGenerateAtRef = useRef(0);
  const lastGenerateSignatureRef = useRef<{ value: string; at: number } | null>(null);
  const pollTaskStatusRef = useRef<((node: PromptNode, taskIdOverride?: string) => Promise<void>) | null>(null);
  // error state removed, using notify service
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatSidebarWidth, setChatSidebarWidth] = useState(420);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // 浣跨敤鏂板皝瑁呯殑 CanvasCenter API锛堝紩鍏ヨ嚜 src/utils/canvasCenter.ts锛?

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

  useEffect(() => {
    return () => {
      if (selectionBoxFrameRef.current !== null) {
        cancelAnimationFrame(selectionBoxFrameRef.current);
      }
      if (dragConnectionFrameRef.current !== null) {
        cancelAnimationFrame(dragConnectionFrameRef.current);
      }
    };
  }, []);

  const handleRootMouseMove = useCallback((e: React.MouseEvent) => {
    handleMouseMove(e);

    if (!dragConnectionRef.current?.active) return;

    pendingDragConnectionPointRef.current = {
      x: (e.clientX - canvasTransform.x) / canvasTransform.scale,
      y: (e.clientY - canvasTransform.y) / canvasTransform.scale,
    };

    if (dragConnectionFrameRef.current !== null) return;

    dragConnectionFrameRef.current = window.requestAnimationFrame(() => {
      dragConnectionFrameRef.current = null;
      const pendingPoint = pendingDragConnectionPointRef.current;
      const currentDragConnection = dragConnectionRef.current;
      if (!pendingPoint || !currentDragConnection) return;

      const nextDragConnection = { ...currentDragConnection, currentPos: pendingPoint };
      dragConnectionRef.current = nextDragConnection;
      setDragConnection(nextDragConnection);
    });
  }, [handleMouseMove, canvasTransform]);

  const handleRootMouseUp = useCallback((e: React.MouseEvent) => {
    handleMouseUp(e);

    if (dragConnectionRef.current?.active) {
      if (dragConnectionFrameRef.current !== null) {
        cancelAnimationFrame(dragConnectionFrameRef.current);
        dragConnectionFrameRef.current = null;
      }
      pendingDragConnectionPointRef.current = null;
      dragConnectionRef.current = null;
      setDragConnection(null);
    }
  }, [handleMouseUp]);

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
            // 馃殌 [Smart Re-centering]
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

    // User requested "Zoom and Pan" (骞崇Щ骞剁缉鏀?
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

  // 馃殌 Helper: Compute selection bounds center in screen coordinates
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

  // 馃殌 瀹氫綅鍗＄粍锛氫紭鍏堝畾浣嶉€変腑鍗＄粍锛屾棤閫変腑鏃跺畾浣嶆渶鏂?
  const handleResetView = useCallback(() => {
    if (!activeCanvas) return;

    // 1. 濡傛灉鏈夐€変腑鐨勮妭鐐癸紝浼樺厛瀹氫綅鍒伴€変腑鐨勫崱缁?
    if (selectedNodeIds.length > 0) {
      // 鎵惧埌閫変腑鐨勬彁绀鸿瘝鑺傜偣鍜屽浘鐗囪妭鐐?
      const selectedPrompts = activeCanvas.promptNodes.filter(p => selectedNodeIds.includes(p.id));
      const selectedImages = activeCanvas.imageNodes.filter(img => selectedNodeIds.includes(img.id));

      // 璁＄畻閫変腑鑺傜偣鐨勪腑蹇冧綅缃?
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

    // 2. 鏃犻€変腑鏃讹紝瀹氫綅鍒版渶鏂扮敓鎴愮殑鍗＄粍
    const prompts = activeCanvas.promptNodes;
    if (prompts.length === 0) {
      const latestImage = [...activeCanvas.imageNodes].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
      if (latestImage) {
        handleNavigateToNode(latestImage.position.x, latestImage.position.y);
        return;
      }
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

  // 澶勭悊鎷栧叆鍥剧墖鍒涘缓瀛ょ嫭鍓崱
  const handleImageDrop = useCallback(async (file: File, canvasPosition: { x: number; y: number }) => {
    if (!activeCanvas) return;

    try {
      // 璇诲彇鍥剧墖
      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) return;

        // 鑾峰彇鍥剧墖灏哄
        const img = new Image();
        img.onload = async () => {
          const calc = await import('./utils/imageUtils');
          const storageId = await calc.calculateImageHash(dataUrl.split(',')[1]);

          // 淇濆瓨鍒板瓨鍌?
          const storage = await import('./services/storage/imageStorage');
          await storage.saveImage(storageId, dataUrl).catch(err =>
            console.error("Failed to save dropped image", err)
          );

          // 璁＄畻瀹介珮姣?
          const calcAspect = (w: number, h: number): AspectRatio => {
            const ratio = w / h;
            if (Math.abs(ratio - 1) < 0.1) return AspectRatio.SQUARE;
            if (ratio < 1) return AspectRatio.PORTRAIT_3_4;
            return AspectRatio.LANDSCAPE_4_3;
          };

          // 鍒涘缓瀛ょ嫭鍓崱
          const newImage: GeneratedImage = {
            id: Date.now().toString(),
            storageId,
            url: dataUrl,
            prompt: `拖入图片：${file.name}`,
            aspectRatio: calcAspect(img.width, img.height),
            timestamp: Date.now(),
            model: 'uploaded',
            canvasId: activeCanvas.id,
            parentPromptId: '', // 瀛ょ嫭鍗＄墖鏃犵埗鑺傜偣
            position: canvasPosition,
            dimensions: `${img.width}脳${img.height}`,
            orphaned: true, // 鏍囪涓哄鐙崱鐗?
            fileName: file.name,
            fileSize: file.size
          };

          addImageNodes([newImage]);

          // 閫氱煡鐢ㄦ埛
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

  const handleCancelGeneration = useCallback(async (id?: string) => {
    // If ID provided, cancel specific
    if (id) {
      cancelGeneration(id);
      if (activeCanvas) {
        const node = activeCanvas.promptNodes.find(n => n.id === id);
        if (node) {
          if (node.jobId?.startsWith('system_proxy:')) {
            try {
              await cancelSecureSystemProxyTask(node.jobId);
            } catch (error) {
              console.warn('[handleCancelGeneration] 取消系统任务失败:', error);
            }
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
        }
      }
    } else {
      // If no ID, cancel ALL generating nodes (Global Stop)
      if (activeCanvas) {
        const generatingNodes = activeCanvas.promptNodes.filter(n => n.isGenerating);
        await Promise.allSettled(generatingNodes.map(async (node) => {
          // Cancel all parallel requests for this node
          const count = node.parallelCount || 1;
          for (let i = 0; i < count; i++) {
            cancelGeneration(`${node.id}-${i}`);
          }

          if (node.jobId?.startsWith('system_proxy:')) {
            try {
              await cancelSecureSystemProxyTask(node.jobId);
            } catch (error) {
              console.warn('[handleCancelGeneration] 批量取消系统任务失败:', error);
            }
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
        }));
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
      requestPath: error?.requestPath ? String(error.requestPath) : (error?.request?.path ? String(error.request.path) : undefined),
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

    if (!details.code && !details.status && !details.requestPath && !details.requestBody && !details.responseBody && !details.provider) {
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

  const buildPptPageAlias = useCallback((raw: string | undefined, pageIndex: number) => {
    const parsed = parsePptOutlineLine(raw);
    const title = parsed.title || parsed.subtitle || String(raw || '').trim();
    return title || `第 ${pageIndex + 1} 页`;
  }, [parsePptOutlineLine]);

  function getOrderedPptPreviewBundle(imageId: string) {
    const canvas = activeCanvasRef.current;
    if (!canvas) return null;

    const target = canvas.imageNodes.find((img) => img.id === imageId);
    if (!target || target.mode !== GenerationMode.PPT || !target.parentPromptId) {
      return null;
    }

    const promptNode = canvas.promptNodes.find((node) => node.id === target.parentPromptId);
    if (!promptNode) return null;

    const orderedIds = (promptNode.childImageIds || []).filter(Boolean) as string[];
    const fallbackOrder = canvas.imageNodes
      .filter((img) => img.parentPromptId === promptNode.id)
      .sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x) || (a.timestamp - b.timestamp))
      .map((img) => img.id);
    const finalOrder = orderedIds.length > 0 ? orderedIds : fallbackOrder;

    const images = finalOrder
      .map((id) => canvas.imageNodes.find((img) => img.id === id))
      .filter((img): img is GeneratedImage => !!img);

    if (images.length === 0) return null;

    const currentIndex = Math.max(0, images.findIndex((img) => img.id === imageId));
    return {
      promptNode,
      images,
      currentIndex,
    };
  }

  const resolvePptImageBlob = useCallback(async (image: GeneratedImage): Promise<Blob> => {
    const { getStrictOriginalImage } = await import('./services/storage/imageStorage');
    const { base64ToBlob } = await import('./utils/downloadUtils');

    let source = await getStrictOriginalImage(image.id);
    if (!source && image.storageId && image.storageId !== image.id) {
      source = await getStrictOriginalImage(image.storageId);
    }
    if (!source) {
      source = image.originalUrl || image.url;
    }
    if (!source) {
      throw new Error('未找到可用的图片源');
    }

    if (source.startsWith('data:')) {
      return base64ToBlob(source);
    }
    if (source.startsWith('blob:')) {
      const response = await fetch(source);
      if (!response.ok) throw new Error('无法读取本地图片数据');
      return await response.blob();
    }

    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`下载图片失败：HTTP ${response.status}`);
    }
    return await response.blob();
  }, []);

  const stitchPptImagesToBlob = useCallback(async (images: GeneratedImage[]) => {
    const loaded = await Promise.all(images.map(async (image) => {
      const blob = await resolvePptImageBlob(image);
      const objectUrl = URL.createObjectURL(blob);
      try {
        const element = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('图片加载失败'));
          img.src = objectUrl;
        });
        return {
          width: element.naturalWidth,
          height: element.naturalHeight,
          element,
        };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }));

    const maxWidth = Math.max(...loaded.map((item) => item.width));
    const scaledHeights = loaded.map((item) => Math.round(item.height * (maxWidth / item.width)));
    const rawTotalHeight = scaledHeights.reduce((sum, value) => sum + value, 0);
    const maxCanvasHeight = 32000;
    const downscale = rawTotalHeight > maxCanvasHeight ? maxCanvasHeight / rawTotalHeight : 1;
    const targetWidth = Math.max(1, Math.round(maxWidth * downscale));
    const finalHeights = scaledHeights.map((value) => Math.max(1, Math.round(value * downscale)));
    const totalHeight = finalHeights.reduce((sum, value) => sum + value, 0);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = totalHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建整屏导出画布');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    let offsetY = 0;
    loaded.forEach((item, index) => {
      const height = finalHeights[index];
      context.drawImage(item.element, 0, offsetY, targetWidth, height);
      offsetY += height;
    });

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', 1);
    });

    if (!blob) {
      throw new Error('整屏导出失败');
    }

    return blob;
  }, [resolvePptImageBlob]);

  const handleOpenPptStackPreview = useCallback((imageId: string) => {
    const bundle = getOrderedPptPreviewBundle(imageId);
    if (!bundle) return;

    setPptStackPreview({
      images: bundle.images,
      initialIndex: bundle.currentIndex,
    });
  }, [getOrderedPptPreviewBundle]);

  const handleDownloadPptComposite = useCallback(async (imageId: string) => {
    const bundle = getOrderedPptPreviewBundle(imageId);
    if (!bundle) return;

    try {
      const blob = await stitchPptImagesToBlob(bundle.images);
      saveAs(blob, `ppt-full-screen-${Date.now()}.png`);
      import('./services/system/notificationService').then(({ notify }) => {
        notify.success('导出完成', `已导出 ${bundle.images.length} 页整屏长图`);
      });
    } catch (error: any) {
      import('./services/system/notificationService').then(({ notify }) => {
        notify.error('整屏导出失败', error?.message || '请稍后重试');
      });
    }
  }, [getOrderedPptPreviewBundle, stitchPptImagesToBlob]);

  const handleEditPptTextFromLightbox = useCallback((image: GeneratedImage) => {
    const bundle = getOrderedPptPreviewBundle(image.id);
    if (!bundle) return;

    const currentText = bundle.promptNode.pptSlides?.[bundle.currentIndex]
      || image.alias
      || buildPptPageAlias(undefined, bundle.currentIndex);
    const nextText = window.prompt(`编辑第 ${bundle.currentIndex + 1} 页文字`, currentText);
    if (nextText === null) return;

    const trimmed = nextText.trim();
    if (!trimmed) {
      import('./services/system/notificationService').then(({ notify }) => {
        notify.warning('内容为空', '请输入当前页面的标题或描述');
      });
      return;
    }

    const nextSlides = [...(bundle.promptNode.pptSlides || [])];
    while (nextSlides.length < bundle.images.length) {
      nextSlides.push(buildPptPageAlias(undefined, nextSlides.length));
    }
    nextSlides[bundle.currentIndex] = trimmed;

    updatePromptNode({
      ...bundle.promptNode,
      pptSlides: nextSlides,
      parallelCount: Math.max(bundle.promptNode.parallelCount || 1, nextSlides.length),
    });

    updateImageNode(image.id, {
      alias: buildPptPageAlias(trimmed, bundle.currentIndex),
    });

    setPreviewImages((prev) => prev?.map((item) => (
      item.id === image.id
        ? { ...item, alias: buildPptPageAlias(trimmed, bundle.currentIndex) }
        : item
    )) || prev);

    setPptStackPreview((prev) => prev ? {
      ...prev,
      images: prev.images.map((item) => (
        item.id === image.id
          ? { ...item, alias: buildPptPageAlias(trimmed, bundle.currentIndex) }
          : item
      )),
    } : prev);

    import('./services/system/notificationService').then(({ notify }) => {
      notify.success('页面文案已更新', `第 ${bundle.currentIndex + 1} 页已同步到主卡设置`);
    });
  }, [buildPptPageAlias, getOrderedPptPreviewBundle, updateImageNode, updatePromptNode]);

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

  const normalizePptSlidesForCount = useCallback((
    rawSlides: string[] | undefined,
    topicRaw: string,
    totalRaw: number
  ) => {
    const total = Math.min(20, Math.max(1, Number(totalRaw) || 1));
    const manualSlides = (rawSlides || [])
      .map((line) => String(line || '').trim())
      .filter(Boolean)
      .slice(0, total);

    if (manualSlides.length >= total) {
      return manualSlides.slice(0, total);
    }

    const autoSlides = buildAutoPptSlides(topicRaw, total);
    return Array.from({ length: total }, (_, index) => (
      manualSlides[index] || autoSlides[index] || `第 ${index + 1} 页：${String(topicRaw || '').trim() || '主题演示'}`
    ));
  }, [buildAutoPptSlides]);

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
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cardsInCurrentRow = Math.min(columns, Math.max(1, safeTotalCount - row * columns));

    if (mode === GenerationMode.PPT) {
      const pptGap = 28;
      return {
        x: basePosition.x,
        y: basePosition.y + gapToImages + cardHeight + index * (cardHeight + pptGap),
      };
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
  }, [isMobile]);

  // Extracted Execution Logic
  const executeGeneration = useCallback(async (node: PromptNode) => {
    const { id: promptNodeId, prompt: promptToUse, parallelCount: count = 1, model: initialModel, mode, referenceImages: initialFiles = [] } = node;
    const generationPrompt = (node.promptOptimizationEnabled && node.optimizedPromptEn?.trim())
      ? node.optimizedPromptEn.trim()
      : promptToUse;
    let effectiveModel = initialModel;
    let successResults: GeneratedImage[] = [];
    let generationTotalCount = Math.max(1, Number(count) || 1);
    let generationSuccessCount = 0;
    let generationFailCount = 0;
    let partialFailureDetails: PromptNode['errorDetails'] | undefined = undefined;

    // 🚀 [Performance Fix] 异步加载参考图（如果在 handleGenerate 中没有加载完成）
    const { getImage } = await import('./services/storage/imageStorage');
    const { fileSystemService } = await import('./services/storage/fileSystemService');
    const globalHandle = fileSystemService.getGlobalHandle();
    
    const hydratedFiles = await Promise.all(
      initialFiles.map(async (img) => {
        // 如果已经有 data，直接返回
        if (img.data && img.data.length > 100) {
          return img;
        }
        
        // 尝试从 storageId 加载
        if (img.storageId) {
          try {
            const dataUrl = await getImage(img.storageId);
            if (dataUrl) {
              const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
              if (matches && matches[2]) {
                return { ...img, data: matches[2], mimeType: matches[1] || img.mimeType || 'image/png' };
              }
              return { ...img, data: dataUrl };
            }
          } catch (e) {
            console.warn('[executeGeneration] Failed to load ref from IDB:', img.storageId, e);
          }
          
          // 尝试从本地文件系统加载
          if (globalHandle) {
            try {
              const base64Data = await fileSystemService.loadReferenceImage(globalHandle, img.storageId);
              if (base64Data) {
                return { ...img, data: base64Data, mimeType: 'image/jpeg' };
              }
            } catch (e) {
              console.warn('[executeGeneration] Failed to load ref from FS:', img.storageId, e);
            }
          }
        }
        
        // 尝试从 url 加载（追询模式）
        if ((img as any).url && !img.data) {
          try {
            const response = await fetch((img as any).url);
            const blob = await response.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
            if (matches && matches[2]) {
              return { ...img, data: matches[2], mimeType: matches[1] || img.mimeType || 'image/png' };
            }
          } catch (e) {
            console.warn('[executeGeneration] Failed to load ref from url:', (img as any).url, e);
          }
        }
        
        return img;
      })
    );
    
    // 过滤掉没有 data 的图片
    const files = hydratedFiles.filter(img => img.data && img.data.length > 100);

    // 馃殌 [Critical Fix] Define finalPos at a higher scope to ensure Error cards also land at latest center
    let finalPos = node.position;

    // [FIX] Get fresh position from canvas state to support moving during generation
    // 鉁?浣跨敤ref鑾峰彇鏈€鏂扮姸鎬?閬垮厤闂寘闂
    const freshCanvas = activeCanvasRef.current;
    const liveNode = freshCanvas?.promptNodes.find(n => n.id === promptNodeId);

    // 馃殌 [淇] 濡傛灉鎵句笉鍒拌妭鐐癸紝浣跨敤浼犲叆鐨?node 鍙傛暟浣滀负鍚庡
    if (!liveNode) {
      console.warn('[executeGeneration] Node not found in canvas, using original node as fallback:', promptNodeId);
    }

    const isVideo = mode === GenerationMode.VIDEO;
    const isAudio = mode === GenerationMode.AUDIO;
    const isPpt = mode === GenerationMode.PPT;
    const effectiveSlideLines = isPpt
      ? normalizePptSlidesForCount(node.pptSlides, node.prompt, count)
      : [];

    const buildPptPagePrompt = (basePrompt: string, index: number, total: number) => {
      const pageNo = index + 1;
      const getLayoutDirective = (text: string) => {
        const t = (text || '').toLowerCase();
        if (/封面|cover|title/.test(t)) return '采用封面版式：大标题 + 副标题 + 视觉主图，信息精简。';
        if (/目录|agenda|contents?/.test(t)) return '采用目录版式：清晰列出 4-6 个章节条目，层级分明。';
        if (/总结|结论|行动|summary|conclusion/.test(t)) return '采用总结版式：突出结论要点和行动建议，重点高亮。';
        if (/章节|section|transition/.test(t)) return '采用章节过渡页版式：突出章节标题，并配合关键词。';
        return '采用内容页版式：标题 + 3-5 个信息块，层次清晰。';
      };
      const lockStyle = node.pptStyleLocked !== false;
      const styleDirective = lockStyle
        ? '与整套 PPT 保持完全统一的视觉语言，包括配色、字体、版式和插画风格。'
        : '保持整体风格统一，但允许当前页面有适度变化。';
      const slideLines = effectiveSlideLines.length > 0
        ? effectiveSlideLines
        : buildAutoPptSlides(basePrompt, total);
      if (slideLines[index]) {
        const picked = slideLines[index];
        return `PPT 第 ${pageNo} 页：${picked}。16:9 演示文稿风格，中文排版清晰，信息层次分明。${styleDirective}${getLayoutDirective(picked)}`;
      }
      const lines = basePrompt
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => line.replace(/^[-*\d.)、\s]+/, '').trim())
        .filter(Boolean);

      if (lines.length >= total) {
        const picked = lines[Math.min(index, lines.length - 1)];
        return `PPT 第 ${pageNo} 页：${picked}。16:9 演示文稿风格，中文排版清晰，信息层次分明。${styleDirective}${getLayoutDirective(picked)}`;
      }

      return `你正在设计同一套 PPT。当前生成第 ${pageNo}/${total} 页。主题：${basePrompt}。请输出一页与其他页面风格统一但内容不重复的页面，16:9，包含明确标题和结构化信息区块。${styleDirective}采用内容页版式：标题 + 3-5 个信息块，层次清晰。`;
    };

    // 馃殌 [Safe State Tracking] Track success to prevent error overwrite

    try {
      const buildTask = (index: number) => async () => {
        const startTime = Date.now();
        const currentRequestId = `${promptNodeId}-${index}`;
        let taskIdForRecovery: string | undefined = undefined;

        // Timeout Check (4 minutes)
        let isFinished = false;
        const timeoutId = setTimeout(() => {
          if (!isFinished) {
            cancelGeneration(currentRequestId);
            updatePromptNode({
              ...node,
              isGenerating: false,
              error: '生成超时，结果未确认，请勿立即重复发送',
              errorDetails: {
                code: 'TIMEOUT',
                responseBody: 'Request exceeded 600000ms timeout in executeGeneration',
                model: node.model,
                timestamp: Date.now()
              }
            });
            import('./services/system/notificationService').then(({ notify }) => {
              notify.warning('生成超时', '已超过 600 秒（10 分钟）仍未收到完整结果。为避免重复扣费，请先查看卡片状态或供应商后台，再决定是否重试。');
            });

            // 馃殌 杩旇繕绉垎
            if (node.cost && node.cost > 0) {
              refundCredits(node.cost, `超时退款 ${node.id}`);
            } else if (node.provider !== 'Google') {
              refundCredits(1, `超时退款 ${node.id}`);
            }
          }
        }, GENERATE_TIMEOUT_MS);

        try {
          let generatedBase64 = '';
          let videoUrl = '';
          const taskPrompt = isPpt ? buildPptPagePrompt(generationPrompt, index, actualCount) : generationPrompt;
          let tokenUsage = 0;
          let costUsd = 0;
          let currentAspectRatio = node.aspectRatio;
          let currentSize = node.imageSize;
          let exactDimensions: { width: number; height: number } | undefined = undefined;
          let provider: string | undefined = undefined; // 馃殌 Provider info
          let providerLabel: string | undefined = undefined; // 馃殌 Provider display name
          let modelLabel: string | undefined = undefined; // 馃殌 Model display name
          let keySlotId: string | undefined = node.keySlotId;
          let requestPath: string | undefined = undefined;
          let requestBodyPreview: string | undefined = undefined;
          let pythonSnippet: string | undefined = undefined;
          let apiDurationMs: number | undefined = undefined;

          if (isAudio) {
            // 馃殌 闊抽鐢熸垚璺敱
            const audioResult = await llmService.generateAudio({
              modelId: node.model,
              prompt: taskPrompt,
              audioDuration: node.audioDuration,
              audioLyrics: node.audioLyrics,
              preferredKeyId: node.keySlotId,
              providerConfig: {}
            });

            videoUrl = audioResult.url; // 澶嶇敤 videoUrl 瀛楁瀛樺偍闊抽 URL
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
              return '720p'; // 榛樿720p
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
                taskIdForRecovery = taskId;
                const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                if (fresh) {
                  const patchedNode = registerPendingTaskId(fresh, taskId);
                  urgentUpdatePromptNode(patchedNode);
                  window.setTimeout(() => {
                    const latest = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                    if (latest?.isGenerating) {
                      pollTaskStatusRef.current?.(latest, taskId);
                    }
                  }, 2000);
                }
              }
            });

            videoUrl = videoResult.url;
            generatedBase64 = ''; // 瑙嗛娌℃湁base64
            tokenUsage = videoResult.usage?.totalTokens || 0;
            costUsd = videoResult.usage?.cost || (effectiveModel.toLowerCase().includes('fast') ? 0.15 : 0.30);

            if (videoResult.provider) provider = videoResult.provider;
            if (videoResult.providerName) providerLabel = videoResult.providerName;
            if (videoResult.modelName) modelLabel = videoResult.modelName;
            if (videoResult.keySlotId) keySlotId = videoResult.keySlotId;

          } else {
            // 馃殌 [Security/Persistence Fix] Verify model capabilities before request
            // We keep the user preference in the node, but degrade the actual request params
            const { modelSupportsGrounding, getModelCapabilities } = await import('./services/model/modelCapabilities');
            const canGround = modelSupportsGrounding(effectiveModel);
            const canImageSearch = getModelCapabilities(effectiveModel)?.supportsImageSearch ?? false;

            const result = await generateImage(
              taskPrompt,
              node.aspectRatio,
              node.imageSize,
              files,
              effectiveModel,
              '',
              currentRequestId,
              (!!node.enableGrounding && canGround) || (!!node.enableImageSearch && canImageSearch),
              {
                maskUrl: node.maskUrl,
                editMode: node.mode === GenerationMode.INPAINT ? 'inpaint' : (node.mode === GenerationMode.EDIT ? 'edit' : undefined),
                preferredKeyId: node.keySlotId,
                enableWebSearch: !!node.enableGrounding && canGround,
                enableImageSearch: !!node.enableImageSearch && canImageSearch,
                thinkingMode: node.thinkingMode || 'minimal',

                onTaskId: (taskId) => {
                  console.log(`[executeGeneration] Received TaskID: ${taskId} for node ${promptNodeId}`);
                  taskIdForRecovery = taskId;
                  const fresh = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                  if (fresh) {
                    const patchedNode = registerPendingTaskId(fresh, taskId);
                    urgentUpdatePromptNode(patchedNode);
                    window.setTimeout(() => {
                      const latest = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId);
                      if (latest?.isGenerating) {
                        pollTaskStatusRef.current?.(latest, taskId);
                      }
                    }, 2000);
                  }
                }
              }
            );
            generatedBase64 = result.url;
            const runtimeUsage = (result as any).usage;
            tokenUsage = result.tokens ?? runtimeUsage?.totalTokens ?? 0;
            costUsd = result.cost ?? runtimeUsage?.cost ?? 0;
            // 馃殌 Update effective model and size from result if available
            if (result.model) effectiveModel = result.model;
            // Capture returned metadata
            if (result.imageSize) currentSize = result.imageSize;
            if (result.aspectRatio) currentAspectRatio = result.aspectRatio;
            // 馃殌 Capture exact dimensions for AUTO mode
            if (result.dimensions) {
              exactDimensions = result.dimensions;
            }
            if (result.provider) provider = result.provider; // 馃殌 Capture provider
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

          // 馃殌 Latency Optimization: avoid blocking UI on remote image re-download
          let originalUrl = generatedBase64;
          let displayUrl = generatedBase64;
          const isRemoteGenerated = generatedBase64.startsWith('http');

          // Keep remote URL directly for first paint; persistence fallback is handled asynchronously.
          if (!isRemoteGenerated) {
            // Ensure data: URIs are also treated as original
            originalUrl = generatedBase64;
          }

          // Cloud Sync / Upload (鍚庡彴鎵ц锛屼笉闃诲杩斿洖)
          if (generatedBase64 && generatedBase64.startsWith('data:')) {
            // 鍚庡彴涓婁紶鍒颁簯绔紝浣嗕笉褰卞搷鏈湴鏄剧ず
            import('./services/system/syncService').then(async ({ syncService }) => {
              try {
                const res = await fetch(generatedBase64);
                const blob = await res.blob();
                const id = `${Date.now()}_${index}`;
                await syncService.uploadImagePair(id, blob);
                // 浜戠涓婁紶鎴愬姛鍚庝笉鏇存柊鏈湴鐘舵€侊紝鍥犱负鏈湴宸叉湁 base64
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
            exactDimensions, // 馃殌 Pass exact dimensions
            provider, // 馃殌 Pass provider
            providerLabel: providerLabel, // 馃殌 Pass Display Provider Name
            modelName: modelLabel, // 馃殌 Pass Display Model Name
            keySlotId,
            taskId: taskIdForRecovery,
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
            errorDetails: extractErrorDetails(error, node.model),
            taskId: taskIdForRecovery
          };
        }
      };

      const requestedCount = Math.max(1, Number(count) || 1);
      const actualCount = isPpt ? Math.min(20, requestedCount) : requestedCount;
      generationTotalCount = actualCount;
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
      generationTotalCount = imageData.length || actualCount;
      const failedImageData = imageData.filter(d => !!d && 'error' in d) as Array<{
        error: string;
        errorDetails?: PromptNode['errorDetails'];
        taskId?: string;
      }>;

      // 杩囨护鎴愬姛鐨勭粨鏋?
      const validImageData = imageData.filter(d => !!d && !('error' in d) && !!d.url && typeof d.index === 'number') as Array<{
        index: number;
        url: string;
        originalUrl: string;
        generationTime: number;
        base64: string;
        mode: GenerationMode;
        tokens: number;
        cost: number;
        effectiveModel?: string; // 馃殌 Pass through
        effectiveSize?: string; // 馃殌 Pass through
        effectiveAspectRatio?: AspectRatio; // 馃殌 Pass through
        exactDimensions?: { width: number; height: number }; // 馃殌 Pass through
        provider?: string; // 馃殌 Pass through
        providerLabel?: string; // 馃殌 Pass through
        modelName?: string; // 馃殌 Pass through
        keySlotId?: string;
        taskId?: string;
        taskPrompt?: string;
        requestPath?: string;
        requestBodyPreview?: string;
        pythonSnippet?: string;
      }>;

      generationSuccessCount = validImageData.length;
      generationFailCount = Math.max(0, generationTotalCount - generationSuccessCount);
      partialFailureDetails = failedImageData[0]?.errorDetails;
      const latestNodeForRecovery = activeCanvasRef.current?.promptNodes.find(n => n.id === promptNodeId) || node;
      const successfulTaskIds = validImageData
        .map(item => item.taskId)
        .filter((taskId): taskId is string => !!taskId);
      const pendingRecoveryTaskIds = Array.from(new Set(
        getPendingTaskIds(latestNodeForRecovery).filter(taskId => !successfulTaskIds.includes(taskId))
      ));

      if (validImageData.length === 0) {
        const firstError = imageData.find(d => d && 'error' in d);
        const message = firstError && 'error' in firstError ? firstError.error : '所有图片生成失败';
        const enrichedError = new Error(message);
        (enrichedError as any).details = firstError && 'errorDetails' in firstError ? firstError.errorDetails : undefined;
        throw enrichedError;
      }

      // 鉁?鐢熸垚瀹屾垚鍚庨噸鏂拌幏鍙栦富鍗℃渶鏂颁綅缃?(鏀寔鐢熸垚杩囩▼涓嫋鍔?
      const finalCanvas = activeCanvasRef.current;
      const latestNode = finalCanvas?.promptNodes.find(n => n.id === promptNodeId);
      const effectiveNodeForPos = latestNode || node;

      // 馃殌 [Critical Fix] 鐩存帴浣跨敤鍦?handleGenerate 纭畾鐨?琚敤鎴锋嫋鍔ㄥ悗鐨勭湡瀹炰綅缃€?
      // 涓嶅啀寮哄埗鍔ㄦ€佽绠楀睆骞曚腑蹇?(latestCenter)锛岄槻姝㈢敤鎴峰湪鐢熸垚鏈熼棿骞崇Щ鐢诲竷瀵艰嚧鏂板崱鐗囦綅缃獊鍙樸€?
      finalPos = effectiveNodeForPos.position;

      console.log('[executeGeneration] Resolving Position (Final Sync):', {
        original: node.position,
        latestFromCanvas: latestNode?.position,
        finalUsed: finalPos,
      });

      // 馃洝锔?[Anti-Zero-Bug]
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

      // 璁＄畻浣嶇疆
      const gapToImages = 80; // 涓诲崱鍜屽壇鍗′箣闂寸殑璺濈
      const gap = 20; // 鍓崱涔嬮棿鐨勯棿璺?
      const { width: cardWidth, totalHeight: cardHeight } = getCardDimensions(node.aspectRatio, true);

      // 馃殌 [Safe State Tracking] Inner block
      try {
        const results = validImageData.map((item, mapIndex) => {
          // ... (Mapping Logic) ...
          // 浣跨敤 mapIndex 浣滀负鍚庡锛屽洜涓?item.index 宸插湪 filter 涓獙璇?
          const idx = item.index ?? mapIndex;
          const {
            url, originalUrl, generationTime, base64, mode: itemMode, tokens, cost,
            effectiveModel: resModel, effectiveSize: resSize, effectiveAspectRatio: resRatio,
            exactDimensions, provider, providerLabel: itemProviderLabel, modelName, taskPrompt: itemTaskPrompt
            , keySlotId, requestPath, requestBodyPreview, pythonSnippet
          } = item;
          const providerDisplay = resolveProviderDisplay(keySlotId, itemProviderLabel, provider);

          // 馃殌 Use result model/size if available, otherwise fallback
          const finalModel = resModel || effectiveModel;
          const finalSize = resSize || node.imageSize;
          const finalAspectRatio = resRatio || node.aspectRatio;
          let x, y;

          // 鉁?缁熶竴甯冨眬: 鍥哄畾2鍒?浣跨敤鍜孭endingNode鐩稿悓鐨勮绠楀叕寮?
          const columns = 2; // 鍥哄畾2鍒?
          const col = idx % columns;
          const row = Math.floor(idx / columns);


          // 璁＄畻褰撳墠琛屽疄闄呮湁澶氬皯寮犲崱鐗?
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
            // 灞呬腑璁＄畻:鍏堢畻鍑哄綋鍓嶈鐨勬€诲搴?鐒跺悗灞呬腑瀵归綈
            const rowWidth = cardsInCurrentRow * mobileCardWidth + (cardsInCurrentRow - 1) * mobileGap;
            const startX = -rowWidth / 2; // 鐩稿涓诲崱涓績鐨勮捣濮嬩綅缃?
            const offsetX = startX + col * (mobileCardWidth + mobileGap) + mobileCardWidth / 2;
            const offsetY = gapToImages + mobileCardHeight + row * (mobileCardHeight + mobileGap);
            x = finalPos.x + offsetX; // Use FINAL calibrated position
            y = finalPos.y + offsetY;
          } else {
            // 灞呬腑璁＄畻:鍏堢畻鍑哄綋鍓嶈鐨勬€诲搴?鐒跺悗灞呬腑瀵归綈
            const rowWidth = cardsInCurrentRow * cardWidth + (cardsInCurrentRow - 1) * gap;
            const startX = -rowWidth / 2; // 鐩稿涓诲崱涓績鐨勮捣濮嬩綅缃?
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
            storageId: uniqueId, // 馃殌 纭繚 storageId 琚缃紝鐢ㄤ簬鎸佷箙鍖栨仮澶?
            url,
            originalUrl,
            prompt: itemTaskPrompt || node.originalPrompt || promptToUse,
            aspectRatio: finalAspectRatio, // 馃殌 Use resolved ratio
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
            provider: providerDisplay.provider,
            providerLabel: providerDisplay.providerLabel,
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
              ? `${finalAspectRatio} 路 720p`
              : `${finalAspectRatio} 路 ${finalSize || '1K'}`,
            generationTime,
            tokens,
            cost,
            exactDimensions,
            promptOptimizerResult: node.promptOptimizerResult, // 馃殌 鍏ㄩ摼璺悓姝ョ紪璇戝櫒缁撴灉
            optimizedPromptEn: node.optimizedPromptEn, // 馃殌 鍚屾浼樺寲鍚庣殑鑻辨枃
            optimizedPromptZh: node.optimizedPromptZh  // 馃殌 鍚屾浼樺寲鍚庣殑涓枃
          } as GeneratedImage;
        });

        successResults = results; // 鉁?Mark as safe
      } catch (mapErr) {
        console.error("Result Mapping Failed", mapErr);
        throw mapErr;
      }

      const displayFailCount = pendingRecoveryTaskIds.length > 0
        ? Math.max(0, generationFailCount - pendingRecoveryTaskIds.length)
        : generationFailCount;
      const updatedNode = {
        ...effectiveNode, // 馃殌 Use effectiveNode (latest or fallback)
        position: finalPos,
        isGenerating: pendingRecoveryTaskIds.length > 0,
        jobId: pendingRecoveryTaskIds[0],
        childImageIds: successResults.map(r => r.id), // Use successResults
        lastGenerationSuccessCount: generationSuccessCount,
        lastGenerationFailCount: displayFailCount,
        lastGenerationTotalCount: generationTotalCount,
        keySlotId: successResults[0]?.keySlotId || effectiveNode.keySlotId,
        error: undefined,
        errorDetails: displayFailCount > 0 ? partialFailureDetails : undefined,
        refundStatus: undefined,
        isDraft: false,
        generationMetadata: buildPendingTaskMetadata(effectiveNode, pendingRecoveryTaskIds),
      };

      rememberPreferredKeyForMode(updatedNode.mode, updatedNode.keySlotId);

      // 馃殌 [Critical Fix] Execute updates atomically to prevent state overwrite race conditions
      // 鍏堟竻鐞嗘棫瀛愬崱锛岄伩鍏嶅苟鍙?閲嶅叆瀵艰嚧鍚屼竴涓诲崱鍑虹幇閲嶅鍓崱
      
      // 馃洝锔?[闃插尽鎬т慨澶峕 杩囨护鎺変换浣曟棤鏁堢殑缁撴灉锛堢己灏?id 鐨勶級
      const validSuccessResults = successResults.filter(r => {
        const hasValidId = r && r.id && String(r.id).length > 0;
        if (!hasValidId) {
          console.warn('[executeGeneration] Filtering out result with invalid id:', r);
        }
        return hasValidId;
      });
      
      console.log('[executeGeneration] Cleaning up old child cards:', {
        existingChildIds: effectiveNode.childImageIds || [],
        newResultIds: validSuccessResults.map(r => r.id),
        successResultsCount: successResults.length,
        validSuccessResultsCount: validSuccessResults.length
      });
      
      // 馃洝锔?[闃插尽鎬т慨澶峕 纭繚 validSuccessResults 涓嶄负绌烘墠杩涜娓呯悊
      if (validSuccessResults.length === 0) {
        console.warn('[executeGeneration] No valid results with IDs, skipping old child cleanup to prevent data loss');
      } else {
        const oldChildIds = (effectiveNode.childImageIds || []).filter(id => 
          !validSuccessResults.some(r => {
            // 寮哄埗瀛楃涓叉瘮杈冿紝閬垮厤绫诲瀷涓嶅尮閰?
            const resultId = String(r.id);
            const childId = String(id);
            return resultId === childId;
          })
        );
        
        console.log('[executeGeneration] Deleting old child cards:', oldChildIds);
        
        // 馃洝锔?[闃插尽鎬т慨澶峕 闄愬埗涓€娆℃€у垹闄ょ殑鏁伴噺锛岄槻姝㈡剰澶栨竻绌?
        if (oldChildIds.length > 50) {
          console.error('[executeGeneration] Suspiciously high number of old children:', oldChildIds.length, 'Aborting cleanup to prevent data loss');
        } else if (oldChildIds.length === (effectiveNode.childImageIds || []).length && oldChildIds.length > 0) {
          // 馃毃 闃插尽鎬ф鏌ワ細濡傛灉瑕佸垹闄ゆ墍鏈夊瓙鍗★紝鍙兘鏄?ID 鍖归厤閫昏緫鍑轰簡闂
          console.error('[executeGeneration] Attempting to delete ALL child cards, aborting to prevent data loss. This may indicate ID mismatch.');
        } else {
          oldChildIds.forEach(id => deleteImageNode(id));
        }
      }

      // 馃帹 Atomic update: Use the new parentUpdates feature of addImageNodes
      console.log('[executeGeneration] Adding new image nodes:', validSuccessResults.length);
      addImageNodes(validSuccessResults, { [updatedNode.id]: updatedNode });
      if (pendingRecoveryTaskIds.length > 0) {
        window.setTimeout(() => {
          const latest = activeCanvasRef.current?.promptNodes.find(n => n.id === updatedNode.id);
          if (latest?.isGenerating) {
            pendingRecoveryTaskIds.forEach(taskId => {
              pollTaskStatusRef.current?.(latest, taskId);
            });
          }
        }, 3000);
      }

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
          },
          successResults[0]?.keySlotId || updatedNode.keySlotId
        );
      });

      // Clear active source if it was this node (simple check)
      if (activeSourceImage && activeSourceImage === effectiveNode.sourceImageId) {
        setActiveSourceImage(null);
      }

    } catch (err: any) {
      console.error('[executeGeneration] Error:', err);

      const currentNodeSnapshot = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id) || node;
      const errorMessage = String(err?.message || '');
      const pendingTaskIds = getPendingTaskIds(currentNodeSnapshot);
      const hasRecoverableTask = pendingTaskIds.length > 0;
      const isRecoverableTaskError = hasRecoverableTask && /timeout|timed out|network|fetch|abort|socket|econn|etimedout|503|504/i.test(errorMessage);

      if (isRecoverableTaskError) {
        console.warn('[executeGeneration] Task switched to polling recovery mode:', {
          nodeId: node.id,
          jobIds: pendingTaskIds,
          errorMessage,
        });
        urgentUpdatePromptNode({
          ...currentNodeSnapshot,
          isGenerating: true,
          jobId: pendingTaskIds[0],
          error: undefined,
          errorDetails: undefined,
          generationMetadata: {
            ...(currentNodeSnapshot.generationMetadata || {}),
            pendingTaskIds,
            recoveryMode: 'polling',
            lastRecoverableErrorAt: Date.now(),
            lastRecoverableErrorMessage: errorMessage,
          }
        });
        window.setTimeout(() => {
          const latest = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
          if (latest?.isGenerating) {
            pendingTaskIds.forEach(taskId => {
              pollTaskStatusRef.current?.(latest, taskId);
            });
          }
        }, 3000);
        import('./services/system/notificationService').then(({ notify }) => {
          notify.warning('任务继续查询', '供应商任务已提交，前端改为轮询恢复，暂不直接判定失败。');
        });
        return;
      }

      // 馃殌 [Safe Fault Tolerance] If we generated images but failed later (e.g. Cost Service / UI Update),
      // DO NOT mark the node as failed. Just log it and ensure it's not "Generating".
      if (successResults.length > 0) {
        console.warn('[executeGeneration] Partial Success - Images generated but post-processing failed. Ignoring error state.');
        // Force "Done" state without error
        const currentCanvas = activeCanvasRef.current;
        const currentNode = currentCanvas?.promptNodes.find(n => n.id === node.id) || node;
        
        // 馃殌 [Critical Fix] Add the generated images to canvas even on partial failure
        // This prevents cards from disappearing when Cost Service or other post-processing fails
        addImageNodes(successResults, {
          [currentNode.id]: {
            isGenerating: false,
            isDraft: false,
            childImageIds: successResults.map(n => n.id),
            error: undefined,
            errorDetails: generationFailCount > 0 ? partialFailureDetails : undefined,
            lastGenerationSuccessCount: generationSuccessCount || successResults.length,
            lastGenerationFailCount: generationFailCount,
            lastGenerationTotalCount: generationTotalCount,
          }
        });
        
        updatePromptNode({
          ...currentNode,
          isGenerating: false,
          error: undefined,
          errorDetails: generationFailCount > 0 ? partialFailureDetails : undefined,
          refundStatus: undefined,
          lastGenerationSuccessCount: generationSuccessCount || successResults.length,
          lastGenerationFailCount: generationFailCount,
          lastGenerationTotalCount: generationTotalCount,
        });
        return; // 馃殌 Exit without showing error notification
      }

      // 馃殌 [绔炴€佹娴媇 鑾峰彇鑺傜偣鏈€鏂板疄鏃剁姸鎬侊紝妫€鏌ユ槸鍚﹀凡琚?pollTaskStatus 鏍囪涓烘垚鍔?
      const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
      const hasImagesOnFreshNode = freshNode && (freshNode.childImageIds?.length || 0) > 0;
      const hasCanvasImagesForNode = !!activeCanvasRef.current?.imageNodes.some(img => img.parentPromptId === node.id);
      const isNoLongerGenerating = freshNode && !freshNode.isGenerating;

      if (hasImagesOnFreshNode || hasCanvasImagesForNode || isNoLongerGenerating) {
        console.warn('[executeGeneration] 检测到竞态冲突：原始连接超时，但节点已通过轮询成功完成，放弃显示失败状态。', {
          nodeId: node.id,
          hasImages: hasImagesOnFreshNode,
          hasCanvasImages: hasCanvasImagesForNode,
          isGenerating: freshNode?.isGenerating
        });
        return; // 馃挜 鐩存帴閫€鍑猴紝涓嶆洿鏂伴敊璇姸鎬?
      }

      // 馃殌 [淇] 纭繚閿欒鍗＄墖濮嬬粓鏄剧ず鍦ㄥ綋鍓嶆渶鏂扮殑 finalPos 涓?
      const viewportRect = canvasRef.current?.getCanvasRect() || null;
      const viewportOffsets = getViewportOffsets(isSidebarOpen, isChatOpen, isMobile, chatSidebarWidth);
      const latestCenter = getPromptBarFrontPosition(canvasTransform, viewportRect, viewportOffsets, 200, 48);
      const errorPos = (liveNode?.userMoved) ? liveNode.position : latestCenter;

      const currentCanvasForError = activeCanvasRef.current;
      const currentNode = currentCanvasForError?.promptNodes.find(n => n.id === node.id) || node;

      // 馃殌 [Fix] 鍒ゆ柇鏄惁闇€瑕侀€€璐?
      // 鏉′欢锛氬凡鎵ｈ垂锛坈ost > 0 涓?isPaymentProcessed锛夋垨浣跨敤绉垎妯″瀷
      const isCreditModelForError = node.model.includes('@system') || node.model.includes('@google') || isCreditBasedModel(node.model);
      const shouldRefund = Boolean(node.isPaymentProcessed && node.cost && node.cost > 0 && isCreditModelForError);

      const errorNode = {
        ...currentNode,
        position: errorPos, // 馃殌 Use latest center even on error!
        isGenerating: false,
        lastGenerationSuccessCount: generationSuccessCount,
        lastGenerationFailCount: generationFailCount > 0 ? generationFailCount : generationTotalCount,
        lastGenerationTotalCount: generationTotalCount,
        error: err.message || 'Failed',
        errorDetails: (err as any)?.details || extractErrorDetails(err, currentNode.model),
        // 馃殌 [淇] 浣跨敤 as const 淇绫诲瀷閿欒
        refundStatus: shouldRefund ? 'pending' as const : undefined
      };
      const existsInCanvas = currentCanvasForError?.promptNodes.some((n: any) => n.id === node.id);

      // 馃殌 [Refund Credits Fix] 閫€杩樻鑺傜偣娑堣€楃殑绉垎
      const hasCustomUserKey = keyManager.hasCustomKeyForModel(node.model);
      const isCreditModel = isCreditBasedModel(node.model, undefined, undefined, hasCustomUserKey);
      let refundPromise: Promise<boolean> = Promise.resolve(false);
      const shouldTryRefund = Boolean(isCreditModel && node.isPaymentProcessed && node.cost && node.cost > 0);
      if (shouldTryRefund) {
        const costToRefund = node.cost || (node.mode === GenerationMode.PPT ? (node.childImageIds?.length || 1) : (node.parallelCount || 1));
        refundPromise = refundCredits(costToRefund, `生成失败退款 ${node.model} (${node.id})`);
        refundPromise
          .then(success => {
            if (success) {
              console.log(`[executeGeneration] 閫€鍥炵Н鍒嗘垚鍔? ${costToRefund}`);
              // 馃殌 鏇存柊鑺傜偣鐘舵€佷负"绉垎宸查€€鍥?
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
            console.error('[executeGeneration] 退回积分异常', e);
            const updatedNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
            if (updatedNode) {
              updatePromptNode({ ...updatedNode, refundStatus: 'failed' as const });
            }
          });
      }
      // 馃殌 [Fix] 鍙洿鏂板凡瀛樺湪鐨勮妭鐐癸紝濡傛灉涓嶅瓨鍦紙鍙兘鍥犱负鐘舵€佸紓姝ュ鑷磋繕娌″嚭鐜板湪 canvas锛夛紝鍒欏皾璇曟坊鍔?
      if (existsInCanvas) {
        updatePromptNode(errorNode);
      } else {
        console.warn('[executeGeneration] Error node not found in canvas, forcing add to ensure visibility:', node.id);
        addPromptNode(errorNode); // 寮哄埗娣诲姞锛岀‘淇濈敤鎴疯兘鐪嬪埌閿欒鎻愮ず
      }

      // 馃殌 [Fix] 绛夊緟閫€璐瑰畬鎴愬悗鏄剧ず鎻愮ず锛屽憡鐭ョ敤鎴风Н鍒嗗凡閫€鍥?
      refundPromise.then((refundSuccess) => {
        const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
        const hasRecoveredImages = !!activeCanvasRef.current?.imageNodes.some(img => img.parentPromptId === node.id);
        import('./services/system/notificationService').then(({ notify }) => {
          const shouldSuppressErrorToast = !!latestNode && (
            hasRecoveredImages ||
            (latestNode.childImageIds?.length || 0) > 0 ||
            (!latestNode.isGenerating && !latestNode.error)
          );

          if (shouldSuppressErrorToast) {
            console.warn('[executeGeneration] Suppressing stale failure notification for completed node:', {
              nodeId: node.id,
              hasRecoveredImages,
              childImageIds: latestNode?.childImageIds?.length || 0,
              isGenerating: latestNode?.isGenerating,
              error: latestNode?.error
            });
            return;
          }
          // 馃殌 杩囨护鎺夋ā鍨嬩笉鏀寔鍙傝€冨浘鐨勯敊璇彁绀猴紝涓嶆樉绀虹粰鐢ㄦ埛
          if (err.message && err.message.includes('does not support image input')) {
            return;
          }
          // 馃殌 [Fix] 鍙湁 @system 鍚庣紑鐨勭Н鍒嗘ā鍨嬫墠鏄剧ず"绉垎宸查€€鍥?
          const isCredit = node.model?.toLowerCase().endsWith('@system') || isCreditModel;
          const refundMsg = (isCredit && refundSuccess) ? '，积分已退回' : '';

          // 馃殌 澧炲己 401 鎻愮ず
          let displayTitle = '生成失败' + refundMsg;
          let displayMsg = err.message || "Generation failed.";
          const normalizedError = String(displayMsg || '').toLowerCase();
          const isAuthError =
            normalizedError.includes('401') ||
            normalizedError.includes('403') ||
            normalizedError.includes('unauthorized') ||
            normalizedError.includes('forbidden') ||
            normalizedError.includes('authentication') ||
            normalizedError.includes('invalid api key') ||
            normalizedError.includes('api key invalid') ||
            normalizedError.includes('api密钥无效') ||
            normalizedError.includes('api key 无效') ||
            normalizedError.includes('认证失败') ||
            normalizedError.includes('令牌无效');
          if (isAuthError) {
            displayTitle = 'API 令牌无效' + refundMsg;
            displayMsg = '检测到鉴权错误，请在“设置 - API管理”中检查密钥或令牌是否正确、是否过期，以及当前请求是否走到了你选中的供应商。';
          }

          notify.error(displayTitle, displayMsg);
        });
      });
      if (err.message && (err.message.includes("API Key") || err.message.includes("403"))) {
        openSettingsPanel('api-management');
      }
    }
  }, [isMobile, updatePromptNode, urgentUpdatePromptNode, addPromptNode, addImageNodes, activeCanvas, activeSourceImage, getCardDimensions, extractErrorDetails, buildAutoPptSlides, rememberPreferredKeyForMode, openSettingsPanel]);

  // [New] Poll for task status
  const pollTaskStatus = useCallback(async (node: PromptNode, taskIdOverride?: string) => {
    const targetTaskId = taskIdOverride || node.jobId;
    if (!targetTaskId) return;

    console.log(`[Auto-Resume] Polling task status for node ${node.id}, jobId: ${targetTaskId}`);

    try {
      // Create a temporary "pending" state visualization if needed, 
      // but usually the node is already in isGenerating state.

      const result = await llmService.checkTaskStatus(targetTaskId, node.mode || GenerationMode.IMAGE, node.keySlotId ? { id: node.keySlotId } as any : undefined);

      if (result && 'status' in result && (result.status === 'success' || result.status === 'failed')) {
        const latestNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id) || node;
        const pendingTaskIds = getPendingTaskIds(latestNode);
        const { nextPendingTaskIds, nextJobId, nextGenerationMetadata } = resolvePendingTaskState(latestNode, targetTaskId);
        const expectedCount = getExpectedGenerationCount(latestNode);
        const currentChildIds = Array.from(new Set((latestNode.childImageIds || []).filter(Boolean)));
        const isTrackedTask = pendingTaskIds.includes(targetTaskId) || latestNode.jobId === targetTaskId;
        const isAlreadyComplete = !latestNode.isGenerating && nextPendingTaskIds.length === 0 && currentChildIds.length >= expectedCount;

        if (!isTrackedTask && isAlreadyComplete) {
          console.warn('[Auto-Resume] Ignoring stale poll result for completed node:', {
            nodeId: node.id,
            status: result.status,
            childImageIds: latestNode.childImageIds?.length || 0,
            isGenerating: latestNode.isGenerating,
            targetTaskId,
          });
          return;
        }

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
            const existingImageNodes = currentChildIds
              .map(id => activeCanvasRef.current?.imageNodes.find(img => img.id === id))
              .filter((imageNode): imageNode is GeneratedImage => !!imageNode);
            const totalLayoutCount = existingImageNodes.length + imageUrls.length;

            existingImageNodes.forEach((imageNode, index) => {
              const nextPosition = getGeneratedImagePosition(
                latestNode.position,
                imageNode.aspectRatio || latestNode.aspectRatio,
                latestNode.mode,
                index,
                totalLayoutCount
              );
              updateImageNodePosition(imageNode.id, nextPosition, { ignoreSelection: true });
            });

            const recoveredImageNodes = imageUrls.map((url: string, index: number) => {
              const imageId = `${node.id}_recovered_${Date.now()}_${index}`;
              const layoutIndex = existingImageNodes.length + index;
              const pageIndex = currentChildIds.length + index;
              const resolvedAspectRatio = (result as any).aspectRatio || latestNode.aspectRatio;
              const resolvedImageSize = (result as any).imageSize || latestNode.imageSize;
              return {
                id: imageId,
                storageId: imageId,
                url,
                originalUrl: url,
                prompt: latestNode.prompt,
                model: (result as any).model || latestNode.model,
                aspectRatio: resolvedAspectRatio,
                imageSize: resolvedImageSize,
                timestamp: Date.now(),
                canvasId: activeCanvasRef.current?.id || 'default',
                parentPromptId: node.id,
                position: getGeneratedImagePosition(
                  latestNode.position,
                  resolvedAspectRatio,
                  latestNode.mode,
                  layoutIndex,
                  totalLayoutCount
                ),
                dimensions: `${resolvedAspectRatio} 路 ${resolvedImageSize || '1K'}`,
                provider: (result as any).provider || latestNode.provider,
                providerLabel: (result as any).providerName || latestNode.providerLabel,
                keySlotId: (result as any).keySlotId || latestNode.keySlotId,
                generationTime: (result as any).generationTime || 0,
                alias: latestNode.mode === GenerationMode.PPT ? buildPptPageAlias(latestNode.pptSlides?.[pageIndex], pageIndex) : undefined,
              };
            });
            const mergedChildIds = Array.from(new Set([
              ...currentChildIds,
              ...recoveredImageNodes.map((img: { id: string }) => img.id),
            ]));
            const nextSuccessCount = mergedChildIds.length;
            const nextFailCount = nextPendingTaskIds.length > 0
              ? Math.max(0, expectedCount - nextSuccessCount - nextPendingTaskIds.length)
              : Math.max(0, expectedCount - nextSuccessCount);

            addImageNodes(recoveredImageNodes as any, {
              [latestNode.id]: {
                isGenerating: nextPendingTaskIds.length > 0,
                jobId: nextJobId,
                childImageIds: mergedChildIds,
                error: undefined,
                errorDetails: nextFailCount > 0 ? latestNode.errorDetails : undefined,
                refundStatus: undefined,
                lastGenerationSuccessCount: nextSuccessCount,
                lastGenerationFailCount: nextFailCount,
                lastGenerationTotalCount: Math.max(expectedCount, nextSuccessCount),
                generationMetadata: nextGenerationMetadata,
              }
            });

            if (nextPendingTaskIds.length > 0) {
              window.setTimeout(() => {
                const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
                if (freshNode?.isGenerating) {
                  nextPendingTaskIds.forEach(taskId => {
                    pollTaskStatusRef.current?.(freshNode, taskId);
                  });
                }
              }, 3000);
            }
            return;
            const recoveredImages = imageUrls.map((url: string, index: number) => {
              const imageId = `${node.id}_recovered_${Date.now()}_${index}`;
              return {
                id: imageId,
                storageId: imageId,
                url,
                originalUrl: url,
                prompt: node.prompt,
                model: node.model,
                aspectRatio: node.aspectRatio,
                imageSize: node.imageSize,
                timestamp: Date.now(),
                canvasId: activeCanvasRef.current?.id || 'default',
                parentPromptId: node.id,
                position: {
                  x: node.position.x,
                  y: node.position.y + 320 + index * 24
                },
                dimensions: `${node.aspectRatio} 路 ${node.imageSize || '1K'}`,
                provider: (result as any).provider || node.provider,
                providerLabel: (result as any).providerName || node.providerLabel,
                keySlotId: node.keySlotId,
                generationTime: (result as any).generationTime || 0,
                alias: node.mode === GenerationMode.PPT ? buildPptPageAlias(node.pptSlides?.[index], index) : undefined,
              };
            });
            addImageNodes(recoveredImages as any);
            updatePromptNode({
              ...(latestNode || node),
              isGenerating: false,
              jobId: undefined,
              childImageIds: recoveredImages.map((img: { id: string }) => img.id),
              error: undefined,
              errorDetails: undefined,
              refundStatus: undefined
            });
            return;
          }
        } else {
          // Failed
          const failureTarget = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id) || node;
          const completedCount = failureTarget.childImageIds?.length || 0;
          if (nextPendingTaskIds.length > 0) {
            updatePromptNode({
              ...failureTarget,
              isGenerating: true,
              jobId: nextJobId,
              generationMetadata: nextGenerationMetadata,
              error: undefined,
            });
            return;
          }
          if (completedCount > 0) {
            updatePromptNode({
              ...failureTarget,
              isGenerating: false,
              jobId: undefined,
              generationMetadata: nextGenerationMetadata,
              error: undefined,
              errorDetails: undefined,
              refundStatus: undefined,
              lastGenerationSuccessCount: completedCount,
              lastGenerationFailCount: Math.max(1, expectedCount - completedCount),
              lastGenerationTotalCount: Math.max(expectedCount, completedCount),
            });
            return;
          }
          const hasRecoveredImages = !!activeCanvasRef.current?.imageNodes.some(img => img.parentPromptId === node.id);
          if (hasRecoveredImages || !failureTarget.isGenerating || (failureTarget.childImageIds?.length || 0) > 0) {
            console.warn('[Auto-Resume] Skip stale failed poll result because node already completed:', {
              nodeId: node.id,
              hasRecoveredImages,
              childImageIds: failureTarget.childImageIds?.length || 0,
              isGenerating: failureTarget.isGenerating
            });
            return;
          }
          updatePromptNode({ ...failureTarget, isGenerating: false, error: 'Task failed on backend' });
          return;
        }
      }

      // If still pending, poll again in 10s
      setTimeout(() => {
        // Refresh node from state to check if it's still generating
        const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
        if (freshNode && freshNode.isGenerating) {
          const freshPendingTaskIds = getPendingTaskIds(freshNode);
          if (freshPendingTaskIds.includes(targetTaskId) || freshNode.jobId === targetTaskId) {
            pollTaskStatus(freshNode, targetTaskId);
          }
        }
      }, 10000);

    } catch (err: any) {
      console.error(`[Auto-Resume] Polling failed for node ${node.id}:`, err);
      const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === node.id);
      if (freshNode?.isGenerating) {
        const freshPendingTaskIds = getPendingTaskIds(freshNode);
        if (freshPendingTaskIds.includes(targetTaskId) || freshNode.jobId === targetTaskId) {
          setTimeout(() => pollTaskStatus(freshNode, targetTaskId), 15000);
        }
      }
    }
  }, [llmService, updatePromptNode, addImageNodes, getPendingTaskIds, resolvePendingTaskState, getExpectedGenerationCount, getGeneratedImagePosition, updateImageNodePosition]);

  useEffect(() => {
    pollTaskStatusRef.current = pollTaskStatus;
  }, [pollTaskStatus]);

  // Auto-Resume Effect
  const hasResumedRef = useRef(false);
  useEffect(() => {
    // Wait for canvas to be ready and loaded
    if (!activeCanvas || hasResumedRef.current || !isReady) return;

    const interruptedNodes = activeCanvas.promptNodes.filter(n => n.isGenerating);
    if (interruptedNodes.length > 0) {
      console.log(`[Auto-Resume] Found ${interruptedNodes.length} interrupted tasks. Resuming...`);
      interruptedNodes.forEach(node => {
        const pendingTaskIds = getPendingTaskIds(node);
        if (pendingTaskIds.length > 0 || node.jobId) {
          // Delay to ensure services are ready
          setTimeout(() => {
            const taskIdsToResume = pendingTaskIds.length > 0 ? pendingTaskIds : (node.jobId ? [node.jobId] : []);
            taskIdsToResume.forEach(taskId => pollTaskStatus(node, taskId));
          }, 1000);
        } else {
          urgentUpdatePromptNode({
            ...node,
            isGenerating: false,
            error: '刷新后无法确认任务状态，已阻止自动重发以避免重复扣费',
            errorDetails: {
              ...(node.errorDetails || {}),
              code: 'RESUME_REQUIRES_TASK_ID',
              responseBody: '任务已发送但缺少 jobId，刷新后不会自动重发，以避免供应商重复扣费',
              model: node.model,
              timestamp: Date.now()
            },
            generationMetadata: {
              ...(node.generationMetadata || {}),
              resumeBlocked: true,
              reason: 'missing_job_id_after_reload'
            }
          });
        }
      });
      import('./services/system/notificationService').then(({ notify }) => {
        notify.info('任务自动恢复', `已恢复 ${interruptedNodes.length} 个未完成的生成任务`);
      });
    }
    hasResumedRef.current = true;
  }, [activeCanvas, isReady, pollTaskStatus, urgentUpdatePromptNode, getPendingTaskIds]);


  const handleGenerate = useCallback(async () => {
    const now = Date.now();
    const cooldownRemaining = GENERATE_TRIGGER_COOLDOWN_MS - (now - lastGenerateAtRef.current);
    if (cooldownRemaining > 0) {
      console.warn('[handleGenerate] blocked duplicate trigger');
      return;
    }
    const trimmedPrompt = config.prompt.trim();
    if (!trimmedPrompt) return;
    const submitSignature = JSON.stringify({
      prompt: trimmedPrompt,
      model: config.model,
      mode: config.mode,
      aspectRatio: config.aspectRatio,
      imageSize: config.imageSize,
      parallelCount: config.parallelCount || 1,
      sourceImageId: activeSourceImage || '',
      referenceImages: (config.referenceImages || [])
        .map(img => img.id || img.storageId || img.url || '')
        .sort()
    });
    const lastSignature = lastGenerateSignatureRef.current;
    if (lastSignature && lastSignature.value === submitSignature && (now - lastSignature.at) < GENERATE_SIGNATURE_DEDUP_MS) {
      console.warn('[handleGenerate] blocked repeated identical submission');
      import('./services/system/notificationService').then(({ notify }) => {
        notify.warning('已拦截重复发送', '检测到相同内容短时间内重复提交，已阻止再次请求以避免重复扣费。');
      });
      return;
    }
    lastGenerateAtRef.current = now;
    lastGenerateSignatureRef.current = { value: submitSignature, at: now };

    // 馃殌 [鐪熷疄璁¤垂鎷︽埅涓庢墸闄
    // 棣栧厛鍒ゆ柇鏄惁涓虹郴缁熸寜绉垎璁¤垂鐨勬ā鍨嬶紙鑷繁娣诲姞鐨勭涓夋柟娓犻亾妯″瀷鎴栨槑纭甫鏈?@ 鍚庣紑鐨勮皟鐢ㄤ笉璧扮Н鍒嗘祦绋嬶級
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

    console.log('[handleGenerate] 璁¤垂妫€鏌?', {
      model: config.model,
      provider,
      hasCustomUserKey,
      isCreditModel,
      mode: config.mode
    });

    let requiredCredits = 0;
    const useServerSideCreditSettlement = isCreditModel && config.model.toLowerCase().includes('@system');
    if (isCreditModel) {
      const perImageCost = getModelCredits(config.model, config.imageSize);
      if (config.mode === GenerationMode.IMAGE || config.mode === GenerationMode.PPT) {
        requiredCredits = (config.parallelCount || 1) * perImageCost;
      } else {
        requiredCredits = perImageCost || 1;
      }

      if (requiredCredits > 0 && balance < requiredCredits) {
        import('./services/system/notificationService').then(({ notify }) => {
          notify.error('生成失败', '您的账户余额不足，请先充值积分。');
        });
        setShowRechargeModal(true);
        return;
      }

      // 闈炵郴缁熶唬鐞嗙Н鍒嗘ā鍨嬩粛娌跨敤鏃х殑鍓嶇棰勬墸璐规祦绋?
      if (requiredCredits > 0 && !useServerSideCreditSettlement) {
        console.log('[handleGenerate] 准备扣费:', { model: config.model, requiredCredits });
        const isPaymentSuccess = await consumeCredits(config.model, requiredCredits);
        console.log('[handleGenerate] 扣费结果:', { isPaymentSuccess });
        if (!isPaymentSuccess) {
          import('./services/system/notificationService').then(({ notify }) => {
            notify.error('生成失败', '您的账户余额不足，请先充值积分。');
          });
          setShowRechargeModal(true); // 鑷姩寮瑰嚭鍏呭€煎叆鍙?
          return;
        }
      }
    }
    setIsGenerating(true);
    try {

      // 4. Calculate Position
      // 鏅€氭ā寮忓簲浣跨敤褰撳墠瑙嗗彛涓績锛涜拷闂ā寮忎繚鐣欏師鏈夎崏绋垮畾浣嶉€昏緫
      const isFollowUp = !!activeSourceImage;
      const currentTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;
      const viewportRect = canvasRef.current?.getCanvasRect() || null;
      const viewportOffsets = getViewportOffsets(isSidebarOpen, isChatOpen, isMobile, chatSidebarWidth);
      const liveCenter = getPromptBarFrontPosition(currentTransform, viewportRect, viewportOffsets, 200, 48);
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

          // 馃殌 [Smart Re-centering Fix]
          // If the draft is an auto-center draft (not moved by user), FORCE it to stay at the REAL center
          // during the final generation calculation, even if the canvas was panned just now.
          const shouldAutoCenter = !draft.userMoved && !draft.sourceImageId && !draft.isGenerating;

          if (shouldAutoCenter) {
            console.log('[handleGenerate] Auto-centering draft to latest viewCenter for precise placement');
            currentPos = { ...viewCenter };
          } else {
            // 馃殌 [Auto-Center Fallback] If draft is off-screen, snap it to current view center
            // This fixes the issue where users pan away from a draft and then generate, causing the result to be "lost"
            // 馃殌 浣跨敤瀹炴椂 transform锛堝寘鎷嫋鍔ㄤ腑鐨勪綅缃級
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

          // 馃殌 [Collision Check] Ensure draft doesn't overlap others
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

          // 馃殌 [Fix] If reusing a draft (user placed), Respect its position! 
          // Only use safe-find for completely new/automatic generations.
          let safePos = currentPos;
          if (!isReusingDraft) {
            safePos = findSafePosition(currentPos, otherNodes);
          } else {
            // Ensure we are snapping to integer coordinates for sharpness
            safePos = { x: Math.round(currentPos.x), y: Math.round(currentPos.y) };
          }

          // 馃殌 Always reserve the FINAL position (whether shifted or not)
          reservedRegionsRef.current.push({
            timestamp: now,
            bounds: { x: safePos.x, y: safePos.y, width: 380, height: 200 }
          });

          if (safePos.x !== currentPos.x || safePos.y !== currentPos.y) {
            console.log('[handleGenerate] Draft collision detected, shifting to:', safePos);
            // 馃挕 Persist the shift to canvas state so it doesn't "jump back" or collide with next card
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

      // 🚀 [Performance Fix] 立即创建卡片，参考图异步加载
      // 先使用现有的参考图数据（可能有 storageId 但没有 data），在 executeGeneration 中再加载
      let finalReferenceImages = config.referenceImages.map(img => ({ ...img }));

      // 如果有源图片（追询模式），添加到参考图中
      if (activeSourceImage) {
        const sourceImage = activeCanvasRef.current?.imageNodes.find(img => img.id === activeSourceImage);
        const alreadyAdded = finalReferenceImages.some(ref => ref.id === sourceImage?.id);
        if (sourceImage && !alreadyAdded) {
          finalReferenceImages.push({
            id: sourceImage.id,
            data: '', // 在 executeGeneration 中异步加载
            storageId: sourceImage.storageId || sourceImage.id,
            mimeType: 'image/png'
          });
        }
      }

      // 🚀 异步保存参考图到 IDB（不阻塞）
      finalReferenceImages.forEach(ref => {
        if (ref.data) {
          import('./services/storage/imageStorage').then(({ saveImage }) => {
            const mime = (ref as any).mimeType || 'image/png';
            const fullUrl = ref.data!.startsWith('data:') ? ref.data! : `data:${mime};base64,${ref.data!}`;
            saveImage(ref.id, fullUrl).catch(e => console.warn('Ref save failed', e));
          });
        }
      });

      // 馃殌 Final hard-guard: in normal mode, always lock to CURRENT viewport center at click-time
      // This prevents any stale draft/canvas closure from pulling position back to initial canvas.
      if (!isFollowUp) {
        const latestTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;
        const latestViewportRect = canvasRef.current?.getCanvasRect() || null;
        const latestOffsets = getViewportOffsets(isSidebarOpen, isChatOpen, isMobile, chatSidebarWidth);
        currentPos = getPromptBarFrontPosition(latestTransform, latestViewportRect, latestOffsets, 200, 48);
        console.log('[handleGenerate] Final position hard-guard (normal mode):', currentPos);
      }

      const isNewAnim = true; // 馃殌 Always set for standard generation

      const rawPrompt = config.prompt.trim();
      let optimizedPromptEn: string | undefined;
      let optimizedPromptZh: string | undefined;
      let promptOptimizerResult: any | undefined; // 馃殌 [New] 鎻愮ず璇嶇紪璇戝櫒缁撴灉

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
          promptOptimizerResult = optimized.fullResult; // 馃殌 鎹曡幏瀹屾暣缂栬瘧鍣ㄧ粨鏋?
        } catch (e: any) {
          console.warn('[handleGenerate] Prompt optimization failed, fallback to raw prompt:', e);
          import('./services/system/notificationService').then(({ notify }) => {
            notify.error('提示词优化失败', '无法调用对话模型，已自动降级为原始提示词：' + (e.message || ''));
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
        ? normalizePptSlidesForCount(normalizedSlides, rawPrompt, pptCount)
        : [];

      const generatingNode: PromptNode = {
        id: promptNodeId!,
        prompt: rawPrompt,
        originalPrompt: rawPrompt,
        optimizedPromptEn,
        optimizedPromptZh,
        promptOptimizerResult, // 馃殌 [New] 瀛樺偍缂栬瘧鍣ㄧ粨鏋?
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
        lastGenerationSuccessCount: undefined,
        lastGenerationFailCount: undefined,
        lastGenerationTotalCount: undefined,
        referenceImages: finalReferenceImages,
        timestamp: Date.now(),
        isGenerating: true,
        error: undefined,
        errorDetails: undefined,
        refundStatus: undefined,
        isNew: isNewAnim, // 馃殌 鍚敤鍔ㄧ敾鏍囪
        parallelCount: pptCount,
        sourceImageId: activeSourceImage || undefined,
        mode: config.mode,
        isDraft: false, // Ensure it is NOT a draft anymore
        videoResolution: config.videoResolution,
        videoDuration: config.videoDuration,
        videoAudio: config.videoAudio,
        pptSlides: effectivePptSlides,
        pptStyleLocked: config.pptStyleLocked !== false,
        cost: requiredCredits,
        isPaymentProcessed: requiredCredits > 0 && !useServerSideCreditSettlement,
        generationMetadata: {
          pendingTaskIds: [],
        },
      };

      // 馃殌 [Fix Duplicate Placeholders]
      // Always check if the ID we are about to add/update actually exists on canvas
      // If not, revert to add. If yes, update.
      const canvasForWrite = activeCanvasRef.current;
      const STACK_SHIFT_Y = 10;
      const STACK_MATCH_X = 36;
      const STACK_MATCH_Y = 120;

      const overlappingPromptGroups = (canvasForWrite?.promptNodes || [])
        .filter(node =>
          node.id !== generatingNode.id &&
          Math.abs(node.position.x - generatingNode.position.x) <= STACK_MATCH_X &&
          Math.abs(node.position.y - generatingNode.position.y) <= STACK_MATCH_Y
        )
        .sort((a, b) => b.position.y - a.position.y);

      const promptUpdates: { id: string, updates: Partial<PromptNode> }[] = [];
      const imageUpdates: { id: string, updates: Partial<GeneratedImage> }[] = [];

      overlappingPromptGroups.forEach((node) => {
        promptUpdates.push({
          id: node.id,
          updates: {
            position: {
              ...node.position,
              y: node.position.y - STACK_SHIFT_Y,
            }
          }
        });

        (canvasForWrite?.imageNodes || [])
          .filter(img => img.parentPromptId === node.id)
          .forEach((img) => {
            imageUpdates.push({
              id: img.id,
              updates: {
                position: {
                  ...img.position,
                  y: img.position.y - STACK_SHIFT_Y,
                }
              }
            });
          });
      });

      if (promptUpdates.length > 0) {
        promptUpdates.forEach(({ id, updates }) => {
          const freshNode = activeCanvasRef.current?.promptNodes.find(n => n.id === id);
          if (freshNode) {
            updatePromptNode({ ...freshNode, ...updates });
          }
        });
      }

      if (imageUpdates.length > 0) {
        imageUpdates.forEach(({ id, updates }) => {
          if (updates.position) {
            updateImageNodePosition(id, updates.position, { ignoreSelection: true });
          } else {
            updateImageNode(id, updates);
          }
        });
      }

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
          console.log('[handleGenerate] 鉁?addPromptNode completed for:', generatingNode.id, 'isDraft:', generatingNode.isDraft);
        }
      }

      // 馃殌 [Cleanup] Remove any OTHER drafts if they exist (duplicate prevention)
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
      // 馃殌 [Fix] 涓嶅湪姝ゅ setIsGenerating(false)锛屽洜涓?executeGeneration 鍐呴儴宸茬鐞嗘鐘舵€?
      // 鍙戦€佽妭娴佺敱 lastGenerateAtRef 鎺у埗锛屼笉鍐嶄緷璧栨暣杞敓鎴愮粨鏉熸墠瑙ｉ攣
    }
  }, [config, draftNodeId, addPromptNode, updatePromptNode, updateImageNodePosition, updateImageNode, activeCanvas, activeSourceImage, canvasTransform, findNextGroupPosition, executeGeneration, getPromptHeight, isSidebarOpen, isChatOpen, isMobile, chatSidebarWidth, normalizePptSlidesForCount, getPreferredKeyForMode, consumeCredits, balance, setShowRechargeModal]);

  // Handle reference images
  const handleFilesDrop = useCallback((files: File[]) => {
    if (files.length === 0) return;
    if (config.referenceImages.length + files.length > 5) {
      import('./services/system/notificationService').then(({ notify }) => {
        notify.warning('无法添加图片', '最多支持 5 张参考图');
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

  // 鑷姩鏁寸悊锛氬鎵樼粰 CanvasContext
  const handleAutoArrange = useCallback(() => {
    arrangeAllNodes();
  }, [arrangeAllNodes]);

  // --- 杩炴帴绠＄悊 ---
  const handleCutConnection = useCallback((promptId: string, imageId: string) => {
    unlinkNodes(promptId, imageId);
  }, [unlinkNodes]);

  // 馃殌 [Strict Logic] Disconnect Parent -> Child Group becomes Normal Group
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

  // 馃殌 [Strict Logic] Pin Draft -> Create Lonely Main Card
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
    // 馃殌 [New Requirement] Clear input box and active source
    setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
    setActiveSourceImage(null);

    import('./services/system/notificationService').then(({ notify }) => {
      notify.success('已固定', '草稿已转换为独立卡片');
    });
  }, [activeCanvas, updatePromptNode, setDraftNodeId, setConfig]);

  // 馃殌 [New Feature] Pin Image -> Convert to Lonely Main Card (Idea Freeze)
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
      // 馃殌 Use the image itself as a reference to preserve the "Idea"
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
      isDraft: false, // 馃殌 [Fix] Ensure visibility
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
              isDraft: false, // 馃殌 [Fix] Prevent disappearance on timeout
              error: '生成超时',
              errorDetails: {
                code: 'TIMEOUT',
                responseBody: 'Retry request exceeded 600000ms timeout',
                model: node.model,
                timestamp: Date.now()
              }
            });
          }
        }, GENERATE_TIMEOUT_MS);

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
                ? '与整套 PPT 保持完全统一的视觉语言'
                : '保持整体风格统一，但允许当前页面有适度变化';
              const picked = slideLines.length > 0
                ? slideLines[Math.min(index, slideLines.length - 1)]
                : `主题：${node.prompt}。保持同一套视觉风格，页面内容独立不重复。`;
              return `PPT 第 ${index + 1}/${count} 页。${picked}。16:9。${styleDirective}。`;
            })()
            : node.prompt;

          if (currentMode === GenerationMode.VIDEO) {
            const videoResolution = (() => {
              if (node.videoResolution) return node.videoResolution;
              const size = node.imageSize?.toLowerCase() || '';
              if (size.includes('4k') || size.includes('ultra')) return '4k';
              if (size.includes('1080') || size.includes('hd')) return '1080p';
              return '720p'; // 榛樿720p
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

          // 馃殌 [Fair Billing] Detect ACTUAL dimensions from the blob/image
          // This ensures we bill for what was received (e.g. 1K), not what was requested (e.g. 4K)
          // if the API downgraded it.
          let actualWidth = 1024;
          let actualHeight = 1024;
          let displayDimensions = `${node.aspectRatio} 路 ${node.imageSize || '1K'}`;
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
            dimensions: displayDimensions, // 馃殌 Use Real Dimensions
            generationTime,
            index,
            url,
            originalUrl,
            prompt: taskPrompt,
            width: actualWidth,
            height: actualHeight,
            aspectRatio: node.aspectRatio,
            imageSize: computedImageSize, // 馃殌 Use Computed Cost Tier
            model: node.model,
            keySlotId: node.keySlotId,
            sourceReferenceStorageIds: (node.referenceImages || []).map(ref => ref.storageId || ref.id).filter(Boolean),
            alias: currentMode === GenerationMode.PPT ? buildPptPageAlias(node.pptSlides?.[index], index) : undefined,
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

          // 馃殌 [Fix] Image Y should be exactly below Prompt Y, without adding promptCardHeight
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
          // 馃殌 [Fix] node.position.y is already bottom anchor. Do NOT add promptCardHeight!
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

      // Add to canvas atomically with parent linking
      addImageNodes(newImageNodes, {
        [node.id]: {
          isGenerating: false,
          isDraft: false, // 馃殌 [Fix] Ensure persistence
          childImageIds: newImageNodes.map(n => n.id),
          error: undefined,
          errorDetails: undefined
        }
      });

      // Record cost
      // 馃殌 [Fair Billing] Use the computed/effective size from the first result (assuming all in batch are same)
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
          },
          newImageNodes[0]?.keySlotId || node.keySlotId
        );
      });
      import('./services/system/notificationService').then(({ notify }) => {
        notify.success('生成完成', '重新生成成功');
      });

    } catch (error: any) {
      updatePromptNode({
        ...node,
        isGenerating: false,
        isDraft: false, // 馃殌 [Fix] Prevent disappearance on error
        error: error.message || 'Retry failed',
        errorDetails: extractErrorDetails(error, node.model)
      });
      import('./services/system/notificationService').then(({ notify }) => {
        notify.error('閲嶈瘯澶辫触', error.message);
      });
    }
  }, [config.parallelCount, isMobile, updatePromptNode, addImageNodes, config.enableGrounding, extractErrorDetails, normalizePptSlidesForCount, buildAutoPptSlides]);

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
  <title>PPT 导出预览</title>
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
  <h1>${(node.prompt || 'PPT 瀵煎嚭').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
  <div class="grid">
    ${pagesMeta.map(p => `
      <div class="card">
        <img src="../${p.file}" alt="${String(p.title).replace(/"/g, '&quot;')}" />
        <div class="meta">
          <div class="title">绗?{p.page}椤?路 ${String(p.title).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
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
        notify.warning('页面不存在', `未找到图 ${pageIndex + 1}`);
      });
      return;
    }

    const slides = normalizePptSlidesForCount(
      node.pptSlides,
      node.prompt,
      Math.max(pageIndex + 1, node.parallelCount || 1, ordered.length)
    );
    const slideText = slides[pageIndex]
      || `主题：${node.prompt}。保持同一套视觉风格，页面内容独立不重复。`;
    const layoutDirective = (() => {
      const t = slideText.toLowerCase();
      if (/封面|cover|title/.test(t)) return '采用封面版式：大标题 + 副标题 + 视觉主图，信息精简。';
      if (/目录|agenda|contents?/.test(t)) return '采用目录版式：清晰列出 4-6 个章节条目，层级分明。';
      if (/总结|结论|行动|summary|conclusion/.test(t)) return '采用总结版式：突出结论要点和行动建议，重点高亮。';
      if (/章节|section|transition/.test(t)) return '采用章节过渡页版式：突出章节标题，并配合关键词。';
      return '采用内容页版式：标题 + 3-5 个信息块，层次清晰。';
    })();
    const styleDirective = node.pptStyleLocked !== false
      ? '与整套 PPT 保持完全统一的视觉语言'
      : '保持整体风格统一，但允许当前页面有适度变化';
    const previousVisualHint = (() => {
      const raw = (target.prompt || '').replace(/PPT第\d+\/?\d*页。?/g, '').trim();
      if (!raw) return '';
      const compact = raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;
      return `参考上一版视觉关键词：${compact}。`;
    })();
    const taskPrompt = `PPT 第 ${pageIndex + 1}/${Math.max(1, node.childImageIds.length)} 页。${slideText}。16:9。${styleDirective}。${layoutDirective}${previousVisualHint}`;

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
        ...resolveProviderDisplay(result.keySlotId || node.keySlotId, result.providerName || target.providerLabel, result.provider || target.provider),
        url: result.url,
        originalUrl: result.url,
        prompt: taskPrompt,
        timestamp: Date.now(),
        generationTime: Date.now() - startTime,
        model: result.model || node.model,
        modelLabel: result.modelName || target.modelLabel,
        keySlotId: result.keySlotId || node.keySlotId,
        imageSize: result.imageSize || node.imageSize,
        aspectRatio: result.aspectRatio || node.aspectRatio,
        dimensions: result.dimensions ? `${result.dimensions.width}x${result.dimensions.height}` : target.dimensions,
        exactDimensions: result.dimensions || target.exactDimensions,
        sourceReferenceStorageIds: (node.referenceImages || []).map(ref => ref.storageId || ref.id).filter(Boolean),
        alias: buildPptPageAlias(slideText, pageIndex),
        storageId,
        isGenerating: false,
        error: undefined
      });

      rememberPreferredKeyForMode(node.mode, result.keySlotId || node.keySlotId);

      import('./services/system/notificationService').then(({ notify }) => {
        notify.success('单页重绘完成', `已更新图${pageIndex + 1}`);
      });
    } catch (error: any) {
      updateImageNode(target.id, {
        isGenerating: false,
        error: error?.message || '单页重绘失败'
      });
      import('./services/system/notificationService').then(({ notify }) => {
        notify.error('单页重绘失败', error?.message || '请稍后重试');
      });
    }
  }, [activeCanvas, updateImageNode, rememberPreferredKeyForMode, normalizePptSlidesForCount]);

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
        notify.success('导出完成', `已导出图 ${pageIndex + 1}`);
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
  <dc:title>${escapeXml(node.prompt || 'KK Studio PPT 瀵煎嚭')}</dc:title>
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
      const outlineRaw = node.pptSlides?.[i] || img.alias || `第 ${i + 1} 页`;
      const { title: outlineTitle, subtitle: outlineSubtitle } = parsePptOutlineLine(outlineRaw);
      const titleText = outlineTitle || `第 ${i + 1} 页`;
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
      notify.success('PPTX 导出完成', `已导出 ${ordered.length} 页的 .pptx 文件`);
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
      mode: clickedNode.mode || GenerationMode.IMAGE // 馃殌 Sync Mode (Image/Video)
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
    // 馃殌 Shift=鍒囨崲(鍚戝悗鍏煎), 鏃犱慨楗伴敭=鏇挎崲
    selectNodes([imageId], (window.event as any)?.shiftKey ? 'toggle' : 'replace');

    // Set this image as source for continuing conversation
    setActiveSourceImage(imageId);
    // Clear prompt and existing references to start fresh continue-conversation
    setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));

    // 馃殌 绔嬪嵆鍒涘缓杩介棶妯″紡鐨凞raft鑺傜偣
    // 鍒犻櫎鐜版湁鐨刣raft锛堝鏋滄湁锛?
    if (draftNodeId) {
      deletePromptNode(draftNodeId);
    }

    // 璁＄畻杩介棶Draft鐨勪綅缃紙鍦ㄧ埗鍗＄粍涓嬫柟锛?
    const sourceImage = activeCanvas?.imageNodes.find(img => img.id === imageId);
    if (sourceImage) {
      const parentPromptId = sourceImage.parentPromptId;
      const parentPrompt = activeCanvas?.promptNodes.find(p => p.id === parentPromptId);

      // 馃殌 璁＄畻婧愬浘鐗囩殑搴曢儴Y锛堝浘鐗囦娇鐢ㄥ簳閮ㄩ敋鐐癸紝position.y灏辨槸搴曢儴锛?
      const sourceBottom = sourceImage.position.y;

      let draftPos = { x: sourceImage.position.x, y: sourceBottom + 100 }; // fallback锛氭簮鍥剧墖涓嬫柟100px

      if (parentPrompt) {
        // 鎵惧埌鐖朵富鍗′笅鎵€鏈夊瓙鍗★紝璁＄畻鏈€澶浣嶇疆锛堝簳閮級
        const siblingImages = activeCanvas?.imageNodes.filter(img => img.parentPromptId === parentPromptId) || [];
        let maxY = parentPrompt.position.y; // 涓诲崱搴曢儴閿氱偣

        siblingImages.forEach(img => {
          // 馃殌 FIX: 鍥剧墖浣跨敤搴曢儴閿氱偣锛宲osition.y灏辨槸搴曢儴锛屾棤闇€鍐嶅姞楂樺害
          maxY = Math.max(maxY, img.position.y);
        });

        draftPos = {
          x: parentPrompt.position.x,
          y: maxY + 80  // 鍦ㄦ渶搴曢儴鐨勫崱鐗囦笅鏂?0px
        };
      }

      const newId = Date.now().toString();
      addPromptNode({
        id: newId,
        prompt: '',  // 绌簆rompt锛岀瓑寰呯敤鎴疯緭鍏?
        position: draftPos,
        aspectRatio: config.aspectRatio,
        imageSize: config.imageSize,
        model: config.model,
        childImageIds: [],
        referenceImages: [],  // 婧愬浘鐗囦細鍦╤andleGenerate鏃惰嚜鍔ㄦ坊鍔?
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
    // 馃殌 Uniform 40px padding on all sides
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
  const { visiblePromptNodes, visibleImageNodes, visibleGroups, nowTimestamp } = React.useMemo(() => {
    if (!activeCanvas) {
      return { visiblePromptNodes: [], visibleImageNodes: [], visibleGroups: [] };
    }

    // Buffer: Load 2 screens worth of content around the viewport to prevent flash on drag
    const BUFFER = 5000; // 馃殌 澧炲ぇ缂撳啿鍖洪槻姝㈡嫋鍔ㄦ椂娑堝け

    // Viewport Render Bounds in Canvas Coordinates
    const vLeft = -canvasTransform.x / canvasTransform.scale - BUFFER;
    const vTop = -canvasTransform.y / canvasTransform.scale - BUFFER;
    const vRight = (window.innerWidth - canvasTransform.x) / canvasTransform.scale + BUFFER;
    const vBottom = (window.innerHeight - canvasTransform.y) / canvasTransform.scale + BUFFER;

    // 1. Filter Groups
    const visibleGroups = activeCanvas.groups
      .filter(g => {
        const { x, y, width, height } = g.bounds;
        return !(x > vRight || x + width < vLeft || y > vBottom || y + height < vTop);
      })
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    // 2. Filter Prompt Nodes (鎺掗櫎绾緟鍛借崏绋匡紝浣嗕繚鐣欐鍦ㄧ敓鎴愮殑鑺傜偣)
    const visiblePromptNodes = activeCanvas.promptNodes
      .filter(n => {
        // 馃殌 [Fix] 鍙湁褰撳崱鐗囦粎浠呮槸闈欐€佽崏绋匡紙闈炵敓鎴愪腑锛夋椂鎵嶉殣钘忥紝鍥犱负瀹冪敱涓績鎺у埗鏍忚礋璐ｆ覆鏌撱€?
        // 涓€鏃﹁繘鍏ョ敓鎴愮姸鎬?(n.isGenerating)锛屽畠闇€瑕佸嚭鐜板湪鐢诲竷涓娿€?
        if (n.isDraft && !n.isGenerating) {
          return false;
        }

        // Estimate Bounds (Center X, Bottom Y)
        const w = 800;
        const h = 800;
        const x = n.position.x - w / 2;
        const y = n.position.y - h;

        return !(x > vRight || x + w < vLeft || y > vBottom || y + h < vTop);
      })
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    // 3. Filter Image Nodes
    const visibleImageNodes = activeCanvas.imageNodes
      .filter(n => {
        const w = 800;
        const h = 1200;
        const x = n.position.x - w / 2;
        const y = n.position.y - h;
        return !(x > vRight || x + w < vLeft || y > vBottom || y + h < vTop);
      })
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    // 馃殌 Cache timestamp
    const nowTimestamp = Date.now();

    return { visiblePromptNodes, visibleImageNodes, visibleGroups, nowTimestamp };
  }, [activeCanvas, canvasTransform]);

  const actualChildImagesByPromptId = React.useMemo(() => {
    const childMap = new Map<string, GeneratedImage[]>();
    if (!activeCanvas) return childMap;

    activeCanvas.imageNodes.forEach(image => {
      if (!image.parentPromptId) return;
      const bucket = childMap.get(image.parentPromptId) || [];
      bucket.push(image);
      childMap.set(image.parentPromptId, bucket);
    });

    return childMap;
  }, [activeCanvas]);

  const imageNodesById = React.useMemo(
    () => new Map((activeCanvas?.imageNodes || []).map(node => [node.id, node])),
    [activeCanvas]
  );

  const visibleImageNodesById = React.useMemo(
    () => new Map(visibleImageNodes.map(node => [node.id, node])),
    [visibleImageNodes]
  );

  const visibleImageNodeIds = React.useMemo(
    () => new Set(visibleImageNodes.map(node => node.id)),
    [visibleImageNodes]
  );

  useEffect(() => {
    if (!isReady || !activeCanvas || !canvasRef.current) return;

    const totalCards = (activeCanvas.promptNodes?.length || 0) + (activeCanvas.imageNodes?.length || 0);
    if (totalCards === 0) return;

    if (visiblePromptNodes.length > 0 || visibleImageNodes.length > 0) {
      autoRecoveredCanvasKeyRef.current = '';
      return;
    }

    const recoveryKey = `${activeCanvas.id}:${totalCards}`;
    if (autoRecoveredCanvasKeyRef.current === recoveryKey) return;
    autoRecoveredCanvasKeyRef.current = recoveryKey;

    const timer = window.setTimeout(() => {
      console.warn('[App] Active canvas has cards but nothing is visible, auto-centering view', {
        canvasId: activeCanvas.id,
        promptCount: activeCanvas.promptNodes.length,
        imageCount: activeCanvas.imageNodes.length
      });
      handleResetView();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    isReady,
    activeCanvas,
    visiblePromptNodes.length,
    visibleImageNodes.length,
    handleResetView
  ]);

  const handleCanvasTransformChange = useCallback((nextTransform: { x: number; y: number; scale: number }) => {
    startTransition(() => {
      setCanvasTransform(nextTransform);
    });
  }, []);

  const handleCanvasInteractionChange = useCallback((state: { isDragging: boolean; isZooming: boolean }) => {
    const nextValue = state.isDragging || state.isZooming;
    setIsCanvasTransforming(prev => (prev === nextValue ? prev : nextValue));
  }, []);

  // [Blocking Load] Wait for Canvas Hydration to prevent "Triple Load" flash
  if (!isReady) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  const CONNECTOR_LAYER_Z_INDEX = 0;

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
    <div id="canvas-container" className={`relative w-screen h-screen overflow-hidden text-zinc-100 font-inter selection:bg-indigo-500/30 ${isMobile ? 'ios-mobile-shell' : ''}`}
      style={{ backgroundColor: 'var(--bg-canvas)' }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onMouseMove={handleRootMouseMove}
      onMouseUp={handleRootMouseUp}
    >
      {/* Top Left Credits Display */}
      {!isMobile && (
        <div className="absolute top-4 left-4 z-[100] flex items-center gap-2">
          <div
            className="flex items-center gap-3 px-4 py-2 rounded-full border shadow-2xl backdrop-blur-md transition-all hover:border-[var(--border-medium)] group"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
          >
            <div className="flex items-center gap-1.5 pt-0.5">
              <Sparkles size={18} fill="currentColor" className="text-blue-500 mb-0.5" />
              <div className="flex items-center select-none gap-1">
                <span className="text-[18px] font-mono font-bold leading-none min-w-[20px] drop-shadow-sm" style={{ color: 'var(--text-primary)' }}>
                  {balanceLoading ? (
                    <Loader2 size={16} className="animate-spin opacity-40 text-blue-400" />
                  ) : balance}
                </span>
                <span className="text-[14px] font-bold text-blue-400 mt-0.5">积分</span>
              </div>
            </div>
            <div className="w-px h-6" style={{ backgroundColor: 'var(--border-light)' }} />
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
              openSettingsPanel('dashboard');
            }}
            onSettingsClick={() => {
              openSettingsPanel('api-management');
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
              className="relative w-10 h-10 rounded-full overflow-hidden border-2 transition-all shadow-2xl flex items-center justify-center cursor-pointer active:scale-95"
              style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-secondary)' }}
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
            <div className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 z-10 shadow-lg ${derivedApiStatus === 'success' ? 'bg-green-500' :
              derivedApiStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
              }`} style={{ borderColor: 'var(--bg-canvas)' }} />

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
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.user_metadata?.full_name || '用户'}</div>
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

                    {/* [NEW] 璐︽埛绠＄悊鍏ュ彛 */}
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
        // 馃殌 璁＄畻璇︾粏缁熻锛氱粍鏁?鍥剧墖鏁?瑙嗛鏁?
        const selectedPrompts = activeCanvas?.promptNodes.filter(n => selectedNodeIds.includes(n.id)) || [];
        const selectedImages = activeCanvas?.imageNodes.filter(n => selectedNodeIds.includes(n.id)) || [];

        const groupCount = selectedPrompts.length; // 涓诲崱 = 缁?
        const videoCount = selectedImages.filter(img =>
          img.mode === GenerationMode.VIDEO ||
          img.url?.includes('.mp4') ||
          img.url?.startsWith('data:video')
        ).length;
        const imageCount = selectedImages.length - videoCount; // 鍥剧墖 = 鍓崱鎬绘暟 - 瑙嗛鏁?

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

              // 馃殌 Merge Logic: Find existing groups that contain any of the selected nodes
              const selectedNodeSet = new Set([...prompts.map(n => n.id), ...images.map(n => n.id)]);
              const existingGroupsInSelection = activeCanvas.groups.filter(g =>
                g.nodeIds.some(nid => selectedNodeSet.has(nid))
              );

              // Collect all node IDs from existing groups to ensure they're merged
              const allMergedNodeIds = new Set<string>();
              existingGroupsInSelection.forEach(g => g.nodeIds.forEach(nid => allMergedNodeIds.add(nid)));
              selectedNodeSet.forEach(nid => allMergedNodeIds.add(nid));

              // 馃殌 Label Merge Logic
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

              // 馃殌 Remove old groups that are being merged
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

              const padding = 40; // 馃殌 Uniform 40px all sides
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



      {/* 🚀 [Mobile] 手机端聊天流式界面 - 替代无限画布 */}
      {isMobile && (
        <MobileChatFeed
          promptNodes={activeCanvas?.promptNodes || []}
          imageNodes={activeCanvas?.imageNodes || []}
          onPromptPositionChange={updatePromptNodePosition}
          onPromptSelect={(nodeId) => selectNodes([nodeId], 'replace')}
          onPromptClick={handlePromptClick}
          onPromptCancel={handleCancelGeneration}
          onPromptRetry={handleRetryNode}
          onPromptDelete={deletePromptNode}
          onPromptDisconnect={handleDisconnectPrompt}
          onPromptUpdate={updatePromptNode}
          onPromptHeightChange={(id, height) => {
            const node = activeCanvas?.promptNodes.find(n => n.id === id);
            if (node && node.height !== height) updatePromptNode({ ...node, height });
          }}
          onPromptPin={handlePinDraft}
          onPromptRemoveTag={(id, tag) => {
            const node = activeCanvas?.promptNodes.find(n => n.id === id);
            if (node && node.tags) updatePromptNode({ ...node, tags: node.tags.filter(t => t !== tag) });
          }}
          onPromptExportPpt={handleExportPptPackage}
          onPromptExportPptx={handleExportPptx}
          onPromptRetryPptPage={handleRetryPptSinglePage}
          onPromptExportPptPage={handleExportPptSinglePage}
          onOpenStorageSettings={() => { setShowSettingsPanel(true); setSettingsInitialView('storage-settings'); }}
          selectedNodeIds={selectedNodeIds}
          actualChildImagesByPromptId={actualChildImagesByPromptId}
          getNodeIoTrace={getNodeIoTrace}
          onImagePositionChange={updateImageNodePosition}
          onImageDelete={deleteImageNode}
          onImageClick={handleImageClick}
          onImageSelect={(id) => selectNodes([id], 'replace')}
          onImageUpdate={updateImageNode}
          onImageDimensionsUpdate={updateImageNodeDisplayMeta}
          onImagePreview={handleOpenPreview}
          activeSourceImage={activeSourceImage}
          highlightedId={highlightedId}
          nowTimestamp={nowTimestamp || Date.now()}
        />
      )}

      {/* Main Infinite Canvas - 仅在非手机端显示 */}
      {!isMobile && (
      <InfiniteCanvas
        id="canvas-container"
        ref={canvasRef}
        showGrid={showGrid}
        onTransformChange={handleCanvasTransformChange}
        onInteractionChange={handleCanvasInteractionChange}
        cardPositions={[
          ...(activeCanvas?.promptNodes.map(n => n.position) || []),
          ...(activeCanvas?.imageNodes.map(n => n.position) || [])
        ]}
        onCanvasClick={() => {
          // [Draft Logic] Detach from draft when clicking background
          // if (draftNodeId) setDraftNodeId(null); // 馃殌 [FIX] Prevent detaching draft on background click to avoid "Lonely Main Card" orphans

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
            // 馃殌 [Fix] Explicitly remove draft node so preview disappears
            if (draftNodeId) {
              deletePromptNode(draftNodeId);
              setDraftNodeId(null);
            }
          }
        }}
        onAutoArrange={handleAutoArrange}
        onResetView={() => {
          // 瀹氫綅鍒版渶鏂扮敓鎴愮殑鍗＄墖
          const latestImage = activeCanvas?.imageNodes[activeCanvas.imageNodes.length - 1];
          const latestPrompt = activeCanvas?.promptNodes[activeCanvas.promptNodes.length - 1];

          // 浼樺厛瀹氫綅鍒版渶鏂扮殑鍥剧墖,濡傛灉娌℃湁鍒欏畾浣嶅埌鏈€鏂扮殑鎻愮ず璇?
          const targetNode = latestImage || latestPrompt;

          if (targetNode && canvasRef.current) {
            // 浣跨敤InfiniteCanvas鐨剆etView鏂规硶瀹氫綅鍒扮洰鏍囧崱鐗?
            const container = document.getElementById('canvas-container');
            if (container) {
              const rect = container.getBoundingClientRect();
              const centerX = rect.width / 2;
              const centerY = rect.height / 2;

              // 璁＄畻闇€瑕佺殑transform浣跨洰鏍囧崱鐗囧眳涓?
              const newX = centerX - targetNode.position.x * canvasTransform.scale;
              const newY = centerY - targetNode.position.y * canvasTransform.scale;

              canvasRef.current.setView(newX, newY, canvasTransform.scale);
            }
          }
        }}
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
            zIndex: CONNECTOR_LAYER_Z_INDEX,
            transform: 'translateZ(0)' // 馃殌 [GPU鍔犻€焆 寮哄埗GPU娓叉煋鎻愬崌鎷栨嫿鎬ц兘
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
          {visiblePromptNodes.map(pn => {
            const actualChildNodes = actualChildImagesByPromptId.get(pn.id) || [];
            const childNodes = actualChildNodes.length > 0
              ? actualChildNodes
              : (pn.childImageIds || [])
                .map(childId => imageNodesById.get(childId))
                .filter((img): img is GeneratedImage => Boolean(img));

            return childNodes.map((childNode) => {
              if (!childNode || !visibleImageNodeIds.has(childNode.id)) return null;

              // Flowith-style: Prompt Bottom 鈫?Image Top
              // Prompt Anchor: Bottom Center (pn.position)
              // Image Anchor: Bottom Center (childNode.position)

              // Start: Prompt Bottom Center
              const startX = pn.position.x + 5000;
              const startY = pn.position.y + 5000;

              // End: Image Top Center (Bottom - Height)
              const { width: cardWidth, totalHeight: theoreticalHeight } = getCardDimensions(childNode.aspectRatio, true);
              let imageHeight = theoreticalHeight;

              if (childNode.dimensions && typeof childNode.dimensions === 'string') {
                // 馃殌 [Fix Bug] Extract purely the dimension part: "1:1 路 4096x4096" -> "4096x4096"
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
              /* 馃殌 涓诲崱鍜屽壇鍗′箣闂寸殑杩炵嚎淇濇寔鐧界伆鑹?*/

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
                <g key={`${pn.id}-${childNode.id}`}>
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
          {visiblePromptNodes.map(pn => {
            if (pn.isDraft) return null; // Draft/pending connection is rendered by pending-connection block below
            if (!pn.sourceImageId) return null;
            const sourceNode = visibleImageNodesById.get(pn.sourceImageId);
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

            /* 馃殌 鏂伴鑹查€昏緫锛氶噸缁樹负缁胯壊锛岃拷闂负閲戣壊 */
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
                    className="w-6 h-6 rounded-full border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center cursor-pointer shadow-lg scale-90 hover:scale-110 active:scale-95 transition-all"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
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
            if (!visibleImageNodeIds.has(activeSourceImage)) return null;
            const sourceNode = visibleImageNodesById.get(activeSourceImage);
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

            /* 馃殌 鏂伴鑹查€昏緫瀵逛簬寰呯敓鎴愯繛鎺ワ細鍒╃敤閰嶇疆涓殑妯″紡鍒ゆ柇 */
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
                    className="w-6 h-6 rounded-full border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center cursor-pointer shadow-lg scale-90 hover:scale-110 active:scale-95 transition-all"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
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




        {/* 2. 缂栫粍灞?(浣嶄簬鍗＄墖鍚庢柟) */}
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

        {/* 3. 鎸佷箙鍖栨彁绀鸿瘝鑺傜偣 */}
        {visiblePromptNodes.map(node => (
          <PromptNodeComponent
            key={node.id}
            node={node}
            actualChildImageCount={(actualChildImagesByPromptId.get(node.id) || []).length}
            onPositionChange={updatePromptNodePosition}
            isSelected={selectedNodeIds.includes(node.id)}
            highlighted={highlightedId === node.id}
            onSelect={() => {
              selectNodes([node.id], (window.event as any)?.shiftKey ? 'toggle' : 'replace');
              // 馃殌 Right Click triggers Selection Menu centered on node bounds
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

              const mainCard = activeCanvas?.promptNodes.find(p => p.id === sourceNodeId);
              const childImageIds = mainCard?.childImageIds || [];
              const expandedSelectedIds = Array.from(new Set(
                selectedNodeIds.flatMap((selectedId) => {
                  const selectedPrompt = activeCanvas?.promptNodes.find(p => p.id === selectedId);
                  if (!selectedPrompt) return [selectedId];

                  return [
                    selectedId,
                    ...(selectedPrompt.childImageIds || []).filter((id): id is string => !!id),
                  ];
                })
              ));

              if (selectedNodeIds.includes(sourceNodeId) && expandedSelectedIds.length > 0) {
                moveSelectedNodes(delta, expandedSelectedIds);
              } else if (childImageIds.length > 0) {
                moveSelectedNodes(delta, [sourceNodeId, ...childImageIds.filter((id): id is string => !!id)]);
              } else {
                moveSelectedNodes(delta, sourceNodeId);
              }
              // 馃殌 [Fix] Force re-render for real-time connection line updates
            }} // 馃殌 Enable Safe Relative Drag
            canvasTransform={canvasTransform} // 馃殌 Pass Transform for Animation Calculation
          />
        ))}

        {/* 3. 鍥剧墖鑺傜偣 */}
        {visibleImageNodes.map(node => (
          <ImageNode
            key={node.id}
            image={node}
            position={node.position}
            onPositionChange={updateImageNodePosition}
            highlighted={highlightedId === node.id}
            onDimensionsUpdate={updateImageNodeDisplayMeta}
            onUpdate={updateImageNode} // 馃殌
            onDelete={deleteImageNode}
            onConnectEnd={handleConnectEnd}
            onClick={handleImageClick}
            isActive={node.id === activeSourceImage}
            isSelected={selectedNodeIds.includes(node.id)}
            onSelect={() => {
              selectNodes([node.id], (window.event as any)?.shiftKey ? 'toggle' : 'replace');
              // 馃殌 Right Click triggers Selection Menu centered on node bounds
              if ((window.event as any)?.button === 2) {
                const pos = getSelectionScreenCenter([node.id]);
                if (pos) setSelectionMenuPosition(pos);
              }
            }}
            zoomScale={canvasTransform.scale}
            isMobile={isMobile}
            onPreview={handleOpenPreview}
            onPreviewPptStack={handleOpenPptStackPreview}
            onDownloadPptComposite={handleDownloadPptComposite}
            isCanvasTransforming={isCanvasTransforming}
            // 馃殌 [Optimization] Identify if the node was created in the last 10 seconds
            isNew={(nowTimestamp || Date.now()) - (node.timestamp || 0) < 10000}
            canvasTransform={canvasTransform} // 馃殌 Pass Transform for Animation Calculation
            onDragDelta={(delta, sourceNodeId) => {
              if (!sourceNodeId) return;

              const isSubCard = node.parentPromptId && activeCanvas?.promptNodes.some(p => p.id === node.parentPromptId);
              const expandedSelectedIds = Array.from(new Set(
                selectedNodeIds.flatMap((selectedId) => {
                  const selectedPrompt = activeCanvas?.promptNodes.find(p => p.id === selectedId);
                  if (!selectedPrompt) return [selectedId];

                  return [
                    selectedId,
                    ...(selectedPrompt.childImageIds || []).filter((id): id is string => !!id),
                  ];
                })
              ));

              if (selectedNodeIds.includes(sourceNodeId) && expandedSelectedIds.length > 0) {
                moveSelectedNodes(delta, expandedSelectedIds);
              } else if (isSubCard) {
                moveSelectedNodes(delta, sourceNodeId);
              } else {
                moveSelectedNodes(delta, sourceNodeId);
              }
              // 馃殌 [Fix] Force re-render for real-time connection line updates
            }} // 馃殌 Enable Safe Relative Drag
          />
        ))}

        {/* 4. Pending / Typing Node */}
        {/* 4. Pending / Typing Node - Removed (Now handled by Persistent Draft DraftNode) */}
        {/* <PendingNode ... /> removed */}
      </InfiniteCanvas>
      )}



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
            openSettingsPanel(view || 'api-management');
            handleHideMobileNav(); // Hide nav when opening settings (optional, but requested behavior implies consistent handling)
          }}
          onInteract={handleShowMobileNav}
          onFocus={() => {
            console.log('[PromptBar] onFocus - 璁剧疆isPromptFocused=true');
            setIsPromptFocused(true);
          }}
          onBlur={() => {
            console.log('[PromptBar] onBlur - 璁剧疆isPromptFocused=false');
            setIsPromptFocused(false);
            // 澶卞幓鐒︾偣鍚?绔嬪嵆閲嶆柊璁剧疆5绉掑畾鏃跺櫒
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
            openSettingsPanel(view || 'api-management');
          }}
          onHoverChange={(isHovered) => setIsSidebarHovered(isHovered)}
          onWidthChange={setChatSidebarWidth}
        />
      </div>

      {/* Legacy KeyManagerModal removed - integrated into UserProfileModal */}

      {/* User Profile Modal (Unified) */}
      {/* Modals */}
      {isTagModalOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}
      {showProfileModal && (
        <Suspense fallback={null}>
          <UserProfileModal
            isOpen={showProfileModal}
            onClose={() => setShowProfileModal(false)}
            user={user}
            onSignOut={signOut}
            initialView={profileInitialView}
            isMobile={isMobile}
          />
        </Suspense>
      )}

      {/* Settings Panel (Dashboard, API Channels, Cost, Logs) */}
      {showSettingsPanel && (
        <Suspense fallback={null}>
          <SettingsPanel
            key={`${settingsPanelSessionKey}-${settingsInitialView}-${settingsInitialSupplier?.id || 'none'}`}
            isOpen={showSettingsPanel}
            onClose={() => {
              setShowSettingsPanel(false);
              setSettingsInitialSupplier(null);
            }}
            initialView={settingsInitialView}
            initialSupplier={settingsInitialSupplier}
          />
        </Suspense>
      )}

      {/* Storage Selection Modal (Post-Login) */}
      {showStorageModal && (
        <Suspense fallback={null}>
          <StorageSelectionModal
            isOpen={showStorageModal}
            onComplete={() => {
              setShowStorageModal(false);
              setIsStorageChecked(true);
              if (!keyManager.hasValidKeys()) {
                openSettingsPanel('api-management');
              }
            }}
          />
        </Suspense>
      )}







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



      {/* [NEW] Draft Node Overlay (Fixed Center) - 馃殌 [宸茬鐢╙ 鐢ㄦ埛涓嶆兂瑕佽拷闂椂鐨勯瑙堝崱鐗?*/}
      {/* {draftNodeId && (() => {
        const draftNode = activeCanvas?.promptNodes.find(n => n.id === draftNodeId);
        // 馃殌 [Fix] 鍙湁褰撹妭鐐逛粛鐒舵槸鑽夌鏃舵墠鏄剧ず鍙犲姞灞傦紝鐢熸垚涓殑鑺傜偣搴旇鍙湪鐢诲竷涓婃樉绀?
        if (!draftNode || !draftNode.isDraft) return null;

        // Mock position 0,0 for component, handle centering via container
        const displayNode = { ...draftNode, position: { x: 0, y: 0 } };

        // 馃殌 [Sidebar Responsive Layout]
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



      {/* 鍏ㄥ眬鐏涓庢悳绱㈤潰鏉?(鎼滅储闈㈡澘缃簬搴曢儴锛岀伅绠辩疆浜庢渶涓婂眰) */}
      {previewImages && (
        <Suspense fallback={null}>
          <GlobalLightbox
            images={previewImages}
            initialIndex={previewInitialIndex}
            onClose={() => setPreviewImages(null)}
            onEditText={handleEditPptTextFromLightbox}
            onDownloadPptComposite={handleDownloadPptComposite}
            onInpaint={(image, maskBase64, prompt) => {
              const userPrompt = (prompt || '局部重绘').trim();
              // 馃殌 [绠€鍖栧榻怾 杩欓噷鐨?prompt 灏嗕細杩涘叆浼樺寲鍣紝鍥犳涓嶉渶瑕佸甫鏈夊お閲嶇殑纭紪鐮佷腑鏂囨寚浠ゃ€?
              // 鍙渶瑕佹爣鏄庢牳蹇冩剰鍥撅細濡傛灉鏄?mask锛屽己璋冧慨鏀规秱鎶瑰尯鍩燂紱濡傛灉鏄叏灞€鍙傝€冿紝寮鸿皟閲嶇粯銆?
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
        </Suspense>
      )}

      {pptStackPreview && (
        <PptStackPreviewModal
          images={pptStackPreview.images}
          initialIndex={pptStackPreview.initialIndex}
          onClose={() => setPptStackPreview(null)}
        />
      )}
      {isSearchOpen && (
        <Suspense fallback={null}>
          <SearchPalette
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            promptNodes={activeCanvas?.promptNodes || []}
            groups={activeCanvas?.groups || []}
            onNavigate={handleNavigateToNode}
            onMultiSelectConfirm={handleMultiSelectConfirm}
          />
        </Suspense>
      )}

      {/* Navigation and Overlays Removed for Mobile Bottom Dock Consistency */}
      {showTutorial && (
        <Suspense fallback={null}>
          <TutorialOverlay
            onComplete={() => {
              setShowTutorial(false);
              localStorage.setItem('kk_tutorial_seen', 'true');
            }}
          />
        </Suspense>
      )}


      {/* AI鑱婂ぉ鎸夐挳 - 鍙充笅瑙掑浐瀹?*/}
      {/* AI鑱婂ぉ鎸夐挳 - 鍙充笅瑙掑浐瀹?*/}
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

          {/* 钃濊壊鍗婇€忔槑閬僵灞?*/}
          <div className="absolute inset-0 rounded-full bg-blue-500/15 z-[1]"></div>

          {/* 鏄熷厜鍥炬爣 - 鎮仠鏃剁紦鎱㈡棆杞?0搴?*/}
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

      {/* 馃殌 杩佺Щ寮圭獥 */}
      {showMigrateModal && (
        <Suspense fallback={null}>
          <MigrateModal
            isOpen={showMigrateModal}
            onClose={() => setShowMigrateModal(false)}
            canvases={state.canvases}
            currentCanvasId={state.activeCanvasId}
            selectedCount={selectedNodeIds.length}
            onMigrate={(targetCanvasId) => {
          // 馃殌 澶勭悊"鏂板缓椤圭洰骞惰縼绉?
          if (targetCanvasId === '__new__') {
            // 鍒涘缓鏂伴」鐩紙杩斿洖鏂扮敾甯僆D锛?
            const newCanvasId = createCanvas();
            if (newCanvasId) {
              // 馃殌 鐩存帴浣跨敤杩斿洖鐨勬柊鐢诲竷ID杩涜杩佺Щ锛屾棤闇€绛夊緟state鏇存柊
              // 淇濆瓨褰撳墠椤圭洰ID鐢ㄤ簬杩佺Щ
              const originalCanvasId = state.activeCanvasId;

              // 鍒囨崲鍥炲師椤圭洰鎵ц杩佺Щ
              switchCanvas(originalCanvasId);

              // 绋嶇瓑涓€涓嬬‘淇濆垏鎹㈠畬鎴愬悗鎵ц杩佺Щ
              setTimeout(() => {
                migrateNodes(selectedNodeIds, newCanvasId);
                switchCanvas(newCanvasId);

                import('./services/system/notificationService').then(({ notify }) => {
                  notify.success('迁移成功', `已创建新项目并迁移 ${selectedNodeIds.length} 个项目`);
                });
              }, 50);
            }
          } else {
            // 杩佺Щ鍒扮幇鏈夐」鐩?
            migrateNodes(selectedNodeIds, targetCanvasId);
          }
          setShowMigrateModal(false);
          clearSelection();
            }}
          />
        </Suspense>
      )}

      {/* 馃殌 鍏ㄥ眬鍏呭€兼ā鎬佹 */}
      {showRechargeModal && (
        <Suspense fallback={null}>
          <RechargeModal />
        </Suspense>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const { user, loading } = useAuth();

  const [showCostEstimation, setShowCostEstimation] = useState(false);

  // Initialize update check on mount (must be before any conditional returns per React Rules of Hooks)
  useEffect(() => {
    // Dynamic Import for Update Check
    import('./services/system/updateCheck').then(({ initUpdateCheck }) => {
      initUpdateCheck();
    });
  }, []);

  // 馃殌 Pre-load admin models for credit-based model display
  useEffect(() => {
    adminModelService.loadAdminModels();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  // OAuth 回调页面（无需登录状态）
  if (window.location.pathname === '/auth/callback') {
    return (
      <ThemeProvider>
        <AuthCallback />
      </ThemeProvider>
    );
  }

  if (!user) {
    return (
      <ThemeProvider>
        <LoginScreen />
      </ThemeProvider>
    );
  }

  if (showCostEstimation) {
    return (
      <ThemeProvider>
        <Suspense fallback={null}>
          <CostEstimation
            onBack={() => setShowCostEstimation(false)}
          />
        </Suspense>
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
          />
        </CanvasProvider>
      </BillingProvider>
    </ThemeProvider>
  );
};

export default App;
// Force Rebuild

