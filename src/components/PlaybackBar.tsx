import { Play, Pause, SkipForward, SkipBack, RotateCcw, Gauge } from "lucide-react";

interface PlaybackBarProps {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onRestart: () => void;
  activeStep: number | null;
  totalSteps: number;
  speed: number;
  onSpeedChange: (s: number) => void;
}

export function PlaybackBar({
  isPlaying, onPlay, onPause, onStepForward, onStepBack, onRestart,
  activeStep, totalSteps, speed, onSpeedChange,
}: PlaybackBarProps) {
  const btn = "p-2.5 rounded-xl bg-app-card backdrop-blur-md text-fg-secondary hover:text-fg-primary hover:bg-app-hover transition-all border border-border-subtle shadow-lg";

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-app-panel backdrop-blur-xl rounded-2xl border border-overlay-border shadow-2xl">
      <button onClick={onRestart} className={btn} title="Restart">
        <RotateCcw size={18} />
      </button>
      <button onClick={onStepBack} className={btn} title="Step back" disabled={activeStep === null || activeStep === 0}>
        <SkipBack size={18} />
      </button>

      {isPlaying ? (
        <button onClick={onPause} className="p-3 rounded-xl bg-accent-primary hover:opacity-90 text-white shadow-lg transition-all" title="Pause">
          <Pause size={20} fill="currentColor" />
        </button>
      ) : (
        <button onClick={onPlay} className="p-3 rounded-xl bg-accent-primary hover:opacity-90 text-white shadow-lg transition-all" title="Play">
          <Play size={20} fill="currentColor" />
        </button>
      )}

      <button onClick={onStepForward} className={btn} title="Step forward" disabled={activeStep !== null && activeStep >= totalSteps - 1}>
        <SkipForward size={18} />
      </button>

      <div className="flex items-center gap-2 ml-2">
        <Gauge size={16} className="text-fg-muted" />
        <input
          type="range"
          min={0.3}
          max={3}
          step={0.1}
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="w-20 accent-accent-primary"
        />
        <span className="text-xs text-fg-muted font-mono w-8">{speed.toFixed(1)}x</span>
      </div>

      {totalSteps > 0 && (
        <div className="ml-3 text-sm text-fg-muted font-mono">
          {activeStep === null ? "—" : activeStep + 1} / {totalSteps}
        </div>
      )}
    </div>
  );
}
