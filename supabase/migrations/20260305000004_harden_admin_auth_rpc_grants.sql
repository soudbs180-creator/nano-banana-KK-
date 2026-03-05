-- Harden execution grants for admin authentication RPCs.
-- Remove broad PUBLIC/anon grants and keep authenticated-only access.

BEGIN;

-- verify_admin_password(text)
REVOKE EXECUTE ON FUNCTION public.verify_admin_password(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_admin_password(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_password(TEXT) TO authenticated;

-- authenticate_admin(text)
REVOKE EXECUTE ON FUNCTION public.authenticate_admin(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.authenticate_admin(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.authenticate_admin(TEXT) TO authenticated;

-- verify_admin_password_admin(text)
REVOKE EXECUTE ON FUNCTION public.verify_admin_password_admin(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_admin_password_admin(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_password_admin(TEXT) TO authenticated;

-- is_admin()
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

COMMIT;

