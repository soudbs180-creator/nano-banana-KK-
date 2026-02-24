import React from 'react';
import { Menu, Settings, User, LayoutDashboard, Search } from 'lucide-react';

interface MobileHeaderProps {
    onMenuClick: () => void;
    onDashboardClick: () => void;
    onSettingsClick: () => void;
    onUserClick: () => void;
    title?: string;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({
    onMenuClick,
    onDashboardClick,
    onSettingsClick,
    onUserClick,
    title = 'KK Studio'
}) => {
    return (
        <div
            className="fixed top-0 left-0 right-0 h-14 z-[90] flex items-center justify-between px-3"
            style={{
                background: 'rgba(25, 25, 25, 0.75)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                paddingTop: 'env(safe-area-inset-top)'
            }}
        >
            <div className="flex items-center gap-1">
                <button
                    onClick={onMenuClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:scale-95 transition-all"
                >
                    <Menu size={22} />
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
                        <span className="text-white text-xs font-bold leading-none">KK</span>
                    </div>
                    <span className="font-semibold text-[var(--text-primary)] tracking-tight text-base font-display">
                        {title}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={onDashboardClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:scale-95 transition-all"
                >
                    <LayoutDashboard size={20} />
                </button>
                <button
                    onClick={onSettingsClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:scale-95 transition-all"
                >
                    <Settings size={20} />
                </button>
                <button
                    onClick={onUserClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:scale-95 transition-all"
                >
                    <User size={20} />
                </button>
            </div>
        </div>
    );
};

export default MobileHeader;
