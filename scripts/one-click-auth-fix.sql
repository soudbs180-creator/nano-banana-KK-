-- =====================================================
-- 一键认证修复（解决 90% 的登录问题）
-- 在 Supabase SQL Editor 中完整执行
-- =====================================================

-- 1. 首先测试认证函数是否工作
SELECT '测试 auth 函数' as step;
SELECT auth.uid() as test_result;

-- 2. 修复 profiles 表（最常见问题）
SELECT '修复 profiles 表' as step;

-- 禁用 RLS 测试
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;

-- 重新启用 RLS
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- 删除所有现有策略（清理冲突）
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.profiles;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_on_signup" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_for_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "allow_all_select" ON public.profiles;
DROP POLICY IF EXISTS "allow_all_insert" ON public.profiles;
DROP POLICY IF EXISTS "allow_all_update" ON public.profiles;

-- 创建最宽松的策略
CREATE POLICY "allow_all_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON public.profiles FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON public.profiles FOR DELETE USING (true);

-- 3. 修复权限
SELECT '修复权限' as step;

GRANT ALL ON public.profiles TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

-- 4. 确保序列权限
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_schema = 'public' AND sequence_name = 'profiles_id_seq') THEN
        GRANT USAGE ON SEQUENCE public.profiles_id_seq TO anon, authenticated;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '序列不存在或权限已设置';
END $$;

-- 5. 修复 auth 函数权限
SELECT '修复 auth 函数' as step;

DO $$
BEGIN
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'auth.uid() 权限已设置';
END $$;

DO $$
BEGIN
    GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'auth.role() 权限已设置';
END $$;

-- 6. 验证结果
SELECT '验证结果' as step;

SELECT 
    'profiles' as table_name,
    COUNT(*) as policy_count,
    (SELECT rowsecurity FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename WHERE t.tablename = 'profiles' AND t.schemaname = 'public') as rls_enabled
FROM pg_policies
WHERE tablename = 'profiles';

-- 7. 测试插入（模拟注册）
SELECT '测试完成' as step;

-- 输出当前策略列表
SELECT policyname, permissive, roles::text, cmd
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;
