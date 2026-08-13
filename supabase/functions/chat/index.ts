import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  context?: {
    files?: { filename: string; language: string; content: string }[];
    graph?: {
      nodes: { id: string; kind: string; label: string; file: string; line: number; snippet: string }[];
      edges: { from: string; to: string; kind: string; label: string }[];
    };
    selectedNode?: { id: string; label: string; kind: string; file: string; line: number; snippet: string } | null;
    activeStep?: { label: string; kind: string; from: string; to: string } | null;
    mode?: "chat" | "analysis" | "security";
  };
}

function buildSystemPrompt(ctx: ChatRequestBody["context"]): string {
  let prompt = `You are an expert software engineer helping a developer understand their code through a 3D system flow visualizer.
The visualizer shows the system as connected nodes: frontend (browser/UI calls), backend (API routes/handlers), database (queries), and function nodes.
Connections between nodes represent HTTP requests, database queries, responses, and function calls.

Answer questions clearly and concisely. When explaining code, reference specific files, line numbers, and function names.
Keep responses focused and practical — avoid generic advice, focus on the user's actual code.`;

  if (ctx?.files && ctx.files.length > 0) {
    prompt += "\n\n--- CURRENT CODE FILES ---\n";
    for (const f of ctx.files) {
      const truncated = f.content.length > 3000 ? f.content.slice(0, 3000) + "\n... (truncated)" : f.content;
      prompt += `\nFile: ${f.filename} (${f.language})\n\`\`\`\n${truncated}\n\`\`\`\n`;
    }
  }

  if (ctx?.graph && ctx.graph.nodes.length > 0) {
    prompt += "\n--- DETECTED FLOW GRAPH ---\n";
    prompt += "Nodes:\n";
    for (const n of ctx.graph.nodes) {
      prompt += `- [${n.kind}] ${n.label} (${n.file}:${n.line}): ${n.snippet}\n`;
    }
    prompt += "\nConnections:\n";
    for (const e of ctx.graph.edges) {
      prompt += `- ${e.from} --(${e.kind}: ${e.label})--> ${e.to}\n`;
    }
  }

  if (ctx?.selectedNode) {
    prompt += `\n--- CURRENTLY SELECTED NODE ---\n`;
    prompt += `Kind: ${ctx.selectedNode.kind}\nLabel: ${ctx.selectedNode.label}\nFile: ${ctx.selectedNode.file}:${ctx.selectedNode.line}\nCode: ${ctx.selectedNode.snippet}\n`;
    prompt += `The user is looking at this node. Tailor your answer to explain it specifically.\n`;
  }

  if (ctx?.activeStep) {
    prompt += `\n--- CURRENT PLAYBACK STEP ---\n`;
    prompt += `Connection: ${ctx.activeStep.label} (${ctx.activeStep.kind}) from ${ctx.activeStep.from} to ${ctx.activeStep.to}\n`;
    prompt += `The user is viewing this connection in the flow animation. Explain what this connection represents.\n`;
  }

  if (ctx?.mode === "analysis") {
    prompt += `\n--- TASK ---\nProvide a concise analysis (2-4 sentences) of the current situation — what the selected node or active step does and how it fits into the overall system flow. Do not use bullet points or headers — write a single short paragraph.`;
  }

  if (ctx?.mode === "security") {
    prompt += `\n--- SECURITY SCAN TASK ---\nYou are performing a security audit of the user's code. Analyze all provided files for security vulnerabilities and best practice violations.

For each issue found, output a JSON object in a JSON array. Return ONLY the JSON array, no other text.

Each issue object must have:
- "file": the filename (not the full path)
- "line": the line number (integer, best guess if unsure)
- "severity": one of "error", "warning", or "info"
- "category": e.g. "Security", "Reliability", "Best Practice"
- "title": short title of the issue (max 60 chars)
- "description": what's wrong (1-2 sentences)
- "suggestion": how to fix it (1-2 sentences, with a code snippet if helpful)

Focus on: SQL injection, XSS, hardcoded secrets, CORS misconfiguration, missing input validation, insecure HTTP, eval/exec usage, weak crypto, missing error handling, command injection, and any other OWASP Top 10 issues.

If no issues are found, return an empty array: []`;
  }

  return prompt;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: ChatRequestBody = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("SUPABASE_PROJECT_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server is not configured to access the chat service." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const secretRes = await fetch(`${supabaseUrl}/rest/v1/app_secrets?key=eq.GROQ_API_KEY&select=value`, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
    });
    if (!secretRes.ok) {
      return new Response(
        JSON.stringify({ error: "Could not retrieve chat credentials." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const secretRows = await secretRes.json() as { value: string }[];
    const apiKey = secretRows[0]?.value;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Chat service is not configured. GROQ_API_KEY is missing." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = buildSystemPrompt(body.context);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...body.messages,
    ];

    const isSecurityMode = body.context?.mode === "security";

    const groqResponse = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: isSecurityMode ? 0.3 : 0.7,
        max_tokens: isSecurityMode ? 2048 : 1024,
        stream: false,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `The AI service returned an error (status ${groqResponse.status}). Please try again.` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content ?? "I couldn't generate a response. Please try again.";

    if (isSecurityMode) {
      let issues: unknown[] = [];
      try {
        const jsonMatch = reply.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          issues = JSON.parse(jsonMatch[0]);
        } else {
          issues = JSON.parse(reply);
        }
      } catch {
        issues = [];
      }
      return new Response(
        JSON.stringify({ issues, raw: reply }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Chat function error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong while processing your request. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
