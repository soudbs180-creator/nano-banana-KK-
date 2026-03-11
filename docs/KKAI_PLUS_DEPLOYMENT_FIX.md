# kkai.plus 部署修复指南

## 你的配置信息

| 项目 | 值 |
|-----|---|
| 域名 | `kkai.plus` |
| 完整 URL | `https://kkai.plus` |
| 部署平台 | Vercel |

---

## 🔧 Supabase CORS 配置步骤

### 步骤1：登录 Supabase Dashboard
打开 https://supabase.com/dashboard → 你的项目

### 步骤2：进入 URL Configuration
左侧菜单 → **Authentication** → **URL Configuration**

### 步骤3：修改配置

**Site URL**:
```
https://kkai.plus
```

**Redirect URLs**（全部添加）：
```
http://localhost:3000
https://kkai.plus
https://kkai.plus/auth/callback
```

### 步骤4：保存
点击 **Save**，等待 1-2 分钟生效

---

## 📸 配置示例

```
┌─────────────────────────────────────────────────────────────┐
│  URL Configuration                                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Site URL *                                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ https://kkai.plus                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Redirect URLs                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ http://localhost:3000                               │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ https://kkai.plus                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ https://kkai.plus/auth/callback                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│                        [Save]                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 验证是否修复

配置保存后，打开 https://kkai.plus 尝试登录

或者在浏览器控制台测试：

```javascript
fetch('https://your-project.supabase.co/auth/v1/token', {
  method: 'POST',
  headers: {
    'apikey': 'your-anon-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'test@test.com',
    password: 'test123'
  })
})
.then(r => console.log('状态:', r.status))
.catch(e => console.error('错误:', e.message));
```

如果看到 `400` → CORS 正常 ✅（只是密码错误）
如果看到 `CORS error` → 配置还没生效，再等1分钟

---

## 🔥 如果还是不行？

可能是 Vercel 环境变量问题，检查：

1. 打开 https://vercel.com/dashboard
2. 你的项目 → Settings → Environment Variables
3. 确认有以下变量：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

4. 确保和本地 `.env` 文件中的值一致
5. 重新部署（环境变量修改后需要重新部署才能生效）

---

## 配置完成后

请回复我是否解决了问题！
