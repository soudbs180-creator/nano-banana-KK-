-- Admin Login V2 - 通过当前用户身份验证管理员
-- 验证逻辑：
-- 1. 检查用户邮箱或ID是否在管理员列表中
-- 2. 第一位管理员硬编码初始化
-- 3. 首次登录需要修改默认密码

-- Drop existing function if exists
DROP FUNCTION IF EXISTS admin_login_v2(text, text, text);

-- Create new admin_login_v2 function
CREATE OR REPLACE FUNCTION admin_login_v2(
    p_user_email TEXT,
    p_user_id TEXT,
    p_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_admin_record RECORD;
    v_is_first_admin BOOLEAN := FALSE;
    v_default_password TEXT := '123'; -- 默认密码
BEGIN
    -- Check if this is the first admin (hardcoded)
    IF p_user_id = '359fe235-b407-4f53-ac8e-0960d354ddd7' 
       OR p_user_email = '977483863@qq.com' THEN
        
        -- Check if first admin exists in table
        SELECT * INTO v_admin_record 
        FROM admin_users 
        WHERE email = '977483863@qq.com';
        
        IF NOT FOUND THEN
            -- First time login, create admin record
            INSERT INTO admin_users (email, password_hash, is_super_admin, requires_password_change)
            VALUES ('977483863@qq.com', v_default_password, TRUE, TRUE);
            
            v_is_first_admin := TRUE;
            v_admin_record.email := '977483863@qq.com';
            v_admin_record.password_hash := v_default_password;
            v_admin_record.requires_password_change := TRUE;
        ELSE
            v_is_first_admin := v_admin_record.is_super_admin;
        END IF;
    ELSE
        -- Check if user is in admin list
        SELECT * INTO v_admin_record
        FROM admin_users
        WHERE email = p_user_email
           OR (metadata->>'user_id') = p_user_id;
        
        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'message', '您没有管理员权限'
            );
        END IF;
    END IF;
    
    -- Verify password
    IF v_admin_record.password_hash != p_password THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '密码错误'
        );
    END IF;
    
    -- Check if password change is required
    IF v_admin_record.requires_password_change THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'requires_password_change', TRUE,
            'message', '首次登录，请修改密码'
        );
    END IF;
    
    -- Update last login
    UPDATE admin_users 
    SET last_login_at = NOW()
    WHERE id = v_admin_record.id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'requires_password_change', FALSE,
        'is_super_admin', v_admin_record.is_super_admin,
        'message', '登录成功'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_login_v2 TO PUBLIC;

COMMENT ON FUNCTION admin_login_v2 IS '管理员登录验证 V2 - 通过当前用户邮箱和ID验证管理员身份';

-- Create admin_users table if not exists
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_super_admin BOOLEAN DEFAULT FALSE,
    requires_password_change BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Allow public to call login function (it checks credentials)
CREATE POLICY "Allow public to login" 
    ON admin_users 
    FOR SELECT 
    TO PUBLIC 
    USING (TRUE);

-- Only super admin can insert/update/delete
CREATE POLICY "Only super admin can manage admins"
    ON admin_users
    FOR ALL
    TO PUBLIC
    USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE is_super_admin = TRUE 
            AND email = current_setting('app.current_user_email', TRUE)
        )
    );

COMMENT ON TABLE admin_users IS '管理员账号表';
COMMENT ON COLUMN admin_users.requires_password_change IS '是否需要修改密码（首次登录）';
COMMENT ON COLUMN admin_users.is_super_admin IS '是否为超级管理员（第一位管理员）';
