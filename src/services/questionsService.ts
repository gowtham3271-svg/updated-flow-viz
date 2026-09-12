import { supabase } from "@/lib/supabase";

export interface UserQuestionRecord {
  id?: string;
  question: string;
  reply?: string | null;
  context?: Record<string, unknown>;
  created_at?: string;
}

/**
 * Persists a user's question and context to Supabase database.
 */
export async function saveUserQuestion(record: UserQuestionRecord): Promise<{ success: boolean; data?: UserQuestionRecord; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("user_questions")
      .insert({
        question: record.question.trim(),
        reply: record.reply ?? null,
        context: record.context ?? {},
      })
      .select()
      .single();

    if (error) {
      console.warn("Supabase user_questions save warning:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data as UserQuestionRecord };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to store question";
    console.warn("Supabase question service exception:", message);
    return { success: false, error: message };
  }
}

/**
 * Updates an existing question record with the AI's generated response.
 */
export async function updateUserQuestionReply(id: string, reply: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("user_questions")
      .update({ reply })
      .eq("id", id);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Retrieves the latest user questions history from Supabase.
 */
export async function fetchRecentQuestions(limit = 20): Promise<UserQuestionRecord[]> {
  try {
    const { data, error } = await supabase
      .from("user_questions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as UserQuestionRecord[];
  } catch {
    return [];
  }
}
