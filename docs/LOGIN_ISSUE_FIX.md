# 🚨 登录问题紧急修复指南

## 问题原因

之前的 `20260312000006_production_security_hardening.sql` 迁移中：
```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
```

这行代码撤销了 `anon`（匿名用户）的所有权限，导致 **Supabase 认证无法正常工作**。

## 快速修复（2分钟）

### 方法1：Supabase Dashboard 执行 SQL（推荐）

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)
2. 进入你的项目 → SQL Editor
3. 粘贴并执行以下代码：

```sql
-- 紧急修复登录权限
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT SELECT, INSERT ON public.profiles TO anon;
GRANT USAGE ON SEQUENCE public.profiles_id_seq TO anon;

-- 重新创建 profiles 策略
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT TO authenticated, anon
    USING (auth.uid() = id);

CREATE POLICY "profiles_insert_on_signup" ON public.profiles
    FOR INSERT TO anon, authenticated
    WITH CHECK (auth.uid() = id);

-- 验证
SELECT tablename, policyname FROM pg_policies WHERE tablename = 'profiles';
```

4. 返回应用，重新尝试登录

### 方法2：使用迁移文件

```bash
# 部署修复迁移
supabase db push
```

或者手动执行：
```bash
psql $DATABASE_URL -f supabase/migrations/20260312000008_fix_auth_permissions.sql
```

## 验证修复成功

执行以下 SQL 检查：

```sql
-- 检查 profiles 表权限
SELECT 
    grantee, 
    privilege_type 
FROM information_schema.table_privileges 
WHERE table_name = 'profiles' 
AND grantee IN ('anon', 'authenticated');

-- 预期结果：
-- grantee      | privilege_type
-- -------------|---------------
-- anon         | SELECT
-- anon         | INSERT
-- authenticated| SELECT
-- authenticated| INSERT
-- authenticated| UPDATE
-- authenticated| DELETE
```

## 预防措施

1. **部署前在测试环境验证登录功能**
2. **安全迁移不要撤销 anon 的基础权限**
3. **使用渐进式权限收紧，而不是一次性全撤**

## 修改后的安全策略

| 表 | anon 权限 | authenticated 权限 |
|---|----------|-------------------|
| profiles | SELECT, INSERT | ALL |
| user_api_keys | ❌ 无 | SELECT, INSERT, UPDATE, DELETE |
| user_credits | ❌ 无 | SELECT, UPDATE |
| admin_credit_models | ❌ 无 | SELECT |

## 如果还不行？

1. 检查浏览器控制台是否有 CORS 错误
2. 检查 Supabase Dashboard 的 API 日志
3. 确认 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 配置正确
4. 尝试清除浏览器缓存和 Cookie

## 联系支持

如果仍有问题，请提供：
- 浏览器控制台错误截图
- Supabase API 日志中的错误信息
- 执行的 SQL 结果
