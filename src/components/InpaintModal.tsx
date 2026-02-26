import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Eraser, PenTool, Check, ZoomIn, ZoomOut, Square, RotateCcw, Undo2, Redo2, Loader2, RefreshCw } from 'lucide-react';

interface InpaintModalProps {
    imageUrl: string;
    onGenerate?: (imageUrl: string, maskBase64: string, prompt: string) => Promise<string>;
    onSave: (maskBase64: string, prompt?: string) => void;
    onCancel: () => void;
}

type ToolMode = 'brush' | 'rect' | 'erase';

const MASK_COLOR = 'rgba(100, 170, 255, 0.45)';
const MASK_COLOR_RECT = 'rgba(100, 170, 255, 0.35)';

export const InpaintModal: React.FC<InpaintModalProps> = ({ imageUrl, onGenerate, onSave, onCancel }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const outlineCanvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null); // 直接引用 DOM img 元素

    const [tool, setTool] = useState<ToolMode>('brush');
    const [brushSize, setBrushSize] = useState(40);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
    const [imageLoaded, setImageLoaded] = useState(false);
    const [inpaintPrompt, setInpaintPrompt] = useState('');

    const [isDrawing, setIsDrawing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

    const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
    const [rectEnd, setRectEnd] = useState<{ x: number; y: number } | null>(null);
    const [isRectDrawing, setIsRectDrawing] = useState(false);
    const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState<string | null>(null);

    const historyRef = useRef<ImageData[]>([]);
    const historyIndexRef = useRef(-1);
    const marchingAntsRef = useRef<number>(0);
    const dashOffsetRef = useRef(0);

    const saveHistory = useCallback(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx || !canvasRef.current) return;
        const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(data);
        historyIndexRef.current = historyRef.current.length - 1;
        if (historyRef.current.length > 50) { historyRef.current.shift(); historyIndexRef.current--; }
    }, []);

    const undo = useCallback(() => {
        if (historyIndexRef.current <= 0) return;
        historyIndexRef.current--;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
    }, []);

    const redo = useCallback(() => {
        if (historyIndexRef.current >= historyRef.current.length - 1) return;
        historyIndexRef.current++;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
    }, []);

    // 图片加载完成后初始化画布
    const handleImageLoad = useCallback(() => {
        const img = imgRef.current;
        if (!img) return;

        const w = img.naturalWidth;
        const h = img.naturalHeight;
        console.log('[InpaintModal] 图片加载完成:', w, 'x', h, '来源:', imageUrl.substring(0, 60));

        setImgSize({ w, h });
        setImageLoaded(true);

        // 初始化画布
        if (canvasRef.current) {
            canvasRef.current.width = w;
            canvasRef.current.height = h;
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, w, h);
        }

        // 计算居中缩放
        if (containerRef.current) {
            const container = containerRef.current;
            const topBar = 56;
            const bottomBar = 80;
            const padding = 60;
            const usableW = container.clientWidth;
            const usableH = container.clientHeight - topBar - bottomBar;
            const sx = (usableW - padding) / w;
            const sy = (usableH - padding) / h;
            const s = Math.min(sx, sy, 1);

            setScale(s);
            setOffset({
                x: (usableW - w * s) / 2,
                y: topBar + (usableH - h * s) / 2
            });
        }

        setTimeout(() => saveHistory(), 50);
    }, [imageUrl, saveHistory]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isGenerating) return;
            if (e.target instanceof HTMLInputElement) return;
            if (e.key === 'b' || e.key === 'B') setTool('brush');
            if (e.key === 'r' || e.key === 'R') setTool('rect');
            if (e.key === 'e' || e.key === 'E') setTool('erase');
            if (e.key === 'Escape') onCancel();
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', handleKeyDown); cancelAnimationFrame(marchingAntsRef.current); };
    }, [isGenerating, onCancel, undo, redo]);

    // 流动虚线动画
    const drawMarchingAnts = useCallback(() => {
        const canvas = canvasRef.current;
        const outline = outlineCanvasRef.current;
        if (!canvas || !outline || !imageLoaded) return;

        if (outline.width !== canvas.width || outline.height !== canvas.height) {
            outline.width = canvas.width;
            outline.height = canvas.height;
        }

        const srcCtx = canvas.getContext('2d');
        const ctx = outline.getContext('2d');
        if (!srcCtx || !ctx) return;

        const { width, height } = canvas;
        const data = srcCtx.getImageData(0, 0, width, height).data;

        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = Math.max(1.5, 2 / scale);
        ctx.setLineDash([Math.max(4, 6 / scale), Math.max(3, 4 / scale)]);
        ctx.lineDashOffset = -dashOffsetRef.current;

        const isOpaque = (x: number, y: number) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return false;
            return data[(y * width + x) * 4 + 3] > 30;
        };

        const step = Math.max(2, Math.floor(Math.max(width, height) / 500));
        ctx.beginPath();
        for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
                if (!isOpaque(x, y)) continue;
                if (!isOpaque(x - step, y)) { ctx.moveTo(x, y); ctx.lineTo(x, y + step); }
                if (!isOpaque(x + step, y)) { ctx.moveTo(x + step, y); ctx.lineTo(x + step, y + step); }
                if (!isOpaque(x, y - step)) { ctx.moveTo(x, y); ctx.lineTo(x + step, y); }
                if (!isOpaque(x, y + step)) { ctx.moveTo(x, y + step); ctx.lineTo(x + step, y + step); }
            }
        }
        ctx.stroke();
    }, [scale, imageLoaded]);

    useEffect(() => {
        if (!imageLoaded) return;
        let running = true;
        const animate = () => {
            if (!running) return;
            dashOffsetRef.current = (dashOffsetRef.current + 0.5) % 20;
            drawMarchingAnts();
            marchingAntsRef.current = requestAnimationFrame(animate);
        };
        animate();
        return () => { running = false; cancelAnimationFrame(marchingAntsRef.current); };
    }, [drawMarchingAnts, imageLoaded]);

    const screenToImage = useCallback((cx: number, cy: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const r = containerRef.current.getBoundingClientRect();
        return { x: (cx - r.left - offset.x) / scale, y: (cy - r.top - offset.y) / scale };
    }, [offset, scale]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (isGenerating || generatedUrl || !imageLoaded) return;
        e.preventDefault();
        if (e.button === 1) { setIsPanning(true); setLastPos({ x: e.clientX, y: e.clientY }); return; }
        if (e.button !== 0) return;
        const pos = screenToImage(e.clientX, e.clientY);
        if (tool === 'rect') { setIsRectDrawing(true); setRectStart(pos); setRectEnd(pos); }
        else { saveHistory(); setIsDrawing(true); setLastPos(pos); draw(pos, pos); }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        setCursorPos({ x: e.clientX, y: e.clientY });
        if (isPanning) {
            setOffset(p => ({ x: p.x + e.clientX - lastPos.x, y: p.y + e.clientY - lastPos.y }));
            setLastPos({ x: e.clientX, y: e.clientY });
            return;
        }
        if (tool === 'rect' && isRectDrawing) { setRectEnd(screenToImage(e.clientX, e.clientY)); return; }
        if (!isDrawing) return;
        const pos = screenToImage(e.clientX, e.clientY);
        draw(lastPos, pos);
        setLastPos(pos);
    };

    const handlePointerUp = () => {
        if (isRectDrawing && rectStart && rectEnd) {
            saveHistory();
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = MASK_COLOR_RECT;
                const x = Math.min(rectStart.x, rectEnd.x), y = Math.min(rectStart.y, rectEnd.y);
                const w = Math.abs(rectEnd.x - rectStart.x), h = Math.abs(rectEnd.y - rectStart.y);
                if (w > 2 && h > 2) ctx.fillRect(x, y, w, h);
                saveHistory();
            }
            setIsRectDrawing(false); setRectStart(null); setRectEnd(null);
        }
        if (isDrawing) saveHistory();
        setIsDrawing(false); setIsPanning(false);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault(); e.stopPropagation();
        const ns = Math.min(Math.max(scale - e.deltaY * 0.001 * scale, 0.1), 5);
        const r = containerRef.current?.getBoundingClientRect();
        if (r) {
            const mx = e.clientX - r.left, my = e.clientY - r.top, ratio = ns / scale;
            setOffset({ x: mx - (mx - offset.x) * ratio, y: my - (my - offset.y) * ratio });
        }
        setScale(ns);
    };

    const draw = (start: { x: number; y: number }, end: { x: number; y: number }) => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.lineWidth = brushSize / scale;
        if (tool === 'erase') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; }
        else { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = MASK_COLOR; }
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    };

    const handleClear = () => {
        saveHistory();
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        saveHistory();
    };

    const exportMask = (): string => {
        if (!canvasRef.current) return '';
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvasRef.current.width;
        exportCanvas.height = canvasRef.current.height;
        const exportCtx = exportCanvas.getContext('2d')!;
        const srcCtx = canvasRef.current.getContext('2d')!;
        const srcData = srcCtx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        const px = srcData.data;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i + 3] > 10) { px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 255; }
            else { px[i + 3] = 0; }
        }
        exportCtx.putImageData(srcData, 0, 0);
        return exportCanvas.toDataURL('image/png');
    };

    const handleGenerate = async () => {
        if (isGenerating) return;
        const maskBase64 = exportMask();
        if (!maskBase64) return;

        if (onGenerate) {
            setIsGenerating(true);
            setGenerationError(null);
            setGeneratedUrl(null);
            try {
                const resultUrl = await onGenerate(imageUrl, maskBase64, inpaintPrompt);
                setGeneratedUrl(resultUrl);
            } catch (err: any) {
                setGenerationError(err?.message || '重绘失败');
            } finally {
                setIsGenerating(false);
            }
        } else {
            onSave(maskBase64, inpaintPrompt || undefined);
        }
    };

    const handleAccept = () => {
        const maskBase64 = exportMask();
        onSave(maskBase64, inpaintPrompt || undefined);
    };

    const handleRetry = () => { setGeneratedUrl(null); setGenerationError(null); };

    const getRectScreen = () => {
        if (!rectStart || !rectEnd || !containerRef.current) return null;
        const r = containerRef.current.getBoundingClientRect();
        const x1 = rectStart.x * scale + offset.x + r.left, y1 = rectStart.y * scale + offset.y + r.top;
        const x2 = rectEnd.x * scale + offset.x + r.left, y2 = rectEnd.y * scale + offset.y + r.top;
        return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    };
    const rectScreen = isRectDrawing ? getRectScreen() : null;

    const toolBtn = (active: boolean) =>
        `relative p-2.5 rounded-xl transition-all duration-200 ${active
            ? 'bg-white/15 text-white shadow-[0_0_12px_rgba(255,255,255,0.1)]'
            : 'text-white/50 hover:text-white hover:bg-white/8'}`;
    const dot = <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400" />;

    const displayImageUrl = generatedUrl || imageUrl;

    return (
        <div
            className="fixed inset-0 z-[99999] flex flex-col font-sans select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            {/* 模糊背景 - z-0 */}
            <div className="absolute inset-0 z-0" style={{
                background: 'rgba(0,0,0,0.88)',
                backdropFilter: 'blur(60px) saturate(0.3) brightness(0.3)',
                WebkitBackdropFilter: 'blur(60px) saturate(0.3) brightness(0.3)',
            }} />

            {/* ═══════════ 顶部浮动工具栏 ═══════════ */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 px-1.5 py-1 rounded-2xl border border-white/[0.08]"
                style={{ background: 'rgba(24,24,30,0.94)', backdropFilter: 'blur(24px)', boxShadow: '0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)' }}
            >
                <button onClick={onCancel} className="p-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/8 transition-all" title="关闭 (Esc)"><X size={18} /></button>
                <div className="w-px h-6 bg-white/[0.06] mx-0.5" />

                {!generatedUrl && (<>
                    <button onClick={() => setTool('brush')} className={toolBtn(tool === 'brush')} title="画笔 (B)"><PenTool size={17} />{tool === 'brush' && dot}</button>
                    <button onClick={() => setTool('rect')} className={toolBtn(tool === 'rect')} title="框选 (R)"><Square size={17} />{tool === 'rect' && dot}</button>
                    <button onClick={() => setTool('erase')} className={toolBtn(tool === 'erase')} title="橡皮擦 (E)"><Eraser size={17} />{tool === 'erase' && dot}</button>
                    <div className="w-px h-6 bg-white/[0.06] mx-0.5" />

                    {tool !== 'rect' && (
                        <div className="flex items-center gap-2 px-2">
                            <div className="rounded-full bg-white/70 flex-shrink-0 transition-all"
                                style={{ width: Math.max(4, Math.min(brushSize / 4, 16)), height: Math.max(4, Math.min(brushSize / 4, 16)) }} />
                            <input type="range" min="5" max="150" value={brushSize}
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                className="w-20 accent-indigo-400 h-1 cursor-pointer"
                                onPointerDown={(e) => e.stopPropagation()} />
                        </div>
                    )}
                    <div className="w-px h-6 bg-white/[0.06] mx-0.5" />
                    <button onClick={undo} className="p-2 text-white/50 hover:text-white hover:bg-white/8 rounded-lg transition-all" title="撤销 (Ctrl+Z)"><Undo2 size={16} /></button>
                    <button onClick={redo} className="p-2 text-white/50 hover:text-white hover:bg-white/8 rounded-lg transition-all" title="重做 (Ctrl+Y)"><Redo2 size={16} /></button>
                    <div className="w-px h-6 bg-white/[0.06] mx-0.5" />
                </>)}

                <button onClick={() => setScale(s => Math.max(0.1, s - 0.2))} className="p-2 text-white/50 hover:text-white transition-colors"><ZoomOut size={15} /></button>
                <span className="text-[11px] text-white/40 w-9 text-center tabular-nums">{Math.round(scale * 100)}%</span>
                <button onClick={() => setScale(s => Math.min(5, s + 0.2))} className="p-2 text-white/50 hover:text-white transition-colors"><ZoomIn size={15} /></button>

                {!generatedUrl && (<>
                    <div className="w-px h-6 bg-white/[0.06] mx-0.5" />
                    <button onClick={handleClear} className="p-2 text-white/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="清空"><RotateCcw size={15} /></button>
                </>)}
            </div>

            {/* ═══════════ 画布区域 ═══════════ */}
            <div
                ref={containerRef}
                className="flex-1 relative overflow-hidden z-10"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onWheel={handleWheel}
                style={{ cursor: generatedUrl ? 'default' : tool === 'rect' ? 'crosshair' : isPanning ? 'grabbing' : 'none' }}
            >
                {/* 图片 + 蒙版容器 */}
                <div className="absolute origin-top-left"
                    style={{
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        width: imgSize.w || 'auto',
                        height: imgSize.h || 'auto',
                    }}
                >
                    {/* 原图 - 使用 onLoad 获取尺寸 */}
                    <img
                        ref={imgRef}
                        src={displayImageUrl}
                        alt=""
                        className="block pointer-events-none"
                        draggable={false}
                        crossOrigin="anonymous"
                        onLoad={handleImageLoad}
                        style={imgSize.w > 0 ? { width: imgSize.w, height: imgSize.h } : {}}
                    />

                    {/* 蒙版层 - 仅在绘制模式时显示 */}
                    {!generatedUrl && imageLoaded && (<>
                        <div className="absolute inset-0 bg-black/15 pointer-events-none" />
                        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                        <canvas ref={outlineCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.85 }} />
                    </>)}

                    {/* 边框 */}
                    {imageLoaded && <div className="absolute inset-0 ring-1 ring-white/20 rounded-sm pointer-events-none" />}
                </div>

                {/* 加载中提示 */}
                {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3"><Loader2 size={24} className="text-white/40 animate-spin" /><span className="text-sm text-white/30">加载图片...</span></div>
                    </div>
                )}

                {/* 生成中 */}
                {isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-2xl" style={{ background: 'rgba(24,24,30,0.9)', backdropFilter: 'blur(12px)' }}>
                            <Loader2 size={28} className="text-indigo-400 animate-spin" /><span className="text-sm text-white/70">正在重绘...</span>
                        </div>
                    </div>
                )}

                {/* 错误 */}
                {generationError && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-2xl" style={{ background: 'rgba(24,24,30,0.9)', backdropFilter: 'blur(12px)' }}>
                            <span className="text-sm text-red-400">{generationError}</span>
                            <button onClick={handleRetry} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-white/10 hover:bg-white/20 text-white transition-colors"><RefreshCw size={14} /> 重试</button>
                        </div>
                    </div>
                )}

                {/* 框选预览 */}
                {rectScreen && rectScreen.width > 2 && rectScreen.height > 2 && (
                    <div className="fixed pointer-events-none rounded-[2px] inpaint-marching-ants"
                        style={{ left: rectScreen.left, top: rectScreen.top, width: rectScreen.width, height: rectScreen.height, background: 'rgba(100, 170, 255, 0.18)' }} />
                )}

                {/* 画笔光标 */}
                {cursorPos && !generatedUrl && tool !== 'rect' && !isPanning && imageLoaded && (
                    <div className="fixed pointer-events-none rounded-full transition-[width,height] duration-75"
                        style={{
                            left: cursorPos.x - brushSize / 2, top: cursorPos.y - brushSize / 2, width: brushSize, height: brushSize,
                            border: `2px solid ${tool === 'erase' ? 'rgba(248,113,113,0.7)' : 'rgba(255,255,255,0.6)'}`,
                            background: tool === 'erase' ? 'rgba(248,113,113,0.04)' : 'rgba(100,170,255,0.06)',
                        }} />
                )}
            </div>

            {/* ═══════════ 底部 ═══════════ */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4">
                {generatedUrl ? (
                    <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-2xl border border-white/[0.08]"
                        style={{ background: 'rgba(24,24,30,0.94)', backdropFilter: 'blur(24px)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}>
                        <button onClick={handleRetry}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-white/8 hover:bg-white/15 text-white/80 border border-white/10 transition-all">
                            <RefreshCw size={15} /> 重新绘制
                        </button>
                        <button onClick={handleAccept}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02]">
                            <Check size={15} /> 接受结果
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 py-2 px-3 rounded-2xl border border-white/[0.08]"
                        style={{ background: 'rgba(24,24,30,0.94)', backdropFilter: 'blur(24px)', boxShadow: '0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                        <span className="text-white/20 text-lg pl-1">+</span>
                        <input type="text" value={inpaintPrompt}
                            onChange={(e) => setInpaintPrompt(e.target.value)}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                            placeholder="描述重绘内容..."
                            className="flex-1 bg-transparent text-sm text-white/90 placeholder-white/25 outline-none py-1.5"
                            disabled={isGenerating} />
                        <button onClick={handleGenerate} disabled={isGenerating}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 disabled:opacity-50">
                            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        </button>
                    </div>
                )}
            </div>

            {!generatedUrl && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-40 text-[10px] text-white/15 flex items-center gap-3">
                    <span>B 画笔</span><span>R 框选</span><span>E 橡皮擦</span><span>·</span><span>滚轮缩放</span><span>中键拖拽</span>
                </div>
            )}

            <style>{`
                .inpaint-marching-ants {
                    background-image: repeating-linear-gradient(0deg, transparent, transparent 5px, rgba(255,255,255,0.8) 5px, rgba(255,255,255,0.8) 10px), repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(255,255,255,0.8) 5px, rgba(255,255,255,0.8) 10px), repeating-linear-gradient(180deg, transparent, transparent 5px, rgba(255,255,255,0.8) 5px, rgba(255,255,255,0.8) 10px), repeating-linear-gradient(270deg, transparent, transparent 5px, rgba(255,255,255,0.8) 5px, rgba(255,255,255,0.8) 10px);
                    background-size: 2px 100%, 100% 2px, 2px 100%, 100% 2px;
                    background-position: 0 0, 0 0, 100% 0, 0 100%;
                    background-repeat: no-repeat;
                    animation: marchAnts 0.4s linear infinite;
                }
                @keyframes marchAnts { to { background-position: 0 -10px, 10px 0, 100% 10px, -10px 100%; } }
            `}</style>
        </div>
    );
};
