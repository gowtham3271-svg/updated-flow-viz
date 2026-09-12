/**
 * Procedural Web Audio API Sound Generator for J.A.R.V.I.S.
 * Recreates authentic Stark Industries arc reactor and HUD audio cues
 * without requiring any external audio files or network requests.
 */

export class JarvisAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Arc Reactor Power-Up Hum: Rising resonant frequency sweep
   */
  public playReactorPowerUp() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Sub-bass rumble
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = "sawtooth";
      subOsc.frequency.setValueAtTime(40, now);
      subOsc.frequency.exponentialRampToValueAtTime(120, now + 0.9);

      // Low-pass filter for deep arc reactor resonance
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(150, now);
      filter.frequency.exponentialRampToValueAtTime(750, now + 0.9);
      filter.Q.setValueAtTime(4, now);

      subGain.gain.setValueAtTime(0.01, now);
      subGain.gain.linearRampToValueAtTime(0.25, now + 0.4);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      subOsc.connect(filter);
      filter.connect(subGain);
      subGain.connect(ctx.destination);

      subOsc.start(now);
      subOsc.stop(now + 1.2);

      // High-tech harmonic shimmer
      const shimmerOsc = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmerOsc.type = "sine";
      shimmerOsc.frequency.setValueAtTime(440, now);
      shimmerOsc.frequency.exponentialRampToValueAtTime(880, now + 0.6);

      shimmerGain.gain.setValueAtTime(0.001, now);
      shimmerGain.gain.linearRampToValueAtTime(0.12, now + 0.3);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(ctx.destination);

      shimmerOsc.start(now);
      shimmerOsc.stop(now + 0.9);
    } catch {
      /* AudioContext error handled safely */
    }
  }

  /**
   * Futuristic HUD Blip / Button Click
   */
  public playBlip(freq = 1200) {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.04);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      /* ignore */
    }
  }

  /**
   * Voice Recognition Activate Chime: Dual rising tone
   */
  public playVoiceActivate() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Note 1: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Note 2: B5 (987.77 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(987.77, now + 0.09);
      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.setValueAtTime(0.12, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.28);
    } catch {
      /* ignore */
    }
  }

  /**
   * Confirmation / Success Chime: Harmonious futuristic triad
   */
  public playChime() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = [587.33, 880.0, 1174.66]; // D5, A5, D6

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.setValueAtTime(0.09, now + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.35);
      });
    } catch {
      /* ignore */
    }
  }
}

export const jarvisAudio = new JarvisAudioEngine();
