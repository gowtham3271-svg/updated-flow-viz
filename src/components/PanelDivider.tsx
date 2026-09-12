import React from "react";

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
