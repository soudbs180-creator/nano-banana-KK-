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
            title: "无限画布",
            description: "这是您的创作空间。您可以在这里自由拖拽、缩放查看作品。\n\n• 双击空白处创建新的图像卡片\n• 双击已有图像可查看大图\n• 鼠标滚轮或双指缩放画布\n• 拖拽可平移视角",
            position: "center"
        },
        {
            targetId: "prompt-bar-container",
            title: "指令输入区",
            description: "在这里输入您的创意指令来生成图像。\n\n• 左侧选择 AI 模型（Gemini 2.0 Flash 等）\n• 中间输入框输入文字描述\n• 可选择比例（1:1, 16:9 等）和分辨率（1K, 2K, 4K）\n• 点击右侧图片按钮可上传参考图\n• 点击发送按钮开始生成",
            position: "top"
        },
        {
            targetId: isMobile ? "mobile-tab-bar" : "project-manager-container",
            title: "项目管理 & 工具栏",
            description: "左上角管理您的项目和视图。\n\n• 新建/切换项目\n• 搜索提示词 (Ctrl+K)\n• 放大/缩小/重置视图\n• 切换网格显示\n• 切换亮色/暗色主题",
            position: isMobile ? "top" : "right"
        },
        {
            targetId: "chat-trigger-button",
            title: "聊天机器人 & 辅助",
            description: "左下角 AI 助手。\n\n• 点击图标唤起 AI 助手\n• 可询问关于创作的问题\n• 获取提示词优化建议",
            position: "top" // [FIX] Changed from 'right' to 'top' to avoid bottom edge clipping
        },
        {
            targetId: "header-user-menu",
            title: "账户 & API 设置",
            description: "右上角账户管理。\n\n• 配置 API 密钥\n• 查看今日预算消耗\n• 监控云同步状态",
            position: isMobile ? "bottom" : "bottom" // [FIX] Changed to 'bottom' to avoid top edge clipping (safe for top-right menu)
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

        // Delay slightly to ensure UI is rendered and stable
        const timer = setTimeout(updateRect, 200);
        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, true); // Listen to capture scroll

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
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
                            className="p-1.5 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2 tracking-tight">{step.title}</h3>
                    <p className="text-[14px] text-zinc-400 leading-relaxed mb-8">
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
                            className="flex-1 flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 active:scale-[0.98] h-11 rounded-full text-[14px] font-bold transition-all shadow-lg shadow-white/5"
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
