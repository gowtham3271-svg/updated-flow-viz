export type NodeKind = "frontend" | "backend" | "database" | "function";

export interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  detail: string;
  snippet: string;
  line: number;
  file: string;
  layer: number;
}

export type EdgeKind = "request" | "query" | "response" | "call" | "import";

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label: string;
  detail: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type CodeLanguage =
  | "python"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "json"
  | "css"
  | "html"
  | "yaml"
  | "markdown"
  | "text"
  | "sql"
  | "bash"
  | "go"
  | "rust"
  | "java"
  | "c"
  | "cpp";

export interface CodeFile {
  filename: string;
  path: string;
  language: CodeLanguage;
  content: string;
}

export interface Annotation {
  nodeId: string;
  text: string;
}

export interface SavedProject {
  id: string;
  name: string;
  files: CodeFile[];
  graph: FlowGraph;
  annotations: Annotation[];
  camera_state: { position: [number, number, number]; target: [number, number, number] } | null;
  created_at: string;
  updated_at: string;
}

export const EDGE_COLORS: Record<EdgeKind, string> = {
  request: "#38bdf8",
  query: "#a78bfa",
  response: "#34d399",
  call: "#fbbf24",
  import: "#f472b6",
};

export const NODE_COLORS: Record<NodeKind, string> = {
  frontend: "#22d3ee",
  backend: "#38bdf8",
  database: "#a78bfa",
  function: "#fbbf24",
};

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
  language?: CodeLanguage;
}
