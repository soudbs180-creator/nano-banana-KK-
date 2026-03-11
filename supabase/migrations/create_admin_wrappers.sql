-- Admin Management Functions - Compatible with existing code
-- This creates wrapper functions that match the expected RPC names

-- Wrapper for admin_add_user (called from TypeScript)
CREATE OR REPLACE FUNCTION admin_add_user(
    p_email TEXT
)
RETURNS JSONB AS $$
BEGIN
    -- Call the main implementation
    RETURN admin_add_admin(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_add_user TO PUBLIC;

-- Wrapper for admin_delete_user (called from TypeScript)
CREATE OR REPLACE FUNCTION admin_delete_user(
    p_id INTEGER
)
RETURNS JSONB AS $$
BEGIN
    -- Call the main implementation
    RETURN admin_delete_admin(p_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_delete_user TO PUBLIC;

-- Wrapper for admin_login (backward compatibility)
CREATE OR REPLACE FUNCTION admin_login(
    p_email TEXT,
    p_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_admin_record RECORD;
    v_default_password TEXT := '123';
BEGIN
    -- Check if this is the first admin
    IF p_email = '977483863@qq.com' THEN
        SELECT * INTO v_admin_record
        FROM admin_users
        WHERE email = '977483863@qq.com';

        IF NOT FOUND THEN
            -- First time login
            INSERT INTO admin_users (email, password_hash, is_super_admin, requires_password_change)
            VALUES ('977483863@qq.com', v_default_password, TRUE, TRUE);

            RETURN jsonb_build_object(
                'success', TRUE,
                'requires_password_change', TRUE,
                'message', '首次登录，请修改密码'
            );
        END IF;
    END IF;

    -- Find admin
    SELECT * INTO v_admin_record
    FROM admin_users
    WHERE email = p_email;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '您没有管理员权限'
        );
    END IF;

    -- Verify password
    IF v_admin_record.password_hash != p_password THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '密码错误'
        );
    END IF;

    -- Check if password change required
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

GRANT EXECUTE ON FUNCTION admin_login TO PUBLIC;

COMMENT ON FUNCTION admin_login IS '向后兼容的管理员登录函数';
