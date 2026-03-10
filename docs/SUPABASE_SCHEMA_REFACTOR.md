# Supabase 表结构收口说明

这次收口的目标只有一个：把项目里“能跑但容易混乱”的 Supabase 结构，整理成一套可持续维护、可审计、默认更安全的结构。

## 现在的主表

- `profiles`：正式注册用户的主身份表，管理员身份也以这里的 `role = 'admin'` 为准。
- `temp_users`：临时用户表，只保留临时身份本身的信息，不再允许前端随意读写全部记录。
- `user_credits`：统一积分余额表，正式用户和临时用户都走这一张。
- `credit_transactions`：统一积分流水表，充值、消耗、退款都走这一张。
- `admin_settings`：管理员后台口令等敏感配置的唯一主表，只允许通过 RPC 间接访问。
- `admin_credit_models`：积分模型与供应商配置主表。

## 新增的管理视图

这些视图是为了让你在 Supabase 后台里看数据更直观，不再到处翻重复表：

- `admin_account_directory`
  - 汇总正式用户、临时用户、积分余额、充值次数、消耗次数、退款次数。
- `admin_credit_activity`
  - 汇总所有积分流水，并自动带出用户邮箱、显示名、身份类型。
- `admin_identity_directory`
  - 只看管理员身份信息，以 `profiles.role = 'admin'` 为准。
- `admin_credit_model_directory`
  - 只看模型配置本身，不走前端暴露敏感字段的方式。

## 本次重点修复

- 管理员身份不再靠邮箱后缀判断，统一改为 `profiles.role = 'admin'`。
- `admin_credit_models` 移除了普通已登录用户的直接读表能力，普通用户只能走脱敏 RPC。
- `temp_users` 不再允许公网随意查询和更新，避免把临时用户表变成后门入口。
- `user_credits` / `credit_transactions` 去掉了只能绑定 `auth.users` 的强耦合，临时用户也能纳入统一积分体系。
- `get_model_credit_cost()` 改为从 `admin_credit_models` 读取，避免继续读旧表口径。
- 老旧重复表如 `admin_auth`、`admin_users`、`admin_models` 会被标记为 legacy，并收紧权限。

## 为什么用了 `zz_` 结尾迁移

你的 `supabase/migrations` 目录里存在多份无时间戳、顺序混杂的旧 SQL。

如果只是继续加普通时间戳迁移，在全新部署时，这些旧 SQL 可能会在后面再次把策略覆盖掉。

所以这次最终收口文件使用了：

- `supabase/migrations/zz_20260309000002_finalize_supabase_schema.sql`

这样在按文件名顺序执行时，它会最后跑，用来统一回收旧迁移造成的覆盖和冲突。

## 建议你在 Supabase 后台重点确认

- `profiles.role` 中管理员账号是否正确。
- `admin_credit_models` 普通用户是否已经查不到敏感列。
- `temp_users` 是否只保留 `INSERT` 给匿名访问，`SELECT/UPDATE` 只允许管理员。
- `admin_account_directory` 里是否能同时看到正式用户和临时用户。
- `admin_credit_activity` 里是否能看到完整积分流水。

## 推荐执行顺序

1. 先执行全部迁移。
2. 打开 `admin_account_directory` 检查用户和临时用户是否已统一。
3. 打开 `admin_credit_activity` 检查历史积分流水是否正常。
4. 用普通用户账号验证：
   - 不能直接读 `admin_credit_models` 敏感字段
   - 仍能通过前端正常读取脱敏模型列表
5. 用管理员账号验证：
   - 能正常进入管理后台
   - 能正常保存积分模型
   - 能通过用户 ID / 邮箱给正式用户或临时用户充值
