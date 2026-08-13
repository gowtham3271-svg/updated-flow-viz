import type { CodeLanguage } from "@/types";

export interface Token {
  text: string;
  type: TokenType;
}

export type TokenType =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "operator"
  | "punctuation"
  | "type"
  | "variable"
  | "constant"
  | "tag"
  | "attr"
  | "property";

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for",
  "while", "do", "switch", "case", "break", "continue", "default",
  "try", "catch", "finally", "throw", "new", "delete", "typeof",
  "instanceof", "void", "this", "super", "class", "extends",
  "import", "export", "from", "as", "async", "await", "yield",
  "static", "get", "set", "of", "in", "null", "undefined", "true",
  "false", "NaN", "Infinity", "interface", "type", "enum", "namespace",
  "declare", "readonly", "private", "protected", "public", "abstract",
  "implements", "satisfies", "is", "keyof", "infer", "never", "unknown",
  "any", "string", "number", "boolean", "object", "symbol", "bigint",
]);

const PY_KEYWORDS = new Set([
  "def", "class", "return", "if", "elif", "else", "for", "while",
  "break", "continue", "pass", "import", "from", "as", "try",
  "except", "finally", "raise", "with", "yield", "async", "await",
  "lambda", "global", "nonlocal", "del", "not", "and", "or", "is",
  "in", "None", "True", "False", "self", "cls", "assert", "print",
]);

const GO_KEYWORDS = new Set([
  "func", "var", "const", "type", "struct", "interface", "return",
  "if", "else", "for", "range", "switch", "case", "default", "break",
  "continue", "go", "defer", "select", "chan", "package", "import",
  "map", "nil", "true", "false", "iota",
]);

const RUST_KEYWORDS = new Set([
  "fn", "let", "mut", "const", "static", "struct", "enum", "trait",
  "impl", "pub", "use", "mod", "return", "if", "else", "match",
  "for", "while", "loop", "break", "continue", "async", "await",
  "move", "ref", "self", "Self", "super", "crate", "as", "in",
  "where", "unsafe", "dyn", "true", "false", "None", "Some", "Ok", "Err",
]);

const JAVA_KEYWORDS = new Set([
  "public", "private", "protected", "class", "interface", "extends",
  "implements", "return", "if", "else", "for", "while", "do", "switch",
  "case", "break", "continue", "default", "try", "catch", "finally",
  "throw", "throws", "new", "import", "package", "static", "final",
  "void", "int", "long", "double", "float", "boolean", "char", "byte",
  "short", "true", "false", "null", "this", "super", "instanceof",
  "abstract", "synchronized", "volatile", "transient", "native", "enum",
]);

const C_KEYWORDS = new Set([
  "int", "long", "short", "char", "float", "double", "void", "unsigned",
  "signed", "const", "static", "extern", "register", "volatile", "auto",
  "struct", "union", "enum", "typedef", "return", "if", "else", "for",
  "while", "do", "switch", "case", "break", "continue", "default",
  "goto", "sizeof", "include", "define", "ifdef", "ifndef", "endif",
  "pragma", "NULL", "true", "false", "bool",
]);

const BASH_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "do", "done",
  "case", "esac", "function", "return", "export", "local", "readonly",
  "echo", "printf", "read", "source", "alias", "unset", "set", "shift",
]);

function getKeywords(lang: CodeLanguage): Set<string> {
  switch (lang) {
    case "python": return PY_KEYWORDS;
    case "go": return GO_KEYWORDS;
    case "rust": return RUST_KEYWORDS;
    case "java": return JAVA_KEYWORDS;
    case "c":
    case "cpp": return C_KEYWORDS;
    case "bash": return BASH_KEYWORDS;
    default: return JS_KEYWORDS;
  }
}

function isCType(word: string): boolean {
  return /^(int|long|short|char|float|double|void|unsigned|signed|size_t|ssize_t|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|bool|string|vector|map|set|auto|nullptr_t)$/.test(word);
}

