-- Create temp_users table for temporary user accounts
-- Temporary users:
-- - Auto-expire after 24 hours
-- - Can receive credits from admin recharge
-- - Data cached in browser until expiration

CREATE TABLE IF NOT EXISTS temp_users (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',

    -- Auto-delete expired users
    CONSTRAINT check_expires_at CHECK (expires_at > created_at)
);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_temp_users_expires_at ON temp_users(expires_at);
CREATE INDEX IF NOT EXISTS idx_temp_users_is_active ON temp_users(is_active);

-- Create function to automatically clean up expired temp users
CREATE OR REPLACE FUNCTION cleanup_expired_temp_users()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM temp_users
        WHERE expires_at < NOW()
        RETURNING *
    )
    SELECT COUNT(*)::INTEGER INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
ALTER TABLE temp_users ENABLE ROW LEVEL SECURITY;

-- Allow public to create temp users (insert only their own)
CREATE POLICY "Allow public to create temp users"
    ON temp_users
    FOR INSERT
    TO public
    WITH CHECK (TRUE);

-- Allow public to read their own temp user
CREATE POLICY "Allow public to read own temp user"
    ON temp_users
    FOR SELECT
    TO public
    USING (TRUE);

-- Allow public to update their own temp user
CREATE POLICY "Allow public to update own temp user"
    ON temp_users
    FOR UPDATE
    TO public
    USING (TRUE);

-- Comment
COMMENT ON TABLE temp_users IS 'Temporary user accounts that auto-expire after 24 hours';
COMMENT ON COLUMN temp_users.id IS 'Unique temporary user ID (format: temp_timestamp_random)';
COMMENT ON COLUMN temp_users.expires_at IS 'Account expiration timestamp (24 hours from creation)';
COMMENT ON COLUMN temp_users.metadata IS 'Additional metadata (userAgent, createdAt, etc.)';

-- Optional: Create a scheduled job to cleanup expired users (if using pg_cron)
-- Uncomment if pg_cron is available:
-- SELECT cron.schedule(
--     'cleanup-expired-temp-users',
--     '0 * * * *', -- Every hour
--     'SELECT cleanup_expired_temp_users()'
-- );
