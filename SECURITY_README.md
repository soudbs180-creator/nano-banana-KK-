# 🔒 KK-Studio API密钥安全方案

## 核心保证

**绝对保证：任何用户都无法获取其他用户的API密钥**

## 已实现的安全措施

### 1. 数据库层安全
- ✅ **RLS强制启用**：`FORCE ROW LEVEL SECURITY`
- ✅ **严格策略**：`user_id = auth.uid()` 强制过滤
- ✅ **服务端加密**：`pgp_sym_encrypt` 数据库级加密
- ✅ **安全视图**：`vw_user_api_keys` 不返回真实密钥

### 2. 服务层安全
- ✅ **安全函数**：`get_secure_model_route()` 临时解密
- ✅ **密钥过期**：5分钟有效期
- ✅ **审计日志**：`security_audit_log` 记录所有访问

### 3. 前端层安全
- ✅ **安全组件**：`SecureApiKeyManager` 永不显示完整密钥
- ✅ **服务端加密**：密钥直接发送到服务端加密
- ✅ **无本地存储**：密钥不在 localStorage

## 快速部署

### 1. 运行数据库迁移
```bash
# 启用加密扩展
supabase sql "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 设置加密密钥（仅数据库知道）
supabase sql "ALTER DATABASE postgres SET app.encryption_key = 'your-32-char-secret-key';"

# 运行迁移
supabase db push
```

### 2. 验证部署
```powershell
# PowerShell
.\scripts\security\deploy-security-check.ps1 `
  -SupabaseUrl "https://your-project.supabase.co" `
  -ServiceRoleKey "your-service-role-key" `
  -AnonKey "your-anon-key"
```

### 3. 手动验证
- [ ] 用户A登录 → 添加API密钥 → 只显示 `***CONFIGURED***`
- [ ] 用户B登录 → 看不到用户A的任何密钥信息
- [ ] DevTools Network → 响应中无完整密钥

## 文件清单

```
supabase/migrations/
├── 20260312000006_production_security_hardening.sql  # 核心安全迁移
└── 20260312000007_security_verification.sql          # 验证函数

src/services/security/
└── apiKeySecureStorage.ts                             # 前端安全服务

src/components/settings/
└── SecureApiKeyManager.tsx                            # 安全密钥管理UI

scripts/security/
├── verify-deployment.sh                               # Bash验证脚本
└── deploy-security-check.ps1                          # PowerShell验证脚本

docs/
├── SECURITY_DEPLOYMENT_GUIDE.md                       # 详细部署指南
└── API_KEY_SECURITY_ARCHITECTURE.md                   # 架构文档
```

## 应急响应

### 发现密钥泄露
```sql
-- 立即禁用密钥
UPDATE user_api_keys 
SET is_active = FALSE 
WHERE id = 'suspected-key-id';

-- 查看审计日志
SELECT * FROM security_audit_log 
WHERE resource_id = 'suspected-key-id'
ORDER BY created_at DESC;
```

### 轮换加密密钥
```sql
-- 1. 设置新密钥
ALTER DATABASE postgres SET app.encryption_key = 'new-32-char-secret-key';

-- 2. 通知用户重新配置（无法自动迁移）
```

## 安全等级

| 项目 | 等级 |
|-----|------|
| 跨用户隔离 | ★★★★★ |
| 加密存储 | ★★★★★ |
| 传输安全 | ★★★★★ |
| 审计追踪 | ★★★★★ |
| 应急响应 | ★★★★☆ |

## 联系方式

安全问题报告：security@your-company.com
