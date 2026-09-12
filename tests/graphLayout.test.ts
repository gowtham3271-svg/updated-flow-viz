import { describe, it, expect } from "vitest";
import { layoutNodes, getLayerPlatforms, LAYER_CONFIG } from "../src/visualization/layouts/graphLayout";
import type { FlowNode } from "../src/types";

describe("3D Architectural Graph Layout", () => {
  it("defines architectural tiers with proper vertical and depth separation", () => {
    const layers = Object.keys(LAYER_CONFIG);
    expect(layers.length).toBe(5);
    // Layer 0 is Client Tier, Layer 4 is AI/Storage
    expect(LAYER_CONFIG[0].label).toContain("CLIENT");
    expect(LAYER_CONFIG[4].label).toContain("AI");
  });

  it("assigns proper 3D coordinates based on layer tiers", () => {
    const nodes: FlowNode[] = [
      { id: "front", label: "App.tsx", kind: "frontend", file: "App.tsx", line: 1, detail: "Component" },
      { id: "api", label: "/api/pay", kind: "api", file: "api.ts", line: 10, detail: "Endpoint" },
      { id: "back", label: "Server.py", kind: "backend", file: "server.py", line: 20, detail: "Backend" },
      { id: "db", label: "UsersTable", kind: "database", file: "schema.sql", line: 5, detail: "Table" },
      { id: "ai", label: "LLM Pipeline", kind: "ai", file: "ai.py", line: 15, detail: "RAG" },
    ];

    const positions = layoutNodes(nodes);

    expect(positions.size).toBe(5);

    const frontPos = positions.get("front");
    const aiPos = positions.get("ai");

    expect(frontPos).toBeDefined();
    expect(aiPos).toBeDefined();

    if (frontPos && aiPos) {
      // Front (Client) and AI should have different Z-depths
      expect(frontPos[2]).not.toEqual(aiPos[2]);
      // Front should be at positive Z relative to AI at negative Z
      expect(frontPos[2]).toBeGreaterThan(aiPos[2]);
    }
  });

  it("relaxes overlapping nodes so they maintain spatial separation", () => {
    // Create 4 nodes in the same category/layer
    const nodes: FlowNode[] = [
      { id: "fn1", label: "fn1", kind: "function", file: "utils.ts", line: 1, detail: "fn" },
      { id: "fn2", label: "fn2", kind: "function", file: "utils.ts", line: 5, detail: "fn" },
      { id: "fn3", label: "fn3", kind: "function", file: "utils.ts", line: 10, detail: "fn" },
      { id: "fn4", label: "fn4", kind: "function", file: "utils.ts", line: 15, detail: "fn" },
    ];

    const positions = layoutNodes(nodes);
    const posArray = Array.from(positions.values());

    for (let i = 0; i < posArray.length; i++) {
      for (let j = i + 1; j < posArray.length; j++) {
        const p1 = posArray[i];
        const p2 = posArray[j];
        const dist = Math.sqrt(
          (p1[0] - p2[0]) ** 2 +
          (p1[1] - p2[1]) ** 2 +
          (p1[2] - p2[2]) ** 2
        );
        // Minimum distance between distinct nodes should be at least 1.0 unit
        expect(dist).toBeGreaterThanOrEqual(1.0);
      }
    }
  });

  it("computes platform bounding dimensions accurately", () => {
    const nodes: FlowNode[] = [
      { id: "db1", label: "Orders", kind: "database", file: "db.ts", line: 1, detail: "Table" },
      { id: "db2", label: "Users", kind: "database", file: "db.ts", line: 10, detail: "Table" },
    ];

    const positions = layoutNodes(nodes);
    const platforms = getLayerPlatforms(nodes, positions);

    expect(platforms.length).toBeGreaterThan(0);
    const dbPlatform = platforms.find((p) => p.label.includes("DATA"));

    expect(dbPlatform).toBeDefined();
    if (dbPlatform) {
      expect(dbPlatform.width).toBeGreaterThan(0);
      expect(dbPlatform.depth).toBeGreaterThan(0);
    }
  });
});
