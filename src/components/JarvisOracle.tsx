import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Volume2, VolumeX, X, ChevronDown, ChevronUp, Send,
  Sparkles, Play, Pause, ZoomIn, ZoomOut, Maximize2, Shield,
  Layers, Code2, ArrowRight, Loader2, Bot
} from "lucide-react";
import type { FlowGraph, FlowNode, FlowEdge, CodeFile } from "@/types";
import { sendChat, parseActionsFromText, type ParsedAction } from "@/lib/chat";
import { gestureEvents } from "@/lib/gestureEvents";

interface JarvisOracleProps {
  graph: FlowGraph;
  files: CodeFile[];
  selectedNode: FlowNode | null;
  activeStep?: number | null;
  onHighlightNode: (id: string | null) => void;
  onSelectNode?: (id: string | null) => void;
  onPlayFlow?: () => void;
  onPauseFlow?: () => void;
  onStepForward?: () => void;
  onStepBack?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onSelectFile?: (path: string) => void;
  onRunAnalysis?: () => void;
  onRunSecurityScan?: () => void;
  onRunCode?: () => void;
}

interface Message {
  role: "user" | "jarvis";
  text: string;
  cleanText: string;
  actions?: ParsedAction[];
  timestamp: number;
}

export function JarvisOracle({
  graph,
  files,
  selectedNode,
  activeStep = null,
  onHighlightNode,
  onSelectNode,
  onPlayFlow,
  onPauseFlow,
  onStepForward,
  onStepBack,
  onZoomIn,
  onZoomOut,
  onResetView,
  onSelectFile,
  onRunAnalysis,
  onRunSecurityScan,
  onRunCode,
}: JarvisOracleProps) {
  // Start minimized so it does NOT block the 3D visualization or other panels on startup!
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(true);

  const initialGreeting = "Hey friend! J.A.R.V.I.S. online. 🚀 I have full access to your code editor, live terminal, and 3D architecture. " +
    (graph.nodes.length > 0
      ? `I see ${graph.nodes.length} nodes and ${graph.edges.length} active connections mapped. What would you like to build, run, or explore?`
      : "Ready to run your code, trace output, and animate the flow!") +
    "\n\nAsk me any code question or click below to run code in the live terminal!";

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "jarvis",
      text: initialGreeting,
      cleanText: initialGreeting,
      actions: [
        { type: "run_code", label: "▶️ Run Code in Terminal" },
        ...(graph.nodes.length > 0
          ? [{ type: "play_flow" as const, label: "🌐 Play 3D Flow" }]
          : [{ type: "run_analysis" as const, label: "⚡ Run Flow Analysis" }]
        ),
      ],
      timestamp: Date.now(),
    },
  ]);

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
  const sendMessageRef = useRef<(text: string) => void>();
  const capturedTextRef = useRef<string>("");

  // Init TTS
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
      // Force load voices
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && !minimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, displayedText, minimized]);


  // Execute an action on the app
  const executeAction = useCallback((action: ParsedAction) => {
    switch (action.type) {
      case "run_code":
        onRunCode?.();
        break;
      case "focus_node":
        if (action.param) {
          onSelectNode?.(action.param);
          onHighlightNode(action.param);
          setTimeout(() => onHighlightNode(null), 4000);
        }
        break;
      case "play_flow":
        onPlayFlow?.();
        break;
      case "pause_flow":
        onPauseFlow?.();
        break;
      case "step_forward":
        onStepForward?.();
        break;
      case "step_back":
        onStepBack?.();
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
      case "highlight_kind":
        if (action.param && graph.nodes.length > 0) {
          const matched = graph.nodes.find(n => n.kind.toLowerCase() === action.param?.toLowerCase());
          if (matched) {
            onSelectNode?.(matched.id);
            onHighlightNode(matched.id);
          }
        }
        break;
    }
  }, [
    graph.nodes,
    onRunCode,
    onSelectNode,
    onHighlightNode,
    onPlayFlow,
    onPauseFlow,
    onStepForward,
    onStepBack,
    onZoomIn,
    onZoomOut,
    onResetView,
    onSelectFile,
    onRunAnalysis,
    onRunSecurityScan
  ]);

  // Typewriter effect for latest JARVIS message
  const typewriterEffect = useCallback((text: string) => {
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    setIsTyping(true);
    setDisplayedText("");
    let i = 0;
    typeTimerRef.current = setInterval(() => {
      i += 2;
      setDisplayedText(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typeTimerRef.current!);
        setIsTyping(false);
      }
    }, 12);
  }, []);

  // TTS with speech synthesis
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      if (synth.paused) {
        synth.resume();
      }

      // Clean speech text
      const cleanSpeech = text
        .replace(/[*_#`\\[\]]/g, "")
        .replace(/\[ACTION:[^\]]+\]/g, "")
        .replace(/```[\s\S]*?```/g, "Code snippet attached.")
        .replace(/https?:\/\/[^\s]+/g, "");

      const utterance = new SpeechSynthesisUtterance(cleanSpeech.slice(0, 350));
      const voices = synth.getVoices();
      
      // Prioritize authentic British male voice profiles matching Paul Bettany's Jarvis
      const preferred = voices.find(v =>
        v.name.includes("Google UK English Male") ||
        (v.name.includes("UK") && v.name.includes("Male")) ||
        v.name.includes("Daniel") ||
        v.name.includes("Oliver") ||
        v.name.includes("George") ||
        v.name.includes("Arthur") ||
        (v.lang.startsWith("en-GB") && !v.name.toLowerCase().includes("female"))
      ) || voices.find(v => v.lang.startsWith("en-GB")) || voices.find(v => v.lang.startsWith("en")) || voices[0];

      if (preferred) utterance.voice = preferred;
      utterance.rate = 1.0; // Normal speech rate
      utterance.pitch = 0.94; // Calm, crisp, refined British cadence
      utterance.volume = 1.0;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      synth.speak(utterance);
    } catch {
      setSpeaking(false);
    }
  }, [voiceEnabled]);

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // STT (Speech to Text)
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    // Instantly cancel any ongoing TTS speech so mic doesn't pick up speaker output
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    capturedTextRef.current = "";
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => {
      setListening(true);
      setLoading(false);
    };

    rec.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i] && e.results[i][0]) {
          text += e.results[i][0].transcript + " ";
        }
      }
      const trimmed = text.trim();
      if (trimmed) {
        capturedTextRef.current = trimmed;
        setInput(trimmed);

        // Reset 1.2s silence timer so when user finishes speaking, it automatically submits!
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          try {
            recognitionRef.current?.stop();
          } catch {}
        }, 1200);
      }
    };

    rec.onerror = (e: any) => {
      console.warn("Speech recognition notice:", e?.error || e);
      if (e.error !== "no-speech") {
        setListening(false);
      }
    };

    rec.onend = () => {
      setListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      const textToSend = capturedTextRef.current.trim() || inputRef.current?.value.trim() || "";
      if (textToSend) {
        setTimeout(() => {
          sendMessageRef.current?.(textToSend);
          capturedTextRef.current = "";
        }, 100);
      }
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (err) {
      console.error("Speech recognition start failed:", err);
      setListening(false);
    }
  }, []);

  // Subscribe to peace gesture event to interrupt speech and listen immediately
  useEffect(() => {
    const handlePeaceTrigger = () => {
      setMinimized(false);
      setOpen(true);
      setVoiceEnabled(true);
      
      // Stop any ongoing speech or typewriter output immediately
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (typeTimerRef.current) {
        clearInterval(typeTimerRef.current);
      }
      setSpeaking(false);
      
      // Start listening to user's voice immediately
      startListening();
    };

    const unsub = gestureEvents.on("peace", handlePeaceTrigger);
    return () => {
      unsub();
    };
  }, [startListening]);

  // Selected Node Explainer Effect
  const lastFocusedNodeId = useRef<string | null>(null);
  useEffect(() => {
    if (selectedNode && selectedNode.id !== lastFocusedNodeId.current) {
      lastFocusedNodeId.current = selectedNode.id;
      
      const explanation = `Sir, highlighted ${selectedNode.label} (${selectedNode.kind}) in ${selectedNode.file.split("/").pop()} at line ${selectedNode.line}.`;
      
      const newMsg: Message = {
        role: "jarvis",
        text: explanation,
        cleanText: explanation,
        timestamp: Date.now(),
      };
      
      setMessages((prev) => [...prev, newMsg]);
      typewriterEffect(explanation);
      speak(explanation);
    }
  }, [selectedNode, speak, typewriterEffect]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: Message = {
      role: "user",
      text: trimmed,
      cleanText: trimmed,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const chatMessages = messages
        .slice(-6)
        .map(m => ({
          role: m.role === "jarvis" ? ("assistant" as const) : ("user" as const),
          content: m.text,
        }));
      chatMessages.push({ role: "user", content: trimmed });

      const activeEdge = activeStep !== null && graph.edges ? graph.edges[activeStep] ?? null : null;
      const rawReply = await sendChat(chatMessages, {
        files,
        graph,
        selectedNode,
        activeStep: activeEdge,
        mode: "chat",
      });

      const { cleanText, actions } = parseActionsFromText(rawReply, graph, files);

      const jarvisMsg: Message = {
        role: "jarvis",
        text: rawReply,
        cleanText,
        actions,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, jarvisMsg]);
      typewriterEffect(cleanText);
      speak(cleanText);

      // Execute visualization actions automatically
      if (actions.length > 0) {
        actions.forEach(act => executeAction(act));
      }
    } catch (err) {
      const errText = "I ran into a temporary connection issue, friend! But I'm still right here to assist. Try asking again or use one of the quick actions below.";
      const errMsg: Message = {
        role: "jarvis",
        text: errText,
        cleanText: errText,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
      typewriterEffect(errText);
    } finally {
      setLoading(false);
    }
  }, [
    loading,
    messages,
    activeStep,
    graph,
    files,
    selectedNode,
    typewriterEffect,
    speak,
    executeAction
  ]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stopSpeaking = () => {
    synthRef.current?.cancel();
    setSpeaking(false);
  };

  // Minimized floating trigger pill (non-intrusive at bottom right)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-10 right-6 z-40 px-3.5 py-2 rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-xl"
        style={{
          background: "rgba(2,10,26,0.92)",
          border: "1px solid rgba(0,212,255,0.4)",
          boxShadow: "0 0 16px rgba(0,212,255,0.25)"
        }}
        title="Open JARVIS AI Co-Pilot"
      >
        <div className="relative w-4 h-4">
          <div className="absolute inset-0 rounded-full border border-cyan-400 animate-spin" />
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 absolute inset-0 m-auto" />
        </div>
        <span className="text-xs font-mono font-bold text-cyan-300">J.A.R.V.I.S</span>
      </button>
    );
  }

  // If minimized, display a sleek compact badge that doesn't cover anything
  if (minimized) {
    return (
      <div className="fixed bottom-10 right-6 z-40 flex items-center gap-2">
        <button
          onClick={() => setMinimized(false)}
          className="group flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all hover:scale-105 shadow-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(2,12,32,0.95) 0%, rgba(4,8,22,0.98) 100%)",
            border: "1px solid rgba(0,212,255,0.4)",
            boxShadow: "0 4px 24px rgba(0,212,255,0.25)",
            backdropFilter: "blur(16px)"
          }}
          title="Expand JARVIS Co-Pilot"
        >
          {/* Mini arc reactor */}
          <div className="relative w-5 h-5 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border border-cyan-500/50 animate-jarvis-rotate" />
            <div className="absolute inset-0.5 rounded-full border border-cyan-400/30 animate-jarvis-rotate-reverse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full animate-jarvis-pulse" style={{
                background: "radial-gradient(circle, #00d4ff 0%, rgba(0,212,255,0.3) 100%)",
                boxShadow: "0 0 8px rgba(0,212,255,0.9)"
              }} />
            </div>
          </div>
          <div className="text-left">
            <div className="text-[11px] font-bold font-mono text-cyan-300 group-hover:text-cyan-200 flex items-center gap-1.5">
              <span>JARVIS</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[9px] text-slate-400 font-mono">
              {selectedNode ? `Focused: ${selectedNode.label}` : "Ask or control 3D view"}
            </div>
          </div>
          <ChevronUp size={14} className="text-cyan-400 ml-1 group-hover:-translate-y-0.5 transition-transform" />
        </button>
      </div>
    );
  }

  // Expanded Window
  return (
    <div
      className="fixed bottom-10 right-6 z-40 flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
      style={{
        width: 380,
        maxHeight: "72vh",
        background: "linear-gradient(180deg, rgba(2,10,28,0.96) 0%, rgba(1,6,18,0.98) 100%)",
        border: "1px solid rgba(0,212,255,0.35)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.8), 0 0 25px rgba(0,212,255,0.2)",
        backdropFilter: "blur(24px)"
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none border-b border-cyan-500/20"
        style={{
          background: "linear-gradient(90deg, rgba(0,24,52,0.9) 0%, rgba(2,12,32,0.9) 100%)",
        }}
        onClick={() => setMinimized(true)}
      >
        {/* Arc reactor + title */}
        <div className="flex items-center gap-3">
          <div className="relative w-7 h-7 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border border-cyan-500/50 animate-jarvis-rotate" />
            <div className="absolute inset-1 rounded-full border border-cyan-400/30 animate-jarvis-rotate-reverse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full animate-jarvis-pulse" style={{
                background: "radial-gradient(circle, #00d4ff 0%, rgba(0,212,255,0.3) 100%)",
                boxShadow: "0 0 10px rgba(0,212,255,0.9)"
              }} />
            </div>
          </div>
          <div>
            <div className="text-xs font-bold font-mono tracking-widest text-cyan-300 flex items-center gap-2">
              JARVIS
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-normal">
                3D CO-PILOT
              </span>
            </div>
            <div className="text-[9.5px] text-slate-400 font-mono">
              {loading ? "Analyzing & Controlling…" : speaking ? "Speaking…" : listening ? "Listening…" : "Active & Ready"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          {speaking && (
            <button
              onClick={stopSpeaking}
              className="p-1.5 rounded-lg text-cyan-400 hover:text-amber-400 hover:bg-cyan-500/10 transition-colors"
              title="Stop voice"
            >
              <VolumeX size={14} />
            </button>
          )}
          <button
            onClick={() => setVoiceEnabled(v => !v)}
            className={`p-1.5 rounded-lg transition-colors ${voiceEnabled ? "text-cyan-400 bg-cyan-500/15" : "text-slate-500 hover:text-slate-300"}`}
            title={voiceEnabled ? "Voice voice enabled" : "Enable voice readback"}
          >
            {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            title="Minimize"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={() => { setOpen(false); stopSpeaking(); }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Messages List ── */}
      <div
        ref={scrollRef}
        className="overflow-y-auto flex-1 space-y-3.5 px-3.5 py-3.5"
        style={{ maxHeight: "42vh" }}
      >
        {messages.map((msg, i) => {
          const isLatestJarvis = msg.role === "jarvis" && i === messages.length - 1;
          return (
            <div key={msg.timestamp} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar */}
              <div
                className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold font-mono mt-0.5 ${
                  msg.role === "jarvis"
                    ? "border border-cyan-500/50 bg-cyan-950/60 text-cyan-400 shadow-sm"
                    : "border border-violet-500/50 bg-violet-950/60 text-violet-300"
                }`}
              >
                {msg.role === "jarvis" ? "J" : "U"}
              </div>

              {/* Message Content */}
              <div className="flex-1 max-w-[88%] space-y-2">
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed shadow-sm ${
                    msg.role === "jarvis"
                      ? "rounded-tl-none bg-slate-900/90 border border-cyan-500/20 text-slate-200"
                      : "rounded-tr-none bg-violet-950/70 border border-violet-500/30 text-violet-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {msg.role === "jarvis" && isLatestJarvis && isTyping
                      ? (
                        <>
                          {displayedText}
                          <span className="inline-block w-1.5 h-3 bg-cyan-400 animate-pulse ml-0.5" />
                        </>
                      )
                      : msg.cleanText
                    }
                  </p>
                </div>

                {/* Action Badges / Controls Executed */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {msg.actions.map((act, actIdx) => (
                      <button
                        key={actIdx}
                        onClick={() => executeAction(act)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-mono font-medium transition-all hover:scale-105 active:scale-95"
                        style={{
                          background: "rgba(0,212,255,0.12)",
                          border: "1px solid rgba(0,212,255,0.3)",
                          color: "#67e8f9"
                        }}
                        title={`Click to re-trigger: ${act.label}`}
                      >
                        <Sparkles size={11} className="text-cyan-400" />
                        <span>{act.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading */}
        {loading && (
          <div className="flex gap-2.5 items-center">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold font-mono border border-cyan-500/50 bg-cyan-950/60 text-cyan-400">
              J
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl rounded-tl-none bg-slate-900/90 border border-cyan-500/20">
              <div className="flex gap-1">
                {[0.1, 0.2, 0.3].map((d, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: `${d}s` }} />
                ))}
              </div>
              <span className="text-[11px] text-cyan-300 font-mono">Controlling & Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Quick Control Buttons ── */}
      <div className="px-3 py-2 border-t border-cyan-500/15 bg-black/40 flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            onRunCode?.();
            sendMessage("Run my code and show output in the live terminal");
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-all"
        >
          <Play size={10} className="fill-emerald-300" /> Run Code
        </button>

        <button
          onClick={() => {
            onPlayFlow?.();
            sendMessage("Play the 3D data flow animation");
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 transition-all"
        >
          <Play size={10} /> Play Flow
        </button>

        {graph.nodes.some(n => n.kind === "database") && (
          <button
            onClick={() => sendMessage("Show and explain the database architecture")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 transition-all"
          >
            <Layers size={10} /> Focus DB
          </button>
        )}

        <button
          onClick={() => {
            onRunSecurityScan?.();
            sendMessage("Check security vulnerabilities and suggest fixes");
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 transition-all"
        >
          <Shield size={10} /> Security Scan
        </button>

        <button
          onClick={() => sendMessage("How can I improve and optimize this architecture?")}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-all"
        >
          <Sparkles size={10} /> Improve Code
        </button>
      </div>

      {/* ── Input Box ── */}
      <div className="flex items-center gap-2 px-3.5 py-3 border-t border-cyan-500/20 bg-slate-950/90">
        <button
          onClick={listening ? stopListening : startListening}
          className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center transition-all ${
            listening
              ? "bg-red-500/20 border border-red-500 text-red-400 animate-pulse shadow-lg shadow-red-500/30"
              : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
          }`}
          title={listening ? "Stop voice" : "Speak to JARVIS"}
        >
          {listening ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? "Listening to your voice…" : "Ask JARVIS or give a 3D command…"}
          className="flex-1 bg-transparent text-[12px] font-mono outline-none text-slate-100 placeholder:text-slate-500"
        />

        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
          title="Send"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

