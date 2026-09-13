import { supabase } from "@/lib/supabase";
import type { SavedProject, CodeFile, FlowGraph, Annotation } from "@/types";

const LOCAL_STORAGE_CACHE_KEY = "flow_viz_saved_projects_cache";

/**
 * Loads cached projects from localStorage for immediate display and offline resilience.
 */
function getCachedProjects(): SavedProject[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedProject[];
  } catch (e) {
    console.warn("[projectsService] Failed to parse cached projects:", e);
    return [];
  }
}

/**
 * Updates localStorage cache with latest project list.
 */
function updateCachedProjects(projects: SavedProject[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_CACHE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn("[projectsService] Failed to write projects cache:", e);
  }
}

/**
 * Fetches all saved projects from Supabase.
 * Queries `public.flow_projects` first, falling back to `flow_viz.flow_projects`.
 * Merges and returns local cache if offline or on network error.
 */
export async function fetchProjects(): Promise<{ success: boolean; projects: SavedProject[]; error?: string }> {
  let projects: SavedProject[] = [];
  let fetchError: string | null = null;

  // 1. Try public.flow_projects (standard default PostgREST schema)
  try {
    const { data, error } = await supabase
      .from("flow_projects")
      .select("*")
      .order("updated_at", { ascending: false });

    if (!error && data && data.length >= 0) {
      projects = data as SavedProject[];
    } else if (error) {
      fetchError = error.message;
      console.warn("[projectsService] public schema fetch notice:", error.message);
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "public schema query failed";
  }

  // 2. Fallback / supplementary check: flow_viz.flow_projects
  if (projects.length === 0) {
    try {
      const { data, error } = await supabase
        .schema("flow_viz")
        .from("flow_projects")
        .select("*")
        .order("updated_at", { ascending: false });

      if (!error && data && data.length > 0) {
        projects = data as SavedProject[];
        fetchError = null;
      }
    } catch {
      // ignore secondary schema error
    }
  }

  if (projects.length > 0) {
    updateCachedProjects(projects);
    return { success: true, projects };
  }

  // 3. If remote returned empty or failed, use local cache
  const cached = getCachedProjects();
  if (cached.length > 0) {
    return { success: true, projects: cached };
  }

  return {
    success: !fetchError,
    projects: [],
    error: fetchError || undefined,
  };
}

/**
 * Saves a project to Supabase database.
 * Dual-writes to both public and flow_viz schemas, plus updates local cache.
 */
export async function saveProject(params: {
  name: string;
  files: CodeFile[];
  graph: FlowGraph;
  annotations: Annotation[];
  cameraState?: unknown;
}): Promise<{ success: boolean; project?: SavedProject; error?: string }> {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    return { success: false, error: "Project name is required" };
  }

  const projectId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const nowIso = new Date().toISOString();
  const payload = {
    id: projectId,
    name: trimmedName,
    files: params.files,
    graph: params.graph,
    annotations: params.annotations,
    camera_state: params.cameraState ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  let savedRecord: SavedProject | null = null;
  let saveError: string | null = null;

  // 1. Write to public schema
  try {
    const { data, error } = await supabase
      .from("flow_projects")
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      savedRecord = data as SavedProject;
    } else if (error) {
      saveError = error.message;
      console.warn("[projectsService] public.flow_projects insert notice:", error.message);
    }
  } catch (e) {
    saveError = e instanceof Error ? e.message : "public insert error";
  }

  // 2. Dual-write to flow_viz schema
  try {
    const { data, error } = await supabase
      .schema("flow_viz")
      .from("flow_projects")
      .insert(payload)
      .select()
      .single();

    if (!savedRecord && !error && data) {
      savedRecord = data as SavedProject;
    }
  } catch {
    // ignore secondary schema error if primary succeeded
  }

  // Construct valid project object
  const resultProject: SavedProject = savedRecord || {
    id: projectId,
    name: trimmedName,
    files: params.files,
    graph: params.graph,
    annotations: params.annotations,
    camera_state: params.cameraState as SavedProject["camera_state"],
    created_at: nowIso,
    updated_at: nowIso,
  };

  // Always update local cache so user sees saved project immediately
  const cached = getCachedProjects();
  const existingIdx = cached.findIndex((p) => p.id === resultProject.id);
  if (existingIdx >= 0) {
    cached[existingIdx] = resultProject;
  } else {
    cached.unshift(resultProject);
  }
  updateCachedProjects(cached);

  return { success: true, project: resultProject, error: savedRecord ? undefined : saveError || undefined };
}

/**
 * Deletes a project by ID across schemas and local cache.
 */
export async function deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const p1 = supabase.from("flow_projects").delete().eq("id", id);
    const p2 = supabase.schema("flow_viz").from("flow_projects").delete().eq("id", id);
    await Promise.allSettled([p1, p2]);

    // Update local cache
    const cached = getCachedProjects().filter((p) => p.id !== id);
    updateCachedProjects(cached);

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete project";
    return { success: false, error: msg };
  }
}
