/**
 * 新人引导系统 2.0
 * 
 * 设计理念：
 * 1. 交互式任务 - 让用户实际操作而不是只看
 * 2. 分阶段引导 - 首次进入 → 基础 → 进阶
 * 3. 进度保存 - 可以随时中断，下次继续
 * 4. 成就系统 - 完成任务获得奖励
 * 5. 智能提示 - 后续使用中提示未探索的功能
 */

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { OnboardingOverlay } from './OnboardingOverlay';
import { TaskPanel } from './TaskPanel';
import { TooltipGuide } from './TooltipGuide';
import { AchievementToast } from './AchievementToast';
import { 
  OnboardingPhase, 
  OnboardingTask, 
  OnboardingProgress,
  OnboardingContextType 
} from './types';
import { useOnboardingProgress } from './useOnboardingProgress';
import './Onboarding.css';

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export const useOnboarding = () => {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
};

interface OnboardingManagerProps {
  children: React.ReactNode;
}

export const OnboardingManager: React.FC<OnboardingManagerProps> = ({ children }) => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<OnboardingPhase>('welcome');
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [achievement, setAchievement] = useState<string | null>(null);
  
  const { progress, updateProgress, completeTask, skipOnboarding } = useOnboardingProgress();

  useEffect(() => {
    const isFirstVisit = !localStorage.getItem('kk_studio_visited');
    const hasCompletedOnboarding = progress.completed;
    
    if (isFirstVisit && !hasCompletedOnboarding) {
      setShowOverlay(true);
      localStorage.setItem('kk_studio_visited', 'true');
    }
  }, [progress.completed]);

  const startOnboarding = useCallback(() => {
    setShowOverlay(true);
    setCurrentPhase('welcome');
  }, []);

  const nextPhase = useCallback(() => {
    const phaseOrder: OnboardingPhase[] = ['welcome', 'basics', 'intermediate', 'advanced', 'complete'];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    const nextIndex = currentIndex + 1;
    
    if (nextIndex < phaseOrder.length) {
      setCurrentPhase(phaseOrder[nextIndex]);
    } else {
      setShowOverlay(false);
      setShowTaskPanel(true);
    }
  }, [currentPhase]);

  const handleSkip = useCallback(() => {
    setShowOverlay(false);
    skipOnboarding();
  }, [skipOnboarding]);

  const handleTaskComplete = useCallback((taskId: string) => {
    completeTask(taskId);
    
    const task = getTaskById(taskId);
    if (task?.reward?.badge) {
      setAchievement(task.reward.badge);
      setTimeout(() => setAchievement(null), 5000);
    }
  }, [completeTask]);

  const openTaskPanel = useCallback(() => {
    setShowTaskPanel(true);
  }, []);

  const closeTaskPanel = useCallback(() => {
    setShowTaskPanel(false);
  }, []);

  const value: OnboardingContextType = {
    progress,
    currentPhase,
    isActive: showOverlay,
    startOnboarding,
    nextPhase,
    skipOnboarding: handleSkip,
    completeTask: handleTaskComplete,
    openTaskPanel,
    closeTaskPanel
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      
      {showOverlay && (
        <OnboardingOverlay 
          phase={currentPhase}
          onNext={nextPhase}
          onSkip={handleSkip}
          progress={progress}
        />
      )}
      
      {showTaskPanel && (
        <TaskPanel 
          progress={progress}
          onClose={closeTaskPanel}
          onTaskClick={(task) => {}}
        />
      )}
      
      {!showOverlay && <TooltipGuide progress={progress} />}
      
      {achievement && (
        <AchievementToast 
          achievement={achievement}
          onClose={() => setAchievement(null)}
        />
      )}
    </OnboardingContext.Provider>
  );
};

function getTaskById(taskId: string): OnboardingTask | undefined {
  const allTasks = [
    ...TASKS_WELCOME,
    ...TASKS_BASICS,
    ...TASKS_INTERMEDIATE,
    ...TASKS_ADVANCED
  ];
  return allTasks.find(t => t.id === taskId);
}

// 任务定义
export const TASKS_WELCOME: OnboardingTask[] = [
  {
    id: 'welcome_1',
    title: '欢迎来到 KK Studio',
    description: '这是一个无限画布 AI 创作平台',
    type: 'info',
    phase: 'welcome'
  },
  {
    id: 'welcome_2',
    title: '了解界面布局',
    description: '认识主要功能区域',
    type: 'interactive',
    phase: 'welcome',
    targetElement: 'main-layout',
    hint: '左侧是项目管理，中间是画布，底部是输入区'
  }
];

export const TASKS_BASICS: OnboardingTask[] = [
  {
    id: 'basic_1',
    title: '创建第一张卡片',
    description: '双击画布空白处创建新卡片',
    type: 'action',
    phase: 'basics',
    targetElement: 'canvas',
    hint: '在画布上任意位置双击鼠标',
    reward: { type: 'credits', amount: 5 }
  },
  {
    id: 'basic_2',
    title: '输入提示词',
    description: '在卡片中输入你的第一条提示词',
    type: 'action',
    phase: 'basics',
    targetElement: 'prompt-input',
    hint: '描述你想要的画面，比如"一只可爱的猫咪"'
  },
  {
    id: 'basic_3',
    title: '生成第一张图片',
    description: '点击发送按钮生成图片',
    type: 'action',
    phase: 'basics',
    targetElement: 'send-button',
    hint: '点击右下角的发送按钮',
    reward: { type: 'credits', amount: 10, badge: '初出茅庐' }
  }
];

export const TASKS_INTERMEDIATE: OnboardingTask[] = [
  {
    id: 'inter_1',
    title: '使用参考图',
    description: '上传一张参考图',
    type: 'action',
    phase: 'intermediate',
    targetElement: 'reference-upload',
    reward: { type: 'credits', amount: 5 }
  },
  {
    id: 'inter_2',
    title: '创建变体',
    description: '基于已有图片生成变体',
    type: 'action',
    phase: 'intermediate',
    targetElement: 'image-node'
  },
  {
    id: 'inter_3',
    title: '切换模型',
    description: '尝试使用不同的 AI 模型',
    type: 'action',
    phase: 'intermediate',
    targetElement: 'model-selector',
    reward: { type: 'credits', amount: 5, badge: '模型探索者' }
  }
];

export const TASKS_ADVANCED: OnboardingTask[] = [
  {
    id: 'adv_1',
    title: '使用 AI 助手',
    description: '点击 AI 助手获取帮助',
    type: 'action',
    phase: 'advanced',
    targetElement: 'ai-assistant',
    reward: { type: 'credits', amount: 5 }
  },
  {
    id: 'adv_2',
    title: '保存项目',
    description: '将项目保存到本地文件夹',
    type: 'action',
    phase: 'advanced',
    targetElement: 'save-project'
  },
  {
    id: 'adv_3',
    title: '探索视频生成',
    description: '尝试生成一段视频',
    type: 'action',
    phase: 'advanced',
    targetElement: 'mode-switch',
    reward: { type: 'credits', amount: 20, badge: '视频先驱' }
  }
];

export default OnboardingManager;
