// Ada Coach /assumptions Edge Function (Run 1)
// Read and score assumptions:
//   GET ?id=                     -> one assumption + its full status history
//   GET ?session_id= | ?product_id= -> list
//   PATCH ?id= { confidence?, impact?, status?, is_prioritized? }
//
// Creation happens in /assumption-mapping (the Sonnet 4.6 extractor).
// Status history is written by a database trigger — no client write path.
// All queries run through the RLS-bound userClient.

import "@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, requireUser } from "../_shared/auth.ts";

const STATUSES = new Set(["untested", "validated", "challenged", "abandoned"]);

type PatchBody = {
  confidence?: unknown;
  impact?: unknown;
  status?: unknown;
  is_prioritized?: unknown;
};

function isScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { userClient } = authResult;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      if (id) {
        const { data: assumption, error } = await userClient
          .from("assumptions")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.error("assumption fetch failed:", error);
          return jsonResponse({ error: "Could not load assumption." }, 500, req);
        }
        if (!assumption) {
          return jsonResponse({ error: "Assumption not found" }, 404, req);
        }

        const { data: history, error: histErr } = await userClient
          .from("assumption_status_history")
          .select("old_status, new_status, changed_at")
          .eq("assumption_id", id)
          .order("changed_at", { ascending: true });
        if (histErr) {
          console.error("history fetch failed:", histErr);
          return jsonResponse({ error: "Could not load history." }, 500, req);
        }

        return jsonResponse({ assumption, history: history ?? [] }, 200, req);
      }

      const sessionId = url.searchParams.get("session_id");
      const productId = url.searchParams.get("product_id");
      if (!sessionId && !productId) {
        return jsonResponse(
          { error: "session_id or product_id is required" },
          400,
          req,
        );
      }

      let query = userClient
        .from("assumptions")
        .select("*")
        .order("created_at", { ascending: true });
      if (sessionId) query = query.eq("session_id", sessionId);
      if (productId) query = query.eq("product_id", productId);

      const { data, error } = await query;
      if (error) {
        console.error("assumptions list failed:", error);
        return jsonResponse({ error: "Could not load assumptions." }, 500, req);
      }
      return jsonResponse({ assumptions: data ?? [] }, 200, req);
    }

    if (req.method === "PATCH") {
      if (!id) return jsonResponse({ error: "id is required" }, 400, req);
      const body = (await req.json()) as PatchBody;

      const patch: Record<string, number | string | boolean> = {};
      if (body.confidence !== undefined) {
        if (!isScore(body.confidence)) {
          return jsonResponse(
            { error: "confidence must be an integer from 1 to 5" },
            400,
            req,
          );
        }
        patch.confidence = body.confidence;
      }
      if (body.impact !== undefined) {
        if (!isScore(body.impact)) {
          return jsonResponse(
            { error: "impact must be an integer from 1 to 5" },
            400,
            req,
          );
        }
        patch.impact = body.impact;
      }
      if (body.status !== undefined) {
        if (typeof body.status !== "string" || !STATUSES.has(body.status)) {
          return jsonResponse(
            {
              error:
                "status must be one of untested, validated, challenged, abandoned",
            },
            400,
            req,
          );
        }
        patch.status = body.status;
      }
      if (body.is_prioritized !== undefined) {
        if (typeof body.is_prioritized !== "boolean") {
          return jsonResponse(
            { error: "is_prioritized must be a boolean" },
            400,
            req,
          );
        }
        patch.is_prioritized = body.is_prioritized;
      }
      if (Object.keys(patch).length === 0) {
        return jsonResponse({ error: "Nothing to update" }, 400, req);
      }

      // RLS: only the owner's row is updatable; the status-history trigger
      // records any status change automatically.
      const { data, error } = await userClient
        .from("assumptions")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) {
        console.error("assumption update failed:", error);
        return jsonResponse({ error: "Could not update assumption." }, 500, req);
      }
      if (!data) return jsonResponse({ error: "Assumption not found" }, 404, req);
      return jsonResponse({ assumption: data }, 200, req);
    }

    return jsonResponse({ error: "Method not allowed" }, 405, req);
  } catch (err) {
    console.error("assumptions function unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
