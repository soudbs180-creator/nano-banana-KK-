import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';

interface TutorialStep {
    targetId?: string; // ID of the element to highlight
    title: string;
    description: string;
    position?: 'left' | 'right' | 'top' | 'bottom' | 'center';
}

const STEPS: TutorialStep[] = [
    {
        title: "欢迎来到 KK Studio",
        description: "这是您的新一代 AI 创作工作站。存储配置已完成，现在让我们花一分钟熟悉一下核心功能。",
        position: "center"
    },
    {
        targetId: "sidebar-container",
        title: "侧边栏 & 导航",
        description: "在此切换生成模式、查看历史记录或调整系统设置。手机端可通过左侧边缘向右滑动或点击图标唤起。",
        position: "right"
    },
    {
        targetId: "project-manager-trigger",
        title: "项目管理",
        description: "点击这里切换、重命名或创建新项目。每个项目都是一个独立的无限画布。",
        position: "right"
    },
    {
        targetId: "canvas-container",
        title: "无限画布",
        description: "双击空白处创建图像卡片，双击已有图像查看大图。支持自由拖拽和缩放。手机端支持双指缩放。",
        position: "center"
    },
    {
        targetId: "prompt-bar-container",
        title: "指令输入",
        description: "在此输入创意指令。点击左侧模型名称可切换模型，右侧可配置并发数量或上传参考图。",
        position: "top"
    },
    {
        targetId: "models-dropdown-trigger",
        title: "模型切换",
        description: "在这里您可以快速切换不同的 AI 模型。如果列表为空，请前往设置配置您的 API 密钥。",
        position: "top"
    }
];

interface TutorialOverlayProps {
    onComplete: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onComplete }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

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
                setRect(r);
            } else {
                setRect(null);
            }
        };

        // Delay slightly to ensure UI is rendered and stable
        const timer = setTimeout(updateRect, 200);
        window.addEventListener('resize', updateRect);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateRect);
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
        if (!rect || step.position === 'center' || isMobile) {
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
                <div className="bg-[#1c1c1e]/90 backdrop-blur-2xl border border-white/10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] rounded-[28px] p-6 animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex justify-between items-start mb-5">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                            <span className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase">
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
                            className={`flex items-center justify-center w-10 h-10 rounded-full border border-white/5 transition-all ${
                                currentStepIndex === 0 
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
