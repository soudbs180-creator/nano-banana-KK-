# KK-Studio 生产环境安全部署指南

## 🔒 安全目标

**绝对原则：用户API密钥永远无法被其他用户获取**

## 安全架构

```
┌─────────────────┐
│    用户浏览器    │  ← 永不存储他人密钥，甚至不显示自己的完整密钥
└────────┬────────┘
         │ SSL/TLS 加密传输
         ▼
┌─────────────────┐
│   Supabase 网关  │  ← JWT 认证，请求限流
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│            PostgreSQL 数据库层              │
│  ┌─────────────────────────────────────────┐│
│  │     RLS 策略 (Row Level Security)      ││
│  │   - 用户只能看到 user_id = 自己 的行    ││
│  │   - FORCE ROW LEVEL SECURITY 强制启用   ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │  user_api_keys 表 (pgp_sym_encrypt 加密)││
│  │   - 密钥存储为 BYTEA 加密格式            ││
│  │   - 无索引（防止密钥泄露）               ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│     SECURITY DEFINER 函数                   │
│  ┌─────────────────────────────────────────┐│
│  │ get_secure_model_route()                ││
│  │   - 在服务端内存中临时解密               ││
│  │   - 返回的密钥5分钟过期                  ││
│  │   - 记录审计日志                        ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │ add_user_api_key_secure()               ││
│  │   - 服务端加密，密钥永不落地前端          ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

## 部署步骤

### 第一步：数据库安全配置

```sql
-- 1. 启用 pgcrypto 扩展（用于加密）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. 设置加密密钥（仅数据库知道，应用层不可见）
-- ⚠️ 生产环境使用强密码，且不要存储在代码中
ALTER DATABASE your_db SET app.encryption_key = 'your-32-char-long-secret-key-here';

-- 3. 运行安全加固迁移
-- supabase/migrations/20260312000006_production_security_hardening.sql
```

### 第二步：Supabase Dashboard 配置

1. **Authentication Settings**:
   - ✅ Enable "Confirm email" (邮箱验证)
   - ✅ Enable "Secure email change" (安全邮箱修改)
   - ❌ Disable "Allow new users to sign up" 如需邀请制

2. **Database**:
   - ✅ Enable "Realtime" (按需)
   - ✅ Review all RLS policies in "Table Editor"

3. **API Settings**:
   - ❌ Never expose `service_role` key in frontend
   - ✅ Set `JWT expiry` to reasonable value (e.g., 3600 seconds)

### 第三步：环境变量配置

```bash
# 前端环境变量 (.env.production)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# ⚠️ 不需要 VITE_API_ENCRYPTION_KEY！加密在服务端完成

# 后端/边缘函数环境变量 (Supabase Dashboard)
APP_ENCRYPTION_KEY=your-32-char-long-secret-key-here
```

### 第四步：部署后验证

运行以下SQL验证安全配置：

```sql
-- 1. 验证RLS已启用
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('user_api_keys', 'admin_credit_models', 'profiles');

-- 期望结果：rowsecurity = true

-- 2. 验证策略已应用
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles
FROM pg_policies 
WHERE schemaname = 'public';

-- 期望结果：每个表有对应的 RLS 策略

-- 3. 测试跨用户隔离（模拟攻击）
-- 以 User A 身份登录，尝试查询 User B 的密钥
-- 应该返回 0 行
```

## 安全审计检查清单

### ✅ 部署前必查项

- [ ] **数据库**
  - [ ] RLS 已对所有敏感表启用
  - [ ] FORCE ROW LEVEL SECURITY 已启用
  - [ ] 无 `anon` 角色的 SELECT 权限
  - [ ] `service_role` key 不在前端代码中

- [ ] **API密钥存储**
  - [ ] 使用 `pgp_sym_encrypt` 加密存储
  - [ ] 密钥字段无索引
  - [ ] 视图 `vw_user_api_keys` 不返回实际密钥

- [ ] **函数安全**
  - [ ] 所有涉及密钥的函数使用 `SECURITY DEFINER`
  - [ ] 函数设置 `search_path = public, pg_temp`
  - [ ] 输入参数有长度验证

- [ ] **前端安全**
  - [ ] 无前端加密/解密逻辑
  - [ ] 密钥输入框使用 `<input type="password">`
  - [ ] 密钥只发送到服务端，不在 localStorage 存储

- [ ] **网络安全**
  - [ ] HTTPS 强制启用
  - [ ] CSP (Content Security Policy) 配置
  - [ ] CORS 白名单限制

### ✅ 部署后监控

设置 Supabase 告警：

```sql
-- 监控异常访问模式
CREATE OR REPLACE FUNCTION log_suspicious_access()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id != auth.uid() THEN
    -- 记录到审计日志
    INSERT INTO security_audit_log (
      user_id, action, resource_type, 
      resource_id, success, error_message
    ) VALUES (
      auth.uid(), 
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      'api_key',
      NEW.id,
      FALSE,
      'Attempted to access key owned by ' || NEW.user_id
    );
    RAISE EXCEPTION 'Unauthorized access detected and logged';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 攻击场景防护

### 场景1：SQL注入攻击
**防护**: 使用参数化查询，所有用户输入经过 `pgp_sym_encrypt` 处理

### 场景2：XSS窃取localStorage
**防护**: 密钥不在 localStorage，只在服务端内存临时存在

### 场景3：CSRF攻击
**防护**: Supabase自动处理JWT验证，密钥操作需要认证

### 场景4：中间人攻击
**防护**: 强制HTTPS，Supabase自动处理

### 场景5：内部人员泄露
**防护**: 
- RLS策略阻止即使是超级用户查看他人密钥
- 加密密钥 `app.encryption_key` 独立于应用部署
- 审计日志记录所有访问

### 场景6：数据库备份泄露
**防护**: 密钥使用 `pgp_sym_encrypt` 加密，备份中看到的是密文

## 应急响应

### 如果怀疑密钥泄露

1. **立即禁用相关密钥**
```sql
UPDATE user_api_keys 
SET is_active = FALSE 
WHERE id = 'suspected-key-id';
```

2. **轮换加密密钥**（需要重新加密所有密钥）
```sql
-- 1. 设置新密钥
ALTER DATABASE your_db SET app.encryption_key = 'new-secret-key';

-- 2. 通知用户重新配置API密钥（无法自动迁移）
```

3. **审查审计日志**
```sql
SELECT * FROM security_audit_log 
WHERE resource_id = 'suspected-key-id'
ORDER BY created_at DESC;
```

## 联系方式

如有安全问题，请联系：security@your-company.com
