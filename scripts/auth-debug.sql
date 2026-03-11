-- =====================================================
-- 认证问题深度诊断
-- 在 Supabase SQL Editor 中执行
-- =====================================================

-- 1. 检查 auth schema 权限
SELECT 
    nspname as schema,
    nspacl as permissions
FROM pg_namespace 
WHERE nspname IN ('auth', 'public');

-- 2. 检查关键表的 RLS 状态
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    relforcerowsecurity as force_rls
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
AND tablename IN ('profiles', 'user_api_keys', 'user_credits');

-- 3. 检查 profiles 表的实际权限
SELECT 
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
AND table_name = 'profiles'
ORDER BY grantee, privilege_type;

-- 4. 检查认证触发器
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgenabled as enabled
FROM pg_trigger
WHERE tgrelid::regclass::text IN ('public.profiles', 'auth.users')
AND NOT tgisinternal;

-- 5. 检查是否有阻碍认证的策略
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_expression,
    with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 6. 测试 auth.uid() 函数是否正常工作
SELECT auth.uid() IS NOT NULL as auth_function_works;

-- 7. 检查 supabase_auth 配置（如果可见）
SELECT 
    name,
    setting
FROM pg_settings
WHERE name LIKE '%auth%'
LIMIT 10;

-- 8. 检查是否有网络相关的错误日志（如果有表的话）
-- SELECT * FROM auth.audit_log_entries ORDER BY created_at DESC LIMIT 5;
