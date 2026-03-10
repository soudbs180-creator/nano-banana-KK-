import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { tempUserService, type TempUserSession } from '../services/auth/tempUserService';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
    loginAsTempUser: () => Promise<void>;
    isTempUser: boolean;
    tempUserExpiry: number | null;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    signOut: async () => { },
    loginAsTempUser: async () => { },
    isTempUser: false,
    tempUserExpiry: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [tempUserSession, setTempUserSession] = useState<TempUserSession | null>(null);

    // Check for cached temp user on mount
    useEffect(() => {
        const cachedTempUser = tempUserService.getCachedTempUser();
        if (cachedTempUser) {
            console.log('[AuthContext] Restoring cached temp user session');
            setTempUserSession(cachedTempUser);
            setUser(cachedTempUser.user);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        const settleAuthState = (nextSession: Session | null) => {
            if (!active) return;
            setSession(nextSession);
            setUser(nextSession?.user ?? null);
            setLoading(false);
        };

        const sessionTimeout = window.setTimeout(() => {
            console.warn('[AuthContext] getSession timeout, fallback to logged-out state');
            settleAuthState(null);
        }, 5000);

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            window.clearTimeout(sessionTimeout);
            settleAuthState(session);
        }).catch((err) => {
            window.clearTimeout(sessionTimeout);
            console.error('[AuthContext] Failed to get session:', err);
            settleAuthState(null);
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            window.clearTimeout(sessionTimeout);
            settleAuthState(session);
        });

        return () => {
            active = false;
            window.clearTimeout(sessionTimeout);
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        // Clear temp user cache if exists
        tempUserService.clearCachedTempUser();
        setTempUserSession(null);
        setSession(null);
        setUser(null);
    };

    const loginAsTempUser = async () => {
        setLoading(true);
        try {
            const tempSession = await tempUserService.getOrCreateTempUser();
            setTempUserSession(tempSession);
            setUser(tempSession.user);
            setLoading(false);
            console.log('[AuthContext] Temp user login successful, expires at:', new Date(tempSession.expiresAt).toISOString());
        } catch (error: any) {
            console.error('[AuthContext] Temp user login failed:', error);
            setLoading(false);
            throw error;
        }
    };

    const isTempUser = tempUserService.isTempUser(user);
    const tempUserExpiry = tempUserSession?.expiresAt || null;

    return (
        <AuthContext.Provider value={{ 
            session, 
            user, 
            loading, 
            signOut, 
            loginAsTempUser,
            isTempUser,
            tempUserExpiry
        }}>
            {children}
        </AuthContext.Provider>
    );
};
