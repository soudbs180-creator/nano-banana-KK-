import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { GeneratedImage } from '../types';
import { Download, Trash2 } from 'lucide-react';

interface ImageNodeProps {
    image: GeneratedImage;
    position: { x: number; y: number };
    onPositionChange: (id: string, position: { x: number; y: number }) => void;
    onDelete: (id: string) => void;
    onConnectEnd?: (imageId: string) => void;
    onClick?: (imageId: string) => void;
    onDimensionsUpdate?: (id: string, dimensions: string) => void;
    isActive?: boolean;
    canvasTransform?: { x: number; y: number; scale: number };
    isMobile?: boolean;
}

const ImageNodeComponent: React.FC<ImageNodeProps> = ({
    image,
    position,
    onPositionChange,
    onDelete,
    onConnectEnd,
    onClick,
    onDimensionsUpdate,
    isActive = false,
    canvasTransform = { x: 0, y: 0, scale: 1 },
    isMobile = false
}) => {
    const [isDragging, setIsDragging] = useState(false);

    // Local display position to avoid global re-renders during drag
    const [localPos, setLocalPos] = useState(position);

    // Sync local position with prop position when NOT dragging
    React.useEffect(() => {
        if (!isDragging) {
            setLocalPos(position);
        }
    }, [position.x, position.y, isDragging]);

    const [showLightbox, setShowLightbox] = useState(false);
    const [lightboxZoom, setLightboxZoom] = useState(1);
    const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const panStartPosRef = useRef({ x: 0, y: 0 });
    const lightboxRef = useRef<HTMLDivElement>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartCanvasPos = useRef({ x: 0, y: 0 });

    // Stored reference for cleanup (persists across effect calls)
    const wheelCleanupRef = useRef<(() => void) | null>(null);

    const [imgError, setImgError] = useState(false);
    const [lightboxOriginalUrl, setLightboxOriginalUrl] = useState<string | null>(null);
    const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);

    // Use original for zoom/download if available, otherwise fallback
    const highResUrl = image.originalUrl || image.url;

    // Load original from IndexedDB when lightbox opens, and save based on storage mode
    useEffect(() => {
        if (showLightbox && !lightboxOriginalUrl && !isLoadingOriginal) {
            setIsLoadingOriginal(true);
            (async () => {
                const { getImage, saveImage } = await import('../services/imageStorage');
                const { getStorageMode, saveOriginalToLocalFolder } = await import('../services/storagePreference');

                // Try to load from IndexedDB first
                const cached = await getImage(image.id);

                if (cached && cached.startsWith('data:')) {
                    // Already have original cached
                    setLightboxOriginalUrl(cached);
                    setIsLoadingOriginal(false);
                    return;
                }

                // Need to fetch original from URL and save based on storage mode
                let originalUrl = image.originalUrl || image.url;
                let originalBase64 = originalUrl;

                // If it's a URL (not base64), fetch it
                if (originalUrl && !originalUrl.startsWith('data:')) {
                    try {
                        const res = await fetch(originalUrl);
                        const blob = await res.blob();
                        originalBase64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                        });
                    } catch (e) {
                        console.error('[Lightbox] Failed to fetch original:', e);
                    }
                }

                // Save to appropriate storage based on mode
                const mode = await getStorageMode();
                if (mode === 'local') {
                    // Save to local folder
                    try {
                        const res = await fetch(originalBase64);
                        const blob = await res.blob();
                        await saveOriginalToLocalFolder(image.id, blob, image.prompt);
                    } catch (e) {
                        console.warn('[Lightbox] Failed to save to local folder:', e);
                    }
                } else {
                    // Save to IndexedDB (browser mode or default)
                    await saveImage(image.id, originalBase64);
                }

                setLightboxOriginalUrl(originalBase64);
                setIsLoadingOriginal(false);
            })();
        }
    }, [showLightbox, lightboxOriginalUrl, isLoadingOriginal, image.id, image.originalUrl, image.url, image.prompt]);

    // Handle pan/drag for lightbox image
    const handleLightboxMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panStartPosRef.current = { x: lightboxPan.x, y: lightboxPan.y };
    }, [lightboxPan]);

    // Global listener for lightbox panning
    useEffect(() => {
        if (!isPanning) return;

        const handleWindowMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            setLightboxPan({
                x: panStartPosRef.current.x + dx,
                y: panStartPosRef.current.y + dy
            });
        };

        const handleWindowMouseUp = () => {
            setIsPanning(false);
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [isPanning]);

    // Handle wheel zoom with non-passive listener
    useEffect(() => {
        if (!showLightbox) return;

        const el = lightboxRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const delta = e.deltaY > 0 ? -0.2 : 0.2; // Increase step slightly
            setLightboxZoom(prev => {
                const newZoom = Math.min(5, Math.max(0.25, prev + delta));
                return parseFloat(newZoom.toFixed(2)); // Clean precision
            });
        };

        el.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            el.removeEventListener('wheel', handleWheel);
        };
    }, [showLightbox]); // Removed timeout, assuming ref is ready on effect run

    // Reset pan and zoom when lightbox opens
    useEffect(() => {
        if (showLightbox) {
            setLightboxZoom(1);
            setLightboxPan({ x: 0, y: 0 });
        }
    }, [showLightbox]);

    // Ref to track latest localPos without triggering effect re-runs
    const localPosRef = useRef(localPos);
    useEffect(() => { localPosRef.current = localPos; }, [localPos]);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // e.preventDefault(); // Optional
        e.stopPropagation(); // Stop canvas panning

        setIsDragging(true);

        // Handle both Mouse and Touch events
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        // Store initial mouse position and card position
        dragStartPos.current = { x: clientX, y: clientY };
        dragStartCanvasPos.current = { x: localPos.x, y: localPos.y };

        console.log('[ImageCard] Drag Start', { clientX, clientY, localPos });
    };

    const requestRef = useRef<number | null>(null);

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;
        e.preventDefault(); // Prevent scrolling while dragging card

        let clientX, clientY;
        if ('touches' in e) {
            clientX = (e as TouchEvent).touches[0].clientX;
            clientY = (e as TouchEvent).touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        // Throttle updates using requestAnimationFrame
        if (requestRef.current !== null) return;

        requestRef.current = requestAnimationFrame(() => {
            // Calculate delta in screen space, then convert to canvas space
            // Use refs or fresh props if possible, but canvasTransform doesn't change much during drag
            const deltaX = (clientX - dragStartPos.current.x) / canvasTransform.scale;
            const deltaY = (clientY - dragStartPos.current.y) / canvasTransform.scale;

            // Update LOCAL state for smooth drag
            const newPos = {
                x: dragStartCanvasPos.current.x + deltaX,
                y: dragStartCanvasPos.current.y + deltaY
            };
            setLocalPos(newPos);
            localPosRef.current = newPos;

            // Update GLOBAL state to sync connection lines
            onPositionChange(image.id, newPos);

            requestRef.current = null;
        });
    };

    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            console.log('[ImageCard] Drag End', localPosRef.current);
            // Commit final position to global state using REF value
            onPositionChange(image.id, localPosRef.current);
        }

        if (requestRef.current !== null) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = null;
        }
    };

    React.useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            // Touch listeners (non-passive to prevent scroll)
            window.addEventListener('touchmove', handleMouseMove, { passive: false });
            window.addEventListener('touchend', handleMouseUp);

            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
                window.removeEventListener('touchmove', handleMouseMove);
                window.removeEventListener('touchend', handleMouseUp);
                if (requestRef.current) {
                    cancelAnimationFrame(requestRef.current);
                }
            };
        }
    }, [isDragging]); // Removed handler dependencies as they use refs or stable/enclosed scope

    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            // PRIORITY: Try IndexedDB first (true original, uncompressed)
            const { getImage } = await import('../services/imageStorage');
            const indexedDbImage = await getImage(image.id);

            let blob: Blob;

            if (indexedDbImage && indexedDbImage.startsWith('data:')) {
                // Found original in IndexedDB - use it (uncompressed)
                console.log('[ImageCard] Using original from IndexedDB');
                const res = await fetch(indexedDbImage);
                blob = await res.blob();
            } else if (highResUrl && highResUrl.startsWith('data:')) {
                // Base64 URL directly (already original)
                console.log('[ImageCard] Using highResUrl base64');
                const res = await fetch(highResUrl);
                blob = await res.blob();
            } else if (image.originalUrl) {
                // Try original URL from cloud
                console.log('[ImageCard] Fetching original from cloud');
                const response = await fetch(image.originalUrl);
                if (!response.ok) throw new Error('Original fetch failed');
                blob = await response.blob();
            } else {
                // Fallback: Use displayed image URL
                console.warn('[ImageCard] Using thumbnail as fallback');
                const response = await fetch(image.url);
                if (!response.ok) throw new Error('Download failed (404)');
                blob = await response.blob();
            }

            // Generate filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sanitizedPrompt = (image.prompt || 'image').slice(0, 30).replace(/[<>:"/\\|?*]/g, '');
            const filename = `${sanitizedPrompt}_${timestamp}.png`;

            // Browser download - saves to user's Downloads folder
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const { notify } = await import('../services/notificationService');
            notify.success('下载成功', `已保存到下载文件夹: ${filename}`);
        } catch (err: any) {
            console.error('Download failed:', err);
            const { notify } = await import('../services/notificationService');
            notify.error(
                '下载失败',
                '原图可能已被清理或无法访问',
                `ImageCard Download Error: ${err.message || err}`
            );
        }
    };

    const handleImageDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setLightboxZoom(1); // Reset zoom on open
        setShowLightbox(true);
    };

    const getDims = () => {
        if (isMobile) return { w: 170, h: 260 }; // 200 + 60 footer
        switch (image.aspectRatio) {
            case '16:9': return { w: 320, h: 240 }; // 180 + 60
            case '9:16': return { w: 200, h: 415 }; // 355 + 60
            case '1:1':
            default: return { w: 280, h: 340 }; // 280 + 60
        }
    };
    const { w: nodeWidth, h: nodeHeight } = getDims();

    return (
        <>
            <div
                className={`absolute flex flex-col items-center group animate-cardPopIn select-none ${isActive ? 'z-15' : 'z-5'}`}
                style={{
                    left: localPos.x,
                    top: localPos.y,
                    width: nodeWidth,
                    // minHeight removed to fix hit-box issues
                    transform: 'translate(-50%, -100%)',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    transition: isDragging ? 'none' : 'box-shadow 0.2s ease'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
                onClick={(e) => { e.stopPropagation(); onClick?.(image.id); }}
            >
                {/* Image Card */}
                <div
                    className={`
                        relative bg-[#18181b] border rounded-2xl overflow-hidden shadow-xl w-full
                        ${isDragging ? '' : 'transition-all duration-200'} hover:shadow-2xl
                        ${isActive ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-white/5 hover:border-white/10'}
                    `}
                >
                    {/* Connection Point - Top Center */}
                    <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-transparent hover:bg-indigo-500/50 rounded-full z-50 cursor-crosshair"
                        onMouseUp={() => onConnectEnd?.(image.id)}
                    />

                    {/* Main Image - Double-click to enlarge */}
                    <div
                        className="relative aspect-auto cursor-pointer min-h-[100px] bg-zinc-900"
                        onDoubleClick={handleImageDoubleClick}
                    >
                        {!imgError ? (
                            <img
                                src={image.url}
                                alt={image.prompt}
                                onError={() => setImgError(true)}
                                onLoad={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    const dims = `${img.naturalWidth}x${img.naturalHeight}`;
                                    // Only update if dimensions are missing or different
                                    if (onDimensionsUpdate && image.dimensions !== dims) {
                                        onDimensionsUpdate(image.id, dims);
                                    }
                                }}
                                className="w-full h-auto block select-none pointer-events-none"
                                draggable={false}
                            />
                        ) : (
                            <div className="w-full h-full min-h-[150px] flex flex-col items-center justify-center text-zinc-500 p-4 text-center">
                                <Trash2 size={24} className="mb-2 opacity-50" />
                                <span className="text-xs">图片已被清理</span>
                                <span className="text-[9px] opacity-60">(Storage Cleaned)</span>
                            </div>
                        )}
                    </div>

                    {/* Footer - Model badge + Continue + Download + Delete */}
                    <div className="px-3 py-2 bg-[#121212]/50 flex items-center justify-between border-t border-white/5">
                        {(() => {
                            const model = image.model || '';
                            let label = 'AI';
                            let style = 'border-zinc-500/30 text-zinc-400 bg-zinc-500/10';

                            if (model.includes('ultra')) {
                                label = 'Imagen 4 Ultra';
                                style = 'border-purple-500/30 text-purple-400 bg-purple-500/10';
                            } else if (model.includes('imagen-4')) {
                                label = 'Imagen 4';
                                style = 'border-blue-500/30 text-blue-400 bg-blue-500/10';
                            } else if (model.includes('pro')) {
                                label = 'Gemini 3 Pro';
                                style = 'border-amber-500/30 text-amber-400 bg-amber-500/10';
                            } else if (model.includes('flash')) {
                                label = 'Gemini 2.5';
                                style = 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10';
                            }

                            return (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium border whitespace-nowrap ${style}`}>
                                    {label}
                                </span>
                            );
                        })()}

                        {/* Dimensions & Time */}
                        <div className="flex items-center gap-2 ml-2">
                            {image.dimensions && (
                                <span className="text-[9px] text-zinc-500 font-mono border border-white/5 px-1.5 rounded bg-white/5">
                                    {(() => {
                                        const [w, h] = image.dimensions.split('x').map(Number);
                                        if (!w || !h) return image.dimensions;

                                        let sizeLabel = '1K';
                                        if (w >= 3000 || h >= 3000) sizeLabel = '4K';
                                        else if (w >= 1500 || h >= 1500) sizeLabel = '2K';

                                        // Use predefined aspect ratio if available, or calculate simplified one
                                        const ratio = image.aspectRatio || `${Math.round(w / 100)}:${Math.round(h / 100)}`;

                                        return `${ratio} · ${sizeLabel}`;
                                    })()}
                                </span>
                            )}
                            {image.generationTime && (
                                <span className="text-[9px] text-zinc-500 font-mono">
                                    {(image.generationTime / 1000).toFixed(1)}s
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-1 ml-auto">
                            {/* Continue Creation Button */}

                            <button
                                onClick={handleDownload}
                                className="text-zinc-500 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
                                title="下载 (Download High-Res)"
                            >
                                <Download size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                                className="text-zinc-500 hover:text-red-400 p-1 rounded-md hover:bg-white/5 transition-colors"
                                title="删除"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lightbox Modal - Rendered to body via Portal for true top-level z-index */}
            {showLightbox && ReactDOM.createPortal(
                <div
                    ref={lightboxRef}
                    className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center animate-fadeIn select-none"
                    onClick={() => !isPanning && setShowLightbox(false)}
                    style={{ backdropFilter: 'blur(8px)', cursor: isPanning ? 'grabbing' : 'default' }}
                >
                    {/* Close Button - Top Right */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowLightbox(false); }}
                        className="absolute top-4 right-4 z-[100000] w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 hover:scale-110"
                        title="关闭"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>

                    {/* Zoom Controls */}
                    <div className="absolute bottom-6 right-6 z-[100000] flex items-center gap-2 bg-black/50 rounded-lg p-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); setLightboxZoom(prev => Math.max(0.25, prev - 0.25)); }}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white"
                            title="缩小"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        </button>
                        <span className="text-white text-sm min-w-[50px] text-center">{Math.round(lightboxZoom * 100)}%</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); setLightboxZoom(prev => Math.min(5, prev + 0.25)); }}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white"
                            title="放大"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }}
                            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white ml-1"
                            title="重置"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /></svg>
                        </button>
                    </div>

                    {/* Main Image - Drag to pan, scroll to zoom */}
                    <img
                        src={lightboxOriginalUrl || highResUrl}
                        onError={(e) => {
                            console.warn('[Lightbox] Failed to load original, falling back to thumbnail');
                        }}
                        onLoad={(e) => {
                            // Reset zoom/pan when image actually loads/changes size, if needed
                            // But keep user position if just swapping src quality
                        }}
                        alt={image.prompt}
                        onMouseDown={handleLightboxMouseDown}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            setShowLightbox(false);
                        }}
                        onContextMenu={(e) => e.stopPropagation()}
                        // Use max-w/max-h to fit default, but allow transform to scale it up visually
                        // We use object-contain to ensure aspect ratio is preserved
                        className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                        draggable={false}
                        style={{
                            maxWidth: '95vw',
                            maxHeight: '95vh',
                            transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`,
                            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                            cursor: isPanning ? 'grabbing' : 'grab',
                            // animation: 'lightboxScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' // Removed to prevent conflict with transform
                        }}
                    />

                    {/* Download Button in Lightbox */}
                    <button
                        onClick={handleDownload}
                        className="absolute bottom-6 left-6 z-[100000] flex items-center gap-2 bg-black/50 hover:bg-white/20 text-white rounded-lg px-4 py-2 transition-colors"
                        title="下载原图"
                    >
                        <Download size={16} />
                        <span className="text-sm">下载原图</span>
                    </button>

                    {/* Hint text */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 text-xs text-center pointer-events-none select-none">
                        滚轮缩放 · 按住左键拖拽 · 双击关闭<br />
                        <span className={`text-[10px] ${lightboxOriginalUrl || image.originalUrl || (image.url && image.url.startsWith('data:')) ? 'text-green-400/70' : 'text-amber-400/70'}`}>
                            {lightboxOriginalUrl || image.originalUrl || (image.url && image.url.startsWith('data:'))
                                ? '正在查看原图 (Viewing Original)'
                                : '正在查看预览 (Viewing Preview - Original Not Found)'}
                        </span>
                        {/* Debug Info */}
                        {/* <div className="text-[9px] opacity-30 mt-1">Zoom: {Math.round(lightboxZoom * 100)}%</div> */}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ImageNodeComponent;
