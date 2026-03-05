-- Token schema for physical separation (Token Engine)
CREATE SCHEMA IF NOT EXISTS billing_token;

CREATE TABLE billing_token.token_accounts (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id VARCHAR(255) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  current_balance_usd DECIMAL(20,4) DEFAULT 0,
  tier_id VARCHAR(100),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE billing_token.token_usage (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_account_id BIGINT REFERENCES billing_token.token_accounts(id),
  action_id VARCHAR(255),
  tokens_used BIGINT,
  cost_usd DECIMAL(20,4),
  timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  engine_type VARCHAR(32) DEFAULT 'token'
);

CREATE TABLE billing_token.token_pricing (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  tier_id VARCHAR(100),
  price_per_token_usd DECIMAL(20,6),
  tier_name VARCHAR(100),
  effective_from TIMESTAMP WITHOUT TIME ZONE
);

CREATE TABLE billing_token.token_invoices (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_account_id BIGINT,
  period_start TIMESTAMP WITHOUT TIME ZONE,
  period_end TIMESTAMP WITHOUT TIME ZONE,
  total_cost_usd DECIMAL(20,4),
  status VARCHAR(64)
);

CREATE TABLE billing_token.tax_rules (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  rule_name VARCHAR(128),
  percentage DECIMAL(5,4),
  applicable_period VARCHAR(128)
);
