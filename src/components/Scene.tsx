import { useMemo, Suspense, useRef, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Stars, Text, RoundedBox } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { FlowGraph, FlowNode, Annotation } from "@/types";
import { NODE_COLORS } from "@/types";
import { Node3D } from "./Node3D";
import { Beam3D } from "./Beam3D";
import { ErrorBoundary } from "./ErrorBoundary";
import { gestureEvents } from "@/lib/gestureEvents";

interface SceneProps {
  graph: FlowGraph;
  activeStep: number | null;
  hoveredId: string | null;
  annotations: Annotation[];
  onHover: (id: string | null) => void;
  onNodeClick: (id: string) => void;
  flowProgress: number;
  theme: "dark" | "light";
  focusNodeId: string | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  zoomTrigger: number;
  resetTrigger: number;
  externalRotate?: { x: number; y: number; ts: number } | null;
  externalZoom?: { delta: number; ts: number } | null;
  externalReset?: number;
  externalClick?: { x: number; y: number; ts: number } | null;
}

const LAYER_X: Record<number, number> = { 0: -7, 1: 0, 2: 7 };
const LAYER_Z: Record<number, number> = { 0: 2, 1: 0, 2: -2 };
const LAYER_LABELS: Record<number, string> = { 0: "FRONTEND", 1: "BACKEND", 2: "DATABASE" };

const DARK_BG = "#05080f";
const LIGHT_BG = "#dbeafe";

function layoutNodes(nodes: FlowNode[]): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  const byLayer = new Map<number, FlowNode[]>();

  for (const n of nodes) {
    const arr = byLayer.get(n.layer) ?? [];
    arr.push(n);
    byLayer.set(n.layer, arr);
  }

  for (const [layer, layerNodes] of byLayer) {
    const x = LAYER_X[layer] ?? 0;
    const z = LAYER_Z[layer] ?? 0;
    const count = layerNodes.length;
    layerNodes.forEach((n, i) => {
      const spread = count > 1 ? (i - (count - 1) / 2) * 3.2 : 0;
      const y = count > 1 ? (i - (count - 1) / 2) * 2.4 : 0;
      positions.set(n.id, [x + spread * 0.12, y, z]);
    });
  }

  return positions;
}

function LayerPlatform({ layer, nodeCount, isLight }: { layer: number; nodeCount: number; isLight: boolean }) {
  const x = LAYER_X[layer] ?? 0;
  const z = LAYER_Z[layer] ?? 0;
  const color = layer === 0 ? NODE_COLORS.frontend : layer === 1 ? NODE_COLORS.backend : NODE_COLORS.database;
  const width = nodeCount > 2 ? 9 : 6;

  return (
    <group position={[x, -3.2, z]}>
      <RoundedBox args={[width, 0.15, 4]} radius={0.06} smoothness={4}>
        <meshStandardMaterial
          color={color}
          metalness={0.6}
          roughness={0.4}
          emissive={color}
          emissiveIntensity={isLight ? 0.08 : 0.15}
          transparent
          opacity={isLight ? 0.15 : 0.25}
        />
      </RoundedBox>
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[width, 0.02, 4]} />
        <meshBasicMaterial color={color} transparent opacity={isLight ? 0.25 : 0.4} />
      </mesh>
      <Text
        position={[0, -0.5, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.5}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor={isLight ? "#fff" : "#000"}
      >
        {LAYER_LABELS[layer] ?? ""}
      </Text>
    </group>
  );
}

