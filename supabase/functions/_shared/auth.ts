// Shared helpers for Edge Functions that need a Supabase Auth user.
// - corsHeaders / jsonResponse
// - getUserClient / getServiceClient
// - requireUser  → JWT-authenticated user + RLS-bound client
// - requireAdmin → user + profile, gated to role in ('admin','owner')

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Origin allowlist for CORS. Set ALLOWED_ORIGINS in Supabase secrets as a
// comma-separated list, e.g.:
//   supabase secrets set ALLOWED_ORIGINS="http://localhost:5175,https://ada-coach.vercel.app"
// Defaults to localhost dev only when unset.
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5175")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const CORS_BASE_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, authorization, apikey, x-client-info",
  Vary: "Origin",
};

// Returns CORS headers for the request. Echoes the Origin only when it's in
// the allowlist; otherwise omits Allow-Origin so the browser fails the
// preflight (and the actual request never goes out).
//
// Server-to-server calls without an Origin header just get no CORS headers,
// which is fine — CORS only matters for browsers.
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = { ...CORS_BASE_HEADERS };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  req?: Request,
): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (req) Object.assign(headers, corsHeaders(req));
  return new Response(JSON.stringify(body), { status, headers });
}

function envOrThrow(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Anon-key client bound to the request's Authorization header.
// All queries are RLS-enforced as the calling user.
export function getUserClient(req: Request): SupabaseClient {
  const supabaseUrl = envOrThrow("SUPABASE_URL");
  const anonKey = envOrThrow("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
}

// Service-role client. Bypasses RLS — use only for trusted writes
// (e.g. stamping assistant messages, fetching the active prompt).
export function getServiceClient(): SupabaseClient {
  const supabaseUrl = envOrThrow("SUPABASE_URL");
  const serviceRoleKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export type AuthedUser = {
  id: string;
  email: string | null;
};

export type RequireUserResult =
  | { user: AuthedUser; userClient: SupabaseClient; error?: undefined }
  | { error: Response; user?: undefined; userClient?: undefined };

export async function requireUser(req: Request): Promise<RequireUserResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return { error: jsonResponse({ error: "Unauthorized" }, 401, req) };
  }

  const jwt = authHeader.replace(/^bearer\s+/i, "");
  const service = getServiceClient();
  const { data, error } = await service.auth.getUser(jwt);
  if (error || !data.user) {
    return { error: jsonResponse({ error: "Unauthorized" }, 401, req) };
  }

  const userClient = getUserClient(req);

  return {
    user: { id: data.user.id, email: data.user.email ?? null },
    userClient,
  };
}

export type AdminProfile = {
  id: string;
  email: string;
  role: "admin" | "owner";
};

export type RequireAdminResult =
  | {
      user: AuthedUser;
      profile: AdminProfile;
      userClient: SupabaseClient;
      error?: undefined;
    }
  | {
      error: Response;
      user?: undefined;
      profile?: undefined;
      userClient?: undefined;
    };

export async function requireAdmin(req: Request): Promise<RequireAdminResult> {
  const userResult = await requireUser(req);
  if (userResult.error) return { error: userResult.error };

  const service = getServiceClient();
  const { data: profile, error: profileErr } = await service
    .from("user_profiles")
    .select("id, email, role")
    .eq("id", userResult.user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("requireAdmin profile lookup failed:", profileErr);
    return { error: jsonResponse({ error: "Server error" }, 500, req) };
  }

  if (!profile || (profile.role !== "admin" && profile.role !== "owner")) {
    return { error: jsonResponse({ error: "Forbidden" }, 403, req) };
  }

  return {
    user: userResult.user,
    profile: profile as AdminProfile,
    userClient: userResult.userClient,
  };
}
