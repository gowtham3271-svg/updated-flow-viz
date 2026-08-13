import type { CodeFile, TreeNode, CodeLanguage } from "@/types";
import { detectLanguage } from "@/lib/fileUtils";

export function buildFileTree(files: CodeFile[]): TreeNode {
  const root: TreeNode = { name: "", path: "", type: "folder", children: [] };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");

      if (isLast) {
        current.children!.push({
          name: part,
          path: fullPath,
          type: "file",
          language: file.language,
        });
      } else {
        let folder = current.children!.find(
          (c) => c.type === "folder" && c.name === part,
        );
        if (!folder) {
          folder = {
            name: part,
            path: fullPath,
            type: "folder",
            children: [],
          };
          current.children!.push(folder);
        }
        current = folder;
      }
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.type === "folder") sortTree(child);
  }
}

export function findFileIndex(files: CodeFile[], path: string): number {
  return files.findIndex((f) => f.path === path);
}

export function getShortName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function getDirPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export function getLanguageForFile(file: CodeFile): CodeLanguage {
  return file.language || detectLanguage(file.filename);
}

export function countFilesByLanguage(files: CodeFile[]): Map<CodeLanguage, number> {
  const counts = new Map<CodeLanguage, number>();
  for (const f of files) {
    const lang = getLanguageForFile(f);
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return counts;
}
