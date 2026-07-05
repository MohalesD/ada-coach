// Ada Coach /interview-guide Edge Function (Run 2)
// PRD Technical Flow step 10: generate a Mom Test interview guide for the
// PM's prioritized assumptions (Sonnet 4.6), stored as a versioned
// document linked to the session. Regeneration appends version + 1 —
// never mutates a prior version, because the PM may be holding an older
// guide in a live interview.
//
// Allowed on completed sessions too: the PRD says the guide never
// auto-regenerates after close, but the PM explicitly asking for a new
// version is exactly the "until they ask" carve-out.
//
// The model returns plain markdown (not JSON) on purpose: a long guide
// inside a JSON string is the most malformation-prone shape we could
// pick, and markdown needs no parsing to be useful.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";
import { loadProductMemory, type MemoryClient } from "../_shared/product-memory.ts";

const GUIDE_MIN_CHARS = 300;

const GUIDE_SYSTEM = `You are Ada, an AI customer discovery coach. Your task: write a Mom Test interview guide for the PM's prioritized assumptions.

The Mom Test (Rob Fitzpatrick): ask about the customer's life and past behavior, never about your idea. Questions must be ones that even a polite person who wants to encourage you cannot answer with a flattering lie.

Hard rules for every question you write:
- Ask about SPECIFIC PAST behavior ("Tell me about the last time you…", "Walk me through how you handled…", "What did that cost you?").
- NEVER ask hypothetical or opinion questions ("Would you use…", "Do you think…", "How much would you pay…", "Would you buy…"). Not one.
- Never pitch or explain the product idea inside a question.
- Dig for commitment and concrete facts: money spent, time lost, tools tried, people involved.

Structure the guide as markdown:
# Interview Guide — {product name}
A one-paragraph brief on who to talk to and how to open without pitching.
Then one section per prioritized assumption:
## Assumption: {statement}
- 3-5 questions, each with a short italic note on what a strong signal sounds like.
Close with a "Red flags to watch for" section (compliments, generics, future promises) and a reminder that answers about the future are noise.

Respond with ONLY the markdown guide, no preamble.`;

type GuideBody = { session_id?: unknown };

function countQuestions(md: string): number {
  return (md.match(/\?/g) ?? []).length;
}

// The QA bar says the guide never includes a leading / hypothetical-
// opinion question. Belt and suspenders on top of the prompt: reject the
// output when an obviously hypothetical stem appears in a question line.
const HYPOTHETICAL_STEM =
  /\b(would you (use|pay|buy|want|try)|do you think you would|how much would you pay|would you be willing)\b/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  try {
    const body = (await req.json()) as GuideBody;
    const sessionId =
      typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId) {
      return jsonResponse({ error: "session_id is required" }, 400, req);
    }

    const { data: session, error: sErr } = await userClient
      .from("sessions")
      .select("id, product_id, conversation_id, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (sErr) {
      console.error("session lookup failed:", sErr);
      return jsonResponse({ error: "Could not load session." }, 500, req);
    }
    if (!session) return jsonResponse({ error: "Session not found" }, 404, req);
    if (session.status === "abandoned") {
      return jsonResponse(
        { error: "invalid_state", detail: "Session was abandoned." },
        409,
        req,
      );
    }

    const { data: prioritized, error: pErr } = await userClient
      .from("assumptions")
      .select("id, statement, category, confidence, impact")
      .eq("session_id", sessionId)
      .eq("is_prioritized", true)
      .order("impact", { ascending: false });
    if (pErr) {
      console.error("prioritized lookup failed:", pErr);
      return jsonResponse({ error: "Could not load assumptions." }, 500, req);
    }
    if (!prioritized || prioritized.length === 0) {
      return jsonResponse(
        {
          error: "no_prioritized_assumptions",
          detail: "Confirm your riskiest assumptions before generating a guide.",
        },
        400,
        req,
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      console.error("Missing ANTHROPIC_API_KEY");
      return jsonResponse(
        { error: "Ada is not configured correctly. Please try again later." },
        500,
        req,
      );
    }

    const service = getServiceClient();

    const [{ data: product }, { data: evidence }, memory] = await Promise.all([
      service
        .from("products")
        .select("name, description")
        .eq("id", session.product_id)
        .maybeSingle(),
      service
        .from("assumption_evidence")
        .select("assumption_id, title, snippet, stance")
        .eq("session_id", sessionId),
      loadProductMemory(service as unknown as MemoryClient, {
        productId: session.product_id,
        excludeSessionId: session.id,
      }),
    ]);

    const evidenceFor = (id: string) =>
      ((evidence ?? []) as Array<{
        assumption_id: string;
        title: string | null;
        snippet: string | null;
        stance: string;
      }>)
        .filter((e) => e.assumption_id === id)
        .map((e) => `  (evidence, ${e.stance}: ${e.title ?? ""} — ${e.snippet ?? ""})`)
        .join("\n");

    const assumptionBlock = prioritized
      .map(
        (a: { id: string; statement: string; category: string; confidence: number; impact: number }, i: number) => {
          const ev = evidenceFor(a.id);
          return `${i + 1}. [${a.category}, confidence ${a.confidence}/5, impact ${a.impact}/5] ${a.statement}${ev ? `\n${ev}` : ""}`;
        },
      )
      .join("\n");

    const userPrompt = [
      `Product name: ${product?.name ?? "Unnamed product"}`,
      product?.description ? `Product description: ${product.description}` : null,
      "",
      "Prioritized assumptions to test in customer interviews:",
      assumptionBlock,
      memory ? `\n${memory}` : null,
      "",
      "Write the Mom Test interview guide.",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const model = await getModelFor(service, "interview_guide");
    const result = await callClaude({
      apiKey: anthropicKey,
      model,
      system: GUIDE_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 4000,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: session.id,
      callType: "interview_guide",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const guideMd = result.text.trim();
    const questionLines = guideMd
      .split("\n")
      .filter((line) => line.includes("?"));
    const hasHypothetical = questionLines.some((line) =>
      HYPOTHETICAL_STEM.test(line)
    );
    if (guideMd.length < GUIDE_MIN_CHARS || hasHypothetical) {
      console.error(
        `interview-guide rejected output (length ${guideMd.length}, hypothetical: ${hasHypothetical}):`,
        guideMd.slice(0, 2000),
      );
      return jsonResponse(
        { error: "malformed_model_output", retryable: true },
        502,
        req,
      );
    }

    const { data: latest } = await service
      .from("interview_guides")
      .select("version")
      .eq("session_id", session.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = ((latest as { version: number } | null)?.version ?? 0) + 1;

    const { data: guide, error: insErr } = await service
      .from("interview_guides")
      .insert({
        user_id: user.id,
        session_id: session.id,
        version,
        content_md: guideMd,
        question_count: countQuestions(guideMd),
      })
      .select("*")
      .single();
    if (insErr || !guide) {
      console.error("guide insert failed:", insErr);
      return jsonResponse({ error: "Could not save the guide." }, 500, req);
    }

    // The guide joins the sprint thread so the conversation and the
    // markdown export both carry it with no extra code.
    const { error: msgErr } = await service.from("messages").insert({
      conversation_id: session.conversation_id,
      role: "assistant",
      content: guideMd,
    });
    if (msgErr) console.error("guide message insert failed:", msgErr);

    return jsonResponse({ guide, model }, 201, req);
  } catch (err) {
    console.error("interview-guide unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
