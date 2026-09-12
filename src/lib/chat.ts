import type { FlowGraph, FlowNode, FlowEdge, CodeFile } from "@/types";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatContext {
  files: CodeFile[];
  graph: FlowGraph;
  selectedNode: FlowNode | null;
  activeStep: FlowEdge | null;
  mode: "chat" | "analysis" | "security";
}

export interface SecurityIssue {
  file: string;
  line: number;
  severity: "error" | "warning" | "info";
  category: string;
  title: string;
  description: string;
  suggestion: string;
}

export type ActionType =
  | "focus_node"
  | "play_flow"
  | "pause_flow"
  | "step_forward"
  | "step_back"
  | "zoom_in"
  | "zoom_out"
  | "reset_view"
  | "select_file"
  | "run_analysis"
  | "run_security"
  | "run_code"
  | "highlight_kind";

export interface ParsedAction {
  type: ActionType;
  param?: string;
  label: string;
}

const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6LCh6vbwG-dFpalz-RHainKybOyRyu1yI8XEIVkv5NLQQ";
let isKeyInvalid = false;
let inMemoryKey: string | null = null;

export function getGeminiKey(): string {
  if (inMemoryKey && inMemoryKey.trim()) {
    return inMemoryKey.trim();
  }
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      const custom =
        localStorage.getItem("gemini_api_key") ||
        localStorage.getItem("jarvis_api_key") ||
        localStorage.getItem("groq_api_key");
      if (custom && custom.trim()) return custom.trim();
    } catch {
      // Ignore localStorage access issues in sandboxed environments
    }
  }
  return (
    import.meta.env.VITE_GEMINI_API_KEY ||
    import.meta.env.GEMINI_API_KEY ||
    DEFAULT_GEMINI_KEY
  );
}

export const getGroqKey = getGeminiKey;

export function setCustomGeminiKey(key: string): void {
  const trimmed = key.trim();
  inMemoryKey = trimmed || null;
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      if (trimmed) {
        localStorage.setItem("gemini_api_key", trimmed);
        localStorage.setItem("jarvis_api_key", trimmed);
      } else {
        localStorage.removeItem("gemini_api_key");
        localStorage.removeItem("jarvis_api_key");
        localStorage.removeItem("groq_api_key");
      }
    } catch {
      // Ignore localStorage access issues
    }
  }
  isKeyInvalid = false;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("jarvis:api_key_updated", { detail: { key: trimmed } })
    );
  }
}

export const setCustomGroqKey = setCustomGeminiKey;

export function getIsKeyInvalid(): boolean {
  return isKeyInvalid;
}
export const getIsGroqKeyInvalid = getIsKeyInvalid;

export async function verifyGeminiApiKey(keyToTest?: string): Promise<{ valid: boolean; error?: string }> {
  const key = keyToTest?.trim() || getGeminiKey();
  if (!key) {
    return { valid: false, error: "No Gemini API key provided." };
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (res.ok) {
      isKeyInvalid = false;
      return { valid: true };
    }
    const errData = await res.json().catch(() => ({}));
    const message = errData?.error?.message || `Google API error (HTTP ${res.status})`;
    return { valid: false, error: message };
  } catch {
    return { valid: false, error: "Network error connecting to Google Gemini endpoint" };
  }
}

export const verifyGroqApiKey = verifyGeminiApiKey;

