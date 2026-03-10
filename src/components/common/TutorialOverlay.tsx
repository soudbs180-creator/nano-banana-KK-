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

        return () => {
            clearTimeout(timer);
            if (rafId) cancelAnimationFrame(rafId);
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
    
    // Calculate position for the tooltip - use transform for GPU acceleration
    const getTooltipTransform = (): React.CSSProperties => {
        if (!rect || step.position === 'center') {
            return {
                transform: 'translate3d(-50%, -50%, 0)',
                left: '50%',
                top: '50%',
                position: 'fixed'
            };
        }

        const padding = 20;
        let x = rect.left + rect.width / 2;
        let y = rect.top + rect.height / 2;
        let translateX = -50;
        let translateY = -50;

        if (step.position === 'top') {
            y = rect.top - padding;
            translateY = -100;
        } else if (step.position === 'bottom') {
            y = rect.bottom + padding;
            translateY = 0;
        } else if (step.position === 'left') {
            x = rect.left - padding;
            translateX = -100;
        } else if (step.position === 'right') {
            x = rect.right + padding;
            translateX = 0;
        }

        // Clamp to viewport
        const safeMarginY = 200;
        const safeMarginX = 200;
        
        if (step.position === 'left' || step.position === 'right') {
            y = Math.max(safeMarginY, Math.min(y, window.innerHeight - safeMarginY));
        }
        if (step.position === 'top' || step.position === 'bottom') {
            x = Math.max(safeMarginX, Math.min(x, window.innerWidth - safeMarginX));
        }

        return { 
            transform: `translate3d(calc(${translateX}% + ${x - (translateX === -50 ? x : 0)}px), calc(${translateY}% + ${y - (translateY === -50 ? y : 0)}px), 0)`,
            left: 0,
            top: 0,
            position: 'fixed'
        };
    };

    // Get highlight position using transform
    const getHighlightTransform = (): React.CSSProperties => {
        if (!rect) return { transform: 'scale(0)', opacity: 0 };
        return {
            transform: `translate3d(${rect.x - 8}px, ${rect.y - 8}px, 0)`,
            width: rect.width + 16,
            height: rect.height + 16,
            opacity: 1
        };
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] overflow-hidden">
            {/* Optimized Spotlight using div with border instead of SVG mask */}
            <div className="absolute inset-0 bg-black/80 will-change-auto" />
            {rect && (
                <div
                    ref={highlightRef}
                    className="absolute rounded-2xl pointer-events-none will-change-transform"
                    style={{
                        ...getHighlightTransform(),
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.8), 0 0 20px rgba(99,102,241,0.3)',
                        transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease',
                    }}
                />
            )}

            {/* Content Box - GPU accelerated */}
            <div
                ref={tooltipRef}
                className="p-4 w-full max-w-[min(360px,90vw)] will-change-transform"
                style={{
                    ...getTooltipTransform(),
                    transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                }}
            >
                <div className="bg-[var(--bg-secondary)]/90 backdrop-blur-2xl border border-[var(--border-light)] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] rounded-[28px] p-6 animate-in fade-in zoom-in-95 duration-300">
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
