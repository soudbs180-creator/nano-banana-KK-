import React from 'react';

interface PromptBarFooterDesktopProps {
  children: React.ReactNode;
}

const PromptBarFooterDesktop: React.FC<PromptBarFooterDesktopProps> = ({ children }) => {
  return (
    <div className="input-bar-footer flex items-center gap-2 px-1 pb-1 pt-0.5 min-h-[44px] flex-nowrap justify-between">
      {children}
    </div>
  );
};

export default PromptBarFooterDesktop;
