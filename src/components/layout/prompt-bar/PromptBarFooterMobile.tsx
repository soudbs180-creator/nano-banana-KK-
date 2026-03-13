import React from 'react';

interface PromptBarFooterMobileProps {
  children: React.ReactNode;
}

const PromptBarFooterMobile: React.FC<PromptBarFooterMobileProps> = ({ children }) => {
  return (
    <div className="input-bar-footer flex w-full flex-wrap items-center gap-2 px-1 pb-1 pt-0.5 min-h-[44px]">
      {children}
    </div>
  );
};

export default PromptBarFooterMobile;
