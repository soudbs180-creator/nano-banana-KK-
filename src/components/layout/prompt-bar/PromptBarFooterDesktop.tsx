import React from 'react';

interface PromptBarFooterDesktopProps {
  children: React.ReactNode;
}

const PromptBarFooterDesktop: React.FC<PromptBarFooterDesktopProps> = ({ children }) => {
  return (
    <div className="input-bar-footer flex w-full items-start gap-1.5 px-1 pb-1 pt-0.5 min-h-[42px]">
      {children}
    </div>
  );
};

export default PromptBarFooterDesktop;
