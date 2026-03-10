import React from 'react';

interface PromptBarTopRowMobileProps {
  children: React.ReactNode;
}

const PromptBarTopRowMobile: React.FC<PromptBarTopRowMobileProps> = ({ children }) => {
  return (
    <div className="mb-2 flex flex-col items-stretch gap-2">
      {children}
    </div>
  );
};

export default PromptBarTopRowMobile;
