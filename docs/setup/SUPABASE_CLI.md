# Supabase CLI Windows 安装指南

## 方法一：使用 Scoop (推荐)

```powershell
# 1. 安装 Scoop (如果还没有)
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# 2. 安装 Supabase CLI
scoop install supabase

# 3. 验证安装
supabase --version
```

## 方法二：直接下载可执行文件

### 第 1 步：下载
1. 访问 https://github.com/supabase/cli/releases/latest
2. 下载 `supabase_windows_amd64.tar.gz`
3. 解压到 `C:\Users\Administrator\.supabase\bin\`

### 第 2 步：添加到环境变量
```powershell
# 以管理员身份运行 PowerShell
[Environment]::SetEnvironmentVariable(
    "Path", 
    [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\Users\Administrator\.supabase\bin", 
    "User"
)
```

### 第 3 步：验证
```powershell
# 重启终端后执行
supabase --version
```

## 方法三：使用项目本地安装

```bash
# 在项目目录安装 (不需要全局)
cd <project-root>
npm install --save-dev supabase

# 使用 npx 运行
npx supabase --version
```

---

## 配置步骤（安装完成后）

### 1. 登录 Supabase
```bash
supabase login
```
浏览器会打开，点击授权即可。

### 2. 初始化项目（如果还没初始化）
```bash
supabase init
```

### 3. 链接远程项目
```bash
supabase link --project-ref ovdjhdofjysanamgkfng
```

### 4. 推送数据库迁移
```bash
supabase db push
```

---

## 验证配置

```bash
# 查看链接状态
supabase status

# 查看远程数据库
supabase db remote commit
```

---

## 常见问题

### 问题：命令找不到
**解决**：重启终端或 PowerShell，确保环境变量已加载

### 问题：权限不足
**解决**：以管理员身份运行 PowerShell

### 问题：链接失败
**解决**：
1. 确认已运行 `supabase login`
2. 检查项目 ID 是否正确：`ovdjhdofjysanamgkfng`
3. 检查网络连接

---

## 备选：手动 SQL 配置

如果 CLI 配置困难，请使用方法 2（Dashboard 手动执行 SQL）：

1. 访问 https://app.supabase.com/project/ovdjhdofjysanamgkfng
2. 点击左侧 **SQL Editor**
3. 点击 **New Query**
4. 打开文件 `supabase/migrations/20250303000000_complete_setup.sql`
5. 复制全部内容粘贴到 SQL Editor
6. 点击 **Run** 执行
