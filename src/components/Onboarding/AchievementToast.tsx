/**
 * 成就提示
 * 完成任务时显示奖励
 */

import React, { useEffect, useState } from 'react';
import { Trophy, Star, X, Sparkles } from 'lucide-react';

interface AchievementToastProps {
  achievement: string;
  onClose: () => void;
}

export const AchievementToast: React.FC<AchievementToastProps> = ({
  achievement,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    
    // 5秒后自动关闭
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`achievement-toast ${isVisible ? 'visible' : ''}`}>
      <div className="achievement-glow" />
      
      <div className="achievement-icon">
        <Trophy className="w-6 h-6" />
      </div>
      
      <div className="achievement-content">
        <div className="achievement-label">
          <Sparkles className="w-3 h-3" />
          <span>获得成就</span>
        </div>
        <h4 className="achievement-name">{achievement}</h4>
      </div>
      
      <button className="achievement-close" onClick={onClose}>
        <X className="w-4 h-4" />
      </button>
      
      {/* 装饰粒子 */}
      <div className="confetti">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`confetti-piece piece-${i}`} />
        ))}
      </div>
    </div>
  );
};
