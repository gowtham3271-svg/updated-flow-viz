import type { CodeFile, FlowGraph, FlowNode, FlowEdge, NodeKind, EdgeKind } from "@/types";

let counter = 0;
const uid = (prefix: string) => `${prefix}_${counter++}_${Math.random().toString(36).slice(2, 7)}`;

interface RouteDef {
  id: string;
  path: string;
  method: string;
  funcName: string;
  file: string;
  line: number;
  snippet: string;
  isAsync: boolean;
}

interface QueryDef {
  id: string;
  text: string;
  funcRef: string | null;
  file: string;
  line: number;
  snippet: string;
}

interface FetchDef {
  id: string;
  url: string;
  method: string;
  file: string;
  line: number;
  snippet: string;
}

interface FuncDef {
  id: string;
  name: string;
  file: string;
  line: number;
  snippet: string;
  isAsync: boolean;
  kind: "function" | "component";
}

interface ImportDef {
  id: string;
  fromFile: string;
  importedFile: string | null;
  file: string;
  line: number;
  snippet: string;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function detectLanguage(filename: string): CodeFile["language"] {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "py") return "python";
  if (ext === "ts") return "typescript";
  if (ext === "tsx") return "tsx";
  if (ext === "jsx") return "jsx";
  if (ext === "go") return "go";
  if (ext === "rs") return "rust";
  if (ext === "java") return "java";
  if (ext === "c" || ext === "h") return "c";
  if (ext === "cpp" || ext === "cc" || ext === "hpp") return "cpp";
  return "javascript";
}

export function analyzeFiles(files: CodeFile[]): FlowGraph {
  counter = 0;
  const routes: RouteDef[] = [];
  const queries: QueryDef[] = [];
  const fetches: FetchDef[] = [];
  const funcs: FuncDef[] = [];
  const imports: ImportDef[] = [];

  for (const file of files) {
    const lang = file.language || detectLanguage(file.filename);
    const lines = file.content.split("\n");
    if (lang === "python") {
      analyzePython(lines, file.filename, file.path, routes, queries, funcs, imports);
    } else if (lang === "javascript" || lang === "typescript" || lang === "jsx" || lang === "tsx") {
      analyzeJS(lines, file.filename, file.path, routes, queries, fetches, funcs, imports);
    } else if (lang === "go") {
      analyzeGo(lines, file.filename, file.path, routes, queries, funcs, imports);
    } else if (lang === "rust") {
      analyzeRust(lines, file.filename, file.path, funcs, imports);
    } else if (lang === "java" || lang === "c" || lang === "cpp") {
      analyzeCFamily(lines, file.filename, file.path, funcs, imports);
    }
  }

  return buildGraph(routes, queries, fetches, funcs, imports, files);
}

