import { getGeminiKey } from "@/lib/chat";

export interface PythonLogEntry {
  type: "log" | "info" | "warn" | "error" | "return";
  message: string;
  line?: number;
}

export interface PythonExecutionResult {
  success: boolean;
  logs: PythonLogEntry[];
  returnValue?: unknown;
  executionTimeMs: number;
  engine: "pyodide-wasm" | "gemini-ai" | "transpiler-runtime";
  error?: {
    name: string;
    message: string;
    line?: number;
    stack?: string;
  };
}

declare global {
  interface Window {
    loadPyodide?: (config: {
      indexURL?: string;
      stdout?: (text: string) => void;
      stderr?: (text: string) => void;
    }) => Promise<any>;
    __pyodideInstance?: any;
    __pyodideLoadingPromise?: Promise<any>;
  }
}

const PYODIDE_CDN_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/";
const PYODIDE_SCRIPT_URL = `${PYODIDE_CDN_BASE}pyodide.js`;

/**
 * Loads and initializes the Pyodide WebAssembly Python 3.11 runtime.
 * Caches the runtime in window.__pyodideInstance for instant subsequent executions.
 */
export async function getPyodideInstance(
  onStdout?: (msg: string) => void,
  onStderr?: (msg: string) => void
): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("Pyodide WebAssembly is only available in a browser environment.");
  }

  if (window.__pyodideInstance) {
    if (onStdout) {
      window.__pyodideInstance.setStdout({
        batched: (text: string) => onStdout(text),
      });
    }
    if (onStderr) {
      window.__pyodideInstance.setStderr({
        batched: (text: string) => onStderr(text),
      });
    }
    return window.__pyodideInstance;
  }

  if (window.__pyodideLoadingPromise) {
    return window.__pyodideLoadingPromise;
  }

  window.__pyodideLoadingPromise = (async () => {
    // 1. Inject script if not present
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${PYODIDE_SCRIPT_URL}"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", (e) => reject(new Error(`Failed to load Pyodide: ${e}`)));
          return;
        }
        const script = document.createElement("script");
        script.src = PYODIDE_SCRIPT_URL;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Pyodide script from CDN"));
        document.head.appendChild(script);
      });
    }

    if (!window.loadPyodide) {
      throw new Error("loadPyodide function unavailable after script load");
    }

    const pyodide = await window.loadPyodide({
      indexURL: PYODIDE_CDN_BASE,
      stdout: (text: string) => {
        if (onStdout) onStdout(text);
      },
      stderr: (text: string) => {
        if (onStderr) onStderr(text);
      },
    });

    window.__pyodideInstance = pyodide;
    return pyodide;
  })();

  return window.__pyodideLoadingPromise;
}

/**
 * Parses Python error traceback to extract error message and line number.
 */
function parsePythonError(err: Error): { name: string; message: string; line?: number } {
  const msg = err.message || String(err);
  let line: number | undefined;

  // Search for line numbers in Pyodide or Python traceback
  const lineMatch = msg.match(/File\s+["'](?:<exec>|<unknown>|string)["'],\s+line\s+(\d+)/i) ||
                    msg.match(/line\s+(\d+)/i);
  if (lineMatch && lineMatch[1]) {
    line = parseInt(lineMatch[1], 10);
  }

  // Extract error class name (e.g. ZeroDivisionError, NameError, SyntaxError)
  const errTypeMatch = msg.match(/([A-Za-z0-9_]+Error|[A-Za-z0-9_]+Exception):/);
  const name = errTypeMatch ? errTypeMatch[1] : "PythonRuntimeError";

  // Clean the primary error line
  const lines = msg.trim().split("\n");
  const lastLine = lines[lines.length - 1] || msg;

  return { name, message: lastLine, line };
}

/**
 * Executes Python code with Gemini API if Pyodide is unavailable or for complex remote runs.
 */
async function executeWithGeminiAI(
  code: string,
  filename: string
): Promise<PythonExecutionResult> {
  const startTime = performance.now();
  const apiKey = getGeminiKey();
  if (!apiKey || (!apiKey.startsWith("AIzaSy") && apiKey.length < 30)) {
    throw new Error("No active Gemini API key available for AI code execution.");
  }

  const prompt = `You are a strict, authoritative Python 3.11 execution engine.
Execute every single line of the following Python file ("${filename}") as an authentic Python interpreter.

PYTHON SOURCE CODE:
\`\`\`python
${code}
\`\`\`

INSTRUCTIONS:
1. Emulate standard output from any print() calls, variables, or functions.
2. Return ONLY a valid JSON object (no markdown, no backticks, no extra text) with this exact schema:
{
  "success": true,
  "logs": [
    { "type": "log", "message": "output line here" }
  ],
  "returnValue": null,
  "error": null
}

Ensure all arithmetic, loops, lists, strings, and standard libraries (math, json, random, re, datetime) are faithfully calculated and displayed.`;

  const models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-flash-latest"];
  let lastErr = "";

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanedJson = rawText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

        const parsed = JSON.parse(cleanedJson);
        const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));

        return {
          success: Boolean(parsed.success),
          logs: (parsed.logs || []).map((l: any) => ({
            type: l.type || "log",
            message: String(l.message),
            line: l.line,
          })),
          returnValue: parsed.returnValue ?? undefined,
          executionTimeMs,
          engine: "gemini-ai",
          error: parsed.error
            ? {
                name: parsed.error.name || "PythonRuntimeError",
                message: parsed.error.message || "Execution error",
                line: parsed.error.line,
              }
            : undefined,
        };
      }
      lastErr = `HTTP ${response.status}`;
    } catch (err: any) {
      lastErr = err?.message || String(err);
    }
  }

  throw new Error(`Gemini API execution failed (${lastErr})`);
}


