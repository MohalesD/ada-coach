// Shared helpers for admin-* Edge Functions.
// - CORS headers (admin frontend on localhost / deployed Vercel)
// - JSON response wrapper
// - x-admin-key verification against ADMIN_KEY secret

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, authorization, apikey, x-client-info, x-admin-key",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function assertAdmin(req: Request): Response | null {
  const providedKey = req.headers.get("x-admin-key");
  const expectedKey = Deno.env.get("ADMIN_KEY");

  if (!expectedKey) {
    console.error("ADMIN_KEY secret is not configured");
    return jsonResponse(
      { error: "Admin not configured on server" },
      500,
    );
  }

  if (!providedKey || providedKey !== expectedKey) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return null;
}