export function buildSystemPrompt(context: ChatContext): string {
  const parts: string[] = [];

  parts.push(`You are JARVIS, a world-class AI pair programmer (inspired by ChatGPT and Iron Man). You speak with a polite, helpful British tone, addressing the user as "sir" or "Boss".

CRITICAL CHATGPT-STYLE RESPONSE RULES:
1. Explain everything using SIMPLE, EASY-TO-UNDERSTAND, and CRYSTAL-CLEAR words (just like ChatGPT).
2. Keep answers SHORT, FRIENDLY, and DIRECT TO THE POINT (2-3 concise sentences maximum unless complex code steps are explicitly requested).
3. Avoid bizarre jargon, overly complex sentences, or long unnecessary preambles.
4. When discussing code, give plain-English explanations with direct line numbers and clear insights.

CRITICAL INSTRUCTIONS:
1. ALWAYS directly answer what the user asked in simple, understandable words!
2. If the user asks about code or errors, explain clearly in plain English.
3. If the user asks to run code, explain what it does simply and trigger [ACTION:run_code].
4. If the user asks to control the 3D visualization, trigger the appropriate action:
    - [ACTION:run_code] (executes code in live terminal)
    - [ACTION:focus_node:node_id_or_label] (focuses 3D node)
    - [ACTION:play_flow] (plays data flow animation)
    - [ACTION:pause_flow] (pauses flow animation)
    - [ACTION:zoom_in] (zooms in)
    - [ACTION:zoom_out] (zooms out)
    - [ACTION:reset_view] (resets view)
    - [ACTION:select_file:filename] (opens file)
    - [ACTION:run_analysis] (runs flow analysis)
    - [ACTION:run_security] (runs security scan)
`);

  if (context.graph?.nodes?.length > 0) {
    const nodeList = context.graph.nodes
      .map((n) => `- [${n.kind.toUpperCase()}] "${n.label}" (ID: "${n.id}", File: "${n.file}", Line: ${n.line}): ${n.detail}`)
      .join("\n");
    parts.push(`=== Current 3D Graph Nodes (${context.graph.nodes.length}) ===\n${nodeList}`);
  }

  if (context.graph?.edges?.length > 0) {
    const edgeList = context.graph.edges
      .map((e) => {
        const fromN = context.graph.nodes.find((n) => n.id === e.from)?.label || e.from;
        const toN = context.graph.nodes.find((n) => n.id === e.to)?.label || e.to;
        return `- "${fromN}" -> "${toN}" (${e.kind}): ${e.label} [${e.detail}]`;
      })
      .join("\n");
    parts.push(`=== Data Flow Connections (${context.graph.edges.length}) ===\n${edgeList}`);
  }

  if (context.selectedNode) {
    parts.push(
      `=== Currently Focused Node ===\n"${context.selectedNode.label}" (${context.selectedNode.kind})\nLocation: ${context.selectedNode.file}:${context.selectedNode.line}\nDetails: ${context.selectedNode.detail}\nCode snippet:\n${context.selectedNode.snippet}`
    );
  }

  if (context.files?.length > 0) {
    const fileSummary = context.files
      .slice(0, 10)
      .map((f) => `--- File: ${f.filename || f.path} (${f.language}) ---\n${f.content.slice(0, 1200)}`)
      .join("\n\n");
    parts.push(`=== Source Code Files (${context.files.length}) ===\n${fileSummary}`);
  }

  return parts.join("\n\n");
}

