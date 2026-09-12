import type { DetectedGesture, GestureState, GestureTelemetry, GestureType, HandLandmark } from "./types";
import { GESTURE_CONFIGS } from "./types";

/**
 * 1€ Filter (One Euro Filter)
 * Dynamic cutoff frequency based on velocity.
 * At low velocity: filters micro-tremors and sensor noise (zero jitter).
 * At high velocity: dynamic cutoff increases proportionally to speed (zero lag).
 * Reference: Casiez, G., Roussel, N. and Vogel, D. (CHI 2012)
 */
function getAlpha(rate: number, cutoff: number): number {
  const tau = 1.0 / (2 * Math.PI * cutoff);
  const te = 1.0 / rate;
  return 1.0 / (1.0 + tau / te);
}

export class OneEuroFilter {
  private minCutoff: number; // Minimum cutoff frequency in Hz (low speed stability)
  private beta: number;      // Speed coefficient (high speed responsiveness)
  private dCutoff: number;   // Cutoff frequency for derivative
  private xPrev: number | null = null;
  private dxPrev: number = 0;
  private tPrev: number | null = null;

  constructor(minCutoff = 1.2, beta = 0.015, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  public filter(x: number, timestamp: number = performance.now()): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = timestamp;
      this.dxPrev = 0;
      return x;
    }

    const dt = Math.max((timestamp - this.tPrev) / 1000, 0.001);
    this.tPrev = timestamp;
    const rate = 1.0 / dt;

    // Velocity derivative estimation
    const dx = (x - this.xPrev) * rate;
    const aD = getAlpha(rate, this.dCutoff);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    this.dxPrev = dxHat;

    // Dynamic cutoff calculation
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = getAlpha(rate, cutoff);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;

    return xHat;
  }

  public reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

export interface StabilizerConfig {
  stabilityThresholdMs: number; // Duration required to confirm gesture (~140ms fast, ~220ms normal)
  cooldownThresholdMs: number;  // Minimum wait after execution before any other discrete trigger
  emaAlpha: number;             // Legacy fallback smoothing
}

export const DEFAULT_STABILIZER_CONFIG: StabilizerConfig = {
  stabilityThresholdMs: 140,
  cooldownThresholdMs: 350,
  emaAlpha: 0.35,
};

export class GestureStabilizer {
  private config: StabilizerConfig;
  private state: GestureState = "IDLE";
  private candidateGesture: GestureType = "none";
  private candidateStartTime: number = 0;
  private confirmedGesture: GestureType | null = null;
  private executedGesture: GestureType | null = null;
  private cooldownEndTime: number = 0;

  // 1€ Adaptive Filters for continuous movements (smooth & lag-free)
  private pointFilterX = new OneEuroFilter(0.8, 0.02, 1.0);
  private pointFilterY = new OneEuroFilter(0.8, 0.02, 1.0);
  private palmFilterX = new OneEuroFilter(1.2, 0.015, 1.0);
  private palmFilterY = new OneEuroFilter(1.2, 0.015, 1.0);
  private pinchFilter = new OneEuroFilter(1.0, 0.01, 1.0);

  constructor(config: Partial<StabilizerConfig> = {}) {
    this.config = { ...DEFAULT_STABILIZER_CONFIG, ...config };
  }

  public setStabilityThreshold(ms: number) {
    this.config.stabilityThresholdMs = ms;
  }

  public reset() {
    this.state = "IDLE";
    this.candidateGesture = "none";
    this.candidateStartTime = 0;
    this.confirmedGesture = null;
    this.executedGesture = null;
    this.cooldownEndTime = 0;
    this.pointFilterX.reset();
    this.pointFilterY.reset();
    this.palmFilterX.reset();
    this.palmFilterY.reset();
    this.pinchFilter.reset();
  }

