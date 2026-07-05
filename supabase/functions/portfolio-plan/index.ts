// Ada Coach /portfolio-plan Edge Function (Run 4)
// Addendum endpoint 7: the artifact has reached a draft; Sonnet 4.6
// recommends tools and gives an HONEST effort estimate — total hours, a
// cadence (hours/day or /week), and a realistic calendar (JTBD-4: the
// PM decides whether this fits their life BEFORE starting, instead of
// abandoning it half-finished). The AI-native lens applies to the plan
// too: the tool list surfaces where AI accelerates the build.
//
// Strict JSON validation; malformed output -> raw response logged, 502
// retryable, nothing written (the Run 1 assumption-mapping pattern).
// Success writes effort_estimate, moves status to 'complete', and drops
// a summary turn into the conversation.

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

const PLAN_SYSTEM = `You are Ada, an AI product coach. An aspiring PM has drafted a portfolio artifact. Recommend how to actually produce and polish the deliverable, and estimate the effort honestly — they are fitting this around a job, and an estimate that flatters them into starting something they'll abandon half-finished is a failure.

Rules:
- Recommend 2-4 specific tools for producing this artifact (e.g. a docs tool, a prototyping tool, an AI assistant). For each: what it's for in THIS project, and a cost note (free tier? paid?). At least one recommendation must show where AI concretely accelerates the work — this PM is building an AI-era portfolio and their process should show it.
- total_hours: a realistic integer for a first-time portfolio builder, not an expert.
- cadence: a sustainable rhythm in plain language (e.g. "about 1 hour per weekday evening").
- timeline: the calendar that follows from the hours and cadence (e.g. "roughly 3 weeks").
- honesty_note: one sentence naming the part most likely to take longer than expected.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"tools": [{"name": "...", "purpose": "...", "cost_note": "..."}], "total_hours": <integer>, "cadence": "...", "timeline": "...", "honesty_note": "..."}`;

interface EffortPlan {
  tools: { name: string; purpose: string; cost_note: string }[];
  total_hours: number;
  cadence: string;
  timeline: string;
  honesty_note: string;
}

function validatePlan(parsed: unknown): EffortPlan | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  const tools = obj.tools;
  if (!Array.isArray(tools) || tools.length < 1 || tools.length > 6) return null;
  const outTools: EffortPlan["tools"] = [];
  for (const t of tools) {
    if (typeof t !== "object" || t === null) return null;
    const { name, purpose, cost_note } = t as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return null;
    if (typeof purpose !== "string" || !purpose.trim()) return null;
    outTools.push({
      name: name.trim().slice(0, 100),
      purpose: purpose.trim().slice(0, 500),
      cost_note: typeof cost_note === "string" ? cost_note.trim().slice(0, 200) : "",
    });
  }
  const hours = obj.total_hours;
  if (typeof hours !== "number" || hours <= 0 || hours > 1000) return null;
  const { cadence, timeline, honesty_note } = obj;
  if (typeof cadence !== "string" || !cadence.trim()) return null;
  if (typeof timeline !== "string" || !timeline.trim()) return null;
  if (typeof honesty_note !== "string" || !honesty_note.trim()) return null;

  return {
    tools: outTools,
    total_hours: Math.round(hours),
    cadence: cadence.trim().slice(0, 300),
    timeline: timeline.trim().slice(0, 300),
    honesty_note: honesty_note.trim().slice(0, 500),
  };
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
    // RLS: visible only if the caller owns the project.
    const { data: project, error: projErr } = await userClient
      .from("portfolio_projects")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (projErr) {
      console.error("project lookup failed:", projErr);
      return jsonResponse({ error: "Could not load the project." }, 500, req);
    }
    if (!project) return jsonResponse({ error: "Project not found" }, 404, req);
    if (!project.chosen || !project.artifact_type) {
      return jsonResponse(
        { error: "not_chosen", detail: "Pick this project before planning." },
        409,
        req,
      );
    }

    const content = (project.artifact_content ?? {}) as Record<string, unknown>;
    const sections = Array.isArray(content.sections)
      ? (content.sections as { key: string; title: string; content_md: string }[])
      : [];
    if (sections.length === 0) {
      return jsonResponse(
        {
          error: "no_draft",
          detail: "Coach the artifact to a draft first — the estimate is grounded in what you're actually building.",
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

    const draftOutline = sections
      .map((s) => `## ${s.title}\n${s.content_md}`)
      .join("\n\n");
    const artifactName =
      project.artifact_type === "prd"
        ? "PRD"
        : project.artifact_type === "brief"
          ? "product brief"
          : "prototype spec";

    const model = await getModelFor(service, "portfolio_plan_generation");
    const result = await callClaude({
      apiKey: anthropicKey,
      model,
      system: PLAN_SYSTEM,
      messages: [
        {
          role: "user",
          content: `The artifact is a ${artifactName} titled "${project.idea_title}" (AI angle: ${project.ai_angle ?? "n/a"}). Current draft:\n\n${draftOutline}\n\nRecommend tools and estimate the effort to take this from draft to a polished, interview-ready deliverable.`,
        },
      ],
      maxTokens: 1500,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: null,
      callType: "portfolio_plan_generation",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const plan = validatePlan(extractFirstJson(result.text));
    if (!plan) {
      console.error("portfolio-plan malformed output:", result.text);
      return jsonResponse(
        { error: "malformed_model_output", retryable: true },
        502,
        req,
      );
    }

    const { data: updated, error: updErr } = await service
      .from("portfolio_projects")
      .update({ effort_estimate: plan, status: "complete" })
      .eq("id", id)
      .select("*")
      .single();
    if (updErr || !updated) {
      console.error("effort_estimate update failed:", updErr);
      return jsonResponse({ error: "Could not save the plan." }, 500, req);
    }

    // Drop the plan into the conversation so the thread stays the spine.
    const { data: profile } = await service
      .from("portfolio_profiles")
      .select("conversation_id")
      .eq("id", project.portfolio_profile_id)
      .maybeSingle();
    if (profile) {
      const toolList = plan.tools
        .map((t) => `- **${t.name}** — ${t.purpose}${t.cost_note ? ` (${t.cost_note})` : ""}`)
        .join("\n");
      const { error: msgErr } = await service.from("messages").insert({
        conversation_id: profile.conversation_id,
        role: "assistant",
        content: `Your effort plan is ready.\n\n**Tools:**\n${toolList}\n\n**Effort:** about ${plan.total_hours} hours · ${plan.cadence} · ${plan.timeline}\n\n_${plan.honesty_note}_`,
      });
      if (msgErr) console.error("plan message insert failed:", msgErr);
    }

    return jsonResponse({ project: updated, plan, model }, 201, req);
  } catch (err) {
    console.error("portfolio-plan unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
