-- Admin-only password verification wrapper.
-- Use this RPC from frontend admin panel instead of direct verify_admin_password.

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_admin_password_admin(
  input_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can verify admin password';
  END IF;

  RETURN public.verify_admin_password(input_password);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_admin_password_admin(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_password_admin(TEXT) TO authenticated;

COMMIT;

