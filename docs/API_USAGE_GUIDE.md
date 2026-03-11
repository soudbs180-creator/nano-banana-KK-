# API密钥安全架构 - 使用指南

## 核心问题：会影响密钥请求吗？

**答案：不会！** 密钥正常使用，只是**存储更安全**了。

---

## 请求流程对比

### 旧方式（不安全）
```javascript
// 密钥存在 localStorage
const apiKey = localStorage.getItem('google_key');

// 直接调用API
fetch('https://api.google.com', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});
```

### 新方式（安全）
```javascript
// 1. 从服务端获取临时路由（包含临时解密的密钥）
const route = await getSecureModelRoute('gemini-pro');

// 2. 使用临时密钥调用API
fetch(route.base_url, {
  headers: { 'Authorization': `Bearer ${route.api_key}` }
});

// 3. 密钥5分钟后自动过期，不在任何地方存储
```

---

## 具体使用示例

### 方式1：使用安全服务（推荐）

```typescript
import { callAiApiSecure } from '@/services/security/apiKeySecureStorage';

// 调用AI API - 密钥自动处理
const result = await callAiApiSecure(
  'gemini-pro',  // 模型ID
  [{ role: 'user', content: '你好' }],  // 消息
  {
    temperature: 0.7,
    max_tokens: 2000
  }
);

console.log(result.content);  // AI回复
```

### 方式2：手动获取临时密钥

```typescript
import { getSecureModelRoute } from '@/services/security/apiKeySecureStorage';

// 1. 获取路由（优先使用用户自己的密钥）
const route = await getSecureModelRoute('gemini-pro');

if (!route) {
  throw new Error('请先配置API密钥');
}

// 2. 使用临时密钥调用
const response = await fetch(`${route.base_url}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${route.api_key}`,  // 临时密钥，5分钟过期
    'X-Request-ID': crypto.randomUUID()
  },
  body: JSON.stringify({
    model: route.model_id,
    messages: [{ role: 'user', content: '你好' }]
  })
});

// 3. 密钥自动过期，不需要清理
```

### 方式3：兼容旧代码（渐进迁移）

```typescript
import { getSecureModelRoute } from '@/services/security/apiKeySecureStorage';

// 包装旧函数
async function getApiKeyForModel(modelId: string): Promise<string> {
  const route = await getSecureModelRoute(modelId);
  if (!route) throw new Error('未配置密钥');
  return route.api_key;  // 临时密钥
}

// 旧代码几乎不用改
const apiKey = await getApiKeyForModel('gemini-pro');
await fetch('https://api.google.com', {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});
```

---

## 密钥优先级逻辑

```
用户请求模型 gemini-pro
        ↓
[1] 检查用户是否配置了 Google 提供商的密钥
        ↓
   ├─ 有 → 使用用户自己的密钥（免费，不扣积分）
   │
   └─ 无 → [2] 检查管理员配置的公共模型
              ↓
             使用系统密钥（扣积分）
```

---

## 关键保证

| 问题 | 答案 |
|-----|------|
| 密钥能用吗？ | ✅ 能用，临时解密 |
| 需要改代码吗？ | ✅ 只需改获取密钥的方式 |
| 性能有影响吗？ | ✅ 无影响，一次RPC调用 |
| 旧数据兼容吗？ | ✅ 兼容，渐进迁移 |

---

## 迁移检查清单

### 如果你是开发者

- [ ] 找到所有 `localStorage.getItem('api_key')` 的地方
- [ ] 替换为 `await getSecureModelRoute(modelId)`
- [ ] 或者使用 `await callAiApiSecure(modelId, messages)`

### 如果你是用户

- [ ] 在 "我的密钥" 页面添加API密钥
- [ ] 正常使用应用，无需其他操作

---

## 故障排除

### 问题1：调用API时报 "未配置密钥"
```typescript
// 原因：没有配置任何密钥
// 解决：
await addUserApiKey('我的Key', 'Google', 'sk-xxxx');
```

### 问题2：临时密钥过期
```typescript
// 原因：密钥超过5分钟
// 解决：重新获取
const route = await getSecureModelRoute('gemini-pro');
// 用新的 route.api_key 调用
```

### 问题3：想用自己的密钥优先
```typescript
// 配置对应提供商的密钥即可
// 优先级：用户密钥 > 系统密钥
```

---

## 总结

```
┌──────────────────────────────────────────────┐
│               正常使用不受影响                │
├──────────────────────────────────────────────┤
│  存储：加密（安全）                            │
│  使用：临时解密（方便）                        │
│  效果：安全 + 便利                             │
└──────────────────────────────────────────────┘
```
