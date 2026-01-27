import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { AspectRatio, GeneratedImage, GenerationMode } from '../types';
import { Download, Trash2 } from 'lucide-react';
import { getCardDimensions } from '../utils/styleUtils';
import { generateTagColor } from '../utils/colorUtils';

interface ImageNodeProps {
    image: GeneratedImage;
    position: { x: number; y: number };
    onPositionChange: (id: string, position: { x: number; y: number }) => void;
    onDelete: (id: string) => void;
    onConnectEnd?: (imageId: string) => void;
    onClick?: (imageId: string) => void;
    onDimensionsUpdate?: (id: string, dimensions: string) => void;
    isActive?: boolean;
    canvasTransform?: { x: number; y: number; scale: number }; // Deprecated in favor of zoomScale
    zoomScale?: number;
    isMobile?: boolean;
    isSelected?: boolean;
    onSelect?: () => void;
    highlighted?: boolean;
}

const ImageNodeComponent: React.FC<ImageNodeProps> = React.memo(({
    image,
    position,
    onPositionChange,
    onDelete,
    onConnectEnd,
    onClick,
    onDimensionsUpdate,
    isActive = false,
    zoomScale = 1,
    isMobile = false,
    isSelected = false,
    onSelect,
    highlighted
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const [isDragging, setIsDragging] = useState(false);

    // Local display position to avoid global re-renders during drag
    // Ref to track latest localPos without triggering effect re-runs
    const localPosRef = useRef(position);

    const [showLightbox, setShowLightbox] = useState(false);
    const [lightboxZoom, setLightboxZoom] = useState(1);
    const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const panStartPosRef = useRef({ x: 0, y: 0 });
    const lightboxRef = useRef<HTMLDivElement>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const dragStartCanvasPos = useRef({ x: 0, y: 0 });
    // Track when lightbox was opened to prevent instant closing on double-click
    const openTimeRef = useRef(0);

    // Stored reference for cleanup (persists across effect calls)
    const wheelCleanupRef = useRef<(() => void) | null>(null);

    const [imgError, setImgError] = useState(false);
    const [lightboxOriginalUrl, setLightboxOriginalUrl] = useState<string | null>(null);
    const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);

    // Robust Image Loading State
    const [displaySrc, setDisplaySrc] = useState<string | undefined>(image.url);

    // Sync displaySrc when prop changes
    useEffect(() => {
        setDisplaySrc(image.url);
        setImgError(false); // Reset error on new URL
    }, [image.url]);

    // Helper: Attempt to recover image from cache
    const recoverImage = useCallback(async (retryCount = 0) => {
        try {
            // 1. Try IndexedDB first
            const { getImage } = await import('../services/imageStorage');
            const cached = await getImage(image.id);
            if (cached) {
                console.log(`[ImageCard] Recovered image ${image.id} from cache`);
                setDisplaySrc(cached);
                setImgError(false);
                return;
            }

            // 2. Try Local File System (if in local mode)
            const { getStorageMode, getLocalFolderHandle } = await import('../services/storagePreference');
            const mode = await getStorageMode();

            if (mode === 'local') {
                const handle = await getLocalFolderHandle();
                if (handle) {
                    const { fileSystemService } = await import('../services/fileSystemService');
                    const blob = await fileSystemService.loadOriginalFromDisk(handle, image.id);
                    if (blob) {
                        const objectUrl = URL.createObjectURL(blob);
                        console.log(`[ImageCard] Recovered image ${image.id} from local disk`);
                        setDisplaySrc(objectUrl);
                        setImgError(false);
                        return;
                    }
                }
            }

            // 3. Last Resort: If we have an originalUrl that is different from the failed url
            if (image.originalUrl && image.originalUrl !== image.url) {
                const separator = image.originalUrl.includes('?') ? '&' : '?';
                const url = retryCount > 0 ? `${image.originalUrl}${separator}retry=${retryCount}-${Date.now()}` : image.originalUrl;
                setDisplaySrc(url);
                setImgError(false);
                return;
            }
            // Fallback retry for main URL if we are in a retry loop
            if (retryCount > 0) {
                const separator = image.url.includes('?') ? '&' : '?';
                const url = `${image.url}${separator}retry=${retryCount}-${Date.now()}`;
                setDisplaySrc(url);
                setImgError(false);
                return;
            }

        } catch (err) {
            console.warn('Failed to recover image', err);
        }

        // If failed, auto-retry with exponential backoff (up to 3 times)
        if (retryCount < 3) {
            console.log(`[ImageCard] Load failed, retrying (${retryCount + 1}/3) for ${image.id}...`);
            setTimeout(() => {
                recoverImage(retryCount + 1);
            }, 1000 * Math.pow(2, retryCount)); // 1000ms, 2000ms, 4000ms
        } else {
            // If all retries fail, show error state
            setImgError(true);
        }
    }, [image.id, image.url, image.originalUrl]);

    // Construct high-res URL for lightbox
    const highResUrl = image.originalUrl || displaySrc || image.url;

    // Load original from IndexedDB when lightbox opens
    useEffect(() => {
        if (showLightbox && !lightboxOriginalUrl && !isLoadingOriginal) {
            setIsLoadingOriginal(true);
            (async () => {
                const { getImage, saveImage } = await import('../services/imageStorage');
                // const { getStorageMode, saveOriginalToLocalFolder } = await import('../services/storagePreference');

                const cached = await getImage(image.id);
                if (cached && cached.startsWith('data:')) {
                    setLightboxOriginalUrl(cached);
                    setIsLoadingOriginal(false);
                    return;
                }

                // Fallback fetch
                let targetUrl = image.originalUrl || displaySrc || image.url;
                if (targetUrl && !targetUrl.startsWith('data:')) {
                    try {
                        const res = await fetch(targetUrl);
                        const blob = await res.blob();
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const result = reader.result as string;
                            setLightboxOriginalUrl(result);
                            // Also cache it if needed
                            saveImage(image.id, result);
                        };
                        reader.readAsDataURL(blob);
                    } catch (e) { console.error(e); }
                } else {
                    setLightboxOriginalUrl(targetUrl);
                }
                setIsLoadingOriginal(false);
            })();
        }
    }, [showLightbox, lightboxOriginalUrl, isLoadingOriginal, image.id, image.originalUrl, displaySrc, image.url]);

    // Auto-recover if URL is missing initially
    useEffect(() => {
        if (!displaySrc) {
            recoverImage();
        }
    }, []);

    // Ref to track latest localPos without triggering effect re-runs
    // (localPosRef is defined at top level)

    const wasDraggingRef = useRef(false);

    const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
        // Ignore Right Click (2)
        if ('button' in e && e.button === 2) return;

        // Stop canvas panning
        e.stopPropagation();

        setIsDragging(true);
        wasDraggingRef.current = false; // Reset drag flag

        // Only select if not already selected (Preserve Group)
        if (!isSelected && onSelect) {
            onSelect();
        }

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
        dragStartCanvasPos.current = { x: localPosRef.current.x, y: localPosRef.current.y };

        console.log('[ImageCard] Drag Start', { clientX, clientY, localPos: localPosRef.current });
    };

    const lastGlobalUpdateRef = useRef(0);
    const requestRef = useRef<number | null>(null);

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = (e as TouchEvent).touches[0].clientX;
            clientY = (e as TouchEvent).touches[0].clientY;
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        // Mark as dragged if moved more than threshold
        if (Math.abs(clientX - dragStartPos.current.x) > 10 || Math.abs(clientY - dragStartPos.current.y) > 10) {
            wasDraggingRef.current = true;
        }

        // Throttle updates using requestAnimationFrame
        if (requestRef.current !== null) return;

        requestRef.current = requestAnimationFrame(() => {
            const scale = zoomScale;
            const deltaX = (clientX - dragStartPos.current.x) / scale;
            const deltaY = (clientY - dragStartPos.current.y) / scale;

            const newPos = {
                x: dragStartCanvasPos.current.x + deltaX,
                y: dragStartCanvasPos.current.y + deltaY
            };

            // 1. Direct DOM Update (Zero React Overhead)
            if (containerRef.current) {
                containerRef.current.style.transform = `translate3d(${newPos.x}px, ${newPos.y}px, 0) translate(-50%, -100%)`;
            }
            localPosRef.current = newPos;

            // 2. Throttle Global Update (Connection Lines) to prevent lag
            // Update only every ~32ms (30fps)
            const now = Date.now();
            if (now - lastGlobalUpdateRef.current > 32) {
                onPositionChange(image.id, newPos);
                lastGlobalUpdateRef.current = now;
            }

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

    useEffect(() => {
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
    }, [isDragging, zoomScale]);

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
    }, [showLightbox]);

    // Reset pan and zoom when lightbox opens
    useEffect(() => {
        if (showLightbox) {
            setLightboxZoom(1);
            setLightboxPan({ x: 0, y: 0 });
            // openTimeRef is now set synchronously in handleImageClick
        }
    }, [showLightbox]);


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
            const sanitizedPrompt = (image.prompt || 'image').slice(0, 30).replace(/[<>;\"/\\\\|?*]/g, '');
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

    const handleImageClick = (e: React.MouseEvent) => {
        e.stopPropagation();

        // Ignore if clicking internal buttons (like delete/download)
        if ((e.target as HTMLElement).closest('button')) return;

        // Robust Check: Calculate distance from mouse down
        // This ensures we act on the specific click action, not past state
        const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);

        // If moved significantly (>15px) AND not double click -> it's a drag, ignore.
        // Also allow if dragStartPos is 0,0 (meaning mousedown wasn't captured correctly)
        const isUninitialized = dragStartPos.current.x === 0 && dragStartPos.current.y === 0;

        if (!isUninitialized && dist > 15 && e.type !== 'dblclick' && e.detail !== 2) return;

        // SYNC: Set open time immediately before state triggers render/overlay
        openTimeRef.current = Date.now();
        setLightboxZoom(1);
        setShowLightbox(true);
    };

    const getDims = () => {
        // Use shared utility for consistent sizing
        // Pass 'true' to include footer height
        const { width, totalHeight } = getCardDimensions(image.aspectRatio, true);
        return { w: width, h: totalHeight };
    };
    const { w: nodeWidth, h: nodeHeight } = getDims();

    return (
        // ... (Wrapper Divs) ...
        <>
            <div
                ref={containerRef}
                className={`absolute flex flex-col items-center group animate-cardPopIn select-none ${isActive ? 'z-15' : 'z-5'}`}
                // ... (Style) ...
                style={{
                    left: 0,
                    top: 0,
                    width: nodeWidth,
                    transform: `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -100%)`, // Anchor Bottom
                    cursor: isDragging ? 'grabbing' : 'grab',
                    transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
                    willChange: isDragging || isSelected ? 'transform' : 'auto',
                    backfaceVisibility: 'hidden'
                }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!wasDraggingRef.current) onClick?.(image.id);
                }}
                onDoubleClick={handleImageClick}
            >
                <div className={`
                        relative bg-[var(--bg-secondary)] border rounded-2xl overflow-hidden shadow-xl w-full
                        ${isDragging ? '' : 'transition-all duration-200'} hover:shadow-2xl
                        ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500/50' : isActive ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-[var(--border-light)] hover:border-[var(--border-medium)]'}
                        ${highlighted ? 'ring-2 ring-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.5)] z-50 scale-[1.02]' : ''}
                    `}>
                    {/* Connection Point */}
                    <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-transparent hover:bg-indigo-500/50 rounded-full z-50 cursor-crosshair"
                        onMouseUp={() => onConnectEnd?.(image.id)}
                    />

                    {/* Image View with Lazy Loading / Virtualization */}
                    <div
                        className="relative aspect-auto cursor-pointer min-h-[100px] bg-[var(--bg-tertiary)]"
                        onClick={handleImageClick}
                        onDoubleClick={handleImageClick}
                        ref={(el) => {
                            // Simple Intersection Observer implementation
                            if (el && !imgError) {
                                const observer = new IntersectionObserver(
                                    (entries) => {
                                        entries.forEach(entry => {
                                            if (entry.isIntersecting) {
                                                // Load
                                                el.setAttribute('data-visible', 'true');
                                                const img = el.querySelector('img, video') as HTMLElement;
                                                if (img && img.dataset.src) {
                                                    img.setAttribute('src', img.dataset.src);
                                                    img.removeAttribute('data-src');
                                                }
                                            } else {
                                                // Unload (Optional: aggressive memory saving)
                                                // For now, let's just Lazy Load (not unload) to prevent flicker.
                                                // User issue "old ones don't show" might be browser limit.
                                                // But unloading might annoy user if scrolling back up.
                                                // Let's stick to Native Lazy + explicit retry.
                                            }
                                        });
                                    },
                                    { rootMargin: '200px' }
                                );
                                observer.observe(el);
                                return () => observer.disconnect();
                            }
                        }}
                    >
                        {!imgError && displaySrc ? (
                            (image.mode === GenerationMode.VIDEO || displaySrc.startsWith('data:video') || displaySrc.endsWith('.mp4')) ? (
                                <video
                                    src={displaySrc}
                                    className="w-full h-auto block select-none pointer-events-none"
                                    muted loop autoPlay playsInline
                                    onError={() => recoverImage()}
                                />
                            ) : (
                                <img
                                    src={displaySrc} // React handles updates. Native lazy is often enough.
                                    // Make it aggressive: decoding async
                                    decoding="async"
                                    loading="lazy"
                                    alt={image.prompt}
                                    onError={(e) => {
                                        recoverImage();
                                    }}
                                    onLoad={(e) => {
                                        setImgError(false);
                                        const img = e.target as HTMLImageElement;
                                        const dims = `${img.naturalWidth}x${img.naturalHeight}`;
                                        if (onDimensionsUpdate && image.dimensions !== dims) {
                                            onDimensionsUpdate(image.id, dims);
                                        }
                                    }}
                                    className="w-full h-auto block select-none pointer-events-none"
                                    draggable={false}
                                />
                            )
                        ) : (
                            <div className="w-full h-full min-h-[150px] flex flex-col items-center justify-center text-[var(--text-secondary)] p-4 text-center">
                                <Trash2 size={24} className="mb-2 opacity-50" />
                                <span className="text-xs">资源加载失败</span>
                                <span className="text-[9px] opacity-60">(Load Failed)</span>
                                {/* Retry Button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); recoverImage(); }}
                                    className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                                >
                                    尝试重载
                                </button>
                            </div>
                        )}
                    </div>


                    {/* Tags Layer */}
                    {image.tags && image.tags.length > 0 && (
                        <div className="absolute bottom-[36px] left-0 right-0 p-2 flex flex-wrap gap-1 justify-end pointer-events-none">
                            {image.tags.map(tag => {
                                const colors = generateTagColor(tag);
                                return (
                                    <span key={tag}
                                        className={`px-1.5 py-0.5 backdrop-blur-sm rounded text-[9px] shadow-sm border ${colors.bg} ${colors.border} ${colors.text}`}>
                                        #{tag}
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {/* Footer - Model badge + Continue + Download + Delete */}
                    <div className="px-3 py-2 bg-[var(--bg-tertiary)] flex items-center justify-between border-t border-[var(--border-light)] relative z-10">
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
                                <span className="text-[9px] text-[var(--text-tertiary)] font-mono border border-[var(--border-light)] px-1.5 rounded bg-[var(--bg-tertiary)]">
                                    {(() => {
                                        const [w, h] = image.dimensions.split('x').map(Number);
                                        if (!w || !h) return image.dimensions;

                                        let sizeLabel = '1K';
                                        if (w >= 3000 || h >= 3000) sizeLabel = '4K';
                                        else if (w >= 1500 || h >= 1500) sizeLabel = '2K';

                                        // Calculate actual aspect ratio
                                        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
                                        const divisor = gcd(w, h);
                                        let ratioW = w / divisor;
                                        let ratioH = h / divisor;

                                        let displayRatio = `${ratioW}:${ratioH}`;

                                        // Mapping common approximate ratios for cleaner display
                                        const ratioVal = w / h;
                                        if (Math.abs(ratioVal - 1) < 0.05) displayRatio = '1:1';
                                        else if (Math.abs(ratioVal - 4 / 3) < 0.05) displayRatio = '4:3';
                                        else if (Math.abs(ratioVal - 3 / 4) < 0.05) displayRatio = '3:4';
                                        else if (Math.abs(ratioVal - 16 / 9) < 0.05) displayRatio = '16:9';
                                        else if (Math.abs(ratioVal - 9 / 16) < 0.05) displayRatio = '9:16';
                                        else if (Math.abs(ratioVal - 21 / 9) < 0.05) displayRatio = '21:9';
                                        else if (Math.abs(ratioVal - 3 / 2) < 0.05) displayRatio = '3:2';
                                        else if (Math.abs(ratioVal - 2 / 3) < 0.05) displayRatio = '2:3';

                                        return `${displayRatio} · ${sizeLabel}`;
                                    })()}
                                </span>
                            )}
                            {image.generationTime && (
                                <span className="text-[9px] text-[var(--text-tertiary)] font-mono">
                                    {(image.generationTime / 1000).toFixed(1)}s
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-1 ml-auto">
                            {/* Continue Creation Button */}

                            <button
                                onClick={handleDownload}
                                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 rounded-md hover:bg-[var(--toolbar-hover)] transition-colors"
                                title="下载 (Download High-Res)"
                            >
                                <Download size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                                className="text-[var(--text-tertiary)] hover:text-red-400 p-1 rounded-md hover:bg-[var(--toolbar-hover)] transition-colors"
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
                    onClick={() => {
                        // Prevent accidental close from double-click (second click hitting backdrop)
                        if (Date.now() - openTimeRef.current < 600) return;
                        !isPanning && setShowLightbox(false);
                    }}
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

                    {/* Main Image/Video - Drag to pan, scroll to zoom */}
                    {(image.mode === GenerationMode.VIDEO || lightboxOriginalUrl?.startsWith('data:video') || highResUrl?.startsWith('data:video') || highResUrl?.endsWith('.mp4')) ? (
                        <video
                            src={lightboxOriginalUrl || highResUrl}
                            controls
                            autoPlay
                            loop
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                            style={{
                                maxWidth: '95vw',
                                maxHeight: '95vh',
                                transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`,
                                transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                                cursor: isPanning ? 'grabbing' : 'auto'
                            }}
                            onClick={(e) => e.stopPropagation()} // Prevent click from closing lightbox
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setShowLightbox(false); // Double click to close
                            }}
                        />
                    ) : (
                        <img
                            src={lightboxOriginalUrl || highResUrl}
                            onError={(e) => {
                                console.warn('[Lightbox] Failed to load original, falling back to thumbnail');
                            }}
                            alt={image.prompt}
                            onMouseDown={handleLightboxMouseDown}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setShowLightbox(false);
                            }}
                            onContextMenu={(e) => e.stopPropagation()}
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                            draggable={false}
                            style={{
                                maxWidth: '95vw',
                                maxHeight: '95vh',
                                transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom})`,
                                transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                                cursor: isPanning ? 'grabbing' : 'grab',
                            }}
                        />
                    )}

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
                    </div>
                </div>,
                document.body
            )}
        </>
    );
});

export default ImageNodeComponent;
