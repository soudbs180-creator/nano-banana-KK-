-- =====================================================
-- 修复版：更新 profiles 表
-- =====================================================

-- 逐个添加字段（避免DO块语法错误）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_cost_usd DECIMAL(10,4) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_tokens INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_reset_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_budget DECIMAL(10,4) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_used DECIMAL(10,4) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_apis JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
