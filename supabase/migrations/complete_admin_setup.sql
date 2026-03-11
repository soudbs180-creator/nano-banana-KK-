-- ============================================
-- 管理员后台完整 SQL 脚本
-- 执行顺序：按顺序执行所有语句
-- ============================================

-- ===== 第1步：创建 admin_users 表 =====
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

-- 启用 RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 允许任何人读取（用于登录验证）
CREATE POLICY "Allow public read for login"
    ON admin_users
    FOR SELECT
    TO PUBLIC
    USING (TRUE);

COMMENT ON TABLE admin_users IS '管理员账号表';
COMMENT ON COLUMN admin_users.requires_password_change IS '是否需要修改密码（首次登录）';

-- ===== 第2步：创建 admin_login_v2 函数 =====
DROP FUNCTION IF EXISTS admin_login_v2(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_login_v2(
    p_user_email TEXT,
    p_user_id TEXT,
    p_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_admin_record RECORD;
    v_default_password TEXT := '123';
BEGIN
    -- 检查是否为第一位管理员（硬编码ID和邮箱）
    IF p_user_id = '359fe235-b407-4f53-ac8e-0960d354ddd7'
       OR p_user_email = '977483863@qq.com' THEN

        -- 检查是否已存在
        SELECT * INTO v_admin_record
        FROM admin_users
        WHERE email = '977483863@qq.com';

        IF NOT FOUND THEN
            -- 首次登录，自动创建管理员记录
            INSERT INTO admin_users (
                email,
                password_hash,
                is_super_admin,
                requires_password_change,
                metadata
            ) VALUES (
                '977483863@qq.com',
                v_default_password,
                TRUE,
                TRUE,
                jsonb_build_object('user_id', '359fe235-b407-4f53-ac8e-0960d354ddd7')
            );

            RETURN jsonb_build_object(
                'success', TRUE,
                'requires_password_change', TRUE,
                'message', '首次登录，请修改默认密码'
            );
        END IF;
    ELSE
        -- 检查用户是否在管理员列表中
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

    -- 验证密码
    IF v_admin_record.password_hash != p_password THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '密码错误'
        );
    END IF;

    -- 检查是否需要修改密码
    IF v_admin_record.requires_password_change THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'requires_password_change', TRUE,
            'message', '首次登录，请修改密码'
        );
    END IF;

    -- 更新最后登录时间
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

GRANT EXECUTE ON FUNCTION admin_login_v2 TO PUBLIC;

-- ===== 第3步：创建 admin_change_password 函数 =====
DROP FUNCTION IF EXISTS admin_change_password(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_change_password(
    p_email TEXT,
    p_old_password TEXT,
    p_new_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_admin_record RECORD;
BEGIN
    -- 查找管理员
    SELECT * INTO v_admin_record
    FROM admin_users
    WHERE email = p_email;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '管理员不存在'
        );
    END IF;

    -- 验证旧密码
    IF v_admin_record.password_hash != p_old_password THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '原密码错误'
        );
    END IF;

    -- 更新密码并清除需要修改密码标志
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

GRANT EXECUTE ON FUNCTION admin_change_password TO PUBLIC;

-- ===== 第4步：创建 admin_add_admin 函数 =====
DROP FUNCTION IF EXISTS admin_add_admin(TEXT);

CREATE OR REPLACE FUNCTION admin_add_admin(
    p_email TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- 检查邮箱是否已存在
    SELECT EXISTS(SELECT 1 FROM admin_users WHERE email = p_email) INTO v_exists;

    IF v_exists THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '该邮箱已是管理员'
        );
    END IF;

    -- 添加新管理员，默认密码为123，需要修改
    INSERT INTO admin_users (
        email,
        password_hash,
        is_super_admin,
        requires_password_change
    ) VALUES (
        p_email,
        '123',
        FALSE,
        TRUE
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', '管理员添加成功，默认密码：123'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_add_admin TO PUBLIC;

-- ===== 第5步：创建 admin_delete_admin 函数 =====
DROP FUNCTION IF EXISTS admin_delete_admin(INTEGER);

CREATE OR REPLACE FUNCTION admin_delete_admin(
    p_id INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_target_admin RECORD;
BEGIN
    -- 查找目标管理员
    SELECT * INTO v_target_admin
    FROM admin_users
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '管理员不存在'
        );
    END IF;

    -- 不能删除超级管理员
    IF v_target_admin.is_super_admin THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '不能删除超级管理员'
        );
    END IF;

    -- 删除管理员
    DELETE FROM admin_users WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', '管理员已删除'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_delete_admin TO PUBLIC;

-- ===== 第6步：创建 admin_list_users 函数 =====
DROP FUNCTION IF EXISTS admin_list_users();

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

-- ===== 第7步：创建兼容旧代码的包装函数 =====

-- 兼容旧代码的 admin_add_user
DROP FUNCTION IF EXISTS admin_add_user(TEXT);

CREATE OR REPLACE FUNCTION admin_add_user(
    p_email TEXT
)
RETURNS JSONB AS $$
BEGIN
    RETURN admin_add_admin(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_add_user TO PUBLIC;

-- 兼容旧代码的 admin_delete_user
DROP FUNCTION IF EXISTS admin_delete_user(INTEGER);

CREATE OR REPLACE FUNCTION admin_delete_user(
    p_id INTEGER
)
RETURNS JSONB AS $$
BEGIN
    RETURN admin_delete_admin(p_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_delete_user TO PUBLIC;

-- 兼容旧代码的 admin_login（直接邮箱+密码登录）
DROP FUNCTION IF EXISTS admin_login(TEXT, TEXT);

CREATE OR REPLACE FUNCTION admin_login(
    p_email TEXT,
    p_password TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_admin_record RECORD;
    v_default_password TEXT := '123';
BEGIN
    -- 检查是否为第一位管理员
    IF p_email = '977483863@qq.com' THEN
        SELECT * INTO v_admin_record
        FROM admin_users
        WHERE email = '977483863@qq.com';

        IF NOT FOUND THEN
            -- 首次登录
            INSERT INTO admin_users (
                email,
                password_hash,
                is_super_admin,
                requires_password_change,
                metadata
            ) VALUES (
                '977483863@qq.com',
                v_default_password,
                TRUE,
                TRUE,
                jsonb_build_object('user_id', '359fe235-b407-4f53-ac8e-0960d354ddd7')
            );

            RETURN jsonb_build_object(
                'success', TRUE,
                'requires_password_change', TRUE,
                'message', '首次登录，请修改密码'
            );
        END IF;
    END IF;

    -- 查找管理员
    SELECT * INTO v_admin_record
    FROM admin_users
    WHERE email = p_email;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '您没有管理员权限'
        );
    END IF;

    -- 验证密码
    IF v_admin_record.password_hash != p_password THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', '密码错误'
        );
    END IF;

    -- 检查是否需要修改密码
    IF v_admin_record.requires_password_change THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'requires_password_change', TRUE,
            'message', '首次登录，请修改密码'
        );
    END IF;

    -- 更新最后登录时间
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

-- ============================================
-- 完成！所有函数已创建
-- ============================================
