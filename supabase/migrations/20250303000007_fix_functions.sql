-- =====================================================
-- 修复版：创建函数
-- =====================================================

-- 1. 验证管理员密码
CREATE OR REPLACE FUNCTION public.verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash
    FROM public.admin_auth 
    WHERE id = 1;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN stored_hash = md5(input_password);
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
    p_description TEXT DEFAULT '管理员充值'
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
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_target_user_id;
    
    IF v_email IS NULL THEN
        success := FALSE;
        new_balance := 0;
        message := '用户不存在';
        RETURN NEXT;
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
    WHERE id = v_credits.id
    RETURNING balance INTO v_new_balance;
    
    INSERT INTO public.credit_transactions (
        user_id, email, type, amount, balance_after, description, status, completed_at
    ) VALUES (
        p_target_user_id, v_email, 'recharge', p_amount, v_new_balance, p_description, 'completed', NOW()
    );
    
    success := TRUE;
    new_balance := v_new_balance;
    message := '充值成功';
    RETURN NEXT;
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
    
    IF NOT FOUND OR v_credits.balance < p_amount THEN
        success := FALSE;
        new_balance := COALESCE(v_credits.balance, 0);
        transaction_id := NULL;
        message := '积分不足';
        RETURN NEXT;
        RETURN;
    END IF;
    
    UPDATE public.user_credits
    SET 
        balance = balance - p_amount,
        total_spent = total_spent + p_amount,
        version = version + 1,
        last_transaction_at = NOW(),
        updated_at = NOW()
    WHERE id = v_credits.id
    RETURNING balance INTO v_new_balance;
    
    INSERT INTO public.credit_transactions (
        user_id, email, type, amount, balance_after, model_id, model_name, provider_id, description, status, completed_at
    ) VALUES (
        p_user_id, v_email, 'consumption', -p_amount, v_new_balance, p_model_id, p_model_name, p_provider_id, p_description, 'completed', NOW()
    )
    RETURNING id INTO v_transaction_id;
    
    success := TRUE;
    new_balance := v_new_balance;
    transaction_id := v_transaction_id;
    message := '消费成功';
    RETURN NEXT;
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
        success := FALSE;
        new_balance := 0;
        message := '交易记录不存在或状态不符';
        RETURN NEXT;
        RETURN;
    END IF;
    
    SELECT * INTO v_credits
    FROM public.user_credits
    WHERE user_id = v_transaction.user_id;
    
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
    
    success := TRUE;
    new_balance := v_new_balance;
    message := '退回成功';
    RETURN NEXT;
END;
$$;

-- 7. 触发器函数
CREATE OR REPLACE FUNCTION public.update_user_on_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.daily_reset_date < CURRENT_DATE THEN
        NEW.daily_cost_usd := 0;
        NEW.daily_tokens := 0;
        NEW.daily_reset_date := CURRENT_DATE;
    END IF;
    
    NEW.last_updated := NOW();
    
    RETURN NEW;
END;
$$;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS trg_update_user_on_login ON public.profiles;

-- 创建新触发器
CREATE TRIGGER trg_update_user_on_login
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_user_on_login();
