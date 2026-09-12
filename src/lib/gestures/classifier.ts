import type { HandLandmark, DetectedGesture, GestureType } from "./types";
import { GESTURE_CONFIGS } from "./types";

export function dist3D(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.hypot(dx, dy, dz);
}

export interface VelocityHistoryPoint {
  x: number;
  y: number;
  time: number;
}

export class GestureClassifier {
  private history: VelocityHistoryPoint[] = [];

  public resetVelocityHistory() {
    this.history = [];
  }

  public detectGesture(
    landmarks: HandLandmark[],
    now: number = performance.now()
  ): DetectedGesture {
    if (!landmarks || landmarks.length < 21) {
      return {
        type: "none",
        confidence: 0,
        name: GESTURE_CONFIGS.none.name,
        actionText: GESTURE_CONFIGS.none.action,
        isContinuous: false,
      };
    }

    const wrist = landmarks[0];
    const thumbCmc = landmarks[1];
    const thumbMcp = landmarks[2];
    const thumbIp = landmarks[3];
    const thumbTip = landmarks[4];

    const indexMcp = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];

    const middleMcp = landmarks[9];
    const middlePip = landmarks[10];
    const middleTip = landmarks[12];

    const ringMcp = landmarks[13];
    const ringPip = landmarks[14];
    const ringTip = landmarks[16];

    const pinkyMcp = landmarks[17];
    const pinkyPip = landmarks[18];
    const pinkyTip = landmarks[20];

    const palmSize = dist3D(wrist, middleMcp);
    if (palmSize < 0.01) {
      return {
        type: "none",
        confidence: 0,
        name: GESTURE_CONFIGS.none.name,
        actionText: GESTURE_CONFIGS.none.action,
        isContinuous: false,
      };
    }

    // Measure finger extension relative to wrist and PIP joint
    const indexDist = dist3D(indexTip, wrist);
    const indexPipDist = dist3D(indexPip, wrist);
    const indexExt = indexDist > indexPipDist * 1.06 && dist3D(indexTip, indexMcp) > palmSize * 0.55;

    const middleDist = dist3D(middleTip, wrist);
    const middlePipDist = dist3D(middlePip, wrist);
    const middleExt = middleDist > middlePipDist * 1.06 && dist3D(middleTip, middleMcp) > palmSize * 0.55;

    const ringDist = dist3D(ringTip, wrist);
    const ringPipDist = dist3D(ringPip, wrist);
    const ringExt = ringDist > ringPipDist * 1.06 && dist3D(ringTip, ringMcp) > palmSize * 0.55;

    const pinkyDist = dist3D(pinkyTip, wrist);
    const pinkyPipDist = dist3D(pinkyPip, wrist);
    const pinkyExt = pinkyDist > pinkyPipDist * 1.06 && dist3D(pinkyTip, pinkyMcp) > palmSize * 0.55;

    // Thumb metrics
    const thumbIndexTipDist = dist3D(thumbTip, indexTip);
    const thumbExtFromPalm = dist3D(thumbTip, middleMcp) > palmSize * 0.65;

    // Track palm center for velocity swipe detection
    const palmCenter = { x: middleMcp.x, y: middleMcp.y, time: now };
    this.history.push(palmCenter);
    // Keep only last 250ms
    this.history = this.history.filter((p) => now - p.time <= 250);

    // 1. THUMBS UP, THUMBS DOWN, and FIST (all 4 fingers curled)
    const fingersCurled = !indexExt && !middleExt && !ringExt && !pinkyExt;
    if (fingersCurled) {
      // Thumb UP: thumb tip significantly above thumb MCP and wrist (in screen coordinates, Y decreases upwards)
      const isPointingUp = thumbTip.y < thumbMcp.y - palmSize * 0.25 && thumbTip.y < wrist.y - palmSize * 0.35;
      const isPointingDown = thumbTip.y > thumbMcp.y + palmSize * 0.25 && thumbTip.y > wrist.y + palmSize * 0.35;

      if (isPointingUp && thumbExtFromPalm) {
        return this.buildResult("thumbs_up", 0.94, false);
      }
      if (isPointingDown && thumbExtFromPalm) {
        return this.buildResult("thumbs_down", 0.94, false);
      }

      // FIST: all fingers curled and thumb tucked/not pointing up/down
      const thumbTucked = dist3D(thumbTip, indexPip) < palmSize * 0.65 || dist3D(thumbTip, middleMcp) < palmSize * 0.65;
      if (thumbTucked || !thumbExtFromPalm) {
        return this.buildResult("fist", 0.92, false);
      }
    }

    // 2. PINCH: Index tip and Thumb tip touching/close (when not in a closed fist)
    const pinchThreshold = palmSize * 0.36;
    if (thumbIndexTipDist < pinchThreshold) {
      const conf = Math.max(0.65, Math.min(0.99, 1 - thumbIndexTipDist / pinchThreshold + 0.3));
      return this.buildResult("pinch", conf, true);
    }

    // 3. POINT: Index extended, Middle/Ring/Pinky curled
    if (indexExt && !middleExt && !ringExt && !pinkyExt && thumbIndexTipDist > palmSize * 0.42) {
      return this.buildResult("point", 0.95, true);
    }

    // 4. PEACE / TWO FINGERS: Index & Middle extended, Ring & Pinky curled
    if (indexExt && middleExt && !ringExt && !pinkyExt) {
      return this.buildResult("peace", 0.96, false);
    }

    // 5. SWIPE: Rapid horizontal palm movement
    if (this.history.length >= 3) {
      const oldest = this.history[0];
      const dt = (now - oldest.time) / 1000;
      if (dt >= 0.07 && dt <= 0.28) {
        const dx = palmCenter.x - oldest.x;
        const dy = palmCenter.y - oldest.y;
        const vx = dx / dt;
        const vy = dy / dt;

        // Dominant horizontal flick (speed > 1.15 viewports/sec and vx > 1.6 * vy)
        if (Math.abs(vx) > 1.15 && Math.abs(vx) > Math.abs(vy) * 1.6) {
          if (vx > 0) {
            return this.buildResult("swipe_right", 0.95, false);
          } else {
            return this.buildResult("swipe_left", 0.95, false);
          }
        }
      }
    }

    // 6. OPEN PALM: All fingers extended (Dedicated to smooth 3D orbit rotation)
    if (indexExt && middleExt && ringExt && pinkyExt) {
      return this.buildResult("open_palm", 0.93, true);
    }

    return {
      type: "none",
      confidence: 0.5,
      name: GESTURE_CONFIGS.none.name,
      actionText: GESTURE_CONFIGS.none.action,
      isContinuous: false,
    };
  }

  private buildResult(type: GestureType, confidence: number, isContinuous: boolean): DetectedGesture {
    const config = GESTURE_CONFIGS[type];
    return {
      type,
      confidence,
      name: config.name,
      actionText: config.action,
      isContinuous,
    };
  }
}
