import React from 'react';
import PromptBarTopRowMobile from './PromptBarTopRowMobile';
import PromptBarTopRowDesktop from './PromptBarTopRowDesktop';

interface PromptBarTopRowProps {
  isMobile: boolean;
  children: React.ReactNode;
}

const PromptBarTopRow: React.FC<PromptBarTopRowProps> = ({ isMobile, children }) => {
  if (isMobile) {
    return <PromptBarTopRowMobile>{children}</PromptBarTopRowMobile>;
  }

  return <PromptBarTopRowDesktop>{children}</PromptBarTopRowDesktop>;
};

export default PromptBarTopRow;
