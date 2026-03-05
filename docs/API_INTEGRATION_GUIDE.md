# API 集成指南

## 系统架构

本系统整合了以下 API 服务：

1. **12AI API** - 模型调用接口 (https://doc.12ai.org/api/)
2. **NewAPI Management** - 供应商管理接口 (https://docs.newapi.pro/en/docs/api)

---

## 1. 供应商系统

### 用户流程

1. **添加供应商**
   - 填写：供应商名称、Base URL、API Key
   - 可选：System Access Token（用于获取价格）、预算限制

2. **自动获取模型**
   - 点击"获取模型和价格"
   - 系统使用 System Access Token 调用 NewAPI 管理接口
   - 自动获取模型列表、分组、价格信息

3. **查看定价**
   - 在"成本估算"页面查看
   - 按供应商分组显示
   - 支持成本计算器

### 存储机制

```typescript
interface Supplier {
  id: string;
  name: string;           // 用户自定义名称
  baseUrl: string;        // API Base URL
  apiKey: string;         // API Key（本地存储）
  systemToken?: string;   // System Access Token（一次性使用，不存储）
  budgetLimit?: number;   // 预算限制
  models: SupplierModel[];
}
```

---

## 2. 12AI API 调用

### OpenAI 兼容端点

```
POST /v1/chat/completions
Authorization: Bearer {api_key}
```

适用于大多数模型。

### Gemini 原生端点

```
POST /v1beta/models/{model}:generateContent?key={api_key}
```

适用于 Gemini 系列模型（gemini-1.5-pro, gemini-1.5-flash 等）。

### 调用优先级

1. **积分模型** → 使用系统代理，扣除积分
2. **用户供应商** → 使用配置的供应商 API
3. **用户自定义 Key** → 使用用户的 API Key
4. **系统默认** → 使用系统配置（如未配置则报错）

---

## 3. 积分系统

### 模型配置

管理员在后台配置积分模型：

| 模型ID | 显示名称 | 积分消耗 |
|--------|----------|----------|
| gemini-3.1-flash-image-preview@system | Gemini 3.1 Flash Image | 1 |
| gemini-3-pro-image-preview@system | Gemini 3 Pro Image | 2 |
| gemini-2.5-flash-image@system | Gemini 2.5 Flash Image | 1 |

### 调用流程

1. 检查用户积分余额
2. 调用系统代理 API
3. 扣除相应积分
4. 返回结果

---

## 4. NewAPI 管理接口

### 认证

所有管理接口使用 **System Access Token**：

```
Authorization: Bearer {system_access_token}
```

### 主要端点

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/user/dashboard | GET | 验证 Token |
| /api/channel/ | GET | 获取渠道列表（含模型） |
| /api/pricing | GET | 获取价格信息 |

### 获取模型流程

```typescript
// 1. 验证 Token
const verify = await verifyAccessToken(token);

// 2. 获取渠道列表
const channels = await listChannels(token);

// 3. 获取价格信息
const pricing = await getPricing(token);

// 4. 合并数据
const models = mergeChannelsAndPricing(channels, pricing);
```

---

## 5. 文件结构

```
src/
├── services/
│   ├── supplierService.ts          # 供应商管理
│   ├── newApiManagementService.ts  # NewAPI 管理接口
│   ├── AI12APIService.ts           # 12AI API 调用
│   ├── modelCaller.ts              # 统一模型调用
│   └── index.ts                    # 导出
├── components/
│   ├── SupplierManager.tsx         # 供应商管理 UI
│   ├── SupplierModal.tsx           # 添加/编辑供应商
│   ├── SupplierPricing.tsx         # 供应商定价展示
│   └── AdminSystem.tsx             # 后台管理
└── pages/
    └── CostEstimation.tsx          # 成本估算页面
```

---

## 6. 数据库 Schema

### 新增表

```sql
-- 管理员配置的积分模型
CREATE TABLE public.admin_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id TEXT NOT NULL UNIQUE,
    display_name TEXT,
    provider TEXT,
    credit_cost INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE
);

-- 管理员设置
CREATE TABLE public.admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    password_hash TEXT NOT NULL,
    system_proxy_key TEXT
);

-- 积分交易记录
CREATE TABLE public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    amount INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'recharge', 'usage', 'refund'
    model_id TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 新增函数

```sql
-- 验证管理员密码
verify_admin_password(input_password TEXT)

-- 检查用户积分
check_user_credits(user_id UUID, required_credits INTEGER)

-- 扣除用户积分
deduct_user_credits(user_id UUID, credits INTEGER, model_id TEXT)

-- 管理员充值
admin_recharge_credits(target_user_id UUID, amount INTEGER, admin_user_id UUID)

-- 获取模型积分消耗
get_model_credit_cost(model_id TEXT)
```

---

## 7. 配置说明

### 环境变量

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# 可选：默认 12AI Base URL
VITE_12AI_BASE_URL=https://cdn.12ai.org
```

### 管理员默认密码

- 默认密码：`123`
- MD5 哈希：`202cb962ac59075b964b07152d234b70`

---

## 8. 使用示例

### 添加供应商

```typescript
import { supplierService } from './services';

const supplier = await supplierService.create({
  name: 'My Provider',
  baseUrl: 'https://ai.example.com',
  apiKey: 'sk-...',
  systemToken: 'sys-...', // 可选
  budgetLimit: 100, // 可选
});
```

### 调用模型

```typescript
import { modelCaller } from './services';

const result = await modelCaller.call({
  modelId: 'gpt-4',
  messages: [
    { role: 'user', content: 'Hello' }
  ],
  temperature: 0.7,
});

if (result.success) {
  console.log(result.content);
} else {
  console.error(result.error);
}
```

### 获取供应商定价

```typescript
import { supplierService } from './services';

const pricing = supplierService.getPricingForCostEstimation();
// [
//   {
//     supplierName: 'My Provider',
//     supplierId: '...',
//     models: [...]
//   }
// ]
```
