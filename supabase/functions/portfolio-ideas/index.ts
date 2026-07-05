// Ada Coach /portfolio-ideas Edge Function (Run 4)
// Addendum endpoint 4: Sonnet 4.6 generates 3-5 portfolio project ideas
// grounded in the PM's profile bundle, EVERY idea carrying an explicit
// AI-native angle (the mandatory lens — an idea without one is rejected
// as malformed, not silently accepted). Writes one portfolio_projects
// row per idea, chosen = false.
//
// PRD edge case honored in the output contract: with a thin profile,
// Ada returns 1-2 targeted questions instead of generic filler ideas —
// the client surfaces them, the PM answers into their background, and
// retries.
//
// Re-generation: allowed while nothing is chosen (prior proposed rows
// are replaced, mirroring ingest's re-chunk behavior); once a project
// is chosen the idea list is settled — 409.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { callClaude, extractFirstJson } from "../_shared/anthropic.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";

const MIN_IDEAS = 3;
const MAX_IDEAS = 5;
const TITLE_MAX = 200;

const IDEAS_SYSTEM = `You are Ada, an AI product coach helping an aspiring PM break into product management by building a portfolio artifact that proves they can think like a PM — specifically an AI-era PM.

Given their background bundle, generate ${MIN_IDEAS}-${MAX_IDEAS} portfolio project ideas. Each idea must be:
- Matched to THEIR actual background and target roles — something they can execute and defend in an interview, not generic filler.
- Scoped to a portfolio artifact (a PRD, product brief, or prototype spec) — the plan for a product, not the product itself.
- AI-native: each idea MUST have a specific, credible "ai_angle" naming where AI fits — an AI UX pattern, an AI layer in the architecture, an AI-native feature, or AI product framing. Aspiring AI PMs are the audience; a traditional-only idea is a wrong answer.

If the background bundle is too thin to generate specific, defensible ideas, DO NOT generate generic ones. Instead ask 1-2 targeted questions that would unlock real ideas.

Respond with ONLY a JSON object, no prose, in exactly one of these shapes:
{"ideas": [{"title": "...", "description": "<2-4 sentences: what it is and why it fits this person>", "ai_angle": "<1-2 sentences: specifically where AI fits>", "why_you": "<1 sentence tying it to their background>"}]}
or
{"needs_more": true, "questions": ["...", "..."]}`;

interface CandidateIdea {
  title: string;
  description: string;
  ai_angle: string;
  why_you: string;
}

