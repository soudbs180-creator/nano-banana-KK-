import React, { type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';

type WorkspaceCardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ children, className = '', style }) => (
  <div className={`workspace-surface-card ${className}`.trim()} style={style}>
    {children}
  </div>
);

type WorkspaceActionBarProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export const WorkspaceActionBar: React.FC<WorkspaceActionBarProps> = ({ children, className = '', style }) => (
  <WorkspaceCard className={`workspace-action-bar ${className}`.trim()} style={style}>
    {children}
  </WorkspaceCard>
);

type WorkspaceActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export const WorkspaceActionButton: React.FC<WorkspaceActionButtonProps> = ({
  active = false,
  className = '',
  children,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    aria-pressed={active || undefined}
    {...props}
    className={`workspace-action-button ${active ? 'is-active' : ''} ${className}`.trim()}
  >
    {children}
  </button>
);

type WorkspaceSheetHeaderProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
};

export const WorkspaceSheetHeader: React.FC<WorkspaceSheetHeaderProps> = ({
  title,
  description,
  eyebrow,
  actions,
}) => (
  <div className="workspace-sheet-header">
    <div className="min-w-0 flex-1">
      {eyebrow ? <div className="workspace-sheet-eyebrow">{eyebrow}</div> : null}
      <div className="workspace-sheet-title">{title}</div>
      {description ? <p className="workspace-sheet-description">{description}</p> : null}
    </div>
    {actions ? <div className="workspace-sheet-actions">{actions}</div> : null}
  </div>
);
