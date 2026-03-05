-- =====================================================
-- 数据库重构迁移
-- 整理所有表格，保留已有数据，优化结构
-- =====================================================

-- =====================================================
-- 表一: profiles (用户信息 + API配置 + 每日消耗)
-- =====================================================

-- 先添加/修改 profiles 表的字段
DO $$
BEGIN
    -- 添加网名/头像字段（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'nickname') THEN
        ALTER TABLE public.profiles ADD COLUMN nickname TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'avatar_url') THEN
        ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
    END IF;
    
    -- 添加每日消耗字段
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'daily_cost_usd') THEN
        ALTER TABLE public.profiles ADD COLUMN daily_cost_usd DECIMAL(10,4) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'daily_tokens') THEN
        ALTER TABLE public.profiles ADD COLUMN daily_tokens INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'daily_reset_date') THEN
        ALTER TABLE public.profiles ADD COLUMN daily_reset_date DATE DEFAULT CURRENT_DATE;
    END IF;
    
    -- 添加总预算/总用量字段
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_budget') THEN
        ALTER TABLE public.profiles ADD COLUMN total_budget DECIMAL(10,4) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'total_used') THEN
        ALTER TABLE public.profiles ADD COLUMN total_used DECIMAL(10,4) DEFAULT 0;
    END IF;
    
    -- 添加最后更新字段
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_updated') THEN
        ALTER TABLE public.profiles ADD COLUMN last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- 添加用户API配置字段（JSON格式，存储多个API）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'user_apis') THEN
        ALTER TABLE public.profiles ADD COLUMN user_apis JSONB DEFAULT '[]'::jsonb;
    END IF;
    
    -- 添加角色字段
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';
    END IF;
END $$;

-- =====================================================
-- 表二: user_credits (用户积分余额 - 独立表，实时更新)
-- =====================================================

-- 创建用户积分表（如果不存在）
CREATE TABLE IF NOT EXISTS public.user_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    balance INTEGER NOT NULL DEFAULT 0,           -- 当前积分余额
    total_earned INTEGER NOT NULL DEFAULT 0,      -- 总共获得的积分
    total_spent INTEGER NOT NULL DEFAULT 0,       -- 总共消耗的积分
    frozen INTEGER NOT NULL DEFAULT 0,            -- 冻结中的积分（处理中）
    version INTEGER NOT NULL DEFAULT 1,           -- 乐观锁版本号
    last_transaction_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 启用RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的积分
CREATE POLICY "Users can view own credits"
ON public.user_credits FOR SELECT
USING (user_id = auth.uid());

