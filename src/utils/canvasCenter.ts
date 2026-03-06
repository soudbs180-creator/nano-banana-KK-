// Centralized viewport center utilities
import { getViewportPreferredPosition } from './canvasUtils'

// Simple typed alias for clarity
export type ViewportOffsets = { left: number; right: number };

const getPromptInputRect = (): DOMRect | null => {
  if (typeof document === 'undefined') return null;
  const promptBar = document.getElementById('prompt-bar-container');
  if (!promptBar) return null;

  const textarea =
    promptBar.querySelector<HTMLTextAreaElement>('textarea.input-bar-textarea') ||
    promptBar.querySelector<HTMLTextAreaElement>('textarea');

  return textarea?.getBoundingClientRect() || promptBar.getBoundingClientRect();
};

// Compute unified viewport offsets considering UI chrome (sidebar, chat, mobile)
export const getViewportOffsets = (
  isSidebarOpen: boolean,
  isChatOpen: boolean,
  isMobile: boolean,
  chatSidebarWidth: number = 420
): ViewportOffsets => {
  const left = isSidebarOpen && !isMobile ? 260 : (isMobile ? 0 : 60);
  const right = isChatOpen && !isMobile ? chatSidebarWidth : 0;
  return { left, right };
};

// Compute live viewport center using current transform and canvas rect
export const getLiveViewportCenter = (
  currentTransform: { x: number; y: number; scale: number },
  viewportRect: DOMRect | null,
  offsets: ViewportOffsets
): { x: number; y: number } => {
  // radius can be tuned; keep 180 as used previously
  return getViewportPreferredPosition(currentTransform, viewportRect, 180, offsets);
};

export const getPromptBarFrontPosition = (
  currentTransform: { x: number; y: number; scale: number },
  viewportRect: DOMRect | null,
  offsets: ViewportOffsets,
  cardHeight: number = 180,
  gap: number = 44
): { x: number; y: number } => {
  const rect = getPromptInputRect();
  if (!rect) {
    return getLiveViewportCenter(currentTransform, viewportRect, offsets);
  }

  const scale = currentTransform?.scale && currentTransform.scale > 0 ? currentTransform.scale : 1;
  const tx = Number.isFinite(currentTransform?.x) ? currentTransform.x : 0;
  const ty = Number.isFinite(currentTransform?.y) ? currentTransform.y : 0;

  const screenX = rect.left + rect.width / 2;
  const screenY = rect.top - gap + cardHeight / 2;

  return {
    x: Math.round((screenX - tx) / scale),
    y: Math.round((screenY - ty) / scale),
  };
};
