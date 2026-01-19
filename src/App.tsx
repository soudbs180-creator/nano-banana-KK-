import React, { useState, useCallback, useRef, useEffect } from 'react';
import InfiniteCanvas from './components/Canvas';
import Sidebar from './components/Sidebar';
import PromptBar from './components/PromptBar';
import ImageNode from './components/ImageCard2';
import PromptNodeComponent from './components/PromptNodeComponent';
import PendingNode from './components/PendingNode';
// KeyManagerModal removed - integrated into UserProfileModal
import ChatSidebar from './components/ChatSidebar';
import { PromptNode, GeneratedImage, AspectRatio, ImageSize, ModelType, GenerationConfig } from './types';
import { generateImage, validateApiKey, cancelGeneration } from './services/geminiService';
import { keyManager } from './services/keyManager';
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

// Canvas Manager Component (Top Left)
const CanvasManager: React.FC = () => {
  const { state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas, clearAllData, canCreateCanvas } = useCanvas();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Auto-close menu after 5 seconds of inactivity
  useEffect(() => {
    if (showDropdown) {
      const timer = setTimeout(() => {
        setShowDropdown(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showDropdown]);

  const handleClearAll = () => {
    if (confirm('确定要清除所有画布数据吗？此操作无法撤销！')) {
      clearAllData();
      setShowDropdown(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!activeCanvas || activeCanvas.imageNodes.length === 0) {
      alert("当前画布没有图片可下载");
      return;
    }

    if (!confirm("确认下载所有图片？\n\n此操作将打包下载当前画布的所有图片（高清原图），但不包含提示词信息。")) {
      return;
    }

    setIsDownloading(true);
    setShowDropdown(false);

    try {
      const zip = new JSZip();
      const folder = zip.folder(activeCanvas.name) || zip;

      let count = 0;
      const total = activeCanvas.imageNodes.length;

      // Process in chunks to avoid freezing UI too much (though fetch is async)
      const promises = activeCanvas.imageNodes.map(async (img, index) => {
        try {
          if (!img.url) return;

          // Handle base64 or URL
          let blob;
          if (img.url.startsWith('data:')) {
            blob = await (await fetch(img.url)).blob();
          } else {
            // External URL (unlikely given current setup, but good practice)
            const response = await fetch(img.url);
            blob = await response.blob();
          }

          const ext = blob.type.split('/')[1] || 'png';
          const filename = `image_${index + 1}_${img.id.slice(0, 4)}.${ext}`;
          folder.file(filename, blob);
          count++;
        } catch (e) {
          console.error("Failed to add image to zip", e);
        }
      });

      await Promise.all(promises);

      if (count === 0) {
        alert("下载失败：无法获取图片数据");
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${activeCanvas.name}_images.zip`);

    } catch (err) {
      console.error("Download failed", err);
      alert("打包下载失败，请重试");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCreateCanvas = () => {
    if (!canCreateCanvas) {
      alert('最多只能创建 10 个画布！');
      return;
    }
    createCanvas();
    setShowDropdown(false);
  };

  const startEditing = (canvas: { id: string; name: string }) => {
    setEditingId(canvas.id);
    setEditName(canvas.name);
  };

  const saveEdit = () => {
    if (editingId && editName.trim()) {
      renameCanvas(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName('');
  };

  return (
    <div className="absolute top-4 left-4 z-50">
      <div className="relative">
        {/* Canvas Selector */}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-2 glass hover:bg-white/10 transition-colors text-sm text-zinc-300 rounded-lg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span>{activeCanvas?.name || '画布'}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''}`}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {/* Dropdown Menu Overlay */}
        {showDropdown && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
        )}

        {/* Dropdown Menu */}
        {showDropdown && (
          <div className="absolute top-full left-0 mt-2 w-72 glass-strong rounded-xl overflow-hidden z-50 animate-scaleIn origin-top-left">
            {/* Canvas List */}
            <div className="max-h-60 overflow-y-auto">
              {state.canvases.map(canvas => (
                <div
                  key={canvas.id}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer ${canvas.id === activeCanvas?.id ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-300'
                    }`}
                  onClick={() => {
                    if (editingId !== canvas.id) {
                      switchCanvas(canvas.id);
                      setShowDropdown(false);
                    }
                  }}
                >
                  <div className={`w-4 h-4 flex items-center justify-center ${canvas.id === activeCanvas?.id ? 'opacity-100' : 'opacity-0'}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>

                  {editingId === canvas.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-black/30 border border-indigo-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <span className="flex-1 text-sm truncate">{canvas.name}</span>
                  )}

                  <div className="flex items-center gap-1">
                    {/* Edit button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditing(canvas);
                      }}
                      className="p-1 hover:bg-white/10 rounded text-zinc-400 hover:text-white"
                      title="重命名"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>

                    {/* Delete button */}
                    {state.canvases.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(canvas.id);
                        }}
                        className="p-1 hover:bg-red-500/20 rounded text-red-400 group"
                        title="删除画布"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 group-hover:opacity-100 transition-opacity">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="border-t border-white/5 p-1">
              <button
                onClick={handleCreateCanvas}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${canCreateCanvas ? 'text-indigo-400 hover:bg-white/10' : 'text-zinc-500 cursor-not-allowed'}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                新建画布 {!canCreateCanvas && '(已达上限)'}
              </button>

              <button
                onClick={handleDownloadAll}
                disabled={isDownloading}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors ${isDownloading ? 'opacity-50 cursor-wait' : ''}`}
              >
                {isDownloading ? (
                  <Loader2 className="animate-spin w-3.5 h-3.5" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                {isDownloading ? '打包中...' : '下载所有原图'}
              </button>

              <button
                onClick={handleClearAll}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                清除所有数据
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md animate-fadeIn">
          <div className="glass-strong p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-scaleIn">
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-white">确认删除画布？</h3>
            </div>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              删除后，该画布中的所有卡片和创作记录将永久丢失，缓存也会被清除。<br />
              <strong className="text-red-400">此操作无法撤销！</strong>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => { deleteCanvas(showDeleteConfirm); setShowDeleteConfirm(null); setShowDropdown(false); }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20 transition-all"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AppContent: React.FC = () => {
  const {
    activeCanvas,
    addPromptNode,
    updatePromptNode,
    addImageNodes,
    updatePromptNodePosition,
    updateImageNodePosition,
    deletePromptNode,
    deleteImageNode,
    linkNodes,
    unlinkNodes,
    undo,
    redo,
    canUndo,
    canRedo,
    arrangeAllNodes
  } = useCanvas();

  const { user, signOut } = useAuth();

  // Ref to access fresh state in async functions (fixing Stale Closure issue)
  const activeCanvasRef = useRef(activeCanvas);
  useEffect(() => {
    activeCanvasRef.current = activeCanvas;
  }, [activeCanvas]);

  // Reactively track KeyManager state
  const [keyStats, setKeyStats] = useState(keyManager.getStats());

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileInitialView, setProfileInitialView] = useState<UserProfileView>('main');
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

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
          // Storage configured, check API key
          setProfileInitialView('api-settings');
          setShowProfileModal(true);
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

  // Keyboard Shortcuts (Undo/Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input is focused
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
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
            originalUrl = original;
            displayUrl = thumbnail;

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
          return null;
        }
      });

      const imageData = await Promise.all(imageDataPromises);

      // Validate results
      const validImageData = imageData.filter((d): d is NonNullable<typeof d> => !!d && !!d.url);
      if (validImageData.length === 0) {
        throw new Error('All generated images were invalid');
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
      const FOOTER_HEIGHT = 60;

      let cardWidth = 280;
      let cardHeight = 280;
      switch (config.aspectRatio) {
        case AspectRatio.LANDSCAPE_16_9:
          cardWidth = 320;
          cardHeight = 180;
          break;
        case AspectRatio.PORTRAIT_9_16:
          cardWidth = 200;
          cardHeight = 355;
          break;
        default:
          cardWidth = 280;
          cardHeight = 280;
      }
      cardHeight += FOOTER_HEIGHT;

      // Note: Both prompt and image use translate(-50%, -100%), so position.y = BOTTOM
      // For image TOP to be 80px below prompt BOTTOM:
      //   imageY - imageHeight = promptY + 80
      //   imageY = promptY + 80 + imageHeight

      const validResults: GeneratedImage[] = validImageData.map(({ index, url, originalUrl, generationTime, base64 }) => {
        let x, y;

        if (isMobile) {
          const cols = Math.min(count, 2);
          const col = index % cols;
          const row = Math.floor(index / cols);

          const mobileCardWidth = 170;
          const mobileCardHeight = 200 + FOOTER_HEIGHT;
          const mobileGap = 10;

          const itemsInRow = Math.min(cols, count - row * cols);
          const currentGridWidth = itemsInRow * mobileCardWidth + (itemsInRow - 1) * mobileGap;
          const startX = -currentGridWidth / 2;
          const offsetX = startX + col * (mobileCardWidth + mobileGap) + mobileCardWidth / 2;
          const offsetY = gapToImages + mobileCardHeight + row * (mobileCardHeight + mobileGap);

          x = livePos.x + offsetX;
          y = livePos.y + offsetY; // Image TOP is now 80px below prompt BOTTOM
        } else {
          const columns = Math.min(count, 2);
          const col = index % columns;
          const row = Math.floor(index / columns);

          const itemsInRow = Math.min(columns, count - row * columns);
          const currentGridWidth = itemsInRow * cardWidth + (itemsInRow - 1) * gap;
          const startX = -currentGridWidth / 2;
          const offsetX = startX + col * (cardWidth + gap) + cardWidth / 2;
          const offsetY = gapToImages + cardHeight + row * (cardHeight + gap);

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
        setProfileInitialView('api-settings');
        setShowProfileModal(true);
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
        const promptHeight = getPromptHeight(pn.prompt);

        updatePromptNodePosition(pn.id, { x: cx, y: currentY });

        // Arrange Images for this Prompt
        const childImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === pn.id);

        let imagesBlockHeight = 0;
        if (childImages.length > 0) {
          // Images Layout: 2 Columns Grid under the prompt
          const imgCols = 2;
          const imgGap = 16;
          const imgWidth = 280; // Standard card width
          const imgHeight = 320; // Avg height including footer

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
      const gapToImages = 80;
      const gap = 16;
      const FOOTER_HEIGHT = 60;

      let cardWidth = 280;
      let cardHeight = 280;
      switch (node.aspectRatio) {
        case AspectRatio.LANDSCAPE_16_9: cardWidth = 320; cardHeight = 180; break;
        case AspectRatio.PORTRAIT_9_16: cardWidth = 200; cardHeight = 355; break;
        default: cardWidth = 280; cardHeight = 280;
      }
      cardHeight += FOOTER_HEIGHT;

      const newImageNodes = results.map((img, i) => {
        let x, y;
        if (isMobile) {
          const cols = Math.min(count, 2);
          const col = i % cols;
          const row = Math.floor(i / cols);
          const mobileCardWidth = 170;
          const mobileCardHeight = 200 + FOOTER_HEIGHT;
          const mobileGap = 10;
          const itemsInRow = Math.min(cols, count - row * cols);
          const currentGridWidth = itemsInRow * mobileCardWidth + (itemsInRow - 1) * mobileGap;
          const startX = -currentGridWidth / 2;
          const offsetX = startX + col * (mobileCardWidth + mobileGap) + mobileCardWidth / 2;
          const offsetY = gapToImages + mobileCardHeight + row * (mobileCardHeight + mobileGap);
          x = node.position.x + offsetX;
          y = node.position.y + offsetY;
        } else {
          const cols = Math.min(count, 2);
          const col = i % cols;
          const row = Math.floor(i / cols);
          const itemsInRow = Math.min(cols, count - row * cols);
          const currentGridWidth = itemsInRow * cardWidth + (itemsInRow - 1) * gap;
          const startX = -currentGridWidth / 2;
          const offsetX = startX + col * (cardWidth + gap) + cardWidth / 2;
          const offsetY = gapToImages + cardHeight + row * (cardHeight + gap);
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
      onMouseMove={(e) => {
        if (dragConnection?.active) {
          // Convert client to canvas
          const canvasX = (e.clientX - canvasTransform.x) / canvasTransform.scale;
          const canvasY = (e.clientY - canvasTransform.y) / canvasTransform.scale;
          setDragConnection(prev => prev ? ({ ...prev, currentPos: { x: canvasX, y: canvasY } }) : null);
        }
      }}
      onMouseUp={() => {
        if (dragConnection?.active) {
          setDragConnection(null);
        }
      }}
    >
      {/* Canvas Manager */}
      <CanvasManager />

      {/* Chat Sidebar (Left) */}
      <ChatSidebar
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(prev => !prev)}
        isMobile={isMobile}
      />

      {/* API Key Button with Status Indicator */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setShowSettingsPanel(true)}
          className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 hover:border-indigo-500 transition-colors shadow-2xl bg-[#1a1a1c]"
          title="API Key Settings"
        >
          <div className="w-full h-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-amber-500 opacity-80" />
        </button>

        {/* API Status Dot - Clearly Above Avatar */}
        <div className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#09090b] z-10 shadow-lg ${derivedApiStatus === 'success' ? 'bg-green-500' :
          derivedApiStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
          }`} />
      </div>

      {/* Main Infinite Canvas */}
      <InfiniteCanvas
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
              // 1. Calculate Image Height to find Top anchor
              // Flowith-style: Prompt Bottom → Image Top
              // 1. Calculate Image Height to find Top anchor (matching ImageCard2 width logic)
              let cardWidth = 280;
              switch (childNode.aspectRatio) {
                case AspectRatio.LANDSCAPE_16_9: cardWidth = 320; break;
                case AspectRatio.PORTRAIT_9_16: cardWidth = 200; break;
                default: cardWidth = 280;
              }

              // Default height calculation
              let imageHeight = (cardWidth / 1) + 60; // fallback 1:1

              // Try to use actual dimensions for precise height
              if (childNode.dimensions) {
                const [w, h] = childNode.dimensions.split('x').map(Number);
                if (w && h) {
                  const ratio = w / h;
                  imageHeight = (cardWidth / ratio) + 60;
                }
              } else {
                // Fallback to AspectRatio enum approximation
                switch (childNode.aspectRatio) {
                  case AspectRatio.LANDSCAPE_16_9: imageHeight = 180 + 60; break;
                  case AspectRatio.PORTRAIT_9_16: imageHeight = 355 + 60; break;
                }
              }

              // Start: Prompt Bottom Center
              // Both use translate(-50%, -100%), so position.y is BOTTOM
              const startX = pn.position.x + 5000;
              const startY = pn.position.y + 5000;

              // End: Image Top Center (Bottom - Height)
              const endX = childNode.position.x + 5000;
              const endY = (childNode.position.y - imageHeight) + 5000;

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
            isSelected={false}
            onSelect={() => { }}
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
            onDelete={deleteImageNode}
            onConnectEnd={handleConnectEnd}
            onClick={(imageId) => {
              // Set this image as source for continuing conversation
              setActiveSourceImage(imageId);
              // Clear prompt and existing references to start fresh continue-conversation
              setConfig(prev => ({ ...prev, prompt: '', referenceImages: [] }));
            }}
            isActive={node.id === activeSourceImage}
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
      />

      {/* Sidebar (Optional) */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenSettings={() => setShowSettingsPanel(true)}
        hasApiKey={keyManager.hasValidKeys()}
        generatedCount={activeCanvas?.imageNodes.length || 0}
        user={user}
        onSignOut={signOut}
        onOpenProfile={() => {
          setProfileInitialView('main');
          setShowProfileModal(true);
        }}
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
      />

      {/* Storage Selection Modal (Post-Login) */}
      <StorageSelectionModal
        isOpen={showStorageModal}
        onComplete={() => {
          setShowStorageModal(false);
          // After storage configured, check if API key is set
          if (!keyManager.hasValidKeys()) {
            setProfileInitialView('api-settings');
            setShowProfileModal(true);
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
        v1.1.6
      </div>

      {/* Sidebar Toggle Button (Visible when sidebar is closed or on mobile) */}
      {(!isSidebarOpen || isMobile) && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 bg-[#1c1c1e]/80 backdrop-blur-md border border-zinc-800 text-zinc-400 hover:text-white rounded-lg shadow-lg transition-all hover:scale-105"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}
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
