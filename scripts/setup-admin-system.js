/**
 * Setup Admin System in Supabase
 * Run with: node scripts/setup-admin-system.js
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase env vars. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || ''; 

const sql = `
-- ============================================
-- Fix Supabase Relationships and Admin Password
-- ============================================

-- 1. Fix credit_transactions -> profiles relationship
ALTER TABLE public.credit_transactions 
DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

ALTER TABLE public.credit_transactions 
ADD CONSTRAINT credit_transactions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id 
ON public.credit_transactions(user_id);

-- 2. Create admin_settings table for password storage
CREATE TABLE IF NOT EXISTS public.admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    password_hash TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin only access" ON public.admin_settings;
CREATE POLICY "Admin only access"
ON public.admin_settings FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Insert default password hash (123)
INSERT INTO public.admin_settings (id, password_hash, updated_at)
VALUES (1, '202cb962ac59075b964b07152d234b70', NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. Create verify_admin_password function
CREATE OR REPLACE FUNCTION public.verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
    input_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash
    FROM public.admin_settings
    WHERE id = 1;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    input_hash := md5(input_password);
    RETURN stored_hash = input_hash;
END;
$$;

-- 4. Create update_admin_password function
CREATE OR REPLACE FUNCTION public.update_admin_password(
    old_password TEXT,
    new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
    old_hash TEXT;
    new_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash
    FROM public.admin_settings
    WHERE id = 1;
    
    IF stored_hash IS NOT NULL THEN
        old_hash := md5(old_password);
        IF stored_hash != old_hash THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    new_hash := md5(new_password);
    
    INSERT INTO public.admin_settings (id, password_hash, updated_at, updated_by)
    VALUES (1, new_hash, NOW(), auth.uid())
    ON CONFLICT (id) 
    DO UPDATE SET 
        password_hash = new_hash,
        updated_at = NOW(),
        updated_by = auth.uid();
    
    RETURN TRUE;
END;
$$;

-- 5. Fix get_user_stats function
CREATE OR REPLACE FUNCTION public.get_user_stats(
    target_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    total_consumed DECIMAL,
    total_recharged DECIMAL,
    current_balance DECIMAL,
    transaction_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF target_user_id IS NULL THEN
        target_user_id := auth.uid();
    END IF;

    RETURN QUERY
    SELECT
        p.id as user_id,
        p.email,
        COALESCE(SUM(CASE WHEN ct.type = 'consumption' THEN ABS(ct.amount) ELSE 0 END), 0) as total_consumed,
        COALESCE(SUM(CASE WHEN ct.type IN ('admin_recharge', 'purchase') THEN ct.amount ELSE 0 END), 0) as total_recharged,
        COALESCE(p.credits, 0) as current_balance,
        COUNT(ct.id) as transaction_count
    FROM public.profiles p
    LEFT JOIN public.credit_transactions ct ON ct.user_id = p.id
    WHERE p.id = target_user_id
    GROUP BY p.id, p.email;
END;
$$;

-- 6. Grant permissions
GRANT ALL ON public.admin_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_password TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_password TO authenticated;
`;

async function setup() {
    console.log('========================================');
    console.log('Setting up Admin System in Supabase');
    console.log('========================================\n');

    try {
        // Execute SQL via RPC or direct query
        console.log('1. Creating tables and functions...');
        
        const { error } = await supabase.rpc('exec_sql', { sql });
        
        if (error) {
            console.log('   Using alternative method...');
            // Try direct REST API
            const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({ query: sql })
            });
            
            if (!response.ok) {
                console.log('\\nPlease run this SQL manually in Supabase Dashboard:');
                console.log(`   https://app.supabase.com/project/${PROJECT_REF || '<your-project-ref>'}/sql`);
                console.log('\n--- COPY BELOW ---\n');
                console.log(sql);
                console.log('\n--- END ---\n');
            }
        } else {
            console.log('   OK Tables and functions created\\n');
        }

        // Verify setup
        console.log('2. Verifying setup...');
        const { data: settings, error: settingsError } = await supabase
            .from('admin_settings')
            .select('*')
            .single();
        
        if (settingsError) {
            console.log('   WARN admin_settings table may not exist yet');
        } else {
            console.log('   OK admin_settings table exists');
            console.log(`   Password configured: ${settings ? 'Yes' : 'No'}\n`);
        }

        console.log('========================================');
        console.log('Setup instructions:');
        console.log('========================================');
        console.log(`1. Visit: https://app.supabase.com/project/${PROJECT_REF || '<your-project-ref>'}/sql`);
        console.log('2. Copy the SQL from the file: supabase/migrations/20250303000003_fix_relationships.sql');
        console.log('3. Paste and run in SQL Editor');
        console.log('4. Default admin password: 123');
        console.log('========================================\n');

    } catch (err) {
        console.error('Setup error:', err);
    }
}

setup();