-- 只有管理员可以修改积分
CREATE POLICY "Only admins can modify credits"
ON public.user_credits FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- =====================================================
-- 表三: admin_auth (管理员认证表)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.admin_auth (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    password_hash TEXT NOT NULL DEFAULT '202cb962ac59075b964b07152d234b70',  -- 默认密码: 123
    admin_user_id UUID REFERENCES auth.users(id),  -- 管理员用户ID
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 插入默认记录
INSERT INTO public.admin_auth (id, password_hash, is_active)
VALUES (1, '202cb962ac59075b964b07152d234b70', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 启用RLS
ALTER TABLE public.admin_auth ENABLE ROW LEVEL SECURITY;

-- 只有管理员可以访问
CREATE POLICY "Only admins can access admin_auth"
ON public.admin_auth FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- =====================================================
-- 表四: credit_transactions (积分交易记录)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    type TEXT NOT NULL CHECK (type IN ('recharge', 'consumption', 'refund', 'freeze', 'unfreeze')),
    amount INTEGER NOT NULL,                      -- 变动金额（正数为增加，负数为减少）
    balance_after INTEGER NOT NULL,               -- 变动后的余额
    model_id TEXT,                                -- 调用的模型ID
    model_name TEXT,                              -- 模型显示名称
    provider_id TEXT,                             -- 供应商ID
    description TEXT,                             -- 描述
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    error_message TEXT,                           -- 失败时的错误信息
    metadata JSONB DEFAULT '{}'::jsonb,           -- 额外信息
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_status ON public.credit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);

-- 启用RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己的交易记录
CREATE POLICY "Users can view own transactions"
ON public.credit_transactions FOR SELECT
USING (user_id = auth.uid());

-- 管理员可以查看所有记录
CREATE POLICY "Admins can view all transactions"
ON public.credit_transactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- 只有系统/管理员可以插入交易记录
CREATE POLICY "Only admins can insert transactions"
ON public.credit_transactions FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- =====================================================
-- 表五: admin_credit_models (管理员配置的积分模型)
-- =====================================================

-- 删除旧表（如果存在且结构不一致）
-- 注意：如果已有数据，请先备份
DROP TABLE IF EXISTS public.admin_models CASCADE;
DROP TABLE IF EXISTS public.admin_credit_models CASCADE;

-- 创建新表
CREATE TABLE public.admin_credit_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 供应商配置
    provider_id TEXT NOT NULL,                    -- 供应商唯一标识
    provider_name TEXT NOT NULL,                  -- 供应商显示名称
    base_url TEXT NOT NULL,                       -- API Base URL
    api_keys TEXT[] NOT NULL DEFAULT '{}',        -- API Key数组（支持轮换）
    
    -- 模型配置
    model_id TEXT NOT NULL,                       -- 模型唯一标识
    display_name TEXT NOT NULL,                   -- 模型显示名称
    description TEXT,                             -- 描述/优势
    color TEXT DEFAULT '#3B82F6',                 -- 颜色（HEX）
    gradient TEXT DEFAULT 'from-blue-500 to-indigo-600', -- 渐变
    endpoint_type TEXT NOT NULL DEFAULT 'openai' CHECK (endpoint_type IN ('openai', 'gemini')), -- API端点类型
    credit_cost INTEGER NOT NULL DEFAULT 1,       -- 积分消耗
    
    -- 负载均衡配置
    priority INTEGER DEFAULT 10,                  -- 优先级（越高越优先）
    weight INTEGER DEFAULT 1,                     -- 权重（用于轮转）
    is_active BOOLEAN DEFAULT TRUE,               -- 是否启用
    
    -- 统计
    call_count INTEGER DEFAULT 0,                 -- 总调用次数
    total_credits_consumed INTEGER DEFAULT 0,     -- 总消耗积分
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 唯一约束
    UNIQUE(provider_id, model_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_admin_credit_models_provider ON public.admin_credit_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_admin_credit_models_active ON public.admin_credit_models(is_active) WHERE is_active = TRUE;

-- 启用RLS
ALTER TABLE public.admin_credit_models ENABLE ROW LEVEL SECURITY;

-- 所有人可查看
CREATE POLICY "Everyone can view credit models"
ON public.admin_credit_models FOR SELECT
USING (true);

-- 只有管理员可以修改
CREATE POLICY "Only admins can modify credit models"
ON public.admin_credit_models FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- =====================================================
-- 函数: 验证管理员密码
-- =====================================================

CREATE OR REPLACE FUNCTION public.verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
    admin_uid UUID;
BEGIN
    -- 获取存储的密码哈希和管理员ID
    SELECT password_hash, admin_user_id INTO stored_hash, admin_uid
    FROM public.admin_auth 
    WHERE id = 1;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- 验证密码匹配且当前用户是管理员
    IF stored_hash = md5(input_password) AND admin_uid = auth.uid() THEN
        -- 更新最后验证时间
        UPDATE public.admin_auth 
        SET updated_at = NOW() 
        WHERE id = 1;
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;

-- =====================================================
-- 函数: 每日重置消耗（0点重置）
-- =====================================================

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

-- =====================================================
-- 函数: 用户登录时更新信息
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_user_on_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 检查是否需要重置每日消耗
    IF NEW.daily_reset_date < CURRENT_DATE THEN
        NEW.daily_cost_usd := 0;
        NEW.daily_tokens := 0;
        NEW.daily_reset_date := CURRENT_DATE;
    END IF;
    
    -- 更新最后登录时间
    NEW.last_updated := NOW();
    
    RETURN NEW;
END;
$$;

-- 创建触发器（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_user_on_login') THEN
        CREATE TRIGGER trg_update_user_on_login
            BEFORE UPDATE ON public.profiles
            FOR EACH ROW
            EXECUTE FUNCTION public.update_user_on_login();
    END IF;
END $$;

-- =====================================================
-- 函数: 获取或创建用户积分
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_or_create_user_credits(p_user_id UUID, p_email TEXT DEFAULT NULL)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits public.user_credits;
BEGIN
    -- 尝试获取现有记录
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;
    
    -- 如果不存在，创建新记录
    IF NOT FOUND THEN
        INSERT INTO public.user_credits (user_id, email, balance)
        VALUES (p_user_id, p_email, 0)
        RETURNING * INTO v_credits;
    END IF;
    
    RETURN v_credits;
END;
$$;

-- =====================================================
-- 函数: 管理员充值积分（事务安全）
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_recharge_credits(
    p_target_user_id UUID,
    p_amount INTEGER,
    p_description TEXT DEFAULT '管理员充值',
    p_admin_user_id UUID DEFAULT NULL
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
    -- 检查调用者是否为管理员
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = COALESCE(p_admin_user_id, auth.uid()) AND role = 'admin'
    ) THEN
        RETURN QUERY SELECT FALSE, 0, '无权操作：需要管理员权限'::TEXT;
        RETURN;
    END IF;
    
    -- 获取用户邮箱
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_target_user_id;
    
    IF v_email IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, '用户不存在'::TEXT;
        RETURN;
    END IF;
    
    -- 获取或创建积分记录
    SELECT * INTO v_credits
    FROM public.get_or_create_user_credits(p_target_user_id, v_email);
    
    -- 更新积分（使用乐观锁防止并发问题）
    UPDATE public.user_credits
    SET 
        balance = balance + p_amount,
        total_earned = total_earned + p_amount,
        version = version + 1,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_credits.id AND version = v_credits.version
    RETURNING balance INTO v_new_balance;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, '充值失败：并发冲突，请重试'::TEXT;
        RETURN;
    END IF;
    
    -- 记录交易
    INSERT INTO public.credit_transactions (
        user_id,
        email,
        type,
        amount,
        balance_after,
        description,
        status,
        completed_at
    ) VALUES (
        p_target_user_id,
        v_email,
        'recharge',
        p_amount,
        v_new_balance,
        p_description,
        'completed',
        NOW()
    );
    
    RETURN QUERY SELECT TRUE, v_new_balance, '充值成功'::TEXT;
END;
$$;

-- =====================================================
-- 函数: 消费积分（事务安全）
-- =====================================================

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
    -- 获取用户邮箱
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_user_id;
    
    -- 获取积分记录
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '积分不足'::TEXT;
        RETURN;
    END IF;
    
    -- 检查余额
    IF v_credits.balance < p_amount THEN
        RETURN QUERY SELECT FALSE, v_credits.balance, NULL::UUID, '积分不足'::TEXT;
        RETURN;
    END IF;
    
    -- 扣除积分
    UPDATE public.user_credits
    SET 
        balance = balance - p_amount,
        total_spent = total_spent + p_amount,
        version = version + 1,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_credits.id AND version = v_credits.version
    RETURNING balance INTO v_new_balance;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '消费失败：并发冲突'::TEXT;
        RETURN;
    END IF;
    
    -- 创建交易记录
    INSERT INTO public.credit_transactions (
        user_id,
        email,
        type,
        amount,
        balance_after,
        model_id,
        model_name,
        provider_id,
        description,
        status,
        completed_at
    ) VALUES (
        p_user_id,
        v_email,
        'consumption',
        -p_amount,
        v_new_balance,
        p_model_id,
        p_model_name,
        p_provider_id,
        p_description,
        'completed',
        NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    RETURN QUERY SELECT TRUE, v_new_balance, v_transaction_id, '消费成功'::TEXT;
END;
$$;

-- =====================================================
-- 函数: 失败时退回积分
-- =====================================================

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
    -- 获取原交易记录
    SELECT * INTO v_transaction
    FROM public.credit_transactions
    WHERE id = p_transaction_id AND type = 'consumption' AND status = 'completed';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, '交易记录不存在或状态不符'::TEXT;
        RETURN;
    END IF;
    
    -- 获取积分记录
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = v_transaction.user_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, '用户积分记录不存在'::TEXT;
        RETURN;
    END IF;
    
    -- 退回积分（原金额是负数，所以用 ABS）
    UPDATE public.user_credits
    SET 
        balance = balance + ABS(v_transaction.amount),
        total_spent = total_spent - ABS(v_transaction.amount),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_credits.id
    RETURNING balance INTO v_new_balance;
    
    -- 更新原交易状态
    UPDATE public.credit_transactions
    SET status = 'refunded'
    WHERE id = p_transaction_id;
    
    -- 创建退款记录
    INSERT INTO public.credit_transactions (
        user_id,
        email,
        type,
        amount,
        balance_after,
        model_id,
        model_name,
        provider_id,
        description,
        status,
        completed_at
    ) VALUES (
        v_transaction.user_id,
        v_transaction.email,
        'refund',
        ABS(v_transaction.amount),
        v_new_balance,
        v_transaction.model_id,
        v_transaction.model_name,
        v_transaction.provider_id,
        p_reason,
        'completed',
        NOW()
    );
    
    RETURN QUERY SELECT TRUE, v_new_balance, '退回成功'::TEXT;
END;
$$;

-- =====================================================
-- 插入默认积分模型（如果不存在）
-- =====================================================

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
-- 清理旧表（如果存在且数据已迁移）
-- 注意：请确认数据已备份后再取消注释
-- =====================================================

-- 保留旧表作为备份，以下仅注释说明
-- DROP TABLE IF EXISTS public.old_credit_models;  -- 如果有旧表
-- DROP TABLE IF EXISTS public.old_transactions;   -- 如果有旧表
