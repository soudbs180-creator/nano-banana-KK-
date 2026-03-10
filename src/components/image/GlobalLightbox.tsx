import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { GeneratedImage, GenerationMode } from '../../types';
import { Download, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw, Pen } from 'lucide-react';
import { InpaintModal } from './InpaintModal';

interface GlobalLightboxProps {
    images: GeneratedImage[];
    initialIndex: number;
    onClose: () => void;
    onInpaint?: (image: GeneratedImage, maskBase64: string, prompt?: string) => void;
}

/**
 * 鍏ㄥ眬𨱔缁勪欢
 * 鐢ㄤ簬鍏ㄥ睆镆ョ湅鐢熸垚镄勫浘鐗囨垨瑙嗛锛屾敮镌佺缉鏀俱€佸钩绉诲拰𫔄楄〃瀵艰埅
 * @param images 锲剧墖瀵硅薄鏁扮粍
 * @param initialIndex 𫔄𣸣鏄剧ず镄勫浘鐗囩储寮?
 * @param onClose 鍏抽棴浜嬩欢锲炶𤾀
 */
export const GlobalLightbox: React.FC<GlobalLightboxProps> = ({ images, initialIndex, onClose, onInpaint }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [showInpaint, setShowInpaint] = useState(false);

    // 锲剧墖锷犺浇钟舵€?
    const [displaySrc, setDisplaySrc] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const triedSourcesRef = useRef<Set<string>>(new Set());
    const recoveringRef = useRef(false);

    const image = images[currentIndex];
    const panStartRef = useRef({ x: 0, y: 0 });
    const panStartPosRef = useRef({ x: 0, y: 0 });

    // 馃殌 [Fix] Real Dimensions State
    const [realDimensions, setRealDimensions] = useState<string | null>(null);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
            setRealDimensions(`${img.naturalWidth}x${img.naturalHeight}`);
        }
        setHasError(false);
        setIsLoading(false);
        recoveringRef.current = false;
        triedSourcesRef.current.clear();
    };

    const sanitizeUrl = useCallback((url: string | null) => {
        if (url && url.startsWith('data:')) {
            const parts = url.split(',');
            if (parts.length === 2) {
                return `${parts[0]},${parts[1].replace(/[\r\n\s]+/g, '')}`;
            }
        }
        return url;
    }, []);

    const toProxyUrl = useCallback((url: string): string => {
        return `https://corsproxy.io/?${encodeURIComponent(url)}`;
    }, []);

    const trySwitchSource = useCallback((candidate: string | null | undefined): boolean => {
        if (!candidate) return false;
        const normalized = sanitizeUrl(candidate);
        if (!normalized) return false;
        if (normalized === displaySrc) return false;
        if (triedSourcesRef.current.has(normalized)) return false;

        triedSourcesRef.current.add(normalized);
        setDisplaySrc(normalized);
        setHasError(false);
        setIsLoading(false);
        return true;
    }, [displaySrc, sanitizeUrl]);

    const recoverLightboxSource = useCallback(async () => {
        if (recoveringRef.current) return;
        recoveringRef.current = true;

        try {
            const current = sanitizeUrl(displaySrc || image.originalUrl || image.url || null);
            if (current) {
                triedSourcesRef.current.add(current);
            }

            const { getStrictOriginalImage, getImage } = await import('../../services/storage/imageStorage');
            const keyCandidates = Array.from(new Set([image.storageId, image.id].filter(Boolean) as string[]));

            for (const key of keyCandidates) {
                try {
                    const original = await getStrictOriginalImage(key);
                    if (trySwitchSource(original)) return;
                } catch {
                    // ignore
                }

                try {
                    const cached = await getImage(key);
                    if (trySwitchSource(cached)) return;
                } catch {
                    // ignore
                }
            }

            const remoteCandidates = Array.from(new Set(
                [displaySrc, image.originalUrl, image.url]
                    .map((u) => sanitizeUrl(u || null))
                    .filter((u): u is string => !!u && /^https?:\/\//i.test(u))
            ));

            for (const remoteUrl of remoteCandidates) {
                if (!remoteUrl.includes('corsproxy.io/?')) {
                    if (trySwitchSource(toProxyUrl(remoteUrl))) return;
                }
            }

            setHasError(true);
            setIsLoading(false);
        } finally {
            recoveringRef.current = false;
        }
    }, [displaySrc, image.id, image.storageId, image.url, image.originalUrl, sanitizeUrl, toProxyUrl, trySwitchSource]);

    // 1. 加载原图链路（可显示优先，失败回退）
    useEffect(() => {
        let active = true;
        setHasError(false);
        triedSourcesRef.current.clear();
        recoveringRef.current = false;
        setRealDimensions(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });

        const initialOriginalHint = sanitizeUrl(image.originalUrl || null);
        const initialFallbackSrc = sanitizeUrl(image.url || null);
        setDisplaySrc(initialOriginalHint || null);
        setIsLoading(true);

        const loadContent = async () => {
            try {
                const { getStrictOriginalImage } = await import('../../services/storage/imageStorage');
                const keyCandidates = Array.from(new Set([image.storageId, image.id].filter(Boolean) as string[]));
                let original: string | null = null;

                for (const key of keyCandidates) {
                    original = await getStrictOriginalImage(key);
                    if (original) break;
                }

                if (!original) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    for (const key of keyCandidates) {
                        original = await getStrictOriginalImage(key);
                        if (original) break;
                    }
                }

                if (!active) return;

                if (original) {
                    const cleanOriginal = sanitizeUrl(original);
                    if (cleanOriginal !== initialOriginalHint) {
                        setDisplaySrc(cleanOriginal);
                        console.log('[Lightbox] upgraded to original source');
                    }
                    setIsLoading(false);
                    return;
                }

                const bestAvailableSrc = initialOriginalHint || initialFallbackSrc;
                if (!bestAvailableSrc) {
                    await recoverLightboxSource();
                } else {
                    setDisplaySrc(bestAvailableSrc);
                    setIsLoading(false);
                }
            } catch (e) {
                console.error('[Lightbox] loadContent error:', e);
                if (!active) return;
                const bestAvailableSrc = initialOriginalHint || initialFallbackSrc;
                if (!bestAvailableSrc) {
                    await recoverLightboxSource();
                } else {
                    setDisplaySrc(bestAvailableSrc);
                    setIsLoading(false);
                }
            }
        };

        void loadContent();
        return () => { active = false; };
    }, [image]);

    // 2. 浜嬩欢𬭼戝惉 (阌洏鎺у埗)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'ArrowRight') handleNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, images.length]); // 阅嶆柊缁戝畾浠ヨ幏鍙栨渶鏂扮储寮?

    // 3. 瀵艰埅澶勭悊鍑芥暟
    const handlePrev = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
    }, [images.length]);

    const handleNext = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
    }, [images.length]);

    // 4. 缂╂斁/骞崇Щ阃昏緫
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        setZoom(prev => Math.min(5, Math.max(0.25, prev + delta)));
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 2) return;
        e.preventDefault();
        e.stopPropagation();
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panStartPosRef.current = { x: pan.x, y: pan.y };
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isPanning) return;
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({
            x: panStartPosRef.current.x + dx,
            y: panStartPosRef.current.y + dy
        });
    }, [isPanning]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    useEffect(() => {
        if (isPanning) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isPanning, handleMouseMove, handleMouseUp]);

    // 5. 涓嬭浇阃昏緫
    const handleDownload = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const { getStrictOriginalImage } = await import('../../services/storage/imageStorage');
            const { triggerDownload, generateDownloadFilename } = await import('../../utils/downloadUtils');

            // 浼桦厛涓嬭浇链湴铡熷浘阃氶亾锛圛DB/链湴纾佺洏镇㈠锛?
            let target = await getStrictOriginalImage(image.id);
            if (!target && image.storageId && image.storageId !== image.id) {
                target = await getStrictOriginalImage(image.storageId);
            }

            target = target || image.originalUrl || displaySrc || image.url;
            if (!target) return;

            const isVideoMode = image.mode === GenerationMode.VIDEO || (image.url && image.url.includes('.mp4'));
            const isAudioMode = image.mode === GenerationMode.AUDIO || (image.url && (image.url.includes('.mp3') || image.url.includes('.wav')));
            const exportType = isAudioMode ? 'Audio' : (isVideoMode ? 'Video' : 'Image');
            const exportExt = isAudioMode ? '.mp3' : (isVideoMode ? '.mp4' : '.png');
            const filename = generateDownloadFilename(exportType, exportExt);

            // data/blob 𬭼存帴涓嬭浇锛沨ttp(s) 鍏堟媺鍙?blob锛岄伩鍏𡺃法锘?涓存椂 URL 瀵艰𠰷娴忚鍣ㄤ笅杞藉け璐?
            if (target.startsWith('data:') || target.startsWith('blob:')) {
                triggerDownload(target, filename);
                return;
            }

            const response = await fetch(target);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            try {
                triggerDownload(objectUrl, filename);
            } finally {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            }
        } catch (err) {
            // 链€钖庡厹搴曪细鏂版爣绛鹃〉镓揿紑
            const fallback = image.originalUrl || displaySrc || image.url;
            if (fallback) window.open(fallback, '_blank', 'noopener,noreferrer');
        }
    };

    // 6. 阒叉鍙屽向杩囧揩瀵艰𠰷镄勮瑙﹀叧闂?(600ms瀹夊叏链?- 鏀寔鎱㈤€熷弻鍑?
    const [isReady, setIsReady] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 600);
        return () => clearTimeout(timer);
    }, []);

    const handleBackgroundClick = useCallback(() => {
        if (isReady) onClose();
    }, [isReady, onClose]);

    // 7. [Fix] Native Video DoubleClick Capture

    // React's onDoubleClick bubbles, but video fullscreen often happens on native event.
    // We use a capture listener to intercept it BEFORE the browser handles it.
    // 7. [Fix] Native Video DoubleClick Capture (Mousedown Strategy)
    // Browser fullscreen often triggers on the second mousedown, NOT the dblclick event.
    // We use capture: true on mousedown to intercept the 2nd click (`e.detail > 1`)
    // before the video element sees it.
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl) return;

        const handleNativeMousedown = (e: MouseEvent) => {
            // Check if this is the second click (or more) of a double-click
            if (e.detail > 1) {
                // Stop everything immediately
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                onClose();
            }
        };

        // Use capture: true to intercept BEFORE the video element
        videoEl.addEventListener('mousedown', handleNativeMousedown, { capture: true });
        return () => {
            videoEl.removeEventListener('mousedown', handleNativeMousedown, { capture: true });
        };
    }, [onClose]);

    if (!image) return null;

    const isVideo = image.mode === GenerationMode.VIDEO || displaySrc?.startsWith('data:video') || displaySrc?.endsWith('.mp4');
    const isAudio = image.mode === GenerationMode.AUDIO || displaySrc?.endsWith('.mp3') || displaySrc?.endsWith('.wav');

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-[99999] bg-black/95 flex flex-col items-center justify-center animate-fadeIn select-none overflow-hidden"
            onClick={handleBackgroundClick}
        >
            {/* 椤舵爮: 鍏抽棴镌夐挳 */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-50 p-2 bg-white/10 hover:opacity-80 rounded-full text-white transition-opacity"
                title="关闭"
            >
                <X size={24} />
            </button>

            {/* 瀵艰埅鍖哄烟 (闅愬舰鎴栧井寮辨彁绀? */}
            {images.length > 1 && (
                <>
                    <div
                        className="absolute left-0 top-0 bottom-0 w-[15%] z-40 flex items-center justify-start pl-4 cursor-pointer transition-colors group"
                        onClick={handlePrev}
                        title="上一张"
                    >
                        <div className="p-3 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronLeft size={32} />
                        </div>
                    </div>

                    <div
                        className="absolute right-0 top-0 bottom-0 w-[15%] z-40 flex items-center justify-end pr-4 cursor-pointer transition-colors group"
                        onClick={handleNext}
                        title="下一张"
                    >
                        <div className="p-3 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight size={32} />
                        </div>
                    </div>
                </>
            )}

            {/* 涓诲唴瀹瑰尯锘?*/}
            {/* 楂桦害闄愬埗: 100vh - 100px (搴曢儴镙? */}
            <div
                className="relative flex-1 w-full h-[calc(100vh-100px)] flex items-center justify-center overflow-hidden"
                onWheel={handleWheel}
                onClick={(e) => e.stopPropagation()} // 阒叉镣瑰向鐢诲竷鍏抽棴
            >
                {isLoading ? (
                    <div className="text-white">加载中...</div>
                ) : isAudio ? (
                    <div className="flex flex-col items-center justify-center gap-6">
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-pink-400/60">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                        </svg>
                        <audio
                            src={displaySrc!}
                            controls
                            autoPlay
                            className="w-80"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                        />
                    </div>
                ) : isVideo ? (
                    <div
                        className="max-w-full max-h-full flex items-center justify-center"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            cursor: isPanning ? 'grabbing' : 'grab' // Apply cursor to wrapper
                        }}
                        onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onClose();
                        }}
                    >
                        <video
                            ref={videoRef}
                            src={displaySrc!}
                            controls
                            autoPlay
                            loop
                            playsInline
                            className="max-w-full max-h-full object-contain pointer-events-auto"
                            // Native listener handles double click
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%'
                            }}
                        />
                    </div>
                ) : (
                    <img
                        src={displaySrc!}
                        alt={image.prompt}
                        referrerPolicy="strict-origin-when-cross-origin"
                        className={`max-w-full max-h-full object-contain transition-transform duration-100 ${!displaySrc || hasError ? 'opacity-0' : ''}`}
                        draggable={false}
                        onLoad={handleImageLoad} // 馃殌 [Fix] Capture real dimensions
                        onMouseDown={handleMouseDown}
                        onDoubleClick={(e) => { e.preventDefault(); onClose(); }}
                        onContextMenu={(e) => e.stopPropagation()}
                        onError={() => {
                            void recoverLightboxSource();
                        }}
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            cursor: isPanning ? 'grabbing' : 'grab'
                        }}
                    />
                )}
                {/* Error Fallback */}
                {hasError && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-[var(--bg-tertiary)] p-4 rounded-lg text-red-400 flex flex-col items-center gap-2">
                            <ZoomOut size={24} />
                            <span>图片加载失败 (Image Load Failed)</span>
                        </div>
                    </div>
                )}
            </div>

            {/* 搴曢儴淇℃伅闱㈡澘 */}
            {/* 锲哄畾楂桦害锛屼綅浜庡浘鐗囦笅鏂癸纴阒叉阆尅 */}
            <div
                className="min-h-[100px] w-full bg-[var(--bg-secondary)]/90 border-t border-[var(--border-light)] grid grid-cols-1 gap-4 px-4 py-4 sm:min-h-[100px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-8 z-50 text-[var(--text-primary)]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex min-w-0 flex-col text-left justify-center">
                    <div
                        className="text-left text-sm font-medium line-clamp-2 cursor-pointer hover:text-indigo-300 transition-colors"
                        title="点击复制提示词"
                        onClick={async (e) => {
                            e.stopPropagation();
                            try {
                                await navigator.clipboard.writeText(image.prompt);
                                const { notify } = await import('../../services/system/notificationService');
                                notify.success('已复制', '提示词已复制到剪贴板');
                            } catch (err) {
                                console.error('Copy failed', err);
                            }
                        }}
                    >
                        {image.prompt}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-left text-xs text-[var(--text-tertiary)] sm:gap-3">
                        <span className="bg-[var(--bg-tertiary)] px-2 py-0.5 rounded border border-[var(--border-medium)]">
                            {currentIndex + 1} / {images.length}
                        </span>
                        <span>{image.model.split('/').pop()}</span>
                        {/* 馃殌 [Fix] Show REAL dimensions from loaded image, fallback to metadata */}
                        <span>{realDimensions || image.dimensions || '加载中...'}</span>
                        {image.generationTime && <span>{(image.generationTime / 1000).toFixed(1)}s</span>}
                    </div>
                </div>

                <div className="flex w-full items-center justify-end gap-2 self-center sm:w-auto sm:flex-nowrap sm:justify-end sm:justify-self-end sm:gap-3">
                    {/* 鎺у埗镙?*/}
                    <div className="flex items-center bg-[var(--bg-tertiary)] rounded-lg p-1">
                        <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-2 hover:bg-[var(--bg-secondary)] rounded" title="缩小"><ZoomOut size={16} /></button>
                        <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} className="p-2 hover:bg-[var(--bg-secondary)] rounded" title="放大"><ZoomIn size={16} /></button>
                        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="p-2 hover:bg-[var(--bg-secondary)] rounded ml-1 border-l border-[var(--border-light)]" title="重置"><RotateCcw size={16} /></button>
                    </div>

                    {/* 灞€閮ㄩ吨缁樻寜阍?- 浠呭锲剧墖鏄剧ず */}
                    {onInpaint && !isVideo && !isAudio && displaySrc && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowInpaint(true);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-purple-600/80 border border-[var(--border-medium)] hover:border-purple-500 rounded-lg text-sm font-medium transition-all"
                            title="局部重绘"
                        >
                            <Pen size={16} />
                            重绘
                        </button>
                    )}

                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
                        title="下载原图"
                    >
                        <Download size={16} />
                        下载
                    </button>
                </div>
            </div>

            {/* InpaintModal - 灞€閮ㄩ吨缁桦脊绐?*/}
            {showInpaint && displaySrc && (
                <InpaintModal
                    imageUrl={displaySrc}
                    onCancel={() => setShowInpaint(false)}
                    onSave={(maskBase64, prompt) => {
                        setShowInpaint(false);
                        if (onInpaint) {
                            onInpaint(image, maskBase64, prompt);
                        }
                        onClose();
                    }}
                />
            )}
        </div>,
        document.body
    );
};