function isPyBuiltin(word: string): boolean {
  return /^(int|str|float|bool|list|dict|set|tuple|bytes|range|len|print|open|type|isinstance|getattr|setattr|hasattr|super|object|Exception|ValueError|TypeError|KeyError|IndexError|RuntimeError|StopIteration|NotImplementedError|property|staticmethod|classmethod|enumerate|zip|map|filter|sorted|reversed|min|max|sum|abs|round|any|all|next|iter|format|input)$/.test(word);
}

export function tokenizeLine(line: string, lang: CodeLanguage): Token[] {
  if (lang === "json") return tokenizeJSON(line);
  if (lang === "css") return tokenizeCSS(line);
  if (lang === "html") return tokenizeHTML(line);
  if (lang === "markdown") return [{ text: line, type: "plain" }];
  if (lang === "yaml") return tokenizeYAML(line);
  if (lang === "sql") return tokenizeSQL(line);
  if (lang === "bash") return tokenizeBash(line);
  return tokenizeCode(line, lang);
}

function tokenizeCode(line: string, lang: CodeLanguage): Token[] {
  const tokens: Token[] = [];
  const keywords = getKeywords(lang);
  let i = 0;
  const len = line.length;

  const isWordChar = (c: string) => /[a-zA-Z0-9_$]/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);

  while (i < len) {
    const c = line[i];

    if (c === " " || c === "\t") {
      let j = i;
      while (j < len && (line[j] === " " || line[j] === "\t")) j++;
      tokens.push({ text: line.slice(i, j), type: "plain" });
      i = j;
      continue;
    }

    if (lang === "python" && c === "#") {
      tokens.push({ text: line.slice(i), type: "comment" });
      break;
    }

    if ((lang === "javascript" || lang === "typescript" || lang === "jsx" || lang === "tsx" || lang === "go" || lang === "rust" || lang === "java" || lang === "c" || lang === "cpp") && c === "/" && line[i + 1] === "/") {
      tokens.push({ text: line.slice(i), type: "comment" });
      break;
    }

    if ((lang === "javascript" || lang === "typescript" || lang === "jsx" || lang === "tsx" || lang === "c" || lang === "cpp") && c === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      const endIdx = end === -1 ? len : end + 2;
      tokens.push({ text: line.slice(i, endIdx), type: "comment" });
      i = endIdx;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < len) {
        if (line[j] === "\\") { j += 2; continue; }
        if (line[j] === quote) { j++; break; }
        j++;
      }
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }

    if (lang === "python" && (c === 'f' || c === 'r' || c === 'b') && (line[i + 1] === '"' || line[i + 1] === "'")) {
      const quote = line[i + 1];
      let j = i + 2;
      while (j < len) {
        if (line[j] === "\\") { j += 2; continue; }
        if (line[j] === quote) { j++; break; }
        j++;
      }
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }

    if (isDigit(c)) {
      let j = i + 1;
      while (j < len && /[0-9a-fA-FxXoObBeE._]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "number" });
      i = j;
      continue;
    }

    if (lang === "python" && line.slice(i, i + 3).match(/^[rbuRBU]['"]/)) {
      const quote = line[i + 2];
      let j = i + 3;
      while (j < len && line[j] !== quote) j++;
      j++;
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }

    if (isWordChar(c)) {
      let j = i + 1;
      while (j < len && isWordChar(line[j])) j++;
      const word = line.slice(i, j);

      if (keywords.has(word)) {
        tokens.push({ text: word, type: "keyword" });
      } else if (lang === "python" && isPyBuiltin(word)) {
        tokens.push({ text: word, type: "type" });
      } else if ((lang === "c" || lang === "cpp") && isCType(word)) {
        tokens.push({ text: word, type: "type" });
      } else if ((lang === "typescript" || lang === "tsx") && /^[A-Z]/.test(word)) {
        tokens.push({ text: word, type: "type" });
      } else if (line[j] === "(") {
        tokens.push({ text: word, type: "function" });
      } else if (word === "true" || word === "false" || word === "null" || word === "undefined" || word === "None" || word === "nil") {
        tokens.push({ text: word, type: "constant" });
      } else {
        tokens.push({ text: word, type: "plain" });
      }
      i = j;
      continue;
    }

    if (/[+\-*/%=<>!&|^~?:]/.test(c)) {
      let j = i + 1;
      while (j < len && /[+\-*/%=<>!&|^~?:]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "operator" });
      i = j;
      continue;
    }

    if (/[(){}\[\];,.]/.test(c)) {
      tokens.push({ text: c, type: "punctuation" });
      i++;
      continue;
    }

    tokens.push({ text: c, type: "plain" });
    i++;
  }

  return tokens;
}

