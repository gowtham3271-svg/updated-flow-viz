import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Volume2, VolumeX, X, ChevronDown, ChevronUp, Send,
  Sparkles, Play, Shield, Layers, Square, Terminal, Cpu, Radio,
  Maximize2, Minimize2, Info, Activity, Sliders, Key, AlertTriangle, ExternalLink, Check
} from "lucide-react";
import type { FlowGraph, FlowNode, CodeFile } from "@/types";
import {
  sendChatStream, parseActionsFromText, type ParsedAction,
  getGeminiKey,
  setCustomGeminiKey,
  verifyGeminiApiKey,
} from "@/lib/chat";
import { gestureEvents } from "@/lib/gestureEvents";
import { saveUserQuestion, updateUserQuestionReply } from "@/services/questionsService";
import { jarvisAudio } from "@/lib/jarvisAudio";
import { JarvisHologramCore } from "./JarvisHologramCore";
import { MarkdownRenderer } from "./MarkdownRenderer";

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
  isStreaming?: boolean;
}

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onresult: (e: SpeechRecognitionEvent) => void;
  onerror: (e: { error?: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
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
  // Navigation & visibility state
  const [open, setOpen] = useState(true);
  const [minimized, setMinimized] = useState(true);
  const [isSecondScreenMode, setIsSecondScreenMode] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showHudHologram, setShowHudHologram] = useState(true);

  // Groq API Key Management state
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [keyTesting, setKeyTesting] = useState(false);
  const [keyTestStatus, setKeyTestStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // Signature Marvel Iron Man 3 Second Screen Welcome
  const initialGreeting =
    "Allow me to introduce myself. I am J.A.R.V.I.S. I am here to assist you with a variety of tasks as best I can, 24 hours a day, 7 days a week. " +
    (graph.nodes.length > 0
      ? `System diagnostics nominal: **${graph.nodes.length} nodes** and **${graph.edges.length} active connections** mapped. Standing by for your instructions.`
      : "System diagnostics nominal. All subsystems standing by.") +
    "\n\nAsk me any code question, run live terminal tests, or command the 3D architecture!";

  const [activeSubtitle, setActiveSubtitle] = useState<string>(
    "Allow me to introduce myself. I am J.A.R.V.I.S."
  );

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "jarvis",
      text: initialGreeting,
      cleanText: initialGreeting,
      actions: [
        { type: "run_code", label: "▶️ Run Code in Terminal" },
        ...(graph.nodes.length > 0
          ? [{ type: "play_flow" as const, label: "🌐 Play 3D Flow" }]
          : [{ type: "run_analysis" as const, label: "⚡ Run Flow Analysis" }]),
      ],
      timestamp: Date.now(),
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const secondScreenScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const secondScreenInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const speechFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechPrepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendMessageRef = useRef<(text: string) => void>();
  const capturedTextRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);

  // Sync mute state to jarvisAudio
  useEffect(() => {
    jarvisAudio.setMuted(!voiceEnabled);
  }, [voiceEnabled]);

  // Listen for invalid API key and sync status
  useEffect(() => {
    const currentKey = getGeminiKey();
    if (!currentKey) {
      setApiKeyError("Gemini API key not configured");
    } else {
      setApiKeyError(null);
    }

    const handleInvalidKey = (e: Event) => {
      const custom = e as CustomEvent<{ error?: string }>;
      setApiKeyError(custom.detail?.error || "Invalid Gemini API key");
      jarvisAudio.playBlip(600);
    };

    const handleKeyUpdated = () => {
      setApiKeyError(null);
    };

    window.addEventListener("jarvis:api_key_invalid", handleInvalidKey);
    window.addEventListener("jarvis:api_key_updated", handleKeyUpdated);
    return () => {
      window.removeEventListener("jarvis:api_key_invalid", handleInvalidKey);
      window.removeEventListener("jarvis:api_key_updated", handleKeyUpdated);
    };
  }, []);

  const handleOpenKeyModal = () => {
    setApiKeyInput(getGeminiKey());
    setKeyTestStatus(null);
    setShowKeyModal(true);
    jarvisAudio.playBlip(1200);
  };

  const handleTestAndSaveKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setKeyTestStatus({ success: false, message: "Please paste a valid Google Gemini API key" });
      return;
    }
    setKeyTesting(true);
    setKeyTestStatus(null);
    const res = await verifyGeminiApiKey(trimmed);
    setKeyTesting(false);
    if (res.valid) {
      setCustomGeminiKey(trimmed);
      setKeyTestStatus({ success: true, message: "Key verified & saved! Google Gemini neural uplink online." });
      setApiKeyError(null);
      jarvisAudio.playChime();
      setTimeout(() => {
        setShowKeyModal(false);
        setKeyTestStatus(null);
      }, 1200);
    } else {
      setKeyTestStatus({ success: false, message: res.error || "Key validation failed" });
      jarvisAudio.playBlip(500);
    }
  };

  // Init Speech Synthesis
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
    return () => {
      synthRef.current?.cancel();
      if (speechFallbackTimerRef.current) clearTimeout(speechFallbackTimerRef.current);
      if (speechPrepTimerRef.current) clearTimeout(speechPrepTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Smart Auto-scroll: only scrolls to bottom if user hasn't manually scrolled up
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    isUserScrolledUpRef.current = distanceFromBottom > 60;
  }, []);

  useEffect(() => {
    if (scrollRef.current && !minimized && !isUserScrolledUpRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (secondScreenScrollRef.current && showChatDrawer) {
      secondScreenScrollRef.current.scrollTop = secondScreenScrollRef.current.scrollHeight;
    }
  }, [messages, loading, isStreaming, minimized, showChatDrawer]);

  // Execute an action on the app
  const executeAction = useCallback((action: ParsedAction) => {
    jarvisAudio.playBlip(1600);
    switch (action.type) {
      case "run_code":
        onRunCode?.();
        break;
      case "focus_node":
        if (action.param) {
          onSelectNode?.(action.param);
          onHighlightNode(action.param);
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
    onRunSecurityScan,
  ]);

  // Stop speech synthesis cleanly
  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    if (speechFallbackTimerRef.current) {
      clearTimeout(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }
    if (speechPrepTimerRef.current) {
      clearTimeout(speechPrepTimerRef.current);
      speechPrepTimerRef.current = null;
    }
    setSpeaking(false);
  }, []);

  // Coordinated Voice Synthesizer with Marvel Bettany Cadence
  const speakWithSynchronizedText = useCallback((text: string) => {
    if (speechFallbackTimerRef.current) {
      clearTimeout(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }
    if (speechPrepTimerRef.current) {
      clearTimeout(speechPrepTimerRef.current);
      speechPrepTimerRef.current = null;
    }

    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeaking(false);
      return;
    }

    const synth = window.speechSynthesis;
    try {
      synth.cancel();
      if (synth.paused) {
        synth.resume();
      }

      // Clean speech text for authentic TTS delivery
      const cleanSpeech = text
        .replace(/```[\s\S]*?```/g, "Code snippet attached.")
        .replace(/\[ACTION:[^\]]+\]/g, "")
        .replace(/https?:\/\/[^\s]+/g, "")
        .replace(/[*_#`\\[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleanSpeech) {
        setSpeaking(false);
        return;
      }

      // Update active subtitle immediately
      setActiveSubtitle(cleanSpeech.slice(0, 150));

      const speechChunk = cleanSpeech.slice(0, 450);
      const utterance = new SpeechSynthesisUtterance(speechChunk);
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
      utterance.rate = 1.02; // Natural, clear, dignified pace
      utterance.pitch = 0.95; // Calm, crisp British cadence
      utterance.volume = 1.0;

      utterance.onstart = () => {
        if (speechFallbackTimerRef.current) {
          clearTimeout(speechFallbackTimerRef.current);
          speechFallbackTimerRef.current = null;
        }
        setSpeaking(true);
      };

      utterance.onend = () => {
        if (speechFallbackTimerRef.current) {
          clearTimeout(speechFallbackTimerRef.current);
          speechFallbackTimerRef.current = null;
        }
        setSpeaking(false);
      };

      utterance.onerror = () => {
        if (speechFallbackTimerRef.current) {
          clearTimeout(speechFallbackTimerRef.current);
          speechFallbackTimerRef.current = null;
        }
        setSpeaking(false);
      };

      // 40ms micro-delay before speaking: clears Chromium's audio pipeline after cancel()
      speechPrepTimerRef.current = setTimeout(() => {
        try {
          synth.speak(utterance);
        } catch {
          setSpeaking(false);
        }
      }, 40);

      // Senior fix: Dynamic fallback timer based on length of speech chunk
      const dynamicDuration = Math.max(3500, (speechChunk.length / 13) * 1000);
      speechFallbackTimerRef.current = setTimeout(() => {
        setSpeaking(false);
      }, dynamicDuration);
    } catch {
      setSpeaking(false);
    }
  }, [voiceEnabled]);

  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // STT (Speech to Text)
  const startListening = useCallback(() => {
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is supported in Chrome and Edge browsers.");
      return;
    }

    jarvisAudio.playVoiceActivate();

    // Instantly cancel any ongoing TTS speech so mic doesn't pick up speaker output
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (speechFallbackTimerRef.current) {
      clearTimeout(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }
    if (speechPrepTimerRef.current) {
      clearTimeout(speechPrepTimerRef.current);
      speechPrepTimerRef.current = null;
    }
    setSpeaking(false);

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
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
      setActiveSubtitle("Listening to your voice command...");
    };

    rec.onresult = (e: SpeechRecognitionEvent) => {
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
        setActiveSubtitle(`"${trimmed}"`);

        // Reset 1.2s silence timer so when user finishes speaking, it automatically submits!
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          try {
            recognitionRef.current?.stop();
          } catch {
            /* ignore */
          }
        }, 1200);
      }
    };

    rec.onerror = (e: { error?: string }) => {
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
        }, 80);
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

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // Subscribe to peace gesture event to interrupt speech and listen immediately
  useEffect(() => {
    const handlePeaceTrigger = () => {
      setMinimized(false);
      setOpen(true);
      setVoiceEnabled(true);

      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (speechFallbackTimerRef.current) {
        clearTimeout(speechFallbackTimerRef.current);
        speechFallbackTimerRef.current = null;
      }
      if (speechPrepTimerRef.current) {
        clearTimeout(speechPrepTimerRef.current);
        speechPrepTimerRef.current = null;
      }
      setSpeaking(false);

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

      const explanation = `Sir, highlighted **${selectedNode.label}** (${selectedNode.kind}) in \`${selectedNode.file.split("/").pop()}\` at line **${selectedNode.line}**.\n\n*${selectedNode.detail}*`;

      const newMsg: Message = {
        role: "jarvis",
        text: explanation,
        cleanText: explanation,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, newMsg]);
      speakWithSynchronizedText(explanation);
    }
  }, [selectedNode, speakWithSynchronizedText]);

  // Main real-time streaming message sender
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || isStreaming) return;

    jarvisAudio.playBlip(1000);

    // Abort any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset scroll tracking so new messages scroll to bottom
    isUserScrolledUpRef.current = false;

    const userMsg: Message = {
      role: "user",
      text: trimmed,
      cleanText: trimmed,
      timestamp: Date.now(),
    };

    const pendingMsgId = Date.now() + 1;
    const pendingJarvisMsg: Message = {
      role: "jarvis",
      text: "",
      cleanText: "",
      timestamp: pendingMsgId,
      isStreaming: true,
    };

    // Immediately display user message and empty pending JARVIS message
    setMessages(prev => [...prev, userMsg, pendingJarvisMsg]);
    setInput("");
    setLoading(true);
    setIsStreaming(true);
    setActiveSubtitle("Processing query through neural telemetry...");

    // Immediately persist user question to Supabase so it appears in Table Editor right away
    let questionDbId: string | undefined;
    saveUserQuestion({
      question: trimmed,
      reply: null,
      context: {
        source: "jarvis_oracle",
        selectedNode: selectedNode ? { id: selectedNode.id, label: selectedNode.label } : null,
        activeStep,
        totalNodes: graph.nodes.length,
      },
    }).then(res => {
      if (res?.data?.id) {
        questionDbId = res.data.id;
      }
    });

    try {
      const chatHistory = messages
        .slice(-6)
        .map(m => ({
          role: m.role === "jarvis" ? ("assistant" as const) : ("user" as const),
          content: m.text,
        }));
      chatHistory.push({ role: "user", content: trimmed });

      const activeEdge = activeStep !== null && graph.edges ? graph.edges[activeStep] ?? null : null;

      // Stream tokens in real-time (<150ms TTFT)
      let fullAccumulated = "";
      const streamResult = await sendChatStream(
        chatHistory,
        {
          files,
          graph,
          selectedNode,
          activeStep: activeEdge,
          mode: "chat",
        },
        (_chunk, accumulated) => {
          fullAccumulated = accumulated;
          setLoading(false); // First token arrived! Clear loading indicator
          setMessages(prev =>
            prev.map(m =>
              m.timestamp === pendingMsgId
                ? { ...m, text: accumulated, cleanText: accumulated }
                : m
            )
          );
          // Show rolling active subtitle in real-time
          const cleanSnippet = accumulated
            .replace(/[*_#`\\[\]]/g, "")
            .replace(/\[ACTION:[^\]]+\]/g, "")
            .trim();
          if (cleanSnippet) {
            setActiveSubtitle(cleanSnippet.slice(-120));
          }
        },
        controller.signal
      );

      const finalReply = fullAccumulated || streamResult;
      const { cleanText, actions } = parseActionsFromText(finalReply, graph, files);

      setMessages(prev =>
        prev.map(m =>
          m.timestamp === pendingMsgId
            ? {
                ...m,
                text: finalReply,
                cleanText,
                actions,
                isStreaming: false,
              }
            : m
        )
      );

      jarvisAudio.playChime();

      // Persist AI reply to Supabase record
      if (questionDbId) {
        updateUserQuestionReply(questionDbId, finalReply);
      } else {
        saveUserQuestion({
          question: trimmed,
          reply: finalReply,
          context: {
            source: "jarvis_oracle",
            selectedNode: selectedNode ? { id: selectedNode.id, label: selectedNode.label } : null,
            activeStep,
            totalNodes: graph.nodes.length,
          },
        });
      }

      // Automatically execute actions
      if (actions.length > 0) {
        actions.forEach(act => executeAction(act));
      }

      // Voice readback if enabled
      speakWithSynchronizedText(cleanText);
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      const errText =
        "Sir, our primary neural telemetry experienced a momentary uplink delay, but all local subsystem diagnostics remain fully functional. Standing by for your command.";

      setMessages(prev =>
        prev.map(m =>
          m.timestamp === pendingMsgId
            ? {
                ...m,
                text: errText,
                cleanText: errText,
                isStreaming: false,
              }
            : m
        )
      );
      speakWithSynchronizedText(errText);

      if (questionDbId) {
        updateUserQuestionReply(questionDbId, errText);
      }
    } finally {
      setLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [
    loading,
    isStreaming,
    messages,
    activeStep,
    graph,
    files,
    selectedNode,
    speakWithSynchronizedText,
    executeAction,
  ]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  // Stop in-flight streaming generation
  const handleStopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setIsStreaming(false);
    stopSpeaking();
    setMessages(prev => prev.map(m => (m.isStreaming ? { ...m, isStreaming: false } : m)));
  }, [stopSpeaking]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Launch the authentic Second Screen Mode
  const handleEnterSecondScreen = () => {
    setIsSecondScreenMode(true);
    setMinimized(false);
    setOpen(true);
    jarvisAudio.playReactorPowerUp();
  };

  // Exit Second Screen Mode back to HUD
  const handleExitSecondScreen = () => {
    setIsSecondScreenMode(false);
    jarvisAudio.playBlip(900);
  };

  // Current system status label
  const systemStatus = listening
    ? "AUDIO SENSORS ACTIVE // LISTENING"
    : loading
    ? "NEURAL UPLINK ENGAGED // PROCESSING"
    : isStreaming
    ? "TELEMETRY STREAM // TRANSMITTING"
    : speaking
    ? "VOCAL SYNTHESIS ONLINE"
    : "JARVIS ONLINE // SYSTEM NOMINAL";

  // ═════════════════════════════════════════════════════════════════════
  // RENDER: IMMERSIVE SECOND SCREEN EXPERIENCE (EXACT MARVEL REPLICA)
  // ═════════════════════════════════════════════════════════════════════
  if (isSecondScreenMode) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[#010613] text-slate-100 overflow-hidden select-none animate-fade-in font-sans">
        {/* Futuristic Background Atmospheric Mesh & Subtle Hex Grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-35"
          style={{
            backgroundImage: `
              radial-gradient(circle at 50% 50%, rgba(0, 245, 212, 0.12) 0%, transparent 65%),
              linear-gradient(rgba(0, 212, 255, 0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 212, 255, 0.04) 1px, transparent 1px)
            `,
            backgroundSize: "100% 100%, 40px 40px, 40px 40px",
          }}
        />

        {/* ── TOP SECOND SCREEN HEADER ── */}
        <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-cyan-500/20 bg-gradient-to-b from-slate-950/90 to-transparent backdrop-blur-md">
          {/* Left Brand info */}
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00f5d4]" />
            <div>
              <div className="text-[10px] font-mono tracking-widest text-cyan-400/80 font-bold uppercase">
                STARK INDUSTRIES
              </div>
              <div className="text-[9px] font-mono tracking-wider text-slate-400">
                MARK VII // SECOND SCREEN EXPERIENCE
              </div>
            </div>
          </div>

          {/* Center Title (Exact Marvel Letter Spacing) */}
          <div className="text-center">
            <h1 className="text-xl md:text-2xl font-black font-mono tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-cyan-400 drop-shadow-[0_0_16px_rgba(0,245,212,0.6)]">
              J.A.R.V.I.S.
            </h1>
            <div className="text-[9px] font-mono tracking-widest text-cyan-400/70">
              TACTICAL CO-PILOT INTERFACE
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* API Key settings button */}
            <button
              onClick={handleOpenKeyModal}
              className={`p-2 rounded-xl border transition-all ${
                apiKeyError
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                  : "bg-slate-900 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              }`}
              title="Google Gemini API Key Settings"
            >
              <Key size={16} />
            </button>

            <button
              onClick={() => setVoiceEnabled(v => !v)}
              className={`p-2 rounded-xl border transition-all ${
                voiceEnabled
                  ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(0,212,255,0.2)]"
                  : "bg-slate-900 border-slate-700 text-slate-500"
              }`}
              title={voiceEnabled ? "Mute audio" : "Enable audio"}
            >
              {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            <button
              onClick={() => setShowDiagnostics(d => !d)}
              className={`p-2 rounded-xl border transition-all ${
                showDiagnostics
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                  : "bg-slate-900/80 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              }`}
              title="Toggle Telemetry Diagnostics"
            >
              <Activity size={16} />
            </button>

            <button
              onClick={handleExitSecondScreen}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-500/30 bg-slate-900/80 text-cyan-300 hover:bg-cyan-500/15 text-xs font-mono transition-all"
              title="Exit Second Screen Mode"
            >
              <Minimize2 size={14} />
              <span className="hidden sm:inline">EXIT HUD</span>
            </button>
          </div>
        </header>

        {/* Warning Alert Banner if API key invalid */}
        {apiKeyError && (
          <div
            onClick={handleOpenKeyModal}
            className="relative z-20 mx-6 mt-3 px-4 py-2 rounded-xl border border-amber-500/50 bg-amber-950/60 hover:bg-amber-950/80 text-amber-300 text-xs font-mono flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
              <span>
                <strong>Neural Uplink Disconnected:</strong> Gemini API key issue ({apiKeyError}). Click here to update your key.
              </span>
            </div>
            <span className="text-[11px] underline text-cyan-300 font-bold ml-3 whitespace-nowrap">
              Fix Key 🔑
            </span>
          </div>
        )}

        {/* ── TOP SPEECH-SYNCHRONIZED SUBTITLES (EXACT REPLICA FROM VIDEO) ── */}
        <div className="relative z-10 w-full flex flex-col items-center justify-center px-6 pt-2">
          <div className="max-w-2xl text-center">
            <p className="text-base sm:text-lg md:text-xl font-mono font-medium text-cyan-100 tracking-wide drop-shadow-[0_0_12px_rgba(0,245,212,0.85)] min-h-[32px] transition-all duration-300">
              "{activeSubtitle}"
            </p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  listening
                    ? "bg-red-400 animate-pulse shadow-[0_0_10px_#f87171]"
                    : speaking
                    ? "bg-cyan-300 animate-ping shadow-[0_0_10px_#00f5d4]"
                    : isStreaming || loading
                    ? "bg-amber-400 animate-pulse"
                    : "bg-emerald-400"
                }`}
              />
              <span className="text-[10px] font-mono tracking-widest text-cyan-400/90 font-semibold uppercase">
                {systemStatus}
              </span>
            </div>
          </div>
        </div>

        {/* ── CENTER AREA: CENTRAL HOLOGRAPHIC CORE ── */}
        <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-2">
          <JarvisHologramCore
            width={480}
            height={440}
            speaking={speaking}
            listening={listening}
            interactive={true}
            showClock={true}
            showDegrees={true}
            onClick={() => {
              if (speaking) stopSpeaking();
              else if (!listening) startListening();
              else stopListening();
            }}
          />

          {/* Optional Telemetry Side Cards */}
          {showDiagnostics && (
            <div className="absolute left-6 top-1/2 -translate-y-1/2 w-64 p-4 rounded-2xl bg-slate-950/85 border border-cyan-500/30 backdrop-blur-md shadow-2xl space-y-3 font-mono animate-slide-right text-xs">
              <div className="text-cyan-300 font-bold border-b border-cyan-500/20 pb-1.5 flex items-center justify-between">
                <span>SUIT TELEMETRY</span>
                <span className="text-[9px] text-emerald-400">NOMINAL</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">ARC REACTOR:</span>
                  <span className="text-cyan-300">100% // TERA-WATT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">CORE TEMP:</span>
                  <span className="text-cyan-300">34.2 °C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">GRAPH NODES:</span>
                  <span className="text-cyan-300">{graph.nodes.length} ACTIVE</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">CONNECTIONS:</span>
                  <span className="text-cyan-300">{graph.edges.length} TRACED</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">AI ENGINE:</span>
                  <span className="text-cyan-300">GEMINI // BETTANY CADENCE</span>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ── BOTTOM DOCK CONTROLS (MARVEL SECOND SCREEN CONTROLS) ── */}
        <footer className="relative z-10 flex flex-col items-center gap-3 px-6 pb-6 pt-2 bg-gradient-to-t from-slate-950/95 to-transparent">
          {/* Quick Action Dock Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => {
                onRunCode?.();
                sendMessage("Run my code and show terminal output");
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all hover:scale-105 active:scale-95 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
            >
              <Play size={12} className="fill-emerald-300" />
              <span>RUN CODE</span>
            </button>

            <button
              onClick={() => {
                onPlayFlow?.();
                sendMessage("Play the 3D data flow visualization");
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 transition-all hover:scale-105 active:scale-95 shadow-[0_0_12px_rgba(0,212,255,0.15)]"
            >
              <Play size={12} />
              <span>PLAY 3D FLOW</span>
            </button>

            <button
              onClick={() => {
                onRunSecurityScan?.();
                sendMessage("Run security vulnerabilities scan on the codebase");
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all hover:scale-105 active:scale-95"
            >
              <Shield size={12} />
              <span>SECURITY SCAN</span>
            </button>

            <button
              onClick={() => setShowChatDrawer(d => !d)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all hover:scale-105 active:scale-95 ${
                showChatDrawer
                  ? "bg-cyan-500/25 border border-cyan-400 text-cyan-200"
                  : "bg-slate-900 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
              }`}
            >
              <Terminal size={12} />
              <span>TERMINAL CHAT</span>
            </button>
          </div>

          {/* Central Mic Button (High-Tech Arc Reactor Button) */}
          <div className="flex items-center gap-4">
            <button
              onClick={listening ? stopListening : startListening}
              className={`group relative flex items-center gap-2 px-6 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-2xl ${
                listening
                  ? "bg-gradient-to-r from-red-600 to-red-500 border border-red-400 text-white shadow-[0_0_24px_rgba(239,68,68,0.7)]"
                  : "bg-gradient-to-r from-cyan-600 via-cyan-500 to-teal-500 border border-cyan-300 text-slate-950 font-bold shadow-[0_0_24px_rgba(0,245,212,0.5)] hover:shadow-[0_0_32px_rgba(0,245,212,0.8)]"
              }`}
            >
              <span className="relative flex h-3 w-3">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    listening ? "bg-red-200" : "bg-white"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    listening ? "bg-white" : "bg-slate-900"
                  }`}
                />
              </span>
              <span className="text-xs font-mono tracking-wider uppercase font-extrabold">
                {listening ? "LISTENING... TAP TO SEND" : "SPEAK TO J.A.R.V.I.S."}
              </span>
              {listening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          </div>
        </footer>

        {/* ── SLIDE-OVER CHAT & COMMAND DRAWER ── */}
        {showChatDrawer && (
          <div
            className="absolute top-16 right-4 bottom-24 z-30 w-full sm:w-[420px] flex flex-col rounded-2xl bg-slate-950/95 border border-cyan-500/40 backdrop-blur-2xl shadow-2xl overflow-hidden animate-slide-left"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-500/20 bg-cyan-950/40">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-cyan-400" />
                <span className="text-xs font-mono font-bold text-cyan-300">
                  JARVIS TACTICAL LOG
                </span>
              </div>
              <button
                onClick={() => setShowChatDrawer(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div
              ref={secondScreenScrollRef}
              className="flex-1 overflow-y-auto p-3.5 space-y-3 font-mono text-xs"
            >
              {messages.map((msg) => (
                <div
                  key={msg.timestamp}
                  className={`rounded-xl p-3 ${
                    msg.role === "jarvis"
                      ? "bg-slate-900/90 border border-cyan-500/20 text-slate-100"
                      : "bg-violet-950/50 border border-violet-500/30 text-violet-100 ml-6"
                  }`}
                >
                  <div className="text-[9px] font-mono text-cyan-400/70 mb-1">
                    {msg.role === "jarvis" ? "J.A.R.V.I.S." : "COMMAND"}
                  </div>
                  <MarkdownRenderer
                    content={msg.text}
                    isStreaming={msg.isStreaming}
                    actions={msg.actions}
                    onExecuteAction={executeAction}
                  />
                </div>
              ))}
            </div>

            <div className="p-2.5 border-t border-cyan-500/20 bg-slate-900/90 flex gap-2">
              <input
                ref={secondScreenInputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or ask a question..."
                className="flex-1 bg-black/50 border border-cyan-500/30 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
              />
              <button
                onClick={() => sendMessage(input)}
                className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  // RENDER: MINIMIZED FLOATING PILL
  // ═════════════════════════════════════════════════════════════════════
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-10 right-6 z-40 px-3.5 py-2 rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-xl select-none"
        style={{
          background: "rgba(2,10,26,0.92)",
          border: "1px solid rgba(0,212,255,0.4)",
          boxShadow: "0 0 16px rgba(0,212,255,0.25)",
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

  if (minimized) {
    return (
      <div className="fixed bottom-10 right-6 z-40 flex items-center gap-2 select-none">
        {/* Quick Launch Second Screen directly */}
        <button
          onClick={handleEnterSecondScreen}
          className="p-2.5 rounded-2xl transition-all hover:scale-110 shadow-2xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, rgba(0,245,212,0.2) 0%, rgba(2,12,32,0.98) 100%)",
            border: "1px solid rgba(0,245,212,0.5)",
            boxShadow: "0 0 18px rgba(0,245,212,0.35)",
            backdropFilter: "blur(16px)",
          }}
          title="Launch Full Second Screen Experience (Iron Man 3 replica)"
        >
          <Maximize2 size={16} className="text-cyan-300" />
        </button>

        {/* Compact HUD expand button */}
        <button
          onClick={() => setMinimized(false)}
          className="group flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all hover:scale-105 shadow-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(2,12,32,0.95) 0%, rgba(4,8,22,0.98) 100%)",
            border: "1px solid rgba(0,212,255,0.4)",
            boxShadow: "0 4px 24px rgba(0,212,255,0.25)",
            backdropFilter: "blur(16px)",
          }}
          title="Expand JARVIS Co-Pilot"
        >
          {/* Mini arc reactor */}
          <div className="relative w-5 h-5 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border border-cyan-500/50 animate-jarvis-rotate" />
            <div className="absolute inset-0.5 rounded-full border border-cyan-400/30 animate-jarvis-rotate-reverse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-2 h-2 rounded-full animate-jarvis-pulse"
                style={{
                  background: "radial-gradient(circle, #00d4ff 0%, rgba(0,212,255,0.3) 100%)",
                  boxShadow: "0 0 8px rgba(0,212,255,0.9)",
                }}
              />
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

  // ═════════════════════════════════════════════════════════════════════
  // RENDER: EXPANDED FLOATING HUD WINDOW
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div
      className="fixed bottom-10 right-6 z-40 flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
      style={{
        width: "min(430px, calc(100vw - 32px))",
        maxHeight: "82vh",
        background: "linear-gradient(180deg, rgba(2,10,28,0.97) 0%, rgba(1,6,18,0.99) 100%)",
        border: "1px solid rgba(0,212,255,0.4)",
        boxShadow: "0 12px 48px rgba(0,0,0,0.85), 0 0 30px rgba(0,212,255,0.22)",
        backdropFilter: "blur(24px)",
      }}
    >
      {/* ── Futuristic HUD Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none border-b border-cyan-500/20"
        style={{
          background: "linear-gradient(90deg, rgba(0,24,52,0.95) 0%, rgba(2,12,32,0.98) 100%)",
        }}
        onClick={() => setMinimized(true)}
      >
        {/* Arc reactor + Telemetry Title */}
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 flex-shrink-0">
            <div
              className={`absolute inset-0 rounded-full border border-cyan-500/50 ${
                isStreaming || loading ? "animate-spin" : "animate-jarvis-rotate"
              }`}
            />
            <div className="absolute inset-1 rounded-full border border-cyan-400/30 animate-jarvis-rotate-reverse" />
            <div className="absolute inset-0 flex items-center justify-center">
              {listening ? (
                <div className="flex items-center gap-0.5">
                  <span className="w-1 h-3 bg-red-400 animate-pulse rounded-full" />
                  <span className="w-1 h-4 bg-red-400 animate-pulse rounded-full" style={{ animationDelay: "0.1s" }} />
                  <span className="w-1 h-2 bg-red-400 animate-pulse rounded-full" style={{ animationDelay: "0.2s" }} />
                </div>
              ) : (
                <div
                  className={`w-2.5 h-2.5 rounded-full ${isStreaming ? "bg-cyan-300 animate-ping" : "animate-jarvis-pulse"}`}
                  style={{
                    background: "radial-gradient(circle, #00d4ff 0%, rgba(0,212,255,0.3) 100%)",
                    boxShadow: "0 0 10px rgba(0,212,255,0.9)",
                  }}
                />
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold font-mono tracking-widest text-cyan-300 flex items-center gap-2">
              <span>J.A.R.V.I.S.</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono font-normal">
                HUD CO-PILOT
              </span>
            </div>
            <div className="text-[9px] text-slate-400 font-mono flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  listening
                    ? "bg-red-400 animate-pulse"
                    : isStreaming || loading
                    ? "bg-amber-400 animate-pulse"
                    : "bg-emerald-400"
                }`}
              />
              <span>{systemStatus}</span>
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          {/* API Key Config Button */}
          <button
            onClick={handleOpenKeyModal}
            className={`p-1.5 rounded-lg border transition-all ${
              apiKeyError
                ? "bg-amber-500/25 border-amber-500/60 text-amber-300 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                : "bg-slate-900/80 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
            }`}
            title="Google Gemini API Key Settings"
          >
            <Key size={13} />
          </button>

          {/* Launch Marvel Second Screen Mode */}
          <button
            onClick={handleEnterSecondScreen}
            className="p-1.5 rounded-lg text-cyan-300 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/30 border border-cyan-500/30 transition-all"
            title="Launch Second Screen Full Experience"
          >
            <Maximize2 size={13} />
          </button>

          {speaking && (
            <button
              onClick={stopSpeaking}
              className="p-1.5 rounded-lg text-cyan-400 hover:text-amber-400 hover:bg-cyan-500/10 transition-colors"
              title="Stop voice playback"
            >
              <VolumeX size={14} />
            </button>
          )}

          <button
            onClick={() => setVoiceEnabled(v => !v)}
            className={`p-1.5 rounded-lg transition-colors ${
              voiceEnabled ? "text-cyan-400 bg-cyan-500/15" : "text-slate-500 hover:text-slate-300"
            }`}
            title={voiceEnabled ? "Voice enabled (click to mute)" : "Enable voice readback"}
          >
            {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>

          <button
            onClick={() => setShowHudHologram(h => !h)}
            className={`p-1.5 rounded-lg transition-colors ${
              showHudHologram ? "text-cyan-300" : "text-slate-500"
            }`}
            title="Toggle mini hologram visualizer"
          >
            <Radio size={14} />
          </button>

          <button
            onClick={() => setMinimized(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            title="Minimize window"
          >
            <ChevronDown size={14} />
          </button>

          <button
            onClick={() => {
              setOpen(false);
              stopSpeaking();
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Warning Alert Banner in HUD */}
      {apiKeyError && (
        <div
          onClick={handleOpenKeyModal}
          className="mx-3 mt-2 px-3 py-1.5 rounded-xl border border-amber-500/50 bg-amber-950/60 hover:bg-amber-950/80 text-amber-300 text-[11px] font-mono flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01] shadow-lg animate-pulse"
        >
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
            <span className="truncate">Neural Uplink Offline (Invalid Key)</span>
          </div>
          <span className="text-[10px] underline text-cyan-300 ml-2 whitespace-nowrap">
            Fix 🔑
          </span>
        </div>
      )}

      {/* ── Compact Integrated Hologram Visualizer in HUD ── */}
      {showHudHologram && (
        <div className="relative py-1 border-b border-cyan-500/15 bg-slate-950/70 flex flex-col items-center justify-center">
          <JarvisHologramCore
            width={220}
            height={160}
            speaking={speaking}
            listening={listening}
            interactive={true}
            showClock={true}
            showDegrees={false}
            onClick={() => {
              if (!listening) startListening();
              else stopListening();
            }}
          />
          <div className="text-[9px] font-mono text-cyan-400/70 tracking-wider">
            {listening ? "RECORDING..." : speaking ? "SYNTHESIZING..." : "STANDBY // CLICK TO SPEAK"}
          </div>
        </div>
      )}

      {/* ── Messages Stream ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto flex-1 space-y-3.5 px-3.5 py-3.5"
        style={{ maxHeight: showHudHologram ? "34vh" : "48vh" }}
      >
        {messages.map((msg, i) => {
          const isLatestJarvis = msg.role === "jarvis" && i === messages.length - 1;
          const isPendingEmpty = msg.role === "jarvis" && !msg.text && loading;

          return (
            <div
              key={msg.timestamp}
              className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div
                className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold font-mono mt-0.5 shadow-sm ${
                  msg.role === "jarvis"
                    ? "border border-cyan-500/50 bg-cyan-950/60 text-cyan-300"
                    : "border border-violet-500/50 bg-violet-950/60 text-violet-200"
                }`}
              >
                {msg.role === "jarvis" ? <Cpu size={12} /> : <Terminal size={12} />}
              </div>

              {/* Message Content */}
              <div className="flex-1 max-w-[88%] space-y-1.5">
                <div
                  className={`rounded-2xl px-3.5 py-2.5 shadow-md ${
                    msg.role === "jarvis"
                      ? "rounded-tl-none bg-slate-900/90 border border-cyan-500/25 text-slate-100"
                      : "rounded-tr-none bg-violet-950/70 border border-violet-500/35 text-violet-100"
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
                      <span className="text-[11px] text-cyan-300 font-mono tracking-wide">
                        Neural Uplink Processing…
                      </span>
                    </div>
                  ) : (
                    <MarkdownRenderer
                      content={msg.text}
                      isStreaming={msg.isStreaming && isLatestJarvis}
                      actions={msg.actions}
                      onExecuteAction={executeAction}
                    />
                  )}
                </div>

                <div
                  className={`text-[9px] font-mono text-slate-500 px-1 ${
                    msg.role === "user" ? "text-right" : "text-left"
                  }`}
                >
                  {msg.role === "jarvis" ? "J.A.R.V.I.S. // ARCHITECT" : "COMMAND SENDER"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Quick Tactical Command Chips ── */}
      <div className="px-3 py-1.5 border-t border-cyan-500/15 bg-black/40 flex flex-wrap gap-1.5">
        <button
          onClick={() => {
            onRunCode?.();
            sendMessage("Run my code and show output in the live terminal");
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-all active:scale-95"
        >
          <Play size={10} className="fill-emerald-300" /> Run Code
        </button>

        <button
          onClick={() => {
            onPlayFlow?.();
            sendMessage("Play the 3D data flow animation");
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 transition-all active:scale-95"
        >
          <Play size={10} /> Play Flow
        </button>

        {graph.nodes.some(n => n.kind === "database") && (
          <button
            onClick={() => sendMessage("Show and explain the database architecture")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 transition-all active:scale-95"
          >
            <Layers size={10} /> Focus DB
          </button>
        )}

        <button
          onClick={() => {
            onRunSecurityScan?.();
            sendMessage("Check security vulnerabilities and suggest fixes");
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 transition-all active:scale-95"
        >
          <Shield size={10} /> Security Scan
        </button>

        <button
          onClick={() => sendMessage("How can I improve and optimize this architecture?")}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 transition-all active:scale-95"
        >
          <Sparkles size={10} /> Optimize
        </button>
      </div>

      {/* ── Command Console Input Area ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-cyan-500/20 bg-slate-950/95">
        {/* Voice Input Button */}
        <button
          onClick={listening ? stopListening : startListening}
          className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center transition-all ${
            listening
              ? "bg-red-500/20 border border-red-500 text-red-400 animate-pulse shadow-lg shadow-red-500/30"
              : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
          }`}
          title={listening ? "Stop listening" : "Speak command to J.A.R.V.I.S."}
        >
          {listening ? <MicOff size={14} /> : <Mic size={14} />}
        </button>

        {/* Input Bar */}
        <div className="flex-1 relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              listening
                ? "Listening to your voice…"
                : isStreaming
                ? "J.A.R.V.I.S. is streaming response…"
                : "Ask J.A.R.V.I.S. or enter a command…"
            }
            className="w-full bg-slate-900/80 border border-cyan-500/25 focus:border-cyan-400 rounded-xl px-3 py-1.5 text-[12px] font-mono outline-none text-slate-100 placeholder:text-slate-500 focus:shadow-[0_0_12px_rgba(0,212,255,0.3)] transition-all"
          />
        </div>

        {/* Action Button: Stop Streaming OR Send */}
        {isStreaming || loading ? (
          <button
            onClick={handleStopStreaming}
            className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 transition-all hover:scale-105 active:scale-95"
            title="Stop generating"
          >
            <Square size={12} className="fill-red-400" />
          </button>
        ) : (
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
            className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 disabled:opacity-30 transition-all hover:scale-105 active:scale-95"
            title="Transmit command (Enter)"
          >
            <Send size={14} />
          </button>
        )}
      </div>

      {/* ── HIGH-TECH API KEY MANAGER MODAL ── */}
      {showKeyModal && (
        <div
          onClick={() => setShowKeyModal(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-slate-950 border border-cyan-500/40 p-5 shadow-2xl space-y-4 font-mono text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Key className="text-cyan-400" size={18} />
                <span className="text-sm font-bold text-cyan-200 tracking-wider">
                  STARK UPLINK // GOOGLE GEMINI NEURAL CORE
                </span>
              </div>
              <button
                onClick={() => setShowKeyModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2.5">
              <p>
                J.A.R.V.I.S. neural cortex is powered by <strong>Google Gemini Pro (Gemini 2.5 Pro / Flash)</strong> for real-time code analysis, terminal command synthesis, and synchronized HUD speech.
              </p>
              
              <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-between">
                <div>
                  <div className="text-cyan-300 font-bold text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                    Google Gemini Pro Neural Engine
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Gemini 2.5 Pro Tier • 1M Token Context • Low Latency SSE</div>
                </div>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold text-[11px] underline ml-2 flex-shrink-0"
                >
                  AI Studio <ExternalLink size={10} />
                </a>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
                <span>GEMINI API KEY:</span>
                <span className="text-[10px] text-emerald-400">● Live Connection Active</span>
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Paste Gemini API key..."
                className="w-full bg-black/70 border border-cyan-500/30 focus:border-cyan-400 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono tracking-wider"
              />
              <div className="text-[10px] text-slate-400 flex justify-between">
                <span>Active Key: {getGeminiKey() ? `${getGeminiKey().slice(0, 8)}...${getGeminiKey().slice(-4)}` : "None"}</span>
                <span className="text-cyan-400 font-semibold">Engine: Google Gemini</span>
              </div>
            </div>

            {keyTestStatus && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  keyTestStatus.success
                    ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                    : "bg-red-950/60 border border-red-500/40 text-red-300"
                }`}
              >
                {keyTestStatus.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                <span>{keyTestStatus.message}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowKeyModal(false)}
                className="flex-1 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-all"
              >
                Close
              </button>
              <button
                onClick={handleTestAndSaveKey}
                disabled={keyTesting}
                className="flex-1 py-2 rounded-xl border border-cyan-400 bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-slate-950 font-bold text-xs transition-all shadow-[0_0_15px_rgba(0,245,212,0.4)] disabled:opacity-50"
              >
                {keyTesting ? "Verifying..." : "Verify & Save Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
