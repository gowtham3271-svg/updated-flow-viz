import { describe, it, expect } from "vitest";
import { analyzeFiles, explainNode } from "../src/lib/analyzer";
import type { CodeFile } from "../src/types";

describe("Code Analyzer & Graph Generator", () => {
  it("analyzes empty file list without error", () => {
    const graph = analyzeFiles([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("handles malformed/syntax error files gracefully", () => {
    const files: CodeFile[] = [
      {
        name: "broken.py",
        filename: "broken.py",
        path: "broken.py",
        language: "python",
        content: "def broken_func( ::: @@@ !!\n   ??? %%%",
      },
    ];
    const graph = analyzeFiles(files);
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  it("detects Python FastAPI routes, database queries, and AI pipelines", () => {
    const files: CodeFile[] = [
      {
        name: "server.py",
        filename: "server.py",
        path: "server.py",
        language: "python",
        content: `
from fastapi import FastAPI
import openai

app = FastAPI()

@app.post("/api/v1/generate")
async def generate_response(prompt: str):
    response = openai.ChatCompletion.create(model="gpt-4", messages=[{"role": "user", "content": prompt}])
    return response

@app.get("/users")
def get_users():
    return db.query("SELECT * FROM users WHERE active = 1")
`,
      },
    ];

    const graph = analyzeFiles(files);

    // Should have nodes for backend route, database query, and AI pipeline
    expect(graph.nodes.length).toBeGreaterThan(0);

    const hasAiNode = graph.nodes.some((n) => n.kind === "ai" || n.label.toLowerCase().includes("ai") || n.label.toLowerCase().includes("openai"));
    const hasDbNode = graph.nodes.some((n) => n.kind === "database");
    const hasBackendNode = graph.nodes.some((n) => n.kind === "backend");

    expect(hasDbNode).toBe(true);
    expect(hasBackendNode).toBe(true);
    expect(hasAiNode).toBe(true);

    // Nodes corresponding to source code should have valid file and line metadata
    const sourceNodes = graph.nodes.filter((n) => n.file !== "");
    expect(sourceNodes.length).toBeGreaterThan(0);
    for (const node of sourceNodes) {
      expect(node.file).toBe("server.py");
      expect(node.line).toBeGreaterThan(0);
    }
  });

  it("detects JavaScript/TypeScript fetches and external APIs", () => {
    const files: CodeFile[] = [
      {
        name: "client.ts",
        filename: "client.ts",
        path: "client.ts",
        language: "typescript",
        content: `
async function fetchUserData(userId: string) {
  const res = await fetch("https://api.stripe.com/v1/charges");
  return res.json();
}

async function callGroqAI(text: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions");
  return res.json();
}
`,
      },
    ];

    const graph = analyzeFiles(files);
    expect(graph.nodes.length).toBeGreaterThan(0);

    const hasApiOrAi = graph.nodes.some((n) => n.kind === "api" || n.kind === "ai");
    expect(hasApiOrAi).toBe(true);
  });

  it("provides informative explanation for all node types", () => {
    const dummyNodes = [
      { id: "1", label: "GET /api/users", kind: "backend" as const, file: "a.py", line: 10, detail: "Route" },
      { id: "2", label: "users", kind: "database" as const, file: "a.py", line: 20, detail: "Query" },
      { id: "3", label: "Groq Llama 3", kind: "ai" as const, file: "a.py", line: 30, detail: "AI model" },
      { id: "4", label: "Stripe Gateway", kind: "api" as const, file: "a.py", line: 40, detail: "API endpoint" },
    ];
    const mockGraph = { nodes: dummyNodes, edges: [] };

    for (const node of dummyNodes) {
      const explanation = explainNode(node, mockGraph);
      expect(typeof explanation).toBe("string");
      expect(explanation.length).toBeGreaterThan(15);
    }
  });
});
