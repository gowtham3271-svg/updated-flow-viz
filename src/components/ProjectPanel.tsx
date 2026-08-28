import { useState, useEffect } from "react";
import { Save, FolderOpen, Trash2, X, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { SavedProject, CodeFile, FlowGraph, Annotation } from "@/types";

interface ProjectPanelProps {
  open: boolean;
  onClose: () => void;
  files: CodeFile[];
  graph: FlowGraph;
  annotations: Annotation[];
  onLoad: (project: SavedProject) => void;
}

export function ProjectPanel({ open, onClose, files, graph, annotations, onLoad }: ProjectPanelProps) {
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) loadProjects();
  }, [open]);

  const loadProjects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("flow_projects")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) setProjects(data as SavedProject[]);
    setLoading(false);
  };

  const saveProject = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("flow_projects")
      .insert({
        name: name.trim(),
        files,
        graph,
        annotations,
      })
      .select()
      .single();
    if (!error && data) {
      setName("");
      await loadProjects();
    }
    setSaving(false);
  };

  const deleteProject = async (id: string) => {
    await supabase.from("flow_projects").delete().eq("id", id);
    await loadProjects();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/60 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] bg-app-elevated rounded-2xl border border-border-strong shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-fg-primary">Projects</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-app-hover text-fg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 border-b border-border-subtle">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name..."
              className="flex-1 px-3 py-2 rounded-lg bg-app-input text-fg-primary text-sm border border-border-subtle focus:border-accent-primary focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && saveProject()}
            />
            <button
              onClick={saveProject}
              disabled={saving || !name.trim()}
              className="px-4 py-2 rounded-lg bg-accent-primary hover:opacity-90 disabled:opacity-40 text-white text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Save size={16} /> Save
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-center py-8 text-fg-muted text-sm">Loading...</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-fg-muted text-sm">
              <FileText size={28} className="mx-auto mb-2 opacity-40" />
              No saved projects yet
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="group flex items-center gap-3 p-3 rounded-xl bg-app-card hover:bg-app-hover border border-border-subtle transition-colors"
                >
                  <button onClick={() => { onLoad(p); onClose(); }} className="flex-1 text-left">
                    <div className="text-sm font-medium text-fg-primary">{p.name}</div>
                    <div className="text-xs text-fg-muted mt-0.5">
                      {p.files?.length ?? 0} files · {p.graph?.nodes?.length ?? 0} nodes
                    </div>
                  </button>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="p-1.5 rounded-lg text-fg-faint hover:text-red-400 hover:bg-app-hover transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
