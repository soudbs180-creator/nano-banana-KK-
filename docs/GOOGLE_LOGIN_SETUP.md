# Google 登录集成指南

## 已实现的功能

✅ 登录页面添加了 "使用 Google 登录" 按钮  
✅ OAuth 回调处理页面  
✅ 自动跳转和错误处理  

---

## 配置检查清单

### 1. Supabase 配置（已完成）

确保 Supabase Dashboard 中：
- ✅ Provider: Google 已启用
- ✅ Client ID 已填写
- ✅ Client Secret 已填写
- ✅ Authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`

### 2. Google Cloud Console 配置

1. 访问 https://console.cloud.google.com/apis/credentials
2. 选择你的 OAuth 2.0 客户端
3. 添加授权重定向 URI：
   ```
   https://your-project.supabase.co/auth/v1/callback
   ```
4. 确保你的域名在 "Authorized JavaScript origins" 中：
   ```
   https://kkai.plus
   https://localhost:3000  (开发环境)
   ```

### 3. Vercel 环境变量

确保已在 Vercel 中添加：
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## 测试步骤

1. 重新部署应用
2. 访问 https://kkai.plus
3. 点击登录页面的 "使用 Google 登录" 按钮
4. 应该跳转到 Google 授权页面
5. 授权后自动返回应用并登录

---

## 故障排除

### 问题1: "redirect_uri_mismatch"
**原因**: Google Cloud Console 中的重定向 URI 不匹配

**解决**:
1. 检查 Supabase 回调 URL
2. 在 Google Cloud Console 添加该 URL

### 问题2: 点击按钮无反应
**原因**: Supabase 配置缺失

**解决**: 检查 Supabase Dashboard → Authentication → Providers → Google 是否启用

### 问题3: 授权后跳转回登录页
**原因**: 回调页面处理失败

**解决**: 
- 检查浏览器控制台错误
- 确认数据库权限已修复（profiles 表 RLS）

---

## 文件变更

| 文件 | 变更 |
|-----|------|
| `src/components/auth/LoginScreen.tsx` | 添加 Google 登录按钮 |
| `src/components/auth/LoginScreen.css` | 添加按钮样式 |
| `src/pages/AuthCallback.tsx` | 新增 OAuth 回调处理 |
| `src/App.tsx` | 添加回调路由 |
