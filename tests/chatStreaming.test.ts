import { describe, it, expect } from "vitest";
import { sendChatStream, parseActionsFromText, type ChatContext } from "../src/lib/chat";

describe("JARVIS Real-Time Chat Streaming", () => {
  const dummyContext: ChatContext = {
    files: [
      {
        path: "src/server.ts",
        filename: "server.ts",
        content: "app.post('/api/pay', async (req, res) => { await db.insert(req.body); });",
        language: "typescript",
      },
    ],
    graph: {
      nodes: [
        {
          id: "api_pay",
          label: "POST /api/pay",
          kind: "api",
          file: "src/server.ts",
          line: 1,
          detail: "Payment route",
          snippet: "app.post('/api/pay')",
        },
      ],
      edges: [],
    },
    selectedNode: null,
    activeStep: null,
    mode: "chat",
  };

  it("streams responses progressively using sendChatStream", async () => {
    const chunks: string[] = [];
    let finalAccumulated = "";

    const reply = await sendChatStream(
      [{ role: "user", content: "Tell me about the project architecture" }],
      dummyContext,
      (chunk, accumulated) => {
        chunks.push(chunk);
        finalAccumulated = accumulated;
      }
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(reply.length).toBeGreaterThan(0);
    expect(finalAccumulated).toBe(reply);
    expect(reply.toLowerCase()).toContain("sir");
  }, 15000);

  it("correctly parses visualization actions embedded in chat replies", () => {
    const textWithActions =
      "Right away, sir! Directing sensors to the payment endpoint. [ACTION:focus_node:api_pay]\n[ACTION:run_code]";

    const { cleanText, actions } = parseActionsFromText(
      textWithActions,
      dummyContext.graph,
      dummyContext.files
    );

    expect(cleanText).not.toContain("[ACTION:");
    expect(cleanText).toContain("Directing sensors to the payment endpoint.");
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("focus_node");
    expect(actions[0].param).toBe("api_pay");
    expect(actions[1].type).toBe("run_code");
  });
});

describe("JARVIS Google Gemini Key Management & Single-Provider Integration", () => {
  it("resolves Gemini API key with priority given to custom storage or environment", async () => {
    const { getGeminiKey, setCustomGeminiKey, getGroqKey } = await import("../src/lib/chat");
    
    // Initial key resolution (can be empty string or env key)
    const initialKey = getGeminiKey();
    expect(typeof initialKey).toBe("string");

    // Legacy Groq getter should alias cleanly to Gemini key
    expect(getGroqKey()).toBe(initialKey);

    // Test setting custom key
    setCustomGeminiKey("AIzaSy_mock_secure_key_123");
    expect(getGeminiKey()).toBe("AIzaSy_mock_secure_key_123");
    expect(getGroqKey()).toBe("AIzaSy_mock_secure_key_123");

    // Reset back
    setCustomGeminiKey("");
    expect(getGeminiKey()).toBe(initialKey);
  });

  it("handles empty key validation gracefully", async () => {
    const { verifyGeminiApiKey } = await import("../src/lib/chat");
    const result = await verifyGeminiApiKey("AIzaSy_dummy_key_format");
    expect(result).toHaveProperty("valid");
  });
});
