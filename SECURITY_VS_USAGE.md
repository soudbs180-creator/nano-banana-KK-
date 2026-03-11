# 🔐 安全 vs 使用 - 对比说明

## 一句话总结

> **密钥存储加密（安全）≠ 密钥使用受阻（方便）**

---

## 对比图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户添加密钥                               │
├─────────────────────────────────────────────────────────────────────┤
│  用户输入: sk-abc123xxx                                             │
│       ↓                                                             │
│  HTTPS传输（SSL加密）                                                │
│       ↓                                                             │
│  服务端: pgp_sym_encrypt() 加密存储                                  │
│       ↓                                                             │
│  数据库: \x1c20a9f3...（无法直接读取）                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           用户使用密钥                               │
├─────────────────────────────────────────────────────────────────────┤
│  应用调用: getSecureModelRoute('gemini-pro')                        │
│       ↓                                                             │
│  数据库: 临时解密 → sk-abc123xxx（仅内存中）                          │
│       ↓                                                             │
│  返回给应用: { api_key: 'sk-abc123xxx', expires_at: '5分钟后' }       │
│       ↓                                                             │
│  应用调用: fetch('https://api.google.com', { api_key })             │
│       ↓                                                             │
│  5分钟后: 密钥自动过期，需重新获取                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 代码对比

### 旧代码（不安全）
```typescript
// ❌ 密钥存在 localStorage，任何人都能看到
const apiKey = localStorage.getItem('google_key');

fetch('https://api.google.com', {
  headers: { Authorization: `Bearer ${apiKey}` }
});
```

### 新代码（安全，但用法几乎一样）
```typescript
// ✅ 密钥加密存储，临时获取
const route = await getSecureModelRoute('gemini-pro');

fetch('https://api.google.com', {
  headers: { Authorization: `Bearer ${route.api_key}` }
});
```

**区别：就多了 `await getSecureModelRoute()` 这一行！**

---

## 性能对比

| 指标 | 旧方式 | 新方式 | 差异 |
|-----|-------|-------|------|
| 获取密钥 | 0ms (localStorage) | ~50ms (RPC) | +50ms（一次）|
| API调用 | 500ms | 500ms | 相同 |
| 密钥过期 | 永不 | 5分钟 | 更安全 |

**结论：** 只多花50ms获取密钥，之后使用完全相同。

---

## 兼容性方案

如果你不想改代码，用这个包装器：

```typescript
// 创建包装器（一次）
async function getApiKey(modelId: string) {
  const route = await getSecureModelRoute(modelId);
  return route?.api_key;
}

// 旧代码几乎不用改
const apiKey = await getApiKey('gemini-pro');  // 加 await
fetch('https://api.google.com', {
  headers: { Authorization: `Bearer ${apiKey}` }
});
```

---

## 实际使用场景

### 场景1：用户配置了自己的密钥
```
用户A配置了 Google 密钥
        ↓
调用 gemini-pro
        ↓
✅ 使用用户A自己的密钥（免费）
```

### 场景2：用户没配置密钥
```
用户B没有配置密钥
        ↓
调用 gemini-pro
        ↓
✅ 使用系统公共密钥（扣积分）
```

### 场景3：密钥优先级
```
1. 用户自己的密钥（优先）
2. 管理员配置的公共密钥
3. 报错：请先配置密钥
```

---

## 常见问题

**Q: 每次调用都要获取密钥吗？**  
A: 可以缓存5分钟，或者直接获取后批量调用。

**Q: 密钥过期了怎么办？**  
A: 重新调用 `getSecureModelRoute()` 获取新的。

**Q: 旧的代码还能用吗？**  
A: 能！加个包装器就行，见上方示例。

**Q: 会影响性能吗？**  
A: 几乎不会，就多50ms的RPC调用。

---

## 总结

| 方面 | 影响 |
|-----|------|
| 安全性 | 大幅提升 ✅ |
| 使用便利性 | 几乎不变 ✅ |
| 代码改动 | 很小 ✅ |
| 性能 | 几乎无影响 ✅ |

**放心使用，只改存储不改用法！**