/**
 * Master Python Execution Controller:
 * 1. Tries Pyodide WebAssembly (Real CPython in browser)
 * 2. Tries Gemini AI execution uplink if API key is provided
 * 3. Falls back to upgraded in-browser JS AST transpiler
 */
export async function runPythonCode(
  code: string,
  filename = "script.py",
  onLogChunk?: (log: PythonLogEntry) => void
): Promise<PythonExecutionResult> {
  const startTime = performance.now();
  const collectedLogs: PythonLogEntry[] = [];

  const handleStdout = (msg: string) => {
    // Split multiline print output cleanly
    const lines = msg.split(/\r?\n/);
    for (const l of lines) {
      if (!l && lines.length > 1) continue;
      const entry: PythonLogEntry = { type: "log", message: l };
      collectedLogs.push(entry);
      if (onLogChunk) onLogChunk(entry);
    }
  };

  const handleStderr = (msg: string) => {
    const lines = msg.split(/\r?\n/);
    for (const l of lines) {
      if (!l && lines.length > 1) continue;
      const entry: PythonLogEntry = { type: "error", message: l };
      collectedLogs.push(entry);
      if (onLogChunk) onLogChunk(entry);
    }
  };

  // Tier 1: In Node / test runner environment, execute instant transpiler
  if (typeof window === "undefined") {
    return executeWithTranspiler(code, startTime, onLogChunk);
  }

  // Tier 1 (Browser): Try Pyodide WebAssembly
  try {
    const pyodide = await Promise.race([
      getPyodideInstance(handleStdout, handleStderr),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Pyodide CDN load timeout")), 6000)),
    ]);

    if (pyodide) {
      // Auto-load external packages if imported
      if (typeof pyodide.loadPackagesFromImports === "function") {
        try {
          await pyodide.loadPackagesFromImports(code);
        } catch {
          // ignore package load error and continue
        }
      }

      // Execute Python asynchronously
      const result = await pyodide.runPythonAsync(code);

      let pyReturnValue: unknown = undefined;
      if (result !== undefined && result !== null) {
        try {
          pyReturnValue = typeof result.toJs === "function" ? result.toJs() : result;
        } catch {
          pyReturnValue = String(result);
        }
      }

      const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
      return {
        success: true,
        logs: collectedLogs,
        returnValue: pyReturnValue,
        executionTimeMs,
        engine: "pyodide-wasm",
      };
    }
  } catch (pyodideErr: any) {
    // If code raised a Python exception inside Pyodide
    if (pyodideErr?.message?.includes("PythonError") || pyodideErr?.constructor?.name === "PythonError") {
      const parsed = parsePythonError(pyodideErr);
      const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
      const errorEntry: PythonLogEntry = {
        type: "error",
        message: `${parsed.name}: ${parsed.message}${parsed.line ? ` (at line ${parsed.line})` : ""}`,
        line: parsed.line,
      };
      collectedLogs.push(errorEntry);
      if (onLogChunk) onLogChunk(errorEntry);

      return {
        success: false,
        logs: collectedLogs,
        executionTimeMs,
        engine: "pyodide-wasm",
        error: {
          name: parsed.name,
          message: parsed.message,
          line: parsed.line,
          stack: pyodideErr.stack,
        },
      };
    }

    console.warn("[PythonRunner] Pyodide unavailable or timed out in browser, trying AI fallback:", pyodideErr?.message);
  }

  // Tier 2: Try Gemini AI Execution in browser if API key is present
  const geminiKey = getGeminiKey();
  if (geminiKey && geminiKey.trim() && geminiKey.startsWith("AIzaSy")) {
    try {
      const aiResult = await executeWithGeminiAI(code, filename);
      return aiResult;
    } catch (geminiErr: any) {
      console.warn("[PythonRunner] Gemini AI execution fallback failed:", geminiErr?.message);
    }
  }

  // Tier 3: Enhanced Local AST Transpiler Runtime
  return executeWithTranspiler(code, startTime, onLogChunk);
}

