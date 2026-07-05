// Ada Coach /portfolio-route Edge Function (Run 4)
// The intake router (addendum endpoint 1): user answers 2-4 fixed
// questions, Haiku classifies persona + recommends a track. Stateless —
// no table backs this. Business rule: never guess silently. A malformed
// or failed classification, exactly like a genuinely contradictory
// answer, resolves to recommended_track "both" rather than an error —
// the router's whole job is to guide, never to gate.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";
import { classifyPortfolioRoute } from "../_shared/portfolio-router.ts";

const ANSWERS_MAX = 2000;

type RouteBody = { answers?: unknown };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user } = authResult;

  try {
    const body = (await req.json()) as RouteBody;
    const answers = typeof body.answers === "string" ? body.answers.trim() : "";
    if (!answers) {
      return jsonResponse({ error: "answers is required" }, 400, req);
    }
    if (answers.length > ANSWERS_MAX) {
      return jsonResponse(
        { error: `answers must be at most ${ANSWERS_MAX} characters` },
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
    const model = await getModelFor(service, "portfolio_route");

    try {
      const classification = await classifyPortfolioRoute({
        apiKey: anthropicKey,
        model,
        answers,
      });

      await recordModelUsage(service, {
        userId: user.id,
        sessionId: null,
        callType: "portfolio_route",
        model,
        inputTokens: classification.inputTokens,
        outputTokens: classification.outputTokens,
      });

      return jsonResponse(
        {
          persona: classification.persona,
          recommended_track: classification.recommendedTrack,
          confidence: classification.confidence,
          reason: classification.reason,
        },
        200,
        req,
      );
    } catch (err) {
      // Malformed/failed classification is treated the same as a
      // genuinely contradictory answer — offer both tracks, never guess.
      console.error("portfolio route classification failed:", err);
      return jsonResponse(
        {
          persona: "unclear",
          recommended_track: "both",
          confidence: 0,
          reason: "Couldn't confidently place you from those answers — here are both paths.",
        },
        200,
        req,
      );
    }
  } catch (err) {
    console.error("portfolio-route unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