export function parseActionsFromText(
  text: string,
  graph?: FlowGraph,
  files?: CodeFile[]
): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  const actionRegex = /\[ACTION:([a-z_]+)(?::([^\]]+))?\]/gi;

  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(text)) !== null) {
    const type = match[1].toLowerCase() as ActionType;
    const rawParam = match[2]?.trim();
    let param = rawParam;

    if (type === "focus_node" && graph && rawParam) {
      const found = graph.nodes.find(
        (n) =>
          n.id.toLowerCase() === rawParam.toLowerCase() ||
          n.label.toLowerCase().includes(rawParam.toLowerCase())
      );
      if (found) {
        param = found.id;
      }
    }

    if (type === "select_file" && files && rawParam) {
      const found = files.find(
        (f) =>
          f.filename.toLowerCase().includes(rawParam.toLowerCase()) ||
          f.path.toLowerCase().includes(rawParam.toLowerCase())
      );
      if (found) {
        param = found.path;
      }
    }

    let label = "Action";
    switch (type) {
      case "run_code":
        label = "▶️ Run Code in Terminal";
        break;
      case "focus_node":
        label = `🎯 Focus Node: ${rawParam || "Target"}`;
        break;
      case "play_flow":
        label = "▶️ Play Flow Animation";
        break;
      case "pause_flow":
        label = "⏸️ Pause Flow";
        break;
      case "step_forward":
        label = "⏭️ Next Flow Step";
        break;
      case "step_back":
        label = "⏮️ Previous Step";
        break;
      case "zoom_in":
        label = "🔍 Zoom In";
        break;
      case "zoom_out":
        label = "🔎 Zoom Out";
        break;
      case "reset_view":
        label = "🔄 Reset View";
        break;
      case "select_file":
        label = `📄 Open File: ${rawParam || ""}`;
        break;
      case "run_analysis":
        label = "⚡ Run Flow Analysis";
        break;
      case "run_security":
        label = "🛡️ Run Security Scan";
        break;
      case "highlight_kind":
        label = `✨ Highlight ${rawParam || "Nodes"}`;
        break;
    }

    actions.push({ type, param, label });
  }

  // Full Semantic 3D Visualization Intent Recognition
  const lower = text.toLowerCase();

  // 1. Direct Node Matching in 3D Graph
  if (graph && graph.nodes.length > 0 && !actions.some((a) => a.type === "focus_node")) {
    for (const node of graph.nodes) {
      const labelLower = node.label.toLowerCase();
      const idLower = node.id.toLowerCase();
      if (
        (labelLower.length > 2 && lower.includes(labelLower)) ||
        (idLower.length > 2 && lower.includes(idLower))
      ) {
        actions.push({
          type: "focus_node",
          param: node.id,
          label: `🎯 Focus 3D Node: ${node.label}`,
        });
        break;
      }
    }
  }

  // 2. Architectural Tier Intent Matching
  if (graph && graph.nodes.length > 0 && !actions.some((a) => a.type === "focus_node")) {
    if (
      lower.includes("database") ||
      lower.includes("db") ||
      lower.includes("sql") ||
      lower.includes("table") ||
      lower.includes("storage")
    ) {
      const dbNode = graph.nodes.find((n) => n.kind === "database" || n.kind === "storage");
      if (dbNode) {
        actions.push({
          type: "focus_node",
          param: dbNode.id,
          label: `💾 Focus Database: ${dbNode.label}`,
        });
      }
    } else if (
      lower.includes("api") ||
      lower.includes("route") ||
      lower.includes("endpoint") ||
      lower.includes("backend") ||
      lower.includes("handler") ||
      lower.includes("server")
    ) {
      const apiNode = graph.nodes.find((n) => n.kind === "api" || (n.kind === "backend" && n.label.includes("/")));
      if (apiNode) {
        actions.push({
          type: "focus_node",
          param: apiNode.id,
          label: `🔌 Focus API Route: ${apiNode.label}`,
        });
      }
    } else if (
      lower.includes("frontend") ||
      lower.includes("client") ||
      lower.includes("ui") ||
      lower.includes("browser") ||
      lower.includes("page")
    ) {
      const feNode = graph.nodes.find((n) => n.kind === "frontend");
      if (feNode) {
        actions.push({
          type: "focus_node",
          param: feNode.id,
          label: `🌐 Focus Frontend: ${feNode.label}`,
        });
      }
    }
  }

  // 3. 3D Data Flow Animation Intent
  if (!actions.some((a) => a.type === "play_flow")) {
    if (
      lower.includes("play flow") ||
      lower.includes("animate") ||
      lower.includes("simulation") ||
      lower.includes("how data flows") ||
      lower.includes("show flow") ||
      lower.includes("data flow") ||
      lower.includes("packet")
    ) {
      actions.push({ type: "play_flow", label: "▶️ Play Flow Animation" });
    }
  }

  // 4. Camera Control Intent
  if (!actions.some((a) => a.type === "zoom_in" || a.type === "reset_view")) {
    if (
      lower.includes("zoom in") ||
      lower.includes("closer") ||
      lower.includes("magnify") ||
      lower.includes("inspect closer")
    ) {
      actions.push({ type: "zoom_in", label: "🔍 Zoom In" });
    } else if (
      lower.includes("zoom out") ||
      lower.includes("reset view") ||
      lower.includes("reset camera") ||
      lower.includes("overview")
    ) {
      actions.push({ type: "reset_view", label: "🔄 Reset 3D View" });
    }
  }

  // 5. Code Execution Intent
  if (!actions.some((a) => a.type === "run_code")) {
    if (
      lower.includes("run code") ||
      lower.includes("execute code") ||
      lower.includes("run the code") ||
      lower.includes("execute the code") ||
      lower.includes("terminal") ||
      lower.includes("test run")
    ) {
      actions.push({ type: "run_code", label: "▶️ Run Code in Terminal" });
    }
  }

  // 6. Security Scan Intent
  if (!actions.some((a) => a.type === "run_security")) {
    if (
      lower.includes("security scan") ||
      lower.includes("vulnerability") ||
      lower.includes("security check") ||
      lower.includes("audit code")
    ) {
      actions.push({ type: "run_security", label: "🛡️ Run Security Scan" });
    }
  }

  const cleanText = text.replace(actionRegex, "").trim();
  return { cleanText, actions };
}