function tokenizeJSON(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    const c = line[i];
    if (c === " " || c === "\t") {
      let j = i;
      while (j < len && (line[j] === " " || line[j] === "\t")) j++;
      tokens.push({ text: line.slice(i, j), type: "plain" });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < len) {
        if (line[j] === "\\") { j += 2; continue; }
        if (line[j] === '"') { j++; break; }
        j++;
      }
      const str = line.slice(i, j);
      if (line[j] === ":" || line.slice(j).match(/^\s*:/)) {
        tokens.push({ text: str, type: "property" });
      } else {
        tokens.push({ text: str, type: "string" });
      }
      i = j;
      continue;
    }
    if (/[0-9-]/.test(c)) {
      let j = i + 1;
      while (j < len && /[0-9.eE+-]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "number" });
      i = j;
      continue;
    }
    if (/[a-z]/.test(c)) {
      let j = i + 1;
      while (j < len && /[a-z]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "constant" });
      i = j;
      continue;
    }
    if (/[{}[\]:,]/.test(c)) {
      tokens.push({ text: c, type: "punctuation" });
      i++;
      continue;
    }
    tokens.push({ text: c, type: "plain" });
    i++;
  }
  return tokens;
}

function tokenizeCSS(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    const c = line[i];
    if (c === " " || c === "\t") {
      let j = i;
      while (j < len && (line[j] === " " || line[j] === "\t")) j++;
      tokens.push({ text: line.slice(i, j), type: "plain" });
      i = j;
      continue;
    }
    if (c === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2);
      const endIdx = end === -1 ? len : end + 2;
      tokens.push({ text: line.slice(i, endIdx), type: "comment" });
      i = endIdx;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < len && line[j] !== quote) j++;
      j++;
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }
    if (c === "." || c === "#" || c === ":") {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_-]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "tag" });
      i = j;
      continue;
    }
    if (c === "@") {
      let j = i + 1;
      while (j < len && /[a-zA-Z-]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "keyword" });
      i = j;
      continue;
    }
    if (/[a-zA-Z-]/.test(c)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9-]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (line[j] === ":") {
        tokens.push({ text: word, type: "property" });
      } else {
        tokens.push({ text: word, type: "function" });
      }
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < len && /[0-9a-z% .]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "number" });
      i = j;
      continue;
    }
    if (/[{};,()]/.test(c)) {
      tokens.push({ text: c, type: "punctuation" });
      i++;
      continue;
    }
    tokens.push({ text: c, type: "plain" });
    i++;
  }
  return tokens;
}

function tokenizeHTML(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    if (line.slice(i, i + 4) === "<!--") {
      const end = line.indexOf("-->", i + 4);
      const endIdx = end === -1 ? len : end + 3;
      tokens.push({ text: line.slice(i, endIdx), type: "comment" });
      i = endIdx;
      continue;
    }
    if (line[i] === "<") {
      let j = i + 1;
      if (line[j] === "/") j++;
      while (j < len && /[a-zA-Z0-9-]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "tag" });
      i = j;
      continue;
    }
    if (line[i] === ">" || (line[i] === "/" && line[i + 1] === ">")) {
      tokens.push({ text: line[i], type: "tag" });
      i++;
      continue;
    }
    if (line[i] === '"' || line[i] === "'") {
      const quote = line[i];
      let j = i + 1;
      while (j < len && line[j] !== quote) j++;
      j++;
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }
    if (/[a-zA-Z-]/.test(line[i])) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9-]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (line[j] === "=") {
        tokens.push({ text: word, type: "attr" });
      } else {
        tokens.push({ text: word, type: "plain" });
      }
      i = j;
      continue;
    }
    tokens.push({ text: line[i], type: "plain" });
    i++;
  }
  return tokens;
}

