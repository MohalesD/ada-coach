// Ada Coach /portfolio-projects Edge Function (Run 4)
// Reads and the two client-initiated state changes on portfolio projects:
//   GET ?id= | ?profile_id= | (none)   -> fetch one / by profile / all own
//   PATCH ?id= { action: 'choose', artifact_type } -> pick this idea
//     (addendum endpoint 5: chosen=true for one, siblings stay false);
//     artifact_type is chosen here because the artifact coaching that
//     starts next needs to know what it's coaching toward.
//   PATCH ?id= { action: 'share' } -> mint the share token (idempotent;
//     an existing token is returned unchanged so links stay stable, the
//     report pattern).
//
// All writes go through the service client after an RLS-bound ownership
// read — authenticated has no direct write path to this table.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";

const ARTIFACT_TYPES = new Set(["prd", "brief", "prototype_spec"]);

type PatchBody = { action?: unknown; artifact_type?: unknown };

function mintShareToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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
        const { data, error } = await userClient
          .from("portfolio_projects")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.error("project fetch failed:", error);
          return jsonResponse({ error: "Could not load the project." }, 500, req);
        }
        if (!data) return jsonResponse({ error: "Project not found" }, 404, req);
        return jsonResponse({ project: data }, 200, req);
      }

      const profileId = url.searchParams.get("profile_id");
      let query = userClient
        .from("portfolio_projects")
        .select("*")
        .order("created_at", { ascending: true });
      if (profileId) query = query.eq("portfolio_profile_id", profileId);
      const { data, error } = await query;
      if (error) {
        console.error("projects list failed:", error);
        return jsonResponse({ error: "Could not load projects." }, 500, req);
      }
      return jsonResponse({ projects: data ?? [] }, 200, req);
    }

    if (req.method !== "PATCH") {
      return jsonResponse({ error: "Method not allowed" }, 405, req);
    }
    if (!id) return jsonResponse({ error: "id is required" }, 400, req);

    const body = (await req.json()) as PatchBody;
    const action = typeof body.action === "string" ? body.action : "";

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

    const service = getServiceClient();

    if (action === "choose") {
      const artifactType =
        typeof body.artifact_type === "string" ? body.artifact_type : "";
      if (!ARTIFACT_TYPES.has(artifactType)) {
        return jsonResponse(
          { error: "artifact_type must be 'prd', 'brief', or 'prototype_spec'" },
          400,
          req,
        );
      }

      // Siblings back to un-chosen/proposed; their drafted content (if
      // any) stays in artifact_content — switching ideas loses nothing.
      const { error: unsetErr } = await service
        .from("portfolio_projects")
        .update({ chosen: false, status: "proposed" })
        .eq("portfolio_profile_id", project.portfolio_profile_id)
        .neq("id", id);
      if (unsetErr) {
        console.error("sibling unset failed:", unsetErr);
        return jsonResponse({ error: "Could not choose the project." }, 500, req);
      }

      const { data: updated, error: updErr } = await service
        .from("portfolio_projects")
        .update({ chosen: true, status: "in_progress", artifact_type: artifactType })
        .eq("id", id)
        .select("*")
        .single();
      if (updErr || !updated) {
        console.error("choose update failed:", updErr);
        return jsonResponse({ error: "Could not choose the project." }, 500, req);
      }
      return jsonResponse({ project: updated }, 200, req);
    }

    if (action === "share") {
      if (project.share_token) {
        return jsonResponse({ project }, 200, req);
      }
      const { data: updated, error: updErr } = await service
        .from("portfolio_projects")
        .update({ share_token: mintShareToken() })
        .eq("id", id)
        .select("*")
        .single();
      if (updErr || !updated) {
        console.error("share token mint failed:", updErr);
        return jsonResponse({ error: "Could not create a share link." }, 500, req);
      }
      return jsonResponse({ project: updated }, 200, req);
    }

    return jsonResponse(
      { error: "action must be 'choose' or 'share'" },
      400,
      req,
    );
  } catch (err) {
    console.error("portfolio-projects unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
