import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { FlowEdge } from "@/types";
import { EDGE_COLORS } from "@/types";

interface Beam3DProps {
  edge: FlowEdge;
  fromPos: [number, number, number];
  toPos: [number, number, number];
  isActive: boolean;
  isDimmed: boolean;
  flowProgress: number;
  isLight: boolean;
  ambientFlow?: boolean;
}

const TRAIL_COUNT = 5;

export function Beam3D({ edge, fromPos, toPos, isActive, isDimmed, flowProgress, isLight, ambientFlow }: Beam3DProps) {
  const tubeRef = useRef<THREE.Mesh>(null);
  const particleRef = useRef<THREE.Mesh>(null);
  const trailRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ambientRef = useRef<THREE.Mesh>(null);
  const color = new THREE.Color(EDGE_COLORS[edge.kind]);

  // Keep references to start and end positions to animate them smoothly
  const currentStart = useRef(new THREE.Vector3(...fromPos));
  const currentEnd = useRef(new THREE.Vector3(...toPos));

  // Initialize the curve and mutable points
  const curve = useMemo(() => {
    const start = new THREE.Vector3(...fromPos);
    const end = new THREE.Vector3(...toPos);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    mid.y += dist * 0.25;
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [fromPos, toPos]);

  // Track the generated tube geometry (lower segments for higher performance during dynamic rebuilds)
  const tubeGeometry = useMemo(() => new THREE.TubeGeometry(curve, 32, 0.03, 6, false), [curve]);

  const edgeOffset = useMemo(() => (edge.id.charCodeAt(0) + edge.id.charCodeAt(1)) / 200, [edge.id]);

  useFrame((state, delta) => {
    // Smoothly lerp connection positions to follow node transition
    const targetStart = new THREE.Vector3(...fromPos);
    const targetEnd = new THREE.Vector3(...toPos);

    if (currentStart.current.distanceTo(targetStart) > 0.005 || currentEnd.current.distanceTo(targetEnd) > 0.005) {
      currentStart.current.lerp(targetStart, delta * 5);
      currentEnd.current.lerp(targetEnd, delta * 5);

      curve.v0.copy(currentStart.current);
      curve.v2.copy(currentEnd.current);
      const mid = currentStart.current.clone().add(currentEnd.current).multiplyScalar(0.5);
      const dist = currentStart.current.distanceTo(currentEnd.current);
      mid.y += dist * 0.25;
      curve.v1.copy(mid);

      if (tubeRef.current) {
        tubeRef.current.geometry.dispose();
        tubeRef.current.geometry = new THREE.TubeGeometry(curve, 32, 0.03, 6, false);
      }
    }

    if (tubeRef.current) {
      const mat = tubeRef.current.material as THREE.MeshBasicMaterial;
      const targetOpacity = isActive ? 0.9 : isDimmed ? (isLight ? 0.03 : 0.05) : (isLight ? 0.3 : 0.4);
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, delta * 5);
    }

    if (particleRef.current) {
      const t = (flowProgress + edgeOffset) % 1;
      if (isActive && t >= 0 && t <= 1) {
        const pos = curve.getPoint(t);
        particleRef.current.position.copy(pos);
        particleRef.current.visible = true;
        const mat = particleRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = 1;
        const scale = 1 + Math.sin(t * Math.PI) * 0.3;
        particleRef.current.scale.setScalar(scale);
      } else {
        particleRef.current.visible = false;
      }
    }

    trailRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const trailT = (flowProgress + edgeOffset - (i + 1) * 0.04) % 1;
      if (isActive && trailT >= 0 && trailT <= 1) {
        const pos = curve.getPoint(trailT);
        mesh.position.copy(pos);
        mesh.visible = true;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - i / TRAIL_COUNT) * 0.5;
        const scale = (1 - i / TRAIL_COUNT) * 0.8;
        mesh.scale.setScalar(scale);
      } else {
        mesh.visible = false;
      }
    });

    // Ambient flow particle - always travels along the beam at low opacity
    if (ambientRef.current) {
      const ambientT = (state.clock.elapsedTime * 0.15 + edgeOffset) % 1;
      const pos = curve.getPoint(ambientT);
      ambientRef.current.position.copy(pos);
      const mat = ambientRef.current.material as THREE.MeshBasicMaterial;
      if (isActive) {
        ambientRef.current.visible = false;
      } else if (!isDimmed) {
        ambientRef.current.visible = true;
        mat.opacity = 0.35 + Math.sin(ambientT * Math.PI) * 0.2;
        ambientRef.current.scale.setScalar(0.6 + Math.sin(ambientT * Math.PI) * 0.2);
      } else {
        ambientRef.current.visible = false;
      }
    }
  });

  const midPoint = curve.getPoint(0.5);

  return (
    <group>
      <mesh ref={tubeRef} geometry={tubeGeometry}>
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>

      {/* Active flow particle */}
      <mesh ref={particleRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={1} />
      </mesh>

      {/* Ambient flow particle - always alive */}
      {ambientFlow && (
        <mesh ref={ambientRef} visible={false}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} />
        </mesh>
      )}

      {Array.from({ length: TRAIL_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { trailRefs.current[i] = el; }}
          visible={false}
        >
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} />
        </mesh>
      ))}

      {!isDimmed && (
        <Text
          position={[midPoint.x, midPoint.y + 0.3, midPoint.z]}
          fontSize={0.18}
          color={isActive ? "#fff" : EDGE_COLORS[edge.kind]}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor={isLight ? "#fff" : "#000"}
        >
          {edge.label.length > 25 ? edge.label.slice(0, 25) + "…" : edge.label}
        </Text>
      )}
    </group>
  );
}
