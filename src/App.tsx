import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  FolderOpen, Sparkles, StickyNote, Code2, Network,
  Info, Monitor, Server, Database, Sun, Moon, MessageSquare, X,
  Upload, Search, Command, PanelLeftClose, PanelLeft,
  ZoomIn, ZoomOut, Maximize2, Minimize2, ChevronDown, Loader2,
  Play, Shield, Hand, AlertTriangle, Zap,
} from "lucide-react";
import { NODE_COLORS, EDGE_COLORS } from "@/types";
import type { CodeFile, FlowGraph, Annotation, SavedProject, CodeLanguage } from "@/types";
import { analyzeFiles } from "@/lib/analyzer";
import { SAMPLE_PROJECTS } from "@/lib/samples";
import { buildFileTree } from "@/lib/fileTree";
import { readFilesFromPicker } from "@/lib/fileUtils";
import { detectIssues, getIssueCounts, type CodeIssue } from "@/lib/issues";
import { runSecurityScan } from "@/lib/chat";
import { runCodeSnippet, type LogEntry, type ExecutionResult } from "@/lib/codeRunner";
import { Scene } from "@/components/Scene";
import { CodeEditor } from "@/components/CodeEditor";
import { FileTree } from "@/components/FileTree";
import { PlaybackBar } from "@/components/PlaybackBar";
import { InfoPanel } from "@/components/InfoPanel";
import { ProjectPanel } from "@/components/ProjectPanel";
import { AnnotationModal } from "@/components/AnnotationModal";
import { ChatPanel } from "@/components/ChatPanel";
import { CommandPalette } from "@/components/CommandPalette";
import { GlobalSearch } from "@/components/GlobalSearch";
import { StatusBar } from "@/components/StatusBar";
import { NewFileModal } from "@/components/NewFileModal";
import { HandGestureControl } from "@/components/HandGestureControl";
import { JarvisOracle } from "@/components/JarvisOracle";
import { gestureEvents } from "@/lib/gestureEvents";
import { useTheme } from "@/lib/useTheme";
import { useResizablePanels, PanelDivider } from "@/lib/useResizablePanels";

const EMPTY_GRAPH: FlowGraph = { nodes: [], edges: [] };

