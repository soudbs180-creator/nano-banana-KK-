export interface CardLaunchPoint {
  x: number;
  y: number;
}

export type CardLaunchAnchor = 'center' | 'top';

export interface CardLaunchMotionConfig {
  fromScale: number;
  duration: number;
  ease: string;
}

/**
 * 计算新卡片的屏幕发牌起点：
 * - X：输入框中线（水平居中）
 * - Y：输入框上沿之外（整卡不与输入框重叠）
 */
export const getPromptBarLaunchPoint = (
  safeGap: number = 14,
  anchor: CardLaunchAnchor = 'top',
): CardLaunchPoint => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { x: 0, y: 0 };
  }

  const fallback: CardLaunchPoint = {
    x: window.innerWidth / 2,
    y: window.innerHeight - 120,
  };

  const promptBar = document.getElementById('prompt-bar-container');
  if (!promptBar) return fallback;

  const rect = promptBar.getBoundingClientRect();
  const centerPoint: CardLaunchPoint = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };

  if (anchor === 'center') {
    return centerPoint;
  }

  return {
    x: centerPoint.x,
    y: Math.max(24, rect.top - safeGap),
  };
};

/**
 * 根据画布缩放比例返回发牌缩放动画参数
 * - 缩放 <= 1: 从小到大
 * - 缩放 > 1: 从大到小
 */
export const getLaunchMotionByCanvasScale = (canvasScale: number = 1): CardLaunchMotionConfig => {
  const scale = Number.isFinite(canvasScale) ? canvasScale : 1;

  if (scale > 1.1) {
    return {
      fromScale: Math.min(1.35, Math.max(1.05, 1 + (scale - 1) * 0.35)),
      duration: 0.58,
      ease: 'power2.out',
    };
  }

  return {
    fromScale: Math.min(0.55, Math.max(0.3, 0.22 + scale * 0.26)),
    duration: 0.68,
    ease: 'power3.out',
  };
};
