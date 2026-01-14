'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import InfiniteCanvas from './components/Canvas';
import Sidebar from './components/Sidebar';
import PromptBar from './components/PromptBar';
import ImageNode from './components/ImageCard2';
import PromptNodeComponent from './components/PromptNodeComponent';
import PendingNode from './components/PendingNode';
import { PromptNode, GeneratedImage, AspectRatio, ImageSize, ModelType, GenerationConfig } from './types';
import { generateImage } from './services/geminiService';
import { KeyRound, Layers, Plus, Trash2, ChevronDown, Check, X, AlertCircle } from 'lucide-react';
import { CanvasProvider, useCanvas } from './context/CanvasContext';
import ConnectionDot from './components/ConnectionDot';

// Canvas Manager Component (Top Left)
const CanvasManager: React.FC = () => {
  const { state, activeCanvas, createCanvas, switchCanvas, deleteCanvas, clearAllData } = useCanvas();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleClearAll = () => {
    if (confirm('确定要清除所有画布数据吗？此操作无法撤销！')) {
      clearAllData();
      setShowDropdown(false);
    }
  };

  return (
    <div className="absolute top-4 left-4 z-50">
      <div className="relative">
        {/* Canvas Selector */}
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1c] border border-white/10 rounded-lg hover:border-indigo-500 transition-colors text-sm text-zinc-300"
        >
          <Layers size={16} />
          <span>{activeCanvas?.name || 'Canvas'}</span>
          <ChevronDown size={14} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {showDropdown && (
          <div className="absolute top-full left-0 mt-2 w-64 bg-[#1a1a1c] border border-white/10 rounded-lg shadow-2xl overflow-hidden">
            {/* Canvas List */}
            <div className="max-h-60 overflow-y-auto">
              {state.canvases.map(canvas => (
                <div
                  key={canvas.id}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-white/5 cursor-pointer ${canvas.id === activeCanvas?.id ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-300'
                    }`}
                  onClick={() => {
                    switchCanvas(canvas.id);
                    setShowDropdown(false);
                  }}
                >
                  <Check size={14} className={canvas.id === activeCanvas?.id ? 'opacity-100' : 'opacity-0'} />
                  <span className="flex-1 text-sm">{canvas.name}</span>
                  {state.canvases.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteConfirm(canvas.id);
                      }}
                      className="p-1 hover:bg-red-500/20 rounded text-red-400"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="border-t border-white/10">
              <button
                onClick={() => {
                  createCanvas();
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:bg-indigo-500/10"
              >
                <Plus size={14} />
                新建画布
              </button>

              <button
                onClick={handleClearAll}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 border-t border-white/10"
              >
                <Trash2 size={14} />
                清除所有数据
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#1a1a1c] border border-red-500/30 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-scaleIn">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <Trash2 size={24} />
              <h3 className="text-lg font-bold">Delete Canvas?</h3>
            </div>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              Once deleted, all cards and creation history on this canvas will be permanently lost. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteCanvas(showDeleteConfirm); setShowDeleteConfirm(null); setShowDropdown(false); }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                Delete Forever
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
    unlinkNodes
  } = useCanvas();

  // Generation config state
  const [config, setConfig] = useState<GenerationConfig>({
    prompt: '',
    aspectRatio: AspectRatio.SQUARE,
    imageSize: ImageSize.SIZE_4K,
    referenceImages: [],
    parallelCount: 1,
    model: ModelType.GEMINI_PRO
  });

  // Pending generation state
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // API Status (always success since server handles the key)
  const apiStatus = 'success';

  // Update pending position when prompt nodes change - Smart positioning to avoid overlap
  useEffect(() => {
    // If there's an active source image, position below it
    if (activeSourceImage) {
      const sourceImage = activeCanvas?.imageNodes.find(img => img.id === activeSourceImage);
      if (sourceImage) {
        // Position below the source image
        let imageHeight = 280; // Default for SQUARE
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

    // Smart positioning: find an empty spot
    const findEmptyPosition = () => {
      const centerX = window.innerWidth / 2;
      const centerY = 200;
      const cardWidth = 400;
      const cardHeight = 500;

      const allPositions: { x: number; y: number }[] = [
        ...(activeCanvas?.promptNodes.map(n => n.position) || []),
        ...(activeCanvas?.imageNodes.map(n => n.position) || [])
      ];

      const hasOverlap = (testX: number, testY: number) => {
        return allPositions.some(pos => {
          const dx = Math.abs(pos.x - testX);
          const dy = Math.abs(pos.y - testY);
          return dx < cardWidth && dy < cardHeight;
        });
      };

      let testX = centerX;
      const stepX = cardWidth + 50;

      while (hasOverlap(testX, centerY) && testX < centerX + stepX * 10) {
        testX += stepX;
      }

      return { x: testX, y: centerY };
    };

    if (!activeCanvas?.promptNodes.length && !activeCanvas?.imageNodes.length) {
      setPendingPosition({ x: 0, y: 0 });
      return;
    }

    const smartPos = findEmptyPosition();
    setPendingPosition(smartPos);

  }, [activeCanvas?.promptNodes.length, activeSourceImage, activeCanvas?.imageNodes, activeCanvas?.promptNodes, activeCanvas?.imageNodes.length]);


  const handleGenerate = useCallback(async () => {
    if (isGenerating || !config.prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    // 1. Create Persistent Prompt Node immediately
    const promptNodeId = Date.now().toString();
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
      childImageIds: [],
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

        const promptCardWidth = 320;
        let cardWidth = 280;
        let cardHeight = 280;
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

        const gap = 20;
        const x = currentPos.x;
        const y = currentPos.y + 30 + index * (cardHeight + gap);

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

      if (!results || results.length === 0) {
        throw new Error('No images generated');
      }

      const validResults = results.filter(r => r && r.id && r.url);
      if (validResults.length === 0) {
        throw new Error('All generated images were invalid');
      }

      const finalPromptNode: PromptNode = {
        ...newPromptNode,
        childImageIds: validResults.map(img => img.id)
      };

      addPromptNode(finalPromptNode);
      addImageNodes(validResults);

      setConfig(prev => ({ ...prev, prompt: '' }));

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Generation failed.");
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

  const handleCutConnection = useCallback((promptId: string, imageId: string) => {
    unlinkNodes(promptId, imageId);
  }, [unlinkNodes]);

  // Canvas transform for coordinate mapping
  const [canvasTransform, setCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });

  return (
    <div className="relative w-screen h-screen bg-[#09090b] overflow-hidden text-zinc-100 font-inter selection:bg-indigo-500/30"
      onMouseMove={(e) => {
        if (dragConnection?.active) {
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

      {/* API Status Indicator (Top Right) */}
      <div className="absolute top-4 right-4 z-50">
        <div
          className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 shadow-2xl bg-[#1a1a1c]"
          title="API Status: Connected (Server-side key)"
        >
          <div className="w-full h-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-amber-500 opacity-80" />
        </div>

        {/* API Status Dot */}
        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#09090b] z-10 shadow-lg bg-green-500" />
      </div>

      {/* Main Infinite Canvas */}
      <InfiniteCanvas
        onTransformChange={setCanvasTransform}
        onCanvasClick={() => {
          if (!isGenerating) {
            setConfig(prev => ({ ...prev, prompt: '' }));
          }
        }}
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
                return null;
              }

              let cardWidth = 280;
              if (childNode.aspectRatio === '16:9') cardWidth = 320;
              else if (childNode.aspectRatio === '9:16') cardWidth = 200;

              const startX = pn.position.x + 5000;
              const startY = pn.position.y + 15 + 5000;
              const endX = childNode.position.x + 5000;
              const endY = childNode.position.y + 5000;

              const controlX = (startX + endX) / 2;
              const controlY = startY + (endY - startY) * 0.7;

              return (
                <g key={`${pn.id}-${childId}`}>
                  <path
                    d={`M${startX},${startY} Q${controlX},${controlY} ${endX},${endY}`}
                    fill="none"
                    stroke="rgba(129, 140, 248, 0.4)"
                    strokeWidth="2"
                    strokeDasharray="8 6"
                    strokeLinecap="round"
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
            onClick={setActiveSourceImage}
            isActive={node.id === activeSourceImage}
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
        onOpenSettings={() => console.log('Open Settings')}
        hasApiKey={true}
        generatedCount={activeCanvas?.imageNodes.length || 0}
      />

      {/* Error Toast */}
      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-red-500/10 border border-red-500/20 backdrop-blur-md text-red-400 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-slideDown">
          <AlertCircle size={18} />
          <span className="font-medium text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-2 hover:bg-red-500/20 p-1 rounded-lg">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Version Badge - Bottom Right */}
      <div className="fixed bottom-4 right-20 z-40 text-[10px] text-zinc-600 select-none">
        v1.0.0
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
