/**
 * 热点提示引导
 * 在用户后续使用中适时提示未探索的功能
 */

import React, { useState, useEffect } from 'react';
import { X, Lightbulb, ChevronRight } from 'lucide-react';
import { OnboardingProgress } from './types';

interface TooltipGuideProps {
  progress: OnboardingProgress;
}

interface TooltipItem {
  id: string;
  title: string;
  content: string;
  target: string;
  condition: (progress: OnboardingProgress) => boolean;
  dismissKey: string;
}

const TOOLTIPS: TooltipItem[] = [
  {
    id: 'ref-image-tip',
    title: '试试参考图功能',
    content: '上传参考图可以让 AI 更好地理解你想要的风格',
    target: 'prompt-bar',
    condition: (p) => p.completedTasks.includes('basic_3') && !p.completedTasks.includes('inter_1'),
    dismissKey: 'tooltip_ref_image_dismissed'
  },
  {
    id: 'ai-assistant-tip',
    title: 'AI 助手可以帮你',
    content: '不知道写什么提示词？点击右下角的 AI 助手获取灵感',
    target: 'ai-assistant-float',
    condition: (p) => p.completedTasks.length >= 3 && !p.completedTasks.includes('adv_1'),
    dismissKey: 'tooltip_ai_assistant_dismissed'
  },
  {
    id: 'variant-tip',
    title: '生成变体',
    content: '喜欢这张图片？右键点击生成更多变体',
    target: 'image-card',
    condition: (p) => p.completedTasks.includes('basic_3') && !p.completedTasks.includes('inter_2'),
    dismissKey: 'tooltip_variant_dismissed'
  },
  {
    id: 'save-project-tip',
    title: '记得保存项目',
    content: '定期保存项目到本地，防止数据丢失',
    target: 'project-manager',
    condition: (p) => p.completedTasks.length >= 5 && !p.completedTasks.includes('adv_2'),
    dismissKey: 'tooltip_save_project_dismissed'
  }
];

export const TooltipGuide: React.FC<TooltipGuideProps> = ({ progress }) => {
  const [activeTooltip, setActiveTooltip] = useState<TooltipItem | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // 加载已关闭的提示
  useEffect(() => {
    const dismissedKeys = new Set<string>();
    TOOLTIPS.forEach(t => {
      if (localStorage.getItem(t.dismissKey) === 'true') {
        dismissedKeys.add(t.id);
      }
    });
    setDismissed(dismissedKeys);
  }, []);

  // 检查应该显示哪个提示
  useEffect(() => {
    if (activeTooltip) return;

    // 延迟显示，避免打扰用户
    const timer = setTimeout(() => {
      for (const tooltip of TOOLTIPS) {
        if (
          !dismissed.has(tooltip.id) &&
          tooltip.condition(progress)
        ) {
          setActiveTooltip(tooltip);
          break;
        }
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [progress, dismissed, activeTooltip]);

  const handleDismiss = () => {
    if (activeTooltip) {
      localStorage.setItem(activeTooltip.dismissKey, 'true');
      setDismissed(prev => new Set(prev).add(activeTooltip.id));
      setActiveTooltip(null);
    }
  };

  const handleAction = () => {
    // 可以在这里触发相应的动作
    handleDismiss();
  };

  if (!activeTooltip) return null;

  return (
    <div className="tooltip-guide">
      <div className="tooltip-content">
        <div className="tooltip-header">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span>新功能提示</span>
          <button className="dismiss-btn" onClick={handleDismiss}>
            <X className="w-3 h-3" />
          </button>
        </div>
        
        <div className="tooltip-body">
          <h4>{activeTooltip.title}</h4>
          <p>{activeTooltip.content}</p>
        </div>
        
        <div className="tooltip-actions">
          <button className="btn-dismiss" onClick={handleDismiss}>
            知道了
          </button>
          <button className="btn-action" onClick={handleAction}>
            试试看
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      {/* 指向目标的箭头 */}
      <div className="tooltip-arrow" />
    </div>
  );
};
