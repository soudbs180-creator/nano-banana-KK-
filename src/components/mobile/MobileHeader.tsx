import React from 'react';
import { Menu, Sparkles, User } from 'lucide-react';

interface MobileHeaderProps {
    onMenuClick: () => void;
    onDashboardClick?: () => void;
    onSettingsClick?: () => void;
    onUserClick: () => void;
    onBillingClick?: () => void;
    onRechargeClick?: () => void;
    balance?: number;
    balanceLoading?: boolean;
    title?: string;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({
    onMenuClick,
    onUserClick,
    onRechargeClick,
    balance,
    balanceLoading = false,
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
                        aria-label="\u6253\u5f00\u529f\u80fd\u83dc\u5355"
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

                <div className="flex items-center gap-1">
                    <div
                        className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 border"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }}
                    >
                        <Sparkles size={13} className="text-amber-300" />
                        <span className="text-[12px] font-bold text-amber-300">{balanceLoading ? '...' : balance}</span>
                    </div>

                    <button
                        onClick={onRechargeClick}
                        aria-label="\u5145\u503c\u79ef\u5206"
                        className="h-9 rounded-xl px-2.5 text-[11px] font-semibold text-white transition-all active:scale-95"
                        style={{ backgroundColor: 'rgba(99, 102, 241, 0.92)' }}
                    >
                        {'\u5145\u503c'}
                    </button>

                    <button
                        onClick={onUserClick}
                        aria-label="\u6253\u5f00\u4e2a\u4eba\u4e2d\u5fc3"
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
