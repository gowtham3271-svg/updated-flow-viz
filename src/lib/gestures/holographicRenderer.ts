import type { GestureTelemetry, HandLandmark } from "./types";
import { GESTURE_CONFIGS } from "./types";

const CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [0, 17], [5, 9], [9, 13], [13, 17]
];

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

export class HolographicRenderer {
  private bgCanvas: HTMLCanvasElement | null = null;
  private bgWidth = 0;
  private bgHeight = 0;

  private prepareBackground(w: number, h: number): HTMLCanvasElement {
    if (this.bgCanvas && this.bgWidth === w && this.bgHeight === h) {
      return this.bgCanvas;
    }

    if (!this.bgCanvas) {
      this.bgCanvas = document.createElement("canvas");
    }
    this.bgCanvas.width = w;
    this.bgCanvas.height = h;
    this.bgWidth = w;
    this.bgHeight = h;

    const ctx = this.bgCanvas.getContext("2d");
    if (!ctx) return this.bgCanvas;

    // Pure dark futuristic hologram viewport background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, "rgba(2, 10, 26, 0.96)");
    bgGrad.addColorStop(1, "rgba(1, 5, 16, 0.99)");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Technical HUD Grid
    ctx.strokeStyle = "rgba(0, 212, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let y = 20; y < h; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let x = 20; x < w; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Subtle dark radial vignette
    const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, "rgba(2, 8, 22, 0)");
    grad.addColorStop(1, "rgba(2, 8, 22, 0.75)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    return this.bgCanvas;
  }

  public draw(
    ctx: CanvasRenderingContext2D,
    _video: HTMLVideoElement | null,
    handsList: HandLandmark[][],
    telemetry: GestureTelemetry,
    w: number,
    h: number
  ) {
    ctx.clearRect(0, 0, w, h);

    // 1. Blit pre-cached high-tech HUD grid and vignette (ultra-fast single blit)
    const bg = this.prepareBackground(w, h);
    ctx.drawImage(bg, 0, 0);

    // 2. Render Hand Hologram for each detected hand
    const config = GESTURE_CONFIGS[telemetry.detectedGesture] || GESTURE_CONFIGS.none;

    for (const landmarks of handsList) {
      this.drawSkeletalBones(ctx, landmarks, w, h, config.primary);
      this.drawJointNodes(ctx, landmarks, w, h, config.primary, config.secondary);
      this.drawFingertipAuras(ctx, landmarks, w, h, config.primary);
      this.drawPalmArcReactor(ctx, landmarks, w, h, telemetry);
    }

    // 3. Futuristic Corner Brackets
    this.drawCornerBrackets(ctx, w, h, config.primary);
  }

  private drawSkeletalBones(
    ctx: CanvasRenderingContext2D,
    landmarks: HandLandmark[],
    w: number,
    h: number,
    primaryColor: string
  ) {
    ctx.save();
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.0;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      if (!landmarks[a] || !landmarks[b]) continue;
      // Mirror X coordinates for natural interaction
      const x1 = (1 - landmarks[a].x) * w;
      const y1 = landmarks[a].y * h;
      const x2 = (1 - landmarks[b].x) * w;
      const y2 = landmarks[b].y * h;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawJointNodes(
    ctx: CanvasRenderingContext2D,
    landmarks: HandLandmark[],
    w: number,
    h: number,
    primaryColor: string,
    secondaryColor: string
  ) {
    ctx.save();
    // 1. Batch outer joint rings into single path
    ctx.beginPath();
    for (let i = 0; i < landmarks.length; i++) {
      if (FINGERTIPS.has(i)) continue;
      const lm = landmarks[i];
      const x = (1 - lm.x) * w;
      const y = lm.y * h;
      ctx.moveTo(x + 3.5, y);
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    }
    ctx.fillStyle = secondaryColor;
    ctx.fill();

    // 2. Batch inner glowing cores into single path
    ctx.beginPath();
    for (let i = 0; i < landmarks.length; i++) {
      if (FINGERTIPS.has(i)) continue;
      const lm = landmarks[i];
      const x = (1 - lm.x) * w;
      const y = lm.y * h;
      ctx.moveTo(x + 1.8, y);
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    }
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 6;
    ctx.fillStyle = primaryColor;
    ctx.fill();
    ctx.restore();
  }

  private drawFingertipAuras(
    ctx: CanvasRenderingContext2D,
    landmarks: HandLandmark[],
    w: number,
    h: number,
    primaryColor: string
  ) {
    ctx.save();
    // 1. Batch outer holographic rings
    ctx.beginPath();
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 8;
    for (const tipIndex of FINGERTIPS) {
      const lm = landmarks[tipIndex];
      if (!lm) continue;
      const x = (1 - lm.x) * w;
      const y = lm.y * h;
      ctx.moveTo(x + 6.5, y);
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    }
    ctx.stroke();

    // 2. Batch bright center nodes
    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    for (const tipIndex of FINGERTIPS) {
      const lm = landmarks[tipIndex];
      if (!lm) continue;
      const x = (1 - lm.x) * w;
      const y = lm.y * h;
      ctx.moveTo(x + 2.5, y);
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  private drawPalmArcReactor(
    ctx: CanvasRenderingContext2D,
    landmarks: HandLandmark[],
    w: number,
    h: number,
    telemetry: GestureTelemetry
  ) {
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    if (!wrist || !middleMcp) return;

    // Center of palm
    const cx = (1 - (wrist.x + middleMcp.x) / 2) * w;
    const cy = ((wrist.y + middleMcp.y) / 2) * h;
    const radius = 12;

    ctx.save();
    // Inner pulsing core
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = telemetry.state === "EXECUTING" ? "#34d399" : "#00d4ff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 14;
    ctx.fill();

    // Base circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Stability progress arc (fills from 0 to 100% as gesture confirms)
    if (telemetry.stabilityProgress > 0) {
      ctx.beginPath();
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + telemetry.stabilityProgress * Math.PI * 2;
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = telemetry.state === "EXECUTING" ? "#34d399" : "#00d4ff";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 10;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawCornerBrackets(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string
  ) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    const size = 10;

    ctx.beginPath();
    // Top-Left
    ctx.moveTo(4, 4 + size);
    ctx.lineTo(4, 4);
    ctx.lineTo(4 + size, 4);

    // Top-Right
    ctx.moveTo(w - 4 - size, 4);
    ctx.lineTo(w - 4, 4);
    ctx.lineTo(w - 4, 4 + size);

    // Bottom-Left
    ctx.moveTo(4, h - 4 - size);
    ctx.lineTo(4, h - 4);
    ctx.lineTo(4 + size, h - 4);

    // Bottom-Right
    ctx.moveTo(w - 4 - size, h - 4);
    ctx.lineTo(w - 4, h - 4);
    ctx.lineTo(w - 4, h - 4 - size);

    ctx.stroke();
    ctx.restore();
  }
}
