import { useState } from "react";
import { X, StickyNote } from "lucide-react";

interface AnnotationModalProps {
  nodeId: string;
  nodeLabel: string;
  currentText: string | null;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function AnnotationModal({ nodeId, nodeLabel, currentText, onSave, onDelete, onClose }: AnnotationModalProps) {
  const [text, setText] = useState(currentText ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-app-elevated rounded-2xl border border-border-strong shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <StickyNote size={18} className="text-amber-400" />
            <h2 className="text-base font-semibold text-slate-100">Add Note</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-app-hover text-fg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 text-sm text-fg-secondary">
          Pin a note to <span className="font-mono text-amber-300">{nodeLabel}</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          rows={4}
          placeholder="Write your note about this step..."
          className="w-full px-3 py-2 rounded-lg bg-app-input text-fg-primary text-sm border border-border-subtle focus:border-amber-500 focus:outline-none resize-none"
        />

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onSave(text)}
            disabled={!text.trim()}
            className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-900 text-sm font-medium transition-colors"
          >
            Save Note
          </button>
          {currentText && (
            <button
              onClick={onDelete}
              className="px-4 py-2 rounded-lg bg-app-card hover:bg-red-500/20 text-fg-muted hover:text-red-400 text-sm transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
