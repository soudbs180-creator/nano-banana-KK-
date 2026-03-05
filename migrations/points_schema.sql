-- Points schema for physical separation (Points Engine)
CREATE SCHEMA IF NOT EXISTS billing_points;

CREATE TABLE billing_points.points_accounts (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  org_id VARCHAR(255) NOT NULL,
  balance_points BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE billing_points.points_transactions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  account_id BIGINT REFERENCES billing_points.points_accounts(id),
  amount_points BIGINT,
  reason VARCHAR(512),
  reference_id VARCHAR(255),
  timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  engine_type VARCHAR(32) DEFAULT 'points'
);

CREATE TABLE billing_points.point_billing_rules (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  action VARCHAR(255),
  points_per_action BIGINT,
  enabled BOOLEAN DEFAULT TRUE
);

CREATE TABLE billing_points.point_audit_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type VARCHAR(128),
  details JSONB,
  timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE TABLE billing_points.points_invoices (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  org_id VARCHAR(255),
  period_start TIMESTAMP WITHOUT TIME ZONE,
  period_end TIMESTAMP WITHOUT TIME ZONE,
  total_points BIGINT,
  status VARCHAR(64)
);
