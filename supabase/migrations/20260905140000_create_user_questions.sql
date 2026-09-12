/*
# Create user_questions table for logging user inquiries and AI interactions

1. New Tables
- `user_questions`
  - `id` (uuid, primary key)
  - `question` (text, not null)
  - `reply` (text, nullable)
  - `context` (jsonb, default '{}') - stores active file, selected node, graph stats, mode
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `user_questions`.
- Single-tenant / public open tool: allow anon + authenticated full insert & select.
*/

CREATE TABLE IF NOT EXISTS user_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  reply text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_user_questions" ON user_questions;
CREATE POLICY "anon_select_user_questions" ON user_questions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_questions" ON user_questions;
CREATE POLICY "anon_insert_user_questions" ON user_questions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_user_questions" ON user_questions;
CREATE POLICY "anon_update_user_questions" ON user_questions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_user_questions" ON user_questions;
CREATE POLICY "anon_delete_user_questions" ON user_questions FOR DELETE
  TO anon, authenticated USING (true);
