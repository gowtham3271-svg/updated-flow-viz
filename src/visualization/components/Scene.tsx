import { useMemo, Suspense, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Stars, Text, RoundedBox } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import type { FlowGraph, Annotation } from "@/types";
import { Node3D } from "../nodes/Node3D";
import { Beam3D } from "../edges/Beam3D";
import { layoutNodes, getLayerPlatforms, type LayerDimension } from "../layouts/graphLayout";
import { CameraController, type CameraPreset } from "../camera/CameraController";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Compass, Eye, Maximize2, Layers } from "lucide-react";

export interface SceneProps {
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

const DARK_BG = "#030712";
const LIGHT_BG = "#e2e8f0";

function ArchitecturePlatform({ platform, isLight }: { platform: LayerDimension; isLight: boolean }) {
  return (
    <group position={[platform.x, platform.y, platform.z]}>
      {/* Sleek Glassmorphic Ground Slabs */}
      <RoundedBox args={[platform.width, 0.18, platform.depth]} radius={0.12} smoothness={4}>
        <meshStandardMaterial
          color={platform.color}
          metalness={0.7}
          roughness={0.3}
          emissive={platform.color}
          emissiveIntensity={isLight ? 0.06 : 0.12}
          transparent
          opacity={isLight ? 0.18 : 0.22}
        />
      </RoundedBox>

      {/* Neon Perimeter Trim */}
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[platform.width + 0.05, 0.04, platform.depth + 0.05]} />
        <meshBasicMaterial
          color={platform.color}
          transparent
          opacity={isLight ? 0.35 : 0.45}
        />
      </mesh>

      {/* Architecture Domain Name */}
      <Text
        position={[0, -0.6, platform.depth / 2 + 0.5]}
        rotation={[-Math.PI / 4, 0, 0]}
        fontSize={0.42}
        color={platform.color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.015}
        outlineColor={isLight ? "#ffffff" : "#020617"}
      >
        {platform.label}
      </Text>
    </group>
  );
}

