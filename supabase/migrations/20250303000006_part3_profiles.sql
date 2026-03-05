-- =====================================================
-- Part 3: 更新 profiles 表字段
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

-- 创建触发器函数：用户登录时更新信息
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

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS trg_update_user_on_login ON public.profiles;

-- 创建新触发器
CREATE TRIGGER trg_update_user_on_login
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_on_login();