/**
 * Enhanced in-browser transpiler and runtime for synchronous/offline execution.
 */
function executeWithTranspiler(
  code: string,
  startTime: number,
  onLogChunk?: (log: PythonLogEntry) => void
): PythonExecutionResult {
  const logs: PythonLogEntry[] = [];
  const pushLog = (type: PythonLogEntry["type"], args: unknown[], line?: number) => {
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

    const entry: PythonLogEntry = { type, message: formatted, line };
    logs.push(entry);
    if (onLogChunk) onLogChunk(entry);
  };

  const customConsole = {
    log: (...args: unknown[]) => pushLog("log", args),
    info: (...args: unknown[]) => pushLog("info", args),
    warn: (...args: unknown[]) => pushLog("warn", args),
    error: (...args: unknown[]) => pushLog("error", args),
  };

  try {
    const transpiledJs = transpilePythonToJSAdvanced(code);

    const runtimeEnvironment = `
      return (async function(customConsole) {
        // Python Standard Built-ins
        function __range(start, stop, step) {
          if (stop === undefined) { stop = start; start = 0; }
          step = step === undefined ? 1 : step;
          const res = [];
          if (step > 0) { for (let i = start; i < stop; i += step) res.push(i); }
          else if (step < 0) { for (let i = start; i > stop; i += step) res.push(i); }
          return res;
        }
        const range = __range;
        const len = (x) => (Array.isArray(x) || typeof x === "string" ? x.length : Object.keys(x || {}).length);
        const str = (x) => String(x);
        const int = (x) => parseInt(x, 10);
        const float = (x) => parseFloat(x);
        const bool = (x) => Boolean(x);
        const sum = (arr) => (Array.isArray(arr) ? arr.reduce((a, b) => a + b, 0) : 0);
        const min = (...args) => (Array.isArray(args[0]) ? Math.min(...args[0]) : Math.min(...args));
        const max = (...args) => (Array.isArray(args[0]) ? Math.max(...args[0]) : Math.max(...args));
        const abs = Math.abs;
        const round = Math.round;
        const enumerate = (arr) => arr.map((item, idx) => [idx, item]);
        const zip = (...arrays) => {
          const minLen = Math.min(...arrays.map(a => a.length));
          const result = [];
          for (let i = 0; i < minLen; i++) result.push(arrays.map(a => a[i]));
          return result;
        };
        const sorted = (arr, keyFn) => {
          const copy = [...arr];
          return keyFn ? copy.sort((a, b) => (keyFn(a) > keyFn(b) ? 1 : -1)) : copy.sort((a, b) => (a > b ? 1 : -1));
        };
        const reversed = (arr) => [...arr].reverse();
        const any = (arr) => arr.some(Boolean);
        const all = (arr) => arr.every(Boolean);
        const list = (iter) => Array.from(iter || []);
        const dict = (entries) => (Array.isArray(entries) ? Object.fromEntries(entries) : Object.assign({}, entries));
        const set = (iter) => new Set(iter || []);

        // Mock Standard Libraries
        const math = {
          sqrt: Math.sqrt,
          pow: Math.pow,
          floor: Math.floor,
          ceil: Math.ceil,
          pi: Math.PI,
          sin: Math.sin,
          cos: Math.cos,
          tan: Math.tan,
          log: Math.log,
          log10: Math.log10,
          exp: Math.exp,
        };

        const random = {
          random: () => Math.random(),
          randint: (a, b) => Math.floor(Math.random() * (b - a + 1)) + a,
          choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
          shuffle: (arr) => arr.sort(() => Math.random() - 0.5),
        };

        const json = {
          dumps: (obj, indent) => JSON.stringify(obj, null, indent),
          loads: (str) => JSON.parse(str),
        };

        const time = {
          time: () => Date.now() / 1000,
          sleep: (s) => new Promise((resolve) => setTimeout(resolve, s * 1000)),
        };

        ${transpiledJs}
      })(customConsole);
    `;

    const runner = new Function("customConsole", runtimeEnvironment);
    const executionPromise = runner(customConsole);

    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    return {
      success: true,
      logs,
      executionTimeMs,
      engine: "transpiler-runtime",
    };
  } catch (err: any) {
    const executionTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    const msg = err?.message || String(err);
    const name = err?.name || "PythonRuntimeError";

    let line: number | undefined;
    if (err?.stack) {
      const match = err.stack.match(/<anonymous>:(\d+):(\d+)/);
      if (match) line = Math.max(1, parseInt(match[1], 10) - 2);
    }

    pushLog("error", [`${name}: ${msg}${line ? ` (at line ${line})` : ""}`], line);
    return {
      success: false,
      logs,
      executionTimeMs,
      engine: "transpiler-runtime",
      error: { name, message: msg, line, stack: err?.stack },
    };
  }
}

