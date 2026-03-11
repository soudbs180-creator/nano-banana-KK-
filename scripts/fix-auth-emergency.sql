-- =====================================================
-- 紧急修复：恢复登录权限
-- 运行方式：在 Supabase SQL Editor 中执行
-- =====================================================

-- 1. 立即恢复 anon 权限
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT SELECT, INSERT ON public.profiles TO anon;
GRANT USAGE ON SEQUENCE public.profiles_id_seq TO anon;

-- 2. 删除可能阻碍登录的策略
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "user_api_keys_isolation_select" ON public.user_api_keys;

-- 3. 创建宽松的 profiles 策略
CREATE POLICY IF NOT EXISTS "profiles_select_own" ON public.profiles
    FOR SELECT TO authenticated, anon
    USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "profiles_insert_on_signup" ON public.profiles
    FOR INSERT TO anon, authenticated
    WITH CHECK (auth.uid() = id);

-- 4. 重新启用关键表的 RLS（如果意外关闭）
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- 5. 验证修复
SELECT 
    'profiles' as table_name,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename = 'profiles' AND schemaname = 'public'
UNION ALL
SELECT 
    'user_api_keys' as table_name,
    COUNT(*) as policy_count
FROM pg_policies 
WHERE tablename = 'user_api_keys' AND schemaname = 'public';

-- 输出：应该显示 profiles 和 user_api_keys 都有策略
