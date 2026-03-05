# 数据库迁移执行指南

## 执行步骤

### 1. 登录 Supabase
访问 https://supabase.com/dashboard → 选择你的项目 → SQL Editor

### 2. 新建查询
点击 "New Query"，将以下文件内容完整复制粘贴执行：

**文件**: `supabase/migrations/20250303000006_restructure_database.sql`

### 3. 执行顺序
直接执行整个 SQL 文件即可，代码已包含：
- 保留现有数据
- 创建新表结构
- 迁移必要数据
- 删除旧表

### 4. 验证执行成功
执行后检查以下表是否存在：

```sql
-- 检查所有表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'user_credits', 'admin_auth', 'credit_transactions', 'admin_credit_models');
```

## 表结构对比

### 之前 vs 之后

| 功能 | 旧表 | 新表 |
|------|------|------|
| 用户信息 | profiles (+ credits字段) | profiles (用户信息) + user_credits (积分) |
| 管理员认证 | admin_settings | admin_auth |
| 积分记录 | credit_transactions | credit_transactions (增强版) |
| 积分模型 | admin_models | admin_credit_models (增强版) |

## 数据保留情况

✅ **保留的数据**:
- 所有用户注册信息
- 现有用户积分余额（会自动迁移到新表）
- 管理员密码

❌ **需要重新配置**:
- 积分模型配置（表结构已升级，需要重新添加）
- 用户API配置（改用新的 JSONB 格式）

## 前端代码更新

已更新的文件：
1. `src/services/creditService.ts` - 新的积分服务
2. `src/components/AdminSystem.tsx` - 适配新表结构
3. `supabase/migrations/20250303000006_restructure_database.sql` - 数据库迁移

## 关键函数说明

### 消费积分
```typescript
const result = await creditService.consumeCredits(
    userId,
    2, // 积分
    {
        model_id: 'gemini-3-pro',
        model_name: 'Gemini 3 Pro',
        provider_id: 'google'
    },
    '图像生成'
);

if (result.success) {
    console.log('新余额:', result.newBalance);
    console.log('交易ID:', result.transactionId);
}
```

### 退回积分
```typescript
await creditService.refundCredits(transactionId, '生成失败');
```

### 管理员充值
```typescript
// 通过邮箱
await creditService.rechargeByEmail('user@example.com', 100);

// 通过用户ID
await creditService.adminRecharge(userId, 100);
```

## 定时任务设置

### 方法1: 使用 Supabase Cron (推荐)
```sql
-- 启用 cron 扩展
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 设置每天0点重置
SELECT cron.schedule('reset-daily-consumption', '0 0 * * *', 'SELECT reset_daily_consumption();');
```

### 方法2: 外部定时任务
使用 Vercel Cron / GitHub Actions / 其他定时服务调用：
```sql
SELECT reset_daily_consumption();
```

## 故障排查

### 问题1: 积分余额显示为0
**原因**: 数据迁移时用户没有触发创建积分记录  
**解决**: 调用 `get_or_create_user_credits(user_id, email)` 函数

### 问题2: 管理员无法登录
**原因**: admin_auth 表没有正确数据  
**解决**: 检查表中是否有 id=1 的记录，密码哈希是否为 `202cb962ac59075b964b07152d234b70`

### 问题3: 消费积分时报错
**原因**: 可能是余额不足或并发冲突  
**解决**: 检查返回的 message 字段，余额不足需要充值，并发冲突可以重试

## 备份建议

执行迁移前，建议备份数据：

```sql
-- 导出重要表数据
COPY (SELECT * FROM profiles) TO '/tmp/profiles_backup.csv' CSV HEADER;
COPY (SELECT * FROM credit_transactions) TO '/tmp/transactions_backup.csv' CSV HEADER;
```

## 执行后检查清单

- [ ] SQL 执行无报错
- [ ] 所有5个表都存在
- [ ] 默认积分模型已插入
- [ ] 管理员密码正确（默认: 123）
- [ ] 可以正常登录管理员后台
- [ ] 可以正常添加积分模型
- [ ] 可以正常充值积分
- [ ] 可以正常消费积分
- [ ] 消费失败可以退回积分
