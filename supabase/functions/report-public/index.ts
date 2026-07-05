// Ada Coach /report-public Edge Function (Run 2)
// The ONLY unauthenticated surface in the app: resolves a share token to
// a report snapshot for logged-out visitors (PRD: "copy a public share
// link"). Reads happen through the service client against the reports
// table — no anon RLS policy exists anywhere; the 128-bit random token
// is the entire capability. Read-only: GET, one row, snapshot only (no
// user id, no token echo).
//
// verify_jwt is false for this function BY DESIGN — do not "fix" it.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
} from "../_shared/auth.ts";

const TOKEN_RE = /^[0-9a-f]{32}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  try {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!TOKEN_RE.test(token)) {
      return jsonResponse({ error: "Report not found" }, 404, req);
    }

    const service = getServiceClient();
    const { data, error } = await service
      .from("reports")
      .select("snapshot, generated_at")
      .eq("share_token", token)
      .maybeSingle();
    if (error) {
      console.error("public report fetch failed:", error);
      return jsonResponse({ error: "Could not load report." }, 500, req);
    }
    if (!data) return jsonResponse({ error: "Report not found" }, 404, req);

    return jsonResponse(
      { snapshot: data.snapshot, generated_at: data.generated_at },
      200,
      req,
    );
  } catch (err) {
    console.error("report-public unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
