import { useState, useRef, useEffect } from "react";
import {
  Terminal, Play, Trash2, Copy, Check, ChevronDown, ChevronUp,
  AlertCircle, AlertTriangle, Sparkles,
  Maximize2, Minimize2, CheckCircle2, Clock
} from "lucide-react";
import type { LogEntry, ExecutionResult } from "@/lib/codeRunner";
import type { CodeIssue } from "@/lib/issues";

interface ExecutionConsoleProps {
  logs: LogEntry[];
  result: ExecutionResult | null;
  isRunning: boolean;
  onRunCode: () => void;
  onClearLogs: () => void;
  issues?: CodeIssue[];
  onAskJarvis?: (prompt: string) => void;
  onJumpToIssue?: (file: string, line: number) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export function ExecutionConsole({
  logs,
  result,
  isRunning,
  onRunCode,
  onClearLogs,
  issues = [],
  onAskJarvis,
  onJumpToIssue,
  isOpen,
  onToggleOpen,
}: ExecutionConsoleProps) {
  const [activeTab, setActiveTab] = useState<"terminal" | "trace" | "problems">("terminal");
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text || "No logs available");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const errorCount = logs.filter((l) => l.type === "error").length + issues.filter(i => i.severity === "error").length;

  if (!isOpen) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border-subtle bg-slate-950/90 text-xs select-none">
        <button
          onClick={onToggleOpen}
          className="flex items-center gap-2 text-slate-400 hover:text-cyan-300 font-mono transition-colors"
          title="Open Integrated Terminal & Execution Console"
        >
          <Terminal size={13} className="text-cyan-400" />
          <span className="font-semibold">Terminal & Output</span>
          {logs.length > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px]">
              {logs.length}
            </span>
          )}
          {errorCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 text-[10px] font-bold">
              {errorCount} {errorCount === 1 ? "err" : "errs"}
            </span>
          )}
          <ChevronUp size={12} className="ml-1" />
        </button>

        <button
          onClick={onRunCode}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold font-mono transition-all bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 hover:scale-105"
          title="Run active file code (Ctrl+Enter)"
        >
          <Play size={11} className={isRunning ? "animate-spin" : "fill-emerald-300"} />
          <span>{isRunning ? "Running…" : "Run Code"}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-t border-border-subtle bg-slate-950/95 font-mono text-xs overflow-hidden transition-all"
      style={{ height: isExpanded ? "380px" : "200px" }}
    >
      {/* ── Console Header ── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-border-subtle select-none flex-shrink-0">
        {/* Left tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("terminal")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
              activeTab === "terminal"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal size={12} />
            <span>Console Output</span>
            {logs.length > 0 && (
              <span className="text-[10px] opacity-75 font-normal">({logs.length})</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("trace")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
              activeTab === "trace"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock size={12} />
            <span>Execution Trace</span>
            {result && (
              <span className="text-[10px] text-emerald-400">({result.executionTimeMs}ms)</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("problems")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
              activeTab === "problems"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <AlertCircle size={12} />
            <span>Problems</span>
            {issues.length > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                {issues.length}
              </span>
            )}
          </button>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onRunCode}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 hover:scale-105 flex-shrink-0"
            title="Execute Code (Ctrl+Enter)"
          >
            <Play size={11} className={isRunning ? "animate-spin" : "fill-emerald-400"} />
            <span>{isRunning ? "Running…" : "Run Code"}</span>
          </button>

          <button
            onClick={onClearLogs}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            title="Clear Console"
          >
            <Trash2 size={13} />
          </button>

          <button
            onClick={handleCopyLogs}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            title="Copy logs"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>

          <button
            onClick={() => setIsExpanded(v => !v)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            title={isExpanded ? "Collapse height" : "Expand height"}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            onClick={onToggleOpen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            title="Close drawer"
          >
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-1.5 bg-black/40">
        {/* Terminal Logs Tab */}
        {activeTab === "terminal" && (
          <>
            {logs.length === 0 && !isRunning && (
              <div className="flex flex-col items-center justify-center py-6 text-slate-500 space-y-2">
                <Terminal size={24} className="opacity-40" />
                <p>Terminal ready. Write code and click "Run Code" (or press Ctrl+Enter).</p>
              </div>
            )}

            {logs.map((log) => {
              let badgeColor = "bg-slate-800 text-slate-300";
              let textColor = "text-slate-200";

              if (log.type === "error") {
                badgeColor = "bg-red-950 text-red-400 border border-red-800/40";
                textColor = "text-red-300";
              } else if (log.type === "warn") {
                badgeColor = "bg-amber-950 text-amber-400 border border-amber-800/40";
                textColor = "text-amber-300";
              } else if (log.type === "info") {
                badgeColor = "bg-cyan-950 text-cyan-400 border border-cyan-800/40";
                textColor = "text-cyan-200";
              } else if (log.type === "return") {
                badgeColor = "bg-emerald-950 text-emerald-400 border border-emerald-800/40";
                textColor = "text-emerald-300";
              }

              return (
                <div key={log.id} className="flex items-start gap-2.5 hover:bg-white/[0.02] px-1 py-0.5 rounded leading-relaxed">
                  <span className="text-[10px] text-slate-600 select-none flex-shrink-0 mt-0.5">
                    {log.timestamp}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase select-none flex-shrink-0 ${badgeColor}`}>
                    {log.type}
                  </span>
                  <div className={`flex-1 break-words whitespace-pre-wrap ${textColor}`}>
                    {log.message}
                  </div>

                  {log.type === "error" && onAskJarvis && (
                    <button
                      onClick={() => onAskJarvis(`How do I fix this runtime error: "${log.message}" in my code?`)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 transition-all flex-shrink-0"
                      title="Ask Jarvis to diagnose and fix this error"
                    >
                      <Sparkles size={10} /> Ask Jarvis to Fix
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Execution Trace Tab */}
        {activeTab === "trace" && (
          <div className="space-y-3 p-1">
            {result ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-900/90 border border-border-subtle">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    ) : (
                      <AlertCircle size={16} className="text-red-400" />
                    )}
                    <span className="font-bold text-slate-200">
                      {result.success ? "Execution Succeeded" : "Execution Failed"}
                    </span>
                  </div>

                  <div className="text-slate-400">
                    Duration: <span className="text-cyan-300 font-bold">{result.executionTimeMs} ms</span>
                  </div>

                  <div className="text-slate-400">
                    Total Output Events: <span className="text-cyan-300 font-bold">{logs.length}</span>
                  </div>
                </div>

                {result.returnValue !== undefined && (
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30">
                    <div className="text-emerald-400 font-bold mb-1">Return Value:</div>
                    <pre className="text-xs text-slate-200 overflow-x-auto">
                      {typeof result.returnValue === "object"
                        ? JSON.stringify(result.returnValue, null, 2)
                        : String(result.returnValue)
                      }
                    </pre>
                  </div>
                )}

                {result.error && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 space-y-2">
                    <div className="text-red-400 font-bold flex items-center gap-2">
                      <AlertCircle size={14} /> {result.error.name}: {result.error.message}
                    </div>
                    {result.error.stack && (
                      <pre className="text-[11px] text-red-300/80 overflow-x-auto whitespace-pre-wrap">
                        {result.error.stack}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500">
                Run your code to see detailed step trace, duration, and return values.
              </div>
            )}
          </div>
        )}

        {/* Problems Tab */}
        {activeTab === "problems" && (
          <div className="space-y-1.5 p-1">
            {issues.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-emerald-400 gap-2">
                <CheckCircle2 size={16} /> No syntax or security problems detected in current files!
              </div>
            ) : (
              issues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => onJumpToIssue?.(issue.file, issue.line)}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-900 border border-border-subtle cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {issue.severity === "error" ? (
                      <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                    ) : (
                      <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
                    )}
                    <div>
                      <div className="text-slate-200 font-semibold">{issue.title}</div>
                      <div className="text-[11px] text-slate-400">{issue.description}</div>
                    </div>
                  </div>

                  <div className="text-[10px] text-cyan-400 font-mono flex-shrink-0 ml-3">
                    {issue.file}:{issue.line}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
