# Supabase 配置指南

## 项目信息

- **项目 URL**: https://ovdjhdofjysanamgkfng.supabase.co
- **项目 ID**: `ovdjhdofjysanamgkfng`
- **访问令牌**: `sbp_032c975f2babdc99a850dcdea2bb5bee2e051399`

## 快速设置（推荐）

### 方法 1: 使用 PowerShell 脚本（Windows）

```powershell
# 运行设置脚本
.\scripts\setup-supabase.ps1
```

### 方法 2: 使用 Supabase CLI

```bash
# 1. 安装 CLI（如果还没安装）
npm install -g supabase

# 2. 使用访问令牌登录
export SUPABASE_ACCESS_TOKEN=sbp_032c975f2babdc99a850dcdea2bb5bee2e051399

# 3. 链接项目
supabase link --project-ref ovdjhdofjysanamgkfng

# 4. 执行迁移
supabase db push
```

### 方法 3: 手动执行 SQL（最简单）

1. 访问 [Supabase Dashboard](https://app.supabase.com/project/ovdjhdofjysanamgkfng)
2. 进入 **SQL Editor** → **New Query**
3. 复制粘贴 `supabase/migrations/20250303000002_complete_schema.sql` 的内容
4. 点击 **Run**

## 数据库结构

### 表 (Tables)

| 表名 | 用途 | RLS |
|------|------|-----|
| `profiles` | 用户资料，包含积分余额 | ✓ |
| `credit_transactions` | 积分交易记录（充值/消费） | ✓ |
| `admin_providers` | 管理员配置的第三方服务商 | ✓ Admin Only |
| `provider_pricing_cache` | 服务商价格缓存（24小时过期） | ✓ Read Only |

### 函数 (Functions)

| 函数 | 用途 | 权限 |
|------|------|-----|
| `is_admin()` | 检查当前用户是否为管理员 | 所有用户 |
| `admin_recharge_credits(user_id, amount, description)` | 管理员给用户充值积分 | Admin Only |
| `consume_credits(amount, description, metadata)` | 消费积分 | 所有用户 |
| `get_user_stats(user_id)` | 获取用户积分统计 | 自己/Admin |
| `handle_new_user()` | 触发器：新用户自动创建 profile | 系统 |

## 管理员设置

### 方法一：通过邮箱识别（默认）

在 Supabase Dashboard 中，将你的邮箱设置为以下格式之一：
- 包含 `@admin` 的邮箱（如 `user@admin.com`）
- 包含 `@kkstudio` 的邮箱（如 `user@kkstudio.com`）
- 或者是 `admin@kkstudio.ai`

### 方法二：自定义管理员规则

修改 `is_admin()` 函数：

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND email = 'your-email@example.com'  -- 修改为你的邮箱
    );
END;
$$;
```

## 环境变量

确保 `.env` 文件包含：

```env
VITE_SUPABASE_URL=https://ovdjhdofjysanamgkfng.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_UvP5c6ShzuoYDtnZppd1yA_3L_m13l0
```

## 验证配置

1. 启动开发服务器：`npm run dev`
2. 注册一个新用户
3. 检查 `profiles` 表是否自动创建了记录
4. 在设置面板中点击"管理员系统"，应该提示输入密码
5. 设置管理员邮箱后，重新登录，应该能看到充值功能

## 常见问题

### Q: 提示 "RLS 权限不足"
**A**: 在 Supabase Dashboard → Authentication → Policies 中确认所有表都有正确策略

### Q: "函数不存在"
**A**: 重新执行完整的 SQL 迁移脚本

### Q: 无法给用户充值
**A**: 
1. 确认你的邮箱符合管理员规则
2. 检查 `is_admin()` 函数返回值：`SELECT is_admin();`
3. 确认 `credit_transactions` 表的 RLS 策略允许 admin 插入

### Q: 新用户注册后没有自动创建 profile
**A**: 检查触发器是否存在：
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

## 重置数据库（谨慎使用）

如果需要重新开始：

```sql
-- 删除所有自定义表（保留 auth 用户）
DROP TABLE IF EXISTS public.credit_transactions CASCADE;
DROP TABLE IF EXISTS public.admin_providers CASCADE;
DROP TABLE IF EXISTS public.provider_pricing_cache CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 删除函数
DROP FUNCTION IF EXISTS public.admin_recharge_credits CASCADE;
DROP FUNCTION IF EXISTS public.consume_credits CASCADE;
DROP FUNCTION IF EXISTS public.get_user_stats CASCADE;
DROP FUNCTION IF EXISTS public.is_admin CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;

-- 然后重新执行迁移 SQL
```

## 监控和调试

### 查看最近的交易
```sql
SELECT * FROM credit_transactions 
ORDER BY created_at DESC 
LIMIT 10;
```

### 查看用户积分排行
```sql
SELECT email, credits FROM profiles 
ORDER BY credits DESC 
LIMIT 20;
```

### 检查管理员权限
```sql
SELECT is_admin();
```

## 相关文件

- **迁移文件**: `supabase/migrations/20250303000002_complete_schema.sql`
- **Supabase 客户端**: `src/lib/supabase.ts`
- **管理员组件**: `src/components/AdminSystem.tsx`
- **设置脚本**: `scripts/setup-supabase.ps1`
