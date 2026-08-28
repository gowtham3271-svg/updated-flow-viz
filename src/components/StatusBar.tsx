import { GitBranch, Boxes, Eye, Wifi, Check, Loader2, Sun, Moon } from "lucide-react";
import type { CodeLanguage } from "@/types";
import { getLanguageLabel } from "@/lib/fileUtils";

interface StatusBarProps {
  language: CodeLanguage | null;
  cursorLine: number;
  cursorCol: number;
  nodeCount: number;
  edgeCount: number;
  analyzing: boolean;
  fileCount: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function StatusBar({
  language, cursorLine, cursorCol, nodeCount, edgeCount, analyzing, fileCount, theme, onToggleTheme,
}: StatusBarProps) {
  return (
    <footer
      className="flex items-center justify-between px-4 py-1 text-[10px] font-mono z-20 flex-shrink-0"
      style={{
        background: "linear-gradient(90deg, rgba(0,12,28,0.98) 0%, rgba(0,8,22,0.98) 50%, rgba(0,12,28,0.98) 100%)",
        borderTop: "1px solid rgba(0,212,255,0.12)",
        color: "rgba(100,140,180,0.85)"
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5" style={{ color: "rgba(0,212,255,0.6)" }}>
          <GitBranch size={10} /> main
        </span>
        <span className="flex items-center gap-1.5">
          <Boxes size={10} /> {fileCount} file{fileCount !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "rgba(0,212,255,0.5)" }}>
          <Eye size={10} /> {nodeCount} node{nodeCount !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "rgba(167,139,250,0.5)" }}>
          <Wifi size={10} /> {edgeCount} link{edgeCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {analyzing ? (
          <span className="flex items-center gap-1.5" style={{ color: "#4ade80" }}>
            <Loader2 size={10} className="animate-spin" /> Analyzing…
          </span>
        ) : (
          <span className="flex items-center gap-1.5" style={{ color: "#4ade80" }}>
            <Check size={10} /> Ready
          </span>
        )}
        {language && (
          <span style={{ color: "rgba(0,212,255,0.5)" }}>{getLanguageLabel(language)}</span>
        )}
        <span>Ln {cursorLine}, Col {cursorCol}</span>
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-1 transition-colors hover:text-cyan-400"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun size={10} /> : <Moon size={10} />}
          {theme === "dark" ? "Light" : "Dark"}
        </button>

        {/* Live indicator */}
        <span className="flex items-center gap-1 uppercase tracking-wider" style={{ color: "rgba(0,212,255,0.35)", fontSize: 9 }}>
          <span className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
          FlowViz Live
        </span>
      </div>
    </footer>
  );
}
