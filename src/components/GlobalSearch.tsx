import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, FileCode2, ChevronRight, CaseSensitive } from "lucide-react";
import type { CodeFile } from "@/types";
import { getLanguageColor } from "@/lib/fileUtils";

interface GlobalSearchProps {
  files: CodeFile[];
  open: boolean;
  onClose: () => void;
  onFileSelect: (index: number, line: number) => void;
}

interface SearchResult {
  fileIndex: number;
  filename: string;
  filePath: string;
  language: CodeFile["language"];
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export function GlobalSearch({ files, open, onClose, onFileSelect }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    const searchStr = caseSensitive ? query : query.toLowerCase();
    const out: SearchResult[] = [];

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      const lines = file.content.split("\n");
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const searchLine = caseSensitive ? line : line.toLowerCase();
        const idx = searchLine.indexOf(searchStr);
        if (idx !== -1) {
          out.push({
            fileIndex: fi,
            filename: file.filename,
            filePath: file.path,
            language: file.language,
            line: li + 1,
            text: line.trim().slice(0, 200),
            matchStart: idx,
            matchEnd: idx + query.length,
          });
        }
      }
      if (out.length >= 200) break;
    }
    return out;
  }, [files, query, caseSensitive]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    const el = resultsRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const grouped = useMemo(() => {
    const map = new Map<number, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.fileIndex) ?? [];
      arr.push(r);
      map.set(r.fileIndex, arr);
    }
    return map;
  }, [results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[selectedIdx];
      if (r) {
        onFileSelect(r.fileIndex, r.line);
        onClose();
      }
    }
  };

  if (!open) return null;

  let runningIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-app-elevated rounded-xl border border-border-strong shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
          <Search size={16} className="text-fg-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search across all files..."
            className="flex-1 bg-transparent text-sm text-fg-primary focus:outline-none placeholder:text-fg-faint"
          />
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            className={`p-1 rounded transition-colors ${
              caseSensitive ? "bg-accent-primary/20 text-accent-primary" : "text-fg-faint hover:text-fg-secondary"
            }`}
            title="Match case"
          >
            <CaseSensitive size={16} />
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-app-hover text-fg-muted">
            <X size={16} />
          </button>
        </div>

        <div ref={resultsRef} className="max-h-[450px] overflow-y-auto">
          {query.trim() === "" ? (
            <div className="px-4 py-8 text-center text-sm text-fg-muted">
              Type to search across all loaded files
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-fg-muted">
              No results found for "{query}"
            </div>
          ) : (
            <>
              <div className="px-4 py-2 text-[11px] text-fg-muted border-b border-border-subtle">
                {results.length} result{results.length !== 1 ? "s" : ""} in {grouped.size} file{grouped.size !== 1 ? "s" : ""}
              </div>
              {Array.from(grouped.entries()).map(([fileIdx, fileResults]) => (
                <div key={fileIdx}>
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-app-card/50 text-xs">
                    <FileCode2 size={12} style={{ color: getLanguageColor(fileResults[0].language) }} />
                    <span className="text-fg-secondary font-medium">{fileResults[0].filename}</span>
                    <span className="text-fg-faint">{fileResults[0].filePath}</span>
                    <span className="ml-auto text-fg-faint">{fileResults.length}</span>
                  </div>
                  {fileResults.map((r) => {
                    const idx = runningIdx++;
                    return (
                      <button
                        key={`${r.fileIndex}-${r.line}`}
                        onClick={() => { onFileSelect(r.fileIndex, r.line); onClose(); }}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={`w-full flex items-start gap-2 px-4 py-1.5 text-left transition-colors ${
                          selectedIdx === idx ? "bg-accent-primary/15" : "hover:bg-app-hover"
                        }`}
                      >
                        <ChevronRight size={12} className="text-fg-faint mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-fg-faint text-[10px] mr-2">L{r.line}</span>
                          <span className="text-xs text-fg-secondary font-mono break-all">
                            {r.text.slice(0, r.matchStart)}
                            <mark className="bg-accent-primary/30 text-accent-primary rounded px-0.5">
                              {r.text.slice(r.matchStart, r.matchEnd)}
                            </mark>
                            {r.text.slice(r.matchEnd)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