function CameraController({
  focusNodeId,
  positions,
  zoomTrigger,
  resetTrigger,
  externalRotate,
  externalZoom,
  externalReset,
  externalClick,
  onNodeClickAt,
}: {
  focusNodeId: string | null;
  positions: Map<string, [number, number, number]>;
  zoomTrigger: number;
  resetTrigger: number;
  externalRotate?: { x: number; y: number; ts: number } | null;
  externalZoom?: { delta: number; ts: number } | null;
  externalReset?: number;
  externalClick?: { x: number; y: number; ts: number } | null;
  onNodeClickAt: (worldPos: THREE.Vector3) => void;
}) {
  const { camera, size } = useThree();
  const controlsRef = useRef<any>(null);
  const targetPos = useRef(new THREE.Vector3(8, 6, 12));
  const targetLook = useRef(new THREE.Vector3(0, 0, 0));
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (focusNodeId && positions.has(focusNodeId)) {
      const [x, y, z] = positions.get(focusNodeId)!;
      targetPos.current.set(x + 4, y + 3, z + 6);
      targetLook.current.set(x, y, z);
      animateCamera();
    }
  }, [focusNodeId, positions]);

  useEffect(() => {
    if (zoomTrigger > 0) {
      const dir = camera.position.clone().sub(targetLook.current).normalize();
      const newPos = camera.position.clone().sub(dir.multiplyScalar(3));
      if (newPos.distanceTo(targetLook.current) > 4) {
        targetPos.current.copy(newPos);
        animateCamera();
      }
    }
  }, [zoomTrigger]);

  useEffect(() => {
    if (resetTrigger > 0) {
      targetPos.current.set(8, 6, 12);
      targetLook.current.set(0, 0, 0);
      animateCamera();
    }
  }, [resetTrigger]);

  // High-Speed Direct Event Pipeline for zero-latency camera manipulation
  useEffect(() => {
    const unsubRotate = gestureEvents.on<{ dx: number; dy: number }>("rotate", ({ dx, dy }) => {
      if (!controlsRef.current) return;
      const azimuthal = controlsRef.current.getAzimuthalAngle?.() ?? 0;
      const polar = controlsRef.current.getPolarAngle?.() ?? Math.PI / 2;
      const newAz = azimuthal + (dx * Math.PI) / 180;
      const newPolar = Math.max(0.1, Math.min(Math.PI / 1.5, polar + (dy * Math.PI) / 180));
      const radius = camera.position.distanceTo(controlsRef.current.target);
      const sinP = Math.sin(newPolar);
      camera.position.set(
        controlsRef.current.target.x + radius * sinP * Math.sin(newAz),
        controlsRef.current.target.y + radius * Math.cos(newPolar),
        controlsRef.current.target.z + radius * sinP * Math.cos(newAz)
      );
      controlsRef.current.update();
    });

    const unsubZoom = gestureEvents.on<{ delta: number }>("zoom", ({ delta }) => {
      if (!controlsRef.current) return;
      const dir = camera.position.clone().sub(controlsRef.current.target).normalize();
      const newPos = camera.position.clone().add(dir.multiplyScalar(delta));
      const dist = newPos.distanceTo(controlsRef.current.target);
      if (dist > 4 && dist < 35) {
        camera.position.copy(newPos);
        controlsRef.current.update();
      }
    });

    const unsubReset = gestureEvents.on("reset", () => {
      targetPos.current.set(8, 6, 12);
      targetLook.current.set(0, 0, 0);
      animateCamera();
    });

    const unsubClick = gestureEvents.on<{ x: number; y: number }>("click", ({ x, y }) => {
      if (!controlsRef.current) return;
      const ndcX = (x / size.width) * 2 - 1;
      const ndcY = -(y / size.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const rayPoint = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(10));
      onNodeClickAt(rayPoint);
    });

    return () => {
      unsubRotate();
      unsubZoom();
      unsubReset();
      unsubClick();
    };
  }, [camera, size, onNodeClickAt]);

  // Backward compatibility props fallback
  useEffect(() => {
    if (!externalRotate || !controlsRef.current) return;
    const azimuthal = controlsRef.current.getAzimuthalAngle?.() ?? 0;
    const polar = controlsRef.current.getPolarAngle?.() ?? Math.PI / 2;
    const newAz = azimuthal + (externalRotate.x * Math.PI) / 180;
    const newPolar = Math.max(0.1, Math.min(Math.PI / 1.5, polar + (externalRotate.y * Math.PI) / 180));
    const radius = camera.position.distanceTo(controlsRef.current.target);
    const sinP = Math.sin(newPolar);
    camera.position.set(
      controlsRef.current.target.x + radius * sinP * Math.sin(newAz),
      controlsRef.current.target.y + radius * Math.cos(newPolar),
      controlsRef.current.target.z + radius * sinP * Math.cos(newAz)
    );
    controlsRef.current.update();
  }, [externalRotate]);

  useEffect(() => {
    if (externalZoom === undefined || externalZoom === null || !controlsRef.current) return;
    const dir = camera.position.clone().sub(controlsRef.current.target).normalize();
    const newPos = camera.position.clone().add(dir.multiplyScalar(externalZoom.delta));
    const dist = newPos.distanceTo(controlsRef.current.target);
    if (dist > 4 && dist < 35) {
      camera.position.copy(newPos);
      controlsRef.current.update();
    }
  }, [externalZoom]);

  useEffect(() => {
    if (externalReset && externalReset > 0) {
      targetPos.current.set(8, 6, 12);
      targetLook.current.set(0, 0, 0);
      animateCamera();
    }
  }, [externalReset]);

  useEffect(() => {
    if (!externalClick || !controlsRef.current) return;
    const ndcX = (externalClick.x / size.width) * 2 - 1;
    const ndcY = -(externalClick.y / size.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const rayPoint = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(10));
    onNodeClickAt(rayPoint);
  }, [externalClick, camera, size, onNodeClickAt]);

  const animateCamera = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const startPos = camera.position.clone();
    const startLook = controlsRef.current?.target?.clone() ?? new THREE.Vector3(0, 0, 0);
    const duration = 600;
    const startTime = performance.now();
    const step = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, targetPos.current, eased);
      const look = startLook.clone().lerp(targetLook.current, eased);
      controlsRef.current?.target?.copy(look);
      controlsRef.current?.update();
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
      }
    };
    animRef.current = requestAnimationFrame(step);
  };

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan
      enableZoom
      enableRotate
      minDistance={4}
      maxDistance={35}
      maxPolarAngle={Math.PI / 1.8}
      autoRotate={false}
      autoRotateSpeed={0.3}
      makeDefault
    />
  );
}

