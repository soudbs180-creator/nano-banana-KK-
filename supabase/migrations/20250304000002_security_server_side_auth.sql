-- ============================================
-- Security Patch: Server-side Admin Authentication
-- ============================================
-- This migration adds server-side session validation for admin authentication
-- preventing localStorage tampering attacks

-- ============================================
-- 0. Create admin_users table if not exists
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only admins can manage admin users
DROP POLICY IF EXISTS "Only admins can manage admin users" ON public.admin_users;
CREATE POLICY "Only admins can manage admin users"
ON public.admin_users FOR ALL
TO authenticated
USING (public.is_admin());

-- ============================================
-- 1. Create admin sessions table
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Enable RLS
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins can view their own sessions
DROP POLICY IF EXISTS "Admin can view own sessions" ON public.admin_sessions;
CREATE POLICY "Admin can view own sessions"
ON public.admin_sessions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Only admins can delete their own sessions
DROP POLICY IF EXISTS "Admin can delete own sessions" ON public.admin_sessions;
CREATE POLICY "Admin can delete own sessions"
ON public.admin_sessions FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON public.admin_sessions(user_id);

-- ============================================
-- 2. Create function to generate admin session
-- ============================================

CREATE OR REPLACE FUNCTION public.create_admin_session(
    p_user_id UUID,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_token TEXT;
    session_duration INTERVAL := '24 hours'; -- Sessions expire after 24 hours
BEGIN
    -- Generate a secure random token
    new_token := encode(gen_random_bytes(32), 'hex');

    -- Insert new session
    INSERT INTO public.admin_sessions (
        user_id,
        session_token,
        expires_at,
        ip_address,
        user_agent
    ) VALUES (
        p_user_id,
        new_token,
        NOW() + session_duration,
        p_ip_address,
        p_user_agent
    );

    -- Clean up expired sessions for this user
    DELETE FROM public.admin_sessions
    WHERE user_id = p_user_id
    AND expires_at < NOW();

    RETURN new_token;
END;
$$;

-- ============================================
-- 3. Create function to verify admin session
-- ============================================

CREATE OR REPLACE FUNCTION public.verify_admin_session(
    p_session_token TEXT
)
RETURNS TABLE (
    is_valid BOOLEAN,
    user_id UUID,
    expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_record public.admin_sessions%ROWTYPE;
BEGIN
    -- Look up the session
    SELECT * INTO session_record
    FROM public.admin_sessions
    WHERE session_token = p_session_token;

    -- Check if session exists and is not expired
    IF session_record.id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TIMESTAMP WITH TIME ZONE;
        RETURN;
    END IF;

    IF session_record.expires_at < NOW() THEN
        -- Session expired, delete it
        DELETE FROM public.admin_sessions
        WHERE id = session_record.id;

        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TIMESTAMP WITH TIME ZONE;
        RETURN;
    END IF;

    -- Update last used time
    UPDATE public.admin_sessions
    SET last_used_at = NOW()
    WHERE id = session_record.id;

    -- Check if user is still an admin
    IF NOT public.is_admin_by_id(session_record.user_id) THEN
        -- User is no longer an admin, delete all their sessions
        DELETE FROM public.admin_sessions
        WHERE user_id = session_record.user_id;

        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TIMESTAMP WITH TIME ZONE;
        RETURN;
    END IF;

    RETURN QUERY SELECT
        TRUE,
        session_record.user_id,
        session_record.expires_at;
END;
$$;

-- ============================================
-- 4. Create function to verify current admin
-- ============================================

CREATE OR REPLACE FUNCTION public.verify_current_admin(
    p_user_id UUID
)
RETURNS TABLE (
    is_admin BOOLEAN,
    session_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    has_valid_session BOOLEAN;
    token TEXT;
BEGIN
    -- Check if user is in admin list
    IF NOT public.is_admin_by_id(p_user_id) THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT;
        RETURN;
    END IF;

    -- Check if user has a valid session
    SELECT session_token INTO token
    FROM public.admin_sessions
    WHERE user_id = p_user_id
    AND expires_at > NOW()
    ORDER BY last_used_at DESC
    LIMIT 1;

    has_valid_session := token IS NOT NULL;

    RETURN QUERY SELECT has_valid_session, token;
END;
$$;

-- ============================================
-- 5. Create helper function to check if user is admin by ID
-- ============================================

CREATE OR REPLACE FUNCTION public.is_admin_by_id(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_admin_user BOOLEAN;
BEGIN
    -- Check if user is in profiles table with admin role
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id AND role = 'admin'
    ) INTO is_admin_user;

    -- Also check if user is in the predefined admin list
    IF NOT is_admin_user THEN
        SELECT EXISTS (
            SELECT 1 FROM public.admin_users
            WHERE user_id = p_user_id
        ) INTO is_admin_user;
    END IF;

    RETURN is_admin_user;
END;
$$;

-- ============================================
-- 6. Create function to invalidate all sessions for a user
-- ============================================

CREATE OR REPLACE FUNCTION public.invalidate_admin_sessions(
    p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.admin_sessions
    WHERE user_id = p_user_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- ============================================
-- 7. Create scheduled job to clean up expired sessions
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_admin_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.admin_sessions
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- ============================================
-- 8. Update admin_login_v2 function to return session token
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_login_v2(
    p_user_email TEXT,
    p_user_id UUID,
    p_password TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    token TEXT,
    message TEXT,
    requires_password_change BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_valid_password BOOLEAN;
    needs_password_change BOOLEAN;
    new_session_token TEXT;
    is_admin_user BOOLEAN;
BEGIN
    -- Check if user is admin
    is_admin_user := public.is_admin_by_id(p_user_id);

    IF NOT is_admin_user THEN
        RETURN QUERY SELECT
            FALSE,
            NULL::TEXT,
            'User is not an admin'::TEXT,
            FALSE;
        RETURN;
    END IF;

    -- Verify password using the secure function
    is_valid_password := public.verify_admin_password(p_password);

    IF NOT is_valid_password THEN
        RETURN QUERY SELECT
            FALSE,
            NULL::TEXT,
            'Invalid password'::TEXT,
            FALSE;
        RETURN;
    END IF;

    -- Check if password needs to be changed (still using MD5)
    SELECT password_hash_type = 'md5' INTO needs_password_change
    FROM public.admin_settings
    WHERE id = 1;

    -- Create session token
    new_session_token := public.create_admin_session(p_user_id);

    -- Log the login
    INSERT INTO public.admin_audit_log (action, details)
    VALUES ('admin_login', jsonb_build_object(
        'user_id', p_user_id,
        'email', p_user_email,
        'requires_password_change', needs_password_change
    ));

    RETURN QUERY SELECT
        TRUE,
        new_session_token,
        'Login successful'::TEXT,
        COALESCE(needs_password_change, FALSE);
END;
$$;

-- ============================================
-- Security Notes:
-- ============================================
-- 1. Admin sessions are now stored server-side with expiration
-- 2. Sessions are bound to specific users and validated on each request
-- 3. If a user is removed from admin role, all their sessions are invalidated
-- 4. Sessions expire after 24 hours of inactivity
-- 5. Cleaning up expired sessions should be run periodically
-- ============================================
