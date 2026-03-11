# 🔧 认证网络问题深度排查

## 常见原因

### 1. CORS 配置问题
检查 Supabase Dashboard:
1. Authentication → URL Configuration
2. 确保你的域名在 "Site URL" 或 "Redirect URLs" 中

### 2. 更深的权限问题
可能是 `auth.users` 相关的触发器或函数权限

### 3. 网络层问题
- Supabase 项目是否暂停？
- API 端点是否正确？

---

## 深度修复 SQL

在 Supabase SQL Editor 中执行：

```sql
-- =====================================================
-- 完整认证修复（解决网络/权限问题）
-- =====================================================

-- 1. 完全重置 profiles 权限
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. 删除所有现有策略（清理可能的冲突）
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.profiles;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_on_signup" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_for_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 3. 创建最宽松的策略（用于测试）
CREATE POLICY "allow_all_select" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "allow_all_insert" ON public.profiles
    FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_all_update" ON public.profiles
    FOR UPDATE USING (true);

-- 4. 恢复权限
GRANT ALL ON public.profiles TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

-- 5. 检查 auth schema 中的关键函数
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.email() TO anon, authenticated;

-- 6. 验证
SELECT 
    tablename,
    policyname,
    permissive,
    roles
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
```

---

## 前端排查

### 检查浏览器控制台
1. 按 F12 打开 DevTools
2. 查看 Console 标签页
3. 查看 Network 标签页的请求

### 常见错误及解决

#### 错误1: `CORS error`
**解决**: 
- Supabase Dashboard → Authentication → URL Configuration
- 添加你的域名到 "Site URL"
- 开发环境添加 `http://localhost:3000`

#### 错误2: `Invalid login credentials`
**解决**:
- 确认邮箱已验证（如果需要）
- 重置密码测试

#### 错误3: `Database error saving new user`
**解决**:
- 检查 profiles 表的触发器
- 检查是否有 NOT NULL 字段没有默认值

#### 错误4: `Error sending confirmation email`
**解决**:
- Supabase 免费版有邮件限制
- 检查邮箱配置

---

## 极端修复（完全重置）

如果以上都不行，尝试完全重置：

```sql
-- 禁用 RLS 测试（极度不安全，仅测试用）
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 给所有人所有权限（极度不安全，仅测试用）
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
```

如果这样**能登录**了，说明是 RLS/策略问题，逐步收紧权限。

---

## 请提供的信息

如果还是不行，请提供：

1. **浏览器控制台截图**（F12 → Console）
2. **Network 面板** 中失败的请求详情
3. **执行以下 SQL 的结果**：

```sql
SELECT 
    tablename,
    rowsecurity,
    relforcerowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public';
```

4. **Supabase 项目状态**：项目是否正常运行？