function App() {
  const { theme, toggleTheme } = useTheme();
  const { sizes, startDrag, resetSize, resetAll } = useResizablePanels();

  const [files, setFiles] = useState<CodeFile[]>(SAMPLE_PROJECTS[0].files);
  const [activeFile, setActiveFile] = useState(0);
  const [graph, setGraph] = useState<FlowGraph>(EMPTY_GRAPH);
  const [analyzing, setAnalyzing] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [flowProgress, setFlowProgress] = useState(0);

  const [showProjects, setShowProjects] = useState(false);
  const [annotationTarget, setAnnotationTarget] = useState<{ id: string; label: string } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [showFileTree, setShowFileTree] = useState(true);
  const [showEditor, setShowEditor] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [newFileModalOpen, setNewFileModalOpen] = useState(false);
  const [sampleDropdownOpen, setSampleDropdownOpen] = useState(false);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadToast, setUploadToast] = useState<string | null>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [zoomTrigger, setZoomTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Code Execution & Terminal state
  const [executionLogs, setExecutionLogs] = useState<LogEntry[]>([]);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(true);

  // Issues state
  const [issues, setIssues] = useState<CodeIssue[]>([]);
  const [scanning, setScanning] = useState(false);

  // Fullscreen + hand gesture state
  const [fullscreen, setFullscreen] = useState(false);
  const [handControlEnabled, setHandControlEnabled] = useState(false);

  // Chat pre-fill state
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);
  // JARVIS highlighted node
  const [jarvisHighlightId, setJarvisHighlightId] = useState<string | null>(null);

  // 3D Scene External Hand Gesture controls
  const [externalRotate, setExternalRotate] = useState<{ x: number; y: number; ts: number } | null>(null);
  const [externalZoom, setExternalZoom] = useState<{ delta: number; ts: number } | null>(null);
  const [externalReset, setExternalReset] = useState<number>(0);
  const [lastConfirmedGesture, setLastConfirmedGesture] = useState<{ gesture: string; action: string; ts: number } | null>(null);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Run Code in IDE Sandbox Terminal
  const handleRunCode = useCallback(async () => {
    const currentFile = files[activeFile];
    if (!currentFile) return;
    setIsRunningCode(true);
    setShowEditor(true);
    setConsoleOpen(true);
    try {
      const res = await runCodeSnippet(currentFile, graph);
      setExecutionLogs(res.logs);
      setExecutionResult(res);
      if (res.highlightNodeId) {
        setSelectedNodeId(res.highlightNodeId);
        setJarvisHighlightId(res.highlightNodeId);
        setTimeout(() => setJarvisHighlightId(null), 4000);
      }
    } catch (e: unknown) {
      console.error("Code execution failed:", e);
    } finally {
      setIsRunningCode(false);
    }
  }, [files, activeFile, graph]);

  // Run analysis explicitly (not automatic)
  const runAnalysis = useCallback(() => {
    setAnalyzing(true);
    setTimeout(() => {
      const result = analyzeFiles(files);
      setGraph(result);
      setActiveStep(null);
      setIsPlaying(false);
      setAnalyzing(false);
      setHasRun(true);

      // Also run static issue detection
      const detected = detectIssues(files);
      setIssues(detected);
    }, 300);
  }, [files]);

  const filePathsKey = useMemo(() => files.map(f => f.path).join(","), [files]);

  // Auto-run analysis when files list changes or on initial load
  useEffect(() => {
    runAnalysis();
  }, [filePathsKey, runAnalysis]);

  // Playback animation
  useEffect(() => {
    if (!isPlaying || activeStep === null) return;
    const totalSteps = graph.edges.length;
    if (totalSteps === 0) return;
    const interval = setInterval(() => {
      setFlowProgress((p) => {
        const next = p + 0.02 * speed;
        if (next >= 1) {
          setActiveStep((s) => {
            const ns = s === null ? 0 : s + 1;
            if (ns >= totalSteps) { setIsPlaying(false); return totalSteps - 1; }
            return ns;
          });
          return 0;
        }
        return next;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [isPlaying, activeStep, graph.edges.length, speed]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "p") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setGlobalSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        setShowFileTree((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        setShowEditor((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setNewFileModalOpen(true);
      } else if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key === "r" && !e.shiftKey)) {
        e.preventDefault();
        runAnalysis();
      } else if (e.key === "Escape" && fullscreen) {
        setFullscreen(false);
        setHandControlEnabled(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen, runAnalysis]);

  const handlePlay = () => {
    if (graph.edges.length === 0) return;
    if (activeStep === null || activeStep >= graph.edges.length - 1) {
      setActiveStep(0); setFlowProgress(0);
    }
    setIsPlaying(true);
  };
  const handlePause = () => setIsPlaying(false);
  const handleStepForward = () => {
    if (graph.edges.length === 0) return;
    setActiveStep((s) => Math.min((s ?? -1) + 1, graph.edges.length - 1));
    setFlowProgress(0);
  };
  const handleStepBack = () => {
    setActiveStep((s) => Math.max((s ?? 0) - 1, 0));
    setFlowProgress(0);
  };
  const handleRestart = () => {
    setActiveStep(0); setFlowProgress(0); setIsPlaying(false);
  };

  const handleFileContentChange = (content: string) => {
    setFiles((prev) => {
      const next = [...prev];
      next[activeFile] = { ...next[activeFile], content };
      return next;
    });
  };

  const handleCreateFile = (filename: string, language: CodeLanguage) => {
    setFiles((prev) => [...prev, { filename, path: filename, language, content: "" }]);
    setActiveFile(files.length);
  };

  const handleDeleteFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setActiveFile(0);
  };

  const handleNodeClick = (id: string) => {
    setSelectedNodeId(id);
    const node = graph.nodes.find((n) => n.id === id);
    if (node && node.file) {
      const idx = files.findIndex((f) => f.filename === node.file || f.path === node.file);
      if (idx >= 0) {
        setActiveFile(idx);
        setCursorLine(node.line);
        setShowEditor(true);
      }
    }
  };

  // Unified J.A.R.V.I.S. Command & Gesture Event Listener
  useEffect(() => {
    const unsubs = [
      gestureEvents.on("run_code", () => {
        handleRunCode();
      }),
      gestureEvents.on("play_flow", () => {
        handlePlay();
      }),
      gestureEvents.on("pause_flow", () => {
        handlePause();
      }),
      gestureEvents.on("step_forward", () => {
        handleStepForward();
      }),
      gestureEvents.on("step_back", () => {
        handleStepBack();
      }),
      gestureEvents.on("reset", () => {
        setExternalReset(Date.now());
        setResetTrigger((t) => t + 1);
      }),
      gestureEvents.on("gesture_confirmed", ({ gesture, action }) => {
        setLastConfirmedGesture({ gesture, action, ts: Date.now() });
        setTimeout(() => setLastConfirmedGesture(null), 3000);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [handleRunCode]);

  const handleLineSelect = (line: number) => {
    const current = files[activeFile];
    if (!current) return;
    const matchedNode = graph.nodes.find(
      (n) =>
        (n.file === current.filename || n.file === current.path) &&
        Math.abs(n.line - line) <= 3
    );
    if (matchedNode && matchedNode.id !== selectedNodeId) {
      setSelectedNodeId(matchedNode.id);
    }
  };

  const handleLoadProject = (project: SavedProject) => {
    setFiles(project.files);
    setGraph(project.graph);
    setAnnotations(project.annotations ?? []);
    setActiveFile(0);
    setActiveStep(null);
    setIsPlaying(false);
    setSelectedNodeId(null);
    setHasRun(true);
    setIssues(detectIssues(project.files));
  };

  const handleSaveAnnotation = (text: string) => {
    if (!annotationTarget) return;
    setAnnotations((prev) => {
      const existing = prev.find((a) => a.nodeId === annotationTarget.id);
      if (existing) return prev.map((a) => a.nodeId === annotationTarget.id ? { ...a, text } : a);
      return [...prev, { nodeId: annotationTarget.id, text }];
    });
    setAnnotationTarget(null);
  };

  const handleDeleteAnnotation = () => {
    if (!annotationTarget) return;
    setAnnotations((prev) => prev.filter((a) => a.nodeId !== annotationTarget.id));
    setAnnotationTarget(null);
  };

  const handleLoadSample = (i: number) => {
    setFiles(SAMPLE_PROJECTS[i].files);
    setActiveFile(0);
    setAnnotations([]);
    setSelectedNodeId(null);
    setSampleDropdownOpen(false);
    setHasRun(false);
  };

  const handleFileSelect = (path: string) => {
    const idx = files.findIndex((f) => f.path === path);
    if (idx >= 0) setActiveFile(idx);
  };

  const handleUploadFolder = () => {
    folderInputRef.current?.click();
  };

  const handleUploadFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const loaded = await readFilesFromPicker(fileList, (count) => setUploadProgress(count));
      if (loaded.length > 0) {
        setFiles(loaded);
        setActiveFile(0);
        setAnnotations([]);
        setSelectedNodeId(null);
        setHasRun(false);
        setUploadToast(`Loaded ${loaded.length} files`);
        setTimeout(() => setUploadToast(null), 5000);
      } else {
        setUploadToast("No code files found in the selected folder");
        setTimeout(() => setUploadToast(null), 4000);
      }
    } catch {
      setUploadToast("Failed to read folder");
      setTimeout(() => setUploadToast(null), 4000);
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const loaded = await readFilesFromPicker(fileList, (count) => setUploadProgress(count));
      if (loaded.length > 0) {
        setFiles((prev) => [...prev, ...loaded]);
        setUploadToast(`Added ${loaded.length} file${loaded.length !== 1 ? "s" : ""}`);
        setTimeout(() => setUploadToast(null), 4000);
      }
    } catch {
      setUploadToast("Failed to read files");
      setTimeout(() => setUploadToast(null), 4000);
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const loaded = await readFilesFromPicker(items, (count) => setUploadProgress(count));
      if (loaded.length > 0) {
        setFiles(loaded);
        setActiveFile(0);
        setAnnotations([]);
        setSelectedNodeId(null);
        setHasRun(false);
        setUploadToast(`Loaded ${loaded.length} files from folder`);
        setTimeout(() => setUploadToast(null), 5000);
      }
    } catch {
      setUploadToast("Failed to read dropped folder");
      setTimeout(() => setUploadToast(null), 4000);
    }
    setUploading(false);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Security scan
  const handleSecurityScan = useCallback(async () => {
    setScanning(true);
    try {
      const aiIssues = await runSecurityScan(files, graph);
      // Merge AI issues with static issues
      setIssues((prev) => {
        const staticIssues = prev.filter((i) => i.source === "static");
        const aiCodeIssues: CodeIssue[] = aiIssues.map((ai, idx) => ({
          id: `ai_issue_${idx}_${Date.now()}`,
          file: ai.file,
          line: ai.line,
          severity: ai.severity,
          category: ai.category,
          title: ai.title,
          description: ai.description,
          suggestion: ai.suggestion,
          source: "ai" as const,
        }));
        return [...staticIssues, ...aiCodeIssues];
      });
      setUploadToast(`AI scan complete: ${aiIssues.length} issues found`);
      setTimeout(() => setUploadToast(null), 5000);
    } catch (err) {
      setUploadToast(err instanceof Error ? `Scan failed: ${err.message}` : "Security scan failed");
      setTimeout(() => setUploadToast(null), 5000);
    } finally {
      setScanning(false);
    }
  }, [files, graph]);

  const handleAskAi = (question: string) => {
    setChatPrefill(question);
    setChatOpen(true);
  };

  const handleJumpToIssue = (file: string, line: number) => {
    const idx = files.findIndex((f) => f.path === file || f.filename === file);
    if (idx >= 0) {
      setActiveFile(idx);
      setCursorLine(line);
    }
  };

  const selectedNode = useMemo(() => graph.nodes.find((n) => n.id === selectedNodeId) ?? null, [graph.nodes, selectedNodeId]);
  const activeEdge = activeStep !== null ? graph.edges[activeStep] ?? null : null;
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const issueCounts = getIssueCounts(issues);

  const commandActions = useMemo(() => [
    { label: "Run Code", hint: "Execute active code in live IDE sandbox (Ctrl+Enter)", action: handleRunCode },
    { label: "Analyze 3D Flow", hint: "Generate flow visualization from code (F5)", action: runAnalysis },
    { label: "AI Security Scan", hint: "Deep security analysis with AI", action: handleSecurityScan },
    { label: "Toggle File Tree", hint: "Show/hide the file explorer", action: () => setShowFileTree((v) => !v) },
    { label: "Toggle Editor", hint: "Show/hide the code editor", action: () => setShowEditor((v) => !v) },
    { label: "Toggle Details Panel", hint: "Show/hide the details panel", action: () => setShowDetails((v) => !v) },
    { label: "Toggle AI Chat", hint: "Show/hide the AI chat panel", action: () => setChatOpen((v) => !v) },
    { label: "Toggle Fullscreen", hint: "Expand visualization to fullscreen", action: () => setFullscreen((v) => !v) },
    { label: "Toggle Theme", hint: "Switch between dark and light", action: toggleTheme },
    { label: "Upload Folder", hint: "Load a project folder from disk", action: handleUploadFolder },
    { label: "Add Files", hint: "Add individual code files", action: handleUploadFiles },
    { label: "New File", hint: "Create a new empty file", action: () => setNewFileModalOpen(true) },
    { label: "Global Search", hint: "Search across all files", action: () => setGlobalSearchOpen(true) },
    { label: "Reset View", hint: "Reset camera and panel sizes", action: () => { resetAll(); setResetTrigger((t) => t + 1); } },
    { label: "Open Projects", hint: "View saved projects", action: () => setShowProjects(true) },
  ], [toggleTheme, resetAll, runAnalysis, handleSecurityScan, handleRunCode]);

  return (
    <div
      className="h-screen w-screen overflow-hidden bg-app-bg text-fg-primary flex flex-col"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <input ref={folderInputRef} type="file" className="hidden" onChange={handleFolderInputChange} multiple />
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInputChange} multiple />

      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center drop-overlay pointer-events-none">
          <div className="flex flex-col items-center gap-4 bg-app-elevated/90 rounded-3xl border-2 border-dashed border-accent-primary px-12 py-10">
            <Upload size={48} className="text-accent-primary" />
            <p className="text-lg font-medium text-accent-primary">Drop your folder here</p>
            <p className="text-sm text-fg-muted">We'll read all code files automatically</p>
          </div>
        </div>
      )}

      {/* Fullscreen visualization mode */}
      {fullscreen ? (
        <div className="fixed inset-0 z-[200] bg-app-bg">
          <Scene
            graph={graph}
            activeStep={activeStep}
            hoveredId={hoveredId}
            annotations={annotations}
            onHover={setHoveredId}
            onNodeClick={handleNodeClick}
            flowProgress={flowProgress}
            theme={theme}
            focusNodeId={jarvisHighlightId ?? selectedNodeId}
            onZoomIn={() => setZoomTrigger((t) => t + 1)}
            onZoomOut={() => setZoomTrigger((t) => t - 1)}
            onResetView={() => setResetTrigger((t) => t + 1)}
            zoomTrigger={zoomTrigger}
            resetTrigger={resetTrigger}
            externalRotate={externalRotate}
            externalZoom={externalZoom}
            externalReset={externalReset}
          />

          {/* J.A.R.V.I.S. 3D Visual Targeting Reticle HUD Banner in Fullscreen */}
          {jarvisHighlightId && (() => {
            const targetNode = graph.nodes.find((n) => n.id === jarvisHighlightId);
            if (!targetNode) return null;
            return (
              <div
                className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-2xl select-none animate-slide-up"
                style={{
                  background: "linear-gradient(135deg, rgba(2,12,32,0.94) 0%, rgba(1,6,18,0.98) 100%)",
                  border: "1px solid rgba(0,212,255,0.5)",
                  boxShadow: "0 4px 24px rgba(0,212,255,0.35)",
                  backdropFilter: "blur(20px)",
                }}
              >
                <div className="relative w-5 h-5 flex-shrink-0">
                  <div className="absolute inset-0 rounded-full border border-cyan-400 animate-ping" />
                  <div className="absolute inset-0.5 rounded-full border border-cyan-500 animate-spin" />
                  <div className="w-2 h-2 rounded-full bg-cyan-400 absolute inset-0 m-auto" />
                </div>
                <div className="text-left">
                  <div className="text-[10px] font-mono tracking-widest text-cyan-300 font-bold flex items-center gap-2">
                    <span>J.A.R.V.I.S. 3D TARGETING</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-normal">
                      {targetNode.kind.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-100 font-semibold flex items-center gap-2">
                    <span>{targetNode.label}</span>
                  </div>
                </div>
                <button
                  onClick={() => setJarvisHighlightId(null)}
                  className="ml-2 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Dismiss target"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })()}

          {/* Confirmed Hand Gesture Notification Banner in Fullscreen */}
          {lastConfirmedGesture && (
            <div
              className="absolute top-28 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-1.5 rounded-full select-none animate-slide-up pointer-events-none"
              style={{
                background: "linear-gradient(135deg, rgba(2,12,32,0.94) 0%, rgba(1,6,18,0.98) 100%)",
                border: "1px solid rgba(0,212,255,0.45)",
                boxShadow: "0 0 20px rgba(0,212,255,0.3)",
                backdropFilter: "blur(20px)",
              }}
            >
              <Sparkles size={13} className="text-cyan-400 animate-spin" />
              <span className="text-[10px] font-mono font-bold text-cyan-300 tracking-wider">
                GESTURE COMMAND //
              </span>
              <span className="text-[10px] font-mono text-white font-semibold">
                {lastConfirmedGesture.gesture}: {lastConfirmedGesture.action}
              </span>
            </div>
          )}

          {/* JARVIS Oracle in Fullscreen */}
          <JarvisOracle
            graph={graph}
            files={files}
            selectedNode={selectedNode}
            activeStep={activeStep}
            onHighlightNode={setJarvisHighlightId}
            onSelectNode={setSelectedNodeId}
            onPlayFlow={handlePlay}
            onPauseFlow={handlePause}
            onStepForward={handleStepForward}
            onStepBack={handleStepBack}
            onZoomIn={() => setZoomTrigger((t) => t + 1)}
            onZoomOut={() => setZoomTrigger((t) => t - 1)}
            onResetView={() => setResetTrigger((t) => t + 1)}
            onSelectFile={handleFileSelect}
            onRunAnalysis={runAnalysis}
            onRunSecurityScan={handleSecurityScan}
            onRunCode={handleRunCode}
          />

          {/* Fullscreen control bar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-app-panel/90 backdrop-blur-md rounded-2xl border border-border-subtle px-3 py-2 shadow-2xl">
            <button
              onClick={() => setZoomTrigger((t) => t + 1)}
              className="w-9 h-9 rounded-xl bg-app-card hover:bg-app-hover text-fg-secondary hover:text-accent-primary flex items-center justify-center transition-all"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => setZoomTrigger((t) => t - 1)}
              className="w-9 h-9 rounded-xl bg-app-card hover:bg-app-hover text-fg-secondary hover:text-accent-primary flex items-center justify-center transition-all"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={() => setResetTrigger((t) => t + 1)}
              className="w-9 h-9 rounded-xl bg-app-card hover:bg-app-hover text-fg-secondary hover:text-accent-primary flex items-center justify-center transition-all"
              title="Reset view"
            >
              <Maximize2 size={16} />
            </button>
            <div className="w-px h-6 bg-border-subtle" />
            <button
              onClick={() => setHandControlEnabled((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                handControlEnabled
                  ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/40"
                  : "bg-app-card hover:bg-app-hover text-fg-secondary border border-border-subtle"
              }`}
              title="Toggle hand gesture control"
            >
              <Hand size={16} /> Hand Control
            </button>
            <div className="w-px h-6 bg-border-subtle" />
            <button
              onClick={() => setFullscreen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-app-card hover:bg-app-hover text-fg-secondary hover:text-accent-primary text-sm font-medium border border-border-subtle transition-all"
              title="Exit fullscreen (Esc)"
            >
              <Minimize2 size={16} /> Exit
            </button>
          </div>

          {/* Playback bar in fullscreen */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
            <PlaybackBar
              isPlaying={isPlaying}
              onPlay={handlePlay}
              onPause={handlePause}
              onStepForward={handleStepForward}
              onStepBack={handleStepBack}
              onRestart={handleRestart}
              activeStep={activeStep}
              totalSteps={graph.edges.length}
              speed={speed}
              onSpeedChange={setSpeed}
            />
          </div>

          {/* Node info overlay in fullscreen */}
          {selectedNode && (
            <div className="absolute top-20 right-4 z-30 max-w-[300px] bg-app-panel/90 backdrop-blur-md rounded-xl border border-border-subtle p-4 shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold uppercase"
                  style={{ background: `${NODE_COLORS[selectedNode.kind]}22`, color: NODE_COLORS[selectedNode.kind] }}
                >
                  {selectedNode.kind}
                </span>
                <span className="text-sm font-semibold text-fg-primary truncate">{selectedNode.label}</span>
              </div>
              <p className="text-xs text-fg-secondary mb-2">{selectedNode.detail}</p>
              <div className="text-[10px] text-fg-muted font-mono">{selectedNode.file}:{selectedNode.line}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Premium Top Bar ── */}
          <header className="flex items-center justify-between px-4 py-2 flex-shrink-0 z-10 overflow-x-auto"
            style={{ background: theme === "light" ? "rgba(255,255,255,0.92)" : "rgba(2,6,20,0.95)", borderBottom: theme === "light" ? "1px solid rgba(148,163,184,0.3)" : "1px solid rgba(0,212,255,0.12)", backdropFilter: "blur(20px)" }}>

            {/* Left: logo + panels */}
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFileTree(v => !v)}
                className="p-1.5 rounded-lg transition-colors text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/10"
                title="Toggle file tree (Ctrl+B)">
                {showFileTree ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
              </button>

              {/* Logo */}
              <div className="flex items-center gap-2.5 pl-1">
                <div className="relative w-6 h-6">
                  <div className="absolute inset-0 rounded-full border border-cyan-500/50 animate-jarvis-rotate" />
                  <div className="absolute inset-1 rounded-full border border-cyan-400/30 animate-jarvis-rotate-reverse" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full animate-jarvis-pulse" style={{ background: "radial-gradient(circle, #00d4ff 0%, rgba(0,212,255,0.2) 100%)", boxShadow: "0 0 8px rgba(0,212,255,0.8)" }} />
                  </div>
                </div>
                <div>
                  <h1 className="text-sm font-black tracking-tight jarvis-title">FlowViz</h1>
                  <div className="text-[9px] font-mono text-slate-600 tracking-widest -mt-0.5">LIVE ARCHITECTURE</div>
                </div>
              </div>

              <div className="w-px h-5 mx-1" style={{ background: "rgba(0,212,255,0.15)" }} />

              {/* Quick action pills */}
              <button onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all text-slate-400 hover:text-cyan-400 border border-transparent hover:border-cyan-500/20 hover:bg-cyan-500/5"
                title="Command palette (Ctrl+P)">
                <Command size={12} /> Commands
              </button>
              <button onClick={() => setGlobalSearchOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all text-slate-400 hover:text-cyan-400 border border-transparent hover:border-cyan-500/20 hover:bg-cyan-500/5"
                title="Global search (Ctrl+Shift+F)">
                <Search size={12} /> Search
              </button>
            </div>

            {/* Center: live stats */}
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.12)", color: "rgba(0,212,255,0.7)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                {graph.nodes.length} NODES
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.12)", color: "rgba(167,139,250,0.7)" }}>
                {graph.edges.length} CONNECTIONS
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.12)", color: "rgba(56,189,248,0.7)" }}>
                {files.length} FILES
              </span>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-1.5">
              {/* Samples */}
              <div className="relative">
                <button onClick={() => setSampleDropdownOpen(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all text-slate-400 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/30 bg-slate-900/60 hover:bg-cyan-500/5">
                  <FolderOpen size={12} /> Samples <ChevronDown size={10} className={sampleDropdownOpen ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
                {sampleDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setSampleDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 w-52 rounded-xl border shadow-2xl py-1" style={{ background: "rgba(4,8,24,0.98)", border: "1px solid rgba(0,212,255,0.2)" }}>
                      {SAMPLE_PROJECTS.map((s, i) => (
                        <button key={i} onClick={() => handleLoadSample(i)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors">
                          <FolderOpen size={12} className="text-slate-600" /> {s.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button onClick={handleUploadFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all btn-jarvis">
                <Upload size={12} /> Upload
              </button>

              <div className="w-px h-5" style={{ background: "rgba(0,212,255,0.1)" }} />

              <button onClick={() => setShowEditor(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                  showEditor ? "text-cyan-300 border-cyan-500/40 bg-cyan-500/10" : "text-slate-500 border-slate-800 bg-slate-900/60 hover:text-slate-300"
                }`}
                title="Toggle Code Editor (Ctrl+J)">
                <Code2 size={12} /> Editor
              </button>

              <button onClick={() => setShowDetails(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                  showDetails ? "text-amber-300 border-amber-500/40 bg-amber-500/10" : "text-slate-500 border-slate-800 bg-slate-900/60 hover:text-slate-300"
                }`}
                title="Toggle Details & Issues Panel">
                <Info size={12} /> Details
              </button>

              <button onClick={() => setChatOpen(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                  chatOpen ? "text-violet-300 border-violet-500/40 bg-violet-500/10" : "text-slate-400 border-slate-800 bg-slate-900/60 hover:border-violet-500/30 hover:text-violet-300"
                }`}
                title="Toggle AI chat">
                <MessageSquare size={12} /> AI Chat
              </button>

              <button onClick={toggleTheme}
                className="p-2 rounded-lg transition-all text-slate-500 hover:text-cyan-400 border border-slate-800 hover:border-cyan-500/20 bg-slate-900/60"
                title={theme === "dark" ? "Light mode" : "Dark mode"}>
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>

              <button onClick={() => setShowProjects(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/30 bg-slate-900/60 transition-all">
                <FolderOpen size={12} /> Projects
              </button>
            </div>
          </header>

          {/* Main layout with resizable panels */}
          <div className="flex-1 flex relative overflow-hidden">
            {/* File tree */}
            {showFileTree && (
              <>
                <section style={{ width: sizes.fileTree }} className="flex-shrink-0 h-full flex flex-col">
                  <FileTree
                    tree={fileTree}
                    activeFilePath={files[activeFile]?.path ?? null}
                    onFileSelect={handleFileSelect}
                    onAddFile={() => setNewFileModalOpen(true)}
                    onUploadFolder={handleUploadFolder}
                    fileCount={files.length}
                  />
                </section>
                <PanelDivider onMouseDown={(e) => startDrag(e, "fileTree")} onDoubleClick={() => resetSize("fileTree")} side="left" />
              </>
            )}

            {/* Code editor */}
            {showEditor && (
              <>
                <section style={{ width: sizes.editor }} className="flex-shrink-0 h-full flex flex-col">
                  <CodeEditor
                    files={files}
                    activeFile={activeFile}
                    onActiveFileChange={setActiveFile}
                    onFileContentChange={handleFileContentChange}
                    onAddFile={() => setNewFileModalOpen(true)}
                    onDeleteFile={handleDeleteFile}
                    analyzing={analyzing}
                    onCursorChange={(line, col) => { setCursorLine(line); setCursorCol(col); }}
                    onLineSelect={handleLineSelect}
                    highlightedLine={selectedNode?.line ?? null}
                    onRunCode={handleRunCode}
                    executionLogs={executionLogs}
                    executionResult={executionResult}
                    isRunningCode={isRunningCode}
                    onClearLogs={() => setExecutionLogs([])}
                    issues={issues}
                    onAskJarvis={handleAskAi}
                    onJumpToIssue={handleJumpToIssue}
                    consoleOpen={consoleOpen}
                    onToggleConsole={() => setConsoleOpen(v => !v)}
                  />
                </section>
                <PanelDivider onMouseDown={(e) => startDrag(e, "editor")} onDoubleClick={() => resetSize("editor")} side="left" />
              </>
            )}

            {/* 3D scene */}
            <section className="flex-1 relative flex flex-col min-w-0">
              {/* Scene toolbar */}
              <div className="flex items-center justify-between px-3 py-1.5 z-10 flex-shrink-0 overflow-x-auto gap-2"
                style={{ background: theme === "light" ? "rgba(255,255,255,0.9)" : "rgba(2,6,20,0.92)", borderBottom: "1px solid rgba(0,212,255,0.1)", backdropFilter: "blur(16px)" }}>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-2 text-[10px] font-mono" style={{ color: "rgba(0,212,255,0.7)" }}>
                    <Network size={12} style={{ color: "rgba(0,212,255,0.8)" }} />
                    <span className="uppercase tracking-widest font-semibold">Flow Visualization</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 overflow-x-auto">
                  {/* Run Code */}
                  <button onClick={handleRunCode} disabled={isRunningCode}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50 flex-shrink-0"
                    style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "#10b981" }}
                    title="Execute active code in live IDE sandbox (Ctrl+Enter)">
                    {isRunningCode ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} className="fill-emerald-400" />}
                    {isRunningCode ? "Running…" : "Run Code"}
                  </button>

                  {/* Analyze 3D Flow */}
                  <button onClick={runAnalysis} disabled={analyzing}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50 flex-shrink-0"
                    style={{ background: analyzing ? "rgba(0,212,255,0.1)" : "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.35)", color: theme === "light" ? "#0284c7" : "#38bdf8" }}
                    title="Analyze code & update 3D flow graph (F5)">
                    {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Network size={12} />}
                    {analyzing ? "Analyzing…" : "Analyze Flow"}
                  </button>

                  {/* Security */}
                  <button onClick={handleSecurityScan} disabled={scanning}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50 flex-shrink-0"
                    style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", color: "#d97706" }}
                    title="AI security scan">
                    {scanning ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                    {scanning ? "Scanning…" : "Security"}
                  </button>

                  {/* Issues */}
                  {issues.length > 0 && (
                    <button onClick={() => setShowDetails(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0"
                      style={{ background: issueCounts.errors > 0 ? "rgba(239,68,68,0.1)" : "rgba(251,191,36,0.1)", border: `1px solid ${issueCounts.errors > 0 ? "rgba(239,68,68,0.3)" : "rgba(251,191,36,0.25)"}`, color: issueCounts.errors > 0 ? "#ef4444" : "#d97706" }}
                      title={`${issues.length} issues detected`}>
                      <AlertTriangle size={12} /> {issues.length}
                    </button>
                  )}

                  {/* Hand Control */}
                  <button onClick={() => setHandControlEnabled(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-all flex-shrink-0"
                    style={handControlEnabled
                      ? { background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff", boxShadow: "0 0 12px rgba(0,212,255,0.2)" }
                      : { background: theme === "light" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.2)", color: theme === "light" ? "#475569" : "#64748b" }}
                    title="Toggle hand gesture control">
                    <Hand size={12} /> Hands
                  </button>

                  {/* Fullscreen */}
                  <button onClick={() => setFullscreen(true)}
                    className="p-1.5 rounded-lg transition-all text-slate-500 hover:text-cyan-400 flex-shrink-0"
                    style={{ border: "1px solid rgba(148,163,184,0.2)" }}
                    title="Fullscreen">
                    <Maximize2 size={13} />
                  </button>
                </div>
              </div>

              <div className="flex-1 relative min-h-0">
                <Scene
                  graph={graph}
                  activeStep={activeStep}
                  hoveredId={hoveredId}
                  annotations={annotations}
                  onHover={setHoveredId}
                  onNodeClick={handleNodeClick}
                  flowProgress={flowProgress}
                  theme={theme}
                  focusNodeId={jarvisHighlightId ?? selectedNodeId}
                  onZoomIn={() => setZoomTrigger((t) => t + 1)}
                  onZoomOut={() => setZoomTrigger((t) => t - 1)}
                  onResetView={() => setResetTrigger((t) => t + 1)}
                  zoomTrigger={zoomTrigger}
                  resetTrigger={resetTrigger}
                  externalRotate={externalRotate}
                  externalZoom={externalZoom}
                  externalReset={externalReset}
                />

                {/* J.A.R.V.I.S. 3D Visual Targeting Reticle HUD Banner */}
                {jarvisHighlightId && (() => {
                  const targetNode = graph.nodes.find(n => n.id === jarvisHighlightId);
                  if (!targetNode) return null;
                  return (
                    <div
                      className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-2xl select-none animate-slide-up"
                      style={{
                        background: "linear-gradient(135deg, rgba(2,12,32,0.94) 0%, rgba(1,6,18,0.96) 100%)",
                        border: "1px solid rgba(0,212,255,0.5)",
                        boxShadow: "0 4px 24px rgba(0,212,255,0.35)",
                        backdropFilter: "blur(20px)",
                      }}
                    >
                      <div className="relative w-5 h-5 flex-shrink-0">
                        <div className="absolute inset-0 rounded-full border border-cyan-400 animate-ping" />
                        <div className="absolute inset-0.5 rounded-full border border-cyan-500 animate-spin" />
                        <div className="w-2 h-2 rounded-full bg-cyan-400 absolute inset-0 m-auto" />
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] font-mono tracking-widest text-cyan-300 font-bold flex items-center gap-2">
                          <span>J.A.R.V.I.S. 3D TARGETING</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-normal">
                            {targetNode.kind.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-100 font-semibold flex items-center gap-2">
                          <span>{targetNode.label}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({targetNode.file.split("/").pop()}:{targetNode.line})
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setJarvisHighlightId(null)}
                        className="ml-2 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Dismiss target"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })()}

                {/* Confirmed Hand Gesture Notification Banner */}
                {lastConfirmedGesture && (
                  <div
                    className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-4 py-1.5 rounded-full select-none animate-slide-up pointer-events-none"
                    style={{
                      background: "linear-gradient(135deg, rgba(2,12,32,0.94) 0%, rgba(1,6,18,0.98) 100%)",
                      border: "1px solid rgba(0,212,255,0.45)",
                      boxShadow: "0 0 20px rgba(0,212,255,0.3)",
                      backdropFilter: "blur(20px)",
                    }}
                  >
                    <Sparkles size={13} className="text-cyan-400 animate-spin" />
                    <span className="text-[10px] font-mono font-bold text-cyan-300 tracking-wider">
                      GESTURE COMMAND //
                    </span>
                    <span className="text-[10px] font-mono text-white font-semibold">
                      {lastConfirmedGesture.gesture}: {lastConfirmedGesture.action}
                    </span>
                  </div>
                )}

                {/* JARVIS Oracle */}
                <JarvisOracle
                  graph={graph}
                  files={files}
                  selectedNode={selectedNode}
                  activeStep={activeStep}
                  onHighlightNode={setJarvisHighlightId}
                  onSelectNode={setSelectedNodeId}
                  onPlayFlow={handlePlay}
                  onPauseFlow={handlePause}
                  onStepForward={handleStepForward}
                  onStepBack={handleStepBack}
                  onZoomIn={() => setZoomTrigger((t) => t + 1)}
                  onZoomOut={() => setZoomTrigger((t) => t - 1)}
                  onResetView={() => setResetTrigger((t) => t + 1)}
                  onSelectFile={handleFileSelect}
                  onRunAnalysis={runAnalysis}
                  onRunSecurityScan={handleSecurityScan}
                  onRunCode={handleRunCode}
                />

                {/* Legend */}
                <div className="absolute top-4 left-4 z-10 rounded-xl p-3 text-[10px] font-mono space-y-2"
                  style={{ background: "rgba(2,8,22,0.88)", border: "1px solid rgba(0,212,255,0.15)", backdropFilter: "blur(16px)" }}>
                  <div className="uppercase tracking-widest text-[9px] mb-2" style={{ color: "rgba(0,212,255,0.4)" }}>Legend</div>
                  <div className="space-y-1.5">
                    {([["frontend", "Frontend", Monitor], ["backend", "Backend", Server], ["database", "Database", Database], ["function", "Function", Code2]] as const).map(([kind, label, Icon]) => (
                      <div key={kind} className="flex items-center gap-2">
                        <Icon size={11} style={{ color: NODE_COLORS[kind] }} />
                        <span style={{ color: "rgba(180,200,220,0.7)" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="h-px my-1.5" style={{ background: "rgba(0,212,255,0.1)" }} />
                  <div className="space-y-1.5">
                    {(["request", "query", "response", "call", "import"] as const).map((kind) => (
                      <div key={kind} className="flex items-center gap-2">
                        <span className="w-4 h-0.5 rounded-full" style={{ background: EDGE_COLORS[kind], boxShadow: `0 0 4px ${EDGE_COLORS[kind]}` }} />
                        <span className="capitalize" style={{ color: "rgba(180,200,220,0.7)" }}>{kind}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Zoom controls */}
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
                  {[
                    { label: "Zoom In",    fn: () => setZoomTrigger(t => t + 1), icon: ZoomIn },
                    { label: "Zoom Out",   fn: () => setZoomTrigger(t => t + 1), icon: ZoomOut },
                    { label: "Reset View", fn: () => setResetTrigger(t => t + 1), icon: Maximize2 },
                  ].map(({ label, fn, icon: Icon }) => (
                    <button key={label} onClick={fn} title={label}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                      style={{ background: "rgba(0,10,28,0.85)", border: "1px solid rgba(0,212,255,0.18)", color: "rgba(0,212,255,0.6)", backdropFilter: "blur(12px)" }}>
                      <Icon size={13} />
                    </button>
                  ))}
                </div>

                {/* Playback bar */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
                  <PlaybackBar
                    isPlaying={isPlaying}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onStepForward={handleStepForward}
                    onStepBack={handleStepBack}
                    onRestart={handleRestart}
                    activeStep={activeStep}
                    totalSteps={graph.edges.length}
                    speed={speed}
                    onSpeedChange={setSpeed}
                  />
                </div>

                {/* Annotation button */}
                {selectedNode && (
                  <button
                    onClick={() => setAnnotationTarget({ id: selectedNode.id, label: selectedNode.label })}
                    className="absolute bottom-20 right-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-105"
                    style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24" }}
                  >
                    <StickyNote size={13} /> Add Note
                  </button>
                )}

                {/* Empty state */}
                {graph.nodes.length === 0 && !analyzing && hasRun && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center max-w-md px-4">
                      <Sparkles size={40} className="mx-auto mb-4 text-accent-primary opacity-60" />
                      <p className="text-fg-muted text-sm mb-2">
                        No flow patterns detected in your code.
                      </p>
                      <p className="text-fg-faint text-xs">
                        Try writing code with fetch calls, API routes, database queries, or function definitions, then click "Run".
                      </p>
                    </div>
                  </div>
                )}

                {!hasRun && !analyzing && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center max-w-md px-4">
                      <Zap size={40} className="mx-auto mb-4 text-accent-primary opacity-60" />
                      <p className="text-fg-secondary text-sm mb-2">
                        Click "Run" to generate the flow visualization.
                      </p>
                      <p className="text-fg-faint text-xs">
                        The analyzer will detect API routes, database queries, and function calls in your code.
                      </p>
                    </div>
                  </div>
                )}

                {/* Upload toast */}
                {uploadToast && (
                  <div className="absolute top-4 right-16 z-20 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-app-elevated border border-accent-primary/40 shadow-2xl text-sm text-fg-primary animate-fade-in">
                    <Sparkles size={14} className="text-accent-primary" />
                    {uploadToast}
                  </div>
                )}

                {/* Upload loading */}
                {uploading && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center drop-overlay">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 size={40} className="text-accent-primary animate-spin" />
                      <p className="text-sm text-accent-primary font-medium">
                        Reading files... {uploadProgress > 0 && `(${uploadProgress})`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Analyzing indicator */}
                {analyzing && (
                  <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-app-panel/90 backdrop-blur-md border border-border-subtle text-xs text-accent-primary">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
                    Analyzing...
                  </div>
                )}
              </div>
            </section>

            {/* Details panel */}
            {showDetails && (
              <>
                <PanelDivider onMouseDown={(e) => startDrag(e, "details")} onDoubleClick={() => resetSize("details")} side="right" />
                <section style={{ width: sizes.details }} className="flex-shrink-0 h-full flex flex-col">
                  <InfoPanel
                    graph={graph}
                    activeStep={activeStep}
                    selectedNodeId={selectedNodeId}
                    onClearSelection={() => setSelectedNodeId(null)}
                    files={files}
                    onAskAi={handleAskAi}
                    issues={issues}
                    onJumpToIssue={handleJumpToIssue}
                  />
                </section>
              </>
            )}

            {/* AI Chat */}
            {chatOpen && (
              <>
                <PanelDivider onMouseDown={(e) => startDrag(e, "chat")} onDoubleClick={() => resetSize("chat")} side="right" />
                <section style={{ width: sizes.chat }} className="flex-shrink-0 h-full flex flex-col bg-app-panel backdrop-blur-xl">
                  <div className="flex items-center justify-between px-4 py-2 bg-app-panel backdrop-blur-xl border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={15} className="text-accent-primary" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-fg-secondary">Ask AI</span>
                    </div>
                    <button
                      onClick={() => setChatOpen(false)}
                      className="p-1 rounded-md hover:bg-app-hover text-fg-muted hover:text-fg-primary transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <ChatPanel
                      files={files}
                      graph={graph}
                      selectedNode={selectedNode}
                      activeStep={activeEdge}
                      prefillQuestion={chatPrefill}
                      onPrefillConsumed={() => setChatPrefill(null)}
                      onSelectNode={setSelectedNodeId}
                      onPlayFlow={handlePlay}
                      onPauseFlow={handlePause}
                      onZoomIn={() => setZoomTrigger((t) => t + 1)}
                      onZoomOut={() => setZoomTrigger((t) => t + 1)}
                      onResetView={() => setResetTrigger((t) => t + 1)}
                      onSelectFile={handleFileSelect}
                      onRunAnalysis={runAnalysis}
                      onRunSecurityScan={handleSecurityScan}
                      onRunCode={handleRunCode}
                    />
                  </div>
                </section>
              </>
            )}
          </div>

          {/* Status bar */}
          <StatusBar
            language={files[activeFile]?.language ?? null}
            cursorLine={cursorLine}
            cursorCol={cursorCol}
            nodeCount={graph.nodes.length}
            edgeCount={graph.edges.length}
            analyzing={analyzing}
            fileCount={files.length}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        </>
      )}

      {/* Modals */}
      <ProjectPanel
        open={showProjects}
        onClose={() => setShowProjects(false)}
        files={files}
        graph={graph}
        annotations={annotations}
        onLoad={handleLoadProject}
      />

      {annotationTarget && (
        <AnnotationModal
          nodeId={annotationTarget.id}
          nodeLabel={annotationTarget.label}
          currentText={annotations.find((a) => a.nodeId === annotationTarget.id)?.text ?? null}
          onSave={handleSaveAnnotation}
          onDelete={handleDeleteAnnotation}
          onClose={() => setAnnotationTarget(null)}
        />
      )}

      <NewFileModal
        open={newFileModalOpen}
        onClose={() => setNewFileModalOpen(false)}
        onCreate={handleCreateFile}
      />

      <CommandPalette
        files={files}
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onFileSelect={setActiveFile}
        actions={commandActions}
      />

      <GlobalSearch
        files={files}
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onFileSelect={(idx, line) => {
          setActiveFile(idx);
          if (line) setCursorLine(line);
        }}
      />

      {/* Global High-Speed Hand Gesture Control */}
      <HandGestureControl
        enabled={handControlEnabled}
        onToggle={() => setHandControlEnabled((v) => !v)}
        onResetView={() => {
          setExternalReset(Date.now());
          setResetTrigger((t) => t + 1);
        }}
        onAction={(action) => {
          if (action === "run_code") handleRunCode();
          else if (action === "pause_flow") handlePause();
          else if (action === "play_flow") handlePlay();
          else if (action === "step_forward") handleStepForward();
          else if (action === "step_back") handleStepBack();
        }}
        onNodeClickAt={(screenX, screenY) => {
          const el = document.elementFromPoint(screenX, screenY);
          if (el) {
            const clickEv = new MouseEvent("click", {
              clientX: screenX,
              clientY: screenY,
              bubbles: true,
            });
            el.dispatchEvent(clickEv);
          }
        }}
      />
    </div>
  );
}

export default App;
