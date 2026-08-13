import type { CodeFile, CodeLanguage } from "@/types";

const EXT_MAP: Record<string, CodeLanguage> = {
  py: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  json: "json",
  css: "css",
  scss: "css",
  html: "html",
  htm: "html",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  vue: "html",
  svelte: "html",
  toml: "yaml",
  ini: "yaml",
  env: "bash",
  dockerfile: "bash",
  makefile: "bash",
};

export function detectLanguage(filename: string): CodeLanguage {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (filename.toLowerCase() === "dockerfile") return "bash";
  if (filename.toLowerCase() === "makefile") return "bash";
  return EXT_MAP[ext] ?? "text";
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "__pycache__", ".next",
  ".nuxt", ".output", ".vercel", ".cache", ".turbo", "coverage",
  ".venv", "venv", "env", ".env", ".idea", ".vscode", "target",
  ".gradle", ".maven", "out", "bin", "obj", ".pytest_cache",
  ".mypy_cache", ".ruff_cache", ".tox", "vendor", "Pods",
  ".svelte-kit", ".angular", "tmp", "logs", ".parcel-cache",
]);

const IGNORED_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif",
  "pdf", "zip", "tar", "gz", "rar", "7z", "dmg", "iso", "tgz",
  "exe", "dll", "so", "dylib", "bin", "dat", "db", "sqlite", "wasm",
  "mp3", "mp4", "avi", "mov", "wav", "flv", "webm", "ogg",
  "woff", "woff2", "ttf", "otf", "eot",
  "lock", "map", "pem", "key", "cert", "pub",
]);

const MAX_FILE_SIZE = 512 * 1024;
const MAX_FILES = 200;

export function shouldIgnoreFile(name: string): boolean {
  if (name === ".gitignore" || name === ".env") return true;
  if (name.startsWith(".")) return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IGNORED_EXTS.has(ext)) return true;
  if (name.endsWith(".min.js") || name.endsWith(".min.css")) return true;
  if (name.endsWith(".map")) return true;
  return false;
}

export function shouldIgnoreDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

async function processFile(file: File, relativePath: string, seen: Set<string>): Promise<CodeFile | null> {
  if (seen.has(relativePath)) return null;
  if (file.size > MAX_FILE_SIZE) return null;
  if (shouldIgnoreFile(file.name)) return null;
  seen.add(relativePath);
  const content = await readFileAsText(file);
  return {
    filename: file.name,
    path: relativePath,
    language: detectLanguage(file.name),
    content,
  };
}

export async function readFilesFromPicker(
  items: DataTransferItemList | FileList | File[],
  onProgress?: (count: number) => void,
): Promise<CodeFile[]> {
  const files: CodeFile[] = [];
  const seen = new Set<string>();

  if (items instanceof DataTransferItemList) {
    const entryPromises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        entryPromises.push(traverseEntry(entry, "", files, seen, onProgress));
      } else {
        const file = item.getAsFile();
        if (file) {
          const cf = await processFile(file, file.name, seen);
          if (cf) {
            files.push(cf);
            onProgress?.(files.length);
          }
        }
      }
    }
    await Promise.all(entryPromises);
  } else {
    const fileList = items instanceof FileList ? Array.from(items) : Array.from(items);
    for (const file of fileList) {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const cf = await processFile(file, relativePath, seen);
      if (cf) {
        files.push(cf);
        onProgress?.(files.length);
      }
      if (files.length >= MAX_FILES) break;
    }
  }

  return files.slice(0, MAX_FILES);
}

function traverseEntry(
  entry: FileSystemEntry,
  prefix: string,
  files: CodeFile[],
  seen: Set<string>,
  onProgress?: (count: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (shouldIgnoreFile(entry.name)) return resolve();
      if (files.length >= MAX_FILES) return resolve();
      fileEntry.file(async (file: File) => {
        if (file.size > MAX_FILE_SIZE) return resolve();
        if (seen.has(path)) return resolve();
        seen.add(path);
        const content = await readFileAsText(file);
        files.push({
          filename: entry.name,
          path,
          language: detectLanguage(entry.name),
          content,
        });
        onProgress?.(files.length);
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      if (shouldIgnoreDir(entry.name)) return resolve();
      const dirEntry = entry as FileSystemDirectoryEntry;
      const dirPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const reader = dirEntry.createReader();
      readAllEntries(reader, dirPath, files, seen, onProgress).then(resolve);
    } else {
      resolve();
    }
  });
}

function readAllEntries(
  reader: FileSystemDirectoryReader,
  dirPath: string,
  files: CodeFile[],
  seen: Set<string>,
  onProgress?: (count: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const allEntries: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((entries: FileSystemEntry[]) => {
        if (entries.length === 0) {
          Promise.all(allEntries.map((e) => traverseEntry(e, dirPath, files, seen, onProgress))).then(() => resolve());
        } else {
          allEntries.push(...entries);
          readBatch();
        }
      }, () => resolve());
    };
    readBatch();
  });
}

export function formatFileCount(n: number): string {
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

export function getLanguageLabel(lang: CodeLanguage): string {
  const labels: Partial<Record<CodeLanguage, string>> = {
    python: "Python",
    javascript: "JavaScript",
    typescript: "TypeScript",
    jsx: "JSX",
    tsx: "TSX",
    json: "JSON",
    css: "CSS",
    html: "HTML",
    yaml: "YAML",
    markdown: "Markdown",
    text: "Plain Text",
    sql: "SQL",
    bash: "Shell",
    go: "Go",
    rust: "Rust",
    java: "Java",
    c: "C",
    cpp: "C++",
  };
  return labels[lang] ?? "Text";
}

export function getLanguageColor(lang: CodeLanguage): string {
  const colors: Partial<Record<CodeLanguage, string>> = {
    python: "#3776ab",
    javascript: "#f7df1e",
    typescript: "#3178c6",
    jsx: "#61dafb",
    tsx: "#3178c6",
    json: "#cbcb41",
    css: "#1572b6",
    html: "#e34c26",
    yaml: "#cb171e",
    markdown: "#083fa1",
    text: "#6b7280",
    sql: "#e38c00",
    bash: "#4eaa25",
    go: "#00add8",
    rust: "#dea584",
    java: "#b07219",
    c: "#555555",
    cpp: "#f34b7d",
  };
  return colors[lang] ?? "#6b7280";
}
