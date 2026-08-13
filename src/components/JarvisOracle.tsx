import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX, X, ChevronDown, ChevronUp, Send, RotateCcw, Loader2 } from "lucide-react";
import type { FlowGraph, FlowNode, CodeFile } from "@/types";
import { sendChat } from "@/lib/chat";

interface JarvisOracleProps {
  graph: FlowGraph;
  files: CodeFile[];
  selectedNode: FlowNode | null;
  onHighlightNode: (id: string | null) => void;
}

interface Message {
  role: "user" | "jarvis";
  text: string;
  timestamp: number;
}

const JARVIS_SYSTEM = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the AI assistant from Iron Man. You are embedded inside a live 3D code flow visualization tool.

Your personality:
- Speak with calm confidence and dry wit, exactly like the movie JARVIS
- Address the user as "Sir" or "Ms." occasionally
- Be analytical, precise, and insightful
- Use phrases like "Analyzing now...", "I've detected...", "Running diagnostics...", "Shall I proceed?", "Of course, Sir"
- Reference the actual graph nodes and connections by name when relevant
- Keep responses conversational but technically precise — not overly long

You have full access to the code flow graph showing nodes (frontend, backend, database, function) and their connections. When asked about a node or database or component, analyze it deeply and explain what it does, how it connects, and any potential issues.`;

export function JarvisOracle({ graph, files, selectedNode, onHighlightNode }: JarvisOracleProps) {
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{
    role: "jarvis",
    text: "Good evening. J.A.R.V.I.S. online. I have full access to your code flow architecture. I can see " +
      (graph.nodes.length > 0 ? `${graph.nodes.length} nodes and ${graph.edges.length} connections in the current visualization.` : "you haven't run an analysis yet. Shall I assist once you do?") +
      " What would you like to know, Sir?",
    timestamp: Date.now(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const lastJarvisMsg = useRef("");

  // Init TTS
  useEffect(() => {
    synthRef.current = window.speechSynthesis || null;
    return () => { synthRef.current?.cancel(); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, displayedText]);

  // Typewriter effect for latest JARVIS message
  const typewriterEffect = useCallback((text: string) => {
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    setIsTyping(true);
    setDisplayedText("");
    let i = 0;
    typeTimerRef.current = setInterval(() => {
      i++;
      setDisplayedText(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typeTimerRef.current!);
        setIsTyping(false);
      }
    }, 18);
  }, []);

  // TTS
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // Pick a deep British/robotic voice if available
    const voices = synthRef.current.getVoices();
    const preferred = voices.find(v =>
      v.name.includes("Daniel") || v.name.includes("Google UK") || v.name.includes("Arthur") || v.name.includes("British")
    ) || voices.find(v => v.lang === "en-GB") || voices[0];
    if (preferred) utterance.voice = preferred;
    utterance.rate = 0.92;
    utterance.pitch = 0.8;
    utterance.volume = 0.9;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synthRef.current.speak(utterance);
  }, [voiceEnabled]);

  // STT
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Speech recognition not supported in this browser. Please use Chrome or Edge."); return; }
    if (recognitionRef.current) recognitionRef.current.stop();
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript?.trim();
      if (transcript) { setInput(transcript); setTimeout(() => sendMessage(transcript), 100); }
    };
    rec.start();
    recognitionRef.current = rec;
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // Build rich context for JARVIS
  const buildContext = useCallback(() => {
    const nodeDescriptions = graph.nodes.map(n =>
      `[${n.kind.toUpperCase()}] "${n.label}" in ${n.file} (line ${n.line}): ${n.detail}`
    ).join("\n");
    const edgeDescriptions = graph.edges.map(e => {
      const fromNode = graph.nodes.find(n => n.id === e.from);
      const toNode   = graph.nodes.find(n => n.id === e.to);
      return `"${fromNode?.label}" → "${toNode?.label}" via ${e.kind}: ${e.label}`;
    }).join("\n");
    const fileSnippets = files.slice(0, 5).map(f =>
      `=== ${f.filename} ===\n${f.content.slice(0, 600)}`
    ).join("\n\n");
    const selectedCtx = selectedNode
      ? `\nCurrently selected node: "${selectedNode.label}" (${selectedNode.kind}) – ${selectedNode.detail}\nCode snippet:\n${selectedNode.snippet}`
      : "";

    return `SYSTEM ROLE: ${JARVIS_SYSTEM}

=== LIVE GRAPH DATA ===
Nodes (${graph.nodes.length}):
${nodeDescriptions || "No nodes detected yet."}

Connections (${graph.edges.length}):
${edgeDescriptions || "No connections yet."}
${selectedCtx}

