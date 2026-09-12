import React, { useEffect, useRef, useState } from "react";
import { jarvisAudio } from "@/lib/jarvisAudio";

interface JarvisHologramCoreProps {
  speaking?: boolean;
  listening?: boolean;
  interactive?: boolean;
  width?: number;
  height?: number;
  showClock?: boolean;
  showDegrees?: boolean;
  onClick?: () => void;
  className?: string;
}

export function JarvisHologramCore({
  speaking = false,
  listening = false,
  interactive = true,
  width = 460,
  height = 460,
  showClock = true,
  showDegrees = true,
  onClick,
  className = "",
}: JarvisHologramCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const shockwavesRef = useRef<{ radius: number; maxRadius: number; alpha: number }[]>([]);
  const [currentTimeStr, setCurrentTimeStr] = useState("");

  // Keep speech / listening status in ref for 60fps canvas loop
  const stateRef = useRef({ speaking, listening });
  useEffect(() => {
    stateRef.current = { speaking, listening };
  }, [speaking, listening]);

  // Real-time clock update (HH:MM :SS AM/PM)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 becomes 12
      const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
      const hStr = pad(hours);
      const mStr = pad(now.getMinutes());
      const sStr = pad(now.getSeconds());
      setCurrentTimeStr(`${hStr}:${mStr} :${sStr} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    jarvisAudio.playBlip(1400);

    // Add visual shockwave
    shockwavesRef.current.push({
      radius: 10,
      maxRadius: Math.min(width, height) * 0.45,
      alpha: 1.0,
    });

    onClick?.();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let time = 0;
    let sphereRotationY = 0;
    let sphereRotationX = 0;

    // Generate 3D Geodesic sphere vertices (lat/lon rings)
    const rings = 8;
    const segments = 16;
    const sphereRadius = Math.min(width, height) * 0.22;
    const vertices: { x: number; y: number; z: number }[] = [];

    for (let r = 1; r < rings; r++) {
      const theta = (r * Math.PI) / rings;
      const y = sphereRadius * Math.cos(theta);
      const ringRadius = sphereRadius * Math.sin(theta);

      for (let s = 0; s < segments; s++) {
        const phi = (s * 2 * Math.PI) / segments;
        const x = ringRadius * Math.cos(phi);
        const z = ringRadius * Math.sin(phi);
        vertices.push({ x, y, z });
      }
    }

    // Set canvas dimensions with high-DPI scaling
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const render = () => {
      time += 0.025;
      const { speaking: isSpeaking, listening: isListening } = stateRef.current;

      // Dynamic rotation speed based on system activity
      const rotSpeed = isSpeaking ? 0.016 : isListening ? 0.012 : 0.007;
      sphereRotationY += rotSpeed;
      sphereRotationX = Math.sin(time * 0.6) * 0.22;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.min(width, height) * 0.46;

      // ── 1. AMBIENT GLOW BACKDROP ──
      const bgGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, maxR * 1.05);
      bgGlow.addColorStop(0, "rgba(0, 212, 255, 0.12)");
      bgGlow.addColorStop(0.5, "rgba(0, 180, 216, 0.04)");
      bgGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bgGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 1.05, 0, Math.PI * 2);
      ctx.fill();

      // ── 2. CONCENTRIC RADAR RINGS & DEGREE TICKS ──
      // Outer border circle
      ctx.save();
      ctx.strokeStyle = "rgba(0, 212, 255, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.stroke();

      // Degree tick marks (every 5 degrees, larger at 30/45/90)
      if (showDegrees) {
        ctx.fillStyle = "rgba(0, 245, 212, 0.75)";
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let deg = 0; deg < 360; deg += 5) {
          const rad = (deg * Math.PI) / 180;
          const isMajor = deg % 90 === 0;
          const isMid = deg % 30 === 0;
          const tickLen = isMajor ? 10 : isMid ? 6 : 3;

          const innerX = cx + (maxR - tickLen) * Math.cos(rad);
          const innerY = cy + (maxR - tickLen) * Math.sin(rad);
          const outerX = cx + maxR * Math.cos(rad);
          const outerY = cy + maxR * Math.sin(rad);

          ctx.strokeStyle = isMajor
            ? "rgba(0, 245, 212, 0.85)"
            : isMid
            ? "rgba(0, 212, 255, 0.5)"
            : "rgba(0, 180, 216, 0.25)";
          ctx.lineWidth = isMajor ? 1.5 : 1;
          ctx.beginPath();
          ctx.moveTo(innerX, innerY);
          ctx.lineTo(outerX, outerY);
          ctx.stroke();

          // Degree numbers at major axes
          if (isMajor) {
            const labelR = maxR - 20;
            const lx = cx + labelR * Math.cos(rad);
            const ly = cy + labelR * Math.sin(rad);
            ctx.fillText(`${deg}°`, lx, ly);
          }
        }
      }
      ctx.restore();

      // ── 3. ROTATING SEGMENTED RADAR ARCS ──
      ctx.save();
      // Clockwise outer segmented arc
      ctx.strokeStyle = "rgba(0, 245, 212, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 0.88, time * 0.5, time * 0.5 + Math.PI * 0.6);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 0.88, time * 0.5 + Math.PI, time * 0.5 + Math.PI * 1.6);
      ctx.stroke();

      // Counter-clockwise inner dashed arc
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(0, 180, 216, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 0.76, -time * 0.4, -time * 0.4 + Math.PI * 1.4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // ── 4. CROSSHAIR RETICLE & DIGITAL CLOCK ──
      ctx.save();
      ctx.strokeStyle = "rgba(0, 212, 255, 0.22)";
      ctx.lineWidth = 1;

      // Horizontal crosshair line
      ctx.beginPath();
      ctx.moveTo(cx - maxR * 0.95, cy);
      ctx.lineTo(cx - maxR * 0.38, cy);
      ctx.moveTo(cx + maxR * 0.38, cy);
      ctx.lineTo(cx + maxR * 0.95, cy);
      ctx.stroke();

      // Center crosshair notches
      const notchSize = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - maxR * 0.95);
      ctx.lineTo(cx, cy - maxR * 0.88);
      ctx.moveTo(cx, cy + maxR * 0.88);
      ctx.lineTo(cx, cy + maxR * 0.95);
      ctx.stroke();

      // Real-time digital clock display on horizontal reticle
      if (showClock && currentTimeStr) {
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(0, 245, 212, 0.9)";
        ctx.shadowColor = "rgba(0, 245, 212, 0.8)";
        ctx.shadowBlur = 6;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Draw HUD brackets around clock at right side of crosshair
        const clockX = cx + maxR * 0.58;
        const clockY = cy - 14;
        ctx.fillText(currentTimeStr, clockX, clockY);

        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(0, 180, 216, 0.7)";
        ctx.shadowBlur = 0;
        ctx.fillText("STARK_NET // SYS:SEC.2", clockX, clockY + 12);
      }
      ctx.restore();

      // ── 5. 3D ROTATING GEODESIC SPHERE ──
      ctx.save();
      const fov = 300;
      const cosY = Math.cos(sphereRotationY);
      const sinY = Math.sin(sphereRotationY);
      const cosX = Math.cos(sphereRotationX);
      const sinX = Math.sin(sphereRotationX);

      // Projected points cache
      const projected: { px: number; py: number; depth: number }[] = [];

      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];

        // Rotate Y
        const x1 = v.x * cosY + v.z * sinY;
        const z1 = -v.x * sinY + v.z * cosY;

        // Rotate X
        const y2 = v.y * cosX - z1 * sinX;
        const z2 = v.y * sinX + z1 * cosX;

        // Perspective projection
        const scale = fov / (fov + z2 + 80);
        const px = cx + x1 * scale;
        const py = cy + y2 * scale;
        projected.push({ px, py, depth: z2 });
      }

      // Draw wireframe latitude connections
      ctx.strokeStyle = isSpeaking
        ? "rgba(0, 245, 212, 0.38)"
        : "rgba(0, 212, 255, 0.2)";
      ctx.lineWidth = 1;

      for (let r = 0; r < rings - 1; r++) {
        const startIdx = r * segments;
        ctx.beginPath();
        for (let s = 0; s < segments; s++) {
          const idx = startIdx + s;
          const nextIdx = startIdx + ((s + 1) % segments);
          if (projected[idx] && projected[nextIdx]) {
            ctx.moveTo(projected[idx].px, projected[idx].py);
            ctx.lineTo(projected[nextIdx].px, projected[nextIdx].py);
          }
        }
        ctx.stroke();
      }

      // Draw wireframe longitude connections
      for (let s = 0; s < segments; s++) {
        ctx.beginPath();
        for (let r = 0; r < rings - 2; r++) {
          const idx = r * segments + s;
          const nextIdx = (r + 1) * segments + s;
          if (projected[idx] && projected[nextIdx]) {
            ctx.moveTo(projected[idx].px, projected[idx].py);
            ctx.lineTo(projected[nextIdx].px, projected[nextIdx].py);
          }
        }
        ctx.stroke();
      }

      // Draw glowing vertices (front-facing ones brighter)
      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        if (p.depth > -30) {
          const pointAlpha = Math.min(1, Math.max(0.1, (p.depth + 60) / 120));
          ctx.fillStyle = isSpeaking
            ? `rgba(255, 255, 255, ${pointAlpha * 0.9})`
            : `rgba(0, 245, 212, ${pointAlpha * 0.75})`;
          ctx.beginPath();
          ctx.arc(p.px, p.py, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ── 6. FLUID AUDIO WAVEFORM RING (SIGNATURE MARVEL JARVIS ELEMENT) ──
      ctx.save();
      const waveRadius = maxR * 0.58;
      const numPoints = 180;
      const wavePoints: { x: number; y: number }[] = [];

      // Dynamic amplitude: explodes when speaking, pulses when listening, gentle breathing when idle
      const baseAmp = isSpeaking ? 16 : isListening ? 9 : 4.5;
      const speedMult = isSpeaking ? 2.8 : isListening ? 1.8 : 1.0;

      for (let i = 0; i < numPoints; i++) {
        const angle = (i * 2 * Math.PI) / numPoints;

        // Multi-frequency harmonic perturbation
        const wave1 = Math.sin(angle * 7 + time * 4 * speedMult);
        const wave2 = Math.cos(angle * 13 - time * 3 * speedMult);
        const wave3 = Math.sin(angle * 21 + time * 5 * speedMult) * (isSpeaking ? 0.6 : 0.2);
        const wave4 = Math.cos(angle * 3 + time * 1.5) * 0.4;

        const displacement = (wave1 * 0.5 + wave2 * 0.3 + wave3 + wave4) * baseAmp;
        const currentR = waveRadius + displacement;

        const wx = cx + currentR * Math.cos(angle);
        const wy = cy + currentR * Math.sin(angle);
        wavePoints.push({ x: wx, y: wy });
      }

      // Render primary outer fluid ring with bloom
      ctx.shadowColor = isSpeaking ? "rgba(0, 245, 212, 0.95)" : "rgba(0, 212, 255, 0.7)";
      ctx.shadowBlur = isSpeaking ? 18 : 10;
      ctx.strokeStyle = isSpeaking ? "#ffffff" : "#00f5d4";
      ctx.lineWidth = isSpeaking ? 2.8 : 2.0;

      ctx.beginPath();
      for (let i = 0; i <= wavePoints.length; i++) {
        const pt = wavePoints[i % wavePoints.length];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.stroke();

      // Render secondary resonant inner fluid echo
      ctx.shadowBlur = 4;
      ctx.strokeStyle = isSpeaking ? "rgba(0, 245, 212, 0.65)" : "rgba(0, 180, 216, 0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= wavePoints.length; i++) {
        const pt = wavePoints[i % wavePoints.length];
        const echoR = (waveRadius - 8) + (Math.sin(i * 0.2 + time * 3) * (baseAmp * 0.4));
        const angle = (i * 2 * Math.PI) / numPoints;
        const ex = cx + echoR * Math.cos(angle);
        const ey = cy + echoR * Math.sin(angle);
        if (i === 0) ctx.moveTo(ex, ey);
        else ctx.lineTo(ex, ey);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // ── 7. INNER ARC REACTOR CORE ──
      ctx.save();
      const corePulse = Math.sin(time * (isSpeaking ? 8 : 3)) * 0.15 + 0.85;
      const coreRadius = Math.min(width, height) * 0.08 * corePulse;

      // Outer aperture ring
      ctx.strokeStyle = "rgba(0, 245, 212, 0.8)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(0, 245, 212, 1)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating aperture segments / spokes
      const spokeCount = 6;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.5;
      for (let s = 0; s < spokeCount; s++) {
        const sa = time * 0.8 + (s * 2 * Math.PI) / spokeCount;
        ctx.beginPath();
        ctx.moveTo(cx + (coreRadius * 0.4) * Math.cos(sa), cy + (coreRadius * 0.4) * Math.sin(sa));
        ctx.lineTo(cx + coreRadius * Math.cos(sa), cy + coreRadius * Math.sin(sa));
        ctx.stroke();
      }

      // Blinding white center arc reactor star
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 0.5);
      centerGlow.addColorStop(0, "#ffffff");
      centerGlow.addColorStop(0.4, "rgba(0, 245, 212, 0.95)");
      centerGlow.addColorStop(1, "rgba(0, 212, 255, 0)");
      ctx.fillStyle = centerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // ── 8. INTERACTIVE SHOCKWAVE EXPANSIONS ──
      if (shockwavesRef.current.length > 0) {
        ctx.save();
        for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
          const sw = shockwavesRef.current[i];
          sw.radius += 5.5;
          sw.alpha *= 0.94;

          ctx.strokeStyle = `rgba(0, 245, 212, ${sw.alpha})`;
          ctx.lineWidth = 2;
          ctx.shadowColor = "rgba(0, 245, 212, 0.9)";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(cx, cy, sw.radius, 0, Math.PI * 2);
          ctx.stroke();

          if (sw.radius >= sw.maxRadius || sw.alpha <= 0.02) {
            shockwavesRef.current.splice(i, 1);
          }
        }
        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [width, height, showClock, showDegrees, interactive, currentTimeStr]);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          width,
          height,
          cursor: interactive ? "pointer" : "default",
        }}
        className="transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
        title={interactive ? "Click to interact with J.A.R.V.I.S. Core" : undefined}
      />
    </div>
  );
}
