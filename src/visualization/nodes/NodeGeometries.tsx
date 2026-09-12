import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Cylinder } from "@react-three/drei";
import * as THREE from "three";
import type { FlowNode } from "@/types";

interface NodeShapeProps {
  kind: FlowNode["kind"];
  color: THREE.Color;
  isActive: boolean;
  isDimmed: boolean;
  isHovered: boolean;
  isLight: boolean;
}

export const NodeGeometries: React.FC<NodeShapeProps> = ({
  kind,
  color,
  isActive,
  isDimmed,
  isHovered,
  isLight,
}) => {
  const emissiveIntensity = isActive
    ? 0.85
    : isHovered
    ? 0.55
    : isDimmed
    ? (isLight ? 0.02 : 0.05)
    : (isLight ? 0.15 : 0.3);

  const rotatingRingRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (rotatingRingRef.current) {
      rotatingRingRef.current.rotation.y += delta * 0.8;
      rotatingRingRef.current.rotation.z += delta * 0.3;
    }
    if (coreRef.current && (kind === "ai" || kind === "api")) {
      coreRef.current.rotation.y += delta * 1.2;
      coreRef.current.rotation.x += delta * 0.6;
    }
  });

  // 1. DATABASE / STORAGE: Multi-platter magnetic cylinder with glowing data grooves
  if (kind === "database" || kind === "storage") {
    return (
      <group>
        {/* Tiered cylindrical storage platters */}
        {[-0.55, -0.2, 0.15, 0.5].map((y, i) => (
          <group key={i} position={[0, y, 0]}>
            <Cylinder args={[0.75, 0.75, 0.22, 32]}>
              <meshStandardMaterial
                color={color}
                metalness={0.85}
                roughness={0.2}
                emissive={color}
                emissiveIntensity={emissiveIntensity * 0.8}
                transparent
                opacity={0.95}
              />
            </Cylinder>
            {/* Illuminated perimeter data channel */}
            <mesh position={[0, 0, 0]}>
              <torusGeometry args={[0.76, 0.018, 12, 32]} />
              <meshBasicMaterial
                color={isActive ? "#4ade80" : color}
                opacity={isActive ? 0.9 : 0.4}
                transparent
              />
            </mesh>
          </group>
        ))}

        {/* Top protective plate with status LED */}
        <Cylinder args={[0.78, 0.78, 0.05, 32]} position={[0, 0.62, 0]}>
          <meshStandardMaterial
            color={isLight ? "#f8fafc" : "#0f172a"}
            metalness={0.9}
            roughness={0.15}
          />
        </Cylinder>
        <mesh position={[0, 0.66, 0.35]}>
          <circleGeometry args={[0.06, 16]} />
          <meshBasicMaterial color={isActive ? "#4ade80" : "#a78bfa"} />
        </mesh>
      </group>
    );
  }

  // 2. AI / RAG SYSTEM: Polyhedral core with internal rotating data sphere & orbital halo
  if (kind === "ai") {
    return (
      <group>
        {/* Outer faceted crystalline polyhedral cage */}
        <mesh ref={coreRef}>
          <octahedronGeometry args={[0.95, 0]} />
          <meshStandardMaterial
            color={color}
            wireframe={!isActive && !isHovered}
            metalness={0.9}
            roughness={0.1}
            emissive={color}
            emissiveIntensity={emissiveIntensity}
            transparent
            opacity={0.85}
          />
        </mesh>

        {/* Inner glowing intelligence singularity */}
        <mesh>
          <sphereGeometry args={[0.42, 24, 24]} />
          <meshStandardMaterial
            color={isActive ? "#ffffff" : color}
            emissive={color}
            emissiveIntensity={isActive ? 1.5 : 0.9}
            roughness={0.05}
          />
        </mesh>

        {/* Orbital calculation rings */}
        <group ref={rotatingRingRef}>
          <mesh rotation={[Math.PI / 4, 0, 0]}>
            <torusGeometry args={[1.3, 0.02, 12, 48]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isActive ? 0.8 : 0.35}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 4, Math.PI / 3, 0]}>
            <torusGeometry args={[1.15, 0.015, 12, 48]} />
            <meshBasicMaterial
              color="#fbbf24"
              transparent
              opacity={isActive ? 0.7 : 0.25}
            />
          </mesh>
        </group>
      </group>
    );
  }

  // 3. API GATEWAY / ROUTE: Hexagonal gateway portal
  if (kind === "api") {
    return (
      <group>
        {/* Hexagonal aperture chassis */}
        <Cylinder args={[0.9, 0.9, 0.3, 6]} rotation={[0, 0, Math.PI / 2]}>
          <meshStandardMaterial
            color={color}
            metalness={0.8}
            roughness={0.25}
            emissive={color}
            emissiveIntensity={emissiveIntensity * 0.7}
          />
        </Cylinder>

        {/* Ingress / Egress throughput portal */}
        <mesh position={[0, 0, 0.16]}>
          <ringGeometry args={[0.3, 0.65, 6]} />
          <meshBasicMaterial
            color={isActive ? "#4ade80" : color}
            opacity={0.8}
            transparent
            side={THREE.DoubleSide}
          />
        </mesh>

        <group ref={rotatingRingRef}>
          <mesh position={[0, 0, 0]}>
            <torusGeometry args={[1.1, 0.02, 8, 24]} />
            <meshBasicMaterial
              color={isActive ? "#34d399" : color}
              transparent
              opacity={0.5}
            />
          </mesh>
        </group>
      </group>
    );
  }

  // 4. FRONTEND / CLIENT: Floating holographic display with chrome header
  if (kind === "frontend") {
    return (
      <group>
        {/* Display bezel */}
        <RoundedBox args={[1.8, 1.25, 0.18]} radius={0.08} smoothness={4}>
          <meshStandardMaterial
            color={color}
            metalness={0.65}
            roughness={0.25}
            emissive={color}
            emissiveIntensity={emissiveIntensity * 0.7}
          />
        </RoundedBox>

        {/* Holographic screen face */}
        <mesh position={[0, 0, 0.1]}>
          <planeGeometry args={[1.65, 1.1]} />
          <meshStandardMaterial
            color={isLight ? "#f1f5f9" : "#090d16"}
            metalness={0.6}
            roughness={0.3}
            emissive={color}
            emissiveIntensity={emissiveIntensity * 0.25}
          />
        </mesh>

        {/* Chrome navigation bar */}
        <mesh position={[0, 0.45, 0.11]}>
          <planeGeometry args={[1.55, 0.14]} />
          <meshBasicMaterial color={color} opacity={0.4} transparent />
        </mesh>

        {/* Window controls (red, yellow, green) */}
        <mesh position={[-0.65, 0.45, 0.12]}>
          <circleGeometry args={[0.035, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        <mesh position={[-0.55, 0.45, 0.12]}>
          <circleGeometry args={[0.035, 16]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
        <mesh position={[-0.45, 0.45, 0.12]}>
          <circleGeometry args={[0.035, 16]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>

        {/* Simulated UI layout wireframe elements */}
        <mesh position={[-0.35, 0.05, 0.11]}>
          <planeGeometry args={[0.7, 0.45]} />
          <meshBasicMaterial color={color} opacity={0.22} transparent />
        </mesh>
        <mesh position={[0.42, 0.12, 0.11]}>
          <planeGeometry args={[0.55, 0.22]} />
          <meshBasicMaterial color={color} opacity={0.3} transparent />
        </mesh>
        <mesh position={[0.42, -0.16, 0.11]}>
          <planeGeometry args={[0.55, 0.16]} />
          <meshBasicMaterial color={color} opacity={0.2} transparent />
        </mesh>
      </group>
    );
  }

  // 5. BACKEND / SERVICE: Rack-mounted server module with status ports & telemetry LEDs
  if (kind === "backend" || kind === "service") {
    return (
      <group>
        {/* High-durability enterprise rack server body */}
        <RoundedBox args={[1.5, 1.6, 0.85]} radius={0.06} smoothness={4}>
          <meshStandardMaterial
            color={color}
            metalness={0.8}
            roughness={0.2}
            emissive={color}
            emissiveIntensity={emissiveIntensity * 0.75}
          />
        </RoundedBox>

        {/* Faceplate bays */}
        {[-0.45, 0, 0.45].map((y, i) => (
          <mesh key={i} position={[0, y, 0.44]}>
            <planeGeometry args={[1.25, 0.26]} />
            <meshBasicMaterial color="#0b1120" opacity={0.85} transparent />
          </mesh>
        ))}

        {/* Status indicator LEDs */}
        {[-0.45, 0, 0.45].map((y, i) => (
          <group key={`leds-${i}`}>
            <mesh position={[-0.48, y, 0.45]}>
              <circleGeometry args={[0.035, 16]} />
              <meshBasicMaterial color={isActive ? "#4ade80" : "#22d3ee"} />
            </mesh>
            <mesh position={[-0.38, y, 0.45]}>
              <circleGeometry args={[0.025, 16]} />
              <meshBasicMaterial color={isActive ? "#fbbf24" : "#38bdf8"} opacity={0.8} transparent />
            </mesh>
            <mesh position={[0.4, y, 0.45]}>
              <planeGeometry args={[0.2, 0.04]} />
              <meshBasicMaterial color={isActive ? "#4ade80" : color} opacity={0.65} transparent />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  // 6. DEFAULT / FUNCTION: Precision code module crystal with execution core
  return (
    <group>
      <RoundedBox args={[1.2, 0.9, 0.7]} radius={0.12} smoothness={4}>
        <meshStandardMaterial
          color={color}
          metalness={0.55}
          roughness={0.35}
          emissive={color}
          emissiveIntensity={emissiveIntensity * 0.6}
        />
      </RoundedBox>

      {/* Hexagonal function core symbol */}
      <mesh position={[0, 0, 0.36]}>
        <circleGeometry args={[0.22, 6]} />
        <meshBasicMaterial color="#0f172a" opacity={0.9} transparent />
      </mesh>
      <mesh position={[0, 0, 0.37]}>
        <torusGeometry args={[0.16, 0.03, 8, 6]} />
        <meshBasicMaterial color={isActive ? "#4ade80" : color} />
      </mesh>
    </group>
  );
};
