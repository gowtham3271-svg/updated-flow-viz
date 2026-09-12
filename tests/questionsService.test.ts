import { describe, it, expect } from "vitest";
import { saveUserQuestion, fetchRecentQuestions } from "../src/services/questionsService";

describe("Supabase User Questions Service", () => {
  it("safely attempts to save a question without throwing uncaught exceptions", async () => {
    const result = await saveUserQuestion({
      question: "How does the payment flow connect to the database?",
      reply: "The checkout function invokes the process_payment endpoint which writes to the transactions table.",
      context: { selectedNode: "checkout", file: "services/payment.ts" },
    });

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    if (result.success && result.data) {
      expect(result.data.question).toContain("payment flow");
    }
  });

  it("safely fetches questions without throwing runtime errors", async () => {
    const list = await fetchRecentQuestions();
    expect(Array.isArray(list)).toBe(true);
  });
});
