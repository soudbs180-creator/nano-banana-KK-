/**
 * Temporary User Service
 * 
 * Creates temporary users that:
 * - Have a unique ID stored in Supabase
 * - Expire after 24 hours
 * - Are cached in browser localStorage
 * - Can receive credits from admin recharge
 */

import { supabase } from '../../lib/supabase';
import { User } from '@supabase/supabase-js';

const TEMP_USER_STORAGE_KEY = 'temp_user_session_v1';
const TEMP_USER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface TempUserSession {
    user: User;
    createdAt: number;
    expiresAt: number;
    isTempUser: true;
}

class TempUserService {
    /**
     * Generate a unique temporary user ID
     */
    private generateTempUserId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 10);
        return `temp_${timestamp}_${random}`;
    }

    /**
     * Check if there's a valid cached temp user
     */
    getCachedTempUser(): TempUserSession | null {
        try {
            const cached = localStorage.getItem(TEMP_USER_STORAGE_KEY);
            if (!cached) return null;

            const session: TempUserSession = JSON.parse(cached);
            
            // Check if expired
            if (Date.now() > session.expiresAt) {
                console.log('[TempUser] Cached session expired, clearing');
                this.clearCachedTempUser();
                return null;
            }

            console.log('[TempUser] Found valid cached session, expires at:', new Date(session.expiresAt).toISOString());
            return session;
        } catch (error) {
            console.error('[TempUser] Failed to parse cached session:', error);
            this.clearCachedTempUser();
            return null;
        }
    }

    /**
     * Cache temp user session to localStorage
     */
    private cacheTempUser(session: TempUserSession): void {
        try {
            localStorage.setItem(TEMP_USER_STORAGE_KEY, JSON.stringify(session));
            console.log('[TempUser] Session cached, expires at:', new Date(session.expiresAt).toISOString());
        } catch (error) {
            console.error('[TempUser] Failed to cache session:', error);
        }
    }

    /**
     * Clear cached temp user
     */
    clearCachedTempUser(): void {
        localStorage.removeItem(TEMP_USER_STORAGE_KEY);
    }

    /**
     * Create a new temporary user
     * - Creates record in Supabase
     * - Caches to localStorage
     * - Returns user session
     */
    async createTempUser(): Promise<TempUserSession> {
        const now = Date.now();
        const tempUserId = this.generateTempUserId();
        const expiresAt = now + TEMP_USER_EXPIRY_MS;

        console.log('[TempUser] Creating new temporary user:', tempUserId);

        // Create user record in Supabase
        const { data, error } = await supabase
            .from('temp_users')
            .insert({
                id: tempUserId,
                created_at: new Date().toISOString(),
                expires_at: new Date(expiresAt).toISOString(),
                is_active: true,
                metadata: {
                    userAgent: navigator.userAgent,
                    createdAt: now
                }
            })
            .select()
            .single();

        if (error) {
            console.error('[TempUser] Failed to create Supabase record:', error);
            throw new Error('创建临时用户失败：' + (error.message || '未知错误'));
        }

        // Create fake User object
        const fakeUser: User = {
            id: tempUserId,
            app_metadata: { 
                provider: 'temp',
                isTempUser: true
            },
            user_metadata: { 
                full_name: `临时用户_${tempUserId.substring(5, 12)}`,
                avatar_url: null,
                isTempUser: true
            },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
            email: `${tempUserId}@temp.local`,
            phone: '',
            confirmed_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
            role: 'authenticated',
            updated_at: new Date().toISOString()
        };

        const session: TempUserSession = {
            user: fakeUser,
            createdAt: now,
            expiresAt: expiresAt,
            isTempUser: true
        };

        // Cache to localStorage
        this.cacheTempUser(session);

        console.log('[TempUser] Temporary user created successfully');
        return session;
    }

    /**
     * Get or create temp user
     * - Returns cached if valid
     * - Creates new if not exists or expired
     */
    async getOrCreateTempUser(): Promise<TempUserSession> {
        // Try to get cached session
        const cached = this.getCachedTempUser();
        if (cached) {
            return cached;
        }

        // Create new temp user
        return await this.createTempUser();
    }

    /**
     * Check if user is a temporary user
     */
    isTempUser(user: User | null): boolean {
        if (!user) return false;
        return user.user_metadata?.isTempUser === true || 
               user.app_metadata?.isTempUser === true ||
               user.id.startsWith('temp_');
    }

    /**
     * Get time remaining before expiry
     */
    getTimeRemaining(session: TempUserSession | null): number {
        if (!session) return 0;
        return Math.max(0, session.expiresAt - Date.now());
    }

    /**
     * Format time remaining as human readable string
     */
    formatTimeRemaining(session: TempUserSession | null): string {
        const remaining = this.getTimeRemaining(session);
        if (remaining <= 0) return '已过期';

        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        if (hours >= 24) {
            return '约 24 小时';
        } else if (hours > 0) {
            return `${hours}小时${minutes}分钟`;
        } else {
            return `${minutes}分钟`;
        }
    }
}

export const tempUserService = new TempUserService();
