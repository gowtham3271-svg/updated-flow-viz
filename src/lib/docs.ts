import type { FlowNode, FlowEdge, FlowGraph } from "@/types";

export interface DocLink {
  technology: string;
  label: string;
  url: string;
}

const PYTHON_FLASK = "https://flask.palletsprojects.com/en/stable/quickstart/#routing";
const PYTHON_FASTAPI = "https://fastapi.tiangolo.com/tutorial/path-params/";
const PYTHON_SQLALCHEMY = "https://docs.sqlalchemy.org/en/20/orm/queryguide/query.html";
const PYTHON_DBAPI = "https://docs.python.org/3/library/sqlite3.html";
const JS_EXPRESS = "https://expressjs.com/en/guide/routing.html";
const JS_FETCH = "https://developer.mozilla.org/en-US/docs/Web/API/fetch";
const JS_AXIOS = "https://axios-http.com/docs/intro";
const JS_PRISMA = "https://www.prisma.io/docs/concepts/components/prisma-client/crud";
const SQL_REFERENCE = "https://www.w3schools.com/sql/";
const HTTP_REQUESTS = "https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods";

function isFlask(snippet: string): boolean {
  return /@app\.(get|post|put|patch|delete|route)\s*\(/i.test(snippet) ||
    /from\s+flask\s+import/i.test(snippet) ||
    /Flask\(__name__\)/i.test(snippet);
}

function isFastAPI(snippet: string): boolean {
  return /@app\.(get|post|put|patch|delete)\s*\(/i.test(snippet) &&
    /from\s+fastapi\s+import/i.test(snippet);
}

function isFastAPIDecorator(snippet: string): boolean {
  return /@(app|router)\.(get|post|put|patch|delete)\s*\(\s*['"][^'"]+['"]\s*\)/i.test(snippet) &&
    !/methods\s*=/.test(snippet);
}

function isExpress(snippet: string): boolean {
  return /app\.(get|post|put|patch|delete)\s*\(/i.test(snippet) ||
    /router\.(get|post|put|patch|delete)\s*\(/i.test(snippet) ||
    /express\(\)/i.test(snippet);
}

function isPrisma(snippet: string): boolean {
  return /prisma\.\w+\.(findMany|findUnique|findFirst|create|update|delete|upsert|count)\s*\(/i.test(snippet);
}

function isAxios(snippet: string): boolean {
  return /axios\.(get|post|put|patch|delete)\s*\(/i.test(snippet);
}

function isFetch(snippet: string): boolean {
  return /fetch\s*\(/i.test(snippet);
}

function isSqlAlchemy(snippet: string): boolean {
  return /\.(filter|get|all|create|update|delete|save|first|exists|count)\s*\(/i.test(snippet) &&
    /session|query|model|db/i.test(snippet);
}

function isRawSql(snippet: string): boolean {
  return /(execute|query|fetchone|fetchall|fetchmany|scalar)\s*\(\s*['"`]/i.test(snippet);
}

function fileLanguage(file: string): string | null {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "py") return "python";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx") return "javascript";
  return null;
}

export function getDocsForNode(node: FlowNode, graph: FlowGraph): DocLink[] {
  const links: DocLink[] = [];
  const snippet = node.snippet || "";
  const lang = fileLanguage(node.file);

  if (node.kind === "frontend") {
    if (isFetch(snippet)) {
      links.push({ technology: "Fetch API", label: "fetch() — MDN Web Docs", url: JS_FETCH });
    }
    if (isAxios(snippet)) {
      links.push({ technology: "Axios", label: "Axios HTTP Client", url: JS_AXIOS });
    }
    if (links.length === 0) {
      links.push({ technology: "HTTP", label: "HTTP Request Methods — MDN", url: HTTP_REQUESTS });
    }
  }

  if (node.kind === "backend") {
    if (lang === "python") {
      if (isFastAPI(snippet) || isFastAPIDecorator(snippet)) {
        links.push({ technology: "FastAPI", label: "FastAPI Path Parameters", url: PYTHON_FASTAPI });
      } else if (isFlask(snippet)) {
        links.push({ technology: "Flask", label: "Flask Routing", url: PYTHON_FLASK });
      } else {
        links.push({ technology: "Flask", label: "Flask Routing", url: PYTHON_FLASK });
      }
    } else {
      if (isExpress(snippet)) {
        links.push({ technology: "Express", label: "Express Routing", url: JS_EXPRESS });
      } else {
        links.push({ technology: "Express", label: "Express Routing", url: JS_EXPRESS });
      }
    }

    const outgoingQueries = graph.edges.filter((e) => e.from === node.id && e.kind === "query");
    if (outgoingQueries.length > 0) {
      const querySnippet = outgoingQueries
        .map((e) => graph.nodes.find((n) => n.id === e.to)?.snippet ?? "")
        .join("\n");
      if (lang === "python") {
        if (isSqlAlchemy(querySnippet)) {
          links.push({ technology: "SQLAlchemy", label: "SQLAlchemy Querying", url: PYTHON_SQLALCHEMY });
        } else {
          links.push({ technology: "sqlite3", label: "Python sqlite3 (DB-API)", url: PYTHON_DBAPI });
        }
      } else {
        if (isPrisma(querySnippet)) {
          links.push({ technology: "Prisma", label: "Prisma Client CRUD", url: JS_PRISMA });
        } else {
          links.push({ technology: "SQL", label: "SQL Reference", url: SQL_REFERENCE });
        }
      }
    }
  }

  if (node.kind === "database") {
    if (lang === "python") {
      if (isSqlAlchemy(snippet)) {
        links.push({ technology: "SQLAlchemy", label: "SQLAlchemy Querying", url: PYTHON_SQLALCHEMY });
      } else if (isRawSql(snippet)) {
        links.push({ technology: "sqlite3", label: "Python sqlite3 (DB-API)", url: PYTHON_DBAPI });
      } else {
        links.push({ technology: "SQL", label: "SQL Reference", url: SQL_REFERENCE });
      }
    } else {
      if (isPrisma(snippet)) {
        links.push({ technology: "Prisma", label: "Prisma Client CRUD", url: JS_PRISMA });
      } else {
        links.push({ technology: "SQL", label: "SQL Reference", url: SQL_REFERENCE });
      }
    }
  }

  if (node.kind === "function") {
    if (lang === "python") {
      links.push({ technology: "Python", label: "Python Functions", url: "https://docs.python.org/3/tutorial/controlflow.html#defining-functions" });
    } else {
      links.push({ technology: "JavaScript", label: "Functions — MDN", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions" });
    }
  }

  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

export function getDocsForEdge(edge: FlowEdge, graph: FlowGraph): DocLink[] {
  const links: DocLink[] = [];
  const fromNode = graph.nodes.find((n) => n.id === edge.from);
  const toNode = graph.nodes.find((n) => n.id === edge.to);

  if (edge.kind === "request") {
    links.push({ technology: "HTTP", label: "HTTP Request Methods — MDN", url: HTTP_REQUESTS });
    if (fromNode && isFetch(fromNode.snippet)) {
      links.push({ technology: "Fetch API", label: "fetch() — MDN Web Docs", url: JS_FETCH });
    }
    if (fromNode && isAxios(fromNode.snippet)) {
      links.push({ technology: "Axios", label: "Axios HTTP Client", url: JS_AXIOS });
    }
  }

  if (edge.kind === "query") {
    links.push({ technology: "SQL", label: "SQL Reference", url: SQL_REFERENCE });
    if (toNode) {
      const lang = fileLanguage(toNode.file);
      if (lang === "python") {
        if (isSqlAlchemy(toNode.snippet)) {
          links.push({ technology: "SQLAlchemy", label: "SQLAlchemy Querying", url: PYTHON_SQLALCHEMY });
        } else {
          links.push({ technology: "sqlite3", label: "Python sqlite3 (DB-API)", url: PYTHON_DBAPI });
        }
      } else {
        if (isPrisma(toNode.snippet)) {
          links.push({ technology: "Prisma", label: "Prisma Client CRUD", url: JS_PRISMA });
        }
      }
    }
  }

  if (edge.kind === "response") {
    links.push({ technology: "HTTP", label: "HTTP Response Codes — MDN", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status" });
  }

  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}
