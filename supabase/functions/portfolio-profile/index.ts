// Ada Coach /portfolio-profile Edge Function (Run 4)
// Addendum endpoint 3: the aspiring PM hands over their resume +
// background + optional targets. PRE-STEP, non-negotiable: the existing
// redaction pass strips PII from resume and background BEFORE anything
// is stored or sent to a model — only redacted text ever persists.
// Haiku then extracts a structured digest (role history, skills,
// projects) which is what portfolio_profiles.resume_text stores; the
// raw resume is never kept.
//
// Resume arrives as pasted text (resume_text) OR an uploaded file
// (resume_file_path in the documents bucket, under the caller's own
// {user_id}/ folder — same path scoping the storage policies enforce).
// Extraction failure is non-fatal: the redacted text itself becomes the
// stored grounding, flagged with extraction_error so the client can say
// so.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";
import { redactPII } from "../_shared/redact.ts";
import {
  extractPlainText,
  UnsupportedFileTypeError,
} from "../_shared/text-extract.ts";
import {
  extractResumeDigest,
  formatResumeDigest,
} from "../_shared/portfolio-profile-extract.ts";

const TEXT_MAX = 50_000; // PRD: pasted text fields cap at 50k characters
const TARGET_MAX = 500;

type ProfileBody = {
  resume_text?: unknown;
  resume_file_path?: unknown;
  background?: unknown;
  target_companies?: unknown;
  target_archetype?: unknown;
};

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
    const body = (await req.json()) as ProfileBody;

    // RLS: visible only if the caller owns the profile.
    const { data: profile, error: profErr } = await userClient
      .from("portfolio_profiles")
      .select("id, conversation_id")
      .eq("id", id)
      .maybeSingle();
    if (profErr) {
      console.error("profile lookup failed:", profErr);
      return jsonResponse({ error: "Could not load your profile." }, 500, req);
    }
    if (!profile) return jsonResponse({ error: "Profile not found" }, 404, req);

    const service = getServiceClient();

    // ── Gather the raw resume text (pasted or uploaded file) ────────────
    let rawResume = "";
    if (typeof body.resume_text === "string" && body.resume_text.trim()) {
      rawResume = body.resume_text.trim();
    } else if (
      typeof body.resume_file_path === "string" &&
      body.resume_file_path.trim()
    ) {
      const filePath = body.resume_file_path.trim();
      // Same per-user scoping the storage policies enforce: a caller can
      // only point this function at their own folder.
      if (!filePath.startsWith(`${user.id}/`)) {
        return jsonResponse({ error: "Forbidden" }, 403, req);
      }
      const { data: fileBlob, error: dlErr } = await service.storage
        .from("documents")
        .download(filePath);
      if (dlErr || !fileBlob) {
        console.error("resume download failed:", dlErr);
        return jsonResponse(
          { error: "Couldn't read the uploaded resume file." },
          400,
          req,
        );
      }
      try {
        const filename = filePath.split("/").pop() ?? filePath;
        rawResume = (await extractPlainText(fileBlob, filename)).trim();
      } catch (err) {
        if (err instanceof UnsupportedFileTypeError) {
          return jsonResponse(
            { error: "Only PDF and plain-text resumes are supported." },
            400,
            req,
          );
        }
        throw err;
      }
    }

    const background =
      typeof body.background === "string" ? body.background.trim() : "";
    if (!rawResume && !background) {
      return jsonResponse(
        { error: "Provide a resume (pasted or uploaded) or background text." },
        400,
        req,
      );
    }
    if (background.length > TEXT_MAX) {
      return jsonResponse(
        { error: `background must be at most ${TEXT_MAX} characters` },
        400,
        req,
      );
    }
    // Oversized extractions are truncated rather than rejected — a resume
    // past 50k chars of text is pathological, and the Haiku digest is what
    // persists anyway.
    if (rawResume.length > TEXT_MAX) rawResume = rawResume.slice(0, TEXT_MAX);

    // ── Redaction BEFORE storage or any model call ───────────────────────
    const resumeRedaction = rawResume ? redactPII(rawResume) : null;
    const backgroundRedaction = background ? redactPII(background) : null;

    const updates: Record<string, unknown> = {};
    if (backgroundRedaction) {
      updates.background = backgroundRedaction.redactedText;
    }
    if (typeof body.target_companies === "string") {
      updates.target_companies = body.target_companies.trim().slice(0, TARGET_MAX) || null;
    }
    if (typeof body.target_archetype === "string") {
      updates.target_archetype = body.target_archetype.trim().slice(0, TARGET_MAX) || null;
    }

    // ── Haiku field extraction on the REDACTED resume ────────────────────
    let extractionError = false;
    if (resumeRedaction) {
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        console.error("Missing ANTHROPIC_API_KEY");
        extractionError = true;
        updates.resume_text = resumeRedaction.redactedText;
      } else {
        try {
          const model = await getModelFor(service, "portfolio_profile_extraction");
          const digest = await extractResumeDigest({
            apiKey: anthropicKey,
            model,
            redactedResumeText: resumeRedaction.redactedText,
          });
          updates.resume_text = formatResumeDigest(digest);

          await recordModelUsage(service, {
            userId: user.id,
            sessionId: null,
            callType: "portfolio_profile_extraction",
            model,
            inputTokens: digest.inputTokens,
            outputTokens: digest.outputTokens,
          });
        } catch (err) {
          // Non-fatal: the redacted text itself still grounds coaching.
          console.error("resume digest extraction failed:", err);
          extractionError = true;
          updates.resume_text = resumeRedaction.redactedText;
        }
      }
    }

    const { data: updated, error: updErr } = await service
      .from("portfolio_profiles")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (updErr || !updated) {
      console.error("profile update failed:", updErr);
      return jsonResponse({ error: "Could not save your profile." }, 500, req);
    }

    const redactedCount =
      (resumeRedaction?.redactions.length ?? 0) +
      (backgroundRedaction?.redactions.length ?? 0);
    const flagged = [
      ...(resumeRedaction?.flagged ?? []),
      ...(backgroundRedaction?.flagged ?? []),
    ];

    return jsonResponse(
      {
        profile: updated,
        redaction: { redacted_count: redactedCount, flagged },
        ...(extractionError ? { extraction_error: true } : {}),
      },
      200,
      req,
    );
  } catch (err) {
    console.error("portfolio-profile unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
