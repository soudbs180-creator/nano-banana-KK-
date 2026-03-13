import React from 'react';
import { Images, MessageSquare, Sparkles, User } from 'lucide-react';
import { GenerationMode, type MobilePrimaryTab } from '../../types';

interface MobileTabBarProps {
  currentMode: GenerationMode;
  currentTab: MobilePrimaryTab;
  onSelectTab: (tab: MobilePrimaryTab) => void;
  isVisible?: boolean;
  onInteract?: () => void;
}

const modeLabelMap: Record<GenerationMode, string> = {
  [GenerationMode.IMAGE]: '\u56fe\u7247',
  [GenerationMode.VIDEO]: '\u89c6\u9891',
  [GenerationMode.AUDIO]: '\u97f3\u9891',
  [GenerationMode.PPT]: 'PPT',
  [GenerationMode.EDIT]: '\u7f16\u8f91',
  [GenerationMode.INPAINT]: '\u5c40\u90e8',
};

const MobileTabBar: React.FC<MobileTabBarProps> = ({
  currentMode,
  currentTab,
  onSelectTab,
  isVisible = true,
  onInteract,
}) => {
  const tabs: Array<{
    key: MobilePrimaryTab;
    label: string;
    caption?: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'create',
      label: '\u521b\u4f5c',
      caption: modeLabelMap[currentMode],
      icon: <Sparkles size={18} strokeWidth={2.1} />,
    },
    {
      key: 'library',
      label: '\u8d44\u6e90',
      icon: <Images size={18} strokeWidth={2.1} />,
    },
    {
      key: 'chat',
      label: '\u804a\u5929',
      icon: <MessageSquare size={18} strokeWidth={2.1} />,
    },
    {
      key: 'me',
      label: '\u6211\u7684',
      icon: <User size={18} strokeWidth={2.1} />,
    },
  ];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[940] transition-transform duration-300 ease-out md:hidden ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-[140%] opacity-0'}`}
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))' }}
      onTouchStart={onInteract}
      onClick={onInteract}
    >
      <div id="mobile-tab-bar" className="ios-mobile-tabbar-shell mx-3 px-2 py-1.5">
        <div className="grid grid-cols-4 gap-1.5">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(tab.key)}
                className={`ios-mobile-tab-button flex min-h-[54px] flex-col items-center justify-center gap-1 px-2 py-2 ${isActive ? 'is-active' : ''}`}
                style={{ color: isActive ? '#ffffff' : 'var(--text-tertiary)' }}
              >
                {tab.icon}
                <span className="ios-mobile-tab-label">{tab.label}</span>
                {tab.caption ? (
                  <span className={`ios-mobile-tab-caption text-[10px] leading-none ${isActive ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>
                    {tab.caption}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MobileTabBar;
