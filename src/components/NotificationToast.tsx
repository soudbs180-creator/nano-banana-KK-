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

    if (notifications.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none max-w-[90vw] w-[480px]">
            {notifications.map(notification => (
                <div
                    key={notification.id}
                    className={`pointer-events-auto backdrop-blur-xl border rounded-xl shadow-2xl animate-in slide-in-from-top-2 fade-in duration-200 ${getStyles(notification.type)}`}
                >
                    <div className="flex items-start gap-3 p-4">
                        <div className="shrink-0 mt-0.5">
                            {getIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-white text-sm">{notification.title}</div>
                            <div className="text-zinc-400 text-xs mt-1 break-words">{notification.message}</div>
                            {notification.details && (
                                <div className="mt-2 p-2 bg-black/30 rounded-lg text-[10px] text-zinc-500 font-mono break-all max-h-20 overflow-auto">
                                    {notification.details}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {/* Copy button for debugging */}
                            <button
                                onClick={() => handleCopyDetails(notification)}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                title="复制错误信息 (Copy for AI debugging)"
                            >
                                {copiedId === notification.id ? (
                                    <Check size={14} className="text-green-400" />
                                ) : (
                                    <Copy size={14} className="text-zinc-500" />
                                )}
                            </button>
                            {/* Dismiss button */}
                            <button
                                onClick={() => notificationService.dismiss(notification.id)}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X size={14} className="text-zinc-500" />
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default NotificationToast;
