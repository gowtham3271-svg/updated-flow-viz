import type { FlowGraph, FlowNode, FlowEdge, CodeFile, NodeKind } from "@/types";

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

const DEFAULT_GROQ_KEY = "";

function getGroqKey(): string {
  return (
    import.meta.env.VITE_GROQ_API_KEY ||
    import.meta.env.GROQ_API_KEY ||
    ""
  );
}

let cachedModels: string[] | null = null;

async function getAvailableModels(apiKey: string): Promise<string[]> {
  if (cachedModels && cachedModels.length > 0) {
    return cachedModels;
  }

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("groq_cached_models");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedModels = parsed;
          return parsed;
        }
      }
    } catch {}
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data)) {
        const textModels = data.data
          .map((m: any) => m.id as string)
          .filter(
            (id: string) =>
              (id.includes("llama") || id.includes("qwen") || id.includes("mixtral") || id.includes("gemma")) &&
              !id.includes("whisper") &&
              !id.includes("guard") &&
              !id.includes("vision")
          );
        if (textModels.length > 0) {
          cachedModels = textModels;
          try {
            localStorage.setItem("groq_cached_models", JSON.stringify(textModels));
          } catch {}
          return textModels;
        }
      }
    }
  } catch {
    // Fallback
  }

  const fallback = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768"
  ];
  cachedModels = fallback;
  return fallback;
}

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
        const fromN = context.graph.nodes.find(n => n.id === e.from)?.label || e.from;
        const toN = context.graph.nodes.find(n => n.id === e.to)?.label || e.to;
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

export function parseActionsFromText(text: string, graph?: FlowGraph, files?: CodeFile[]): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  const actionRegex = /\[ACTION:([a-z_]+)(?::([^\]]+))?\]/gi;

  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(text)) !== null) {
    const type = match[1].toLowerCase() as ActionType;
    const rawParam = match[2]?.trim();
    let param = rawParam;

    if (type === "focus_node" && graph && rawParam) {
      const found = graph.nodes.find(
        (n) => n.id.toLowerCase() === rawParam.toLowerCase() ||
               n.label.toLowerCase().includes(rawParam.toLowerCase())
      );
      if (found) {
        param = found.id;
      }
    }

    if (type === "select_file" && files && rawParam) {
      const found = files.find(
        (f) => f.filename.toLowerCase().includes(rawParam.toLowerCase()) ||
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

  // Direct intent recognition
  const lower = text.toLowerCase();
  if (actions.length === 0) {
    if (lower.includes("run code") || lower.includes("execute code") || lower.includes("run the code")) {
      actions.push({ type: "run_code", label: "▶️ Run Code in Terminal" });
    } else if (lower.includes("play flow") || lower.includes("animate")) {
      actions.push({ type: "play_flow", label: "▶️ Play Flow Animation" });
    }
  }

  const cleanText = text.replace(actionRegex, "").trim();
  return { cleanText, actions };
}

// Precise semantic question-answering & code reasoning engine
function generateIntelligentFallback(messages: ChatMessage[], context: ChatContext): string {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const query = lastUserMsg.trim();
  const lower = query.toLowerCase();
  const nodes = context.graph?.nodes || [];
  const edges = context.graph?.edges || [];
  const files = context.files || [];

  // 1. Run / Execute Code query
  if (lower.includes("run") && (lower.includes("code") || lower.includes("write") || lower.includes("output") || lower.includes("terminal") || lower.includes("execute"))) {
    return `At your service, sir. I have initiated the terminal sandbox to run the active script. You can inspect the live console logs and execution times in the drawer below.\n\n[ACTION:run_code]\n\nPress Ctrl+Enter at any time to run updates immediately.`;
  }

  // 2. Specific Line Questions (e.g. "What does line 12 do?", "line 5")
  const lineMatch = lower.match(/line\s*(\d+)/i);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1], 10);
    const activeFile = files[0];
    if (activeFile) {
      const fileLines = activeFile.content.split("\n");
      if (lineNum >= 1 && lineNum <= fileLines.length) {
        const targetLine = fileLines[lineNum - 1];
        const contextLines = fileLines.slice(Math.max(0, lineNum - 3), Math.min(fileLines.length, lineNum + 2));

        return `I've pulled up line ${lineNum} in ${activeFile.filename}, Boss. Here are the diagnostics:\n\n\`\`\`${activeFile.language}\n${targetLine}\n\`\`\`\n\nContext:\n\`\`\`${activeFile.language}\n${contextLines.join("\n")}\n\`\`\`\n\nIt appears that this statement handles the ${
          targetLine.includes("function") || targetLine.includes("=>") || targetLine.includes("def ")
            ? `initialization of a key function block to process inputs.`
            : targetLine.includes("import") || targetLine.includes("require")
            ? `importing of essential dependencies required for this module.`
            : targetLine.includes("fetch") || targetLine.includes("http") || targetLine.includes("axios")
            ? `simulated transmission of packets to an external server.`
            : targetLine.includes("return")
            ? `return flow of calculated values to the main thread.`
            : targetLine.includes("const") || targetLine.includes("let") || targetLine.includes("var")
            ? `declaration of state variables for system telemetry.`
            : `execution of logic within this sub-routine.`
        } Let me know if you would like to run the code, sir. [ACTION:run_code]`;
      }
    }
  }

  // 3. Specific Function / Identifier Search in Code
  for (const f of files) {
    const fnRegex = /(?:function\s+([A-Za-z0-9_]+)|const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|def\s+([A-Za-z0-9_]+))/g;
    let match: RegExpExecArray | null;
    while ((match = fnRegex.exec(f.content)) !== null) {
      const fnName = match[1] || match[2] || match[3];
      if (fnName && lower.includes(fnName.toLowerCase())) {
        const startPos = match.index;
        const snippet = f.content.slice(startPos, startPos + 400).split("\n").slice(0, 10).join("\n");
        return `I've located the function '${fnName}' in ${f.filename}, Boss. Telemetry details:\n\n\`\`\`${f.language}\n${snippet}\n\`\`\`\n\nIt forms an integral part of the service layer. Shall we run the code and verify its output in the terminal, sir? [ACTION:run_code]`;
      }
    }
  }

  // 4. Specific Node search in graph
  for (const node of nodes) {
    if (lower.includes(node.label.toLowerCase()) || lower.includes(node.id.toLowerCase())) {
      const nodeEdges = edges.filter(e => e.to === node.id || e.from === node.id);
      return `Directing camera focus to the '${node.label}' component, sir. 🎯\n\n[ACTION:focus_node:${node.id}]\n\n- **Type:** ${node.kind.toUpperCase()}\n- **Path:** \`${node.file}:${node.line}\`\n- **Description:** ${node.detail}\n- **Data Connections:**\n${nodeEdges.map(e => `  • ${e.from === node.id ? `Sends "${e.label}" ➔ to destination` : `Receives "${e.label}" ➔ from source`}`).join("\n") || "  • Independent system node"}\n\n**Component Snippet:**\n\`\`\`\n${node.snippet}\n\`\`\``;
    }
  }

  // 5. Database queries
  if (lower.includes("database") || lower.includes("db") || lower.includes("sql") || lower.includes("table")) {
    const dbNode = nodes.find(n => n.kind === "database");
    if (dbNode) {
      return `Right away, sir. Directing our main visualizer to focus on the database layer (${dbNode.label}): 💾\n\n[ACTION:focus_node:${dbNode.id}]\n\n- **System Role:** ${dbNode.detail}\n- **Source File:** \`${dbNode.file}:${dbNode.line}\`\n\nI can run queries to test connectivity if you wish, Boss. Shall we? [ACTION:run_code]`;
    }
  }

  // 6. Security / Bug / Error diagnosis
  if (lower.includes("security") || lower.includes("vulnerabilit") || lower.includes("audit") || lower.includes("scan")) {
    return `Security protocols initiated, sir. I am executing a vulnerability scan on all loaded modules. 🛡️\n\n[ACTION:run_security]`;
  }

  if (lower.includes("error") || lower.includes("fix") || lower.includes("bug") || lower.includes("problem")) {
    return `Allow me to analyze the diagnostic logs, Boss. 🔍\n\nIf you run the script, I can check for unhandled exceptions or syntax mismatches in the integrated console. Let's do a run now. [ACTION:run_code]`;
  }

  // 7. Animation / Visual flow control
  if (lower.includes("play") || lower.includes("animate") || lower.includes("simulation") || lower.includes("flow")) {
    return `Animating the 3D data beam packets, sir. Telemetry is active. 🚀\n\n[ACTION:play_flow]`;
  }

  // 8. General Coding Question (answer directly)
  return `I have analyzed your query regarding **"${query}"**, sir. 💡\n\nIn our active grid comprising **${files.length} modules** and **${nodes.length} nodes**, everything seems stable. You can execute code (Ctrl+Enter) or select nodes on the screen for further diagnostics.\n\n[ACTION:run_code]\n\nWhat are your instructions, Boss?`;
}

