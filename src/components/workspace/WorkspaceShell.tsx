import React, { type MouseEventHandler, type ReactNode } from 'react';

interface WorkspaceShellProps {
  isMobile: boolean;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  onMouseMove?: MouseEventHandler<HTMLDivElement>;
  onMouseUp?: MouseEventHandler<HTMLDivElement>;
  chrome?: ReactNode;
  overlays?: ReactNode;
  canvasLayer?: ReactNode;
  bottomBar?: ReactNode;
  leftRail?: ReactNode;
  children?: ReactNode;
}

const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  isMobile,
  onMouseDown,
  onContextMenu,
  onMouseMove,
  onMouseUp,
  chrome,
  overlays,
  canvasLayer,
  bottomBar,
  leftRail,
  children,
}) => (
  <div
    id="canvas-container"
    className={`relative w-full overflow-hidden font-inter selection:bg-indigo-500/20 ${isMobile ? 'ios-mobile-shell' : ''}`}
    style={{
      backgroundColor: 'var(--bg-canvas)',
      height: isMobile ? '100dvh' : '100vh',
      minHeight: isMobile ? '100svh' : '100vh',
    }}
    onMouseDown={onMouseDown}
    onContextMenu={onContextMenu}
    onMouseMove={onMouseMove}
    onMouseUp={onMouseUp}
  >
    {chrome}
    {overlays}
    {canvasLayer}
    {children}
    {leftRail}
    {bottomBar}
  </div>
);

export default WorkspaceShell;
