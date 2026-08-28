import { useState, useEffect, useRef } from "react";
import { X, FilePlus2, Folder } from "lucide-react";
import type { CodeLanguage } from "@/types";
import { detectLanguage, getLanguageLabel, getLanguageColor } from "@/lib/fileUtils";

interface NewFileModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (filename: string, language: CodeLanguage) => void;
}

export function NewFileModal({ open, onClose, onCreate }: NewFileModalProps) {
  const [filename, setFilename] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFilename("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const detectedLang = filename.includes(".") ? detectLanguage(filename) : "text";

  const handleCreate = () => {
    if (!filename.trim()) return;
    onCreate(filename.trim(), detectedLang);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-app-elevated rounded-2xl border border-border-strong shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <FilePlus2 size={18} className="text-accent-primary" />
            <h2 className="text-base font-semibold text-fg-primary">New File</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-app-hover text-fg-muted hover:text-fg-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-fg-secondary mb-2">
              File name
            </label>
            <input
              ref={inputRef}
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. app.py, server.js, UserList.tsx"
              className="w-full px-3 py-2.5 rounded-lg bg-app-input text-fg-primary text-sm border border-border-subtle focus:border-accent-primary focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-fg-muted">Language:</span>
            <span
              className="px-2 py-1 rounded-md font-medium"
              style={{
                color: getLanguageColor(detectedLang),
                background: `${getLanguageColor(detectedLang)}15`,
              }}
            >
              {getLanguageLabel(detectedLang)}
            </span>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg bg-app-card hover:bg-app-hover text-fg-secondary text-sm font-medium border border-border-subtle transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!filename.trim()}
              className="flex-1 py-2.5 rounded-lg bg-accent-primary hover:opacity-90 disabled:opacity-40 text-white text-sm font-medium transition-all"
            >
              Create File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
