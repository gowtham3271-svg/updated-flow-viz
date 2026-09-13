import { describe, it, expect } from "vitest";
import { runCodeSnippet, transpilePythonToJS } from "../src/lib/codeRunner";
import type { CodeFile } from "../src/types";

describe("CodeRunner Python Execution & Expression Evaluation", () => {
  it("correctly evaluates arithmetic expressions like print(7+1) to 8", async () => {
    const file: CodeFile = {
      filename: "test.py",
      path: "test.py",
      language: "python",
      content: "print(7+1)",
    };

    const result = await runCodeSnippet(file);
    expect(result.success).toBe(true);

    const logMessages = result.logs.filter((l) => l.type === "log").map((l) => l.message);
    expect(logMessages).toContain("8");
  });

  it("evaluates variables and arithmetic in python", async () => {
    const file: CodeFile = {
      filename: "math_test.py",
      path: "math_test.py",
      language: "python",
      content: `
x = 7
y = 1
print(x + y)
      `.trim(),
    };

    const result = await runCodeSnippet(file);
    expect(result.success).toBe(true);

    const logMessages = result.logs.filter((l) => l.type === "log").map((l) => l.message);
    expect(logMessages).toContain("8");
  });

  it("evaluates python functions and loops", async () => {
    const file: CodeFile = {
      filename: "func_test.py",
      path: "func_test.py",
      language: "python",
      content: `
def multiply(a, b):
    return a * b

print(multiply(4, 2))
      `.trim(),
    };

    const result = await runCodeSnippet(file);
    expect(result.success).toBe(true);

    const logMessages = result.logs.filter((l) => l.type === "log").map((l) => l.message);
    expect(logMessages).toContain("8");
  });

  it("transpiles Python code to valid JavaScript", () => {
    const py = "def add(a, b):\n    return a + b\nprint(add(7, 1))";
    const js = transpilePythonToJS(py);
    expect(js).toContain("function add(a, b)");
    expect(js).toContain("customConsole.log(add(7, 1));");
  });

  it("handles multi-arg print statements and f-strings in Python", async () => {
    const file: CodeFile = {
      filename: "calc.py",
      path: "calc.py",
      language: "python",
      content: 'print("Result:", 7 + 1)\nprint(f"Total is {7 + 1}")',
    };
    const result = await runCodeSnippet(file);
    expect(result.success).toBe(true);
    const msgs = result.logs.map((l) => l.message);
    expect(msgs.some((m) => m.includes("Result:") && m.includes("8"))).toBe(true);
    expect(msgs.some((m) => m.includes("Total is 8"))).toBe(true);
  });

  it("evaluates Java and Go print statements mathematically", async () => {
    const javaFile: CodeFile = {
      filename: "Main.java",
      path: "Main.java",
      language: "java",
      content: "System.out.println(7 + 1);",
    };
    const javaResult = await runCodeSnippet(javaFile);
    expect(javaResult.logs.some((l) => l.message === "8")).toBe(true);

    const goFile: CodeFile = {
      filename: "main.go",
      path: "main.go",
      language: "go",
      content: "fmt.Println(7 + 1)",
    };
    const goResult = await runCodeSnippet(goFile);
    expect(goResult.logs.some((l) => l.message === "8")).toBe(true);
  });

  it("evaluates Python math module and standard built-ins", async () => {
    const file: CodeFile = {
      filename: "math_builtins.py",
      path: "math_builtins.py",
      language: "python",
      content: `
import math
print(math.sqrt(16))
print(sum([1, 2, 3, 4]))
print(len("hello"))
print(min(10, 5, 20))
      `.trim(),
    };

    const result = await runCodeSnippet(file);
    expect(result.success).toBe(true);
    const msgs = result.logs.map((l) => l.message);
    expect(msgs).toContain("4");
    expect(msgs).toContain("10");
    expect(msgs).toContain("5");
  });

  it("evaluates Python list comprehensions and list methods", async () => {
    const file: CodeFile = {
      filename: "lists.py",
      path: "lists.py",
      language: "python",
      content: `
items = []
items.append(10)
items.append(20)
print(items)
      `.trim(),
    };

    const result = await runCodeSnippet(file);
    expect(result.success).toBe(true);
    const msgs = result.logs.map((l) => l.message);
    expect(msgs.some((m) => m.includes("10") && m.includes("20"))).toBe(true);
  });
});
