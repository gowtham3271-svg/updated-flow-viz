import { supabase } from "@/lib/supabase";

export interface UserQuestionRecord {
  id?: string;
  question: string;
  reply?: string | null;
  context?: Record<string, unknown>;
  created_at?: string;
  language?: string;
  latency_ms?: number | null;
  sources?: unknown[];
}

/**
 * Persists a user's question and context to Supabase database.
 * Dual-writes to flow_viz.user_questions (primary project schema)
 * and public.user_questions (public schema) so questions are visible
 * in both Table Editor tabs.
 */
export async function saveUserQuestion(
  record: UserQuestionRecord
): Promise<{ success: boolean; data?: UserQuestionRecord; error?: string }> {
  try {
    const trimmedQuestion = record.question.trim();
    if (!trimmedQuestion) {
      return { success: false, error: "Empty question" };
    }

    const questionId =
      record.id ||
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : undefined);

    const payload = {
      ...(questionId ? { id: questionId } : {}),
      question: trimmedQuestion,
      reply: record.reply ?? null,
      context: record.context ?? {},
    };

    let savedData: UserQuestionRecord | null = null;
    let savedError: string | null = null;

    // 1. Primary: flow_viz.user_questions
    try {
      const { data, error } = await supabase
        .schema("flow_viz")
        .from("user_questions")
        .insert({
          ...payload,
          language: record.language || "en",
          sources: record.sources || [],
        })
        .select();

      if (!error && data && data.length > 0) {
        savedData = data[0] as UserQuestionRecord;
      } else if (error) {
        savedError = error.message;
        console.warn("[Supabase flow_viz] insert notice:", error.message);
      }
    } catch (e) {
      savedError = e instanceof Error ? e.message : "flow_viz error";
    }

    // 2. Dual-write to public.user_questions
    try {
      const { data, error } = await supabase
        .schema("public")
        .from("user_questions")
        .insert(payload)
        .select();

      if (!savedData && !error && data && data.length > 0) {
        savedData = data[0] as UserQuestionRecord;
      }
    } catch (err) {
      console.warn("[Supabase public] fallback notice:", err);
    }

    if (savedData) {
      console.info("[Supabase] Question stored successfully:", savedData.id, trimmedQuestion);
      return { success: true, data: savedData };
    }

    console.warn("[Supabase] Could not persist question:", savedError);
    return { success: false, error: savedError || "Failed to persist to Supabase" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to store question";
    console.warn("Supabase question service exception:", message);
    return { success: false, error: message };
  }
}

/**
 * Updates an existing question record with the AI's generated response across schemas.
 */
export async function updateUserQuestionReply(id: string, reply: string): Promise<boolean> {
  try {
    const p1 = supabase.schema("flow_viz").from("user_questions").update({ reply }).eq("id", id);
    const p2 = supabase.schema("public").from("user_questions").update({ reply }).eq("id", id);
    await Promise.allSettled([p1, p2]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves the latest user questions history from Supabase.
 * Checks flow_viz schema first, with fallback to public.
 */
export async function fetchRecentQuestions(limit = 20): Promise<UserQuestionRecord[]> {
  try {
    // 1. Try flow_viz schema first
    const { data: flowVizData, error: flowVizErr } = await supabase
      .schema("flow_viz")
      .from("user_questions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!flowVizErr && flowVizData && flowVizData.length > 0) {
      return flowVizData as UserQuestionRecord[];
    }

    // 2. Fallback to public schema
    const { data: publicData, error: publicErr } = await supabase
      .schema("public")
      .from("user_questions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!publicErr && publicData) {
      return publicData as UserQuestionRecord[];
    }

    return [];
  } catch {
    return [];
  }
}
