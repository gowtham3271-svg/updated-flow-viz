import { describe, it, expect, beforeEach } from "vitest";
import { GestureClassifier } from "../src/lib/gestures/classifier";
import { GestureStabilizer, OneEuroFilter } from "../src/lib/gestures/stabilizer";
import type { HandLandmark } from "../src/lib/gestures/types";

// Helper to create synthetic 21 hand landmarks based on finger states
function createSyntheticLandmarks(options: {
  indexExtended?: boolean;
  middleExtended?: boolean;
  ringExtended?: boolean;
  pinkyExtended?: boolean;
  thumbDirection?: "up" | "down" | "open" | "tucked" | "pinch";
}): HandLandmark[] {
  const landmarks: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

  // 0: Wrist
  landmarks[0] = { x: 0.5, y: 0.8, z: 0 };
  // 9: Middle MCP (defines palm center / size)
  landmarks[9] = { x: 0.5, y: 0.5, z: 0 };

  // Thumb: 1, 2, 3, 4
  landmarks[1] = { x: 0.45, y: 0.75, z: 0 };
  landmarks[2] = { x: 0.40, y: 0.70, z: 0 };
  landmarks[3] = { x: 0.35, y: 0.65, z: 0 };

  if (options.thumbDirection === "up") {
    landmarks[4] = { x: 0.35, y: 0.35, z: 0 }; // Significantly above wrist (0.8) and MCP (0.7)
  } else if (options.thumbDirection === "down") {
    landmarks[4] = { x: 0.35, y: 0.95, z: 0 }; // Significantly below wrist
  } else if (options.thumbDirection === "pinch") {
    // Touch index tip (8)
    landmarks[4] = { x: 0.48, y: 0.22, z: 0 };
  } else if (options.thumbDirection === "tucked") {
    landmarks[4] = { x: 0.45, y: 0.65, z: 0 };
  } else {
    landmarks[4] = { x: 0.25, y: 0.55, z: 0 }; // Extended open
  }

  // Index: 5 (MCP), 6 (PIP), 7 (DIP), 8 (TIP)
  landmarks[5] = { x: 0.45, y: 0.50, z: 0 };
  landmarks[6] = { x: 0.45, y: 0.40, z: 0 };
  landmarks[7] = { x: 0.45, y: 0.30, z: 0 };
  if (options.thumbDirection === "pinch") {
    landmarks[8] = { x: 0.48, y: 0.22, z: 0 }; // Touch thumb
  } else {
    landmarks[8] = options.indexExtended ? { x: 0.45, y: 0.20, z: 0 } : { x: 0.45, y: 0.55, z: 0 };
  }

  // Middle: 9 (MCP), 10 (PIP), 11 (DIP), 12 (TIP)
  landmarks[10] = { x: 0.50, y: 0.40, z: 0 };
  landmarks[11] = { x: 0.50, y: 0.30, z: 0 };
  landmarks[12] = options.middleExtended ? { x: 0.50, y: 0.18, z: 0 } : { x: 0.50, y: 0.55, z: 0 };

  // Ring: 13 (MCP), 14 (PIP), 15 (DIP), 16 (TIP)
  landmarks[13] = { x: 0.55, y: 0.50, z: 0 };
  landmarks[14] = { x: 0.55, y: 0.42, z: 0 };
  landmarks[15] = { x: 0.55, y: 0.34, z: 0 };
  landmarks[16] = options.ringExtended ? { x: 0.55, y: 0.22, z: 0 } : { x: 0.55, y: 0.55, z: 0 };

  // Pinky: 17 (MCP), 18 (PIP), 19 (DIP), 20 (TIP)
  landmarks[17] = { x: 0.60, y: 0.52, z: 0 };
  landmarks[18] = { x: 0.60, y: 0.45, z: 0 };
  landmarks[19] = { x: 0.60, y: 0.38, z: 0 };
  landmarks[20] = options.pinkyExtended ? { x: 0.60, y: 0.28, z: 0 } : { x: 0.60, y: 0.55, z: 0 };

  return landmarks;
}

