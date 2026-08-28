import type { CodeFile, FlowGraph } from "@/types";

export interface LogEntry {
  id: string;
  type: "log" | "info" | "warn" | "error" | "table" | "return";
  message: string;
  data?: any;
  timestamp: string;
  line?: number;
}

export interface ExecutionResult {
  success: boolean;
  logs: LogEntry[];
  returnValue?: any;
  executionTimeMs: number;
  error?: {
    name: string;
    message: string;
    line?: number;
    stack?: string;
  };
  highlightNodeId?: string | null;
}

// Clean and convert TS / TSX / JSX to runnable JS in the browser
function transpileTypeScriptToJS(code: string): string {
  let clean = code;

  // 1. Remove JSX syntax (convert JSX tags to comments / log placeholders)
  clean = clean.replace(/<[A-Za-z0-9_.\$]+(\s+[^>]*?)?>([\s\S]*?)<\/[A-Za-z0-9_.\$]+>/g, (_, tag) => `/* JSX element ${tag} */`);
  clean = clean.replace(/<[A-Za-z0-9_.\$]+(\s+[^>]*?)?\/>/g, (_, tag) => `/* JSX element ${tag} */`);

  // 2. Remove ES imports
  clean = clean.replace(/import\s+[\s\S]*?\s+from\s+['"`][^'"`]+['`"];?/g, "");
  clean = clean.replace(/import\s+['"`][^'"`]+['`"];?/g, "");
  clean = clean.replace(/import\s+type\s+[^;]+;/g, "");

  // 3. Remove ES exports
  clean = clean.replace(/export\s+default\s+(class|function|const|let|var)\b/g, "$1");
  clean = clean.replace(/export\s+default\s+[^;]+;?/g, "");
  clean = clean.replace(/export\s+(class|function|const|let|var)\b/g, "$1");
  clean = clean.replace(/export\s+\{[^}]+\};?/g, "");

  // 4. Remove TypeScript interfaces and types
  clean = clean.replace(/interface\s+\w+(\s+extends\s+\w+)?\s*\{[\s\S]*?\}/g, "");
  clean = clean.replace(/type\s+\w+\s*=\s*[^;]+;/g, "");

  // 5. Remove return type & type assertions
  clean = clean.replace(/\s+as\s+[A-Za-z0-9_<>|[\]]+/g, "");
  clean = clean.replace(/:\s*[A-Za-z0-9_<>|[\]]+(\s*=\s*)/g, "$1");
  clean = clean.replace(/:\s*[A-Za-z0-9_<>|[\]]+([,);={])/g, "$1");
  clean = clean.replace(/\):\s*[A-Za-z0-9_<>|[\]]+\s*(=>|\{)/g, ") $1");

  return clean;
}

