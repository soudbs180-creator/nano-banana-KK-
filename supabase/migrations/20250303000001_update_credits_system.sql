-- ============================================
-- KK Studio 积分系统增量更新
-- 安全执行：使用 IF NOT EXISTS，可重复运行
-- ============================================

-- ============================================
-- 1. 确保 profiles 表有 credits 字段
-- ============================================
DO $$
BEGIN
    -- 检查 profiles 表是否存在
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        CREATE TABLE public.profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            email TEXT,
            credits DECIMAL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY "Users can read own profile"
        ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
        
        CREATE POLICY "Users can update own profile"
        ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
    ELSE
        -- 表存在，检查 credits 字段
        IF NOT EXISTS (SELECT FROM information_schema.columns 
                       WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'credits') THEN
            ALTER TABLE public.profiles ADD COLUMN credits DECIMAL DEFAULT 0;
        END IF;
    END IF;
END $$;

-- ============================================
-- 2. 创建/更新触发器：新用户自动创建 profile
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

-- 确保触发器存在
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. 积分交易记录表
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

-- 删除旧策略（如果存在）重新创建
DROP POLICY IF EXISTS "Users read own transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Admin insert transactions" ON public.credit_transactions;

CREATE POLICY "Users read own transactions"
ON public.credit_transactions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admin insert transactions"
ON public.credit_transactions FOR INSERT
TO authenticated
WITH CHECK (true);

-- 索引
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at);

-- ============================================
-- 4. 管理员充值函数（核心）
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
    -- 更新用户积分余额
    UPDATE public.profiles
    SET credits = COALESCE(credits, 0) + amount,
        updated_at = NOW()
    WHERE id = target_user_id;
    
    -- 记录交易
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (target_user_id, amount, 'admin_recharge', description);
END;
$$;

-- ============================================
-- 5. 消费积分函数（核心）
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
    target_user_id UUID;
BEGIN
    target_user_id := auth.uid();
    
    -- 获取当前积分
    SELECT credits INTO current_credits
    FROM public.profiles
    WHERE id = target_user_id;
    
    -- 检查余额
    IF current_credits IS NULL OR current_credits < amount THEN
        RETURN FALSE;
    END IF;
    
    -- 扣除积分
    UPDATE public.profiles
    SET credits = credits - amount,
        updated_at = NOW()
    WHERE id = target_user_id;
    
    -- 记录消费
    INSERT INTO public.credit_transactions (user_id, amount, type, description, metadata)
    VALUES (target_user_id, -amount, 'consumption', description, metadata);
    
    RETURN TRUE;
END;
$$;

-- ============================================
-- 6. 获取用户统计函数
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
-- 7. 管理员检查函数
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
-- 8. 权限授权
-- ============================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.credit_transactions TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recharge_credits TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;

-- ============================================
-- 9. 更新所有现有用户的触发器（一次性）
-- ============================================
DO $$
BEGIN
    -- 为没有 profile 的现有用户创建 profile
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
    
    RAISE NOTICE 'Created profiles for existing users';
END $$;