=== CODE FILES (preview) ===
${fileSnippets || "No code loaded."}`;
  }, [graph, files, selectedNode]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: Message = { role: "user", text: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const context = buildContext();
      const chatMessages = [
        { role: "user" as const, content: context + "\n\nUser question: " + trimmed }
      ];
      const reply = await sendChat(chatMessages, { files, graph, selectedNode, activeStep: null, mode: "chat" });

      const jarvisMsg: Message = { role: "jarvis", text: reply, timestamp: Date.now() };
      setMessages(prev => [...prev, jarvisMsg]);
      lastJarvisMsg.current = reply;
      typewriterEffect(reply);
      speak(reply);

      // Try to highlight a mentioned node
      for (const node of graph.nodes) {
        if (reply.toLowerCase().includes(node.label.toLowerCase())) {
          onHighlightNode(node.id);
          setTimeout(() => onHighlightNode(null), 5000);
          break;
        }
      }
    } catch (err) {
      const errText = "I'm afraid I've encountered a connectivity issue, Sir. " + (err instanceof Error ? err.message : "Please try again.");
      const errMsg: Message = { role: "jarvis", text: errText, timestamp: Date.now() };
      setMessages(prev => [...prev, errMsg]);
      typewriterEffect(errText);
    } finally {
      setLoading(false);
    }
  }, [loading, buildContext, typewriterEffect, speak, onHighlightNode, graph, files, selectedNode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const stopSpeaking = () => { synthRef.current?.cancel(); setSpeaking(false); };

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="absolute bottom-6 right-6 z-30 w-14 h-14 rounded-full flex items-center justify-center animate-jarvis-glow-ring transition-all hover:scale-110"
      style={{ background: "radial-gradient(circle, rgba(0,212,255,0.2) 0%, rgba(0,0,0,0.8) 100%)", border: "2px solid rgba(0,212,255,0.5)" }}
    >
      <span className="jarvis-text font-bold text-[10px] font-mono">J.A.R.V.I.S</span>
    </button>
  );

  return (
    <div className="absolute bottom-6 right-6 z-30 flex flex-col animate-slide-up"
      style={{ width: minimized ? 280 : 360, maxHeight: minimized ? "auto" : "70vh" }}>

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-t-2xl cursor-pointer select-none"
        style={{
          background: "linear-gradient(135deg, rgba(0,20,40,0.95) 0%, rgba(0,8,24,0.98) 100%)",
          borderTop: "1px solid rgba(0,212,255,0.35)",
          borderLeft: "1px solid rgba(0,212,255,0.2)",
          borderRight: "1px solid rgba(0,212,255,0.2)",
        }}
        onClick={() => setMinimized(v => !v)}
      >
        {/* Arc reactor + title */}
        <div className="flex items-center gap-3">
          {/* Mini arc reactor */}
          <div className="relative w-7 h-7 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border border-cyan-500/40 animate-jarvis-rotate" />
            <div className="absolute inset-1 rounded-full border border-cyan-400/30 animate-jarvis-rotate-reverse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full animate-jarvis-pulse" style={{
                background: "radial-gradient(circle, #00d4ff 0%, rgba(0,212,255,0.3) 100%)",
                boxShadow: "0 0 10px rgba(0,212,255,0.9), 0 0 20px rgba(0,212,255,0.4)"
              }} />
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold font-mono tracking-widest" style={{ color: "#00d4ff", textShadow: "0 0 8px rgba(0,212,255,0.6)" }}>
              J.A.R.V.I.S
            </div>
            <div className="text-[9px] text-slate-500 font-mono tracking-wide">
              {loading ? "ANALYZING..." : speaking ? "SPEAKING..." : listening ? "LISTENING..." : "ONLINE • READY"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {speaking && (
            <button onClick={e => { e.stopPropagation(); stopSpeaking(); }}
              className="p-1 rounded-md text-cyan-400 hover:text-amber-400 transition-colors" title="Stop speaking">
              <VolumeX size={13} />
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); setVoiceEnabled(v => !v); }}
            className={`p-1 rounded-md transition-colors ${voiceEnabled ? "text-cyan-400" : "text-slate-600"}`} title="Toggle voice">
            {voiceEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
          <button onClick={e => { e.stopPropagation(); setMinimized(v => !v); }}
            className="p-1 rounded-md text-slate-500 hover:text-slate-300 transition-colors">
            {minimized ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button onClick={e => { e.stopPropagation(); setOpen(false); stopSpeaking(); }}
            className="p-1 rounded-md text-slate-600 hover:text-red-400 transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* ── Messages ── */}
          <div ref={scrollRef} className="overflow-y-auto flex-1 space-y-3 px-3 py-3"
            style={{ background: "rgba(2,6,20,0.92)", borderLeft: "1px solid rgba(0,212,255,0.15)", borderRight: "1px solid rgba(0,212,255,0.15)", maxHeight: "45vh" }}>

            {/* Scan line */}
            <div className="pointer-events-none absolute left-0 right-0 h-px opacity-20 animate-jarvis-scan"
              style={{ background: "linear-gradient(90deg, transparent, #00d4ff, transparent)" }} />

            {messages.map((msg, i) => {
              const isLatestJarvis = msg.role === "jarvis" && i === messages.length - 1;
              return (
                <div key={msg.timestamp} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Avatar */}
                  <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold font-mono
                    ${msg.role === "jarvis"
                      ? "border border-cyan-500/40"
                      : "border border-violet-500/40"}`}
                    style={msg.role === "jarvis"
                      ? { background: "radial-gradient(circle, rgba(0,212,255,0.2) 0%, rgba(0,0,0,0.8) 100%)", color: "#00d4ff" }
                      : { background: "radial-gradient(circle, rgba(167,139,250,0.2) 0%, rgba(0,0,0,0.8) 100%)", color: "#a78bfa" }
                    }
                  >
                    {msg.role === "jarvis" ? "J" : "U"}
                  </div>

                  {/* Bubble */}
                  <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-[11.5px] leading-relaxed
                    ${msg.role === "jarvis"
                      ? "rounded-tl-none"
                      : "rounded-tr-none"}`}
                    style={msg.role === "jarvis"
                      ? { background: "rgba(0,20,40,0.9)", border: "1px solid rgba(0,212,255,0.2)", color: "#c8e8f8" }
                      : { background: "rgba(40,10,80,0.8)", border: "1px solid rgba(167,139,250,0.25)", color: "#d8c8f8" }
                    }
                  >
                    {msg.role === "jarvis" && isLatestJarvis && isTyping
                      ? <span>{displayedText}<span className="inline-block w-0.5 h-3 bg-cyan-400 animate-pulse ml-0.5" /></span>
                      : msg.text
                    }
                  </div>
                </div>
              );
            })}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2.5 items-center">
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold font-mono border border-cyan-500/40"
                  style={{ background: "radial-gradient(circle, rgba(0,212,255,0.2) 0%, rgba(0,0,0,0.8) 100%)", color: "#00d4ff" }}>J</div>
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl rounded-tl-none" style={{ background: "rgba(0,20,40,0.9)", border: "1px solid rgba(0,212,255,0.2)" }}>
                  <div className="flex gap-1">
                    {[0.1, 0.2, 0.3].map((d, i) => (
                      <div key={i} className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${d}s` }} />
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Analyzing...</span>
                </div>
              </div>
            )}

            {/* Speaking waveform */}
            {speaking && (
              <div className="flex items-center gap-1.5 px-3 py-2">
                <div ref={waveRef} className="flex items-center gap-0.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.06}s`, height: `${4 + Math.sin(i * 0.8) * 8}px` }} />
                  ))}
                </div>
                <span className="text-[10px] font-mono" style={{ color: "rgba(0,212,255,0.6)" }}>SPEAKING</span>
              </div>
            )}
          </div>

          {/* ── Suggestions ── */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-cyan-900/30"
              style={{ background: "rgba(0,8,24,0.95)", borderLeft: "1px solid rgba(0,212,255,0.15)", borderRight: "1px solid rgba(0,212,255,0.15)" }}>
              {[
                "What does this database do?",
                "Explain the architecture",
                "Any security issues?",
                "How do nodes connect?",
              ].map(q => (
                <button key={q} onClick={() => { setInput(q); sendMessage(q); }}
                  className="text-[10px] px-2.5 py-1 rounded-lg font-mono transition-all hover:scale-105"
                  style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)", color: "rgba(0,212,255,0.7)" }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* ── Input ── */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-b-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(0,15,35,0.97) 0%, rgba(0,6,20,0.98) 100%)",
              borderBottom: "1px solid rgba(0,212,255,0.3)",
              borderLeft: "1px solid rgba(0,212,255,0.2)",
              borderRight: "1px solid rgba(0,212,255,0.2)",
            }}>

            {/* Mic button */}
            <button
              onClick={listening ? stopListening : startListening}
              className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-all hover:scale-110 ${listening ? "animate-jarvis-pulse" : ""}`}
              style={listening
                ? { background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.5)", color: "#ef4444", boxShadow: "0 0 16px rgba(239,68,68,0.4)" }
                : { background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }
              }
              title={listening ? "Stop listening" : "Start voice input"}
            >
              {listening ? <MicOff size={13} /> : <Mic size={13} />}
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={listening ? "Listening…" : "Ask JARVIS anything…"}
              className="flex-1 bg-transparent text-[12px] font-mono outline-none placeholder:text-slate-600"
              style={{ color: "#c8e8f8", caretColor: "#00d4ff" }}
            />

            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-all hover:scale-110 disabled:opacity-30"
              style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff" }}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
