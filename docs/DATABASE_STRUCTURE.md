# 数据库结构说明

## 表结构总览

### 表一: profiles (用户信息)
存储用户基本信息、API配置和每日消耗统计

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键，关联 auth.users |
| email | TEXT | 邮箱 |
| nickname | TEXT | 网名 |
| avatar_url | TEXT | 头像地址 |
| role | TEXT | 角色 (admin/user) |
| daily_cost_usd | DECIMAL | 每日消耗美金 |
| daily_tokens | INTEGER | 每日消耗tokens |
| daily_reset_date | DATE | 每日重置日期 |
| total_budget | DECIMAL | 总预算 |
| total_used | DECIMAL | 总用量 |
| user_apis | JSONB | 用户API配置数组 |
| last_updated | TIMESTAMP | 最后更新时间 |
| created_at | TIMESTAMP | 创建时间 |

### 表二: user_credits (用户积分余额)
独立的积分余额表，支持乐观锁防止并发问题

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 用户ID |
| email | TEXT | 邮箱 |
| balance | INTEGER | 当前余额 |
| total_earned | INTEGER | 总共获得 |
| total_spent | INTEGER | 总共消耗 |
| frozen | INTEGER | 冻结中 |
| version | INTEGER | 乐观锁版本 |
| last_transaction_at | TIMESTAMP | 最后交易时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表三: admin_auth (管理员认证)
存储管理员密码和用户ID

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键（固定为1） |
| password_hash | TEXT | MD5密码哈希 |
| admin_user_id | UUID | 管理员用户ID |
| is_active | BOOLEAN | 是否启用 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### 表四: credit_transactions (积分交易记录)
记录所有积分变动，包括充值、消费、退回

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID | 用户ID |
| email | TEXT | 邮箱 |
| type | TEXT | 类型 (recharge/consumption/refund/freeze/unfreeze) |
| amount | INTEGER | 变动金额 |
| balance_after | INTEGER | 变动后余额 |
| model_id | TEXT | 模型ID |
| model_name | TEXT | 模型名称 |
| provider_id | TEXT | 供应商ID |
| description | TEXT | 描述 |
| status | TEXT | 状态 (pending/completed/failed/refunded) |
| error_message | TEXT | 错误信息 |
| metadata | JSONB | 额外元数据 |
| created_at | TIMESTAMP | 创建时间 |
| completed_at | TIMESTAMP | 完成时间 |

### 表五: admin_credit_models (管理员积分模型)
管理员配置的积分模型，支持多供应商和多API Key轮换

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| provider_id | TEXT | 供应商ID |
| provider_name | TEXT | 供应商名称 |
| base_url | TEXT | API Base URL |
| api_keys | TEXT[] | API Key数组 |
| model_id | TEXT | 模型ID |
| display_name | TEXT | 显示名称 |
| description | TEXT | 描述 |
| color | TEXT | 颜色HEX |
| gradient | TEXT | 渐变色 |
| endpoint_type | TEXT | 端点类型 (openai/gemini) |
| credit_cost | INTEGER | 积分消耗 |
| priority | INTEGER | 优先级 |
| weight | INTEGER | 权重 |
| is_active | BOOLEAN | 是否启用 |
| call_count | INTEGER | 调用次数 |
| total_credits_consumed | INTEGER | 总消耗积分 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

## 关键函数

### 1. verify_admin_password(input_password TEXT)
验证管理员密码，同时检查当前用户是否为管理员

### 2. reset_daily_consumption()
重置所有用户的每日消耗（应在0点执行）

### 3. admin_recharge_credits(target_user_id, amount, description, admin_user_id)
管理员充值积分，事务安全，自动记录交易

### 4. consume_credits(user_id, amount, model_id, model_name, provider_id, description)
消费积分，自动检查余额，记录交易

### 5. refund_credits(transaction_id, reason)
失败时退回积分，创建退款记录

### 6. get_or_create_user_credits(user_id, email)
获取或创建用户积分记录

## 前端调用示例

### 管理员充值
```typescript
const { data, error } = await supabase.rpc('admin_recharge_credits', {
    p_target_user_id: 'user-uuid',
    p_amount: 100,
    p_description: '管理员充值',
    p_admin_user_id: adminUser.id
});
```

### 消费积分
```typescript
const { data, error } = await supabase.rpc('consume_credits', {
    p_user_id: userId,
    p_amount: 2,
    p_model_id: 'gemini-3-pro',
    p_model_name: 'Gemini 3 Pro',
    p_provider_id: 'google',
    p_description: '图像生成'
});

// data.success: boolean
// data.new_balance: number
// data.transaction_id: uuid
// data.message: string
```

### 退回积分
```typescript
const { data, error } = await supabase.rpc('refund_credits', {
    p_transaction_id: transactionId,
    p_reason: '生成失败'
});
```

### 获取用户积分
```typescript
const { data: credits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single();
```

### 获取交易记录
```typescript
const { data: transactions } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
```

## 每日重置任务

需要在服务器/云函数中设置定时任务，每天0点执行：

```sql
SELECT reset_daily_consumption();
```

或者在 Supabase 中使用 pg_cron 扩展：

```sql
SELECT cron.schedule('reset-daily-consumption', '0 0 * * *', 'SELECT reset_daily_consumption();');
```