function tokenizeYAML(line: string): Token[] {
  const tokens: Token[] = [];
  const colonIdx = line.indexOf(":");
  if (colonIdx > 0 && !line.slice(0, colonIdx).includes("#")) {
    tokens.push({ text: line.slice(0, colonIdx), type: "property" });
    tokens.push({ text: ":", type: "punctuation" });
    const rest = line.slice(colonIdx + 1);
    if (rest.trim()) {
      if (rest.includes("#")) {
        const hashIdx = rest.indexOf("#");
        tokens.push({ text: rest.slice(0, hashIdx), type: "string" });
        tokens.push({ text: rest.slice(hashIdx), type: "comment" });
      } else {
        tokens.push({ text: rest, type: "string" });
      }
    }
    return tokens;
  }
  if (line.trimStart().startsWith("#")) {
    return [{ text: line, type: "comment" }];
  }
  return [{ text: line, type: "plain" }];
}

function tokenizeSQL(line: string): Token[] {
  const tokens: Token[] = [];
  const sqlKeywords = new Set([
    "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE",
    "SET", "DELETE", "CREATE", "TABLE", "DROP", "ALTER", "ADD", "COLUMN",
    "INDEX", "VIEW", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON",
    "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET", "AS", "AND",
    "OR", "NOT", "NULL", "IS", "IN", "EXISTS", "BETWEEN", "LIKE", "CASE",
    "WHEN", "THEN", "ELSE", "END", "DISTINCT", "ALL", "UNION", "PRIMARY",
    "KEY", "FOREIGN", "REFERENCES", "DEFAULT", "CONSTRAINT", "UNIQUE",
    "CASCADE", "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION",
  ]);
  let i = 0;
  const len = line.length;

  while (i < len) {
    const c = line[i];
    if (c === " " || c === "\t") {
      let j = i;
      while (j < len && (line[j] === " " || line[j] === "\t")) j++;
      tokens.push({ text: line.slice(i, j), type: "plain" });
      i = j;
      continue;
    }
    if (c === "-" && line[i + 1] === "-") {
      tokens.push({ text: line.slice(i), type: "comment" });
      break;
    }
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < len && line[j] !== quote) j++;
      j++;
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (sqlKeywords.has(word.toUpperCase())) {
        tokens.push({ text: word, type: "keyword" });
      } else if (line[j] === "(") {
        tokens.push({ text: word, type: "function" });
      } else {
        tokens.push({ text: word, type: "plain" });
      }
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < len && /[0-9.]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "number" });
      i = j;
      continue;
    }
    if (/[(){}[\],;.=<>!+\-*/]/.test(c)) {
      tokens.push({ text: c, type: "punctuation" });
      i++;
      continue;
    }
    tokens.push({ text: c, type: "plain" });
    i++;
  }
  return tokens;
}

function tokenizeBash(line: string): Token[] {
  const tokens: Token[] = [];
  const keywords = BASH_KEYWORDS;
  let i = 0;
  const len = line.length;

  while (i < len) {
    const c = line[i];
    if (c === " " || c === "\t") {
      let j = i;
      while (j < len && (line[j] === " " || line[j] === "\t")) j++;
      tokens.push({ text: line.slice(i, j), type: "plain" });
      i = j;
      continue;
    }
    if (c === "#") {
      tokens.push({ text: line.slice(i), type: "comment" });
      break;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < len && line[j] !== quote) j++;
      j++;
      tokens.push({ text: line.slice(i, j), type: "string" });
      i = j;
      continue;
    }
    if (c === "$") {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_{}]/.test(line[j])) j++;
      tokens.push({ text: line.slice(i, j), type: "variable" });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < len && /[a-zA-Z0-9_-]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (keywords.has(word)) {
        tokens.push({ text: word, type: "keyword" });
      } else {
        tokens.push({ text: word, type: "plain" });
      }
      i = j;
      continue;
    }
    if (/[|&;<>()]/.test(c)) {
      tokens.push({ text: c, type: "operator" });
      i++;
      continue;
    }
    tokens.push({ text: c, type: "plain" });
    i++;
  }
  return tokens;
}
