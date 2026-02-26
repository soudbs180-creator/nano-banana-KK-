import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Undo2, Redo2, Loader2, Mic, ArrowUp, PenTool, Square, Eraser, ZoomOut, ZoomIn } from 'lucide-react';

interface InpaintModalProps {
    imageUrl: string;
    onSave: (maskBase64: string, prompt?: string) => void;
    onCancel: () => void;
}

type ToolMode = 'brush' | 'rect' | 'erase';

// 统一的带透明度的蓝色
const MASK_COLOR = 'rgb(86, 165, 255)';
const MASK_COLOR_RECT = 'rgb(86, 165, 255)';

export const InpaintModal: React.FC<InpaintModalProps> = ({ imageUrl, onSave, onCancel }) => {
    console.log('[InpaintModal] Received imageUrl:', imageUrl ? (imageUrl.substring(0, 50) + '...') : 'null');
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const edgeCanvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const antPatternRef = useRef<HTMLCanvasElement | null>(null);
    const antPhaseRef = useRef(0);

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



    const historyRef = useRef<ImageData[]>([]);
    const historyIndexRef = useRef(-1);

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

    const createAntPattern = useCallback(() => {
        if (antPatternRef.current) return antPatternRef.current;
        const p = document.createElement('canvas');
        p.width = 8;
        p.height = 8;
        const pctx = p.getContext('2d');
        if (pctx) {
            pctx.clearRect(0, 0, 8, 8);
            pctx.imageSmoothingEnabled = false;
            pctx.fillStyle = 'rgba(255,255,255,1)';
            pctx.fillRect(0, 0, 4, 8);
            pctx.fillStyle = 'rgba(0,0,0,0.85)';
            pctx.fillRect(4, 0, 4, 8);
        }
        antPatternRef.current = p;
        return p;
    }, []);

    const renderMaskEdge = useCallback(() => {
        const maskCanvas = canvasRef.current;
        const edgeCanvas = edgeCanvasRef.current;
        if (!maskCanvas || !edgeCanvas) return;
        if (edgeCanvas.width !== maskCanvas.width || edgeCanvas.height !== maskCanvas.height) {
            edgeCanvas.width = maskCanvas.width;
            edgeCanvas.height = maskCanvas.height;
        }

        const edgeCtx = edgeCanvas.getContext('2d');
        if (!edgeCtx) return;
        edgeCtx.imageSmoothingEnabled = false;
        edgeCtx.filter = 'none';

        const w = edgeCanvas.width;
        const h = edgeCanvas.height;

        edgeCtx.clearRect(0, 0, w, h);

        // 先得到选区外圈 ring（膨胀后减去原选区）
        edgeCtx.globalCompositeOperation = 'source-over';
        edgeCtx.drawImage(maskCanvas, 1, 0);
        edgeCtx.drawImage(maskCanvas, -1, 0);
        edgeCtx.drawImage(maskCanvas, 0, 1);
        edgeCtx.drawImage(maskCanvas, 0, -1);
        edgeCtx.drawImage(maskCanvas, 1, 1);
        edgeCtx.drawImage(maskCanvas, -1, -1);
        edgeCtx.drawImage(maskCanvas, 1, -1);
        edgeCtx.drawImage(maskCanvas, -1, 1);

        edgeCtx.globalCompositeOperation = 'destination-out';
        edgeCtx.drawImage(maskCanvas, 0, 0);

        // 把 ring 的 alpha 二值化，保证蚂蚁线清晰锐利（避免软边/发虚）
        const ringData = edgeCtx.getImageData(0, 0, w, h);
        const d = ringData.data;
        for (let i = 3; i < d.length; i += 4) {
            d[i] = d[i] > 20 ? 255 : 0;
        }
        edgeCtx.putImageData(ringData, 0, 0);

        // 给 ring 套“顺时针环绕”虚线纹理
        edgeCtx.globalCompositeOperation = 'source-in';
        const pattern = edgeCtx.createPattern(createAntPattern(), 'repeat');
        if (pattern) {
            edgeCtx.save();
            const cx = w * 0.5;
            const cy = h * 0.5;
            edgeCtx.translate(cx, cy);
            edgeCtx.rotate(antPhaseRef.current);
            edgeCtx.translate(-cx, -cy);
            edgeCtx.fillStyle = pattern;
            edgeCtx.fillRect(0, 0, w, h);
            edgeCtx.restore();
        }

        edgeCtx.globalCompositeOperation = 'source-over';
    }, [createAntPattern]);

    const maskHasContent = useCallback((): boolean => {
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 10) return true;
        }
        return false;
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            antPhaseRef.current = (antPhaseRef.current + 0.06) % (Math.PI * 2);
            renderMaskEdge();
        }, 100);
        return () => window.clearInterval(timer);
    }, [renderMaskEdge]);

    const handleImageLoad = useCallback(() => {
        const img = imgRef.current;
        if (!img) return;

        const w = img.naturalWidth;
        const h = img.naturalHeight;
        console.log('[InpaintModal] 图片加载完成:', w, 'x', h);

        setImgSize({ w, h });
        setImageLoaded(true);

        if (canvasRef.current) {
            canvasRef.current.width = w;
            canvasRef.current.height = h;
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, w, h);
        }
        if (edgeCanvasRef.current) {
            edgeCanvasRef.current.width = w;
            edgeCanvasRef.current.height = h;
            const ectx = edgeCanvasRef.current.getContext('2d');
            if (ectx) ectx.clearRect(0, 0, w, h);
        }

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

    // 由于 canvas 是在 imageLoaded 为 true 时才挂载，因此这里需要在挂载后同步迟到的宽高，否则是 300x150
    useEffect(() => {
        if (imageLoaded && canvasRef.current && imgSize.w > 0) {
            if (canvasRef.current.width !== imgSize.w || canvasRef.current.height !== imgSize.h) {
                canvasRef.current.width = imgSize.w;
                canvasRef.current.height = imgSize.h;
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, imgSize.w, imgSize.h);
                if (edgeCanvasRef.current) {
                    edgeCanvasRef.current.width = imgSize.w;
                    edgeCanvasRef.current.height = imgSize.h;
                    const ectx = edgeCanvasRef.current.getContext('2d');
                    if (ectx) ectx.clearRect(0, 0, imgSize.w, imgSize.h);
                }
                if (historyRef.current.length === 0) {
                    setTimeout(() => saveHistory(), 50);
                }
            }
        }
    }, [imageLoaded, imgSize, saveHistory]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;
            if (e.key === 'b' || e.key === 'B') setTool('brush');
            if (e.key === 'r' || e.key === 'R') setTool('rect');
            if (e.key === 'e' || e.key === 'E') setTool('erase');
            if (e.key === '[') setBrushSize(v => Math.max(5, v - 4));
            if (e.key === ']') setBrushSize(v => Math.min(150, v + 4));
            if (e.key === 'Escape') onCancel();
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undo();
                setTimeout(() => renderMaskEdge(), 0);
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
                e.preventDefault();
                redo();
                setTimeout(() => renderMaskEdge(), 0);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onCancel, redo, renderMaskEdge, undo]);

    const screenToImage = useCallback((cx: number, cy: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const r = containerRef.current.getBoundingClientRect();
        return { x: (cx - r.left - offset.x) / scale, y: (cy - r.top - offset.y) / scale };
    }, [offset, scale]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!imageLoaded) return;
        e.preventDefault();

        // Capture pointer to ensure smooth drawing even if cursor leaves window slightly
        e.currentTarget.setPointerCapture(e.pointerId);

        if (e.button === 1 || e.button === 2) {
            setIsPanning(true);
            setLastPos({ x: e.clientX, y: e.clientY });
            return;
        }

        const pos = screenToImage(e.clientX, e.clientY);
        if (tool === 'rect') {
            setIsRectDrawing(true);
            setRectStart(pos);
            setRectEnd(pos);
        } else {
            saveHistory();
            setIsDrawing(true);
            setLastPos(pos);
            draw(pos, pos);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isPanning) {
            setOffset(p => ({ x: p.x + e.clientX - lastPos.x, y: p.y + e.clientY - lastPos.y }));
            setLastPos({ x: e.clientX, y: e.clientY });
            return;
        }
        if (tool === 'rect' && isRectDrawing) {
            setRectEnd(screenToImage(e.clientX, e.clientY));
            return;
        }
        if (!isDrawing) return;
        const pos = screenToImage(e.clientX, e.clientY);
        draw(lastPos, pos);
        setLastPos(pos);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (isRectDrawing && rectStart && rectEnd) {
            saveHistory();
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.fillStyle = MASK_COLOR_RECT;
                const x = Math.min(rectStart.x, rectEnd.x), y = Math.min(rectStart.y, rectEnd.y);
                const w = Math.abs(rectEnd.x - rectStart.x), h = Math.abs(rectEnd.y - rectStart.y);
                if (w > 2 && h > 2) {
                    // 矩形边缘做轻微软化，和画笔观感统一
                    ctx.save();
                    ctx.filter = 'blur(0.8px)';
                    ctx.fillRect(x, y, w, h);
                    ctx.restore();
                }
                saveHistory();
            }
            setIsRectDrawing(false);
            setRectStart(null);
            setRectEnd(null);
        } else if (isDrawing) {
            saveHistory();
        }
        renderMaskEdge();
        setIsDrawing(false);
        setIsPanning(false);
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
        if (tool === 'erase') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.shadowBlur = 0;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = MASK_COLOR;
            ctx.shadowBlur = 0;
        }
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
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

    const handleGenerate = () => {
        let maskBase64 = '';
        if (maskHasContent()) {
            maskBase64 = exportMask();
        }

        onSave(maskBase64, inpaintPrompt || undefined);
    };

    const getRectScreen = () => {
        if (!rectStart || !rectEnd || !containerRef.current) return null;
        const r = containerRef.current.getBoundingClientRect();
        const x1 = rectStart.x * scale + offset.x + r.left, y1 = rectStart.y * scale + offset.y + r.top;
        const x2 = rectEnd.x * scale + offset.x + r.left, y2 = rectEnd.y * scale + offset.y + r.top;
        return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    };
    const rectScreen = isRectDrawing ? getRectScreen() : null;

    const imageTitle = (() => {
        try {
            const clean = imageUrl.split('?')[0].split('#')[0];
            const name = decodeURIComponent(clean.split('/').pop() || '编辑图像');
            if (!name || name.startsWith('data:image')) return '编辑图像';
            return name;
        } catch {
            return '编辑图像';
        }
    })();

    const toolBtnClass = (active: boolean) =>
        `h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${active
            ? 'bg-white/16 text-white'
            : 'text-white/70 hover:text-white hover:bg-white/10'}`;

    return (
        <div
            className="fixed inset-0 z-[99999] flex flex-col font-sans select-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            {/* 模糊背景 */}
            <div className="absolute inset-0 z-0" style={{
                background: 'radial-gradient(1200px 700px at 50% 45%, rgba(56,64,82,0.22) 0%, rgba(17,20,28,0.82) 55%, rgba(8,9,12,0.95) 100%)',
                backdropFilter: 'blur(38px) saturate(0.6) brightness(0.5)',
                WebkitBackdropFilter: 'blur(38px) saturate(0.6) brightness(0.5)',
            }} />

            {/* 顶栏 */}
            <div className="absolute top-0 left-0 right-0 h-14 px-4 flex items-center justify-between z-50 relative"
                style={{ background: 'linear-gradient(180deg, rgba(14,16,21,0.84) 0%, rgba(14,16,21,0.36) 55%, rgba(14,16,21,0) 100%)' }}>
                <div className="flex items-center gap-2 min-w-0">
                    <button onClick={onCancel} className="p-1.5 rounded-md text-white/75 hover:text-white hover:bg-white/10 transition-colors" title="关闭 (Esc)">
                        <X size={16} />
                    </button>
                    <span className="text-sm text-white/90 truncate max-w-[38vw]">{imageTitle}</span>
                </div>

                <div className="flex items-center gap-1">
                    <>
                        <button
                            onClick={() => {
                                undo();
                                setTimeout(() => renderMaskEdge(), 0);
                            }}
                            className="p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            title="撤销 (Ctrl+Z)"
                        >
                            <Undo2 size={15} />
                        </button>
                        <button
                            onClick={() => {
                                redo();
                                setTimeout(() => renderMaskEdge(), 0);
                            }}
                            className="p-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            title="重做 (Ctrl+Y)"
                        >
                            <Redo2 size={15} />
                        </button>
                    </>
                    <button onClick={onCancel} className="px-2.5 py-1.5 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                        取消
                    </button>
                </div>
            </div>

            {/* 顶部中轴（标题+工具栏） */}
            <div className="absolute top-3 left-0 right-0 z-50 pointer-events-none flex flex-col items-center gap-3">
                <div className="text-sm text-white/80 font-medium whitespace-nowrap" style={{ transform: 'translateX(2px)' }}>编辑所选内容</div>
                <div
                    className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-xl border border-white/10"
                    style={{ background: 'rgba(27,30,38,0.82)', backdropFilter: 'blur(12px)' }}
                >
                    <button onClick={() => setTool('brush')} className={toolBtnClass(tool === 'brush')} title="画笔 (B)"><PenTool size={15} /></button>
                    <button onClick={() => setTool('rect')} className={toolBtnClass(tool === 'rect')} title="矩形 (R)"><Square size={15} /></button>
                    <button onClick={() => setTool('erase')} className={toolBtnClass(tool === 'erase')} title="橡皮擦 (E)"><Eraser size={15} /></button>
                    <div className="w-px h-5 bg-white/10 mx-1" />
                    <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className={toolBtnClass(false)} title="缩小"><ZoomOut size={15} /></button>
                    <span className="w-10 text-center text-[11px] text-white/70 tabular-nums">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(5, s + 0.1))} className={toolBtnClass(false)} title="放大"><ZoomIn size={15} /></button>
                    {tool !== 'rect' && (
                        <>
                            <div className="w-px h-5 bg-white/10 mx-1" />
                            <input
                                type="range"
                                min="5"
                                max="150"
                                value={brushSize}
                                onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                                className="w-20 accent-indigo-400"
                            />
                        </>
                    )}
                </div>
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
                style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}
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
                        src={imageUrl}
                        alt=""
                        className="block pointer-events-none"
                        draggable={false}
                        referrerPolicy="no-referrer"
                        onLoad={handleImageLoad}
                        onError={(e) => {
                            console.error('[InpaintModal] Original image load failed. URL:', imageUrl.substring(0, 100) + '...');
                            setImageLoaded(false);
                        }}
                        style={imgSize.w > 0 ? { width: imgSize.w, height: imgSize.h } : {}}
                    />

                    {/* 蒙版层 - 仅在绘制模式时显示。移除 pointer-events-none 使其可交互 */}
                    {imageLoaded && (<>
                        <div className="absolute inset-0 bg-black/8 pointer-events-none" />
                        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none', opacity: 0.45, filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.72)) drop-shadow(0 0 24px rgba(255,255,255,0.4))' }} />
                        <canvas ref={edgeCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
                    </>)}

                    {/* 边框 */}
                    {imageLoaded && <div className="absolute inset-0 ring-1 ring-white/12 rounded-sm pointer-events-none" />}
                </div>

                {/* 加载中提示 */}
                {!imageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="flex flex-col items-center gap-3"><Loader2 size={24} className="text-white/40 animate-spin" /><span className="text-sm text-white/30">加载图片...</span></div>
                    </div>
                )}

                {/* 生成中 (已移除) */}
                {/* 错误 (已移除) */}

                {/* 框选预览（顺时针蚂蚁线，清晰硬边） */}
                {rectScreen && rectScreen.width > 2 && rectScreen.height > 2 && (
                    <svg
                        className="fixed pointer-events-none"
                        style={{
                            left: rectScreen.left,
                            top: rectScreen.top,
                            width: rectScreen.width,
                            height: rectScreen.height,
                            overflow: 'visible'
                        }}
                        width={rectScreen.width}
                        height={rectScreen.height}
                    >
                        <rect
                            x={0}
                            y={0}
                            width={rectScreen.width}
                            height={rectScreen.height}
                            rx={4}
                            ry={4}
                            fill="rgba(86, 165, 255, 0.40)"
                        />

                        <rect
                            x={0.5}
                            y={0.5}
                            width={Math.max(0, rectScreen.width - 1)}
                            height={Math.max(0, rectScreen.height - 1)}
                            rx={4}
                            ry={4}
                            fill="none"
                            stroke="rgba(255,255,255,0.95)"
                            strokeWidth={1.2}
                            strokeDasharray="8 6"
                            strokeLinecap="round"
                        >
                            <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1s" repeatCount="indefinite" />
                        </rect>
                    </svg>
                )}

            </div>

            {/* ═══════════ 底部居中输入框 ═══════════ */}
            <div className="absolute bottom-9 left-0 right-0 w-full flex justify-center pointer-events-none z-50">
                <div className="w-full max-w-[560px] px-4 pointer-events-auto">
                    <div className="flex items-center gap-2 py-2 px-3 rounded-2xl border border-white/10"
                        style={{ background: 'rgba(31,34,42,0.72)', backdropFilter: 'blur(14px)', boxShadow: '0 10px 35px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setTool('brush'); }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                            title="画笔模式"
                        >
                            <span className="text-lg leading-none">+</span>
                        </button>
                        <input type="text" value={inpaintPrompt}
                            onChange={(e) => setInpaintPrompt(e.target.value)}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                            placeholder="描述编辑"
                            className="flex-1 bg-transparent text-sm text-white/92 placeholder-white/35 outline-none py-1.5"
                        />
                        <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/65 hover:text-white hover:bg-white/10 transition-colors"
                            title="语音输入"
                        >
                            <Mic size={15} />
                        </button>
                        <button onClick={handleGenerate}
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30 transition-all hover:scale-105"
                            title="提交编辑"
                        >
                            <ArrowUp size={15} />
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
};
