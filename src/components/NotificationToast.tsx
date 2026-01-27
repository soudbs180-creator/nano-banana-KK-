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
        switch (type) {
            case 'success': return <CheckCircle size={18} className="text-green-400" />;
            case 'error': return <AlertCircle size={18} className="text-red-400" />;
            case 'warning': return <AlertTriangle size={18} className="text-yellow-400" />;
            case 'info': return <Info size={18} className="text-blue-400" />;
        }
    };

    const getStyles = (type: NotificationType) => {
        switch (type) {
            case 'success': return 'border-green-500/30 bg-green-500/10';
            case 'error': return 'border-red-500/30 bg-red-500/10';
            case 'warning': return 'border-yellow-500/30 bg-yellow-500/10';
            case 'info': return 'border-blue-500/30 bg-blue-500/10';
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
            {/* 统一通知消息 - 右下角弹出 (All Notifications) */}
            {sortedNotifications.length > 0 && (
                <div
                    className="fixed z-[9999] flex gap-3 pointer-events-none w-full max-w-[400px]
                    /* Mobile: Top Centered / Full Width */
                    top-4 left-4 right-4 bottom-auto flex-col
                    /* Desktop: Bottom Right */
                    md:top-auto md:bottom-36 md:right-6 md:left-auto md:flex-col-reverse"
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

                            return (
                                <div
                                    key={notification.id}
                                    className={`backdrop-blur-xl border rounded-2xl shadow-xl 
                                        animate-in slide-in-from-right-1/2 fade-in duration-300 zoom-in-95
                                        transition-all duration-300 ease-out
                                        ${isCollapsed ? '-mb-20 scale-[0.95] opacity-85 pointer-events-none' : 'mb-2 scale-100 opacity-100'}
                                        ${isTop && !isExpanded ? '!mb-0 !opacity-100 !scale-100 pointer-events-auto' : ''}
                                        hover:!scale-[1.02] hover:shadow-2xl brightness-100
                                        ${getStyles(notification.type)}`}
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
                                                className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                                                style={{ color: mutedColor }}
                                            >
                                                <X size={14} />
                                            </button>
                                            {notification.details && (
                                                <button
                                                    onClick={() => handleCopyDetails(notification)}
                                                    className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
                                                    style={{ color: mutedColor }}
                                                    title="复制详细信息"
                                                >
                                                    {copiedId === notification.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
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
