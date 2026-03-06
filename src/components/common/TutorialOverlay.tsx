import React, { useState, useEffect } from 'react';
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

    // Calculate position for the tooltip
    const getTooltipStyle = (): React.CSSProperties => {
        // Fallback to center if no rect or position is explicitly center
        // NOTE: removed isMobile check to allow mobile elements to be targeted
        if (!rect || step.position === 'center') {
            return {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                position: 'fixed'
            };
        }

        const padding = 20;
        let top = rect.top + rect.height / 2;
        let left = rect.left + rect.width / 2;
        let transform = 'translate(-50%, -50%)';

        if (step.position === 'top') {
            top = rect.top - padding;
            transform = 'translate(-50%, -100%)';
        } else if (step.position === 'bottom') {
            top = rect.bottom + padding;
            transform = 'translate(-50%, 0)';
        } else if (step.position === 'left') {
            left = rect.left - padding;
            transform = 'translate(-100%, -50%)';
        } else if (step.position === 'right') {
            left = rect.right + padding;
            transform = 'translate(0, -50%)';
        }

        // [FIX] Clamp position to keep tooltip within viewport
        // Assuming implicit max-height of ~300px and max-width of ~300px
        const safeMarginY = 200; // Half height (150) + padding (50)
        const safeMarginX = 200; // Half width (180) + padding (20)

        // Only clamp if not explicitly 'top' or 'bottom' positioned (which naturally avoid vertical center issues mostly)
        // But 'left'/'right' use vertical center, which causes the clip at bottom/top corners.
        if (step.position === 'left' || step.position === 'right') {
            top = Math.max(safeMarginY, Math.min(top, window.innerHeight - safeMarginY));
        }
        if (step.position === 'top' || step.position === 'bottom') {
            left = Math.max(safeMarginX, Math.min(left, window.innerWidth - safeMarginX));
        }

        return { top, left, transform, position: 'absolute' };
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] overflow-hidden">
            {/* SVG Mask for Spotlight Effect */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-500 ease-in-out">
                <defs>
                    <mask id="spotlight-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {rect && (
                            <rect
                                x={rect.x - 8}
                                y={rect.y - 8}
                                width={rect.width + 16}
                                height={rect.height + 16}
                                rx="16"
                                fill="black"
                                className="transition-all duration-500 ease-in-out"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    fill="rgba(0,0,0,0.8)"
                    mask="url(#spotlight-mask)"
                />
            </svg>

            {/* Content Box */}
            <div
                className="transition-all duration-500 ease-out p-4 w-full max-w-[min(360px,90vw)]"
                style={getTooltipStyle()}
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
                            className="p-1.5 rounded-full hover:bg-white/5 dark:text-zinc-500 dark:hover:text-white transition-all"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2 tracking-tight">{step.title}</h3>
                    <p className="text-[14px] dark:text-zinc-400 leading-relaxed mb-8">
                        {step.description}
                    </p>

                    <div className="flex justify-between items-center gap-3">
                        <button
                            onClick={handlePrev}
                            disabled={currentStepIndex === 0}
                            className={`flex items-center justify-center w-10 h-10 rounded-full border border-white/5 transition-all ${currentStepIndex === 0
                                ? 'opacity-20 cursor-not-allowed'
                                : 'bg-white/5 text-white hover:bg-white/10 active:scale-90'
                                }`}
                        >
                            <ArrowLeft size={18} />
                        </button>

                        <button
                            onClick={handleNext}
                            className="flex-1 flex items-center justify-center gap-2 bg-white text-black hover:dark:bg-zinc-200 active:scale-[0.98] h-11 rounded-full text-[14px] font-bold transition-all shadow-lg shadow-white/5"
                        >
                            {currentStepIndex === STEPS.length - 1 ? (
                                <>开始探索 <Check size={18} /></>
                            ) : (
                                <>下一步 <ArrowRight size={18} /></>
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
