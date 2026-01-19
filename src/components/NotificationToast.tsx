import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Copy, Check } from 'lucide-react';
import { notificationService, Notification, NotificationType } from '../services/notificationService';

const NotificationToast: React.FC = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);

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

    const systemNotifications = notifications.filter(n => n.type === 'error' || n.type === 'warning');
    const messageNotifications = notifications.filter(n => n.type === 'success' || n.type === 'info');

    return (
        <>
            {/* System Notifications (Top Center) - For Errors & Debugging */}
            {systemNotifications.length > 0 && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none max-w-[90vw] w-[600px]">
                    {systemNotifications.map(notification => (
                        <div
                            key={notification.id}
                            className={`pointer-events-auto backdrop-blur-xl border rounded-xl shadow-2xl animate-in slide-in-from-top-2 fade-in duration-200 ${getStyles(notification.type)}`}
                        >
                            <div className="flex items-start gap-3 p-4">
                                <div className="shrink-0 mt-0.5">
                                    {getIcon(notification.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-white text-sm flex items-center gap-2">
                                        {notification.title}
                                        {/* Error Code Badge if present in title or explicitly needed */}
                                        <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono text-zinc-400">
                                            {notification.type.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="text-zinc-400 text-xs mt-1 break-words">{notification.message}</div>
                                    {notification.details && (
                                        <div className="mt-3">
                                            <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                                                <AlertCircle size={10} />
                                                DEBUG INFO / STACK TRACE
                                            </div>
                                            <div className="p-2.5 bg-black/40 rounded-lg text-[10px] text-zinc-400 font-mono break-all max-h-32 overflow-auto border border-white/5 select-text">
                                                {notification.details}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => handleCopyDetails(notification)}
                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors group"
                                        title="复制调试信息 (Copy Debug Info)"
                                    >
                                        {copiedId === notification.id ? (
                                            <Check size={14} className="text-green-400" />
                                        ) : (
                                            <Copy size={14} className="text-zinc-500 group-hover:text-white" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => notificationService.dismiss(notification.id)}
                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                    >
                                        <X size={14} className="text-zinc-500 hover:text-white" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Message Notifications (Bottom Right on Desktop, Bottom Center on Mobile) - For Success & Info */}
            {messageNotifications.length > 0 && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:bottom-8 md:right-8 z-[2000] flex flex-col-reverse gap-2 pointer-events-none max-w-[90vw] md:max-w-[320px] w-full">
                    {messageNotifications.map(notification => (
                        <div
                            key={notification.id}
                            className={`pointer-events-auto backdrop-blur-md border rounded-xl shadow-lg animate-in slide-in-from-right-4 fade-in duration-200 ${getStyles(notification.type)}`}
                        >
                            <div className="flex items-center p-3 gap-3">
                                <div className="shrink-0">
                                    {getIcon(notification.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-white text-sm">{notification.title}</div>
                                    {notification.message && <div className="text-zinc-400 text-xs mt-0.5">{notification.message}</div>}
                                </div>
                                <button
                                    onClick={() => notificationService.dismiss(notification.id)}
                                    className="shrink-0 p-1 hover:bg-white/10 rounded-md text-zinc-500 hover:text-white transition-colors"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

export default NotificationToast;
