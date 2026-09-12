import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Trash2, User, Bot, AlertCircle, RotateCcw, Square, Terminal } from "lucide-react";
import type { FlowGraph, FlowNode, FlowEdge, CodeFile } from "@/types";
import { sendChatStream, parseActionsFromText, type ParsedAction } from "@/lib/chat";
import { saveUserQuestion, updateUserQuestionReply } from "@/services/questionsService";
import { MarkdownRenderer } from "./MarkdownRenderer";

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
  isStreaming?: boolean;
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
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isUserScrolledUpRef = useRef(false);

  const suggestions = getSuggestions(selectedNode, activeStep);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    isUserScrolledUpRef.current = scrollHeight - (scrollTop + clientHeight) > 60;
  }, []);

  useEffect(() => {
    if (scrollRef.current && !isUserScrolledUpRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, isStreaming]);

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
    onRunCode,
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
    if (!trimmed || loading || isStreaming) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    isUserScrolledUpRef.current = false;

    const userMsg: EnrichedMessage = {
      role: "user",
      content: trimmed,
      cleanText: trimmed,
    };

    const pendingAssistantMsg: EnrichedMessage = {
      role: "assistant",
      content: "",
      cleanText: "",
      isStreaming: true,
    };

    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, pendingAssistantMsg]);
    setInput("");
    setLoading(true);
    setIsStreaming(true);
    setError(null);

    // Immediately persist user question to Supabase so it appears in Table Editor right away
    let questionDbId: string | undefined;
    saveUserQuestion({
      question: trimmed,
      reply: null,
      context: {
        selectedNode: selectedNode ? { id: selectedNode.id, label: selectedNode.label, kind: selectedNode.kind } : null,
        activeStep: activeStep ? { label: activeStep.label, from: activeStep.from, to: activeStep.to } : null,
        totalFiles: files.length,
        totalNodes: graph.nodes.length,
      },
    }).then(res => {
      if (res?.data?.id) {
        questionDbId = res.data.id;
      }
    });

    try {
      let accumulatedReply = "";
      const fullReply = await sendChatStream(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        {
          files,
          graph,
          selectedNode,
          activeStep,
          mode: "chat",
        },
        (_chunk, accumulated) => {
          accumulatedReply = accumulated;
          setLoading(false);
          setMessages(prev => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: accumulated,
                cleanText: accumulated,
              };
            }
            return updated;
          });
        },
        controller.signal
      );

      const finalReply = accumulatedReply || fullReply;
      const { cleanText, actions } = parseActionsFromText(finalReply, graph, files);

      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
          updated[lastIdx] = {
            role: "assistant",
            content: finalReply,
            cleanText,
            actions,
            isStreaming: false,
          };
        }
        return updated;
      });

      // Persist user question and AI reply to Supabase database in background
      if (questionDbId) {
        updateUserQuestionReply(questionDbId, finalReply);
      } else {
        saveUserQuestion({
          question: trimmed,
          reply: finalReply,
          context: {
            selectedNode: selectedNode ? { id: selectedNode.id, label: selectedNode.label, kind: selectedNode.kind } : null,
            activeStep: activeStep ? { label: activeStep.label, from: activeStep.from, to: activeStep.to } : null,
            totalFiles: files.length,
            totalNodes: graph.nodes.length,
          },
        });
      }

      // Trigger actions automatically
      if (actions.length > 0) {
        actions.forEach(act => executeAction(act));
      }
    } catch (err) {
      if (controller.signal.aborted) return;

      const userFriendlyError = "Sir, I encountered a temporary connection glitch. Please try again or execute one of the suggested actions below.";
      setError(userFriendlyError);

      setMessages(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === "assistant" && !updated[lastIdx].content) {
          updated.pop();
        }
        return updated;
      });

      if (questionDbId) {
        updateUserQuestionReply(questionDbId, userFriendlyError);
      }
    } finally {
      setLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [messages, loading, isStreaming, files, graph, selectedNode, activeStep, executeAction]);

  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setIsStreaming(false);
    setMessages(prev =>
      prev.map(m => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  }, []);

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
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setMessages([]);
    setError(null);
    setLoading(false);
    setIsStreaming(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/90 select-none">
      {/* Telemetry Status Bar */}
      <div className="px-3.5 py-1.5 bg-slate-900/80 border-b border-cyan-500/20 flex items-center justify-between text-[10px] font-mono text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isStreaming || loading ? "bg-amber-400 animate-pulse" : "bg-emerald-400"}`} />
          <span className="text-cyan-300 font-bold">JARVIS CO-PILOT</span>
          <span className="text-slate-500">//</span>
          <span className="text-slate-400">
            {isStreaming ? "TRANSMITTING DATA STREAM" : loading ? "ANALYZING GRAPH" : "ONLINE"}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
            title="Clear conversation"
          >
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      {/* Empty State Banner */}
      {messages.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-[280px]">
            <div className="relative inline-block mb-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-500/20 mx-auto">
                <Sparkles size={22} className="text-cyan-400 animate-pulse" />
              </div>
            </div>
            <h3 className="text-xs font-bold font-mono tracking-wider text-cyan-300 mb-1">
              ARCHITECTURAL CO-PILOT
            </h3>
            <p className="text-[11.5px] text-slate-400 leading-relaxed mb-3">
              Full real-time telemetry over your 3D system graph, data conduits, and source files.
            </p>
            <p className="text-[10px] font-mono text-cyan-500/70">
              [ENTER COMMAND OR SELECT SUGGESTION BELOW]
            </p>
          </div>
        </div>
      )}

      {/* Message List */}
      {messages.length > 0 && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-4 select-text"
        >
          {messages.map((msg, i) => {
            const isLatestAssistant = msg.role === "assistant" && i === messages.length - 1;
            const isPendingEmpty = msg.role === "assistant" && !msg.content && loading;

            return (
              <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center text-[10px] font-bold font-mono shadow-sm ${
                    msg.role === "user"
                      ? "bg-violet-950/80 border border-violet-500/40 text-violet-300"
                      : "bg-cyan-950/80 border border-cyan-500/40 text-cyan-300"
                  }`}
                >
                  {msg.role === "user" ? <User size={13} /> : <Bot size={13} />}
                </div>

                <div
                  className={`flex-1 min-w-0 rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed space-y-2 shadow-md ${
                    msg.role === "user"
                      ? "rounded-tr-none bg-violet-950/70 border border-violet-500/30 text-violet-100"
                      : "rounded-tl-none bg-slate-900/90 border border-cyan-500/20 text-slate-100"
                  }`}
                >
                  {isPendingEmpty ? (
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="flex gap-1">
                        {[0.1, 0.2, 0.3].map((d, dotIdx) => (
                          <div
                            key={dotIdx}
                            className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"
                            style={{ animationDelay: `${d}s` }}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-cyan-300 font-mono">
                        Analyzing system telemetry…
                      </span>
                    </div>
                  ) : (
                    <MarkdownRenderer
                      content={msg.content}
                      isStreaming={msg.isStreaming && isLatestAssistant}
                      actions={msg.actions}
                      onExecuteAction={executeAction}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="flex gap-2 items-start text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2.5">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-red-400" />
              <span className="flex-1 font-mono">{error}</span>
              <button
                onClick={handleRetry}
                className="flex-shrink-0 p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                title="Retry transmission"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Suggestion Chips */}
      {messages.length === 0 && !loading && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSend(s)}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-mono text-slate-300 bg-slate-900/80 hover:bg-cyan-950/60 border border-cyan-500/20 hover:border-cyan-500/50 transition-all text-left"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Command Console Input Area */}
      <div className="p-3 border-t border-cyan-500/20 bg-slate-950">
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
            disabled={isStreaming}
            placeholder={
              isStreaming
                ? "J.A.R.V.I.S. is streaming response…"
                : "Ask about your code, flow, or give 3D commands (Shift+Enter for newline)..."
            }
            rows={1}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-900/90 text-slate-100 text-xs font-mono border border-cyan-500/25 focus:border-cyan-400 focus:outline-none resize-none max-h-32 transition-all focus:shadow-[0_0_12px_rgba(0,212,255,0.25)]"
            style={{ minHeight: "38px" }}
          />

          {isStreaming || loading ? (
            <button
              onClick={handleStopStreaming}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              title="Stop generation"
            >
              <Square size={13} className="fill-red-400" />
            </button>
          ) : (
            <button
              onClick={() => handleSend(input)}
              disabled={!input.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 disabled:opacity-30 text-cyan-300 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              title="Send command (Enter)"
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
