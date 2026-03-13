import React, { type ReactNode } from 'react';

interface GlobalModalsProps {
  overlays?: ReactNode;
  dialogs?: ReactNode;
  onboarding?: ReactNode;
  children?: ReactNode;
}

const GlobalModals: React.FC<GlobalModalsProps> = ({ overlays, dialogs, onboarding, children }) => (
  <>
    {overlays}
    {dialogs}
    {onboarding}
    {children}
  </>
);

export default GlobalModals;
