# 🌐 Supabase 连接问题修复

## 问题现象
- 账号密码正确
- 显示 "网络连接不稳定" / "Failed to fetch"
- 重试3次后失败

## 最可能原因（按优先级）

### 1. CORS 未配置（90% 概率）

**检查步骤**：
1. 打开浏览器控制台 (F12)
2. 切换到 **Network** 标签页
3. 尝试登录，看红色失败请求
4. 点击失败请求，看 **Response** 或 **Console** 是否有 CORS 错误

**CORS 错误示例**：
```
Access to fetch at 'https://xxx.supabase.co/auth/v1/token' 
from origin 'https://your-domain.com' has been blocked by CORS policy
```

**修复方法**：

Supabase Dashboard → Authentication → URL Configuration

```
Site URL: https://your-actual-domain.com

Redirect URLs:
- https://your-actual-domain.com
- https://your-actual-domain.com/auth/callback
- http://localhost:3000              (本地开发)
```

⚠️ **重要**：必须使用你的 **实际部署域名**，不是 `localhost`

---

### 2. 环境变量错误

**检查方法**：
浏览器控制台输入：
```javascript
console.log('URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY?.substring(0,20));
```

**应该输出**：
```
URL: https://your-project.supabase.co
KEY: eyJhbGciOiJIUzI1NiIs...
```

**如果输出 `undefined`**：

检查 `.env` 文件：
```bash
# 项目根目录
ls -la .env

# 查看内容
cat .env
```

确保格式正确（没有引号，没有空格）：
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**然后重新构建**：
```bash
npm run build
# 或
npm run dev
```

---

### 3. Supabase 项目暂停

**检查方法**：
1. 打开 https://supabase.com/dashboard
2. 查看你的项目
3. 如果显示 "Paused" 或 "Inactive"
4. 点击 **Resume** 唤醒项目

免费项目一段时间不用会自动暂停！

---

### 4. 网络防火墙/代理

如果你在中国内地：
- Supabase 某些区域可能被墙
- 尝试使用代理/VPN
- 或更换 Supabase 区域（eu-west-1 通常可用）

---

## 快速诊断脚本

在浏览器控制台执行：

```javascript
// 1. 检查配置
console.log('=== Supabase 配置检查 ===');
console.log('URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('KEY 存在:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);

// 2. 测试连通性
console.log('=== 测试连通性 ===');
fetch('https://your-project.supabase.co/auth/v1/health', {
  headers: {
    'apikey': 'your-anon-key'
  }
})
.then(r => console.log('健康检查:', r.status))
.catch(e => console.error('连接失败:', e.message));

// 3. 测试 CORS
console.log('=== 测试 CORS ===');
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
.then(r => r.json().then(d => console.log('响应:', d)))
.catch(e => console.error('错误:', e.message));
```

---

## 修复步骤总结

| 步骤 | 操作 | 验证方式 |
|-----|------|---------|
| 1 | Supabase Dashboard 添加你的域名到 URL Configuration | 浏览器 Network 面板无 CORS 错误 |
| 2 | 检查 .env 文件是否正确 | 控制台输出正确的 URL |
| 3 | 重新构建并部署 | 新版本显示 "连接成功" |
| 4 | 检查 Supabase 项目状态 | Dashboard 显示 "Active" |

---

## 如果还是不行？

请提供：

1. **部署域名**（如 `https://kk-studio.vercel.app`）
2. **Supabase 项目 URL**（如 `https://xxxx.supabase.co`）
3. **浏览器控制台截图**（F12 → Console 的错误信息）
4. **Network 面板截图**（失败的请求详情）

---

## 临时解决方案

如果急需使用，点击 **"临时用户登录"** 按钮：

- 无需网络连接
- 24小时有效期
- 所有功能可用
- 数据本地存储
