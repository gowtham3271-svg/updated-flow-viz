import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Plus, Trash2, X, ChevronRight, FileCode2 } from "lucide-react";
import type { CodeFile } from "@/types";
import { tokenizeLine, type Token } from "@/lib/syntaxHighlight";
import { getLanguageLabel } from "@/lib/fileUtils";

interface CodeEditorProps {
  files: CodeFile[];
  activeFile: number;
  onActiveFileChange: (i: number) => void;
  onFileContentChange: (content: string) => void;
  onAddFile: () => void;
  onDeleteFile: (i: number) => void;
  analyzing: boolean;
  onCursorChange?: (line: number, col: number) => void;
}

const TOKEN_CLASS: Record<string, string> = {
  plain: "tok-plain",
  keyword: "tok-keyword",
  string: "tok-string",
  comment: "tok-comment",
  number: "tok-number",
  function: "tok-function",
  operator: "tok-operator",
  punctuation: "tok-punctuation",
  type: "tok-type",
  variable: "tok-variable",
  constant: "tok-constant",
  tag: "tok-tag",
  attr: "tok-attr",
  property: "tok-property",
};

function renderTokens(tokens: Token[]): string {
  return tokens
    .map((t) => {
      const cls = TOKEN_CLASS[t.type] ?? "tok-plain";
      const escaped = t.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<span class="${cls}">${escaped}</span>`;
    })
    .join("");
}

function highlightLine(line: string, lang: CodeFile["language"]): string {
  if (!line) return "&nbsp;";
  const tokens = tokenizeLine(line, lang);
  return renderTokens(tokens);
}

export function CodeEditor({
  files,
  activeFile,
  onActiveFileChange,
  onFileContentChange,
  onAddFile,
  onDeleteFile,
  analyzing,
  onCursorChange,
}: CodeEditorProps) {
  const [localContent, setLocalContent] = useState("");
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [openTabs, setOpenTabs] = useState<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const current = files[activeFile];

  useEffect(() => {
    setLocalContent(current?.content ?? "");
    if (current && !openTabs.includes(activeFile)) {
      setOpenTabs((prev) => [...prev, activeFile]);
    }
  }, [activeFile, current?.content]);

  useEffect(() => {
    if (current && !openTabs.includes(activeFile)) {
      setOpenTabs((prev) => [...prev, activeFile]);
    }
  }, [activeFile, current, openTabs]);

  const lines = localContent.split("\n");

  const handleChange = (value: string) => {
    setLocalContent(value);
    onFileContentChange(value);
  };

  const updateCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const lineNum = before.split("\n").length;
    const colNum = pos - before.lastIndexOf("\n");
    setCursorLine(lineNum);
    setCursorCol(colNum);
    onCursorChange?.(lineNum, colNum);
  }, [onCursorChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newValue = localContent.slice(0, start) + "  " + localContent.slice(end);
      handleChange(newValue);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
    }
  };

  const handleScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = ta.scrollTop;
    }
  };

  const closeTab = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = openTabs.filter((t) => t !== idx);
    setOpenTabs(newTabs);
    if (activeFile === idx && newTabs.length > 0) {
      onActiveFileChange(newTabs[newTabs.length - 1]);
    }
  };

  const highlightedLines = useMemo(() => {
    return lines.map((line) => highlightLine(line, current?.language ?? "text"));
  }, [lines, current?.language]);

  const breadcrumb = current?.path.split("/").filter(Boolean) ?? [];

  return (
    <div className="flex flex-col h-full bg-app-panel backdrop-blur-xl">
      {/* Open tabs */}
      <div className="flex items-center gap-0.5 px-1 py-1 border-b border-border-subtle overflow-x-auto bg-app-bg/50">
        {openTabs.length === 0 && (
          <div className="px-3 py-1.5 text-xs text-fg-faint">No file open</div>
        )}
        {openTabs.map((idx) => {
          const f = files[idx];
          if (!f) return null;
          const isActive = idx === activeFile;
          return (
            <div
              key={idx}
              onClick={() => onActiveFileChange(idx)}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-md cursor-pointer text-xs font-mono transition-all flex-shrink-0 ${
                isActive
                  ? "bg-app-panel text-fg-primary border-t-2 border-t-accent-primary"
                  : "bg-app-card text-fg-muted hover:bg-app-hover border-t-2 border-t-transparent"
              }`}
            >
              <FileCode2 size={12} className="text-fg-faint" />
              <span>{f.filename}</span>
              {files.length > 1 && (
                <button
                  onClick={(e) => closeTab(idx, e)}
                  className="opacity-0 group-hover:opacity-100 text-fg-faint hover:text-fg-primary transition-opacity ml-1"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={onAddFile}
          className="p-1.5 rounded hover:bg-app-hover text-fg-muted hover:text-accent-primary transition-colors flex-shrink-0 ml-1"
          title="New file"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Breadcrumb */}
      {current && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border-subtle text-[11px] text-fg-muted overflow-x-auto">
          {breadcrumb.map((part, i) => (
            <span key={i} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && <ChevronRight size={10} className="text-fg-faint" />}
              <span className={i === breadcrumb.length - 1 ? "text-fg-secondary font-medium" : ""}>
                {part}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden font-mono text-xs relative">
        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          className="py-3 px-2 text-right text-fg-faint select-none bg-app-bg/50 border-r border-border-subtle overflow-hidden flex-shrink-0"
          style={{ minWidth: "44px" }}
        >
          {lines.map((_, i) => (
            <div
              key={i}
              className={`leading-5 ${i + 1 === cursorLine ? "text-accent-primary font-medium" : ""}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Highlighted code layer */}
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="absolute inset-0 py-3 px-3 pointer-events-none overflow-auto whitespace-pre text-fg-primary"
          style={{ left: "44px", right: 0, top: 0, bottom: 0 }}
        >
          {highlightedLines.map((html, i) => (
            <div
              key={i}
              className="leading-5 min-h-5"
              dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
            />
          ))}
        </pre>

        {/* Textarea overlay */}
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={updateCursor}
          onClick={updateCursor}
          onScroll={handleScroll}
          spellCheck={false}
          className="flex-1 py-3 px-3 bg-transparent text-transparent caret-fg-primary resize-none focus:outline-none leading-5 overflow-auto whitespace-pre relative z-10"
          style={{ caretColor: "var(--text-primary)" }}
          placeholder="Type or paste code here..."
        />
      </div>

      {/* Bottom info bar */}
      {current && (
        <div className="flex items-center justify-between px-3 py-1 border-t border-border-subtle text-[10px] text-fg-muted">
          <div className="flex items-center gap-3">
            <span>{getLanguageLabel(current.language)}</span>
            {analyzing && (
              <span className="flex items-center gap-1 text-accent-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
                analyzing
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span>Ln {cursorLine}, Col {cursorCol}</span>
            <span>{lines.length} lines</span>
          </div>
        </div>
      )}
    </div>
  );
}