describe("JARVIS 3D Gesture Classifier", () => {
  let classifier: GestureClassifier;

  beforeEach(() => {
    classifier = new GestureClassifier();
  });

  it("classifies Open Palm when all fingers are extended", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: true,
      thumbDirection: "open",
    });

    const result = classifier.detectGesture(landmarks);
    expect(result.type).toBe("open_palm");
    expect(result.confidence).toBeGreaterThan(0.85);
    expect(result.isContinuous).toBe(true);
  });

  it("classifies Pinch when index tip and thumb tip meet", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: false,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false,
      thumbDirection: "pinch",
    });

    const result = classifier.detectGesture(landmarks);
    expect(result.type).toBe("pinch");
    expect(result.isContinuous).toBe(true);
  });

  it("classifies Point when only index finger is extended", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: true,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false,
      thumbDirection: "tucked",
    });

    const result = classifier.detectGesture(landmarks);
    expect(result.type).toBe("point");
    expect(result.isContinuous).toBe(true);
  });

  it("classifies Peace / Two Fingers when index and middle are extended", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: true,
      middleExtended: true,
      ringExtended: false,
      pinkyExtended: false,
      thumbDirection: "tucked",
    });

    const result = classifier.detectGesture(landmarks);
    expect(result.type).toBe("peace");
  });

  it("classifies Thumbs Up when thumb points upward and other fingers are curled", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: false,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false,
      thumbDirection: "up",
    });

    const result = classifier.detectGesture(landmarks);
    expect(result.type).toBe("thumbs_up");
  });

  it("classifies Thumbs Down when thumb points downward and other fingers are curled", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: false,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false,
      thumbDirection: "down",
    });

    const result = classifier.detectGesture(landmarks);
    expect(result.type).toBe("thumbs_down");
  });

  it("classifies Fist when all fingers and thumb are curled and tucked", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: false,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false,
      thumbDirection: "tucked",
    });

    const result = classifier.detectGesture(landmarks);
    expect(result.type).toBe("fist");
  });
  it("classifies Swipe Right on fast horizontal palm movement to the right", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: true,
      thumbDirection: "open",
    });

    let t = 1000;
    landmarks[9].x = 0.3;
    classifier.detectGesture(landmarks, t);

    t += 50;
    landmarks[9].x = 0.42;
    classifier.detectGesture(landmarks, t);

    t += 50;
    landmarks[9].x = 0.55;
    const result = classifier.detectGesture(landmarks, t);
    expect(result.type).toBe("swipe_right");
  });

  it("classifies Swipe Left on fast horizontal palm movement to the left", () => {
    const landmarks = createSyntheticLandmarks({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: true,
      thumbDirection: "open",
    });

    let t = 2000;
    landmarks[9].x = 0.7;
    classifier.detectGesture(landmarks, t);

    t += 50;
    landmarks[9].x = 0.55;
    classifier.detectGesture(landmarks, t);

    t += 50;
    landmarks[9].x = 0.4;
    const result = classifier.detectGesture(landmarks, t);
    expect(result.type).toBe("swipe_left");
  });
});

