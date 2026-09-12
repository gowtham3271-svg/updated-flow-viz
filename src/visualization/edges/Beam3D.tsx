import { useRef, useMemo, useEffect } from "react";
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

const TRAIL_COUNT = 6;

export function Beam3D({
  edge,
  fromPos,
  toPos,
  isActive,
  isDimmed,
  flowProgress,
  isLight,
  ambientFlow = true,
}: Beam3DProps) {
  const tubeRef = useRef<THREE.Mesh>(null);
  const particleRef = useRef<THREE.Mesh>(null);
  const trailRefs = useRef<(THREE.Mesh | null)[]>([]);

  const edgeColorHex = EDGE_COLORS[edge.kind] ?? "#38bdf8";
  const color = useMemo(() => new THREE.Color(edgeColorHex), [edgeColorHex]);

  // Track start and end positions for smooth lerping
  const currentStart = useRef(new THREE.Vector3(...fromPos));
  const currentEnd = useRef(new THREE.Vector3(...toPos));

  // Compute quadratic bezier curve with arc height based on 3D distance
  const curve = useMemo(() => {
    const start = new THREE.Vector3(...fromPos);
    const end = new THREE.Vector3(...toPos);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    // Dynamic arch: curve upwards and slightly in Z to prevent intersection with other edges
    mid.y += Math.min(dist * 0.22, 2.5);
    mid.z += (start.x > end.x ? 0.4 : -0.4);
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [fromPos, toPos]);

  // Initial tube geometry
  const initialGeometry = useMemo(() => {
    return new THREE.TubeGeometry(curve, 36, 0.035, 8, false);
  }, [curve]);

  // Clean up geometry on unmount
  useEffect(() => {
    return () => {
      initialGeometry.dispose();
    };
  }, [initialGeometry]);

  const edgeOffset = useMemo(() => {
    return (edge.id.charCodeAt(0) + (edge.id.charCodeAt(1) || 0)) / 150;
  }, [edge.id]);

  useFrame((state, delta) => {
    const targetStart = new THREE.Vector3(...fromPos);
    const targetEnd = new THREE.Vector3(...toPos);

    // If endpoints moved, rebuild curve geometry smoothly
    if (
      currentStart.current.distanceTo(targetStart) > 0.008 ||
      currentEnd.current.distanceTo(targetEnd) > 0.008
    ) {
      currentStart.current.lerp(targetStart, delta * 5);
      currentEnd.current.lerp(targetEnd, delta * 5);

      curve.v0.copy(currentStart.current);
      curve.v2.copy(currentEnd.current);
      const mid = currentStart.current.clone().add(currentEnd.current).multiplyScalar(0.5);
      const dist = currentStart.current.distanceTo(currentEnd.current);
      mid.y += Math.min(dist * 0.22, 2.5);
      mid.z += (currentStart.current.x > currentEnd.current.x ? 0.4 : -0.4);
      curve.v1.copy(mid);

      if (tubeRef.current) {
        tubeRef.current.geometry.dispose();
        tubeRef.current.geometry = new THREE.TubeGeometry(curve, 36, 0.035, 8, false);
      }
    }

    // Material opacity lerp
    if (tubeRef.current) {
      const mat = tubeRef.current.material as THREE.MeshBasicMaterial;
      const targetOpacity = isActive
        ? 0.95
        : isDimmed
        ? (isLight ? 0.02 : 0.04)
        : (isLight ? 0.35 : 0.45);
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, delta * 6);
    }

    // Particle flow calculation
    const effectiveProgress = isActive
      ? flowProgress
      : ambientFlow
      ? (state.clock.elapsedTime * 0.35 + edgeOffset) % 1
      : -1;

    if (particleRef.current) {
      if (effectiveProgress >= 0 && effectiveProgress <= 1 && !isDimmed) {
        const pos = curve.getPoint(effectiveProgress);
        particleRef.current.position.copy(pos);
        particleRef.current.visible = true;

        const pulseScale = isActive
          ? 1.4 + Math.sin(effectiveProgress * Math.PI) * 0.5
          : 0.9;
        particleRef.current.scale.setScalar(pulseScale);
      } else {
        particleRef.current.visible = false;
      }
    }

    // Trail particle positions
    trailRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const trailT = (effectiveProgress - (i + 1) * 0.035 + 1) % 1;
      if (effectiveProgress >= 0 && !isDimmed) {
        const pos = curve.getPoint(trailT);
        mesh.position.copy(pos);
        mesh.visible = true;
        const mat = mesh.material as THREE.MeshBasicMaterial;
        const fade = (1 - (i + 1) / TRAIL_COUNT);
        mat.opacity = (isActive ? 0.7 : 0.3) * fade;
        mesh.scale.setScalar(fade * (isActive ? 1.0 : 0.65));
      } else {
        mesh.visible = false;
      }
    });
  });

  const midPoint = useMemo(() => curve.getPoint(0.5), [curve]);

  return (
    <group>
      {/* Edge backbone wire */}
      <mesh ref={tubeRef} geometry={initialGeometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isDimmed ? 0.04 : 0.45}
        />
      </mesh>

      {/* Leading animated data photon packet */}
      <mesh ref={particleRef} visible={false}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial
          color={isActive ? "#ffffff" : color}
          transparent
          opacity={1}
        />
      </mesh>

      {/* Particle trail */}
      {Array.from({ length: TRAIL_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            trailRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
      ))}

      {/* Midpoint Edge Label */}
      {!isDimmed && (
        <Text
          position={[midPoint.x, midPoint.y + 0.32, midPoint.z]}
          fontSize={0.22}
          color={isActive ? "#ffffff" : isLight ? "#475569" : "#cbd5e1"}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor={isLight ? "#ffffff" : "#020617"}
        >
          {edge.label}
        </Text>
      )}
    </group>
  );
}
