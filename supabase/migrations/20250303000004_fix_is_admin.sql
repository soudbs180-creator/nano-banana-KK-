-- 先创建 is_admin 函数
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND (
            email LIKE '%@admin%' 
            OR email LIKE '%@kkstudio%'
            OR email = 'admin@kkstudio.ai'
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;

-- 然后再运行 admin_settings
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

-- 密码验证函数
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

GRANT EXECUTE ON FUNCTION public.verify_admin_password TO authenticated;

-- 测试
SELECT 'Setup complete! Default password: 123' as message;