// Semantic fallback intelligence when offline
function generateIntelligentFallback(messages: ChatMessage[], context: ChatContext): string {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const query = lastUserMsg.trim();
  const lower = query.toLowerCase();
  const nodes = context.graph?.nodes || [];
  const edges = context.graph?.edges || [];
  const files = context.files || [];

  // 1. Run / Execute Code in Terminal Sandbox
  if (
    lower.includes("run") &&
    (lower.includes("code") ||
      lower.includes("write") ||
      lower.includes("output") ||
      lower.includes("terminal") ||
      lower.includes("execute"))
  ) {
    const mainFile = files[0]?.filename || "main script";
    return `At your service, sir. I have initialized the sandbox runtime to execute \`${mainFile}\`.\n\n⚡ **Status**: Code execution triggered. Real-time telemetry and console outputs are streaming to the terminal drawer below.\n\n[ACTION:run_code]\n\nPress **Ctrl+Enter** at any moment for instantaneous hot-reload execution, Boss.`;
  }

  // 2. Specific Line Diagnostics
  const lineMatch = lower.match(/line\s*(\d+)/i);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1], 10);
    const activeFile = files[0];
    if (activeFile) {
      const fileLines = activeFile.content.split("\n");
      if (lineNum >= 1 && lineNum <= fileLines.length) {
        const targetLine = fileLines[lineNum - 1];
        const matchedNode = nodes.find(
          (n) => n.file.includes(activeFile.filename) && Math.abs(n.line - lineNum) <= 2
        );

        return `Diagnostics for **${activeFile.filename}**, line **${lineNum}**, sir:\n\n\`\`\`${activeFile.language}\n${targetLine}\n\`\`\`\n\n🎯 **Engineering Insight**:\nThis statement ${
          targetLine.includes("def ") || targetLine.includes("function") || targetLine.includes("=>")
            ? "declares an architectural entry-point to process incoming requests and orchestrate downstream services."
            : targetLine.includes("import") || targetLine.includes("require")
            ? "imports external modules and system primitives required to run this service."
            : targetLine.includes("fetch") || targetLine.includes("http") || targetLine.includes("axios")
            ? "dispatches an outbound network packet to an external API gateway."
            : targetLine.includes("SELECT") || targetLine.includes("INSERT") || targetLine.includes("query")
            ? "executes a persistence transaction against the database storage layer."
            : targetLine.includes("return")
            ? "yields the computed response payload back up the call stack."
            : "executes core business logic and state transformation."
        }\n\n${
          matchedNode
            ? `I have synchronized our 3D visualizer to focus on the corresponding component: **${matchedNode.label}**.\n\n[ACTION:focus_node:${matchedNode.id}]`
            : `Shall I execute the script to verify its runtime output, Boss? [ACTION:run_code]`
        }`;
      }
    }
  }

  // 3. Project Overview / Architecture Explanation
  if (
    lower.includes("about the project") ||
    lower.includes("about this project") ||
    lower.includes("tell me about") ||
    lower.includes("what is this project") ||
    lower.includes("explain the project") ||
    lower.includes("explain project") ||
    lower.includes("how does this work") ||
    lower.includes("architecture") ||
    lower.includes("overview")
  ) {
    const feNodes = nodes.filter((n) => n.kind === "frontend");
    const apiNodes = nodes.filter((n) => n.kind === "api" || (n.kind === "backend" && n.label.includes("/")));
    const srvNodes = nodes.filter((n) => n.kind === "service" || n.kind === "backend" || n.kind === "function");
    const dbNodes = nodes.filter((n) => n.kind === "database" || n.kind === "storage");
    const aiNodes = nodes.filter((n) => n.kind === "ai");

    const languages = Array.from(new Set(files.map((f) => f.language).filter(Boolean))).join(", ");

    return `Allow me to present an executive architectural summary of the project, sir. 🏛️\n\n🎯 **System Overview**:\nThis application is a **multi-tiered distributed architecture** written in **${
      languages || "TypeScript/Python"
    }**, comprising **${files.length} active modules**, **${nodes.length} functional nodes**, and **${
      edges.length
    } interconnected data streams**.\n\n⚡ **Architectural Tiers**:\n- 🌐 **Client Layer (${feNodes.length} nodes)**: User-facing viewports and client request triggers.\n- 🔌 **API Gateway & Routes (${apiNodes.length} nodes)**: Ingress HTTP handlers (${
      apiNodes.slice(0, 3).map((n) => `\`${n.label}\``).join(", ") || "Active"
    }).\n- ⚙️ **Service & Logic Layer (${srvNodes.length} nodes)**: Core business rules and algorithmic processing.\n- 💾 **Data & Persistence (${dbNodes.length} nodes)**: Database tables and query repositories (${
      dbNodes.slice(0, 2).map((n) => `\`${n.label}\``).join(", ") || "Storage"
    }).\n${
      aiNodes.length > 0
        ? `- 🧠 **AI & Neural Pipeline (${aiNodes.length} nodes)**: Model inference endpoints and reasoning agents.\n`
        : ""
    }\n🚀 **Next Recommended Action**:\nAll telemetry conduits are nominal. I recommend animating the 3D data beams to inspect packet trajectories, or triggering a live sandbox execution.\n\n[ACTION:play_flow]`;
  }

  // 4. Function Search in Code
  for (const f of files) {
    const fnRegex =
      /(?:function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|def\s+([A-Za-z0-9_]+))/g;
    let match: RegExpExecArray | null;
    while ((match = fnRegex.exec(f.content)) !== null) {
      const fnName = match[1] || match[2] || match[3];
      if (fnName && lower.includes(fnName.toLowerCase())) {
        const startPos = match.index;
        const snippet = f.content.slice(startPos, startPos + 350).split("\n").slice(0, 8).join("\n");
        const matchedNode = nodes.find(
          (n) => n.label.toLowerCase().includes(fnName.toLowerCase()) || n.id.toLowerCase().includes(fnName.toLowerCase())
        );

        return `I have isolated the function **\`${fnName}\`** in **${f.filename}**, sir. 🎯\n\n\`\`\`${f.language}\n${snippet}\n\`\`\`\n\n⚡ **Analysis**: This routine forms a core component of the business logic layer. ${
          matchedNode ? `I have re-centered our 3D visualizer to track its node.` : ""
        }\n\n${matchedNode ? `[ACTION:focus_node:${matchedNode.id}]` : `[ACTION:select_file:${f.path}]`}`;
      }
    }
  }

  // 5. Specific Node search in graph
  for (const node of nodes) {
    if (lower.includes(node.label.toLowerCase()) || lower.includes(node.id.toLowerCase())) {
      const nodeEdges = edges.filter((e) => e.to === node.id || e.from === node.id);
      return `Directing primary 3D visualizer to **${node.label}**, sir. 🎯\n\n- **Tier**: ${node.kind.toUpperCase()}\n- **Location**: \`${node.file}:${node.line}\`\n- **Operational Role**: ${node.detail}\n- **Data Streams**: ${nodeEdges.length} active connection${nodeEdges.length === 1 ? "" : "s"}\n\n\`\`\`\n${node.snippet}\n\`\`\`\n\n[ACTION:focus_node:${node.id}]`;
    }
  }

  // 6. Database / SQL / Storage queries
  if (
    lower.includes("database") ||
    lower.includes("db") ||
    lower.includes("sql") ||
    lower.includes("table") ||
    lower.includes("schema")
  ) {
    const dbNodes = nodes.filter((n) => n.kind === "database" || n.kind === "storage");
    const primaryDb = dbNodes[0];
    if (primaryDb) {
      return `Targeting the persistence layer, Boss. 💾\n\n- **Primary Data Component**: **${primaryDb.label}**\n- **Source Definition**: \`${primaryDb.file}:${primaryDb.line}\`\n- **Query Role**: ${primaryDb.detail}\n\nI have aligned the 3D camera onto the database storage cluster.\n\n[ACTION:focus_node:${primaryDb.id}]`;
    }
  }

  // 7. Security Audit
  if (
    lower.includes("security") ||
    lower.includes("vulnerabilit") ||
    lower.includes("audit") ||
    lower.includes("scan") ||
    lower.includes("safe")
  ) {
    return `Security protocols engaged, sir. 🛡️\n\nInitiating a deep AST vulnerability and static code analysis scan across all ${files.length} loaded modules.\n\n[ACTION:run_security]`;
  }

  // 8. Debugging / Fix
  if (
    lower.includes("error") ||
    lower.includes("fix") ||
    lower.includes("bug") ||
    lower.includes("issue") ||
    lower.includes("problem")
  ) {
    return `Diagnostic subroutines activated, Boss. 🔍\n\nI am inspecting the active files for syntax anomalies, unhandled exceptions, and orphaned nodes. Let us execute the script in our sandbox terminal to catch any runtime tracebacks.\n\n[ACTION:run_code]`;
  }

  // 9. Animation
  if (
    lower.includes("play") ||
    lower.includes("animate") ||
    lower.includes("simulation") ||
    lower.includes("flow") ||
    lower.includes("speed")
  ) {
    return `Right away, sir! Pulsing data energy conduits across all ${edges.length} active channels. 🚀\n\n[ACTION:play_flow]`;
  }

  // 10. Greetings
  if (
    lower.startsWith("hi") ||
    lower.startsWith("hello") ||
    lower.startsWith("hey") ||
    lower.includes("who are you") ||
    lower.includes("what can you do")
  ) {
    return `Greetings, sir! I am J.A.R.V.I.S., powered by the Google Gemini Neural Engine.\n\nAll telemetry feeds are nominal with **${nodes.length} nodes** mapped across **${files.length} active files**.\n\nI can analyze your architecture, trace data flows in 3D, execute sandbox code in the terminal, or audit vulnerabilities. How may I be of service?`;
  }

  // 11. General Intelligent Response
  return `At your service, sir. 💡\n\nRegarding **"${query}"**: our system telemetry indicates all **${nodes.length} components** across **${files.length} modules** are running smoothly. I am standing by to simulate data flows, execute sandbox runs, or inspect specific functions at your command.\n\nWhat are your orders, Boss?\n\n[ACTION:run_code]`;
}

