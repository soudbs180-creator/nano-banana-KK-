## 更新 Credits 系统 - 说明与部署指南

目的：描述对 credits/余额系统的架构与数据变更（迁移、回填、服务端兼容性、回滚策略），并给出可执行的部署步骤与验证检查表，以便开发/运维安全发布该迁移。

概览
- 发布时间：2025-03-03（迁移文件：`supabase/migrations/20250303000001_update_credits_system.sql`）
- 影响范围：用户余额表（`credits` / `user_credits` / `account_balances` 等——请对照实际 SQL），相关触发器、视图、索引、函数与后端业务逻辑。
- 风险等级：中 — 该变更会修改账面金额字段或累计逻辑，需谨慎回滚与验证。

主要变更（从 `supabase/migrations/20250303000001_update_credits_system.sql` 提取）
- 在 `public.profiles` 表上：
  - 如表不存在，创建 `public.profiles(id UUID PRIMARY KEY REFERENCES auth.users(id), email TEXT, credits DECIMAL DEFAULT 0, created_at, updated_at)`，并启用行级安全 (RLS) 及相应的 SELECT/UPDATE policy（仅允许用户读取/更新自己的 profile）。
  - 如果表已存在但缺少 `credits` 列，则添加 `credits DECIMAL DEFAULT 0`。
- 新增触发器与函数：
  - `public.handle_new_user()`：在 `auth.users` 插入后自动为新用户在 `profiles` 中创建记录（触发器 `on_auth_user_created`）。
- 新增 `public.credit_transactions` 表：
  - 字段包括 `id UUID PK`, `user_id UUID REFERENCES auth.users(id)`, `amount DECIMAL`, `type TEXT CHECK (type IN ('admin_recharge','purchase','consumption','refund'))`, `description TEXT`, `metadata JSONB`, `created_at TIMESTAMP`。
  - 启用 RLS 并创建 policy："Users read own transactions"（仅能读取自己的交易）、"Admin insert transactions"（允许插入）。
  - 为 `user_id`, `type`, `created_at` 创建索引（提高查询性能）。
- 新增或替换的业务函数：
  - `public.admin_recharge_credits(target_user_id UUID, amount DECIMAL, description TEXT)`：更新 `profiles.credits` 并插入一条 `credit_transactions`（type='admin_recharge'）。
  - `public.consume_credits(amount DECIMAL, description TEXT, metadata JSONB)`：检查并减少当前用户余额，插入 `credit_transactions`（负值，type='consumption'），返回 BOOLEAN 表示是否成功。
  - `public.get_user_stats(target_user_id UUID)`：聚合返回 `total_consumed`, `total_recharged`, `current_balance`, `transaction_count`。
  - `public.is_admin()`：基于 `profiles.email` 简单判断是否为管理员。
- 权限与授权：授予 `anon`/`authenticated` schema 使用权限及对 `profiles`、`credit_transactions` 的操作权限，向 `authenticated` 授予对上述函数的执行权限。
- 数据回填：脚本在迁移末尾对缺失 `profiles` 的 `auth.users` 执行插入回填（为已有用户创建 `profiles` 记录，credits 默认为 0）。

下面的“迁移 SQL 摘要”部分包含关键 SQL 片段，便于审阅或贴入 deploy notes。

部署前准备
- 备份数据库：使用 supabase/pgdump 或云提供商的快照功能。记录备份 ID。
- 在测试环境（staging）执行完整迁移并运行回归测试，包含关键财务流程（充值、扣费、退款、结算）。
- 通知利益相关方：客服、财务、产品、在变更窗口内观察异常流量的同事。
- 确定回滚窗口与联系人：DBA 工具人、拥有权限的工程师联系方式。

部署步骤（典型）
1. 在部署前 30 分钟：将系统设为只读或降低并发（若有必要）。
2. 执行迁移脚本：

   - 使用 supabase CLI 或 psql 运行迁移文件：

     ```powershell
     supabase db push --file supabase/migrations/20250303000001_update_credits_system.sql
     # 或
     psql "$DATABASE_URL" -f supabase/migrations/20250303000001_update_credits_system.sql
     ```