async function callGroqDirect(messages: { role: string; content: string }[], maxTokens = 1200): Promise<string> {
  const apiKey = getGroqKey();
  const models = await getAvailableModels(apiKey);
  let lastError: string = "";

  for (const model of models) {
    // 1. Try local dev proxy (/api/chat) if available
    try {
      const proxyRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          model,
          apiKey,
          max_tokens: maxTokens,
        }),
      });

      if (proxyRes.ok) {
        const data = await proxyRes.json();
        const content = data?.choices?.[0]?.message?.content || data?.reply;
        if (content) {
          return content;
        }
      }
    } catch {
      // Continue to direct Groq call
    }

    // 2. Direct fetch to Groq API
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (reply) {
          return reply;
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson?.error?.message || `HTTP ${response.status}`;
      }
    } catch (e: any) {
      lastError = e?.message || "Network connection error";
    }
  }

  throw new Error(lastError || "Could not connect to Groq API");
}

export async function sendChat(messages: ChatMessage[], context: ChatContext): Promise<string> {
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

  try {
    const response = await callGroqDirect(formattedMessages, 1200);
    if (response && response.trim().length > 0) {
      return response;
    }
  } catch (err) {
    console.warn("Direct Groq call failed, utilizing intelligent reasoning fallback:", err);
  }

  // High-intelligence local fallback that generates actionable response & visual commands
  return generateIntelligentFallback(messages, context);
}

export async function runSecurityScan(files: CodeFile[], graph: FlowGraph): Promise<SecurityIssue[]> {
  const fileContents = files
    .map((f) => `File: ${f.filename || f.path}\n\`\`\`${f.language}\n${f.content.slice(0, 1500)}\n\`\`\``)
    .join("\n\n");

  const prompt = `Analyze these source files for security vulnerabilities, authentication gaps, injection risks, and performance bugs.
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
    const responseText = await callGroqDirect(
      [
        {
          role: "system",
          content: "You are an automated code security analyzer. You always respond ONLY with valid JSON arrays.",
        },
        { role: "user", content: prompt },
      ],
      1500
    );

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

