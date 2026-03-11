import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';

interface TutorialStep {
    targetId?: string; // ID of the element to highlight
    title: string;
    description: string;
    position?: 'left' | 'right' | 'top' | 'bottom' | 'center';
}

interface TutorialOverlayProps {
    onComplete: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onComplete }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [tooltipSize, setTooltipSize] = useState({ width: 360, height: 320 });
    const overlayColor = 'rgba(0, 0, 0, 0.82)';

    const STEPS: TutorialStep[] = React.useMemo(() => [
        {
            // Removed targetId for "Infinite Canvas" to show centered text on dark overlay (better intro)
            title: "欢迎使用无限画布",
            description: "这是您的自由创作空间，没有任何边界限制。\n\n• 🖱️ 双击空白处：快速创建新的图像卡片\n• 🔍 滚轮缩放：自由缩放查看细节\n• ✋ 按住空格拖拽：平移画布视角\n• 💡这不仅仅是一个画板，更是一个思维导图式的创作流工具。",
            position: "center"
        },
        {
            targetId: "prompt-bar-container",
            title: "指令创作中心",
            description: "这是您的控制台。支持图片与视频双模式创作。\n\n• 🎨 输入描述：在中间输入框描述画面\n• 📐 比例与尺寸：左侧灵活调整画幅与分辨率\n• 🖼️ 参考图：右侧上传参考图，支持多图混搭\n• ⚡ 快捷键：Enter 发送，Shift+Enter 换行",
            position: "top"
        },
        {
            targetId: isMobile ? "mobile-tab-bar" : "project-manager-container",
            title: "左侧工具栏",
            description: "管理您的创意资产与视图设置。\n\n• 📁 项目管理：新建、切换与归档不同项目\n• 🔍 全局搜索：Ctrl+K 快速查找历史提示词\n• 📏 视图工具：网格对齐、一键归位、主题切换\n• 📂 导入导出：支持 .kk 格式项目文档",
            position: isMobile ? "top" : "right"
        },
        {
            targetId: "chat-trigger-button",
            title: "AI 创意助手",
            description: "您的全天候创作伙伴。\n\n• 🤖 灵感对话：不知道画什么？问问它\n• ✨ 提示词通过：帮您优化简陋的描述词\n• 📝 自动补全：基于上下文智能建议后续内容",
            position: "top"
        },
        {
            targetId: "header-user-menu",
            title: "账户与设置",
            description: "管理您的个人偏好与资源。\n\n• 🔑 API 管理：配置与切换不同的 AI 模型 Key\n• 📊 成本监控：实时查看今日消耗与剩余预算\n• ☁️ 云端同步：开启多设备自动同步功能",
            position: isMobile ? "bottom" : "bottom"
        }
    ], [isMobile]);

    const step = STEPS[currentStepIndex];

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!step.targetId) {
            setRect(null);
            return;
        }

        const updateRect = () => {
            const el = document.getElementById(step.targetId!);
            if (el) {
                const r = el.getBoundingClientRect();
                // Check if element is effectively visible
                if (r.width === 0 && r.height === 0) {
                    setRect(null);
                } else {
                    setRect(r);
                }
            } else {
                setRect(null);
            }
        };

        // Optimize: Use requestAnimationFrame for smoother tracking
        let rafId: number | null = null;
        let mutationObserver: MutationObserver | null = null;
        const onFrame = () => {
            updateRect();
            rafId = null;
        };
        const throttledUpdate = () => {
            if (rafId === null) {
                rafId = requestAnimationFrame(onFrame);
            }
        };

        // Delay slightly to ensure UI is rendered and stable
        const timer = setTimeout(updateRect, 200);
        window.addEventListener('resize', throttledUpdate);
        window.addEventListener('scroll', throttledUpdate, true); // Listen to capture scroll

        if (typeof MutationObserver !== 'undefined' && document.body) {
            mutationObserver = new MutationObserver(throttledUpdate);
            mutationObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['id', 'class', 'style']
            });
        }

        return () => {
            clearTimeout(timer);
            if (rafId) cancelAnimationFrame(rafId);
            mutationObserver?.disconnect();
            window.removeEventListener('resize', throttledUpdate);
            window.removeEventListener('scroll', throttledUpdate, true);
        };
    }, [currentStepIndex, step.targetId]);


    const handleNext = () => {
        if (currentStepIndex < STEPS.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
        } else {
            onComplete();
        }
    };

    const handlePrev = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(prev => prev - 1);
        }
    };

    // Use refs for smooth position updates without re-render
    const tooltipRef = useRef<HTMLDivElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const updateTooltipSize = () => {
            const element = tooltipRef.current;
            if (!element) return;

            const nextWidth = element.offsetWidth || 360;
            const nextHeight = element.offsetHeight || 320;

            setTooltipSize((prev) => {
                if (prev.width === nextWidth && prev.height === nextHeight) {
                    return prev;
                }
                return { width: nextWidth, height: nextHeight };
            });
        };

        updateTooltipSize();
        window.addEventListener('resize', updateTooltipSize);

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined' && tooltipRef.current) {
            resizeObserver = new ResizeObserver(updateTooltipSize);
            resizeObserver.observe(tooltipRef.current);
        }

        return () => {
            window.removeEventListener('resize', updateTooltipSize);
            resizeObserver?.disconnect();
        };
    }, [currentStepIndex, step.title, step.description, isMobile]);
    
    // Calculate position for the tooltip - use transform for GPU acceleration
    const getTooltipTransform = (): React.CSSProperties => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const viewportMargin = 16;
        const targetGap = 20;
        const tooltipWidth = Math.min(tooltipSize.width, viewportWidth - viewportMargin * 2);
        const tooltipHeight = Math.min(tooltipSize.height, viewportHeight - viewportMargin * 2);

        const clampX = (value: number) =>
            Math.max(viewportMargin, Math.min(value, viewportWidth - tooltipWidth - viewportMargin));
        const clampY = (value: number) =>
            Math.max(viewportMargin, Math.min(value, viewportHeight - tooltipHeight - viewportMargin));

        if (!rect || step.position === 'center') {
            return {
                position: 'fixed',
                left: clampX((viewportWidth - tooltipWidth) / 2),
                top: clampY((viewportHeight - tooltipHeight) / 2),
                width: `min(360px, calc(100vw - ${viewportMargin * 2}px))`,
                maxHeight: `calc(100vh - ${viewportMargin * 2}px)`
            };
        }

        const getPosition = (position: TutorialStep['position']) => {
            switch (position) {
                case 'top':
                    return {
                        left: rect.left + rect.width / 2 - tooltipWidth / 2,
                        top: rect.top - tooltipHeight - targetGap
                    };
                case 'bottom':
                    return {
                        left: rect.left + rect.width / 2 - tooltipWidth / 2,
                        top: rect.bottom + targetGap
                    };
                case 'left':
                    return {
                        left: rect.left - tooltipWidth - targetGap,
                        top: rect.top + rect.height / 2 - tooltipHeight / 2
                    };
                case 'right':
                    return {
                        left: rect.right + targetGap,
                        top: rect.top + rect.height / 2 - tooltipHeight / 2
                    };
                default:
                    return {
                        left: rect.left + rect.width / 2 - tooltipWidth / 2,
                        top: rect.bottom + targetGap
                    };
            }
        };

        const fitsViewport = (left: number, top: number) =>
            left >= viewportMargin &&
            top >= viewportMargin &&
            left + tooltipWidth <= viewportWidth - viewportMargin &&
            top + tooltipHeight <= viewportHeight - viewportMargin;

        const preferredPosition = step.position || 'bottom';
        const fallbackOrder: TutorialStep['position'][] = preferredPosition === 'top'
            ? ['top', 'bottom', 'right', 'left']
            : preferredPosition === 'bottom'
                ? ['bottom', 'top', 'right', 'left']
                : preferredPosition === 'left'
                    ? ['left', 'right', 'bottom', 'top']
                    : ['right', 'left', 'bottom', 'top'];

        let resolved = getPosition(preferredPosition);
        for (const position of fallbackOrder) {
            const candidate = getPosition(position);
            if (fitsViewport(candidate.left, candidate.top)) {
                resolved = candidate;
                break;
            }
        }

        return {
            position: 'fixed',
            left: clampX(resolved.left),
            top: clampY(resolved.top),
            width: `min(360px, calc(100vw - ${viewportMargin * 2}px))`,
            maxHeight: `calc(100vh - ${viewportMargin * 2}px)`
        };
    };

    const spotlightBounds = React.useMemo(() => {
        if (!rect) return null;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = isMobile ? 10 : 12;
        const safeMargin = 8;

        const left = Math.max(safeMargin, rect.left - padding);
        const top = Math.max(safeMargin, rect.top - padding);
        const right = Math.min(viewportWidth - safeMargin, rect.right + padding);
        const bottom = Math.min(viewportHeight - safeMargin, rect.bottom + padding);

        return {
            left,
            top,
            right,
            bottom,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top)
        };
    }, [rect, isMobile]);

    return createPortal(
        <div className="fixed inset-0 z-[99999] overflow-hidden">
            {spotlightBounds ? (
                <>
                    <div
                        className="absolute left-0 top-0 w-full"
                        style={{
                            height: spotlightBounds.top,
                            backgroundColor: overlayColor,
                            transition: 'height 0.35s ease'
                        }}
                    />
                    <div
                        className="absolute left-0"
                        style={{
                            top: spotlightBounds.top,
                            width: spotlightBounds.left,
                            height: spotlightBounds.height,
                            backgroundColor: overlayColor,
                            transition: 'top 0.35s ease, width 0.35s ease, height 0.35s ease'
                        }}
                    />
                    <div
                        className="absolute"
                        style={{
                            left: spotlightBounds.right,
                            top: spotlightBounds.top,
                            width: Math.max(0, window.innerWidth - spotlightBounds.right),
                            height: spotlightBounds.height,
                            backgroundColor: overlayColor,
                            transition: 'left 0.35s ease, top 0.35s ease, width 0.35s ease, height 0.35s ease'
                        }}
                    />
                    <div
                        className="absolute left-0 w-full"
                        style={{
                            top: spotlightBounds.bottom,
                            height: Math.max(0, window.innerHeight - spotlightBounds.bottom),
                            backgroundColor: overlayColor,
                            transition: 'top 0.35s ease, height 0.35s ease'
                        }}
                    />
                    <div
                        ref={highlightRef}
                        className="absolute rounded-[24px] pointer-events-none"
                        style={{
                            left: spotlightBounds.left,
                            top: spotlightBounds.top,
                            width: spotlightBounds.width,
                            height: spotlightBounds.height,
                            border: '1px solid rgba(129, 140, 248, 0.9)',
                            background: 'rgba(99, 102, 241, 0.05)',
                            boxShadow: '0 0 0 1px rgba(99,102,241,0.25), 0 0 32px rgba(99,102,241,0.22), inset 0 0 0 1px rgba(255,255,255,0.04)',
                            transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease'
                        }}
                    />
                </>
            ) : (
                <div className="absolute inset-0 will-change-auto" style={{ backgroundColor: overlayColor }} />
            )}

            {/* Content Box - GPU accelerated */}
            <div
                ref={tooltipRef}
                className="p-4 w-full max-w-[min(360px,90vw)] will-change-transform"
                style={{
                    ...getTooltipTransform(),
                    transition: 'left 0.3s ease, top 0.3s ease'
                }}
            >
                <div className="max-h-[calc(100vh-32px)] overflow-y-auto bg-[var(--bg-secondary)]/90 backdrop-blur-2xl border border-[var(--border-light)] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] rounded-[28px] p-6 animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex justify-between items-start mb-5">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                            <span className="text-[10px] font-bold tracking-widest text-[var(--text-tertiary)] uppercase">
                                Step {currentStepIndex + 1} of {STEPS.length}
                            </span>
                        </div>
                        <button
                            onClick={onComplete}
                            className="rounded-full p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--toolbar-hover)] hover:text-[var(--text-primary)]"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <h3 className="mb-2 text-xl font-bold tracking-tight text-[var(--text-primary)]">{step.title}</h3>
                    <p className="mb-8 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                        {step.description}
                    </p>

                    <div className="flex justify-between items-center gap-3">
                        <button
                            onClick={handlePrev}
                            disabled={currentStepIndex === 0}
                            className={`flex items-center justify-center w-10 h-10 rounded-full border border-[var(--border-light)] leading-none transition-transform ${currentStepIndex === 0
                                ? 'opacity-20 cursor-not-allowed'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--toolbar-hover)] active:scale-90'
                                }`}
                        >
                            <ArrowLeft size={18} className="shrink-0" />
                        </button>

                        <button
                            onClick={handleNext}
                            className="flex-1 flex items-center justify-center gap-2 h-11 rounded-full bg-[var(--text-primary)] text-[14px] font-bold leading-none text-[var(--bg-primary)] transition-transform shadow-lg active:scale-[0.98]"
                        >
                            {currentStepIndex === STEPS.length - 1 ? (
                                <>
                                    <span className="leading-none">开始探索</span>
                                    <Check size={18} className="shrink-0" />
                                </>
                            ) : (
                                <>
                                    <span className="leading-none">下一步</span>
                                    <ArrowRight size={18} className="shrink-0" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default TutorialOverlay;
