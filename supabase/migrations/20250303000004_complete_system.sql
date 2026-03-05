-- Complete System Migration
-- Includes: Supplier system, Credit system, Admin functions

-- ==================== CREDIT SYSTEM ====================

-- Check if user has enough credits
CREATE OR REPLACE FUNCTION public.check_user_credits(
    user_id UUID,
    required_credits INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_credits INTEGER;
BEGIN
    SELECT credits INTO current_credits 
    FROM public.profiles 
    WHERE id = user_id;
    
    IF current_credits IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN current_credits >= required_credits;
END;
$$;

-- Deduct user credits
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
    user_id UUID,
    credits INTEGER,
    model_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_credits INTEGER;
BEGIN
    -- Get current credits
    SELECT credits INTO current_credits 
    FROM public.profiles 
    WHERE id = user_id;
    
    IF current_credits IS NULL OR current_credits < credits THEN
        RETURN FALSE;
    END IF;
    
    -- Deduct credits
    UPDATE public.profiles 
    SET credits = credits - credits,
        updated_at = NOW()
    WHERE id = user_id;
    
    -- Record transaction
    INSERT INTO public.credit_transactions (
        user_id,
        amount,
        type,
        description,
        model_id,
        created_at
    ) VALUES (
        user_id,
        -credits,
        'usage',
        '模型调用消费',
        model_id,
        NOW()
    );
    
    RETURN TRUE;
END;
$$;

-- Get model credit cost
CREATE OR REPLACE FUNCTION public.get_model_credit_cost(model_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cost INTEGER;
    model_lower TEXT;
BEGIN
    model_lower := LOWER(model_id);
    
    -- Check admin configured models first
    SELECT credit_cost INTO cost
    FROM public.admin_models
    WHERE LOWER(model_id) = model_lower
    AND is_active = TRUE;
    
    IF cost IS NOT NULL THEN
        RETURN cost;
    END IF;
    
    -- Default credit models (built-in)
    IF model_lower LIKE '%banana%' OR 
       (model_lower LIKE '%gemini%' AND model_lower LIKE '%image%') THEN
        IF model_lower LIKE '%pro%' THEN
            RETURN 2;
        ELSE
            RETURN 1;
        END IF;
    END IF;
    
    -- Not a credit model
    RETURN 0;
END;
$$;

-- Admin recharge credits function
CREATE OR REPLACE FUNCTION public.admin_recharge_credits(
    target_user_id UUID,
    amount INTEGER,
    admin_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- Check if caller is admin
    SELECT EXISTS(
        SELECT 1 FROM public.profiles 
        WHERE id = admin_user_id AND role = 'admin'
    ) INTO is_admin;
    
    IF NOT is_admin THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;
    
    -- Add credits
    UPDATE public.profiles 
    SET credits = COALESCE(credits, 0) + amount,
        updated_at = NOW()
    WHERE id = target_user_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Record transaction
    INSERT INTO public.credit_transactions (
        user_id,
        amount,
        type,
        description,
        created_by,
        created_at
    ) VALUES (
        target_user_id,
        amount,
        'recharge',
        '管理员充值',
        admin_user_id,
        NOW()
    );
    
    RETURN TRUE;
END;
$$;

-- ==================== ADMIN SETTINGS ====================

-- Admin settings table
CREATE TABLE IF NOT EXISTS public.admin_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    password_hash TEXT NOT NULL DEFAULT '202cb962ac59075b964b07152d234b70',
    system_proxy_key TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default password (123)
INSERT INTO public.admin_settings (id, password_hash, updated_at)
VALUES (1, '202cb962ac59075b964b07152d234b70', NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify admin password
CREATE OR REPLACE FUNCTION public.verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT password_hash INTO stored_hash 
    FROM public.admin_settings 
    WHERE id = 1;
    
    IF stored_hash IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN stored_hash = md5(input_password);
END;
$$;

-- Update admin password
CREATE OR REPLACE FUNCTION public.update_admin_password(
    old_password TEXT,
    new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify old password
    IF NOT public.verify_admin_password(old_password) THEN
        RETURN FALSE;
    END IF;
    
    -- Update password
    UPDATE public.admin_settings 
    SET password_hash = md5(new_password),
        updated_at = NOW()
    WHERE id = 1;
    
    RETURN TRUE;
END;
$$;

-- ==================== ADMIN MODELS TABLE ====================

-- Admin configured models (for credit system)
CREATE TABLE IF NOT EXISTS public.admin_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id TEXT NOT NULL UNIQUE,
    display_name TEXT,
    provider TEXT,
    endpoint_type TEXT DEFAULT 'openai', -- 'openai' or 'gemini'
    credit_cost INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.admin_models ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admin models are viewable by everyone"
ON public.admin_models FOR SELECT
USING (true);

CREATE POLICY "Only admins can modify admin models"
ON public.admin_models FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- ==================== PROFILES EXTENSIONS ====================

-- Add credits column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'credits'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN credits INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add role column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';
    END IF;
END $$;

-- ==================== CREDIT TRANSACTIONS ====================

-- Credit transactions table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'recharge', 'usage', 'refund'
    description TEXT,
    model_id TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own transactions"
ON public.credit_transactions FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all transactions"
ON public.credit_transactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Only admins can insert transactions"
ON public.credit_transactions FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- ==================== DEFAULT CREDIT MODELS ====================

-- Insert default credit models
INSERT INTO public.admin_models (model_id, display_name, provider, credit_cost, is_active)
VALUES 
    ('gemini-3.1-flash-image-preview@system', 'Gemini 3.1 Flash Image', 'google', 1, true),
    ('gemini-3-pro-image-preview@system', 'Gemini 3 Pro Image', 'google', 2, true),
    ('gemini-2.5-flash-image@system', 'Gemini 2.5 Flash Image', 'google', 1, true)
ON CONFLICT (model_id) DO NOTHING;
