import React from 'react';
import PromptBarFooterMobile from './PromptBarFooterMobile';
import PromptBarFooterDesktop from './PromptBarFooterDesktop';

interface PromptBarFooterProps {
  isMobile: boolean;
  children: React.ReactNode;
}

const PromptBarFooter: React.FC<PromptBarFooterProps> = ({ isMobile, children }) => {
  if (isMobile) {
    return <PromptBarFooterMobile>{children}</PromptBarFooterMobile>;
  }

  return <PromptBarFooterDesktop>{children}</PromptBarFooterDesktop>;
};

export default PromptBarFooter;
