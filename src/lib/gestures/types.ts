export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export type GestureType =
  | "open_palm"
  | "pinch"
  | "point"
  | "peace"
  | "thumbs_up"
  | "thumbs_down"
  | "fist"
  | "swipe_left"
  | "swipe_right"
  | "two_hands"
  | "none";

export type GestureState =
  | "IDLE"
  | "LISTENING"
  | "GESTURE_DETECTED"
  | "GESTURE_CONFIRMED"
  | "EXECUTING"
  | "COOLDOWN";

export interface DetectedGesture {
  type: GestureType;
  confidence: number;
  name: string;
  actionText: string;
  isContinuous: boolean;
}

export interface GestureTelemetry {
  state: GestureState;
  detectedGesture: GestureType;
  confirmedGesture: GestureType | null;
  confidence: number;
  stabilityProgress: number; // 0.0 to 1.0
  fps: number;
  handCount: number;
  actionText: string;
}

export interface GestureColorConfig {
  primary: string;
  secondary: string;
  name: string;
  action: string;
}

export const GESTURE_CONFIGS: Record<GestureType, GestureColorConfig> = {
  open_palm:   { primary: "#00d4ff", secondary: "rgba(0,212,255,0.4)", name: "OPEN PALM",   action: "ORBIT / ROTATE" },
  pinch:       { primary: "#fbbf24", secondary: "rgba(251,191,36,0.4)", name: "PINCH",       action: "ZOOM / SELECT" },
  point:       { primary: "#f472b6", secondary: "rgba(244,114,182,0.4)", name: "POINT",       action: "TARGET / DWELL" },
  peace:       { primary: "#10b981", secondary: "rgba(16,185,129,0.4)", name: "PEACE",       action: "JARVIS VOICE" },
  thumbs_up:   { primary: "#22c55e", secondary: "rgba(34,197,94,0.4)",  name: "THUMBS UP",   action: "RUN CODE" },
  thumbs_down: { primary: "#ef4444", secondary: "rgba(239,68,68,0.4)",  name: "THUMBS DOWN", action: "RESET VIEW" },
  fist:        { primary: "#a855f7", secondary: "rgba(168,85,247,0.4)", name: "FIST",        action: "PAUSE / CANCEL" },
  swipe_left:  { primary: "#38bdf8", secondary: "rgba(56,189,248,0.4)", name: "SWIPE LEFT",  action: "PREVIOUS STEP" },
  swipe_right: { primary: "#38bdf8", secondary: "rgba(56,189,248,0.4)", name: "SWIPE RIGHT", action: "NEXT STEP" },
  two_hands:   { primary: "#818cf8", secondary: "rgba(129,140,248,0.4)", name: "DUAL HANDS",  action: "RECALIBRATE" },
  none:        { primary: "#64748b", secondary: "rgba(100,116,139,0.2)", name: "SCANNING",   action: "LISTENING" },
};