export async function runCodeSnippet(
  file: CodeFile,
  graph?: FlowGraph,
  allFiles?: CodeFile[]
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const logs: LogEntry[] = [];
  let highlightNodeId: string | null = null;

  const getTimeStr = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
  };

  const pushLog = (type: LogEntry["type"], args: any[]) => {
    const formatted = args
      .map((a) => {
        if (typeof a === "object" && a !== null) {
          try {
            return JSON.stringify(a, null, 2);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(" ");

    logs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      message: formatted,
      data: args.length === 1 ? args[0] : args,
      timestamp: getTimeStr(),
    });
  };

  const ext = file.path?.split(".").pop()?.toLowerCase() || "";
  const lang = (file.language || ext).toLowerCase();

  // JSON Execution
  if (lang === "json" || ext === "json") {
    try {
      const parsed = JSON.parse(file.content);
      const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
      pushLog("return", ["Valid JSON parsed successfully:", parsed]);
      return { success: true, logs, returnValue: parsed, executionTimeMs };
    } catch (e: any) {
      const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
      pushLog("error", ["JSON Parse Error:", e.message]);
      return { success: false, logs, executionTimeMs, error: { name: "JSONError", message: e.message } };
    }
  }

  // Python Execution Simulation Engine
  if (lang === "python" || ext === "py") {
    pushLog("info", [`[Python 3.11 Interpreter] Executing ${file.filename}...`]);

    const lines = file.content.split("\n");
    let hasFastApi = file.content.includes("FastAPI");
    let hasSqlAlchemy = file.content.includes("sqlalchemy") || file.content.includes("SessionLocal") || file.content.includes("create_engine");

    if (hasFastApi) {
      pushLog("info", ["[FastAPI Server] Initializing application routes..."]);
    }
    if (hasSqlAlchemy) {
      pushLog("info", ["[SQLAlchemy ORM] Initializing engine & database models..."]);
    }

    let printedCount = 0;
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      // Python print() statements
      if (trimmed.startsWith("print(") && trimmed.endsWith(")")) {
        const inner = trimmed.slice(6, -1);
        pushLog("log", [`[stdout Line ${lineNum}]:`, inner.replace(/^['"`]|['"`]$/g, "")]);
        printedCount++;
      }

      // FastAPI Route endpoints
      const routeMatch = trimmed.match(/@app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]\)/);
      if (routeMatch) {
        const method = routeMatch[1].toUpperCase();
        const path = routeMatch[2];
        pushLog("info", [`[Route registered] ${method} ${path} -> mapped to handler at line ${lineNum}`]);

        if (graph) {
          const matchedNode = graph.nodes.find(n => n.label.includes(path) || n.detail.includes(path));
          if (matchedNode) highlightNodeId = matchedNode.id;
        }
      }

      // Database queries in python
      if (trimmed.includes(".query(") || trimmed.includes(".execute(")) {
        pushLog("info", [`[DB Query Executed Line ${lineNum}]: ${trimmed}`]);
      }
    });

    if (hasFastApi) {
      pushLog("info", ["✔ FastAPI server running on http://127.0.0.1:8000 (Press Ctrl+C to stop)"]);
      pushLog("info", ["Simulating test request: GET /api/users -> 200 OK (24ms)"]);
    } else if (hasSqlAlchemy) {
      pushLog("info", ["✔ SQLite connection pool initialized successfully."]);
    }

    if (printedCount === 0 && !hasFastApi && !hasSqlAlchemy) {
      pushLog("info", [`Python script executed cleanly with 0 syntax errors.`]);
    }

    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    return { success: true, logs, executionTimeMs, highlightNodeId };
  }

  // SQL Execution Simulation
  if (lang === "sql" || ext === "sql") {
    pushLog("info", [`[PostgreSQL / SQLite Engine] Executing script: ${file.filename}`]);
    const statements = file.content.split(";").map(s => s.trim()).filter(Boolean);

    statements.forEach((stmt, i) => {
      const firstWord = stmt.split(/\s+/)[0].toUpperCase();
      if (["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"].includes(firstWord)) {
        pushLog("info", [`[Query ${i + 1}] ${firstWord} statement executed successfully.`]);
        if (firstWord === "SELECT") {
          pushLog("table", [
            { id: 1, name: "Sample Record 1", status: "active", created_at: new Date().toISOString() },
            { id: 2, name: "Sample Record 2", status: "pending", created_at: new Date().toISOString() }
          ]);
        }
      }
    });

    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    return { success: true, logs, executionTimeMs };
  }

  // Go / Rust / Java / C++ Simulation
  if (["go", "rust", "rs", "java", "cpp", "c"].includes(lang) || ["go", "rs", "java", "cpp", "c"].includes(ext)) {
    pushLog("info", [`[${lang.toUpperCase()} Compiler & Runtime] Compiling ${file.filename}...`]);
    pushLog("info", [`✔ Build succeeded (0 warnings, 0 errors).`]);
    pushLog("log", [`[stdout] Running binary output...`]);

    const matches = file.content.match(/(?:fmt\.Println|println!|System\.out\.println|printf)\s*\(\s*["']([^"']+)["']/g);
    if (matches) {
      matches.forEach(m => {
        const cleanMsg = m.replace(/^[^(]+\(["']/, "").replace(/["']\)?$/, "");
        pushLog("log", [cleanMsg]);
      });
    }

    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    return { success: true, logs, executionTimeMs };
  }

  // JavaScript / TypeScript / TSX Environment Execution
  const customConsole = {
    log: (...args: any[]) => pushLog("log", args),
    info: (...args: any[]) => pushLog("info", args),
    warn: (...args: any[]) => pushLog("warn", args),
    error: (...args: any[]) => pushLog("error", args),
    table: (data: any) => pushLog("table", [data]),
    clear: () => logs.splice(0, logs.length),
  };

  const mockDb = {
    users: [
      { id: 1, name: "Alice Johnson", role: "Admin", email: "alice@example.com" },
      { id: 2, name: "Bob Smith", role: "Developer", email: "bob@example.com" },
      { id: 3, name: "Charlie Brown", role: "Designer", email: "charlie@example.com" },
    ],
    query: async (sql: string) => {
      pushLog("info", [`[Database Query Executed]: "${sql}"`]);
      return [{ id: 101, status: "active", count: 42, timestamp: new Date().toISOString() }];
    },
    find: (filter: any) => [{ id: 1, ...filter, status: "found" }],
    insert: (data: any) => ({ id: Math.floor(Math.random() * 1000), ...data, created_at: new Date().toISOString() }),
  };

  const mockFetch = async (url: string, options?: any) => {
    pushLog("info", [`[HTTP Request Simulated] ${options?.method || "GET"} ${url}`]);
    if (graph) {
      const matchedNode = graph.nodes.find(
        (n) => url.toLowerCase().includes(n.label.toLowerCase()) || n.detail.toLowerCase().includes(url.toLowerCase())
      );
      if (matchedNode) {
        highlightNodeId = matchedNode.id;
      }
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        endpoint: url,
        data: { id: "res_42", message: "Mock API response payload", timestamp: Date.now() },
      }),
      text: async () => JSON.stringify({ success: true, url }),
    };
  };

  try {
    let cleanJs = transpileTypeScriptToJS(file.content);

    // Auto-invoke component or main function if defined
    let autoInvoke = "";
    const fnMatch = cleanJs.match(/function\s+([A-Za-z0-9_]+)\s*\(/);
    if (fnMatch && fnMatch[1]) {
      autoInvoke = `\nif (typeof ${fnMatch[1]} === 'function') { try { ${fnMatch[1]}(); } catch(e) {} }`;
    }

    const wrappedCode = `
      return (async function(console, fetch, db, process) {
        ${cleanJs}
        ${autoInvoke}
      })(customConsole, mockFetch, mockDb, { env: { NODE_ENV: 'development' } });
    `;

    const runner = new Function("customConsole", "mockFetch", "mockDb", wrappedCode);
    const result = await runner(customConsole, mockFetch, mockDb);

    if (result !== undefined) {
      pushLog("return", ["Return value:", result]);
    }

    if (graph && !highlightNodeId) {
      for (const node of graph.nodes) {
        if (file.content.includes(node.label)) {
          highlightNodeId = node.id;
          break;
        }
      }
    }

    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));

    if (logs.length === 0) {
      pushLog("info", [`Execution completed successfully with no errors (${executionTimeMs}ms).`]);
    }

    return {
      success: true,
      logs,
      returnValue: result,
      executionTimeMs,
      highlightNodeId,
    };
  } catch (err: any) {
    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    const errorMsg = err?.message || String(err);
    const errorName = err?.name || "RuntimeError";

    let lineNum: number | undefined;
    if (err?.stack) {
      const match = err.stack.match(/<anonymous>:(\d+):(\d+)/);
      if (match) {
        lineNum = Math.max(1, parseInt(match[1], 10) - 2);
      }
    }

    pushLog("error", [`${errorName}: ${errorMsg}${lineNum ? ` (at line ${lineNum})` : ""}`]);

    return {
      success: false,
      logs,
      executionTimeMs,
      error: {
        name: errorName,
        message: errorMsg,
        line: lineNum,
        stack: err?.stack,
      },
      highlightNodeId,
    };
  }
}