3. 运行数据回填/修正任务（如果迁移中包含 ALTER + UPDATE）：

   - 例如：逐批更新历史记录，使用小批量（LIMIT/OFFSET 或基于 ID 范围）。避免长事务。

4. 更新或重载与余额计算相关的数据库函数/触发器。
5. 重新部署后端服务：确保 ORM/类型定义与数据库变更一致。
6. 清理缓存（Redis、CDN 相关的余额缓存）并触发异步任务队列处理失败重试。

验证与回归检查
- 快速查询样例：

  - 样例余额快照（在变更前后对比）：

    ```sql
    SELECT user_id, SUM(amount) as total FROM credits GROUP BY user_id ORDER BY user_id LIMIT 10;
    ```

- 核心场景测试：
  - 新增充值：金额是否正确入账并可消费。
  - 扣费：并发扣费是否出现负余额或重复扣款。
  - 退款/回滚场景。
  - 定期结算/到期逻辑（若引入 `expires_at`）。

回滚策略
- 快速回滚：如果变更只是添加列或索引且没有破坏兼容性，可回退服务并保留数据列；如果变更包含破坏性操作（如删列、变更类型），请遵循下面策略：
  1. 立即暂停写入（进入只读或停止消费队列）
  2. 如果需要，用备份恢复数据库（可能需要若干分钟到数小时，视数据量而定）
  3. 回滚应用代码到上一个兼容版本
  4. 通知用户与利益相关方

注意事项与最佳实践
- 小批量回填：对大量历史数据使用分页或基于时间/ID 的分段处理，避免单次大事务导致锁表。
- 以幂等方式设计回填脚本：支持重试且不会重复计费。
- 指定维护窗口并在窗口内执行对外通知。
- 记录所有变更与 db 备份 ID，便于审计与回溯。

附录：常用命令
- 导出数据库（Postgres）：

  ```bash
  pg_dump --format=custom --file=backup_$(date +%F).dump "$DATABASE_URL"
  ```

- 恢复数据库：

  ```bash
  pg_restore --dbname "$DATABASE_URL" --clean backup_2025-03-02.dump
  ```

负责人与联系方式
- 变更 owner: @your-team-or-person
- DBA: @dba-on-call

替换说明
- 本文档为模板：请将“主要变更”与 SQL 片段替换为 `supabase/migrations/20250303000001_update_credits_system.sql` 中的实际内容，并补充任何特定回填脚本与注意事项。
# 积分系统配置 / Update Credits System

## 快速操作指令

### 方法 1：Supabase Dashboard（推荐，30秒完成）

1. **打开 SQL Editor**
   ```
   https://app.supabase.com/project/ovdjhdofjysanamgkfng/sql-editor
   ```

2. **新建查询**
   - 点击 "+ New Query"

3. **执行增量更新 SQL**
   - 打开文件：`supabase/migrations/20250303000001_update_credits_system.sql`
   - 复制全部内容
   - 粘贴到 SQL Editor
   - 点击 "Run"

4. **完成！**

---

### 方法 2：使用 Supabase CLI

```bash
# 进入项目目录
cd <project-root>

# 登录（如未登录）
npx supabase login

# 链接项目
npx supabase link --project-ref ovdjhdofjysanamgkfng

# 推送迁移
npx supabase db push
```

---

## 配置内容说明

### 核心表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `profiles` | 用户资料 | `credits` (积分余额) |
| `credit_transactions` | 交易记录 | `amount`, `type` (充值/消费) |

### 核心函数

| 函数 | 用途 | 调用方式 |
|------|------|----------|
| `admin_recharge_credits(user_id, amount, description)` | 管理员充值 | SQL 调用 |
| `consume_credits(amount, description, metadata)` | 消费积分 | SQL 调用，返回 true/false |
| `get_user_stats(user_id)` | 获取统计 | SQL 调用 |
| `is_admin()` | 检查管理员 | SQL 调用 |

### 充值与消费联动逻辑

