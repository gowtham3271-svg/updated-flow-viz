import { useRef, useEffect, useState, useCallback } from "react";
import { CameraOff, Loader2, Zap, Gauge, Eye, EyeOff, ShieldAlert, Sparkles } from "lucide-react";
import { gestureEvents } from "@/lib/gestureEvents";
import type { HandLandmark, GestureTelemetry, GestureType } from "@/lib/gestures/types";
import { GESTURE_CONFIGS } from "@/lib/gestures/types";
import { GestureClassifier } from "@/lib/gestures/classifier";
import { GestureStabilizer } from "@/lib/gestures/stabilizer";
import { HolographicRenderer } from "@/lib/gestures/holographicRenderer";

interface HandGestureControlProps {
  enabled: boolean;
  onToggle: () => void;
  onRotate?: (deltaX: number, deltaY: number) => void;
  onZoom?: (delta: number) => void;
  onResetView?: () => void;
  onNodeClickAt?: (screenX: number, screenY: number) => void;
  onAction?: (action: string) => void;
}

interface MediaPipeHands {
  setOptions: (opts: Record<string, unknown>) => void;
  onResults: (cb: (res: { multiHandLandmarks?: HandLandmark[][] }) => void) => void;
  send: (input: { image: HTMLCanvasElement | HTMLVideoElement }) => Promise<void>;
  close: () => void;
}

interface WindowWithHands extends Window {
  Hands?: new (config: { locateFile: (f: string) => string }) => MediaPipeHands;
}

