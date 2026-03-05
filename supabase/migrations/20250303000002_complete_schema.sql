-- ============================================
-- KK Studio - Complete Supabase Schema
-- Version: 2.0
-- Description: Unified schema for auth, credits, and admin system
-- ============================================

-- ============================================
-- 1. PROFILES TABLE (User credits and info)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    credits DECIMAL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- ============================================
-- 2. TRIGGER: Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, credits)
    VALUES (NEW.id, NEW.email, 0)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. ADMIN CHECK FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND (
            email LIKE '%@admin%' 
            OR email LIKE '%@kkstudio%'
            OR email = 'admin@kkstudio.ai'
        )
    );
END;
$$;

-- ============================================
-- 4. CREDIT TRANSACTIONS (Audit log)
-- ============================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    amount DECIMAL NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('admin_recharge', 'purchase', 'consumption', 'refund')),
    description TEXT,
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own transactions" ON public.credit_transactions;
CREATE POLICY "Users read own transactions"
ON public.credit_transactions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin insert transactions" ON public.credit_transactions;
CREATE POLICY "Admin insert transactions"
ON public.credit_transactions FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at);

-- ============================================
-- 5. ADMIN RECHARGE FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_recharge_credits(
    target_user_id UUID,
    amount DECIMAL,
    description TEXT DEFAULT '管理员充值'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check admin
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Update credits
    UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + amount,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Record transaction
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (target_user_id, amount, 'admin_recharge', description);
END;
$$;

-- ============================================
-- 6. CONSUME CREDITS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.consume_credits(
    amount DECIMAL,
    description TEXT DEFAULT '消费',
    metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_credits DECIMAL;
BEGIN
    SELECT credits INTO current_credits
    FROM public.profiles
    WHERE id = auth.uid();

    IF current_credits IS NULL OR current_credits < amount THEN
        RETURN FALSE;
    END IF;

    UPDATE public.profiles
    SET credits = credits - amount,
        updated_at = NOW()
    WHERE id = auth.uid();

    INSERT INTO public.credit_transactions (user_id, amount, type, description, metadata)
    VALUES (auth.uid(), -amount, 'consumption', description, metadata);

    RETURN TRUE;
END;
$$;

-- ============================================
-- 7. GET USER STATS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_stats(
    target_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
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
        COALESCE(SUM(CASE WHEN type = 'consumption' THEN ABS(amount) ELSE 0 END), 0) as total_consumed,
        COALESCE(SUM(CASE WHEN type IN ('admin_recharge', 'purchase') THEN amount ELSE 0 END), 0) as total_recharged,
        (SELECT COALESCE(credits, 0) FROM public.profiles WHERE id = target_user_id) as current_balance,
        COUNT(*) as transaction_count
    FROM public.credit_transactions
    WHERE user_id = target_user_id;
END;
$$;

-- ============================================
-- 8. ADMIN PROVIDERS (System provider config)
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_providers (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_keys JSONB DEFAULT '[]'::JSONB,
    models JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.admin_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow admin full access" ON public.admin_providers;
CREATE POLICY "Allow admin full access"
ON public.admin_providers FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ============================================
-- 9. PROVIDER PRICING CACHE
-- ============================================
CREATE TABLE IF NOT EXISTS public.provider_pricing_cache (
    provider_id TEXT PRIMARY KEY,
    pricing JSONB NOT NULL DEFAULT '[]'::JSONB,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

ALTER TABLE public.provider_pricing_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read pricing cache" ON public.provider_pricing_cache;
CREATE POLICY "Allow read pricing cache"
ON public.provider_pricing_cache FOR SELECT
TO authenticated
USING (true);

-- ============================================
-- 10. PERMISSIONS
-- ============================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.credit_transactions TO authenticated;
GRANT ALL ON public.admin_providers TO authenticated;
GRANT ALL ON public.provider_pricing_cache TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recharge_credits TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;

-- ============================================
-- 11. MIGRATE EXISTING USERS (One-time)
-- ============================================
DO $$
BEGIN
    INSERT INTO public.profiles (id, email, credits, created_at, updated_at)
    SELECT 
        au.id,
        au.email,
        0,
        NOW(),
        NOW()
    FROM auth.users au
    LEFT JOIN public.profiles p ON au.id = p.id
    WHERE p.id IS NULL;
    
    RAISE NOTICE 'Migration complete: Created profiles for existing users';
END $$;
