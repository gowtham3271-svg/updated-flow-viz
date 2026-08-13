import { useState, useRef, useEffect, useMemo } from "react";
import { Search, FileCode2, CornerDownLeft, ArrowRight } from "lucide-react";
import type { CodeFile } from "@/types";
import { getLanguageColor, getLanguageLabel } from "@/lib/fileUtils";

interface CommandPaletteProps {
  files: CodeFile[];
  open: boolean;
  onClose: () => void;
  onFileSelect: (index: number) => void;
  actions: { label: string; hint: string; action: () => void }[];
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) return 1000;
  if (lower.startsWith(q)) return 500;
  if (lower.includes(q)) return 200;
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length ? 50 : -1;
}

export function CommandPalette({ files, open, onClose, onFileSelect, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const fileResults = useMemo(() => {
    if (!query.trim()) {
      return files.map((f, i) => ({ file: f, index: i, score: 0 }));
    }
    return files
      .map((f, i) => ({ file: f, index: i, score: Math.max(fuzzyScore(query, f.filename), fuzzyScore(query, f.path) / 2) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }, [files, query]);

  const actionResults = useMemo(() => {
    if (!query.trim()) return actions;
    return actions.filter((a) => fuzzyMatch(query, a.label));
  }, [actions, query]);

  const totalItems = fileResults.length + actionResults.length;

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((s) => Math.min(s + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx < fileResults.length) {
        onFileSelect(fileResults[selectedIdx].index);
        onClose();
      } else {
        const action = actionResults[selectedIdx - fileResults.length];
        if (action) {
          action.action();
          onClose();
        }
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-app-elevated rounded-xl border border-border-strong shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
          <Search size={16} className="text-fg-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name or run a command..."
            className="flex-1 bg-transparent text-sm text-fg-primary focus:outline-none placeholder:text-fg-faint"
          />
          <kbd className="text-[10px] text-fg-faint px-1.5 py-0.5 rounded border border-border-subtle">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[400px] overflow-y-auto py-1">
          {fileResults.length > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
                Files
              </div>
              {fileResults.map((r, i) => (
                <button
                  key={r.index}
                  onClick={() => { onFileSelect(r.index); onClose(); }}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                    selectedIdx === i ? "bg-accent-primary/15" : "hover:bg-app-hover"
                  }`}
                >
                  <FileCode2 size={14} style={{ color: getLanguageColor(r.file.language) }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-fg-primary truncate">{r.file.filename}</div>
                    <div className="text-[10px] text-fg-muted truncate">{r.file.path}</div>
                  </div>
                  <span className="text-[10px] text-fg-faint flex-shrink-0">{getLanguageLabel(r.file.language)}</span>
                  {selectedIdx === i && <CornerDownLeft size={12} className="text-accent-primary flex-shrink-0" />}
                </button>
              ))}
            </>
          )}

          {actionResults.length > 0 && (
            <>
              <div className="px-3 py-1 mt-1 text-[10px] font-semibold uppercase tracking-wider text-fg-faint">
                Commands
              </div>
              {actionResults.map((a, i) => {
                const idx = fileResults.length + i;
                return (
                  <button
                    key={a.label}
                    onClick={() => { a.action(); onClose(); }}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                      selectedIdx === idx ? "bg-accent-primary/15" : "hover:bg-app-hover"
                    }`}
                  >
                    <ArrowRight size={14} className="text-fg-muted" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-fg-primary">{a.label}</div>
                      <div className="text-[10px] text-fg-muted">{a.hint}</div>
                    </div>
                    {selectedIdx === idx && <CornerDownLeft size={12} className="text-accent-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </>
          )}

          {fileResults.length === 0 && actionResults.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-fg-muted">
              No results found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
