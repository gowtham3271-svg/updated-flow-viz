import { describe, it, expect, beforeEach, vi } from "vitest";
import { JarvisAudioEngine } from "../src/lib/jarvisAudio";

describe("J.A.R.V.I.S. Audio & Telemetry Systems", () => {
  let audio: JarvisAudioEngine;

  beforeEach(() => {
    audio = new JarvisAudioEngine();
  });

  it("initializes with audio enabled (unmuted)", () => {
    expect(audio.getMuted()).toBe(false);
  });

  it("respects muting and unmuting commands", () => {
    audio.setMuted(true);
    expect(audio.getMuted()).toBe(true);

    audio.setMuted(false);
    expect(audio.getMuted()).toBe(false);
  });

  it("safely handles procedural audio playback in headless environment without throwing", () => {
    expect(() => audio.playReactorPowerUp()).not.toThrow();
    expect(() => audio.playBlip(1400)).not.toThrow();
    expect(() => audio.playVoiceActivate()).not.toThrow();
    expect(() => audio.playChime()).not.toThrow();
  });

  it("executes Web Audio API sound synthesis with mocked AudioContext", () => {
    const mockOscillator = {
      type: "sine",
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    const mockFilter = {
      type: "lowpass",
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      Q: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    };

    const mockCtx = {
      currentTime: 10,
      state: "running",
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      createBiquadFilter: vi.fn(() => mockFilter),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    // Attach mock AudioContext to global window
    (global as unknown as { window: { AudioContext: unknown } }).window = {
      AudioContext: vi.fn(() => mockCtx),
    };

    const mockedAudio = new JarvisAudioEngine();
    mockedAudio.playReactorPowerUp();
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();

    mockedAudio.playBlip(1200);
    expect(mockOscillator.start).toHaveBeenCalled();

    mockedAudio.playVoiceActivate();
    expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalled();

    mockedAudio.playChime();
    expect(mockGain.gain.setValueAtTime).toHaveBeenCalled();
  });
});

describe("J.A.R.V.I.S. Speech & Subtitle Sanitization", () => {
  const sanitizeForSpeech = (text: string): string => {
    return text
      .replace(/```[\s\S]*?```/g, "Code snippet attached.")
      .replace(/\[ACTION:[^\]]+\]/g, "")
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/[*_#`\\[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  it("strips markdown formatting, links, and action tags cleanly", () => {
    const input =
      "**Allow me to introduce myself.** I am *J.A.R.V.I.S.* [ACTION:play_flow] Check `https://starkindustries.com` for details.";
    const sanitized = sanitizeForSpeech(input);

    expect(sanitized).toBe("Allow me to introduce myself. I am J.A.R.V.I.S. Check for details.");
    expect(sanitized).not.toContain("**");
    expect(sanitized).not.toContain("[ACTION");
    expect(sanitized).not.toContain("https://");
  });

  it("replaces multi-line code blocks with a natural spoken phrase", () => {
    const codeInput = "Here is your handler:\n```typescript\nconst arcPower = 100;\n```\nAll nominal.";
    const sanitized = sanitizeForSpeech(codeInput);

    expect(sanitized).toContain("Code snippet attached.");
    expect(sanitized).not.toContain("const arcPower");
  });
});

describe("J.A.R.V.I.S. Hologram Clock & Reticle Formatting", () => {
  const formatJarvisClock = (date: Date): string => {
    let hours = date.getHours();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
    const hStr = pad(hours);
    const mStr = pad(date.getMinutes());
    const sStr = pad(date.getSeconds());
    return `${hStr}:${mStr} :${sStr} ${ampm}`;
  };

  it("formats time matching Marvel Iron Man 3 Second Screen reference format", () => {
    // Test 10:17:17 PM (from the video screenshot)
    const testDate = new Date(2026, 8, 12, 22, 17, 17);
    expect(formatJarvisClock(testDate)).toBe("10:17 :17 PM");

    // Test midnight (00:05:09 -> 12:05 :09 AM)
    const midnight = new Date(2026, 8, 12, 0, 5, 9);
    expect(formatJarvisClock(midnight)).toBe("12:05 :09 AM");

    // Test noon (12:00:00 -> 12:00 :00 PM)
    const noon = new Date(2026, 8, 12, 12, 0, 0);
    expect(formatJarvisClock(noon)).toBe("12:00 :00 PM");
  });
});
