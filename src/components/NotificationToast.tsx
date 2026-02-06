import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Copy, Check } from 'lucide-react';
import { notificationService, Notification, NotificationType } from '../services/notificationService';

const NotificationToast: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const leaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Initial load
        setNotifications(notificationService.getAll());

        // Subscribe to changes
        const unsubscribe = notificationService.subscribe(setNotifications);
        return unsubscribe;
    }, []);

    const handleCopyDetails = async (notification: Notification) => {
        const text = `[${notification.type.toUpperCase()}] ${notification.title}\n${notification.message}${notification.details ? '\n\nDetails: ' + notification.details : ''}`;
        await navigator.clipboard.writeText(text);
        setCopiedId(notification.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const getIcon = (type: NotificationType) => {
        const iconStyle = { color: getIconColor(type) };
        switch (type) {
            case 'success': return <CheckCircle size={18} style={iconStyle} />;
            case 'error': return <AlertCircle size={18} style={iconStyle} />;
            case 'warning': return <AlertTriangle size={18} style={iconStyle} />;
            case 'info': return <Info size={18} style={iconStyle} />;
        }
    };

    const getIconColor = (type: NotificationType): string => {
        switch (type) {
            case 'success': return 'var(--accent-green)';
            case 'error': return 'var(--accent-red)';
            case 'warning': return 'var(--accent-gold)';
            case 'info': return 'var(--accent-blue)';
        }
    };

    const getStyles = (type: NotificationType) => {
        switch (type) {
            case 'success': return { borderColor: 'rgba(34, 197, 94, 0.3)', backgroundColor: 'rgba(34, 197, 94, 0.1)' };
            case 'error': return { borderColor: 'rgba(220, 38, 38, 0.3)', backgroundColor: 'rgba(220, 38, 38, 0.1)' };
            case 'warning': return { borderColor: 'rgba(217, 119, 6, 0.3)', backgroundColor: 'rgba(217, 119, 6, 0.1)' };
            case 'info': return { borderColor: 'rgba(37, 99, 235, 0.3)', backgroundColor: 'rgba(37, 99, 235, 0.1)' };
        }
    };

    const sortedNotifications = [...notifications].sort((a, b) => {
        const score = (t: string) => t === 'error' ? 3 : t === 'warning' ? 2 : 1;
        return score(a.type) - score(b.type) || a.timestamp - b.timestamp;
    });

    // Force explicit theme detection for inline styles
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        const checkTheme = () => {
            const isDark = document.body.classList.contains('dark-mode') || document.documentElement.className.includes('dark');
            setIsDarkMode(isDark);
        };

        checkTheme();
        const observer = new MutationObserver(checkTheme);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        return () => observer.disconnect();
    }, []);

    return (
        <>
            {/* 统一通知消息 - 左下角（滑块上方） */}
            {sortedNotifications.length > 0 && (
                <div
                    className="fixed z-[99999] flex gap-3 pointer-events-none w-full max-w-[400px]
                    /* Mobile: Top Centered / Full Width */
                    top-[max(16px,env(safe-area-inset-top))] left-4 right-4 bottom-auto flex-col
                    /* Desktop: Bottom Left, Above Slider (留出180px给滑块+版本号) */
                    md:top-auto md:bottom-20 md:left-4 md:right-auto md:flex-col-reverse"
                >
                    <div
                        className="flex gap-3 flex-col md:flex-col-reverse pointer-events-auto"
                        onMouseEnter={() => setIsExpanded(true)}
                        onMouseLeave={() => setIsExpanded(false)}
                    >
                        {sortedNotifications.map((notification, index) => {
                            const isTop = index === sortedNotifications.length - 1;
                            const isCollapsed = !isExpanded && !isTop;

                            // Inline styles to guarantee contrast regardless of CSS conflicts
                            const textColor = isDarkMode ? '#FFFFFF' : '#000000';
                            const secondaryColor = isDarkMode ? '#d4d4d8' : '#3f3f46';
                            const mutedColor = isDarkMode ? '#a1a1aa' : '#52525b';

                            const styles = getStyles(notification.type);
                            return (
                                <div
                                    key={notification.id}
                                    className={`backdrop-blur-xl border shadow-xl 
                                        animate-slide-in-right
                                        transition-all ease-out
                                        ${isCollapsed ? '-mb-20 scale-[0.95] opacity-85 pointer-events-none' : 'mb-2 scale-100 opacity-100'}
                                        ${isTop && !isExpanded ? '!mb-0 !opacity-100 !scale-100 pointer-events-auto' : ''}
                                        hover:!scale-[1.02] brightness-100
                                    `}
                                    style={{
                                        borderRadius: 'var(--radius-md)', // 8px
                                        borderColor: styles.borderColor,
                                        backgroundColor: styles.backgroundColor,
                                        boxShadow: 'var(--shadow-xl)',
                                        transitionDuration: 'var(--duration-normal)'
                                    }}
                                >
                                    <div className="flex items-start p-4 gap-3 bg-gradient-to-b from-white/5 to-transparent">
                                        <div className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 mt-0.5 shadow-inner`}>
                                            {getIcon(notification.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div
                                                className="font-bold text-sm leading-snug tracking-wide"
                                                style={{ color: textColor }}
                                            >
                                                {notification.title}
                                            </div>
                                            <div
                                                className="text-xs mt-1.5 leading-relaxed break-words font-medium opacity-90"
                                                style={{ color: secondaryColor }}
                                            >
                                                {notification.message}
                                            </div>
                                            {notification.details && (
                                                <div
                                                    className="mt-2 text-[10px] font-mono bg-black/5 dark:bg-black/40 rounded p-2 overflow-hidden line-clamp-3 border border-black/5 dark:border-white/5"
                                                    style={{ color: mutedColor }}
                                                >
                                                    {notification.details}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-1 shrink-0">
                                            <button
                                                onClick={() => notificationService.dismiss(notification.id)}
                                                className="p-1.5 transition-all active:scale-95"
                                                style={{
                                                    color: mutedColor,
                                                    borderRadius: 'var(--radius-sm)',
                                                    transitionDuration: 'var(--duration-fast)'
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                            >
                                                <X size={14} />
                                            </button>
                                            {notification.details && (
                                                <button
                                                    onClick={() => handleCopyDetails(notification)}
                                                    className="p-1.5 transition-all active:scale-95"
                                                    style={{
                                                        color: mutedColor,
                                                        borderRadius: 'var(--radius-sm)',
                                                        transitionDuration: 'var(--duration-fast)'
                                                    }}
                                                    title="复制详细信息"
                                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                                >
                                                    {copiedId === notification.id ?
                                                        <Check size={14} style={{ color: 'var(--accent-green)' }} /> :
                                                        <Copy size={14} />
                                                    }
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
};

export default NotificationToast;
