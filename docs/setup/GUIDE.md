# KK Studio 数据库配置完整指南

## 项目信息
- **Supabase URL**: https://ovdjhdofjysanamgkfng.supabase.co
- **Project ID**: ovdjhdofjysanamgkfng
- **迁移文件**: `supabase/migrations/20250303000000_complete_setup.sql`

---

## 快速配置（自动脚本）

### Windows (双击运行)
1. 打开文件 `scripts/setup-database.bat`
2. 按提示操作

### 或手动执行

```bash
# 第 1 步：登录（只需一次）
npx supabase login
# 浏览器会打开，点击"Authorize"授权

# 第 2 步：链接项目
npx supabase link --project-ref ovdjhdofjysanamgkfng

# 第 3 步：推送数据库迁移
npx supabase db push

# 第 4 步：验证
npx supabase status
```

---

## 详细步骤

### 1. 登录 Supabase CLI

```bash
cd <project-root>
npx supabase login
```

**预期输出**:
```
You can generate an access token from https://app.supabase.com/account/tokens
Enter your access token: 
```

**操作**：
- 浏览器会打开 https://app.supabase.com/account/tokens
- 点击 "New Token" 创建令牌
- 复制令牌粘贴到终端

### 2. 链接项目

```bash
npx supabase link --project-ref ovdjhdofjysanamgkfng
```

**预期输出**:
```
Linked to project: ovdjhdofjysanamgkfng
```

### 3. 推送迁移

```bash
npx supabase db push
```

**预期输出**:
```
Connecting to remote database...
Applying migration 20250303000000_complete_setup.sql...
Finished supabase db push.
```

---

## 验证配置

### 方法 1：CLI 验证

```bash
npx supabase status
```

### 方法 2：Dashboard 验证

1. 访问 https://app.supabase.com/project/ovdjhdofjysanamgkfng
2. 点击 **Table Editor** (左侧菜单)
3. 确认以下表已创建：
   - ✅ `profiles`
   - ✅ `credit_transactions`
   - ✅ `admin_providers`
   - ✅ `provider_pricing_cache`

4. 点击 **Database** → **Functions**
5. 确认以下函数存在：
   - ✅ `admin_recharge_credits`
   - ✅ `consume_credits`
   - ✅ `get_user_stats`
   - ✅ `is_admin`

---

## 管理员设置

### 设置管理员账户

**方法 1：通过邮箱标识**
1. 在应用中注册一个用户
2. 访问 https://app.supabase.com/project/ovdjhdofjysanamgkfng/editor
3. 打开 `profiles` 表
4. 找到你的用户，修改 `email` 为包含 `@admin` 的格式（如 `you@admin.com`）

**方法 2：修改 is_admin 函数**

在 SQL Editor 执行：
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
        AND email = 'your-actual-email@example.com'
    );
END;
$$;
```

---

## 故障排除

### 问题 1：命令找不到
```
' supabase' is not recognized
```
**解决**：使用 `npx supabase` 而不是 `supabase`

### 问题 2：登录失败
```
Error: Invalid token
```
**解决**：
1. 访问 https://app.supabase.com/account/tokens
2. 创建新 Token
3. 确保完整复制（包括 `sbp_` 前缀）

### 问题 3：链接失败
```
Error: Project not found
```
**解决**：检查 project-ref 是否正确：`ovdjhdofjysanamgkfng`

### 问题 4：推送失败
```
Error: permission denied
```
**解决**：
1. 确认已正确登录
2. 确认 Token 有足够权限
3. 尝试重置链接：`npx supabase unlink` 然后重新 `link`

---

## 备选方案：手动 SQL

如果 CLI 配置困难，使用 **手动 SQL** 方式：

1. 访问 https://app.supabase.com/project/ovdjhdofjysanamgkfng/sql-editor
2. 点击 **New Query**
3. 打开文件 `supabase/migrations/20250303000000_complete_setup.sql`
4. 复制全部内容
5. 粘贴到 SQL Editor
6. 点击 **Run**

---

## 后续操作

配置完成后，可以：
1. 在设置面板中点击"管理员系统"测试
2. 添加第三方服务商
3. 为用户充值积分
4. 查看系统日志

---

## 需要帮助？

1. 查看 `SUPABASE_SETUP.md` 详细文档
2. 访问 Supabase 官方文档：https://supabase.com/docs
3. 检查项目 GitHub Issues
