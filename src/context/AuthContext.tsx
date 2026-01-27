import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
    bypassAuth: (email?: string, name?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    signOut: async () => { },
    bypassAuth: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        }).catch((err) => {
            console.error('[AuthContext] Failed to get session:', err);
            setSession(null);
            setUser(null);
            setLoading(false);
        });

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signOut = async () => {
        await supabase.auth.signOut();
        // Also clear local dev state if needed
        setSession(null);
        setUser(null);
    };

    const bypassAuth = async (email = 'dev@local', name = 'Dev User') => {
        // Simple deterministic hash for offline ID
        const emailHash = email.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
        const safeHash = Math.abs(emailHash).toString(36);

        const fakeUser: User = {
            id: 'dev-user-' + safeHash,
            app_metadata: { provider: 'email' },
            user_metadata: { full_name: name, avatar_url: null },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
            email: email,
            phone: '',
            confirmed_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
            role: 'authenticated',
            updated_at: new Date().toISOString()
        };

        const fakeSession: Session = {
            access_token: 'fake-token',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'fake-refresh',
            user: fakeUser
        };

        setSession(fakeSession);
        setUser(fakeUser);
        setLoading(false);
    };

    return (
        <AuthContext.Provider value={{ session, user, loading, signOut, bypassAuth }}>
            {children}
        </AuthContext.Provider>
    );
};
