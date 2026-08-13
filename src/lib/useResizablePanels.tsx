import { useState, useRef, useCallback, useEffect } from "react";

export interface PanelSizes {
  fileTree: number;
  editor: number;
  details: number;
  chat: number;
}

const DEFAULT_SIZES: PanelSizes = {
  fileTree: 240,
  editor: 380,
  details: 280,
  chat: 320,
};

const MIN_SIZES = {
  fileTree: 140,
  editor: 200,
  details: 200,
  chat: 240,
};

const MAX_SIZES = {
  fileTree: 500,
  editor: 700,
  details: 500,
  chat: 600,
};

const STORAGE_KEY = "flowviz_panel_sizes";

export function useResizablePanels() {
  const [sizes, setSizes] = useState<PanelSizes>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULT_SIZES, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return DEFAULT_SIZES;
  });

  const draggingRef = useRef<keyof PanelSizes | null>(null);
  const startXRef = useRef(0);
  const startSizeRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
    } catch { /* ignore */ }
  }, [sizes]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    const delta = e.clientX - startXRef.current;
    const key = draggingRef.current;
    const min = MIN_SIZES[key];
    const max = MAX_SIZES[key];
    const newSize = Math.min(max, Math.max(min, startSizeRef.current + delta));
    setSizes((prev) => ({ ...prev, [key]: newSize }));
  }, []);

  const onMouseUp = useCallback(() => {
    draggingRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }, [onMouseMove]);

  const startDrag = useCallback((e: React.MouseEvent, key: keyof PanelSizes) => {
    e.preventDefault();
    draggingRef.current = key;
    startXRef.current = e.clientX;
    startSizeRef.current = sizes[key];
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sizes, onMouseMove, onMouseUp]);

  const resetSize = useCallback((key: keyof PanelSizes) => {
    setSizes((prev) => ({ ...prev, [key]: DEFAULT_SIZES[key] }));
  }, []);

  const resetAll = useCallback(() => setSizes(DEFAULT_SIZES), []);

  return { sizes, startDrag, resetSize, resetAll };
}

interface DividerProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  side: "left" | "right";
}

export function PanelDivider({ onMouseDown, onDoubleClick, side }: DividerProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={`w-1 flex-shrink-0 cursor-col-resize group relative z-20 transition-colors ${
        side === "left" ? "border-r" : "border-l"
      } border-transparent hover:border-accent-primary/40`}
    >
      <div className="absolute inset-y-0 -left-1 -right-1 z-20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-border-strong group-hover:bg-accent-primary/60 transition-colors" />
    </div>
  );
}
