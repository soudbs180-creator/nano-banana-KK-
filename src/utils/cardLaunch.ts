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

export interface CardLaunchTimelineConfig {
  startX: number;
  startY: number;
  midX: number;
  midY: number;
  settleX: number;
  settleY: number;
  startScale: number;
  midScale: number;
  settleScale: number;
  fadeInDuration: number;
  travelDuration: number;
  settleDuration: number;
}

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const STACK_RESET_WINDOW_MS = 420;
const STACK_PATTERN: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: -4 },
  { x: -12, y: -1 },
  { x: 12, y: 1 },
  { x: -20, y: 3 },
  { x: 20, y: 5 },
  { x: -28, y: 7 },
  { x: 28, y: 9 },
];

let launchDeckCursor = 0;
let lastLaunchAt = 0;

const nextStackOffset = (): { x: number; y: number } => {
  const now = Date.now();
  if (now - lastLaunchAt > STACK_RESET_WINDOW_MS) {
    launchDeckCursor = 0;
  }
  lastLaunchAt = now;

  const offset = STACK_PATTERN[launchDeckCursor % STACK_PATTERN.length];
  launchDeckCursor += 1;
  return offset;
};

const resolvePromptInputRect = (promptBar: HTMLElement): RectLike | null => {
  const textarea =
    promptBar.querySelector<HTMLTextAreaElement>('textarea.input-bar-textarea')
    || promptBar.querySelector<HTMLTextAreaElement>('textarea');

  if (!textarea) return null;
  return textarea.getBoundingClientRect();
};

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

  const promptRect = resolvePromptInputRect(promptBar) || promptBar.getBoundingClientRect();
  const stackOffset = nextStackOffset();
  const centerPoint: CardLaunchPoint = {
    x: promptRect.left + promptRect.width / 2 + stackOffset.x,
    y: promptRect.top + promptRect.height / 2 + stackOffset.y,
  };

  if (anchor === 'center') {
    return centerPoint;
  }

  return {
    x: centerPoint.x,
    y: Math.max(24, promptRect.top - safeGap + stackOffset.y),
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

export const getLaunchTimelineByOffset = (
  offsetX: number,
  offsetY: number,
  canvasScale: number = 1,
): CardLaunchTimelineConfig => {
  const launchMotion = getLaunchMotionByCanvasScale(canvasScale);
  const driftSign = offsetX >= 0 ? 1 : -1;
  const lift = Math.min(96, Math.max(28, Math.abs(offsetY) * 0.2 + 14));
  const horizontalDrift = driftSign * Math.min(44, Math.max(12, Math.abs(offsetX) * 0.11));
  const midScale = launchMotion.fromScale < 1
    ? Math.min(1.08, launchMotion.fromScale + 0.22)
    : Math.max(1.02, launchMotion.fromScale - 0.06);
  const baseDuration = launchMotion.duration;

  return {
    startX: offsetX,
    startY: offsetY,
    midX: offsetX * 0.38 + horizontalDrift,
    midY: offsetY * 0.45 - lift,
    settleX: driftSign * -8,
    settleY: 6,
    startScale: launchMotion.fromScale,
    midScale,
    settleScale: 1.02,
    fadeInDuration: Math.min(0.16, baseDuration * 0.26),
    travelDuration: Math.max(0.28, baseDuration * 0.52),
    settleDuration: Math.max(0.18, baseDuration * 0.32),
  };
};
