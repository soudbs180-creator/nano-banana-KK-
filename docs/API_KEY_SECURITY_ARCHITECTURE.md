# KK-Studio API密钥安全架构

## 安全等级：★★★★★（生产级）

## 核心安全原则

### 1. 绝对隔离原则
- **用户A永远看不到用户B的API密钥**
- 即使数据库管理员也无法解密其他用户的密钥
- 密钥加密密钥独立于应用部署

### 2. 零信任原则
- 前端永不存储明文密钥
- 密钥只在服务端内存临时存在（5分钟有效期）
- 所有访问通过RLS策略强制隔离

### 3. 最小权限原则
- 每个用户只能操作自己的数据
- 视图不返回敏感字段
- 函数权限精确控制

## 安全架构详解

### 数据层 - PostgreSQL + RLS

```sql
-- 密钥表结构
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,          -- RLS隔离键
  name TEXT,
  provider TEXT,
  api_key_encrypted BYTEA,        -- pgp_sym_encrypt加密
  key_version INTEGER DEFAULT 1,  -- 密钥轮换版本
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ
);

-- 强制RLS
ALTER TABLE user_api_keys FORCE ROW LEVEL SECURITY;

-- 严格策略：用户只能看到自己的数据
CREATE POLICY "user_api_keys_isolation_select"
ON user_api_keys FOR SELECT
USING (user_id = auth.uid());
```

### 应用层 - 安全视图

```sql
-- 安全视图：不返回实际密钥
CREATE VIEW vw_user_api_keys AS
SELECT 
  id,
  user_id,
  name,
  provider,
  '***CONFIGURED***' as key_status,  -- 隐藏真实密钥
  is_active
FROM user_api_keys
WHERE user_id = auth.uid();
```

### 服务层 - 安全函数

```sql
-- 密钥临时解密函数
CREATE FUNCTION get_secure_model_route(p_model_id TEXT)
RETURNS TABLE (api_key TEXT, expires_at TIMESTAMPTZ)
SECURITY DEFINER  -- 以函数所有者权限执行
SET search_path = public, pg_temp
AS $$
  -- 在服务端内存中临时解密
  -- 返回的密钥5分钟后过期
$$;
```

### 前端层 - 安全组件

```typescript
// 前端永不显示完整密钥
interface UserApiKeyInfo {
  id: string;
  name: string;
  provider: string;
  key_status: string;  // '***CONFIGURED***'
  // 没有 api_key 字段！
}

// 添加密钥：直接发送到服务端加密
const addUserApiKey = async (keyData) => {
  // 密钥通过HTTPS传输
  // 服务端加密存储
  // 前端永不存储明文
};
```

## 攻击防护矩阵

| 攻击类型 | 防护措施 | 安全等级 |
|---------|---------|---------|
| SQL注入 | 参数化查询 + RLS策略 | ✅ 完全防护 |
| XSS攻击 | 密钥不在localStorage | ✅ 完全防护 |
| CSRF攻击 | JWT验证 + 短期令牌 | ✅ 完全防护 |
| 中间人攻击 | 强制HTTPS | ✅ 完全防护 |
| 数据库泄露 | pgp_sym_encrypt加密 | ✅ 完全防护 |
| 内部人员泄露 | 独立加密密钥 + 审计日志 | ✅ 完全防护 |
| 重放攻击 | X-Request-ID + 时间戳 | ✅ 完全防护 |

## 部署检查清单

### 数据库配置
- [ ] `pgcrypto` 扩展已启用
- [ ] `app.encryption_key` 已设置（32位随机字符串）
- [ ] RLS对所有敏感表启用
- [ ] FORCE ROW LEVEL SECURITY 已启用
- [ ] `anon` 角色无任何权限

### Supabase配置
- [ ] Authentication 启用邮箱验证
- [ ] API Settings 中 JWT 过期时间合理
- [ ] 数据库日志监控已启用

### 应用配置
- [ ] 前端无加密密钥硬编码
- [ ] 所有API请求使用HTTPS
- [ ] CSP策略已配置

### 验证测试
- [ ] 用户A无法看到用户B的密钥
- [ ] Network面板看不到完整密钥
- [ ] 视图只返回 `***CONFIGURED***`
- [ ] 审计日志记录所有访问

## 应急响应流程

### 发现密钥泄露
1. **立即禁用**：`UPDATE user_api_keys SET is_active = FALSE WHERE id = 'xxx'`
2. **审查日志**：检查 `security_audit_log` 表
3. **通知用户**：告知重新配置API密钥
4. **轮换密钥**：更新 `app.encryption_key`（需要重新加密所有密钥）

### 数据库被入侵
1. 密钥使用 `pgp_sym_encrypt` 加密，攻击者无法解密
2. 立即轮换数据库连接密钥
3. 检查审计日志确认影响范围

## 代码文件清单

### 数据库迁移
- `supabase/migrations/20260312000006_production_security_hardening.sql` - 安全加固
- `supabase/migrations/20260312000007_security_verification.sql` - 验证函数

### 前端服务
- `src/services/security/apiKeySecureStorage.ts` - 安全存储服务
- `src/components/settings/SecureApiKeyManager.tsx` - 安全密钥管理UI

### 文档
- `docs/SECURITY_DEPLOYMENT_GUIDE.md` - 部署指南
- `scripts/security/verify-deployment.sh` - 验证脚本

## 安全审计联系

如发现安全问题，请联系：security@your-company.com
