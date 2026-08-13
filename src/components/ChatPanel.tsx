import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, Trash2, User, Bot, AlertCircle, RotateCcw } from "lucide-react";
import type { FlowGraph, FlowNode, FlowEdge, CodeFile } from "@/types";
import { sendChat, type ChatMessage } from "@/lib/chat";

interface ChatPanelProps {
  files: CodeFile[];
  graph: FlowGraph;
  selectedNode: FlowNode | null;
  activeStep: FlowEdge | null;
  prefillQuestion?: string | null;
  onPrefillConsumed?: () => void;
}

function getSuggestions(selectedNode: FlowNode | null, activeStep: FlowEdge | null): string[] {
  if (selectedNode) {
    return [
      `Explain the "${selectedNode.label}" node`,
      "What does this connect to?",
      "Show me the code for this",
      "How can I improve this?",
    ];
  }
  if (activeStep) {
    return [
      `What does "${activeStep.label}" do?`,
      "Explain this connection",
      "What data flows here?",
    ];
  }
  return [
    "How does this system work?",
    "Explain the architecture",
    "What are the main components?",
    "Find potential issues",
  ];
}

export function ChatPanel({ files, graph, selectedNode, activeStep, prefillQuestion, onPrefillConsumed }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const reply = await sendChat(newMessages, {
        files,
        graph,
        selectedNode,
        activeStep,
        mode: "chat",
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get a response.");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, files, graph, selectedNode, activeStep]);

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
          <div className="text-center max-w-[240px]">
            <div className="relative inline-block mb-4">
              <Sparkles size={36} className="text-accent-primary mx-auto" />
              <div className="absolute inset-0 blur-lg text-accent-primary opacity-40">
                <Sparkles size={36} />
              </div>
            </div>
            <p className="text-sm text-fg-secondary leading-relaxed mb-1">
              Ask anything about your code or the flow visualization.
            </p>
            <p className="text-xs text-fg-muted">
              The assistant knows about your files, nodes, and connections.
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
                    : "bg-accent-secondary/15"
                }`}
              >
                {msg.role === "user" ? (
                  <User size={14} className="text-accent-primary" />
                ) : (
                  <Bot size={14} className="text-accent-secondary" />
                )}
              </div>
              <div
                className={`flex-1 min-w-0 rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent-primary/15 text-fg-primary"
                    : "bg-app-card text-fg-primary border border-border-subtle"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2.5">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-accent-secondary/15">
                <Bot size={14} className="text-accent-secondary" />
              </div>
              <div className="bg-app-card border border-border-subtle rounded-xl px-3 py-2.5">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-fg-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-fg-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-fg-muted animate-bounce" style={{ animationDelay: "300ms" }} />
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
              className="px-3 py-1.5 rounded-full text-xs text-fg-secondary bg-app-card hover:bg-app-hover border border-border-subtle hover:border-accent-primary/40 transition-all"
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
            placeholder="Ask about your code or flow..."
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
