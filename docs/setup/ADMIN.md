# 管理员系统配置步骤

## 快速配置（2分钟）

### 步骤 1: 打开 Supabase SQL Editor
访问：
```
https://app.supabase.com/project/ovdjhdofjysanamgkfng/sql
```

### 步骤 2: 复制粘贴以下 SQL

```sql
-- ============================================
-- 管理员系统配置
-- ============================================

-- 1. 修复外键关系
ALTER TABLE public.credit_transactions 
DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

ALTER TABLE public.credit_transactions 
ADD CONSTRAINT credit_transactions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id 
ON public.credit_transactions(user_id);

-- 2. 创建管理员密码表
CREATE TABLE IF NOT EXISTS public.admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    password_hash TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin only access" ON public.admin_settings;
CREATE POLICY "Admin only access"
ON public.admin_settings FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 默认密码: 123
INSERT INTO public.admin_settings (id, password_hash, updated_at)
VALUES (1, '202cb962ac59075b964b07152d234b70', NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. 密码验证函数
CREATE OR REPLACE FUNCTION public.verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
    input_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash
    FROM public.admin_settings
    WHERE id = 1;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    input_hash := md5(input_password);
    RETURN stored_hash = input_hash;
END;
$$;

-- 4. 修改密码函数
CREATE OR REPLACE FUNCTION public.update_admin_password(
    old_password TEXT,
    new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
    old_hash TEXT;
    new_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash
    FROM public.admin_settings
    WHERE id = 1;
    
    IF stored_hash IS NOT NULL THEN
        old_hash := md5(old_password);
        IF stored_hash != old_hash THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    new_hash := md5(new_password);
    
    INSERT INTO public.admin_settings (id, password_hash, updated_at, updated_by)
    VALUES (1, new_hash, NOW(), auth.uid())
    ON CONFLICT (id) 
    DO UPDATE SET 
        password_hash = new_hash,
        updated_at = NOW(),
        updated_by = auth.uid();
    
    RETURN TRUE;
END;
$$;

-- 5. 修复用户统计函数
CREATE OR REPLACE FUNCTION public.get_user_stats(
    target_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    total_consumed DECIMAL,
    total_recharged DECIMAL,
    current_balance DECIMAL,
    transaction_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF target_user_id IS NULL THEN
        target_user_id := auth.uid();
    END IF;

    RETURN QUERY
    SELECT
        p.id as user_id,
        p.email,
        COALESCE(SUM(CASE WHEN ct.type = 'consumption' THEN ABS(ct.amount) ELSE 0 END), 0) as total_consumed,
        COALESCE(SUM(CASE WHEN ct.type IN ('admin_recharge', 'purchase') THEN ct.amount ELSE 0 END), 0) as total_recharged,
        COALESCE(p.credits, 0) as current_balance,
        COUNT(ct.id) as transaction_count
    FROM public.profiles p
    LEFT JOIN public.credit_transactions ct ON ct.user_id = p.id
    WHERE p.id = target_user_id
    GROUP BY p.id, p.email;
END;
$$;

-- 6. 授权
GRANT ALL ON public.admin_settings TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_password TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_password TO authenticated;

-- 成功提示
SELECT '管理员系统配置完成！默认密码: 123' as message;
```

### 步骤 3: 点击 "Run" 执行

### 步骤 4: 使用管理员系统

1. 打开应用，进入 **设置** → **管理员系统**
2. 输入密码: `123`
3. 进入后可以：
   - 配置服务商（OpenAI、Gemini 等）
   - 添加模型和价格
   - 给用户充值积分

### 修改密码

进入管理员系统后，后续可以在里面修改密码。

---

## 功能说明

### 服务商配置
- 提供商 ID: 如 `openai`, `gemini`
- 基础 URL: API 地址
- API 密钥: 支持多个（轮换防限速）
- 模型配置: ID、名称、颜色、端点、积分价格

### 积分充值
- 搜索用户（邮箱或 ID）
- 输入充值数量
- 一键到账

### 多供应商轮换
- 相同模型 ID 配置多个服务商
- 自动轮询请求
- 防止单个供应商限速
