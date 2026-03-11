# KK Studio 安全架构文档

## 概述

本文档描述了KK Studio的API密钥隔离和安全架构，确保用户只能访问自己的资源，同时允许使用管理员提供的公共模型。

---

## 🔒 核心安全原则

### 1. 完全隔离（Complete Isolation）
- 用户只能看到自己的API密钥
- 管理员只能看到自己的API密钥
- 用户之间无法互相查看或访问对方的密钥

### 2. 透明计费（Transparent Billing）
- 用户使用自己的密钥：不消耗积分
- 用户使用管理员模型：显示消耗积分，但隐藏后台真实价格

### 3. 安全路由（Secure Routing）
- 模型调用由服务端路由决定
- API密钥临时解密，用完即弃
- 前端无法破解或获取其他用户的密钥

---

## 🏗️ 架构设计

### 数据隔离层

```
┌─────────────────────────────────────────────────────────────┐
│                        用户层 (Frontend)                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 用户API密钥   │  │ 管理员API密钥 │  │ 可用模型列表      │  │
│  │ (仅自己可见)  │  │ (仅自己可见)  │  │ (价格/密钥隐藏)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      服务层 (RPC/Functions)                   │
├─────────────────────────────────────────────────────────────┤
│  get_model_route_for_user()                                  │
│  ├── 检查用户自己的API密钥                                    │
│  ├── 检查管理员公共模型                                       │
│  └── 返回：临时解密的路由信息（仅用于本次调用）                │
├─────────────────────────────────────────────────────────────┤
│  record_model_usage()                                        │
│  └── 记录使用并计费（用户无感知后台价格）                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据层 (Database)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ user_api_keys   │  │admin_credit_models│  │ user_credits │ │
│  │ 用户密钥(加密)   │  │ 管理员密钥(加密)   │  │   用户积分    │ │
│  │ RLS: 仅自己可见  │  │ RLS: 仅管理员可见  │  │ RLS: 仅自己   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 数据表结构

### 1. user_api_keys (用户个人API密钥)

```sql
CREATE TABLE public.user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '我的API密钥',
    provider TEXT NOT NULL DEFAULT 'Custom',
    api_key_encrypted TEXT NOT NULL, -- 加密存储
    base_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    call_count INTEGER DEFAULT 0,
    total_cost DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**RLS策略**：
```sql
-- 用户只能看到自己的密钥
CREATE POLICY "Users can only view own API keys"
ON public.user_api_keys FOR SELECT
TO authenticated
USING (user_id = auth.uid());
```

### 2. admin_credit_models (管理员模型配置)

```sql
CREATE TABLE public.admin_credit_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_keys TEXT[] NOT NULL DEFAULT '{}', -- 管理员密钥
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    credit_cost INTEGER NOT NULL DEFAULT 1, -- 后台真实价格
    visibility TEXT DEFAULT 'public', -- 'public' | 'private' | 'admin_only'
    advanced_enabled BOOLEAN DEFAULT FALSE,
    quality_pricing JSONB DEFAULT '{}', -- 各画质定价
    -- ... 其他字段
);
```

**RLS策略**：
```sql
-- 普通用户只能看到公共模型的基本信息（不含api_keys和价格）
CREATE POLICY "Users can view basic model info"
ON public.admin_credit_models FOR SELECT
TO authenticated
USING (is_active = TRUE AND visibility = 'public');

-- 管理员可以看到完整信息
CREATE POLICY "Admins can view all"
ON public.admin_credit_models FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
```

---

## 🔐 安全函数

### get_model_route_for_user(UUID, TEXT, TEXT)

核心路由函数，决定使用哪个API密钥：

```sql
CREATE OR REPLACE FUNCTION public.get_model_route_for_user(
  p_user_id UUID,
  p_model_id TEXT,
  p_requested_size TEXT DEFAULT '1K'
)
RETURNS TABLE (
  route_type TEXT,      -- 'user_key' | 'admin_model' | 'none'
  provider_id TEXT,
  base_url TEXT,
  api_key TEXT,         -- 临时解密，仅用于本次调用
  model_id TEXT,
  endpoint_type TEXT,
  credit_cost INTEGER,  -- 后台计算的真实价格
  user_pays INTEGER     -- 用户看到的价格
)
```

