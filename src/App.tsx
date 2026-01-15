import React, { useState, useCallback, useRef, useEffect } from 'react';
import InfiniteCanvas from './components/Canvas';
import Sidebar from './components/Sidebar';
import PromptBar from './components/PromptBar';
import ImageNode from './components/ImageCard2';
import PromptNodeComponent from './components/PromptNodeComponent';
import PendingNode from './components/PendingNode';
import { PromptNode, GeneratedImage, AspectRatio, ImageSize, ModelType, GenerationConfig } from './types';
import { generateImage, validateApiKey } from './services/geminiService';
// Lucide icons replaced with SVGs
import { CanvasProvider, useCanvas } from './context/CanvasContext';
import ConnectionDot from './components/ConnectionDot';

// Canvas Manager Component (Top Left)
const CanvasManager: React.FC = () => {
  const { state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, renameCanvas, clearAllData, canCreateCanvas } = useCanvas();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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
    canRedo
  } = useCanvas();

  // Generation config state
  const [config, setConfig] = useState<GenerationConfig>({
    prompt: '',
    aspectRatio: AspectRatio.SQUARE,
    imageSize: ImageSize.SIZE_1K,
    referenceImages: [],
    parallelCount: 1,
    model: ModelType.PRO_QUALITY
  });

  // Pending generation state
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  // API Key Management - Server-Side Storage
  interface ApiKeySlot {
    slot: number;
    status: 'valid' | 'invalid' | 'pending' | 'unknown' | 'empty';
    hasKey: boolean;
  }

  // Local input state for the modal (keys typed but not yet saved)
  const [keyInputs, setKeyInputs] = useState<string[]>(['', '', '', '']);
  const [keySlots, setKeySlots] = useState<ApiKeySlot[]>([
    { slot: 1, status: 'empty', hasKey: false },
    { slot: 2, status: 'empty', hasKey: false },
    { slot: 3, status: 'empty', hasKey: false },
    { slot: 4, status: 'empty', hasKey: false },
  ]);
  const [showApiModal, setShowApiModal] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [isSavingKeys, setIsSavingKeys] = useState(false);

  // Detect if running locally (for fallback to localStorage)
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // Fetch key status from backend on mount (with localStorage fallback for local dev)
  useEffect(() => {
    const fetchKeyStatus = async () => {
      try {
        const response = await fetch('/api/keys', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            setKeySlots(data.slots || []);
            if (!data.hasKeys) {
              setShowApiModal(true);
            }
            return;
          }
        }
        throw new Error('Backend not available');
      } catch (e) {
        console.warn('Backend not available, using localStorage fallback for local dev');

        // Fallback to localStorage for local development
        if (isLocalDev) {
          try {
            const stored = localStorage.getItem('kk-api-keys-local');
            if (stored) {
              const keys = JSON.parse(stored) as string[];
              if (keys.some(k => k)) {
                setKeySlots(keys.map((k, i) => ({
                  slot: i + 1,
                  status: k ? 'unknown' : 'empty' as const,
                  hasKey: !!k,
                })));
                setKeyInputs(keys);
                return; // Don't show modal if we have stored keys
              }
            }
          } catch (parseErr) {
            console.error('Failed to parse localStorage keys');
          }
        }

        // Show modal if no keys found
        setShowApiModal(true);
      } finally {
        setIsLoadingKeys(false);
      }
    };

    fetchKeyStatus();
  }, [isLocalDev]);

  // Get derived API status for UI indicator
  const derivedApiStatus = keySlots.some(k => k.status === 'valid') ? 'success'
    : keySlots.some(k => k.hasKey && k.status === 'unknown') ? 'unknown'
      : keySlots.some(k => k.hasKey) ? 'error' : 'unknown';

  // Save API keys to backend (with localStorage fallback for local dev)
  const saveApiKeys = useCallback(async () => {
    setIsSavingKeys(true);
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: keyInputs }),
      });

      const contentType = response.headers.get('content-type');
      if (response.ok && contentType && contentType.includes('application/json')) {
        // Refresh key status
        const statusResponse = await fetch('/api/keys', {
          method: 'GET',
          credentials: 'include',
        });
        if (statusResponse.ok) {
          const statusContentType = statusResponse.headers.get('content-type');
          if (statusContentType && statusContentType.includes('application/json')) {
            // Backend returns validated slots
            const statusData = await response.json();
            if (statusData.slots) {
              setKeySlots(statusData.slots);
            }
          }
        }
        setShowApiModal(false);
        setError(null);
        return;
      }
      throw new Error('Backend not available');
    } catch (e: any) {
      // Fallback to localStorage for local development with local validation
      if (isLocalDev) {
        localStorage.setItem('kk-api-keys-local', JSON.stringify(keyInputs));

        // Validate keys locally using Gemini API
        const validatedSlots = await Promise.all(
          keyInputs.map(async (key, i) => {
            if (!key.trim()) {
              return { slot: i + 1, status: 'empty' as const, hasKey: false };
            }

            try {
              const testResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`,
                { method: 'GET' }
              );

              if (testResponse.ok) {
                return { slot: i + 1, status: 'valid' as const, hasKey: true };
              } else if (testResponse.status === 400 || testResponse.status === 401 || testResponse.status === 403) {
                return { slot: i + 1, status: 'invalid' as const, hasKey: true };
              }
              return { slot: i + 1, status: 'unknown' as const, hasKey: true };
            } catch {
              return { slot: i + 1, status: 'unknown' as const, hasKey: true };
            }
          })
        );

        setKeySlots(validatedSlots);
        setShowApiModal(false);
        setError(null);
        console.log('Keys saved and validated locally');
        return;
      }
      setError(e.message || '保存失败');
    } finally {
      setIsSavingKeys(false);

    }
  }, [keyInputs, isLocalDev]);

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
        let imageHeight = 280;
        switch (sourceImage.aspectRatio) {
          case AspectRatio.LANDSCAPE_16_9: imageHeight = 180; break;
          case AspectRatio.PORTRAIT_9_16: imageHeight = 350; break;
          default: imageHeight = 280;
        }
        setPendingPosition({
          x: sourceImage.position.x,
          y: sourceImage.position.y + imageHeight + 100
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

    const newPromptNode: PromptNode = {
      id: promptNodeId,
      prompt: config.prompt,
      position: currentPos,
      aspectRatio: config.aspectRatio,
      imageSize: config.imageSize,
      model: config.model,
      childImageIds: [], // Will fill after generation
      referenceImages: config.referenceImages,
      timestamp: Date.now()
    };

    try {
      const count = config.parallelCount;
      const promises = Array.from({ length: count }).map(async (_, index) => {
        const url = await generateImage(
          config.prompt,
          config.aspectRatio,
          config.imageSize,
          config.referenceImages,
          config.model
        );

        // Layout: Images to the RIGHT of prompt card, arranged vertically
        const promptCardWidth = 320; // Width of prompt card
        let cardWidth = 280;
        let cardHeight = 280; // Default for SQUARE
        switch (config.aspectRatio) {
          case AspectRatio.LANDSCAPE_16_9:
            cardWidth = 320;
            cardHeight = 180;
            break;
          case AspectRatio.PORTRAIT_9_16:
            cardWidth = 200;
            cardHeight = 350;
            break;
          default:
            cardWidth = 280;
            cardHeight = 280;
        }

        // Calculate positions based on device type
        // Note: We use the already existing 'index' from the outer map
        let x, y;

        if (isMobile) {
          // Mobile Layout: 2-column grid below prompt
          // Prompt is at currentPos.x, currentPos.y
          // Images start below prompt
          const col = index % 2;
          const row = Math.floor(index / 2);

          // Fixed widths for mobile 2-col layout
          // Updated: Reduced to 160px to provide more safety margin on small screens (375px)
          const mobileCardWidth = 160;
          const mobileGap = 12; // Slightly larger gap

          // Center the 2-column grid relative to the prompt
          // Total width = 320 + 12 = 332px. Margin on 375px = (375-332)/2 = ~21.5px
          const gridWidth = mobileCardWidth * 2 + mobileGap;
          const startX = currentPos.x - gridWidth / 2 + mobileCardWidth / 2;

          x = startX + col * (mobileCardWidth + mobileGap);
          y = currentPos.y + 200 + row * (250 + mobileGap); // Vertical offset below prompt
        } else {
          // Desktop Layout: Horizontal row centered below prompt
          const gap = 20;
          const totalWidth = count * cardWidth + (count - 1) * gap;
          const startX = currentPos.x - totalWidth / 2 + cardWidth / 2;

          x = startX + index * (cardWidth + gap);
          y = currentPos.y + 50;
        }

        return {
          id: Date.now().toString() + index + Math.random(),
          url,
          prompt: config.prompt,
          aspectRatio: config.aspectRatio,
          timestamp: Date.now(),
          model: config.model,
          canvasId: activeCanvas?.id || 'default',
          parentPromptId: promptNodeId,
          position: { x, y }
        } as GeneratedImage;
      });

      const results = await Promise.all(promises);

      // Validate results
      if (!results || results.length === 0) {
        throw new Error('No images generated');
      }

      // Filter out any null/undefined results
      const validResults = results.filter(r => r && r.id && r.url);
      if (validResults.length === 0) {
        throw new Error('All generated images were invalid');
      }

      // Create the final prompt node with child IDs
      const finalPromptNode: PromptNode = {
        ...newPromptNode,
        childImageIds: validResults.map(img => img.id)
      };

      // Add both prompt and images in sequence (React 18 will batch these)
      addPromptNode(finalPromptNode);
      addImageNodes(validResults);

      // Keep prompt for continuous generation (don't clear)

      // Auto-scroll to center the new content (Mobile Only)
      if (isMobile) {
        // We want to center on the NEW PROMPT node, or slightly below it to see images
        // Target Y is prompt position Y + some offset
        const targetX = currentPos.x;
        const targetY = currentPos.y + 150; // Center between prompt and images

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
      setError(err.message || "Generation failed.");
      if (err.message && (err.message.includes("API Key") || err.message.includes("403"))) {
        setShowApiModal(true);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [config, pendingPosition, addPromptNode, addImageNodes, activeCanvas?.id, isGenerating]);

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

  // Auto-arrange all cards in a grid layout
  const handleAutoArrange = useCallback(() => {
    if (!activeCanvas) return;

    // Use current settings (simple grid for now, can be enhanced for mobile later)
    // The user requested "always down" for mobile generation, which is handled in handleGenerate.
    // This function resets everything to a standard grid.

    const startX = 500;
    const startY = 200;
    const colSpacing = isMobile ? 0 : 450;
    const rowSpacing = 500;
    const imageGap = 30;
    const imageOffsetY = 150;

    // Get all prompt nodes sorted by creation time (id)
    const sortedPrompts = [...activeCanvas.promptNodes].sort((a, b) =>
      parseInt(a.id) - parseInt(b.id)
    );

    // Arrange logic
    if (isMobile) {
      // Mobile: Single vertical column of prompts
      sortedPrompts.forEach((pn, index) => {
        const newX = 0; // Centered at 0
        // Previous prompts + their images height determines Y, but for simplicity just stack with large gaps
        // Better: calculate Y based on previous cluster height.
        // Simplified for reliability: Fixed large spacing
        const newY = startY + index * 800; // Large vertical gap

        updatePromptNodePosition(pn.id, { x: newX, y: newY });

        const childImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === pn.id);
        // 2-col grid for images
        childImages.forEach((img, imgIndex) => {
          const col = imgIndex % 2;
          const row = Math.floor(imgIndex / 2);
          const mobileCardWidth = 300; // Rendered width
          const gap = 20;

          // Center 2 cols: Total ~620
          const gridStartX = newX - (mobileCardWidth + gap / 2) + mobileCardWidth / 2;

          updateImageNodePosition(img.id, {
            x: gridStartX + col * (mobileCardWidth + gap),
            y: newY + imageOffsetY + row * (350)
          });
        });
      });
    } else {
      // Desktop: 3 columns
      const columns = 3;
      sortedPrompts.forEach((pn, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);

        const newX = startX + col * colSpacing;
        const newY = startY + row * rowSpacing;

        updatePromptNodePosition(pn.id, { x: newX, y: newY });

        const childImages = activeCanvas.imageNodes.filter(img => img.parentPromptId === pn.id);
        const totalWidth = childImages.length * 280 + (childImages.length - 1) * imageGap;
        const imagesStartX = newX - totalWidth / 2 + 140;

        childImages.forEach((img, imgIndex) => {
          updateImageNodePosition(img.id, {
            x: imagesStartX + imgIndex * (280 + imageGap),
            y: newY + imageOffsetY
          });
        });
      });
    }
  }, [activeCanvas, updatePromptNodePosition, updateImageNodePosition, isMobile]);

  const handleCutConnection = useCallback((promptId: string, imageId: string) => {
    unlinkNodes(promptId, imageId);
  }, [unlinkNodes]);

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

      {/* API Key Button with Status Indicator */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setShowApiModal(true)}
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
          if (!isGenerating) {
            setConfig(prev => ({ ...prev, prompt: '' }));
          }
        }}
        onAutoArrange={handleAutoArrange}
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

              // PromptNodeComponent wrapper:
              // - Contains: Card (140px) + margin-top (12px) + Dot (12px) = 164px total height
              // - Uses transform: translate(-50%, -100%)
              // - This means: position.y is the BOTTOM of the entire wrapper (including dot)
              // - So position.y is at the bottom edge of the dot
              // - Dot center = position.y - 6 (half of 12px dot height)

              // ImageCard2:
              // - Uses transform: translate(-50%, 0)
              // - position.x is horizontal CENTER, position.y is TOP edge

              // Start point: Center of the connection dot
              // position.y is bottom of dot, subtract 6px to get center
              const startX = pn.position.x + 5000;
              const startY = pn.position.y - 6 + 5000; // Dot center (position.y is dot bottom)

              // End point: Top center of image card
              const endX = childNode.position.x + 5000;
              const endY = childNode.position.y + 5000;

              // Control point for smooth curve
              const controlX = (startX + endX) / 2;
              const controlY = startY + (endY - startY) * 0.4;

              return (
                <g key={`${pn.id}-${childId}-${Math.round(startX)}-${Math.round(endX)}`}>
                  {/* Curved dashed connection line */}
                  <path
                    d={`M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`}
                    fill="none"
                    stroke="rgba(99, 102, 241, 0.5)"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                  />
                  {/* Small dot at image connection point */}
                  <circle cx={endX} cy={endY} r="2" fill="#6366f1" opacity="0.6" />
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
              // Clear prompt to start fresh continue-conversation
              setConfig(prev => ({ ...prev, prompt: '' }));
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
        onOpenSettings={() => setShowApiModal(true)}
        hasApiKey={keySlots.some(k => k.status === 'valid')}
        generatedCount={activeCanvas?.imageNodes.length || 0}
      />

      {/* API Key Modal */}
      {showApiModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="glass-strong p-8 rounded-3xl shadow-2xl max-w-lg w-full relative">
            <button
              onClick={() => setShowApiModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors p-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-6 text-center">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-400">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 11 V 7 a5 5 0 0 1 10 0 v 4" />
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <circle cx="12" cy="16" r="1" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Google API Key</h2>
              <p className="text-zinc-400 text-sm">
                支持多个 API 密钥，自动选择有效的密钥使用。
              </p>
            </div>

            <div className="space-y-3">
              {keySlots.map((slot, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-zinc-500 text-xs w-6">{index + 1}.</span>
                  <input
                    type="password"
                    value={keyInputs[index]}
                    onChange={(e) => {
                      const newInputs = [...keyInputs];
                      newInputs[index] = e.target.value;
                      setKeyInputs(newInputs);
                    }}
                    placeholder={slot.hasKey ? '••••••••••••' : 'AIza...'}
                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  {/* Status indicator */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${slot.status === 'valid' ? 'bg-green-500/20 text-green-400' :
                    slot.status === 'invalid' ? 'bg-red-500/20 text-red-400' :
                      slot.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 animate-pulse' :
                        slot.hasKey ? 'bg-zinc-500/20 text-zinc-400' : 'bg-transparent'
                    }`}>
                    {slot.status === 'valid' && '✓'}
                    {slot.status === 'invalid' && '✗'}
                    {slot.status === 'pending' && '…'}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              <button
                onClick={saveApiKeys}
                disabled={isSavingKeys}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
              >
                {isSavingKeys ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    保存中...
                  </>
                ) : '保存密钥'}
              </button>

              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-zinc-500 hover:text-indigo-400 transition-colors"
              >
                获取免费 API 密钥
              </a>
            </div>
          </div>
        </div>
      )}

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
        v1.1.0
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <CanvasProvider>
    <AppContent />
  </CanvasProvider>
);

export default App;