export function Scene({
  graph,
  activeStep,
  hoveredId,
  annotations,
  onHover,
  onNodeClick,
  flowProgress,
  theme,
  focusNodeId,
  zoomTrigger,
  resetTrigger,
  externalRotate,
  externalZoom,
  externalReset,
}: SceneProps) {
  const isLight = theme === "light";
  const controlsRef = useRef<OrbitControlsType>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("default");

  // Compute 3D positions with collision avoidance and organic architectural layout
  const positions = useMemo(() => {
    return layoutNodes(graph.nodes);
  }, [graph.nodes]);

  // Compute dynamic architectural platform dimensions
  const platforms = useMemo(() => {
    return getLayerPlatforms(graph.nodes, positions);
  }, [graph.nodes, positions]);

  // Compute connected nodes for focus isolation
  const { connectedNodeIds, connectedEdgeIds } = useMemo(() => {
    if (!focusNodeId) {
      return { connectedNodeIds: new Set<string>(), connectedEdgeIds: new Set<string>() };
    }
    const nodeSet = new Set<string>([focusNodeId]);
    const edgeSet = new Set<string>();

    for (const e of graph.edges) {
      if (e.from === focusNodeId || e.to === focusNodeId) {
        edgeSet.add(e.id);
        nodeSet.add(e.from);
        nodeSet.add(e.to);
      }
    }
    return { connectedNodeIds: nodeSet, connectedEdgeIds: edgeSet };
  }, [focusNodeId, graph.edges]);

  const activeEdge = activeStep !== null && activeStep < graph.edges.length
    ? graph.edges[activeStep]
    : null;

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-app-base">
      <ErrorBoundary>
        <Canvas
          camera={{ position: [0, 9, 21], fov: 48, near: 0.1, far: 200 }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <color attach="background" args={[isLight ? LIGHT_BG : DARK_BG]} />
          <fog attach="fog" args={[isLight ? "#cbd5e1" : "#020617", 22, 70]} />

          {/* Controls & Dynamic Camera Engine */}
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.06}
            minDistance={4}
            maxDistance={75}
            maxPolarAngle={Math.PI / 2 + 0.05}
          />

          <CameraController
            focusNodeId={focusNodeId}
            positions={positions}
            zoomTrigger={zoomTrigger}
            resetTrigger={resetTrigger}
            preset={cameraPreset}
            controlsRef={controlsRef}
            externalRotate={externalRotate}
            externalZoom={externalZoom}
            externalReset={externalReset}
          />

          {/* Professional Atmospheric Lighting */}
          <ambientLight intensity={isLight ? 0.9 : 0.6} />
          <directionalLight position={[10, 18, 12]} intensity={isLight ? 1.4 : 1.1} castShadow />
          <directionalLight position={[-12, -8, -10]} intensity={0.35} color="#38bdf8" />
          <pointLight position={[0, 10, 0]} intensity={0.5} color="#818cf8" />

          {/* Deep Space Atmosphere */}
          {!isLight && (
            <Stars radius={60} depth={40} count={1200} factor={3} saturation={0.5} fade speed={0.8} />
          )}

          {/* Precision Architectural Grid */}
          <Grid
            position={[0, -4.5, 0]}
            args={[70, 70]}
            cellSize={1.2}
            cellThickness={0.7}
            cellColor={isLight ? "#94a3b8" : "#1e293b"}
            sectionSize={6}
            sectionThickness={1.2}
            sectionColor={isLight ? "#64748b" : "#334155"}
            fadeDistance={50}
            fadeStrength={1.5}
          />

          <Suspense fallback={null}>
            {/* Architecture Domain Platforms */}
            {platforms.map((plat, idx) => (
              <ArchitecturePlatform key={idx} platform={plat} isLight={isLight} />
            ))}

            {/* 3D Flow Energy Beams */}
            {graph.edges.map((edge) => {
              const fromPos = positions.get(edge.from);
              const toPos = positions.get(edge.to);
              if (!fromPos || !toPos) return null;

              const isEdgeActive = activeEdge?.id === edge.id;
              const isDimmed =
                focusNodeId !== null &&
                !connectedEdgeIds.has(edge.id) &&
                !isEdgeActive;

              return (
                <Beam3D
                  key={edge.id}
                  edge={edge}
                  fromPos={fromPos}
                  toPos={toPos}
                  isActive={isEdgeActive}
                  isDimmed={isDimmed}
                  flowProgress={flowProgress}
                  isLight={isLight}
                  ambientFlow={true}
                />
              );
            })}

            {/* High-Fidelity 3D Architecture Nodes */}
            {graph.nodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;

              const isActive =
                node.id === focusNodeId ||
                activeEdge?.from === node.id ||
                activeEdge?.to === node.id;

              const isDimmed =
                focusNodeId !== null &&
                !connectedNodeIds.has(node.id) &&
                !isActive;

              const isHovered = hoveredId === node.id;
              const annotation =
                annotations.find((a) => a.nodeId === node.id)?.text ?? null;

              return (
                <Node3D
                  key={node.id}
                  node={node}
                  position={pos}
                  isActive={isActive}
                  isDimmed={isDimmed}
                  isHovered={isHovered}
                  annotation={annotation}
                  onHover={onHover}
                  onClick={onNodeClick}
                  isLight={isLight}
                />
              );
            })}
          </Suspense>

          {/* Postprocessing Bloom & Subtle Cinematic Vignette */}
          <EffectComposer multisampling={4}>
            <Bloom
              luminanceThreshold={0.65}
              luminanceSmoothing={0.5}
              intensity={isLight ? 0.3 : 0.75}
            />
            <Vignette eskil={false} offset={0.15} darkness={isLight ? 0.2 : 0.65} />
          </EffectComposer>
        </Canvas>
      </ErrorBoundary>

      {/* Modern 3D Camera Controls Toolbar Overlay */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-800 shadow-xl text-xs text-slate-300">
        <button
          onClick={() => {
            setCameraPreset("isometric");
            setTimeout(() => setCameraPreset("default"), 100);
          }}
          className="px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition flex items-center gap-1.5"
          title="Isometric Architectural Angle"
        >
          <Compass size={14} className="text-cyan-400" />
          <span>Isometric</span>
        </button>
        <button
          onClick={() => {
            setCameraPreset("top");
            setTimeout(() => setCameraPreset("default"), 100);
          }}
          className="px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition flex items-center gap-1.5"
          title="Top-Down Flow Map"
        >
          <Layers size={14} className="text-emerald-400" />
          <span>Top</span>
        </button>
        <button
          onClick={() => {
            setCameraPreset("front");
            setTimeout(() => setCameraPreset("default"), 100);
          }}
          className="px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition flex items-center gap-1.5"
          title="Front Elevation"
        >
          <Eye size={14} className="text-purple-400" />
          <span>Front</span>
        </button>
        <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
        <button
          onClick={() => {
            setCameraPreset("default");
            setTimeout(() => setCameraPreset("default"), 100);
          }}
          className="px-2.5 py-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition flex items-center gap-1.5"
          title="Reset Camera View"
        >
          <Maximize2 size={13} className="text-amber-400" />
          <span>Fit All</span>
        </button>
      </div>

      {/* Visualization Telemetry Status Badge */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900/75 backdrop-blur-md border border-slate-800 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>3D TELEMETRY ACTIVE</span>
        </div>
        <span>•</span>
        <span>{graph.nodes.length} NODES</span>
        <span>•</span>
        <span>{graph.edges.length} BEAMS</span>
      </div>
    </div>
  );
}
