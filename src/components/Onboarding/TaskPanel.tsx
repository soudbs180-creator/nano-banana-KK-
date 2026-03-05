/**
 * 任务面板
 * 显示所有任务和进度
 */

import React, { useState } from 'react';
import { X, Check, Lock, Gift, ChevronRight, Trophy, Star } from 'lucide-react';
import { OnboardingProgress, OnboardingTask, OnboardingPhase } from './types';
import { 
  TASKS_WELCOME, 
  TASKS_BASICS, 
  TASKS_INTERMEDIATE, 
  TASKS_ADVANCED 
} from './OnboardingManager';

interface TaskPanelProps {
  progress: OnboardingProgress;
  onClose: () => void;
  onTaskClick: (task: OnboardingTask) => void;
}

const PHASE_NAMES: Record<OnboardingPhase, string> = {
  welcome: '欢迎',
  basics: '基础',
  intermediate: '进阶',
  advanced: '高级',
  complete: '完成'
};

const PHASE_COLORS: Record<OnboardingPhase, string> = {
  welcome: 'text-indigo-400',
  basics: 'text-blue-400',
  intermediate: 'text-amber-400',
  advanced: 'text-purple-400',
  complete: 'text-green-400'
};

export const TaskPanel: React.FC<TaskPanelProps> = ({
  progress,
  onClose,
  onTaskClick
}) => {
  const [activePhase, setActivePhase] = useState<OnboardingPhase>('basics');
  
  const allTasks = [
    ...TASKS_WELCOME,
    ...TASKS_BASICS,
    ...TASKS_INTERMEDIATE,
    ...TASKS_ADVANCED
  ];

  const completedCount = progress.completedTasks.length;
  const totalCount = allTasks.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  const getTasksForPhase = (phase: OnboardingPhase) => {
    return allTasks.filter(t => t.phase === phase);
  };

  const isTaskCompleted = (taskId: string) => 
    progress.completedTasks.includes(taskId);

  const isTaskLocked = (task: OnboardingTask) => {
    const phaseOrder: OnboardingPhase[] = ['welcome', 'basics', 'intermediate', 'advanced'];
    const taskPhaseIndex = phaseOrder.indexOf(task.phase);
    const currentPhaseIndex = phaseOrder.indexOf(progress.currentPhase);
    return taskPhaseIndex > currentPhaseIndex;
  };

  return (
    <div className="task-panel-overlay" onClick={onClose}>
      <div className="task-panel" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="task-panel-header">
          <div className="header-title">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2>新手任务</h2>
            <span className="progress-badge">{completedCount}/{totalCount}</span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 进度概览 */}
        <div className="progress-overview">
          <div className="progress-ring">
            <svg viewBox="0 0 100 100">
              <circle className="ring-bg" cx="50" cy="50" r="45" />
              <circle 
                className="ring-progress"
                cx="50" 
                cy="50" 
                r="45"
                style={{
                  strokeDasharray: `${progressPercent * 2.83} 283`
                }}
              />
            </svg>
            <div className="progress-text">
              <span className="percent">{progressPercent}%</span>
              <span className="label">完成度</span>
            </div>
          </div>
          
          <div className="progress-stats">
            <div className="stat">
              <Gift className="w-4 h-4" />
              <span>已获得奖励</span>
              <strong>{progress.rewardsClaimed.length}</strong>
            </div>
            <div className="stat">
              <Star className="w-4 h-4" />
              <span>获得积分</span>
              <strong>{calculateTotalCredits(allTasks, progress)}</strong>
            </div>
          </div>
        </div>

        {/* 阶段标签 */}
        <div className="phase-tabs">
          {(['welcome', 'basics', 'intermediate', 'advanced'] as OnboardingPhase[]).map(phase => {
            const phaseTasks = getTasksForPhase(phase);
            const completedInPhase = phaseTasks.filter(t => 
              isTaskCompleted(t.id)
            ).length;
            
            return (
              <button
                key={phase}
                className={`phase-tab ${activePhase === phase ? 'active' : ''}`}
                onClick={() => setActivePhase(phase)}
              >
                <span className={PHASE_COLORS[phase]}>{PHASE_NAMES[phase]}</span>
                <span className="tab-progress">
                  {completedInPhase}/{phaseTasks.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* 任务列表 */}
        <div className="task-list">
          {getTasksForPhase(activePhase).map((task, idx) => {
            const completed = isTaskCompleted(task.id);
            const locked = isTaskLocked(task);
            
            return (
              <div
                key={task.id}
                className={`task-item ${completed ? 'completed' : ''} ${locked ? 'locked' : ''}`}
                style={{ animationDelay: `${idx * 0.05}s` }}
                onClick={() => !locked && onTaskClick(task)}
              >
                <div className="task-status">
                  {completed ? (
                    <div className="status-icon completed">
                      <Check className="w-4 h-4" />
                    </div>
                  ) : locked ? (
                    <div className="status-icon locked">
                      <Lock className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="status-icon pending">
                      <div className="pending-dot" />
                    </div>
                  )}
                </div>
                
                <div className="task-info">
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                  {task.hint && !completed && !locked && (
                    <span className="task-hint">💡 {task.hint}</span>
                  )}
                </div>
                
                {task.reward && (
                  <div className="task-reward">
                    {task.reward.amount && (
                      <span className="reward-credits">+{task.reward.amount}</span>
                    )}
                    {task.reward.badge && completed && (
                      <span className="reward-badge" title={task.reward.badge}>🏅</span>
                    )}
                  </div>
                )}
                
                {!locked && <ChevronRight className="w-4 h-4 text-gray-500" />}
              </div>
            );
          })}
        </div>

        {/* 底部提示 */}
        <div className="panel-footer">
          <p>完成任务可获得积分奖励和成就徽章</p>
        </div>
      </div>
    </div>
  );
};

function calculateTotalCredits(tasks: OnboardingTask[], progress: OnboardingProgress): number {
  return tasks
    .filter(t => progress.completedTasks.includes(t.id))
    .reduce((sum, t) => sum + (t.reward?.amount || 0), 0);
}
