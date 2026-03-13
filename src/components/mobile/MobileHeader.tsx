import React from 'react';
import { Menu, Sparkles } from 'lucide-react';

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
    userName?: string;
    userAvatarUrl?: string;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({
    onMenuClick,
    onUserClick,
    onBillingClick,
    onRechargeClick,
    balance,
    balanceLoading = false,
    title = 'KK Studio',
    userName = '\u7528\u6237',
    userAvatarUrl,
}) => {
    const iconButtonClass = 'h-10 w-10 rounded-2xl flex items-center justify-center transition-all active:scale-95 hover:bg-white/10';
    const handleRechargeClick = onRechargeClick ?? onBillingClick;
    const avatarFallback = userName?.trim()?.[0]?.toUpperCase() || 'U';
    const balanceDisplay = balanceLoading ? '...' : (typeof balance === 'number' ? balance : '--');

    return (
        <div className="fixed top-0 left-0 right-0 z-[980] px-3 pt-[env(safe-area-inset-top)] md:hidden">
            <div className="ios-mobile-header-glass ios-mobile-header-shell ios-mobile-header-shell--apple rounded-[26px]">
                <div className="ios-mobile-header-leading">
                    <button
                        type="button"
                        onClick={onUserClick}
                        aria-label="\u6253\u5f00\u4e2a\u4eba\u4e2d\u5fc3"
                        className="ios-mobile-header-profile"
                        title={userName}
                    >
                        <span className="ios-mobile-user-avatar ios-mobile-user-avatar--large">
                            {userAvatarUrl ? (
                                <img src={userAvatarUrl} alt={userName} className="h-full w-full object-cover" />
                            ) : (
                                <span>{avatarFallback}</span>
                            )}
                        </span>
                        <span className="ios-mobile-header-profile-copy">
                            <span className="ios-mobile-header-kicker">{title}</span>
                            <span className="ios-mobile-user-name ios-mobile-user-name--strong">{userName}</span>
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={onMenuClick}
                        aria-label="\u6253\u5f00\u529f\u80fd\u83dc\u5355"
                        className={`${iconButtonClass} ios-mobile-header-menu text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}
                    >
                        <Menu size={18} strokeWidth={2.15} />
                    </button>
                </div>

                <div className="ios-mobile-balance-group ios-mobile-balance-group--primary">
                    <div className="ios-mobile-balance-stat">
                        <Sparkles size={13} className="text-amber-300" />
                        <div className="min-w-0">
                            <div className="ios-mobile-balance-label">{'\u5269\u4f59\u79ef\u5206'}</div>
                            <div className="ios-mobile-balance-value">{balanceDisplay}</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleRechargeClick}
                        aria-label="\u5145\u503c\u79ef\u5206"
                        className="ios-mobile-balance-action"
                        disabled={!handleRechargeClick}
                    >
                        {'\u5145\u503c'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileHeader;
