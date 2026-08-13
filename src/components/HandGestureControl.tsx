import { useRef, useEffect, useState, useCallback } from "react";
import { CameraOff, Loader2, Zap, Gauge } from "lucide-react";
import { gestureEvents } from "@/lib/gestureEvents";

interface HandGestureControlProps {
  enabled: boolean;
  onToggle: () => void;
  onRotate?: (deltaX: number, deltaY: number) => void;
  onZoom?: (delta: number) => void;
  onResetView?: () => void;
  onNodeClickAt?: (screenX: number, screenY: number) => void;
}

type HandLandmark = { x: number; y: number; z: number };

const DEFAULT_HOLD_TIME = 250;
const FAST_HOLD_TIME = 140;

// Gesture colors
const GESTURE_COLORS = {
  open_palm: { primary: "#00d4ff", secondary: "rgba(0,212,255,0.4)", name: "ROTATE" },
  pinch:     { primary: "#fbbf24", secondary: "rgba(251,191,36,0.4)",  name: "ZOOM"   },
  point:     { primary: "#f472b6", secondary: "rgba(244,114,182,0.4)", name: "SELECT" },
  default:   { primary: "#38bdf8", secondary: "rgba(56,189,248,0.3)",  name: "TRACK"  },
};

export function HandGestureControl({
  enabled,
  onToggle,
  onRotate,
  onZoom,
  onResetView,
  onNodeClickAt,
}: HandGestureControlProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const circleProgressRef = useRef<SVGCircleElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handsRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const procCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Tracking refs
  const lastHandPos = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDist = useRef<number | null>(null);
  const pointHoldStart = useRef<number | null>(null);
  const twoHandsStart = useRef<number | null>(null);
  const isProcessingFrame = useRef<boolean>(false);
  const lastGestureRef = useRef<string>("default");
  const prevLandmarks = useRef<HandLandmark[] | null>(null);

  const [turboMode, setTurboMode] = useState(true);
  const [sensitivity, setSensitivity] = useState(1.8);
  const [status, setStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [handDetected, setHandDetected] = useState(false);
  const [currentGesture, setCurrentGesture] = useState("default");
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  const cleanup = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    handsRef.current = null;
    lastHandPos.current = null;
    pinchStartDist.current = null;
    pointHoldStart.current = null;
    twoHandsStart.current = null;
    isProcessingFrame.current = false;
    prevLandmarks.current = null;
    setStatus("idle");
    setHandDetected(false);
    setCurrentGesture("default");
    if (reticleRef.current) reticleRef.current.style.display = "none";
  }, []);

  useEffect(() => {
    if (!enabled) { cleanup(); return; }
    let cancelled = false;
    setStatus("loading");

    if (!procCanvasRef.current) {
      procCanvasRef.current = document.createElement("canvas");
      procCanvasRef.current.width = 320;
      procCanvasRef.current.height = 240;
      procCtxRef.current = procCanvasRef.current.getContext("2d", { willReadFrequently: true });
    }

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 }, facingMode: "user" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }

        if (!(window as any).Hands) {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js";
          s.crossOrigin = "anonymous";
          document.head.appendChild(s);
          await new Promise<void>((res, rej) => { s.onload = () => res(); s.onerror = () => rej(new Error("MediaPipe load failed")); });
        }
        if (cancelled) return;

        const HandsCtor = (window as any).Hands;
        const hands = new HandsCtor({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.4, minTrackingConfidence: 0.4, selfieMode: true });

        hands.onResults((results: any) => {
          if (cancelled) return;
          frameCountRef.current++;
          const now = performance.now();
          if (now - lastFpsTimeRef.current >= 1000) {
            setFps(Math.round(frameCountRef.current * 1000 / (now - lastFpsTimeRef.current)));
            frameCountRef.current = 0;
            lastFpsTimeRef.current = now;
          }

          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          const handsList = results.multiHandLandmarks ?? [];
          setHandDetected(handsList.length > 0);

          if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Draw camera frame slightly dimmed
            if (videoRef.current && videoRef.current.readyState >= 2) {
              ctx.globalAlpha = 0.35;
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              ctx.globalAlpha = 1;
            }

            if (handsList.length > 0) {
              const gesture = handsList.length === 2 ? "two_hands" : detectGesture3D(handsList[0]).name;
              const gColor = GESTURE_COLORS[gesture as keyof typeof GESTURE_COLORS] ?? GESTURE_COLORS.default;
              for (const landmarks of handsList) {
                drawGlowingSkeleton(ctx, landmarks, canvas.width, canvas.height, gColor.primary, gColor.secondary);
              }
              // Ghost trail from previous frame
              if (prevLandmarks.current && handsList.length === 1) {
                drawGhostTrail(ctx, prevLandmarks.current, canvas.width, canvas.height, gColor.primary);
              }
              prevLandmarks.current = handsList.length === 1 ? [...handsList[0]] : null;
            } else {
              prevLandmarks.current = null;
            }
          }

          // 2 Hands Gesture: Reset
          if (handsList.length === 2) {
            updateGestureText("two_hands");
            hideReticle();
            if (!twoHandsStart.current) twoHandsStart.current = performance.now();
            else if (performance.now() - twoHandsStart.current > 400) {
              onResetView?.(); gestureEvents.emit("reset", true); twoHandsStart.current = null;
            }
            lastHandPos.current = null; pinchStartDist.current = null; pointHoldStart.current = null;
            return;
          } else { twoHandsStart.current = null; }

          if (handsList.length === 1) {
            const landmarks = handsList[0] as HandLandmark[];
            const gesture = detectGesture3D(landmarks);
            updateGestureText(gesture.name || "default");

            const holdThreshold = turboMode ? FAST_HOLD_TIME : DEFAULT_HOLD_TIME;
            const multiplier = sensitivity * (turboMode ? 1.5 : 1.0);

            if (gesture.name === "pinch") {
              const thumb = landmarks[4], index = landmarks[8];
              const currentDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
              if (pinchStartDist.current !== null) {
                const delta = (pinchStartDist.current - currentDist) * 35 * multiplier;
                onZoom?.(delta); gestureEvents.emit("zoom", { delta });
              }
              pinchStartDist.current = currentDist;
              lastHandPos.current = null; pointHoldStart.current = null; hideReticle();
            } else if (gesture.name === "open_palm") {
              const palmX = landmarks[9].x, palmY = landmarks[9].y;
              if (lastHandPos.current) {
                const dx = (palmX - lastHandPos.current.x) * 320 * multiplier;
                const dy = (palmY - lastHandPos.current.y) * 220 * multiplier;
                onRotate?.(dx, dy); gestureEvents.emit("rotate", { dx, dy });
              }
              lastHandPos.current = { x: palmX, y: palmY };
              pinchStartDist.current = null; pointHoldStart.current = null; hideReticle();
            } else if (gesture.name === "point") {
              const indexTip = landmarks[8];
              const screenX = indexTip.x * window.innerWidth;
              const screenY = indexTip.y * window.innerHeight;
              updateReticlePos(screenX, screenY);
              if (!pointHoldStart.current) { pointHoldStart.current = performance.now(); updateReticleProgress(0); }
              else {
                const elapsed = performance.now() - pointHoldStart.current;
                const progress = Math.min(elapsed / holdThreshold, 1);
                updateReticleProgress(progress);
                if (elapsed >= holdThreshold) {
                  onNodeClickAt?.(screenX, screenY); gestureEvents.emit("click", { x: screenX, y: screenY });
                  pointHoldStart.current = null; updateReticleProgress(0);
                }
              }
              lastHandPos.current = null; pinchStartDist.current = null;
            } else {
              lastHandPos.current = null; pinchStartDist.current = null; pointHoldStart.current = null; hideReticle();
            }
          } else {
            lastHandPos.current = null; pinchStartDist.current = null; pointHoldStart.current = null;
            updateGestureText("default"); hideReticle();
          }
        });

        handsRef.current = hands;
        setStatus("active");

        const processFrame = async () => {
          if (cancelled) return;
          if (!isProcessingFrame.current && handsRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            isProcessingFrame.current = true;
            try {
              const pc = procCanvasRef.current, pCtx = procCtxRef.current;
              if (pc && pCtx) { pCtx.drawImage(videoRef.current, 0, 0, pc.width, pc.height); await handsRef.current.send({ image: pc }); }
              else await handsRef.current.send({ image: videoRef.current });
            } catch { /* frame dropped */ } finally { isProcessingFrame.current = false; }
          }
          rafRef.current = requestAnimationFrame(processFrame);
        };
        processFrame();
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission denied." : "Hand tracking engine failed: " + (err instanceof Error ? err.message : ""));
      }
    };

    init();
    return () => { cancelled = true; cleanup(); };
  }, [enabled, turboMode, sensitivity]);

  const updateReticlePos = (x: number, y: number) => {
    if (reticleRef.current) {
      reticleRef.current.style.display = "flex";
      reticleRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }
  };
  const hideReticle = () => { if (reticleRef.current) reticleRef.current.style.display = "none"; };
  const updateReticleProgress = (p: number) => {
    if (circleProgressRef.current) circleProgressRef.current.style.strokeDashoffset = `${125.6 * (1 - p)}`;
  };
  const updateGestureText = (g: string) => {
    if (g !== lastGestureRef.current) { lastGestureRef.current = g; setCurrentGesture(g); }
  };

  const gestureInfo = GESTURE_COLORS[currentGesture as keyof typeof GESTURE_COLORS] ?? GESTURE_COLORS.default;

  return (
    <>
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Gesture reticle */}
      {enabled && (
        <div ref={reticleRef} className="fixed pointer-events-none z-50 top-0 left-0 hidden items-center justify-center will-change-transform">
          <div className="w-7 h-7 rounded-full border-2 border-pink-400 bg-pink-500/20 shadow-[0_0_20px_rgba(244,114,182,0.9)] flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-pink-300" />
          </div>
          <svg className="absolute w-12 h-12 -rotate-90">
            <circle cx="24" cy="24" r="20" stroke="rgba(244,114,182,0.25)" strokeWidth="3" fill="transparent" />
            <circle ref={circleProgressRef} cx="24" cy="24" r="20" stroke="#f472b6" strokeWidth="3" fill="transparent"
              strokeDasharray={125.6} strokeDashoffset={125.6} strokeLinecap="round" className="transition-all duration-75" />
          </svg>
        </div>
      )}

      {/* Hand control panel */}
      {enabled && (
        <div className="absolute bottom-20 left-4 z-30 flex flex-col gap-2 animate-slide-up">
          {/* Camera + skeleton preview */}
          <div className="relative rounded-2xl overflow-hidden border border-cyan-500/40 shadow-[0_0_30px_rgba(0,0,0,0.7),0_0_15px_rgba(0,212,255,0.15)] bg-slate-950">
            <canvas ref={canvasRef} width={200} height={150} className="block" style={{ width: 200, height: 150 }} />

            {/* FPS badge */}
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/70 border border-white/10 text-[10px] font-mono">
              <span className={`w-1.5 h-1.5 rounded-full ${status === "active" ? "bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" : status === "loading" ? "bg-amber-400 animate-ping" : "bg-red-400"}`} />
              <span className="text-white">{status === "active" ? `${fps} FPS` : status.toUpperCase()}</span>
            </div>

            {/* Gesture badge */}
            {handDetected && (
              <div className="absolute bottom-2 left-2 right-2">
                <div
                  className="flex items-center justify-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider border"
                  style={{ color: gestureInfo.primary, borderColor: gestureInfo.secondary, background: `${gestureInfo.secondary}`, textShadow: `0 0 10px ${gestureInfo.primary}` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: gestureInfo.primary, boxShadow: `0 0 6px ${gestureInfo.primary}` }} />
                  {gestureInfo.name}
                </div>
              </div>
            )}

            {/* Scan line effect */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
              <div className="absolute left-0 right-0 h-px opacity-30 animate-jarvis-scan" style={{ background: `linear-gradient(90deg, transparent, ${gestureInfo.primary}, transparent)` }} />
            </div>
          </div>

          {/* Speed controls */}
          <div className="glass-panel rounded-xl p-3 text-xs space-y-2.5 max-w-[210px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                <Gauge size={11} className="text-cyan-400" /> Speed
              </span>
              <button
                onClick={() => setTurboMode(v => !v)}
                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1 transition-all ${turboMode ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-[0_0_10px_rgba(251,191,36,0.4)]" : "bg-slate-800 text-slate-400 border border-slate-700"}`}
              >
                <Zap size={9} /> {turboMode ? "TURBO" : "NORMAL"}
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Sensitivity</span>
                <span className="text-cyan-400 font-mono font-bold jarvis-text" style={{ fontSize: 10 }}>{sensitivity.toFixed(1)}×</span>
              </div>
              <input type="range" min="1.0" max="3.0" step="0.1" value={sensitivity}
                onChange={e => setSensitivity(parseFloat(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer accent-cyan-400 bg-slate-800" />
            </div>

            <div className="h-px bg-slate-800" />

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              {[
                { label: "Open Palm", action: "Rotate", color: "#00d4ff" },
                { label: "Pinch",     action: "Zoom",   color: "#fbbf24" },
                { label: "Point",     action: "Select", color: "#f472b6" },
                { label: "2 Hands",   action: "Reset",  color: "#a78bfa" },
              ].map(({ label, action, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                  <span className="text-slate-500 truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {enabled && status === "loading" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl glass-panel">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-2 border-cyan-400/30 animate-jarvis-glow-ring" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={24} className="text-cyan-400 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold jarvis-text">INITIALIZING GESTURE ENGINE</p>
              <p className="text-[11px] text-slate-500 mt-1 font-mono">Loading MediaPipe model...</p>
            </div>
          </div>
        </div>
      )}

      {/* Error card */}
      {enabled && status === "error" && (
        <div className="absolute bottom-20 left-4 z-30 max-w-[280px] animate-slide-up">
          <div className="flex items-start gap-3 bg-rose-950/90 border border-rose-500/40 rounded-xl p-4 shadow-2xl">
            <CameraOff size={18} className="flex-shrink-0 text-rose-400 mt-0.5" />
            <div className="space-y-2">
              <p className="text-xs text-rose-200 leading-relaxed">{errorMsg}</p>
              <button onClick={onToggle} className="text-[11px] px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-all">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Gesture Detection ─── */
function detectGesture3D(landmarks: HandLandmark[]): { name: string } {
  const wrist = landmarks[0], thumbTip = landmarks[4], indexTip = landmarks[8];
  const middleTip = landmarks[12], ringTip = landmarks[16], pinkyTip = landmarks[20];
  const indexMcp = landmarks[5], middleMcp = landmarks[9], ringMcp = landmarks[13], pinkyMcp = landmarks[17];
  const dist3D = (a: HandLandmark, b: HandLandmark) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  const palmSize = dist3D(wrist, middleMcp);
  if (palmSize === 0) return { name: "" };

  const indexExt  = dist3D(indexTip,  wrist) > dist3D(indexMcp,  wrist) * 1.12;
  const middleExt = dist3D(middleTip, wrist) > dist3D(middleMcp, wrist) * 1.12;
  const ringExt   = dist3D(ringTip,   wrist) > dist3D(ringMcp,   wrist) * 1.12;
  const pinkyExt  = dist3D(pinkyTip,  wrist) > dist3D(pinkyMcp,  wrist) * 1.12;

  if (dist3D(thumbTip, indexTip) < palmSize * 0.38) return { name: "pinch" };
  if (indexExt && !middleExt && !ringExt && !pinkyExt) return { name: "point" };
  if (indexExt && middleExt && ringExt && pinkyExt) return { name: "open_palm" };
  return { name: "" };
}

/* ─── Glowing Skeleton Renderer ─── */
function drawGlowingSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: HandLandmark[],
  w: number, h: number,
  primaryColor: string,
  glowColor: string
) {
  const connections = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],
    [0,17],[5,9],[9,13]
  ];
  const fingertips = new Set([4, 8, 12, 16, 20]);

  // Glow bones
  ctx.save();
  ctx.shadowColor = primaryColor;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 1.8;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  for (const [a, b] of connections) {
    ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
    ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
  }
  ctx.stroke();
  ctx.restore();

  // Draw joints
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    const x = lm.x * w, y = lm.y * h;
    const isTip = fingertips.has(i);

    ctx.save();
    if (isTip) {
      // Outer glow ring
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();
      // Inner bright dot
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      // Tiny center core
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
    } else {
      // Regular joint
      ctx.shadowColor = primaryColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ─── Ghost Trail ─── */
function drawGhostTrail(
  ctx: CanvasRenderingContext2D,
  landmarks: HandLandmark[],
  w: number, h: number,
  color: string
) {
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;
  for (let i = 0; i < landmarks.length; i++) {
    const { x, y } = landmarks[i];
    ctx.beginPath();
    ctx.arc(x * w, y * h, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}
