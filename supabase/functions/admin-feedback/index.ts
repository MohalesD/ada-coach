// Admin endpoint for the unified feedback log.
// Requires the caller's Supabase Auth JWT (Authorization: Bearer ...);
// access is gated to user_profiles.role in ('admin','owner').
//
// GET → most recent user_feedback rows (capped), each joined with the
//        submitter's email/display name. Read-only by design — triage
//        actions are a later backlog item.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";

const FETCH_LIMIT = 200;

type FeedbackRow = {
  id: string;
  user_id: string;
  feedback_type: "bug" | "feedback" | "praise" | "message_rating";
  rating: "up" | "down" | null;
  message_id: string | null;
  source_surface: string;
  comment: string | null;
  contact_email: string | null;
  created_at: string;
};

type ProfileRow = { id: string; email: string | null; display_name: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;

  try {
    const service = getServiceClient();

    const { data: rows, error: rowsErr } = await service
      .from("user_feedback")
      .select(
        "id, user_id, feedback_type, rating, message_id, source_surface, comment, contact_email, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(FETCH_LIMIT);
    if (rowsErr) {
      console.error("user_feedback fetch failed:", rowsErr);
      return jsonResponse({ error: "Could not load feedback." }, 500, req);
    }

    const feedback = (rows ?? []) as FeedbackRow[];
    const userIds = [...new Set(feedback.map((r) => r.user_id))];

    let profiles: ProfileRow[] = [];
    if (userIds.length > 0) {
      const { data: profileRows, error: profErr } = await service
        .from("user_profiles")
        .select("id, email, display_name")
        .in("id", userIds);
      if (profErr) {
        // Non-fatal: the list still renders, just without names.
        console.error("user_profiles fetch failed:", profErr);
      }
      profiles = (profileRows ?? []) as ProfileRow[];
    }
    const byId = new Map(profiles.map((p) => [p.id, p]));

    return jsonResponse(
      {
        feedback: feedback.map((r) => ({
          ...r,
          user_email: byId.get(r.user_id)?.email ?? null,
          user_display_name: byId.get(r.user_id)?.display_name ?? null,
        })),
      },
      200,
      req,
    );
  } catch (err) {
    console.error("admin-feedback unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
