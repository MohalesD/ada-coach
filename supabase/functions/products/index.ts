// Ada Coach /products Edge Function (Run 1)
// CRUD for the PM's products. Every query runs through the RLS-bound
// userClient, so ownership scoping is enforced by the database policies —
// this function adds validation and shape, not authorization logic.
//
// Auth: requires a valid Supabase Auth JWT.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";

const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;

type ProductBody = {
  name?: unknown;
  description?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await userClient
        .from("products")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) {
        console.error("products list failed:", error);
        return jsonResponse({ error: "Could not load products." }, 500, req);
      }
      return jsonResponse({ products: data ?? [] }, 200, req);
    }

    if (req.method === "POST") {
      const body = (await req.json()) as ProductBody;
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description =
        typeof body.description === "string" ? body.description.trim() : null;

      if (!name) return jsonResponse({ error: "name is required" }, 400, req);
      if (name.length > NAME_MAX) {
        return jsonResponse(
          { error: `name must be at most ${NAME_MAX} characters` },
          400,
          req,
        );
      }
      if (description && description.length > DESCRIPTION_MAX) {
        return jsonResponse(
          { error: `description must be at most ${DESCRIPTION_MAX} characters` },
          400,
          req,
        );
      }

      const { data, error } = await userClient
        .from("products")
        .insert({ user_id: user.id, name, description })
        .select("*")
        .single();
      if (error || !data) {
        console.error("product create failed:", error);
        return jsonResponse({ error: "Could not create product." }, 500, req);
      }
      return jsonResponse({ product: data }, 201, req);
    }

    if (req.method === "PATCH") {
      if (!id) return jsonResponse({ error: "id is required" }, 400, req);
      const body = (await req.json()) as ProductBody;

      const patch: Record<string, string | null> = {};
      if (body.name !== undefined) {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name || name.length > NAME_MAX) {
          return jsonResponse(
            { error: `name must be 1-${NAME_MAX} characters` },
            400,
            req,
          );
        }
        patch.name = name;
      }
      if (body.description !== undefined) {
        const description =
          typeof body.description === "string" ? body.description.trim() : "";
        if (description.length > DESCRIPTION_MAX) {
          return jsonResponse(
            { error: `description must be at most ${DESCRIPTION_MAX} characters` },
            400,
            req,
          );
        }
        patch.description = description || null;
      }
      if (Object.keys(patch).length === 0) {
        return jsonResponse({ error: "Nothing to update" }, 400, req);
      }

      // RLS: only the owner's row is visible/updatable.
      const { data, error } = await userClient
        .from("products")
        .update(patch)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) {
        console.error("product update failed:", error);
        return jsonResponse({ error: "Could not update product." }, 500, req);
      }
      if (!data) return jsonResponse({ error: "Product not found" }, 404, req);
      return jsonResponse({ product: data }, 200, req);
    }

    if (req.method === "DELETE") {
      if (!id) return jsonResponse({ error: "id is required" }, 400, req);

      // RLS confirms ownership; collect the sprint conversations first so
      // they don't linger as orphaned chats after the product cascade.
      const { data: product, error: prodErr } = await userClient
        .from("products")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (prodErr) {
        console.error("product lookup failed:", prodErr);
        return jsonResponse({ error: "Could not delete product." }, 500, req);
      }
      if (!product) return jsonResponse({ error: "Product not found" }, 404, req);

      const { data: sessions } = await userClient
        .from("sessions")
        .select("conversation_id")
        .eq("product_id", id);
      const conversationIds = (sessions ?? [])
        .map((s: { conversation_id: string }) => s.conversation_id)
        .filter(Boolean);

      // Deleting the conversations cascades to sessions -> session
      // documents -> chunks; then the product row itself goes.
      const service = getServiceClient();
      if (conversationIds.length > 0) {
        const { error: convErr } = await service
          .from("conversations")
          .delete()
          .in("id", conversationIds);
        if (convErr) {
          console.error("sprint conversation delete failed:", convErr);
          return jsonResponse({ error: "Could not delete product." }, 500, req);
        }
      }

      const { error: delErr } = await userClient
        .from("products")
        .delete()
        .eq("id", id);
      if (delErr) {
        console.error("product delete failed:", delErr);
        return jsonResponse({ error: "Could not delete product." }, 500, req);
      }
      return jsonResponse({ deleted: true }, 200, req);
    }

    return jsonResponse({ error: "Method not allowed" }, 405, req);
  } catch (err) {
    console.error("products function unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
