/**
 * 新人引导进度管理 Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { OnboardingProgress, OnboardingPhase } from './types';

const STORAGE_KEY = 'kk_studio_onboarding_progress';

const DEFAULT_PROGRESS: OnboardingProgress = {
  currentPhase: 'welcome',
  completedTasks: [],
  totalTasks: 14, // 总任务数
  completed: false,
  skipped: false,
  lastActiveAt: Date.now(),
  rewardsClaimed: []
};

export function useOnboardingProgress() {
  const [progress, setProgress] = useState<OnboardingProgress>(DEFAULT_PROGRESS);
  const [isLoaded, setIsLoaded] = useState(false);

  // 从 localStorage 加载进度
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setProgress({ ...DEFAULT_PROGRESS, ...parsed });
      }
    } catch (e) {
      console.error('Failed to load onboarding progress:', e);
    }
    setIsLoaded(true);
  }, []);

  // 保存进度到 localStorage
  const saveProgress = useCallback((newProgress: OnboardingProgress) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProgress));
    } catch (e) {
      console.error('Failed to save onboarding progress:', e);
    }
  }, []);

  // 更新进度
  const updateProgress = useCallback((updates: Partial<OnboardingProgress>) => {
    setProgress(prev => {
      const newProgress = { ...prev, ...updates, lastActiveAt: Date.now() };
      saveProgress(newProgress);
      return newProgress;
    });
  }, [saveProgress]);

  // 完成任务
  const completeTask = useCallback((taskId: string) => {
    setProgress(prev => {
      if (prev.completedTasks.includes(taskId)) return prev;
      
      const newCompletedTasks = [...prev.completedTasks, taskId];
      const newProgress = {
        ...prev,
        completedTasks: newCompletedTasks,
        completed: newCompletedTasks.length >= prev.totalTasks,
        lastActiveAt: Date.now()
      };
      saveProgress(newProgress);
      return newProgress;
    });
  }, [saveProgress]);

  // 跳过引导
  const skipOnboarding = useCallback(() => {
    updateProgress({ skipped: true, completed: false });
  }, [updateProgress]);

  // 重置进度
  const resetProgress = useCallback(() => {
    const reset = { ...DEFAULT_PROGRESS, lastActiveAt: Date.now() };
    setProgress(reset);
    saveProgress(reset);
  }, [saveProgress]);

  // 领取奖励
  const claimReward = useCallback((taskId: string) => {
    setProgress(prev => {
      if (prev.rewardsClaimed.includes(taskId)) return prev;
      
      const newProgress = {
        ...prev,
        rewardsClaimed: [...prev.rewardsClaimed, taskId]
      };
      saveProgress(newProgress);
      return newProgress;
    });
  }, [saveProgress]);

  // 获取阶段进度百分比
  const getPhaseProgress = useCallback((phase: OnboardingPhase): number => {
    const phaseTasks = getTasksByPhase(phase);
    const completedInPhase = phaseTasks.filter(t => 
      progress.completedTasks.includes(t.id)
    ).length;
    return phaseTasks.length > 0 ? (completedInPhase / phaseTasks.length) * 100 : 0;
  }, [progress.completedTasks]);

  // 获取总体进度百分比
  const overallProgress = Math.round(
    (progress.completedTasks.length / progress.totalTasks) * 100
  );

  return {
    progress,
    isLoaded,
    overallProgress,
    updateProgress,
    completeTask,
    skipOnboarding,
    resetProgress,
    claimReward,
    getPhaseProgress
  };
}

// 辅助函数：获取阶段的任务
interface OnboardingTask {
  id: string;
  title: string;
  completed: boolean;
}

function getTasksByPhase(phase: OnboardingPhase): OnboardingTask[] {
  // 这里应该导入实际的任务列表
  // 简化处理
  return [];
}
