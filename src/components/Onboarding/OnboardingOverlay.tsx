/**
 * 引导遮罩层
 * 分阶段展示引导内容
 */

import React, { useEffect, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, MousePointer, Keyboard, Zap, Award } from 'lucide-react';
import { OnboardingPhase, OnboardingProgress } from './types';

interface OnboardingOverlayProps {
  phase: OnboardingPhase;
  onNext: () => void;
  onSkip: () => void;
  progress: OnboardingProgress;
}

interface PhaseContent {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  steps: string[];
  tip?: string;
}

const PHASE_CONTENT: Record<OnboardingPhase, PhaseContent> = {
  welcome: {
    title: '欢迎来到 KK Studio',
    subtitle: '无限画布 AI 创作平台',
    icon: <Sparkles className="w-12 h-12 text-indigo-400" />,
    steps: [
      '🎨 无限画布 - 自由创作，没有边界',
      '🤖 AI 驱动 - 多种模型，一键生成',
      '💡 智能助手 - 实时帮助，优化提示词',
      '🔗 节点连接 - 可视化管理工作流'
    ],
    tip: '按 ESC 键可随时退出引导'
  },
  basics: {
    title: '基础操作',
    subtitle: '掌握内核交互',
    icon: <MousePointer className="w-12 h-12 text-blue-400" />,
    steps: [
      '双击画布创建卡片',
      '输入提示词描述画面',
      '点击发送生成图片',
      '滚轮缩放，空格拖拽'
    ],
    tip: '提示：Ctrl/Cmd + / 快速打开 AI 助手'
  },
  intermediate: {
    title: '进阶技巧',
    subtitle: '提升创作效率',
    icon: <Zap className="w-12 h-12 text-amber-400" />,
    steps: [
      '使用参考图引导生成',
      '基于图片创建变体',
      '连接节点构建工作流',
      '切换模型对比效果'
    ]
  },
  advanced: {
    title: '高级功能',
    subtitle: '释放全部潜能',
    icon: <Award className="w-12 h-12 text-purple-400" />,
    steps: [
      'AI 助手优化提示词',
      '批量生成与导出',
      '本地项目保存',
      '视频生成探索'
    ]
  },
  complete: {
    title: '准备就绪',
    subtitle: '开始你的创作之旅',
    icon: <Award className="w-12 h-12 text-green-400" />,
    steps: [
      '✅ 已完成基础学习',
      '🎯 完成任务获得奖励',
      '📚 随时查看帮助文档',
      '🚀 现在就开始创作吧！'
    ],
    tip: '点击右上角的任务面板查看进度'
  }
};

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({
  phase,
  onNext,
  onSkip,
  progress
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const content = PHASE_CONTENT[phase];
  const isLastPhase = phase === 'complete';

  useEffect(() => {
    setIsVisible(true);
  }, [phase]);

  // ESC 键退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSkip]);

  const handleNext = () => {
    setIsVisible(false);
    setTimeout(onNext, 300);
  };

  return (
    <div className={`onboarding-overlay ${isVisible ? 'visible' : ''}`}>
      {/* 背景动画 */}
      <div className="onboarding-bg">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
      </div>

      {/* 关闭按钮 */}
      <button className="onboarding-close" onClick={onSkip}>
        <X className="w-5 h-5" />
      </button>

      {/* 进度条 */}
      <div className="onboarding-progress-bar">
        <div 
          className="progress-fill"
          style={{ width: `${(progress.completedTasks.length / progress.totalTasks) * 100}%` }}
        />
      </div>

      {/* 主内容 */}
      <div className={`onboarding-content ${isVisible ? 'enter' : ''}`}>
        {/* 图标 */}
        <div className="phase-icon">
          {content.icon}
        </div>

        {/* 标题 */}
        <h1 className="phase-title">{content.title}</h1>
        <p className="phase-subtitle">{content.subtitle}</p>

        {/* 步骤列表 */}
        <div className="phase-steps">
          {content.steps.map((step, idx) => (
            <div 
              key={idx} 
              className="step-item"
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <span className="step-bullet">{idx + 1}</span>
              <span className="step-text">{step}</span>
            </div>
          ))}
        </div>

        {/* 提示 */}
        {content.tip && (
          <p className="phase-tip">💡 {content.tip}</p>
        )}

        {/* 按钮组 */}
        <div className="phase-actions">
          <button className="btn-skip" onClick={onSkip}>
            跳过引导
          </button>
          <button className="btn-next" onClick={handleNext}>
            {isLastPhase ? '开始创作' : '下一步'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 阶段指示器 */}
        <div className="phase-indicators">
          {(['welcome', 'basics', 'intermediate', 'advanced', 'complete'] as OnboardingPhase[]).map((p, idx) => (
            <div 
              key={p}
              className={`indicator ${p === phase ? 'active' : ''} ${
                progress.completedTasks.length > idx * 3 ? 'completed' : ''
              }`}
            />
          ))}
        </div>
      </div>

      {/* 装饰元素 */}
      <div className="floating-shapes">
        <div className="shape shape-1" />
        <div className="shape shape-2" />
        <div className="shape shape-3" />
      </div>
    </div>
  );
};
