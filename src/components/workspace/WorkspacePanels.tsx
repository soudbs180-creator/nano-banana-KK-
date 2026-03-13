import React, { type ReactNode } from 'react';
import type { AppSurface, WorkspacePanel } from '../../types';

interface WorkspacePanelsProps {
  activeSurface: AppSurface;
  activePanel: WorkspacePanel;
  chatSidebar?: ReactNode;
  libraryPanel?: ReactNode;
  auxiliaryPanels?: ReactNode;
}

const WorkspacePanels: React.FC<WorkspacePanelsProps> = ({
  activeSurface,
  activePanel,
  chatSidebar,
  libraryPanel,
  auxiliaryPanels,
}) => (
  <>
    {activePanel === 'chat' ? chatSidebar : null}
    {activeSurface === 'library' ? libraryPanel : null}
    {auxiliaryPanels}
  </>
);

export default WorkspacePanels;
