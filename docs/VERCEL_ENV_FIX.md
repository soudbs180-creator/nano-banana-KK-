# 🚀 Vercel 环境变量配置修复

## 问题确认 ✅

控制台显示：
```
[Supabase] 缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY
```

**原因**：Vercel 上没有配置环境变量，或配置后没有重新部署

---

## 🔧 修复步骤

### 步骤1：打开 Vercel Dashboard
1. 访问 https://vercel.com/dashboard
2. 进入你的项目（kkai.plus）
3. 点击 **Settings** 标签

### 步骤2：添加环境变量
左侧菜单 → **Environment Variables**

添加以下变量：

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

⚠️ **重要**：替换为你真实的 Supabase URL 和 Anon Key

### 步骤3：选择环境
确保选择了：
- ✅ Production
- ✅ Preview（可选）

### 步骤4：保存并重新部署
1. 点击 **Save**
2. 回到项目主页
3. 点击 **Redeploy** 或 **Deploy**

环境变量修改后**必须重新部署**才能生效！

---

## 📸 配置示例

```
┌─────────────────────────────────────────────────────────┐
│  Environment Variables                                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────┬─────────────────────────┐  │
│  │ VITE_SUPABASE_URL       │ https://xxxxx.supabase.co │ │
│  │ [Production ✓] [Preview ✓] [Development ]        │  │
│  └─────────────────────────┴─────────────────────────┘  │
│                                                          │
│  ┌─────────────────────────┬─────────────────────────┐  │
│  │ VITE_SUPABASE_ANON_KEY  │ eyJhbGciOiJIUzI1NiIs... │ │
│  │ [Production ✓] [Preview ✓] [Development ]        │  │
│  └─────────────────────────┴─────────────────────────┘  │
│                                                          │
│                      [Save]                              │
└─────────────────────────────────────────────────────────┘
```

---

## 🔥 快速验证

重新部署后，打开 https://kkai.plus

按 F12 → Console，输入：
```javascript
console.log('URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('KEY 存在:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
```

**应该输出**（不是 undefined）：
```
URL: https://your-project.supabase.co
KEY 存在: true
```

---

## 如果还是 undefined？

### 可能原因1：变量名拼写错误
检查是否完全一致：
- ✅ `VITE_SUPABASE_URL`
- ❌ `VITE_supabase_url`
- ❌ `SUPABASE_URL`

### 可能原因2：没有重新部署
环境变量保存后，必须点击 **Redeploy**！

### 可能原因3：Vercel 缓存问题
尝试：
1. 在 Vercel 点击 **Redeploy**
2. 或推送一个新 commit 触发部署

---

## 替代方案：使用 vercel.json

如果 Dashboard 配置不生效，创建 `vercel.json`：

```json
{
  "env": {
    "VITE_SUPABASE_URL": "@vite_supabase_url",
    "VITE_SUPABASE_ANON_KEY": "@vite_supabase_anon_key"
  }
}
```

然后使用 Vercel CLI 添加密钥：
```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

---

## 总结

| 步骤 | 操作 |
|-----|------|
| 1 | Vercel Dashboard → 项目 → Settings |
| 2 | Environment Variables → 添加两个变量 |
| 3 | 确保勾选 Production |
| 4 | Save → Redeploy |
| 5 | 验证 Console 不再显示 "配置缺失" |

完成后告诉我结果！
