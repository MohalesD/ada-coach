// Ada Coach /portfolio-coach Edge Function (Run 4)
// Addendum endpoint 6: the multi-turn artifact coaching loop. Each call
// is one turn — the PM's message goes into the profile's conversation,
// Sonnet 4.6 coaches grounded in the profile bundle + prior turns, and
// when a section of the artifact is ready it lands incrementally in
// portfolio_projects.artifact_content.
//
// Output protocol: the reply may carry section updates in delimiter
// blocks (see SECTION_RE) rather than JSON — Run 2's interview-guide
// lesson applies double here: long markdown inside a JSON string is the
// most malformation-prone shape available, and a coaching turn carries
// BOTH prose and markdown sections. A malformed block degrades to plain
// reply text (coaching continues, nothing breaks); the section update
// just doesn't land that turn.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { callClaude, type ClaudeMessage } from "../_shared/anthropic.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";

const MESSAGE_MAX = 50_000;
const HISTORY_LIMIT = 20;

// <<<SECTION key="problem" title="Problem Statement">>> ... <<<END SECTION>>>
const SECTION_RE =
  /<<<SECTION\s+key="([a-z0-9_-]+)"\s+title="([^"]{1,120})"\s*>>>\r?\n?([\s\S]*?)<<<END SECTION>>>/g;
const DRAFT_READY_MARKER = "<<<DRAFT READY>>>";

const ARTIFACT_GUIDES: Record<string, string> = {
  prd: `A strong PM portfolio PRD covers: problem statement; target user and their job-to-be-done; goals and success metrics; solution overview; AI-native features (where AI concretely fits: UX patterns, model layer, AI-first capabilities); key requirements or user stories; risks and open questions.`,
  brief: `A strong product brief covers: context; the problem; the opportunity (including the AI-native angle — where AI concretely fits); proposed direction; success measures; next steps.`,
  prototype_spec: `A strong prototype spec covers: the concept; primary user flows; key screens or surfaces; AI interaction patterns (where AI shows up in the experience and how the user feels it); data and model needs; a build plan for the prototype itself.`,
};

function coachSystem(opts: {
  artifactType: string;
  profileBundle: string;
  ideaTitle: string;
  aiAngle: string | null;
  existingSections: { key: string; title: string }[];
}): string {
  const artifactName =
    opts.artifactType === "prd"
      ? "PRD"
      : opts.artifactType === "brief"
        ? "product brief"
        : "prototype spec";
  const done = opts.existingSections.length
    ? `Sections already drafted: ${opts.existingSections.map((s) => `${s.title} (key: ${s.key})`).join(", ")}.`
    : "No sections drafted yet.";

  return `You are Ada, an AI product coach. You are coaching an aspiring PM through building ONE portfolio artifact: a ${artifactName} for their project "${opts.ideaTitle}". They will show this to hiring managers to prove they can think like a PM — specifically an AI-era PM.

THEIR BACKGROUND (redacted, use it to keep coaching concrete and personal):
${opts.profileBundle}

THE PROJECT'S AI-NATIVE ANGLE: ${opts.aiAngle ?? "not yet articulated — surface one early"}

${ARTIFACT_GUIDES[opts.artifactType] ?? ARTIFACT_GUIDES.prd}

${done}

HOW YOU COACH:
- One section at a time, one focused question at a time. Never a list of questions. Keep replies to 2-4 sentences plus the question.
- Pressure-test their thinking — never validate weak reasoning to be nice. Their artifact must survive a skeptical interviewer.
- The AI-native lens is mandatory: the finished artifact must make clear where AI fits (UX, layer, feature, framing). Push for it if they drift traditional.
- When their answers give you enough for a section, WRITE that section yourself (crisp, hiring-manager-ready markdown) and include it in your reply using EXACTLY this format:

<<<SECTION key="short_snake_key" title="Section Title">>>
The section's markdown content.
<<<END SECTION>>>

- Re-emit a section with the same key to revise it. You may include at most one section block per reply.
- When every section the artifact needs is drafted, put ${DRAFT_READY_MARKER} on its own line at the end of your reply and tell them the draft is ready for the effort plan.
- Outside the blocks, write plain conversational coaching. Never mention the block syntax to the user.`;
}

type CoachBody = { message?: unknown };

