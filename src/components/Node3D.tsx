import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, RoundedBox, Cylinder, Html } from "@react-three/drei";
import * as THREE from "three";
import type { FlowNode } from "@/types";
import { NODE_COLORS } from "@/types";

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

export function Node3D({ node, position, isActive, isDimmed, isHovered, annotation, onHover, onClick, isLight }: Node3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const color = new THREE.Color(NODE_COLORS[node.kind]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.position.lerp(targetPos, delta * 4);

    const targetScale = isActive ? 1.25 : isHovered ? 1.12 : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 6);

    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      const targetOpacity = isActive ? 0.5 : isHovered ? 0.35 : isDimmed ? 0.05 : 0.15;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, delta * 5);
    }

    if (pulseRef.current) {
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial;
      const pulseTime = state.clock.elapsedTime * 2;
      const pulse = (Math.sin(pulseTime + position[0] + position[1]) + 1) / 2;
      const baseOpacity = isActive ? 0.4 : isHovered ? 0.25 : isDimmed ? 0.02 : 0.08;
      mat.opacity = baseOpacity + pulse * 0.1;
      const pulseScale = 1 + pulse * 0.15;
      pulseRef.current.scale.setScalar(pulseScale);
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = "pointer"; }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(null); document.body.style.cursor = "default"; }}
      onClick={(e) => { e.stopPropagation(); onClick(node.id); }}
    >
      <mesh ref={pulseRef} position={[0, 0, 0]}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>

      <mesh ref={glowRef} position={[0, 0, 0]}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.BackSide} />
      </mesh>

      <NodeShape kind={node.kind} color={color} isActive={isActive} isDimmed={isDimmed} isLight={isLight} />

      <Text
        position={[0, 1.6, 0]}
        fontSize={0.32}
        color={isDimmed ? (isLight ? "#aaa" : "#666") : "#fff"}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor={isLight ? "#fff" : "#000"}
      >
        {node.label}
      </Text>

      <Text
        position={[0, -1.5, 0]}
        fontSize={0.16}
        color={isDimmed ? (isLight ? "#bbb" : "#444") : (isLight ? "#475569" : "#94a3b8")}
        anchorX="center"
        anchorY="middle"
      >
        {node.kind.toUpperCase()}
      </Text>

      {(isHovered || isActive) && !isDimmed && (
        <Html position={[0, -2.2, 0]} center distanceFactor={10} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(15, 23, 42, 0.92)",
            border: `1px solid ${NODE_COLORS[node.kind]}`,
            borderRadius: "8px",
            padding: "10px 14px",
            maxWidth: "260px",
            color: "#e2e8f0",
            fontSize: "13px",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            boxShadow: `0 0 20px ${NODE_COLORS[node.kind]}40`,
          }}>
            <div style={{ fontWeight: 700, marginBottom: "4px", color: NODE_COLORS[node.kind] }}>
              {node.label}
            </div>
            <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "6px" }}>
              {node.file}:{node.line}
            </div>
            <div style={{ fontSize: "12px" }}>{node.detail}</div>
          </div>
        </Html>
      )}

      {annotation && (
        <Html position={[1.8, 0.5, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(251, 191, 36, 0.12)",
            border: "1px solid #fbbf24",
            borderRadius: "8px",
            padding: "8px 12px",
            maxWidth: "200px",
            color: "#fde68a",
            fontSize: "12px",
            fontFamily: "monospace",
          }}>
            <div style={{ fontSize: "10px", opacity: 0.7, marginBottom: "2px" }}>NOTE</div>
            {annotation}
          </div>
        </Html>
      )}
    </group>
  );
}

