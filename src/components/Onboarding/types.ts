/**
 * 新人引导类型定义
 */

export type OnboardingPhase = 'welcome' | 'basics' | 'intermediate' | 'advanced' | 'complete';
export type TaskType = 'info' | 'interactive' | 'action';
export type RewardType = 'credits' | 'badge' | 'both';

export interface TaskReward {
  type: RewardType;
  amount?: number;
  badge?: string;
}

export interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  phase: OnboardingPhase;
  targetElement?: string;
  hint?: string;
  validate?: (state: any) => boolean;
  reward?: TaskReward;
  skippable?: boolean;
}

export interface OnboardingProgress {
  userId?: string;
  currentPhase: OnboardingPhase;
  completedTasks: string[];
  totalTasks: number;
  completed: boolean;
  skipped: boolean;
  lastActiveAt: number;
  rewardsClaimed: string[];
}

export interface OnboardingContextType {
  progress: OnboardingProgress;
  currentPhase: OnboardingPhase;
  isActive: boolean;
  startOnboarding: () => void;
  nextPhase: () => void;
  skipOnboarding: () => void;
  completeTask: (taskId: string) => void;
  openTaskPanel: () => void;
  closeTaskPanel: () => void;
}

export interface TooltipData {
  id: string;
  targetElement: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  trigger: 'hover' | 'click' | 'auto';
  delay?: number;
  showOnce?: boolean;
}
