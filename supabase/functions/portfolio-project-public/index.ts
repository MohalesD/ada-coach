// Ada Coach /portfolio-project-public Edge Function (Run 4)
// Public share surface for portfolio artifacts — the report-public
// pattern applied to portfolio_projects (addendum endpoint 8): resolves
// a share token to a read-only view of the artifact for logged-out
// visitors. Reads happen through the service client; no anon RLS policy
// exists anywhere; the 128-bit random token is the entire capability.
// Serves selected columns only — no user id, no token echo.
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
      return jsonResponse({ error: "Artifact not found" }, 404, req);
    }

    const service = getServiceClient();
    const { data, error } = await service
      .from("portfolio_projects")
      .select(
        "idea_title, ai_angle, artifact_type, artifact_content, effort_estimate, status, updated_at",
      )
      .eq("share_token", token)
      .maybeSingle();
    if (error) {
      console.error("public artifact fetch failed:", error);
      return jsonResponse({ error: "Could not load the artifact." }, 500, req);
    }
    if (!data) return jsonResponse({ error: "Artifact not found" }, 404, req);

    return jsonResponse({ artifact: data }, 200, req);
  } catch (err) {
    console.error("portfolio-project-public unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
