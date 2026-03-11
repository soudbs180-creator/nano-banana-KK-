# 🚨 认证问题完整修复指南

## 最可能的原因（按优先级）

### 1. CORS 配置错误（最高优先级）
**症状**: 密码正确，显示网络问题

**修复**:
1. 登录 Supabase Dashboard
2. 进入 Authentication → URL Configuration
3. 检查 "Site URL" 是否是你的实际域名
4. 添加你的部署域名到 "Redirect URLs"

```
Site URL: https://your-domain.com
Redirect URLs:
  - http://localhost:3000 (开发)
  - https://your-domain.com
  - https://your-domain.com/auth/callback
```

---

### 2. 环境变量未设置

**检查方法**: 浏览器控制台输入：
```javascript
console.log(import.meta.env.VITE_SUPABASE_URL);
console.log(import.meta.env.VITE_SUPABASE_ANON_KEY);
```

如果输出 `undefined`，说明环境变量没设置。

**修复**: 确保 `.env` 文件存在且正确：
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

然后重新构建：
```bash
npm run build
```

---

### 3. 数据库权限问题

执行完整的权限修复：

```sql
-- =====================================================
-- 完整认证权限修复（复制到 Supabase SQL Editor 执行）
-- =====================================================

-- 1. 重置所有策略
DROP POLICY IF EXISTS "allow_all_select" ON public.profiles;
DROP POLICY IF EXISTS "allow_all_insert" ON public.profiles;
DROP POLICY IF EXISTS "allow_all_update" ON public.profiles;

-- 2. 创建最宽松的策略（测试用）
CREATE POLICY "allow_all_select" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "allow_all_insert" ON public.profiles
    FOR INSERT WITH CHECK (true);

-- 3. 授予必要权限
GRANT ALL ON public.profiles TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

-- 4. 禁用 RLS 测试（如果上面的不行，试试这个）
-- ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 5. 验证
SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
```

---

## 诊断步骤

### 步骤1: 检查浏览器控制台
按 F12 → Console，看有什么错误：

| 错误信息 | 原因 | 解决 |
|---------|------|------|
| `Failed to fetch` | CORS/网络 | 检查 URL Configuration |
| `CORS error` | 跨域 | 添加域名到 Redirect URLs |
| `Invalid URL` | 环境变量 | 检查 .env 文件 |
| `NetworkError` | 项目暂停 | 检查 Supabase 项目状态 |

### 步骤2: 检查 Supabase 项目状态
1. 登录 https://supabase.com/dashboard
2. 查看项目是否显示 "Active"
3. 如果显示 "Paused"，需要唤醒

### 步骤3: 测试直接 API 调用
在浏览器控制台执行：
```javascript
fetch('https://your-project.supabase.co/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: {
    'apikey': 'your-anon-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'password123'
  })
}).then(r => r.json()).then(console.log).catch(console.error);
```

如果返回 `{"code":400,"msg":"Invalid login credentials"}` → 认证正常，密码错误
如果返回 CORS 错误 → 需要配置 CORS
如果返回 404 → URL 错误

---

## 快速修复清单

按顺序尝试：

### ✅ 修复1: CORS 配置（最常见）
Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://your-domain.com`
- Redirect URLs: 添加你的域名

### ✅ 修复2: 检查环境变量
```bash
# 在项目根目录检查
cat .env
```
确保有：
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### ✅ 修复3: 数据库权限
执行上面的完整 SQL 修复

### ✅ 修复4: 检查触发器
如果注册后卡在创建用户，可能是触发器问题：

```sql
-- 检查触发器
SELECT * FROM pg_trigger WHERE tgrelid::regclass::text = 'auth.users';

-- 如果有问题，禁用触发器测试
ALTER TABLE auth.users DISABLE TRIGGER YOUR_TRIGGER_NAME;
```

---

## 请提供的信息

如果还是不行，请回复：

1. **浏览器控制台完整错误截图**（按 F12 → Console）
2. **Network 面板截图**（失败的请求）
3. **你的部署域名**是什么？
4. **Supabase 项目区域**（us-east-1, eu-west-1 等）
5. **执行这个 SQL 的结果**：

```sql
SELECT 
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'profiles';
```
