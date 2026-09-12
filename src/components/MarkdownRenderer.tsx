import { useState, useMemo } from "react";
import { Copy, Check, Terminal, Sparkles } from "lucide-react";
import { tokenizeLine, type Token } from "@/lib/syntaxHighlight";
import type { CodeLanguage } from "@/types";
import type { ParsedAction } from "@/lib/chat";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  actions?: ParsedAction[];
  onExecuteAction?: (action: ParsedAction) => void;
  className?: string;
}

const TOKEN_CLASS: Record<string, string> = {
  plain: "tok-plain",
  keyword: "tok-keyword",
  string: "tok-string",
  comment: "tok-comment",
  number: "tok-number",
  function: "tok-function",
  operator: "tok-operator",
  punctuation: "tok-punctuation",
  type: "tok-type",
  variable: "tok-variable",
  constant: "tok-constant",
  tag: "tok-tag",
  attr: "tok-attr",
  property: "tok-property",
};

function renderHighlightedTokens(tokens: Token[]): string {
  return tokens
    .map((t) => {
      const cls = TOKEN_CLASS[t.type] ?? "tok-plain";
      const escaped = t.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<span class="${cls}">${escaped}</span>`;
    })
    .join("");
}

function normalizeLanguage(lang: string): CodeLanguage {
  const l = lang.trim().toLowerCase();
  if (l === "ts" || l === "typescript") return "typescript";
  if (l === "js" || l === "javascript") return "javascript";
  if (l === "py" || l === "python") return "python";
  if (l === "go" || l === "golang") return "go";
  if (l === "rs" || l === "rust") return "rust";
  if (l === "java") return "java";
  if (l === "c") return "c";
  if (l === "cpp" || l === "c++") return "cpp";
  if (l === "html") return "html";
  if (l === "css") return "css";
  if (l === "json") return "json";
  if (l === "sql") return "sql";
  if (l === "bash" || l === "sh" || l === "shell" || l === "zsh") return "bash";
  if (l === "yaml" || l === "yml") return "yaml";
  return "typescript";
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const normLang = normalizeLanguage(language);
  const lines = code.trimEnd().split("\n");

  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-cyan-500/25 bg-slate-950/80 shadow-lg text-[11px] font-mono">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-cyan-500/20 text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Terminal size={12} className="text-cyan-400" />
          <span className="uppercase font-bold tracking-wider text-cyan-300">
            {language || "code"}
          </span>
          <span className="text-[9px] text-slate-500">({lines.length} lines)</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check size={11} className="text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <div className="p-3 overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => {
              const tokens = tokenizeLine(line, normLang);
              const highlighted = renderHighlightedTokens(tokens);
              return (
                <tr key={idx} className="hover:bg-cyan-500/5 leading-relaxed">
                  <td className="pr-3 text-right select-none text-slate-600 text-[10px] w-8">
                    {idx + 1}
                  </td>
                  <td
                    className="whitespace-pre break-all"
                    dangerouslySetInnerHTML={{ __html: highlighted || "&nbsp;" }}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MarkdownRenderer({
  content,
  isStreaming = false,
  actions = [],
  onExecuteAction,
  className = "",
}: MarkdownRendererProps) {
  // Parse content into blocks (code blocks, headings, paragraphs, lists)
  const blocks = useMemo(() => {
    // Strip [ACTION:...] tags for text rendering (they are rendered as interactive action pills)
    const clean = content.replace(/\[ACTION:[^\]]+\]/gi, "").trim();
    if (!clean) return [];

    const segments: Array<
      | { type: "code"; language: string; code: string }
      | { type: "heading"; level: number; text: string }
      | { type: "list"; items: string[]; ordered: boolean }
      | { type: "paragraph"; text: string }
    > = [];

    // Split by code blocks ```...```
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(clean)) !== null) {
      const textBefore = clean.slice(lastIndex, match.index).trim();
      if (textBefore) {
        parseTextBlocks(textBefore, segments);
      }
      segments.push({
        type: "code",
        language: match[1] || "typescript",
        code: match[2],
      });
      lastIndex = match.index + match[0].length;
    }

    const remainingText = clean.slice(lastIndex).trim();
    if (remainingText) {
      parseTextBlocks(remainingText, segments);
    }

    return segments;
  }, [content]);

  return (
    <div className={`space-y-2 text-[12px] leading-relaxed select-text ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return <CodeBlock key={idx} language={block.language} code={block.code} />;
        }
        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h1 key={idx} className="text-sm font-bold font-mono tracking-wide text-cyan-300 mt-2 mb-1 flex items-center gap-1.5 border-b border-cyan-500/20 pb-1">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                {renderInlineFormatted(block.text)}
              </h1>
            );
          }
          if (block.level === 2) {
            return (
              <h2 key={idx} className="text-[13px] font-bold font-mono tracking-wide text-cyan-200 mt-2 mb-1 flex items-center gap-1.5">
                <span className="w-1 h-1 bg-cyan-400 rounded-full" />
                {renderInlineFormatted(block.text)}
              </h2>
            );
          }
          return (
            <h3 key={idx} className="text-[12px] font-semibold font-mono tracking-wide text-cyan-100 mt-1 mb-0.5">
              {renderInlineFormatted(block.text)}
            </h3>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={idx} className="space-y-1 my-1 pl-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2">
                  {block.ordered ? (
                    <span className="font-mono text-cyan-400 font-bold text-[10px] flex-shrink-0 mt-0.5">
                      {itemIdx + 1}.
                    </span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 flex-shrink-0 mt-1.5" />
                  )}
                  <span className="flex-1">{renderInlineFormatted(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx} className="whitespace-pre-wrap break-words">
            {renderInlineFormatted(block.text)}
          </p>
        );
      })}

      {/* Real-time streaming pulse cursor */}
      {isStreaming && (
        <span
          className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-0.5 align-middle animate-pulse"
          style={{ boxShadow: "0 0 8px rgba(0,212,255,0.9)" }}
        />
      )}

      {/* Interactive Action Buttons */}
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1.5">
          {actions.map((act, actIdx) => (
            <button
              key={actIdx}
              onClick={() => onExecuteAction?.(act)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10.5px] font-mono font-medium transition-all hover:scale-105 active:scale-95"
              style={{
                background: "rgba(0,212,255,0.12)",
                border: "1px solid rgba(0,212,255,0.35)",
                color: "#67e8f9",
                boxShadow: "0 2px 8px rgba(0,212,255,0.15)",
              }}
              title={`Trigger action: ${act.label}`}
            >
              <Sparkles size={11} className="text-cyan-400" />
              <span>{act.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper: parse text blocks into headings, lists, and paragraphs
function parseTextBlocks(
  rawText: string,
  out: Array<
    | { type: "code"; language: string; code: string }
    | { type: "heading"; level: number; text: string }
    | { type: "list"; items: string[]; ordered: boolean }
    | { type: "paragraph"; text: string }
  >
) {
  const lines = rawText.split("\n");
  let currentList: { items: string[]; ordered: boolean } | null = null;
  let currentParagraphLines: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      out.push({ type: "paragraph", text: currentParagraphLines.join("\n") });
      currentParagraphLines = [];
    }
  };

  const flushList = () => {
    if (currentList && currentList.items.length > 0) {
      out.push({ type: "list", items: currentList.items, ordered: currentList.ordered });
      currentList = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Headings: #, ##, ###
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      out.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    // Unordered list: - or *
    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (!currentList || currentList.ordered) {
        flushList();
        currentList = { items: [], ordered: false };
      }
      currentList.items.push(unorderedMatch[1]);
      continue;
    }

    // Ordered list: 1. 2. etc
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (!currentList || !currentList.ordered) {
        flushList();
        currentList = { items: [], ordered: true };
      }
      currentList.items.push(orderedMatch[2]);
      continue;
    }

    // Blank line splits paragraphs
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    // Normal text line
    flushList();
    currentParagraphLines.push(line);
  }

  flushParagraph();
  flushList();
}

// Helper: render inline markdown (bold, inline code, italics)
function renderInlineFormatted(text: string): React.ReactNode {
  // Regex to split by inline code `...`, bold **...**, and italics *...*
  const parts: React.ReactNode[] = [];
  const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) {
      // Inline code
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/35 text-cyan-300 font-mono text-[11px] shadow-sm"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      // Bold
      parts.push(
        <strong key={match.index} className="font-bold text-cyan-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      // Italic
      parts.push(
        <em key={match.index} className="italic text-slate-300">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }

  return parts.length > 0 ? parts : text;
}
