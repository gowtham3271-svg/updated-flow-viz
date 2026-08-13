import type { FlowGraph, FlowNode, FlowEdge, CodeFile } from "@/types";

export interface ChatMessage {
  role: "user" | "assistant";
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

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${ANON_KEY}`,
  "apikey": ANON_KEY,
});

export async function sendChat(messages: ChatMessage[], context: ChatContext): Promise<string> {
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ messages, context }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error ?? `Request failed (${response.status})`);
  }

  const data = await response.json();
  if (typeof data.reply !== "string") {
    throw new Error("Unexpected response from chat service.");
  }
  return data.reply;
}

export async function runSecurityScan(files: CodeFile[], graph: FlowGraph): Promise<SecurityIssue[]> {
  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messages: [{ role: "user", content: "Scan all provided code files for security vulnerabilities and best practice issues. Return the results as a JSON array." }],
      context: { files, graph, mode: "security" },
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error ?? `Security scan failed (${response.status})`);
  }

  const data = await response.json();
  if (Array.isArray(data.issues)) {
    return data.issues as SecurityIssue[];
  }
  return [];
}
