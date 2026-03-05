-- =====================================================
-- 修复版：创建新表（无约束，后面单独添加）
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
    id INTEGER PRIMARY KEY DEFAULT 1,
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

-- 3. 创建 credit_transactions 表（先不添加CHECK约束）
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    model_id TEXT,
    model_name TEXT,
    provider_id TEXT,
    description TEXT,
    status TEXT DEFAULT 'completed',
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(type);
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
    endpoint_type TEXT NOT NULL DEFAULT 'openai',
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
