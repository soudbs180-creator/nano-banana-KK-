# KK Studio 部署指南

## 一、推送到 GitHub

### 1. 创建新仓库
1. 打开 https://github.com/new
2. 输入仓库名：`kk-studio`
3. 选择 **Private**（私有）或 **Public**（公开）
4. 点击 **Create repository**

### 2. 推送代码
在 KK Studio 文件夹中打开命令行，执行：

```bash
git init
git add .
git commit -m "Initial commit v1.0.0"
git branch -M main
git remote add origin https://github.com/你的用户名/kk-studio.git
git push -u origin main
```

---

## 二、部署到 Vercel

### 1. 连接 Vercel
1. 打开 https://vercel.com
2. 点击 **Sign Up** → 选择 **Continue with GitHub**
3. 授权 Vercel 访问 GitHub

### 2. 导入项目
1. 点击 **Add New...** → **Project**
2. 找到 `kk-studio` 仓库，点击 **Import**
3. 保持默认设置，点击 **Deploy**
4. 等待 1-2 分钟部署完成

### 3. 获取访问地址
部署成功后，你会得到一个地址：
```
https://kk-studio-xxx.vercel.app
```

这就是用户访问的网址！

---

## 三、更新版本

### 每次更新只需 3 步：

1. **修改代码和版本号**
   - 修改 `package.json` 中的 `"version": "1.0.1"`
   - 修改 `App.tsx` 中的 `v1.0.0` 为 `v1.0.1`

2. **推送到 GitHub**
   ```bash
   git add .
   git commit -m "Update to v1.0.1"
   git push
   ```

3. **自动部署**
   - Vercel 会自动检测到更新
   - 1-2 分钟后新版本上线
   - 用户刷新页面即可使用新版本

---

## 四、自定义域名（可选）

1. 在 Vercel 项目设置中点击 **Domains**
2. 添加你自己的域名
3. 按照提示配置 DNS

---

## 常用命令

| 操作 | 命令 |
|------|------|
| 查看状态 | `git status` |
| 提交更改 | `git add . && git commit -m "描述"` |
| 推送更新 | `git push` |
| 查看版本 | `git log --oneline` |
