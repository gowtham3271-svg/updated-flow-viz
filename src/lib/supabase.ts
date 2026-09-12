import { createClient } from "@supabase/supabase-js";

// Production credentials for project whsbfprmeerxojgnuhrd (client-side anon key)
const DEFAULT_SUPABASE_URL = "https://whsbfprmeerxojgnuhrd.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indoc2JmcHJtZWVyeG9qZ251aHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODY4OTEsImV4cCI6MjEwNDE2Mjg5MX0.J2CFE9d-DxKHhV0OlTZjKcR5kqOaTkNILooO9gsWz-A";

const url =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
  DEFAULT_SUPABASE_URL;

const anonKey =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anonKey);