interface ArtifactSection {
  key: string;
  title: string;
  content_md: string;
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
    const body = (await req.json()) as CoachBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return jsonResponse({ error: "message is required" }, 400, req);
    }
    if (message.length > MESSAGE_MAX) {
      return jsonResponse(
        { error: `message must be at most ${MESSAGE_MAX} characters` },
        400,
        req,
      );
    }

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
        {
          error: "not_chosen",
          detail: "Pick this project (and its artifact type) before coaching starts.",
        },
        409,
        req,
      );
    }

    const service = getServiceClient();

    const { data: profile, error: profErr } = await service
      .from("portfolio_profiles")
      .select("*")
      .eq("id", project.portfolio_profile_id)
      .maybeSingle();
    if (profErr || !profile) {
      console.error("profile lookup failed:", profErr);
      return jsonResponse({ error: "Could not load your profile." }, 500, req);
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

    // Persist the PM's turn first — the thread is the source of truth.
    const { error: userMsgErr } = await service.from("messages").insert({
      conversation_id: profile.conversation_id,
      role: "user",
      content: message,
    });
    if (userMsgErr) {
      console.error("user message insert failed:", userMsgErr);
      return jsonResponse({ error: "Could not send your message." }, 500, req);
    }

    // Prior turns (including the one just written).
    const { data: history } = await service
      .from("messages")
      .select("role, content")
      .eq("conversation_id", profile.conversation_id)
      .eq("kind", "message")
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const turns: ClaudeMessage[] = (history ?? [])
      .reverse()
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    // Anthropic requires the first message to be a user turn.
    while (turns.length > 0 && turns[0].role !== "user") turns.shift();

    const profileBundle = [
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

    const content = (project.artifact_content ?? {}) as Record<string, unknown>;
    const sections: ArtifactSection[] = Array.isArray(content.sections)
      ? (content.sections as ArtifactSection[])
      : [];

    const model = await getModelFor(service, "portfolio_artifact_coaching");
    const result = await callClaude({
      apiKey: anthropicKey,
      model,
      system: coachSystem({
        artifactType: project.artifact_type,
        profileBundle: profileBundle || "(no background on file)",
        ideaTitle: project.idea_title,
        aiAngle: project.ai_angle,
        existingSections: sections.map((s) => ({ key: s.key, title: s.title })),
      }),
      messages: turns,
      maxTokens: 3000,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: null,
      callType: "portfolio_artifact_coaching",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    // ── Parse section blocks + draft-ready marker out of the reply ──────
    const updatedSections = [...sections];
    let sectionsChanged = false;
    let replyText = result.text;

    for (const m of result.text.matchAll(SECTION_RE)) {
      const [, key, title, sectionMd] = m;
      const contentMd = sectionMd.trim();
      if (!contentMd) continue;
      const existingIdx = updatedSections.findIndex((s) => s.key === key);
      const section: ArtifactSection = { key, title, content_md: contentMd };
      if (existingIdx >= 0) updatedSections[existingIdx] = section;
      else updatedSections.push(section);
      sectionsChanged = true;
    }
    replyText = replyText.replace(SECTION_RE, "").trim();

    const draftReady = replyText.includes(DRAFT_READY_MARKER);
    replyText = replyText.replaceAll(DRAFT_READY_MARKER, "").trim();
    if (!replyText) {
      replyText = sectionsChanged
        ? "I've updated the artifact — take a look at the draft panel."
        : "Let's keep going.";
    }

    let updatedProject = project;
    if (sectionsChanged || draftReady) {
      const newContent = {
        ...content,
        sections: updatedSections,
        ...(draftReady ? { draft_ready: true } : {}),
      };
      const { data: upd, error: updErr } = await service
        .from("portfolio_projects")
        .update({ artifact_content: newContent })
        .eq("id", id)
        .select("*")
        .single();
      if (updErr || !upd) {
        // The coaching reply still stands; the section just didn't land.
        console.error("artifact_content update failed:", updErr);
      } else {
        updatedProject = upd;
      }
    }

    const { data: assistantMsg, error: aMsgErr } = await service
      .from("messages")
      .insert({
        conversation_id: profile.conversation_id,
        role: "assistant",
        content: replyText,
      })
      .select("id")
      .single();
    if (aMsgErr) console.error("assistant message insert failed:", aMsgErr);

    return jsonResponse(
      {
        reply: replyText,
        message_id: assistantMsg?.id ?? null,
        project: updatedProject,
        sections_updated: sectionsChanged,
        draft_ready: draftReady,
      },
      200,
      req,
    );
  } catch (err) {
    console.error("portfolio-coach unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
