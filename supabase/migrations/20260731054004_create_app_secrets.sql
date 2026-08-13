/*
# Create app_secrets table for server-side API keys

1. New Tables
- `app_secrets`
  - `key` (text, primary key) — the secret name, e.g. "GROQ_API_KEY"
  - `value` (text, not null) — the secret value
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `app_secrets`.
- Deny ALL access to anon and authenticated roles — only the service role
  (used by edge functions) can read/write, since the service role bypasses RLS.
- No policies are created, so anon/authenticated get zero rows.

3. Purpose
- Stores third-party API keys (like GROQ_API_KEY) that edge functions need.
- The edge function reads these using its automatically-injected SUPABASE_SERVICE_ROLE_KEY,
  which bypasses RLS entirely. The browser-facing anon key cannot read this table.
*/

CREATE TABLE IF NOT EXISTS app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