  public update(
    rawGesture: DetectedGesture,
    handCount: number,
    fps: number,
    now: number = performance.now()
  ): {
    telemetry: GestureTelemetry;
    shouldTriggerDiscreteAction: boolean;
    actionToTrigger: GestureType | null;
  } {
    // 1. Dual hands special override
    if (handCount === 2) {
      return this.handleDualHands(now, fps);
    }

    // If no hands detected
    if (handCount === 0 || rawGesture.type === "none") {
      this.state = handCount === 0 ? "IDLE" : "LISTENING";
      this.candidateGesture = "none";
      this.candidateStartTime = 0;
      this.confirmedGesture = null;
      // Releasing gesture clears the executed lock!
      this.executedGesture = null;
      this.pointFilterX.reset();
      this.pointFilterY.reset();
      this.palmFilterX.reset();
      this.palmFilterY.reset();
      this.pinchFilter.reset();

      return {
        telemetry: this.createTelemetry(
          this.state,
          "none",
          null,
          0.5,
          0,
          fps,
          handCount,
          GESTURE_CONFIGS.none.action
        ),
        shouldTriggerDiscreteAction: false,
        actionToTrigger: null,
      };
    }

    // Hand detected with candidate gesture
    const detectedType = rawGesture.type;
    let shouldTrigger = false;
    let actionTriggered: GestureType | null = null;

    // Check if we are currently locked into COOLDOWN for this gesture
    if (this.executedGesture === detectedType && !rawGesture.isContinuous) {
      this.state = "COOLDOWN";
      return {
        telemetry: this.createTelemetry(
          "COOLDOWN",
          detectedType,
          this.confirmedGesture,
          rawGesture.confidence,
          1.0,
          fps,
          handCount,
          `HELD // RELEASE TO RETRIGGER`
        ),
        shouldTriggerDiscreteAction: false,
        actionToTrigger: null,
      };
    }

    // If new candidate gesture appears
    if (detectedType !== this.candidateGesture) {
      this.candidateGesture = detectedType;
      this.candidateStartTime = now;
      this.state = "GESTURE_DETECTED";
      this.confirmedGesture = null;
    }

    const elapsed = now - this.candidateStartTime;
    const progress = Math.min(1.0, elapsed / this.config.stabilityThresholdMs);

    if (progress >= 1.0) {
      // Gesture confirmed!
      this.confirmedGesture = detectedType;

      if (rawGesture.isContinuous) {
        // Continuous gestures (open palm rotate, pinch zoom, point) stay active
        this.state = "EXECUTING";
      } else {
        // Discrete gesture (thumbs up, thumbs down, fist, peace, swipe)
        if (this.executedGesture !== detectedType && now >= this.cooldownEndTime) {
          this.state = "EXECUTING";
          shouldTrigger = true;
          actionTriggered = detectedType;
          this.executedGesture = detectedType;
          this.cooldownEndTime = now + this.config.cooldownThresholdMs;
        } else {
          this.state = "COOLDOWN";
        }
      }
    } else {
      this.state = "GESTURE_DETECTED";
    }

    const currentConfig = GESTURE_CONFIGS[detectedType] || GESTURE_CONFIGS.none;

    return {
      telemetry: this.createTelemetry(
        this.state,
        detectedType,
        this.confirmedGesture,
        rawGesture.confidence,
        progress,
        fps,
        handCount,
        this.state === "EXECUTING"
          ? `EXECUTING // ${currentConfig.action}`
          : (this.state as GestureState) === "GESTURE_CONFIRMED"
          ? `CONFIRMED // ${currentConfig.action}`
          : this.state === "COOLDOWN"
          ? `COOLDOWN // RELEASE HAND`
          : `DETECTED // ${currentConfig.name}`
      ),
      shouldTriggerDiscreteAction: shouldTrigger,
      actionToTrigger: actionTriggered,
    };
  }

  // Dual hands handling
  private handleDualHands(now: number, fps: number): {
    telemetry: GestureTelemetry;
    shouldTriggerDiscreteAction: boolean;
    actionToTrigger: GestureType | null;
  } {
    if (this.candidateGesture !== "two_hands") {
      this.candidateGesture = "two_hands";
      this.candidateStartTime = now;
      this.state = "GESTURE_DETECTED";
    }

    const elapsed = now - this.candidateStartTime;
    const progress = Math.min(1.0, elapsed / 300); // 300ms hold for two hands
    let shouldTrigger = false;

    if (progress >= 1.0) {
      this.state = "EXECUTING";
      this.confirmedGesture = "two_hands";
      if (this.executedGesture !== "two_hands" && now >= this.cooldownEndTime) {
        shouldTrigger = true;
        this.executedGesture = "two_hands";
        this.cooldownEndTime = now + 800;
      }
    }

    return {
      telemetry: this.createTelemetry(
        this.state,
        "two_hands",
        this.confirmedGesture,
        0.98,
        progress,
        fps,
        2,
        GESTURE_CONFIGS.two_hands.action
      ),
      shouldTriggerDiscreteAction: shouldTrigger,
      actionToTrigger: shouldTrigger ? ("two_hands" as GestureType) : null,
    };
  }

  // Smooth point coordinates using adaptive 1€ Filter (zero jitter at rest, zero lag on move)
  public smoothPoint(rawX: number, rawY: number, now: number = performance.now()): { x: number; y: number } {
    return {
      x: this.pointFilterX.filter(rawX, now),
      y: this.pointFilterY.filter(rawY, now),
    };
  }

  // Smooth palm center coordinates for continuous 3D rotation
  public smoothPalm(rawX: number, rawY: number, now: number = performance.now()): { x: number; y: number } {
    return {
      x: this.palmFilterX.filter(rawX, now),
      y: this.palmFilterY.filter(rawY, now),
    };
  }

  // Smooth pinch distance for responsive 3D zoom deltas
  public smoothPinchDist(rawDist: number, now: number = performance.now()): number {
    return this.pinchFilter.filter(rawDist, now);
  }

  private createTelemetry(
    state: GestureState,
    detectedGesture: GestureType,
    confirmedGesture: GestureType | null,
    confidence: number,
    progress: number,
    fps: number,
    handCount: number,
    actionText: string
  ): GestureTelemetry {
    return {
      state,
      detectedGesture,
      confirmedGesture,
      confidence,
      stabilityProgress: progress,
      fps,
      handCount,
      actionText,
    };
  }
}