function SceneContent({ graph, activeStep, hoveredId, annotations, onHover, onNodeClick, flowProgress, theme, focusNodeId, zoomTrigger, resetTrigger, externalRotate, externalZoom, externalReset, externalClick }: SceneProps) {
  const isLight = theme === "light";
  const positions = useMemo(() => layoutNodes(graph.nodes), [graph.nodes]);
  const edgeList = graph.edges;
  const activeEdge = activeStep !== null ? edgeList[activeStep] : null;

  const activeNodeIds = useMemo(() => {
    if (!activeEdge) return new Set<string>();
    return new Set([activeEdge.from, activeEdge.to]);
  }, [activeEdge]);

  const layerCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const n of graph.nodes) {
      counts.set(n.layer, (counts.get(n.layer) ?? 0) + 1);
    }
    return counts;
  }, [graph.nodes]);

  return (
    <>
      <ambientLight intensity={isLight ? 0.7 : 0.3} />
      <directionalLight position={[10, 15, 8]} intensity={isLight ? 1.0 : 0.8} castShadow />
      <pointLight position={[-8, 5, 5]} intensity={isLight ? 0.3 : 0.5} color="#22d3ee" />
      <pointLight position={[8, 5, -5]} intensity={isLight ? 0.3 : 0.5} color="#a78bfa" />
      <hemisphereLight args={["#38bdf8", isLight ? "#e0f2fe" : "#0f172a", isLight ? 0.5 : 0.3]} />

      {!isLight && <Stars radius={80} depth={50} count={2000} factor={4} fade speed={1} />}

      <Grid
        args={[40, 40]}
        position={[0, -4, 0]}
        cellSize={1}
        cellThickness={0.6}
        cellColor={isLight ? "#93c5fd" : "#1e3a5f"}
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor={isLight ? "#0284c7" : "#38bdf8"}
        fadeDistance={35}
        fadeStrength={1.5}
        infiniteGrid
      />

      {Array.from(layerCounts.keys()).map((layer) => (
        <LayerPlatform key={layer} layer={layer} nodeCount={layerCounts.get(layer) ?? 0} isLight={isLight} />
      ))}

      {graph.nodes.map((node) => {
        const pos = positions.get(node.id) ?? [0, 0, 0];
        const isActive = activeNodeIds.has(node.id);
        const isHovered = hoveredId === node.id;
        const isDimmed = activeStep !== null && !isActive;
        const ann = annotations.find((a) => a.nodeId === node.id);
        return (
          <Node3D
            key={node.id}
            node={node}
            position={pos}
            isActive={isActive}
            isDimmed={isDimmed}
            isHovered={isHovered}
            annotation={ann?.text ?? null}
            onHover={onHover}
            onClick={onNodeClick}
            isLight={isLight}
          />
        );
      })}

      {edgeList.map((edge, i) => {
        const fromPos = positions.get(edge.from) ?? [0, 0, 0];
        const toPos = positions.get(edge.to) ?? [0, 0, 0];
        const isActive = activeStep === i;
        const isDimmed = activeStep !== null && !isActive;
        return (
          <Beam3D
            key={edge.id}
            edge={edge}
            fromPos={fromPos}
            toPos={toPos}
            isActive={isActive}
            isDimmed={isDimmed}
            flowProgress={flowProgress}
            isLight={isLight}
            ambientFlow={true}
          />
        );
      })}

      <CameraController
        focusNodeId={focusNodeId}
        positions={positions}
        zoomTrigger={zoomTrigger}
        resetTrigger={resetTrigger}
        externalRotate={externalRotate}
        externalZoom={externalZoom}
        externalReset={externalReset}
        externalClick={externalClick}
        onNodeClickAt={(worldPos) => {
          const nodeIds = graph.nodes.map((n) => n.id);
          if (nodeIds.length > 0 && onNodeClick) {
            let closest = nodeIds[0];
            let minDist = Infinity;
            for (const n of graph.nodes) {
              const np = positions.get(n.id) ?? [0, 0, 0];
              const d = Math.hypot(np[0] - worldPos.x, np[1] - worldPos.y, np[2] - worldPos.z);
              if (d < minDist) { minDist = d; closest = n.id; }
            }
            if (minDist < 3) onNodeClick(closest);
          }
        }}
      />
    </>
  );
}

export function Scene(props: SceneProps) {
  const bgColor = props.theme === "light" ? LIGHT_BG : DARK_BG;

  return (
    <Canvas
      shadows
      camera={{ position: [8, 6, 12], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[bgColor]} />
      <fog attach="fog" args={[bgColor, 25, 50]} />
      <Suspense fallback={null}>
        <SceneContent {...props} />
      </Suspense>
      <ErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <EffectComposer>
            <Bloom luminanceThreshold={props.theme === "light" ? 0.6 : 0.3} luminanceSmoothing={0.9} intensity={props.theme === "light" ? 0.5 : 1.2} mipmapBlur />
            <Vignette eskil={false} offset={0.2} darkness={props.theme === "light" ? 0.3 : 0.7} />
          </EffectComposer>
        </Suspense>
      </ErrorBoundary>
    </Canvas>
  );
}
