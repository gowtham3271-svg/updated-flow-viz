import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Trash2, User, Bot, AlertCircle, RotateCcw, Play, Shield, Maximize2 } from "lucide-react";
import type { FlowGraph, FlowNode, FlowEdge, CodeFile } from "@/types";
import { sendChat, parseActionsFromText, type ChatMessage, type ParsedAction } from "@/lib/chat";

interface ChatPanelProps {
  files: CodeFile[];
  graph: FlowGraph;
  selectedNode: FlowNode | null;
  activeStep: FlowEdge | null;
  prefillQuestion?: string | null;
  onPrefillConsumed?: () => void;
  onSelectNode?: (id: string | null) => void;
  onPlayFlow?: () => void;
  onPauseFlow?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onSelectFile?: (path: string) => void;
  onRunAnalysis?: () => void;
  onRunSecurityScan?: () => void;
  onRunCode?: () => void;
}

interface EnrichedMessage {
  role: "user" | "assistant";
  content: string;
  cleanText: string;
  actions?: ParsedAction[];
}

function getSuggestions(selectedNode: FlowNode | null, activeStep: FlowEdge | null): string[] {
  if (selectedNode) {
    return [
      `Explain "${selectedNode.label}" & show flow`,
      "What does this connect to?",
      "How can I improve this component?",
      "Show security check for this",
    ];
  }
  if (activeStep) {
    return [
      `What does "${activeStep.label}" do?`,
      "Explain this connection flow",
      "What data travels here?",
    ];
  }
  return [
    "▶️ Run my code in live terminal",
    "🌐 Explain the full architecture",
    "🛡️ Run security vulnerability check",
    "💡 How to optimize this code?",
  ];
}

export function ChatPanel({
  files,
  graph,
  selectedNode,
  activeStep,
  prefillQuestion,
  onPrefillConsumed,
  onSelectNode,
  onPlayFlow,
  onPauseFlow,
  onZoomIn,
  onZoomOut,
  onResetView,
  onSelectFile,
  onRunAnalysis,
  onRunSecurityScan,
  onRunCode,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = getSuggestions(selectedNode, activeStep);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Execute an action on the visualization
  const executeAction = useCallback((action: ParsedAction) => {
    switch (action.type) {
      case "run_code":
        onRunCode?.();
        break;
      case "focus_node":
        if (action.param) {
          onSelectNode?.(action.param);
        }
        break;
      case "play_flow":
        onPlayFlow?.();
        break;
      case "pause_flow":
        onPauseFlow?.();
        break;
      case "zoom_in":
        onZoomIn?.();
        break;
      case "zoom_out":
        onZoomOut?.();
        break;
      case "reset_view":
        onResetView?.();
        break;
      case "select_file":
        if (action.param) {
          onSelectFile?.(action.param);
        }
        break;
      case "run_analysis":
        onRunAnalysis?.();
        break;
      case "run_security":
        onRunSecurityScan?.();
        break;
    }
  }, [
    onSelectNode,
    onPlayFlow,
    onPauseFlow,
    onZoomIn,
    onZoomOut,
    onResetView,
    onSelectFile,
    onRunAnalysis,
    onRunSecurityScan,
  ]);

  // Handle prefill from InfoPanel "Ask AI" button
  useEffect(() => {
    if (prefillQuestion) {
      setInput(prefillQuestion);
      onPrefillConsumed?.();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [prefillQuestion, onPrefillConsumed]);

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: EnrichedMessage = {
      role: "user",
      content: trimmed,
      cleanText: trimmed,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const rawReply = await sendChat(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        {
          files,
          graph,
          selectedNode,
          activeStep,
          mode: "chat",
        }
      );

      const { cleanText, actions } = parseActionsFromText(rawReply, graph, files);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: rawReply,
          cleanText,
          actions,
        },
      ]);

      // Trigger actions automatically
      if (actions.length > 0) {
        actions.forEach(act => executeAction(act));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get a response.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, files, graph, selectedNode, activeStep, executeAction]);

  const handleRetry = () => {
    if (error && messages.length > 0) {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser) {
        const trimmed = messages.slice(0, -1);
        setMessages(trimmed);
        handleSend(lastUser.content);
      }
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-[260px]">
            <div className="relative inline-block mb-3">
              <Sparkles size={36} className="text-accent-primary mx-auto animate-pulse" />
            </div>
            <h3 className="text-sm font-semibold text-fg-primary mb-1">AI Co-Pilot & Architectural Chat</h3>
            <p className="text-xs text-fg-secondary leading-relaxed mb-3">
              I have full real-time access to your 3D nodes, data connections, and code files.
            </p>
            <p className="text-[11px] text-fg-muted">
              Ask me to explain any flow, animate data pathways, or suggest architectural improvements.
            </p>
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                  msg.role === "user"
                    ? "bg-accent-primary/20"
                    : "bg-cyan-500/20 text-cyan-300"
                }`}
              >
                {msg.role === "user" ? (
                  <User size={14} className="text-accent-primary" />
                ) : (
                  <Bot size={14} className="text-cyan-400" />
                )}
              </div>
              <div
                className={`flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm leading-relaxed space-y-2 ${
                  msg.role === "user"
                    ? "bg-accent-primary/15 text-fg-primary"
                    : "bg-app-card text-fg-primary border border-border-subtle"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.cleanText}</p>

                {/* Interactive Action Badges */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {msg.actions.map((act, actIdx) => (
                      <button
                        key={actIdx}
                        onClick={() => executeAction(act)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-all hover:scale-105"
                        title={`Click to re-run: ${act.label}`}
                      >
                        <Sparkles size={11} /> {act.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2.5">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-cyan-500/20 text-cyan-300">
                <Bot size={14} />
              </div>
              <div className="bg-app-card border border-border-subtle rounded-xl px-3 py-2.5">
                <div className="flex gap-1.5 items-center">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="text-xs text-fg-muted ml-2 font-mono">Analyzing…</span>
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="flex gap-2 items-start text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button
                onClick={handleRetry}
                className="flex-shrink-0 p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                title="Retry"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {messages.length === 0 && !loading && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              className="px-3 py-1.5 rounded-full text-xs text-fg-secondary bg-app-card hover:bg-app-hover border border-border-subtle hover:border-accent-primary/40 transition-all text-left"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 border-t border-border-subtle">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            placeholder="Ask about your code, flow, or give 3D commands..."
            rows={1}
            className="flex-1 px-3 py-2 rounded-xl bg-app-input text-fg-primary text-sm border border-border-subtle focus:border-accent-primary focus:outline-none resize-none max-h-32"
            style={{ minHeight: "38px" }}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent-primary hover:opacity-90 disabled:opacity-30 text-white flex items-center justify-center transition-all"
          >
            <Send size={16} />
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              disabled={loading}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-app-card hover:bg-app-hover text-fg-muted hover:text-fg-primary border border-border-subtle flex items-center justify-center transition-all"
              title="Clear chat"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