function analyzePython(
  lines: string[],
  file: string,
  filePath: string,
  routes: RouteDef[],
  queries: QueryDef[],
  funcs: FuncDef[],
  imports: ImportDef[],
) {
  let currentFunc: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) {
      currentFunc = funcMatch[1];
      funcs.push({
        id: uid("fn"),
        name: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: trimmed.startsWith("async"),
        kind: "function",
      });
    }

    const routeShort = line.match(/@(?:app|router|bp|blueprint|api)\.(get|post|put|patch|delete|route|api_route)\s*\(\s*['"]([^'"]+)['"]/i);
    if (routeShort) {
      const method = routeShort[1].toUpperCase() === "ROUTE" ? "GET" : routeShort[1].toUpperCase();
      const path = routeShort[2];
      const nextLine = (lines[i + 1] || "").trim();
      const fnMatch = nextLine.match(/^(?:async\s+)?def\s+(\w+)/);
      const funcName = fnMatch ? fnMatch[1] : currentFunc ?? "handler";
      const exists = routes.some((r) => r.path === path && r.line === i + 1);
      if (!exists) {
        routes.push({
          id: uid("route"),
          path,
          method: method === "API_ROUTE" ? "GET" : method,
          funcName,
          file: filePath,
          line: i + 1,
          snippet: line.trim(),
          isAsync: nextLine.startsWith("async"),
        });
      }
    }

    const djangoRoute = line.match(/path\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/);
    if (djangoRoute) {
      routes.push({
        id: uid("route"),
        path: djangoRoute[1],
        method: "GET",
        funcName: djangoRoute[2],
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: false,
      });
    }

    const queryMatches = [...line.matchAll(/(?:execute|query|fetchone|fetchall|fetchmany|scalar|raw)\s*\(\s*['"`]([^'"`]+)['"`]/g)];
    for (const qm of queryMatches) {
      queries.push({
        id: uid("q"),
        text: qm[1],
        funcRef: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: line.trim(),
      });
    }

    const ormMatch = line.match(/\.(filter|get|all|create|update|delete|save|first|exists|count|objects)\s*\(/);
    if (ormMatch && currentFunc) {
      const op = ormMatch[1];
      queries.push({
        id: uid("q"),
        text: `Model.${op}()`,
        funcRef: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: line.trim(),
      });
    }

    const importMatch = trimmed.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
    if (importMatch) {
      imports.push({
        id: uid("imp"),
        fromFile: filePath,
        importedFile: importMatch[1] || importMatch[2].split(",")[0].trim(),
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }
  }
}

function analyzeJS(
  lines: string[],
  file: string,
  filePath: string,
  routes: RouteDef[],
  queries: QueryDef[],
  fetches: FetchDef[],
  funcs: FuncDef[],
  imports: ImportDef[],
) {
  let currentFunc: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const componentMatch =
      trimmed.match(/^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)\s*\(/) ||
      trimmed.match(/^(?:export\s+)?(?:const|let)\s+([A-Z]\w+)\s*=\s*(?:\(|function)/);
    if (componentMatch) {
      currentFunc = componentMatch[1];
      funcs.push({
        id: uid("fn"),
        name: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: trimmed.includes("async"),
        kind: "component",
      });
      continue;
    }

    const funcMatch =
      trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/) ||
      trimmed.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(.*?\)\s*=>/) ||
      trimmed.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?function/);
    if (funcMatch) {
      currentFunc = funcMatch[1];
      funcs.push({
        id: uid("fn"),
        name: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: trimmed.includes("async"),
        kind: "function",
      });
    }

    const expressRoute = line.match(/(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (expressRoute) {
      routes.push({
        id: uid("route"),
        path: expressRoute[2],
        method: expressRoute[1].toUpperCase(),
        funcName: currentFunc ?? "handler",
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: trimmed.includes("async"),
      });
    }

    const nextApiRoute = trimmed.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/);
    if (nextApiRoute) {
      routes.push({
        id: uid("route"),
        path: `/api/${file.replace(/[^/]+$/, "").replace(/^.*\//, "")}`,
        method: nextApiRoute[1].toUpperCase(),
        funcName: nextApiRoute[1],
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: trimmed.includes("async"),
      });
    }

    const fetchMatch = line.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (fetchMatch) {
      const methodMatch = line.match(/method\s*:\s*['"`](\w+)['"`]/i);
      fetches.push({
        id: uid("fetch"),
        url: fetchMatch[1],
        method: methodMatch ? methodMatch[1].toUpperCase() : "GET",
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }

    const axiosMatch = line.match(/axios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (axiosMatch) {
      fetches.push({
        id: uid("fetch"),
        url: axiosMatch[2],
        method: axiosMatch[1].toUpperCase(),
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }

    const queryMatch = line.match(/\.(query|execute|raw)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (queryMatch) {
      queries.push({
        id: uid("q"),
        text: queryMatch[2],
        funcRef: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }

    const prismaMatch = line.match(/prisma\.\w+\.(findMany|findUnique|findFirst|create|update|delete|upsert|count|aggregate)\s*\(/i);
    if (prismaMatch) {
      queries.push({
        id: uid("q"),
        text: `prisma.${prismaMatch[1]}()`,
        funcRef: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }

    const mongooseMatch = line.match(/\.(find|findById|findOne|create|updateOne|deleteOne|deleteMany|updateMany|save|countDocuments|aggregate)\s*\(/i);
    if (mongooseMatch && currentFunc) {
      queries.push({
        id: uid("q"),
        text: `Model.${mongooseMatch[1]}()`,
        funcRef: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }

    const sequelizeMatch = line.match(/\.(findAll|findOne|create|update|destroy|count|findAndCountAll)\s*\(/i);
    if (sequelizeMatch && currentFunc) {
      queries.push({
        id: uid("q"),
        text: `Model.${sequelizeMatch[1]}()`,
        funcRef: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }

    const importMatch = trimmed.match(/^import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/);
    if (importMatch) {
      imports.push({
        id: uid("imp"),
        fromFile: filePath,
        importedFile: importMatch[1],
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }
  }
}

function analyzeGo(
  lines: string[],
  file: string,
  filePath: string,
  routes: RouteDef[],
  queries: QueryDef[],
  funcs: FuncDef[],
  imports: ImportDef[],
) {
  let currentFunc: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const funcMatch = trimmed.match(/^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/);
    if (funcMatch) {
      currentFunc = funcMatch[1];
      funcs.push({
        id: uid("fn"),
        name: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: false,
        kind: "function",
      });
    }

    const httpRoute = line.match(/\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (httpRoute) {
      routes.push({
        id: uid("route"),
        path: httpRoute[2],
        method: httpRoute[1].toUpperCase(),
        funcName: currentFunc ?? "handler",
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: false,
      });
    }

    const dbQuery = line.match(/\.(Query|QueryRow|QueryContext|Exec)\s*\(\s*['"`]([^'"`]+)['"`]/i);
    if (dbQuery) {
      queries.push({
        id: uid("q"),
        text: dbQuery[2],
        funcRef: currentFunc,
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }

    const importMatch = trimmed.match(/^import\s+['"`]([^'"`]+)['"`]/);
    if (importMatch) {
      imports.push({
        id: uid("imp"),
        fromFile: filePath,
        importedFile: importMatch[1],
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }
  }
}

function analyzeRust(
  lines: string[],
  file: string,
  filePath: string,
  funcs: FuncDef[],
  imports: ImportDef[],
) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const funcMatch = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
    if (funcMatch) {
      funcs.push({
        id: uid("fn"),
        name: funcMatch[1],
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: trimmed.includes("async"),
        kind: "function",
      });
    }
    const importMatch = trimmed.match(/^use\s+([^;]+)/);
    if (importMatch) {
      imports.push({
        id: uid("imp"),
        fromFile: filePath,
        importedFile: importMatch[1],
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }
  }
}

function analyzeCFamily(
  lines: string[],
  file: string,
  filePath: string,
  funcs: FuncDef[],
  imports: ImportDef[],
) {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const funcMatch = trimmed.match(/^(?:\w+\s+)+(\w+)\s*\([^;]*\)\s*\{/);
    if (funcMatch) {
      funcs.push({
        id: uid("fn"),
        name: funcMatch[1],
        file: filePath,
        line: i + 1,
        snippet: trimmed,
        isAsync: false,
        kind: "function",
      });
    }
    const importMatch = trimmed.match(/^#include\s+[<"]([^>"]+)[>"]/);
    if (importMatch) {
      imports.push({
        id: uid("imp"),
        fromFile: filePath,
        importedFile: importMatch[1],
        file: filePath,
        line: i + 1,
        snippet: trimmed,
      });
    }
  }
}

function buildGraph(
  routes: RouteDef[],
  queries: QueryDef[],
  fetches: FetchDef[],
  funcs: FuncDef[],
  imports: ImportDef[],
  files: CodeFile[],
): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  const frontendNodes = new Map<string, FlowNode>();
  const backendNodes = new Map<string, FlowNode>();
  const dbNodes = new Map<string, FlowNode>();
  const funcNodes = new Map<string, FlowNode>();

  for (const f of fetches) {
    const id = `fe_${f.id}`;
    const node: FlowNode = {
      id,
      kind: "frontend",
      label: `${f.method} ${shortUrl(f.url)}`,
      detail: `HTTP ${f.method} request to ${f.url}`,
      snippet: f.snippet,
      line: f.line,
      file: f.file,
      layer: 0,
    };
    frontendNodes.set(id, node);
    nodes.push(node);
  }

  for (const r of routes) {
    const id = `be_${r.id}`;
    const node: FlowNode = {
      id,
      kind: "backend",
      label: `${r.method} ${r.path}`,
      detail: `Route handler → ${r.funcName}()`,
      snippet: r.snippet,
      line: r.line,
      file: r.file,
      layer: 1,
    };
    backendNodes.set(id, node);
    nodes.push(node);
  }

  for (const q of queries) {
    const id = `db_${q.id}`;
    const node: FlowNode = {
      id,
      kind: "database",
      label: shortQuery(q.text),
      detail: q.text.length > 80 ? q.text.slice(0, 80) + "…" : q.text,
      snippet: q.snippet,
      line: q.line,
      file: q.file,
      layer: 2,
    };
    dbNodes.set(id, node);
    nodes.push(node);
  }

  for (const f of funcs) {
    if (routes.some((r) => r.funcName === f.name)) continue;
    if (f.kind === "component") {
      const id = `fe_${f.id}`;
      const node: FlowNode = {
        id,
        kind: "frontend",
        label: f.name,
        detail: `React component`,
        snippet: f.snippet,
        line: f.line,
        file: f.file,
        layer: 0,
      };
      funcNodes.set(id, node);
      nodes.push(node);
    } else {
      const id = `fn_${f.id}`;
      const node: FlowNode = {
        id,
        kind: "function",
        label: f.name,
        detail: `${f.isAsync ? "async " : ""}function`,
        snippet: f.snippet,
        line: f.line,
        file: f.file,
        layer: 1,
      };
      funcNodes.set(id, node);
      nodes.push(node);
    }
  }

  for (const [feId, feNode] of frontendNodes) {
    const matchingRoute = routes.find((r) => urlMatchesRoute(feNode.label, r.path, r.method));
    if (matchingRoute) {
      const beId = `be_${matchingRoute.id}`;
      edges.push({
        id: uid("e"),
        from: feId,
        to: beId,
        kind: "request",
        label: `${matchingRoute.method} ${matchingRoute.path}`,
        detail: `Frontend calls backend route ${matchingRoute.method} ${matchingRoute.path}`,
      });
      edges.push({
        id: uid("e"),
        from: beId,
        to: feId,
        kind: "response",
        label: "200 OK",
        detail: `Backend responds to frontend`,
      });
    } else {
      const anyRoute = routes[0];
      if (anyRoute) {
        const beId = `be_${anyRoute.id}`;
        edges.push({
          id: uid("e"),
          from: feId,
          to: beId,
          kind: "request",
          label: `${feNode.label}`,
          detail: `Frontend calls backend`,
        });
        edges.push({
          id: uid("e"),
          from: beId,
          to: feId,
          kind: "response",
          label: "response",
          detail: `Backend responds to frontend`,
        });
      }
    }
  }

  for (const r of routes) {
    const beId = `be_${r.id}`;
    const routeQueries = queries.filter((q) => q.funcRef === r.funcName);
    for (const q of routeQueries) {
      const dbId = `db_${q.id}`;
      edges.push({
        id: uid("e"),
        from: beId,
        to: dbId,
        kind: "query",
        label: shortQuery(q.text),
        detail: `Backend queries database: ${q.text}`,
      });
      edges.push({
        id: uid("e"),
        from: dbId,
        to: beId,
        kind: "response",
        label: "result",
        detail: `Database returns result to backend`,
      });
    }
  }

  if (frontendNodes.size === 0 && routes.length > 0) {
    const feId = uid("fe");
    const feNode: FlowNode = {
      id: feId,
      kind: "frontend",
      label: "Client",
      detail: "Frontend client",
      snippet: "—",
      line: 0,
      file: "",
      layer: 0,
    };
    nodes.unshift(feNode);
    for (const r of routes) {
      const beId = `be_${r.id}`;
      edges.push({
        id: uid("e"),
        from: feId,
        to: beId,
        kind: "request",
        label: `${r.method} ${r.path}`,
        detail: `Client calls ${r.method} ${r.path}`,
      });
      edges.push({
        id: uid("e"),
        from: beId,
        to: feId,
        kind: "response",
        label: "200 OK",
        detail: `Backend responds to client`,
      });
    }
  }

  if (edges.length === 0 && nodes.length > 1) {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: uid("e"),
        from: nodes[i].id,
        to: nodes[i + 1].id,
        kind: "call",
        label: "calls",
        detail: `${nodes[i].label} → ${nodes[i + 1].label}`,
      });
    }
  }

  return { nodes, edges };
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url, "http://localhost");
    return u.pathname === "/" ? u.host : u.pathname;
  } catch {
    return url.length > 30 ? url.slice(0, 30) + "…" : url;
  }
}

function shortQuery(q: string): string {
  const trimmed = q.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 40) return trimmed;
  const first = trimmed.split(/\s|,/)[0];
  return first.length > 30 ? first.slice(0, 30) + "…" : first + "…";
}

function urlMatchesRoute(fetchLabel: string, routePath: string, method: string): boolean {
  return fetchLabel.toUpperCase().includes(method.toUpperCase()) &&
    (fetchLabel.includes(routePath) || routePath.includes(":"));
}

export function explainNode(node: FlowNode, graph: FlowGraph): string {
  const incoming = graph.edges.filter((e) => e.to === node.id);
  const outgoing = graph.edges.filter((e) => e.from === node.id);

  switch (node.kind) {
    case "frontend": {
      const calls = outgoing.filter((e) => e.kind === "request");
      return `This is the frontend — it sends ${calls.length} HTTP request${calls.length === 1 ? "" : "s"} to the backend. When a user interacts with the page, this code triggers a network call to fetch or send data.`;
    }
    case "backend": {
      const reqs = incoming.filter((e) => e.kind === "request");
      const queries = outgoing.filter((e) => e.kind === "query");
      return `This is a backend route handler. It receives ${reqs.length} request${reqs.length === 1 ? "" : "s"} from the frontend, processes the logic, and makes ${queries.length} database quer${queries.length === 1 ? "y" : "ies"}. It then returns a response back to whoever called it.`;
    }
    case "database": {
      const callers = incoming.filter((e) => e.kind === "query");
      return `This is a database operation. The backend ${callers.length === 1 ? "handler" : "handlers"} run${callers.length === 1 ? "s" : ""} this query to read or write data. The result is sent back to the backend, which passes it along to the frontend.`;
    }
    case "function": {
      return `This is a helper function. It's called by other parts of the code to perform a specific task, keeping the logic organized and reusable.`;
    }
  }
}

export function explainEdge(edge: FlowEdge, graph: FlowGraph): string {
  const fromNode = graph.nodes.find((n) => n.id === edge.from);
  const toNode = graph.nodes.find((n) => n.id === edge.to);
  const fromLabel = fromNode?.label ?? "unknown";
  const toLabel = toNode?.label ?? "unknown";

  switch (edge.kind) {
    case "request":
      return `The frontend sends an HTTP request (${edge.label}) to the backend route ${toLabel}. This is how the client asks the server for data or an action.`;
    case "query":
      return `The backend route ${fromLabel} runs a database query (${edge.label}) to fetch or modify data stored in the database.`;
    case "response":
      return `A response flows back from ${fromLabel} to ${toLabel}. This carries the result of the request or query so the caller can use it.`;
    case "call":
      return `${fromLabel} calls ${toLabel}. This is an internal function call within the code.`;
    case "import":
      return `${fromLabel} imports from ${toLabel}. This connects different parts of the codebase together.`;
  }
}