function NodeShape({ kind, color, isActive, isDimmed, isLight }: { kind: FlowNode["kind"]; color: THREE.Color; isActive: boolean; isDimmed: boolean; isLight: boolean }) {
  const emissiveIntensity = isActive ? 0.8 : isDimmed ? (isLight ? 0.02 : 0.05) : (isLight ? 0.15 : 0.3);

  if (kind === "frontend") {
    return (
      <group>
        <RoundedBox args={[1.6, 1.1, 0.3]} radius={0.08} smoothness={4}>
          <meshStandardMaterial color={color} metalness={0.7} roughness={0.25} emissive={color} emissiveIntensity={emissiveIntensity} />
        </RoundedBox>
        <mesh position={[0, 0, 0.16]}>
          <planeGeometry args={[1.4, 0.9]} />
          <meshStandardMaterial color="#0f172a" emissive={color} emissiveIntensity={emissiveIntensity * 0.3} metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.35, 0.17]}>
          <planeGeometry args={[1.3, 0.15]} />
          <meshBasicMaterial color={color} opacity={0.6} transparent />
        </mesh>
        <mesh position={[-0.6, 0.45, 0.17]}>
          <circleGeometry args={[0.05, 16]} />
          <meshBasicMaterial color={isActive ? "#4ade80" : color} />
        </mesh>
        <mesh position={[-0.45, 0.45, 0.17]}>
          <circleGeometry args={[0.05, 16]} />
          <meshBasicMaterial color={isActive ? "#fbbf24" : color} opacity={0.7} transparent />
        </mesh>
        <mesh position={[-0.3, 0.45, 0.17]}>
          <circleGeometry args={[0.05, 16]} />
          <meshBasicMaterial color={isActive ? "#f87171" : color} opacity={0.7} transparent />
        </mesh>
        <mesh position={[0, 0.1, 0.17]}>
          <planeGeometry args={[0.4, 0.3]} />
          <meshBasicMaterial color={color} opacity={0.4} transparent />
        </mesh>
        <mesh position={[-0.45, -0.1, 0.17]}>
          <planeGeometry args={[0.3, 0.15]} />
          <meshBasicMaterial color={color} opacity={0.25} transparent />
        </mesh>
        <mesh position={[0.35, -0.2, 0.17]}>
          <planeGeometry args={[0.25, 0.2]} />
          <meshBasicMaterial color={color} opacity={0.3} transparent />
        </mesh>
      </group>
    );
  }

  if (kind === "backend") {
    return (
      <group>
        <RoundedBox args={[1.3, 1.5, 0.8]} radius={0.06} smoothness={4}>
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} emissive={color} emissiveIntensity={emissiveIntensity} />
        </RoundedBox>
        {[0.4, 0, -0.4].map((y, i) => (
          <mesh key={i} position={[0, y, 0.42]}>
            <planeGeometry args={[1.0, 0.12]} />
            <meshBasicMaterial color="#0f172a" opacity={0.8} transparent />
          </mesh>
        ))}
        {[0.4, 0, -0.4].map((y, i) => (
          <mesh key={`l${i}`} position={[-0.4, y + 0.02, 0.43]}>
            <circleGeometry args={[0.03, 16]} />
            <meshBasicMaterial color={isActive ? "#4ade80" : "#22d3ee"} />
          </mesh>
        ))}
        {[0.4, 0, -0.4].map((y, i) => (
          <mesh key={`r${i}`} position={[0.4, y + 0.02, 0.43]}>
            <circleGeometry args={[0.02, 16]} />
            <meshBasicMaterial color={isActive ? "#fbbf24" : "#38bdf8"} opacity={0.6} transparent />
          </mesh>
        ))}
        <mesh position={[0, -0.7, 0.42]}>
          <planeGeometry args={[0.8, 0.04]} />
          <meshBasicMaterial color={isActive ? "#4ade80" : color} opacity={0.8} transparent />
        </mesh>
      </group>
    );
  }

  if (kind === "database") {
    return (
      <group>
        {[0.5, 0.15, -0.2, -0.55].map((y, i) => (
          <Cylinder key={i} args={[0.7, 0.7, 0.22, 32]} position={[0, y, 0]}>
            <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} emissive={color} emissiveIntensity={emissiveIntensity} transparent opacity={0.9} />
          </Cylinder>
        ))}
        <Cylinder args={[0.72, 0.72, 0.04, 32]} position={[0, 0.5, 0]}>
          <meshStandardMaterial color={color} metalness={0.9} roughness={0.1} emissive={color} emissiveIntensity={emissiveIntensity} />
        </Cylinder>
        {[0.5, 0.15, -0.2, -0.55].map((y, i) => (
          <mesh key={`band${i}`} position={[0, y + 0.11, 0]}>
            <torusGeometry args={[0.71, 0.015, 8, 32]} />
            <meshBasicMaterial color={isActive ? "#4ade80" : color} opacity={0.5} transparent />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group>
      <RoundedBox args={[1, 0.8, 0.6]} radius={0.1} smoothness={4}>
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} emissive={color} emissiveIntensity={emissiveIntensity * 0.6} />
      </RoundedBox>
      <mesh position={[0, 0, 0.32]}>
        <circleGeometry args={[0.18, 6]} />
        <meshBasicMaterial color="#0f172a" opacity={0.8} transparent />
      </mesh>
      <mesh position={[0, 0, 0.33]}>
        <torusGeometry args={[0.14, 0.03, 8, 6]} />
        <meshBasicMaterial color={isActive ? "#4ade80" : color} />
      </mesh>
    </group>
  );
}