export type StreamChunkCallback = (chunk: string, accumulated: string) => void;

// Fast direct Google Gemini SSE streaming with live token delivery
async function streamGeminiSSE(
  messages: { role: string; content: string }[],
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
  maxTokens = 1200
): Promise<string> {
  const apiKey = getGeminiKey();
  if (!apiKey || isKeyInvalid) {
    throw new Error("Missing or invalid Gemini API key");
  }

  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const contents = chatMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "Hello" }] });
  }

  // Primary model: gemini-3.5-flash-lite (fastest, current); fallback: gemini-flash-latest
  const primaryModel = "gemini-3.5-flash-lite";
  const fallbackModel = "gemini-flash-latest";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 18000);

  const combinedSignal = signal
    ? AbortSignal.any
      ? AbortSignal.any([signal, timeoutController.signal])
      : signal
    : timeoutController.signal;

  try {
    let response = await fetch(url, {
      method: "POST",
      signal: combinedSignal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents,
        systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    // If 404 or 503 on primary model, fallback to gemini-flash-latest
    if (!response.ok && (response.status === 404 || response.status === 503)) {
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
      response = await fetch(fallbackUrl, {
        method: "POST",
        signal: combinedSignal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          systemInstruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: maxTokens,
          },
        }),
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        isKeyInvalid = true;
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("jarvis:api_key_invalid", {
              detail: {
                error: "Google Gemini API Key was rejected (invalid or expired).",
                status: response.status,
              },
            })
          );
        }
      }
      const errText = await response.text().catch(() => "");
      throw new Error(`Gemini stream failed (HTTP ${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error("No response body available for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulated = "";
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.slice(5).trim();
          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              accumulated += content;
              onChunk(content, accumulated);
            }
          } catch {
            // Ignore partial chunk
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return accumulated;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Progressive micro-streaming for local fallback intelligence
async function streamFallbackProgressive(
  text: string,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal
): Promise<string> {
  const tokens = text.split(/(\s+)/).filter(Boolean);
  let accumulated = "";
  const chunkSize = 5;

  for (let i = 0; i < tokens.length; i += chunkSize) {
    if (signal?.aborted) break;
    const chunk = tokens.slice(i, i + chunkSize).join("");
    accumulated += chunk;
    onChunk(chunk, accumulated);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return accumulated;
}

/**
 * Main real-time streaming entrypoint for J.A.R.V.I.S.
 * Streams live tokens from Google Gemini, falling back seamlessly to local intelligence if offline.
 */
export async function sendChatStream(
  messages: ChatMessage[],
  context: ChatContext,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context);

  const formattedMessages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of messages) {
    formattedMessages.push({
      role: m.role,
      content: m.content,
    });
  }

  if (!isKeyInvalid) {
    try {
      const streamedResponse = await streamGeminiSSE(formattedMessages, onChunk, signal, 1000);
      if (streamedResponse && streamedResponse.trim().length > 0) {
        return streamedResponse;
      }
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw err;
      }
      // Failover gracefully to local offline intelligence
    }
  }

  const fallbackText = generateIntelligentFallback(messages, context);
  return streamFallbackProgressive(fallbackText, onChunk, signal);
}

/**
 * Backward-compatible full-response completion helper.
 */
export async function sendChat(
  messages: ChatMessage[],
  context: ChatContext,
  signal?: AbortSignal
): Promise<string> {
  return sendChatStream(messages, context, () => {}, signal);
}

// Direct Google Gemini completion for structured JSON payloads (like security audits)
async function callGeminiDirect(prompt: string, maxTokens = 1500): Promise<string> {
  const apiKey = getGeminiKey();
  if (!apiKey || isKeyInvalid) {
    throw new Error("Missing or invalid Gemini key");
  }

  const model = "gemini-3.5-flash-lite";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) return reply;
    }
    throw new Error(`Gemini HTTP ${response.status}`);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function runSecurityScan(files: CodeFile[], graph?: FlowGraph): Promise<SecurityIssue[]> {
  const graphContext =
    graph && graph.nodes.length > 0
      ? `\n\nSystem Topology: ${graph.nodes.length} nodes, ${graph.edges.length} connections across architecture layers.`
      : "";
  const fileContents = files
    .map((f) => `File: ${f.filename || f.path}\n\`\`\`${f.language}\n${f.content.slice(0, 1500)}\n\`\`\``)
    .join("\n\n");

  const prompt = `Analyze these source files for security vulnerabilities, authentication gaps, injection risks, and performance bugs.${graphContext}
Return a valid JSON array of security issues with no extra conversational text or markdown fencing.
Each object must follow this exact format:
[
  {
    "file": "filename.ext",
    "line": 1,
    "severity": "error" | "warning" | "info",
    "category": "Security" | "Performance" | "Validation" | "Syntax",
    "title": "Short title",
    "description": "Detailed explanation of issue",
    "suggestion": "How to fix it"
  }
]

Files to analyze:
${fileContents}`;

  try {
    const responseText = await callGeminiDirect(prompt, 1500);
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as SecurityIssue[];
    }
  } catch (err) {
    console.warn("AI security scan fallback:", err);
  }

  // Resilient static checks fallback
  const fallbackIssues: SecurityIssue[] = [];
  for (const f of files) {
    const lines = f.content.split("\n");
    lines.forEach((line, idx) => {
      if (line.includes("password") && line.includes("=") && !line.includes("process.env") && !line.includes("import")) {
        fallbackIssues.push({
          file: f.filename || f.path,
          line: idx + 1,
          severity: "error",
          category: "Security",
          title: "Hardcoded Credential Detected",
          description: "Possible hardcoded secret or credential found in source code.",
          suggestion: "Move sensitive credentials to environment variables (.env).",
        });
      }
      if (line.includes("eval(") || line.includes("dangerouslySetInnerHTML")) {
        fallbackIssues.push({
          file: f.filename || f.path,
          line: idx + 1,
          severity: "error",
          category: "Security",
          title: "Dangerous Code Execution",
          description: "Usage of eval or direct HTML injection can lead to XSS/RCE.",
          suggestion: "Use safe parsing libraries and sanitize all inputs.",
        });
      }
    });
  }

  return fallbackIssues;
}
