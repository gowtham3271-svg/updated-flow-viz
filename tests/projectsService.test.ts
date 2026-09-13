import { describe, it, expect } from "vitest";
import { fetchProjects, saveProject, deleteProject } from "../src/services/projectsService";

describe("Projects Service (Supabase & Local Cache)", () => {
  it("fetches projects safely without throwing exceptions", async () => {
    const res = await fetchProjects();
    expect(res).toBeDefined();
    expect(typeof res.success).toBe("boolean");
    expect(Array.isArray(res.projects)).toBe(true);
  });

  it("saves a project with dual-schema resilience", async () => {
    const testName = `Test Proj ${Date.now()}`;
    const saveRes = await saveProject({
      name: testName,
      files: [{ filename: "app.py", language: "python", content: "print('hello')", path: "app.py" }],
      graph: { nodes: [], edges: [] },
      annotations: [],
    });

    expect(saveRes.success).toBe(true);
    expect(saveRes.project).toBeDefined();
    expect(saveRes.project?.name).toBe(testName);
    expect(saveRes.project?.id).toBeDefined();

    if (saveRes.project?.id) {
      // Clean up test project
      const delRes = await deleteProject(saveRes.project.id);
      expect(delRes.success).toBe(true);
    }
  });

  it("handles empty project name validation cleanly", async () => {
    const res = await saveProject({
      name: "   ",
      files: [],
      graph: { nodes: [], edges: [] },
      annotations: [],
    });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });
});
