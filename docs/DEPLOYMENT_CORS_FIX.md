# 🚀 部署后登录失败修复（本地OK，线上不行）

## 问题确认 ✅

| 环境 | 结果 |
|-----|------|
| 本地开发 (`localhost:3000`) | ✅ 可以登录 |
| 线上部署 (`your-domain.com`) | ❌ 无法登录，显示网络错误 |

**根本原因**：Supabase CORS 配置只允许了 localhost，没允许你的线上域名

---

## 🔧 修复步骤（2分钟）

### 步骤1：打开 Supabase Dashboard
1. 访问 https://supabase.com/dashboard
2. 进入你的项目

### 步骤2：配置 URL
1. 左侧菜单 → **Authentication**
2. 点击 **URL Configuration**

### 步骤3：添加你的部署域名

**Site URL**:
```
https://your-domain.com
```

**Redirect URLs**（添加以下3个）：
```
http://localhost:3000
https://your-domain.com
https://your-domain.com/auth/callback
```

⚠️ **替换 `your-domain.com` 为你的实际部署域名！**

例如：
- Vercel: `https://kk-studio-xxx.vercel.app`
- Netlify: `https://kk-studio-xxx.netlify.app`
- 自定义域名: `https://ai.yourdomain.com`

### 步骤4：保存并测试
点击 **Save**，然后重新登录

---

## 📸 配置截图示例

```
┌─────────────────────────────────────────────┐
│  URL Configuration                           │
├─────────────────────────────────────────────┤
│                                             │
│  Site URL                                   │
│  ┌─────────────────────────────────────┐   │
│  │ https://kk-studio.vercel.app        │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Redirect URLs                              │
│  ┌─────────────────────────────────────┐   │
│  │ http://localhost:3000               │   │
│  │ https://kk-studio.vercel.app        │   │
│  │ https://kk-studio.vercel.app/auth/callback │ │
│  └─────────────────────────────────────┘   │
│                                             │
│                    [Save]                   │
└─────────────────────────────────────────────┘
```

---

## 🧪 验证 CORS 是否配置正确

在浏览器控制台执行：

```javascript
// 替换为你的 Supabase URL
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
.catch(e => console.error('CORS 错误:', e.message));
```

**如果看到 `CORS error`** → 配置还没生效，等1-2分钟再试

**如果看到 `400 Bad Request`** → CORS 正常，只是密码错误

---

## 🔥 其他可能原因

### 原因2：环境变量不同
本地和部署环境使用了不同的 `.env`

**检查**：
```bash
# 本地
cat .env

# 部署平台（Vercel/Netlify）的环境变量设置
```

确保线上环境变量和本地一致：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 原因3：HTTPS 问题
某些浏览器在 HTTPS 页面中阻止 HTTP 请求

**解决**：确保 Supabase URL 是 `https://`

### 原因4：部署平台限制
某些平台（如国内的云服务器）可能限制外网连接

**解决**：
- 检查平台的安全组/防火墙
- 允许访问 `*.supabase.co`

---

## ❓ 请确认

为了更快帮你解决，请回复：

1. **你的部署域名是什么？** （如 `https://xxx.vercel.app`）
2. **部署平台是什么？** （Vercel / Netlify / 服务器 / 其他）
3. **是否已在 Supabase 中添加该域名？**

或者直接发给我你的部署链接，我帮你检查！
