import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase] Missing credentials. Auth features will not work.');
    console.error('[Supabase] Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
}

export const supabase = createClient(
    supabaseUrl || '', 
    supabaseAnonKey || '', 
    {
        db: {
            schema: 'public'
        },
        global: {
            // 增加 fetch 超时时间到 30 秒
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
                return fetch(input, {
                    ...init,
                    signal: init?.signal || undefined,
                });
            }
        }
    }
);