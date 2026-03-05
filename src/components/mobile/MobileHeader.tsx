import React from 'react';
import { Menu, Settings, User, LayoutDashboard, Zap } from 'lucide-react';

interface MobileHeaderProps {
    onMenuClick: () => void;
    onDashboardClick: () => void;
    onSettingsClick: () => void;
    onUserClick: () => void;
    onBillingClick: () => void;
    title?: string;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({
    onMenuClick,
    onDashboardClick,
    onSettingsClick,
    onUserClick,
    onBillingClick,
    title = 'KK Studio'
}) => {
    return (
        <div
            className="fixed top-0 left-0 right-0 h-14 z-[90] flex items-center justify-between px-2 md:hidden"
            style={{
                background: 'rgba(20, 20, 23, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                paddingTop: 'env(safe-area-inset-top)'
            }}
        >
            <div className="flex items-center gap-2">
                <button
                    onClick={onMenuClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:scale-95 transition-all rounded-lg"
                >
                    <Menu size={22} strokeWidth={2} />
                </button>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0 flex items-center justify-center shadow-md shadow-indigo-500/20">
                        <span className="text-white text-xs font-bold leading-none">KK</span>
                    </div>
                    <span className="font-semibold text-[var(--text-primary)] tracking-tight text-lg font-display truncate">
                        {title}
                    </span>
                </div>
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={onDashboardClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:scale-95 transition-all rounded-lg"
                >
                    <LayoutDashboard size={22} strokeWidth={2} />
                </button>
                <button
                    onClick={onSettingsClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:scale-95 transition-all rounded-lg"
                >
                    <Settings size={22} strokeWidth={2} />
                </button>
                <button
                    onClick={onBillingClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-amber-500 hover:text-amber-400 active:scale-95 transition-all rounded-lg"
                    title="账户管理"
                >
                    <Zap size={22} strokeWidth={2} fill="currentColor" />
                </button>
                <button
                    onClick={onUserClick}
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] active:scale-95 transition-all rounded-lg"
                >
                    <User size={22} strokeWidth={2} />
                </button>
            </div>
        </div>
    );
};

export default MobileHeader;