function validateIdeas(parsed: unknown):
  | { kind: "ideas"; ideas: CandidateIdea[] }
  | { kind: "questions"; questions: string[] }
  | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.needs_more === true) {
    const qs = obj.questions;
    if (
      !Array.isArray(qs) ||
      qs.length === 0 ||
      qs.length > 3 ||
      !qs.every((q) => typeof q === "string" && q.trim())
    ) {
      return null;
    }
    return {
      kind: "questions",
      questions: qs.map((q) => (q as string).trim().slice(0, 500)),
    };
  }

  const list = obj.ideas;
  if (
    !Array.isArray(list) ||
    list.length < MIN_IDEAS ||
    list.length > MAX_IDEAS
  ) {
    return null;
  }
  const out: CandidateIdea[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) return null;
    const { title, description, ai_angle, why_you } = item as Record<
      string,
      unknown
    >;
    // The AI-native lens is mandatory: an idea without a real ai_angle is
    // malformed output, not a stylistic choice.
    if (typeof title !== "string" || !title.trim()) return null;
    if (typeof description !== "string" || !description.trim()) return null;
    if (typeof ai_angle !== "string" || !ai_angle.trim()) return null;
    if (typeof why_you !== "string" || !why_you.trim()) return null;
    out.push({
      title: title.trim().slice(0, TITLE_MAX),
      description: description.trim().slice(0, 2000),
      ai_angle: ai_angle.trim().slice(0, 1000),
      why_you: why_you.trim().slice(0, 500),
    });
  }
  return { kind: "ideas", ideas: out };
}

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

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonResponse({ error: "id is required" }, 400, req);

  try {
    // RLS: visible only if the caller owns the profile.
    const { data: profile, error: profErr } = await userClient
      .from("portfolio_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (profErr) {
      console.error("profile lookup failed:", profErr);
      return jsonResponse({ error: "Could not load your profile." }, 500, req);
    }
    if (!profile) return jsonResponse({ error: "Profile not found" }, 404, req);

    if (!profile.resume_text && !profile.background) {
      return jsonResponse(
        {
          error: "no_profile",
          detail: "Add your resume or background first — ideas are grounded in who you are.",
        },
        400,
        req,
      );
    }

    const service = getServiceClient();

    // Once a project is chosen, the idea list is settled.
    const { data: chosenExisting } = await service
      .from("portfolio_projects")
      .select("id")
      .eq("portfolio_profile_id", id)
      .eq("chosen", true)
      .limit(1)
      .maybeSingle();
    if (chosenExisting) {
      return jsonResponse(
        {
          error: "already_chosen",
          detail: "You've already picked a project. Its ideas are settled.",
        },
        409,
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

    const bundle = [
      profile.resume_text ? `RESUME DIGEST:\n${profile.resume_text}` : null,
      profile.background ? `BACKGROUND:\n${profile.background}` : null,
      profile.target_companies
        ? `TARGET COMPANY TYPES: ${profile.target_companies}`
        : null,
      profile.target_archetype
        ? `TARGET PM ARCHETYPE: ${profile.target_archetype}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const model = await getModelFor(service, "portfolio_idea_generation");
    const result = await callClaude({
      apiKey: anthropicKey,
      model,
      system: IDEAS_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Generate portfolio project ideas for this aspiring PM:\n\n${bundle}`,
        },
      ],
      maxTokens: 3000,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: null,
      callType: "portfolio_idea_generation",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const validated = validateIdeas(extractFirstJson(result.text));
    if (!validated) {
      console.error("portfolio-ideas malformed output:", result.text);
      return jsonResponse(
        { error: "malformed_model_output", retryable: true },
        502,
        req,
      );
    }

    // Thin profile: Ada asks targeted questions instead of filler ideas.
    if (validated.kind === "questions") {
      return jsonResponse(
        { needs_more: true, questions: validated.questions },
        200,
        req,
      );
    }

    // Replace prior un-chosen proposals so a retry converges instead of
    // stacking duplicates (same shape as ingest's re-chunk behavior).
    const { error: clearErr } = await service
      .from("portfolio_projects")
      .delete()
      .eq("portfolio_profile_id", id)
      .eq("chosen", false);
    if (clearErr) {
      console.error("prior proposals clear failed:", clearErr);
      return jsonResponse({ error: "Could not save ideas." }, 500, req);
    }

    const rows = validated.ideas.map((idea) => ({
      user_id: user.id,
      portfolio_profile_id: id,
      idea_title: idea.title,
      ai_angle: idea.ai_angle,
      artifact_content: {
        idea: { description: idea.description, why_you: idea.why_you },
      },
    }));

    const { data: inserted, error: insErr } = await service
      .from("portfolio_projects")
      .insert(rows)
      .select("*");
    if (insErr || !inserted) {
      console.error("portfolio projects insert failed:", insErr);
      return jsonResponse({ error: "Could not save ideas." }, 500, req);
    }

    // The conversation stays the spine: record the idea list as an
    // assistant turn so the thread, summary, and export all see it.
    const ideaSummary = validated.ideas
      .map(
        (idea, i) =>
          `**${i + 1}. ${idea.title}**\n${idea.description}\n_AI angle: ${idea.ai_angle}_`,
      )
      .join("\n\n");
    const { error: msgErr } = await service.from("messages").insert({
      conversation_id: profile.conversation_id,
      role: "assistant",
      content: `Here are ${validated.ideas.length} portfolio project ideas matched to your background:\n\n${ideaSummary}\n\nPick the one you'd defend most confidently in an interview.`,
    });
    if (msgErr) console.error("idea message insert failed:", msgErr);

    return jsonResponse({ projects: inserted, model }, 201, req);
  } catch (err) {
    console.error("portfolio-ideas unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
