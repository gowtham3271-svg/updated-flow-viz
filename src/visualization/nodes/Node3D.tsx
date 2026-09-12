import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Html } from "@react-three/drei";
import * as THREE from "three";
import type { FlowNode } from "@/types";
import { NODE_COLORS } from "@/types";
import { NodeGeometries } from "./NodeGeometries";

interface Node3DProps {
  node: FlowNode;
  position: [number, number, number];
  isActive: boolean;
  isDimmed: boolean;
  isHovered: boolean;
  annotation: string | null;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  isLight: boolean;
}

export function Node3D({
  node,
  position,
  isActive,
  isDimmed,
  isHovered,
  annotation,
  onHover,
  onClick,
  isLight,
}: Node3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const nodeColorHex = NODE_COLORS[node.kind] ?? "#38bdf8";
  const color = useMemo(() => new THREE.Color(nodeColorHex), [nodeColorHex]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // Framerate-independent smooth position lerp
    const posFactor = 1 - Math.exp(-8 * delta);
    groupRef.current.position.lerp(targetPos, posFactor);

    // Scale animation based on selection & hover without memory allocation
    const targetScale = isActive ? 1.25 : isHovered ? 1.12 : isDimmed ? 0.92 : 1.0;
    const currentScale = groupRef.current.scale.x;
    const scaleFactor = 1 - Math.exp(-10 * delta);
    const newScale = THREE.MathUtils.lerp(currentScale, targetScale, scaleFactor);
    groupRef.current.scale.set(newScale, newScale, newScale);

    // Ambient glow mesh lerp
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      const targetOpacity = isActive
        ? 0.45
        : isHovered
        ? 0.32
        : isDimmed
        ? 0.03
        : 0.12;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 1 - Math.exp(-8 * delta));
    }

    // Dynamic telemetry pulse
    if (pulseRef.current) {
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
      const time = state.clock.elapsedTime * 2.2;
      const pulse = (Math.sin(time + position[0] + position[2]) + 1) / 2;
      const baseOpacity = isActive ? 0.35 : isHovered ? 0.2 : isDimmed ? 0.01 : 0.06;
      mat.opacity = baseOpacity + pulse * 0.08;
      pulseRef.current.scale.setScalar(1 + pulse * 0.15);
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(node.id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHover(null);
        document.body.style.cursor = "default";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(node.id);
      }}
    >
      {/* Outer telemetry pulse field */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[1.55, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.06}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Core glow aura */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1.35, 24, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Domain-specific 3D geometry */}
      <NodeGeometries
        kind={node.kind}
        color={color}
        isActive={isActive}
        isDimmed={isDimmed}
        isHovered={isHovered}
        isLight={isLight}
      />

      {/* Primary Label */}
      <Text
        position={[0, 1.75, 0]}
        fontSize={0.34}
        color={isDimmed ? (isLight ? "#94a3b8" : "#475569") : "#ffffff"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.025}
        outlineColor={isLight ? "#ffffff" : "#020617"}
      >
        {node.label}
      </Text>

      {/* Architecture Type Badge */}
      <Text
        position={[0, -1.65, 0]}
        fontSize={0.18}
        color={isDimmed ? (isLight ? "#cbd5e1" : "#334155") : color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.015}
        outlineColor={isLight ? "#ffffff" : "#020617"}
      >
        {node.kind.toUpperCase()}
      </Text>

      {/* Interactive Tooltip on Hover / Active */}
      {(isHovered || isActive) && !isDimmed && (
        <Html
          position={[0, -2.3, 0]}
          center
          distanceFactor={11}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(10, 15, 29, 0.94)",
              backdropFilter: "blur(12px)",
              border: `1px solid ${nodeColorHex}80`,
              borderRadius: "10px",
              padding: "10px 14px",
              maxWidth: "280px",
              color: "#f8fafc",
              fontSize: "12px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              boxShadow: `0 0 25px ${nodeColorHex}40, 0 10px 20px rgba(0,0,0,0.6)`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span style={{ fontWeight: 700, color: nodeColorHex }}>
                {node.label}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: `${nodeColorHex}25`,
                  color: nodeColorHex,
                  textTransform: "uppercase",
                }}
              >
                {node.kind}
              </span>
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "#94a3b8",
                marginBottom: "6px",
              }}
            >
              {node.file ? `${node.file}:${node.line}` : "Virtual node"}
            </div>
            <div style={{ fontSize: "11px", color: "#cbd5e1", lineHeight: 1.4 }}>
              {node.detail}
            </div>
          </div>
        </Html>
      )}

      {/* Annotation Badge */}
      {annotation && (
        <Html
          position={[1.8, 0.6, 0]}
          center
          distanceFactor={12}
          style={{ pointerEvents: "none" }}
        >
          <div
            style={{
              background: "rgba(245, 158, 11, 0.15)",
              border: "1px solid #f59e0b",
              borderRadius: "8px",
              padding: "8px 12px",
              maxWidth: "220px",
              color: "#fde68a",
              fontSize: "12px",
              fontFamily: "monospace",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ fontSize: "10px", opacity: 0.7, marginBottom: "2px" }}>
              NOTE
            </div>
            {annotation}
          </div>
        </Html>
      )}
    </group>
  );
}
