-- =====================================================
-- 数据库重构迁移（修复版）
-- 整理所有表格，保留已有数据，优化结构
-- =====================================================

-- =====================================================
-- 第1部分: 创建新表
-- =====================================================

-- 1. 创建 user_credits 表
CREATE TABLE IF NOT EXISTS public.user_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    balance INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    frozen INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    last_transaction_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 2. 创建 admin_auth 表
CREATE TABLE IF NOT EXISTS public.admin_auth (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    password_hash TEXT NOT NULL DEFAULT '202cb962ac59075b964b07152d234b70',
    admin_user_id UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 插入默认管理员
INSERT INTO public.admin_auth (id, password_hash, is_active)
VALUES (1, '202cb962ac59075b964b07152d234b70', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. 创建 credit_transactions 表
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    type TEXT NOT NULL CHECK (type IN ('recharge', 'consumption', 'refund', 'freeze', 'unfreeze')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    model_id TEXT,
    model_name TEXT,
    provider_id TEXT,
    description TEXT,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_status ON public.credit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);

-- 4. 创建 admin_credit_models 表
DROP TABLE IF EXISTS public.admin_credit_models CASCADE;

CREATE TABLE public.admin_credit_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_keys TEXT[] NOT NULL DEFAULT '{}',
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    gradient TEXT DEFAULT 'from-blue-500 to-indigo-600',
    endpoint_type TEXT NOT NULL DEFAULT 'openai' CHECK (endpoint_type IN ('openai', 'gemini')),
    credit_cost INTEGER NOT NULL DEFAULT 1,
    priority INTEGER DEFAULT 10,
    weight INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    call_count INTEGER DEFAULT 0,
    total_credits_consumed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_credit_models_provider ON public.admin_credit_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_admin_credit_models_active ON public.admin_credit_models(is_active) WHERE is_active = TRUE;

-- 插入默认数据
INSERT INTO public.admin_credit_models (
    provider_id, provider_name, base_url, api_keys,
    model_id, display_name, description, color, gradient, 
    endpoint_type, credit_cost, priority, weight
) VALUES 
    ('google', 'Google Gemini', 'https://cdn.12ai.org', '{}',
     'gemini-3.1-flash-image-preview@system', 
     'Gemini 3.1 Flash Image',
     '快速图像生成，适合日常创意',
     '#4285F4', 'from-blue-500 to-indigo-600',
     'gemini', 1, 10, 1),
     
    ('google', 'Google Gemini', 'https://cdn.12ai.org', '{}',
     'gemini-3-pro-image-preview@system',
     'Gemini 3 Pro Image', 
     '高质量图像生成，适合专业设计',
     '#EA4335', 'from-red-500 to-orange-600',
     'gemini', 2, 10, 1),
     
    ('google', 'Google Gemini', 'https://cdn.12ai.org', '{}',
     'gemini-2.5-flash-image@system',
     'Gemini 2.5 Flash Image',
     '平衡速度与质量',
     '#34A853', 'from-green-500 to-teal-600',
     'gemini', 1, 10, 1)
ON CONFLICT (provider_id, model_id) DO NOTHING;

-- =====================================================
-- 第2部分: 更新 profiles 表
-- =====================================================

-- 添加新字段
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nickname TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS daily_cost_usd DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_reset_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS total_budget DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_used DECIMAL(10,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS user_apis JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 添加角色字段（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';
    END IF;
END $$;

-- =====================================================
-- 第3部分: 创建函数
-- =====================================================

-- 1. 验证管理员密码
CREATE OR REPLACE FUNCTION public.verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash
    FROM public.admin_auth 
    WHERE id = 1;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN stored_hash = md5(input_password);
END;
$$;

-- 2. 每日重置消耗
CREATE OR REPLACE FUNCTION public.reset_daily_consumption()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET 
        daily_cost_usd = 0,
        daily_tokens = 0,
        daily_reset_date = CURRENT_DATE
    WHERE daily_reset_date < CURRENT_DATE;
END;
$$;

-- 3. 获取或创建用户积分
CREATE OR REPLACE FUNCTION public.get_or_create_user_credits(p_user_id UUID, p_email TEXT DEFAULT NULL)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits public.user_credits;
BEGIN
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.user_credits (user_id, email, balance)
        VALUES (p_user_id, p_email, 0)
        RETURNING * INTO v_credits;
    END IF;
    
    RETURN v_credits;
END;
$$;

-- 4. 管理员充值
CREATE OR REPLACE FUNCTION public.admin_recharge_credits(
    p_target_user_id UUID,
    p_amount INTEGER,
    p_description TEXT DEFAULT '管理员充值'
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits public.user_credits;
    v_new_balance INTEGER;
    v_email TEXT;
BEGIN
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_target_user_id;
    
    IF v_email IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, '用户不存在'::TEXT;
        RETURN;
    END IF;
    
    SELECT * INTO v_credits
    FROM public.get_or_create_user_credits(p_target_user_id, v_email);
    
    UPDATE public.user_credits
    SET 
        balance = balance + p_amount,
        total_earned = total_earned + p_amount,
        version = version + 1,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_credits.id
    RETURNING balance INTO v_new_balance;
    
    INSERT INTO public.credit_transactions (
        user_id, email, type, amount, balance_after, description, status, completed_at
    ) VALUES (
        p_target_user_id, v_email, 'recharge', p_amount, v_new_balance, p_description, 'completed', NOW()
    );
    
    RETURN QUERY SELECT TRUE, v_new_balance, '充值成功'::TEXT;
END;
$$;

-- 5. 消费积分
CREATE OR REPLACE FUNCTION public.consume_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_model_id TEXT,
    p_model_name TEXT,
    p_provider_id TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, transaction_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits public.user_credits;
    v_new_balance INTEGER;
    v_transaction_id UUID;
    v_email TEXT;
BEGIN
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_user_id;
    
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;
    
    IF NOT FOUND OR v_credits.balance < p_amount THEN
        RETURN QUERY SELECT FALSE, COALESCE(v_credits.balance, 0), NULL::UUID, '积分不足'::TEXT;
        RETURN;
    END IF;
    
    UPDATE public.user_credits
    SET 
        balance = balance - p_amount,
        total_spent = total_spent + p_amount,
        version = version + 1,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_credits.id
    RETURNING balance INTO v_new_balance;
    
    INSERT INTO public.credit_transactions (
        user_id, email, type, amount, balance_after, model_id, model_name, provider_id, description, status, completed_at
    ) VALUES (
        p_user_id, v_email, 'consumption', -p_amount, v_new_balance, p_model_id, p_model_name, p_provider_id, p_description, 'completed', NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    RETURN QUERY SELECT TRUE, v_new_balance, v_transaction_id, '消费成功'::TEXT;
END;
$$;

-- 6. 退回积分
CREATE OR REPLACE FUNCTION public.refund_credits(
    p_transaction_id UUID,
    p_reason TEXT DEFAULT '调用失败退回'
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction public.credit_transactions;
    v_credits public.user_credits;
    v_new_balance INTEGER;
BEGIN
    SELECT * INTO v_transaction
    FROM public.credit_transactions
    WHERE id = p_transaction_id AND type = 'consumption' AND status = 'completed';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, '交易记录不存在或状态不符'::TEXT;
        RETURN;
    END IF;
    
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = v_transaction.user_id;
    
    UPDATE public.user_credits
    SET 
        balance = balance + ABS(v_transaction.amount),
        total_spent = total_spent - ABS(v_transaction.amount),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_credits.id
    RETURNING balance INTO v_new_balance;
    
    UPDATE public.credit_transactions
    SET status = 'refunded'
    WHERE id = p_transaction_id;
    
    INSERT INTO public.credit_transactions (
        user_id, email, type, amount, balance_after, model_id, model_name, provider_id, description, status, completed_at
    ) VALUES (
        v_transaction.user_id, v_transaction.email, 'refund', ABS(v_transaction.amount), v_new_balance, 
        v_transaction.model_id, v_transaction.model_name, v_transaction.provider_id, p_reason, 'completed', NOW()
    );
    
    RETURN QUERY SELECT TRUE, v_new_balance, '退回成功'::TEXT;
END;
$$;

-- =====================================================
-- 第4部分: 创建触发器
-- =====================================================

-- 创建触发器函数：用户登录时更新信息
CREATE OR REPLACE FUNCTION public.update_user_on_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.daily_reset_date < CURRENT_DATE THEN
        NEW.daily_cost_usd := 0;
        NEW.daily_tokens := 0;
        NEW.daily_reset_date := CURRENT_DATE;
    END IF;
    
    NEW.last_updated := NOW();
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_user_on_login ON public.profiles;

CREATE TRIGGER trg_update_user_on_login
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_on_login();

-- =====================================================
-- 第5部分: 设置 RLS
-- =====================================================

-- 启用 RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_credit_models ENABLE ROW LEVEL SECURITY;

-- user_credits 策略
DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;
CREATE POLICY "Users can view own credits"
ON public.user_credits FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Only admins can modify credits" ON public.user_credits;
CREATE POLICY "Only admins can modify credits"
ON public.user_credits FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- admin_auth 策略
DROP POLICY IF EXISTS "Only admins can access admin_auth" ON public.admin_auth;
CREATE POLICY "Only admins can access admin_auth"
ON public.admin_auth FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- credit_transactions 策略
DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own transactions"
ON public.credit_transactions FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.credit_transactions;
CREATE POLICY "Admins can view all transactions"
ON public.credit_transactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- admin_credit_models 策略
DROP POLICY IF EXISTS "Everyone can view credit models" ON public.admin_credit_models;
CREATE POLICY "Everyone can view credit models"
ON public.admin_credit_models FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Only admins can modify credit models" ON public.admin_credit_models;
CREATE POLICY "Only admins can modify credit models"
ON public.admin_credit_models FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);
