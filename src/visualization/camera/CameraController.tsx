import { useEffect, useRef, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { gestureEvents } from "@/lib/gestureEvents";

export type CameraPreset = "default" | "top" | "isometric" | "front";

interface CameraControllerProps {
  focusNodeId: string | null;
  positions: Map<string, [number, number, number]>;
  zoomTrigger: number;
  resetTrigger: number;
  preset?: CameraPreset;
  controlsRef: React.RefObject<OrbitControlsType>;
  externalRotate?: { x: number; y: number; ts: number } | null;
  externalZoom?: { delta: number; ts: number } | null;
  externalReset?: number;
}

const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 9, 21);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

export function CameraController({
  focusNodeId,
  positions,
  zoomTrigger,
  resetTrigger,
  preset,
  controlsRef,
  externalRotate,
  externalZoom,
  externalReset,
}: CameraControllerProps) {
  const { camera } = useThree();

  const targetCameraPos = useRef(DEFAULT_CAMERA_POS.clone());
  const targetLookAt = useRef(DEFAULT_TARGET.clone());
  const isAnimating = useRef(false);

  const animateTo = useCallback((pos: THREE.Vector3, target: THREE.Vector3) => {
    targetCameraPos.current.copy(pos);
    targetLookAt.current.copy(target);
    isAnimating.current = true;
  }, []);

  // 1. Focus on selected node
  useEffect(() => {
    if (!focusNodeId) return;
    const pos = positions.get(focusNodeId);
    if (!pos) return;

    const nodeTarget = new THREE.Vector3(...pos);
    // Position camera slightly elevated in front of node
    const nodeCamPos = nodeTarget.clone().add(new THREE.Vector3(0, 2.5, 7.5));
    animateTo(nodeCamPos, nodeTarget);
  }, [focusNodeId, positions, animateTo]);

  // 2. Reset view to standard architectural perspective
  useEffect(() => {
    if (resetTrigger === 0) return;
    animateTo(DEFAULT_CAMERA_POS, DEFAULT_TARGET);
  }, [resetTrigger, animateTo]);

  // 3. Zoom triggers
  useEffect(() => {
    if (zoomTrigger === 0) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const step = zoomTrigger > 0 ? 3.0 : -3.0;
    const newPos = camera.position.clone().addScaledVector(dir, step);
    const target = controlsRef.current?.target ?? DEFAULT_TARGET;
    animateTo(newPos, target);
  }, [zoomTrigger, camera, controlsRef, animateTo]);

  // 4. Camera Presets (Isometric, Top, Front, Default)
  useEffect(() => {
    if (!preset) return;

    if (preset === "top") {
      animateTo(new THREE.Vector3(0, 28, 0.1), new THREE.Vector3(0, 0, 0));
    } else if (preset === "isometric") {
      animateTo(new THREE.Vector3(18, 16, 18), new THREE.Vector3(0, 0, 0));
    } else if (preset === "front") {
      animateTo(new THREE.Vector3(0, 2, 24), new THREE.Vector3(0, 0, 0));
    } else if (preset === "default") {
      animateTo(DEFAULT_CAMERA_POS, DEFAULT_TARGET);
    }
  }, [preset, animateTo]);

  const rotateVel = useRef({ x: 0, y: 0 });
  const zoomVel = useRef(0);

  // 5. Direct Event Bus Listeners (Zero React Re-render Overhead for 60 FPS Camera)
  useEffect(() => {
    const unsubRotate = gestureEvents.on("rotate", ({ dx, dy }) => {
      // Clamped rotation impulses to prevent wild camera spinning
      const clampedX = Math.max(-25, Math.min(25, dx));
      const clampedY = Math.max(-25, Math.min(25, dy));
      rotateVel.current.x += clampedX * 0.003;
      rotateVel.current.y += clampedY * 0.0025;
    });

    const unsubZoom = gestureEvents.on("zoom", ({ delta }) => {
      zoomVel.current += Math.max(-1.8, Math.min(1.8, delta * 0.06));
    });

    const unsubReset = gestureEvents.on("reset", () => {
      rotateVel.current = { x: 0, y: 0 };
      zoomVel.current = 0;
      animateTo(DEFAULT_CAMERA_POS, DEFAULT_TARGET);
    });

    return () => {
      unsubRotate();
      unsubZoom();
      unsubReset();
    };
  }, [animateTo]);

  // Legacy fallback props
  useEffect(() => {
    if (!externalReset) return;
    rotateVel.current = { x: 0, y: 0 };
    zoomVel.current = 0;
    animateTo(DEFAULT_CAMERA_POS, DEFAULT_TARGET);
  }, [externalReset, animateTo]);

  useEffect(() => {
    if (!externalZoom) return;
    zoomVel.current += Math.max(-1.8, Math.min(1.8, externalZoom.delta * 0.06));
  }, [externalZoom]);

  useEffect(() => {
    if (!externalRotate) return;
    rotateVel.current.x += externalRotate.x * 0.003;
    rotateVel.current.y += externalRotate.y * 0.0025;
  }, [externalRotate]);

  // Frame loop: smooth lerp to target when isAnimating with cinematic dampening
  useFrame((_, delta) => {
    // 1. Continuous smooth hand gesture orbit rotation with inertia
    if (Math.abs(rotateVel.current.x) > 0.0001 || Math.abs(rotateVel.current.y) > 0.0001) {
      if (controlsRef.current) {
        const offset = camera.position.clone().sub(controlsRef.current.target);
        const dampTime = Math.min(delta * 60, 2);
        const angleX = rotateVel.current.x * dampTime;
        const angleY = rotateVel.current.y * dampTime;

        const quat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-angleY, -angleX, 0, "YXZ")
        );
        offset.applyQuaternion(quat);
        camera.position.copy(controlsRef.current.target).add(offset);
        controlsRef.current.update();

        const decay = Math.exp(-7.5 * delta);
        rotateVel.current.x *= decay;
        rotateVel.current.y *= decay;
      }
    }

    // 2. Continuous smooth hand gesture zoom with inertia
    if (Math.abs(zoomVel.current) > 0.001) {
      if (controlsRef.current) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const dampTime = Math.min(delta * 60, 2);
        const step = zoomVel.current * dampTime;
        camera.position.addScaledVector(dir, step);
        controlsRef.current.update();

        const decay = Math.exp(-7.5 * delta);
        zoomVel.current *= decay;
      }
    }

    if (!isAnimating.current) return;

    const smoothFactor = 1 - Math.exp(-6.5 * delta);
    camera.position.lerp(targetCameraPos.current, smoothFactor);

    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, smoothFactor);
      controlsRef.current.update();
    }

    const posDist = camera.position.distanceTo(targetCameraPos.current);
    const targetDist = controlsRef.current
      ? controlsRef.current.target.distanceTo(targetLookAt.current)
      : 0;

    if (posDist < 0.04 && targetDist < 0.04) {
      camera.position.copy(targetCameraPos.current);
      if (controlsRef.current) {
        controlsRef.current.target.copy(targetLookAt.current);
      }
      isAnimating.current = false;
    }
  });

  return null;
}
