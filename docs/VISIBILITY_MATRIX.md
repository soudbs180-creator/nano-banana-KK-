# KK-Studio 密钥可见性矩阵

## 可见性规则总结

### ✅ 用户能看到自己的
- 密钥名称（如："我的 Google Key"）
- 提供商（如：Google, OpenAI）
- 状态（启用/禁用）
- 显示状态：`***CONFIGURED***`（不是真实密钥）
- 创建时间

### ❌ 用户不能看到自己的
- 真实的API密钥值（如：`sk-abc123xxx`）
- 加密后的密钥数据

### ❌ 用户不能看到其他用户的
- 其他用户的任何密钥信息
- 其他用户的密钥名称
- 其他用户的提供商选择
- 其他任何数据

---

## 实际对照表

### 场景1：用户A查看自己的密钥

| 数据项 | 显示内容 | 说明 |
|-------|---------|------|
| 密钥名称 | "我的 Gemini Key" | ✅ 可见 |
| 提供商 | Google | ✅ 可见 |
| 密钥值 | `***CONFIGURED***` | ✅ 隐藏真实密钥 |
| 状态 | 启用中 | ✅ 可见 |
| 创建时间 | 2026-03-11 | ✅ 可见 |

**前端看到的JSON：**
```json
{
  "id": "uuid-123",
  "name": "我的 Gemini Key",
  "provider": "Google",
  "key_status": "***CONFIGURED***",
  "is_active": true,
  "created_at": "2026-03-11T00:00:00Z"
}
```

---

### 场景2：用户A尝试看用户B的密钥

| 数据项 | 显示内容 | 说明 |
|-------|---------|------|
| 任何数据 | 空列表 `[]` | ❌ RLS阻止访问 |

**SQL层面：**
```sql
-- 用户A执行
SELECT * FROM vw_user_api_keys;
-- 结果：只有 user_id = '用户A-id' 的数据

-- 尝试直接访问底层表（会被RLS阻止）
SELECT * FROM user_api_keys WHERE user_id = '用户B-id';
-- 结果：0行（RLS策略过滤）
```

---

### 场景3：数据库管理员查看

| 数据项 | 显示内容 | 说明 |
|-------|---------|------|
| api_key_encrypted | `\xab\xcd\xef...` | 🔒 加密数据（无法直接读取）|
| 解密后 | 无法解密 | 🔒 需要 `app.encryption_key` |

**数据库看到的：**
```sql
SELECT id, user_id, name, provider, api_key_encrypted 
FROM user_api_keys;

-- 结果：
-- id        | user_id | name           | provider | api_key_encrypted
-- uuid-123  | user-a  | 我的 Gemini Key | Google   | \x1c20a9f3b...
-- uuid-456  | user-b  | 我的 OpenAI Key | OpenAI   | \x8e5d2c1a0...
```

**关键点：**
- 管理员看到的是加密后的二进制数据
- 没有 `app.encryption_key` 无法解密
- `app.encryption_key` 只存在于数据库配置中

---

## 安全机制验证

### 1. RLS策略验证
```sql
-- 验证：用户只能看到自己的数据
-- 以 User A 身份查询
SELECT current_user;  -- 'user-a-uuid'
SELECT * FROM user_api_keys;
-- 结果：仅返回 user_id = 'user-a-uuid' 的行

-- 尝试绕过RLS（会失败）
SELECT * FROM user_api_keys WHERE user_id != auth.uid();
-- 结果：0行
```

### 2. 视图安全验证
```sql
-- vw_user_api_keys 不包含 api_key_encrypted 列
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'vw_user_api_keys';

-- 结果：id, user_id, name, provider, key_status, is_active, created_at
-- 没有 api_key_encrypted！
```

### 3. 函数安全验证
```sql
-- get_secure_model_route 只在内存中临时解密
-- 密钥永不在任何表中明文存储
-- 返回的密钥5分钟后过期
```

---

## 攻击场景测试

### 测试1：XSS攻击窃取
```javascript
// 攻击代码尝试读取
const keys = localStorage.getItem('user_api_keys');
// 结果：null（密钥不在localStorage）

// 尝试从内存读取
const apiKeys = window.__API_KEYS__;
// 结果：undefined（密钥不在全局变量）
```

### 测试2：SQL注入攻击
```sql
-- 恶意输入尝试
'; DROP TABLE user_api_keys; --
-- 结果：失败（参数化查询防护）

' OR '1'='1
-- 结果：仍然只能看到当前用户的数据（RLS防护）
```

### 测试3：数据库泄露
```
黑客获取了数据库备份文件
- 看到：user_api_keys 表
- 看到：加密的 BYTEA 数据
- 无法：解密（没有 app.encryption_key）
```

---

## 总结

| 角色 | 能看到什么 | 不能看到什么 |
|-----|-----------|-------------|
| **普通用户** | 自己的密钥名称、提供商、状态、`*CONFIG*` | 真实密钥值、其他用户数据 |
| **其他用户** | 无 | 任何密钥数据 |
| **数据库管理员** | 加密后的二进制数据 | 明文密钥（无解密key）|
| **应用服务器** | 临时解密（5分钟） | 持久化明文存储 |

**核心保证：任何情况下，用户的真实API密钥都不会被其他用户获取。**
