-- =====================================================
-- Part 2: 创建函数
-- =====================================================

-- 1. 验证管理员密码
CREATE OR REPLACE FUNCTION public.verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
    admin_uid UUID;
BEGIN
    SELECT password_hash, admin_user_id INTO stored_hash, admin_uid
    FROM public.admin_auth 
    WHERE id = 1;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    IF stored_hash = md5(input_password) AND admin_uid = auth.uid() THEN
        UPDATE public.admin_auth 
        SET updated_at = NOW() 
        WHERE id = 1;
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;

-- 2. 每日重置消耗
CREATE OR REPLACE FUNCTION public.reset_daily_consumption()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET 
        daily_cost_usd = 0,
        daily_tokens = 0,
        daily_reset_date = CURRENT_DATE
    WHERE daily_reset_date < CURRENT_DATE;
END;
$$;

-- 3. 获取或创建用户积分
CREATE OR REPLACE FUNCTION public.get_or_create_user_credits(p_user_id UUID, p_email TEXT DEFAULT NULL)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits public.user_credits;
BEGIN
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.user_credits (user_id, email, balance)
        VALUES (p_user_id, p_email, 0)
        RETURNING * INTO v_credits;
    END IF;
    
    RETURN v_credits;
END;
$$;

-- 4. 管理员充值
CREATE OR REPLACE FUNCTION public.admin_recharge_credits(
    p_target_user_id UUID,
    p_amount INTEGER,
    p_description TEXT DEFAULT '管理员充值',
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits public.user_credits;
    v_new_balance INTEGER;
    v_email TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = COALESCE(p_admin_user_id, auth.uid()) AND role = 'admin'
    ) THEN
        RETURN QUERY SELECT FALSE, 0, '无权操作：需要管理员权限'::TEXT;
        RETURN;
    END IF;
    
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_target_user_id;
    
    IF v_email IS NULL THEN
        RETURN QUERY SELECT FALSE, 0, '用户不存在'::TEXT;
        RETURN;
    END IF;
    
    SELECT * INTO v_credits
    FROM public.get_or_create_user_credits(p_target_user_id, v_email);
    
    UPDATE public.user_credits
    SET 
        balance = balance + p_amount,
        total_earned = total_earned + p_amount,
        version = version + 1,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_credits.id AND version = v_credits.version
    RETURNING balance INTO v_new_balance;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, '充值失败：并发冲突，请重试'::TEXT;
        RETURN;
    END IF;
    
    INSERT INTO public.credit_transactions (
        user_id, email, type, amount, balance_after, description, status, completed_at
    ) VALUES (
        p_target_user_id, v_email, 'recharge', p_amount, v_new_balance, p_description, 'completed', NOW()
    );
    
    RETURN QUERY SELECT TRUE, v_new_balance, '充值成功'::TEXT;
END;
$$;

-- 5. 消费积分
CREATE OR REPLACE FUNCTION public.consume_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_model_id TEXT,
    p_model_name TEXT,
    p_provider_id TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, transaction_id UUID, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credits public.user_credits;
    v_new_balance INTEGER;
    v_transaction_id UUID;
    v_email TEXT;
BEGIN
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_user_id;
    
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '积分不足'::TEXT;
        RETURN;
    END IF;
    
    IF v_credits.balance < p_amount THEN
        RETURN QUERY SELECT FALSE, v_credits.balance, NULL::UUID, '积分不足'::TEXT;
        RETURN;
    END IF;
    
    UPDATE public.user_credits
    SET 
        balance = balance - p_amount,
        total_spent = total_spent + p_amount,
        version = version + 1,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_credits.id AND version = v_credits.version
    RETURNING balance INTO v_new_balance;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, NULL::UUID, '消费失败：并发冲突'::TEXT;
        RETURN;
    END IF;
    
    INSERT INTO public.credit_transactions (
        user_id, email, type, amount, balance_after, model_id, model_name, provider_id, description, status, completed_at
    ) VALUES (
        p_user_id, v_email, 'consumption', -p_amount, v_new_balance, p_model_id, p_model_name, p_provider_id, p_description, 'completed', NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    RETURN QUERY SELECT TRUE, v_new_balance, v_transaction_id, '消费成功'::TEXT;
END;
$$;

-- 6. 退回积分
CREATE OR REPLACE FUNCTION public.refund_credits(
    p_transaction_id UUID,
    p_reason TEXT DEFAULT '调用失败退回'
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transaction public.credit_transactions;
    v_credits public.user_credits;
    v_new_balance INTEGER;
BEGIN
    SELECT * INTO v_transaction
    FROM public.credit_transactions
    WHERE id = p_transaction_id AND type = 'consumption' AND status = 'completed';
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, '交易记录不存在或状态不符'::TEXT;
        RETURN;
    END IF;
    
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = v_transaction.user_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0, '用户积分记录不存在'::TEXT;
        RETURN;
    END IF;
    
    UPDATE public.user_credits
    SET 
        balance = balance + ABS(v_transaction.amount),
        total_spent = total_spent - ABS(v_transaction.amount),
        version = version + 1,
        updated_at = NOW()
    WHERE id = v_credits.id
    RETURNING balance INTO v_new_balance;
    
    UPDATE public.credit_transactions
    SET status = 'refunded'
    WHERE id = p_transaction_id;
    
    INSERT INTO public.credit_transactions (
        user_id, email, type, amount, balance_after, model_id, model_name, provider_id, description, status, completed_at
    ) VALUES (
        v_transaction.user_id, v_transaction.email, 'refund', ABS(v_transaction.amount), v_new_balance, 
        v_transaction.model_id, v_transaction.model_name, v_transaction.provider_id, p_reason, 'completed', NOW()
    );
    
    RETURN QUERY SELECT TRUE, v_new_balance, '退回成功'::TEXT;
END;
$$;
