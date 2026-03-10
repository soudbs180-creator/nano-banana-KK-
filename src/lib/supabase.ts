import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
export const supabaseConfigIssue = hasSupabaseConfig
  ? null
  : '缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，认证与云同步功能将自动降级';

if (!hasSupabaseConfig) {
  console.error('[Supabase] 配置缺失，已切换为安全降级模式');
  console.error('[Supabase]', supabaseConfigIssue);
}

const fallbackSupabaseUrl = 'https://placeholder.invalid';
const fallbackSupabaseAnonKey = 'placeholder-anon-key';

export const supabase = createClient(
  hasSupabaseConfig ? supabaseUrl : fallbackSupabaseUrl,
  hasSupabaseConfig ? supabaseAnonKey : fallbackSupabaseAnonKey,
  {
    db: {
      schema: 'public'
    },
    auth: {
      persistSession: hasSupabaseConfig,
      autoRefreshToken: hasSupabaseConfig,
      detectSessionInUrl: hasSupabaseConfig
    },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          signal: init?.signal || undefined
        });
      }
    }
  }
);
