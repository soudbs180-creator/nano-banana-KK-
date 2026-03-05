-- ============================================
-- Fix Supabase Relationships and Admin Password
-- ============================================

-- ============================================
-- 1. Fix credit_transactions -> profiles relationship
-- ============================================

-- First, ensure the foreign key exists
ALTER TABLE public.credit_transactions 
DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

ALTER TABLE public.credit_transactions 
ADD CONSTRAINT credit_transactions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id 
ON public.credit_transactions(user_id);

-- ============================================
-- 2. Create admin_settings table for password storage
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    password_hash TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admin can read/write settings
DROP POLICY IF EXISTS "Admin only access" ON public.admin_settings;
CREATE POLICY "Admin only access"
ON public.admin_settings FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Insert default password hash (admin123) - MD5 hash
-- You should change this immediately after first login
INSERT INTO public.admin_settings (id, password_hash, updated_at)
VALUES (1, '202cb962ac59075b964b07152d234b70', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3. Create verify_admin_password function
-- ============================================
CREATE OR REPLACE FUNCTION public.verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
    input_hash TEXT;
BEGIN
    -- Get stored password hash
    SELECT password_hash INTO stored_hash
    FROM public.admin_settings
    WHERE id = 1;
    
    -- If no password set, deny access
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- MD5 hash comparison
    input_hash := md5(input_password);
    
    RETURN stored_hash = input_hash;
END;
$$;

-- ============================================
-- 4. Create update_admin_password function
-- ============================================
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
    -- Get stored password hash
    SELECT password_hash INTO stored_hash
    FROM public.admin_settings
    WHERE id = 1;
    
    -- If no password exists, allow setting new one
    IF stored_hash IS NOT NULL THEN
        -- Verify old password
        old_hash := md5(old_password);
        IF stored_hash != old_hash THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Update to new password
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

-- ============================================
-- 5. Fix get_user_stats to include email from profiles
-- ============================================
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

-- ============================================
-- 6. Grant permissions
-- ============================================
GRANT ALL ON public.admin_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_password TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_password TO authenticated;

-- ============================================
-- 7. Update admin_recharge_credits to return better info
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_recharge_credits(
    target_user_id UUID,
    amount DECIMAL,
    description TEXT DEFAULT '管理员充值'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_balance DECIMAL;
BEGIN
    -- Check admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Update credits
    UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + amount,
        updated_at = NOW()
    WHERE id = target_user_id
    RETURNING credits INTO new_balance;

    -- Create transaction record
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (target_user_id, amount, 'admin_recharge', description);

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', new_balance,
        'amount', amount
    );
END;
$$;

-- ============================================
-- 8. Function to check if admin password is set
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin_password_set()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash
    FROM public.admin_settings
    WHERE id = 1;
    
    RETURN stored_hash IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_password_set TO authenticated;