```
充值流程：
admin_recharge_credits() 
    ├── 更新 profiles.credits (+amount)
    └── 插入 credit_transactions (type='admin_recharge')

消费流程：
consume_credits()
    ├── 检查 profiles.credits >= amount
    ├── 更新 profiles.credits (-amount)
    └── 插入 credit_transactions (type='consumption')
```

---

## 设置管理员

执行 SQL 后，设置管理员账户：

```sql
-- 方法 1：修改你的用户邮箱包含 @admin
UPDATE public.profiles 
SET email = 'yourname@admin.com' 
WHERE id = '你的用户ID';

-- 方法 2：或者直接指定你的邮箱为管理员
-- 修改 is_admin() 函数中的判断条件
```

---

## 验证配置

执行后在 SQL Editor 运行：

```sql
-- 检查表是否存在
SELECT * FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('profiles', 'credit_transactions');

-- 检查函数是否存在
SELECT proname FROM pg_proc WHERE proname IN ('admin_recharge_credits', 'consume_credits', 'is_admin');

-- 测试充值（替换为实际用户ID）
SELECT public.admin_recharge_credits('你的用户ID', 100, '测试充值');

-- 查看余额
SELECT * FROM public.profiles WHERE id = '你的用户ID';
```

---

## 故障排除

### 问题 1：表已存在错误
**解决**：脚本使用 `IF NOT EXISTS`，可以安全重试

### 问题 2：函数已存在错误
**解决**：脚本使用 `CREATE OR REPLACE`，会自动更新

### 问题 3：权限不足
**解决**：确保在 Supabase Dashboard 中以项目所有者身份执行

### 问题 4：充值后余额未更新
**解决**：检查 `profiles` 表的 RLS 策略是否正确

---

## 一键复制 SQL

```sql
-- 完整配置在此文件中：
-- supabase/migrations/20250303000001_update_credits_system.sql
```

打开该文件，复制全部内容到 SQL Editor 执行即可。
### 自动提取的迁移摘要（来自 supabase/migrations/20250303000001_update_credits_system.sql）

- Profiles 表
  - 创建 public.profiles（若不存在）：id UUID PK、email TEXT、credits DECIMAL DEFAULT 0、created_at/updated_at，并启用行级安全 (RLS) 以及 "Users can read own profile" 和 "Users can update own profile" 策略。
  - 已存在时：为 profiles 添加 credits DECIMAL DEFAULT 0 列（若缺失）。

- 触发器与回填
  - public.handle_new_user()：在 uth.users 插入后为新用户创建 profiles（触发器 on_auth_user_created）。
  - 迁移末尾有回填脚本：为已有 uth.users 创建缺失的 profiles（credits 默认为 0）。

- 交易表与索引
  - 新建 public.credit_transactions：id UUID PK、user_id UUID REFERENCES auth.users(id)、mount DECIMAL、	ype TEXT CHECK(...)、description TEXT、metadata JSONB、created_at TIMESTAMP。
  - 启用 RLS 并创建 policy："Users read own transactions"（仅读自己的交易）、"Admin insert transactions"（允许插入）。
  - 创建索引：user_id、	ype、created_at。

- 关键函数
  - public.admin_recharge_credits(target_user_id UUID, amount DECIMAL, description TEXT)：为目标用户增加 profiles.credits 并插入 credit_transactions（type='admin_recharge'）。
  - public.consume_credits(amount DECIMAL, description TEXT, metadata JSONB)：检查当前用户余额，成功则扣减并插入负值交易（type='consumption'），返回 BOOLEAN。
  - public.get_user_stats(target_user_id UUID)：返回聚合统计（total_consumed、total_recharged、current_balance、transaction_count）。
  - public.is_admin()：基于 profiles.email 判断管理员身份（简单匹配）。

- 权限
  - 授予 non, uthenticated schema 使用权限；授予 uthenticated 对 profiles、credit_transactions 的操作权限，以及对函数的执行权限。

- 风险与注意点
  - 回填会插入大量 profiles 行（取决于用户量），建议在低峰期执行并使用分批策略。
  - credits 字段使用 DECIMAL 类型，注意与应用层类型、序列化/四舍五入保持一致。

