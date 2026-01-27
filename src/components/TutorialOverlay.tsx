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
        description: "这是您的新一代 AI 创作工作站。让我们花两分钟熟悉一下核心功能。",
        position: "center"
    },
    {
        targetId: "sidebar-container", // Requires ID in App.tsx
        title: "侧边栏 & 历史",
        description: "在这里切换不同的创作模式（聊天/画布），查看您的会话历史记录和收藏的资源。",
        position: "right"
    },
    {
        targetId: "models-dropdown-trigger", // Requires ID in Sidebar
        title: "模型切换",
        description: "点击这里快速切换 AI 模型。我们支持多种主流模型，您也可以在设置中添加自己的 API 渠道。",
        position: "bottom"
    },
    {
        targetId: "canvas-container", // Requires ID in App.tsx
        title: "无限画布",
        description: "这是您的主要创作区域。双击空白处创建图像卡片，双击已有图像查看大图。支持自由拖拽和缩放。",
        position: "center"
    },
    {
        targetId: "prompt-bar-container", // Requires ID in PromptBar
        title: "指令输入",
        description: "在此输入您的创意指令。支持拖入参考图，或使用右侧的工具栏进行高级设置。",
        position: "top"
    },
    {
        targetId: "settings-button", // Requires ID in Sidebar
        title: "设置与存储",
        description: "别忘了在设置中配置您的 API 密钥和本地存储路径，以确保最佳体验。",
        position: "right"
    }
];

interface TutorialOverlayProps {
    onComplete: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ onComplete }) => {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);

    const step = STEPS[currentStepIndex];

    useEffect(() => {
        if (!step.targetId) {
            setRect(null);
            return;
        }

        const updateRect = () => {
            const el = document.getElementById(step.targetId!);
            if (el) {
                const r = el.getBoundingClientRect();
                // Add padding
                setRect({
                    ...r,
                    top: r.top - 5,
                    left: r.left - 5,
                    width: r.width + 10,
                    height: r.height + 10,
                    bottom: r.bottom + 5,
                    right: r.right + 5,
                    x: r.x - 5,
                    y: r.y - 5,
                    toJSON: () => { }
                });
            } else {
                setRect(null); // Fallback if element not found
            }
        };

        // Delay slightly to ensure UI is rendered
        setTimeout(updateRect, 100);
        window.addEventListener('resize', updateRect);
        return () => window.removeEventListener('resize', updateRect);
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

    return createPortal(
        <div className="fixed inset-0 z-[99999] overflow-hidden">
            {/* SVG Mask for Spotlight Effect */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-500 ease-in-out">
                <defs>
                    <mask id="spotlight-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {rect && (
                            <rect
                                x={rect.x}
                                y={rect.y}
                                width={rect.width}
                                height={rect.height}
                                rx="12"
                                fill="black"
                                className="transition-all duration-300 ease-in-out"
                            />
                        )}
                    </mask>
                </defs>
                <rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    fill="rgba(0,0,0,0.75)"
                    mask="url(#spotlight-mask)"
                />
            </svg>

            {/* Content Box */}
            <div
                className="absolute transition-all duration-300 ease-out flex flex-col items-center justify-center p-4 max-w-sm"
                style={{
                    top: rect ? (step.position === 'top' ? rect.top - 200 : step.position === 'bottom' ? rect.bottom + 20 : rect.top + rect.height / 2) : '50%',
                    left: rect ? (step.position === 'left' ? rect.left - 350 : step.position === 'right' ? rect.right + 20 : rect.left + rect.width / 2) : '50%',
                    transform: rect && step.position !== 'center' ? 'none' : 'translate(-50%, -50%)',
                }}
            >
                {/* Pointer Arrow */}
                {/* (Simplified: omitted for clean aesthetic, relying on position) */}

                <div className="bg-[#18181b] border border-zinc-700 shadow-2xl rounded-2xl p-6 w-[320px] animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start mb-4">
                        <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-1 rounded">
                            {currentStepIndex + 1} / {STEPS.length}
                        </span>
                        <button onClick={onComplete} className="text-zinc-500 hover:text-white transition-colors">
                            <X size={16} />
                        </button>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                        {step.description}
                    </p>

                    <div className="flex justify-between items-center">
                        <button
                            onClick={handlePrev}
                            disabled={currentStepIndex === 0}
                            className={`p-2 rounded-full hover:bg-zinc-800 transition-colors ${currentStepIndex === 0 ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-300'}`}
                        >
                            <ArrowLeft size={18} />
                        </button>

                        <button
                            onClick={handleNext}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            {currentStepIndex === STEPS.length - 1 ? (
                                <>开始探索 <Check size={16} /></>
                            ) : (
                                <>下一步 <ArrowRight size={16} /></>
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
