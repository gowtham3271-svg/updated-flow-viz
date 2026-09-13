-- Grant permissions on flow_viz schema and tables
GRANT USAGE ON SCHEMA flow_viz TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA flow_viz TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA flow_viz TO anon, authenticated;

-- Grant permissions on public schema and tables
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.flow_projects TO anon, authenticated;
GRANT ALL ON public.user_questions TO anon, authenticated;

-- Add missing columns to public.user_questions
ALTER TABLE public.user_questions ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';
ALTER TABLE public.user_questions ADD COLUMN IF NOT EXISTS latency_ms integer;
ALTER TABLE public.user_questions ADD COLUMN IF NOT EXISTS sources jsonb DEFAULT '[]'::jsonb;

-- Ensure default column values on flow_viz.flow_projects
ALTER TABLE flow_viz.flow_projects ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE flow_viz.flow_projects ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE flow_viz.flow_projects ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE flow_viz.flow_projects ALTER COLUMN files SET DEFAULT '[]'::jsonb;
ALTER TABLE flow_viz.flow_projects ALTER COLUMN graph SET DEFAULT '{"nodes":[],"edges":[]}'::jsonb;
ALTER TABLE flow_viz.flow_projects ALTER COLUMN annotations SET DEFAULT '[]'::jsonb;

-- Ensure RLS policies on flow_viz.flow_projects
ALTER TABLE flow_viz.flow_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_flow_projects" ON flow_viz.flow_projects;
CREATE POLICY "anon_select_flow_projects" ON flow_viz.flow_projects FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_flow_projects" ON flow_viz.flow_projects;
CREATE POLICY "anon_insert_flow_projects" ON flow_viz.flow_projects FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_flow_projects" ON flow_viz.flow_projects;
CREATE POLICY "anon_update_flow_projects" ON flow_viz.flow_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_flow_projects" ON flow_viz.flow_projects;
CREATE POLICY "anon_delete_flow_projects" ON flow_viz.flow_projects FOR DELETE TO anon, authenticated USING (true);

-- Ensure RLS policies on public.user_questions
ALTER TABLE public.user_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_user_questions" ON public.user_questions;
CREATE POLICY "anon_select_user_questions" ON public.user_questions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_questions" ON public.user_questions;
CREATE POLICY "anon_insert_user_questions" ON public.user_questions FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_user_questions" ON public.user_questions;
CREATE POLICY "anon_update_user_questions" ON public.user_questions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_user_questions" ON public.user_questions;
CREATE POLICY "anon_delete_user_questions" ON public.user_questions FOR DELETE TO anon, authenticated USING (true);
