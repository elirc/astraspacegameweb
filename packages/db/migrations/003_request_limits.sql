CREATE TABLE IF NOT EXISTS rate_buckets(key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS rate_expiry ON rate_buckets(expires_at);
