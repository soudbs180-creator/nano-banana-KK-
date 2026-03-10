import React from 'react';

interface PromptBarTopRowDesktopProps {
  children: React.ReactNode;
}

const PromptBarTopRowDesktop: React.FC<PromptBarTopRowDesktopProps> = ({ children }) => {
  return (
    <div className="flex items-center justify-between mb-2 gap-2">
      {children}
    </div>
  );
};

export default PromptBarTopRowDesktop;
