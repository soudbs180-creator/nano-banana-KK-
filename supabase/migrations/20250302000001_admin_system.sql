-- Admin System Tables
-- For provider management and credit recharge

-- Provider pricing cache (temporary)
CREATE TABLE IF NOT EXISTS provider_pricing_cache (
    provider_id TEXT PRIMARY KEY,
    pricing JSONB NOT NULL,
    cached_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Enable RLS
ALTER TABLE provider_pricing_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (for price calculation)
CREATE POLICY "Allow read pricing cache" 
ON provider_pricing_cache FOR SELECT 
TO authenticated 
USING (true);

-- Admin providers table
CREATE TABLE IF NOT EXISTS admin_providers (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_keys JSONB DEFAULT '[]'::JSONB,
    models JSONB DEFAULT '[]'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_providers ENABLE ROW LEVEL SECURITY;

-- Allow admin access (you'll need to set up a proper admin check)
CREATE POLICY "Allow admin access" 
ON admin_providers FOR ALL 
TO authenticated 
USING (auth.jwt()->>'role' = 'admin')
WITH CHECK (auth.jwt()->>'role' = 'admin');

-- Credit transactions table (for audit)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    amount DECIMAL NOT NULL,
    type TEXT NOT NULL, -- 'admin_recharge', 'purchase', 'consumption'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own transactions
CREATE POLICY "Allow read own transactions" 
ON credit_transactions FOR SELECT 
TO authenticated 
USING (user_id = auth.uid());

-- Admins can create transactions
CREATE POLICY "Allow admin create transactions" 
ON credit_transactions FOR INSERT 
TO authenticated 
WITH CHECK (auth.jwt()->>'role' = 'admin');

-- Indexes for performance
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(type);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);

-- Function to update user credits (admin only)
CREATE OR REPLACE FUNCTION admin_recharge_credits(
    target_user_id UUID,
    amount DECIMAL,
    description TEXT DEFAULT '管理员充值'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update user credits
    UPDATE profiles
    SET credits = COALESCE(credits, 0) + amount
    WHERE id = target_user_id;
    
    -- Create transaction record
    INSERT INTO credit_transactions (user_id, amount, type, description)
    VALUES (target_user_id, amount, 'admin_recharge', description);
END;
$$;

-- Grant execute permission to authenticated users (admin check is done inside function)
GRANT EXECUTE ON FUNCTION admin_recharge_credits(UUID, DECIMAL, TEXT) TO authenticated;
