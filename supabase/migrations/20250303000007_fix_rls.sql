-- =====================================================
-- 修复版：设置 RLS
-- =====================================================

-- 启用 RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_credit_models ENABLE ROW LEVEL SECURITY;

-- user_credits 策略
DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;
CREATE POLICY "Users can view own credits"
ON public.user_credits FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Only admins can modify credits" ON public.user_credits;
CREATE POLICY "Only admins can modify credits"
ON public.user_credits FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- admin_auth 策略
DROP POLICY IF EXISTS "Only admins can access admin_auth" ON public.admin_auth;
CREATE POLICY "Only admins can access admin_auth"
ON public.admin_auth FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- credit_transactions 策略
DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own transactions"
ON public.credit_transactions FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.credit_transactions;
CREATE POLICY "Admins can view all transactions"
ON public.credit_transactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- admin_credit_models 策略
DROP POLICY IF EXISTS "Everyone can view credit models" ON public.admin_credit_models;
CREATE POLICY "Everyone can view credit models"
ON public.admin_credit_models FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Only admins can modify credit models" ON public.admin_credit_models;
CREATE POLICY "Only admins can modify credit models"
ON public.admin_credit_models FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )