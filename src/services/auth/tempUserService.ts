import { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

const TEMP_USER_STORAGE_KEY = 'temp_user_session_v1';
const TEMP_USER_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface TempUserSession {
  user: User;
  createdAt: number;
  expiresAt: number;
  isTempUser: true;
}

function buildTempEmail(tempUserId: string): string {
  return `${tempUserId}@temp.local`;
}

function buildTempNickname(tempUserId: string): string {
  return `临时用户_${tempUserId.replace(/-/g, '').slice(0, 8)}`;
}

class TempUserService {
  private generateTempUserId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const randomValue = Math.floor(Math.random() * 16);
      const value = char === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  getCachedTempUser(): TempUserSession | null {
    try {
      const raw = localStorage.getItem(TEMP_USER_STORAGE_KEY);
      if (!raw) return null;

      const session = JSON.parse(raw) as TempUserSession;
      if (!session?.expiresAt || Date.now() > session.expiresAt) {
        this.clearCachedTempUser();
        return null;
      }

      return session;
    } catch (error) {
      console.error('[TempUser] 读取本地临时用户缓存失败:', error);
      this.clearCachedTempUser();
      return null;
    }
  }

  private cacheTempUser(session: TempUserSession): void {
    try {
      localStorage.setItem(TEMP_USER_STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('[TempUser] 写入本地临时用户缓存失败:', error);
    }
  }

  clearCachedTempUser(): void {
    localStorage.removeItem(TEMP_USER_STORAGE_KEY);
  }

  async createTempUser(): Promise<TempUserSession> {
    const now = Date.now();
    const tempUserId = this.generateTempUserId();
    const expiresAt = now + TEMP_USER_EXPIRY_MS;
    const email = buildTempEmail(tempUserId);
    const nickname = buildTempNickname(tempUserId);
    const timestampIso = new Date(now).toISOString();

    const payload = {
      id: tempUserId,
      email,
      nickname,
      created_at: timestampIso,
      expires_at: new Date(expiresAt).toISOString(),
      is_active: true,
      last_seen_at: timestampIso,
      updated_at: timestampIso,
      metadata: {
        createdAt: now,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    };

    let { error } = await supabase.from('temp_users').insert(payload);

    const missingColumn =
      String(error?.message || '').includes('column') &&
      (String(error?.message || '').includes('email') ||
        String(error?.message || '').includes('nickname') ||
        String(error?.message || '').includes('last_seen_at') ||
        String(error?.message || '').includes('updated_at'));

    if (missingColumn) {
      ({ error } = await supabase.from('temp_users').insert({
        id: tempUserId,
        created_at: timestampIso,
        expires_at: new Date(expiresAt).toISOString(),
        is_active: true,
        metadata: payload.metadata,
      }));
    }

    if (error) {
      console.error('[TempUser] 创建 Supabase 临时用户记录失败:', error);
      throw new Error(`创建临时用户失败：${error.message || '未知错误'}`);
    }

    const fakeUser: User = {
      id: tempUserId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      phone: '',
      created_at: timestampIso,
      updated_at: timestampIso,
      confirmed_at: timestampIso,
      last_sign_in_at: timestampIso,
      app_metadata: {
        isTempUser: true,
        provider: 'temp',
      },
      user_metadata: {
        avatar_url: null,
        full_name: nickname,
        isTempUser: true,
      },
    };

    const session: TempUserSession = {
      user: fakeUser,
      createdAt: now,
      expiresAt,
      isTempUser: true,
    };

    this.cacheTempUser(session);
    return session;
  }

  async getOrCreateTempUser(): Promise<TempUserSession> {
    const cached = this.getCachedTempUser();
    if (cached) return cached;
    return this.createTempUser();
  }

  isTempUser(user: User | null): boolean {
    if (!user) return false;
    return user.user_metadata?.isTempUser === true || user.app_metadata?.isTempUser === true;
  }

  getTimeRemaining(session: TempUserSession | null): number {
    if (!session) return 0;
    return Math.max(0, session.expiresAt - Date.now());
  }

  formatTimeRemaining(session: TempUserSession | null): string {
    const remaining = this.getTimeRemaining(session);
    if (remaining <= 0) return '已过期';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 24) return '约 24 小时';
    if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
    return `${minutes} 分钟`;
  }
}

export const tempUserService = new TempUserService();