export function HandGestureControl({
  enabled,
  onToggle,
  onRotate,
  onZoom,
  onResetView,
  onNodeClickAt,
  onAction,
}: HandGestureControlProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const circleProgressRef = useRef<SVGCircleElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handsRef = useRef<MediaPipeHands | null>(null);
  const rafRef = useRef<number | null>(null);
  const vfcRef = useRef<number | null>(null);

  // Gesture Engine instances
  const classifierRef = useRef<GestureClassifier>(new GestureClassifier());
  const stabilizerRef = useRef<GestureStabilizer>(new GestureStabilizer());
  const rendererRef = useRef<HolographicRenderer>(new HolographicRenderer());

  // Interactive configurations preserved in refs to avoid camera teardowns!
  const sensitivityRef = useRef<number>(1.8);
  const turboModeRef = useRef<boolean>(true);
  const dualHandModeRef = useRef<boolean>(false);
  const isProcessingFrame = useRef<boolean>(false);

  // Tracking state refs for continuous gestures
  const lastPalmPos = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const lastTwoHandDist = useRef<number | null>(null);
  const lastPointPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const pointDwellStart = useRef<number | null>(null);

  // High-level UI state
  const [status, setStatus] = useState<"idle" | "loading" | "active" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [turboMode, setTurboMode] = useState<boolean>(true);
  const [dualHandMode, setDualHandMode] = useState<boolean>(false);
  const [sensitivity, setSensitivity] = useState<number>(1.8);

  // Telemetry state throttled for display
  const [telemetry, setTelemetry] = useState<GestureTelemetry>({
    state: "IDLE",
    detectedGesture: "none",
    confirmedGesture: null,
    confidence: 0,
    stabilityProgress: 0,
    fps: 0,
    handCount: 0,
    actionText: "SYSTEM INITIALIZING",
  });

  const lastTelemetryRef = useRef<GestureTelemetry>({
    state: "IDLE",
    detectedGesture: "none",
    confirmedGesture: null,
    confidence: 0,
    stabilityProgress: 0,
    fps: 0,
    handCount: 0,
    actionText: "SYSTEM INITIALIZING",
  });

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const currentFpsRef = useRef(0);
  const lastTelemetryUpdateRef = useRef(0);

  // Cleanup camera stream, RAF, VFC, and MediaPipe instances
  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (videoRef.current && "cancelVideoFrameCallback" in videoRef.current && vfcRef.current !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (videoRef.current as any).cancelVideoFrameCallback(vfcRef.current);
      vfcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (handsRef.current) {
      try {
        handsRef.current.close();
      } catch {
        /* no-op */
      }
      handsRef.current = null;
    }

    stabilizerRef.current.reset();
    classifierRef.current.resetVelocityHistory();
    lastPalmPos.current = null;
    lastPinchDist.current = null;
    pointDwellStart.current = null;
    isProcessingFrame.current = false;

    setStatus("idle");
    if (reticleRef.current) reticleRef.current.style.display = "none";
  }, []);

  // Update refs when settings change without killing the camera!
  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  useEffect(() => {
    turboModeRef.current = turboMode;
    stabilizerRef.current.setStabilityThreshold(turboMode ? 130 : 220);
  }, [turboMode]);

  useEffect(() => {
    dualHandModeRef.current = dualHandMode;
    if (handsRef.current) {
      handsRef.current.setOptions({
        maxNumHands: dualHandMode ? 2 : 1,
      });
    }
  }, [dualHandMode]);

  // Main Camera & Hand-Tracking Lifecycle
  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    let cancelled = false;
    setStatus("loading");

    const initTracking = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 60 },
            facingMode: "user",
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Dynamically load MediaPipe Hands library once
        const win = window as unknown as WindowWithHands;
        if (!win.Hands) {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js";
          script.crossOrigin = "anonymous";
          document.head.appendChild(script);
          await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load J.A.R.V.I.S. vision model"));
          });
        }

        if (cancelled) return;

        const HandsCtor = win.Hands!;
        const hands = new HandsCtor({
          locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
        });

        // Configure MediaPipe for ultra-high FPS and steady tracking
        hands.setOptions({
          maxNumHands: dualHandModeRef.current ? 2 : 1, // Single hand default delivers up to 2x faster ML inference
          modelComplexity: 0, // Lite model for ultra-low latency
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          selfieMode: true,
        });

        // Process ML results
        hands.onResults((results: { multiHandLandmarks?: HandLandmark[][] }) => {
          if (cancelled) return;

          // FPS counter
          frameCountRef.current++;
          const now = performance.now();
          if (now - lastFpsTimeRef.current >= 1000) {
            currentFpsRef.current = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
            frameCountRef.current = 0;
            lastFpsTimeRef.current = now;
          }

          const handsList = results.multiHandLandmarks ?? [];
          const handCount = handsList.length;

          // Classify gesture
          let rawGesture = {
            type: "none" as GestureType,
            confidence: 0,
            name: GESTURE_CONFIGS.none.name,
            actionText: GESTURE_CONFIGS.none.action,
            isContinuous: false,
          };

          if (handCount === 1) {
            rawGesture = classifierRef.current.detectGesture(handsList[0], now);
          } else if (handCount >= 2) {
            rawGesture = {
              type: "two_hands",
              confidence: 0.98,
              name: GESTURE_CONFIGS.two_hands.name,
              actionText: GESTURE_CONFIGS.two_hands.action,
              isContinuous: false,
            };
          }

          // State Machine & Stabilization
          const {
            telemetry: currentTelemetry,
            shouldTriggerDiscreteAction,
            actionToTrigger,
          } = stabilizerRef.current.update(rawGesture, handCount, currentFpsRef.current, now);

          // Throttled UI state updates: compare against ref to fix the stale closure bug!
          const prev = lastTelemetryRef.current;
          const stateChanged = currentTelemetry.state !== prev.state;
          const gestureChanged = currentTelemetry.detectedGesture !== prev.detectedGesture;
          const timeElapsed = now - lastTelemetryUpdateRef.current >= 80;

          if (stateChanged || gestureChanged || timeElapsed) {
            lastTelemetryRef.current = currentTelemetry;
            lastTelemetryUpdateRef.current = now;
            setTelemetry(currentTelemetry);
          }

          // Render Holographic 2D Visualizer
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              rendererRef.current.draw(ctx, videoRef.current, handsList, currentTelemetry, canvas.width, canvas.height);
            }
          }

          // Handle Discrete Commands (Executed once upon confirmation!)
          if (shouldTriggerDiscreteAction && actionToTrigger) {
            executeDiscreteCommand(actionToTrigger);
          }

          // Handle Continuous Gestures (Smoothed with adaptive 1€ Filter)
          if (handCount === 1) {
            handleContinuousGestures(rawGesture.type, handsList[0]);
          } else if (handCount >= 2) {
            handleTwoHandGestures(handsList[0], handsList[1]);
          } else {
            resetContinuousTracking();
          }
        });

        handsRef.current = hands;
        setStatus("active");

        // Hardware-synced frame processing loop
        const processFrame = async () => {
          if (cancelled) return;

          if (
            !isProcessingFrame.current &&
            handsRef.current &&
            videoRef.current &&
            videoRef.current.readyState >= 2
          ) {
            isProcessingFrame.current = true;
            try {
              // Direct GPU hardware video frame upload into MediaPipe WebGL texture (Zero CPU copy!)
              await handsRef.current.send({ image: videoRef.current });
            } catch {
              // Frame dropped safely
            } finally {
              isProcessingFrame.current = false;
            }
          }
        };

        const scheduleNextFrame = () => {
          if (cancelled) return;
          const video = videoRef.current;
          if (video && "requestVideoFrameCallback" in video) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vfcRef.current = (video as any).requestVideoFrameCallback(async () => {
              await processFrame();
              scheduleNextFrame();
            });
          } else {
            rafRef.current = requestAnimationFrame(async () => {
              await processFrame();
              scheduleNextFrame();
            });
          }
        };

        scheduleNextFrame();
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const isPermDenied = err instanceof Error && err.name === "NotAllowedError";
        setErrorMsg(
          isPermDenied
            ? "JARVIS VISION UNAVAILABLE // CAMERA PERMISSION DENIED"
            : "JARVIS VISION ENGINE OFFLINE // " + (err instanceof Error ? err.message : "CAMERA ERROR")
        );
      }
    };

    initTracking();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, cleanup]);

  // Execute Discrete Commands (Debounced & Locked)
  const executeDiscreteCommand = (action: GestureType) => {
    const config = GESTURE_CONFIGS[action];
    gestureEvents.emit("gesture_confirmed", { gesture: config.name, action: config.action });

    switch (action) {
      case "thumbs_up":
        onAction?.("run_code");
        gestureEvents.emit("run_code", true);
        break;

      case "thumbs_down":
        onResetView?.();
        gestureEvents.emit("reset", true);
        break;

      case "peace":
        gestureEvents.emit("peace", true);
        break;

      case "fist":
        onAction?.("pause_flow");
        gestureEvents.emit("pause_flow", true);
        break;

      case "swipe_left":
        classifierRef.current.resetVelocityHistory();
        onAction?.("step_back");
        gestureEvents.emit("step_back", true);
        break;

      case "swipe_right":
        classifierRef.current.resetVelocityHistory();
        onAction?.("step_forward");
        gestureEvents.emit("step_forward", true);
        break;

      case "two_hands":
        onResetView?.();
        gestureEvents.emit("reset", true);
        break;
    }
  };

  // Handle Two-Hand Continuous Gestures (Expanding / Contracting Zoom)
  const handleTwoHandGestures = (hand1: HandLandmark[], hand2: HandLandmark[]) => {
    const multiplier = sensitivityRef.current * (turboModeRef.current ? 1.6 : 1.1);

    const h1 = hand1[9];
    const h2 = hand2[9];
    const currentDist = Math.hypot(h1.x - h2.x, h1.y - h2.y);

    if (lastTwoHandDist.current !== null) {
      // Expanding hands apart = Zoom in; bringing hands together = Zoom out
      const delta = (currentDist - lastTwoHandDist.current) * 60 * multiplier;
      if (Math.abs(delta) > 0.005) {
        onZoom?.(delta);
        gestureEvents.emit("zoom", { delta });
      }
    }
    lastTwoHandDist.current = currentDist;
    // Reset single-hand tracking states so they don't interfere
    lastPalmPos.current = null;
    lastPinchDist.current = null;
    pointDwellStart.current = null;
    hideReticle();
  };

  // Handle Continuous Gestures (Rotate, Zoom, Point Dwell with 1€ Filter)
  const handleContinuousGestures = (gestureType: GestureType, landmarks: HandLandmark[]) => {
    const multiplier = sensitivityRef.current * (turboModeRef.current ? 1.4 : 1.0);
    const now = performance.now();
    // Clear two-hand distance baseline when single hand is tracked
    lastTwoHandDist.current = null;

    // 1. OPEN PALM -> Smooth Orbit Rotation (Zero jitter, zero lag)
    if (gestureType === "open_palm") {
      const rawPalmX = landmarks[9].x;
      const rawPalmY = landmarks[9].y;
      const smooth = stabilizerRef.current.smoothPalm(rawPalmX, rawPalmY, now);

      if (lastPalmPos.current) {
        const dx = (smooth.x - lastPalmPos.current.x) * 160 * multiplier;
        const dy = (smooth.y - lastPalmPos.current.y) * 120 * multiplier;

        // Adaptive 1€ Filter eliminates tremor, so 0.15 threshold is crisp and responsive
        if (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15) {
          onRotate?.(dx, dy);
          gestureEvents.emit("rotate", { dx, dy });
        }
      }
      lastPalmPos.current = { x: smooth.x, y: smooth.y };
      lastPinchDist.current = null;
      pointDwellStart.current = null;
      hideReticle();
      return;
    }

    // 2. PINCH -> Smooth Zoom In / Out OR Quick Pinch-to-Click if Aiming
    if (gestureType === "pinch") {
      // If user was just aiming at something, clicking via pinch selects that target!
      if (lastPointPos.current && now - lastPointPos.current.time < 600) {
        const targetX = lastPointPos.current.x;
        const targetY = lastPointPos.current.y;
        onNodeClickAt?.(targetX, targetY);
        gestureEvents.emit("click", { x: targetX, y: targetY });
        lastPointPos.current = null;
        hideReticle();
        return;
      }

      const thumb = landmarks[4];
      const index = landmarks[8];
      const rawDist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
      const palmScale = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
      const zoomMetric = rawDist * 0.5 + palmScale * 0.5;
      const smoothDist = stabilizerRef.current.smoothPinchDist(zoomMetric, now);

      if (lastPinchDist.current !== null) {
        const delta = (smoothDist - lastPinchDist.current) * 45 * multiplier;
        if (Math.abs(delta) > 0.008) {
          onZoom?.(delta);
          gestureEvents.emit("zoom", { delta });
        }
      }
      lastPinchDist.current = smoothDist;
      lastPalmPos.current = null;
      pointDwellStart.current = null;
      hideReticle();
      return;
    }

    // 3. POINT -> Laser Reticle, Real-Time Node Highlighting & Click
    if (gestureType === "point") {
      const indexTip = landmarks[8];
      // Invert X for natural mirrored interaction
      const screenX = (1 - indexTip.x) * window.innerWidth;
      const screenY = indexTip.y * window.innerHeight;

      const smooth = stabilizerRef.current.smoothPoint(screenX, screenY, now);
      updateReticlePos(smooth.x, smooth.y);
      lastPointPos.current = { x: smooth.x, y: smooth.y, time: now };

      // Real-time pointer move for instant 3D/2D node highlighting
      gestureEvents.emit("pointer_move", { x: smooth.x, y: smooth.y });

      const dwellDuration = turboModeRef.current ? 300 : 420;
      if (!pointDwellStart.current) {
        pointDwellStart.current = performance.now();
        updateReticleProgress(0);
      } else {
        const elapsed = performance.now() - pointDwellStart.current;
        const progress = Math.min(elapsed / dwellDuration, 1.0);
        updateReticleProgress(progress);

        if (progress >= 1.0) {
          onNodeClickAt?.(smooth.x, smooth.y);
          gestureEvents.emit("click", { x: smooth.x, y: smooth.y });
          pointDwellStart.current = performance.now() + 550; // Dwell debounce
          updateReticleProgress(0);
        }
      }

      lastPalmPos.current = null;
      lastPinchDist.current = null;
      return;
    }

    resetContinuousTracking();
  };

  const resetContinuousTracking = () => {
    lastPalmPos.current = null;
    lastPinchDist.current = null;
    lastTwoHandDist.current = null;
    pointDwellStart.current = null;
    hideReticle();
  };

  // Precision Reticle Positioning
  const updateReticlePos = (x: number, y: number) => {
    if (reticleRef.current) {
      reticleRef.current.style.display = "flex";
      reticleRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }
  };

  const hideReticle = () => {
    if (reticleRef.current) reticleRef.current.style.display = "none";
  };

  const updateReticleProgress = (p: number) => {
    if (circleProgressRef.current) {
      circleProgressRef.current.style.strokeDashoffset = `${125.6 * (1 - p)}`;
    }
  };

  const activeConfig = GESTURE_CONFIGS[telemetry.detectedGesture] || GESTURE_CONFIGS.none;

  return (
    <>
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Holographic Targeting Reticle */}
      {enabled && (
        <div
          ref={reticleRef}
          className="fixed pointer-events-none z-[260] top-0 left-0 hidden items-center justify-center will-change-transform"
        >
          {/* Outer crosshairs */}
          <div className="absolute w-10 h-10 border border-cyan-400/40 rounded-full animate-spin-slow" />
          <div className="w-5 h-5 rounded-full border-2 border-cyan-400 bg-cyan-500/20 shadow-[0_0_20px_rgba(0,212,255,0.9)] flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-200" />
          </div>
          <svg className="absolute w-12 h-12 -rotate-90">
            <circle cx="24" cy="24" r="20" stroke="rgba(0,212,255,0.25)" strokeWidth="2.5" fill="transparent" />
            <circle
              ref={circleProgressRef}
              cx="24"
              cy="24"
              r="20"
              stroke="#00d4ff"
              strokeWidth="2.5"
              fill="transparent"
              strokeDasharray={125.6}
              strokeDashoffset={125.6}
              strokeLinecap="round"
              className="transition-all duration-75"
            />
          </svg>
        </div>
      )}

      {/* Futuristic Tony Stark JARVIS Vision HUD Panel */}
      {enabled && (
        <div
          className="fixed bottom-6 left-6 z-[250] flex flex-col gap-2 select-none animate-slide-up"
          style={{ maxWidth: isMinimized ? 180 : 250 }}
        >
          {/* Main Tracking HUD Window */}
          <div
            className="relative rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.8),0_0_20px_rgba(0,212,255,0.2)]"
            style={{
              background: "linear-gradient(135deg, rgba(2, 10, 26, 0.95) 0%, rgba(1, 6, 18, 0.98) 100%)",
              border: `1px solid ${activeConfig.primary}44`,
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Top HUD Header Bar */}
            <div
              className="flex items-center justify-between px-3 py-1.5 border-b"
              style={{
                borderColor: "rgba(0,212,255,0.15)",
                background: "rgba(0,212,255,0.04)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: status === "active" ? "#10b981" : status === "loading" ? "#f59e0b" : "#ef4444",
                    boxShadow: status === "active" ? "0 0 8px #10b981" : "none",
                  }}
                />
                <span className="text-[10px] font-mono font-bold tracking-wider text-cyan-300">
                  JARVIS VISION
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono text-slate-400">
                  {status === "active" ? `${telemetry.fps} FPS` : status.toUpperCase()}
                </span>
                <button
                  onClick={() => setIsMinimized((v) => !v)}
                  className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                  title={isMinimized ? "Expand HUD" : "Minimize HUD"}
                >
                  {isMinimized ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
            </div>

            {/* Canvas Hologram Viewport */}
            {!isMinimized && (
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={250}
                  height={170}
                  className="block"
                  style={{ width: 250, height: 170 }}
                />

                {/* State Machine HUD Badge */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950/80 border border-cyan-500/30 text-[9px] font-mono text-cyan-200">
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-ping"
                    style={{ background: activeConfig.primary }}
                  />
                  <span>{telemetry.state}</span>
                </div>

                {/* Gesture Confirmation Telemetry Banner */}
                {telemetry.handCount > 0 && (
                  <div className="absolute bottom-2 left-2 right-2">
                    <div
                      className="flex items-center justify-between px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider border shadow-lg"
                      style={{
                        color: activeConfig.primary,
                        borderColor: activeConfig.secondary,
                        background: "rgba(2, 12, 32, 0.9)",
                        boxShadow: `0 0 12px ${activeConfig.secondary}`,
                      }}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: activeConfig.primary,
                            boxShadow: `0 0 8px ${activeConfig.primary}`,
                          }}
                        />
                        <span>{activeConfig.name}</span>
                      </div>
                      <span className="text-[9px] font-normal text-slate-300">
                        {telemetry.actionText}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Expanded Telemetry & Controls */}
            {!isMinimized && (
              <div
                className="p-3 border-t space-y-2.5 text-xs font-mono"
                style={{
                  borderColor: "rgba(0,212,255,0.12)",
                  background: "rgba(1, 8, 20, 0.7)",
                }}
              >
                {/* Mode & Sensitivity Row */}
                <div className="flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                    <Gauge size={12} className="text-cyan-400" /> SENSORS
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDualHandMode((v) => !v)}
                      className={`px-1.5 py-0.5 rounded-lg text-[8px] font-bold uppercase transition-all ${
                        dualHandMode
                          ? "bg-indigo-600 text-white shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                          : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      }`}
                      title={dualHandMode ? "Tracking 2 Hands" : "Single Hand Mode (Ultra Fast 60 FPS)"}
                    >
                      {dualHandMode ? "2 HANDS" : "1 HAND (60FPS)"}
                    </button>
                    <button
                      onClick={() => setTurboMode((v) => !v)}
                      className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase flex items-center gap-1 transition-all ${
                        turboMode
                          ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-semibold shadow-[0_0_12px_rgba(0,212,255,0.5)]"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      <Zap size={10} /> {turboMode ? "TURBO" : "NORMAL"}
                    </button>
                  </div>
                </div>

                {/* Sensitivity Slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">Response Gain</span>
                    <span className="text-cyan-300 font-bold">{sensitivity.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                    className="w-full h-1 rounded-full appearance-none cursor-pointer accent-cyan-400 bg-slate-800"
                  />
                </div>

                {/* Gesture Quick Reference */}
                <div className="pt-1 border-t border-slate-800/80 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px]">
                  {[
                    { name: "Open Palm", act: "3D Rotate", col: "#00d4ff" },
                    { name: "Pinch",     act: "Zoom",      col: "#fbbf24" },
                    { name: "Point",     act: "Dwell Pick",col: "#f472b6" },
                    { name: "Thumbs Up", act: "Run Code",  col: "#22c55e" },
                    { name: "Thumbs Down",act: "Reset View",col: "#ef4444" },
                    { name: "Peace Sign",act: "JARVIS Mic",col: "#10b981" },
                    { name: "Fist",      act: "Pause Flow",col: "#a855f7" },
                    { name: "Swipe L/R", act: "Flow Step", col: "#38bdf8" },
                  ].map(({ name, act, col }) => (
                    <div key={name} className="flex items-center gap-1.5 truncate">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: col, boxShadow: `0 0 4px ${col}` }}
                      />
                      <span className="text-slate-400 truncate">
                        {name}: <span className="text-slate-200">{act}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {enabled && status === "loading" && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div
            className="flex flex-col items-center gap-4 p-8 rounded-3xl"
            style={{
              background: "linear-gradient(135deg, rgba(2,12,32,0.95) 0%, rgba(1,6,18,0.98) 100%)",
              border: "1px solid rgba(0,212,255,0.4)",
              boxShadow: "0 8px 32px rgba(0,212,255,0.25)",
            }}
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-cyan-400/30 animate-ping" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={28} className="text-cyan-400 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-bold font-mono text-cyan-300 tracking-wider">
                INITIALIZING J.A.R.V.I.S. VISION
              </p>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                Calibrating neural tracking sensors...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Futuristic Error Card */}
      {enabled && status === "error" && (
        <div className="fixed bottom-6 left-6 z-[300] max-w-[320px] animate-slide-up select-none">
          <div
            className="flex items-start gap-3 rounded-2xl p-4 shadow-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(30, 6, 12, 0.96) 0%, rgba(15, 2, 6, 0.98) 100%)",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              boxShadow: "0 8px 32px rgba(244, 63, 94, 0.25)",
              backdropFilter: "blur(20px)",
            }}
          >
            <ShieldAlert size={20} className="flex-shrink-0 text-rose-400 mt-0.5" />
            <div className="space-y-2">
              <div className="text-xs font-mono font-bold text-rose-300 tracking-wide">
                JARVIS VISION OFFLINE
              </div>
              <p className="text-[11px] text-rose-200/90 leading-relaxed font-mono">
                {errorMsg}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={onToggle}
                  className="text-[10px] font-mono px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 transition-all"
                >
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