describe("JARVIS 6-State Gesture Stabilizer & Debounce Engine", () => {
  let stabilizer: GestureStabilizer;

  beforeEach(() => {
    stabilizer = new GestureStabilizer({
      stabilityThresholdMs: 100, // 100ms for test
      cooldownThresholdMs: 300,
      emaAlpha: 0.3,
    });
  });

  it("progresses through IDLE -> GESTURE_DETECTED -> EXECUTING on steady hold", () => {
    const rawThumbsUp = {
      type: "thumbs_up" as const,
      confidence: 0.95,
      name: "THUMBS UP",
      actionText: "RUN CODE",
      isContinuous: false,
    };

    let t = 1000;
    // Frame 1: Gesture detected
    const f1 = stabilizer.update(rawThumbsUp, 1, 60, t);
    expect(f1.telemetry.state).toBe("GESTURE_DETECTED");
    expect(f1.shouldTriggerDiscreteAction).toBe(false);

    // Frame 2: 50ms later (halfway through stability threshold)
    t += 50;
    const f2 = stabilizer.update(rawThumbsUp, 1, 60, t);
    expect(f2.telemetry.state).toBe("GESTURE_DETECTED");
    expect(f2.telemetry.stabilityProgress).toBeCloseTo(0.5, 1);
    expect(f2.shouldTriggerDiscreteAction).toBe(false);

    // Frame 3: 110ms later (> 100ms stability threshold) -> PROMOTED TO EXECUTING!
    t += 60;
    const f3 = stabilizer.update(rawThumbsUp, 1, 60, t);
    expect(f3.telemetry.state).toBe("EXECUTING");
    expect(f3.shouldTriggerDiscreteAction).toBe(true);
    expect(f3.actionToTrigger).toBe("thumbs_up");
  });

  it("locks into COOLDOWN and prevents duplicate triggers when gesture is held continuously", () => {
    const rawThumbsUp = {
      type: "thumbs_up" as const,
      confidence: 0.95,
      name: "THUMBS UP",
      actionText: "RUN CODE",
      isContinuous: false,
    };

    let t = 2000;
    // Frame 1: Detect
    stabilizer.update(rawThumbsUp, 1, 60, t);

    // Frame 2: Confirmed and triggered
    t += 120;
    const executionFrame = stabilizer.update(rawThumbsUp, 1, 60, t);
    expect(executionFrame.shouldTriggerDiscreteAction).toBe(true);

    // Frame 3, 4, 5: User keeps holding thumbs up for several seconds
    for (let i = 0; i < 10; i++) {
      t += 50;
      const heldFrame = stabilizer.update(rawThumbsUp, 1, 60, t);
      expect(heldFrame.telemetry.state).toBe("COOLDOWN");
      expect(heldFrame.shouldTriggerDiscreteAction).toBe(false);
      expect(heldFrame.actionToTrigger).toBeNull();
    }

    // Frame: User releases hand (returns to none / neutral)
    const rawNone = {
      type: "none" as const,
      confidence: 0,
      name: "SCANNING",
      actionText: "LISTENING",
      isContinuous: false,
    };
    t += 50;
    const releaseFrame = stabilizer.update(rawNone, 1, 60, t);
    expect(releaseFrame.telemetry.state).toBe("LISTENING");

    // Frame: User shows thumbs up AGAIN -> should be allowed to trigger again!
    t += 500;
    stabilizer.update(rawThumbsUp, 1, 60, t);
    t += 120;
    const secondExecution = stabilizer.update(rawThumbsUp, 1, 60, t);
    expect(secondExecution.telemetry.state).toBe("EXECUTING");
    expect(secondExecution.shouldTriggerDiscreteAction).toBe(true);
  });

  it("smooths continuous coordinates using adaptive 1€ Filter", () => {
    let t = 1000;
    const p1 = stabilizer.smoothPoint(100, 200, t);
    expect(p1.x).toBe(100);
    expect(p1.y).toBe(200);

    // Sudden hand movement to (150, 250) 50ms later
    t += 50;
    const p2 = stabilizer.smoothPoint(150, 250, t);
    // Smooth transition without erratic jumps
    expect(p2.x).toBeGreaterThan(100);
    expect(p2.x).toBeLessThan(150);
    expect(p2.y).toBeGreaterThan(200);
    expect(p2.y).toBeLessThan(250);
  });
});

describe("1€ Filter Adaptive Frequency Analysis", () => {
  it("suppresses stationary micro-tremors", () => {
    const filter = new OneEuroFilter(1.0, 0.01, 1.0);
    let t = 1000;
    filter.filter(100, t);

    // Hand tremor +- 1.5px
    for (let i = 0; i < 6; i++) {
      t += 16.6;
      const raw = 100 + (i % 2 === 0 ? 1.5 : -1.5);
      const filtered = filter.filter(raw, t);
      // Tremor filtered out
      expect(Math.abs(filtered - 100)).toBeLessThan(0.8);
    }
  });

  it("dynamically increases cutoff frequency to eliminate lag on fast movements", () => {
    const filter = new OneEuroFilter(1.0, 0.02, 1.0);
    let t = 2000;
    filter.filter(0, t);

    // Fast movement from 0 to 400 in 80ms
    t += 80;
    const fastFiltered = filter.filter(400, t);
    expect(fastFiltered).toBeGreaterThan(280);
  });
});