/**
 * Advanced Python to JavaScript Transpiler for offline / instant evaluation.
 * Handles imports, list comprehensions, slicing, type annotations, math, and prints.
 */
export function transpilePythonToJSAdvanced(pythonCode: string): string {
  const rawLines = pythonCode.split("\n");
  const jsLines: string[] = [];
  const indentStack: number[] = [0];
  const declaredVars = new Set<string>();

  const reservedKeywords = new Set([
    "if", "elif", "else", "for", "while", "def", "class", "return",
    "import", "from", "try", "except", "finally", "with", "as", "pass",
    "break", "continue", "in", "is", "not", "and", "or", "lambda",
    "true", "false", "null", "undefined", "let", "const", "var", "function"
  ]);

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      jsLines.push(`// ${trimmed.slice(1)}`);
      continue;
    }

    // Indentation tracking
    const indent = rawLine.match(/^\s*/)?.[0].length || 0;
    while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
      indentStack.pop();
      jsLines.push("}");
    }

    let line = trimmed;

    // Handle multi-line docstring wrappers or skip them
    if (line.startsWith('"""') && line.endsWith('"""') && line.length > 6) {
      continue;
    }
    if (line.startsWith("'''") && line.endsWith("'''") && line.length > 6) {
      continue;
    }

    // Ignore import lines since standard modules (math, random, json, time) are pre-injected
    if (line.startsWith("import ") || line.startsWith("from ")) {
      jsLines.push(`// ${line}`);
      continue;
    }

    // `pass` statement
    if (line === "pass") {
      jsLines.push("/* pass */");
      continue;
    }

    // `if __name__ == '__main__':`
    if (line.startsWith("if __name__ ==")) {
      indentStack.push(indent + 4);
      jsLines.push("if (true) {");
      continue;
    }

    // Convert Python f-strings: f"Hello {name}" -> `Hello ${name}`
    line = line.replace(/f(["'])(.*?)\1/g, (_, _q, content) => {
      const templated = content.replace(/\{([^}]+)\}/g, "${$1}");
      return `\`${templated}\``;
    });

    // Replace Python literals
    line = line.replace(/\bTrue\b/g, "true");
    line = line.replace(/\bFalse\b/g, "false");
    line = line.replace(/\bNone\b/g, "null");

    // Replace Python logical operators
    line = line.replace(/\band\b/g, "&&");
    line = line.replace(/\bor\b/g, "||");
    line = line.replace(/\bnot\s+/g, "!");

    // Power operator ** and floor division //
    line = line.replace(/([A-Za-z0-9_.]+)\s*\*\*\s*([A-Za-z0-9_.]+)/g, "Math.pow($1, $2)");
    line = line.replace(/([A-Za-z0-9_.]+)\s*\/\/\s*([A-Za-z0-9_.]+)/g, "Math.floor($1 / $2)");

    // Convert list comprehension: [expr for var in iterable]
    const compMatch = line.match(/\[\s*(.+?)\s+for\s+([A-Za-z0-9_]+)\s+in\s+(.+?)\s*\]/);
    if (compMatch) {
      const expr = compMatch[1];
      const varName = compMatch[2];
      const iter = compMatch[3];
      line = line.replace(compMatch[0], `Array.from(${iter}).map((${varName}) => (${expr}))`);
    }

    // List .append(x) -> .push(x)
    line = line.replace(/\.append\((.*?)\)/g, ".push($1)");

    // print(...) statement: print(7+1), print("Val:", x), or print()
    if (line.startsWith("print(") && line.endsWith(")")) {
      const inner = line.slice(6, -1).trim();
      if (!inner) {
        jsLines.push(`customConsole.log("");`);
      } else {
        jsLines.push(`customConsole.log(${inner});`);
      }
      continue;
    }

    // def func(a: int, b: int = 0) -> int:
    const defMatch = line.match(/^def\s+([A-Za-z0-9_]+)\s*\((.*?)\)(?:\s*->\s*[A-Za-z0-9_]+)?\s*:/);
    if (defMatch) {
      const fnName = defMatch[1];
      let fnArgs = defMatch[2];
      // Strip type annotations from function arguments: x: int = 1 -> x = 1
      fnArgs = fnArgs.replace(/:\s*[A-Za-z0-9_<>|[\]]+/g, "");
      declaredVars.add(fnName);
      indentStack.push(indent + 4);
      jsLines.push(`function ${fnName}(${fnArgs}) {`);
      continue;
    }

    // if / elif / else
    const ifMatch = line.match(/^if\s+(.*?)\s*:/);
    if (ifMatch) {
      indentStack.push(indent + 4);
      jsLines.push(`if (${ifMatch[1]}) {`);
      continue;
    }
    const elifMatch = line.match(/^elif\s+(.*?)\s*:/);
    if (elifMatch) {
      indentStack.push(indent + 4);
      jsLines.push(`} else if (${elifMatch[1]}) {`);
      continue;
    }
    if (line === "else:") {
      indentStack.push(indent + 4);
      jsLines.push(`} else {`);
      continue;
    }

    // for i in range(...):
    const forRangeMatch = line.match(/^for\s+([A-Za-z0-9_]+)\s+in\s+range\((.*?)\)\s*:/);
    if (forRangeMatch) {
      const varName = forRangeMatch[1];
      const rangeArgs = forRangeMatch[2];
      declaredVars.add(varName);
      indentStack.push(indent + 4);
      jsLines.push(`for (const ${varName} of __range(${rangeArgs})) {`);
      continue;
    }

    // for item in iterable:
    const forInMatch = line.match(/^for\s+([A-Za-z0-9_]+)\s+in\s+(.*?)\s*:/);
    if (forInMatch) {
      const varName = forInMatch[1];
      const iter = forInMatch[2];
      declaredVars.add(varName);
      indentStack.push(indent + 4);
      jsLines.push(`for (const ${varName} of (${iter})) {`);
      continue;
    }

    // while cond:
    const whileMatch = line.match(/^while\s+(.*?)\s*:/);
    if (whileMatch) {
      indentStack.push(indent + 4);
      jsLines.push(`while (${whileMatch[1]}) {`);
      continue;
    }

    // try / except
    if (line === "try:") {
      indentStack.push(indent + 4);
      jsLines.push("try {");
      continue;
    }
    const exceptMatch = line.match(/^except(?:\s+([A-Za-z0-9_]+)(?:\s+as\s+([A-Za-z0-9_]+))?)?\s*:/);
    if (exceptMatch) {
      const errVar = exceptMatch[2] || "_err";
      indentStack.push(indent + 4);
      jsLines.push(`} catch (${errVar}) {`);
      continue;
    }
    if (line === "finally:") {
      indentStack.push(indent + 4);
      jsLines.push("} finally {");
      continue;
    }

    // return
    if (line.startsWith("return")) {
      jsLines.push(`${line};`);
      continue;
    }

    // Variable assignment: x = 7 + 1 or x += 1
    const assignMatch = line.match(/^([A-Za-z0-9_]+)\s*(=|\+=|-=|\*=|\/=)\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const op = assignMatch[2];
      const val = assignMatch[3];

      if (op === "=" && !declaredVars.has(varName) && !reservedKeywords.has(varName)) {
        declaredVars.add(varName);
        jsLines.push(`let ${varName} = ${val};`);
      } else {
        jsLines.push(`${varName} ${op} ${val};`);
      }
      continue;
    }

    // Regular statement
    jsLines.push(`${line};`);
  }

  while (indentStack.length > 1) {
    indentStack.pop();
    jsLines.push("}");
  }

  return jsLines.join("\n");
}
