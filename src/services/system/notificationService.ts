/**
 * Global Notification Service
 * Displays toast notifications at top-center of screen
 * Error messages are formatted to be AI-readable for debugging
 */

import { addLog, LogLevel } from './systemLogService';

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'alipay' | 'wechat' | 'paypal';

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    details?: string; // AI-readable technical details
    duration?: number; // ms, 0 = persist until dismissed
    timestamp: number;
}

type NotificationListener = (notifications: Notification[]) => void;

class NotificationService {
    private notifications: Notification[] = [];
    private listeners: Set<NotificationListener> = new Set();
    private maxNotifications = 5;
    private timers: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Show a notification
     */
    show(
        type: NotificationType,
        title: string,
        message: string,
        options?: { details?: string; duration?: number }
    ): string {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const duration = options?.duration ?? 10000; // Default 10s for all types

        const notification: Notification = {
            id,
            type,
            title,
            message,
            details: options?.details,
            duration,
            timestamp: Date.now()
        };

        this.notifications = [notification, ...this.notifications].slice(0, this.maxNotifications);
        this.notifyListeners();

        // Auto-dismiss after duration (unless 0)
        if (duration > 0) {
            this.startTimer(id, duration);
        }

        // 记录到系统日志 (直接调用，确保同步记录)
        let level = LogLevel.INFO;
        if (type === 'error') level = LogLevel.ERROR;
        if (type === 'warning') level = LogLevel.WARNING;

        addLog(
            level,
            'NotificationSystem',
            `${title}: ${message}`,
            options?.details || (type === 'error' ? 'No technical details provided' : 'User Notification'),
        );

        // Console Log
        const logPrefix = `[Notification/${type.toUpperCase()}]`;
        const logMessage = `${logPrefix} ${title}: ${message}`;
        if (options?.details) {
            console.log(logMessage, '\n  Details:', options.details);
        } else {
            console.log(logMessage);
        }

        return id;
    }

    private startTimer(id: string, duration: number) {
        if (this.timers.has(id)) {
            clearTimeout(this.timers.get(id)!);
        }
        const timer = setTimeout(() => this.dismiss(id), duration);
        this.timers.set(id, timer);
    }

    /**
     * Pause auto-dismiss timer (e.g. on hover)
     */
    pauseTimer(id: string) {
        if (this.timers.has(id)) {
            clearTimeout(this.timers.get(id)!);
            this.timers.delete(id);
        }
    }

    /**
     * Resume auto-dismiss timer (e.g. on mouse leave)
     * Resets to full duration for better UX
     */
    resumeTimer(id: string) {
        const notification = this.notifications.find(n => n.id === id);
        if (notification && (notification.duration || 0) > 0) {
            this.startTimer(id, notification.duration!);
        }
    }

    /**
     * Helper methods for different notification types
     */
    success(title: string, message: string, details?: string) {
        return this.show('success', title, message, { details });
    }

    error(title: string, message: string, details?: string) {
        // Errors usually 10s, but let's keep it consistent
        return this.show('error', title, message, { details, duration: 10000 });
    }

    warning(title: string, message: string, details?: string) {
        return this.show('warning', title, message, { details });
    }

    info(title: string, message: string, details?: string) {
        return this.show('info', title, message, { details });
    }

    /**
     * Payment channel specific notifications
     */
    alipay(title: string, message: string, details?: string) {
        return this.show('alipay', title, message, { details });
    }

    wechat(title: string, message: string, details?: string) {
        return this.show('wechat', title, message, { details });
    }

    paypal(title: string, message: string, details?: string) {
        return this.show('paypal', title, message, { details });
    }

    /**
     * Dismiss a notification
     */
    dismiss(id: string) {
        // Clear timer
        if (this.timers.has(id)) {
            clearTimeout(this.timers.get(id)!);
            this.timers.delete(id);
        }

        this.notifications = this.notifications.filter(n => n.id !== id);
        this.notifyListeners();
    }

    /**
     * Dismiss all notifications
     */
    dismissAll() {
        // Clear all timers
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();

        this.notifications = [];
        this.notifyListeners();
    }

    /**
     * Get current notifications
     */
    getAll(): Notification[] {
        return [...this.notifications];
    }

    /**
     * Subscribe to notification changes
     */
    subscribe(listener: NotificationListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners() {
        const current = this.getAll();
        this.listeners.forEach(listener => listener(current));
    }
}

// Global singleton instance
export const notificationService = new NotificationService();

// Convenience exports
export const notify = {
    success: (title: string, message: string, details?: string) =>
        notificationService.success(title, message, details),
    error: (title: string, message: string, details?: string) =>
        notificationService.error(title, message, details),
    warning: (title: string, message: string, details?: string) =>
        notificationService.warning(title, message, details),
    info: (title: string, message: string, details?: string) =>
        notificationService.info(title, message, details),
    alipay: (title: string, message: string, details?: string) =>
        notificationService.alipay(title, message, details),
    wechat: (title: string, message: string, details?: string) =>
        notificationService.wechat(title, message, details),
    paypal: (title: string, message: string, details?: string) =>
        notificationService.paypal(title, message, details),
    dismiss: (id: string) => notificationService.dismiss(id),
    dismissAll: () => notificationService.dismissAll(),
    pause: (id: string) => notificationService.pauseTimer(id),
    resume: (id: string) => notificationService.resumeTimer(id)
};
