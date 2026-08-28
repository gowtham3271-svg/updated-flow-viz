import { useState, useMemo, useCallback } from "react";
import {
  ChevronRight, ChevronDown, FileCode2, FileJson, FileText,
  Folder, FolderOpen, FileCog, FileType2, Hash, Braces, Globe,
  Plus, Search, Upload, Trash2,
} from "lucide-react";
import type { TreeNode, CodeLanguage } from "@/types";
import { getLanguageColor } from "@/lib/fileUtils";

interface FileTreeProps {
  tree: TreeNode;
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
  onAddFile: () => void;
  onUploadFolder: () => void;
  fileCount: number;
}

function getFileIcon(name: string, lang: CodeLanguage) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (lang === "json" || ext === "json") return <FileJson size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "markdown" || ext === "md") return <FileText size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "css" || ext === "css") return <Hash size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "html" || ext === "html") return <Globe size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "yaml" || ext === "yml" || ext === "yaml") return <FileCog size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "sql" || ext === "sql") return <FileCog size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "bash" || ext === "sh") return <FileCog size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "python" || ext === "py") return <FileCode2 size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "typescript" || ext === "ts") return <FileCode2 size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "tsx") return <FileType2 size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "jsx") return <FileType2 size={14} style={{ color: getLanguageColor(lang) }} />;
  if (lang === "javascript" || ext === "js") return <FileCode2 size={14} style={{ color: getLanguageColor(lang) }} />;
  return <Braces size={14} style={{ color: getLanguageColor(lang) }} />;
}

function TreeItem({
  node,
  depth,
  activeFilePath,
  onFileSelect,
  expandedFolders,
  toggleFolder,
}: {
  node: TreeNode;
  depth: number;
  activeFilePath: string | null;
  onFileSelect: (path: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
}) {
  const paddingLeft = depth * 12 + 8;

  if (node.type === "folder") {
    const isExpanded = expandedFolders.has(node.path);
    return (
      <div>
        <button
          onClick={() => toggleFolder(node.path)}
          className="w-full flex items-center gap-1 py-1 pr-2 text-left text-xs text-fg-secondary hover:bg-app-hover transition-colors group"
          style={{ paddingLeft }}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-fg-faint flex-shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-fg-faint flex-shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen size={14} className="text-accent-secondary flex-shrink-0" />
          ) : (
            <Folder size={14} className="text-accent-secondary flex-shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
          {node.children && (
            <span className="text-fg-faint text-[10px] ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              {node.children.length}
            </span>
          )}
        </button>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                onFileSelect={onFileSelect}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFilePath === node.path;
  return (
    <button
      onClick={() => onFileSelect(node.path)}
      className={`w-full flex items-center gap-1.5 py-1 pr-2 text-left text-xs transition-colors ${
        isActive
          ? "bg-accent-primary/15 text-accent-primary"
          : "text-fg-secondary hover:bg-app-hover"
      }`}
      style={{ paddingLeft: paddingLeft + 2 }}
    >
      <span className="flex-shrink-0">{getFileIcon(node.name, node.language ?? "text")}</span>
      <span className={`truncate ${isActive ? "font-medium" : ""}`}>{node.name}</span>
    </button>
  );
}

export function FileTree({
  tree,
  activeFilePath,
  onFileSelect,
  onAddFile,
  onUploadFolder,
  fileCount,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const filteredTree = useMemo(() => {
    if (!filter.trim()) return tree;
    const lower = filter.toLowerCase();
    const filterNode = (node: TreeNode): TreeNode | null => {
      if (node.type === "file") {
        if (node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)) {
          return node;
        }
        return null;
      }
      const filteredChildren = (node.children ?? [])
        .map(filterNode)
        .filter((n): n is TreeNode => n !== null);
      if (filteredChildren.length === 0) return null;
      return { ...node, children: filteredChildren };
    };
    const filtered = filterNode(tree);
    return filtered ?? tree;
  }, [tree, filter]);

  const allFolderPaths = useMemo(() => {
    const paths: string[] = [];
    const collect = (node: TreeNode) => {
      if (node.type === "folder") {
        paths.push(node.path);
        (node.children ?? []).forEach(collect);
      }
    };
    (tree.children ?? []).forEach(collect);
    return paths;
  }, [tree]);

  const expandAll = () => setExpandedFolders(new Set(allFolderPaths));
  const collapseAll = () => setExpandedFolders(new Set());

  return (
    <div className="flex flex-col h-full bg-app-panel backdrop-blur-xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-secondary">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddFile}
            className="p-1 rounded hover:bg-app-hover text-fg-muted hover:text-accent-primary transition-colors"
            title="New file"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onUploadFolder}
            className="p-1 rounded hover:bg-app-hover text-fg-muted hover:text-accent-primary transition-colors"
            title="Upload folder"
          >
            <Upload size={14} />
          </button>
        </div>
      </div>

      {fileCount > 0 && (
        <div className="px-3 py-2 border-b border-border-subtle">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter files..."
              className="w-full pl-7 pr-2 py-1.5 rounded-md bg-app-input text-xs text-fg-primary border border-border-subtle focus:border-accent-primary focus:outline-none"
            />
          </div>
          {filter && (
            <div className="flex gap-2 mt-1.5">
              <button onClick={expandAll} className="text-[10px] text-fg-muted hover:text-accent-primary">Expand all</button>
              <button onClick={collapseAll} className="text-[10px] text-fg-muted hover:text-accent-primary">Collapse all</button>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {fileCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <FolderOpen size={28} className="text-fg-faint mb-3 opacity-50" />
            <p className="text-xs text-fg-muted mb-3 leading-relaxed">
              No files loaded. Upload a folder or pick a sample project to get started.
            </p>
            <button
              onClick={onUploadFolder}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-primary/15 hover:bg-accent-primary/25 text-accent-primary text-xs font-medium border border-accent-primary/30 transition-all"
            >
              <Upload size={14} /> Upload Folder
            </button>
          </div>
        ) : (
          (filteredTree.children ?? []).map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={0}
              activeFilePath={activeFilePath}
              onFileSelect={onFileSelect}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          ))
        )}
      </div>

      {fileCount > 0 && (
        <div className="px-3 py-1.5 border-t border-border-subtle text-[10px] text-fg-faint">
          {fileCount} file{fileCount !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
