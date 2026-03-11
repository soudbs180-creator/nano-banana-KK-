# KK Studio 数据库结构说明

## 核心表（必须保留）

### 1. 用户系统
| 表名 | 用途 | 关联 | 说明 |
|------|------|------|------|
| `profiles` | 用户资料 | `auth.users(id)` | 主用户表，存储邮箱、角色等 |
| `user_credits` | 用户积分余额 | `profiles(id)` | 用户当前积分余额 |
| `credit_transactions` | 积分交易记录 | `profiles(id)` | 积分变动历史 |

### 2. API密钥系统
| 表名 | 用途 | 关联 | 说明 |
|------|------|------|------|
| `admin_credit_models` | 管理员模型配置 | 无 | 系统公共模型，含敏感API密钥 |
| `user_api_keys` | 用户个人API密钥 | `auth.users(id)` | 用户自己的密钥（加密存储） |

### 3. 管理后台
| 表名 | 用途 | 关联 | 说明 |
|------|------|------|------|
| `admin_auth` | 管理员认证 | 无 | 管理员密码等 |

### 4. 可选/辅助表
| 表名 | 用途 | 建议 | 说明 |
|------|------|------|------|
| `temp_users` | 临时用户 | 可删除 | 如不需要临时访客功能 |
| `usage_records` | 使用记录 | 可保留 | 详细调用日志 |
| `provider_pricing_cache` | 价格缓存 | 可保留 | 第三方供应商价格 |

---

## 视图

| 视图名 | 用途 | 面向用户 |
|--------|------|----------|
| `available_models_for_users` | 用户可查看的模型 | 普通用户 |
| `vw_user_credit_summary` | 用户积分概况 | 普通用户 |

---

## 表关系图

```
┌─────────────────┐
│   auth.users    │
│  (Supabase认证)  │
└────────┬────────┘
         │
         │ 1:1
         ▼
┌─────────────────┐
│    profiles     │
│  - id (PK)      │
│  - email        │
│  - role         │
└────────┬────────┘
         │
    ┌────┴────┬────────────┐
    │ 1:1     │ 1:N        │ 1:N
    ▼         ▼            ▼
┌─────────┐ ┌──────────────────┐ ┌─────────────────┐
│user_    │ │ credit_transactions│ │  user_api_keys  │
│credits  │ │  - user_id (FK)   │ │  - user_id (FK) │
│ - user_ │ │  - amount         │ │  - api_key_enc  │
│   id(FK)│ │  - type           │ │  - provider     │
└─────────┘ └──────────────────┘ └─────────────────┘

┌─────────────────────┐
│ admin_credit_models │
│ (独立，不关联用户)   │
│ - api_keys[]        │
│ - credit_cost       │
└─────────────────────┘
```

---

## 外键关系

```sql
-- 用户积分关联用户
user_credits.user_id → profiles.id

-- 交易记录关联用户
credit_transactions.user_id → profiles.id

-- 用户API密钥关联认证用户
user_api_keys.user_id → auth.users.id

-- 使用记录关联用户
usage_records.user_id → profiles.id
```

---

## 清理建议

### 确认保留的表（8个）
1. ✅ `profiles` - 用户资料（核心）
2. ✅ `user_credits` - 积分余额（核心）
3. ✅ `credit_transactions` - 交易记录（核心）
4. ✅ `admin_credit_models` - 管理员模型（核心）
5. ✅ `admin_auth` - 管理员认证（核心）
6. ✅ `user_api_keys` - 用户密钥（核心，如已创建）
7. ⚪ `usage_records` - 使用记录（可选）
8. ⚪ `temp_users` - 临时用户（可选，如不需要可删除）

### 确认删除的
- ❌ `public_credit_models` - 重复视图（已删除）
- ❌ `admin_credit_model_directory` - 重复视图（已删除）

---

## 执行清理

在 Supabase SQL Editor 中执行：

```sql
-- 执行关系梳理脚本
-- 文件: supabase/migrations/20260312000005_database_relationships.sql
```

或者执行简化版：

```sql
-- 1. 删除重复视图
DROP VIEW IF EXISTS public.public_credit_models CASCADE;
DROP VIEW IF EXISTS public.admin_credit_model_directory CASCADE;

-- 2. 添加外键（如不存在）
ALTER TABLE public.user_credits
  ADD CONSTRAINT user_credits_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. 创建用户模型视图
CREATE OR REPLACE VIEW public.vw_available_models AS
SELECT
  m.id, m.model_id, m.display_name, m.description,
  m.color, m.endpoint_type, m.credit_cost
FROM public.admin_credit_models m
WHERE m.is_active = TRUE AND m.visibility = 'public';

GRANT SELECT ON public.vw_available_models TO authenticated;

-- 4. 查看结果
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
```

---

*文档版本: 1.0*
*最后更新: 2026-03-11*
