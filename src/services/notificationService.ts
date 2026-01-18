/**
 * Global Notification Service
 * Displays toast notifications at top-center of screen
 * Error messages are formatted to be AI-readable for debugging
 */

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

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
        const duration = options?.duration ?? (type === 'error' ? 8000 : 4000);

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
            setTimeout(() => this.dismiss(id), duration);
        }

        // Log for debugging (AI-readable format)
        const logPrefix = `[Notification/${type.toUpperCase()}]`;
        const logMessage = `${logPrefix} ${title}: ${message}`;
        if (options?.details) {
            console.log(logMessage, '\n  Details:', options.details);
        } else {
            console.log(logMessage);
        }

        return id;
    }

    /**
     * Helper methods for different notification types
     */
    success(title: string, message: string, details?: string) {
        return this.show('success', title, message, { details });
    }

    error(title: string, message: string, details?: string) {
        return this.show('error', title, message, { details, duration: 10000 });
    }

    warning(title: string, message: string, details?: string) {
        return this.show('warning', title, message, { details });
    }

    info(title: string, message: string, details?: string) {
        return this.show('info', title, message, { details });
    }

    /**
     * Dismiss a notification
     */
    dismiss(id: string) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.notifyListeners();
    }

    /**
     * Dismiss all notifications
     */
    dismissAll() {
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
    dismiss: (id: string) => notificationService.dismiss(id),
    dismissAll: () => notificationService.dismissAll()
};
