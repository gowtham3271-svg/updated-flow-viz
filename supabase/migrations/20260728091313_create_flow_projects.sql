/*
# Create flow visualizer tables (single-tenant, no auth)

1. New Tables
- `flow_projects`: saved visualization projects
  - `id` (uuid, primary key)
  - `name` (text, not null)
  - `files` (jsonb, not null) — array of {filename, language, content}
  - `graph` (jsonb, not null) — parsed {nodes, edges} structure
  - `annotations` (jsonb, not null default '[]') — array of {nodeId, text}
  - `camera_state` (jsonb, nullable) — saved camera position/target
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
2. Security
- Enable RLS on `flow_projects`.
- Single-tenant, no sign-in: allow anon + authenticated full CRUD because the data is intentionally shared/public.
*/

CREATE TABLE IF NOT EXISTS flow_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  camera_state jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE flow_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_flow_projects" ON flow_projects;
CREATE POLICY "anon_select_flow_projects" ON flow_projects FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_flow_projects" ON flow_projects;
CREATE POLICY "anon_insert_flow_projects" ON flow_projects FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_flow_projects" ON flow_projects;
CREATE POLICY "anon_update_flow_projects" ON flow_projects FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_flow_projects" ON flow_projects;
CREATE POLICY "anon_delete_flow_projects" ON flow_projects FOR DELETE
  TO anon, authenticated USING (true);