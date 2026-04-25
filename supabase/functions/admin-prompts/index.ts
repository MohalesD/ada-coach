// Admin endpoint for managing Ada's coaching prompts.
// Requires the caller's Supabase Auth JWT (Authorization: Bearer ...);
// access is gated to user_profiles.role in ('admin','owner').
//
// GET                            → list all prompts (newest first)
// POST                           → create a prompt; auto-increments version
//                                   if another prompt with same name exists
// POST ?id=<uuid>&action=activate → set this prompt active, deactivate all others
// PUT  ?id=<uuid>                → update prompt_text / notes / name
// DELETE ?id=<uuid>              → delete (400 if prompt is currently active)

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;

  const supabase = getServiceClient();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const action = url.searchParams.get("action");

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("coaching_prompts")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("list prompts error:", error);
        return jsonResponse({ error: "Failed to list prompts" }, 500, req);
      }
      return jsonResponse({ prompts: data ?? [] }, 200, req);
    }

    if (req.method === "POST" && id && action === "activate") {
      const { data: target, error: fetchErr } = await supabase
        .from("coaching_prompts")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) {
        console.error("activate fetch error:", fetchErr);
        return jsonResponse({ error: "Activate failed" }, 500, req);
      }
      if (!target) return jsonResponse({ error: "Not found" }, 404, req);

      const now = new Date().toISOString();

      const { error: deactErr } = await supabase
        .from("coaching_prompts")
        .update({ is_active: false, updated_at: now })
        .eq("is_active", true);
      if (deactErr) {
        console.error("deactivate error:", deactErr);
        return jsonResponse({ error: "Activate failed" }, 500, req);
      }

      const { error: actErr } = await supabase
        .from("coaching_prompts")
        .update({ is_active: true, updated_at: now })
        .eq("id", id);
      if (actErr) {
        console.error("activate error:", actErr);
        return jsonResponse({ error: "Activate failed" }, 500, req);
      }

      return jsonResponse({ ok: true }, 200, req);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const prompt_text =
        typeof body?.prompt_text === "string" ? body.prompt_text : "";
      const notes = typeof body?.notes === "string" ? body.notes : null;

      if (!name || !prompt_text) {
        return jsonResponse(
          { error: "name and prompt_text are required" },
          400,
          req,
        );
      }

      const { data: existing, error: versionErr } = await supabase
        .from("coaching_prompts")
        .select("version")
        .eq("name", name)
        .order("version", { ascending: false })
        .limit(1);

      if (versionErr) {
        console.error("version lookup error:", versionErr);
        return jsonResponse({ error: "Create failed" }, 500, req);
      }

      const nextVersion =
        existing && existing.length > 0 ? (existing[0].version ?? 0) + 1 : 1;

      const { data, error } = await supabase
        .from("coaching_prompts")
        .insert({
          name,
          prompt_text,
          notes,
          version: nextVersion,
          is_active: false,
        })
        .select()
        .single();

      if (error) {
        console.error("create prompt error:", error);
        return jsonResponse({ error: "Create failed" }, 500, req);
      }
      return jsonResponse({ prompt: data }, 200, req);
    }

    if (req.method === "PUT") {
      if (!id) return jsonResponse({ error: "id query param required" }, 400, req);
      const body = await req.json().catch(() => null);

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof body?.name === "string") updates.name = body.name.trim();
      if (typeof body?.prompt_text === "string") {
        updates.prompt_text = body.prompt_text;
      }
      if (typeof body?.notes === "string" || body?.notes === null) {
        updates.notes = body.notes;
      }

      if (Object.keys(updates).length <= 1) {
        return jsonResponse({ error: "No updates provided" }, 400, req);
      }

      const { data, error } = await supabase
        .from("coaching_prompts")
        .update(updates)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) {
        console.error("update prompt error:", error);
        return jsonResponse({ error: "Update failed" }, 500, req);
      }
      if (!data) return jsonResponse({ error: "Not found" }, 404, req);

      return jsonResponse({ prompt: data }, 200, req);
    }

    if (req.method === "DELETE") {
      if (!id) return jsonResponse({ error: "id query param required" }, 400, req);

      const { data: existing, error: fetchErr } = await supabase
        .from("coaching_prompts")
        .select("is_active")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) {
        console.error("delete fetch error:", fetchErr);
        return jsonResponse({ error: "Delete failed" }, 500, req);
      }
      if (!existing) return jsonResponse({ error: "Not found" }, 404, req);
      if (existing.is_active) {
        return jsonResponse(
          { error: "Cannot delete the currently active prompt" },
          400,
          req,
        );
      }

      const { error } = await supabase
        .from("coaching_prompts")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("delete prompt error:", error);
        return jsonResponse({ error: "Delete failed" }, 500, req);
      }
      return jsonResponse({ ok: true }, 200, req);
    }

    return jsonResponse({ error: "Method not allowed" }, 405, req);
  } catch (err) {
    console.error("admin-prompts error:", err);
    return jsonResponse({ error: "Server error" }, 500, req);
  }
});