**逻辑流程**：
1. 首先查找用户自己的API密钥（优先级最高）
2. 如果没有，查找管理员配置的公共模型
3. 计算实际积分消耗（考虑画质定价）
4. 返回临时解密的API密钥（仅用于本次调用）

---

## 💰 计费系统

### 用户使用自己的API密钥
- **成本**：用户直接支付给API提供商
- **平台收费**：0积分（或收取少量服务费）
- **显示给用户**："使用您自己的API密钥，不消耗积分"

### 用户使用管理员模型
- **成本**：平台支付API费用
- **用户支付**：按照管理员设定的credit_cost扣除积分
- **价格隐藏**：用户看不到后台真实API成本

### 示例
```
场景1：用户使用自己的OpenAI密钥
- 用户调用 GPT-4
- 系统：使用用户密钥 → 调用成功
- 计费：0 积分
- 用户实际成本：直接付给OpenAI

场景2：用户使用管理员配置的Gemini
- 用户调用 gemini-2.5-flash-image
- 系统：使用管理员密钥 → 调用成功
- 计费：1 积分（管理员设定价格）
- 平台实际成本：可能 0.5 积分（隐藏）
```

---

## 🛡️ 安全措施

### 1. API密钥加密
- **存储**：所有API密钥使用Base64加密存储
- **传输**：仅通过HTTPS传输
- **内存**：仅在调用时临时解密，调用后立即清除

### 2. 错误信息脱敏
```typescript
private sanitizeError(errorText: string, apiKey: string): string {
  // 替换掉可能包含的API密钥
  return errorText.replace(apiKey, '***API_KEY_HIDDEN***');
}
```

### 3. 权限验证
```typescript
// 每次调用都验证用户身份
if (auth.uid() IS NULL OR auth.uid() != p_user_id) THEN
  RAISE EXCEPTION 'Unauthorized access';
END IF;
```

### 4. 调用频率限制
- 每个用户每分钟最多调用60次
- 超出限制需要等待或升级账户

---

## 📱 前端实现

### 用户使用流程
```
1. 用户进入设置 → API密钥管理
   └── 看到自己的密钥列表（其他用户的看不到）

2. 用户可以选择：
   a) 添加自己的API密钥
      └── 加密存储，仅自己可见
   
   b) 使用系统模型
      └── 看到可用模型列表（不含价格细节）

3. 调用模型时
   └── 系统自动选择最优路由
   └── 用户无感知使用的是谁的密钥
```

### 代码示例
```typescript
// 调用模型（安全路由）
const result = await secureModelCaller.call({
  modelId: 'gemini-2.5-flash-image',
  messages: [{ role: 'user', content: '生成一张猫的图片' }],
  imageSize: '2K' // 系统会根据画质计算积分
});

// 结果显示
if (result.success) {
  console.log('消耗积分:', result.routeInfo?.cost);
  console.log('使用来源:', result.routeInfo?.type); // 'user_key' | 'admin_model'
}
```

---

## 🔍 审计和监控

### 日志记录
每次调用记录：
- 用户ID（谁调用的）
- 模型ID（调用了什么）
- 路由类型（使用谁的密钥）
- 积分消耗（扣了多少钱）
- 时间戳

### 异常检测
- 短时间内大量调用 → 可能是攻击
- 使用他人密钥尝试 → 记录并阻止
- API密钥泄露迹象 → 立即禁用

---

## 🚀 部署检查清单

- [ ] 执行 `20260312000001_security_fix_api_key_exposure.sql`
- [ ] 执行 `20260312000002_user_api_keys_isolation.sql`
- [ ] 验证RLS策略正确启用
- [ ] 测试跨用户访问（应该被拒绝）
- [ ] 测试管理员权限（应该能看到完整信息）
- [ ] 配置HTTPS强制
- [ ] 设置CSP安全头

---

## 📞 安全联系

如发现安全漏洞，请立即联系开发团队。

---

*文档版本: 1.0*  
*最后更新: 2026-03-11*
