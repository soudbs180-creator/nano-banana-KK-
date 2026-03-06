import React from 'react';
import { LayoutDashboard, Menu, Settings, User, Zap } from 'lucide-react';

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
    title = 'KK Studio',
}) => {
    const iconButtonClass = 'h-11 w-11 rounded-2xl flex items-center justify-center transition-all active:scale-95 hover:bg-white/10';

    return (
        <div className="fixed top-0 left-0 right-0 z-[980] px-3 pt-[env(safe-area-inset-top)] md:hidden">
            <div
                className="ios-mobile-header-glass flex h-[var(--mobile-header-height)] items-center justify-between rounded-[22px] px-2"
                style={{ borderColor: 'rgba(255,255,255,0.18)' }}
            >
                <div className="flex min-w-0 items-center gap-1">
                    <button
                        onClick={onMenuClick}
                        aria-label="打开侧边栏"
                        className={`${iconButtonClass} text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}
                    >
                        <Menu size={20} strokeWidth={2.15} />
                    </button>

                    <div className="flex min-w-0 items-center gap-2 pl-1">
                        <div className="h-7 w-7 shrink-0 rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 shadow-lg shadow-indigo-500/25 flex items-center justify-center">
                            <span className="text-[10px] font-black leading-none tracking-wide text-white">KK</span>
                        </div>
                        <span className="truncate text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
                            {title}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-0.5">
                    <button
                        onClick={onDashboardClick}
                        aria-label="打开仪表盘"
                        className={`${iconButtonClass} text-[var(--text-tertiary)] hover:text-[var(--text-primary)]`}
                    >
                        <LayoutDashboard size={19} strokeWidth={2.1} />
                    </button>
                    <button
                        onClick={onSettingsClick}
                        aria-label="打开设置"
                        className={`${iconButtonClass} text-[var(--text-tertiary)] hover:text-[var(--text-primary)]`}
                    >
                        <Settings size={19} strokeWidth={2.1} />
                    </button>
                    <button
                        onClick={onBillingClick}
                        aria-label="打开账户管理"
                        className={`${iconButtonClass} text-amber-400 hover:text-amber-300`}
                        title="账户管理"
                    >
                        <Zap size={19} strokeWidth={2.1} fill="currentColor" />
                    </button>
                    <button
                        onClick={onUserClick}
                        aria-label="打开个人中心"
                        className={`${iconButtonClass} text-[var(--text-tertiary)] hover:text-[var(--text-primary)]`}
                    >
                        <User size={19} strokeWidth={2.1} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileHeader;
