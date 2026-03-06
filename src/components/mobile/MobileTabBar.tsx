import React from 'react';
import { Image as ImageIcon, Music, Settings, Sparkles, User, Video } from 'lucide-react';
import { GenerationMode } from '../../types';

interface MobileTabBarProps {
    onSetMode: (mode: GenerationMode) => void;
    onOpenSettings: () => void;
    onOpenProfile: () => void;
    onToggleChat?: () => void;
    currentMode: GenerationMode;
    currentView: 'gallery' | 'home' | 'settings' | 'profile' | 'chat';
    isVisible?: boolean;
    onInteract?: () => void;
}

const MobileTabBar: React.FC<MobileTabBarProps> = ({
    onSetMode,
    onOpenSettings,
    onOpenProfile,
    onToggleChat,
    currentMode,
    currentView,
    isVisible = true,
    onInteract,
}) => {
    const modeTabActive = (mode: GenerationMode) => {
        if (currentView === 'settings' || currentView === 'profile' || currentView === 'chat') {
            return false;
        }
        return currentMode === mode;
    };

    const tabs = [
        {
            key: 'settings',
            label: '设置',
            active: currentView === 'settings',
            onClick: onOpenSettings,
            icon: <Settings size={20} strokeWidth={2.15} />,
        },
        {
            key: 'image',
            label: '图片',
            active: modeTabActive(GenerationMode.IMAGE),
            onClick: () => onSetMode(GenerationMode.IMAGE),
            icon: <ImageIcon size={20} strokeWidth={2.15} />,
        },
        {
            key: 'chat',
            label: '助手',
            active: currentView === 'chat',
            onClick: () => onToggleChat?.(),
            icon: <Sparkles size={20} strokeWidth={2.15} />,
        },
        {
            key: 'video',
            label: '视频',
            active: modeTabActive(GenerationMode.VIDEO),
            onClick: () => onSetMode(GenerationMode.VIDEO),
            icon: <Video size={20} strokeWidth={2.15} />,
        },
        {
            key: 'audio',
            label: '音频',
            active: modeTabActive(GenerationMode.AUDIO),
            onClick: () => onSetMode(GenerationMode.AUDIO),
            icon: <Music size={20} strokeWidth={2.15} />,
        },
        {
            key: 'profile',
            label: '我的',
            active: currentView === 'profile',
            onClick: onOpenProfile,
            icon: <User size={20} strokeWidth={2.15} />,
        },
    ];

    return (
        <div
            className={`fixed bottom-0 left-0 right-0 z-[940] md:hidden transition-transform duration-300 ease-out ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-[140%] opacity-0'}`}
            style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))' }}
            onTouchStart={onInteract}
            onClick={onInteract}
        >
            <div id="mobile-tab-bar" className="ios-mobile-tabbar-shell mx-3 px-2 py-1.5">
                <div className="grid grid-cols-6 gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={tab.onClick}
                            aria-label={tab.label}
                            className={`ios-mobile-tab-button flex flex-col items-center justify-center px-1 py-1 ${tab.active ? 'is-active' : ''}`}
                            style={{ color: tab.active ? '#ffffff' : 'var(--text-tertiary)' }}
                        >
                            {tab.icon}
                            <span className="ios-mobile-tab-label">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MobileTabBar;
