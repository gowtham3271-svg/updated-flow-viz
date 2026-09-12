import type { FlowNode } from "@/types";

export interface NodePosition3D {
  position: [number, number, number];
  layer: number;
}

export interface LayerDimension {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  label: string;
  color: string;
}

/**
 * Z-depth and base positions for architectural layers.
 * Clear spatial separation communicates software architecture:
 * Layer 0: Frontend / Client
 * Layer 1: API Gateway & Routers
 * Layer 2: Core Backend Services & Business Logic
 * Layer 3: Database & Persistence
 * Layer 4: AI Agents & Vector / RAG Systems
 */
export const LAYER_CONFIG: Record<number, { z: number; defaultX: number; label: string }> = {
  0: { z: 6.0, defaultX: -6.0, label: "CLIENT / FRONTEND" },
  1: { z: 2.0, defaultX: -2.0, label: "API GATEWAY & ROUTES" },
  2: { z: -2.0, defaultX: 0.0, label: "CORE SERVICES & LOGIC" },
  3: { z: -6.5, defaultX: -5.0, label: "DATA & PERSISTENCE" },
  4: { z: -6.5, defaultX: 5.0, label: "AI & INTELLIGENCE" },
};

export function layoutNodes(nodes: FlowNode[]): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  if (nodes.length === 0) return positions;

  // Group nodes by their resolved architecture layer
  const byLayer = new Map<number, FlowNode[]>();

  for (const n of nodes) {
    let layer = n.layer ?? 1;
    if (n.kind === "frontend") layer = 0;
    else if (n.kind === "api") layer = 1;
    else if (n.kind === "backend" || n.kind === "service") layer = 2;
    else if (n.kind === "database" || n.kind === "storage") layer = 3;
    else if (n.kind === "ai") layer = 4;
    else if (n.kind === "function") layer = 2;

    const arr = byLayer.get(layer) ?? [];
    arr.push(n);
    byLayer.set(layer, arr);
  }

  // Position nodes within layers using multi-row grid or arc layout
  for (const [layer, layerNodes] of byLayer) {
    const config = LAYER_CONFIG[layer] ?? { z: (layer - 2) * 4, defaultX: 0, label: `LAYER ${layer}` };
    const count = layerNodes.length;

    // Distribute nodes in a staggered 3D grid if count is large
    const maxCols = count <= 3 ? count : count <= 6 ? 3 : 4;

    layerNodes.forEach((n, i) => {
      const col = i % maxCols;
      const row = Math.floor(i / maxCols);
      const rowCount = Math.min(maxCols, count - row * maxCols);

      // X offset centered per row
      const xSpacing = 3.6;
      const xOffset = config.defaultX + (col - (rowCount - 1) / 2) * xSpacing;

      // Y offset centered
      const ySpacing = 2.4;
      const totalRows = Math.ceil(count / maxCols);
      const yOffset = (totalRows > 1 ? ((totalRows - 1) / 2 - row) * ySpacing : 0) + (i % 2 === 1 ? 0.35 : -0.2);

      // Subtle Z jitter to create rich parallax depth
      const zOffset = config.z + ((i % 3) - 1) * 0.45;

      positions.set(n.id, [xOffset, yOffset, zOffset]);
    });
  }

  // Force-directed relaxation passes to eliminate any node overlap
  const nodeIds = Array.from(positions.keys());
  const minDistance = 2.4;
  const iterations = 8;

  for (let step = 0; step < iterations; step++) {
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const posA = positions.get(nodeIds[i])!;
        const posB = positions.get(nodeIds[j])!;

        const dx = posB[0] - posA[0];
        const dy = posB[1] - posA[1];
        const dz = posB[2] - posA[2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq > 0 && distSq < minDistance * minDistance) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDistance - dist) / 2;
          const nx = (dx / dist) * overlap;
          const ny = (dy / dist) * overlap;

          // Push apart on X & Y while keeping architecture layer Z mostly stable
          posA[0] -= nx * 0.6;
          posA[1] -= ny * 0.6;
          posB[0] += nx * 0.6;
          posB[1] += ny * 0.6;
        }
      }
    }
  }

  return positions;
}

/**
 * Computes the 3D bounding box / platform dimensions for architectural layers.
 */
export function getLayerPlatforms(nodes: FlowNode[], positions: Map<string, [number, number, number]>): LayerDimension[] {
  const layerGroups = new Map<number, [number, number, number][]>();

  for (const n of nodes) {
    const pos = positions.get(n.id);
    if (!pos) continue;

    let layer = n.layer ?? 1;
    if (n.kind === "frontend") layer = 0;
    else if (n.kind === "api") layer = 1;
    else if (n.kind === "backend" || n.kind === "service") layer = 2;
    else if (n.kind === "database" || n.kind === "storage") layer = 3;
    else if (n.kind === "ai") layer = 4;

    const arr = layerGroups.get(layer) ?? [];
    arr.push(pos);
    layerGroups.set(layer, arr);
  }

  const platforms: LayerDimension[] = [];

  for (const [layer, posList] of layerGroups) {
    if (posList.length === 0) continue;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let minY = Infinity;

    for (const [x, y, z] of posList) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      if (y < minY) minY = y;
    }

    const width = Math.max(maxX - minX + 5.0, 7.5);
    const depth = Math.max(maxZ - minZ + 4.0, 5.5);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const floorY = minY - 2.8;

    const config = LAYER_CONFIG[layer] ?? { label: `LAYER ${layer}` };
    const color =
      layer === 0 ? "#22d3ee" :
      layer === 1 ? "#34d399" :
      layer === 2 ? "#38bdf8" :
      layer === 3 ? "#a78bfa" :
      "#f43f5e";

    platforms.push({
      x: centerX,
      y: floorY,
      z: centerZ,
      width,
      depth,
      label: config.label,
      color,
    });
  }

  return platforms;
}
