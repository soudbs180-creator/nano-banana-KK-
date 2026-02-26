// Centralized viewport center utilities
import { getViewportPreferredPosition } from './canvasUtils'

// Simple typed alias for clarity
export type ViewportOffsets = { left: number; right: number };

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
