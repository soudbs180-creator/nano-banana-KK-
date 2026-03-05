-- Update admin_change_password function to work with V2
-- Drop existing function if exists
DROP FUNCTION IF EXISTS admin_change_password(text, text, text);

-- Create updated function
CREATE OR REPLACE FUNCTION admin_change_password(
    p_email TEXT,
    p_old_password TEXT,
    p_new_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_admin_record RECORD;
BEGIN
    -- Find admin by email
    SELECT * INTO v_admin_record
    FROM admin_users
    WHERE email = p_email;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '管理员不存在'
        );
    END IF;
    
    -- Verify old password
    IF v_admin_record.password_hash != p_old_password THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '原密码错误'
        );
    END IF;
    
    -- Update password and clear requires_password_change flag
    UPDATE admin_users 
    SET 
        password_hash = p_new_password,
        requires_password_change = FALSE,
        updated_at = NOW()
    WHERE id = v_admin_record.id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', '密码修改成功'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION admin_change_password TO PUBLIC;

COMMENT ON FUNCTION admin_change_password IS '修改管理员密码';

-- Add admin RPC function
CREATE OR REPLACE FUNCTION admin_add_admin(
    p_email TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_current_admin RECORD;
    v_exists BOOLEAN;
BEGIN
    -- Check if current user is super admin
    SELECT * INTO v_current_admin
    FROM admin_users
    WHERE email = current_setting('app.current_user_email', TRUE)
    AND is_super_admin = TRUE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '只有超级管理员可以添加管理员'
        );
    END IF;
    
    -- Check if email already exists
    SELECT EXISTS(SELECT 1 FROM admin_users WHERE email = p_email) INTO v_exists;
    
    IF v_exists THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '该邮箱已是管理员'
        );
    END IF;
    
    -- Add new admin with default password
    INSERT INTO admin_users (email, password_hash, is_super_admin, requires_password_change)
    VALUES (p_email, '123', FALSE, TRUE);
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', '管理员添加成功，默认密码：123'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_add_admin TO PUBLIC;

COMMENT ON FUNCTION admin_add_admin IS '添加新管理员（仅超级管理员可用）';

-- Delete admin RPC function
CREATE OR REPLACE FUNCTION admin_delete_admin(
    p_admin_id INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_current_admin RECORD;
    v_target_admin RECORD;
BEGIN
    -- Check if current user is super admin
    SELECT * INTO v_current_admin
    FROM admin_users
    WHERE email = current_setting('app.current_user_email', TRUE)
    AND is_super_admin = TRUE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '只有超级管理员可以删除管理员'
        );
    END IF;
    
    -- Check if target is super admin
    SELECT * INTO v_target_admin
    FROM admin_users
    WHERE id = p_admin_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '管理员不存在'
        );
    END IF;
    
    IF v_target_admin.is_super_admin THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '不能删除超级管理员'
        );
    END IF;
    
    -- Delete admin
    DELETE FROM admin_users WHERE id = p_admin_id;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'message', '管理员已删除'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_delete_admin TO PUBLIC;

COMMENT ON FUNCTION admin_delete_admin IS '删除管理员（仅超级管理员可用，不能删除超级管理员）';

-- List admins RPC function
CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
    id INTEGER,
    email TEXT,
    is_super_admin BOOLEAN,
    requires_password_change BOOLEAN,
    created_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM admin_users 
        WHERE email = current_setting('app.current_user_email', TRUE)
    ) THEN
        RAISE EXCEPTION '没有权限查看管理员列表';
    END IF;
    
    RETURN QUERY
    SELECT 
        au.id,
        au.email,
        au.is_super_admin,
        au.requires_password_change,
        au.created_at,
        au.last_login_at
    FROM admin_users au
    ORDER BY au.is_super_admin DESC, au.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_list_users TO PUBLIC;

COMMENT ON FUNCTION admin_list_users IS '获取管理员列表（仅管理员可用）';
