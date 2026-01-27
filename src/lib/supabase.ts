import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ovdjhdofjysanamgkfng.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_UvP5c6ShzuoYDtnZppd1yA_3L_m13l0';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    console.error('[Supabase] Missing credentials. Auth features will not work. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
